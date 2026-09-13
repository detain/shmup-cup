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
lasers, fire primitives, rank), [pattern-dsl.md](pattern-dsl.md) (the bullet pattern DSL, bending
lasers, cancel points, colour-blind palettes), [weapons-and-options.md](weapons-and-options.md) (player
weapons, loadouts, autofire, hits on enemies, trailing Options),
[meter-arsenal.md](meter-arsenal.md) (Types B–D, Weapon Edit, the `!` / `?` choices, the weapon
select and its live preview),
[scenes-and-ui.md](scenes-and-ui.md) (the scene stack and flow, menus, the HUD),
[saves-and-options.md](saves-and-options.md) (the versioned save, user options, the Options
screen), [difficulty-and-rank.md](difficulty-and-rank.md) (difficulty presets, rank growth,
extends, continues, the difficulty menu and the continue countdown).

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
       │              │ event dispatch, rAF loop, scene view + dev  │    │
       │              │ scenes, debug tools (dev / test builds)     │    │
       │              └──────────────────────┬──────────────────────┘    │
       ▼                                     ▼ creates                   ▼
┌──────────────────────┐  ┌────────────────────────────┐  ┌──────────────────────────────┐
│ @shmup/input-web     │  │ @shmup/render-pixi         │  │ @shmup/audio-web             │
│ keys/remote/pads →   │  │ IRenderer over PixiJS v8   │  │ IAudio over Web Audio        │
│ InputSnapshot        │  │ atlas, layers, sprites,    │  │ (interactive, buses); synth, │
│                      │  │ bitmap text, draw lists    │  │ SFX voices, music, engine    │
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
                    │ scripts + movers, bullets + lasers, rank,      │
                    │ player weapons + Options, power-ups, shields,  │
                    │ death / respawn, score, fx timers, the scene   │
                    │ stack + flow, canvas UI kit, HUD, Options      │
                    │ screen, versioned saves + user options, debug  │
                    │ switches + controls, replays + state hashes    │
                    └────────────────────────────────────────────────┘
```

- **`@shmup/core` imports nothing** from the workspace, no DOM/WebGL/audio/Node/Tizen
  APIs, no clocks and no `Math.random`. `tsconfig.json` gives it only the ES2018 lib and
  ESLint layer 4 rejects the globals and imports (see [conventions.md](conventions.md)).
- **Presentation packages depend only on core.** They implement core's contracts
  (`IRenderer`, `IAudio`, `PlatformInput`) and never call each other.
- **`@shmup/shell` is the one boot path of the browser hosts** (M1-04, decision D34). It
  depends on core and render-pixi (which also owns the `fx` content kind since M1-14), on
  audio-web for the `sfx` / `music` content kinds and the audio engine it creates (M1-15), and on
  input-web only for the default owner of the `input-profiles` content (M1-05, allowed by plan
  §3.1); the input and audio *adapters* reach
  it through interfaces (`ShellInput` = `PlatformInput` + `clear` / `setContext` / optional
  `setSeats` (M2-06) / `destroy`,
  `IAudio` — plus, optionally, the `context` / `bus()` graph a `WebAudio` exposes for the
  engine), so the shell never creates them itself.
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
   queue belongs to the World (`game.events === game.world.events` — since M1-16 one queue per
   session that every World of the scene flow pushes into, with the menus' sounds and the scenes'
   music, via `WorldOptions.events`); the stage pushes `Music`
   (M1-07), the enemies push explosion `Sfx` / `Particles` and `FormationBonus` (M1-08), bullet
   cancels push `Particles` (`FX_CUES.BulletCancel`, M1-09), the player weapons push their
   `Sfx` cues (`PlayerShot`, `PlayerMissile`, `Clink` — M1-10), the scoring pushes `Score`
   (M1-14); since M1-14 the shell's `connectFxEvents` feeds particles, shake, flash, dim and
   score popups to the renderer ([fx-and-game-feel.md](fx-and-game-feel.md)), and since M1-15
   `connectAudioEvents` feeds `Sfx`, `Music` and `MusicDuck` to the audio engine, whose SFX
   dedupe window `engine.endFrame()` closes after the drain ([audio.md](audio.md));
3. reads the read-only `RenderFrame` with `game.renderFrame()` — world sprite batches, HUD and
   UI draw lists, screen effects (plan §3.4) — and hands it to `renderer.render()`.

Because nothing flows from presentation back into the sim except input, the same core
runs headless in Vitest (`createHeadlessPlatform`), can fast-forward, and replays recorded
input bit-for-bit: `core/replay` (M1-19) records a session's input per tick and plays it back
with state-hash desync detection, and the golden zone A replays in `test/golden/` are checked by
every `pnpm test` ([debug-and-replays.md](debug-and-replays.md)).

## One frame, end to end

```text
requestAnimationFrame(now)                       shell/frame-loop
 └─ game.inputContext changed? → input.setContext(ctx)   shell/boot → input-web: game/menu tables
 └─ game.inputSeats changed?   → input.setSeats(n)      shell/boot → input-web: player seats (M2-06)
 └─ debug.beginFrame(now)                        shell/debug (dev / test builds only): frame time
 └─ game.frame(now)                              core/game (debug frame advance / slow-mo here)
     └─ loop.advance(now)                        core/loop: delta snapping, accumulator, cap
         └─ repeat 0..4×: step()
             ├─ platform.input.poll()            input-web/web-input (once per tick)
             │   ├─ keyboard.advance()                 age the release debounce (input-web/remote)
             │   ├─ keyboard.held + consumeLatched()   input-web/keyboard: SOCD + diagonal policy
             │   ├─ readGamepadActions(pad 0..3)       input-web/gamepad (+ the same policies)
             │   └─ commitPlayerInput(p1/p2, …)        core/input: pressed/released edges
             ├─ scenes.tick(input)               core/scenes: merge menu input, top scene only,
             │   └─ GameScene: stepWorld(world, input)   deferred transitions at the end
             │       (bare gameplay: stepWorld directly)  core/world: the 9 phases below
             └─ state.tick++
 └─ sceneView.follow()                           shell/scene-view: the camera sounds pan against
 └─ game.events.drain(dispatcher.visit)          shell/dispatch → registered handlers
     ├─ connectFxEvents (flow, free flight): emitFxCue / emitSfxCue, shake, flash, dim, popups
     └─ connectAudioEvents (flow, free flight): playSfx (panned), playMusic, duckMusic
 └─ audioEngine.endFrame()                        audio-web/sfx: closes the SFX dedupe window
 └─ debug.beforeRender()                         shell/debug → render-pixi/debug overlay (dev only)
 └─ renderer.render(frame)                       render-pixi/renderer
     │   frame = view.update(game.renderFrame()) — the scene flow (default: renderFrame runs
     │   flow.updateFrame → World view + HUD while the game shows, one UI list, the dim),
     │   free flight, showcase, calibration, fx gallery
     ├─ effects / particles / popups .step(tick delta)  render-pixi/effects + particles (M1-14)
     ├─ bindWorld(frame.world) if it is a new object   (load time only)
     ├─ particles.sync(camera), popups.sync(camera)    FX layer, world pixels → screen
     ├─ parallax.sync(view), terrain.sync(view, camera) render-pixi/layers (a stage only)
     ├─ binding.sync(batch, camX, camY) per batch      render-pixi/sprites
     ├─ lasers.sync(view.lasers, camera)               render-pixi/layers (warning lines, beams)
     ├─ bendingLasers.sync(view.bendingLasers, camera) render-pixi/layers (segments, M2-02)
     ├─ shake offset (frame + effects), flash (the brighter), playfield dim, menu dim
     ├─ hudView.draw(hud), uiView.draw(ui)             render-pixi/ui + text (skipped if unchanged)
     ├─ pass 1: scene → 384×216 RenderTexture          nearest sampling, no antialias
     └─ pass 2: one sprite, integer scale ×N, centred on the canvas (letterbox around it)
