import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useStore } from '../store'
import { TOOLS, deptById, personById } from '../data/company'
import { cx, fmtUsd, timeAgo } from '../utils'
import type { AgentStatus, TaskStatus } from '../types'

const DAY_MS = 24 * 60 * 60 * 1000

/** Re-render on a slow beat so relative timestamps stay honest. */
function useNow(intervalMs = 20_000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}

/**
 * Chip built from utilities rather than the .chip class: .chip lives outside a
 * cascade layer, so a layered `text-task` could not repaint it.
 */
function Chip({
  tone, size = 'md', className, children, title,
}: {
  tone?: string
  size?: 'sm' | 'md'
  className?: string
  children: ReactNode
  title?: string
}) {
  return (
    <span
      title={title}
      className={cx(
        'inline-flex items-center gap-1 rounded-md border bg-raised px-1.5 py-0.5 font-medium',
        size === 'sm' ? 'text-[10px]' : 'text-[11px]',
        tone ?? 'border-line text-mut',
        className,
      )}
    >
      {children}
    </span>
  )
}

function StatusDot({ status, className }: { status: AgentStatus; className?: string }) {
  return (
    <span
      title={status}
      className={cx(
        'size-2 shrink-0 rounded-full',
        status === 'idle' && 'bg-linebright',
        status === 'working' && 'bg-task anim-work',
        status === 'blocked' && 'bg-permission anim-breathe',
        className,
      )}
    />
  )
}

function Avatar({ personId }: { personId: string }) {
  const p = personById.get(personId)
  if (!p) return null
  return (
    <span
      className="flex size-7 shrink-0 items-center justify-center rounded-full border border-linebright text-[10px] font-bold"
      style={{ background: `hsl(${p.hue} var(--av-s) var(--av-l))` }}
    >
      {p.initials}
    </span>
  )
}

/** Task status tone — the same language the map overlays speak. */
function taskTone(status: TaskStatus): string {
  switch (status) {
    case 'done': return 'border-artifact/50 text-artifact'
    case 'failed': return 'border-escalation/50 text-escalation'
    case 'running': return 'border-task/50 text-task'
    case 'waiting_auth':
    case 'waiting_approval': return 'border-permission/50 text-permission'
    default: return 'border-line text-mut'
  }
}

function Section({
  title, meta, children,
}: { title: string; meta?: string; children: ReactNode }) {
  return (
    <section className="border-t border-line px-3.5 py-3">
      <div className="mb-2 flex items-baseline gap-2">
        <h3 className="font-mono text-[10px] uppercase tracking-wide text-dim">{title}</h3>
        {meta && <span className="font-mono text-[10px] text-dim/70">{meta}</span>}
      </div>
      {children}
    </section>
  )
}

