import { loadConfig } from './config.js'
import { EventStore } from './store.js'
import { Bus } from './bus.js'
import { startHttp } from './http.js'
import { Scheduler } from './runtime/scheduler.js'
import { createMockBrain } from './brain/mock.js'
import { createGeminiBrain } from './brain/gemini.js'
import { createHeuristicGuardrail } from './guardrail/heuristic.js'
import { openJsonlMemory } from './memory/jsonl.js'
import type { BrainCtx } from './brain/types.js'
import type { WorldEvent } from '../../src/types.js'

const cfg = loadConfig()
const bus = new Bus<WorldEvent>()

const DEPT_OF_AGENT: Record<string, string> = {
  'op-marketing': 'marketing',
  'op-finance': 'finance',
  'op-legal': 'legal',
  'op-support': 'support',
  'op-operations': 'operations',
  'op-hr': 'hr',
  'w-copy': 'marketing',
  'w-social': 'marketing',
  'w-invoice': 'finance',
  'w-budget': 'finance',
  'w-contract': 'legal',
  'w-policy': 'legal',
  'w-faq': 'support',
  'w-triage': 'support',
  'w-inventory': 'operations',
  'w-vendor': 'operations',
  'w-onboard': 'hr',
  'w-launch': 'marketing',
}

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
  worldTasks: () => worldTasks(store.all()),
  interviewStep: agentId => interviews.get(agentId) ?? null,
  setInterviewStep: (agentId, step) => {
    interviews.set(agentId, step)
  },
}

const RESOLUTION_TYPES = new Set(['AccountConnected', 'ApprovalGranted', 'BlueprintApproved'])

function spawnFromBlueprintResolution(e: WorldEvent): void {
  if (!RESOLUTION_TYPES.has(e.type)) return
  const reasonId = e.payload?.reason
  if (!reasonId) return
  const orig = store.get(reasonId)
  if (orig?.type !== 'BlueprintProposed') return
  const bp = orig.payload?.blueprint
  if (!bp) return
  void store.append({
    type: 'AgentSpawned',
    from: orig.from,
    deptFrom: bp.deptId,
    deptTo: bp.deptId,
    title: `${bp.name} is live`,
    detail: 'Worker profile created in the shared runtime.',
    payload: {
      agent: {
        id: 'w-launch',
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

function onAppended(e: WorldEvent): void {
  bus.publish(e)
  spawnFromBlueprintResolution(e)
  if (e.type === 'Chat' && e.from?.kind === 'person' && e.to?.kind === 'agent') {
    const text = typeof e.payload?.text === 'string' ? e.payload.text : ''
    if (text) brain.handle(brainCtx, e.to.id, DEPT_OF_AGENT[e.to.id] ?? '', text, e.from.id)
  }
}

const store = await EventStore.open(cfg.dataDir, onAppended)
await startHttp(cfg, store, bus)
console.log(`LISTENING ${cfg.port}`)
