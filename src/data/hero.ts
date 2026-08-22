import type { AgentBlueprint, AgentDef, WorldEvent } from '../types'
import { agentRef, ev, personRef, systemRef, Script, type Step } from '../engine/build'
import type { CameraTarget } from '../store'
import { LAUNCH_AGENT_ID } from './company'
import { nextTaskId } from './scenarios'

/**
 * The hero scenario: Everpeak launches the Summit Series.
 * Runs in three acts, paused twice for a human:
 *   A) interview → blueprint (waits for blueprint approval)
 *   B) spawn + fan-out to Finance/Legal/Support; Finance hits QuickBooks auth (waits for Dana)
 *   C) resume from checkpoint → budget artifact → Drive/Sheets side effects → done
 */

export interface EngineApi {
  emit(e: Omit<WorldEvent, 'ts'> | Omit<WorldEvent, 'ts'>[]): void
  schedule(steps: Step[], baseDelayMs?: number): void
  /** run fn when the approval created by `eventId` is granted */
  onResolve(eventId: string, fn: () => void): void
  /** simulated human resolves it if the judge doesn't act in time */
  autoResolve(eventId: string, delayMs: number, personId: string): void
  toast(title: string, detail?: string): void
  /** choreographed camera move (gentle glide; the map skips it if the user just moved the camera) */
  requestCamera?(target: CameraTarget): void
}

/** Schedule a choreographed camera move `atMs` after now, aligned with the script clock. */
const cameraCue = (api: EngineApi, atMs: number, target: CameraTarget) => {
  if (!api.requestCamera) return
  window.setTimeout(() => api.requestCamera?.(target), Math.max(0, atMs))
}

export const LAUNCH_BLUEPRINT: AgentBlueprint = {
  name: 'Summit Launch Agent',
  deptId: 'marketing',
  purpose: 'Own the Summit Series launch end to end: brief to live.',
  trigger: 'Launch brief dropped in the Marketing Drive',
  skills: ['Launch planning', 'Cross-department coordination', 'Status reporting'],
  toolIds: ['gdrive', 'gsheets'],
  collaborators: ['Finance Agent', 'Legal Agent', 'Support Agent'],
  approvals: ['Maya Chen approves artifacts before external use'],
  limits: ['$25/day model budget', 'No external sends without sign-off', 'Marketing memory scope only'],
  ownerId: 'maya',
}

export const LAUNCH_AGENT_DEF: AgentDef = {
  id: LAUNCH_AGENT_ID,
  name: 'Summit Launch Agent',
  deptId: 'marketing',
  kind: 'worker',
  purpose: LAUNCH_BLUEPRINT.purpose,
  skills: LAUNCH_BLUEPRINT.skills,
  toolIds: LAUNCH_BLUEPRINT.toolIds,
  ownerId: 'maya',
}

export const INTERVIEW_QUESTIONS = [
  'Happy to set that up. First — what outcome should this agent own? Describe it as a finish line, not a to-do list.',
  'Got it. What should trigger it — a schedule, an event in one of our systems, or someone asking?',
  'Which systems will it touch, and which departments will it need to pull in?',
  'Last one: who approves its work, and what hard limits should I write into it?',
]

export const AUTO_ANSWERS = [
  'Run the Summit Series launch end to end — from the brief to live on site.',
  'It kicks off when I drop the launch brief in our Drive.',
  'Drive and Sheets here in Marketing. It will need Finance for the budget, Legal for claims, and Support for FAQs.',
  'I approve its artifacts. Cap model spend at $25 a day, and nothing goes external without my sign-off.',
]

const chat = (agentId: string, from: 'agent' | 'person', personId: string, text: string) =>
  ev({
    type: 'Chat',
    from: from === 'agent' ? agentRef(agentId) : personRef(personId),
    to: from === 'agent' ? personRef(personId) : agentRef(agentId),
    title: text,
    payload: { text },
  })

