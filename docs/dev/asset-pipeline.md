# Asset pipeline: placeholder art, atlas and `virtual:shmup-assets`

How the game's pictures get from code and JSON to a texture atlas the renderer can batch.
Filled in by plan step **M1-03**. Later steps add sprites (each new enemy, boss or effect
brings its pixel map or generator) and, eventually, real art that replaces the
placeholders by name.

This page is the *how and why*. The source formats are also described next to the data
([`assets/README.md`](../../assets/README.md), [`assets/source/README.md`](../../assets/source/README.md));
exact signatures are in [api-reference.md](api-reference.md#asset-pipeline-scriptsassets);
the JSDoc in `scripts/assets/*.mjs` is the authoritative reference.

Background: `shmup_feat.md` §18 (one atlas, batched rendering, VA-friendly palette), §12
(bullet readability), §25 (content production list); `shmup_tech.md` §4.7 (art tools);
plan decisions **D24** (art as code, real art overrides by name), **D25** (metadata inlined
into the bundle, images loaded by relative URL) and **D30** (hit flash = a white silhouette
sprite, not a tint).

## The pipeline at a glance

```text
assets/source/sprites/**/*.sprite.json ─┐  pixel maps: palette + rows, one file per sprite
scripts/assets/procedural/*.mjs ────────┤  seeded generators: explosions, bullets, terrain …
assets/source/sprites/**/*.png (+ .json)┤  real-art overrides, replace frames by name
assets/source/fonts/*.font.json ────────┘  bitmap fonts → one sprite, a frame per glyph
   │  collectSprites()     validate, merge, add <name>@flash and <name>@p2 siblings, default anchors
   ▼
packRects()                 MaxRects, 1-px padding + 1-px edge extrusion, power-of-two pages ≤ 2048²
   │  buildAtlas()          place frames, encodePng() each page, build the manifest
   ▼
assets/generated/atlas/main.png (+ main-1.png …)   page images
assets/generated/atlas/main.json                    manifest (formatVersion 1)
assets/generated/.asset-cache.json                  input hash + output digests (skip unchanged runs)
   │  shmupAssets() Vite plugin (vite.shared.ts)
   ▼
virtual:shmup-assets       export const manifest = {…} (inlined) · pageUrls = ['assets/atlas/main.png']
dist/assets/atlas/*.png    emitted next to the bundle (web and Tizen builds)
```

**Status today.** The whole pipeline, the initial sprite set (M1-03: 55 sprites, 272 frames on
one 512×256 page — grown with every step since; one 512×512 page since the M1-16 logo), the pixel font, the Vite plugin and the sprite-name check in
`pnpm content:check` are done. Both apps register `shmupAssets()` and ship the pages; since
M1-04 their `main.ts` imports `virtual:shmup-assets`, `@shmup/shell` loads the pages with
`new Image()` and render-pixi's `createAtlas` turns them into textures, and the default scene
(free flight since M1-06 — the KESTREL's bank frames, the star layers, the HUD; the sprite
showcase with `?scene=showcase`) draws the real sprites and the pixel font
([rendering-and-shell.md](rendering-and-shell.md)).

Why this design:

- **No human art needed, but real art drops in.** Every placeholder is source data
  (pixel rows) or code, so the repo builds on any machine, and the pictures are original.
  A PNG with the same sprite name replaces the frames later, without touching code.
- **One atlas, one batch.** Pixi batches sprites that share a texture; the 1×1 white
  `ui/pixel` lets the HUD draw rectangles from the same page, and the hit flash is a second
  sprite on the same page because Pixi's tint can only darken (multiply).
- **Nothing is fetched on the TV.** The manifest is part of `app.js`; the pages are plain
  PNG files the host loads with `HTMLImageElement` from a relative URL, which works from
  `file://` (Tizen) and `app://` (Electron).
- **Deterministic.** Two runs over the same inputs write byte-identical files, on any
  machine with the same zlib: sorted inputs, a deterministic packer, no timestamps in the
  PNGs and no engine-dependent maths in the generators.

## Sources

### Pixel maps (`*.sprite.json`)

One file per sprite under `assets/source/sprites/`. The **sprite name is the path** below
`sprites/` without `.sprite.json`, and the file's `name` field must repeat it (so
`ships/kestrel.sprite.json` defines `ships/kestrel` — the name content uses in
`"sprite": "ships/kestrel"`).

```json
{
  "name": "enemies/drifter",
  "description": "Small enemy: spinning pod.",
  "palette": { ".": null, "o": "#1a1030", "g": "#58b040", "d": "#2a6a30", "w": "#c8f080" },
  "anchor": [6, 6],
  "hitFlash": true,
  "frames": [{ "rows": ["....oooo....", "...oggggo...", "…"] }, { "rows": ["…"] }],
  "animations": { "spin": [0, 1] }
}
```

