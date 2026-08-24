import { agentRef, ev, personRef } from '../../engine/build'
import type { RehearsalChatApi, RehearsalChatInput } from '../../engine/rehearsals'
import { currentAttempt } from './attempt'
import { blueprintEvent, horseActB, HORSE_INTERVIEW_QUESTIONS } from './script'

const reply = (api: RehearsalChatApi, agentId: string, text: string, delay = 1100) =>
  api.schedule([{
    at: delay,
    e: ev({
      type: 'Chat',
      from: agentRef(agentId),
      to: personRef(api.personaId()),
      title: text,
      payload: { text, simulated: true, rehearsalId: 'horse-launch' },
    }),
  }])

const isQuestion = (text: string): boolean => HORSE_INTERVIEW_QUESTIONS.includes(text)

export function handleHorseChat(api: RehearsalChatApi, input: RehearsalChatInput): boolean {
  const snapshot = api.snapshot()
  const committed = currentAttempt(
    snapshot.log.filter((event) => event.payload?.rehearsalId === 'horse-launch'),
  )
  const owned = currentAttempt([
    ...snapshot.log,
    ...snapshot.scheduled,
  ].filter((event) => event.payload?.rehearsalId === 'horse-launch'))

  const questionCount = owned.filter(
    (event) => event.type === 'Chat' && event.from?.id === 'op-marketing' && isQuestion(event.title),
  ).length
  const blueprintExists = owned.some((event) => event.type === 'BlueprintProposed')
  const taskExists = owned.some((event) => event.type === 'TaskRequest' && event.taskId)
  const completed = committed.some((event) => event.type === 'TaskCompleted')

  // In-progress multi-turn interview
  if (questionCount > 0 && !blueprintExists && !taskExists && input.agentId === 'op-marketing') {
    if (questionCount < HORSE_INTERVIEW_QUESTIONS.length) {
      reply(api, input.agentId, HORSE_INTERVIEW_QUESTIONS[questionCount])
    } else {
      reply(api, input.agentId, 'That’s everything I need. Here’s the blueprint. Review the inherited config and approve when ready.')
      const personId = api.personaId()
      const blueprint = blueprintEvent(personId)
      api.schedule([{ at: 2000, e: blueprint }])
      api.onResolve(blueprint.id, () => horseActB(api, personId, blueprint.id))
      api.autoResolve(blueprint.id, 45_000, personId)
    }
    return true
  }

  const text = input.text.toLowerCase()
  const wantsLaunch = /horse|walkthrough|launch video|youtube|video.*(channel|publish)|find alex|dating app/i.test(text)
  const wantsAgent = /new agent|create.*agent|agent for|need an agent|build.*agent|dedicated agent/i.test(text)
  if (!wantsLaunch && !wantsAgent) return false

  if (questionCount > 0 || blueprintExists || taskExists || completed) {
    reply(api, input.agentId, completed
      ? 'The launch rehearsal is complete. Select its task to replay the whole path.'
      : 'The launch is already in motion. Follow the task on the map or open the Marketing Agent.')
    return true
  }

  // Department boundary enforcement
  if (input.agentId !== 'op-marketing') {
    reply(api, input.agentId, `That sounds like a Marketing objective. The Marketing Agent owns the launch path and YouTube approval — jump over with ⌘K, or ask me for ${input.agentDept} work.`)
    return true
  }

  // Begin interactive interview
  reply(api, input.agentId, HORSE_INTERVIEW_QUESTIONS[0])
  return true
}