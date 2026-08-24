import '../../data/activeCompany'
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react'
import { animate } from 'framer-motion'
import { PANEL_WIDTH, useStore, type PresenceMark } from '../../store'
import { getAgents, getDepartments, personById } from '../../data/company'
import { buildWorld, taskParticipants } from '../../engine/reducer'
import { virtualAt } from '../../engine/replay'
import type { Person, World } from '../../types'
import { usePixelArt, type EmoteName, type PixelArt, type PixelBuilding } from './art'
import {
  buildingFor,
  constrainCamera,
  fitCamera,
  mailAnchor,
  MAX_CAMERA_SCALE,
  presencePoint,
  scenicMinK,
  SPRITE_SCALE,
  standPointFor,
  variantFor,
  type PixelCamera,
  type PixelCameraBounds,
  type StandSpot,
} from './layout'
import { deriveWalkers, emoteFor, lastActs, lastSpeech, walkerWindowMs } from './choreography'
import ValleyToolbar, { readValleyFilterCounts, type ValleyFilter, type ValleyInspection } from './ValleyToolbar'
const CELL = 24 // avatar cell in the strip, manifest avatars.cell
const CELL_PX = CELL * SPRITE_SCALE
const AGENT_CONTROL_SIZE = 28
// bubbles and letters draw at native 1:1 scale for uniform pixel consistency
const EMOTE_PX = 16
/** an emote shows while its act is fresh, then the village calms down */
const EMOTE_FRESH_MS = 6000
/** a spoken line hangs over its speaker briefly, then the emote returns */
const SPEECH_MS = 6000
const VALLEY_TOOLBAR_HEIGHT = 52
const VALLEY_RUN_BAR_HEIGHT = 56
const ELASTIC_CAMERA_STIFFNESS = 26
const ELASTIC_CAMERA_DAMPING = 7.4

interface ElasticCameraState {
  displacement: number
  velocity: number
  cx: number
  cy: number
  vx: number
  vy: number
  dragging: boolean
  lastTime: number
  raf: number
}

// every standing villager idles between the same two strip columns (down0 ↔ down1)
const BOB_VARS = {
  '--bob-from': '0px',
  '--bob-to': `${-CELL_PX}px`,
} as CSSProperties

/** Drop the redundant “Agent” suffix, cap length — kept local so the classic
 *  map's cached shortener stays untouched. */
const shortName = (name: string): string => {
  const s = name.replace(/\s+agents?$/i, '')
  return s.length > 16 ? s.slice(0, 15).trimEnd() + '…' : s
}

/** Palette hexes arrive as "#rrggbb"; alpha tints stay derived from them. */
function hexA(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m) return hex
  const n = parseInt(m[1], 16)
  return `rgb(${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255} / ${alpha})`
}

function frameCamera(
  vw: number,
  vh: number,
  bounds: PixelCameraBounds,
  box: { x: number; y: number; w: number; h: number },
  pad: number,
): PixelCamera {
  return constrainCamera(
    {
      cx: box.x + box.w / 2,
      cy: box.y + box.h / 2,
      k: Math.min(MAX_CAMERA_SCALE, Math.min(vw / (box.w + pad * 2), vh / (box.h + pad * 2))),
    },
    vw,
    vh,
    bounds,
  )
}

/**
 * Everything an agent says or shows above its head. The status emote is the
 * baseline (every working/blocked agent gets one, speaker or not); a fresh
 * spoken line replaces it. Collapsed the bubble clamps to three lines with an
 * ellipsis; clicking pins it open into a scrollable pane, and hovering holds
 * it past the speech window so a long answer isn't lost mid-read. Rendered as
 * anchor + inner scroller + tail sibling so the tail survives scrolling.
 */
