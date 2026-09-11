# Rendering and the browser shell: render contract, `render-pixi`, `@shmup/shell`

How a simulation state becomes pixels, and how the web and TV apps boot. Filled in by plan
step **M1-04**. Later steps *fill* the contract (the World in M1-06, terrain and parallax in
M1-07, the HUD and menus in M1-16, particles and screen effects in M1-14) without changing
its shape.

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
│   world: WorldView | null                    │ ─────► │   binding[i].sync(batch[i], camX, camY)│
│     camera, parallax, terrain                │        │   world group ← round(shakeX, shakeY)  │
│     batches: SpriteBatchView[] (typed arrays)│        │   flash / dim quads                    │
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
| 0 | `BgFar` | world | parallax (M1-07); the showcase's far stars |
| 1 | `BgMid` | world | parallax (M1-07) |
| 2 | `Terrain` | world | tile terrain (M1-07) |
| 3 | `GroundEnemies` | world | turrets, walkers |
| 4 | `AirEnemies` | world | flying enemies, bosses |
| 5 | `PlayerShots` | world | shots, lasers, missiles |
| 6 | `Player` | world | ships, Options, shields |
| 7 | `Hitbox` | world | hitbox marker |
| 8 | `Items` | world | capsules |
| 9 | `Fx` | world | explosions, particles |
| 10 | `EnemyBullets` | world | enemy bullets — above explosions and items so they stay readable (§12) |
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

