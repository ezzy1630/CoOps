import type { RehearsalDefinition, RehearsalPresentation, RehearsalSnapshot } from '../../engine/rehearsals'
import { currentAttempt } from './attempt'
import { handleHorseChat } from './chat'
import { horseInterviewAuto } from './script'

const STEPS = ['Route', 'Find & stage', 'Approve & publish'] as const

function present(snapshot: RehearsalSnapshot): RehearsalPresentation {
  const allCommitted = snapshot.log.filter((event) => event.payload?.rehearsalId === 'horse-launch')
  const committed = currentAttempt(allCommitted)
  const owned = currentAttempt([
    ...allCommitted,
    ...snapshot.scheduled.filter((event) => event.payload?.rehearsalId === 'horse-launch'),
  ])

  const taskEvent = owned.find((event) => event.type === 'TaskRequest' && event.taskId)
  const taskId = taskEvent?.taskId
  const task = taskId ? snapshot.world.tasks.get(taskId) : undefined

  if (task?.status === 'done') {
    return { state: 'complete', holdAmbient: false }
  }

  const started = owned.some((e) => e.type === 'BlueprintProposed' || e.type === 'Chat')
  if (!started) return { state: 'idle', holdAmbient: false }

  if (!taskId) {
    return {
      state: 'active',
      steps: STEPS,
      current: 1,
      detail: "Maya's request is in; the Marketing Agent drafts the launch blueprint to approve.",
      holdAmbient: true,
    }
  }

  const discovered = owned.some(
    (e) => e.taskId === taskId && e.type === 'ToolCall' && e.payload?.tool === 'Developer Laptop',
  )
  const staged = owned.some(
    (e) => e.taskId === taskId && e.type === 'ToolCall' && e.payload?.tool === 'Cloud Storage',
  )
  const approved = committed.some((e) => e.taskId === taskId && e.type === 'ApprovalGranted')
  const blocked = task?.blockedOn

  return {
    state: 'active',
    steps: STEPS,
    current: approved ? 3 : staged ? 3 : 2,
    detail: approved
      ? 'Publication approved. Publishing to YouTube and closing the provenance chain.'
      : staged || blocked
        ? 'Verified file is staged in Cloud Storage. Waiting for Maya to approve publication.'
        : discovered
          ? 'Discovery manifest verified. Staging the object through Cloud Storage.'
          : 'Routing a scoped request to Engineering. The connector scans only the allow-listed export.',
    holdAmbient: false,
  }
}

const horseLaunch: RehearsalDefinition = {
  id: 'horse-launch',
  ownerId: 'maya',
  focusAgentId: 'op-marketing',
  command: {
    rehearsal: {
      title: 'Run the launch-day rehearsal',
      description: "One request routes to Engineering, verifies Alex's video, stages it, and publishes after approval — every hop receipted (labeled simulated).",
    },
    live: {
      title: 'Start the launch-day demo',
      description: 'Switch to the labeled local rehearsal and run the laptop-to-YouTube path end to end.',
    },
  },
  run: horseInterviewAuto,
  handleChat: handleHorseChat,
  present,
  onEventsCommitted(events, api) {
    if (events.some((event) => event.type === 'TaskCompleted')) {
      api.toast('Launch video delivered', 'Laptop → Cloud Storage → approval → YouTube. Replay the task to inspect every receipt.')
    }
  },
}

export default horseLaunch