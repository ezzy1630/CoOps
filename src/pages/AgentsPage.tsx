import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import { deptById, personById, toolById } from '../data/company'
import { cx, fmtDay } from '../utils'
import type { AgentDef, AgentStatus, World } from '../types'

const STATUS_LABEL: Record<AgentStatus, string> = {
  idle: 'Idle',
  working: 'Working',
  blocked: 'Blocked',
}

const STATUS_CLASS: Record<AgentStatus, string> = {
  idle: 'text-dim',
  working: 'text-task',
  blocked: 'text-human',
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
      <div className="flex w-full min-w-0 flex-1 flex-col px-6 py-4 lg:px-9">
        <header className="flex min-h-12 shrink-0 flex-wrap items-center gap-x-5 gap-y-2 border-b border-line pb-3">
          <h2 className="text-[21px] leading-none font-semibold tracking-[-0.02em]">Agents</h2>
          <div className="flex items-baseline gap-1.5">
            <span className="text-[21px] leading-none font-semibold tabular-nums">{agents.length}</span>
            <span className="text-[12px] text-dim">registered</span>
          </div>
          <span className="font-mono text-[11px] tabular-nums text-dim">
            <span className={working > 0 ? 'text-task' : undefined}>{working} working</span>
            {' · '}
            <span className={blocked > 0 ? 'text-human' : undefined}>{blocked} blocked</span>
          </span>
        </header>

        <div className="min-w-0 flex-1 overflow-x-auto pt-1">
          <table className="w-full min-w-[1000px] table-fixed border-collapse text-left">
            <colgroup>
              <col className="w-[27%]" />
              <col className="w-[15%]" />
              <col className="w-[13%]" />
              <col className="w-[25%]" />
              <col className="w-[20%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-line">
                {['Agent', 'Department', 'Status', 'Current task', 'Tools'].map((label) => <th key={label} className="px-3 py-2.5 text-[11px] font-medium text-dim">{label}</th>)}
                <th className="px-3 py-2.5 text-right text-[11px] font-medium text-dim">Spawned</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((agent) => (
                <AgentRow key={agent.id} agent={agent} world={world} />
              ))}
            </tbody>
          </table>
        </div>
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
          <span
            className={cx('relative flex size-6 shrink-0 items-center justify-center border text-[10px] font-semibold', agent.kind === 'operator' ? 'border-task/40 text-task' : 'border-linebright text-mut')}
            title={agent.kind === 'operator' ? 'Department agent' : 'Worker'}
          >
            {agent.kind === 'operator' ? 'O' : 'W'}
            {status === 'working' && <span className="absolute -inset-1 border border-task/35" aria-hidden />}
          </span>
          <div className="min-w-0">
            <div className="truncate text-[13px] font-medium text-ink">{agent.name}</div>
            <div className="truncate text-[10.5px] text-dim">Owned by {owner?.name ?? agent.ownerId}</div>
          </div>
        </div>
      </td>
      <td className="px-3 py-2 text-[12px] text-mut">{dept?.name ?? agent.deptId}</td>
      <td className="px-3 py-2">
        <span className={cx('text-[11.5px] font-medium', STATUS_CLASS[status])}>{status === 'blocked' && <CapabilityGlyph />}{STATUS_LABEL[status]}</span>
      </td>
      <td className="max-w-0 px-3 py-2">
        {task ? (
          <div className="break-words text-[12px] text-ink" title={task.title}>{task.title}</div>
        ) : null}
      </td>
      <td className="px-3 py-2">
        {tools.length > 0 ? (
          <span className="text-[10.5px] leading-[1.5] text-mut">{tools.join(', ')}</span>
        ) : null}
      </td>
      <td className="relative px-3 py-2 text-right font-mono text-[10.5px] whitespace-nowrap text-dim tabular-nums">
        <span className="transition-opacity group-hover:opacity-0 group-focus:opacity-0">{agent.bornAt ? fmtDay(agent.bornAt) : ''}</span>
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[10.5px] text-task opacity-0 transition-opacity group-hover:opacity-100 group-focus:opacity-100">Open on map ↗</span>
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
