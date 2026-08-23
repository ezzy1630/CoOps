import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useStore } from '../store'
import { LAUNCH_AGENT_ID, deptById, personById, toolById } from '../data/company'
import { cx, fmtUsd, timeAgo } from '../utils'
import { Chip, typeLabel } from './ui'
import type { AgentStatus, EventType, PendingApproval, WorldEvent } from '../types'

// ─── Web Speech API (absent from lib.dom in this TS version) ─────────────────

interface SpeechAlternativeLike { transcript: string }
interface SpeechResultLike { isFinal: boolean; length: number; [i: number]: SpeechAlternativeLike }
interface SpeechResultListLike { length: number; [i: number]: SpeechResultLike }
interface SpeechEventLike { resultIndex: number; results: SpeechResultListLike }
interface SpeechRecognitionLike {
  lang: string
  interimResults: boolean
  continuous: boolean
  start(): void
  stop(): void
  onresult: ((e: SpeechEventLike) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike

const recognitionCtor = (): SpeechRecognitionCtor | null => {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    webkitSpeechRecognition?: SpeechRecognitionCtor
    SpeechRecognition?: SpeechRecognitionCtor
  }
  return w.webkitSpeechRecognition ?? w.SpeechRecognition ?? null
}

// ─── Small shared bits ───────────────────────────────────────────────────────

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
        'size-2 shrink-0 rounded-full',
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
      title={`${p.name} — ${p.role}`}
      className="flex size-6 shrink-0 items-center justify-center rounded-full border border-linebright text-[9px] font-bold"
      style={{ background: `hsl(${p.hue} 52% 87%)` }}
    >
      {p.initials}
    </span>
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

function Label({ children }: { children: ReactNode }) {
  return <span className="font-mono text-[10px] uppercase tracking-wide text-dim">{children}</span>
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-24 shrink-0 font-mono text-[10px] uppercase tracking-wide text-dim">{k}</dt>
      <dd className="min-w-0 flex-1 text-mut tabular-nums">{v}</dd>
    </div>
  )
}

// ─── Agent Room ──────────────────────────────────────────────────────────────

