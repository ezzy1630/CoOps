import type { WorldEvent } from '../../../src/types.js'
import type { Step } from '../runtime/scheduler.js'
import type { BrainCtx } from './types.js'

type EventBody = Omit<WorldEvent, 'id' | 'ts'>

const agentRef = (id: string) => ({ kind: 'agent' as const, id })

let taskNum = 990
const nextTaskId = () => `T-${++taskNum}`

const OP_BY_DEPT: Record<string, string> = {
  marketing: 'op-marketing', finance: 'op-finance', legal: 'op-legal',
  support: 'op-support', operations: 'op-operations', hr: 'op-hr',
}

interface ExchangeSpec {
  fromDept: string
  fromOp: string
  toDept: string
  toOp: string
  worker: string
  title: string
  objective: string
  artifact: { name: string; type: string }
}

const EXCHANGE_SPECS: Record<'budget' | 'legal' | 'faq', Omit<ExchangeSpec, 'fromDept' | 'fromOp'>> = {
  budget: {
    toDept: 'finance', toOp: 'op-finance', worker: 'w-budget',
    title: 'Q3 launch budget summary',
    objective: 'Pull the current Q3 launch budget position with committed vs. actual.',
    artifact: { name: 'Q3 budget position', type: 'Report' },
  },
  legal: {
    toDept: 'legal', toOp: 'op-legal', worker: 'w-contract',
    title: 'Claims and policy check',
    objective: 'Review the requested copy or document for compliance issues.',
    artifact: { name: 'Compliance review note', type: 'Memo' },
  },
  faq: {
    toDept: 'support', toOp: 'op-support', worker: 'w-faq',
    title: 'FAQ preparation request',
    objective: 'Draft customer-facing FAQs for the requested topic.',
    artifact: { name: 'FAQ draft', type: 'Article' },
  },
}

const PACE = 2.2

function exchangeSteps(spec: ExchangeSpec, taskId: string): Step[] {
  const steps: Step[] = []
  let cursor = 0
  const push = (delayMs: number, e: EventBody) => {
    cursor += delayMs
    steps.push({ at: cursor, e })
  }
  const p = (ms: number) => ms * PACE

  const requester = agentRef(spec.fromOp)

  push(0, {
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
  })
  push(p(2600), {
    type: 'TaskAccepted', taskId,
    from: agentRef(spec.toOp), to: requester,
    deptFrom: spec.toDept, deptTo: spec.fromDept,
    title: `${spec.title} — accepted`,
    detail: `Queued in ${spec.toDept}`,
  })
  push(p(1800), {
    type: 'DelegatedTo', taskId,
    from: agentRef(spec.toOp), to: agentRef(spec.worker),
    deptFrom: spec.toDept, deptTo: spec.toDept,
    title: 'Delegated to worker',
    detail: `${spec.title}`,
  })
  push(p(3200), {
    type: 'StatusUpdate', taskId,
    from: agentRef(spec.worker), to: agentRef(spec.fromOp),
    deptFrom: spec.toDept, deptTo: spec.fromDept,
    title: 'In progress',
    detail: `Working on ${spec.artifact.name.toLowerCase()}`,
    payload: { latencyMs: Math.round(400 + 2200 * ((taskNum * 37) % 100) / 100), costUsd: 0.04 },
  })
  push(p(4200), {
    type: 'ArtifactDelivered', taskId, edge: 'artifact', travelMs: 2400,
    from: agentRef(spec.toOp), to: requester,
    deptFrom: spec.toDept, deptTo: spec.fromDept,
    title: `Delivered: ${spec.artifact.name}`,
    payload: { artifact: spec.artifact, costUsd: 0.06 },
  })
  push(p(1600), {
    type: 'TaskCompleted', taskId,
    from: requester,
    deptFrom: spec.fromDept, deptTo: spec.fromDept,
    title: `${spec.title} — complete`,
  })
  return steps
}

/** Schedules a cross-department exchange chain; returns false when the target
 * department is the caller's own department (nothing to schedule). */
export function scheduleExchange(ctx: BrainCtx, kind: 'budget' | 'legal' | 'faq', fromDept: string): boolean {
  const base = EXCHANGE_SPECS[kind]
  if (base.toDept === fromDept) return false
  const taskId = nextTaskId()
  const spec: ExchangeSpec = { ...base, fromDept, fromOp: OP_BY_DEPT[fromDept] ?? fromDept }
  ctx.schedule(exchangeSteps(spec, taskId), 1600)
  return true
}
