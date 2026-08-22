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
        this.append(step.e).catch(err => console.error(err))
      }, Math.max(0, base + step.at))
      this.timers.add(timer)
    }
  }

  clear(): void {
    for (const timer of this.timers) clearTimeout(timer)
    this.timers.clear()
  }
}
