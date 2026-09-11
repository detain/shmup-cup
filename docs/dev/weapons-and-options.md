# Player weapons, loadouts, autofire and Options

How the player shoots inside `@shmup/core`: the **weapon system** (`core/weapons`) with its
96-slot struct-of-arrays shot pool, the meter-mode **Type A** arsenal (main shot, Double,
piercing Laser, ground-sliding Missile) compiled from `content/weapons/`, per-player
**loadouts**, always-on **autofire** with per-shooter caps, grid-based **hits** on the enemies
(damage, armour clinks, piercing cooldowns, kill credit), and the trailing **Options** of
`core/options` that copy every weapon. Built in plan step **M1-10**.

This page is the *how and why*. Exact signatures are in
[api-reference.md](api-reference.md#weapons--player-weapons-partial-type-a); the TSDoc in
`packages/core/src/{weapons,options}/index.ts` is the authoritative reference. The enemies that
take the hits are [enemies-and-behaviors.md](enemies-and-behaviors.md); the World, its tick
phases and the grid are [sim-world.md](sim-world.md); the render contract is
[rendering-and-shell.md](rendering-and-shell.md); the weapon file format for authors is
[`content/weapons/README.md`](../../content/weapons/README.md).

Background: `shmup_feat.md` §7A (Type A: Missile, Double, Laser), §7C (on-screen caps,
piercing vs non-piercing, damage over time for beams, ground-following projectiles, Options copy
all weapons, weapons defined in data), §8 (the standard Option: up to four, follows the flown
path, invulnerable, passes through walls), §4 (remote rule 1: always-on autofire for the main
shot *and* the missiles), §22 (SoA pools, shots × enemies through the uniform grid); plan
§3.2 (tick phases) and decisions **D5** (up to four trailing Options in M1), **D12** (the
remote is primary: always-on autofire) and **D26** (world-space entities, the Option trail in
screen space).

## The picture at a glance

```text
createWorld(config, db)                                                         core/world
 ├─ world.weapons = createWeaponSystem(world)                                  core/weapons
 │    pools.register('playerShots', 96 slots)
 │    roles: preset 'type-a' (else the first preset, else the first weapon of each slot)
 │           → RoleTables (kind, damage, speed, cap, pierce, sprite, interval, sfx, tunables)
 │    2 × Loadout, 2 × OptionGroup (core/options), PlayerShots batch (192), Options batch (8)
 └─ applyLoadoutPreset(loadouts[p], players[p], config.loadout)   'default' | 'full'

stepWorld, every tick
 ├─ 2 players    updatePlayer × 2, then weapons.updatePlayers():
 │               recount live shots → timers-- → per ship: option trail (reset / record / hide)
 │               → every shooter (ship, then Options) fires main + missile when timer 0 and cap free
 ├─ 5 movement   … enemies.move(), bullets.update(), then weapons.update():
 │               camera ride, straight / Double flight, laser head + length, missile fall / slide,
 │               cull at view ± 16 px and on terrain, cooldown tables counted down
 ├─ 6 collision  enemy hurtboxes → grid.build() → … → weapons.collide(grid): hits found
 ├─ 7 damage     weapons.applyHits(): clink on armour, enemies.damage(e, dmg, player) → kill record
 ├─ 8 removal    pools.flushAll() frees the dead shots
 └─ 9 fx         weapons.sync(): PlayerShots batch (lasers as 8-px segments), Options batch
```

## Content: the Type A arsenal

A weapon (`content/weapons/*.weapons.json`, kind `weapons`) names a **slot** (`main`, `double`,
`laser`, `missile`), a coded **behaviour** (a script id), `damage`, `speed` (px/tick), `cap`
(live shots per shooter), `pierce`, a `sprite`, optionally `refireTicks`, an `sfx` cue and
behaviour-specific `params`. A **preset** (`presets`) names the weapon of each slot — a
meter-mode loadout type (Type A today; B–D arrive with M2-03). The shipped
`type-a.weapons.json`:

| Weapon | Slot / behaviour | Damage | Speed | Cap | Pierce | Sprite | SFX |
|---|---|---|---|---|---|---|---|
| `shot.basic` | main / `shot.straight` | 1 | 7 | 2 | no | `shots/basic` | `PlayerShot` |
| `shot.double` | double / `shot.double` | 1 | 7 | 2 | no | `shots/double` | `PlayerShot` |
| `laser.pierce` | laser / `laser.beam` | 1 | 10 | 1 | yes | `shots/laser` | `PlayerShot` |
| `missile.ground` | missile / `missile.groundSlide` | 2 | 2.5 | 1 | no | `shots/missile` | `PlayerMissile` |

No shipped weapon has `refireTicks`: the session's `GameConfig.autofireInterval` (4) and
`missileInterval` (10, the missile slot) pace them — values in the replay header, as
`shmup_feat.md` §4 asks. A weapon's own `refireTicks` overrides them.

**Behaviour tunables** live in `params`, with defaults in `WEAPON_BEHAVIOR_PARAMS` (angles in
binary units, 1024 per turn; `ox` / `oy` = spawn offset from the shooter's centre, `hw` / `hh` =
hitbox half sizes):

| Behaviour | Tunables (defaults) |
|---|---|
| `shot.straight` | `ox` 8, `oy` 0, `hw` 4, `hh` 2 |
| `shot.double` | `angle` 128 (the second shot climbs 45°), `ox` 4, `oy` −2, `hw` 3, `hh` 3 |
| `laser.beam` | `maxLength` 64, `hitCooldownTicks` 6 (clamped 1–255), `ox` 8, `oy` 0, `hh` 2 |
| `missile.groundSlide` | `slideSpeed` 3, `angle` 128 (falls 45°), `ox` 0, `oy` 4, `hw` 4, `hh` 1.5, `frames` 2 |

**Load-time checks.** `loadContent` rejects script ids the engine does not know when it is given
`knownScripts` (the hosts pass `core/behaviors` `KNOWN_SCRIPT_IDS` = the enemy behaviours ∪
`WEAPON_SCRIPT_IDS` — weapon and enemy behaviours share the content's one script table).
`checkWeaponBehaviors(db)` then reports what the schema cannot know:

| Issue path | Message |
|---|---|
| `weapons:<id>.behavior` | `"<id>" is not a weapon behaviour (known: …)` — e.g. an enemy behaviour |
| `weapons:<id>.params.<name>` | `unknown param for behaviour "<id>" (known: …)` |
| `weapons:<id>.slot` | `behaviour "<id>" belongs in slot …` |

The shell's `loadGameContent` and `pnpm content:check` run it after `checkEnemyBehaviors`, so a
typo stops the boot on the error screen instead of shipping a weapon that never fires.
`WEAPON_SCRIPT_IDS` lives in `core/weapons` since M1-10 (`core/behaviors` re-exports it).

**Roles.** At World creation `resolveWeaponPreset(content)` picks preset `type-a` (else the
first preset), and `resolveRoleWeapons(content, preset)` fills the four `WeaponRole`s — `Main`,
`Double`, `Laser`, `Missile` — from it (the main role falls back to the first `main`-slot
weapon; without any preset, the first weapon of each slot). `compileRoles` turns them into typed
arrays (`RoleTables`: kind, damage, speed, cap, pierce, sprite id, interval, SFX cue, angle,
max length, cooldown, slide speed and step, hitbox, offsets, frames) — per-tick code never reads
a content object. A role whose weapon is missing or has no weapon behaviour is **empty**:
content without weapons fires nothing (there is no built-in arsenal, unlike the ship's
`DEFAULT_PLAYER_SHIP`).

## Loadouts and the starting loadout

`Loadout` (a class, one per player slot in `weapons.loadouts`) is the meter-mode state the power
meter of M1-11 will equip:

| Field | Meaning |
|---|---|
| `main` | `MainWeapon`: `Basic` 0, `Double` 1, `Laser` 2 — mutually exclusive (§6A); an empty Double / Laser role falls back to the main shot |
| `missile` | whether the Missile is equipped |
| `options` | Options owned, 0–`MAX_OPTIONS` (4) |
| `shield` | Force Field hits left (0 = none; used from M1-11) |

The ship's **speed level** stays on the ship (`PlayerShip.speedLevel`, `core/player`).

`GameConfig.loadout` (`StartingLoadout`: `'default'` | `'full'`, validated by
`resolveGameConfig`) is applied to every player by `createWorld` through
`applyLoadoutPreset(loadout, ship, preset)`: `'default'` = the basic shot, nothing else, speed
level 0; `'full'` = speed level `FULL_LOADOUT_SPEED_LEVEL` (2), the Missile, the Laser and four
Options. The web app maps `?loadout=full` onto it (`loadoutFromSearch`, a dev override; the TV
has no query string). Being a `GameConfig` field, it is recorded in replay headers.

## Shooters, autofire and caps (phase 2, `updatePlayers()`)

Each player has `SHOOTERS_PER_PLAYER` (5) **shooters**: the ship (`k` 0) and its Options
(`k` 1–4). Shooter id = `player × 5 + k` (`MAX_SHOOTERS` 10); it is stored on every shot, and
the kill credit is `floor(shooter / 5)`.

`updatePlayers()` runs right after `updatePlayer` moved the ships:

1. **Recount** `liveCounts[shooter × 4 + role]` (live shots per shooter and role) and the
   pierce tables in use, from the pool.
2. **Timers.** Every autofire timer above 0 counts down (`timers[shooter × 2]` main,
   `[shooter × 2 + 1]` missile — hashed).
3. **Per active ship** — its option group first (next section), then, only while it is
   `alive`, firing: the main weapon is wanted when `config.autofire || config.remoteMode` or the
   player holds `Shot`; the missile when the Missile role exists, the loadout has it and
   `autofire || remoteMode` or `Sub` is held. Every shooter — ship first, then the Options in
   order — fires a wanted role when its timer is 0 **and** its cap has room; a successful fire
   restarts that timer at the role's interval. A shooter blocked by its cap keeps its timer at
   0 and fires the tick a slot frees (so a cap-limited weapon refires as soon as a shot dies).

Remote mode forces autofire (feat §4 rule 1, as `GameConfig.remoteMode` documents); the defaults
have both on, so today every build fires without a button. With both off, `Shot` fires the
main weapon and `Sub` the missiles while held.

**Caps are per shooter and role.** The basic shot's cap 2 with four Options means up to ten
basic shots per player; the Laser and the Missile allow one each per shooter. The pool
(`MAX_PLAYER_SHOTS` 96) covers both players fully powered.

**The Double rule.** `shot.double` fires a pair — a forward shot (drawn, offset and sized like
the main shot) and the angled shot `angle` units up from forward — and fires again only when
**every** earlier shot of the role is gone ("no refire until both are gone"). With `cap` 1 only
the forward shot is fired; a cap above 2 still fires pairs.

**SFX.** A successful fire pushes the role's `Sfx` cue at the shooter — at most once every
`SFX_RATE_TICKS` (4) ticks **per cue**, so five shooters firing together make one sound. The
event's position is floored to whole pixels (see the V8 notes below).

## Options (`core/options`)

One `OptionGroup` per player (`weapons.options[p]`, a class so its numbers stay unboxed): a ring
buffer of `OPTION_TRAIL_CAPACITY` (4 × 12 + 1 = 49) past ship positions in **screen space**
(`ship − camera`, decision D26), `head` (newest entry), `count` (Options flying this tick) and
their world positions `x[k]`, `y[k]`.

- **Recording.** The trail advances only on ticks the ship had movement input
  (`PlayerShip.moving`), so while the ship is idle the Options hold their place **on screen** —
  during scrolling they ride along with the ship instead of being strung out behind it
  ("bunched"), and when it moves they spread out along its path. Pushing against the edge of
  the view records the same position again and again, so they converge on the ship.
- **Placing.** `follow(ship, camera, count, record)` places Option `k` (0-based) at the entry
  `(k + 1) × OPTION_SPACING` (12) records back, plus the current camera. `count` is clamped to
  0–4.
- **Fly-ins.** An `entering` / `respawning` ship moves on its own, so the trail records every
  fly-in tick, including the tick it ends (the ship is then `alive` with `stateTicks` 0), and is
  **reset** on the fly-in's first tick: every entry becomes the ship's position, so every Option
  starts on the ship at a stage start or a respawn. A fly-in of `enterTicks` ≤ 1 is over inside
  the phase 2 that starts it; the reset then happens on the ship's first `alive` tick.
- **Hiding.** A `dying` / `dead` or inactive ship's group `hide()`s (`count` 0; the trail is
  kept until the next reset).
- **Firing.** Options are shooters 1–4 with their own caps and timers; they are invulnerable and
  pass through terrain (they are not a collision layer), but the **shots** they fire from inside
  rock die on their first move.

The Formation / Snake / Rotate types and the Option Hunter's `stolen` count are M2-04
(`formation` is always `'trail'` and `stolen` 0 today; both are hashed already).

## The shot pool and one shot tick (phase 5, `update()`)

`weapons.pool` is a `SoaPool` of `MAX_PLAYER_SHOTS` (96) registered as `playerShots` — flushed
in phase 8, cleared on a checkpoint restart and hashed by `hashWorld` like every registered pool.
Fields (`SHOT_SCHEMA`, hashed in sorted name order):

| Field | Type | Meaning |
|---|---|---|
| `x`, `y` | f64 | World centre — a laser's **head** |
| `vx`, `vy` | f64 | Velocity (px/tick, before the camera ride) |
| `length` | f64 | Laser length (tail at `x − length`); 0 for other shots |
| `hw`, `hh` | f64 | Hitbox half sizes (a laser's box spans its length) |
| `damage` | i32 | Damage per hit |
| `role`, `kind` | u8 | `WeaponRole`; `ShotKind` (`Straight` 0, `Double` 1, `Laser` 2, `Missile` 3 — hashed: append, never renumber) |
| `shooter` | u8 | `player × 5 + k` |
| `flags` | u8 | `ShotFlag`: `Pierce` 1, `Blocked` 2 (a laser head stopped by terrain), `Sliding` 4 (a missile on the floor), `Dead` 8 (removed this tick) |
| `sprite`, `frame`, `draw` | u16, u16, u8 | Sprite id, animation frame, `SpriteFlag` bits (`Hidden` when the role has no sprite or the shot is dead) |
| `age` | i32 | Ticks moved |
| `table` | i32 | Hit-cooldown table index + 1 (0 = not piercing) |

Shots live in world pixels and **ride the camera** like enemy bullets (`x += camera.dx` every
tick), so their on-screen speed does not depend on the scroll. Per live shot, per kind:

- **Straight / Double** — move by velocity; removed outside the view ± `SHOT_CULL_MARGIN` (16 px)
  or on a non-empty terrain pixel (player shots die on terrain).
- **Laser** — its row follows the shooter while that shooter is in play (an `alive` ship, or an
  Option it still flies; afterwards it keeps its row). The head rides the camera and advances
  `speed` (10) px, scanning every column it crosses: the first non-empty one stops it there
  (`Blocked`). The length grows by the step up to `maxLength` (64). A blocked head stays at its
  wall (world-anchored) while the tail rides the camera and advances, so the beam shrinks away
  and is removed at length 0. Culled by its tail on the right and its head on the left. The
  whole beam, tail to head, is the hitbox — the Gradius quirk that misses enemies entering the
  middle of the beam is deliberately not copied (§7A).
- **Missile** — falls along its heading (`angle` 128 = 45° down at 2.5 px/tick) riding the
  camera; it **lands** when its bottom pixel meets terrain — the surface above the contact is
  found with `findFloor` from `ceil(slideSpeed) + 1` px higher (a solid pixel at the top of that
  scan means a wall: removed). Sliding, it moves `slideSpeed` (3) px/tick **screen-relative**
  and re-snaps to `findFloor` within that step up or down each tick: it climbs and descends
  slopes, dies at a higher step (a wall), and falls again over a cliff. Its frame advances every
  4 ticks through `frames`. A missile at a non-finite position never touches terrain and is
  culled.

A piercing shot's cooldown table counts down by one per entry every tick it is alive.

## Hits (phases 6–7, `collide()` / `applyHits()`)

Phase 6 inserts the enemies' hurtboxes into the World's grid (M1-08) and builds it; then
`weapons.collide(grid)` queries it with each live shot's box (a laser's spans tail to head;
whole-pixel bounds, floored / ceiled) and tests the candidates exactly — closed (touching hits),
never ghosts or removed enemies. Because grid queries equal brute force, the hits equal a test
of every shot against every enemy (a test checks this).

- A **non-piercing** shot records one hit: the overlapping enemy with the **lowest slot**.
- A **piercing** shot records every overlapping enemy whose entry in its cooldown table is 0 —
  armoured ones always — in slot order.

The hit list (`hitShot` / `hitEnemy`, at most `MAX_SHOT_HITS` 1024 a tick, the rest counted in
`hitsDropped`) is applied in phase 7 by `applyHits()`, in order:

1. a hit whose shot is already dead, or whose enemy is no longer live (killed by an earlier hit
   this tick), is skipped — **the shot flies on**;
2. an **armoured** enemy (`EnemyFlag.Invulnerable`) takes nothing: the shot dies with a `Clink`
   SFX (`SFX_CUES.Clink` 21, rate-limited like the weapons' cues) — a piercing laser too;
3. otherwise `enemies.damage(enemy, damage, player)`: hit flash and `Sfx EnemyHit`, or at 0 hp
   the kill — explosion events, drop, formation accounting and the kill record in
   `EnemySystem.outcomes`, now with **`killBy`** (the player credited; `-1` = nobody, e.g. a
   Mega Crash). Then a non-piercing shot dies; a piercing one sets its cooldown for that enemy
   to `hitCooldownTicks` (6) — damage over time for beams.

**Cooldown tables.** Instead of a 64-entry table per shot slot, a pool of `PIERCE_TABLES` (32)
tables of `MAX_ENEMIES` (64) entries (`weapons.cooldowns`, a `Uint8Array`) is shared: a
piercing shot takes the first free table when it is fired (zeroed then) and stores its index + 1
in `table`; a piercing shot with no free table is **not fired**. Only the tables of live
piercing shots are hashed.

## Drawing shots and Options

`world.view.batches` is now: ground enemies, air enemies, **player shots**, **Options**, player
ships, enemy bullets.

- `weapons.batch` is a mirror `SpriteBatch` on `LayerId.PlayerShots` with
  `SHOT_BATCH_CAPACITY` (192) slots, refilled in phase 9 by `sync()`: one sprite per shot, and a
  laser as `ceil(length / LASER_SEGMENT_LENGTH)` `shots/laser` segments (8 px, anchored on their
  left edge) laid back from the head, the last clamped to the tail. A full batch drops sprites
  (drawing only).
- `weapons.optionBatch` (`LayerId.Player`, 8 slots) holds the Options flying this tick as
  `options/orb` with a two-frame pulse (`OPTION_ANIM_TICKS` 8). It sits before the ships' batch
  in the list, and same-layer batches draw in list order, so the Options are drawn below the
  ships.
- The shot sprites come from the content (`shots/*`); `options/orb` (`OPTION_SPRITE`) is an
  **engine sprite** — `ENGINE_SPRITES` = the bullet sprites + `options/orb`, interned by hosts
  through `loadContent`'s `extraSprites` (the shell's loader does by default). Without it the
  Options still fly and fire but are not drawn.

The renderer needs no change: it binds one sprite binding per batch
([rendering-and-shell.md](rendering-and-shell.md#drawing-a-new-entity-kind)).

## Determinism and hashing

`hashWorld` covers the shot pool (as a registered pool) and, after the formation table, the
weapons' own state (`mixWeapons`): per player the loadout (`main`, `missile`, `options`,
`shield`) and the option group (`count`, `stolen`, `head`, the whole trail, the positions), then
every autofire timer, then the cooldown table of every live piercing shot. Not hashed: the role
tables (derived from content and config), `liveCounts` (recounted every phase 2), the hit list
(rebuilt every phase 6) and the batches. Two sessions fed the same input keep equal hashes,
shot pools and trails (`weapons.test.ts`, `weapons-runtime.test.ts`); a different
`autofireInterval` diverges.

## Zero allocation and the hot-path rules

Everything is built by `createWeaponSystem`; the tick writes numbers into typed arrays and class
fields. What the allocation guards (`weapons-alloc.test.ts`: the `'full'` loadout on a stage
with slopes and walls, the ship weaving, enemies respawned, hit, killed and clinking — under
64 KB over 10,000 ticks after a 20,000-tick warm-up; `weapons-alloc-coop.test.ts`: both players,
every main weapon, fractional scrolling) taught:

| Rule | Why |
|---|---|
| The system is a class (`WeaponSystemImpl`); positions travel through its fields (`fx`, `fy`, the query box) | Fractional numbers passed as arguments of a call V8 does not inline are boxed into 16-byte heap numbers |
| SFX events are pushed at whole pixels (`Math.floor(x) \| 0`) | The event push is such a call: a fractional `x` / `y` allocated per sound (the guard caught it) |
| `OptionGroup.follow(ship, camera, …)` takes the objects, not their coordinates | Same reason — the method reads the fields itself |
| One `update()` with every behaviour inline; one grid visitor created in the constructor | A hot per-tick loop stays in the method the World calls (the `core/bullets` lesson); a visitor created per query would allocate |
| Grid queries get whole-pixel bounds (`Math.floor` / `Math.ceil` with `\| 0`) | Whole numbers are never boxed, and `\| 0` turns a `-0` into `0` |

The allocation helper itself changed in M1-10: `measureHeapGrowth(fn, iterations, warmup?,
attempts = 3, settled = 32 KiB)` keeps the steadiest of up to three measured windows and stops at
the first one within `settled` bytes (the stage-runner and terrain-scan guards had been failing
now and then on `master` when one window ran in a lower V8 tier); the measured loop must stay in
the same function as the warm-up loop (V8 optimises the warm-up on stack with `fn` inlined — a
separate helper made every guard allocate); short, cheap loops get a long warm-up (the terrain
guard uses 20,000). Details: [sim-world.md](sim-world.md#zero-allocation-and-the-allocation-guard).

## Using it headlessly

```ts
import {
  ENGINE_SPRITES,
  KNOWN_SCRIPT_IDS,
  MainWeapon,
  WeaponRole,
  createGame,
  createHeadlessPlatform,
  loadContent,
} from '@shmup/core';

const db = loadContent(files, { knownScripts: KNOWN_SCRIPT_IDS, extraSprites: ENGINE_SPRITES }).db;
const game = createGame(createHeadlessPlatform(), { stage: 'test-range', loadout: 'full' }, db);
for (let i = 0; i < 900; i++) game.step(); // remote mode (the default) autofires: no input needed
const { weapons, enemies } = game.world;
weapons.count; // live player shots (at most 96)
weapons.options[0].count; // → 4 Options flying
weapons.loadouts[0].main = MainWeapon.Double; // what the power meter (M1-11) will do
weapons.spawnShot(WeaponRole.Missile, 0, game.world.camera.x + 100, 60); // debug: ignores caps
enemies.outcomes.killBy; // who killed each enemy this tick (Int8Array, -1 = nobody)
```

To test "nobody shoots", pass `{ autofire: false, remoteMode: false }` (remote mode alone forces
autofire) and hold no `Shot` / `Sub`.

## Extending it

| To add… | Do this |
|---|---|
| A weapon of an existing behaviour | JSON in `content/weapons/` (a new file or a new entry) with its `params`; reference it from a preset; `pnpm content:check` |
| A weapon behaviour | A `ShotKind` code (append — it is hashed), an entry in `WEAPON_BEHAVIOR_KINDS`, `WEAPON_BEHAVIOR_PARAMS` (its tunables with defaults) and `WEAPON_BEHAVIOR_SLOTS`; its per-tick motion as a branch of `update()` (numbers only, no calls with fractional arguments); spawning in `emit` if it needs a special heading; `WEAPON_SCRIPT_IDS` follows automatically; tests in `test/weapons/` |
| A loadout field | A field on `Loadout` (a class), set in `applyLoadoutPreset`, added to `mixWeapons` in `core/debug` |
| A starting loadout | Extend `StartingLoadout` and its check in `resolveGameConfig`, then `applyLoadoutPreset` (and `loadoutFromSearch` in `apps/web` for a dev override) |
| Another loadout type (B–D, M2-03) | A preset in the weapons file; the session picks it instead of `DEFAULT_WEAPON_PRESET` |
| An Option formation (M2-04) | A branch in `OptionGroup.follow` keyed by `formation`; keep it allocation-free and hash any new state |
| Something that reacts to kills | Read `world.enemies.outcomes` (`killCount`, `killSpec`, `killX` / `killY`, `killScore`, `killBy`) — reset at the start of phase 3, complete after phase 7 |

## Tests

| Where | Covers |
|---|---|
| `packages/core/test/weapons/weapons.test.ts` | The plan's acceptance: Type A roles, no weapons → no fire, caps per shooter incl. Options, the Double rule, laser pierce + cooldown and growth, missiles sliding on slopes and dying at walls, Options bunching / spreading and the fresh trail for every fly-in length, grid hits = brute force, kills (events, record, killer), clinks, SFX rate limit, autofire intervals and `refireTicks`, buttons without autofire, shots on terrain, the `'full'` loadout, full pools / tables, `checkWeaponBehaviors`, lockstep hashes |
| `packages/core/test/weapons/weapons-edge.test.ts` | Constant tables, presets and empty roles, spawn offsets / velocities / boxes per behaviour, first volley on the tick the fly-in ends, dying / dead / inactive ships, refire the tick after a free, missiles with `Sub` alone, Double edge caps, player 2's shooters and credit, camera ride on both axes, exact culling (lasers by head and tail, non-finite spawns), laser heads on walls while scrolling, missile steps and cliffs, hit edge cases (closed boxes, lowest slot, ghosts, damage 0, armour, `MAX_SHOT_HITS`), cooldown tables and clamps, drawing (segments, batch overflow, the orb pulse), restarts, hash coverage |
| `packages/core/test/weapons/weapons-alloc*.test.ts` | The allocation guards above (own workers) |
| `packages/core/test/options/` | The trail entry by entry (every head position), reset, convergence at an edge, vertical scrolling, count clamping, hide / reset, independent groups, zero allocation |
| `packages/core/test/config/`, `debug/`, `world/`, `helpers/alloc.test.ts` | `autofireInterval` / `missileInterval` / `loadout` validation; the weapons in `hashWorld`; the World's batch list; the allocation helper's windows and early stop |
| `test/integration/weapons-runtime.test.ts` | The shipped arsenal loaded like the shell does; the `'full'` loadout and the Double playing the whole `test-range` within every cap, bound and surface; remote mode firing with no button; lockstep sessions |
| `test/integration/enemies-runtime.test.ts`, `content.test.ts` | Enemies killed by the autofiring KESTREL (the "nobody shoots" tests turn autofire off); `checkWeaponBehaviors` on the shipped content |
| `apps/web/test/boot/`, `apps/tizen/test/boot/` | `loadoutFromSearch`; the web build passes `?loadout=` to the config, the TV build does not |
| `test/e2e/weapons.spec.ts` | In Chromium: the web build autofires `shots/basic` to the right of the ship (never in the HUD bars) and they move; `?loadout=full` draws orbs and laser beams; the Tizen build autofires with no key and ignores `?loadout=full`; no console errors or unknown-sprite warnings |

## Gotchas

| Symptom | Cause / fix |
|---|---|
| The ship never fires in a test | The content has no weapons file (`EMPTY_CONTENT_DB` fires nothing), the ship is still flying in (firing starts on the tick the fly-in ends), or autofire is off and no `Shot` is held |
| A test that expects enemies to survive now sees them die | The ship autofires by default. Pass `{ autofire: false, remoteMode: false }` — remote mode alone forces autofire |
| Options fly and fire but are invisible | The content was loaded without `extraSprites: ENGINE_SPRITES` (`options/orb` is an engine sprite); the shell passes it by default |
| The gun fires in bursts of two, then pauses | The basic shot's cap is 2 per shooter (Gradius style): it refires the tick a shot hits or leaves the screen, so close targets are shot faster |
| The Double sometimes waits although one shot is gone | By design: the pair refires only when **both** earlier shots are gone |
| No laser was fired although the cap has room | All `PIERCE_TABLES` (32) cooldown tables are in use — only possible with hand-spawned piercing shots |
| Five shooters fire but only one shot sound | `SFX_RATE_TICKS`: one push per cue every 4 ticks |
| Two shots hit a 1-hp enemy on the same tick and one flew on | By design: the second hit finds the enemy already dead and is skipped |
| A laser hits an enemy only every 6th tick | `hitCooldownTicks` per enemy — damage over time |
| Shots fired by an Option inside rock vanish | Options pass through terrain; their shots do not |
| `?loadout=full` does nothing on the TV | It is a web-only dev override (`apps/web`); the TV has no query string |
| `RangeError: GameConfig.loadout must be 'default' or 'full'` | Only those two presets exist |
| Code that picks a batch from `view.batches` by index broke | M1-10 inserted the player-shot and Option batches before the ships: the order is ground enemies, air enemies, shots, Options, ships, enemy bullets |
| A stored shot slot points at another shot | Slots are only stable within the tick (phase 8 swap-removes freed slots) |
| The allocation guard fails after a weapons change | A fractional argument to a non-inlined call (events, helpers), a closure or literal in the tick, or the loop split into a small wrapper — see the table above |

## Next steps that build on this page

- **M1-11** — the power meter equips `Loadout` fields (Speed, Missile, Double / Laser, Options,
  Force Field in `shield`), capsules come from `outcomes.drop*`, the Mega Crash `kill`s enemies
  (`killBy` -1).
- **M1-12** — score from `outcomes.killScore` credited by `killBy`; the death penalty presets
  reset or reduce the loadout; respawns fly in with a fresh Option trail.
- **M1-13** — boss parts share the damage path; gated parts clink.
- **M1-14 / M1-15** — particle presets and sounds for the explosion, `PlayerShot`,
  `PlayerMissile` and `Clink` events.
- **M2-03** — loadouts B–D, Weapon Edit, weapon select; **M2-04** — Snake / Formation / Rotate
  Options and the Option Hunter; **M2-05** — Direct-mode weapon families.
