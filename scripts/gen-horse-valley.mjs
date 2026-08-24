#!/usr/bin/env node
/**
 * gen-horse-valley.mjs — one-time pixel-art generator for the Horse Launch
 * company's Valley map. Standalone by design: it shares nothing with
 * gen-pixel-art.mjs. Theme: a steampunk ranch — brass, copper and riveted
 * iron department buildings with steam vents and gear signage, set in
 * working pasture with round-pen plaza, dirt lanes, fences and horses.
 *
 * Output: public/pixel/horse/ (background.png, buildings/*.png,
 * avatars/v0..v7.png, emotes/*.png, mail.png). Geometry is declared in
 * src/data/companies/horse.ts; building canvas sizes must stay in sync.
 *
 * Pure Node ESM, zero dependencies. Deterministic: seeded PRNGs only.
 * Usage: node scripts/gen-horse-valley.mjs
 */
import { deflateSync } from 'node:zlib'
import fs from 'node:fs'
import path from 'node:path'

const SCRIPT_DIR = path.dirname(process.argv[1] ? path.resolve(process.argv[1]) : process.cwd())
const ROOT = path.resolve(SCRIPT_DIR, '..')
const OUT = path.join(ROOT, 'public', 'pixel', 'horse')

/* ── palette ─────────────────────────────────────────────────────────────── */
const INK = '#2b2126'
const PAPER = '#f4e9cd'

const PALETTE = {
  grass: { shadow: '#77803a', dark: '#8a974a', base: '#9cab55', light: '#afc463', hi: '#c5da74' },
  dirt: { rim: '#8f6f46', base: '#bd9a63', light: '#d2b17c', dark: '#a37f50', gravel: '#7d6039', pebble: '#e0c79c' },
  stone: { dark: '#6b5d45', mid: '#97876b', base: '#b3a48a', light: '#cfc2a8', hi: '#e7dcc7', joint: '#4c402e' },
  water: { shallow: '#6ea6c4', deep: '#3a6a82', spark: '#e8f6fb' },
  wood: { shadow: '#382716', dark: '#5c3d20', base: '#8a5f33', light: '#aa7c49', hi: '#c89a63' },
  foliage: { shadow: '#25481f', dark: '#37662a', base: '#4f8839', light: '#6bab50', hi: '#89ca6c' },
  pine: { dark: '#1e441c', base: '#2d5e2a', light: '#427c3c', hi: '#5b9e54' },
  trunk: { dark: '#4c301a', base: '#6e4727', light: '#8f6139' },
  flowers: { pink: '#e88eb0', yellow: '#e8b838', white: '#f2ece2', red: '#d6483c', blue: '#5c96d4', purple: '#9268cf' },
  horse: { bay: '#7a4a26', bayD: '#5c3619', black: '#33291f', white: '#efe9dd' },
  /* steampunk metals */
  brass: { light: '#e6c96a', base: '#c9a227', dark: '#8f7318' },
  copper: { light: '#d99a5e', base: '#b87333', dark: '#7d4a22' },
  iron: { light: '#7a8089', base: '#565b63', dark: '#3a3e45' },
  brick: { base: '#93402c', joint: '#5f2a1c', light: '#a85a40' },
  slate: { base: '#5a6470', light: '#78838f', dark: '#414a54' },
  steam: '#eceadf',
}

const ACCENTS = {
  marketing: { main: '#d97757', light: '#eda083', dark: '#a34f35' },
  finance: { main: '#c9a227', light: '#e0c05e', dark: '#8f7318' },
  legal: { main: '#6b87b5', light: '#93abd0', dark: '#47608c' },
  support: { main: '#4f9e7f', light: '#78bfa3', dark: '#356f58' },
  engineering: { main: '#c96a3b', light: '#e69263', dark: '#8f4522' },
  hr: { main: '#a06fbf', light: '#bf96d6', dark: '#72498c' },
}

const SEMANTIC = { task: '#4a80cb', artifact: '#48954e', permission: '#bd8430', human: '#e3ae52' }

function hex(s) {
  return [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)]
}
function mix(a, b, t) {
  const A = hex(a), B = hex(b)
  return [
    Math.round(A[0] + (B[0] - A[0]) * t),
    Math.round(A[1] + (B[1] - A[1]) * t),
    Math.round(A[2] + (B[2] - A[2]) * t),
  ]
}
const WHITE = '#ffffff'

function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function hash2i(x, y) {
  let h = (x | 0) * 374761393 + (y | 0) * 668265263
  h = (h ^ (h >>> 13)) >>> 0
  h = Math.imul(h, 1274126177) >>> 0
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/* ── PNG encoder (verbatim structure from the proven generator) ──────────── */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function pngChunk(type, data) {
  const out = Buffer.alloc(12 + data.length)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4, 'ascii')
  if (data.length) data.copy(out, 8)
  const crcInput = Buffer.alloc(4 + data.length)
  crcInput.write(type, 0, 'ascii')
  if (data.length) data.copy(crcInput, 4)
  out.writeUInt32BE(crc32(crcInput), 8 + data.length)
  return out
}
function encodePNG(cv) {
  const { w, h, data } = cv
  const stride = w * 4 + 1
  const raw = Buffer.alloc(h * stride)
  for (let y = 0; y < h; y++) {
    raw[y * stride] = 0
    for (let x = 0; x < w * 4; x++) raw[y * stride + 1 + x] = data[y * w * 4 + x]
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

class Cv {
  constructor(w, h) { this.w = w; this.h = h; this.data = new Uint8ClampedArray(w * h * 4) }
  set(x, y, c, a = 255) {
    x |= 0; y |= 0
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return
    if (typeof c === 'string') c = hex(c)
    const i = (y * this.w + x) * 4
    this.data[i] = c[0]; this.data[i + 1] = c[1]; this.data[i + 2] = c[2]; this.data[i + 3] = a
  }
  get(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return null
    const i = (y * this.w + x) * 4
    return [this.data[i], this.data[i + 1], this.data[i + 2], this.data[i + 3]]
  }
  rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c) }
  hline(x0, x1, y, c) { for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) this.set(x, y, c) }
  vline(x, y0, y1, c) { for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) this.set(x, y, c) }
  line(x0, y0, x1, y1, c, thick = 1) {
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0)
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1
    let err = dx + dy, x = x0, y = y0
    const r = Math.floor((thick - 1) / 2)
    for (;;) {
      if (thick === 1) this.set(x, y, c)
      else for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) this.set(x + i, y + j, c)
      if (x === x1 && y === y1) break
      const e2 = 2 * err
      if (e2 >= dy) { err += dy; x += sx }
      if (e2 <= dx) { err += dx; y += sy }
    }
  }
  disc(cx, cy, r, c) {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++)
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) this.set(x, y, c)
  }
  ellipse(cx, cy, rx, ry, c) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++)
        if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) this.set(x, y, c)
  }
  outline(color = INK) {
    const src = new Uint8ClampedArray(this.data)
    const solid = (x, y) => x >= 0 && y >= 0 && x < this.w && y < this.h && src[(y * this.w + x) * 4 + 3] > 0
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (solid(x, y)) continue
        if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) this.set(x, y, color)
      }
    return this
  }
  blit(dst, dx, dy) {
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        const p = this.get(x, y)
        if (p && p[3] > 0) dst.set(dx + x, dy + y, p, p[3])
      }
  }
}

