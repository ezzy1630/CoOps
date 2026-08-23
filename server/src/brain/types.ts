import type { WorldEvent } from '../../../src/types.js'
import type { Step } from '../runtime/scheduler.js'

export interface BrainCtx {
  emit(e: Omit<WorldEvent, 'id' | 'ts'>): void
  schedule(steps: Step[], baseDelayMs?: number): void
  cancelTask(taskId: string): void
  worldTasks(): { id: string; title: string; status: string }[]
}

export interface BrainAdapter {
  handle(ctx: BrainCtx, agentId: string, deptId: string, text: string, personId: string): Promise<void>
}