```

Inside `stepWorld` the systems run in a fixed order (plan §3.2, `shmup_feat.md` §22), kept as
the explicit array `WORLD_PHASES`: `input → players → stage → scripts → movement → collision →
damage → removal → fx`. While hit-stop is active only `input` and `fx` run (the tick still
counts, and `fx` counts the hit-stop down — exactly `n` frozen ticks for a request of `n`).
Details: [sim-world.md](sim-world.md).

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
M1-08, the enemy bullets, lasers and rank in M1-09, the player weapons and Options in M1-10 and
the power meter, capsules, Force Field and Mega Crash in M1-11, death, respawn, lives, score
and the game-feel timers in M1-12, the bosses with their WARNING and death sequence in M1-13,
rank growth, extends and continues in M2-01, the pattern DSL's interpreter, bending lasers
and cancel point items in M2-02, the meter arsenal — Types B–D, Weapon Edit and the `!` / `?`
choices of the config — in M2-03, the Option types, the meter shields, the Option Hunter
and the blue capsule in M2-04 ([options-shields-hunter.md](options-shields-hunter.md)), and
Direct mode — the MANTA's colour items, shot families and the Arm, flown when the ship select's
choice sets `GameConfig.shipId` / `powerUpMode` — in M2-05 ([direct-mode.md](direct-mode.md)), and
two-player co-op — player 2's drop-in join in phase 1, per-player continues, the co-op drop
scaling — in M2-06 ([coop.md](coop.md)), and the advanced stage systems — destructible terrain,
moving blocks, pull fields and chains in `world.gimmicks` (`core/stage` `StageGimmicks`), holds,
diagonal pans, branches and region triggers in the runner — in M2-07
([advanced-stages.md](advanced-stages.md)).
Details: [sim-world.md](sim-world.md), [stage-runtime.md](stage-runtime.md),
[enemies-and-behaviors.md](enemies-and-behaviors.md),
[bullets-and-patterns.md](bullets-and-patterns.md),
[weapons-and-options.md](weapons-and-options.md),
[powerups-and-shields.md](powerups-and-shields.md),
[death-and-scoring.md](death-and-scoring.md),
[bosses-and-warning.md](bosses-and-warning.md),
[difficulty-and-rank.md](difficulty-and-rank.md),
[pattern-dsl.md](pattern-dsl.md).

- **`world`** — `createWorld(config, content)` allocates the session: tick counter, RNG
  streams, event queue, two `PlayerShip`s (P2 inactive until it joins a co-op game — M2-06,
  [coop.md](coop.md)), the camera, the stage
  `config.stage` names (runner, collision map, parallax and terrain views — or none: free
  flight with a static camera), the enemy system, the rank, the bullet system, the weapon
  system (with `config.loadout` applied), the power-up system, the scoring system and the boss
system, status,
  hit-stop and the fx timers, debug flags, the SoA pool
  registry (flushed in phase 8, hashed), a broad-phase grid over the camera view and the
  `WorldView` the renderer draws. `stepWorld(world, input)` runs one tick and never allocates;
  bare gameplay hosts one World per session (`game.world`), the scene flow's game scene a fresh
  one per game start and RETRY STAGE, on the difficulty chosen under START
  ([scenes-and-ui.md](scenes-and-ui.md)). Since M2-01 the World recomputes its rank at the end of
  phase 3 (`updateWorldRank`) and can be continued after a game over (`canContinue` /
  `continueWorld`: fresh lives, the last checkpoint — the scene flow's countdown decides).
- **`stage`** — the stage runner (phase 3): the camera path (linear speed ramps, eased
  vertical pans, scroll locks that stop the camera exactly, and the WARNING's brake to a lock
  wherever the camera is — M1-13), the sorted event timeline fired through a cursor into the
  World's hooks (`spawn` / `formation` → the enemy system, `warning` / `boss` → the boss system,
  music events → presentation events, `end` → `stageClear`), invisible checkpoints with
  `restartAt`, and the terrain / parallax views. All runner state is one hashed `Float64Array`.
  Since M2-07: timed scroll stops (`hold`), diagonal pans (`yOver`), in-stage branches (an event
  fires only while its branch's flag has the branch's value) and region triggers the World
  probes with its ships; `stage/systems.ts` holds the World-side stage gimmicks — the
  destructible terrain (regrowth, the checkpoint rollback, the renderer's change log), the moving
  blocks of `block` events, the pull fields and chains of gimmick scripts.
- **`enemies`**, **`patterns`**, **`behaviors`** — 64 enemies in fixed slots, spawned by the
  timeline (single enemies or formations that drop a capsule and pay a bonus when every member
  is killed), driven by **behaviour coroutines** — generators that sleep by yielding a tick
  count and are resumed only when they wake (D29) — and moved every tick by numeric **movers**
  (straight, sine, arc-length spline path, waypoint, follow-the-leader, ground crawl, homing,
  aimed dash, and since M2-07 ballistic arcs with a proximity trigger and a landing rule).
  Off-screen / settle rules, contact with the ships through the grid
  (`playerHit(Contact)`), hit flash, explosion events, tick outcomes for the capsule and score
  steps; enemies and formations are hashed. Behaviours fire through `ScriptApi` primitives that
  enforce the fire rule (on screen, settled, not a ghost). Since M2-02 attacks can also be
  **data**: `content/patterns/` files are compiled at load (`core/patterns` `dsl.ts`: a
  recursive-descent expression parser, constant folding, `actionRef` / `bulletRef` inlined) into
  one `Float64Array` program bank, and the World's `PatternVm` (`world.patterns`: 64 emitters +
  512 bullet program runners in typed arrays, hashed) runs them — an enemy's pattern from its
  `pattern.loop` coroutine (the pattern's `wait`s are the coroutine's sleeps), a bullet's own
  program inside the bullet update — without allocating ([pattern-dsl.md](pattern-dsl.md)).
- **`bullets`**, **`rank`** — the enemy bullets (a 512-slot SoA pool that is also the
  `ENEMY_BULLETS` sprite batch) with acceleration, turning, delays, changes and capped homing,
  riding the camera and dying outside the view or on terrain; 16 telegraphed lasers (warning
  line → grow → full-width beam, the only phase with a hitbox → fade), attached to their enemy
  or fixed; brute-force collision with the ships (`playerHit(Bullet / Laser)`); bullet cancel.
  Since M2-02 also 8 **bending lasers** (a homing head recording a 64-node ring, hit by a chain of
  overlapping circles) and bullets **cancelled into point items** (a boss's death, a Mega Crash)
  that fly to the credited player's score (`content/rules/` `scoring`).
  The fire primitives of `patterns` (aimed, N-way, ring, spiral, stack, spray, homing,
  delayed) scale bullet speeds and fire intervals by the session's rank — constant in M1, since
  M2-01 `base + floor(growth × (stage / loop / power terms))` (0–31, 16 on loop 1; Normal starts
  at 2, where every curve is exactly 1), times the preset's bullet speed multiplier; enemies may
  follow the curves more or less strongly (rank modifiers) and fire revenge bullets when shot
  down at a high rank ([difficulty-and-rank.md](difficulty-and-rank.md)).
- **`weapons`**, **`options`** — the player shots (a 96-slot SoA pool drawn through a mirror
  batch, lasers as rows of segments) of meter mode's Type A arsenal compiled from
  `content/weapons/` (main shot, Double pair, piercing Laser that grows and follows its shooter,
  Missile that falls and slides along the floor), one loadout per player (`GameConfig.loadout`
  at creation), always-on autofire paced by `GameConfig.autofireInterval` / `missileInterval`
  with caps per shooter; since M2-03 the arsenal is the config's (`weaponPreset` Type A–D,
  `weaponEdit`) with nine more behaviours — Spread Bomb blasts, 2-Way volleys, the Photon Torpedo,
  Tail Gun / Vertical / Free Way pairs, Ripple rings, Cyclone and Twin beams
  ([meter-arsenal.md](meter-arsenal.md)); shots ride the camera, die on terrain, and hit the enemies through the
  grid (phase 6 finds the hits — equal to brute force — phase 7 applies them: armour clinks,
  piercing shots keep per-enemy cooldowns, kills are credited to a player). Up to four Options
  per ship follow a screen-space trail that advances only with movement input (D26) — or, since
  M2-04, fly as a pulled Snake chain, a `>` / `V` Formation or a Rotate orbit
  (`GameConfig.optionChoice`; spread by holding PowerUp or pressing Special) — and fire every
  weapon with their own caps. In Direct mode (M2-05) the same pool and hit path fire the
  content's 9-level shot **families** instead: every weapon a family fires gets a direct role
  after the four meter roles, and each level is a volley of emitters (heading, offset) paced by
  the main / missile timers ([direct-mode.md](direct-mode.md#families-and-firing-coreweapons)).
- **`powerups`**, **`shields`** — meter mode's economy: a 7-slot power meter per player
  (`SPEED | MISSILE | DOUBLE | LASER | OPTION | ? | !`) advanced by every capsule and equipped on
  the **pressed edge** of `PowerUp` (remote OK) in phase 2, maxed slots greyed, Double / Laser
  exclusive, an optional Auto Power-Up order; capsules in a 32-slot world-space SoA pool, spawned
  from the enemies' drops (carriers, completed formations), pulled by a 16-px pickup magnet and
  collected by the ships' pickup boxes; Mega Crash (the `!` slot: cancels bullets, destroys every
  non-immune enemy, screen flash). The Force Field lives on the ship (`PlayerShip.shield`):
  `playerHit` hands every hit to it first — 5 hits, 8-tick shield-hit i-frames, never terrain.
  Since M2-04 the `?` choice may instead be Reduce (a field that shrinks every hurt-circle test)
  or a pod shield (front, Free, Rotate: pods that stop only the bullets and bodies touching them,
  each wearing on its own); the blue capsule clears the enemies on screen, and freed Options
  (from a dead Option Hunter) drift as items. **Direct mode** (M2-05) has no meter: the
  mode-agnostic `powerup` drop (and a `capsule`) becomes the stage's next planned colour item —
  red / green a shot / sub-weapon level, blue the **Arm** (green / silver / gold, 3 / 4 / 5 hits,
  absorbs terrain too), orange a 1UP, yellow a smart bomb, the octagon the next main-shot family —
  and the Speed press (remote Ch−) cycles the ship's speeds ([direct-mode.md](direct-mode.md)).
- **`bosses`** — one multi-part boss per World (M1-13), an `enemies` entry with a `boss`
  section: up to 16 parts placed parent + offset every tick (riding the camera), sharing the
  enemies' hit path (grid ids after the 64 enemy slots, hits through `damagePart`), weak points
  that clink (armour, parts behind other parts, parts open only at times, everything during the
  intro), cores whose destruction kills it, phases that swap the running boss behaviour
  (`core/behaviors`' boss roster) on HP, destroyed parts or time. A stage `warning` event plays
  the **WARNING** (status `bossWarning`, the camera braking into a lock, siren / dim / flash /
  music events, the game's own text in `view.warning`), then the invulnerable fly-in; the
  **death sequence** cancels bullets, chains explosions (cosmetic RNG), ends in a final blast
  with hit-stop, the score tally and `stageClear`, and releases the lock.
- **`player`** — KESTREL movement from `content/player/`: speed levels (D3), diagonals × 0.7071
  (D4), no inertia, riding the camera scroll, clamped to the camera view minus margins,
  banking, a 40-tick fly-in; `playerHit` records hits (terrain contact since M1-07, enemy
  contact since M1-08, enemy bullets and lasers since M1-09) — after the ship's Force Field had
  its say (M1-11). The life cycle (M1-12): the World turns a hit recorded in phase 6 into the
  **death sequence** in phase 7 (a life gone, explosion / debris / rumble / music-duck events,
  an 8-tick hit-stop, a shake, every cancelable bullet and laser cancelled, the
  `config.deathPenalty` preset: `classic` one level, `arcade` everything plus a checkpoint
  restart at the respawn, `casual` only the shield), `dying` 24 ticks → `dead` 60 → a blinking
  respawn fly-in with 150 invulnerable ticks once control returns, and `gameOver` when no
  active ship has a life left. The difficulty preset (M2-01) chooses the lives and the penalty.
- **`scoring`**, **`fx`** — per-player scores credited in phases 3 and 7 (kills to their
  killer, a formation's bonus to the killer of its last member, 300 per capsule, boss parts and
  the boss tally to their destroyer), clamped at
  99,999,990, and the session hi-score (unhashed); since M2-01 extra lives at score thresholds
  (20,000, then every 70,000, capped at 9) and the continue count in the score's last digit; the sim-side game-feel timers — hit-stop,
  decaying integer shake and flash kinds — that push the events the presentation draws since
  M1-14 ([death-and-scoring.md](death-and-scoring.md)); every credited kill and boss part also
  pushes a `Score` event for the popups ([fx-and-game-feel.md](fx-and-game-feel.md)).
- **`collision`** — closed scalar shape tests (circle, AABB, circle–AABB, capsule–circle,
  segment–AABB), layer masks, a counting-sort uniform grid whose queries equal brute force,
  and pixel-exact terrain queries over per-tile column-height masks — since M2-07 also over the
  moving blocks, with the destructible terrain's per-cell damage on top (phase 6 tests the ship's
  terrain box, the ships and the player shots against the enemies' and boss parts' hurtboxes;
  the bullet system
  tests bullets and laser capsules against the ships by brute force, the power-up system the
  items against the ships' pickup boxes).
- **`debug`** — `hashWorld(world)`: FNV-1a over every piece of simulated state in a fixed
  order; two worlds with the same seed and input hash equal (golden replays compare them). Since
  M1-18 also the debug stage skip `skipToBoss(world)` (`StageRunner.jumpTo` to just before the
  first boss event), run by `createWorld` for `GameConfig.stageSkip: 'boss'`
  ([zone-a-and-playtest.md](zone-a-and-playtest.md#the-debug-stage-skip)); since M1-19 the
  session's debug switches (`game.debug`, shared by every World — only god mode changes a tick),
  the debug controls (`createDebugControls`: god mode, outlines, frame advance, slow motion,
  checkpoint jump, stage skip) and the overlay counters. Frame advance and slow motion live in
  `Game.frame` — they change how many ticks a frame runs, never what a tick does
  ([debug-and-replays.md](debug-and-replays.md)).
- **`replay`** (M1-19) — a header recreating the start (the whole `GameConfig`, stage,
  checkpoint, `assisted`), `held | pressed << 16` per tick and player, a state hash every 600
  ticks; the recorder and the playback are `PlatformInput`s, so a replay is fed through the same
  `platform.input.poll()` as live play.

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
  keyboard / remote profile (`keyboard-default` on the web, `tizen-remote-safe` on the TV, the
  choice kept in the save and picked in OPTIONS → CONTROLS since M1-17, `?profile=` on the web) and
  `gamepad-standard`. Each profile has a **`game`**
  and a **`menu`** table; the shell forwards `Game.inputContext` to `input.setContext()`
  before a frame's ticks, and a key held across a switch keeps only the actions both tables
  give it. Before a profile is applied the built-in `keymap` / `gamepad` tables are used.
  Guide: [input-profiles.md](input-profiles.md).
- Keys resolve by `KeyboardEvent.code` first and fall back to `keyCode` for TV-remote keys
  that have no `code` (Back 10009, Play/Pause 10252, Ch± 427/428). Remote profiles bind by
  `keyCode` only.
- **Held state comes from keydown/keyup only** — auto-repeat keydowns are ignored and each
  physical key is counted separately, so two keys bound to one action keep it held until
  both are released. `blur` clears all held keys (since M1-17 the shell's own window `blur`
  listener calls `input.clear()` too).
- **Taps are latched:** a key pressed and released between two polls still appears in
  `pressed` for the next tick (important for the remote's short OK/Back presses).
- **Device quirks are profile knobs** (`input-web/remote`): a release debounce (a released
  key stays held for `releaseDebounceTicks` more ticks; a keydown inside the window resumes it
  without a new edge — hides the remote's fake keyup/keydown pairs), SOCD (`neutral` /
  `lastWins`) and a diagonal policy (`combine` / `lastWins` / `firstWins`) applied to the held
  mask with the press order.
- Pads are polled once per tick: standard-mapping buttons + left stick (radial deadzone
  0.2, 8-way with hysteresis 0.1). Devices reach the players by **seats** (M2-06): the shell
  forwards `Game.inputSeats` to `input.setSeats()` like the context. With one seat (menus,
  one-player games) every device — every pad included — feeds player 1; with two (a co-op game)
  the keyboard / remote feeds player 1 and a pad takes player 2's seat with its first A / START
  (or the split keyboard profile's right half feeds player 2). A seat change never creates a
  press. Guide: [coop.md](coop.md#input-routing-shmupinput-web-shmupshell).
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
  fixed), a playfield-dim and a flash quad over the world and a menu-dim quad under the UI.
- **Game feel** (M1-14): the renderer owns a 256-particle pool and 16 score popups on the `FX`
  layer (below the enemy bullets) and the screen effects (integer shake, flash per kind behind
  a ≤ 3-a-second limiter, playfield dim), all advanced by simulated ticks and fed from the sim's
  events by the shell ([fx-and-game-feel.md](fx-and-game-feel.md)).
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

`AudioContext({ latencyHint: 'interactive' })` created lazily (and synchronously) by the first
`unlock()`, with the bus graph `music / sfx / ui → master → destination`. Browsers need a user
gesture: `apps/web` unlocks on the first `keydown`/`pointerdown` (gamepad buttons do not
count); `apps/tizen` unlocks at boot (no autoplay policy on TV). Volumes set before the context
exists are applied when it is created.

Since M1-15 the game's audio sits on those buses ([audio.md](audio.md)):

- **Content** — `content/audio/` binds every `SFX_CUES` cue to a synth parameter set (or a
  recorded file) with a priority tier, an instance cap, a volume and a bus, and every
  `MUSIC_CUES` cue to an original chip song (or an OGG file), optionally per stage; validated by
  the `loader` module as the shell's `sfx` / `music` content owners.
- **Loading phases only** — the shell's boot renders the SFX bank and prepares the running
  stage's music set (`stageMusicCues`) behind the progress bar with the deterministic pure-TS
  `synth` (22,050 Hz mono; sample-exact loop points); OGG files would be fetched with XHR and
  decoded through `OfflineAudioContext(2, 1, 32000)` (D22). Nothing is rendered or decoded
  mid-stage.
- **Playback** — the `engine` attaches to the buses after the unlock; `connectAudioEvents`
  feeds it the World's `Sfx` (panned from the event's x relative to the camera), `Music` and
  `MusicDuck` events. The `sfx` voice manager keeps 14 voices (per-frame dedupe, per-cue
  instance caps, stealing the lowest tier then the oldest, `critical` never stolen); the `music`
  player keeps one track resident with an intro + sample-accurate loop, fades and ducking as
  `AudioParam` ramps on the context clock.

- **Volumes** (M1-17) — the player's MASTER / MUSIC / SFX levels (0–10, saved) become bus gains
  through `volumeGain(level) = (level / 10)²`, applied at boot and live from the Options screen's
  `UserOption` events; the SFX level drives the `sfx` and `ui` buses.

Audio is pure presentation: the sim only pushes cue ids, so a muted or absent audio back-end
changes nothing in the game.

### Saves and user options (`core/save`, `core/config`)

Details: [saves-and-options.md](saves-and-options.md).

- **One versioned JSON document** under `Platform.storage` key `save.v1` (`shmup-cup:save.v1` in
  `localStorage`): the player's `UserOptions` (volumes, the input profile), hi-score tables per mode
  key (top 10, `meter-normal` in M1) and play statistics. Loading never fails the boot: JSON →
  forward migrations (`SAVE_MIGRATIONS`, the document's `version`) → a field-by-field sanitiser;
  a corrupt or unreadable text falls back to defaults and is copied to `save.corrupt`.
- **The shell reads it before the title** (after the platform exists, before the game), applies
  the volumes and the saved profile, and hands a `SaveStore` to the scene flow. The flow writes it
  when the Options screen closes and when a game ends — `SaveStore.flush()` writes only when the
  canonical text changed, so nothing is lost when the TV app is killed and nothing is written for
  nothing.
- **User options are presentation** (plan §1.5): not in `GameConfig`, replays or hashes. The
  Options screen pushes each change as a `SimEventKind.UserOption` event through the one event
  queue; the shell turns it into `setBusVolume`, asks the app to switch the input profile or —
  since M2-02 — has the renderer swap in the chosen colour-blind bullet palette
  (`setBulletPalette`: other sprite variants, the same sprite ids).

## Lifecycle

| Event | Browser (`apps/web`) | TV (`apps/tizen`) | Effect |
|---|---|---|---|
| Boot | loading bar → content / atlas / WebGL checks → save read → running | same, pages from `file://` | canvas `data-shmup-state` = `loading` → `running`, or `error` with the boot error screen listing every problem; `data-shmup-boot-ms` = the launch-to-ready time (M1-17) |
| App hidden | tab hidden (`visibilitychange`) | Home, source switch, multitasking (`visibilitychange`) | `platform.lifecycle` suspend → `game.state.suspended = true` (no ticks), held input cleared, audio suspended |
| App visible | tab visible | back to the app | resume → `suspended = false`, loop accumulator reset, audio resumed; with the game scene on top the scene flow opens the pause menu (M1-16) |
| Window loses focus | `blur` (another window, devtools) | `blur` | held input cleared (M1-17) — the key-ups of a window without focus never arrive |
| Options closed, game ended | BACK / Back on the Options screen; the game-over or stage-clear screen | same (remote only) | the save is written when it changed (M1-17); nothing is written on exit, and nothing needs to be |
| Pause menu | Esc / P / Backspace in the game | remote Back or Play/Pause in the game | the flow pushes `PauseScene` over the frozen, dimmed game; Pause / Back / RESUME close it (M1-16) |
| Host pause | `game.pause()` (no UI; a debugger) | same | `state.paused`; survives suspend/resume — resuming the platform does not un-pause |
| Back | Esc / Backspace (`keyboard-default`: `Pause` in the game, `Back` in menus); no exit | remote Back (10009): `tizen-remote-safe` maps it to `Pause` (game) / `Back` (menus); before the shell runs, `watchBackKey` exits (`tizen.application` directly) — the loading and boot error screens | The scene stack owns Back (M1-16): game → pause, pause → resume, menus → back, title → exit confirmation → `platform.exit()` after YES (the TV); in a browser the title's Back only backs out of its menu |
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
| `storage` | `localStorage`, prefix `shmup-cup:`, memory fallback — holds the save (`save.v1`, M1-17) | same (deleted with the app on uninstall) | in-memory `Map` |
| `audio.unlock()` | the `WebAudio` instance | the `WebAudio` instance | resolves immediately |
| `lifecycle` | Page Visibility | Page Visibility | `platform.suspend()` / `resume()` |
| `exit` | `null` (browsers cannot quit) | `tizen.application.getCurrentApplication().exit()`, `null` outside a TV | `null` |
| `display` | live `innerWidth`/`innerHeight` | same | fixed, default 1920×1080 |
| `caps` | `remoteOnly: false`, `gamepad`, `webgl2` from the renderer | `remoteOnly: true` | all `false` |

