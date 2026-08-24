import type { Receipt, ReceiptKind, RuntimeInfo, WorldEvent } from '../types.js'
import type { RunEvidence } from './runEvidence.js'

export type ProofSectionId = ReceiptKind | 'coops'

/** missing: nothing recorded · recorded: recorded but not a live external write · verified: live and complete */
export type ProofStatus = 'verified' | 'recorded' | 'missing'

export interface ProofField {
  key: string
  label: string
  /** null renders as "not recorded"; a required field is never silently dropped */
  value: string | null
}

export interface ProofSection {
  id: ProofSectionId
  title: string
  /** what a viewer with the narration muted should be able to conclude */
  claim: string
  status: ProofStatus
  live: boolean
  recordedAt: string | null
  fields: ProofField[]
  /** required fields that carry a value */
  recorded: number
  required: number
}

export type CustodyVerdict = 'verified' | 'mismatch' | 'incomplete'

export interface ChainOfCustody {
  verdict: CustodyVerdict
  detail: string
  checksums: { local: string | null; cloud: string | null; approved: string | null }
}

export interface ProofPackage {
  sections: ProofSection[]
  chainOfCustody: ChainOfCustody
  recorded: number
  required: number
  complete: boolean
}

interface FieldSpec {
  key: string
  label: string
}

interface SectionSpec {
  id: ReceiptKind
  title: string
  claim: string
  fields: FieldSpec[]
}

/** The receipt checklist, in the order a viewer needs to read it. */
const SECTION_SPECS: SectionSpec[] = [
  {
    id: 'local-discovery',
    title: 'Local discovery',
    claim: 'The asset was found on a named machine inside an allow-listed folder.',
    fields: [
      { key: 'connector', label: 'Machine or connector identity' },
      { key: 'searchRoot', label: 'Allow-listed search root' },
      { key: 'filename', label: 'Filename' },
      { key: 'modifiedAt', label: 'Modified time' },
      { key: 'bytes', label: 'Byte size' },
      { key: 'checksum', label: 'Checksum' },
    ],
  },
  {
    id: 'cloud-handoff',
    title: 'Cloud handoff',
    claim: 'The same bytes reached Cloud Storage and the checksum still matches.',
    fields: [
      { key: 'bucket', label: 'Bucket' },
      { key: 'object', label: 'Object' },
      { key: 'generation', label: 'Object generation' },
      { key: 'bytesUploaded', label: 'Bytes uploaded' },
      { key: 'checksum', label: 'Matching checksum' },
      { key: 'status', label: 'Upload status' },
    ],
  },
  {
    id: 'authority',
    title: 'Authority',
    claim: 'A named human approved this exact asset, title and privacy setting.',
    fields: [
      { key: 'approver', label: 'Named approver' },
      { key: 'channel', label: 'Exact channel' },
      { key: 'title', label: 'Proposed title' },
      { key: 'privacy', label: 'Privacy setting' },
      { key: 'checksum', label: 'Asset checksum' },
      { key: 'approvedAt', label: 'Approval timestamp' },
    ],
  },
  {
    id: 'publication',
    title: 'YouTube',
    claim: 'The external publication happened and returned a real video id.',
    fields: [
      { key: 'apiResult', label: 'API result' },
      { key: 'videoId', label: 'Video ID' },
      { key: 'privacyStatus', label: 'Privacy status' },
      { key: 'processingStatus', label: 'Processing status' },
      { key: 'url', label: 'Studio or watch URL' },
    ],
  },
]

const COOPS_FIELDS: FieldSpec[] = [
  { key: 'execution', label: 'Live execution label' },
  { key: 'runId', label: 'Run ID' },
  { key: 'envelopes', label: 'Typed Task Envelopes' },
  { key: 'toolEvents', label: 'Tool events' },
  { key: 'approvalEvent', label: 'Approval event' },
  { key: 'completionEvent', label: 'Completion event' },
  { key: 'revision', label: 'Cloud Run revision' },
]

interface ProofPackageInput {
  events: WorldEvent[]
  evidence: RunEvidence
  runtimeInfo: RuntimeInfo | null
}

/** Fold the event log into the run's receipt checklist. */
export function readProofPackage({ events, evidence, runtimeInfo }: ProofPackageInput): ProofPackage {
  const receipts = latestReceipts(events)
  const sections = SECTION_SPECS.map((spec) => readSection(spec, receipts.get(spec.id) ?? null))
  sections.push(readCoOpsSection(events, evidence, runtimeInfo))

  const recorded = sections.reduce((sum, section) => sum + section.recorded, 0)
  const required = sections.reduce((sum, section) => sum + section.required, 0)

  return {
    sections,
    chainOfCustody: readChainOfCustody(receipts),
    recorded,
    required,
    complete: recorded === required,
  }
}

