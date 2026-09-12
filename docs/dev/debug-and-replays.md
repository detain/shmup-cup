# Debug tools, replays, golden tests and budgets

Plan step **M1-19** closes the first milestone with the developer tooling of `shmup_feat.md`
§24 and the determinism / performance safety nets of §21 – §23:

- **debug tools** in dev and test builds — god mode, stage skip to the boss, jump to the next
  checkpoint, frame advance and single steps, slow motion, hitbox and grid outlines and an
  overlay (FPS, tick / render ms, draw calls, pool usage, rank, RNG calls, state hash, WebGL
  version, boot ms, a frame graph) — F1–F8 on the web, behind the remote sequence Pause, Ch+,
  Ch+, Ch+ on the TV, and `window.__shmupDebug` for tests and the remote inspector;
- **replays** (`core/replay`): a session's input per tick, a header with everything needed to
  recreate its start, state hashes to detect a desync;
- **golden replays** of zone A (`test/golden/`) checked by every `pnpm test`, re-blessed with
  `pnpm golden:update`;
- **budgets**: `pnpm bench` (ms per tick and heap growth under maximum load) and the Tizen bundle
  check's size limits;
- an **e2e gameplay smoke** on both builds and the `0.1.0` release (the M1 on-device checklist).

The tester's side (unlocking the tools on the TV, reading the overlay, the release checklist) is
in [../client/debug-tools.md](../client/debug-tools.md).

## Where things live

| Piece | Module / file | Runs in |
|---|---|---|
| Debug switches, controls, overlay counters, stage jumps, `hashWorld` | `@shmup/core` `debug` | the sim (pure) |
| Frame advance and slow motion | `@shmup/core` `game` (`Game.frame`, `Game.requestStep`) | the sim's frame loop |
| Recording, playback, desync report, file format | `@shmup/core` `replay` | the sim (pure) |
| The overlay: panel, frame graph, outlines | `@shmup/render-pixi` `debug` | presentation |
| Draw-call counter | `@shmup/render-pixi` `renderer` (`countDrawCalls`, `drawCalls`) | presentation |
| Keys, TV unlock, per-frame timing, `window.__shmupDebug` | `@shmup/shell` `debug` (a module the plan did not name — timing and keys are host work) | the browser host |
| Remote number keys, the TV's unlock callback | `apps/tizen` `boot` (`tizenDebugTools`, `DEBUG_REMOTE_KEYS`) | the TV app |
| `__SHMUP_DEV__`, `__SHMUP_BUILD__` | `vite.shared.ts` `shmupBuildInfo()`, `types/build-info.d.ts` | the app builds |
| Golden replays | `test/golden/` (`golden.ts`, `golden.test.ts`, `*.replay.json`), `scripts/golden-update.mjs` | `pnpm test`, `pnpm golden:update` |
| Stress benchmark | `test/bench/` (`stress.perf.ts`, own `vitest.config.ts`) | `pnpm bench`, CI |
| Bundle budgets | `apps/tizen/scripts/check-bundle.mjs` | every Tizen build |
| Gameplay smoke, debug-tool and frame-advance e2e | `test/e2e/smoke.spec.ts`, `debug-tools.spec.ts`, `frame-advance.ts` | `pnpm test:e2e` |

## Release builds and dev / test builds

