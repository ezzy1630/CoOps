#!/usr/bin/env node
/**
 * gen-pixel-art.mjs — deterministic pixel-art generator for CoOps Valley mode.
 *
 * Pure Node ESM, zero dependencies (node built-ins only). Regenerates every
 * asset in public/pixel/ plus manifest.json. All pixels derive from seeded
 * PRNGs and a canonical PNG encoder (filter 0, zlib level 9), so re-running
 * produces byte-identical files.
 *
 * Usage: node scripts/gen-pixel-art.mjs
 */
import { deflateSync } from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';

const SCRIPT_DIR = path.dirname(process.argv[1] ? path.resolve(process.argv[1]) : process.cwd());
const ROOT = path.resolve(SCRIPT_DIR, '..');
const OUT = path.join(ROOT, 'public', 'pixel');

/* Palette. One warm-plum ink family for ALL outlines; pastoral grounds;
 * dept accents pinned to lead hues: marketing 330 pink, finance 45 gold,
 * legal 210 blue, support 160 teal, operations 20 orange, hr 270 violet. */
const INK = '#2e1f2c';
const DETAIL_INK = '#46303e';
const PAPER = '#f2e7cd';
const SEMANTIC = {
  task: '#4a80cb',
  artifact: '#48954e',
  permission: '#bd8430',
  escalation: '#d15a49',
  guard: '#8a63c9',
  human: '#e3ae52',
};
const GRASS = { base: '#82b259', dark: '#75a44e', light: '#8fbf66' };
const BLADE_DARK = '#69984a';
const BLADE_LIGHT = '#9cc971';
const DIRT = { rim: '#96774c', base: '#c2a06c', light: '#d2b47e', dark: '#aa885a' };
const STONE = { light: '#cdc19f', mid: '#bcae8b', joint: '#8a7a5e', earth: '#cdbd97' };
const WATER = { shallow: '#71a6c2', deep: '#54849f', spark: '#aad2e2', sand: '#d9c28d' };
const WOOD = '#8a6238'; const WOOD_D = '#6b4a2a'; const WOOD_L = '#a37a4c';
const PLAS_L = '#efe1ba'; const PLAS = '#e3cfa2'; const PLAS_D = '#cbb183';
const WALL_STONE = { light: '#c8bca4', mid: '#b4a78d', dark: '#998b71', joint: '#7e7159' };
const CANOPY = { dark: '#4f8a42', base: '#61a24c', light: '#77b85d', hi: '#8ec76d' };
const TRUNK = '#7a5233'; const TRUNK_D = '#5f3f27';
const ROCK = { base: '#a39a8d', light: '#bdb4a7', dark: '#867e72' };
const GLASS = '#b9d5da'; const GLASS_L = '#ddeff0';
const GLOW = '#f4cf7e'; const GLOW_L = '#fbeab2';
const SHOE = '#3b2f28';
const WHITE = '#ffffff';

const PALETTE = {
  grass: { dark: '#5a8c38', base: '#75a843', light: '#8fc456', hi: '#a8de6d', shadow: '#436b28' },
  cliff: { top: '#98c55e', face: '#8a775e', faceD: '#6e5d47', edge: '#4e3f2f', hi: '#ab967b' },
  dirt: { rim: '#9a7547', base: '#c59f66', light: '#dcb880', dark: '#af8852', gravel: '#846237', pebble: '#e6cca0' },
  stone: { dark: '#685942', mid: '#96866b', base: '#b4a58b', light: '#d0c3ab', hi: '#e8dcce', joint: '#4d402e' },
  water: { sand: '#dec691', sandD: '#bda672', shallow: '#6ea6c4', mid: '#5089a4', deep: '#366982', spark: '#e6f5fb' },
  wood: { shadow: '#3e2612', dark: '#5a3b1e', base: '#875d34', light: '#a87c4e', hi: '#c69966' },
  foliage: { shadow: '#224818', dark: '#346626', base: '#4c8738', light: '#69aa4f', hi: '#88c96b', autumn: '#d4782b' },
  pine: { shadow: '#143012', dark: '#1e441c', base: '#2d5e2a', light: '#427c3c', hi: '#5b9e54' },
  trunk: { dark: '#4c301a', base: '#6e4727', light: '#8f6139' },
  farm: { soil: '#54361e', furrow: '#3a2211', soilL: '#6e4a2c', pumpkin: '#e28020', pumpkinL: '#f59c3e', pumpkinD: '#b55d10', carrot: '#e07424', carrotL: '#ff8c38', cabbage: '#5ea836', cabbageL: '#7ec752' },
  flowers: { pink: '#e88eb0', pinkL: '#f8bed2', yellow: '#e8b838', yellowL: '#f7d468', white: '#f2ece2', red: '#d6483c', blue: '#5c96d4', purple: '#9268cf' },
  white: '#ffffff',
  apple: '#c83426',
  appleL: '#ea5a4c',
};

function hex(s) {
  return [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
}
const COLOR_CACHE = new Map();
function colorOf(s) {
  let c = COLOR_CACHE.get(s);
  if (!c) { c = hex(s); COLOR_CACHE.set(s, c); }
  return c;
}
function mix(a, b, t) {
  const A = typeof a === 'string' ? hex(a) : a;
  const B = typeof b === 'string' ? hex(b) : b;
  return [
    Math.round(A[0] + (B[0] - A[0]) * t),
    Math.round(A[1] + (B[1] - A[1]) * t),
    Math.round(A[2] + (B[2] - A[2]) * t),
  ];
}
function mulC(c, f) {
  return [Math.min(255, Math.round(c[0] * f)), Math.min(255, Math.round(c[1] * f)), Math.min(255, Math.round(c[2] * f))];
}

/* Deterministic PRNG (mulberry32) + coordinate hash. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash2i(x, y) {
  let h = (x | 0) * 374761393 + (y | 0) * 668265263;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/* Minimal PNG encoder: 8-bit RGBA (color type 6), filter byte 0 per scanline,
 * zlib.deflateSync IDAT, CRC32-checked IHDR/IDAT/IEND. */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  if (data.length) data.copy(out, 8);
  const crcInput = Buffer.alloc(4 + data.length);
  crcInput.write(type, 0, 'ascii');
  if (data.length) data.copy(crcInput, 4);
  out.writeUInt32BE(crc32(crcInput), 8 + data.length);
  return out;
}
function encodePNG(cv) {
  const { w, h, data } = cv;
  const stride = w * 4 + 1;
  const raw = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    raw[y * stride] = 0;
    for (let x = 0; x < w * 4; x++) raw[y * stride + 1 + x] = data[y * w * 4 + x];
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

class Cv {
  constructor(w, h) { this.w = w; this.h = h; this.data = new Uint8ClampedArray(w * h * 4); }
  set(x, y, c, a = 255) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    if (typeof c === 'string') c = colorOf(c);
    const i = (y * this.w + x) * 4;
    this.data[i] = c[0]; this.data[i + 1] = c[1]; this.data[i + 2] = c[2]; this.data[i + 3] = a;
  }
  get(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return null;
    const i = (y * this.w + x) * 4;
    return [this.data[i], this.data[i + 1], this.data[i + 2], this.data[i + 3]];
  }
  fill(c) { for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) this.set(x, y, c); }
  rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c); }
  clearRect(x, y, w, h) {
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) {
        const px = x + i, py = y + j;
        if (px >= 0 && py >= 0 && px < this.w && py < this.h) this.data.fill(0, (py * this.w + px) * 4, (py * this.w + px) * 4 + 4);
      }
  }
  hline(x0, x1, y, c) { for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) this.set(x, y, c); }
  vline(x, y0, y1, c) { for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) this.set(x, y, c); }
  line(x0, y0, x1, y1, c, thick = 1) {
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy, x = x0, y = y0;
    const r = Math.floor((thick - 1) / 2);
    for (;;) {
      if (thick === 1) this.set(x, y, c);
      else for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) this.set(x + i, y + j, c);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x += sx; }
      if (e2 <= dx) { err += dx; y += sy; }
    }
  }
  disc(cx, cy, r, c) {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++)
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) this.set(x, y, c);
  }
  ellipse(cx, cy, rx, ry, c) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++)
        if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) this.set(x, y, c);
  }
  /* 1px outline: every transparent pixel 4-adjacent to an opaque one. */
  outline(color = INK) {
    const src = new Uint8ClampedArray(this.data);
    const solid = (x, y) => x >= 0 && y >= 0 && x < this.w && y < this.h && src[(y * this.w + x) * 4 + 3] > 0;
    const c = hex(color);
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (solid(x, y)) continue;
        if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) this.set(x, y, c);
      }
    return this;
  }
  blit(dst, dx, dy) {
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        const p = this.get(x, y);
        if (p && p[3] > 0) dst.set(dx + x, dy + y, p, p[3]);
      }
  }
}

function stampOutlined(dst, w, h, ax, ay, draw) {
  const s = new Cv(w, h);
  draw(s);
  s.outline(INK);
  s.blit(dst, ax, ay);
}

/* Pinned world layout — must stay in sync with src/map/pixel/layout.ts. */
const WORLD = { w: 960, h: 600 };
const PLAZA = { x: 480, y: 280, r: 85 };
const DEPTS = [
  { id: 'marketing',  x: 140, y: 70,  w: 96,  h: 84,  door: { x: 188, y: 160 }, hue: '#d76fa4', kind: 'stall' },
  { id: 'finance',    x: 420, y: 45,  w: 120, h: 100, door: { x: 480, y: 145 }, hue: '#d9a83e', kind: 'bank' },
  { id: 'legal',      x: 720, y: 65,  w: 112, h: 96,  door: { x: 776, y: 165 }, hue: '#5b87c5', kind: 'court' },
  { id: 'support',    x: 140, y: 320, w: 104, h: 92,  door: { x: 192, y: 415 }, hue: '#3f9e85', kind: 'tavern' },
  { id: 'operations', x: 710, y: 310, w: 124, h: 108, door: { x: 772, y: 420 }, hue: '#d07a35', kind: 'mill' },
  { id: 'hr',         x: 428, y: 420, w: 104, h: 88,  door: { x: 480, y: 510 }, hue: '#9067bf', kind: 'hall' },
];
function segDist(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay;
  const wx = px - ax, wy = py - ay;
  const L2 = vx * vx + vy * vy;
  const t = L2 === 0 ? 0 : Math.max(0, Math.min(1, (wx * vx + wy * vy) / L2));
  return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
}