/** Act A, automatic version: Maya and the Marketing Agent run the interview on stage. */
export function heroInterviewAuto(api: EngineApi, personId: string) {
  const s = new Script()
  const op = 'op-marketing'
  s.then(600, chat(op, 'person', personId, 'I need a dedicated agent to run the Summit Series launch.'))
  for (let i = 0; i < INTERVIEW_QUESTIONS.length; i++) {
    s.then(2100, chat(op, 'agent', personId, INTERVIEW_QUESTIONS[i]))
    s.then(2600, chat(op, 'person', personId, AUTO_ANSWERS[i]))
  }
  s.then(2000, chat(op, 'agent', personId, 'That’s everything I need. Here’s the blueprint — review the inherited config and approve when ready.'))
  const bp = blueprintEvent(personId)
  s.then(900, bp)
  api.schedule(s.steps)
  api.onResolve(bp.id, () => heroActB(api, personId))
  api.autoResolve(bp.id, s.length + 14_000, personId)
  return bp.id
}

/** Act A, interactive version: called by the mock brain as the judge answers. */
export function blueprintEvent(personId: string) {
  return ev({
    type: 'BlueprintProposed',
    from: agentRef('op-marketing'),
    to: personRef(personId),
    deptFrom: 'marketing',
    title: 'Blueprint ready: Summit Launch Agent',
    detail: 'Inherits the company baseline and Marketing defaults; two local overrides.',
    payload: { blueprint: LAUNCH_BLUEPRINT },
  })
}

