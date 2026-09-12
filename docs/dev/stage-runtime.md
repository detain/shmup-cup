# The stage runtime: camera path, timeline, checkpoints, terrain, parallax

How a scrolling stage runs inside `@shmup/core`: the stage file and what the loader makes of
it, the **stage runner** that moves the camera and fires the event timeline, invisible
**checkpoints**, the **tile terrain** the ship collides with, the **parallax** bands, and how
the World, the renderer and the web app use all of it. Built in plan step **M1-07**.

This page is the *how and why*. Exact signatures are in
[api-reference.md](api-reference.md#stage--stage-runtime); the TSDoc in
`packages/core/src/{stage,collision,data}/` is the authoritative reference. The stage *format*
for authors lives next to the data: [`content/stages/README.md`](../../content/stages/README.md)
and [`content/tilesets/README.md`](../../content/tilesets/README.md). The World the runner
plugs into is [sim-world.md](sim-world.md); how views reach the screen is
[rendering-and-shell.md](rendering-and-shell.md).

Background: `shmup_feat.md` §14 (scroll-driven timeline, scripted camera path, tilemap
terrain, parallax), §10 (invisible checkpoints), §22 (stage runtime, tilemap collider,
parallax manager, determinism); plan §3.2 (tick phase 3), §3.4 (render contract) and
decisions **D20** (384×200 playfield) and **D26** (world-space coordinates).

## The picture at a glance

```text
content/stages/test-range.stage.json ─┐
content/tilesets/terrain-a.tileset.json┴─ loadContent()                       core/data (load time)
                                           ├─ schema + stage checks (sorted, in range), flag ids
                                           ├─ tileset lookup tables (type, anchor, mask, frame)
                                           └─ pass 3: expandTilemap → StageSpec.terrain (Uint8Array)

createWorld({ stage: 'test-range' }, db)                                      core/world
 ├─ createStageTerrain(stage, db)  → world.terrain   TerrainMap (private copy of the tiles)
 ├─ createParallaxView(stage)      → world.parallax  StageParallaxView (typed arrays)
 ├─ createTerrainView(...)         → view.terrain    TerrainView (live tiles + frames)
 └─ createStageRunner(stage, worldHooks, camera) → world.stage; queue the stage theme

stepWorld, every tick
 ├─ 3 stage      runner.tick(): keys → ramp / pan → move camera → fire events → checkpoint
 │                 hooks.event: spawn / formation → world.enemies, music → SimEventKind.Music,
 │                 warning / boss → world.bosses (M1-13), end → status 'stageClear'
 ├─ 6 collision  terrainRectHit(terrain, ship's terrain box) → playerHit(Terrain)
 └─ 9 fx         updateParallaxView(parallax, camera.x, camera.y)

renderer.render(frame)                                                        render-pixi/layers
 ├─ parallax.sync(view)           one container offset per band
 └─ terrain.sync(view, camera)    49 × 26 sprite ring, one column re-textured per tile crossed
```

## Stage data and loading

A stage file (`content/stages/<id>.stage.json`, kind `stage`, format 1) holds `id`, `name`,
`music: { stage, boss }` (`MUSIC_CUES` names), `length` (camera-x length in pixels), `camera`
(keys), `checkpoints`, `parallax` (bands), `tilemap` (or `null` for open space) and `events`.
The annotated format is in [`content/stages/README.md`](../../content/stages/README.md).

`loadContent()` does three things beyond the schema (see
[content-data.md](content-data.md#what-loadcontent-does) for the general passes):

1. **Stage checks at collect time** (`checkStage`): the first camera key is at `x` 0; keys and
   checkpoints are *strictly* increasing, events *non-decreasing* (ties fire in file order);
   nothing lies past `length`; `yTicks` needs `yTo`; heightfield segments have `to > from`;
   at most `MAX_STAGE_FLAGS` (32) distinct flags. Every problem of one file is reported in one
   load; a stage with any of them is skipped.
2. **Flag numbering.** The distinct `flag` names of a stage are sorted into
   `stage.flagNames`; each `flag` event gets `flagId` = its index = its bit in the runner's
   32-bit `flags`. Flag bits are per stage and change when a name is added — never persist
   them.
3. **Terrain expansion (third pass).** Once tileset ids are resolved, every stage with a
   tilemap gets `stage.terrain = { tileSize, cols, rows, tiles, tilesetId }`: a row-major
   `Uint8Array` of tile ids (0 = empty), `cols = ceil((length + 384) / 8)` (the camera's right
   edge reaches `length + PLAYFIELD_W`), `rows = rowsTall` (25 = the 200-px playfield).

### Tilesets (`content/tilesets/`, kind `tileset`)

One tileset per file: `id`, `sprite` (the atlas sprite whose frames draw the tiles),
`tileSize` (fixed at `TILE_SIZE` = 8 in M1) and up to 255 `tiles`. **Tile id = position in
`tiles` + 1**; id 0 is the empty cell. Each tile has a unique `name`, a `type` (`solid`,
`hazard`, or `empty` = drawn but never colliding), the `frame` of the sprite that draws it, an
`anchor` (`floor` = heights grow up from the bottom edge, `ceiling` = down from the top edge)
and a `mask` of 8 column heights (0 … 8). At load, `buildTilesetTables` turns them into
per-id typed arrays — `type` (`TerrainType` code), `anchor` (`TerrainAnchor` code), `mask`
(`[id * tileSize + column]`), `frame` (`-1` for id 0) and `byName` — which the queries and the
renderer read.

`terrain-a.tileset.json` mirrors the 17 tiles the asset pipeline draws for `tiles/terrain-a`
(solid, floor, ceiling, two walls, 45° and 22.5° slopes for both anchors);
`test/integration/stage-terrain.test.ts` compares every mask with the opaque pixels of its
atlas frame, so art and collision cannot drift apart.

### The heightfield generator

`tilemap.generator = { type: 'heightfield', segments: [...] }` builds terrain at load
instead of committing giant arrays (`core/data/tilemap.ts`, `expandTilemap`). Each segment
covers world x `[from, to)` and has a `floor` and / or `ceiling` profile
`{ base, amp, period, seed }`:

- target height at x = `base + amp · (0.7·sin θ + 0.3·sin(2θ + φ₂))`, θ = `x · 1024 / period +
  φ₁` — binary angles on the committed sine table, phases drawn from `createRng(seed)`;
- sampled at every tile boundary and quantised to half tiles; neighbouring boundaries differ
  by at most one tile (45°), and a half-tile height is always left by a half-tile step (the
  22.5° `-low` / `-high` pairs); the profile ramps up from 0 at `from` and back to 0 by `to`;
- every cell gets the tile named `solid` when buried, `floor` / `ceiling` when flat with open
  space beyond its surface, and otherwise the solid tile whose anchor + mask match the
  generated column heights. A missing named tile skips the generator with an issue; a missing
  slope mask is an issue and the cell falls back to `solid`;
- where a floor and a ceiling overlap, the floor wins.

Only IEEE `+ − × ÷`, `Math.round` / `floor` and the sine table are used, so the map is
bit-identical on every engine: `test/integration/stage-runtime.test.ts` pins the FNV-1a
fingerprint of `test-range`'s grid (re-pin it only on purpose — a change means the generator
or the stage file changed).

### RLE rows

`tilemap.rle` is the import path (for future Tiled / LDtk exports): exactly `rowsTall`
strings, top to bottom, of comma-separated `<id>` or `<count>*<id>` tokens (spaces ignored),
e.g. `"40*0, 3*2, 1"`. A row may be shorter than the map, never longer. Rows are applied
**after** the generator and overwrite it where they are non-zero, so a stage can combine
both. An unknown tile id, a bad token, a too-long row or a wrong row count is an issue, and
the whole terrain of that stage is dropped (`terrain: null`).

## The stage runner (`core/stage`)

`createStageRunner(stage, hooks, camera?)` returns a `StageRunner` at the stage start: camera
at (0, 0), speed 0 — the first key applies on the first tick, with its ramp. The World passes
its own camera; standalone callers get `createStageCamera()`.

```ts
import { StageEventCode, createStageRunner } from '@shmup/core';

const stage = db.stages[db.stageIndex.get('test-range')!];
const runner = createStageRunner(stage, {
  event(code, event, index) {
    if (code === StageEventCode.Music) playMusic((event as StageMusicEvent).cueId);
  },
  clear() {
    /* remove enemies, bullets, items */
  },
});
for (let i = 0; i < 600; i++) runner.tick(); // ten seconds
runner.camera.x; // how far the stage scrolled
runner.restartAt(runner.checkpoint); // back to the last checkpoint passed
```

### One tick

`tick()` runs five steps, always in this order:

1. **Keys.** Apply every camera key the camera has reached (`key.x ≤ camera.x`).
2. **Ramp and pan.** Advance the speed ramp (linear, exact at its last tick) and the vertical
   pan (eased with `EASINGS.inOutQuad`).
3. **Move.** `dx = speed` (0 while locked), clamped so the camera stops exactly at the first
   pending lock key — even when other, non-lock keys lie before it within this tick's movement
   — and never passes `length`. `camera.dx` / `vx` = `dx`, `camera.dy` / `vy` = the pan step.
4. **Events.** Fire, in order, every event with `x ≤ camera.x`, exactly once; the runner
   applies its own part (`speed`, `flag`, `end`) and then calls `hooks.event(code, event,
   index)`. Several events may fire on one tick.
5. **Checkpoint.** Remember the last checkpoint passed (`runner.checkpoint`).

Consequences worth knowing:

- An **event fires on the tick the camera reaches its x; a key applies one tick later** (step
  1 of the next tick). So a key and a `speed` event at the same x — or crossed in the same
  tick — leave the **key's** speed. The one exception is x 0: the camera starts there, so the
  first tick applies the key at 0 and then fires the events at 0, and a `speed` event at 0
  overrides the first key.
- A `speed` event's new target takes effect from the next tick's movement (step 4 runs after
  step 3).
- The ship rides the camera one tick late (the players phase runs before the stage phase —
  [sim-world.md](sim-world.md#the-camera)).

### The camera path

| Key field | Effect when the key applies |
|---|---|
| `speed` | New target scroll speed in px/tick (0 = scroll stop, up to 16) |
| `ramp` | Reach `speed` linearly over this many ticks from the current speed (0 / absent = at once) |
| `yTo`, `yTicks` | Vertical pan: the camera's top edge moves to world y `yTo` over `yTicks` ticks, eased (0 / absent = in one tick) |
| `lock: true` | Scroll lock: the camera has already stopped exactly at the key's x; it stays until `runner.unlock()`, then scrolls on at the current speed (the key's ramp and pan keep running while it waits) |

`speed` events (`{ type: 'speed', speed, ramp? }`) change the target between keys — scripted
and high-speed sections. `unlock()` before the camera reaches a lock key does nothing (the key
locks when it applies). The camera never scrolls past `length`; the stage keeps ticking there.

### The brake (M1-13)

A lock key stops the camera at a fixed x. The boss WARNING needs to stop it **wherever it is**:
`runner.brake(ticks)` (`core/bosses` calls it with `WARNING_BRAKE_TICKS` = 60 when a `warning`
event fires — [bosses-and-warning.md](bosses-and-warning.md#the-brake)):

- the speed ramps **linearly to 0** over `ticks` ticks (a fractional ramp is floored; `ticks ≤
  0` stops and locks at once); once the speed is 0 the camera is **locked** (`runner.locked`) —
  from a standstill it locks on the next tick;
- while braking or locked by the brake, camera keys and `speed` events the camera still reaches
  keep their pans and lock keys but only **record their speed** (`StageSlot.ResumeSpeed`, which
  starts as the target speed at the brake) instead of changing the target;
- `unlock()` releases the lock **and** the brake: the speed ramps back up over the brake's ramp
  to the recorded speed — also when it is called before the camera stopped (from the current
  speed); a lock key met while braking is released by the same call;
- a second `brake()` while one holds changes nothing; `restartAt()` forgets the brake (the state
  is re-derived from the stage data).

The brake's state is three appended slots (`Braking`, `ResumeSpeed`, `BrakeRamp`), so it is
hashed and replayed like the rest of the runner.

### The event timeline

Events are pre-sorted by `x` (the loader checks it) and consumed through a cursor
(`runner.eventCursor`), so each tick looks at the next event only. The runner hands **every**
event to its hooks as a numeric `StageEventCode` (`Spawn 0, Formation 1, Warning 2, Boss 3,
Music 4, Speed 5, Flag 6, End 7` — the `STAGE_EVENT_TYPES` order) plus the content object and
its index:

| `type` | Runner's own part | The World's hook today |
|---|---|---|
| `spawn`, `formation` | — | `world.enemies.onStageEvent(index)`: one enemy at the view point (`screenX`, `y`), or a formation whose members spawn every `interval` ticks (M1-08 — [enemies-and-behaviors.md](enemies-and-behaviors.md#spawning)) |
| `warning`, `boss` | — | `world.bosses.startWarning(enemyId)` / `startBoss(enemyId)` (M1-13): the WARNING — which brakes the camera to a lock with `runner.brake(60)` — then the boss / the boss at once; the boss's death calls `unlock()` ([bosses-and-warning.md](bosses-and-warning.md)) |
| `music` | — | pushes `SimEventKind.Music` with the cue id |
| `speed` | new target speed / ramp | — |
| `flag` | sets / clears bit `flagId` of `runner.flags` (`value` defaults to `true`) | — |
| `end` | `runner.ended = true` | `world.status = 'stageClear'` |

The World also queues the stage theme (`stage.music.stageId`) as a `Music` event when it is
created. A hook may call `restartAt()`: the current tick's event loop stops there.

### Checkpoints

`checkpoints: [{ x }]` are invisible restart points (shmup_feat.md §10). `runner.checkpoint`
is the index of the last one the camera passed (`-1` before the first). `restartAt(index)`
(`-1` = the stage start) is what the `arcade` death penalty uses (M1-12: the World calls
`restartAt(runner.checkpoint)` when the ship respawns, after its explosion and dead time — see
[death-and-scoring.md](death-and-scoring.md#the-arcade-restart)) and continues will use (M2-01):

1. camera x = the checkpoint's x, y = the last pan target before it (pans settled), all
   movement zeroed;
2. speed and flags **re-derived from the stage data**, not from the run: keys and events
   before the checkpoint are replayed in live order (event before key at the same x — except
   the key at 0 before the events at 0), with ramps settled at once; a lock before the
   checkpoint does not re-lock;
3. the events at exactly the checkpoint's x get their runner part applied as live play did on
   arriving (a speed ramp starts, flags and `end` apply) and **re-fire on the next tick for the
   hooks only** (`StageSlot.Replay` marks them) — so spawns at the checkpoint come back;
   keys at that x apply on the next tick, as live play applied them the tick after arriving;
4. the event cursor is found by binary search (`findEventCursor`), then `hooks.clear()` runs
   (the World's `clearSession`: every pool, every enemy and formation, the boss and its WARNING
   (M1-13), the weapons', power-ups' and scoring system's per-session state — scores, lives,
   loadouts and meters stay). A brake is forgotten with the rest of the state.

The result depends only on the stage and the index, so a restart matches what live play had
at the checkpoint — `stage-edge.test.ts` checks it on 60 random stages. One approximation
remains: a key and a `speed` event less than one tick's movement apart (key first) are
replayed key → event, while live play may have crossed both in one tick (event → key). Keep
such pairs further apart than the scroll speed, or at the same x.

**`jumpTo(x)`** (M1-18) is the same restart at any scroll x in `[0, stage.length]` (else a
`RangeError`): steps 1–4 above with `x` in place of the checkpoint's x, and `checkpoint` becomes
the last one at or before `x` (−1 when none). `jumpTo(checkpoints[i].x)` leaves the runner exactly
as `restartAt(i)`; without a checkpoint at 0, `jumpTo(0)` equals `restartAt(-1)`. It is the debug
stage skip's primitive — `core/debug` `skipToBoss` jumps to 96 px before the first `warning` /
`boss` event when `GameConfig.stageSkip` is `'boss'`
([zone-a-and-playtest.md](zone-a-and-playtest.md#the-debug-stage-skip)) and the M1-19 debug
controls' "skip to boss"; their "jump to the next checkpoint" (`jumpToCheckpoint` /
`jumpToNextCheckpoint`) and a replay's checkpoint start use `restartAt`. Like a restart, it may be
called from a hook.

### Runner state and zero allocation

All numeric state lives in one `Float64Array`, `runner.state`, indexed by `StageSlot`
(`Speed, Target, RampFrom, RampTicks, RampElapsed, PanFrom, PanTo, PanTicks, PanElapsed,
Locked, Cursor, NextKey, NextCheckpoint, Checkpoint, Flags, Ended, Ticks, Restarts, Replay`, and
since M1-13 `Braking, ResumeSpeed, BrakeRamp` — `STAGE_STATE_SLOTS` = 22). `hashWorld` hashes the whole array, so every piece of runner state
is covered by lockstep and replay tests. At creation the keys, events (types resolved to codes)
and checkpoints are compiled into typed arrays (`keyX`, `keySpeed`, …, `keyNextLock` — the
first lock key at or after each key), so `tick()` reads only typed arrays; the content objects
are touched only to hand a fired event to the hooks. The runner is a class, so every runner
shares one set of monomorphic methods (see [Gotchas](#gotchas) for why this matters).

## Terrain queries

`TerrainMap` (`core/collision`) is the stage's tile grid plus its tileset's tables:
`tileSize`, `cols`, `rows`, `tiles`, `tileType`, `tileAnchor`, `tileMask`. Its top-left corner
is world (0, 0); everything outside the map is open space. The World builds it with
`createStageTerrain(stage, db)` — a **private copy** of the tiles, so destructible terrain
(M2-07) can change it without touching the shared content.

| Query | Answers |
|---|---|
| `terrainAt(map, x, y)` | `TerrainType` of the pixel `(floor(x), floor(y))`: `Empty` 0 outside the map, in an empty cell, in a decorative tile or outside the tile's mask; else `Solid` 1 / `Hazard` 2 |
| `terrainSolidAt(map, x, y)` | `terrainAt(...) !== Empty` (hazards included) |
| `boxHitsTerrain(map, cx, cy, hw, hh)` | Highest `TerrainType` a box (centre + half sizes) touches, 0 = none; `Hazard` beats `Solid` |
| `terrainRectHit(map, x0, y0, x1, y1)` | The same for an inclusive rectangle of whole pixels (what `boxHitsTerrain` calls) |
| `findFloor(map, x, y, maxDist)` | Scanning column `floor(x)` down from row `floor(y)`: the y of the first colliding pixel's top edge, or `NaN` beyond `maxDist` |
| `findCeiling(map, x, y, maxDist)` | Scanning up: the first colliding pixel's bottom edge (row + 1), or `NaN` |

- **Pixel-exact.** A tile's pixel `(lx, ly)` is solid when `ly ≥ 8 − mask[lx]` (floor anchor)
  or `ly < mask[lx]` (ceiling anchor). Only the tiles under a box are visited, and only their
  covered mask columns.
- **Half-open boxes.** A box `[cx − hw, cx + hw] × [cy − hh, cy + hh]` covers pixel columns
  `floor(cx − hw) … ceil(cx + hw) − 1` (at least one) — a box resting exactly on a surface does
  not touch it. This differs on purpose from the *closed* shape tests of
  [sim-world.md](sim-world.md#collision-corecollision), where touching counts.
- **`NaN` means none.** Test with `v === v` (or `Number.isNaN`) — never `v < 0`.
- `findFloor` counts ceiling rock too (it is a floor for whatever is below it), `findCeiling`
  counts floor rock.
- None of them allocates. Per-tick callers with fractional positions should compute whole
  pixel bounds and call `terrainRectHit` — V8 boxes fractional arguments of calls it does not
  inline (one heap number per call). The World's phase 6 does exactly that for each alive
  ship's `terrainBox` (the KESTREL's is 5 × 3 half sizes) and reports contact with
  `playerHit(ship, PlayerHitCause.Terrain, tick, debugFlags)`. Since M1-12 that is a death
  (phase 7 of the same tick); the Force Field never absorbs terrain (D8).

## Parallax and the terrain view

**Parallax.** `createParallaxView(stage)` turns `stage.parallax` (≤ 8 bands, far to near) into
a `StageParallaxView` of typed arrays: per band the layer (`far` → `BgFar`, `mid` → `BgMid`),
sprite id, `spacing` (horizontal repeat distance, normally the sprite width), scroll `factor`
and `baseY` (playfield row at camera y 0). `updateParallaxView(view, camera.x, camera.y)` —
called by the World in phase 9 — sets `offsetX = (camera.x · factor) mod spacing` and `y =
baseY − camera.y · factor`. Bands repeat horizontally only: for two rows of 128-px star tiles,
list the band twice with `y` 0 and 128 (as `test-range` does).

**Terrain view.** `createTerrainView(map, stage, db)` gives the renderer a `TerrainView` over
the collision map's own `tiles` array (not a copy) plus the tileset's sprite id and per-tile
`tileFrame` table. The renderer's ring re-reads a cell only when it scrolls into view.

**Drawing** is `@shmup/render-pixi` `layers`: a ring-buffered 49 × 26 tile-sprite grid (one
column / row re-textured per tile edge crossed, the whole grid moved as one container) and
repeated sprites per parallax band — see
[rendering-and-shell.md](rendering-and-shell.md#layers-bindings-and-quad-pools).

## Running a stage

`GameConfig.stage` (default `null`) selects the stage by id; `createWorld` (and so
`createGame`) throws a `RangeError` for an id the content does not have, and
`resolveWorldStage(config, db)` does the lookup. The scene flow (M1-16) does not pick stages
itself — START creates a World from the same config, so a game runs `config.stage` (open space when
it is `null`). Since M1-18 both apps pass zone A there in the scene flow (`@shmup/shell`
`defaultStageId(contentFiles)` → `'zone-a'`); the zone map picks stages from M2-10. The dev entry
point is the web app:

```sh
pnpm dev
# → http://localhost:5173                      START plays zone A (M1-18); ?skip=boss starts near its boss
# → http://localhost:5173/?stage=test-range   (or ?stage=test-boss — the boss range, M1-13)
```

`apps/web` reads `?stage=<id>` with `stageFromSearch` and checks it against the raw content's
stage ids (`contentStageIds`); an unknown id logs `console.warn` and flies in open space. Without
`?stage=`, the scene flow plays zone A and the dev scenes (`?scene=flight` …) open space. The
free-flight scene draws a stage's parallax and terrain instead of its own starfield and shows the
stage name in the HUD. The Tizen app has no stage parameter (the widget has no query string):
START plays zone A.

`content/stages/zone-a.stage.json` is **AZURE VERGE**, zone A (M1-18): 9,000 px, camera keys
0.75 / 0.8 / 0.6 / 1.5 / 0.75 px/tick at 0 / 1,500 / 3,500 / 6,000 / 8,000, checkpoints at 0 /
3,500 / 6,000, heightfield floors and a floor-and-ceiling corridor (3,440–6,400), the star bands
plus the planet band `bg/azure-verge`, 58 events ending in the `warning` for HALCYON BULWARK at
8,600 and `end` at 9,000 — section by section in
[zone-a-and-playtest.md](zone-a-and-playtest.md#the-stage-azure-verge).

`content/stages/test-range.stage.json` is the dev / test stage: 4800 px long (about 75 s),
checkpoints at 0 / 1500 / 3000, speed 1 → 2 (a high-speed cave with floor and ceiling from
1500, flag `high-speed`) → a `speed` event to 1.5 at 2600 → 0.5 at 2700 (a slow section) → 1 at
3000 (a deeper cave), star parallax on both background layers, and `end` at 4800. Since
M1-08 its timeline also spawns the test roster between x 60 and 4200 — drifter and fan
formations (on the `fan-loop` / `dive-down` paths), capsule carriers, floor and ceiling
turrets, walkers and hatches on the rolling ground, a rammer and orbiters
([enemies-and-behaviors.md](enemies-and-behaviors.md#the-test-range-roster)); since M1-09 the
turrets, walkers and orbiters fire on it ([bullets-and-patterns.md](bullets-and-patterns.md)),
and since M1-10 the KESTREL shoots them down (with `?loadout=full`: lasers, missiles sliding
over its slopes and four Options — [weapons-and-options.md](weapons-and-options.md)); since
M1-11 the carriers and completed formations drop power capsules the ship collects and equips
with OK ([powerups-and-shields.md](powerups-and-shields.md)).
A checkpoint restart empties the enemy bullet and laser pools, the player shots and the items
with every other registered pool (`pools.clearAll()`), resets the weapon system's hit list and
batches (`weapons.clear()`) and forgets the power-ups' pickups, pending Mega Crashes and taken
drops (`powerups.clear()` — the meters and shields stay).
`example.stage.json` shows the rest of the format (RLE rows over `example.tileset.json`,
formations, a pan, a scroll lock, the `warning` event of the example warden).
`content/stages/test-boss.stage.json` (BOSS RANGE, M1-13) is a 1200-px open-space range: two
capsule carriers, then a `warning` for the test boss at x 300 — `?stage=test-boss`
([bosses-and-warning.md](bosses-and-warning.md#the-test-boss-and-stagetest-boss)).

Headless:

```ts
const world = createWorld(resolveGameConfig({ stage: 'test-range', seed: 1 }), db);
const input = createInputSnapshot();
while (world.status !== 'stageClear') stepWorld(world, input);
world.camera.x; // 4800
world.stage!.restartAt(1); // back to x 1500: speed, pan and flags as live play had them there
```

## Extending it

| To add… | Do this |
|---|---|
| A stage | A `content/stages/<id>.stage.json` following the README; `pnpm content:check`; fly it with `?stage=<id>`. `stage-runtime.test.ts` plays every shipped stage to `stageClear`, also after a restart at each of its checkpoints |
| A tileset | `content/tilesets/<id>.tileset.json` + its atlas sprite; masks must match the art (the integration test compares them). For the heightfield generator it needs tiles named `solid`, `floor`, `ceiling` and a solid tile for every 45° / 22.5° mask of both anchors. Append new tiles — inserting one renumbers every later id in RLE rows |
| An event type | Append the name to `STAGE_EVENT_TYPES` and a code to `StageEventCode` (never renumber — the code is the name's position and hooks switch on it), add the interface to the `StageEvent` union and a variant to `STAGE_EVENT_SCHEMA` in `core/data`, the runner's own part (if any) in `compileStage` / `applyEvent` and in the restart replay, the World's handling in its stage hooks, the README table, tests |
| A camera-key feature | The field in `StageCameraKey` + schema, a compiled typed array in `compileStage`, its effect in `applyKey` **and** in `reset()`'s re-derivation (a restart must reproduce it), new `StageSlot`s appended (this changes `STAGE_STATE_SLOTS` and the hash) |
| A tile collision type | Append to `TILE_TYPES` and `TerrainType` (the code order is the priority `boxHitsTerrain` returns), handle it where the World reacts to terrain |
| A system that reacts to terrain | Query `world.terrain` in its phase with whole-pixel bounds (`terrainRectHit`, `findFloor` from floored positions); check for `null` (open-space stages, free flight) |

## Tests

| Where | Covers |
|---|---|
| `packages/core/test/stage/stage.test.ts` | Ramp values, pans, locks, the stage end; every event fires exactly once at its x, in order, several on one tick; checkpoints (last passed, binary-search cursor, re-derived speed / pan / flags, `clear()`); the live-vs-restart tie cases of the review; parallax / terrain views; allocation-free `tick()` |
| `packages/core/test/stage/stage-brake.test.ts`, `stage-brake-edge.test.ts` | The brake (M1-13): its hashed slots, linear deceleration then the lock where it stopped, speeds of keys and `speed` events met while braking recorded and resumed, `brake(0)`, a restart forgets it; a fractional ramp, resuming at a running ramp's target, `unlock()` mid-brake, pans under the lock, a lock key met while braking, a brake from a standstill, a restart replaying a passed `speed` event |
| `packages/core/test/stage/stage-jump.test.ts`, `stage-jump-edge.test.ts` | `jumpTo` (M1-18): state equal to `restartAt` at a checkpoint's x, re-derived speed / pan / flags between keys, the events at `x` re-fired, the checkpoint index at or before `x`, range errors; no / late checkpoints, a pending key at `x`, key vs speed-event order, lock keys, a re-opened `end`, a brake released, a jump from a hook, independence from the run's history |
| `packages/core/test/stage/stage-edge.test.ts` | Ramps and pans interrupted mid-way, scroll stops, locks (first key, stage end, behind a speed event, several in a row, fractional keys at fractional speeds, behind non-lock keys crossed in one tick), `unlock()` before a lock, flags up to bit 31, randomised invariants on 60 generated stages, a randomised live-vs-restart equivalence on 60 stages, `findEventCursor` vs a linear scan, allocation with locks, pans and unlocking hooks |
| `packages/core/test/collision/terrain*.test.ts` | Every `terrain-a` tile shape pixel by pixel (`terrainAt`, `findFloor` from above, `findCeiling` from below), `boxHitsTerrain` edges, hazard priority, decoration, out-of-map and NaN input; every query against an independent pixel reference on random maps; the allocation guard |
| `packages/core/test/data/tilemap*.test.ts`, `stage-edge.test.ts` | Tileset validation and tables; stage checks (sorting, first key, range, pans, flags, segments, unknown tileset) — all issues of one file in one load; RLE decoding and every error; the heightfield generator (deterministic, masks match tiles, slope rules, ramps, floor over ceiling, 120 random profiles where `findFloor` sees exactly the generated heights) |
| `packages/core/test/world/world-stage*.test.ts` | `config.stage` (unknown ids throw), the runner driving the camera and the ship riding along (pans, locks), music events and the queued theme, `end` → `stageClear`, restarts clearing the pools, the view's parallax / terrain, terrain hits through `playerHit` (fly-in, god mode, hazard, decoration, ceilings, player 2), hit-stop freezing the timeline, determinism, zero allocation |
| `packages/core/test/debug/` | `hashWorld` covers the stage state and the players' hit fields |
| `packages/render-pixi/test/layers/layers-stage*.test.ts`, `renderer/` | The terrain ring and parallax bands ([rendering-and-shell.md](rendering-and-shell.md#tests)) |
| `packages/shell/test/flight/`, `apps/web/test/boot/` | The flight scene with a stage (no starfield, stage name, the World's views); `stageFromSearch`, `contentStageIds`, the unknown-id warning |
| `test/integration/stage-terrain.test.ts`, `stage-runtime.test.ts` | Tileset masks = atlas pixels; `test-range` expands with existing frames and a pinned grid fingerprint; **every shipped stage with terrain** (`test-range`, and zone A since M1-18) leaves a ≥ 48-px corridor in every pixel column and a clear spawn at every checkpoint; every shipped stage plays to `stageClear` deterministically, also after a restart at each checkpoint; the World collides with the tiles the renderer draws |
| `test/e2e/stage.spec.ts` | In Chromium: `?stage=test-range` shows terrain inside the playfield only and scrolls it while the ship stays put (captures 30 frames apart since M1-08 — see Gotchas); an unknown id boots free flight |

## Gotchas

| Symptom | Cause / fix |
|---|---|
| A `speed` event seems ignored | A camera key at the same x (or within one tick's movement after it) applies one tick later and overrides it. Move the speed into the key, or the event past the key |
| A `speed` event at x 0 overrides the first key | By design — the camera starts at 0, so the first tick applies the key first and then fires the events at 0 |
| After `restartAt`, the speed differs slightly from live play | A key and a `speed` event less than one tick's movement apart; place them at the same x or further apart (see [Checkpoints](#checkpoints)) |
| Spawns at a checkpoint's x appear again after a restart | Intended: those events re-fire on the next tick for the hooks (their runner part was already applied) |
| `unlock()` did nothing | It was called before the camera reached the lock key; the key locks when it applies |
| A key's or `speed` event's new speed was ignored during a boss | A brake holds the camera: the speed is only recorded and applies at the `unlock()` |
| The camera stops short of the stage end | A lock key (or a WARNING's brake) waiting for `unlock()` — a boss's death unlocks it (M1-13) |
| The ship flies through rock | Only during the fly-in, while invulnerable (the respawn blink) and in god mode; otherwise terrain contact is a death since M1-12 |
| A test that parks a ship in the floor ends in `gameOver` | Terrain kills since M1-12 — set `world.debugFlags.godMode = true` |
| A box sitting exactly on a floor does not hit | Terrain tests are half-open on pixels; move it one pixel into the rock |
| `findFloor(...) < 0` never true | "None" is `NaN`, not -1 |
| Every fractional camera write allocates after adding a content schema | V8 shares hidden classes between object *literals* with the same key order; a 6-key literal starting with `x` (the new camera-key schema) generalised a literal camera's `x` field to "tagged". The camera is therefore a class instance (`createStageCamera()`); keep hot objects out of literal shapes that content schemas also build |
| `tick()` allocates in the allocation guard | Something made it megamorphic or unoptimised — reading content objects per tick (their shapes vary with optional fields) or per-instance closures. Read the compiled typed arrays, keep methods on the class |
| Per-tick terrain queries allocate | Fractional arguments to a non-inlined call are boxed; pass floored / ceiled whole pixels (`terrainRectHit`) |
| `stage "x": unknown event type` `RangeError` | A `StageSpec` that did not come through `loadContent` (hand-made in a test) with a type the runtime does not know |
| A stage loads without terrain | Its tileset id did not resolve, the tile sizes differ, or its RLE rows failed — all reported as issues; the heightfield issues (missing tile names or masks) keep the terrain |
| `?stage=` does nothing on the TV | The widget has no query string: START plays zone A (`defaultStageId`, M1-18) and the zone map picks stages from M2-10 |
| The skipped part of a stage never spawned after `jumpTo` | By design: events between the old and the new x never fire (the debug stage skip jumps over them) |
| The `test-range` fingerprint test fails | The stage file or the generator changed. If intended, re-pin the value in `stage-runtime.test.ts` and say why in the commit |
| A browser test that measures the scroll between two screenshots misses the shift | With enemies drawn and e2e files running in parallel, the frame loop may run up to 4 ticks per frame, so a frame count says little about the ticks run. Freeze the sim and step exact ticks (`freezeSim` / `stepTo` in `test/e2e/frame-advance.ts`): the stage test captures at tick 90 and 30 ticks later and expects a 30 px shift |

## Next steps that build on this page

- **M1-08** (done) — enemies spawned from `spawn` / `formation` events (the World's hooks),
  `paths` content, ground enemies and crawlers on `findFloor` / `findCeiling`
  ([enemies-and-behaviors.md](enemies-and-behaviors.md)).
- **M1-09** (done) — enemy bullets ride the camera like flying enemies and die on the terrain
  (one `terrainAt` lookup per bullet); the restart hook clears their pools
  ([bullets-and-patterns.md](bullets-and-patterns.md)).
- **M1-10** (done) — player shots ride the camera too and die on terrain; the laser head stops
  at the first solid column; ground missiles land on and slide along `findFloor` surfaces
  (climbing slopes, dying at walls, falling over cliffs); the restart hook also clears the
  weapon system ([weapons-and-options.md](weapons-and-options.md)).
- **M1-12** (done) — terrain contact is a death; the `arcade` penalty restarts at
  `runner.checkpoint` with `restartAt` when the ship respawns
  ([death-and-scoring.md](death-and-scoring.md)).
- **M1-13** (done) — `warning` / `boss` events start the boss system; the WARNING brakes the
  camera to a lock (`brake()`), the boss's death releases it with `unlock()`; `test-boss` stage
  ([bosses-and-warning.md](bosses-and-warning.md)).
- **M1-16** (done) — the scene flow runs the stage `config.stage` names on START and on RETRY
  STAGE (a fresh World each time); the stage's `end` event and a boss's death set `stageClear`,
  which opens the stage-clear screen ([scenes-and-ui.md](scenes-and-ui.md)). Picking stages from
  the flow comes with the zone map (M2-10).
- **M1-18** (done) — zone A, AZURE VERGE, the stage both apps play by default; `jumpTo(x)` and the
  debug stage skip (`GameConfig.stageSkip`, `?skip=boss`); the corridor check covers every stage
  with terrain ([zone-a-and-playtest.md](zone-a-and-playtest.md)).
- **M1-19** (done) — the debug controls: skip to the boss on `jumpTo`, jump to the next
  checkpoint on `restartAt`; replays starting at a checkpoint
  ([debug-and-replays.md](debug-and-replays.md#the-debug-controls)).
- **M2-07** — time-keyed events during scroll stops, diagonal scrolling, in-stage branches on
  the flags, destructible tiles, the Tiled / LDtk exporter to RLE rows.
