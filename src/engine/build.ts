import type { AgentDef, BlockedOn, EdgeKind, EventType, Ref, TypedPayload, WorldEvent } from '../types'
import { mkId } from './rng'

export const agentRef = (id: string): Ref => ({ kind: 'agent', id })
export const personRef = (id: string): Ref => ({ kind: 'person', id })
export const systemRef = (id = 'gateway'): Ref => ({ kind: 'system', id })

interface EvArgs {
  type: EventType
  title: string
  detail?: string
  taskId?: string
  from?: Ref
  to?: Ref
  deptFrom?: string
  deptTo?: string
  edge?: EdgeKind
  payload?: TypedPayload
  blockedOn?: BlockedOn
  travelMs?: number
}

/** Build an event without a timestamp; the scheduler stamps `ts` when queuing. */
export const ev = (args: EvArgs): Omit<WorldEvent, 'ts'> => ({ id: mkId('ev'), ...args })

export type Step = { at: number; e: Omit<WorldEvent, 'ts'> }

/** Tiny DSL: a scenario is a list of (offset-ms, event) steps built imperatively. */
export class Script {
  steps: Step[] = []
  private cursor = 0
  /** advance the cursor and add an event at it */
  then(delayMs: number, e: Omit<WorldEvent, 'ts'>) {
    this.cursor += delayMs
    this.steps.push({ at: this.cursor, e })
    return this
  }
  /** add an event at the current cursor without advancing (parallel beat) */
  also(e: Omit<WorldEvent, 'ts'>, offset = 0) {
    this.steps.push({ at: this.cursor + offset, e })
    return this
  }
  get length() {
    return this.cursor
  }
}

export const spawnedAgent = (def: AgentDef, bornAt?: number): AgentDef => ({ ...def, bornAt })
