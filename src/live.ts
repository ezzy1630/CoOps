import type { WorldEvent } from './types'

export function liveEnabled(): boolean {
  return new URLSearchParams(window.location.search).get('backend') === 'live'
}

export function backendUrl(): string {
  return import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:8080'
}

export function connectLive(onEvent: (e: WorldEvent) => void): () => void {
  const source = new EventSource(`${backendUrl()}/events`)
  source.onmessage = (msg) => onEvent(JSON.parse(msg.data) as WorldEvent)
  return () => source.close()
}
