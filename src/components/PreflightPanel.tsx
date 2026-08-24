import { X } from '@phosphor-icons/react'
import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '../store'
import { fetchGateReport } from '../live'
import type { GateId, GateResult, GateStatus, GateVerdict } from '../types'
import { cx, fmtClock } from '../utils'

const GATE_LABEL: Record<GateId, string> = {
  'local-file': 'Local file discovery',
  'cloud-handoff': 'Cloud Storage staging',
  authority: 'Named approval control',
  publication: 'YouTube publication',
}

const GATE_ORDER: GateId[] = ['local-file', 'cloud-handoff', 'authority', 'publication']

const STATUS_SYMBOL: Record<GateStatus, string> = {
  pass: '✓',
  ready: '~',
  fail: '✗',
}

const STATUS_COLOR: Record<GateStatus, string> = {
  pass: 'var(--color-ok)',
  ready: 'var(--color-permission)',
  fail: 'var(--color-escalation)',
}

const STATUS_LABEL: Record<GateStatus, string> = {
  pass: 'pass',
  ready: 'ready',
  fail: 'fail',
}

const VERDICT_COLOR: Record<GateVerdict, string> = {
  go: 'var(--color-ok)',
  hold: 'var(--color-permission)',
  'no-go': 'var(--color-escalation)',
}

const VERDICT_LABEL: Record<GateVerdict, string> = {
  go: 'All four gates are proven. The launch story may be recorded.',
  hold: 'Nothing is broken, but a step has not yet been proven by a live run.',
  'no-go': 'Do not record the full launch story: one or more gates are blocked.',
}

/** The four Go/No-Go gates as decided by the running server, never by reading config. */
export default function PreflightPanel({ onClose }: { onClose: () => void }) {
  const report = useStore((s) => s.preflightReport)
  const executionMode = useStore((s) => s.executionMode)

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        ev.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/25 p-6" onClick={onClose}>
      <div className="panel anim-fadeup flex max-h-[86vh] w-[600px] flex-col overflow-hidden" onClick={(ev) => ev.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
          <span className="font-mono text-[10px] tracking-wider text-dim uppercase">Go / No-Go gates</span>
          <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">
            {report ? VERDICT_LABEL[report.verdict] : 'Fetching the gates from the server…'}
          </span>
          <button
            type="button"
            className="cursor-pointer rounded-sm px-1.5 py-0.5 text-[10.5px] text-dim hover:bg-hover hover:text-ink"
            onClick={() => {
              if (executionMode === 'live') void fetchGateReport().then((r) => {
                if (r) useStore.setState({ preflightReport: r })
              })
            }}
            title="Re-check the gates against the live server"
          >
            refresh
          </button>
          <button className="rounded-sm px-1 py-0.5 text-dim hover:bg-hover hover:text-ink" title="Close" onClick={onClose}>
            <X size={14} />
          </button>
        </div>

        {!report ? (
          <Placeholder />
        ) : (
          <>
            <GateVerdictBanner report={report} />
            <div className="min-h-0 flex-1 overflow-y-auto">
              {GATE_ORDER.map((id) => {
                const gate = report.gates.find((g) => g.id === id)
                if (!gate) return null
                return <GateRow key={gate.id} gate={gate} />
              })}
            </div>
            <div className="border-t border-line px-3 py-2 font-mono text-[10.5px] text-dim">
              Checked {fmtClock(new Date(report.checkedAt).getTime())} · query &ldquo;{report.query}&rdquo; · every gate is decided by executing, not by reading config
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}

function GateVerdictBanner({ report }: { report: { verdict: GateVerdict } }) {
  return (
    <section
      aria-label="Gate verdict"
      className="border-b border-line bg-raised/30 px-3 py-2.5"
      style={{ borderLeft: `2px solid ${VERDICT_COLOR[report.verdict]}` }}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-[12.5px] font-medium" style={{ color: VERDICT_COLOR[report.verdict] }}>
          {report.verdict === 'go' ? 'GO' : report.verdict === 'hold' ? 'HOLD' : 'NO-GO'}
        </span>
        <span className="text-[11.5px] text-dim">
          {VERDICT_LABEL[report.verdict]}
        </span>
      </div>
    </section>
  )
}

function GateRow({ gate }: { gate: GateResult }) {
  const color = STATUS_COLOR[gate.status]
  const keys = Object.keys(gate.evidence)
  return (
    <section
      className={cx(
        'border-b border-line/60 px-3 py-2.5 last:border-b-0',
        gate.status === 'fail' && 'bg-escalation/5',
      )}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span
          className="font-mono text-[14px] leading-none font-bold"
          style={{ color }}
        >
          {STATUS_SYMBOL[gate.status]}
        </span>
        <h3 className="text-[13px] font-medium text-ink">{gate.claim}</h3>
        <span
          className="shrink-0 rounded-sm px-1.5 py-0.5 text-[10px] font-medium"
          style={{
            color,
            background: `${color}15`,
          }}
        >
          {STATUS_LABEL[gate.status]}
        </span>
        <span className="font-mono text-[10px] text-dim">
          {GATE_LABEL[gate.id]}
        </span>
      </div>
      <p className="mt-1.5 text-[11.5px] leading-relaxed text-mut">{gate.detail}</p>
      {keys.length > 0 && (
        <dl className="mt-2 grid grid-cols-[minmax(0,170px)_minmax(0,1fr)] gap-x-3 gap-y-1">
          {keys.map((key) => (
            <div key={key} className="contents">
              <dt className="truncate text-[11.5px] text-mut">{key}</dt>
              <dd
                className="truncate font-mono text-[11px] text-ink"
                title={gate.evidence[key]}
              >
                {gate.evidence[key]}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {gate.note && (
        <p className="mt-2 border-l-2 border-permission pl-2 text-[11px] leading-relaxed text-permission">
          {gate.note}
        </p>
      )}
    </section>
  )
}

function Placeholder() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-3 py-16 text-center">
      <span className="flex size-10 items-center justify-center border border-line bg-raised font-mono text-[13px] text-dim" aria-hidden>
        ?
      </span>
      <div className="mt-3.5 text-[14px] font-medium text-ink">No preflight report yet</div>
      <div className="mt-1 max-w-xs text-[12px] leading-relaxed text-dim">
        The gates are decided by the running server. Start the server and refresh.
      </div>
    </div>
  )
}