import type { ExecutionMode, GateReport, RuntimeInfo, WorldEvent } from './types'

/** Live is the product default. The scripted dataset requires an explicit URL mode. */
export function executionMode(): ExecutionMode {
  return new URLSearchParams(window.location.search).get('mode') === 'rehearsal'
    ? 'rehearsal'
    : 'live'
}

const locationTarget = (): URL => {
  const url = new URL(window.location.href)
  url.searchParams.delete('backend')
  return url
}

export function showLiveLocation(personId: string): void {
  const url = locationTarget()
  url.searchParams.delete('mode')
  url.searchParams.delete('demo')
  url.searchParams.delete('tour')
  url.searchParams.set('as', personId)
  window.history.replaceState(window.history.state, '', url)
}

export function showRehearsalLocation(rehearsalId: string, personId: string): void {
  const url = locationTarget()
  url.searchParams.set('mode', 'rehearsal')
  url.searchParams.set('demo', rehearsalId)
  url.searchParams.set('as', personId)
  url.searchParams.set('tour', '0')
  window.history.replaceState(window.history.state, '', url)
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

/** Fetch the Go/No-Go gate report from the live server or return null. */
export async function fetchGateReport(): Promise<GateReport | null> {
  const response = await fetch(`${backendUrl()}/preflight`)
  if (!response.ok) return null
  return response.json() as Promise<GateReport>
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
