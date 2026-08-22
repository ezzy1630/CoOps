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
 * Veil density, not decoration: the same paper token at 85% behind the text
 * column, falling to 55% at the edges so the live map still moves peripherally.
 */
const VEIL =
  'radial-gradient(ellipse 78% 68% at 50% 46%,' +
  ' color-mix(in srgb, var(--color-bg) 85%, transparent) 0%,' +
  ' color-mix(in srgb, var(--color-bg) 85%, transparent) 34%,' +
  ' color-mix(in srgb, var(--color-bg) 74%, transparent) 66%,' +
  ' color-mix(in srgb, var(--color-bg) 55%, transparent) 100%)'

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
        <motion.div {...rise(0.04)} className="flex items-center gap-2 text-[10px] text-dim">
          <span className="size-1.5 rounded-full bg-ok" />
          <span>Company is live</span>
        </motion.div>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-5 py-8">
        <div className="w-full max-w-2xl border border-linebright/80 bg-surface/95 shadow-[0_12px_32px_rgb(23_22_15/0.08)] dark:bg-raised/95">
          <div className="border-b border-line px-5 py-5 md:px-6">
            <motion.h1 {...rise(0.08)} className="text-[20px] font-semibold tracking-[-0.025em]">
              Enter Everpeak Outfitters
            </motion.h1>
            <motion.p {...rise(0.12)} className="mt-1.5 max-w-xl text-[12px] leading-relaxed text-mut">
              Choose whose authority and department you want to work from. The company keeps running underneath.
            </motion.p>
          </div>

          <div className="px-5 py-3 md:px-6">
            <div className="divide-y divide-line border-y border-line">
              {PERSONAS.map((p, i) => {
                const person = personById.get(p.personId)
                if (!person) return null
                return (
                  <motion.button
                    key={p.personId}
                    {...rise(0.18 + i * 0.06)}
                    onClick={() => useStore.getState().enter(p.personId)}
                    className="group grid w-full cursor-pointer grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 px-2 py-3 text-left transition-colors hover:bg-hover"
                  >
                    <span
                      className="flex size-8 items-center justify-center border border-linebright text-[9px] font-semibold text-ink"
                    >
                      {person.initials}
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-2">
                        <span aria-hidden className="h-3 w-px shrink-0" style={{ background: `hsl(${person.hue} 56% 52%)` }} />
                        <span className="truncate text-[13px] font-medium text-ink">{person.name}</span>
                        <span className="text-[11px] text-dim">{p.label}</span>
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-mut">{p.description.replace(' — ', ', ')}</span>
                    </span>
                    <span className={p.personId === DEMO_PERSONA ? 'text-[10px] text-human' : 'text-[14px] text-dim'}>
                      {p.personId === DEMO_PERSONA ? 'Approval route' : '→'}
                    </span>
                  </motion.button>
                )
              })}
            </div>
          </div>

          <motion.p {...rise(0.42)} className="px-6 pb-4 text-[10px] text-dim">Demo workspace. No login required.</motion.p>
        </div>
      </div>
    </motion.div>
  )
}
