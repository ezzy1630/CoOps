import { createHash } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { google } from 'googleapis'
import { latestReceipts } from '../../src/evidence/proofPackage.js'
import type { Receipt, ReceiptKind, WorldEvent } from '../../src/types.js'
import { createLaunchTools } from './tools/launch.js'

/** The four gates the launch story may not be recorded without. */
export type GateId = 'local-file' | 'cloud-handoff' | 'authority' | 'publication'

/** pass: proven · ready: the mechanism is reachable but this run has not used it · fail: blocked */
export type GateStatus = 'pass' | 'ready' | 'fail'

export type GateVerdict = 'go' | 'hold' | 'no-go'

export interface GateResult {
  id: GateId
  /** the gate as written, so the report is readable next to the plan */
  claim: string
  status: GateStatus
  /** what was actually observed, in one sentence */
  detail: string
  evidence: Record<string, string>
  /** the truthful public wording when the gate is constrained rather than clean */
  note?: string
}

export interface GateReport {
  verdict: GateVerdict
  detail: string
  checkedAt: string
  /** the discovery terms the local-file gate searched for */
  query: string
  gates: GateResult[]
}

export interface ProbeResult {
  ok: boolean
  detail: string
  evidence: Record<string, string>
}

export type BucketProbe = (bucket: string, token: string) => Promise<ProbeResult>
export type ChannelProbe = (token: string) => Promise<ProbeResult>

export interface PreflightDeps {
  /** absolute roots the connector may read */
  localRoots: string[]
  connectorId: string
  bucket?: string
  /** the filename terms the demo's discovery step searches for */
  query: string
  /** this run's event log; a gate a completed run already proved reads from here */
  events: WorldEvent[]
  getAccessToken?: () => Promise<string | null>
  probeBucket?: BucketProbe
  probeChannel?: ChannelProbe
}

const CLAIMS: Record<GateId, string> = {
  'local-file': 'A real connector identifies a real local file',
  'cloud-handoff': 'The same bytes are verifiably staged in Google Cloud',
  authority: 'A named approval actually controls publication',
  publication: 'YouTube returns a real video ID',
}

/**
 * New, unaudited YouTube API projects may only upload privately. The plan fixes
 * the wording for that case so the constraint is never described as a success.
 */
const PRIVACY_NOTE =
  'A new, unaudited API project can only upload privately. If public or unlisted visibility is refused, '
  + 'describe the result as "Uploaded privately to the launch channel and ready for release."'

const PROBE_BODY = 'CoOps preflight probe. Written to prove this credential can store bytes whose md5 survives the trip.\n'

/**
 * Evaluate the four Go/No-Go gates against the system that will actually run
 * the demo. Every gate is decided by executing something, never by reading
 * configuration and assuming it works.
 */
export async function evaluateGates(deps: PreflightDeps): Promise<GateReport> {
  const receipts = latestReceipts(deps.events)
  const token = deps.getAccessToken ? await deps.getAccessToken() : null

  const gates = [
    await checkLocalFile(deps),
    await checkCloudHandoff(deps, receipts, token),
    await checkAuthority(receipts),
    await checkPublication(deps, receipts, token),
  ]

  return {
    verdict: verdictOf(gates),
    detail: verdictDetail(gates),
    checkedAt: new Date().toISOString(),
    query: deps.query,
    gates,
  }
}

/** Render the report for a terminal; the CLI prints exactly this. */
export function formatGateReport(report: GateReport): string {
  const lines = [
    `CoOps go/no-go — ${report.verdict.toUpperCase()}`,
    report.detail,
    `Checked ${report.checkedAt} · discovery query "${report.query}"`,
    '',
  ]
  for (const gate of report.gates) {
    lines.push(`${MARK[gate.status]} ${gate.claim}`)
    lines.push(`    ${gate.detail}`)
    for (const [key, value] of Object.entries(gate.evidence)) lines.push(`    ${key}: ${value}`)
    if (gate.note) lines.push(`    note: ${gate.note}`)
    lines.push('')
  }
  return lines.join('\n')
}

