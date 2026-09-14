# Option types, meter shields, the Option Hunter and the blue capsule

How meter mode got the rest of its Gradius III–style toolbox in plan step **M2-04**: three more
**Option types** (Snake, Formation, Rotate) next to the trail of M1-10, four more **`?` shields**
(the front Shield, the Free Shield, the Rotate Shield and Reduce) next to the Force Field, the
**Option Hunter** — an armoured enemy that steals Options, which a Mega Crash frees again as
drifting, re-collectable items — and the rare **blue capsule** that destroys every enemy on
screen. `core/options` is `implemented` with it, and so is `core/shields` for meter mode (the
Direct-mode Arm tiers followed in M2-05 — [direct-mode.md](direct-mode.md#the-arm-coreshields)).

This page is the *how and why* and the map of the whole step. Exact signatures are in
[api-reference.md](api-reference.md#options--options-implemented); the TSDoc in
`packages/core/src/{options,shields,enemies,behaviors,powerups}/index.ts` is the authoritative
reference. The content formats for authors are next to the data:
[`content/enemies/README.md`](../../content/enemies/README.md) (`optionHunter`, `blueCapsule`) and
[`content/stages/README.md`](../../content/stages/README.md) (the `hunter-range` dev stage). The
systems this step extends have their own pages:

| Part | Home page |
|---|---|
| The trail Option, the shot pool and firing — every Option type still fires through it | [weapons-and-options.md](weapons-and-options.md#options-coreoptions) |
| The power meter, the `?` slot, the Force Field inside `playerHit`, Mega Crash, the item pool | [powerups-and-shields.md](powerups-and-shields.md) |
| `GameConfig` choices, the weapon select and its live preview | [meter-arsenal.md](meter-arsenal.md) |
| The enemy system, `ScriptApi`, movers and the behaviour roster | [enemies-and-behaviors.md](enemies-and-behaviors.md) |
| The rank's power term (Reduce +2) | [difficulty-and-rank.md](difficulty-and-rank.md#rank-corerank) |
| Golden replays and why they were re-blessed | [debug-and-replays.md](debug-and-replays.md#golden-replays-testgolden) |

Background: `shmup_feat.md` §8 (Options: the standard trail, Snake, Formation — hold Power-Up to
spread and retract — Rotate — orbit, hold to extend —, the Option Hunter), §9 (the meter-mode
shields: Force Field, Shield ~14 hits with pods wearing independently, Free Shield, Rotate
Shield, Reduce with two hurtbox steps), §6A (the rare blue capsule), §11 (the Option Hunter:
appears only with Options, audible cue, line up → charge → steal), §4 (the remote: OK is a rare
press, Ch+ an optional extra), §15 (rank power terms); plan §3.2 (tick phases) and decisions
**D5** (up to four Options), **D8** (meter shields never absorb terrain), **D26** (screen-space
Option state) and **D33** (shield-hit i-frames).

## The picture at a glance

```text
 weapon select ─ OPTION: TRAIL / SNAKE / FORMATION / ROTATE ─┐
               ─ ? SLOT: FORCE FIELD / SHIELD / FREE SHIELD / ROTATE / REDUCE ─┐
                                                              ▼                 ▼
 GameConfig.optionChoice ──► createOptionGroup(type)    GameConfig.shieldChoice ──► MeterChoices.shield

 tick phase 2  weapons.updatePlayers: group.steer(intent)  (Special press toggles, PowerUp held 15 → extend)
                                      group.follow(...)    (trail / snake / formation / rotate placement)
               powerups.updatePlayers: `?` → grantShield(spec, freeWayHeading) ; placeShieldPods(ship)
 tick phase 6  bullets.collidePlayers: pods stop the bullets that touch them; hurt radius × hurtScale
               enemies.collidePlayers: pods stop bodies; hunters never touch anyone
 tick phase 7  weapons.applyHits → bosses.resolve → enemies.huntOptions  (steal: loadout − n, carried + n)
               → powerups.resolve (Mega Crash / blue capsule kill the hunter → DropKind.FreeOption
                                   → ItemKind.FreeOption items; pickups: regainOption / clearScreen)
 tick phase 9  enemies.sync → carriedBatch (grey Options behind each hunter) — the view's last batch
```

## Configuration (`core/config`)

| Field | Default | Meaning | Values |
|---|---|---|---|
| `optionChoice` | `'trail'` | How the Options fly (`OptionChoice`, `OPTION_CHOICES`) | `trail`, `snake`, `formation`, `rotate` |
| `shieldChoice` | `'forceField'` | What `?` grants (`ShieldChoice`, `SHIELD_CHOICES`) — M2-03's field, grown | `forceField`, `shield`, `freeShield`, `rotateShield`, `reduce` |

Both are session-wide (both players), sim-affecting and therefore in `GameConfig` and the replay
header. `resolveGameConfig` throws a `RangeError` for a name outside the lists; `ArsenalChoice`,
`withArsenal` and `arsenalMatches` carry `optionChoice` like the other weapon-select fields. The
replay **format version is unchanged**: a header written before M2-04 has no `optionChoice` and
resolves to `trail` — exactly what it played. `OPTION_CHOICES`' index is `core/options`
`OptionMode`'s code; `SHIELD_CHOICES` maps to specs through `core/shields` `SHIELD_CHOICE_SPECS`.

## Option types (`core/options`)

One `OptionGroup` per player, created with the session's type (`createOptionGroup(formation)`,
`setFormation` — the weapon select's preview changes it on a live group). `formation` is the name,
`mode` the numeric `OptionMode` (`Trail 0, Snake 1, Formation 2, Rotate 3` — hashed, append only).

| Type | Placement (`follow` → `place`) | Constants |
|---|---|---|
| **Trail** (M1-10) | Option `k` at the ring entry `(k + 1) × 12` records back; the ring records only with movement input — see [weapons-and-options.md](weapons-and-options.md#options-coreoptions) | `OPTION_SPACING` 12, `OPTION_TRAIL_CAPACITY` 49 |
| **Snake** | A chain in **screen space** (`snakeX` / `snakeY`): link `k` hangs `SNAKE_LINK` px from its leader (the ship, then link `k − 1`) and is only *pulled* — when the leader is farther than a link it moves straight towards it until it is exactly one link away. So the chain swings out opposite to the ship's motion and **keeps its shape** when the ship stops or pushes against an edge; scrolling does not string it out (screen space, like the trail) | `SNAKE_LINK` 16 |
| **Formation** | Fixed offsets from the ship, interpolated by the spread: a tight `>` behind it (`FORMATION_RETRACTED`) → a wide `V` (`FORMATION_SPREAD`) | `[-14,-8, -14,8, -26,-14, -26,14]` → `[-6,-24, -6,24, -16,-44, -16,44]` |
| **Rotate** | An even orbit round the ship: `angle` turns `ROTATE_SPEED` binary units per tick, Option `k` at `angle + k × 1024 / n`; the radius grows with the spread | `ROTATE_SPEED` 12 (a turn in ≈ 1.4 s), `ROTATE_RADIUS` 20 → `ROTATE_RADIUS_EXTENDED` 40 |

**Spread / extend** (`OptionGroup.steer(intent)`, phase 2, before `follow`, for every type — only
Formation and Rotate place by it):

- `Special` **pressed** flips `toggled` (remote **Ch+**, keyboard **V** — PageUp in
  `keyboard-remote-emulation` —, gamepad **Y**). The action was bound since M1-05 but unused.
- `PowerUp` **held** counts `holdTicks` up to `OPTION_HOLD_TICKS` (15); at 15 the Options extend
  while it stays held (remote OK, keyboard C / Enter, gamepad X).
- Out = `toggled || holdTicks ≥ 15`; `spreadTicks` moves one step per tick towards
  `OPTION_SPREAD_TICKS` (12) or 0, and the placement uses `t = spreadTicks / 12` (whole steps, so
  it is exact and hashable).

**Why "hold anywhere" instead of the plan's "hold PowerUp on the Option slot":** the meter equips
on the `PowerUp` **press edge**, so a hold never re-equips and never conflicts — the highlighted
slot is irrelevant after the press. A quick equip tap never moves the Options (15 ticks is a
deliberate hold), and the remote gets the press-only alternative Ch+ (§4: every extra is
optional). `reset()` (stage start, respawn) puts every trail entry and Snake link on the ship,
retracted, the toggle and the hold cleared and the orbit at 0. The trail keeps recording under
every type, so a type change (the preview) never finds a stale trail. `stolen` counts what
hunters took from the group (statistics, tests).

## Shields (`core/shields`)

Two families; every ship's `ShieldState` holds either:

| Family | Kinds | What it covers |
|---|---|---|
| **Field** | Force Field (M1-11), **Reduce** | The whole ship: `playerHit` asks `absorbShieldHit` first — enemy bullets, lasers, enemy contact, never terrain (D8) |
| **Pods** | front **Shield**, **Free Shield**, **Rotate Shield** | Only what touches a pod: an enemy **bullet** is used up, an enemy **body** costs the pod a hit and flies on. Never the ship itself (`absorbShieldHit` returns `None` while pods stand), never lasers, boss parts or terrain |

| Spec | `ShieldKind` | Hits | Layout (`placeShieldPods`, phase 2 after the move and the equip — and again when drawn) |
|---|---|---|---|
| `FORCE_FIELD` | `ForceField 1` | 5 | a ring round the ship |
| `FRONT_SHIELD` | `Shield 2` | 2 pods × `SHIELD_POD_HITS` 14 | ±`FRONT_POD_ANGLE` (64 units ≈ 22°) off the heading, `POD_ORBIT` 13 px out |
| `FREE_SHIELD` | `FreeShield 3` | a pair per `?`, up to `MAX_SHIELD_PODS` 4 pods × 14 | the pair centred on the player's last 8-way direction (`WeaponSystem.freeWayHeading`, ahead before any), `FREE_POD_SPREAD` 96 units apart, 13 px out |
| `ROTATE_SHIELD` | `RotateShield 4` | 2 pods × 14 | opposite pods at `ROTATE_POD_ORBIT` 16 px, turned by `spin` (`ROTATE_SHIELD_SPIN` 12 units per tick in `tickShield`) |
| `REDUCE` | `Reduce 5` | `REDUCE_HITS` 2 | no sprite round the ship — the ship itself shrinks (a dotted shimmer shows it) |

**Pods wear independently.** Each pod has its own `podHits`, its own i-frames (`podIFrames`,
`SHIELD_HIT_IFRAMES` 8 after each hit, not counted down on the hit's own tick) and its own
`podHitTick`; `absorbPodHit(state, pod, tick)` returns `Blocked` during them (free), `Absorbed`,
or `Broke` when that pod's last hit went — the other pods are untouched. `hits` / `maxHits` of the
state are the pods' sums, so the HUD, `shieldActive`, `shieldFull` and the rank see the whole
shield; it goes (kind `None`, slots cleared) with its last pod. A broken pod keeps its slot with 0
hits. The pod tests themselves are circle vs circle with `POD_RADIUS` 4, done by the colliding
system: `core/bullets` (`podBlocks`, before the hurt-circle test of each bullet) and
`core/enemies` (`collidePlayers` tests every standing pod against the grid — Option Hunters and
ghosts never wear a pod).

**Free Shield pairs.** `grantShield(state, FREE_SHIELD, heading)` on a standing Free Shield
**adds** a pair (`attachPodPair`) instead of replacing the shield; with all four slots taken it
replaces the **most worn** pair (fewest hits left, the first on a tie). `canGrantShield` therefore
keeps `?` equippable while a pair still fits or while any pod is worn — for every other kind `?` is
greyed while a shield stands. The power-up system passes `freeWayHeading[player]` as the heading
(the hashed 8-way direction of M2-03).

**Reduce.** `ShieldState.hurtScale = (hurtSteps + 1 − hits) / (hurtSteps + 1)`
(`reduceHurtScale`): ⅓ at 2 hits, ⅔ at 1 hit, 1 once it broke — the ship "grows back" one step per
hit. Every hurt-circle test multiplies the ship's `hurtRadius` by it: bullets and straight lasers
(`core/bullets`, `shipR`), bending lasers, enemy contact (`core/enemies`), boss-part contact
(`core/bosses`) and the debug overlay's hurt outline (`@shmup/render-pixi` `buildDebugOutlines`).
The **terrain box is never scaled**. Every other shield leaves `hurtScale` at 1.

**FULL BARRIER** (`refillShield`, the `!` choice of M2-03): a standing shield of the same kind
gets every hit back — every pod slot in use, broken pods included, **in place** (a Free Shield's
pairs keep their directions); anything else gets a fresh one. The `!` box is greyed only while the
same kind stands at full strength (`shieldFull`).

**Rank.** `updateWorldRank` passes Reduce as `powerRank`'s `reduce` flag (+2) instead of the
`shield` flag (+4) — shmup_feat.md §15's table.

**Events.** A pod that takes a point pushes `SFX ShieldHit`; a pod that breaks pushes `SFX
ShieldBreak` + `FX ShieldBreak` like a field's break (`PowerUpSystem.resolve`, from the tick's hit
/ break records). The shield batch holds one field sprite, or one sprite per **standing** pod in its
own wear frame (`podWearFrame`), blinking during its i-frames.

## The Option Hunter (`core/enemies`, `core/behaviors`)

The hunter is an ordinary enemy entry with the **data flag** `optionHunter: true` (not only a
behaviour), so the enemy system owns every rule and a behaviour cannot forget one:

- **Appearance.** `spawn` of a hunter returns `null` unless some **active** ship owns an Option
  (`host.weapons.loadouts[p].options > 0`): a stage's scripted hunter simply does not come, and a
  hunter formation ends at once. A spawned one pushes `SFX_CUES.OptionHunter` (23) — the
  "audible cue" — at its spawn point.
- **Armoured and harmless.** It spawns with `EnemyFlag.Invulnerable` (shots clink) and is skipped
  by the contact tests: it never hurts a ship or wears a pod.
- **Movement** — behaviour `hunter.option` (tunables `variant`, `lineUpTicks` 90, `speed` 2,
  `windup` 24, `chargeSpeed` 4.5, `lineX` 48, `lineY` 24):

  | `variant` | Lines up at | Charges |
  |---|---|---|
  | 0 **rear** | view x `lineX` on the nearest player's row | right, at `chargeSpeed` |
  | 1 **front** | view x `384 − lineX` on the player's row | left |
  | 2 **dive** | view y `lineY` over the player's column | down |

  For `lineUpTicks` it re-aims a `Waypoint` mover at the line-up point every 6 ticks (points kept
  12 px inside the playfield), sleeping between re-aims (D29: no `yield 1` loops); the last aim
  stands — the mover arrives, holds `windup` ticks and leaves at the charge velocity until the
  enemy leaves the view. `ScriptApi.camera` was added so the behaviour can turn the player's world
  position into the view point the `Waypoint` mover wants.
- **Stealing** — `EnemySystem.huntOptions()`, **tick phase 7**, after the shots' hits and the boss,
  **before the power-ups**. For every live, non-ghost hunter with room (`carried <
  MAX_CARRIED_OPTIONS` 8), per active player in slot order, the first flying Option whose circle
  (`OPTION_RADIUS` 4) touches the hunter's box (closed test) is taken **and every Option behind it
  in the chain**: the loadout's `options` drops by that many, the group's `count` too (they vanish
  from the ship at once), `group.stolen` and `enemy.carried` grow, and `SFX OptionStolen` (24) is
  pushed at the first one. Stolen Options are gone from the loadout — the meter's OPTION box can
  refill them the usual way.
- **Carrying.** `Enemy.carried` (hashed) Options are drawn grey (`options/stolen`,
  `STOLEN_OPTION_SPRITE`) `CARRIED_OPTION_SPACING` (10) px apart behind the hunter — away from
  where it flies, to its right while it stands — pulsing like Options, in
  `EnemySystem.carriedBatch` (`CARRIED_BATCH_CAPACITY` 16), appended as the **last** batch of the
  World's view so they draw over the enemies.
- **Freeing.** Only a Mega Crash or a blue capsule can kill an armoured hunter (armour does not
  protect against either). `kill` adds one `DropKind.FreeOption` drop per carried Option; the
  power-up system turns each into an `ItemKind.FreeOption` item in phase 7. Because the steal runs
  **before** the power-ups, a Mega Crash in the same tick frees what was just taken. A hunter that
  leaves the view keeps its haul — those Options are lost.

**Freed Options** (`core/powerups`). Grey items that drift **with the view** (screen-space motion:
the camera's `dx` / `dy` is added) at `FREE_OPTION_DRIFT[n mod 8]` px/tick — the `n`-th Option
freed in a tick picks the `n`-th velocity pair, so several fan out — bouncing off the playfield's
top and bottom; the pickup magnet pulls them too. They vanish after `FREE_OPTION_TICKS` (600,
blinking for the last `ITEM_EXPIRY_BLINK_TICKS` 120). **Anyone** may collect one:
`PowerUpSystem.regainOption(player)` adds an Option (`SFX PowerUpEquip` + a `PowerUp` event for the
OPTION slot) or, with four already, plays only the meter ding; 0 points.

## The blue capsule

`ENEMY_DROPS` gained `'blueCapsule'` (content `drop` of an enemy **or** a formation event), drop
code `DropKind.BlueCapsule` 2 → `ItemKind.BlueCapsule` (`items/capsule-blue`, world-space like a
capsule, 300 points). Collecting it calls `PowerUpSystem.clearScreen(player)` →
`EnemySystem.clearOnScreen(by)`: every live enemy with `EnemyFlag.OnScreen` whose spec is not
`megaCrashImmune` dies, credited to the collector — armour no help, no revenge bullets (the same
`crashing` guard as Mega Crash) — with Mega Crash's flash and sound. Unlike Mega Crash it spares
enemies outside the view, **cancels no bullet** and does **not** advance the meter. Keep it rare:
the shipped content has it only in the `hunter-range` dev stage (a `blueCapsule` formation and the
`carrier-blue` of `test-range.enemies.json`).

## Content and assets

| File | What |
|---|---|
| `content/enemies/option-hunters.enemies.json` | `option-hunter-rear` (variant 0), `option-hunter-front` (1, `chargeSpeed` 4), `option-hunter-dive` (2, `lineUpTicks` 72, `windup` 30) — 1 hp, 1,000 points, `hurtbox` 8 × 6, no drop, `settleTicks` 0, medium explosion |
| `content/enemies/test-range.enemies.json` | `carrier-blue` — a slow `carrier.straight` that drops a blue capsule |
| `content/stages/hunter-range.stage.json` | Dev stage (`?stage=hunter-range`, add `&loadout=full`): capsule carriers, the three hunters, a `blueCapsule` formation, the blue carrier, a second wave after the checkpoint at 1,800 and two hunters at once |
| `content/audio/main.sfx.json` | `OptionHunter` (a rising, trembling saw alarm) and `OptionStolen` (a falling crushed blip) — synth presets |
| `assets/source/sprites/options/stolen.sprite.json`, `enemies/option-hunter.sprite.json`, `enemies/carrier-blue.sprite.json` | Pixel maps (grey Option, violet hunter, blue carrier) |
| `scripts/assets/procedural/items.mjs`, `shields.mjs` | `items/capsule-blue` (the capsule pill in blue); `shields/pod` (8×8 gem, 4 wear frames) and `shields/reduce` (20×14 dotted ring, 2 frames) |

**Zone A is unchanged** — its 4-way design rules and playtest budgets were tuned without hunters;
zones B–G (M2-11 … M2-13) place none either; later zones may. New engine sprites (`STOLEN_OPTION_SPRITE`,
`BLUE_CAPSULE_SPRITE`, `SHIELD_POD_SPRITE`, `REDUCE_SPRITE` through `ITEM_SPRITES` /
`SHIELD_SPRITES`) are part of `ENGINE_SPRITES`, so `pnpm content:check` checks them against the
atlas.

## The weapon select (`core/scenes`)

A new **OPTION** row sits between LASER and `? SLOT`: `WeaponSelectItem.Option` 4 — so `Shield`
is now 5, `Mega` 6, `Auto` 7, `Order` 8, `Start` 9 (code that addressed rows by number must use the
names). Labels: `OPTION_CHOICE_LABELS` (`TRAIL`, `SNAKE`, `FORMATION`, `ROTATE`) and five
`SHIELD_CHOICE_LABELS` (`FORCE FIELD`, `SHIELD`, `FREE SHIELD`, `ROTATE`, `REDUCE`). `arsenal()`
returns `optionChoice` too. The preview's ship flies the chosen type (`applyOptionType`:
`setFormation` + `reset` on the preview World's group), and while OPTION is focused it presses
`Special` every `PREVIEW_SPREAD_TICKS` (90) ticks so Formation and Rotate show both states.

## Determinism, hashing and golden replays

`hashWorld` adds each option group's `mode`, `spreadTicks`, `toggled`, `holdTicks`, `angle` and
Snake links; each shield's `hurtScale`, `podCount`, `podMaxHits`, `podOrbit`, `spin` and every
slot's hits, angle, i-frames and hit tick; and each enemy's `carried`. The freed Options are items
(a registered pool, hashed with it). Two Worlds of every Option type × `?` shield fed the same
input stay in lockstep (`options-shields-runtime.test.ts`), and a recorded `hunter-range` run
replays without a desync.

The golden replays were **re-blessed** in the build commit (`1434577`): the new hashed state and
the new enemies file (which shifts zone A's enemy spec indices) change every hash — all eight
outcomes are unchanged. New scenarios: `zone-a-rotate` (Rotate Options + Rotate Shield) and
`zone-a-reduce` (Formation Options + Reduce) in the build commit, `zone-a-snake` (the whole stage,
Snake Options + the front Shield) and `zone-a-free-shield` (the whole stage at Arcade, Free Shield)
in the test commit (`60b1328`, no re-bless) — every Option type and every meter shield now has
golden coverage ([debug-and-replays.md](debug-and-replays.md#golden-replays-testgolden)).

## Zero allocation and the hot-path rules

Everything per tick writes class fields and typed arrays (`OptionGroup`, `ShieldState`, `Enemy`).
Guards: `options-types.test.ts` (every type, steering), `shields-alloc.test.ts` (pods, Reduce, every
Option type, freed Options — no growth over the M1 baseline) and `enemies-hunter-alloc.test.ts`
(the steal → carry → free cycle).

| Rule | Why |
|---|---|
| `OptionGroup.follow` keeps only the trail inline; the other types' placement is the private `place()` | With everything in one method V8 stopped inlining `follow`, and a fractional argument was boxed on every call — the options allocation guard caught it |
| `follow`, `placeShieldPods` and `huntOptions` read the ship / camera / hunter fields themselves | No fractional number crosses a call boundary (the M1-10 lesson) |
| `t = spreadTicks / 12` is computed inside `place()`, never passed | A fraction returned or passed is boxed |
| The steal's SFX is pushed at whole pixels (`Math.floor(x) \| 0`) | The event push is a non-inlined call |
| `podBlocks` reads the bullet from the pool by slot | One call per live bullet with pods up; only whole numbers cross it |
| The hunter behaviour sleeps 6 ticks between re-aims | Coroutines allocate a result per wake (D29); the mover moves it every tick |

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
} from '@shmup/core';

const db = loadContent(files, { knownScripts: KNOWN_SCRIPT_IDS, extraSprites: ENGINE_SPRITES }).db;
const config = resolveGameConfig({
  stage: 'hunter-range',
  loadout: 'full',
  optionChoice: 'rotate',
  shieldChoice: 'reduce',
});
const world = createWorld(config, db);
const input = createInputSnapshot();
for (let t = 0; t < 600; t++) stepWorld(world, input);
world.weapons.options[0].formation; // → 'rotate'
world.players[0].shield.kind === ShieldKind.Reduce; // → true (the 'full' loadout grants the `?` choice)
world.players[0].shield.hurtScale; // → 1/3 while Reduce has both hits
// A hunter by hand (refused — null — while nobody has an Option):
const rear = db.enemyIndex.get('option-hunter-rear')!;
world.enemies.spawn(rear, world.camera.x - 24, world.players[0].y); // → Enemy (armoured)
// … once it has touched the Options (world.enemies.enemies[slot].carried > 0):
world.powerups.detonateMegaCrash(0); // kills it; its Options come back as ItemKind.FreeOption items
```

## Extending it

| To add… | Do this |
|---|---|
| An Option type | Append to `OptionChoice` / `OPTION_CHOICES` (config), `OptionMode` / `OPTION_MODE_NAMES` (same order — hashed codes), a branch in `OptionGroup.place()` (numbers only; new state as class fields or typed arrays, reset in `reset()`, mixed in `core/debug` `mixWeapons`), a label in `OPTION_CHOICE_LABELS`; extend `options-types*.test.ts`, the runtime test and a golden scenario |
| A `?` shield | Append a `ShieldKind` code + name, a `ShieldSpec` (`pods` / `podHits` / `podOrbit` for a pod shield, `hurtSteps` for a shrinking field), its layout in `freshPods` / `placeShieldPods`, `SHIELD_CHOICES` + `SHIELD_CHOICE_SPECS` + `SHIELD_CHOICE_LABELS`, its sprite in `SHIELD_SPRITES` (and a generator); decide its rank term in `updateWorldRank` |
| A hunter variant | A `variant` branch in `hunter.option` (keep it sleeping between re-aims), or a new behaviour for an `optionHunter: true` enemy — the flag, not the behaviour, brings the rules |
| Hunters in a zone | Stage `spawn` / `formation` events of the three hunter ids (they only come when the player has Options); re-check the zone's 4-way rules and bot budgets, and re-bless |
| Another screen-clear pickup | A `DropKind` + `ItemKind` (append — hashed), its sprite in `ITEM_SPRITES`, its effect in `PowerUpSystem.resolve`'s pickup switch |

## Tests

| Where | Covers |
|---|---|
| `packages/core/test/options/options-types*.test.ts` | Per-type movement (the Snake's pulled chain and held shape, the Formation's `>` → `V`, the Rotate orbit and radius), `steer` (hold threshold and saturation, toggle, hold + toggle), `setFormation`, clamped counts, NaN / unowned links, allocation |
| `packages/core/test/shields/shields-pods.test.ts`, `shields-variants-edge.test.ts` | Pods and independent wear, per-pod i-frames, Free Shield pairs and the most-worn replacement (ties, heading wrap), the Rotate spin, Reduce's steps, FULL BARRIER for every kind, `canGrantShield` for every pairing, wear frames, fractional pod slots |
| `packages/core/test/shields/shields-world*.test.ts`, `shields-alloc.test.ts` | Pods against real bullets and bodies in a World (two bullets on one pod, broken pods let bullets through, never lasers), Reduce's hurtbox against bullets / lasers / bending lasers / bodies, rank, pod SFX, the shield batch, determinism; the allocation guard |
| `packages/core/test/enemies/enemies-hunter*.test.ts`, `data/enemies-hunter-data-edge.test.ts` | Appearance only with Options (and its alarm), the three variants, the chain cut, partial steals, two hunters, co-op, steal + Mega Crash in one tick, the carried batch, drops, expiry, escape, the blue capsule's on-screen clear; `optionHunter` / `blueCapsule` in the loader; the steal / carry / free allocation guard |
| `packages/core/test/powerups/powerups-m204-edge.test.ts`, `world/world-options-edge.test.ts`, `scenes/scenes-weapon-select-option-edge.test.ts`, `config/config-arsenal*.test.ts` | Freed Options and blue capsules in the item pool, `regainOption` at four; the World's option groups per config; the OPTION row, labels and preview spread; `optionChoice` validation and replay headers |
| `packages/render-pixi/test/debug/debug-reduce.test.ts` | The hurt outline follows Reduce, the terrain box does not |
| `test/integration/options-shields-runtime.test.ts` | Every Option type × `?` shield (20 sessions) on `test-range` with per-tick invariants, zone A lockstep per type, Ch+ / OK under `tizen-remote-safe` (one toggle per press through repeats and fake gaps), a recorded `hunter-range` run replayed |
| `test/e2e/option-hunter.spec.ts`, `weapon-select.spec.ts` | In Chromium: a hunter steals and carries the Options (violet body, grey haul), Mega Crash frees them, they are re-collected, no atlas warnings; the OPTION row on the remote |
| `test/golden/` | `zone-a-rotate`, `zone-a-reduce`, `zone-a-snake`, `zone-a-free-shield` and the eight re-blessed runs |

## Gotchas

| Symptom | Cause / fix |
|---|---|
| A stage's hunter never appears | Nobody had an Option when its event fired — by design (§11). Give the ship Options (`?loadout=full`) |
| Shots bounce off the hunter | It is armoured; only a Mega Crash or a blue capsule kills it (and frees its Options) |
| The Options vanished and never came back | The hunter left the view with them — they are lost; collect Options again on the meter |
| A test's Options were stolen and freed in the same tick | Intended ordering: `huntOptions` runs before `powerups.resolve`, so a Mega Crash that tick frees them at once |
| Formation / Rotate Options spread while taking a power-up | OK was held ≥ 15 ticks after the equip press — release it sooner, or use Ch+ to toggle |
| `?` is not greyed with a Free Shield up | By design: it adds a pair while one fits, then replaces the most worn pair while any pod is worn |
| Bullets hit the ship although pods stand | Pods only stop what touches them; they never cover the ship (and never lasers or terrain) |
| The debug overlay's hurt circle is tiny | Reduce is up (`hurtScale` ⅓ / ⅔); the terrain box keeps its size |
| Code that picked a weapon-select row by number broke | `WeaponSelectItem.Option` 4 moved `?` to 5 … START to 9 — use the names |
| Code that picked a batch from `view.batches` by index broke | The carried-Options batch is now the **last** batch |
| Golden hashes differ after adding an enemy file | Enemy spec indices are hashed; a new file that sorts before zone A's shifts them — an intended re-bless, with the reason in the commit message |
| The allocation guard fails after touching `OptionGroup.follow` | It grew past V8's inlining budget — keep new placement code in `place()` |

## Next steps that build on this page

- **M2-05** (done) — Direct mode: the Arm → Super Arm → Hyper Arm shield tiers (they absorb
  terrain) joined `core/shields`; the blue Direct-mode item is a different thing from this blue
  capsule (which stays a blue capsule in both modes); the colour items reuse the freed Options'
  drift, bounce and expiry ([direct-mode.md](direct-mode.md)).
- **M2-06** (done) — two-player co-op: both players' Options and shields are per player, and the
  hunter visits every active ship in slot order; freed Options and the blue capsule are not scaled
  by the co-op drop credit ([coop.md](coop.md)).
- **M2-11** (done) — zones B and C place no Option Hunter or blue capsule (their 4-way budgets were
  tuned without them — [zones-b-and-c.md](zones-b-and-c.md)).
- **M2-12** (done) — zones D and E place none either
  ([zones-d-and-e.md](zones-d-and-e.md)).
- **M2-13** (done) — zones F and G place none either ([zones-f-and-g.md](zones-f-and-g.md)).
- **M2-14** (done) — the final zones place none either ([zones-h-and-i.md](zones-h-and-i.md)); every
  zone of v1.0 is content now, so the Option Hunter stays in the browser's Hunter Range.
- **M3** — option recovery after death.
