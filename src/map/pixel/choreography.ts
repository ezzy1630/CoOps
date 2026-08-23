import { easeOut } from '../geometry'
import type { AgentStatus, EdgeKind, EventType, Ref, WorldEvent } from '../../types'
import type { EmoteName, PixelArt, Pt } from './art'
import { hashId, type StandSpot } from './layout'

/** Envelopes fall back to this when an event carries no explicit travelMs. */
export const TRAVEL_FALLBACK = 2400

/** Arrival beat: the runner pops into its destination over this window,
 *  echoing the envelope's absorb shrink without removing the target node. */
export const ABSORB_MS = 280

const MAX_WALKERS = 60

// ── Walking pace ─────────────────────────────────────────────────────────────
// Walkers are NOT bound to the event's travelMs — that envelope timing would
// force long routes into a sprint. Villagers move at their own believable
// pace; the cap only keeps every trip inside the clock's attention window.

/** steady walking pace in stage units per ms (150 px/s) */
const WALK_SPEED = 0.15
/** longest trip allowed before the pace picks up (fits PixelMap's clock window) */
const DUR_CAP_EXTRA = 3400
const MIN_DUR = 700
/** world units covered by one sprite step — drives cadence and dust */
const STEP_PX = 13
const STEP_MS_MIN = 130
const STEP_MS_MAX = 300

/**
 * Speed profile over a trip: velocity ramps up smoothly over RAMP of the time,
 * holds a steady cruise, ramps down — a villager accelerating once and
 * strolling, not the sprint-through-the-middle of a global ease.
 */
const RAMP = 0.14
/** cruise multiplier keeping total distance = 1 despite the slow ends */
const CRUISE = 1 / (1 - RAMP)
function speedProfile(u: number): number {
  if (u <= 0) return 0
  if (u >= 1) return 1
  // integral of the smoothed velocity ramp: k³ − k⁴/2 hits ½ with zero slope
  const rampInt = (k: number) => k * k * k * (1 - k / 2)
  if (u < RAMP) return CRUISE * RAMP * rampInt(u / RAMP)
  if (u > 1 - RAMP) {
    const m = (1 - u) / RAMP
    return 1 - CRUISE * RAMP * rampInt(m)
  }
  return CRUISE * (u - RAMP / 2)
}
/** distance→time inverse of speedProfile, via one shared lookup table */
const PROFILE_N = 128
const PROFILE_LUT = Float32Array.from({ length: PROFILE_N + 1 }, (_, i) => speedProfile(i / PROFILE_N))
function profileInverse(s: number): number {
  let lo = 0
  let hi = PROFILE_N
  while (lo < hi) {
    const m = (lo + hi) >> 1
    if (PROFILE_LUT[m] < s) lo = m + 1
    else hi = m
  }
  const s1 = PROFILE_LUT[lo]
  const s0 = lo > 0 ? PROFILE_LUT[lo - 1] : 0
  const f = s1 > s0 ? (s - s0) / (s1 - s0) : 0
  return Math.min(1, (lo - 1 + f) / PROFILE_N)
}

/** Trip duration for a route: natural pace first, gently capped for outliers,
 *  with ±8% per-runner variation so crowds space themselves out. */
function durFor(len: number, travel: number, hash: number): number {
  const pace = WALK_SPEED * (1 + (((hash >>> 11) % 17) - 8) / 100)
  return Math.max(MIN_DUR, Math.min(len / pace, travel + DUR_CAP_EXTRA))
}

/** Upper bound on how long after `ts` a walker can still be animating —
 *  feeds PixelMap's "anything moving?" clock heuristic. */
export function walkerWindowMs(travel: number): number {
  // worst case: pace cap reached, plus settle beat plus trail fade margin
  return travel + DUR_CAP_EXTRA + ABSORB_MS + 700
}

// ── EdgeKind → the valley palette's own accents ──────────────────────────────

export const EDGE_TINT: Record<EdgeKind, string> = {
  task: 'var(--color-fun-task)',
  artifact: 'var(--color-fun-artifact)',
  permission: 'var(--color-fun-permission)',
  escalation: 'var(--color-fun-escalation)',
}

// ── Walkers ──────────────────────────────────────────────────────────────────