The debug tools must never reach a player's TV, yet the e2e suite and the on-device checks need
them. Two Vite defines decide, both from `shmupBuildInfo()` in `vite.shared.ts` (both apps list
the plugin; types in `types/build-info.d.ts`, included by the apps' `tsconfig.json`):

| Define | Value |
|---|---|
| `__SHMUP_DEV__` | `true` for the dev server (`pnpm dev`) and for `vite build --mode development` / `--mode test` (`DEV_BUILD_MODES`, `isDevBuild(env)`); `false` for `vite build` (mode `production`) |
| `__SHMUP_BUILD__` | `buildId()`: the `SHMUP_BUILD_ID` environment variable when set, else the short git SHA of `HEAD` (7 characters, `+` appended when tracked files have uncommitted changes — untracked files do not count), else `'unknown'` |

| Command | Build | Debug tools |
|---|---|---|
| `pnpm build`, `pnpm --filter @shmup/tizen build` | release | none — `main.ts`'s `__SHMUP_DEV__ ? … : null` folds to `null` and the minifier drops the shell's `debug` module, the overlay and the controls (asserted by `apps/tizen/test/build/tizen-build.test.ts`: no `__shmupDebug`, no `debug-overlay` in `app.js`) |
| `pnpm --filter @shmup/web build:test`, `pnpm --filter @shmup/tizen build:test` | test (`--mode test`) | yes — what `pnpm test:e2e` builds (Turborepo task `build:test`) |
| `pnpm --filter @shmup/web build:dev`, `pnpm --filter @shmup/tizen build:dev` | dev (`--mode development`) | yes — the **on-device debug build** for the §8.4 checks: build it, then `tizen:package` / `tizen:install` / `tizen:run` as usual |
| `pnpm dev` | dev server | yes (F1–F8) |

Both apps' `main.ts` do the same:

```ts
// apps/web/src/main.ts
bootWebApp(canvas, {
  contentFiles,
  assets,
  debugTools: __SHMUP_DEV__ ? debugToolsFactory({ buildId: __SHMUP_BUILD__ }) : null,
});

// apps/tizen/src/main.ts — the remote unlock, number keys registered on unlock
bootTizenApp(canvas, {
  contentFiles,
  assets,
  debugTools: __SHMUP_DEV__ ? tizenDebugTools(window, __SHMUP_BUILD__) : null,
});
```

The defines are read only by the entry points, so no unit test needs them. The `build:test` and
`build:dev` bundles are the release code plus the tools (measured at M1-19: release `app.js`
228.6 KB gzipped, test build ≈ 234 KB).

## The debug switches (`core/debug`)

`DebugFlags` is **one object per `Game`** (`game.debug`, from `createDebugFlags()`); `createGame`
hands it to every World of the session through `WorldOptions.debugFlags`, so `world.debugFlags`
*is* `game.debug` and a switch survives a new game start or RETRY STAGE. A World created alone
(`createWorld` without the option) gets its own set, everything off.

| Flag | Default | Effect | Sim-affecting? |
|---|---|---|---|
| `godMode` | `false` | `playerHit` ignores every hit (bullets, enemies, terrain) | **yes** — a replay records it as `assisted` |
| `showHitboxes` | `false` | the overlay draws hurtboxes, terrain boxes, shot boxes, bullet circles, item radii, laser capsules | no |
| `showGrid` | `false` | the overlay draws the broad-phase grid's cells | no |
| `frameAdvance` | `false` | `Game.frame` runs only ticks queued with `Game.requestStep` | no (how many ticks a frame runs, never what a tick does) |
| `slowMo` | `1` | `1 \| 2 \| 4` (`SlowMo`, `SLOW_MO_STEPS`): the frame clock runs that many times slower | no (same) |
| `overlay` | `false` | the overlay's panel is shown | no |

`collectDebugCounters(world, out)` fills a `DebugCounters` for the panel every frame, read-only:
the World's tick, enemy slots in use / 64, live enemy bullets / 512, lasers, player shots / 96,
items, the rank, `world.rng.gameplay.callCount` (diagnostic — the RNG draws since the World was
created; a change in it between two runs of the same input is the first sign of a determinism
bug) and a `hashWorld` state hash that it recomputes only every `DEBUG_HASH_INTERVAL` (60) ticks,
when none was taken yet, or when the tick went back (a new World). The hash is the one
allocation (the boxed unsigned result).

## The debug controls

`createDebugControls(game)` returns `{ game, flags, run(command) }`. Every command is a
`DebugCommand` code (names in `DEBUG_COMMAND_NAMES`); `run` returns whether it changed
something.

| Code | Command | Effect | Web key | TV key (after unlock) |
|---|---|---|---|---|
| 1 | `Overlay` | toggles `flags.overlay` | F1 | 1 |
| 2 | `GodMode` | toggles `flags.godMode` | F2 | 2 |
| 3 | `Outlines` | cycles off → hitboxes → hitboxes + grid → off | F3 | 3 |
| 4 | `Grid` | toggles the grid alone (no key; `__shmupDebug.run(4)`) | — | — |
| 5 | `FrameAdvance` | toggles `flags.frameAdvance` (the game freezes / runs again) | F4 | 4 |
| 6 | `Step` | switches frame advance on and queues one tick (`game.requestStep(1)`) | F5 (auto-repeats while held) | 5 |
| 7 | `SlowMo` | cycles `slowMo` 1 → 2 → 4 → 1 | F6 | 6 |
| 8 | `NextCheckpoint` | `jumpToNextCheckpoint(game.world)` | F7 | 7 |
| 9 | `SkipToBoss` | `skipToBoss(game.world)` | F8 | 8 |

The two stage jumps act only while a stage is being played: the World has a stage, its status is
`playing` or `bossWarning`, and — with the scene flow — the game scene is on top (not the title,
the pause menu or an end screen). Otherwise `run` returns `false` and nothing happens.

- `skipToBoss(world)` (M1-18) jumps the stage runner to `BOSS_SKIP_LEAD` (96) px before the
  stage's first `warning` / `boss` event ([zone-a-and-playtest.md](zone-a-and-playtest.md#the-debug-stage-skip)).
- `jumpToCheckpoint(world, index)` restarts the stage at a checkpoint (`StageRunner.restartAt`,
  `-1` = the stage start; `false` for an index outside `[-1, checkpoints.length)` or free flight);
  `jumpToNextCheckpoint(world)` picks the checkpoint after the last one the camera passed
  (`false` after the last). Replays use `jumpToCheckpoint` to start at `header.checkpoint`.
- Both clear every pool and system (the runner's `clear` hook), re-derive speed / pan / flags at
  the new position and fly every ship in play in again (`spawnPlayer`); loadouts, lives and
  scores stay; a dying or dead ship keeps its death sequence. The World's tick and RNG streams
  move on from the jump, so a replay that contains the same jump at the same tick reproduces it.

## Frame advance and slow motion (`Game.frame`)

Both live in `Game.frame(nowMs)`, not in the fixed-step loop, and neither changes what a tick
does — every tick still polls input once and runs the whole pipeline, so determinism holds:

- **Normal** (`frameAdvance` off, `slowMo` 1): `loop.advance(nowMs)` as before, checked first so
  the release path costs three comparisons.
- **Frame advance**: only the ticks queued with `game.requestStep(n)` run — **all of them in the
  next frame**, whatever `maxTicksPerFrame` says (the e2e helper `stepTo` relies on it). Requests
  while frame advance is off are ignored; switching it off drops what is still queued.
- **Slow motion 2 / 4**: the loop is fed a clock that advances by `delta / slowMo` per frame
  (kept in a `Float64Array`, passed to `loop.advance` as whole milliseconds — a fractional
  argument would be boxed every frame), so at 60 Hz a tick runs every 2nd / 4th frame.
- **Switching** between the three modes resets the loop's accumulator, so leaving frame advance
  or slow motion never releases a burst of catch-up ticks.

`game.step()` ignores all of it (tests and tools drive ticks directly). Frame advance also
freezes the scene flow's menus (they tick with the game), so a frozen title does not react to OK
until a step runs.

## The keys and `window.__shmupDebug` (`@shmup/shell` `debug`)

The apps pass `ShellOptions.debugTools` — a `DebugToolsFactory` (`debugToolsFactory(options)`)
rather than the tools themselves, so a release bundle, which passes `null`, never references the
module. With a factory, `bootShell` creates the renderer with `countDrawCalls: true` and, once
boot is done (after the canvas is marked `running`, before the first frame), calls it with a
`DebugToolsHost` (`game`, `renderer`, `win`, the clock, `bootMs`, a `sceneId()` accessor and
`visibleWorld()` — the World only while the frame showed one). `Shell.debug` holds the result;
`shell.stop()` destroys it.

`createDebugTools(host, { unlock, buildId, onUnlock })` then:

- listens to `keydown` on the window in the **capture phase** (before the input adapter) and
  maps `DEBUG_KEYS` — F1–F8 by `code` or legacy `keyCode` (112–119), and on the TV the number keys
  1–8 (`digitKeyCode` 49–56) — to their commands. A handled key's default is prevented (F5 would
  reload the page, F1 open help). Auto-repeat only repeats `Step`; a held toggle key is swallowed
  after the first press;
- `unlock: 'keys'` (web, the default): the keys work at once. `unlock: 'sequence'` (TV): nothing
  works until `DEBUG_UNLOCK_SEQUENCE` — Pause (10252, or a keyboard's Pause 19), then Ch+ (427)
  three times, all within `DEBUG_UNLOCK_WINDOW_MS` (3 s) of the first key. The sequence unlocks
  the tools, shows the overlay and calls `onUnlock` once; entered again it toggles the overlay.
  A wrong key restarts the sequence (a Pause restarts it at step 1). The sequence keys are
  **not** swallowed: Pause still opens the game's pause menu, where Ch+ is unbound, so entering
  the sequence never changes the game;
- publishes `window.__shmupDebug` (`DEBUG_GLOBAL`) — a `ShmupDebugApi`: `sceneId` (the scene
  flow's top scene or the dev scene's name — what the e2e smoke waits for), `tick`
  (`game.state.tick`), `worldTick`, `flags` (the live `game.debug`), `counters`, `stats`,
  `unlocked`, `buildId`, `game` and `run(command)` (works locked or not — for tests and the
  remote inspector);
- hooks into the shell's frame (below).

On the TV, `apps/tizen` `tizenDebugTools(win, buildId)` is `debugToolsFactory({ unlock:
'sequence', buildId, onUnlock })` whose `onUnlock` registers `DEBUG_REMOTE_KEYS` (`'1'` … `'8'`)
with `tvinputdevice` (`registerRemoteKeys`) — only then, so a locked dev build behaves like a
release build, and the number keys are registered once. Outside a TV (no `window.tizen`) the
unlock still works and nothing is registered.

### The frame with the tools

```ts
const onFrame = (now: number): void => {
  tools?.beginFrame(now); // frame time → graph + smoothed FPS; start timing the ticks
  // input context …
  game.frame(now);
  tools?.endTicks(); // tick ms (smoothed)
  // follow, drain events, audio endFrame, compose the frame …
  tools?.beforeRender(); // counters (visible World only), draw calls, particles → overlay.update
  renderer.render(shown);
  tools?.afterRender(); // render ms (smoothed)
};
```

Timings are exponentially smoothed (weight 0.1) and kept in a `Float64Array`, so the hooks write
numbers only — but the host clock (`performance.now()`) returns a fresh number per call, so a dev
frame is not strictly allocation-free. Release builds run none of it.

## The overlay (`@shmup/render-pixi` `debug`)

`createDebugOverlay(renderer, { buildId })` adds one container to the renderer's `DEBUG` layer
(screen space, above HUD and UI): the outlines, then the panel. `overlay.update(world, flags,
counters)` rebuilds and draws what is on (the panel while `flags.overlay`, the outlines while
`showHitboxes` / `showGrid` and a World is visible) and hides the rest.

**Panel** (`buildDebugPanel`, top-left of the playfield on a translucent backdrop):

```text
FPS 60  TICK  0.21  RENDER  1.30  DRAW 12
BUL 123/512 ENM 12/64 SHT 40/96 PRT 30/256
RANK 2   RNG 1234  HASH 3735928559 @600
WEBGL 1 BOOT 1234 LAS 2/16 ITM 1/32  ABC1234
GOD HITBOX GRID STEP SLOW 2
```

The fourth line ends with the build id (upper-cased: the pixel font has capitals only); the fifth
lists only the switches that are on. Without a World on screen (the title, a menu over no game)
the bullet, enemy, shot, laser, item, rank, RNG and hash fields stay empty; under the pause menu
the dimmed game is on screen, so they show. To the right, the **frame graph** (`createFrameGraph`, 60 frames, newest on
the right): one 1-px bar per frame, 8 px per 16.7 ms (capped at 40 px), green up to 17.5 ms,
yellow up to 34 ms (one dropped frame), red beyond, with guide lines at one and two 60 Hz frames
— the §8.4 "no hitches" check.

**Outlines** (`buildDebugOutlines`), 1-px rectangles in screen pixels at
`world − camera + (0, PLAYFIELD_Y)`, skipped outside the playfield; a circle is drawn as its
bounding square:

| Kind (`OUTLINE_COLORS`) | Colour | What |
|---|---|---|
| `grid` | blue-grey `#7888b0` (translucent) | the broad-phase grid's cell lines (with `showGrid`) |
| `items` | white | capsule radii |
| `enemies` | red `#ff4848` | live, non-ghost enemy hurtboxes |
| `boss` | orange `#ff9830` | boss parts that have a hurtbox and are not destroyed |
| `shots` | cyan `#48e0ff` | player-shot boxes (a laser's box spans its length) |
| `lasers` | pink `#ff90c8` | active enemy lasers as 17 squares along the beam |
| `bullets` | magenta `#ff50ff` | enemy bullet circles |
| `terrain` | yellow `#ffe040` | the ships' terrain boxes |
| `hurt` | green `#50ff50` | the ships' hurt circles |

**One colour per list.** The overlay is core `DrawList`s drawn through the `ui` module's quad
pools (`createDrawListView`) — no Pixi `Graphics`. Pixi's `tint` setter allocates, and a quad pool
shared by items of different tints re-tints its quads whenever the items shift, so every list has
**one** colour: nine outline lists and seven panel lists (backdrop, labels, values, alerts, the
three graph colours). A quad then keeps its tint for good, and the overlay allocates nothing per
frame (guarded in `packages/render-pixi/test/debug/debug-alloc.test.ts`). Numbers go through the
`number` command, milliseconds as two whole numbers around a dot slot — never a string per frame.

**Draw calls.** `createPixiRenderer({ countDrawCalls: true })` wraps the WebGL context's
`drawElements` / `drawArrays` (and the instanced variants when present) with a counter; each
wrapper forwards its arguments explicitly (no `arguments`, no rest array), so counting allocates
nothing. `renderer.drawCalls` is the last frame's count over both passes, `-1` when not counting.

## Replays (`core/replay`)

A replay reproduces a session tick for tick from its input (`shmup_feat.md` §21). It is the one
playback path for golden tests, the future cross-engine check (M2-18) and attract mode (M2-15).

**Header** (`createReplayHeader(config, { buildId, checkpoint, assisted })`, frozen):

| Field | Meaning |
|---|---|
| `formatVersion` | `REPLAY_FORMAT_VERSION` (1); another version is rejected |
| `buildId` | the build that recorded it (`__SHMUP_BUILD__`; golden replays: `'golden'`) |
| `seed` | `config.seed`, repeated for readability |
| `config` | the session's **whole resolved `GameConfig`** — every sim-affecting option, so a new `GameConfig` field is recorded without touching the replay code (since M2-01 the difficulty preset's rank base / growth, lives, extends, continues, penalty, aim directions and bullet speed — a replay does not depend on the content's `rules` table; an M1 header without them decodes to its preset's values) |
| `stageId` | `config.stage` (`null` = free flight) |
| `checkpoint` | `-1` = the stage start, else the checkpoint the run started from |
| `loadout` | `config.loadout` |
| `assisted` | god mode was on **for the whole run** (playback turns it on) |

**Body.** Per tick and per player (`MAX_PLAYERS` arrays) one 32-bit word `held | pressed << 16`
(`packReplayInput`); `released` is derived on playback exactly as `commitPlayerInput` derives it
(held last tick and not now), and a tap between two ticks survives through `pressed`. The input
*device* is not recorded — the sim never reads it. Plus `hashWorld` after every
`REPLAY_HASH_INTERVAL` (600) ticks and after the last tick (`finalHash`).

```ts
// Recording: the recorder is the session's PlatformInput.
const platform = createHeadlessPlatform();
const header = createReplayHeader(resolveGameConfig({ stage: 'zone-a', seed: 3 }), {
  buildId: __SHMUP_BUILD__,
});
const recorder = createReplayRecorder(platform.input, header);
const game = createReplayGame({ ...platform, input: recorder }, header, db);
while (running) {
  // … feed platform.input …
  game.step();
  recorder.check(game.world); // after EVERY tick: stores the hash on interval ticks
}
const text = JSON.stringify(encodeReplay(recorder.finish(game.world)));

// Playback: a fresh session from the header, hashes compared.
const { report } = playReplay(decodeReplay(JSON.parse(text)), db, { buildId: __SHMUP_BUILD__ });
report.ok; // false → report.desyncTick, expectedHash, actualHash
```

- `createReplayGame(platform, header, content)` is the **same setup for recording and
  playback**: `createGame` in bare gameplay (one World), `game.debug.godMode = header.assisted`,
  and `jumpToCheckpoint` for a checkpoint ≥ 0 (a `RangeError` if it does not exist). Record with
  it too, so a checkpoint start or god mode is set up identically on both sides.
- `createPlayback(replay, { buildId })` is a `PlatformInput` (its own reused snapshot, device
  `'none'`, idle input after the last tick) plus `check(world)` and `report`
  (`DesyncReport { ok, checked, desyncTick, expectedHash, actualHash, finished, buildMatches }`).
  The first mismatching hash is kept. A tampered input or a changed simulation shows up at the
  first hash tick after the change. A `check()` before the first tick only matters for a
  zero-tick replay, whose final hash is the starting state's (`playReplay` makes that call).
- `playReplay(replay, content, options)` plays a whole replay headless → `{ report, game }`.
- **Build lock.** `DesyncReport.buildMatches` compares `header.buildId` with the running build's
  (`null` when none is given). Whether a mismatch refuses the replay is the host's decision; the
  core only reports it. Golden replays use the fixed id `'golden'` and trust their hashes.

**File format** (`encodeReplay` → `ReplayJson`, plain JSON):
`{ kind: 'replay', header, ticks, hashInterval, inputs, hashes, finalHash }`. Each player's words
are run-length encoded as `(value, count)` pairs of unsigned LEB128 varints, then base64
(`encodeInputRuns`; the core's own `encodeBase64` — no `btoa` in the pure core). A 3.5-minute
zone A run is a few hundred bytes of input. `decodeReplay` validates everything — the kind, the
format version, the config through `resolveGameConfig` (only known `GameConfig` keys are read),
header fields agreeing with the config, run lengths adding up to exactly `ticks`, a varint over
32 bits, the hash count — and throws a `RangeError` naming the problem. Extra top-level fields
(a golden file's `description` / `expected`) are ignored.

**Zero allocation.** The recorder preallocates 10 minutes (`RecorderOptions.capacity`, 36,000
ticks; doubles beyond); `poll()` and `check()` of recorder and playback write into typed arrays;
a hash boxes one number every 600 ticks. Encoding, decoding and `finish()` allocate (cold) —
guarded in `packages/core/test/replay/replay-alloc.test.ts`.

**Not covered yet.** Replays record **bare-gameplay sessions** (one World). Recording the scene
flow (menus, retries, several Worlds) is later work: dev auto-record and attract mode (M2-15),
replay save / share / fast-forward (M3-01). God mode toggled **mid-run** is not reproducible —
record with it fixed (the header's `assisted`); the debug stage jumps are reproducible only when
the replay contains them (a session recorded through `createReplayGame` has no key handling).

## Golden replays (`test/golden/`)

Four committed zone A runs pin down what the simulation does (`test/golden/golden.ts`
`GOLDEN_SCENARIOS`, recorded from the M1-18 playtest bots with the build id `'golden'`):

| File | Who plays | Covers | Ends |
|---|---|---|---|
| `zone-a-god.replay.json` | 4-way bot, god mode (seed 1) | the whole stage and HALCYON BULWARK | `stageClear` after 12,637 ticks, 62,750 points, 4 lives (one extend) |
| `zone-a-arcade.replay.json` | 4-way bot, Arcade difficulty (seed 2) | the Arcade preset (rank from 6, 2 lives, the arcade penalty) without god mode | `stageClear` after 12,611 ticks, 64,450 points, 3 lives (one extend) |
| `zone-a-deaths.replay.json` | `weaverBot()` — weaves up / down, never dodges (seed 4) | deaths, Classic respawns, game over | `gameOver` after 5,324 ticks (deaths at 2,125 / 4,457 / 5,231) |
| `zone-a-boss.replay.json` | 4-way bot, `stageSkip: 'boss'`, full loadout, Arcade penalty (seed 3) | the stage skip, the boss with everything | `stageClear` after 908 ticks, 37,000 points |

The 4-way bot survives zone A even at Arcade, which is why the death scenario uses a careless
weaving pilot. The files were re-blessed on purpose by M2-01 (`b31fac5`): rank growth changes
fire rates and bullet speeds as the bot powers up, extends add a life at 20,000 points, and the
Arcade preset now also means 2 lives and the arcade penalty — every scenario kept its outcome. Each file is an encoded replay plus the scenario's `description` and its
`expected` outcome (status, ticks, player 1's score and lives, death ticks, boss killed).

- `golden.test.ts` (part of `pnpm test`, the `integration` project) plays every file into a fresh
  session: **every hash** and the outcome must match. A failure means the simulation changed.
- `golden-edge.test.ts` guards the guards: every file is byte-for-byte what `pnpm golden:update`
  writes for its decoded content (a hand edit or a stale format fails), no file without a
  scenario, re-recording the boss scenario is byte-identical, a tampered replay (other input for a
  burst, another seed) desyncs at the first hash after the change, and the script runs this
  folder with the variable the test reads.
- **Re-bless** with `pnpm golden:update` (`scripts/golden-update.mjs`: runs Vitest on
  `test/golden` with `SHMUP_GOLDEN_UPDATE=1` — set by the script itself, so it works in cmd.exe —
  which re-records every scenario, rewrites its file and then checks the new files). Do it
  **only for an intended simulation change**, in the same commit, and say why in the commit
  message (plan §1.3 / §1.5). Re-recording an unchanged simulation writes identical files, so a
  diff after `golden:update` *is* the behaviour change — review it.
- The files are generated (`JSON.stringify` with a two-space indent) and excluded from Prettier
  (`.prettierignore`); never edit them by hand.

## The stress benchmark (`pnpm bench`)

`test/bench/stress.perf.ts` runs with its own Vitest config (`test/bench/vitest.config.ts`: only
`*.perf.ts`, one forked worker with `--expose-gc`, verbose) — **not** part of `pnpm test`, since
timing needs a quiet machine. CI runs it after `pnpm build`.

- Scenario: a World on the shipped content in free flight with the full loadout (speed 2,
  Missile, Laser, four Options, all autofiring) in god mode; before every tick a top-up refills
  the enemies to 64 (zone A's flying types — ground enemies need terrain), the enemy bullets to
  512 and keeps four enemy lasers alive. The top-up is timed with the ticks.
- 3,000 warm-up ticks, then 20,000 measured ticks in 100-tick batches. It prints the median, p95
  and max ms per tick, the heap growth and the average load, and fails when the median reaches
  **1.0 ms/tick** (`MEDIAN_BUDGET_MS`) or the retained heap grows by **512 KB** (`HEAP_BUDGET`;
  measured after forced GCs before and after — a negative number just means the warm-up left
  garbage), or when the load is not really maximal (on average below 90 % of the bullet or enemy
  pool).
- Measured at M1-19 on the dev machine: median 0.12 ms/tick, p95 0.18 ms, 510 bullets and 64
  enemies on average. The TV's SoC is much slower than a desktop CPU; the debug overlay's `TICK`
  figure is the on-device number to watch.

## Tizen bundle budgets (`check-bundle.mjs` rule 8)

| Budget | Constant | Limit | At M1-19 |
|---|---|---|---|
| `app.js` gzipped | `APP_JS_GZIP_BUDGET` | 350 KB (launch ≤ 10 s, `shmup_feat.md` §23) | 228.6 KB (773.6 KB raw) |
| Atlas page edge | `ATLAS_PAGE_MAX_SIZE` | 2048 px (and every page must be a readable PNG — `pngSize` reads its IHDR) | one page |
| Whole `dist/` | `DIST_BUDGET` | 8 MB | 812.4 KB |

The OK line prints the sizes against the budgets:
`Tizen bundle OK: app.js 773.6 KB (228.6 KB gzip of 350.0 KB), classic script, ES2018, 5 files
in dist/ (812.4 KB of 8192.0 KB)`. `checkTizenBundle(dir)` also returns `gzipBytes` and
`distBytes`.

## Browser tests of M1-19

`pnpm test:e2e` now builds the **test builds** (`turbo run build:test`), so every spec can read
`window.__shmupDebug`:

- `smoke.spec.ts` — the M1 gameplay smoke on the web build (`vite preview`) and the Tizen `dist/`
  via `file://`: title → OK (past `PRESS OK`, START, then NORMAL in the difficulty menu — M2-01) → hold → then ↑ for 2.5 s each (a
  remote holds one arrow at a time) → `sceneId === 'game'`, the World ticked, the ship alive or
  flying in again → no console errors. Then the tools: F1 shows the overlay and F2 turns god mode
  on (web); on the TV build nothing works until Pause, Ch+, Ch+, Ch+ (dispatched as key codes
  10252 / 427), which unlocks the tools and shows the overlay, and the number keys then act.
- `debug-tools.spec.ts` — web: F4 freezes the World however many frames pass, each F5 runs
  exactly one tick, `game.requestStep(n)` exactly n, F7 and F8 put the camera where
  `jumpToNextCheckpoint` / `skipToBoss` should, F3 / F6 cycle, F4 again runs; Tizen: after the
  unlock, 4 freezes and 5 steps one tick; plus the `frame-advance.ts` helpers themselves.
- `frame-advance.ts` — `freezeSim(page)` turns `flags.frameAdvance` on as soon as
  `__shmupDebug` exists; `stepTo(page, tick)` queues the missing ticks with `game.requestStep`,
  waits for `worldTick` and two frames. Specs that compare two captures a known number of ticks
  apart use them (`stage.spec.ts`: captures at World tick 90 and 30 ticks later, expecting a
  29–31 px shift; `enemies.spec.ts`: 15-tick steps until the drifters show, then 20 ticks) —
  the frame loop runs 1–4 ticks per rAF frame under load, so counting frames was flaky.
- `playwright.config.ts` caps the workers at half the cores, at most 8 (SwiftShader is itself
  multi-threaded; more workers only starve the pages).

## Version 0.1.0 and the M1 release check

The root, every package and app manifest (Electron included) and `apps/tizen/public/config.xml`
say **`0.1.0`**; `apps/tizen/test/config-xml/config-xml-consistency.test.ts` keeps `config.xml`
equal to the Tizen package version and to the root. `CHANGELOG.md` describes the release. The
`v0.1.0` git tag belongs on the step's final commit (after the review, test and docs rounds).
The on-device part — plan §8.4, both monitors, with a `build:dev` widget — is written up for
testers in [../client/debug-tools.md](../client/debug-tools.md#the-m1-release-check).

## Extending it

| To add | Do this |
|---|---|
| A debug switch | A field on `DebugFlags` (+ `createDebugFlags`); if it changes what a tick does, it must be recorded — better make it a `GameConfig` option (like `stageSkip`) so replays carry it |
| A debug command | Append a code to `DebugCommand` and a name to `DEBUG_COMMAND_NAMES` (never renumber — tests and `__shmupDebug.run` use the codes), handle it in `createDebugControls`, and bind a key in `DEBUG_KEYS` (+ a digit and `DEBUG_REMOTE_KEYS` on the TV) if it deserves one. Cold code |
| An overlay figure | Sim numbers: a field on `DebugCounters` filled in `collectDebugCounters` (read-only, no allocation). Host numbers: a field on `DebugOverlayStats` set in the shell's hooks. Then a label in `LABELS` and a `number(...)` / `usage(...)` call in `buildDebugPanel` — mind the 46-column panel; a new colour needs its own list |
| An outline kind | A list in `DebugOutlineLists` / `OUTLINE_KINDS` / `OUTLINE_CAPACITY` (4 rects per box of the pool size) / `OUTLINE_COLORS`, filled in `buildDebugOutlines` through the `scratch` box and `outline()` — never pass fractional coordinates to a call |
| A sim-affecting option | A `GameConfig` field — the replay header records the whole config automatically; re-bless the golden replays if the default changes behaviour |
| Hashed state | Mix it into `hashWorld` in a fixed place (`core/debug`), then re-bless: every golden hash changes |
| A golden scenario | An entry in `GOLDEN_SCENARIOS` (name `zone-…`, short — ≤ 3 min of play, plan §10), then `pnpm golden:update` and commit the new file |
| A budget | An exported constant and a check in `checkTizenBundle` (with a boundary test in `apps/tizen/test/scripts/check-bundle-budgets.test.ts`), or an assertion in `stress.perf.ts` |

## Tests

| Where | Covers |
|---|---|
| `packages/core/test/debug/debug-controls*.test.ts` | Every command, the outline and slow-mo cycles, unknown codes; frame advance / step through `Game.frame` (exact tick counts, the clock ignored, queued steps kept through a pause and dropped when frame advance goes off, `Game.step` unaffected), slow motion (a tick every 2nd / 4th frame, no burst after switching or a resume, time going backwards ignored); determinism under the debug timing (lockstep with a plain session, checkpoint jumps at the same tick); the stage jumps (only while the game scene is on top, during the WARNING but not after the stage ended, score / lives / loadout kept, a dying ship left alone, checkpoint index validation); one set of switches for the game and every World; counters read-only, rehashed exactly every 60 ticks |
| `packages/core/test/debug/debug-alloc.test.ts` | `collectDebugCounters` and slowed / frame-advanced `Game.frame` allocation-free |
| `packages/core/test/replay/replay*.test.ts` | Round trip (record → encode → decode → play reproduces every hash), desync on tampered input, seed or config, the zero-tick replay, header validation, every `decodeReplay` rejection, varint / base64 edge cases, recorder growth past its capacity, missing `check()` calls, checkpoint starts, `assisted`, `buildMatches`, allocation-free `poll` / `check` (`replay-alloc.test.ts`) |
| `packages/render-pixi/test/debug/` | Panel layout and values, the frame graph's colours and ring, every outline kind (positions, clipping, laser squares; ghosts, dying ships and boss parts without a hurtbox skipped), one colour per list, no dropped command with every pool full, `update` hiding what is off, an overlay without an atlas; allocation-free `update` (measured on a second overlay after a throwaway one — V8 hidden-class state made the first one flaky) |
| `packages/render-pixi/test/renderer/renderer-draw-calls.test.ts` | The counter over both passes, every argument forwarded, `-1` without the option or a context to wrap |
| `packages/shell/test/debug/`, `packages/shell/test/boot/boot.test.ts` | Keys (by code or key code, prevented defaults, only the step repeating), the TV sequence (nothing before it, wrong keys, a Pause mid-sequence, exactly the 3-s window, a keyboard Pause, the sequence keys never running a command), the web mode treating remote keys as plain keys, `__shmupDebug` (live values, destroy leaving another tools' global alone), timing hooks (first frame, smoothing, draw calls, particles); boot with a factory (`Shell.debug`, the tools created after boot, `stop()`) |
| `apps/tizen/test/boot/debug-tools.test.ts`, `test/build/tizen-build.test.ts` | Number keys registered once on unlock (and not outside a TV); the release bundle holds no debug code |
| `apps/tizen/test/scripts/check-bundle*.test.ts` | The budgets at their exact boundaries, `pngSize` |
| `test/integration/build-info-plugin.test.ts` | `isDevBuild`, `buildId` (env override, dirty `+`, untracked files ignored, no git), the plugin's defines, both apps' `build` / `build:test` / `build:dev` |
| `test/golden/` | The golden replays (above) |
| `test/e2e/smoke.spec.ts`, `debug-tools.spec.ts` | The browser path (above) |

## Gotchas

| Symptom | Cause / fix |
|---|---|
| `golden.test.ts` fails after a change | The simulation changed. If unintended, find it (the report names the first diverging hash tick — bisect with `hashWorld` around it). If intended: `pnpm golden:update`, review the diff, and put the reason in the commit message |
| A golden file changes although nothing in the sim did | Something non-deterministic entered the tick (a clock, `Math.random`, iteration over a `Map` filled in varying order, an engine-dependent `Math.*`) — see [engine-foundations.md](engine-foundations.md) |
| `golden-edge.test.ts` fails on formatting | The file was edited by hand or reformatted (Prettier ignores the folder — keep it so). Re-run `pnpm golden:update` |
| `replay recorder: N state hash(es) missing` from `finish()` | `recorder.check(world)` was not called after every tick |
| A replay desyncs at its first hash although the input is right | The session was not created from the header — use `createReplayGame` on both sides (god mode, checkpoint start), and pass the same content |
| A recorded run with god mode toggled halfway does not replay | By design: `assisted` means god mode for the whole run |
| F-keys do nothing | A release build (`pnpm build`, `vite preview` of it) — use `pnpm dev` or `build:test`; or the page does not have focus |
| The TV ignores 1–8 | The tools are still locked: enter Pause, Ch+, Ch+, Ch+ within 3 s. On a remote without Play/Pause, a Bluetooth keyboard's Pause key starts the sequence |
| The Tizen dev server (`pnpm --filter @shmup/tizen dev`) in a desktop browser never unlocks | It runs the TV's sequence mode, and a desktop keyboard has no Ch+ (key code 427). Use `pnpm dev` (the web app, F1–F8), or `__shmupDebug.run(n)` in the console |
| `pnpm test:e2e` specs time out waiting for `__shmupDebug` | A release `dist/` is being tested (e.g. `playwright test` run by hand after `pnpm build`) — run `pnpm test:e2e`, which builds `build:test` first |
| The widget packaged after `pnpm test:e2e` has the debug tools | Both tasks write `apps/tizen/dist/`; the last build wins. Run `pnpm --filter @shmup/tizen build` before packaging a release |
| The overlay's `DRAW` is empty | The renderer was created without `countDrawCalls` (the shell sets it only with debug tools) or the context could not be wrapped (`drawCalls` = -1) |
| `pnpm bench` fails only on a busy machine | Timing budget: run it alone (`pnpm bench`, nothing else running). A heap failure is real — something in the tick allocates |
| A stage jump key does nothing | Not on the game scene (title, pause menu, end screens), free flight, or the camera is past the last checkpoint / has no boss event |
| The game is frozen and ignores OK | Frame advance is on (the overlay shows `STEP`) — F4 / 4 again, or F5 / 5 to step |

## Next steps that build on this page

- **M2-01** (done) — the rank formula: the overlay's `RANK` moves during a run; the header's
  config records every difficulty-preset value; golden replays re-blessed; a continue is a
  scene-flow action, so it is not part of a bare-gameplay replay
  ([difficulty-and-rank.md](difficulty-and-rank.md)).
- **M2-02 … M2-14** — every simulation change re-blesses the golden replays in the same commit;
  zones B–I add a golden replay each.
- **M2-06** — replays record both players (the body already has a word per player).
- **M2-15** — attract mode plays bundled replays (and the scene flow gets recorded).
- **M2-17** — the device info (model, firmware) in the debug overlay.
- **M2-18** — cross-engine determinism: golden replays in Chromium and Firefox.
- **M3-01** — replay save / share / browser, fast-forward, assists flagged as `assisted`.