const MARK: Record<GateStatus, string> = { pass: '[pass]', ready: '[ready]', fail: '[FAIL]' }

/**
 * Gate 1. Runs the real discovery tool over the real allow-listed roots: if it
 * finds and hashes the file now, it will find it during the recording.
 */
async function checkLocalFile(deps: PreflightDeps): Promise<GateResult> {
  const id = 'local-file'
  if (deps.localRoots.length === 0) {
    return fail(id, 'No allow-listed search root is configured (COOPS_LOCAL_ROOTS), so the connector can read nothing.', {})
  }

  // No credentials are handed to this instance: discovery reads and hashes, and
  // nothing here can reach an external system.
  const tools = createLaunchTools({ localRoots: deps.localRoots, connectorId: deps.connectorId })
  const found = await tools.call('localfile', deps.query)
  const receipt = found.receipt

  if (!found.ok || !receipt) {
    return fail(id, found.detail, { roots: deps.localRoots.join(', '), query: deps.query })
  }
  return {
    id,
    claim: CLAIMS[id],
    status: 'pass',
    detail: `${receipt.fields.filename} was read and hashed on ${receipt.fields.connector}.`,
    evidence: receipt.fields,
  }
}

/**
 * Gate 2. A run that already staged the discovered bytes proves this outright.
 * Otherwise the credential writes a small probe object and the stored md5 is
 * compared to the bytes sent — the same check the real handoff performs.
 */
async function checkCloudHandoff(
  deps: PreflightDeps,
  receipts: Map<ReceiptKind, Receipt>,
  token: string | null,
): Promise<GateResult> {
  const id = 'cloud-handoff'
  const handoff = receipts.get('cloud-handoff')
  const discovered = nonEmpty(receipts.get('local-discovery')?.fields.checksum)
  const staged = nonEmpty(handoff?.fields.checksum)

  if (handoff?.live && handoff.ok && staged && discovered) {
    if (staged !== discovered) {
      return fail(id, 'The stored object and the discovered file carry different checksums — this run staged a different asset.', handoff.fields)
    }
    return {
      id,
      claim: CLAIMS[id],
      status: 'pass',
      detail: `This run staged ${handoff.fields.object ?? 'the asset'} in ${handoff.fields.bucket ?? 'Cloud Storage'} under the checksum it discovered.`,
      evidence: handoff.fields,
    }
  }

  const bucket = deps.bucket?.trim()
  if (!bucket) {
    return fail(id, 'COOPS_GCS_BUCKET is not configured, so the handoff has nowhere to write.', {})
  }
  if (!token) {
    return fail(id, `Bucket ${bucket} is configured, but no Google account is connected — grant it before recording.`, { bucket })
  }

  const probe = await (deps.probeBucket ?? probeBucket)(bucket, token)
  const evidence = { bucket, ...probe.evidence }
  if (!probe.ok) return fail(id, probe.detail, evidence)

  return {
    id,
    claim: CLAIMS[id],
    status: 'ready',
    detail: probe.detail,
    evidence,
    note: staged
      ? 'The recorded handoff of the launch asset never reached Cloud Storage; it is a dry run.'
      : 'The write path and its checksum check are proven; this run has not yet staged the launch asset.',
  }
}

/**
 * Gate 3. Exercises the publication control on a throwaway fixture: it must
 * refuse an unapproved publication, refuse an approval that covers different
 * bytes, and release only on a matching one. A gate that never opens would
 * pass the first two checks while being just as broken.
 */
