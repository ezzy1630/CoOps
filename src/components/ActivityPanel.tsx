import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '../store'
import { DEPARTMENTS, deptById } from '../data/company'
import { cx, fmtClock, fmtDay, fmtDuration, fmtUsd } from '../utils'
import { Chip, Pill, typeLabel } from './ui'
import type { EventType, WorldEvent } from '../types'

/** Live + historical run feed for the whole company. */
export default function ActivityPanel() {
  const log = useStore((s) => s.log)
  const world = useStore((s) => s.world)
  const highlightEventId = useStore((s) => s.highlightEventId)
  const [dept, setDept] = useState<string>('all')
  const [group, setGroup] = useState<string>('all')
  const [traceTaskId, setTraceTaskId] = useState<string | null>(null)

  const midnight = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d.getTime()
  }, [])

  const tasks = [...world.tasks.values()]
  const active = tasks.filter((t) => t.status !== 'done' && t.status !== 'failed').length
  const blocked = tasks.filter((t) => t.status === 'waiting_auth' || t.status === 'waiting_approval').length
  const today = log.filter((e) => e.ts >= midnight)
  const spend = today.reduce((sum, e) => sum + (e.payload?.costUsd ?? 0), 0)

  const types = TYPE_FILTERS.find((f) => f.key === group)?.types ?? null
  const rows = log
    .filter((e) => e.type !== 'Chat')
    .filter((e) => (dept === 'all' ? true : e.deptFrom === dept || e.deptTo === dept))
    .filter((e) => (types === null ? true : types.includes(e.type)))
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 150)

  return (
    <div className="flex h-full min-w-0 flex-col overflow-y-auto overscroll-contain bg-surface">
      <div className="mx-auto flex w-full max-w-[1600px] min-w-0 flex-1 flex-col px-5 py-6 lg:px-8 lg:py-7">
        <header className="flex shrink-0 items-end justify-between gap-4 border-b border-line pb-5">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-dim">System record</div>
            <h2 className="mt-1.5 text-[21px] font-semibold tracking-[-0.02em]">Activity</h2>
            <p className="mt-1.5 text-[12px] text-dim">A running account of work, handoffs, and decisions across Everpeak.</p>
          </div>
          <span className="hidden shrink-0 font-mono text-[10px] uppercase tracking-wider text-dim sm:block">{rows.length} shown</span>
        </header>

        <div className="mt-5 grid shrink-0 grid-cols-2 gap-px border border-line bg-line sm:grid-cols-4">
          <Stat label="Active tasks" value={String(active)} tone="text-task" />
          <Stat label="Blocked" value={String(blocked)} tone={blocked > 0 ? 'text-human' : 'text-mut'} />
          <Stat label="Events today" value={String(today.length)} tone="text-ink" />
          <Stat label="Spend today" value={fmtUsd(spend)} tone="text-artifact" />
        </div>

        <div className="sticky top-0 z-10 -mx-5 mt-5 flex shrink-0 flex-col gap-2 border-y border-line bg-surface/95 px-5 py-3 backdrop-blur-sm lg:-mx-8 lg:px-8">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="mr-1 font-mono text-[10px] uppercase tracking-wider text-dim">Department</span>
            <FilterChip label="All" active={dept === 'all'} onClick={() => setDept('all')} />
            {DEPARTMENTS.map((d) => (
              <FilterChip key={d.id} label={d.name} active={dept === d.id} onClick={() => setDept(d.id)} />
            ))}
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="mr-1 font-mono text-[10px] uppercase tracking-wider text-dim">Stream</span>
            {TYPE_FILTERS.map((f) => (
              <FilterChip key={f.key} label={f.label} active={group === f.key} onClick={() => setGroup(f.key)} />
            ))}
          </div>
        </div>

        <div className="mt-0 min-w-0 flex-1 overflow-x-auto border-b border-line">
          {rows.length === 0 ? (
            <div className="px-3 py-14 text-center text-[11px] text-dim">No events match this filter.</div>
          ) : (
            <table className="w-full min-w-[920px] table-fixed border-collapse text-left">
              <colgroup>
                <col className="w-[9%]" />
                <col className="w-[14%]" />
                <col className="w-[42%]" />
                <col className="w-[17%]" />
                <col className="w-[18%]" />
              </colgroup>
              <thead className="bg-raised/55">
                <tr className="border-b border-line">
                  <th className="px-3 py-2.5 font-mono text-[10px] font-medium uppercase tracking-wider text-dim">When</th>
                  <th className="px-3 py-2.5 font-mono text-[10px] font-medium uppercase tracking-wider text-dim">Stream</th>
                  <th className="px-3 py-2.5 font-mono text-[10px] font-medium uppercase tracking-wider text-dim">Event</th>
                  <th className="px-3 py-2.5 font-mono text-[10px] font-medium uppercase tracking-wider text-dim">Route</th>
                  <th className="px-3 py-2.5 text-right font-mono text-[10px] font-medium uppercase tracking-wider text-dim">Metrics</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <Row
                    key={e.id}
                    event={e}
                    highlighted={highlightEventId === e.id}
                    onTrace={() => setTraceTaskId(e.taskId ?? null)}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {traceTaskId && <TraceModal taskId={traceTaskId} onClose={() => setTraceTaskId(null)} />}
    </div>
  )
}

// ─── Filters ─────────────────────────────────────────────────────────────────

interface TypeFilter { key: string; label: string; types: EventType[] | null }

const TYPE_FILTERS: TypeFilter[] = [
  { key: 'all', label: 'All', types: null },
  {
    key: 'tasks', label: 'Tasks',
    types: ['TaskRequest', 'TaskAccepted', 'DelegatedTo', 'StatusUpdate', 'TaskCompleted', 'TaskFailed'],
  },
  { key: 'artifacts', label: 'Artifacts', types: ['ArtifactDelivered'] },
  {
    key: 'human', label: 'Human',
    types: ['AuthRequired', 'PermissionRequest', 'ApprovalGranted', 'AccountConnected', 'BlueprintProposed', 'BlueprintApproved'],
  },
  { key: 'guardrails', label: 'Guardrails', types: ['GuardrailBlock'] },
  { key: 'tools', label: 'Tools', types: ['ToolCall'] },
]

/**
 * Row metrics are data, not shouted labels, so they opt out of Pill's uppercase.
 * `!` because a bare utility loses to the atom's own class at equal specificity.
 */
const META = 'shrink-0 normal-case!'

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" className="inline-flex cursor-pointer" onClick={onClick}>
      <Chip
        className={cx(
          'transition-colors',
          active
            ? 'border-task/55 bg-task/10 text-task'
            : 'bg-raised! hover:border-linebright hover:text-ink',
        )}
      >
        {label}
      </Chip>
    </button>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-lg border border-line bg-raised/60 px-2 py-1.5">
      <div className="truncate font-mono text-[10px] uppercase tracking-wider text-dim">{label}</div>
      <div className={cx('mt-0.5 text-[15px] leading-none font-semibold tabular-nums', tone)}>{value}</div>
    </div>
  )
}

