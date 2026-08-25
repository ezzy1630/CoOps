import { useEffect, useState, type CSSProperties } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { PANEL_WIDTH, useStore } from '../store'
import { cx } from '../utils'
import { NAV_RAIL_WIDTH } from './NavRail'
import { HEADER_H } from './Header'

interface Step {
  kicker: string
  title: string
  body: string
}

const STEPS: Step[] = [
  {
    kicker: 'Zoom to explore',
    title: 'The map is the company',
    body:
      'Scroll to zoom, drag to pan. Far out you see departments; closer, their agents; closer still, live tasks traveling between them. The center is open because work routes peer-to-peer.',
  },
  {
    kicker: 'Click to focus',
    title: 'Every task lights its path',
    body:
      "Click an agent, an edge, or a traveling envelope. The map dims to that task's path. When work is blocked, a line points to the person who can unblock it.",
  },
  {
    kicker: '⌘K to jump',
    title: 'Quick navigation',
    body:
      'The command palette reaches any agent, task, person, department, or approval from anywhere. The breadcrumb at the top always indicates where you are.',
  },
]

const CARD_W = 380

const VALLEY_STEP_0 = {
  kicker: 'Zoom to explore',
  body:
    'Scroll to zoom and drag to pan inside the valley. Click buildings and villagers to inspect their work; walkers carry tasks between departments.',
}


interface Anchor {
  card: CSSProperties
  /** hairline leader from the card toward what the step is talking about */
  leader: { x1: number; y1: number; x2: number; y2: number }
  /** target marker: a ring on the map, or a hairline box around a piece of chrome */
  mark:
    | { kind: 'ring'; x: number; y: number; r: number; dashed?: boolean }
    | { kind: 'box'; x: number; y: number; w: number; h: number }
}

/** Static, screen-relative anchors: each card sits beside its subject, never on top of it. */
function anchorFor(step: number, w: number, h: number, panelW: number): Anchor {
  const mapH = h - HEADER_H
  // the map the reader can actually see — a panel may be covering the right edge
  const cx = NAV_RAIL_WIDTH + (w - NAV_RAIL_WIDTH - panelW) / 2
  const cy = HEADER_H + mapH / 2

  // keep every target clear of the card that points at it, and inside the visible map
  const clear = (x: number, cardLeft: number, pad: number) =>
    Math.min(Math.max(x, cardLeft + CARD_W + pad), w - panelW - 40)

  if (step === 0) {
    // the empty center of the ring
    const left = NAV_RAIL_WIDTH + 24
    const ringR = Math.round(Math.min(46, mapH * 0.07))
    const tx = clear(cx, left, 70 + ringR)
    return {
      card: { left, top: cy, transform: 'translateY(-50%)' },
      leader: { x1: left + CARD_W + 14, y1: cy, x2: tx - ringR - 10, y2: cy },
      mark: { kind: 'ring', x: tx, y: cy, r: ringR, dashed: true },
    }
  }

  if (step === 1) {
    // edges and traveling envelopes, out toward the lower mid-ring
    const left = NAV_RAIL_WIDTH + 104
    const bottom = 40
    const ty = cy + Math.min(mapH * 0.24, 240)
    const tx = clear(cx + 28, left, 90)
    return {
      card: { left, bottom },
      leader: { x1: left + CARD_W + 14, y1: h - bottom - 58, x2: tx - 4, y2: ty + 10 },
      mark: { kind: 'ring', x: tx, y: ty, r: 6 },
    }
  }

  // Anchor to the real Commands ⌘K button in the header (top-right).
  // Measure it once per step change; fall back to a sensible estimate.
  const left = Math.max(NAV_RAIL_WIDTH + 24, w - 24 - CARD_W)
  const top = HEADER_H + 36
  const btn = document.querySelector('button[aria-label="Open command palette"]')
  const r = btn?.getBoundingClientRect()
  const box = r
    ? { x: r.x, y: r.y, w: r.width, h: r.height }
    : { x: w - 220, y: 8, w: 160, h: 26 }
  return {
    card: { left, top },
    leader: { x1: left + CARD_W - 180, y1: top - 8, x2: box.x + box.w / 2, y2: box.y + box.h + 2 },
    mark: { kind: 'box', ...box },
  }
}

/** Three steps of navigation literacy, shown once per browser. */
export default function FirstRun() {
  const step = useStore((s) => s.firstRunStep)
  const panel = useStore((s) => s.panel)
  const mapStyle = useStore((s) => s.mapStyle)
  const [vp, setVp] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }))

  useEffect(() => {
    const onResize = () => setVp({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  if (step === null) return null

  const i = Math.max(0, Math.min(step, STEPS.length - 1))
  const current =
    i === 0 && mapStyle === 'fun' ? { ...STEPS[0], ...VALLEY_STEP_0 } : STEPS[i]
  const last = i === STEPS.length - 1
  const setStep = (n: number | null) => useStore.getState().setFirstRunStep(n)
  const { card, leader, mark } = anchorFor(i, vp.w, vp.h, panel ? PANEL_WIDTH[panel.kind] : 0)

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-ink/12" />

      {/* hairline leader: the card points at what it is describing */}
      <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
        <g stroke="var(--color-task)" strokeOpacity="0.65" strokeWidth="1" fill="none">
          <line {...leader} />
          {mark.kind === 'ring' ? (
            <circle
              cx={mark.x}
              cy={mark.y}
              r={mark.r}
              strokeDasharray={mark.dashed ? '3.4 3.1' : undefined}
            />
          ) : (
            <rect x={mark.x} y={mark.y} width={mark.w} height={mark.h} rx="8" />
          )}
        </g>
        <circle cx={leader.x1} cy={leader.y1} r="2" fill="var(--color-task)" fillOpacity="0.65" />
      </svg>

      <div className="panel absolute p-6" style={{ ...card, width: CARD_W }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
          >
            <div className="font-mono text-[10px] tracking-wider text-task uppercase">{current.kicker}</div>
            <h2 className="mt-2.5 text-[22px] leading-tight font-semibold tracking-[-0.02em]">{current.title}</h2>
            <p className="mt-2.5 text-[13.5px] leading-relaxed text-mut">{current.body}</p>
          </motion.div>
        </AnimatePresence>

        <div className="mt-5 flex items-center gap-2">
          {STEPS.map((_, n) => (
            <span
              key={n}
              className={cx(
                'size-1.5 rounded-full transition-colors',
                n === i ? 'bg-task' : 'bg-linebright',
              )}
            />
          ))}

          <div className="flex-1" />

          {i > 0 && (
            <button
              className="cursor-pointer rounded-lg px-3 py-1.5 text-[13px] font-medium text-mut transition-colors hover:bg-hover hover:text-ink"
              onClick={() => setStep(i - 1)}
            >
              Back
            </button>
          )}
          <button className="btn btn-primary h-8 rounded-lg px-4" onClick={() => setStep(last ? null : i + 1)}>
            {last ? 'Start exploring' : 'Next'}
          </button>
        </div>

        <div className="mt-4 border-t border-line pt-3 text-center">
          <button className="text-[11.5px] text-dim transition-colors hover:text-mut" onClick={() => setStep(null)}>
            Skip tour
          </button>
        </div>
      </div>
    </div>
  )
}
