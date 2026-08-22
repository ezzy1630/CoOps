import type { AgentDef, Department } from '../types'

/**
 * Deterministic ring layout. Departments are fixed districts arranged in a
 * circle around a deliberately empty center — there is no root agent, and the
 * hollow middle of the map is that fact made visible. Cross-department work
 * crosses the void through the Agent Gateway ring.
 */

export const R_GATEWAY = 172
export const R_ZONE_IN = 238
export const R_ZONE_OUT = 648
export const R_OPERATOR = 332
export const R_WORKER_1 = 470
export const R_WORKER_2 = 572
export const R_PERSON = 706

export const ZOOM_MID = 0.42 // above: operators & workers appear
export const ZOOM_DETAIL = 0.92 // above: task chips & message previews appear

export interface Pt {
  x: number
  y: number
}

export const polar = (r: number, a: number): Pt => ({ x: r * Math.cos(a), y: r * Math.sin(a) })

export interface Zone {
  deptId: string
  angle: number
  a0: number
  a1: number
  path: string
  labelPos: Pt
  centroid: Pt
  presencePos: Pt
  personAnchor: Pt
}

export function annularSectorPath(a0: number, a1: number, r0: number, r1: number): string {
  const large = a1 - a0 > Math.PI ? 1 : 0
  const p0 = polar(r0, a0)
  const p1 = polar(r0, a1)
  const p2 = polar(r1, a1)
  const p3 = polar(r1, a0)
  return [
    `M ${p0.x} ${p0.y}`,
    `A ${r0} ${r0} 0 ${large} 1 ${p1.x} ${p1.y}`,
    `L ${p2.x} ${p2.y}`,
    `A ${r1} ${r1} 0 ${large} 0 ${p3.x} ${p3.y}`,
    'Z',
  ].join(' ')
}

export interface MapLayout {
  zones: Map<string, Zone>
  agentPos: Map<string, Pt>
  operatorOf: Map<string, string> // deptId → operator agentId
}

export function layout(depts: Department[], agents: AgentDef[]): MapLayout {
  const n = Math.max(depts.length, 1)
  const sector = (Math.PI * 2) / n
  const gap = Math.min(0.075, sector * 0.09)
  const zones = new Map<string, Zone>()
  const agentPos = new Map<string, Pt>()
  const operatorOf = new Map<string, string>()

  depts.forEach((d, i) => {
    const angle = -Math.PI / 2 + i * sector
    const a0 = angle - sector / 2 + gap
    const a1 = angle + sector / 2 - gap
    zones.set(d.id, {
      deptId: d.id,
      angle,
      a0,
      a1,
      path: annularSectorPath(a0, a1, R_ZONE_IN, R_ZONE_OUT),
      labelPos: polar(R_ZONE_OUT - 52, angle),
      centroid: polar(438, angle),
      presencePos: polar(R_ZONE_OUT - 34, a1 - 0.075),
      personAnchor: polar(R_PERSON, angle + sector * 0.16),
    })
  })

  for (const d of depts) {
    const z = zones.get(d.id)!
    const op = agents.find((a) => a.kind === 'operator' && a.deptId === d.id)
    if (op) {
      agentPos.set(op.id, polar(R_OPERATOR, z.angle))
      operatorOf.set(d.id, op.id)
    }
    const workers = agents.filter((a) => a.kind === 'worker' && a.deptId === d.id)
    const spread = (z.a1 - z.a0) * 0.78
    const ring1 = workers.slice(0, 4)
    const ring2 = workers.slice(4)
    ring1.forEach((w, j) => {
      const a = z.angle + ((j + 0.5) / ring1.length - 0.5) * spread
      agentPos.set(w.id, polar(R_WORKER_1, a))
    })
    ring2.forEach((w, j) => {
      const a = z.angle + ((j + 0.5) / ring2.length - 0.5) * spread * 0.8
      agentPos.set(w.id, polar(R_WORKER_2, a))
    })
  }

  return { zones, agentPos, operatorOf }
}

/** Quadratic bezier pulled toward the center — cross-department edges transit the gateway. */
export function crossPath(p0: Pt, p1: Pt, idx = 0): { d: string; ctrl: Pt } {
  const mx = (p0.x + p1.x) / 2
  const my = (p0.y + p1.y) / 2
  let ctrl: Pt = { x: mx * 0.18, y: my * 0.18 }
  if (idx !== 0) {
    const dx = p1.x - p0.x
    const dy = p1.y - p0.y
    const len = Math.hypot(dx, dy) || 1
    ctrl = { x: ctrl.x + (-dy / len) * idx * 34, y: ctrl.y + (dx / len) * idx * 34 }
  }
  return { d: `M ${p0.x} ${p0.y} Q ${ctrl.x} ${ctrl.y} ${p1.x} ${p1.y}`, ctrl }
}

