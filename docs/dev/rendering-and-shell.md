# Rendering and the browser shell: render contract, `render-pixi`, `@shmup/shell`

How a simulation state becomes pixels, and how the web and TV apps boot. Filled in by plan
step **M1-04**. Later steps *fill* the contract (the World in M1-06, see
[sim-world.md](sim-world.md); terrain and parallax in M1-07, see
[stage-runtime.md](stage-runtime.md); the enemy bullets and the new `LaserView` in M1-09, see
[bullets-and-patterns.md](bullets-and-patterns.md); the player shots and Options in M1-10, see
[weapons-and-options.md](weapons-and-options.md); the HUD and menus in M1-16;
particles and screen effects in M1-14) without changing its shape.

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
| 4 | `AirEnemies` | world | flying enemies (the enemy system's air batch, M1-08), bosses |
| 5 | `PlayerShots` | world | shots, lasers (rows of 8-px segments), missiles — the weapon system's mirror batch (M1-10) |
| 6 | `Player` | world | Options (their own batch, listed before the ships so they draw below them — M1-10), ships, shields |
| 7 | `Hitbox` | world | hitbox marker |
| 8 | `Items` | world | capsules |
| 9 | `Fx` | world | explosions, particles |
| 10 | `EnemyBullets` | world | enemy bullets (the bullet pool itself, M1-09), then the enemy lasers — above explosions and items so they stay readable (§12) |
| 11 | `Hud` | screen | `RenderFrame.hud` |
| 12 | `Ui` | screen | `RenderFrame.ui` |
| 13 | `Debug` | screen | debug overlay (M1-19) |

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

`WorldView = { camera: { x, y }, parallax, terrain, batches, lasers? }`. Everything is a live
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
  `(col · tileSize, row · tileSize)`.

- `LaserView` (optional `lasers`, M1-09) — `capacity`, `count` and per slot `x`, `y` (world
  origin), `angle` (binary units), `length`, `width` (the **drawn** width: 0 while the laser
  only telegraphs — the renderer draws a 1-px warning line then), `spriteId` (the beam strip)
  and `flags` (`Hidden` = the warning line's blink). The bullet system's laser pool implements
  it directly ([bullets-and-patterns.md](bullets-and-patterns.md#drawing-bullets-and-lasers)).

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
returns the same object from every `renderFrame()` call: `world` is the World's view
(`game.world.view`, the same object for the whole session — its batches are the enemies'
ground / air mirrors (M1-08), the player-shot and Option mirrors (M1-10), the players' mirror
on `LayerId.Player` (M1-06) and the enemy bullet pool (M1-09), plus the laser view), `hud` / `ui` are the session's (empty) draw lists,
`screen` is all zeros until the fx system (M1-14). `screen.shakeX/Y` are rounded by the renderer; `flash` (white over the
playfield, under the HUD) and `dim` (black under the UI layer) are 0…1 and clamped.

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
  sync touched (0 inside one tile). New sprite tables re-texture everything.
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
glyphCapacity?, preferWebGLVersion? })` builds the scene once: a lifted-navy background quad
(never black — VA panels), the optional calibration pattern, the layer stack, a flash quad
(last child of the world group, 32 px bigger than the frame on each side so shake never
uncovers an edge), a dim quad (first child of the UI layer) and the HUD / UI draw-list views.
`render(frame)` then:

1. updates the calibration pattern (when enabled);
2. rebinds if `frame.world` is a different object, then syncs the parallax bands, the terrain
   grid, every sprite binding and the laser binding;
3. offsets the world group by the rounded shake, sets flash / dim alpha and visibility;
4. draws the HUD and UI lists (skipped when unchanged);
5. renders the scene into the 384×216 render texture, then that texture as one sprite,
   integer-scaled and centred, onto the canvas (`computeIntegerViewport`).

Both passes reuse option objects created with the renderer. Pixi's `render(options)` writes
into the object it gets (`target`, `clear`, `clearColor`, a cached `transform`), so a small
`resetPass()` restores those fields before each call — without it, the second frame would
reuse the first frame's cached state.

**Allocation budget.** Pixi objects are created in `createPixiRenderer` and in `bindWorld()`
(which also creates the parallax sprites and the terrain grid, below the batches, the laser
sprites above them, and validates every band's layer before creating anything).
The shell pre-binds its scene at load, so a running frame only assigns numbers and existing
textures. Tint is set only when it changes, because Pixi's `tint` setter allocates before it
compares (a HUD redrawn every frame used to allocate ~1 KB per frame).

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
  scene: sceneFromSearch(location.search), // 'flight' (default) | 'showcase' | 'calibration'
  audioUnlock: 'gesture', // 'immediate' on the TV
  contentOwners: { [INPUT_PROFILES_KIND]: profiles.load }, // optional: merged over DEFAULT_CONTENT_OWNERS
});
```

### The boot sequence

| Step | What happens | Fails with (error screen title) |
|---|---|---|
| 0 | Canvas marked `data-shmup-state="loading"`; overlay shows `SHMUP CUP` / `LOADING` and an empty bar | — |
| 1 | `loadGameContent(files, { owners })`: core kinds through `loadContent()`, every foreign kind through its owner | `CONTENT COULD NOT BE READ` (a thrown error), `CONTENT ERRORS: N PROBLEMS` (issues, one `path: message` line each) |
| 2 | `loadImages(pageUrls, () => new Image())` — all pages in parallel, the bar advances per page | `ATLAS PAGE FAILED TO LOAD` (`<url>: AssetLoadError: …`) |
| 3 | `createAtlas(manifest, images)` | `ATLAS DOES NOT MATCH ITS MANIFEST` |
| 4 | `createPixiRenderer(...)` — WebGL1 first | `WEBGL IS NOT AVAILABLE` |
| 5 | `options.platform(renderer)`, then `createGame(platform, gameConfig, content.db)` | `SHMUP CUP FAILED TO START` |
| 6 | Scene set up (free flight / showcase: the scene's name table + `bindWorld(scene.world)`; calibration: content's names and a frame without a world), dispatcher created | — |
| 7 | Suspend → `input.clear()` + `audio.suspend()`; resume → `audio.resume()`; audio unlock (first `keydown` / `pointerdown` in the capture phase, or immediately); `resize` → `renderer.resize()` | — |
| 8 | rAF loop started, overlay removed, canvas marked `running` | — |

On any failure the error screen stays up, the canvas is marked `error`, everything created so
far (input and audio included) is released, and the promise rejects with a `ShellBootError`
(`lines`, `issues`, `reason`). The apps log it as "Shmup Cup failed to start".

A file whose kind is neither a core kind nor claimed by an owner is an issue
(`<path>: no loader for content kind "<kind>"`), so a new content kind cannot ship
unvalidated. Owners come from `contentOwners`, then the shell's `DEFAULT_CONTENT_OWNERS`
(today `input-profiles` → `@shmup/input-web` `loadInputProfiles`, M1-05 — the one reason the
shell imports input-web). Both apps pass an input-profile registry's `load` for that kind
instead, so they keep the parsed profiles and apply them in the platform factory, which runs
after validation ([input-profiles.md](input-profiles.md#choosing-the-active-profile)).

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
const onFrame = (now: number): void => {
  if (game.inputContext !== inputContext) {
    inputContext = game.inputContext;
    input.setContext(inputContext); // game / menu binding tables (D15), before this frame's ticks
  }
  game.frame(now); // 0…4 fixed ticks
  game.events.drain(events.visit); // sim events → registered handlers
  const frame = game.renderFrame();
  renderer.render(scene !== null ? scene.update(frame) : calibration.update(frame));
};
startFrameLoop(win, onFrame); // requests the next frame before calling onFrame
```

`createEventDispatcher()` routes drained records by `SimEventKind` to handlers registered at
load time with `shell.events.on(kind, handler)` (returns an unsubscribe function; an unknown
kind throws `RangeError`). Dispatching is a table lookup and a loop — no allocation.
Handlers receive the queue's **reused** record: copy fields out, never keep it. Events with
no handler are counted in `unhandled` and dropped; the queue is the World's (M1-06). The stage
pushes `Music` (M1-07) and the enemies push explosion `Sfx` / `Particles` (`FX_CUES`) and
`FormationBonus` (M1-08) and the player weapons push `Sfx` (`PlayerShot`, `PlayerMissile`,
`Clink` — M1-10), but the audio and FX handlers only arrive in M1-14 / M1-15 — until then these
events are counted as unhandled.

### Scenes until the scene stack exists

| `?scene=` | What is drawn | Sprite name table |
|---|---|---|
| (none) / `flight` | **Free flight** (`createFlightScene(game)`, M1-06): the game's World — the KESTREL flying in, then moving under the player's control — over three drifting star layers, both HUD bars (`1P`, a zero score, `FREE FLIGHT`, stock ships, `ARROWS MOVE`). With a stage (`gameConfig.stage`, the web app's `?stage=<id>`, M1-07): the stage's parallax bands and scrolling terrain instead of the starfield, the stage name as the title, the enemies its timeline spawns (M1-08) and their bullets (M1-09). The ship autofires in every build, with Options and lasers under the web app's `?loadout=full` (M1-10) | `content.db.sprites.names` + `FLIGHT_SPRITES` |
| `showcase` | The **sprite showcase** (`createShowcase()`): three scrolling star layers, the KESTREL flying a figure-eight with its thruster and two Options replaying its path, five drifters with periodic hit flashes, a rotating ring of twelve bullets, both HUD bars (scores via the `number` op, lives, power meter with a moving highlight) and the title "SHMUP CUP" / "SPRITE SHOWCASE" in the bitmap font | `SHOWCASE_SPRITES` |
| `calibration` | The skeleton's test pattern (checker border, grid, colour bars, placeholder ship, moving marker) under empty layers | `content.db.sprites.names` |

**Free flight** owns a `WorldView` whose batches are two starfield batches **followed by the
game World's own batches**, on the World's camera object and with the World's `parallax` /
`terrain` / `lasers` views passed through (the starfield batches are left out when the World has
parallax bands — a stage brings its own background) — a batch the World adds later is
drawn without changing the scene (the view is bound once, so the World's batch list must be
complete at creation). Its sprite ids index one table: the content's names, then
`FLIGHT_SPRITES`. `update(frame)` copies tick, alpha and screen effects, refills the stars
from the tick (world space relative to the camera, so they pause with the game) and rebuilds
the HUD only when player 1's lives change. How the World itself works is in
[sim-world.md](sim-world.md).

The showcase owns its own `RenderFrame` and derives every position from the game's tick with
`sinB` / `cosB`, so it pauses and resumes with the game and allocates nothing per frame. Its
UI list is built once (the renderer never redraws it); its HUD list is rebuilt every frame.
The calibration scene renders the game's frame through a small wrapper whose `world` is always
`null`, so only the test pattern and the (empty) HUD / UI lists show. `sceneFromSearch()`
ignores unknown values. On the TV the widget starts without a query string, so the TV always
shows free flight.

## The apps

Both `boot` modules are thin: they create `createWebInput(...)` (`keyDevice: 'keyboard'` on
the web, `'remote'` on the TV), `createWebAudio()`, an input-profile registry (its `load` is
the `input-profiles` content owner) and a platform factory that applies the chosen profiles,
and call `bootShell`. `main.ts` imports the virtual modules and passes them as
`bootWebApp(canvas, { contentFiles, assets }, win)` / `bootTizenApp(...)` — unit tests cannot
resolve virtual modules, so the boot functions receive them as arguments.

| | `apps/web` | `apps/tizen` |
|---|---|---|
| `gameConfig` | `{ remoteMode: false, stage }` — `stage` from `?stage=<id>` (`stageFromSearch`; an id missing from `contentStageIds(contentFiles)` → `console.warn`, `null`) | `{ remoteMode: true, autofire: true }` — no stage parameter (free flight) |
| `audioUnlock` | `'gesture'` (autoplay policy) | `'immediate'` |
| Input profiles | `?profile=` › saved choice › `keyboard-default`; `?debounce=`; `gamepad-standard` | saved choice › `tizen-remote-safe` (its `register` keys registered); `gamepad-standard` |
| Back | Esc / Backspace → `Pause` (game) / `Back` (menus) | remote Back (10009) exits — the watcher is installed **before** boot, so Back also leaves the boot error screen |
| Atlas URLs | `assets/atlas/main.png` under the page (`vite preview`, dev middleware) | the same relative path inside the widget (`file://`) |

`apps/tizen/scripts/check-bundle.mjs` rule 7 fails the Tizen build unless `dist/assets/atlas/`
holds at least one page — without it the widget can only show the boot error screen.

## Browser tests (`pnpm test:e2e`)

```sh
pnpm exec playwright install --with-deps chromium   # once per machine
pnpm test:e2e                                        # builds web + tizen, then runs Playwright
```

`test:e2e` runs `turbo run build` for `@shmup/web` and `@shmup/tizen`, then
`playwright test --config test/e2e/playwright.config.ts`: headless Chromium, 1152×648 viewport
(×3, so frame pixel `(x, y)` is screenshot pixel `(3x + 1, 3y + 1)`), the web build served by
`vite preview` on port 4173 and the Tizen `dist/index.html` opened via `file://`.

- `boot.spec.ts` — both builds reach `running`, the atlas page loads through its relative
  URL, the screenshot is not uniform and has known pixels (free flight's title yellow, the HUD
  bar and the KESTREL's hull colour; the showcase with `?scene=showcase`; the calibration
  border with `?scene=calibration`), and nothing is logged as a console error, page error or
  failed request.
- `flight.spec.ts` — after the fly-in, holding an arrow key moves the KESTREL (found by its
  hull colour, a pixel diff between captures) while it stays put without input; holding a
  direction stops it at the playfield margin, never over the HUD bars; the Tizen build from
  `file://` moves it with the remote's arrow key codes.
- `stage.spec.ts` — `?stage=test-range` shows the generated terrain (the placeholder tileset's
  colours) inside the playfield and never in the HUD bars, and scrolls it left between two
  screenshots (30 frames apart) while the ship stays put on screen; an unknown `?stage=` warns
  and boots free flight without terrain (M1-07).
- `enemies.spec.ts` — on `?stage=test-range` the first formation of drifters (found by their
  placeholder colours, which no other sprite uses) appears inside the playfield, never in the
  HUD bars, and flies left; no console errors and no atlas `unknown sprite` warnings while the
  timeline spawns (M1-08).
- `bullets.spec.ts` — on `?stage=test-range`, once the first turrets have scrolled in and
  settled, enemy bullets in the readability palette's body colours appear inside the playfield
  (never in the HUD bars) and move between two screenshots; no console errors or atlas
  `unknown sprite` warnings (M1-09).
- `weapons.spec.ts` — in free flight the KESTREL autofires: `shots/basic` sprites (found by
  their rim colour) appear to the right of the ship, never in the HUD bars, and move between
  two screenshots; `?loadout=full` draws the Options' orbs and laser beams; the Tizen build
  opened from disk autofires with no key held and ignores `?loadout=full`; no console errors or
  atlas `unknown sprite` warnings (M1-10).
- `shell.spec.ts` — an aborted atlas request ends on the boot error screen (overlay canvas,
  state `error`); a 1000×600 window gets a centred ×2 frame on the letterbox colour and a
  resize to 1920×1080 re-fits it to ×5; free flight animates.

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

Write commands into `frame.hud` / `frame.ui` (core `ui`, M1-16). Put changing strings into
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
| `packages/render-pixi/test/layers/layers-lasers*.test.ts` | The laser binding (M1-09): two hidden sprites per slot, the tinted telegraph line vs the beam frame of the rounded width (band / frame boundaries, wider-than-frames scaling), blink and zero / NaN lengths hidden, rotation written only on change, camera rounding without `-0`, shrinking views, capacity validation, destroy, zero allocation through a whole laser life |
| `packages/render-pixi/test/renderer/` | The renderer wired with a fake `WebGLRenderer`: passes, rebinding (incl. parallax / terrain bindings below the batches), shake / flash / dim, reused pass options (fails if `resetPass` is removed), allocation probes |
| `packages/shell/test/` | Boot happy path and every failure (error screen, state attribute, cleanup), content owners (the default `input-profiles` owner, an app owner replacing it), the input context forwarded before a frame's polls, image loading and progress, dispatch (copy-on-write unsubscribe), overlay drawing, the free-flight scene (sprite ids, starfield drift / wrap / pause, HUD, empty content, zero allocation per frame), showcase determinism and allocation |
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
| A stage runs but shows no terrain | The stage has no `tilemap`, its tileset failed to load (see the boot issues), or no atlas was given; tiles whose `frame` the atlas lacks draw `ui/missing` |
| `bindWorld` throws `parallax band i has layer …` | A `ParallaxView` band is not on `BG_FAR` / `BG_MID` — stage content only produces those; check a hand-made view |
| Terrain and sprites disagree by one pixel | Something moved the terrain container by other than `round(−camera.x)`: sprite bindings draw `round(x − camera.x)`, and only that formula agrees for integer world positions (a test checks half-pixel cameras) |
| `?scene=calibration` does nothing on the TV | The widget has no query string; the calibration scene is for browsers (`pnpm dev`, `vite preview`, the Tizen dev server) |

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
- **M1-14 / M1-15** — particles, shake, flash and audio handlers registered on the dispatcher.
- **M1-16** — core `ui` fills the HUD and UI draw lists (menus, HUD model).
