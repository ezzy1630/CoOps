import './data/activeCompany'
import { create } from 'zustand'
import type {
  ExecutionMode, GateReport, LiveConnection, MapStyle, PendingApproval, Person, RuntimeInfo, TaskId, World, WorldEvent,
} from './types'
import { getAgents, getDepartments, getPersonas, personById } from './data/company'
import { buildWorld } from './engine/reducer'
import { agentRef, personRef, type Step } from './engine/build'
import {
  ambientRng, buildHistory, nextAmbient, standingApprovalFollowUp,
  SEED_APPROVAL_EVENT_ID, SEED_APPROVAL_TASK_ID,
} from './data/scenarios'
import { between, pick } from './engine/rng'
import { handleChat, type BrainCtx } from './engine/mockBrain'
import {
  activeRehearsals,
  dispatchRehearsalChat,
  eventBelongsTo,
  getRehearsal,
  notifyRehearsals,
  presentRehearsal,
  rehearsals,
  startRehearsal,
  type EngineApi,
  type RehearsalChatApi,
  type RehearsalSnapshot,
} from './engine/rehearsals'
import { buildReplayMapping, replayDuration, type ReplayKnot } from './engine/replay'
import {
  backendUrl,
  connectLive,
  executionMode,
  fetchGateReport,
  fetchRuntimeInfo,
  showLiveLocation,
  showRehearsalLocation,
} from './live'

// ─── Module-level engine internals (not reactive) ───────────────────────────

const continuations = new Map<string, () => void>()
interface AutoResolve { eventId: string; at: number; personId: string }
let autoResolves: AutoResolve[] = []
let rng = ambientRng()
let ambientAt = 0
let presenceAt = 0
let engineStarted = false
let engineStartedAt = 0
let disconnectLive: (() => void) | null = null
let simulatedToastShown = false
const notifySimulated = () => {
  if (simulatedToastShown) return
  simulatedToastShown = true
  useStore.getState().toast('Rehearsal response', 'This reply comes from the labeled local fixture dataset.')
}
/** For the first minute the company runs hot: judges arrive to a moving map. */
const WARMUP_MS = 60_000

// ─── Types ───────────────────────────────────────────────────────────────────

export type PanelKind = 'agent' | 'dept' | 'approvals' | 'activity' | 'diff'
export interface PanelState { kind: PanelKind; id?: string }

/** Top-level view selected in the nav rail. 'map' hosts the contextual slide-overs. */
export type AppView = 'map' | 'approvals' | 'activity' | 'agents' | 'documents'

export const PANEL_WIDTH: Record<PanelKind, number> = {
  agent: 460,
  dept: 460,
  approvals: 560,
  activity: 660,
  diff: 660,
}

export interface Toast { id: number; title: string; detail?: string; kind: 'info' | 'block' | 'human' }
let toastSeq = 0

export type CameraTarget =
  | { type: 'fit' }
  | { type: 'dept'; deptId: string }
  | { type: 'agent'; agentId: string }
  | { type: 'zoomBy'; factor: number }
  | { type: 'frame'; deptIds: string[] }
/** `gentle` marks choreographed (scripted-demo) moves: slower glide, skipped if the user just moved the camera. */
export interface CameraRequest { seq: number; target: CameraTarget; gentle?: boolean }

export interface ReplayState {
  taskId: TaskId
  knots: ReplayKnot[]
  durationMs: number
  wallMs: number
  playing: boolean
}

export interface PresenceMark { personId: string; where: string } // deptId | `approval:${eventId}`

export type Theme = 'light' | 'dark'

// ─── Theme bootstrap (applied once, before first paint of any component) ─────

const applyTheme = (t: Theme) => document.documentElement.classList.toggle('dark', t === 'dark')

