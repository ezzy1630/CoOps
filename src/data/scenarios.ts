// Offline rehearsal dataset — runs only without a backend; every event emitted here is tagged payload.simulated.
import type { WorldEvent } from '../types'
import { agentRef, ev, personRef, systemRef, Script, type Step } from '../engine/build'
import { between, mulberry32, pick, type Rng } from '../engine/rng'

const sim = <T extends { payload?: object }>(e: T): T => ({ ...e, payload: { ...e.payload, simulated: true } }) as T

let taskNum = 990
export const nextTaskId = () => `T-${++taskNum}`

// ─── A generic cross-department exchange ─────────────────────────────────────

export interface ExchangeSpec {
  fromDept: string
  toDept: string
  fromOp: string
  toOp: string
  worker?: string // worker in the receiving dept
  localWorker?: string // worker in the origin dept doing the asking
  title: string
  objective: string
  artifact: { name: string; type: string }
  escalate?: boolean
  permission?: { what: string; personId: string }
  guardrail?: string
  /** Terminal failure: the chain ends in GuardrailBlock + TaskFailed instead of
   * an artifact, so the failure UI stays demonstrable in ambient traffic. */
  fail?: { reason: string; category: string }
}

/** Builds the full event chain for one governed cross-department task. */
export function exchange(spec: ExchangeSpec, pace = 1): { script: Script; taskId: string } {
  const taskId = nextTaskId()
  const s = new Script()
  const p = (ms: number) => ms * pace

  const requester = spec.localWorker ? agentRef(spec.localWorker) : agentRef(spec.fromOp)

  s.then(0, sim(ev({
    type: 'TaskRequest', taskId, edge: 'task', travelMs: 2400,
    from: requester, to: agentRef(spec.toOp),
    deptFrom: spec.fromDept, deptTo: spec.toDept,
    title: spec.title,
    detail: spec.objective,
    payload: {
      objective: spec.objective,
      expected: spec.artifact.name,
      deadline: 'end of day',
      sharedContext: 'scoped brief only',
      visibility: 'request + artifact',
    },
  })))
  s.then(p(2600), sim(ev({
    type: 'TaskAccepted', taskId,
    from: agentRef(spec.toOp), to: requester,
    deptFrom: spec.toDept, deptTo: spec.fromDept,
    title: `${spec.title} — accepted`,
    detail: `Queued in ${spec.toDept}`,
  })))
  if (spec.worker) {
    s.then(p(1800), sim(ev({
      type: 'DelegatedTo', taskId,
      from: agentRef(spec.toOp), to: agentRef(spec.worker),
      deptFrom: spec.toDept, deptTo: spec.toDept,
      title: `Delegated to worker`,
      detail: `${spec.title}`,
    })))
  }
  if (spec.guardrail) {
    s.then(p(2400), sim(ev({
      type: 'GuardrailBlock', taskId,
      from: systemRef('gateway'),
      deptFrom: spec.fromDept, deptTo: spec.toDept,
      title: 'Local regex rules blocked content',
      detail: spec.guardrail,
      payload: { reason: spec.guardrail },
    })))
  }
  if (spec.permission) {
    const permEv = sim(ev({
      type: 'PermissionRequest', taskId, edge: 'permission', travelMs: 2200,
      from: agentRef(spec.worker ?? spec.toOp), to: personRef(spec.permission.personId),
      deptFrom: spec.toDept, deptTo: spec.toDept,
      title: `Approval needed: ${spec.permission.what}`,
      blockedOn: { what: spec.permission.what, personId: spec.permission.personId, kind: 'approval' },
    }))
    s.then(p(2600), permEv)
    s.then(p(6000), sim(ev({
      type: 'ApprovalGranted', taskId,
      from: personRef(spec.permission.personId), to: agentRef(spec.worker ?? spec.toOp),
      deptFrom: spec.toDept, deptTo: spec.toDept,
      title: `${spec.permission.what} — approved`,
      payload: { reason: permEv.id },
    })))
  }
  if (spec.escalate) {
    s.then(p(2800), sim(ev({
      type: 'Escalation', taskId, edge: 'escalation', travelMs: 2600,
      from: agentRef(spec.toOp), to: agentRef(spec.fromOp),
      deptFrom: spec.toDept, deptTo: spec.fromDept,
      title: `Escalated: ${spec.title}`,
      detail: 'Outside my authority — needs your department lead.',
    })))
  }
  s.then(p(3200), sim(ev({
    type: 'StatusUpdate', taskId,
    from: agentRef(spec.worker ?? spec.toOp), to: agentRef(spec.fromOp),
    deptFrom: spec.toDept, deptTo: spec.fromDept,
    title: 'In progress',
    detail: `Working on ${spec.artifact.name.toLowerCase()}`,
    payload: { latencyMs: Math.round(400 + 2200 * ((taskNum * 37) % 100) / 100) },
  })))
  if (spec.fail) {
    s.then(p(2600), sim(ev({
      type: 'GuardrailBlock', taskId,
      from: systemRef('gateway'),
      deptFrom: spec.toDept, deptTo: spec.fromDept,
      title: 'Model Armor blocked content',
      detail: spec.fail.reason,
      payload: { reason: spec.fail.category },
    })))
    s.then(p(2200), sim(ev({
      type: 'TaskFailed', taskId,
      from: systemRef('gateway'),
      deptFrom: spec.toDept, deptTo: spec.fromDept,
      title: `${spec.title} — failed`,
      detail: 'Blocked by policy before delivery; the task is closed as failed.',
      payload: { reason: spec.fail.category },
    })))
    return { script: s, taskId }
  }
  s.then(p(4200), sim(ev({
    type: 'ArtifactDelivered', taskId, edge: 'artifact', travelMs: 2400,
    from: agentRef(spec.toOp), to: requester,
    deptFrom: spec.toDept, deptTo: spec.fromDept,
    title: `Delivered: ${spec.artifact.name}`,
    payload: { artifact: spec.artifact },
  })))
  s.then(p(1600), sim(ev({
    type: 'TaskCompleted', taskId,
    from: requester,
    deptFrom: spec.fromDept, deptTo: spec.fromDept,
    title: `${spec.title} — complete`,
  })))
  return { script: s, taskId }
}