function makeValueNoise(seed, gw, gh) {
  const rnd = mulberry32(seed);
  const g = new Float32Array(gw * gh);
  for (let i = 0; i < g.length; i++) g[i] = rnd();
  return (u, v) => {
    const x0 = Math.floor(u), y0 = Math.floor(v);
    const fx = u - x0, fy = v - y0;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const X0 = ((x0 % gw) + gw) % gw, X1 = (X0 + 1) % gw;
    const Y0 = ((y0 % gh) + gh) % gh, Y1 = (Y0 + 1) % gh;
    const a = g[Y0 * gw + X0], b = g[Y0 * gw + X1];
    const c = g[Y1 * gw + X0], d = g[Y1 * gw + X1];
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}

function buildBackground() {
  const cv = new Cv(WORLD.w, WORLD.h);

  // 1. Organic Base Grass Terrain
  const nGrass1 = makeValueNoise(42, 30, 20);
  const nGrass2 = makeValueNoise(1337, 80, 50);
  for (let y = 0; y < WORLD.h; y++) {
    for (let x = 0; x < WORLD.w; x++) {
      const v = nGrass1(x / 26, y / 26) * 0.65 + nGrass2(x / 8, y / 8) * 0.35;
      const col = v < 0.35 ? PALETTE.grass.dark : v > 0.62 ? PALETTE.grass.light : PALETTE.grass.base;
      cv.set(x, y, col);
    }
  }

  // Authentic Stardew clover & grass tufts
  const rng = mulberry32(0xCAFE);
  for (let i = 0; i < 3200; i++) {
    const x = 12 + ((rng() * (WORLD.w - 24)) | 0);
    const y = 12 + ((rng() * (WORLD.h - 24)) | 0);
    cv.set(x, y, PALETTE.grass.shadow);
    cv.set(x - 1, y - 1, PALETTE.grass.dark);
    cv.set(x + 1, y - 1, PALETTE.grass.dark);
    cv.set(x, y - 2, PALETTE.grass.hi);
  }

  // 2. Horizon Forest Treeline (Dense natural canopy layer framing the valley)
  for (let x = -10; x < WORLD.w + 20; x += 12) {
    const pr = mulberry32(0x9812 + x * 41);
    const depth = 28 + Math.floor(pr() * 10);
    cv.rect(x + 4, depth, 4, 18, PALETTE.trunk.dark);
    cv.rect(x + 5, depth, 2, 18, PALETTE.trunk.base);
    cv.disc(x + 6, depth - 6, 20, PALETTE.foliage.shadow);
    cv.disc(x + 6, depth - 10, 16, PALETTE.foliage.dark);
    cv.disc(x + 5, depth - 13, 13, PALETTE.foliage.base);
    cv.disc(x + 4, depth - 16, 8, PALETTE.foliage.light);
  }

  // 3. Central Town Square Plaza (x: 380..580, y: 190..370)
  const psq = { x0: 380, y0: 190, x1: 580, y1: 370 };
  for (let y = psq.y0 - 3; y <= psq.y1 + 3; y++)
    for (let x = psq.x0 - 3; x <= psq.x1 + 3; x++)
      cv.set(x, y, PALETTE.stone.joint);

  for (let y = psq.y0; y <= psq.y1; y++) {
    for (let x = psq.x0; x <= psq.x1; x++) {
      const gx = Math.floor((x - psq.x0) / 12);
      const gy = Math.floor((y - psq.y0) / 8);
      const offset = (gy % 2) * 6;
      const lx = (x - psq.x0 + offset) % 12;
      const ly = (y - psq.y0) % 8;
      const isJoint = lx === 0 || ly === 0;
      const h = hash2i(gx * 19 + 7, gy * 31 + 13);
      let col = h < 0.35 ? PALETTE.stone.mid : h < 0.7 ? PALETTE.stone.base : PALETTE.stone.light;
      if (lx === 1 && ly > 1 && ly < 7) col = mix(col, PALETTE.white, 0.2);
      if (ly === 1 && lx > 1 && lx < 11) col = mix(col, PALETTE.white, 0.2);
      if (isJoint) col = PALETTE.stone.joint;
      cv.set(x, y, col);
    }
  }

  // Stone curbs framing the entire plaza perimeter
  cv.rect(psq.x0, psq.y0, psq.x1 - psq.x0 + 1, 3, PALETTE.stone.dark);
  cv.rect(psq.x0, psq.y1 - 2, psq.x1 - psq.x0 + 1, 3, PALETTE.stone.dark);
  cv.rect(psq.x0, psq.y0, 3, psq.y1 - psq.y0 + 1, PALETTE.stone.dark);
  cv.rect(psq.x1 - 2, psq.y0, 3, psq.y1 - psq.y0 + 1, PALETTE.stone.dark);

  // Central Stone Fountain in Plaza
  stampOutlined(cv, 40, 40, 460, 260, (p) => {
    p.disc(20, 20, 18, PALETTE.stone.joint);
    p.disc(20, 20, 16, PALETTE.stone.dark);
    p.disc(20, 20, 14, PALETTE.stone.mid);
    p.disc(20, 20, 12, PALETTE.water.deep);
    p.disc(20, 20, 9, PALETTE.water.shallow);
    p.disc(20, 20, 5, PALETTE.stone.light);
    p.disc(20, 20, 3, PALETTE.water.spark);
    p.set(20, 20, PALETTE.white);
  });

  // 4. Rich, Detailed Village Roads
  function roadDisc(cx, cy, r, seed) {
    const rimR = r + 2;
    for (let dy = -rimR; dy <= rimR; dy++) {
      for (let dx = -rimR; dx <= rimR; dx++) {
        const d2 = dx * dx + dy * dy;
        const px = Math.round(cx + dx);
        const py = Math.round(cy + dy);
        if (d2 <= r * r) {
          const n = hash2i(px * 17, py * 23);
          const isRut = Math.abs(dy) > r * 0.3 && Math.abs(dy) < r * 0.7;
          let col = isRut ? PALETTE.dirt.dark : (n < 0.25 ? PALETTE.dirt.light : (n < 0.75 ? PALETTE.dirt.base : PALETTE.dirt.dark));
          if (n > 0.94) col = PALETTE.dirt.pebble;
          else if (n < 0.04) col = PALETTE.dirt.gravel;
          cv.set(px, py, col);
        } else if (d2 <= rimR * rimR) {
          if (hash2i(px * 31, py * 47) > 0.35) {
            cv.set(px, py, PALETTE.dirt.rim);
          }
        }
      }
    }
  }

  function detailedRoad(ax, ay, bx, by, width = 22) {
    const dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy);
    const steps = Math.ceil(len / 1.5);
    const halfW = width / 2;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      roadDisc(ax + dx * t, ay + dy * t, halfW, Math.floor(0xFEED + i * 37));
    }
  }

  // Main village roads (flush with junctions and plaza)
  detailedRoad(140, 165, 820, 165, 22); // North Street
  detailedRoad(140, 415, 820, 415, 22); // South Street
  detailedRoad(480, 140, 480, 178, 24); // North Avenue
  detailedRoad(480, 382, 480, 415, 24); // South Avenue
  detailedRoad(480, 415, 480, 502, 16); // Hall Walk — South Avenue to the hall's stone path
  detailedRoad(150, 165, 150, 415, 18); // West Lane
  detailedRoad(810, 165, 810, 415, 18); // East Lane
  detailedRoad(150, 415, 110, 475, 14); // Lakeside Path

  // 5. Building Aprons & Courtyards
  stampOutlined(cv, 104, 26, 136, 148, (p) => {
    p.rect(0, 0, 104, 22, PALETTE.wood.dark);
    p.rect(1, 1, 102, 20, PALETTE.wood.base);
    for (let x = 6; x < 100; x += 6) p.vline(x, 1, 20, PALETTE.wood.dark);
    p.hline(1, 102, 1, PALETTE.wood.light);
    p.rect(6, 4, 16, 12, PALETTE.wood.dark); p.rect(7, 5, 14, 10, PALETTE.farm.soilL);
    for (let x = 9; x <= 17; x += 3) { p.set(x, 8, PALETTE.apple); p.set(x + 1, 8, PALETTE.appleL); }
    p.rect(26, 4, 16, 12, PALETTE.wood.dark); p.rect(27, 5, 14, 10, PALETTE.farm.soilL);
    for (let x = 29; x <= 37; x += 3) { p.set(x, 8, PALETTE.farm.cabbage); p.set(x + 1, 8, PALETTE.farm.cabbageL); }
  });

  stampOutlined(cv, 134, 28, 413, 138, (p) => {
    p.rect(0, 0, 134, 26, PALETTE.stone.dark);
    p.rect(2, 2, 130, 22, PALETTE.stone.base);
    p.hline(2, 131, 2, PALETTE.stone.light);
    p.rect(42, 14, 50, 12, PALETTE.stone.mid);
    p.hline(42, 91, 14, PALETTE.stone.hi);
    p.hline(42, 91, 25, PALETTE.stone.dark);
    p.disc(24, 10, 8, PALETTE.foliage.dark); p.disc(24, 8, 6, PALETTE.foliage.base); p.disc(23, 6, 3, PALETTE.foliage.light);
    p.disc(110, 10, 8, PALETTE.foliage.dark); p.disc(110, 8, 6, PALETTE.foliage.base); p.disc(109, 6, 3, PALETTE.foliage.light);
  });

  stampOutlined(cv, 124, 26, 714, 153, (p) => {
    p.rect(0, 0, 124, 22, PALETTE.stone.dark);
    p.rect(2, 2, 120, 18, PALETTE.stone.mid);
    for (let x = 12; x < 114; x += 12) p.vline(x, 2, 19, PALETTE.stone.joint);
    p.hline(2, 121, 2, PALETTE.stone.light);
  });

  stampOutlined(cv, 114, 24, 135, 403, (p) => {
    p.rect(0, 0, 114, 20, PALETTE.wood.dark);
    p.rect(1, 1, 112, 18, PALETTE.wood.base);
    for (let x = 6; x < 110; x += 6) p.vline(x, 1, 18, PALETTE.wood.dark);
    p.hline(1, 112, 1, PALETTE.wood.light);
    p.ellipse(14, 9, 6, 8, PALETTE.wood.dark); p.ellipse(14, 9, 4, 6, PALETTE.wood.light);
    p.ellipse(26, 9, 6, 8, PALETTE.wood.dark); p.ellipse(26, 9, 4, 6, PALETTE.wood.light);
  });

  stampOutlined(cv, 120, 32, 420, 496, (p) => {
    p.rect(0, 0, 120, 28, PALETTE.farm.soilL);
    p.rect(2, 2, 116, 24, PALETTE.grass.light);
    const fls = [PALETTE.flowers.pink, PALETTE.flowers.yellow, PALETTE.flowers.red, PALETTE.flowers.white];
    for (let x = 8; x <= 42; x += 6) {
      p.disc(x, 10, 3, fls[x % fls.length]); p.set(x, 9, PALETTE.white);
    }
    for (let x = 78; x <= 112; x += 6) {
      p.disc(x, 10, 3, fls[x % fls.length]); p.set(x, 9, PALETTE.white);
    }
    p.rect(50, 0, 20, 28, PALETTE.stone.mid);
    p.hline(50, 69, 1, PALETTE.stone.light);
  });

  // 6. Scenic Lily Pond & Fishing Dock
  stampOutlined(cv, 165, 115, 16, 455, (p) => {
    p.ellipse(82, 60, 75, 48, PALETTE.water.sand);
    p.ellipse(82, 60, 68, 42, PALETTE.water.sandD);
    p.ellipse(82, 60, 64, 38, PALETTE.water.shallow);
    p.ellipse(84, 62, 52, 30, PALETTE.water.mid);
    p.ellipse(87, 64, 40, 22, PALETTE.water.deep);
    const sparks = [[55, 52], [72, 47], [98, 54], [112, 62], [82, 67], [68, 72], [100, 74]];
    for (const [sx, sy] of sparks) {
      p.set(sx, sy, PALETTE.water.spark); p.set(sx + 1, sy, PALETTE.white);
    }
    p.rect(106, 46, 44, 20, PALETTE.wood.dark);
    p.rect(107, 47, 42, 18, PALETTE.wood.base);
    for (let x = 112; x <= 144; x += 5) p.vline(x, 47, 64, PALETTE.wood.dark);
    p.hline(107, 148, 47, PALETTE.wood.light);
    p.rect(109, 65, 4, 9, PALETTE.trunk.dark);
    p.rect(145, 65, 4, 9, PALETTE.trunk.dark);
    p.ellipse(122, 84, 15, 7, PALETTE.wood.dark);
    p.ellipse(122, 84, 13, 5, PALETTE.wood.base);
    p.set(122, 84, PALETTE.wood.light);
    const lilies = [[45, 54], [62, 64], [88, 52], [105, 74], [50, 78]];
    for (const [lx, ly] of lilies) {
      p.disc(lx, ly, 4, PALETTE.foliage.base);
      p.set(lx, ly, PALETTE.flowers.pink);
      p.set(lx + 1, ly - 1, PALETTE.white);
    }
    const reeds = [[25, 38], [34, 44], [146, 34], [154, 40]];
    for (const [rx, ry] of reeds) {
      p.vline(rx, ry, ry + 18, PALETTE.foliage.dark);
      p.vline(rx + 1, ry + 2, ry + 18, PALETTE.foliage.base);
      p.rect(rx, ry, 2, 6, PALETTE.trunk.base);
    }
  });

  // 7. Farmstead Garden Plots (Spaced, prominent pumpkin vines and carrot clusters)
  function farmPlot(x, y, w, h, crop) {
    stampOutlined(cv, w, h, x, y, (p) => {
      p.rect(0, 0, w, h, PALETTE.farm.soil);
      p.rect(1, 1, w - 2, h - 2, PALETTE.farm.furrow);

      if (crop === 'pumpkin') {
        for (let row = 7; row < h - 8; row += 16) {
          p.rect(3, row - 3, w - 6, 8, PALETTE.farm.soilL);
          p.hline(3, w - 4, row + 5, PALETTE.farm.furrow);
          for (let col = 12; col < w - 10; col += 20) {
            p.line(col - 6, row + 1, col + 6, row - 1, PALETTE.foliage.base, 1);
            p.set(col - 4, row, PALETTE.foliage.light);
            p.disc(col, row, 4, PALETTE.farm.pumpkin);
            p.disc(col - 1, row - 1, 3, PALETTE.farm.pumpkinL);
            p.set(col + 2, row + 2, PALETTE.farm.pumpkinD);
            p.set(col, row - 3, PALETTE.foliage.dark);
          }
        }
      } else if (crop === 'carrot') {
        for (let row = 6; row < h - 6; row += 14) {
          p.rect(3, row - 2, w - 6, 7, PALETTE.farm.soilL);
          p.hline(3, w - 4, row + 4, PALETTE.farm.furrow);
          for (let col = 10; col < w - 8; col += 14) {
            p.disc(col, row + 2, 2, PALETTE.farm.carrot);
            p.set(col, row + 1, PALETTE.farm.carrotL);
            p.disc(col, row - 1, 3, PALETTE.foliage.light);
            p.disc(col, row - 2, 2, PALETTE.foliage.hi);
            p.set(col - 1, row, PALETTE.foliage.base);
            p.set(col + 1, row, PALETTE.foliage.dark);
          }
        }
      }
    });
  }

  farmPlot(835, 310, 96, 56, 'pumpkin');
  farmPlot(835, 380, 96, 56, 'carrot');

  // --- Northwest Market Flower & Berry Nursery Yard ---
  stampOutlined(cv, 92, 70, 24, 75, (p) => {
    p.rect(10, 10, 72, 50, PALETTE.farm.soilL);
    p.rect(12, 12, 68, 46, PALETTE.farm.soil);
    const fls = [PALETTE.flowers.pink, PALETTE.flowers.yellow, PALETTE.flowers.red, PALETTE.flowers.blue, PALETTE.flowers.purple];
    for (let row = 18; row <= 48; row += 12) {
      p.hline(14, 76, row + 3, PALETTE.farm.furrow);
      for (let col = 18; col <= 72; col += 10) {
        const c = fls[(col * 7 + row * 13) % fls.length];
        p.disc(col, row, 3, c);
        p.set(col, row - 1, PALETTE.white);
        p.set(col, row + 2, PALETTE.foliage.dark);
      }
    }
  });

  // --- Southwest Tavern Lakeside Beer Garden & Picnic Yard ---
  stampOutlined(cv, 92, 72, 24, 325, (p) => {
    p.rect(8, 8, 76, 56, PALETTE.grass.light);
    p.rect(12, 12, 68, 48, PALETTE.stone.base);
    for (let px = 12; px <= 80; px += 10) p.vline(px, 12, 59, PALETTE.stone.joint);
    for (let py = 12; py <= 60; py += 8) p.hline(12, 79, py, PALETTE.stone.joint);
    p.rect(26, 26, 36, 16, PALETTE.wood.dark);
    p.rect(28, 28, 32, 12, PALETTE.wood.base);
    p.hline(28, 59, 28, PALETTE.wood.light);
    p.rect(22, 29, 4, 10, PALETTE.wood.base);
    p.rect(62, 29, 4, 10, PALETTE.wood.base);
    p.set(38, 32, '#fae38e'); p.set(48, 32, '#fae38e');
    p.set(38, 31, PALETTE.white); p.set(48, 31, PALETTE.white);
    p.rect(14, 14, 20, 6, PALETTE.wood.dark); p.rect(15, 15, 18, 4, PALETTE.wood.base);
    p.set(18, 14, PALETTE.flowers.pink); p.set(24, 14, PALETTE.flowers.yellow); p.set(30, 14, PALETTE.flowers.red);
    p.rect(54, 14, 20, 6, PALETTE.wood.dark); p.rect(55, 15, 18, 4, PALETTE.wood.base);
    p.set(58, 14, PALETTE.flowers.blue); p.set(64, 14, PALETTE.flowers.purple); p.set(70, 14, PALETTE.flowers.yellow);
  });

  // 8. Sensible Enclosing Fences
  function fenceH(x, y, len) {
    stampOutlined(cv, len, 9, x, y, (p) => {
      p.hline(0, len - 1, 2, PALETTE.wood.dark);
      p.hline(0, len - 1, 3, PALETTE.wood.base);
      p.hline(0, len - 1, 6, PALETTE.wood.dark);
      p.hline(0, len - 1, 7, PALETTE.wood.base);
      for (let px = 2; px <= len - 4; px += 10) {
        p.rect(px, 0, 3, 8, PALETTE.wood.base);
        p.vline(px, 0, 8, PALETTE.wood.light);
        p.vline(px + 2, 0, 8, PALETTE.wood.dark);
      }
    });
  }

  function fenceV(x, y, len) {
    stampOutlined(cv, 9, len, x, y, (p) => {
      p.vline(2, 0, len - 1, PALETTE.wood.dark);
      p.vline(3, 0, len - 1, PALETTE.wood.base);
      p.vline(6, 0, len - 1, PALETTE.wood.dark);
      p.vline(7, 0, len - 1, PALETTE.wood.base);
      for (let py = 2; py <= len - 4; py += 10) {
        p.rect(0, py, 8, 3, PALETTE.wood.base);
        p.hline(0, 8, py, PALETTE.wood.light);
        p.hline(0, 8, py + 2, PALETTE.wood.dark);
      }
    });
  }

  // A. Farmstead Enclosure
  fenceH(830, 298, 105);
  fenceV(934, 298, 148);
  fenceH(830, 444, 105);
  fenceV(830, 298, 50);
  fenceV(830, 394, 52); // Gate gap

  // B. Marketplace Nursery Yard Enclosure (Fully enclosing the flower nursery)
  fenceH(24, 75, 96);
  fenceV(24, 75, 72);
  fenceH(24, 145, 96);
  fenceV(116, 75, 30);

  // C. Tavern Beer Garden Enclosure (Fully enclosing the picnic patio)
  fenceH(24, 325, 96);
  fenceV(24, 325, 74);
  fenceH(24, 397, 96);
  fenceV(116, 325, 32);

  // D. Town Hall Garden Pickets
  fenceH(420, 526, 45);
  fenceH(495, 526, 45);

  // 9. Hand-Crafted Tree Generators
  function pineTree(bx, by) {
    const w = 32, h = 56;
    stampOutlined(cv, w, h, bx - 16, by - h + 1, (p) => {
      p.rect(14, h - 10, 4, 9, PALETTE.trunk.base);
      p.vline(17, h - 10, h - 2, PALETTE.trunk.dark);
      p.disc(16, 36, 12, PALETTE.pine.base);
      p.disc(15, 35, 11, PALETTE.pine.dark);
      p.disc(14, 34, 9, PALETTE.pine.base);
      p.disc(13, 33, 6, PALETTE.pine.light);
      p.disc(16, 24, 10, PALETTE.pine.base);
      p.disc(15, 23, 9, PALETTE.pine.dark);
      p.disc(14, 22, 7, PALETTE.pine.light);
      p.disc(13, 21, 4, PALETTE.pine.hi);
      p.disc(16, 13, 7, PALETTE.pine.base);
      p.disc(15, 12, 6, PALETTE.pine.light);
      p.disc(14, 11, 3, PALETTE.pine.hi);
      p.set(16, 3, PALETTE.pine.hi);
      p.vline(16, 4, 10, PALETTE.pine.light);
    });
  }

  function oakTree(bx, by, big = true) {
    const w = big ? 50 : 36, h = big ? 62 : 44;
    stampOutlined(cv, w, h, bx - (w >> 1), by - h + 1, (p) => {
      const tw = big ? 6 : 4;
      const tx = (w - tw) >> 1;
      p.rect(tx, h - 14, tw, 13, PALETTE.trunk.base);
      p.vline(tx + tw - 1, h - 14, h - 2, PALETTE.trunk.dark);
      p.set(tx - 1, h - 2, PALETTE.trunk.base); p.set(tx + tw, h - 2, PALETTE.trunk.dark);
      const cr = big ? 18 : 13;
      const ccx = w >> 1, ccy = h - 16 - cr + (big ? 2 : 1);
      const lobes = big
        ? [[0, 0, cr], [-cr + 3, 5, 13], [cr - 3, 5, 13], [-9, -cr + 4, 12], [9, -cr + 4, 12], [0, -cr + 2, 11]]
        : [[0, 0, cr], [-cr + 3, 4, 10], [cr - 3, 4, 10], [0, -cr + 3, 9]];
      for (const [ox, oy, r] of lobes) p.disc(ccx + ox, ccy + oy, r, PALETTE.foliage.base);
      for (const [ox, oy, r] of lobes) p.disc(ccx + ox + 1, ccy + oy + 1, r - 1, PALETTE.foliage.dark);
      for (const [ox, oy, r] of lobes) {
        p.disc(ccx + ox - 1, ccy + oy - 1, Math.max(2, r - 2), PALETTE.foliage.base);
        p.disc(ccx + ox - 2, ccy + oy - 2, Math.max(2, r - 4), PALETTE.foliage.light);
        p.disc(ccx + ox - 3, ccy + oy - 3, Math.max(1, r - 6), PALETTE.foliage.hi);
      }
    });
  }

  function appleTree(bx, by) {
    const w = 38, h = 48;
    stampOutlined(cv, w, h, bx - 19, by - h + 1, (p) => {
      p.rect(17, h - 11, 4, 10, PALETTE.trunk.base);
      p.vline(20, h - 11, h - 2, PALETTE.trunk.dark);
      p.disc(19, 21, 15, PALETTE.foliage.base);
      p.disc(20, 22, 14, PALETTE.foliage.dark);
      p.disc(18, 19, 13, PALETTE.foliage.light);
      p.disc(16, 17, 10, PALETTE.foliage.hi);
      const apples = [
        [14, 16], [25, 15], [17, 23], [28, 22],
        [12, 23], [20, 12], [23, 27], [14, 27],
      ];
      for (const [ax, ay] of apples) {
        p.disc(ax, ay, 2, PALETTE.apple);
        p.set(ax - 1, ay - 1, PALETTE.appleL);
        p.set(ax + 1, ay + 1, INK);
      }
    });
  }

  // Clustered Tree Groves
  oakTree(35, 60, false);
  appleTree(265, 60);

  pineTree(370, 45);
  pineTree(590, 45);

  pineTree(885, 75);
  oakTree(915, 95, true);
  appleTree(645, 55);

  oakTree(270, 260, true);
  appleTree(320, 280);
  pineTree(240, 310);

  oakTree(690, 260, true);
  pineTree(730, 290);
  appleTree(650, 240);

  appleTree(270, 480);
  oakTree(320, 520, false);
  pineTree(230, 540);

  oakTree(690, 490, true);
  pineTree(735, 530);
  appleTree(645, 520);

  pineTree(925, 250);
  pineTree(925, 480);
  oakTree(895, 530, false);
  appleTree(480, 580);

  // 10. Street Lanterns along the roads
  function streetLamp(x, y) {
    stampOutlined(cv, 10, 22, x - 5, y - 20, (p) => {
      p.rect(4, 8, 2, 12, PALETTE.stone.dark);
      p.rect(3, 18, 4, 2, PALETTE.stone.dark);
      p.rect(2, 4, 6, 4, PALETTE.stone.dark);
      p.rect(3, 5, 4, 2, '#fae38e');
      p.set(4, 5, PALETTE.white);
      p.rect(3, 2, 4, 2, PALETTE.stone.dark);
      p.set(4, 1, PALETTE.stone.dark);
    });
  }

  streetLamp(370, 152);
  streetLamp(590, 152);
  streetLamp(370, 404);
  streetLamp(590, 404);
  streetLamp(138, 280);
  streetLamp(822, 280);

  // 11. Wildflower Meadows
  const fr = mulberry32(0xF10E);
  const flist = [
    PALETTE.flowers.pink, PALETTE.flowers.yellow, PALETTE.flowers.white,
    PALETTE.flowers.red, PALETTE.flowers.blue, PALETTE.flowers.purple,
  ];
  for (let p = 0; p < 28; p++) {
    const px = 30 + Math.floor(fr() * (WORLD.w - 60));
    const py = 60 + Math.floor(fr() * (WORLD.h - 100));
    if (px > psq.x0 - 15 && px < psq.x1 + 15 && py > psq.y0 - 15 && py < psq.y1 + 15) continue;
    const col = flist[p % flist.length];
    for (let f = 0; f < 4; f++) {
      const fx = px + Math.floor(fr() * 12) - 6;
      const fy = py + Math.floor(fr() * 8) - 4;
      cv.set(fx, fy, col);
      cv.set(fx, fy - 1, PALETTE.white);
      cv.set(fx, fy + 1, PALETTE.foliage.dark);
    }
  }

  return cv;
}
/* ── shared building helpers ─────────────────────────────────────────────── */
function accTones(hue) {
  return {
    main: hex(hue),
    light: mix(hue, WHITE, 0.32),
    dark: mix(hue, '#241a22', 0.3),
    deep: mix(hue, '#241a22', 0.52),
  };
}
function wallShaded(cv, x, y, w, h, base = PLAS) {
  cv.rect(x, y, w, h, base);
  cv.vline(x + w - 2, y, y + h - 1, PLAS_D);
  cv.vline(x + w - 1, y, y + h - 1, PLAS_D);
  cv.hline(x, x + w - 1, y + h - 1, PLAS_D);
  cv.vline(x, y, y + h - 1, PLAS_L);
}
function windowFrame(cv, x, y, w, h, glow = false) {
  cv.rect(x, y, w, h, WOOD_D);
  cv.rect(x + 1, y + 1, w - 2, h - 2, glow ? hex(GLOW) : hex(GLASS));
  const mx = x + (w >> 1), my = y + (h >> 1);
  cv.vline(mx, y + 1, y + h - 2, WOOD_D);
  cv.hline(x + 1, x + w - 2, my, WOOD_D);
  cv.set(x + 2, y + 2, glow ? hex(GLOW_L) : hex(GLASS_L));
}
function archShapeRaw(cv, cx, yTop, r, yBot, col) {
  for (let yy = 0; yy <= r; yy++) {
    const halfw = Math.max(1, Math.round(Math.sqrt(Math.max(0, r * r - (r - yy) ** 2))));
    cv.hline(cx - halfw, cx + halfw, yTop + yy, col);
  }
  cv.rect(cx - r, yTop + r + 1, 2 * r + 1, Math.max(0, yBot - (yTop + r)), col);
}
function archDoorway(cv, cx, yTop, yBot, r, fillCol, trimCol) {
  archShapeRaw(cv, cx, yTop, r, yBot, hex(trimCol));
  archShapeRaw(cv, cx, yTop + 1, r - 1, yBot - 1, hex(fillCol));
}
function doorPlanks(cv, cx, yTop, r, yBot, plankCol = WOOD_D) {
  for (let x = cx - r + 3; x <= cx + r - 3; x += 4) cv.vline(x, yTop + r, yBot - 2, plankCol);
}