/** Act B: spawn, brief, fan out. Finance blocks on QuickBooks. */
export function heroActB(api: EngineApi, personId: string) {
  const taskId = nextTaskId()
  const s = new Script()
  const w = LAUNCH_AGENT_ID

  s.then(1200, ev({
    type: 'AgentSpawned',
    from: agentRef('op-marketing'), deptFrom: 'marketing', deptTo: 'marketing',
    title: 'Summit Launch Agent is live',
    detail: 'Worker profile created in the shared runtime under Marketing.',
    payload: { agent: LAUNCH_AGENT_DEF },
  }))
  s.then(1400, chat('op-marketing', 'agent', personId, 'Summit Launch Agent is live under Marketing. Drop the brief whenever you’re ready — I’ll route it.'))
  s.then(2600, chat('op-marketing', 'person', personId, 'Brief is in the Drive folder. Go.'))
  s.then(1200, ev({
    type: 'TaskRequest', taskId,
    from: personRef(personId), to: agentRef(w),
    deptFrom: 'marketing', deptTo: 'marketing',
    title: 'Summit Series launch prep',
    detail: 'Budget confirmed, claims cleared, FAQs drafted, workspace ready.',
    payload: {
      objective: 'Prepare the Summit Series launch: confirm budget with Finance, clear claims with Legal, prep FAQs with Support, set up the launch workspace.',
      deadline: 'Friday 17:00', expected: 'Launch readiness summary', visibility: 'company',
    },
  }))
  s.then(1800, ev({
    type: 'StatusUpdate', taskId,
    from: agentRef(w), to: personRef(personId), deptFrom: 'marketing', deptTo: 'marketing',
    title: 'Brief parsed — three workstreams',
    detail: 'Finance budget confirmation, Legal claims check, Support FAQ prep. Running them in parallel.',
    payload: { costUsd: 0.03 },
  }))

  // fan out — pull the camera back so all four districts are on stage
  s.then(1600, ev({
    type: 'TaskRequest', taskId, edge: 'task', travelMs: 2600,
    from: agentRef(w), to: agentRef('op-finance'),
    deptFrom: 'marketing', deptTo: 'finance',
    title: 'Confirm Summit Series launch budget',
    detail: 'Need the approved Q3 launch budget line confirmed against actuals.',
    payload: { objective: 'Confirm $85k launch budget against Q3 actuals', expected: 'Budget confirmation', deadline: 'EOD', sharedContext: 'launch brief §2 only' },
  }))
  cameraCue(api, s.length - 300, { type: 'frame', deptIds: ['marketing', 'finance', 'legal', 'support'] })
  s.then(1100, ev({
    type: 'TaskRequest', taskId, edge: 'task', travelMs: 2600,
    from: agentRef(w), to: agentRef('op-legal'),
    deptFrom: 'marketing', deptTo: 'legal',
    title: 'Claims check — Summit Series copy',
    detail: '“Warmest jacket we’ve ever made” and 3 other claims need review.',
    payload: { objective: 'Review 4 marketing claims for compliance', expected: 'Claims review memo', deadline: 'EOD', sharedContext: 'claims list only' },
  }))
  s.then(1100, ev({
    type: 'TaskRequest', taskId, edge: 'task', travelMs: 2600,
    from: agentRef(w), to: agentRef('op-support'),
    deptFrom: 'marketing', deptTo: 'support',
    title: 'FAQ prep — Summit Series',
    detail: 'Draft launch-day FAQs: sizing, warmth ratings, care, availability.',
    payload: { objective: 'Draft 12 launch FAQs', expected: 'FAQ draft', deadline: 'EOD', sharedContext: 'product spec sheet' },
  }))

  // Finance: accept → delegate → tool → BLOCKED on Dana
  s.then(2400, ev({
    type: 'TaskAccepted', taskId,
    from: agentRef('op-finance'), to: agentRef(w), deptFrom: 'finance', deptTo: 'marketing',
    title: 'Budget confirmation — accepted',
  }))
  s.then(1300, ev({
    type: 'DelegatedTo', taskId,
    from: agentRef('op-finance'), to: agentRef('w-budget'), deptFrom: 'finance', deptTo: 'finance',
    title: 'Delegated to Budget Model Agent',
  }))
  const auth = ev({
    type: 'AuthRequired', taskId, edge: 'permission', travelMs: 2400,
    from: agentRef('w-budget'), to: personRef('dana'),
    deptFrom: 'finance', deptTo: 'finance',
    title: 'QuickBooks connection required',
    detail: 'Budget Model Agent needs a scoped QuickBooks capability to read Q3 actuals. Dana Whitfield owns this account.',
    blockedOn: { what: 'Connect QuickBooks', personId: 'dana', kind: 'auth' },
  })
  s.then(2200, auth)
  // once the block lands, a slow push toward Finance — the map looks at what's stuck
  cameraCue(api, s.length + 600, { type: 'dept', deptId: 'finance' })

  // Legal: accept → guardrail block → deliver
  s.then(1400, ev({
    type: 'TaskAccepted', taskId,
    from: agentRef('op-legal'), to: agentRef(w), deptFrom: 'legal', deptTo: 'marketing',
    title: 'Claims check — accepted',
  }))
  s.then(1500, ev({
    type: 'DelegatedTo', taskId,
    from: agentRef('op-legal'), to: agentRef('w-contract'), deptFrom: 'legal', deptTo: 'legal',
    title: 'Delegated to Contract Review Agent',
  }))
  s.then(2800, ev({
    type: 'GuardrailBlock', taskId,
    from: systemRef('gateway'), deptFrom: 'marketing', deptTo: 'legal',
    title: 'Model Armor blocked embedded instructions',
    detail: 'A competitor-comparison PDF attached to the claims doc contained hidden prompt-injection text. Stripped at the Agent Gateway; clean copy forwarded.',
  }))
  s.then(3400, ev({
    type: 'ArtifactDelivered', taskId, edge: 'artifact', travelMs: 2600,
    from: agentRef('op-legal'), to: agentRef(w), deptFrom: 'legal', deptTo: 'marketing',
    title: 'Delivered: Claims review memo',
    detail: '3 claims cleared; “warmest ever” needs a qualifier. Suggested wording included.',
    payload: { artifact: { name: 'Claims review memo — Summit Series', type: 'Memo' }, costUsd: 0.11 },
  }))

  // Support: accept → deliver
  s.then(1800, ev({
    type: 'TaskAccepted', taskId,
    from: agentRef('op-support'), to: agentRef(w), deptFrom: 'support', deptTo: 'marketing',
    title: 'FAQ prep — accepted',
  }))
  s.then(2000, ev({
    type: 'DelegatedTo', taskId,
    from: agentRef('op-support'), to: agentRef('w-faq'), deptFrom: 'support', deptTo: 'support',
    title: 'Delegated to FAQ Agent',
  }))
  s.then(4200, ev({
    type: 'ArtifactDelivered', taskId, edge: 'artifact', travelMs: 2600,
    from: agentRef('op-support'), to: agentRef(w), deptFrom: 'support', deptTo: 'marketing',
    title: 'Delivered: Summit Series FAQ draft',
    detail: '12 FAQs drafted from the spec sheet; flagged 2 open questions on care instructions.',
    payload: { artifact: { name: 'Summit Series FAQ draft', type: 'Article' }, costUsd: 0.07 },
  }))

  api.schedule(s.steps)
  api.onResolve(auth.id, () => heroActC(api, personId, taskId))
  // Dana notices ~the right beat after the block lands, then connects the account
  api.autoResolve(auth.id, s.length + 26_000, 'dana')
  api.toast('Launch prep is running', 'Watch Marketing fan out to Finance, Legal and Support.')
  return taskId
}