function stampOutlined(dst, w, h, ax, ay, draw) {
  const s = new Cv(w, h)
  draw(s)
  s.outline(INK)
  s.blit(dst, ax, ay)
}

function makeValueNoise(seed, gw, gh) {
  const rnd = mulberry32(seed)
  const g = new Float32Array(gw * gh)
  for (let i = 0; i < g.length; i++) g[i] = rnd()
  return (u, v) => {
    const x0 = Math.floor(u), y0 = Math.floor(v)
    const fx = u - x0, fy = v - y0
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy)
    const X0 = ((x0 % gw) + gw) % gw, X1 = (X0 + 1) % gw
    const Y0 = ((y0 % gh) + gh) % gh, Y1 = (Y0 + 1) % gh
    const a = g[Y0 * gw + X0], b = g[Y0 * gw + X1], c = g[Y1 * gw + X0], d = g[Y1 * gw + X1]
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy
  }
}

/* ── steampunk primitives ────────────────────────────────────────────────── */

/** A gear that reads as a gear: chunky rectangular teeth, hub, spokes. */
function drawGear(cv, cx, cy, r, teeth, body, dark, hole) {
  cx = Math.round(cx); cy = Math.round(cy)
  // rim
  cv.disc(cx, cy, r, body)
  // teeth: thick radial stubs — integer endpoints, cv.line() terminates on exact equality
  for (let t = 0; t < teeth; t++) {
    const rad = (t * 2 * Math.PI) / teeth
    const x1 = Math.round(cx + Math.cos(rad) * (r - 1)), y1 = Math.round(cy + Math.sin(rad) * (r - 1))
    const x2 = Math.round(cx + Math.cos(rad) * (r + 2)), y2 = Math.round(cy + Math.sin(rad) * (r + 2))
    cv.line(x1, y1, x2, y2, body, 2)
  }
  // shade the rim lower-right
  for (let a = 0; a < 360; a += 2) {
    const rad = (a * Math.PI) / 180
    if (rad > Math.PI * 0.25 && rad < Math.PI * 1.1) cv.set(cx + Math.cos(rad) * (r - 1), cy + Math.sin(rad) * (r - 1), dark)
  }
  // hub + spokes
  cv.disc(cx, cy, Math.max(2, Math.round(r * 0.34)), hole)
  cv.disc(cx, cy, Math.max(1, Math.round(r * 0.16)), body)
  for (let s = 0; s < 4; s++) {
    const rad = (s * Math.PI) / 2 + Math.PI / 4
    cv.line(Math.round(cx + Math.cos(rad) * (r * 0.34)), Math.round(cy + Math.sin(rad) * (r * 0.34)),
      Math.round(cx + Math.cos(rad) * (r - 2)), Math.round(cy + Math.sin(rad) * (r - 2)), dark, 1)
  }
}

/** Rivet rows along a rectangle edge. */
function rivets(cv, x0, y0, x1, y1, gap = 7, color = '#2f333a') {
  for (let x = x0 + 2; x <= x1 - 2; x += gap) { cv.set(x, y0, color); cv.set(x, y1, color) }
  for (let y = y0 + 2; y <= y1 - 2; y += gap) { cv.set(x0, y, color); cv.set(x1, y, color) }
}

/** Copper pipe with flanges. */
function pipe(cv, x, y0, y1, w = 3) {
  cv.rect(x, y0, w, y1 - y0, PALETTE.copper.base)
  cv.vline(x, y0, y1, PALETTE.copper.light)
  cv.vline(x + w - 1, y0, y1, PALETTE.copper.dark)
  for (const fy of [y0 + 4, Math.floor((y0 + y1) / 2), y1 - 4]) {
    cv.rect(x - 1, fy, w + 2, 2, PALETTE.copper.dark)
    cv.hline(x - 1, x + w, fy, PALETTE.copper.light)
  }
}

/** Steam plume above a stack mouth. steps×gap must keep the top puff inside the canvas. */
function steam(cv, x, y, seed = 1, steps = 5, gap = 3) {
  const rnd = mulberry32(seed)
  for (let i = 0; i < steps; i++) {
    const drift = Math.round((rnd() - 0.5) * 6)
    const r = 1 + Math.round(rnd() * 2) + Math.floor(i / 3)
    cv.disc(x + drift, y - i * gap, r, PALETTE.steam)
    cv.set(x + drift, y - i * gap - r, WHITE)
  }
}

/* ── terrain helpers ─────────────────────────────────────────────────────── */
function paintPasture(cv, W, H, ox = 0, oy = 0) {
  const n1 = makeValueNoise(77, 30, 20)
  const n2 = makeValueNoise(911, 80, 50)
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const wx = x + ox, wy = y + oy
      const v = n1(wx / 28, wy / 28) * 0.6 + n2(wx / 9, wy / 9) * 0.4
      const col = v < 0.34 ? PALETTE.grass.dark : v > 0.63 ? PALETTE.grass.light : PALETTE.grass.base
      cv.set(x, y, col)
    }
  const rng = mulberry32(0xCAFE2)
  for (let i = 0; i < (W * H) / 300; i++) {
    const x = 12 + ((rng() * (W - 24)) | 0)
    const y = 12 + ((rng() * (H - 24)) | 0)
    cv.set(x, y, PALETTE.grass.shadow)
    cv.set(x - 1, y - 1, PALETTE.grass.dark)
    cv.set(x, y - 2, PALETTE.grass.hi)
  }
}

function roadDisc(cv, cx, cy, r) {
  const rimR = r + 2
  for (let dy = -rimR; dy <= rimR; dy++)
    for (let dx = -rimR; dx <= rimR; dx++) {
      const d2 = dx * dx + dy * dy
      const px = Math.round(cx + dx), py = Math.round(cy + dy)
      if (d2 <= r * r) {
        const n = hash2i(px * 19, py * 27)
        const isRut = Math.abs(dy) > r * 0.3 && Math.abs(dy) < r * 0.7
        let col = isRut ? PALETTE.dirt.dark : n < 0.25 ? PALETTE.dirt.light : n < 0.75 ? PALETTE.dirt.base : PALETTE.dirt.dark
        if (n > 0.94) col = PALETTE.dirt.pebble
        else if (n < 0.04) col = PALETTE.dirt.gravel
        cv.set(px, py, col)
      } else if (d2 <= rimR * rimR && hash2i(px * 33, py * 47) > 0.35) {
        cv.set(px, py, PALETTE.dirt.rim)
      }
    }
}

