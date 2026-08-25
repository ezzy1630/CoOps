import {
  Broadcast,
  CaretDown,
  Check,
  Copy,
  Flask,
  Warning,
} from '@phosphor-icons/react'
import { useEffect, useRef, useState } from 'react'
import { backendUrl } from '../live'
import { useStore } from '../store'
import { cx } from '../utils'

const label = (value: string): string => value
  .split('-')
  .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
  .join(' ')

const modelLabel = (model: string | null): string =>
  model === 'gemini-3.7-flash' ? 'Gemini 3.7 Flash' : model ?? 'Not applicable'

export default function RuntimeStatus({ quiet = false }: { quiet?: boolean }) {
  const mode = useStore((state) => state.executionMode)
  const connection = useStore((state) => state.liveConnection)
  const runtime = useStore((state) => state.runtimeInfo)
  const runtimeError = useStore((state) => state.runtimeError)
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', escape)
    }
  }, [open])

  const live = mode === 'live'
  const stateLabel = live
    ? connection === 'connected'
      ? 'LIVE'
      : connection === 'connecting' || connection === 'idle'
        ? 'CONNECTING'
        : 'OFFLINE'
    : 'REHEARSAL'
  const detail = live
    ? connection === 'connected'
      ? runtime
        ? runtime.brain === 'gemini'
          ? modelLabel(runtime.model)
          : 'Mock brain'
        : 'Runtime details unavailable'
      : connection === 'disconnected'
        ? 'Backend unavailable'
        : 'Opening event stream'
    : 'Deterministic local scenario'
  const tone = !live
    ? 'bg-permission shadow-[0_0_8px_rgba(245,158,11,0.5)]'
    : connection === 'connected'
      ? 'bg-ok shadow-[0_0_8px_rgba(34,197,94,0.6)]'
      : connection === 'disconnected'
        ? 'bg-escalation shadow-[0_0_8px_rgba(239,68,68,0.5)]'
        : 'bg-task shadow-[0_0_8px_rgba(59,130,246,0.5)]'

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
        className={cx(
          'flex h-7 cursor-pointer items-center gap-2 rounded-full border border-line bg-surface px-2.5 text-left text-xs transition-all hover:border-linebright hover:bg-hover active:scale-[0.98]',
          quiet && 'border-transparent bg-transparent',
          open && 'border-linebright bg-raised shadow-xs',
        )}
      >
        <span className="relative flex size-2 items-center justify-center">
          {connection === 'connected' && <span className="absolute inline-flex size-full rounded-full bg-ok opacity-75 beacon-pulse" />}
          <span className={cx('size-1.5 shrink-0 rounded-full', tone)} aria-hidden />
        </span>
        <span className="font-mono text-[10px] font-bold tracking-[0.06em] text-ink">{stateLabel}</span>
        <span className="hidden max-w-36 truncate text-[11px] text-dim xl:block">{detail}</span>
        <CaretDown size={10} className={cx('text-dim transition-transform duration-200', open && 'rotate-180')} />
      </button>

      {open && (
        <section
          role="dialog"
          aria-label="Runtime details"
          className="anim-fadeup absolute right-0 top-[calc(100%+8px)] z-50 w-[360px] overflow-hidden rounded-2xl border border-linebright bg-surface/95 backdrop-blur-md shadow-2xl"
        >
          <div className="flex items-start justify-between border-b border-line px-4 py-3 bg-raised/30">
            <div>
              <div className="text-[13px] font-semibold text-ink">Execution Runtime</div>
              <p className="mt-0.5 text-[11px] leading-relaxed text-dim">Inspect what is actually running before you trust the output.</p>
            </div>
            {live ? <Broadcast size={16} className="mt-0.5 text-task" /> : <Flask size={16} className="mt-0.5 text-permission" />}
          </div>

          {!live ? (
            <div className="m-3 rounded-xl border border-permission/30 bg-permission/5 p-3">
              <div className="text-[12px] font-semibold text-ink flex items-center gap-1.5">
                <Flask size={13} className="text-permission" />
                <span>Local Demo Rehearsal</span>
              </div>
              <p className="mt-1 text-[11.5px] leading-relaxed text-mut">The browser runs an interactive launch scenario demonstrating multi-department event flow. No API keys required.</p>
            </div>
          ) : connection !== 'connected' ? (
            <div className="m-3 rounded-xl border border-escalation/30 bg-escalation/5 p-3">
              <div className="flex items-center gap-2 text-[12px] font-semibold text-ink">
                <Warning size={14} className="text-escalation" />
                {connection === 'disconnected' ? 'Live backend offline' : 'Connecting to backend'}
              </div>
              <p className="mt-1 text-[11.5px] leading-relaxed text-mut">
                {runtimeError ?? `Waiting for ${backendUrl()}.`}
              </p>
            </div>
          ) : runtime ? (
            <dl className="divide-y divide-line px-4 py-1">
              <RuntimeRow term="Provider" value={runtime.brain === 'gemini' ? 'Gemini' : 'Mock fixture'} />
              <RuntimeRow term="Model" value={modelLabel(runtime.model)} />
              <RuntimeRow term="Memory" value={label(runtime.memory)} />
              <RuntimeRow term="Guardrail" value={label(runtime.guardrail)} />
              <RuntimeRow term="Workspace" value={label(runtime.workspace)} />
              <RuntimeRow term="A2A Protocol" value={label(runtime.a2a)} />
              <RuntimeRow term="Revision" value={runtime.revision} mono />
              <RuntimeRow term="Run ID" value={runtime.runId} mono />
            </dl>
          ) : runtimeError ? (
            <div className="m-3 rounded-xl border border-escalation/30 bg-escalation/5 p-3">
              <div className="text-[12px] font-semibold text-ink">Runtime details unavailable</div>
              <p className="mt-1 text-[11.5px] leading-relaxed text-mut">{runtimeError}</p>
            </div>
          ) : (
            <div className="px-4 py-4 text-[11px] text-mut">Reading runtime details...</div>
          )}
        </section>
      )}
    </div>
  )
}

function RuntimeRow({ term, value, mono = false }: { term: string; value: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-3 py-2 text-[11px]">
      <dt className="text-dim">{term}</dt>
      <dd className={cx('truncate text-right text-ink font-medium', mono && 'font-mono text-[10px] text-dim')} title={value}>{value}</dd>
    </div>
  )
}