export default function AgentRoom({ agentId }: { agentId: string }) {
  const world = useStore((s) => s.world)
  const log = useStore((s) => s.log)
  const chatPending = useStore((s) => s.chatPending)
  const highlightEventId = useStore((s) => s.highlightEventId)
  // workers don't hold conversations — their life is the record, so open there
  const [tab, setTab] = useState<'chat' | 'timeline'>(() =>
    world.agents.find((a) => a.id === agentId)?.kind === 'operator' ? 'chat' : 'timeline',
  )
  const now = useNow()

  const agent = world.agents.find((a) => a.id === agentId)
  const pending = chatPending[agentId] === true

  const messages = useMemo(
    () => log.filter((e) => e.type === 'Chat' && (e.from?.id === agentId || e.to?.id === agentId)),
    [log, agentId],
  )

  // consecutive messages from one voice fold under a single sender line
  const groups = useMemo<ThreadGroup[]>(() => {
    const out: ThreadGroup[] = []
    for (const e of messages) {
      const fromPerson = e.from?.kind === 'person'
      const senderId = e.from?.id ?? 'system'
      const last = out[out.length - 1]
      if (last && last.senderId === senderId && last.fromPerson === fromPerson) last.msgs.push(e)
      else out.push({ key: e.id, fromPerson, senderId, msgs: [e] })
    }
    return out
  }, [messages])

  // timeline = every non-chat event this agent touched, plus the task it is on now
  const currentTaskId = world.agentTask.get(agentId)
  const timeline = useMemo(() => {
    const seen = new Set<string>()
    const out: WorldEvent[] = []
    for (const e of log) {
      if (e.type === 'Chat') continue
      const mine = e.from?.id === agentId || e.to?.id === agentId
      const onMyTask = currentTaskId != null && e.taskId === currentTaskId
      if (!mine && !onMyTask) continue
      if (seen.has(e.id)) continue
      seen.add(e.id)
      out.push(e)
    }
    return out
  }, [log, agentId, currentTaskId])

  // a blueprint waiting on a human, proposed by (or into) this room
  const blueprint = world.approvals.find(
    (a) =>
      a.kind === 'blueprint' &&
      a.blueprint &&
      (a.requestedBy?.id === agentId || (a.deptId === agent?.deptId && agent?.kind === 'operator')),
  )

  const chatScroll = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = chatScroll.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length, pending, blueprint?.eventId, tab])

  if (!agent) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-[13px] text-mut">This agent does not exist yet.</p>
        <button className="btn" onClick={() => useStore.getState().closePanel()}>Close</button>
      </div>
    )
  }

  const deptName = deptById.get(agent.deptId)?.name ?? agent.deptId
  const owner = personById.get(agent.ownerId)
  const status: AgentStatus = world.agentStatus.get(agentId) ?? 'idle'
  const currentTask = currentTaskId ? world.tasks.get(currentTaskId) : undefined
  const departmentHue = owner ? `hsl(${owner.hue} 56% 52%)` : 'var(--color-linebright)'

  return (
    <div className="flex h-full flex-col">
      {/* ── header ── */}
      <div className="flex shrink-0 items-start gap-2.5 border-b border-line px-3 py-2.5">
        <StatusDot status={status} className="mt-1.5" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-[14px] font-semibold">{agent.name}</h2>
            <Chip className="shrink-0">{agent.kind === 'operator' ? 'Department Agent' : 'Worker'}</Chip>
          </div>
          <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[12px]">
            <span aria-hidden className="h-3 w-0.5 shrink-0 rounded-full" style={{ background: departmentHue }} />
            <button
              className="shrink-0 rounded px-1 py-0.5 text-mut transition-colors hover:bg-hover hover:text-ink"
              onClick={() => {
                const st = useStore.getState()
                st.openPanel('dept', agent.deptId)
                st.requestCamera({ type: 'dept', deptId: agent.deptId })
              }}
            >
              {deptName}
            </button>
            <span className="text-dim">·</span>
            <span
              className={cx(
                'min-w-0 truncate',
                status === 'idle' && 'text-dim',
                status === 'working' && 'text-task',
                status === 'blocked' && 'text-permission',
              )}
            >
              {status}
              {currentTask && status !== 'idle' && ` · ${currentTask.title}`}
            </span>
          </div>
        </div>

        {owner && (
          <div className="flex shrink-0 items-center gap-1.5">
            <Avatar personId={owner.id} />
            <span className="max-w-28 truncate text-[12px] text-mut">{owner.name}</span>
          </div>
        )}
        <button
          className="shrink-0 rounded px-1.5 py-0.5 text-[14px] text-dim transition-colors hover:bg-hover hover:text-ink"
          title="Close"
          onClick={() => useStore.getState().closePanel()}
        >
          ✕
        </button>
      </div>

      {/* ── info strip ── */}
      <div className="shrink-0 border-b border-line px-3 py-2">
        <p className="text-[12px] leading-snug text-mut">{agent.purpose}</p>
        {agent.skills.length > 0 && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            <Label>skills</Label>
            {agent.skills.map((s) => (
              <Chip key={s}>{s}</Chip>
            ))}
          </div>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          <Label>tools</Label>
          {agent.toolIds.length === 0 ? (
            <span className="text-[11px] text-dim">none granted</span>
          ) : (
            agent.toolIds.map((id) => {
              const t = toolById.get(id)
              const needsAuth = t?.requiresAuth === true && t.connected !== true
              return (
                <Chip
                  key={id}
                  className={cx(needsAuth && 'border-permission/40 text-permission')}
                  title={needsAuth ? 'Owner must connect this account' : t?.kind}
                >
                  {needsAuth && <LockGlyph />}
                  {t?.name ?? id}
                </Chip>
              )
            })
          )}
        </div>
        {agentId === LAUNCH_AGENT_ID && (
          <button className="btn mt-2 h-7 px-2.5 py-1 text-[12px]" onClick={() => useStore.getState().openPanel('diff')}>
            View inheritance diff
          </button>
        )}
      </div>

      {/* ── tabs ── */}
      <div className="flex shrink-0 items-center gap-1 border-b border-line px-2">
        <TabButton active={tab === 'chat'} onClick={() => setTab('chat')}>Conversation</TabButton>
        <TabButton active={tab === 'timeline'} onClick={() => setTab('timeline')}>
          Timeline
          <span
            className={cx(
              'ml-1.5 rounded px-1 font-mono text-[10px] tabular-nums',
              tab === 'timeline' ? 'bg-task/15 text-task' : 'bg-raised text-dim',
            )}
          >
            {timeline.length}
          </span>
        </TabButton>
      </div>

      {/* ── body ── */}
      {tab === 'chat' ? (
        <div ref={chatScroll} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-3">
          {messages.length === 0 && !blueprint && (
            <p className="py-6 text-center text-[12px] text-dim">
              No conversation yet. Ask for work, a status read, or a brand-new agent.
            </p>
          )}
          {groups.map((g) => (
            <MessageGroup key={g.key} group={g} agentName={agent.name} now={now} />
          ))}
          {blueprint?.blueprint && <BlueprintCard approval={blueprint} now={now} />}
          {pending && <Thinking agentName={agent.name} />}
        </div>
      ) : (
        <TimelineList events={timeline} highlightEventId={highlightEventId} now={now} />
      )}

      <Composer agentId={agentId} />
    </div>
  )
}

