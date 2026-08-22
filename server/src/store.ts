import { appendFile, mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { WorldEvent } from '../../src/types.js'
import { newId } from './ids.js'

type AppendInput = Omit<WorldEvent, 'id' | 'ts'> & Partial<Pick<WorldEvent, 'id' | 'ts'>>

export class EventStore {
  private readonly events: WorldEvent[] = []
  private readonly file: string
  private readonly onUpdate?: (e: WorldEvent) => void
  private chain: Promise<unknown> = Promise.resolve()

  private constructor(dataDir: string, onUpdate?: (e: WorldEvent) => void) {
    this.file = join(dataDir, 'events.jsonl')
    this.onUpdate = onUpdate
  }

  static async open(dataDir: string, onUpdate?: (e: WorldEvent) => void): Promise<EventStore> {
    const store = new EventStore(dataDir, onUpdate)
    await mkdir(dataDir, { recursive: true })
    let raw: string
    try {
      raw = await readFile(store.file, 'utf8')
    } catch {
      return store
    }
    for (const line of raw.split('\n')) {
      try {
        store.insert(JSON.parse(line) as WorldEvent)
      } catch {}
    }
    return store
  }

  all(): WorldEvent[] {
    return [...this.events]
  }

  get(id: string): WorldEvent | undefined {
    return this.events.find(e => e.id === id)
  }

  append(input: AppendInput): Promise<WorldEvent> {
    const event: WorldEvent = { ...input, id: input.id ?? newId('evt'), ts: input.ts ?? Date.now() }
    const write = this.chain.then(() => appendFile(this.file, `${JSON.stringify(event)}\n`, 'utf8'))
    this.chain = write
    return write.then(() => {
      this.insert(event)
      this.onUpdate?.(event)
      return event
    })
  }

  private insert(e: WorldEvent): void {
    let lo = 0
    let hi = this.events.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      const cur = this.events[mid]
      if (cur.ts < e.ts || (cur.ts === e.ts && cur.id < e.id)) lo = mid + 1
      else hi = mid
    }
    this.events.splice(lo, 0, e)
  }
}
