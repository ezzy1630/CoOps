/* Hallmark · macrostructure: Workbench · theme: Obsidian-Titanium · genre: modern-minimal
 * pre-emit critique: P5 H5 E5 S5 R5 V5 · slop test: 58/58 ✓
 */
import { Eye, EyeSlash, MagnifyingGlass, Sparkle } from '@phosphor-icons/react'
import { useStore } from '../store'
import { getCompany, deptById, personById } from '../data/company'
import { virtualAt } from '../engine/replay'
import { readValleyFilterCounts } from '../map/pixel/layout'
import { cx } from '../utils'
import RuntimeStatus from './RuntimeStatus'

const PAGE_LABELS = { approvals: 'Approvals', activity: 'Activity', agents: 'Agents', documents: 'Documents' } as const
export const HEADER_H = 44
interface Crumb { label: string; onClick?: () => void }

export default function Header() {
  const panel = useStore((s) => s.panel)
  const selectedTaskId = useStore((s) => s.selectedTaskId)
  const world = useStore((s) => s.world)
  const presence = useStore((s) => s.presence)
  const replay = useStore((s) => s.replay)
  const view = useStore((s) => s.view)
  const mapStyle = useStore((s) => s.mapStyle)
  const valleyFilter = useStore((s) => s.valleyFilter)
  const valleyShowNames = useStore((s) => s.valleyShowNames)

  const crumbs: Crumb[] = view === 'map'
    ? [{ label: getCompany().name }]
    : [{ label: 'Map', onClick: () => useStore.getState().setView('map') }, { label: PAGE_LABELS[view] }]
  const agent = panel?.kind === 'agent' ? world.agents.find((item) => item.id === panel.id) : null
  const deptId = panel?.kind === 'dept' ? panel.id : agent?.deptId
  if (deptId) {
    const dept = deptById.get(deptId)
    crumbs.push({ label: dept?.name ?? deptId })
  }
  if (agent) crumbs.push({ label: agent.name })
  if (selectedTaskId) crumbs.push({ label: world.tasks.get(selectedTaskId)?.title ?? selectedTaskId })
  const roaming = presence.filter((mark) => !mark.where.startsWith('approval:')).slice(0, 3)

  const filterCounts = readValleyFilterCounts(world)

  return (
    <header className="z-30 flex h-12 shrink-0 items-center justify-between border-b border-line bg-surface/95 px-4 backdrop-blur-md select-none">
      {/* Left: Breadcrumbs + Valley Filter Controls */}
      <div className="flex min-w-0 items-center gap-3">
        <nav className="flex min-w-0 items-center text-[12.5px]" aria-label="Breadcrumb">
          {crumbs.map((crumb, index) => (
            <span key={`${crumb.label}-${index}`} className="flex min-w-0 items-center">
              {index > 0 && <span className="px-2 text-dim/50 text-[11px]">/</span>}
              {crumb.onClick ? (
                <button
                  type="button"
                  onClick={crumb.onClick}
                  className="truncate text-dim hover:text-ink cursor-pointer font-medium"
                >
                  {crumb.label}
                </button>
              ) : (
                <span className={cx('truncate font-semibold', index === crumbs.length - 1 ? 'text-ink' : 'text-mut')}>
                  {crumb.label}
                </span>
              )}
            </span>
          ))}
        </nav>

        {view === 'map' && mapStyle === 'fun' && (
          <div className="hidden items-center gap-2 border-l border-line pl-3 md:flex" role="group" aria-label="Filter agents">
            <div className="flex items-center rounded-lg border border-line bg-raised/70 p-0.5 shadow-xs">
              <button
                type="button"
                aria-pressed={valleyFilter === 'all'}
                onClick={() => useStore.getState().setValleyFilter('all')}
                className={cx(
                  'h-6 cursor-pointer rounded-md px-2.5 text-[11.5px] transition-all',
                  valleyFilter === 'all'
                    ? 'bg-surface font-semibold text-ink shadow-xs'
                    : 'text-dim hover:text-ink',
                )}
              >
                All
              </button>
              <button
                type="button"
                aria-pressed={valleyFilter === 'working'}
                disabled={filterCounts.working === 0}
                onClick={() => useStore.getState().setValleyFilter('working')}
                className={cx(
                  'flex h-6 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-[11.5px] transition-all disabled:cursor-not-allowed disabled:opacity-40',
                  valleyFilter === 'working'
                    ? 'bg-surface font-semibold text-task shadow-xs'
                    : 'text-dim hover:text-ink',
                )}
              >
                <span>Working</span>
                {filterCounts.working > 0 && (
                  <span className="rounded-full bg-task/15 px-1 font-mono text-[9.5px] font-bold tabular-nums text-task">
                    {filterCounts.working}
                  </span>
                )}
              </button>
              <button
                type="button"
                aria-pressed={valleyFilter === 'attention'}
                disabled={filterCounts.attention === 0}
                onClick={() => useStore.getState().setValleyFilter('attention')}
                className={cx(
                  'flex h-6 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-[11.5px] transition-all disabled:cursor-not-allowed disabled:opacity-40',
                  valleyFilter === 'attention'
                    ? 'bg-surface font-semibold text-human shadow-xs'
                    : 'text-dim hover:text-ink',
                )}
              >
                <span>Needs attention</span>
                {filterCounts.attention > 0 && (
                  <span className="rounded-full bg-human/15 px-1 font-mono text-[9.5px] font-bold tabular-nums text-human">
                    {filterCounts.attention}
                  </span>
                )}
              </button>
            </div>

            <button
              type="button"
              aria-pressed={valleyShowNames}
              className={cx(
                'flex h-6.5 cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-medium transition-all',
                valleyShowNames
                  ? 'border-task/40 bg-task/10 text-task shadow-xs'
                  : 'border-line bg-surface text-dim hover:border-linebright hover:bg-hover hover:text-ink',
              )}
              onClick={() => useStore.getState().setValleyShowNames(!valleyShowNames)}
              title={valleyShowNames ? 'Hide agent names' : 'Show agent names'}
            >
              {valleyShowNames ? <Eye size={12} weight="bold" /> : <EyeSlash size={12} />}
              <span>Names</span>
            </button>
          </div>
        )}
      </div>

      {/* Right: Actions & Status */}
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {replay && (
          <span className="flex items-center gap-1.5 rounded-full border border-task/30 bg-task/10 px-2.5 py-0.5 font-mono text-[10.5px] font-medium tabular-nums text-task shadow-xs">
            <span className="size-1.5 rounded-full bg-task animate-pulse" />
            Replay {new Date(virtualAt(replay.knots, replay.wallMs)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}

        <RuntimeStatus />

        {roaming.length > 0 && (
          <div className="hidden -space-x-1 sm:flex" aria-label="People viewing the company">
            {roaming.map((mark) => {
              const person = personById.get(mark.personId)
              if (!person) return null
              return (
                <span
                  key={mark.personId}
                  title={`${person.name}, viewing ${deptById.get(mark.where)?.name ?? mark.where}`}
                  className="flex size-6 items-center justify-center rounded-full border border-surface bg-raised text-[9.5px] font-bold text-mut shadow-xs"
                >
                  {person.initials}
                </span>
              )
            })}
          </div>
        )}

        <div className="flex shrink-0 items-center rounded-lg border border-line bg-raised/70 p-0.5 shadow-xs" role="group" aria-label="Map view style">
          <button
            type="button"
            aria-pressed={mapStyle === 'classic'}
            onClick={() => useStore.getState().setMapStyle('classic')}
            className={cx(
              'h-6 cursor-pointer rounded-md px-2.5 text-[11.5px] font-medium transition-all',
              mapStyle === 'classic'
                ? 'bg-surface font-semibold text-ink shadow-xs'
                : 'text-dim hover:text-ink',
            )}
          >
            Blueprint
          </button>
          <button
            type="button"
            aria-pressed={mapStyle === 'fun'}
            onClick={() => useStore.getState().setMapStyle('fun')}
            className={cx(
              'h-6 cursor-pointer rounded-md px-2.5 text-[11.5px] font-medium transition-all',
              mapStyle === 'fun'
                ? 'bg-surface font-semibold text-ink shadow-xs'
                : 'text-dim hover:text-ink',
            )}
          >
            Valley
          </button>
        </div>

        <button
          type="button"
          className="flex h-7 cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 text-[11.5px] font-medium text-mut shadow-xs transition-all hover:border-linebright hover:bg-hover hover:text-ink active:scale-[0.98]"
          onClick={() => useStore.getState().setPaletteOpen(true)}
          aria-label="Open command palette"
        >
          <MagnifyingGlass size={12} className="text-dim" />
          <span>Commands</span>
          <kbd className="rounded border border-linebright bg-raised px-1 py-0.2 font-mono text-[9px] text-dim">⌘K</kbd>
        </button>
      </div>
    </header>
  )
}
