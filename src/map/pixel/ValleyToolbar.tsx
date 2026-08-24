import { Buildings, Eye, EyeSlash, MapTrifold, UsersThree } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import type { World } from '../../types'

export type ValleyFilter = 'all' | 'working' | 'attention'
export type ValleyInspection = { kind: 'agent' | 'dept'; id: string } | null

export function readValleyFilterCounts(world: World): { working: number; attention: number } {
  const working = world.agents.filter((agent) => world.agentStatus.get(agent.id) === 'working').length
  const attentionAgentIds = new Set(
    world.agents
      .filter((agent) => world.agentStatus.get(agent.id) === 'blocked')
      .map((agent) => agent.id),
  )
  let unassignedApprovals = 0
  for (const approval of world.approvals) {
    if (approval.requestedBy?.kind === 'agent') attentionAgentIds.add(approval.requestedBy.id)
    else unassignedApprovals += 1
  }
  return { working, attention: attentionAgentIds.size + unassignedApprovals }
}

export default function ValleyToolbar({
  world,
  filter,
  showNames,
  inspection,
  panelWidth,
  onFilterChange,
  onShowNamesChange,
}: {
  world: World
  filter: ValleyFilter
  showNames: boolean
  inspection: ValleyInspection
  panelWidth: number
  onFilterChange: (filter: ValleyFilter) => void
  onShowNamesChange: (show: boolean) => void
}) {
  const counts = readValleyFilterCounts(world)

  const inspectionCopy = readInspectionCopy(world, inspection)

  return (
    <div
      className="valley-toolbar absolute top-0 left-0 z-20 flex h-[52px] items-center gap-4 border-b border-line bg-surface px-3"
      style={{ right: panelWidth }}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="flex size-7 shrink-0 items-center justify-center bg-raised text-task" aria-hidden>
          <Buildings size={15} weight="fill" />
        </span>
        <span className="min-w-0">
          <span className="block truncate font-display text-[13px] font-semibold text-ink">Valley map</span>
          <span className="block truncate text-[10.5px] text-dim">{world.departments.size} departments · {world.agents.length} agents</span>
        </span>
      </div>

      <div className="flex shrink-0 items-center border border-line bg-bg p-0.5" role="group" aria-label="Filter valley agents">
        <FilterButton active={filter === 'all'} onClick={() => onFilterChange('all')}>All</FilterButton>
        <FilterButton active={filter === 'working'} disabled={counts.working === 0} onClick={() => onFilterChange('working')}>
          Working <span className="font-mono text-[9px] tabular-nums">{counts.working}</span>
        </FilterButton>
        <FilterButton active={filter === 'attention'} disabled={counts.attention === 0} onClick={() => onFilterChange('attention')}>
          Needs attention <span className="font-mono text-[9px] tabular-nums">{counts.attention}</span>
        </FilterButton>
      </div>

      <InspectionSummary inspection={inspection} title={inspectionCopy.title} detail={inspectionCopy.detail} />

      <button
        type="button"
        aria-pressed={showNames}
        className="ml-auto flex h-7 shrink-0 items-center gap-1.5 border border-line px-2 text-[10.5px] text-mut transition-colors hover:border-linebright hover:bg-hover hover:text-ink"
        onClick={() => onShowNamesChange(!showNames)}
      >
        {showNames ? <EyeSlash size={13} /> : <Eye size={13} />}
        {showNames ? 'Hide names' : 'Show names'}
      </button>
    </div>
  )
}

function readInspectionCopy(world: World, inspection: ValleyInspection): { title: string; detail: string } {
  if (inspection?.kind === 'agent') {
    const agent = world.agents.find((candidate) => candidate.id === inspection.id)
    if (agent) {
      const department = world.departments.get(agent.deptId)?.name ?? agent.deptId
      const status = world.agentStatus.get(agent.id) ?? 'idle'
      const taskId = world.agentTask.get(agent.id)
      const task = taskId ? world.tasks.get(taskId) : null
      return {
        title: agent.name,
        detail: task?.title ?? `${department} ${agent.kind === 'operator' ? 'operator' : 'worker'}, ${status}`,
      }
    }
  }

  if (inspection?.kind === 'dept') {
    const department = world.departments.get(inspection.id)
    const agents = world.agents.filter((agent) => agent.deptId === inspection.id)
    const active = agents.filter((agent) => world.agentStatus.get(agent.id) === 'working').length
    const waiting = world.approvals.filter((approval) => approval.deptId === inspection.id).length
    return {
      title: department?.name ?? inspection.id,
      detail: `${agents.length} agents, ${active} working${waiting > 0 ? `, ${waiting} waiting on a person` : ''}`,
    }
  }

  return {
    title: 'Explore the company',
    detail: 'Choose a building or villager to open its workspace.',
  }
}

function InspectionSummary({
  inspection,
  title,
  detail,
}: {
  inspection: ValleyInspection
  title: string
  detail: string
}) {
  const icon = inspection?.kind === 'agent'
    ? <UsersThree size={14} className="shrink-0 text-task" />
    : inspection?.kind === 'dept'
      ? <Buildings size={14} className="shrink-0 text-task" />
      : <MapTrifold size={14} className="shrink-0 text-dim" />

  return (
    <div className="hidden min-w-0 flex-1 items-center gap-2 border-l border-line pl-4 xl:flex">
      {icon}
      <span className="min-w-0">
        <span className="block truncate text-[11.5px] font-medium text-ink">{title}</span>
        <span className="block truncate text-[10px] text-dim">{detail}</span>
      </span>
    </div>
  )
}

function FilterButton({
  active,
  children,
  disabled = false,
  onClick,
}: {
  active: boolean
  children: ReactNode
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      className={`flex h-6 items-center gap-1.5 whitespace-nowrap px-2 text-[10.5px] transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${active ? 'bg-raised font-medium text-ink' : 'text-dim hover:text-ink'}`}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
