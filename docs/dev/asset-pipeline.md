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
into the bundle, images loaded by relative URL — since v2's **R1-05** the atlas manifest is a file
next to its pages, fetched with XHR; only the content is still inlined) and **D30** (hit flash = a
white silhouette sprite, not a tint).

## The pipeline at a glance

```text
assets/source/sprites/**/*.sprite.json ─┐  pixel maps: palette + rows, one file per sprite
scripts/assets/procedural/*.mjs ────────┤  seeded generators: explosions, bullets, terrain …
assets/source/sprites/**/*.png (+ .json)┤  real-art overrides, replace frames by name
assets/source/fonts/*.font.json ────────┘  bitmap fonts → one sprite, a frame per glyph
assets/source/atlas-groups.json ────────  R1-05: which sprites pack onto a zone's own pages
   │  collectSprites()     validate, scale every v1-scale source by `artScale` (the interim ×1.5
   │                       stage, below), merge the PNG overrides after the scale, recolour an
   │                       override's colour-blind siblings (R3-03.V5), add <name>@flash and
   │                       <name>@p2 siblings (a ship's @p2 from its own `p2` palette map since
   │                       R3-03.V2a), default anchors from the scaled frame 0, give every sprite
   │                       its group (common, zone-a … zone-i)
   ▼
packRects()                 MaxRects per group, 1-px padding + 1-px edge extrusion, power-of-two pages ≤ 2048²
   │  buildAtlas()          place frames, encodePng(…, { indexed: 'auto' }) each page (PNG-8 when it fits), build the manifest
   ▼
assets/generated/atlas/main.png (+ main-1.png …)   page images: main.png = common, then the zone pages
assets/generated/atlas/main.json                    manifest (formatVersion 2: pages carry their group)
assets/generated/.asset-cache.json                  input hash + output digests (skip unchanged runs)
   │  shmupAssets() Vite plugin (vite.shared.ts)
   ▼
virtual:shmup-assets         export const manifestUrl = 'assets/atlas/main.json' · atlasDir · manifestDigest
virtual:shmup-assets-inline  export const manifest = {…} (inlined) · pageUrls — the render bench, the TV fallback
dist/assets/atlas/*.png      emitted next to the bundle, with dist/assets/atlas/main.json (web, Tizen, webOS)
```

**Status today.** The whole pipeline, the initial sprite set (M1-03: 55 sprites, 272 frames on
one 512×256 page — grown with every step since; one 512×512 page since the M1-16 logo, one
1024×512 page since the M2-09 boss parts, 1024² since M2-14; **since R1-05 split by zone**, and
since R2-01's interim ×1.5 art (below) a 1024² `common` page plus zone pages of 256² / 512×128 /
512×256 / 256×512, 438 sprites in 1,459 frames and 143,775 B of PNG in all — v1's art held 438
sprites in 1,411 frames; split by zone that was 120,400 B of PNG),
the pixel font, the Vite plugin and the sprite-name check in `pnpm content:check` are done. The apps register `shmupAssets()` and ship the pages; since
M1-04 their `main.ts` imports `virtual:shmup-assets`, `@shmup/shell` loads the pages with
`new Image()` (since R1-05 after fetching the manifest) and render-pixi's `createAtlas` turns them
into textures, and the default scene
(free flight since M1-06 — the KESTREL's bank frames, the star layers, the HUD; the sprite
showcase with `?scene=showcase`) draws the real sprites and the pixel font
([rendering-and-shell.md](rendering-and-shell.md)).

Why this design:

- **No human art needed, but real art drops in.** Every placeholder is source data
  (pixel rows) or code, so the repo builds on any machine, and the pictures are original.
  A PNG with the same sprite name replaces the frames later, without touching code.
- **One atlas, few batches.** Pixi batches sprites that share a texture (and up to 16 textures
  per batch, so `common` plus a zone page still batch together); the 1×1 white `ui/pixel` lets
  the HUD draw rectangles from the `common` page, and the hit flash is a second sprite on its
  base's page because Pixi's tint can only darken (multiply).
