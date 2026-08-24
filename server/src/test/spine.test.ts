import assert from 'node:assert/strict'
import http from 'node:http'
import type { IncomingMessage } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import type { RuntimeInfo, WorldEvent } from '../../../src/types.js'
import { Bus } from '../bus.js'
import type { Config } from '../config.js'
import { startHttp } from '../http.js'
import { OrgRegistry } from '../org.js'
import { EventStore } from '../store.js'
import { workerIdFromName } from '../ids.js'
import { Scheduler } from '../runtime/scheduler.js'
import { publicGeminiError } from '../brain/gemini.js'

interface Frame {
  id: string
  ev: WorldEvent
}

interface Stack {
  base: string
  store: EventStore
  bus: Bus<WorldEvent>
  server: http.Server
}

class SseReader {
  private buf = ''
  private readonly req: http.ClientRequest
  private res?: IncomingMessage

  constructor(url: string) {
    this.req = http.get(url, r => {
      this.res = r
      r.setEncoding('utf8')
      r.on('data', c => {
        this.buf += c
      })
    })
  }

  frames(): Frame[] {
    const out: Frame[] = []
    for (const block of this.buf.split('\n\n')) {
      const id = /^id: (.+)$/m.exec(block)?.[1]
      const data = /^data: (.+)$/m.exec(block)?.[1]
      if (id && data) out.push({ id, ev: JSON.parse(data) as WorldEvent })
    }
    return out
  }

  waitFor(predicate: (f: Frame) => boolean, timeoutMs = 8000): Promise<Frame> {
    return poll(() => this.frames().find(predicate), 'sse frame', timeoutMs)
  }

  async waitForAny(timeoutMs = 8000): Promise<Frame[]> {
    const frames = await poll(
      () => (this.frames().length > 0 ? this.frames() : undefined),
      'any sse frame',
      timeoutMs,
    )
    return frames
  }

  close(): Promise<void> {
    return new Promise(resolve => {
      const r = this.res
      this.req.destroy()
      if (!r || r.destroyed) return resolve()
      r.once('close', () => resolve())
      r.destroy()
    })
  }
}

async function poll<T>(probe: () => T | undefined, what: string, timeoutMs: number): Promise<T> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const v = probe()
    if (v !== undefined) return v
    if (Date.now() >= deadline) throw new Error(`timed out after ${timeoutMs}ms waiting for ${what}`)
    await sleep(25)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function requestJson(method: string, url: string, body?: unknown): Promise<{ status: number; json: unknown }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      url,
      { method, headers: body === undefined ? {} : { 'content-type': 'application/json' } },
      res => {
        let data = ''
        res.setEncoding('utf8')
        res.on('data', c => {
          data += c
        })
        res.on('end', () => resolve({ status: res.statusCode ?? 0, json: JSON.parse(data) }))
      },
    )
    req.on('error', reject)
    req.end(body === undefined ? undefined : JSON.stringify(body))
  })
}

async function startStack(dataDir: string, allowDevEmit = true): Promise<Stack> {
  const bus = new Bus<WorldEvent>()
  const store = await EventStore.open(dataDir, e => bus.publish(e))
  const cfg: Config = { port: 0, dataDir, allowDevEmit }
  const org = new OrgRegistry(dataDir, e => store.append(e))
  await org.load()
  const { server } = await startHttp(cfg, store, bus, org)
  const addr = server.address()
  assert(addr && typeof addr === 'object')
  return { base: `http://127.0.0.1:${(addr as AddressInfo).port}`, store, bus, server }
}

function closeServer(server: http.Server): Promise<void> {
  server.closeAllConnections()
  return new Promise(resolve => server.close(() => resolve()))
}

async function tempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'coops-spine-'))
}

test('healthz reports ok and event count matching the store', async t => {
  const dir = await tempDir()
  const s = await startStack(dir)
  t.after(() => closeServer(s.server))

  const seeded = await s.store.append({ type: 'StatusUpdate', title: 'seed', ts: 1000 })

  const res = await requestJson('GET', `${s.base}/healthz`)
  assert.equal(res.status, 200)
  assert.deepEqual(res.json, { ok: true, events: 1 })
  const all = s.store.all()
  assert.equal(all.length, 1)
  assert.equal(all[0]?.id, seeded.id)
})