function detailedRoad(cv, ax, ay, bx, by, width = 22) {
  const dx = bx - ax, dy = by - ay
  const len = Math.hypot(dx, dy)
  const steps = Math.ceil(len / 1.5)
  const halfW = width / 2
  for (let i = 0; i <= steps; i++) roadDisc(cv, ax + dx * (i / steps), ay + dy * (i / steps), halfW)
}

function fenceH(cv, x, len, y) {
  stampOutlined(cv, len, 12, x, y, (p) => {
    p.rect(0, 2, len, 2, PALETTE.wood.base)
    p.rect(0, 6, len, 2, PALETTE.wood.dark)
    p.hline(0, len - 1, 2, PALETTE.wood.light)
    for (let px = 2; px <= len - 4; px += 14) {
      p.rect(px, 0, 3, 11, PALETTE.wood.base)
      p.vline(px, 0, 10, PALETTE.wood.light)
      p.vline(px + 2, 0, 10, PALETTE.wood.dark)
    }
  })
}
function fenceV(cv, x, y, len) {
  stampOutlined(cv, 12, len, x, y, (p) => {
    p.rect(2, 0, 2, len, PALETTE.wood.base)
    p.rect(7, 0, 2, len, PALETTE.wood.dark)
    for (let py = 2; py <= len - 5; py += 14) {
      p.rect(0, py, 11, 3, PALETTE.wood.base)
      p.hline(0, 10, py, PALETTE.wood.light)
      p.hline(0, 10, py + 2, PALETTE.wood.dark)
    }
  })
}

/* brass lamppost — steampunk street furniture */
function lamppost(cv, x, y) {
  stampOutlined(cv, 10, 26, x - 5, y - 24, (p) => {
    p.rect(4, 10, 2, 13, PALETTE.iron.base)
    p.rect(3, 22, 4, 2, PALETTE.iron.dark)
    p.rect(2, 4, 6, 6, PALETTE.brass.base)
    p.rect(3, 5, 4, 3, '#f4cf7e')
    p.set(4, 5, WHITE)
    p.rect(3, 2, 4, 2, PALETTE.brass.dark)
    p.set(4, 1, PALETTE.brass.light)
  })
}

function pineTree(cv, bx, by) {
  stampOutlined(cv, 32, 56, bx - 16, by - 55, (p) => {
    p.rect(14, 46, 4, 9, PALETTE.trunk.base)
    p.disc(16, 34, 12, PALETTE.pine.base)
    p.disc(15, 32, 9, PALETTE.pine.dark)
    p.disc(14, 30, 6, PALETTE.pine.light)
    p.disc(16, 22, 10, PALETTE.pine.base)
    p.disc(15, 21, 7, PALETTE.pine.light)
    p.disc(14, 13, 6, PALETTE.pine.light)
    p.disc(15, 12, 4, PALETTE.pine.hi)
  })
}
function oakTree(cv, bx, by) {
  stampOutlined(cv, 50, 62, bx - 25, by - 61, (p) => {
    p.rect(22, 48, 6, 13, PALETTE.trunk.base)
    const lobes = [[25, 30, 18], [10, 35, 13], [40, 35, 13], [16, 20, 12], [34, 20, 12], [25, 16, 11]]
    for (const [ox, oy, r] of lobes) p.disc(ox, oy, r, PALETTE.foliage.base)
    for (const [ox, oy, r] of lobes) p.disc(ox + 1, oy + 1, r - 1, PALETTE.foliage.dark)
    for (const [ox, oy, r] of lobes) { p.disc(ox - 1, oy - 1, Math.max(2, r - 3), PALETTE.foliage.base); p.disc(ox - 2, oy - 2, Math.max(1, r - 5), PALETTE.foliage.light) }
  })
}

function horse(dst, bx, by, coat) {
  stampOutlined(dst, 26, 20, bx, by, (p) => {
    const dark = coat === PALETTE.horse.black ? '#211a14' : coat === PALETTE.horse.white ? '#c9c2b2' : PALETTE.horse.bayD
    p.ellipse(13, 11, 8, 5, coat)
    p.rect(7, 14, 2, 5, dark); p.rect(11, 15, 2, 4, dark)
    p.rect(15, 15, 2, 4, dark); p.rect(18, 14, 2, 5, dark)
    p.line(19, 9, 23, 4, coat, 2)
    p.rect(22, 2, 4, 3, coat)
    p.set(25, 3, dark)
    p.line(19, 4, 20, 8, PALETTE.trunk.dark, 1)
    p.line(5, 8, 4, 13, PALETTE.trunk.dark, 1)
  })
}

/* ── town scene ──────────────────────────────────────────────────────────── */
const WORLD = { w: 960, h: 600 }
const PLAZA = { x: 480, y: 280 }

