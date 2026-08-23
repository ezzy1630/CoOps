import { Firestore } from '@google-cloud/firestore'
import type { DeptMemory, MemoryEntry } from './types.js'

const DEFAULT_COLLECTION = 'coops-memory'

export function openFirestoreMemory(opts?: {
  projectId?: string
  collectionPrefix?: string
}): DeptMemory {
  let db: Firestore | undefined
  const messagesOf = (deptId: string) => {
    if (!deptId) return null
    db ??= new Firestore(opts?.projectId ? { projectId: opts.projectId } : {})
    const prefix = opts?.collectionPrefix ?? DEFAULT_COLLECTION
    return db.collection(prefix).doc(deptId).collection('messages')
  }

  return {
    async append(deptId, role, text) {
      const messages = messagesOf(deptId)
      if (!messages) return
      await messages.add({ role, text, ts: Date.now() })
    },
    async read(deptId, limit = 20) {
      const messages = messagesOf(deptId)
      if (!messages) return []
      const snap = await messages.orderBy('ts', 'desc').limit(limit).get()
      const entries: MemoryEntry[] = []
      snap.forEach(doc => {
        const data = doc.data() as MemoryEntry
        entries.push({ role: data.role, text: data.text, ts: data.ts })
      })
      return entries.reverse()
    },
  }
}