Tizen extras live in `apps/tizen/src/platform/`: `registerRemoteKeys()` registers the
active input profile's `register` list at startup (Play/Pause and Ch± for
`tizen-remote-safe`; the fallback `REMOTE_KEYS_TO_REGISTER` adds the colour keys when no
profile is known), never `Exit` or volume (filtered whatever the list says), falling back to
per-key registration when the batch call reports an unsupported key. Since M1-17 the saved
profile choice (read with the save before the title) and every pick in OPTIONS → CONTROLS register
the new profile's keys.

## Determinism rules

These are enforced now so that replays, golden tests and attract mode work later
(`shmup_feat.md` §22):

- The sim counts **ticks**, never milliseconds — `Date.now`, `performance.now` and
  `Math.random` are lint errors in `packages/core`.
- All sim-affecting options live in `GameConfig` (frozen, validated, recorded in replay
  headers) — debug ones too: the stage skip is `GameConfig.stageSkip` (M1-18), so a replay of a
  skipped session skips the same way. Presentation-only options live in `core/config` `UserOptions` (M1-17 — volumes, the
  input profile), persisted by `core/save` and never seen by the simulation.
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
  worlds in lockstep and compare hashes, and the golden replays (`test/golden/`, M1-19) compare
  them every 600 ticks and at the end of four committed zone A runs — any change to what the sim
  does fails `pnpm test` until it is re-blessed (`pnpm golden:update`, the reason in the commit
  message). New simulated state must be added to the hash. The headless playtest
  (`test/playtest/`, M1-18) records a bot's input per tick and replays it to the same deaths and
  final hash.
