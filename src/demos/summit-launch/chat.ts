import { agentRef, ev, personRef } from '../../engine/build'
import type { RehearsalChatApi, RehearsalChatInput } from '../../engine/rehearsals'
import { currentAttempt } from './attempt'
import { blueprintEvent, heroActB, INTERVIEW_QUESTIONS } from './script'

const reply = (api: RehearsalChatApi, agentId: string, text: string, delay = 1100) =>
  api.schedule([{
    at: delay,
    e: ev({
      type: 'Chat',
      from: agentRef(agentId),
      to: personRef(api.personaId()),
      title: text,
      payload: { text },
    }),
  }])

const isQuestion = (text: string): boolean => INTERVIEW_QUESTIONS.includes(text)

export function handleSummitChat(api: RehearsalChatApi, input: RehearsalChatInput): boolean {
  const snapshot = api.snapshot()
  const committed = currentAttempt(
    snapshot.log.filter((event) => event.payload?.rehearsalId === 'summit-launch'),
  )
  const owned = currentAttempt([
    ...snapshot.log,
    ...snapshot.scheduled,
  ].filter((event) => event.payload?.rehearsalId === 'summit-launch'))
  const questionCount = owned.filter(
    (event) => event.type === 'Chat' && event.from?.id === 'op-marketing' && isQuestion(event.title),
  ).length
  const blueprintExists = owned.some((event) => event.type === 'BlueprintProposed')
  const taskExists = owned.some((event) => event.type === 'TaskRequest' && event.taskId)
  const completed = committed.some((event) => event.type === 'TaskCompleted')

  if (questionCount > 0 && !blueprintExists && !taskExists && input.agentId === 'op-marketing') {
    if (questionCount < INTERVIEW_QUESTIONS.length) {
      reply(api, input.agentId, INTERVIEW_QUESTIONS[questionCount])
    } else {
      reply(api, input.agentId, 'That’s everything I need. Here’s the blueprint. Review the inherited config and approve when ready.')
      const personId = api.personaId()
      const blueprint = blueprintEvent(personId)
      api.schedule([{ at: 2200, e: blueprint }])
      api.onResolve(blueprint.id, () => heroActB(api, personId, blueprint.id))
      api.autoResolve(blueprint.id, 45_000, personId)
    }
    return true
  }

  const text = input.text.toLowerCase()
  const wantsAgent = /new agent|create.*agent|agent for|need an agent|build.*agent|dedicated agent|hire.*agent/.test(text)
  const wantsLaunch = /launch|summit/.test(text) && !/budget|cost|spend|finance|legal|claim|contract|faq|support|status/.test(text)
  if (!wantsAgent && !wantsLaunch) return false

  if (questionCount > 0 || blueprintExists || taskExists || completed) {
    reply(api, input.agentId, completed
      ? 'The Summit launch rehearsal is complete. Select its task to replay the path.'
      : 'The Summit launch is already in motion. Follow its task or the Marketing Agent conversation.')
    return true
  }
  if (input.agentId !== 'op-marketing') {
    reply(api, input.agentId, `That sounds like a Marketing job. I’d route it to the Marketing Agent. Jump over with ⌘K, or ask me for ${input.agentDept} work.`)
    return true
  }

  reply(api, input.agentId, INTERVIEW_QUESTIONS[0])
  return true
}