export interface Walker {
  event: WorldEvent
  /** feet position right now, in stage units */
  x: number
  y: number
  z: number
  from: Pt
  to: Pt
  /** eased progress along the route, 0→1 */
  distFrac: number
  /** current traveled distance and full route length, stage units */
  dist: number
  routeLen: number
  /** svg polyline of the walked route (for ground trails) */
  routeD: string
  /** multiplies trail ink; decays after arrival so old routes dissolve */
  trailFade: number
  /** frame-flip/hop period in ms — scales with route length so feet match ground */
  stepMs: number
  /** 1 → walking, →0 across the settle beat after arrival */
  opacity: number
  scale: number
  /** strip column of the first frame of the pair matching the heading */
  frameCol: number
  /** leftward runners mirror the right-facing pair */
  flipX: boolean
  variantUrl: string
  color: string
  hash: number
  /** selected-task or highlighted event: keeps its trail under focus dimming */
  pinned: boolean
  /** deterministic dust kicked up at the feet */
  puffs: Puff[]
}

export interface Puff {
  x: number
  y: number
  r: number
  o: number
}

// ── Road routing ─────────────────────────────────────────────────────────────
// The background paints dirt paths from every door to the plaza, so villagers
// walk the roads instead of air-lines: stand point → own door → plaza junction
// → destination door → stand point. Corners are rounded so the turn reads as a
// step, not a pivot.

/** corner rounding radius when smoothing the waypoint polyline */
const CORNER_R = 18
const CORNER_STEPS = 6
/** one dust puff every couple of steps of walked distance */
const STRIDE_PX = STEP_PX * 2
const PUFF_MS = 380

interface RouteData {
  xs: number[]
  ys: number[]
  cum: number[]
  len: number
  d: string
}

/** Dense arc-length table over the waypoint polyline with rounded corners. */
function buildRoute(wps: Pt[]): RouteData {
  const pts: Pt[] = []
  const pushPt = (p: Pt) => {
    const l = pts[pts.length - 1]
    if (!l || Math.abs(p.x - l.x) + Math.abs(p.y - l.y) > 0.6) pts.push(p)
  }
  pushPt(wps[0])
  for (let i = 1; i < wps.length - 1; i++) {
    const p0 = wps[i - 1]
    const p1 = wps[i]
    const p2 = wps[i + 1]
    const l1 = Math.hypot(p1.x - p0.x, p1.y - p0.y) || 1
    const l2 = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1
    const r = Math.min(CORNER_R, l1 / 2, l2 / 2)
    const ax = p1.x - ((p1.x - p0.x) / l1) * r
    const ay = p1.y - ((p1.y - p0.y) / l1) * r
    const bx = p1.x + ((p2.x - p1.x) / l2) * r
    const by = p1.y + ((p2.y - p1.y) / l2) * r
    pushPt({ x: ax, y: ay })
    for (let k = 1; k <= CORNER_STEPS; k++) {
      const u = k / CORNER_STEPS
      const v = 1 - u
      pushPt({
        x: v * v * ax + 2 * v * u * p1.x + u * u * bx,
        y: v * v * ay + 2 * v * u * p1.y + u * u * by,
      })
    }
  }
  pushPt(wps[wps.length - 1])

  const n = pts.length
  const cum = new Array<number>(n)
  cum[0] = 0
  for (let i = 1; i < n; i++) {
    cum[i] = cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
  }
  let d = ''
  for (let i = 0; i < n; i++) {
    d += `${i === 0 ? 'M' : 'L'}${pts[i].x.toFixed(1)} ${pts[i].y.toFixed(1)}`
  }
  return { xs: pts.map((p) => p.x), ys: pts.map((p) => p.y), cum, len: cum[n - 1], d }
}

/** Position at a distance along the route. */
function routeAt(rt: RouteData, dist: number): { x: number; y: number } {
  const dd = Math.max(0, Math.min(rt.len, dist))
  let lo = 0
  let hi = rt.cum.length - 1
  while (lo < hi) {
    const m = (lo + hi + 1) >> 1
    if (rt.cum[m] <= dd) lo = m
    else hi = m - 1
  }
  const j = Math.min(lo + 1, rt.cum.length - 1)
  const seg = rt.cum[j] - rt.cum[lo] || 1
  const f = (dd - rt.cum[lo]) / seg
  return {
    x: rt.xs[lo] + (rt.xs[j] - rt.xs[lo]) * f,
    y: rt.ys[lo] + (rt.ys[j] - rt.ys[lo]) * f,
  }
}