// ─── Event colors ────────────────────────────────────────────────────────────

function typeColor(t: EventType): string {
  switch (t) {
    case 'GuardrailBlock':
      return 'var(--color-guard)'
    case 'ArtifactDelivered':
    case 'TaskCompleted':
      return 'var(--color-artifact)'
    case 'AuthRequired':
    case 'PermissionRequest':
    case 'ApprovalGranted':
    case 'AccountConnected':
    case 'BlueprintProposed':
    case 'BlueprintApproved':
      return 'var(--color-permission)'
    case 'Escalation':
    case 'TaskFailed':
      return 'var(--color-escalation)'
    default:
      return 'var(--color-task)'
  }
}

function TypeChip({ type }: { type: EventType }) {
  const c = typeColor(type)
  return (
    <Pill
      className="shrink-0 whitespace-nowrap"
      style={{
        color: c,
        borderColor: `color-mix(in srgb, ${c} 40%, transparent)`,
        background: `color-mix(in srgb, ${c} 10%, transparent)`,
      }}
    >
      {typeLabel(type)}
    </Pill>
  )
}

// ─── Feed row ────────────────────────────────────────────────────────────────

function DocGlyph() {
  return (
    <svg viewBox="0 0 10 12" className="size-2.5 shrink-0" aria-hidden="true">
      <path d="M2 .9h4.1L8.7 3.5v7.6H2z" fill="none" stroke="currentColor" strokeWidth="1.1" />
      <path d="M6.1.9v2.6h2.6" fill="none" stroke="currentColor" strokeWidth="1.1" />
    </svg>
  )
}