test('preflight answers with all four gates and refuses an unconfigured deployment', async t => {
  const dir = await tempDir()
  const s = await startStack(dir)
  t.after(() => closeServer(s.server))

  const res = await requestJson('GET', `${s.base}/preflight`)

  assert.equal(res.status, 200)
  const report = res.json as { verdict: string; checkedAt: string; gates: { id: string; status: string }[] }
  assert.equal(report.verdict, 'no-go')
  assert.deepEqual(report.gates.map(gate => gate.id), ['local-file', 'cloud-handoff', 'authority', 'publication'])
  // Nothing is configured here, so the gates that need an external system fail
  // and only the publication control, which needs none, can pass.
  assert.deepEqual(report.gates.map(gate => gate.status), ['fail', 'fail', 'pass', 'fail'])

  // A public GET must not be a way to loop the disk walk and the storage probe.
  const again = await requestJson('GET', `${s.base}/preflight`)
  assert.equal((again.json as { checkedAt: string }).checkedAt, report.checkedAt)
})

test('runtime reports the effective providers without exposing credentials', async t => {
  const dir = await tempDir()
  const s = await startStack(dir)
  t.after(() => closeServer(s.server))

  const res = await requestJson('GET', `${s.base}/runtime`)
  assert.equal(res.status, 200)
  const runtime = res.json as RuntimeInfo
  assert.equal(runtime.execution, 'live')
  assert.equal(runtime.brain, 'mock')
  assert.equal(runtime.model, null)
  assert.equal(runtime.memory, 'jsonl')
  assert.equal(runtime.guardrail, 'heuristic')
  assert.equal(runtime.workspace, 'dry-run')
  assert.equal(runtime.a2a, 'disabled')
  assert.equal(runtime.revision, 'local')
  assert.match(runtime.runId, /^run_/)
  assert.equal(Number.isNaN(Date.parse(runtime.startedAt)), false)
  assert.equal('geminiApiKey' in runtime, false)
})

test('Gemini failures shown to users redact provider internals', () => {
  const error = new Error('403 SERVICE_DISABLED for projects/123456 with key secret-value')
  const message = publicGeminiError(error)
  assert.equal(message, 'The Gemini API is not enabled for this backend project. Check the backend logs, correct the provider configuration, and retry.')
  assert.equal(message.includes('123456'), false)
  assert.equal(message.includes('secret-value'), false)
})

test('chat flow: post returns 202 with Chat event, SSE delivers exact id frame', async t => {
  const dir = await tempDir()
  const s = await startStack(dir)
  t.after(() => closeServer(s.server))
  const reader = new SseReader(`${s.base}/events`)
  t.after(() => reader.close())

  const res = await requestJson('POST', `${s.base}/chat`, { agentId: 'op-marketing', text: 'hello', personId: 'maya' })
  assert.equal(res.status, 202)
  const posted = res.json as WorldEvent
  assert.equal(posted.type, 'Chat')
  assert.ok(posted.id.length > 0)
  assert.equal(typeof posted.ts, 'number')

  const frame = await reader.waitFor(f => f.id === posted.id || f.ev.id === posted.id)
  assert.equal(frame.ev.type, 'Chat')
  assert.equal(frame.ev.title, 'hello')
  assert.equal(frame.ev.payload?.text, 'hello')
})

test('approval flow: decision resolves AuthRequired once, second attempt conflicts', async t => {
  const dir = await tempDir()
  const s = await startStack(dir)
  t.after(() => closeServer(s.server))
  const reader = new SseReader(`${s.base}/events`)
  t.after(() => reader.close())

  const seeded = await s.store.append({
    type: 'AuthRequired',
    taskId: 'T-t1',
    blockedOn: { what: 'Connect QuickBooks', personId: 'dana', kind: 'auth' },
    from: { kind: 'agent', id: 'w-invoice' },
    to: { kind: 'person', id: 'dana' },
    deptFrom: 'finance',
    deptTo: 'finance',
    title: 'QuickBooks auth required',
    ts: 1000,
  })

  const url = `${s.base}/approvals/${seeded.id}/decision`
  const res = await requestJson('POST', url, { personId: 'dana' })
  assert.equal(res.status, 200)
  const resolved = res.json as WorldEvent
  assert.equal(resolved.type, 'AccountConnected')
  assert.equal(resolved.payload?.reason, seeded.id)
  assert.equal(resolved.taskId, 'T-t1')

  const frame = await reader.waitFor(f => f.id === resolved.id || f.ev.id === resolved.id)
  assert.equal(frame.ev.type, 'AccountConnected')

  const again = await requestJson('POST', url, { personId: 'dana' })
  assert.equal(again.status, 409)
})

