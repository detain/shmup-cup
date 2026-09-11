# Enemies, behaviour scripts and movement

How enemies live inside `@shmup/core`: the enemy and path data as loaded, the **enemy
system** that spawns, moves, collides, damages and removes them in the World's tick phases,
**formations** with their kill tracking and capsule drop, the **behaviour coroutines** that
sleep between decisions, the per-tick **movers** that do the actual moving (including
arc-length **spline paths**), the off-screen rules, and the hot-path rules that keep 64
scripted enemies free of garbage. Built in plan step **M1-08**; since **M1-09** the behaviours
fire bullets and lasers through the `ScriptApi` — the bullet side is
[bullets-and-patterns.md](bullets-and-patterns.md).

This page is the *how and why*. Exact signatures are in
[api-reference.md](api-reference.md#enemies--the-enemy-system-partial); the TSDoc in
`packages/core/src/{enemies,patterns,behaviors}/index.ts` and `src/data/paths.ts` is the
authoritative reference. The *formats* for content authors live next to the data:
[`content/enemies/README.md`](../../content/enemies/README.md),
[`content/paths/README.md`](../../content/paths/README.md) and the event table of
[`content/stages/README.md`](../../content/stages/README.md). The World the system plugs into
is [sim-world.md](sim-world.md); the stage runner that fires the spawn events is
[stage-runtime.md](stage-runtime.md).

Background: `shmup_feat.md` §11 (enemy archetypes, movement primitives, formations and drops,
off-screen and settle rules, coroutine AI scripts), §22 (pooled objects composed of mover,
hurtbox, health and script; the enemies × players grid pair); `shmup_tech.md` §4.6 (generator
coroutines); plan §3.2 (tick phases) and decisions **D29** (coroutines decide, movers move),
**D30** (hit flash) and **D17** (32 aim directions).

## The picture at a glance

```text
content/enemies/*.enemies.json ─┐
content/paths/*.paths.json ─────┼─ loadContent({ knownScripts: KNOWN_SCRIPT_IDS })   core/data
content/stages/*.stage.json ────┘   ├─ enemy defaults filled in, child / path / script refs → ids
                                    ├─ paths baked: centripetal Catmull-Rom → 1-px arc-length table
                                    └─ + checkEnemyBehaviors(db): unknown params, spawners w/o child

createWorld(config, db, { behaviors = DEFAULT_BEHAVIORS })                        core/world
 └─ createEnemySystem(world, behaviors, stage)                                     core/enemies
     64 Enemy slots + 64 ScriptApis, formation table (32) + tracks, ground / air sprite batches,
     specs and the stage's spawn events compiled into typed arrays, the mover context

stepWorld, every tick
 ├─ 3 stage      beginTick (reset outcomes) → stage.tick() → hooks → onStageEvent → spawn /
 │               startFormation → spawnPending (formation members due this tick)
 ├─ 4 scripts    runScripts: resumeScript(enemy) only where wakeTick ≤ tick     core/patterns
 │               (a woken script may fire: api.aimed / nWay / ring / … → core/bullets)
 ├─ 5 movement   move: age, flash, ride camera (flying), updateMover, leader track, animation,
 │               on-screen / settle / despawn rules
 ├─ 6 collision  insertColliders (hurtboxes → grid, id = slot) → grid.build() →
 │               collidePlayers (hurt circle × box → playerHit(Contact))
 ├─ 7 damage     weapons.applyHits → enemies.damage(enemy, amount, player) / kill (M1-10)
 ├─ 8 removal    flush: Removed slots → Free
 └─ 9 fx         sync: live, non-ghost enemies → groundBatch / airBatch (flash, flips, frame)
```

## Data as loaded

### Enemies (`content/enemies/`, kind `enemies`)

`EnemySpec` (`core/data`): `id`, `hp`, `score`, `hurtbox { hw, hh }` (half sizes; also the
contact box), `script` → `scriptId`, `sprite` → `spriteId`, and the fields M1-08 added —
`anim { frames, ticks }`, `params` (behaviour tunables by name), `mover` (a starting mover or
`null`), `drop` (`'capsule'` or `null`), `ground` (`'floor'`, `'ceiling'` or `null` = flying),
`settleTicks`, `explosion` (`'small' | 'medium' | 'large'`), `megaCrashImmune` (read by M1-11),
`child` → `childId` (the enemy a spawner releases) — plus the older optional `rank`.

The loader fills the defaults of every optional field (`completeEnemy`): `anim` 1 frame,
`params` `{}`, `mover` `null`, `ground` `null`, `settleTicks` `DEFAULT_SETTLE_TICKS` (30),
`explosion` `'small'`, `megaCrashImmune` `false`, `child` `null`. So every spec has the same
fields in the same order — the enemy system compiles them into typed arrays once, and no code
branches on "is this field present".

`mover` is a discriminated union on `type` with the names of `MOVER_TYPES` (`straight`,
`sine`, `path`, `waypoint`, `follow`, `groundCrawl`, `homing`, `aimedDash`); a `path` mover
without `path` uses the spawn event's path. Bounds are checked by the schema (velocities
±16 px/tick, `homing.turnRate` 0 … 512 whole binary units, waypoint points inside the view
± 64 px, …).

