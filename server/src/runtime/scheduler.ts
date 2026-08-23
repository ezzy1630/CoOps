import type { WorldEvent } from '../../../src/types.js'

export interface Step {
  at: number
  e: Omit<WorldEvent, 'id' | 'ts'>
}

export class Scheduler {
  private readonly timers = new Set<NodeJS.Timeout>()

  constructor(private readonly append: (e: Omit<WorldEvent, 'id' | 'ts'>) => Promise<unknown>) {}

  schedule(steps: Step[], baseDelayMs?: number): void {
    const base = baseDelayMs ?? 0
    for (const step of steps) {
      const timer = setTimeout(() => {
        this.timers.delete(timer)
        this.append(step.e).catch(err => this.failTask(step, err))
      }, Math.max(0, base + step.at))
      this.timers.add(timer)
    }
  }

  /** A scheduled exchange whose step cannot be committed must not hang open
   * forever: close the task as failed (best effort — the store may be down). */
  private failTask(step: Step, err: unknown): void {
    console.error('[scheduler] failed to commit scheduled event:', err)
    if (!step.e.taskId) return
    this.append({
      type: 'TaskFailed',
      taskId: step.e.taskId,
      from: { kind: 'system', id: 'runtime' },
      deptFrom: step.e.deptFrom,
      deptTo: step.e.deptTo,
      title: `${step.e.title} — failed`,
      detail: 'The runtime could not commit this step; the task was closed as failed.',
      payload: { reason: 'runtime_error' },
    }).catch(retryErr => console.error('[scheduler] failed to emit TaskFailed:', retryErr))
  }

  clear(): void {
    for (const timer of this.timers) clearTimeout(timer)
    this.timers.clear()
  }
}
