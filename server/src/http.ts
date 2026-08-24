import http from 'node:http'
import express from 'express'
import type { NextFunction, Request, Response } from 'express'
import { DEFAULT_GEMINI_MODEL, type Config } from './config.js'
import { newId } from './ids.js'
import type { EventStore } from './store.js'
import type { Bus } from './bus.js'
import type { OrgRegistry } from './org.js'
import { mountA2a } from './a2a/mount.js'
import { PresenceRegistry } from './presence.js'
import { createGoogleOAuth } from './auth/google.js'
import type { GoogleOAuth } from './auth/google.js'
import type { Receipt, RuntimeInfo, WorldEvent } from '../../src/types.js'

type Appendable = Omit<WorldEvent, 'id' | 'ts'> & Partial<Pick<WorldEvent, 'id' | 'ts'>>

export async function startHttp(
  cfg: Config,
  store: EventStore,
  bus: Bus<WorldEvent>,
  org: OrgRegistry,
  oauth?: GoogleOAuth,
  runtime?: RuntimeInfo,
): Promise<{ server: http.Server }> {
  const app = express()
  const presence = new PresenceRegistry()
  const google = oauth ?? createGoogleOAuth()

  app.use((req, res, next) => {
    res.setHeader('access-control-allow-origin', '*')
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'access-control-allow-methods': 'GET,POST,DELETE',
        'access-control-allow-headers': 'content-type',
      })
      res.end()
      return
    }
    // The hand-rolled router never answered HEAD; keep GET routes HEAD-less.
    if (req.method === 'HEAD') {
      send(res, 404, { error: 'not found' })
      return
    }
    next()
  })

  if (cfg.enableA2a) mountA2a(app, { store, bus, token: cfg.a2aToken, principal: cfg.a2aPrincipal }, org)

  app.get('/events', (req, res) => streamEvents(store, bus, sinceOf(req), personIdOf(req), presence, res))
  app.get('/healthz', (_req, res) => send(res, 200, { ok: true, events: store.all().length }))
  app.get('/runtime', (_req, res) => send(res, 200, runtime ?? fallbackRuntime(cfg, google)))
  app.get('/presence', (_req, res) => send(res, 200, presence.list()))
  app.get('/org', (_req, res) => send(res, 200, org.list()))

  app.get('/auth/google/status', (_req, res) => send(res, 200, { enabled: google.enabled }))
  app.get('/auth/google/start', (_req, res) => {
    if (!google.enabled) return send(res, 404, { error: 'not found' })
    res.redirect(302, google.authorizeUrl(google.issue()))
  })
  app.get('/auth/google/callback', wrapped(async (req, res) => getGoogleCallback(google, store, req, res)))

  const jsonBody = express.json()
  app.post('/chat', jsonBody, wrapped(async (req, res) => postChat(store, req.body, res)))
  app.post('/approvals/:eventId/decision', jsonBody, wrapped(async (req, res) => postDecision(store, eventIdOf(req), req.body, res)))
  app.post('/dev/emit', jsonBody, wrapped(async (req, res) => postDevEmit(cfg, store, req.body, res)))
  app.post('/org/departments', jsonBody, wrapped(async (req, res) => postDepartment(org, req.body, res)))
  app.delete('/org/departments/:id', wrapped(async (req, res) => deleteDepartment(org, pathId(req), res)))

  app.use((_req, res) => send(res, 404, { error: 'not found' }))

  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    console.error(err)
    if (res.headersSent) return next()
    if (isBodyParseFailure(err)) return send(res, 400, { error: 'malformed json body' })
    send(res, 500, { error: err instanceof Error ? err.message : String(err) })
  })

  const server = http.createServer(app)
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(cfg.port, () => resolve())
  })
  return { server }
}

function fallbackRuntime(cfg: Config, google: GoogleOAuth): RuntimeInfo {
  const brain = cfg.geminiApiKey ? 'gemini' : 'mock'
  return {
    execution: 'live',
    brain,
    model: brain === 'gemini' ? (cfg.geminiModel ?? DEFAULT_GEMINI_MODEL) : null,
    memory: cfg.firestore ? 'firestore' : 'jsonl',
    guardrail: cfg.modelArmor ? 'model-armor' : 'heuristic',
    workspace: google.enabled ? 'google-workspace' : 'dry-run',
    a2a: !cfg.enableA2a ? 'disabled' : cfg.a2aToken ? 'authenticated' : 'open',
    revision: 'local',
    runId: newId('run'),
    startedAt: new Date().toISOString(),
  }
}

