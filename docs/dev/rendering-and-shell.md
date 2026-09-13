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
[pattern-dsl.md](pattern-dsl.md) and [below](#colour-blind-bullet-palettes))
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
owners) and decisions **D20** (HUD bars outside the playfield), **D25** (no `fetch` on the
TV), **D30** (hit flash = white sibling sprite) and **D34** (one shared browser host).

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
│   screen: { shakeX, shakeY, flash, dim }     │        │   pass 1: scene → 384×216 texture      │
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
| 2 | `Terrain` | world | the stage's tile terrain (M1-07) |
| 3 | `GroundEnemies` | world | turrets, walkers, hatches (the enemy system's ground batch, M1-08) |
| 4 | `AirEnemies` | world | flying enemies (the enemy system's air batch, M1-08), the boss's parts (their own batch after every other World batch, so they draw over the air enemies — M1-13) |
| 5 | `PlayerShots` | world | shots, lasers (rows of 8-px segments), missiles — the weapon system's mirror batch (M1-10) |
| 6 | `Player` | world | Options (their own batch, listed before the ships so they draw below them — M1-10), ships, shields (the Force Field's batch, listed after the ships so it draws over them — M1-11) |
| 7 | `Hitbox` | world | hitbox marker |
| 8 | `Items` | world | capsules (M1-11) |
| 9 | `Fx` | world | the particle pool (normal-blend sprites, then additive) and the score popups — the renderer's own, fed by events (M1-14, [fx-and-game-feel.md](fx-and-game-feel.md)) |
| 10 | `EnemyBullets` | world | enemy bullets (the bullet pool itself, M1-09), then the enemy lasers — above explosions and items so they stay readable (§12) |
| 11 | `Hud` | screen | `RenderFrame.hud` |
| 12 | `Ui` | screen | `RenderFrame.ui` |
| 13 | `Debug` | screen | the debug overlay — panel, frame graph, hitbox / grid outlines (`render-pixi` `debug`, dev / test builds only — M1-19, [debug-and-replays.md](debug-and-replays.md#the-overlay-shmuprender-pixi-debug)) |

`LAYER_COUNT` is 14 and `LAYER_NAMES` holds the plan's spellings (`'ENEMY_BULLETS'`), used as
Pixi container labels. The world group is offset by screen shake; `Hud`, `Ui` and `Debug`
stay put. **Append, never renumber** — the code is the draw order and batches carry it.

### Sprite batches (`SpriteBatchView`)

A batch is one layer's worth of sprites as parallel arrays: `layer`, `capacity`, `count`,
and per slot `x`, `y`, `spriteId`, `frame`, `flags`. Slots `[0, count)` are drawn.

- Positions are **world pixels** of the sprite's *anchor*. The renderer draws slot `i` at
  `round(x − camera.x)`, `round(y − camera.y) + PLAYFIELD_Y` — the top HUD bar owns rows 0–7
  (D20), so world `y = 0` is screen row 8.
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

### The world view

`WorldView = { camera: { x, y }, parallax, terrain, batches, lasers?, bendingLasers?, warning? }`. Everything is a live
reference into sim state; the renderer reads and never writes. **`batches` is read once, when
the view is bound**: the renderer creates one preallocated binding per entry, and syncs
binding `i` from `batches[i]` every frame. To change the list, hand the renderer a different
`WorldView` object (it rebinds automatically, which allocates — do it at stage or scene
changes, not per frame). The same holds for the structure of `parallax` (band count, layers,
spacings) and `terrain` (map size, tile size); their per-frame values are read every frame:

- `ParallaxView` — `count` bands; per band `layer` (`BgFar` / `BgMid` only), `spriteId` (frame 0
  is repeated), `spacing` (repeat distance), `offsetX` (`0 ≤ offsetX < spacing`, the band is
  shifted left by it) and `y` (the band's playfield row after the vertical scroll). The stage
  runtime fills it (`offsetX = (camera.x · factor) mod spacing`, `y = baseY − camera.y ·
  factor`); the renderer rounds both.
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

Coordinates are screen pixels of the 384×216 frame, rounded and stored as `Int16`. Text lives
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

The layout constants are in core `config`: `HUD_BAR_HEIGHT` 8, `PLAYFIELD_Y` 8,
`PLAYFIELD_W` 384, `PLAYFIELD_H` 200 (D20). `Game` also exposes `events` — the `core/events`
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
frame a `Texture` over it, so every sprite of a page batches into one draw call. The atlas
refuses an image whose size differs from its manifest entry (a stale page next to a newer
manifest), a page over `MAX_ATLAS_SIZE` (2048), a frame outside its page and a sprite that
lists a missing or shared frame — all as `RangeError`s, which the shell turns into a boot
error screen.

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
  preallocated ring of tile sprites one tile wider and taller than the playfield — **49 × 26**
  for 8-px tiles (rows capped at the map's). Slot column `s` shows the map column `≡ s (mod
  49)` inside the view, so `sync(view, camera)` re-textures only the column (or row, for
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
  container on its layer holding `ceil(width / spacing) + 1` sprites `spacing` pixels apart,
  placed once; `sync(view)` only moves each container to `round(−offsetX)`, `PLAYFIELD_Y +
  round(y)`. No `TilingSprite` — WebGL1 cannot repeat non-power-of-two textures.
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

`createDrawListView()` (`ui`) draws a `DrawList` into a quad pool in command order: rects,
sprites (`Hidden` skips the command, `Flash` swaps to the sibling), `text` and `number` via
the bitmap font. It skips the whole list when it is the same list at the same `revision`;
`invalidate()` forces the next draw (the renderer calls it when the sprite tables change).

### Bitmap text (`text`)

`createBitmapFont(atlas, 'pixel')` resolves the pipeline's font (6×8 cells, `lineHeight` 10,
ASCII 32–126 plus `← ↑ → ↓ ● ✕ ★`) into dense lookup tables. `drawText(sink, font, text, x,
y, color, align)` walks `charCodeAt` and emits one quad per visible glyph: `\n` starts a new
line, alignment (`TextAlign.Left/Center/Right`) applies per line, spaces only advance, a
missing character draws `?`. `drawNumber()` splits the integer part into a shared digit
buffer (NaN / ±Infinity draw `0`, magnitudes cap at `Number.MAX_SAFE_INTEGER`, zero padding
stops at 20 digits). `createTextMetrics([font])` implements core's `TextMetrics`
(`measure(text, fontId)`, `lineHeight`) for layout code; the renderer exposes it as
`renderer.metrics`.

### One frame

`createPixiRenderer({ canvas, displayWidth, displayHeight, atlas, testPattern?, font?,
glyphCapacity?, preferWebGLVersion?, effects?, fxSeed?, particleCapacity? })` builds the scene
once: a lifted-navy background quad (never black — VA panels), the optional calibration pattern,
the layer stack, a playfield-dim quad and a flash quad (the last children of the world group, 32
px bigger than the frame on each side so shake never uncovers an edge), a menu-dim quad (first
child of the UI layer), the HUD / UI draw-list views and — M1-14 — the screen effects, the
particle pool and the score popups (the last two on the `FX` layer, with an atlas / font).
`render(frame)` then:

1. updates the calibration pattern (when enabled);
2. steps the effects, particles and popups by the ticks since the last frame (`frame.tick`
   delta: 0 while paused, ≤ 60; a tick going back clears them);
3. rebinds if `frame.world` is a different object, then syncs the particles and popups (with the
   world's camera), the parallax bands, the terrain grid, every sprite binding, the laser
   binding and the bending laser binding (M2-02);
4. offsets the world group by the rounded `frame.screen` shake plus the effects' shake, shows the
   brighter of the frame's white flash and the effects' tinted flash, sets both dims;
5. draws the HUD and UI lists (skipped when unchanged);
6. renders the scene into the 384×216 render texture, then that texture as one sprite,
   integer-scaled and centred, onto the canvas (`computeIntegerViewport`).

How the effects work: [fx-and-game-feel.md](fx-and-game-feel.md).

Both passes reuse option objects created with the renderer. Pixi's `render(options)` writes
into the object it gets (`target`, `clear`, `clearColor`, a cached `transform`), so a small
`resetPass()` restores those fields before each call — without it, the second frame would
reuse the first frame's cached state.

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

## The browser shell (`@shmup/shell`)

`bootShell(options)` is the one boot path of `apps/web` and `apps/tizen` (D34). The apps
create what is platform-specific — input, audio, the `Platform` — and pass it in with the
inlined virtual modules:

```ts
import contentFiles from 'virtual:shmup-content';
import assets from 'virtual:shmup-assets';

const shell = await bootShell({
  canvas,
  win: window,
  contentFiles,
  assets, // { manifest, pageUrls }
  input, // createWebInput(...) — also the platform's input; destroyed by stop()
  audio, // createWebAudio()   — also behind the platform's audio; destroyed by stop()
  platform: (renderer) => createWebPlatform({ input, audio, webgl2: renderer.webGLVersion === 2 /* … */ }),
  gameConfig: { remoteMode: false, stage: stageFromSearch(location.search) }, // apps/web: ?stage=
  scene: sceneFromSearch(location.search), // 'game' (default: the scene flow) | 'flight' | 'showcase' | 'calibration' | 'fx-gallery'
  audioUnlock: 'gesture', // 'immediate' on the TV
  contentOwners: { [INPUT_PROFILES_KIND]: profiles.load }, // optional: merged over DEFAULT_CONTENT_OWNERS
  inputProfiles: { choices, active, apply }, // optional (M1-17): the Options screen's CONTROLS
  debugTools: __SHMUP_DEV__ ? debugToolsFactory({ buildId: __SHMUP_BUILD__ }) : null, // M1-19
});
```

### The boot sequence

| Step | What happens | Fails with (error screen title) |
|---|---|---|
| 0 | Canvas marked `data-shmup-state="loading"`; overlay shows `SHMUP CUP` / `LOADING` and an empty bar | — |
| 1 | `loadGameContent(files, { owners })`: core kinds through `loadContent()`, every foreign kind through its owner | `CONTENT COULD NOT BE READ` (a thrown error), `CONTENT ERRORS: N PROBLEMS` (issues, one `path: message` line each) |
| 2 | `loadImages(pageUrls, () => new Image())` — all pages in parallel, the bar advances per page | `ATLAS PAGE FAILED TO LOAD` (`<url>: AssetLoadError: …`) |
| 3 | `createAtlas(manifest, images)` | `ATLAS DOES NOT MATCH ITS MANIFEST` |
| 4 | `createPixiRenderer(...)` — WebGL1 first; `fxSeed` = the game's seed xor a salt, `effects` = `ShellOptions.effects`, `countDrawCalls` only with `ShellOptions.debugTools` (M1-19) | `WEBGL IS NOT AVAILABLE` |
| 5 | `options.platform(renderer)`; then (M1-17) `loadSave(platform.storage)` — never fails: a corrupt or unreadable save means defaults, its text copied to `save.corrupt` — `createSaveStore`, `applyAudioOptions(audio, save.options.audio)`, and with `options.inputProfiles` its `choices()`, `apply(savedId, 'save')` and `active()`; then `createGame(platform, gameConfig, content.db, options)` — `{ scenes: 'boot', save, inputProfiles: { choices, active } }` for the default scene `game` (the scene flow, M1-16), none for the dev scenes (bare gameplay) — [saves-and-options.md](saves-and-options.md#the-shells-side) | `SHMUP CUP FAILED TO START` (the platform factory, the profile callbacks or `createGame` threw) |
| 5a | Audio (M1-15): `createAudioEngine({ sfx, music, loader })`, `engine.loadSfx()` (bar labelled `LOADING SOUND`), then for a booted stage `engine.prepareMusic(stage.id, stageMusicCues(stage))` (`LOADING MUSIC`; open space prepares none); the scene flow adds the title theme (and the stage-clear / game-over jingles in open space), then `game.scenes.finishBoot()` — [audio.md](audio.md#the-shells-wiring) | `AUDIO FAILED TO LOAD` (`AudioLoadError: could not load <url>: …`) |
| 6 | `renderer.setFxContent(shell.fx)`; `renderer.setBulletPalette(save.options.display.bulletPalette)` (M2-02 — before the sprite names are resolved); scene set up (the scene flow: `createSceneView(game)`, its name table + `bindWorld(view.backdrop)`; free flight / showcase / fx gallery: the scene's name table + `bindWorld(scene.world)`; calibration: content's names and a frame without a world), dispatcher created — in the scene flow and free flight with `connectFxEvents` (M1-14) and `connectAudioEvents(events, engine, camera)` (M1-15; the flow's `sceneView.camera`, free flight's `world.view.camera`); in the scene flow also `connectOptionEvents(events, audio, …)` (M1-17: the Options screen's volumes and profile, live; M2-02: the bullet palette → `renderer.setBulletPalette`) | — |
| 7 | Suspend → `input.clear()` + `audio.suspend()`; resume → `audio.resume()`; window `blur` → `input.clear()` (M1-17 — a window without focus never sends its key-ups); audio unlock (first `keydown` / `pointerdown` in the capture phase, or immediately) followed by `engine.attach(audio)` right after `unlock()` returns and again when it resolves; `resize` → `renderer.resize()` | — |
| 8 | rAF loop started, overlay removed, canvas marked `running`, `data-shmup-scene` = the top scene (`title`) or the dev scene, and `data-shmup-boot-ms` = the launch-to-ready time (M1-17, `Shell.bootTiming`); then, in dev / test builds, the debug tools from `ShellOptions.debugTools` (M1-19: keys, `window.__shmupDebug`, the overlay — before the first frame, which rAF runs later) | — |

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
`renderer.setBulletPalette(BULLET_PALETTES[param])`
([saves-and-options.md](saves-and-options.md#live-changes-the-useroption-event)). Only `HitStop`,
`Rumble` and `PowerUp` are still counted as unhandled.

### Scenes

| `?scene=` | What is drawn | Sprite name table |
|---|---|---|
| (none) / `game` | **The scene flow** (M1-16, `createSceneView(game)`; the game created with `{ scenes: 'boot' }`): the title (logo, `PRESS OK`, 1 PLAYER / 2 PLAYERS / OPTIONS / EXIT — M2-06, the session hi-score — the saved best since M1-17) over a drifting starfield backdrop; a game with the core HUD (score, `HI`, `2P`, stock, the power meter, Force Field pips — the MANTA's tier pips in Direct mode, M2-05), the stage's own parallax and terrain — zone A by default since M1-18 (`defaultStageId`), another with `?stage=` — or the World over the starfield in open space; the difficulty menu under START and the continue countdown (M2-01), the ship select (M2-05), the weapon select with its live preview World drawn full screen behind its panel and the Auto order editor (M2-03), the pause menu, the Options screen (M1-17), the YES / NO dialog, the stage-clear and game-over screens over the frozen, dimmed game — all drawn by the core into the HUD / UI lists ([scenes-and-ui.md](scenes-and-ui.md)) | `content.db.sprites.names` + `SCENE_VIEW_SPRITES` |
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
complete at creation). Its sprite ids index one table: the content's names, then
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
| Input profiles | `?profile=` › the saved choice (read by the shell with the save, M1-17) › `keyboard-default`; `?debounce=`; `gamepad-standard`. CONTROLS: `KEYBOARD (DEFAULT)`, `KEYBOARD AS REMOTE` (+ a `?profile=` override) | saved choice › `tizen-remote-safe` (its `register` keys registered); `gamepad-standard`. CONTROLS: `SAFE 4-WAY (DEFAULT)`, `FAST 8-WAY` — a pick registers the new profile's keys |
| Saves | `localStorage` `shmup-cup:save.v1` (memory for the session after the first storage error) | the same key in the widget's `localStorage` (deleted on uninstall) |
| Back | Esc / Backspace → `Pause` (game) / `Back` (menus); the title's Back only backs out of its menu (no `platform.exit`) | remote Back (10009) → `Pause` (game) / `Back` (menus) through the scene stack; on the title the exit confirmation → `platform.exit()` after YES. The exit watcher is installed **before** boot and removed once the shell runs, so Back exits only from the loading and boot error screens |
| Atlas URLs | `assets/atlas/main.png` under the page (`vite preview`, dev middleware) | the same relative path inside the widget (`file://`) |
| Debug tools (M1-19) | `pnpm dev`, `build:test`, `build:dev`: `debugToolsFactory({ buildId })` — F1–F8 at once | `build:test`, `build:dev`: `tizenDebugTools(window, buildId)` — nothing until Pause, Ch+, Ch+, Ch+; then 1–8 (registered with `tvinputdevice` on the unlock) and F1–F8 |

`apps/tizen/scripts/check-bundle.mjs` rule 7 fails the Tizen build unless `dist/assets/atlas/`
holds at least one page — without it the widget can only show the boot error screen.

## Browser tests (`pnpm test:e2e`)

```sh
pnpm exec playwright install --with-deps chromium   # once per machine
pnpm test:e2e                                        # builds web + tizen, then runs Playwright
```

`test:e2e` runs `turbo run build:test` for `@shmup/web` and `@shmup/tizen` (since M1-19 the
**test builds** — release code plus the debug tools, so `window.__shmupDebug` exists), then
`playwright test --config test/e2e/playwright.config.ts`: headless Chromium, 1152×648 viewport
(×3, so frame pixel `(x, y)` is screenshot pixel `(3x + 1, 3y + 1)`), the web build served by
`vite preview` on port 4173 and the Tizen `dist/index.html` opened via `file://`.

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
  state `error`); a 1000×600 window gets a centred ×2 frame on the letterbox colour and a
  resize to 1920×1080 re-fits it to ×5; free flight animates.
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
- `bullet-palette.spec.ts` (M2-02) — web build: OPTIONS → BULLETS steps STANDARD → DEUTERANOPIA,
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
- `frame-advance.ts` (M1-19) — `freezeSim(page)` and `stepTo(page, tick)`: specs that compare two
  captures a set number of ticks apart freeze the sim and run exact ticks, because under load the
  frame loop runs 1–4 ticks per rAF frame. Playwright uses half the cores, at most 8 workers
  (SwiftShader is itself multi-threaded).

Chromium flags (why each exists is in the config's docblock): `--use-angle=swiftshader
--enable-unsafe-swiftshader` (software WebGL), `--allow-file-access-from-files` (see
gotchas), `--autoplay-policy=no-user-gesture-required` (like the TV). The browser gets the
environment without `DISPLAY`. Artifacts go to `test/e2e/test-results/` (git- and
Prettier-ignored). CI runs the suite as its own `e2e` job. Unit tests stay in Node: Pixi
display objects need no GPU, so atlas, bindings, quad pools, text and the renderer (with
`WebGLRenderer` faked) are all tested headless.

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
| `packages/render-pixi/test/layers/layers-stage*.test.ts` | Terrain grid size (49 × 26, capped at the map's rows), textures and positions, the ring (nothing re-textured inside a tile, one column / row per tile edge, all after a jump or new tables; after a long random camera walk it equals a freshly built grid), pixel agreement with the sprite bindings at half-pixel cameras, parallax coverage for any offset / spacing, validation, allocation-free syncs |
| `packages/render-pixi/test/layers/layers-terrain-changes.test.ts`, `layers-terrain-changes-edge.test.ts` | M2-07: only the logged cells in view re-textured, a reset or an overflowing gap redraws the grid, a view without `changes` |
| `packages/render-pixi/test/layers/layers-bending.test.ts` | The bending laser binding (M2-02): the newest `filled` nodes of each active slot, tail first, the head on top; a shrinking body's extra sprites, hidden and inactive slots hidden; clamping to its nodes; bad capacities and node counts; a moving body synced without allocating |
| `packages/render-pixi/test/palette/palette-bullets.test.ts`, `renderer/renderer-wiring.test.ts` | M2-02: `bulletPaletteSpriteName`, `resolveBulletPaletteTable` (variants in place of their sprites, the rest kept); the renderer binding the bending laser view after the lasers and `setBulletPalette` swapping the sprite tables to a palette's variants and back |
| `packages/render-pixi/test/layers/layers-lasers*.test.ts` | The laser binding (M1-09): two hidden sprites per slot, the tinted telegraph line vs the beam frame of the rounded width (band / frame boundaries, wider-than-frames scaling), blink and zero / NaN lengths hidden, rotation written only on change, camera rounding without `-0`, shrinking views, capacity validation, destroy, zero allocation through a whole laser life |
| `packages/render-pixi/test/renderer/` | The renderer wired with a fake `WebGLRenderer`: passes, rebinding (incl. parallax / terrain bindings below the batches), shake / flash / dim, reused pass options (fails if `resetPass` is removed), allocation probes; `renderer-fx*` (M1-14): the particles / popups / effects it owns, stepping by the tick delta, flash tint composition, the two dims, the FX layer under the enemy bullets |
| `packages/render-pixi/test/particles/`, `effects/` | The `fx` content validation, the particle pool, the screen effects and the score popups (M1-14 — [fx-and-game-feel.md](fx-and-game-feel.md#tests)) |
| `packages/shell/test/` | The save at boot (M1-17: volumes on a fake audio, the app's profile callbacks, corrupt / unreadable / v0 saves, a failing storage, the Options screen end to end, `blur`, boot timing and `data-shmup-boot-ms`), `connectOptionEvents` / `applyAudioOptions` (`dispatch-options*.test.ts`; `dispatch-options-palette.test.ts` — M2-02: every palette by its index, bad indices and no callback ignored, disconnect), the saved palette applied at boot (`boot.test.ts`); the scene flow's boot (title theme prepared, `finishBoot`, `data-shmup-scene` through boot → title → game → pause) and `scene-view` (backdrop, open-space wrapper per World, starfield frozen under pause, followed camera, `worldChanges` — M1-16); boot happy path and every failure (error screen, state attribute, cleanup), content owners (the default `input-profiles` owner, an app owner replacing it), the input context forwarded before a frame's polls, image loading and progress, dispatch (copy-on-write unsubscribe; `connectFxEvents` — its table, an allocation guard of the whole event path and an end-to-end game-feel run, M1-14; `connectAudioEvents` — its mapping, two allocation guards and the shipped boss range through a real audio engine, M1-15), the audio wiring of boot (bank and stage set prepared, attach after the unlock, `AUDIO FAILED TO LOAD` — M1-15), overlay drawing, the fx gallery, the free-flight scene (sprite ids, starfield drift / wrap / pause, HUD, the WARNING band — M1-13, empty content, zero allocation per frame), showcase determinism and allocation |
| `packages/render-pixi/test/debug/`, `renderer/renderer-draw-calls.test.ts` | The debug overlay (M1-19): panel lines and values, frame graph, every outline kind, one colour per list, no dropped commands with every pool full, allocation-free `update`; the draw-call counter ([debug-and-replays.md](debug-and-replays.md#tests)) |
| `packages/shell/test/debug/` | The debug tools (M1-19): F-keys, the TV unlock sequence, `window.__shmupDebug`, the frame hooks |
| `test/e2e/` | The real browser path, both builds (above) |

## Gotchas

| Symptom | Cause / fix |
|---|---|
| Everything draws as a magenta checker | The renderer has no (or the wrong) sprite name table: call `renderer.setSpriteNames(game.content.sprites.names)`; a warning names every sprite the atlas lacks |
| A new batch never appears | `WorldView.batches` was changed in place after the view was bound. Build a new `WorldView` object (or include the batch from the start) |
| A HUD edit does not show | The list was modified by writing its arrays directly, so `revision` did not move. Use the `DrawList` methods (or call the view's `invalidate()`) |
| Some HUD glyphs are missing | The draw list is full (`hud.dropped > 0`) or the layer's quad pool is (`pool.dropped > 0`); raise the capacity |
| Boot error `ATLAS DOES NOT MATCH ITS MANIFEST` | A page image from another pipeline run is next to this bundle (browser cache, a hand-copied file). Rebuild; in a browser, hard-reload |
| Boot error `no loader for content kind "…"` | A content file of a kind no owner validates. Add the owner to `DEFAULT_CONTENT_OWNERS` or to both apps' `contentOwners` |
| Opening `apps/tizen/dist/index.html` by double-click in desktop Chrome shows WebGL errors | Desktop Chrome treats each `file://` URL as its own origin, so WebGL refuses to upload the atlas page. Start Chrome with `--allow-file-access-from-files`, or use `pnpm --filter @shmup/tizen dev`; the TV serves the widget's files as same-origin |
| `pnpm test:e2e` hangs creating WebGL contexts | A stale forwarded X display (`DISPLAY=localhost:11.0` in an SSH session) makes SwiftShader try XCB. The config already scrubs `DISPLAY` for the browser; unset it if you launch Chromium yourself |
| Allocation appears per frame in a profile | Pixi objects created in `render()` (a new `WorldView` each frame), a tint written every frame on a hand-made sprite, or option literals passed to Pixi — keep all three out of the frame |
| Enemy bullets simulate but are invisible | The content was loaded without the engine's sprites — `loadGameContent` passes `ENGINE_SPRITES` by default; a hand-made `loadContent` call needs `extraSprites: ENGINE_SPRITES` |
| Options fly and fire but are invisible | `options/orb` is an engine sprite: the content was loaded without `extraSprites: ENGINE_SPRITES` (the shell's `loadGameContent` passes it by default) |
| A scene or test that picks a World batch by index shows the wrong sprites | M1-10 inserted the player-shot and Option batches: the World's order is ground enemies, air enemies, player shots, Options, ships, enemy bullets (the flight scene puts its star batches first) |
| Lasers never appear | The bound `WorldView` has no `lasers` (a scene that builds its own view must pass `world.view.lasers` through, as the flight scene does), or the view was bound before it was set |
| Bending lasers never appear | The same for `bendingLasers` (M2-02): a scene's own view must pass `world.view.bendingLasers` through — the flight scene and the scene view do |
| BULLETS changes nothing on screen | The renderer has no atlas / sprite names yet (the choice is kept and applied by `setSpriteNames`), the event did not reach it (only the scene flow connects `connectOptionEvents`), or the atlas lacks the `@<palette>` variants (run `pnpm assets`; `pnpm content:check` names them) |
| A real-art bullet keeps its standard colours in a colour-blind palette — or shows the placeholder's | A PNG override replaces a sprite by name; its `@<palette>` variants are separate sprites — draw and override them too |
| A stage runs but shows no terrain | The stage has no `tilemap`, its tileset failed to load (see the boot issues), or no atlas was given; tiles whose `frame` the atlas lacks draw `ui/missing` |
| `bindWorld` throws `parallax band i has layer …` | A `ParallaxView` band is not on `BG_FAR` / `BG_MID` — stage content only produces those; check a hand-made view |
| Terrain and sprites disagree by one pixel | Something moved the terrain container by other than `round(−camera.x)`: sprite bindings draw `round(x − camera.x)`, and only that formula agrees for integer world positions (a test checks half-pixel cameras) |
| The title shows instead of the game in a test or tool | Since M1-16 the shell's default scene is the scene flow — open `?scene=flight` for bare gameplay, or press OK three times (past `PRESS OK`, START, then a difficulty — M2-01); wait on `data-shmup-scene` |
| `?scene=calibration` does nothing on the TV | The widget has no query string; the calibration scene is for browsers (`pnpm dev`, `vite preview`, the Tizen dev server) |
| No explosions or sparks, but the game runs | The renderer has no presets (`setFxContent` not called — an app `fx` owner replaced the shell's) or the scene is not the scene flow or free flight (only they connect the game's events) — [fx-and-game-feel.md](fx-and-game-feel.md#gotchas) |
| An explosion covers a bullet | Something was added to a layer above `ENEMY_BULLETS`; particles and popups belong on `FX` |
| No sound, but the game runs | In a browser nothing plays before the first key press or click (autoplay policy); the scene is not the scene flow or free flight (only they connect the game's events); the `audio` passed to `bootShell` does not expose `context` / `bus()`; or a game in open space, which has no stage music — [audio.md](audio.md#gotchas) |
| Settings or the hi-score are back to the defaults after a reload | Nothing was written yet (the save is written when the Options screen closes and when a game ends), `localStorage` failed and the adapter fell back to memory, or the save was corrupt (look for `shmup-cup:save.corrupt`; `shell.loadedSave.status`) — [saves-and-options.md](saves-and-options.md#gotchas) |
| `stage.spec.ts` / `enemies.spec.ts` fail with "not scrolling" / "not moving" on a busy machine | Fixed in M1-19: they no longer count rAF frames (the loop runs 1–4 ticks a frame under load) but freeze the sim and step exact ticks (`test/e2e/frame-advance.ts`). A new spec comparing two captures should do the same |
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