function buildTown() {
  const cv = new Cv(WORLD.w, WORLD.h)
  paintPasture(cv, WORLD.w, WORLD.h)

  /* round-pen plaza with brass-capped posts */
  const px = PLAZA.x, py = PLAZA.y, R = 86
  for (let a = 0; a < 360; a += 6) {
    if (a > 78 && a < 102) continue
    if (a > 258 && a < 282) continue
    const rad = (a * Math.PI) / 180
    const fx = px + Math.cos(rad) * R, fy = py + Math.sin(rad) * R
    cv.set(fx, fy, PALETTE.wood.shadow); cv.set(fx, fy - 1, PALETTE.wood.base); cv.set(fx, fy - 2, PALETTE.brass.base)
    cv.set(fx + 1, fy - 1, PALETTE.wood.dark)
  }
  for (const rr of [R - 5, R - 10]) {
    for (let a = 0; a < 360; a += 2) {
      if (a > 75 && a < 105) continue
      if (a > 255 && a < 285) continue
      const rad = (a * Math.PI) / 180
      cv.set(px + Math.cos(rad) * rr, py + Math.sin(rad) * rr, PALETTE.wood.base)
    }
  }
  cv.disc(px, py, R - 12, PALETTE.dirt.base)
  for (let i = 0; i < 500; i++) {
    const rad = mulberry32(i * 977 + 5)() * Math.PI * 2
    const d = mulberry32(i * 613 + 1)() * (R - 14)
    const n = hash2i(px + Math.cos(rad) * d | 0, py + Math.sin(rad) * d | 0)
    cv.set(px + Math.cos(rad) * d, py + Math.sin(rad) * d, n < 0.3 ? PALETTE.dirt.light : n < 0.85 ? PALETTE.dirt.dark : PALETTE.dirt.rim)
  }
  stampOutlined(cv, 44, 20, px - 22, py - 10, (p) => {
    p.rect(0, 0, 44, 5, PALETTE.wood.dark)
    p.rect(1, 1, 42, 3, PALETTE.wood.base)
    p.rect(3, 5, 5, 12, PALETTE.iron.base); p.rect(36, 5, 5, 12, PALETTE.iron.base)
    p.rect(4, 5, 3, 10, PALETTE.water.shallow); p.rect(37, 5, 3, 10, PALETTE.water.deep)
    p.set(6, 5, PALETTE.water.spark); p.set(38, 6, PALETTE.water.spark)
  })

  /* dirt lanes — same coordinates as the walker street backbone */
  detailedRoad(cv, 140, 165, 820, 165, 22)
  detailedRoad(cv, 140, 415, 820, 415, 22)
  detailedRoad(cv, 480, 138, 480, 178, 24)
  detailedRoad(cv, 480, 382, 480, 415, 24)
  detailedRoad(cv, 480, 415, 480, 505, 16)
  detailedRoad(cv, 150, 165, 150, 415, 18)
  detailedRoad(cv, 810, 165, 810, 415, 18)

  /* corrals west */
  fenceH(cv, 24, 100, 250); fenceH(cv, 24, 100, 330); fenceV(cv, 24, 250, 84); fenceV(cv, 118, 250, 84)
  horse(cv, 40, 280, PALETTE.horse.bay)
  horse(cv, 72, 300, PALETTE.horse.black)

  /* paddocks south-east */
  fenceH(cv, 836, 100, 306); fenceH(cv, 836, 100, 396); fenceV(cv, 930, 306, 92); fenceV(cv, 836, 306, 44)
  horse(cv, 856, 340, PALETTE.horse.white)
  horse(cv, 888, 362, PALETTE.horse.bay)

  /* steampunk dressing near the workshop plot: half-buried gears */
  drawGear(cv, 664, 468, 7, 8, PALETTE.iron.base, PALETTE.iron.dark, PALETTE.dirt.dark)
  drawGear(cv, 682, 486, 5, 7, PALETTE.brass.base, PALETTE.brass.dark, PALETTE.dirt.dark)

  /* brass lampposts around the plaza and avenues */
  lamppost(cv, 372, 152); lamppost(cv, 588, 152); lamppost(cv, 372, 404); lamppost(cv, 588, 404)
  lamppost(cv, 138, 280); lamppost(cv, 822, 280)

  /* trees */
  oakTree(cv, 270, 260); pineTree(cv, 240, 310); oakTree(cv, 690, 255)
  pineTree(cv, 370, 45); pineTree(cv, 590, 45); oakTree(cv, 915, 95)
  pineTree(cv, 885, 75)
  oakTree(cv, 320, 520); pineTree(cv, 230, 540); oakTree(cv, 690, 490)
  pineTree(cv, 735, 530); pineTree(cv, 925, 250); pineTree(cv, 925, 480)
  oakTree(cv, 895, 530)

  /* wildflowers */
  const fr = mulberry32(0xF10E2)
  const flist = [PALETTE.flowers.pink, PALETTE.flowers.yellow, PALETTE.flowers.white, PALETTE.flowers.red, PALETTE.flowers.blue]
  for (let i = 0; i < 26; i++) {
    const fx = 30 + Math.floor(fr() * (WORLD.w - 60))
    const fy = 60 + Math.floor(fr() * (WORLD.h - 100))
    if (fx > px - 105 && fx < px + 105 && fy > py - 105 && fy < py + 105) continue
    const col = flist[i % flist.length]
    for (let f = 0; f < 4; f++) {
      const gx = fx + Math.floor(fr() * 12) - 6
      const gy = fy + Math.floor(fr() * 8) - 4
      cv.set(gx, gy, col)
      cv.set(gx, gy - 1, WHITE)
      cv.set(gx, gy + 1, PALETTE.foliage.dark)
    }
  }

  return cv
}

/* decorative bleed behind the playable area */
const BACKGROUND = { w: 1440, h: 1200, x: -240, y: -300 }
function buildBleed() {
  const cv = new Cv(BACKGROUND.w, BACKGROUND.h)
  paintPasture(cv, BACKGROUND.w, BACKGROUND.h, BACKGROUND.x, BACKGROUND.y)
  for (let x = 0; x < BACKGROUND.w; x++) {
    const hill = 60 + Math.round(28 * Math.sin(x / 90) + 18 * Math.sin(x / 37))
    for (let y = 0; y < hill; y++) cv.set(x, y, mix(PALETTE.grass.dark, '#7d9a4e', y / hill))
  }
  for (let y = 130; y <= 1100; y += 90)
    for (let x = 30; x <= BACKGROUND.w - 30; x += 120) {
      const j = hash2i(x, y)
      if (j < 0.45) continue
      if (j < 0.72) pineTree(cv, x + ((j * 40) | 0), y)
      else oakTree(cv, x + ((j * 40) | 0), y + 10)
    }
  fenceH(cv, 200, 400, 900); fenceV(cv, 200, 900, 160); fenceV(cv, 594, 900, 160)
  const fr = mulberry32(0xBEEF2)
  for (let i = 0; i < 220; i++) {
    const x = 20 + ((fr() * (BACKGROUND.w - 40)) | 0)
    const y = 140 + ((fr() * (BACKGROUND.h - 180)) | 0)
    cv.set(x, y, fr() < 0.5 ? PALETTE.flowers.yellow : PALETTE.flowers.white)
    cv.set(x, y + 1, PALETTE.grass.dark)
  }
  buildTown().blit(cv, -BACKGROUND.x, -BACKGROUND.y)
  return cv
}

/* ── buildings — steampunk ranch, canvas sizes fixed by horse.ts ─────────── */
function wallPlanks(cv, x, y, w, h, base = PALETTE.wood.base) {
  cv.rect(x, y, w, h, base)
  for (let px = x + 5; px < x + w; px += 6) cv.vline(px, y, y + h - 1, PALETTE.wood.dark)
  cv.hline(x, x + w - 1, y, PALETTE.wood.light)
}

function archDoor(cv, cx, yTop, yBot, r) {
  for (let yy = 0; yy <= r; yy++) {
    const halfw = Math.max(1, Math.round(Math.sqrt(Math.max(0, r * r - (r - yy) ** 2))))
    cv.hline(cx - halfw, cx + halfw, yTop + yy, PALETTE.wood.dark)
  }
  cv.rect(cx - r, yTop + r, 2 * r + 1, Math.max(0, yBot - yTop - r), PALETTE.wood.dark)
}

