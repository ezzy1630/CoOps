import { useStore } from '../store'
import { COMPANY, deptById, personById } from '../data/company'
import { virtualAt } from '../engine/replay'
import { cx } from '../utils'
import RuntimeStatus from './RuntimeStatus'

const PAGE_LABELS = { approvals: 'Approvals', activity: 'Activity', agents: 'Agents', documents: 'Documents' } as const
interface Crumb { label: string; onClick?: () => void; hue?: number }

export default function Header() {
  const panel = useStore((s) => s.panel)
  const selectedTaskId = useStore((s) => s.selectedTaskId)
  const world = useStore((s) => s.world)
  const presence = useStore((s) => s.presence)
  const replay = useStore((s) => s.replay)
  const view = useStore((s) => s.view)
  const mapStyle = useStore((s) => s.mapStyle)

  const crumbs: Crumb[] = view === 'map'
    ? [{ label: COMPANY.name }]
    : [{ label: 'Map', onClick: () => useStore.getState().setView('map') }, { label: PAGE_LABELS[view] }]
  const agent = panel?.kind === 'agent' ? world.agents.find((item) => item.id === panel.id) : null
  const deptId = panel?.kind === 'dept' ? panel.id : agent?.deptId
  if (deptId) {
    const dept = deptById.get(deptId)
    crumbs.push({ label: dept?.name ?? deptId, hue: personById.get(dept?.leadId ?? '')?.hue })
  }
  if (agent) crumbs.push({ label: agent.name })
  if (selectedTaskId) crumbs.push({ label: world.tasks.get(selectedTaskId)?.title ?? selectedTaskId })
  const roaming = presence.filter((mark) => !mark.where.startsWith('approval:')).slice(0, 3)

  return (
    <header className="z-30 flex h-[42px] shrink-0 items-center border-b border-line bg-surface px-4">
      <nav className="flex min-w-0 items-center text-[12px]" aria-label="Breadcrumb">
        {crumbs.map((crumb, index) => (
          <span key={`${crumb.label}-${index}`} className="flex min-w-0 items-center">
            {index > 0 && <span className="px-2 text-linebright">/</span>}
            {crumb.hue !== undefined && <span className="mr-1.5 h-3 w-px" style={{ background: `hsl(${crumb.hue} 48% 52%)` }} aria-hidden />}
            <button type="button" onClick={crumb.onClick}
              className={cx('max-w-64 truncate py-1 text-left', index === crumbs.length - 1 ? 'font-medium text-ink' : 'text-dim hover:text-ink')}>
              {crumb.label}
            </button>
          </span>
        ))}
      </nav>
      <div className="ml-auto flex shrink-0 items-center gap-3">
        {replay && <span className="font-mono text-[10px] tabular-nums text-task">Replay {new Date(virtualAt(replay.knots, replay.wallMs)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
        <RuntimeStatus />
        <div className="flex -space-x-1" aria-label="People viewing the company">
          {roaming.map((mark) => {
            const person = personById.get(mark.personId)
            if (!person) return null
            return <span key={mark.personId} title={`${person.name}, viewing ${deptById.get(mark.where)?.name ?? mark.where}`} className="flex size-6 items-center justify-center border border-surface bg-raised text-[9.5px] font-semibold text-mut">{person.initials}</span>
          })}
        </div>
        <div className="flex shrink-0 items-center border border-line" role="group" aria-label="Map view style">
          <button
            type="button"
            aria-pressed={mapStyle === 'classic'}
            onClick={() => useStore.getState().setMapStyle('classic')}
            className={cx(
              'h-6 cursor-pointer px-2 text-[11px] transition-colors',
              mapStyle === 'classic' ? 'bg-raised font-medium text-ink' : 'text-mut hover:text-ink',
            )}
          >
            Blueprint
          </button>
          <button
            type="button"
            aria-pressed={mapStyle === 'fun'}
            onClick={() => useStore.getState().setMapStyle('fun')}
            className={cx(
              'h-6 cursor-pointer border-l border-line px-2 text-[11px] transition-colors',
              mapStyle === 'fun' ? 'bg-raised font-medium text-ink' : 'text-mut hover:text-ink',
            )}
          >
            Valley
          </button>
        </div>
        <button type="button" className="flex h-6 items-center gap-2 border border-line px-2 text-[11px] text-mut hover:border-linebright hover:text-ink"
          onClick={() => useStore.getState().setPaletteOpen(true)} aria-label="Open command palette">
          Commands <span className="font-mono text-[10px] text-dim">⌘K</span>
        </button>
      </div>
    </header>
  )
}
