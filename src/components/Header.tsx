import { useStore } from '../store'
import { COMPANY, deptById, personById } from '../data/company'
import { virtualAt } from '../engine/replay'
import { cx } from '../utils'

const PAGE_LABELS = {
  approvals: 'Approvals',
  activity: 'Activity',
  agents: 'Agents',
  documents: 'Documents',
} as const

const DEPT_HUES: Record<string, number> = {
  marketing: 214,
  finance: 38,
  legal: 278,
  support: 161,
  operations: 188,
  hr: 22,
}

interface Crumb {
  label: string
  onClick?: () => void
  hue?: number
}

export default function Header() {
  const persona = useStore((s) => s.persona)
  const panel = useStore((s) => s.panel)
  const selectedTaskId = useStore((s) => s.selectedTaskId)
  const world = useStore((s) => s.world)
  const presence = useStore((s) => s.presence)
  const replay = useStore((s) => s.replay)
  const view = useStore((s) => s.view)

  const crumbs: Crumb[] =
    view === 'map'
      ? [
          { label: 'Map' },
          { label: COMPANY.name },
        ]
      : [
          {
            label: 'Map',
            onClick: () => {
              const st = useStore.getState()
              st.setView('map')
              st.selectTask(null)
              st.requestCamera({ type: 'fit' })
            },
          },
          { label: PAGE_LABELS[view] },
        ]

  const agent = panel?.kind === 'agent' ? world.agents.find((item) => item.id === panel.id) : null
  const deptId = panel?.kind === 'dept' ? panel.id : agent?.deptId
  if (deptId) {
    crumbs.push({
      label: deptById.get(deptId)?.name ?? deptId,
      hue: DEPT_HUES[deptId],
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
  if (panel?.kind === 'diff') crumbs.push({ label: 'Inheritance' })
  if (selectedTaskId) {
    const task = world.tasks.get(selectedTaskId)
    if (task) crumbs.push({ label: `Task ${task.id}` })
  }

  const roaming = presence.filter((mark) => !mark.where.startsWith('approval:')).slice(0, 4)

  return (
    <header className="z-30 flex h-14 shrink-0 items-center gap-4 border-b border-line bg-surface px-5">
      <nav className="flex min-w-0 max-w-[310px] items-center gap-1" aria-label="Breadcrumb">
        {crumbs.map((crumb, index) => (
          <span key={`${crumb.label}-${index}`} className="flex min-w-0 items-center gap-1">
            {index > 0 && <ChevronIcon />}
            {crumb.hue !== undefined && (
              <span
                className="size-1.5 shrink-0 rounded-full"
                style={{ background: `hsl(${crumb.hue} 66% 58%)` }}
                title={`${crumb.label} department`}
                aria-hidden
              />
            )}
            <button
              type="button"
              onClick={crumb.onClick}
              className={cx(
                'max-w-52 truncate rounded px-1.5 py-1 text-left',
                index === crumbs.length - 1
                  ? 'text-[12px] font-medium tracking-tight'
                  : 'font-mono text-[10px] uppercase tracking-[0.12em]',
                crumb.onClick ? 'text-mut hover:bg-hover hover:text-ink' : 'text-ink',
              )}
            >
              {crumb.label}
            </button>
          </span>
        ))}
      </nav>

      <div className="ml-auto flex shrink-0 items-center gap-3">
        <button
          type="button"
          className="flex h-8 w-[190px] items-center gap-2 rounded-md border border-linebright bg-bg px-2.5 text-left text-[11px] text-dim transition-colors hover:border-task/50 hover:text-mut"
          onClick={() => useStore.getState().setPaletteOpen(true)}
          aria-label="Search agents, tasks, documents, and approvals"
        >
          <SearchIcon />
          <span className="min-w-0 flex-1 truncate font-mono uppercase tracking-[0.08em]">Search</span>
          <span className="kbd shrink-0">⌘K</span>
        </button>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <div className="flex items-center -space-x-1.5" aria-label="People viewing the company">
          {roaming.map((mark) => {
            const person = personById.get(mark.personId)
            if (!person) return null
            return (
              <div
                key={mark.personId}
                title={`${person.name} — viewing ${deptById.get(mark.where)?.name ?? mark.where}`}
                className="flex size-7 items-center justify-center rounded-full border-2 border-surface text-[9px] font-bold text-abyss"
                style={{ background: `hsl(${person.hue} 52% 87%)` }}
              >
                {person.initials}
              </div>
            )
          })}
        </div>

        {replay && (
          <span className="chip border-task/40 text-task">
            REPLAY · {new Date(virtualAt(replay.knots, replay.wallMs)).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </span>
        )}

        <div className="h-5 w-px bg-line" aria-hidden />
        <div className="flex items-center gap-2" title={persona ? `${persona.name}, ${persona.role}` : 'Current persona'}>
          <span
            className={cx(
              'flex size-8 items-center justify-center rounded-full border border-linebright text-[10px] font-bold',
              persona && 'text-abyss',
            )}
            style={{ background: persona ? `hsl(${persona.hue} 52% 87%)` : 'var(--color-raised)' }}
          >
            {persona?.initials ?? '?'}
          </span>
          <span className="hidden max-w-28 truncate text-[12px] text-mut xl:block">{persona?.name ?? 'Choose persona'}</span>
        </div>
      </div>
    </header>
  )
}

function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden>
      <circle cx="7" cy="7" r="4.2" />
      <path d="m10.2 10.2 3.2 3.2" strokeLinecap="round" />
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