test('a publication decision stamps the authority receipt the human actually saw', async t => {
  const dir = await tempDir()
  const s = await startStack(dir)
  t.after(() => closeServer(s.server))

  const proposal = {
    kind: 'authority' as const,
    claim: 'A named human was asked to approve this exact asset, title and privacy setting.',
    live: true,
    ok: false,
    at: '2026-08-24T10:00:00.000Z',
    fields: {
      approver: 'Mara Quinn',
      channel: 'CoOps · Marketing · Work & Approvals',
      title: 'Horses, but make it dating',
      privacy: 'public',
      checksum: 'sha256:8f1d2c3b',
    },
  }
  const seeded = await s.store.append({
    type: 'PermissionRequest',
    taskId: 'T-pub',
    blockedOn: { what: 'Publish to YouTube', personId: 'mara', kind: 'approval' },
    from: { kind: 'agent', id: 'a-marketing' },
    to: { kind: 'person', id: 'mara' },
    deptFrom: 'marketing',
    deptTo: 'marketing',
    title: 'Publish “Horses, but make it dating” to YouTube (public)',
    payload: { receipt: proposal },
    ts: 1000,
  })

  const res = await requestJson('POST', `${s.base}/approvals/${seeded.id}/decision`, { personId: 'mara' })
  assert.equal(res.status, 200)
  const granted = (res.json as WorldEvent).payload?.receipt
  assert.equal(granted?.kind, 'authority')
  assert.equal(granted?.ok, true)
  assert.equal(granted?.fields.approver, 'mara')
  assert.equal(granted?.fields.checksum, 'sha256:8f1d2c3b')
  assert.equal(granted?.fields.title, 'Horses, but make it dating')
  assert.ok(granted?.fields.approvedAt)
})

test('a denied publication records the refusal without an approval timestamp', async t => {
  const dir = await tempDir()
  const s = await startStack(dir)
  t.after(() => closeServer(s.server))

  const seeded = await s.store.append({
    type: 'PermissionRequest',
    taskId: 'T-pub',
    blockedOn: { what: 'Publish to YouTube', personId: 'mara', kind: 'approval' },
    from: { kind: 'agent', id: 'a-marketing' },
    to: { kind: 'person', id: 'mara' },
    deptFrom: 'marketing',
    deptTo: 'marketing',
    title: 'Publish to YouTube',
    payload: {
      receipt: {
        kind: 'authority' as const,
        claim: 'asked',
        live: true,
        ok: false,
        at: '2026-08-24T10:00:00.000Z',
        fields: { approver: 'Mara Quinn', channel: 'c', title: 't', privacy: 'public', checksum: 'sha256:8f1d2c3b' },
      },
    },
    ts: 1000,
  })

  const res = await requestJson('POST', `${s.base}/approvals/${seeded.id}/decision`, { personId: 'mara', decision: 'deny' })
  assert.equal(res.status, 200)
  const refused = (res.json as WorldEvent).payload?.receipt
  assert.equal(refused?.ok, false)
  assert.equal(refused?.fields.approvedAt, undefined)
})

test('dev/emit stores when allowed; restart reloads full log from disk', async t => {
  const dir = await tempDir()
  const s = await startStack(dir)
  t.after(() => closeServer(s.server))

  const res = await requestJson('POST', `${s.base}/dev/emit`, { event: { type: 'StatusUpdate', title: 'x' } })
  assert.equal(res.status, 200)
  const emitted = res.json as WorldEvent
  assert.equal(emitted.type, 'StatusUpdate')
  assert.ok(emitted.id.startsWith('dev_'))

  await closeServer(s.server)

  const reloaded = await EventStore.open(dir, () => {})
  const all = reloaded.all()
  assert.equal(all.length, 1)
  assert.equal(all[0]?.id, emitted.id)

  const s2 = await startStack(dir)
  t.after(() => closeServer(s2.server))
  const health = await requestJson('GET', `${s2.base}/healthz`)
  assert.equal(health.status, 200)
  assert.deepEqual(health.json, { ok: true, events: 1 })
})

test('deny decision closes the task as TaskFailed and resolves the request once', async t => {
  const dir = await tempDir()
  const s = await startStack(dir)
  t.after(() => closeServer(s.server))
  const reader = new SseReader(`${s.base}/events`)
  t.after(() => reader.close())

  const seeded = await s.store.append({
    type: 'PermissionRequest',
    taskId: 'T-t2',
    blockedOn: { what: 'Help-center publish', personId: 'nina', kind: 'approval' },
    from: { kind: 'agent', id: 'w-faq' },
    to: { kind: 'person', id: 'nina' },
    deptFrom: 'support',
    deptTo: 'support',
    title: 'Approval needed: Help-center publish',
    ts: 1000,
  })

  const url = `${s.base}/approvals/${seeded.id}/decision`
  const res = await requestJson('POST', url, { personId: 'nina', decision: 'deny' })
  assert.equal(res.status, 200)
  const denied = res.json as WorldEvent
  assert.equal(denied.type, 'TaskFailed')
  assert.equal(denied.taskId, 'T-t2')
  assert.equal(denied.payload?.reason, seeded.id)

  const frame = await reader.waitFor(f => f.id === denied.id || f.ev.id === denied.id)
  assert.equal(frame.ev.type, 'TaskFailed')

  const again = await requestJson('POST', url, { personId: 'nina', decision: 'deny' })
  assert.equal(again.status, 409)
})

