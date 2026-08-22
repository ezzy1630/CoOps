import type { WorldEvent } from '../types'

export interface ReplayKnot {
  wall: number // ms into the replay
  virtual: number // virtual epoch ms
}

const MAX_GAP_WALL = 1100 // any silence longer than this compresses to ~1.1s
const LEAD_IN = 800
const TAIL = 2600

/**
 * Weeks of asynchronous work replay in seconds: build a piecewise-linear map
 * from replay wall-clock → virtual time. Dense action plays ~real speed,
 * long pauses (nights, waiting on a human) compress to a beat.
 */
export function buildReplayMapping(events: WorldEvent[]): ReplayKnot[] {
  if (events.length === 0) return [{ wall: 0, virtual: 0 }]
  const sorted = [...events].sort((a, b) => a.ts - b.ts)
  const knots: ReplayKnot[] = [{ wall: 0, virtual: sorted[0].ts - LEAD_IN }]
  let wall = LEAD_IN
  knots.push({ wall, virtual: sorted[0].ts })
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].ts - sorted[i - 1].ts
    wall += Math.min(Math.max(gap, 120), MAX_GAP_WALL)
    knots.push({ wall, virtual: sorted[i].ts })
  }
  const last = sorted[sorted.length - 1]
  knots.push({ wall: wall + TAIL, virtual: last.ts + (last.travelMs ?? 0) + TAIL })
  return knots
}

export const replayDuration = (knots: ReplayKnot[]) => knots[knots.length - 1].wall

export function virtualAt(knots: ReplayKnot[], wallMs: number): number {
  if (wallMs <= 0) return knots[0].virtual
  for (let i = 1; i < knots.length; i++) {
    if (wallMs <= knots[i].wall) {
      const a = knots[i - 1]
      const b = knots[i]
      const f = b.wall === a.wall ? 1 : (wallMs - a.wall) / (b.wall - a.wall)
      return a.virtual + f * (b.virtual - a.virtual)
    }
  }
  return knots[knots.length - 1].virtual
}

/** local playback speed (virtual ms per wall ms) at a given point — used to scale envelope motion */
export function speedAt(knots: ReplayKnot[], wallMs: number): number {
  for (let i = 1; i < knots.length; i++) {
    if (wallMs <= knots[i].wall) {
      const a = knots[i - 1]
      const b = knots[i]
      return b.wall === a.wall ? 1 : (b.virtual - a.virtual) / (b.wall - a.wall)
    }
  }
  return 1
}
