import type { AgentDef, World } from '../../types'
import type { PixelArt, PixelBuilding, Pt } from './art'

export type ValleyFilter = 'all' | 'working' | 'attention'

export function readValleyFilterCounts(world: World): { working: number; attention: number } {
  const working = world.agents.filter((agent) => world.agentStatus.get(agent.id) === 'working').length
  const attentionAgentIds = new Set(
    world.agents
      .filter((agent) => world.agentStatus.get(agent.id) === 'blocked')
      .map((agent) => agent.id),
  )
  let unassignedApprovals = 0
  for (const approval of world.approvals) {
    if (approval.requestedBy?.kind === 'agent') attentionAgentIds.add(approval.requestedBy.id)
    else unassignedApprovals += 1
  }
  return { working, attention: attentionAgentIds.size + unassignedApprovals }
}

/** All pixel art assets render at native 1:1 canvas units for uniform texel density. */
export const SPRITE_SCALE = 1
export const MAX_CAMERA_SCALE = 3.2

// ─── Stage math ──────────────────────────────────────────────────────────────

export interface PixelCamera {
  cx: number
  cy: number
  k: number
}

export interface PixelCameraBounds {
  x: number
  y: number
  w: number
  h: number
}

/** Hard zoom-out limit: cover the viewport with the decorative scene bounds so
 *  no flat canvas can appear around the scenery. */
export function scenicMinK(vw: number, vh: number, bounds: PixelCameraBounds): number {
  return Math.min(MAX_CAMERA_SCALE, Math.max(0.4, Math.max(vw / bounds.w, vh / bounds.h)))
}

/** Stable company framing. The 960×600 interactive town is the camera's soft
 *  resting boundary; elastic input may reveal scenery beyond it temporarily. */
export function fitCamera(vw: number, vh: number, world: { w: number; h: number }): PixelCamera {
  return {
    cx: world.w / 2,
    cy: world.h / 2,
    k: Math.min(MAX_CAMERA_SCALE, Math.max(0.4, Math.min(vw / world.w, vh / world.h))),
  }
}

/** Keep the decorative background under the viewport. Interactive targets
 *  remain in town coordinates; only the camera's permitted extent is larger. */
export function constrainCamera(
  camera: PixelCamera,
  vw: number,
  vh: number,
  bounds: PixelCameraBounds,
): PixelCamera {
  const fit = scenicMinK(vw, vh, bounds)
  const k = Math.min(MAX_CAMERA_SCALE, Math.max(fit, camera.k))
  const halfW = vw / (2 * k)
  const halfH = vh / (2 * k)
  const centerX = bounds.x + bounds.w / 2
  const centerY = bounds.y + bounds.h / 2
  return {
    cx: halfW >= bounds.w / 2
      ? centerX
      : Math.max(bounds.x + halfW, Math.min(bounds.x + bounds.w - halfW, camera.cx)),
    cy: halfH >= bounds.h / 2
      ? centerY
      : Math.max(bounds.y + halfH, Math.min(bounds.y + bounds.h - halfH, camera.cy)),
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

const OP_DOOR_GAP = 32 // operators stand clearly in front of their doorway
const RING_RADII = [34, 56] // wider spacing prevents sprite overlap and bubble collision
const RING_SLOTS = 5 // workers per ring before spilling outward
const FAN_ARC = Math.PI * 0.9 // gentle arc toward the street

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
  const workerCount = new Map<string, number>()
  for (const agent of agents) {
    if (agent.kind === 'worker') workerCount.set(agent.deptId, (workerCount.get(agent.deptId) ?? 0) + 1)
  }

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
      spots.set(agent.id, { pt: fanPoint(art, building, idx, workerCount.get(agent.deptId) ?? 1, hash), hash })
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

function fanPoint(art: PixelArt, b: PixelBuilding, idx: number, total: number, hash: number): Pt {
  const ring = Math.min(RING_RADII.length - 1, Math.floor(idx / RING_SLOTS))
  const ringStart = ring * RING_SLOTS
  const ringCount = Math.min(RING_SLOTS, total - ringStart)
  const slot = idx - ringStart
  const t = ringCount <= 1 ? 0.5 : slot / (ringCount - 1)
  const d = outDir(b)
  const base = Math.atan2(d.y, d.x)
  // hash-spread within ±0.11 rad and ±4px keeps neighbours from touching
  const fanOffset = ringCount <= 1
    ? (hash % 2 === 0 ? -Math.PI / 2 : Math.PI / 2)
    : (t - 0.5) * FAN_ARC
  const angle = base + fanOffset + ((hash % 997) / 997 - 0.5) * 0.22
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