/* marketing — BRASS & FEED CO.: copper roof, brass awning, gear sign */
function buildFeedStore() {
  const a = ACCENTS.marketing
  const cv = new Cv(100, 84)
  // copper false-front roof, flush to walls
  for (let y = 2; y <= 12; y++) {
    const hw = 46 - Math.round((y - 2) * 0.8)
    cv.hline(50 - hw, 50 + hw, y, y % 3 === 0 ? PALETTE.copper.dark : PALETTE.copper.base)
    cv.set(50 - hw, y, PALETTE.copper.light); cv.set(50 + hw, y, PALETTE.copper.light)
  }
  cv.rect(4, 12, 92, 5, PALETTE.copper.dark)
  rivets(cv, 4, 12, 96, 16, 9)
  cv.rect(36, 5, 28, 6, PAPER)
  drawGear(cv, 88, 8, 5, 7, PALETTE.brass.base, PALETTE.brass.dark, PAPER)
  // brass awning, hung directly off the fascia
  for (let i = 0; i < 12; i++) {
    const tone = i % 2 === 0 ? PALETTE.brass.base : PAPER
    cv.rect(4 + i * 8, 16, 8, 10, tone)
    cv.hline(4 + i * 8, 11 + i * 8, 16, PALETTE.brass.light)
    if (i % 2 === 1) cv.rect(4 + i * 8, 26, 8, 2, tone)
  }
  wallPlanks(cv, 8, 27, 84, 52)
  cv.rect(12, 33, 34, 26, PALETTE.wood.dark)
  cv.rect(14, 35, 30, 22, '#d9c9a2')
  cv.ellipse(21, 50, 5, 5, '#c9a86a'); cv.ellipse(22, 49, 4, 3, '#dbbc84')
  cv.ellipse(36, 51, 5, 5, '#b98d55')
  cv.rect(58, 33, 28, 46, PALETTE.wood.dark)
  archDoor(cv, 72, 37, 77, 8)
  cv.set(66, 54, SEMANTIC.human); cv.set(76, 54, SEMANTIC.human)
  pipe(cv, 94, 27, 76, 3)
  cv.hline(8, 91, 78, PALETTE.wood.dark)
  return cv.outline(INK)
}

/* finance — IRON BANK: riveted iron pilasters, brass clock, vault dial */
function buildIronBank() {
  const cv = new Cv(120, 100)
  // slate pediment flush with walls
  for (let y = 2; y <= 22; y++) {
    const hw = Math.round(((y - 2) * 104) / 20 / 2) + 6
    cv.hline(60 - hw, 60 + hw, y, y % 3 === 0 ? PALETTE.slate.dark : PALETTE.slate.base)
    cv.set(60 - hw, y, PALETTE.slate.light); cv.set(60 + hw, y, PALETTE.slate.light)
  }
  cv.rect(6, 22, 108, 4, PALETTE.slate.dark)
  rivets(cv, 6, 22, 114, 26, 10)
  // brass clock in the pediment
  cv.disc(60, 14, 7, PALETTE.brass.base)
  cv.disc(60, 14, 5, PAPER)
  cv.line(60, 14, 60, 10, INK, 1)
  cv.line(60, 14, 63, 15, INK, 1)
  wallPlanks(cv, 10, 26, 100, 68)
  for (const px of [20, 92]) { // riveted iron pilasters
    cv.rect(px, 32, 8, 58, PALETTE.iron.base)
    cv.vline(px + 7, 32, 89, PALETTE.iron.dark)
    cv.vline(px + 1, 32, 89, PALETTE.iron.light)
    rivets(cv, px, 32, px + 8, 90, 8)
    cv.rect(px, 32, 8, 3, PALETTE.brass.base)
    cv.rect(px, 86, 8, 3, PALETTE.brass.base)
  }
  // vault dial in brass
  cv.disc(36, 48, 12, PALETTE.iron.dark)
  cv.disc(36, 48, 9, PALETTE.brass.base)
  cv.disc(36, 48, 6, PALETTE.brass.light)
  cv.line(32, 44, 40, 52, PALETTE.brass.dark, 2)
  cv.line(40, 44, 32, 52, PALETTE.brass.dark, 2)
  cv.set(36, 48, INK)
  // teller window glow
  cv.rect(72, 40, 26, 16, PALETTE.iron.dark)
  cv.rect(74, 42, 22, 12, '#f4cf7e')
  cv.set(76, 44, '#fbeab2')
  // riveted vault door
  cv.rect(50, 60, 24, 34, PALETTE.iron.dark)
  cv.rect(53, 63, 18, 28, PALETTE.iron.base)
  rivets(cv, 53, 63, 71, 91, 6)
  cv.disc(62, 76, 4, PALETTE.brass.base)
  cv.set(62, 76, INK)
  cv.rect(44, 94, 32, 2, PALETTE.stone.light)
  cv.rect(40, 96, 40, 2, PALETTE.stone.mid)
  return cv.outline(INK)
}

/* legal — CAST-IRON CHANCERY: slate roof, iron columns, brass scales */
function buildChancery() {
  const cv = new Cv(116, 98)
  for (let y = 2; y <= 22; y++) {
    const hw = Math.round(((y - 2) * 96) / 20 / 2) + 4
    cv.hline(58 - hw, 58 + hw, y, y % 3 === 0 ? PALETTE.slate.dark : PALETTE.slate.base)
    cv.set(58 - hw, y, PALETTE.slate.light); cv.set(58 + hw, y, PALETTE.slate.light)
  }
  // brass scales in the pediment
  cv.vline(58, 8, 16, PALETTE.brass.dark)
  cv.hline(52, 64, 9, PALETTE.brass.base)
  cv.disc(52, 12, 2, PALETTE.brass.base); cv.disc(64, 12, 2, PALETTE.brass.base)
  cv.rect(10, 22, 96, 5, PALETTE.slate.light)
  cv.hline(10, 105, 22, PALETTE.slate.dark)
  for (let fx = 14; fx <= 100; fx += 8) cv.rect(fx, 24, 4, 2, PALETTE.brass.base)
  cv.rect(12, 27, 92, 50, '#e0d4b0')
  for (let px = 12; px < 104; px += 7) cv.vline(px, 27, 76, '#cfc2a0')
  const iron = [PALETTE.iron.light, PALETTE.iron.base, PALETTE.iron.dark]
  for (const cx0 of [18, 40, 68, 90]) { // cast-iron columns
    cv.rect(cx0 - 1, 29, 9, 3, PALETTE.slate.light)
    for (let i = 0; i < 3; i++) cv.vline(cx0 + i, 33, 66, iron[i])
    cv.set(cx0 + 1, 36, PALETTE.brass.base); cv.set(cx0 + 1, 62, PALETTE.brass.base)
    cv.rect(cx0 - 1, 67, 9, 3, PALETTE.slate.light)
  }
  // tall iron door with fanlight
  cv.rect(48, 40, 20, 38, PALETTE.iron.dark)
  for (let yy = 0; yy <= 6; yy++) {
    const halfw = Math.max(1, Math.round(Math.sqrt(Math.max(0, 6 * 6 - (6 - yy) ** 2))))
    cv.hline(58 - halfw, 58 + halfw, 40 + yy, '#9fb4c4')
  }
  cv.rect(50, 47, 16, 29, PALETTE.iron.base)
  rivets(cv, 50, 47, 66, 76, 6)
  cv.set(54, 58, SEMANTIC.human); cv.set(62, 58, SEMANTIC.human)
  cv.rect(14, 77, 88, 4, PAPER); cv.hline(14, 101, 80, '#cfc5aa')
  cv.rect(10, 81, 96, 4, '#efe8d4'); cv.hline(10, 105, 84, '#cfc5aa')
  cv.rect(6, 85, 104, 4, PAPER)
  return cv.outline(INK)
}