`WorldView = { camera: { x, y }, parallax, terrain, batches }`. Everything is a live
reference into sim state; the renderer reads and never writes. **`batches` is read once, when
the view is bound**: the renderer creates one preallocated binding per entry, and syncs
binding `i` from `batches[i]` every frame. To change the list, hand the renderer a different
`WorldView` object (it rebinds automatically, which allocates — do it at stage or scene
changes, not per frame). `parallax` (`count`, `layer`, `spriteId`, `offsetX`, `y`) and
`terrain` (`tileSize`, `cols`, `rows`, `tiles`, `tilesetSpriteId`) are minimal shapes today;
M1-07 draws them and may grow them.

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
returns the same object from every `renderFrame()` call: `world` is `null` until the World
exists (M1-06), `hud` / `ui` are the session's (empty) draw lists, `screen` is all zeros until
the fx system (M1-14). `screen.shakeX/Y` are rounded by the renderer; `flash` (white over the
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
2. rebinds if `frame.world` is a different object, then syncs every binding;
3. offsets the world group by the rounded shake, sets flash / dim alpha and visibility;
4. draws the HUD and UI lists (skipped when unchanged);
5. renders the scene into the 384×216 render texture, then that texture as one sprite,
   integer-scaled and centred, onto the canvas (`computeIntegerViewport`).

Both passes reuse option objects created with the renderer. Pixi's `render(options)` writes
into the object it gets (`target`, `clear`, `clearColor`, a cached `transform`), so a small
`resetPass()` restores those fields before each call — without it, the second frame would
reuse the first frame's cached state.

**Allocation budget.** Pixi objects are created in `createPixiRenderer` and in `bindWorld()`.
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
  gameConfig: { remoteMode: false },
  scene: sceneFromSearch(location.search), // 'showcase' | 'calibration'
  audioUnlock: 'gesture', // 'immediate' on the TV
  contentOwners: {}, // validators of foreign content kinds (M1-05: 'input-profiles')
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
| 6 | Scene set up (showcase: its name table + `bindWorld`; calibration: content's names), dispatcher created | — |
| 7 | Suspend → `input.clear()` + `audio.suspend()`; resume → `audio.resume()`; audio unlock (first `keydown` / `pointerdown` in the capture phase, or immediately); `resize` → `renderer.resize()` | — |
| 8 | rAF loop started, overlay removed, canvas marked `running` | — |

On any failure the error screen stays up, the canvas is marked `error`, everything created so
far (input and audio included) is released, and the promise rejects with a `ShellBootError`
(`lines`, `issues`, `reason`). The apps log it as "Shmup Cup failed to start".

A file whose kind is neither a core kind nor claimed by an owner is an issue
(`<path>: no loader for content kind "<kind>"`), so a new content kind cannot ship
unvalidated — when M1-05 adds `content/input/`, the apps must pass the `input-profiles` owner
in `contentOwners` or the game will not boot.

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
const onFrame = (now: number): void => {
  game.frame(now); // 0…4 fixed ticks
  game.events.drain(events.visit); // sim events → registered handlers
  const frame = game.renderFrame();
  renderer.render(showcase === null ? frame : showcase.update(frame));
};
startFrameLoop(win, onFrame); // requests the next frame before calling onFrame
```

`createEventDispatcher()` routes drained records by `SimEventKind` to handlers registered at
load time with `shell.events.on(kind, handler)` (returns an unsubscribe function; an unknown
kind throws `RangeError`). Dispatching is a table lookup and a loop — no allocation.
Handlers receive the queue's **reused** record: copy fields out, never keep it. Events with
no handler are counted in `unhandled` and dropped; today nothing pushes events yet (M1-06
onward), and the audio and FX handlers arrive in M1-14 / M1-15.

### Scenes until the World exists

| `?scene=` | What is drawn | Sprite name table |
|---|---|---|
| (none) / `showcase` | The **sprite showcase** (`createShowcase()`): three scrolling star layers, the KESTREL flying a figure-eight with its thruster and two Options replaying its path, five drifters with periodic hit flashes, a rotating ring of twelve bullets, both HUD bars (scores via the `number` op, lives, power meter with a moving highlight) and the title "SHMUP CUP" / "SPRITE SHOWCASE" in the bitmap font | `SHOWCASE_SPRITES` |
| `calibration` | The skeleton's test pattern (checker border, grid, colour bars, placeholder ship, moving marker) under empty layers | `content.db.sprites.names` |

The showcase owns its own `RenderFrame` and derives every position from the game's tick with
`sinB` / `cosB`, so it pauses and resumes with the game and allocates nothing per frame. Its
UI list is built once (the renderer never redraws it); its HUD list is rebuilt every frame.
`sceneFromSearch()` ignores unknown values. On the TV the widget starts without a query
string, so the TV always shows the showcase. M1-06 replaces the showcase with "free flight"
driven by the real World.

## The apps

Both `boot` modules are thin: they create `createWebInput(...)` (`keyDevice: 'keyboard'` on
the web, `'remote'` on the TV), `createWebAudio()` and a platform factory, and call
`bootShell`. `main.ts` imports the virtual modules and passes them as
`bootWebApp(canvas, { contentFiles, assets }, win)` / `bootTizenApp(...)` — unit tests cannot
resolve virtual modules, so the boot functions receive them as arguments.

| | `apps/web` | `apps/tizen` |
|---|---|---|
| `gameConfig` | `{ remoteMode: false }` | `{ remoteMode: true, autofire: true }` |
| `audioUnlock` | `'gesture'` (autoplay policy) | `'immediate'` |
| Back | Esc / Backspace → `Action.Back` | remote Back (10009) exits — the watcher is installed **before** boot, so Back also leaves the boot error screen |
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
  URL, the screenshot is not uniform and has known pixels (the showcase title's yellow and the
  HUD bar; the calibration border with `?scene=calibration`), and nothing is logged as a
  console error, page error or failed request.
- `shell.spec.ts` — an aborted atlas request ends on the boot error screen (overlay canvas,
  state `error`); a 1000×600 window gets a centred ×2 frame on the letterbox colour and a
  resize to 1920×1080 re-fits it to ×5; the showcase animates.

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
package and pass it to `bootShell({ contentOwners: { '<kind>': owner } })` from both apps.

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
| `packages/render-pixi/test/renderer/` | The renderer wired with a fake `WebGLRenderer`: passes, rebinding, shake / flash / dim, reused pass options (fails if `resetPass` is removed), allocation probes |
| `packages/shell/test/` | Boot happy path and every failure (error screen, state attribute, cleanup), content owners, image loading and progress, dispatch (copy-on-write unsubscribe), overlay drawing, showcase determinism and allocation |
| `test/e2e/` | The real browser path, both builds (above) |

## Gotchas

| Symptom | Cause / fix |
|---|---|
| Everything draws as a magenta checker | The renderer has no (or the wrong) sprite name table: call `renderer.setSpriteNames(game.content.sprites.names)`; a warning names every sprite the atlas lacks |
| A new batch never appears | `WorldView.batches` was changed in place after the view was bound. Build a new `WorldView` object (or include the batch from the start) |
| A HUD edit does not show | The list was modified by writing its arrays directly, so `revision` did not move. Use the `DrawList` methods (or call the view's `invalidate()`) |
| Some HUD glyphs are missing | The draw list is full (`hud.dropped > 0`) or the layer's quad pool is (`pool.dropped > 0`); raise the capacity |
| Boot error `ATLAS DOES NOT MATCH ITS MANIFEST` | A page image from another pipeline run is next to this bundle (browser cache, a hand-copied file). Rebuild; in a browser, hard-reload |
| Boot error `no loader for content kind "…"` | A content file of a kind no owner validates. Register the owner in both apps' `contentOwners` |
| Opening `apps/tizen/dist/index.html` by double-click in desktop Chrome shows WebGL errors | Desktop Chrome treats each `file://` URL as its own origin, so WebGL refuses to upload the atlas page. Start Chrome with `--allow-file-access-from-files`, or use `pnpm --filter @shmup/tizen dev`; the TV serves the widget's files as same-origin |
| `pnpm test:e2e` hangs creating WebGL contexts | A stale forwarded X display (`DISPLAY=localhost:11.0` in an SSH session) makes SwiftShader try XCB. The config already scrubs `DISPLAY` for the browser; unset it if you launch Chromium yourself |
| Allocation appears per frame in a profile | Pixi objects created in `render()` (a new `WorldView` each frame), a tint written every frame on a hand-made sprite, or option literals passed to Pixi — keep all three out of the frame |
| `?scene=calibration` does nothing on the TV | The widget has no query string; the calibration scene is for browsers (`pnpm dev`, `vite preview`, the Tizen dev server) |

## Next steps that build on this page

- **M1-05** — the shell switches the input context from the top scene; `content/input/` gets
  its `input-profiles` owner.
- **M1-06** — the World fills `RenderFrame.world` (players batch); the showcase becomes "free
  flight".
- **M1-07** — terrain and parallax drawn from `TerrainView` / `ParallaxView`.
- **M1-14 / M1-15** — particles, shake, flash and audio handlers registered on the dispatcher.
- **M1-16** — core `ui` fills the HUD and UI draw lists (menus, HUD model).
