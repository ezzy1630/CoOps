import { readArtifactProvenance } from '../artifacts/provenance.js'
import type {
  ExecutionMode,
  LiveConnection,
  RuntimeInfo,
  Task,
  WorldEvent,
} from '../types.js'

export interface RunEvidence {
  runtime: string
  runtimeDetail: string
  events: number
  tasks: number
  activeTasks: number
  tools: number
  humanGates: number
  artifacts: {
    total: number
    live: number
    rehearsal: number
    metadataOnly: number
  }
  guardrails: number
}

interface RunEvidenceInput {
  events: WorldEvent[]
  tasks: Task[]
  executionMode: ExecutionMode
  liveConnection: LiveConnection
  runtimeInfo: RuntimeInfo | null
}

/** One read model for every frontend summary of a run. */
export function readRunEvidence({
  events,
  tasks,
  executionMode,
  liveConnection,
  runtimeInfo,
}: RunEvidenceInput): RunEvidence {
  const artifacts = events
    .filter((event) => event.type === 'ArtifactDelivered')
    .map((event) => readArtifactProvenance(event))

  return {
    runtime: runtimeLabel(executionMode, liveConnection, runtimeInfo),
    runtimeDetail: runtimeDetail(executionMode, liveConnection, runtimeInfo),
    events: events.length,
    tasks: tasks.length,
    activeTasks: tasks.filter((task) => task.status === 'running').length,
    tools: events.filter((event) => event.type === 'ToolCall').length,
    humanGates: events.filter(isHumanGate).length,
    artifacts: {
      total: artifacts.length,
      live: artifacts.filter((provenance) => provenance === 'live-content').length,
      rehearsal: artifacts.filter((provenance) => provenance === 'rehearsal-template').length,
      metadataOnly: artifacts.filter((provenance) => provenance === 'metadata-only').length,
    },
    guardrails: events.filter((event) => event.type === 'GuardrailBlock').length,
  }
}

function isHumanGate(event: WorldEvent): boolean {
  return event.type === 'AuthRequired'
    || event.type === 'PermissionRequest'
    || event.type === 'BlueprintProposed'
}

function runtimeLabel(
  executionMode: ExecutionMode,
  liveConnection: LiveConnection,
  runtimeInfo: RuntimeInfo | null,
): string {
  if (executionMode === 'rehearsal') return 'Local rehearsal'
  if (liveConnection !== 'connected') return 'Live backend offline'
  if (runtimeInfo?.brain !== 'gemini') return 'Backend mock fixture'
  return runtimeInfo.model === 'gemini-3.7-flash'
    ? 'Gemini 3.7 Flash'
    : runtimeInfo.model ?? 'Gemini'
}

function runtimeDetail(
  executionMode: ExecutionMode,
  liveConnection: LiveConnection,
  runtimeInfo: RuntimeInfo | null,
): string {
  if (executionMode === 'rehearsal') return 'Scripted local dataset'
  if (liveConnection !== 'connected') return 'No scripted fallback'
  if (!runtimeInfo) return 'Runtime details loading'
  return `${label(runtimeInfo.memory)} / ${label(runtimeInfo.guardrail)} / ${label(runtimeInfo.workspace)}`
}

function label(value: string): string {
  return value
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}
