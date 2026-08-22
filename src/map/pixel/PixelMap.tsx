import { Fragment, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { useStore } from '../../store'
import { deptById, personById } from '../../data/company'
import type { AgentDef } from '../../types'
import { usePixelArt, type PixelArt } from './art'
import { fitK, SPRITE_SCALE, standPointFor, variantFor, type StandSpot } from './layout'

const CELL = 16 // avatar cell in the strip, manifest avatars.cell
const CELL_PX = CELL * SPRITE_SCALE

// every villager idles between the same two strip columns (down0 ↔ down1)
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

export default function PixelMap() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 1200, h: 800 })
  const artState = usePixelArt()
  const world = useStore((s) => s.world)

  // measure like CompanyMap: the stage fits whatever box actually exists
  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  const spots = useMemo(
    () => (artState.status === 'ready' ? standPointFor(artState.art, world.agents) : null),
    [artState, world.agents],
  )

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-hidden"
      style={{ backgroundColor: 'var(--color-map-canvas)' }}
      onClick={() => useStore.getState().selectTask(null)}
    >
      {artState.status === 'ready' && spots && (
        <Scene
          art={artState.art}
          agents={world.agents}
          spots={spots}
          k={fitK(size.w, size.h, artState.art.world)}
        />
      )}
      {artState.status !== 'ready' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="font-mono text-[11px] tracking-wide" style={{ color: 'var(--color-map-label)' }}>
            Valley assets missing — run node scripts/gen-pixel-art.mjs
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
  art, agents, spots, k,
}: {
  art: PixelArt
  agents: AgentDef[]
  spots: Map<string, StandSpot>
  k: number
}) {
  return (
    <div
      className="absolute left-1/2 top-1/2"
      style={{ width: art.world.w, height: art.world.h, transform: `translate(-50%, -50%) scale(${k})` }}
    >
      <img
        src={art.background}
        alt=""
        draggable={false}
        className="pixelated pointer-events-none absolute inset-0 select-none"
        style={{ width: art.world.w, height: art.world.h }}
      />

      {art.buildings.map((b) => {
        const name = deptById.get(b.deptId)?.name ?? b.deptId
        const z = Math.round(b.y + b.h)
        return (
          <Fragment key={b.deptId}>
            <img
              src={b.file}
              alt={name}
              draggable={false}
              onClick={(e) => {
                e.stopPropagation()
                useStore.getState().openPanel('dept', b.deptId)
              }}
              className="pixelated absolute cursor-pointer select-none transition duration-150 hover:brightness-110"
              style={{ left: b.x, top: b.y, width: b.w, height: b.h, zIndex: z }}
            />
            <div
              className="pointer-events-none absolute -translate-x-1/2 whitespace-nowrap rounded-sm border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em]"
              style={{
                left: b.x + b.w / 2,
                top: b.y + b.h + 2,
                zIndex: z,
                background: art.palette.paper,
                color: art.palette.ink,
                borderColor: hexA(art.palette.outline, 0.5),
                boxShadow: `2px 2px 0 ${hexA(art.palette.outline, 0.18)}`,
              }}
            >
              {name}
            </div>
          </Fragment>
        )
      })}

      {/* the plaza inscription, as a wooden plaque pinned at the manifest point */}
      <div
        className="pointer-events-none absolute flex flex-col items-center rounded-sm border-2 px-3 py-1.5"
        style={{
          left: art.plaza.x,
          top: art.plaza.y,
          transform: 'translate(-50%, -50%)',
          zIndex: Math.round(art.plaza.y),
          background: art.palette.paper,
          color: art.palette.ink,
          borderColor: art.palette.outline,
          boxShadow: `4px 4px 0 ${hexA(art.palette.outline, 0.22)}`,
        }}
      >
        <span className="font-mono text-[11px] font-semibold tracking-[0.18em]">AGENT GATEWAY</span>
        <span className="mt-0.5 font-mono text-[7.5px] tracking-[0.24em] opacity-70">NO ROOT AGENT</span>
      </div>

      {agents.map((ag) => {
        const spot = spots.get(ag.id)
        if (!spot) return null
        const { pt, hash } = spot
        const z = Math.round(pt.y)
        const url = art.avatars.variants[variantFor(ag.id, art.avatars.variants.length)]
        // operators wear their owner (= department lead) hue, like the classic home wedges
        const ownerHue = ag.kind === 'operator' ? personById.get(ag.ownerId)?.hue : undefined
        return (
          <Fragment key={ag.id}>
            {ownerHue !== undefined && (
              <div
                className="pointer-events-none absolute rounded-[50%]"
                style={{
                  left: pt.x,
                  top: pt.y,
                  width: 46,
                  height: 18,
                  transform: 'translate(-50%, -50%)',
                  zIndex: z - 1,
                  border: `2px solid hsl(${ownerHue} 42% 38% / 0.55)`,
                  background: `hsl(${ownerHue} 58% 52% / 0.13)`,
                }}
              />
            )}
            <div
              onClick={(e) => {
                e.stopPropagation()
                useStore.getState().openPanel('agent', ag.id)
              }}
              className="sprite-bob pixelated absolute cursor-pointer select-none"
              style={{
                left: pt.x,
                top: pt.y,
                width: CELL_PX,
                height: CELL_PX,
                marginLeft: -CELL_PX / 2,
                marginTop: -CELL_PX,
                zIndex: z,
                backgroundImage: `url(${url})`,
                backgroundSize: `${art.avatars.frameOrder.length * CELL_PX}px ${CELL_PX}px`,
                animationDelay: `${-(hash % 1100)}ms`,
                ...BOB_VARS,
              }}
            />
            <div
              className="pointer-events-none absolute -translate-x-1/2 whitespace-nowrap rounded-sm border px-1 text-[8.5px] leading-snug"
              style={{
                left: pt.x,
                top: pt.y + 3,
                zIndex: z,
                background: art.palette.paper,
                color: art.palette.ink,
                borderColor: hexA(art.palette.outline, 0.45),
                boxShadow: `1px 1px 0 ${hexA(art.palette.outline, 0.15)}`,
              }}
            >
              {shortName(ag.name)}
            </div>
          </Fragment>
        )
      })}
    </div>
  )
}
