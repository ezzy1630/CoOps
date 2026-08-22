import { useMemo } from 'react'
import { useStore } from '../store'
import { deptById, personById, toolById } from '../data/company'
import { cx, fmtDay } from '../utils'
import { Chip, Pill } from '../components/ui'
import type { AgentDef, AgentStatus } from '../types'

const STATUS_LABEL: Record<AgentStatus, string> = {
  idle: 'Idle',
  working: 'Working',
  blocked: 'Blocked',
}

const STATUS_CLASS: Record<AgentStatus, string> = {
  idle: 'border-linebright/70 bg-raised text-mut',
  working: 'border-task/45 bg-task/10 text-task',
  blocked: 'border-human/45 bg-human/10 text-human',
}

/** Live roster of the agents currently present in the reduced world. */
export default function AgentsPage() {
  const world = useStore((s) => s.world)
  const agents = useMemo(
    () => [...world.agents].sort((a, b) => {
      const dept = (deptById.get(a.deptId)?.name ?? a.deptId).localeCompare(deptById.get(b.deptId)?.name ?? b.deptId)
      if (dept !== 0) return dept
      if (a.kind !== b.kind) return a.kind === 'operator' ? -1 : 1
      return a.name.localeCompare(b.name)
    }),
    [world.agents],
  )
  const working = agents.filter((a) => world.agentStatus.get(a.id) === 'working').length
  const blocked = agents.filter((a) => world.agentStatus.get(a.id) === 'blocked').length

  return (
    <div className="flex h-full min-w-0 flex-col overflow-y-auto overscroll-contain bg-surface">
      <div className="mx-auto flex w-full max-w-[1600px] min-w-0 flex-1 flex-col px-5 py-6 lg:px-8 lg:py-7">
        <header className="flex shrink-0 items-end justify-between gap-4 border-b border-line pb-5">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-dim">Runtime directory</div>
            <h2 className="mt-1.5 text-[21px] font-semibold tracking-[-0.02em]">Agents</h2>
            <p className="mt-1.5 text-[12px] text-dim">The operators and workers currently registered in the company runtime.</p>
          </div>
          <div className="hidden items-center gap-2 sm:flex">
            <Chip>{agents.length} total</Chip>
            {blocked > 0 && <Chip className="border-human/45! bg-human/10! text-human!">{blocked} blocked</Chip>}
          </div>
        </header>

        <div className="mt-5 grid shrink-0 grid-cols-3 gap-px border border-line bg-line">
          <RosterStat label="Registered" value={String(agents.length)} />
          <RosterStat label="Working" value={String(working)} tone={working > 0 ? 'text-task' : 'text-mut'} />
          <RosterStat label="Blocked" value={String(blocked)} tone={blocked > 0 ? 'text-human' : 'text-mut'} />
        </div>

        <div className="mt-5 min-w-0 flex-1 overflow-x-auto border-y border-line">
          <table className="w-full min-w-[1040px] table-fixed border-collapse text-left">
            <colgroup>
              <col className="w-[24%]" />
              <col className="w-[14%]" />
              <col className="w-[12%]" />
              <col className="w-[13%]" />
              <col className="w-[22%]" />
              <col className="w-[10%]" />
              <col className="w-[5%]" />
            </colgroup>
            <thead className="bg-raised/55">
              <tr className="border-b border-line">
                <th className="px-3 py-2.5 font-mono text-[10px] font-medium uppercase tracking-wider text-dim">Agent</th>
                <th className="px-3 py-2.5 font-mono text-[10px] font-medium uppercase tracking-wider text-dim">Department</th>
                <th className="px-3 py-2.5 font-mono text-[10px] font-medium uppercase tracking-wider text-dim">Class</th>
                <th className="px-3 py-2.5 font-mono text-[10px] font-medium uppercase tracking-wider text-dim">Status</th>
                <th className="px-3 py-2.5 font-mono text-[10px] font-medium uppercase tracking-wider text-dim">Current task</th>
                <th className="px-3 py-2.5 font-mono text-[10px] font-medium uppercase tracking-wider text-dim">Tools</th>
                <th className="px-3 py-2.5 text-right font-mono text-[10px] font-medium uppercase tracking-wider text-dim">Spawned</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((agent) => (
                <AgentRow key={agent.id} agent={agent} world={world} />
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 shrink-0 text-[10px] text-dim">Select an agent to open its room on the map.</p>
      </div>
    </div>
  )
}

function AgentRow({ agent, world }: { agent: AgentDef; world: ReturnType<typeof useStore.getState>['world'] }) {
  const status = world.agentStatus.get(agent.id) ?? 'idle'
  const taskId = world.agentTask.get(agent.id)
  const task = taskId ? world.tasks.get(taskId) : undefined
  const dept = deptById.get(agent.deptId)
  const owner = personById.get(agent.ownerId)
  const tools = agent.toolIds.map((id) => toolById.get(id)?.name ?? id)

  const open = () => {
    const store = useStore.getState()
    store.requestCamera({ type: 'agent', agentId: agent.id })
    store.openPanel('agent', agent.id)
  }

  return (
    <tr
      tabIndex={0}
      className="cursor-pointer border-b border-line/60 align-middle transition-colors hover:bg-hover/50 focus:bg-hover/50 focus:outline-none"
      onClick={open}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          open()
        }
      }}
      title={`Open ${agent.name} on the map`}
    >
      <td className="px-3 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className={cx('flex size-7 shrink-0 items-center justify-center rounded-[5px] border text-[10px] font-semibold', agent.kind === 'operator' ? 'border-task/40 bg-task/10 text-task' : 'border-linebright bg-raised text-mut')}>
            {agent.kind === 'operator' ? 'OP' : 'W'}
          </span>
          <div className="min-w-0">
            <div className="truncate text-[12px] font-medium text-ink">{agent.name}</div>
            <div className="truncate text-[10px] text-dim">Owned by {owner?.name ?? agent.ownerId}</div>
          </div>
        </div>
      </td>
      <td className="px-3 py-3 text-[11px] text-mut">{dept?.name ?? agent.deptId}</td>
      <td className="px-3 py-3"><Pill className="text-[9px] text-mut">{agent.kind}</Pill></td>
      <td className="px-3 py-3"><Pill className={cx('text-[9px]', STATUS_CLASS[status])}>{STATUS_LABEL[status]}</Pill></td>
      <td className="max-w-0 px-3 py-3">
        <div className={cx('truncate text-[11px]', task ? 'text-ink' : 'text-dim')} title={task?.title}>{task?.title ?? 'No active task'}</div>
      </td>
      <td className="max-w-0 px-3 py-3">
        <div className="truncate text-[10px] text-mut" title={tools.join(', ')}>{tools.length > 0 ? tools.join(' · ') : 'None'}</div>
      </td>
      <td className="px-3 py-3 text-right font-mono text-[10px] whitespace-nowrap text-dim tabular-nums">
        {agent.bornAt ? fmtDay(agent.bornAt) : 'Setup'}
      </td>
    </tr>
  )
}

function RosterStat({ label, value, tone = 'text-ink' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="bg-raised/60 px-3 py-2.5">
      <div className="font-mono text-[10px] uppercase tracking-wider text-dim">{label}</div>
      <div className={cx('mt-1 text-[16px] font-semibold leading-none tabular-nums', tone)}>{value}</div>
    </div>
  )
}
