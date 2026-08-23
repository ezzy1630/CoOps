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

const navigationTarget = (): URL => {
  const url = new URL(window.location.href)
  url.searchParams.delete('backend')
  return url
}

export function openLive(personId: string): void {
  const url = navigationTarget()
  url.searchParams.delete('mode')
  url.searchParams.delete('demo')
  url.searchParams.delete('tour')
  url.searchParams.set('as', personId)
  window.location.assign(url)
}

export function openRehearsal(rehearsalId: string, personId: string): void {
  const url = navigationTarget()
  url.searchParams.set('mode', 'rehearsal')
  url.searchParams.set('demo', rehearsalId)
  url.searchParams.set('as', personId)
  url.searchParams.set('tour', '0')
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
