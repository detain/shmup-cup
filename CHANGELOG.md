# Changelog

All notable changes to Shmup Cup. The project follows [Semantic Versioning](https://semver.org/);
versions before 1.0 may change anything between minor releases. Development follows the step plan in
[`shmup_plan.md`](shmup_plan.md); progress is tracked in [`shmup_progress.md`](shmup_progress.md).

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

[0.1.0]: https://github.com/detain/shmup-cup/tree/master
