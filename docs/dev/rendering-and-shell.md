# Rendering and the browser shell: render contract, `render-pixi`, `@shmup/shell`

How a simulation state becomes pixels, and how the web and TV apps boot. Filled in by plan
step **M1-04**. Later steps *fill* the contract (the World in M1-06, see
[sim-world.md](sim-world.md); terrain and parallax in M1-07, see
[stage-runtime.md](stage-runtime.md); the enemy bullets and the new `LaserView` in M1-09, see
[bullets-and-patterns.md](bullets-and-patterns.md); the player shots and Options in M1-10, see
[weapons-and-options.md](weapons-and-options.md); particles, score popups and the screen shake /
flash / dim fed by the sim's events in M1-14, see [fx-and-game-feel.md](fx-and-game-feel.md);
the HUD, the menus and the scene flow's frame in M1-16, see [scenes-and-ui.md](scenes-and-ui.md);
the bending lasers' `BendingLaserView` and the colour-blind bullet palettes in M2-02, see
[pattern-dsl.md](pattern-dsl.md) and [below](#colour-blind-bullet-palettes); the stage's raster
effects and palette cycles, the ships' hitbox markers, the scale modes and render interpolation
in M2-08, see [presentation-polish.md](presentation-polish.md) and [below](#presentation-polish-m2-08))
without changing its shape. The shell's audio wiring (M1-15 — the
SFX bank and the stage's music rendered during boot, the engine fed by the same event dispatch)
is on [audio.md](audio.md); the dev / test builds' debug tools and overlay (M1-19 — the `DEBUG`
layer, the draw-call counter, the shell's `debug` module) on
[debug-and-replays.md](debug-and-replays.md).

This page is the *how and why*. Exact signatures are in
[api-reference.md](api-reference.md); the TSDoc in the sources is the authoritative
reference. Where the art comes from is [asset-pipeline.md](asset-pipeline.md); how content
is validated is [content-data.md](content-data.md).

Background: `shmup_feat.md` §3 (pixel-perfect camera, integer scaling), §17 (HUD and canvas
UI), §18 (draw order, one atlas, hit flash), §22 (rendering pipeline, sim/presentation
split); `shmup_tech.md` §2.2 (WebGL1, low-res render texture), §4.1 (Pixi as a renderer
only), §4.10 (no UI framework); plan §3.3 (frame), §3.4 (render contract), §3.5 (content
owners) and decisions **D20** (HUD bars outside the playfield — v2 keeps the layout, **R-D3**
replaces its numbers: 12-px bars, a 640×336 playfield), **D25** (no `fetch` on the
TV), **D30** (hit flash = white sibling sprite) and **D34** (one shared browser host).

> **Thinking of changing the internal resolution?** The frame is 640×360 upscaled by whole numbers (decision **R-D1**, replacing v1's D19 at 384×216): ×3 on 1080p, ×2 on 720p, ×4 on 1440p, ×6 on 4K — every display we ship to. What such a change costs — fill rate, power-of-two render-target memory, which findings from the v1 measurements change, and why 960×540 is not an integer multiple of 720p — is in [`render-performance-review.md` §7](render-performance-review.md#7-if-the-internal-resolution-changes-later-960540-1080p-), written when the frame still was 384×216; v2's step R2-01 of [plan_resolution.md](../../plan_resolution.md) answered its question and flipped the frame. The renderer's defaults, the layer effects, the Mode-7 floor, the debug overlay, the shell's own scenes, the memory estimator and the hosts take the frame from `@shmup/core`'s constants (`FRAME_W`, `FRAME_H`, `HUD_BAR_HEIGHT`, `GLYPH_W` …) since R1-02, and `test/integration/frame-literals-repo.test.ts` keeps literal frame numbers out ([conventions.md](conventions.md#frame-numbers-the-literal-scan-and-the-fingerprint)). Until the art bible's art arrives (R3 … R5) the shipped art is v1's sprites upscaled ×1.5 by the pipeline ([asset-pipeline.md](asset-pipeline.md#the-interim-15-art-stage-r2-01)); the simulation's world ran at v1 scale until R2-02's port (`8dbe858`) (plan §2.6).

## The picture at a glance

```text
                 @shmup/core (pure)                                   @shmup/render-pixi
┌──────────────────────────────────────────────┐        ┌────────────────────────────────────────┐
│ game.renderFrame() → RenderFrame (reused)    │        │ renderer.render(frame)                 │
│   tick, alpha                                │        │   bindWorld() if frame.world is new    │
│   world: WorldView | null                    │ ─────► │   parallax.sync, terrain.sync(camera)  │
│                                              │        │   binding[i].sync(batch[i], camX, camY)│
│     camera, parallax, terrain                │        │   lasers.sync(view.lasers, camera)     │
│     batches: SpriteBatchView[] (typed arrays)│        │   world group ← round(shakeX, shakeY)  │
│     lasers: LaserView | null (M1-09)         │        │   flash / dim quads                    │
│   hud, ui: DrawList (typed-array commands)   │        │   hudView.draw(hud), uiView.draw(ui)   │
│   screen: { shakeX, shakeY, flash, dim }     │        │   pass 1: scene → 640×360 texture      │
└──────────────────────────────────────────────┘        │   pass 2: texture ×N → canvas          │
 game.events ──► shell dispatcher (connectFxEvents) ──► │ fx (M1-14): effects / particles /      │
                                                        │   popups stepped by the tick delta,    │
                                                        │   synced with the camera; shake, flash │
                                                        │   and dim added to frame.screen's      │
                                                        └────────────────────────────────────────┘
```

The simulation never calls the renderer. It fills views — typed arrays and plain numbers,
reused every tick — and the host hands the frame to the renderer once per displayed frame.
Strings enter only through a draw list's string slots, and only when the text changes.

## The render contract (`core/presentation`)

### Layers

`LayerId` is a numeric const object in draw order (bottom → top, `shmup_feat.md` §18):

| Code | Layer | Group | Drawn from |
|---|---|---|---|
| 0 | `BgFar` | world | a stage's `far` parallax bands (M1-07); the free-flight and showcase far stars |
| 1 | `BgMid` | world | a stage's `mid` parallax bands (M1-07); the free-flight mid / near stars |
| 2 | `DecorBack` | world | the stage's `back` decor items — under the terrain (R3-06, [stage-runtime.md](stage-runtime.md#parallax-and-the-terrain-view)) |
| 3 | `Terrain` | world | the stage's tile terrain (M1-07) |
| 4 | `DecorFront` | world | the stage's `front` decor items — above the terrain, below the sprites (R3-06) |
| 5 | `GroundEnemies` | world | turrets, walkers, hatches (the enemy system's ground batch, M1-08) |
| 6 | `AirEnemies` | world | flying enemies (the enemy system's air batch, M1-08), the boss's parts (their own batch after every other World batch, so they draw over the air enemies — M1-13) |
| 7 | `PlayerShots` | world | shots, lasers (rows of beam segments — the v2 path draws them native at the art scale, 6×12 px, since R4-01.A7; bullets-and-patterns.md), missiles — the weapon system's mirror batch (M1-10) |
| 8 | `Player` | world | Options (their own batch, listed before the ships so they draw below them — M1-10), ships, shields (the Force Field's batch, listed after the ships so it draws over them — M1-11) |
| 9 | `Hitbox` | world | the ships' hitbox markers (the Options screen's HITBOX, M2-08 — `WorldView.hitboxes`; the layer is hidden while the option is off) |
| 10 | `Items` | world | capsules (M1-11) |
| 11 | `Fx` | world | the particle pool (normal-blend sprites, then additive) and the score popups — the renderer's own, fed by events (M1-14, [fx-and-game-feel.md](fx-and-game-feel.md)) |
| 12 | `Foreground` | world | the stage's one `fore` parallax band (R3-06) — sparse foreground in front of the ship; the draw order keeps enemy bullets above it |
| 13 | `EnemyBullets` | world | enemy bullets (the bullet pool itself, M1-09), then the enemy lasers — above explosions and items so they stay readable (§12) |
| 14 | `Hud` | screen | `RenderFrame.hud` |
| 15 | `Ui` | screen | `RenderFrame.ui` |
| 16 | `Debug` | screen | the debug overlay — panel, frame graph, hitbox / grid outlines (`render-pixi` `debug`, dev / test builds only — M1-19, [debug-and-replays.md](debug-and-replays.md#the-overlay-shmuprender-pixi-debug)) |

`LAYER_COUNT` is 17 (`DecorBack` 2 and `DecorFront` 4 sit around the terrain, `Foreground` 12
under the bullets, as the R3-06 draw order requires — golden replays hash only the simulation,
so the insert moved none of them) and `LAYER_NAMES` holds the plan's spellings (`'ENEMY_BULLETS'`), used as
Pixi container labels. The world group is offset by screen shake; `Hud`, `Ui` and `Debug`
stay put. **Append new layers only where the spec says so** (`shmup_feat.md` §18 — the
code is the draw order and batches carry it).

### Sprite batches (`SpriteBatchView`)

A batch is one layer's worth of sprites as parallel arrays: `layer`, `capacity`, `count`,
and per slot `x`, `y`, `spriteId`, `frame`, `flags`. Slots `[0, count)` are drawn.

- Positions are **world pixels** of the sprite's *anchor*. The renderer draws slot `i` at
  `round(x − camera.x)`, `round(y − camera.y) + PLAYFIELD_Y` — the top HUD bar owns rows 0–11
  (D20's layout, R-D3's 12-px bar), so world `y = 0` is screen row 12.
- The arrays are typed `ArrayLike<number>`, so a struct-of-arrays pool (`createSoaPool`) *is*
  a batch view: point the view's fields at the pool's `Float64Array` / `Uint16Array` fields.
- Object-based systems (players, enemies, bosses) fill a small mirror each tick:
  `createSpriteBatch(layer, capacity)` allocates one; `batch.count = 0` then
  `pushSprite(batch, x, y, spriteId, frame, flags)` per visible object (returns `-1` when
  full — the sprite is not drawn).
- `SpriteFlag` bits: `FlipX` 1 and `FlipY` 2 mirror around the anchor (a flipped sprite keeps
  its anchor point), `Hidden` 4 skips the slot this frame (blinking, invulnerability),
  `Flash` 8 draws the white `<sprite>@flash` sibling (D30 — a frame swap, so batching
  survives; a sprite without a sibling draws itself).
- A batch may carry a `blend` (R3-06.L4): absent means `'normal'`, and only the glow companions
  pass `'additive'`. `createSpriteBatch(layer, capacity, blend?)` stores the marker on the batch;
  the renderer's `bindWorld` maps it to a sprite binding whose every sprite gets
  `blendMode = 'add'` **once at creation** — Pixi rebuilds the batch's blend state on every
  write to that setter, so the sync path never touches it (`sprites/index.ts`; `'add'` is as
  old as WebGL1, so the TV floors are safe). A host that ignores `blend` still draws the
  batch normally.

### The world view

`WorldView = { camera: { x, y }, parallax, decor?, terrain, batches, lasers?, bendingLasers?, warning?, effects?, hitboxes? }`. Everything is a live
reference into sim state; the renderer reads and never writes. **`batches` is read once, when
the view is bound**: the renderer creates one preallocated binding per entry, and syncs
binding `i` from `batches[i]` every frame. To change the list, hand the renderer a different
`WorldView` object (it rebinds automatically, which allocates — do it at stage or scene
changes, not per frame). The same holds for the structure of `parallax` (band count, layers,
spacings) and `terrain` (map size, tile size); their per-frame values are read every frame:

- `ParallaxView` — `count` bands; per band `layer` (`BgFar`, `BgMid` or the R3-06
  `Foreground`), `spriteId` (frame 0 is the band's repeated sprite), `spacing` (repeat
  distance), `offsetX` (`0 ≤ offsetX < spacing`, the band is shifted left by it) and `y` (the
  band's playfield row after the vertical scroll). Since R3-06 the view may also carry
  `frameIndex` — the animated frame per band right now (`0` for a static band, else cycling
  `0 … frames-1` every `frameTicks` ticks); a core-built view always carries it, and an absent
  array (an older hand-made view) means frame 0 everywhere. The stage
  runtime fills it (`offsetX = (camera.x · factor) mod spacing`, `y = baseY − camera.y ·
  yFactor`, `frameIndex = ⌊tick / frameTicks⌋ mod frames`); the renderer rounds both positions.
- `DecorView` (optional `decor`, R3-06) — the stage's still decoration items: `back` and `front`
  sprite batches refilled by camera culling at the end of every tick (`back` drawn under the
  terrain on `DECOR_BACK`, `front` above it and below the sprites on `DECOR_FRONT`; either is
  `null` when no drawable item uses its layer), and since R3-06.L4 the optional `glowBack` /
  `glowFront` companions — `'additive'` batches on the same two layers carrying the entries'
  glows (set only when some kept item has a glow). The batches are members of
  `WorldView.batches` as well, so a host that draws the batches draws decor and glows without
  reading `decor` at all; the view is for hosts that iterate decor separately. Presentation only
  — the simulation never reads decor, never collides with it, never scores it.
- `TerrainView` — `tileSize`, `cols`, `rows`, `tiles` (row-major tile ids, 0 = empty; a live
  array, read when a cell scrolls into view), `tilesetSpriteId` and `tileFrame` (tile id →
  frame of the tileset sprite, `-1` = not drawn). Cell `(col, row)` sits at world
  `(col · tileSize, row · tileSize)`. Since M2-07 an optional `changes` (`TerrainChanges`:
  `count`, `resets`, a ring of changed cell indices — the World's destructible terrain) tells the
  renderer which cells changed in play; a static map leaves it out.

- `LaserView` (optional `lasers`, M1-09) — `capacity`, `count` and per slot `x`, `y` (world
  origin), `angle` (binary units), `length`, `width` (the **drawn** width: 0 while the laser
  only telegraphs — the renderer draws a 1-px warning line then), `spriteId` (the beam strip)
  and `flags` (`Hidden` = the warning line's blink). The bullet system's laser pool implements
  it directly ([bullets-and-patterns.md](bullets-and-patterns.md#drawing-bullets-and-lasers)).
- `BendingLaserView` (optional `bendingLasers`, M2-02) — the enemy bending lasers: `capacity`
  **stable** slots (not packed like the other views — a slot keeps its ring), each a ring of
  `nodes` (a power of two) recorded head positions: per slot `active`, `filled` (the newest nodes
  to draw), `head` (the ring index of the newest), `width`, `spriteId` (the segment sprite, frame
  0) and `flags` (`Hidden`), per node `x`, `y` (slot-major); node `k` back from the head is
  `(head − k) & (nodes − 1)`. The bullet system's `BendingLaserTable` implements it directly
  ([bullets-and-patterns.md](bullets-and-patterns.md#bending-lasers)).
- `WarningView` (optional `warning`, M1-13) — the boss WARNING: `active`, `ticks` (since it
  started), `duration` (180) and `text` (three lines split at `\n`, built once per boss at world
  creation from the game's own template — decision D10). The renderer's world binding ignores
  it: a **host** draws it into its UI draw list, putting `text` into a string slot only when it
  changed (the flight scene does —
  [bosses-and-warning.md](bosses-and-warning.md#the-warning)). The World's is the boss system's
  live `WarningState`.
- `StageEffectsView` (optional `effects`, M2-08) — the stage's raster effects
  (`RasterEffectView`: a per-scanline offset of `BgFar`, `BgMid` or `Terrain` — `Wave`, `Haze` or
  `Lines` — over playfield rows `[top, bottom)` while the camera x is in `[from, to)`) and palette
  cycles (`ColorCycleView`). Static data (`core/stage` `createStageEffectsView`), read once when
  the view is bound; the renderer's layer effects draw them
  ([presentation-polish.md](presentation-polish.md#layer-effects-effectslayer-effectsts)).
- `HitboxView` (optional `hitboxes`, M2-08) — `capacity`, `count` and per slot world `x`, `y` and
  `radius` of every live ship's hurtbox; the World's `hitboxBatch`, refilled each tick. The
  renderer draws it on `HITBOX` only while `showHitbox` is on.

The World's `batches` list has a fixed shape (`world/index.ts`, built once at `createWorld`):
every owner's body batches first — ground enemies, air enemies (the boss's own batches among
them), shots, Options, ships, bullets, shields, items, points, carried, chains — then the
additive glow batches R3-06.L4 appended (`enemyGlow…`, `bossGlow…`, after **every** body, so a
glow draws over its owner), then the moving blocks and black holes, then the stage's decor four
(`back`, `glowBack`, `front`, `glowFront` — each on its own layer, so the list order cannot mix
them). Content that names no glow adds no glow batch and a stage without decor adds no batch at
all, so every pre-R3-06 list stays exactly as the fingerprints pinned it.

How the stage builds these views: [stage-runtime.md](stage-runtime.md#parallax-and-the-terrain-view).

### Draw lists (`DrawList`)

The HUD and menus draw through a fixed-capacity command buffer, stored column-wise:

| Column | `rect` | `sprite` | `text` | `number` |
|---|---|---|---|---|
| `op` | `DrawOp.Rect` 1 | `DrawOp.Sprite` 2 | `DrawOp.Text` 3 | `DrawOp.Number` 4 |
| `x`, `y` | top-left | anchor | alignment point, top | alignment point, top |
| `w`, `h` | size | — | — | — |
| `color` | fill 0xRRGGBB | tint | tint | tint |
| `alpha` | 0…255 | 0…255 | 0…255 | 0…255 |
| `ref` | — | sprite id | string slot | — |
| `frame` | — | sprite frame | — | minimum digits (zero-pad, 0…20) |
| `flags` | — | `SpriteFlag` | `TextAlign` | `TextAlign` |
| `value` | — | — | — | the number |

Coordinates are screen pixels of the 640×360 frame, rounded and stored as `Int16`. Text lives
in **string slots**: `setString(slot, text)` when the text changes (returns `false` and does
nothing if it is unchanged), then the per-frame `text(slot, …)` command carries only the slot
number. Scores and counters use `number(value, …)` — digits are extracted at draw time, no
string is ever built. A full list rejects the command, returns `-1` and counts it in
`dropped`. `revision` increases on every mutation (commands, `clear()`, a string that really
changed); the renderer redraws a list only when its `revision` moved.

```ts
const hud = createDrawList(); // 256 commands, 32 string slots
hud.setString(0, '1P'); // once
// whenever the HUD changes (every tick is fine — building is allocation-free):
hud.clear();
hud.rect(0, 0, PLAYFIELD_W, HUD_BAR_HEIGHT, 0x1d2a5c);
hud.text(0, 4, 0, 0x38c8e8);
hud.number(score, 20, 0, 8); // "00012300"
hud.sprite(lifeSpriteId, 0, 4, 209);
```

### The frame

`RenderFrame = { tick, alpha, world, hud, ui, screen }`. `createGame()` builds one and
returns the same object from every `renderFrame()` call. **With the scene flow** (M1-16, the
shell's default) the flow composes it: `world` is the game scene's World view while the game is
visible (else `null` — the title), `tick` the World's tick then (frozen under the pause menu, 0 for
a new World) or the flow's own tick count, `hud` the core HUD (`buildHud`, rebuilt only on a
change), `ui` one list with every visible scene's menus and panels, and `screen.dim` the top
overlay's dim (the menu dim under the UI layer) — [scenes-and-ui.md](scenes-and-ui.md#worlds-events-and-the-frame).
For **bare gameplay** (the dev scenes, tests): `world` is the World's view
(`game.world.view`, the same object for the whole session — its batches are the enemies'
ground / air mirrors (M1-08), the player-shot and Option mirrors (M1-10), the players' mirror
on `LayerId.Player` (M1-06) and the enemy bullet pool (M1-09), plus the laser view), `hud` / `ui` are the session's (empty) draw lists,
the game's `screen` is all zeros — the event-driven shake, flash and playfield dim of M1-14 live
in the renderer's `effects` and are added on top of it. `screen.shakeX/Y` are rounded by the
renderer; `flash` (white over the playfield, under the HUD) and `dim` (black under the UI layer)
are 0…1 and clamped.

The layout constants are in core `config`: `FRAME_W` / `FRAME_H` 640 / 360, `HUD_BAR_HEIGHT` 12,
`PLAYFIELD_Y` 12, `PLAYFIELD_W` 640, `PLAYFIELD_H` 336, `HUD_BOTTOM_Y` 348, `TILE_SIZE` 12 (D20's
layout with R-D3's numbers, R2-01's flip), and the font metrics `GLYPH_W` / `GLYPH_H` / `LINE_H`
9 / 12 / 15 with `ART_SCALE` 3/2 — while `WORLD_SCALE` is still 1: the content ports ×1.5 in R2-02
([plan_resolution.md](../../plan_resolution.md) §2.6). `Game` also exposes `events` — the `core/events`
queue its systems push presentation events into; the shell drains it once per frame.

## The renderer (`@shmup/render-pixi`)

### Sprite ids → atlas frames

A `spriteId` is an index into the **sprite name table** the host gives the renderer —
normally `game.content.sprites.names` (content's interned sprite names, sorted), or a dev
scene's own table. `renderer.setSpriteNames(names)` resolves the table against the atlas
once (load time) into two `Int32Array`s: `base[spriteId]` (the sprite's frame 0) and
`flash[spriteId]` (its `@flash` sibling's frame 0, or the sprite's own). Until it is called
every id draws `ui/missing`.

`createAtlas(manifest, images)` numbers frames **sprite by sprite** (sprites in name order,
frames in index order), so a sprite's frames are consecutive and frame `f` of a sprite is
`table[spriteId] + f`. `framesLeft[id]` (frames from `id` to the end of its sprite) validates
`f` without another table. Per frame, drawing a slot is three array reads — `resolveFrame()`
in `sprites`. Anything that does not resolve draws the magenta checker `ui/missing`:

| Cause | Result |
|---|---|
| A name in the table that the atlas lacks | `ui/missing`, one `console.warn` per name (at `setSpriteNames` time) |
| `spriteId` outside the table | `ui/missing` |
| `frame` outside the sprite | `ui/missing` |
| A quad-pool `frameId` outside the atlas | `ui/missing` |

Each atlas page becomes one Pixi `ImageSource` (`scaleMode: 'nearest'`, no mipmaps) and each
frame a `Texture` over it, so every sprite of a page batches into one draw call (Pixi batches up
to 16 textures, so the zone-split atlas of R1-05 — `common` plus a zone page — still draws within
`DRAW_CALL_BUDGET`). The atlas
refuses an image whose size differs from its manifest entry (a stale page next to a newer
manifest), a page over `MAX_ATLAS_SIZE` (2048), a frame outside its page and a sprite that
lists a missing or shared frame — all as `RangeError`s, which the shell turns into a boot
error screen.

**Deferred pages (R3-04).** A page may start **unloaded** — `null` in the image list handed to
`createAtlas` — and be brought in later by `Atlas.loadPage` / freed again by `Atlas.unloadPage`:
until its page is loaded, every frame of it draws nothing (its texture points at Pixi's empty
source with a 0×0 frame, so no sampling of a missing image ever happens), and the page source and
the frame textures keep their object identity across load/unload — only their contents move. This
is what the lazy residency (below) loads and drops; `loadPage` also swaps the image of a loaded
page, which is how the context-loss recovery of plan R3-04 re-fetches. Everything it touches is a
cold path.

**The pages' GPU lifetime belongs to the shell (R1-05).** `createAtlas` turns each page's
`autoGarbageCollect` **off** — Pixi's `ImageSource` forces it on, and its texture GC would drop a
page no frame bound for 60 s, behind the residency's back — so a page leaves the GPU only through
`unload()` (the shell's atlas residency between zones) or `Atlas.destroy()`.
`PixiRenderer.uploadTextureSource(source)` (Pixi's `renderer.texture.initSource`; cold — boot, a
stage change, a new World) uploads a page **now**, so the residency puts the next zone's pages on
the GPU at the transition instead of on their first draw mid-play.

### Layers, bindings and quad pools

`createLayerStack()` makes one container per `LayerId` (`world` group → `BG_FAR` …
`ENEMY_BULLETS`, then `HUD`, `UI`, `DEBUG`). Two kinds of drawers go into them:

- **`SpriteLayerBinding`** (one per world batch): `capacity` Pixi sprites created up front,
  hidden. `sync(view, camX, camY)` writes texture, position, scale (flips) and visibility for
  slots `[0, count)` and hides the ones the previous sync used beyond that. Nothing is created.
- **`QuadPool`** (one per screen layer, `glyphCapacity` = 1024 sprites each): an ordered,
  immediate-mode pool. `begin()`, then each `frame(...)` / `rect(...)` takes the next sprite
  (later calls draw on top), `end()` hides the leftovers. Rectangles are the atlas's 1×1
  white `ui/pixel` scaled and tinted. A full pool counts `dropped` and draws nothing more.
- **`TerrainBinding`** (`createTerrainBinding`, one per bound `TerrainView`, on `TERRAIN`): a
  preallocated ring of tile sprites one tile wider and taller than the playfield — **55 × 29**
  for 12-px tiles (v1: 49 × 26 for 8-px tiles; rows capped at the map's). Slot column `s` shows the map column `≡ s (mod
  55)` inside the view, so `sync(view, camera)` re-textures only the column (or row, for
  vertical pans) that scrolled in, and moves the whole grid as one container at
  `round(−camera.x)`, `PLAYFIELD_Y + round(−camera.y)` — which lands integer world positions on
  exactly the pixels the sprite bindings use. `updatedCells` reports how many cells the last
  sync touched (0 inside one tile). New sprite tables re-texture everything. Since M2-07 it
  follows the view's `changes` log: cells logged since the last sync are re-textured when a slot
  shows them (the others are read when they scroll in); a new `resets` (the checkpoint
  rollback) or more new entries than the 64-entry ring holds re-textures the whole grid. Moving
  blocks are not grid cells — the World draws them as a sprite batch on `TERRAIN`
  ([advanced-stages.md](advanced-stages.md#rendering-the-change-log-shmuprender-pixi-layers)).
- **`ParallaxBinding`** (`createParallaxBinding`, one per bound `ParallaxView`): per band one
  container on its layer (`BG_FAR`, `BG_MID` or — since R3-06 — `FOREGROUND`) holding
  `ceil(width / spacing) + 1` sprites `spacing` pixels apart, placed once; `sync(view)`
  re-places each band — the container goes to `round(−offsetX)`, `PLAYFIELD_Y + round(y)`, and
  the band's sprites are shown at frame `frameIndex[i]` of the band sprite (`0` when the view
  carries no `frameIndex`, so a v1-style view keeps painting frame 0). No `TilingSprite` —
  WebGL1 cannot repeat non-power-of-two textures.
- **`LaserBinding`** (`createLaserBinding`, one per bound `LaserView`, on `ENEMY_BULLETS` after
  the batches, M1-09): two preallocated sprites per slot pivoting on the laser's origin and
  rotated to its angle — the white pixel stretched into a 1-px line tinted `LASER_WARNING_TINT`
  (set once at creation) while the width is 0, otherwise frame `round(width) − 1` of the beam
  sprite (frame `k` is a band `k + 1` px tall) stretched along the laser. Switching frames
  instead of scaling across and writing a rotation only when the angle changed keep the sync
  allocation-free (Pixi's tint and transform setters allocate).
- **`BendingLaserBinding`** (`createBendingLaserBinding`, one per bound `BendingLaserView`, on
  `ENEMY_BULLETS` after the laser binding, M2-02): `capacity × nodes` sprites (8 × 64) created
  up front, hidden; `sync(view, camera)` shows each active, not hidden slot's newest `filled`
  nodes as frame 0 of its segment sprite, anchored on the node at `round(x − camera.x)`,
  `round(y − camera.y) + PLAYFIELD_Y`, **tail first** so the head is on top, and hides the slot's
  other sprites. The segment is a round blob, so it is never rotated or scaled — the sync only
  moves sprites and assigns a texture when it changed.

#### Render groups (M3-02e — the review's F1)

In Pixi v8 `sprite.visible = …` sets `structureDidChange` on the sprite's **enclosing render
group**, and a group carrying that flag has its whole instruction set thrown away and rebuilt: a
walk over every node under it, a re-pack of every quad it holds and a re-upload of its vertex
buffer. With one group for the whole scene — which is what the renderer had until M3-02e — a
single hidden bullet cost all of that over all ~6,400 display objects, on **essentially every
frame** (the bench measured 655–659 of 660).

So every layer that toggles sprites while the game runs is its own render group
(`RENDER_GROUP_LAYERS`: `DECOR_BACK` … `UI` — thirteen groups, the two R3-06 decor layers among
them since culled decor toggles its batch slots' `visible`). Pixi does not descend into a child render group while
collecting a parent's renderables — it emits one instruction for it — so a bullet appearing
rebuilds the 512-sprite `ENEMY_BULLETS` group and leaves the 1,595-tile terrain grid (55 × 29 at
12-px tiles; v1: the 1,274-tile 49 × 26 grid), the HUD and
the UI alone, buffers included. `BG_FAR`, `BG_MID`, `FOREGROUND` and `DEBUG` stay plain: the parallax bands are
shown once when they are bound and only their containers move afterwards — the `fore` band of
R3-06 is a parallax band too and is left out like the two backgrounds — the Mode-7 mesh follows
a camera range, and `DEBUG` is empty in a release build.

The cost is one batch boundary per group: a busy frame went from 4 to 9 draw calls in the bench
and the e2e budget from 12 to 16 (`shmup_feat.md` §22 allows 20–50). The two decor groups raise
the decor frames above that, not the plain ones: the bench's `decor range` scenario measures the
busiest of them at 14 draw calls, inside the bench's standing `DRAW_CALL_BUDGET` of 20
(`test/bench/render-harness/bench-gates.ts`) — R3-06.L7 measured first and did not raise the
gate. `createPixiRenderer({
renderGroups: false })` restores the single-group scene — nothing shipped uses it; it is there so
`pnpm bench` can measure the rebuild against itself in one run (the review's measurement **M1**).
`renderer.structureRebuilds` counts the frames the *scene's* group was rebuilt on (the overlay's
`REB`) and `renderer.groupRebuilds` the rebuilds of every group in it, so a fall in the first
cannot hide as churn that merely moved.

`createDrawListView()` (`ui`) draws a `DrawList` into a quad pool in command order: rects,
sprites (`Hidden` skips the command, `Flash` swaps to the sibling), `text` and `number` via
the bitmap font. It skips the whole list when it is the same list at the same `revision`;
`invalidate()` forces the next draw (the renderer calls it when the sprite tables change).

### Bitmap text (`text`)

`createBitmapFont(atlas, 'pixel')` resolves the pipeline's font (since R2-01 the interim **9×12
cells, `lineHeight` 15** — the 6×8 file scaled ×3/2 by the pipeline, not a new file
([asset-pipeline.md](asset-pipeline.md#the-interim-15-art-stage-r2-01)); glyphs: the 195 of
`UI_GLYPHS` — ASCII 32–126 plus `← ↑ → ↓ ● ✕ ★`, the Spanish capitals and the katakana subset)
into dense lookup tables. `drawText(sink, font, text, x,
y, color, align)` walks `charCodeAt` and emits one quad per visible glyph: `\n` starts a new
line, alignment (`TextAlign.Left/Center/Right`) applies per line, spaces only advance, a
missing character draws `?`. `drawNumber()` splits the integer part into a shared digit
buffer (NaN / ±Infinity draw `0`, magnitudes cap at `Number.MAX_SAFE_INTEGER`, zero padding
stops at 20 digits). `createTextMetrics([font])` implements core's `TextMetrics`
(`measure(text, fontId)`, `lineHeight`) for layout code; the renderer exposes it as
`renderer.metrics`.

### One frame

`createPixiRenderer({ canvas, displayWidth, displayHeight, atlas, testPattern?, font?,
glyphCapacity?, preferWebGLVersion?, effects?, fxSeed?, particleCapacity?, scaleMode?, showHitbox?,
interpolation? })` builds the scene once: a lifted-navy background quad (never black — VA panels),
the optional calibration pattern, the layer stack, a playfield-dim quad and two flash quads — a
normal one and (M2-08) an `add`-blended one for additive looks (the last children of the world
group, 32 px bigger than the frame on each side so shake never uncovers an edge), the layer
effects (M2-08, no filter until a bound view needs one), a menu-dim quad (first
child of the UI layer), the HUD / UI draw-list views and — M1-14 — the screen effects, the
particle pool and the score popups (the last two on the `FX` layer, with an atlas / font).
`render(frame)` then:

1. updates the calibration pattern (when enabled);
2. steps the effects, particles and popups by the ticks since the last frame (`frame.tick`
   delta: 0 while paused, ≤ 60; a tick going back clears them);
3. rebinds if `frame.world` is a different object, then syncs the particles and popups (with the
   world's camera — or, with render interpolation on (M2-08), the camera between the last two
   ticks by `frame.alpha`), the parallax bands, the terrain grid, every sprite binding (the
   interpolating `syncInterpolated` variants while interpolation is on), the laser binding, the
   bending laser binding (M2-02), the hitbox markers while `showHitbox` is on and the layer
   effects (`layerEffects.sync(tick, camera, shakeY, settings.rasterEffects)` — M2-08);
4. offsets the world group by the rounded `frame.screen` shake plus the effects' shake, shows the
   brighter of the frame's white flash and the effects' tinted flash (on the additive quad for an
   additive look — the Mega Crash since M2-08), sets both dims;
5. draws the HUD and UI lists (skipped when unchanged);
6. renders the scene into the 640×360 render texture, then that texture as one **quad** onto the
   canvas, placed by the scale mode (`computeViewport` — integer-scaled and centred by default,
   ×3 on 1080p and ×2 on 720p since R2-01's flip; `fit` / `stretch` since M2-08). Since **M3-02d** that quad is a `Mesh` whose shader is the CRT
   program (`effects` `createCrtBlit`), so the CRT look costs no extra pass and no pooled render
   target — `PixiRendererOptions.screenPass: 'filter'` restores M3-02's plain sprite plus a Pixi
   filter if a device ever needs it.

How the effects work: [fx-and-game-feel.md](fx-and-game-feel.md).

Both passes reuse option objects created with the renderer. Pixi's `render(options)` writes
into the object it gets (`target`, `clear`, `clearColor`, a cached `transform`), so a small
`resetPass()` restores those fields before each call — without it, the second frame would
reuse the first frame's cached state.

**The boot warm-up (M3-02d).** Pixi links a GL program the first time it *draws* with it, and its
batch attribute buffer starts at 16 bytes and doubles as frames get busier — so without help the
layer-effect, Mode-7 and CRT programs would link mid-stage (5–50 ms on a Mali-G51) and the first
frame busier than any before it would allocate and copy a few hundred KB **inside**
`renderer.render()`, past where the Node allocation guards can see. `PixiRenderer.warmUp()` draws
one throwaway frame into an off-screen target with every filter attached and every pooled sprite
visible, then puts everything back; `bootShell` calls it once, after `bindWorld` and while the
loading screen is still up. Nothing is ever presented and no effect state or tick moves.

**What the mesh path costs elsewhere (M3-02d).** Two things came with it. (1) A **hardware
dependency**: Pixi's `MeshGeometry` builds its index buffer as a `Uint32Array`, so both effect
meshes need WebGL1's `OES_element_index_uint`. Pixi requests the extension with the context and
anything of the M7's generation has it (Mali-G51 does), but it is on the path *every* frame takes
now — a context without it draws a black picture, not a picture without a CRT look, which is why
[Gotchas](#gotchas) and the on-device checks both name it. `crt-blit.test.ts` /
`mode7-mesh.test.ts` pin the index type in Node and `test/e2e/mode7.spec.ts` asserts a real WebGL1
context offers it. (2) **Teardown**: the floor's mesh and the pass-2 container are the renderer's
own, not the scene's — `bindWorld(null)` only hides the floor — so `destroy()` frees
`mode7`, `crt` and the `screen` container explicitly. Both were leaking (`Mesh` / `MeshGeometry` /
`Shader` / `GlProgram` and the two side-panel sprites) until M3-02d's tests caught it; a
regression test in `renderer-wiring.test.ts` fails without the calls.

**Allocation budget.** Pixi objects are created in `createPixiRenderer` and in `bindWorld()`
(which also creates the parallax sprites and the terrain grid, below the batches, the laser
sprites and the bending laser segments above them, and validates every band's layer before
creating anything).
The shell pre-binds its scene at load, so a running frame only assigns numbers and existing
textures. Tint is set only when it changes, because Pixi's `tint` setter allocates before it
compares (a HUD redrawn every frame used to allocate ~1 KB per frame).

### Colour-blind bullet palettes

Plan M2-02 (`shmup_feat.md` §21 "colorblind bullet palettes + shape coding"). The player picks
the enemy bullets' colour set under OPTIONS → **BULLETS**: `standard` (pink / red / purple) or one
of three sets for the common kinds of colour blindness — core `config` `BULLET_PALETTES`
(`standard`, `deuteranopia`, `protanopia`, `tritanopia`), stored in
`UserOptions.display.bulletPalette` ([saves-and-options.md](saves-and-options.md#user-options-coreconfig)).
It is **presentation only**: the simulation, its sprite ids, replays and hashes never see it.

- **The art.** The asset pipeline's `palettes` generator draws every bullet (9), laser beam (3)
  and bending laser segment (3) again for each colour-blind palette as `<sprite>@<palette>`
  (`bullets/oval-red@deuteranopia`, `lasers/beam-pink@tritanopia` …), with the same frames in the
  same order. Each palette moves the three colour families to hues that stay apart for that
  kind of colour blindness and away from the gold items and orange explosions (light magenta,
  sky blue and near-white for red–green blindness; crimson, teal and near-white for blue–yellow),
  and **shape-codes** the cores so the families differ without colour: pink keeps the solid bright
  core, red gets a dark centre pixel (a ring), purple a single bright dot
  ([asset-pipeline.md](asset-pipeline.md#procedural-generators-scriptsassetsprocedural)).
- **The swap.** `resolveBulletPaletteTable(atlas, names, palette)` (render-pixi `palette`)
  resolves the sprite name table like `createSpriteTables` and then points every name that has an
  `@<palette>` variant at the variant's first frame. `renderer.setBulletPalette(palette)` stores
  the choice and, once sprite names are set, replaces `tables.base` with that table and
  invalidates the HUD / UI views; every binding reads the shared tables, so the next frame draws
  the new colours with **no rebinding and no sim change**. `setSpriteNames` resolves with the
  current palette. The swap allocates — it runs at boot and when the option changes, never per
  frame. The flash table is untouched (a bullet never flashes).
- **The shell.** At boot, after the save is read, the shell calls
  `renderer.setBulletPalette(save.options.display.bulletPalette)` before the scene's sprite
  names are resolved; in the scene flow `connectOptionEvents(…, onBulletPalette)` turns the
  Options screen's live `UserOption` `BulletPalette` events (`param` = the `BULLET_PALETTES`
  index; bad indices ignored) into `renderer.setBulletPalette`.
- **Real art.** A PNG override of a bullet sprite replaces only the standard frames; without its
  own `@<palette>` variants (overrides by name too) the colour-blind sets keep the procedural
  variants' frames — `pnpm content:check` requires every variant of every engine bullet / laser
  sprite, frame for frame.

### Presentation polish (M2-08)

The whole story is on [presentation-polish.md](presentation-polish.md); in brief, for this page:

- **Layer effects.** `renderer.layerEffects` (`effects` module, `createLayerEffects`) binds the
  world's `effects` in `bindWorld` and, every frame, attaches one GLSL ES 1.0 filter to a world
  layer while one of its raster effects or palette cycles is in camera range — a per-row offset
  table in a 1 × 360 RGBA8 texture (the frame height — `LAYER_EFFECT_ROWS`) plus up to 8 colour pairs, one program. Since M3-02e a plain
  frame is about 7 WebGL draw calls (roughly one per render group that holds something — see
  **Render groups** below); each filtered layer adds about 3. `effects.settings.rasterEffects =
  false` draws every layer plain.
- **Scale modes.** `computeViewport(mode, …)` (`viewport`) places the frame sprite: `integer`
  (default, `computeIntegerViewport`), `fit`, `stretch` (`scaleX` ≠ `scaleY`);
  `renderer.setScaleMode(mode)` re-places at once and `resize()` keeps the mode.
- **Hitbox markers.** `createHitboxBinding` on the `HITBOX` layer, bound from `world.hitboxes`;
  `setShowHitbox(on)` shows or hides the layer (the markers are synced only while shown).
- **Additive flash.** A second flash quad with blend mode `add` takes looks with `additive: true`
  (the Mega Crash); the normal quad keeps the others — no sprite ever changes blend mode.
- **Render interpolation.** `setInterpolation(on)`: the camera, the bands, every sprite binding
  and the hitbox markers are drawn between the last two ticks by `frame.alpha`
  (`syncInterpolated(…, blend)` — the blend is a reused `RenderBlend` object; a slot is blended only
  when it kept its sprite id and moved ≤ 24 px). The shell turns it on only while its refresh
  probe reads more than 70 Hz.

## The browser shell (`@shmup/shell`)

`bootShell(options)` is the one boot path of `apps/web`, `apps/tizen` and `apps/webos` (D34). The
apps create what is platform-specific — input, audio, the `Platform` — and pass it in with the
virtual modules: the content inlined, the atlas as **where to fetch its manifest** (since R1-05 —
the manifest ships as `dist/assets/atlas/main.json`, no longer inside `app.js`):

```ts
import contentFiles from 'virtual:shmup-content';
import assets from 'virtual:shmup-assets';

const shell = await bootShell({
  canvas,
  win: window,
  contentFiles,
  assets, // { manifestUrl, atlasDir, manifestDigest } — or virtual:shmup-assets-inline's { manifest, pageUrls }
  input, // createWebInput(...) — also the platform's input; destroyed by stop()
  audio, // createWebAudio()   — also behind the platform's audio; destroyed by stop()
  platform: (renderer) => createWebPlatform({ input, audio, webgl2: renderer.webGLVersion === 2 /* … */ }),
  gameConfig: { remoteMode: false, stage: stageFromSearch(location.search) }, // apps/web: ?stage=
  scene: sceneFromSearch(location.search), // 'game' (default: the scene flow) | 'flight' | 'showcase' | 'calibration' | 'fx-gallery'
  audioUnlock: 'gesture', // 'immediate' on the TV and (M2-17) inside the Electron app
  contentOwners: { [INPUT_PROFILES_KIND]: profiles.load }, // optional: merged over DEFAULT_CONTENT_OWNERS
  inputProfiles: { choices, active, apply, customize, rebindable }, // optional (M1-17): CONTROLS; M2-16: the player's rebinding / SOCD / debounce and the rebind screen's profiles
  debugTools: __SHMUP_DEV__ ? debugToolsFactory({ buildId: __SHMUP_BUILD__ }) : null, // M1-19
});
```

### The boot sequence

| Step | What happens | Fails with (error screen title) |
|---|---|---|
| 0 | Canvas marked `data-shmup-state="loading"`; overlay shows `SHMUP CUP` / `LOADING` and an empty bar | — |
| 1 | `loadGameContent(files, { owners })`: core kinds through `loadContent()`, every foreign kind through its owner | `CONTENT COULD NOT BE READ` (a thrown error), `CONTENT ERRORS: N PROBLEMS` (issues, one `path: message` line each) |
| 1a | R1-05, manifest assets only: `loadAtlasManifest(manifestUrl, manifestDigest, createRequest)` — **`XMLHttpRequest`** through audio-web `loadArrayBuffer` (`fetch()` fails on `file://`, D25; there XHR succeeds with status 0), then the digest of the bytes (32-bit FNV-1a, the value `vite.shared.ts` recorded at build time), the format version (`ATLAS_MANIFEST_VERSIONS` 1 or 2) and the shape; the page URLs are `atlasDir` + each page's `file`. An inlined manifest (`virtual:shmup-assets-inline`, the TV fallback of W3-7) skips this | `ATLAS MANIFEST FAILED TO LOAD` (load / parse), `ATLAS DOES NOT MATCH ITS MANIFEST` (digest / version — a manifest of another build) |
| 2 | Eager only (`ShellOptions.atlasPages: 'eager'`, R3-04.M3e): `loadImagesTimed(pageUrls, () => new Image(), …)` — all pages in parallel, each awaited through a guarded `img.decode()` (a rejected decode still counts as loaded) and timed (`Shell.atlasTiming`, R1-05); the bar advances per page. The lazy default fetches **nothing** here: every page enters `createAtlas` as `null`, and the boot's awaited prepare loads the boot stage's pages itself (the boot's `atlasTiming` page rows then carry uploads only) | `ATLAS PAGE FAILED TO LOAD` (`<url>: AssetLoadError: …`) — under lazy, the boot prepare rejects with the failing page's URL tagged on, and the error screen prints the same line |
| 3 | `createAtlas(manifest, images)` | `ATLAS DOES NOT MATCH ITS MANIFEST` |
| 4 | `createPixiRenderer(...)` — WebGL1 first (the M7 monitors do expose WebGL 2 / OpenGL ES 3.0 with `MAX_TEXTURE_SIZE` 8192 on a Mali-G51 — measured 2026-09-15 —, but older sets do not, so WebGL1 stays the default); `fxSeed` = the game's seed xor a salt, `effects` = `ShellOptions.effects`, `countDrawCalls` only with `ShellOptions.debugTools` (M1-19) | `WEBGL IS NOT AVAILABLE` |
| 5 | `options.platform(renderer)`; then (M1-17) `loadSave(platform.storage)` — never fails: a corrupt or unreadable save means defaults, its text copied to `save.corrupt` — `createSaveStore`, `applyAudioOptions(audio, save.options.audio)`, and with `options.inputProfiles` its `choices()`, `apply(savedId, 'save')`, (M2-16) `customize?.(save.options.input)` and `active()`; (M2-16) the rebind screen's host side `createShellControls(…)` when the app offers `customize` / `rebindable` and the adapter the capture; then `createGame(platform, gameConfig, content.db, options)` — `{ scenes: 'boot', save, inputProfiles: { choices, active }, soundTest, controls }` for the default scene `game` (the scene flow, M1-16), none for the dev scenes (bare gameplay) — [saves-and-options.md](saves-and-options.md#the-shells-side) | `SHMUP CUP FAILED TO START` (the platform factory, the profile callbacks or `createGame` threw) |
| 5a | Audio (M1-15): `createAudioEngine({ sfx, music, loader })`, `engine.loadSfx()` (bar labelled `LOADING SOUND`), then for a booted stage `engine.prepareMusic(stage.id, stageMusicCues(stage))` (`LOADING MUSIC`; open space prepares none); the scene flow adds the title theme (and the stage-clear / game-over jingles in open space), then `game.scenes.finishBoot()` — [audio.md](audio.md#the-shells-wiring) | `AUDIO FAILED TO LOAD` (`AudioLoadError: could not load <url>: …`) |
| 6 | `renderer.setFxContent(shell.fx)`; `applyDisplayOptions(renderer, save.options.display)` (M2-02: the bullet palette — before the sprite names are resolved; M2-08: the scale mode, shake, flashing and hitbox markers — then `ShellOptions.effects.screenShake` / `reduceFlashing` override them), `renderer.setInterpolation(interpolation === 'on')` and the refresh probe (M2-08; M3-02b: the probe also drives `game.setVsyncLock` while `framePacing` is `'auto'` and it reads `VSYNC_LOCK_MIN_HZ … VSYNC_LOCK_MAX_HZ`); scene set up (the scene flow: `createSceneView(game)`, its name table + `bindWorld(view.backdrop)`; free flight / showcase / fx gallery: the scene's name table + `bindWorld(scene.world)`; calibration: content's names and a frame without a world), dispatcher created — in the scene flow and free flight with `connectFxEvents` (M1-14) and `connectAudioEvents(events, engine, camera)` (M1-15; the flow's `sceneView.camera`, free flight's `world.view.camera`); in the scene flow also `connectOptionEvents(events, audio, …)` (M1-17: the Options screen's volumes and profile, live; M2-02: the bullet palette → `renderer.setBulletPalette`; M2-08: the renderer as the display target — scale mode, shake, flashing, hitbox markers; M2-16: `InputSettings` → the app's `customize(save.options.input)`) and `connectStagePreparation(events, engine, stages, stageMusicCues)` (M2-10: `PrepareStage` → the stage's music set) | — |
| 7 | Suspend → `input.clear()` + `audio.suspend()`; resume → `audio.resume()` + `refresh.reset()`; window `blur` → `input.clear()` (M1-17 — a window without focus never sends its key-ups) **and, since M3-02b, a platform suspend**: the apps' lifecycles treat `blur` / `focus` like hidden / visible (the M7's Home bar is only an overlay — it fires no `visibilitychange`), de-duplicated so a `blur` + `hidden` pair suspends once and the resume waits for both; audio unlock (first `keydown` / `pointerdown` in the capture phase, or immediately) followed by `engine.attach(audio)` right after `unlock()` returns and again when it resolves; `resize` → `renderer.resize()` | — |
| 6a | The atlas residency — `createAtlasResidency` under `'eager'`, `createLazyAtlasResidency` under the `'lazy'` default (R3-04) — prepares the boot stage (the scene flow's and free flight's `game.world` stage; showcase, calibration and the fx gallery keep every page) so its pages are uploaded **behind the loading screen, before the warm-up frame**, each upload timed; a lazy boot **awaits** that prepare, so the first displayed frame draws the boot stage (decision W5-16). The canvas gets `data-shmup-atlas-pages`, `data-shmup-atlas-load-ms` (`atlasTiming.totalMs`) and `data-shmup-atlas-page-ms` | — |
| 7a | `renderer.warmUp()` (M3-02d) — one throwaway frame into an off-screen target with every GL program and every pooled sprite in it, so nothing links or grows a batch buffer once the game is running; never presented | — |
| 8 | rAF loop started, overlay removed, canvas marked `running`, `data-shmup-scene` = the top scene (`title`) or the dev scene, and `data-shmup-boot-ms` = the launch-to-ready time (M1-17, `Shell.bootTiming`); then, in dev / test builds, the debug tools from `ShellOptions.debugTools` (M1-19: keys, `window.__shmupDebug`, the overlay — before the first frame, which rAF runs later; since M2-17 with the save store for `__shmupDebug.save`) | — |

Once the atlas and the content are ready (M2-17) the shell also works out which atlas pages each
campaign zone needs (`memory` module: `stageSpriteSets` → `atlasPageNeeds` → a residency factory,
`Shell.atlasResidency`) and, in the scene flow, connects it to
`PrepareStage` next to the music preparation — [platform-polish.md](platform-polish.md#memory-budget-shmupshell-memory).
Since R1-05 the atlas really is split (`common` + one page per zone). Since R3-04 the residency
runs in two modes, chosen by `ShellOptions.atlasPages` — **`'lazy'` is the default since
R3-04.M3e**: `createLazyAtlasResidency` starts with nothing attached, and its prepare fetches,
decodes, attaches and uploads the stage's pages (the loads run in parallel — `Promise.all`, not
`allSettled`, Chromium 68) while detaching every other page **with its decoded image** (policy
"resident"); `'eager'` is the pre-R3-04 behaviour, `createAtlasResidency` keeping every page's
image (policy "all") and only moving GPU copies. Both modes share the page bookkeeping —
`resident`, `unloads`, `uploads`, `lastPrepareMs`, the `onChange` contract — and these rules:

- **Eager upload** (W3-2): a prepare unloads the pages the next stage does not need, then uploads
  every needed page without a GPU copy — at boot (step 6a), on every `PrepareStage`, and
- on every **new World on screen** (W3-9): in the frame loop's `worldChanges` branch (cold, once
  per World) `prepareShownWorld` finds the World the frame shows — the game's own, or a stack
  scene's `world` field (the attract demo, which never emits `PrepareStage`; a replay) — by its
  view (`worldOfView`; `game.world` is the game scene's World, not the demo's). The weapon select's
  live preview is deliberately **not** placed: it flies the dev `weapon-range`, and placing a stage
  outside the campaign would put every page on the GPU for a menu.
- **The preview under lazy (R3-04.M3e):** a page drawn but never attached would draw nothing, so
  when the frame shows a scene-owned preview World (`previewWorldOfView` reads the stack's
  `.preview` fields), the boot runs `attachUnloadedPageImages`: fetch + `Atlas.loadPage` only, no
  upload, the residency's masks and counters untouched — the page the preview really draws uploads
  itself on its first draw exactly as under eager, and the next real prepare detaches it again. A
  preview fetch that fails leaves the page detached (a menu must not hard-fail the shell).
- **The hold (M3c):** while a lazy prepare's pages are in flight the frame loop **holds the
  game** — the last displayed frame is redrawn, no tick runs and no input is consumed, so a slow
  page load cannot move a replay (decision W5-16; `residency-hold.test.ts` hashes a replay across
  a zone change with and without the hold). A frame advance asked for mid-load runs exactly one
  tick once the pages are in. Mid-play load failures are swallowed (`asAtlasResidency`'s prepare
  catch) and retried by the next prepare; a prepare superseded by a newer one keeps its attached
  images but hands the GPU pass and the report to the newer one.
- **Context loss (M3d):** because lazy drops a detached page's bytes, `webglcontextlost` is
  cancelled and `webglcontextrestored` runs `recoverAtlasPages` — one page at a time, cold:
  re-fetch (fresh images: a driver reset can outlive the browser's hold on the decoded data),
  `loadPage`, `unload()` the dead GPU copy, `uploadTextureSource`; a failed re-fetch keeps the old
  image standing in, a failed upload leaves Pixi's own lazy re-creation to heal the next drawn
  frame. The listener is added after the renderer's, so Pixi has cleared its texture bookkeeping
  first. `test/e2e/atlas-context-loss.spec.ts` drives it through `WEBGL_lose_context`.
- **Self-healing unload:** a prepare unloads every page the stage does not need **whether or not it
  believes it resident** — the preview draws `terrain-a` from zone A's page behind its back, and
  Pixi uploads it on that first draw; the game start's prepare frees it again. Unloading a page
  with no GPU copy costs nothing; `unloads` and `onChange` count only the believed-resident ones.
- **Timing** (W3-6): `Shell.atlasTiming` (`AtlasTiming` — `manifest` `fetched` / `inline`,
  `manifestMs`, `manifestBytes`, `pagesMs`, per page `file` / `loadMs` / `decodeMs` / `uploadMs`,
  `totalMs`), measured with the window's `performance.now()`, never `ShellOptions.now`; under lazy
  the boot's page rows carry uploads only (`pagesMs` is 0). The canvas
  carries `data-shmup-atlas-pages` (the resident page indices, `"0,1"`), `data-shmup-atlas-load-ms`
  (after boot the atlas's share of the boot, then each stage change's unload + upload — under lazy
  a change's figure times the whole prepare, fetch included) and
  `data-shmup-atlas-page-ms` (after boot `manifest:<ms>;<file>:<load>/<decode>/<upload>;…`, after a
  stage change `<file>:0.0/0.0/<upload>` for each page it uploaded — policy "all" fetches and
  decodes every page at boot), written on those transitions only, never per frame. Dev / test
  builds expose the same as `window.__shmupDebug.atlas` ([debug-tools](../client/debug-tools.md)).

The manifest itself: [asset-pipeline.md](asset-pipeline.md#the-vite-plugin-shmupassets-in-vitesharedts).
The platforms' `localStorage` adapter is the shell's `createWebStorage` (the `storage` module,
quota checks) since M2-17.

On any failure the error screen stays up, the canvas is marked `error`, everything created so
far (input and audio included) is released, and the promise rejects with a `ShellBootError`
(`lines`, `issues`, `reason`). The apps log it as "Shmup Cup failed to start".

A file whose kind is neither a core kind nor claimed by an owner is an issue
(`<path>: no loader for content kind "<kind>"`), so a new content kind cannot ship
unvalidated. Owners come from `contentOwners`, then the shell's `DEFAULT_CONTENT_OWNERS`
(today `input-profiles` → `@shmup/input-web` `loadInputProfiles`, M1-05 — the one reason the
shell imports input-web — `fx` → `@shmup/render-pixi` `loadFxContent`, M1-14, and `sfx` /
`music` → `@shmup/audio-web` `loadSfxContent` / `loadMusicContent`, M1-15). Both apps
pass an input-profile registry's `load` for that kind instead, so they keep the parsed profiles
and apply them in the platform factory, which runs after validation
([input-profiles.md](input-profiles.md#choosing-the-active-profile)). For `fx`, `bootShell`
registers its own owner (under `contentOwners`) that keeps the parsed presets for the renderer
(`Shell.fx`); an app `fx` owner would replace it and leave the particles without presets. The
same goes for `sfx` / `music`: the shell's own owners keep the bank and the music library for
the audio engine (`Shell.audioEngine`).

### The overlay canvas

The progress bar and the error screen are drawn with the Canvas 2D API on a **separate
canvas** inserted after the game canvas (`position: fixed`, full window,
`data-shmup-overlay="boot"`). The game canvas cannot be used: a canvas that ever had a 2D
context can never get a WebGL one, and the error screen has to work when WebGL is exactly
what failed. The overlay is removed once the game runs. Text is monospace at
`max(12, height / 36)` px (readable from the sofa); lines too wide are cut with `…`, and
when there are more lines than fit, the last one reads `… and N more`. Colours are
`BOOT_SCREEN_COLORS` (navy background, pink title).

### The frame loop and event dispatch

```ts
let inputContext = game.inputContext;
input.setContext(inputContext); // once at boot
let inputSeats = game.inputSeats;
input.setSeats?.(inputSeats); // M2-06: player seats, once at boot (optional on the adapter)
const onFrame = (now: number): void => {
  refresh.sample(now); // M2-08: the refresh probe — 'auto' interpolates while hz > 70
  if (interpolationMode === 'auto' && refresh.ready) {
    const fast = refresh.hz > INTERPOLATION_MIN_HZ;
    if (fast !== renderer.interpolation) renderer.setInterpolation(fast);
  }
  if (game.inputContext !== inputContext) {
    inputContext = game.inputContext;
    input.setContext(inputContext); // game / menu binding tables (D15), before this frame's ticks
  }
  if (game.inputSeats !== inputSeats) {
    inputSeats = game.inputSeats;
    input.setSeats?.(inputSeats); // 2 during a co-op game — player 2's seat (M2-06)
  }
  game.frame(now); // 0…4 fixed ticks
  sceneView?.follow(); // the scene flow: copy the camera on screen (sounds pan against it)
  game.events.drain(events.visit); // sim events → registered handlers
  engine.endFrame(); // closes the audio engine's SFX dedupe window (M1-15)
  const frame = game.renderFrame(); // the flow composes it (updateFrame)
  if (sceneView !== null) {
    const shown = sceneView.update(frame);
    if (sceneView.worldChanges !== shownWorlds) {
      // a new game: clear the last one's particles and popups
    }
    markScene(); // data-shmup-scene = the top scene's id, when it changed
    renderer.render(shown);
    return;
  }
  renderer.render(scene !== null ? scene.update(frame) : calibration.update(frame));
};
startFrameLoop(win, onFrame); // requests the next frame before calling onFrame
```

In dev / test builds (`Shell.debug !== null`, M1-19) the same frame also calls the debug tools:
`beginFrame(now)` first (frame time, FPS, the frame graph; starts timing the ticks),
`endTicks()` after `game.frame`, `beforeRender()` just before `renderer.render` (collects the
sim counters from the World on screen, reads `renderer.drawCalls` and the particle pool, rebuilds
the overlay) and `afterRender()` after it (render time). Release builds pass no factory, so the
frame is exactly the one above — [debug-and-replays.md](debug-and-replays.md#the-frame-with-the-tools).

`createEventDispatcher()` routes drained records by `SimEventKind` to handlers registered at
load time with `shell.events.on(kind, handler)` (returns an unsubscribe function; an unknown
kind throws `RangeError`). Dispatching is a table lookup and a loop — no allocation.
Handlers receive the queue's **reused** record: copy fields out, never keep it. Events with
no handler are counted in `unhandled` and dropped; the queue is the game's (the World's since
M1-06; one queue for every World of the scene flow since M1-16). Since M1-14, free flight (and
since M1-16 the scene flow) registers `connectFxEvents(events, renderer)`: `Particles` and `Sfx` →
particle bursts (the sounds a `content/fx/` trigger binds: hits, clinks, pickups, shots),
`Shake` / `Flash` / `Dim` → the screen effects, `Score` / `FormationBonus` / `BossDefeated` →
score popups ([fx-and-game-feel.md](fx-and-game-feel.md#which-event-draws-what)). Since M1-15
it also registers `connectAudioEvents(events, engine, camera)`: `Sfx` → `engine.playSfx(cue,
screenX, priority)` with `screenX = Math.floor(event.x - camera.x) | 0` (whole pixels from the
playfield's left edge — it pans the sound), `Music` → `playMusic(cue, fadeTicks)`, `MusicDuck`
→ `duckMusic(ticks)` ([audio.md](audio.md#which-event-plays-what)); an `Sfx` event reaches both
the particle and the audio handler. Since M1-17 the scene flow also registers
`connectOptionEvents(events, audio, onInputProfile)`: `UserOption` volume events →
`audio.setBusVolume(bus, volumeGain(level))` (the SFX level on `sfx` and `ui`), the profile event →
the app's `inputProfiles.apply(id, 'options')`, and since M2-02 the `BulletPalette` event →
`renderer.setBulletPalette(BULLET_PALETTES[param])`, and since M2-08 the `ScaleMode`,
`ScreenShake`, `ReduceFlashing` and `ShowHitbox` events → the renderer (`setScaleMode`,
`effects.settings`, `setShowHitbox`)
([saves-and-options.md](saves-and-options.md#live-changes-the-useroption-event)). Since M2-10 the
scene flow also registers `connectStagePreparation(events, engine, game.content.stages,
stageMusicCues)`: `PrepareStage` (`id` = a `ContentDb.stages` index — the zone map's launch, the
title after a run through the map, a run or practice start on another stage) → `engine.prepareMusic(stage.id,
[Title, …stageMusicCues(stage)])` in the background (a new list — the picker's array is never
modified; an unknown index is ignored; a rejection goes to the optional `onError`, default
ignored) ([campaign-and-bonus-stages.md](campaign-and-bonus-stages.md#preparing-the-next-zone-simeventkindpreparestage)).
Since M2-15 it also registers `connectSoundTest(events, engine)`: `SoundTest` (`id` = a music-library
index — the titles the boot handed the flow in `GameOptions.soundTest`) → `engine.playTrack(id, 0)`
in the background ([front-end-and-attract.md](front-end-and-attract.md#the-sound-test)).
Only `HitStop`, `Rumble` and `PowerUp` are still counted as unhandled.

### Scenes

| `?scene=` | What is drawn | Sprite name table |
|---|---|---|
| (none) / `game` | **The scene flow** (M1-16, `createSceneView(game)`; the game created with `{ scenes: 'boot' }`): the title (logo, `PRESS OK`, the mode select 1 PLAYER / 2 PLAYERS / PRACTICE / OPTIONS / SOUND TEST / EXIT — M2-06, M2-15 —, the session hi-score — the saved best since M1-17) over a drifting starfield backdrop; the attract loop (M2-15: the demo play's World and HUD — drawn like a game, a new World for the scene view —, the hi-score tables and the story crawl over the backdrop), the name entry, the practice select and the sound test; a game with the core HUD (score, `HI`, `2P`, stock, the power meter, Force Field pips — the MANTA's tier pips in Direct mode, M2-05), the stage's own parallax and terrain — zone A by default since M1-18 (`defaultStageId`), another with `?stage=` — or the World over the starfield in open space; the difficulty menu under START and the continue countdown (M2-01), the ship select (M2-05), the weapon select with its live preview World drawn full screen behind its panel and the Auto order editor (M2-03), the pause menu, the Options screen (M1-17), the YES / NO dialog, the stage-clear and game-over screens over the frozen, dimmed game — all drawn by the core into the HUD / UI lists ([scenes-and-ui.md](scenes-and-ui.md)) | `content.db.sprites.names` + `SCENE_VIEW_SPRITES` |
| `flight` | **Free flight** (`createFlightScene(game)`, M1-06): the game's World — the KESTREL flying in, then moving under the player's control — over three drifting star layers, both HUD bars (`1P` and player 1's score, `FREE FLIGHT`, `HI` and the session hi-score, `lives − 1` stock ships, `ARROWS MOVE` — M1-12). With a stage (`gameConfig.stage`, the web app's `?stage=<id>`, M1-07): the stage's parallax bands and scrolling terrain instead of the starfield, the stage name as the title, the enemies its timeline spawns (M1-08) and their bullets (M1-09). The ship autofires in every build, with Options and lasers under the web app's `?loadout=full` (M1-10); power capsules and the Force Field are World batches too (M1-11 — the power meter itself is not drawn before the M1-16 HUD); ships that are `dying` / `dead` are not drawn, a respawn blinks, and `GAME OVER` (red) replaces the title once the World's status says so (M1-12); a boss's parts are a World batch, and a running WARNING is drawn as a translucent band with its text in the UI list (M1-13, `?stage=test-boss`) | `content.db.sprites.names` + `FLIGHT_SPRITES` |
| `showcase` | The **sprite showcase** (`createShowcase()`): three scrolling star layers, the KESTREL flying a figure-eight with its thruster and two Options replaying its path, five drifters with periodic hit flashes, a rotating ring of twelve bullets, both HUD bars (scores via the `number` op, lives, power meter with a moving highlight) and the title "SHMUP CUP" / "SPRITE SHOWCASE" in the bitmap font | `SHOWCASE_SPRITES` |
| `calibration` | The skeleton's test pattern (checker border, grid, colour bars, placeholder ship, moving marker) under empty layers | `content.db.sprites.names` |
| `fx-gallery` | The **fx gallery** (`createFxGallery(renderer)`, M1-14): a still starfield and, one station a second, every particle preset of `content/fx/` bursting at the centre, then the three shakes, the three flash kinds, the playfield dim and a row of score popups, named in the UI list (`3/19  EXPLOSION.LARGE`); it drives the renderer's effects directly — the World's events are not connected ([fx-and-game-feel.md](fx-and-game-feel.md#the-fx-gallery-scenefx-gallery)) | `FX_GALLERY_SPRITES` |

**The scene flow's view** (`scene-view`, M1-16) passes the core's HUD, UI list and screen
effects through and only decides the `world`: outside the game (boot, title — the frame's `world`
is `null`) its **backdrop** — a static camera and two starfield batches, pre-bound at load, drifting
with the flow's tick; in a game in open space a **wrapper** `WorldView` with two starfield batches
before the World's batches (on the World's camera, with its terrain, laser and WARNING views),
built once per World — a new object, so the renderer binds it on the first frame it appears; a
stage's own view (it has parallax bands) as is. Since M2-03 the World is **whichever World view
the frame shows** — the game's, or the weapon select's live preview (a private World flying the
`weapon-range` stage behind the panel) — instead of `game.world`; the wrapper is keyed by the view
object. `camera` follows the World on screen for the audio pan, and `worldChanges` counts new
World views (a game start, RETRY, opening the weapon select) — the shell clears the particles and
popups when it moves. No allocation per frame beyond that one wrapper per open-space World.

**Free flight** (`?scene=flight`, the default until M1-16 — bare gameplay, no title or pause)
owns a `WorldView` whose batches are two starfield batches **followed by the
game World's own batches**, on the World's camera object and with the World's `parallax` /
`terrain` / `lasers` views passed through (the starfield batches are left out when the World has
parallax bands — a stage brings its own background) — a batch the World adds later is
drawn without changing the scene (the view is bound once, so the World's batch list must be
complete at creation). The three dev scenes with a starfield (free flight, the showcase, the fx
gallery) share its tile edge: `STAR_TILE_SIZE = Math.ceil(128 × ART_SCALE)` — the pipeline's 128-px
starfield tile at the art scale, 192 since R2-01's flip; `packages/shell/src/flight/index.ts`
exports it, and the showcase and the fx gallery import it from there. Its sprite ids index one
table: the content's names, then
`FLIGHT_SPRITES`. `update(frame)` copies tick, alpha and screen effects, refills the stars
from the tick (world space relative to the camera, so they pause with the game) and rebuilds
the HUD only when player 1's lives, the World's status (`gameOver`) or a score's dirty flag
(`displayDirty`, `hiScoreDirty` — the rebuild clears them) changed: `HI` sits at x 300 and its
eight digits at x 316 of the top bar, `GAME OVER` is `0xf85858`, and at most 8 stock icons are
drawn. Since M1-13 the scene also passes the World's `warning` view through and, while it is
`active`, fills its UI list (4 commands, 1 string slot) with a translucent black band (alpha 144)
across the playfield at screen rows 76–123 (`WARNING_BAND_Y` / `_H`), 1-px red edges and the
WARNING text centred at row 85, red (`0xf85858`) and yellow (`0xf8d030`) alternating every 16
ticks; the list is rebuilt only when the look changes (off / red / yellow), and the text enters
its string slot only then. How the World itself works is in [sim-world.md](sim-world.md); the
life cycle and score in [death-and-scoring.md](death-and-scoring.md); the boss and its WARNING in
[bosses-and-warning.md](bosses-and-warning.md).

The showcase owns its own `RenderFrame` and derives every position from the game's tick with
`sinB` / `cosB`, so it pauses and resumes with the game and allocates nothing per frame. Its
UI list is built once (the renderer never redraws it); its HUD list is rebuilt every frame.
The calibration scene renders the game's frame through a small wrapper whose `world` is always
`null`, so only the test pattern and the (empty) HUD / UI lists show. `sceneFromSearch()`
turns unknown or missing values into `game`. On the TV the widget starts without a query string,
so the TV always runs the scene flow (the title; START opens the difficulty menu since M2-01, then the weapon select since M2-03, and plays zone A since M1-18).

## The apps

Both `boot` modules are thin: they create `createWebInput(...)` (`keyDevice: 'keyboard'` on
the web, `'remote'` on the TV), `createWebAudio()`, an input-profile registry (its `load` is
the `input-profiles` content owner) and a platform factory that applies the chosen profiles,
and call `bootShell`. `main.ts` imports the virtual modules and passes them as
`bootWebApp(canvas, { contentFiles, assets }, win)` / `bootTizenApp(...)` — unit tests cannot
resolve virtual modules, so the boot functions receive them as arguments.

| | `apps/web` | `apps/tizen` |
|---|---|---|
| `gameConfig` | `{ remoteMode: false, stage, stageSkip, loadout }` — `stage` from `?stage=<id>` (`stageFromSearch`; an id missing from `contentStageIds(contentFiles)` → `console.warn`, `null`), else in the scene flow `defaultStageId(contentFiles)` — zone A (M1-18; the dev scenes keep `null`); `stageSkip` from `?skip=boss` (`stageSkipFromSearch`, M1-18); `loadout` from `?loadout=` | `{ remoteMode: true, autofire: true, stage }` — `stage` is `defaultStageId(contentFiles)` in the scene flow (START plays zone A, M1-18), `null` in the dev scenes; no `?stage=` / `?skip=` |
| `audioUnlock` | `'gesture'` (autoplay policy): silent until the first key press or click — gamepad buttons do not count — then the audio engine attaches and the music asked for so far (the title theme) starts | `'immediate'`: sound from boot — the title theme, menu sounds, zone A's stage and boss themes, the jingles |
| Input profiles | `?profile=` › the saved choice (read by the shell with the save, M1-17) › `keyboard-default`; `?debounce=`; `gamepad-standard`. CONTROLS: `KEYBOARD (DEFAULT)`, `KEYBOARD AS REMOTE` (+ a `?profile=` override) | saved choice › `tizen-remote-safe` (its `register` keys registered); `gamepad-standard`. CONTROLS: `REMOTE (DEFAULT)` — the only remote profile since M3-02b; a pick registers the new profile's keys |
| Saves | `localStorage` `shmup-cup:save.v1` (memory for the session after the first storage error) | the same key in the widget's `localStorage` (deleted on uninstall) |
| Back | Esc / Backspace → `Pause` (game) / `Back` (menus); the title's Back only backs out of its menu (no `platform.exit`) | remote Back (10009) → `Pause` (game) / `Back` (menus) through the scene stack; on the title the exit confirmation → `platform.exit()` after YES. The exit watcher is installed **before** boot and removed once the shell runs, so Back exits only from the loading and boot error screens |
| Atlas URLs | `assets/atlas/main.png` under the page (`vite preview`, dev middleware) | the same relative path inside the widget (`file://`) |
| Debug tools (M1-19) | `pnpm dev`, `build:test`, `build:dev`: `debugToolsFactory({ buildId })` — F1–F8 at once | `build:test`, `build:dev`: `tizenDebugTools(window, buildId)` — nothing until Pause, Ch+, Ch+, Ch+; then 1–8 (registered with `tvinputdevice` on the unlock) and F1–F8 |

`apps/tizen/scripts/check-bundle.mjs` rule 7 fails the Tizen build unless `dist/assets/atlas/`
holds at least one page — without it the widget can only show the boot error screen.

## Browser tests (`pnpm test:e2e`)

```sh
pnpm exec playwright install --with-deps chromium firefox   # once per machine
pnpm test:e2e                                                # builds web + tizen, then runs Playwright
pnpm test:e2e --project=chromium                             # one engine only (or --project=firefox)
```

`test:e2e` runs `turbo run build:test` for `@shmup/web` and `@shmup/tizen` (since M1-19 the
**test builds** — release code plus the debug tools, so `window.__shmupDebug` exists), then
`playwright test --config test/e2e/playwright.config.ts`: headless Chromium, the viewport `VIEWPORT` of
`test/e2e/frame-pixels.ts` — the frame at `CAPTURE_SCALE` (`floor(1280 / FRAME_W)`, `scripts/frame.mjs`):
1280×720 since R2-01 (×2, so frame pixel `(x, y)` is screenshot pixel `(2x + 1, 2y + 1)`; v1's
1152×648 was ×3) — and since R1-02 every spec samples through its `sx` / `sy` / `pixelIndex` instead of
writing `3x + 1`, the web build served by
`vite preview` on port 4173 and the Tizen `dist/index.html` opened via `file://`. That is the
`chromium` project, which runs every spec; since M2-18 a `firefox` project runs only the
cross-engine determinism spec (`determinism.spec.ts`, headless Firefox against the web build's
renderer-free `?determinism` page — [release-hardening.md](release-hardening.md)), so a plain
`pnpm test:e2e` needs both browsers installed.

- `boot.spec.ts` — both builds reach `running`, the atlas page loads through its relative
  URL, the screenshot is not uniform and has known pixels (by default the title: the logo's
  colours and the hi-score, no ship; free flight's title yellow, the HUD bar and the KESTREL's
  hull colour with `?scene=flight`; the showcase with `?scene=showcase`; the calibration border
  with `?scene=calibration`), and nothing is logged as a console error, page error or failed
  request.
- `scenes.spec.ts` (M1-16) — both builds boot to the title (`data-shmup-scene="title"`); web:
  **Enter starts the game from the title** (past `PRESS OK`, START, OK on the difficulty menu
  — M2-01 —, OK on the ship select's KESTREL — M2-05 — and OK on the weapon select's START —
  M2-03) and the KESTREL flies in
  with the HUD and the power meter, Esc pauses (dimmed and frozen) and resumes, Back on the title
  only backs out of the menu; Tizen from disk: OK (13) starts, Back (10009) pauses and resumes
  without exiting, and with a fake `window.tizen` Back on the title opens the exit confirmation —
  NO and Back keep the app running, `exit()` runs only after YES.
- The gameplay specs below (`flight`, `stage`, `enemies`, `bullets`, `weapons`, `powerups`,
  `lives`, `boss`, `audio`, `shell`) open `?scene=flight` since M1-16, so they start in the game
  straight away.
- `flight.spec.ts` — after the fly-in, holding an arrow key moves the KESTREL (found by its
  hull colour, a pixel diff between captures) while it stays put without input; holding a
  direction stops it at the playfield margin, never over the HUD bars; the Tizen build from
  `file://` moves it with the remote's arrow key codes.
- `stage.spec.ts` — `?stage=test-range` shows the generated terrain (the placeholder tileset's
  colours) inside the playfield and never in the HUD bars, and scrolls it left between two
  screenshots while the ship stays put on screen — since M1-19 the sim is frozen with frame
  advance and the captures are taken at World tick 90 and exactly 30 ticks later (a 29–31 px
  shift), instead of 30 rAF frames apart; an unknown `?stage=` warns and boots free flight
  without terrain (M1-07).
- `gimmicks.spec.ts` (M2-07) — `?stage=gimmick-range` boots without errors or atlas warnings and
  draws the destructible brick pillar (the `brick` tile's face colour) once the camera reaches it;
  breaking its cells in the sim takes them off the screen on the next frame (the change log, no
  scroll needed) and the checkpoint rollback draws them again (a reset redraws the grid).
- `enemies.spec.ts` — on `?stage=test-range` the first formation of drifters (found by their
  placeholder colours, which no other sprite uses) appears inside the playfield, never in the
  HUD bars, and flies left (since M1-19 stepped in exact ticks: 15-tick steps until they show,
  then 20 ticks); no console errors and no atlas `unknown sprite` warnings while the timeline
  spawns (M1-08).
- `bullets.spec.ts` — on `?stage=test-range`, once the first turrets have scrolled in and
  settled, enemy bullets in the readability palette's body colours appear inside the playfield
  (never in the HUD bars) and move between two screenshots; no console errors or atlas
  `unknown sprite` warnings (M1-09).
- `weapons.spec.ts` — in free flight the KESTREL autofires: `shots/basic` sprites (found by
  their rim colour) appear to the right of the ship, never in the HUD bars, and move between
  two screenshots; `?loadout=full` draws the Options' orbs and laser beams; the Tizen build
  opened from disk autofires with no key held and ignores `?loadout=full`; no console errors or
  atlas `unknown sprite` warnings (M1-10).
- `powerups.spec.ts` — `?loadout=full` draws the fresh Force Field's cyan ring
  (`shields/force-field`, an engine sprite on the `Player` layer after the ships) around the
  KESTREL; the default web boot and the Tizen build opened from disk never show it; no console
  errors or atlas `unknown sprite` warnings (M1-11).
- `lives.spec.ts` — on `?stage=test-range` an unattended KESTREL is shot down three times: the
  bottom bar's `hud/life` stock icons go 2 → 1 → 0, the ship vanishes while it explodes and
  flies back in, and `GAME OVER` (its red is used nowhere else in the top bar) replaces the stage
  title; no console errors or atlas warnings (M1-12).
- `boss.spec.ts` — on `?stage=test-boss` the camera reaches the test boss's `warning` event
  after about five seconds: the flight scene draws the WARNING band (its red edge rows across the
  whole width) for three seconds; once it is gone the TRIAL WARDEN flies in from the right and
  stays in the right part of the playfield (its `bosses/hull-block` colour there); no console
  errors or atlas warnings (M1-13). Since M1-15 it polls for the boss after the WARNING and
  needs two band-free captures in a row, instead of capturing once after a fixed 150 frames: on
  a loaded machine the loop runs up to 4 ticks a frame and the autofire destroyed the boss before
  the late capture (seen on the pre-M1-15 build too).
- `fx-gallery.spec.ts` — `?scene=fx-gallery` in the web build and the Tizen build opened from
  disk shows the station label (its cyan) and, within the first stations, warm additively
  blended fireball pixels in the middle of the playfield, so the screenshot (attached to the
  report) is not blank; no console errors or atlas warnings (M1-14).
- `audio.spec.ts` — `createBufferSource` is wrapped before the page loads so every started
  sound is logged: in the web build on `?stage=test-range` the first key press unlocks audio and
  the zone theme starts as a looping 22,050 Hz buffer whose `loopStart` / `loopEnd` are the
  song's exact sample indices (intro 64 rows × 2,205 samples); in the Tizen build (unlocked at
  boot, forced autofire) the shots play as short one-shot buffers; no console errors (M1-15).
- `options.spec.ts` (M1-17) — web: OPTIONS opens the Options screen (`data-shmup-scene="options"`),
  a MUSIC change is written to `shmup-cup:save.v1` when Esc closes it and read again after a reload,
  `data-shmup-boot-ms` is under 10 s; a corrupt save boots the title with defaults, is copied to
  `shmup-cup:save.corrupt` and replaced on Back. Tizen from disk: SFX and CONTROLS changed with the
  remote's key codes only, saved on Back, kept after a reload.
- `zone-a.spec.ts` (M1-18) — the web build's scene flow plays zone A; with the debug stage skip
  `?skip=boss`, Enter past `PRESS OK`, Enter on START, Enter on the difficulty menu, Enter on the ship select (M2-05) and Enter on the weapon select reach the WARNING band (its red edge rows
  across the whole width) within seconds, then HALCYON BULWARK's hull colour (`#2e5082`, used by no
  other sprite) holds the right half of the playfield; no console errors or atlas warnings
  ([zone-a-and-playtest.md](zone-a-and-playtest.md)).
- `shell.spec.ts` — an aborted atlas request ends on the boot error screen (overlay canvas,
  state `error`); a 1000×600 window gets a centred ×1 frame on the letterbox colour (640×360 at
  (180, 120)) and a resize to 1920×1080 re-fits it to ×3 (v1: ×2 at 1000×600, ×5 at 1080p); free flight animates.
- `smoke.spec.ts` (M1-19) — the M1 gameplay smoke on both builds: title → OK, OK (START), OK on
  NORMAL in the difficulty menu (M2-01), OK on the ship select's KESTREL (M2-05), OK on the weapon
  select's START (M2-03) → hold → then ↑
  for 2.5 s each → `window.__shmupDebug.sceneId === 'game'`, the World ticked, no console errors;
  F1 / F2 on the web, and on the TV build the locked tools until Pause, Ch+, Ch+, Ch+.
- `debug-tools.spec.ts` (M1-19) — F4 freezes, F5 steps exactly one tick, `requestStep(n)` exactly
  n, F7 / F8 move the camera to the next checkpoint / before the WARNING, F3 / F6 cycle; the TV
  build's 4 / 5 after the unlock; the `frame-advance.ts` helpers themselves.
- `continue.spec.ts` (M2-01) — web build: START → ArrowDown → Enter starts the game on HARD (the
  World's rank 4); a game over (ended through `window.__shmupDebug`) opens the continue countdown
  (its red panel drawn); Enter after the lock continues — fresh lives, one continue used, the
  score's last digit counting it. Tizen build from `file://`: the remote's Back (10009) on the
  countdown gives up to the game-over screen without leaving the app; no console errors
  ([difficulty-and-rank.md](difficulty-and-rank.md)). Every older spec that starts a game from
  the title presses one more Enter / OK for the difficulty menu — since M2-03 one more for
  the weapon select, and since M2-05 one more for the ship select.
- `bullet-palette.spec.ts` (M2-02) — web build: OPTIONS → (DISPLAY since M2-16 →) BULLETS steps STANDARD → DEUTERANOPIA,
  Back writes `display.bulletPalette` to the save (`shmup-cup:save.v1`), and the next boot
  (`?stage=test-range`, whose turrets, walkers and orbiters fire pink, red and purple bullets)
  draws the enemy bullets in the deuteranopia variants' body colours with none of the standard
  ones, no console error and no "unknown sprite" warning; without a save the standard palette
  shows none of the deuteranopia colours (the control).
- `weapon-select.spec.ts` (M2-03) — web build: OK on the difficulty menu opens the weapon select
  (`data-shmup-scene="weaponSelect"`) — its panel on the left, the live preview's KESTREL (hull
  colour) flying on the right; ArrowDown + ArrowRight choose TYPE B and the preview draws its
  Ripple rings (`shots/ripple` cyan); ArrowUp + Enter on START starts a game whose World runs
  `type-b`. Tizen build from `file://`: the remote's Back (10009) returns to the difficulty menu, OK
  (13) opens the select again and starts on its first press; the remote's arrows (37–40) alone
  choose EDIT and a weapon per slot (the preview follows — read through `__shmupDebug`), NORMAL on
  `!` and an Auto order through the ORDER overlay (closed with Back), and START plays them; no
  console errors ([meter-arsenal.md](meter-arsenal.md)). Since M2-05 OK on the difficulty menu
  opens the ship select first; OK on the KESTREL opens the weapon select.
- `ship-select.spec.ts` (M2-05) — web build: OK on the difficulty menu opens the ship select
  (`data-shmup-scene="shipSelect"`), its panel names both ships and pictures the focused one (the
  MANTA's green canopy after ArrowDown); Enter starts the game with the MANTA in Direct mode (no
  weapon select), the HUD shows the tier pips' labels (`SHOT`, `SUB`, `ARM`, `SPD`, `DISC`) and
  the MANTA flies. Tizen build from `file://`: the remote's arrows and OK (37–40, 13) pick the
  MANTA and Ch− (428) toggles its speed; no console errors ([direct-mode.md](direct-mode.md)).
- `direct-items.spec.ts` (M2-05) — web build on `?stage=direct-range` with the MANTA: the six
  colour items (spawned ahead of the ship, held still) are drawn in their own colours from the
  atlas, a blue item flown into draws the green Arm round the ship with the HUD's ARM pips,
  ShiftLeft (the keyboard's Speed) toggles the speed level; no console errors and no "unknown
  sprite" warning.
- `raster.spec.ts` (M2-08) — the layer shader (`LAYER_EFFECT_VERTEX` / `LAYER_EFFECT_FRAGMENT`)
  compiles and links in a real WebGL1 context; `?stage=raster-range` boots without errors, and the
  sea (a `wave` effect and a palette cycle) and the checker floor (a `lines` effect) differ from
  the same frame with `rasterEffects` off, the far layer's heat haze runs only inside its camera
  range (`layerEffects.attachedMask`), a frame stays within 16 WebGL draw calls (the overlay's
  counter; since M3-02e's render groups 7 with one filtered layer pair and 10 with the haze too,
  where it was 5 and 7); `stretch` fills a display `integer`
  letterboxes; the hitbox markers' rim colour shows on the ship only while shown. Screenshots with
  the effects on are attached to the report.
- `display-options.spec.ts` (M2-08) — web keyboard and the Tizen build's remote key codes:
  OPTIONS → (DISPLAY since M2-16 →) SCALE / SHAKE / FLASHES / HITBOX reach the renderer live (`window.__shmupDebug.renderer`),
  Back writes them to `display` in `shmup-cup:save.v1`, and the next boot applies them before the
  first frame (`stretch` fills the 1000×600 canvas, the markers on the ship); without a save the
  frame is letterboxed and no marker shows.
- `render-profile.spec.ts` (M3-02c) — the three render-profile figures in a real WebGL context on
  the web test build: `PixiRenderer.structureRebuilds` rises with the frames rendered (the review's
  **F1** on a real browser), a filtered layer pools a 512 × 256 render target (`createRenderTargetMeter`
  over Pixi's `TexturePool` — the review's **F3**), and `?gl=2` really obtains a WebGL2 context while
  the default boot stays on WebGL1 (**F8**).
- `frame-advance.ts` (M1-19) — `freezeSim(page)` and `stepTo(page, tick)`: specs that compare two
  captures a set number of ticks apart freeze the sim and run exact ticks, because under load the
  frame loop runs 1–4 ticks per rAF frame. Playwright runs every test in parallel on one browser
  per five cores, at least two (`E2E_WORKERS` overrides; SwiftShader is itself multi-threaded —
  [build-test-deploy.md](build-test-deploy.md#test-concurrency)).

Chromium flags (why each exists is in the config's docblock): `--use-angle=swiftshader
--enable-unsafe-swiftshader` (software WebGL), `--allow-file-access-from-files` (see
gotchas), `--autoplay-policy=no-user-gesture-required` (like the TV). The browser gets the
environment without `DISPLAY`. Artifacts go to `test/e2e/test-results/` (git- and
Prettier-ignored). CI runs the suite as its own `e2e` job. Unit tests stay in Node: Pixi
display objects need no GPU, so atlas, bindings, quad pools, text and the renderer (with
`WebGLRenderer` faked) are all tested headless.

## Measuring render performance (M3-02c)

Until M3-02c nothing in the repo measured `renderer.render()` (the render review's **F10**):
`pnpm bench` drove the *simulation* and the only render-cost assertions were the two e2e specs'
`DRAW_CALL_BUDGET` (12 then, 16 since M3-02e's render groups). There are now two instruments — one headless gate and one on-device
readout — and they answer different questions.

### The headless gate: `pnpm bench` → `test/bench/render.perf.ts`

```sh
pnpm exec playwright install --with-deps chromium      # once per machine (CI's bench job too)
pnpm bench                                             # every bench, the render one included
npx vitest run --config test/bench/vitest.config.ts render.perf.ts   # only the render bench
```

It builds `test/bench/render-harness/` with Vite (the repo's own `shmupContent()` /
`shmupAssets()` plugins, so the shipped content and the real atlas go in), serves it on an
ephemeral port and drives it in Playwright's Chromium with SwiftShader. The harness is four files,
and only one of them touches the browser:

| File | What it is |
|---|---|
| `main.ts` | The page: builds the renderer, the game and the atlas, runs the measured frames, posts the result on `window.__shmupRenderBench`. Browser plumbing only |
| `load.ts` | The **scripted worst-case load** — the tick order, the pool top-ups, `WARMUP_TICKS`, the per-frame `LoadFloor`. No DOM, no Pixi |
| `bench-gates.ts` | The budgets (`DRAW_CALL_BUDGET`, `RENDER_P95_BUDGET_MS`, `HEAP_BUDGET`, `MIN_LIVE_LOAD`) and `renderBenchViolations(result)` |
| `protocol.ts` | `RenderBenchOptions` / `RenderBenchResult` / `RenderBenchApi` — the wire types the Node driver and the page agree on |

The last three are DOM-free on purpose: `test/integration/render-bench.test.ts` drives them in Node,
against the real simulation and the shipped content, as part of the ordinary `pnpm test`. That is
where the load's order is pinned (the wrong orders are asserted to fail, with the gate's own
message), because the load is the one part of a benchmark that can be wrong **silently**.

The page puts the **real**
renderer in front of the **real** simulation: `createGame` on the shipped content, a bomber's
screen clear turning the live bullets into point items on every tick that freed an item slot, the
bullet pool topped back to 512 *after* each step (a cancelled bullet only frees its slot in the
step's removal phase), the particle pool kept full, and the frame drawn through the same two
passes the TV runs. Each scenario gets its own page, because Pixi's `TexturePool` is a global that
never gives a texture back — one page, one pooled-render-target total.

The harness reports the **smallest** live count any measured frame carried, and each scenario
asserts those floors, so a scenario cannot claim a load one frame in six hundred happened to
reach. Today every measured frame holds 512 of 512 bullets, ≥ 489 of 512 point items (the ~20
missing are the items that reached the score during that tick) and ≥ 489 of 512 particles.

The bench's particle pool is **512** per blend mode (`BENCH_PARTICLE_CAPACITY` in `load.ts`), twice
the shipped `PARTICLE_CAPACITY` of 256: a worst case, and a gate stricter than reality cannot be
beaten by a device that draws fewer sprites. So do not line the bench's `512` up with the debug
overlay's on-device `PRT n/256` — the overlay is not reporting half the particles, it is reporting
all of a smaller pool.

#### What this bench can and cannot tell you

It runs in **SwiftShader**, Chromium's software rasteriser, on whatever machine happens to run it —
a shared CI runner as often as not. That decides what its output is worth:

| Transfers to the M7 | Does **not** transfer |
|---|---|
| **Draw calls** — a property of our scene graph and Pixi's batcher, identical on any GL implementation | **Absolute milliseconds.** Software WebGL is one to two orders slower than a Mali-G51 at some things and *faster* at others (no bus, no tiler); a p95 of 2.4 ms here predicts nothing about the TV |
| **Pooled render-target bytes** — Pixi's power-of-two rounding is the same everywhere, and so is the VRAM it costs | **Fill-rate conclusions.** A tiler's cost model for a second full-screen pass is not SwiftShader's |
| **Structure rebuilds** — a pure scene-graph property (the review's F1) | **Frame-rate verdicts.** The bench never claims 60 fps; only the overlay on the monitors can |
| **Heap delta** — JS allocation is V8's, not the GPU's | |
| **Relative comparisons** between scenarios on one run (CRT off vs light vs full; the shipped frame vs ×2 of it — 640×360 vs 1280×720 today) | Comparisons **across machines or across runs on different machines** |

So: M3-02d and M3-02e are judged against the *counted quantities* and the *relative* comparisons
this step recorded, and the millisecond columns exist to catch a path that became structurally more
expensive — `RENDER_P95_BUDGET_MS = 16` is deliberately loose for exactly that reason. The numbers
that decide whether the game holds 60 fps come from the overlay on the monitors
([Measuring on the TV](#measuring-on-the-tv)) and land in
[input-probe-results.md](input-probe-results.md#11-render-profile-m3-02c).

#### What each run prints

| What it reports | Why |
|---|---|
| **render-ms p50 / p95 / max** | CPU time inside `renderer.render()`. Under SwiftShader, so it is a *regression* gate (`RENDER_P95_BUDGET_MS`), never a prediction of the Mali-G51 |
| **draw calls** | Hardware-independent — the strict gate (`DRAW_CALL_BUDGET`; `shmup_feat.md` §22 allows 20–50) |
| **pooled render-target bytes** + the frame target | Every filter pass costs a power-of-two-rounded target (review **F3**): 1024×512 for today's 640×360 pass, as 512×256 was for the 384×216 pass F3 reviewed. Since **M3-02d** the CRT and the Mode-7 floor pool nothing (they are meshes); only `screenPass: 'filter'` still pools one the size of the canvas |
| **scene rebuilds**, and **render-group rebuilds** beside them | Frames on which Pixi threw the *scene's* instruction set away and re-walked it (review **F1**), and the same flag counted over every render group of the scene. Since **M3-02e** the first is 0 and the second says where that churn went — a layer group at a time — so the first cannot fall by the work merely moving out of sight |
| **JS-heap delta over 600 frames** | The gate **F5** needs: the Node allocation guards stop at the `renderer.render()` boundary and cannot see Pixi's batch-buffer growth or its lazy per-sprite allocation. A deliberately leaky fixture in the same file proves the gate really fails |

The **internal frame size is a scenario parameter** (review §7.5): one scenario runs the
layer-effect load at ×2 of the shipped frame — since R1-02 `2·FRAME_W` × `2·FRAME_H`, so 1280×720
since R2-01's flip (v1: 768×432, the first integer step of 384×216), its pooled filter target
2048×1024 = 8,192 KB, the floor `render.perf.ts` asserts — so "what would a higher internal
resolution cost?" is a bench run rather than a build-and-hope; the other scenarios default to
`FRAME_W` × `FRAME_H`. What it shows
today: the pooled filter target goes 2,048 KB → 8,192 KB and the frame render texture 900 KB →
3,600 KB, exactly the ×4 of §7.3's table (the pre-flip step was 512 KB → 2,048 KB and 324 KB →
1,296 KB).

What the first runs measured (headless, so read the shape, not the milliseconds): **655–659 of 660
frames rebuilt the scene's instruction set** — F1's mechanism confirmed against a real browser,
not just against Pixi's source — and CRT `light` costs what CRT `full` costs and pools the same
target, which is F2's claim exactly.

**The render-group A/B (M3-02e).** One scenario runs the baseline worst-case frame with
`renderGroups: false`, which builds the pre-M3-02e scene: one render group for all ~6,400 display
objects. Running both in the same session, against the same load and the same GPU, is the review's
measurement **M1** done headlessly — and it is the only honest way to show what the change bought,
because a p95 compared across runs on a shared machine is noise. It reads **0 vs 659 of 660 scene
rebuilds, 9 vs 4 draw calls, and 0.65–0.94× the p95** — 0.92–0.94× over the step's own three runs,
0.85× in the docs run and 0.65× in the review's, which is the spread of the figure on a shared
machine. Treat that last figure with the caution
this section already asks for: SwiftShader charges CPU time for the extra draw calls while making
the tree walk cheap on a desktop core, and the M7's Cortex-A55 pays the opposite way round, so the
counted 659 → 0 is the result that transfers.

Since **R0-02** every scenario renders to a **1280×720** display (`DISPLAY_WIDTH` / `DISPLAY_HEIGHT`
in `render.perf.ts`; it was 960×540, which v2's 640×360 frame does not divide), and the file has a
second suite: the TV render bench's scenes, below.

### The TV render bench (R0-02)

The M3-02c harness is an ES-module page driven by Playwright and never built for Tizen, and at any
size other than 384×216 it priced filter targets, not a denser scene. So v2's resolution question
(plan_resolution.md R0-02, §13) has its own instrument: **a second Tizen widget**,
`ShmpCupBnc.RenderBench`, built from `apps/tizen` (`pnpm bench:tv` → `apps/tizen/dist-bench/`; a
build-only webOS stub too). How to build, package and run it on the monitors:
[build-test-deploy.md](build-test-deploy.md#the-tv-render-bench-r0-02).

- **What it draws** (`apps/tizen/src/bench/scene.ts`): no simulation — a synthetic scene through
  the real renderer's bindings at each internal size with a **density** `s`. R0-02 measured three
  sizes (384×216 at `s` = 1, 640×360 at 1.5, 960×540 at 2.25); the owner's R0-03 follow-up grew
  the matrix to **172 scenarios, one per page load**: fifteen internal resolutions in **two
  art-density modes** — `scaled` (the art upscaled ×s with `s = height / 240`, the same world at
  higher density — R0-02's two v2 rows unchanged) and `native` (the art at its original size, a
  bigger frame showing more world) — with no `scaled` row for the four resolutions at `s ≥ 3`
  (the modelled atlas would need more than two re-packed 2048² pages, more texture than the M7
  could carry), 384×216's two modes collapsed into one row, six variants per size (busy, a
  filtered layer, Mode-7, CRT light, CRT full, all at once — 25 sizes × 6 = 150 rows), and 22
  **knob** rows on top (the `fit` / `stretch` upscale modes, render interpolation, an output
  resolution below the display's, each at a few representative sizes). The ids R0-02 and R0-03
  recorded — `384x216`, `640x360`, `960x540` — are byte-identical through the growth, so the
  sessions under `tools/input-probe/results/` stay comparable row for row. The atlas is upscaled
  ×`s` at build time (`scripts/bench-atlas.mjs`; `ceil(s² / 4)` pages of 2048² by the plan's area
  model — 1 / 1 / 2 at R0-02's three sizes — since R1-05 from the **ungrouped** source atlas, and
  since R2-01 W4-6 at `artScale: 1` (`buildAtlas({ ungrouped: true, artScale: 1 })`) so the bench
  draws v1-scale art for good — the old one-page layout byte for byte, so R0-02's figures stay
  comparable), and the load is v2's layer stack: five parallax layers (two full-frame, three
  partial with alpha), ~35 % terrain at `8·s`-px tiles, decor, 64 enemies, 512 bullets, 512 point
  items, 512 particles, the ship with four Options and 32 shots, the HUD bars.
- **What it measures** (`stats.ts`, allocation-free): `renderer.render()` CPU ms (p50 / p95), the
  same with `gl.finish()` after each render (the synced pass — WebGL is asynchronous, so fill cost
  otherwise only shows as late frames), the rAF-delta buckets of the M7 (12 / 15 / 17 / 19 / 21 / 25
  / 33 ms) and the share of two-tick frames, draw calls, render-target, frame-target and texture
  bytes, atlas pages and the coarse JS heap. One scenario per page load (Pixi's `TexturePool` never
  shrinks): 10 s warm-up, 14 s free-running, 6 s synced, then `location.reload()`.
- **Where the numbers go:** an on-screen table in the bitmap font after the run, a `render-bench`
  payload per scenario POSTed with `@shmup/shell`'s `sendRenderBench` to the input probe's log
  server ([input-probe.md](input-probe.md)), and `localStorage`. `tools/input-probe/results/analyze-bench.mjs`
  prints every scenario **relative to the same session's 384×216** (the M7's rAF shows a p95 near
  30 ms with nothing running, so absolute times mislead), applies §13's verdict rules and compares a
  WebGL 1 with a WebGL 2 session.
- **The decode scenario** (R1-05 B4, decision W3-6 — `apps/tizen/src/bench/decode.ts`): after the
  matrix a run loads the page a **173rd time** (`DECODE_SCENARIO_INDEX` 172, `BENCH_RUN_LENGTH`
  174; `BENCH_SCENARIOS` stays the 172-row matrix and the labels read `n/174`) to measure what an
  atlas page costs from file to GPU, on the game's own paths. The pages changed with R3-04.M4a
  (decisions RR-8 / W5-17): the bench build no longer ships a synthetic 2048² pair — it ships
  **the stand-in zone A's own PNG-8 pages** (`standin-zone-a`, plus `standin-zone-a-2` when the
  group needs two; `scripts/bench-decode.mjs` packs them through the real pipeline into the RR-7
  byte band, 0.3–0.6 MB per 2048×1024 — the band v2 zone pages will ship in) **and the shipped
  `common` and zone A pages** for reference (`DECODE_PAGE_IDS`; into `dist-bench/assets/atlas/
  decode-<id>.png`, so the bundle check's page rules cover them). The shipped two are the
  interim ×1.5 pages since R2-01's flip (`common` is 1024², the zone pages 256 wide), so their
  decode rows are not like-for-like across the flip; the stand-in pages, new with M4a, start
  their own series. (`decodeArtImage` stays exported — the bench's own tests use it; no bench
  build ships a synthetic page any more.) Each repetition (8 on the TV, 2 headless, `?reps=`
  1–50) times the stages apart: the **fetch** by XHR (audio-web `loadArrayBuffer`, the request
  the game fetches its manifest with — `file://`, status 0), the **decode** by an
  `HTMLImageElement` from a **blob URL** with a guarded `decode()` (the game's decoder; a second
  load of the file URL would be a memory-cache hit), and the **upload** through `createAtlas` and
  `uploadTextureSource`, as CPU time and again with `gl.finish()`. For comparison it also decodes
  with **`createImageBitmap`** (Chromium 50+, feature-detected; the game does not use it) and
  uploads that — headless, the RGBA image upload took about 5× the bitmap's, which suggests
  `texImage2D(HTMLImageElement)` converts the image again; the M7 run settles it. Every texture,
  blob URL and bitmap is released between repetitions, and every stage times out after 30 s. If
  the XHR fails (the unverified `file://` case) the page is decoded from its URL instead and its
  `error` says so. The results: a `DECODE (R1-05)` table under the matrix table (median / p95 per
  stage, the first — coldest — total, the bitmap path), a `decode` field (`DecodeBenchRecord`) in
  the run's last `render-bench` payload (which now carries the run's `done`), and
  `analyze-bench.mjs`' "Decode and upload" section ending in plan R3-04's zone-load estimate
  (decision W5-19, ≤ 2 s per zone load): a run that carries a stand-in record is estimated from
  the **measured pages** — `common` plus the stand-in zone's own pages, each at its own median,
  no ×2 — and only the older sessions fall back to the synthetic basis (`common` + two 2048²
  pages against 2 s, conservative, since `common` stays resident across a zone change).
- **The stand-in load** (R3-04.M4a — `STANDIN_SCENARIO_ID` `standin-zone`, the run's **last** page
  load at index 173): after the decode scenario the widget draws one 640×360 frame of the stand-in
  zone through the real bindings, from exactly those decoded pages. The headless twin
  `?scenario=standin-zone` gates the same frame (R3-04.M4b: `standinBenchViolations` — counts and
  the ordinary budgets, never milliseconds raised), so the on-screen table and the gate agree. The
  analyzer prints the row on its own line, excluded from the campaign aggregation. Red after a
  whole run re-runs this last load (the cursor lands on 173), so a red there is the stand-in
  load, not the matrix.
- **Headless:** `pnpm bench` builds the widget exactly as `bench:tv` does and opens each scenario
  with `?scenario=<id>` on the 1280×720 display, gating **counts only** — `tvBenchViolations` in
  `render-harness/bench-gates.ts`: the full load on every frame, draw calls within `DRAW_CALL_BUDGET`, no
  pooled render target without a filtered layer and exactly the frame's power-of-two target with
  one, the density's atlas pages, the heap. Its milliseconds are SwiftShader's and are only printed.
  Since R1-05 it also opens `?scenario=decode&reps=2` and checks that every page's stages are
  finite and its bytes equal the emitted files, and since R3-04.M4b the `standin-zone` scenario
  with its own gate.

### The on-device readout: the debug overlay

A `build:dev` bundle, the debug tools unlocked (web: F1; TV: **Pause, Ch+, Ch+, Ch+**), and the
overlay's panel shows the two figures M3-02c added on its sixth line:

| Figure | Meaning |
|---|---|
| `REB` | Frames since boot on which Pixi rebuilt the scene's whole instruction set (`PixiRenderer.structureRebuilds`). Since **M3-02e** the high-churn layers are their own render groups, so this should sit at **0** or very near it; a figure that tracks the frame count means every frame pays the full tree walk again — the review's **F1** — because something outside those groups is toggling `visible`. **Read the rate, not the total, and read it against the panel:** the `DEBUG` layer is deliberately not a render group, so the panel's own text quads push `REB` up whenever a printed number changes width — measured in headless Chromium at 6 % of frames on an idle machine and 49 % on a loaded one, with the same run at 0 % once `DEBUG` is grouped (`test/e2e/render-groups.spec.ts`). So the figure to trust is the one the *rest* of the scene produces: watch it climb over a few seconds with the panel hidden (it must barely move), and treat the panel-on rate as the overlay's own cost. **That is not the catch-22 it looks like**, because the overlay is not the only reader: `createDebugTools` refreshes `stats.structureRebuilds` in `beforeRender()` and calls `telemetry.commitFrame()` in `afterRender()` **unconditionally** (`packages/shell/src/debug/index.ts`) — neither is gated on `flags.overlay`, and M3-02f's checklist panel is a plain DOM `<div>`, not a Pixi container. So on a capture build the owner hides the panel (debug key **1**) and still gets the per-window `REB` in the JSONL and in `analyze-render.mjs`'s tables. `overlay.update` skips `buildDebugPanel` entirely while the panel is hidden, so the churn really is gone rather than merely invisible. (The bench's companion figure, `groupRebuilds`, is deliberately **not** on the overlay: one number the owner has to read while playing.) |
| `RT` | Kilobytes of pooled render targets (`createRenderTargetMeter` over Pixi's `TexturePool`, seeded with what the pool already holds when it starts — M3-02d's warm-up draws every filter before the debug tools exist). Since **M3-02d** the CRT and the Mode-7 floor add nothing to it (review **F2** / **F6**; before the fold, CRT on jumped it by ~16 MB at 1080p); a stage with a layer effect still pools ~512 KB |

Both obey the overlay's own rules: one `DrawList` per colour, and allocation-free per frame (the
meter hooks `TexturePool.createTexture` once, so reading the total is a property read).

### Measuring on the TV

The measurement table of the review's §4, in the order to run it, with enough detail to follow without
guessing. The numbers land in
[input-probe-results.md](input-probe-results.md#11-render-profile-m3-02c) next to the input probe's.

> **Do this with the guided capture** ([below](#6-automated-capture-the-guided-checklist), plan
> **M3-02f**): the game streams its own render profile to a log server on the desktop, an on-screen
> checklist tells you where to fly, and an analyzer prints the §11 tables. It records **true p95s**
> — pooled over every frame of a row, the same statistic `pnpm bench` reports (the same statistic,
> not a comparable magnitude — [SwiftShader](#what-this-bench-can-and-cannot-tell-you)), and
> something nobody can read off a moving overlay. Everything from here to §5 is then the recipe the checklist walks
> you through — and the fallback for when no log server is reachable.

#### 0. Before you start

1. **Build a dev bundle.** `pnpm --filter @shmup/tizen build:dev`. Only a dev build has the debug
   tools — the release bundle folds them away, so the overlay cannot be unlocked on it at all.
   For the guided capture, start `npm run log-server` in `tools/input-probe/` first and build with
   `VITE_REPORT_URL=http://<desktop-ip>:8787` set — see §6.
2. **Install it** on both monitors from the Windows desktop, per
   [install-on-tv.md](../client/install-on-tv.md). Nothing here needs the Tizen CLI on this machine.
3. **Unlock the tools:** on the remote press **Play/Pause, Ch+, Ch+, Ch+** — all four **within 3
   seconds**. The overlay appears. If nothing happens you were too slow, or it is a release build.
4. **On a set you have not measured before**, open the remote Web Inspector once and check
   `gl.getExtension('OES_element_index_uint')` is not `null`. Since M3-02d pass 2 and the Mode-7
   floor are Pixi meshes and `MeshGeometry` forces 32-bit indices, so a context without that
   extension shows a black picture rather than a picture without effects. The M7's Mali-G51 has it;
   this is a five-second check that rules out the one new hardware dependency.
5. **Debug keys**, once unlocked (the remote's number keys; F1–F8 on a keyboard):

   | Key | Does | Useful here for |
   |---|---|---|
   | **1** | Toggle the overlay | Getting a clean photo of the frame graph |
   | **2** | God mode | **Essential** — lets you fly the same section repeatedly without dying |
   | **3** | Hitbox outlines | Leave off while measuring; it adds draw work |
   | **4** / **5** | Frame advance / step | Freezing on a specific frame |
   | **6** | Slow motion | Leave off while measuring; it changes the tick pacing |
   | **7** | Next checkpoint | Skipping forward to the section you want |
   | **8** | Skip to boss | Getting to a dense frame quickly |

#### 1. What "fly the same section" means

Several measurements are A/B comparisons — the same scene rendered twice with one thing changed. A
fresh game is *not* a repeatable scene: a different route, a different power-up state and a different
number of bullets on screen change the load far more than the thing you are trying to measure.

**Use PRACTICE instead.** Title screen → **PRACTICE** → pick **ZONE**, **CHECKPOINT** and **LOADOUT**.
That re-enters the identical section of the identical stage every time. Then:

- Turn **god mode on (key 2)** so a death cannot cut a run short or change the scene.
- Pick the **same loadout** for every run of a comparison — weapons change the bullet count, which
  changes the load.
- Fly the **same stretch** — start at the checkpoint, fly for ~30 seconds, and read the numbers at
  the same on-screen landmark each time (a particular enemy wave or piece of terrain).
- **Hold the same inputs.** Firing constantly versus not firing is a large change in sprite count.
  Simplest repeatable policy: hold fire down the whole time and move as little as possible.
- Do the runs **back to back**, not on different days — a cold boot has different cache and shader
  state (that is what M3/M4 measure deliberately).

For the baseline in step 3 the point is coverage rather than repeatability, so a normal game is fine
there.

#### 2. Reading the overlay

Lines, top to bottom (counting from 1):

| Line | Shows | What it means |
|---|---|---|
| 1 | `FPS` `TICK` `RENDER` `DRAW` | Frames a second; simulation ms a tick; **`renderer.render()` ms**; draw calls |
| 2 | `BUL` … `PRT` | Live bullets and particles — your check that the scene is as loaded as you think |
| 4 | `WEBGL` | Which context the renderer actually got (1 or 2) |
| 5 | alerts | `GOD` `HITBOX` `GRID` `STEP` `SLOW` `LOCK` — `LOCK` means M3-02b's vsync lock is engaged |
| 6 | `TPF` `RAF` | Ticks per frame (0/1/2/3+) and the rAF-delta histogram (buckets 12/15/17/19/21/25/33 ms) |
| 7 | `REB` `RT` | **Frames that rebuilt the whole scene graph** (review F1) and **pooled render-target bytes** (F2/F3) |
| 8 | device line | Model, resolution, GPU (M2-17) |

`RENDER`, `REB` and `RT` are the three this exercise is really about.

> **`REB` is the one figure the panel cannot report about itself.** The panel's own text quads live
> on `DEBUG`, which is deliberately not a render group, so a printed number changing width rebuilds
> the scene's group — at a rate that depends on the machine's load, not on the renderer. Read `REB`
> **with the panel hidden (key 1)**, from the guided capture's per-window figure; the capture is not
> gated on the panel being visible. Photograph the rest of the line with the panel up as usual.

#### 3. Baseline first — it is the control for everything else

1. Title screen idle, then zone A, then the boss. For each, record `FPS`, `TICK`, `RENDER`, `DRAW`,
   `REB` and `RT`, and photograph the frame graph and the `RAF` histogram.
2. Confirm **`TPF` reads overwhelmingly `1`** and the **`LOCK`** alert is showing. If `TPF` shows a
   real share of 0s and 2s, M3-02b's vsync lock is not engaging — check the refresh probe is landing
   inside 55–65 Hz. This is worth catching before anything else, because every other number is
   measured through the frame loop.
3. Note **boot ms** against the 10 s store budget.

#### 4. The measurement table

| # | Question | How | What a result looks like |
|---|---|---|---|
| **M1** | What did fixing the per-frame scene rebuild (**F1**) buy on the Mali-G51? | **Read `REB` from the telemetry with the panel hidden** — press **1** after unlocking and fly; a panel-on reading measures the overlay's own churn and varies by machine (6 % of frames idle, 49 % loaded), while the capture records the figure every frame whether the panel is shown or not. Then compare `RENDER` over the same practice section with the **previous** build (anything before `f18c7de`), which is the only way left to price the rebuild on hardware: the shipped build no longer does it, and `renderGroups: false` is a bench-only option that no TV bundle exposes | `REB` ≈ **0** — the headless bench went 655–659 of every 660 frames rebuilding to **0 of 660**, and the counted result is what transfers. The milliseconds are what is still unknown: under SwiftShader the grouped scene reads 0.92–0.94× the old one's p95, but that machine makes the tree walk cheap and charges for the extra draw calls, and the Cortex-A55 / Mali-G51 pays the opposite way round. **This measurement, not the bench, is the hardware verdict.** `DRAW` rising from 2–4 to about 7–10 is the deliberate price (one batch boundary per render group) |
| **M2** | What does the CRT look (**F2**) cost after M3-02d? | Pause → **OPTIONS → DISPLAY → CRT**, Left/Right to switch **OFF / LIGHT / FULL**. Run the same practice section three times, once per setting, reading `RENDER`, `FPS` and `RT` each time | Expect all three to read the same `RENDER` within a few per cent and **`RT` not to move at all**: M3-02d made the CRT the pass-2 blit's own shader, and the headless bench measured 4 draw calls and 0 pooled bytes for `off`, `light` and `full` alike. A jump in `RT`, or `full` visibly dearer than `off`, means the fold regressed. There should be **no** stall the first time CRT goes on either — the boot warm-up linked that program (**F4**) |
| **M3** | Mode-7 and layer-effect entry hitches (**F4**) | Play into the Mode-7 stage and the water / heat-haze stage and watch the frame graph at the moment the effect starts | Since M3-02d's boot warm-up the graph should stay **flat** at the range boundary. A single ~30–50 ms bar there is worth reporting (the warm-up missed that program); one on every entry means something else is wrong |
| **M4** | The batch-growth hitch (**F5**) | Frame graph during the first very dense pattern after a **fresh launch**, then the same pattern again after a checkpoint restart | M3-02d's warm-up draws every pooled sprite once, so the buffer should already be at its high-water mark and **both** runs clean. A red bar on the first one only is Pixi's attribute buffer still doubling — report it |
| **M5** | WebGL1 vs WebGL2 (**F8**) | Set `localStorage['shmup-cup:gl'] = '2'` from the remote Web Inspector and relaunch (on the web build it is `?gl=2`). Compare `RENDER` and the `RAF` histogram over 60 s of the same practice section; the `WEBGL` field shows what the context really is | Probably little difference. **WebGL1 stays the shipped default** — this is an A/B to retire a guess in the code, not a change |
| **M6** | Memory | DevTools over `sdb` → Memory, plus `estimateStageMemory(...)` per zone with CRT on and off, cross-checked against `RT` | M3-02d corrected the estimator (review **F3**: power-of-two pooling, and the CRT no longer pooling anything), so the three should now agree — a zone's figure that is still well over the DevTools reading is worth reporting |
| **M7** | Does the app stop rendering under the Home overlay? | Press **Home** mid-game, wait 10 s, come back | The probe recorded rAF continuing at ~56 fps with no `visibilitychange`. Confirm M3-02b's `blur` handling now pauses the game and silences the music, and that you come back to the pause menu |
| **M8** | Input-to-photon latency | Still unmeasured: a 240 fps phone video, `build:game-mode` versus the default, per plan §8.4/§8.5 | The one number none of this instrumentation can reach |

#### 5. Recording the numbers

Fill the tables in
[input-probe-results.md §11](input-probe-results.md#11-render-profile-m3-02c), one column per monitor.
Where a figure is a range over a run, record the range — a single glanced number hides exactly the
jitter these measurements exist to find.

#### 6. Automated capture: the guided checklist

Since **M3-02f** the game records all of the above itself. Reading numbers off a moving overlay is
error-prone and cannot capture a p95 at all; this captures distributions and hands you the tables.
It reuses the input probe's receiver, so one log server serves both senders.

**Run it (Windows desktop, cmd.exe):**

```bat
cd tools\input-probe
npm install
npm run log-server
```

It prints the lines to build with, e.g. `VITE_REPORT_URL=http://10.0.0.2:8787`. Windows will ask to
allow Node through the firewall on the **private** network — say yes (the probe's run needed the
same). Then, in a second window:

```bat
set VITE_REPORT_URL=http://10.0.0.2:8787
pnpm --filter @shmup/tizen build:dev
set TIZEN_PROFILE=shmupcup
set TV_IP=<monitor ip>
pnpm --filter @shmup/tizen tizen:package
pnpm --filter @shmup/tizen tizen:install
pnpm --filter @shmup/tizen tizen:run
```

Do it once per monitor; each launch is its own session (`rp-…`) and its own JSONL file. The internet
privilege the POST needs is already in `apps/tizen/public/config.xml`. On the desktop browser the same
variable works with `pnpm dev`.

**On the monitor:** unlock the tools (**Play/Pause, Ch+, Ch+, Ch+**) and a small panel appears in the
top-right corner with the checklist. Play where it tells you; each line ticks itself when enough of the
right windows have arrived, and a tick never goes back:

| Item | What it asks for | Ticks at |
|---|---|---|
| **M1** | Baseline: the title, then a dense scene (key 8 → the boss) | 30 s of each |
| **M2** | OPTIONS → DISPLAY → CRT **OFF / LIGHT / FULL**, the same practice section each time | 20 s per setting |
| **M3** | Fly in three different stages, including the Mode-7 one and the heat-haze one | 10 s in each of three |
| **M4** | A dense pattern now, and the same one again after a checkpoint restart | 5 s of each, the second past the two-minute mark |
| **M5** | 60 s in one stage (repeat the whole session with `localStorage['shmup-cup:gl'] = '2'` for the A/B) | 60 s in one stage |
| **M6** | Two zones, each with CRT on and with CRT off | two zones seen |
| **M7** | Press **Home**, wait 10 s, come back | the return |
| **M8** | The 240 fps latency video — **manual**, nothing on the device can measure it | never (shown as `[-]`) |

The bottom line of the panel shows the last window (`fps`, `RENDER p95`) and the sender (`sent #N ·
queued N · fails N`). `queued` climbing and `fails` rising means the monitor cannot reach the
desktop — check the firewall and the IP.

**What a window carries.** Every ~3 s the capture closes a window and POSTs it: `min / median / p95 /
max` of the frame, tick and render times and of the draw calls, a **quantized histogram of each of
those four series**, the `TPF` and `RAF` bucket counts, the structure rebuilds **of that window** and
the pooled render-target total, plus the context that makes the row mean something (build id, device
line — re-read every window, since the M2-17 line only arrives after boot —, scene, stage and zone,
camera, CRT setting, aspect, scale, GL version, viewport and the assists that were on). Because the capture hangs off `createDebugTools`'
`beforeRender` / `afterRender` and not off the overlay's visibility, every one of those figures —
`REB` included — is recorded with the panel hidden, which is the only way to read `REB` without the
panel's own quads in it. It also
records `sendInFlightFrames` — the frames the POST itself was still outstanding during. That matters:
the request runs on the main thread, so a window it spans may have recorded the sender as a render
cost. The analyzer leaves those windows out by default.

**Why the histograms.** A row of the §11 tables spans many windows and is not homogeneous. Folding
the windows' own p95s (taking their median, say) would throw away the worse half of the windows and
understate the tail — the one direction that matters against a frame budget. Summing the histograms
of a row's windows and reading the percentile off the total gives the percentile of *that row's
frames*, which is what `pnpm bench` reports too, so the on-device numbers and §11.3's headless ones
are the same statistic — the same *statistic*, not a comparable *magnitude*, because the bench runs
under SwiftShader ([above](#what-this-bench-can-and-cannot-tell-you)): what transfers from it is its
counted quantities and its in-run ratios, never its milliseconds.

**So what may be compared with what.** A captured row's **counted quantities** — `DRAW`, `REB`, `RT`
and the heap delta — are the same things counted the same way as the bench's, and may be compared
with §11.3 directly; a regression in any of them shows up in both places. A captured row's
**milliseconds** are only ever comparable with *other rows captured on a monitor*: CRT `off` against
`full` over the same practice section, WebGL 1 against WebGL 2, monitor A against monitor B, this
build against the last one. Those A/Bs are what the §4 table is made of, and they are exactly the
comparisons the capture is good at — both sides measured through the same GPU, the same driver and
the same frame loop.

The histograms cost the frame path nothing: they are folded out of the
already-recorded per-frame series when the window closes, on the report timer. Steps are 0.05 ms for
tick and render times, 0.25 ms for frame times and 1 for draw calls; a window whose values are
unusually spread has its step doubled until it fits 48 buckets, which also bounds a payload's size.

**Turn the session into the tables:**

```sh
cd tools/input-probe
node results/analyze-render.mjs logs/rp-<session>.jsonl            # the two §11 tables
node results/analyze-render.mjs logs/rp-<session>.jsonl --windows  # + every window
node results/analyze-render.mjs logs/rp-<session>.jsonl --all      # keep the perturbed windows
```

It prints §11.1 and §11.2 as Markdown — paste them into
[input-probe-results.md](input-probe-results.md#11-render-profile-m3-02c), one run per monitor, and copy
the JSONL into `tools/input-probe/results/<date>-<hardware>/` as evidence (`logs/` is git-ignored).

**When there is no log server** — no desktop on the network, or a build without `VITE_REPORT_URL` —
nothing of the capture runs at all (no timer, no panel, no request) and the manual procedure of §1–§5
above is the way. M8 is manual either way.

**How it stays out of the release bundle.** The capture lives behind the same `__SHMUP_DEV__ ? … :
null` gate as the rest of the debug tools, and its endpoint comes from `__SHMUP_REPORT_URL__`, which
`shmupBuildInfo()` defines as `''` for anything but a dev / test build.
`apps/tizen/test/build/tizen-build.test.ts` asserts `dist/app.js` holds none of it.

## Extending it

### Drawing a new entity kind

1. Give the system a batch: an SoA pool whose fields back a `SpriteBatchView`, or a
   `createSpriteBatch(LayerId.X, capacity)` mirror filled with `pushSprite` at the end of the
   tick.
2. Add it to the `WorldView.batches` array the World builds (order within a layer = draw
   order).
3. Nothing in the renderer changes — it binds a sprite binding per batch.

### Drawing HUD or menu content

The HUD is core `ui`'s `buildHud`; menus and screens are scenes drawing core `ui` widgets into
the flow's UI list ([scenes-and-ui.md](scenes-and-ui.md#extending-it)). Put changing strings into
slots with `setString` only when they change; draw numbers with `number`. Keep each list
within its capacity (256 commands by default) and the quads per layer within 1024 (a glyph
is one quad).

### Handling a sim event in the host

Register at load: `shell.events.on(SimEventKind.Shake, (event) => shake.add(event.param))`.
Copy the fields you need; the record is reused.

### A new content kind owned outside core

Write its validator as a `ContentOwner` (`(files) => ValidationIssue[]`) in the owning
package and either add it to `DEFAULT_CONTENT_OWNERS` in `shell/loader` (every host then
validates it) or pass it to `bootShell({ contentOwners: { '<kind>': owner } })` from both apps.
An app that needs the parsed result passes a closure that keeps it (see
`createInputProfileRegistry().load`).

### A new draw layer

Append to `LayerId`, `LAYER_NAMES` and `LAYER_COUNT` in the order the spec requires (the
code is the draw order); the layer stack picks it up. A new *world* layer must sit below
`Hud`, which also moves `WORLD_LAYER_COUNT` — check every hard-coded layer code.

## Tests

| Where | Covers |
|---|---|
| `packages/core/test/presentation/` | `createSpriteBatch` / `pushSprite` bounds, `DrawList` encoding of every op, rounding, clamps, string slots and `revision`, `dropped`, layer tables |
| `packages/render-pixi/test/atlas/` | Frame numbering, sprite / flash tables, `ui/missing` fallback and warn-once, stale / oversized / corrupt manifests |
| `packages/render-pixi/test/sprites/`, `ui/`, `text/`, `layers/` | Binding sync (camera, `PLAYFIELD_Y`, anchors, flips, blink, flash, shrinking batches), quad-pool ordering and overflow, draw-list views (revision skipping, hidden sprites), text layout and metrics, number formatting, layer order |
| `packages/render-pixi/test/layers/layers-stage*.test.ts` | Terrain grid size (one column / row more than the playfield in tiles — 55 × 29 at 12-px tiles, 81 × 43 for the 8-px fixtures, capped at the map's rows), textures and positions, the ring (nothing re-textured inside a tile, one column / row per tile edge, all after a jump or new tables; after a long random camera walk it equals a freshly built grid), pixel agreement with the sprite bindings at half-pixel cameras, parallax coverage for any offset / spacing, validation, allocation-free syncs |
| `packages/render-pixi/test/layers/layers-decor.test.ts`, `layers/layers-decor-alloc.test.ts`, `sprites/sprites-glow.test.ts` | R3-06.L3 / L4, headless over the test atlas: `createParallaxBinding` accepts a band on `FOREGROUND` beside `BG_FAR` / `BG_MID` and drives its sprite frame from the view's `frameIndex` (out-of-range frames fall to the missing frame; a view without the field stays on frame 0), band rows follow the view's `y` (the `yFactor` fold is core's), `bindWorld` binds the two decor batches onto `DECOR_BACK` / `DECOR_FRONT` through the generic batch path while a band on any other layer still throws before anything binds, and an `additive` sprite binding sets `blendMode = 'add'` on every preallocated sprite **at creation** with a sync path that never touches blend state; allocation guards run the three-band parallax sync with a cycling `frameIndex` and a decor batch whose slots are rewritten each tick |
| `packages/render-pixi/test/layers/layers-terrain-changes.test.ts`, `layers-terrain-changes-edge.test.ts` | M2-07: only the logged cells in view re-textured, a reset or an overflowing gap redraws the grid, a view without `changes` |
| `packages/render-pixi/test/layers/layers-bending.test.ts` | The bending laser binding (M2-02): the newest `filled` nodes of each active slot, tail first, the head on top; a shrinking body's extra sprites, hidden and inactive slots hidden; clamping to its nodes; bad capacities and node counts; a moving body synced without allocating |
| `packages/render-pixi/test/palette/palette-bullets.test.ts`, `renderer/renderer-wiring.test.ts` | M2-02: `bulletPaletteSpriteName`, `resolveBulletPaletteTable` (variants in place of their sprites, the rest kept); the renderer binding the bending laser view after the lasers and `setBulletPalette` swapping the sprite tables to a palette's variants and back |
| `packages/render-pixi/test/layers/layers-lasers*.test.ts` | The laser binding (M1-09): two hidden sprites per slot, the tinted telegraph line vs the beam frame of the rounded width (band / frame boundaries, wider-than-frames scaling), blink and zero / NaN lengths hidden, rotation written only on change, camera rounding without `-0`, shrinking views, capacity validation, destroy, zero allocation through a whole laser life |
| `packages/render-pixi/test/renderer/` | The renderer wired with a fake `WebGLRenderer`: passes, rebinding (incl. parallax / terrain bindings below the batches), shake / flash / dim, reused pass options (fails if `resetPass` is removed), allocation probes; `renderer-fx*` (M1-14): the particles / popups / effects it owns, stepping by the tick delta, flash tint composition, the two dims, the FX layer under the enemy bullets |
| `packages/render-pixi/test/effects/mode7-pages.test.ts` | R1-02: the Mode-7 floor samples the atlas page its tile lives on — the real shader over a two-page atlas, `Mode7Floor.bind(view, tile, page)` → `Mode7Shader.setPage` at bind time only (no frame touches it, a same-page bind does nothing); fails on the old page-0 code |
| `packages/render-pixi/test/atlas/atlas.test.ts`, `renderer/renderer-upload.test.ts` | R1-05: every atlas page out of Pixi's texture GC (`autoGarbageCollect` off) and still freed by `unload()` / `destroy()`; `uploadTextureSource` binding the source through `texture.initSource` on a fake `WebGLRenderer` |
| `packages/shell/test/loader/loader-manifest.test.ts`, `boot/boot-manifest.test.ts` | R1-05: the manifest fetched by a fake XHR (status 0 and 200 succeed; 404, an empty body and a network error are `load` failures), the digest over the bytes, versions 1 and 2, the page shape; the boot from manifest assets and each failure's error screen, the inline assets still booting. The loader test builds the atlas in memory (`buildAtlas()`), as CI never runs `pnpm assets` |
| `packages/shell/test/boot/boot-residency.test.ts`, `memory/residency-eager.test.ts`, `memory/residency-lazy.test.ts`, `boot/residency-hold.test.ts`, `debug/debug-atlas.test.ts` | R1-05: unload before upload, idempotence, the self-healing unload of a page drawn behind the residency's back, `onChange` / `lastPrepareMs`; the boot stage's pages uploaded before `warmUp()`, the World-change trigger (a demo World of another zone; the weapon select's preview not placed), the three canvas attributes; R3-04: the lazy residency's attach / detach / parallel loads / retry and supersede rules (`residency-lazy.test.ts`), the boot's awaited lazy prepare and the `'lazy'` default, the preview image-attach path (`boot-residency.test.ts`), the hold — a replay hashes the same with and without it, a mid-load frame advance ticks once exactly (`residency-hold.test.ts`); `__shmupDebug.atlas` (`resident`, `unloads`, `uploads`, `lastPrepareMs`, `timing`, `pageMs`, `prepare(stageId)`). Since R5-01.S7.1 (`62ac4e5`) the self-heal **premise** is derived, not assumed: `tiles/terrain-a` demoted to common when zone A remastered to `terrain-azure`, so the weapon-range preview no longer draws an un-uploaded page — `residency-eager` now heals any page the stage needs outside the common set and its scripted leave list, and `boot-residency` plants its stray on the zone's own page. For the remaining flips this is the sanctioned triage: every zone remaster that renames or drops a tileset re-triggers those two premise reds at its LAND, and the re-anchor pattern is the cure (the page-index cascade resolves with the atlas-groups re-derive — the premises do not) |
| `packages/shell/test/frame-fingerprint.test.ts` | R1-02: the shell's own scenes (flight, showcase, fx-gallery) hashed along five scripted walks, pinned on the code before R1-02 derived their frame numbers — green unedited unless a step changes what they draw (re-pin with `SHMUP_FINGERPRINT_PRINT=1`) |
| `packages/render-pixi/test/particles/`, `effects/` | The `fx` content validation, the particle pool, the screen effects and the score popups (M1-14 — [fx-and-game-feel.md](fx-and-game-feel.md#tests)) |
| `packages/shell/test/` | The save at boot (M1-17: volumes on a fake audio, the app's profile callbacks, corrupt / unreadable / v0 saves, a failing storage, the Options screen end to end, `blur`, boot timing and `data-shmup-boot-ms`), `connectOptionEvents` / `applyAudioOptions` (`dispatch-options*.test.ts`; `dispatch-options-palette.test.ts` — M2-02: every palette by its index, bad indices and no callback ignored, disconnect), the saved palette applied at boot (`boot.test.ts`); the scene flow's boot (title theme prepared, `finishBoot`, `data-shmup-scene` through boot → title → game → pause) and `scene-view` (backdrop, open-space wrapper per World, starfield frozen under pause, followed camera, `worldChanges` — M1-16); boot happy path and every failure (error screen, state attribute, cleanup), content owners (the default `input-profiles` owner, an app owner replacing it), the input context forwarded before a frame's polls, image loading and progress, dispatch (copy-on-write unsubscribe; `connectFxEvents` — its table, an allocation guard of the whole event path and an end-to-end game-feel run, M1-14; `connectAudioEvents` — its mapping, two allocation guards and the shipped boss range through a real audio engine, M1-15), the audio wiring of boot (bank and stage set prepared, attach after the unlock, `AUDIO FAILED TO LOAD` — M1-15), overlay drawing, the fx gallery, the free-flight scene (sprite ids, starfield drift / wrap / pause, HUD, the WARNING band — M1-13, empty content, zero allocation per frame), showcase determinism and allocation |
| `packages/render-pixi/test/debug/`, `renderer/renderer-draw-calls.test.ts` | The debug overlay (M1-19): panel lines and values, frame graph, every outline kind, one colour per list, no dropped commands with every pool full, allocation-free `update`; the draw-call counter ([debug-and-replays.md](debug-and-replays.md#tests)) |
| `packages/shell/test/debug/` | The debug tools (M1-19): F-keys, the TV unlock sequence, `window.__shmupDebug`, the frame hooks |
| `packages/render-pixi/test/debug/debug-render-profile.test.ts`, `renderer/renderer-structure-rebuilds.test.ts`, `packages/shell/test/debug/debug-render-profile.test.ts` | M3-02c: the overlay's `REB` / `RT` line (placement, the blank `REB` when nothing counts, allocation-free rebuilds), `createRenderTargetMeter` (totals, `stop()` restoring the pool, an allocation-free read), the renderer counting only the frames whose scene structure changed (−1 without the option), and the shell refreshing both figures every frame and stopping the meter on `destroy` |
| `test/bench/render.perf.ts` | M3-02c: the render benchmark itself — the scenarios really are under the load they claim, the draw-call / p95 / heap budgets, and a deliberately leaky fixture that must blow the heap gate. Since M3-02e every scenario is gated through `renderGroupViolations` and one runs the A/B arm with `renderGroups: false` |
| `packages/render-pixi/test/layers/layers-render-groups.test.ts`, `layers/layers-render-groups-edge.test.ts` | M3-02e: `RENDER_GROUP_LAYERS` membership (`DECOR_BACK` … `UI`, the four deliberate omissions named), `createLayerStack({ renderGroups })` — only an explicit `false` ungroups — and the grouped stack compared container by container with the ungrouped one, so a group boundary provably changes nothing structural |
| `packages/render-pixi/test/renderer/renderer-render-groups.test.ts`, `renderer/renderer-render-groups-edge.test.ts`, `renderer/renderer-render-groups-alloc.test.ts` | M3-02e: the option reaching the layer stack, `groupRebuilds` counting every dirty group of a frame (never falling, never below `structureRebuilds`, −1 without `countStructureRebuilds`, kept after `destroy()`), the F9 overlay texture (the five pass-1 overlays on the atlas' `ui/pixel`, the side panels on `Texture.WHITE`, both fallbacks), and the counting walk measured as an allocation A/B against the same loop with counting off |
| `test/integration/render-groups.test.ts` | M3-02e against the *shipped* game: four stages played through the real sim use only grouped batch layers, every `createSpriteBatch(LayerId.…)` in core names one, no app / shell / core code mentions `renderGroups`, and the two e2e `DRAW_CALL_BUDGET`s agree with each other and with `bench-gates.ts` (which stays above them on purpose) |
| `test/e2e/render-groups.spec.ts` | M3-02e in a real browser: seven scenes screenshotted with the groups on and then with `disableRenderGroup()` called on all thirteen grouped layers — byte-identical PNGs — plus the sensitivity controls (moving or hiding a layer must change the picture) and the `REB` annotation with the overlay off (0 of 180 frames) and on |
| `test/e2e/atlas-residency.spec.ts` | R1-05 in a real browser (on the shipped lazy default since R3-04.M3e): the web build fetches `assets/atlas/main.json` once; an aborted manifest ends on `ATLAS MANIFEST FAILED TO LOAD`, a foreign one on `ATLAS DOES NOT MATCH ITS MANIFEST`; the Tizen build boots from `file://` (XHR, status 0); `?stage=zone-b` keeps exactly `common` + zone B and a stage change swaps in zone C; the attract demo brings its zone's pages; the weapon select's preview page leaves the GPU at the game start; after a lost and restored context the new one holds exactly what the canvas marks — checked on WebGL's own view (`texImage2D` / `deleteTexture` hooked), not only the attribute |
| `test/e2e/atlas-context-loss.spec.ts` | R3-04.M3d through `WEBGL_lose_context`: after the restore the web build draws again (the title logo back in a screenshot), the sim still ticks, input still moves the scene flow, the residency's marks survive unchanged, and no console error or uncaught exception appears |
| `test/e2e/` | The real browser path, both builds (above) |

## Gotchas

| Symptom | Cause / fix |
|---|---|
| Everything draws as a magenta checker | The renderer has no (or the wrong) sprite name table: call `renderer.setSpriteNames(game.content.sprites.names)`; a warning names every sprite the atlas lacks |
| A new batch never appears | `WorldView.batches` was changed in place after the view was bound. Build a new `WorldView` object (or include the batch from the start) |
| A HUD edit does not show | The list was modified by writing its arrays directly, so `revision` did not move. Use the `DrawList` methods (or call the view's `invalidate()`) |
| Some HUD glyphs are missing | The draw list is full (`hud.dropped > 0`) or the layer's quad pool is (`pool.dropped > 0`); raise the capacity |
| Boot error `ATLAS DOES NOT MATCH ITS MANIFEST` | A page image from another pipeline run is next to this bundle (browser cache, a hand-copied file), or — since R1-05 — a cached `main.json` of another build (its digest differs from the one `app.js` recorded) or of an unknown format version. Rebuild; in a browser, hard-reload |
| Boot error `ATLAS MANIFEST FAILED TO LOAD` | R1-05: `assets/atlas/main.json` could not be fetched (missing from `dist/`, an HTTP error, an empty body) or is not a manifest. On a TV that refuses `file://` XHR (never seen yet — W3-7) the fallback is to import `virtual:shmup-assets-inline` in the app's `main.ts` and relax the bundle check's rule 10 in the same change |
| A zone's sprites hitch on first appearance, or `data-shmup-atlas-pages` lists every page | The stage is outside the campaign (a dev range, boss rush, a bonus stage, `escape`): `stagePages` gives it every page, uploaded at the transition. A campaign zone lists `common` + its own pages; if not, `atlas-groups.json` is stale (`test/integration/atlas-groups.test.ts` says so) |
| Boot error `no loader for content kind "…"` | A content file of a kind no owner validates. Add the owner to `DEFAULT_CONTENT_OWNERS` or to both apps' `contentOwners` |
| Opening `apps/tizen/dist/index.html` by double-click in desktop Chrome shows WebGL errors | Desktop Chrome treats each `file://` URL as its own origin, so WebGL refuses to upload the atlas page. Start Chrome with `--allow-file-access-from-files`, or use `pnpm --filter @shmup/tizen dev`; the TV serves the widget's files as same-origin |
| `pnpm test:e2e` hangs creating WebGL contexts | A stale forwarded X display (`DISPLAY=localhost:11.0` in an SSH session) makes SwiftShader try XCB. The config already scrubs `DISPLAY` for the browser; unset it if you launch Chromium yourself |
| `pnpm test:e2e`: every `[firefox]` test fails with `Executable doesn't exist … firefox` | Playwright's Firefox is not installed (the `firefox` project runs the determinism spec since M2-18): `pnpm exec playwright install --with-deps firefox`, or run `pnpm test:e2e --project=chromium` |
| Allocation appears per frame in a profile | Pixi objects created in `render()` (a new `WorldView` each frame), a tint written every frame on a hand-made sprite, or option literals passed to Pixi — keep all three out of the frame |
| Enemy bullets simulate but are invisible | The content was loaded without the engine's sprites — `loadGameContent` passes `ENGINE_SPRITES` by default; a hand-made `loadContent` call needs `extraSprites: ENGINE_SPRITES` |
| Options fly and fire but are invisible | `options/orb` is an engine sprite: the content was loaded without `extraSprites: ENGINE_SPRITES` (the shell's `loadGameContent` passes it by default) |
| A scene or test that picks a World batch by index shows the wrong sprites | M1-10 inserted the player-shot and Option batches: the World's order is ground enemies, air enemies, player shots, Options, ships, enemy bullets (the flight scene puts its star batches first) |
| Lasers never appear | The bound `WorldView` has no `lasers` (a scene that builds its own view must pass `world.view.lasers` through, as the flight scene does), or the view was bound before it was set |
| Bending lasers never appear | The same for `bendingLasers` (M2-02): a scene's own view must pass `world.view.bendingLasers` through — the flight scene and the scene view do |
| BULLETS changes nothing on screen | The renderer has no atlas / sprite names yet (the choice is kept and applied by `setSpriteNames`), the event did not reach it (only the scene flow connects `connectOptionEvents`), or the atlas lacks the `@<palette>` variants (run `pnpm assets`; `pnpm content:check` names them) |
| A real-art bullet keeps its standard colours in a colour-blind palette — or shows the placeholder's | A PNG override replaces a sprite by name; its `@<palette>` variants are separate sprites — draw and override them too |
| A stage runs but shows no terrain | The stage has no `tilemap`, its tileset failed to load (see the boot issues), or no atlas was given; tiles whose `frame` the atlas lacks draw `ui/missing` |
| `bindWorld` throws `parallax band i has layer …` | A `ParallaxView` band is not on `BG_FAR`, `BG_MID` or `FOREGROUND` (the throw names them) — stage content only produces those; check a hand-made view |
| Terrain and sprites disagree by one pixel | Something moved the terrain container by other than `round(−camera.x)`: sprite bindings draw `round(x − camera.x)`, and only that formula agrees for integer world positions (a test checks half-pixel cameras) |
| The title shows instead of the game in a test or tool | Since M1-16 the shell's default scene is the scene flow — open `?scene=flight` for bare gameplay, or press OK three times (past `PRESS OK`, START, then a difficulty — M2-01); wait on `data-shmup-scene` |
| `?scene=calibration` does nothing on the TV | The widget has no query string; the calibration scene is for browsers (`pnpm dev`, `vite preview`, the Tizen dev server) |
| No explosions or sparks, but the game runs | The renderer has no presets (`setFxContent` not called — an app `fx` owner replaced the shell's) or the scene is not the scene flow or free flight (only they connect the game's events) — [fx-and-game-feel.md](fx-and-game-feel.md#gotchas) |
| An explosion covers a bullet | Something was added to a layer above `ENEMY_BULLETS`; particles and popups belong on `FX` |
| No sound, but the game runs | In a browser nothing plays before the first key press or click (autoplay policy); the scene is not the scene flow or free flight (only they connect the game's events); the `audio` passed to `bootShell` does not expose `context` / `bus()`; or a game in open space, which has no stage music — [audio.md](audio.md#gotchas) |
| Settings or the hi-score are back to the defaults after a reload | Nothing was written yet (the save is written when the Options screen closes and when a game ends), `localStorage` failed and the adapter fell back to memory, or the save was corrupt (look for `shmup-cup:save.corrupt`; `shell.loadedSave.status`) — [saves-and-options.md](saves-and-options.md#gotchas) |
| `stage.spec.ts` / `enemies.spec.ts` fail with "not scrolling" / "not moving" on a busy machine | Fixed in M1-19: they no longer count rAF frames (the loop runs 1–4 ticks a frame under load) but freeze the sim and step exact ticks (`test/e2e/frame-advance.ts`). A new spec comparing two captures should do the same |
| A raster effect / palette cycle never shows | The camera x is outside the effect's `[from, to)`, `renderer.effects.settings.rasterEffects` is off, or a scene's own `WorldView` dropped `effects` (the flight scene and the scene view pass it through) — [presentation-polish.md](presentation-polish.md#gotchas) |
| The frame is stretched, or has no black border on a PC | The saved SCALE option is `fit` / `stretch`; OPTIONS → DISPLAY → SCALE → INTEGER restores the letterbox (`renderer.scaleMode`) |
| The picture sits in a window with dim panels beside it | The saved ASPECT option is `wide` / `classic` (M3-02): the frame is placed in a 64:27 or 4:3 window and the leftover width is drawn as side panels (`renderer.panels`, `PANEL_ALPHA`). OPTIONS → DISPLAY → ASPECT → NORMAL fills the display again |
| Scanlines over everything | The saved CRT option is `light` / `full` (M3-02, `renderer.crtFilter`). Since M3-02d it is the pass-2 blit's own shader, not a filter: OPTIONS → DISPLAY → CRT → OFF writes `uScan` / `uMask` / `uVignette` back to 0 (only the `screenPass: 'filter'` escape hatch still runs a capped second pass) |
| A black picture on an older set, with the game plainly running (sound, `data-shmup-scene` moving) | Since M3-02d both full-screen effects are Pixi meshes, and `MeshGeometry` builds `Uint32Array` indices, so pass 2 needs WebGL1's **`OES_element_index_uint`**. Pixi requests it and every GPU of the M7's generation has it, but it is now on the path every frame takes. Check `gl.getExtension('OES_element_index_uint')` in the Web Inspector; if it really is `null`, `screenPass: 'filter'` (and the Mode-7 stage left alone) is the only path that avoids a mesh |
| The Mode-7 floor never appears | The stage has no `mode7` section, the camera is outside its `[from, to)`, the atlas has no such sprite (`Mode7Floor.bind` got `null`) or the scene's `WorldView` dropped `effects` — [visual-and-mechanic-extras.md](visual-and-mechanic-extras.md#mode-7-floor) |
| The overlay's `REB` figure climbs while the panel is up | Expected, and it is the *panel*: its text quads sit on `DEBUG`, which is deliberately not a render group, so a printed number changing width dirties the scene's group. The rate depends on the machine's load (6 % of frames idle, 49 % loaded — `test/e2e/render-groups.spec.ts`), not on the renderer. Hide the panel (key **1**) and read `REB` from M3-02f's capture, which records it either way |
| `REB` keeps pace with the frame count **with the panel hidden** | A real regression of review **F1**: something outside the `RENDER_GROUP_LAYERS` groups is toggling `visible` on a sprite — a new binding added to `BG_FAR`, `BG_MID`, `FOREGROUND` or `DEBUG`, or a container flipped every frame. Since M3-02e the bench gates this (`renderGroupViolations`, budget a tenth of the measured frames) |
| The overlay's `RT` figure jumps by ~16 MB when CRT goes on | It should not any more: M3-02d made the CRT the pass-2 blit's own shader, so it pools nothing (review **F2**). If it does, the build predates M3-02d — or it was created with `screenPass: 'filter'`, which restores the old 2048×2048 pooled target on purpose |
| The render bench cannot find the Mode-7 floor or draws magenta checkers | The harness did not call `renderer.setSpriteNames(db.sprites.names)` — the World's sprite ids index into that table, and without it `Mode7Floor.bind` gets no tile |
| e2e specs time out waiting for `window.__shmupDebug` | The `dist/` folders are release builds (`pnpm build` ran after the test builds). `pnpm test:e2e` builds `build:test` first; do not run `playwright test` alone on release builds |

## Next steps that build on this page

- **M1-05** (done) — the shell forwards `game.inputContext` to `input.setContext()` and
  validates `content/input/` through its default `input-profiles` owner
  ([input-profiles.md](input-profiles.md)).
- **M1-06** (done) — the World fills `RenderFrame.world` (players batch); "free flight" is the
  default scene, the showcase moved to `?scene=showcase` ([sim-world.md](sim-world.md)).
- **M1-07** (done) — terrain and parallax drawn from `TerrainView` / `ParallaxView`; the flight
  scene runs a stage with `?stage=<id>` ([stage-runtime.md](stage-runtime.md)).
- **M1-08** (done) — the World's view gains the `GROUND_ENEMIES` and `AIR_ENEMIES` batches
  (animation frames, facing flips, ceiling flips, the D30 hit flash); the flight scene draws
  them without a change because it appends the World's batches
  ([enemies-and-behaviors.md](enemies-and-behaviors.md)).
- **M1-09** (done) — the enemy bullets are one more batch (the bullet pool itself, on
  `ENEMY_BULLETS`); the new `LaserView` is drawn by the laser binding above it; the loader
  interns the engine's own sprites ([bullets-and-patterns.md](bullets-and-patterns.md)).
- **M1-10** (done) — the player shots (a mirror batch on `PLAYER_SHOTS`, lasers as rows of
  segments) and the Options (a mirror batch on `PLAYER`, before the ships) join the World's
  batches; `options/orb` joins the engine sprites
  ([weapons-and-options.md](weapons-and-options.md#drawing-shots-and-options)).
- **M1-11** (done) — the items and shields batches ([powerups-and-shields.md](powerups-and-shields.md)).
- **M1-12** (done) — the flight HUD's score, `HI`, stock and `GAME OVER`; the World pushes the
  death's `Shake` / `HitStop` / `MusicDuck` / `Particles Debris` events, still unhandled
  ([death-and-scoring.md](death-and-scoring.md)).
- **M1-13** (done) — the boss parts' batch (last in the World's list, on `AIR_ENEMIES`), the
  `WarningView` in the render contract and the flight scene's WARNING band; the World pushes
  `Dim`, `BossDefeated`, the siren with its `SfxPriority.Critical` hint and the boss flashes —
  still unhandled ([bosses-and-warning.md](bosses-and-warning.md)).
- **M1-14** (done) — the renderer's particle pool, screen effects (shake, tinted flash behind a
  limiter, playfield dim) and score popups, fed through `connectFxEvents`; the shell owns the
  `fx` content; `?scene=fx-gallery` ([fx-and-game-feel.md](fx-and-game-feel.md)).
- **M1-15** (done) — the shell owns the `sfx` / `music` content, renders the SFX bank and the
  booted stage's music set during boot, attaches the audio engine after the unlock and feeds it
  through `connectAudioEvents` ([audio.md](audio.md)).
- **M1-16** (done) — the scene flow composes the frame (World view and HUD while the game is
  visible, one UI list for every visible scene, the menu dim); core `ui` fills the HUD and UI
  lists; the shell's default scene is `game` with its `scene-view`; `?scene=flight` keeps free
  flight ([scenes-and-ui.md](scenes-and-ui.md)).
- **M1-17** (done) — the shell reads the save before the title, applies its volumes and input
  profile, hands the store and the profile choices to the scene flow, applies the Options screen's
  `UserOption` events live, clears held input on `blur` and exposes the boot timing
  ([saves-and-options.md](saves-and-options.md)).
- **M1-18** (done) — `DEFAULT_STAGE_ID` / `defaultStageId(files)`: both apps' scene flow plays
  zone A (the dev scenes keep open space); the web app's `?skip=boss`
  ([zone-a-and-playtest.md](zone-a-and-playtest.md#the-game-plays-zone-a)).
- **M1-19** (done) — the debug tools: `ShellOptions.debugTools` / `Shell.debug`, the renderer's
  draw-call counter, the overlay on the `DEBUG` layer (FPS, tick / render ms, draw calls, pools,
  boot ms from `Shell.bootTiming`, the frame graph, outlines), `window.__shmupDebug`; `pnpm
  test:e2e` on the test builds ([debug-and-replays.md](debug-and-replays.md)).
- **M2-02** (done) — the `BendingLaserView` (optional `WorldView.bendingLasers`) and its segment
  binding on `ENEMY_BULLETS`; the cancel point items as one more batch on `ITEMS`; the colour-blind
  bullet palettes (`setBulletPalette`, the shell's boot and `connectOptionEvents`)
  ([pattern-dsl.md](pattern-dsl.md), [above](#colour-blind-bullet-palettes)).
- **M2-03** (done) — `scene-view` draws whichever World view the flow's frame shows (the weapon
  select's live preview as well as the game's); the renderer binds the preview's view like any
  new World view; the new shot sprites and `shots/blast` (an engine sprite) need no renderer change
  ([meter-arsenal.md](meter-arsenal.md#the-live-preview)).
- **M2-04** (done) — no renderer change: the Options Option Hunters carry are one more batch
  (`enemies.carriedBatch`, on `AIR_ENEMIES`, now **last** in the World's list), the shield pods
  are sprites of the existing shield batch, and the new engine sprites (`options/stolen`,
  `items/capsule-blue`, `shields/pod`, `shields/reduce`) bind like any other; the debug overlay's
  hurt outline follows Reduce's `hurtScale` (`buildDebugOutlines`)
  ([options-shields-hunter.md](options-shields-hunter.md)).
- **M2-05** (done) — no renderer change: the MANTA, the cube carriers, the Direct-mode shots (the
  sub-lasers pick an octant frame instead of rotating), the colour items and the Arm are sprites of
  the existing batches; the ship select's picture is a `DrawList` sprite command and the tier pips
  are rects of the HUD list (`HUD_COMMAND_COUNT` 64, `HUD_STRING_COUNT` 9 then)
  ([direct-mode.md](direct-mode.md)).
- **M2-06** (done) — no renderer change: player 2's ship and stock icon are the atlas's `@p2`
  sprites in the existing batch and HUD list (now `HUD_COMMAND_COUNT` 96, `HUD_STRING_COUNT` 22);
  the shell forwards `game.inputSeats` to the optional `ShellInput.setSeats` like the binding
  context ([coop.md](coop.md#input-routing-shmupinput-web-shmupshell)).
- **M2-07** (done) — `TerrainView.changes` (`TerrainChanges`) and the terrain binding's change
  log (destructible tiles breaking, growing back, cube-rush tiles, the rollback's reset); the
  moving blocks (on `TERRAIN`) and the tentacles' chain links (on `GROUND_ENEMIES`) are two more
  World batches, appended last ([advanced-stages.md](advanced-stages.md)).
- **M2-08** (done) — `WorldView.effects` (raster effects and palette cycles, drawn by one GLSL ES
  1.0 filter per layer — `renderer.layerEffects`) and `WorldView.hitboxes` (the `HITBOX` layer's
  markers); the additive flash quad; the scale modes (`computeViewport`, `setScaleMode`); render
  interpolation (`setInterpolation`, the `syncInterpolated` bindings) switched by the shell's
  refresh probe; `applyDisplayOptions` at boot and the display target of `connectOptionEvents`
  ([presentation-polish.md](presentation-polish.md)).
- **M2-10** (done) — `connectStagePreparation` (the music set follows the stage about to play),
  `DEFAULT_STAGE_ID` as the campaign's start zone; the renderer needed nothing new (the zone map,
  the tally and the ending are UI draw lists; the two new item sprites are engine sprites)
  ([campaign-and-bonus-stages.md](campaign-and-bonus-stages.md)).
- **M2-15** (done) — `connectSoundTest` and the music titles for the sound test in the boot; the
  renderer needed nothing new: the attract demo's World reaches it through `SceneFlowView.world`
  like the weapon select's preview, the other front-end screens are UI draw lists
  ([front-end-and-attract.md](front-end-and-attract.md)).
- **M2-16** (done) — the shell's new module `controls` (`createShellControls`: the rebind screen's
  host side over the app's profiles and the adapter's capture), `ShellInputProfiles.customize` /
  `rebindable`, `ShellInput.capture` / `beginCapture` / `endCapture`, the `InputSettings` handler of
  `connectOptionEvents`; the renderer needed nothing new (the Options pages, the rebind screen and
  the input test are UI draw lists; the labels come from the core's string table)
  ([options-rebinding-and-accessibility.md](options-rebinding-and-accessibility.md)).
- **M2-17** (done) — the shell's new modules `storage` (`createWebStorage`, the one `localStorage`
  adapter of both apps, with quota checks; the debug save export / import) and `memory` (the TV
  memory estimator; `Shell.atlasResidency`, unloading the atlas pages the next zone does not need on
  `PrepareStage` — nothing yet with the single page); the debug tools' `save` API and device line
  (`DebugToolsOptions.device` → render-pixi `DebugOverlay.setDevice`, the panel's sixth line)
  ([platform-polish.md](platform-polish.md)).
- **R1-05** (done) — the atlas split into `common` + one page per zone and the manifest fetched by XHR
  (`loadAtlasManifest`, `virtual:shmup-assets-inline` as the fallback, `ATLAS MANIFEST FAILED TO
  LOAD`); the residency's eager upload (`uploadTextureSource`), World-change trigger, self-healing
  unload and pages out of Pixi's GC; `Shell.atlasTiming` and the three `data-shmup-atlas-*` canvas
  attributes; the TV bench's decode scenario ([platform-polish.md](platform-polish.md#memory-budget-shmupshell-memory),
  [asset-pipeline.md](asset-pipeline.md)).
- **M3-02c** (done) — the render-performance instruments: `PixiRendererOptions.countStructureRebuilds`
  / `PixiRenderer.structureRebuilds`, `createRenderTargetMeter` and the overlay's seventh line
  (`REB`, `RT`), `webGLVersionFromSearch` (the `?gl=` A/B switch; WebGL1 stays the default) and the
  render benchmark `test/bench/render.perf.ts` ([above](#measuring-render-performance-m3-02c),
  [render-performance-review.md](render-performance-review.md)).
- **M3-02e** (done) — the render groups above: `layers`' `RENDER_GROUP_LAYERS` /
  `LayerStackOptions`, `PixiRendererOptions.renderGroups` (bench-only when `false`) and
  `PixiRenderer.groupRebuilds`; the review's **F1** counted to 0 and **F9** (the pass-1 overlays on
  the atlas' `ui/pixel`) ([above](#render-groups-m3-02e--the-reviews-f1),
  [render-performance-review.md](render-performance-review.md)).
- **M2-18** (done) — the shell's new module `determinism` (`createDeterminismCheck` /
  `installDeterminismCheck`: golden replays played headless in the page's own engine, published as
  `window.__shmupDeterminism`; the web app's dev / test builds open it with `?determinism` instead
  of booting the game, so it needs no WebGL and runs in headless Firefox too); the Playwright config
  gained the `firefox` project and the release checks (boot to title < 3 s, the Tizen
  certification self-checks); the renderer needed nothing new
  ([release-hardening.md](release-hardening.md)).
- **R3-04** (done) — the lazy residency: deferred atlas pages (`createAtlas` accepts `null`
  images; `Atlas.loadPage` / `unloadPage`, M3a), `createLazyAtlasResidency` with the `resident`
  image policy — pages fetch, decode, attach, upload and drop their images at the stage change
  (M3b, decision W5-15); the frame loop's **hold** while the shown World's pages are in flight —
  last frame redrawn, no tick, no input consumed (M3c, decision W5-16); the context-loss recovery
  that re-fetches the resident pages (`recoverAtlasPages`, M3d,
  `test/e2e/atlas-context-loss.spec.ts`); and `ShellOptions.atlasPages` defaulting to `'lazy'`
  with the preview World's image-attach path (M3e)
  ([platform-polish.md](platform-polish.md#memory-budget-shmupshell-memory)).
- **R3-06** (done) — the decor round's contract: `LayerId` at 17 layers (`DECOR_BACK` /
  `DECOR_FRONT` around the terrain, `FOREGROUND` under the bullets), the optional `blend` on
  `SpriteBatchView` and the additive sprite binding `bindWorld` maps it to, the `DecorView`
  (`WorldView.decor`) with its glow companions, `ParallaxView.frameIndex` and the band binding
  that follows it, and the two decor render groups
  ([stage-runtime.md](stage-runtime.md#parallax-and-the-terrain-view)).
