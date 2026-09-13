# Changelog

All notable changes to Shmup Cup. The project follows [Semantic Versioning](https://semver.org/);
versions before 1.0 may change anything between minor releases. Development follows the step plan in
[`shmup_plan.md`](shmup_plan.md); progress is tracked in [`shmup_progress.md`](shmup_progress.md).

## [Unreleased] — M2: complete v1.0

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
  `?` gives the Force Field (more shields come with M2-04).
- **WEAPON SELECT** screen after the DIFFICULTY menu (M2-03) — one more OK to start a game (START is
  highlighted): the type, the three slot weapons under EDIT, `?`, `!`, Auto Power-Up and its
  **order** (an AUTO ORDER box), with a **live preview** of the choice flying over a practice range
  behind the panel. The choice lasts for the session.
- Behaviour change for tools and tests (M2-03): `GameConfig` has `weaponPreset`, `weaponEdit`,
  `megaChoice` and `shieldChoice` (replay headers record them; older headers decode to the
  defaults); the golden replays were re-blessed (the new content shifts sprite ids, the Free Way
  direction is hashed — same outcomes) and four boss runs with the new weapons were added.

### Documentation

- New developer guides [`docs/dev/difficulty-and-rank.md`](docs/dev/difficulty-and-rank.md),
  [`docs/dev/pattern-dsl.md`](docs/dev/pattern-dsl.md) and
  [`docs/dev/meter-arsenal.md`](docs/dev/meter-arsenal.md); the pattern format for authors in
  [`content/patterns/README.md`](content/patterns/README.md); the tester guide's
  [difficulty, extra ships and continues](docs/client/preview-build.md#difficulty-extra-ships-and-continues)
  and [Options screen](docs/client/preview-build.md#the-options-screen) (BULLETS), and
  [Choosing your weapons](docs/client/preview-build.md#choosing-your-weapons) (the WEAPON SELECT
  screen, M2-03).

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
[0.1.0]: https://github.com/detain/shmup-cup/tree/master
