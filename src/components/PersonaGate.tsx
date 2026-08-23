import { ArrowRight } from '@phosphor-icons/react'
import { motion } from 'framer-motion'
import { useStore } from '../store'
import { PERSONAS, personById } from '../data/company'
import { Wordmark } from '../App'

const rise = (delay: number) => ({
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.45, delay, ease: 'easeOut' as const },
})

/**
 * Veil density, not decoration: paper pooled behind the left text column so
 * the type sits on near-solid ground while the live map still moves at the
 * right edge of the frame.
 */
const VEIL =
  'radial-gradient(ellipse 62% 78% at 30% 50%,' +
  ' color-mix(in srgb, var(--color-bg) 92%, transparent) 0%,' +
  ' color-mix(in srgb, var(--color-bg) 90%, transparent) 38%,' +
  ' color-mix(in srgb, var(--color-bg) 72%, transparent) 68%,' +
  ' color-mix(in srgb, var(--color-bg) 42%, transparent) 100%)'

/** The persona whose route through the demo lands an approval in the viewer's lap. */
const DEMO_PERSONA = 'dana'

/**
 * Title sequence: the live company map runs underneath; this is a translucent
 * paper veil above it. Pick who you are, and the veil lifts.
 */
export default function PersonaGate() {
  return (
    <motion.div
      initial={false}
      exit={{ opacity: 0, transition: { duration: 0.5, ease: 'easeOut' } }}
      className="absolute inset-0 z-40 flex flex-col overflow-hidden"
      style={{ background: VEIL }}
    >
      <div className="flex h-[42px] shrink-0 items-center justify-between border-b border-line/80 bg-surface/35 px-4 backdrop-blur-[2px]">
        <motion.div {...rise(0)}>
          <Wordmark size={25} />
        </motion.div>
        <motion.div {...rise(0.04)} className="flex items-center gap-2 text-[11px] text-dim">
          <span className="size-1.5 rounded-full bg-ok" />
          <span>Company is live</span>
        </motion.div>
      </div>

      {/* Editorial column: asymmetric whitespace right, the running map visible there */}
      <div className="flex min-h-0 flex-1 items-center overflow-y-auto">
        <div className="w-full max-w-[600px] shrink-0 py-10 pl-[8vw] pr-6">
          <motion.h1 {...rise(0.08)} className="text-[34px] leading-[1.08] font-semibold tracking-[-0.03em]">
            Enter Everpeak Outfitters
          </motion.h1>
          <motion.p {...rise(0.12)} className="mt-3 max-w-[46ch] text-[14px] leading-relaxed text-mut">
            Choose whose authority and department you want to work from. The company keeps running underneath.
          </motion.p>

          <div className="mt-9 border-t border-linebright/80">
            {PERSONAS.map((p, i) => {
              const person = personById.get(p.personId)
              if (!person) return null
              return (
                <motion.button
                  key={p.personId}
                  {...rise(0.2 + i * 0.06)}
                  onClick={() => useStore.getState().enter(p.personId)}
                  className="group grid w-full cursor-pointer grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3 border-b border-line px-3 py-3.5 text-left transition-colors hover:bg-hover/70 focus:bg-hover/70 focus:outline-none"
                >
                  <span className="flex size-9 items-center justify-center border border-linebright bg-surface/80 text-[10px] font-semibold text-ink">
                    {person.initials}
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-baseline gap-2">
                      <span aria-hidden className="h-3.5 w-px shrink-0 self-center" style={{ background: `hsl(${person.hue} 56% 52%)` }} />
                      <span className="truncate text-[15px] font-medium tracking-[-0.01em] text-ink">{person.name}</span>
                      <span className="truncate text-[12px] text-dim">{p.label}</span>
                    </span>
                    <span className="mt-1 block truncate text-[12px] leading-snug text-mut">{p.description.replace(' — ', ', ')}</span>
                  </span>
                  <span className={p.personId === DEMO_PERSONA
                    ? 'inline-flex items-center gap-1 text-[11px] font-medium text-human'
                    : 'text-dim transition-transform group-hover:translate-x-0.5'}>
                    {p.personId === DEMO_PERSONA ? <>Approval route <ArrowRight size={12} weight="bold" /></> : <ArrowRight size={14} />}
                  </span>
                </motion.button>
              )
            })}
          </div>
        </div>
      </div>
    </motion.div>
  )
}
