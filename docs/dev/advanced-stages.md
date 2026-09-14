# Advanced stage systems: destructible terrain, moving blocks, branches, gimmicks, Tiled import

How plan step **M2-07** gave the stage runtime the mechanics the later zones need: **destructible
tiles** (per-cell damage, regenerating walls, rolled back on every checkpoint restart), **moving
floors and ceilings** (block entities every terrain query sees), **falling rocks** (a ballistic
mover with a proximity trigger), **in-stage branches** (region triggers set flags, flags select
events), **timed scroll stops, diagonal pans and high-speed sections** in the camera path, six
reusable **gimmick behaviours** (splitting bubbles, a volcano, a suction field, a grabbing
tentacle, the seeded cube rush that stacks into walls, the falling rock) and
`scripts/content/tiled-import.mjs`, which turns a map drawn in **Tiled** into stage JSON.

None of it is in zone A: AZURE VERGE plays exactly as before (the golden replays prove it). The
dev stage `gimmick-range` (`?stage=gimmick-range` in a browser) uses every piece; the zones of
M2-11 … M2-14 (BRINE NEBULA's bubbles, MAGMA DEEP's volcanoes, rocks and destructible maze, CELL
VAULT's tissue walls and tentacles, PRISM LABYRINTH's cube rush, IRON CITADEL's moving floors)
build on it.

This page is the *how and why* and the map of the whole step. Exact signatures are in
[api-reference.md](api-reference.md#stage--stage-runtime); the TSDoc in
`packages/core/src/{stage,collision,data,patterns,enemies,behaviors,weapons,world}/` (the World
side of the stage systems is `packages/core/src/stage/systems.ts`) and in
`scripts/content/tiled-import.mjs` is the authoritative reference. The data format for authors is
next to the data: [`content/stages/README.md`](../../content/stages/README.md#holds-diagonal-pans-and-branches-m2-07),
[`content/tilesets/README.md`](../../content/tilesets/README.md) and
[`content/enemies/README.md`](../../content/enemies/README.md). What testers see is in
[`../client/preview-build.md`](../client/preview-build.md#the-gimmick-range-browser-only). The
systems this step extends have their own pages:

| Part | Home page |
|---|---|
| The stage runner, the camera path, checkpoints, the terrain queries | [stage-runtime.md](stage-runtime.md) |
| The World, the tick phases, the state hash | [sim-world.md](sim-world.md) |
| Enemies, the script API, movers, behaviours | [enemies-and-behaviors.md](enemies-and-behaviors.md) |
| Player shots and where they die | [weapons-and-options.md](weapons-and-options.md) |
| The terrain ring the renderer draws | [rendering-and-shell.md](rendering-and-shell.md#layers-bindings-and-quad-pools) |
| Generated tiles and sprites | [asset-pipeline.md](asset-pipeline.md) |
| Golden replays and why they were re-blessed | [debug-and-replays.md](debug-and-replays.md#golden-replays-testgolden) |

Background: `shmup_feat.md` §14 (destructible terrain with regenerating organic walls, moving
floors / ceilings, falling rocks, stage gimmicks, in-stage branching paths, vertical and diagonal
scrolling, high-speed sections, authoring in LDtk or Tiled), §10 (checkpoints); plan §3.2 (tick
phases) and decisions **D17** (the four-way rule), **D26** (world-space coordinates) and **D29**
(behaviour coroutines).

## The picture at a glance

```text
content/tilesets/terrain-a.tileset.json   brick (hp 4), cube (hp 2), tissue (hp 3, regen 240)
content/stages/<id>.stage.json            camera keys: hold, yOver · branches · trigger / block events
content/enemies/<file>.enemies.json       mover "ballistic" · scripts rock.fall … cube.stack
        │ loadContent (checks, flag ids, branchId, block tileId, tileset hp / regen / score)
        ▼
createWorld ── createStageTerrain → TerrainMap (+ TerrainBlocks when the stage has block events)
            ── createStageGimmicks → world.gimmicks: DestructibleTerrain · MovingBlockSystem ·
                                      pull fields (8) · chains (8 × 16 links)
            ── createTerrainView(…, destructible) → view.terrain.changes (the change log)

stepWorld
 2 players    … ships move → gimmicks.applyFields()   pull fields draw alive ships, clamp to view
 3 stage      runner.tick(): holds, diagonal pans, branch-gated events, trigger arming
              hooks: block event → gimmicks.blocks.spawn(index)
              gimmicks.updateStage(runner): ships probe triggers · blocks move · keep-out boxes ·
                                             destructible.update() (heal / regrow)
 4 scripts    gimmick behaviours: pull / release / chain / placeTile / setMoverOf / destroy
 5 movement   Ballistic bodies fly, land (shatter → EnemySystem.destroy, else wake the script)
              a player shot dies on terrain → gimmicks.hitTerrain(px, py, damage, player)
 9 fx         gimmicks.sync(): block tiles (LayerId.Terrain), chain links (LayerId.GroundEnemies)

checkpoint restart → clearSession → gimmicks.clear(): the stage's own tiles again, no fields or
                     chains, blocks whose (taken) events lie behind the camera respawn at age 0

render-pixi terrain binding: changes.count / resets moved → re-texture the logged cells in view
```

## Content (`core/data`)

**Tiles.** A colliding tile of a tileset may carry `hp` (1–255: destructible), `regen` (ticks,
needs `hp`: it heals and grows back) and `score` (0–65,535: points for the shooter who breaks
it). It still collides as its `type` — destructible is a property, not a new `TerrainType`, so
"hazard beats solid" and every query stay as they were. `buildTilesetTables` adds the per-id typed
arrays `hp` (`Uint8Array`), `regen` and `score` (`Uint16Array`) to `TilesetTables`; an `empty`
(decorative) tile with `hp` or a `regen` without `hp` is an issue. `terrain-a` appended `brick`
(id 18, hp 4), `cube` (19, hp 2 — what the cube rush stacks) and `tissue` (20, hp 3, regen 240),
each worth 10 points and drawn by its own generated frame.

**Camera keys** gain `hold` (ticks: a timed scroll stop, not with `lock`) and `yOver` (scroll px:
a diagonal pan, needs `yTo`, not with `yTicks`) — see [The camera path](#the-camera-path-holds-diagonal-pans-high-speed-sections).

**Branches.** `branches: [{ id, flag, value? }]` (≤ `MAX_STAGE_BRANCHES` 32, unique ids; `value`
defaults to `true`) — a branch is taken while its flag has that value. **Every** event variant now
extends `StageEventBase { x, branch?, branchId? }`; naming an unknown branch is an issue. Branch
flags join the stage's `flagNames` with those of `flag` and `trigger` events (still ≤ 32 per stage).

**New events** (appended to `STAGE_EVENT_TYPES`, so `StageEventCode.Trigger` = 8, `Block` = 9):

| `type` | Fields | Checks |
|---|---|---|
| `trigger` (`StageTriggerEvent`) | `flag` (→ `flagId`), `region: StageRegion { x, y, w, h }` (world px), `value?` (default `true`), `until?` (camera x; default `region.x + region.w`) | ≤ `MAX_STAGE_TRIGGERS` (32) per stage; `until` not before the event's `x` |
| `block` (`StageBlockEvent`) | `y` (world, top edge), `w`, `h` (px, whole tiles), `screenX?` (default `DEFAULT_BLOCK_SCREEN_X` 400 — the left edge is world x `x + screenX`), `tile?` (a tile **name**, default `solid` → `tileId`, resolved in the terrain pass), `vx?`, `vy?` (drift px/tick), `dx?`, `dy?` (swing px), `period?` (ticks, default `DEFAULT_BLOCK_PERIOD` 120), `phase?` (binary units) | on the tile grid, at most `MAX_BLOCK_CELLS` (64) tiles; the stage needs a tilemap; the tile must exist |

**The `ballistic` mover** (`EnemyMoverSpec`): `{ type: 'ballistic', vx, vy, gravity?, maxFall?,
trigger?, land? }` — `land` is a `BallisticLandName` (`'pass' | 'stop' | 'shatter'`, default
`'stop'`, `BALLISTIC_LANDS` in code order). `MOVER_TYPES` gained it at the end (`MoverKind.Ballistic`
= 9).

## The camera path: holds, diagonal pans, high-speed sections

`core/stage` compiles two more key arrays (`keyHold`, `keyYOver`) and treats a hold key as a
**stop key** like a lock: `keyNextLock` now points at the first lock **or hold** at or after each
key, so step 3 of `tick()` clamps the movement to it and the camera halts **exactly** at its x.

- **`hold`.** When the key applies (the tick after the camera reached it) the camera stays still
  for `hold` ticks (`StageSlot.Hold` counts down, `HoldKey` remembers the key; `runner.holding`).
  A `yTo` / `yTicks` pan of the same key runs meanwhile — that is how a **vertical section** is
  written. On the hold's last tick the key's `speed` and `ramp` take over, so the camera moves
  again from the next tick. A brake (the boss WARNING) and its `unlock()` inside a hold do not cut
  it short: the camera stays until the hold ends, then scrolls on at the key's speed.
- **`yOver`.** The pan is linear in the **scroll x**: the camera y goes from wherever it was to
  `yTo` while the camera x goes from the key's x to `x + yOver` (`StageSlot.PanOver`,
  `PanStartX`). A speed change mid-pan keeps the slope; a lock or a hold freezes it (x does not
  move); a later timed pan (`yTicks`) replaces it.
- **High-speed sections** need no new data: camera keys and `speed` events up to 16 px/tick. The
  runner already fired every event with `x ≤ camera.x`, in order, exactly once, however far one
  tick moves; the tests pin it at 16 px/tick, also stopping exactly at a hold.

`STAGE_STATE_SLOTS` grew from 22 to **28**: `Hold 22`, `HoldKey 23`, `PanOver 24`, `PanStartX 25`,
`TriggersArmed 26`, `TriggersFired 27`. They are hashed like the rest of `runner.state`.

**Restart.** `restartAt` / `jumpTo` replay the keys in live order: a hold key behind the restart x
is settled (its speed applies at once, no hold); a hold key at exactly the restart x holds again,
as live play did on arriving. A diagonal pan still running at the restart x resumes where live
play had it, and a `yTo` key replayed while an earlier diagonal pan runs starts from that pan's y
**at the key's own x** (the review's second round fixed the overlapping-pans case — keys at 0 and
500 with `yOver` 1,000 used to restart at y 56 instead of 35). A timed pan behind the restart x
counts as finished.

## Branches and region triggers (`core/stage`)

Branches are resolved at compile time into two arrays per event: `eventBranchBit` (the flag's bit,
0 = no branch) and `eventBranchValue`. `runner.eventActive(index)` answers "would this event fire
now?". When the camera reaches an event whose branch is **not** taken, the runner passes it by
entirely — no runner part (speed, flag, end, trigger arming) and no hook call (no spawn, no block,
no music). Branches are therefore just flags: a `flag` event, a region trigger or
`runner.setFlag(flagId, value)` (scripts, tools, tests) decides which events of a later stretch
fire.

**Region triggers.** A `trigger` event's runner part **arms** its region (bit `t` of
`StageSlot.TriggersArmed`, `t` = the trigger's ordinal in timeline order). Every tick, in phase 3
after `runner.tick()`, the World lets each `alive` ship probe the armed regions
(`runner.probe(ship)` — the ship object, not two fractional numbers: V8 boxes those). The first
ship whose **centre** is inside a region (left / top edges inclusive, right / bottom exclusive)
fires it: its flag is set (or cleared with `value: false`), it disarms and its bit goes into
`TriggersFired`. An armed trigger disarms unfired once `camera.x > until`. The masks are state
slots, so triggers are hashed, recorded and replayed like everything else.

**Restarts** re-derive the flags in timeline order. A trigger **behind** the restart x that had
fired (its bit in `TriggersFired`) applies its flag **at its place in the timeline** — live play
fired it on some later tick while it was armed, so a `flag` event between the trigger's `x` and
the tick it really fired can end with the other value after a restart. This is the one
approximation of the feature; keep a trigger's flag out of other `flag` events' way. A trigger
that had not fired is armed again while `until ≥ camera.x` (a restart exactly at `until`, e.g. a
hold or lock on that x, re-arms it — a bug the test agent found: it used to need `until >
camera.x`, so live play could fire the trigger and the restarted run could not).

## Destructible terrain (`core/collision` `DestructibleTerrain`)

One per World, over the World's **private** copy of the tiles (`createStageTerrain` slices the
content's array); the stage's own tiles (`StageSpec.terrain.tiles`) are the pristine copy it
restores from and never writes.

- **Hits.** `hit(px, py, amount)` damages the **cell** of the pixel (whole numbers) — a tile with
  `hp` 0, an empty cell or a moving block there answers `TerrainHit.None`. Damage adds up per cell
  (amounts floored, at least 1); at the tile's `hp` the cell empties: `TerrainHit.Destroyed`,
  `lastTile` / `lastCell` say what broke, `destroyed` counts breaks since the last restore.
  Otherwise `TerrainHit.Damaged`.
- **The table.** Only damaged and regrowing cells take an entry of a fixed table of
  `MAX_TERRAIN_DAMAGE` (512) — `entryCell`, `entryTile`, `entryDamage`, `entryTimer`,
  `entryState` (free / damaged / regrowing), scanned up to `entries`. A hit on a **new** cell while
  the table is full is ignored unless it breaks the tile at once (a broken tile without `regen`
  needs no entry; one with `regen` then never grows back).
- **Regeneration.** A tile with `regen` heals its damage after `regen` ticks without a hit (a hit
  restarts the timer) and grows back `regen` ticks after breaking — but not while a **keep-out
  rectangle** overlaps the cell: it waits, retrying every tick. The keep-out rectangles are the
  ships' terrain boxes, rebuilt every tick in phase 3 (`clearKeepOut` / `addKeepOut`, up to
  `MAX_TERRAIN_KEEP_OUT` 4; every active ship that is not `dying` / `dead`), so rock never grows
  into a ship. A regrowing cell cannot be hit (it is empty).
- **Placed tiles.** `place(col, row, tile)` puts a tile into an **empty** cell no keep-out
  rectangle overlaps (the cube rush) and drops a regrowing entry of that cell. The keep-out boxes
  are set even when no tile of the tileset has `hp` — the first review round found a tileset
  without destructible tiles letting a rush cube land on a ship.
- **Rollback.** `restore()` copies the pristine tiles back — broken tiles return, placed ones
  vanish — forgets every entry and counts a reset. It runs on **every** checkpoint restart, jump
  and continue (`clearSession`); it is *not* a snapshot taken when a checkpoint was passed.
- **The change log** (the render contract's `TerrainChanges`): every changed cell is written into
  a ring of `TERRAIN_CHANGE_LOG` (64) cell indices (`cells`), `count` is the write count and
  `resets` the restore count. The renderer follows it (below).

`StageGimmicks.hitTerrain(px, py, amount, by)` wraps `hit` for the World: `SFX EnemyHit` while
the tile stands; `SFX EnemyExplodeSmall`, `FX ExplosionSmall` and the tile's `score` for player
`by` when it breaks (events at the cell's centre).

## Moving blocks (`TerrainBlocks`, `MovingBlockSystem`)

Moving floors and ceilings live **inside the terrain queries**: a map's optional `blocks`
(`TerrainBlocks`, `MAX_TERRAIN_BLOCKS` 16 whole-pixel boxes with a `TerrainType` each) is tested by
`terrainAt`, `terrainRectHit` / `boxHitsTerrain`, `findFloor` and `findCeiling` after the tiles.
So the ship dies on them, player shots and enemy bullets stop at them, crawlers walk on them and
ground missiles slide over them — none of those systems changed. `createStageTerrain` gives a map
block slots only when its stage has `block` events.

`MovingBlockSystem` (in `StageGimmicks.blocks`) compiles the stage's `block` events at creation.
When one fires (the World's stage hook, `StageEventCode.Block`) the block takes the lowest free
slot (none free: dropped). Every tick it is placed at

```text
x = baseX + vx · age + dx · sin(phase + age · 1024 / period)      baseX = event.x + screenX
y = event.y + vy · age + dy · sin(…)                               (table sine, whole pixels)
```

— its left edge is a **world** x, not relative to the camera, so blocks line up with the tiles.
A block `BLOCK_DESPAWN_MARGIN` (128) px behind the view's left edge is gone. It is drawn tile by
tile (the tileset sprite, the tile's frame) into a `LayerId.Terrain` batch of at most
`BLOCK_BATCH_CAPACITY` (256) tiles, appended as the view's last batch. After a restart the blocks
whose events lie behind the camera (and whose branch is taken) come back **at age 0** unless they
would already be gone.

## Falling rocks and the `Ballistic` mover (`core/patterns`, `core/enemies`)

`MoverKind.Ballistic (vx, vy, gravity, maxFall, trigger, land)`: the body waits, still
(`BALLISTIC_ARMED`), until the nearest living player is within `trigger` px **horizontally**
(0 = flies at once), then flies (`BALLISTIC_FLYING`) — `gravity` added to the vertical speed every
tick, capped at `maxFall` when > 0. With `land` `Stop` or `Shatter` it stops just before its box
would enter terrain (`BALLISTIC_LANDED`; `vx` / `vy` 0 from then on); `Pass` flies through.
`MoverBody` gained `hw` (half width) for that terrain box. Because the proximity test is part of
the mover, a waiting rock costs no script wakes (a `yield 1` loop would allocate every tick — D29).

The enemy system checks landings after the movers (phase 5): a `Shatter` body is **destroyed**
(`EnemySystem.destroy(enemy, explode)`: its explosion, no score, no drop, no revenge, no death
behaviour; a formation member counts as escaped); any other body's sleeping script is woken on the
next tick (`ScriptApi.landed()` then answers `true`).

## Gimmick behaviours (`core/behaviors`) and the script API

| Script | What it does (defaults in brackets) | Uses |
|---|---|---|
| `rock.fall` | A falling rock or lava stone: `Ballistic` with a proximity trigger [`trigger` 48, `gravity` 0.15, `maxFall` 4], shatters on the terrain; a body already thrown keeps its arc | the mover |
| `bubble.split` | Drifts left on a sine [`speed` 0.75, `amp` 16, `period` 120]; killed, it releases [`count` 2] `child` enemies fanned around "left" [`spread` 256, `splitSpeed` 1.25, `scatterTicks` 30] — a child may split again. Never on a Mega Crash or the blue capsule | `BehaviorDef.death`, `setMoverOf` |
| `volcano.lob` | A ground volcano: every [`interval` 90] ticks (rank-scaled, only while it may fire) throws [`count` 3] `child` stones up at a random [`minUp` 2.5 … `maxUp` 3.5] and sideways ± [`spread` 1.25] on a shattering arc [`gravity` 0.08, `maxFall` 3] — gameplay stream, replay-safe | `spawn`, `setMoverOf` |
| `field.suction` | Once on screen, a pull field [`radius` 160, `strength` 0.6] for as long as it lives (its spec's `mover` moves it) | `pull` |
| `tentacle.grab` | Anchored where it spawns; a chain of [`links` 8] from the anchor to the claw; when a ship is within [`reach` 96] of the anchor it lunges (homing [`speed` 2, `turnRate` 12] for [`extendTicks` 48]) with a short pull [`grabRadius` 40, `grabPull` 0.5], lets go, retracts [`retractSpeed` 1.5] and rests [`restTicks` 60]. The claw kills on contact like any enemy — there is **no "held ship" state** | `chain`, `pull`, `release` |
| `cube.stack` | One cube of a **seeded cube rush**: moves to a random row [`margin` 24 px from the edges, gameplay stream], aims at the nearest player (32 directions), flies [`speed` 2] on a `Ballistic` mover that stops at the terrain; where it stops, the tileset's `cube` tile is placed in its cell and the cube is gone (no tile or no free cell: it shatters). A `formation` event makes the rush | `tileId`, `placeTile`, `destroy` |

None of them fires bullets. `ScriptApi` gained (all no-ops or `false` without the World's gimmick
host, e.g. in a bare `EnemySystem` test):

| Call | Effect |
|---|---|
| `setMoverOf(other, kind, …)` | Switches **another** enemy's mover (a volcano throwing the stone it spawned; the child's own script keeps it unless it sets one) |
| `destroy(explode = true)` | Removes this enemy without a kill (see `EnemySystem.destroy` above) |
| `landed()` | Whether its `Ballistic` body has landed |
| `pull(radius, strength, ticks)` / `release()` | Starts (or replaces) / ends this enemy's pull field; `ticks ≤ 0` = while it lives. `false` when all `MAX_PULL_FIELDS` (8) are taken |
| `chain(anchorX, anchorY, links)` | Draws `links` (1 … `MAX_CHAIN_LINKS` 16) `gimmicks/chain-link` sprites from a world point to this enemy every frame until it is gone. `false` when all `MAX_CHAINS` (8) are taken |
| `placeTile(x, y, tile)` / `tileId(name)` | Puts a tileset tile into the empty cell at a world point (the rollback removes it) / the stage tileset's tile id by name, -1 when none (read it once when the script starts) |

A behaviour's optional **death** callback (`defineBehavior(id, params, create, needsChild,
needsPattern, death)` → `BehaviorDef.death` / `EnemyBehavior.death`) runs when an enemy of it is
killed, while it still stands where it died — not when it escapes, is `destroy`ed, or dies in a
Mega Crash / blue-capsule clear.

**Pull fields** are applied in phase 2 **after** the ships moved (`StageGimmicks.applyFields`):
every `alive` ship whose centre is within the radius moves `strength` px towards the owner (at
most the distance), then is clamped to the view minus the ship's margins like `updatePlayer` does.
A field ends when its owner dies (checked by slot **and** spawn tick, so a reused slot is another
enemy) or its ticks run out. **Chains** end with their owner too and are drawn on
`LayerId.GroundEnemies` (under the enemies), evenly spaced from the anchor towards the owner.

## The World wiring (`StageGimmicks`)

`createStageGimmicks(host, enemies, stage, map, content)` builds `world.gimmicks` at load (free
flight or open space: no destructible terrain, no blocks; the fields and chains still work). The
World calls it from four places, in tick order: phase 2 `applyFields()`, phase 3 `updateStage(runner)`
(trigger probes, blocks, keep-out boxes, heal / regrow — after `runner.tick()`), phase 5
`hitTerrain(...)` (from `core/weapons`), phase 9 `sync()` (block and chain batches). The stage
hook spawns a block on `StageEventCode.Block`; `clearSession` (every checkpoint restart, jump and
continue) calls `clear(runner, camera.x)`. `createWorld` builds the terrain view **after** the
gimmicks so that `view.terrain.changes` is the destructible terrain, and appends the chain batch
and then (on a stage with blocks) the block batch after the existing batches — renderers bind
batches in order, so the terrain grid is drawn first and the blocks over it.

`ENGINE_SPRITES` gained `GIMMICK_SPRITES` (`gimmicks/chain-link`); the sprite ids after it shifted.
Co-op works as is: both ships probe triggers, both keep rock from growing into them, pull fields
pull both, and the aim of a cube or the reach of a tentacle uses the nearest living player.

## Shots meeting the terrain (`core/weapons`)

`WeaponHost` gained an optional `gimmicks` (`{ hitTerrain(px, py, amount, by) }`; absent = terrain
never breaks). Every player shot that **dies on terrain** hits the destructible tile at the pixel
where it met the rock with its damage, credited to its shooter: a straight flight (the main shot,
Double, Tail Gun …), a laser head the rock blocks, a Spread Bomb bursting on it, a missile flying
into a wall. Enemy bullets never break tiles.

## Rendering the change log (`@shmup/render-pixi` `layers`)

The terrain binding still re-textures one ring column / row per tile edge crossed. Since M2-07 it
also remembers the change log's `count` and `resets`: new entries re-texture only the logged cells
a ring slot shows right now (the others are read when they scroll in); a new reset (the rollback),
or a gap longer than the 64-entry ring, redraws the whole grid. `TerrainView.changes` is optional
(`null` / absent = a static map), so other renderers keep working.

## Determinism, hashing and golden replays

Everything above is deterministic: typed arrays and whole numbers, table sines, the gameplay RNG
stream for the volcano and the cube rush. `hashWorld` mixes the stage runner's six new slots (via
`runner.state`) and, after the existing blocks, the gimmicks (`mixGimmicks`): the destructible
terrain's `count`, `resets`, `destroyed`, change ring and every tracked entry; each block slot's
event, age and position; each pull field's owner, spawn tick, radius, strength and ticks; each
chain's owner, spawn tick, anchor and links. The keep-out rectangles are not hashed (they are
rebuilt from the ships every tick).

The zone A goldens were **re-blessed** once (commit `75470d0`) for the new hash layout and the
sprite ids shifted by `gimmicks/chain-link`; before re-blessing they were run against the old
layout and passed — zone A's simulation is unchanged. The test step added three goldens of the
dev stage, `gimmick-range-god` (4-way bot, god mode: the high branch, a brick shot open, both
blocks, the suction, the tentacle, the cube rush), `gimmick-range-weaver` (a weaving pilot with god
mode through the region trigger: the low branch) and `gimmick-range-deaths` (the weaver under the
Arcade penalty: checkpoint restarts rolling the terrain back, game over); `playGolden` now also
returns the session's World so `golden.test.ts` can check what each run went through.

## Zero allocation and the hot-path rules

The allocation guard (`packages/core/test/world/world-gimmicks-alloc.test.ts`, its own file) runs
a shooting, weaving KESTREL over regenerating tissue it keeps breaking, swinging blocks, an armed
trigger it keeps crossing, holds and diagonal pans and a suction pull — spawns stay out of the
window (each coroutine allocates its generator, D29). What keeps it at zero:

- Every table is a fixed typed array (damage entries, block slots, field and chain slots, the
  change ring, keep-out bounds); positions handed across calls are whole pixels
  (`Math.floor(x) | 0`, `Math.ceil(x) | 0` for the keep-out boxes and block edges).
- Points are passed as the objects that hold them — `runner.probe(ship)` reads `x` / `y` itself.
- A condition checked every tick is mover state, not a script loop: the rock's proximity trigger
  lives in the `Ballistic` mover, its landing wakes the sleeping script once.
- The renderer follows in-place changes through counters and a ring of indices
  (`TerrainChanges`) instead of re-scanning the grid or collecting a dirty list.
- The only closure is in `StageGimmicks.clear` (the restart's block respawn — a cold path).

## The `gimmick-range` dev stage

`content/stages/gimmick-range.stage.json` (GIMMICK RANGE, 3,200 px, checkpoints at 0 / 1,200 /
2,400) with `content/enemies/gimmick-range.enemies.json`, on a floor and ceiling (heightfield) with
RLE rows over them: bubbles and three falling rocks around a destructible **brick pillar** (tile
columns 60–63, world x 480–511), a volcano and a swinging block, a **hold** at x 1,000 (180 ticks)
that pans the camera **down** 72 px into a dip (brick posts at its bottom) with a suction pod, a
**region trigger** over the dip's floor (flag `took-low`) choosing the **low** or **high** branch's
enemies at 1,560–1,620, a **diagonal pan** back up (`yOver` 300 from 1,400), a tentacle, a
**4 px/tick** section (1,900–2,300) past regenerating **tissue** walls hanging from the ceiling and
standing on the floor, an eight-cube **rush**, two more blocks and a second tentacle. Eight pixel-map enemy sprites (`enemies/rock`, `lava`, `volcano`,
`bubble`, `bubble-small`, `suction`, `tentacle`, `rush-cube`), the engine sprite
`gimmicks/chain-link` and three generated `terrain-a` frames (brick, cube, tissue in
`scripts/assets/procedural/terrain.mjs`) draw it. `?stage=gimmick-range` plays it; the stage
runtime integration test plays it to `stageClear` and after a restart at each checkpoint, like
every shipped stage.

## Importing a Tiled map (`pnpm content:tiled`)

`scripts/content/tiled-import.mjs` converts a Tiled JSON map (`.tmj`: orthogonal, not infinite,
8 × 8 px tiles) into stage content. The output is ordinary content — `loadContent` validates it
like a hand-written stage; the importer only translates.

```sh
pnpm content:tiled levels/brine.tmj                  # → content/stages/<id>.stage.json (+ content/paths/<id>.paths.json)
pnpm content:tiled levels/brine.tmj --print          # write nothing, print the JSON
pnpm content:tiled levels/brine.tmj --id zone-b --stages /tmp/out --paths /tmp/out
pnpm format && pnpm content:check                    # house style, then validate
```

| Tiled | Stage JSON |
|---|---|
| Map properties `id`, `name`, `tileset` (content id, default `terrain-a`), `musicStage` / `musicBoss`, `length` (default map width − 384), `speed` (the key added at x 0 when none) | The header |
| The tile layer `terrain` (else the first) — array or CSV data | `tilemap.rle`, one row per map row; gid → content tile id `gid − firstgid + 1` (the Tiled tileset lists its tiles in the content tileset's order); flipped / rotated tiles and compressed / base64 layers are errors |
| Objects by class (`class`, or `type` before Tiled 1.9) with custom properties as fields | `spawn` / `formation` at `x = max(0, obj.x − 400)` (`screenX` when nearer the start), `y` made **camera-relative**; `warning`, `boss`, `music`, `speed`, `flag`, `end` at `obj.x`; `camera` keys; `checkpoint`s; `trigger` rectangles (armed when the region enters the view, or at `armX`); `block` rectangles (appearing 16 px past the right edge); `branch` declarations |
| Any object with a polyline | A `paths` entry (id = the object's name, points relative to the first, rounded to 1/100 px) |

Unknown classes are errors (a typo never drops an enemy silently). Events are sorted by `x`, ties
in file order. Because a spawn's `y` is relative to the camera but Tiled objects sit at world
positions, the importer subtracts the camera y the imported keys give when the event fires —
`cameraYAt(keys, x)` follows the runner (keys before `x`, plus the key at 0; a `yTo` pan starts
where the previous one left the camera; `yOver` pans interpolated; timed `yTicks` pans counted as
finished). A spawn that may fire while a timed pan is still running gets a **warning** on stderr
(the files are still written) — move it, or make the pan diagonal or part of a hold. Blocks and
triggers keep their world coordinates. The pure `convertTiledMap(map, { id? })` → `{ stage, paths,
warnings }` is what the tests call; the committed fixture `test/scripts/content/fixtures/tiled-sample.tmj`
must convert to exactly `tiled-sample.stage.json` / `.paths.json`, and a test runs the real
`StageRunner` on the imported stage and checks every spawn lands within 1 px of its object's world
y.

## Using it headlessly

```ts
import {
  ENGINE_SPRITES, KNOWN_SCRIPT_IDS, TerrainHit, createInputSnapshot, createWorld, loadContent,
  resolveGameConfig, stepWorld,
} from '@shmup/core';
import { readContentFiles } from '../../vite.shared.js';

const { db } = loadContent(readContentFiles(), {
  knownScripts: KNOWN_SCRIPT_IDS,
  extraSprites: ENGINE_SPRITES,
});
const world = createWorld(resolveGameConfig({ stage: 'gimmick-range', seed: 1 }), db);
world.debugFlags.godMode = true;
const input = createInputSnapshot();
const runner = world.stage!;
const terrain = world.gimmicks.destructible!;

// Four hits on the brick pillar (tile column 60, row 15; brick = hp 4, 10 points).
for (let i = 0; i < 4; i++) world.gimmicks.hitTerrain(484, 124, 1, 0); // last → TerrainHit.Destroyed
terrain.destroyed; // → 1; world.scoring.board.scores[0].score → 10

while (world.camera.x < 1000) stepWorld(world, input);
stepWorld(world, input);
runner.holding; // → true: the hold key at 1,000 stops the camera for 180 ticks

const stage = db.stages[db.stageIndex.get('gimmick-range')!];
runner.setFlag(stage.flagNames.indexOf('took-low'), true); // what the region trigger does
runner.eventActive(stage.events.findIndex((e) => e.branch === 'low')); // → true

runner.restartAt(0); // the rollback: the pillar stands again
terrain.destroyed; // → 0; terrain.resets → 1
```

## Extending it

| Want | Do |
|---|---|
| A destructible or regenerating tile | Give a colliding tile `hp` (and `regen`, `score`) in its tileset and an art frame; nothing else changes. Keep regenerating walls where a ship can back off — rock never grows into a ship, but it does close a gap behind it |
| A new gimmick behaviour | `defineBehavior` in `core/behaviors` (appended to `DEFAULT_BEHAVIOR_DEFS`); keep per-tick motion in a mover, use the `ScriptApi` gimmick calls; a new World-side service goes into `StageGimmicks` (fixed typed-array slots, owner slot **and** spawn tick, cleared in `clear()`, hashed in `mixGimmicks`, drawn in `sync()`) and behind a method of `EnemyGimmicks` |
| A new block motion | Extend the `block` event schema, `MovingBlockSystem`'s compiled arrays and `place()` (whole-pixel boxes); remember the restart respawn |
| A trigger shape other than a rectangle | Compile it next to `triggerX0…` in `compileStage` and test it in `probe()`; keep the ordinal ≤ 32 (one mask) |
| Another camera-key feature | See [stage-runtime.md](stage-runtime.md#extending-it): compiled array, `applyKey` **and** the restart replay, new `StageSlot`s appended |
| Branches that persist between zones | The zone map of M2-10 (run-state flags); stage flags stay per stage |
| Another Tiled class | A branch in `convertTiledMap`, its fields list, the module docblock, the fixture map and its expected JSON |

## Tests

| File | Covers |
|---|---|
| `packages/core/test/collision/destructible.test.ts`, `destructible-edge.test.ts` | Damage, breaking, scores via `lastTile`, heal and regrow timers, keep-out (inclusive edges, every rectangle), `place`, `restore`, the change ring (wrapping, resets), a full table, a zero-capacity table, NaN / infinite / negative amounts; `TerrainBlocks` in every query, freed slots, hazard vs solid, tiles nearer than blocks |
| `packages/core/test/data/stage-advanced-data.test.ts`, `stage-advanced-data-edge.test.ts` | Tile `hp` / `regen` / `score` and their tables, `hold` / `yOver` rules, branches, `trigger` and `block` events and every new issue, flag ids from branches and triggers, the `ballistic` mover spec |
| `packages/core/test/stage/stage-advanced.test.ts`, `stage-advanced-edge.test.ts` | Holds (one-tick, at x 0, in a row, with a brake, restarts on and during them), diagonal pans (upward, frozen by a lock, cancelled by a timed key, overlapping pans restarted against live play), 16 px/tick sections, branch gating (flag events, triggers, `eventActive`, `setFlag` bad ids and bit 31), triggers (overlaps, `until`, NaN probes, restart re-arming and restored flags in timeline order) |
| `packages/core/test/stage/stage-systems-edge.test.ts` | `StageGimmicks` and `MovingBlockSystem` directly: fields, chains, owners replaced in their slots, block despawn and respawn, the keep-out of tilesets without `hp` |
| `packages/core/test/patterns/patterns-ballistic.test.ts`, `patterns-ballistic-edge.test.ts` | The trigger, gravity and `maxFall`, the three landing rules against floors, ceilings and walls |
| `packages/core/test/enemies/enemies-gimmicks-edge.test.ts` | `destroy`, landing wakes, `setMoverOf`, the script API without a gimmick host, death callbacks (not on Mega Crash) |
| `packages/core/test/behaviors/behaviors-gimmicks.test.ts`, `behaviors-gimmicks-edge.test.ts` | Every gimmick behaviour: rocks, splits, lobs (seeded), suction, the tentacle's lunge / pull / retract / chain, the cube rush placing cubes and shattering without a tile |
| `packages/core/test/weapons/weapons-terrain-edge.test.ts` | Straight shots, laser heads, Spread Bombs and missiles hitting destructible tiles, credit to the shooter |
| `packages/core/test/world/world-gimmicks.test.ts`, `world-gimmicks-edge.test.ts`, `world-gimmicks-alloc.test.ts` | The World: shots breaking tiles (SFX, explosion, points, the change log), rollback on restart, regrowth, blocks as terrain for the ship / shots / view, triggers selecting a branch, `gimmick-range` deterministic with restarts; the allocation guard |
| `packages/core/test/debug/debug-edge.test.ts` | `hashWorld` changes with the gimmicks' state |
| `packages/render-pixi/test/layers/layers-terrain-changes.test.ts`, `layers-terrain-changes-edge.test.ts` | Only logged cells in view re-textured, a reset or an overflowing gap redraws, a view without `changes` |
| `test/scripts/content/tiled-import.test.ts`, `tiled-import-edge.test.ts` | The fixture map equals the expected JSON, `cameraYAt`, spawns in vertical / diagonal sections vs world-coordinate blocks and triggers, the timed-pan warning, the real runner placing every spawn on its object's world y, every error |
| `test/integration/stage-runtime.test.ts` | `gimmick-range` like every shipped stage: corridor, clear spawns, `stageClear`, restarts |
| `test/golden/` | `gimmick-range-god`, `gimmick-range-weaver`, `gimmick-range-deaths` (and what each run went through) |
| `test/e2e/gimmicks.spec.ts` | In Chromium: `?stage=gimmick-range` boots without atlas warnings, draws the brick pillar, breaking it in the sim takes it off the next frame, the rollback draws it again |

## Gotchas

| Symptom | Cause |
|---|---|
| An enemy placed in Tiled appears too high / low in a vertical section | Spawn `y` is camera-relative; the importer corrects for the imported keys' pans, but a spawn during a timed `yTicks` pan is only approximated — read the importer's warnings |
| A block event does nothing | The stage has no tilemap (a load issue), all 16 slots are taken, its branch is not taken, or it despawned: its left edge is `x + screenX` in **world** x, not camera-relative |
| Broken tiles are back after a death | The rollback restores the stage's own tiles on every checkpoint restart, jump and continue — by design |
| A regenerating wall never closes | A ship's terrain box overlaps the cell (it waits), or the cell was broken while the 512-entry table was full |
| A flag from a region trigger differs after a restart | The restart applies a fired trigger at its place in the timeline (an approximation) — keep a trigger's flag clear of other `flag` events |
| `ScriptApi.pull` / `chain` / `placeTile` returns `false` | No gimmick host (a bare `EnemySystem`), all slots taken, no terrain, or a ship in the cell |
| A bubble did not split | It died in a Mega Crash or blue-capsule clear, escaped, or its enemy spec has no `child` |
| Golden hashes changed after adding an engine sprite | Engine sprites are interned into the sorted sprite table; `gimmicks/chain-link` shifted later ids |
| The renderer misses a changed tile | It reads the change log only for cells a ring slot shows; a cell off screen is read when it scrolls in. A custom `TerrainView` without `changes` never refreshes in place |

## Next steps that build on this page

- **M2-08** (done) — raster effects and palette cycling can target the terrain layer (lava,
  water, glowing tissue); the block batch sits on `LayerId.Terrain` like the grid, so a terrain
  filter covers the blocks too ([presentation-polish.md](presentation-polish.md)).
- **M2-09** (done) — battleship raids: `StageRunner.follow` puts the camera on a boss-relative
  target after a brake to a lock, with the timeline (events, keys, checkpoints, trigger disarms)
  held where the follow began ([advanced-bosses.md](advanced-bosses.md#battleship-raids),
  [stage-runtime.md](stage-runtime.md#following-a-target-m2-09)).
- **M2-10** — the zone map, run-state flags beyond one stage, bonus-stage entrances (a marked gap,
  all ground targets destroyed) that can reuse region triggers and the destroyed count.
- **M2-11 … M2-14** — the zones: BRINE NEBULA (splitting bubbles), MAGMA DEEP (volcanoes, falling
  rocks, a destructible maze), CELL VAULT (tissue walls, tentacles), PRISM LABYRINTH (the cube
  rush), IRON CITADEL (moving floors) — authored by hand or in Tiled.