| Field | Rule |
|---|---|
| `name` | Lower-case kebab segments joined by `/` (`SPRITE_NAME_PATTERN`); `@` and `#` are reserved for generated names |
| `description` | Optional string, ignored by the pipeline |
| `palette` | Single printable ASCII character → `null` (transparent) or `#rgb` / `#rgba` / `#rrggbb` / `#rrggbbaa` |
| `anchor` | Optional `[x, y]` in pixels from the frame's top-left; default `[floor(w/2), floor(h/2)]` of frame 0. The sprite's position maps to this pixel |
| `hitFlash` | Optional boolean; `true` adds the `<name>@flash` silhouette sprite (below) |
| `frames` | Non-empty; every frame has the same size, every row the same width, every character is in the palette |
| `animations` | Optional tag → non-empty list of frame indices (`ANIMATION_NAME_PATTERN`: lower-case words joined by `-` or `_`) |

Unknown fields are errors. The files are hand-laid (one row per line) and excluded from
Prettier (`.prettierignore`), because Prettier would fold short row arrays onto one line.

### Procedural generators (`scripts/assets/procedural/`)

Each module exports `generate(): SpriteDef[]` and is registered in
`procedural/index.mjs` (`PROCEDURAL_GENERATORS`).

| Module | Sprites |
|---|---|
| `bullets` | `bullets/{round,oval,needle}-{pink,red,purple}` — bright core, saturated body, dark rim (`shmup_feat.md` §12). Round 7×7 × 1 frame; oval 9×9 and needle 11×11 × 8 directional frames. Since M2-02 drawn by `bulletSprites(colours, suffix?, marks?, generator?)` — any body colours, a name suffix and per-family **core marks** (`CoreMark`: `solid` — the bright core disc, `ring` — the core with a dark centre pixel, `dot` — no core band, one bright centre pixel) |
| `lasers` | `lasers/beam-{pink,red,purple}` (M1-09) — enemy laser beams in the bullet colours: 8 frames of 4×8 px, frame `k` a horizontal band `k + 1` px tall (dark rim rows from 3 px, body rows from 5 px, a bright core). Every column is identical, so the renderer stretches a frame to any length and picks the frame of the beam's drawn width. M2-02: `lasers/bend-{pink,red,purple}` — the bending lasers' segment, one 7×7 round blob (`BEND_SIZE`; rim outside radius 2.6, body, a bright core inside 1.3) drawn at every node; both drawn by `laserSprites(colours, suffix?, generator?)` |
| `palettes` | M2-02 (`shmup_feat.md` §21): every bullet, beam and bend sprite again for each colour-blind palette as `<sprite>@<palette>` — 15 sprites × `deuteranopia`, `protanopia`, `tritanopia` (the names match `@shmup/core` `BULLET_PALETTES`; `standard` is the plain sprites). `BULLET_PALETTES` here maps each palette to the three families' body colours (deuteranopia `#ff8ad8` / `#3ab0ff` / `#e4e4ff`, protanopia `#ff9ce4` / `#44c4ff` / `#eeeeff`, tritanopia `#ff4870` / `#22d8cc` / `#f2f2f2` for pink / red / purple — hues apart for that colour blindness and away from the gold items and orange explosions), `CORE_MARKS` the shape coding (pink `solid`, red `ring`, purple `dot`). Same frames, same order, so directional frames and band widths still line up |
| `explosions` | `fx/explosion-small` (16×16 × 6), `-medium` (32×32 × 7), `-large` (48×48 × 8); animation `burst` |
| `particles` | `fx/spark` (5×5 × 3, `fade`), `fx/debris` (6×6 × 4, `tumble`), `fx/sparkle` (5×5 × 4, `twinkle` — fixed pixel lists, M1-14), `fx/ring` (9×9 × 4, `grow` — a 1-px ring of radius 1…4 by a `Math.sqrt` distance test, M1-14) |
| `items` | `items/capsule` (12×8 × 2, `blink`); M2-02: `items/point` (5×5 × 2, `twinkle`) — the gold diamond (`|dx| + |dy| ≤ 2`, dark rim, white centre) cancelled bullets turn into; frame 1 lights its tips; M2-04: `items/capsule-blue` (12×8 × 2, `blink`) — the same pill in blue with a white core (`capsule(bright, tint)`, `CAPSULE_COLORS`) |
| `shields` | `shields/force-field` (30×24 × 4 wear states: `fresh`, `worn`, `damaged`, `critical`); M2-04: `shields/pod` (8×8 × 4 wear states, same names — a faceted orange-gold gem that dims to red and loses facets, seeded holes) and `shields/reduce` (20×14 × 2: `full`, `worn` — a dotted green ring round the shrunken ship, every 2nd / 4th ring pixel lit) |
| `direct` | M2-05 (`shmup_feat.md` §6B / §7B / §9): the MANTA's shots — `shots/direct-missile` (12×6 × 2: the weak and the wide missile), `shots/disc` (20×20 × 4, radius 3.5 → 9.5), `shots/beam` (26×8 × 4: blue lasers, a longer yellow one, the round piercing laser), `shots/wave` (16×34 × 4 crescent waves), `shots/sub-bomb` (6×6), `shots/sub-laser` (9×9) and `shots/sub-laser-wide` (11×11) with **8 octant frames** each (frame `k` = `k × 45°` clockwise from right — the engine picks the heading's octant, nothing is rotated at run time), `shots/sub-disc` (12×12 × 2); the colour items `items/direct-{red,green,blue,orange,yellow}` (10×10 × 2 glossy orbs, `blink`) and `items/direct-octagon`; the Arm `shields/arm` (26×18 × 9: per tier — green, silver, gold — fresh / worn / critical; animations `arm`, `superArm`, `hyperArm`) — only exactly rounded maths |
| `starfield` | `bg/stars-far`, `bg/stars-mid`, `bg/stars-near` — seamless 128×128 transparent tiles |
| `backdrops` | M1-18: `bg/azure-verge` — zone A's far planet band, a 128×48 tile (`AZURE_TILE_W`, `AZURE_TILE_H`, anchored top-left) that repeats seamlessly along x: a translucent haze thickening towards a lit rim row (`AZURE_RIM_ROW` 10), then an opaque dark-azure-to-navy body with seeded cloud streaks that wrap round the tile edge. Dark and low in saturation so the pink / red / purple bullets and the gold capsules stay readable over it, never pure black |
| `terrain` | `tiles/terrain-a` — 17 8×8 tiles (solid, floor, ceiling, walls, 45° and 22.5° slopes); every tile is also a one-frame animation named after it (`floor → [1]`, list in `TERRAIN_TILES`); collision masks and frames live in `content/tilesets/terrain-a.tileset.json` — change both together |
| `hud` | `hud/meter-slot` (40×8: `normal`, `highlighted`, `disabled`), `hud/meter-labels` (36×5 — the 7 slot labels in meter order, then since M2-03 the Types B–D weapon names `SPREAD 2-WAY TORPEDO TAIL VERTICAL FREE WAY RIPPLE CYCLONE TWIN`: 16 frames in the order of `@shmup/core` `METER_LABEL_FRAMES`, which a test keeps equal to `METER_LABELS`; original 3×5 micro glyphs, M2-03 added `C F V W Y 2 - space`) |
| `weapons` | M2-03 (`shmup_feat.md` §7A): `shots/blast` (32×32 × 4, centred — the Spread Bomb's blast: a hot disc opening into a ring, cooling white-yellow → orange → red; an engine sprite), `shots/ripple` (24×44 × 6, centred — the Ripple's upright ring at half heights 4 → 20 with half the width; the engine picks the frame from the ring's size), `shots/cyclone` (8×9 × 4, anchored at the left end of the middle row — one Cyclone Laser segment, two violet strands twisting round a white core, one wave period per segment so it tiles; the engine steps the frames along the beam). Triangle waves and square roots only |
| `ui` | `ui/pixel` (1×1 white, for rectangles), `ui/missing` (8×8 magenta checker the renderer shows for an unknown name), `ui/logo` (M1-16: the 165×27 title logo `SHMUP CUP` — original 5×7 block letters ×3 (`LOGO_TEXT`, `LOGO_SCALE`), a yellow → orange → red gradient with a highlight row, a dark outline and a 2-px drop shadow; anchored at its centre) |

Rules that keep generated pixels identical on every machine:

- **Seeds come from names.** `createAssetRng(seedOf(spriteName))` — a generator never
  shares a random stream with another, so adding a sprite changes no existing pixels.
  Tiling textures use the stateless `hash2(x, y, seed)` instead, so the value depends on
  the position only.
- **Exactly rounded maths only.** `+ − × ÷`, `Math.sqrt`, `Math.floor/round/min/max/imul`.
  No `Math.sin`/`Math.cos`: the eight 22.5° headings come from square roots
  (`DIRECTIONS_8`), the other shapes from distance tests.
- **Directional bullet frames.** Frame `k` points `k · 22.5°` clockwise from +x; the shapes
  are symmetric, so 8 frames cover every heading. With a binary angle `a` (1024 per turn,
  `core/math`) the frame is `((a + 32) >> 6) & 7`.

### Real-art PNG overrides

A PNG under `assets/source/sprites/` targets the sprite named by its path:
`ships/kestrel.png` → `ships/kestrel`.

- **Without a sidecar** the whole PNG is frame 0.
- **With an Aseprite JSON export** of the same name (`ships/kestrel.json`, from
  `aseprite -b ships/kestrel.aseprite --sheet ships/kestrel.png --data ships/kestrel.json`,
  hash or array format) sidecar frame `i` becomes frame `i`; trimmed frames are restored
  to their untrimmed canvas; `meta.frameTags` become animations (`forward`, `reverse`,
  `pingpong`); the pivot of the first slice becomes the anchor.
- Frame `i` of the PNG **replaces** frame `i` of the code-defined sprite; frames the PNG
  does not provide keep their code-defined pixels; extra PNG frames are appended; sidecar
  tags win over code tags of the same name; a code-defined anchor wins over the pivot.
  A PNG with no code-defined counterpart adds a new sprite.
- The export must list at least one frame, and every frame must fit an atlas page with its
  border (at most 2046×2046). Both are reported as source issues naming the file.
- `README.md`, `LICENSES.md`, `.gitkeep` and editor files such as `*.aseprite` are ignored;
  a `*.json` that is neither a sprite source nor the sidecar of a PNG is an issue.

### Bitmap fonts (`*.font.json`)

`assets/source/fonts/pixel6x8.font.json` is the original 6×8 font: ASCII 32–126 plus
`← ↑ → ↓ ● ✕ ★` (102 glyphs), 5×7 letters with a spacing column and a descender row,
`lineHeight` 10, `advance` 6.

```json
{
  "name": "pixel",
  "cellWidth": 6, "cellHeight": 8, "lineHeight": 10, "advance": 6,
  "glyphs": {
    "A": [".###..", "#...#.", "#...#.", "#####.", "#...#.", "#...#.", "#...#.", "......"],
    "i": { "rows": ["…"], "advance": 4 }
  }
}
```

Each glyph is keyed by exactly one character and drawn in white (`#` = ink), so the
renderer can tint text any colour. The font becomes the sprite `font/<name>` with one frame
per glyph in code-point order (anchor `[0, 0]`); its metrics go into the manifest's `fonts`
section with glyphs keyed by **decimal code point**.

### Hit flash (D30)

For every sprite with `hitFlash: true` the pipeline adds a **sibling sprite**
`<name>@flash`: the same frame count, sizes, anchor and animations, every visible pixel
turned white with its alpha kept. The renderer shows a hit by drawing
`manifest.sprites[name].flash` with the same frame index — one sprite-id swap, still one
atlas page and one batch. (The plan sketched one `<frame>@flash` per frame; a whole sprite
is simpler for the renderer.) Today the seven enemies and the four boss parts flash.

### Player 2's palette swap (M2-06)

After the `@flash` siblings, `collectSprites` adds a `<name>@p2` sibling (`scripts/assets/coop.mjs`)
for every sprite under `ships/` and for `hud/life`: the same anchor, frame sizes and animations,
`hitFlash: false`, every pixel with its **red and blue channels swapped** (green and alpha kept) —
the KESTREL's blue hull stripe turns red-orange, its cyan canopy gold, its orange engine glow blue.
It is exact integer work, so the atlas stays byte-identical on every machine; a real-art PNG
override of a ship gets its variant derived from the override's pixels. The core interns
`<ship sprite>@p2` for every ship (`P2_SPRITE_SUFFIX`, `PlayerShipSpec.spriteP2Id`) and the HUD
`hud/life@p2`, and `pnpm content:check` requires them; the oversize report skips generated
siblings. The atlas page stays 512×512 ([coop.md](coop.md#player-2s-palette-swap)).

## The initial sprite set

| Group | Sprites | Source |
|---|---|---|
| Player | `ships/kestrel` (16×9: `level`, `up`, `down`, from `PLACEHOLDER_SHIP`), `ships/kestrel-thruster` (6×3 × 2, `burn`, drawn behind the ship), `options/orb` (`pulse`), since M2-04 `options/stolen` (the grey Option a hunter carries or that drifts free, 2 frames, no `@flash`), since M2-05 `ships/manta` (the Direct-mode ship: a flat ray-winged hull with a green canopy, 3 frames — level, banking up / down, no `@flash`) | pixel maps |
| Player shots | `shots/basic`, `shots/double`, `shots/laser` (a segment, anchor on its left edge), `shots/missile` (`fly`); since M2-03 the Types B–D shots `shots/bomb` (the Spread Bomb), `shots/two-way` (2 frames: climbing / diving), `shots/torpedo` (2 frames, violet), `shots/tail`, `shots/vertical`, `shots/free` (cyan darts), `shots/twin` (a green beam segment) | pixel maps; `shots/blast`, `shots/ripple`, `shots/cyclone` generated (`weapons`) |
| Enemies | `enemies/drifter`, `turret`, `carrier-red`, `hopper`, `spinner`, `darter`, since M1-08 the ground `hatch` (20 px wide, lid closed / open), and since M1-18 zone A's `vane` (12×10, an amber swept-wing fan flier, wings beat) and `gyre` (14×14, a teal ring round a bright core, the ring turns), and since M2-04 the violet `option-hunter` and the blue `carrier-blue`, and since M2-05 the violet Direct-mode carrier `cube` — 2 frames each, all with `@flash` | pixel maps |
| Boss parts | `bosses/core`, `shield-plate` (`intact`, `cracked`), `hull-block`, `emitter` (`idle`, `charge`), and since M1-18 HALCYON BULWARK's `bulwark-hull` (48×32), `bulwark-wing-top` / `-bottom` (56×14), `bulwark-emitter` (18×10, 2 frames — it glows) and `bulwark-plate` (6×18) — all with `@flash` | pixel maps |
| Items | `items/capsule`, `items/point` (M2-02), `items/capsule-blue` (M2-04), the six `items/direct-*` colour items (M2-05) (generated), `items/bonus`, `items/one-up` | both |
| HUD | `hud/meter-slot`, `hud/meter-labels` (generated), `hud/life` | both |
| World | `bg/stars-{far,mid,near}`, `bg/azure-verge` (M1-18), `tiles/terrain-a` | generated |
| FX / bullets / shield | explosions, spark, debris, 9 enemy bullets, 3 laser beams (M1-09), 3 bending laser segments (M2-02), `shields/force-field`, `shields/pod` and `shields/reduce` (M2-04), `shields/arm` and the MANTA's shots (M2-05) | generated |
| Colour-blind variants | M2-02: the 15 bullet / beam / bend sprites × 3 palettes as `<sprite>@<palette>` (45 sprites) | generated (`palettes`) |
| Utility | `ui/pixel`, `ui/missing`, `ui/logo` (M1-16), `font/pixel` | generated / font |

The enemy names cover every name the shipped and example content use (the `test-range`
roster of M1-08 included), so `pnpm content:check` passes.

## Packing and pages (`packer.mjs`)

- Every frame occupies a **cell**: the frame, a 1-px border that repeats its edge pixels
  (**extrusion**: sampling at a fractional offset never picks up a neighbour — matters for
  tiles and the stretched `ui/pixel`), and 1 px of transparent **padding** right and below.
- MaxRects with best-short-side-fit; items are sorted by (longest cell side, area, height,
  width, name) and every tie is broken by position, so the layout never depends on input
  order.
- Pages are powers of two between 64 and 2048 per side (2048² is the safe TV GPU limit).
  The packer picks the smallest page that holds everything (smallest area, then the
  squarer, then the wider) and only spills onto further pages when a 2048² page is full.
  Pages are named `main.png`, `main-1.png`, `main-2.png`, …
- Manifest coordinates (`x`, `y`, `w`, `h`) are the frame itself, inside its border.

## The manifest (`assets/generated/atlas/main.json`)

```json
{
  "formatVersion": 1,
  "pages": [{ "file": "main.png", "w": 512, "h": 256 }],
  "frames": { "ships/kestrel#0": { "p": 0, "x": 1, "y": 1, "w": 16, "h": 9, "ax": 8, "ay": 4 } },
  "sprites": { "ships/kestrel": { "frames": ["ships/kestrel#0", "ships/kestrel#1", "ships/kestrel#2"], "flash": null } },
  "animations": { "ships/kestrel": { "down": [2], "level": [0], "up": [1] } },
  "fonts": { "pixel": { "sprite": "font/pixel", "lineHeight": 10, "cellWidth": 6, "cellHeight": 8,
    "glyphs": { "65": { "frame": "font/pixel#33", "advance": 6 } } } }
}
```

| Key | Meaning |
|---|---|
| `formatVersion` | `MANIFEST_FORMAT_VERSION` (1) |
| `pages[]` | `{ file, w, h }` per page; `pageUrls[i]` in the virtual module is page `i` |
| `frames[name]` | `p` page index; `x`, `y`, `w`, `h` on the page; `ax`, `ay` the sprite's anchor in frame pixels. Frame names are `<sprite>#<index>` |
| `sprites[name]` | `frames` — frame names in index order (what the renderer resolves once into numeric ids); `flash` — `<name>@flash` or `null` |
| `animations[sprite][tag]` | Frame indices of a named sequence; sprites without tags are absent |
| `fonts[name]` | `sprite`, `lineHeight`, `cellWidth`, `cellHeight`, `glyphs["<decimal code point>"] = { frame, advance }` |

Every object is written with sorted keys and one entry per line (`formatManifest`), so the
file is byte-stable and diffs well. The TypeScript view of the same format is
`types/virtual-modules.d.ts` (`AtlasManifest`, `AtlasFrame`, `AtlasSprite`, `AtlasFont`,
`AtlasGlyph`, `AtlasPage`).

## Running it

```sh
pnpm assets                                    # build; skipped when nothing changed
node scripts/generate-assets.mjs --force       # rebuild even when up to date
node scripts/generate-assets.mjs --out DIR     # write DIR/atlas/… instead of assets/generated/
node scripts/generate-assets.mjs --source DIR  # read DIR/sprites and DIR/fonts
node scripts/generate-assets.mjs --quiet       # print nothing on success
```

Exit code 1 lists **every** invalid source as `<file>:<json path> message` (no stack trace);
exit code 2 means bad arguments. The output tells you what happened:

```text
assets generated → assets/generated/atlas/: main.png 512×256; 55 sprites, 272 frames, 1 font(s)
assets up to date (assets/generated/atlas/, input c635e061a9cb)
```

You rarely need to run it by hand. It runs:

1. as the Turborepo root task **`//#assets`**, before every `build`, `dev` and the (reserved)
   turbo `test:e2e` task — inputs `assets/source/**`, `scripts/assets/**`,
   `scripts/generate-assets.mjs`; outputs `assets/generated/**`;
2. in the **`shmupAssets()` plugin's `buildStart`**, for every Vite build and dev server —
   so a fresh clone works without a prior `pnpm assets`, and the tests that run real Vite
   builds (CI runs `pnpm test` before `pnpm build`) get an atlas too.

### The cache

`generateAssets()` skips the work when `assets/generated/.asset-cache.json` records the
current **input hash** and every recorded output still exists with its recorded SHA-256
(a deleted or hand-edited output forces a rebuild). The input hash covers:

- the pipeline code — every file under `scripts/assets/` **as loaded by this process**
  (hashed once, when `pipeline.mjs` is imported) plus the zlib and `pngjs` versions;
- the sprite and font sources as they are on disk now (`*.md` and `.gitkeep` are skipped).

Hashing the code once at import is deliberate: a long-lived process (the dev server) keeps
running the pipeline modules it loaded, so it must record *its* code's hash next to the
pixels it draws; the next fresh process sees a different hash and rebuilds. Writes are
atomic (temp file + rename), so parallel builds may run the pipeline at the same time, and
pages left over from an earlier, larger atlas are deleted. `CACHE_VERSION` in
`pipeline.mjs` invalidates every cache when the output format changes without a code
change.

## The Vite plugin (`shmupAssets()` in `vite.shared.ts`)

| Hook | What it does |
|---|---|
| `buildStart` | Runs `generateAssets()` (cached). In builds it emits every page as `assets/atlas/<file>` with `emitFile` — fixed names, no content hash, because the manifest names them |
| `resolveId` / `load` | Serves `virtual:shmup-assets`: `export const manifest = {…}` (**inlined**), `export const pageUrls = ['assets/atlas/main.png', …]` (relative, one per page) and `export default { manifest, pageUrls }` |
| `configureServer` | Dev only: a middleware serves `<base>assets/atlas/<file>` (`[a-z0-9-]+.png` / `.json`, no paths; malformed URLs fall through to a 404) from `assets/generated/atlas/`. Edits under `assets/source/` regenerate the atlas, invalidate the virtual module and send a full reload; an invalid edit logs the issues and keeps the last good atlas |

**Edits to the pipeline code** (`scripts/assets/**`) are *not* regenerated in-process — the
running server still has the old modules loaded. Every pipeline module is a config
dependency of the app configs (they import `vite.shared.ts`, which imports the pipeline),
so Vite restarts the server itself and the new `buildStart` regenerates with the new code.
When no restart is coming (inline config, `--configLoader native`, a module nothing imports
yet) the plugin logs a warning asking for a restart.

Both apps register the plugin (`apps/web/vite.config.ts`, `apps/tizen/vite.config.ts`), and
both builds contain `dist/assets/atlas/main.png`. `ATLAS_URL_DIR` (`'assets/atlas'`) is
relative so the build works from a sub-path, `file://` and `app://`.

The Tizen bundle check (`apps/tizen/scripts/check-bundle.mjs`) accepts the pages: still
exactly one script anywhere, and every file other than the four widget files
(`WIDGET_FILES`: `app.js`, `config.xml`, `icon.png`, `index.html`) must live under
`dist/assets/` — anything else would be packaged into the `.wgt` by accident.

## Sprite names used by content

Content refers to sprites by name (`"sprite": "ships/kestrel"`); `loadContent()` interns
those names into `db.sprites` (M1-02). `pnpm content:check` builds the atlas in memory and
runs `findMissingSprites(manifest, db.sprites.names)`, so a typo fails the check with a
message that names the missing sprite and how to add it — instead of a magenta
`ui/missing` box in the game. Only the shipped content is checked: the example files'
`ships/example` and `enemies/example-warden` are documentation. The sprites the engine draws on
its own — the nine bullet kinds and `lasers/beam-pink` (M1-09), `options/orb` (M1-10),
`lasers/bend-pink` and `items/point` (M2-02), the Spread Bomb's `shots/blast` (M2-03), `core/world` `ENGINE_SPRITES` — are checked the same
way; hosts intern them with `loadContent`'s `extraSprites`. Since M2-02 the check also requires
every colour-blind variant (`<sprite>@<palette>` for each non-standard `BULLET_PALETTES` entry) of
every bullet / beam / bend sprite, frame for frame. The variants are never content names — the
renderer finds them by name when the player picks a palette
([rendering-and-shell.md](rendering-and-shell.md#colour-blind-bullet-palettes)).

## Extending it

### Adding a sprite

1. Create `assets/source/sprites/<group>/<name>.sprite.json` with `"name": "<group>/<name>"`.
2. Add `"hitFlash": true` if it is something the player shoots, and `animations` for any
   frame sequence the game will ask for by name.
3. `pnpm assets` (or just save it while `pnpm dev` runs) and reference it from content.

Keep to the art rules in [`assets/README.md`](../../assets/README.md#rules): original
designs only, native resolution, no pure black next to small bright bullets.

### Adding a procedural generator

1. New module `scripts/assets/procedural/<id>.mjs` exporting `generate(): SpriteDef[]`
   (build sprites with `makeSprite(name, frames, '<id>', { anchor, hitFlash, animations })`).
2. Seed from the sprite name (`createAssetRng(seedOf(name))`); use only exactly rounded
   maths (see above).
3. Register it in `procedural/index.mjs` (`PROCEDURAL_GENERATORS`), add a test to
   `test/scripts/assets/procedural.test.ts` for its documented shapes.

### Replacing a placeholder with real art

Drop `<name>.png` (and optionally the Aseprite `<name>.json` export) next to where the
pixel map would live, keep the `.aseprite` file beside it and record third-party licences
in a `LICENSES.md`. The pixel map can stay — frames the PNG lacks fall back to it — or be
deleted once the PNG covers every frame. **Bullets, beams and bend segments** also have
colour-blind variants (M2-02): a PNG named `bullets/oval-red.png` replaces only the standard
sprite — override `bullets/oval-red@deuteranopia` (and the other two palettes) as well, or the
colour-blind sets keep the placeholder's shapes.

### Adding glyphs or a font

Add a key to `glyphs` in `pixel6x8.font.json` (exactly one character, `cellHeight` rows of
`cellWidth` `#`/`.` characters), or a new `<name>.font.json` — it becomes `font/<name>` and
`manifest.fonts[<name>]`.

### Changing the manifest format

Bump `MANIFEST_FORMAT_VERSION` in `manifest.mjs`, update the typedefs there and the
`virtual:shmup-assets` declaration in `types/virtual-modules.d.ts` in the same commit, and
update the consumers: render-pixi `atlas` (`AtlasManifest` mirrors the typedefs) and the
shell's `ShellAssets`.

## Commands

```sh
pnpm assets                                   # regenerate (cached)
pnpm content:check                            # content validates + every content sprite exists
pnpm test:integration                         # includes the pipeline, plugin and CLI tests
pnpm exec vitest run --project integration test/scripts/assets   # pipeline unit tests only
```

## Tests

| File | Covers |
|---|---|
| `test/scripts/assets/png.test.ts`, `png-edge.test.ts` | Encode → `pngjs` decode round trip equals the source pixels; chunk layout, CRC, filter choice per row; decoding indexed, 1–2-bit, 16-bit and Adam7 PNGs |
| `test/scripts/assets/packer.test.ts`, `packer-edge.test.ts` | No overlaps (border + padding included), power-of-two pages ≤ 2048², determinism under reordering, spilling onto more pages, option validation, tie-breaks, a seeded fuzz |
| `test/scripts/assets/sprite-source.test.ts`, `sprite-source-edge.test.ts` | Every validation path, Aseprite sidecars (hash/array, tags, pivot, trimmed, frameless), PNG overrides, loader error paths |
| `test/scripts/assets/font.test.ts`, `font-edge.test.ts` | ASCII 32–126 + the specials, glyph-key rules, `loadFontSources()`, the pixel font's design rules |
| `test/scripts/assets/coop.test.ts` | M2-06: the core's suffix, `wantsP2Variant` (ships and the stock icon only), the exact red / blue swap, `makeP2Sprite`, every ship's and the stock icon's variant in the atlas |
| `test/scripts/assets/palettes-names.test.ts` | M2-02: the pipeline's palettes are exactly core's `BULLET_PALETTES` other than `standard`, in core order; every family has a body colour and a core mark in every palette; one `<standard sprite>@<palette>` per standard sprite and palette; two runs draw the same pixels |
| `test/scripts/assets/procedural.test.ts`, `image.test.ts`, `rng.test.ts`, `manifest.test.ts` | Each generator's documented shapes (bullets outlined by the dark rim, the M2-02 core marks, bend segments and the point diamond, slope profiles, seamless star tiles …), raster helpers, the asset RNG's known-answer vectors, the manifest layout and self-consistency |
| `test/scripts/assets/pipeline.test.ts`, `pipeline-edge.test.ts` | The whole atlas: frames pixel-exact, extrusion, the initial sprite set, byte-identical runs, every cache state (including a pipeline edit after the code was loaded), stale-page removal, oversized frames as issues, parallel runs |
| `test/scripts/generate-assets.test.ts`, `generate-assets-edge.test.ts` | The CLI: flags, the cache skip, `--force`, exit codes 1 and 2, issue listing without a stack trace |
| `test/integration/assets-plugin.test.ts`, `assets-plugin-edge.test.ts` | The plugin: the virtual module, a real IIFE build emitting `assets/atlas/main.png`, the dev middleware and watcher (source edits regenerate, pipeline edits restart or warn), wiring in both apps and `turbo.json` |
| `test/integration/content.test.ts` | Every sprite name of the shipped content exists in the atlas; a typo is reported |
| `apps/tizen/test/scripts/check-bundle.test.ts`, `apps/tizen/test/build/tizen-build.test.ts`, `apps/web/test/build/web-build.test.ts` | Rule 6 (files outside `dist/assets/`); the real Tizen build ships exactly the widget files plus the atlas pages, byte-identical to the pipeline output; the web build ships `assets/atlas/main.png` |

## Gotchas

| Symptom | Cause / fix |
|---|---|
| `asset sources are invalid (N issues)` from `pnpm assets` or a build | Each line is `<file>:<json path> message` — fix the named file. Common: a character missing from the palette, rows of different widths, `name` not matching the file's location |
| `sprite "x" is not in the atlas` in `pnpm content:check` | Content names a sprite nobody defines — fix the name or add the sprite |
| `pnpm format:check` wants to reflow a sprite | Should not happen: `assets/source/` is in `.prettierignore`. A pixel map anywhere else is not a source |
| Edited a generator, the dev server shows the old art | Vite restarts on a pipeline edit; if it logged `restart the dev server …` instead, restart `pnpm dev` |
| A sprite shows as a magenta checker in the app | The renderer's sprite name table names a sprite the atlas lacks (the console warns once per name) — see [rendering-and-shell.md](rendering-and-shell.md#gotchas) |
| The app stops on `ATLAS DOES NOT MATCH ITS MANIFEST` | A page image from another pipeline run is served with this bundle (browser cache, a hand-copied file) — rebuild and hard-reload |
| The atlas differs on another machine | Only a different zlib (Node version) can change the PNG bytes; the pixels never change. The zlib version is part of the input hash, so the cache rebuilds |
| `pngjs` has no types in the editor | Deliberate — it is loaded untyped (no `@types/pngjs` dependency); only `png.mjs` and the hash in `pipeline.mjs` touch it |
| TypeScript cannot see a new export of a `scripts/assets/*.mjs` module | The Node-side TS reads the JSDoc types through `allowJs` in `tsconfig.tooling.json` (no `checkJs`): give the export a JSDoc `@param` / `@returns` type |
| A colour-blind palette shows the placeholder bullet next to real art | The `@<palette>` variants are sprites of their own — override them too (above) |
| A real-art PNG seems ignored | Its path must be a valid sprite name (lower-case kebab segments) — otherwise it is reported as an issue, not skipped silently. Check that the sidecar has the same base name |

## Next steps that build on this page

M1-04 (done) loads `virtual:shmup-assets` through the shell into render-pixi's `atlas`
module (numeric frame ids, nearest sampling, `ui/missing` for unknown names) and draws text
with `font/pixel` ([rendering-and-shell.md](rendering-and-shell.md)); M1-07 (done) draws
`tiles/terrain-a` through `content/tilesets/terrain-a.tileset.json` (whose masks a test
compares with these frames' pixels) and the star layers as parallax bands
([stage-runtime.md](stage-runtime.md)); M1-08 (done) added `enemies/hatch` and draws the
enemy sprites through the World's ground / air batches with their `@flash` siblings
([enemies-and-behaviors.md](enemies-and-behaviors.md)); M1-09 (done) draws the nine bullet
sprites through the World's enemy-bullet batch and added the `lasers` generator
([bullets-and-patterns.md](bullets-and-patterns.md)); M1-10 (done) draws the four `shots/*`
sprites (a laser as a row of `shots/laser` segments) and `options/orb`, which joined
`ENGINE_SPRITES` ([weapons-and-options.md](weapons-and-options.md#drawing-shots-and-options));
M1-11 (done) draws `items/capsule` and `shields/force-field` (its four wear frames), which joined
`ENGINE_SPRITES` ([powerups-and-shields.md](powerups-and-shields.md)); M1-12 (done) drew no new
sprites — the death's explosion and debris are particle cues for M1-14, the HUD's stock icon is
`hud/life`; M1-13 (done) draws the four boss-part sprites (`bosses/hull-block`, `core`,
`shield-plate`, `emitter`, all with `@flash`) for the test boss — no new sprites were needed;
M1-14 (done) draws `fx/explosion-*`, `fx/spark` and `fx/debris` as particle presets and added
two procedural sprites to `particles.mjs` — `fx/sparkle` (5×5, 4 frames, the pale-gold
bullet-cancel twinkle) and `fx/ring` (9×9, 4 frames, the growing cyan pickup ring)
([fx-and-game-feel.md](fx-and-game-feel.md)); M1-16 (done) builds the HUD from `hud/*` and `ui/pixel` and added the procedural title logo
`ui/logo` to `ui.mjs` (165×27: original 5×7 block letters ×3, a warm gradient, outline and drop
shadow — the atlas page grew to 512×512; [scenes-and-ui.md](scenes-and-ui.md#sprites-and-the-logo));
M1-18 (done) added zone A's art: the pixel maps `enemies/vane`, `enemies/gyre` and HALCYON
BULWARK's five `bosses/bulwark-*` parts (all with `@flash`; its core reuses `bosses/core`), and
the new `backdrops` generator with the planet band `bg/azure-verge` — the page stays 512×512
([zone-a-and-playtest.md](zone-a-and-playtest.md)); M2-02 (done) added `lasers/bend-*`,
`items/point` and the `palettes` generator's 45 colour-blind variants, which the renderer swaps in
when the player picks a palette ([pattern-dsl.md](pattern-dsl.md),
[rendering-and-shell.md](rendering-and-shell.md#colour-blind-bullet-palettes)); M2-03 (done) added
the Types B–D shots (seven pixel maps and the new `weapons` generator's `shots/blast`,
`shots/ripple`, `shots/cyclone`) and grew `hud/meter-labels` to 16 frames — the page stays
512×512 ([meter-arsenal.md](meter-arsenal.md#assets)); M2-04 (done) added the pixel maps
`options/stolen`, `enemies/option-hunter` and `enemies/carrier-blue` and the generated
`items/capsule-blue`, `shields/pod` and `shields/reduce`, which joined `ENGINE_SPRITES`
(`ITEM_SPRITES`, `SHIELD_SPRITES`) ([options-shields-hunter.md](options-shields-hunter.md#content-and-assets));
M2-05 (done) added the pixel maps `ships/manta` and `enemies/cube` and the `direct` generator
(the MANTA's shots, the six colour items, `shields/arm`) — the items and the Arm joined
`ENGINE_SPRITES`, and the page stays 512×512 ([direct-mode.md](direct-mode.md#assets)); M2-06
(done) added `coop.mjs` — the `<name>@p2` palette swaps of every ship and `hud/life` (which joined
`UI_SPRITES`) — and the page stays 512×512 ([coop.md](coop.md#player-2s-palette-swap)).
