# Architecture

How the monorepo skeleton fits together at runtime: which package owns what, how one
displayed frame flows through the code, and the rules that keep the simulation
deterministic and portable. Design background: `shmup_tech.md` §3 (repo and `Platform`
interface) and `shmup_feat.md` §3 / §22 (loop, tick order, determinism).

Related pages: [repo-layout.md](repo-layout.md) (where files live),
[api-reference.md](api-reference.md) (every public export),
[build-test-deploy.md](build-test-deploy.md) (commands, Tizen build, CI),
[conventions.md](conventions.md) (rules for new code), [content-data.md](content-data.md)
and [asset-pipeline.md](asset-pipeline.md) (game data and art, from source to bundle),
[rendering-and-shell.md](rendering-and-shell.md) (the render contract, the renderer and the
shared browser boot), [sim-world.md](sim-world.md) (the World, its tick pipeline, the player
ship, collision and the state hash), [stage-runtime.md](stage-runtime.md) (scrolling stages:
camera path, timeline, checkpoints, tile terrain, parallax),
[enemies-and-behaviors.md](enemies-and-behaviors.md) (enemies, formations, behaviour coroutines,
movers, spline paths), [bullets-and-patterns.md](bullets-and-patterns.md) (enemy bullets,
lasers, fire primitives, rank).

## Layers

```text
┌────────────────────────── host apps (thin, platform-specific) ──────────────────────────┐
│ apps/web       Vite dev app; also the renderer Electron loads                           │
│ apps/tizen     Samsung TV .wgt (Chromium 69, one classic IIFE script)                   │
│ apps/electron  desktop shell: main process + sandboxed preload, loads apps/web's build  │
└──────┬─────────────────────────────┬───────────────────────────────────┬────────────────┘
       │ create input + audio,       │ bootShell({ content, assets,      │
       │ implement Platform          ▼   input, audio, platform })       │
       │              ┌─────────────────────────────────────────────┐    │
       │              │ @shmup/shell — shared browser host (D34)    │    │
       │              │ loading bar + boot error screen, content    │    │
       │              │ validation, atlas pages, renderer + game,   │    │
       │              │ event dispatch, rAF frame loop, dev scenes  │    │
       │              └──────────────────────┬──────────────────────┘    │
       ▼                                     ▼ creates                   ▼
┌──────────────────────┐  ┌────────────────────────────┐  ┌──────────────────────────────┐
│ @shmup/input-web     │  │ @shmup/render-pixi         │  │ @shmup/audio-web             │
│ keys/remote/pads →   │  │ IRenderer over PixiJS v8   │  │ IAudio over Web Audio        │
│ InputSnapshot        │  │ atlas, layers, sprites,    │  │ (interactive, buses)         │
│                      │  │ bitmap text, draw lists    │  │                              │
└──────────┬───────────┘  └─────────────┬──────────────┘  └──────────────┬───────────────┘
           └─────────────────────────────┼────────────────────────────────┘
                                         ▼  (types + helpers only)
                    ┌────────────────────────────────────────────────┐
                    │ @shmup/core — pure TS, deterministic           │
                    │ Platform / IRenderer / IAudio contracts,       │
                    │ render contract (RenderFrame, batches, draw    │
                    │ lists), input snapshots, config, fixed-step    │
                    │ loop, engine primitives, content loader,       │
                    │ createGame(), the World + tick pipeline,       │
                    │ stage, player, collision, enemies, behaviour   │
                    │ scripts + movers, bullets + lasers, rank;      │
                    │ other systems: placeholders                    │
                    └────────────────────────────────────────────────┘
```

- **`@shmup/core` imports nothing** from the workspace, no DOM/WebGL/audio/Node/Tizen
  APIs, no clocks and no `Math.random`. `tsconfig.json` gives it only the ES2018 lib and
  ESLint layer 4 rejects the globals and imports (see [conventions.md](conventions.md)).
- **Presentation packages depend only on core.** They implement core's contracts
  (`IRenderer`, `IAudio`, `PlatformInput`) and never call each other.
- **`@shmup/shell` is the one boot path of the browser hosts** (M1-04, decision D34). It
  depends on core and render-pixi, and on input-web only for the default owner of the
  `input-profiles` content (M1-05, allowed by plan §3.1); the input and audio *adapters* reach
  it through interfaces (`ShellInput` = `PlatformInput` + `clear` / `setContext` / `destroy`,
  `IAudio`), so the shell never creates them itself.
