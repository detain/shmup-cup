# Power meter, capsules, Force Field and Mega Crash

How meter mode's power-up economy works inside `@shmup/core`: the **power-up system**
(`core/powerups`) with one 7-slot **power meter** per player, equipping on the **pressed edge** of
the `PowerUp` action (remote OK), the optional **Auto Power-Up**, the 32-slot struct-of-arrays
**item pool** of power capsules (drops, pickup magnet, pickups worth 300 points), **Mega Crash**
(the `!` slot), and the **Force Field** of `core/shields` that lives on every ship and takes hits
inside `playerHit`. Built in plan step **M1-11**; plan step **M2-03** added the **`!` choices**
(Mega Crash, NORMAL, SPEED DOWN, LIFE OPTION, FULL BARRIER), the **`?` choice** and the meter
equipping the session's weapon type — the step's own page is [meter-arsenal.md](meter-arsenal.md);
plan step **M2-04** added the other `?` shields (the front Shield, Free Shield and Rotate Shield
pods, Reduce), the rare **blue capsule** and the **freed Options** an Option Hunter lets go of —
[options-shields-hunter.md](options-shields-hunter.md); plan step **M2-05** added the other
power-up model, **Direct mode** (the MANTA's colour items, the stage's item plan, the Arm shield
and the Speed toggle — `core/powerups` is `implemented` with it) —
[direct-mode.md](direct-mode.md). This page keeps the meter as the worked example of an economy
and the Force Field as the worked example of a shield.

