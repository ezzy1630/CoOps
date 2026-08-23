import {
  ArrowClockwise,
  Broadcast,
  CaretDown,
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
    : 'Scripted local dataset'
  const tone = !live
    ? 'bg-permission'
    : connection === 'connected'
      ? 'bg-ok'
      : connection === 'disconnected'
        ? 'bg-escalation'
        : 'bg-task'

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
        className={cx(
          'flex h-7 items-center gap-2 border border-line px-2 text-left transition-colors hover:border-linebright hover:bg-raised',
          quiet && 'border-transparent bg-transparent',
        )}
      >
        <span className={cx('size-1.5 shrink-0', tone)} aria-hidden />
        <span className="font-mono text-[9.5px] font-medium tracking-[0.08em] text-ink">{stateLabel}</span>
        <span className="hidden max-w-36 truncate text-[10.5px] text-dim xl:block">{detail}</span>
        <CaretDown size={10} className={cx('text-dim transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <section
          role="dialog"
          aria-label="Runtime details"
          className="absolute right-0 top-[calc(100%+7px)] z-50 w-[356px] border border-linebright bg-surface shadow-[0_12px_40px_rgb(0_0_0/0.18)]"
        >
          <div className="flex items-start justify-between border-b border-line px-4 py-3">
            <div>
              <div className="text-[13px] font-semibold text-ink">Execution runtime</div>
              <p className="mt-0.5 text-[11px] leading-relaxed text-dim">Inspect what is actually running before you trust the output.</p>
            </div>
            {live ? <Broadcast size={16} className="mt-0.5 text-task" /> : <Flask size={16} className="mt-0.5 text-permission" />}
          </div>

          <div className="grid grid-cols-2 border-b border-line p-1" role="group" aria-label="Execution mode">
            <ModeButton active={live} onClick={() => useStore.getState().switchExecutionMode('live')}>Live</ModeButton>
            <ModeButton active={!live} onClick={() => useStore.getState().switchExecutionMode('rehearsal')}>Rehearsal</ModeButton>
          </div>

          {!live ? (
            <div className="border-l-2 border-permission px-4 py-3">
              <div className="text-[12px] font-medium text-ink">Labeled scripted data</div>
              <p className="mt-1 text-[11px] leading-relaxed text-mut">The browser runs a deterministic launch scenario. It does not call the backend, Gemini, or external systems.</p>
            </div>
          ) : connection !== 'connected' ? (
            <div className="border-l-2 border-escalation px-4 py-3">
              <div className="flex items-center gap-2 text-[12px] font-medium text-ink">
                <Warning size={14} className="text-escalation" />
                {connection === 'disconnected' ? 'Live backend unavailable' : 'Connecting to live backend'}
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-mut">
                {runtimeError ?? `Waiting for ${backendUrl()}. No scripted events will be substituted.`}
              </p>
              <div className="mt-3 flex gap-2">
                <button type="button" className="btn h-7 px-2 text-[11px]" onClick={() => useStore.getState().retryLive()}>
                  <ArrowClockwise size={12} weight="bold" /> Retry
                </button>
                <button type="button" className="btn h-7 px-2 text-[11px]" onClick={() => useStore.getState().switchExecutionMode('rehearsal')}>
                  Open rehearsal
                </button>
              </div>
            </div>
          ) : runtime ? (
            <dl className="divide-y divide-line px-4 py-1">
              <RuntimeRow term="Brain" value={runtime.brain === 'gemini' ? 'Gemini' : 'Mock fixture'} />
              <RuntimeRow term="Model" value={modelLabel(runtime.model)} />
              <RuntimeRow term="Memory" value={label(runtime.memory)} />
              <RuntimeRow term="Guardrail" value={label(runtime.guardrail)} />
              <RuntimeRow term="Workspace" value={label(runtime.workspace)} />
              <RuntimeRow term="A2A" value={label(runtime.a2a)} />
              <RuntimeRow term="Revision" value={runtime.revision} mono />
              <RuntimeRow term="Run ID" value={runtime.runId} mono />
            </dl>
          ) : runtimeError ? (
            <div className="border-l-2 border-escalation px-4 py-3">
              <div className="text-[12px] font-medium text-ink">Runtime details unavailable</div>
              <p className="mt-1 text-[11px] leading-relaxed text-mut">{runtimeError}</p>
              <button type="button" className="btn mt-3 h-7 px-2 text-[11px]" onClick={() => useStore.getState().retryLive()}>
                <ArrowClockwise size={12} weight="bold" /> Retry
              </button>
            </div>
          ) : (
            <div className="px-4 py-4 text-[11px] text-mut">Reading runtime details...</div>
          )}
        </section>
      )}
    </div>
  )
}

function ModeButton({ active, children, onClick }: { active: boolean; children: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cx(
        'h-7 text-[11px] transition-colors',
        active ? 'bg-raised font-medium text-ink' : 'text-mut hover:bg-hover hover:text-ink',
      )}
    >
      {children}
    </button>
  )
}

function RuntimeRow({ term, value, mono = false }: { term: string; value: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 py-2 text-[11px]">
      <dt className="text-dim">{term}</dt>
      <dd className={cx('truncate text-right text-ink', mono && 'font-mono text-[10px]')} title={value}>{value}</dd>
    </div>
  )
}
