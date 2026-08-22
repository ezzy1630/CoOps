import { AnimatePresence, motion } from 'framer-motion'
import { useStore } from '../store'
import { cx } from '../utils'

interface Step {
  kicker: string
  title: string
  body: string
}

const STEPS: Step[] = [
  {
    kicker: 'ZOOM TO EXPLORE',
    title: 'The map is the company',
    body:
      'Scroll to zoom, drag to pan. Far out you see departments; closer, their agents; closer still, live tasks traveling between them. The center is empty on purpose — there is no root agent.',
  },
  {
    kicker: 'CLICK TO FOCUS',
    title: 'Every task lights its path',
    body:
      "Click an agent, an edge, or a traveling envelope. The map dims to that task's path — and when work is blocked, a dotted line points to the one named human who can unblock it. Finished tasks replay end-to-end in seconds.",
  },
  {
    kicker: '⌘K TO JUMP',
    title: 'You are never lost',
    body:
      'The command palette reaches any agent, task, person, department, or approval from anywhere. The breadcrumb up top always says where you are.',
  },
]

/** Three steps of navigation literacy, shown once per browser. */
export default function FirstRun() {
  const step = useStore((s) => s.firstRunStep)
  if (step === null) return null

  const i = Math.max(0, Math.min(step, STEPS.length - 1))
  const current = STEPS[i]
  const last = i === STEPS.length - 1
  const setStep = (n: number | null) => useStore.getState().setFirstRunStep(n)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-ink/20" />

      <div className="panel relative w-[440px] p-6">
        <div className="min-h-[168px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
            >
              <div className="font-mono text-[10px] tracking-wider text-task uppercase">{current.kicker}</div>
              <h2 className="mt-2.5 text-[20px] font-semibold tracking-tight">{current.title}</h2>
              <p className="mt-2.5 text-[13px] leading-relaxed text-mut">{current.body}</p>
            </motion.div>
          </AnimatePresence>
        </div>

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
          <button className="btn btn-primary h-8" onClick={() => setStep(last ? null : i + 1)}>
            {last ? 'Start exploring' : 'Next'}
          </button>
        </div>

        <div className="mt-4 border-t border-line pt-3 text-center">
          <button className="text-[11px] text-dim transition-colors hover:text-mut" onClick={() => setStep(null)}>
            Skip tour
          </button>
        </div>
      </div>
    </div>
  )
}
