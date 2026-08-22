import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useStore } from '../store'
import { LAUNCH_AGENT_ID, deptById, personById, toolById } from '../data/company'
import { cx, fmtUsd, timeAgo } from '../utils'
import type { AgentStatus, PendingApproval, WorldEvent } from '../types'

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
      title={`${p.name} — ${p.role}`}
      className="flex size-6 shrink-0 items-center justify-center rounded-full border border-linebright text-[9px] font-bold"
      style={{ background: `hsl(${p.hue} 52% 87%)` }}
    >
      {p.initials}
    </span>
  )
}

function Label({ children }: { children: ReactNode }) {
  return <span className="font-mono text-[10px] uppercase tracking-wide text-dim">{children}</span>
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-24 shrink-0 font-mono text-[10px] uppercase tracking-wide text-dim">{k}</dt>
      <dd className="min-w-0 flex-1 text-mut">{v}</dd>
    </div>
  )
}

/** Chip tone for an event: explicit types win, otherwise the edge it travels on. */
function eventTone(e: WorldEvent): string {
  if (e.type === 'GuardrailBlock') return 'border-guard/50 text-guard'
  if (e.type === 'ToolCall') return 'border-line text-mut'
  switch (e.edge) {
    case 'task': return 'border-task/50 text-task'
    case 'artifact': return 'border-artifact/50 text-artifact'
    case 'permission': return 'border-permission/50 text-permission'
    case 'escalation': return 'border-escalation/50 text-escalation'
    default: return 'border-line text-mut'
  }
}

// ─── Agent Room ──────────────────────────────────────────────────────────────

export default function AgentRoom({ agentId }: { agentId: string }) {
  const world = useStore((s) => s.world)
  const log = useStore((s) => s.log)
  const chatPending = useStore((s) => s.chatPending)
  const highlightEventId = useStore((s) => s.highlightEventId)
  const [tab, setTab] = useState<'chat' | 'timeline'>('chat')
  const now = useNow()

  const agent = world.agents.find((a) => a.id === agentId)
  const pending = chatPending[agentId] === true

  const messages = useMemo(
    () => log.filter((e) => e.type === 'Chat' && (e.from?.id === agentId || e.to?.id === agentId)),
    [log, agentId],
  )

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

  return (
    <div className="flex h-full flex-col">
      {/* ── header ── */}
      <div className="flex shrink-0 items-start gap-2.5 border-b border-line px-3.5 py-3">
        <StatusDot status={status} className="mt-1.5" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-[15px] font-semibold">{agent.name}</h2>
            <Chip className="shrink-0">{agent.kind === 'operator' ? 'Department Agent' : 'Worker'}</Chip>
          </div>
          <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px]">
            <button
              className="shrink-0 rounded px-1 py-0.5 text-mut hover:bg-hover hover:text-ink"
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
            <span className="max-w-28 truncate text-[11px] text-mut">{owner.name}</span>
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

      {/* ── info strip ── */}
      <div className="shrink-0 border-b border-line px-3.5 py-2.5">
        <p className="text-[12px] leading-snug text-mut">{agent.purpose}</p>
        {agent.skills.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1">
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
                  tone={needsAuth ? 'border-permission/40 text-permission' : undefined}
                  title={needsAuth ? 'Owner must connect this account' : t?.kind}
                >
                  {t?.name ?? id}
                </Chip>
              )
            })
          )}
        </div>
        {agentId === LAUNCH_AGENT_ID && (
          <button className="btn mt-2.5" onClick={() => useStore.getState().openPanel('diff')}>
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
              'ml-1.5 rounded px-1 font-mono text-[10px]',
              tab === 'timeline' ? 'bg-task/15 text-task' : 'bg-raised text-dim',
            )}
          >
            {timeline.length}
          </span>
        </TabButton>
      </div>

      {/* ── body ── */}
      {tab === 'chat' ? (
        <div ref={chatScroll} className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-3.5 py-3">
          {messages.length === 0 && !blueprint && (
            <p className="py-6 text-center text-[12px] text-dim">
              No conversation yet. Ask for work, a status read, or a brand-new agent.
            </p>
          )}
          {messages.map((e) => (
            <Bubble key={e.id} e={e} agentName={agent.name} now={now} />
          ))}
          {blueprint?.blueprint && <BlueprintCard approval={blueprint} now={now} />}
          {pending && <Typing />}
        </div>
      ) : (
        <TimelineList events={timeline} highlightEventId={highlightEventId} now={now} />
      )}

      <Composer agentId={agentId} deptName={deptName} />
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
        '-mb-px flex items-center border-b-2 px-2.5 py-2 text-[12px] transition-colors',
        active ? 'border-task text-ink' : 'border-transparent text-mut hover:text-ink',
      )}
    >
      {children}
    </button>
  )
}

// ─── Conversation ────────────────────────────────────────────────────────────

function Bubble({ e, agentName, now }: { e: WorldEvent; agentName: string; now: number }) {
  const fromPerson = e.from?.kind === 'person'
  const who = fromPerson ? personById.get(e.from?.id ?? '')?.name ?? 'You' : agentName
  const text = e.payload?.text ?? e.title
  return (
    <div className={cx('flex', fromPerson ? 'justify-end' : 'justify-start')}>
      <div
        className={cx(
          'max-w-[86%] rounded-lg border px-2.5 py-1.5',
          fromPerson ? 'border-task/30 bg-task/10' : 'border-line bg-raised',
        )}
      >
        <div className="text-[13px] leading-snug whitespace-pre-wrap">{text}</div>
        <div className={cx('mt-1 text-[10px]', fromPerson ? 'text-task/70' : 'text-dim')}>
          {who} · {timeAgo(e.ts, now)}
        </div>
      </div>
    </div>
  )
}

