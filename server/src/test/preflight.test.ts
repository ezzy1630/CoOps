import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { evaluateGates, formatGateReport, type GateId, type GateResult, type PreflightDeps, type ProbeResult } from '../preflight.js'
import type { Receipt, ReceiptKind, WorldEvent } from '../../../src/types.js'

const CHECKSUM = 'sha256:2ba0e1b4d4b2a0a04c0b9f8e0e6b1d3c5a7f9e1d2c3b4a5968778695a4b3c2d1'

async function rootWithVideo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'coops-gates-'))
  await writeFile(join(root, 'horse-dating-walkthrough.mp4'), 'the launch video bytes')
  return root
}

const receipt = (kind: ReceiptKind, fields: Record<string, string>, live = true, ok = true): Receipt => ({
  kind,
  claim: `${kind} claim`,
  live,
  ok,
  at: '2026-08-24T10:01:00.000Z',
  fields,
})

const carrying = (id: string, ts: number, r: Receipt): WorldEvent => ({ id, ts, type: 'ToolCall', title: 'tool', payload: { receipt: r } })

const provenRun = (): WorldEvent[] => [
  carrying('e1', 1, receipt('local-discovery', { filename: 'horse-dating-walkthrough.mp4', checksum: CHECKSUM })),
  carrying('e2', 2, receipt('cloud-handoff', { bucket: 'coops-launch', object: 'coops/horse.mp4', generation: '17', checksum: CHECKSUM })),
  carrying('e3', 3, receipt('authority', { approver: 'mara', channel: 'Horse Dating App', privacy: 'public', checksum: CHECKSUM, approvedAt: '2026-08-24T10:02:00.000Z' })),
  carrying('e4', 4, receipt('publication', { videoId: 'dQw4w9WgXcQ', privacyStatus: 'public', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' })),
]

const refuse = async (): Promise<ProbeResult> => ({ ok: false, detail: 'probe refused', evidence: {} })
const accept = async (): Promise<ProbeResult> => ({ ok: true, detail: 'probe reached the external system', evidence: { probeObject: 'coops/preflight/1.txt' } })

async function gatesOf(overrides: Partial<PreflightDeps> = {}): Promise<Map<GateId, GateResult>> {
  const report = await evaluateGates({
    localRoots: [],
    connectorId: 'test-connector',
    query: 'horse',
    events: [],
    probeBucket: refuse,
    probeChannel: refuse,
    ...overrides,
  })
  return new Map(report.gates.map(gate => [gate.id, gate]))
}

test('a run that finished all four steps is a go', async () => {
  const root = await rootWithVideo()
  const report = await evaluateGates({
    localRoots: [root],
    connectorId: 'studio-mbp',
    query: 'horse',
    events: provenRun(),
    probeBucket: refuse,
    probeChannel: refuse,
  })

  assert.equal(report.verdict, 'go')
  assert.deepEqual(report.gates.map(gate => gate.status), ['pass', 'pass', 'pass', 'pass'])
  assert.equal(report.gates[3].evidence.videoId, 'dQw4w9WgXcQ')
  // The bucket and channel probes must not be consulted once the run has proven them.
})

test('a wired but unused pipeline holds instead of going', async () => {
  const root = await rootWithVideo()
  const report = await evaluateGates({
    localRoots: [root],
    connectorId: 'studio-mbp',
    bucket: 'coops-launch',
    query: 'horse',
    events: [],
    getAccessToken: async () => 'token',
    probeBucket: accept,
    probeChannel: accept,
  })

  assert.equal(report.verdict, 'hold')
  assert.deepEqual(report.gates.map(gate => gate.status), ['pass', 'ready', 'pass', 'ready'])
  assert.match(report.detail, /cloud-handoff, publication/)
  assert.match(report.gates[3].note ?? '', /Uploaded privately to the launch channel and ready for release/)
})

test('an unreadable local file is a no-go, however good the rest looks', async () => {
  const gates = await gatesOf({
    localRoots: [],
    bucket: 'coops-launch',
    events: provenRun(),
    getAccessToken: async () => 'token',
  })

  assert.equal(gates.get('local-file')?.status, 'fail')
  assert.match(gates.get('local-file')?.detail ?? '', /COOPS_LOCAL_ROOTS/)
  const report = await evaluateGates({
    localRoots: [],
    connectorId: 'studio-mbp',
    query: 'horse',
    events: provenRun(),
  })
  assert.equal(report.verdict, 'no-go')
  assert.match(report.detail, /Do not record/)
})

test('a query that matches nothing under the roots fails the connector gate', async () => {
  const root = await rootWithVideo()
  const gates = await gatesOf({ localRoots: [root], query: 'payroll' })

  assert.equal(gates.get('local-file')?.status, 'fail')
  assert.equal(gates.get('local-file')?.evidence.query, 'payroll')
})

test('the publication control is exercised, not assumed', async () => {
  const gates = await gatesOf()
  const authority = gates.get('authority')

  assert.equal(authority?.status, 'pass')
  assert.match(authority?.evidence.noApproval ?? '', /no human has approved/)
  assert.match(authority?.evidence.wrongChecksum ?? '', /approval covers a different file/)
  assert.match(authority?.evidence.matchingApproval ?? '', /released the publication/)
  assert.match(authority?.note ?? '', /no named human has approved a publication in this run yet/)
})

test('the control gate reports the run\'s own approver once one exists', async () => {
  const gates = await gatesOf({ events: provenRun() })

  assert.equal(gates.get('authority')?.evidence.runApprover, 'mara')
  assert.equal(gates.get('authority')?.note, undefined)
})

test('a staged object under a different checksum is a failure, not a proven handoff', async () => {
  const gates = await gatesOf({
    bucket: 'coops-launch',
    getAccessToken: async () => 'token',
    probeBucket: accept,
    events: [
      carrying('e1', 1, receipt('local-discovery', { checksum: CHECKSUM })),
      carrying('e2', 2, receipt('cloud-handoff', { bucket: 'coops-launch', object: 'coops/other.mp4', checksum: 'sha256:different' })),
    ],
  })

  assert.equal(gates.get('cloud-handoff')?.status, 'fail')
  assert.match(gates.get('cloud-handoff')?.detail ?? '', /different checksums/)
  assert.equal(gates.get('cloud-handoff')?.evidence.object, 'coops/other.mp4')
})

test('an unlisted result against a public approval reports what was returned', async () => {
  const gates = await gatesOf({
    events: [
      carrying('e1', 1, receipt('authority', { privacy: 'public', checksum: CHECKSUM })),
      carrying('e2', 2, receipt('publication', { videoId: 'abc123', privacyStatus: 'unlisted' })),
    ],
  })

  assert.match(gates.get('publication')?.note ?? '', /asked for public and YouTube returned unlisted/)
})

test('a dry-run handoff never counts as bytes reaching Cloud Storage', async () => {
  const gates = await gatesOf({
    bucket: 'coops-launch',
    getAccessToken: async () => null,
    events: [
      carrying('e1', 1, receipt('local-discovery', { checksum: CHECKSUM })),
      carrying('e2', 2, receipt('cloud-handoff', { bucket: 'coops-launch', checksum: CHECKSUM }, false)),
    ],
  })

  assert.equal(gates.get('cloud-handoff')?.status, 'fail')
  assert.match(gates.get('cloud-handoff')?.detail ?? '', /no Google account is connected/i)
})

test('a bucket the credential cannot write to is a failure, not a warning', async () => {
  const gates = await gatesOf({
    bucket: 'coops-launch',
    getAccessToken: async () => 'token',
    probeBucket: async () => ({ ok: false, detail: 'Cloud Storage refused the probe upload: 403', evidence: { probeObject: 'coops/preflight/1.txt' } }),
  })

  assert.equal(gates.get('cloud-handoff')?.status, 'fail')
  assert.equal(gates.get('cloud-handoff')?.evidence.bucket, 'coops-launch')
})

test('a private upload against a public approval carries the sanctioned wording', async () => {
  const gates = await gatesOf({
    events: [
      carrying('e1', 1, receipt('authority', { approver: 'mara', privacy: 'public', checksum: CHECKSUM })),
      carrying('e2', 2, receipt('publication', { videoId: 'abc123', privacyStatus: 'private' })),
    ],
  })

  assert.equal(gates.get('publication')?.status, 'pass')
  assert.match(gates.get('publication')?.note ?? '', /Uploaded privately to the launch channel and ready for release/)
})

test('a dry-run publication receipt never passes for a real video id', async () => {
  const gates = await gatesOf({
    getAccessToken: async () => 'token',
    probeChannel: accept,
    events: [carrying('e1', 1, receipt('publication', { apiResult: 'dry-run', privacyStatus: 'private' }, false))],
  })

  assert.equal(gates.get('publication')?.status, 'ready')
})

test('the rendered report names every gate and its evidence', async () => {
  const report = await evaluateGates({
    localRoots: [],
    connectorId: 'studio-mbp',
    query: 'horse',
    events: [],
  })
  const text = formatGateReport(report)

  assert.match(text, /CoOps go\/no-go — NO-GO/)
  assert.match(text, /\[FAIL\] A real connector identifies a real local file/)
  assert.match(text, /\[pass\] A named approval actually controls publication/)
  assert.match(text, /\[FAIL\] YouTube returns a real video ID/)
})
