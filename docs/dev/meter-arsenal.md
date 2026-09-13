# The meter arsenal: Types B–D, Weapon Edit, `!` / `?` choices and the weapon select

How meter mode got its full Gradius III–style loadout choice in plan step **M2-03**: nine new
weapon **behaviours** (Spread Bomb, 2-Way Missile, Photon Torpedo, Tail Gun, Vertical, Free Way,
Ripple Laser, Cyclone Laser, Twin Laser), the **presets** Type A–D and **Weapon Edit** as
`GameConfig` fields, the **`!` choices** (Mega Crash, NORMAL, SPEED DOWN, LIFE OPTION, FULL
BARRIER) and the **`?` choice**, the HUD meter naming its slots after the arsenal, and the
**weapon select** screen after the difficulty menu — with an editable Auto Power-Up order and a
**live preview** flown by a private mini World. `core/weapons` is `implemented` for meter mode
with it (Direct mode is M2-05).

This page is the *how and why* and the map of the whole step. Exact signatures are in
[api-reference.md](api-reference.md#weapons--player-weapons-meter-mode-implemented); the TSDoc in
`packages/core/src/{weapons,powerups,config,scenes}/index.ts` is the authoritative reference. The
weapon file format for authors is next to the data:
[`content/weapons/README.md`](../../content/weapons/README.md). The systems this step extends
have their own pages:

| Part | Home page |
|---|---|
| The shot pool, autofire, caps, hits, Options — the machinery every new behaviour runs in | [weapons-and-options.md](weapons-and-options.md) |
| The power meter, Auto Power-Up, the Force Field, Mega Crash | [powerups-and-shields.md](powerups-and-shields.md) |
| The scene stack and flow, the UI kit, the HUD | [scenes-and-ui.md](scenes-and-ui.md) |
| The shell's scene view (which World view the renderer gets) | [rendering-and-shell.md](rendering-and-shell.md#scenes) |
| The new shot sprites and the `weapons` generator | [asset-pipeline.md](asset-pipeline.md#procedural-generators-scriptsassetsprocedural) |
| Golden replays and why they were re-blessed | [debug-and-replays.md](debug-and-replays.md#golden-replays-testgolden) |

Background: `shmup_feat.md` §7A (the meter-mode weapons, preset loadouts, Weapon Edit, the `!`
slot choices), §6A (the meter, parking the cursor, Auto Power-Up), §9 (the `?` shields), §16 (the
weapon select), §4 (remote rules: always-on autofire, OK as a rare press, menus by D-pad + OK +
Back); plan §3.2 (tick phases) and decisions **D2** (Auto Power-Up), **D12** (the remote is
primary), **D26** (world-space entities) and **D29** (behaviour coroutines).

## The picture at a glance

```text
 title ─START→ DifficultyScene ─OK→ WeaponSelectScene ─START→ GameScene (World on the chosen config)
                   ▲  Back              │  ORDER ─OK→ AutoOrderScene (overlay, 12 rows + DONE)
                   └────────────────────┘  preview: a private World on content/stages/weapon-range
                                            (own event queue, own god mode, setArsenal per change)

 WeaponSelectScene.arsenal()  →  ArsenalChoice { weaponPreset, weaponEdit, megaChoice,
                                                 shieldChoice, autoPowerUp, autoPowerUpOrder }
   flow.chooseArsenal(choice) →  every difficulty's config: withArsenal(config, choice)
                                 (or the same object when arsenalMatches)            core/config
 createWorld(config, db)
  ├─ weapons: resolveArsenal(db, config) → roleWeapons[Main, Double, Laser, Missile]   core/weapons
  │           (preset's weapons, Weapon Edit overriding Missile / Double / Laser; throws if bad)
  │           compileRoles → RoleTables (kind, speed, cap, … gravity, blast, ring, gap)
  ├─ powerups: meterChoicesOf(config) → MeterChoices { mega: MegaEffect, shield: ShieldSpec }
  └─ applyLoadoutPreset(…, config.loadout, shieldSpecOf(config.shieldChoice))
 HUD: meterLabelFrame(world, slot) → MISSILE / DOUBLE / LASER named after roleWeapons      core/ui
```

## Configuration (`core/config`)

Four `GameConfig` fields — sim-affecting, validated by `resolveGameConfig`, recorded in replay
headers:

| Field | Default | Meaning | Validation |
|---|---|---|---|
| `weaponPreset` | `'type-a'` | A `content/weapons/` preset id; a content without it falls back to its first preset | a non-empty string (whether the content has it is `core/weapons`' business) |
| `weaponEdit` | `null` | Weapon Edit: `{ missile, double, laser }` weapon ids replacing the preset's for those three slots (the main shot stays the preset's) | `null` (an explicit `undefined` counts as `null`) or an object whose three fields are non-empty strings — the result holds a frozen copy with exactly those fields; `createWorld` then throws `RangeError` for an id the content lacks or a weapon of another slot, checking `missile`, `double`, `laser` in that order |
| `megaChoice` | `'megaCrash'` | What the `!` slot does (`MegaChoice`, `MEGA_CHOICES` in menu order) | one of `megaCrash normal speedDown lifeOption fullBarrier` |
| `shieldChoice` | `'forceField'` | What the `?` slot grants (`ShieldChoice`, `SHIELD_CHOICES`) | one of `forceField shield freeShield rotateShield reduce` (the last four since M2-04 — [options-shields-hunter.md](options-shields-hunter.md#shields-coreshields)) |
| `optionChoice` (M2-04) | `'trail'` | How the Options fly (`OptionChoice`, `OPTION_CHOICES`) | one of `trail snake formation rotate` ([options-shields-hunter.md](options-shields-hunter.md#option-types-coreoptions)) |

`WEAPON_EDIT_SLOTS` (`missile, double, laser`) is the meter order of a Weapon Edit.

**The weapon select's choice.** `ArsenalChoice` is `Partial<Pick<GameConfig, 'weaponPreset' |
'weaponEdit' | 'megaChoice' | 'shieldChoice' | 'optionChoice' | 'autoPowerUp' |
'autoPowerUpOrder'>>` (`optionChoice` since M2-04):

- `withArsenal(config, choice)` → a frozen, validated config with those fields set; a field the
  choice leaves `undefined` keeps the config's value (`weaponEdit: null` *clears* an edit). Every
  other field — the difficulty's preset fields included — stays, so it composes with
  `withDifficulty` in either order.
- `arsenalMatches(config, choice)` → whether the config already has every field the choice sets
  (the edit and the order compared by value) — then `withArsenal` would change nothing, and the
  flow keeps the config object itself.

**Replays.** The header copies the whole config, so the four fields are recorded without a format
change (`REPLAY_FORMAT_VERSION` unchanged): a header written before M2-03 has none of them and
decodes to the defaults; a malformed one fails `decodeReplay` like any bad config.

**Lifetime.** The loadout is **session-wide** (both players fly the same arsenal) and lives for
the session only: the flow keeps it for RETRY and later games until the app closes. Saving it with
the other game options is M2-16.

## Content: presets and weapons

`content/weapons/types-b-d.weapons.json` holds the nine Types B–D weapons and the presets
`type-b`, `type-c`, `type-d`; `type-a.weapons.json` keeps Type A. Content files load sorted by
path, and `type-a…` sorts before `types-b-d…`, so the weapon select lists the presets A → D.

| Preset | MISSILE | DOUBLE | LASER |
|---|---|---|---|
| `type-a` | `missile.ground` MISSILE (`missile.groundSlide`) | `shot.double` DOUBLE (`shot.double`) | `laser.pierce` LASER (`laser.beam`) |
| `type-b` | `missile.spread` SPREAD BOMB (`missile.spreadBomb`) | `shot.tail` TAIL GUN (`shot.tailGun`) | `laser.ripple` RIPPLE LASER (`laser.ripple`) |
| `type-c` | `missile.twoWay` 2-WAY MISSILE (`missile.twoWay`) | `shot.vertical` VERTICAL (`shot.vertical`) | `laser.cyclone` CYCLONE LASER (`laser.cyclone`) |
| `type-d` | `missile.torpedo` PHOTON TORPEDO (`missile.torpedo`) | `shot.free` FREE WAY (`shot.freeWay`) | `laser.twin` TWIN LASER (`laser.twin`) |

Every preset keeps `shot.basic` as its main shot. Weapons gained an optional **`name`** (upper
case `A–Z 0–9 space . -`, ≤ 16 characters — the weapon select's label; omitted = the id in upper
case, `weaponLabel`). The names are original (Gradius III's *roles*, never its names — plan §1.5).

The shipped numbers (damage / speed px per tick / cap per shooter / pierce): Spread Bomb 2 / 2.5 /
1 / no (its blast pierces); 2-Way Missile 2 / 3 / 2 / no; Photon Torpedo 2 / 4 / 1 / no; Tail Gun,
Vertical and Free Way 1 / 7 / 2 / no; Ripple Laser 1 / 6 / 3 / no, `refireTicks` 8; Cyclone Laser
1 / 10 / 1 / yes; Twin Laser 1 / 12 / 4 / no. The **Twin Laser ships non-piercing** on purpose: two
beams × two pairs × five shooters is 20 piercing beams per player — 40 in co-op — against the 32
hit-cooldown tables (`PIERCE_TABLES`), so a piercing Twin would starve (a piercing shot without a
free table is not fired).

## The arsenal (`core/weapons`)

`resolveArsenal(content, config)` → the weapon of each `WeaponRole` (`Main`, `Double`, `Laser`,
`Missile`; `null` = empty): `resolveRoleWeapons(content, resolveWeaponPreset(content,
config.weaponPreset))`, then, with a Weapon Edit, the Missile / Double / Laser roles replaced by the
named weapons. It allocates (load time) and throws `RangeError`
(`GameConfig.weaponEdit.<slot>: no weapon "<id>" in the content` / `… belongs in slot <slot>`).
`createWeaponSystem` calls it, so `createWorld` throws the same errors.

- **The loadout → meter mapping.** Nothing in the meter changed: MISSILE sets `loadout.missile`,
  DOUBLE / LASER set `loadout.main` — and whichever weapon the arsenal put in that role fires. A
  Type C ship that takes DOUBLE fires the Vertical.
- `weaponsOfSlot(content, slot)` lists a slot's weapons in content order (the Weapon Edit lists);
  `WEAPON_BEHAVIOR_LABELS` names each behaviour for the HUD (`SPREAD`, `2-WAY`, `TORPEDO`, `TAIL`,
  `VERTICAL`, `FREE WAY`, `RIPPLE`, `CYCLONE`, `TWIN`; Type A's `SHOT`, `DOUBLE`, `LASER`,
  `MISSILE`).
- **`WeaponSystem.setArsenal(roles)`** swaps the arsenal in place — the preview's tool: it copies
  `roles` into `roleWeapons` (no longer frozen), recompiles the `RoleTables` in place
  (`compileRoles` now resets every entry of existing tables instead of building new ones), empties
  the shot pool, the hit list and the cooldown tables and restarts the autofire timers. It never
  allocates. It is a cold path that a recorded session must never call — a replay header only
  knows the config's arsenal.

## The nine behaviours

`ShotKind` codes 4–9 were **appended** (the kind is hashed): `SpreadBomb` 4, `TwoWay` 5,
`Torpedo` 6, `FreeWay` 7, `Ripple` 8, `Twin` 9. Three behaviours reuse an existing kind with other
defaults: `shot.tailGun` and `shot.vertical` are `Double` pairs, `laser.cyclone` is a `Laser`. New
tunables (defaults in `WEAPON_BEHAVIOR_PARAMS`, compiled into new `RoleTables` arrays): `gravity`,
`blastRadius`, `blastTicks`, `startSize`, `maxSize`, `growth`, `aspect`, `gap`. Angles are binary
units (1024 per turn, 0 = forward, 256 = down).

| Behaviour (kind) | Motion | Hits |
|---|---|---|
| `missile.spreadBomb` (`SpreadBomb`) | Launched `angle` 64 below forward at `speed`, `vy` gains `gravity` 0.12 each tick (an arc), riding the camera; **bursts** where its bottom — or its centre, for a wall — meets terrain, or on the first target it touches | The bomb itself does no damage: the burst turns the same slot into the **blast** (below) |
| `missile.twoWay` (`TwoWay`) | A volley of two: one `angle` 128 up from forward, one down (frames 0 / 1); straight flight, dies on terrain | Non-piercing; the next volley waits until both are gone (the Double rule); cap 1 fires only the climbing one |
| `missile.torpedo` (`Torpedo`) | A `missile.groundSlide` (falls at `angle` 96, slides at `slideSpeed` 5 px/tick) | Flies on through every **enemy** its hit destroys ("pierces small enemies"); a survivor, armour or a boss part stops it |
| `shot.tailGun` (`Double`) | A forward shot + one straight back (`angle` 512, `ox` −6) | Double rule |
| `shot.vertical` (`Double`) | A forward shot + one straight up (`angle` 256, `oy` −6, a tall box) | Double rule |
| `shot.freeWay` (`FreeWay`) | A forward shot + one in the player's **last 8-way direction** | Double rule |
| `laser.ripple` (`Ripple`) | A ring flying forward at `speed` 6; its half height grows from `startSize` 4 by `growth` 0.5 per tick to `maxSize` 20, its half width is `aspect` 0.5 × that; the sprite frame follows the size | Non-piercing; the **ring**, not the box, is the hitbox (below) |
| `laser.cyclone` (`Laser`) | A `laser.beam` 80 px long, 8 px thick (`hh` 4); its 8-px segments step `frames` 4 swirl frames along the beam and over time | Piercing with the 6-tick hit cooldown, like Type A's laser |
| `laser.twin` (`Twin`) | Two short beams (`maxLength` 16) `gap` 8 px apart that follow their shooter's row | Non-piercing in the shipped content; a pair fires while two more beams fit under the cap (cap 4 = two pairs) |

**The Spread Bomb's blast.** `detonate()` sets `ShotFlag.Blast` (new, 16) and `Pierce` on the
slot, stops it, makes its box `blastRadius` (14 px half size, both axes), restarts `age` (ticks
since the burst), swaps the sprite for `shots/blast` (`SPREAD_BLAST_SPRITE`, an **engine sprite** —
`WEAPON_SPRITES` is part of `ENGINE_SPRITES`) and pushes `Sfx EnemyExplodeSmall` and
`Particles ExplosionSmall` at whole pixels. The blast is **world-anchored** (it does not ride the
camera — it stays on the ground it hit and scrolls away with it), burns `blastTicks` 12 ticks
(its frame follows `age`) and hits each target at most once per `hitCooldownTicks` 6 — **twice**.
Its hit-cooldown table is **reserved when the bomb is fired** (`RoleTables.table`; a bomb with no
free table is not fired), and the cap counts bomb and blast together. Armour and armoured boss
parts **clink without putting it out**: the clink is spaced by the same cooldown (at most two
clinks — a TEST-agent fix: the armour bypass of the piercing cooldown now applies only to shots
that die on armour).

**The Ripple's ring.** With the box as hitbox, the lowest-slot rule of non-piercing shots gave
every ring to HALCYON BULWARK's fringe armour plates (the box overlapped them first) and Type B
could not damage the boss. So `collide()` adds an exact ring test (`ringTouches`, on the ellipse
scaled to a circle): a target is hit when its box reaches into the ring's outer ellipse (closed)
and is **not wholly inside** its inner edge, `RIPPLE_RING_WIDTH` (4) px in from the outer one
(measured on the height). A small enemy the ring has already swallowed is no longer hit.

**The Free Way's direction.** `WeaponSystem.freeWayHeading` (an `Int32Array` per player,
**hashed**) records the heading of the last 8-way direction the player's intent held while the ship
was `alive` (`[(moveY + 1) × 3 + (moveX + 1)]` → `640 768 896 / 512 – 0 / 384 256 128`; up-left,
up, up-right, left, right, down-left, down, down-right). Releasing the arrows keeps it; `-1` (no
direction yet) falls back to `angle` 128 up from forward. Only the second shot turns — the forward
shot always flies forward.

**The Twin's lanes.** A beam's `vy` holds its **lane** (row offset from its shooter: ∓ `gap / 2`),
set through a class field (`lane`) while `emit` fills the slot; the beam follow of phase 5 is now
`y = shooter y + oy + vy` for every beam kind — `oy` and the lane are 0 for Type A, so its laser is
unchanged.

## The `!` and `?` choices (`core/powerups`)

`meterChoicesOf(config)` builds a `MeterChoices` (a class: `mega` — a `MegaEffect` code in
`MEGA_CHOICES` order, `megaEffectOf(name)` — and `shield` — the `ShieldSpec` of `core/shields`
`shieldSpecOf(config.shieldChoice)`, via `SHIELD_CHOICE_SPECS`); the power-up system keeps it as
`PowerUpSystem.choices`. `canEquipSlot` / `equipSlot` / `equippableSlots` take it as an optional
last argument (default `DEFAULT_METER_CHOICES`: Mega Crash and the Force Field — Type A of M1-11),
and the ship argument is now a `MeterShip` (`speedLevel`, `shield`, optional `lives`).

| `!` choice (`MegaEffect`) | Equipping does | Greyed when |
|---|---|---|
| `megaCrash` (0, default) | arms Mega Crash (`megaPending`) — the only choice that does | never |
| `normal` (1) | `loadout.main` = the basic shot (Missile and Options stay) | the basic shot is current |
| `speedDown` (2) | `speedLevel − 1` | speed level 0 |
| `lifeOption` (3) | `lifeOptionCount(ship, loadout)` = `min(lives − 1, 4 − options)` spare ships become Options (`lives` drops by as many) | no spare ship, or four Options |
| `fullBarrier` (4) | a fresh `?` shield (full hits, i-frames reset) — also over a worn one, or after a break; since M2-04 `refillShield`: the same kind standing gets every hit back **in place** (every pod slot, broken pods included) | the shield is up at full strength |

`?` grants `choices.shield` instead of the hard-wired Force Field (so does a `'full'` starting
loadout, at creation and on a continue); the shield batch draws that spec's sprite and wear frames
— since M2-04 one sprite per standing pod for the pod shields.
**Auto Power-Up** treats a `mega` entry as before (never "satisfied"), so it applies the `!` choice
whenever a capsule lands the cursor on `!` and the choice can act; a greyed choice parks the
cursor there like any greyed slot. **Parking** needed nothing new: with AUTO off (the default) the
cursor stays wherever the capsules left it until OK.

## The HUD meter

`hud/meter-labels` grew from 7 to **16 frames** (`core/ui` `METER_LABEL_FRAMES`: the seven slot
labels, then `SPREAD 2-WAY TORPEDO TAIL VERTICAL FREE WAY RIPPLE CYCLONE TWIN` — the generator's
`METER_LABELS` in `procedural/hud.mjs` must list the same order, and a test keeps them equal).
`meterLabelFrame(world, slot)` picks the frame: MISSILE / DOUBLE / LASER show the label of the
behaviour in that role of `world.weapons.roleWeapons` (the slot's own label for an empty role or a
behaviour without a frame), every other slot its own; `?` and `!` keep their symbols. `buildHud`
draws it; it never allocates. Because `roleWeapons` changes only with `setArsenal`, `Hud.update`
needs no new comparison for the game (the preview draws no HUD).

## The weapon select (`core/scenes`)

The difficulty menu's OK now calls `chooseDifficulty` and **pushes `WeaponSelectScene`** (id
`weaponSelect`) instead of starting the game: a full screen (not an overlay) with a panel on the
left (184×192 from x 4, y 12) and the live preview behind it.

| Row (`WeaponSelectItem`) | Value | Notes |
|---|---|---|
| TYPE (0) | `TYPE A` … `TYPE D` (each preset id upper-cased, `-` → space), then `EDIT` | `EDIT` is offered only when every Missile / Double / Laser slot has a weapon; a content without presets shows `DEFAULT` |
| MISSILE / DOUBLE / LASER (1–3) | the slot's weapons by `weaponLabel` (`SPREAD BOMB` …) | **disabled** unless TYPE is `EDIT`; they show the type's weapons, and entering EDIT starts from the last type's |
| OPTION (4, M2-04) | `OPTION_CHOICE_LABELS`: `TRAIL`, `SNAKE`, `FORMATION`, `ROTATE` | the preview flies the chosen type; while focused it spreads / retracts every `PREVIEW_SPREAD_TICKS` (90) |
| `? SLOT` (5) | `SHIELD_CHOICE_LABELS`: `FORCE FIELD`, and since M2-04 `SHIELD`, `FREE SHIELD`, `ROTATE`, `REDUCE` | |
| `! SLOT` (6) | `MEGA_CHOICE_LABELS`: `MEGA CRASH`, `NORMAL`, `SPEED DOWN`, `LIFE OPTION`, `FULL BARRIER` | |
| AUTO (7) | `ON` / `OFF` (a `Toggle`) | Auto Power-Up |
| ORDER (8) | the order in one-letter codes (`S M D L O ? !`, `+` past eight entries, `NONE` when empty) | OK opens the order editor |
| START (9) | — | OK starts the game |

The row codes above are M2-04's: the OPTION row moved `?` … START up by one (they were 4–8 in
M2-03) — address rows by `WeaponSelectItem` name, never by number.

- **Input.** Up / Down move (the disabled rows are skipped), Left / Right — or OK — change the
  focused value; OK on ORDER / START acts; Back pops to the difficulty menu (which re-locks its
  menu for 2 ticks on `uncover`). The screen **opens focused on START** with the usual 2-tick lock,
  so a game start takes **one more OK** than in M2-01 (`PRESS OK`, START, a difficulty, START) —
  every flow test and e2e spec was updated.
- **State.** The first visit starts from the host config's loadout (its preset, else the first;
  its Weapon Edit opens on `EDIT`; its `!`, `?`, AUTO and order). Later visits show the last
  choice — Back keeps the rows, but only START hands them to the game.
- **START.** `arsenal()` builds the `ArsenalChoice` (EDIT → the Weapon Edit plus the last type
  chosen as `weaponPreset`, whose main shot the edit keeps), `flow.chooseArsenal(choice)` applies it
  to **every difficulty's** config (`withArsenal`, or the config object itself when
  `arsenalMatches`), `SceneFlow.arsenal` records it, and the stack resets to the game scene. RETRY
  and later games keep it (`SceneFlow.gameConfig` = the chosen difficulty's armed config).
- **The order editor** (`AutoOrderScene`, id `autoOrder`): an overlay (dim 0.35) with a panel on
  the right — `AUTO ORDER`, `AUTO_ORDER_ROWS` (12) rows `1` … `12`, each one of
  `AUTO_ORDER_LABELS` (`SPEED MISSILE DOUBLE LASER OPTION ? !` or `-` = no entry), and DONE. It shows
  the order's first 12 entries (the rest `-`), focused on row 1; Left / Right / OK step a row; DONE
  **or Back** store the rows that are not `-`, in order, via `WeaponSelectScene.setOrder` — entries
  past row 12 (a host config's longer order) are kept after them (a TEST-agent fix: closing dropped
  them) — and close with the back sound. A slot listed `n` times asks Auto Power-Up for `n` levels.
- **String slots.** The flow's UI list grew from 96 to **160** string slots (the weapon select
  needs 4 + its menu's, the editor 1 + its menu's).

### The live preview

`WeaponSelectScene.preview` is a **private World** created in `enter()` (a transition) and dropped
in `exit()` (Back, or START):

- **Config**: the next game's config (`SceneFlow.gameConfig`) on `WEAPON_RANGE_STAGE`
  (`weapon-range`; free flight when the content lacks it), no stage skip, autofire and remote mode
  on, the `'default'` starting loadout, no Auto Power-Up, no Weapon Edit — the arsenal is handed
  over with `setArsenal` right after creation and on every TYPE / weapon change (`?` and `!` leave
  it alone).
- **Silent and safe**: its events go to the scene's **own** `EventQueue`, cleared every tick (no
  sound, nothing reaches the host), and god mode is on in its **own** `DebugFlags`. Its fly-in is
  stepped through at creation (≤ 120 ticks, events dropped).
- **Each tick** (`stepPreview`, after the menu): the Missile, `PREVIEW_OPTIONS` (2) Options and a
  main weapon that follows the focused row — MISSILE the basic shot (so the missile shows alone),
  DOUBLE the Double slot, LASER the Laser slot, any other row Laser and Double taking turns every
  240 ticks (4 s); the ship is held at `PREVIEW_SHIP_X` (232, right of the panel) and weaves
  (`PREVIEW_WEAVE_TICKS` 160: up, pause, down, pause) so the Free Way and the Options show; when
  the range ends (any status but `playing`) it restarts at x 0.
- **The range**: `content/stages/weapon-range.stage.json` (2,400 px at 0.75 px/tick, a
  floor and a ceiling so missiles slide and bombs burst, star parallax) with the harmless targets
  of `content/enemies/weapon-range.enemies.json` (`range-drone`, floor / ceiling `range-post`s —
  no fire, no drops, no score).
- **Drawn full screen behind the panel**, not in a smaller viewport: `updateFrame()` shows the
  preview's view (and its tick, no HUD) while the weapon select is visible — under the order
  editor too. `@shmup/shell` `scene-view` now wraps **whichever World view the frame shows** (it
  used to assume `game.world`), so opening the screen counts a new World (`worldChanges` — the shell
  clears particles and popups) and the camera for the audio follows the preview.

The title music keeps playing under the screen (the preview is silent; the game start fades it as
before).

## Assets

- Pixel maps `assets/source/sprites/shots/{bomb,two-way,torpedo,tail,vertical,free,twin}.sprite.json`
  (the 2-Way's two frames climb / dive, the torpedo's two frames flicker).
- Generator `scripts/assets/procedural/weapons.mjs` (registered as `weapons`): `shots/blast`
  (32×32, 4 frames: a hot disc opening into a ring, cooling white-yellow → red), `shots/ripple`
  (24×44, 6 frames: the ring at half heights 4 → 20), `shots/cyclone` (8×9, 4 frames: two violet
  strands twisting round a white core, one wave period per segment so it tiles) — only exactly
  rounded maths.
- `procedural/hud.mjs`: 16 `hud/meter-labels` frames and the new micro glyphs `C F V W Y 2 - space`.

## Determinism, hashing and golden replays

`hashWorld` mixes `freeWayHeading` after the autofire timers, and the cooldown table of every live
piercing shot **or blast**; the new shot fields' values (a blast's `age`, a Twin's lane in `vy`, a
Ripple's `hw` / `hh`) are pool fields and hashed with the pool. Not hashed: the role tables,
`MeterChoices` and anything in the weapon select (menus are presentation). Two Worlds on every
preset fed the same input stay in lockstep (`weapons-arsenal.test.ts`, the arsenal runtime test
on zone A).

The golden replays were **re-blessed** in the step's first commit (`06e47aa`): the new content
shifts sprite ids and enemy spec indices, and the Free Way direction is hashed — the outcomes of
the four existing scenarios are unchanged. Four new scenarios fly HALCYON BULWARK with the arsenal:
`zone-a-type-b` (Ripple, Spread Bomb), `zone-a-edit` (Twin Laser, 2-Way, Free Way — a Weapon Edit —
and LIFE OPTION), `zone-a-type-c` (Cyclone, 2-Way, Vertical, SPEED DOWN) and `zone-a-type-d` (Twin,
Photon Torpedo, Free Way, FULL BARRIER) — together every Types B–D weapon
([debug-and-replays.md](debug-and-replays.md#golden-replays-testgolden)).

## Zero allocation and the hot-path rules

The new behaviours are branches of the one `update()` / `collide()` / `applyHits()` / `sync()`
methods and write typed arrays and class fields only. The guards:

- `weapons-arsenal-alloc.test.ts` — three Worlds (Types B, C, D, full loadout) on a stage with a
  floor, slopes and walls: bombs bursting, 2-Way volleys, torpedoes sliding through kills, rings
  growing, Cyclone and Twin beams following, the main weapon switching Double ↔ Laser, the ship
  weaving (the Free Way turning), enemies respawned and armoured ones clinking — under 64 KB over
  6,000 ticks after a 12,000-tick warm-up.
- `scenes-weapon-select-alloc.test.ts` — the weapon select open through a scene flow, TYPE and
  `!` stepping (each TYPE change calls `setArsenal`), a frame composed every tick, the range
  restarting again and again — under 64 KB over 12,000 ticks after a 12,000-tick warm-up. Every
  spawn creates its enemy's behaviour coroutine (a generator per spawn, D29 — covered by the stage
  and enemy guards), so this guard flies a copy of the range **without targets**; the shipped
  range costs that small amount per target, like a stage in a game.

| Rule | Why |
|---|---|
| The Twin's lane travels in a class field (`lane`) set around `emit`, not as an argument | A fractional argument to a call V8 does not inline is boxed (the M1-10 lesson) |
| The ring test reads its centre, scale and radii from class fields (`qcx`, `qcy`, `qk`, `qb`, `qInner`) set once per queried shot | The grid visitor is called per candidate: no fractional arguments, no closures |
| `setArsenal` recompiles the existing `RoleTables` and copies into the existing `roleWeapons` | Swapping the preview's arsenal on every menu change must not allocate |
| The burst pushes its events at whole pixels (`Math.floor(x) \| 0`) | The event push is a non-inlined call |
| The preview reuses one input snapshot, one event queue, one debug-flag set and one role list | Its tick is part of the flow's tick |

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
  resolveArsenal,
  resolveGameConfig,
  withArsenal,
} from '@shmup/core';

const db = loadContent(files, { knownScripts: KNOWN_SCRIPT_IDS, extraSprites: ENGINE_SPRITES }).db;
// Type B, full loadout, FULL BARRIER on `!`:
const game = createGame(
  createHeadlessPlatform(),
  { stage: 'zone-a', loadout: 'full', weaponPreset: 'type-b', megaChoice: 'fullBarrier' },
  db,
);
game.world.weapons.roleWeapons[WeaponRole.Laser]?.id; // → 'laser.ripple'
game.world.weapons.loadouts[0].main = MainWeapon.Double; // what DOUBLE equips: the Tail Gun here
// A Weapon Edit on top of another config (throws later in createWorld if an id is wrong):
const edited = withArsenal(resolveGameConfig({ seed: 3 }), {
  weaponEdit: { missile: 'missile.torpedo', double: 'shot.free', laser: 'laser.cyclone' },
});
resolveArsenal(db, edited)[WeaponRole.Missile]?.name; // → 'PHOTON TORPEDO'
// The weapon select in a scene flow: game.scenes.weaponSelect (rows, preview, arsenal()).
```

## Extending it

| To add… | Do this |
|---|---|
| A weapon of an existing behaviour | An entry in a `content/weapons/` file (with a `name`), then reference it from a preset or pick it with EDIT; `pnpm content:check` |
| A preset (Type E …) | A `presets` entry in a weapons file; the weapon select lists it in content order (file path, then entry order) and labels it from its id |
| A weapon behaviour | Append a `ShotKind` (hashed — never renumber), `WEAPON_BEHAVIOR_KINDS` / `_PARAMS` / `_SLOTS` / `_LABELS` entries, new tunables as `RoleTables` arrays reset in `compileRoles`, its motion as a branch of `update()`, its spawning in `emit` / `fireRole` and its hit rule in `visit` / `applyHits`; a HUD label frame in `METER_LABEL_FRAMES` **and** `procedural/hud.mjs` `METER_LABELS` (same order), its sprite; extend `weapons-arsenal*.test.ts`, the arsenal runtime test and a golden scenario |
| A `!` choice | Append to `MegaChoice` / `MEGA_CHOICES` (config) and `MegaEffect` (same order), its rule in `canEquipMega` and effect in `applyMega`, a label in `MEGA_CHOICE_LABELS`; re-bless if a default changes |
| A `?` shield | Append to `ShieldChoice` / `SHIELD_CHOICES`, a spec in `SHIELD_CHOICE_SPECS` (`core/shields`), a label in `SHIELD_CHOICE_LABELS`; the weapon select and the meter pick it up — the M2-04 shields show the rest ([options-shields-hunter.md](options-shields-hunter.md#extending-it)) |
| An Option type | Append to `OptionChoice` / `OPTION_CHOICES`, `OptionMode`, a label in `OPTION_CHOICE_LABELS` and the placement in `OptionGroup.place()` ([options-shields-hunter.md](options-shields-hunter.md#extending-it)) |
| A weapon select row | A `WeaponSelectItem` code (START stays last — the screen opens on it), the widget in the constructor's menu, what it sets in `arsenal()` (and `ArsenalChoice` / `withArsenal` / `arsenalMatches` if it is a new config field); mind the 160 string slots |
| Another preview behaviour | `stepPreview()` — keep it allocation-free and silent (its own queue) |

## Tests

| Where | Covers |
|---|---|
| `packages/core/test/weapons/weapons-arsenal.test.ts` | The plan's acceptance: Types B–D as valid presets, Weapon Edit (and its errors), `setArsenal`; each behaviour's motion, caps and hit rules (the bomb's arc, burst and two blast hits, armour clinks; 2-Way volleys; the torpedo through kills; Tail Gun / Vertical pairs; the Free Way's direction; the Ripple's growth and ring hits; the Cyclone's thickness and swirl; the Twin's pairs and lanes); Options copying them; lockstep on every preset |
| `packages/core/test/weapons/weapons-arsenal-edge.test.ts` | Appended codes and tables, `checkWeaponBehaviors`, first-bad-slot errors, fallbacks, spawn geometry, all eight Free Way headings, reserved blast tables (32 exhaust them), burst events, blast frames and anchoring, clamped tunables, the ring's exact edges, caps below a pair, Twin beams on terrain, Cyclone frames, `setArsenal` resets |
| `packages/core/test/weapons/weapons-arsenal-alloc.test.ts`, `scenes/scenes-weapon-select-alloc.test.ts` | The allocation guards above (own workers) |
| `packages/core/test/config/config-arsenal*.test.ts` | Defaults and validation, the frozen edit copy, `withArsenal` (null / undefined / copies / invalid, composition with `withDifficulty`), `arsenalMatches`, replay headers with and without the M2-03 keys |
| `packages/core/test/powerups/powerups-arsenal*.test.ts` | The loadout → meter mapping for every type and a Weapon Edit; every `!` choice's effect and greyed rule (pure and in a World), only Mega Crash detonating, Auto Power-Up equipping or parking on `!`; the HUD's label frames |
| `packages/core/test/scenes/scenes-weapon-select*.test.ts` | The flow (difficulty → select → game), TYPE / EDIT / locked rows, `?` / `!` / AUTO / ORDER into the config, Back, RETRY and the next game keeping the loadout, the preview (range, held ship, weave, main weapon per row, silence, fresh per visit), content without weapons or a range, the order editor (long orders kept, all `-`), `setOrder` filtering, another difficulty |
| `packages/shell/test/scene-view/scene-view-preview.test.ts` | The scene view drawing the preview's view (the range as is, an open-space preview wrapped in the starfield), its camera followed, World counts, Back to the backdrop |
| `packages/core/test/index.test.ts` | Every runtime export of every `src/<module>/index.ts` is re-exported from the package entry (the review found `RIPPLE_RING_WIDTH` missing) |
| `test/integration/arsenal-runtime.test.ts` | The shipped content: presets named, drawn and labelled; all 64 Weapon Edits flying `test-range` with the full loadout within caps and bounds; Types B–D zone A lockstep; the weapon range harmless; the preview surviving its restart |
| `test/golden/` | The four new boss scenarios and the re-blessed four |
| `test/e2e/weapon-select.spec.ts` | Web: the select opens after the difficulty menu with the preview's ship on the right, TYPE B draws Ripple rings, START plays Type B; Tizen from `file://`: remote Back returns to the difficulty menu, the remote's arrows alone choose a Weapon Edit, NORMAL on `!` and an Auto order through the ORDER overlay, and START plays them; no console errors |

## Gotchas

| Symptom | Cause / fix |
|---|---|
| A script or spec that starts a game from the title stops on a panel | Since M2-03 the difficulty menu's OK opens the weapon select — one more OK (START is focused) starts. Four OKs from `PRESS OK` |
| `RangeError: GameConfig.weaponEdit.laser: …` from `createWorld` | The edit names a weapon the content lacks, or one of another slot — use ids from `weaponsOfSlot(content, 'laser')` |
| `weaponPreset: 'type-z'` plays Type A silently | By design: an unknown preset falls back to the content's first preset (like M1-10's default); `resolveGameConfig` only checks it is a non-empty string |
| The game's World has another loadout than `game.config` | The weapon select: the World runs `withArsenal(withDifficulty(host config, …), choice)` — read `game.world.config` |
| A Type B ring flies through a small enemy | The ring swallowed it: a target wholly inside the ring's inner edge (4 px in) is not hit — by design, the ring is the hitbox |
| A Spread Bomb vanished on an enemy without damaging it | The bomb does no damage; its blast does (2 per hit, twice). A blast on armour clinks and burns on |
| No Spread Bomb although the cap has room | All 32 hit-cooldown tables are reserved by piercing shots and bombs (only with hand-spawned shots) |
| The Free Way's second shot goes up-forward | No direction was held yet this session (`freeWayHeading` −1) |
| The Twin Laser ignores `pierce: true` in a test file | It does not — but with 20 beams per player the 32 cooldown tables run out and beams stop firing; the shipped Twin is non-piercing for that reason |
| `roleWeapons` changed under a test | The preview's `setArsenal` rewrites it in place (it is no longer frozen) — never keep a copy of a World's `roleWeapons` across a swap |
| The HUD shows `MISSILE` for a Type B ship | The content's weapon uses a behaviour without a label frame, or the atlas is older than the 16-frame `hud/meter-labels` — run `pnpm assets` |
| The preview makes no sound / never loses its ship | By design: own event queue (cleared every tick) and its own god mode |
| The weapon select allocation guard fails after adding targets to the range | Spawns create coroutines (D29) — the guard flies a copy of the range without targets |
| `RangeError: the scenes need N string slots` | The flow's UI list has 160 slots since M2-03; a new row or scene must fit |

## Next steps that build on this page

- **M2-04** (done) — the other `?` shields (front pods, Free / Rotate Shield, Reduce) joined
  `SHIELD_CHOICES` and the weapon select's `? SLOT`; the Snake / Formation / Rotate Options got
  the new OPTION row (`optionChoice`) — [options-shields-hunter.md](options-shields-hunter.md).
- **M2-05** — Direct mode's weapon families (the `weapons` module's other half) and the ship select.
- **M2-06** — two players share the session's arsenal; the P2 meter in the HUD.
- **M2-16** — the loadout and the Auto Power-Up order saved with the game options.