- **Apps are thin composition roots.** `src/boot/` in each app creates the input adapter,
  audio back-end and a `Platform` factory and calls `bootShell()`, which creates the atlas,
  renderer and game and drives them from `requestAnimationFrame`. Electron has no game code
  of its own — it serves the `apps/web` build over `app://game/`.

## The hard sim / presentation split

The simulation (`createGame` and, later, every system under `packages/core/src/`) never
calls the renderer or the mixer. Each displayed frame the host:

1. calls `game.frame(now)` — the core runs 0…`maxTicksPerFrame` fixed ticks;
2. drains `game.events` through the shell's dispatcher into the handlers registered per
   event kind (particles, shake → renderer; SFX, music → mixer). The queue, its cue
   registries and the dispatcher exist (`core/events`, shell `dispatch`), and since M1-06 the
   queue belongs to the World (`game.events === game.world.events`); the stage pushes `Music`
   (M1-07), the enemies push explosion `Sfx` / `Particles` and `FormationBonus` (M1-08), bullet
   cancels push `Particles` (`FX_CUES.BulletCancel`, M1-09), and the handlers arrive with the
   FX/audio steps (M1-14, M1-15);
3. reads the read-only `RenderFrame` with `game.renderFrame()` — world sprite batches, HUD and
   UI draw lists, screen effects (plan §3.4) — and hands it to `renderer.render()`.

Because nothing flows from presentation back into the sim except input, the same core
runs headless in Vitest (`createHeadlessPlatform`), can fast-forward, and will replay
recorded input bit-for-bit (`test/integration/input-replay.test.ts` already checks the
input side of that contract).

## One frame, end to end

```text
requestAnimationFrame(now)                       shell/frame-loop
 └─ game.inputContext changed? → input.setContext(ctx)   shell/boot → input-web: game/menu tables
 └─ game.frame(now)                              core/game
     └─ loop.advance(now)                        core/loop: delta snapping, accumulator, cap
         └─ repeat 0..4×: step()
             ├─ platform.input.poll()            input-web/web-input (once per tick)
             │   ├─ keyboard.advance()                 age the release debounce (input-web/remote)
             │   ├─ keyboard.held + consumeLatched()   input-web/keyboard: SOCD + diagonal policy
             │   ├─ readGamepadActions(pad 0..3)       input-web/gamepad (+ the same policies)
             │   └─ commitPlayerInput(p1/p2, …)        core/input: pressed/released edges
             ├─ stepWorld(world, input)          core/world: the 9 phases below, world.tick++
             └─ state.tick++
 └─ game.events.drain(dispatcher.visit)          shell/dispatch → registered handlers
 └─ renderer.render(frame)                       render-pixi/renderer
     │   frame = scene.update(game.renderFrame()) — free flight (default), showcase, calibration
     ├─ bindWorld(frame.world) if it is a new object   (load time only)
     ├─ parallax.sync(view), terrain.sync(view, camera) render-pixi/layers (a stage only)
     ├─ binding.sync(batch, camX, camY) per batch      render-pixi/sprites
     ├─ lasers.sync(view.lasers, camera)               render-pixi/layers (warning lines, beams)
     ├─ shake offset, flash / dim quads
     ├─ hudView.draw(hud), uiView.draw(ui)             render-pixi/ui + text (skipped if unchanged)
     ├─ pass 1: scene → 384×216 RenderTexture          nearest sampling, no antialias
     └─ pass 2: one sprite, integer scale ×N, centred on the canvas (letterbox around it)
```

Inside `stepWorld` the systems run in a fixed order (plan §3.2, `shmup_feat.md` §22), kept as
the explicit array `WORLD_PHASES`: `input → players → stage → scripts → movement → collision →
damage → removal → fx`. While hit-stop is active only `input` and `fx` run (the tick still
counts). Details: [sim-world.md](sim-world.md).

### Fixed-step loop (`core/loop`)

- Tick length = `1000 / tickRate` ms (16.67 ms at 60 Hz).
- **Delta snapping:** a frame delta within ±1 ms (`DEFAULT_SNAP_TOLERANCE_MS`) of a whole
  number of ticks counts as exactly that many ticks. On a 60 Hz display this yields
  exactly one tick per rAF despite timer jitter.
