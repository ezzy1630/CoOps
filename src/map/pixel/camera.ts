/**
 * Valley camera requests from outside the map (status-bar zoom buttons).
 * A module bus rather than store state: the valley camera is transient,
 * unpersisted, and only one PixelMap instance ever listens.
 */
export type ValleyCameraTarget = { type: 'zoomBy'; factor: number } | { type: 'fit' }

type Listener = (target: ValleyCameraTarget) => void

const listeners = new Set<Listener>()

export function requestValleyCamera(target: ValleyCameraTarget): void {
  for (const listener of listeners) listener(target)
}

export function onValleyCamera(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
