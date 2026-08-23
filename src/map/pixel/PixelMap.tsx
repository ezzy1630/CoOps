import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { PANEL_WIDTH, useStore, type PresenceMark } from '../../store'
import { BASE_AGENTS, DEPARTMENTS, personById } from '../../data/company'
import { buildWorld, taskParticipants } from '../../engine/reducer'
import { virtualAt } from '../../engine/replay'
import type { Person, World } from '../../types'
import { usePixelArt, type EmoteName, type PixelArt } from './art'
import {
  buildingFor,
  fitK,
  mailAnchor,
  presencePoint,
  SPRITE_SCALE,
  standPointFor,
  variantFor,
  type StandSpot,
} from './layout'
import { deriveWalkers, emoteFor, lastActs, lastSpeech, walkerWindowMs } from './choreography'
const CELL = 24 // avatar cell in the strip, manifest avatars.cell
const CELL_PX = CELL * SPRITE_SCALE
// bubbles and letters draw at native 1:1 scale for uniform pixel consistency
const EMOTE_PX = 16
/** an emote shows while its act is fresh, then the village calms down */
const EMOTE_FRESH_MS = 6000
/** a spoken line hangs over its speaker briefly, then the emote returns */
const SPEECH_MS = 6000

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
  const [size, setSize] = useState({ w: 1200, h: 800 })
  const [now, setNow] = useState(() => Date.now())
  const artState = usePixelArt()
  const world = useStore((s) => s.world)
  const log = useStore((s) => s.log)
  const replay = useStore((s) => s.replay)
  const selectedTaskId = useStore((s) => s.selectedTaskId)
  const highlightEventId = useStore((s) => s.highlightEventId)
  const panel = useStore((s) => s.panel)
  const presence = useStore((s) => s.presence)

  // measure like CompanyMap: the stage fits whatever box actually exists
  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
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
    () => (replay ? buildWorld(BASE_AGENTS, DEPARTMENTS, log, renderTime) : world),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [replay ? replayBucket : world, log, replay?.taskId],
  )

  const spots = useMemo(
    () => (artState.status === 'ready' ? standPointFor(artState.art, renderWorld.agents) : null),
    [artState, renderWorld.agents],
  )

  const focus = useMemo(
    () => (selectedTaskId ? taskParticipants(renderWorld, selectedTaskId) : null),
    [renderWorld, selectedTaskId],
  )

  // a side panel covers part of the viewport; fit and center in what remains
  const panelW = panel ? PANEL_WIDTH[panel.kind] : 0

  return (
    <div
      ref={containerRef}
      className="coops-valley absolute inset-0 overflow-hidden"
      style={{ backgroundColor: 'var(--color-map-canvas)' }}
      onClick={() => useStore.getState().selectTask(null)}
    >
      {artState.status === 'ready' && spots && (
        <Scene
          art={artState.art}
          world={renderWorld}
          spots={spots}
          focus={focus}
          selectedTaskId={selectedTaskId}
          highlightEventId={highlightEventId}
          presence={presence}
          renderTime={renderTime}
          k={fitK(size.w - panelW, size.h, artState.art.world)}
          centerX={(size.w - panelW) / 2}
        />
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
 * A fixed 960×600 stage, uniformly scaled to fit. Painter order is pure
 * z-index off each element's base line (buildings y+h, villagers feet y), so
 * DOM order never decides who stands in front.
 */
function Scene({
  art, world, spots, focus, selectedTaskId, highlightEventId, presence, renderTime, k, centerX,
}: {
  art: PixelArt
  world: World
  spots: Map<string, StandSpot>
  focus: { agents: Set<string>; depts: Set<string> } | null
  selectedTaskId: string | null
  highlightEventId: string | null
  presence: PresenceMark[]
  renderTime: number
  k: number
  centerX: number
}) {
  const dimmed = (deptId?: string, agentId?: string) => {
    if (!focus) return false
    if (agentId) return !focus.agents.has(agentId)
    if (deptId) return !focus.depts.has(deptId)
    return true
  }
  const dim = (d: boolean) => ({ opacity: d ? 0.15 : 1, transition: 'opacity 0.35s' as const })

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
      className="absolute top-1/2"
      style={{ left: centerX, width: art.world.w, height: art.world.h, transform: `translate(-50%, -50%) scale(${k})` }}
    >
      <img
        src={art.background}
        alt=""
        draggable={false}
        className="pixelated pointer-events-none absolute inset-0 select-none"
        style={{ width: art.world.w, height: art.world.h }}
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
            <img
              src={b.file}
              alt={name}
              draggable={false}
              onClick={(e) => {
                e.stopPropagation()
                useStore.getState().openPanel('dept', b.deptId)
              }}
              className="pixelated absolute inset-0 cursor-pointer select-none transition duration-150 hover:brightness-110"
              style={{ width: b.w, height: b.h }}
            />
            <div
              className="pointer-events-none absolute -translate-x-1/2 whitespace-nowrap rounded-sm border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em]"
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
            </div>
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
          <div key={ag.id} className="absolute" style={{ left: pt.x, top: pt.y, zIndex: z, ...dim(isDim) }}>
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
              onClick={(e) => {
                e.stopPropagation()
                useStore.getState().openPanel('agent', ag.id)
              }}
              className="sprite-bob pixelated absolute cursor-pointer select-none"
              style={{
                left: -CELL_PX / 2,
                top: -CELL_PX,
                width: CELL_PX,
                height: CELL_PX,
                backgroundImage: `url(${url})`,
                backgroundSize: `${art.avatars.frameOrder.length * CELL_PX}px ${CELL_PX}px`,
                animationDelay: `${-(hash % 1100)}ms`,
                ...BOB_VARS,
              }}
            />
            <div
              className="pointer-events-none absolute -translate-x-1/2 whitespace-nowrap rounded-sm border px-1 text-[8px] leading-snug"
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
            <div
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
            </div>
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
        <div
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
        </div>
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
    </div>
  )
}