- **Debug tools never desync**: the only sim-affecting switch is god mode (a replay header's
  `assisted`); the stage jumps are cold restarts a replay reproduces when it contains them; frame
  advance and slow motion only change how many ticks a displayed frame runs. The tools exist
  only in dev / test builds (`__SHMUP_DEV__`).

## Module status tracking

Every `src/<module>/index.ts` (in every package and in `apps/web` / `apps/tizen`) exports
`moduleInfo = defineModule({ name, status, specRefs })` with status `placeholder`,
`partial` or `implemented`. `test/integration/module-layout.test.ts` checks that each
module has a docblock with **Responsibility**, **Implements** and **Public API** sections,
a matching `test/<module>/` folder, and spec references that point at real numbered
sections of `shmup_feat.md` / `shmup_tech.md`.

Implemented or partial today: core `platform`, `input`, `config` (partial: `GameConfig` with the difficulty
presets since M2-01 and, since M1-17, the `UserOptions` — display options later), `loop`, `game`,
`presentation`, `rng`, `math`, `events`, `pools`, `save` (M1-17), `data` (partial: `rules` since M2-01, `patterns` since M2-02 —
`campaign` and `strings` are missing), `world`, `stage`, `player` (implemented for P0 since
M1-12; co-op joining lives in `world` since M2-06), `collision` (implemented with M2-07: moving blocks and destructible tiles — the bending lasers' circle chains live in `bullets`), `debug` (M1-19: state hash, switches, controls,
counters, the stage skip and checkpoint jumps), `replay` (M1-19), `enemies` (partial: rank modifiers and revenge bullets since M2-01, the Option Hunter and
the blue capsule's clear since M2-04), `patterns` (implemented with M2-02: runner, movers, fire primitives and the pattern DSL),
`behaviors` (partial: the M1 enemy and boss rosters, `pattern.loop`, `hunter.option`, `cube.pincer`, the six stage gimmicks of M2-07), `bosses` (partial: the P0 mechanics —
timers, escapes, the HP bar, mid-bosses and raids with M2-09), `bullets` (implemented: bending lasers and cancel
into points since M2-02 — graze is P2), `rank` (implemented with M2-01: growth, power terms, per-enemy sensitivity), `weapons`
(implemented: Types A–D and Weapon Edit with M2-03, the Direct-mode families with M2-05), `options` (implemented with M2-04: trail, Snake, Formation, Rotate — recovery after death in M3),
`powerups` (implemented with M2-05: meter mode, the `!` / `?` choices since M2-03, the blue capsule and freed Options since M2-04, Direct mode's items, plan and Speed toggle), `shields` (implemented: the meter shields with M2-04, the Arm with M2-05), `scoring` (partial:
scores, the session hi-score, extends and the continue digit — per player, co-op included, since M2-06), `fx` (partial: the
hit-stop / shake / flash requests — slowdown later), `ui` (partial: the list menu, slider,
toggle, choice and confirm widgets, builders and the HUD with the Direct-mode tier pips since M2-05 and the co-op halves since M2-06 —
rebind prompt, name entry and the boss HP bar later), `scenes` (partial: the scene stack, the M1 flow, the Options screen, the difficulty
menu and the continue countdown, the weapon select with its live preview and the Auto order editor
(M2-03; its OPTION row M2-04), the ship select (M2-05), 1 PLAYER / 2 PLAYERS and the co-op rules (M2-06) — the other M2 screens later);
input-web `keymap`, `keyboard`, `gamepad`, `web-input` (implemented with M2-06's seats), `remote`, `rebind`
(partial: profiles, contexts, the selectable profiles of CONTROLS — the rebinding UI comes in
M2-16); audio-web `web-audio` (partial; driven by the Options sliders since M1-17), `synth`, `sfx`,
`music`, `loader`,
`engine`;
render-pixi `renderer`, `viewport`, `test-pattern`, `palette` (partial: the colour-blind bullet palette tables since
M2-02 — palette cycling later), `atlas`, `layers`, `sprites`,
`text`, `ui`, `particles`, `effects` (partial: shake, flash, dim, popups — raster and palette
effects later), `debug` (the overlay, M1-19); shell `boot`, `loader`, `dispatch`, `error-screen`,
`frame-loop`, `scene-view`, `flight`, `showcase`, `fx-gallery`, `debug` (M1-19);
the apps' `boot` and `platform`. Everything else declares its intended API only. The
build-time tooling outside the packages (the asset pipeline in `scripts/assets/`, the Vite
plugins in `vite.shared.ts`) has no `moduleInfo`; it is covered by the tests under
`test/scripts/` and `test/integration/`.

## Extension points

| To add… | Do this |
|---|---|
| A new host platform (webOS, Android TV) | New `apps/<name>/` implementing `Platform` (copy `apps/tizen/src/platform/` as a start) and a thin `boot` that calls `bootShell()` if it is a browser engine (reuse `@shmup/input-web` / `audio-web`) |
| Something drawn in the world | A `SpriteBatchView` (an SoA pool or a `createSpriteBatch` mirror) in the `WorldView.batches` list — no renderer change ([rendering-and-shell.md](rendering-and-shell.md#extending-it)) |
| HUD or menu drawing | The HUD is `core/ui` `buildHud` (add what it depends on to `Hud.update`); menus are `core/ui` widgets drawn by a scene's `drawUi` into the flow's one UI list (`DrawList`: rect, sprite, text slot, number) — [scenes-and-ui.md](scenes-and-ui.md#extending-it) |
| A saved option, a save field or a statistic | `UserOptions` / `resolveUserOptions` in `core/config`, a `SAVE_MIGRATIONS` step + `sanitizeSave` / `serializeSave` in `core/save` — [saves-and-options.md](saves-and-options.md#extending-it) |
| A screen or overlay (select screens, more option groups …) | A `SceneBase` subclass in `core/scenes` created by `createSceneFlow`, with its own string-slot range, pushed / replaced from another scene's `tick` — [scenes-and-ui.md](scenes-and-ui.md#extending-it) |
| A handler for a sim event | `shell.events.on(SimEventKind.X, handler)` at load time; copy fields out of the reused record |
| A content kind validated outside core | A `ContentOwner` in the shell's `DEFAULT_CONTENT_OWNERS`, or passed to `bootShell({ contentOwners })` from both apps (an app entry replaces the default — the apps do this for `input-profiles` to keep the parsed profiles) — unowned kinds stop the boot |
| A renderer or audio back-end | Implement `IRenderer` / `IAudio` from `@shmup/core` in a new package; the apps choose which one to create |
| An input device | Produce an action mask per tick and feed it through `commitPlayerInput()` (see `createWebInput`); never expose device codes to the core. Its bindings belong in an input profile ([input-profiles.md](input-profiles.md#extending-it)) |
| An input profile or a remote tuning change | Edit `content/input/*.input-profiles.json` (format in [`content/input/README.md`](../../content/input/README.md)) — no code change |
| A game action | Append a bit to `Action` (never renumber — masks are recorded in replays), add it to `ACTION_NAMES`, the shipped input profiles and the built-in bindings in `input-web/keymap` / `gamepad` |
| An enemy, a path, a behaviour or a mover | Enemies and paths are JSON (`content/enemies/`, `content/paths/`); a behaviour is a `defineBehavior` coroutine added to `DEFAULT_BEHAVIOR_DEFS`; a mover a new `MoverKind` — [enemies-and-behaviors.md](enemies-and-behaviors.md#extending-it) |
| A zone (a stage with its roster and boss) | JSON under `content/stages/`, `content/enemies/`, `content/paths/`; `pnpm content:check`; a playtest run with the 4-way bot (`test/playtest/`) and its design-rule checks — [zone-a-and-playtest.md](zone-a-and-playtest.md#extending-it) |
| A boss or a boss behaviour | A boss is an `enemies` entry with a `boss` section (parts, weak points, phases) started by a stage `warning` event; a boss behaviour is a `defineBossBehavior` coroutine added to `DEFAULT_BOSS_BEHAVIOR_DEFS` — [bosses-and-warning.md](bosses-and-warning.md#extending-it) |
| An item kind, a meter slot rule or a shield kind | `ITEM_KINDS` / `ItemKind` (appended), the meter's `canEquipSlot` / `equipSlot` and Auto Power-Up rules, a `ShieldSpec` in `SHIELD_SPECS` — [powerups-and-shields.md](powerups-and-shields.md#extending-it); a Direct-mode colour item or plan — [direct-mode.md](direct-mode.md#extending-it) |
| A player ship | A `content/player/` entry with its `mode` (`meter` / `direct`) and sprite — the ship select lists it ([direct-mode.md](direct-mode.md#extending-it)); the pipeline derives player 2's `<sprite>@p2` palette swap for every `ships/*` sprite ([coop.md](coop.md#player-2s-palette-swap)) |
| A co-op rule (a join button, a leave, more players) | [coop.md](coop.md#extending-it) — anything that changes the sim must come through recorded input |
| A bullet pattern, bullet kind or laser | Since M2-02 a pattern is data: a `content/patterns/` action run by `pattern.loop` ([pattern-dsl.md](pattern-dsl.md#extending-it)); or a behaviour calling the `ScriptApi` fire primitives (`aimed`, `nWay`, `ring`, …, `laser`, `bendingLaser`, `fireWait`); a new primitive in `core/patterns` with its `ScriptApi` wrapper; a kind in `BULLET_KINDS` — [bullets-and-patterns.md](bullets-and-patterns.md#extending-it) |
| A weapon, a weapon behaviour, a preset, a Direct-mode family or an Option formation | A weapon is JSON in `content/weapons/` (tunables in `params`, a `name` for the weapon select); a preset is a `presets` entry the weapon select lists; a family is a `families` entry the MANTA fires (M2-05 — [direct-mode.md](direct-mode.md#extending-it)); a behaviour is a `ShotKind` plus its tables, a HUD label frame and a branch of the weapon system's `update()`; formations branch in `OptionGroup.follow` — [weapons-and-options.md](weapons-and-options.md#extending-it), [meter-arsenal.md](meter-arsenal.md#extending-it) |
| Something the engine draws whatever the content | Add its sprite name to `ENGINE_SPRITES` (`core/bullets` `BULLET_SPRITES`, `core/options` `OPTION_SPRITE`, `core/powerups` `ITEM_SPRITES`, `core/shields` `FORCE_FIELD_SPRITE`, `core/ui` `UI_SPRITES` and — M2-07 — `core/stage` `GIMMICK_SPRITES` today): hosts pass it as `loadContent`'s `extraSprites` and `pnpm content:check` verifies it against the atlas |
| A game system | Fill in its placeholder module in `packages/core/src/<module>/`, set `moduleInfo.status`, export it from `packages/core/src/index.ts`, call it from its phase function in `core/world` (never reorder `WORLD_PHASES`), allocate its state in `createWorld` and add simulated state to `hashWorld` — [sim-world.md](sim-world.md#extending-it) |
| Content (enemies, weapons, stages, tilesets) | JSON under `content/` following its README, then `pnpm content:check` (try a stage with `pnpm dev` and `?stage=<id>`). New fields or a new kind: extend the schemas in `core/data` — checklist in [content-data.md](content-data.md#extending-it) |
| A stage event type or camera feature | [stage-runtime.md](stage-runtime.md#extending-it): schema in `core/data`, a `StageEventCode`, the runner's own part (if any) and the World's hook |
| A destructible tile, a stage gimmick, a moving-block motion, a Tiled class | Tileset `hp` / `regen` / `score` (data only); a `defineBehavior` using the script API's gimmick calls, and World-side slots in `core/stage` `StageGimmicks`; `scripts/content/tiled-import.mjs` — [advanced-stages.md](advanced-stages.md#extending-it) |
| A sprite or animation | A `*.sprite.json` pixel map under `assets/source/sprites/` (its path is its name) or a generator in `scripts/assets/procedural/`; `hitFlash: true` for anything the player can shoot. Real art: a PNG (+ Aseprite export) of the same name — [asset-pipeline.md](asset-pipeline.md#extending-it) |
| A sound, music or particle cue | Append a name to `SFX_CUES` / `MUSIC_CUES` / `FX_CUES` in `core/events` (never renumber — ids are recorded in replays and bound by `content/audio/` / `content/fx/`) |
| A sound effect or a song | A cue entry in `content/audio/main.sfx.json` (synth parameters or a recorded file) or a `content/audio/music/<id>.music.json` track (a chip song or an OGG file) bound to its cue, optionally per stage; listen with `pnpm audio:preview`, check with `pnpm content:check` — no code ([audio.md](audio.md#extending-it)) |
| A debug command, overlay figure or outline kind | `DebugCommand` (appended) in `core/debug` + a key in the shell's `DEBUG_KEYS`; a `DebugCounters` / `DebugOverlayStats` field and a panel line in `render-pixi/debug`; an outline list of its own colour — [debug-and-replays.md](debug-and-replays.md#extending-it) |
| A golden replay | A scenario in `test/golden/golden.ts` `GOLDEN_SCENARIOS`, then `pnpm golden:update` — [debug-and-replays.md](debug-and-replays.md#golden-replays-testgolden) |
| A presentation event kind | Append a code to `SimEventKind` and a name to `SIM_EVENT_KIND_NAMES`, then register a handler on the shell's dispatcher (`shell.events.on`) |
| An explosion, spark or other particle effect | A preset and a trigger in `content/fx/*.fx.json` — bound to an `FX_CUES` cue or to a sound that implies a visual — checked in `?scene=fx-gallery`; no code ([fx-and-game-feel.md](fx-and-game-feel.md#extending-it)) |
| A new entity kind | Give it an SoA pool (`createSoaPool`) registered with `world.pools.register(name, pool)` (flushed in the removal phase and hashed automatically) or an object pool (`createPool`) with a mirror batch, sized from the budgets in `shmup_feat.md` §22 |
