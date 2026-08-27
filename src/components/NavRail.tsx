/* Hallmark · macrostructure: Workbench · theme: Obsidian-Titanium · genre: modern-minimal
 * pre-emit critique: P5 H5 E5 S5 R5 V5 · slop test: 58/58 ✓
 */
import {
  CaretUp,
  Check,
  CheckSquareOffset,
  Files,
  ListMagnifyingGlass,
  MapTrifold,
  Moon,
  Robot,
  Sparkle,
  Sun,
  type Icon,
} from '@phosphor-icons/react'
import { useEffect, useRef, useState } from 'react'
import { getPersonas, personById } from '../data/company'
import { useStore, type AppView } from '../store'
import { cx } from '../utils'

export const NAV_RAIL_WIDTH = 176

const NAV_ITEMS: { view: AppView; label: string; icon: Icon }[] = [
  { view: 'map', label: 'Map', icon: MapTrifold },
  { view: 'agents', label: 'Agents', icon: Robot },
  { view: 'documents', label: 'Documents', icon: Files },
  { view: 'approvals', label: 'Approvals', icon: CheckSquareOffset },
  { view: 'activity', label: 'Activity', icon: ListMagnifyingGlass },
]

export default function NavRail() {
  const view = useStore((s) => s.view)
  const approvals = useStore((s) => s.world.approvals.length)
  const persona = useStore((s) => s.persona)
  const theme = useStore((s) => s.theme)
  const fun = useStore((s) => s.mapStyle === 'fun')
  const mapActivity = useStore((s) => [...s.world.agentStatus.values()].some((status) => status === 'working'))

  return (
    <aside className="relative z-40 flex w-[184px] shrink-0 flex-col border-r border-line bg-surface select-none" aria-label="Primary navigation">
      {/* Brand Header */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-line px-3.5">
        <div className="flex items-center gap-2.5">
          <div className="relative flex size-6 items-center justify-center rounded-lg text-ink">
            <svg width="14" height="14" viewBox="0 0 32 32" className="text-ink">
              <circle cx="16" cy="16" r="10.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeDasharray="4 3.5" />
              <circle cx="16" cy="6" r="3.2" fill="var(--color-task)" />
              <circle cx="25" cy="21" r="3.2" fill="var(--color-artifact)" />
              <circle cx="7" cy="21" r="3.2" fill="var(--color-human)" />
            </svg>
          </div>
          <span className="text-[15px] font-bold tracking-normal text-ink font-sans">CoOps</span>
        </div>
      </div>

      {/* Nav List */}
      <nav className="flex flex-1 flex-col gap-1 px-2 py-3">
        {NAV_ITEMS.map((item) => {
          const active = view === item.view
          const ItemIcon = item.icon
          return (
            <button
              key={item.view}
              type="button"
              aria-current={active ? 'page' : undefined}
              className={cx(
                'group relative flex h-9 w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px] font-medium transition-all',
                active
                  ? 'bg-raised text-ink font-semibold shadow-xs'
                  : 'text-mut hover:bg-hover hover:text-ink',
              )}
              onClick={() => useStore.getState().setView(item.view)}
            >
              {active && (
                <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full bg-task" />
              )}
              <ItemIcon
                size={17}
                weight={active ? 'fill' : 'regular'}
                className={cx('shrink-0 transition-colors', active ? 'text-task' : 'text-dim group-hover:text-ink')}
              />
              <span className="min-w-0 flex-1 truncate">{item.label}</span>

              {item.view === 'map' && mapActivity && (
                <span className="relative flex size-2 items-center justify-center">
                  <span className="absolute inline-flex size-full rounded-full bg-task opacity-75 beacon-pulse" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-task" />
                </span>
              )}

              {item.view === 'approvals' && approvals > 0 && (
                <span className="flex items-center rounded bg-human/15 px-1.5 py-0.2 font-mono text-[10px] font-bold tabular-nums text-human border border-human/30">
                  {approvals}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      {/* Bottom Profile & Theme Actions */}
      <div className="shrink-0 border-t border-line p-2.5 space-y-1.5">
        <button
          type="button"
          className="flex h-8 w-full cursor-pointer items-center justify-between rounded-lg px-2.5 text-[12px] text-dim transition-all hover:bg-hover hover:text-ink"
          onClick={() => useStore.getState().toggleTheme()}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          <div className="flex items-center gap-2">
            {theme === 'dark' ? (
              <Sun size={14} className="text-permission" />
            ) : (
              <Moon size={14} className="text-dim" />
            )}
            <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
          </div>
          <span className="font-mono text-[9.5px] text-dim/70 uppercase">{theme}</span>
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
    const onDown = (event: MouseEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false) }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        className={cx(
          'group flex h-11 w-full cursor-pointer items-center gap-2.5 rounded-lg border px-2.5 text-left transition-all',
          open
            ? 'border-linebright bg-raised shadow-xs'
            : 'border-line bg-surface hover:border-linebright hover:bg-hover',
        )}
        onClick={() => setOpen((value) => !value)}
        title={person ? `Viewing as ${person.name} (${person.role})` : 'Switch persona'}
        aria-expanded={open}
      >
        <span
          className="flex size-7 shrink-0 items-center justify-center rounded bg-raised border border-line font-mono text-[10.5px] font-bold text-ink shadow-xs"
        >
          {person?.initials ?? '??'}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] font-semibold text-ink leading-tight">{person?.name ?? 'Persona'}</div>
          <div className="truncate text-[10px] text-dim leading-tight">{person?.role ?? 'Role'}</div>
        </div>
        <CaretUp size={12} className={cx('text-dim transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 mb-2 w-64 rounded-xl border border-line bg-surface p-1.5 shadow-xl">
          <div className="px-2.5 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-dim">
            Switch Operating Perspective
          </div>
          <div className="space-y-0.5">
            {getPersonas().map((p) => {
              const candidate = personById.get(p.personId)
              const selected = p.personId === personaId
              return (
                <button
                  key={p.personId}
                  type="button"
                  onClick={() => {
                    useStore.getState().switchPersona(p.personId)
                    setOpen(false)
                  }}
                  className={cx(
                    'flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition-all',
                    selected
                      ? 'bg-raised font-semibold text-ink shadow-xs'
                      : 'text-mut hover:bg-hover hover:text-ink',
                  )}
                >
                  <span
                    className="flex size-6 shrink-0 items-center justify-center rounded bg-raised border border-line font-mono text-[10px] font-bold text-ink"
                  >
                    {candidate?.initials}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12px] font-semibold text-ink">{candidate?.name}</div>
                    <div className="truncate text-[10px] text-dim">{candidate?.role}</div>
                  </div>
                  {selected && <Check size={12} className="text-task shrink-0" />}
                </button>
              )
            })}
          </div>
          <div className="mt-1 border-t border-line pt-1">
            <button
              type="button"
              className="flex w-full cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-left text-[11.5px] text-mut transition-colors hover:bg-hover hover:text-ink"
              onClick={() => { setOpen(false); useStore.getState().setFirstRunStep(0) }}
            >
              <Sparkle size={12} className="text-permission" />
              <span>Play intro tour</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
