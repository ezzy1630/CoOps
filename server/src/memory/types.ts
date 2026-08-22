export interface MemoryEntry { role: 'agent' | 'human' | 'system'; text: string; ts: number }
export interface DeptMemory {
  append(deptId: string, role: MemoryEntry['role'], text: string): Promise<void>
  read(deptId: string, limit?: number): Promise<MemoryEntry[]>
}
