import { personById } from '../../data/company'
import type {
  RehearsalDefinition,
  RehearsalPresentation,
  RehearsalSnapshot,
} from '../../engine/rehearsals'
import { currentAttempt } from './attempt'
import { handleSummitChat } from './chat'
import { heroInterviewAuto, INTERVIEW_QUESTIONS } from './script'

const STEPS = ['Interview', 'Fan-out', 'Unblock & deliver'] as const

function present(snapshot: RehearsalSnapshot): RehearsalPresentation {
  const allCommitted = snapshot.log.filter((event) => event.payload?.rehearsalId === 'summit-launch')
  const committed = currentAttempt(allCommitted)
  const owned = currentAttempt([
    ...allCommitted,
    ...snapshot.scheduled.filter((event) => event.payload?.rehearsalId === 'summit-launch'),
  ])
  const interviewStarted = owned.some(
    (event) => event.type === 'Chat'
      && event.from?.id === 'op-marketing'
      && INTERVIEW_QUESTIONS.includes(event.title),
  )
  const taskEvent = owned.find((event) => event.type === 'TaskRequest' && event.taskId)
  const taskId = taskEvent?.taskId
  const task = taskId ? snapshot.world.tasks.get(taskId) : undefined

  if (task?.status === 'done') {
    return {
      state: 'complete',
      holdAmbient: false,
    }
  }
  if (!interviewStarted && !taskId && !owned.some((event) => event.type === 'BlueprintProposed')) {
    return { state: 'idle', holdAmbient: false }
  }

  if (!taskId) {
    return {
      state: 'active',
      steps: STEPS,
      current: 1,
      detail: 'Maya describes the outcome; the Marketing Agent drafts a blueprint to approve.',
      holdAmbient: true,
    }
  }

  const unblocked = committed.some(
    (event) => event.taskId === taskId && (event.type === 'AccountConnected' || event.type === 'ApprovalGranted'),
  )
  const blocked = task?.blockedOn
  return {
    state: 'active',
    steps: STEPS,
    current: unblocked ? 3 : 2,
    detail: unblocked
      ? 'QuickBooks connected. The run resumes from its checkpoint and delivers.'
      : blocked
        ? `Blocked. Only ${personById.get(blocked.personId)?.name ?? 'one human'} can ${blocked.what.charAt(0).toLowerCase() + blocked.what.slice(1)}.`
        : task
          ? 'Work fans out to Finance, Legal and Support, running in parallel.'
          : 'Blueprint approved. The Summit Launch Agent is spawning under Marketing.',
    holdAmbient: false,
  }
}

const summitLaunch: RehearsalDefinition = {
  id: 'summit-launch',
  ownerId: 'maya',
  command: {
    rehearsal: {
      title: 'Run the launch rehearsal',
      description: 'Run the labeled scripted launch path from interview through delivery',
    },
    live: {
      title: 'Start the live launch',
      description: 'Ask the live Marketing Agent to propose and run a launch worker',
    },
  },
  live: {
    agentId: 'op-marketing',
    prompt: 'I need a dedicated agent to run the Summit Series launch.',
    startedTitle: 'Live launch started',
    startedDetail: 'The request was sent to the Marketing Agent. Follow the live conversation in the Agent Room.',
  },
  run: heroInterviewAuto,
  handleChat: handleSummitChat,
  present,
  onEventsCommitted(events, api) {
    if (events.some((event) => event.type === 'TaskCompleted')) {
      api.toast('Launch prep complete', 'Budget confirmed, claims cleared, FAQs drafted. Replay the launch to watch the whole path again.')
    }
  },
}

export default summitLaunch