/* ── buildings: one distinct silhouette per department ───────────────────── */

function buildMarketing() {
  const acc = accTones('#d76fa4');
  const cv = new Cv(96, 84);

  // parapet sign band
  cv.rect(8, 2, 80, 6, acc.main);
  cv.rect(8, 2, 80, 1, acc.light);
  cv.hline(8, 87, 7, acc.deep);
  cv.rect(41, 3, 14, 4, PAPER);
  cv.disc(45, 5, 2, acc.main);
  cv.rect(49, 4, 4, 2, acc.light);

  // striped awning with scalloped tabs
  for (let i = 0; i < 11; i++) {
    const sx = 4 + i * 8;
    const tone = i % 2 === 0 ? acc.main : PAPER;
    cv.rect(sx, 8, 8, 12, tone);
    cv.hline(sx, sx + 7, 8, i % 2 === 0 ? acc.light : mix(PAPER, WHITE, 0.5));
    if (i % 2 === 1) cv.rect(sx, 20, 8, 3, tone);
  }
  cv.vline(91, 8, 19, acc.dark);
  cv.hline(4, 91, 23, PLAS_D);

  // walls + timber posts
  wallShaded(cv, 8, 24, 80, 58);
  cv.rect(4, 20, 4, 62, WOOD);
  cv.vline(7, 20, 81, WOOD_D);
  cv.set(4, 20, WOOD_L);
  cv.rect(88, 20, 4, 62, WOOD);
  cv.vline(91, 20, 81, WOOD_D);
  cv.set(88, 20, WOOD_L);

  // display window with posters
  cv.rect(12, 30, 41, 33, WOOD_D);
  cv.rect(14, 32, 37, 29, '#d9c9a2');
  cv.hline(14, 50, 32, '#c6b48b');
  const posters = [
    [16, 34, (x, y, w, h) => { cv.rect(x, y, w, h, PAPER); cv.disc(x + 5, y + 4, 2, acc.main); cv.rect(x + 1, y + h - 3, w - 2, 2, CANOPY.base); }],
    [33, 34, (x, y, w, h) => { cv.rect(x, y, w, h, PAPER); for (const [tx, ty, tw] of [[1, 4, 4], [4, 2, 5], [8, 5, 5]]) cv.line(x + tx, y + ty + tw - 1, x + tx + tw - 1, y + ty, SEMANTIC.task, 1); cv.set(x + 11, y + 2, SEMANTIC.human); }],
    [16, 47, (x, y, w, h) => { cv.rect(x, y, w, h, acc.light); cv.line(x + 1, y + h - 2, x + w - 2, y + 1, acc.deep, 2); }],
    [33, 47, (x, y, w, h) => { cv.rect(x, y, w, h, PAPER); cv.disc(x + 3, y + h - 3, 3, CANOPY.base); cv.disc(x + 9, y + h - 3, 4, CANOPY.dark); cv.set(x + 4, y + 2, GLASS_L); }],
  ];
  for (const [x, y, art] of posters) {
    cv.rect(x - 1, y - 1, 17, 13, WOOD_D);
    art(x, y, 15, 11);
  }

  // door with dept-hue arch trim + hanging shop sign
  archDoorway(cv, 71, 40, 81, 9, WOOD, acc.deep);
  doorPlanks(cv, 71, 40, 9, 81);
  cv.set(67, 62, SEMANTIC.human); cv.set(75, 62, SEMANTIC.human);
  cv.rect(58, 30, 26, 8, acc.main);
  cv.rect(58, 30, 26, 1, acc.light);
  cv.hline(58, 83, 37, acc.deep);
  cv.rect(62, 32, 10, 4, PAPER);
  cv.line(63, 35, 70, 33, acc.main, 1);
  cv.hline(8, 87, 78, WOOD_D);
  cv.hline(8, 87, 81, WOOD_D);

  return cv.outline(INK);
}

