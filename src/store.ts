import { create } from 'zustand'
import type {
  MapStyle, PendingApproval, Person, TaskId, World, WorldEvent,
} from './types'
import { BASE_AGENTS, personById } from './data/company'
import { buildWorld } from './engine/reducer'
import { agentRef, personRef, type Step } from './engine/build'
import {
  ambientRng, buildHistory, nextAmbient, standingApprovalFollowUp,
  SEED_APPROVAL_EVENT_ID, SEED_APPROVAL_TASK_ID,
} from './data/scenarios'
import { between, pick } from './engine/rng'
import { heroInterviewAuto, isHeroEvent, type EngineApi } from './data/hero'
import { handleChat, type BrainCtx } from './engine/mockBrain'
import { buildReplayMapping, replayDuration, type ReplayKnot } from './engine/replay'
import { backendUrl, connectLive, liveEnabled } from './live'

// ─── Module-level engine internals (not reactive) ───────────────────────────

const continuations = new Map<string, () => void>()
interface AutoResolve { eventId: string; at: number; personId: string }
let autoResolves: AutoResolve[] = []
const rng = ambientRng()
let ambientAt = 0
let presenceAt = 0
let engineStarted = false
let engineStartedAt = 0
let disconnectLive: (() => void) | null = null
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

export type HeroStage = 'idle' | 'interview' | 'blueprint' | 'running' | 'done'

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
  heroStage: HeroStage
  interview: { step: number } | null
  chatPending: Record<string, boolean>
  presence: PresenceMark[]
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

  // engine
  startEngine(): void
  emit(e: Omit<WorldEvent, 'ts'> | Omit<WorldEvent, 'ts'>[]): void
  schedule(steps: Step[], baseDelayMs?: number): void
  approve(approval: PendingApproval, asPersonId?: string): void
  runHeroAuto(): void
  sendChat(agentId: string, text: string): void

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
  setFirstRunStep(step: number | null): void
  requestCamera(target: CameraTarget, opts?: { gentle?: boolean }): void
  toast(title: string, detail?: string, kind?: Toast['kind']): void
  dismissToast(id: number): void
}

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

  const brainCtx = (): BrainCtx => ({
    ...api,
    world: () => get().world,
    personaId: () => get().persona?.id ?? 'maya',
    interview: () => get().interview,
    setInterview: (v) => set({ interview: v }),
    heroStage: () => get().heroStage,
    setHeroStage: (s) => set({ heroStage: s }),
    onBlueprintApproved: () => {},
  })

  const rebuild = (log: WorldEvent[]) => buildWorld(BASE_AGENTS, log, Number.MAX_SAFE_INTEGER)

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
      if (due.some((e) => e.type === 'TaskCompleted' && e.title.startsWith('Summit Series launch'))) {
        set({ heroStage: 'done' })
        get().toast('Launch prep complete', 'Budget confirmed, claims cleared, FAQs drafted. Hit “Replay the launch” to watch the whole path again.')
      }
      if (s.entered) {
        // While the scripted demo holds the stage, the toast lane belongs to the
        // story. Ambient events still commit and still animate on the map — they
        // just stop narrating over the beat (an ambient "Model Armor blocked
        // content" landing next to the demo's own guardrail beat read as a bug).
        const stage = get().heroStage
        const scripted = stage === 'interview' || stage === 'blueprint' || stage === 'running'
        for (const e of due) {
          if (scripted && !isHeroEvent(e)) continue
          if (e.type === 'AuthRequired' && e.blockedOn) {
            const p = personById.get(e.blockedOn.personId)
            get().toast(`Blocked: ${e.blockedOn.what}`, `Only ${p?.name ?? 'its owner'} can unblock this. The map shows the dotted line.`, 'human')
          } else if (e.type === 'GuardrailBlock') {
            get().toast('Model Armor blocked content', e.detail, 'block')
          } else if (e.type === 'AgentSpawned') {
            get().toast('New agent on the map', e.detail)
          }
        }
      }
    }

    // 2. simulated humans act on stale approvals (presence first, then the click)
    const world = get().world
    const stillPending = new Set(world.approvals.map((a) => a.eventId))
    autoResolves = autoResolves.filter((ar) => {
      if (!stillPending.has(ar.eventId)) {
        // either resolved by the judge, or not yet committed — keep if not yet in world
        return !get().log.some((e) => e.id === ar.eventId) ? true : false
      }
      if (now >= ar.at) {
        const approval = world.approvals.find((a) => a.eventId === ar.eventId)
        if (approval) get().approve(approval, ar.personId)
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

    // 3. ambient life — hot for the first minute (arrivals must see a moving
    //    map), then it settles; and held entirely during the demo's quiet beats
    const heroStage = get().heroStage
    if (heroStage === 'interview' || heroStage === 'blueprint') {
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

    // 4. presence rotation (simulated colleagues browsing the map)
    if (now >= presenceAt) {
      const personaId = get().persona?.id
      const pool = ['sofia', 'ethan', 'leo', 'grace', 'sam', 'nina', 'avery', 'maya', 'dana'].filter((p) => p !== personaId)
      const depts = ['marketing', 'finance', 'legal', 'support', 'operations', 'hr']
      const roaming: PresenceMark[] = []
      const n = 2 + Math.floor(rng() * 2)
      for (let i = 0; i < n; i++) {
        const person = pick(rng, pool)
        if (!roaming.some((r) => r.personId === person)) {
          roaming.push({ personId: person, where: pick(rng, depts) })
        }
      }
      const approvalsMarks = get().presence.filter((p) => p.where.startsWith('approval:'))
      set({ presence: [...roaming, ...approvalsMarks] })
      presenceAt = now + between(rng, 11_000, 21_000)
    }
  }

  return {
    log: [],
    scheduled: [],
    world: rebuild([]),
    heroStage: 'idle',
    interview: null,
    chatPending: {},
    presence: [],

    persona: null,
    entered: false,
    view: 'map',
    panel: null,
    selectedTaskId: null,
    highlightEventId: null,
    artifactEventId: null,
    replay: null,
    paletteOpen: false,
    firstRunStep: null,
    toasts: [],
    cameraRequest: { seq: 0, target: { type: 'fit' } },
    theme: theme0,
    mapStyle: mapStyle0,

    startEngine() {
      if (engineStarted) return
      if (liveEnabled()) {
        engineStarted = true
        disconnectLive = connectLive((e) => {
          const log = [...get().log, e].sort(sortByTs)
          set({ log, world: rebuild(log) })
        })
        return
      }
      engineStarted = true
      const t0 = Date.now()
      engineStartedAt = t0
      const log = buildHistory(t0).sort(sortByTs)
      set({ log, world: rebuild(log) })
      // two exchanges are already in flight while the gate is still up — the
      // first thing anyone sees is a company at work, not a still diagram
      for (const delay of [1000, 5000]) {
        const { steps } = nextAmbient(rng)
        get().schedule(steps, delay)
      }
      // the standing approval is the one thing already waiting on a human; when
      // it is granted, Finance finishes the renewal instead of hanging open
      continuations.set(SEED_APPROVAL_EVENT_ID, () => get().schedule(standingApprovalFollowUp()))
      ambientAt = t0 + 9000
      presenceAt = t0 + 900
      setInterval(tick, 300)
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
      if (liveEnabled()) {
        void fetch(`${backendUrl()}/approvals/${approval.eventId}/decision`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ personId: by }),
        }).catch(() => get().toast('Backend unreachable', `Could not reach ${backendUrl()}`, 'block'))
        set({ presence: get().presence.filter((p) => p.where !== `approval:${approval.eventId}`) })
        get().toast(
          approval.kind === 'auth' ? `${approval.what} — connected`
            : approval.kind === 'blueprint' ? `${approval.blueprint?.name ?? 'Agent'} — blueprint approved`
              : `${approval.what} — approved`,
          approval.kind === 'auth' ? 'The run resumes from its checkpoint.' : undefined,
          'human',
        )
        return
      }
      const person = personById.get(by)
      const typeMap = { auth: 'AccountConnected', approval: 'ApprovalGranted', blueprint: 'BlueprintApproved' } as const
      const titleMap = {
        auth: `${approval.what} — connected`,
        approval: `${approval.what} — approved`,
        blueprint: `${approval.blueprint?.name ?? 'Agent'} — blueprint approved`,
      }
      const detailMap = {
        auth: `${person?.name} completed the OAuth flow. The agent received a scoped capability — the raw credential never left the vault.`,
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
          payload: { reason: approval.eventId },
        },
      })
      // presence mark for this approval is done
      set({ presence: get().presence.filter((p) => p.where !== `approval:${approval.eventId}`) })
      if (approval.kind === 'blueprint') set({ heroStage: 'running' })
      const fn = continuations.get(approval.eventId)
      if (fn) {
        continuations.delete(approval.eventId)
        fn()
      }
      autoResolves = autoResolves.filter((ar) => ar.eventId !== approval.eventId)
      get().toast(titleMap[approval.kind], approval.kind === 'auth' ? 'The run resumes from its checkpoint.' : undefined, 'human')
    },

    runHeroAuto() {
      if (liveEnabled()) {
        get().toast('Hero demo runs in simulation mode', 'Reload without ?backend=live to rehearse the scripted launch.')
        return
      }
      const stage = get().heroStage
      if (stage !== 'idle') {
        get().toast(
          stage === 'done' ? 'Launch demo already complete' : 'Launch demo already running',
          stage === 'done' ? 'Select the launch task and hit replay to watch it again.' : 'Watch the map — or open the Marketing Agent to follow along.',
        )
        return
      }
      set({ heroStage: 'interview' })
      heroInterviewAuto(
        {
          ...api,
          onResolve: (id, fn) => continuations.set(id, () => { set({ heroStage: 'running' }); fn() }),
        },
        'maya',
      )
      get().openPanel('agent', 'op-marketing')
      get().toast('Launch demo started', 'Maya is asking the Marketing Agent for a launch agent. The interview runs in the Agent Room.')
    },

    sendChat(agentId, text) {
      const personaId = get().persona?.id ?? 'maya'
      if (liveEnabled()) {
        void fetch(`${backendUrl()}/chat`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ agentId, text, personId: personaId }),
        }).catch(() => get().toast('Backend unreachable', `Could not reach ${backendUrl()}`, 'block'))
      }
      get().emit({
        id: `chat_${Date.now()}_${Math.round(Math.random() * 1e6)}`,
        type: 'Chat',
        from: personRef(personaId),
        to: agentRef(agentId),
        title: text,
        payload: { text },
      })
      set({ chatPending: { ...get().chatPending, [agentId]: true } })
      if (liveEnabled()) return
      const agent = get().world.agents.find((a) => a.id === agentId)
      handleChat(brainCtx(), agentId, agent?.deptId ?? 'marketing', text)
    },

    enter(personId) {
      const persona = personById.get(personId) ?? null
      const onboarded = localStorage.getItem('coops_onboarded') === '1'
      set({ persona, entered: true, firstRunStep: onboarded ? null : 0 })
      const p = persona
      if (p?.id === 'dana') {
        get().openPanel('approvals')
        get().requestCamera({ type: 'fit' })
      } else if (p?.id === 'avery') {
        get().requestCamera({ type: 'fit' })
      } else {
        get().requestCamera({ type: 'dept', deptId: p?.deptId ?? 'marketing' })
        get().openPanel('dept', p?.deptId ?? 'marketing')
      }
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
