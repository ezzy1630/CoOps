import type { WorldEvent } from '../types.js'

export type ArtifactProvenance = 'live-content' | 'rehearsal-template' | 'metadata-only'

/** Classify a delivery without constructing its potentially large document body. */
export function readArtifactProvenance(event: WorldEvent): ArtifactProvenance {
  if (event.type !== 'ArtifactDelivered') {
    throw new Error(`Expected ArtifactDelivered, received ${event.type}`)
  }
  if (event.payload?.simulated === true) return 'rehearsal-template'
  return event.payload?.artifact?.content?.trim() ? 'live-content' : 'metadata-only'
}
