import { useEffect, useRef, useState } from 'react'
import { PERSONAS, personById } from '../data/company'
import { useStore, type AppView } from '../store'
import { cx } from '../utils'

/** The fixed chrome width used by the shell and the first-run tour anchors. */
export const NAV_RAIL_WIDTH = 104

type NavIconName = 'map' | 'approvals' | 'activity' | 'agents' | 'documents'

const NAV_ITEMS: { view: AppView; label: string; icon: NavIconName }[] = [
  { view: 'map', label: 'Map', icon: 'map' },
  { view: 'approvals', label: 'Approvals', icon: 'approvals' },
  { view: 'activity', label: 'Activity', icon: 'activity' },
  { view: 'agents', label: 'Agents', icon: 'agents' },
  { view: 'documents', label: 'Documents', icon: 'documents' },
]

export default function NavRail() {
  const view = useStore((s) => s.view)
  const approvals = useStore((s) => s.world.approvals.length)
  const persona = useStore((s) => s.persona)
  const theme = useStore((s) => s.theme)
  const mapActivity = useStore((s) => {
    if ([...s.world.agentStatus.values()].some((status) => status === 'working')) return true
    const now = Date.now()
    return s.log.some((event) => {
      if (!event.edge || !event.deptFrom || !event.deptTo) return false
      const age = now - event.ts
      return age >= 0 && age < (event.travelMs ?? 2400)
    })
  })

  return (
    <aside
      className="relative z-40 flex w-[104px] shrink-0 flex-col border-r border-line bg-surface"
      aria-label="Primary navigation"
    >
      <div className="flex h-14 shrink-0 items-center border-b border-line px-3">
        <div className="flex items-center gap-2 select-none">
          <span className="grid size-6 place-items-center rounded-md border border-linebright bg-raised font-mono text-[9px] font-semibold tracking-tight text-task">
            CO
          </span>
          <span className="text-[15px] font-semibold tracking-tight">CoOps</span>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-2 py-4">
        {NAV_ITEMS.map((item) => {
          const active = view === item.view
          return (
            <button
              key={item.view}
              type="button"
              aria-current={active ? 'page' : undefined}
              title={item.view === 'map' && mapActivity ? 'Map, live work in flight' : undefined}
              className={cx(
                'group relative flex h-[58px] w-full flex-col items-center justify-center gap-1 rounded-md border border-transparent text-[11px] text-mut transition-colors',
                'hover:bg-hover hover:text-ink',
                active && 'border-line bg-raised text-ink',
              )}
              onClick={() => useStore.getState().setView(item.view)}
            >
              {active && <span className="absolute inset-y-2 left-0 w-0.5 rounded-r bg-task" aria-hidden />}
              <span className={cx('relative text-dim transition-colors group-hover:text-ink', active && 'text-task')}>
                <NavIcon name={item.icon} />
                {item.view === 'map' && (
                  <span
                    className={cx(
                      'pointer-events-none absolute -top-1.5 -right-2 size-1.5 rounded-full bg-task',
                      mapActivity ? 'scale-100 opacity-100' : 'scale-50 opacity-0',
                    )}
                    style={{ transition: 'transform 180ms ease-out, opacity 180ms ease-out' }}
                    aria-hidden
                  />
                )}
                {item.view === 'approvals' && approvals > 0 && (
                  <span className="absolute -top-2 -right-3 flex min-w-4 items-center justify-center rounded-full bg-human px-1 text-[9px] font-semibold leading-4 text-surface">
                    {approvals > 99 ? '99+' : approvals}
                  </span>
                )}
              </span>
              <span>{item.label}</span>
            </button>
          )
        })}
      </nav>

      <div className="flex shrink-0 flex-col items-center gap-2 border-t border-line px-2 py-3">
        <button
          type="button"
          className="flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-transparent text-[11px] text-mut transition-colors hover:border-line hover:bg-hover hover:text-ink"
          onClick={() => useStore.getState().toggleTheme()}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          <ThemeIcon dark={theme === 'dark'} />
          <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
        </button>
        <PersonaMenu personaId={persona?.id} />
      </div>
    </aside>
  )
}

