/** Cross-department exchanges execute for real: runExchange drives one task
 * through its lifecycle, emitting each event when the stage actually completes.
 * Timing emerges from the executor's duration instead of scheduled playback.
 * Dispatched tasks can be aborted mid-flight via cancelExchangeTask (e.g. when
 * a guardrail blocks the turn that requested them). */

import { getAgents } from '../../../src/data/company.js'
import type { WorldEvent } from '../../../src/types.js'
import type { BrainCtx } from './types.js'

export type ExchangeKind = 'budget' | 'legal' | 'faq'

export interface ExchangeSpecResolved {
  kind: ExchangeKind
  fromDept: string
  toDept: string
  requesterId: string
  operatorId: string
  workerId: string
  title: string
  objective: string
  artifact: { name: string; type: string }
}

export interface ExchangeOutcome {
  summary: string
  source: string
}

export type ExchangeExecutor = (spec: ExchangeSpecResolved) => Promise<ExchangeOutcome>

const agentRef = (id: string) => ({ kind: 'agent' as const, id })

let taskNum = 990
const nextTaskId = () => `T-${++taskNum}`

const WORKER_BY_KIND: Record<ExchangeKind, string> = {
  budget: 'w-budget',
  legal: 'w-contract',
  faq: 'w-faq',
}

interface ExchangeBase {
  toDept: string
  title: string
  objective: string
  artifact: { name: string; type: string }
}

const EXCHANGE_BASES: Record<ExchangeKind, ExchangeBase> = {
  budget: {
    toDept: 'finance',
    title: 'Q3 launch budget summary',
    objective: 'Pull the current Q3 launch budget position with committed vs. actual.',
    artifact: { name: 'Q3 budget position', type: 'Report' },
  },
  legal: {
    toDept: 'legal',
    title: 'Claims and policy check',
    objective: 'Review the requested copy or document for compliance issues.',
    artifact: { name: 'Compliance review note', type: 'Memo' },
  },
  faq: {
    toDept: 'support',
    title: 'FAQ preparation request',
    objective: 'Draft customer-facing FAQs for the requested topic.',
    artifact: { name: 'FAQ draft', type: 'Article' },
  },
}

const agentInDept = (deptId: string, kind: 'operator' | 'worker') =>
  getAgents().find((a) => a.deptId === deptId && a.kind === kind)

function resolveWorker(kind: ExchangeKind, toDept: string): string {
  const preferred = getAgents().find((a) => a.id === WORKER_BY_KIND[kind] && a.deptId === toDept)
  return preferred?.id ?? agentInDept(toDept, 'worker')?.id ?? toDept
}

const cancelledTasks = new Set<string>()

/** Aborts an in-flight exchange: remaining lifecycle events are suppressed. */
export function cancelExchangeTask(taskId: string): void {
  cancelledTasks.add(taskId)
}

async function performExchange(
  ctx: BrainCtx,
  executor: ExchangeExecutor,
  spec: ExchangeSpecResolved,
  taskId: string,
): Promise<void> {
  const requester = agentRef(spec.requesterId)
  const operator = agentRef(spec.operatorId)
  const worker = agentRef(spec.workerId)

  ctx.emit({
    type: 'TaskRequest', taskId, edge: 'task', travelMs: 2400,
    from: requester, to: operator,
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
  ctx.emit({
    type: 'TaskAccepted', taskId,
    from: operator, to: requester,
    deptFrom: spec.toDept, deptTo: spec.fromDept,
    title: `${spec.title}: accepted`,
    detail: `Queued in ${spec.toDept}`,
  })
  ctx.emit({
    type: 'DelegatedTo', taskId,
    from: operator, to: worker,
    deptFrom: spec.toDept, deptTo: spec.toDept,
    title: 'Delegated to worker',
    detail: spec.title,
  })

  const startedAt = Date.now()
  const outcome = await executor(spec)
  if (cancelledTasks.has(taskId)) return
  const latencyMs = Date.now() - startedAt

  ctx.emit({
    type: 'StatusUpdate', taskId,
    from: worker, to: requester,
    deptFrom: spec.toDept, deptTo: spec.fromDept,
    title: 'In progress',
    detail: outcome.summary,
    payload: { latencyMs },
  })
  ctx.emit({
    type: 'ArtifactDelivered', taskId, edge: 'artifact', travelMs: 2400,
    from: operator, to: requester,
    deptFrom: spec.toDept, deptTo: spec.fromDept,
    title: `Delivered: ${spec.artifact.name}`,
    payload: {
      artifact: {
        ...spec.artifact,
        content: outcome.summary,
        source: outcome.source,
      },
    },
  })
  ctx.emit({
    type: 'TaskCompleted', taskId,
    from: requester,
    deptFrom: spec.fromDept, deptTo: spec.fromDept,
    title: `${spec.title}: complete`,
  })
}

/** Runs one real cross-department exchange; returns null taskId when the target
 * department is the caller's own (nothing to run). */
export function runExchange(ctx: BrainCtx, executor: ExchangeExecutor, kind: ExchangeKind, fromDept: string): { dispatched: boolean; taskId: string | null } {
  const base = EXCHANGE_BASES[kind]
  if (base.toDept === fromDept) return { dispatched: false, taskId: null }

  const toDept = base.toDept
  const taskId = nextTaskId()
  const spec: ExchangeSpecResolved = {
    kind,
    fromDept,
    toDept,
    requesterId: agentInDept(fromDept, 'operator')?.id ?? fromDept,
    operatorId: agentInDept(toDept, 'operator')?.id ?? toDept,
    workerId: resolveWorker(kind, toDept),
    title: base.title,
    objective: base.objective,
    artifact: base.artifact,
  }

  void performExchange(ctx, executor, spec, taskId)
    .catch((err) => console.error(err))
    .finally(() => cancelledTasks.delete(taskId))
  return { dispatched: true, taskId }
}
