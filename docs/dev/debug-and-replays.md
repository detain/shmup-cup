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
- **golden replays** of zone A (`test/golden/` — seventeen since M2-06) checked by every `pnpm test`, re-blessed with
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
  stage's first `warning` / `boss` event ([zone-a-and-playtest.md](zone-a-and-playtest.md#the-debug-stage-skip))
  — a captain's `boss` event counts, so in zone H it lands before the parade, not IRON SOVEREIGN.
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
  `unlocked`, `buildId`, `game`, since M2-08 `renderer` (the `PixiRenderer` — its scale mode,
  hitbox markers, interpolation, layer effects and effect settings, for the M2-08 browser specs and
  the console) and `run(command)` (works locked or not — for tests and the remote inspector);
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
| `boss` | orange `#ff9830` | boss parts that have a hurtbox and are not destroyed — since M2-09 of every boss slot (captains, both twins, an inner boss; 64 × 4 rects), a circle part as its bounding square |
| `shots` | cyan `#48e0ff` | player-shot boxes (a laser's box spans its length) |
| `lasers` | pink `#ff90c8` | active enemy lasers as 17 squares along the beam |
| `bullets` | magenta `#ff50ff` | enemy bullet circles |
| `terrain` | yellow `#ffe040` | the ships' terrain boxes |
| `hurt` | green `#50ff50` | the ships' hurt circles (× `shield.hurtScale` — Reduce shows a smaller one, M2-04) |

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
playback path for golden tests, the future cross-engine check (M2-18) and — since M2-15 — the
attract loop's demo play.

**Files (M2-15).** The session-free parts — header, recorder, playback and the file format — live
in `replay/format.ts`, which does not import `core/game`, so `core/scenes` (which `core/game`
imports) can decode and play demos without a cycle; the attract playback is `replay/demo.ts`
(`createDemoPlayback`, `DemoPlayback`, `DEMO_BUILD_ID`); `replay/index.ts` keeps
`createReplayGame` / `playReplay` and re-exports everything — the public API did not move.

**Header** (`createReplayHeader(config, { buildId, checkpoint, assisted })`, frozen):

| Field | Meaning |
|---|---|
| `formatVersion` | `REPLAY_FORMAT_VERSION` (1); another version is rejected |
| `buildId` | the build that recorded it (`__SHMUP_BUILD__`; golden replays: `'golden'`) |
| `seed` | `config.seed`, repeated for readability |
| `config` | the session's **whole resolved `GameConfig`** — every sim-affecting option, so a new `GameConfig` field is recorded without touching the replay code (since M2-01 the difficulty preset's rank base / growth, lives, extends, continues, penalty, aim directions and bullet speed — a replay does not depend on the content's `rules` table; an M1 header without them decodes to its preset's values; since M2-05 the ship — `shipId` — and a `powerUpMode` that may be `'direct'`: a header without `shipId` decodes to `kestrel`, which is what it flew) |
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
  core only reports it. Golden replays use the fixed id `'golden'` and the attract demos
  `DEMO_BUILD_ID` (`'demo'`); both trust their hashes.