function buildFinance() {
  const acc = accTones('#d9a83e');
  const cv = new Cv(120, 100);

  // ashlar wall
  for (let y = 33; y < 98; y++)
    for (let x = 6; x < 114; x++) {
      const band = Math.floor((y - 33) / 7);
      const off = (band % 2) * 7;
      const isJointY = (y - 33) % 7 === 0;
      const isJointX = ((x - off) % 14) === 0;
      let tone = WALL_STONE.mid;
      if (!isJointX) {
        const idx = Math.floor((x - off) / 14);
        const hv = hash2i(band * 31 + 5, idx * 17 + 11);
        tone = hv < 0.25 ? WALL_STONE.light : hv > 0.8 ? WALL_STONE.dark : WALL_STONE.mid;
        if (idx === 0 || x < 12) tone = WALL_STONE.light;
      }
      cv.set(x, y, isJointY || isJointX ? WALL_STONE.joint : tone);
    }

  // pilasters flanking the entrance
  for (const px of [30, 83]) {
    cv.rect(px, 40, 7, 54, WALL_STONE.light);
    cv.vline(px + 6, 40, 93, WALL_STONE.joint);
    cv.rect(px, 40, 7, 3, acc.main);
    cv.rect(px, 91, 7, 3, acc.main);
    cv.hline(px, px + 6, 43, acc.dark);
  }

  // pediment + cornice
  for (let y = 3; y <= 28; y++) {
    const hw = Math.round(((y - 3) * 112) / 25 / 2) + 2;
    cv.hline(59 - hw, 59 + hw, y, WALL_STONE.light);
    cv.set(59 - hw, y, acc.dark); cv.set(59 + hw, y, acc.dark);
  }
  cv.rect(6, 26, 108, 3, WALL_STONE.mid);
  cv.disc(59, 16, 6, acc.dark);
  cv.disc(59, 16, 5, GLASS);
  cv.vline(59, 12, 20, WOOD_D);
  cv.hline(55, 63, 16, WOOD_D);
  cv.set(57, 14, GLASS_L);
  cv.rect(2, 29, 116, 2, acc.main);
  cv.hline(2, 117, 31, acc.dark);
  cv.hline(2, 117, 32, WALL_STONE.joint);

  // windows
  for (const wx of [39, 72]) {
    cv.rect(wx, 54, 9, 14, WOOD_D);
    cv.rect(wx + 1, 55, 7, 12, GLASS);
    cv.hline(wx + 1, wx + 7, 61, WOOD_D);
    cv.vline(wx + 4, 55, 66, WOOD_D);
    cv.set(wx + 2, 56, GLASS_L);
    cv.hline(wx - 1, wx + 9, 68, acc.dark);
  }

  // grand arched double door + plaque
  archDoorway(cv, 60, 50, 93, 9, WOOD, acc.deep);
  doorPlanks(cv, 60, 50, 9, 93);
  cv.vline(60, 59, 91, WOOD_D);
  for (const hy of [62, 76]) { cv.set(55, hy, acc.main); cv.set(65, hy, acc.main); }
  cv.set(56, 70, SEMANTIC.human); cv.set(64, 70, SEMANTIC.human);
  cv.rect(53, 40, 14, 8, acc.main);
  cv.rect(54, 41, 12, 6, acc.light);
  cv.disc(60, 44, 2, acc.deep);

  // steps
  cv.rect(45, 94, 30, 2, WALL_STONE.light);
  cv.rect(41, 96, 38, 2, WALL_STONE.mid);
  cv.hline(41, 78, 95, WALL_STONE.joint);
  cv.hline(41, 78, 97, WALL_STONE.joint);

  return cv.outline(INK);
}

