import type {
  AgentDef, AgentStatus, Department, EventType, PendingApproval, Task, World, WorldEvent,
} from '../types'

/**
 * The world is a pure fold over the event log up to a point in virtual time.
 * This single function powers the live map, the activity feed, the approvals
 * queue AND the replay scrubber (replay = fold up to an earlier instant).
 */
/** Event types whose payload.reason carries the eventId of an approval they resolve. */
const RESOLVES_APPROVAL = new Set<EventType>(['AccountConnected', 'ApprovalGranted', 'BlueprintApproved', 'TaskFailed'])

export function buildWorld(
  baseAgents: AgentDef[], baseDepartments: Department[], log: WorldEvent[], upTo: number,
): World {
  const tasks = new Map<string, Task>()
  const agents: AgentDef[] = [...baseAgents]
  const departments = new Map(baseDepartments.map((d) => [d.id, d]))
  const approvals: PendingApproval[] = []
  const taskAgents = new Map<string, Set<string>>()
  const events: WorldEvent[] = []
  const resolved = new Set<string>() // eventIds of satisfied approvals
  const removedAgents = new Set<string>() // agentIds whose department was removed

  const touch = (e: WorldEvent): Task => {
    let t = tasks.get(e.taskId!)
    if (!t) {
      t = {
        id: e.taskId!,
        title: e.title,
        objective: e.payload?.objective,
        originDept: e.deptFrom ?? e.deptTo ?? 'operations',
        status: 'queued',
        createdAt: e.ts,
        path: [],
        eventIds: [],
        artifacts: [],
        costUsd: 0,
        requestedBy: e.from?.kind === 'person' ? e.from.id : undefined,
        ownerAgent: e.to?.kind === 'agent' ? e.to.id : undefined,
      }
      tasks.set(t.id, t)
      taskAgents.set(t.id, new Set())
    }
    return t
  }

  const involve = (taskId: string, ...refs: (WorldEvent['from'] | WorldEvent['to'])[]) => {
    const set = taskAgents.get(taskId)
    if (!set) return
    for (const r of refs) if (r?.kind === 'agent') set.add(r.id)
  }

  for (const e of log) {
    if (e.ts > upTo) break
    events.push(e)
    if (e.payload?.reason && RESOLVES_APPROVAL.has(e.type)) resolved.add(e.payload.reason)

    if (e.taskId && e.type !== 'Chat') {
      const t = touch(e)
      t.eventIds.push(e.id)
      for (const d of [e.deptFrom, e.deptTo]) {
        if (d && !t.path.includes(d)) t.path.push(d)
      }
      involve(t.id, e.from, e.to)
      if (e.payload?.costUsd) t.costUsd += e.payload.costUsd

      switch (e.type) {
        case 'TaskRequest':
          if (t.status === 'queued' && t.eventIds.length > 1) break
          break
        case 'TaskAccepted':
        case 'DelegatedTo':
        case 'StatusUpdate':
        case 'ToolCall':
          if (t.status === 'queued') t.status = 'running'
          break
        case 'AuthRequired':
        case 'PermissionRequest': {
          if (e.blockedOn) {
            t.status = e.blockedOn.kind === 'auth' ? 'waiting_auth' : 'waiting_approval'
            t.blockedOn = e.blockedOn
            approvals.push({
              eventId: e.id, taskId: t.id, kind: e.blockedOn.kind,
              what: e.blockedOn.what, personId: e.blockedOn.personId,
              requestedBy: e.from, deptId: e.deptTo ?? e.deptFrom, ts: e.ts,
              rehearsalId: e.payload?.rehearsalId,
            })
          }
          break
        }
        case 'ApprovalGranted':
        case 'AccountConnected': {
          t.status = 'running'
          t.blockedOn = undefined
          break
        }
        case 'ArtifactDelivered':
          if (e.payload?.artifact) {
            t.artifacts.push({ ...e.payload.artifact, fromDept: e.deptFrom })
          }
          if (t.status === 'queued') t.status = 'running'
          break
        case 'Escalation':
          if (t.status === 'queued') t.status = 'running'
          break
        case 'TaskCompleted':
          t.status = 'done'
          t.endedAt = e.ts
          break
        case 'TaskFailed':
          t.status = 'failed'
          t.endedAt = e.ts
          break
        default:
          break
      }
    }

    if (e.type === 'BlueprintProposed' && e.payload?.blueprint) {
      approvals.push({
        eventId: e.id, taskId: e.taskId, kind: 'blueprint',
        what: `New agent: ${e.payload.blueprint.name}`,
        personId: e.payload.blueprint.ownerId,
        requestedBy: e.from, deptId: e.payload.blueprint.deptId, ts: e.ts,
        blueprint: e.payload.blueprint,
        rehearsalId: e.payload.rehearsalId,
      })
    }
    if (e.type === 'AgentSpawned' && e.payload?.agent) {
      agents.push({ ...e.payload.agent, bornAt: e.ts })
    }
    if (e.type === 'DeptAdded' && e.payload?.department) {
      departments.set(e.payload.department.id, e.payload.department)
      // the new department arrives with its operator, spawned just like AgentSpawned
      if (e.payload.agent) agents.push({ ...e.payload.agent, bornAt: e.ts })
    }
    if (e.type === 'DeptRemoved' && e.payload?.department) {
      const id = e.payload.department.id
      departments.delete(id)
      for (let i = agents.length - 1; i >= 0; i--) {
        if (agents[i].deptId === id) {
          removedAgents.add(agents[i].id)
          agents.splice(i, 1)
        }
      }
    }
  }

  // agent statuses: blocked > working > idle
  const agentStatus = new Map<string, AgentStatus>()
  const agentTask = new Map<string, string>()
  for (const t of tasks.values()) {
    if (t.status === 'done' || t.status === 'failed') continue
    const members = taskAgents.get(t.id) ?? new Set()
    for (const a of members) {
      if (removedAgents.has(a)) continue
      const blocked = t.status === 'waiting_auth' || t.status === 'waiting_approval'
      const prev = agentStatus.get(a)
      if (blocked || prev !== 'blocked') {
        agentStatus.set(a, blocked ? 'blocked' : 'working')
        agentTask.set(a, t.id)
      }
    }
  }

  return {
    tasks,
    agents,
    departments,
    agentStatus,
    agentTask,
    approvals: approvals.filter((a) => !resolved.has(a.eventId)),
    events,
  }
}

/** Agents a task involved (for focus mode / replay lighting). */
export function taskParticipants(world: World, taskId: string): { agents: Set<string>; depts: Set<string> } {
  const agents = new Set<string>()
  const depts = new Set<string>()
  const t = world.tasks.get(taskId)
  if (!t) return { agents, depts }
  const byId = new Map(world.events.map((e) => [e.id, e]))
  for (const id of t.eventIds) {
    const e = byId.get(id)
    if (!e) continue
    for (const r of [e.from, e.to]) if (r?.kind === 'agent') agents.add(r.id)
    for (const d of [e.deptFrom, e.deptTo]) if (d) depts.add(d)
  }
  return { agents, depts }
}