const routeCache = new Map<string, RouteData>()
function cachedRoute(key: string, wps: Pt[]): RouteData {
  const hit = routeCache.get(key)
  if (hit) return hit
  const rt = buildRoute(wps)
  if (routeCache.size > 400) routeCache.clear()
  routeCache.set(key, rt)
  return rt
}

function doorOfDept(art: PixelArt, deptId: string | undefined): Pt | undefined {
  if (!deptId) return undefined
  return art.buildings.find((b) => b.deptId === deptId)?.door
}

// ── The road network ─────────────────────────────────────────────────────────
// Mirrors the streets painted by scripts/gen-pixel-art.mjs so villagers walk
// where the world says paths are: North/South Streets (y=165/415), West/East
// Lanes (x=150/810), the x=480 avenues, and the stone plaza between them.
// The plaza interior is open cobbles, so crossings bow around the fountain.

interface RoadNode {
  id: string
  p: Pt
  adj: string[]
}

const ROAD_NODES: RoadNode[] = [
  { id: 'NW', p: { x: 150, y: 165 }, adj: ['M', 'SW'] },
  { id: 'M', p: { x: 188, y: 165 }, adj: ['NW', 'N'] }, // marketing spur
  { id: 'N', p: { x: 480, y: 165 }, adj: ['M', 'L', 'F', 'PN'] },
  { id: 'L', p: { x: 776, y: 165 }, adj: ['N', 'NE'] }, // legal spur
  { id: 'NE', p: { x: 810, y: 165 }, adj: ['L', 'SE'] },
  { id: 'SW', p: { x: 150, y: 415 }, adj: ['NW', 'SP'] },
  { id: 'SP', p: { x: 192, y: 415 }, adj: ['SW', 'S'] }, // support spur
  { id: 'S', p: { x: 480, y: 415 }, adj: ['SP', 'OP', 'PS', 'HR'] },
  { id: 'OP', p: { x: 772, y: 415 }, adj: ['S', 'SE'] }, // operations spur
  { id: 'SE', p: { x: 810, y: 415 }, adj: ['OP', 'NE'] },
  { id: 'F', p: { x: 480, y: 152 }, adj: ['N'] }, // finance doorstep on the avenue
  { id: 'HR', p: { x: 480, y: 502 }, adj: ['S'] }, // hr doorstep on the Hall Walk
  { id: 'PN', p: { x: 480, y: 190 }, adj: ['N', 'PS'] }, // plaza north gate
  { id: 'PS', p: { x: 480, y: 372 }, adj: ['S', 'PN'] }, // plaza south gate
]

/** Which side of the fountain a plaza crossing bows around, as waypoints. */
function plazaBow(side: number): Pt[] {
  const bx = side === 0 ? 442 : 518
  return [
    { x: bx, y: 236 },
    { x: bx, y: 324 },
  ]
}

const NODE_BY_ID = new Map(ROAD_NODES.map((n) => [n.id, n]))

/** deptId → its street door node. Unknown depts enter via the south gate. */
const GATE_OF: Record<string, string> = {
  marketing: 'M',
  finance: 'F',
  legal: 'L',
  support: 'SP',
  operations: 'OP',
  hr: 'HR',
}
const FALLBACK_GATE = 'PS'

/** Shortest walk between two road nodes — Dijkstra over a 14-node graph. */
function roadPath(a: string, b: string): string[] {
  if (a === b) return [a]
  const dist = new Map<string, number>()
  const prev = new Map<string, string>()
  const open = new Set(ROAD_NODES.map((n) => n.id))
  for (const n of open) dist.set(n, Infinity)
  dist.set(a, 0)
  while (open.size > 0) {
    let cur = ''
    let best = Infinity
    for (const id of open) {
      const d = dist.get(id)!
      if (d < best) {
        best = d
        cur = id
      }
    }
    if (cur === b || cur === '' || best === Infinity) break
    open.delete(cur)
    for (const nb of NODE_BY_ID.get(cur)!.adj) {
      const np = NODE_BY_ID.get(nb)!.p
      const nd = best + Math.hypot(np.x - NODE_BY_ID.get(cur)!.p.x, np.y - NODE_BY_ID.get(cur)!.p.y)
      if (nd < (dist.get(nb) ?? Infinity)) {
        dist.set(nb, nd)
        prev.set(nb, cur)
      }
    }
  }
  const path = [b]
  let at = b
  while (at !== a && prev.has(at)) {
    at = prev.get(at)!
    path.unshift(at)
  }
  return path[0] === a ? path : [a, b]
}

