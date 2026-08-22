import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { animate } from 'framer-motion'
import { PANEL_WIDTH, useStore } from '../store'
import { BASE_AGENTS, DEPARTMENTS, personById } from '../data/company'
import { buildWorld, taskParticipants } from '../engine/reducer'
import { virtualAt } from '../engine/replay'
import type { EdgeKind, WorldEvent } from '../types'
import {
  backOut, crossPath, districtLabelArc, easeInOut, easeOut, EDGE_COLOR, fitScale,
  GATEWAY_TICKS, layout, polar, progressArc, qLength, qPoint,
  R_GATEWAY, zonesBBox, ZOOM_DETAIL, ZOOM_MID, type Pt, type Zone,
} from './geometry'

const trunc = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s)

interface Camera {
  cx: number
  cy: number
  k: number
}

export default function CompanyMap() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 1200, h: 800 })
  const [camera, setCamera] = useState<Camera>({ cx: 0, cy: 0, k: 0.5 })
  const [now, setNow] = useState(() => Date.now())
  const [popover, setPopover] = useState<{ event: WorldEvent; at: Pt } | null>(null)

  const world = useStore((s) => s.world)
  const log = useStore((s) => s.log)
  const replay = useStore((s) => s.replay)
  const selectedTaskId = useStore((s) => s.selectedTaskId)
  const highlightEventId = useStore((s) => s.highlightEventId)
  const presence = useStore((s) => s.presence)
  const persona = useStore((s) => s.persona)
  const cameraRequest = useStore((s) => s.cameraRequest)
  const panel = useStore((s) => s.panel)

  // a side panel covers part of the viewport; center the map in what remains
  const panelW = panel ? PANEL_WIDTH[panel.kind] : 0
  const panelWRef = useRef(panelW)
  panelWRef.current = panelW

  // ── measure ──
  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    setCamera({ cx: 0, cy: 0, k: fitScale(el.clientWidth, el.clientHeight) })
    return () => ro.disconnect()
  }, [])

  // ── clock: render loop (throttled when nothing moves) ──
  const lastSetRef = useRef(0)
  const lastFrameRef = useRef(0)
  useEffect(() => {
    let raf = 0
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop)
      const st = useStore.getState()
      const r = st.replay
      if (r?.playing) {
        const dt = lastFrameRef.current ? t - lastFrameRef.current : 16
        const next = r.wallMs + dt
        if (next >= r.durationMs) {
          st.setReplayWall(r.durationMs)
          st.toggleReplayPlay()
        } else {
          st.setReplayWall(next)
        }
      }
      lastFrameRef.current = t
      const wall = Date.now()
      const tail = st.log.slice(-40)
      const moving =
        r != null ||
        tail.some((e) => e.edge && wall - e.ts < (e.travelMs ?? 2400) + 3600) ||
        tail.some((e) => e.type === 'AgentSpawned' && wall - e.ts < 1800) ||
        tail.some((e) => e.type === 'TaskCompleted' && wall - e.ts < 1100) ||
        tail.some((e) => e.type === 'GuardrailBlock' && wall - e.ts < 2800)
      if ((moving && t - lastSetRef.current > 33) || t - lastSetRef.current > 400) {
        lastSetRef.current = t
        setNow(wall)
      }
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  // ── time & world under the lens ──
  const renderTime = replay ? virtualAt(replay.knots, replay.wallMs) : now
  const replayBucket = replay ? Math.floor(renderTime / 160) : 0
  const renderWorld = useMemo(
    () => (replay ? buildWorld(BASE_AGENTS, log, renderTime) : world),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [replay ? replayBucket : world, log, replay?.taskId],
  )

  const lay = useMemo(() => layout(DEPARTMENTS, renderWorld.agents), [renderWorld.agents])

  const focus = useMemo(
    () => (selectedTaskId ? taskParticipants(renderWorld, selectedTaskId) : null),
    [renderWorld, selectedTaskId],
  )

  // per-task progress (for operator status arcs) + each agent's most recent task
  const progress = useMemo(() => {
    const byTask = new Map<string, { p: number; kind: EdgeKind; endedAt?: number }>()
    const lastTaskOf = new Map<string, string>()
    for (const e of renderWorld.events) {
      if (!e.taskId || e.type === 'Chat') continue
      let t = byTask.get(e.taskId)
      if (!t) byTask.set(e.taskId, (t = { p: 0, kind: 'task' }))
      switch (e.type) {
        case 'TaskRequest': t.p = Math.max(t.p, 0.12); break
        case 'TaskAccepted': t.p = Math.max(t.p, 0.25); break
        case 'DelegatedTo': t.p = Math.max(t.p, 0.4); break
        case 'StatusUpdate':
        case 'ToolCall': t.p = Math.min(0.85, t.p + 0.09); break
        case 'ArtifactDelivered': t.p = Math.max(t.p, 0.9); break
        case 'TaskCompleted':
        case 'TaskFailed': t.p = 1; t.endedAt = e.ts; break
        default: break
      }
      if (e.edge) t.kind = e.edge
      for (const ref of [e.from, e.to]) if (ref?.kind === 'agent') lastTaskOf.set(ref.id, e.taskId)
    }
    return { byTask, lastTaskOf }
  }, [renderWorld])

  // curved district-name arcs (textPath geometry; bottom-half arcs run reversed)
  const labelArcs = useMemo(
    () =>
      new Map(
        DEPARTMENTS.map((d) => {
          const z = lay.zones.get(d.id)!
          return [d.id, districtLabelArc(z, Math.sin(z.angle) > 0.001)] as const
        }),
      ),
    [lay],
  )

  // quadratic-bezier lengths, cached per edge (invalidated if endpoints shift)
  const edgeLenRef = useRef(new Map<string, { sig: string; len: number }>())
  const edgeLen = (id: string, p0: Pt, ctrl: Pt, p1: Pt): number => {
    const sig = `${p0.x | 0},${p0.y | 0},${ctrl.x | 0},${ctrl.y | 0},${p1.x | 0},${p1.y | 0}`
    const hit = edgeLenRef.current.get(id)
    if (hit && hit.sig === sig) return hit.len
    if (edgeLenRef.current.size > 240) edgeLenRef.current.clear()
    const len = qLength(p0, ctrl, p1)
    edgeLenRef.current.set(id, { sig, len })
    return len
  }

  // ── camera requests (role-aware entry, palette jumps, zone clicks, choreography) ──
  const animRef = useRef<{ stop: () => void } | null>(null)
  const lastUserCamRef = useRef(0) // last wheel/drag — choreographed moves yield to the user
  useEffect(() => {
    if (cameraRequest.seq === 0) return
    const gentle = cameraRequest.gentle === true
    if (gentle && Date.now() - lastUserCamRef.current < 4000) return
    const t = cameraRequest.target
    let target: Camera
    const effW = size.w - panelWRef.current
    if (t.type === 'fit') target = { cx: 0, cy: 0, k: fitScale(effW, size.h) }
    else if (t.type === 'zoomBy') {
      const c = cameraRef.current
      target = { cx: c.cx, cy: c.cy, k: Math.min(2.8, Math.max(0.3, c.k * t.factor)) }
    } else if (t.type === 'dept') {
      const z = lay.zones.get(t.deptId)
      target = z ? { cx: z.centroid.x * 0.92, cy: z.centroid.y * 0.92, k: 1.12 } : { cx: 0, cy: 0, k: fitScale(effW, size.h) }
    } else if (t.type === 'frame') {
      const zs = t.deptIds.map((id) => lay.zones.get(id)).filter((z): z is Zone => z != null)
      if (zs.length === 0) {
        target = { cx: 0, cy: 0, k: fitScale(effW, size.h) }
      } else {
        const b = zonesBBox(zs)
        const pad = 90
        const kk = Math.min(2.8, Math.max(0.3, Math.min(effW / (b.w + pad * 2), size.h / (b.h + pad * 2))))
        target = { cx: b.x + b.w / 2, cy: b.y + b.h / 2, k: kk }
      }
    } else {
      const p = lay.agentPos.get(t.agentId)
      target = p ? { cx: p.x, cy: p.y, k: 1.45 } : { cx: 0, cy: 0, k: fitScale(effW, size.h) }
    }
    animRef.current?.stop()
    const from = { ...cameraRef.current }
    animRef.current = animate(0, 1, {
      duration: gentle ? 1.15 : 0.85,
      ease: gentle ? [0.45, 0.05, 0.15, 1] : [0.32, 0.72, 0.12, 1],
      onUpdate: (v) =>
        setCamera({
          cx: from.cx + (target.cx - from.cx) * v,
          cy: from.cy + (target.cy - from.cy) * v,
          k: from.k + (target.k - from.k) * v,
        }),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraRequest.seq])

  const cameraRef = useRef(camera)
  cameraRef.current = camera

  // ── pan & zoom ──
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      lastUserCamRef.current = Date.now()
      animRef.current?.stop()
      const { cx, cy, k } = cameraRef.current
      const rect = el.getBoundingClientRect()
      const px = e.clientX - rect.left - (rect.width - panelWRef.current) / 2
      const py = e.clientY - rect.top - rect.height / 2
      const nk = Math.min(2.8, Math.max(0.3, k * Math.exp(-e.deltaY * 0.0016)))
      const wx = cx + px / k
      const wy = cy + py / k
      setCamera({ cx: wx - px / nk, cy: wy - py / nk, k: nk })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const dragRef = useRef<{ x: number; y: number; moved: number } | null>(null)
  const onPointerDown = (e: React.PointerEvent) => {
    dragRef.current = { x: e.clientX, y: e.clientY, moved: 0 }
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current
    if (!d) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    d.moved += Math.abs(dx) + Math.abs(dy)
    if (d.moved > 3) {
      lastUserCamRef.current = Date.now()
      animRef.current?.stop()
      setCamera((c) => ({ ...c, cx: c.cx - dx / c.k, cy: c.cy - dy / c.k }))
    }
    d.x = e.clientX
    d.y = e.clientY
  }
  const onPointerUp = () => {
    const d = dragRef.current
    dragRef.current = null
    if (d && d.moved <= 3) {
      useStore.getState().selectTask(null)
      useStore.getState().setHighlight(null)
      setPopover(null)
    }
  }

  const { w, h } = size
  const { cx, cy, k } = camera
  const showAgents = k >= ZOOM_MID
  const showDetail = k >= ZOOM_DETAIL
  const inv = 1 / k // constant-screen-size factor
  // district names sit on the map like engravings: full strength at fit, receding as you zoom into detail
  const districtLabelFade = 0.25 + 0.75 * Math.max(0, Math.min(1, 1 - (k - ZOOM_DETAIL) / 0.6))

  // ── visible cross-department traffic ──
  const crossEvents = useMemo(() => {
    const out: { e: WorldEvent; age: number; travel: number }[] = []
    for (let i = renderWorld.events.length - 1; i >= 0 && out.length < 60; i--) {
      const e = renderWorld.events[i]
      if (!e.edge || !e.deptFrom || !e.deptTo || e.deptFrom === e.deptTo) continue
      const age = renderTime - e.ts
      const travel = e.travelMs ?? 2400
      const inSelected = selectedTaskId != null && e.taskId === selectedTaskId
      if (age < travel + 3400 || inSelected || e.id === highlightEventId) {
        out.push({ e, age, travel })
      }
      if (age > 3.6e6 && !selectedTaskId) break
    }
    return out.reverse()
  }, [renderWorld, renderTime, selectedTaskId, highlightEventId])

  const pairIdx = new Map<string, number>()
  const presenceIdx = new Map<string, number>()

  const guardrails = renderWorld.events.filter(
    (e) => e.type === 'GuardrailBlock' && renderTime - e.ts >= 0 && renderTime - e.ts < 2800,
  )

  const dimmed = (deptId?: string, agentId?: string) => {
    if (!focus) return false
    if (agentId) return !focus.agents.has(agentId)
    if (deptId) return !focus.depts.has(deptId)
    return true
  }

  const endpointFor = (e: WorldEvent, refSide: 'from' | 'to'): Pt => {
    const ref = refSide === 'from' ? e.from : e.to
    const dept = refSide === 'from' ? e.deptFrom! : e.deptTo!
    if (ref?.kind === 'agent') {
      const p = lay.agentPos.get(ref.id)
      if (p) return p
    }
    const op = lay.operatorOf.get(dept)
    return (op && lay.agentPos.get(op)) || lay.zones.get(dept)?.centroid || { x: 0, y: 0 }
  }

  const centerX = (w - panelW) / 2
  const screenOf = (p: Pt): Pt => ({ x: (p.x - cx) * k + centerX, y: (p.y - cy) * k + h / 2 })

  // approvals → named humans on the map
  const humanBadges = useMemo(() => {
    const perDept = new Map<string, number>()
    return renderWorld.approvals.map((a) => {
      const deptId = a.deptId ?? 'operations'
      const idx = perDept.get(deptId) ?? 0
      perDept.set(deptId, idx + 1)
      const z = lay.zones.get(deptId)
      const base = z ? z.personAnchor : { x: 0, y: 0 }
      const anchor = { x: base.x + idx * 8, y: base.y + idx * 46 }
      const fromAgent = a.requestedBy?.kind === 'agent' ? lay.agentPos.get(a.requestedBy.id) : undefined
      return { a, anchor, fromAgent, person: personById.get(a.personId) }
    })
  }, [renderWorld.approvals, lay])

  const deptSummary = (deptId: string) => {
    let working = 0
    let blocked = 0
    for (const ag of renderWorld.agents) {
      if (ag.deptId !== deptId) continue
      const s = renderWorld.agentStatus.get(ag.id)
      if (s === 'working') working++
      if (s === 'blocked') blocked++
    }
    return { working, blocked }
  }

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 cursor-grab active:cursor-grabbing overflow-hidden bg-bg"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      style={{
        backgroundImage: 'radial-gradient(circle at 1px 1px, rgb(29 28 23 / 0.08) 1px, transparent 0)',
        backgroundSize: '30px 30px',
      }}
    >
      <svg width={w} height={h} className="block">
        <g transform={`translate(${centerX},${h / 2}) scale(${k}) translate(${-cx},${-cy})`} style={{ transition: 'none' }}>
          <defs>
            {DEPARTMENTS.map((d) => (
              <path key={d.id} id={`dl-${d.id}`} d={labelArcs.get(d.id)} fill="none" />
            ))}
          </defs>

          {/* quiet instrument details: faint contours + compass ticks on the gateway */}
          <g className="pointer-events-none" fill="none" stroke="var(--color-ink)">
            <circle r={64} strokeOpacity={0.05} strokeWidth={1} />
            <circle r={118} strokeOpacity={0.045} strokeWidth={1} strokeDasharray="1 7" />
            <circle r={210} strokeOpacity={0.05} strokeWidth={1} />
            <path d={GATEWAY_TICKS} strokeOpacity={0.13} strokeWidth={1} />
          </g>

          {/* gateway ring + hollow center */}
          <circle r={R_GATEWAY} fill="none" stroke="var(--color-line)" strokeWidth={1.4 * inv} strokeDasharray={`${3 * inv} ${7 * inv}`} />
          {showAgents && (
            <>
              <text y={-R_GATEWAY - 10 * inv} textAnchor="middle" fill="var(--color-dim)" fontSize={10.5 * inv} fontFamily="var(--font-mono)" letterSpacing="0.14em">
                AGENT GATEWAY
              </text>
              <text y={4 * inv} textAnchor="middle" fill="var(--color-dim)" opacity={0.55} fontSize={10.5 * inv} fontFamily="var(--font-mono)" letterSpacing="0.22em">
                NO ROOT OPERATOR
              </text>
            </>
          )}

          {/* department districts */}
          {DEPARTMENTS.map((d) => {
            const z = lay.zones.get(d.id)!
            const sum = deptSummary(d.id)
            const isHome = persona?.deptId === d.id
            return (
              <g key={d.id} opacity={dimmed(d.id) ? 0.14 : 1} style={{ transition: 'opacity 0.35s' }}>
                <path
                  d={z.path}
                  fill={isHome ? 'rgb(29 28 23 / 0.05)' : 'rgb(29 28 23 / 0.025)'}
                  stroke="var(--color-line)"
                  strokeWidth={1.2 * inv}
                  className="cursor-pointer"
                  onClick={(ev) => {
                    ev.stopPropagation()
                    const st = useStore.getState()
                    if (k < ZOOM_MID * 1.6) st.requestCamera({ type: 'dept', deptId: d.id })
                    st.openPanel('dept', d.id)
                  }}
                />
                <text
                  fill="var(--color-ink)"
                  opacity={0.52 * districtLabelFade}
                  fontSize={Math.min(30, 14 * inv)}
                  fontWeight={600}
                  letterSpacing="0.26em"
                  className="pointer-events-none"
                >
                  <textPath href={`#dl-${d.id}`} startOffset="50%" textAnchor="middle">
                    {d.name.toUpperCase()}
                  </textPath>
                </text>
                {!showAgents && (sum.working > 0 || sum.blocked > 0) && (
                  <text x={z.labelPos.x} y={z.labelPos.y + 4 * inv} textAnchor="middle" fontSize={11 * inv} className="pointer-events-none">
                    {sum.working > 0 && (
                      <tspan fill="var(--color-task)">{sum.working} active</tspan>
                    )}
                    {sum.blocked > 0 && (
                      <tspan fill="var(--color-permission)" dx={sum.working > 0 ? 8 * inv : 0}>
                        {sum.blocked} blocked
                      </tspan>
                    )}
                  </text>
                )}
              </g>
            )
          })}

          {/* inheritance tethers: operator → workers (hairline ink; newborns draw on) */}
          {showAgents &&
            renderWorld.agents
              .filter((a) => a.kind === 'worker')
              .map((wk) => {
                const op = lay.operatorOf.get(wk.deptId)
                const p0 = op && lay.agentPos.get(op)
                const p1 = lay.agentPos.get(wk.id)
                if (!p0 || !p1) return null
                const birthAge = wk.bornAt != null ? renderTime - wk.bornAt : Infinity
                const revealing = birthAge >= 0 && birthAge < 380
                const settle = Math.max(0, Math.min(1, (birthAge - 380) / 1220))
                const tetherLen = revealing ? Math.hypot(p1.x - p0.x, p1.y - p0.y) : 0
                return (
                  <line
                    key={`inh-${wk.id}`}
                    x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y}
                    stroke="var(--color-ink)"
                    strokeWidth={1 * inv}
                    opacity={dimmed(wk.deptId, wk.id) ? 0.04 : 0.09 + 0.29 * (1 - settle)}
                    style={
                      revealing
                        ? { strokeDasharray: tetherLen, strokeDashoffset: tetherLen * (1 - easeOut(birthAge / 380)) }
                        : undefined
                    }
                  />
                )
              })}

          {/* cross-department edges + envelopes */}
          {crossEvents.map(({ e, age, travel }) => {
            const p0 = endpointFor(e, 'from')
            const p1 = endpointFor(e, 'to')
            const key = [e.deptFrom, e.deptTo].sort().join('~')
            const idx = pairIdx.get(key) ?? 0
            pairIdx.set(key, idx + 1)
            const { d, ctrl } = crossPath(p0, p1, idx === 0 ? 0 : (idx % 2 === 1 ? (idx + 1) / 2 : -(idx / 2)))
            const color = EDGE_COLOR[e.edge!] ?? 'var(--color-task)'
            const inFlight = age >= 0 && age < travel
            const fade = inFlight ? 1 : Math.max(0, 1 - (age - travel) / 3400)
            const isHl = e.id === highlightEventId
            const inSelected = selectedTaskId != null && e.taskId === selectedTaskId
            const opacity = isHl ? 1 : inFlight ? 0.8 : inSelected ? 0.45 : fade * 0.5
            const isDim = focus && !inSelected && !isHl
            if (opacity <= 0.02 && !inSelected && !isHl) return null

            // lifecycle within the same total window: the path draws itself toward the
            // receiver (~18% of travel), then the envelope departs with a small
            // anticipation, travels, and is absorbed into the node with a ring bloom.
            const drawMs = travel * 0.18
            const drawing = age >= 0 && age < drawMs
            const len = drawing ? edgeLen(e.id, p0, ctrl, p1) : 0
            const envDur = Math.max(1, travel - drawMs)
            const envAge = age - drawMs
            const tt = easeInOut(Math.min(1, Math.max(0, envAge / envDur)))
            const anticP = envAge >= 0 && envAge < 140 ? Math.sin((envAge / 140) * Math.PI) : 0
            const absorb = envAge > envDur - 280 ? Math.min(1, (envAge - (envDur - 280)) / 280) : 0
            const envScale = (1 + 0.16 * anticP) * (1 - 0.55 * easeOut(absorb))
            const ep = qPoint(p0, ctrl, p1, Math.max(-0.02, tt - 0.015 * anticP))
            return (
              <g key={e.id} opacity={isDim ? 0.06 : 1} style={{ transition: 'opacity 0.35s' }}>
                <path
                  d={d}
                  fill="none"
                  stroke={color}
                  strokeWidth={(isHl ? 3 : inFlight ? 2 : 1.4) * inv}
                  opacity={opacity}
                  className={inFlight && !drawing ? 'edge-flow' : undefined}
                  style={
                    drawing
                      ? { cursor: 'pointer', strokeDasharray: len, strokeDashoffset: len * (1 - easeOut(age / drawMs)) }
                      : { cursor: 'pointer' }
                  }
                  onClick={(ev) => {
                    ev.stopPropagation()
                    const st = useStore.getState()
                    if (e.taskId) st.selectTask(e.taskId)
                    st.setHighlight(e.id)
                  }}
                />
                {inFlight && !drawing && (
                  <g
                    transform={`translate(${ep.x},${ep.y}) scale(${envScale})`}
                    opacity={1 - absorb * absorb}
                    style={{ cursor: 'pointer' }}
                    onClick={(ev) => {
                      ev.stopPropagation()
                      setPopover({ event: e, at: ep })
                      if (e.taskId) useStore.getState().selectTask(e.taskId)
                    }}
                  >
                    <rect x={-9} y={-6.5} width={18} height={13} rx={2.5} fill="var(--color-surface)" stroke={color} strokeWidth={1.4} />
                    <path d="M -9 -6.5 L 0 1 L 9 -6.5" fill="none" stroke={color} strokeWidth={1.1} />
                    {showDetail && (
                      <text y={-12} textAnchor="middle" fill={color} fontSize={10 * inv} fontWeight={500}>
                        {trunc(e.title, 34)}
                      </text>
                    )}
                  </g>
                )}
                {age >= travel && age < travel + 350 && (
                  <circle
                    cx={p1.x}
                    cy={p1.y}
                    r={9 + 22 * easeOut((age - travel) / 350)}
                    fill="none"
                    stroke={color}
                    strokeWidth={1.6 * inv}
                    opacity={0.35 * (1 - (age - travel) / 350)}
                    className="pointer-events-none"
                  />
                )}
              </g>
            )
          })}

          {/* guardrail flashes at the gateway */}
          {guardrails.map((e) => {
            const z0 = e.deptFrom && lay.zones.get(e.deptFrom)
            const z1 = e.deptTo && lay.zones.get(e.deptTo)
            const a = z0 && z1 ? (z0.angle + z1.angle) / 2 : 0
            const p = polar(R_GATEWAY, a)
            return (
              <g key={e.id} transform={`translate(${p.x},${p.y})`} className="pointer-events-none">
                <circle r={16} fill="none" stroke="var(--color-guard)" strokeWidth={2} style={{ animation: 'gatewayflash 2.6s ease-out both' }} />
                <text textAnchor="middle" y={4} fontSize={12} fill="var(--color-guard)">
                  ⛨
                </text>
              </g>
            )
          })}

          {/* dotted agent → human lines + named human badges */}
          {humanBadges.map(({ a, anchor, fromAgent, person }) => {
            const isDim = focus && a.taskId !== selectedTaskId
            return (
              <g
                key={a.eventId}
                opacity={isDim ? 0.1 : 1}
                style={{ transition: 'opacity 0.35s', cursor: 'pointer' }}
                onClick={(ev) => {
                  ev.stopPropagation()
                  useStore.getState().openPanel('approvals')
                }}
              >
                {fromAgent && (
                  <line
                    x1={fromAgent.x} y1={fromAgent.y} x2={anchor.x} y2={anchor.y}
                    stroke="var(--color-human)" strokeWidth={1.5 * inv} className="edge-dotted" opacity={0.75}
                  />
                )}
                <circle cx={anchor.x} cy={anchor.y} r={14 * inv} fill={`hsl(${person?.hue ?? 40} 52% 87%)`} stroke="var(--color-human)" strokeWidth={1.5 * inv} />
                <text x={anchor.x} y={anchor.y + 3.5 * inv} textAnchor="middle" fontSize={9.5 * inv} fontWeight={700} fill="var(--color-ink)">
                  {person?.initials}
                </text>
                <g transform={`translate(${anchor.x + 11 * inv},${anchor.y - 11 * inv}) scale(${inv})`}>
                  <circle r={7} fill="var(--color-abyss)" stroke="var(--color-human)" strokeWidth={1.2} />
                  <path d="M -2.5 -0.5 h5 v3.5 h-5 z M -1.5 -0.5 v-1.4 a1.5 1.5 0 0 1 3 0 v1.4" fill="none" stroke="var(--color-human)" strokeWidth={1.1} />
                </g>
                {showAgents && (
                  <text x={anchor.x} y={anchor.y + 26 * inv} textAnchor="middle" fontSize={10 * inv} fill="var(--color-human)" fontWeight={600}>
                    {person?.name}
                  </text>
                )}
              </g>
            )
          })}

          {/* agents */}
          {showAgents &&
            renderWorld.agents.map((ag) => {
              const p = lay.agentPos.get(ag.id)
              if (!p) return null
              const status = renderWorld.agentStatus.get(ag.id) ?? 'idle'
              const isOp = ag.kind === 'operator'
              const r = isOp ? 24 : 12
              // spawn ceremony: tether (drawn above) → bloom with overshoot → name types on
              const birthAge = ag.bornAt != null ? renderTime - ag.bornAt : Infinity
              const inCeremony = birthAge >= 0 && birthAge < 1600
              const born = birthAge >= 800 ? 1 : birthAge < 180 ? 0.01 : backOut((birthAge - 180) / 620)
              const statusColor =
                status === 'working' ? 'var(--color-task)' : status === 'blocked' ? 'var(--color-permission)' : 'var(--color-linebright)'
              let taskId = renderWorld.agentTask.get(ag.id)
              let arcFade = 1
              if (isOp && !taskId) {
                // just-completed task: hold the full arc briefly, then fade it out
                const last = progress.lastTaskOf.get(ag.id)
                const lt = last ? progress.byTask.get(last) : undefined
                if (lt?.endedAt != null && renderTime - lt.endedAt < 900) {
                  taskId = last
                  arcFade = Math.max(0, 1 - (renderTime - lt.endedAt) / 900)
                }
              }
              const task = taskId ? renderWorld.tasks.get(taskId) : undefined
              const arc = isOp && taskId ? progress.byTask.get(taskId) : undefined
              const fs = (isOp ? 12 : 10) * inv
              const typedN =
                !inCeremony || birthAge >= 1420
                  ? ag.name.length
                  : birthAge < 420
                    ? 0
                    : Math.min(ag.name.length, Math.ceil(ag.name.length * ((birthAge - 420) / 1000)))
              return (
                <g
                  key={ag.id}
                  transform={`translate(${p.x},${p.y})`}
                  opacity={dimmed(ag.deptId, ag.id) ? 0.12 : 1}
                  style={{ transition: 'opacity 0.35s', cursor: 'pointer' }}
                  onClick={(ev) => {
                    ev.stopPropagation()
                    const st = useStore.getState()
                    st.openPanel('agent', ag.id)
                    if (taskId) st.selectTask(taskId)
                  }}
                >
                  <g transform={`scale(${born})`}>
                    <circle
                      r={r}
                      fill="var(--color-surface)"
                      stroke={statusColor}
                      strokeWidth={isOp ? 2 : 1.5}
                      className={status === 'working' ? 'anim-work' : status === 'idle' ? 'anim-breathe' : undefined}
                      style={status === 'working' ? { color: 'var(--color-task)' } : undefined}
                    />
                    {isOp && <circle r={r + 5} fill="none" stroke="var(--color-linebright)" strokeWidth={0.9 * inv} />}
                    {arc && arc.p > 0 && (
                      <path
                        d={progressArc(r + 5, arc.p)}
                        fill="none"
                        stroke={EDGE_COLOR[arc.kind] ?? 'var(--color-task)'}
                        strokeWidth={2 * inv}
                        strokeLinecap="round"
                        opacity={0.9 * arcFade}
                        className="pointer-events-none"
                      />
                    )}
                    <circle r={isOp ? 4.5 : 2.8} fill={status === 'idle' ? 'var(--color-mut)' : statusColor} />
                  </g>
                  {inCeremony && birthAge >= 250 && birthAge < 850 && (
                    <circle
                      r={r + 4 + 30 * easeOut((birthAge - 250) / 600)}
                      fill="none"
                      stroke="var(--color-task)"
                      strokeWidth={1.4 * inv}
                      opacity={0.35 * (1 - (birthAge - 250) / 600)}
                      className="pointer-events-none"
                    />
                  )}
                  {status === 'blocked' && (
                    <g transform={`translate(${r * 0.75},${-r * 0.75})`}>
                      <circle r={8} fill="var(--color-abyss)" stroke="var(--color-permission)" strokeWidth={1.3} />
                      <path d="M -2.8 -0.6 h5.6 v4 h-5.6 z M -1.7 -0.6 v-1.6 a1.7 1.7 0 0 1 3.4 0 v1.6" fill="none" stroke="var(--color-permission)" strokeWidth={1.2} />
                    </g>
                  )}
                  {(isOp || showDetail || status !== 'idle' || inCeremony) && typedN > 0 && (
                    <text
                      y={r + 14 * inv}
                      textAnchor={typedN < ag.name.length ? 'start' : 'middle'}
                      x={typedN < ag.name.length ? -ag.name.length * fs * 0.3 : 0}
                      fontSize={fs}
                      fontWeight={isOp ? 600 : 500}
                      fill={isOp ? 'var(--color-ink)' : 'var(--color-mut)'}
                    >
                      {ag.name.slice(0, typedN)}
                      {typedN < ag.name.length && <tspan opacity={0.55}>▏</tspan>}
                    </text>
                  )}
                  {showDetail && task && status !== 'idle' && (
                    <text y={r + 26 * inv} textAnchor="middle" fontSize={9 * inv} fill={statusColor} opacity={0.9}>
                      {trunc(task.title, 30)}
                    </text>
                  )}
                </g>
              )
            })}

          {/* multiplayer presence: colleagues browsing departments */}
          {showAgents &&
            presence
              .filter((m) => !m.where.startsWith('approval:'))
              .map((m) => {
                const z = lay.zones.get(m.where)
                const person = personById.get(m.personId)
                if (!z || !person) return null
                const i = presenceIdx.get(m.where) ?? 0
                presenceIdx.set(m.where, i + 1)
                const pos = { x: z.presencePos.x - i * 22 * inv, y: z.presencePos.y }
                return (
                  <g key={`${m.personId}-${m.where}`} transform={`translate(${pos.x},${pos.y})`} opacity={dimmed(m.where) ? 0.1 : 0.95} className="pointer-events-none">
                    <circle r={9 * inv} fill={`hsl(${person.hue} 52% 87%)`} stroke="var(--color-linebright)" strokeWidth={1 * inv} />
                    <text y={3 * inv} textAnchor="middle" fontSize={7 * inv} fontWeight={700} fill="var(--color-ink)">
                      {person.initials}
                    </text>
                  </g>
                )
              })}
        </g>
      </svg>

      {/* envelope popover: the typed protocol, visible on screen */}
      {popover && (() => {
        const sp = screenOf(popover.at)
        const e = popover.event
        const pl = e.payload
        return (
          <div
            className="panel anim-fadeup absolute z-30 w-72 p-3"
            style={{ left: Math.min(sp.x + 14, w - 300), top: Math.min(sp.y - 10, h - 220) }}
            onPointerDown={(ev) => ev.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <span className="chip" style={{ color: EDGE_COLOR[e.edge ?? 'task'], borderColor: 'currentcolor' }}>
                {e.type}
              </span>
              <button className="text-dim hover:text-ink text-xs" onClick={() => setPopover(null)}>✕</button>
            </div>
            <div className="mt-2 text-[13px] font-medium">{e.title}</div>
            <dl className="mt-2 space-y-1 text-[11.5px]">
              {pl?.objective && <Row k="objective" v={pl.objective} />}
              {pl?.deadline && <Row k="deadline" v={pl.deadline} />}
              {pl?.sharedContext && <Row k="shared context" v={pl.sharedContext} />}
              {pl?.expected && <Row k="expected" v={pl.expected} />}
              {pl?.visibility && <Row k="visibility" v={pl.visibility} />}
            </dl>
            {e.type === 'ArtifactDelivered' && pl?.artifact && (
              <button
                className="mt-2 flex w-full cursor-pointer items-center gap-2 rounded border border-line bg-raised px-2 py-1.5 text-left text-[11.5px] text-ink hover:bg-hover"
                onClick={() => {
                  useStore.getState().openArtifact(e.id)
                  setPopover(null)
                }}
              >
                <span className="shrink-0 font-mono text-[10px] uppercase tracking-wide" style={{ color: 'var(--color-artifact)' }}>
                  {pl.artifact.type}
                </span>
                <span className="truncate">{pl.artifact.name}</span>
                <span className="ml-auto shrink-0 text-[10px] text-dim">open</span>
              </button>
            )}
            {e.taskId && (
              <button
                className="btn btn-primary mt-2 w-full text-xs"
                onClick={() => {
                  useStore.getState().selectTask(e.taskId!)
                  setPopover(null)
                }}
              >
                Focus this task
              </button>
            )}
          </div>
        )
      })()}
    </div>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-24 shrink-0 font-mono text-[10px] uppercase tracking-wide text-dim">{k}</dt>
      <dd className="text-mut">{v}</dd>
    </div>
  )
}
