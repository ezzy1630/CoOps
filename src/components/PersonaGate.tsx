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
      className="absolute inset-0 z-40 flex flex-col items-center justify-center overflow-hidden"
      style={{ background: VEIL }}
    >
      <motion.div {...rise(0)} className="flex flex-col items-center">
        <Wordmark size={44} />
      </motion.div>

      <motion.h1
        {...rise(0.08)}
        className="mt-7 max-w-3xl text-center text-3xl font-semibold tracking-tight md:text-4xl"
      >
        The live map of a company that runs on agents.
      </motion.h1>

      <motion.p {...rise(0.16)} className="mt-4 max-w-xl text-center text-[14px] leading-relaxed text-mut">
        Six departments of Everpeak Outfitters, each run by a persistent agent that hires workers,
        trades tasks with its peers, and knows exactly which human can unblock it.
        Choose who you are — the company arranges itself around you.
      </motion.p>

      <motion.div {...rise(0.26)} className="mt-9 font-mono text-[10px] uppercase tracking-[0.14em] text-dim">
        Enter as
      </motion.div>

      <div className="mt-3 flex items-stretch gap-3.5">
        {PERSONAS.map((p, i) => {
          const person = personById.get(p.personId)
          if (!person) return null
          return (
            <motion.button
              key={p.personId}
              {...rise(0.32 + i * 0.08)}
              onClick={() => useStore.getState().enter(p.personId)}
              className="group relative w-64 cursor-pointer rounded-xl border border-linebright bg-surface p-4 dark:bg-raised text-left shadow-[0_1px_2px_rgb(23_22_15/0.05),0_8px_24px_rgb(23_22_15/0.06)] transition-all hover:-translate-y-0.5 hover:border-task/50 hover:bg-raised"
            >
              {p.personId === DEMO_PERSONA && (
                // `border-human` sorts before `border-line`, so it has to shout to repaint the Pill
                <Pill className="absolute -top-2 right-3 border-human/50! text-human">
                  Demo routes an approval to you
                </Pill>
              )}
              <span
                className="flex size-12 items-center justify-center rounded-full text-[13px] font-bold text-abyss"
                style={{ background: `hsl(${person.hue} 52% 87%)` }}
              >
                {person.initials}
              </span>
              <span className="mt-3.5 block text-[15px] font-semibold tracking-tight transition-colors group-hover:text-task">
                {person.name}
              </span>
              <span className="mt-0.5 block text-[13px] text-mut">{p.label}</span>
              <span className="mt-2.5 block text-[12px] leading-relaxed text-dim">{p.description}</span>
            </motion.button>
          )
        })}
      </div>

      <motion.p
        {...rise(0.6)}
        className="mt-6 flex items-center gap-2 font-mono text-[11px] text-mut"
      >
        <span className="size-1.5 rounded-full bg-ok anim-breathe" />
        <span className="uppercase tracking-[0.14em]">Live</span>
        <span>— the map behind this screen is running right now</span>
      </motion.p>

      <motion.p
        {...rise(0.68)}
        className="absolute bottom-6 font-mono text-[10px] tracking-[0.06em] text-dim"
      >
        fictional people, no login
      </motion.p>
    </motion.div>
  )
}