const initialTheme = (): Theme => {
  const q = new URLSearchParams(window.location.search).get('theme')
  if (q === 'light' || q === 'dark') return q
  const stored = localStorage.getItem('coops_theme')
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

const theme0 = initialTheme()
applyTheme(theme0)

// ─── Map-style bootstrap (applied beside the theme, before first paint) ──────

const applyMapStyle = (m: MapStyle) => document.documentElement.classList.toggle('fun-mode', m === 'fun')

const initialMapStyle = (): MapStyle =>
  localStorage.getItem('coops_map_style') === 'fun' ? 'fun' : 'classic'

const mapStyle0 = initialMapStyle()
applyMapStyle(mapStyle0)

interface Store {
  // sim
  log: WorldEvent[]
  scheduled: WorldEvent[]
  world: World
  chatPending: Record<string, boolean>
  presence: PresenceMark[]
  executionMode: ExecutionMode
  liveConnection: LiveConnection
  runtimeInfo: RuntimeInfo | null
  runtimeError: string | null
  preflightReport: GateReport | null
  // ui
  persona: Person | null
  entered: boolean
  view: AppView
  panel: PanelState | null
  selectedTaskId: TaskId | null
  highlightEventId: string | null
  artifactEventId: string | null
  replay: ReplayState | null
  paletteOpen: boolean
  firstRunStep: number | null
  toasts: Toast[]
  cameraRequest: CameraRequest
  theme: Theme
  mapStyle: MapStyle
  valleyFilter: 'all' | 'working' | 'attention'
  valleyShowNames: boolean

  // engine
  startEngine(): void
  emit(e: Omit<WorldEvent, 'ts'> | Omit<WorldEvent, 'ts'>[]): void
  schedule(steps: Step[], baseDelayMs?: number): void
  approve(approval: PendingApproval, asPersonId?: string): void
  deny(approval: PendingApproval, asPersonId?: string): void
  runRehearsal(id?: string): void
  sendChat(agentId: string, text: string): void
  retryLive(): void
  openRehearsal(id?: string): void
  enterLive(personId: string): void

  // ui actions
  enter(personId: string): void
  switchPersona(personId: string): void
  setView(view: AppView): void
  openPanel(kind: PanelKind, id?: string): void
  closePanel(): void
  selectTask(taskId: TaskId | null): void
  setHighlight(eventId: string | null): void
  openArtifact(eventId: string): void
  closeArtifact(): void
  startReplay(taskId: TaskId): void
  setReplayWall(wallMs: number): void
  toggleReplayPlay(): void
  exitReplay(): void
  setPaletteOpen(open: boolean): void
  toggleTheme(): void
  setMapStyle(style: MapStyle): void
  setValleyFilter(filter: 'all' | 'working' | 'attention'): void
  setValleyShowNames(show: boolean): void
  setFirstRunStep(step: number | null): void
  requestCamera(target: CameraTarget, opts?: { gentle?: boolean }): void
  toast(title: string, detail?: string, kind?: Toast['kind']): void
  dismissToast(id: number): void
}

type EntryState = Pick<
  Store,
  'persona' | 'entered' | 'view' | 'panel' | 'selectedTaskId' | 'replay' | 'firstRunStep' | 'cameraRequest'
>

const entryState = (persona: Person, onboarded: boolean, cameraSeq: number): EntryState => {
  const role = getPersonas().find((p) => p.personId === persona.id)
  const deptFocused = role?.entry === 'department'
  return {
    persona,
    entered: true,
    view: role?.entry === 'approver' ? 'approvals' : 'map',
    panel: deptFocused ? { kind: 'dept', id: persona.deptId } : null,
    selectedTaskId: null,
    replay: null,
    firstRunStep: onboarded ? null : 0,
    cameraRequest: {
      seq: cameraSeq,
      target: deptFocused
        ? { type: 'dept', deptId: persona.deptId }
        : { type: 'fit' },
    },
  }
}

const initialExecutionMode = executionMode()
const initialParams = new URLSearchParams(window.location.search)
const initialDemoParam = initialParams.get('demo')
const initialDemo = initialExecutionMode === 'rehearsal' && initialDemoParam
  ? getRehearsal(initialDemoParam === '1' ? undefined : initialDemoParam)
  : undefined
const initialPersonId = initialParams.get('as') ?? initialDemo?.ownerId
const initialPersona = initialPersonId ? personById.get(initialPersonId) ?? null : null
const initialOnboarded = localStorage.getItem('coops_onboarded') === '1'
  || initialParams.get('tour') === '0'
  || initialDemo !== undefined
const initialEntry = initialPersona ? entryState(initialPersona, initialOnboarded, 0) : null

const sortByTs = (a: WorldEvent, b: WorldEvent) => a.ts - b.ts

export const useStore = create<Store>()((set, get) => {
  // ── engine api handed to scenario modules ──
  const api: EngineApi = {
    emit: (e) => get().emit(e),
    schedule: (steps, base) => get().schedule(steps, base),
    onResolve: (eventId, fn) => continuations.set(eventId, fn),
    autoResolve: (eventId, delayMs, personId) => {
      autoResolves.push({ eventId, at: Date.now() + delayMs, personId })
    },
    toast: (title, detail) => get().toast(title, detail),
    // choreographed camera moves from scenario scripts: always the gentle profile
    requestCamera: (target) => get().requestCamera(target, { gentle: true }),
  }

  const snapshot = (): RehearsalSnapshot => ({
    log: get().log,
    scheduled: get().scheduled,
    world: get().world,
  })

  const brainCtx = (): BrainCtx & RehearsalChatApi => ({
    ...api,
    emit: (e) => {
      notifySimulated()
      if (Array.isArray(e)) {
        api.emit(e.map((x) => ({ ...x, payload: { ...x.payload, simulated: true } })))
        return
      }
      api.emit({ ...e, payload: { ...e.payload, simulated: true } })
    },
    schedule: (steps, baseDelayMs) => {
      notifySimulated()
      api.schedule(
        steps.map((s) => ({ ...s, e: { ...s.e, payload: { ...s.e.payload, simulated: true } } })),
        baseDelayMs,
      )
    },
    world: () => get().world,
    personaId: () => get().persona?.id ?? 'maya',
    snapshot,
  })

  const rebuild = (log: WorldEvent[]) => buildWorld(getAgents(), getDepartments(), log, Number.MAX_SAFE_INTEGER)

  const receiveLiveEvent = (event: WorldEvent) => {
    if (get().executionMode !== 'live') return
    if (get().log.some((existing) => existing.id === event.id)) return
    const log = [...get().log, event].sort(sortByTs)
    const patch: Partial<Store> = { log, world: rebuild(log) }
    if (event.type === 'Chat' && event.from?.kind === 'agent') {
      patch.chatPending = { ...get().chatPending, [event.from.id]: false }
    }
    set(patch)
  }

  const refreshRuntime = async () => {
    try {
      const runtimeInfo = await fetchRuntimeInfo()
      if (get().executionMode !== 'live') return
      set({ runtimeInfo, runtimeError: null })
    } catch (error) {
      if (get().executionMode !== 'live') return
      set({ runtimeInfo: null, runtimeError: error instanceof Error ? error.message : String(error) })
    }
  }

  const refreshGateReport = async () => {
    try {
      const preflightReport = await fetchGateReport()
      if (get().executionMode !== 'live') return
      set({ preflightReport })
    } catch {
      // preflight is optional; silence failures
    }
  }

  const openLiveConnection = (personId: string) => {
    disconnectLive?.()
    set({ liveConnection: 'connecting' })
    void refreshRuntime()
    void refreshGateReport()
    disconnectLive = connectLive(receiveLiveEvent, personId, {
      onOpen: () => {
        if (get().executionMode === 'live') set({ liveConnection: 'connected' })
      },
      onError: () => {
        if (get().executionMode === 'live') set({ liveConnection: 'disconnected' })
      },
    })
  }

  const resetRehearsalRuntime = () => {
    disconnectLive?.()
    disconnectLive = null
    continuations.clear()
    autoResolves = []
    simulatedToastShown = false
    rng = ambientRng()

    const t0 = Date.now()
    engineStartedAt = t0
    ambientAt = t0 + 9000
    presenceAt = t0 + 900
    const log = buildHistory(t0).sort(sortByTs)
    set({
      executionMode: 'rehearsal',
      liveConnection: 'idle',
      runtimeInfo: null,
      runtimeError: null,
      preflightReport: null,
      log,
      scheduled: [],
      world: rebuild(log),
      chatPending: {},
      presence: [],
    })

    for (const delay of [1000, 5000]) {
      const { steps } = nextAmbient(rng)
      get().schedule(steps, delay)
    }
    continuations.set(SEED_APPROVAL_EVENT_ID, () => get().schedule(standingApprovalFollowUp()))
  }

  const tick = () => {
    const now = Date.now()
    const s = get()

    // 1. commit due events
    if (s.scheduled.length > 0 && s.scheduled[0].ts <= now) {
      const due: WorldEvent[] = []
      const rest: WorldEvent[] = []
      for (const e of s.scheduled) (e.ts <= now ? due : rest).push(e)
      const log = [...s.log, ...due].sort(sortByTs)
      const chatPending = { ...s.chatPending }
      for (const e of due) {
        if (e.type === 'Chat' && e.from?.kind === 'agent') chatPending[e.from.id] = false
      }
      set({ log, scheduled: rest, world: rebuild(log), chatPending })
      notifyRehearsals(due, api)
      if (s.entered) {
        // While an authored rehearsal holds the stage, the toast lane belongs to it.
        // story. Ambient events still commit and still animate on the map — they
        // just stop narrating over the beat (an ambient "Model Armor blocked
        // content" landing next to the demo's own guardrail beat read as a bug).
        const active = activeRehearsals(snapshot())
        for (const e of due) {
          if (active.length > 0 && !active.some((definition) => eventBelongsTo(e, definition))) continue
          if (e.type === 'AuthRequired' && e.blockedOn) {
            const p = personById.get(e.blockedOn.personId)
            get().toast(`Blocked: ${e.blockedOn.what}`, `Only ${p?.name ?? 'its owner'} can unblock this. The map shows the dotted line.`, 'human')
          } else if (e.type === 'GuardrailBlock') {
            get().toast(e.title, e.detail, 'block')
          } else if (e.type === 'AgentSpawned') {
            get().toast('New agent on the map', e.detail)
          }
        }
      }
    }

    // 2. simulated humans act on stale approvals (presence first, then the click)
    const world = get().world
    if (s.executionMode === 'rehearsal') {
      const stillPending = new Set(world.approvals.map((a) => a.eventId))
      const dueAutoResolves: AutoResolve[] = []
      autoResolves = autoResolves.filter((ar) => {
        if (!stillPending.has(ar.eventId)) {
          // either resolved by the judge, or not yet committed — keep if not yet in world
          return !get().log.some((e) => e.id === ar.eventId) ? true : false
        }
        if (now >= ar.at) {
          dueAutoResolves.push(ar)
          return false
        }
        if (now >= ar.at - 9000) {
          const where = `approval:${ar.eventId}`
          if (!get().presence.some((p) => p.where === where)) {
            set({ presence: [...get().presence, { personId: ar.personId, where }] })
          }
        }
        return true
      })
      for (const ar of dueAutoResolves) {
        const approval = get().world.approvals.find((a) => a.eventId === ar.eventId)
        if (approval) get().approve(approval, ar.personId)
      }
    }

    // 3. ambient life — hot for the first minute (arrivals must see a moving
    //    map), then it settles; and held entirely during the demo's quiet beats
    if (s.executionMode === 'rehearsal') {
      const holdAmbient = rehearsals.some((definition) => presentRehearsal(definition, snapshot()).holdAmbient)
      if (holdAmbient) {
        // the interview and the blueprint are conversations: no new work starts
        ambientAt = Math.max(ambientAt, now + 1500)
      } else if (now >= ambientAt) {
        const warm = now - engineStartedAt < WARMUP_MS
        // the standing approval never resolves on its own — it must not eat a slot
        const activeCount = [...world.tasks.values()].filter(
          (t) => t.id !== SEED_APPROVAL_TASK_ID && t.status !== 'done' && t.status !== 'failed',
        ).length
        if (activeCount < (warm ? 6 : 4)) {
          const { steps, lengthMs } = nextAmbient(rng)
          get().schedule(steps, 800)
          // warm: pace off the *start* of this exchange, so two or three envelopes
          // overlap in flight. settled: wait for it to finish, then a long beat.
          ambientAt = now + (warm ? between(rng, 3000, 9000) : lengthMs + between(rng, 16_000, 34_000))
        } else {
          ambientAt = now + (warm ? 4000 : 12_000)
        }
      }
    }

    // 4. presence — live mode mirrors who is actually connected (GET /presence);
    //    sim mode rotates a synthetic cast around the map
    if (now >= presenceAt) {
      if (s.executionMode === 'live') {
        presenceAt = now + 5000
        void fetch(`${backendUrl()}/presence`)
          .then((res) => res.json() as Promise<{ people: { personId: string; since: number }[] }>)
          .then(({ people }) => {
            if (get().executionMode !== 'live') return
            set({
              presence: people.flatMap((p): PresenceMark[] => {
                const where = personById.get(p.personId)?.deptId
                return where ? [{ personId: p.personId, where }] : []
              }),
            })
          })
          .catch(() => {})
      } else {
        const personaId = get().persona?.id
        const simPool = ['sofia', 'ethan', 'leo', 'grace', 'sam', 'nina', 'avery', 'maya', 'dana'].filter((p) => p !== personaId)
        const depts = ['marketing', 'finance', 'legal', 'support', 'operations', 'hr']
        const roaming: PresenceMark[] = []
        const n = 2 + Math.floor(rng() * 2)
        for (let i = 0; i < n; i++) {
          const person = pick(rng, simPool)
          if (!roaming.some((r) => r.personId === person)) {
            roaming.push({ personId: person, where: pick(rng, depts) })
          }
        }
        const approvalsMarks = get().presence.filter((p) => p.where.startsWith('approval:'))
        set({ presence: [...roaming, ...approvalsMarks] })
        presenceAt = now + between(rng, 11_000, 21_000)
      }
    }
  }

  const startEngineLoop = (): boolean => {
    if (engineStarted) return false
    engineStarted = true
    setInterval(tick, 300)
    return true
  }

  const postLiveDecision = async (
    approval: PendingApproval,
    personId: string,
    decision: 'approve' | 'deny',
    successTitle: string,
    successDetail?: string,
  ): Promise<void> => {
    try {
      const response = await fetch(`${backendUrl()}/approvals/${approval.eventId}/decision`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ personId, decision }),
      })
      if (get().executionMode !== 'live') return
      if (!response.ok) {
        const payload: unknown = await response.json().catch(() => null)
        const message = typeof payload === 'object'
          && payload !== null
          && 'error' in payload
          && typeof payload.error === 'string'
          ? payload.error
          : `The backend returned ${response.status}.`
        get().toast('Decision not saved', message, 'block')
        return
      }
      set({ presence: get().presence.filter((p) => p.where !== `approval:${approval.eventId}`) })
      get().toast(successTitle, successDetail, 'human')
    } catch {
      if (get().executionMode !== 'live') return
      get().toast('Backend unreachable', `Could not reach ${backendUrl()}`, 'block')
    }
  }

  return {
    log: [],
    scheduled: [],
    world: rebuild([]),
    chatPending: {},
    presence: [],
    executionMode: initialExecutionMode,
    liveConnection: 'idle',
    runtimeInfo: null,
    runtimeError: null,
    preflightReport: null,

    persona: initialEntry?.persona ?? null,
    entered: initialEntry?.entered ?? false,
    view: initialEntry?.view ?? 'map',
    panel: initialEntry?.panel ?? null,
    selectedTaskId: initialEntry?.selectedTaskId ?? null,
    highlightEventId: null,
    artifactEventId: null,
    replay: initialEntry?.replay ?? null,
    paletteOpen: false,
    firstRunStep: initialEntry?.firstRunStep ?? null,
    toasts: [],
    cameraRequest: initialEntry?.cameraRequest ?? { seq: 0, target: { type: 'fit' } },
    theme: theme0,
    mapStyle: mapStyle0,
    valleyFilter: 'all',
    valleyShowNames: false,

    startEngine() {
      if (!startEngineLoop()) return
      if (get().executionMode === 'live') {
        openLiveConnection(get().persona?.id ?? 'maya')
        return
      }
      resetRehearsalRuntime()
    },

    emit(e) {
      const now = Date.now()
      const arr = (Array.isArray(e) ? e : [e]).map((x, i) => ({ ...x, ts: now + i }))
      const log = [...get().log, ...arr].sort(sortByTs)
      set({ log, world: rebuild(log) })
    },

    schedule(steps, baseDelayMs = 0) {
      const base = Date.now() + baseDelayMs
      const add = steps.map((s) => ({ ...s.e, ts: base + s.at }))
      set({ scheduled: [...get().scheduled, ...add].sort(sortByTs) })
    },

    approve(approval, asPersonId) {
      const by = asPersonId ?? approval.personId
      if (get().executionMode === 'live') {
        const title = approval.kind === 'auth' ? `${approval.what}: connected`
          : approval.kind === 'blueprint' ? `${approval.blueprint?.name ?? 'Agent'}: blueprint approved`
            : `${approval.what}: approved`
        void postLiveDecision(
          approval,
          by,
          'approve',
          title,
          approval.kind === 'auth' ? 'The run resumes from its checkpoint.' : undefined,
        )
        return
      }
      const person = personById.get(by)
      const typeMap = { auth: 'AccountConnected', approval: 'ApprovalGranted', blueprint: 'BlueprintApproved' } as const
      const titleMap = {
        auth: `${approval.what}: connected`,
        approval: `${approval.what}: approved`,
        blueprint: `${approval.blueprint?.name ?? 'Agent'}: blueprint approved`,
      }
      const detailMap = {
        auth: `${person?.name} completed the OAuth flow. The agent received a scoped capability; the raw credential never left the vault.`,
        approval: `Approved by ${person?.name}.`,
        blueprint: `${person?.name} approved the blueprint. Creating the worker profile in the shared runtime.`,
      }
      get().emit({
        ...{
          id: `res_${approval.eventId}`,
          type: typeMap[approval.kind],
          taskId: approval.taskId,
          from: personRef(by),
          to: approval.requestedBy ?? agentRef('op-marketing'),
          deptFrom: approval.deptId,
          deptTo: approval.deptId,
          title: titleMap[approval.kind],
          detail: detailMap[approval.kind],
          payload: {
            reason: approval.eventId,
            rehearsalId: approval.rehearsalId,
            ...(approval.rehearsalId ? { simulated: true } : {}),
          },
        },
      })
      // presence mark for this approval is done
      set({ presence: get().presence.filter((p) => p.where !== `approval:${approval.eventId}`) })
      const fn = continuations.get(approval.eventId)
      if (fn) {
        continuations.delete(approval.eventId)
        fn()
      }
      autoResolves = autoResolves.filter((ar) => ar.eventId !== approval.eventId)
      get().toast(titleMap[approval.kind], approval.kind === 'auth' ? 'The run resumes from its checkpoint.' : undefined, 'human')
    },

    deny(approval, asPersonId) {
      const by = asPersonId ?? approval.personId
      const title = approval.kind === 'blueprint'
        ? `${approval.blueprint?.name ?? 'Agent'}: rejected`
        : `${approval.what}: denied`
      if (get().executionMode === 'live') {
        void postLiveDecision(approval, by, 'deny', title, 'The task is closed as failed.')
        return
      }
      const person = personById.get(by)
      get().emit({
        id: `res_${approval.eventId}`,
        type: 'TaskFailed',
        taskId: approval.taskId,
        from: personRef(by),
        to: approval.requestedBy ?? agentRef('op-marketing'),
        deptFrom: approval.deptId,
        deptTo: approval.deptId,
        title,
        detail: `Denied by ${person?.name ?? by}. The task is closed as failed.`,
        payload: {
          reason: approval.eventId,
          rehearsalId: approval.rehearsalId,
          ...(approval.rehearsalId ? { simulated: true } : {}),
        },
      })
      set({ presence: get().presence.filter((p) => p.where !== `approval:${approval.eventId}`) })
      continuations.delete(approval.eventId)
      autoResolves = autoResolves.filter((ar) => ar.eventId !== approval.eventId)
      get().toast(title, 'The task is closed as failed.', 'human')
    },

    runRehearsal(id) {
      const definition = getRehearsal(id)
      if (!definition) return
      if (get().executionMode === 'live') {
        get().openRehearsal(definition.id)
        return
      }
      const presentation = presentRehearsal(definition, snapshot())
      if (presentation.state !== 'idle') {
        get().toast(
          presentation.state === 'complete' ? 'Rehearsal complete' : 'Rehearsal already running',
          presentation.state === 'complete'
            ? 'Select its task and replay the path.'
            : 'Watch the map or open the coordinating agent to follow along.',
        )
        return
      }
      startRehearsal(definition, api, definition.ownerId)
      if (definition.focusAgentId) get().openPanel('agent', definition.focusAgentId)
      get().toast('Rehearsal started', definition.command.rehearsal.description)
    },

    sendChat(agentId, text) {
      const personaId = get().persona?.id ?? 'maya'
      if (get().executionMode === 'live') {
        set({ chatPending: { ...get().chatPending, [agentId]: true } })
        void fetch(`${backendUrl()}/chat`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ agentId, text, personId: personaId }),
        }).then(async (response) => {
          if (get().executionMode !== 'live') return
          if (response.ok) return
          const payload: unknown = await response.json().catch(() => null)
          const detail = typeof payload === 'object'
            && payload !== null
            && 'error' in payload
            && typeof payload.error === 'string'
            ? payload.error
            : `The backend returned ${response.status}.`
          set({ chatPending: { ...get().chatPending, [agentId]: false } })
          get().toast('Message not sent', detail, 'block')
        }).catch(() => {
          if (get().executionMode !== 'live') return
          set({ chatPending: { ...get().chatPending, [agentId]: false } })
          get().toast('Backend unreachable', `Could not reach ${backendUrl()}`, 'block')
        })
        return
      }
      const agent = get().world.agents.find((candidate) => candidate.id === agentId)
      const ctx = brainCtx()
      const rehearsalId = dispatchRehearsalChat(ctx, {
        agentId,
        agentDept: agent?.deptId ?? 'marketing',
        text,
      })
      get().emit({
        id: `chat_${Date.now()}_${Math.round(Math.random() * 1e6)}`,
        type: 'Chat',
        from: personRef(personaId),
        to: agentRef(agentId),
        title: text,
        payload: {
          text,
          ...(rehearsalId ? { rehearsalId, simulated: true } : {}),
        },
      })
      set({ chatPending: { ...get().chatPending, [agentId]: true } })
      if (!rehearsalId) handleChat(ctx, agentId, agent?.deptId ?? 'marketing', text)
    },

    retryLive() {
      if (get().executionMode !== 'live') return
      openLiveConnection(get().persona?.id ?? 'maya')
    },

    openRehearsal(id) {
      const definition = getRehearsal(id)
      const persona = definition ? personById.get(definition.ownerId) : undefined
      if (!definition || !persona) return

      startEngineLoop()
      showRehearsalLocation(definition.id, definition.ownerId)
      localStorage.setItem('coops_onboarded', '1')
      resetRehearsalRuntime()
      set({
        ...entryState(persona, true, get().cameraRequest.seq + 1),
        highlightEventId: null,
        artifactEventId: null,
        paletteOpen: false,
        toasts: [],
      })
      startRehearsal(definition, api, definition.ownerId)
      if (definition.focusAgentId) get().openPanel('agent', definition.focusAgentId)
      get().toast('Rehearsal started', definition.command.rehearsal.description)
    },

    enterLive(personId) {
      showLiveLocation(personId)
      get().enter(personId)
    },

    enter(personId) {
      const persona = personById.get(personId) ?? null
      if (!persona) return
      const onboarded = localStorage.getItem('coops_onboarded') === '1'
      set(entryState(persona, onboarded, get().cameraRequest.seq + 1))
      if (get().executionMode === 'live' && engineStarted) openLiveConnection(personId)
    },

    switchPersona(personId) {
      set({ view: 'map', panel: null, selectedTaskId: null, replay: null })
      get().enter(personId)
    },

    setView(view) {
      set({ view, panel: null })
    },
    openPanel(kind, id) {
      if (kind === 'approvals' || kind === 'activity') {
        set({ view: kind, panel: null })
        return
      }
      set({ view: 'map', panel: { kind, id } })
    },
    closePanel() {
      set({ panel: null })
    },
    selectTask(taskId) {
      set({ selectedTaskId: taskId, replay: taskId === get().replay?.taskId ? get().replay : null })
    },
    setHighlight(eventId) {
      set({ highlightEventId: eventId })
    },
    openArtifact(eventId) {
      set({ artifactEventId: eventId })
    },
    closeArtifact() {
      set({ artifactEventId: null })
    },

    startReplay(taskId) {
      const t = get().world.tasks.get(taskId)
      if (!t) return
      const evs = get().log.filter((e) => e.taskId === taskId)
      const knots = buildReplayMapping(evs)
      set({
        replay: { taskId, knots, durationMs: replayDuration(knots), wallMs: 0, playing: true },
        selectedTaskId: taskId,
      })
      // a replay used to run wherever the camera happened to be pointing, so
      // cross-department legs could play off-screen. Frame what the task crossed.
      get().requestCamera({ type: 'frame', deptIds: t.path }, { gentle: true })
    },
    setReplayWall(wallMs) {
      const r = get().replay
      if (r) set({ replay: { ...r, wallMs: Math.max(0, Math.min(wallMs, r.durationMs)) } })
    },
    toggleReplayPlay() {
      const r = get().replay
      if (r) set({ replay: { ...r, playing: !r.playing, wallMs: r.wallMs >= r.durationMs ? 0 : r.wallMs } })
    },
    exitReplay() {
      set({ replay: null })
    },

    setPaletteOpen(open) {
      set({ paletteOpen: open })
    },
    toggleTheme() {
      const t: Theme = get().theme === 'dark' ? 'light' : 'dark'
      localStorage.setItem('coops_theme', t)
      applyTheme(t)
      set({ theme: t })
    },
    setMapStyle(style) {
      localStorage.setItem('coops_map_style', style)
      applyMapStyle(style)
      set({ mapStyle: style })
    },
    setValleyFilter(filter) {
      set({ valleyFilter: filter })
    },
    setValleyShowNames(show) {
      set({ valleyShowNames: show })
    },
    setFirstRunStep(step) {
      if (step === null) localStorage.setItem('coops_onboarded', '1')
      set({ firstRunStep: step })
    },
    requestCamera(target, opts) {
      set({ cameraRequest: { seq: get().cameraRequest.seq + 1, target, gentle: opts?.gentle } })
    },

    toast(title, detail, kind = 'info') {
      const id = ++toastSeq
      set({ toasts: [...get().toasts.slice(-2), { id, title, detail, kind }] })
      setTimeout(() => get().dismissToast(id), 6500)
    },
    dismissToast(id) {
      set({ toasts: get().toasts.filter((t) => t.id !== id) })
    },
  }
})

// dev-only handle for demo rehearsal and scripted driving
if (import.meta.env.DEV) {
  ;(window as unknown as { coops: typeof useStore }).coops = useStore
}