function LockGlyph() {
  return (
    <svg viewBox="0 0 10 12" className="size-2.5 shrink-0" aria-hidden="true">
      <path d="M2.6 5.2V3.5a2.4 2.4 0 0 1 4.8 0v1.7" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <rect x="1.2" y="5.2" width="7.6" height="6" rx="1.3" fill="currentColor" />
    </svg>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="px-2 py-1 text-[11.5px] text-dim">{children}</p>
}

// ─── Department Workspace ────────────────────────────────────────────────────

export default function DeptWorkspace({ deptId }: { deptId: string }) {
  const world = useStore((s) => s.world)
  const log = useStore((s) => s.log)
  const selectedTaskId = useStore((s) => s.selectedTaskId)
  const now = useNow()

  const dept = deptById.get(deptId)
  const lead = dept ? personById.get(dept.leadId) : undefined
  const operator = world.agents.find((a) => a.kind === 'operator' && a.deptId === deptId)
  const workers = world.agents.filter((a) => a.kind === 'worker' && a.deptId === deptId)

  const { active, finished } = useMemo(() => {
    const mine = [...world.tasks.values()].filter(
      (t) => t.originDept === deptId || t.path.includes(deptId),
    )
    const isOver = (s: TaskStatus) => s === 'done' || s === 'failed'
    return {
      active: mine.filter((t) => !isOver(t.status)).sort((a, b) => b.createdAt - a.createdAt),
      finished: mine
        .filter((t) => isOver(t.status))
        .sort((a, b) => (b.endedAt ?? b.createdAt) - (a.endedAt ?? a.createdAt))
        .slice(0, 5),
    }
  }, [world.tasks, deptId])

  const incoming = useMemo(
    () =>
      log
        .filter(
          (e) =>
            e.type === 'TaskRequest' &&
            e.deptTo === deptId &&
            e.deptFrom != null &&
            e.deptFrom !== deptId &&
            now - e.ts < DAY_MS,
        )
        .sort((a, b) => b.ts - a.ts)
        .slice(0, 6),
    [log, deptId, now],
  )

  const tools = useMemo(() => TOOLS.filter((t) => t.deptId === deptId), [deptId])

  if (!dept) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-[13px] text-mut">No such department.</p>
        <button className="btn" onClick={() => useStore.getState().closePanel()}>Close</button>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* ── header ── */}
      <div className="flex shrink-0 items-start gap-3 border-b border-line px-3.5 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[15px] font-semibold">{dept.name}</h2>
          <p className="mt-0.5 truncate text-[11px] text-dim">{dept.blurb}</p>
        </div>
        {lead && (
          <div className="flex shrink-0 items-center gap-2" title={`Department lead: ${lead.name}`}>
            <Avatar personId={lead.id} />
            <span className="min-w-0 leading-tight">
              <span className="block max-w-32 truncate text-[12px]">{lead.name}</span>
              <span className="block max-w-32 truncate text-[10px] text-dim">{lead.role}</span>
            </span>
          </div>
        )}
        <button
          className="shrink-0 rounded px-1.5 py-0.5 text-[13px] text-dim hover:bg-hover hover:text-ink"
          title="Close"
          onClick={() => useStore.getState().closePanel()}
        >
          ✕
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* ── department agent ── */}
        {operator && (
          <div className="px-3.5 py-3">
            <div className="rounded-lg border border-line bg-raised/60 p-3">
              <div className="flex items-center gap-2">
                <StatusDot status={world.agentStatus.get(operator.id) ?? 'idle'} />
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{operator.name}</span>
                <Chip className="shrink-0">Department Agent</Chip>
              </div>
              <p className="mt-1.5 text-[12px] leading-snug text-mut">{operator.purpose}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  className="btn btn-primary"
                  onClick={() => useStore.getState().openPanel('agent', operator.id)}
                >
                  Open Agent Room
                </button>
                <button
                  className="rounded-lg px-2 py-1.5 text-[12px] text-mut transition-colors hover:bg-hover hover:text-ink"
                  title="Describe the job in chat — the agent interviews you, then drafts a blueprint"
                  onClick={() => useStore.getState().openPanel('agent', operator.id)}
                >
                  Ask for a new agent →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── workers ── */}
        <Section title="Workers" meta={`${workers.length}`}>
          {workers.length === 0 ? (
            <Empty>No workers yet — ask the department agent for one.</Empty>
          ) : (
            <div className="space-y-0.5">
              {workers.map((w) => {
                const status = world.agentStatus.get(w.id) ?? 'idle'
                const taskId = world.agentTask.get(w.id)
                const task = taskId ? world.tasks.get(taskId) : undefined
                return (
                  <button
                    key={w.id}
                    onClick={() => useStore.getState().openPanel('agent', w.id)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-hover"
                  >
                    <StatusDot status={status} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-[12.5px]">{w.name}</span>
                        {w.bornAt != null && (
                          <Chip tone="border-task/50 text-task" size="sm" className="shrink-0">new</Chip>
                        )}
                      </span>
                      <span
                        className={cx(
                          'block truncate text-[11px]',
                          status === 'working' && task ? 'text-task/80' : 'text-dim',
                        )}
                      >
                        {status === 'working' && task ? task.title : w.purpose}
                      </span>
                    </span>
                    <span className="shrink-0 text-[10px] text-dim">▶</span>
                  </button>
                )
              })}
            </div>
          )}
        </Section>

        {/* ── queue ── */}
        <Section title="Queue" meta={active.length > 0 ? `${active.length} live` : 'clear'}>
          {active.length === 0 && finished.length === 0 ? (
            <Empty>Nothing in the queue.</Empty>
          ) : (
            <div className="space-y-0.5">
              {[...active, ...finished].map((t) => {
                const over = t.status === 'done' || t.status === 'failed'
                return (
                  <div
                    key={t.id}
                    className={cx(
                      'flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors',
                      selectedTaskId === t.id ? 'bg-raised ring-1 ring-task/40' : 'hover:bg-hover',
                      over && 'opacity-70',
                    )}
                  >
                    <button
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      onClick={() => useStore.getState().selectTask(t.id)}
                    >
                      <Chip tone={taskTone(t.status)} size="sm" className="shrink-0">
                        {t.status.replace('_', ' ')}
                      </Chip>
                      <span className="min-w-0 flex-1 truncate text-[12.5px]">{t.title}</span>
                      {t.costUsd > 0 && (
                        <span className="shrink-0 font-mono text-[10px] text-dim">{fmtUsd(t.costUsd)}</span>
                      )}
                      <span className="shrink-0 text-[10px] text-dim">{timeAgo(t.createdAt, now)}</span>
                    </button>
                    {over && (
                      <button
                        className="shrink-0 rounded border border-line px-1.5 py-0.5 text-[10px] text-mut transition-colors hover:border-task/50 hover:text-task"
                        title="Replay this task on the map"
                        onClick={() => useStore.getState().startReplay(t.id)}
                      >
                        ↺ replay
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </Section>

        {/* ── incoming requests ── */}
        <Section title="Incoming requests" meta="last 24h">
          {incoming.length === 0 ? (
            <Empty>No cross-department requests today.</Empty>
          ) : (
            <div className="space-y-0.5">
              {incoming.map((e) => (
                <button
                  key={e.id}
                  onClick={() => {
                    if (e.taskId) useStore.getState().selectTask(e.taskId)
                  }}
                  onMouseEnter={() => useStore.getState().setHighlight(e.id)}
                  onMouseLeave={() => useStore.getState().setHighlight(null)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-hover"
                >
                  <Chip tone="border-task/40 text-task" size="sm" className="shrink-0">
                    {deptById.get(e.deptFrom ?? '')?.name ?? e.deptFrom}
                  </Chip>
                  <span className="shrink-0 text-dim">→</span>
                  <span className="min-w-0 flex-1 truncate text-[12.5px]">{e.title}</span>
                  <span className="shrink-0 text-[10px] text-dim">{timeAgo(e.ts, now)}</span>
                </button>
              ))}
            </div>
          )}
        </Section>

        {/* ── connected tools ── */}
        <Section title="Connected tools" meta={`${tools.length}`}>
          {tools.length === 0 ? (
            <Empty>No systems mapped to this department.</Empty>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {tools.map((t) => {
                const needsAuth = t.requiresAuth === true && t.connected !== true
                const owner = personById.get(t.ownerId)
                return (
                  <Chip
                    key={t.id}
                    tone={needsAuth ? 'border-permission/40 text-permission' : undefined}
                    className="gap-1.5"
                    title={
                      needsAuth
                        ? 'Owner must connect this account'
                        : `${t.kind}${owner ? ` · owned by ${owner.name}` : ''}`
                    }
                  >
                    {needsAuth && <LockGlyph />}
                    {t.name}
                    <span className={cx('text-[10px]', needsAuth ? 'text-permission/60' : 'text-dim')}>
                      {t.kind}
                    </span>
                  </Chip>
                )
              })}
            </div>
          )}
        </Section>
      </div>
    </div>
  )
}
