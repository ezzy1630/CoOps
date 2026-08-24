import type { WorldEvent } from '../../types'

/** A failed rehearsal is a terminal boundary; later events belong to a fresh attempt. */
export function currentAttempt(events: readonly WorldEvent[]): WorldEvent[] {
  const latestFailureAt = events.reduce(
    (latest, event) => event.type === 'TaskFailed' ? Math.max(latest, event.ts) : latest,
    Number.NEGATIVE_INFINITY,
  )
  return events.filter((event) => event.ts > latestFailureAt)
}
