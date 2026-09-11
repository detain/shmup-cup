# Architecture

How the monorepo skeleton fits together at runtime: which package owns what, how one
displayed frame flows through the code, and the rules that keep the simulation
deterministic and portable. Design background: `shmup_tech.md` §3 (repo and `Platform`
interface) and `shmup_feat.md` §3 / §22 (loop, tick order, determinism).

Related pages: [repo-layout.md](repo-layout.md) (where files live),
[api-reference.md](api-reference.md) (every public export),
[build-test-deploy.md](build-test-deploy.md) (commands, Tizen build, CI),
[conventions.md](conventions.md) (rules for new code).

## Layers

```text
┌────────────────────────── host apps (thin, platform-specific) ──────────────────────────┐
│ apps/web       Vite dev app; also the renderer Electron loads                           │
│ apps/tizen     Samsung TV .wgt (Chromium 69, one classic IIFE script)                   │
│ apps/electron  desktop shell: main process + sandboxed preload, loads apps/web's build  │
└───────────────┬───────────────────────────┬───────────────────────────┬─────────────────┘
                │ implements Platform       │ creates                   │ creates
                ▼                           ▼                           ▼
┌──────────────────────┐  ┌────────────────────────────┐  ┌──────────────────────────────┐
│ @shmup/input-web     │  │ @shmup/render-pixi         │  │ @shmup/audio-web             │
│ keys/remote/pads →   │  │ IRenderer over PixiJS v8   │  │ IAudio over Web Audio        │
│ InputSnapshot        │  │ (WebGL1, 384×216 → ×N)     │  │ (interactive, buses)         │
└──────────┬───────────┘  └─────────────┬──────────────┘  └──────────────┬───────────────┘
           └─────────────────────────────┼────────────────────────────────┘
                                         ▼  (types + helpers only)
                    ┌────────────────────────────────────────────────┐
                    │ @shmup/core — pure TS, deterministic           │
                    │ Platform / IRenderer / IAudio contracts,       │
                    │ input snapshots, config, fixed-step loop,      │
                    │ createGame(), every game system (placeholders) │
                    └────────────────────────────────────────────────┘
```

- **`@shmup/core` imports nothing** from the workspace, no DOM/WebGL/audio/Node/Tizen
  APIs, no clocks and no `Math.random`. `tsconfig.json` gives it only the ES2018 lib and
  ESLint layer 4 rejects the globals and imports (see [conventions.md](conventions.md)).
- **Presentation packages depend only on core.** They implement core's contracts
  (`IRenderer`, `IAudio`, `PlatformInput`) and never call each other.
- **Apps are composition roots.** `src/boot/` in each app creates the input adapter,
  audio back-end, renderer, `Platform` and game, then drives them from
  `requestAnimationFrame`. Electron has no game code of its own — it serves the
  `apps/web` build over `app://game/`.

## The hard sim / presentation split

The simulation (`createGame` and, later, every system under `packages/core/src/`) never
calls the renderer or the mixer. Each displayed frame the host:

1. calls `game.frame(now)` — the core runs 0…`maxTicksPerFrame` fixed ticks;
2. reads a read-only view with `game.renderFrame()` and hands it to `renderer.render()`;
3. (later) drains the core's `events` queue into the renderer (particles, shake) and the
   mixer (SFX, music). The queue and its cue registries exist today (`core/events`); the
   systems that fill it and the host-side dispatcher arrive with the sim (M1-06) and the
   FX/audio steps (M1-14, M1-15).

Because nothing flows from presentation back into the sim except input, the same core
runs headless in Vitest (`createHeadlessPlatform`), can fast-forward, and will replay
recorded input bit-for-bit (`test/integration/input-replay.test.ts` already checks the
input side of that contract).

## One frame, end to end

