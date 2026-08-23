import { loadConfig } from './config.js'
import { EventStore } from './store.js'
import { Bus } from './bus.js'
import { startHttp } from './http.js'
import { OrgRegistry } from './org.js'
import { Scheduler } from './runtime/scheduler.js'
import { createMockBrain } from './brain/mock.js'
import { createGeminiBrain } from './brain/gemini.js'
import { createHeuristicGuardrail } from './guardrail/heuristic.js'
import { openJsonlMemory } from './memory/jsonl.js'
import { workerIdFromName } from './ids.js'
import { cancelExchangeTask } from './brain/exchanges.js'
import type { BrainCtx } from './brain/types.js'
import { AGENT_DEPT } from '../../src/data/company.js'
import type { WorldEvent } from '../../src/types.js'

const cfg = loadConfig()
const bus = new Bus<WorldEvent>()

function worldTasks(events: WorldEvent[]): { id: string; title: string; status: string }[] {
  const statusById = new Map<string, string>()
  const titleById = new Map<string, string>()
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]
    if (!e.taskId) continue
    let status: string | undefined
    switch (e.type) {
      case 'TaskCompleted': status = 'done'; break
      case 'TaskFailed': status = 'failed'; break
      case 'AuthRequired': status = e.blockedOn ? 'waiting_auth' : undefined; break
      case 'PermissionRequest': status = e.blockedOn ? 'waiting_approval' : undefined; break
      case 'TaskAccepted':
      case 'DelegatedTo':
      case 'StatusUpdate':
      case 'ArtifactDelivered': status = 'running'; break
      default: break
    }
    if (status && !statusById.has(e.taskId)) statusById.set(e.taskId, status)
    if (e.type === 'TaskRequest') titleById.set(e.taskId, e.title)
  }
  const out: { id: string; title: string; status: string }[] = []
  for (const [id, title] of titleById) out.push({ id, title, status: statusById.get(id) ?? 'queued' })
  return out
}

const interviews = new Map<string, number | null>()
const scheduler = new Scheduler(e => store.append(e))
const guardrail = createHeuristicGuardrail()
const brain = cfg.geminiApiKey
  ? createGeminiBrain({ apiKey: cfg.geminiApiKey, guardrail, memory: openJsonlMemory(cfg.dataDir) })
  : createMockBrain()

const brainCtx: BrainCtx = {
  emit: e => {
    void store.append(e)
  },
  schedule: (steps, baseDelayMs) => scheduler.schedule(steps, baseDelayMs),
  cancelTask: taskId => {
    scheduler.cancelTask(taskId)
    cancelExchangeTask(taskId)
  },
  worldTasks: () => worldTasks(store.all()),
  interviewStep: agentId => interviews.get(agentId) ?? null,
  setInterviewStep: (agentId, step) => {
    interviews.set(agentId, step)
  },
}

const RESOLUTION_TYPES = new Set(['AccountConnected', 'ApprovalGranted', 'BlueprintApproved'])

/** The live routing roster: every agent this server can address, seeded plus spawned. */
const DEPT_OF_AGENT: Record<string, string> = { ...AGENT_DEPT }
const KNOWN_AGENTS = new Set<string>(Object.keys(DEPT_OF_AGENT))

/** Registers a spawned agent in the routing roster so chats reach it. */
function registerAgent(id: string, deptId: string): void {
  DEPT_OF_AGENT[id] = deptId
  KNOWN_AGENTS.add(id)
}

function spawnFromBlueprintResolution(e: WorldEvent): void {
  if (!RESOLUTION_TYPES.has(e.type)) return
  const reasonId = e.payload?.reason
  if (!reasonId) return
  const orig = store.get(reasonId)
  if (orig?.type !== 'BlueprintProposed') return
  const bp = orig.payload?.blueprint
  if (!bp) return
  const agentId = workerIdFromName(bp.name, KNOWN_AGENTS)
  registerAgent(agentId, bp.deptId)
  void store.append({
    type: 'AgentSpawned',
    from: orig.from,
    deptFrom: bp.deptId,
    deptTo: bp.deptId,
    title: `${bp.name} is live`,
    detail: `Worker profile created in the shared runtime as ${agentId}.`,
    payload: {
      agent: {
        id: agentId,
        name: bp.name,
        deptId: bp.deptId,
        kind: 'worker',
        purpose: bp.purpose,
        skills: [...bp.skills],
        toolIds: [...bp.toolIds],
        ownerId: bp.ownerId,
      },
    },
  })
}

/** Agents spawned in earlier runs live on in the event log; re-register them so
 * chat routing and id uniqueness survive a restart. */
function restoreSpawnedAgents(events: WorldEvent[]): void {
  for (const e of events) {
    const a = e.type === 'AgentSpawned' ? e.payload?.agent : undefined
    if (a) registerAgent(a.id, a.deptId)
  }
}

function onAppended(e: WorldEvent): void {
  bus.publish(e)
  spawnFromBlueprintResolution(e)
  if (e.type === 'Chat' && e.from?.kind === 'person' && e.to?.kind === 'agent') {
    const text = typeof e.payload?.text === 'string' ? e.payload.text : ''
    if (text) brain.handle(brainCtx, e.to.id, DEPT_OF_AGENT[e.to.id] ?? org.deptOfAgent(e.to.id), text, e.from.id)
  }
}

const store = await EventStore.open(cfg.dataDir, onAppended)
restoreSpawnedAgents(store.all())
const org = new OrgRegistry(cfg.dataDir, e => store.append(e))
await org.load()
await startHttp(cfg, store, bus, org)
console.log(`LISTENING ${cfg.port}`)
