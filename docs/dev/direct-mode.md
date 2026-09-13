# Direct mode, the MANTA and the ship select

How the second power-up model arrived in plan step **M2-05**: the Darius-style **MANTA** flies
**Direct mode** — no power meter; carriers drop **colour items** that act the moment they are
collected (red and green raise 9-level shot families, blue grows the **Arm** shield through three
tiers, orange is a 1UP, yellow a smart bomb, the red octagon switches the main-shot family) — and a
**ship select** between the difficulty menu and the weapon select chooses KESTREL (meter) or
MANTA (direct) for every game. `core/powerups` is `implemented` with it, and `core/shields` and
`core/weapons` cover both models now.

This page is the *how and why* and the map of the whole step. Exact signatures are in
[api-reference.md](api-reference.md#powerups--power-meter-capsules-direct-mode-items-mega-crash); the
TSDoc in `packages/core/src/{powerups,weapons,shields,config,scenes,ui,rank,data}/index.ts` is the
authoritative reference. The content formats for authors are next to the data:
[`content/player/README.md`](../../content/player/README.md) (`mode`, `startSpeedLevel`),
[`content/weapons/README.md`](../../content/weapons/README.md) (`families`, `direct.bolt` /
`direct.bomb`), [`content/stages/README.md`](../../content/stages/README.md) (`directItems`, the
`direct-range` dev stage) and [`content/enemies/README.md`](../../content/enemies/README.md)
(`drop: "powerup"`, the `cube` carriers). The systems this step extends have their own pages:

| Part | Home page |
|---|---|
| The meter, capsules, the item pool, the Force Field inside `playerHit`, Mega Crash | [powerups-and-shields.md](powerups-and-shields.md) |
| The shot pool, roles, caps, autofire, Options | [weapons-and-options.md](weapons-and-options.md) |
| The meter shields and the drifting freed Options (the Direct items reuse their drift) | [options-shields-hunter.md](options-shields-hunter.md) |
| `GameConfig`, the weapon select and its live preview | [meter-arsenal.md](meter-arsenal.md) |
| The scene flow and the HUD | [scenes-and-ui.md](scenes-and-ui.md) |
| The rank's power term | [difficulty-and-rank.md](difficulty-and-rank.md#rank-corerank) |
| Behaviours, formations and drops | [enemies-and-behaviors.md](enemies-and-behaviors.md) |
| Golden replays and why they were re-blessed | [debug-and-replays.md](debug-and-replays.md#golden-replays-testgolden) |

Background: `shmup_feat.md` §2 (the Meter vs Direct fork), §5 (ship selection), §6B (Direct-mode
items: colours, carriers — six-cube pincer waves and coloured lead enemies —, drift and despawn,
visible tier pips), §6C (pickup feedback; power feeds rank), §7B (the Direct-mode weapons: Beam →
Disc and Laser → Wave, 9 levels each, and the 9-level sub-weapon), §9 (the Arm: green / silver /
gold, absorbs terrain), §10 (death penalties), §4 (the remote: Ch− is an optional extra); plan
decisions **D1** (meter first, Direct as the second ship), **D3** (the direct ship's speed with a
3-step toggle), **D6** (death penalties), **D8** (the Arm absorbs terrain, the meter shields do
not) and **D36** (the names KESTREL and MANTA).

## The picture at a glance

```text
 title ─ START ─► DIFFICULTY ─ OK ─► SHIP SELECT ─ OK ─┬─ KESTREL (meter)  ─► WEAPON SELECT ─ START ─► game
                                       (skipped with    └─ MANTA   (direct) ───────────────────────────► game
                                        one ship)          withShip: GameConfig.shipId + powerUpMode

 createWorld  resolvePlayerShip(content, shipId) · WeaponSystem compiles content.weaponFamilies
              (a direct role per weapon) · PowerUpSystem reads the stage's directItems plan
              applyDirectLoadout (levels 0, family 0, startSpeedLevel)

 tick phase 2  powerups.updatePlayers: Speed press → the next speed level (PowerUp press ignored)
               weapons.updatePlayers → fireDirect: main family level `shot`, sub family level `sub`
 tick phase 3  powerups.beginTick → takeDrops: capsule / powerup drop → dropDirect (plan[cursor++])
 tick phase 5  powerups.update: items drift with the view, bounce, vanish after 600 ticks
 tick phase 6  powerups.collide → pickups;  playerHit → the Arm absorbs bullets, bodies and terrain
 tick phase 7  powerups.resolve → collectDirect(player, colour);  a death → applyDirectDeathPenalty
               updateWorldRank → directPowerRank(shot, sub, arm tier)
 HUD           SHOT ▪▪▪▪▪▪▪▪  SUB ▪▪▪▪▪▪▪▪  ARM ▪▪▪  SPD ▪▪▪  DISC
```

## Configuration (`core/config`)

| Field | Default | Meaning | Values |
|---|---|---|---|
| `shipId` | `'kestrel'` (`DEFAULT_SHIP_ID`) | The ship every player flies (`content/player/` id) | any non-empty id; `createWorld` falls back to the content's first ship |
| `powerUpMode` | `'meter'` | The power-up model (`POWER_UP_MODES`) — `'direct'` accepted since M2-05 | `meter`, `direct` |

The two travel together: the ship select applies a `ShipChoice` `{ shipId, powerUpMode }` with
`withShip(config, choice)` (frozen and validated, the same object when `shipMatches` says nothing
changes), taking the mode from the ship's `mode`. They are separate fields so that a replay or a
test can pin either, and nothing forbids an odd pairing (the KESTREL in Direct mode flies its own
speeds with the families) — the World follows the **config's** mode, not the ship's.
`resolveGameConfig` throws a `RangeError` for an unknown mode or an empty / non-string `shipId`.
Both are sim-affecting, so they are in the replay header; the replay **format version is
unchanged** — a header written before M2-05 has no `shipId` and resolves to `kestrel` / `meter`,
exactly what it played.

## Content (`core/data`)

| Where | New since M2-05 |
|---|---|
| `PlayerShipSpec` | `mode` (`meter` default / `direct`) and `startSpeedLevel` (default 0, must index `speeds` — an issue otherwise). `manta.player.json`: speeds 1.75 / 2.25 / 2.75 px/tick, `startSpeedLevel` 1 — D3's "fixed 2.25 with a 3-step toggle" as data |
| `weapons` files | `families` (`WeaponFamilySpec`: `id`, optional `name` ≤ 16, `label` ≤ 5 characters for the HUD, `slot` `main` \| `sub`, 1–`MAX_FAMILY_LEVELS` (9) `levels`); a level (`WeaponLevelSpec`) is one volley of 1–`MAX_LEVEL_SHOTS` (8) emitters (`WeaponEmitterSpec` `{ weapon, angle?, ox?, oy? }`) with optional `refireTicks` and `volleys` (1–16) → `ContentDb.weaponFamilies` / `weaponFamilyIndex`. A fifth loader pass (`checkWeaponFamilies`) reports a weapon of another slot in a family |
| `stage` files | `directItems` (1–`MAX_DIRECT_ITEM_PLAN` (256) of `DIRECT_ITEMS`: `red`, `green`, `blue`, `orange`, `yellow`, `octagon`); omitted → `StageSpec.directItems` `[]` = the engine's `DEFAULT_DIRECT_ITEM_PLAN` |
| `EnemyDrop` | `powerup` — `DropKind.PowerUp` 3. **`DropKind.FreeOption` moved from 3 to 4**: the content drops keep their codes (`ENEMY_DROPS` index + 1); freed Options are never content and never saved |

`direct.weapons.json` holds the MANTA's 20 weapons and the three families, level by level after
§7B:

| Family | Slot | Levels 0 … 8 |
|---|---|---|
| `beam-disc` (BEAM > DISC, HUD `DISC`) | main | weak missile → wide missile → twin wide missiles → one, two, three small discs (fanned ±16 / ±32 units) → disc → big disc → huge disc |
| `laser-wave` (LASER > WAVE, HUD `WAVE`) | main | weak missile → blue laser → wider blue laser → long yellow laser → round piercing laser → ever bigger piercing crescent waves (four sizes) |
| `sub-weapon` (HUD `SUB`) | sub | an arcing bomb (`gravity` 0.06) → two diagonal bombs → four (forward and back) → two diagonal lasers + two bombs → four diagonal lasers → four piercing wide lasers → eight → four piercing discs → four big ones |

## Drop resolution and the item plan (`core/powerups`)

Stage data stays **mode-agnostic**: an enemy or a formation says `drop: "powerup"`, and the drop
is resolved only when it becomes an item (`PowerUpSystem.takeDrops`, phase 3 for kills between
ticks and phase 7 for the tick's own):

| Drop | Meter mode | Direct mode |
|---|---|---|
| `capsule` | a power capsule | the stage's **next planned item** (the direct ship has no meter) |
| `powerup` | a power capsule | the stage's next planned item |
| `blueCapsule` | the blue capsule | the blue capsule (it clears the screen's enemies in both modes) |

`dropDirect(x, y)` spawns `plan[planCursor % plan.length]` and advances `planCursor` (hashed). The
plan **cycles and never rewinds**: a checkpoint restart or a continue keeps the cursor, so the
player never collects the same opening items twice. `plan` is a `Uint8Array` of `DIRECT_ITEMS`
indices compiled once from the stage's `directItems` (else `DEFAULT_DIRECT_ITEM_PLAN`, 17 entries:
red and green a level each for every two blue items, an octagon, a yellow and an orange along the
way). Because a `capsule` resolves like `powerup`, **zone A's events are unchanged** (its 4-way
rules and bot budgets hold); it only gained a 27-entry `directItems` plan — eight red, eight green,
eight blue, an octagon, a yellow and an orange.

## The items

`ItemKind.DirectRed` … `DirectOctagon` (codes 3–8, `DIRECT_ITEM_KINDS` in `DIRECT_ITEMS` order —
hashed, append only), sprites `items/direct-<colour>` (`DIRECT_ITEM_SPRITES`, 2 frames), each
worth `DIRECT_ITEM_SCORE` (300) points on pickup. They move like the freed Options of M2-04 (one
`itemDrift` / `itemLife` table per kind drives both): the item rides with the view, drifts
`DIRECT_ITEM_DRIFT` (−0.35 px/tick, ±0.3 vertically — pair `cursor & 1`, so consecutive drops go
opposite ways), bounces off the playfield's top and bottom, blinks through its last
`ITEM_EXPIRY_BLINK_TICKS` (120) and vanishes after `DIRECT_ITEM_TICKS` (600) — or earlier when it
leaves the view. The pickup magnet (D33) pulls it like a capsule. Whoever touches an item gets it
(`PowerUpSystem.collectDirect(player, colour)`):

| Item | Effect | At the cap |
|---|---|---|
| red | `Loadout.shot` + 1 | the current family's top level (`directMaxLevel` = `levels.length − 1`, at most `DIRECT_MAX_LEVEL` 8): points only |
| green | `Loadout.sub` + 1 | the sub family's top level: points only |
| blue | `core/shields` `collectArm` — grant, repair, next tier | never capped (repairs) |
| orange | `lives + 1` with the `ExtraLife` cue | `MAX_LIVES` (9): points only |
| yellow | the smart bomb: `detonateMegaCrash` — bullets → point items, every non-`megaCrashImmune` enemy, the white flash | — (never affects a boss today) |
| octagon | `Loadout.family` → the next `main` family, the level kept (capped to the new family) | a single main family: points only |

Every pickup pushes `SFX CapsulePickup`; an effect that changed something pushes `SFX PowerUpEquip`
(red, green, blue, octagon) and `SimEventKind.PowerUp` with id `DIRECT_POWER_UP_EVENT_BASE` (16) +
the colour's index — the meter's slot codes stay below 16, so presentation can tell them apart.
A bad player slot or colour index (negative, fractional, NaN, ≥ 6) does nothing at all — no cue.

**Yellow and bosses.** The plan's "heavy damage to mid-bosses" waits for the mid-bosses of M2-09;
today the yellow item is exactly Mega Crash's screen clear and a boss takes nothing from it.

## Families and firing (`core/weapons`)

`createWeaponSystem` reads the families (`resolveFamilies(content)`: the `main` families in content
order — `WeaponSystem.mainFamilies` — and the first `sub` family — `subFamily`) and compiles them:

- **Direct roles.** Every distinct weapon the families fire gets a role of its own after the four
  meter roles (`WEAPON_ROLE_COUNT` + k, at most `MAX_DIRECT_WEAPONS` 32 — later ones are left out),
  compiled into the same `RoleTables` by `compileRole` (the meter roles' `compileRoles` and
  `setArsenal` leave them alone). `WEAPON_ROLE_SLOTS` (36) is the tables' size and the stride of
  `liveCounts` (`[shooter × WEAPON_ROLE_SLOTS + role]`) — code that indexed it with
  `WEAPON_ROLE_COUNT` must switch.
- **Levels.** `FamilyTables` (private) holds per level its emitters grouped by weapon (first
  appearance order): role, heading, extra offset; the group's first emitter carries the group size.
- **Firing** (`fireDirect`, phase 2, only when `powerUpMode === 'direct'` — the meter roles never
  fire then, and the families never fire in meter mode): every shooter fires the main family
  `Loadout.family` (a negative index reads as the first family, an index past the end wraps) at
  level `Loadout.shot` on the ship's **main** autofire timer, and the sub family at level
  `Loadout.sub` on the **missile** timer; a volley that fired restarts its timer with the level's
  `refireTicks`, else `config.autofireInterval` / `missileInterval`. Wanted when
  `autofire || remoteMode`, or `Shot` / `Sub` held.
- **Caps.** A weapon group of `n` shots fires **all or nothing** while `live + n ≤ volleys × n`
  (the level's `volleys`), else within the weapon's `cap`. Every group that fired pushes its
  weapon's SFX (rate-limited).
- **Behaviours.** `direct.bolt` (`ShotKind.Straight`: a straight shot in the emitter's heading;
  `frame` a still frame, or `turn: 1` = the heading's octant frame `((a + 64) >> 7) & 7` —
  un-rotated art, 0 right … 7 up-right; piercing with the weapon's `pierce`) and `direct.bomb`
  (`ShotKind.SpreadBomb` fired in the heading: `gravity` bends it, it bursts on terrain or its first
  target). `emit` adds the emitter offset from the `offX` / `offY` class fields set around the call
  (no fractional argument crosses it).
- **Loadout.** `Loadout` gained `shot`, `sub`, `family` (hashed). `applyDirectLoadout(loadout,
  ship, preset, startSpeedLevel)`: the meter fields empty, `'default'` = levels 0, family 0, no
  Arm; `'full'` (`?loadout=full`) = both levels 8 and the gold Hyper Arm; the speed level is the
  ship's `startSpeedLevel` either way. `applyLoadoutPreset` (meter) zeroes the direct fields.

Options are not part of Direct mode (there is no meter to buy them), but `fireDirect` fires every
shooter in play, so a test that gives the MANTA Options sees them copy the volleys.

## The Arm (`core/shields`)

`ShieldKind.Arm` (6, spec `ARM`): a field round the whole ship that — unlike the meter shields
(D8) — **absorbs terrain contact** (`absorbsTerrain`), with the usual `SHIELD_HIT_IFRAMES` (8)
after each hit. `ShieldState` gained `tier` and `charge` (hashed):

| Blue items (`charge`) | Tier (`armTierOf`) | Name | Hits (`ARM_TIER_HITS`) | HUD / sprite colour |
|---|---|---|---|---|
| 1 – 3 | 1 | Arm | 3 | green |
| 4 – 8 | 2 | Super Arm | 4 | silver |
| 9 + | 3 | Hyper Arm | 5 | gold |

`collectArm(state)` counts the item (up to `MAX_ARM_CHARGE` 99), sets the tier and repairs the Arm
to its tier's hits; any other shield standing is replaced, and a count survives only on a
standing Arm. When the Arm breaks (`absorbShieldHit`) or is lost with a death (`clearShield`),
`tier` and `charge` go to 0 — the next blue item starts at the green tier again. Drawn from
`shields/arm` (9 frames: tier × fresh / worn / critical — `armWearFrame`, `ARM_WEAR_FRAMES` 3).

## Speed toggle, death penalty and rank

- **Speed toggle** (D3). The `Speed` action — remote **Ch−** (428), keyboard **ShiftLeft**
  (PageDown in `keyboard-remote-emulation`), pad **LB / RB** — was bound since M1-05 and unused.
  In Direct mode `PowerUpSystem.updatePlayers` (phase 2, pressed edge, alive ships) steps
  `PlayerShip.speedLevel` to the next of the ship's `speeds`, back to 0 after the last (the MANTA:
  2.25 → 2.75 → 1.75 → 2.25), with the meter's `MeterAdvance` ding. Direct mode ignores the PowerUp
  press (OK); meter mode ignores the Speed press.
- **Death penalty** (`applyDirectDeathPenalty(preset, ship, loadout)`, called by the World's
  death sequence and — as `arcade` — by `continueWorld`): every preset takes the Arm and its count;
  `classic` one main-shot level (else one sub-weapon level); `arcade` both levels and the family
  (and the stage restarts at its checkpoint, as in meter mode); `casual` nothing more. The speed
  level is the player's choice and stays. A continue then re-applies `applyDirectLoadout`.
- **Rank** (`core/rank` `directPowerRank(shot, sub, armTier)` = `floor((shot + sub) / 2)` +
  `RANK_ARM_TIER[tier]` (0 / 2 / 3 / 4)): 12 at full power, the same as the fully powered meter
  ship, so the difficulty curve is shared. `updateWorldRank` uses it for every ship in Direct mode.

## The ship select (`core/scenes`)

`ShipSelectScene` (id `shipSelect`, an overlay with `PAUSE_DIM` over the difficulty menu) lists
`SceneFlow.ships` — the content's ships in content order, or `DEFAULT_PLAYER_SHIP` without any —
by name, with the focused ship's picture (frame 0 of its sprite), its model (`SHIP_MODE_LABELS`:
`POWER METER` / `DIRECT ITEMS`) and three hints (`SHIP_MODE_HINTS`). Opening focuses the ship
chosen last (at first the host config's `shipId`) and locks activation for 2 ticks.

| Input | Effect |
|---|---|
| Up / Down | move (wrapping, auto-repeat, the move sound) |
| OK | `flow.chooseShip(i)` — `withShip` on every difficulty's armed config (with the weapon select's loadout re-applied), then the **weapon select** for a meter ship or `stack.reset(game)` for a Direct-mode one (it has no loadout to choose) |
| Back | the difficulty menu (and the weapon select's Back now returns here) |

**Skipped with a single ship**: the difficulty menu's OK goes straight to the weapon select (or the
game, for a Direct-mode config). The flow tests on subset content are therefore unaffected; with the
shipped content every game start takes one more OK, and the flow-driving integration, shell, app
and e2e specs press it (KESTREL is focused first). `SceneFlow.ship` is the choice (`null` until the
first one), `SceneFlow.gameConfig` carries it.

**Hi-scores per model.** `hiScoreModeKey` was always `<powerUpMode>-<difficulty>`; the MANTA's games
now land in the save's `direct-easy` … `direct-arcade` tables. The flow's session bests are one per
mode and preset (`bests[mode × 4 + preset]`, `FlowControl.bestIndex`), so the difficulty menu and
the title's `HI` show the chosen ship's. The UI list's string slots grew from 160 to 192.

## The HUD (`core/ui`)

In Direct mode `buildHud` draws **tier pips** on the bottom bar instead of the meter and the Force
Field pips (`buildDirectPips`): `SHOT` at x 58 (one 4×4 pip per level above 0 of the current
family — 8 for 9 levels — lit in `HUD_FAMILY_COLORS`: Beam → Disc orange, Laser → Wave blue), `SUB`
at 130 (green), `ARM` at 196 (one pip per hit the Arm can take, lit in its tier's
`HUD_ARM_COLORS` for the hits left; nothing without an Arm), `SPD` at 252 (one pip per speed, the
current level and those below lit) and the family's `label` at 306. `Hud.update` rebuilds when the
levels, family, speed level or Arm tier change. The HUD list is `HUD_COMMAND_COUNT` (64) commands /
`HUD_STRING_COUNT` (9) strings (`HUD_STRING_SLOTS` `shot` 4 … `family` 8); meter HUDs still use
slots 0–3 only.

## Carriers (`core/behaviors`) and the dev stage

- **`cube.pincer`** (enemy `cube`, `content/enemies/direct-carriers.enemies.json`, 1 hp, 100
  points): in a `formation` of six, odd members start mirrored across the playfield's middle row
  (the mirror is applied once, on the spawn tick), every cube flies (`speed` 1.5) to the meeting
  point `meetX` 176, `gap` 8 px above or below the middle row on its own half, then leaves left at
  `leaveSpeed` 1.75. It never fires. The existing formation rule — every member killed, none
  escaped → the drop at the last kill — *is* "the last cube destroyed drops the item".
- **The coloured lead enemy** is simply a carrier with `drop: "powerup"`: `lead-carrier` (2 hp,
  200 points, `carrier.straight`, the red carrier's art). Zone A's red `tender` carriers play the
  same role for the MANTA.
- **`content/stages/direct-range.stage.json`** (`?stage=direct-range`, then pick the MANTA): open
  space, six pincer waves (600-point bonus each) alternating with lead carriers, a checkpoint at
  1,800, and a 12-entry plan whose first six drops are one of each colour.

## Assets

Pixel maps `ships/manta` (3 frames, a green canopy) and `enemies/cube`; the generator
`scripts/assets/procedural/direct.mjs` draws the shots (`shots/direct-missile`, `disc`, `beam`,
`wave`, `sub-bomb`, `sub-laser`, `sub-laser-wide` — 8 octant frames each, nothing rotated at run
time —, `sub-disc`), the six items and `shields/arm`. The atlas stays 512×512. The new engine
sprites (`DIRECT_ITEM_SPRITES` via `ITEM_SPRITES`, `ARM_SPRITE` via `SHIELD_SPRITES`) are part of
`ENGINE_SPRITES`, so `pnpm content:check` checks them against the atlas.

## Determinism, hashing and golden replays

`hashWorld` adds each loadout's `shot`, `sub`, `family` (after `options`), each shield's `tier` and
`charge` (after its pod slots) and the power-up system's `planCursor` (after `dropsTaken`). The
items are in the hashed `items` pool; the plan itself and the compiled families are derived from
content and not hashed. Two MANTA sessions fed the same input stay in lockstep and differ from the
KESTREL's (`direct-runtime.test.ts`), and a recorded `direct-range` run replays without a desync.

The golden replays were **re-blessed** in the build commit (`f68cead`): the new hashed state and
the new content (sprite ids, enemy spec indices) change every hash — all twelve outcomes are
unchanged. New scenarios: `zone-a-manta` (the whole stage in Direct mode — planned items from the
carriers, the Arm, a family switch at the octagon — to `stageClear`) and `zone-a-manta-boss`
(HALCYON BULWARK against the full Direct loadout) in the build commit, `zone-a-manta-deaths` (a
weaving MANTA under the Arcade penalty: Direct-mode deaths, checkpoint restarts, `gameOver`) in the
test commit (`0767e27`, no re-bless).

## Zero allocation and the hot-path rules

Everything per tick reads typed arrays compiled at creation (`RoleTables`, `FamilyTables`, the
`plan`, `itemLife` / `itemDrift`) and writes class fields (`Loadout`, `ShieldState`). Guards:
`powerups-direct-alloc.test.ts` (two MANTA worlds on a still stage — one fully powered, one at
the low levels — firing every tick, weaving, toggling the speed, collecting drifting colour items
and planned drops, bullets reaching the Arm; under 64 KiB) and `ui-hud-direct-alloc.test.ts` (the
tier pips).

| Rule | Why |
|---|---|
| The emitter offset reaches `emit` through the `offX` / `offY` class fields, reset after the volley | A fractional argument to a non-inlined call is boxed (the M2-03 Twin Laser lane rule) |
| `fireLevel` returns a whole level index (or −1) and the caller reads the interval table | A fraction returned is boxed |
| The families' grouping and role lookups happen in `FamilyTables`' constructor | `Map` lookups and arrays are load-time only |
| `directPowerRank` works on whole numbers (`Math.floor`, `>> 1`) | It runs every tick for every ship |
| The Direct-mode allocation guard **excludes enemy spawns** | Each spawn creates its behaviour coroutine (decision D29) — on the direct range that alone measures ~70–80 KB, the same as a meter ship flying it — so the guard flies a still stage and measures the power-up / weapon paths without the carriers (the zone A World guards account for spawns) |

## Using it headlessly

```ts
import {
  ENGINE_SPRITES,
  KNOWN_SCRIPT_IDS,
  ShieldKind,
  createInputSnapshot,
  createWorld,
  loadContent,
  resolveGameConfig,
  stepWorld,
  withShip,
} from '@shmup/core';

const db = loadContent(files, { knownScripts: KNOWN_SCRIPT_IDS, extraSprites: ENGINE_SPRITES }).db;
const config = withShip(resolveGameConfig({ stage: 'direct-range' }), {
  shipId: 'manta',
  powerUpMode: 'direct',
});
const world = createWorld(config, db);
world.ship.id; // → 'manta'
world.players[0].speedLevel; // → 1 (startSpeedLevel: 2.25 px/tick)
world.powerups.collectDirect(0, 0); // red → Loadout.shot 1 (true)
world.powerups.collectDirect(0, 2); // blue → the green Arm, 3 hits
world.players[0].shield.kind === ShieldKind.Arm; // → true
world.powerups.collectDirect(0, 5); // octagon → Laser → Wave, level kept
world.weapons.mainFamilies[world.weapons.loadouts[0].family].label; // → 'WAVE'
world.powerups.dropDirect(world.camera.x + 200, world.camera.y + 100); // the plan's next colour
const input = createInputSnapshot();
for (let t = 0; t < 600; t++) stepWorld(world, input);
```

## Extending it

| To add… | Do this |
|---|---|
| A ship | A `content/player/*.player.json` entry with its `mode` (and `startSpeedLevel` for a direct ship) and a sprite; the ship select lists it at once. A third power-up model would need a new `PowerUpMode` in `POWER_UP_MODES`, labels in `SHIP_MODE_LABELS` / `SHIP_MODE_HINTS` and its own hi-score tables |
| A main-shot family | A `families` entry with `slot: "main"` (its weapons in slot `main`); the octagon cycles through every main family in content order. Add a `HUD_FAMILY_COLORS` entry, or the colours wrap |
| A family weapon | A `weapons` entry with `direct.bolt` / `direct.bomb` (slot `main` or `sub`) and a sprite; mind `MAX_DIRECT_WEAPONS` (32 distinct weapons across all families) |
| A colour item | Append to `DIRECT_ITEMS` (data), `ItemKind` / `DIRECT_ITEM_KINDS` (hashed codes — append only), a sprite in the generator, a case in `collectDirect`, and a plan entry |
| Items in a zone | A `directItems` plan in the stage file (and `powerup` drops on its carriers); a `capsule` drop already works for both ships. Re-check the plan against the zone's families (reds / greens to reach level 8, blues for the tiers) and re-bless |
| Another carrier pattern | A behaviour (sleeping between re-aims — D29) and an enemy with `drop: "powerup"`, or a `formation` of it with the drop |

## Tests

| Where | Covers |
|---|---|
| `packages/core/test/powerups/powerups-direct.test.ts`, `powerups-direct-edge.test.ts`, `powerups-direct-alloc.test.ts` | Drop resolution per mode, plans (stage, default, cycling, never rewinding), every effect and cap and its exact cues, drift / bounce / cull / despawn and the blink, the magnet, the Speed toggle's corners, the penalty per preset in a World, a continue, loadouts, rank, determinism; bad players / items; the allocation guard |
| `packages/core/test/weapons/weapons-direct.test.ts`, `weapons-direct-edge.test.ts` | Every level's volley of all three families (headings, offsets, octant frames, bombs), all-or-nothing groups, the `volleys` cap, intervals, Shot / Sub without autofire, Options copying volleys, direct roles in `spawnShot`, `MAX_DIRECT_WEAPONS`, `setArsenal` leaving the direct roles alone, mode separation |
| `packages/core/test/shields/shields-arm.test.ts`, `shields-arm-edge.test.ts` | Tiers, repairs, terrain absorption, i-frames, breaking and the count starting over, replacing a meter shield, wear frames |
| `packages/core/test/ui/ui-hud-direct*.test.ts` | The tier pips, their colours and counts, a negative / wrapped family index, change detection, the allocation guard |
| `packages/core/test/scenes/scenes-ship-select*.test.ts` | Focus, wrap, the opening lock, sounds, OK per mode, Back, the skip with one ship, the choice composing with the weapon select for every difficulty, per-mode hi-scores (saved and session), the UI budget |
| `packages/core/test/behaviors/behaviors-cube*.test.ts`, `data/data-direct*.test.ts`, `config/config-ship*.test.ts`, `world/world-direct-edge.test.ts` | The pincer's mirror and meeting points; the loader's new fields, limits and the slot check; `shipId` / `powerUpMode` validation and pre-M2-05 replay headers; the World's ship fallback, start speed, the config's model over the ship's, the rank, the hash |
| `test/integration/direct-runtime.test.ts` | The MANTA on the direct range with per-tick invariants and a pilot collecting every colour; zone A lockstep; Ch− under `tizen-remote-safe` (one toggle per press through repeats and fake gaps, OK inert); a recorded run replayed |
| `test/integration/difficulty-continue-remote.test.ts` | The MANTA picked with the remote's arrows in the ship select, no weapon select, Ch− toggling, the `direct-*` hi-score table |
| `test/e2e/ship-select.spec.ts`, `direct-items.spec.ts` | In Chromium (web and Tizen `file://`): the ship select's panel and picture, the MANTA starting at once with the tier pips, Ch− / ShiftLeft toggling the speed; the six items and the green Arm drawn from the atlas, no atlas warnings |
| `test/golden/` | `zone-a-manta`, `zone-a-manta-boss`, `zone-a-manta-deaths` and the twelve re-blessed runs |

## Gotchas

| Symptom | Cause / fix |
|---|---|
| A flow test or e2e spec stops on a panel titled `SHIP SELECT` | With the shipped content (two ships) every START takes one more OK — press it (KESTREL is focused first). Subset content with one ship skips the screen |
| Code reading `liveCounts[shooter * WEAPON_ROLE_COUNT + role]` counts the wrong shots | The stride is `WEAPON_ROLE_SLOTS` (36) since M2-05 |
| A test that checks drop codes sees `FreeOption` as 4 | `DropKind.PowerUp` took 3 (content drops first) |
| The MANTA's first items repeat the plan's start after a checkpoint | They should not — the cursor never rewinds; if they do, it is a bug |
| OK does nothing in the game with the MANTA | By design: Direct mode has no meter to equip; items act on pickup. Ch− is the only extra button |
| The KESTREL's speed starts above 0 | Only in Direct mode does `startSpeedLevel` apply; the meter's Speed Ups start at 0 — check `powerUpMode` |
| A red item gives points only | The current family is at its top level (level 8) — it keeps its level across the octagon, capped to the new family |
| A yellow item did not hurt the boss | Expected until the mid-bosses of M2-09 |
| The Direct allocation guard grew after adding carriers to its stage | Spawns allocate their coroutine (D29); keep enemies out of that guard |
| `pnpm test` timed out in `eslint-rules.test.ts` | Its ESLint instance is warmed up once in `beforeAll` (120 s hook timeout) since M2-05 — a first lint under the full test load was too slow; keep new lint checks inside that suite |
| Golden hashes differ after adding a weapons / enemies file | Sprite ids and spec indices are hashed; an intended re-bless, with the reason in the commit message |

## Next steps that build on this page

- **M2-06** (done) — two-player co-op: items go to whoever grabs them, and the levels, family,
  Arm and speed level are per player; a mid-game continue resets a Direct player's levels; the
  co-op HUD shows compact `SH` / `SB` / `AR` / `SP` pips per player; the co-op extra item is the
  plan's next one ([coop.md](coop.md)).
- **M2-09** — mid-bosses: the yellow item's heavy damage to them.
- **M2-11 … M2-14** — the zones of M2 get their own `directItems` plans and carrier waves.
