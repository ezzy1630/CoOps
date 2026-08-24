import { artifactEventName, buildArtifactDoc, type ArtifactDoc } from '../data/artifactContent.js'
import { getAgents } from '../data/company.js'
import type { AgentDef, Task, WorldEvent } from '../types.js'
import { readArtifactProvenance, type ArtifactProvenance } from './provenance.js'

export type { ArtifactProvenance } from './provenance.js'

export interface ArtifactLocation {
  provider: 'google-drive' | 'google-sheets' | 'external'
  url: string
  label: string
}

/**
 * The single UI-facing interpretation of an ArtifactDelivered event.
 * Consumers never infer provenance or invent an external action themselves.
 */
export interface ArtifactRecord {
  eventId: string
  name: string
  type: string
  title: string
  label: string
  provenance: ArtifactProvenance
  provenanceLabel: string
  provenanceDetail: string
  source: string | null
  document: ArtifactDoc | null
  location: ArtifactLocation | null
}

interface ArtifactRecordOptions {
  task?: Task
  agents?: AgentDef[]
}

export function readArtifactRecord(
  event: WorldEvent,
  options: ArtifactRecordOptions = {},
): ArtifactRecord {
  if (event.type !== 'ArtifactDelivered') {
    throw new Error(`Expected ArtifactDelivered, received ${event.type}`)
  }

  const artifact = event.payload?.artifact
  const provenance = readArtifactProvenance(event)
  const document = provenance === 'metadata-only'
    ? null
    : buildArtifactDoc(event, {
        task: options.task,
        agents: options.agents ?? getAgents(),
      })
  const name = artifactEventName(event)

  return {
    eventId: event.id,
    name,
    type: artifact?.type ?? 'Document',
    title: document?.title ?? name,
    label: document?.label ?? artifact?.type ?? 'Document',
    provenance,
    provenanceLabel: provenanceLabel(provenance),
    provenanceDetail: provenanceDetail(provenance, artifact?.source),
    source: artifact?.source?.trim() || null,
    document,
    location: readLocation(artifact?.location),
  }
}

function provenanceLabel(provenance: ArtifactProvenance): string {
  switch (provenance) {
    case 'live-content':
      return 'Live content'
    case 'rehearsal-template':
      return 'Rehearsal template'
    case 'metadata-only':
      return 'Metadata only'
  }
}

function provenanceDetail(provenance: ArtifactProvenance, source: string | undefined): string {
  switch (provenance) {
    case 'live-content':
      return source?.trim()
        ? `Content attached by ${source.trim()}.`
        : 'Content attached by the live backend.'
    case 'rehearsal-template':
      return 'Authored sample content from the labeled local rehearsal.'
    case 'metadata-only':
      return 'The live event announced a delivery but attached no readable content.'
  }
}

function readLocation(
  location: NonNullable<NonNullable<WorldEvent['payload']>['artifact']>['location'] | undefined,
): ArtifactLocation | null {
  if (!location) return null
  try {
    const url = new URL(location.url)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    return {
      provider: location.provider,
      url: url.toString(),
      label: location.label?.trim() || locationLabel(location.provider),
    }
  } catch {
    return null
  }
}

function locationLabel(provider: ArtifactLocation['provider']): string {
  switch (provider) {
    case 'google-drive':
      return 'Open in Drive'
    case 'google-sheets':
      return 'Open in Sheets'
    case 'external':
      return 'Open source'
  }
}