/** Act C: the checkpoint resume — budget lands, side effects fire, task completes. */
export function heroActC(api: EngineApi, personId: string, taskId: string) {
  const w = LAUNCH_AGENT_ID
  const s = new Script()
  // resuming from the checkpoint: frame the two districts still in play
  cameraCue(api, 500, { type: 'frame', deptIds: ['finance', 'marketing'] })
  s.then(1400, ev({
    type: 'ToolCall', taskId,
    from: agentRef('w-budget'), deptFrom: 'finance', deptTo: 'finance',
    title: 'QuickBooks: pulled Q3 launch actuals',
    detail: 'Scoped capability grant — read-only, launch cost centers only.',
    payload: { tool: 'QuickBooks', action: 'report.read', costUsd: 0.05, latencyMs: 1240 },
  }))
  s.then(2600, ev({
    type: 'ArtifactDelivered', taskId, edge: 'artifact', travelMs: 2600,
    from: agentRef('op-finance'), to: agentRef(w), deptFrom: 'finance', deptTo: 'marketing',
    title: 'Delivered: Budget confirmation',
    detail: '$85k confirmed against Q3 actuals; $6.2k contingency remains.',
    payload: { artifact: { name: 'Q3 launch budget confirmation', type: 'Report' }, costUsd: 0.09 },
  }))
  s.then(2400, ev({
    type: 'ToolCall', taskId,
    from: agentRef(w), deptFrom: 'marketing', deptTo: 'marketing',
    title: 'Drive: created “Summit Series Launch”',
    detail: 'Folder with budget, claims memo, and FAQ draft — shared with the launch group.',
    payload: { tool: 'Google Drive', action: 'folder.create', costUsd: 0.01, latencyMs: 640 },
  }))
  s.then(1900, ev({
    type: 'ToolCall', taskId,
    from: agentRef(w), deptFrom: 'marketing', deptTo: 'marketing',
    title: 'Sheets: updated launch budget tracker',
    detail: 'Confirmed lines written to “Summit — budget tracker”, tab Q3.',
    payload: { tool: 'Google Sheets', action: 'values.update', costUsd: 0.01, latencyMs: 810 },
  }))
  s.then(2100, ev({
    type: 'StatusUpdate', taskId,
    from: agentRef(w), to: personRef(personId), deptFrom: 'marketing', deptTo: 'marketing',
    title: 'Internal summary sent',
    detail: 'Readiness summary posted to the launch group with links to all three artifacts.',
    payload: { costUsd: 0.02 },
  }))
  s.then(1600, ev({
    type: 'TaskCompleted', taskId,
    from: agentRef(w), deptFrom: 'marketing', deptTo: 'marketing',
    title: 'Summit Series launch prep — complete',
    detail: 'Budget confirmed · claims cleared · FAQs drafted · workspace ready.',
  }))
  // curtain call: ease back out to the whole company
  cameraCue(api, s.length + 1100, { type: 'fit' })
  s.then(1000, chat('op-marketing', 'agent', personId,
    'Launch prep is done. Budget confirmed by Finance, claims cleared by Legal (one wording fix), FAQs drafted by Support. Everything’s in the Summit Series Launch folder — replay the task to see the whole path.'))
  api.schedule(s.steps)
  api.toast('Checkpoint resumed', 'Dana connected QuickBooks — Finance is finishing the budget confirmation.')
}