```text
requestAnimationFrame(now)                       apps/*/src/frame-loop
 └─ game.frame(now)                              core/game
     └─ loop.advance(now)                        core/loop: delta snapping, accumulator, cap
         └─ repeat 0..4×: step()
             ├─ platform.input.poll()            input-web/web-input (once per tick)
             │   ├─ keyboard.held + consumeLatched()   input-web/keyboard
             │   ├─ readGamepadActions(pad 0..3)       input-web/gamepad
             │   └─ commitPlayerInput(p1/p2, …)        core/input: pressed/released edges
             └─ state.tick++                     (game systems will run here, fixed order)
 └─ renderer.render(game.renderFrame())          render-pixi/renderer
     ├─ testPattern.update(tick)                 render-pixi/test-pattern (marker x = tick)
     ├─ pass 1: scene → 384×216 RenderTexture    nearest sampling, no antialias
     └─ pass 2: one sprite, integer scale ×N, centred on the canvas (letterbox around it)
```

The fixed tick order the systems will follow inside `step()` (`shmup_feat.md` §22):
`input → player move → stage events/spawns → scripts → movement → collision → damage →
deferred removal → emit events`.

### Fixed-step loop (`core/loop`)

- Tick length = `1000 / tickRate` ms (16.67 ms at 60 Hz).
- **Delta snapping:** a frame delta within ±1 ms (`DEFAULT_SNAP_TOLERANCE_MS`) of a whole
  number of ticks counts as exactly that many ticks. On a 60 Hz display this yields
  exactly one tick per rAF despite timer jitter.