function StatusBubble({
  art, text, active, emote,
}: {
  art: PixelArt
  /** the agent's latest spoken line; undefined for agents who never chatted */
  text?: string
  /** true while the line is fresh on the clock */
  active: boolean
  /** baseline status emote shown when no bubble is up */
  emote: EmoteName | null
}) {
  const [pinned, setPinned] = useState(false)
  const [hover, setHover] = useState(false)
  // a new line replaces whatever reading state the old one had
  useEffect(() => setPinned(false), [text])
  useEffect(() => {
    if (!active && !hover) setPinned(false)
  }, [active, hover])
  const speaking = text != null && (active || pinned || hover)

  if (!speaking) {
    return emote ? (
      <img
        src={art.emotes.files[emote]}
        alt=""
        draggable={false}
        className="pixelated pointer-events-none absolute select-none"
        style={{ left: 0, top: -(CELL_PX + EMOTE_PX + 2), transform: 'translateX(-50%)', width: EMOTE_PX, height: EMOTE_PX }}
      />
    ) : null
  }
  return (
    <div
      className="absolute"
      style={{ left: 0, top: -(CELL_PX + 8), transform: 'translate(-50%, -100%)', width: 190 }}
      onClick={(e) => {
        e.stopPropagation()
        setPinned((p) => !p)
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div
        className={`whitespace-normal rounded-sm border px-1.5 py-1 text-left leading-snug ${pinned ? 'speech-bubble-scroll cursor-auto' : ''}`}
        style={{
          maxHeight: pinned ? 108 : undefined,
          overflowY: pinned ? 'auto' : 'hidden',
          background: art.palette.paper,
          color: art.palette.ink,
          borderColor: hexA(art.palette.outline, 0.5),
          boxShadow: `2px 2px 0 ${hexA(art.palette.outline, 0.18)}`,
          scrollbarWidth: 'thin',
        }}
      >
        <span className={`font-mono text-[8px] ${pinned ? '' : 'line-clamp-3'}`}>{text}</span>
      </div>
      {!pinned && (
        <div
          className="absolute left-1/2 -bottom-[3px] size-[6px] -translate-x-1/2 rotate-45"
          style={{
            background: art.palette.paper,
            borderRight: `1px solid ${hexA(art.palette.outline, 0.5)}`,
            borderBottom: `1px solid ${hexA(art.palette.outline, 0.5)}`,
          }}
        />
      )}
    </div>
  )
}

export default function PixelMap() {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  const [camera, setCamera] = useState<PixelCamera | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [filter, setFilter] = useState<ValleyFilter>('all')
  const [showNames, setShowNames] = useState(false)
  const [inspection, setInspection] = useState<ValleyInspection>(null)
  const artState = usePixelArt()
  const world = useStore((s) => s.world)
  const log = useStore((s) => s.log)
  const replay = useStore((s) => s.replay)
  const selectedTaskId = useStore((s) => s.selectedTaskId)
  const highlightEventId = useStore((s) => s.highlightEventId)
  const panel = useStore((s) => s.panel)
  const presence = useStore((s) => s.presence)
  const entered = useStore((s) => s.entered)
  const cameraRequest = useStore((s) => s.cameraRequest)
  const art = artState.status === 'ready' ? artState.art : null

  // The map stays mounted while the app shell appears. Measure that committed
  // layout before paint so the old full-screen framing never flashes inside
  // the smaller entered-app viewport.
  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const next = { w: el.clientWidth, h: el.clientHeight }
    setSize((current) => current?.w === next.w && current.h === next.h ? current : next)
  }, [entered])

  // ResizeObserver owns later window and flex-layout changes.
  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const measure = () => {
      const next = { w: el.clientWidth, h: el.clientHeight }
      setSize((current) => current?.w === next.w && current.h === next.h ? current : next)
    }
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    measure()
    return () => ro.disconnect()
  }, [])

  // ── clock: throttled rAF — fast while anything moves (replay, fresh events,
  //    spawn/finish/guardrail windows), sleepy otherwise ──
  const lastTickRef = useRef(0)
  useEffect(() => {
    let raf = 0
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop)
      const st = useStore.getState()
      const wall = Date.now()
      const tail = st.log.slice(-40)
      const moving =
        st.replay != null ||
        tail.some((e) => e.edge && wall - e.ts < walkerWindowMs(e.travelMs ?? 2400)) ||
        tail.some((e) => e.type === 'AgentSpawned' && wall - e.ts < 1800) ||
        tail.some((e) => e.type === 'TaskCompleted' && wall - e.ts < 1100) ||
        tail.some((e) => e.type === 'GuardrailBlock' && wall - e.ts < 2800)
      if ((moving && t - lastTickRef.current > 33) || t - lastTickRef.current > 400) {
        lastTickRef.current = t
        setNow(wall)
      }
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  // ── time & world under the lens: identical shape to CompanyMap, so scrubbing
  //    replay re-folds history and spawned agents pop in mid-replay too ──
  const renderTime = replay ? virtualAt(replay.knots, replay.wallMs) : now
  const replayBucket = replay ? Math.floor(renderTime / 160) : 0
  const renderWorld = useMemo(
    () => (replay ? buildWorld(getAgents(), getDepartments(), log, renderTime) : world),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [replay ? replayBucket : world, log, replay?.taskId],
  )

  useEffect(() => {
    const counts = readValleyFilterCounts(renderWorld)
    if ((filter === 'working' && counts.working === 0) || (filter === 'attention' && counts.attention === 0)) {
      setFilter('all')
    }
  }, [filter, renderWorld])

  const spots = useMemo(
    () => (art ? standPointFor(art, renderWorld.agents) : null),
    [art, renderWorld.agents],
  )

  const focus = useMemo(
    () => (selectedTaskId ? taskParticipants(renderWorld, selectedTaskId) : null),
    [renderWorld, selectedTaskId],
  )

  // a side panel covers part of the viewport; fit and center in what remains
  const panelW = panel ? PANEL_WIDTH[panel.kind] : 0
  const availableWidth = size ? Math.max(1, size.w - panelW - 24) : 0
  const viewportTop = VALLEY_TOOLBAR_HEIGHT + 10
  const viewportBottom = entered ? VALLEY_RUN_BAR_HEIGHT + 10 : 0
  const availableHeight = size ? Math.max(1, size.h - viewportTop - viewportBottom) : 0
  const autoFitRef = useRef(true)
  const cameraRef = useRef(camera)
  cameraRef.current = camera
  const cameraAnimRef = useRef<{ stop: () => void } | null>(null)
  const lastUserCameraRef = useRef(0)
  const elasticCameraRef = useRef<ElasticCameraState | null>(null)

  const stopElasticCamera = useCallback(() => {
    const elastic = elasticCameraRef.current
    if (elastic?.raf) cancelAnimationFrame(elastic.raf)
    elasticCameraRef.current = null
  }, [])

  /** Add user momentum to the same spring that continuously restores both
   *  scale and position. Positive impulses pull outward. */
  const pushElasticZoom = useCallback((impulse: number, baseCamera?: PixelCamera) => {
    if (!art || availableWidth === 0 || availableHeight === 0) return
    const rest = constrainCamera(
      fitCamera(availableWidth, availableHeight, art.world),
      availableWidth,
      availableHeight,
      art.background,
    )
    const minK = scenicMinK(availableWidth, availableHeight, art.background)
    const maxDisplacement = Math.max(0, Math.log(rest.k / minK))
    if (maxDisplacement < 0.001) return

    cameraAnimRef.current?.stop()
    autoFitRef.current = false
    let elastic = elasticCameraRef.current
    if (!elastic) {
      const current = baseCamera ?? cameraRef.current ?? rest
      elastic = {
        displacement: Math.max(0, Math.log(rest.k / current.k)),
        velocity: 0,
        cx: current.cx,
        cy: current.cy,
        vx: 0,
        vy: 0,
        dragging: false,
        lastTime: performance.now(),
        raf: 0,
      }
      elasticCameraRef.current = elastic
    }
    elastic.velocity += impulse

    if (elastic.raf) return
    const tick = (time: number) => {
      const state = elasticCameraRef.current
      if (!state || state !== elastic) return
      const dt = Math.min(0.032, Math.max(0.001, (time - state.lastTime) / 1000))
      state.lastTime = time

      const acceleration = -ELASTIC_CAMERA_STIFFNESS * state.displacement
        - ELASTIC_CAMERA_DAMPING * state.velocity
      state.velocity += acceleration * dt
      state.displacement += state.velocity * dt
      if (state.displacement > maxDisplacement) {
        state.displacement = maxDisplacement
        if (state.velocity > 0) state.velocity = 0
      }
      state.displacement = Math.max(-maxDisplacement * 0.055, state.displacement)

      if (state.dragging) {
        state.vx = 0
        state.vy = 0
      } else {
        const ax = -ELASTIC_CAMERA_STIFFNESS * (state.cx - rest.cx)
          - ELASTIC_CAMERA_DAMPING * state.vx
        const ay = -ELASTIC_CAMERA_STIFFNESS * (state.cy - rest.cy)
          - ELASTIC_CAMERA_DAMPING * state.vy
        state.vx += ax * dt
        state.vy += ay * dt
        state.cx += state.vx * dt
        state.cy += state.vy * dt
      }

      const next = constrainCamera({
        cx: state.cx,
        cy: state.cy,
        k: rest.k * Math.exp(-state.displacement),
      }, availableWidth, availableHeight, art.background)
      cameraRef.current = next
      setCamera(next)

      const centerDistance = Math.hypot(state.cx - rest.cx, state.cy - rest.cy)
      const centerSpeed = Math.hypot(state.vx, state.vy)
      if (
        !state.dragging &&
        Math.abs(state.displacement) < 0.0005 &&
        Math.abs(state.velocity) < 0.004 &&
        centerDistance < 0.03 &&
        centerSpeed < 0.03
      ) {
        elasticCameraRef.current = null
        cameraRef.current = rest
        setCamera(rest)
        autoFitRef.current = true
        return
      }
      state.raf = requestAnimationFrame(tick)
    }
    elastic.raf = requestAnimationFrame(tick)
  }, [art, availableWidth, availableHeight])

  // Refit before paint while the user still owns the whole-world framing.
  // Once they interact, resizing and panels preserve their focus and only
  // constrain it to the newly visible rectangle.
  useLayoutEffect(() => {
    if (!art || availableWidth === 0 || availableHeight === 0) return
    if (elasticCameraRef.current) autoFitRef.current = true
    stopElasticCamera()
    cameraAnimRef.current?.stop()
    setCamera((current) => {
      if (!current || autoFitRef.current) {
        return constrainCamera(
          fitCamera(availableWidth, availableHeight, art.world),
          availableWidth,
          availableHeight,
          art.background,
        )
      }
      return constrainCamera(current, availableWidth, availableHeight, art.background)
    })
  }, [art, availableWidth, availableHeight, stopElasticCamera])

  const handledCameraRequestRef = useRef(0)
  useEffect(() => {
    if (
      !art || !spots || !cameraRef.current || availableWidth === 0 || availableHeight === 0 ||
      cameraRequest.seq === 0 || handledCameraRequestRef.current === cameraRequest.seq
    ) return
    const container = containerRef.current
    if (!container) return
    const measuredWidth = Math.max(1, container.clientWidth - panelW - 24)
    const measuredHeight = Math.max(1, container.clientHeight - viewportTop - viewportBottom)
    // Entry and panel commits can briefly render with the previous size state.
    // Do not let a request captured against that stale box overwrite the
    // synchronous fit; the size update reruns this effect with current geometry.
    if (measuredWidth !== availableWidth || measuredHeight !== availableHeight) return
    if (cameraRequest.gentle && Date.now() - lastUserCameraRef.current < 4000) {
      handledCameraRequestRef.current = cameraRequest.seq
      return
    }

    const current = cameraRef.current
    const fitted = constrainCamera(
      fitCamera(availableWidth, availableHeight, art.world),
      availableWidth,
      availableHeight,
      art.background,
    )
    const target = cameraRequest.target
    if (target.type === 'zoomBy' && (
      elasticCameraRef.current != null || (target.factor < 1 && current.k <= fitted.k * 1.001)
    )) {
      handledCameraRequestRef.current = cameraRequest.seq
      lastUserCameraRef.current = Date.now()
      const strength = Math.log(target.factor < 1 ? 1 / target.factor : target.factor) * 5
      pushElasticZoom(target.factor < 1 ? strength : -strength, current)
      return
    }

    stopElasticCamera()
    let next: PixelCamera
    autoFitRef.current = target.type === 'fit'

    if (target.type === 'fit') {
      next = fitted
    } else if (target.type === 'zoomBy') {
      next = constrainCamera(
        {
          ...current,
          k: target.factor < 1
            ? Math.max(fitted.k, current.k * target.factor)
            : current.k * target.factor,
        },
        availableWidth,
        availableHeight,
        art.background,
      )
    } else if (target.type === 'dept') {
      const building = buildingFor(art, target.deptId)
      next = building
        ? constrainCamera(
            { cx: building.x + building.w / 2, cy: building.y + building.h / 2, k: Math.max(fitted.k, 1.6) },
            availableWidth,
            availableHeight,
            art.background,
          )
        : fitted
    } else if (target.type === 'agent') {
      const point = spots.get(target.agentId)?.pt
      next = point
        ? constrainCamera(
            { cx: point.x, cy: point.y, k: Math.max(fitted.k, 2.2) },
            availableWidth,
            availableHeight,
            art.background,
          )
        : fitted
    } else {
      const buildings = target.deptIds
        .map((deptId) => buildingFor(art, deptId))
        .filter((building): building is PixelBuilding => building != null)
      if (buildings.length === 0) {
        next = fitted
      } else {
        const left = Math.min(...buildings.map((building) => building.x))
        const top = Math.min(...buildings.map((building) => building.y))
        const right = Math.max(...buildings.map((building) => building.x + building.w))
        const bottom = Math.max(...buildings.map((building) => building.y + building.h))
        next = frameCamera(availableWidth, availableHeight, art.background, { x: left, y: top, w: right - left, h: bottom - top }, 48)
      }
    }

    handledCameraRequestRef.current = cameraRequest.seq
    cameraAnimRef.current?.stop()
    const from = current
    cameraAnimRef.current = animate(0, 1, {
      duration: cameraRequest.gentle ? 1.15 : 0.7,
      ease: cameraRequest.gentle ? [0.45, 0.05, 0.15, 1] : [0.32, 0.72, 0.12, 1],
      onUpdate: (value) => {
        const animated = constrainCamera({
          cx: from.cx + (next.cx - from.cx) * value,
          cy: from.cy + (next.cy - from.cy) * value,
          k: from.k + (next.k - from.k) * value,
        }, availableWidth, availableHeight, art.background)
        cameraRef.current = animated
        setCamera(animated)
      },
      onComplete: () => {
        cameraAnimRef.current = null
        cameraRef.current = next
        setCamera(next)
      },
    })
  }, [art, spots, panelW, availableWidth, availableHeight, cameraRequest, pushElasticZoom, stopElasticCamera])

  useEffect(() => {
    const el = viewportRef.current
    if (!el || !art) return
    const onWheel = (event: WheelEvent) => {
      if ((event.target as Element).closest('.speech-bubble-scroll')) return
      event.preventDefault()
      const current = cameraRef.current
      if (!current) return
      lastUserCameraRef.current = Date.now()
      autoFitRef.current = false
      cameraAnimRef.current?.stop()
      const modeScale = event.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? 16
        : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? availableHeight : 1
      const delta = Math.max(-180, Math.min(180, event.deltaY * modeScale))
      const rect = el.getBoundingClientRect()
      const px = event.clientX - rect.left - rect.width / 2
      const py = event.clientY - rect.top - rect.height / 2
      const worldX = current.cx + px / current.k
      const worldY = current.cy + py / current.k
      const rest = constrainCamera(
        fitCamera(availableWidth, availableHeight, art.world),
        availableWidth,
        availableHeight,
        art.background,
      )
      const requestedK = current.k * Math.exp(-delta * 0.0016)
      if (elasticCameraRef.current) {
        if (delta > 0 || requestedK < rest.k) {
          pushElasticZoom(delta * 0.007)
          return
        }
        stopElasticCamera()
      }

      if (delta > 0 && requestedK < rest.k) {
        const base = constrainCamera({
          cx: worldX - px / rest.k,
          cy: worldY - py / rest.k,
          k: rest.k,
        }, availableWidth, availableHeight, art.background)
        cameraRef.current = base
        setCamera(base)
        pushElasticZoom(Math.log(rest.k / requestedK) * 7, base)
        return
      }

      const nextK = constrainCamera(
        { ...current, k: requestedK },
        availableWidth,
        availableHeight,
        art.background,
      ).k
      const next = constrainCamera({
        cx: worldX - px / nextK,
        cy: worldY - py / nextK,
        k: nextK,
      }, availableWidth, availableHeight, art.background)
      cameraRef.current = next
      setCamera(next)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [art, availableWidth, availableHeight, pushElasticZoom, stopElasticCamera])

  useEffect(() => () => {
    cameraAnimRef.current?.stop()
    stopElasticCamera()
  }, [stopElasticCamera])

  const dragRef = useRef<{
    pointerId: number
    x: number
    y: number
    moved: number
    elastic: boolean
  } | null>(null)
  const draggedRef = useRef(false)
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    const current = cameraRef.current
    let elastic = false
    if (art && current) {
      const rest = constrainCamera(
        fitCamera(availableWidth, availableHeight, art.world),
        availableWidth,
        availableHeight,
        art.background,
      )
      if (elasticCameraRef.current || current.k <= rest.k * 1.001) {
        pushElasticZoom(0, current)
        const state = elasticCameraRef.current
        if (state) {
          state.dragging = true
          elastic = true
        }
      }
    }
    draggedRef.current = false
    dragRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      moved: 0,
      elastic,
    }
    // Keep capture on the control that received the down event. Drag events
    // still bubble to the viewport handlers, while pointerup stays associated
    // with the control the user started on.
    const target = event.target
    if (target instanceof Element) target.setPointerCapture?.(event.pointerId)
  }
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    const current = cameraRef.current
    if (!drag || drag.pointerId !== event.pointerId || !current || !art) return
    const dx = event.clientX - drag.x
    const dy = event.clientY - drag.y
    drag.moved += Math.abs(dx) + Math.abs(dy)
    if (drag.moved > 3) {
      event.preventDefault()
      draggedRef.current = true
      lastUserCameraRef.current = Date.now()
      autoFitRef.current = false
      if (drag.elastic) {
        const state = elasticCameraRef.current
        if (state) {
          const next = constrainCamera(
            { ...current, cx: state.cx - dx / current.k, cy: state.cy - dy / current.k },
            availableWidth,
            availableHeight,
            art.background,
          )
          state.cx = next.cx
          state.cy = next.cy
          cameraRef.current = next
          setCamera(next)
        }
      } else {
        cameraAnimRef.current?.stop()
        const next = constrainCamera(
          { ...current, cx: current.cx - dx / current.k, cy: current.cy - dy / current.k },
          availableWidth,
          availableHeight,
          art.background,
        )
        cameraRef.current = next
        setCamera(next)
      }
    }
    drag.x = event.clientX
    drag.y = event.clientY
  }
  const finishPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (drag?.pointerId !== event.pointerId) return
    dragRef.current = null
    if (drag.elastic && elasticCameraRef.current) elasticCameraRef.current.dragging = false
  }
  const suppressDraggedClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!draggedRef.current) return
    draggedRef.current = false
    event.preventDefault()
    event.stopPropagation()
  }

  return (
    <div
      ref={containerRef}
      className="coops-valley absolute inset-0 overflow-hidden"
      style={{ backgroundColor: 'var(--color-map-canvas)' }}
    >
      <ValleyToolbar
        world={renderWorld}
        filter={filter}
        showNames={showNames}
        inspection={inspection}
        panelWidth={panelW}
        onFilterChange={setFilter}
        onShowNamesChange={setShowNames}
      />
      {size && (
        <div
          ref={viewportRef}
          className="absolute cursor-grab touch-none overflow-hidden active:cursor-grabbing"
          style={{ left: 12, top: viewportTop, width: availableWidth, height: availableHeight }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={finishPointer}
          onPointerCancel={finishPointer}
          onClickCapture={suppressDraggedClick}
          onClick={() => useStore.getState().selectTask(null)}
        >
          {art && spots && camera && (
            <Scene
              art={art}
              world={renderWorld}
              spots={spots}
              focus={focus}
              selectedTaskId={selectedTaskId}
              highlightEventId={highlightEventId}
              presence={presence}
              renderTime={renderTime}
              camera={camera}
              viewportWidth={availableWidth}
              viewportHeight={availableHeight}
              filter={filter}
              showNames={showNames}
              onInspect={setInspection}
            />
          )}
        </div>
      )}
      {artState.status !== 'ready' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="font-mono text-[11px] tracking-wide" style={{ color: 'var(--color-map-label)' }}>
            Valley assets missing. Run node scripts/gen-pixel-art.mjs
          </p>
        </div>
      )}
    </div>
  )
}