/* support — BOILER BUNKHOUSE: log walls, copper boiler vent, steam */
function buildBoilerBunkhouse() {
  const cv = new Cv(108, 92)
  for (let y = 2; y <= 22; y++) {
    const t = (y - 2) / 20
    const hw = Math.round(10 + t * 42)
    cv.hline(54 - hw, 54 + hw, y, y % 3 === 0 ? PALETTE.copper.dark : '#8a5a3a')
    cv.set(54 - hw, y, '#9a6a44'); cv.set(54 + hw, y, PALETTE.copper.light)
  }
  for (let ly = 26, i = 0; ly <= 78; ly += 7, i++) {
    cv.rect(6, ly, 96, 6, i % 2 === 0 ? PALETTE.wood.base : PALETTE.wood.dark)
    cv.hline(6, 101, ly, i % 2 === 0 ? PALETTE.wood.light : PALETTE.wood.base)
    cv.disc(9, ly + 3, 2, PALETTE.wood.dark); cv.disc(99, ly + 3, 2, PALETTE.wood.dark)
  }
  for (const wx of [16, 74]) {
    cv.rect(wx, 36, 15, 15, PALETTE.wood.dark)
    cv.rect(wx + 2, 38, 11, 11, '#f4cf7e')
    cv.vline(wx + 7, 38, 48, PALETTE.wood.dark); cv.hline(wx + 2, 12 + wx, 43, PALETTE.wood.dark)
    for (const sx of [wx - 3, wx + 15]) { cv.rect(sx, 35, 3, 17, ACCENTS.support.main); cv.vline(sx + 1, 35, 51, ACCENTS.support.dark) }
  }
  cv.rect(44, 50, 20, 34, PALETTE.wood.dark)
  cv.rect(46, 52, 16, 30, PALETTE.wood.base)
  cv.set(50, 64, SEMANTIC.human); cv.set(58, 64, SEMANTIC.human)
  // iron straps on the door
  cv.hline(44, 63, 58, PALETTE.iron.base); cv.hline(44, 63, 74, PALETTE.iron.base)
  // copper boiler vent with steam
  cv.rect(84, 10, 8, 12, PALETTE.copper.base)
  cv.vline(84, 10, 22, PALETTE.copper.light); cv.vline(91, 10, 22, PALETTE.copper.dark)
  cv.rect(82, 10, 12, 2, PALETTE.copper.dark)
  steam(cv, 88, 8, 7, 4, 2)
  cv.set(40, 84, '#f4cf7e'); cv.set(68, 84, '#f4cf7e')
  return cv.outline(INK)
}

/* engineering — THE FORGE: open-air smithy — sloped red roof over an exposed
 * post-and-beam bay, stone furnace with glowing fire, plank-walled workshop
 * room, chimney smoke, anvil and barrel out front. Footprint matches the
 * other departments (104×92). */
function buildTheWorks() {
  const cv = new Cv(104, 92)
  const WOOD = { light: PALETTE.wood.light, base: PALETTE.wood.base, dark: PALETTE.wood.dark }
  const PLANK = { base: '#5f6480', light: '#767b96', seam: '#454a61' }

  // chimney first — the roof slab overlaps its base
  cv.rect(20, 6, 12, 34, PALETTE.stone.mid)
  for (let by = 6; by < 40; by += 5) cv.hline(20, 31, by, PALETTE.stone.joint)
  cv.vline(20, 6, 40, PALETTE.stone.light)
  cv.rect(18, 4, 16, 3, PALETTE.stone.dark)
  steam(cv, 26, 5, 11, 3, 2)

  // sloped red roof: thick plane from the porch beam (left) up to the right,
  // gable triangle filling over the workshop wall
  const undY = (x) => Math.round(38 - ((x - 2) * 16) / 100)
  for (let x = 52; x <= 102; x++) {
    cv.vline(x, undY(x), 36, '#6e2a2a')
    if (x % 6 === 0) cv.vline(x, undY(x) + 1, 35, '#5a2020')
  }
  cv.hline(52, 102, 36, '#4a1c1c')
  for (let x = 2; x <= 102; x++) {
    const u = undY(x)
    cv.vline(x, u - 8, u, '#a83232')
    cv.set(x, u - 8, '#c85a4a')
    cv.set(x, u, '#7c2424')
    if (x % 8 === 0) cv.vline(x, u - 6, u - 2, '#963a30')
  }
  // eave beam over the porch + room top plate
  cv.rect(2, 34, 50, 4, WOOD.base)
  cv.hline(2, 51, 34, WOOD.light); cv.hline(2, 51, 37, WOOD.dark)
  cv.rect(52, 36, 50, 3, WOOD.dark)
  cv.hline(52, 101, 36, WOOD.base)
  // rafter tails + strut brackets under the porch eave
  for (const rx of [8, 20, 32, 44]) cv.rect(rx, 38, 3, 3, WOOD.dark)
  for (const bx of [12, 26, 40]) {
    cv.line(bx, 41, bx + 5, 46, WOOD.dark, 1)
    cv.line(bx + 5, 41, bx, 46, WOOD.dark, 1)
  }

  // porch posts (open bay on the left)
  for (const px of [4, 44]) {
    cv.rect(px, 38, 4, 44, WOOD.base)
    cv.vline(px, 38, 81, WOOD.light)
    cv.vline(px + 3, 38, 81, WOOD.dark)
  }

  // the furnace: stone stack with a glowing fire arch
  cv.rect(12, 44, 26, 38, PALETTE.stone.mid)
  for (let by = 44; by < 82; by += 5) cv.hline(12, 37, by, PALETTE.stone.joint)
  for (let by = 47; by < 82; by += 5) for (let bx = 16; bx < 36; bx += 10) cv.set(bx, by - 2, PALETTE.stone.light)
  cv.vline(12, 44, 81, PALETTE.stone.light); cv.vline(37, 44, 81, PALETTE.stone.dark)
  for (let yy = 0; yy <= 7; yy++) {
    const halfw = Math.round(Math.sqrt(Math.max(0, 1 - ((7 - yy) / 7) ** 2) * 8))
    cv.hline(24 - halfw, 24 + halfw, 54 + yy, '#1d1712')
  }
  cv.rect(17, 61, 15, 21, '#1d1712')
  cv.rect(19, 70, 11, 12, '#e8772e')
  cv.rect(21, 74, 7, 8, '#f4a03c')
  cv.rect(22, 78, 5, 4, '#f4cf7e')
  cv.set(20, 68, '#f4a03c'); cv.set(29, 67, '#fbc46a')
  cv.rect(14, 79, 22, 3, PALETTE.stone.light)

  // workshop room: vertical plank walls, right half
  cv.rect(52, 39, 50, 43, PLANK.base)
  for (let px = 56; px < 102; px += 4) cv.vline(px, 39, 81, PLANK.seam)
  for (let px = 58; px < 102; px += 8) cv.vline(px, 40, 80, PLANK.light)
  cv.hline(52, 101, 39, PLANK.light)
  // plank door
  cv.rect(74, 52, 18, 30, '#3a2a1a')
  cv.rect(76, 54, 14, 28, '#7a5230')
  for (let px = 79; px < 90; px += 4) cv.vline(px, 54, 81, '#5c3d20')
  cv.hline(76, 89, 54, '#a37c49')
  cv.set(87, 66, PALETTE.brass.light)
  // small glowing window
  cv.rect(56, 44, 12, 9, '#3a2a1a')
  cv.rect(58, 46, 8, 5, '#f4cf7e')

  // anvil on a wooden pedestal, front-centre
  cv.rect(44, 72, 10, 10, WOOD.dark)
  cv.vline(46, 72, 81, WOOD.base)
  cv.rect(40, 66, 18, 6, PALETTE.iron.dark)
  cv.rect(42, 63, 14, 4, PALETTE.iron.base)
  cv.rect(56, 67, 5, 4, PALETTE.iron.base)
  cv.set(44, 64, PALETTE.iron.light)

  // barrel, far left
  cv.rect(0, 58, 14, 24, PALETTE.wood.base)
  for (let px = 2; px < 14; px += 3) cv.vline(px, 58, 81, PALETTE.wood.dark)
  cv.vline(0, 58, 81, WOOD.light)
  cv.rect(0, 62, 14, 2, PALETTE.iron.dark)
  cv.rect(0, 74, 14, 2, PALETTE.iron.dark)
  cv.ellipse(7, 58, 7, 2, PALETTE.wood.light)

  return cv.outline(INK)
}