- Other refresh rates (50/120/144 Hz) accumulate time; `alpha` (0 ≤ α < 1) is the
  leftover fraction for interpolated rendering (not used by the test pattern yet).
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
  reset)` for the ≤ 100 pooled objects (enemies, boss parts). Nothing allocates after
  creation.

### Input pipeline (`@shmup/input-web` → `core/input`)

- The core only knows **actions** (`Action.Up … Action.Back`, 12 bits) packed into masks.
  Per tick and player it receives `held`, `pressed` (went down since the last tick) and
  `released` (went up), plus the device kind that produced the input.
- Keys resolve by `KeyboardEvent.code` first and fall back to `keyCode` for TV-remote keys
  that have no `code` (Back 10009, Play/Pause 10252, Ch± 427/428).
- **Held state comes from keydown/keyup only** — auto-repeat keydowns are ignored and each
  physical key is counted separately, so two keys bound to one action keep it held until
  both are released. `blur` clears all held keys.
- **Taps are latched:** a key pressed and released between two polls still appears in
  `pressed` for the next tick (important for the remote's short OK/Back presses).
- Pads are polled once per tick: standard-mapping buttons + left stick (radial deadzone
  0.2, 8-way with hysteresis 0.1). Pad 0 and the keyboard/remote feed player 1, pad 1
  feeds player 2.
- One `InputSnapshot` object is reused forever — `poll()` never allocates.

### Rendering pipeline (`@shmup/render-pixi`)

- Pixi v8 `WebGLRenderer` created directly (no `Application`, no Pixi ticker), WebGL**1**
  preferred because WebGL2 on Tizen 5.5 GPUs is unverified; Pixi falls back to WebGL2
  only if WebGL1 is unavailable.
- Canvas drawing buffer = CSS size (`resolution: 1`, `autoDensity: false`); the page CSS
  adds `image-rendering: pixelated` so HiDPI browsers upscale it crisply too.
- `computeIntegerViewport()` picks the largest integer scale that fits: 1920×1080 → ×5
  exactly (the M7 monitors), 1280×720 → ×3 with a 64/36 px letterbox, smaller than
  384×216 → ×1 cropped (never blurred).
- `PixiRenderer.scene` is the 384×216 root container later steps attach layers to
  (`layers`, `sprites`, `ui`, `text`, `particles`, `effects`, `debug` are placeholders).

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
| App hidden | tab hidden (`visibilitychange`) | Home, source switch, multitasking (`visibilitychange`) | `platform.lifecycle` suspend → `game.state.suspended = true` (no ticks), held input cleared, audio suspended |
| App visible | tab visible | back to the app | resume → `suspended = false`, loop accumulator reset, audio resumed |
| User pause | `game.pause()` (no UI yet) | same | `state.paused`; survives suspend/resume — resuming the platform does not un-pause |
| Back | — (Esc/Backspace map to `Action.Back`) | remote Back (10009) → `watchBackKey` → `platform.exit()` | Today the calibration screen is the root screen, so Back exits the TV app; the scene stack will take over Back handling |
| Resize | `resize` → `renderer.resize()` | same (rare on TV) | new integer viewport |

JavaScript is frozen while a Tizen app is hidden, so nothing in the core may assume wall
time passed "normally" across a resume — the loop reset handles it.

## Platform contract

`Platform` (`packages/core/src/platform/`, `shmup_tech.md` §3.2) is everything the core
may ask of a host:

| Member | Web | Tizen | Headless (tests) |
|---|---|---|---|
| `id` | `'web'` | `'tizen'` | `'headless'` |
| `input.poll()` | `createWebInput` (`keyDevice: 'keyboard'`) | `createWebInput` (`keyDevice: 'remote'`) | returns `platform.snapshot` (tests set bits) |
| `storage` | `localStorage`, prefix `shmup-cup:`, memory fallback | same | in-memory `Map` |
| `audio.unlock()` | the `WebAudio` instance | the `WebAudio` instance | resolves immediately |
| `lifecycle` | Page Visibility | Page Visibility | `platform.suspend()` / `resume()` |
| `exit` | `null` (browsers cannot quit) | `tizen.application.getCurrentApplication().exit()`, `null` outside a TV | `null` |
| `display` | live `innerWidth`/`innerHeight` | same | fixed, default 1920×1080 |
| `caps` | `remoteOnly: false`, `gamepad`, `webgl2` from the renderer | `remoteOnly: true` | all `false` |

Tizen extras live in `apps/tizen/src/platform/`: `registerRemoteKeys()` registers
Play/Pause, Ch± and the colour keys at startup (never `Exit` or volume), falling back to
per-key registration when the batch call reports an unsupported key.

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
  `render()`.

## Module status tracking

Every `src/<module>/index.ts` (in every package and in `apps/web` / `apps/tizen`) exports
`moduleInfo = defineModule({ name, status, specRefs })` with status `placeholder`,
`partial` or `implemented`. `test/integration/module-layout.test.ts` checks that each
module has a docblock with **Responsibility**, **Implements** and **Public API** sections,
a matching `test/<module>/` folder, and spec references that point at real numbered
sections of `shmup_feat.md` / `shmup_tech.md`.

Implemented or partial today: core `platform`, `input`, `config`, `loop`, `game`,
`presentation`, `rng`, `math`, `events`, `pools`; input-web `keymap`, `keyboard`, `gamepad`, `web-input`; audio-web
`web-audio`; render-pixi `renderer`, `viewport`, `test-pattern`, `palette`; the apps'
`boot`, `platform`, `frame-loop`. Everything else declares its intended API only.

## Extension points

| To add… | Do this |
|---|---|
| A new host platform (webOS, Android TV) | New `apps/<name>/` implementing `Platform` (copy `apps/tizen/src/platform/` as a start) and a `boot` composition root; reuse `@shmup/input-web` / `render-pixi` / `audio-web` if it is a browser engine |
| A renderer or audio back-end | Implement `IRenderer` / `IAudio` from `@shmup/core` in a new package; the apps choose which one to create |
| An input device | Produce an action mask per tick and feed it through `commitPlayerInput()` (see `createWebInput`); never expose device codes to the core |
| A game action | Append a bit to `Action` (never renumber — masks are recorded in replays), add it to `ACTION_NAMES` and the default bindings in `input-web/keymap` / `gamepad` |
| A game system | Fill in its placeholder module in `packages/core/src/<module>/`, set `moduleInfo.status`, export it from `packages/core/src/index.ts`, call it from `step()` in the fixed tick order |
| Content (enemies, weapons, stages) | JSON under `content/` following its README; validation belongs to `core/data` |
| A sound or music cue | Append a name to `SFX_CUES` / `MUSIC_CUES` in `core/events` (never renumber — ids are recorded in replays and bound by `content/audio/`) |
| A presentation event kind | Append a code to `SimEventKind` and a name to `SIM_EVENT_KIND_NAMES`, then handle it in the host's drain dispatcher |
| A new entity kind | Give it an SoA pool (`createSoaPool`) or an object pool (`createPool`) sized from the budgets in `shmup_feat.md` §22, `flush()` it in the deferred-removal phase of the tick |