/**
 * A fixed 960×600 stage viewed through the Valley camera. Painter order is pure
 * z-index off each element's base line (buildings y+h, villagers feet y), so
 * DOM order never decides who stands in front.
 */
function Scene({
  art, world, spots, focus, selectedTaskId, highlightEventId, presence, renderTime, camera, viewportWidth, viewportHeight, filter, showNames, onInspect,
}: {
  art: PixelArt
  world: World
  spots: Map<string, StandSpot>
  focus: { agents: Set<string>; depts: Set<string> } | null
  selectedTaskId: string | null
  highlightEventId: string | null
  presence: PresenceMark[]
  renderTime: number
  camera: PixelCamera
  viewportWidth: number
  viewportHeight: number
  filter: ValleyFilter
  showNames: boolean
  onInspect: (inspection: ValleyInspection) => void
}) {
  const { cx, cy, k } = camera
  const approvalAgentIds = useMemo(
    () => new Set(world.approvals.flatMap((approval) => approval.requestedBy?.kind === 'agent' ? [approval.requestedBy.id] : [])),
    [world.approvals],
  )
  const approvalDeptIds = useMemo(
    () => new Set(world.approvals.map((approval) => approval.deptId ?? 'operations')),
    [world.approvals],
  )
  const agentMatchesFilter = (agentId: string) => {
    if (filter === 'all') return true
    const status = world.agentStatus.get(agentId) ?? 'idle'
    if (filter === 'working') return status === 'working'
    return status === 'blocked' || approvalAgentIds.has(agentId)
  }
  const deptMatchesFilter = (deptId: string) => {
    if (filter === 'all') return true
    return approvalDeptIds.has(deptId) || world.agents.some((agent) => agent.deptId === deptId && agentMatchesFilter(agent.id))
  }
  const dimmed = (deptId?: string, agentId?: string) => {
    if (focus) {
      if (agentId) return !focus.agents.has(agentId)
      if (deptId) return !focus.depts.has(deptId)
      return true
    }
    if (agentId) return !agentMatchesFilter(agentId)
    if (deptId) return !deptMatchesFilter(deptId)
    return filter !== 'all'
  }
  const dim = (d: boolean) => ({ opacity: d ? 0.22 : 1, transition: 'opacity 0.22s' as const })

  // dept → its operator's stand point: the fallback endpoint when an event's
  // agent ref predates a replay fold or names an unknown id
  const operatorSpots = useMemo(() => {
    const m = new Map<string, { x: number; y: number }>()
    for (const ag of world.agents) {
      if (ag.kind !== 'operator') continue
      const s = spots.get(ag.id)
      if (s) m.set(ag.deptId, s.pt)
    }
    return m
  }, [world.agents, spots])

  const walkers = useMemo(
    () =>
      deriveWalkers(art, spots, operatorSpots, world.events, renderTime, selectedTaskId, highlightEventId),
    [art, spots, operatorSpots, world.events, renderTime, selectedTaskId, highlightEventId],
  )

  const acts = useMemo(() => lastActs(world.events), [world.events])

  const speech = useMemo(() => lastSpeech(world.events), [world.events])

  const guardrails = world.events.filter(
    (e) => e.type === 'GuardrailBlock' && renderTime - e.ts >= 0 && renderTime - e.ts < 2800,
  )

  const mailBadges = useMemo(() => {
    const perDept = new Map<string, number>()
    return world.approvals.map((a) => {
      const deptId = a.deptId ?? 'operations'
      const idx = perDept.get(deptId) ?? 0
      perDept.set(deptId, idx + 1)
      const b = buildingFor(art, deptId)
      const anchor = b ? mailAnchor(art, b, idx) : art.plaza
      const fromPt = a.requestedBy?.kind === 'agent' ? spots.get(a.requestedBy.id)?.pt : undefined
      return {
        a,
        anchor,
        fromPt,
        person: personById.get(a.personId),
        isDim: focus != null && a.taskId !== selectedTaskId,
      }
    })
  }, [world.approvals, art, spots, focus, selectedTaskId])

  const presenceChips = useMemo(() => {
    const idxByDept = new Map<string, number>()
    const out: { mark: PresenceMark; pt: { x: number; y: number }; person: Person }[] = []
    for (const mark of presence) {
      if (mark.where.startsWith('approval:')) continue
      const person = personById.get(mark.personId)
      const b = buildingFor(art, mark.where)
      if (!person || !b) continue
      const idx = idxByDept.get(mark.where) ?? 0
      idxByDept.set(mark.where, idx + 1)
      out.push({ mark, pt: presencePoint(art, b, idx), person })
    }
    return out
  }, [presence, art])

  return (
    <div
      className="absolute"
      style={{
        left: 0,
        top: 0,
        width: art.world.w,
        height: art.world.h,
        transformOrigin: '0 0',
        transform: `translate(${viewportWidth / 2}px, ${viewportHeight / 2}px) scale(${k}) translate(${-cx}px, ${-cy}px)`,
      }}
    >
      <img
        src={art.background.file}
        alt=""
        draggable={false}
        className="pixelated pointer-events-none absolute select-none"
        style={{
          left: art.background.x,
          top: art.background.y,
          width: art.background.w,
          height: art.background.h,
        }}
      />

      {/* ground-level ink: walked routes + mail request lines live under everything */}
      <svg className="pointer-events-none absolute inset-0" width={art.world.w} height={art.world.h} style={{ zIndex: 1 }}>
        {walkers.map((wk) =>
          wk.trailFade > 0.02 ? (
            <g key={`trail-${wk.event.id}`}>
              {/* where they're headed: faint dashed ghost of the road */}
              <path
                d={wk.routeD}
                fill="none"
                stroke={wk.color}
                strokeWidth={1.4}
                strokeDasharray="2 6"
                opacity={wk.pinned ? 0.3 : 0.13}
              />
              {/* where they've been: solid ink drawn up to the feet */}
              <path
                d={wk.routeD}
                fill="none"
                stroke={wk.color}
                strokeWidth={1.6}
                strokeLinecap="round"
                strokeDasharray={`${Math.max(0.01, wk.dist)} ${wk.routeLen + 8}`}
                opacity={0.5 * wk.trailFade}
              />
            </g>
          ) : null,
        )}
        {mailBadges.map(({ a, anchor, fromPt }) =>
          fromPt ? (
            <line
              key={`mail-line-${a.eventId}`}
              x1={fromPt.x} y1={fromPt.y} x2={anchor.x} y2={anchor.y}
              stroke="var(--color-fun-human)"
              strokeWidth={1.5}
              strokeDasharray="2 6"
              opacity={0.68}
            />
          ) : null,
        )}
        {/* road dust: kicked up behind striding feet, burst on landing */}
        {walkers.flatMap((wk) =>
          wk.puffs.map((p, i) => (
            <rect
              key={`puff-${wk.event.id}-${i}`}
              x={p.x - p.r}
              y={p.y - p.r}
              width={p.r * 2}
              height={p.r * 2}
              fill="#b39a72"
              opacity={p.o}
            />
          )),
        )}
      </svg>

      {art.buildings.map((b) => {
        const name = world.departments.get(b.deptId)?.name ?? b.deptId
        const z = Math.round(b.y + b.h)
        return (
          <div key={b.deptId} className="absolute" style={{ left: b.x, top: b.y, width: b.w, height: b.h, zIndex: z, ...dim(dimmed(b.deptId)) }}>
            <button
              type="button"
              aria-label={`Open ${name} department`}
              onClick={(event) => {
                event.stopPropagation()
                useStore.getState().openPanel('dept', b.deptId)
              }}
              onMouseEnter={() => onInspect({ kind: 'dept', id: b.deptId })}
              onMouseLeave={() => onInspect(null)}
              onFocus={() => onInspect({ kind: 'dept', id: b.deptId })}
              onBlur={() => onInspect(null)}
              className="valley-building absolute inset-0 cursor-pointer select-none"
            >
            <img
              src={b.file}
              alt=""
              draggable={false}
              className="pixelated pointer-events-none absolute inset-0 select-none transition duration-150"
              style={{ width: b.w, height: b.h }}
            />
            <span
              className="pointer-events-none absolute -translate-x-1/2 whitespace-nowrap rounded-sm border px-1.5 py-0.5 font-display text-[9px] font-medium tracking-[0.04em]"
              style={{
                // above the roofline: below the door is the operator's spot,
                // and the sprite buried every sign that hung there
                left: b.w / 2,
                top: -6,
                transform: 'translate(-50%, -100%)',
                background: art.palette.paper,
                color: art.palette.ink,
                borderColor: hexA(art.palette.outline, 0.5),
                boxShadow: `2px 2px 0 ${hexA(art.palette.outline, 0.18)}`,
              }}
            >
              {name}
            </span>
            </button>
          </div>
        )
      })}


      {/* standing villagers: home rings, emote bubbles, name chips */}
      {world.agents.map((ag) => {
        const spot = spots.get(ag.id)
        if (!spot) return null
        const { pt, hash } = spot
        const z = Math.round(pt.y)
        const url = art.avatars.variants[variantFor(ag.id, art.avatars.variants.length)]
        // operators wear their owner (= department lead) hue, like the classic home wedges
        const ownerHue = ag.kind === 'operator' ? personById.get(ag.ownerId)?.hue : undefined
        const emote = emoteFor(world.agentStatus.get(ag.id) ?? 'idle', acts.get(ag.id), renderTime, EMOTE_FRESH_MS)
        const sp = speech.get(ag.id)
        const isDim = dimmed(ag.deptId, ag.id)
        return (
          <div key={ag.id} className="group absolute" style={{ left: pt.x, top: pt.y, zIndex: z, ...dim(isDim) }}>
            {ownerHue !== undefined && (
              <div
                className="pointer-events-none absolute rounded-[50%]"
                style={{
                  left: -13,
                  top: -5,
                  width: 26,
                  height: 10,
                  border: `1.5px solid hsl(${ownerHue} 42% 38% / 0.55)`,
                  background: `hsl(${ownerHue} 58% 52% / 0.13)`,
                }}
              />
            )}
            <StatusBubble
              art={art}
              text={sp?.text}
              active={sp != null && renderTime - sp.ts < SPEECH_MS}
              emote={emote}
            />
            <div
              aria-hidden="true"
              className="valley-agent-control pointer-events-none absolute select-none"
              style={{
                left: -AGENT_CONTROL_SIZE / 2,
                top: -AGENT_CONTROL_SIZE,
                width: AGENT_CONTROL_SIZE,
                height: AGENT_CONTROL_SIZE,
              }}
            >
              <span
                className="sprite-bob pixelated pointer-events-none absolute"
                style={{
                  left: (AGENT_CONTROL_SIZE - CELL_PX) / 2,
                  top: AGENT_CONTROL_SIZE - CELL_PX,
                  width: CELL_PX,
                  height: CELL_PX,
                  backgroundImage: `url(${url})`,
                  backgroundSize: `${art.avatars.frameOrder.length * CELL_PX}px ${CELL_PX}px`,
                  animationDelay: `${-(hash % 1100)}ms`,
                  ...BOB_VARS,
                }}
              />
            </div>
            <div
              className={`valley-agent-name pointer-events-none absolute -translate-x-1/2 whitespace-nowrap rounded-sm border px-1 text-[8px] leading-snug ${showNames || focus?.agents.has(ag.id) ? 'valley-agent-name-pinned' : ''}`}
              style={{
                left: 0,
                top: 2,
                background: art.palette.paper,
                color: art.palette.ink,
                borderColor: hexA(art.palette.outline, 0.45),
                boxShadow: `1px 1px 0 ${hexA(art.palette.outline, 0.15)}`,
              }}
            >
              {shortName(ag.name)}
            </div>
          </div>
        )
      })}

      {/* walkers carry cross-department tasks; z follows their feet so they
          pass correctly in front of and behind buildings en route */}
      {walkers.map((wk) => {
        if (wk.opacity <= 0.02) return null
        const bobVars = {
          '--bob-from': `${-wk.frameCol * CELL_PX}px`,
          '--bob-to': `${-(wk.frameCol + 1) * CELL_PX}px`,
        } as CSSProperties
        // the envelope dimming rule: pinned walks (selected task / highlight)
        // stay full strength, everything else recedes under focus
        const walkerDim = focus != null && !wk.pinned
        return (
          <Fragment key={`walk-${wk.event.id}`}>
            <div
              className="pointer-events-none absolute rounded-[50%]"
              style={{
                left: wk.x - 11,
                top: wk.y - 4,
                width: 22,
                height: 8,
                zIndex: wk.z,
                border: `1.5px solid ${wk.color}`,
                background: `color-mix(in srgb, ${wk.color} 16%, transparent)`,
                opacity: wk.opacity,
              }}
            />
            <button
              type="button"
              aria-label={wk.event.taskId ? `Focus ${world.tasks.get(wk.event.taskId)?.title ?? 'traveling task'}` : 'Inspect traveling work'}
              onClick={(e) => {
                e.stopPropagation()
                const st = useStore.getState()
                if (wk.event.taskId) st.selectTask(wk.event.taskId)
                st.setHighlight(wk.event.id)
              }}
              className="absolute cursor-pointer select-none"
              style={{
                left: wk.x - CELL_PX / 2,
                top: wk.y - CELL_PX,
                width: CELL_PX,
                height: CELL_PX,
                zIndex: wk.z,
                transformOrigin: '50% 100%',
                transform: `scale(${wk.scale})${wk.flipX ? ' scaleX(-1)' : ''}`,
                opacity: wk.opacity * (walkerDim ? 0.15 : 1),
              }}
            >
              {/* inner strip carries the frames so the step-hop transform
                  never fights the runner's scale/flip */}
              <div
                className="sprite-walk pixelated absolute inset-0"
                style={{
                  backgroundImage: `url(${wk.variantUrl})`,
                  backgroundSize: `${art.avatars.frameOrder.length * CELL_PX}px ${CELL_PX}px`,
                  // static column keeps reduced-motion (animation off) on the contact pose
                  backgroundPositionX: `${-wk.frameCol * CELL_PX}px`,
                  animationDelay: `${-(wk.hash % 380)}ms`,
                  animationDuration: `${wk.stepMs}ms`,
                  ...bobVars,
                }}
              />
            </button>
          </Fragment>
        )
      })}

      {/* guardrail beats: the blocked emote bursts at the gateway plaque */}
      {guardrails.map((e) => (
        <div
          key={e.id}
          className="pointer-events-none absolute"
          style={{ left: art.plaza.x, top: art.plaza.y, zIndex: Math.round(art.plaza.y) + 1 }}
        >
          <div
            className="absolute rounded-[50%]"
            style={{
              left: -16,
              top: -16,
              width: 32,
              height: 32,
              border: '2px solid var(--color-fun-guard)',
              animation: 'gatewayflash 2.6s ease-out both',
            }}
          />
          <img
            src={art.emotes.files.escalated}
            alt=""
            draggable={false}
            className="pixelated absolute select-none"
            style={{ left: -EMOTE_PX / 2, top: -EMOTE_PX / 2 - 22, width: EMOTE_PX, height: EMOTE_PX }}
          />
        </div>
      ))}

      {/* approvals → sealed mail waiting by the department door */}
      {mailBadges.map(({ a, anchor, person, isDim }) => (
        <button
          type="button"
          aria-label={`Open approval for ${person?.name ?? 'assigned person'}`}
          key={a.eventId}
          onClick={(e) => {
            e.stopPropagation()
            useStore.getState().openPanel('approvals')
          }}
          className="absolute cursor-pointer"
          style={{ left: anchor.x, top: anchor.y, zIndex: Math.round(anchor.y), ...dim(isDim) }}
        >
          <img
            src={art.mail.file}
            alt=""
            draggable={false}
            className="pixelated pointer-events-none absolute select-none"
            style={{ left: -EMOTE_PX / 2, top: -EMOTE_PX, width: EMOTE_PX, height: EMOTE_PX }}
          />
          <div
            className="pointer-events-none absolute -translate-x-1/2 whitespace-nowrap rounded-sm border px-1 font-mono text-[8px] leading-snug"
            style={{
              left: 0,
              top: 3,
              background: `hsl(${person?.hue ?? 40} 52% 87%)`,
              color: '#1d1c17',
              borderColor: hexA(art.palette.outline, 0.45),
            }}
          >
            {person?.initials ?? '?'}
          </div>
        </button>
      ))}

      {/* multiplayer presence: colleagues browsing departments */}
      {presenceChips.map(({ mark, pt, person }) => (
        <div
          key={`${mark.personId}-${mark.where}`}
          title={`${person.name}, viewing ${world.departments.get(mark.where)?.name ?? mark.where}`}
          className="pointer-events-auto absolute cursor-default"
          style={{ left: pt.x, top: pt.y, zIndex: Math.round(pt.y), ...dim(dimmed(mark.where)) }}
        >
          <div
            className="absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border px-1 font-mono text-[7.5px] leading-tight"
            style={{
              background: `hsl(${person.hue} 52% 87%)`,
              color: '#1d1c17',
              borderColor: hexA(art.palette.outline, 0.4),
            }}
          >
            {person.initials}
          </div>
        </div>
      ))}

      {/* Agent controls live in a separate interaction layer. The painted
          building stack can legitimately cover a villager's feet, but it
          must not steal the villager's chat-room target. */}
      {world.agents.map((ag) => {
        const spot = spots.get(ag.id)
        if (!spot) return null
        const label = `Open ${ag.name}, ${world.agentStatus.get(ag.id) ?? 'idle'} ${world.departments.get(ag.deptId)?.name ?? ag.deptId} agent`
        return (
          <button
            key={`agent-control-${ag.id}`}
            type="button"
            aria-label={label}
            onClick={(event) => {
              event.stopPropagation()
              useStore.getState().openPanel('agent', ag.id)
            }}
            onMouseEnter={() => onInspect({ kind: 'agent', id: ag.id })}
            onMouseLeave={() => onInspect(null)}
            onFocus={() => onInspect({ kind: 'agent', id: ag.id })}
            onBlur={() => onInspect(null)}
            className="valley-agent-control absolute cursor-pointer select-none border-0 bg-transparent p-0"
            style={{
              left: spot.pt.x - AGENT_CONTROL_SIZE / 2,
              top: spot.pt.y - AGENT_CONTROL_SIZE,
              width: AGENT_CONTROL_SIZE,
              height: AGENT_CONTROL_SIZE,
              zIndex: 2000,
              ...dim(dimmed(ag.deptId, ag.id)),
            }}
          />
        )
      })}
    </div>
  )
}
