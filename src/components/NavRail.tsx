import {
  ArrowRight,
  CaretUp,
  CheckSquareOffset,
  Files,
  ListMagnifyingGlass,
  MapTrifold,
  Moon,
  Robot,
  Sun,
  type Icon,
} from '@phosphor-icons/react'
import { useEffect, useRef, useState } from 'react'
import { PERSONAS, personById } from '../data/company'
import { readRunEvidence } from '../evidence/runEvidence'
import { useStore, type AppView } from '../store'
import { cx } from '../utils'

export const NAV_RAIL_WIDTH = 164

const NAV_ITEMS: { view: AppView; label: string; icon: Icon }[] = [
  { view: 'map', label: 'Map', icon: MapTrifold },
  { view: 'approvals', label: 'Approvals', icon: CheckSquareOffset },
  { view: 'activity', label: 'Activity', icon: ListMagnifyingGlass },
  { view: 'agents', label: 'Agents', icon: Robot },
  { view: 'documents', label: 'Documents', icon: Files },
]

export default function NavRail() {
  const view = useStore((s) => s.view)
  const approvals = useStore((s) => s.world.approvals.length)
  const persona = useStore((s) => s.persona)
  const theme = useStore((s) => s.theme)
  const fun = useStore((s) => s.mapStyle === 'fun')
  const mapActivity = useStore((s) => [...s.world.agentStatus.values()].some((status) => status === 'working'))
  const log = useStore((s) => s.log)
  const world = useStore((s) => s.world)
  const executionMode = useStore((s) => s.executionMode)
  const liveConnection = useStore((s) => s.liveConnection)
  const runtimeInfo = useStore((s) => s.runtimeInfo)
  const evidence = readRunEvidence({ events: log, tasks: [...world.tasks.values()], executionMode, liveConnection, runtimeInfo })

  return (
    <aside className="relative z-40 flex w-[164px] shrink-0 flex-col border-r border-line bg-bg" aria-label="Primary navigation">
      <div className="flex h-14 shrink-0 items-center px-4">
        <span className={cx('text-[16px] font-semibold tracking-[-0.035em]', fun && 'font-display')}>CoOps</span>
      </div>
      <nav className="flex flex-1 flex-col px-2 py-2">
        {NAV_ITEMS.map((item) => {
          const active = view === item.view
          const ItemIcon = item.icon
          return (
            <button key={item.view} type="button" aria-current={active ? 'page' : undefined}
              className={cx('group relative flex h-9 w-full items-center gap-2.5 px-2 text-left text-[13px] transition-colors', active ? 'bg-raised font-medium text-ink' : 'text-mut hover:bg-hover hover:text-ink')}
              onClick={() => useStore.getState().setView(item.view)}>
              <ItemIcon size={15} weight={active ? 'fill' : 'regular'} className={cx('shrink-0 text-dim', active && 'text-task')} />
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {item.view === 'map' && mapActivity && <span className="size-1.5 rounded-full bg-task" title="Work in flight" aria-label="Work in flight" />}
              {item.view === 'approvals' && approvals > 0 && <span className="font-mono text-[11px] tabular-nums text-human">{approvals}</span>}
            </button>
          )
        })}
        <RunSnapshot evidence={evidence} />
      </nav>
      <div className="shrink-0 border-t border-line p-2">
        <button type="button" className="flex h-8 w-full items-center px-2 text-[12px] text-dim hover:bg-hover hover:text-ink"
          onClick={() => useStore.getState().toggleTheme()} title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
          {theme === 'dark' ? <Sun size={14} className="mr-2.5 shrink-0" /> : <Moon size={14} className="mr-2.5 shrink-0" />}
          {theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </button>
        <PersonaMenu personaId={persona?.id} />
      </div>
    </aside>
  )
}

function RunSnapshot({ evidence }: { evidence: ReturnType<typeof readRunEvidence> }) {
  const metrics = [
    { value: evidence.events, label: 'events' },
    { value: evidence.tasks, label: 'tasks' },
    { value: evidence.artifacts.total, label: 'artifacts' },
    { value: evidence.guardrails, label: evidence.guardrails === 1 ? 'guardrail' : 'guardrails' },
  ]

  return (
    <button
      type="button"
      className="group mt-4 w-full border-t border-line px-2 pt-3 text-left"
      onClick={() => useStore.getState().setView('activity')}
      aria-label="Open run evidence"
    >
      <span className="flex items-center justify-between text-[10.5px] font-medium text-mut">
        Run evidence
        <ArrowRight size={12} className="text-dim transition-transform group-hover:translate-x-0.5 group-hover:text-ink" />
      </span>
      <span className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 border-b border-line pb-3">
        {metrics.map((metric) => (
          <span key={metric.label} className="min-w-0">
            <span className="block font-mono text-[12px] font-medium tabular-nums text-ink">{metric.value}</span>
            <span className="block truncate text-[9.5px] text-dim">{metric.label}</span>
          </span>
        ))}
      </span>
      <span className="mt-2 block truncate text-[10px] text-dim" title={evidence.runtime}>{evidence.runtime}</span>
    </button>
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
      <button type="button" className="flex h-9 w-full items-center gap-2 px-2 text-left hover:bg-hover" onClick={() => setOpen((value) => !value)}
        title={person ? `Viewing as ${person.name}` : 'Switch persona'} aria-expanded={open}>
        <span className="flex size-6 shrink-0 items-center justify-center bg-raised text-[10px] font-semibold text-mut">{person?.initials ?? '?'}</span>
        <span className="min-w-0 flex-1 truncate text-[12px] text-mut">{person?.name.split(' ')[0] ?? 'Persona'}</span>
        <CaretUp size={11} weight="bold" className="shrink-0 text-dim" />
      </button>
      {open && (
        <div className="panel anim-fadeup absolute bottom-10 left-0 z-50 w-60 p-1">
          {PERSONAS.map((entry) => {
            const candidate = personById.get(entry.personId)
            if (!candidate) return null
            return (
              <button key={entry.personId} type="button" className={cx('flex w-full items-center gap-2 px-2 py-2 text-left hover:bg-hover', entry.personId === personaId && 'bg-raised')}
                onClick={() => { setOpen(false); useStore.getState().switchPersona(entry.personId) }}>
                <span className="flex size-6 shrink-0 items-center justify-center bg-raised text-[10px] font-semibold text-mut">{candidate.initials}</span>
                <span className="min-w-0"><span className="block truncate text-[12.5px]">{candidate.name}</span><span className="block truncate text-[10.5px] text-dim">{entry.label}</span></span>
              </button>
            )
          })}
          <button type="button" className="mt-1 w-full border-t border-line px-2 py-2 text-left text-[12px] text-mut hover:bg-hover"
            onClick={() => { setOpen(false); useStore.getState().setFirstRunStep(0) }}>Replay intro</button>
        </div>
      )}
    </div>
  )
}