function buildLegal() {
  const acc = accTones('#5b87c5');
  const cv = new Cv(112, 96);

  // facade behind the colonnade
  cv.rect(12, 34, 88, 44, '#e0d4b0');

  // pediment
  for (let y = 2; y <= 27; y++) {
    const hw = Math.round(((y - 2) * 100) / 25 / 2) + 4;
    cv.hline(56 - hw, 56 + hw - 1, y, '#f2ecda');
    cv.set(56 - hw, y, acc.dark); cv.set(56 + hw - 1, y, acc.dark);
  }
  cv.disc(56, 16, 4, acc.main);
  cv.set(56, 15, acc.light); cv.set(55, 17, acc.deep);

  // entablature with frieze dashes
  cv.rect(10, 28, 92, 5, '#f2ecda');
  cv.hline(10, 101, 28, acc.light);
  for (let fx = 14; fx <= 96; fx += 8) cv.rect(fx, 30, 4, 2, acc.main);
  cv.hline(10, 101, 32, acc.deep);

  // four columns (paired bays flank the entrance)
  const shaft = ['#f6f0de', '#f6f0de', '#efe8d4', '#efe8d4', '#e6dcc0', '#e6dcc0', '#d8ceb4', '#d8ceb4'];
  for (const cx0 of [14, 32, 73, 91]) {
    cv.rect(cx0 - 1, 34, 10, 3, '#f2ecda');
    cv.hline(cx0 - 1, cx0 + 8, 36, acc.main);
    for (let i = 0; i < 8; i++) cv.vline(cx0 + i, 37, 74, shaft[i]);
    cv.rect(cx0 - 1, 75, 10, 3, '#f2ecda');
    cv.hline(cx0 - 1, cx0 + 8, 75, acc.main);
  }

  // tall central doorway with fanlight
  archShapeRaw(cv, 56, 44, 9, 77, acc.dark);
  archShapeRaw(cv, 56, 45, 8, 52, GLASS);
  archShapeRaw(cv, 56, 53, 8, 76, WOOD);
  doorPlanks(cv, 56, 45, 8, 76);
  cv.set(53, 64, SEMANTIC.human); cv.set(59, 64, SEMANTIC.human);
  cv.hline(50, 62, 52, WOOD_D);

  // side windows
  for (const wx of [22, 82]) {
    cv.rect(wx, 46, 9, 14, WOOD_D);
    cv.rect(wx + 1, 47, 7, 12, GLASS);
    cv.hline(wx + 1, wx + 7, 53, WOOD_D);
    cv.vline(wx + 4, 47, 58, WOOD_D);
    cv.set(wx + 2, 48, GLASS_L);
  }

  // broad steps
  cv.rect(14, 78, 84, 4, '#f2ecda');
  cv.hline(14, 97, 81, '#cfc5aa');
  cv.rect(10, 82, 92, 4, '#efe8d4');
  cv.hline(10, 101, 85, '#cfc5aa');
  cv.rect(6, 86, 100, 4, '#f2ecda');
  cv.hline(6, 105, 89, '#cfc5aa');
  cv.rect(2, 90, 108, 4, '#efe8d4');
  cv.hline(2, 109, 93, '#cfc5aa');

  return cv.outline(INK);
}