/**
 * Waypoints down the village's real streets: stand point → dept gate →
 * shortest road path → destination gate → stand point. Plaza crossings bow
 * around the fountain on a hash-chosen side, and intermediate street nodes
 * get ±3px lane jitter per runner so crowds spread across the road width
 * instead of tracing one conga line.
 */
function legWaypoints(_art: PixelArt, e: WorldEvent, from: Pt, to: Pt, hash: number): Pt[] {
  void _art
  const gateA = GATE_OF[e.deptFrom ?? ''] ?? FALLBACK_GATE
  const gateB = GATE_OF[e.deptTo ?? ''] ?? FALLBACK_GATE

  // expand the node path into points, bowing through the plaza by hash-side
  const nodePath = roadPath(gateA, gateB)
  const wps: Pt[] = [from]
  for (let i = 0; i < nodePath.length; i++) {
    const id = nodePath[i]
    wps.push(NODE_BY_ID.get(id)!.p)
    if (id === 'PN' && nodePath[i + 1] === 'PS') {
      for (const p of plazaBow((hash >>> 3) & 1)) wps.push(p)
    } else if (id === 'PS' && nodePath[i + 1] === 'PN') {
      for (const p of plazaBow((hash >>> 3) & 1).reverse()) wps.push(p)
    }
  }
  wps.push(to)

  // lane jitter: nudge interior waypoints perpendicular to their local street
  // axis; start/end stay pinned to the real stand points
  for (let i = 1; i < wps.length - 1; i++) {
    const p0 = wps[i - 1]
    const p1 = wps[i + 1]
    const dx = p1.x - p0.x
    const dy = p1.y - p0.y
    const l = Math.hypot(dx, dy) || 1
    const off = (((hash >>> (4 + i)) % 7) - 3) * 1.2
    wps[i] = { x: wps[i].x + (-dy / l) * off, y: wps[i].y + (dx / l) * off }
  }

  // collapse any waypoints that ended up on top of each other
  const out: Pt[] = [wps[0]]
  for (let i = 1; i < wps.length; i++) {
    const p = wps[i]
    const l = out[out.length - 1]
    if (Math.hypot(p.x - l.x, p.y - l.y) > 6) out.push(p)
  }
  return out.length > 1 ? out : [from, to]
}

/**
 * The valley's envelopes are villagers who walk the roads carrying the mail.
 * Newest-first scan with a hard cap, events for the selected task or the
 * highlighted event stay pinned even when stale so a focused task keeps its
 * visible trail. Everything is a pure function of renderTime, so replay stays
 * frame-exact.
 */