### Script ids and behaviour checks

Weapon and enemy behaviours share one interned table, `ContentDb.scripts`. `loadContent`
reports an unknown script id only when it is given `knownScripts`; the hosts pass
`KNOWN_SCRIPT_IDS` (`core/behaviors`) = the eight enemy behaviours ∪ `WEAPON_SCRIPT_IDS` (the
four Type A ids, defined in `core/weapons` since M1-10 and re-exported by `behaviors`).
`checkEnemyBehaviors(db, registry?)` then reports what the schema cannot know:

| Issue path | Message |
|---|---|
| `enemies:<id>.params.<name>` | `unknown param for behaviour "<id>" (known: …)` |
| `enemies:<id>.child` | `behaviour "<id>" needs a child enemy` (a `needsChild` behaviour — `hatch.spawner`) |

The shell's `loadGameContent` does both by default (its `knownScripts` option can override
the list), and `pnpm content:check` does the same over the shipped files, so a typo in a
behaviour id or a tunable name stops the boot on the error screen instead of silently
spawning an enemy that never moves.

### Paths (`content/paths/`, kind `paths`) and `bakePath`

A path is `{ id, points: [{ x, y }] }`: 2 – 64 control points relative to where the mover
starts (consecutive points distinct). At load, `bakePath(xs, ys)` (`core/data/paths.ts`):

1. runs a **centripetal** Catmull-Rom spline through the points (knot intervals
   `|pᵢ₊₁ − pᵢ|^0.5`, Barry–Goldman evaluation) with mirrored phantom end points — no cusps
   or self-intersections between close points, unlike the uniform variant; a two-point path
   is a straight line;
2. samples each segment densely (`PATH_SUBDIVISIONS` = 64) into a polyline with cumulative
   lengths;
3. resamples it at a uniform arc length of `PATH_SAMPLE_STEP` = 1 px: sample `i` lies `i` px
   along the curve, the last sample is the exact end point, `count` = ⌊length⌋ + 1 (or + 2);
4. keeps the unit end tangent (`endDx`, `endDy`).

The result, `PathTable { length, samples (x, y interleaved, relative to the first point),
count, endDx, endDy }`, is attached to `PathSpec.table`. Only `+ − × ÷` and `Math.sqrt` are
used, so the table is bit-identical on every engine. A curve longer than `MAX_PATH_LENGTH`
(16,384 px) or with coincident neighbours is an issue and the path is left out (the file's
other paths still load). Stage `spawn` / `formation` events and `path` movers refer to paths
by id (`path` → `pathId`, `-1` = none).

### Stage events

`spawn` and `formation` events (M1-07's timeline) gained `screenX` (spawn x in playfield
pixels, default 400 = `DEFAULT_SPAWN_SCREEN_X`, 16 px past the right edge; negative = behind
the player) next to `y` (default: mid-playfield) and a real `path` reference; `formation` also
gained `drop` (default `'capsule'`, `null` = nothing) and `bonus` (points, default 0). All
members of a formation spawn at the same view point.

## The enemy system (`core/enemies`)

`createEnemySystem(host, behaviors, stage)` is called by `createWorld` (`world.enemies`); the
host is the World itself (`EnemyHost`: tick, camera, players, ship spec, terrain, content,
RNG streams, events, debug flags and — since M1-09 — the bullet system). It allocates everything up front:

- `MAX_ENEMIES` (64, the §22 budget) `Enemy` **class instances**, one per slot, and one
  reused `ScriptApi` per slot;
- the formation table (`MAX_FORMATIONS` = 32 slots, struct of typed arrays) with one
  `FollowTrack` per slot;
- two `SpriteBatch`es, `LayerId.GroundEnemies` and `LayerId.AirEnemies` (64 each), which the
  World puts in `view.batches` **before** the players' batch;
