# Valley mode pixel-art spec

All Valley-mode art is **generated** by `scripts/gen-pixel-art.mjs` (pure Node ESM, zero
dependencies). PNGs under `public/pixel/` are build artifacts — never hand-edit them;
change the generator and re-run it.

## Regenerate

```bash
node scripts/gen-pixel-art.mjs
```

Output is deterministic (seeded PRNGs + canonical PNG encoding): re-running produces
byte-identical files. The script ends by validating every file's dimensions against the
manifest contract and exits non-zero on any mismatch.

## Palette

### Manifest palette (`public/pixel/manifest.json → .palette`)

| Hex       | Role        | Notes                                                              |
| --------- | ----------- | ------------------------------------------------------------------ |
| `#2e1f2c` | `outline`   | Shared warm plum-brown silhouette ink on EVERY sprite              |
| `#46303e` | `ink`       | Interior detail linework (glyph frames, seams, hinges)             |
| `#f2e7cd` | `paper`     | Parchment: signs, posters, emote bubbles, mail                     |
| `#4a80cb` | `task`      | Game-friendly cobalt for task events (app token `#2557d6`)         |
| `#48954e` | `artifact`  | Leaf green for artifact events (app token `#1e7a3d`)               |
| `#bd8430` | `permission`| Bronze amber for permission events (app token `#a16207`)           |
| `#d15a49` | `escalation`| Warm brick red for escalations (app token `#c03221`)               |
| `#8a63c9` | `guard`     | Soft violet for guardrail blocks (app token `#6d28d9`)             |
| `#e3ae52` | `human`     | Honey amber for human-in-the-loop moments (app token `#a16207`)    |

Permission vs human are deliberately two ambers (bronze vs honey) so the keys stay
distinguishable in-world while both still read "amber".

### Department accent hues (roofs / signs / awnings)

| Dept       | Hue  | Hex       |
| ---------- | ---- | --------- |
| marketing  | 330° | `#d76fa4` pink |
| finance    | 45°  | `#d9a83e` gold |
| legal      | 210° | `#5b87c5` blue |
| support    | 160° | `#3f9e85` teal |
| operations | 20°  | `#d07a35` orange |
| hr         | 270° | `#9067bf` violet |

Each builder derives light/dark/deep shades from the accent at generation time; the
accent hex itself is not stored in the manifest.

### Shared ground / material tones

Grass `#82b259`/`#75a44e`/`#8fbf66`, dirt path `#c2a06c` (rim `#96774c`),
plaza stone `#bcae8b` family with packed-earth core `#cdbd97`, water `#71a6c2`/`#54849f`
with sand rim `#d9c28d`, wood `#8a6238`/`#6b4a2a`, plaster `#e3cfa2`,
wall stone `#c8bca4`/`#b4a78d`, canopy greens `#61a24c` family, trunk `#7a5233`.

## Asset inventory

All PNGs are 8-bit RGBA. Sizes are pinned by the manifest schema.

| File                              | Size      | Contents                                                        |
| --------------------------------- | --------- | --------------------------------------------------------------- |
| `background.png`                  | 960×600   | Mottled grass, dirt paths door→plaza (~14px), cobble plaza r=90 at (480,330) with calm earth core r<58 (kept clear for the HTML sign overlay), pond, fences, trees ×8 (2 sizes), bushes, flower patches, rocks |
| `buildings/marketing.png`         | 96×84     | Poster & print stall: striped scalloped awning, poster window, arch door |
| `buildings/finance.png`           | 120×100   | Stone bank: ashlar walls, gold-trimmed pediment, pilasters, arched double door |
| `buildings/legal.png`             | 112×96    | Courthouse: pediment + frieze, four columns, fanlight doorway, broad steps |
| `buildings/support.png`           | 104×92    | Tavern: shingled gable, glowing windows + teal shutters, hanging sign, chimney |
| `buildings/operations.png`        | 124×108   | Windmill: tapered tower, lattice sails, orange cap, stone skirt  |
| `buildings/hr.png`                | 104×88    | Community hall: violet gable + cupola, pennant banner, flower boxes |
| `avatars/v0.png` … `v7.png`       | 144×24    | Eight villagers; six 24×24 frames per strip                     |
| `emotes/working.png`              | 16×16     | Speech bubble + hammer                                           |
| `emotes/blocked.png`              | 16×16     | Speech bubble + padlock (guard violet)                           |
| `emotes/awaiting.png`             | 16×16     | Speech bubble + key (human amber shaft)                          |
| `emotes/escalated.png`            | 16×16     | Speech bubble + red "!"                                          |
| `emotes/delivering.png`           | 16×16     | Speech bubble + parcel box                                       |
| `emotes/reading.png`              | 16×16     | Speech bubble + open book                                        |
| `mail.png`                        | 16×16     | Sealed letter with wax seal                                      |
| `manifest.json`                   | —         | Generated contract consumed by `src/map/pixel/art.ts`            |

Building placement is pinned in both the generator and the manifest (single source of
truth is the `DEPTS` table in `scripts/gen-pixel-art.mjs`); background paths start at
each `door` point so they line up under every building sprite.

## Style rules

- **Unified 1:1 Texel Density.** Every sprite and background pixel maps 1:1 to the 960×600
  world canvas (`SPRITE_SCALE = 1`), eliminating mixels so all line weights and textures
  remain visually cohesive.
- **One ink.** Every silhouette is outlined with the same warm plum-brown `#2e1f2c`,
  applied as a crisp 1px pass around each sprite (avatars are outlined per 24×24 cell
  before being packed into strips). Ground elements (paths, plaza) use darker-tone rims
  instead of ink so terrain stays soft; discrete objects always get the ink.
- **Light from top-left.** Highlights sit up/left, shade down/right: roofs light left
  slope, walls get a lit left column and shaded right/bottom edges, canopies highlight
  the upper-left quadrant.
- **Two-shade daylight shading.** Materials have base + one lighter + one darker step;
  no gradients beyond dithered speckle.
- **Villager proportions.** Head 8px, torso 8px, legs 5px within a 24×24 cell; feet end
  at row 22 with an ink sole line on row 23. Frame order is pinned:
  `down0, down1, up0, up1, right0, right1`; X0 = contact pose (doubles as idle),
  X1 = passing pose; `right` faces right and code mirrors for left. Eight variants vary
  skin, hair style/color, and professional-villager outfits (vests, aprons, cloaks,
  sash, scarf, coats). No text, no weapons anywhere.
- **Keep-clear zones.** Nothing structural within r<60 of the plaza center (HTML sign
  overlays there) and decor avoids a clean strip directly in front of every building
  door where villagers stand.

## License

All pixels are original generated art created by this repository's own script — no
third-party assets, no traced sprites, no external references baked into output.