function Typing() {
  return (
    <div className="flex justify-start">
      <div className="flex items-center gap-1 rounded-lg border border-line bg-raised px-3 py-2.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="size-1.5 animate-pulse rounded-full bg-dim"
            style={{ animationDelay: `${i * 180}ms`, animationDuration: '1.1s' }}
          />
        ))}
      </div>
    </div>
  )
}

function BlueprintCard({ approval, now }: { approval: PendingApproval; now: number }) {
  const bp = approval.blueprint
  if (!bp) return null
  const owner = personById.get(bp.ownerId)
  const tools = bp.toolIds.map((id) => toolById.get(id)?.name ?? id).join(' · ')
  return (
    <div className="anim-fadeup rounded-lg border border-task/30 bg-task/5 p-3">
      <div className="flex items-center gap-2">
        <Chip tone="border-task/50 text-task" size="sm" className="font-mono tracking-wide">BLUEPRINT</Chip>
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{bp.name}</span>
        <span className="shrink-0 text-[10px] text-dim">{timeAgo(approval.ts, now)}</span>
      </div>
      <dl className="mt-2.5 space-y-1 text-[11.5px]">
        <Row k="purpose" v={bp.purpose} />
        <Row k="trigger" v={bp.trigger} />
        {bp.skills.length > 0 && <Row k="skills" v={bp.skills.join(' · ')} />}
        {tools && <Row k="tools" v={tools} />}
        {bp.collaborators.length > 0 && <Row k="collaborators" v={bp.collaborators.join(' · ')} />}
        {bp.approvals.length > 0 && <Row k="approvals" v={bp.approvals.join(' · ')} />}
        {bp.limits.length > 0 && <Row k="limits" v={bp.limits.join(' · ')} />}
      </dl>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button className="btn btn-primary" onClick={() => useStore.getState().approve(approval)}>
          Approve blueprint
        </button>
        <button className="btn" onClick={() => useStore.getState().openPanel('diff')}>
          View inheritance
        </button>
        {owner && <span className="text-[11px] text-dim">{owner.name} signs this off</span>}
      </div>
    </div>
  )
}

// ─── Timeline ────────────────────────────────────────────────────────────────

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
      <div className="min-h-0 flex-1 overflow-y-auto px-3.5 py-6">
        <p className="text-center text-[12px] text-dim">Nothing on the record for this agent yet.</p>
      </div>
    )
  }

  return (
    <div ref={scroll} className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2.5 py-3">
      {events.map((e) => {
        const isOpen = open.has(e.id)
        const lit = highlightEventId === e.id || flash === e.id
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
              'rounded-lg border transition-colors',
              lit
                ? 'border-task/40 bg-raised ring-1 ring-task/60'
                : 'border-transparent hover:border-line hover:bg-hover',
            )}
          >
            <button
              className="flex w-full items-center gap-2 px-2 py-1.5 text-left"
              onClick={() => {
                toggle(e.id)
                if (e.taskId) useStore.getState().selectTask(e.taskId)
              }}
            >
              <Chip tone={eventTone(e)} size="sm" className="shrink-0 font-mono">{e.type}</Chip>
              <span className="min-w-0 flex-1 truncate text-[12.5px]">{e.title}</span>
              <span className="shrink-0 text-[10px] text-dim">{timeAgo(e.ts, now)}</span>
              <span className={cx('shrink-0 text-[9px] text-dim transition-transform', isOpen && 'rotate-90')}>
                ▶
              </span>
            </button>
            {isOpen && <EventDetail e={e} />}
          </div>
        )
      })}
    </div>
  )
}

function EventDetail({ e }: { e: WorldEvent }) {
  const pl = e.payload
  const blockedPerson = e.blockedOn ? personById.get(e.blockedOn.personId) : undefined
  return (
    <div className="border-t border-line px-2 pt-2 pb-2.5">
      {e.detail && <p className="mb-2 text-[11.5px] leading-snug text-mut">{e.detail}</p>}
      <dl className="space-y-1 text-[11.5px]">
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

function Composer({ agentId, deptName }: { agentId: string; deptName: string }) {
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
    <div className="shrink-0 border-t border-line px-3 py-2.5">
      <div
        className={cx(
          'flex items-center gap-2 rounded-lg border bg-raised px-2 py-1 transition-colors',
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
          placeholder={`Ask the ${deptName} Agent — or say "I need an agent for the Summit launch"`}
          className="min-w-0 flex-1 bg-transparent py-1 text-[13px] text-ink placeholder:text-dim focus:outline-none"
        />
        <button
          onClick={toggleMic}
          disabled={!supported}
          title={supported ? (listening ? 'Stop listening' : 'Speak your message') : 'Voice input needs Chrome'}
          className={cx(
            'flex size-7 shrink-0 items-center justify-center rounded-md border transition-colors',
            !supported && 'cursor-not-allowed border-line text-dim opacity-40',
            supported && listening && 'anim-work border-task/60 bg-task/15 text-task',
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
            'shrink-0 rounded-md border px-2.5 py-1 text-[12px] transition-colors',
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
          </>
        )}
      </div>
    </div>
  )
}