function TabButton({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cx(
        '-mb-px flex items-center border-b-2 px-2.5 py-1.5 text-[12px] transition-colors',
        active ? 'border-task text-ink' : 'border-transparent text-mut hover:text-ink',
      )}
    >
      {children}
    </button>
  )
}

// ─── Conversation ────────────────────────────────────────────────────────────

interface ThreadGroup {
  key: string
  fromPerson: boolean
  senderId: string
  msgs: WorldEvent[]
}

/**
 * Editorial thread: a small-caps sender line with a mono timestamp, then plain
 * paragraphs. The agent's voice hangs off a 2px hairline instead of a bubble.
 */
function MessageGroup({ group, agentName, now }: { group: ThreadGroup; agentName: string; now: number }) {
  const who = group.fromPerson ? personById.get(group.senderId)?.name ?? 'You' : agentName
  const first = group.msgs[0]
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span
          className={cx(
            'truncate text-[11px] font-semibold uppercase tracking-[0.12em]',
            group.fromPerson ? 'text-ink' : 'text-mut',
          )}
        >
          {who}
        </span>
        {first && (
          <span className="flex shrink-0 items-baseline gap-1.5">
            {group.msgs.some((m) => m.payload?.simulated === true) && (
              <span className="rounded-sm border border-linebright bg-surface px-1 py-px font-mono text-[9px] uppercase tracking-wider text-mut">SIM</span>
            )}
            <span className="font-mono text-[10px] text-dim tabular-nums">{timeAgo(first.ts, now)}</span>
          </span>
        )}
      </div>
      <div className={cx('mt-1.5 space-y-1.5', !group.fromPerson && 'border-l-2 border-linebright pl-3')}>
        {group.msgs.map((e) => (
          <p key={e.id} className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink">
            {e.payload?.text ?? e.title}
          </p>
        ))}
      </div>
    </div>
  )
}

function Thinking({ agentName }: { agentName: string }) {
  return (
    <div className="border-l-2 border-linebright pl-3">
      <span className="inline-flex items-baseline gap-1.5 text-[12px] text-dim">
        {agentName} is thinking
        <span className="inline-flex items-center gap-[3px]">
          {[0, 1, 2].map((i) => (
            <span key={i} className="size-[3px] rounded-full bg-dim" />
          ))}
        </span>
      </span>
    </div>
  )
}