This page is the *how and why*. Exact signatures are in
[api-reference.md](api-reference.md#powerups--power-meter-capsules-direct-mode-items-mega-crash);
the TSDoc in `packages/core/src/{powerups,shields}/index.ts` is the authoritative reference. The
loadout the meter equips and the weapons it switches on are
[weapons-and-options.md](weapons-and-options.md); the enemies whose drops become capsules are
[enemies-and-behaviors.md](enemies-and-behaviors.md); the bullets Mega Crash cancels are
[bullets-and-patterns.md](bullets-and-patterns.md); the World, its tick phases and `playerHit` are
[sim-world.md](sim-world.md).

Background: `shmup_feat.md` §6A (the Gradius meter: `SPEED UP | MISSILE | DOUBLE | LASER |
OPTION | ? | !`, capsules from red enemies and whole formations, 300-point capsules, every quick
pickup counts, Auto Power-Up), §6C (pickup feedback), §7A (the `!` slot: Mega Crash, and since
M2-03 its other choices), §9 (the
Force Field: hit counter, visible wear, break effect, shield-hit i-frames), §4 rule 4 (OK = equip,
a rare non-urgent press; Auto Power-Up for the remote), §11 (capsule carriers); plan §3.2 (tick
phases) and decisions **D1** (Meter mode is the default), **D2** (Auto Power-Up, off by
default), **D8** (the Force Field does not absorb terrain) and **D33** (the pickup magnet and
shield-hit i-frames — remote-friendly defaults).

## The picture at a glance

```text
createWorld(config, db)                                                         core/world
 ├─ world.powerups = createPowerUpSystem(world)                               core/powerups
 │    pools.register('items', 32 slots)          2 × PowerMeter { cursor: -1 }
 │    item batch (LayerId.Items, 32), shield batch (LayerId.Player, 2)
 │    Auto Power-Up order compiled (slot, nth, satisfying main weapons), sprite ids,
 │    maxSpeedLevel = ship speeds.length − 1, pickup box half sizes copied
 └─ applyLoadoutPreset(…, 'full') grants a Force Field on PlayerShip.shield     core/shields

stepWorld, every tick
 ├─ 2 players    updatePlayer × 2 → powerups.updatePlayers(): pressed PowerUp → equipHighlighted
 │               → weapons.updatePlayers() (a new weapon / Option fires this very tick)
 ├─ 3 stage      powerups.beginTick(): drops of kills made between ticks → capsules
 │               → enemies.beginTick() (outcomes reset) → stage, spawns …
 ├─ 5 movement   … powerups.update(): age, drift, magnet (16 px, 2 px/tick), cull at view ± 32
 ├─ 6 collision  … every playerHit → absorbShieldHit first (bullets, lasers, contact — never terrain)
 │               powerups.collide(): item circle × alive ships' pickup boxes → outcomes
 ├─ 7 damage     weapons.applyHits() → powerups.resolve():
 │               pickups → collect (meter advance, ding, Auto Power-Up) → armed Mega Crashes
 │               → tickShield + shield hit / break events → the tick's enemy drops → capsules
 ├─ 8 removal    pools.flushAll() frees collected / culled items
 └─ 9 fx         powerups.sync(): item batch (blink), shield batch (wear frame, blink)
```

## Configuration

Six `GameConfig` fields drive it — sim-affecting, so they are recorded in replay headers and
validated by `resolveGameConfig`:

| Field | Default | Meaning |
|---|---|---|
| `powerUpMode` | `'meter'` (D1) | This page's model; `'direct'` (since M2-05 — the ship select's MANTA) switches the system to Direct mode ([direct-mode.md](direct-mode.md)); any other string throws `RangeError` |
| `autoPowerUp` | `false` (D2) | Equip the next wanted slot of the order as soon as a capsule moves the cursor onto it |
| `autoPowerUpOrder` | `DEFAULT_AUTO_POWER_UP_ORDER` | `speed, missile, laser, option ×4, shield` — 0 to `MAX_AUTO_POWER_UP_ORDER` (32) `MeterSlotName`s; anything else throws `RangeError`; the resolved config holds a frozen copy |
| `pickupMagnet` | `true` (D33) | Items near an alive ship drift into it |
| `megaChoice` | `'megaCrash'` | What `!` does (M2-03): `megaCrash`, `normal`, `speedDown`, `lifeOption`, `fullBarrier` |
| `shieldChoice` | `'forceField'` | What `?` grants (M2-03): `forceField`, and since M2-04 `shield`, `freeShield`, `rotateShield`, `reduce` ([options-shields-hunter.md](options-shields-hunter.md#shields-coreshields)) |

The slot **names** (`MeterSlotName`, `METER_SLOT_NAMES`: `speed missile double laser option
shield mega` — `?` = `shield`, `!` = `mega`) live in `core/config`, so the config never imports
`core/powerups`; `core/powerups` numbers them (`MeterSlot` 0–6, `meterSlotOf(name)`). Since M2-03
the **weapon select** before every game sets `autoPowerUp` (AUTO), `autoPowerUpOrder` (ORDER — the
order editor's 12 rows), `megaChoice` (`! SLOT`) and `shieldChoice` (`? SLOT`) for the session
([meter-arsenal.md](meter-arsenal.md#the-weapon-select-corescenes)); since M2-05 the ship select sets
`powerUpMode`, and since M2-16 the Options screen's GAME page sets and saves `autoPowerUp` (AUTO
POWER — once changed it wins over the weapon select's AUTO) and `pickupMagnet` (MAGNET), and the
one-button preset forces Auto Power-Up on
([options-rebinding-and-accessibility.md](options-rebinding-and-accessibility.md#game-and-the-one-button-preset)).
`meterChoicesOf(config)` turns the two choices into the system's `choices` (`MeterChoices`).

## The meter

One `PowerMeter` per player slot (`world.powerups.meters[p]`, a class so `cursor` stays an
unboxed small integer). `cursor` is `-1` (nothing highlighted) or a `MeterSlot`:

| Code | Slot | Equips | Greyed (`canEquipSlot` false) when |
|---|---|---|---|
| 0 | `Speed` | `ship.speedLevel + 1` | at the top speed — `speeds.length − 1` (5 for the KESTREL's six speeds) |
| 1 | `Missile` | `loadout.missile = true` — the arsenal's Missile-role weapon (M2-03) | already owned |
| 2 | `Double` | `loadout.main = MainWeapon.Double` (the Laser is gone) — the arsenal's Double-role weapon | the Double is already the main weapon |
| 3 | `Laser` | `loadout.main = MainWeapon.Laser` (the Double is gone) — the arsenal's Laser-role weapon | the Laser is already the main weapon |
| 4 | `Option` | `loadout.options + 1` | `MAX_OPTIONS` (4) |
| 5 | `Shield` (`?`) | a fresh `?` shield (`grantShield(choices.shield, heading)`); a Free Shield on a standing Free Shield adds a pod pair at the player's last 8-way direction instead (M2-04) | a shield is up (`canGrantShield` — a Free Shield stays equippable while a pair fits or a pod is worn) |
| 6 | `Mega` (`!`) | the `!` choice: Mega Crash arms a detonation (below); NORMAL, SPEED DOWN, LIFE OPTION and FULL BARRIER act at once (M2-03 — [meter-arsenal.md](meter-arsenal.md#the--and--choices-corepowerups)) | Mega Crash never; NORMAL on the basic shot, SPEED DOWN at level 0, LIFE OPTION without a spare ship or room, FULL BARRIER at full strength |

Which *weapon* a MISSILE / DOUBLE / LASER slot switches on is the session's arsenal (`core/weapons`
`resolveArsenal`: `GameConfig.weaponPreset`, Type A by default, and `weaponEdit` — M2-03); the
meter itself only sets the loadout fields.

- **A capsule** advances the cursor (`advanceMeter`): `-1 → Speed`, then one slot per capsule,
  wrapping after `!` back to Speed. A cursor that is not a slot or `-1` (a debug tool wrote it,
  `NaN` included) comes back to Speed.
- **The press.** Phase 2, right after the ships moved and before the weapons fire, reads the
  `pressed` mask of every active ship that is not `dying` / `dead` (fly-ins may press). A
  `PowerUp` press runs `equipHighlighted(p)`: an empty cursor or a greyed slot is **denied** —
  `SFX PowerUpDenied`, the cursor stays; otherwise `equipSlot` applies the effect, `!` arms Mega
  Crash, the cursor resets to `-1` and `SFX PowerUpEquip` + `SimEventKind.PowerUp` are pushed.
  Only the **edge** counts: holding OK (auto-repeat `keydown`s, the remote's fake release
  pairs) never re-equips — `test/integration/powerups-remote.test.ts` drives this through the
  shipped `tizen-remote-safe` profile, including OK while an arrow is held (the ship keeps
  moving).
- **Double / Laser** are mutually exclusive through `loadout.main`; the only way back to the
  basic shot through the meter is the `!` choice NORMAL (M2-03).
- The plan's `canEquip(slot)` needs the state, so the pure form is
  `canEquipSlot(slot, ship, loadout, maxSpeedLevel, choices?)` (and `equipSlot` with the same
  arguments; `choices` defaults to `DEFAULT_METER_CHOICES`, the ship is a `MeterShip` — `lives`
  only for LIFE OPTION — since M2-03);
  the system adds `canEquip(player, slot)` and `equippable(player)` — a bit mask of the
  equippable slots (`equippableSlots`) for the HUD, which greys the others. Since M1-16 the core
  HUD (`core/ui` `buildHud`, drawn by the scene flow) shows the meter in the bottom bar: seven
  `hud/meter-slot` boxes with the `hud/meter-labels` frames (`METER_LABELS`, here and in the
  asset pipeline's `hud.mjs`: `SPEED MISSILE DOUBLE LASER OPTION ? !` — since M2-03 the MISSILE /
  DOUBLE / LASER boxes show the arsenal's weapon names, `core/ui` `meterLabelFrame`), the highlighted slot
  (`meters[0].cursor`) flashing every 8 ticks, the slots `equippable(0)` excludes greyed
  ([scenes-and-ui.md](scenes-and-ui.md#the-hud)). The `?scene=flight` dev scene still draws no
  meter.

## Auto Power-Up

With `config.autoPowerUp`, `collect(p)` — the effect of every pickup — equips at once when the
capsule moved the cursor onto the **next wanted slot** and that slot can be equipped. The
order is compiled at creation into typed arrays (`autoSlots`, the entry's `nth` occurrence of its
slot, and for Double / Laser entries the set of main weapons that satisfy them), and
`nextAutoSlot(p)` returns the first entry the loadout does **not** satisfy yet:

| Entry | Satisfied when |
|---|---|
| `speed` (the `n`-th in the order) | `speedLevel ≥ min(n, top speed)` |
| `missile` | the Missile is owned |
| `double` / `laser` | the main weapon is that one **or** the weapon of any later Double / Laser entry (so `laser, double` never ping-pongs) |
| `option` (the `n`-th) | `options ≥ min(n, 4)` |
| `shield` | a shield is up |
| `mega` | never (the order stops there) — a `!` choice other than Mega Crash is applied whenever a capsule lands on `!` and it can act; a greyed choice parks the cursor (M2-03) |

The order is re-evaluated at every pickup, so a loss — a broken Force Field, a death penalty
(M1-12) — is wanted again. `-1` means the order is satisfied (or empty): the meter then only
moves. Because the cursor restarts at `-1` after every equip, a wanted slot costs its position +
1 capsules (Speed 1, Missile 2, Laser 4, each Option 5, `?` 6): the default order takes 33
capsules. Manual presses keep working with Auto Power-Up on.

## Items and capsules

`world.powerups.pool` is a `SoaPool` of `MAX_ITEMS` (32, both players' capsules) registered as
`items` — flushed in phase 8, cleared on a checkpoint restart, hashed like every registered pool.
Fields (`ITEM_SCHEMA`, hashed in sorted name order):

| Field | Type | Meaning |
|---|---|---|
| `x`, `y` | f64 | World centre |
| `vx`, `vy` | f64 | Own velocity (0 for capsules: they stay with the terrain) |
| `kind` | u8 | `ItemKind` (`Capsule` 0, M2-04: `BlueCapsule` 1, `FreeOption` 2, M2-05: the Direct-mode colour items `DirectRed` 3 … `DirectOctagon` 8, M2-10: `OneUp` 9, `BonusCapsule` 10 — hashed: append, never renumber) |
| `age` | i32 | Ticks since the drop |
| `flags` | u8 | `ItemFlag`: `Dead` 1 (collected / culled this tick, freed in phase 8), `Magnet` 2 (pulled this tick) |

Kinds come from a built-in table, `ITEM_KINDS` (M2-05 appended the six Direct-mode colour items —
`items/direct-*`, 300 points, drifting like freed Options for `DIRECT_ITEM_TICKS` 600 —
[direct-mode.md](direct-mode.md#the-items)): the
capsule draws `items/capsule` (`CAPSULE_SPRITE`, an **engine sprite** — `ITEM_SPRITES` is part of
`ENGINE_SPRITES`) with a two-frame blink every `ITEM_BLINK_TICKS` (8) ticks from the World tick
(all capsules blink together), and is worth `CAPSULE_SCORE` (300). Since M2-04 the **blue
capsule** (`items/capsule-blue`, 300 points, from `drop: "blueCapsule"` enemies and formations —
`DropKind.BlueCapsule`) behaves like a capsule but, collected, runs `clearScreen` (every enemy on
screen dies — no bullet cancel, no meter advance) instead of `collect`; the **freed Option**
(`options/stolen`, 0 points, from `DropKind.FreeOption` — one per Option a dead Option Hunter
carried) drifts with the view, bounces off the playfield's top and bottom, expires after
`FREE_OPTION_TICKS` (600, blinking the last 120) and gives an Option back (`regainOption`) —
[options-shields-hunter.md](options-shields-hunter.md#the-option-hunter-coreenemies-corebehaviors).
Since M2-10 the hidden bonus stages' items: `drop: "oneUp"` → `ItemKind.OneUp` (9, `items/1up`
— `ONE_UP_SPRITE`, 0 points, +1 life up to `MAX_LIVES` 9 with the critical `ExtraLife` cue, at the
cap only the pickup sound) and `drop: "bonusCapsule"` → `ItemKind.BonusCapsule` (10,
`items/capsule-bonus` — `BONUS_CAPSULE_SPRITE`, `BONUS_CAPSULE_SCORE` 1,000 points, the pickup
sound); both are world-space and taken like a capsule in **both** power-up models (neither
advances the meter nor becomes a Direct-mode item) —
[campaign-and-bonus-stages.md](campaign-and-bonus-stages.md#items-corepowerups).

- **Where capsules come from.** The enemy system records every drop of the tick in
  `EnemySystem.outcomes` (`drop: "capsule"` carriers where they die; a formation whose members
  were all killed at its last kill — M1-08). At the end of phase 7 `resolve()` spawns a capsule
  for every drop not taken yet (`dropsTaken`); a kill made **between** ticks (a debug tool, a
  test calling `enemies.kill`) is recorded after that, so `beginTick()` at the start of phase 3
  takes it before `enemies.beginTick()` resets the outcomes. `spawnItem(kind, x, y)` drops one by
  hand (→ slot, or `-1` for a bad kind or a full pool — dropped quietly). Since M2-05 a drop of
  `drop: "powerup"` (`DropKind.PowerUp`) is the mode-agnostic power-up: a capsule here, and in
  Direct mode `capsule` and `powerup` drops both become the stage's next planned colour item
  (`dropDirect` — [direct-mode.md](direct-mode.md#drop-resolution-and-the-item-plan-corepowerups)).
  Since M2-06, while **two ships are in play** (co-op), every capsule / power-up drop also adds
  `config.coopExtra` (0.5) to the hashed `coopCredit`, and each whole credit drops one more item
  `COOP_EXTRA_OFFSET` (12) px below — the blue capsule and freed Options are not scaled
  ([coop.md](coop.md#co-op-drop-scaling-corepowerups)).
- **Motion and culling (phase 5).** Capsules are world-space: they stay where they dropped and
  scroll away with the terrain. An item more than `ITEM_CULL_MARGIN` (32) px outside the camera
  view — or at a `NaN` position — is removed.
- **The magnet (phase 5).** With `pickupMagnet`, an item whose circle (`ITEM_RADIUS` 5) comes
  within `PICKUP_MAGNET_RANGE` (16) px of an alive ship's pickup box moves `PICKUP_MAGNET_SPEED`
  (2) px/tick towards the nearest such ship's centre (snapping onto it when closer than that).
- **Pickups (phase 6).** Every live item's circle against each alive ship's pickup box (the
  KESTREL's is 16×12) — a closed test, touching counts, lowest player slot first; a hit is
  recorded in `outcomes` (`pickupPlayer`, `pickupKind`, `pickupX`, `pickupY`, `pickupScore`)
  and the item is removed. Items do not use the grid: 32 items × 2 ships is cheaper by brute
  force. Ships that are flying in, dying or dead collect nothing and pull nothing.
- **Applying them (phase 7).** `resolve()` calls `collect(player)` for every pickup in item
  order: **every pickup advances the meter** (no merging of quick pickups, §6A), pushes the
  meter "ding" (`SFX MeterAdvance`) and may Auto-equip. `outcomes` stays readable until the next
  phase 6 — `core/scoring` credits each `pickupScore` to its `pickupPlayer` right after
  `resolve()` (M1-12).

## The Force Field (`core/shields`)

Every ship carries one `ShieldState` from creation (`PlayerShip.shield`, a class — like
`speedLevel`, power-up state that lives on the ship; M1-10's `Loadout.shield` was removed):

| Field | Meaning |
|---|---|
| `kind` | `ShieldKind`: `None` 0, `ForceField` 1 (hashed: append, never renumber) |
| `hits`, `maxHits` | Hits left / of the fresh shield (wear = `hits / maxHits`) |
| `iFrames` | Remaining shield-hit i-frames (may outlive the shield after a break) |
| `absorbsTerrain` | Copied from the spec (`false` for the Force Field — D8) |
| `hitTick`, `brokeTick` | Tick of the last hit that cost a point / of the break (`-1` = never) — the events are pushed for them |
| `absorbed` | Hits absorbed so far, free i-frame hits included (statistics, tests) |

`FORCE_FIELD` (`ShieldSpec`): `maxHits` `FORCE_FIELD_HITS` (5), `iFrames` `SHIELD_HIT_IFRAMES`
(8), `absorbsTerrain` false, sprite `shields/force-field` (`FORCE_FIELD_SPRITE`, an engine
sprite) with `FORCE_FIELD_WEAR_FRAMES` (4). `SHIELD_SPECS` indexes the specs by kind.

**One hit, in order** — `playerHit(ship, cause, tick, debug)` is the single entry point of terrain,
contact, bullet and laser hits:

1. an inactive, not-`alive`, invulnerable or god-mode ship ignores it (`false`);
2. `absorbShieldHit(ship.shield, cause === Terrain, tick)`:
   - terrain on a shield without `absorbsTerrain` → `ShieldHit.None` — **neither the Force Field
     nor its i-frames help against rock**;
   - i-frames running → `Blocked`: swallowed for free;
   - a shield up → `Absorbed`: one hit less, `iFrames = 8`, `hitTick = tick`; the last hit is
     `Broke` instead: `brokeTick = tick`, the shield is removed — its i-frames keep running and
     cover the bare ship (not against terrain), so the break is survivable;
   - anything but `None` makes `playerHit` return `true` **without touching the ship** — the
     hit is "accepted" (the bullet is used up, lasers too) but not recorded (`hitCause`,
     `hitTick`, `hits` stay);
3. otherwise the hit is recorded on the ship, and phase 7 of the same tick runs the death
   sequence (M1-12, [death-and-scoring.md](death-and-scoring.md)) — which clears the shield of
   every preset anyway, so a terrain death takes the Force Field with it.

**I-frames count down in phase 7** (`tickShield`, called by `resolve()` for every ship), but not
on the tick of the hit that started them: a hit on tick `t` (phase 6) blocks the hits of ticks
`t + 1 … t + 8`. `resolve()` then pushes the events of a hit on this tick: `SFX ShieldHit`, or on
a break `SFX ShieldBreak` + `Particles FX_CUES.ShieldBreak` (param 1). Blocked hits push nothing.

**Granting and clearing.** The `?` slot and `applyLoadoutPreset(…, 'full', shield)` call
`grantShield(state, spec, heading)` with the session's `?` spec (`shieldSpecOf(config.shieldChoice)`,
M2-03): full hits, **i-frames reset to 0**, replacing whatever was there (a Free Shield on a Free
Shield adds a pair instead — M2-04). The `!` choice FULL BARRIER calls `refillShield` (M2-04):
the same kind standing gets every hit back in place, anything else a fresh one. `clearShield` removes it without a break (the `'default'` loadout; every death
penalty since M1-12). `shieldActive(state)` = a kind other than `None` with hits left — while it
is true the `?` slot is greyed (`canGrantShield`, which keeps a worn or unfinished Free Shield
equippable — M2-04).

**The other `?` shields (M2-04).** Reduce is a field like the Force Field (2 hits) that also
shrinks the ship's hurt radius — `hurtScale` ⅓ → ⅔ → 1, the terrain box unchanged. The front
Shield, Free Shield and Rotate Shield are **pods**: `absorbShieldHit` returns `None` while they
stand (they never cover the ship), and `core/bullets` / `core/enemies` test each pod
(`absorbPodHit`) against the bullets and bodies that touch it; each pod has 14 hits and its own
i-frames; this system places them in phase 2 (`placeShieldPods`, after the equip) and spins the
Rotate Shield in `tickShield`. The whole story is
[options-shields-hunter.md](options-shields-hunter.md#shields-coreshields).

**Drawing.** `sync()` puts one sprite per active, not-`dying` / `dead` ship with a shield into
`shieldBatch` (`LayerId.Player`, listed after the ships' batch, so it draws over the ship) at the
ship's centre. The frame is `shieldWearFrame(state, 4)` = `frames − ceil(hits · frames /
maxHits)` clamped: the M1-03 sprite has **four** wear frames (the plan said three), so a 5-hit
field shows fresh at 5 and 4 hits, then worn (3), damaged (2), critical (1). It blinks
(`SpriteFlag.Hidden`) with the ship's invulnerability and during its own i-frames.

## Mega Crash (the `!` slot)

With the default `!` choice (`megaChoice: 'megaCrash'` — the only one that does, M2-03), equipping
`!` sets `megaPending[p]`; `resolve()` detonates it in phase 7 of the **same tick** —
after the player shots' hits and the pickups (an Auto Power-Up order that reaches `mega`
detonates on the pickup's own tick) — so its kills are scored and drop capsules like any other.
`detonateMegaCrash(player)` (also callable directly by tests and tools):

1. `bullets.cancelAll(CancelMode.Points, player)` — every cancelable enemy bullet and laser
   (straight and bending) is removed, with `FX_CUES.BulletCancel` sparkles at up to 64 of them;
   since M2-02 every cancelled bullet also becomes a gold **point item** that flies to the
   bomber's score and adds `bulletCancel` points (10 by default; a bad player index only sparkles
   — [bullets-and-patterns.md](bullets-and-patterns.md#cancel));
2. `enemies.megaCrash(player)` — every live, non-ghost enemy whose spec is not
   `megaCrashImmune` goes through `EnemySystem.kill` in slot order: kill records with `killBy`
   = the player, explosion events, drops, formation completion (a formation it wipes out drops
   its capsule and pays its bonus). **Armour does not protect**, and enemies spawned just
   outside the view die too. The compiled `megaCrashImmune` table is read, never the content
   objects. A boss (M1-13) is untouched: its parts are not enemy slots, and its entry is
   `megaCrashImmune` too — but the bullets it fired are cancelled with the rest;
3. `requestFlash(world, FlashKind.MegaCrash)` (`core/fx`, M1-12: the flash timer and
   `SimEventKind.Flash` with `id` 0 and param `MEGA_CRASH_FLASH_TICKS` 12) and `SFX MegaCrash` at
   the ship.

The drops of its kills become capsules at the end of the same `resolve()`.

## Death penalties (M1-12)

`applyDeathPenalty(preset, ship, loadout, meter)` lives here — `core/player` cannot import the
weapon values without an import cycle — and the World calls it at the death, after the tick's
pickups (so a capsule collected on the fatal tick still advanced the meter first):

| `config.deathPenalty` | Shield | Loadout / speed | Cursor |
|---|---|---|---|
| `'classic'` (D6 default) | `clearShield` | `loseOneLevel`: the first of Option −1 → Double / Laser → basic → Missile off → speed level −1 | kept |
| `'arcade'` | `clearShield` | basic shot, no Missile, no Options, speed level 0 (the stage restarts at the respawn) | `-1` |
| `'casual'` | `clearShield` | kept | kept |

`loseOneLevel` returns the `MeterSlot` it took (`-1` when the ship is bare); a pending Mega Crash
is never touched (it detonates on that tick). The whole death sequence is
[death-and-scoring.md](death-and-scoring.md#the-death-penalty-d6). In Direct mode (M2-05) the
World calls `applyDirectDeathPenalty(preset, ship, loadout)` instead: the Arm always goes,
`classic` takes one main-shot level (else a sub-weapon level), `arcade` both levels and the
family, `casual` nothing more — the speed level stays
([direct-mode.md](direct-mode.md#speed-toggle-death-penalty-and-rank)).

## Presentation events

| When | Events (`x` / `y` = the ship, whole pixels) |
|---|---|
| Pickup | `Sfx MeterAdvance` (10) — the meter "ding" |
| Equip | `Sfx PowerUpEquip` (11) + `SimEventKind.PowerUp` (8: `id` = the `MeterSlot`, `param` = the player) — for callouts and the HUD flash |
| Denied press | `Sfx PowerUpDenied` (22, new) |
| Shield hit that cost a point | `Sfx ShieldHit` (12) |
| Break | `Sfx ShieldBreak` (13) + `Particles` `FX_CUES.ShieldBreak` (4, new), param 1 — since M2-04 also when one shield pod breaks |
| Blue capsule collected (M2-04) | `Flash` (`FlashKind.MegaCrash`) + `Sfx MegaCrash` at the collector — plus the enemies' explosions |
| Freed Option collected (M2-04) | `Sfx PowerUpEquip` + `SimEventKind.PowerUp` (`id` = `MeterSlot.Option`), or only `Sfx MeterAdvance` with four Options |
| Mega Crash | `Flash` (`id` = `FlashKind.MegaCrash` 0, param 12, at 0, 0 — through `core/fx` `requestFlash` since M1-12) + `Sfx MegaCrash` (15) — plus the cancel sparkles and the enemies' explosions |

Since M1-14 the renderer draws the shield break's `shield.break` sparks, the Mega Crash flash
(white, 0.85) and — through an `sfx` trigger on `MeterAdvance` — a cyan `pickup` ring at the ship
on every capsule pickup ([fx-and-game-feel.md](fx-and-game-feel.md)); capsules show no score
popup (it would cover the ship). Since M1-15 the events are heard (`MeterAdvance`,
`PowerUpEquip`, `PowerUpDenied`, `ShieldHit`, `ShieldBreak`, a centred `MegaCrash` —
[audio.md](audio.md)), and since M1-16 the HUD redraws the meter from the state (`cursor`,
`equippable`), not from these events. `SFX_CUES.CapsulePickup` (9) is **not** used by meter mode —
since M2-05 every Direct-mode colour item pickup pushes it ([direct-mode.md](direct-mode.md#the-items)).

## Determinism, restarts and hashing

`hashWorld` covers the `items` pool (a registered pool) and, after the weapons, `mixPowerUps`: per
player the meter `cursor`, `megaPending` and every `ShieldState` field (since M2-04 also
`hurtScale` and the pods), then `dropsTaken`. Not
hashed: the pickup outcomes (rebuilt every phase 6), the compiled Auto Power-Up order and the
sprite / score tables (derived from config and content) and the batches. A checkpoint restart
(`stage.restartAt` → the World's `clear` hook) empties the item pool (`pools.clearAll()`) and
`powerups.clear()` forgets the pickups, pending Mega Crashes and taken drops — the meters and
shields are player state and stay. What a death costs is `applyDeathPenalty` (below).

## Zero allocation and the hot-path rules

Everything is built by `createPowerUpSystem`; the tick writes numbers into typed arrays and class
fields. The guards (`powerups-alloc.test.ts`: the `'full'` loadout with Auto Power-Up, capsules
next to the ship, carriers shot down, bullets wearing the Force Field down and breaking it, OK
presses and a Mega Crash every few seconds; `powerups-alloc-coop.test.ts`: both players, a
scrolling camera, pickup ties, breaks and re-grants on both ships, two Mega Crashes on one tick;
since M1-12 it re-grants broken shields and plays the `casual` penalty — `classic` deaths
changing the loadouts late left a `core/weapons` grid visitor deoptimised by V8, see
[death-and-scoring.md](death-and-scoring.md#zero-allocation-and-the-hot-path-rules))
measure about **20 KB over 10,000 busy ticks** (budget 64 KB):

| Rule | Why |
|---|---|
| Rare events (a press, a pickup, a break) run in cold code | V8 leaves them in a lower tier; they cost a few bytes each, which is why the guards stay just above zero |
| Events are pushed at whole pixels (`pushAtShip`: `Math.floor(x) \| 0`) | The event push is a call V8 does not inline — a fractional position would be boxed per sound (the M1-10 lesson) |
| `PowerMeter` and `ShieldState` are classes; the system is a class (`PowerUpSystemImpl`) | Numeric fields stay unboxed; methods stay monomorphic |
| The pickup box half sizes are copied into fields at creation | The ship spec has several shapes (content vs `DEFAULT_PLAYER_SHIP`) — reading it per item would go megamorphic |
| `collide()` inlines the circle-vs-box test | No call with fractional arguments per item and ship |

## Using it headlessly

```ts
import {
  Action,
  ENGINE_SPRITES,
  ItemKind,
  KNOWN_SCRIPT_IDS,
  MeterSlot,
  commitPlayerInput,
  createGame,
  createHeadlessPlatform,
  loadContent,
} from '@shmup/core';

const db = loadContent(files, { knownScripts: KNOWN_SCRIPT_IDS, extraSprites: ENGINE_SPRITES }).db;
const platform = createHeadlessPlatform();
const game = createGame(platform, { stage: 'test-range', autoPowerUp: false }, db);
for (let i = 0; i < 60; i++) game.step(); // the 40-tick fly-in is over: the ship collects
const { powerups, players } = game.world;
powerups.spawnItem(ItemKind.Capsule, players[0].x, players[0].y); // a capsule on the ship
game.step(); // collected in phases 6–7
powerups.meters[0].cursor === MeterSlot.Speed; // → true
const input = platform.snapshot.players[0];
commitPlayerInput(input, Action.PowerUp); // the pressed edge (remote OK)
game.step(); // speedLevel 0 → 1, cursor → -1
commitPlayerInput(input, 0); // release before the next press — holding never re-equips
powerups.equippable(0); // bit mask of the slots the HUD would not grey
powerups.detonateMegaCrash(0); // debug: clear the screen now
```

## Extending it

| To add… | Do this |
|---|---|
| An item kind | Append an `ItemKind` code (hashed) and an `ITEM_KINDS` entry (sprite, frames, score) — `ITEM_SPRITES` and `ENGINE_SPRITES` follow; its art in `scripts/assets/procedural/`; what it does in `resolve()`'s pickup switch (capsules `collect`, blue capsules `clearScreen`, freed Options `regainOption` — M2-04, colour items `collectDirect` — M2-05) and, if it drifts and expires, its `itemDrift` / `itemLife` entries (set in the constructor) |
| A drop kind | `DropKind` in `core/enemies` (M1-08 — content drops first: M2-05 moved `FreeOption` to 4 behind `PowerUp` 3, M2-10 to 6 behind `OneUp` 4 / `BonusCapsule` 5), then map it in `takeDrops` (per power-up model if it differs — `powerup`: a capsule or `dropDirect`) |
| A meter slot rule | `canEquipSlot` / `equipSlot`, the matching `nextAutoSlot` rule, `METER_LABELS` and the `hud/meter-labels` art (`core/ui` `METER_LABEL_FRAMES`); a new slot also needs `METER_SLOT_NAMES` / `MeterSlotName` in `core/config` |
| A `!` choice | `MegaChoice` / `MEGA_CHOICES` in `core/config` and `MegaEffect` here (same order), its rule in `canEquipMega` and its effect in `applyMega`, a label in `core/scenes` `MEGA_CHOICE_LABELS` ([meter-arsenal.md](meter-arsenal.md#extending-it)) |
| A shield kind | Append a `ShieldKind` code and name, a `ShieldSpec` in `SHIELD_SPECS` (`absorbsTerrain: true` like the Arm of M2-05; `pods` / `hurtSteps` as the M2-04 kinds show; tiers as `ShieldState.tier` / `charge` and `collectArm` show), its sprite in `SHIELD_SPRITES`, grant it from its slot; keep `absorbShieldHit` / `absorbPodHit` allocation-free and hash any new state in `mixPowerUps` — [options-shields-hunter.md](options-shields-hunter.md#extending-it) |
| Something that reacts to pickups (like `core/scoring`, M1-12) | Read `world.powerups.outcomes` (`pickupCount`, `pickupPlayer`, `pickupScore`, …) after `powerups.resolve()` in phase 7 — reset in phase 6 |
| Something the HUD meter shows | `core/ui` `buildHud` draws `meters[0].cursor` (flashing every `HUD_METER_FLASH_TICKS`) and greys the slots missing from `equippable(0)`; add any new state it depends on to `Hud.update`'s comparison ([scenes-and-ui.md](scenes-and-ui.md#the-hud)) |
| An enemy Mega Crash spares | `"megaCrashImmune": true` in its `content/enemies/` entry |

## Tests

| Where | Covers |
|---|---|
| `packages/core/test/powerups/powerups.test.ts` | The plan's acceptance: wrap and maxed rules, Double / Laser exclusivity, equip only on the pressed edge, the Auto Power-Up order, rapid successive pickups each advancing, the magnet, capsules from carriers and formations, the Force Field in the World (hits, i-frames, no terrain absorption, break events), Mega Crash (bullets, enemies, immunity, flash, credit), lockstep hashes |
| `packages/core/test/powerups/powerups-edge.test.ts` | Out-of-range and `NaN` cursors, bad player indices and item kinds, a full pool, who may press, whole-pixel events, co-op presses and two Mega Crashes on one tick, order corners (repeats, Laser-then-Double, `mega` in the order, entries past a maximum), culling while scrolling, `NaN` items, the blink, the magnet's reach / snap / nearest ship, pickup ties, non-cancelable bullets, ghosts, a formation wiped out by Mega Crash, break and re-grant on one tick, restarts |
| `packages/core/test/powerups/powerups-alloc*.test.ts` | The allocation guards above (own workers) |
| `packages/core/test/shields/` | The hit counter, i-frames (never below 0, not on the hit's tick), the break, terrain, wear frames in and out of range, what grant / clear keep, `playerHit` with the shield in every ship state; since M2-04 the pods, Free Shield pairs, the Rotate spin, Reduce and FULL BARRIER (`shields-pods`, `shields-variants-edge`, `shields-world*`, `shields-alloc` — [options-shields-hunter.md](options-shields-hunter.md#tests)) |
| `packages/core/test/powerups/powerups-m204-edge.test.ts` | M2-04: blue capsules and freed Options in the item pool (drift, bounce, expiry, pickup by either player, `regainOption` at four) |
| `packages/core/test/config/`, `debug/`, `events/`, `player/`, `weapons/`, `world/`, `packages/shell/test/flight/` | `powerUpMode` / `autoPowerUpOrder` validation and defaults; the power-ups in `hashWorld`; the new event codes; the `shield` field; the `'full'` loadout's Force Field; the World's and the flight scene's batch lists |
| `test/integration/powerups-runtime.test.ts` | The shipped `test-range`: formation kill → capsule → one OK press equips Speed (input only); a carrier's capsule drawn as `items/capsule`; Auto Power-Up growing the loadout without a button; Mega Crash mid-stage; a capsule-hunting bot within every bound, lockstep hashes |
| `test/integration/powerups-remote.test.ts` | Real `keydown` / `keyup` through `@shmup/input-web` and the `tizen-remote-safe` profile: one equip per OK press (auto-repeat and fake release pairs never re-equip), OK while an arrow is held keeps the ship moving, a denied press, replay to the same hash |
| `packages/core/test/powerups/powerups-arsenal*.test.ts` | M2-03: the loadout → meter mapping for every type and a Weapon Edit, every `!` choice (pure rules and in a World — only Mega Crash detonates), Auto Power-Up equipping or parking on `!`, the HUD's label frames ([meter-arsenal.md](meter-arsenal.md#tests)) |
| `test/e2e/powerups.spec.ts` | In Chromium: `?loadout=full` draws the fresh cyan Force Field ring around the ship; the default web boot and the Tizen build (which ignores `?loadout=full`) never show it; no console errors or unknown-sprite warnings |

## Gotchas

| Symptom | Cause / fix |
|---|---|
| OK "does nothing" | No slot is highlighted on the HUD meter (no capsule since the last equip — `meters[p].cursor` is `-1`) or the highlighted slot is greyed (cannot be equipped); a denied press plays `PowerUpDenied` (M1-15 — in a browser only after the first key press). `?scene=flight` draws no meter |
| A test presses `PowerUp` every tick and equips only once | By design — only the `pressed` edge equips. Commit `0` (release) between presses |
| A capsule spawned by a test vanishes | It was more than 32 px outside the camera view (culled in the next phase 5), or it landed on the ship during the fly-in and is waiting — ships collect only while `alive` |
| A kill made between ticks produced no capsule yet | It appears at the next tick's phase 3 (`beginTick`) |
| OK does nothing at all with the MANTA | Direct mode (M2-05) has no meter: the PowerUp press is ignored, items act on pickup ([direct-mode.md](direct-mode.md#gotchas)) |
| The ship still takes terrain hits with a Force Field | By design (D8): rock is never absorbed, not even during the shield-hit i-frames |
| A Force Field drains while the ship sits inside an enemy | Contact is absorbed like a bullet: one hit, 8 free ticks, the next hit — five hits last about 40 ticks |
| Bullet hits on a `'full'`-loadout ship are not recorded | Since M1-11 `'full'` includes a Force Field: the first five (plus i-frame) hits are absorbed; use the `'default'` loadout or `clearShield(ship.shield)` |
| `loadout.shield` does not exist | Moved to the ship in M1-11: `ship.shield.hits` |
| Re-granting right after a break loses the free ticks | `grantShield` resets `iFrames` to 0 (a fresh shield) |
| Mega Crash killed an enemy that had not appeared yet | It kills every live enemy, on screen or not (except `megaCrashImmune`) |
| Code picking a batch from `view.batches` by index broke | M1-11 appended the shields and the items after the enemy bullets: ground enemies, air enemies, shots, Options, ships, enemy bullets, shields, items (earlier indices unchanged); M2-02 / M1-13 / M2-04 appended the point items, the boss and the Options Option Hunters carry |
| `?` is not greyed with a Free Shield up | By design (M2-04): it adds a pair while one fits, then replaces the most worn pair while any pod is worn |
| Bullets reach the ship through a pod shield | Pods stop only what touches them and never cover the ship (M2-04) — the Force Field and Reduce do |
| Capsules or the Force Field simulate but are invisible | The content was loaded without `extraSprites: ENGINE_SPRITES` (`items/capsule` and `shields/force-field` are engine sprites); the shell passes it by default |
| The allocation guard creeps up after a change here | A fractional argument to a non-inlined call (events, helpers), a closure or literal in `update` / `collide` / `resolve` / `sync`, or hot work moved into the cold press / pickup paths |

## Next steps that build on this page

- **M1-12** (done) — score from `outcomes.pickupScore` and Mega Crash kills (`killBy`);
  `applyDeathPenalty` / `loseOneLevel` (below); Mega Crash's flash goes through `core/fx`
  `requestFlash` ([death-and-scoring.md](death-and-scoring.md)).
- **M1-13** (done) — bosses stay out of Mega Crash (a test checks it); the WARNING and the boss
  death's bullet cancel ([bosses-and-warning.md](bosses-and-warning.md)).
- **M1-14** (done) — the shield-break particles, the Mega Crash flash, cancel sparkles, the
  pickup ring ([fx-and-game-feel.md](fx-and-game-feel.md)).
- **M1-15** (done) — the sounds of every event above ([audio.md](audio.md)).
- **M1-16** (done) — the HUD power meter (`cursor`, `equippable`, the `hud/meter-labels`
  frames, the highlighted slot flashing every 8 ticks) ([scenes-and-ui.md](scenes-and-ui.md#the-hud)).
- **M2-02** (done) — Mega Crash cancels into point items for the bomber (`CancelMode.Points`)
  ([bullets-and-patterns.md](bullets-and-patterns.md#cancel)).
- **M2-03** (done) — the `!` choices and the `?` choice (`MeterChoices`), the meter equipping
  the session's weapon type, the weapon select setting them with Auto Power-Up and its order
  ([meter-arsenal.md](meter-arsenal.md)).
- **M2-04** (done) — the other meter shields (pods, Reduce), `refillShield` for FULL BARRIER, the
  blue capsule and the freed Options of the Option Hunter
  ([options-shields-hunter.md](options-shields-hunter.md)).
- **M2-05** (done) — Direct mode: the drop resolution per model, the stage's item plan, the six
  colour items, the Arm tiers, the Speed toggle and the Direct death penalty
  ([direct-mode.md](direct-mode.md)).
- **M2-06** (done) — co-op: an item goes to whoever touches it first (player 1 on a tie) — its
  meter, shield and score; the co-op drop scaling (`coopCredit`, `COOP_EXTRA_OFFSET`)
  ([coop.md](coop.md)).
