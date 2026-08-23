import type { ExecutionMode, RuntimeInfo, WorldEvent } from './types'

/** Live is the product default. The scripted dataset requires an explicit URL mode. */
export function executionMode(): ExecutionMode {
  return new URLSearchParams(window.location.search).get('mode') === 'rehearsal'
    ? 'rehearsal'
    : 'live'
}

export function liveEnabled(): boolean {
  return executionMode() === 'live'
}

export function switchExecutionMode(mode: ExecutionMode): void {
  const url = new URL(window.location.href)
  if (mode === 'live') url.searchParams.delete('mode')
  else url.searchParams.set('mode', mode)
  url.searchParams.delete('backend')
  window.location.assign(url)
}

export function backendUrl(): string {
  return import.meta.env.VITE_BACKEND_URL
    ?? (import.meta.env.DEV ? window.location.origin : 'http://localhost:8080')
}

export async function fetchRuntimeInfo(): Promise<RuntimeInfo> {
  const response = await fetch(`${backendUrl()}/runtime`)
  if (!response.ok) throw new Error(`Runtime endpoint returned ${response.status}.`)
  return response.json() as Promise<RuntimeInfo>
}

interface LiveCallbacks {
  onOpen(): void
  onError(): void
}

export function connectLive(
  onEvent: (event: WorldEvent) => void,
  personId: string | undefined,
  callbacks: LiveCallbacks,
): () => void {
  const query = personId ? `?personId=${encodeURIComponent(personId)}` : ''
  const source = new EventSource(`${backendUrl()}/events${query}`)
  source.onopen = callbacks.onOpen
  source.onerror = callbacks.onError
  source.onmessage = (message) => onEvent(JSON.parse(message.data) as WorldEvent)
  return () => source.close()
}