function sinceOf(req: Request): string | null {
  const since = req.query.since
  return typeof since === 'string' && since.length > 0 ? since : null
}

function personIdOf(req: Request): string | null {
  const personId = req.query.personId
  return typeof personId === 'string' && personId.length > 0 ? personId : null
}

function eventIdOf(req: Request): string {
  const id = req.params.eventId
  if (typeof id !== 'string' || id.length === 0) throw new Error('missing event id')
  return id
}

function pathId(req: Request): string {
  const id = req.params.id
  return Array.isArray(id) ? (id[0] ?? '') : (id ?? '')
}

function isBodyParseFailure(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { type?: string }).type === 'entity.parse.failed'
}

function wrapped(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res).catch(next)
  }
}

function send(res: Response, status: number, body: unknown): void {
  res.setHeader('content-type', 'application/json')
  res.status(status).end(JSON.stringify(body))
}

function sendHtml(res: Response, status: number, html: string): void {
  res.setHeader('content-type', 'text/html; charset=utf-8')
  res.status(status).end(html)
}

function writeFrame(res: Response, ev: WorldEvent): void {
  res.write(`id: ${ev.id}\ndata: ${JSON.stringify(ev)}\n\n`)
}

function streamEvents(store: EventStore, bus: Bus<WorldEvent>, since: string | null, personId: string | null, presence: PresenceRegistry, res: Response): void {
  if (personId) presence.connect(personId)

  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
    'access-control-allow-origin': '*',
  })
  // Send a frame immediately so proxies flush the stream and the browser can
  // distinguish an open live connection from a request still in flight.
  res.write(':connected\n\n')

  const events = store.all()
  const sinceIdx = since ? events.findIndex(e => e.id === since) : -1
  for (let i = sinceIdx >= 0 ? sinceIdx + 1 : 0; i < events.length; i++) writeFrame(res, events[i])

  const unsubscribe = bus.subscribe(e => writeFrame(res, e))
  const heartbeat = setInterval(() => res.write(':ka\n\n'), 15000)
  let cleaned = false
  const cleanup = () => {
    if (cleaned) return
    cleaned = true
    clearInterval(heartbeat)
    unsubscribe()
    if (personId) presence.disconnect(personId)
  }
  res.on('close', cleanup)
  res.on('error', cleanup)
}

function isNonEmpty(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0
}