export function deriveWalkers(
  art: PixelArt,
  spots: Map<string, StandSpot>,
  operatorSpots: Map<string, Pt>,
  events: WorldEvent[],
  renderTime: number,
  selectedTaskId: string | null,
  highlightEventId: string | null,
): Walker[] {
  const colDown0 = Math.max(0, art.avatars.frameOrder.indexOf('down0'))
  const colUp0 = Math.max(0, art.avatars.frameOrder.indexOf('up0'))
  const colRight0 = Math.max(0, art.avatars.frameOrder.indexOf('right0'))

  const out: Walker[] = []
  for (let i = events.length - 1; i >= 0 && out.length < MAX_WALKERS; i--) {
    const e = events[i]
    if (!e.edge || !e.deptFrom || !e.deptTo || e.deptFrom === e.deptTo) continue
    const age = renderTime - e.ts
    const travel = e.travelMs ?? TRAVEL_FALLBACK
    const pinned =
      (selectedTaskId != null && e.taskId === selectedTaskId) || e.id === highlightEventId
    // past the settle window a walker is fully gone; only pinned trails remain.
    // walkerWindowMs bounds the walker's own (longer-than-travelMs) trip.
    if ((age < 0 || age > walkerWindowMs(travel)) && !pinned) {
      if (age > 3.6e6 && !selectedTaskId) break
      continue
    }

    const from = endpointFor(art, spots, operatorSpots, e.from, e.deptFrom)
    const to = endpointFor(art, spots, operatorSpots, e.to, e.deptTo)

    const hash = hashId(e.from?.kind === 'agent' ? e.from.id : (e.deptFrom ?? ''))
    const routeHash = hashId(e.id)
    const variantIdx = hash % art.avatars.variants.length

    const rt = cachedRoute(`${e.id}|${from.x},${from.y}|${to.x},${to.y}`, legWaypoints(art, e, from, to, routeHash))

    // walkers keep their own appointment: a believable pace over the real
    // route length, not the envelope's travelMs sprint
    const dur = durFor(rt.len, travel, hash)
    const arrived = age >= dur
    const absorb = arrived ? Math.min(1, (age - dur) / ABSORB_MS) : 0
    const u = Math.max(0, Math.min(1, age / dur))
    // time-fraction → distance-fraction through the speed profile
    const lutF = u * PROFILE_N
    const li = Math.min(PROFILE_N - 1, Math.floor(lutF))
    const lf = lutF - li
    const distFrac = PROFILE_LUT[li] + (PROFILE_LUT[li + 1] - PROFILE_LUT[li]) * lf
    const dist = distFrac * rt.len

    // position with a gentle sway: a slow sine along the path normal, seeded
    // per runner, so nobody glides like a trolley on rails
    const here = routeAt(rt, dist)
    const ahead = routeAt(rt, dist + 7)
    const behind = routeAt(rt, dist - 4)
    let hx = ahead.x - behind.x
    let hy = ahead.y - behind.y
    const hlen = Math.hypot(hx, hy) || 1
    hx /= hlen
    hy /= hlen
    const phase = ((hash >>> 7) % 628) / 100
    const sway = Math.sin(dist * 0.12 + phase) * 1.1
    const wx = here.x - hy * sway
    const wy = here.y + hx * sway

    // facing follows the road with a short lookahead, so villagers visibly
    // turn into corners instead of sliding sideways through them
    const faceDist = arrived ? Math.max(0, rt.len - 7) : dist
    const fa = routeAt(rt, faceDist)
    const fb = routeAt(rt, faceDist + 9)
    const fdx = fb.x - fa.x
    const fdy = fb.y - fa.y
    let frameCol = colDown0
    let flipX = false
    if (Math.abs(fdx) > Math.abs(fdy)) {
      frameCol = colRight0
      flipX = fdx < 0
    } else {
      frameCol = fdy < 0 ? colUp0 : colDown0
    }

    const flightFade = arrived ? Math.max(0, 1 - (age - dur) / 600) : 1
    const trailFade = pinned ? Math.max(flightFade, 0.35) : flightFade
    // cadence from actual ground speed so the strip's feet track the ground
    const speed = rt.len / dur
    const stepMs = Math.round(Math.max(STEP_MS_MIN, Math.min(STEP_MS_MAX, (STEP_PX * 2) / speed)))

    // ── dust: one puff per stride behind the feet, then a landing burst ──
    const puffs: Puff[] = []
    if (!arrived && age > 60) {
      const falls = Math.floor(dist / STRIDE_PX)
      for (let j = Math.max(1, falls - 2); j <= falls; j++) {
        const fd = j * STRIDE_PX
        const life = age - profileInverse(fd / rt.len) * dur
        if (life < 0 || life > PUFF_MS) continue
        const q = routeAt(rt, fd)
        const k = life / PUFF_MS
        const fh = routeAt(rt, fd + 5)
        let px = fh.x - q.x
        let py = fh.y - q.y
        const pl = Math.hypot(px, py) || 1
        px /= pl
        py /= pl
        puffs.push({
          x: q.x - py * Math.sin(fd * 0.12 + phase) * 1.1 - px * k * 5,
          y: q.y + px * Math.sin(fd * 0.12 + phase) * 1.1 - py * k * 5,
          r: 1.3 + k * 2.1,
          o: (1 - k) * 0.32,
        })
      }
    } else if (absorb > 0 && absorb < 1) {
      const k = easeOut(absorb)
      for (const ang of [-2.55, -0.85, 0.55, 2.35]) {
        puffs.push({
          x: to.x + Math.cos(ang) * (3 + k * 9),
          y: to.y + Math.sin(ang) * (2 + k * 5),
          r: 1.5 + k * 2.3,
          o: (1 - k) * 0.38,
        })
      }
    }

    out.push({
      event: e,
      x: arrived ? to.x : wx,
      y: arrived ? to.y : wy,
      z: Math.round(arrived ? to.y : wy),
      from,
      to,
      distFrac,
      dist,
      routeLen: rt.len,
      routeD: rt.d,
      trailFade,
      stepMs,
      opacity: 1 - absorb * absorb * absorb,
      scale: 1 - 0.28 * easeOut(absorb),
      frameCol,
      flipX,
      variantUrl: art.avatars.variants[variantIdx],
      color: EDGE_TINT[e.edge],
      hash,
      pinned,
      puffs,
    })
    if (age > 3.6e6 && !selectedTaskId) break
  }
  return out.reverse()
}

