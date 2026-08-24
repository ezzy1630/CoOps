import { useEffect, useState } from 'react'

// ─── Manifest schema (generated contract — see docs/pixel-art-spec.md) ───────

export interface Pt {
  x: number
  y: number
}

export interface PixelBuilding {
  deptId: string
  file: string
  w: number
  h: number
  x: number
  y: number
  door: Pt
}

export interface PixelBackground {
  file: string
  w: number
  h: number
  x: number
  y: number
}

export type EmoteName = 'working' | 'blocked' | 'awaiting' | 'escalated' | 'delivering' | 'reading'

export interface PixelPalette {
  outline: string
  ink: string
  paper: string
  task: string
  artifact: string
  permission: string
  escalation: string
  guard: string
  human: string
}

export interface PixelArt {
  version: number
  world: { w: number; h: number }
  background: PixelBackground
  plaza: Pt
  buildings: PixelBuilding[]
  avatars: { cell: number; frameOrder: string[]; variants: string[] }
  emotes: { cell: number; files: Record<EmoteName, string> }
  mail: { file: string; cell: number }
  palette: PixelPalette
}

export type PixelArtState =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'ready'; art: PixelArt }

// ─── Loose shape validation ──────────────────────────────────────────────────
// The manifest is generated, but a stale deploy or a half-copied public/ dir
// must degrade to the fallback line, never crash the scene.

const EMOTE_NAMES: EmoteName[] = ['working', 'blocked', 'awaiting', 'escalated', 'delivering', 'reading']
const PALETTE_KEYS = [
  'outline', 'ink', 'paper', 'task', 'artifact', 'permission', 'escalation', 'guard', 'human',
] as const

type Rec = Record<string, unknown>

const asRec = (v: unknown): Rec | null =>
  typeof v === 'object' && v !== null ? (v as Rec) : null
const asStr = (v: unknown): string | null =>
  typeof v === 'string' && v.length > 0 ? v : null
const asNum = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null

const asPt = (v: unknown): Pt | null => {
  const r = asRec(v)
  const x = r && asNum(r.x)
  const y = r && asNum(r.y)
  return x !== null && y !== null ? { x, y } : null
}

const asWorldSize = (v: unknown): PixelArt['world'] | null => {
  const r = asRec(v)
  const w = r && asNum(r.w)
  const h = r && asNum(r.h)
  return w !== null && h !== null ? { w, h } : null
}

function asBuilding(v: unknown): PixelBuilding | null {
  const b = asRec(v)
  if (!b) return null
  const deptId = asStr(b.deptId)
  const file = asStr(b.file)
  const w = asNum(b.w)
  const h = asNum(b.h)
  const x = asNum(b.x)
  const y = asNum(b.y)
  const door = asPt(b.door)
  return deptId && file && w !== null && h !== null && x !== null && y !== null && door
    ? { deptId, file, w, h, x, y, door }
    : null
}

/** Rebuilds a fully-typed PixelArt from validated fields, or null on any gap. */
function parseManifest(raw: unknown): PixelArt | null {
  const m = asRec(raw)
  if (!m) return null
  const version = asNum(m.version)
  if (version === null) return null
  const world = asWorldSize(m.world)
  const plaza = asPt(m.plaza)
  const bg = asRec(m.background)
  const backgroundFile = bg && asStr(bg.file)
  const buildings = Array.isArray(m.buildings)
    ? m.buildings.map(asBuilding).filter((b): b is PixelBuilding => b !== null)
    : []
  if (!world || !plaza || !backgroundFile || buildings.length === 0) return null
  const backgroundW = asNum(bg?.w) ?? world.w
  const backgroundH = asNum(bg?.h) ?? world.h
  const backgroundX = asNum(bg?.x) ?? 0
  const backgroundY = asNum(bg?.y) ?? 0
  if (backgroundW <= 0 || backgroundH <= 0) return null
  const background: PixelBackground = {
    file: backgroundFile,
    w: backgroundW,
    h: backgroundH,
    x: backgroundX,
    y: backgroundY,
  }

  const av = asRec(m.avatars)
  const avCell = av && asNum(av.cell)
  const frameOrder = Array.isArray(av?.frameOrder) ? (av.frameOrder as unknown[]).map(asStr) : []
  const variants = Array.isArray(av?.variants) ? (av.variants as unknown[]).map(asStr) : []
  if (
    avCell === null ||
    frameOrder.some((s) => s === null) || frameOrder.length === 0 ||
    variants.length === 0 || variants.some((s) => s === null)
  ) {
    return null
  }

  const em = asRec(m.emotes)
  const emCell = em && asNum(em.cell)
  const emFiles = em && asRec(em.files)
  if (emCell === null || !emFiles || EMOTE_NAMES.some((k) => asStr(emFiles[k]) === null)) return null

  const ml = asRec(m.mail)
  const mailFile = ml && asStr(ml.file)
  const mailCell = ml && asNum(ml.cell)
  if (!mailFile || mailCell === null) return null

  const pl = asRec(m.palette)
  if (!pl || PALETTE_KEYS.some((k) => asStr(pl[k]) === null)) return null

  return {
    version,
    world,
    background,
    plaza,
    buildings,
    avatars: {
      cell: avCell,
      frameOrder: frameOrder as string[],
      variants: variants as string[],
    },
    emotes: {
      cell: emCell,
      files: Object.fromEntries(EMOTE_NAMES.map((k) => [k, asStr(emFiles[k])!])) as Record<EmoteName, string>,
    },
    mail: { file: mailFile, cell: mailCell },
    palette: {
      outline: asStr(pl.outline)!,
      ink: asStr(pl.ink)!,
      paper: asStr(pl.paper)!,
      task: asStr(pl.task)!,
      artifact: asStr(pl.artifact)!,
      permission: asStr(pl.permission)!,
      escalation: asStr(pl.escalation)!,
      guard: asStr(pl.guard)!,
      human: asStr(pl.human)!,
    },
  }
}

// ─── Loader (fetch once, cache module-level) ─────────────────────────────────

let manifestP: Promise<PixelArt | null> | null = null

function loadManifest(): Promise<PixelArt | null> {
  // no JSON imports: the manifest stays a runtime asset so tsconfig is untouched
  manifestP ??= fetch('/pixel/manifest.json')
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
    .then((raw: unknown) => parseManifest(raw))
    .catch(() => null)
  return manifestP
}

export function usePixelArt(): PixelArtState {
  const [state, setState] = useState<PixelArtState>({ status: 'loading' })
  useEffect(() => {
    let alive = true
    void loadManifest().then((art) => {
      if (alive) setState(art ? { status: 'ready', art } : { status: 'missing' })
    })
    return () => {
      alive = false
    }
  }, [])
  return state
}