function PersonaMenu({ personaId }: { personaId?: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const person = personaId ? personById.get(personaId) : null

  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div ref={ref} className="relative w-full">
      <button
        type="button"
        className="flex h-9 w-full items-center justify-center gap-2 rounded-md border border-transparent px-1 text-left transition-colors hover:border-line hover:bg-hover"
        onClick={() => setOpen((value) => !value)}
        title={person ? `${person.name} — switch persona` : 'Switch persona'}
        aria-expanded={open}
      >
        <span
          className={cx(
            'flex size-7 shrink-0 items-center justify-center rounded-full border border-linebright text-[9px] font-bold',
            person && 'text-abyss',
          )}
          style={{ background: person ? `hsl(${person.hue} 52% 87%)` : 'var(--color-raised)' }}
        >
          {person?.initials ?? '?'}
        </span>
        <span className="min-w-0 flex-1 truncate text-[10px] text-mut">{person?.name.split(' ')[0] ?? 'Persona'}</span>
        <ChevronIcon />
      </button>

      {open && (
        <div className="panel anim-fadeup absolute bottom-11 left-1 z-50 w-60 p-1.5">
          <div className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-dim">Viewing as</div>
          {PERSONAS.map((entry) => {
            const candidate = personById.get(entry.personId)
            if (!candidate) return null
            return (
              <button
                key={entry.personId}
                type="button"
                className={cx(
                  'flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-hover',
                  entry.personId === personaId && 'bg-raised',
                )}
                onClick={() => {
                  setOpen(false)
                  useStore.getState().switchPersona(entry.personId)
                }}
              >
                <span
                  className="flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-abyss"
                  style={{ background: `hsl(${candidate.hue} 52% 87%)` }}
                >
                  {candidate.initials}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[12px]">{candidate.name}</span>
                  <span className="block truncate text-[10px] text-dim">{entry.label}</span>
                </span>
              </button>
            )
          })}
          <div className="mt-1 border-t border-line pt-1">
            <button
              type="button"
              className="w-full rounded-md px-2 py-1.5 text-left text-[11px] text-mut hover:bg-hover"
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

function NavIcon({ name }: { name: NavIconName }) {
  const common = {
    width: 17,
    height: 17,
    viewBox: '0 0 20 20',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.4,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }

  if (name === 'map') {
    return (
      <svg {...common}>
        <path d="m2.5 4.5 5-2 5 2 5-2v13l-5 2-5-2-5 2v-13Z" />
        <path d="M7.5 2.5v13M12.5 4.5v13" />
      </svg>
    )
  }
  if (name === 'approvals') {
    return (
      <svg {...common}>
        <rect x="3.5" y="7" width="13" height="10" rx="2" />
        <path d="M6 7V5a4 4 0 0 1 8 0v2" />
        <path d="m7.5 12 1.5 1.5 3.5-3.5" />
      </svg>
    )
  }
  if (name === 'activity') {
    return (
      <svg {...common}>
        <path d="M2.5 10h3l1.7-4.5 3.2 9 2.1-6 1.3 2.5h3.7" />
      </svg>
    )
  }
  if (name === 'agents') {
    return (
      <svg {...common}>
        <circle cx="10" cy="6.5" r="3" />
        <path d="M4.5 17c.7-3 2.5-4.5 5.5-4.5s4.8 1.5 5.5 4.5M3 8.5h2M15 8.5h2" />
      </svg>
    )
  }
  return (
    <svg {...common}>
      <path d="M5 2.5h6l4 4v11H5v-15Z" />
      <path d="M11 2.5v4h4M7.5 10h5M7.5 13h5" />
    </svg>
  )
}

function ThemeIcon({ dark }: { dark: boolean }) {
  if (dark) {
    return (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden>
        <circle cx="8" cy="8" r="3" />
        <path d="M8 1.2v1.5M8 13.3v1.5M1.2 8h1.5M13.3 8h1.5M3.2 3.2l1.1 1.1M11.7 11.7l1.1 1.1M12.8 3.2l-1.1 1.1M4.3 11.7l-1.1 1.1" strokeLinecap="round" />
      </svg>
    )
  }
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden>
      <path d="M13.4 9.9A5.9 5.9 0 1 1 6.1 2.6 5.9 5.9 0 0 0 13.4 9.9Z" strokeLinejoin="round" />
    </svg>
  )
}

function ChevronIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden>
      <path d="m6 3 5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
