import { appendFile, mkdir } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import { join } from 'node:path'
import type { WorldEvent } from '../../src/types.js'
import { newId } from './ids.js'

type AppendInput = Omit<WorldEvent, 'id' | 'ts'> & Partial<Pick<WorldEvent, 'id' | 'ts'>>

export class EventStore {
  private readonly events: WorldEvent[] = []
  private readonly byId = new Map<string, WorldEvent>()
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
    try {
      const stream = createReadStream(store.file, { encoding: 'utf8' })
      const rl = createInterface({ input: stream, crlfDelay: Infinity })
      for await (const line of rl) {
        if (!line.trim()) continue
        try {
          const ev = JSON.parse(line) as WorldEvent
          store.events.push(ev)
          store.byId.set(ev.id, ev)
        } catch {}
      }
      store.events.sort((a, b) => (a.ts !== b.ts ? a.ts - b.ts : a.id.localeCompare(b.id)))
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error('[store] error reading events:', err)
      }
    }
    return store
  }

  all(): WorldEvent[] {
    return [...this.events]
  }

  count(): number {
    return this.events.length
  }

  get(id: string): WorldEvent | undefined {
    return this.byId.get(id)
  }

  hasResolution(reasonId: string): boolean {
    for (let i = this.events.length - 1; i >= 0; i--) {
      if (this.events[i].payload?.reason === reasonId) return true
    }
    return false
  }

  append(input: AppendInput): Promise<WorldEvent> {
    const event: WorldEvent = { ...input, id: input.id ?? newId('evt'), ts: input.ts ?? Date.now() }
    const write = this.chain.then(() => appendFile(this.file, `${JSON.stringify(event)}\n`, 'utf8'))
    this.chain = write.catch(err => {
      console.error('[store] append failure:', err)
    })
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
    this.byId.set(e.id, e)
  }
}
