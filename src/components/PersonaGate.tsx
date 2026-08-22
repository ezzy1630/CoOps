import { motion } from 'framer-motion'
import { useStore } from '../store'
import { PERSONAS, personById } from '../data/company'
import { Wordmark } from '../App'
import { Pill } from './ui'

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
      <div className="flex shrink-0 items-center justify-between border-b border-line/80 bg-surface/35 px-5 py-3 backdrop-blur-[2px]">
        <motion.div {...rise(0)}>
          <Wordmark size={25} />
        </motion.div>
        <motion.div {...rise(0.04)} className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-dim">
          <span className="size-1.5 rounded-full bg-ok" />
          <span>Live workspace</span>
        </motion.div>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-5 py-8">
        <div className="w-full max-w-4xl border border-linebright/80 bg-surface/90 shadow-[0_1px_2px_rgb(23_22_15/0.05),0_12px_32px_rgb(23_22_15/0.08)] dark:bg-raised/95">
          <div className="border-b border-line px-5 py-4 md:px-6">
            <motion.div {...rise(0.08)} className="font-mono text-[10px] uppercase tracking-[0.14em] text-dim">
              Workspace setup
            </motion.div>
            <motion.h1 {...rise(0.12)} className="mt-2 text-[22px] font-semibold tracking-tight md:text-2xl">
              Choose your workspace
            </motion.h1>
            <motion.p {...rise(0.16)} className="mt-2 max-w-2xl text-[13px] leading-relaxed text-mut">
              Everpeak Outfitters runs on six persistent department agents. Choose a person to see the live map from their point of view.
            </motion.p>
          </div>

          <div className="px-5 py-4 md:px-6">
            <motion.div {...rise(0.22)} className="font-mono text-[10px] uppercase tracking-[0.14em] text-dim">
              Enter as
            </motion.div>

            <div className="mt-2 grid grid-cols-1 gap-px border border-line bg-line md:grid-cols-3">
              {PERSONAS.map((p, i) => {
                const person = personById.get(p.personId)
                if (!person) return null
                return (
                  <motion.button
                    key={p.personId}
                    {...rise(0.28 + i * 0.08)}
                    onClick={() => useStore.getState().enter(p.personId)}
                    className="group relative flex min-h-36 cursor-pointer flex-col bg-surface p-3.5 text-left transition-colors hover:bg-hover dark:bg-raised dark:hover:bg-hover"
                  >
                    {p.personId === DEMO_PERSONA && (
                      // `border-human` sorts before `border-line`, so it has to shout to repaint the Pill
                      <Pill className="absolute top-2 right-2 border-human/50! text-human">
                        Demo routes an approval to you
                      </Pill>
                    )}
                    <span
                      className="flex size-9 items-center justify-center rounded-full text-[12px] font-bold text-abyss"
                      style={{ background: `hsl(${person.hue} 52% 87%)` }}
                    >
                      {person.initials}
                    </span>
                    <span className="mt-3 flex items-center gap-2">
                      <span
                        aria-hidden
                        className="h-3.5 w-0.5 shrink-0 rounded-full"
                        style={{ background: `hsl(${person.hue} 56% 52%)` }}
                      />
                      <span className="truncate text-[13px] font-semibold tracking-tight transition-colors group-hover:text-task">
                        {person.name}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-[12px] text-mut">{p.label}</span>
                    <span className="mt-2 block text-[11.5px] leading-relaxed text-dim">{p.description}</span>
                  </motion.button>
                )
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3 font-mono text-[10px] text-dim md:px-6">
            <motion.p {...rise(0.56)} className="flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-ok" />
              <span className="uppercase tracking-[0.14em]">Live</span>
              <span>the map is running right now</span>
            </motion.p>
            <motion.p {...rise(0.64)} className="tracking-[0.06em]">
              fictional people, no login
            </motion.p>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