function Row({ event: e, highlighted, onTrace }: { event: WorldEvent; highlighted: boolean; onTrace: () => void }) {
  const isToday = new Date(e.ts).toDateString() === new Date().toDateString()
  const guard = e.type === 'GuardrailBlock'
  const isArtifact = e.type === 'ArtifactDelivered'
  const route = e.deptFrom && e.deptTo && e.deptFrom !== e.deptTo
    ? `${deptById.get(e.deptFrom)?.name ?? e.deptFrom} → ${deptById.get(e.deptTo)?.name ?? e.deptTo}`
    : null

  return (
    <tr
      data-event-id={e.id}
      onMouseEnter={() => useStore.getState().setHighlight(e.id)}
      onMouseLeave={() => useStore.getState().setHighlight(null)}
      onClick={() => {
        if (isArtifact) useStore.getState().openArtifact(e.id)
        else if (e.taskId) useStore.getState().selectTask(e.taskId)
      }}
      title={isArtifact ? 'Open the delivered document' : undefined}
      className={cx(
        'border-b border-line/60 align-middle transition-colors',
        (e.taskId || isArtifact) && 'cursor-pointer',
        highlighted ? 'bg-hover' : isArtifact ? 'hover:bg-artifact/8' : 'hover:bg-raised/60',
      )}
      style={guard ? { borderLeft: '2px solid color-mix(in srgb, var(--color-guard) 60%, transparent)' } : { borderLeft: '2px solid transparent' }}
    >
      <td className="px-3 py-2 font-mono text-[10px] whitespace-nowrap text-dim tabular-nums">
        {isToday ? fmtClock(e.ts) : `${fmtDay(e.ts)} ${fmtClock(e.ts)}`}
      </td>
      <td className="px-3 py-2"><TypeChip type={e.type} /></td>
      <td className="max-w-0 px-3 py-2">
        <div className="truncate text-[12px] text-ink" title={e.detail ?? e.title}>{e.title}</div>
        {e.detail && <div className="mt-0.5 truncate text-[10px] text-dim">{e.detail}</div>}
      </td>
      <td className="px-3 py-2 text-[10px] text-dim">{route ?? '—'}</td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {isArtifact && (
            <Pill
              className={cx(META, 'gap-1 border-artifact/45! bg-artifact/8! text-artifact')}
              title="Open the delivered document"
            >
              <DocGlyph /> open
            </Pill>
          )}
          {e.payload?.costUsd != null && <Pill className={cx(META, 'text-mut')}>{fmtUsd(e.payload.costUsd)}</Pill>}
          {e.payload?.latencyMs != null && <Pill className={cx(META, 'text-mut')}>{fmtDuration(e.payload.latencyMs)}</Pill>}
          {e.taskId && (
            <button
              type="button"
              className="inline-flex shrink-0 cursor-pointer"
              title="Open the trace waterfall for this task"
              onClick={(ev) => {
                ev.stopPropagation()
                onTrace()
              }}
            >
              <Pill className={cx(META, 'text-mut transition-colors hover:border-task/50 hover:text-task')}>trace</Pill>
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}

// ─── Trace waterfall ─────────────────────────────────────────────────────────

function TraceModal({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const log = useStore((s) => s.log)
  const world = useStore((s) => s.world)
  const task = world.tasks.get(taskId)

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

  const events = log.filter((e) => e.taskId === taskId && e.type !== 'Chat').sort((a, b) => a.ts - b.ts)
  const t0 = events.length > 0 ? events[0].ts : task?.createdAt ?? Date.now()
  const t1 = Math.max(task?.endedAt ?? 0, events.length > 0 ? events[events.length - 1].ts : t0)
  const range = Math.max(1, t1 - t0)

  const spans = events.map((e, i) => {
    const next = events[i + 1]
    const dur = e.payload?.latencyMs ?? e.travelMs ?? (next ? next.ts - e.ts : range * 0.05)
    const left = ((e.ts - t0) / range) * 100
    const width = Math.max(2, Math.min(100 - left, (dur / range) * 100))
    return { e, left, width }
  })

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/25" onClick={onClose}>
      <div className="panel anim-fadeup w-[560px] overflow-hidden" onClick={(ev) => ev.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
          <span className="font-mono text-[10px] uppercase tracking-wider text-dim">Trace</span>
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{task?.title ?? taskId}</span>
          <Pill className={cx(META, 'text-mut')}>{fmtDuration(range)}</Pill>
          <button
            className="rounded px-1.5 py-0.5 text-[13px] text-dim hover:bg-hover hover:text-ink"
            title="Close"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto px-3 py-2.5">
          {spans.map(({ e, left, width }) => {
            const c = typeColor(e.type)
            return (
              <div key={e.id} className="flex items-center gap-2 py-[3px]">
                <span
                  className="w-[188px] shrink-0 truncate font-mono text-[9px] text-mut"
                  title={`${typeLabel(e.type)} · ${e.title}`}
                >
                  <span style={{ color: c }}>{typeLabel(e.type)}</span> · {e.title}
                </span>
                <span className="relative h-3 min-w-0 flex-1 rounded bg-ink/20">
                  <span
                    className="absolute top-0 h-3 rounded"
                    style={{
                      left: `${left}%`,
                      width: `${width}%`,
                      background: `color-mix(in srgb, ${c} 55%, transparent)`,
                      borderLeft: `2px solid ${c}`,
                    }}
                  />
                </span>
                <span className="w-[42px] shrink-0 text-right font-mono text-[9px] text-dim tabular-nums">
                  +{fmtDuration(e.ts - t0)}
                </span>
              </div>
            )
          })}
          {spans.length === 0 && <div className="py-6 text-center text-[11px] text-dim">No spans recorded for this task.</div>}
        </div>

        <div className="border-t border-line px-3 py-2 font-mono text-[10px] text-dim">
          OpenTelemetry · Vertex AI Agent Engine · Cloud Trace — demo data
        </div>
      </div>
    </div>,
    document.body,
  )
}