// ─── Template pool (history + ambient share these) ───────────────────────────

const TEMPLATES: ((rng: Rng) => ExchangeSpec)[] = [
  (rng) => {
    const vendor = pick(rng, ['TrailWeave Fabrics', 'Cascade Zippers', 'NorthShore Foam', 'Alpenglow Dyeworks'])
    const inv = 8000 + Math.floor(rng() * 1900)
    return {
      fromDept: 'operations', toDept: 'finance', fromOp: 'op-operations', toOp: 'op-finance',
      worker: 'w-invoice', localWorker: 'w-vendor',
      title: `Confirm vendor payment — ${vendor}`,
      objective: `Verify invoice #${inv} cleared before the shipment releases.`,
      artifact: { name: `Payment confirmation #${inv}`, type: 'Receipt' },
    }
  },
  (rng) => {
    const claim = pick(rng, [
      ['waterproofing post', '“stays dry in any storm”'],
      ['durability reel', '“outlasts anything on the trail”'],
      ['insulation ad', '“warm at −20°”'],
      ['recycled-materials page', '“100% recycled shell”'],
    ])
    return {
      fromDept: 'marketing', toDept: 'legal', fromOp: 'op-marketing', toOp: 'op-legal',
      worker: 'w-contract', localWorker: 'w-social',
      title: `Quick claims check — ${claim[0]}`,
      objective: `Review ${claim[1]} for consumer-claims compliance.`,
      artifact: { name: 'Claims review note', type: 'Memo' },
    }
  },
  (rng) => {
    const product = pick(rng, ['Ridgeline 40L', 'Basecamp 2 tent', 'Scree 28L', 'Cirrus down hoodie'])
    return {
      fromDept: 'support', toDept: 'operations', fromOp: 'op-support', toOp: 'op-operations',
      worker: 'w-inventory', localWorker: 'w-triage',
      title: `Stock check — ${product} backorders`,
      objective: `Customers asking about the restock date for the ${product}.`,
      artifact: { name: 'Restock ETA report', type: 'Report' },
    }
  },
  (rng) => {
    const role = pick(rng, ['pack fitter', 'warehouse lead', 'gear repair tech', 'showroom associate'])
    return {
      fromDept: 'hr', toDept: 'operations', fromOp: 'op-hr', toOp: 'op-operations',
      worker: 'w-vendor', localWorker: 'w-onboard',
      title: `Equipment for new hire — ${role}`,
      objective: `Order the standard kit for the new ${role} starting Monday.`,
      artifact: { name: 'Equipment order confirmation', type: 'Order' },
    }
  },
  (_rng) => ({
    fromDept: 'support', toDept: 'legal', fromOp: 'op-support', toOp: 'op-legal',
    worker: 'w-contract',
    localWorker: 'w-triage',
    title: 'Refund dispute — damaged tent claim',
    objective: 'Customer disputes refund denial on a storm-damaged Basecamp 2 tent.',
    artifact: { name: 'Dispute recommendation', type: 'Memo' },
    escalate: true,
  }),
  (_rng) => ({
    fromDept: 'finance', toDept: 'operations', fromOp: 'op-finance', toOp: 'op-operations',
    worker: 'w-inventory', localWorker: 'w-budget',
    title: 'Q3 inventory valuation inputs',
    objective: 'Need current unit counts by SKU for the quarterly valuation.',
    artifact: { name: 'SKU count export', type: 'Spreadsheet' },
  }),
  (_rng) => ({
    fromDept: 'marketing', toDept: 'support', fromOp: 'op-marketing', toOp: 'op-support',
    worker: 'w-faq', localWorker: 'w-copy',
    title: 'FAQ refresh — sizing guide update',
    objective: 'New sizing chart shipped; refresh the top five fit questions.',
    artifact: { name: 'Updated fit FAQ', type: 'Article' },
    permission: { what: 'Help-center publish', personId: 'nina' },
  }),
  (_rng) => ({
    fromDept: 'operations', toDept: 'support', fromOp: 'op-operations', toOp: 'op-support',
    worker: 'w-faq', localWorker: 'w-inventory',
    title: 'Notify customers — carrier delay',
    objective: 'Pacific storms delayed 60 shipments; draft the proactive notice.',
    artifact: { name: 'Delay notice draft', type: 'Email' },
    fail: {
      reason: 'A prompt-injection attempt in the forwarded carrier email was caught before the notice step.',
      category: 'prompt_injection',
    },
  }),
]

