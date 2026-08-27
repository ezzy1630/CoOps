import type { AgentBlueprint } from '../../types'
import { agentRef, ev, personRef, Script } from '../../engine/build'
import type { CameraTarget } from '../../store'
import { nextTaskId } from '../../data/scenarios'
import type { EngineApi } from '../../engine/rehearsals'
import {
  HORSE_AUTHORITY_RECEIPT,
  HORSE_DISCOVERY_RECEIPT,
  HORSE_DISCOVERY_TEMPLATE,
  HORSE_STAGING_RECEIPT,
  HORSE_STAGING_TEMPLATE,
  HORSE_YOUTUBE_RECEIPT,
  HORSE_YOUTUBE_TEMPLATE,
  VIDEO_FILENAME,
  VIDEO_ID,
  VIDEO_SHA,
  VIDEO_SIZE,
} from './artifacts'

export const HORSE_AGENT_ID = 'w-horse'

const sim = <T extends { payload?: object }>(e: T): T =>
  ({ ...e, payload: { ...e.payload, simulated: true, rehearsalId: 'horse-launch' } }) as T

const cameraCue = (api: EngineApi, atMs: number, target: CameraTarget) => {
  if (!api.requestCamera) return
  window.setTimeout(() => api.requestCamera?.(target), Math.max(0, atMs))
}

export const HORSE_BLUEPRINT: AgentBlueprint = {
  name: 'Horse Launch Agent',
  deptId: 'marketing',
  purpose: "Own the launch-video path end to end: Alex's laptop to the company YouTube channel.",
  trigger: 'A launch request from the GTM Lead',
  skills: ['Media handoff', 'Provenance tracking', 'Escalation routing'],
  toolIds: ['gdrive', 'youtube'],
  collaborators: ['Engineering Agent'],
  approvals: ['Maya Chen approves publication before upload'],
  limits: ['Read-only outside Marketing', 'No external send without sign-off', 'Marketing memory scope only'],
  ownerId: 'maya',
}

export const HORSE_INTERVIEW_QUESTIONS = [
  'Happy to set that up. First, what outcome should this agent own? Describe it as a finish line, not a to-do list.',
  'Got it. What should trigger it: a schedule, an event in one of our systems, or someone asking?',
  'Which systems will it touch, and which departments will it need to pull in?',
  'Last one: who approves its work, and what hard limits should I write into it?',
]

export const HORSE_AUTO_ANSWERS = [
  "Find Alex's latest horse dating app walkthrough and get it onto our YouTube channel before launch.",
  'Triggered whenever the GTM Lead requests launch video distribution.',
  'Developer Laptop connector on Engineering for discovery, Cloud Storage for staging, YouTube in Marketing for publishing.',
  'Maya Chen approves publication before upload. Scoped read-only outside Marketing, no unapproved external sends.',
]

const chat = (agentId: string, from: 'agent' | 'person', personId: string, text: string) =>
  sim(ev({
    type: 'Chat',
    from: from === 'agent' ? agentRef(agentId) : personRef(personId),
    to: from === 'agent' ? personRef(personId) : agentRef(agentId),
    title: text,
    payload: { text },
  }))

export function blueprintEvent(personId: string) {
  return sim(ev({
    type: 'BlueprintProposed',
    from: agentRef('op-marketing'),
    to: personRef(personId),
    deptFrom: 'marketing',
    title: 'Blueprint ready: Horse Launch Agent',
    detail: 'Inherits the company baseline and Marketing defaults; publication needs your approval.',
    payload: { blueprint: HORSE_BLUEPRINT },
  }))
}

