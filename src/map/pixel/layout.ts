import type { AgentDef } from '../../types'
import type { PixelArt, PixelBuilding, Pt } from './art'

/** All pixel art assets render at native 1:1 canvas units for uniform texel density. */
export const SPRITE_SCALE = 1
export const MAX_CAMERA_SCALE = 3.2

// ─── Stage math ──────────────────────────────────────────────────────────────

export interface PixelCamera {
  cx: number
  cy: number
  k: number
}

/** Whole-world fit: the 960×600 stage scales to the container, clamped so it
 *  never becomes unreadable at small sizes or comically large on big screens. */
export function fitK(vw: number, vh: number, world: { w: number; h: number }): number {
  return Math.min(2.2, Math.max(0.4, Math.min(vw / world.w, vh / world.h)))
}

/** Whole-world camera for a viewport. Fit is also the minimum user zoom: the
 *  scene can never become smaller than the complete, centered valley. */
export function fitCamera(vw: number, vh: number, world: { w: number; h: number }): PixelCamera {
  return { cx: world.w / 2, cy: world.h / 2, k: fitK(vw, vh, world) }
}

/** Keep the painted world under the viewport. When one fitted dimension is
 *  smaller than the viewport, centering is the only valid position; otherwise
 *  the camera center is limited by the visible half-span in world units. */
export function constrainCamera(
  camera: PixelCamera,
  vw: number,
  vh: number,
  world: { w: number; h: number },
): PixelCamera {
  const fit = fitK(vw, vh, world)
  const k = Math.min(MAX_CAMERA_SCALE, Math.max(fit, camera.k))
  const halfW = vw / (2 * k)
  const halfH = vh / (2 * k)
  return {
    cx: halfW >= world.w / 2 ? world.w / 2 : Math.max(halfW, Math.min(world.w - halfW, camera.cx)),
    cy: halfH >= world.h / 2 ? world.h / 2 : Math.max(halfH, Math.min(world.h - halfH, camera.cy)),
    k,
  }
}

// ─── Deterministic per-agent randomness ──────────────────────────────────────

/** FNV-1a 32-bit — stable per agent id across renders and reloads. */
export function hashId(id: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

export const variantFor = (agentId: string, variantCount: number): number =>
  hashId(agentId) % variantCount

// ─── Villager stand points ───────────────────────────────────────────────────

const OP_DOOR_GAP = 14 // operators clear their doorway (and the dept label)
const RING_RADII = [24, 44] // sized for 24-unit sprites: neighbours need ~20 units
const RING_SLOTS = 6 // workers per ring before spilling outward
const FAN_ARC = Math.PI // half-circle toward the street, not back at the wall

export interface StandSpot {
  pt: Pt
  hash: number
}

/**
 * Where each villager stands, deterministic from the manifest's door points:
 * the department operator claims the doorway, workers fan out around it on
 * rings. Angular/radius jitter is seeded by the agent-id hash so crowds don't
 * line up like chess pieces and stay put across re-renders.
 */
export function standPointFor(art: PixelArt, agents: AgentDef[]): Map<string, StandSpot> {
  const byDept = new Map<string, PixelBuilding>()
  for (const b of art.buildings) byDept.set(b.deptId, b)

  const spots = new Map<string, StandSpot>()
  const workerIdx = new Map<string, number>()

  for (const agent of agents) {
    const hash = hashId(agent.id)
    const building = byDept.get(agent.deptId)
    if (!building) {
      // manifest drift (unknown dept): park near the plaza rather than vanish
      spots.set(agent.id, { pt: plazaScatter(art, hash), hash })
      continue
    }
    if (agent.kind === 'operator') {
      spots.set(agent.id, { pt: doorOut(art, building, OP_DOOR_GAP), hash })
    } else {
      const idx = workerIdx.get(agent.deptId) ?? 0
      workerIdx.set(agent.deptId, idx + 1)
      spots.set(agent.id, { pt: fanPoint(art, building, idx, hash), hash })
    }
  }
  return spots
}

/** "Outward" from a building is center → door: doors sit on the street side. */
function outDir(b: PixelBuilding): Pt {
  const dx = b.door.x - (b.x + b.w / 2)
  const dy = b.door.y - (b.y + b.h / 2)
  const len = Math.hypot(dx, dy) || 1
  return { x: dx / len, y: dy / len }
}

function doorOut(art: PixelArt, b: PixelBuilding, dist: number): Pt {
  const d = outDir(b)
  return clampToWorld(art, { x: b.door.x + d.x * dist, y: b.door.y + d.y * dist })
}

function fanPoint(art: PixelArt, b: PixelBuilding, idx: number, hash: number): Pt {
  const ring = Math.min(RING_RADII.length - 1, Math.floor(idx / RING_SLOTS))
  const slot = idx % RING_SLOTS
  const t = slot / (RING_SLOTS - 1)
  const d = outDir(b)
  const base = Math.atan2(d.y, d.x)
  // hash-spread within ±0.11 rad and ±4px keeps neighbours from touching
  const angle = base + (t - 0.5) * FAN_ARC + ((hash % 997) / 997 - 0.5) * 0.22
  const radius = RING_RADII[ring] + (((hash >>> 10) % 9) - 4)
  return clampToWorld(art, {
    x: b.door.x + Math.cos(angle) * radius,
    y: b.door.y + Math.sin(angle) * radius,
  })
}

function plazaScatter(art: PixelArt, hash: number): Pt {
  return clampToWorld(art, {
    x: art.plaza.x + ((hash % 160) - 80),
    y: art.plaza.y + (((hash >>> 8) % 120) - 60),
  })
}

// ─── Anchors for visitors and mail ───────────────────────────────────────────

export function buildingFor(art: PixelArt, deptId: string): PixelBuilding | undefined {
  return art.buildings.find((b) => b.deptId === deptId)
}

/** Approval mail waits beside the door, stacked down-right per extra letter
 *  (the same diagonal the classic map's badge anchors use). */
export function mailAnchor(art: PixelArt, b: PixelBuilding, idx: number): Pt {
  return clampToWorld(art, {
    x: b.door.x + 16 + idx * 6,
    y: b.door.y + 6 + idx * 20,
  })
}

/** Roaming colleagues dock at the building's shoulder beside the sign —
 *  attached to the place they're viewing, not drifting in the grass. */
export function presencePoint(art: PixelArt, b: PixelBuilding, idx: number): Pt {
  return clampToWorld(art, {
    x: b.x + b.w + 8,
    y: b.y + 4 - idx * 14,
  })
}

/** Keep feet (and the chip under them) inside the stage. */
export function clampToWorld(art: PixelArt, p: Pt): Pt {
  return {
    x: Math.max(14, Math.min(art.world.w - 14, p.x)),
    y: Math.max(26, Math.min(art.world.h - 16, p.y)),
  }
}
