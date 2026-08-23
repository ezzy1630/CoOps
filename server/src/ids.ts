let counter = 0

export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${(++counter).toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

/** Derives a worker id from a blueprint name, e.g. "Summit Launch Agent" ->
 * "w-summit-launch-agent". `taken` holds ids already in use; colliding names
 * get a numeric suffix so every spawned agent owns its identity. */
export function workerIdFromName(name: string, taken: ReadonlySet<string>): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'agent'
  let id = `w-${slug}`
  let n = 2
  while (taken.has(id)) id = `w-${slug}-${n++}`
  return id
}
