import { create } from 'zustand'
import type {
  PendingApproval, Person, TaskId, World, WorldEvent,
} from './types'
import { BASE_AGENTS, personById } from './data/company'
import { buildWorld } from './engine/reducer'
import { agentRef, personRef, type Step } from './engine/build'
import { ambientRng, buildHistory, nextAmbient } from './data/scenarios'
import { between, pick } from './engine/rng'
import { heroInterviewAuto, type EngineApi } from './data/hero'
import { handleChat, type BrainCtx } from './engine/mockBrain'
import { buildReplayMapping, replayDuration, type ReplayKnot } from './engine/replay'

// ─── Module-level engine internals (not reactive) ───────────────────────────

const continuations = new Map<string, () => void>()
interface AutoResolve { eventId: string; at: number; personId: string }
let autoResolves: AutoResolve[] = []
const rng = ambientRng()
let ambientAt = 0
let presenceAt = 0
let engineStarted = false

// ─── Types ───────────────────────────────────────────────────────────────────

export type PanelKind = 'agent' | 'dept' | 'approvals' | 'activity' | 'diff'
export interface PanelState { kind: PanelKind; id?: string }

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
        for (const e of due) {
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

    // 3. ambient life
    if (now >= ambientAt) {
      const activeCount = [...world.tasks.values()].filter((t) => t.status !== 'done' && t.status !== 'failed').length
      if (activeCount < 4) {
        const { steps, lengthMs } = nextAmbient(rng)
        get().schedule(steps, 800)
        ambientAt = now + lengthMs + between(rng, 16_000, 34_000)
      } else {
        ambientAt = now + 12_000
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

    startEngine() {
      if (engineStarted) return
      engineStarted = true
      const log = buildHistory(Date.now()).sort(sortByTs)
      set({ log, world: rebuild(log) })
      ambientAt = Date.now() + 4000
      presenceAt = Date.now() + 1500
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
      get().emit({
        id: `chat_${Date.now()}_${Math.round(Math.random() * 1e6)}`,
        type: 'Chat',
        from: personRef(personaId),
        to: agentRef(agentId),
        title: text,
        payload: { text },
      })
      set({ chatPending: { ...get().chatPending, [agentId]: true } })
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
      set({ panel: null, selectedTaskId: null, replay: null })
      get().enter(personId)
    },

    openPanel(kind, id) {
      set({ panel: { kind, id } })
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
