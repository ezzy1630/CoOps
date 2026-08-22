import type { AgentBlueprint, WorldEvent } from '../../../src/types.js'
import type { BrainAdapter, BrainCtx } from './types.js'
import type { Step } from '../runtime/scheduler.js'

type EventBody = Omit<WorldEvent, 'id' | 'ts'>

const agentRef = (id: string) => ({ kind: 'agent' as const, id })
const personRef = (id: string) => ({ kind: 'person' as const, id })

let taskNum = 990
const nextTaskId = () => `T-${++taskNum}`

const INTERVIEW_QUESTIONS = [
  'Happy to set that up. First — what outcome should this agent own? Describe it as a finish line, not a to-do list.',
  'Got it. What should trigger it — a schedule, an event in one of our systems, or someone asking?',
  'Which systems will it touch, and which departments will it need to pull in?',
  'Last one: who approves its work, and what hard limits should I write into it?',
]

const LAUNCH_BLUEPRINT: AgentBlueprint = {
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

const DEPT_NAMES: Record<string, string> = {
  marketing: 'Marketing',
  finance: 'Finance',
  legal: 'Legal',
  support: 'Support',
  operations: 'Operations',
  hr: 'HR',
}

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

function miniExchange(ctx: BrainCtx, fromDept: string, kind: 'budget' | 'legal' | 'faq'): string | null {
  const base = EXCHANGE_SPECS[kind]
  if (base.toDept === fromDept) return null
  const taskId = nextTaskId()
  const spec: ExchangeSpec = { ...base, fromDept, fromOp: OP_BY_DEPT[fromDept] ?? fromDept }
  ctx.schedule(exchangeSteps(spec, taskId), 1600)
  return taskId
}

const blueprintEvent = (personId: string): EventBody => ({
  type: 'BlueprintProposed',
  from: agentRef('op-marketing'),
  to: personRef(personId),
  deptFrom: 'marketing',
  title: 'Blueprint ready: Summit Launch Agent',
  detail: 'Inherits the company baseline and Marketing defaults; two local overrides.',
  payload: { blueprint: LAUNCH_BLUEPRINT },
})

const reply = (ctx: BrainCtx, agentId: string, personId: string, text: string, delay = 1100) =>
  ctx.schedule([{
    at: delay,
    e: {
      type: 'Chat', from: agentRef(agentId), to: personRef(personId),
      title: text, payload: { text },
    },
  }])

export function createMockBrain(): BrainAdapter {
  return {
    handle(ctx, agentId, deptId, text, personId) {
      const t = text.toLowerCase()
      const iv = ctx.interviewStep(agentId)

      if (iv !== null && agentId === 'op-marketing') {
        const next = iv + 1
        if (next < INTERVIEW_QUESTIONS.length) {
          ctx.setInterviewStep(agentId, next)
          reply(ctx, agentId, personId, INTERVIEW_QUESTIONS[next])
        } else {
          ctx.setInterviewStep(agentId, null)
          reply(ctx, agentId, personId, 'That’s everything I need. Here’s the blueprint — review the inherited config and approve when ready.')
          ctx.schedule([{ at: 2200, e: blueprintEvent(personId) }])
        }
        return
      }

      const wantsAgent = /new agent|create.*agent|agent for|need an agent|build.*agent|dedicated agent|hire.*agent/.test(t)
      const wantsLaunch = /launch|summit/.test(t) && !/budget|cost|spend|finance|legal|claim|contract|faq|support|status/.test(t)
      if (wantsAgent || wantsLaunch) {
        if (agentId !== 'op-marketing') {
          reply(ctx, agentId, personId, `That sounds like a Marketing job — I’d route it to the Marketing Agent. Jump over with ⌘K, or ask me for ${deptId} work.`)
          return
        }
        ctx.setInterviewStep(agentId, 0)
        reply(ctx, agentId, personId, INTERVIEW_QUESTIONS[0])
        return
      }

      if (/budget|cost|spend|finance/.test(t)) {
        const id = miniExchange(ctx, deptId, 'budget')
        reply(ctx, agentId, personId, id
          ? 'On it — asking the Finance Agent for the Q3 budget position. Watch the edge on the map; the artifact lands back here.'
          : 'That’s our own ledger — pulling it now.')
        return
      }
      if (/legal|claim|contract|compliance|policy/.test(t)) {
        const id = miniExchange(ctx, deptId, 'legal')
        reply(ctx, agentId, personId, id
          ? 'Routing a claims check to the Legal Agent with scoped context — request and artifact only, no internal chatter crosses over.'
          : 'Reviewing locally — Legal is my department.')
        return
      }
      if (/faq|support|customer|help.?center|ticket/.test(t)) {
        const id = miniExchange(ctx, deptId, 'faq')
        reply(ctx, agentId, personId, id
          ? 'Asked the Support Agent to prep FAQs. Their FAQ Agent will draft; we get the artifact back.'
          : 'Drafting FAQs now — that’s us.')
        return
      }
      if (/status|progress|going on|update|working on/.test(t)) {
        const active = ctx.worldTasks().filter(
          (x) => x.status !== 'done' && x.status !== 'failed',
        )
        const dept = DEPT_NAMES[deptId] ?? deptId
        reply(ctx, agentId, personId, active.length === 0
          ? `${dept} is quiet right now — queue is clear. Ambient jobs run on schedule.`
          : `${dept} has ${active.length} live ${active.length === 1 ? 'task' : 'tasks'}: ${active.slice(0, 3).map((x) => `“${x.title}” (${x.status.replace('_', ' ')})`).join(' · ')}. Click one on the map to focus it.`)
        return
      }
      if (/hello|hey|hi|who are you|what can you/.test(t)) {
        const dept = DEPT_NAMES[deptId] ?? deptId
        reply(ctx, agentId, personId, `I’m the ${dept} Agent — I run ${dept.toLowerCase()}’s work, pull in other departments when needed, and can draft a new agent for any recurring job. Ask me for a budget check, a legal review, FAQ prep… or “I need an agent for the product launch.”`)
        return
      }
      reply(ctx, agentId, personId, 'I can take that as a task, pull in another department, or draft a dedicated agent for it. Try “ask Finance for the Q3 launch budget” — or “I need an agent for the Summit launch.”')
    },
  }
}