- Other refresh rates (50/120/144 Hz) accumulate time; `alpha` (0 ≤ α < 1) is the
  leftover fraction for interpolated rendering (carried in `RenderFrame`, not used by the
  renderer until M2 — decision D32).
- **Spiral-of-death cap:** at most `maxTicksPerFrame` (default 4) ticks per frame; any
  excess time is dropped, so a stall slows the game down instead of freezing it.
- The first `advance()` after creation or `reset()` only records the timestamp.
- `reset()` is called on resume (user un-pause and platform resume) so no catch-up burst
  runs after the app was hidden.

### Engine foundations (`core/rng`, `core/math`, `core/events`, `core/pools`)

The deterministic primitives every later system builds on. Details and usage rules:
[engine-foundations.md](engine-foundations.md); exact signatures:
[api-reference.md](api-reference.md).

- **`rng`** — sfc32 seeded by four splitmix32 words. A session owns two streams
  (`createRngStreams(seed)`): **gameplay**, whose draws are part of the simulation and are
  reproduced from the replay seed, and **cosmetic**, which presentation code may consume
  freely. Drawing never allocates; `getStateInto(out)` snapshots the state into a
  caller-owned `Uint32Array` for checkpoints.
- **`math`** — binary angles (1024 units per turn, 0 = +x, clockwise on screen) with
  `sinB` / `cosB` / `atan2B` reading committed tables, because engines round the `Math`
  transcendentals differently. Positions stay IEEE doubles: `+ − × ÷` and `Math.sqrt` are
  bit-exact everywhere, so no fixed-point layer is needed. Also `quantizeAngle`,
  `angleDelta`, `turnToward`, `clamp`, `lerp`, `approach` and the `EASINGS` table.
- **`events`** — the one-way sim → presentation channel: a preallocated ring of typed
  arrays (kind, id, x, y, param), drop-oldest with a `dropped` counter, drained once per
  displayed frame into one reused record. It owns the canonical `SFX_CUES` / `MUSIC_CUES`
  registries, so the simulation emits numbers and never strings.