/** Serialize the package for the proof attachment judges can open on its own. */
export function formatProofPackage(pkg: ProofPackage): string {
  return JSON.stringify(
    {
      chainOfCustody: pkg.chainOfCustody,
      complete: pkg.complete,
      recorded: pkg.recorded,
      required: pkg.required,
      sections: pkg.sections.map((section) => ({
        title: section.title,
        claim: section.claim,
        status: section.status,
        live: section.live,
        recordedAt: section.recordedAt,
        fields: Object.fromEntries(section.fields.map((field) => [field.label, field.value ?? 'not recorded'])),
      })),
    },
    null,
    2,
  )
}

/**
 * The newest receipt of each kind; a retried step replaces the earlier attempt.
 * Exported because the server's go/no-go preflight reads the same log the same way.
 */
export function latestReceipts(events: WorldEvent[]): Map<ReceiptKind, Receipt> {
  const byKind = new Map<ReceiptKind, { receipt: Receipt; ts: number }>()
  for (const event of events) {
    const receipt = event.payload?.receipt
    if (!receipt) continue
    const seen = byKind.get(receipt.kind)
    if (!seen || event.ts >= seen.ts) byKind.set(receipt.kind, { receipt, ts: event.ts })
  }
  return new Map([...byKind].map(([kind, entry]) => [kind, entry.receipt]))
}

function readSection(spec: SectionSpec, receipt: Receipt | null): ProofSection {
  const fields = spec.fields.map((field) => ({
    ...field,
    value: nonEmpty(receipt?.fields[field.key]),
  }))
  const recorded = fields.filter((field) => field.value !== null).length
  const live = receipt?.live === true && receipt.ok

  return {
    id: spec.id,
    title: spec.title,
    claim: spec.claim,
    status: statusOf(recorded, fields.length, live),
    live,
    recordedAt: nonEmpty(receipt?.at),
    fields,
    recorded,
    required: fields.length,
  }
}

function readCoOpsSection(
  events: WorldEvent[],
  evidence: RunEvidence,
  runtimeInfo: RuntimeInfo | null,
): ProofSection {
  const envelopes = events.filter((event) => event.type === 'TaskRequest').length
  const approval = lastOf(events, 'ApprovalGranted')
  const completion = lastOf(events, 'TaskCompleted')
  const values: Record<string, string | null> = {
    execution: nonEmpty(evidence.runtime),
    runId: nonEmpty(runtimeInfo?.runId),
    envelopes: envelopes > 0 ? `${envelopes} recorded` : null,
    toolEvents: evidence.tools > 0 ? `${evidence.tools} recorded` : null,
    approvalEvent: approval ? `${approval.id} · ${approval.title}` : null,
    completionEvent: completion ? `${completion.id} · ${completion.title}` : null,
    revision: nonEmpty(runtimeInfo?.revision),
  }

  const fields = COOPS_FIELDS.map((field) => ({ ...field, value: values[field.key] ?? null }))
  const recorded = fields.filter((field) => field.value !== null).length
  const live = runtimeInfo?.execution === 'live'

  return {
    id: 'coops',
    title: 'CoOps run',
    claim: 'The run itself is inspectable: one typed log, one run id, one revision.',
    status: statusOf(recorded, fields.length, live),
    live,
    recordedAt: nonEmpty(runtimeInfo?.startedAt),
    fields,
    recorded,
    required: fields.length,
  }
}

/**
 * The load-bearing claim: the bytes found on the laptop are the bytes staged in
 * Cloud Storage and the bytes a named human approved. Anything less than three
 * live receipts carrying one identical checksum is not "verified".
 */
function readChainOfCustody(receipts: Map<ReceiptKind, Receipt>): ChainOfCustody {
  const local = receipts.get('local-discovery')
  const cloud = receipts.get('cloud-handoff')
  const approved = receipts.get('authority')
  const checksums = {
    local: nonEmpty(local?.fields.checksum),
    cloud: nonEmpty(cloud?.fields.checksum),
    approved: nonEmpty(approved?.fields.checksum),
  }
  const present = [checksums.local, checksums.cloud, checksums.approved].filter(
    (value): value is string => value !== null,
  )

  if (present.length >= 2 && new Set(present).size > 1) {
    return { verdict: 'mismatch', detail: 'Recorded checksums disagree — the staged asset is not the discovered file.', checksums }
  }
  if (present.length < 3) {
    return { verdict: 'incomplete', detail: `${present.length} of 3 checksums recorded.`, checksums }
  }
  if (!isLive(local) || !isLive(cloud) || !isLive(approved)) {
    return { verdict: 'incomplete', detail: 'Checksums agree, but at least one step was recorded without touching the external system.', checksums }
  }
  return { verdict: 'verified', detail: 'Discovered, uploaded and approved bytes share one checksum.', checksums }
}

function isLive(receipt: Receipt | undefined): boolean {
  return receipt?.live === true && receipt.ok
}

function statusOf(recorded: number, required: number, live: boolean): ProofStatus {
  if (recorded === 0) return 'missing'
  return recorded === required && live ? 'verified' : 'recorded'
}

function lastOf(events: WorldEvent[], type: WorldEvent['type']): WorldEvent | null {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].type === type) return events[i]
  }
  return null
}

function nonEmpty(value: string | null | undefined): string | null {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  return trimmed.length > 0 ? trimmed : null
}