function buildSupport() {
  const acc = accTones('#3f9e85');
  const cv = new Cv(104, 92);

  // steep shingled gable roof
  for (let y = 2; y <= 26; y++) {
    const t = (y - 2) / 24;
    const hw = Math.round(8 + t * 42);
    cv.hline(52 - hw, 52 + hw, y, y % 3 === 0 ? '#6f4527' : '#8a5a3a');
    cv.set(52 - hw, y, '#9a6a44');
  }
  cv.rect(44, 2, 17, 2, WOOD_D);
  cv.hline(10, 93, 26, '#5a3820');

  // timber-framed plaster walls
  wallShaded(cv, 6, 27, 92, 58);
  cv.rect(6, 27, 92, 3, WOOD);
  cv.hline(6, 97, 29, WOOD_D);
  cv.rect(6, 54, 92, 3, WOOD);
  cv.hline(6, 97, 56, WOOD_D);
  for (const px of [6, 96]) {
    cv.rect(px, 27, 4, 58, WOOD);
    cv.vline(px + 3, 30, 84, WOOD_D);
  }

  // stone foundation
  cv.rect(6, 84, 92, 5, WALL_STONE.mid);
  for (let x = 6; x < 98; x += 12) cv.vline(x + ((Math.floor(x / 12) % 2) * 6), 84, 88, WALL_STONE.joint);
  cv.hline(6, 97, 84, WALL_STONE.joint);

  // glowing windows with teal shutters
  for (const wx of [16, 74]) {
    windowFrame(cv, wx, 38, 15, 17, true);
    for (const sx of [wx - 3, wx + 15]) {
      cv.rect(sx, 37, 3, 19, acc.main);
      cv.vline(sx + 2, 37, 55, acc.dark);
      cv.hline(sx, sx + 2, 46, acc.dark);
    }
  }
  // attic porthole
  cv.disc(52, 36, 4, WOOD_D);
  cv.disc(52, 36, 3, GLASS);
  cv.set(51, 35, GLASS_L);

  // arched door, teal trim, warm welcome
  archDoorway(cv, 52, 56, 83, 8, WOOD, acc.dark);
  doorPlanks(cv, 52, 56, 8, 83);
  cv.set(48, 70, SEMANTIC.human); cv.set(56, 70, SEMANTIC.human);
  cv.set(44, 84, GLOW); cv.set(60, 84, GLOW);

  // hanging tavern sign
  cv.rect(2, 32, 18, 3, WOOD_D);
  cv.vline(6, 35, 40, DETAIL_INK);
  cv.vline(14, 35, 40, DETAIL_INK);
  cv.rect(2, 41, 17, 14, acc.dark);
  cv.rect(3, 42, 15, 12, acc.main);
  cv.rect(7, 46, 7, 6, PAPER);
  cv.set(7, 45, PAPER); cv.set(9, 45, PAPER); cv.set(12, 45, PAPER);
  cv.set(14, 48, PAPER); cv.set(14, 49, PAPER);

  // chimney + smoke wisps
  cv.rect(84, 8, 7, 16, WALL_STONE.mid);
  cv.rect(83, 8, 9, 2, WALL_STONE.joint);
  cv.set(88, 4, '#cfd2d4'); cv.set(87, 2, '#dde0e2'); cv.set(89, 1, '#cfd2d4');

  return cv.outline(INK);
}

function buildOperations() {
  const acc = accTones('#d07a35');
  const cv = new Cv(124, 108);
  const HUB = { x: 61, y: 38 };

  // tapered tower: plaster upper, stone skirt
  for (let y = 36; y <= 105; y++) {
    const hw = 15 + Math.round(((y - 36) * 19) / 70);
    const stone = y >= 96;
    cv.hline(HUB.x - hw, HUB.x + hw, y, stone ? WALL_STONE.mid : PLAS);
    if (!stone) {
      cv.set(HUB.x - hw, y, PLAS_L);
      cv.set(HUB.x + hw - 1, y, PLAS_D);
      cv.set(HUB.x + hw, y, PLAS_D);
      if ((y - 36) % 6 === 5) cv.hline(HUB.x - hw + 1, HUB.x + hw - 2, y, PLAS_D);
    } else {
      cv.set(HUB.x - hw, y, WALL_STONE.light);
      cv.set(HUB.x + hw, y, WALL_STONE.dark);
      if ((y - 96) % 4 === 3) cv.hline(HUB.x - hw + 1, HUB.x + hw - 1, y, WALL_STONE.joint);
    }
  }
  cv.hline(HUB.x - 33, HUB.x + 33, 95, acc.deep);

  // sails: wooden spar + lattice cloth with slats
  for (const [ddx, ddy] of [[1, -1], [-1, -1], [1, 1], [-1, 1]]) {
    const qx = -ddy, qy = ddx;
    cv.line(HUB.x + ddx * 5, HUB.y + ddy * 5, HUB.x + ddx * 34, HUB.y + ddy * 34, WOOD_D, 3);
    for (let t = 10; t <= 33; t++) {
      for (let s = 0; s <= 4; s++) {
        const px = HUB.x + ddx * t + qx * s;
        const py = HUB.y + ddy * t + qy * s;
        cv.set(px, py, s === 0 ? WOOD_L : s === 4 ? '#d9c8a0' : '#ece0c0');
      }
      if ((t - 10) % 4 === 2) {
        cv.line(HUB.x + ddx * t, HUB.y + ddy * t, HUB.x + ddx * t + qx * 4, HUB.y + ddy * t + qy * 4, WOOD_D);
      }
    }
  }

  // orange cap with finial
  for (let y = 20; y <= 38; y++) {
    const t = (y - 20) / 18;
    const hw = Math.round(3 + t * 15);
    cv.hline(HUB.x - hw, HUB.x + hw, y, y % 3 === 1 ? acc.dark : acc.main);
    cv.set(HUB.x - hw, y, acc.light);
  }
  cv.vline(HUB.x, 15, 19, WOOD_D);
  cv.set(HUB.x, 14, acc.deep);
  cv.disc(HUB.x, HUB.y, 4, WOOD_D);
  cv.set(HUB.x, HUB.y, INK);

  // window + arched door
  cv.rect(56, 60, 11, 11, acc.deep);
  cv.rect(57, 61, 9, 9, GLASS);
  cv.hline(57, 65, 65, WOOD_D);
  cv.set(58, 62, GLASS_L);
  archDoorway(cv, HUB.x, 84, 105, 8, WOOD, acc.deep);
  doorPlanks(cv, HUB.x, 84, 8, 105);
  cv.set(HUB.x - 3, 94, SEMANTIC.human); cv.set(HUB.x + 3, 94, SEMANTIC.human);

  return cv.outline(INK);
}

function buildHr() {
  const acc = accTones('#9067bf');
  const cv = new Cv(104, 88);

  // cupola
  for (let y = 1; y <= 5; y++) {
    const hw = Math.round(((y - 1) * 7) / 4) + 1;
    cv.hline(51 - hw, 51 + hw, y, y % 2 === 0 ? acc.dark : acc.main);
  }
  cv.rect(45, 6, 13, 6, PLAS_D);
  cv.rect(46, 7, 11, 4, '#3a2a35');
  cv.rect(46, 6, 2, 5, PLAS_L);
  cv.rect(56, 6, 2, 5, PLAS_L);
  cv.rect(50, 8, 3, 3, SEMANTIC.human);
  cv.set(51, 11, SEMANTIC.human);

  // steep violet gable roof
  for (let y = 12; y <= 34; y++) {
    const t = (y - 12) / 22;
    const hw = Math.round(6 + t * 42);
    cv.hline(52 - hw, 52 + hw, y, y % 3 === 0 ? acc.dark : acc.main);
    cv.set(52 - hw, y, acc.light);
    cv.set(52 + hw, y, acc.deep);
  }
  cv.hline(4, 100, 34, acc.deep);

  // plaster walls
  wallShaded(cv, 10, 35, 84, 50);
  cv.hline(10, 93, 80, PLAS_D);
  cv.rect(10, 83, 84, 3, WALL_STONE.mid);
  cv.hline(10, 93, 83, WALL_STONE.joint);

  // pennant banner with emblem
  cv.hline(44, 59, 37, WOOD_D);
  cv.rect(45, 38, 14, 10, acc.main);
  cv.rect(45, 38, 14, 1, acc.light);
  cv.disc(52, 43, 2, PAPER);
  cv.set(52, 43, acc.deep);
  cv.clearRect(45, 46, 4, 2);
  cv.clearRect(55, 46, 4, 2);

  // arched double door
  archDoorway(cv, 52, 58, 84, 9, WOOD, acc.dark);
  doorPlanks(cv, 52, 58, 9, 84);
  cv.vline(52, 67, 82, WOOD_D);
  cv.set(48, 70, SEMANTIC.human); cv.set(56, 70, SEMANTIC.human);
  cv.rect(44, 84, 17, 1, WALL_STONE.light);

  // arched windows with flower boxes
  for (const wx of [16, 76]) {
    archDoorway(cv, wx + 5, 42, 62, 6, GLASS, acc.dark);
    cv.vline(wx + 5, 48, 60, acc.dark);
    cv.hline(wx + 1, wx + 9, 52, acc.dark);
    cv.set(wx + 3, 45, GLASS_L);
    cv.rect(wx - 1, 63, 13, 4, WOOD);
    cv.hline(wx - 1, wx + 11, 63, WOOD_L);
    for (const [bx, bc] of [[wx + 1, SEMANTIC.escalation], [wx + 5, '#e08ab0'], [wx + 9, SEMANTIC.human]]) {
      cv.set(bx, 62, CANOPY.base);
      cv.set(bx, 61, bc);
    }
  }

  return cv.outline(INK);
}
/* ── villagers: 144×24 strips, six 24×24 frames ───────────────────────────────
 * frameOrder: down0 down1 up0 up1 right0 right1. Head 8px (rows 2–9),
 * torso 8px (10–17), legs 5px (18–22), shoe sole row 23.
 * X0 = contact/idle stance, X1 = passing pose. */
