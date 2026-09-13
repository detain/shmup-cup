# Player weapons, loadouts, autofire and Options

How the player shoots inside `@shmup/core`: the **weapon system** (`core/weapons`) with its
96-slot struct-of-arrays shot pool, the meter-mode **Type A** arsenal (main shot, Double,
piercing Laser, ground-sliding Missile) compiled from `content/weapons/`, per-player
**loadouts**, always-on **autofire** with per-shooter caps, grid-based **hits** on the enemies
(damage, armour clinks, piercing cooldowns, kill credit), and the trailing **Options** of
`core/options` that copy every weapon. Built in plan step **M1-10**; plan step **M2-03** added the
**Types B–D** behaviours, the presets and Weapon Edit as `GameConfig` fields and
`WeaponSystem.setArsenal` — their own page is [meter-arsenal.md](meter-arsenal.md); plan step
**M2-04** added the Snake, Formation and Rotate **Option types** (`GameConfig.optionChoice`) and
the Option Hunter that steals Options —
[options-shields-hunter.md](options-shields-hunter.md). This page describes the trail, the
machinery every type shares. Plan step **M2-05** added the Direct mode's 9-level shot
**families** fired through the same pool and hit path (direct roles after the four meter roles,
level volleys, the MANTA's `Loadout.shot` / `sub` / `family`) — [direct-mode.md](direct-mode.md#families-and-firing-coreweapons).

This page is the *how and why*. Exact signatures are in
[api-reference.md](api-reference.md#weapons--player-weapons-implemented); the TSDoc in
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
 │    roles: resolveArsenal(content, config) — preset config.weaponPreset ('type-a'; else the
 │           first preset, else the first weapon of each slot) + config.weaponEdit (M2-03)
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
behaviour-specific `params`, and since M2-03 an optional `name` (the weapon select's label). A
**preset** (`presets`) names the weapon of each slot — a meter-mode loadout type: Type A in
`type-a.weapons.json`, Types B–D in `types-b-d.weapons.json` (M2-03 — their nine behaviours,
tunables and hit rules are in [meter-arsenal.md](meter-arsenal.md#the-nine-behaviours)). The
shipped `type-a.weapons.json`:

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

**Roles.** At World creation `resolveArsenal(content, config)` (M2-03) calls
`resolveWeaponPreset(content, config.weaponPreset)` — the session's preset, `type-a` by default,
else the content's first preset — and `resolveRoleWeapons(content, preset)` fills the four
`WeaponRole`s — `Main`, `Double`, `Laser`, `Missile` — from it (the main role falls back to the
first `main`-slot weapon; without any preset, the first weapon of each slot); a
`config.weaponEdit` then replaces the Missile / Double / Laser roles (a bad edit throws
`RangeError`). `compileRoles` turns them into typed
arrays (`RoleTables`: kind, damage, speed, cap, pierce, sprite id, interval, SFX cue, angle,
max length, cooldown, slide speed and step, hitbox, offsets, frames) — per-tick code never reads
a content object. A role whose weapon is missing or has no weapon behaviour is **empty**:
content without weapons fires nothing (there is no built-in arsenal, unlike the ship's
`DEFAULT_PLAYER_SHIP`). `roleWeapons` is the resolved list; since M2-03 it is not frozen —
`WeaponSystem.setArsenal(roles)` rewrites it and recompiles the tables in place (the weapon
select's preview; never in a recorded session).

## Loadouts and the starting loadout

`Loadout` (a class, one per player slot in `weapons.loadouts`) is the meter-mode state the power
meter of M1-11 equips ([powerups-and-shields.md](powerups-and-shields.md)):

| Field | Meaning |
|---|---|
| `main` | `MainWeapon`: `Basic` 0, `Double` 1, `Laser` 2 — mutually exclusive (§6A); an empty Double / Laser role falls back to the main shot |
| `missile` | whether the Missile is equipped |
| `options` | Options owned, 0–`MAX_OPTIONS` (4) |

The ship's **speed level** and **shield** stay on the ship (`PlayerShip.speedLevel`,
`core/player`; `PlayerShip.shield`, `core/shields` — M1-11 moved the shield there and removed
`Loadout.shield`).

`GameConfig.loadout` (`StartingLoadout`: `'default'` | `'full'`, validated by
`resolveGameConfig`) is applied to every player by `createWorld` through
`applyLoadoutPreset(loadout, ship, preset)`: `'default'` = the basic shot, nothing else, speed
level 0 and no shield (`clearShield`); `'full'` = speed level `FULL_LOADOUT_SPEED_LEVEL` (2),
the Missile, the Laser, four Options and — since M1-11 — a fresh Force Field (`grantShield`). The web app maps `?loadout=full` onto it (`loadoutFromSearch`, a dev override; the TV
has no query string). Being a `GameConfig` field, it is recorded in replay headers.

## Shooters, autofire and caps (phase 2, `updatePlayers()`)

Each player has `SHOOTERS_PER_PLAYER` (5) **shooters**: the ship (`k` 0) and its Options
(`k` 1–4). Shooter id = `player × 5 + k` (`MAX_SHOOTERS` 10); it is stored on every shot, and
the kill credit is `floor(shooter / 5)`.

`updatePlayers()` runs right after `updatePlayer` moved the ships:

1. **Recount** `liveCounts[shooter × WEAPON_ROLE_SLOTS + role]` (live shots per shooter and role —
   a stride of 36 since M2-05: the four meter roles, then up to 32 Direct-mode roles) and the
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

One `OptionGroup` per player (`weapons.options[p]`, a class so its numbers stay unboxed), of the
session's type (`GameConfig.optionChoice`, M2-04 — this section is the default `trail`; the Snake,
Formation and Rotate placement and the spread / extend control are in
[options-shields-hunter.md](options-shields-hunter.md#option-types-coreoptions)): a ring
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

Every type shares the rest: the trail records under every type (so a type change never finds a
stale one), `reset` / `hide` / firing work the same, and since M2-04 `updatePlayers()` calls
`group.steer(intent)` before `follow` (the Formation / Rotate spread: `Special` pressed toggles,
`PowerUp` held 15 ticks extends). `stolen` counts the Options an Option Hunter took from the group
(`core/enemies` `huntOptions` also lowers the loadout's `options` and the group's `count` at once —
[options-shields-hunter.md](options-shields-hunter.md#the-option-hunter-coreenemies-corebehaviors)).

## The shot pool and one shot tick (phase 5, `update()`)

`weapons.pool` is a `SoaPool` of `MAX_PLAYER_SHOTS` (96) registered as `playerShots` — flushed
in phase 8, cleared on a checkpoint restart and hashed by `hashWorld` like every registered pool.
Fields (`SHOT_SCHEMA`, hashed in sorted name order):

| Field | Type | Meaning |
|---|---|---|
| `x`, `y` | f64 | World centre — a laser's **head** |
| `vx`, `vy` | f64 | Velocity (px/tick, before the camera ride); a Twin Laser beam's `vy` is its lane (row offset from its shooter, M2-03) |
| `length` | f64 | Laser length (tail at `x − length`); 0 for other shots |
| `hw`, `hh` | f64 | Hitbox half sizes (a laser's box spans its length) |
| `damage` | i32 | Damage per hit |
| `role`, `kind` | u8 | `WeaponRole`; `ShotKind` (`Straight` 0, `Double` 1, `Laser` 2, `Missile` 3, and since M2-03 `SpreadBomb` 4, `TwoWay` 5, `Torpedo` 6, `FreeWay` 7, `Ripple` 8, `Twin` 9 — hashed: append, never renumber) |
| `shooter` | u8 | `player × 5 + k` |
| `flags` | u8 | `ShotFlag`: `Pierce` 1, `Blocked` 2 (a laser head stopped by terrain), `Sliding` 4 (a missile on the floor), `Dead` 8 (removed this tick), `Blast` 16 (a Spread Bomb that burst — M2-03) |
| `sprite`, `frame`, `draw` | u16, u16, u8 | Sprite id, animation frame, `SpriteFlag` bits (`Hidden` when the role has no sprite or the shot is dead) |
| `age` | i32 | Ticks moved (a Spread Bomb's blast: ticks since the burst) |
| `table` | i32 | Hit-cooldown table index + 1 (0 = not piercing) |

Shots live in world pixels and **ride the camera** like enemy bullets (`x += camera.dx` every
tick), so their on-screen speed does not depend on the scroll. Per live shot, per kind:

- **Straight / Double** — move by velocity; removed outside the view ± `SHOT_CULL_MARGIN` (16 px)
  or on a non-empty terrain pixel (player shots die on terrain).
- **Laser** (and the Cyclone Laser, a `Laser` with other tunables) — its row follows the shooter
  while that shooter is in play (an `alive` ship, or an Option it still flies; afterwards it keeps
  its row) — since M2-03 at `shooter y + oy + vy`, which is the shooter's row for Type A (`oy` and
  the lane 0) and a Twin beam's own lane. The head rides the camera and advances
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

**Destructible terrain (M2-07).** Every shot that **dies on terrain** — a straight flight (main
shot, Double and the other straight kinds), a laser head the rock blocks (once per beam), a Spread
Bomb bursting on it, a missile flying into a wall — hands the pixel where it met the rock and its
damage to `WeaponHost.gimmicks.hitTerrain(px, py, damage, player)` (the World's `StageGimmicks`):
a destructible tile there takes the damage, and its `score` goes to that player when it breaks.
Without a gimmick host (a bare `WeaponSystem` in a test) or in open space terrain never breaks. Moving blocks are terrain for every shot too, but never break
([advanced-stages.md](advanced-stages.md#shots-meeting-the-terrain-coreweapons)).

A piercing shot's cooldown table counts down by one per entry every tick it is alive.

The Types B–D kinds (M2-03) are branches of the same `update()`: the Spread Bomb's arc, burst and
world-anchored blast, the 2-Way volleys and the Ripple's growing ring on the straight path, the
Photon Torpedo on the missile path, the Twin beams on the laser path —
[meter-arsenal.md](meter-arsenal.md#the-nine-behaviours).

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
   debug kill — a Mega Crash credits the player who fired it, M1-11). Then a non-piercing shot dies; a piercing one sets its cooldown for that enemy
   to `hitCooldownTicks` (6) — damage over time for beams.

**M2-03 exceptions.** A falling **Spread Bomb** bursts on its first hit (no damage — its blast
does it) and its **blast** is piercing but keeps burning on armour: it clinks at most once per
cooldown instead of dying. A **Photon Torpedo** flies on through every enemy its hit destroys. A
**Ripple** is hit-tested with its ring, not its box: a target wholly inside the ring's inner edge
(`RIPPLE_RING_WIDTH` 4 px in) is not hit — with the box, the lowest-slot rule gave every ring to
HALCYON BULWARK's fringe armour ([meter-arsenal.md](meter-arsenal.md#the-nine-behaviours)).

**Cooldown tables.** Instead of a 64-entry table per shot slot, a pool of `PIERCE_TABLES` (32)
tables of `MAX_ENEMIES` (64) entries (`weapons.cooldowns`, a `Uint8Array`) is shared: a
piercing shot takes the first free table when it is fired (zeroed then) and stores its index + 1
in `table`; a piercing shot with no free table is **not fired**. A Spread Bomb reserves its blast's
table the same way when it is fired (M2-03). Only the tables of live
piercing shots are hashed.

**Boss parts** (M1-13) are hit targets too. The boss system inserts each part that is a target
this tick into the same grid with the id `BOSS_PART_ID_BASE` (64) + part index (`MAX_HIT_TARGETS`
80), after refreshing its `target` / `armoured` flags; the grid visitor sends ids ≥ 64 to a
part branch (the same closed exact box test), and the hit list stores the id in `hitEnemy`, so
a non-piercing shot still takes the **lowest** id — an enemy in the same box before a part.
Piercing shots keep a second table set for the parts, `weapons.partCooldowns` (`PIERCE_TABLES`
× `MAX_BOSS_PARTS` 16, the same table index — the enemy tables kept their layout), skipped for
an `armoured` part like armour. `applyHits()` sends a part hit to
**`world.bosses.damagePart(part, damage, player)`** and reads its `BossHit` answer: `None` (the
part went earlier this tick, or no boss is in its intro / fight) → the shot flies on; `Clink`
(the intro, armour, an `afterParts` part with shields left, a closed `whenOpen` part) → the
shot dies with `SFX Clink`, a piercing one too; `Damaged` / `Destroyed` → a non-piercing shot
dies, a piercing one sets its part cooldown. The part's points and the boss's tally go to the
shot's player ([bosses-and-warning.md](bosses-and-warning.md#weak-points-hits-and-the-clink)).

## Drawing shots and Options

`world.view.batches` is now: ground enemies, air enemies, **player shots**, **Options**, player
ships, enemy bullets.

- `weapons.batch` is a mirror `SpriteBatch` on `LayerId.PlayerShots` with
  `SHOT_BATCH_CAPACITY` (192) slots, refilled in phase 9 by `sync()`: one sprite per shot, and a
  laser as `ceil(length / LASER_SEGMENT_LENGTH)` `shots/laser` segments (8 px, anchored on their
  left edge) laid back from the head, the last clamped to the tail — a Twin beam the same way, and
  a Cyclone's segments stepping its swirl frames along the beam and every 4 ticks (M2-03). A full
  batch drops sprites (drawing only).
- `weapons.optionBatch` (`LayerId.Player`, 8 slots) holds the Options flying this tick as
  `options/orb` with a two-frame pulse (`OPTION_ANIM_TICKS` 8). It sits before the ships' batch
  in the list, and same-layer batches draw in list order, so the Options are drawn below the
  ships.
- The shot sprites come from the content (`shots/*`); `options/orb` (`OPTION_SPRITE`) and, since
  M2-03, the Spread Bomb's blast `shots/blast` (`SPREAD_BLAST_SPRITE`, `WEAPON_SPRITES`) are
  **engine sprites** — part of `ENGINE_SPRITES` (with the bullet, item, shield and UI sprites),
  interned by hosts through `loadContent`'s `extraSprites` (the shell's loader does by default).
  Without it the Options still fly and fire but are not drawn (and neither are the blasts).

The renderer needs no change: it binds one sprite binding per batch
([rendering-and-shell.md](rendering-and-shell.md#drawing-a-new-entity-kind)).

## Determinism and hashing

`hashWorld` covers the shot pool (as a registered pool) and, after the formation table, the
weapons' own state (`mixWeapons`): per player the loadout (`main`, `missile`, `options`; the
shield is hashed with the power-ups since M1-11) and the option group (`count`, `stolen`, `head`, the whole trail, the positions), then
every autofire timer, then (M2-03) each player's Free Way direction (`freeWayHeading`), then the
cooldown table of every live piercing shot or Spread Bomb (and, since M1-13, its boss-part
table). Not hashed: the role
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
weapons.loadouts[0].main = MainWeapon.Double; // what the power meter's Double slot does (M1-11)
weapons.spawnShot(WeaponRole.Missile, 0, game.world.camera.x + 100, 60); // debug: ignores caps
enemies.outcomes.killBy; // who killed each enemy this tick (Int8Array, -1 = nobody)
```

To test "nobody shoots", pass `{ autofire: false, remoteMode: false }` (remote mode alone forces
autofire) and hold no `Shot` / `Sub`.

## Extending it

| To add… | Do this |
|---|---|
| A weapon of an existing behaviour | JSON in `content/weapons/` (a new file or a new entry) with its `params`; reference it from a preset; `pnpm content:check` |
| A weapon behaviour | A `ShotKind` code (append — it is hashed), an entry in `WEAPON_BEHAVIOR_KINDS`, `WEAPON_BEHAVIOR_PARAMS` (its tunables with defaults), `WEAPON_BEHAVIOR_SLOTS` and `WEAPON_BEHAVIOR_LABELS` (+ its HUD label frame — M2-03); new tunables as `RoleTables` arrays reset in `compileRoles`; its per-tick motion as a branch of `update()` (numbers only, no calls with fractional arguments); spawning in `emit` / `fireRole` if it needs a special heading or a pair; `WEAPON_SCRIPT_IDS` follows automatically; tests in `test/weapons/` — the full checklist is in [meter-arsenal.md](meter-arsenal.md#extending-it) |
| A loadout field | A field on `Loadout` (a class), set in `applyLoadoutPreset`, added to `mixWeapons` in `core/debug`; a meter slot that equips it in `core/powerups` (`canEquipSlot` / `equipSlot`) |
| A starting loadout | Extend `StartingLoadout` and its check in `resolveGameConfig`, then `applyLoadoutPreset` (and `loadoutFromSearch` in `apps/web` for a dev override) |
| Another loadout type | A preset in a weapons file; `GameConfig.weaponPreset` picks it and the weapon select lists it (M2-03 — [meter-arsenal.md](meter-arsenal.md#extending-it)) |
| An Option type | Append to `OptionChoice` / `OPTION_CHOICES` and `OptionMode`, a branch in the private `OptionGroup.place()` (**not** in `follow` — it must stay small enough to inline), hash any new state — the checklist is in [options-shields-hunter.md](options-shields-hunter.md#extending-it) |
| Something that reacts to kills | Read `world.enemies.outcomes` (`killCount`, `killSpec`, `killX` / `killY`, `killScore`, `killBy`) — reset at the start of phase 3, complete after phase 7 |

## Tests

| Where | Covers |
|---|---|
| `packages/core/test/weapons/weapons.test.ts` | The plan's acceptance: Type A roles, no weapons → no fire, caps per shooter incl. Options, the Double rule, laser pierce + cooldown and growth, missiles sliding on slopes and dying at walls, Options bunching / spreading and the fresh trail for every fly-in length, grid hits = brute force, kills (events, record, killer), clinks, SFX rate limit, autofire intervals and `refireTicks`, buttons without autofire, shots on terrain, the `'full'` loadout, full pools / tables, `checkWeaponBehaviors`, lockstep hashes |
| `packages/core/test/weapons/weapons-edge.test.ts` | Constant tables, presets and empty roles, spawn offsets / velocities / boxes per behaviour, first volley on the tick the fly-in ends, dying / dead / inactive ships, refire the tick after a free, missiles with `Sub` alone, Double edge caps, player 2's shooters and credit, camera ride on both axes, exact culling (lasers by head and tail, non-finite spawns), laser heads on walls while scrolling, missile steps and cliffs, hit edge cases (closed boxes, lowest slot, ghosts, damage 0, armour, `MAX_SHOT_HITS`), cooldown tables and clamps, drawing (segments, batch overflow, the orb pulse), restarts, hash coverage |
| `packages/core/test/weapons/weapons-alloc*.test.ts` | The allocation guards above (own workers) |
| `packages/core/test/weapons/weapons-arsenal*.test.ts`, `test/integration/arsenal-runtime.test.ts` | The Types B–D behaviours, presets, Weapon Edit and `setArsenal` (M2-03 — [meter-arsenal.md](meter-arsenal.md#tests)) |
| `packages/core/test/options/` | The trail entry by entry (every head position), reset, convergence at an edge, vertical scrolling, count clamping, hide / reset, independent groups, zero allocation; since M2-04 `options-types*.test.ts` — the Snake, Formation and Rotate placement and `steer` ([options-shields-hunter.md](options-shields-hunter.md#tests)) |
| `packages/core/test/config/`, `debug/`, `world/`, `helpers/alloc.test.ts` | `autofireInterval` / `missileInterval` / `loadout` validation; the weapons in `hashWorld`; the World's batch list; the allocation helper's windows and early stop |
| `test/integration/weapons-runtime.test.ts` | The shipped arsenal loaded like the shell does; the `'full'` loadout and the Double playing the whole `test-range` within every cap, bound and surface; remote mode firing with no button; lockstep sessions |
| `test/integration/enemies-runtime.test.ts`, `content.test.ts` | Enemies killed by the autofiring KESTREL (the "nobody shoots" tests turn autofire off); `checkWeaponBehaviors` on the shipped content |
| `apps/web/test/boot/`, `apps/tizen/test/boot/` | `loadoutFromSearch`; the web build passes `?loadout=` to the config, the TV build does not |
| `packages/core/test/bosses/bosses*.test.ts`, `test/integration/boss-runtime.test.ts` | Shots against boss parts (M1-13): clinks in the intro, on armour and on gated parts, a laser's per-part cooldown, an enemy in the same box first, Option credit, a part gone mid-tick letting the next shot through; the full loadout shooting the test boss down ([bosses-and-warning.md](bosses-and-warning.md#tests)) |
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
| `RangeError: GameConfig.loadout must be 'default' or 'full'` | Only those two presets exist (the weapon *types* are `GameConfig.weaponPreset`, M2-03) |
| A test's weapons are not Type A | The config's `weaponPreset` / `weaponEdit` (M2-03) — or a scene flow whose weapon select chose another type |
| Code that picks a batch from `view.batches` by index broke | M1-10 inserted the player-shot and Option batches before the ships: the order is ground enemies, air enemies, shots, Options, ships, enemy bullets (then the shield, item, point-item and boss batches, and since M2-04 the Options Option Hunters carry — `enemies.carriedBatch` — last) |
| A stored shot slot points at another shot | Slots are only stable within the tick (phase 8 swap-removes freed slots) |
| The allocation guard fails after a weapons change | A fractional argument to a non-inlined call (events, helpers), a closure or literal in the tick, or the loop split into a small wrapper — see the table above |

## Next steps that build on this page

- **M1-11** (done) — the power meter equips `Loadout` fields (Missile, Double / Laser, Options)
  and the ship's speed level and Force Field (`PlayerShip.shield`); capsules come from
  `outcomes.drop*`; Mega Crash `kill`s enemies credited to the player who fired it
  ([powerups-and-shields.md](powerups-and-shields.md)).
- **M1-12** (done) — score from `outcomes.killScore` credited by `killBy`; the death penalty
  presets reset (`arcade`) or reduce (`classic`: `loseOneLevel` — Option → Double / Laser →
  Missile → Speed) the loadout; respawns fly in with a fresh Option trail, and the ship fires
  while it blinks ([death-and-scoring.md](death-and-scoring.md)).
- **M1-13** (done) — boss parts share the grid, the hit list and the piercing cooldowns
  (`partCooldowns`); their hits go through `BossSystem.damagePart`, gated parts clink
  ([bosses-and-warning.md](bosses-and-warning.md)).
- **M1-14** (done) — `sfx` triggers draw a muzzle flash 9 px ahead of every `PlayerShot`,
  sparks at an `EnemyHit` and sparks bouncing back off armour at a `Clink`; the kills pop their
  score ([fx-and-game-feel.md](fx-and-game-feel.md)).
- **M1-15** (done) — the sounds of the explosion, `PlayerShot`, `PlayerMissile` and `Clink`
  events, panned from where they happen ([audio.md](audio.md)).
- **M2-03** (done) — the Types B–D behaviours, the presets Type A–D and Weapon Edit as
  `GameConfig` fields, `setArsenal`, the weapon select with its live preview
  ([meter-arsenal.md](meter-arsenal.md)).
- **M2-04** (done) — Snake / Formation / Rotate Options (`optionChoice`, `steer`), the meter
  shields and the Option Hunter ([options-shields-hunter.md](options-shields-hunter.md)).
- **M2-05** (done) — Direct-mode weapon families: every weapon a family fires gets a direct role
  (`WEAPON_ROLE_SLOTS`), level volleys on the main / missile timers, `direct.bolt` /
  `direct.bomb`, `applyDirectLoadout` ([direct-mode.md](direct-mode.md)).
- **M2-07** (done) — shots that die on terrain damage destructible tiles (`WeaponHost.gimmicks`),
  credited to their shooter ([advanced-stages.md](advanced-stages.md)).
