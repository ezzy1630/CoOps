import type { AgentBlueprint, WorldEvent } from '../../../src/types.js'
import type { BrainAdapter, BrainCtx } from './types.js'
import type { ExchangeExecutor } from './exchanges.js'
import { runExchange } from './exchanges.js'

type EventBody = Omit<WorldEvent, 'id' | 'ts'>

const agentRef = (id: string) => ({ kind: 'agent' as const, id })
const personRef = (id: string) => ({ kind: 'person' as const, id })

const hashOf = (s: string) => {
  let h = 0
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

const mockExecutor: ExchangeExecutor = async (spec) => {
  await delay(600 + (hashOf(`${spec.kind}|${spec.title}|${spec.objective}`) % 800))
  switch (spec.kind) {
    case 'budget':
      return {
        summary: `‚Ä?{spec.title}‚Ä?complete: committed vs. actual reconciled and the position summarized in ‚Ä?{spec.artifact.name}‚Ä?`,
      }
    case 'legal':
      return {
        summary: `‚Ä?{spec.title}‚Ä?complete: compliance review finished, findings captured in ‚Ä?{spec.artifact.name}‚Ä?`,
      }
    case 'faq':
      return {
        summary: `‚Ä?{spec.title}‚Ä?complete: customer-ready Q&A drafted in ‚Ä?{spec.artifact.name}‚Ä?`,
      }
  }
}

const INTERVIEW_QUESTIONS = [
  'Happy to set that up. First ‚Ä?what outcome should this agent own? Describe it as a finish line, not a to-do list.',
  'Got it. What should trigger it ‚Ä?a schedule, an event in one of our systems, or someone asking?',
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
    async handle(ctx, agentId, deptId, text, personId) {
      const t = text.toLowerCase()
      const iv = ctx.interviewStep(agentId)

      if (iv !== null && agentId === 'op-marketing') {
        const next = iv + 1
        if (next < INTERVIEW_QUESTIONS.length) {
          ctx.setInterviewStep(agentId, next)
          reply(ctx, agentId, personId, INTERVIEW_QUESTIONS[next])
        } else {
          ctx.setInterviewStep(agentId, null)
          reply(ctx, agentId, personId, 'That‚Äôs everything I need. Here‚Äôs the blueprint ‚Ä?review the inherited config and approve when ready.')
          ctx.schedule([{ at: 2200, e: blueprintEvent(personId) }])
        }
        return
      }

      const wantsAgent = /new agent|create.*agent|agent for|need an agent|build.*agent|dedicated agent|hire.*agent/.test(t)
      const wantsLaunch = /launch|summit/.test(t) && !/budget|cost|spend|finance|legal|claim|contract|faq|support|status/.test(t)
      if (wantsAgent || wantsLaunch) {
        if (agentId !== 'op-marketing') {
          reply(ctx, agentId, personId, `That sounds like a Marketing job ‚Ä?I‚Äôd route it to the Marketing Agent. Jump over with ‚åòK, or ask me for ${deptId} work.`)
          return
        }
        ctx.setInterviewStep(agentId, 0)
        reply(ctx, agentId, personId, INTERVIEW_QUESTIONS[0])
        return
      }

      if (/budget|cost|spend|finance/.test(t)) {
        const { dispatched } = runExchange(ctx, mockExecutor, 'budget', deptId)
        reply(ctx, agentId, personId, dispatched
          ? 'On it ‚Ä?asking the Finance Agent for the Q3 budget position. Watch the edge on the map; the artifact lands back here.'
          : 'That‚Äôs our own ledger ‚Ä?pulling it now.')
        return
      }
      if (/legal|claim|contract|compliance|policy/.test(t)) {
        const { dispatched } = runExchange(ctx, mockExecutor, 'legal', deptId)
        reply(ctx, agentId, personId, dispatched
          ? 'Routing a claims check to the Legal Agent with scoped context ‚Ä?request and artifact only, no internal chatter crosses over.'
          : 'Reviewing locally ‚Ä?Legal is my department.')
        return
      }
      if (/faq|support|customer|help.?center|ticket/.test(t)) {
        const { dispatched } = runExchange(ctx, mockExecutor, 'faq', deptId)
        reply(ctx, agentId, personId, dispatched
          ? 'Asked the Support Agent to prep FAQs. Their FAQ Agent will draft; we get the artifact back.'
          : 'Drafting FAQs now ‚Ä?that‚Äôs us.')
        return
      }
      if (/status|progress|going on|update|working on/.test(t)) {
        const active = ctx.worldTasks().filter(
          (x) => x.status !== 'done' && x.status !== 'failed',
        )
        const dept = DEPT_NAMES[deptId] ?? deptId
        reply(ctx, agentId, personId, active.length === 0
          ? `${dept} is quiet right now ‚Ä?queue is clear. Ambient jobs run on schedule.`
          : `${dept} has ${active.length} live ${active.length === 1 ? 'task' : 'tasks'}: ${active.slice(0, 3).map((x) => `‚Ä?{x.title}‚Ä?(${x.status.replace('_', ' ')})`).join(' ¬∑ ')}. Click one on the map to focus it.`)
        return
      }
      if (/hello|hey|hi|who are you|what can you/.test(t)) {
        const dept = DEPT_NAMES[deptId] ?? deptId
        reply(ctx, agentId, personId, `I‚Äôm the ${dept} Agent ‚Ä?I run ${dept.toLowerCase()}‚Äôs work, pull in other departments when needed, and can draft a new agent for any recurring job. Ask me for a budget check, a legal review, FAQ prep‚Ä?or ‚ÄúI need an agent for the product launch.‚Äù`)
        return
      }
      reply(ctx, agentId, personId, 'I can take that as a task, pull in another department, or draft a dedicated agent for it. Try ‚Äúask Finance for the Q3 launch budget‚Ä?‚Ä?or ‚ÄúI need an agent for the Summit launch.‚Ä?)
    },
  }
}