const VARIANTS = [
  { skin: '#f2c99c', hair: '#4a3226', style: 'short',    outfit: 'vest',  top: '#4a80cb', pants: '#5a4a3c' },
  { skin: '#d9a878', hair: '#211a14', style: 'long',     outfit: 'apron', top: '#5f9e4e', pants: '#4e4438' },
  { skin: '#8a5a38', hair: '#151210', style: 'curly',    outfit: 'cloak', top: '#b0563e', pants: '#3e3630' },
  { skin: '#eec39a', hair: '#c99b4a', style: 'bun',      outfit: 'vest',  top: '#c99a35', pants: '#54483c' },
  { skin: '#c68d5e', hair: '#33241c', style: 'braids',   outfit: 'apron', top: '#3f9e85', pants: '#46484e' },
  { skin: '#f2c99c', hair: '#7a5aa0', style: 'wavy',     outfit: 'cloak', top: '#6a4e8e', pants: '#3e3630' },
  { skin: '#e8b98c', hair: '#b8b2a6', style: 'beard',    outfit: 'sash',  top: '#7a5a38', pants: '#4a4038' },
  { skin: '#6b452c', hair: '#121212', style: 'ponytail', outfit: 'scarf', top: '#3e4a6b', pants: '#33302c' },
];
const HAIR_GRAY = '#b8b2a6';
const SHIRT = '#efe6cf';

function drawVillagerLegs(cv, v, view, step) {
  const pants = hex(v.pants), shoe = hex(SHOE), shoeD = mix(SHOE, '#181210', 0.4);
  const leg = (x, w, h, sx, sw) => {
    cv.rect(x, 18, w, h, pants);
    cv.rect(sx, 18 + h, sw, 22 - (18 + h), shoe);
    cv.rect(sx, 22, sw, 1, shoeD);
  };
  if (view === 'right') {
    if (step === 0) {
      leg(12, 3, 3, 12, 4);
      leg(8, 3, 2, 7, 3);
    } else {
      leg(10, 4, 3, 10, 4);
    }
  } else {
    if (step === 0) {
      leg(8, 3, 3, 7, 4);
      leg(13, 3, 3, 13, 4);
    } else {
      leg(9, 3, 3, 9, 3);
      leg(12, 3, 3, 12, 3);
    }
  }
}

function drawVillagerTorso(cv, v, view) {
  const top = hex(v.top), topD = mix(v.top, '#241a22', 0.35), topL = mix(v.top, '#ffffff', 0.2);
  const shirt = hex(SHIRT), shirtD = mix(SHIRT, '#241a22', 0.2);
  const belt = hex('#43332a');
  const kind = v.outfit;
  const x0 = view === 'right' ? 8 : 7;
  const w = view === 'right' ? 8 : 10;

  cv.rect(x0, 10, w, 7, top);

  if (kind === 'vest') {
    if (view === 'down') {
      cv.rect(10, 10, 4, 6, shirt);
      cv.vline(11, 12, 15, shirtD);
      cv.rect(7, 10, 3, 7, top);
      cv.rect(14, 10, 3, 7, top);
      cv.set(9, 13, topD); cv.set(9, 15, topD);
    } else if (view === 'right') {
      cv.rect(x0 + 4, 10, 3, 6, shirt);
      cv.rect(x0, 10, 4, 7, top);
    }
  } else if (kind === 'apron') {
    if (view === 'down') {
      cv.rect(9, 10, 6, 2, shirt);
      cv.rect(9, 12, 6, 5, shirt);
      cv.rect(7, 10, 2, 7, top);
      cv.rect(15, 10, 2, 7, top);
      cv.hline(9, 14, 14, shirtD);
    } else if (view === 'right') {
      cv.rect(x0 + 3, 11, 4, 6, shirt);
      cv.rect(x0, 10, 3, 7, top);
    }
  } else if (kind === 'cloak') {
    cv.rect(x0, 10, w, 2, topL);
    cv.rect(x0, 16, w, 1, topD);
    if (view === 'down') {
      cv.rect(11, 11, 2, 2, hex(SEMANTIC.human));
      cv.vline(11, 13, 16, topD);
    }
  } else if (kind === 'sash') {
    if (view === 'down') {
      cv.rect(9, 10, 6, 1, shirt);
      cv.line(8, 11, 14, 16, hex(SEMANTIC.human), 2);
    } else if (view === 'right') {
      cv.line(x0 + 1, 11, x0 + 6, 16, hex(SEMANTIC.human), 2);
    }
  } else if (kind === 'scarf') {
    cv.rect(x0, 10, w, 2, shirt);
    if (view === 'down') {
      cv.rect(9, 12, 2, 4, shirt);
      cv.rect(10, 13, 2, 4, shirtD);
    } else if (view === 'right') {
      cv.rect(x0 + 4, 12, 2, 4, shirt);
    }
  }

  if (kind !== 'cloak' && kind !== 'apron') {
    cv.rect(x0, 17, w, 1, belt);
    if (view === 'down') cv.set(11, 17, hex(SEMANTIC.human));
  }

  const sleeveC = kind === 'cloak' ? top : topD;
  const skinC = hex(v.skin);
  if (view !== 'right') {
    cv.rect(5, 11, 2, 4, sleeveC);
    cv.rect(5, 15, 2, 2, skinC);
    cv.rect(17, 11, 2, 4, sleeveC);
    cv.rect(17, 15, 2, 2, skinC);
  } else {
    cv.rect(11, 11, 2, 4, sleeveC);
    cv.rect(11, 15, 2, 2, skinC);
  }
}

function drawVillagerHead(cv, v, view) {
  const skin = hex(v.skin), skinD = mix(v.skin, '#241a22', 0.25);
  const hairC = hex(v.hair), hairD = mix(v.hair, '#151013', 0.35), hairL = mix(v.hair, '#ffffff', 0.2);
  const gray = hex(HAIR_GRAY);
  const st = v.style;
  const eyeY = 6;

  if (view === 'down') {
    cv.rect(8, 3, 8, 7, skin);
    cv.hline(8, 15, 9, skinD);

    if (st === 'beard') {
      cv.rect(8, 2, 8, 3, gray);
      cv.rect(8, 6, 2, 4, gray);
      cv.rect(14, 6, 2, 4, gray);
      cv.rect(8, 8, 8, 2, gray);
      cv.rect(9, 10, 6, 1, gray);
    } else if (st === 'bun') {
      cv.rect(10, 1, 4, 2, hairC);
      cv.rect(8, 2, 8, 3, hairC);
      cv.rect(7, 3, 2, 4, hairC);
      cv.rect(15, 3, 2, 4, hairC);
    } else if (st === 'curly') {
      cv.rect(7, 1, 10, 4, hairC);
      cv.rect(6, 3, 2, 5, hairC);
      cv.rect(16, 3, 2, 5, hairC);
      cv.set(8, 2, hairL); cv.set(13, 2, hairL);
    } else if (st === 'short') {
      cv.rect(8, 2, 8, 3, hairC);
      cv.rect(7, 3, 2, 3, hairC);
      cv.rect(15, 3, 2, 3, hairC);
      cv.set(9, 2, hairL); cv.set(10, 2, hairL);
    } else if (st === 'long') {
      cv.rect(8, 2, 8, 3, hairC);
      cv.rect(7, 3, 2, 8, hairC);
      cv.rect(15, 3, 2, 8, hairC);
    } else if (st === 'ponytail') {
      cv.rect(8, 2, 8, 3, hairC);
      cv.rect(7, 3, 2, 4, hairC);
      cv.rect(15, 3, 2, 4, hairC);
      cv.rect(16, 4, 2, 6, hairC);
    } else if (st === 'braids') {
      cv.rect(8, 2, 8, 3, hairC);
      cv.rect(6, 3, 2, 7, hairC);
      cv.rect(16, 3, 2, 7, hairC);
      cv.rect(6, 9, 2, 1, hex(SEMANTIC.human));
      cv.rect(16, 9, 2, 1, hex(SEMANTIC.human));
    } else if (st === 'wavy') {
      cv.rect(8, 2, 8, 3, hairC);
      cv.rect(7, 3, 2, 7, hairC);
      cv.rect(15, 3, 2, 7, hairC);
      cv.set(6, 7, hairC); cv.set(17, 7, hairC);
    }

    cv.set(9, eyeY, hex(INK));
    cv.set(14, eyeY, hex(INK));
  } else if (view === 'up') {
    cv.rect(8, 2, 8, 8, hairC);
    cv.rect(7, 3, 10, 6, hairC);
    if (st === 'bun') {
      cv.rect(10, 1, 4, 2, hairD);
    } else if (st === 'ponytail') {
      cv.rect(11, 5, 2, 6, hairD);
    } else if (st === 'long') {
      cv.rect(7, 3, 10, 8, hairC);
    } else if (st === 'braids') {
      cv.rect(6, 4, 2, 7, hairC);
      cv.rect(16, 4, 2, 7, hairC);
      cv.rect(6, 10, 2, 1, hex(SEMANTIC.human));
      cv.rect(16, 10, 2, 1, hex(SEMANTIC.human));
    } else if (st === 'beard') {
      cv.rect(8, 2, 8, 8, gray);
    }
  } else {
    cv.rect(9, 3, 7, 7, skin);
    cv.rect(8, 2, 7, 4, hairC);
    if (st === 'beard') {
      cv.rect(8, 2, 7, 4, gray);
      cv.rect(12, 7, 4, 3, gray);
    } else if (st === 'bun') {
      cv.rect(7, 1, 3, 3, hairC);
    } else if (st === 'ponytail') {
      cv.rect(6, 3, 3, 6, hairC);
    } else if (st === 'long') {
      cv.rect(7, 3, 3, 8, hairC);
    } else if (st === 'braids') {
      cv.rect(8, 3, 2, 8, hairC);
      cv.rect(8, 10, 2, 1, hex(SEMANTIC.human));
    }
    cv.set(14, eyeY, hex(INK));
  }
}