/** Act A: the automated route starts from a complete brief; chat can still run the interview. */
export function horseInterviewAuto(api: EngineApi, personId: string) {
  const s = new Script()
  const op = 'op-marketing'
  s.then(600, chat(op, 'person', personId, "Find Alex's latest horse dating app walkthrough and get it onto our YouTube channel before launch."))
  s.then(1000, chat(
    op,
    'agent',
    personId,
    "Marketing cannot access Alex's laptop, and Engineering cannot access the YouTube channel. I prepared a scoped launch agent to coordinate that handoff.",
  ))
  const bp = blueprintEvent(personId)
  s.then(800, bp)
  api.schedule(s.steps)
  api.onResolve(bp.id, () => horseActB(api, personId, bp.id))
  api.autoResolve(bp.id, s.length + 2500, personId)
  return bp.id
}

/** Act B: spawn, route to Engineering, discover + verify, stage, block on approval. */
export function horseActB(api: EngineApi, personId: string, blueprintEventId: string) {
  const taskId = nextTaskId()
  const w = HORSE_AGENT_ID
  const s = new Script()

  s.then(1000, sim(ev({
    type: 'AgentSpawned',
    from: agentRef('op-marketing'), deptFrom: 'marketing', deptTo: 'marketing',
    title: 'Horse Launch Agent is live',
    detail: 'Worker profile created in the shared runtime under Marketing.',
    payload: {
      agent: {
        id: w, name: 'Horse Launch Agent', deptId: 'marketing', kind: 'worker',
        purpose: HORSE_BLUEPRINT.purpose, skills: HORSE_BLUEPRINT.skills,
        toolIds: ['gdrive', 'youtube'], ownerId: 'maya',
      },
      reason: blueprintEventId,
    },
  })))

  s.then(1600, sim(ev({
    type: 'TaskRequest', taskId,
    from: personRef(personId), to: agentRef(w),
    deptFrom: 'marketing', deptTo: 'marketing',
    title: 'Launch video: laptop to YouTube',
    detail: 'Find the walkthrough on Engineering, verify it, stage it, publish after approval.',
    payload: {
      objective: "Find Alex's walkthrough, verify bytes, stage through Cloud Storage, publish to YouTube before launch.",
      deadline: 'Launch day', expected: 'YouTube video id + full provenance chain', visibility: 'company',
    },
  })))

  // cross the boundary: Marketing asks Engineering
  const envelope = sim(ev({
    type: 'TaskRequest', taskId, edge: 'task', travelMs: 2600,
    from: agentRef(w), to: agentRef('op-engineering'),
    deptFrom: 'marketing', deptTo: 'engineering',
    title: 'Locate launch video on developer export',
    detail: 'Scoped discovery only: allow-listed directory, metadata plus checksum. No other paths.',
    payload: {
      objective: `Identify ${VIDEO_FILENAME} on the allow-listed export and return its manifest.`,
      expected: 'Discovery manifest with checksum', deadline: 'today', sharedContext: 'filename convention v3', visibility: 'request + artifact',
    },
  }))
  cameraCue(api, s.length - 200, { type: 'frame', deptIds: ['marketing', 'engineering'] })
  s.then(2200, envelope)

  // engineering accepts and delegates to its connector worker
  s.then(2200, sim(ev({
    type: 'TaskAccepted', taskId,
    from: agentRef('op-engineering'), to: agentRef(w), deptFrom: 'engineering', deptTo: 'engineering',
    title: 'Scoped discovery accepted',
    detail: 'Queued for the Developer Machine Connector.',
  })))
  s.then(1200, sim(ev({
    type: 'DelegatedTo', taskId,
    from: agentRef('op-engineering'), to: agentRef('w-connector'), deptFrom: 'engineering', deptTo: 'engineering',
    title: 'Delegated to Developer Machine Connector',
    detail: 'Connector holds an allow-listed read capability; nothing broader.',
  })))

  // discovery with receipts
  s.then(2400, sim(ev({
    type: 'ToolCall', taskId,
    from: agentRef('w-connector'), deptFrom: 'engineering', deptTo: 'engineering',
    title: 'Local connector: scanned allow-listed export',
    detail: `Root D:\\exports\\horsewalk\\ · found ${VIDEO_FILENAME} · ${VIDEO_SIZE} · modified 2026-08-23T14:02Z · sha256 verified locally.`,
    payload: {
      tool: 'Developer Laptop', action: 'dir.scan', latencyMs: 1840,
      receipt: HORSE_DISCOVERY_RECEIPT,
      fileTransfer: {
        filename: VIDEO_FILENAME,
        size: '247.3 MB',
        checksum: VIDEO_SHA,
        source: "Alex Rivera's Laptop (D:\\exports\\horsewalk\\)",
        destination: 'Engineering Connector (Scoped Read)',
        status: 'discovered',
      },
    },
  })))
  s.then(2000, sim(ev({
    type: 'ArtifactDelivered', taskId, edge: 'artifact', travelMs: 2400,
    from: agentRef('op-engineering'), to: agentRef(w), deptFrom: 'engineering', deptTo: 'marketing',
    title: 'Delivered: Discovery manifest',
    detail: 'One candidate matched the v3 convention; checksum recorded for the chain.',
    payload: {
      artifact: { name: 'horse-walkthrough-v3 discovery manifest', type: 'Report', template: HORSE_DISCOVERY_TEMPLATE },
      receipt: HORSE_DISCOVERY_RECEIPT,
      fileTransfer: {
        filename: VIDEO_FILENAME,
        size: '247.3 MB',
        checksum: VIDEO_SHA,
        source: 'Engineering Connector',
        destination: 'Marketing Agent',
        status: 'transferred',
      },
    },
  })))

  // staging through cloud storage
  s.then(2600, sim(ev({
    type: 'ToolCall', taskId,
    from: agentRef(w), deptFrom: 'marketing', deptTo: 'marketing',
    title: 'Cloud Storage: staged verified object',
    detail: 'coops-horse-staging/launches/horse-walkthrough-v3.mp4 · generation 1724428800123456 · integrity re-verified after upload.',
    payload: {
      tool: 'Cloud Storage', action: 'objects.insert', latencyMs: 2410,
      receipt: HORSE_STAGING_RECEIPT,
      cloudStatus: {
        provider: 'gcs',
        serviceName: 'Google Cloud Storage',
        resourceId: 'coops-horse-staging/launches/horse-walkthrough-v3.mp4',
        status: 'verified',
        details: 'Generation 1724428800123456 · Integrity matches local checksum',
      },
    },
  })))
  s.then(1800, sim(ev({
    type: 'ArtifactDelivered', taskId, edge: 'artifact', travelMs: 2200,
    from: agentRef(w), to: personRef(personId), deptFrom: 'marketing', deptTo: 'marketing',
    title: 'Delivered: Cloud staging receipt',
    detail: 'Same checksum as discovery — the bytes that left the laptop are the bytes in the bucket.',
    payload: {
      artifact: { name: 'horse-walkthrough-v3 staging receipt', type: 'Receipt', template: HORSE_STAGING_TEMPLATE },
      receipt: HORSE_STAGING_RECEIPT,
      cloudStatus: {
        provider: 'gcs',
        serviceName: 'Google Cloud Storage',
        resourceId: 'coops-horse-staging/launches/horse-walkthrough-v3.mp4',
        status: 'verified',
      },
    },
  })))

  // publication pauses for the named approver
  const auth = sim(ev({
    type: 'AuthRequired', taskId, edge: 'permission', travelMs: 2400,
    from: agentRef(w), to: personRef('maya'),
    deptFrom: 'marketing', deptTo: 'marketing',
    title: 'Approve YouTube publication',
    detail: 'Staged object is verified and private-ready. Maya Chen owns the launch channel decision.',
    blockedOn: { what: 'Approve YouTube publication', personId: 'maya', kind: 'approval' },
    payload: {
      receipt: HORSE_AUTHORITY_RECEIPT,
      cloudStatus: {
        provider: 'youtube',
        serviceName: 'YouTube Data API v3',
        status: 'ready',
        details: 'Awaiting Maya Chen approval for private upload to launch channel',
      },
    },
  }))
  s.then(2200, auth)
  cameraCue(api, s.length + 400, { type: 'dept', deptId: 'marketing' })

  api.schedule(s.steps)
  api.onResolve(auth.id, () => horseActC(api, personId, taskId))
  api.autoResolve(auth.id, s.length + 26_000, 'maya')
  api.toast('Launch prep is running', 'Watch Marketing route to Engineering and stage the verified file.')
  return taskId
}

