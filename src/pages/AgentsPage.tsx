/* Hallmark · macrostructure: Workbench · theme: Obsidian-Titanium · genre: modern-minimal
 * pre-emit critique: P5 H5 E5 S5 R5 V5 · slop test: 58/58 ✓
 */
import {
  ArrowRight,
  ArrowSquareOut,
  Buildings,
  MagnifyingGlass,
  SquaresFour,
  Table,
  UsersThree,
  Wrench,
  X,
} from '@phosphor-icons/react'
import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../store'
import { getDepartments, deptById, personById, toolById } from '../data/company'
import { cx, timeAgo } from '../utils'
import { Modal } from '../components/ui'
import type { AgentDef, AgentStatus, Department, Tool, World } from '../types'

export type ViewMode = 'teams' | 'grid' | 'table'

const STATUS_MAP: Record<
  AgentStatus,
  { label: string; dotCls: string }
> = {
  idle: {
    label: 'Ready',
    dotCls: 'bg-dim/70',
  },
  working: {
    label: 'Working',
    dotCls: 'bg-task animate-pulse',
  },
  blocked: {
    label: 'Needs Review',
    dotCls: 'bg-human animate-pulse',
  },
}

export default function AgentsPage() {
  const world = useStore((s) => s.world)
  const [search, setSearch] = useState('')
  const [selectedDept, setSelectedDept] = useState<string>('all')
  const [viewMode, setViewMode] = useState<ViewMode>('teams')
  const [inspectAgentId, setInspectAgentId] = useState<string | null>(null)

  const allAgents = useMemo(
    () =>
      [...world.agents].sort((a, b) => {
        const dept = (deptById.get(a.deptId)?.name ?? a.deptId).localeCompare(
          deptById.get(b.deptId)?.name ?? b.deptId,
        )
        if (dept !== 0) return dept
        if (a.kind !== b.kind) return a.kind === 'operator' ? -1 : 1
        return a.name.localeCompare(b.name)
      }),
    [world.agents],
  )

  const departments = useMemo(() => getDepartments(), [])

  // Keyboard shortcut: / focuses search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        return
      }
      if (e.key === '/') {
        e.preventDefault()
        document.getElementById('agent-search-input')?.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const filteredAgents = useMemo(() => {
    return allAgents.filter((a) => {
      const matchesDept = selectedDept === 'all' || a.deptId === selectedDept
      const q = search.trim().toLowerCase()
      if (!q) return matchesDept

      const deptName = deptById.get(a.deptId)?.name ?? ''
      const ownerName = personById.get(a.ownerId)?.name ?? ''
      const matchesSearch =
        a.name.toLowerCase().includes(q) ||
        a.purpose.toLowerCase().includes(q) ||
        deptName.toLowerCase().includes(q) ||
        ownerName.toLowerCase().includes(q) ||
        (a.skills ?? []).some((s) => s.toLowerCase().includes(q)) ||
        a.toolIds.some((t) => (toolById.get(t)?.name ?? t).toLowerCase().includes(q))

      return matchesDept && matchesSearch
    })
  }, [allAgents, selectedDept, search])

  // Group by department for cluster view
  const deptClusters = useMemo(() => {
    return departments
      .map((d) => {
        const deptAgents = filteredAgents.filter((a) => a.deptId === d.id)
        const operator = deptAgents.find((a) => a.kind === 'operator')
        const specialists = deptAgents.filter((a) => a.kind !== 'operator')
        return {
          department: d,
          agents: deptAgents,
          operator,
          specialists,
        }
      })
      .filter((cluster) => cluster.agents.length > 0)
  }, [departments, filteredAgents])

  const inspectedAgent = inspectAgentId ? world.agents.find((a) => a.id === inspectAgentId) : null

  return (
    <div className="flex h-full min-w-0 flex-col overflow-y-auto overscroll-contain bg-bg">
      <div className="mx-auto flex w-full max-w-[1360px] min-w-0 flex-1 flex-col px-6 py-7 lg:px-8">
        
        {/* ── Quiet Header ── */}
        <header className="flex flex-wrap items-baseline justify-between gap-4 border-b border-line pb-5">
          <div>
            <h1 className="text-[22px] font-bold tracking-tight text-ink font-sans">
              Agents
            </h1>
            <p className="mt-1 text-[13px] text-mut">
              Autonomous agents assigned to departments across the company.
            </p>
          </div>

          {/* View Mode Controls */}
          <div className="flex items-center rounded-lg border border-line bg-surface p-0.5 shadow-xs">
            <button
              type="button"
              onClick={() => setViewMode('teams')}
              className={cx(
                'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer',
                viewMode === 'teams' ? 'bg-raised text-ink shadow-xs' : 'text-dim hover:text-ink',
              )}
              title="Team clusters view"
            >
              <UsersThree size={14} weight={viewMode === 'teams' ? 'bold' : 'regular'} />
              <span>Teams</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={cx(
                'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer',
                viewMode === 'grid' ? 'bg-raised text-ink shadow-xs' : 'text-dim hover:text-ink',
              )}
              title="Grid view"
            >
              <SquaresFour size={14} weight={viewMode === 'grid' ? 'bold' : 'regular'} />
              <span>Grid</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={cx(
                'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer',
                viewMode === 'table' ? 'bg-raised text-ink shadow-xs' : 'text-dim hover:text-ink',
              )}
              title="Directory roster view"
            >
              <Table size={14} weight={viewMode === 'table' ? 'bold' : 'regular'} />
              <span>Roster</span>
            </button>
          </div>
        </header>

        {/* ── Single Unified Toolbar ── */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          {/* Department Filter Tabs */}
          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={() => setSelectedDept('all')}
              className={cx(
                'cursor-pointer rounded-lg px-3 py-1.5 text-xs font-semibold transition-all',
                selectedDept === 'all'
                  ? 'bg-ink text-bg shadow-xs'
                  : 'border border-line bg-surface text-mut hover:border-linebright hover:bg-hover hover:text-ink',
              )}
            >
              All ({allAgents.length})
            </button>
            {departments.map((d) => {
              const count = allAgents.filter((a) => a.deptId === d.id).length
              const isSelected = selectedDept === d.id
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setSelectedDept(d.id)}
                  className={cx(
                    'cursor-pointer rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all flex items-center gap-1.5',
                    isSelected
                      ? 'bg-ink text-bg font-semibold shadow-xs'
                      : 'border border-line bg-surface text-mut hover:border-linebright hover:bg-hover hover:text-ink',
                  )}
                >
                  <span>{d.name}</span>
                  <span
                    className={cx(
                      'rounded px-1.5 py-0.2 font-mono text-[10px]',
                      isSelected ? 'bg-bg/20 text-bg' : 'bg-raised text-dim',
                    )}
                  >
                    {count}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Search Input */}
          <div className="relative min-w-64">
            <MagnifyingGlass
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-dim"
            />
            <input
              id="agent-search-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter agents… (/)"
              className="h-8.5 w-full rounded-lg border border-line bg-surface py-1 pr-8 pl-8.5 text-xs text-ink outline-none transition-all placeholder:text-dim focus:border-task focus:ring-2 focus:ring-task/20"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-dim hover:bg-hover hover:text-ink cursor-pointer"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* ── Main Content Area ── */}
        <main className="mt-6 min-w-0 flex-1">
          {filteredAgents.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-line bg-surface p-12 text-center shadow-xs">
              <p className="text-[14px] font-semibold text-ink">No agents match your filter</p>
              <button
                type="button"
                onClick={() => {
                  setSearch('')
                  setSelectedDept('all')
                }}
                className="btn btn-primary mt-3 h-7.5 rounded-lg px-3 text-xs font-semibold cursor-pointer"
              >
                Reset Filter
              </button>
            </div>
          ) : viewMode === 'teams' ? (
            /* ── Team Clusters View ── */
            <div className="space-y-8">
              {deptClusters.map((cluster) => (
                <DepartmentSection
                  key={cluster.department.id}
                  cluster={cluster}
                  world={world}
                  onInspect={(agentId) => setInspectAgentId(agentId)}
                />
              ))}
            </div>
          ) : viewMode === 'grid' ? (
            /* ── Grid View ── */
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
              {filteredAgents.map((agent) => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  world={world}
                  onInspect={() => setInspectAgentId(agent.id)}
                />
              ))}
            </div>
          ) : (
            /* ── Directory Roster View ── */
            <div className="overflow-x-auto rounded-xl border border-line bg-surface shadow-xs">
              <table className="w-full min-w-[840px] table-fixed border-collapse text-left">
                <colgroup>
                  <col className="w-[26%]" />
                  <col className="w-[16%]" />
                  <col className="w-[14%]" />
                  <col className="w-[28%]" />
                  <col className="w-[16%]" />
                </colgroup>
                <thead>
                  <tr className="border-b border-line bg-raised/40 text-[11px] font-semibold text-dim uppercase tracking-wider">
                    <th className="px-4 py-2.5">Agent</th>
                    <th className="px-4 py-2.5">Department</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5">Capabilities</th>
                    <th className="px-4 py-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {filteredAgents.map((agent) => (
                    <DirectoryRow
                      key={agent.id}
                      agent={agent}
                      world={world}
                      onInspect={() => setInspectAgentId(agent.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </main>
      </div>

      {/* ── Inspection Modal ── */}
      {inspectedAgent && (
        <AgentModal
          agent={inspectedAgent}
          world={world}
          onClose={() => setInspectAgentId(null)}
        />
      )}
    </div>
  )
}

/** Clean Department Section with Minimal Header */
function DepartmentSection({
  cluster,
  world,
  onInspect,
}: {
  cluster: {
    department: Department
    agents: AgentDef[]
    operator?: AgentDef
    specialists: AgentDef[]
  }
  world: World
  onInspect: (agentId: string) => void
}) {
  const { department: dept, operator, specialists } = cluster
  const leadPerson = personById.get(dept.leadId)

  const openDeptWorkspace = () => {
    const store = useStore.getState()
    store.requestCamera({ type: 'dept', deptId: dept.id })
    store.openPanel('dept', dept.id)
  }

  return (
    <section aria-label={dept.name} className="space-y-3">
      {/* ── Section Header ── */}
      <div className="flex items-center justify-between border-b border-line pb-2">
        <div className="flex items-center gap-2.5">
          <h2 className="text-[16px] font-bold tracking-tight text-ink">
            {dept.name}
          </h2>
          {leadPerson && (
            <span className="text-[12px] text-mut">
              · Lead: <span className="font-medium text-ink">{leadPerson.name}</span>
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={openDeptWorkspace}
          className="text-xs font-semibold text-task hover:underline cursor-pointer inline-flex items-center gap-1"
        >
          <span>Workspace</span>
          <ArrowRight size={11} weight="bold" />
        </button>
      </div>

      {/* ── Cards Grid ── */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
        {operator && (
          <AgentCard
            key={operator.id}
            agent={operator}
            world={world}
            isLead
            onInspect={() => onInspect(operator.id)}
          />
        )}
        {specialists.map((specialist) => (
          <AgentCard
            key={specialist.id}
            agent={specialist}
            world={world}
            onInspect={() => onInspect(specialist.id)}
          />
        ))}
      </div>
    </section>
  )
}

/** Quiet, High-Craft Agent Card */
function AgentCard({
  agent,
  world,
  isLead = false,
  onInspect,
}: {
  agent: AgentDef
  world: World
  isLead?: boolean
  onInspect: () => void
}) {
  const status = world.agentStatus.get(agent.id) ?? 'idle'
  const taskId = world.agentTask.get(agent.id)
  const task = taskId ? world.tasks.get(taskId) : undefined
  const statusCfg = STATUS_MAP[status]
  const isOperator = agent.kind === 'operator' || isLead

  const openAgentRoom = (e: React.MouseEvent) => {
    e.stopPropagation()
    const store = useStore.getState()
    store.requestCamera({ type: 'agent', agentId: agent.id })
    store.openPanel('agent', agent.id)
  }

  return (
    <div
      onClick={onInspect}
      tabIndex={0}
      className="group relative flex flex-col justify-between rounded-xl border border-line bg-surface p-4 shadow-xs transition-all hover:border-linebright hover:shadow-md cursor-pointer text-left focus:outline-none focus:ring-2 focus:ring-task/30"
    >
      <div>
        {/* Top Header: Name + Lead/Specialist */}
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-[14.5px] font-bold tracking-tight text-ink group-hover:text-task transition-colors">
            {agent.name}
          </h3>

          <span
            className={cx(
              'rounded px-1.5 py-0.2 font-mono text-[9px] font-bold uppercase',
              isOperator
                ? 'bg-task/10 text-task border border-task/30'
                : 'bg-raised text-dim border border-line',
            )}
          >
            {isOperator ? 'Lead' : 'Specialist'}
          </span>
        </div>

        {/* Purpose */}
        <p className="mt-2 text-[12.5px] leading-normal text-mut line-clamp-2">
          {agent.purpose}
        </p>

        {/* Active Task (only if working) */}
        {task && (
          <div className="mt-3 flex items-center gap-2 rounded-md border border-task/30 bg-task/10 px-2.5 py-1.5 text-[11.5px]">
            <span className="size-1.5 shrink-0 rounded-full bg-task animate-pulse" />
            <span className="truncate font-medium text-ink">{task.title}</span>
          </div>
        )}

        {/* Skills & Tools */}
        {((agent.skills && agent.skills.length > 0) || agent.toolIds.length > 0) && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {(agent.skills ?? []).slice(0, 3).map((skill) => (
              <span
                key={skill}
                className="rounded border border-line bg-raised px-1.5 py-0.2 text-[10.5px] text-mut"
              >
                {skill}
              </span>
            ))}
            {agent.toolIds.map((id) => (
              <span
                key={id}
                className="inline-flex items-center gap-1 rounded border border-line bg-raised/50 px-1.5 py-0.2 font-mono text-[9.5px] text-dim"
              >
                <Wrench size={9} />
                <span>{toolById.get(id)?.name ?? id}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Card Action Footer */}
      <div className="mt-4 flex items-center justify-between border-t border-line/60 pt-3 text-[11.5px]">
        <div className="flex items-center gap-1.5 text-mut font-medium">
          <span className={cx('size-1.5 rounded-full', statusCfg.dotCls)} />
          <span>{statusCfg.label}</span>
        </div>

        <button
          type="button"
          onClick={openAgentRoom}
          className="inline-flex items-center gap-1 font-semibold text-task hover:underline cursor-pointer"
        >
          <span>Open Room</span>
          <ArrowRight size={10} weight="bold" />
        </button>
      </div>
    </div>
  )
}

/** Directory Row */
function DirectoryRow({
  agent,
  world,
  onInspect,
}: {
  agent: AgentDef
  world: World
  onInspect: () => void
}) {
  const status = world.agentStatus.get(agent.id) ?? 'idle'
  const dept = deptById.get(agent.deptId)
  const isOperator = agent.kind === 'operator'
  const statusCfg = STATUS_MAP[status]

  const openRoom = (e: React.MouseEvent) => {
    e.stopPropagation()
    const store = useStore.getState()
    store.requestCamera({ type: 'agent', agentId: agent.id })
    store.openPanel('agent', agent.id)
  }

  return (
    <tr
      tabIndex={0}
      onClick={onInspect}
      className="group cursor-pointer transition-colors hover:bg-hover/60"
    >
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13px] font-bold text-ink group-hover:text-task transition-colors">
            {agent.name}
          </span>
          <span
            className={cx(
              'rounded px-1.5 py-0.2 font-mono text-[8.5px] font-bold uppercase',
              isOperator
                ? 'bg-task/10 text-task border border-task/30'
                : 'bg-raised text-dim border border-line',
            )}
          >
            {isOperator ? 'Lead' : 'Specialist'}
          </span>
        </div>
      </td>

      <td className="px-4 py-3 text-[12px] font-medium text-mut">
        {dept?.name ?? agent.deptId}
      </td>

      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5 text-[11.5px] text-mut font-medium">
          <span className={cx('size-1.5 rounded-full', statusCfg.dotCls)} />
          <span>{statusCfg.label}</span>
        </div>
      </td>

      <td className="px-4 py-3 text-[11.5px] text-mut truncate">
        {(agent.skills ?? []).join(' · ')}
      </td>

      <td className="px-4 py-3 text-right">
        <button
          type="button"
          onClick={openRoom}
          className="btn h-6.5 rounded-md px-2 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
        >
          <span>Open Room</span>
          <ArrowRight size={9} weight="bold" />
        </button>
      </td>
    </tr>
  )
}

/** Modal for Agent Inspection */
function AgentModal({
  agent,
  world,
  onClose,
}: {
  agent: AgentDef
  world: World
  onClose: () => void
}) {
  const status = world.agentStatus.get(agent.id) ?? 'idle'
  const taskId = world.agentTask.get(agent.id)
  const task = taskId ? world.tasks.get(taskId) : undefined
  const dept = deptById.get(agent.deptId)
  const owner = personById.get(agent.ownerId)
  const isOperator = agent.kind === 'operator'
  const statusCfg = STATUS_MAP[status]

  const openRoom = () => {
    onClose()
    const store = useStore.getState()
    store.requestCamera({ type: 'agent', agentId: agent.id })
    store.openPanel('agent', agent.id)
  }

  return (
    <Modal onClose={onClose} width={520} ariaLabel={`${agent.name} Details`}>
      {/* Modal Header */}
      <div className="flex items-center justify-between border-b border-line px-5 py-4 bg-surface">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-[16px] font-bold text-ink">{agent.name}</h3>
            <span
              className={cx(
                'rounded px-1.5 py-0.2 font-mono text-[9px] font-bold uppercase',
                isOperator
                  ? 'bg-task/10 text-task border border-task/30'
                  : 'bg-raised text-dim border border-line',
              )}
            >
              {isOperator ? 'Lead' : 'Specialist'}
            </span>
          </div>
          <div className="text-[12px] text-dim mt-0.5">
            {dept?.name ?? agent.deptId} Department · Lead: {owner?.name}
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1.5 text-dim hover:bg-hover hover:text-ink cursor-pointer"
        >
          <X size={16} />
        </button>
      </div>

      {/* Modal Body */}
      <div className="space-y-4 p-5 bg-surface text-[13px]">
        <div>
          <div className="font-mono text-[10px] font-semibold uppercase text-dim tracking-wider">
            Purpose
          </div>
          <p className="mt-1 leading-relaxed text-ink bg-raised/40 border border-line rounded-lg p-2.5">
            {agent.purpose}
          </p>
        </div>

        {task && (
          <div>
            <div className="font-mono text-[10px] font-semibold uppercase text-dim tracking-wider">
              Active Task
            </div>
            <div className="mt-1 flex items-center justify-between rounded-lg border border-task/30 bg-task/10 p-2.5 text-xs">
              <span className="font-medium text-ink">{task.title}</span>
              <span className="font-mono text-[10.5px] text-task">{timeAgo(task.createdAt)}</span>
            </div>
          </div>
        )}

        {agent.skills && agent.skills.length > 0 && (
          <div>
            <div className="font-mono text-[10px] font-semibold uppercase text-dim tracking-wider">
              Skills
            </div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {agent.skills.map((skill) => (
                <span
                  key={skill}
                  className="rounded border border-line bg-raised px-2 py-0.5 text-xs text-ink"
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>
        )}

        {agent.toolIds.length > 0 && (
          <div>
            <div className="font-mono text-[10px] font-semibold uppercase text-dim tracking-wider">
              Connected Tools
            </div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {agent.toolIds.map((id) => (
                <span
                  key={id}
                  className="inline-flex items-center gap-1 rounded-lg border border-line bg-raised/50 px-2.5 py-1 font-mono text-xs text-ink"
                >
                  <Wrench size={11} className="text-dim" />
                  <span>{toolById.get(id)?.name ?? id}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Modal Actions */}
      <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3 bg-raised/30">
        <button
          type="button"
          onClick={onClose}
          className="btn h-7.5 rounded-lg px-3 text-xs font-medium cursor-pointer"
        >
          Close
        </button>
        <button
          type="button"
          onClick={openRoom}
          className="btn btn-primary h-7.5 rounded-lg px-3.5 text-xs font-semibold cursor-pointer inline-flex items-center gap-1 shadow-xs"
        >
          <span>Open Room</span>
          <ArrowRight size={11} weight="bold" />
        </button>
      </div>
    </Modal>
  )
}