async function checkAuthority(receipts: Map<ReceiptKind, Receipt>): Promise<GateResult> {
  const id = 'authority'
  const dir = await mkdtemp(join(tmpdir(), 'coops-preflight-'))
  try {
    const name = 'coops-preflight-control.txt'
    await writeFile(join(dir, name), PROBE_BODY)

    let approval: Receipt | null = null
    // No bucket and no credentials, so even a failed control cannot publish.
    const tools = createLaunchTools({
      localRoots: [dir],
      connectorId: 'CoOps preflight',
      approvedPublication: () => approval,
    })

    const found = await tools.call('localfile', 'coops-preflight-control')
    const checksum = nonEmpty(found.receipt?.fields.checksum)
    if (!found.ok || !checksum) {
      return fail(id, `The control could not be exercised: ${found.detail}`, {})
    }

    const unapproved = await tools.call('youtube', 'preflight control')
    if (unapproved.ok) {
      return fail(id, 'Publication proceeded with no approval on the log — the human gate is not load-bearing.', {
        noApproval: unapproved.detail,
      })
    }

    approval = approvalOf(`sha256:${'0'.repeat(64)}`)
    const mismatched = await tools.call('youtube', 'preflight control')
    if (mismatched.ok) {
      return fail(id, 'Publication proceeded on an approval covering different bytes — the approval is not bound to the asset.', {
        wrongChecksum: mismatched.detail,
      })
    }

    approval = approvalOf(checksum)
    const matched = await tools.call('youtube', 'preflight control')
    if (!matched.ok) {
      return fail(id, `A matching approval did not release publication, so the gate is stuck shut: ${matched.detail}`, {
        matchingApproval: matched.detail,
      })
    }

    const recorded = receipts.get('authority')
    return {
      id,
      claim: CLAIMS[id],
      status: 'pass',
      detail: 'Publication is refused without an approval and against an approval for other bytes, and released only by a matching one.',
      evidence: {
        noApproval: unapproved.detail,
        wrongChecksum: mismatched.detail,
        matchingApproval: 'released the publication (recorded as a dry run — the control instance holds no credentials)',
        ...(recorded?.live && recorded.ok
          ? {
              runApprover: recorded.fields.approver ?? 'not recorded',
              runApprovedAt: recorded.fields.approvedAt ?? 'not recorded',
              runChannel: recorded.fields.channel ?? 'not recorded',
            }
          : {}),
      },
      ...(recorded?.live && recorded.ok
        ? {}
        : { note: 'The control is real, but no named human has approved a publication in this run yet.' }),
    }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

/**
 * Gate 4. Only a returned video id proves this one. Short of that the grant is
 * checked against the channel it would publish to, which is readiness, not proof.
 */
async function checkPublication(
  deps: PreflightDeps,
  receipts: Map<ReceiptKind, Receipt>,
  token: string | null,
): Promise<GateResult> {
  const id = 'publication'
  const published = receipts.get('publication')
  const videoId = published?.live && published.ok ? nonEmpty(published.fields.videoId) : null

  if (published && videoId) {
    const forcedPrivate = privacyShortfall(published, receipts.get('authority'))
    return {
      id,
      claim: CLAIMS[id],
      status: 'pass',
      detail: `YouTube returned ${videoId} for this run.`,
      evidence: published.fields,
      ...(forcedPrivate ? { note: forcedPrivate } : {}),
    }
  }

  if (!token) {
    return fail(id, 'No Google account is connected, so no upload can return a video id.', {})
  }

  const probe = await (deps.probeChannel ?? probeChannel)(token)
  if (!probe.ok) return fail(id, probe.detail, probe.evidence)

  return { id, claim: CLAIMS[id], status: 'ready', detail: probe.detail, evidence: probe.evidence, note: PRIVACY_NOTE }
}

/**
 * The approved privacy setting is what the human agreed to publish; YouTube
 * silently downgrading it is a real difference the narration has to own.
 */
function privacyShortfall(published: Receipt, authority: Receipt | undefined): string | null {
  const asked = nonEmpty(authority?.fields.privacy)
  const got = nonEmpty(published.fields.privacyStatus)
  if (!asked || !got || asked === got) return null
  if (got === 'private') {
    return `The approval asked for ${asked} and YouTube returned private. Describe it as "Uploaded privately to the launch channel and ready for release."`
  }
  return `The approval asked for ${asked} and YouTube returned ${got}. Say what was returned, not what was approved.`
}

/** Writes, verifies and removes one small object; the launch asset is untouched. */
async function probeBucket(bucket: string, token: string): Promise<ProbeResult> {
  const object = `coops/preflight/${Date.now()}.txt`
  const sent = createHash('md5').update(PROBE_BODY).digest('base64')
  try {
    const storage = google.storage({ version: 'v1', headers: { Authorization: `Bearer ${token}` } })
    const created = await storage.objects.insert({
      bucket,
      name: object,
      uploadType: 'media',
      media: { mimeType: 'text/plain', body: PROBE_BODY },
    })
    const cleanup = await storage.objects
      .delete({ bucket, object })
      .then(() => 'probe object deleted')
      .catch(() => `probe object left at ${object}`)
    const evidence = { probeObject: object, generation: created.data.generation ?? 'not returned', cleanup }

    if (created.data.md5Hash !== sent) {
      return { ok: false, detail: `Cloud Storage stored a probe object whose md5 does not match the bytes sent to ${bucket}.`, evidence }
    }
    return { ok: true, detail: `Wrote and md5-verified a probe object in ${bucket}; the launch asset itself has not been staged.`, evidence }
  } catch (err) {
    return { ok: false, detail: `Cloud Storage refused the probe upload: ${errorMessage(err)}`, evidence: { probeObject: object } }
  }
}

/** Reads the channel the grant would publish to. Uploads nothing. */
async function probeChannel(token: string): Promise<ProbeResult> {
  try {
    const youtube = google.youtube({ version: 'v3', headers: { Authorization: `Bearer ${token}` } })
    const listed = await youtube.channels.list({ part: ['id', 'snippet', 'status'], mine: true })
    const channel = listed.data.items?.[0]
    if (!channel?.id) {
      return { ok: false, detail: 'The connected account reaches no YouTube channel, so videos.insert has nowhere to publish.', evidence: {} }
    }
    return {
      ok: true,
      detail: `The grant reaches ${channel.snippet?.title ?? channel.id}, but no video has been uploaded in this run.`,
      evidence: {
        channelId: channel.id,
        channelTitle: channel.snippet?.title ?? 'not returned',
        channelPrivacy: channel.status?.privacyStatus ?? 'not returned',
        longUploads: channel.status?.longUploadsStatus ?? 'not returned',
      },
    }
  } catch (err) {
    return { ok: false, detail: `YouTube refused the channel read: ${errorMessage(err)}`, evidence: {} }
  }
}

/** The plan proceeds only when all four gates are true; anything less is named. */
function verdictOf(gates: GateResult[]): GateVerdict {
  if (gates.some(gate => gate.status === 'fail')) return 'no-go'
  return gates.every(gate => gate.status === 'pass') ? 'go' : 'hold'
}

function verdictDetail(gates: GateResult[]): string {
  const failed = gates.filter(gate => gate.status === 'fail').map(gate => gate.id)
  if (failed.length > 0) {
    return `Do not record the full launch story: ${failed.join(', ')} ${failed.length === 1 ? 'is' : 'are'} blocked.`
  }
  const unproven = gates.filter(gate => gate.status === 'ready').map(gate => gate.id)
  if (unproven.length > 0) {
    return `Nothing is broken, but ${unproven.join(', ')} ${unproven.length === 1 ? 'is' : 'are'} wired without being proven. Complete one end-to-end live run first.`
  }
  return 'All four gates are proven by this run. Record the full launch story.'
}

function fail(id: GateId, detail: string, evidence: Record<string, string>): GateResult {
  return { id, claim: CLAIMS[id], status: 'fail', detail, evidence }
}

function approvalOf(checksum: string): Receipt {
  return {
    kind: 'authority',
    claim: 'Preflight control approval — never published.',
    live: true,
    ok: true,
    at: new Date().toISOString(),
    fields: { approver: 'coops-preflight', title: 'CoOps preflight control', privacy: 'private', checksum },
  }
}

function nonEmpty(value: string | null | undefined): string | null {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  return trimmed.length > 0 ? trimmed : null
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
