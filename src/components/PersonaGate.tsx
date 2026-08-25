import { ArrowClockwise, ArrowRight, Broadcast, Flask, Play, Warning } from '@phosphor-icons/react'
import { motion } from 'framer-motion'
import { useStore } from '../store'
import { getPersonas, personById } from '../data/company'
import { rehearsals } from '../engine/rehearsals'
import { Wordmark } from '../App'
import RuntimeStatus from './RuntimeStatus'
import type { RuntimeInfo } from '../types'

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

/** The live persona whose route lands directly on approvals. */
const APPROVER_PERSONA = 'dana'

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
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-line/80 bg-surface/40 px-4 backdrop-blur-md">
        <motion.div {...rise(0)}>
          <Wordmark size={24} />
        </motion.div>
        <motion.div {...rise(0.04)}><RuntimeStatus quiet /></motion.div>
      </div>

      {/* Editorial column: asymmetric whitespace right, the running map visible there */}
      <div className="flex min-h-0 flex-1 items-center overflow-y-auto">
        <div className="w-full max-w-[640px] shrink-0 py-10 pl-[8vw] pr-6">
          <motion.div {...rise(0.06)} className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/70 px-3 py-1 text-[11px] font-medium text-mut shadow-xs mb-3">
            <span className="size-1.5 rounded-full bg-task animate-pulse" />
            <span>Interactive Company Model</span>
          </motion.div>
          
          <motion.h1 {...rise(0.08)} className="text-[34px] md:text-[38px] leading-[1.08] font-bold tracking-tight text-ink">
            Every department gets an autonomous agent team.
          </motion.h1>
          <motion.p {...rise(0.12)} className="mt-3.5 max-w-[48ch] text-[14px] leading-relaxed text-mut font-normal">
            Choose a perspective to explore how agents collaborate across departments, handle real business tasks, and pause for human approval.
          </motion.p>

          <motion.div {...rise(0.16)} className="mt-5 max-w-[520px]">
            <RuntimeEntryNotice />
          </motion.div>

          <div className="mt-6 space-y-2.5">
            {getPersonas().map((p, i) => {
              const person = personById.get(p.personId)
              if (!person) return null
              return (
                <motion.button
                  key={p.personId}
                  {...rise(0.2 + i * 0.06)}
                  onClick={() => useStore.getState().enterLive(p.personId)}
                  className="group grid w-full cursor-pointer grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3.5 rounded-xl border border-line bg-surface p-3.5 text-left transition-all hover:border-linebright hover:bg-hover/60 hover:shadow-sm active:scale-[0.99] focus:outline-none"
                >
                  <span
                    className="flex size-10 items-center justify-center rounded-xl bg-raised border border-line font-mono text-[12px] font-bold text-ink shadow-xs transition-transform group-hover:scale-105"
                  >
                    {person.initials}
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-baseline gap-2">
                      <span className="truncate text-[14.5px] font-bold tracking-tight text-ink group-hover:text-task transition-colors">{person.name}</span>
                      <span className="truncate text-[11.5px] font-medium text-dim">{p.label}</span>
                    </span>
                    <span className="mt-0.5 block text-[12px] leading-snug text-mut line-clamp-2">{p.description.replace(' — ', ', ')}</span>
                  </span>
                  <span className={p.personId === APPROVER_PERSONA
                    ? 'inline-flex items-center gap-1 rounded-md border border-human/30 bg-human/10 px-2.5 py-1 text-[11px] font-semibold text-human shadow-xs'
                    : 'text-dim transition-transform group-hover:translate-x-1'}>
                    {p.personId === APPROVER_PERSONA ? <>Approval route <ArrowRight size={12} weight="bold" /></> : <ArrowRight size={15} />}
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

function RuntimeEntryNotice() {
  const mode = useStore((state) => state.executionMode)
  const connection = useStore((state) => state.liveConnection)
  const runtime = useStore((state) => state.runtimeInfo)
  const rehearsalAction = rehearsals.length > 0 && (
    <button
      type="button"
      className="btn btn-primary h-7 rounded-full px-3 text-[11px]"
      onClick={() => useStore.getState().openRehearsal()}
    >
      <Play size={10} weight="fill" /> Run rehearsal
    </button>
  )

  if (mode === 'rehearsal') {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-permission/30 bg-permission/5 p-3">
        <Flask size={16} className="mt-0.5 shrink-0 text-permission" />
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-semibold text-ink">Rehearsal mode</div>
          <p className="mt-0.5 text-[11.5px] leading-relaxed text-mut">Every scripted event is labeled. No backend, model, or external system is used.</p>
          {rehearsalAction && <div className="mt-2">{rehearsalAction}</div>}
        </div>
      </div>
    )
  }

  if (connection === 'connected') {
    const brain = runtime ? runtimeBrainLabel(runtime) : 'a backend whose provider details are still loading'
    return (
      <div className="flex items-start gap-3 rounded-xl border border-ok/30 bg-ok/5 p-3">
        <Broadcast size={16} className="mt-0.5 shrink-0 text-ok" />
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-semibold text-ink">Live backend connected</div>
          <p className="mt-0.5 text-[11.5px] leading-relaxed text-mut">This run is using {brain}. Open the runtime inspector for provider and revision details.</p>
          {rehearsalAction && <div className="mt-2">{rehearsalAction}</div>}
        </div>
      </div>
    )
  }

  if (connection === 'disconnected') {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-escalation/30 bg-escalation/5 p-3">
        <Warning size={16} className="mt-0.5 shrink-0 text-escalation" />
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-semibold text-ink">Live backend unavailable</div>
          <p className="mt-0.5 text-[11.5px] leading-relaxed text-mut">CoOps will not substitute scripted activity. Retry the connection or enter the explicit rehearsal.</p>
          <div className="mt-2 flex gap-2">
            <button type="button" className="btn h-7 rounded-full px-3 text-[11px]" onClick={() => useStore.getState().retryLive()}>
              <ArrowClockwise size={12} weight="bold" /> Retry
            </button>
            {rehearsalAction}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-3 rounded-xl border border-task/30 bg-task/5 p-3">
      <Broadcast size={16} className="mt-0.5 shrink-0 text-task" />
      <div className="min-w-0 flex-1">
        <p className="text-[11.5px] leading-relaxed text-mut">Connecting to the live backend. No scripted events are running.</p>
        {rehearsalAction && <div className="mt-2">{rehearsalAction}</div>}
      </div>
    </div>
  )
}

function runtimeBrainLabel(runtime: RuntimeInfo): string {
  if (runtime.brain === 'mock') return 'the backend mock fixture'
  if (runtime.model === 'gemini-3.7-flash') return 'Gemini 3.7 Flash'
  return runtime.model ?? 'Gemini'
}
