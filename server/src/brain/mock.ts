import type { AgentBlueprint, WorldEvent } from '../../../src/types.js'
import { deptById, getDepartments, getTools } from '../../../src/data/company.js'
import type { BrainAdapter, BrainCtx } from './types.js'
import type { DeptMemory } from '../memory/types.js'
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
        summary: `“${spec.title}” complete: committed vs. actual reconciled and the position summarized in “${spec.artifact.name}”.`,
        source: 'deterministic server fixture',
      }
    case 'legal':
      return {
        summary: `“${spec.title}” complete: compliance review finished, findings captured in “${spec.artifact.name}”.`,
        source: 'deterministic server fixture',
      }
    case 'faq':
      return {
        summary: `“${spec.title}” complete: customer-ready Q&A drafted in “${spec.artifact.name}”.`,
        source: 'deterministic server fixture',
      }
  }
}

const INTERVIEW_QUESTIONS = [
  'What recurring outcome should this agent own? Describe the finish line in your own words.',
  'What should trigger the work: a schedule, an event in one of our systems, or a person asking?',
  'Which connected tools should it use, and should it coordinate with another department?',
  'What approvals or hard limits must it follow? Say “none” if there are none.',
]

const EMPTY_ANSWER = /^(?:none|n\/?a|not sure|unknown|no idea|skip)$/i
const STOP_WORDS = new Set([
  'a', 'an', 'and', 'for', 'from', 'in', 'it', 'of', 'on', 'our', 'the', 'this', 'to', 'with',
])

interface InterviewSession {
  deptId: string
  answers: string[]
}

const cleanAnswer = (answer: string, fallback: string): string => {
  const cleaned = answer.trim().replace(/\s+/g, ' ').slice(0, 320)
  return !cleaned || EMPTY_ANSWER.test(cleaned) ? fallback : cleaned
}

const hasAnswer = (answer: string): boolean => {
  const cleaned = answer.trim()
  return cleaned.length > 0 && !EMPTY_ANSWER.test(cleaned)
}

const escapePattern = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const mentionsId = (answer: string, id: string): boolean =>
  new RegExp(`(?:^|[^a-z0-9])${escapePattern(id)}(?:$|[^a-z0-9])`, 'i').test(answer)

const blueprintName = (purpose: string, deptName: string): string => {
  const words = purpose
    .replace(/[^a-zA-Z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word.toLowerCase()))
    .slice(0, 3)
  if (words.length === 0) return `${deptName} Workflow Agent`
  const stem = words.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ')
  return `${stem} Agent`
}

const mentionedTools = (answer: string): string[] => {
  const lower = answer.toLowerCase()
  return getTools()
    .filter((tool) => mentionsId(lower, tool.id) || lower.includes(tool.name.toLowerCase()))
    .map((tool) => tool.id)
}

const mentionedCollaborators = (answer: string, localDeptId: string): string[] => {
  const lower = answer.toLowerCase()
  return getDepartments()
    .filter((department) => department.id !== localDeptId)
    .filter((department) => mentionsId(lower, department.id) || mentionsId(lower, department.name))
    .map((department) => `${department.name} Agent`)
}

const explicitClauses = (answer: string, pattern: RegExp): string[] => {
  if (EMPTY_ANSWER.test(answer.trim())) return []
  return answer
    .split(/[.;\n]+/)
    .map((clause) => clause.trim())
    .filter((clause) => clause.length > 0 && pattern.test(clause))
    .slice(0, 4)
}

