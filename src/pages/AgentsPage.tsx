import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import { deptById, personById, toolById } from '../data/company'
import { cx, fmtDay } from '../utils'
import { Pill } from '../components/ui'
import type { AgentDef, AgentStatus, World } from '../types'

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
      <div className="mx-auto flex w-full max-w-[1600px] min-w-0 flex-1 flex-col px-5 py-5 lg:px-8 lg:py-6">
        <header className="flex shrink-0 flex-wrap items-baseline gap-x-3 gap-y-1.5 border-b border-line pb-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-dim">Runtime directory</span>
          <h2 className="text-[19px] font-semibold tracking-[-0.02em]">Agents</h2>
          <span className="font-mono text-[10px] tabular-nums text-dim">
            {agents.length} registered <span className="text-linebright">·</span>{' '}
            <span className={working > 0 ? 'text-task' : undefined}>{working} working</span> <span className="text-linebright">·</span>{' '}
            <span className={blocked > 0 ? 'text-human' : undefined}>{blocked} blocked</span>
          </span>
          <span className="ml-auto hidden font-mono text-[10px] uppercase tracking-wider text-dim sm:inline">Live world</span>
        </header>

        <div className="mt-4 min-w-0 flex-1 overflow-x-auto border-y border-line">
          <table className="w-full min-w-[1120px] table-fixed border-collapse text-left">
            <colgroup>
              <col className="w-[24%]" />
              <col className="w-[14%]" />
              <col className="w-[10%]" />
              <col className="w-[12%]" />
              <col className="w-[21%]" />
              <col className="w-[17%]" />
              <col className="w-[12%]" />
            </colgroup>
            <thead className="bg-raised/55">
              <tr className="border-b border-line">
                <th className="px-3 py-2 font-mono text-[10px] font-medium uppercase tracking-wider text-dim">Agent</th>
                <th className="px-3 py-2 font-mono text-[10px] font-medium uppercase tracking-wider text-dim">Department</th>
                <th className="px-3 py-2 font-mono text-[10px] font-medium uppercase tracking-wider text-dim">Class</th>
                <th className="px-3 py-2 font-mono text-[10px] font-medium uppercase tracking-wider text-dim">Status</th>
                <th className="px-3 py-2 font-mono text-[10px] font-medium uppercase tracking-wider text-dim">Current task</th>
                <th className="px-3 py-2 font-mono text-[10px] font-medium uppercase tracking-wider text-dim">Tools</th>
                <th className="px-3 py-2 text-right font-mono text-[10px] font-medium uppercase tracking-wider text-dim">Spawned</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((agent) => (
                <AgentRow key={agent.id} agent={agent} world={world} />
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 shrink-0 text-[10px] text-dim">Rows open the selected agent on the map.</p>
      </div>
    </div>
  )
}

function AgentRow({ agent, world }: { agent: AgentDef; world: World }) {
  const status = world.agentStatus.get(agent.id) ?? 'idle'
  const taskId = world.agentTask.get(agent.id)
  const task = taskId ? world.tasks.get(taskId) : undefined
  const dept = deptById.get(agent.deptId)
  const owner = personById.get(agent.ownerId)
  const tools = agent.toolIds.map((id) => toolById.get(id)?.name ?? id)
  const changeKey = `${status}:${taskId ?? ''}`
  const previousChange = useRef(changeKey)
  const [pulse, setPulse] = useState(false)

  useEffect(() => {
    if (previousChange.current === changeKey) return
    previousChange.current = changeKey
    setPulse(true)
    const timer = window.setTimeout(() => setPulse(false), 900)
    return () => window.clearTimeout(timer)
  }, [changeKey])

  const open = () => {
    const store = useStore.getState()
    store.requestCamera({ type: 'agent', agentId: agent.id })
    store.openPanel('agent', agent.id)
  }

  const hue = personById.get(dept?.leadId ?? agent.ownerId)?.hue ?? 0
  const pulseRing = status === 'blocked' ? 'ring-human/45' : status === 'working' ? 'ring-task/45' : 'ring-linebright/50'

  return (
    <tr
      tabIndex={0}
      className={cx(
        'group cursor-pointer border-b border-line/60 align-middle transition-[background-color,box-shadow] duration-700 hover:bg-hover/50 focus:bg-hover/50 focus:outline-none',
        pulse && `ring-1 ${pulseRing}`,
      )}
      onClick={open}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          open()
        }
      }}
      title={`Open ${agent.name} on the map`}
    >
      <td className="px-3 py-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="h-5 w-0.5 shrink-0 rounded-full" style={{ background: `hsl(${hue} 55% 50%)` }} aria-hidden />
          <span className={cx('flex size-6 shrink-0 items-center justify-center rounded-[5px] border text-[9px] font-semibold', agent.kind === 'operator' ? 'border-task/40 bg-task/10 text-task' : 'border-linebright bg-raised text-mut')}>
            {agent.kind === 'operator' ? 'OP' : 'W'}
          </span>
          <div className="min-w-0">
            <div className="truncate text-[12px] font-medium text-ink">{agent.name}</div>
            <div className="truncate text-[10px] text-dim">Owned by {owner?.name ?? agent.ownerId}</div>
          </div>
        </div>
      </td>
      <td className="px-3 py-2 text-[11px] text-mut">{dept?.name ?? agent.deptId}</td>
      <td className="px-3 py-2"><Pill className="text-[9px] text-mut">{agent.kind}</Pill></td>
      <td className="px-3 py-2">
        <Pill className={cx('text-[9px]', STATUS_CLASS[status])}>
          {status === 'blocked' && <CapabilityGlyph />}
          {STATUS_LABEL[status]}
        </Pill>
      </td>
      <td className="max-w-0 px-3 py-2">
        <div className={cx('break-words text-[11px]', task ? 'text-ink' : 'text-dim')} title={task?.title}>{task?.title ?? '—'}</div>
      </td>
      <td className="px-3 py-2">
        {tools.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {tools.map((tool) => <span key={tool} className="rounded border border-line px-1.5 py-0.5 font-mono text-[9px] text-mut">{tool}</span>)}
          </div>
        ) : (
          <span className="font-mono text-[10px] text-dim">—</span>
        )}
      </td>
      <td className="relative px-3 py-2 text-right font-mono text-[10px] whitespace-nowrap text-dim tabular-nums">
        <span className="transition-opacity group-hover:opacity-0 group-focus:opacity-0">{agent.bornAt ? fmtDay(agent.bornAt) : '—'}</span>
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[10px] text-task opacity-0 transition-opacity group-hover:opacity-100 group-focus:opacity-100">Open on map ↗</span>
      </td>
    </tr>
  )
}

function CapabilityGlyph() {
  return (
    <svg viewBox="0 0 12 12" className="mr-1 inline size-2.5" aria-hidden="true">
      <rect x="3" y="5" width="6" height="5" rx="1" fill="none" stroke="currentColor" strokeWidth="1" />
      <path d="M4.5 5V3.8a1.5 1.5 0 0 1 3 0V5" fill="none" stroke="currentColor" strokeWidth="1" />
    </svg>
  )
}
