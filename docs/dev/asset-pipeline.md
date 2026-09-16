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
one 512×256 page — grown with every step since; one 512×512 page since the M1-16 logo, one
1024×512 page since the M2-09 boss parts), the pixel font, the Vite plugin and the sprite-name check in
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
| `items` | `items/capsule` (12×8 × 2, `blink`); M2-02: `items/point` (5×5 × 2, `twinkle`) — the gold diamond (`|dx| + |dy| ≤ 2`, dark rim, white centre) cancelled bullets turn into; frame 1 lights its tips; M2-04: `items/capsule-blue` (12×8 × 2, `blink`) — the same pill in blue with a white core (`capsule(bright, tint)`, `CAPSULE_COLORS`); M2-10: `items/capsule-bonus` (12×8 × 2, `blink`) — the pill in gold, the 1,000-point bonus capsule — and `items/1up` (12×8 × 2, `blink`) — the pill in green with a white `+` (`oneUp(bright)`), the bonus stages' extra life |
| `shields` | `shields/force-field` (30×24 × 4 wear states: `fresh`, `worn`, `damaged`, `critical`); M2-04: `shields/pod` (8×8 × 4 wear states, same names — a faceted orange-gold gem that dims to red and loses facets, seeded holes) and `shields/reduce` (20×14 × 2: `full`, `worn` — a dotted green ring round the shrunken ship, every 2nd / 4th ring pixel lit) |
| `direct` | M2-05 (`shmup_feat.md` §6B / §7B / §9): the MANTA's shots — `shots/direct-missile` (12×6 × 2: the weak and the wide missile), `shots/disc` (20×20 × 4, radius 3.5 → 9.5), `shots/beam` (26×8 × 4: blue lasers, a longer yellow one, the round piercing laser), `shots/wave` (16×34 × 4 crescent waves), `shots/sub-bomb` (6×6), `shots/sub-laser` (9×9) and `shots/sub-laser-wide` (11×11) with **8 octant frames** each (frame `k` = `k × 45°` clockwise from right — the engine picks the heading's octant, nothing is rotated at run time), `shots/sub-disc` (12×12 × 2); the colour items `items/direct-{red,green,blue,orange,yellow}` (10×10 × 2 glossy orbs, `blink`) and `items/direct-octagon`; the Arm `shields/arm` (26×18 × 9: per tier — green, silver, gold — fresh / worn / critical; animations `arm`, `superArm`, `hyperArm`) — only exactly rounded maths |
| `starfield` | `bg/stars-far`, `bg/stars-mid`, `bg/stars-near` — seamless 128×128 transparent tiles |
| `backdrops` | M1-18: `bg/azure-verge` — zone A's far planet band, a 128×48 tile (`AZURE_TILE_W`, `AZURE_TILE_H`, anchored top-left) that repeats seamlessly along x: a translucent haze thickening towards a lit rim row (`AZURE_RIM_ROW` 10), then an opaque dark-azure-to-navy body with seeded cloud streaks that wrap round the tile edge. Dark and low in saturation so the pink / red / purple bullets and the gold capsules stay readable over it, never pure black |
| `raster-bands` | M2-08 (`shmup_feat.md` §18): backdrops made for the raster effects and palette cycling — `bg/sea-swell` (`SEA_TILE_W` 128 × `SEA_TILE_H` 40, opaque, anchored top-left) painted **only** in the four colours of `SEA_RAMP` (`#183c78`, `#24569c`, `#3474bc`, `#5096d8`, dark → light — the exact ramp a stage's palette cycle names): 3-px rows whose ramp index steps with the row and bumps with a 32-px swell profile, so cycling the ramp rolls the swell and a `wave` effect wobbles it; `bg/checker-floor` (`FLOOR_TILE_W` 64 × `FLOOR_TILE_H` 48) — a checker floor in ten strips `FLOOR_BANDS` (2, 2, 3, 3, 4, 5, 6, 7, 8, 8 rows) whose squares `FLOOR_SQUARES` widen towards the bottom (4 → 32 px; each divides 32, so the tile repeats every 64 px), `FLOOR_COLORS` plus a horizon line — made for a `lines` effect with the same strips as its `bands`. Integer maths only ([presentation-polish.md](presentation-polish.md#content-and-assets)) |
| `bosses` | M2-09 (`shmup_feat.md` §13, decision D24): the advanced bosses' parts, each with its `@flash` sibling — `bosses/turret` (16×16 × 16 heading frames: a round armoured base with a 3-px barrel of length 7 pointing `k × 22.5°` clockwise from +x — `DIRECTIONS_8` and their negations, no trig; a turned part's `turn: 16`, so a raid's turrets visibly aim), `bosses/orb` (12×12 × 2, `pulse`: a shaded armour orb — round art for spinning arms and rings of pods, which are never rotated), `bosses/raid-hull` (96×40, one riveted hull section of a battleship larger than the screen — rivets from the seeded `hash2`; sections side by side make IRON LEVIATHAN's 480-px body) and `bosses/captain-shell` (28×20 × 2, `blink`: a mid-boss's rounded carapace with a glowing eye slit) |
| `terrain` | `tiles/terrain-a` — 20 8×8 tiles (solid, floor, ceiling, walls, 45° and 22.5° slopes, and since M2-07 the destructible `brick`, crystal `cube` and regrowing `tissue` — opaque full blocks in their own colours so players can tell what breaks); every tile is also a one-frame animation named after it (`floor → [1]`, list in `TERRAIN_TILES`); collision masks and frames live in `content/tilesets/terrain-a.tileset.json` — change both together. Since M2-11 it draws one tileset per `TERRAIN_PALETTES` entry (`TerrainPalette { surface, subsurface, rock }`): `tiles/terrain-a` unchanged, `tiles/terrain-reef` (zone B's pale coral over blue-grey stone) and `tiles/terrain-dune` (zone C's sand), since M2-12 `tiles/terrain-magma` (zone D's basalt, ember rim) and `tiles/terrain-ridge` (zone E's storm-grey granite, frost rim), since M2-13 `tiles/terrain-vault` (zone F's dark olive flesh, pale-green rim) and `tiles/terrain-prism` (zone G's deep-blue crystal, ice-blue rim — lighter than the facet backdrop) — the same tiles and frames, only the rock colours (the texture hash seeded per set); the bricks, cubes and tissue look the same in every set; `terrain-reef` / `terrain-dune.tileset.json` are copies of `terrain-a`'s naming the other sprite |
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
  tags win over code tags of the same name; a code-defined anchor wins over the pivot.
  A PNG with no code-defined counterpart adds a new sprite.
- The export must list at least one frame, and every frame must fit an atlas page with its
  border (at most 2046×2046). Both are reported as source issues naming the file.
- `README.md`, `LICENSES.md`, `.gitkeep` and editor files such as `*.aseprite` are ignored;
  a `*.json` that is neither a sprite source nor the sidecar of a PNG is an issue.

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
section with glyphs keyed by **decimal code point**.

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
  KB) and the atlas is still **one 1024² page** of the 2048² limit; the two translations cost
  **8.6 KB of `app.js` gzip** (386.9 → 395.5 KB of the 512 KB budget). A separate page or a
  lazily-loaded atlas would be machinery for nothing at this size, so the katakana live in the main
  atlas and load with it.

