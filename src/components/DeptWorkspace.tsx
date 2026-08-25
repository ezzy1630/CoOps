import { ArrowRight, X } from '@phosphor-icons/react'
import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useStore } from '../store'
import { getTools, deptById, personById } from '../data/company'
import { artifactEventName } from '../data/artifactContent'
import { cx, fmtUsd, timeAgo } from '../utils'
import { Chip } from './ui'
import type { AgentStatus, TaskStatus } from '../types'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * This panel's chips keep the warm raised fill over the shared atom (which is
 * deliberately borderless and fill-free by default). `!` marks any tint that
 * would otherwise lose to an atom utility at equal specificity.
 */
const CHIP_FILL = 'bg-raised!'

/** Re-render on a slow beat so relative timestamps stay honest. */
function useNow(intervalMs = 20_000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}

function StatusDot({ status, className }: { status: AgentStatus; className?: string }) {
  return (
    <span
      title={status}
      className={cx(
        'size-1.5 shrink-0 rounded-full',
        status === 'idle' && 'bg-linebright',
        status === 'working' && 'bg-task',
        status === 'blocked' && 'bg-permission',
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
      className="flex size-6 shrink-0 items-center justify-center rounded-full border border-line bg-raised text-[10px] font-semibold text-mut shadow-xs"
    >
      {p.initials}
    </span>
  )
}

/** Task status tone — the same language the map overlays speak. */
function taskTone(status: TaskStatus): string {
  switch (status) {
    case 'done': return 'bg-artifact/10! text-artifact!'
    case 'failed': return 'bg-escalation/10! text-escalation!'
    case 'running': return 'border-task/40 bg-task/8 text-task'
    case 'waiting_auth':
    case 'waiting_approval': return 'border-permission/40 bg-permission/10 text-permission'
    default: return ''
  }
}

function Section({
  title, meta, children,
}: { title: string; meta?: string; children: ReactNode }) {
  return (
    <section className="border-t border-line px-3 py-2.5">
      <div className="mb-2 flex items-baseline gap-2">
        <h3 className="text-[11px] font-semibold tracking-wide text-mut">{title}</h3>
        {meta && <span className="font-mono text-[10.5px] text-dim/70 tabular-nums">{meta}</span>}
      </div>
      {children}
    </section>
  )
}

function DocGlyph() {
  return (
    <svg viewBox="0 0 10 12" className="size-2.5 shrink-0" aria-hidden="true">
      <path d="M2 .9h4.1L8.7 3.5v7.6H2z" fill="none" stroke="currentColor" strokeWidth="1.1" />
      <path d="M6.1.9v2.6h2.6" fill="none" stroke="currentColor" strokeWidth="1.1" />
    </svg>
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
  return <p className="px-2 py-1 text-[12px] text-dim">{children}</p>
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

  const tools = useMemo(() => getTools().filter((t) => t.deptId === deptId), [deptId])
  const departmentHue = lead ? `hsl(${lead.hue} 56% 52%)` : 'var(--color-linebright)'

  if (!dept) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-[13px] text-mut">No such department.</p>
        <button className="btn" onClick={() => useStore.getState().closePanel()}>Close</button>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-surface">
      {/* ── header ── */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-line px-4 bg-surface/95 backdrop-blur-md">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-raised font-mono text-[11px] font-bold text-ink">
            {dept.name.slice(0, 2).toUpperCase()}
          </div>
          <h2 className="truncate text-[14.5px] font-bold tracking-tight text-ink">{dept.name}</h2>
          <span className="hidden truncate text-[11.5px] text-dim sm:inline">· {dept.blurb}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {lead && (
            <div className="flex items-center gap-1.5" title={`Department lead: ${lead.name}`}>
              <Avatar personId={lead.id} />
              <span className="hidden max-w-28 truncate text-[11.5px] font-medium text-mut md:inline">{lead.name.split(' ')[0]}</span>
            </div>
          )}
          <button
            className="flex size-7 cursor-pointer items-center justify-center rounded-lg text-dim transition-colors hover:bg-hover hover:text-ink active:scale-95"
            title="Close"
            onClick={() => useStore.getState().closePanel()}
          >
            <X size={15} />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* ── department agent ── */}
        {operator && (
          <div className="p-4">
            <div className="rounded-xl border border-line bg-raised/50 p-3.5 shadow-xs transition-all hover:border-linebright">
              <div className="flex items-center gap-2.5">
                <StatusDot status={world.agentStatus.get(operator.id) ?? 'idle'} />
                <span className="min-w-0 flex-1 truncate text-[13.5px] font-bold text-ink">{operator.name}</span>
                <span className="rounded-full bg-surface border border-line px-2.5 py-0.5 text-[10px] font-semibold text-mut shadow-xs">
                  Department Lead
                </span>
              </div>
              <p className="mt-2 text-[12px] leading-relaxed text-mut">{operator.purpose}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  className="btn btn-primary h-7 rounded-full px-3 text-xs"
                  onClick={() => useStore.getState().openPanel('agent', operator.id)}
                >
                  <span>Open Room</span>
                  <ArrowRight size={11} weight="bold" />
                </button>
                <button
                  className="rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-mut transition-all hover:bg-hover hover:text-ink cursor-pointer"
                  title="Describe the job in chat. The agent interviews you, then drafts a blueprint."
                  onClick={() => useStore.getState().openPanel('agent', operator.id)}
                >
                  Ask for a new agent →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── workers ── */}
        <Section title="Specialists" meta={`${workers.length}`}>
          {workers.length === 0 ? (
            <Empty>No specialists yet. Ask the department lead for one.</Empty>
          ) : (
            <div className="space-y-px">
              {workers.map((w) => {
                const status = world.agentStatus.get(w.id) ?? 'idle'
                const taskId = world.agentTask.get(w.id)
                const task = taskId ? world.tasks.get(taskId) : undefined
                return (
                  <button
                    key={w.id}
                    onClick={() => useStore.getState().openPanel('agent', w.id)}
                    className="flex w-full items-center gap-2 px-2 py-1.5 text-left transition-colors hover:bg-hover"
                  >
                    <StatusDot status={status} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-[12.5px]">{w.name}</span>
                        {w.bornAt != null && (
                          <Chip className={cx(CHIP_FILL, 'shrink-0 bg-task/10! text-task!')}>new</Chip>
                        )}
                      </span>
                      <span
                        className={cx(
                          'block truncate text-[11.5px]',
                          status === 'working' && task ? 'text-task/80' : 'text-dim',
                        )}
                      >
                        {status === 'working' && task ? task.title : w.purpose}
                      </span>
                    </span>
                    <ArrowRight size={11} weight="bold" className="shrink-0 text-dim" />
                  </button>
                )
              })}
            </div>
          )}
        </Section>

        {/* ── queue ── */}
        <Section title="Queue" meta={active.length > 0 ? `${active.length} live` : 'empty'}>
          {active.length === 0 && finished.length === 0 ? (
            <Empty>Nothing in the queue.</Empty>
          ) : (
            <div className="space-y-px">
              {[...active, ...finished].map((t) => {
                const over = t.status === 'done' || t.status === 'failed'
                const delivered = log.filter((e) => e.type === 'ArtifactDelivered' && e.taskId === t.id)
                return (
                  <div
                    key={t.id}
                    className={cx(
                      'px-2 py-1 transition-colors',
                      selectedTaskId === t.id ? 'bg-raised ring-1 ring-task/40' : 'hover:bg-hover',
                      over && 'opacity-70',
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <button
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                        onClick={() => useStore.getState().selectTask(t.id)}
                      >
                        <Chip className={cx(CHIP_FILL, 'shrink-0', taskTone(t.status))}>
                          {t.status.replace('_', ' ')}
                        </Chip>
                        <span className="min-w-0 flex-1 truncate text-[12.5px]">{t.title}</span>
                        {t.costUsd > 0 && (
                          <span className="shrink-0 font-mono text-[10.5px] text-dim tabular-nums">{fmtUsd(t.costUsd)}</span>
                        )}
                        <span className="shrink-0 font-mono text-[10.5px] text-dim tabular-nums">{timeAgo(t.createdAt, now)}</span>
                      </button>
                      {over && (
                        <button
                          type="button"
                          className="inline-flex shrink-0 cursor-pointer"
                          title="Replay this task on the map"
                          onClick={() => useStore.getState().startReplay(t.id)}
                        >
                          <Chip className={cx(CHIP_FILL, 'transition-colors hover:text-task')}>
                            ↺ replay
                          </Chip>
                        </button>
                      )}
                    </div>
                    {delivered.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1 pl-0.5">
                        {delivered.map((ae) => (
                          <button
                            key={ae.id}
                            type="button"
                            className="inline-flex max-w-full cursor-pointer"
                            title={`Open: ${artifactEventName(ae)}`}
                            onClick={() => useStore.getState().openArtifact(ae.id)}
                          >
                            <Chip className="max-w-full bg-artifact/10! text-artifact! transition-colors hover:bg-artifact/15!">
                              <DocGlyph />
                              <span className="truncate">{artifactEventName(ae)}</span>
                            </Chip>
                          </button>
                        ))}
                      </div>
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
            <div className="space-y-px">
              {incoming.map((e) => (
                <button
                  key={e.id}
                  onClick={() => {
                    if (e.taskId) useStore.getState().selectTask(e.taskId)
                  }}
                  onMouseEnter={() => useStore.getState().setHighlight(e.id)}
                  onMouseLeave={() => useStore.getState().setHighlight(null)}
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left transition-colors hover:bg-hover"
                >
                  <Chip className={cx(CHIP_FILL, 'shrink-0 border-task/40 text-task')}>
                    {deptById.get(e.deptFrom ?? '')?.name ?? e.deptFrom}
                  </Chip>
                  <ArrowRight size={11} weight="bold" className="shrink-0 text-dim" />
                  <span className="min-w-0 flex-1 truncate text-[12.5px]">{e.title}</span>
                  <span className="shrink-0 font-mono text-[10.5px] text-dim tabular-nums">{timeAgo(e.ts, now)}</span>
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
            <div className="flex flex-wrap gap-1">
              {tools.map((t) => {
                const needsAuth = t.requiresAuth === true && t.connected !== true
                const owner = personById.get(t.ownerId)
                return (
                  <Chip
                    key={t.id}
                    className={cx(CHIP_FILL, 'gap-1.5', needsAuth && 'border-permission/40 text-permission')}
                    title={
                      needsAuth
                        ? 'Owner must connect this account'
                        : `${t.kind}${owner ? ` · owned by ${owner.name}` : ''}`
                    }
                  >
                    {needsAuth && <LockGlyph />}
                    {t.name}
                    <span className={cx('text-[10.5px]', needsAuth ? 'text-permission/60' : 'text-dim')}>
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