/* hr — GATEHOUSE: cozy cottage with brass lamp and copper cap */
function buildGatehouse() {
  const cv = new Cv(108, 90)
  for (let y = 2; y <= 22; y++) {
    const t = (y - 2) / 20
    const hw = Math.round(8 + t * 44)
    cv.hline(54 - hw, 54 + hw, y, y % 3 === 0 ? '#6f4527' : '#8a5a3a')
    cv.set(54 - hw, y, '#9a6a44'); cv.set(54 + hw, y, PALETTE.copper.light)
  }
  cv.rect(8, 24, 92, 3, PALETTE.wood.light)
  wallPlanks(cv, 10, 27, 88, 56, '#cdbd97')
  for (const wx of [18, 74]) {
    cv.rect(wx, 36, 14, 14, PALETTE.wood.dark)
    cv.rect(wx + 2, 38, 10, 10, '#ddeff0')
    cv.set(wx + 3, 39, WHITE)
    cv.rect(wx - 1, 50, 16, 3, PALETTE.wood.dark)
    cv.disc(wx + 3, 49, 2, PALETTE.flowers.pink); cv.disc(wx + 8, 49, 2, PALETTE.flowers.yellow); cv.disc(wx + 12, 49, 2, PALETTE.flowers.red)
  }
  cv.rect(44, 44, 20, 38, PALETTE.wood.dark)
  cv.rect(46, 46, 16, 34, ACCENTS.hr.main)
  cv.rect(48, 48, 12, 12, PALETTE.wood.dark)
  cv.vline(53, 48, 60, PALETTE.wood.dark)
  cv.set(58, 62, SEMANTIC.human)
  cv.rect(40, 66, 28, 2, PALETTE.wood.dark)
  cv.rect(36, 82, 36, 3, PALETTE.stone.mid)
  // brass lamp + copper chimney cap
  cv.rect(38, 30, 4, 5, PALETTE.brass.base)
  cv.set(39, 31, '#f4cf7e'); cv.set(40, 31, '#f4cf7e')
  cv.rect(70, 6, 6, 10, PALETTE.stone.mid)
  cv.rect(68, 4, 10, 3, PALETTE.copper.base)
  return cv.outline(INK)
}

/* ── villagers: ranch hats with a brass goggle band ──────────────────────── */
const FRAME_ORDER = ['down0', 'down1', 'up0', 'up1', 'right0', 'right1']
const VARIANT_KITS = [
  { hat: '#8a5f33', shirt: '#c96f4a', pants: '#4c4436' },
  { hat: '#4f8839', shirt: '#d9b25e', pants: '#544638' },
  { hat: '#565b63', shirt: '#c9a227', pants: '#4c4436' },
  { hat: '#a06fbf', shirt: '#78bfa3', pants: '#3f3a30' },
  { hat: '#b0563f', shirt: '#c9a86a', pants: '#544638' },
  { hat: '#c9a227', shirt: '#9c6b4a', pants: '#4c4436' },
  { hat: '#37662a', shirt: '#d6778f', pants: '#5c5244' },
  { hat: '#544638', shirt: '#7ea4c9', pants: '#4c4436' },
]
const SKIN = ['#e8c39a', '#d9a877', '#b07d4f', '#8a5c36']
const BRASS = PALETTE.brass.base