- **`pools`** — `createSoaPool(capacity, schema)` for the high-count, homogeneous things
  (bullets, shots, particles): parallel typed arrays, `alloc()` zero-fills, `free()` is
  deferred and `flush()` swap-removes at the end of a tick. `createPool(factory, capacity,
  reset)` for the ≤ 100 pooled objects. Nothing allocates after creation. (The enemy system
  keeps its 64 `Enemy` objects in fixed slots instead, because every phase must visit them in
  a deterministic order — [enemies-and-behaviors.md](enemies-and-behaviors.md#slots-not-createpool).)

### The World (`core/world`, `stage`, `player`, `collision`, `debug`)

One gameplay session, built in M1-06; the stage runtime joined in M1-07, the enemies in
M1-08 and the enemy bullets, lasers and rank in M1-09. Details: [sim-world.md](sim-world.md),
[stage-runtime.md](stage-runtime.md), [enemies-and-behaviors.md](enemies-and-behaviors.md),
[bullets-and-patterns.md](bullets-and-patterns.md).

- **`world`** — `createWorld(config, content)` allocates the session: tick counter, RNG
  streams, event queue, two `PlayerShip`s (P2 inactive until co-op), the camera, the stage
  `config.stage` names (runner, collision map, parallax and terrain views — or none: free
  flight with a static camera), the enemy system, the rank and the bullet system, status,
  hit-stop, debug flags, the SoA pool
  registry (flushed in phase 8, hashed), a broad-phase grid over the camera view and the
  `WorldView` the renderer draws. `stepWorld(world, input)` runs one tick and never allocates; `createGame`
  hosts one World per session (`game.world`).
- **`stage`** — the stage runner (phase 3): the camera path (linear speed ramps, eased
  vertical pans, boss locks that stop the camera exactly), the sorted event timeline fired
  through a cursor into the World's hooks (`spawn` / `formation` → the enemy system, music
  events → presentation events, `end` → `stageClear`), invisible checkpoints with `restartAt`,
  and the terrain / parallax views. All runner state is one hashed `Float64Array`.
- **`enemies`**, **`patterns`**, **`behaviors`** — 64 enemies in fixed slots, spawned by the
  timeline (single enemies or formations that drop a capsule and pay a bonus when every member
  is killed), driven by **behaviour coroutines** — generators that sleep by yielding a tick
  count and are resumed only when they wake (D29) — and moved every tick by numeric **movers**
  (straight, sine, arc-length spline path, waypoint, follow-the-leader, ground crawl, homing,
  aimed dash). Off-screen / settle rules, contact with the ships through the grid
  (`playerHit(Contact)`), hit flash, explosion events, tick outcomes for the capsule and score
  steps; enemies and formations are hashed. Behaviours fire through `ScriptApi` primitives that
  enforce the fire rule (on screen, settled, not a ghost).
- **`bullets`**, **`rank`** — the enemy bullets (a 512-slot SoA pool that is also the
  `ENEMY_BULLETS` sprite batch) with acceleration, turning, delays, changes and capped homing,
  riding the camera and dying outside the view or on terrain; 16 telegraphed lasers (warning
  line → grow → full-width beam, the only phase with a hitbox → fade), attached to their enemy
  or fixed; brute-force collision with the ships (`playerHit(Bullet / Laser)`); bullet cancel.
  The fire primitives of `patterns` (aimed, N-way, ring, spiral, stack, spray, homing,
  delayed) scale bullet speeds and fire intervals by the session's rank — constant in M1 (the
  difficulty's base, Normal = 2, where every curve is exactly 1).
- **`player`** — KESTREL movement from `content/player/`: speed levels (D3), diagonals × 0.7071
  (D4), no inertia, riding the camera scroll, clamped to the camera view minus margins,
  banking, a 40-tick fly-in; `playerHit` records hits (terrain contact since M1-07, enemy
  contact since M1-08, enemy bullets and lasers since M1-09) until the death and respawn of
  M1-12.
- **`collision`** — closed scalar shape tests (circle, AABB, circle–AABB, capsule–circle,
  segment–AABB), layer masks, a counting-sort uniform grid whose queries equal brute force,
  and pixel-exact terrain queries over per-tile column-height masks (phase 6 tests the ship's
  terrain box and the ships against the enemies' hurtboxes; the bullet system tests bullets and
  laser capsules against the ships by brute force).
- **`debug`** — `hashWorld(world)`: FNV-1a over every piece of simulated state in a fixed
  order; two worlds with the same seed and input hash equal (golden replays, M1-19).

### Content pipeline (`content/` → `core/data`)

Game data is JSON under `content/`, validated and turned into numbers once, at boot. Details:
[content-data.md](content-data.md).

- **Build time (Node).** The `shmupContent()` Vite plugin (`vite.shared.ts`) reads every
  shipped `content/**/*.json` (not `example.*.json`), sorts it by path and serves it as the
  virtual module `virtual:shmup-content` — inlined into the bundle, because a Tizen widget
  on `file://` cannot `fetch()` local files (decision D25).
- **Boot.** The host passes that array to `loadContent()` (`core/data`), which checks each
  file's `kind` / `formatVersion` header, migrates old formats, validates the body with the
  in-house `s` combinators (D28), and resolves every string reference to a numeric index in
  a sibling `<field>Id`. Problems come back as `ValidationIssue { path, message }` (for the
  boot error screen), never as exceptions; files of kinds other packages own come back in
  `foreign`.
- **Run time.** `createGame(platform, overrides, db)` stores the `ContentDb` as
  `game.content`. Systems look up what they need at session/stage start and keep integer
  indices; the tick reads arrays only.
- Since M1-04 the apps' `main.ts` imports the module and `bootShell()` validates it with
  `loadGameContent()`: core kinds through `loadContent()`, other kinds through the owner
  registered for them (plan §3.5; a kind without an owner is an issue). Any issue stops the
  boot on the boot error screen; otherwise `createGame` receives the `ContentDb`.

### Asset pipeline (`assets/source/` → atlas → `virtual:shmup-assets`)

Every picture is built from committed source data by Node scripts at build time (decision
D24, "art as code"); nothing is drawn at run time and nothing is fetched on the TV. Details:
[asset-pipeline.md](asset-pipeline.md).

- **Build time (Node).** `scripts/assets/` turns sprite pixel maps
  (`assets/source/sprites/**/*.sprite.json`), seeded procedural generators, real-art PNG
  overrides and the bitmap font into packed, power-of-two atlas pages (≤ 2048²) and a JSON
  manifest in `assets/generated/atlas/`. Hit-flash sprites get a white `<name>@flash`
  sibling (D30). An input-hash cache skips unchanged runs; output is byte-identical.
- **Wiring.** Turborepo runs `//#assets` before `build` / `dev`, and the `shmupAssets()`
  Vite plugin (`vite.shared.ts`) runs the same cached pipeline in `buildStart`, inlines the
  manifest as `virtual:shmup-assets` and emits the pages into `dist/assets/atlas/`
  (relative URLs — `file://` on Tizen, `app://` in Electron; D25).
- **Boot.** The shell loads the pages with `new Image()` from their relative URLs,
  render-pixi's `createAtlas` turns them into one nearest-neighbour texture source per page,
  and `renderer.setSpriteNames(names)` resolves every sprite name to a frame id once — the
  sim and the renderer exchange integers only. Content's `sprite` names are checked against
  the manifest by `pnpm content:check`; anything unresolved at run time draws the magenta
  `ui/missing`.
- **Real art later** replaces frames by sprite name (a PNG + optional Aseprite export next
  to the pixel map) — no code change.

### Input pipeline (`@shmup/input-web` → `core/input`)

- The core only knows **actions** (`Action.Up … Action.Back`, 12 bits) packed into masks.
  Per tick and player it receives `held`, `pressed` (went down since the last tick) and
  `released` (went up), plus the device kind that produced the input.
- **Bindings are data** (decisions D13–D15): input profiles in `content/input/` are validated
  at boot (`rebind`, the `input-profiles` content owner) and applied by the apps — one
  keyboard / remote profile (`keyboard-default` on the web, `tizen-remote-safe` on the TV, a
  saved choice, `?profile=` on the web) and `gamepad-standard`. Each profile has a **`game`**
  and a **`menu`** table; the shell forwards `Game.inputContext` to `input.setContext()`
  before a frame's ticks, and a key held across a switch keeps only the actions both tables
  give it. Before a profile is applied the built-in `keymap` / `gamepad` tables are used.
  Guide: [input-profiles.md](input-profiles.md).
- Keys resolve by `KeyboardEvent.code` first and fall back to `keyCode` for TV-remote keys
  that have no `code` (Back 10009, Play/Pause 10252, Ch± 427/428). Remote profiles bind by
  `keyCode` only.
- **Held state comes from keydown/keyup only** — auto-repeat keydowns are ignored and each
  physical key is counted separately, so two keys bound to one action keep it held until
  both are released. `blur` clears all held keys.
- **Taps are latched:** a key pressed and released between two polls still appears in
  `pressed` for the next tick (important for the remote's short OK/Back presses).
- **Device quirks are profile knobs** (`input-web/remote`): a release debounce (a released
  key stays held for `releaseDebounceTicks` more ticks; a keydown inside the window resumes it
  without a new edge — hides the remote's fake keyup/keydown pairs), SOCD (`neutral` /
  `lastWins`) and a diagonal policy (`combine` / `lastWins` / `firstWins`) applied to the held
  mask with the press order.
- Pads are polled once per tick: standard-mapping buttons + left stick (radial deadzone
  0.2, 8-way with hysteresis 0.1). Pad 0 and the keyboard/remote feed player 1, pad 1
  feeds player 2.
- One `InputSnapshot` object is reused forever — `poll()` never allocates.

### Rendering pipeline (`@shmup/render-pixi`)

Details: [rendering-and-shell.md](rendering-and-shell.md).

- Pixi v8 `WebGLRenderer` created directly (no `Application`, no Pixi ticker), WebGL**1**
  preferred because WebGL2 on Tizen 5.5 GPUs is unverified; Pixi falls back to WebGL2
  only if WebGL1 is unavailable.
- Canvas drawing buffer = CSS size (`resolution: 1`, `autoDensity: false`); the page CSS
  adds `image-rendering: pixelated` so HiDPI browsers upscale it crisply too.
- `computeIntegerViewport()` picks the largest integer scale that fits: 1920×1080 → ×5
  exactly (the M7 monitors), 1280×720 → ×3 with a 64/36 px letterbox, smaller than
  384×216 → ×1 cropped (never blurred).
- The 384×216 scene is a lifted-navy background, one container per core `LayerId` in the
  §18 draw order (the world layers in a group offset by screen shake; HUD, UI and DEBUG
  fixed), a flash quad over the world and a dim quad under the UI.
- **World sprites:** one preallocated `SpriteLayerBinding` per `SpriteBatchView` of the
  frame's `WorldView`, created when a new world object is bound; each frame it copies
  `spriteTable[spriteId] + frame`, `round(x − camX)`, `round(y − camY) + PLAYFIELD_Y`, flips,
  blink and the hit-flash sibling (D30). Every page is one texture source, so a layer's
  sprites batch into one draw call.
- **HUD and menus:** each `DrawList` (rect, sprite, text, number) is drawn into an ordered
  quad pool of 1024 sprites with the atlas's bitmap font; a list whose `revision` did not
  change is skipped.
- Zero per-frame allocation: Pixi objects are only created at load / bind time, pass options
  are reused (and reset, because Pixi writes into them), tints are only set when they change.

### Audio (`@shmup/audio-web`)

`AudioContext({ latencyHint: 'interactive' })` created lazily by the first `unlock()`,
with the bus graph `music / sfx / ui → master → destination`. Browsers need a user
gesture: `apps/web` unlocks on the first `keydown`/`pointerdown`; `apps/tizen` unlocks at
boot (no autoplay policy on TV). Volumes set before the context exists are applied when
it is created. `sfx`, `music` and `loader` are placeholders that will connect to the buses
via `WebAudio.bus(name)`.

## Lifecycle

| Event | Browser (`apps/web`) | TV (`apps/tizen`) | Effect |
|---|---|---|---|
| Boot | loading bar → content / atlas / WebGL checks → running | same, pages from `file://` | canvas `data-shmup-state` = `loading` → `running`, or `error` with the boot error screen listing every problem |
| App hidden | tab hidden (`visibilitychange`) | Home, source switch, multitasking (`visibilitychange`) | `platform.lifecycle` suspend → `game.state.suspended = true` (no ticks), held input cleared, audio suspended |
| App visible | tab visible | back to the app | resume → `suspended = false`, loop accumulator reset, audio resumed |
| User pause | `game.pause()` (no UI yet) | same | `state.paused`; survives suspend/resume — resuming the platform does not un-pause |
| Back | — (`keyboard-default`: Esc / Backspace = `Pause` in the game, `Back` in menus) | remote Back (10009) → `watchBackKey` → `platform.exit()` (before the platform exists: `tizen.application` directly); `tizen-remote-safe` also maps it to `Pause` (game) / `Back` (menus) | Today free flight is the root screen, so Back exits the TV app — also from the boot error screen, because the watcher is installed before boot; the scene stack will take over Back handling (M1-16) |
| Resize | `resize` → `renderer.resize()` | same (rare on TV) | new integer viewport |

JavaScript is frozen while a Tizen app is hidden, so nothing in the core may assume wall
time passed "normally" across a resume — the loop reset handles it.

## Platform contract

`Platform` (`packages/core/src/platform/`, `shmup_tech.md` §3.2) is everything the core
may ask of a host:

| Member | Web | Tizen | Headless (tests) |
|---|---|---|---|
| `id` | `'web'` | `'tizen'` | `'headless'` |
| `input.poll()` | `createWebInput` (`keyDevice: 'keyboard'`) + `keyboard-default` / `gamepad-standard` profiles | `createWebInput` (`keyDevice: 'remote'`) + `tizen-remote-safe` / `gamepad-standard` profiles | returns `platform.snapshot` (tests set bits) |
| `storage` | `localStorage`, prefix `shmup-cup:`, memory fallback | same | in-memory `Map` |
| `audio.unlock()` | the `WebAudio` instance | the `WebAudio` instance | resolves immediately |
| `lifecycle` | Page Visibility | Page Visibility | `platform.suspend()` / `resume()` |
| `exit` | `null` (browsers cannot quit) | `tizen.application.getCurrentApplication().exit()`, `null` outside a TV | `null` |
| `display` | live `innerWidth`/`innerHeight` | same | fixed, default 1920×1080 |
| `caps` | `remoteOnly: false`, `gamepad`, `webgl2` from the renderer | `remoteOnly: true` | all `false` |

Tizen extras live in `apps/tizen/src/platform/`: `registerRemoteKeys()` registers the
active input profile's `register` list at startup (Play/Pause and Ch± for
`tizen-remote-safe`; the fallback `REMOTE_KEYS_TO_REGISTER` adds the colour keys when no
profile is known), never `Exit` or volume (filtered whatever the list says), falling back to
per-key registration when the batch call reports an unsupported key. A saved profile choice
re-registers its keys once storage answers.

## Determinism rules

These are enforced now so that replays, golden tests and attract mode work later
(`shmup_feat.md` §22):

- The sim counts **ticks**, never milliseconds — `Date.now`, `performance.now` and
  `Math.random` are lint errors in `packages/core`.
- All sim-affecting options live in `GameConfig` (frozen, validated, recorded in replay
  headers). Presentation-only options will live elsewhere.
- Input reaches the sim only through `InputSnapshot` masks; `copyInputSnapshot()` records
  and replays them without allocating.
- Randomness comes from the seeded `rng` streams only (gameplay stream seeded from
  `GameConfig.seed`, a separate cosmetic stream for presentation) — never `Math.random`.
- Trigonometry comes from `core/math`'s committed tables: `Math.sin/cos/tan/asin/acos/
  atan/atan2/exp/log/pow/hypot/cbrt` and the `**` operator are lint errors in
  `packages/core` because engines round them differently. `+ − × ÷` and `Math.sqrt` are
  bit-exact by IEEE 754 and stay allowed.
- `packages/core/src/math/trig-table.ts` is generated and committed
  (`pnpm trig:tables`); a test regenerates it and fails if the copy is stale, so the
  numbers the sim reads are always in the source tree.
- **Zero allocations in per-tick and per-frame paths**: reuse snapshot/frame objects,
  preallocate pools (`pools` module), no closures or arrays created inside `step()` or
  `render()`; the renderer creates Pixi objects only at load and when a new `WorldView`
  is bound. The allocation guard `measureHeapGrowth` (core `test/helpers/alloc.ts`) checks
  it: `stepWorld` must stay under 256 KB over 10,000 ticks (plan §1.4).
- **State hashes**: `hashWorld(world)` covers every piece of simulated state; tests run two
  worlds in lockstep and compare hashes, and golden replays (M1-19) will compare them at
  checkpoints. New simulated state must be added to the hash.

## Module status tracking

Every `src/<module>/index.ts` (in every package and in `apps/web` / `apps/tizen`) exports
`moduleInfo = defineModule({ name, status, specRefs })` with status `placeholder`,
`partial` or `implemented`. `test/integration/module-layout.test.ts` checks that each
module has a docblock with **Responsibility**, **Implements** and **Public API** sections,
a matching `test/<module>/` folder, and spec references that point at real numbered
sections of `shmup_feat.md` / `shmup_tech.md`.

Implemented or partial today: core `platform`, `input`, `config`, `loop`, `game`,
`presentation`, `rng`, `math`, `events`, `pools`, `data` (partial: the boss section of
`enemies` and the M2 kinds are missing), `world`, `stage`, `player` (partial: hits recorded,
no death / respawn yet), `collision` (partial: no bending-laser chains yet), `debug` (partial:
state hash and flags, no controls yet), `enemies` (partial: no rank modifiers / Option Hunter
yet), `patterns` (partial: runner, movers and fire primitives — no pattern DSL yet),
`behaviors` (partial: the M1 roster), `bullets` (implemented for P0 — bending lasers and cancel
into points come with M2-02), `rank` (partial: constant rank, no growth yet); input-web `keymap`, `keyboard`, `gamepad`, `web-input`, `remote`, `rebind`
(partial: profiles, contexts, persistence hook — the rebinding UI comes in M2-16); audio-web
`web-audio`;
render-pixi `renderer`, `viewport`, `test-pattern`, `palette`, `atlas`, `layers`, `sprites`,
`text`, `ui`; shell `boot`, `loader`, `dispatch`, `error-screen`, `frame-loop`, `flight`,
`showcase`;
the apps' `boot` and `platform`. Everything else declares its intended API only. The
build-time tooling outside the packages (the asset pipeline in `scripts/assets/`, the Vite
plugins in `vite.shared.ts`) has no `moduleInfo`; it is covered by the tests under
`test/scripts/` and `test/integration/`.

## Extension points

| To add… | Do this |
|---|---|
| A new host platform (webOS, Android TV) | New `apps/<name>/` implementing `Platform` (copy `apps/tizen/src/platform/` as a start) and a thin `boot` that calls `bootShell()` if it is a browser engine (reuse `@shmup/input-web` / `audio-web`) |
| Something drawn in the world | A `SpriteBatchView` (an SoA pool or a `createSpriteBatch` mirror) in the `WorldView.batches` list — no renderer change ([rendering-and-shell.md](rendering-and-shell.md#extending-it)) |
| HUD or menu drawing | Commands into `RenderFrame.hud` / `ui` (`DrawList`: rect, sprite, text slot, number) |
| A handler for a sim event | `shell.events.on(SimEventKind.X, handler)` at load time; copy fields out of the reused record |
| A content kind validated outside core | A `ContentOwner` in the shell's `DEFAULT_CONTENT_OWNERS`, or passed to `bootShell({ contentOwners })` from both apps (an app entry replaces the default — the apps do this for `input-profiles` to keep the parsed profiles) — unowned kinds stop the boot |
| A renderer or audio back-end | Implement `IRenderer` / `IAudio` from `@shmup/core` in a new package; the apps choose which one to create |
| An input device | Produce an action mask per tick and feed it through `commitPlayerInput()` (see `createWebInput`); never expose device codes to the core. Its bindings belong in an input profile ([input-profiles.md](input-profiles.md#extending-it)) |
| An input profile or a remote tuning change | Edit `content/input/*.input-profiles.json` (format in [`content/input/README.md`](../../content/input/README.md)) — no code change |
| A game action | Append a bit to `Action` (never renumber — masks are recorded in replays), add it to `ACTION_NAMES`, the shipped input profiles and the built-in bindings in `input-web/keymap` / `gamepad` |
| An enemy, a path, a behaviour or a mover | Enemies and paths are JSON (`content/enemies/`, `content/paths/`); a behaviour is a `defineBehavior` coroutine added to `DEFAULT_BEHAVIOR_DEFS`; a mover a new `MoverKind` — [enemies-and-behaviors.md](enemies-and-behaviors.md#extending-it) |
| A bullet pattern, bullet kind or laser | A behaviour calling the `ScriptApi` fire primitives (`aimed`, `nWay`, `ring`, …, `laser`, `fireWait`); a new primitive in `core/patterns` with its `ScriptApi` wrapper; a kind in `BULLET_KINDS` — [bullets-and-patterns.md](bullets-and-patterns.md#extending-it) |
| Something the engine draws whatever the content | Add its sprite name to `ENGINE_SPRITES` (via `core/bullets` `BULLET_SPRITES` today): hosts pass it as `loadContent`'s `extraSprites` and `pnpm content:check` verifies it against the atlas |
| A game system | Fill in its placeholder module in `packages/core/src/<module>/`, set `moduleInfo.status`, export it from `packages/core/src/index.ts`, call it from its phase function in `core/world` (never reorder `WORLD_PHASES`), allocate its state in `createWorld` and add simulated state to `hashWorld` — [sim-world.md](sim-world.md#extending-it) |
| Content (enemies, weapons, stages, tilesets) | JSON under `content/` following its README, then `pnpm content:check` (try a stage with `pnpm dev` and `?stage=<id>`). New fields or a new kind: extend the schemas in `core/data` — checklist in [content-data.md](content-data.md#extending-it) |
| A stage event type or camera feature | [stage-runtime.md](stage-runtime.md#extending-it): schema in `core/data`, a `StageEventCode`, the runner's own part (if any) and the World's hook |
| A sprite or animation | A `*.sprite.json` pixel map under `assets/source/sprites/` (its path is its name) or a generator in `scripts/assets/procedural/`; `hitFlash: true` for anything the player can shoot. Real art: a PNG (+ Aseprite export) of the same name — [asset-pipeline.md](asset-pipeline.md#extending-it) |
| A sound, music or particle cue | Append a name to `SFX_CUES` / `MUSIC_CUES` / `FX_CUES` in `core/events` (never renumber — ids are recorded in replays and bound by `content/audio/` / `content/fx/`) |
| A presentation event kind | Append a code to `SimEventKind` and a name to `SIM_EVENT_KIND_NAMES`, then register a handler on the shell's dispatcher (`shell.events.on`) |
| A new entity kind | Give it an SoA pool (`createSoaPool`) registered with `world.pools.register(name, pool)` (flushed in the removal phase and hashed automatically) or an object pool (`createPool`) with a mirror batch, sized from the budgets in `shmup_feat.md` §22 |
