# Enemy bullets, lasers, attack patterns and rank

How enemies shoot inside `@shmup/core`: the **bullet system** (`core/bullets`) with its
512-slot struct-of-arrays bullet pool and 16-slot laser pool, the bullet **kinematics**
(acceleration, turning, delays, changes, homing), telegraphed **lasers**, bullet and laser
**collision** with the ships, **bullet cancel**, the **fire primitives** of `core/patterns`
that behaviour scripts call through the enemy `ScriptApi`, the constant **rank** of
`core/rank` that scales bullet speeds and fire intervals, and how render-pixi draws bullets and
lasers without allocating. Built in plan step **M1-09**.

This page is the *how and why*. Exact signatures are in
[api-reference.md](api-reference.md#bullets--enemy-bullets-and-lasers); the TSDoc in
`packages/core/src/{bullets,patterns,rank}/index.ts` and `packages/render-pixi/src/layers/`
is the authoritative reference. The enemies that fire are
[enemies-and-behaviors.md](enemies-and-behaviors.md); the World and its tick phases are
[sim-world.md](sim-world.md); the render contract is
[rendering-and-shell.md](rendering-and-shell.md).

Background: `shmup_feat.md` §12 (enemy bullets and attack patterns: kinematics, pattern
primitives, lasers with a telegraph and a hitbox only at full width, bullets dying on terrain,
cancel, the ~512 bullet budget, the readability palette), §15 (rank), §20 (telegraphing,
visible bullet origins), §22 (SoA pools, brute-force bullets × players, capsules for lasers);
plan §3.2 (tick phases), §3.4 (render contract) and decisions **D17** (moderate density,
aimed shots on 32 directions, speeds tuned for 4-way dodging), **D16** (rank 0–31, M1 at a
fixed Normal rank) and **D29** (coroutines decide, per-tick code moves).

## The picture at a glance

```text
createWorld(config, db)                                                       core/world
 ├─ world.rank = computeRank(difficultyRankInputs(config.difficulty))  → 2 on Normal  core/rank
 ├─ world.bullets = createBulletSystem(world)                                 core/bullets
 │    pools.register('enemyBullets', 512 slots)  ← also the ENEMY_BULLETS sprite batch
 │    pools.register('enemyLasers', 16 slots)    ← also view.lasers (LaserView)
 │    kind tables: BULLET_KINDS sprite names → db.sprites ids (ENGINE_SPRITES, -1 = hidden)
 └─ world.bullets.setRank(world.rank)  → speedScale, fireScale

stepWorld, every tick
 ├─ 4 scripts    enemy coroutine wakes → api.aimed / nWay / ring / … / laser      core/enemies
 │               └─ fire rule (canFire) → core/patterns primitive → bullets.emit / fireLaser
 ├─ 5 movement   enemies.move()  then  bullets.update(): ride camera, delay, age, change,
 │               homing, accel / angVel, move, cull (view ± 16 px, terrain); lasers follow
 │               their enemy or ride the camera, step telegraph → grow → active → fade
 ├─ 6 collision  … enemies × ships …  then  bullets.collidePlayers(): circles × hurt radius,
 │               active laser capsules × hurt radius → playerHit(Bullet / Laser)
 ├─ 8 removal    pools.flushAll(): freed bullet / laser slots swap-removed
 └─ (renderer)   ENEMY_BULLETS: bullet sprite binding, then the laser binding on top
```

## Bullet kinds and the engine's own sprites

Bullets are not content yet (the BulletML-style pattern DSL of M2-02 brings pattern and bullet
content). `BULLET_KINDS` is a built-in, frozen table indexed by a `BulletKind` code — M1-03's
procedural bullet art in the readability palette of §12:

| Code | Kind | Sprite | Hit radius | Frames |
|---|---|---|---|---|
| 0–2 | `RoundPink`, `RoundRed`, `RoundPurple` | `bullets/round-{pink,red,purple}` (7×7) | 2 px | 1 |
| 3–5 | `OvalPink`, `OvalRed`, `OvalPurple` | `bullets/oval-…` (9×9) | 2 px | 8 directional |
| 6–8 | `NeedlePink`, `NeedleRed`, `NeedlePurple` | `bullets/needle-…` (11×11, fast bullets) | 1.5 px | 8 directional |

Every built-in kind dies on terrain and is cancelable. The directional frame of an 8-frame kind
for a heading `a` (whole binary units) is `((a + 32) >> 6) & 7`: frame `k` points `k · 22.5°`
clockwise from +x, and the art is point-symmetric, so eight frames cover every heading (the
M1-03 generator's convention). It is recomputed whenever the velocity is.

**Engine sprites.** No content file names these sprites, so `loadContent` would never intern
them. `BULLET_SPRITES` (the nine kinds, then `LASER_SPRITE` = `lasers/beam-pink`) is exported by
`core/world` as `ENGINE_SPRITES`, and `loadContent(files, { extraSprites })` interns extra
names into `db.sprites` with the content's own. The shell's `loadGameContent` passes
`ENGINE_SPRITES` by default and `pnpm content:check` verifies every engine sprite against the
atlas. A database loaded without them (a unit test calling `loadContent(files)` alone)
simulates bullets exactly the same but cannot draw them: their `draw` flags get
`SpriteFlag.Hidden`.

## The bullet system (`core/bullets`)

`createBulletSystem(host)` is called by `createWorld` (`world.bullets`); the host is the World
(`BulletHost`: tick, config, camera, players, ship spec, terrain, content, events, debug flags,
the pool registry and the enemies). It allocates everything up front:

- the bullet pool — `createSoaPool(MAX_ENEMY_BULLETS = 512, BULLET_SCHEMA)`, registered as
  `enemyBullets`;
- the laser pool — `createSoaPool(MAX_ENEMY_LASERS = 16, LASER_SCHEMA)`, registered as
  `enemyLasers`;
- `batch`: the bullet pool **as** the `LayerId.EnemyBullets` `SpriteBatchView` (its `x`, `y`,
  `sprite`, `frame` and `draw` arrays — no mirror copy, plan §3.4);
- `laserView`: the laser pool as the render contract's `LaserView`;
- per-kind typed arrays (sprite id, radius, frames, flags) resolved once from `BULLET_KINDS`.

Both pools are registered with the World, so phase 8 flushes them and `hashWorld` hashes their
live slots like any other pool; a checkpoint restart (`pools.clearAll()`) empties them.

### The bullet pool

| Field | Type | Meaning |
|---|---|---|
| `x`, `y` | f64 | World centre |
| `vx`, `vy` | f64 | Velocity (px/tick) before the camera ride |
| `speed`, `angle` | f64 | Speed; heading in binary units `[0, 1024)` (may be fractional — rounded for the tables) |
| `accel`, `angVel` | f64 | Speed change and heading change per tick |
| `minSpeed`, `maxSpeed` | f64 | Clamp while accelerating (defaults 0 and `MAX_BULLET_SPEED` = 16) |
| `radius` | f64 | Hit radius (from the kind) |
| `sprite`, `frame`, `draw` | u16, u16, u8 | What the renderer draws: sprite id, directional frame, `SpriteFlag` bits |
| `kind`, `flags` | u8, u8 | `BulletKind`; `BulletFlag` bits |
| `age` | i32 | Ticks the bullet has moved (a delayed bullet starts counting at launch) |
| `delay` | i32 | Ticks left before a delayed bullet launches (0 = moving) |
| `changeAt`, `changeSpeed`, `changeAngle` | i32, f64, f64 | Scheduled change (age; `NaN` = keep; `AIM_AT_TARGET` = re-aim) |
| `turnRate`, `homing` | f64, i32 | Homing turn cap per tick; homing ticks left |

The plan's `anim` became `frame` + `kind`; `turnRate` / `homing` and `draw` were added.
`BulletFlag` bits: `DieOnTerrain` 1, `Cancelable` 2, `Grazed` 4 (reserved for graze scoring,
never set in M1) are public (`setFlags` replaces them); `AimOnLaunch` 8 and `Dead` 16 are the
system's own. A removed bullet stays in `[0, count)` flagged `Dead` (and `Hidden`) until phase 8
swap-removes it, so **every loop skips `Dead` slots** — and slot numbers are only valid within
the tick they were returned in.

### Spawning

| Call | What |
|---|---|
| `spawnBullet(world, x, y, angle, speed, kind)` | One bullet with raw values (no rank scaling, no fire rule) → slot or `-1` |
| `world.bullets.spawn(…)` / `emit(origin, angle, speed, kind)` | The same on the system; `emit` takes a reused `BulletOrigin` (what the primitives use) |
| `setMotion(i, accel, angVel, minSpeed, maxSpeed)` | Acceleration and turning |
| `setChange(i, atAge, speed, angle)` | A speed / heading change at an age (`UNCHANGED` = `NaN` keeps a value, `AIM_AT_TARGET` re-aims then; `atAge` 0 cancels) |
| `setDelay(i, ticks, aimOnLaunch)` | Wait `ticks` ticks, then launch (optionally re-aimed at the nearest player) |
| `setHoming(i, turnRate, lifetime)` | Home for `lifetime` moving ticks, turning at most `turnRate` units per tick |
| `setFlags(i, flags)` | Replace the public `BulletFlag` bits |

A new bullet gets its kind's radius, sprite, frame and flags, `minSpeed` 0, `maxSpeed` 16, and
its velocity from the sine table. A full pool, an unknown or fractional kind and a non-finite
angle other than `AIM_AT_TARGET` drop the spawn **quietly** (`-1`, nothing else happens —
§12's "pool exhaustion drops quietly"). The setters are no-ops for an out-of-range slot or a
bullet removed this tick.

**Angles.** Binary angles (1024 per turn, 0 = +x, clockwise on screen — `core/math`). Any
finite number is wrapped; fractions are kept in `angle` and rounded only to index the tables.
`AIM_AT_TARGET` (`Infinity`) means "at the nearest active, `alive` player", computed with
`atan2B` over whole numbers (the vector × 64, see the hot-path rules) and snapped with
`quantizeAngle` to `GameConfig.aimDirections` (default **32**, decision D17 — a power of two
from 4 to 1024, validated by `resolveGameConfig`). With no living player aimed shots go
straight left (`NO_TARGET_ANGLE` = 512); ties go to the lower player slot.

### One bullet tick (phase 5, `update()`)

For each live bullet, in slot order:

1. **Ride the camera**: `x += camera.dx`, `y += camera.dy` — delayed bullets too. Bullets live
   in world pixels but move in the view's frame like flying enemies, so a pattern keeps its
   shape on screen and an aimed shot still flies at the player (who rides the camera too)
   while the stage scrolls. A bullet fired in phase 4 starts at its enemy's pre-move position
   and rides this tick's scroll together with that enemy.
2. **Delay**: a delayed bullet counts down and does nothing else; on the tick it launches it
   re-aims first if it was fired with `AIM_AT_TARGET`. `setDelay(i, n)` makes the first move
   happen `n` ticks after the tick's own.
3. **Age** `++` (moving ticks only).
4. **Change**: on the tick `age === changeAt`, the new speed and / or heading apply (before
   this tick's kinematics).
5. **Homing**: while `homing > 0` (decremented every moving tick) the heading turns the short
   way towards the nearest living player (unquantised) by at most `turnRate`; without a target
   it keeps its heading.
6. **Acceleration**: `speed += accel`, clamped to `[minSpeed, maxSpeed]` (the clamp applies
   only while accelerating). **Angular velocity**: `angle += angVel`, wrapped.
7. **Velocity** recomputed from the sine table — and the directional frame — only when speed or
   heading changed this tick; then `x += vx`, `y += vy`.
8. **Cull**: removed unless inside the camera view ± `BULLET_CULL_MARGIN` (16) px on all four
   sides (exact, closed); a bullet with `DieOnTerrain` is removed when its centre pixel is
   terrain (`terrainAt` — one lookup, hazards count). The test is written as "not inside", so a
   bullet whose position became `NaN` (a `NaN` speed, say) is culled on its next move instead of
   living forever — a TEST-agent fix.

### Lasers

A laser is a straight beam from an origin, `length` px long in direction `angle`, `width` px
wide, going through four phases (`LaserPhase`):

| Phase | Default | Drawn as | Hitbox |
|---|---|---|---|
| `Telegraph` 0 | `LASER_TELEGRAPH_TICKS` 40 | 1-px warning line, blinking `LASER_BLINK_TICKS` 4 on / 4 off | none |
| `Grow` 1 | `LASER_GROW_TICKS` 8 | beam widening: tick `k` draws `width · k / (grow + 1)` | none |
| `Active` 2 | `LASER_ACTIVE_TICKS` 60 | beam at full `width` (`LASER_WIDTH` 6) | capsule, radius `width / 2` |
| `Fade` 3 | `LASER_FADE_TICKS` 8 | beam narrowing: `width · (fade + 1 − k) / (fade + 1)` | none |

Each phase lasts exactly its tick count (a laser fired in phase 4 spends its first telegraph
tick in that tick's update); a timing of 0 skips its phase; the laser is removed after the last
one. The hitbox exists **only at full width** (§12, §20 telegraphing).

`fireLaser(world, src, angle, length, telegraph?, grow?, active?, width?, fade?)` fires one —
positional timings instead of the plan's options object, so a call never allocates. `src` is a
`LaserSource` `{ slot, x, y }` (an `Enemy` works as it is): with `slot ≥ 0` the laser is
**attached** — its origin keeps its offset to that enemy and follows it every tick; with
`slot` −1 it is **fixed** and rides the camera like a bullet. When the source enemy is removed
or turns into a ghost leader, the enemy system calls `detachLasers(slot)`: a laser still
warning or growing vanishes, an active one fades, and none of them ever follows the next enemy
spawned into that slot. Lasers are cancelable. A full laser pool, every timing 0, a
non-positive length or width, or a bad angle return `-1`.

**Boss parts as sources (M1-13).** `BulletHost` gained an optional `laserSources` — every laser
source by id; without it the enemies are the sources. The World's lists the 64 enemy slots, then
the 16 boss parts (ids `BOSS_PART_ID_BASE` 64 + part), so a boss laser fired with `attach` stays
on its part; the boss system calls `detachLasers(part.slot)` when the part is destroyed, when
the boss dies (every part) and on a clear
([bosses-and-warning.md](bosses-and-warning.md#boss-behaviours-corebehaviors)).

### Collision with the ships (phase 6, `collidePlayers()`)

Brute force per active, `alive` ship (§22 — at most 512 × 2 cheap tests):

- **Bullets**: circle (`radius`) against the ship's `hurtRadius` (1.5 px for the KESTREL),
  closed — touching hits. The first overlap ends the test for that ship: `playerHit(ship,
  PlayerHitCause.Bullet, …)`; an **accepted** hit removes the bullet, a refused one (the
  fly-in, invulnerability, god mode) leaves it flying.
- **Lasers**: if the ship is still alive, every `Active` laser's capsule (segment origin → end,
  radius `width / 2`) against the hurt radius → `playerHit(ship, PlayerHitCause.Laser, …)`
  (the plan wrote `playerHit('bullet')`; a separate cause tells them apart).

So at most one bullet hit and one laser hit are offered per ship and tick. `playerHit` records
the hit (`hitCause`, `hitTick`, `hits`); since M1-12 phase 7 of the same tick turns it into the
death sequence, which cancels every cancelable bullet and laser
([death-and-scoring.md](death-and-scoring.md)). The
contact tests are written as "not within reach", so a `NaN` position or origin never hits.

### Cancel

`cancelAllBullets(world, CancelMode.Sparkle)` removes every cancelable bullet **and** laser at
once (Mega Crash since M1-11, the player's death since M1-12 and a boss's death since M1-13 —
all through `BulletSystem.cancelAll`) and returns the number
of bullets cancelled. Each cancelled bullet pushes a `SimEventKind.Particles` event with
`FX_CUES.BulletCancel` (3) at its position, floored to whole pixels (M1-12: the push is a call V8
does not inline, so fractional positions were boxed — and every death now cancels) — up to `CANCEL_SPARKLE_LIMIT` (64) per call; beyond
that an evenly spread subset (every `ceil(n / 64)`-th bullet), because the event ring is shared
with everything else. Bullets without `Cancelable` survive. Points mode arrives with M2-02.

## Fire primitives (`core/patterns`)

Scripts never spawn bullets by hand; they call one of the primitives of §12, which take the
bullet system and a reused `BulletOrigin`, **multiply every speed by the rank's `speedScale`**
and accept `AIM_AT_TARGET` for any angle argument:

| Primitive | Fires | Returns |
|---|---|---|
| `fireAimed(bullets, origin, speed, kind)` | one bullet at the nearest living player | slot or `-1` |
| `fireNWay(…, count, step, speed, kind, angle = AIM)` | `count` bullets `step` units apart, centred on `angle` (an even count brackets it) | bullets fired |
| `fireRing(…, count, speed, kind, offset = 0)` | `count` bullets evenly round the circle, the first at `offset` | bullets fired |
| `fireSpiral(…, angle, arms, step, speed, kind)` | `arms` evenly spaced bullets at `angle` | `angle + step`, wrapped — the script keeps it for the next volley |
| `fireStack(…, count, speed, speedStep, kind, angle = AIM)` | `count` bullets on one heading at `speed + k · speedStep` | bullets fired |
| `fireSpray(…, rng, count, spread, minSpeed, maxSpeed, kind, angle = AIM)` | random headings within `angle ± spread / 2`, random speeds in `[min, max)` — **two gameplay-RNG draws per bullet**, even when the pool is full, so replays stay in sync | bullets fired |
| `fireHoming(…, speed, kind, turnRate, lifetime, angle = AIM)` | one homing bullet | slot or `-1` |
| `fireDelayed(…, delay, speed, kind, angle = AIM)` | one bullet that waits, then launches (re-aimed at launch when `angle` is `AIM_AT_TARGET`) | slot or `-1` |
| `rankedWait(bullets, ticks)` | — | `round(ticks / fireScale)`, at least 1 — exactly `ticks` on Normal |

Counts are floored (below 1 fires nothing); a full pool drops the rest quietly. The primitives
run when a script wakes, not every tick, and take no object literals, arrays or closures.

### The `ScriptApi` wrappers and the fire rule

Behaviours use the enemy `ScriptApi` (`core/enemies`), which wraps every primitive — `aimed`,
`nWay`, `ring`, `spiral`, `stack`, `spray` (with the World's gameplay RNG), `homing`,
`delayed`, `laser` and `fireWait` (= `rankedWait`) — and exposes `bullets` for raw access
(`setMotion`, `setChange`, custom patterns). Each wrapper sets the system's shared origin to the
enemy's centre and **enforces the §11 fire rule itself**: while `canFire()` is false — off
screen, fewer than `settleTicks` after its first on-screen tick, a ghost leader, or no longer
`Live` — it fires nothing and returns `-1` / `0`. `spiral` still returns the advanced angle, so
a spiral keeps turning while its enemy may not fire. `laser(angle = AIM, length = 384, width,
telegraph, grow, active, fade)` fires a laser **attached** to the enemy. Bullets outlive the
enemy that fired them.

### The roster fires

| Behaviour | Pattern (tunables, Normal values) |
|---|---|
| `turret.floor` | faces the player every [`aimTicks` 30]; every [`fireTicks` 90] ticks (`fireWait`, counted in `aimTicks` steps) one aimed `RoundPink` at [`bulletSpeed` 1.5] |
| `walker.floor` | as it stops: an aimed 3-way of `OvalRed`, [`spread` 48] units apart (≈ 17°), at [`bulletSpeed` 1.25] |
| `orbiter.loop` | every [`ringTicks` 120] ticks (`fireWait`) a ring of [`ringCount` 8] `RoundPurple` at [`bulletSpeed` 1], each ring turned half a gap from the last |

`drifter.sine`, `fan.loop`, `carrier.straight`, `hatch.spawner` and `rammer.aimed` do not fire,
and no regular enemy fires a laser. Since M1-13 the boss roster fires through the same primitives
from the boss's gun parts: `boss.hover` aimed `RoundRed` spreads, `boss.lanes` aimed 3-ways of
`NeedlePurple` and the first lasers of the shipped content — telegraphed horizontal lane lasers
(not attached) from each gun in turn, fired by the test boss's last phase
([bosses-and-warning.md](bosses-and-warning.md#boss-behaviours-corebehaviors)). All speeds stay
within D17's "aimed ≤ 2.0 px/tick on Normal in zone A".

A firing behaviour:

```ts
import { BulletKind, MoverKind, defineBehavior, type Script } from '@shmup/core';

export const sentry = defineBehavior(
  'sentry.spiral',
  { fireTicks: 12, arms: 3, step: 40, bulletSpeed: 1.2 },
  function* sentry(api, p): Script {
    api.setMover(MoverKind.None);
    let angle = 0; // the spiral's state lives in the script
    for (;;) {
      angle = api.spiral(angle, p.arms, p.step, p.bulletSpeed, BulletKind.NeedlePink);
      yield api.fireWait(p.fireTicks); // rank-scaled interval; sleeping, not a yield-1 loop
    }
  },
);
```

## Rank (`core/rank`, partial)

Rank is Gradius III's 0–31 difficulty value (§15). In M1 it is **constant**: `computeRank`
returns the difficulty preset's base, rounded and clamped (`loop`, `stage`, `power` and
`special` are ignored until M2-01 turns growth on), and the systems already scale by it, so
M2-01 only adds the growth terms.

| Preset (`GameConfig.difficulty`) | `DIFFICULTY_RANK_BASE` | Bullet speed × | Fire rate × | `rankedWait(90)` |
|---|---|---|---|---|
| `easy` | 0 | 0.978 | 0.956 | 94 |
| `normal` | 2 (`RANK_NORMAL`) | 1 | 1 | 90 |
| `hard` | 4 | 1.026 | 1.052 | 86 |
| `arcade` | 6 (the "very hard" base) | 1.056 | 1.112 | 81 |

A `RankCurve { perRank, perRankSq }` gives `rankScale(r, curve) = 1 + perRank · (r − 2) +
perRankSq · (r² − 4)` for `r` clamped to 0…31 (never below 0.05) — **exactly 1 at Normal**, so
content speeds and intervals are the Normal values and every other rank scales them.
`BULLET_SPEED_RANK_CURVE` is `{ 0.01, 0.0005 }` (× 1.266 at rank 16, × 1.768 at 31),
`FIRE_RATE_RANK_CURVE` `{ 0.02, 0.001 }` (× 1.532, × 2.537); intervals are divided by the fire
rate. `world.rank` (hashed) is computed in `createWorld` and handed to `bullets.setRank`, which
caches `speedScale` and `fireScale` — `rankScale` returns a fraction, so it is called when the
rank changes, never per tick. Raw `spawnBullet` / `fireLaser` calls are **not** scaled; the
primitives are.

## Drawing bullets and lasers

- **Bullets** need nothing new in the renderer: `bullets.batch` is the last entry of
  `world.view.batches` (after the ground enemies, air enemies and players), so render-pixi binds
  an ordinary sprite binding on `ENEMY_BULLETS` — above explosions and items (§12, §18). Dead
  slots carry `SpriteFlag.Hidden` until the flush.
- **Lasers** are the render contract's new `LaserView` (`capacity`, `count`, per slot `x`, `y`,
  `angle`, `length`, `width` = the *drawn* width, 0 while telegraphing, `spriteId`, `flags` —
  `Hidden` is the blink), exposed as the optional `WorldView.lasers`. The renderer's
  `bindWorld` creates a `LaserBinding` (`createLaserBinding`, render-pixi `layers`) on
  `ENEMY_BULLETS` after the batches, so beams draw over bullets; the shell's flight scene passes
  the World's laser view through.
- **The laser binding** preallocates **two sprites per slot**, both pivoting on the laser's
  origin (`round(x − camera.x)`, `round(y − camera.y) + PLAYFIELD_Y`) and rotated to its angle:
  the warning line (the atlas's white pixel scaled to `length × 1`, tinted
  `LASER_WARNING_TINT` 0xff5aa0 once at creation) shown while the width is 0, and the beam —
  frame `round(width) − 1` of the beam sprite stretched along the laser (the last frame scaled
  across for beams wider than 8 px). A rotation is written only when a slot's angle changed.
- **The beam art** is procedural (`scripts/assets/procedural/lasers.mjs`):
  `lasers/beam-{pink,red,purple}`, 8 frames of 4×8 px, frame `k` a horizontal band `k + 1` px
  tall (dark rim rows from 3 px, body rows from 5 px, a bright core). Every column is identical,
  so a frame stretches to any length; growing and fading beams switch frames instead of scaling
  across.

## Determinism and hashing

Everything the bullet system simulates is in the two registered pools (hashed field by field in
sorted field order, slots `0 … count − 1`) and `world.rank` (hashed after hit-stop). Randomness
comes only from the gameplay stream (`fireSpray`; the cosmetic stream is never touched). Aiming
uses `atan2B` and `quantizeAngle`, velocities the committed sine table — bit-identical on every
engine. `test/integration/bullets-runtime.test.ts` runs two sessions of the shipped test stage
in lockstep and compares the bullet pools and `hashWorld` every tick.

## Zero allocation and the hot-path rules

The guards (`packages/core/test/bullets/bullets-alloc.test.ts`, their own Vitest file) run a
World with **512 live bullets** using every kind of motion, 16 lasers re-fired as they end and
the player collision for 10,000 ticks after a 20,000-tick warm-up, and a pool-churn World whose
bullets die and are replaced every tick — each under 64 KB; `bullets-alloc-cancel.test.ts` adds
delayed and changing bullets, attached lasers detached in every phase and a cancel every 40
ticks. The render-pixi laser binding has its own guard through a whole laser life cycle.
V8 findings behind the code (all documented at the code):

| Rule | Where it bit |
|---|---|
| Copy hot object fields into class fields once per call | `collidePlayers` copies the ship's `x` / `y` into `shipX` / `shipY` before the loops: loading `ship.x` inside the laser test allocated a heap number per load in optimised code |
| Cache a value whose source has several shapes | the hurt radius is read once at creation: the content's ship spec and the built-in `DEFAULT_PLAYER_SHIP` have different shapes, so `host.ship.hurtRadius` was a polymorphic load that boxed |
| Do not wrap hot loops in a tiny per-tick method | a loop-free `update()` calling a bullet and a laser method stayed in V8's mid tier (Maglev), which inlined the laser loop and boxed a number per laser per tick (~400 B/tick); one `update()` with both loops tiers up to TurboFan |
| Read camera deltas once per update | not per bullet |
| Whole numbers into `atan2B` | the aim vector is scaled by 64 and `\| 0`-ed first (1/64-px resolution) |
| Measure in a quiet worker | type feedback from the many small worlds of the functional suites skewed the allocation measurement by an order of magnitude — hence the separate file and the long warm-up |
| Pixi setters allocate | the laser binding tints its warning lines once, writes a rotation only on change, and picks a beam frame by width instead of writing a fractional scale every frame; `Math.round(…) \| 0` keeps `-0` out of positions |

## Using it headlessly

```ts
import {
  AIM_AT_TARGET,
  BulletKind,
  CancelMode,
  ENGINE_SPRITES,
  KNOWN_SCRIPT_IDS,
  cancelAllBullets,
  createGame,
  createHeadlessPlatform,
  fireLaser,
  loadContent,
  spawnBullet,
} from '@shmup/core';

const db = loadContent(files, { knownScripts: KNOWN_SCRIPT_IDS, extraSprites: ENGINE_SPRITES }).db;
const game = createGame(createHeadlessPlatform(), { stage: 'test-range', seed: 1 }, db);
for (let i = 0; i < 900; i++) game.step(); // the first turret has scrolled in and fires
const world = game.world;
world.bullets.count; // live enemy bullets
const i = spawnBullet(world, world.camera.x + 300, 100, AIM_AT_TARGET, 1.5, BulletKind.NeedleRed);
if (i >= 0) world.bullets.setMotion(i, 0.02, 0, 0, 3); // speeds up to 3 px/tick
fireLaser(world, { slot: -1, x: world.camera.x + 380, y: 60 }, 512, 380); // fixed, pointing left
cancelAllBullets(world, CancelMode.Sparkle); // → bullets cancelled; lasers go too
world.players[0].hits; // hits recorded by playerHit — each one a death since M1-12
```

## Extending it

| To add… | Do this |
|---|---|
| A bullet kind | Art in `scripts/assets/procedural/bullets.mjs` (or a pixel map), an entry in `BULLET_KINDS` and a code in `BulletKind` (append — codes are stored in the hashed pool), `BULLET_SPRITES` picks the sprite up; `pnpm content:check` verifies it; tests in `test/bullets/` |
| A pattern primitive | A `fire…` function in `core/patterns` taking `(bullets, origin, …)`, scaling speeds by `bullets.speedScale`, no literals / closures; a `ScriptApi` wrapper in `core/enemies` that goes through `gun()` (the fire rule); export it from `src/index.ts`; tests in `patterns-fire*.test.ts` |
| Bullet state | A field in `BULLET_SCHEMA` (hashed automatically), set in `initSlot` / a setter, used in `update()` (numbers only; skip `Dead` slots); document it in the schema table above |
| A firing behaviour | `defineBehavior` using the `ScriptApi` primitives and `fireWait` (above); tunables with Normal values; add it to `DEFAULT_BEHAVIOR_DEFS` — [enemies-and-behaviors.md](enemies-and-behaviors.md#behaviours-corebehaviors) |
| A laser colour | `lasers/beam-<colour>` already exists for every `BULLET_COLORS` entry; add the name to `BULLET_SPRITES` and a way to pick it per laser (today every laser uses `LASER_SPRITE`) |
| A cancel mode | Append to `CancelMode` (points mode is M2-02's) and handle it in `cancelAll` |
| A rank-scaled quantity | A `RankCurve` that is 1 at Normal, applied where the rank changes (`setRank`), never per tick |

## Tests

| Where | Covers |
|---|---|
| `packages/core/test/bullets/bullets.test.ts` | Kinematics (accel with min / max, angular velocity, changes, delays, homing), aimed quantisation on 32 directions, pool exhaustion dropping quietly, off-screen and terrain culling, laser phases and the hitbox only while `Active`, attached / fixed lasers, cancel clearing cancelable only (sparkle events), collision and `playerHit`, determinism |
| `packages/core/test/bullets/bullets-edge.test.ts` | Directional frames of all 1024 headings, `spawn` = `emit` = `spawnBullet`, bad kinds / angles, aim at 4 and 1024 directions, setter edge cases, exact culling at view ± 16 px while scrolling, phase-8 compaction, two ships, laser timing sums, capsule reach, detach edges, the cancel sparkle formula, restarts, views, hash coverage; the NaN regressions |
| `packages/core/test/bullets/bullets-alloc*.test.ts` | The allocation guards above (own workers) |
| `packages/core/test/patterns/patterns-fire*.test.ts` | Every primitive: spreads (even / wrapping, centred in all 32 directions), rings, spirals, stacks, sprays (two RNG draws per bullet, cosmetic stream untouched), homing, delayed, partial pools, `rankedWait` exact on Normal |
| `packages/core/test/behaviors/behaviors-fire*.test.ts` | The roster firing in a World: turret interval in `aimTicks` steps and rank-scaled, orbiter rings, walker 3-way, the `ScriptApi` fire rule (off screen, unsettled, ghosts), `laser()` defaults, bullets outliving their enemy, a detached laser never following the next enemy in the slot |
| `packages/core/test/rank/rank.test.ts`, `config/config.test.ts` | `computeRank`, the curves (1 at Normal), clamps; `aimDirections` validation |
| `packages/render-pixi/test/layers/layers-lasers*.test.ts`, `renderer/renderer-wiring.test.ts` | The laser binding (line vs beam, band frames, rotation only on change, blink, camera rounding, capacity, destroy, allocation); the renderer binding it on `ENEMY_BULLETS` |
| `packages/shell/test/loader/`, `flight/` | `ENGINE_SPRITES` interned by default; the flight scene passing the laser view through |
| `test/integration/bullets-runtime.test.ts`, `content.test.ts` | The shipped timeline fires exactly the roster patterns, bullets stay in bounds / off terrain / drawn, a passive ship takes hits, Arcade speeds, lockstep pools and hashes; engine sprites exist in the atlas |
| `test/scripts/assets/procedural.test.ts` | The beam frames' band heights and rows |
| `test/e2e/bullets.spec.ts` | In Chromium: the turrets' bullets appear inside the playfield in the palette's colours and move; no console errors |

## Gotchas

| Symptom | Cause / fix |
|---|---|
| Bullets simulate (and hit) but are never drawn | The content was loaded without `extraSprites: ENGINE_SPRITES` (a test calling `loadContent(files)` alone), so their sprite ids are unknown and the slots are `Hidden`. The shell passes them by default |
| Magenta checkered squares instead of bullets | The engine sprite names are in the table but not in the atlas — run `pnpm assets`; `pnpm content:check` names the missing sprite |
| An enemy never fires | `canFire()` is false: it is off screen, has not been on screen for `settleTicks` (default 30), is a ghost leader, or the fire interval has not come yet |
| A stored bullet slot points at another bullet | Slots are stable only within the tick — phase 8 swap-removes freed slots. Set motion / changes right after the spawn |
| `setMotion` on a fresh bullet did nothing | The spawn returned `-1` (full pool, bad kind or angle); check it |
| A bullet spawned faster than `maxSpeed` keeps its speed | The min / max clamp applies only while `accel ≠ 0` |
| Aimed shots miss a still player by a few degrees | By design: they snap to `config.aimDirections` (32) directions |
| A turret on Arcade fires no faster than on Normal | Its interval is counted in `aimTicks` (30) steps: 81 ticks rounds up to 90. Lower `aimTicks` for finer steps |
| The ship takes no bullet hits during the fly-in or in god mode | `playerHit` refuses them; the bullet keeps flying |
| A laser hit nothing while it was clearly on screen | Only `Active` lasers (full width) have a hitbox; the warning line and the growing / fading beam never hit |
| A laser disappeared when its enemy died | By design: warning / growing lasers vanish with their source, active ones fade |
| `RangeError: GameConfig.aimDirections must be a power of two` | Use 4, 8, 16, … 1024 |
| Only 64 sparkles for a screen full of bullets | `CANCEL_SPARKLE_LIMIT` — the event ring is shared; the sparkles are spread evenly |
| The allocation guard fails after a change to `update()` | A fractional argument / return across a non-inlined call, a field loaded through a polymorphic object, or the loops split into a tiny wrapper — see the table above |

## Next steps that build on this page

- **M1-10** (done) — player shots in their own pool (`playerShots`, 96), riding the camera and
  culled at view ± 16 px like bullets; they hit enemies through the grid (boxes, not capsules —
  the laser weapon's box spans its whole length) ([weapons-and-options.md](weapons-and-options.md)).
- **M1-11** (done) — Mega Crash cancels every cancelable bullet and laser with sparkles; the
  Force Field absorbs bullet and laser hits inside `playerHit` (an absorbed bullet is used up
  like an accepted hit) ([powerups-and-shields.md](powerups-and-shields.md)).
- **M1-12** (done) — `playerHit(Bullet / Laser)` leads to the death sequence, which cancels
  bullets and lasers with sparkles; the arcade restart clears both pools
  ([death-and-scoring.md](death-and-scoring.md)).
- **M1-13** (done) — bosses fire through the same primitives from their parts (and lane
  lasers, attached lasers follow a part through `BulletHost.laserSources`); a boss's death
  cancels bullets and lasers with sparkles ([bosses-and-warning.md](bosses-and-warning.md)).
- **M1-14** (done) — `FX_CUES.BulletCancel` draws the `bullet.cancel` preset (a pale-gold
  `fx/sparkle` twinkle) where each bullet was cancelled
  ([fx-and-game-feel.md](fx-and-game-feel.md)).
- **M2-01** — rank growth (`computeRank` reads stage, loop, power and special); Easy's 16 aim
  directions; revenge bullets.
- **M2-02** — the pattern DSL, bending lasers, cancel into points, graze (`BulletFlag.Grazed`).