- the specs compiled into a `SpecTable` of typed arrays (hp, score, hurtbox, sprite, anim,
  anchor, settle, explosion, drop, starting mover + 6 parameters) with each spec's behaviour
  and its resolved params (defaults overlaid with the spec's `params`, keys always in the
  defaults' order);
- the stage's `spawn` / `formation` events compiled into typed arrays indexed by event index.

Per-tick code reads only those arrays and the `Enemy` fields — never content objects, whose
shapes vary (see the V8 notes in [stage-runtime.md](stage-runtime.md#gotchas)).

### Slots, not `createPool`

The plan says "`Enemy` objects in a `Pool` (64)". `createPool` hands objects out but gives no
iteration order, and every phase has to visit enemies in a fixed order for determinism. So
the system keeps a fixed array of slots, each with an `EnemyState`: `Free` → `Live` →
`Removed` (killed or escaped this tick) → `Free` again in phase 8. A spawn takes the
**lowest free slot**; every phase iterates slots `0 … 63`. `Enemy.slot` is stable for an
enemy's whole life (unlike SoA indices, which move on `flush()`), and it is the id enemies
are inserted into the grid with.

### The `Enemy` object

`Enemy` implements `MoverBody` and `ScriptHolder` (`core/patterns`), so movers and the runner
work on it directly:

| Field(s) | Meaning |
|---|---|
| `state`, `specIndex`, `slot` | `EnemyState`, the spec it was spawned from, its slot |
| `x`, `y`, `vx`, `vy`, `hw`, `hh` | World centre, last mover step (in the enemy's frame), hurtbox half sizes |
| `hp`, `flashTicks`, `age`, `spawnTick` | Hit points, hit-flash countdown (`HIT_FLASH_TICKS` = 4), ticks alive, spawn tick |
| `formation`, `member` | Formation slot and member index (0 = leader), `-1` outside formations |
| `anchor` | `BodyAnchor`: `Air` 0, `Floor` 1, `Ceiling` 2 |
| `mover`, `m0 … m5`, `s0 … s3`, `moverTicks`, `track` | Mover code, parameters, state, ticks since `setMover`, the formation's track |
| `script`, `wakeTick` | The behaviour generator (or `null`) and the tick it may run next |
| `flags` | `EnemyFlag` bits: `Invulnerable` 1, `Settled` 2, `WasOnScreen` 4, `OnScreen` 8, `Ghost` 16, `FaceRight` 32, `Leader` 64 |
| `firstSeenTick`, `spriteId`, `animFrame`, `pathId` | First on-screen tick (`-1` = not yet), drawing, the spawn event's path |
| `camX`, `camY` | The camera position a flying enemy last rode along with |

### Spawning

Every spawn goes through one internal function: whole spec index in range (a fractional or
out-of-range index returns `null` — a TEST-agent fix; it used to read `undefined` from the
spec tables and throw), lowest free slot (none → `null`, the spawn is dropped), fields reset,
starting mover set from the spec (`setMover`; a `path` mover with no path of its own gets the
spawn's `pathId`), the leader of a formation flagged and its track started, the behaviour's
generator created with the slot's `ScriptApi` and the resolved params, `wakeTick` = this tick
(the next tick for a script spawn).

| Spawn source | Position | Script first runs |
|---|---|---|
| Stage `spawn` event (phase 3) | camera + (`screenX`, `y`); ground enemies snap to the surface | this tick's phase 4 |
| Formation member (phase 3, `spawnPending`) | the formation's view point, the same for every member | this tick's phase 4 |
| `ScriptApi.spawn(enemy, dx, dy)` (phase 4) | the spawner's centre + offset (no surface snap) | next tick |
| `EnemySystem.spawn(enemy, x, y, pathId?)` (tests, tools) | world `x`, `y` (`NaN` = mid-view / surface snap) | on its tick's phase 4 |

**Frames.** Flying enemies ride the camera: in phase 5 each one first adds the camera's
movement since the position it last saw (`x += camera.x − camX`, then `camX = camera.x`), so
waves, paths and waypoints are laid out on screen and keep their shape while the stage
scrolls. Recording `camX` / `camY` at spawn — after this tick's camera move — is what stops an
enemy spawned in phase 3 or 4 from being moved by the same camera step twice. Ground enemies
are world-anchored (they scroll off with the terrain). At spawn a ground enemy snaps its
bottom edge onto the first floor below its spawn height (`findFloor`, up to 4096 px), or its
top edge under the first ceiling above it (`findCeiling`); without terrain it stands on the
view's bottom edge (hangs from the top edge).

### Formations

`startFormation(enemy, count, interval, screenX, screenY, pathId, drop, bonus)` takes the
lowest free slot of the table (full → the formation is dropped) and stores the "pending-spawn
ring" of the plan directly in the table: `spawned` and `nextTick`. `spawnPending()` (phase 3,
right after the stage runner) spawns one member per formation whose `nextTick` has come, so a
stage event's first member appears on the event's own tick and member `k` exactly
`k · interval` ticks later. A member that cannot spawn (no free enemy slot) counts as
**escaped**.

The table counts `total`, `spawned`, `killed`, `escaped`, and remembers where the last kill
happened. When every member is resolved (`spawned = total` and `killed + escaped = total`):

- all killed, none escaped → the formation's drop (`DropKind.Capsule` by default) is added to
  the tick's outcomes at the last kill's position, its `bonus` is added to `bonusPoints`, and
  `SimEventKind.FormationBonus` is pushed (`id` = formation slot, `x` / `y` = last kill,
  `param` = bonus);
- anything else → nothing;
- either way the slot is freed.

**Follow tracks and ghost leaders.** Member 0 (flag `Leader`) records its position every tick
into the formation's `FollowTrack` (256 entries, ring, in the leader's frame — view-relative
for flying leaders); `follow` movers of the other members read the entry at their own age, so
they fly exactly the leader's path, `k · interval` ticks behind. If the leader is killed or
escapes while members are still to spawn or still out, it does not disappear: it becomes a
**ghost** (`EnemyFlag.Ghost`) — not drawn, not in the grid, not damageable, `canFire()` false,
spawns nothing — that keeps flying and recording until the formation resolves (or until it is
`GHOST_MARGIN` = 128 px outside the view). The track holds 256 ticks, so `interval × (count −
1)` must stay below 256 for the last member to follow the whole path (past that it keeps its
last velocity).

### The script runner

A behaviour is a `Script = Generator<number, void, void>`: each `yield n` sleeps `n` ticks.
`resumeScript(holder, tick)` (`core/patterns`) is the only place `next()` is called: it does
nothing while `wakeTick > tick`; otherwise it resumes the generator once, then stores
`wakeTick = tick + ⌊n⌋` (`n < 1`, `0` or `NaN` → the next tick; `SLEEP_FOREVER` = `Infinity`
→ never). A generator that returns is dropped (`script = null`) and the enemy keeps its last
mover; exceptions propagate (a behaviour bug must not be swallowed). Phase 4 resumes, in slot
order, every `Live` enemy whose script is due — ghosts included, so a ghost leader's script
can still switch movers.

Why sleeping matters: V8 allocates the generator's `{ value, done }` result object (≈ 40 B)
on every resume. A script that waits 30 ticks costs one comparison per tick and one small
allocation per wake; a script that yields `1` in a loop allocates every tick.

### `ScriptApi` — what a behaviour sees

One reused object per slot (D29):

| Member | What |
|---|---|
| `self` | The `Enemy` (read `self.member`, `self.pathId`, `self.anchor`, `self.hh`, set `self.flags` bits such as `FaceRight`) |
| `spec` | Its `EnemySpec` — content data: read it when the script starts, not every wake |
| `tick`, `rng` | The current tick; the **gameplay** RNG stream (replay-safe) |
| `target()` | The nearest active, `alive` player ship, or `null` (during the fly-in, after death) |
| `setMover(kind, p0 … p5)` | Switch the mover (parameters per kind below) |
| `spawn(enemyIndex, dx, dy)` | Spawn another enemy relative to this one → the `Enemy` or `null` |
| `onScreen()`, `canFire()` | Hurtbox overlaps the view; the §11 fire rule (live, on screen, settled, not a ghost) |
| `aimed`, `nWay`, `ring`, `spiral`, `stack`, `spray`, `homing`, `delayed` | Fire a pattern from the enemy's centre (M1-09) — the `core/patterns` primitives, rank-scaled; each returns `-1` / `0` and fires nothing while `canFire()` is false (`spiral` still returns the advanced angle) |
| `laser(angle?, length?, …)` | A straight laser **attached** to this enemy (warning line → grow → beam → fade); detached when the enemy is removed or turns ghost |
| `fireWait(ticks)` | A fire interval on Normal scaled by the rank (`rankedWait`) — `yield` it between volleys |
| `bullets` | The World's `BulletSystem` for raw access (`setMotion`, `setChange`, custom patterns) |

Every wrapper shares the system's one `BulletOrigin`, set to the enemy's centre just before the
primitive runs. Bullets outlive the enemy that fired them. Details, the primitives' parameters
and the rank: [bullets-and-patterns.md](bullets-and-patterns.md#the-scriptapi-wrappers-and-the-fire-rule).

### Movement, off-screen and settle rules (phase 5)

For every `Live` enemy in slot order: `age++`, the hit flash counts down, a flying enemy rides
the camera, the mover context gets the nearest player as target, `updateMover` moves it,
`FaceRight` follows the sign of `vx`, a leader records its track entry, the animation frame
is `⌊age / anim.ticks⌋ mod anim.frames`, then the view rules:

| Rule | Condition |
|---|---|
| On screen (`OnScreen`, `WasOnScreen` on the first time → `firstSeenTick`) | the hurtbox overlaps the camera view (closed: touching counts) |
| Settled (`Settled`, for good) | `tick − firstSeenTick ≥ settleTicks` |
| `canFire()` | `Live` and `OnScreen` and `Settled` and not `Ghost` — every fire primitive checks it |
| Escaped → removed | was on screen and is now more than `DESPAWN_MARGIN` (32) px outside the view |
| Never seen → removed | more than `UNSEEN_MARGIN` (128) px outside the view, or `age ≥ UNSEEN_TICKS` (600) |
| Ghost removed | more than `GHOST_MARGIN` (128) px outside the view |

An escaped formation member counts in `escaped`, so its formation can no longer pay out.

### Collision and damage (phases 6–7)

Phase 6: `insertColliders(grid)` inserts every live, non-ghost hurtbox into the World's grid
with **whole-pixel** bounds (`Math.floor(x − hw) | 0` … `Math.ceil(x + hw) | 0`) — the grid is
only the broad phase, and whole numbers are never boxed as call arguments. After
`grid.build()`, `collidePlayers(grid)` queries it with each active, `alive` ship's hurt circle
and runs the exact closed circle-vs-box test (inlined `circleAabb`) on the candidates;
contact calls `playerHit(ship, PlayerHitCause.Contact, tick, debugFlags)`, at most **one
accepted hit per ship and tick**. Until M1-12 a hit is only recorded on the ship.

Phase 7 is where the player shots (M1-10, `weapons.applyHits()`) call `damage(enemy, amount,
by)` — `by` is the player credited with a kill (default `-1` = nobody). It is ignored for
non-live, ghost and `Invulnerable` enemies (armour: the weapons answer with a `Clink` and the
shot dies — [weapons-and-options.md](weapons-and-options.md#hits-phases-67-collide--applyhits));
otherwise `hp −= amount`, `flashTicks = 4` (drawn with
`SpriteFlag.Flash`, the `@flash` sibling of D30), `Sfx EnemyHit` while it survives; at 0 hp
→ `kill(enemy)` (also the Mega Crash / debug entry point):

1. the kill is recorded in `outcomes` (spec, x, y, score, and `killBy` — the player credited,
   M1-10);
2. `Sfx EnemyExplodeSmall | Medium | Large` and `Particles` with `FX_CUES.ExplosionSmall |
   Medium | Large` (intensity 1) are pushed at its position;
3. its own drop is added to the outcomes;
4. formation accounting: `killed++`, last-kill position, a leader may turn ghost, the
   completion check (which may add the formation's drop and `FormationBonus` right away).

`EnemySystem.outcomes` (`EnemyOutcomes`) lists the current tick's kills (`killSpec`, `killX`,
`killY`, `killScore`), drops (`dropKind`, `dropX`, `dropY` — enemy drops and completed
formations in kill order) and `bonusPoints`; it is reset at the start of phase 3. Nothing
consumes it yet: M1-11 turns drops into capsules, M1-12 turns kills and bonuses into score.

### Removal, drawing, restart and hashing

- **Removing an enemy** (killed, escaped, or a leader turning ghost) also calls
  `bullets.detachLasers(slot)`: its warning / growing lasers vanish, an active one fades
  (M1-09).
- **Phase 8** `flush()` turns `Removed` slots back into `Free` (and drops their script and
  track).
- **Phase 9** `sync()` refills the two batches in slot order: live, drawn (`spriteId ≥ 0`),
  non-ghost enemies, with `SpriteFlag.Flash` while `flashTicks > 0`, `FlipX` when facing right
  and `FlipY` for ceiling enemies; ground enemies go to `GroundEnemies`, flying ones to
  `AirEnemies` (both below the ships, §18 draw order). `pushSprite` is inlined.
- **Checkpoint restart**: the World's stage `clear()` hook calls `enemies.clear()` — every
  slot and formation freed, tracks reset, outcomes and batches emptied.
- **`hashWorld`** covers every slot's `state` and, for slots in use, every numeric field
  above (`script` as present / absent — a generator's internal position cannot be hashed, its
  `wakeTick` can), then the formation table's active slots and each track's `recorded` count.

## Movers (`core/patterns`)

A mover is a numeric `MoverKind` plus six parameters (`m0 … m5`) and four state slots
(`s0 … s3`) on the body — no generator, no closure, no allocation. `setMover(body, ctx, kind,
p0 … p5)` switches (resetting state and `moverTicks`, keeping the position continuous);
`updateMover(body, ctx)` advances one tick. Codes are `0` = `None`, then `MOVER_TYPES` in
order — append, never renumber (they are hashed).

| Kind (content name) | Parameters | Behaviour |
|---|---|---|
| `None` | — | no motion of its own (a flying body still rides the camera) |
| `Straight` (`straight`) | `vx, vy` | constant velocity |
| `Sine` (`sine`) | `vx, amp, period, phase` | `x += vx`; `y = line + amp · sin(phase + t · 1024 / period)` on the table sine; the line is chosen at `setMover` so the first step does not jump |
| `Path` (`path`) | `pathId, speed` | `s0 += speed` along the baked table, translated to start where the body is; past the end it continues along the end tangent |
| `Waypoint` (`waypoint`) | `x, y, speed, hold, leaveVx, leaveVy` | fly to view point `(x, y)` at `speed`, hold `hold` ticks (0 = leave on the next tick — a TEST-agent fix; it held one tick), leave at `(leaveVx, leaveVy)` |
| `Follow` (`follow`) | — | the formation track at the body's age; without data, keep the last velocity |
| `GroundCrawl` (`groundCrawl`) | `speed` | walk along the floor / ceiling, re-snapping every step with `findFloor` / `findCeiling`; a step up or down of more than `CRAWL_STEP` (8) px is a wall / cliff → turn round; also at the map edge. Flying bodies and open space just move horizontally |
| `Homing` (`homing`) | `speed, turnRate` | turn the heading towards the target by at most `turnRate` whole binary units per tick (`turnToward`), move at `speed`; starts from the current heading (left at rest) |
| `AimedDash` (`aimedDash`) | `speed, windup` | hold `windup` ticks, aim at the target once (quantised to `AIM_DIRECTIONS` = 32, D17; left without a target), dash straight |

Flying bodies' position-based movers (`Sine`, `Path`, `Waypoint`, `Follow`) measure from the
camera (`camera.x · air`, with `air` = 1 for flying, 0 for ground bodies — both arms a
product); ground bodies move in the world. `samplePath(path, distance, out)` exposes the
table lookup (the `Path` mover inlines the same code, see the hot-path rules).

## Behaviours (`core/behaviors`)

A `BehaviorDef` is `{ id, params, create(api, params), needsChild }`, declared with
`defineBehavior(id, defaults, generatorFunction, needsChild?)`; `createBehaviorRegistry(defs)`
builds a lookup (throws on duplicate ids). `DEFAULT_BEHAVIORS` (from `DEFAULT_BEHAVIOR_DEFS`)
is what the World uses; `createWorld(config, db, { behaviors })` swaps in another registry
(tests, tools — not part of `GameConfig`, so never in a real session).

The M1 roster (tunables and their defaults in brackets; the fire patterns are M1-09's — they go
through the `ScriptApi` primitives, so nothing fires off screen or before `settleTicks`; bullet
speeds are px/tick and intervals ticks, both Normal values scaled by the rank):

| Id | Archetype | What it does |
|---|---|---|
| `drifter.sine` | popcorn | `Sine` left at [`speed` 1.25], [`amp` 24], [`period` 96], [`phase` 0] + member × [`memberPhase` 0] |
| `fan.loop` | formation flier | the leader flies the spawn event's path at [`speed` 1.5] (straight left without one); every other member `Follow`s |
| `carrier.straight` | capsule carrier | `Straight` left at [`speed` 1]; its drop is data (`"drop": "capsule"`) |
| `turret.floor` | ground turret | stands still, turns to face the nearest player every [`aimTicks` 30]; floor or ceiling per its spec; every [`fireTicks` 90] (rank-scaled, counted in `aimTicks` steps) an aimed round pink bullet at [`bulletSpeed` 1.5] |
| `walker.floor` | walker | `GroundCrawl` towards the player for [`walkTicks` 90] at [`speed` 0.75], stops for [`stopTicks` 45] firing an aimed 3-way of red ovals [`spread` 48 units apart, `bulletSpeed` 1.25], repeats |
| `hatch.spawner` | hatch (`needsChild`) | every [`interval` 60] ticks, while `canFire()`, releases its `child` from its open side; at most [`max` 8] (0 = no limit) |
| `rammer.aimed` | rammer | enters with its spec mover for [`enterTicks` 40], then `AimedDash` with [`windup` 20] at [`speed` 2.5] |
| `orbiter.loop` | orbiter | flies the spawn event's path at [`speed` 1.25]; without one: `Waypoint` to [`x` 256, `y` 100], hold [`hold` 90], leave left at [`leaveSpeed` 2]; every [`ringTicks` 120] (rank-scaled) a ring of [`ringCount` 8] purple bullets at [`bulletSpeed` 1], each ring turned half a gap |

Writing one:

```ts
import { MoverKind, SLEEP_FOREVER, defineBehavior, type Script } from '@shmup/core';

export const weaver = defineBehavior(
  'weaver.zigzag',
  { speed: 1.5, legTicks: 40 },
  function* weaver(api, p): Script {
    let dy = 1;
    for (;;) {
      api.setMover(MoverKind.Straight, -p.speed, dy); // numbers only: no allocation per wake
      yield p.legTicks; // sleep — no next() until then
      dy = -dy;
    }
  },
);
```

Add it to `DEFAULT_BEHAVIOR_DEFS` (so `KNOWN_SCRIPT_IDS` and the shell's validation know it),
document it in the module docblock and in `content/enemies/README.md`, and test it
(`packages/core/test/behaviors/`). `yield SLEEP_FOREVER` once the mover can do the rest.

## The `test-range` roster

`content/enemies/test-range.enemies.json` defines ten enemies using all eight behaviours
(`drifter`, `fan`, `carrier`, `turret`, `turret-ceiling`, `walker`, `hatch` + its
`hatchling`, `rammer`, `orbiter`); `content/paths/test-range.paths.json` has three paths
(`fan-loop`, `orbit-loop`, `dive-down`); the stage timeline spawns them between camera x 60
and 4200 (formations of drifters and fans with bonuses, one drifter formation with `drop:
null`, carriers, turrets on the floor and the ceiling, walkers and hatches on the rolling
ground). The new pixel-map sprite `enemies/hatch` (2 frames, lid closed / open, `hitFlash`)
joined the atlas; the others reuse M1-03's small-enemy sprites. With nobody shooting every
enemy flies past; at most 11 are alive at once. Since M1-09 the turrets, walkers and the two
orbiters fire (at most about a dozen bullets are alive at once with a ship that stands still;
no laser is fired). Since M1-10 the KESTREL autofires, so enemies in front of it die (hit
flash first for those with more than 1 hp); a test that needs them all alive turns autofire
off (`{ autofire: false, remoteMode: false }`). No shipped enemy is armoured.

Fly it with `pnpm dev` → `http://localhost:5173/?stage=test-range`; headless:

```ts
const db = loadContent(files, { knownScripts: KNOWN_SCRIPT_IDS }).db;
const game = createGame(createHeadlessPlatform(), { stage: 'test-range', seed: 1 }, db);
for (let i = 0; i < 600; i++) game.step();
game.world.enemies.count; // enemies alive now
for (const e of game.world.enemies.enemies) if (e.state === EnemyState.Live) game.world.enemies.kill(e);
game.world.enemies.outcomes.killCount; // kills this tick (reset at the next tick's phase 3)
```

## Zero allocation and the hot-path rules

The allocation guard runs 64 enemies with every mover kind and sleeping scripts for 10,000
ticks under a 64 KB budget (`enemies.test.ts`); the measured cost is about 5 KB — the two
allocations decision D29's coroutines keep: a generator object per spawned enemy with a
behaviour, and V8's `{ value, done }` result per wake. Everything else writes numbers into
preallocated objects. Getting there turned up rules worth knowing (all documented at the
code):

| Rule | Where it bit |
|---|---|
| No fractional argument or return value across a call V8 may not inline — it is boxed into a 16-byte heap number | the path sampler, the sprite push and the leader-track record are inlined into `move` / `sync`; `nearestPlayer` takes the enemy, not its coordinates; sines read `SIN_TABLE_Q16[a] / TRIG_SCALE` directly (bit-identical to `sinB`) |
| `atan2B` gets whole numbers | movers scale the vector by `AIM_SCALE` (64) and `\| 0` it first (1/64-px resolution) |
| `Math.ceil` can return `-0`, which is not a small integer | `\| 0` on the grid bounds (`Math.ceil(x + hw) \| 0`) |
| Methods called once per tick stay in V8's lower tiers for a long time and box every double field they read | the per-tick track record is inlined in `move` (the method only records age 0) |
| Never write an `{ x: <schema>, y: <schema> }` object literal | V8 shares hidden classes between literals with the same keys in the same order; the path point schema made every `{ x, y }` literal's fields "tagged", so fractional writes allocated — the render-pixi terrain guard doubled. `PATH_POINT_SHAPE` is built by adding keys to an empty object |
| One class per hot object | `Enemy`, `EnemyScriptApi`, the system, the mover context and `FollowTrack` are classes (one hidden class, monomorphic methods) |

## Extending it

| To add… | Do this |
|---|---|
| An enemy | An entry in a `content/enemies/*.enemies.json` + a sprite (`hitFlash: true`) under `assets/source/sprites/enemies/`; spawn it from a stage event; `pnpm content:check` |
| A path | An entry in `content/paths/*.paths.json` (points relative to the start, ≤ 16,384 px); name it in a stage event's `path` or a `path` mover |
| A behaviour | `defineBehavior` in `core/behaviors`, added to `DEFAULT_BEHAVIOR_DEFS` (above); tunables with defaults; `needsChild` for spawners |
| A mover | Append the name to `MOVER_TYPES` (`core/data`) and a code to `MoverKind` (never renumber), a variant in `MOVER_SCHEMA`, its parameters in `compileSpecs` (`core/enemies`), its start state in `setMover` and a `move…` function in `updateMover` (numbers only, whole-number calls), the docs (module docblock, `content/enemies/README.md`, this page), tests incl. the allocation guard |
| An enemy spec field | `EnemySpec` + `ENEMY_SCHEMA` (+ `optional` and a default in `completeEnemy`), a typed array in the `SpecTable` if per-tick code needs it, the README sample and `example.enemies.json` |
| An `Enemy` field | The class field, its reset in the spawn function, and `mixEnemy` in `core/debug` (in a fixed place — or replays diverge unnoticed) |
| A drop kind | Append to `ENEMY_DROPS` and `DropKind` (code = position + 1), the schema picks it up; M1-11 decides what it becomes |
| A particle cue | Append to `FX_CUES` (never renumber); `content/fx/` binds it to a preset in M1-14 |
| A new use of the tick outcomes | Read `world.enemies.outcomes` after phase 7 of the same tick (it is reset in the next phase 3) |

## Tests

| Where | Covers |
|---|---|
| `packages/core/test/enemies/enemies.test.ts` | Stage spawns and formation spacing, pool exhaustion (a formation counts it as escaped), ground snapping, bonus + capsule only when every member died (not after an escape, not before the last spawn), follow delay and the ghost leader, the settle / fire rule, escape and never-seen removal, the runner never resuming a sleeping script (spy), script spawns starting next tick, target and RNG, damage / flash / explosion events / outcomes, invulnerability, contact once per tick, the air batch (animation, facing, hidden ghosts), checkpoint clears, lockstep hashes, the 64-enemy allocation guard |
| `packages/core/test/enemies/enemies-edge.test.ts` | Spawn defaults and bounds, camera ride without a double move, slot order and reuse, unknown behaviours, bad and fractional spec indices (regression), formation arguments and a full table, outcome order, two formations completing in one tick, ghosts removed at `GHOST_MARGIN`, the off-screen rules at their exact boundaries in all four directions, contact boundaries, the sprite mirror |
| `packages/core/test/patterns/patterns*.test.ts` | The runner (randomised spy, sub-tick waits, `SLEEP_FOREVER`, exceptions), `FollowTrack` ring limits, `setMover` state, every mover's maths (sine on the table, path speed vs `samplePath` on random curves, waypoint incl. `hold: 0` regression, follow, homing turn cap, 32 aim directions), crawling on the shipped tileset's slopes and hand-built steps of exactly `CRAWL_STEP` |
| `packages/core/test/behaviors/behaviors*.test.ts` | Registry (sorted, frozen, duplicates), `KNOWN_SCRIPT_IDS`, `checkEnemyBehaviors`, every roster behaviour driving its enemy in a World, the documented details of each; `behaviors-fire*.test.ts` (M1-09): the roster's patterns, intervals and rank scaling, the `ScriptApi` fire rule, `laser()` defaults and detaching |
| `packages/core/test/data/enemies-edge.test.ts`, `paths-edge.test.ts` | Enemy defaults (same keys, same order), `child` refs, every mover variant and bound, the code tables, stage `screenX` / `drop` / `bonus`; `bakePath` properties on random curves (uniform 1-px spacing ±0.5 px, ends, translation invariance, unit end tangent, exact `MAX_PATH_LENGTH`), the centripetal no-overshoot property, loader issues and `pathId` resolution |
| `packages/core/test/debug/debug-edge.test.ts` | `hashWorld` covers every enemy field and the formation table |
| `test/integration/enemies-runtime.test.ts` | The shipped `test-range` timeline end to end: every roster enemy spawns within 64 slots, every formation resolves, ground enemies on the generated terrain and walkers on the slopes, perfect play yields one `FormationBonus` per formation and the expected capsules, lockstep hashes |
| `test/integration/content.test.ts` | The shipped content validates with `KNOWN_SCRIPT_IDS` and `checkEnemyBehaviors`; an unknown script id is an issue |
| `test/e2e/enemies.spec.ts` | In Chromium: the first drifter formation appears inside the playfield (never in the HUD bars) and flies left; no console errors or unknown-sprite warnings |

## Gotchas

| Symptom | Cause / fix |
|---|---|
| Content with a misspelled `script` boots in a test but the enemy never moves | The test called `loadContent` without `knownScripts`; the enemy spawned without a script. Pass `KNOWN_SCRIPT_IDS` (the shell and `content:check` do) |
| `unknown param for behaviour …` | A `params` name the behaviour does not declare — check the roster's tunables above (names are case-sensitive) |
| A formation never pays its bonus | A member escaped (32 px outside the view after being seen), could not spawn (64 slots full), or never showed up (128 px / 600 ticks). Only a complete kill counts |
| Followers stop following half-way | The track holds 256 ticks: keep `interval × (count − 1) < 256` |
| An enemy vanishes right after spawning | It spawned more than 128 px outside the view (`screenX` / `y`), or never came into view within 600 ticks |
| A ground enemy floats or sinks | It snapped at spawn to the first surface below / above its spawn height; set `y` above the floor you mean (or below the ceiling) |
| Enemies jump by one scroll step | Something moved a flying enemy without updating `camX` / `camY`, or spawned one outside the enemy system; always spawn through `spawn` / `startFormation` / `ScriptApi.spawn` |
| A child spawned by a script does nothing on its first tick | By design: a script spawn's script starts on the next tick (it spawned during phase 4) |
| `yield 0` did not run the next step in the same tick | `0` (and anything below 1) means the next tick |
| The allocation guard fails after a behaviour change | A closure, array, object literal or string in the generator body, or a `yield 1` loop resuming every tick. Sleep longer, keep state in `let`s of whole numbers or on the `Enemy` |
| The ship flies through enemies | Expected until M1-12: contact is recorded (`ship.hitCause = Contact`, `hits`), not fatal; ignored during the fly-in, while invulnerable and in god mode. The same holds for bullets (`Bullet`, the bullet is removed) and lasers (`Laser`) |
| A behaviour's shot never appears | `canFire()` was false (off screen, unsettled, ghost) — the wrappers return `-1` / `0` then; or the content was loaded without `ENGINE_SPRITES`, so bullets are hidden ([bullets-and-patterns.md](bullets-and-patterns.md#gotchas)) |
| Enemies never die | The ship is not shooting at them: it is still flying in, the content has no weapons, or autofire is off; tests can also call `world.enemies.damage` / `kill` |
| Enemies die in a test that expects them to fly past | The KESTREL autofires by default since M1-10 — pass `{ autofire: false, remoteMode: false }` |
| A new `Enemy` field diverges in replays unnoticed | Add it to `mixEnemy` in `core/debug` |
| A path has an odd kink | Control points are relative to the *start*; the first point is normally `(0, 0)`. Centripetal splines never cusp between close points — a kink is a point where the curve really turns |
| An e2e screenshot test that tracks scrolling became flaky | With enemies drawn and parallel workers the loop may run up to 4 ticks per frame; compare frames closer together (the stage test moved from 60 to 30 frames) |

## Next steps that build on this page

- **M1-09** (done) — enemy bullets and lasers: fire primitives on `ScriptApi`, the roster fires
  (turret aimed, orbiter ring, walker aimed 3-way), `canFire()` gates them
  ([bullets-and-patterns.md](bullets-and-patterns.md)).
- **M1-10** (done) — player shots query the enemy grid entries and call `damage` with the
  player credited (`outcomes.killBy`), armour → `Clink`; `WEAPON_SCRIPT_IDS` moved to `weapons`
  ([weapons-and-options.md](weapons-and-options.md)).
- **M1-11** — capsules from `outcomes.drop*`; the Mega Crash `kill`s every enemy without
  `megaCrashImmune`.
- **M1-12** — score from `outcomes.killScore` / `bonusPoints`; contact kills the ship.
- **M1-13** — bosses and their parts share the damage path.
- **M1-14** — particle presets for `FX_CUES`; **M2-01** — rank modifiers and revenge bullets;
  **M2-02** — the pattern DSL; **M2-04** — the Option Hunter.
