import http from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Config } from './config.js'
import { newId } from './ids.js'
import type { EventStore } from './store.js'
import type { Bus } from './bus.js'
import type { WorldEvent } from '../../src/types.js'

type Appendable = Omit<WorldEvent, 'id' | 'ts'> & Partial<Pick<WorldEvent, 'id' | 'ts'>>

export async function startHttp(cfg: Config, store: EventStore, bus: Bus<WorldEvent>): Promise<{ server: http.Server }> {
  const server = http.createServer((req, res) => {
    handle(cfg, store, bus, req, res).catch(err => {
      console.error(err)
      if (!res.headersSent) send(res, 500, { error: err instanceof Error ? err.message : String(err) })
    })
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(cfg.port, () => resolve())
  })
  return { server }
}

async function handle(cfg: Config, store: EventStore, bus: Bus<WorldEvent>, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const method = req.method ?? 'GET'
  const url = new URL(req.url ?? '/', 'http://localhost')
  const path = url.pathname

  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST',
      'access-control-allow-headers': 'content-type',
    })
    res.end()
    return
  }

  try {
    if (method === 'GET' && path === '/events') return streamEvents(store, bus, url.searchParams.get('since'), res)
    if (method === 'GET' && path === '/healthz') return send(res, 200, { ok: true, events: store.all().length })

    if (method === 'POST') {
      let body: unknown
      try {
        body = JSON.parse(await readBody(req))
      } catch {
        return send(res, 400, { error: 'malformed json body' })
      }

      if (path === '/chat') return await postChat(store, body, res)

      const decision = /^\/approvals\/([^/]+)\/decision$/.exec(path)
      if (decision) return await postDecision(store, decodeURIComponent(decision[1]), body, res)

      if (path === '/dev/emit') return await postDevEmit(cfg, store, body, res)
    }

    send(res, 404, { error: 'not found' })
  } catch (err) {
    console.error(err)
    if (!res.headersSent) send(res, 500, { error: err instanceof Error ? err.message : String(err) })
  }
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json', 'access-control-allow-origin': '*' })
  res.end(JSON.stringify(body))
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = ''
    req.setEncoding('utf8')
    req.on('data', chunk => (data += chunk))
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

function isNonEmpty(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0
}

function writeFrame(res: ServerResponse, ev: WorldEvent): void {
  res.write(`id: ${ev.id}\ndata: ${JSON.stringify(ev)}\n\n`)
}

function streamEvents(store: EventStore, bus: Bus<WorldEvent>, since: string | null, res: ServerResponse): void {
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
    'access-control-allow-origin': '*',
  })

  const events = store.all()
  const sinceIdx = since ? events.findIndex(e => e.id === since) : -1
  for (let i = sinceIdx >= 0 ? sinceIdx + 1 : 0; i < events.length; i++) writeFrame(res, events[i])

  const unsubscribe = bus.subscribe(e => writeFrame(res, e))
  const heartbeat = setInterval(() => res.write(':ka\n\n'), 15000)
  const cleanup = () => {
    clearInterval(heartbeat)
    unsubscribe()
  }
  res.on('close', cleanup)
  res.on('error', cleanup)
}

async function postChat(store: EventStore, body: unknown, res: ServerResponse): Promise<void> {
  const b = body as Record<string, unknown>
  if (!isNonEmpty(b.agentId) || !isNonEmpty(b.text) || !isNonEmpty(b.personId)) {
    return send(res, 400, { error: 'agentId, text and personId are required non-empty strings' })
  }
  const ev = await store.append({
    type: 'Chat',
    from: { kind: 'person', id: b.personId },
    to: { kind: 'agent', id: b.agentId },
    title: b.text,
    payload: { text: b.text },
    id: newId('chat'),
  })
  send(res, 202, ev)
}

async function postDecision(store: EventStore, eventId: string, body: unknown, res: ServerResponse): Promise<void> {
  const b = body as Record<string, unknown>
  if (!isNonEmpty(b.personId)) return send(res, 400, { error: 'personId is a required non-empty string' })

  const orig = store.get(eventId)
  if (!orig) return send(res, 404, { error: `event ${eventId} not found` })

  const kind =
    (orig.type === 'AuthRequired' || orig.type === 'PermissionRequest') && orig.blockedOn
      ? orig.blockedOn.kind
      : orig.type === 'BlueprintProposed' && orig.payload?.blueprint
        ? ('blueprint' as const)
        : null
  if (!kind) return send(res, 409, { error: `event ${eventId} is not a resolvable request` })

  if (store.all().some(e => e.payload?.reason === eventId)) {
    return send(res, 409, { error: `event ${eventId} is already resolved` })
  }

  const what = orig.blockedOn?.what ?? orig.payload?.blueprint?.name ?? orig.title
  const ev = await store.append({
    type: kind === 'auth' ? 'AccountConnected' : kind === 'approval' ? 'ApprovalGranted' : 'BlueprintApproved',
    taskId: orig.taskId,
    from: { kind: 'person', id: b.personId },
    to: orig.from,
    deptFrom: orig.deptFrom ?? orig.deptTo,
    deptTo: orig.deptTo ?? orig.deptFrom,
    title: `${what} — approved`,
    detail: `Approved by ${b.personId}`,
    payload: { reason: eventId },
    id: newId('res'),
  })
  send(res, 200, ev)
}

async function postDevEmit(cfg: Config, store: EventStore, body: unknown, res: ServerResponse): Promise<void> {
  if (!cfg.allowDevEmit) return send(res, 404, { error: 'not found' })

  const b = body as Record<string, unknown>
  if (!b.event || typeof b.event !== 'object' || Array.isArray(b.event)) {
    return send(res, 400, { error: 'body must be { event: object }' })
  }
  const stored = await store.append({ ...(b.event as Appendable), id: newId('dev') })
  send(res, 200, stored)
}