/** The blueprint as a formal spec sheet: header band, hairline-ruled sections, sign-off. */
function BlueprintCard({ approval, now }: { approval: PendingApproval; now: number }) {
  const personaId = useStore((s) => s.persona?.id)
  const bp = approval.blueprint
  if (!bp) return null
  const owner = personById.get(bp.ownerId)
  const deptName = deptById.get(bp.deptId)?.name ?? bp.deptId
  // same consent note the approval cards carry: you are signing in someone's name
  const actingFor = owner && personaId !== bp.ownerId ? owner.name : null
  return (
    <div className="anim-fadeup overflow-hidden rounded border border-linebright bg-surface">
      {/* header band */}
      <div className="flex items-center gap-2.5 border-b border-linebright bg-raised px-3 py-2">
        <span className="shrink-0 font-mono text-[9.5px] font-medium tracking-[0.22em] text-mut">
          BLUEPRINT
        </span>
        <span aria-hidden className="h-3.5 w-px shrink-0 bg-linebright" />
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{bp.name}</span>
        <span className="shrink-0 rounded-sm border border-linebright bg-surface px-1.5 py-px font-mono text-[9px] text-mut tabular-nums">
          v1
        </span>
      </div>

      <div className="divide-y divide-line">
        <SpecSection label="Objective">
          <p>{bp.purpose}</p>
          <p className="mt-1.5 font-mono text-[10px] text-dim">
            <span className="uppercase tracking-[0.08em]">trigger</span> — {bp.trigger}
          </p>
        </SpecSection>

        {(bp.skills.length > 0 || bp.collaborators.length > 0) && (
          <SpecSection label="Skills & collaborators">
            {bp.skills.length > 0 && <p>{bp.skills.join(' · ')}</p>}
            {bp.collaborators.length > 0 && (
              <p className="mt-1 text-mut">Works with {bp.collaborators.join(', ')}</p>
            )}
          </SpecSection>
        )}

        {bp.toolIds.length > 0 && (
          <SpecSection label="Tools & scopes">
            <ul className="space-y-1">
              {bp.toolIds.map((id) => {
                const t = toolById.get(id)
                const needsAuth = t?.requiresAuth === true && t.connected !== true
                return (
                  <li key={id} className="flex items-baseline gap-2">
                    <span>{t?.name ?? id}</span>
                    {t?.kind && <span className="font-mono text-[10px] text-dim">{t.kind}</span>}
                    {needsAuth && (
                      <span className="ml-auto shrink-0 font-mono text-[9px] uppercase tracking-[0.08em] text-permission">
                        auth required
                      </span>
                    )}
                  </li>
                )
              })}
            </ul>
          </SpecSection>
        )}

        {bp.limits.length > 0 && (
          <SpecSection label="Inherited guardrails" tone="text-guard">
            <ul className="space-y-1">
              {bp.limits.map((l) => (
                <li key={l} className="flex gap-2">
                  <span aria-hidden className="mt-[0.55em] h-px w-2.5 shrink-0 bg-guard/70" />
                  <span>{l}</span>
                </li>
              ))}
            </ul>
          </SpecSection>
        )}

        {bp.approvals.length > 0 && (
          <SpecSection label="Escalation path" tone="text-escalation">
            <ul className="space-y-1">
              {bp.approvals.map((a) => (
                <li key={a} className="flex gap-2">
                  <span aria-hidden className="mt-[0.55em] h-px w-2.5 shrink-0 bg-escalation/70" />
                  <span>{a}</span>
                </li>
              ))}
            </ul>
          </SpecSection>
        )}
      </div>

      {/* sign-off */}
      <div className="flex flex-wrap items-center gap-2 border-t border-linebright px-3 py-2">
        <button className="btn btn-primary" onClick={() => useStore.getState().approve(approval)}>
          Approve blueprint
        </button>
        <button className="btn" onClick={() => useStore.getState().openPanel('diff')}>
          View inheritance
        </button>
        <span className="ml-auto text-right text-[10.5px] leading-tight text-dim tabular-nums">
          {owner ? `${owner.name} signs this off` : deptName}
          <span className="block font-mono text-[9.5px]">{timeAgo(approval.ts, now)}</span>
        </span>
        {actingFor && (
          <span className="w-full font-mono text-[9.5px] text-dim">acting for {actingFor} (demo)</span>
        )}
      </div>
    </div>
  )
}

function SpecSection({ label, tone, children }: { label: string; tone?: string; children: ReactNode }) {
  return (
    <section className="px-3 py-2">
      <h4 className={cx('font-mono text-[9.5px] uppercase tracking-[0.18em]', tone ?? 'text-dim')}>
        {label}
      </h4>
      <div className="mt-1.5 text-[12.5px] leading-relaxed text-ink">{children}</div>
    </section>
  )
}

