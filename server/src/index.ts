import { DEFAULT_GEMINI_MODEL, loadConfig } from './config.js'
import { EventStore } from './store.js'
import { Bus } from './bus.js'
import { startHttp } from './http.js'
import { OrgRegistry } from './org.js'
import { Scheduler } from './runtime/scheduler.js'
import { createMockBrain } from './brain/mock.js'
import { createGeminiBrain } from './brain/gemini.js'
import { createHeuristicGuardrail } from './guardrail/heuristic.js'
import { createModelArmorGuardrail } from './guardrail/modelarmor.js'
import { openJsonlMemory } from './memory/jsonl.js'
import { openFirestoreMemory } from './memory/firestore.js'
import { createGoogleOAuth } from './auth/google.js'
import { createWorkspaceTools } from './tools/google.js'
import { newId, workerIdFromName } from './ids.js'
import { cancelExchangeTask } from './brain/exchanges.js'
import type { BrainAdapter, BrainCtx } from './brain/types.js'
import { AGENT_DEPT } from '../../src/data/company.js'
import type { RuntimeInfo, WorldEvent } from '../../src/types.js'

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
const guardrail = cfg.modelArmor ? createModelArmorGuardrail(cfg.modelArmor) : createHeuristicGuardrail()
const memory = cfg.firestore
  ? openFirestoreMemory({ projectId: cfg.firestore.projectId })
  : openJsonlMemory(cfg.dataDir)
console.log(`[memory] ${cfg.firestore ? 'firestore' : 'jsonl'}`)
const google = createGoogleOAuth(cfg.googleOAuth)
const workspaceTools = createWorkspaceTools({
  getAccessToken: () => google.accessToken(),
  sheetsId: cfg.sheetsId,
})
const apiKey = cfg.geminiApiKey
const effectiveBrain =
  !cfg.brainMode || cfg.brainMode === 'auto' ? (apiKey ? 'gemini' : 'mock') : cfg.brainMode
const geminiModel = cfg.geminiModel ?? DEFAULT_GEMINI_MODEL
let brain: BrainAdapter
if (effectiveBrain === 'gemini') {
  if (!apiKey) {
    console.error('[brain] COOPS_BRAIN=gemini set but GEMINI_API_KEY is missing')
    process.exit(1)
  }
  console.log(`[brain] gemini (${geminiModel})`)
  brain = createGeminiBrain({ apiKey, model: geminiModel, guardrail, memory, workspaceTools })
} else {
  const reason = cfg.brainMode === 'mock' ? 'forced by COOPS_BRAIN' : 'no GEMINI_API_KEY'
  console.log(`[brain] mock fixture (${reason})`)
  brain = createMockBrain({ memory })
}

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
const runtimeInfo: RuntimeInfo = {
  execution: 'live',
  brain: effectiveBrain,
  model: effectiveBrain === 'gemini' ? geminiModel : null,
  memory: cfg.firestore ? 'firestore' : 'jsonl',
  guardrail: cfg.modelArmor ? 'model-armor' : 'heuristic',
  workspace: google.enabled ? 'google-workspace' : 'dry-run',
  a2a: !cfg.enableA2a ? 'disabled' : cfg.a2aToken ? 'authenticated' : 'open',
  revision: process.env.K_REVISION ?? 'local',
  runId: newId('run'),
  startedAt: new Date().toISOString(),
}
await startHttp(cfg, store, bus, org, google, runtimeInfo)
console.log(`LISTENING ${cfg.port}`)
