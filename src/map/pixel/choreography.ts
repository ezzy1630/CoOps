import { easeInOut, easeOut } from '../geometry'
import type { AgentStatus, EdgeKind, EventType, Ref, WorldEvent } from '../../types'
import type { EmoteName, PixelArt, Pt } from './art'
import { hashId, type StandSpot } from './layout'

/** Envelopes fall back to this when an event carries no explicit travelMs. */
export const TRAVEL_FALLBACK = 2400

/** Arrival beat: the runner pops into its destination over this window,
 *  echoing the envelope's absorb shrink without removing the target node. */
export const ABSORB_MS = 280

const MAX_WALKERS = 60

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
  /** 1 → walking, →0 across the absorb beat after arrival */
  opacity: number
  scale: number
  trailOpacity: number
  /** strip column of the first frame of the pair matching the heading */
  frameCol: number
  /** leftward runners mirror the right-facing pair */
  flipX: boolean
  variantUrl: string
  color: string
  hash: number
  /** selected-task or highlighted event: keeps its trail under focus dimming */
  pinned: boolean
}

/**
 * The valley's envelopes are villagers who carry the mail. Same derivation as
 * the classic map's crossEvents: newest-first scan with a hard cap, events for
 * the selected task or the highlighted event stay pinned even when stale so a
 * focused task keeps its visible trail.
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
  const out: Walker[] = []
  for (let i = events.length - 1; i >= 0 && out.length < MAX_WALKERS; i--) {
    const e = events[i]
    if (!e.edge || !e.deptFrom || !e.deptTo || e.deptFrom === e.deptTo) continue
    const age = renderTime - e.ts
    const travel = e.travelMs ?? TRAVEL_FALLBACK
    const pinned =
      (selectedTaskId != null && e.taskId === selectedTaskId) || e.id === highlightEventId
    // past the absorb window a walker is fully gone; only pinned trails remain
    if ((age < 0 || age > travel + ABSORB_MS) && !pinned) {
      if (age > 3.6e6 && !selectedTaskId) break
      continue
    }

    const from = endpointFor(art, spots, operatorSpots, e.from, e.deptFrom)
    const to = endpointFor(art, spots, operatorSpots, e.to, e.deptTo)

    // straight-line walk, so the remaining delta is always a positive scalar
    // of the whole leg — the total delta gives the same heading and stays
    // defined after arrival
    const dx = to.x - from.x
    const dy = to.y - from.y
    let frameCol = art.avatars.frameOrder.indexOf('down0')
    let flipX = false
    if (Math.abs(dx) > Math.abs(dy)) {
      frameCol = art.avatars.frameOrder.indexOf('right0')
      flipX = dx < 0
    } else {
      frameCol = art.avatars.frameOrder.indexOf(dy < 0 ? 'up0' : 'down0')
    }
    if (frameCol < 0) frameCol = 0

    const t = Math.max(0, Math.min(1, age / travel))
    const p = easeInOut(t)
    const arrived = age >= travel
    const absorb = arrived ? Math.min(1, (age - travel) / ABSORB_MS) : 0

    // the walker runs for the sender; pinned stale walks keep only their trail
    const hash = hashId(e.from?.kind === 'agent' ? e.from.id : (e.deptFrom ?? ''))
    const variantIdx = hash % art.avatars.variants.length
    const flightFade = arrived ? Math.max(0, 1 - (age - travel) / 600) : 1

    out.push({
      event: e,
      x: arrived ? to.x : from.x + (to.x - from.x) * p,
      y: arrived ? to.y : from.y + (to.y - from.y) * p,
      z: Math.round(arrived ? to.y : from.y + (to.y - from.y) * p),
      from,
      to,
      opacity: 1 - absorb * absorb,
      scale: 1 - 0.45 * easeOut(absorb),
      trailOpacity: pinned ? Math.max(flightFade * 0.4, 0.3) : flightFade * 0.4,
      frameCol,
      flipX,
      variantUrl: art.avatars.variants[variantIdx],
      color: EDGE_TINT[e.edge],
      hash,
      pinned,
    })
    if (age > 3.6e6 && !selectedTaskId) break
  }
  return out.reverse()
}

/** Valley version of CompanyMap's endpointFor: agent stand point, else the
 *  department operator's spot, else the building door, else the plaza. */
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
  return art.plaza
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

/** Blocked wins outright; otherwise the last act shows while it is fresh, then
 *  the village settles back to quiet idling. */
export function emoteFor(
  status: AgentStatus,
  last: LastAct | undefined,
  now: number,
  freshMs: number,
): EmoteName | null {
  if (status === 'blocked') return 'blocked'
  if (!last || now - last.ts >= freshMs) return null
  if (!last.acting) return 'reading'
  return EMOTE_OF_ACTING[last.type] ?? null
}
