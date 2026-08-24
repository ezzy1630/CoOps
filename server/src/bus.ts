export class Bus<T> {
  private listeners = new Set<(e: T) => void>()

  subscribe(fn: (e: T) => void): () => void {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  publish(e: T): void {
    for (const fn of this.listeners) {
      try {
        fn(e)
      } catch (err) {
        console.error('[bus] listener error:', err)
      }
    }
  }
}
