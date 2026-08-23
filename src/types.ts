// ─── Core identifiers ────────────────────────────────────────────────────────

export type DeptId = string
export type AgentId = string
export type PersonId = string
export type TaskId = string
export type ToolId = string
export type EventId = string

export interface Ref {
  kind: 'agent' | 'person' | 'system'
  id: string
}

// ─── Org model ───────────────────────────────────────────────────────────────

export interface Department {
  id: DeptId
  name: string
  blurb: string
  leadId: PersonId
}

export interface Person {
  id: PersonId
  name: string
  role: string
  deptId: DeptId
  initials: string
  hue: number // avatar hue
  owns: string[] // human-readable owned resources / approval rights
}

export interface Tool {
  id: ToolId
  name: string
  kind: string
  ownerId: PersonId
  deptId: DeptId
  requiresAuth?: boolean
  connected?: boolean
}

export type AgentKind = 'operator' | 'worker'

export interface AgentDef {
  id: AgentId
  name: string
  deptId: DeptId
  kind: AgentKind
  purpose: string
  skills: string[]
  toolIds: ToolId[]
  ownerId: PersonId
  /** virtual ts the agent came into existence; undefined = since company setup */
  bornAt?: number
}

// ─── Events (the system of record) ───────────────────────────────────────────

export type EdgeKind = 'task' | 'artifact' | 'permission' | 'escalation'

export type EventType =
  | 'TaskRequest'
  | 'TaskAccepted'
  | 'StatusUpdate'
  | 'ArtifactDelivered'
  | 'PermissionRequest'
  | 'AuthRequired'
  | 'Escalation'
  | 'TaskCompleted'
  | 'TaskFailed'
  | 'GuardrailBlock'
  | 'ApprovalGranted'
  | 'AccountConnected'
  | 'DelegatedTo'
  | 'ToolCall'
  | 'BlueprintProposed'
  | 'BlueprintApproved'
  | 'AgentSpawned'
  | 'Chat'
  | 'DeptAdded'
  | 'DeptRemoved'

export interface BlockedOn {
  what: string
  personId: PersonId
  kind: 'auth' | 'approval'
}

export interface TypedPayload {
  objective?: string
  deadline?: string
  sharedContext?: string
  expected?: string
  visibility?: string
  artifact?: { name: string; type: string }
  tool?: string
  action?: string
  reason?: string
  costUsd?: number
  latencyMs?: number
  blueprint?: AgentBlueprint
  agent?: AgentDef
  department?: Department
  text?: string
  author?: Ref
}

export interface WorldEvent {
  id: EventId
  ts: number // virtual epoch ms
  type: EventType
  taskId?: TaskId
  from?: Ref
  to?: Ref
  deptFrom?: DeptId
  deptTo?: DeptId
  /** which visual edge this event travels on (cross-dept only) */
  edge?: EdgeKind
  title: string
  detail?: string
  payload?: TypedPayload
  blockedOn?: BlockedOn
  /** envelope travel time on the map, ms of virtual time */
  travelMs?: number
}

// ─── Blueprint (request-an-agent) ────────────────────────────────────────────

export interface AgentBlueprint {
  name: string
  deptId: DeptId
  purpose: string
  trigger: string
  skills: string[]
  toolIds: ToolId[]
  collaborators: string[]
  approvals: string[]
  limits: string[]
  ownerId: PersonId
}

// ─── Derived world (reduced from the event log) ──────────────────────────────

export type TaskStatus =
  | 'queued'
  | 'running'
  | 'waiting_auth'
  | 'waiting_approval'
  | 'done'
  | 'failed'

export interface Task {
  id: TaskId
  title: string
  objective?: string
  originDept: DeptId
  ownerAgent?: AgentId
  requestedBy?: PersonId
  status: TaskStatus
  createdAt: number
  endedAt?: number
  path: DeptId[]
  eventIds: EventId[]
  artifacts: { name: string; type: string; fromDept?: DeptId }[]
  blockedOn?: BlockedOn
  costUsd: number
}

export type AgentStatus = 'idle' | 'working' | 'blocked'

export interface PendingApproval {
  eventId: EventId
  taskId?: TaskId
  kind: 'auth' | 'approval' | 'blueprint'
  what: string
  personId: PersonId
  requestedBy?: Ref
  deptId?: DeptId
  ts: number
  blueprint?: AgentBlueprint
}

export interface World {
  tasks: Map<TaskId, Task>
  agentStatus: Map<AgentId, AgentStatus>
  agentTask: Map<AgentId, TaskId>
  /** agents alive at this point in time (base + spawned) */
  agents: AgentDef[]
  /** departments alive at this point in time (base + added − removed) */
  departments: Map<DeptId, Department>
  approvals: PendingApproval[]
  /** eventIds of guardrail blocks in the last few seconds (for gateway flash) */
  events: WorldEvent[]
}

// ─── Personas (role-aware entry) ─────────────────────────────────────────────

export interface Persona {
  personId: PersonId
  label: string
  description: string
  entry: 'department' | 'admin' | 'approver'
}

// ─── Map presentation ────────────────────────────────────────────────────────

/** Which visualization renders the live company: drafting-table or pixel-art valley. */
export type MapStyle = 'classic' | 'fun'