test('rejecting a blueprint emits TaskFailed without a task id', async t => {
  const dir = await tempDir()
  const s = await startStack(dir)
  t.after(() => closeServer(s.server))

  const seeded = await s.store.append({
    type: 'BlueprintProposed',
    from: { kind: 'agent', id: 'op-marketing' },
    to: { kind: 'person', id: 'maya' },
    deptFrom: 'marketing',
    title: 'Blueprint ready: Summit Launch Agent',
    payload: {
      blueprint: {
        name: 'Summit Launch Agent', deptId: 'marketing', purpose: 'Own the launch.',
        trigger: 'A person asking', skills: [], toolIds: [], collaborators: [],
        approvals: [], limits: [], ownerId: 'maya',
      },
    },
    ts: 1000,
  })

  const res = await requestJson('POST', `${s.base}/approvals/${seeded.id}/decision`, {
    personId: 'maya', decision: 'deny',
  })
  assert.equal(res.status, 200)
  const rejected = res.json as WorldEvent
  assert.equal(rejected.type, 'TaskFailed')
  assert.equal(rejected.taskId, undefined)
  assert.equal(rejected.payload?.reason, seeded.id)
})

test('decision endpoint rejects unknown decisions', async t => {
  const dir = await tempDir()
  const s = await startStack(dir)
  t.after(() => closeServer(s.server))

  const seeded = await s.store.append({
    type: 'AuthRequired',
    taskId: 'T-t3',
    blockedOn: { what: 'Connect QuickBooks', personId: 'dana', kind: 'auth' },
    from: { kind: 'agent', id: 'w-invoice' },
    to: { kind: 'person', id: 'dana' },
    title: 'QuickBooks auth required',
    ts: 1000,
  })
  const res = await requestJson('POST', `${s.base}/approvals/${seeded.id}/decision`, {
    personId: 'dana', decision: 'postpone',
  })
  assert.equal(res.status, 400)
})

test('workerIdFromName derives unique ids per blueprint name', () => {
  const taken = new Set(['w-copy', 'w-social'])
  assert.equal(workerIdFromName('Summit Launch Agent', taken), 'w-summit-launch-agent')
  taken.add('w-summit-launch-agent')
  assert.equal(workerIdFromName('Summit Launch Agent', taken), 'w-summit-launch-agent-2')
  assert.equal(workerIdFromName('Summit   Launch -- Agent!', new Set()), 'w-summit-launch-agent')
  // punctuation-only names still yield a valid id
  assert.ok(workerIdFromName('???', new Set()).startsWith('w-'))
})

test('scheduler cancels remaining task steps after an append failure', async t => {
  t.mock.method(console, 'error', () => {})
  const attempts: WorldEvent['type'][] = []
  let failNext = true
  const scheduler = new Scheduler(async event => {
    attempts.push(event.type)
    if (failNext) {
      failNext = false
      throw new Error('simulated store failure')
    }
  })

  scheduler.schedule([
    { at: 0, e: { type: 'StatusUpdate', taskId: 'T-fail', title: 'Working' } },
    { at: 20, e: { type: 'ArtifactDelivered', taskId: 'T-fail', title: 'Delivered' } },
    { at: 30, e: { type: 'TaskCompleted', taskId: 'T-fail', title: 'Done' } },
  ])

  await sleep(60)
  assert.deepEqual(attempts, ['StatusUpdate', 'TaskFailed'])
  scheduler.clear()
})

test('since parameter: stream resumes after the given event, not from it', async t => {
  const dir = await tempDir()
  const s = await startStack(dir)
  t.after(() => closeServer(s.server))

  const first = await s.store.append({ type: 'StatusUpdate', title: 'first', ts: 1000 })
  const second = await s.store.append({ type: 'StatusUpdate', title: 'second', ts: 2000 })
  assert.notEqual(first.id, second.id)

  const reader = new SseReader(`${s.base}/events?since=${first.id}`)
  t.after(() => reader.close())

  const frames = await reader.waitForAny()
  assert.equal(frames[0]?.ev.id, second.id)
})
