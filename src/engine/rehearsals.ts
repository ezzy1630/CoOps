import type { ExecutionMode, World, WorldEvent } from '../types'
import type { CameraTarget } from '../store'
import type { Step } from './build'

export interface EngineApi {
  emit(e: Omit<WorldEvent, 'ts'> | Omit<WorldEvent, 'ts'>[]): void
  schedule(steps: Step[], baseDelayMs?: number): void
  onResolve(eventId: string, fn: () => void): void
  autoResolve(eventId: string, delayMs: number, personId: string): void
  toast(title: string, detail?: string): void
  requestCamera?(target: CameraTarget): void
}

export interface RehearsalSnapshot {
  log: readonly WorldEvent[]
  scheduled: readonly WorldEvent[]
  world: World
}

export interface RehearsalChatApi extends EngineApi {
  snapshot(): RehearsalSnapshot
  personaId(): string
}

export interface RehearsalChatInput {
  agentId: string
  agentDept: string
  text: string
}

export interface RehearsalPresentation {
  state: 'idle' | 'active' | 'complete'
  steps?: readonly string[]
  /** one-based index into steps */
  current?: number
  detail?: string
  taskId?: string
  replayLabel?: string
  holdAmbient: boolean
}

export interface RehearsalDefinition {
  id: string
  ownerId: string
  command: Record<ExecutionMode, { title: string; description: string }>
  live?: {
    agentId: string
    prompt: string
    startedTitle: string
    startedDetail: string
  }
  run(api: EngineApi, personId: string): void
  handleChat?(api: RehearsalChatApi, input: RehearsalChatInput): boolean
  present(snapshot: RehearsalSnapshot): RehearsalPresentation
  onEventsCommitted?(events: readonly WorldEvent[], api: EngineApi): void
}

const modules = import.meta.glob<{ default: RehearsalDefinition }>('../demos/*/index.ts', { eager: true })
const discovered = Object.entries(modules)
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([, module]) => module.default)

const ids = new Set<string>()
for (const definition of discovered) {
  if (!definition?.id) throw new Error('A rehearsal module exported no id.')
  if (ids.has(definition.id)) throw new Error(`Duplicate rehearsal id: ${definition.id}`)
  ids.add(definition.id)
}

export const rehearsals: readonly RehearsalDefinition[] = Object.freeze(discovered)

export function getRehearsal(id?: string): RehearsalDefinition | undefined {
  if (id === undefined) return rehearsals[0]
  return rehearsals.find((definition) => definition.id === id)
}

export const presentRehearsal = (
  definition: RehearsalDefinition,
  snapshot: RehearsalSnapshot,
): RehearsalPresentation => definition.present(snapshot)

export const eventBelongsTo = (event: WorldEvent, definition: RehearsalDefinition): boolean =>
  event.payload?.rehearsalId === definition.id

export function activeRehearsals(snapshot: RehearsalSnapshot): RehearsalDefinition[] {
  return rehearsals.filter((definition) => definition.present(snapshot).state === 'active')
}

const stamp = (
  id: string,
  event: Omit<WorldEvent, 'ts'>,
): Omit<WorldEvent, 'ts'> => ({
  ...event,
  payload: { ...event.payload, simulated: true, rehearsalId: id },
})

function scopedEngineApi(definition: RehearsalDefinition, api: EngineApi): EngineApi {
  return {
    ...api,
    emit: (event) => api.emit(
      Array.isArray(event)
        ? event.map((item) => stamp(definition.id, item))
        : stamp(definition.id, event),
    ),
    schedule: (steps, baseDelayMs) => api.schedule(
      steps.map((step) => ({ ...step, e: stamp(definition.id, step.e) })),
      baseDelayMs,
    ),
  }
}

export function startRehearsal(
  definition: RehearsalDefinition,
  api: EngineApi,
  personId: string,
): void {
  definition.run(scopedEngineApi(definition, api), personId)
}

export function dispatchRehearsalChat(
  api: RehearsalChatApi,
  input: RehearsalChatInput,
): string | undefined {
  for (const definition of rehearsals) {
    if (!definition.handleChat) continue
    const scoped = { ...scopedEngineApi(definition, api), snapshot: api.snapshot, personaId: api.personaId }
    if (definition.handleChat(scoped, input)) return definition.id
  }
  return undefined
}

export function notifyRehearsals(
  events: readonly WorldEvent[],
  api: EngineApi,
): void {
  for (const definition of rehearsals) {
    const owned = events.filter((event) => eventBelongsTo(event, definition))
    if (owned.length > 0) definition.onEventsCommitted?.(owned, scopedEngineApi(definition, api))
  }
}