// ─── Timeline ────────────────────────────────────────────────────────────────

/** Milestones get a ring around their dot on the rail. */
const MAJOR_EVENTS = new Set<EventType>(['TaskCompleted', 'AgentSpawned', 'GuardrailBlock'])

interface RailTone {
  dot: string
  ring: string
  label: string
  title?: string
}

/** Dot color for an event: explicit types win, otherwise the edge it travels on. */
function railTone(e: WorldEvent): RailTone {
  if (e.type === 'GuardrailBlock')
    return { dot: 'bg-guard', ring: 'border-guard/40', label: 'text-guard', title: 'text-guard' }
  if (e.type === 'Escalation' || e.type === 'TaskFailed' || e.edge === 'escalation')
    return { dot: 'bg-escalation', ring: 'border-escalation/40', label: 'text-escalation', title: 'text-escalation' }
  if (e.type === 'ToolCall')
    return { dot: 'bg-linebright', ring: 'border-linebright', label: 'text-dim' }
  if (e.type === 'PermissionRequest' || e.type === 'AuthRequired' || e.edge === 'permission')
    return { dot: 'bg-permission', ring: 'border-permission/40', label: 'text-dim' }
  if (e.type === 'ArtifactDelivered' || e.edge === 'artifact')
    return { dot: 'bg-artifact', ring: 'border-artifact/40', label: 'text-dim' }
  if (e.edge === 'task' || e.type.startsWith('Task') || e.type.startsWith('Blueprint') || e.type === 'AgentSpawned' || e.type === 'DelegatedTo')
    return { dot: 'bg-task', ring: 'border-task/40', label: 'text-dim' }
  return { dot: 'bg-linebright', ring: 'border-linebright', label: 'text-dim' }
}

function DocGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 10 12" className={cx('size-[11px] shrink-0', className)} aria-hidden="true">
      <path
        d="M1.5 0.5h4.5L9 3.3V11a.5.5 0 0 1-.5.5h-7A.5.5 0 0 1 1 11V1a.5.5 0 0 1 .5-.5Z"
        fill="none" stroke="currentColor" strokeWidth="1"
      />
      <path d="M6 0.5v3h3" fill="none" stroke="currentColor" strokeWidth="1" />
      <path d="M3 6.5h4M3 8.5h4" stroke="currentColor" strokeWidth="0.9" />
    </svg>
  )
}

