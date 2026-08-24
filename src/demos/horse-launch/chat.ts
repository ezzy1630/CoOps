import { agentRef, ev, personRef } from '../../engine/build'
import type { RehearsalChatApi, RehearsalChatInput } from '../../engine/rehearsals'
import { currentAttempt } from './attempt'
import { horseInterviewAuto } from './script'

const LAUNCH_INTENT = /horse|walkthrough|launch video|youtube|video.*(channel|publish)|find alex/i

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

export function handleHorseChat(api: RehearsalChatApi, input: RehearsalChatInput): boolean {
  const snapshot = api.snapshot()
  const owned = currentAttempt([
    ...snapshot.log,
    ...snapshot.scheduled,
  ].filter((event) => event.payload?.rehearsalId === 'horse-launch'))

  const taskExists = owned.some((e) => e.type === 'TaskRequest' && e.taskId)
  const completed = owned.some((e) => e.type === 'TaskCompleted')
  const blueprintExists = owned.some((e) => e.type === 'BlueprintProposed')

  if (!LAUNCH_INTENT.test(input.text)) return false

  if (input.agentId !== 'op-marketing') {
    reply(api, input.agentId, "That's a Marketing objective. The Marketing Agent owns the launch path — jump over with ⌘K.")
    return true
  }
  if (completed) {
    reply(api, input.agentId, 'The launch rehearsal is complete. Select its task to replay the whole path.')
    return true
  }
  if (taskExists || blueprintExists) {
    reply(api, input.agentId, 'The launch is already in motion. Follow the task on the map or open the Marketing Agent.')
    return true
  }

  reply(api, input.agentId, 'On it. Proposing the Horse Launch Agent blueprint now — publication will wait for your approval.')
  horseInterviewAuto(api, api.personaId())
  return true
}