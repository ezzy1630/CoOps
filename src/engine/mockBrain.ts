// Offline demo fixture mirroring server/src/brain/mock.ts — runs only when no
// backend is connected; real chat goes through POST /chat to the server brain.
import type { World } from '../types'
import { agentRef, ev, personRef } from './build'
import { deptById } from '../data/company'
import { exchange, type ExchangeSpec } from '../data/scenarios'
import type { EngineApi } from './rehearsals'

export interface BrainCtx extends EngineApi {
  world(): World
  personaId(): string
}

const reply = (ctx: BrainCtx, agentId: string, text: string, delay = 1100) =>
  ctx.schedule([{
    at: delay,
    e: ev({
      type: 'Chat', from: agentRef(agentId), to: personRef(ctx.personaId()),
      title: text, payload: { text, simulated: true },
    }),
  }])

const OP_BY_DEPT: Record<string, string> = {
  marketing: 'op-marketing', finance: 'op-finance', legal: 'op-legal',
  support: 'op-support', operations: 'op-operations', hr: 'op-hr',
}

function miniExchange(ctx: BrainCtx, fromDept: string, toDept: string, kind: 'budget' | 'legal' | 'faq') {
  const specs: Record<string, Omit<ExchangeSpec, 'fromDept' | 'fromOp'>> = {
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
  const base = specs[kind]
  if (base.toDept === fromDept) return null // it's a local job then
  const spec: ExchangeSpec = { ...base, fromDept, fromOp: OP_BY_DEPT[fromDept] }
  const { script, taskId } = exchange(spec, 2.2)
  ctx.schedule(script.steps, 1600)
  return taskId
}

/** Handles a judge's free-typed (or spoken) message to an agent. */
export function handleChat(ctx: BrainCtx, agentId: string, agentDept: string, text: string) {
  const t = text.toLowerCase()

  const wantsAgent = /new agent|create.*agent|agent for|need an agent|build.*agent|dedicated agent|hire.*agent/.test(t)
  if (wantsAgent) {
    reply(ctx, agentId, 'This local rehearsal has no scripted agent-builder for that request. Use live mode for a general blueprint interview, or ask me for budget, legal, FAQ, or status work here.')
    return
  }

  if (/budget|cost|spend|finance/.test(t)) {
    const id = miniExchange(ctx, agentDept, 'finance', 'budget')
    reply(ctx, agentId, id
      ? 'On it. I’m asking the Finance Agent for the Q3 budget position. Watch the edge on the map; the artifact lands back here.'
      : 'That’s our own ledger. I’m pulling it now.')
    return
  }
  if (/legal|claim|contract|compliance|policy/.test(t)) {
    const id = miniExchange(ctx, agentDept, 'legal', 'legal')
    reply(ctx, agentId, id
      ? 'Routing a claims check to the Legal Agent with scoped context. Only the request and artifact cross over.'
      : 'Reviewing locally. Legal is my department.')
    return
  }
  if (/faq|support|customer|help.?center|ticket/.test(t)) {
    const id = miniExchange(ctx, agentDept, 'support', 'faq')
    reply(ctx, agentId, id
      ? 'Asked the Support Agent to prep FAQs. Their FAQ Agent will draft; we get the artifact back.'
      : 'Drafting FAQs now. That’s us.')
    return
  }
  if (/status|progress|going on|update|working on/.test(t)) {
    const w = ctx.world()
    const active = [...w.tasks.values()].filter(
      (x) => x.status !== 'done' && x.status !== 'failed' && (x.originDept === agentDept || x.path.includes(agentDept)),
    )
    const dept = deptById.get(agentDept)?.name ?? agentDept
    reply(ctx, agentId, active.length === 0
      ? `${dept} is quiet right now. The queue is clear and scheduled jobs continue to run.`
      : `${dept} has ${active.length} live ${active.length === 1 ? 'task' : 'tasks'}: ${active.slice(0, 3).map((x) => `“${x.title}” (${x.status.replace('_', ' ')})`).join(' · ')}. Click one on the map to focus it.`)
    return
  }
  if (/hello|hey|hi|who are you|what can you/.test(t)) {
    const dept = deptById.get(agentDept)?.name ?? agentDept
    reply(ctx, agentId, `I’m the ${dept} Agent. I run ${dept.toLowerCase()}’s work and pull in other departments when needed. Ask me for a budget check, a legal review, FAQ preparation, or a status update.`)
    return
  }
  reply(ctx, agentId, 'I can take that as a task or pull in another department. Try “ask Finance for the Q3 budget,” “review these claims,” “prepare FAQs,” or “show me status.”')
}