/** Valley version of CompanyMap's endpointFor: agent stand point, else the
 *  department operator's spot, else the building door, else open plaza stone —
 *  never the fountain at the plaza's center. */
const PLAZA_STAND: Pt = { x: 480, y: 348 }
function endpointFor(
  art: PixelArt,
  spots: Map<string, StandSpot>,
  operatorSpots: Map<string, Pt>,
  ref: Ref | undefined,
  deptId: string | undefined,
): Pt {
  if (ref?.kind === 'agent') {
    const s = spots.get(ref.id)
    if (s) return s.pt
  }
  if (deptId) {
    const op = operatorSpots.get(deptId)
    if (op) return op
    const door = art.buildings.find((b) => b.deptId === deptId)
    if (door) return door.door
  }
  return PLAZA_STAND
}

// ── Speech ───────────────────────────────────────────────────────────────────

export interface Speech {
  text: string
  ts: number
}

/** Each agent's most recent spoken line — agent-side chats only (a person's
 *  question has no body in the valley to speak it). */
export function lastSpeech(events: WorldEvent[]): Map<string, Speech> {
  const m = new Map<string, Speech>()
  for (const e of events) {
    if (e.type !== 'Chat' || e.from?.kind !== 'agent') continue
    const text = e.payload?.text ?? e.title
    if (text) m.set(e.from.id, { text, ts: e.ts })
  }
  return m
}

// ── Status emotes ────────────────────────────────────────────────────────────

export interface LastAct {
  type: EventType
  acting: boolean
  ts: number
}

/**
 * Each agent's most recent moment, swept once per world — the same iteration
 * shape as CompanyMap's progress memo, widened with timestamps (an emote must
 * expire) and Chat (a reply is visible life even without a task attached).
 */
export function lastActs(events: WorldEvent[]): Map<string, LastAct> {
  const m = new Map<string, LastAct>()
  for (const e of events) {
    if (!e.taskId && e.type !== 'Chat') continue
    if (e.from?.kind === 'agent') m.set(e.from.id, { type: e.type, acting: true, ts: e.ts })
    if (e.to?.kind === 'agent') m.set(e.to.id, { type: e.type, acting: false, ts: e.ts })
  }
  return m
}

const EMOTE_OF_ACTING: Partial<Record<EventType, EmoteName>> = {
  TaskRequest: 'working',
  DelegatedTo: 'working',
  StatusUpdate: 'working',
  ToolCall: 'working',
  BlueprintProposed: 'working',
  Chat: 'working',
  PermissionRequest: 'awaiting',
  AuthRequired: 'awaiting',
  Escalation: 'escalated',
  ArtifactDelivered: 'delivering',
}

/** Blocked and working are *states*, shown as long as they hold — a 6s
 *  window on those would hide the village's baseline activity behind the
 *  ambient engine's quiet gaps. Fresh specific acts (delivering, awaiting,
 *  escalated, reading) still override the baseline, then expire back to it. */
export function emoteFor(
  status: AgentStatus,
  last: LastAct | undefined,
  now: number,
  freshMs: number,
): EmoteName | null {
  if (status === 'blocked') return 'blocked'
  if (last && now - last.ts < freshMs) {
    if (!last.acting) return 'reading'
    const specific = EMOTE_OF_ACTING[last.type]
    if (specific && specific !== 'working') return specific
  }
  return status === 'working' ? 'working' : null
}
