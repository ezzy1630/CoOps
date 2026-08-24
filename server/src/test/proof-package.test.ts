import assert from 'node:assert/strict'
import test from 'node:test'
import { formatProofPackage, readProofPackage } from '../../../src/evidence/proofPackage.js'
import { readRunEvidence } from '../../../src/evidence/runEvidence.js'
import type { Receipt, RuntimeInfo, WorldEvent } from '../../../src/types.js'

const CHECKSUM = 'sha256:8f1d2c3b4a596877'

const runtime: RuntimeInfo = {
  execution: 'live',
  brain: 'gemini',
  model: 'gemini-3.7-flash',
  memory: 'firestore',
  guardrail: 'model-armor',
  workspace: 'google-workspace',
  a2a: 'authenticated',
  revision: 'coops-00042-abc',
  runId: 'run_test',
  startedAt: '2026-08-24T10:00:00.000Z',
}

const receipt = (kind: Receipt['kind'], fields: Record<string, string>, live = true): Receipt => ({
  kind,
  claim: `${kind} claim`,
  live,
  ok: true,
  at: '2026-08-24T10:01:00.000Z',
  fields,
})

const carrying = (id: string, ts: number, r: Receipt, type: WorldEvent['type'] = 'ToolCall'): WorldEvent => ({
  id,
  ts,
  type,
  title: type,
  payload: { receipt: r },
})

function packageOf(events: WorldEvent[], runtimeInfo: RuntimeInfo | null = runtime) {
  const evidence = readRunEvidence({
    events,
    tasks: [],
    executionMode: 'live',
    liveConnection: 'connected',
    runtimeInfo,
  })
  return readProofPackage({ events, evidence, runtimeInfo })
}

const fullRun = (): WorldEvent[] => [
  { id: 'e1', ts: 1, type: 'TaskRequest', title: 'Publish the launch video' },
  carrying('e2', 2, receipt('local-discovery', {
    connector: 'studio-mbp (CoOps connector)',
    searchRoot: '/Users/dev/Movies',
    filename: 'launch.mp4',
    modifiedAt: '2026-08-24T09:00:00.000Z',
    bytes: '48210344 bytes',
    checksum: CHECKSUM,
  })),
  carrying('e3', 3, receipt('cloud-handoff', {
    bucket: 'coops-launch',
    object: 'coops/launch.mp4',
    generation: '1756000000000001',
    bytesUploaded: '48210344 bytes',
    checksum: CHECKSUM,
    status: 'uploaded · md5 and byte count verified',
  })),
  carrying('e4', 4, receipt('authority', {
    approver: 'mara',
    channel: 'CoOps · Marketing · Work & Approvals',
    title: 'Horses, but make it dating',
    privacy: 'public',
    checksum: CHECKSUM,
    approvedAt: '2026-08-24T10:04:00.000Z',
  })),
  carrying('e5', 5, receipt('publication', {
    apiResult: 'videos.insert 200 · youtube#video',
    videoId: 'dQw4w9WgXcQ',
    privacyStatus: 'public',
    processingStatus: 'succeeded',
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  })),
  { id: 'e6', ts: 6, type: 'ApprovalGranted', title: 'Publish: approved' },
  { id: 'e7', ts: 7, type: 'TaskCompleted', title: 'Launch video published' },
]

test('a complete live run verifies every section and the chain of custody', () => {
  const pkg = packageOf(fullRun())

  assert.equal(pkg.chainOfCustody.verdict, 'verified')
  assert.equal(pkg.complete, true)
  assert.equal(pkg.recorded, pkg.required)
  assert.deepEqual(
    pkg.sections.map(s => [s.id, s.status]),
    [
      ['local-discovery', 'verified'],
      ['cloud-handoff', 'verified'],
      ['authority', 'verified'],
      ['publication', 'verified'],
      ['coops', 'verified'],
    ],
  )
})

test('a missing receipt is a visible gap, not an absent field', () => {
  const pkg = packageOf(fullRun().filter(e => e.id !== 'e5'))
  const publication = pkg.sections.find(s => s.id === 'publication')

  assert.equal(publication?.status, 'missing')
  assert.equal(publication?.required, 5)
  assert.equal(publication?.recorded, 0)
  assert.ok(publication?.fields.every(f => f.value === null))
  assert.equal(pkg.complete, false)
  assert.match(formatProofPackage(pkg), /"Video ID": "not recorded"/)
})

test('disagreeing checksums read as a mismatch, never as proof', () => {
  const events = fullRun().map(e =>
    e.id === 'e3' && e.payload?.receipt
      ? { ...e, payload: { receipt: { ...e.payload.receipt, fields: { ...e.payload.receipt.fields, checksum: 'sha256:deadbeef' } } } }
      : e,
  )
  const pkg = packageOf(events)

  assert.equal(pkg.chainOfCustody.verdict, 'mismatch')
  assert.equal(pkg.chainOfCustody.checksums.cloud, 'sha256:deadbeef')
})

test('a dry-run step keeps custody incomplete even when the checksums agree', () => {
  const events = fullRun().map(e =>
    e.id === 'e3' && e.payload?.receipt
      ? { ...e, payload: { receipt: { ...e.payload.receipt, live: false } } }
      : e,
  )
  const pkg = packageOf(events)

  assert.equal(pkg.chainOfCustody.verdict, 'incomplete')
  assert.equal(pkg.sections.find(s => s.id === 'cloud-handoff')?.status, 'recorded')
})

test('a retried step replaces the earlier receipt of the same kind', () => {
  const retried = receipt('cloud-handoff', {
    bucket: 'coops-launch',
    object: 'coops/launch-final.mp4',
    generation: '1756000000000002',
    bytesUploaded: '48210344 bytes',
    checksum: CHECKSUM,
    status: 'uploaded · md5 and byte count verified',
  })
  const pkg = packageOf([...fullRun(), carrying('e8', 8, retried)])
  const cloud = pkg.sections.find(s => s.id === 'cloud-handoff')

  assert.equal(cloud?.fields.find(f => f.key === 'object')?.value, 'coops/launch-final.mp4')
  assert.equal(pkg.chainOfCustody.verdict, 'verified')
})

test('an empty run reports every requirement as outstanding', () => {
  const pkg = packageOf([], null)

  assert.equal(pkg.recorded, 1) // only the runtime label, which rehearsal or live always has
  assert.equal(pkg.chainOfCustody.verdict, 'incomplete')
  assert.equal(pkg.chainOfCustody.detail, '0 of 3 checksums recorded.')
})
