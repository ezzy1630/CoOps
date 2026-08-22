import type { AgentStatus, EventType } from '../types'

/**
 * One-word status for a node. The task *title* lives on the travelling
 * envelope; repeating it under both endpoints put three copies of the same
 * string on screen, so nodes say what they are doing instead. Shared by every
 * map style so both visualizations speak the same vocabulary.
 */
export const ACTING_WORD: Partial<Record<EventType, string>> = {
  TaskRequest: 'requesting',
  TaskAccepted: 'accepted',
  DelegatedTo: 'delegating',
  StatusUpdate: 'working',
  ToolCall: 'using tools',
  ArtifactDelivered: 'delivering',
  PermissionRequest: 'awaiting access',
  AuthRequired: 'awaiting access',
  Escalation: 'escalated',
  GuardrailBlock: 'blocked',
  BlueprintProposed: 'drafting spec',
  Chat: 'replying',
}
export const RECEIVING_WORD: Partial<Record<EventType, string>> = {
  TaskRequest: 'starting',
  TaskAccepted: 'waiting',
  DelegatedTo: 'assigned',
  StatusUpdate: 'reviewing',
  ArtifactDelivered: 'reviewing',
  Escalation: 'reviewing',
  Chat: 'reading',
}
export const statusWord = (
  status: AgentStatus,
  last: { type: EventType; acting: boolean } | undefined,
): string => {
  if (status === 'blocked') return 'blocked'
  if (!last) return 'working'
  return (last.acting ? ACTING_WORD[last.type] : RECEIVING_WORD[last.type]) ?? 'working'
}
