import { appendFile, mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { DeptMemory, MemoryEntry } from './types.js'

const DEPT_RE = /^[a-z][a-z0-9-]*$/

export function openJsonlMemory(dataDir: string): DeptMemory {
  const dir = join(dataDir, 'memory')
  const chains = new Map<string, Promise<void>>()
  let dirMade = false

  const fileOf = (deptId: string): string => {
    if (!DEPT_RE.test(deptId)) throw new Error(`invalid deptId: ${deptId}`)
    return join(dir, `${deptId}.jsonl`)
  }

  return {
    async append(deptId, role, text) {
      const file = fileOf(deptId)
      const entry: MemoryEntry = { role, text, ts: Date.now() }
      const prev = chains.get(deptId) ?? Promise.resolve()
      const write = prev.then(async () => {
        if (!dirMade) {
          await mkdir(dir, { recursive: true })
          dirMade = true
        }
        await appendFile(file, `${JSON.stringify(entry)}\n`, 'utf8')
      })
      chains.set(deptId, write.catch(() => {}))
      await write
    },
    async read(deptId, limit = 20) {
      const file = fileOf(deptId)
      let raw: string
      try {
        raw = await readFile(file, 'utf8')
      } catch {
        return []
      }
      const entries: MemoryEntry[] = []
      for (const line of raw.split('\n')) {
        try {
          entries.push(JSON.parse(line) as MemoryEntry)
        } catch {}
      }
      entries.sort((a, b) => a.ts - b.ts)
      return entries.slice(-limit)
    },
  }
}