function buildAvatarCell(v, view, step) {
  const cv = new Cv(24, 24);
  drawVillagerLegs(cv, v, view, step);
  drawVillagerTorso(cv, v, view);
  drawVillagerHead(cv, v, view);
  return cv.outline(INK);
}

function buildAvatarStrip(v) {
  const strip = new Cv(144, 24);
  const FRAMES = [['down', 0], ['down', 1], ['up', 0], ['up', 1], ['right', 0], ['right', 1]];
  FRAMES.forEach(([view, step], i) => buildAvatarCell(v, view, step).blit(strip, i * 24, 0));
  return strip;
}

/* ── emotes: 16×16 speech bubbles ────────────────────────────────────────── */
const EMOTE_ORDER = ['working', 'blocked', 'awaiting', 'escalated', 'delivering', 'reading'];

function emoteBubble(cv) {
  cv.rect(2, 1, 12, 11, WHITE);
  cv.rect(1, 2, 14, 9, WHITE);
  cv.rect(7, 12, 2, 1, WHITE);
  cv.rect(7, 13, 2, 1, WHITE);
}
function framedRect(cv, x, y, w, h, fill) {
  cv.rect(x, y, w, h, DETAIL_INK);
  cv.rect(x + 1, y + 1, w - 2, h - 2, fill);
}

function buildEmote(name) {
  const cv = new Cv(16, 16);
  emoteBubble(cv);
  if (name === 'working') {
    framedRect(cv, 3, 2, 10, 5, '#a8b2bc');
    cv.hline(4, 11, 5, '#87919c');
    cv.rect(6, 7, 4, 4, DETAIL_INK);
    cv.rect(7, 7, 2, 4, WOOD);
  } else if (name === 'blocked') {
    cv.rect(5, 2, 6, 1, DETAIL_INK);
    cv.set(5, 3, DETAIL_INK); cv.set(10, 3, DETAIL_INK);
    cv.set(5, 4, DETAIL_INK); cv.set(10, 4, DETAIL_INK);
    framedRect(cv, 4, 5, 8, 6, SEMANTIC.guard);
    cv.hline(5, 10, 6, '#a584dc');
    cv.rect(7, 7, 2, 2, DETAIL_INK);
  } else if (name === 'awaiting') {
    cv.disc(5, 6, 2, DETAIL_INK);
    cv.set(5, 6, WHITE);
    cv.rect(8, 5, 5, 3, DETAIL_INK);
    cv.rect(9, 6, 3, 1, SEMANTIC.human);
    cv.set(10, 8, DETAIL_INK); cv.set(12, 8, DETAIL_INK);
  } else if (name === 'escalated') {
    cv.rect(7, 2, 2, 1, DETAIL_INK);
    cv.rect(7, 3, 2, 4, SEMANTIC.escalation);
    cv.rect(7, 7, 2, 1, DETAIL_INK);
    cv.rect(7, 9, 2, 1, SEMANTIC.escalation);
    cv.set(6, 4, DETAIL_INK); cv.set(9, 4, DETAIL_INK);
    cv.set(6, 9, DETAIL_INK); cv.set(9, 9, DETAIL_INK);
  } else if (name === 'delivering') {
    framedRect(cv, 3, 3, 10, 8, '#c89a62');
    cv.hline(4, 11, 5, DETAIL_INK);
    cv.rect(7, 3, 2, 8, SHIRT);
    cv.rect(9, 8, 2, 2, SEMANTIC.task);
  } else if (name === 'reading') {
    cv.rect(3, 4, 10, 7, SEMANTIC.task);
    cv.rect(4, 5, 3, 5, WHITE);
    cv.rect(9, 5, 3, 5, WHITE);
    cv.vline(8, 4, 10, DETAIL_INK);
    cv.hline(4, 6, 6, '#c8c2b4');
    cv.hline(9, 11, 6, '#c8c2b4');
    cv.hline(4, 6, 8, '#c8c2b4');
    cv.hline(9, 11, 8, '#c8c2b4');
  }
  return cv.outline(INK);
}

function buildMail() {
  const cv = new Cv(16, 16);
  framedRect(cv, 2, 4, 12, 9, PAPER);
  cv.line(3, 5, 7, 9, DETAIL_INK);
  cv.line(12, 5, 8, 9, DETAIL_INK);
  cv.disc(8, 9, 2, '#c04a3a');
  cv.set(8, 10, '#8f3328');
  cv.set(7, 8, '#e08a7a');
  cv.set(3, 11, '#e2d4b2');
  cv.set(12, 11, '#e2d4b2');
  return cv.outline(INK);
}

/* ── manifest + main ─────────────────────────────────────────────────────── */
const BUILDERS = {
  stall: buildMarketing,
  bank: buildFinance,
  court: buildLegal,
  tavern: buildSupport,
  mill: buildOperations,
  hall: buildHr,
};

function buildManifest() {
  return {
    version: 1,
    world: { w: WORLD.w, h: WORLD.h },
    background: { file: '/pixel/background.png' },
    plaza: { x: PLAZA.x, y: PLAZA.y },
    buildings: DEPTS.map((d) => ({
      deptId: d.id,
      file: `/pixel/buildings/${d.id}.png`,
      w: d.w, h: d.h, x: d.x, y: d.y,
      door: { x: d.door.x, y: d.door.y },
    })),
    avatars: {
      cell: 24,
      frameOrder: ['down0', 'down1', 'up0', 'up1', 'right0', 'right1'],
      variants: Array.from({ length: 8 }, (_, i) => `/pixel/avatars/v${i}.png`),
    },
    emotes: {
      cell: 16,
      files: Object.fromEntries(EMOTE_ORDER.map((n) => [n, `/pixel/emotes/${n}.png`])),
    },
    mail: { file: '/pixel/mail.png', cell: 16 },
    palette: { outline: INK, ink: DETAIL_INK, paper: PAPER, ...SEMANTIC },
  };
}

function pngSize(buf) {
  if (buf.length < 24) return null;
  for (let i = 0; i < 8; i++) if (buf[i] !== [137, 80, 78, 71, 13, 10, 26, 10][i]) return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

function validateAndReport(expected, manifestPath) {
  const rows = [];
  const problems = [];
  for (const a of expected) {
    const abs = path.join(OUT, a.rel);
    let status = 'ok';
    if (!fs.existsSync(abs)) {
      status = 'MISSING';
      problems.push(`${a.rel}: file missing`);
    } else {
      const got = pngSize(fs.readFileSync(abs));
      if (!got) {
        status = 'NOT A PNG';
        problems.push(`${a.rel}: not a valid PNG`);
      } else if (got.w !== a.w || got.h !== a.h) {
        status = `BAD DIMS ${got.w}x${got.h}`;
        problems.push(`${a.rel}: expected ${a.w}x${a.h}, got ${got.w}x${got.h}`);
      }
    }
    rows.push([a.rel, `${a.w}x${a.h}`, String(a.buf.length), status]);
  }
  const mf = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  for (const ref of [
    mf.background.file,
    ...mf.buildings.map((b) => b.file),
    ...mf.avatars.variants,
    ...Object.values(mf.emotes.files),
    mf.mail.file,
  ]) {
    if (!fs.existsSync(path.join(OUT, ref.replace('/pixel/', '')))) {
      problems.push(`manifest references missing file: ${ref}`);
    }
  }

  const w1 = Math.max(...rows.map((r) => r[0].length)) + 2;
  const w2 = 10, w3 = 8;
  console.log('');
  console.log('file'.padEnd(w1) + 'dims'.padEnd(w2) + 'bytes'.padEnd(w3) + 'status');
  console.log('-'.repeat(w1 + w2 + w3 + 10));
  for (const r of rows) console.log(r[0].padEnd(w1) + r[1].padEnd(w2) + r[2].padEnd(w3) + r[3]);
  console.log('');

  if (problems.length) {
    console.error(`VALIDATION FAILED (${problems.length}):`);
    for (const p of problems) console.error('  ✗ ' + p);
    process.exitCode = 1;
  } else {
    console.log(`OK — ${rows.length} PNGs + manifest.json written to public/pixel (deterministic).`);
  }
}

function main() {
  const expected = [];
  const emit = (rel, cv) => expected.push({ rel, w: cv.w, h: cv.h, buf: encodePNG(cv) });

  emit('background.png', buildBackground());
  for (const d of DEPTS) {
    const cv = BUILDERS[d.kind]();
    if (cv.w !== d.w || cv.h !== d.h) throw new Error(`builder ${d.id} produced ${cv.w}x${cv.h}, table says ${d.w}x${d.h}`);
    emit(`buildings/${d.id}.png`, cv);
  }
  for (let i = 0; i < VARIANTS.length; i++) emit(`avatars/v${i}.png`, buildAvatarStrip(VARIANTS[i]));
  for (const name of EMOTE_ORDER) emit(`emotes/${name}.png`, buildEmote(name));
  emit('mail.png', buildMail());

  fs.mkdirSync(path.join(OUT, 'buildings'), { recursive: true });
  fs.mkdirSync(path.join(OUT, 'avatars'), { recursive: true });
  fs.mkdirSync(path.join(OUT, 'emotes'), { recursive: true });
  for (const a of expected) fs.writeFileSync(path.join(OUT, a.rel), a.buf);

  const manifestPath = path.join(OUT, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(buildManifest(), null, 2) + '\n');

  validateAndReport(expected, manifestPath);
}

main();



