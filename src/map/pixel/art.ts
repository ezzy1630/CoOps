import { useEffect, useState } from 'react'
import { activeCompanyReady } from '../../data/activeCompany'
import { getCompany } from '../../data/company'
import type { ValleyAssets } from '../../data/company'

// ─── Render model ────────────────────────────────────────────────────────────
// The Valley scene is a projection of one company's injected ValleyAssets.
// There is no manifest and no runtime fetch: everything arrives through the
// CompanyTemplate, already bundled. This module only adapts that data into the
// shape the pixel renderer consumes, plus the valley's own ink palette (a
// property of the rendering style, not of any company).

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

/** Ink + accent colors of the valley rendering style (see docs/pixel-art-spec.md). */
const VALLEY_PALETTE: PixelPalette = {
  outline: '#2e1f2c',
  ink: '#46303e',
  paper: '#f2e7cd',
  task: '#4a80cb',
  artifact: '#48954e',
  permission: '#bd8430',
  escalation: '#d15a49',
  guard: '#8a63c9',
  human: '#e3ae52',
}

function buildPixelArt(v: ValleyAssets | undefined): PixelArt | null {
  if (!v || !v.background || !v.mail || v.buildings.length === 0 || v.avatars.variants.length === 0) return null
  if (v.world.w <= 0 || v.world.h <= 0) return null
  return {
    version: 1,
    world: { ...v.world },
    background: { file: v.background, x: v.backgroundBox.x, y: v.backgroundBox.y, w: v.backgroundBox.w, h: v.backgroundBox.h },
    plaza: { ...v.plaza },
    buildings: v.buildings.map((b) => ({
      deptId: b.deptId, file: b.img, w: b.w, h: b.h, x: b.x, y: b.y, door: { ...b.door },
    })),
    avatars: { cell: v.avatars.cell, frameOrder: [...v.avatars.frameOrder], variants: [...v.avatars.variants] },
    emotes: { cell: v.emotes.cell, files: { ...v.emotes.files } },
    mail: { file: v.mail, cell: 16 },
    palette: VALLEY_PALETTE,
  }
}

let cached: PixelArt | null | undefined

/**
 * Synchronous projection of the injected company's valley assets. Kept as a
 * hook with the historical loading state so renderers can still distinguish a
 * company without valley art (`missing`) from first paint.
 */
export function usePixelArt(): PixelArtState {
  const [state, setState] = useState<PixelArtState>(() => {
    if (!activeCompanyReady()) return { status: 'loading' }
    return cached !== undefined
      ? cached ? { status: 'ready', art: cached } : { status: 'missing' }
      : { status: 'loading' }
  })
  useEffect(() => {
    if (!activeCompanyReady()) return
    if (cached === undefined) cached = buildPixelArt(getValley())
    setState(cached ? { status: 'ready', art: cached } : { status: 'missing' })
  }, [])
  return state
}

function getValley(): ValleyAssets | undefined {
  return getCompany().valley
}