function villagerFrame(kind, step, kit, skin) {
  const cv = new Cv(24, 24)
  const legA = step === 0 ? 0 : 1
  // proportions: head y6-11 (skin), body y12-16, legs y17-21 — contiguous, eyes high on the face
  const drawLegs = () => {
    cv.rect(9 + legA, 17, 2, 4, kit.pants)
    cv.rect(13 - legA, 17, 2, 4, kit.pants)
    cv.hline(9, 14, 21, '#33291f')
  }
  if (kind === 'down' || kind === 'up') {
    drawLegs()
    cv.rect(8, 12, 8, 5, kit.shirt) // body
    cv.hline(8, 15, 12, mix(kit.shirt, WHITE, 0.25))
    cv.rect(9, 6, 6, 6, kind === 'up' ? PALETTE.trunk.dark : skin) // head
    if (kind === 'down') { cv.set(10, 8, '#2b2126'); cv.set(13, 8, '#2b2126') } // eyes high, chin stays skin
    cv.rect(8, 2, 8, 3, kit.hat) // crown
    cv.rect(6, 5, 12, 2, kit.hat) // brim
    cv.hline(8, 15, 2, mix(kit.hat, WHITE, 0.3))
    cv.hline(7, 16, 6, BRASS) // goggle band on the brim
    cv.set(9, 6, '#f4cf7e'); cv.set(13, 6, '#f4cf7e') // lenses
  } else {
    cv.rect(9 + legA, 17, 2, 4, kit.pants)
    cv.rect(13 - legA, 17, 2, 4, kit.pants)
    cv.hline(9, 14, 21, '#33291f')
    cv.rect(8, 12, 8, 5, kit.shirt)
    cv.hline(8, 15, 12, mix(kit.shirt, WHITE, 0.25))
    cv.rect(10, 6, 6, 6, skin) // head, profile faces right
    cv.set(14, 8, '#2b2126') // eye
    cv.rect(9, 2, 8, 3, kit.hat)
    cv.rect(7, 5, 12, 2, kit.hat)
    cv.hline(10, 16, 2, mix(kit.hat, WHITE, 0.3))
    cv.hline(8, 18, 6, BRASS)
    cv.set(15, 6, '#f4cf7e')
  }
  return cv.outline(INK)
}

function buildAvatar(variant) {
  const kit = VARIANT_KITS[variant % VARIANT_KITS.length]
  const skin = SKIN[variant % SKIN.length]
  const cv = new Cv(24 * FRAME_ORDER.length, 24)
  FRAME_ORDER.forEach((frame, i) => {
    const m = /^(down|up|right)([01])$/.exec(frame)
    villagerFrame(m[1], Number(m[2]), kit, skin).blit(cv, i * 24, 0)
  })
  return cv
}

/* ── emotes — bold glyphs that read at 16px ──────────────────────────────── */
function emoteBase() {
  const cv = new Cv(16, 16)
  cv.disc(8, 8, 7, PAPER)
  for (let a = 0; a < 360; a += 3) {
    const rad = (a * Math.PI) / 180
    cv.set(8 + Math.cos(rad) * 7, 8 + Math.sin(rad) * 7, INK)
  }
  return cv
}
function buildEmote(name) {
  const cv = emoteBase()
  switch (name) {
    case 'working': // mini gear = the machine is running
      drawGear(cv, 8, 8, 4, 7, PALETTE.brass.dark, INK, PAPER)
      break
    case 'blocked': // solid padlock
      for (let a = 180; a <= 360; a += 8) {
        const rad = (a * Math.PI) / 180
        cv.set(8 + Math.cos(rad) * 2.4, 7 + Math.sin(rad) * 2.4, '#565b63')
        cv.set(8 + Math.cos(rad) * 1.6, 7 + Math.sin(rad) * 1.6, '#565b63')
      }
      cv.rect(4, 7, 8, 6, '#565b63')
      cv.rect(5, 8, 6, 4, '#7a8089')
      cv.set(8, 10, INK)
      break
    case 'awaiting': // filled hourglass
      cv.rect(4, 3, 8, 2, PALETTE.wood.dark)
      cv.rect(4, 11, 8, 2, PALETTE.wood.dark)
      for (let yy = 5; yy <= 7; yy++) cv.hline(8 - (yy - 4), 8 + (yy - 4), yy, PALETTE.brass.base)
      for (let yy = 9; yy <= 10; yy++) cv.hline(8 - (11 - yy), 8 + (11 - yy), yy, PALETTE.brass.base)
      cv.set(8, 8, PALETTE.brass.light)
      break
    case 'escalated': // bold bang
      cv.rect(6, 3, 4, 7, '#d15a49')
      cv.rect(6, 12, 4, 3, '#d15a49')
      cv.set(7, 4, '#f0907f')
      break
    case 'delivering': // strapped parcel
      cv.rect(3, 5, 10, 8, '#a3653a')
      cv.rect(4, 6, 8, 6, '#c08550')
      cv.vline(7, 5, 12, '#5c3d20'); cv.vline(8, 5, 12, '#5c3d20')
      cv.hline(3, 12, 9, '#5c3d20')
      break
    case 'reading': // open book
      cv.rect(3, 5, 5, 7, PAPER)
      cv.rect(8, 5, 5, 7, PAPER)
      cv.vline(7, 4, 12, PALETTE.wood.dark); cv.vline(8, 4, 12, PALETTE.wood.dark)
      cv.hline(4, 6, 7, '#c9b98a'); cv.hline(10, 12, 7, '#c9b98a')
      cv.hline(4, 6, 9, '#c9b98a'); cv.hline(10, 12, 9, '#c9b98a')
      break
  }
  return cv
}

/* mail: envelope with horseshoe stamp */
function buildMail() {
  const cv = new Cv(16, 12)
  cv.rect(1, 2, 14, 9, PAPER)
  for (let x = 1; x <= 14; x++) cv.set(x, 2, '#c9b98a')
  cv.line(1, 2, 8, 8, '#8a7a5e'); cv.line(14, 2, 8, 8, '#8a7a5e')
  cv.line(1, 10, 6, 6, '#8a7a5e'); cv.line(14, 10, 10, 6, '#8a7a5e')
  cv.rect(10, 3, 4, 4, SEMANTIC.permission)
  cv.set(11, 4, WHITE); cv.set(12, 4, WHITE); cv.set(12, 5, WHITE); cv.set(11, 6, WHITE)
  return cv.outline(INK)
}

/* ── emit ────────────────────────────────────────────────────────────────── */
fs.mkdirSync(path.join(OUT, 'buildings'), { recursive: true })
fs.mkdirSync(path.join(OUT, 'avatars'), { recursive: true })
fs.mkdirSync(path.join(OUT, 'emotes'), { recursive: true })

const writes = []
writes.push(['background.png', encodePNG(buildBleed())])
writes.push(['mail.png', encodePNG(buildMail())])
const BUILDERS = {
  marketing: buildFeedStore,
  finance: buildIronBank,
  legal: buildChancery,
  support: buildBoilerBunkhouse,
  engineering: buildTheWorks,
  hr: buildGatehouse,
}
for (const [dept, fn] of Object.entries(BUILDERS)) {
  writes.push([path.join('buildings', `${dept}.png`), encodePNG(fn())])
}
for (let v = 0; v < 8; v++) writes.push([path.join('avatars', `v${v}.png`), encodePNG(buildAvatar(v))])
for (const name of ['working', 'blocked', 'awaiting', 'escalated', 'delivering', 'reading']) {
  writes.push([path.join('emotes', `${name}.png`), encodePNG(buildEmote(name))])
}
for (const [rel, buf] of writes) fs.writeFileSync(path.join(OUT, rel), buf)

console.log(`horse valley: wrote ${writes.length} steampunk files to public/pixel/horse`)
