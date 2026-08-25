/* Hallmark · macrostructure: Workbench · theme: Obsidian-Titanium · genre: modern-minimal
 * pre-emit critique: P5 H5 E5 S5 R5 V5 · slop test: 58/58 ✓
 */
import { ArrowRight, ListMagnifyingGlass, X } from '@phosphor-icons/react'
import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../store'
import { getDepartments, deptById } from '../data/company'
import { cx, fmtClock, fmtDay, fmtDuration, fmtUsd } from '../utils'
import { Chip, Modal, Pill, typeLabel } from './ui'
import type { EventType, Task, WorldEvent } from '../types'
import ProofPackage from './ProofPackage'
import PreflightPanel from './PreflightPanel'

/** Live + historical run feed for the whole company. */
export default function ActivityPanel() {
  const log = useStore((s) => s.log)
  const world = useStore((s) => s.world)
  const highlightEventId = useStore((s) => s.highlightEventId)
  const executionMode = useStore((s) => s.executionMode)
  const liveConnection = useStore((s) => s.liveConnection)
  const runtimeInfo = useStore((s) => s.runtimeInfo)
  const [dept, setDept] = useState<string>('all')
  const [group, setGroup] = useState<string>('all')
  const [traceTaskId, setTraceTaskId] = useState<string | null>(null)
  const [proofOpen, setProofOpen] = useState(false)
  const [preflightOpen, setPreflightOpen] = useState(false)

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
    <div className="flex h-full min-w-0 flex-col overflow-y-auto overscroll-contain bg-bg">
      <div className="mx-auto flex w-full max-w-[1440px] min-w-0 flex-1 flex-col px-6 py-8 lg:px-10">
        <header className="flex flex-col gap-5 border-b border-line pb-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-[26px] font-bold tracking-tight text-ink">Activity</h2>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 font-mono text-[11px] font-semibold text-mut shadow-xs">
                  <span className="size-1.5 rounded-full bg-task" />
                  <span>{rows.length} Events</span>
                </span>
              </div>
              <p className="mt-1 font-mono text-[11.5px] text-dim">
                <span className={active > 0 ? 'text-task font-semibold' : undefined}>{active} active tasks</span> ·{' '}
                <span className={blocked > 0 ? 'text-human font-semibold' : undefined}>{blocked} blocked</span> · {fmtUsd(spend)} compute today
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                className="btn h-8 rounded-lg px-3 text-xs font-medium cursor-pointer"
                onClick={() => setPreflightOpen(true)}
              >
                System Checks
              </button>
              <button
                type="button"
                className="btn h-8 rounded-lg px-3 text-xs font-medium cursor-pointer"
                onClick={() => setProofOpen(true)}
              >
                Audit Package
              </button>
            </div>
          </div>

          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <FilterChip label="All Departments" active={dept === 'all'} onClick={() => setDept('all')} />
              {getDepartments().map((d) => (
                <FilterChip key={d.id} label={d.name} active={dept === d.id} onClick={() => setDept(d.id)} />
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-1 rounded-xl border border-line bg-surface p-1 shadow-xs">
              {TYPE_FILTERS.map((f) => (
                <FilterChip key={f.key} label={f.label} active={group === f.key} onClick={() => setGroup(f.key)} />
              ))}
            </div>
          </div>
        </header>

        <div className="min-w-0 flex-1 pt-6">
          {rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-line bg-surface px-6 py-20 text-center shadow-xs">
              <div className="flex size-12 items-center justify-center rounded-xl bg-raised text-dim">
                <ListMagnifyingGlass size={22} className="text-dim" />
              </div>
              <h3 className="mt-4 text-[15px] font-bold text-ink">No activity recorded yet</h3>
              <p className="mt-1 max-w-sm text-xs leading-relaxed text-mut">
                Tasks, tool executions, and approvals will stream here in real time as departments collaborate.
              </p>
              <div className="mt-5 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => useStore.getState().runRehearsal('launch-day')}
                  className="btn btn-primary h-8 rounded-lg px-4 text-xs font-semibold shadow-xs transition-all active:scale-95 cursor-pointer inline-flex items-center gap-1.5"
                >
                  <span>Run Launch Demo</span>
                  <ArrowRight size={12} weight="bold" />
                </button>
                {(dept !== 'all' || group !== 'all') && (
                  <button
                    type="button"
                    onClick={() => {
                      setDept('all')
                      setGroup('all')
                    }}
                    className="btn h-8 rounded-full px-4 text-xs font-medium cursor-pointer"
                  >
                    Clear Filters
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-line bg-surface shadow-xs">
              <table className="w-full min-w-[980px] table-fixed border-collapse text-left">
                <colgroup>
                  <col className="w-[10%]" />
                  <col className="w-[14%]" />
                  <col className="w-[38%]" />
                  <col className="w-[18%]" />
                  <col className="w-[20%]" />
                </colgroup>
                <thead>
                  <tr className="border-b border-line bg-raised/30">
                    {['Timestamp', 'Stream', 'Event Detail', 'Routing Path'].map((label) => (
                      <th key={label} className="px-3.5 py-3 text-[11px] font-semibold text-dim uppercase tracking-wider">{label}</th>
                    ))}
                    <th className="px-3.5 py-3 text-right text-[11px] font-semibold text-dim uppercase tracking-wider">Metrics</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {rows.map((e) => (
                    <Row
                      key={e.id}
                      event={e}
                      highlighted={highlightEventId === e.id}
                      onTrace={() => setTraceTaskId(e.taskId ?? null)}
                      onOpenMap={() => openEventOnMap(e, world)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {traceTaskId && <TraceModal taskId={traceTaskId} onClose={() => setTraceTaskId(null)} />}
      {proofOpen && <ProofPackage onClose={() => setProofOpen(false)} />}
      {preflightOpen && <PreflightPanel onClose={() => setPreflightOpen(false)} />}
    </div>
  )
}



// ─── Filters ─────────────────────────────────────────────────────────────────

interface TypeFilter { key: string; label: string; types: EventType[] | null }

const TYPE_FILTERS: TypeFilter[] = [
  { key: 'all', label: 'All Events', types: null },
  {
    key: 'tasks', label: 'Tasks',
    types: ['TaskRequest', 'TaskAccepted', 'DelegatedTo', 'StatusUpdate', 'TaskCompleted', 'TaskFailed'],
  },
  { key: 'artifacts', label: 'Documents', types: ['ArtifactDelivered'] },
  {
    key: 'human', label: 'Approvals',
    types: ['AuthRequired', 'PermissionRequest', 'ApprovalGranted', 'AccountConnected', 'BlueprintProposed', 'BlueprintApproved'],
  },
  { key: 'guardrails', label: 'Policy Blocks', types: ['GuardrailBlock'] },
  { key: 'tools', label: 'Tools', types: ['ToolCall'] },
]

/** Row metrics are quiet data — no fill unless a state tints them. */
const META = 'shrink-0'

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className={cx(
        'cursor-pointer rounded-full px-3 py-1 text-xs font-semibold transition-all active:scale-95',
        active
          ? 'bg-ink text-bg shadow-xs'
          : 'border border-line/60 bg-surface text-mut hover:border-linebright hover:bg-hover hover:text-ink',
      )}
      onClick={onClick}
    >
      {label}
    </button>
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
  const capability = type === 'AuthRequired' || type === 'PermissionRequest' || type === 'ApprovalGranted' || type === 'AccountConnected' || type === 'BlueprintProposed' || type === 'BlueprintApproved'
  return (
    <Pill
      className="shrink-0 whitespace-nowrap"
      style={{
        color: c,
      }}
    >
      {capability && <CapabilityGlyph />}
      {typeLabel(type)}
    </Pill>
  )
}

function openEventOnMap(event: WorldEvent, world: ReturnType<typeof useStore.getState>['world']) {
  const store = useStore.getState()
  const source = event.from
  const target = event.to
  const sourceAgent = source?.kind === 'agent' && world.agents.some((agent) => agent.id === source.id)
    ? source.id
    : null
  const targetAgent = target?.kind === 'agent' && world.agents.some((agent) => agent.id === target.id)
    ? target.id
    : null
  const agentId = sourceAgent ?? targetAgent

  if (agentId) {
    store.requestCamera({ type: 'agent', agentId })
    store.openPanel('agent', agentId)
  } else {
    const deptId = event.deptFrom ?? event.deptTo
    if (deptId) {
      store.requestCamera({ type: 'dept', deptId })
      store.openPanel('dept', deptId)
    } else {
      store.setView('map')
    }
  }
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

function CapabilityGlyph() {
  return (
    <svg viewBox="0 0 12 12" className="size-2.5 shrink-0" aria-hidden="true">
      <rect x="3" y="5" width="6" height="5" rx="1" fill="none" stroke="currentColor" strokeWidth="1" />
      <path d="M4.5 5V3.8a1.5 1.5 0 0 1 3 0V5" fill="none" stroke="currentColor" strokeWidth="1" />
    </svg>
  )
}

function Row({ event: e, highlighted, onTrace, onOpenMap }: { event: WorldEvent; highlighted: boolean; onTrace: () => void; onOpenMap: () => void }) {
  const isToday = new Date(e.ts).toDateString() === new Date().toDateString()
  const guard = e.type === 'GuardrailBlock'
  const isArtifact = e.type === 'ArtifactDelivered'
  const route = e.deptFrom && e.deptTo && e.deptFrom !== e.deptTo
    ? `${deptById.get(e.deptFrom)?.name ?? e.deptFrom} → ${deptById.get(e.deptTo)?.name ?? e.deptTo}`
    : null

  return (
    <tr
      data-event-id={e.id}
      tabIndex={0}
      onMouseEnter={() => useStore.getState().setHighlight(e.id)}
      onMouseLeave={() => useStore.getState().setHighlight(null)}
      onClick={onOpenMap}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpenMap()
        }
      }}
      title="Open on map"
      className={cx(
        'group cursor-pointer border-b border-line/60 align-middle transition-colors focus:bg-hover focus:outline-none',
        highlighted ? 'bg-hover' : isArtifact ? 'hover:bg-artifact/8' : 'hover:bg-raised/60',
      )}
      style={guard ? { borderLeft: '2px solid color-mix(in srgb, var(--color-guard) 60%, transparent)' } : { borderLeft: '2px solid transparent' }}
    >
      <td className="px-3 py-2 font-mono text-[10.5px] whitespace-nowrap text-dim tabular-nums">
        {isToday ? fmtClock(e.ts) : `${fmtDay(e.ts)} ${fmtClock(e.ts)}`}
      </td>
      <td className="px-3 py-2"><TypeChip type={e.type} /></td>
      <td className="max-w-0 px-3 py-2">
        <div className="truncate text-[12.5px] text-ink" title={e.detail ?? e.title}>{e.title}</div>
        {e.detail && <div className="mt-0.5 truncate text-[10.5px] text-dim">{e.detail}</div>}
      </td>
      <td className="px-3 py-2 text-[10.5px] text-dim">{route}</td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {isArtifact && (
            <button
              type="button"
              className="inline-flex shrink-0 cursor-pointer"
              title="Open the delivered document"
              onClick={(event) => {
                event.stopPropagation()
                useStore.getState().openArtifact(e.id)
              }}
            >
              <Pill className={cx(META, 'gap-1 bg-artifact/10! text-artifact!')}>
                <DocGlyph /> open document
              </Pill>
            </button>
          )}
          {e.payload?.costUsd != null && <Pill className={cx(META, 'text-mut')}>{fmtUsd(e.payload.costUsd)}</Pill>}
          {e.payload?.latencyMs != null && <Pill className={cx(META, 'text-mut')}>{fmtDuration(e.payload.latencyMs)}</Pill>}
          {e.taskId && (
            <button
              type="button"
              className="inline-flex shrink-0 cursor-pointer"
              title="Open the trace waterfall for this task"
              onClick={(event) => {
                event.stopPropagation()
                onTrace()
              }}
            >
              <Pill className={cx(META, 'transition-colors hover:bg-hover hover:text-task')}>trace</Pill>
            </button>
          )}
          <span className="pointer-events-none text-[10.5px] text-task opacity-0 transition-opacity group-hover:opacity-100 group-focus:opacity-100">Open on map ↗</span>
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

  return (
    <Modal onClose={onClose} width={560} ariaLabel="Task trace">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
        <span className="font-mono text-[10px] uppercase tracking-wider text-dim">Trace</span>
        <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">{task?.title ?? taskId}</span>
        <Pill className={cx(META, 'text-mut')}>{fmtDuration(range)}</Pill>
        <button
          className="rounded-sm px-1 py-0.5 text-dim hover:bg-hover hover:text-ink"
          title="Close"
          onClick={onClose}
        >
          <X size={14} />
        </button>
      </div>

      <div className="max-h-[60vh] overflow-y-auto px-3 py-2.5">
        {spans.map(({ e, left, width }) => {
          const c = typeColor(e.type)
          return (
            <div key={e.id} className="flex items-center gap-2 py-[3px]">
              <span
                className="w-[188px] shrink-0 truncate font-mono text-[10px] text-mut"
                title={`${typeLabel(e.type)} · ${e.title}`}
              >
                <span style={{ color: c }}>{typeLabel(e.type)}</span> · {e.title}
              </span>
              <span className="relative h-3 min-w-0 flex-1 rounded-sm bg-ink/20">
                <span
                  className="absolute top-0 h-3 rounded-sm"
                  style={{
                    left: `${left}%`,
                    width: `${width}%`,
                    background: `color-mix(in srgb, ${c} 55%, transparent)`,
                    borderLeft: `2px solid ${c}`,
                  }}
                />
              </span>
              <span className="w-[42px] shrink-0 text-right font-mono text-[10px] text-dim tabular-nums">
                +{fmtDuration(e.ts - t0)}
              </span>
            </div>
          )
        })}
        {spans.length === 0 && <div className="py-6 text-center text-[11.5px] text-dim">No spans recorded for this task.</div>}
      </div>

      <div className="border-t border-line px-3 py-2 font-mono text-[10.5px] text-dim">
        Event-log trace · durations use measured latency or declared travel time
      </div>
    </Modal>
  )
}