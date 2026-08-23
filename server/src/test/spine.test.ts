import assert from 'node:assert/strict'
import http from 'node:http'
import type { IncomingMessage } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import type { WorldEvent } from '../../../src/types.js'
import { Bus } from '../bus.js'
import type { Config } from '../config.js'
import { startHttp } from '../http.js'
import { OrgRegistry } from '../org.js'
import { EventStore } from '../store.js'

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