/** Act C: checkpoint resume, record the simulated YouTube result, and complete the trace. */
export function horseActC(api: EngineApi, personId: string, taskId: string) {
  const w = HORSE_AGENT_ID
  const s = new Script()
  cameraCue(api, 400, { type: 'frame', deptIds: ['marketing'] })
  s.then(1400, sim(ev({
    type: 'ToolCall', taskId,
    from: agentRef(w), deptFrom: 'marketing', deptTo: 'marketing',
    title: 'Rehearsal result: YouTube videos.insert recorded',
    detail: `Simulated private status · fixture video id ${VIDEO_ID} · checksum matches the staging receipt · no external request was sent.`,
    payload: {
      tool: 'YouTube', action: 'videos.insert', latencyMs: 3120,
      receipt: HORSE_YOUTUBE_RECEIPT,
      cloudStatus: {
        provider: 'youtube',
        serviceName: 'YouTube Data API v3',
        resourceId: VIDEO_ID,
        url: `https://youtu.be/${VIDEO_ID}`,
        status: 'private',
        details: 'Rehearsal fixture only · No YouTube request was sent',
      },
    },
  })))
  s.then(2200, sim(ev({
    type: 'ArtifactDelivered', taskId, edge: 'artifact', travelMs: 2200,
    from: agentRef(w), to: personRef(personId), deptFrom: 'marketing', deptTo: 'marketing',
    title: 'Recorded: Rehearsal publication receipt',
    detail: 'Simulated private publication result. Full rehearsal provenance chain attached; no external upload occurred.',
    payload: {
      artifact: { name: 'horse-walkthrough-v3 publication receipt', type: 'Receipt', template: HORSE_YOUTUBE_TEMPLATE },
      receipt: HORSE_YOUTUBE_RECEIPT,
      cloudStatus: {
        provider: 'youtube',
        serviceName: 'YouTube Data API v3',
        resourceId: VIDEO_ID,
        url: `https://youtu.be/${VIDEO_ID}`,
        status: 'ready',
      },
    },
  })))
  s.then(1800, sim(ev({
    type: 'TaskCompleted', taskId,
    from: agentRef(w), deptFrom: 'marketing', deptTo: 'marketing',
    title: 'Rehearsal complete: publication result recorded',
    detail: 'Fixture discovery recorded · staging recorded · Maya approval recorded · simulated YouTube result recorded.',
    payload: { receipt: HORSE_YOUTUBE_RECEIPT },
  })))
  cameraCue(api, s.length + 800, { type: 'fit' })
  s.then(1000, sim(ev({
    type: 'Chat',
    from: agentRef('op-marketing'),
    to: personRef(personId),
    title: 'Rehearsal complete. The fixture recorded discovery, staging, approval, and a simulated private YouTube result. No external upload occurred.',
    payload: {
      text: 'Rehearsal complete. The fixture recorded discovery, staging, approval, and a simulated private YouTube result. No external upload occurred.',
      cloudStatus: {
        provider: 'youtube',
        serviceName: 'YouTube Data API v3',
        resourceId: VIDEO_ID,
        url: `https://youtu.be/${VIDEO_ID}`,
        status: 'private',
        details: 'Rehearsal fixture · No external upload occurred',
      },
    },
  })))
  api.schedule(s.steps)
  api.toast('Checkpoint resumed', 'Approval recorded. The Horse Launch Agent is recording the simulated YouTube result.')
}