- **Attract playback (M2-15).** `createDemoPlayback(replay, content, { events })` builds the World
  a header describes the way `createReplayGame` does (the config re-resolved over the content's
  difficulty table, god mode from `assisted`, the checkpoint) but as a bare World with its **own**
  debug switches and the event queue it is given; `DemoPlayback.step()` plays one tick, hashes
  checked — `running` turns false at the recording's end or the first mismatching hash, so the
  scene flow's `DemoScene` moves on instead of showing a desynced demo
  ([front-end-and-attract.md](front-end-and-attract.md#attract-playback-corereplay)).

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

**Not covered yet.** Replays record **bare-gameplay sessions** (one World) — the attract demos of
M2-15 are such recordings (one zone, no menus). Recording the scene flow (menus, retries, several
Worlds), dev auto-record and replay save / share / fast-forward are later work (M3-01). God mode toggled **mid-run** is not reproducible —
record with it fixed (the header's `assisted`); the debug stage jumps are reproducible only when
the replay contains them (a session recorded through `createReplayGame` has no key handling).

## Golden replays (`test/golden/`)

Fifty-three committed runs — seventeen of zone A, since M2-07 three of the `gimmick-range` dev
stage, since M2-08 one of the `raster-range` dev stage, since M2-09 four of the advanced-boss
dev stages, since M2-10 three of the bonus-stage dev stages, since M2-11 five of the real zones
B and C, since M2-12 five of the real zones D and E, since M2-13 eight of the real zones F and G
and since M2-14 seven of the final zones H and I — pin down what the simulation does (`test/golden/golden.ts` `GOLDEN_SCENARIOS`, recorded
from the M1-18 playtest bots with the build id `'golden'`):

| File | Who plays | Covers | Ends |
|---|---|---|---|
| `zone-a-god.replay.json` | 4-way bot, god mode (seed 1) | the whole stage and HALCYON BULWARK | `stageClear` after 12,637 ticks, 62,880 points, 4 lives (one extend) |
| `zone-a-arcade.replay.json` | 4-way bot, Arcade difficulty (seed 2) | the Arcade preset (rank from 6, 2 lives, the arcade penalty) without god mode | `stageClear` after 12,611 ticks, 64,580 points, 3 lives (one extend) |
| `zone-a-deaths.replay.json` | `weaverBot()` — weaves up / down, never dodges (seed 4) | deaths, Classic respawns, game over | `gameOver` after 5,324 ticks (deaths at 2,125 / 4,457 / 5,231) |
| `zone-a-boss.replay.json` | 4-way bot, `stageSkip: 'boss'`, full loadout, Arcade penalty (seed 3) | the stage skip, the boss with everything | `stageClear` after 908 ticks, 37,180 points |
| `zone-a-type-b.replay.json` (M2-03) | 4-way bot, stage skip, full loadout, `weaponPreset: 'type-b'` (seed 6) | the Ripple Laser's rings and the Spread Bomb's blasts against HALCYON BULWARK | `stageClear` after 1,369 ticks, 37,140 points |
| `zone-a-edit.replay.json` (M2-03) | 4-way bot, stage skip, full loadout, a Weapon Edit (2-Way Missile, Free Way, Twin Laser), LIFE OPTION on `!` (seed 7) | Weapon Edit and a `!` choice | `stageClear` after 765 ticks, 37,060 points |
| `zone-a-type-c.replay.json` (M2-03) | 4-way bot, stage skip, full loadout, Type C, SPEED DOWN on `!` (seed 8) | the Cyclone Laser, 2-Way Missile and Vertical | `stageClear` after 900 ticks, 37,180 points |
| `zone-a-type-d.replay.json` (M2-03) | 4-way bot, stage skip, full loadout, Type D, FULL BARRIER on `!` (seed 9) | the Twin Laser, Photon Torpedo and Free Way | `stageClear` after 763 ticks, 37,060 points |
| `zone-a-rotate.replay.json` (M2-04) | 4-way bot, stage skip, full loadout, `optionChoice: 'rotate'`, `shieldChoice: 'rotateShield'` (seed 10) | orbiting Options and the spinning Rotate Shield pods against the boss | `stageClear` after 1,127 ticks, 37,130 points |
| `zone-a-reduce.replay.json` (M2-04) | 4-way bot, stage skip, full loadout, Formation Options, Reduce (seed 11) | the `>` of Options and the shrunken hurtbox | `stageClear` after 1,058 ticks, 37,130 points |
| `zone-a-snake.replay.json` (M2-04) | 4-way bot, full loadout, Snake Options, the front Shield (seed 12) | the whole stage: the pulled chain, two pods wearing apart, a death | `stageClear` after 11,930 ticks, 69,770 points, 3 lives (death at 5,839) |
| `zone-a-free-shield.replay.json` (M2-04) | 4-way bot, Arcade difficulty, full loadout, the Free Shield (seed 13) | the whole stage at Arcade: a pod pair ahead taking hits, a death | `stageClear` after 14,026 ticks, 66,820 points, 2 lives (death at 5,837) |
| `zone-a-manta.replay.json` (M2-05) | 4-way bot, `shipId: 'manta'`, `powerUpMode: 'direct'` (seed 14) | the whole stage in Direct mode: planned colour items from the carriers, the Arm, a family switch at the octagon | `stageClear` after 11,584 ticks, 59,610 points, 4 lives |
| `zone-a-manta-boss.replay.json` (M2-05) | 4-way bot, the MANTA, stage skip, full loadout (seed 15) | HALCYON BULWARK against level-8 discs and sub discs and the gold Hyper Arm | `stageClear` after 716 ticks, 37,000 points |
| `zone-a-manta-deaths.replay.json` (M2-05) | `weaverBot()`, the MANTA, the Arcade penalty (seed 16) | Direct-mode deaths (the Arm, levels and family lost), checkpoint restarts, game over | `gameOver` after 1,131 ticks (deaths at 236 / 637 / 1,038) |
| `zone-a-coop.replay.json` (M2-06) | two 4-way bots, `coop: true` — player 2's controller presses START at tick 300 (seed 17) | a co-op game: the drop-in join, two ships sharing the capsules, the co-op drop scaling | `stageClear` after 11,607 ticks; player 1 64,210 points, 4 lives; player 2 7,100 points, 3 lives |
| `zone-a-coop-deaths.replay.json` (M2-06) | the 4-way bot and a weaving player 2 from its START at tick 120, `coop: true` (seed 18) | player 2's deaths, its mid-game continues with START (no stage restart) while player 1 plays on | `stageClear` after 12,399 ticks; player 1 61,770 points, 4 lives; player 2 8,002 points (two continues), 2 lives, seven deaths |
| `gimmick-range-god.replay.json` (M2-07) | 4-way bot, god mode, `stage: 'gimmick-range'` (seed 31) | the advanced stage systems: a brick shot open, both moving blocks, the suction pod's pull, the tentacle's chain, the cube rush stacking a cube into the terrain, the hold and both pans, the high branch (the region trigger left alone) | `stageClear` after 2,906 ticks, 460 points |
| `gimmick-range-weaver.replay.json` (M2-07) | `weaverBot()`, god mode (seed 35) | the region trigger fired — the low branch — and a dozen bricks broken | `stageClear` after 2,906 ticks, 760 points |
| `raster-range-god.replay.json` (M2-08) | 4-way bot, god mode, `stage: 'raster-range'` (seed 41) | the raster-effect dev stage to its end; `golden.test.ts` plays it back a second time on the stage with its `raster` / `cycles` stripped and every hash still matches — the effects are presentation only | `stageClear` after 3,630 ticks, 800 points, no deaths |
| `gimmick-range-deaths.replay.json` (M2-07) | `weaverBot()`, the Arcade penalty (seed 33) | deaths on the gimmick range, checkpoint restarts rolling the terrain back | `gameOver` after 1,429 ticks (deaths at 238 / 782 / 1,336) |
| `captain-range-god.replay.json` (M2-09) | 4-way bot, god mode, `stage: 'captain-range'` (seed 51) | the four captains flying in on the scrolling camera (only captains ever take a slot), the ram shot down; the stage runs to its `end` | `stageClear` after 6,415 ticks, 25,120 points, no deaths |
| `raid-range-god.replay.json` (M2-09) | 4-way bot, god mode, full loadout, `stage: 'raid-range'` (seed 52) | IRON LEVIATHAN: the WARNING, the raid's boss-relative camera path, its death and the camera's return, LEVIATHAN HEART revealed by the blast (slot 1) and shot down, the camera handed back | `stageClear` after 3,591 ticks, 76,450 points, no deaths |
| `raid-range-escape.replay.json` (M2-09) | 4-way bot, god mode, no power-ups (seed 52) | the boss timer: the battleship outlasts the bot and escapes after 5,400 fight ticks — `escaped`, `EndingFlag.BossEscaped`, no heart | `stageClear` after 6,325 ticks, 1,800 points, no boss killed |
| `twin-range-god.replay.json` (M2-09) | 4-way bot, god mode, full loadout, `stage: 'twin-range'` (seed 53) | the EMBER and FROST twins taking turns, one down and the survivor enraged, both shot down | `stageClear` after 3,758 ticks, 36,650 points, no deaths |
| `bonus-range-god.replay.json` (M2-10) | 4-way bot, god mode, full loadout, `stage: 'bonus-range'` (seed 62) | the `ground` bonus entrance: the window's three turrets shot down, the entry recorded while the World plays on to the boss (the warp is the scene flow's) | `stageClear` after 3,257 ticks, 38,580 points, no deaths |
| `bonus-range-digit.replay.json` (M2-10) | 4-way bot, god mode, no power-ups (seed 61) | the `digit` bonus entrance: the turrets survive, the thousands digit is 0 when the last window closes | `stageClear` after 4,367 ticks, 37,620 points, no deaths |
| `bonus-vault-god.replay.json` (M2-10) | 4-way bot, god mode, full loadout, `stage: 'bonus-vault'` (seed 65) | the bonus stage: the carriers' 1,000-point bonus capsules and the 1UP collected (5 lives: the 1UP and one extend), no boss | `stageClear` after 1,615 ticks, 21,210 points, no deaths |
| `zone-b-god.replay.json` (M2-11) | 4-way bot, god mode, `stage: 'zone-b'` (seed 1) | BRINE NEBULA start to clear: the bubbles, the reef tunnel, SPUME HERALD, the riptide, GALVANIC MAW's three phases | `stageClear` after 13,538 ticks, 70,480 points, no deaths |
| `zone-c-god.replay.json` (M2-11) | 4-way bot, god mode, `stage: 'zone-c'` (seed 1) | DUNE EXPANSE start to clear: the sand worms, the ceiling walkers, the sandstorm run, SANDGRAVE WIDOW's three phases | `stageClear` after 14,565 ticks, 55,020 points, no deaths |
| `brine-grotto-god.replay.json` (M2-11) | 4-way bot, god mode, full loadout, `stage: 'brine-grotto'` (seed 71) | PEARL GROTTO, zone B's bonus stage: its carriers' bonus capsules and the 1UP, no boss | `stageClear` after 1,815 ticks, 10,400 points, no deaths |
| `zone-b-deaths.replay.json` (M2-11 tests) | `weaverBot()`, Arcade penalty (seed 72) | deaths among the bubbles, checkpoint restarts, game over | `gameOver` after 4,412 ticks (deaths at 2,718 / 3,382 / 4,319) |
| `zone-c-bot.replay.json` (M2-11 tests) | 4-way bot, no god mode (seed 73) | a death and a Classic respawn in place, SANDGRAVE WIDOW shot down | `stageClear` after 14,783 ticks, 57,340 points, one death (4,565) |
| `zone-d-god.replay.json` (M2-12) | 4-way bot, god mode, `stage: 'zone-d'` (seed 1) | MAGMA DEEP start to clear: the erupting caldera fields, the dive into the caves, the brick maze, the lava river, CINDER BASTION's three phases | `stageClear` after 13,698 ticks, 54,000 points, no deaths |
| `zone-e-god.replay.json` (M2-12) | 4-way bot, god mode, `stage: 'zone-e'` (seed 1) | TEMPEST RIDGE start to clear: kites and jumpers from behind, the thunderheads, the gale run, SQUALL STEED's three phases | `stageClear` after 14,736 ticks, 54,590 points, no deaths |
| `zone-d-bot.replay.json` (M2-12 tests) | 4-way bot, no god mode (seed 77) | a death down in the caves and a Classic respawn in place there, CINDER BASTION shot down | `stageClear` after 14,634 ticks, 55,330 points, one death (9,564) |
| `zone-d-boss.replay.json` (M2-12 tests) | 4-way bot, full loadout, Arcade penalty, `stageSkip: 'boss'` (seed 75) | the stage skip into the caves: CINDER BASTION's core shot through the turning arms | `stageClear` after 1,301 ticks, 40,200 points, no deaths |
| `zone-e-bot.replay.json` (M2-12 tests) | 4-way bot, no god mode (seed 74) | the rear attackers against a ship that can die, a death and a Classic respawn in place, SQUALL STEED shot down | `stageClear` after 14,427 ticks, 56,040 points, one death (8,961) |
| `zone-f-god.replay.json` (M2-13) | 4-way bot, god mode, `stage: 'zone-f'` (seed 1) | CELL VAULT start to clear: the membrane's chasing and dividing cells, the regenerating tissue walls, the tentacle garden, the pulse run, MANTLE REGENT's three phases | `stageClear` after 13,190 ticks, 65,260 points, no deaths |
| `zone-g-god.replay.json` (M2-13; re-blessed by its review fix) | 4-way bot, god mode, `stage: 'zone-g'` (seed 1) | PRISM LABYRINTH start to clear: the prism field, the gallery, the crystal labyrinth, the cube rush stacking into its pillars, the refraction run, FACET MONARCH | `stageClear` after 14,043 ticks, 54,060 points, no deaths |
| `glimmer-cache-god.replay.json` (M2-13) | 4-way bot, god mode, full loadout, `stage: 'glimmer-cache'` (seed 81) | GLIMMER CACHE, zone G's bonus stage: its carriers' bonus capsules and the 1UP, a cube rush and its cube walls, no boss | `stageClear` after 1,815 ticks, 16,210 points, no deaths |
| `zone-f-arcade.replay.json` (M2-13 tests) | 4-way bot, Arcade difficulty, no god mode (seed 91) | CELL VAULT against the rank-scaled fire, tissue shot open, MANTLE REGENT shot down | `stageClear` after 13,316 ticks, 60,130 points, no deaths |
| `zone-f-deaths.replay.json` (M2-13 tests) | `weaverBot()`, Easy, Arcade penalty (seed 91) | deaths in the membrane and at the first tissue walls, restarts at the start and at 2,200 rolling the shot-open tissue back, game over | `gameOver` after 7,274 ticks (deaths at 1,411 / 4,204 / 5,189 / 6,173 / 7,181) |
| `zone-f-boss.replay.json` (M2-13 tests) | 4-way bot, full loadout, Arcade penalty, `stageSkip: 'boss'` (seed 95) | MANTLE REGENT's three phases, the eye shot between the curls of its tentacles | `stageClear` after 1,716 ticks, 46,300 points, no deaths |
| `zone-g-boss.replay.json` (M2-13 tests) | 4-way bot, full loadout, Arcade penalty, `stageSkip: 'boss'` (seed 95) | FACET MONARCH's crystals broken, then its core through three phases | `stageClear` after 2,003 ticks, 47,390 points, no deaths |
| `zone-g-bot.replay.json` (M2-13 tests) | 4-way bot, no god mode (seed 91) | a death in the cube rush and a Classic respawn in place, FACET MONARCH shot down | `stageClear` after 14,138 ticks, 56,070 points, one death (7,284) |
| `zone-h-god.replay.json` (M2-14) | 4-way bot, god mode, `stage: 'zone-h'` (seed 1) | IRON CITADEL start to clear: the outer walls' hatches, the piston hall's moving floors and laser emitters, the parade of four earlier bosses in reduced form, the core run, IRON SOVEREIGN's four phases | `stageClear` after 15,174 ticks, 128,200 points, no deaths |
| `zone-i-god.replay.json` (M2-14; re-blessed by its test round's `boss.ark` fix) | 4-way bot, god mode, `stage: 'zone-i'` (seed 1) | ABYSSAL THRONE start to clear: the descent, the trench's eels, the mine field, the undertow, the ABYSS ARK raid and THE HOLLOW KING its final blast reveals | `stageClear` after 16,146 ticks, 145,550 points, no deaths |
| `zone-h-boss.replay.json` (M2-14 tests) | 4-way bot, full loadout, Arcade penalty, `stageSkip: 'boss'` (seed 95) | the skip lands before the parade: the four echoes shot down before their time limits (no ending flag), the core run, IRON SOVEREIGN's four phases | `stageClear` after 9,289 ticks, 123,460 points, no deaths |
| `zone-h-arcade.replay.json` (M2-14 tests) | 4-way bot, Arcade difficulty, no god mode (seed 91) | IRON CITADEL against the rank-scaled fire | `stageClear` after 15,996 ticks, 126,920 points, no deaths |
| `zone-h-deaths.replay.json` (M2-14 tests) | `weaverBot()`, Easy, Arcade penalty (seed 91) | deaths at the outer walls, every restart back at the start, game over | `gameOver` after 5,575 ticks (deaths at 1,034 / 2,122 / 3,267 / 4,394 / 5,482) |
| `zone-i-boss.replay.json` (M2-14 tests) | 4-way bot, full loadout, Arcade penalty, `stageSkip: 'boss'` (seed 95) | the raid's two phases, then THE HOLLOW KING's three | `stageClear` after 5,031 ticks, 140,150 points, no deaths |
| `zone-i-escape.replay.json` (M2-14 tests) | `weaverBot()`, god mode, no power-ups, `stageSkip: 'boss'` (seed 52) | the ARK outlasts the pilot for its whole 90-s time limit and escapes — `EndingFlag.BossEscaped` (the campaign's THE FLAGSHIP SLIPS AWAY), no king, the camera handed back | `stageClear` after 6,038 ticks, 4,200 points, the boss not defeated |

The 4-way bot survives zone A even at Arcade, which is why the death scenario uses a careless
weaving pilot. The files were re-blessed on purpose by M2-01 (`b31fac5`): rank growth changes
fire rates and bullet speeds as the bot powers up, extends add a life at 20,000 points, and the
Arcade preset now also means 2 lives and the arcade penalty — every scenario kept its outcome.
M2-02 re-blessed them again (`3f69cf1`): the bullet pool's new fields (`runner`, `accelTerm`,
`termSpeed`, `turnTerm`, `termAngle`) and the new `cancelPoints` pool change every hash, and the
bullets HALCYON BULWARK's death cancels now score as point items (+130 points in the two
full-stage clears, +180 in the boss run); the outcomes are unchanged, and zone A runs no DSL
pattern, so the later M2-02 fixes left the files untouched. M2-03 re-blessed the four again
(`06e47aa`): the Types B–D content shifts sprite ids and enemy spec indices, and each player's
Free Way direction joined the hash — the outcomes are unchanged — and added `zone-a-type-b` and
`zone-a-edit`; its test round added `zone-a-type-c` and `zone-a-type-d` (`1bc676e`, the older six
files byte-identical), so every Types B–D weapon flies in a golden run
([meter-arsenal.md](meter-arsenal.md#determinism-hashing-and-golden-replays)). M2-04 re-blessed the
eight again (`1434577`): the option groups' type, spread, toggle, hold, orbit angle and Snake
links, the shields' hurt scale and pods and each enemy's `carried` joined the hash, and the new
`option-hunters.enemies.json` shifts zone A's enemy spec indices — every outcome unchanged — and
added `zone-a-rotate` and `zone-a-reduce`; its test round added `zone-a-snake` and
`zone-a-free-shield` (`60b1328`, the ten older files byte-identical), so every Option type and
every meter shield flies in a golden run
([options-shields-hunter.md](options-shields-hunter.md#determinism-hashing-and-golden-replays)).
M2-05 re-blessed the twelve again (`f68cead`): the Direct-mode loadout fields (`shot`, `sub`,
`family`), the Arm's `tier` / `charge` and the item plan's `planCursor` joined the hash, and the
new content (sprite ids, enemy spec indices) shifts the rest — every outcome unchanged — and added
`zone-a-manta` and `zone-a-manta-boss`; its test round added `zone-a-manta-deaths` (`0767e27`, the
fourteen older files byte-identical), so both ships and both power-up models fly in golden runs
([direct-mode.md](direct-mode.md#determinism-hashing-and-golden-replays)).
M2-06 re-blessed the fifteen again (`2ebb4a4`): the co-op drop credit (`PowerUpSystem.coopCredit`)
joined the hash and the sprite table's new `@p2` names shift the sprite ids — every outcome
unchanged — and added the two co-op scenarios (`GoldenScenario.p2`: player 2's bot and the tick of
its first START, then START every other tick while it may join; `GoldenOutcome.p2`: player 2's
score, lives, death ticks and continues; `fourWayBot(player)` flies either slot)
([coop.md](coop.md#determinism-hashing-and-golden-replays)).
M2-07 re-blessed the seventeen again (`75470d0`): the stage runner's six new state slots (hold,
diagonal pan, trigger masks) and the stage gimmicks (destructible terrain, moving blocks, pull
fields, chains) joined the hash and the engine sprite `gimmicks/chain-link` shifts the sprite ids
— before re-blessing, the goldens were run against the old hash layout without the new sprite and
all passed, so zone A's simulation is unchanged. Its test round added the three `gimmick-range`
scenarios (`fc0f676`, the seventeen older files byte-identical; the name rule now allows
`gimmick-range-*`), and `playGolden` also returns the session's World, so `golden.test.ts` checks
what each run went through — the branch taken, the trigger fired or not, cells broken, terrain
rollbacks
([advanced-stages.md](advanced-stages.md#determinism-hashing-and-golden-replays)).
M2-08 re-blessed the twenty for the two new content sprites (sorted sprite ids); its test round
added `raster-range-god` (the older files byte-identical; the name rule now allows
`raster-range-*`) and `playGolden(replay, content?)` — `golden.test.ts` plays that run back on the
stage with its `raster` / `cycles` stripped and every hash matches: the effects are presentation
only.
M2-09 re-blessed the twenty-one (`8cdc9eb`): the state-hash layout changed (four boss slots and
their new fields, the part cooldown tables of 64 part slots, the rush state, the ending flags) and
the new content shifts the sorted sprite and script ids — every replay's inputs, tick count and
outcome stayed identical (only `hashes` / `finalHash` changed). Its test round added
`captain-range-god`, `raid-range-god`, `raid-range-escape` and `twin-range-god` (`aba9a05`, the
older files byte-identical; the name rule now allows `captain-range-*`, `raid-range-*`,
`twin-range-*`), and `golden.test.ts` checks what each went through — which slots ran, escaped or
enraged, the ending flags, the camera handed back
([advanced-bosses.md](advanced-bosses.md#determinism-hashing-and-golden-replays)).
M2-10 re-blessed them all (`10b5fea`: the hash covers the bonus entrances and the enemy totals,
two new engine sprites and `bonus.enemies.json` shift ids — inputs and outcomes unchanged); its test
round added `bonus-range-god`, `bonus-range-digit` and `bonus-vault-god` (the name rule now allows
`bonus-range-*` and `bonus-vault-*`), and `golden.test.ts` checks which entrance opened, the ground
kills and the vault's 1UP and capsules.
M2-11 re-blessed them all again (`254491e`: the zone B / C sprites and scripts shift the sorted
sprite and script ids hashed through the pools — inputs, ticks, headers and outcomes unchanged) and
added `zone-b-god`, `zone-c-god` and `brine-grotto-god`; its review fix (`c428e1d`: `boss.maw`'s
jaws placed from their rest offsets) re-blessed only `zone-b-god` — the phase-3 jaw hurtboxes moved
1 px, the run desynced at tick 13,200 and now clears in 13,538 ticks (was 13,523) with 70,480
points (was 70,450) —, and its test round added `zone-b-deaths` and `zone-c-bot` without changing
any other file. `golden.test.ts` checks both zones cleared in 3–6 minutes with their bosses shot
down, the grotto's items, and the deaths and restarts of the two no-god runs
([zones-b-and-c.md](zones-b-and-c.md#determinism-hashing-and-golden-replays)).
M2-12 re-blessed them all again (`022d0b6`: the zone D / E sprites and behaviour scripts shift the
sorted sprite and script ids — all 33 older files kept their inputs, tick counts, headers and
outcomes) and added `zone-d-god` and `zone-e-god`; its test round added `zone-d-bot`,
`zone-d-boss` and `zone-e-bot` without changing any other file. `playGolden` takes an optional
per-tick observer since then (`golden.test.ts` checks that `zone-d-bot`'s death happened down in
the caves — camera y 200 — and its respawn in place there); the file-name rule allows `zone-d-*`
and `zone-e-*` ([zones-d-and-e.md](zones-d-and-e.md#determinism-hashing-and-golden-replays)).
M2-13 re-blessed them all once more (`31f35db`: the zone F / G sprites and behaviour scripts shift
the sorted ids — all 38 older files kept their inputs, tick counts, headers and outcomes) and added
`zone-f-god`, `zone-g-god` and `glimmer-cache-god`; its review fix (`db2e5b0`, the turret before the
prism gallery moved from x 2,000 to 1,830) re-blessed `zone-g-god` alone — the bot's inputs and the
hashes changed, its 14,043 ticks, 54,060 points and `stageClear` did not. The test round added
`zone-f-arcade`, `zone-f-deaths`, `zone-f-boss`, `zone-g-boss` and `zone-g-bot` without changing any
other file; `golden.test.ts` checks both zones cleared in 3–6 minutes, tissue shot open on the way,
the cache's items without a boss, the weaver's restarts rolling the tissue back (at the start, then
at 2,200), `zone-g-bot`'s death between the cube rush's checkpoint and the refraction run's with a
respawn in place, and the skips fighting all three phases; the file-name rule allows `zone-f-*`,
`zone-g-*` and `glimmer-cache-*`
([zones-f-and-g.md](zones-f-and-g.md#determinism-hashing-and-golden-replays)).
M2-14 re-blessed them all once more (`dc6c908`: the zone H / I sprites, the ending UI sprites and the
new behaviour scripts shift the sorted ids, and the hash gained the enemies' `nearRange` and the
bosses' seven spiral-stream fields — all 49 older files kept their inputs, tick counts, headers and
outcomes) and added `zone-h-god` and `zone-i-god`; its test round (`9061af0`) added `zone-h-boss`,
`zone-h-arcade`, `zone-h-deaths`, `zone-i-boss` and `zone-i-escape` and re-blessed `zone-i-god` for
its `boss.ark` fix (the ARK's second phase casts its hooks from other turrets: 16,146 ticks instead
of 16,256, still no death) — every other file byte-identical. `golden.test.ts` checks both zones
cleared in 3–6 minutes, IRON SOVEREIGN dead in its last phase, the king dead and no ending flag,
zone H's skip landing between the hangar's checkpoint and BULWARK ECHO with all four echoes shot
down, the weaver's deaths all before 2,200 with every restart back at the start, and the escape's
flag with no king; the file-name rule allows `zone-h-*` and `zone-i-*`
([zones-h-and-i.md](zones-h-and-i.md#determinism-hashing-and-golden-replays)).
Each file is an encoded replay plus the scenario's `description` and its
`expected` outcome (status, ticks, player 1's score and lives, death ticks, boss killed — and for
a co-op run player 2's score, lives, death ticks and continues).

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
- **The attract demos (M2-15)** are recorded and locked the same way: `test/golden/demos.ts`
  (`DEMO_SCENARIOS` — nine zones, the 4-way bot with god mode, 2,400 ticks each) writes
  `content/demos/<id>.replay.json` (bundled content, kind `replay`), `demos.test.ts` plays each back
  through `createDemoPlayback` and `playReplay` with every hash, and `pnpm golden:update` re-records
  them with the goldens — so a simulation change re-blesses both in one commit
  ([front-end-and-attract.md](front-end-and-attract.md#demos-are-content-contentdemos-kind-replay)).

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
| `app.js` gzipped | `APP_JS_GZIP_BUDGET` | 350 KB (launch ≤ 10 s, `shmup_feat.md` §23) | 228.6 KB (773.6 KB raw); **307.5 KB after M2-11**, **313.5 KB after M2-12**, **320.3 KB after M2-13** (the inlined content grows with every zone — ≈ 6 KB a pair), **331.5 KB after M2-14**, **343.8 KB after M2-15** (~9 KB of front-end scene code, ~3 KB of demos) |
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
  via `file://`: title → OK (past `PRESS OK`, START, NORMAL in the difficulty menu — M2-01 — and START in the weapon select — M2-03) → hold → then ↑ for 2.5 s each (a
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
- `playwright.config.ts` runs every test in parallel (`fullyParallel`) on one browser per five
  cores, at least two (`E2E_WORKERS` overrides): SwiftShader is itself multi-threaded, and more
  browsers starve the frame-paced pages — see
  [build-test-deploy.md](build-test-deploy.md#test-concurrency).

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
- **M2-02** (done) — golden replays re-blessed (new bullet pool fields, the `cancelPoints` pool,
  cancel points); `hashWorld` mixes the bending lasers and the pattern runners. The overlay does
  not outline bending lasers or count bullet programs yet ([pattern-dsl.md](pattern-dsl.md)).
- **M2-03** (done) — the replay header records `weaponPreset`, `weaponEdit`, `megaChoice` and
  `shieldChoice` (no format change: a header without them decodes to the defaults); golden
  replays re-blessed, four arsenal scenarios added ([meter-arsenal.md](meter-arsenal.md)).
- **M2-04** (done) — the replay header records `optionChoice` (no format change: a header
  without it decodes to `trail`); golden replays re-blessed, four Option / shield scenarios
  added; the overlay's hurt outline follows Reduce ([options-shields-hunter.md](options-shields-hunter.md)).
- **M2-05** (done) — the replay header records `shipId` and the accepted `powerUpMode: 'direct'`
  (no format change: a header without `shipId` decodes to `kestrel`); golden replays re-blessed,
  three MANTA scenarios added ([direct-mode.md](direct-mode.md)).
- **M2-06** (done) — the replay header records `coop` / `coopExtra` (no format change: a header
  without them decodes to a one-player game); a co-op replay records both players' input — a join
  or a mid-game continue is plain input; golden replays re-blessed, two co-op scenarios added
  ([coop.md](coop.md)).
- **M2-07** (done) — `hashWorld` mixes the stage gimmicks and the runner's new slots; golden
  replays re-blessed, three `gimmick-range` scenarios added ([advanced-stages.md](advanced-stages.md)).
- **M2-08** (done) — `window.__shmupDebug.renderer`; golden replays re-blessed for two new
  content sprites, `raster-range-god` added and proven presentation-only
  ([presentation-polish.md](presentation-polish.md#determinism-hashing-and-golden-replays)).
- **M2-09** (done) — `hashWorld` mixes every boss slot, the raid camera, the boss rush and the
  World's ending flags; the debug outlines cover every boss slot; golden replays re-blessed, four
  advanced-boss scenarios added ([advanced-bosses.md](advanced-bosses.md)).
- **M2-10** / **M2-11** / **M2-12** / **M2-13** (done) — the bonus-stage and zone B–G goldens
  (above); every simulation change re-blessed the files in the same commit.
- **M2-14** (done) — seven goldens of the final zones H and I (`zone-h-god`, `-boss`, `-arcade`,
  `-deaths`, `zone-i-god`, `-boss`, `-escape`); the hash gained the enemies' `nearRange` and the
  bosses' spiral fields, and every file was re-blessed in the same commit
  ([zones-h-and-i.md](zones-h-and-i.md#determinism-hashing-and-golden-replays)).
- **M2-15** (done) — attract mode plays bundled replays: nine bot demos in `content/demos/`,
  `createDemoPlayback` / `DemoPlayback` on the ordinary playback path, `replay/format.ts` split
  out, the demos re-recorded by `pnpm golden:update` and locked by `test/golden/demos.test.ts`
  ([front-end-and-attract.md](front-end-and-attract.md)). The scene flow itself is still not
  recorded (M3-01).
- **M2-17** — the device info (model, firmware) in the debug overlay.
- **M2-18** — cross-engine determinism: golden replays in Chromium and Firefox.
- **M3-01** — replay save / share / browser, fast-forward, assists flagged as `assisted`.
