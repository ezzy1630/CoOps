import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { deptById, personById, PERSONAS } from '../data/company'
import { virtualAt } from '../engine/replay'
import { Wordmark } from '../App'
import { cx, fmtClock } from '../utils'

export default function Header() {
  const persona = useStore((s) => s.persona)
  const panel = useStore((s) => s.panel)
  const selectedTaskId = useStore((s) => s.selectedTaskId)
  const world = useStore((s) => s.world)
  const presence = useStore((s) => s.presence)
  const replay = useStore((s) => s.replay)
  const theme = useStore((s) => s.theme)
  const approvalsCount = world.approvals.length

  // ── breadcrumb of place ──
  const crumbs: { label: string; onClick?: () => void }[] = [
    {
      label: 'Everpeak',
      onClick: () => {
        const st = useStore.getState()
        st.closePanel()
        st.selectTask(null)
        st.requestCamera({ type: 'fit' })
      },
    },
  ]
  const agent = panel?.kind === 'agent' ? world.agents.find((a) => a.id === panel.id) : null
  const deptId = panel?.kind === 'dept' ? panel.id : agent?.deptId
  if (deptId) {
    crumbs.push({
      label: deptById.get(deptId)?.name ?? deptId,
      onClick: () => {
        const st = useStore.getState()
        st.openPanel('dept', deptId)
        st.requestCamera({ type: 'dept', deptId })
      },
    })
  }
  if (agent) {
    crumbs.push({ label: agent.name, onClick: () => useStore.getState().openPanel('agent', agent.id) })
  }
  if (panel?.kind === 'approvals') crumbs.push({ label: 'Work & Approvals' })
  if (panel?.kind === 'activity') crumbs.push({ label: 'Activity' })
  if (panel?.kind === 'diff') crumbs.push({ label: 'Inheritance' })
  if (selectedTaskId) {
    const t = world.tasks.get(selectedTaskId)
    if (t) crumbs.push({ label: `Task ${t.id}` })
  }

  const roaming = presence.filter((p) => !p.where.startsWith('approval:')).slice(0, 4)

  return (
    <header className="z-30 flex h-12 shrink-0 items-center gap-3 border-b border-line bg-surface px-3">
      <Wordmark size={20} />
      <nav className="ml-2 flex min-w-0 items-center gap-1 text-[13px]">
        {crumbs.map((c, i) => (
          <span key={i} className="flex min-w-0 items-center gap-1">
            {i > 0 && <span className="text-dim">/</span>}
            <button
              onClick={c.onClick}
              className={cx(
                'max-w-44 truncate rounded px-1.5 py-0.5',
                c.onClick ? 'text-mut hover:bg-hover hover:text-ink' : 'text-ink',
                i === crumbs.length - 1 && 'text-ink',
              )}
            >
              {c.label}
            </button>
          </span>
        ))}
      </nav>

      <div className="flex-1" />

      <Clock replayVirtual={replay ? virtualAt(replay.knots, replay.wallMs) : null} />

      {/* multiplayer presence */}
      <div className="flex items-center -space-x-1.5">
        {roaming.map((m) => {
          const p = personById.get(m.personId)
          if (!p) return null
          return (
            <div
              key={m.personId}
              title={`${p.name} — viewing ${deptById.get(m.where)?.name ?? m.where}`}
              className="flex size-6 items-center justify-center rounded-full border border-linebright text-[9px] font-bold"
              style={{ background: `hsl(${p.hue} 52% 87%)` }}
            >
              {p.initials}
            </div>
          )
        })}
      </div>

      <button
        className={cx('btn relative h-8 text-xs', panel?.kind === 'approvals' && 'border-task/50 text-task')}
        onClick={() => useStore.getState().openPanel('approvals')}
      >
        Approvals
        {approvalsCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 flex size-4.5 items-center justify-center rounded-full bg-human text-[10px] font-bold text-surface">
            {approvalsCount}
          </span>
        )}
      </button>
      <button
        className={cx('btn h-8 text-xs', panel?.kind === 'activity' && 'border-task/50 text-task')}
        onClick={() => useStore.getState().openPanel('activity')}
      >
        Activity
      </button>
      <button className="btn h-8 gap-2 text-xs text-mut" onClick={() => useStore.getState().setPaletteOpen(true)}>
        Search <span className="kbd">⌘K</span>
      </button>
      <button
        className="btn h-8 w-8 p-0 text-mut"
        onClick={() => useStore.getState().toggleTheme()}
        title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {theme === 'dark' ? (
          <svg width="14" height="14" viewBox="0 0 16 16">
            <circle cx="8" cy="8" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
            <g stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
              <path d="M8 1.2v1.6M8 13.2v1.6M1.2 8h1.6M13.2 8h1.6M3.2 3.2l1.1 1.1M11.7 11.7l1.1 1.1M12.8 3.2l-1.1 1.1M4.3 11.7l-1.1 1.1" />
            </g>
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 16 16">
            <path
              d="M13.4 9.9A5.9 5.9 0 0 1 6.1 2.6 5.9 5.9 0 1 0 13.4 9.9Z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>
      <PersonaMenu personaId={persona?.id} />
    </header>
  )
}

function Clock({ replayVirtual }: { replayVirtual: number | null }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  if (replayVirtual != null) {
    return (
      <span className="chip border-task/40 text-task">
        REPLAY · {new Date(replayVirtual).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
      </span>
    )
  }
  return <span className="font-mono text-[11px] text-dim">{fmtClock(now)}</span>
}

function PersonaMenu({ personaId }: { personaId?: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const person = personaId ? personById.get(personaId) : null

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        className="flex size-8 items-center justify-center rounded-full border border-linebright text-[10px] font-bold hover:border-task/60"
        style={{ background: person ? `hsl(${person.hue} var(--av-s) var(--av-l))` : 'var(--color-raised)' }}
        onClick={() => setOpen((o) => !o)}
        title={person ? `${person.name} — switch persona` : 'Switch persona'}
      >
        {person?.initials}
      </button>
      {open && (
        <div className="panel anim-fadeup absolute top-10 right-0 z-40 w-64 p-1.5">
          <div className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-dim">Viewing as</div>
          {PERSONAS.map((p) => {
            const pp = personById.get(p.personId)!
            return (
              <button
                key={p.personId}
                className={cx(
                  'flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-hover',
                  p.personId === personaId && 'bg-raised',
                )}
                onClick={() => {
                  setOpen(false)
                  useStore.getState().switchPersona(p.personId)
                }}
              >
                <span
                  className="flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
                  style={{ background: `hsl(${pp.hue} 52% 87%)` }}
                >
                  {pp.initials}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[13px]">{pp.name}</span>
                  <span className="block truncate text-[11px] text-dim">{p.label}</span>
                </span>
              </button>
            )
          })}
          <div className="mt-1 border-t border-line pt-1">
            <button
              className="w-full rounded-lg px-2 py-1.5 text-left text-[12px] text-mut hover:bg-hover"
              onClick={() => {
                setOpen(false)
                useStore.getState().setFirstRunStep(0)
              }}
            >
              Replay the intro tour
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
