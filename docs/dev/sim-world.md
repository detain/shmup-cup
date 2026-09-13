# The simulation World: tick pipeline, player ship, collision, state hash

How one gameplay session is simulated inside `@shmup/core`: the `World` object, the fixed
9-phase tick that `stepWorld` runs, the KESTREL's movement, the collision toolkit, the state
hash that golden replays will compare, and the allocation guard that keeps all of it free of
garbage. Built in plan step **M1-06**; later steps fill the empty tick phases without
changing their order — **M1-07** filled phase 3 with the stage runner and added terrain
contact to phase 6 (the stage runtime itself is [stage-runtime.md](stage-runtime.md)), and
**M1-08** added the enemy system to phases 3–9 (the enemies themselves are
[enemies-and-behaviors.md](enemies-and-behaviors.md)), **M1-09** the enemy bullets and
lasers to phases 4–8 and the session's rank (the bullet system is
[bullets-and-patterns.md](bullets-and-patterns.md)), and **M1-10** the player weapons and
Options to phases 2 and 5–9 (the weapon system is
[weapons-and-options.md](weapons-and-options.md)), **M1-11** the power-ups to phases 2, 3 and
5–9 ([powerups-and-shields.md](powerups-and-shields.md)), **M1-12** the life cycle (death,
respawn, lives, game over), the score and the game-feel timers to phases 2, 3, 7 and 9
([death-and-scoring.md](death-and-scoring.md)), and **M1-13** the boss, its WARNING and its
death sequence to phases 3–7 and 9 ([bosses-and-warning.md](bosses-and-warning.md)), and
**M2-01** the rank recomputed at the end of phase 3, the extends after each crediting (phases 3
and 7) and continues between ticks ([difficulty-and-rank.md](difficulty-and-rank.md)), and
**M2-05** Direct mode inside the same phases — the Speed toggle in phase 2, family volleys in
phase 2, colour items instead of capsules in phases 3 and 7, the Direct death penalty and power
rank ([direct-mode.md](direct-mode.md)).