- **Pages a zone does not need can leave the GPU** (R1-05). Each campaign zone's own art packs
  onto pages of its own ([below](#atlas-groups-r1-05)), so the shell's residency unloads the other
  zones' pages ([platform-polish.md](platform-polish.md#memory-budget-shmupshell-memory)) — and
  since R3-04.M3 a page the shown World does not need never enters the GPU at all: pages load
  lazily ([below](#lazy-atlas-pages-r3-04m3)).
- **Nothing comes from a server on the TV.** The pages are plain PNG files the host loads with
  `HTMLImageElement` from a relative URL, and since R1-05 the manifest is `assets/atlas/main.json`
  next to them, read with `XMLHttpRequest` (`fetch()` fails on `file://` — D25; XHR returns status
  0 there); both work from `file://` (Tizen, webOS) and `app://` (Electron). Before R1-05 the
  manifest was inlined into `app.js` (≈ 22 KB gzip that grew with every frame).
- **Deterministic.** Two runs over the same inputs write byte-identical files, on any
  machine with the same zlib: sorted inputs, a deterministic packer, no timestamps in the
  PNGs and no engine-dependent maths in the generators.

## The interim ×1.5 art stage (R2-01)

Since R2-01 the frame is 640×360 (decision R-D1, replacing D19's 384×216), the tiles are 12 px
(R-D4) and the font cell is 9×12 with a 15-px line (R-D5, interim) — while the art bible's v2 art
only arrives through R3 … R5. In between, the pipeline upscales every v1-scale source by **3/2**,
so every sprite exists at the new size. The scale is core's `ART_SCALE` (3/2) mirrored by
`INTERIM_ART_SCALE` in `scripts/assets/interim.mjs` (pinned equal by
`test/scripts/assets/terrain-size.test.ts`); `buildAtlas({ artScale })` / `collectSprites({ artScale })`
take it as an option (default `INTERIM_ART_SCALE`; scale 1 is the v1 art at either frame) and
`generateAssets()` builds only the default scale. (The plan's wording "a pipeline stage
`interimScale: 1.5`" was built this way — decisions W4-3 … W4-6.)

**The sampling is plain nearest-neighbour** (`scaleImage`): an image `w × h` becomes
`⌈s·w⌉ × ⌈s·h⌉` and destination pixel `d` takes source pixel `⌊d / s⌋` — `⌊2d / 3⌋` at 3/2 — on
every axis, copying every channel (alpha included) as is. Explicit anchors become `⌈s·a⌉`
(`scaleAnchor`). Every computation is whole-number arithmetic on the scale's exact fraction
(`parseArtScale`), so the output is identical on every machine. That rounding is what R2-02's
rescale tool agrees with: its `spreadBands` spreads a stage's raster `bands` so their edges land at
`⌈s·b⌉` — the bands are the differences of the rounded running boundaries, so an exact `.5` height
lands a row taller or shorter with its neighbours — and pixel-centre sampling would land the `.5`
boundaries a pixel higher. The procedural generators run at their native size
first and the stage scales their output, exactly like the pixel maps (`ships/kestrel` 16×9 with
anchor [8, 4] → 24×14 with anchor [12, 6]) — except the enemy bullets and the bending laser's
nodes, which `bullets.mjs` / `lasers.mjs` draw at the bible's v2 sizes and mark `native` whenever
the build's art scale is not 1 (R3-03.V1, below and the generator table).

**Never upscaled** (decision W4-5, amended by `16aff20`) — these sources are *drawn* at the
build's art size instead:

| Source | Why it is native |
|---|---|
| The terrain tilesets (`terrain.mjs`) | Draws at `TILE_SIZE` directly (12 since the flip; its own copy of the constant is pinned to core's by `terrain-size.test.ts`), so it makes true 12-px tiles beside the ×1.5 bands |
| `ui/pixel` | The renderer stretches the one texel — its drawn size is the quad's, never the art's |
| The laser beams `lasers/beam-*` and their `@<palette>` variants | The renderer reads a frame's number as the beam's thickness, so frame `k` must be a band `k + 1` px tall — ×1.5 of frame `k` would not be `k + 1` px any more. `lasers.mjs` therefore draws one frame per band height at the art scale itself: 8 frames of 4×8 at scale 1, **12 frames of 6×12 at 3/2** (frame `k` a band `k + 1` px tall — the art bible's v2 beam, `art-bible-v2.md` §5.4). The only frames whose *count* changes at the interim scale (+4 per beam) |
| Real-art PNG overrides | Already v2-native: drawn at the art bible's sizes ([below](#real-art-png-overrides)) |
| A `native: true` source | A pixel map's `"native"` key, or `makeSprite({ native })` — what the R3 / R4 redraws set. Since R3-03.V1 the procedural bullets and bend nodes join it at every non-1 scale: `bullets.mjs` draws round 11×11 (1 frame), oval 13×13 and needle 17×17 (8 headings) and `lasers.mjs` the 11×11 bend node — the bible §5.4 sizes, marked `native`, where the interim upscale had landed the oval on 14 px (the one missed frame; round, needle and bend already matched). At scale 1 everything stays the v1 pixel map, byte for byte (`bullets-v2.test.ts`; the scale-1 digest pin never moved) |

**The interim font** (decision W4-4): `assets/source/fonts/pixel6x8.font.json` stays on disk
unchanged; `scaleFont` turns it into a 9 × 12 cell with a 15-px line and a 9-px advance inside the
atlas. That is where core's `GLYPH_W` / `GLYPH_H` / `LINE_H` come from — the file's values ×
`ART_SCALE`, pinned by `packages/core/test/config/frame-constants.test.ts`. The strokes come out
1 or 2 px wide by position and look uneven; it is temporary until R4-03's redraw.

**The `artScale: 1` builds** (decision W4-6): the TV bench's density atlas is built with
`buildAtlas({ ungrouped: true, artScale: 1 })` **for good**, and the CJK figures (above), the store
icons (`scripts/store-assets.mjs`) and the doc images (`scripts/doc-images.mjs`) build at scale 1
until R2-03 switches the doc images to the default; the store icons keep the v1 art until R4-05
(W4-6, RR-3). Scale 1 means *the v1 art at either frame* — the
bench's R0-02 / R0-03 figures therefore stay comparable across the frame flip.

**The atlas with interim art** — what `pnpm assets` writes today: 438 sprites and **1,459** frames
(v1: 1,411; the beams' +4 each is the only count change — the native bullets of R3-03.V1 change
sizes and pixels, never a count), `main.png` a 1024² `common` page plus
zone pages of 256² / 512×128 / 512×256 / 256×512 — **143,775 B** of PNG in all (re-measured after
R3-03.V1's native bullets; the interim ×1.5 upscale had written 139,944 B), far inside the
**5,700,000 B** `ATLAS_PNG_BYTES_CAP` (R1-05's 256 KiB sum cap became the detailed-art projection
`ATLAS_COMMON_PNG_CAP` 300,000 B + 9 × `ATLAS_ZONE_PNG_CAP` 600,000 B — the RR-7 stand-in band —
in R3-04.M2b; `test/scripts/assets/atlas-budget.ts`), and a 204,896 B `main.json`.
The sprite *names* do not change, so the interim art packs into the same zone groups (R1-05).

**Hand-offs to R3.** The `artScale: 1` builds pass real-art PNG overrides and `native` sources
through at their v2 size — so once R3 art ships they no longer hold pure v1 art and
`interim-pipeline.test.ts`'s scale-1 digest pin moves; R3 must decide whether `artScale: 1` skips
overrides and native sources (the pin holds) or is re-pinned with the reason. Related:
`applyPngOverrides` keeps the remaining base frames when an override has fewer, which at 3/2 puts
upscaled v1 frames beside v2 ones — R3 decides whether a partial override is allowed. And
`*.font.json` has no `native` key yet: when R4-03 lands the real 9×12 font file, either give font
sources one that the interim stage honours or drop the font scale, or a 3/2 build turns the 9×12
font into 14×18 (both the font pin and the scale-1 digest pin would move).

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
| `native` | Optional boolean (v2, decision W4-5; default `false`); `true` says the pixels are already at the art's v2 size, so the interim stage ([above](#the-interim-15-art-stage-r2-01)) leaves them unscaled |
| `frames` | Non-empty; every frame has the same size, every row the same width, every character is in the palette |
| `animations` | Optional tag → non-empty list of frame indices (`ANIMATION_NAME_PATTERN`: lower-case words joined by `-` or `_`) |

Unknown fields are errors. The files are hand-laid (one row per line) and excluded from
Prettier (`.prettierignore`), because Prettier would fold short row arrays onto one line.

### Procedural generators (`scripts/assets/procedural/`)

Each module exports `generate(options?: GeneratorOptions): SpriteDef[]` and is registered in
`procedural/index.mjs` (`PROCEDURAL_GENERATORS`). Since R2-01 `GeneratorOptions` is
`{ tileSize?, artScale? }`: the pipeline passes both to every generator — `terrain` draws its
tilesets at `tileSize` and `lasers` / `palettes` draw the beams at the build's `artScale` — for
the `native` sprites the interim stage never upscales (the "Never upscaled" list, above).

| Module | Sprites |
|---|---|
| `bullets` | `bullets/{round,oval,needle}-{pink,red,purple}` — bright core, saturated body, dark rim (`shmup_feat.md` §12). At scale 1: round 7×7 × 1 frame, oval 9×9 and needle 11×11 × 8 directional frames. At the v2 build scale it draws the bible §5.4 sizes natively instead, marked `native` (R3-03.V1): round **11×11**, oval **13×13**, needle **17×17**, 8 headings (round 1) — `bullets-v2.test.ts`. Since M2-02 drawn by `bulletSprites(colours, suffix?, marks?, generator?)` — any body colours, a name suffix and per-family **core marks** (`CoreMark`: `solid` — the bright core disc, `ring` — the core with a dark centre pixel, `dot` — no core band, one bright centre pixel); the ring / dot marks grow with the art — one pixel at v1, a five-pixel plus at the v2 core size |
| `lasers` | `lasers/beam-{pink,red,purple}` (M1-09) — enemy laser beams in the bullet colours: 8 frames of 4×8 px, frame `k` a horizontal band `k + 1` px tall (dark rim rows from 3 px, body rows from 5 px, a bright core). Every column is identical, so the renderer stretches a frame to any length and picks the frame of the beam's drawn width. M2-02: `lasers/bend-{pink,red,purple}` — the bending lasers' segment, one 7×7 round blob (`BEND_SIZE`; rim outside radius 2.6, body, a bright core inside 1.3) drawn at every node; at the v2 build scale the blob is drawn native at **11×11** (`BEND_SIZE_V2`, R3-03.V1 — `BEND_SIZE` at scale 1). Both drawn by `laserSprites(colours, suffix?, generator?)` |
| `palettes` | M2-02 (`shmup_feat.md` §21): every bullet, beam and bend sprite again for each colour-blind palette as `<sprite>@<palette>` — 15 sprites × `deuteranopia`, `protanopia`, `tritanopia` (the names match `@shmup/core` `BULLET_PALETTES`; `standard` is the plain sprites). `BULLET_PALETTES` here maps each palette to the three families' body colours (deuteranopia `#ff8ad8` / `#3ab0ff` / `#e4e4ff`, protanopia `#ff9ce4` / `#44c4ff` / `#eeeeff`, tritanopia `#ff4870` / `#22d8cc` / `#f2f2f2` for pink / red / purple — hues apart for that colour blindness and away from the gold items and orange explosions), `CORE_MARKS` the shape coding (pink `solid`, red `ring`, purple `dot`). Same frames, same order, so directional frames and band widths still line up. At the v2 build scale it passes the scale through, so the variants carry the native v2 shapes frame for frame (R3-03.V1). And since R3-03.V5 a bullet / beam / bend whose frames come from a real-art PNG override gets its variants **recoloured from that art** instead of redrawn (decision W5-13, [below](#real-art-png-overrides)) |
| `explosions` | `fx/explosion-small` (16×16 × 6), `-medium` (32×32 × 7), `-large` (48×48 × 8); animation `burst` |
| `particles` | `fx/spark` (5×5 × 3, `fade`), `fx/debris` (6×6 × 4, `tumble`), `fx/sparkle` (5×5 × 4, `twinkle` — fixed pixel lists, M1-14), `fx/ring` (9×9 × 4, `grow` — a 1-px ring of radius 1…4 by a `Math.sqrt` distance test, M1-14) |
| `items` | `items/capsule` (12×8 × 2, `blink`); M2-02: `items/point` (5×5 × 2, `twinkle`) — the gold diamond (`|dx| + |dy| ≤ 2`, dark rim, white centre) cancelled bullets turn into; frame 1 lights its tips; M2-04: `items/capsule-blue` (12×8 × 2, `blink`) — the same pill in blue with a white core (`capsule(bright, tint)`, `CAPSULE_COLORS`); M2-10: `items/capsule-bonus` (12×8 × 2, `blink`) — the pill in gold, the 1,000-point bonus capsule — and `items/1up` (12×8 × 2, `blink`) — the pill in green with a white `+` (`oneUp(bright)`), the bonus stages' extra life |
| `shields` | `shields/force-field` (30×24 × 4 wear states: `fresh`, `worn`, `damaged`, `critical`); M2-04: `shields/pod` (8×8 × 4 wear states, same names — a faceted orange-gold gem that dims to red and loses facets, seeded holes) and `shields/reduce` (20×14 × 2: `full`, `worn` — a dotted green ring round the shrunken ship, every 2nd / 4th ring pixel lit) |
| `direct` | M2-05 (`shmup_feat.md` §6B / §7B / §9): the MANTA's shots — `shots/direct-missile` (12×6 × 2: the weak and the wide missile), `shots/disc` (20×20 × 4, radius 3.5 → 9.5), `shots/beam` (26×8 × 4: blue lasers, a longer yellow one, the round piercing laser), `shots/wave` (16×34 × 4 crescent waves), `shots/sub-bomb` (6×6), `shots/sub-laser` (9×9) and `shots/sub-laser-wide` (11×11) with **8 octant frames** each (frame `k` = `k × 45°` clockwise from right — the engine picks the heading's octant, nothing is rotated at run time), `shots/sub-disc` (12×12 × 2); the colour items `items/direct-{red,green,blue,orange,yellow}` (10×10 × 2 glossy orbs, `blink`) and `items/direct-octagon`; the Arm `shields/arm` (26×18 × 9: per tier — green, silver, gold — fresh / worn / critical; animations `arm`, `superArm`, `hyperArm`) — only exactly rounded maths |
| `starfield` | `bg/stars-far`, `bg/stars-mid`, `bg/stars-near` — seamless 128×128 transparent tiles |
| `backdrops` | M1-18: `bg/azure-verge` — zone A's far planet band, a 128×48 tile (`AZURE_TILE_W`, `AZURE_TILE_H`, anchored top-left) that repeats seamlessly along x: a translucent haze thickening towards a lit rim row (`AZURE_RIM_ROW` 10), then an opaque dark-azure-to-navy body with seeded cloud streaks that wrap round the tile edge. Dark and low in saturation so the pink / red / purple bullets and the gold capsules stay readable over it, never pure black |
| `raster-bands` | M2-08 (`shmup_feat.md` §18): backdrops made for the raster effects and palette cycling — `bg/sea-swell` (`SEA_TILE_W` 128 × `SEA_TILE_H` 40, opaque, anchored top-left) painted **only** in the four colours of `SEA_RAMP` (`#183c78`, `#24569c`, `#3474bc`, `#5096d8`, dark → light — the exact ramp a stage's palette cycle names): 3-px rows whose ramp index steps with the row and bumps with a 32-px swell profile, so cycling the ramp rolls the swell and a `wave` effect wobbles it; `bg/checker-floor` (`FLOOR_TILE_W` 64 × `FLOOR_TILE_H` 48) — a checker floor in ten strips `FLOOR_BANDS` (2, 2, 3, 3, 4, 5, 6, 7, 8, 8 rows) whose squares `FLOOR_SQUARES` widen towards the bottom (4 → 32 px; each divides 32, so the tile repeats every 64 px), `FLOOR_COLORS` plus a horizon line — made for a `lines` effect with the same strips as its `bands`. Integer maths only ([presentation-polish.md](presentation-polish.md#content-and-assets)) |
| `bosses` | M2-09 (`shmup_feat.md` §13, decision D24): the advanced bosses' parts, each with its `@flash` sibling — `bosses/turret` (16×16 × 16 heading frames: a round armoured base with a 3-px barrel of length 7 pointing `k × 22.5°` clockwise from +x — `DIRECTIONS_8` and their negations, no trig; a turned part's `turn: 16`, so a raid's turrets visibly aim), `bosses/orb` (12×12 × 2, `pulse`: a shaded armour orb — round art for spinning arms and rings of pods, which are never rotated), `bosses/raid-hull` (96×40, one riveted hull section of a battleship larger than the screen — rivets from the seeded `hash2`; sections side by side make IRON LEVIATHAN's 480-px body) and `bosses/captain-shell` (28×20 × 2, `blink`: a mid-boss's rounded carapace with a glowing eye slit) |
| `terrain` | `tiles/terrain-a` — 20 tiles (v1 8×8, 12×12 since R2-01's flip — solid, floor, ceiling, walls, 45° and 22.5° slopes, and since M2-07 the destructible `brick`, crystal `cube` and regrowing `tissue` — opaque full blocks in their own colours so players can tell what breaks); every tile is also a one-frame animation named after it (`floor → [1]`, list in `TERRAIN_TILES`); collision masks and frames live in `content/tilesets/terrain-a.tileset.json` — change both together. Since M2-11 it draws one tileset per `TERRAIN_PALETTES` entry (`TerrainPalette { surface, subsurface, rock }`): `tiles/terrain-a` unchanged, `tiles/terrain-reef` (zone B's pale coral over blue-grey stone) and `tiles/terrain-dune` (zone C's sand), since M2-12 `tiles/terrain-magma` (zone D's basalt, ember rim) and `tiles/terrain-ridge` (zone E's storm-grey granite, frost rim), since M2-13 `tiles/terrain-vault` (zone F's dark olive flesh, pale-green rim) and `tiles/terrain-prism` (zone G's deep-blue crystal, ice-blue rim — lighter than the facet backdrop) — the same tiles and frames, only the rock colours (the texture hash seeded per set); the bricks, cubes and tissue look the same in every set; `terrain-reef` / `terrain-dune.tileset.json` are copies of `terrain-a`'s naming the other sprite. **Tile size (R1-04):** `renderTerrainTiles(size, name)` draws a set at any even size ≥ 4 — slopes, rims, brick courses and the crystal core scale with it — and `generate()` draws at the module's own `TILE_SIZE` (12 since R2-01's flip; v1: 8), a copy kept here rather than imported so the pipeline's input hash sees a change; `test/scripts/assets/terrain-size.test.ts` pins it to core's. `resampleMask(mask, from, to)` moves a collision mask between tile sizes: straight edges between half-tile heights exactly (`lineMask` / `lineMaskEnds` — every shipped mask, so a resampled 8-px mask equals the opaque pixels of the 12-px tile), anything else nearest-neighbour; it throws `RangeError` on a bad size or mask |
| `brine` | M2-11 (zone B, BRINE NEBULA; [zones-b-and-c.md](zones-b-and-c.md#placeholder-art-scriptsassetsprocedural)): `BRINE_SPRITES` in order — `bg/brine-nebula` (`NEBULA_TILE_W` 128 × `NEBULA_TILE_H` 64: translucent gas clouds wrapping round the tile edge), `bg/brine-sea` (`BRINE_SEA_W` 128 × `BRINE_SEA_H` 48: painted only in the four `BRINE_RAMP` colours zone B's palette cycle names, plus pale bubble rings), the enemies `enemies/froth`, `froth-bead`, `brood-bubble`, `gill-dart`, `reef-jelly`, `urchin`, `maw-rocket` and the boss parts `bosses/maw-hull`, `maw-jaw-top` / `-bottom`, `maw-core`, `maw-pod`, `maw-fin`, `herald-shell` — drawn with `fillEllipse` / `drawLine`, hit flashes on everything that can be hit |
| `dune` | M2-11 (zone C, DUNE EXPANSE): `DUNE_SPRITES` — `bg/dune-suns` (`SUNS_TILE_W` 72 × `SUNS_TILE_H` 40, the twin suns in a glow), `bg/dune-ridge` (`RIDGE_TILE_W` 128 × `RIDGE_TILE_H` 40, two layers of dune silhouettes summed from triangle waves whose periods divide the tile width — seamless), the enemies `enemies/dune-worm`, `husk-crawler`, `sand-skimmer`, `dust-devil` (3 frames), `sand-geyser`, `sand-clod`, `widow-drone` and the boss parts `bosses/widow-body`, `widow-head`, `widow-fang`, `widow-leg-top` / `-bottom`, `widow-spinneret` |
| `magma` | M2-12 (zone D, MAGMA DEEP; [zones-d-and-e.md](zones-d-and-e.md#placeholder-art-scriptsassetsprocedural)): `MAGMA_SPRITES` (13) in order — `bg/magma-peaks` (`PEAKS_TILE_W` 128 × `PEAKS_TILE_H` 56: distant ash cones with glowing craters and smoke plumes, wrapping round the tile edge), `bg/magma-lava` (`LAVA_TILE_W` 128 × `LAVA_TILE_H` 40: painted only in the four `MAGMA_RAMP` colours zone D's palette cycle names, plus dark crust floes; opaque everywhere), the enemies `enemies/ember-wisp`, `cinder-bat`, `magma-cone`, `magma-bomb`, `cinder-rock`, `slag-crawler`, `basalt-turret` and the boss parts `bosses/bastion-hull` (56×40), `bastion-core`, `bastion-emitter`, `bastion-arm` (a round 12×12 shield segment — turned by its hub, so no heading frames) |
| `tempest` | M2-12 (zone E, TEMPEST RIDGE): `TEMPEST_SPRITES` (17) — `bg/storm-clouds` (`CLOUDS_TILE_W` 128 × `CLOUDS_TILE_H` 56: billows painted only in the four `STORM_RAMP` colours, wrapping), `bg/storm-ridge` (`RIDGE_TILE_W` 128 × `RIDGE_TILE_H` 48: snow-capped saw-tooth profiles whose periods divide the tile width), `bg/storm-rain` (`RAIN_TILE_W` 64 × `RAIN_TILE_H` 64: translucent slanting streaks on a wrapped grid — seamless both ways), the enemies `enemies/hail-drifter`, `gale-kite`, `squall-jumper` (its jet flickers — the frames must differ), `crag-turret`, `thunderhead` (3 frames), `steed-foal` and the boss parts `bosses/steed-body`, `steed-head`, `steed-snout`, `steed-chest`, `steed-lid-top` / `-bottom` (mirrors), `steed-tail`, `steed-fin` |
| `vault` | M2-13 (zone F, CELL VAULT; [zones-f-and-g.md](zones-f-and-g.md#placeholder-art-scriptsassetsprocedural)): `VAULT_SPRITES` (14) in order — `bg/vault-membrane` (`MEMBRANE_TILE_W` 128 × `MEMBRANE_TILE_H` 64: a wall of cells from 22 seeded nuclei — the nearest and second-nearest, wrapped round both tile edges, so the band repeats across and down — painted only in the four `VAULT_RAMP` colours zone F's palette cycle names), `bg/vault-folds` (`FOLDS_TILE_W` 128 × `FOLDS_TILE_H` 48: fleshy lumps whose periods divide the tile width, a pale rim, pores), the enemies `enemies/lymph-mote`, `chaser-cell`, `mitosis-cell` (its waist pinching), `vault-claw`, `polyp-turret`, `spore-sac` and MANTLE REGENT's `bosses/regent-mantle`, `regent-fin` (decoration — no `@flash`), `regent-eye` (the pupil dilating), `regent-root`, `regent-segment`, `regent-tip` |
| `prism` | M2-13 (zone G, PRISM LABYRINTH): `PRISM_SPRITES` (14) — `bg/prism-facets` (`FACETS_TILE_W` 128 × `FACETS_TILE_H` 64: 16-px cells cut along a seeded diagonal, each face one of the four `PRISM_RAMP` colours by a position hash — the cycle makes them glint in turn), `bg/prism-spires` (`SPIRES_TILE_W` 128 × `SPIRES_TILE_H` 56: sharp profiles whose periods divide the tile width), the enemies `enemies/glint-mote`, `prism-cube`, `facet-turret`, `halo-crystal`, `prism-lens`, `geode`, `geode-shard` and FACET MONARCH's `bosses/facet-body` (the housing — decoration, no `@flash`), `facet-core`, `facet-crystal`, `facet-segment`, `facet-tip` |
| `citadel` | M2-14 (zone H, IRON CITADEL; [zones-h-and-i.md](zones-h-and-i.md#placeholder-art-scriptsassetsprocedural)): `CITADEL_SPRITES` (14) in order — `bg/citadel-wall` (`WALL_TILE_W` 128 × `WALL_TILE_H` 64: riveted steel panels on a 32 × 16 grid, each with a 3 × 2 running light in one of the four `CITADEL_RAMP` colours — the only ramp pixels, so zone H's palette cycle makes the lights chase), `bg/citadel-pipes` (`PIPES_TILE_W` 128 × `PIPES_TILE_H` 48: three pipes with flanges every 32 px, struts to a girder), the enemies `bolt-drone`, `hatch-bay` (shut / open), `hatch-mite`, `laser-emitter` (its lens glowing), `sentinel-walker`, `rail-turret` and IRON SOVEREIGN's `sovereign-hull`, `sovereign-core` (pulsing), `sovereign-plate`, `sovereign-pod`, `sovereign-emitter`, `sovereign-hatch` (drawn, not placed by the shipped content) |
| `abyss` | M2-14 (zone I, ABYSSAL THRONE): `ABYSS_SPRITES` (19) — `bg/abyss-murk` (`MURK_TILE_W` 128 × `MURK_TILE_H` 64: black-blue water in soft bands with specks in the four `ABYSS_RAMP` colours — they twinkle in the cycle), `bg/abyss-spires` (`SPIRES_TILE_W` 128 × `SPIRES_TILE_H` 56: rock spires and weed whose periods divide the tile width), the enemies `lumen-mote`, `depth-mine`, `trench-eel`, `gulper`, `abyss-turret`, `ark-hook`, the ABYSS ARK's `ark-bow`, `ark-hull`, `ark-stern` (decoration), `ark-turret` (16 heading frames, like `bosses/turret`) and `ark-heart`, THE HOLLOW KING's `king-body`, `king-jaw-top` / `-bottom`, `king-maw`, `king-stalk`, `king-lure` |
| `ending` | M2-14 (`shmup_feat.md` §17): `ENDING_SPRITES` (6) — the ending scenes' UI sprites, anchored at their centres (`core/ui` `UI_SPRITES`, so part of `ENGINE_SPRITES`): `ui/ending-citadel` (128×72: stepped towers and walls with amber windows), `ui/ending-ark` (112×36: the ARK's silhouette with a tail fluke), `ui/ending-blast` (24×24 × 4: flash → ring → smoke), `ui/ending-bubble` (6×6), `ui/ending-sun` (64×32: the upper half of a pale-gold sun with rays), `ui/ending-surface` (64×8: the sea's surface from below; its period divides its width, so it tiles) |
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
  tags win over code tags of the same name; the sidecar's pivot wins over a code-defined
  anchor, which stays the fallback for a PNG without one (R3-02 — before, the code anchor
  won, so a v2 PNG drawn at ×1.5 kept its v1 anchor). A sidecar `meta.shmup.p2` map wins
  over the sprite's own `p2` the same way (R3-03.V2a, [Player 2's palette
  map](#player-2s-palette-map-m2-06-r3-03v2a)). A PNG with no code-defined
  counterpart adds a new sprite.
- The export must list at least one frame, and every frame must fit an atlas page with its
  border (at most 2046×2046). Both are reported as source issues naming the file.
- `README.md`, `LICENSES.md`, `.gitkeep`, editor files such as `*.aseprite` and the ingest
  tool's `*.recipe.json`, `*.art.json` and `*.edit.png` (R3-02,
  [real-assets.md](real-assets.md)) are ignored; a `*.json` that is neither a sprite source
  nor the sidecar of a PNG is an issue. The one ingest output *not* in the ignore list is the
  tile masks sidecar `<name>.masks.json` (R3-03.V4a) — under `assets/source/sprites/` it is
  reported as a stray JSON, so keep it beside the recipe in the staging folder (or delete it
  once its masks are copied); `scripts/assets/tileset-masks.mjs --check` scans both trees.

**Palette variants of overridden art (R3-03.V5, decision W5-13).** When a bullet, beam or bend
frame comes from a PNG override, its `@<palette>` colour-blind siblings are **recoloured from
that art**, not redrawn from the procedural shapes. `recolourBulletOverrides` runs in
`collectSprites` right after the override merge, before the font and the `@flash` / `@p2`
siblings: every opaque pixel is classified into the v1 art's rim / body / core bands by luma
(integer BT.601 weights 77/150/29; the boundaries are sums of neighbouring reference lumas
compared against twice the pixel's, so no engine rounds differently), each band is mixed to the
palette's body colour with `bullets.mjs`'s own ratios (rim toward black 0.68, core toward white
0.75), and the family's shape code is re-applied — `CORE_MARKS` draws the `ring`'s dark plus and
the `dot`'s bright plus over the recoloured body, the `dot` family additionally drops the core
band to the body. Beams and bend nodes carry no mark. Alpha, sizes, anchor, frame count and
frame order are kept, so the `content.test.ts` variant pin (every variant defined, frame for
frame, equal `w/h/ax/ay`) still holds. The variant's origin is `palette:<base>` — kind `palette`
in the origin report, inheriting the base's provenance ([art-provenance.md](art-provenance.md)).
Only sprites of the procedural `BULLET_SPRITES` set gain recoloured siblings: a PNG introducing
a *new* bullet name outside that set has no variants and none are required. Today's shipped atlas
is byte-identical either way — no override PNG exists yet.

### Bitmap fonts (`*.font.json`)

`assets/source/fonts/pixel6x8.font.json` is the original 6×8 font: ASCII 32–126 plus
`← ↑ → ↓ ● ✕ ★`, 5×7 letters with a spacing column and a descender row, `lineHeight` 10,
`advance` 6. **M3-03** added 93 glyphs for the localization — the Latin-1 capitals Spanish needs
(`Á É Í Ó Ú Ñ Ü ¿ ¡`) and the katakana subset Japanese is written in — so the font is **195
glyphs** today. The charset is declared once, in `@shmup/core` `UI_GLYPHS`, and
`test/scripts/assets/font.test.ts` asserts the font source holds exactly those code points: a
`strings` entry the loader accepts can always be drawn, and a glyph nothing draws never reaches the
atlas.

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
section with glyphs keyed by **decimal code point**. Nothing assumes 6×8: the pipeline takes any
cell, advance and line height from the file, and render-pixi's text module lays text out with them
(R1-04 proves a 9×12 font in `font-cell-size.test.ts`); core's layout reads the mirrored constants
`GLYPH_W` / `GLYPH_H` / `LINE_H`, which `frame-constants.test.ts` pins to this file **× `ART_SCALE`**.
As built, R2-01 did not change this file at all: the interim stage scales it (`scaleFont`, above),
so the shipped file stays the 6×8 original and the constants are its values × 3/2 — 9 / 12 / 15.
R4-03 replaces the file with the redrawn font (and must then either give `*.font.json` a `native`
key the interim stage honours or drop the font scale, or a 3/2 build would turn 9×12 into 14×18).

#### Katakana and the CJK budget (M3-03)

Localization into a CJK language is the one place where a bitmap font can wreck a build, so the
shape of the decision matters more than the code:

- **The subset is katakana only** — the 46 base kana, the 20 voiced and 5 semi-voiced ones, the 9
  small ones, the long-vowel bar, the middle dot and the two punctuation marks: **84 glyphs**. No
  kanji, no hiragana. That is how 1980s arcade hardware wrote Japanese, and it is legible for menu
  text.
- **They fit the existing 6×8 cell.** The kana body is drawn in columns 0–4 and **rows 1–7** — the
  classic 5×7 LCD katakana box — which leaves **row 0** free for the voicing marks, so `ガ` is `カ`
  with `..#.#.` on top and `パ` is `ハ` with `....#.`. Those 25 glyphs are derived from their base,
  not drawn twice, and `font.test.ts` asserts they stay equal below row 0. Latin letters keep rows
  0–6, so kana sit one pixel lower — which is what a CJK face does anyway.
- **Nothing is loaded separately.** The 93 new glyphs cost **1.6 KB of atlas PNG** (134.9 → 136.6
  KB) and the atlas was still **one 1024² page** of the 2048² limit (M3-03 — since R1-05 the glyphs
  sit on the `common` page); the two translations cost
  **8.6 KB of `app.js` gzip** (386.9 → 395.5 KB of the 512 KB budget). A separate page or a
  lazily-loaded atlas would be machinery for nothing at this size, so the katakana live in the main
  atlas and load with it.

The number that made this decision is the one a **real kanji set** would cost — and it is a
**download-and-boot** number, not a budget overrun. The whole **JIS X 0208** repertoire (levels 1
*and* 2, plus the kana and symbols) is about **6,900 characters**; at a legible 12×12 that is
`6900 × 12 × 12` = **993,600 pixels** (≈ 1.0 M). Measured against this build:

- the game's **whole** atlas occupies **479,505 pixels** — the sum of every frame in
  `assets/generated/atlas/main.json` — which packed as **one 1024² page** (1,048,576 px, 46 % full)
  encodes to **136.6 KB** of PNG. (Since R1-05 the shipped atlas is split by zone, and since R2-01
  these figures are computed on the **v1-scale** art: `test/integration/cjk-budget.test.ts` rebuilds
  `buildAtlas({ ungrouped: true, artScale: 1 })` — decision W4-6, so the interim ×1.5 atlas (2.25×
  the area) does not move them and the six documents that quote them stand; R2-03 decides whether
  the docs quote the v2 atlas instead. Grouped or ungrouped, the area is the same.) So a kanji set is about **2.1× the pixels the entire sprite set uses**,
  and about 0.95 of that page on its own;
- one 2048² page is 4,194,304 pixels, so that set is **under a quarter of a single page**: it needs
  **one extra atlas page**, not five;
- `apps/tizen/dist` measured **1,676.1 KB** on 2026-09-16, against the 8,192 KB `DIST_BUDGET` of
  that day; the budget doubled to **16,384 KB** in R3-04.M2b (`DIST_BUDGET` in
  `apps/tizen/scripts/check-bundle.mjs`, imported by the webOS check), and the page above encodes
  to 136.6 KB, so an extra page of glyphs is **nowhere near** a `DIST_BUDGET` overrun.

A kanji language is therefore **feasible** — do not read this section as saying it is impossible.
What rules it out *here* is that an extra page of that size roughly **doubles the atlas download
and the boot-time decode for every player**, including everyone who never picks that language,
against the ≤ 10 s launch rule (M2-18) — a real cost to pay for 84 glyphs' worth of menu text.
Before shipping one:

1. **Subset by use**, not by standard — only the characters the shipped `strings` files actually
   contain (a full UI is a few hundred kanji, not seven thousand);
2. give that set **its own atlas page**, named so the loader can fetch it per language rather than
   for everyone (the manifest already lists one file and, since R1-05, one group per page — and since
   R3-04.M3 the shell's lazy residency loads only the pages the shown World needs, so a page no
   language selects is never fetched; what a per-language page still needs is the residency learning
   the language's group, which R3-04 did not build);
3. re-measure `dist/` against `DIST_BUDGET` and — the figure that actually decides it — the **boot
   time** against the ≤ 10 s launch rule before believing it fits.

### Hit flash (D30)

For every sprite with `hitFlash: true` the pipeline adds a **sibling sprite**
`<name>@flash`: the same frame count, sizes, anchor and animations, every visible pixel
turned white with its alpha kept. The renderer shows a hit by drawing
`manifest.sprites[name].flash` with the same frame index — one sprite-id change, on the same
atlas page as its base (siblings follow their base's group) and in the same batch. (The plan sketched one `<frame>@flash` per frame; a whole sprite
is simpler for the renderer.) Today the seven enemies and the four boss parts flash.

### Player 2's palette map (M2-06, R3-03.V2a)

After the `@flash` siblings, `collectSprites` adds a `<name>@p2` sibling (`scripts/assets/coop.mjs`)
for every sprite under `ships/` and for `hud/life` (`P2_VARIANT_PREFIXES`, `P2_VARIANT_SPRITES` —
never a generated `@` name): the same anchor, frame sizes and animations, `hitFlash: false`, every
pixel recoloured through the sprite's **`p2` palette map** — `"#rrggbb": "#rrggbb"` pairs that
`makeP2Sprite` applies, so the KESTREL's blue hull stripe turns red-orange, its cyan canopy gold,
its orange engine glow blue. Only the listed colours are exchanged; every unlisted colour and the
whole alpha pass through, so full-colour real art keeps its shading. A channel swap is unpredictable
there — R3-03.V2a replaced v1's red ↔ blue swap (history: M2-06 drew the variant by swapping the red
and blue channels, green and alpha kept) with the map, and the four shipped sprites
(`ships/kestrel`, `ships/kestrel-thruster`, `ships/manta`, `hud/life` — the last a pixel map) declare
maps that exchange exactly the colours the old swap did, so the atlas is byte-identical at both art
scales. The map is the sprite's own `p2` field: the `"p2"` key of a pixel map or generator sprite, or
the sidecar's `meta.shmup.p2` on a PNG override, which wins over the code-defined map just as the
slice pivot wins over the anchor (real art declares its own player-2 colours — no code change to
recolour a ship, `p2-ingest.test.ts`). Every sprite the rule reaches is a pixel map today, so
`makeP2Sprite` takes the map from the source JSON; a generated sprite cannot declare one yet
(`makeSprite` has no `p2` option).
`collectSprites` **demands** the map: a `wantsP2Variant` sprite without one, or with a map naming a
colour its art does not contain, or changing no pixel, fails the build with those issues
(`coop-p2.test.ts`). The core interns `<ship sprite>@p2` for every ship (`P2_SPRITE_SUFFIX`,
`PlayerShipSpec.spriteP2Id`) and the HUD `hud/life@p2`, and `pnpm content:check` requires them; the
oversize report skips generated siblings ([coop.md](coop.md)).

## The initial sprite set

| Group | Sprites | Source |
|---|---|---|
| Player | `ships/kestrel` (16×9: `level`, `up`, `down`, from `PLACEHOLDER_SHIP`), `ships/kestrel-thruster` (6×3 × 2, `burn`, drawn behind the ship), `options/orb` (`pulse`), since M2-04 `options/stolen` (the grey Option a hunter carries or that drifts free, 2 frames, no `@flash`), since M2-05 `ships/manta` (the Direct-mode ship: a flat ray-winged hull with a green canopy, 3 frames — level, banking up / down, no `@flash`) | pixel maps |
| Player shots | `shots/basic`, `shots/double`, `shots/laser` (a segment, anchor on its left edge), `shots/missile` (`fly`); since M2-03 the Types B–D shots `shots/bomb` (the Spread Bomb), `shots/two-way` (2 frames: climbing / diving), `shots/torpedo` (2 frames, violet), `shots/tail`, `shots/vertical`, `shots/free` (cyan darts), `shots/twin` (a green beam segment) | pixel maps; `shots/blast`, `shots/ripple`, `shots/cyclone` generated (`weapons`) |
| Enemies | `enemies/drifter`, `turret`, `carrier-red`, `hopper`, `spinner`, `darter`, since M1-08 the ground `hatch` (20 px wide, lid closed / open), and since M1-18 zone A's `vane` (12×10, an amber swept-wing fan flier, wings beat) and `gyre` (14×14, a teal ring round a bright core, the ring turns), and since M2-04 the violet `option-hunter` and the blue `carrier-blue`, and since M2-05 the violet Direct-mode carrier `cube` — 2 frames each, all with `@flash`; since M2-07 the stage gimmicks `rock`, `lava` (2 frames, `glow`), `volcano`, `bubble`, `bubble-small`, `suction` (2 frames, `spin`), `tentacle` and `rush-cube`, all with `@flash`, and the engine sprite `gimmicks/chain-link` (a tentacle's arm segment, no flash — `core/stage` `GIMMICK_SPRITES`) | pixel maps; since M2-11 the zone B / C enemies (`froth`, `froth-bead`, `brood-bubble`, `gill-dart`, `reef-jelly`, `urchin`, `maw-rocket`; `dune-worm`, `husk-crawler`, `sand-skimmer`, `dust-devil`, `sand-geyser`, `sand-clod`, `widow-drone`) generated (`brine`, `dune`); since M2-12 the zone D / E enemies (`ember-wisp`, `cinder-bat`, `magma-cone`, `magma-bomb`, `cinder-rock`, `slag-crawler`, `basalt-turret`; `hail-drifter`, `gale-kite`, `squall-jumper`, `crag-turret`, `thunderhead`, `steed-foal`) generated (`magma`, `tempest`); since M2-13 the zone F / G enemies (`lymph-mote`, `chaser-cell`, `mitosis-cell`, `vault-claw`, `polyp-turret`, `spore-sac`; `glint-mote`, `prism-cube`, `facet-turret`, `halo-crystal`, `prism-lens`, `geode`, `geode-shard`) generated (`vault`, `prism`); since M2-14 the zone H / I enemies (`bolt-drone`, `hatch-bay`, `hatch-mite`, `laser-emitter`, `sentinel-walker`, `rail-turret`; `lumen-mote`, `depth-mine`, `trench-eel`, `gulper`, `abyss-turret`, `ark-hook`) generated (`citadel`, `abyss`) — 72 enemy sprites in the atlas |
| Boss parts | `bosses/core`, `shield-plate` (`intact`, `cracked`), `hull-block`, `emitter` (`idle`, `charge`), and since M1-18 HALCYON BULWARK's `bulwark-hull` (48×32), `bulwark-wing-top` / `-bottom` (56×14), `bulwark-emitter` (18×10, 2 frames — it glows) and `bulwark-plate` (6×18) — all with `@flash` | pixel maps; since M2-09 / M2-11 the generated `bosses`, `brine` (GALVANIC MAW, SPUME HERALD) and `dune` (SANDGRAVE WIDOW) parts, since M2-12 `magma` (CINDER BASTION) and `tempest` (SQUALL STEED), since M2-13 `vault` (MANTLE REGENT) and `prism` (FACET MONARCH), since M2-14 `citadel` (IRON SOVEREIGN) and `abyss` (the ABYSS ARK, THE HOLLOW KING) |
| Items | `items/capsule`, `items/point` (M2-02), `items/capsule-blue` (M2-04), the six `items/direct-*` colour items (M2-05), `items/capsule-bonus` and `items/1up` (M2-10) (generated) | both |
| HUD | `hud/meter-slot`, `hud/meter-labels` (generated), `hud/life` | both |
| World | `bg/stars-{far,mid,near}`, `bg/azure-verge` (M1-18), `tiles/terrain-a`; since M2-11 `bg/brine-nebula`, `bg/brine-sea`, `bg/dune-suns`, `bg/dune-ridge`, `tiles/terrain-reef`, `tiles/terrain-dune`; since M2-12 `bg/magma-peaks`, `bg/magma-lava`, `bg/storm-clouds`, `bg/storm-ridge`, `bg/storm-rain`, `tiles/terrain-magma`, `tiles/terrain-ridge`; since M2-13 `bg/vault-membrane`, `bg/vault-folds`, `bg/prism-facets`, `bg/prism-spires`, `tiles/terrain-vault`, `tiles/terrain-prism`; since M2-14 `bg/citadel-wall`, `bg/citadel-pipes`, `bg/abyss-murk`, `bg/abyss-spires`, `tiles/terrain-citadel`, `tiles/terrain-abyss` | generated |
| FX / bullets / shield | explosions, spark, debris, 9 enemy bullets, 3 laser beams (M1-09), 3 bending laser segments (M2-02), `shields/force-field`, `shields/pod` and `shields/reduce` (M2-04), `shields/arm` and the MANTA's shots (M2-05) | generated |
| Colour-blind variants | M2-02: the 15 bullet / beam / bend sprites × 3 palettes as `<sprite>@<palette>` (45 sprites) | generated (`palettes`) |
| Utility | `ui/pixel`, `ui/missing`, `ui/logo` (M1-16), `font/pixel`; since M2-14 the ending scenes' `ui/ending-citadel`, `-ark`, `-blast`, `-bubble`, `-sun`, `-surface` | generated / font |

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
- **Groups (R1-05).** An item may carry a `group`; each group is packed on pages of its own with
  the same algorithm, so no page mixes two groups. Pages come group by group: the items without a
  group first, then `groupOrder` (the pipeline passes `['common']`, so `main.png` is always
  `common`), then every other group by name; an empty group makes no page. Without groups the
  layout is exactly the ungrouped one, and the `group` field appears only on grouped pages and
  placements. Today: `main.png` common 1024², then `main-1.png` … `main-9.png` for `zone-a` …
  `zone-i` — A, C, D and F 256², B and G 512×128, E and H 512×256, I 256×512 (the interim ×1.5
  art; v1's art packed `common` at 1024×512 and the zone pages at 256×128 / 256×256).
- **PNG-8 (R1-05, decision W3-3).** `buildAtlas` encodes every page with
  `encodePng(image, { indexed: 'auto' })`: a page with at most 256 distinct RGBA values
  (`MAX_PALETTE_SIZE`) is written as an indexed PNG (colour type 3 — `PLTE`, a `tRNS` covering only
  the entries with alpha < 255, filter None on every row), else as 8-bit RGBA. It is **lossless**
  (the palette holds the exact values; a fully transparent pixel keeps its RGB) and deterministic
  (`indexedPalette` orders the entries translucent-first, then by packed `0xRRGGBBAA`). Eight of
  today's zone pages are PNG-8; `common` (the shared art of every zone — the one-page atlas had
  1,537 colours) and zone B's page (its sea gradient) have more than 256 and stay RGBA. The encoder's default stays `'never'`, byte-identical to
  the encoder before R1-05, so the documentation pictures and store icons never change
  (`docs:images --check`, `store:assets --check`); quantised detailed art (48–64 colours a zone,
  the art bible) will make most zone pages PNG-8 by itself.
- Speed: a trial of a candidate page size stops at the first cell that does not fit, and
  after each placement only the new free rectangles are tested for containment (the others
  cannot be contained — see `MaxRectsBin.split`). Both leave the layout byte-identical; the
  full atlas builds in about 0.3 s instead of 0.5 s.
- Manifest coordinates (`x`, `y`, `w`, `h`) are the frame itself, inside its border.

## Atlas groups (R1-05)

Every sprite belongs to one **group**: `common` (page 0, `main.png` — ships, shots, bullets, items,
fx, the font, the UI and HUD, and every sprite more than one zone draws) or one per campaign zone
(`zone-a` … `zone-i` — its enemies, boss, backdrops and tiles), and each group is packed on pages of
its own, so the shell's residency can unload the pages of the zones not being played
([platform-polish.md](platform-polish.md#memory-budget-shmupshell-memory)).

- **Where a sprite's group comes from** (`resolveAtlasGroup`): the groups file by the sprite's
  **base name** (the part before `@` — `@flash`, `@p2` and the colour-blind palettes follow their
  sprite); else a `zone-<id>` directory segment in its name (`enemies/zone-d/bat` → `zone-d` — for
  future art, since today's names carry no zone and R4 keeps them); else `common`. A font always goes
  to `common`, and so does every sprite when `buildAtlas({ ungrouped: true })` /
  `collectSprites({ ungrouped: true })` is asked for the one-page layout (it never reads the groups
  file — the pre-R1-05 atlas byte for byte; the TV render bench builds its density atlases from it,
  and `cjk-budget.test.ts` measures on it). `SpriteDef.group` is set by the pipeline only — there is
  no `group` field in a sprite source.
- **The groups file** `assets/source/atlas-groups.json` (format `shmup-atlas-groups@1`, an optional
  `comment`, `groups: { "zone-a": [base names…], … }`; 125 names today — zone A 9, B 12, C 16, D 11,
  E 18, F 10, G 15, H 14, I 20) is **derived from the content, never edited by hand**: a sprite
  exactly one campaign zone names — through its stage, enemies, children, bosses, tileset and linked
  bonus stage, the walk `@shmup/shell` `stageSpriteSets` does — goes to that zone; engine, UI-kit and
  scene-view sprites (`ENGINE_SPRITES`, `UI_SPRITES`, `SCENE_VIEW_SPRITES`) never do, because the
  renderer draws them everywhere. Zone A's boss parts are in `common`, since zone H's parade reuses
  them. After a content change that moves a sprite between zones:

  ```sh
  SHMUP_ATLAS_GROUPS_UPDATE=1 pnpm exec vitest run --project integration test/integration/atlas-groups.test.ts
  pnpm assets
  ```

  `test/integration/atlas-groups.test.ts` fails while the file differs from the derivation. The file
  is part of the pipeline's input hash (and of turbo's `//#assets` inputs through `assets/source/**`).
- **Issues** (reported like any source issue): a listed name that is no sprite, a listed font or
  `@` name, and a `common` group left empty (page 0 must hold it).
- **What it does not change:** sprite names, their order, frame names and frame ids (the renderer
  numbers frames by sprite name), so a re-derivation or a new split moves no golden replay — only
  page positions change. R1-05 compared 53 canvas captures of the grouped and the ungrouped build at
  frozen ticks: byte-identical.

## Lazy atlas pages (R3-04.M3)

Since R1-05 the residency loads every page a zone needs and holds it; since R3-04.M3 pages are
fetched on demand and **detached when the stage changes**, and that is the default (M3a `e1dcedf`,
M3b `46663d6`, M3c `1c5762c`, M3d `c61ccca`, M3e `338c3fe` — decision W5-15). Nothing the
pipeline builds changes: the same pages, the same manifest, the same bytes — laziness is entirely
runtime. The pipeline-relevant facts:

- **render-pixi** (`@shmup/render-pixi` `atlas`): `createAtlas` takes `null` for a page that starts
  unloaded; `Atlas` gains `isPageLoaded` / `loadPage` / `unloadPage`. A `TextureSource` and its
  `Texture`s keep their object identity across attach / detach, so every sprite binding made at load
  time stays valid; a frame on an unloaded page reads Pixi's empty source (0×0) — nothing samples
  or draws it, and no `NaN` bounds appear. `loadPage` restores the manifest rects; `unloadPage`
  drops the decoded image (the object, not the manifest entry).
- **shell residency** (`@shmup/shell` `memory`, the runtime half in
  [rendering-and-shell.md](rendering-and-shell.md) and
  [platform-polish.md](platform-polish.md)): `createLazyAtlasResidency` — `prepare(stage)` detaches
  the pages the stage does not need and fetches, decodes, attaches and uploads the ones it does, in
  parallel through `Promise.all` (`Promise.allSettled` is Chromium 76). It is idempotent, retries a
  failed load or upload on the next `prepare`, and fires the same `onChange` shape as the eager
  residency. The image policy is `resident` for the lazy pages where the eager one is `all`
  (decision W3-2); the loader gained `loadImageTimed` so a page keeps its timed fetch row.
- **The zone-change hold** (`ShellOptions.atlasPages: 'lazy' | 'eager'`): boot awaits the current
  stage's own `prepare` (decision W5-16), and a `PrepareStage` or a new `World` fires the loads.
  While pages are in flight the frame loop **redraws the last frame** — no tick, no input, no
  events — so a replay played across a zone change hashes identically with and without the hold,
  and the held frame allocates nothing. The debug frame advance queues its step in
  `Game.requestStep` and runs it on the first released frame (what `test/e2e/frame-advance.ts`
  `stepTo` waits through).
- **Context loss**: on `webglcontextrestored` the boot re-fetches, re-attaches, `unload()`s and
  re-uploads each resident page serially (a cold re-upload); if that fails it falls back to Pixi's
  lazy re-creation (`test/e2e/atlas-context-loss.spec.ts`).
- **Parity rule**: a screen that draws sprites **outside** its zone's page set must either keep
  those pages resident or attach them like the weapon-select preview World does — its private World
  sits outside the residency, so `attachUnloadedPageImages` attaches the page images without
  uploading or marking them resident, and each page uploads itself on first draw exactly as an
  eager page would; the next real `prepare` detaches them. Tests that pin eager behaviour pass
  `atlasPages: 'eager'` explicitly.
- A page whose bytes do not fit the manifest rects throws a `RangeError` reading
  `ATLAS DOES NOT MATCH ITS MANIFEST` (stale `dist/` versus a newer build); `AssetLoadError`
  carries the `pageUrl` so the error screen names the page.

## Stand-in zone art (`standin.mjs`, R3-04.M1)

R3-04.M2 could not set the real-art atlas budget before the real art exists, so R3-04.M1 built a
generator that draws a **whole zone with a detailed sprite's byte profile**: deterministic, seeded,
palette-lawful placeholder art dense enough to measure against (`scripts/assets/standin.mjs`,
M1a `341836b` + `1f49f41`, M1b). It sits at `scripts/assets/` rather than `procedural/` on purpose
(decision W5-14): the `procedural/` folder is the **shipped** generator set — this file must never
pack into the game's atlas. Nothing imports it except its own tests and R3-04.M4a's TV render
bench (`apps/tizen/scripts/bench-atlas.mjs` calls `standinAtlas`); adding it rebuilt the shipped
atlas with no byte change, and the scale-1 digest pin has never moved. Like the terrain generator it
may import `scripts/frame.mjs` — the one root-script exception, because zone art is laid out in
frame coordinates (`scripts/assets/terrain.mjs` explains why).

- **`standinZone(zoneId, { seed })`** returns the zone's pixel maps, backdrops and tileset as data
  (nothing is written): a `PALETTE_SIZE` of **48–64** colours in windows sky 0…15 / mid 16…31 /
  rock 32…47 / accent 48…55, every one at least `RAMP_MARGIN`/255 (Chebyshev) from all eight
  reserved palette-cycle ramps (bible §4.4) and never exactly a reserved bullet, gold or explosion
  colour; the far layer `FRAME_W × FRAME_H` opaque (`FAR_WIDE_ZONES` build it 2 frames
  `FRAME_W` wide) inside its ≤32-colour window; **4–5** keyed mid bands, each `FRAME_W × 120–240`
  (far + bands = a 4–6 stack), drawn on the green-key **`KEY` pixel** that the written pixel maps
  carry as `null` (bible §8, binary alpha §3.6); enemies in the 16-colour window, the boss, its
  parts and states in the 24-colour one (bible §4.3 caps); 40 tiles at `TILE_SIZE` — edges,
  corners, slopes, destructibles, deco — in a ≤32-colour set.
- **`standinAtlas(zones, { seed })`** (M1b) builds a real atlas from it: a temporary tree that
  copies `assets/source/`, adds `sprites/standin/zone-<x>/…` sprites marked `native: true` (the
  enemies and boss parts with `hitFlash: true`), gives `atlas-groups.json` a `standin-zone-<x>`
  group per zone — so the shipped groups stay untouched and every stand-in zone packs onto its own
  pure pages — then runs the ordinary `buildAtlas` and removes the temp. `assets/source/` is never
  written.
- **Why the byte model is honest**: the entropy knobs (`NOISE_CELL`, `HAZE_CELL`,
  `FAR_STREAK_ROWS`, `DETAIL_DENSITY`, `RIBBON_DENSITY`, `BAND_STEP`, `BAND_WINDOW_DENSITY`,
  `TILE_TEXTURE_LEVELS`, `SPRITE_DETAIL_DENSITY`) tune each zone's own 2048×1024 PNG-8 page into
  the **338,822–446,323 B** band `test/scripts/assets/standin.test.ts` pins (300,000–600,000 B
  scaled to the page size — the RR-7 projection), and `test/integration/standin-budget.test.ts`
  reads the zone residency from the built atlas (430,743–538,244 B per page including the shared
  `common` page). R3-04.M2b set `ATLAS_ZONE_PNG_CAP` **600,000 B** and `ATLAS_COMMON_PNG_CAP`
  **300,000 B** from these rows. Measured at `7baeb4d`: the worst zone (D) lands 153,677 B inside
  the per-page ceiling; M1c will re-calibrate the band against the first real AI ingests.
- **Its limits are documented**: the stand-in boss parts (`STANDIN_BOSS_PARTS`,
  `scripts/assets/standin.mjs:879-882` — turret 44×44 ×4 frames, pod 26×26 ×3, cannon 30×18 ×2)
  deliberately shortcut the bible §5.7 part table as a **byte-model shorthand** — they buy §5.7's
  memory profile, not its silhouette. Real art replaces them through R3/R5, and §5.7 governs that
  art, not these placeholders.

## The manifest (`assets/generated/atlas/main.json`)

```json
{
  "formatVersion": 2,
  "pages": [{ "file": "main.png", "w": 1024, "h": 1024, "group": "common" }, { "file": "main-1.png", "w": 256, "h": 256, "group": "zone-a" }],
  "frames": { "ships/kestrel#0": { "p": 0, "x": 1, "y": 1, "w": 24, "h": 14, "ax": 12, "ay": 6 } },
  "sprites": { "ships/kestrel": { "frames": ["ships/kestrel#0", "ships/kestrel#1", "ships/kestrel#2"], "flash": null } },
  "animations": { "ships/kestrel": { "down": [2], "level": [0], "up": [1] } },
  "fonts": { "pixel": { "sprite": "font/pixel", "lineHeight": 15, "cellWidth": 9, "cellHeight": 12,
    "glyphs": { "65": { "frame": "font/pixel#33", "advance": 9 } } } }
}
```

| Key | Meaning |
|---|---|
| `formatVersion` | `MANIFEST_FORMAT_VERSION` (**2** since R1-05; 1 had no `group`) — the shell and both bundle checks read 1 or 2 (`ATLAS_MANIFEST_VERSIONS`) |
| `pages[]` | `{ file, w, h, group }` per page — page 0 is `main.png`, the `common` group; the shell fetches page `i` from `atlasDir + '/' + pages[i].file` (`atlasPageUrls`), and `pageUrls[i]` of the inline module is page `i` |
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
assets generated → assets/generated/atlas/: main.png 1024×1024 common, main-1.png 256×256 zone-a, …, main-9.png 256×512 zone-i; 438 sprites, 1459 frames, 1 font(s)
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
- the sprite and font sources as they are on disk now (`*.md` and `.gitkeep` are skipped);
- the groups file `assets/source/atlas-groups.json` (R1-05).

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
| `buildStart` | Runs `generateAssets()` (cached). In builds it emits every page as `assets/atlas/<file>` and — since R1-05 — the manifest as `assets/atlas/main.json` (`ATLAS_MANIFEST_URL`; the pipeline's own bytes, so one digest holds for the build and the dev server) with `emitFile` — fixed names, no content hash, because the manifest names the pages and the app names the manifest |
| `resolveId` / `load` | Serves **`virtual:shmup-assets`** (`ASSETS_MODULE_ID`, what the apps import since R1-05): `export const manifestUrl = 'assets/atlas/main.json'`, `export const atlasDir = 'assets/atlas'` (both relative), `export const manifestDigest = '…'` (`manifestDigest(bytes)` — 32-bit FNV-1a over the manifest file's bytes, 8 hex digits; the shell's loader computes the same and refuses another build's manifest) and `export default { manifestUrl, atlasDir, manifestDigest }`. And **`virtual:shmup-assets-inline`** (`ASSETS_INLINE_MODULE_ID`): what `virtual:shmup-assets` was until R1-05 — `export const manifest = {…}` (inlined), `pageUrls` (relative, one per page), `export default { manifest, pageUrls }` — for the headless render bench harness and as the TVs' one-line fallback should `file://` XHR ever fail (W3-7) |
| `configureServer` | Dev only: a middleware serves `<base>assets/atlas/<file>` (`[a-z0-9-]+.png` / `.json`, no paths; malformed URLs fall through to a 404) from `assets/generated/atlas/` — the manifest too. Edits under `assets/source/` regenerate the atlas, invalidate **both** virtual modules and send a full reload; an invalid edit logs the issues and keeps the last good atlas |

**Edits to the pipeline code** (`scripts/assets/**`) are *not* regenerated in-process — the
running server still has the old modules loaded. Every pipeline module is a config
dependency of the app configs (they import `vite.shared.ts`, which imports the pipeline),
so Vite restarts the server itself and the new `buildStart` regenerates with the new code.
When no restart is coming (inline config, `--configLoader native`, a module nothing imports
yet) the plugin logs a warning asking for a restart.

The apps register the plugin (`apps/web/vite.config.ts`, `apps/tizen/vite.config.ts`,
`apps/webos/vite.config.ts`), and every build contains `dist/assets/atlas/main.json` and its pages
(`main.png` …). `ATLAS_URL_DIR` (`'assets/atlas'`) is
relative so the build works from a sub-path, `file://` and `app://`.

The Tizen bundle check (`apps/tizen/scripts/check-bundle.mjs`) accepts the pages: still
exactly one script anywhere, and every file other than the four widget files
(`WIDGET_FILES`: `app.js`, `config.xml`, `icon.png`, `index.html`) must live under
`dist/assets/` — anything else would be packaged into the `.wgt` by accident. Since R1-05 its
**rule 10** (`checkAtlasManifest`, which the webOS check imports) holds the manifest outside
`app.js`: `dist/assets/atlas/main.json` exists, parses (format 1 or 2) and lists every page with its
real pixel size, no atlas PNG is unlisted, and `app.js` names at most `MAX_INLINED_FRAME_NAMES` (8)
atlas frames — the inlined manifest named all ~1,400, so more means it was inlined by accident. The
TV bench widget, which inlines its own density atlases, is exempt.

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
every bullet / beam / bend sprite, frame for frame — and since R3-03.V5 an overridden bullet needs
nothing extra for it: the variant recolours from the override ([above](#real-art-png-overrides)).
The variants are never content names — the
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

1. New module `scripts/assets/procedural/<id>.mjs` exporting
   `generate(options?: GeneratorOptions): SpriteDef[]` — the pipeline passes `{ tileSize, artScale }`
   to every generator (`terrain` reads `tileSize`, `lasers` / `palettes` read `artScale`; accept the
   argument and ignore it otherwise) — and build sprites with
   `makeSprite(name, frames, '<id>', { anchor, hitFlash, animations })`.
2. Seed from the sprite name (`createAssetRng(seedOf(name))`); use only exactly rounded
   maths (see above).
3. Register it in `procedural/index.mjs` (`PROCEDURAL_GENERATORS`), add a test to
   `test/scripts/assets/procedural.test.ts` for its documented shapes (a zone generator gets its
   own file, like M2-11's `procedural-zones.test.ts`).
4. Round shapes: `fillEllipse` and `drawLine` in `common.mjs` (M2-11) cover bodies, bubbles, legs
   and spikes without any trigonometry.
5. List `<id>.mjs` in the credits (`PLACEHOLDER ART GENERATORS` in
   `content/campaign/main.campaign.json`) — since M2-14 the content test checks that the credits name
   every registered generator.

### Replacing a placeholder with real art

Drop `<name>.png` (and optionally the Aseprite `<name>.json` export) next to where the
pixel map would live, keep the `.aseprite` file beside it and record third-party licences
in a `LICENSES.md`. The pixel map can stay — frames the PNG lacks fall back to it — or be
deleted once the PNG covers every frame. **Bullets, beams and bend segments** also have
colour-blind variants (M2-02), and a PNG cannot name one (`@` is not valid in a sprite path):
since R3-03.V5 the variant of an overridden bullet is recoloured from the override's own pixels
in `collectSprites` ([above](#real-art-png-overrides)), and player 2's ship variants come from the
sidecar's `meta.shmup.p2` map (R3-03.V2a) — one PNG per sprite is enough.

### Adding glyphs or a font

Add a key to `glyphs` in `pixel6x8.font.json` (exactly one character, `cellHeight` rows of
`cellWidth` `#`/`.` characters), or a new `<name>.font.json` — it becomes `font/<name>` and
`manifest.fonts[<name>]`.

Since M3-03 the charset has a **second owner**: `UI_GLYPHS` in `packages/core/src/ui/strings.ts`,
which is what `core/data` validates every `strings` file against. The two must be changed in the
**same commit** — `test/scripts/assets/font.test.ts` fails the moment they disagree, in either
direction (a glyph in the font that nothing declares, or a declared character the font cannot
draw). A new language therefore is: its glyphs in the font source, its code points in `UI_GLYPHS`,
its table in `content/strings/`, and `pnpm assets`. See
[`content/strings/README.md`](../../content/strings/README.md) and, for a CJK language,
[Katakana and the CJK budget](#katakana-and-the-cjk-budget-m3-03) above.

### Changing the manifest format

Bump `MANIFEST_FORMAT_VERSION` in `manifest.mjs`, update the typedefs there and the
`virtual:shmup-assets` / `virtual:shmup-assets-inline` declarations in
`types/virtual-modules.d.ts` in the same commit, and update the consumers: render-pixi `atlas`
(`AtlasManifest` mirrors the typedefs), the shell's loader (`ATLAS_MANIFEST_VERSIONS`,
`parseAtlasManifest`) and `ShellAssets`, and both bundle checks (`ATLAS_MANIFEST_VERSIONS` in
`apps/tizen/scripts/check-bundle.mjs`). A version the shell does not read stops the boot on
`ATLAS DOES NOT MATCH ITS MANIFEST` — R1-05 kept version 1 readable for that reason.

## Commands

```sh
pnpm assets                                   # regenerate (cached)
pnpm content:check                            # content validates + every content sprite exists
pnpm test:integration                         # includes the pipeline, plugin and CLI tests
pnpm exec vitest run --project integration test/scripts/assets   # pipeline unit tests only
node scripts/assets/tileset-masks.mjs --check # R3-03.V4: tileset art and its masks sidecars agree
```

## Tests

| File | Covers |
|---|---|
| `test/scripts/assets/png.test.ts`, `png-edge.test.ts` | Encode → `pngjs` decode round trip equals the source pixels; chunk layout, CRC, filter choice per row; decoding indexed, 1–2-bit, 16-bit and Adam7 PNGs |
| `test/scripts/assets/png-indexed.test.ts` | R1-05: PNG-8 is lossless for 1–256 colours and falls back to RGBA at 257, keeps partial alpha and the RGB of transparent pixels, writes only `IHDR` / `PLTE` / `tRNS` / `IDAT` / `IEND` with a short `tRNS`, orders the palette independently of the layout; `'never'` byte-identical to the old encoder |
| `test/scripts/assets/packer.test.ts`, `packer-edge.test.ts` | No overlaps (border + padding included), power-of-two pages ≤ 2048², determinism under reordering, spilling onto more pages, option validation, tie-breaks, a seeded fuzz |
| `test/scripts/assets/packer-groups.test.ts`, `pipeline-groups.test.ts` | R1-05: one group per page, the page order (ungrouped, `groupOrder`, then by name), an ungrouped result equal to the old layout; `loadAtlasGroups` / `resolveAtlasGroup` (the file by base name, the `zone-<id>` path rule, `common`), the source issues (a stale name, a listed font or `@` name, an empty `common`), the groups file in the input hash, `ungrouped: true` |
| `test/integration/atlas-groups.test.ts` | R1-05: `atlas-groups.json` equals its derivation from the content (`SHMUP_ATLAS_GROUPS_UPDATE=1` rewrites it); every campaign zone needs exactly the `common` pages plus its own, no zone page is global, every page ≤ 2048², the dev ranges, boss rush, bonus stages and menus need every page |
| `test/integration/atlas-zone-sprites.test.ts` | R1-05: 11 golden runs (zones A–I in god mode, brine-grotto and glimmer-cache) replayed — every sprite the World hands the renderer is in its zone's set or the global one |
| `test/integration/cjk-budget.test.ts` | M3-03's CJK arithmetic recomputed on the one-page (`ungrouped`) build and checked against the six documents that quote it; since R1-05 also the shipped split's budget — pages ≤ 2048², Σ PNG bytes < `ATLAS_PNG_BYTES_CAP` (256 KiB), the same frames and area as the one-page build |
| `test/scripts/assets/sprite-source.test.ts`, `sprite-source-edge.test.ts` | Every validation path, Aseprite sidecars (hash/array, tags, pivot, trimmed, frameless), PNG overrides, loader error paths |
| `test/scripts/assets/font.test.ts`, `font-edge.test.ts` | The charset equals core's `UI_GLYPHS` exactly (M3-03), the katakana layout and the derived voiced kana, glyph-key rules, `loadFontSources()`, the pixel font's design rules |
| `test/scripts/assets/provenance.test.ts` | R3-02: every override PNG (under `assets/source/sprites/` and the staging folder `art-prompts/v2/ingested/`) has a valid `.art.json` or a `LICENSES.md` entry; a record without its PNG, a PNG or sidecar changed after ingest, a recipe never ingested fail; the ingest tool's fixture outputs load as overrides (its recipes, records and edit layers ignored) and pack pixel for pixel with the sidecar's anchor and tags — [real-assets.md](real-assets.md#the-ingest-tool-art-promptsingest) |
| `test/scripts/assets/interim.test.ts`, `interim-pipeline.test.ts` | R2-01: the interim stage — `parseArtScale` exact fractions and rejects, `scaleImage` / `scaleLength` / `scaleAnchor` at 1, 3/2 and 2 (the ⌈s·w⌉ sizes, ⌊2d/3⌋ sampling, ⌈s·a⌉ anchors, alpha copied), `scaleSprite` (frames and animations), `scaleFont`; the whole atlas `buildAtlas({ artScale: 1.5 })` against `buildAtlas({ artScale: 1 })` — the never-upscaled sources (terrain, `ui/pixel`, the beams' 8 → 12 frames of 4×8 → 6×12, overrides, `native` — since R3-03.V1 the set names the native v2 bullets and bend nodes too, pinned exactly, and the comparison's upscaled-frame floor follows it), the 9×12 interim font, the scale-1 digest pin |
| `test/scripts/assets/terrain-size.test.ts`, `font-cell-size.test.ts` | R1-04: the terrain generator at 12 px and any even size (masks equal to every shipped mask resampled 8 → 12, the 8-px frames byte-identical to before, its `TILE_SIZE` equal to core's, `INTERIM_ART_SCALE` equal to core's `ART_SCALE`), `resampleMask` both ways; a 9×12 font made in the test (a ×1.5 upscale of `pixel6x8`, exactly the `UI_GLYPHS` code points) parses, packs next to the shipped font and lays out at advance 9 and a 15-px line |
| `test/integration/tile-size.test.ts`, `stage-terrain.test.ts` | Every shipped tileset and stage uses `TILE_SIZE` (R1-04); every tileset mask equals the opaque pixels of its frame — since R1-04 also at 12 px. Since R3-03.V4b the two terrain checks live in `test/integration/terrain-checks.ts` (the spec imports them) and also run on tilesets ingested from real art |
| `test/scripts/assets/coop.test.ts` | M2-06, R3-03.V2a: the core's suffix, `wantsP2Variant` (ships and the stock icon only), the palette map's exact colour exchanges with unlisted colours and every alpha kept, `makeP2Sprite`, every ship's and the stock icon's map-declared variant in the atlas — and that the shipped maps exchange exactly the colours v1's red ↔ blue channel swap did (that swap is the M2-06 history the pin keeps honest) |
| `test/scripts/assets/coop-p2.test.ts` | R3-03.V2a: the shipped maps draw what the deleted channel swap drew, pixel for pixel at both art scales, the three `collectSprites` issues (no map, a colour the art lacks, a no-op map), and a PNG override whose sidecar carries `meta.shmup.p2` |
| `test/scripts/assets/p2-ingest.test.ts` | R3-03.V2b: the ingest recipe's `p2` map through the sidecar's `meta.shmup.p2` into the atlas — the ship override's `@p2` from the sidecar map (replacing the code pixel-map's), unlisted colours kept, and the `@flash` silhouette of an overridden enemy from the new art |
| `test/scripts/assets/bullets-v2.test.ts` | R3-03.V1: the native v2 bullet art — round 11×11 (1 frame), oval 13×13, needle 17×17 (8 headings), bend node 11×11, all `native` at `artScale ≠ 1`, the ring / dot marks as five-pixel plus, every `@<palette>` variant frame for frame; at scale 1 the v1 pixel map unchanged, and the direction rule (`k · 22.5°`, `k + 4` the exact quarter turn) holds at both sizes |
| `test/scripts/assets/palette-recolour.test.ts` | R3-03.V5: the colour-blind variants of an overridden bullet / beam / bend recolour the override — luma banding against the v1 reference colours, the family's core mark re-applied (ring plus, dot plus, beams and bends unmarked), alpha and sizes kept frame for frame, origin `palette:<base>` |
| `test/scripts/assets/tileset-masks.test.ts` | R3-03.V4b: the copied terrain checks on a fixture tileset of ingested tile art, `--check` (pair and scan modes) failing loudly on a tileset / sidecar disagreement, `--write` refusing to remap a solid tile (W5-11) and writing nothing when it refuses, frames matched by index with the name only a warning |
| `test/scripts/assets/standin.test.ts`, `test/integration/standin-budget.test.ts` | R3-04.M1: the stand-in generator — palette cap and ramp margins, far / band / tile sizes and colour windows, determinism across processes and seeds; part 2 the enemy / boss describes and the RR-7 band gate (300–600 K scaled per 2048×1024 group page); the budget test runs `standinAtlas()` in memory and sums GPU and PNG bytes through `estimateStageMemory` ([below](#stand-in-zone-art-standinmjs-r3-04m1)) |
| `test/integration/palette-cycle-scan.test.ts` | R3-03.V3: the art bible §4.4 scan of the shipped atlas (decision W5-12 — fail, not warn): per-stage cycled-layer exact-or-≥3/255, the project-wide margin from all eight reserved ramps with the bible's exemptions pinned inside the test (an exemption that stops tripping fails), and a synthetic fixture proving the measure — [presentation-polish.md](presentation-polish.md#palette-cycling-render-pixi-palette) |
| `test/scripts/assets/palettes-names.test.ts` | M2-02: the pipeline's palettes are exactly core's `BULLET_PALETTES` other than `standard`, in core order; every family has a body colour and a core mark in every palette; one `<standard sprite>@<palette>` per standard sprite and palette; two runs draw the same pixels |
| `test/scripts/assets/procedural.test.ts`, `image.test.ts`, `rng.test.ts`, `manifest.test.ts` | Each generator's documented shapes (bullets outlined by the dark rim, the M2-02 core marks, bend segments and the point diamond, slope profiles, seamless star tiles, M2-08: the sea only in `SEA_RAMP`, the floor's strips …), raster helpers, the asset RNG's known-answer vectors, the manifest layout and self-consistency |
| `test/scripts/assets/pipeline.test.ts`, `pipeline-edge.test.ts` | The whole atlas: frames pixel-exact, extrusion, the initial sprite set, byte-identical runs, every cache state (including a pipeline edit after the code was loaded), stale-page removal, oversized frames as issues, parallel runs |
| `test/scripts/generate-assets.test.ts`, `generate-assets-edge.test.ts` | The CLI: flags, the cache skip, `--force`, exit codes 1 and 2, issue listing without a stack trace |
| `test/integration/assets-plugin.test.ts`, `assets-plugin-edge.test.ts` | The plugin: both virtual modules (`virtual:shmup-assets`'s URL, folder and digest — the digest equal to the shell's `manifestDigest` —, the inline module's manifest and page URLs), a real IIFE build emitting `assets/atlas/main.json` byte-identical to the pipeline's and every page, the dev middleware and watcher (source edits regenerate, pipeline edits restart or warn), wiring in the apps and `turbo.json` |
| `test/integration/content.test.ts` | Every sprite name of the shipped content exists in the atlas; a typo is reported |
| `apps/tizen/test/scripts/check-bundle.test.ts`, `check-bundle-manifest.test.ts`, `apps/tizen/test/build/tizen-build.test.ts`, `apps/web/test/build/web-build.test.ts` | Rule 6 (files outside `dist/assets/`); rule 10 (R1-05: the manifest missing, unparsable, of an unknown version, listing a missing or mis-sized page, an unlisted page, frame names inlined into `app.js`; the bench exempt); the real Tizen build ships exactly the widget files plus `main.json` and the atlas pages, byte-identical to the pipeline output; the web build ships `assets/atlas/main.json` and `main.png` |

## Gotchas

| Symptom | Cause / fix |
|---|---|
| `asset sources are invalid (N issues)` from `pnpm assets` or a build | Each line is `<file>:<json path> message` — fix the named file. Common: a character missing from the palette, rows of different widths, `name` not matching the file's location |
| `sprite "x" is not in the atlas` in `pnpm content:check` | Content names a sprite nobody defines — fix the name or add the sprite |
| `pnpm format:check` wants to reflow a sprite | Should not happen: `assets/source/` is in `.prettierignore`. A pixel map anywhere else is not a source |
| Edited a generator, the dev server shows the old art | Vite restarts on a pipeline edit; if it logged `restart the dev server …` instead, restart `pnpm dev` |
| A sprite shows as a magenta checker in the app | The renderer's sprite name table names a sprite the atlas lacks (the console warns once per name) — see [rendering-and-shell.md](rendering-and-shell.md#gotchas) |
| The app stops on `ATLAS DOES NOT MATCH ITS MANIFEST` | A page image from another pipeline run is served with this bundle (browser cache, a hand-copied file), or — since R1-05 — a `main.json` of another build (its digest differs from the one in `app.js`) — rebuild and hard-reload |
| The app stops on `ATLAS MANIFEST FAILED TO LOAD` | R1-05: `assets/atlas/main.json` is missing next to `app.js` or could not be read (an HTTP error, an empty body, not a manifest). On a TV that refuses `file://` XHR the fallback is `virtual:shmup-assets-inline` in the app's `main.ts`, with rule 10 relaxed in the same change |
| `atlas-groups.json equals the derivation` fails | A content change moved a sprite between zones (or added one). Re-derive: `SHMUP_ATLAS_GROUPS_UPDATE=1 pnpm exec vitest run --project integration test/integration/atlas-groups.test.ts`, then `pnpm assets`. Never edit the file by hand. Sprite ids do not depend on the grouping, so no golden moves |
| `asset sources are invalid` names `atlas-groups.json` | A listed name is not a sprite any more, names a font or an `@` sibling, or leaves `common` empty — re-derive the file as above |
| The atlas differs on another machine | Only a different zlib (Node version) can change the PNG bytes; the pixels never change. The zlib version is part of the input hash, so the cache rebuilds |
| `pngjs` has no types in the editor | Deliberate — it is loaded untyped (no `@types/pngjs` dependency); only `png.mjs` and the hash in `pipeline.mjs` touch it |
| TypeScript cannot see a new export of a `scripts/assets/*.mjs` module | The Node-side TS reads the JSDoc types through `allowJs` in `tsconfig.tooling.json` (no `checkJs`): give the export a JSDoc `@param` / `@returns` type |
| A colour-blind palette shows a recoloured real-art bullet wrong | Since R3-03.V5 the variant is recoloured from the override's pixels (luma bands, the family's core mark) — there is nothing to override by hand; a flat band means the art's shades collapsed into one luma band, fix the art's contrast (above) |
| `asset sources are invalid` names `:p2` | A `wantsP2Variant` sprite (a ship, `hud/life`) declares no `"p2"` palette map, a pair of the map is not `"#rrggbb" → "#rrggbb"`, a map colour is not in the art, or the map changes no pixel — fix the pixel map's `"p2"` key or the sidecar's `meta.shmup.p2` (R3-03.V2a, above) |
| `covers exactly the charset core declares` fails | The font source and `UI_GLYPHS` (`packages/core/src/ui/strings.ts`) disagree — add the glyph, or remove the code point, in the same commit (M3-03) |
| A translation is rejected with `uses a character the bitmap font does not have` | Its text uses a character outside `UI_GLYPHS`. Either it is a typo (a full-width digit, a curly quote, `ヴ`) or the font really needs the glyph — see "Adding glyphs or a font" |
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
`items/point` and the `palettes` generator's 45 colour-blind variants, which the renderer draws
instead when the player selects a palette ([pattern-dsl.md](pattern-dsl.md),
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
`UI_SPRITES`) — and the page stays 512×512 ([coop.md](coop.md)); the swap
became a **`p2` palette map** in R3-03.V2a ([above](#player-2s-palette-map-m2-06-r3-03v2a)); M2-07
(done) added three `terrain-a` tiles to the `terrain` generator (`brick`, `cube`, `tissue` —
frames 17–19, tile ids 18–20), the eight gimmick enemy pixel maps and the engine sprite
`gimmicks/chain-link`, which joined `ENGINE_SPRITES` (`GIMMICK_SPRITES`) — the page stays 512×512
([advanced-stages.md](advanced-stages.md#the-gimmick-range-dev-stage)); M2-08 (done) added the
`raster-bands` generator (`bg/sea-swell`, `bg/checker-floor` — content sprites of the
`raster-range` stage, which shifted the sorted sprite ids and re-blessed the goldens) — the page
stays 512×512 ([presentation-polish.md](presentation-polish.md#content-and-assets)); M2-09 (done)
added the `bosses` generator (`bosses/turret` with 16 heading frames, `bosses/orb`,
`bosses/raid-hull`, `bosses/captain-shell` — content sprites of the advanced-boss dev stages,
which shift the sorted sprite ids; the goldens were re-blessed with the step's other hash changes)
— the atlas page grew to 1024×512, well inside the 2048-px edge budget
([advanced-bosses.md](advanced-bosses.md)); M2-10 (done) added `items/capsule-bonus` and
`items/1up` to the `items` generator — engine sprites (`core/powerups` `ITEM_SPRITES` →
`ENGINE_SPRITES`), which shift the sorted sprite ids (the goldens were re-blessed with the step's
other hash changes) ([campaign-and-bonus-stages.md](campaign-and-bonus-stages.md#items-corepowerups));
M2-11 (done) added the `brine` and `dune` generators, the shape helpers `fillEllipse` / `drawLine`
in `common.mjs` and the zone tilesets of `terrain.mjs` — content sprites that shift the sorted
sprite ids (all goldens re-blessed); the page stays 1024×512
([zones-b-and-c.md](zones-b-and-c.md#placeholder-art-scriptsassetsprocedural)); M2-12 (done) added
the `magma` and `tempest` generators and the `terrain-magma` / `terrain-ridge` sets — again all
goldens re-blessed for the shifted ids, the page still 1024×512
([zones-d-and-e.md](zones-d-and-e.md#placeholder-art-scriptsassetsprocedural)); M2-13 (done) added
the `vault` and `prism` generators and the `terrain-vault` /
`terrain-prism` sets — all goldens re-blessed once more for the shifted ids (360 sprites, the page
still 1024×512) ([zones-f-and-g.md](zones-f-and-g.md#placeholder-art-scriptsassetsprocedural));
M2-14 (done) added the `citadel`, `abyss` and `ending` generators (the ending scenes' six UI
sprites joined `UI_SPRITES` and so `ENGINE_SPRITES`) and the `terrain-citadel` / `terrain-abyss`
sets — the last zone art of v1.0; all goldens re-blessed for the shifted ids (427 sprites with
their `@flash` / palette siblings; the page grew to 1024×1024, inside the 2048-px edge budget). The
campaign's credits list every generator, and the content test holds them to
`PROCEDURAL_GENERATORS` — a new generator needs its line in `main.campaign.json`
([zones-h-and-i.md](zones-h-and-i.md#placeholder-art-scriptsassetsprocedural)).

M3-02 (done) added the `dimension` generator (`scripts/assets/procedural/dimension.mjs`:
`bg/dimension-floor` — a 32×32 tile that must wrap seamlessly on both axes, because the Mode-7
shader samples it with `fract` —, `bg/dimension-sky`, `enemies/dim-pylon` and the boss parts
`bosses/bloom-maw`, `bosses/talon-claw`, `bosses/strider-leg`) and `fx/black-hole` (32×32, four
frames — three of the swirl, then the discharge) in the `particles` generator, whose spiral is built
from a **pseudo-angle** (`+ - * /` only, no `Math.atan2`) so the pixels are identical on every
engine. Both are listed in `main.campaign.json`'s credits, as the content test requires
([visual-and-mechanic-extras.md](visual-and-mechanic-extras.md)).

R1-05 (done, v2) split the atlas by zone: the packer's groups, the content-derived
`assets/source/atlas-groups.json`, lossless PNG-8 pages, manifest format 2 and the manifest shipped as
`dist/assets/atlas/main.json` (fetched with XHR, `virtual:shmup-assets-inline` as the fallback) —
[Atlas groups](#atlas-groups-r1-05) above, the residency in
[platform-polish.md](platform-polish.md#memory-budget-shmupshell-memory). R2-01 (done, v2) flipped
the frame and shipped the interim ×1.5 art ([above](#the-interim-15-art-stage-r2-01)) — it packs
into the same groups, the names do not change; R3-04 (done, v2) set the atlas budget from the
detailed stand-in art ([Stand-in zone art](#stand-in-zone-art-standinmjs-r3-04m1)) and made the
lazy atlas pages the default ([Lazy atlas pages](#lazy-atlas-pages-r3-04m3)); R3-03 (done, v2) made
the `<ship>@p2` variant a **palette map** ([above](#player-2s-palette-map-m2-06-r3-03v2a)), drew
v2's bullets and bend nodes **native** at the bible's §5.4 sizes, recoloured the colour-blind
variants of overridden art ([Real-art PNG overrides](#real-art-png-overrides)), and shipped the
ingest `collision` recipes with `scripts/assets/tileset-masks.mjs`
([real-assets.md](real-assets.md#tile-collision-and-the-mask-copy-r3-03v4)).
