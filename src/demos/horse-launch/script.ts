import type { AgentBlueprint } from '../../types'
import { agentRef, ev, personRef, systemRef, Script } from '../../engine/build'
import type { CameraTarget } from '../../store'
import { nextTaskId } from '../../data/scenarios'
import type { EngineApi } from '../../engine/rehearsals'
import {
  HORSE_DISCOVERY_TEMPLATE,
  HORSE_STAGING_TEMPLATE,
  HORSE_YOUTUBE_TEMPLATE,
} from './artifacts'

export const HORSE_AGENT_ID = 'w-horse'

const sim = <T extends { payload?: object }>(e: T): T => ({ ...e, payload: { ...e.payload, simulated: true } }) as T

/**
 * The launch-day scenario: the video is stranded on Alex's laptop.
 *   A) one request → blueprint (waits for Maya's approval)
 *   B) spawn + route to Engineering; connector finds & verifies; staged to
 *      Cloud Storage (pauses for Maya's publication approval)
 *   C) resume → YouTube publish receipt → complete
 */

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

/** Act A: one request from the GTM lead, blueprint proposed on the spot. */
export function horseInterviewAuto(api: EngineApi, personId: string) {
  const s = new Script()
  const op = 'op-marketing'
  s.then(600, sim(ev({
    type: 'Chat',
    from: personRef(personId),
    to: agentRef(op),
    title: "Find Alex's latest horse dating app walkthrough and get it onto our YouTube channel before launch.",
    payload: { text: "Find Alex's latest horse dating app walkthrough and get it onto our YouTube channel before launch." },
  })))
  s.then(2400, sim(ev({
    type: 'Chat',
    from: agentRef(op),
    to: personRef(personId),
    title: "On it. The video lives in Engineering's world, so I'll route a scoped request there and bring you the approval when it's time to publish.",
    payload: { text: "On it. The video lives in Engineering's world, so I'll route a scoped request there and bring you the approval when it's time to publish." },
  })))
  const bp = sim(ev({
    type: 'BlueprintProposed',
    from: agentRef(op),
    to: personRef(personId),
    deptFrom: 'marketing',
    title: 'Blueprint ready: Horse Launch Agent',
    detail: 'Inherits the company baseline and Marketing defaults; publication needs your approval.',
    payload: { blueprint: HORSE_BLUEPRINT },
  }))
  s.then(1600, bp)
  api.schedule(s.steps)
  api.onResolve(bp.id, () => horseActB(api, personId, bp.id))
  api.autoResolve(bp.id, s.length + 14_000, personId)
  return bp.id
}

