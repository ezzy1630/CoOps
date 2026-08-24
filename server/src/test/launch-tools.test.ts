import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, symlink, writeFile, utimes } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { createLaunchTools, readApprovedPublication } from '../tools/launch.js'
import type { Receipt, WorldEvent } from '../../../src/types.js'

const BODY = 'the launch video bytes'
const SHA256 = createHash('sha256').update(BODY).digest('hex')

async function fixture(): Promise<{ root: string; outside: string }> {
  const base = await mkdtemp(join(tmpdir(), 'coops-launch-'))
  const root = join(base, 'allowed')
  const outside = join(base, 'private')
  await mkdir(join(root, 'clips'), { recursive: true })
  await mkdir(outside, { recursive: true })
  await writeFile(join(root, 'clips', 'launch-video.mp4'), BODY)
  await writeFile(join(root, 'clips', 'older-launch-video.mp4'), 'stale take')
  await utimes(join(root, 'clips', 'older-launch-video.mp4'), new Date(0), new Date(0))
  await writeFile(join(outside, 'payroll.mp4'), 'not yours')
  return { root, outside }
}

const approval = (checksum: string): Receipt => ({
  kind: 'authority',
  claim: 'approved',
  live: true,
  ok: true,
  at: new Date().toISOString(),
  fields: { approver: 'mara', title: 'Launch', privacy: 'public', checksum },
})

test('discovery reads the newest match and receipts the bytes it actually hashed', async () => {
  const { root } = await fixture()
  const tools = createLaunchTools({ localRoots: [root], connectorId: 'test-connector' })

  const result = await tools.call('localfile', 'launch video')

  assert.equal(result.ok, true)
  assert.equal(result.receipt?.kind, 'local-discovery')
  assert.equal(result.receipt?.live, true)
  assert.deepEqual(
    { ...result.receipt?.fields, modifiedAt: 'stamped' },
    {
      connector: 'test-connector',
      searchRoot: root,
      filename: 'launch-video.mp4',
      modifiedAt: 'stamped',
      bytes: `${BODY.length} bytes`,
      checksum: `sha256:${SHA256}`,
    },
  )
  assert.equal(tools.staged()?.sha256, SHA256)
})

test('nothing outside an allow-listed root is reachable, symlinked or not', async () => {
  const { root, outside } = await fixture()
  await symlink(join(outside, 'payroll.mp4'), join(root, 'payroll.mp4'))
  const tools = createLaunchTools({ localRoots: [root], connectorId: 'test-connector' })

  const result = await tools.call('localfile', 'payroll')

  assert.equal(result.ok, false)
  assert.match(result.detail, /no file matching/)
  assert.equal(tools.staged(), null)
})

test('discovery with no configured root refuses instead of searching the disk', async () => {
  const tools = createLaunchTools({ localRoots: [], connectorId: 'test-connector' })

  const result = await tools.call('localfile', 'launch video')

  assert.equal(result.ok, false)
  assert.match(result.detail, /no allow-listed search root/)
})

test('an unreachable Cloud Storage step receipts a dry-run, never an upload', async () => {
  const { root } = await fixture()
  const tools = createLaunchTools({ localRoots: [root], connectorId: 'test-connector' })
  await tools.call('localfile', 'launch video')

  const result = await tools.call('gcs', 'coops/launch.mp4')

  assert.equal(result.receipt?.live, false)
  assert.equal(result.receipt?.fields.bytesUploaded, '0 (not uploaded)')
  assert.match(result.receipt?.fields.status ?? '', /dry-run/)
  assert.equal(result.receipt?.fields.generation, undefined)
})

test('publication is blocked without a human approval bound to the staged checksum', async () => {
  const { root } = await fixture()
  let granted: Receipt | null = null
  const tools = createLaunchTools({
    localRoots: [root],
    connectorId: 'test-connector',
    approvedPublication: () => granted,
  })

  const unstaged = await tools.call('youtube', 'description')
  assert.equal(unstaged.ok, false)
  assert.match(unstaged.detail, /no asset staged/)

  await tools.call('localfile', 'launch video')
  const unapproved = await tools.call('youtube', 'description')
  assert.equal(unapproved.ok, false)
  assert.match(unapproved.detail, /no human has approved/)

  granted = approval('sha256:0000000000')
  const wrongFile = await tools.call('youtube', 'description')
  assert.equal(wrongFile.ok, false)
  assert.match(wrongFile.detail, /approval covers a different file/)

  granted = approval(`sha256:${SHA256}`)
  const dryRun = await tools.call('youtube', 'description')
  assert.equal(dryRun.ok, true)
  assert.equal(dryRun.receipt?.live, false)
  assert.equal(dryRun.receipt?.fields.videoId, undefined)
})

test('only an approved authority receipt unlocks publication', () => {
  const events: WorldEvent[] = [
    { id: 'a', ts: 1, type: 'ApprovalGranted', title: 'unrelated approval' },
    { id: 'b', ts: 2, type: 'TaskFailed', title: 'denied', payload: { receipt: { ...approval('sha256:aa'), ok: false } } },
    { id: 'c', ts: 3, type: 'ApprovalGranted', title: 'approved', payload: { receipt: approval('sha256:bb') } },
  ]

  assert.equal(readApprovedPublication(events)?.fields.checksum, 'sha256:bb')
  assert.equal(readApprovedPublication(events.slice(0, 2)), null)
})