The number that made this decision is the one a **real kanji set** would cost. JIS level 1 is about
6,900 characters; at a legible 12×12 they need roughly 1 M pixels — about **25 of the game's
current atlas**, five 2048² pages on their own, well past `DIST_BUDGET`. Before shipping one:

1. **Subset by use**, not by standard — only the characters the shipped `strings` files actually
   contain (a full UI is a few hundred kanji, not seven thousand);
2. give that set **its own atlas page**, named so the loader can fetch it per language rather than
   for everyone (`pageUrls` already carries one URL per page, and `loadImages` already loads them
   in parallel — the mechanism exists, it is simply not needed yet);
3. re-measure `dist/` against `DIST_BUDGET` and the boot time against the ≤ 10 s launch rule before
   believing it fits.

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
- Speed: a trial of a candidate page size stops at the first cell that does not fit, and
  after each placement only the new free rectangles are tested for containment (the others
  cannot be contained — see `MaxRectsBin.split`). Both leave the layout byte-identical; the
  full atlas builds in about 0.3 s instead of 0.5 s.
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
colour-blind variants (M2-02): a PNG named `bullets/oval-red.png` replaces only the standard
sprite — override `bullets/oval-red@deuteranopia` (and the other two palettes) as well, or the
colour-blind sets keep the placeholder's shapes.

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
| `test/scripts/assets/font.test.ts`, `font-edge.test.ts` | The charset equals core's `UI_GLYPHS` exactly (M3-03), the katakana layout and the derived voiced kana, glyph-key rules, `loadFontSources()`, the pixel font's design rules |
| `test/scripts/assets/coop.test.ts` | M2-06: the core's suffix, `wantsP2Variant` (ships and the stock icon only), the exact red / blue swap, `makeP2Sprite`, every ship's and the stock icon's variant in the atlas |
| `test/scripts/assets/palettes-names.test.ts` | M2-02: the pipeline's palettes are exactly core's `BULLET_PALETTES` other than `standard`, in core order; every family has a body colour and a core mark in every palette; one `<standard sprite>@<palette>` per standard sprite and palette; two runs draw the same pixels |
| `test/scripts/assets/procedural.test.ts`, `image.test.ts`, `rng.test.ts`, `manifest.test.ts` | Each generator's documented shapes (bullets outlined by the dark rim, the M2-02 core marks, bend segments and the point diamond, slope profiles, seamless star tiles, M2-08: the sea only in `SEA_RAMP`, the floor's strips …), raster helpers, the asset RNG's known-answer vectors, the manifest layout and self-consistency |
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
`UI_SPRITES`) — and the page stays 512×512 ([coop.md](coop.md#player-2s-palette-swap)); M2-07
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