async function postChat(store: EventStore, body: unknown, res: Response): Promise<void> {
  const b = body as Record<string, unknown>
  if (!isNonEmpty(b?.agentId) || !isNonEmpty(b?.text) || !isNonEmpty(b?.personId)) {
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

async function postDecision(store: EventStore, eventId: string, body: unknown, res: Response): Promise<void> {
  const b = body as Record<string, unknown>
  if (!isNonEmpty(b?.personId)) return send(res, 400, { error: 'personId is a required non-empty string' })
  const decision = b?.decision ?? 'approve'
  if (decision !== 'approve' && decision !== 'deny') {
    return send(res, 400, { error: 'decision must be "approve" or "deny"' })
  }

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

  const authority = authorityReceipt(orig, b.personId, decision === 'approve')

  if (decision === 'deny') {
    // A denied request is a real terminal outcome: task-bound denials close the
    // task as failed; blueprint denials close the review itself.
    const ev = await store.append({
      type: 'TaskFailed',
      taskId: kind === 'blueprint' ? undefined : orig.taskId,
      from: { kind: 'person', id: b.personId },
      to: orig.from,
      deptFrom: orig.deptFrom ?? orig.deptTo,
      deptTo: orig.deptTo ?? orig.deptFrom,
      title: kind === 'blueprint'
        ? `New agent: ${orig.payload?.blueprint?.name ?? what}: rejected`
        : `${what}: denied`,
      detail: `Denied by ${b.personId}.`,
      payload: { reason: eventId, ...(authority ? { receipt: authority } : {}) },
      id: newId('res'),
    })
    return send(res, 200, ev)
  }

  const ev = await store.append({
    type: kind === 'auth' ? 'AccountConnected' : kind === 'approval' ? 'ApprovalGranted' : 'BlueprintApproved',
    taskId: orig.taskId,
    from: { kind: 'person', id: b.personId },
    to: orig.from,
    deptFrom: orig.deptFrom ?? orig.deptTo,
    deptTo: orig.deptTo ?? orig.deptFrom,
    title: `${what}: approved`,
    detail: `Approved by ${b.personId}`,
    payload: { reason: eventId, ...(authority ? { receipt: authority } : {}) },
    id: newId('res'),
  })
  send(res, 200, ev)
}

/**
 * A decision on a request that proposed a publication becomes the authority
 * receipt: the proposed title, privacy and asset checksum the human actually
 * saw, stamped with who decided and when.
 */
function authorityReceipt(request: WorldEvent, personId: string, approved: boolean): Receipt | null {
  const proposal = request.payload?.receipt
  if (proposal?.kind !== 'authority') return null
  return {
    ...proposal,
    live: true,
    ok: approved,
    at: new Date().toISOString(),
    claim: approved
      ? 'A named human approved this exact asset, title and privacy setting.'
      : 'A named human refused this publication; no external action is authorised.',
    fields: {
      ...proposal.fields,
      approver: personId,
      ...(approved ? { approvedAt: new Date().toISOString() } : {}),
    },
  }
}

async function getGoogleCallback(oauth: GoogleOAuth, store: EventStore, req: Request, res: Response): Promise<void> {
  if (!oauth.enabled) return send(res, 404, { error: 'not found' })

  const state = req.query.state
  if (typeof state !== 'string' || !oauth.consume(state)) return sendHtml(res, 400, googleFailurePage('invalid_state'))

  if (typeof req.query.error === 'string') return sendHtml(res, 400, googleFailurePage('authorization_declined'))

  const code = req.query.code
  if (typeof code !== 'string' || code.length === 0) return sendHtml(res, 400, googleFailurePage('missing_code'))

  let identity
  try {
    identity = await oauth.exchange(code)
  } catch {
    console.error('[auth/google] token exchange failed')
    return sendHtml(res, 400, googleFailurePage('token_exchange'))
  }

  await store.append({
    type: 'AccountConnected',
    from: { kind: 'person', id: 'avery' },
    deptFrom: 'operations',
    deptTo: 'operations',
    title: `${identity.email} connected Google Drive + Sheets`,
    detail: `Granted scopes: ${identity.scopes.join(', ')}. Access token held server-side only.`,
    id: newId('res'),
  })
  sendHtml(res, 200, GOOGLE_CALLBACK_OK_PAGE)
}

const GOOGLE_CALLBACK_OK_PAGE =
  '<!doctype html><html><body><script>window.close()</script><p>Google account connected. Return to CoOps.</p></body></html>'

function googleFailurePage(category: string): string {
  return `<!doctype html><html><body><p>Connection failed (${category}).</p></body></html>`
}

async function postDevEmit(cfg: Config, store: EventStore, body: unknown, res: Response): Promise<void> {
  if (!cfg.allowDevEmit) return send(res, 404, { error: 'not found' })

  const b = body as Record<string, unknown>
  if (!b || typeof b !== 'object' || Array.isArray(b) || !b.event || typeof b.event !== 'object' || Array.isArray(b.event)) {
    return send(res, 400, { error: 'body must be { event: object }' })
  }
  const stored = await store.append({ ...(b.event as Appendable), id: newId('dev') })
  send(res, 200, stored)
}

async function postDepartment(org: OrgRegistry, body: unknown, res: Response): Promise<void> {
  const b = body as Record<string, unknown>
  if (!isNonEmpty(b?.name) || (b?.blurb !== undefined && typeof b.blurb !== 'string')) {
    return send(res, 400, { error: 'name is a required non-empty string and blurb must be a string' })
  }
  try {
    send(res, 201, await org.add(b.name, b.blurb ?? ''))
  } catch (err) {
    send(res, 400, { error: err instanceof Error ? err.message : String(err) })
  }
}

async function deleteDepartment(org: OrgRegistry, deptId: string, res: Response): Promise<void> {
  const removed = await org.remove(deptId)
  if (!removed) return send(res, 404, { error: `department ${deptId} not found` })
  send(res, 200, removed)
}