This page is the *how and why*. Exact signatures are in
[api-reference.md](api-reference.md#world--the-gameplay-session-and-the-tick-pipeline); the
TSDoc in `packages/core/src/{world,player,collision,debug}/index.ts` is the authoritative
reference. The deterministic primitives the World is made of (RNG streams, event queue, pools)
are in [engine-foundations.md](engine-foundations.md); how the World reaches the screen is in
[rendering-and-shell.md](rendering-and-shell.md).

Background: `shmup_feat.md` §3 (60 Hz fixed step, pixel-perfect camera), §5 (player ship),
§18 (hit-stop), §22 (architecture, tick order, collision, determinism); `shmup_tech.md` §4.5
(custom collision, no physics engine); plan §3.2 (tick order), §3.4 (render contract), §1.4
(allocation guard) and decisions **D3** (speed levels), **D4** (diagonals × 0.7071), **D20**
(384×200 playfield between two HUD bars), **D26** (world-space coordinates, the player clamped
to the camera view), **D36** (the KESTREL).

## The picture at a glance

```text
game.step()                                        core/game (one fixed tick)
 ├─ input = platform.input.poll()                   the only way input enters the sim
 └─ stepWorld(world, input)                         core/world
     ├─ 1 input      readPlayerIntent × 2           world.intents: masks + moveX / moveY
     ├─ 2 players    updatePlayer × 2               ride the scroll, move, clamp, bank, fly-in, dying → dead;
     │               lifecycle                      respawns after the dead time, game over (M1-12)
     │               powerups.updatePlayers()       PowerUp press → equip the meter (M1-11)
     │               weapons.updatePlayers()        option trails, autofire timers, firing (M1-10)
     ├─ 3 stage      powerups.beginTick()           late drops → capsules (M1-11)
     │               scoring.beginTick()            late kills → score (M1-12)
     │               bosses.update()                WARNING / intro / death-sequence timers (M1-13)
     │               stage.tick() | camera += (vx, vy)  keys, ramps, pans, locks, brake, timeline events;
     │               enemies: spawn events, due formation members; warning / boss → bosses
     ├─ 4 scripts    enemies.runScripts(), bosses.runScript()  wake the coroutines; they fire bullets / lasers
     ├─ 5 movement   enemies.move(), bosses.move(), bullets.update(), weapons.update(), powerups.update()
     │               movers; the boss and its parts; bullets / lasers / shots move, cull; items: magnet, cull
     ├─ 6 collision  grid.begin → enemy + boss-part hurtboxes → build → ships × enemies / parts (Contact);
     │               weapons.collide(grid) (shots × enemies / parts); bullets.collidePlayers() (Bullet / Laser);
     │               terrain box × tiles; powerups.collide() (items × pickup boxes)
     │               every playerHit asks the ship's Force Field first (M1-11)
     ├─ 7 damage     weapons.applyHits()           damage, clinks, kills; boss parts → bosses.damagePart
     │               bosses.resolve()              boss phase changes (M1-13)
     │               powerups.resolve()            pickups, Auto Power-Up, Mega Crash, shield
     │                                             i-frames + events, drops → capsules (M1-11)
     │               scoring.resolve()             kills, formation bonuses, pickups → score (M1-12)
     │               killShip × ships hit this tick  the death sequence + penalty (M1-12)
     ├─ 8 removal    pools.flushAll(), enemies.flush()  deferred frees
     ├─ 9 fx         tickFx, syncWorldView          hit-stop (frozen ticks) / shake / flash timers; mirror batches
     └─ world.tick++
game.renderFrame().world === world.view             read by render-pixi once per displayed frame
hashWorld(world)                                    FNV-1a over the simulated state (tests, replays)
```

## The World (`core/world`)

`createWorld(config, content)` allocates everything a session needs; `stepWorld(world,
input)` advances it by exactly one tick and never allocates. For **bare gameplay** (no
`GameOptions.scenes` — tests, tools, the shell's dev scenes) `createGame` creates one World per
session (`game.world`) and calls `stepWorld` from `game.step()`. With the **scene flow** (M1-16,
what the apps run) the game scene decides when a World exists: a fresh one per game start and
RETRY STAGE, stepped only while the game scene is on top, all of them pushing into the game's one
event queue (`WorldOptions.events`) — [scenes-and-ui.md](scenes-and-ui.md#worlds-events-and-the-frame).

| Field | What it is |
|---|---|
| `config`, `content` | The resolved `GameConfig` and the validated `ContentDb` the session was created with |
| `ship` | The `PlayerShipSpec` both players fly, chosen once by `resolvePlayerShip(content)` |
| `tick` | Ticks simulated so far; while a tick runs it is that tick's index (`game.state.tick` advances with it) |
| `rng` | `{ gameplay, cosmetic }` streams seeded from `config.seed` (nothing draws yet) |
| `events` | The presentation event queue — the same object as `game.events`, drained by the host once per frame |
| `players`, `intents` | Exactly `MAX_PLAYERS` (2) ships and their per-tick intents; index 0 = player 1 |
| `camera` | `WorldCamera { x, y, dx, dy, vx, vy }` — also the view's `CameraView`; a class instance from `createStageCamera()` (see [stage-runtime.md](stage-runtime.md#gotchas)) |
| `stage`, `terrain`, `parallax` | The `StageRunner` of `config.stage`, the stage's collision `TerrainMap` (a private copy of the tiles) and its `StageParallaxView` — each `null` in free flight (`stage: null`) or when the stage has no tilemap / bands (M1-07) |
| `bullets`, `rank` | The `BulletSystem` (M1-09): the `enemyBullets` (512) and `enemyLasers` (16) pools, the enemy-bullet batch and the laser view — since M2-02 also the `cancelPoints` pool (512 point items, the `ITEMS` batch `pointBatch`) and the bending laser table (`bending`, 8 × 64 nodes, `view.bendingLasers`); the session's rank (hashed), which scales bullet speeds and fire intervals ([bullets-and-patterns.md](bullets-and-patterns.md)) — constant in M1; since M2-01 recomputed from `rankInputs` (the config's `rankBase` / `rankGrowth`, `loop` / `stage`, the strongest ship's `power`, `special` — hashed) at the end of phase 3 by `updateWorldRank` ([difficulty-and-rank.md](difficulty-and-rank.md#rank-corerank)) |
| `patterns` | The `PatternVm` (M2-02): the pattern DSL's interpreter — 64 enemy emitters and 512 bullet program runners in typed arrays (hashed: the runners in use), installed as the bullet system's program runner ([pattern-dsl.md](pattern-dsl.md#the-interpreter-patternvm)) |
| `continuesUsed` | Continues used this game (M2-01, hashed): `continueWorld` counts them, `canContinue` compares with `config.continues` ([difficulty-and-rank.md](difficulty-and-rank.md#continues)) |
| `weapons` | The `WeaponSystem` (M1-10): the `playerShots` pool (96), one `Loadout` (`config.loadout` applied at creation) and one `OptionGroup` per player, autofire timers, the hit list, the player-shot and Option batches; since M2-03 the config's arsenal (`weaponPreset` / `weaponEdit` → `roleWeapons` — a bad Weapon Edit makes `createWorld` throw `RangeError`) and each player's Free Way direction ([weapons-and-options.md](weapons-and-options.md), [meter-arsenal.md](meter-arsenal.md)) |
| `powerups` | The `PowerUpSystem` (M1-11): one `PowerMeter` per player, the `items` pool (32 capsules), pending Mega Crashes, the tick's pickup outcomes, the item and shield batches; the shields themselves live on the ships (`PlayerShip.shield`) ([powerups-and-shields.md](powerups-and-shields.md)) |
| `scoring` | The `ScoringSystem` (M1-12): `board.scores[p]` (`score`, `displayDirty`; `nextExtend`, `extendsEarned`, `continues` since M2-01), the session `hiScore`, the credit counters ([death-and-scoring.md](death-and-scoring.md#score-corescoring)) |
| `bosses`, `laserSources` | The `BossSystem` (M1-13): one boss slot with 16 parts, the WARNING (`view.warning`), the parts' batch; every laser source by id — the 64 enemies, then the 16 parts — so lasers can stay attached to either; `createWorld(config, content, { bossBehaviors })` swaps the boss roster ([bosses-and-warning.md](bosses-and-warning.md)) |
| `enemies` | The `EnemySystem` (M1-08): 64 enemy slots, the formation table, the tick's kill / drop outcomes, the ground / air sprite batches (and since M2-04 the carried-Options batch of the Option Hunters) — spawned by the stage's `spawn` / `formation` events ([enemies-and-behaviors.md](enemies-and-behaviors.md)); `createWorld(config, content, { behaviors })` swaps the behaviour registry in tests |
| `status` | `WorldStatus`: `'playing'` \| `'bossWarning'` \| `'stageClear'` \| `'gameOver'` (`'stageClear'` once a stage's `end` event fired; `'gameOver'` once every active ship is out — M1-12, from `playing` / `bossWarning` only; `'bossWarning'` for the 180 ticks of a boss WARNING — M1-13, from `playing` only, back to `playing` when the boss enters; the boss's death sequence also ends in `'stageClear'`) |
| `hitStop` | Remaining hit-stop ticks — raised by `core/fx` `requestHitStop` (the player's death since M1-12) |
| `fx` | `FxState` (M1-12): the shake and flash timers and `frozen` (this tick started frozen) — [death-and-scoring.md](death-and-scoring.md#game-feel-corefx) |
| `debugFlags` | The session's debug switches (`WorldOptions.debugFlags` — `createGame` passes `game.debug`, a World alone gets `createDebugFlags()`): `godMode` (read by `playerHit` — the only one that changes a tick), `showHitboxes`, `showGrid`, `frameAdvance`, `slowMo`, `overlay` (M1-19 — [debug-and-replays.md](debug-and-replays.md)) |
| `pools` | The `PoolRegistry` of every SoA pool the systems create |
| `grid` | The broad-phase `SpatialGrid` over the camera view + `GRID_MARGIN` (64 px) on each side |
| `playerBatch`, `view` | The players' mirror `SpriteBatch` (`LayerId.Player`) and the `WorldView` the renderer draws |

### The tick pipeline

`WORLD_PHASES` is a frozen array of `{ phase, name, runsDuringHitStop, run }` entries in the
plan §3.2 order; `WorldPhase` gives each position a name (`Input` 0 … `Fx` 8) and
`WORLD_PHASE_NAMES` its string. `stepWorld` runs the array front to back — an explicit list
instead of calls scattered through `game.step()`, so the order is data a test can check and a
debug overlay can profile.

| # | Phase | Today | Filled by |
|---|---|---|---|
| 1 | `input` | copies each player's `PlayerInput` into its `PlayerIntent` (all slots, active or not) | — |
| 2 | `players` | `updatePlayer` for each ship, then the life cycle (`lifecycleSystem`, M1-12: respawn every ship whose dead time is over and that has a life left — the `arcade` penalty restarts the stage at its last checkpoint first; `gameOver` when every active ship is out), then `weapons.updatePlayers()` — recount live shots (stride `WEAPON_ROLE_SLOTS` since M2-05), count the autofire timers down, per ship the option trail (reset on a fly-in's first tick, record on movement input and fly-in ticks, hide while not `alive`; since M2-04 `OptionGroup.steer` then the type's placement — Snake, Formation, Rotate) and firing: every shooter (ship, then Options) fires its main weapon and missile when its timer is 0 and its cap has room (M1-10) — in Direct mode (M2-05) the main family's level volley and the sub family's on those timers | M1-11 (done: `powerups.updatePlayers()` between the two — the `PowerUp` press equips the highlighted meter slot, so a new weapon fires this tick; since M2-04 it then places each ship's shield pods; in Direct mode — M2-05 — the `Speed` press cycles the speed level instead), M1-12 (done: respawn, game over) |
| 3 | `stage` | `powerups.beginTick()` (drops of kills made between ticks become capsules — M1-11), `scoring.beginTick()` (their kills and bonuses are credited — M1-12), `enemies.beginTick()` (reset the tick's outcomes), `bosses.update()` (the WARNING pulses and the boss's entry, the intro, the phase clock, the death sequence — M1-13); with a stage: `world.stage.tick()` — camera keys, ramps, pans, locks, then the due timeline events through the World's hooks (`spawn` / `formation` → `enemies.onStageEvent`, `warning` / `boss` → `bosses.startWarning` / `startBoss`); in free flight: moves the camera by its scroll velocity, recording the step; then `enemies.spawnPending()` (formation members due this tick); last, `updateWorldRank(world)` — the rank for this tick's scripts (M2-01). `scoring.beginTick()` also gives the extends its credits reached (M2-01) | M1-07, M1-08, M1-13, M2-01 (done) |
| 4 | `scripts` | `enemies.runScripts()` — resumes the behaviour coroutines whose `wakeTick` has come (M1-08); they fire bullets and lasers through the `ScriptApi` primitives (M1-09) — since M2-02 also bending lasers and DSL patterns (`pattern.loop` steps its emitter in `world.patterns` to the pattern's next `wait`); then `bosses.runScript()` — the boss phase's coroutine (M1-13) | M1-13 (done) |
| 5 | `movement` | `enemies.move()` — age, hit flash, camera ride, movers, leader tracks, animation, on-screen / settle / despawn rules (M1-08); then `bosses.move()` — the intro fly-in or the fight motion, the camera ride, the part transforms (M1-13); then `bullets.update()` — bullets ride the camera, delay, run their DSL program when it is due (M2-02), change / home / accelerate (timed terms land on their target — M2-02), move, die outside the view ± 16 px or on terrain; lasers follow their enemy or boss part (it has already moved) and step their phases (M1-09); bending lasers ride the camera, fly (homing) and record a node or shrink; point items drift, fly to their player's score and credit `bulletCancel` points (M2-02); then `weapons.update()` — shots ride the camera and fly by behaviour (straight / Double, laser head and length, missile fall / slide), die outside the view ± 16 px or on terrain; cooldown tables count down (M1-10); then `powerups.update()` — items age, feel the pickup magnet, die outside the view ± 32 px (M1-11) | — |
| 6 | `collision` | `grid.begin(camera − 64)`, `enemies.insertColliders(grid)` (hurtboxes, id = slot), `bosses.insertColliders(grid)` (part hurtboxes, id = 64 + part — M1-13), `grid.build()`, `enemies.collidePlayers(grid)` → `playerHit(ship, PlayerHitCause.Contact, …)` (M1-08), `bosses.collidePlayers()` (the ships × the parts — M1-13); `bullets.collidePlayers()` — bullet circles, active laser capsules and (M2-02) bending laser circle chains × each ship's hurt radius → `playerHit(…, Bullet / Laser, …)` (M1-09); `weapons.collide(grid)` — each shot's box against the enemy and boss-part hurtboxes in the grid → this tick's hit list (M1-10, parts M1-13); each alive ship's terrain box against the stage terrain → `playerHit(…, Terrain, …)` (M1-07); `powerups.collide()` — every item's circle × each alive ship's pickup box → the tick's pickups (M1-11). Every `playerHit` hands the hit to the ship's Force Field first (`core/shields`, M1-11) | — |
| 7 | `damage` | `weapons.applyHits()` — armour → `Clink`, else `enemies.damage(enemy, damage, player)` (hit flash, deaths, drops, formation accounting, the kill record with its killer); non-piercing shots die, piercing ones start their per-enemy cooldown (M1-10); a hit on a boss part goes through `bosses.damagePart` (clink, damage, destruction, the death sequence — M1-13); then `bosses.resolve()` — the boss's phase changes (M1-13); then `enemies.huntOptions()` — every live Option Hunter takes the Options it touches (M2-04; before the power-ups, so a Mega Crash this tick frees them again); then `powerups.resolve()` — the pickups advance the meters (Auto Power-Up), armed Mega Crashes detonate, the shields' i-frames count down and their hit / break events are pushed, the tick's enemy drops become capsules (M1-11 — in Direct mode, M2-05, `capsule` / `powerup` drops become the stage's planned colour items and pickups run `collectDirect`); then `scoring.resolve()` — kills, formation bonuses and pickups credited to their players (M1-12), then the extends reached (+1 life, capped at 9, `ExtraLife` — M2-01); then the **death sequence** of every active `alive` ship hit this tick (`hitTick === tick`): `killPlayer`, the explosion / debris / rumble / music-duck events, hit-stop 8, a medium shake, `bullets.cancelAll(Sparkle)`, the death penalty (M1-12; `applyDirectDeathPenalty` in Direct mode — M2-05) | — |
| 8 | `removal` | `pools.flushAll()` (the enemy bullet and laser pools since M1-09, the player shots since M1-10, the cancel point items since M2-02), `enemies.flush()` (removed enemy slots → free) | — |
| 9 | `fx` | `tickFx` — the hit-stop −1 on frozen ticks, the shake / flash timers −1 except on their request's tick (M1-12); `syncWorldView` (parallax, enemy batches, the boss's parts batch — M1-13, player-shot and Option batches, item and shield batches, the Options Option Hunters carry — M2-04, player batch) | M1-14 (drawing shake / flash / particles from the events) |

**Hit-stop.** `stepWorld` reads `world.hitStop > 0` once, at the start of the tick, and records
it in `world.fx.frozen`. While it is set, only the phases with `runsDuringHitStop` — `input` and
`fx` — run; `fx` (`tickFx`) decrements the counter **only on such frozen ticks**, and the tick
counter still advances. A hit-stop of `n` — `requestHitStop(world, n)`, or `hitStop = n` between
ticks — therefore freezes exactly `n` ticks (requested during tick `t`: `t + 1 … t + n`), the same
way on every machine, and replays stay in sync. (Before M1-12 phase 9 also counted the request's
own tick, so a mid-tick request froze one tick less.)

**Adding a system.** Write it as a `WorldSystem` (`(world, input) => void`, allocation-free)
and call it from the phase function it belongs to in `world/index.ts`. Never reorder
`WORLD_PHASES` and never run a system from outside `stepWorld` — the order is part of the
replay format.

### The camera

`camera.x` / `camera.y` are the world coordinates of the playfield's top-left corner
(world `y` maps to screen `y − camera.y + PLAYFIELD_Y`, D20). With a stage, the stage runner
moves it in phase 3 along the stage's camera path and writes the step into `dx` / `dy` and
`vx` / `vy` ([stage-runtime.md](stage-runtime.md#the-camera-path)). In free flight
(`config.stage === null`) the stage phase copies the scroll velocity `vx` / `vy` (px/tick,
0 = static) into `dx` / `dy` and adds it to the position; tests set `camera.vx` directly. The
players phase runs *before* the stage phase, so a ship rides along with the step the camera
made in the previous tick.

### The pool registry

Systems create their SoA pools at world creation and register them:
`world.pools.register('enemyBullets', createSoaPool(512, schema))` returns the pool (throws
for a duplicate name). The registry keeps each pool's field arrays in sorted field-name order
(the state-hash order), flushes all pools in phase 8 (`flushAll`) and empties them on a stage
restart (`clearAll`). A pool that is not registered is never flushed or hashed.

### The view

`world.view` is created once — `{ camera, parallax, terrain, batches: [groundEnemies,
airEnemies, playerShots, options, playerBatch, enemyBullets, shields, items, cancelPoints,
bossParts, carriedOptions], lasers, bendingLasers, warning }` (the point items' batch and
`bendingLasers` since M2-02 — both the bullet system's; the carried Options since M2-04 — the
enemy system's `carriedBatch`, `LayerId.AirEnemies`, appended last so the grey Options draw over
the enemies), where `parallax` /
`terrain` are the stage's views (`null` in free flight), the two enemy batches belong to the
enemy system (M1-08), the player-shot batch (`LayerId.PlayerShots`) and the Options' batch
(`LayerId.Player`, listed before the ships so the Options draw below them) to the weapon system
(M1-10), and the enemy-bullet batch (the bullet pool itself) and `lasers` (the laser pool as a
`LaserView`) to the bullet system (M1-09), the shields' batch (`LayerId.Player`, listed after
the ships so the Force Field draws over them) and the items' batch (`LayerId.Items`) to the
power-up system (M1-11), and the boss parts' batch (`LayerId.AirEnemies`, appended last so the
parts draw over the air enemies) and `warning` (the `WarningView`) to the boss system (M1-13) —
and keeps its identity
forever, so the renderer binds it once. Phase 9 (and `createWorld` itself, so the first frame
already shows the ship) scrolls the parallax bands with the camera, refills the enemy batches
(`enemies.sync()`: live, non-ghost enemies with their animation frame, facing, ceiling flip and
hit flash) and the players' mirror batch with `syncWorldView`: a ship is drawn when its slot is active, it is neither
`dying` nor `dead`, and the spec has a sprite (`spriteId >= 0`); while `invulnTicks > 0` it
blinks (`SpriteFlag.Hidden` four ticks on, four off). The frame is the bank frame (below).

SoA-backed batches are the pools' own arrays (the enemy bullets since M1-09); object-based
systems (enemies since M1-08, the boss's parts since M1-13) and pools whose entries draw as several sprites
(the player shots since M1-10: a laser is a row of 8-px segments) fill a mirror batch in
phase 9 like the players do. A new
batch must be in `view.batches` from the start — see
[rendering-and-shell.md](rendering-and-shell.md#gotchas).

## The player ship (`core/player`)

`PlayerShip` is a plain object (two per session): `slot`, `active`, `x` / `y` (world-space
centre, sub-pixel), `state`, `stateTicks`, `speedLevel`, `invulnTicks`, `bank`, `device`,
`lives` (ships including the one in play), `moving`, the last accepted hit (`hitCause`, `hitTick`, `hits` — M1-07) and `shield` (M1-11). The tunables come from `content/player/kestrel.player.json` through
`PlayerShipSpec`:

| Tunable | KESTREL | Used for |
|---|---|---|
| `speeds` | `1.5, 2.0, 2.5, 3.0, 3.5, 4.0` px/tick (D3) | speed per `speedLevel` (clamped to the table) |
| `margins` | left 8, right 8, top 6, bottom 6 | clamp to the camera view minus these |
| `enterTicks` | 40 | fly-in length |
| `bankFrames` | 1 | bank steps each way (frames 0 level, 1 up, 2 down) |
| `hurtRadius`, `terrainBox`, `pickupBox` | 1.5; 5×3; 8×6 (half sizes) | collision: the terrain box since M1-07, the pickup box since M1-11 (capsules and the magnet), the hurt radius (bullets, contact) since M1-09 — each hit a death since M1-12; since M2-04 every hurt-circle test uses `hurtRadius × shield.hurtScale` (Reduce shrinks it to ⅓ / ⅔; the terrain box never changes) |
| `respawnInvulnTicks` | 150 | invulnerable ticks from the moment a respawn's fly-in ends (blinking from the start of the fly-in — M1-12; 120 before) |
| `mode`, `startSpeedLevel` (M2-05) | `meter`, 0 | the ship's power-up model (the ship select sets `GameConfig.powerUpMode` from it) and the speed level a Direct-mode session starts at — the MANTA (`manta.player.json`): `direct`, speeds `1.75, 2.25, 2.75`, starting at 1 (2.25 px/tick) |

`resolvePlayerShip(content, id = 'kestrel')` picks the ship — since M2-05 `createWorld` passes
`config.shipId`: that id, else the first ship,
else `DEFAULT_PLAYER_SHIP` — a built-in copy of the KESTREL tunables with `spriteId: -1`, so a
headless test on `EMPTY_CONTENT_DB` simulates the same movement but draws nothing.
`test/integration/world-flight.test.ts` checks that the shipped file, the plan's numbers and
the fallback agree.

### States

`PlayerState` is `'entering' | 'alive' | 'dying' | 'dead' | 'respawning'` (`PLAYER_STATES`
gives the hash code order). `createPlayer(slot, lives)` makes a ship `dead` and inactive;
`createWorld` activates player 1 and calls `spawnPlayer`, which starts the **fly-in**: the ship
is placed at camera-relative `ENTER_START_X` (−24, off-screen) and `SPAWN_Y` (100, the middle of
the playfield), then flies to `ENTER_END_X` (64) on a cubic ease-out over `enterTicks` ticks,
ignoring input, and turns `alive`. `setPlayerState` switches state and restarts `stateTicks`.

**The life cycle (M1-12).** `alive` → a hit → `dying` (`killPlayer`: a life gone; the ship stays
where it was hit for `PLAYER_DYING_TICKS` 24 ticks, plus the death's 8-tick hit-stop) → `dead`
(`PLAYER_DEAD_TICKS` 60) → with a life left the World respawns it (`respawnPlayer`: a
`respawning` fly-in exactly like `entering`, blinking) → `alive` with exactly
`respawnInvulnTicks` (150) invulnerable ticks from the tick control returns; without a life it
stays `dead` (`playerOut`), and when every active ship is out the status becomes `gameOver`.
`dying` and `dead` ships are not drawn. The whole sequence, the penalties and the timings are in
[death-and-scoring.md](death-and-scoring.md).

**Hits.** `playerHit(ship, cause, tick, debugFlags)` is the one entry point for anything that
would kill a ship (`PlayerHitCause`: `Terrain` since M1-07, `Contact` since M1-08 — at most one
accepted enemy contact per ship and tick; `Bullet` and `Laser` since M1-09 — at most one of
each per ship and tick, and an accepted bullet is removed). It ignores inactive ships, ships
that are not `alive` (the fly-in included), ships
with `invulnTicks > 0` and god mode, and otherwise records `hitCause`, `hitTick` and `hits++`
(all hashed) and returns `true` — the ship stays `alive` for the rest of phase 6, and phase 7
of the same tick turns the recorded hit into the death sequence (M1-12). A Force Field on the
ship takes bullets, lasers and contact first (M1-11).

Player 2's ship exists from the start but stays inactive (never updated, never drawn) until
co-op joins it (M2-06); the input phase still reads its intent, so a joining device is known.

### Movement (`updatePlayer`, tick phase 2)

1. **Intent.** `readPlayerIntent` turns the direction bits into `moveX` / `moveY` ∈ {−1, 0, 1};
   Left + Right (or Up + Down) cancel to 0. The input adapters already resolve SOCD and the
   diagonal policy per input profile ([input-profiles.md](input-profiles.md)); this is the
   last safety net.
2. **Ride the scroll.** `x += camera.dx`, `y += camera.dy` — the ship keeps its place on
   screen while the stage scrolls.
3. **Move.** `speed = speeds[speedLevel]`, × `DIAGONAL_SCALE` (0.7071) on each axis when both
   are non-zero (D4), so an 8-way pad never out-dodges the 4-way remote. No inertia: the ship
   stops the tick the input stops. `moving` records whether there was movement input (the
   D26 Option trail of M1-10 records only then).
4. **Clamp** to `[camera.x + left, camera.x + 384 − right] × [camera.y + top, camera.y + 200 −
   bottom]` — the ship can never reach the HUD bars.
5. **Bank** one step per tick towards `moveY × bankFrames`; `playerBankFrame(bank,
   bankFrames)` maps it to the sprite frame (0 level, `1…N` up, `N+1…2N` down — the
   `ships/kestrel` frame order).

Invulnerability counts down in every state; `device` follows the last device that produced
input (for prompts and glyphs later).

## Collision (`core/collision`)

### Shape tests

Plain functions over **scalar arguments** — never `{ x, y }` objects, so the collision phase
allocates nothing. Shapes are **closed**: touching counts as a hit (`distance === r1 + r2`,
boxes sharing an edge), which makes every test symmetric and edge cases deterministic. Only
`+ − × ÷` and `Math.abs` / `min` / `max` are used; distances are compared squared, so results
are bit-identical on every engine.

| Function | Shapes | Intended use |
|---|---|---|
| `circleCircle(ax, ay, ar, bx, by, br)` | circle × circle | enemy bullets × the 1.5-px hurt radius |
| `aabbAabb(ax, ay, ahw, ahh, bx, by, bhw, bhh)` | box × box (centre + half sizes) | enemies × terrain box, shots × enemies |
| `circleAabb(cx, cy, r, bx, by, hw, hh)` | circle × box | bullets × enemies, items × pickup box |
| `capsuleCircle(x1, y1, x2, y2, capsuleR, cx, cy, r)` | capsule (swept segment) × circle | straight lasers |
| `segmentAabb(x1, y1, x2, y2, bx, by, hw, hh)` | segment × box (slab test) | fast shots, line of sight |
| `pointSegmentDistanceSq(px, py, x1, y1, x2, y2)` | helper | squared point–segment distance (a zero-length segment is a point) |

### Layers

`CollisionLayer` bits: `Player`, `PlayerShot`, `Enemy`, `EnemyBullet`, `EnemyLaser`, `Item`,
`Terrain`. `COLLISION_MASKS[layer]` lists what each layer is tested against and is symmetric;
`layersInteract(a, b)` reads it:

| Layer | Collides with |
|---|---|
| `Player` | `Enemy`, `EnemyBullet`, `EnemyLaser`, `Item`, `Terrain` |
| `PlayerShot` | `Enemy`, `Terrain` |
| `Enemy` | `Player`, `PlayerShot` |
| `EnemyBullet` | `Player`, `Terrain` |
| `EnemyLaser` | `Player` |
| `Item` | `Player` |
| `Terrain` | `Player`, `PlayerShot`, `EnemyBullet` |

Options (M1-10) are not a layer: they are invulnerable and pass through terrain. Append new
layers as new bits.

### The broad-phase grid

`createSpatialGrid(width, height, cellSize = 32, capacity = 256)` preallocates a uniform grid
(the World's covers 512×328 px: the playfield plus 64 px on each side, 16×11 cells). Every tick:

```ts
// once, at system creation — a visitor created per query would allocate
const onHit: SpatialGridVisitor = (enemySlot) => { hits[hitCount++] = enemySlot; };

// phase 6 — the World has already called grid.begin(floor(camera) - 64) …
grid.insert(slot, x - hw, y - hh, x + hw, y + hh); // for every enemy box
grid.build();                                       // counting sort: count → prefix sum → fill
grid.query(shotX - 2, shotY - 1, shotX + 2, shotY + 1, onHit); // for every shot
```

- **Queries are exact.** A query visits an entry only when the stored box really overlaps
  the query box (closed), at most once (a per-query stamp array), so the result *equals* a
  brute-force scan over all boxes — a property test checks this for 1,000 random boxes at
  several cell sizes and fractional origins. Callers never re-test the box.
- **Nothing is lost.** Boxes outside the covered area are clamped into the border cells;
  boxes spanning more than 9 cells go to an overflow list every query scans.
- **Order** is cell order, then insertion order — deterministic.
- `insert` returns `false` and counts `dropped` when `capacity` boxes are already in;
  `query` before `build` (after an insert) throws.
- Since M1-08 the enemies insert their hurtboxes (id = enemy slot, whole-pixel bounds) and the
  ships query them for contact; since M1-10 every player shot queries them too
  (`weapons.collide`, a laser with its whole tail-to-head box). Enemy bullets and lasers
  (M1-09) and the items (M1-11) do not use the grid: with at most two ships, brute force per
  ship is cheaper than inserting 512 bullets (or 32 items).

**Terrain** has its own queries over a stage's `TerrainMap` (`terrainAt`, `boxHitsTerrain`,
`terrainRectHit`, `findFloor`, `findCeiling` — pixel-exact and half-open, unlike the closed
shape tests above); they replaced M1-06's placeholder `TerrainQuery` interface and are
described in [stage-runtime.md](stage-runtime.md#terrain-queries).

## The state hash (`core/debug`)

`hashWorld(world)` is FNV-1a (32-bit) over a fixed sequence of values, each number as its
little-endian IEEE-754 double bytes (so the hash is the same on every engine):

1. `tick`;
2. the gameplay and the cosmetic RNG state (4 words each);
3. the camera: `x`, `y`, `dx`, `dy`, `vx`, `vy`;
4. the stage runner: `0` in free flight, else `1` and every slot of `world.stage.state`
   (speed, ramp, pan, lock, cursor, next key / checkpoint, checkpoint, flags, ended, ticks,
   restarts, replay, and since M1-13 the brake — `StageSlot` order);
5. the status code (`WORLD_STATUSES` order), `hitStop` and `rank` (M1-09);
6. per player: `active`, `x`, `y`, the state code (`PLAYER_STATES` order), `stateTicks`,
   `speedLevel`, `invulnTicks`, `bank`, `lives`, `moving`, `hitCause`, `hitTick`, `hits`;
7. per registered pool, in registration order: `count`, then every field (sorted by name) for
   slots `0 … count − 1` — today `enemyBullets` and `enemyLasers` (M1-09), `cancelPoints`
   (M2-02), `playerShots` (M1-10) and `items` (M1-11), removed-this-tick slots included until
   the flush; then (M2-02) the state kept outside the pools: the **bending lasers** — every slot's active flag,
   and for an active slot `filled`, `head`, `length`, `emit`, `homing`, `stride`, `angle`,
   `speed`, `turnRate`, `width`, its flag bits and the body nodes newest first — then the
   **pattern interpreter's runners** — the search hint and the count of bullet runners, then per
   runner in use its slot, state bits, entry, counter, `repeat` depth and stack, all 16 locals,
   wake age, `sequence` direction and speed, heading and scale;
8. per enemy slot (M1-08): its `EnemyState`, and for a slot in use every numeric field
   (spec, position, velocity, hp, flash, age, spawn tick, formation / member, anchor, mover
   code / parameters / state / ticks, script present, `wakeTick`, flags, first-seen tick,
   animation frame, path, camera origin, and since M2-04 the Options an Option Hunter carries);
9. the formation table: per slot `active`, and for an active slot every field and its track's
   `recorded` count;
10. the player weapons (M1-10): per player the loadout (`main`, `missile`, `options`; since M2-05
    the Direct-mode `shot`, `sub`, `family`) and the
    option group (`count`, `stolen`, `head`, the whole trail, the Option positions; since M2-04
    its type `mode`, `spreadTicks`, `toggled`, `holdTicks`, the orbit `angle` and the Snake
    links), then every autofire timer, then (M2-03) each player's Free Way direction, then the cooldown table of
    every live piercing shot or Spread Bomb;
11. the power-ups (M1-11): per player the meter `cursor`, the pending Mega Crash flag and the
    ship's shield (`kind`, `hits`, `maxHits`, `iFrames`, `absorbsTerrain`, `hitTick`,
    `brokeTick`, `absorbed`; since M2-04 `hurtScale`, `podCount`, `podMaxHits`, `podOrbit`,
    `spin` and every pod slot's hits, angle, i-frames and hit tick; since M2-05 the Arm's `tier` and
    `charge`), then `dropsTaken` and (M2-05) the Direct-mode item plan's `planCursor` (the
    `items` pool is covered by step 7);
12. the effect timers and scores (M1-12): `fx.shakeMagnitude`, `shakeTicks`, `shakeDuration`,
    `shakeTick`, `flashTicks`, `flashKind`, `flashTick`, every player's `score` (with its
    `nextExtend` and `continues` since M2-01), then the scoring system's `killsScored` and
    `bonusesScored`, then (M2-01) `continuesUsed` and `rankInputs.loop`, `stage`, `power`,
    `special`;
13. the boss (M1-13): its state, spec index, position (world and playfield), state and phase
    timers, phase, script present + `wakeTick`, motion and its parameters, destroyed mask,
    killer, blast flag, part count, and per part its offset, position, hit points, destroyed /
    open flags and hit flash; then the WARNING's `active` and `ticks`. (The piercing shots'
    boss-part cooldown tables join their enemy tables in step 10; the stage brake's slots are in
    step 4.)

Not hashed: config and content (fixed per session — the terrain map included, which nothing
modifies yet), intents, `device`, `slot`, debug flags, the event queue, the grid, the enemies'
tick outcomes, the weapons' role tables (the direct roles and compiled families of M2-05 too), live counts and hit list, the power-ups' pickup outcomes, compiled Auto Power-Up order and Direct-mode item plan (derived from content,
config and the pool, or rebuilt every tick), the session hi-score and the HUD's dirty flags (a
host may raise the hi-score — the scene flow starts it from the save's best since M1-17), `fx.frozen` (derived from `hitStop`) and the view (parallax offsets are derived from the
camera, enemy batches from the enemies) — presentation or derived state. A behaviour coroutine's position inside its
generator cannot be read; it is covered by `wakeTick` and by everything the script changed. Two worlds created
from the same seed and content and fed the same inputs hash equal after any number of ticks
(`world.test.ts` runs 5,000; `world-flight.test.ts` replays a recorded remote session through
a fresh game). A new piece of simulated state must be added to the hash — in a fixed place in
the sequence — or a divergence in it goes unnoticed; `debug-edge.test.ts` recomputes the hash
independently and fails when the two disagree.

`hashWorld` reads state only (it never draws from an RNG) and mixes into module-level typed
arrays, so the only allocation is the engine boxing the returned unsigned 32-bit value when it
does not fit a small integer (≤ 16 bytes). Call it every few ticks — replays store it every 600
ticks and the debug overlay every 60 (M1-19) — not per entity.

## The free-flight scene (`@shmup/shell` `flight`)

From M1-06 until the scene flow of M1-16 the browser and TV builds started into **free flight**
(now `?scene=flight` in the web app; the default is the title, and since M1-18 START plays zone A
— [scenes-and-ui.md](scenes-and-ui.md), [zone-a-and-playtest.md](zone-a-and-playtest.md)): the game's World — the
KESTREL flying in and then moving under the remote, keyboard or gamepad — over a drifting
starfield, with the D20 HUD bars (`1P` and player 1's score, `FREE FLIGHT` — `GAME OVER` in red once the
World's status says so — `HI` and the session hi-score, `lives − 1` stock ships, the hint
`ARROWS MOVE`; M1-12). `createFlightScene(game)` builds its own `WorldView` whose batches are two
starfield batches **followed by the World's own batches**, sharing the World's camera — a
batch the World adds later is drawn without touching the scene. When the World runs a stage
(`?stage=<id>` in the web app) the scene passes the World's parallax and terrain views through
(and always its laser view),
drops its own starfield when the stage has parallax bands, and shows the stage name as the HUD
title. Since M1-10 the KESTREL autofires in every build (the web app's `?loadout=full` adds
the Missile, the Laser, four Options and — since M1-11 — a Force Field); the shots, Options,
capsules and shields are World batches, so the scene draws them unchanged. Its sprite name table is the
content's names followed by `FLIGHT_SPRITES` (`bg/stars-far`, `bg/stars-mid`,
`bg/stars-near`, `hud/life`), so ids of both kinds index one table. `update(frame)` refills the
stars from the tick (they pause with the game) and rebuilds the HUD only when player 1's lives,
the status or a score's dirty flag (`displayDirty`, `hiScoreDirty` — cleared by the rebuild)
change; it allocates nothing. Since M1-13 it passes the World's `warning` view through and draws
a running WARNING's text on a translucent band in its UI list, red and yellow alternating every 16
ticks, rebuilt only when the WARNING starts, ends or changes colour
([bosses-and-warning.md](bosses-and-warning.md#the-warning)); the boss's parts are a World batch.

| `?scene=` | Shows |
|---|---|
| (none) / `game` | the scene flow (M1-16): the title, then zone A (M1-18) — the TV always starts here, a widget has no query string |
| `flight` | free flight (open space unless `?stage=` names a stage) |
| `showcase` | the M1-04 sprite showcase |
| `calibration` | the test pattern; the game's frame is rendered **without** its world |

Details of the boot and the renderer: [rendering-and-shell.md](rendering-and-shell.md).

## Zero allocation, and the allocation guard

Nothing allocates per tick: `createWorld` builds every object, array and typed array, and the
systems only write numbers. Plan §1.4 turns that into a test: `measureHeapGrowth(fn,
iterations, warmup?)` in `packages/core/test/helpers/alloc.ts` runs `fn` under V8's
`GCProfiler` and adds the bytes the in-loop collections reclaimed to the heap growth, so it
measures everything the loop *allocated*, not only what survived:

```ts
import { measureHeapGrowth } from '../helpers/alloc.js';

const growth = measureHeapGrowth(() => stepWorld(world, input), 10_000);
expect(growth.bytes).toBeLessThan(256 * 1024); // plan: < 256 KB over 10,000 ticks
```

It needs `node --expose-gc`: `defineShmupProject(name, { execArgv: ['--expose-gc'] })` passes
it to the Vitest workers of `@shmup/core` and `@shmup/shell` (the shell's flight tests import
the helper by relative path). It collects garbage before the warm-up too, so a collection that
clears earlier tests' hidden classes cannot drop the measured loop into V8's lower tiers. It
measures up to `attempts` windows (default 3) and returns the steadiest, stopping at the first
that measures at most `settled` bytes (default 32 KiB, half the smallest budget): under the load
of the full suite V8 can still spend one window in a lower tier or installing optimised code
(tens to hundreds of KB), which real per-iteration allocation does in every window. Give short,
cheap loops a long warm-up (`warmup` of e.g. 20,000 instead of the default 1000), or the
measured window pays for the tier-up.

The guard found three real per-tick / per-frame allocations in M1-06, all of the same kind —
**V8 boxes a non-integer number into a 16-byte heap object** in some positions:

| Where | Pattern that allocated | Fix |
|---|---|---|
| `world` phase 6 | the fractional camera position passed as an argument to `grid.begin()` (a non-inlined call) | pass `Math.floor(camera.x) - GRID_MARGIN` — the origin only picks cells, queries stay exact |
| `player` movement | `diagonal ? speeds[level] * 0.7071 : speeds[level]` — one branch a tagged array element, the other a computed double | always a product: `speeds[level] * (diagonal ? DIAGONAL_SCALE : 1)` (× 1 is exact) |
| `loop` accumulator | fractional timestamps stored in `let` closure variables (re-boxed on every assignment) | keep them in a `Float64Array` |

Rules of thumb for hot paths: keep fractional state in typed arrays or object fields, not in
closure `let`s; pass whole numbers across call boundaries that only need whole numbers; make
both arms of a conditional produce the same kind of number.

## Using it in code

```ts
import {
  Action,
  commitPlayerInput,
  createInputSnapshot,
  createWorld,
  hashWorld,
  resolveGameConfig,
  stepWorld,
} from '@shmup/core';

const world = createWorld(resolveGameConfig({ seed: 7 }), db); // db = loadContent(files).db
const input = createInputSnapshot();
for (let i = 0; i < 40; i++) stepWorld(world, input); // the fly-in
world.players[0].state; // → 'alive'
commitPlayerInput(input.players[0], Action.Up | Action.Right);
stepWorld(world, input); // speed level 0: 1.5 px/tick × 0.7071 on each axis
const checkpoint = hashWorld(world);
```

Inside the game, use `createGame(platform, overrides, db)` and `game.step()` /
`game.frame(now)`; `game.world` is the same World.

## Extending it

| To add… | Do this |
|---|---|
| A system | A `WorldSystem` called from its phase function in `world/index.ts` (plan §3.2 order); allocate its state in `createWorld`; add simulated state to `hashWorld` (the enemy system is the worked example: one object with a method per phase) |
| An entity kind with an SoA pool | `createSoaPool(capacity, schema)` in `createWorld`, `world.pools.register(name, pool)` (flushed in phase 8, hashed automatically); `free()` during the tick, never `flush()` yourself |
| Something drawn | Its batch in `view.batches` from the start: the pool's arrays (a `SpriteBatchView`) or a mirror batch filled in phase 9 |
| A collision pair | Pick the layers (`COLLISION_MASKS` must allow the pair), insert the larger population into `world.grid` in phase 6 and query it with the smaller one; use a visitor created once |
| A player state or field | Append to `PLAYER_STATES` (never reorder — codes are hashed), add the field to `createPlayer`, `spawnPlayer` if it resets on spawn, and `mixPlayer` in `debug` |
| A world status | Append to `WorldStatus`, `WORLD_STATUSES` and `statusCode` in `debug` |

## Tests

| Where | Covers |
|---|---|
| `packages/core/test/weapons/`, `options/`, `test/integration/weapons-runtime.test.ts` | the weapon system inside the World (M1-10): caps, the Double rule, laser pierce, missiles on slopes, Option trails, grid hits = brute force, kills and clinks, lockstep hashes, the full-loadout allocation guards — details in [weapons-and-options.md](weapons-and-options.md#tests) |
| `packages/core/test/bullets/`, `test/integration/bullets-runtime.test.ts` | the bullet system inside the World (M1-09): kinematics, lasers, collision, cancel, pools flushed and hashed, the 512-bullet allocation guards — details in [bullets-and-patterns.md](bullets-and-patterns.md#tests) |
| `packages/core/test/enemies/`, `test/integration/enemies-runtime.test.ts` | the enemy system inside the World (M1-08): spawns through the stage hooks, formations, scripts, movers, off-screen rules, contact, hashes, the 64-enemy allocation guard — details in [enemies-and-behaviors.md](enemies-and-behaviors.md#tests) |
| `packages/core/test/world/world-stage*.test.ts` | the World with a stage (M1-07): `config.stage` selection, the runner driving the camera, music / `end` / restart hooks, terrain hits through `playerHit` (fly-in, god mode, hazard, decoration, ceilings, player 2), hit-stop freezing the timeline, determinism and zero allocation — details in [stage-runtime.md](stage-runtime.md#tests) |
| `packages/core/test/bosses/`, `test/integration/boss-runtime.test.ts`, `test/e2e/boss.spec.ts` | the boss system inside the World (M1-13): the WARNING, parts, weak points, phases, the death sequence, clears, lockstep hashes, the allocation guards — details in [bosses-and-warning.md](bosses-and-warning.md#tests) |
| `packages/core/test/world/world-death*.test.ts`, `player/player-life*.test.ts`, `fx/`, `scoring/`, `test/integration/death-runtime.test.ts`, `test/e2e/lives.spec.ts` | the life cycle, penalties, game over, score and fx (M1-12) — details in [death-and-scoring.md](death-and-scoring.md#tests) |
| `packages/core/test/world/` | phase order and names, hit-stop (only input + fx, exact lengths, view refresh), camera scroll and riding across hit-stop, P2 inactive / active, pools (register, flush, clear, duplicate names), grid placement, stable view objects, 5,000-tick lockstep hashes, one flipped input bit diverges, zero allocation per tick (scrolling on both axes, default ship) |
| `packages/core/test/player/` | speed per level, diagonal scale, SOCD, clamps (far outside, asymmetric margins, corners, vertical scroll), fly-in curve (also while scrolling), banking, state timers, invulnerability, device tracking, `resolvePlayerShip`, zero allocation |
| `packages/core/test/collision/` | every shape test incl. edge contact and degenerate shapes, `segmentAabb` against an exact reference (4,000 cases), the layer matrix, grid = brute force (1,000 random boxes, several cell sizes, fractional origins), the 9-cell overflow, capacity, `build`/`query` protocol, zero allocation |
| `packages/core/test/debug/` | `hashWorld` against an independent FNV-1a of the documented sequence, every hashed field matters, presentation state does not, NaN / ±0 / Infinity, purity, allocation bound |
| `packages/core/test/game/game-world.test.ts` | `game.frame(now)` → one world tick per 1/60 s (capped), pause / suspend freeze the world, 5,000-tick sessions reproducible, the whole per-frame path within budget |
| `packages/core/test/helpers/alloc.test.ts` | the allocation guard itself (zero loop, one object per iteration, garbage already collected; three windows by default, the early stop at `settled`, `attempts = 1`) |
| `packages/shell/test/flight/` | the scene's sprite ids, starfield drift / wrap / pause, HUD (score, `HI`, stock, `GAME OVER` — rebuilt only on a change), the WARNING band (M1-13), empty content, zero allocation per displayed frame |
| `test/integration/world-flight.test.ts` | shipped KESTREL = plan tunables = built-in fallback, atlas has every bank frame, a remote session under `tizen-remote-safe` replays to an equal hash |
| `test/e2e/flight.spec.ts`, `boot.spec.ts` | in Chromium: arrow keys move the ship (pixel diff on its hull colour), holding a direction stops it at the margin clear of the HUD, the Tizen build from `file://` too; free flight is the default scene |

## Gotchas

| Symptom | Cause / fix |
|---|---|
| Two runs with the same seed and input hash differently | Something outside the sim changed simulated state (a host writing `world.*`), a system read wall time, or a code path skipped an RNG draw. Hash every tick in a test to find the first differing tick |
| A new field diverges in replays but the hash never noticed | It is not in `hashWorld`. Add it in a fixed position of the sequence (and to `debug-edge.test.ts`'s reference) |
| The ship ignores input for the first ~2/3 s | The 40-tick fly-in (`enterTicks`); `respawning` does the same |
| A test ship dies (or the run ends in `gameOver`) where it used to fly on | Since M1-12 every hit that gets through is a death. Use `world.debugFlags.godMode = true`, top up `lives`, or run only the phases under test ([death-and-scoring.md](death-and-scoring.md#gotchas)) |
| The ship follows a change of scroll speed one tick late (and the clamp edges are off by up to one scroll step on screen) | By design: phase 2 applies the camera step recorded in phase 3 of the *previous* tick and clamps to the camera before this tick's move |
| Nothing is drawn in a headless test's view | The content has no `player` file, so `DEFAULT_PLAYER_SHIP` (`spriteId -1`) is used — load the real content |
| An allocation test fails only in the full suite | Code deoptimised by an earlier test's garbage; the guard already collects before its warm-up — raise `warmup` for code with many shapes, and look for fractional `let`s, mixed-kind ternaries and fractional arguments (above) |
| `measureHeapGrowth needs node --expose-gc` | The project's `vitest.config.ts` lacks `execArgv: ['--expose-gc']` |
| `SpatialGrid.query() before build()` | Every tick is `begin` → `insert`… → `build` → `query`…; an insert after `build` needs another `build` |
| Grid misses a hit | It cannot: queries equal brute force. Check the layer masks and the box sizes (half sizes vs full sizes) instead |
| Player 2 never moves | It is inactive until co-op (M2-06); set `world.players[1].active = true` and `spawnPlayer` it in tests |
| Enemies die in a test that never presses a button | The ship autofires by default (`autofire` and `remoteMode` true); pass `{ autofire: false, remoteMode: false }` to keep it quiet ([weapons-and-options.md](weapons-and-options.md#gotchas)) |

## Next steps that build on this page

- **M1-07** (done) — the stage runner drives the camera in phase 3, the terrain box is tested
  against the stage terrain in phase 6 and hits are recorded by `playerHit`
  ([stage-runtime.md](stage-runtime.md)).
- **M1-08** (done) — the enemy system in phases 3–9: spawns, coroutines, movers, grid inserts,
  contact through `playerHit` ([enemies-and-behaviors.md](enemies-and-behaviors.md)).
- **M1-09** (done) — enemy bullets and lasers (two SoA pools registered with the World) in
  phases 4–8, `playerHit(Bullet / Laser)`, the constant rank
  ([bullets-and-patterns.md](bullets-and-patterns.md)).
- **M1-10** (done) — the player weapons (the `playerShots` pool, loadouts, autofire) in
  phases 2 and 5–9, shots × enemies through the grid, Options on the `moving` trail
  ([weapons-and-options.md](weapons-and-options.md)).
- **M1-11** (done) — the power meter, capsules (the `items` pool, brute force against the pickup
  box, the magnet), the Force Field inside `playerHit` and Mega Crash in phases 2, 3 and 5–9
  ([powerups-and-shields.md](powerups-and-shields.md)).
- **M1-12** (done) — the death sequence in phase 7, respawn and game over in phase 2, the score
  credited in phases 3 and 7, the fx timers in phase 9 and exact hit-stop
  ([death-and-scoring.md](death-and-scoring.md)).
- **M1-13** (done) — the boss system in phases 3–7 and 9, the `bossWarning` status, the stage
  brake, the boss kill's hit-stop, shake and flash ([bosses-and-warning.md](bosses-and-warning.md)).
- **M1-19** (done) — replays and the golden zone A replays compare `hashWorld`; the debug
  controls act on the shared `debugFlags` ([debug-and-replays.md](debug-and-replays.md)).
- **M2-01** (done) — `updateWorldRank` at the end of phase 3, `world.rankInputs` and
  `continuesUsed`, `canContinue` / `continueWorld`, extends in the scoring system's crediting
  ([difficulty-and-rank.md](difficulty-and-rank.md)).
- **M2-02** (done) — `world.patterns` (the DSL interpreter: emitters stepped in phase 4, bullet
  programs in phase 5), bending lasers (phases 5–6), cancel point items (the `cancelPoints` pool,
  phase 5), `BulletSystem.clear()` in `clearSession`, the hash's bending lasers and runners
  ([pattern-dsl.md](pattern-dsl.md)).
- **M2-03** (done) — the World fires the config's arsenal and applies its `!` / `?` choices
  (`createWorld` throws for a bad Weapon Edit; a `'full'` loadout grants the `?` choice's shield,
  also on a continue); `ENGINE_SPRITES` gained `shots/blast`; the weapon select flies a private
  World as its live preview — its own event queue and debug flags through `WorldOptions`
  ([meter-arsenal.md](meter-arsenal.md)).