export function qPoint(p0: Pt, c: Pt, p1: Pt, t: number): Pt {
  const u = 1 - t
  return {
    x: u * u * p0.x + 2 * u * t * c.x + t * t * p1.x,
    y: u * u * p0.y + 2 * u * t * c.y + t * t * p1.y,
  }
}

/** Numeric arc length of a quadratic bezier — 16 segments is plenty at map scale. */
export function qLength(p0: Pt, c: Pt, p1: Pt): number {
  let len = 0
  let px = p0.x
  let py = p0.y
  for (let i = 1; i <= 16; i++) {
    const p = qPoint(p0, c, p1, i / 16)
    len += Math.hypot(p.x - px, p.y - py)
    px = p.x
    py = p.y
  }
  return len
}

export const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)
export const easeOut = (t: number) => 1 - (1 - t) * (1 - t)
/** Slight-overshoot ease for node blooms (peaks ~1.06 near t≈0.8). */
export const backOut = (t: number) => {
  const s = 1.55
  const u = t - 1
  return 1 + (s + 1) * u * u * u + s * u * u
}

/**
 * Arc path for a district name set on a textPath, at a radius just inside the
 * district's outer edge. For bottom-half districts the direction is reversed
 * (and the radius bumped by roughly a cap height) so the text is never upside
 * down — classic seal lettering.
 */
export const R_DISTRICT_LABEL = R_ZONE_OUT - 34
export function districtLabelArc(z: Zone, flip: boolean): string {
  const pad = 0.03
  const r = flip ? R_DISTRICT_LABEL + 15 : R_DISTRICT_LABEL
  const s = polar(r, flip ? z.a1 - pad : z.a0 + pad)
  const e = polar(r, flip ? z.a0 + pad : z.a1 - pad)
  return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 0 ${flip ? 0 : 1} ${e.x.toFixed(2)} ${e.y.toFixed(2)}`
}

/** Compass-rose ticks on the gateway ring: every 6°, slightly longer every 30°. */
export const GATEWAY_TICKS: string = (() => {
  const parts: string[] = []
  for (let i = 0; i < 60; i++) {
    const a = (i * 6 * Math.PI) / 180
    const half = i % 5 === 0 ? 5 : 2.5
    const p0 = polar(R_GATEWAY - half, a)
    const p1 = polar(R_GATEWAY + half, a)
    parts.push(`M ${p0.x.toFixed(2)} ${p0.y.toFixed(2)} L ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`)
  }
  return parts.join(' ')
})()

/** Clockwise arc from 12 o'clock covering `frac` of a full turn (status arcs). */
export function progressArc(r: number, frac: number): string {
  const f = Math.min(0.9999, Math.max(0.005, frac))
  const a0 = -Math.PI / 2
  const a1 = a0 + f * Math.PI * 2
  const p0 = polar(r, a0)
  const p1 = polar(r, a1)
  const large = f > 0.5 ? 1 : 0
  return `M ${p0.x} ${p0.y} A ${r} ${r} 0 ${large} 1 ${p1.x} ${p1.y}`
}

/** World-space bounding box of a set of district sectors (for camera framing). */
export function zonesBBox(zones: Zone[]): { x: number; y: number; w: number; h: number } {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const add = (p: Pt) => {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }
  for (const z of zones) {
    add(polar(R_ZONE_IN, z.a0))
    add(polar(R_ZONE_IN, z.a1))
    add(polar(R_ZONE_OUT, z.a0))
    add(polar(R_ZONE_OUT, z.a1))
    // axis-extreme points on the outer arc (angles are within roughly -π..3π/2)
    for (let q = -2; q <= 4; q++) {
      const a = (q * Math.PI) / 2
      if (a > z.a0 && a < z.a1) add(polar(R_ZONE_OUT, a))
    }
  }
  if (minX > maxX) return { x: 0, y: 0, w: 1, h: 1 }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

export function fitScale(w: number, h: number): number {
  return Math.min(w, h) / (2 * (R_PERSON + 110))
}

export const EDGE_COLOR: Record<string, string> = {
  task: 'var(--color-task)',
  artifact: 'var(--color-artifact)',
  permission: 'var(--color-permission)',
  escalation: 'var(--color-escalation)',
}