// ─── The one thing already waiting on a human at boot ────────────────────────

/** Task id of the standing scope-renewal request. Never auto-resolves. */
export const SEED_APPROVAL_TASK_ID = 'T-scope-renewal'
/** Event id of the standing request itself (the approvals-queue card). */
export const SEED_APPROVAL_EVENT_ID = 'seed_scope_renewal'

/**
 * Dana's persona promises that blocked work finds her — so her queue is never
 * empty, even before the launch demo runs. One low-stakes, routine item sits
 * there from boot: a read-only capability the Invoice Triage Agent needs
 * renewed. Deliberately *not* QuickBooks and on its own task, so it can't blur
 * the demo's QuickBooks connection beat, and deliberately never auto-resolved,
 * so it is reliably there whenever a judge opens the panel.
 */
export function standingApproval(now: number): WorldEvent[] {
  const taskId = SEED_APPROVAL_TASK_ID
  const seed: WorldEvent[] = [
    {
      id: 'seed_scope_task', ts: now - 66 * 60_000, type: 'TaskRequest', taskId,
      from: agentRef('op-finance'), to: agentRef('w-invoice'),
      deptFrom: 'finance', deptTo: 'finance',
      title: 'Quarterly tool-scope review — Finance',
      detail: 'Re-check every capability the Finance agents hold and renew the ones still in use.',
      payload: {
        objective: 'Renew the read-only capabilities Finance agents still need; let the rest lapse.',
        expected: 'Renewed scopes', deadline: 'this week', visibility: 'finance',
      },
    },
    {
      id: SEED_APPROVAL_EVENT_ID, ts: now - 60 * 60_000, type: 'AuthRequired', taskId,
      edge: 'permission', travelMs: 2400,
      from: agentRef('w-invoice'), to: personRef('dana'),
      deptFrom: 'finance', deptTo: 'finance',
      title: 'Quarterly scope renewal — read-only',
      detail: 'The Invoice Triage Agent’s Bill.com capability lapses Friday. Renewing keeps invoice matching running; the scope stays read-only, and the credential stays in the vault.',
      blockedOn: { what: 'Renew Bill.com read-only scope', personId: 'dana', kind: 'auth' },
    },
  ]
  return seed.map((e) => sim(e))
}

/** What Finance does once the scope is renewed — so approving it resolves into visible work. */
export function standingApprovalFollowUp(): Step[] {
  const taskId = SEED_APPROVAL_TASK_ID
  const s = new Script()
  s.then(1400, sim(ev({
    type: 'ToolCall', taskId,
    from: agentRef('w-invoice'), deptFrom: 'finance', deptTo: 'finance',
    title: 'Bill.com: capability renewed',
    detail: 'Read-only scope re-issued for 90 days — invoice matching resumes.',
    payload: { tool: 'Bill.com', action: 'scope.renew', latencyMs: 420 },
  })))
  s.then(2600, sim(ev({
    type: 'TaskCompleted', taskId,
    from: agentRef('w-invoice'), deptFrom: 'finance', deptTo: 'finance',
    title: 'Quarterly tool-scope review — complete',
    detail: 'One capability renewed; two unused ones left to lapse.',
  })))
  return s.steps
}

// ─── History backfill: two weeks of finished work ────────────────────────────

export function buildHistory(now: number): WorldEvent[] {
  const rng: Rng = mulberry32(20260821)
  const out: WorldEvent[] = []
  const DAY = 86_400_000
  for (let i = 0; i < 26; i++) {
    const spec = pick(rng, TEMPLATES)(rng)
    const dayOffset = Math.floor(between(rng, 0.5, 14))
    const hour = between(rng, 13, 22) // UTC-ish business hours
    const start = now - dayOffset * DAY - hour * 3_600_000
    // long human pauses inside some historical tasks make replay interesting
    const pace = rng() < 0.3 ? between(rng, 40, 900) : between(rng, 2, 12)
    const { script } = exchange(spec, pace)
    for (const step of script.steps) out.push({ ...step.e, ts: start + step.at })
  }
  out.push(...standingApproval(now))
  return out.sort((a, b) => a.ts - b.ts)
}

// ─── Ambient life: the company never sits still ──────────────────────────────

export function ambientRng() {
  return mulberry32(4207)
}

export function nextAmbient(rng: Rng): { steps: { at: number; e: Omit<WorldEvent, 'ts'> }[]; lengthMs: number } {
  const spec = pick(rng, TEMPLATES)(rng)
  const { script } = exchange(spec, between(rng, 1.6, 3.4))
  return { steps: script.steps, lengthMs: script.length }
}