function TimelineList({
  events, highlightEventId, now,
}: { events: WorldEvent[]; highlightEventId: string | null; now: number }) {
  const scroll = useRef<HTMLDivElement>(null)
  const rows = useRef(new Map<string, HTMLDivElement>())
  const [open, setOpen] = useState<Set<string>>(() => new Set())
  const [flash, setFlash] = useState<string | null>(null)

  useEffect(() => {
    const el = scroll.current
    if (el) el.scrollTop = el.scrollHeight
  }, [events.length])

  // two-way map linking: the map lights an event, we bring its row into view
  useEffect(() => {
    if (!highlightEventId) return
    const el = rows.current.get(highlightEventId)
    if (!el) return
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    setFlash(highlightEventId)
    const t = setTimeout(() => setFlash(null), 1400)
    return () => clearTimeout(t)
  }, [highlightEventId])

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  if (events.length === 0) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-5">
        <p className="text-center text-[12px] text-dim">Nothing on the record for this agent yet.</p>
      </div>
    )
  }

  return (
    <div ref={scroll} className="min-h-0 flex-1 overflow-y-auto py-2 pr-1">
      <div className="relative">
        {/* the execution rail */}
        <div aria-hidden className="absolute top-2 bottom-2 left-[15px] w-px bg-line" />
        {events.map((e) => {
          const isOpen = open.has(e.id)
          const lit = highlightEventId === e.id || flash === e.id
          const tone = railTone(e)
          const major = MAJOR_EVENTS.has(e.type)
          const isArtifact = e.type === 'ArtifactDelivered'
          return (
            <div
              key={e.id}
              data-event-id={e.id}
              ref={(el) => {
                if (el) rows.current.set(e.id, el)
                else rows.current.delete(e.id)
              }}
              onMouseEnter={() => useStore.getState().setHighlight(e.id)}
              onMouseLeave={() => useStore.getState().setHighlight(null)}
              className={cx(
                'group relative ml-[26px] rounded transition-colors',
                lit ? 'bg-task/8 ring-1 ring-task/25 ring-inset' : 'hover:bg-hover',
              )}
            >
              {/* typed dot sitting on the rail */}
              <span aria-hidden className="absolute top-[11px] -left-[15px] flex size-[9px] items-center justify-center">
                {major && <span className={cx('absolute inset-0 rounded-full border bg-surface', tone.ring)} />}
                <span className={cx('relative size-[5px] rounded-full', tone.dot)} />
              </span>
              <div className="flex items-start">
                <button
                  className="min-w-0 flex-1 py-1.5 pl-2.5 text-left"
                  onClick={() => {
                    if (e.taskId) useStore.getState().selectTask(e.taskId)
                    if (isArtifact) useStore.getState().openArtifact(e.id)
                    else toggle(e.id)
                  }}
                >
                  <span className="flex items-baseline gap-2">
                    {isArtifact && <DocGlyph className="self-center text-artifact" />}
                    <span className={cx('min-w-0 flex-1 truncate text-[12.5px] leading-[18px]', tone.title ?? 'text-ink')}>
                      {e.title}
                    </span>
                    {isArtifact && (
                      <span className="hidden shrink-0 font-mono text-[9px] tracking-[0.08em] text-artifact uppercase group-hover:inline">
                        open →
                      </span>
                    )}
                    <span className="shrink-0 font-mono text-[10px] text-dim tabular-nums">{timeAgo(e.ts, now)}</span>
                  </span>
                  <span className="mt-0.5 flex items-center gap-1.5 font-mono text-[9.5px] tracking-[0.06em]">
                    <span className={tone.label}>{typeLabel(e.type)}</span>
                    {e.taskId && <span className="text-dim/70">· {e.taskId}</span>}
                  </span>
                </button>
                <button
                  className="shrink-0 px-2 pt-[9px] pb-1 text-[8px] text-dim hover:text-ink"
                  title={isOpen ? 'Collapse' : 'Details'}
                  onClick={() => toggle(e.id)}
                >
                  <span className={cx('inline-block transition-transform', isOpen && 'rotate-90')}>▶</span>
                </button>
              </div>
              {isOpen && <EventDetail e={e} />}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function EventDetail({ e }: { e: WorldEvent }) {
  const pl = e.payload
  const blockedPerson = e.blockedOn ? personById.get(e.blockedOn.personId) : undefined
  return (
    <div className="border-t border-line pt-2 pr-2 pb-2.5 pl-2.5">
      {e.detail && <p className="mb-2 text-[11.5px] leading-snug text-mut">{e.detail}</p>}
      <dl className="space-y-1 text-[12px]">
        {pl?.objective && <Row k="objective" v={pl.objective} />}
        {pl?.deadline && <Row k="deadline" v={pl.deadline} />}
        {pl?.sharedContext && <Row k="shared context" v={pl.sharedContext} />}
        {pl?.expected && <Row k="expected" v={pl.expected} />}
        {pl?.visibility && <Row k="visibility" v={pl.visibility} />}
        {pl?.artifact && <Row k="artifact" v={`${pl.artifact.name} · ${pl.artifact.type}`} />}
        {pl?.tool && <Row k="tool" v={pl.tool} />}
        {pl?.action && <Row k="action" v={pl.action} />}
        {pl?.costUsd != null && <Row k="cost" v={fmtUsd(pl.costUsd)} />}
        {pl?.latencyMs != null && <Row k="latency" v={`${pl.latencyMs} ms`} />}
        {e.blockedOn && (
          <Row k="blocked on" v={`${e.blockedOn.what} — ${blockedPerson?.name ?? e.blockedOn.personId}`} />
        )}
      </dl>
    </div>
  )
}

// ─── Composer ────────────────────────────────────────────────────────────────

function MicGlyph() {
  return (
    <svg viewBox="0 0 12 16" className="size-3.5" aria-hidden="true">
      <rect x="4" y="1" width="4" height="8" rx="2" fill="currentColor" />
      <path d="M1.8 7.4a4.2 4.2 0 0 0 8.4 0" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M6 11.6V14.4" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

/** The scripted ask, parked in the hint row where it has room to be read. */
const SUGGESTION = 'I need an agent for the Summit Series launch'

function Composer({ agentId }: { agentId: string }) {
  const [text, setText] = useState('')
  const [interim, setInterim] = useState('')
  const [listening, setListening] = useState(false)
  const rec = useRef<SpeechRecognitionLike | null>(null)
  const supported = useMemo(() => recognitionCtor() != null, [])

  useEffect(() => () => { rec.current?.stop() }, [])

  const send = (value: string) => {
    const v = value.trim()
    if (!v) return
    useStore.getState().sendChat(agentId, v)
    setText('')
    setInterim('')
  }

  const toggleMic = () => {
    const Ctor = recognitionCtor()
    if (!Ctor) return
    if (listening) {
      rec.current?.stop()
      return
    }
    const r = new Ctor()
    r.lang = 'en-US'
    r.interimResults = true
    r.continuous = false
    r.onresult = (event) => {
      let final = ''
      let live = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i]
        const chunk = res[0]?.transcript ?? ''
        if (res.isFinal) final += chunk
        else live += chunk
      }
      setInterim(live)
      if (final.trim()) {
        setText(final.trim())
        r.stop()
        send(final)
      }
    }
    r.onerror = () => {
      setListening(false)
      setInterim('')
    }
    r.onend = () => {
      setListening(false)
      setInterim('')
    }
    rec.current = r
    setListening(true)
    r.start()
  }

  const shown = listening && interim ? interim : text
  const ready = shown.trim().length > 0

  return (
    <div className="shrink-0 border-t border-line px-3 py-2">
      <div
        className={cx(
          'flex items-center gap-2 rounded border bg-raised px-2 py-1 transition-colors',
          listening ? 'border-task/50' : 'border-line focus-within:border-linebright',
        )}
      >
        <input
          value={shown}
          onChange={(e) => {
            setText(e.target.value)
            setInterim('')
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send(shown)
            }
          }}
          placeholder="Ask for work, a status, or a new agent…"
          className="min-w-0 flex-1 bg-transparent py-1 text-[12px] text-ink placeholder:text-dim focus:outline-none"
        />
        <button
          onClick={toggleMic}
          disabled={!supported}
          title={supported ? (listening ? 'Stop listening' : 'Speak your message') : 'Voice input needs Chrome'}
          className={cx(
            'flex size-7 shrink-0 items-center justify-center rounded border transition-colors',
            !supported && 'cursor-not-allowed border-line text-dim opacity-40',
            supported && listening && 'border-task/60 bg-task/15 text-task',
            supported && !listening && 'border-line text-mut hover:border-linebright hover:text-ink',
          )}
        >
          <MicGlyph />
        </button>
        <button
          onClick={() => send(shown)}
          disabled={!ready}
          title="Send"
          className={cx(
            'shrink-0 rounded border px-2.5 py-1 text-[12px] transition-colors',
            ready
              ? 'border-task/40 bg-task/10 text-task hover:border-task/60 hover:bg-task/20'
              : 'cursor-not-allowed border-line text-dim',
          )}
        >
          Send
        </button>
      </div>
      <div className="mt-1 flex items-center gap-1.5 text-[10px] text-dim">
        {listening ? (
          <span className="text-task">Listening — speak now</span>
        ) : (
          <>
            <span className="kbd">↵</span>
            <span>to send</span>
            <span aria-hidden className="text-linebright">·</span>
            <button
              className="min-w-0 truncate font-mono text-[10px] text-dim hover:text-mut"
              title="Use this prompt"
              onClick={() => setText(SUGGESTION)}
            >
              try: “{SUGGESTION}”
            </button>
          </>
        )}
      </div>
    </div>
  )
}