const buildBlueprint = (deptId: string, personId: string, answers: string[]): AgentBlueprint => {
  const department = deptById.get(deptId) ?? getDepartments()[0]
  const localDeptId = department?.id ?? deptId
  const deptName = department?.name ?? 'Company'
  const purposeAnswer = answers[0] ?? ''
  const purpose = cleanAnswer(purposeAnswer, `Handle recurring work for the ${deptName} department.`)
  const trigger = cleanAnswer(answers[1] ?? '', `A person asks the ${deptName} Agent.`)
  const systems = answers[2] ?? ''
  const constraints = answers[3] ?? ''
  return {
    name: hasAnswer(purposeAnswer) ? blueprintName(purpose, deptName) : `${deptName} Workflow Agent`,
    deptId: localDeptId,
    purpose,
    trigger,
    skills: [`${deptName} workflow execution`],
    toolIds: mentionedTools(systems),
    collaborators: mentionedCollaborators(systems, localDeptId),
    approvals: explicitClauses(constraints, /\b(?:approv(?:e|es|ed|al)|review|sign[ -]?off|permission)\b/i),
    limits: explicitClauses(constraints, /(?:\b(?:limit|cap|budget|never|must|only|cannot|can't)\b|\bno\s+|\bwithout\b)/i),
    ownerId: personId,
  }
}

const blueprintEvent = (agentId: string, personId: string, blueprint: AgentBlueprint): EventBody => ({
  type: 'BlueprintProposed',
  from: agentRef(agentId),
  to: personRef(personId),
  deptFrom: blueprint.deptId,
  title: `Blueprint ready: ${blueprint.name}`,
  detail: `Inherits the company baseline and ${deptById.get(blueprint.deptId)?.name ?? blueprint.deptId} defaults; only explicitly named tools, collaborators, approvals, and limits are included.`,
  payload: { blueprint },
})

export function createMockBrain(opts?: { memory?: DeptMemory }): BrainAdapter {
  const interviews = new Map<string, InterviewSession>()

  return {
    async handle(ctx, agentId, deptId, text, personId) {
      const t = text.toLowerCase()
      const interviewKey = `${personId}\u0000${agentId}`
      const interview = interviews.get(interviewKey)
      const wantsAgent = /new agent|create.*agent|agent for|need an agent|build.*agent|dedicated agent|hire.*agent/.test(t)

      // Advance the private session before the first await. Concurrent messages
      // therefore observe distinct turns instead of repeating the same question.
      let interviewTurn:
        | { kind: 'question'; questionIndex: number }
        | { kind: 'blueprint'; answers: string[]; deptId: string }
        | { kind: 'start' }
        | null = null
      if (interview) {
        const answers = [...interview.answers, text]
        if (answers.length < INTERVIEW_QUESTIONS.length) {
          interviews.set(interviewKey, { ...interview, answers })
          interviewTurn = { kind: 'question', questionIndex: answers.length }
        } else {
          interviews.delete(interviewKey)
          interviewTurn = { kind: 'blueprint', answers, deptId: interview.deptId }
        }
      } else if (wantsAgent) {
        interviews.set(interviewKey, { deptId, answers: [] })
        interviewTurn = { kind: 'start' }
      }

      await opts?.memory?.append(deptId, 'human', text)

      const reply = async (ctx: BrainCtx, agentId: string, personId: string, text: string, delay = 1100) => {
        await opts?.memory?.append(deptId, 'agent', text)
        ctx.schedule([{
          at: delay,
          e: {
            type: 'Chat', from: agentRef(agentId), to: personRef(personId),
            title: text, payload: { text },
          },
        }])
      }

      if (interviewTurn?.kind === 'question') {
        void reply(ctx, agentId, personId, INTERVIEW_QUESTIONS[interviewTurn.questionIndex])
        return
      }
      if (interviewTurn?.kind === 'blueprint') {
        const blueprint = buildBlueprint(interviewTurn.deptId, personId, interviewTurn.answers)
        void reply(ctx, agentId, personId, 'That’s everything I need. Here’s the department-local blueprint. Review it and approve when ready.')
        ctx.schedule([{ at: 2200, e: blueprintEvent(agentId, personId, blueprint) }])
        return
      }
      if (interviewTurn?.kind === 'start') {
        void reply(ctx, agentId, personId, INTERVIEW_QUESTIONS[0])
        return
      }

      if (/budget|cost|spend|finance/.test(t)) {
        const { dispatched } = runExchange(ctx, mockExecutor, 'budget', deptId)
        void reply(ctx, agentId, personId, dispatched
          ? 'On it. I’m asking the Finance Agent for the current budget position. Watch the edge on the map; the artifact lands back here.'
          : 'That’s our own ledger. I’m pulling it now.')
        return
      }
      if (/legal|claim|contract|compliance|policy/.test(t)) {
        const { dispatched } = runExchange(ctx, mockExecutor, 'legal', deptId)
        void reply(ctx, agentId, personId, dispatched
          ? 'Routing a claims check to the Legal Agent with scoped context. Only the request and artifact cross over.'
          : 'Reviewing locally. Legal is my department.')
        return
      }
      if (/faq|support|customer|help.?center|ticket/.test(t)) {
        const { dispatched } = runExchange(ctx, mockExecutor, 'faq', deptId)
        void reply(ctx, agentId, personId, dispatched
          ? 'Asked the Support Agent to prep FAQs. Their FAQ Agent will draft; we get the artifact back.'
          : 'Drafting FAQs now. That’s us.')
        return
      }
      if (/status|progress|going on|update|working on/.test(t)) {
        const active = ctx.worldTasks().filter(
          (x) => x.status !== 'done' && x.status !== 'failed',
        )
        const dept = deptById.get(deptId)?.name ?? deptId
        void reply(ctx, agentId, personId, active.length === 0
          ? `${dept} is quiet right now. The queue is clear and scheduled jobs continue to run.`
          : `${dept} has ${active.length} live ${active.length === 1 ? 'task' : 'tasks'}: ${active.slice(0, 3).map((x) => `“${x.title}” (${x.status.replace('_', ' ')})`).join(' · ')}. Click one on the map to focus it.`)
        return
      }
      if (/hello|hey|hi|who are you|what can you/.test(t)) {
        const dept = deptById.get(deptId)?.name ?? deptId
        void reply(ctx, agentId, personId, `I’m the ${dept} Agent. I run ${dept.toLowerCase()}’s work, pull in other departments when needed, and can draft a new agent for recurring work. Ask me for a budget check, a legal review, FAQ prep, or say “I need an agent for a recurring workflow.”`)
        return
      }
      void reply(ctx, agentId, personId, 'I can take that as a task, pull in another department, or draft a dedicated agent for recurring work. Try “ask Finance for the current budget position” or “I need an agent for a recurring workflow.”')
    },
  }
}
