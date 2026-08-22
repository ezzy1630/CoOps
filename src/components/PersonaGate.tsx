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
 * Title sequence: the live company map runs underneath; this is a translucent
 * paper veil above it. Pick who you are, and the veil lifts.
 */
export default function PersonaGate() {
  return (
    <motion.div
      initial={false}
      exit={{ opacity: 0, transition: { duration: 0.5, ease: 'easeOut' } }}
      className="absolute inset-0 z-40 flex flex-col items-center justify-center overflow-hidden bg-bg/80"
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
              className="group w-64 cursor-pointer rounded-xl border border-linebright bg-surface p-4 dark:bg-raised text-left shadow-[0_1px_2px_rgb(23_22_15/0.05),0_8px_24px_rgb(23_22_15/0.06)] transition-all hover:-translate-y-0.5 hover:border-task/50 hover:bg-raised"
            >
              <span
                className="flex size-12 items-center justify-center rounded-full text-[13px] font-bold"
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
        className="absolute bottom-6 flex items-center gap-2 font-mono text-[10px] text-mut"
      >
        <span className="size-1.5 rounded-full bg-ok anim-breathe" />
        <span className="uppercase tracking-[0.14em]">Live</span>
        <span>— the map behind this screen is running right now · fictional people, no login</span>
      </motion.p>
    </motion.div>
  )
}
