# Changelog

All notable changes to Shmup Cup. The project follows [Semantic Versioning](https://semver.org/);
versions before 1.0 may change anything between minor releases. Development follows the step plan in
[`shmup_plan.md`](shmup_plan.md); progress is tracked in [`shmup_progress.md`](shmup_progress.md).

## [Unreleased]

The changes after the v1.0 release candidate — milestone M3 (plan steps M3-01 … M3-03), which is
now **complete**. What remains needs an account or a device nobody here has: plan §8.7 (an LG
webOS set), §8.8 (Steam and a Steam Deck) and §8.9 (the Seller Office, itch.io, a native-speaker
pass over the translations, and the tracker-music CPU benchmark).

### Game

- **The game speaks three languages** (M3-03): **ENGLISH**, **ESPAÑOL** and **ニホンゴ**, chosen
  under OPTIONS → DISPLAY → **LANGUAGE** and shown from the next launch. The Japanese text is
  **katakana only**, the way 1980s arcade hardware wrote Japanese, and the bitmap font grew from 102
  to 195 glyphs to draw it (plus the accented capitals Spanish needs). A few things stay the same in
  every language on purpose: the game's name, `HI`, `1P` / `2P` and the two-character HUD and power
  meter codes, which the HUD draws in a few pixels it cannot grow.
  **The Spanish and Japanese texts are placeholders** — written by the build agent, not proof-read
  by anyone who speaks the language, exactly like the placeholder art and music. Correcting them is
  an edit of two files in `content/strings/`.
- **The game runs on LG webOS TVs too** (M3-03): a fourth host, `apps/webos`, with the same game,
  its own `appinfo.json` and the webOS Back key (461 instead of Samsung's 10009). **It has never run
  on a real LG set** — the project has no LG hardware, developer account or SDK — so treat the first
  run as untested; the recipe and the checklist are in [`docs/client/webos.md`](docs/client/webos.md).

- **EXTRA menu** on the title (M3-01), between SOUND TEST and EXIT: **BOSS RUSH** (the nine zone
  bosses A–I in a row — a new `boss-rush` stage), **CARAVAN** (one zone from its start against a
  three-minute clock: TIME UP when it runs out, 1,000 points a whole second left when the boss falls
  in time) and **ARCADE** (the run across the zone map looping on after its ending — each loop with
  remixed enemy waves in every zone, bullets 15 % faster a loop (at most 60 %), a revenge bullet
  from every enemy shot down and a higher rank). Each mode keeps its own hi-score tables.
- **Replays** of whole games: every finished game is recorded; EXTRA → **REPLAYS** keeps the last
  game and three kept ones, plays them back at ×1 / ×2 / ×4 with pause, and deletes them; in a
  browser SHARE copies a replay as text and pasting one on the page loads it.
- **Unlocks**: reaching an ending unlocks the **Extra Edit** (the weapon select's EXTRA: CONTROL
  MISSILE, UPPER MISSILE, SMALL SPREAD, HAWK WIND, 2-WAY BACK, BACK DOUBLE and the SPREAD GUN,
  equipped twice) and the ARCADE mode's **LOOP 2** start.
- **Secret codes** (original sequences of eight arrow presses): seven ships and Extra Edit on the
  title, full power and a self-destruct joke in the pause menu.
- **Assists** on the GAME page — **SPEED** (100 / 75 / 50 %) and **INVINCIBLE** — plus **OPT
  RECOVERY** (lost Options drift away to be caught again); the CONTROLS page's **RUMBLE** rumbles
  a gamepad on deaths and boss blasts. Scores and replays made with an assist or a code are marked
  `*`.
- **Score-milking cap**: enemies spawned by a boss or a spawner score in full for the first 40 of a
  kind in a zone, then 10 %.
- **Picture settings** on the Options screen's DISPLAY page (M3-02): **CRT** (OFF / LIGHT / FULL —
  scanlines, an aperture-grille mask and a vignette over the upscaled picture; since M3-02d it is
  the upscale's own shader, so any setting costs one draw call) and **ASPECT** (NORMAL / ULTRA-WIDE / CLASSIC 4:3 —
  the picture is placed in a 64:27 or 4:3 window with dimmed side panels beside it instead of black
  bars; it is never cropped and the playfield stays 384×216). Both apply at once and are saved.
- **EXTRAS** options page (M3-02) with four toggles that apply from the next game: **SLOWDOWN**
  (the deterministic 16-bit slow-down once the screen carries more than 96 objects), **GRAZE**
  (points for an enemy bullet that passes just clear of the ship), **DEATH BOMB** (a few frames to
  bomb out of a fatal hit, with a moment of invulnerability) and **BLACK HOLE**.
- **The black-hole bomb** (M3-02), the game's signature special for the **MANTA**: yellow items
  stock up to three bombs, `Special` throws a vortex that drags enemy bullets in and swallows the
  ones that reach its core (points each, like a cancel), pulls enemies towards it and then
  discharges lightning that destroys them and hurts boss parts. Two can be open at once, one per
  player.
- **An escape sequence** after the final zone's boss (M3-02): a collapsing corridor that scrolls
  faster and faster, then **ESCAPE COMPLETE** and the ending. It is part of that zone — routes, the
  zone count and high-score rows are unchanged.
- **The game is tuned to the measured hardware** (M3-02b — the input probe ran on both Smart
  Monitor M7s on 2026-09-15, [`docs/dev/input-probe-results.md`](docs/dev/input-probe-results.md)):
  - **The remote sends one key at a time.** While an arrow is held, OK, a second arrow and Ch ± are
    never delivered, so OK never stops a direction — but a power-up has to be taken with the
    direction released. There are no diagonals on the remote, and the whole game is designed for
    single arrow presses.
  - The TV's control profile is now simply **REMOTE**: it waits **0** frames before believing a
    release (the remote sends no false releases), so the ship stops the instant you let go.
    **FAST 8-WAY** is gone — it differed only in that wait — and a save that chose it uses REMOTE.
  - **Home pauses the game.** The TV's Home bar is an overlay, so the game now pauses itself and
    goes silent while it is up; coming back leaves the PAUSE menu where you left it, with nothing
    fast-forwarded.
  - **The INPUT TEST closes with three Pause presses** (`PAUSE X3 OR HOLD TO EXIT`) — the remote
    reports Back and Play/Pause only when you let go, so nothing asks for a held button any more.
  - **Steadier scrolling on a 60 Hz screen**: the game runs exactly one simulation step per frame
    instead of letting the monitors' uneven frame delivery turn into two steps on one frame and
    none on the next.
- **Three P2 bosses** (M3-02) on the new pull fields: **GRASPING BLOOM** (breathes in, dragging the
  ships towards its maw), **IRON TALON** (lunges and grabs) and **SHADOW STRIDER** (an armoured
  walker that can only be dodged) — on the browser's new showcase stage **HIGH-SPEED DIMENSION**
  (`?stage=dimension`), which flies over a pseudo-3D Mode-7 neon floor.

### For developers

- **Localization (M3-03).** `core/ui/strings.ts` gained `UI_GLYPHS` (the font's whole charset,
  declared once and kept equal to `assets/source/fonts/pixel6x8.font.json` by a test),
  `isUiTextDrawable`, `UI_LANGUAGES` / `uiLanguageLabel` / `uiLanguageIds` / `pickUiStrings` and
  `FIXED_UI_TEXT_IDS`; `UserOptions.display.language` + `UserOptionKind.Language` carry the choice
  (presentation only — no replay records it, no golden moved). The menu lists whatever
  `content/strings/` holds, so adding a table adds a row with no code change, and
  `pnpm content:check` requires a shipped language to answer **every** id. The 93 new glyphs cost
  1.6 KB of atlas and the two tables 8.6 KB of Tizen `app.js` gzip (386.9 → 395.5 KB of 512 KB);
  no budget was raised. What a real kanji set would actually cost — ~6,900 JIS X 0208 glyphs ≈ 1.0
  M pixels, about twice what the whole atlas occupies, so *one* extra page that fits `DIST_BUDGET`
  but doubles the atlas download and boot decode for everyone — and what to do if one arrives, is
  in [`docs/dev/asset-pipeline.md`](docs/dev/asset-pipeline.md).
- **`apps/webos` (M3-03)** — the LG webOS host: the `Platform` adapter (Back 461, the two-reason
  lifecycle, `webOS.platformBack()`), the shared `bootShell`, `public/appinfo.json` with its
  validator, a bundle check that imports the Tizen budgets so there is one source of truth, and the
  `ares-*` wrappers (**written, never executed**). An `input-profiles` entry gained a `hosts` list
  so each TV's remote profile stays out of the other's CONTROLS menu — without it a Tizen player
  could pick the webOS profile and lose Back entirely.
- **Steamworks (M3-03)** — `apps/electron/src/main/steam.ts` is implemented: `initSteam`, eleven
  achievements **derived from the save document** (so no game code knows about Steam), Steam Cloud
  wrapped around the existing file store (disk first, cloud second, restore on a fresh machine).
  `steamworks-ffi-node` is **not** a dependency: `initSteam` takes a `load` callback a Steam build
  supplies, and every test drives a fake. Nothing here has run against a real Steam client.
- **The tracker-music path (M3-03)** — new `audio-web/tracker`: capability detection, the
  `TrackerBackend` port, and `chooseMusicPath` (`tracker` → `file` → `song` → `none`). A track may
  carry an optional `module` **alongside** its song or file, never instead of it, so turning the
  path on can never silence a device. No backend ships: libopenmpt's worklet is ≈ 518 KB gzipped
  against a 512 KB bundle budget, which `trackerFitsBundle()` states in code.
- **`pnpm itch:package` (M3-03)** archives the browser build for itch.io with a zero-dependency ZIP
  writer (`index.html` at the root, no source maps, byte-identical for the same build). Never run
  against a real build here.
- **M3-03's cross-file invariants are tests now, not review notes.** The things only a careful
  reader was keeping true: `core/config` `LANGUAGE_ID_PATTERN` and the `strings` schema's own
  pattern are driven through the same id list and must answer alike (a shipped language the save
  would throw away is now a red test); `FIXED_UI_TEXT_IDS` is proved to be enforced at **both**
  gates (`core/data` at load, `resolveUiText` at resolve); the kanji arithmetic is **recomputed
  from `assets/generated/atlas/main.json` and the committed PNG** and cross-checked against the six
  documents that quote it, with round 1's retracted claims asserted absent; and a source scan keeps
  shipped code inside **Chromium 68** (webOS 5) — the lint's floor is 69, so `[].flat()` passes
  ESLint and would throw on an LG set. The profile lock-out has regression tests on both TV hosts
  (a save naming the *other* TV's remote is ignored) and `test/e2e/webos.spec.ts` runs the real
  webOS bundle from `file://` — the only place it is ever executed. `pnpm test:e2e` therefore
  builds `@shmup/webos` as well.
- **Fixed (M3-03)**: `initSteam`'s `syncAchievements` called `this.unlockAchievement`, so the
  service threw if any of its methods was ever pulled off it (`const { syncAchievements } = steam`).
  It calls the closure directly now. Found by the test that destructures the service.
- **New docs**: [`docs/dev/real-assets.md`](docs/dev/real-assets.md) (Aseprite / Furnace hand-off),
  [`docs/client/webos.md`](docs/client/webos.md), [`docs/client/steam.md`](docs/client/steam.md),
  [`docs/client/web-release.md`](docs/client/web-release.md) and
  [`docs/client/store-submission.md`](docs/client/store-submission.md) — each says in its first
  paragraph that nothing in it has been run.
- `GameConfig` gained `loop`, `timeLimit`, `invincible` and `optionRecovery`; `startingLives` goes
  up to 9. Stages may carry a `remix` and `minLoop` / `maxLoop` on any event; weapons an `extra`
  flag; the `rules` file's `scoring` section `repeatKills` / `repeatPercent`.
- Whole-run replays (`core/replay` `run.ts`: segments, start states, flow actions, the replay
  library sized to the storage adapter) recorded by the scene flow; the replay header gained
  `assists`.
- The save stays format 2: `options.play`, `unlocks` and assisted rows resolve when missing;
  `MAX_HI_SCORE_TABLES` 64.
- Golden replays re-blessed: every file for its header (the new config fields and `assists`),
  `captain-range-god` also for the milking cap (25,120 → 20,980); six new goldens of the extra modes
  and assists.
- M3-02: `GameConfig` gained `slowdown`, `graze`, `deathBomb` and `blackHole` (so every replay
  header records them), `UserOptions.display` `crtFilter` / `aspect` and `UserOptions.play` the four
  extras' switches. New core module **`blackhole`** (the bomb stock, the vortices, the lightning and
  the death-bomb window's bombs); `core/bullets` gained `grazePlayers` and `vortex`, `core/enemies`
  `pullTowards` and `blast`, `core/bosses` `BossScriptApi.pull` / `release` with
  `BossSystem.applyFields`, `core/powerups` `equipMeterSlot`. A stage may carry an optional `mode7`
  section and a **final** campaign zone an `escape` stage; the `rules` file's `scoring.graze` pays a
  graze. `@shmup/render-pixi` gained the Mode-7 filter and floor, the CRT pass and
  `computeAspectViewport` (plus `setAspect` / `setCrtFilter` on the renderer and the optional
  `DisplayTarget` methods behind them).
- `hashWorld` mixes the new state only in a World that uses it (`mixExtras`, and a boss's pull field
  only while one is open), so recordings made before M3-02 keep their hashes; all goldens and
  attract demos were re-blessed once for the four new header fields, with no expected status, score
  or tick count moved, and `zone-a-extras` joined them (zone A with every extra on).
- M3-02b: `core/config` gained `RETIRED_INPUT_PROFILE_IDS` / `migrateInputProfileId` (applied by
  `resolveUserOptions` to `options.input.profileId`; a binding override keyed by a retired id is
  left inert). `@shmup/input-web` `remote` gained `InputTuning.singleKey` — while any tracked key is
  physically down the keyboard source drops other keydowns — and the measured
  `REMOTE_REPEAT_DELAY_TICKS` (21) / `REMOTE_REPEAT_INTERVAL_TICKS` (6.5); the profile validator
  rejects `singleKey` on gamepad profiles. `content/input/remote.input-profiles.json` ships five
  profiles (`tizen-remote-diagonal` retired) and registers `Guide` / `Extra`.
- M3-02b: `core/loop` gained the **vsync lock** (`setVsyncLock` / `vsyncLock` / `VSYNC_DROP_STEPS`,
  module `partial` → `implemented`) and `core/game` `setVsyncLock` / `vsyncLock`, suspended while a
  debug timing mode runs; `@shmup/shell` gained `ShellOptions.framePacing` (`'auto' | 'lock' |
  'free'`) and `VSYNC_LOCK_MIN_HZ` / `VSYNC_LOCK_MAX_HZ` (55 / 65). Presentation only — no replay,
  golden or demo hash moved because of it.
- M3-02b: `apps/web` `createVisibilityLifecycle(source, focus)` and the Tizen platform's lifecycle
  take an optional focus source and are **edge-triggered** over hidden ∨ unfocused; the old
  "a repeated event fires the callbacks again" contract is gone. Electron keeps the web policy.
- M3-02b: the debug overlay gained a sixth line — `DebugOverlayStats.tickFrames` /
  `rafHistogram` / `vsyncLock`, `RAF_BUCKET_EDGES_MS`, `RAF_BUCKETS`, `rafDeltaBucket`,
  `buildRafHistogram` and the `LOCK` alert; `DebugTools.endTicks(ticks)` takes `game.frame`'s
  return value. The shell's debug tools track held keys themselves (the remote's auto-repeats carry
  `repeat === false`), and a repo-wide ESLint rule forbids `.timeStamp` in runtime sources.
- M3-02b: `test/playtest/remote-strict.ts` (`createRemoteStrictModel` / `createRemoteStrictCheck`)
  models the remote, and `fourWayBot()` flies under it by default; `PlaytestResult` reports
  `remoteViolations`. Every zone, route, the boss rush and the caravan clear under it with **no
  zone content re-tuned**; three bot changes (a clear-lane equip window, a stronger boss-core
  preference, god-mode core-row aiming) re-blessed the goldens and attract demos, and
  `gimmick-range-god` now expects `destroyed === 0`.
- M3-02b: `tools/input-probe` `chooseEventTime` always returns handler time (Tizen 5.5 advances
  `event.timeStamp` in whole seconds), `FrameSummary` carries a raw `histogram`
  (`FRAME_BUCKET_EDGES_MS` / `frameBucket`) and the verdicts gained `NO — not delivered`.
- M3-02c: a **render benchmark** — `test/bench/render.perf.ts` with `test/bench/render-harness/`
  (`main.ts` the page, and the DOM-free `load.ts` / `gates.ts` / `protocol.ts`). It builds the
  harness with Vite and drives it in Playwright's Chromium: the real renderer over the real
  simulation and the real atlas under worst-case frames (every measured frame carrying 512 of 512
  enemy bullets, ≥ 489 of 512 point items and ≥ 489 of 512 particles, asserted as a per-frame
  floor), CRT off / light / full, a filtered layer, the Mode-7 floor, and the **internal frame size
  as a parameter** (384×216 and 768×432). It reports render-ms p95, draw calls, pooled
  render-target bytes, structure rebuilds and a JS-heap delta over 600 frames, and fails on the
  draw-call, p95 and heap budgets; a deliberately leaky fixture proves the heap gate. It renders
  through SwiftShader — the counted quantities and the scenario-to-scenario comparisons transfer to
  the TV, the milliseconds do not. `test/integration/render-bench.test.ts` drives the three
  DOM-free modules in Node as part of `pnpm test`, and `test/e2e/render-profile.spec.ts` checks the
  same three figures in a real WebGL context. CI's `build · benchmark` job installs Chromium first.
- M3-02c: `@shmup/render-pixi` gained `PixiRendererOptions.countStructureRebuilds` /
  `PixiRenderer.structureRebuilds` (−1 when not counting) and `debug`'s `createRenderTargetMeter` /
  `RenderTargetMeter` (one hook on Pixi's global `TexturePool.createTexture`, so the total is a
  property read); `DebugOverlayStats` gained `structureRebuilds` and `renderTargetBytes`. The debug
  overlay's panel grew a **seventh line** — `REB` and `RT` — and the M2-17 device line moved down
  with it (`PANEL_LINES` 6 → 7). The shell's debug tools own one meter and stop it on `destroy()`.
- M3-02c: `@shmup/shell` `boot` gained `webGLVersionFromSearch(search)` and `apps/tizen`
  `WEBGL_VERSION_KEY` (`localStorage['shmup-cup:gl']`, dev / test builds only) — the review's **F8**
  A/B switch after the probe verified WebGL 1 *and* 2 on Tizen 5.5. **WebGL1 stays the shipped
  default** and the renderer's stale "WebGL2 is unverified" docblock is gone.
- M3-02d: the **full-screen effects are folded into their draw passes** (the render review's
  **F2** / **F6**). The second pass draws the frame with a `Mesh` whose shader *is* the CRT program
  (`@shmup/render-pixi` `effects` `createCrtBlit`, `CrtPass.view`, the new `EFFECT_MESH_VERTEX`
  shared vertex shader), and the Mode-7 floor is a `Mesh` on `BG_MID` (`createMode7Shader`,
  replacing `createMode7Filter`; `Mode7Floor.view` / `.shader` replace `.sprite` / `.filter`). The
  bench measured it: CRT `light` / `full` went **5 draw calls and 2,048 KB of pooled render targets
  → 4 and 0**, the same as CRT `off` (16.8 MB of VRAM and a second full-screen pass over 2 Mpx
  freed at 1080p), and the Mode-7 stage **7 and 512 KB → 6 and 0**. `PixiRendererOptions.screenPass:
  'filter'` restores the old sprite + Pixi-filter pass as an escape hatch, which is what
  `createCrtFilter` / `crtResolution` / `CRT_MAX_HEIGHT` now serve.
- M3-02d: `PixiRenderer.warmUp()` (**F4** / **F5**) draws one throwaway off-screen frame with every
  GL program and every pooled sprite in it; `bootShell` calls it after `bindWorld`, behind the
  loading screen, so no shader links and no batch buffer grows mid-gameplay. `LayerEffects` gained
  `attachAll(on)` for it.
- M3-02d: `createRenderTargetMeter` counts the targets Pixi's pool already holds when it starts —
  the boot warm-up frame draws every filter, and the pool never releases, so the overlay's `RT`
  figure would otherwise read 0 on a stage whose effect is running.
- M3-02d: `@shmup/shell` `memory` counts render targets the way Pixi really pools them (**F3**):
  new `potBytes(w, h)` (next power of two on each axis) and exported `FILTER_TARGETS`;
  `estimateMemory` gained `frame`, `filterTargets`, `crtFilter` and `crtAsFilter` inputs, and
  `estimateStageMemory` passes them through.
- M3-02d: the estimator's per-zone figures moved with the correction — zones A–G ≈ 67.0 MiB, H ≈
  74.0, I ≈ 74.7, of which 25.05 MiB is render targets (was 24.7 MiB modelled flat). The legacy
  `crtAsFilter` term is deliberately conservative — it ignores `crtResolution`'s cap and charges
  the whole display for a pillarboxed picture — and the shipped blit path is charged nothing at any
  setting; both are pinned by tests so nobody "fixes" them.
- M3-02d: **a new hardware dependency.** Pixi's `MeshGeometry` forces `Uint32Array` indices, so
  both new meshes — and therefore every frame's second pass — rely on WebGL1's
  `OES_element_index_uint`. Pixi requests it with the context and it is effectively universal (the
  M7's Mali-G51 has it), but on a context without it the symptom is a black picture rather than a
  picture without effects. Asserted in Node and in a real WebGL1 context by the tests.
- Fixed (found by M3-02d's tests): `PixiRenderer.destroy()` never destroyed the Mode-7 floor —
  `bindWorld(null)` only hides its mesh, so its `Mesh` / `MeshGeometry` / `Shader` / `GlProgram`
  outlived the renderer — and never destroyed the second pass's container or its two side-panel
  sprites. Both are freed now, with a regression test.
- M3-02f: **the render profile records itself.** A dev / test build given `VITE_REPORT_URL` streams
  its own render telemetry to the input probe's log server (`tools/input-probe`, `npm run
  log-server`, which now takes both senders — `ip-…` sessions from the probe, `rp-…` from the game):
  a new `@shmup/shell` `telemetry` module samples every frame into preallocated typed arrays, closes
  a window every 3 s into **min / median / p95 / max** of the frame, tick and render times and of
  the draw calls — plus a **quantized histogram of each of those series**, so the analyzer sums a
  table row's windows and prints the p95 of *that row's frames* instead of a median of the windows'
  p95s, which understates the tail and would not even be the same statistic as the `pnpm bench` p95s
  the same document quotes (the same statistic, not a comparable magnitude — the bench runs under
  SwiftShader) — and the `TPF` and rAF bucket counts, the window's structure rebuilds and the
  pooled render-target total, and POSTs it with the context that makes the row mean something (the
  M2-17 device line among it, re-read every window because it only resolves after boot).
  An on-screen checklist walks the render review's §4 measurement table (M1–M8) and ticks itself, so
  the owner plays where the game says instead of keeping notes, and
  `tools/input-probe/results/analyze-render.mjs` turns a session into the tables of
  `docs/dev/input-probe-results.md` §11. It is built not to perturb what it measures: the frame path
  allocates nothing (a `Float64Array` inbox instead of fractional call arguments — V8 boxes those),
  requests go out on a timer rather than a frame boundary, and every window counts the frames a POST
  was still in flight so a sender-induced spike is excluded rather than believed. Configured by the
  new `__SHMUP_REPORT_URL__` define, `''` in every release build — the whole sender is proven absent
  from `dist/app.js` and from the web build's scripts.
- Fixed (found by the M3-02f test suite): the log server's console summaries could still be thrown
  out of by a payload that redefines `toString` — `{"toString": 1}` is valid JSON, and interpolating
  it raises `TypeError: Cannot convert object to primitive value` — or by a `verdicts` / `env` that
  is not an object. The request handler's catch kept the receiver alive, but the capture lost the
  summary line the owner watches while playing. Every nested value a formatter prints now goes
  through a total `str()`, and a seeded fuzz suite POSTs generated junk at both formatters and at a
  live server to keep it that way.
- M3-02e: **one render group per high-churn layer** (the render review's **F1**). In Pixi v8
  `sprite.visible = …` dirties the sprite's enclosing render group, and a dirty group has its whole
  instruction set thrown away and rebuilt — a walk over every node under it, a re-pack of every quad
  and a re-upload of its vertex buffer. The scene was one group and the draw path toggles `visible`
  in every binding every frame, so one hidden bullet cost all of that over ~6,400 display objects,
  on 655–659 of every 660 frames the bench measured. Every layer whose bindings toggle `visible`
  while the game runs is now its own render group (`@shmup/render-pixi` `layers`'
  `RENDER_GROUP_LAYERS`: `TERRAIN`, `GROUND_ENEMIES`, `AIR_ENEMIES`, `PLAYER_SHOTS`, `PLAYER`,
  `HITBOX`, `ITEMS`, `FX`, `ENEMY_BULLETS`, `HUD`, `UI`), so a bullet appearing rebuilds the
  512-sprite bullet group and leaves the 1,274-tile terrain grid, the HUD and the UI alone, buffers
  included. `BG_FAR` and `BG_MID` stay plain (the parallax bands are shown once when bound and only
  their containers move; the Mode-7 mesh follows a camera range) and so does `DEBUG` (empty in a
  release build). Measured by the bench, which builds both scenes in one run
  (`PixiRendererOptions.renderGroups: false` restores the old one — the review's measurement
  **M1**, done headlessly): **659 of 660 frames rebuilding the whole scene → 0 of 660**, on every
  shipped scenario. Scope items 2 (degenerate-quad parking) and 3 (`ParticleContainer`) were
  deliberately **not** done — the first was enough, and parking dead slots in the batch would have
  grown the per-frame attribute upload from the visible quads to all ~6,400.
- M3-02e: **the trade, stated plainly.** Each render group is a batch boundary, so the bench's busy
  frame went **4 → 9** draw calls, the `raster-range` frame 7 → 10 and the Mode-7 frame 6 → 9, and
  the two e2e specs' `DRAW_CALL_BUDGET` was raised **12 → 16** deliberately (`shmup_feat.md` §22
  allows 20–50; the arithmetic is in each spec's docblock and the measured figures in §22's budget
  line). The p95 the bench reports for the change — 0.65–0.94× over five runs, a spread that is
  itself the caveat — is **SwiftShader's**
  and is the least transferable number of the step: software WebGL charges CPU time for the extra
  draw calls while making the 6,400-node tree walk cheap on a desktop core, and the M7's Cortex-A55
  and Mali-G51 pay the opposite way round. The result to believe is the counted 659 → 0; the
  hardware verdict is the owner's M1 measurement on the monitors.
- M3-02e: `PixiRenderer.groupRebuilds` — the same `structureDidChange` flag counted over **every**
  render group of the scene rather than the scene's own (−1 without `countStructureRebuilds`, like
  `structureRebuilds`), so a fall in the first figure cannot be read as churn that merely moved out
  of sight: it read 659 of 660 before the step and about 1,590 after (≈ 2.4 small layer groups a
  frame). It is deliberately **not** on the debug overlay and not in M3-02f's telemetry — `REB` stays
  the one figure to read on the TV, and what it now says is 0. The bench gained the gate
  `renderGroupViolations` and `test/e2e/render-groups.spec.ts` proves the picture is **byte-identical**
  with the groups on and off, on seven scenes.
- M3-02e: **how to read `REB` on the TV.** The `DEBUG` layer is deliberately not a render group, so
  the overlay panel's own text quads dirty the scene's group whenever a printed number changes width
  — at 6 % of frames on an idle machine and 49 % on a loaded one, a property of the machine and not
  of the renderer. The debug tools read `renderer.structureRebuilds` and commit the frame to the
  telemetry **whether or not the panel is visible**, and M3-02f's checklist is a DOM `<div>`, so the
  owner hides the panel (debug key **1**) and still captures the true rate. Documented in
  `docs/client/debug-tools.md` and `docs/dev/rendering-and-shell.md`.
- M3-02e: the review's **F9** fell out of the same work — the five full-screen overlays of pass 1
  (the backdrop, both flashes, the playfield dim and the UI dim) draw the atlas' own `ui/pixel`
  instead of Pixi's global `Texture.WHITE`, so pass 1 samples a single texture. The side panels keep
  `Texture.WHITE`: they are in pass 2, where the atlas page would be a binding added rather than one
  saved. No draw call changed, as the finding predicted.
- The Tizen bundle is 386.9 KB gzip of its 512 KB budget (384.1 KB after M3-02c; M3-02d's +2.7 KB
  is Pixi's mesh pipeline, no longer tree-shaken out; M3-02f adds nothing — it is dev-build only;
  M3-02e adds 0.1 KB — one array and one option, no new Pixi code path).

## [1.0.0-rc.1] — M2: complete v1.0 (release candidate)

The second milestone (plan steps M2-01 … M2-18): the complete game — nine zones on a diamond map,
16 routes, two ships, co-op, the front end and the options — hardened and cut as the first release
candidate. Every package manifest says `1.0.0-rc.1`; the Tizen widget, which only takes numbers,
says `1.0.0`.

### Game

- **Difficulty presets** Easy / Normal / Hard / Arcade, chosen in a **DIFFICULTY** menu under START
  (M2-01): ships 5 / 3 / 3 / 2, continues 5 / 3 / 2 / 0, death penalty Casual / Classic / Classic /
  Arcade, 16 or 32 aim directions, Easy's bullets × 0.85 — a table in
  `content/rules/difficulty.rules.json`. Each difficulty keeps its own hi-score table.
- **Rank grows** with the stage, the loop and the ship's power (Missile, Double / Laser, Options,
  shield), 0–31 and at most 16 on loop 1; enemies fire more often and faster as it rises.
  Per-enemy rank modifiers and **revenge bullets** (zone A's fan fliers from rank 12).
- **Extra ships** at 20,000 points, then every 70,000 (at most nine), with a 1UP jingle that is
  never cut off.
- **Continues**: a 10-second CONTINUE? countdown after the last ship; OK restarts at the last
  checkpoint with fresh ships and no power, and the score's last digit counts the continues.
- Behaviour change for tools and tests: `{ difficulty: 'arcade' }` now means the whole preset
  (2 lives, 0 continues, the arcade penalty); the golden replays were re-blessed.
- **Colour-blind bullet colours** (M2-02): OPTIONS → **BULLETS** — STANDARD, DEUTERANOPIA,
  PROTANOPIA or TRITANOPIA, applied at once and remembered; in the colour-blind sets the bullet
  centres are shape-coded (solid, ring, dot) so the three bullet families differ without colour.
- **Points for cancelled bullets** (M2-02): when a boss is destroyed or a Mega Crash goes off,
  every enemy bullet also leaves a gold diamond that flies up into the score — 10 points each
  (`content/rules/scoring.rules.json`). The player's own loss still only clears them.
- **Bullet patterns as data** (M2-02, for content authors): `content/patterns/` — BulletML-inspired
  actions and bullets (`fire`, `wait`, `repeat`, `changeSpeed`, `changeDirection`, `accel`,
  `vanish`, `actionRef`, `bulletRef`) with expressions over `$rank`, `$rand`, `$loop`, `$i`,
  compiled at load and run by a zero-allocation interpreter; enemies run them with the
  `pattern.loop` behaviour. **Bending lasers** (homing, circle-chain hitbox) exist in the engine.
  Neither is used by zone A yet, so it plays as before (apart from the cancel points).
- The golden replays were re-blessed again for M2-02 (new bullet state, cancel points).
- **Weapon types B–D and Weapon Edit** (M2-03): nine new weapons with original names — Spread Bomb
  (bursts into a blast that hits twice), 2-Way Missile, Photon Torpedo (flies on through what it
  destroys), Tail Gun, Vertical, Free Way (its second shot follows the last direction you moved),
  Ripple Laser (growing rings that hit with their edge), Cyclone Laser, Twin Laser — as presets
  **Type B**, **C** and **D** next to the classic Type A, or mixed freely with **EDIT**. The power
  meter's boxes are named after the chosen weapons.
- **`!` and `?` choices** (M2-03): the `!` box can be the Mega Crash, NORMAL (back to the basic
  gun), SPEED DOWN, LIFE OPTION (spare ships become Options) or FULL BARRIER (a fresh Force Field);
  `?` gives the Force Field (more shields came with M2-04).
- **WEAPON SELECT** screen after the DIFFICULTY menu (M2-03) — one more OK to start a game (START is
  highlighted): the type, the three slot weapons under EDIT, `?`, `!`, Auto Power-Up and its
  **order** (an AUTO ORDER box), with a **live preview** of the choice flying over a practice range
  behind the panel. The choice lasts for the session.
- Behaviour change for tools and tests (M2-03): `GameConfig` has `weaponPreset`, `weaponEdit`,
  `megaChoice` and `shieldChoice` (replay headers record them; older headers decode to the
  defaults); the golden replays were re-blessed (the new content shifts sprite ids, the Free Way
  direction is hashed — same outcomes) and four boss runs with the new weapons were added.
- **Option types** (M2-04): a new **OPTION** line on the WEAPON SELECT screen — TRAIL (as before),
  **SNAKE** (a chain that swings out behind the ship and keeps its shape when it stops),
  **FORMATION** (a `>` behind the ship that spreads into a `V`) and **ROTATE** (orbiting the
  ship). FORMATION and ROTATE spread out with **Ch ▲** on the remote (V / gamepad Y) or while
  PowerUp (OK) is held for a quarter of a second; a quick OK never moves them.
- **More shields** on `?` (M2-04): **SHIELD** (two pods at the nose), **FREE SHIELD** (a pair of
  pods where you last moved — `?` again adds a second pair), **ROTATE** (two circling pods) — each
  pod stops the bullets and enemies that touch it, 14 hits, wearing on its own — and **REDUCE**
  (the ship's hit spot shrinks to a third, two hits; the rock still counts). FULL BARRIER restores
  whichever shield you chose.
- **Option Hunter** (M2-04): an armoured enemy that arrives with an alarm only while you have
  Options, lines up and charges through them, and carries off the ones it touches; a Mega Crash —
  or the new rare **blue capsule**, which destroys every enemy on screen — frees them to be caught
  again. They appear in the browser's `?stage=hunter-range` for now; AZURE VERGE is unchanged.
- Behaviour change for tools and tests (M2-04): `GameConfig.optionChoice`, the grown
  `shieldChoice` and `WeaponSelectItem` codes (`Option` 4, so `?` … START are 5–9); the golden
  replays were re-blessed (new hashed state, shifted enemy spec indices — same outcomes) and four
  runs covering every Option type and shield were added.
- **The second ship, the MANTA, and Direct mode** (M2-05): a **SHIP SELECT** box after the
  DIFFICULTY menu — the KESTREL (power meter, then the WEAPON SELECT screen) or the MANTA (the game
  starts at once). The MANTA has no meter: enemies that leave capsules leave **colour items**
  instead, in an order set per stage — **red** and **green** raise the main gun and the sub-weapon
  through nine levels (missiles → discs, or lasers → piercing waves; the sub-weapon from an arcing
  bomb to piercing discs), **blue** gives the **Arm** (green 3, silver 4, gold 5 hits after 1, 4, 9
  blue items — it also stops the rock), **orange** an extra ship, **yellow** a smart bomb, and the
  red **octagon** switches the main gun's style. Items drift across the screen and vanish after
  ten seconds. **Ch ▼** (Left Shift, LB / RB) switches the MANTA's three speeds; OK does nothing in
  its games. The HUD shows its levels as pips; a loss costs the Arm (and a level on Classic, all
  power on Arcade). The MANTA keeps its own hi-score tables. In a browser `?stage=direct-range`
  sends six-cube pincer waves; AZURE VERGE's enemies are unchanged (its capsules become items).
- Behaviour change for tools and tests (M2-05): `GameConfig.shipId` (default `kestrel`) and
  `powerUpMode: 'direct'` (replay headers record them; older headers decode to the KESTREL),
  `DropKind.FreeOption` is 4 (`PowerUp` took 3), the `liveCounts` stride is `WEAPON_ROLE_SLOTS`
  (36), every flow that starts a game presses one more OK (the ship select); the golden replays
  were re-blessed (new hashed state and content — same outcomes) and three MANTA runs were added.
- **Two players at once** (M2-06): the title menu is now **1 PLAYER** (what START was) /
  **2 PLAYERS** / OPTIONS / EXIT. In a 2 PLAYERS game player 1 starts and a second player **joins
  any time** with START on a gamepad (on the TV a USB or Bluetooth pad; in a browser also Enter on
  the new **SPLIT KEYBOARD** control profile — WASD + F / G for player 1, arrows + K / L for player
  2). Player 2 flies the same ship in red-orange and gold. Each player has their own ships, score,
  extra ships, power-ups (items go to whoever touches them first), shields and **continues**: a
  player who loses their last ship comes back with START while the other plays on, and the game
  is over only when both are out — the CONTINUE? countdown then continues whoever presses OK.
  While both play, enemies leave an extra capsule every second time, the bottom bar splits into two
  halves, and GAME OVER / STAGE CLEAR show both scores. A short chirp plays when a player joins.
- Behaviour change (M2-06): in the menus and in one-player games **every gamepad** controls player
  1 (before, the second gamepad was always player 2); in a 2 PLAYERS game a gamepad becomes player
  2's with its first START or A.
- Behaviour change for tools and tests (M2-06): `GameConfig.coop` and `coopExtra` (replay headers
  record them; older headers decode to a one-player game); `TitleItem` is `Start 0`, `TwoPlayers 1`,
  `Options 2`, `Exit 3` (a flow walking to OPTIONS presses Down once more); `continueWorld(world,
  who)` takes a player mask and continues are per player (`continuesLeft`); `HUD_STRING_COUNT` 22,
  `HUD_COMMAND_COUNT` 96; input adapters may implement `setSeats` (`Game.inputSeats`); the golden
  replays were re-blessed (the hashed co-op credit and the `@p2` sprite names — same outcomes) and
  two co-op runs were added.
- **Stage mechanics for the later zones** (M2-07, in the browser's `?stage=gimmick-range` for now —
  AZURE VERGE is unchanged): **bricks** you shoot through (each takes a few hits and scores),
  pink **walls that grow back** a few seconds after breaking — never onto a ship —, **rocks** that
  drop when you come near and shatter, **bubbles** that split in two when shot, a **volcano**
  lobbing glowing stones, a **suction pod** that pulls ships towards it, **tentacles** on a chain
  that lunge and tug, a **cube rush** whose cubes stick to the rock and build walls, **moving
  blocks** as solid as the rock, a timed **stop** with the view panning down, a **diagonal** pan,
  a **fork** chosen by flying through a region, and a 4× **fast stretch**. A checkpoint restart
  (ARCADE losses, continues) puts every broken brick back and removes stacked cubes.
- For content authors (M2-07): tiles may be destructible (`hp`, `regen`, `score`), camera keys
  `hold` and `yOver`, stages `branches`, any event a `branch`, new `trigger` and `block` events and
  the `ballistic` enemy mover ([`content/stages/README.md`](content/stages/README.md)); **`pnpm
  content:tiled <map.tmj>`** converts a map drawn in Tiled into stage JSON.
- Behaviour change for tools and tests (M2-07): `STAGE_STATE_SLOTS` is 28, `StageEventCode` has
  `Trigger 8` / `Block 9`, `MoverKind.Ballistic` 9, `ENGINE_SPRITES` gained `gimmicks/chain-link`
  (later sprite ids shift), `createTerrainView` takes an optional change log; the golden replays
  were re-blessed (new hashed state — zone A's simulation unchanged) and three `gimmick-range` runs
  were added.
- **Picture options** (M2-08): OPTIONS gained **SCALE** (INTEGER — the sharp, letterboxed default —,
  FIT or STRETCH), **SHAKE** (on / off), **FLASHES** (NORMAL / REDUCED: at most one dim flash a
  second) and **HITBOX** (a white-and-pink marker on each ship's weak spot); they apply at once and
  are remembered. The **Mega Crash** flash now brightens the picture (additive) instead of covering
  it. On monitors faster than 60 Hz the world is drawn between ticks for smoother motion; the TV is
  unchanged.
- **SNES-style picture effects** (M2-08, in the browser's `?stage=raster-range` for now — AZURE
  VERGE is unchanged): per-scanline **raster effects** — wavy water, heat haze, a pseudo-3D
  line-band floor — and **palette cycling** (a sea whose colours roll), drawn by one WebGL1 filter
  per background layer only while an effect is on screen.
- For content authors (M2-08): stages may list `raster` effects (`wave`, `haze`, `lines` with
  optional `bands`) and palette `cycles` (exact `#rrggbb` ramps, ≤ 8 colours per layer) —
  [`content/stages/README.md`](content/stages/README.md#raster-effects-and-palette-cycles-m2-08).
- Behaviour change for tools and tests (M2-08): `OptionsItem.Back` is 9 (SCALE, SHAKE, FLASHES and
  HITBOX sit between BULLETS and BACK); `UserOptionKind` gained `ScaleMode 5` … `ShowHitbox 8`;
  `UserOptions.display` has four more fields (save format 1, no migration); `WorldView` may carry
  `effects` and `hitboxes`; `window.__shmupDebug.renderer`; the golden replays were re-blessed (two
  new content sprites shift the sprite ids — the simulation is unchanged) and a `raster-range` run
  was added.
- **Boss HP bar** (M2-09): OPTIONS → **BOSS HP** (off by default) shows `BOSS` and a red bar of the
  boss's remaining strength — its cores and the parts protecting them — in the top bar during boss
  fights, in place of `HI`; on the TV too (HALCYON BULWARK).
- **Advanced bosses** (M2-09, in the browser's test stages for now — AZURE VERGE is unchanged):
  **mid-bosses** that fight while the screen keeps scrolling (`?stage=captain-range`: a rammer, a
  bubble launcher, a circler, a ring-firing crab); **IRON LEVIATHAN**, a battleship longer than the
  screen that the view flies around while its turrets turn to aim, with **LEVIATHAN HEART** inside
  it and a **90-second time limit** after which it escapes (`?stage=raid-range`); the **EMBER AND
  FROST TWINS**, who take turns while the other rests behind, the survivor getting angry
  (`?stage=twin-range`); and a **boss rush** (`?stage=gauntlet-range`).
- For content authors (M2-09): boss sections may give `role: "captain"`, `timeLimit`, `raid`
  (boss-relative camera segments), `partner` / `alternate` / `enrage`, `inner` and `minion`; parts
  `radius` (circle hurtboxes), `angle`, `spin` and `turn` (heading frames); stages `type:
  "bossRush"` with a `rush` list —
  [`content/enemies/README.md`](content/enemies/README.md#advanced-bosses-m2-09),
  [`content/stages/README.md`](content/stages/README.md).
- Behaviour change for tools and tests (M2-09): the boss system has four slots (`bosses.slots`;
  `damagePart` / `isArmoured` take the part slot = slot × 16 + index), `MAX_HIT_TARGETS` is 128 and
  the part cooldown tables have 64 part slots; `BossState.Escape` 6, `SimEventKind.BossEscaped` 14,
  `World.endingFlags`, `StageRunner.follow`; `createBossSystem` takes the stage; `OptionsItem.BossHp`
  9 and `Back` 10, `UserOptionKind.BossHpBar` 9, `UserOptions.display.bossHpBar` (save format 1, no
  migration); `HUD_STRING_COUNT` 23, `HUD_COMMAND_COUNT` 100; the golden replays were re-blessed
  (the hash layout and content ids changed — every input, tick count and outcome is unchanged) and
  four advanced-boss runs were added.
- **The zone map** (M2-10): a game is now a **run** across a branching map of nine zones — AZURE
  VERGE, then B or C, D or E, F or G and one of two final zones, H or I (five zones per run, 16
  routes). Each zone opens with a **title card** during the fly-in; after its boss the ships **fly
  out** to the right, the **zone result** pays a kill bonus (100 points per percent of the zone's
  enemies shot down) and a **time bonus** (100 points per second the boss fight stayed under 90
  s), and the **ZONE MAP** lets you choose the next zone with ▲ / ▼ and OK (Back asks "quit to
  title?"); score, ships, power-ups and shield carry over. The final zone leads to a placeholder
  **ending** chosen by the route and the run (no ship lost, a boss that escaped). Zones B–I are
  short **stand-ins** for now (zone A's enemies, known bosses) so every route can be finished. A
  run's score is saved when it ends (game over or the ending). RETRY STAGE restarts the current
  zone with what you entered it with.
- **Hidden bonus stages** (M2-10, in the browser's `?stage=bonus-range` for now): three kinds of
  secret entrance — fly into a marked gap, destroy every ground target of a stretch, have a given
  score digit — lead into a bonus stage of **1,000-point capsules** and a **1UP**; clearing it
  would skip the zone's boss, and losing a ship there sends you back and locks the entrances.
- For content authors (M2-10): the new content kind **`campaign`**
  ([`content/campaign/README.md`](content/campaign/README.md): zones, edges, endings with run-flag
  conditions — the loader checks that every route reaches a final zone); stages `type: "bonus"`
  and the `bonus` event (`gap` / `ground` / `digit` entrances), the drops `oneUp` and
  `bonusCapsule` ([`content/stages/README.md`](content/stages/README.md)).
- Behaviour change for tools and tests (M2-10): a game on the campaign's start zone (zone A) is a
  campaign run — the stage-clear screen becomes the zone tally and leads to the map; any other
  stage keeps the single-stage flow. `PlayerState` gained `leaving` (the fly-out, from the tick after
  `stageClear`); `DropKind.FreeOption` is 6 (`OneUp` 4, `BonusCapsule` 5), `ItemKind` gained
  `OneUp` 9 / `BonusCapsule` 10, `StageEventCode.Bonus` 10, `SimEventKind.PrepareStage` 15
  (`@shmup/shell` `connectStagePreparation`); `EnemySystem.stats`, `World.bonus`; the scene flow's
  UI list has 384 commands / 224 string slots; the golden replays were re-blessed (the hash layout,
  two new engine sprites and a new enemies file shift ids — zone A's inputs, tick counts and
  outcomes are unchanged; three boss-range runs were re-recorded with the improved playtest bot)
  and three bonus-stage runs were added.
- **Zone B, BRINE NEBULA** (M2-11) replaces its stand-in: about 3½ minutes of bubbles that burst
  into smaller bubbles or free the fish inside them, jellyfish firing rings, spiny urchins in a reef
  tunnel, a riptide and a wobbling, colour-shifting sea; the mid-boss **SPUME HERALD** fights while
  the screen scrolls on (and leaves after 30 seconds); the boss **GALVANIC MAW** is a mechanical fish
  whose mouth can only be hit while open, with jaws that open apart, needle fans, rings and homing
  rockets you can shoot down. Its own stage and boss music.
- **Zone B's secret bonus stage, PEARL GROTTO** (M2-11): fly into the gap between two reef blocks at
  the top of the screen (about 2:10 into the zone) — 1,000-point capsules, an extra ship, two brick
  walls; clearing it clears the zone (the boss is skipped). Works on every device.
- **Zone C, DUNE EXPANSE** (M2-11) replaces its stand-in: about 4 minutes of sand worms bursting out
  of the dunes, beetles walking on the canyon ceiling, dust devils, sand geysers throwing clods, heat
  haze and a sandstorm run; the boss **SANDGRAVE WIDOW** is a giant spider — shoot its two fangs,
  then its head — sending spider drones and, once angry, blinking silk-line lasers. Its own music.
- For content authors (M2-11): the behaviours `rocket.homing` (homing rockets as shootable enemies),
  `worm.burst` (a formation is one sand worm), `boss.maw` and `boss.widow`; the zone patterns
  `brine.jelly-ring` and `dune.whirl`; the tilesets `terrain-reef` / `terrain-dune`; stage-scoped
  songs for zones B and C ([`content/stages/README.md`](content/stages/README.md),
  [`content/enemies/README.md`](content/enemies/README.md)).
- Behaviour change for tools and tests (M2-11): `BossPart` gained `restX` / `restY` (the boss data's
  offsets — `boss.maw` places its jaws from them); the playtest harness times the stage's main
  encounter, never a captain; the recovery rule lives in `test/playtest/recovery.ts`. The golden
  replays were re-blessed (the new sprites and scripts shift ids — inputs, tick counts and outcomes
  unchanged) and five zone B / C runs were added. The Tizen `app.js` is 307.5 KB gzip of its
  350 KB budget.
- **Zone D, MAGMA DEEP** (M2-12) replaces its stand-in: about 3½ minutes over erupting volcanoes
  throwing lava bombs, then a **dive** — the scrolling stops and the view sinks down into the caves
  — with rocks dropping from the roof, a **maze of brick walls** (a gap in each, or shoot your way
  through), a lava river over a colour-rolling lake of lava; the boss **CINDER BASTION** is a
  battleship whose core hides behind turning shield arms, with lane lasers from two emitters. Its
  own stage and boss music.
- **Zone E, TEMPEST RIDGE** (M2-12) replaces its stand-in: about 4 minutes in a storm over jagged
  mountains — rolling clouds, slanting rain —, kites and jets that come **from behind** and overtake
  the ship, thunderheads firing needle streaks and a gale run; the boss **SQUALL STEED** is a
  seahorse whose chest can only be hit while open, sending out little homing seahorses. Its own
  music.
- For content authors (M2-12): the behaviours `rear.swoop` (a rear attacker: in from behind along
  its row, one shot back, away), `boss.bastion` (rotating shield arms as boss parts on a spinning
  hub, attached lane lasers) and `boss.steed` (a bob, a `whenOpen` chest launching minis); taller
  maps with a dive (`tilemap.rowsTall`, a `hold` key with a `yTo` pan), destructible walls as `rle`
  rows, spawns behind the view (a negative `screenX`), rear-entry paths; the pattern `tempest.bolt`;
  the tilesets `terrain-magma` / `terrain-ridge`; songs for zones D and E
  ([`content/stages/README.md`](content/stages/README.md),
  [`content/enemies/README.md`](content/enemies/README.md)).
- Behaviour change for tools and tests (M2-12): the content test's zones block covers B–E (new types
  counted against every zone a run can have flown before, ground enemies checked at the camera
  height their event fires at, a lane limit per boss); the stage-runtime corridor check measures the
  rows the camera shows; `playGolden` takes an optional per-tick observer. The golden replays were
  re-blessed (new sprites and scripts shift ids — inputs, tick counts and outcomes unchanged) and
  five zone D / E runs were added (38 in all). The Tizen `app.js` is 313.5 KB gzip of its 350 KB
  budget.
- **Zone F, CELL VAULT** (M2-13) replaces its stand-in: about 3½ minutes inside a living vault —
  cells that **chase** the ship, big cells that **divide** into two chasers when shot, a passage of
  **tissue walls that grow back** after you shoot through them (a gap in each), **grabbing
  tentacles** that lunge and tug the ship, spore sacs and a fast pulse run; the boss **MANTLE
  REGENT** is a squid whose two tentacles curl in front of its eye to guard it — break one and it
  changes its attacks, launching chasing cells. Its own stage and boss music.
- **Zone G, PRISM LABYRINTH** (M2-13) replaces its stand-in: about 4 minutes in a crystal maze —
  crystal walls from the ceiling and the floor in turn, **rushes of cubes** that stick where they hit
  and build walls, lenses fanning needles, geodes that shatter —; the boss **FACET MONARCH** hides
  its core behind two crystals and waves two arms like claws, with lane lasers at the end. **The
  second secret bonus stage**, GLIMMER CACHE (1,000-point capsules, an extra ship), opens when all
  four turrets of the prism gallery are shot down. Its own music.
- For content authors (M2-13): the behaviours `cell.chase` (a chasing cell: in along its row, a
  capped-turn chase, then straight on), `boss.squid` and `boss.facet` (tentacle arms as chains of
  circle-hit parts, curled alike and mirrored, carried across phase changes without a jump); the
  patterns `vault.spores` and `prism.fan`; the tilesets `terrain-vault` / `terrain-prism`; songs for
  zones F and G; the bonus stage `glimmer-cache`; the rule that no ground enemy of an earlier event
  may still stand when a `ground` bonus window arms
  ([`content/stages/README.md`](content/stages/README.md),
  [`content/enemies/README.md`](content/enemies/README.md)).
- Behaviour change for tools and tests (M2-13): the content test's zones block covers B–G (the
  chasing cells' and claws' speeds in the 2-px/tick check) and plays every shipped stage with a
  `ground` entrance to hold it to the rule above. The golden replays were re-blessed (new sprites and
  scripts shift ids — inputs, tick counts and outcomes unchanged; the review fix re-blessed
  `zone-g-god` once more, ticks and outcome unchanged) and eight zone F / G runs were added (46 in
  all). The Tizen `app.js` is 320.3 KB gzip of its 350 KB budget.
- **Zone H, IRON CITADEL** (M2-14) replaces its stand-in — the first final zone: about 4 minutes in
  the enemy fortress — running lights chasing along steel walls, hatches in the floor and the ceiling
  releasing drones, a **piston hall** where floors and ceilings swing in and out while laser
  emitters fire lanes along their rows, a **parade of four earlier bosses in reduced form**
  (BULWARK, MAW, BASTION and REGENT ECHO — each leaves after 16 seconds) and a fast core run; the
  final boss **IRON SOVEREIGN** is a real finale in four phases: shield plates and lanes, a turning
  shield wheel with rings, drones from its hatches, then an overdrive spiral. Its own music.
- **Zone I, ABYSSAL THRONE** (M2-14) replaces its stand-in — the other final zone: about 4½ minutes
  in the deep — twinkling specks, gulpers, **depth mines** that arm when you come near and burst into
  rings, eels bursting from a trench and an undertow; the **ABYSS ARK** is a whale-class battleship
  the view flies along (turret rows, homing hooks) that sails away after 90 seconds, and its final
  blast reveals **THE HOLLOW KING**, an anglerfish whose mouth opens to show its weak point and
  whose lure sways and fires. Its own music.
- **Endings and credits** (M2-14): after zone H or I the run ends with an **ending scene** — the
  citadel breaking apart behind your ship, or your ship rising out of the deep while the ARK sinks
  (or sails off, if it escaped) —, a **dawn** when no ship was lost, a five- or six-line epilogue,
  the result card, and then the **credits** scrolling to their own song (OK or Back skips them).
  Five endings: THE CITADEL FALLS SILENT / THE CITADEL FALLS (zone H), THE DEEP IS STILL / THE
  FLAGSHIP SLIPS AWAY / THE THRONE IS BROKEN (zone I) — an escaped ARK always gives THE FLAGSHIP
  SLIPS AWAY. New songs: the two final zones and their bosses, AFTER THE LAST WAVE (the ending) and
  THANK YOU, PILOT (the credits).
- For content authors (M2-14): the behaviours `emitter.laser` (a laser emitter's attached lanes),
  `mine.burst` (a mine that arms when a ship comes near), `boss.sovereign`, `boss.ark` and
  `boss.angler`; the pattern `abyss.gulp`; the tilesets `terrain-citadel` / `terrain-abyss`; a
  campaign ending's `scene` (`none` / `citadel` / `abyss`) and `text` (the epilogue) and the
  campaign's `credits`; a stage's optional `music.ending` / `music.credits` cues
  ([`content/campaign/README.md`](content/campaign/README.md),
  [`content/stages/README.md`](content/stages/README.md),
  [`content/enemies/README.md`](content/enemies/README.md)).
- Behaviour change for tools and tests (M2-14): `ScriptApi.sleepUntilNear` / `Enemy.nearRange` and
  `BossScriptApi.spiral` / `Boss.spiral*` joined the state hash; `core/behaviors` is `implemented`;
  the scene flow has a `credits` scene (`CreditsScene`) and 256 UI string slots; the ending screen
  has a story phase before its card and moves on to the credits; `stageMusicCues` adds a final
  zone's ending and credits cues; `UI_SPRITES` gained six `ui/ending-*` sprites; the heavy boss
  allocation guards allow the bytes of their script's wakes (`WakeCount`). The golden replays were
  re-blessed (new sprites and scripts shift ids, the hash gained the new fields — inputs, tick counts
  and outcomes unchanged; the test round's `boss.ark` fix re-blessed `zone-i-god` once more) and
  seven zone H / I runs were added (53 in all). The Tizen `app.js` is 331.5 KB gzip of its 350 KB
  budget.
- **The mode select** (M2-15): the title's menu now reads 1 PLAYER / 2 PLAYERS / **PRACTICE** /
  OPTIONS / **SOUND TEST** / EXIT (EXIT on the TV only) — OPTIONS is one ▼ further down.
- **Attract mode** (M2-15): left alone for 12 seconds on `PRESS OK`, the title plays a **demo** of a
  zone (a recording of the computer player, one zone after the other, silent, `DEMO PLAY`), then the
  **high-score tables**, then an original **story** crawling up over three picture scenes, and comes
  back; any button returns to the title.
- **Name entry and high-score tables** (M2-15): a score that makes its table is named with three
  letters — ▲ ▼ pick a letter, ▶ or OK go on, ◀ or Back go back, OK on `END` finishes (30 s time
  limit) — then the table is shown with the new row blinking. Tables are kept per difficulty, ship
  **and mode**: one-player games, two-player games (both players name their rows) and practice each
  have their own; two-player rows of older saves move into the two-player tables by themselves.
  The zone column shows the zone reached.
- **Practice** (M2-15): choose a ZONE, a CHECKPOINT and a LOADOUT (STANDARD or FULL POWER), then the
  difficulty, ship and weapons as usual; one zone is played from there, its scores go to the
  practice tables and never change the title's `HI`.
- **Sound test** (M2-15): every music track and every sound effect, played with OK; STOP silences
  the music, BACK brings the title theme back.
- **CONTINUE?** (M2-15) shows a time bar that drains (red for the last three seconds, the number
  flashing), your score, and a blinking `PRESS OK` / `BACK: GIVE UP` once OK counts.
- For content authors (M2-15): the new content kind `replay` — the attract demos in
  `content/demos/` (recorded by `test/golden/demos.ts`, never edited by hand) — and a campaign's
  optional `story` (up to 8 pages, each a picture scene `none` / `dawn` / `invasion` / `launch` and
  up to 6 lines) ([`content/demos/README.md`](content/demos/README.md),
  [`content/campaign/README.md`](content/campaign/README.md)).
- Behaviour change for tools and tests (M2-15): `TitleItem` is Start 0, TwoPlayers 1, Practice 2,
  Options 3, SoundTest 4, Exit 5; every end of a game goes through `finishGame()` — the name entry
  (when a score entered its table) and the result table before the title; `hiScoreModeKey(config,
  mode)` names `-2p` / `-practice` tables; `SimEventKind.SoundTest` (16), `GameOptions.soundTest`,
  `AudioEngine.playTrack` and the shell's `connectSoundTest` are new; `core/replay` was split into
  `format.ts` and `demo.ts` (`createDemoPlayback`, `DemoPlayback`) with the same public API;
  `pnpm golden:update` also re-records the demos; `core/scenes` is `implemented`, with 384 UI string
  slots. No simulation change — the golden replays are unchanged. The Tizen `app.js` is 343.8 KB gzip
  of its 350 KB budget.
- **The Options screen, regrouped** (M2-16): MASTER / MUSIC / SFX, then three pages — **CONTROLS**,
  **DISPLAY** (BULLETS, SCALE, SHAKE, FLASHES, HITBOX, BOSS HP, as before) and **GAME** — and BACK.
- **CONTROLS** (M2-16): the control profile, **AUTOFIRE** — ALWAYS (as before), TOGGLE (each Shot
  press switches firing off and on) or HOLD (fire while Shot is held); the TV stays always-on —,
  **RATE** (7.5 to 30 shots a second), **SOCD** (what opposite directions held together do),
  **DEBOUNCE** (the remote's hiccup protection, 0–10 frames) and an **INPUT TEST** that lights every
  game action you press (hold Pause to leave).
- **Rebinding** (M2-16): **REBIND KEYS** / **REBIND PAD** give every action of the game and of the
  menus your own keys, remote buttons or gamepad buttons — a 5-second capture prompt, conflicts
  resolved by taking the key from the other action or swapping the two, never leaving an action the
  game needs without a key; Esc and the remote's Back never move; RESET brings the standard keys
  back. Kept per control profile, remembered.
- **GAME** (M2-16): the difficulty (now remembered between launches), **LIVES** 1–5, the death
  **PENALTY**, **AUTO POWER**, the pickup **MAGNET** and **ONE BUTTON** play (autofire, Auto
  Power-Up and the casual penalty — a game with the directions alone). They apply from the next game
  or a RETRY STAGE; a run keeps what it started with. The DIFFICULTY box shows the LIVES the game will
  get.
- For translators (M2-16): every word of the canvas UI is in a string table,
  `content/strings/en.strings.json` (kind `strings`) — a `<language>.strings.json` file holds a
  translation; choosing the language comes later ([`content/strings/README.md`](content/strings/README.md)).
- Behaviour change for tools and tests (M2-16): `OptionsItem` is Master 0, Music 1, Sfx 2, Controls 3,
  Display 4, Game 5, Back 6 (the display rows are `DisplayItem`s, the profile `ControlsItem.Profile`);
  `GameConfig.autofireMode` is new (replay headers record it — older headers decode to `'always'`;
  every golden replay and demo was re-blessed for the header only, same hashes and outcomes; two
  autofire goldens were added); the save is **version 2** under the same key (`save.v1`), migrated
  from version 1 (options kept, the co-op / practice rows of old one-player tables moved);
  `UserOptionKind.InputSettings` (10), `GameOptions.controls`, `@shmup/input-web`'s rebinding API and
  the shell's `createShellControls` are new; 512 UI string slots. The Tizen `app.js` is ≈ 359 KB gzip
  of a budget raised to 384 KB.
- **The desktop app, first-class** (M2-17): settings and high scores are kept in **files** in the
  user-data folder (`saves/save.v1.json`, written atomically with the previous version kept as a
  `.bak` and read back if a file is missing or damaged); the title has **EXIT**; sound starts at
  once; the window **remembers** fullscreen (**F11** / **Alt+Enter**), its size in whole steps of
  the picture (**Ctrl + =** / **Ctrl + -** / **Ctrl + 0**, Cmd on macOS) and its position (on Linux
  and the Steam Deck too); installers can be built with `pnpm --filter @shmup/electron package`
  (Windows, Linux AppImage, macOS — unsigned, no icon yet). Desktop builds before M2-17 kept their
  save in the app's browser storage, which is not carried over.
- **TV extras** (M2-17): a **game-mode build** (`build:game-mode` — Samsung's `use.game.mode`
  metadata) for the latency A/B test on the monitors; the default build stays without metadata, and
  the launch-time gamepad check exists only as an opt-in test build (it shows a popup without a
  pad). The debug build's panel shows the monitor's **model and firmware** (a sixth line; the app now
  requests the `productinfo` privilege), and `tizen:watch` **live-reloads** a development build on
  the TV after every change.
- **Storage** (M2-17): a full browser / TV storage no longer stops saving for the rest of the session
  — only the value that did not fit waits in memory; debug builds can **export and import the
  save** (`__shmupDebug.save`) for bug reports. The shell estimates the TV memory per zone (every
  zone under 100 MB) and unloads atlas pages a zone does not need (none yet — one page).
- Behaviour change for tools and tests (M2-17): `apps/web` and `apps/tizen` use the shell's
  `createWebStorage` (`@shmup/shell` `storage`); `createLocalStorage` returns a `QuotaStorage`; the
  web platform takes `electron` (`getElectronBridge`) and is `'electron'` with it; the Electron
  preload exposes `storage.get` / `storage.set`; `SaveStore.replace`, `DebugToolsOptions.device`,
  `DebugOverlay.setDevice`, `Shell.atlasResidency`, the `memory` module, `tizenDebugTools`'s `canvas`
  argument and the `__SHMUP_LIVE_RELOAD__` define are new; `device-info` and `live-reload` are
  implemented. No simulation change — the golden replays are unchanged. The Tizen `app.js` is ≈ 361 KB
  gzip of 384 KB.
- **Release hardening** (M2-18) — what the release bot runs found and fixed:
  - the **MANTA's waves** (the LASER → WAVE family's top four levels) now pass through armour: a
    wave clinks on an armoured part at most once every 6 ticks and flies on to the weak point behind
    it (a new `passArmour` weapon tunable) — before, a fully powered MANTA could not hurt MANTLE
    REGENT, IRON SOVEREIGN or THE HOLLOW KING at all;
  - the **MANTA's fifth disc level** fires two parallel small discs instead of a narrow V whose gap
    let a small core straight ahead through (CINDER BASTION survived it);
  - **GALVANIC MAW** opens its jaws wider (8 px, 9 in its last phase) so the MANTA's biggest discs
    reach its mouth;
  - **SANDGRAVE WIDOW** waits a whole silk line before spinning the next one however high the rank
    is — a fully powered ship's rank used to bring two lines 16 px apart (under the 4-way gap);
  - the golden replay `zone-b-god` was re-blessed for the wider jaws (nine ticks longer, same
    outcome); no other replay or attract demo changed.
- **Release checks** (M2-18): the 4-way bot clears all **16 routes with both ships** (every zone in
  3–6 minutes, the 4-way rules holding on every tick); a **release audit** of the content (capsule
  and item budgets, the recovery rule, every bullet pattern at Normal and at loop 1's top rank,
  every boss fight's laser lanes with both ships); **cross-engine determinism** — every golden
  replay and attract demo reproduces its state hashes in Chromium and Firefox; per-zone stress
  benchmarks and a 30-minute soak (`pnpm bench`); boot to title in under 3 s and the Tizen
  certification self-checks (Back / exit, multitasking, resume, user data) in the browser tests.
- **Icons and store placeholders** (M2-18): `pnpm store:assets` draws the TV icon (512 × 423), the
  desktop app's icon (512 × 512 — the installers now have one) and placeholder store screenshots
  and listing text from the game's own placeholder art.
- Behaviour change for tools and tests (M2-18): `ShotFlag.PassArmour` and the `direct.bolt`
  tunable `passArmour`; `@shmup/shell`'s `determinism` module (`createDeterminismCheck`,
  `installDeterminismCheck`); the web app's `?determinism` page in dev / test builds; the playtest
  harness's `CampaignFlags.observe`, `columnGap` and `RuleWatch.narrowestColumn`; Playwright's
  `firefox` project; version `1.0.0-rc.1`.

### Documentation

- New developer guides [`docs/dev/difficulty-and-rank.md`](docs/dev/difficulty-and-rank.md),
  [`docs/dev/pattern-dsl.md`](docs/dev/pattern-dsl.md) and
  [`docs/dev/meter-arsenal.md`](docs/dev/meter-arsenal.md); the pattern format for authors in
  [`content/patterns/README.md`](content/patterns/README.md); the tester guide's
  [difficulty, extra ships and continues](docs/client/preview-build.md#difficulty-extra-ships-and-continues)
  and [Options screen](docs/client/preview-build.md#the-options-screen) (BULLETS), and
  [Choosing your weapons](docs/client/preview-build.md#choosing-your-weapons) (the WEAPON SELECT
  screen, M2-03; the Option types and shields, M2-04) and
  [The Option Hunter range](docs/client/preview-build.md#the-option-hunter-range-browser-only)
  (M2-04); the developer guide
  [`docs/dev/options-shields-hunter.md`](docs/dev/options-shields-hunter.md) (M2-04); the
  developer guide [`docs/dev/direct-mode.md`](docs/dev/direct-mode.md) and the tester guide's
  [Choosing your ship](docs/client/preview-build.md#choosing-your-ship),
  [The MANTA](docs/client/preview-build.md#the-manta-colour-items-weapons-and-the-arm) and
  [The Direct range](docs/client/preview-build.md#the-direct-range-browser-only) (M2-05); the
  developer guide [`docs/dev/coop.md`](docs/dev/coop.md), the tester guide's
  [Two players](docs/client/preview-build.md#two-players) and the controls page's
  [Two players](docs/client/controls.md#two-players) (M2-06); the developer guide
  [`docs/dev/advanced-stages.md`](docs/dev/advanced-stages.md) and the tester guide's
  [The Gimmick range](docs/client/preview-build.md#the-gimmick-range-browser-only) (M2-07); the
  developer guide [`docs/dev/presentation-polish.md`](docs/dev/presentation-polish.md), the tester
  guide's [Options screen](docs/client/preview-build.md#the-options-screen) (SCALE, SHAKE, FLASHES,
  HITBOX) and [The Raster range](docs/client/preview-build.md#the-raster-range-browser-only)
  (M2-08); the developer guide [`docs/dev/advanced-bosses.md`](docs/dev/advanced-bosses.md) and the
  tester guide's
  [The advanced boss ranges](docs/client/preview-build.md#the-advanced-boss-ranges-browser-only)
  and [The boss HP bar](docs/client/preview-build.md#the-boss-hp-bar-every-device) (M2-09); the
  developer guide [`docs/dev/campaign-and-bonus-stages.md`](docs/dev/campaign-and-bonus-stages.md),
  the map format for authors in [`content/campaign/README.md`](content/campaign/README.md), and the
  tester guide's [The zone map](docs/client/preview-build.md#the-zone-map-a-run-through-nine-zones)
  and [Hidden bonus stages](docs/client/preview-build.md#hidden-bonus-stages)
  (M2-10); the developer guide [`docs/dev/zones-b-and-c.md`](docs/dev/zones-b-and-c.md) and the
  tester guide's [Zone B: BRINE NEBULA](docs/client/preview-build.md#zone-b-brine-nebula) (with
  the secret bonus stage PEARL GROTTO) and
  [Zone C: DUNE EXPANSE](docs/client/preview-build.md#zone-c-dune-expanse) (M2-11); the developer
  guide [`docs/dev/zones-d-and-e.md`](docs/dev/zones-d-and-e.md) and the tester guide's
  [Zone D: MAGMA DEEP](docs/client/preview-build.md#zone-d-magma-deep) and
  [Zone E: TEMPEST RIDGE](docs/client/preview-build.md#zone-e-tempest-ridge) (M2-12); the developer
  guide [`docs/dev/zones-f-and-g.md`](docs/dev/zones-f-and-g.md) and the tester guide's
  [Zone F: CELL VAULT](docs/client/preview-build.md#zone-f-cell-vault) and
  [Zone G: PRISM LABYRINTH](docs/client/preview-build.md#zone-g-prism-labyrinth) with the secret
  bonus stage [GLIMMER CACHE](docs/client/preview-build.md#the-secret-bonus-stage-glimmer-cache)
  (M2-13); the developer guide [`docs/dev/zones-h-and-i.md`](docs/dev/zones-h-and-i.md) and the
  tester guide's [Zone H: IRON CITADEL](docs/client/preview-build.md#zone-h-iron-citadel),
  [Zone I: ABYSSAL THRONE](docs/client/preview-build.md#zone-i-abyssal-throne) and
  [The endings and the credits](docs/client/preview-build.md#the-endings-and-the-credits) (M2-14);
  the developer guide [`docs/dev/front-end-and-attract.md`](docs/dev/front-end-and-attract.md), the
  demo format for authors in [`content/demos/README.md`](content/demos/README.md) and the tester
  guide's
  [The front end](docs/client/preview-build.md#the-front-end-attract-mode-high-scores-practice-and-the-sound-test)
  (M2-15); the developer guide
  [`docs/dev/options-rebinding-and-accessibility.md`](docs/dev/options-rebinding-and-accessibility.md),
  the string-table format for translators in [`content/strings/README.md`](content/strings/README.md),
  the tester guide's [The Options screen](docs/client/preview-build.md#the-options-screen) (the
  CONTROLS, DISPLAY and GAME pages) and the controls page's
  [CONTROLS page](docs/client/controls.md#the-controls-page-autofire-socd-and-the-hiccup-protection),
  [Rebinding](docs/client/controls.md#rebinding-keys-and-buttons),
  [Input test](docs/client/controls.md#the-input-test) and
  [One-button play](docs/client/controls.md#one-button-play) (M2-16); the developer guide
  [`docs/dev/platform-polish.md`](docs/dev/platform-polish.md), the new player page
  [`docs/client/desktop-app.md`](docs/client/desktop-app.md), the TV page's
  [game-mode build](docs/client/install-on-tv.md#the-game-mode-build-latency-ab-test) and live
  reload, the debug tools'
  [device line](docs/client/debug-tools.md#the-device-line) and save export, and the remote Web
  Inspector in [`docs/dev/build-test-deploy.md`](docs/dev/build-test-deploy.md#the-remote-web-inspector-devtools-on-the-tv)
  (M2-17); the developer guide [`docs/dev/release-hardening.md`](docs/dev/release-hardening.md) —
  the release gate, what it found, the determinism check, the benchmarks, the release checks, the
  icons, the version and what stays manual — and the player / owner page
  [`docs/client/release-candidate.md`](docs/client/release-candidate.md): where the version shows,
  what changed for players, what the automated checks cover and the v1.0 checklist for the
  monitors (M2-18).

## [0.1.0] — M1: playable vertical slice

The first milestone (plan steps M1-01 … M1-19): one complete zone with its boss, playable from
start to stage clear with the Samsung remote alone, in the browser dev app and as a Tizen 5.5
widget bundle (`pnpm --filter @shmup/tizen build` → a checked `dist/` ready to package).

### Game

- **Zone A — AZURE VERGE**: about three minutes of scrolling in five sections (open space, fan
  formations, floor and ceiling terrain with turrets, walkers and hatches, orbiters) ending with the
  WARNING and the multi-part boss **HALCYON BULWARK** (code HB-01, three phases).
- **KESTREL**, the meter ship: six speed levels, normalized diagonals, fly-in and respawn, Type A
  arsenal (shot, Double, Laser, Missile) with always-on autofire, up to four trailing Options.
- The seven-slot **power meter** (Speed, Missile, Double, Laser, Option, `?` Force Field,
  `!` Mega Crash), capsule carriers and formation bonuses, optional Auto Power-Up, pickup magnet.
- Enemy bullets on 32 aim directions tuned for 4-way dodging, telegraphed lasers, bullet cancel on
  death; death penalties Classic (default), Arcade and Casual; lives, score and hi-score.
- Game feel: hit flash, hit-stop on big events, screen shake, flash limiter, particles, score
  popups; procedural placeholder SFX and chip-tune music with sample-exact loops.
- Scene flow: title, game, pause, stage clear, game over, exit confirmation on the TV, an Options
  screen (volumes, controls profile); saves (`save.v1`) with hi-score tables and migrations.
- Remote-first input: data-driven key profiles (`tizen-remote-safe` default, release debounce,
  diagonal and SOCD policies), separate game / menu binding tables, gamepad and keyboard support.

### Engine and tooling

- `@shmup/core`: deterministic simulation (seeded RNG streams, trig tables, fixed 9-phase tick,
  struct-of-arrays pools, zero allocations per tick), validated JSON content, scene stack, HUD and
  canvas UI kit, state hashing.
- `@shmup/render-pixi` (PixiJS 8, WebGL1 first, 384×216 integer-scaled), `@shmup/audio-web`
  (Web Audio engine and synth), `@shmup/input-web`, `@shmup/shell` (the shared browser host).
- Placeholder art as code: pixel-map sources and procedural generators packed into a ≤ 2048²
  atlas by `pnpm assets`; content and the atlas manifest inlined into the single classic ES2018
  IIFE the TV runs.
- M1-19 — **debug tools** in dev / test builds (`__SHMUP_DEV__`): god mode, stage skip to the boss,
  jump to the next checkpoint, frame advance and single steps, slow motion 2× / 4×, hitbox and grid
  outlines and an overlay (FPS, tick / render ms, draw calls, pool usage, rank, RNG calls, state
  hash, WebGL version, boot ms, frame graph) — F1–F8 on the web, unlocked on the TV by the remote
  sequence Pause, Ch+, Ch+, Ch+ (then 1–8); `window.__shmupDebug` for tests.
- M1-19 — **replays** (`core/replay`): per-tick `held | pressed << 16` input per player,
  run-length and base64 encoded, a header with every sim-affecting option, a state hash every 600
  ticks, playback with desync detection; **golden replays** of zone A (`test/golden/`) checked by
  `pnpm test` and re-blessed with `pnpm golden:update`.
- M1-19 — **budgets**: `pnpm bench` (20,000 stress ticks — median < 1.0 ms/tick, heap growth
  < 512 KB, run in CI) and the Tizen bundle check (`app.js` ≤ 350 KB gzipped, atlas pages
  ≤ 2048², `dist/` ≤ 8 MB); an e2e gameplay smoke on both builds.
- Versions: `0.1.0` in every package manifest and in the widget's `config.xml`.

### Documentation

- Testers: [`docs/client/preview-build.md`](docs/client/preview-build.md) (the build, checks per
  feature), [`docs/client/debug-tools.md`](docs/client/debug-tools.md) (the debug build, the
  developer tools and the **M1 release check** for the monitors),
  [`docs/client/controls.md`](docs/client/controls.md),
  [`docs/client/install-on-tv.md`](docs/client/install-on-tv.md).
- Contributors: [`docs/dev/`](docs/dev/README.md) — one guide per system, including
  [`debug-and-replays.md`](docs/dev/debug-and-replays.md) for the M1-19 tooling, and the
  [API reference](docs/dev/api-reference.md).

[Unreleased]: https://github.com/detain/shmup-cup/commits/master
[1.0.0-rc.1]: https://github.com/detain/shmup-cup/tree/master
[0.1.0]: https://github.com/detain/shmup-cup/tree/master
