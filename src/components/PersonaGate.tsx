import type { CSSProperties } from 'react'
import { motion } from 'framer-motion'
import { useStore } from '../store'
import { PERSONAS, personById } from '../data/company'
import { Wordmark } from '../App'

const AMBIENT: CSSProperties = {
  backgroundImage:
    'radial-gradient(circle at 1px 1px, rgb(29 28 23 / 0.08) 1px, transparent 0)',
  backgroundSize: '30px 30px',
}

const rise = (delay: number) => ({
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.45, delay, ease: 'easeOut' as const },
})

/** Role-aware entry: pick who you are, and the company arranges itself around you. */
export default function PersonaGate() {
  return (
    <div className="relative flex h-full flex-col items-center justify-center overflow-hidden bg-bg" style={AMBIENT}>
      <div className="absolute top-4 left-4">
        <Wordmark size={20} />
      </div>

      <motion.div {...rise(0)} className="flex flex-col items-center">
        <Wordmark size={40} />
      </motion.div>

      <motion.h1
        {...rise(0.08)}
        className="mt-7 max-w-3xl text-center text-3xl font-semibold tracking-tight md:text-4xl"
      >
        Every department gets its own agent team.
      </motion.h1>

      <motion.p {...rise(0.16)} className="mt-4 max-w-xl text-center text-[14px] leading-relaxed text-mut">
        This is Everpeak Outfitters — six departments, each run by a persistent agent that hires workers,
        trades tasks with its peers, and knows exactly which human can unblock it. Choose who you are;
        the company adapts.
      </motion.p>

      <div className="mt-10 flex items-stretch gap-3.5">
        {PERSONAS.map((p, i) => {
          const person = personById.get(p.personId)
          if (!person) return null
          return (
            <motion.button
              key={p.personId}
              {...rise(0.26 + i * 0.08)}
              onClick={() => useStore.getState().enter(p.personId)}
              className="group w-64 cursor-pointer rounded-xl border border-line bg-surface/95 p-4 text-left shadow-[0_1px_2px_rgb(23_22_15/0.05),0_8px_24px_rgb(23_22_15/0.06)] transition-all hover:-translate-y-0.5 hover:border-task/50 hover:bg-raised/95"
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

      <motion.p {...rise(0.56)} className="absolute bottom-6 max-w-lg text-center text-[11px] text-dim">
        A live simulated company runs behind this demo — the map is real, the people are fictional,
        no login needed.
      </motion.p>
    </div>
  )
}