/** Act B: spawn, route to Engineering, discover + verify, stage, block on approval. */
export function horseActB(api: EngineApi, personId: string, blueprintEventId: string) {
  const taskId = nextTaskId()
  const w = HORSE_AGENT_ID

  const s = new Script()
  s.then(1200, sim(ev({
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
  s.then(1800, sim(ev({
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
      objective: 'Identify horse-walkthrough-v3.mp4 on the allow-listed export and return its manifest.',
      expected: 'Discovery manifest with checksum', deadline: 'today', sharedContext: 'filename convention v3', visibility: 'request + artifact',
    },
  }))
  cameraCue(api, s.length - 200, { type: 'frame', deptIds: ['marketing', 'engineering'] })
  s.then(2200, envelope)

  // engineering accepts and delegates to its connector worker
  s.then(2400, sim(ev({
    type: 'TaskAccepted', taskId,
    from: agentRef('op-engineering'), to: agentRef(w), deptFrom: 'engineering', deptTo: 'engineering',
    title: 'Scoped discovery accepted',
    detail: 'Queued for the Developer Machine Connector.',
  })))
  s.then(1400, sim(ev({
    type: 'DelegatedTo', taskId,
    from: agentRef('op-engineering'), to: agentRef('w-connector'), deptFrom: 'engineering', deptTo: 'engineering',
    title: 'Delegated to Developer Machine Connector',
    detail: 'Connector holds an allow-listed read capability; nothing broader.',
  })))

  // discovery with receipts
  s.then(2600, sim(ev({
    type: 'ToolCall', taskId,
    from: agentRef('w-connector'), deptFrom: 'engineering', deptTo: 'engineering',
    title: 'Local connector: scanned allow-listed export',
    detail: 'Root D:\\exports\\horsewalk\\ · found horse-walkthrough-v3.mp4 · 259,291,136 bytes · modified 2026-08-23T14:02Z · sha256 verified locally.',
    payload: { tool: 'Developer Laptop', action: 'dir.scan', latencyMs: 1840 },
  })))
  s.then(2200, sim(ev({
    type: 'ArtifactDelivered', taskId, edge: 'artifact', travelMs: 2600,
    from: agentRef('op-engineering'), to: agentRef(w), deptFrom: 'engineering', deptTo: 'marketing',
    title: 'Delivered: Discovery manifest',
    detail: 'One candidate matched the v3 convention; checksum recorded for the chain.',
    payload: { artifact: { name: 'horse-walkthrough-v3 discovery manifest', type: 'Report', template: HORSE_DISCOVERY_TEMPLATE } },
  })))

  // staging through cloud storage
  s.then(2800, sim(ev({
    type: 'ToolCall', taskId,
    from: agentRef(w), deptFrom: 'marketing', deptTo: 'marketing',
    title: 'Cloud Storage: staged verified object',
    detail: 'coops-horse-staging/launches/horse-walkthrough-v3.mp4 · generation 1724428800123456 · integrity re-verified after upload.',
    payload: { tool: 'Cloud Storage', action: 'objects.insert', latencyMs: 2410 },
  })))
  s.then(2000, sim(ev({
    type: 'ArtifactDelivered', taskId, edge: 'artifact', travelMs: 2400,
    from: agentRef(w), to: personRef(personId), deptFrom: 'marketing', deptTo: 'marketing',
    title: 'Delivered: Cloud staging receipt',
    detail: 'Same checksum as discovery — the bytes that left the laptop are the bytes in the bucket.',
    payload: { artifact: { name: 'horse-walkthrough-v3 staging receipt', type: 'Receipt', template: HORSE_STAGING_TEMPLATE } },
  })))

  // publication pauses for the named approver
  const auth = sim(ev({
    type: 'AuthRequired', taskId, edge: 'permission', travelMs: 2400,
    from: agentRef(w), to: personRef('maya'),
    deptFrom: 'marketing', deptTo: 'marketing',
    title: 'Approve YouTube publication',
    detail: 'Staged object is verified and private-ready. Maya Chen owns the launch channel decision.',
    blockedOn: { what: 'Approve YouTube publication', personId: 'maya', kind: 'approval' },
  }))
  s.then(2400, auth)
  cameraCue(api, s.length + 500, { type: 'dept', deptId: 'marketing' })

  api.schedule(s.steps)
  api.onResolve(auth.id, () => horseActC(api, personId, taskId))
  api.autoResolve(auth.id, s.length + 26_000, 'maya')
  api.toast('Launch prep is running', 'Watch Marketing route to Engineering and stage the verified file.')
  return taskId
}

/** Act C: checkpoint resume — publish to YouTube, complete with the trace. */
export function horseActC(api: EngineApi, personId: string, taskId: string) {
  const w = HORSE_AGENT_ID
  const s = new Script()
  cameraCue(api, 400, { type: 'frame', deptIds: ['marketing'] })
  s.then(1500, sim(ev({
    type: 'ToolCall', taskId,
    from: agentRef(w), deptFrom: 'marketing', deptTo: 'marketing',
    title: 'YouTube: videos.insert published',
    detail: 'Uploaded privately to the launch channel · processing processed · video id hR73xW9pQmA · checksum matches staging receipt.',
    payload: { tool: 'YouTube', action: 'videos.insert', latencyMs: 3120 },
  })))
  s.then(2400, sim(ev({
    type: 'ArtifactDelivered', taskId, edge: 'artifact', travelMs: 2400,
    from: agentRef(w), to: personRef(personId), deptFrom: 'marketing', deptTo: 'marketing',
    title: 'Delivered: Publication receipt',
    detail: 'Private by API policy until audit — ready for release. Full provenance chain attached.',
    payload: { artifact: { name: 'horse-walkthrough-v3 publication receipt', type: 'Receipt', template: HORSE_YOUTUBE_TEMPLATE } },
  })))
  s.then(2000, sim(ev({
    type: 'TaskCompleted', taskId,
    from: agentRef(w), deptFrom: 'marketing', deptTo: 'marketing',
    title: 'Launch video is live (private-ready)',
    detail: 'Discovered on Engineering · staged verified · approved by Maya · published to YouTube.',
  })))
  cameraCue(api, s.length + 900, { type: 'fit' })
  s.then(1100, sim(ev({
    type: 'Chat',
    from: agentRef('op-marketing'),
    to: personRef(personId),
    title: "Done — the walkthrough is on our channel, private until you flip it public. Every hop has a receipt: laptop, bucket, approval, video id.",
    payload: { text: "Done — the walkthrough is on our channel, private until you flip it public. Every hop has a receipt: laptop, bucket, approval, video id." },
  })))
  api.schedule(s.steps)
  api.toast('Checkpoint resumed', 'Publication approved. The Horse Launch Agent is finishing the YouTube delivery.')
}