# Changelog

All notable changes to Shmup Cup. The project follows [Semantic Versioning](https://semver.org/);
versions before 1.0 may change anything between minor releases. Development follows the step plan in
[`shmup_plan.md`](shmup_plan.md); progress is tracked in [`shmup_progress.md`](shmup_progress.md).

## [Unreleased] — M2: complete v1.0

### Game

- **Difficulty presets** Easy / Normal / Hard / Arcade, chosen in a **DIFFICULTY** menu under START
  (M2-01): ships 5 / 3 / 3 / 2, continues 5 / 3 / 2 / 0, death penalty Casual / Classic / Classic /
  Arcade, 16 or 32 aim directions, Easy's bullets × 0.85 — a table in
  `content/rules/difficulty.rules.json`. Each difficulty keeps its own hi-score table.
- **Rank grows** with the stage, the loop and the ship's power (Missile, Double / Laser, Options,
  shield), 0–31 and at most 16 on loop 1; enemies fire more often and faster as it rises.
  Per-enemy rank modifiers and **revenge bullets** (zone A's fan fliers from rank 12).
- **Extra ships** at 20,000 points, then every 70,000 (at most nine), with a 1UP jingle that is
  never cut off.
- **Continues**: a 10-second CONTINUE? countdown after the last ship; OK restarts at the last
  checkpoint with fresh ships and no power, and the score's last digit counts the continues.
- Behaviour change for tools and tests: `{ difficulty: 'arcade' }` now means the whole preset
  (2 lives, 0 continues, the arcade penalty); the golden replays were re-blessed.
- **Colour-blind bullet colours** (M2-02): OPTIONS → **BULLETS** — STANDARD, DEUTERANOPIA,
  PROTANOPIA or TRITANOPIA, applied at once and remembered; in the colour-blind sets the bullet
  centres are shape-coded (solid, ring, dot) so the three bullet families differ without colour.
- **Points for cancelled bullets** (M2-02): when a boss is destroyed or a Mega Crash goes off,
  every enemy bullet also leaves a gold diamond that flies up into the score — 10 points each
  (`content/rules/scoring.rules.json`). The player's own loss still only clears them.
- **Bullet patterns as data** (M2-02, for content authors): `content/patterns/` — BulletML-inspired
  actions and bullets (`fire`, `wait`, `repeat`, `changeSpeed`, `changeDirection`, `accel`,
  `vanish`, `actionRef`, `bulletRef`) with expressions over `$rank`, `$rand`, `$loop`, `$i`,
  compiled at load and run by a zero-allocation interpreter; enemies run them with the
  `pattern.loop` behaviour. **Bending lasers** (homing, circle-chain hitbox) exist in the engine.
  Neither is used by zone A yet, so it plays as before (apart from the cancel points).
- The golden replays were re-blessed again for M2-02 (new bullet state, cancel points).
- **Weapon types B–D and Weapon Edit** (M2-03): nine new weapons with original names — Spread Bomb
  (bursts into a blast that hits twice), 2-Way Missile, Photon Torpedo (flies on through what it
  destroys), Tail Gun, Vertical, Free Way (its second shot follows the last direction you moved),
  Ripple Laser (growing rings that hit with their edge), Cyclone Laser, Twin Laser — as presets
  **Type B**, **C** and **D** next to the classic Type A, or mixed freely with **EDIT**. The power
  meter's boxes are named after the chosen weapons.
- **`!` and `?` choices** (M2-03): the `!` box can be the Mega Crash, NORMAL (back to the basic
  gun), SPEED DOWN, LIFE OPTION (spare ships become Options) or FULL BARRIER (a fresh Force Field);
  `?` gives the Force Field (more shields came with M2-04).
- **WEAPON SELECT** screen after the DIFFICULTY menu (M2-03) — one more OK to start a game (START is
  highlighted): the type, the three slot weapons under EDIT, `?`, `!`, Auto Power-Up and its
  **order** (an AUTO ORDER box), with a **live preview** of the choice flying over a practice range
  behind the panel. The choice lasts for the session.
- Behaviour change for tools and tests (M2-03): `GameConfig` has `weaponPreset`, `weaponEdit`,
  `megaChoice` and `shieldChoice` (replay headers record them; older headers decode to the
  defaults); the golden replays were re-blessed (the new content shifts sprite ids, the Free Way
  direction is hashed — same outcomes) and four boss runs with the new weapons were added.
- **Option types** (M2-04): a new **OPTION** line on the WEAPON SELECT screen — TRAIL (as before),
  **SNAKE** (a chain that swings out behind the ship and keeps its shape when it stops),
  **FORMATION** (a `>` behind the ship that spreads into a `V`) and **ROTATE** (orbiting the
  ship). FORMATION and ROTATE spread out with **Ch ▲** on the remote (V / gamepad Y) or while
  PowerUp (OK) is held for a quarter of a second; a quick OK never moves them.
- **More shields** on `?` (M2-04): **SHIELD** (two pods at the nose), **FREE SHIELD** (a pair of
  pods where you last moved — `?` again adds a second pair), **ROTATE** (two circling pods) — each
  pod stops the bullets and enemies that touch it, 14 hits, wearing on its own — and **REDUCE**
  (the ship's hit spot shrinks to a third, two hits; the rock still counts). FULL BARRIER restores
  whichever shield you chose.
- **Option Hunter** (M2-04): an armoured enemy that arrives with an alarm only while you have
  Options, lines up and charges through them, and carries off the ones it touches; a Mega Crash —
  or the new rare **blue capsule**, which destroys every enemy on screen — frees them to be caught
  again. They appear in the browser's `?stage=hunter-range` for now; AZURE VERGE is unchanged.
- Behaviour change for tools and tests (M2-04): `GameConfig.optionChoice`, the grown
  `shieldChoice` and `WeaponSelectItem` codes (`Option` 4, so `?` … START are 5–9); the golden
  replays were re-blessed (new hashed state, shifted enemy spec indices — same outcomes) and four
  runs covering every Option type and shield were added.
- **The second ship, the MANTA, and Direct mode** (M2-05): a **SHIP SELECT** box after the
  DIFFICULTY menu — the KESTREL (power meter, then the WEAPON SELECT screen) or the MANTA (the game
  starts at once). The MANTA has no meter: enemies that leave capsules leave **colour items**
  instead, in an order set per stage — **red** and **green** raise the main gun and the sub-weapon
  through nine levels (missiles → discs, or lasers → piercing waves; the sub-weapon from an arcing
  bomb to piercing discs), **blue** gives the **Arm** (green 3, silver 4, gold 5 hits after 1, 4, 9
  blue items — it also stops the rock), **orange** an extra ship, **yellow** a smart bomb, and the
  red **octagon** switches the main gun's style. Items drift across the screen and vanish after
  ten seconds. **Ch ▼** (Left Shift, LB / RB) switches the MANTA's three speeds; OK does nothing in
  its games. The HUD shows its levels as pips; a loss costs the Arm (and a level on Classic, all
  power on Arcade). The MANTA keeps its own hi-score tables. In a browser `?stage=direct-range`
  sends six-cube pincer waves; AZURE VERGE's enemies are unchanged (its capsules become items).
- Behaviour change for tools and tests (M2-05): `GameConfig.shipId` (default `kestrel`) and
  `powerUpMode: 'direct'` (replay headers record them; older headers decode to the KESTREL),
  `DropKind.FreeOption` is 4 (`PowerUp` took 3), the `liveCounts` stride is `WEAPON_ROLE_SLOTS`
  (36), every flow that starts a game presses one more OK (the ship select); the golden replays
  were re-blessed (new hashed state and content — same outcomes) and three MANTA runs were added.
- **Two players at once** (M2-06): the title menu is now **1 PLAYER** (what START was) /
  **2 PLAYERS** / OPTIONS / EXIT. In a 2 PLAYERS game player 1 starts and a second player **joins
  any time** with START on a gamepad (on the TV a USB or Bluetooth pad; in a browser also Enter on
  the new **SPLIT KEYBOARD** control profile — WASD + F / G for player 1, arrows + K / L for player
  2). Player 2 flies the same ship in red-orange and gold. Each player has their own ships, score,
  extra ships, power-ups (items go to whoever touches them first), shields and **continues**: a
  player who loses their last ship comes back with START while the other plays on, and the game
  is over only when both are out — the CONTINUE? countdown then continues whoever presses OK.
  While both play, enemies leave an extra capsule every second time, the bottom bar splits into two
  halves, and GAME OVER / STAGE CLEAR show both scores. A short chirp plays when a player joins.
- Behaviour change (M2-06): in the menus and in one-player games **every gamepad** controls player
  1 (before, the second gamepad was always player 2); in a 2 PLAYERS game a gamepad becomes player
  2's with its first START or A.
- Behaviour change for tools and tests (M2-06): `GameConfig.coop` and `coopExtra` (replay headers
  record them; older headers decode to a one-player game); `TitleItem` is `Start 0`, `TwoPlayers 1`,
  `Options 2`, `Exit 3` (a flow walking to OPTIONS presses Down once more); `continueWorld(world,
  who)` takes a player mask and continues are per player (`continuesLeft`); `HUD_STRING_COUNT` 22,
  `HUD_COMMAND_COUNT` 96; input adapters may implement `setSeats` (`Game.inputSeats`); the golden
  replays were re-blessed (the hashed co-op credit and the `@p2` sprite names — same outcomes) and
  two co-op runs were added.
- **Stage mechanics for the later zones** (M2-07, in the browser's `?stage=gimmick-range` for now —
  AZURE VERGE is unchanged): **bricks** you shoot through (each takes a few hits and scores),
  pink **walls that grow back** a few seconds after breaking — never onto a ship —, **rocks** that
  drop when you come near and shatter, **bubbles** that split in two when shot, a **volcano**
  lobbing glowing stones, a **suction pod** that pulls ships towards it, **tentacles** on a chain
  that lunge and tug, a **cube rush** whose cubes stick to the rock and build walls, **moving
  blocks** as solid as the rock, a timed **stop** with the view panning down, a **diagonal** pan,
  a **fork** chosen by flying through a region, and a 4× **fast stretch**. A checkpoint restart
  (ARCADE losses, continues) puts every broken brick back and removes stacked cubes.
- For content authors (M2-07): tiles may be destructible (`hp`, `regen`, `score`), camera keys
  `hold` and `yOver`, stages `branches`, any event a `branch`, new `trigger` and `block` events and
  the `ballistic` enemy mover ([`content/stages/README.md`](content/stages/README.md)); **`pnpm
  content:tiled <map.tmj>`** converts a map drawn in Tiled into stage JSON.
- Behaviour change for tools and tests (M2-07): `STAGE_STATE_SLOTS` is 28, `StageEventCode` has
  `Trigger 8` / `Block 9`, `MoverKind.Ballistic` 9, `ENGINE_SPRITES` gained `gimmicks/chain-link`
  (later sprite ids shift), `createTerrainView` takes an optional change log; the golden replays
  were re-blessed (new hashed state — zone A's simulation unchanged) and three `gimmick-range` runs
  were added.
- **Picture options** (M2-08): OPTIONS gained **SCALE** (INTEGER — the sharp, letterboxed default —,
  FIT or STRETCH), **SHAKE** (on / off), **FLASHES** (NORMAL / REDUCED: at most one dim flash a
  second) and **HITBOX** (a white-and-pink marker on each ship's weak spot); they apply at once and
  are remembered. The **Mega Crash** flash now brightens the picture (additive) instead of covering
  it. On monitors faster than 60 Hz the world is drawn between ticks for smoother motion; the TV is
  unchanged.
- **SNES-style picture effects** (M2-08, in the browser's `?stage=raster-range` for now — AZURE
  VERGE is unchanged): per-scanline **raster effects** — wavy water, heat haze, a pseudo-3D
  line-band floor — and **palette cycling** (a sea whose colours roll), drawn by one WebGL1 filter
  per background layer only while an effect is on screen.
- For content authors (M2-08): stages may list `raster` effects (`wave`, `haze`, `lines` with
  optional `bands`) and palette `cycles` (exact `#rrggbb` ramps, ≤ 8 colours per layer) —
  [`content/stages/README.md`](content/stages/README.md#raster-effects-and-palette-cycles-m2-08).
- Behaviour change for tools and tests (M2-08): `OptionsItem.Back` is 9 (SCALE, SHAKE, FLASHES and
  HITBOX sit between BULLETS and BACK); `UserOptionKind` gained `ScaleMode 5` … `ShowHitbox 8`;
  `UserOptions.display` has four more fields (save format 1, no migration); `WorldView` may carry
  `effects` and `hitboxes`; `window.__shmupDebug.renderer`; the golden replays were re-blessed (two
  new content sprites shift the sprite ids — the simulation is unchanged) and a `raster-range` run
  was added.
- **Boss HP bar** (M2-09): OPTIONS → **BOSS HP** (off by default) shows `BOSS` and a red bar of the
  boss's remaining strength — its cores and the parts protecting them — in the top bar during boss
  fights, in place of `HI`; on the TV too (HALCYON BULWARK).
- **Advanced bosses** (M2-09, in the browser's test stages for now — AZURE VERGE is unchanged):
  **mid-bosses** that fight while the screen keeps scrolling (`?stage=captain-range`: a rammer, a
  bubble launcher, a circler, a ring-firing crab); **IRON LEVIATHAN**, a battleship longer than the
  screen that the view flies around while its turrets turn to aim, with **LEVIATHAN HEART** inside
  it and a **90-second time limit** after which it escapes (`?stage=raid-range`); the **EMBER AND
  FROST TWINS**, who take turns while the other rests behind, the survivor getting angry
  (`?stage=twin-range`); and a **boss rush** (`?stage=gauntlet-range`).
- For content authors (M2-09): boss sections may give `role: "captain"`, `timeLimit`, `raid`
  (boss-relative camera segments), `partner` / `alternate` / `enrage`, `inner` and `minion`; parts
  `radius` (circle hurtboxes), `angle`, `spin` and `turn` (heading frames); stages `type:
  "bossRush"` with a `rush` list —
  [`content/enemies/README.md`](content/enemies/README.md#advanced-bosses-m2-09),
  [`content/stages/README.md`](content/stages/README.md).
- Behaviour change for tools and tests (M2-09): the boss system has four slots (`bosses.slots`;
  `damagePart` / `isArmoured` take the part slot = slot × 16 + index), `MAX_HIT_TARGETS` is 128 and
  the part cooldown tables have 64 part slots; `BossState.Escape` 6, `SimEventKind.BossEscaped` 14,
  `World.endingFlags`, `StageRunner.follow`; `createBossSystem` takes the stage; `OptionsItem.BossHp`
  9 and `Back` 10, `UserOptionKind.BossHpBar` 9, `UserOptions.display.bossHpBar` (save format 1, no
  migration); `HUD_STRING_COUNT` 23, `HUD_COMMAND_COUNT` 100; the golden replays were re-blessed
  (the hash layout and content ids changed — every input, tick count and outcome is unchanged) and
  four advanced-boss runs were added.
- **The zone map** (M2-10): a game is now a **run** across a branching map of nine zones — AZURE
  VERGE, then B or C, D or E, F or G and one of two final zones, H or I (five zones per run, 16
  routes). Each zone opens with a **title card** during the fly-in; after its boss the ships **fly
  out** to the right, the **zone result** pays a kill bonus (100 points per percent of the zone's
  enemies shot down) and a **time bonus** (100 points per second the boss fight stayed under 90
  s), and the **ZONE MAP** lets you choose the next zone with ▲ / ▼ and OK (Back asks "quit to
  title?"); score, ships, power-ups and shield carry over. The final zone leads to a placeholder
  **ending** chosen by the route and the run (no ship lost, a boss that escaped). Zones B–I are
  short **stand-ins** for now (zone A's enemies, known bosses) so every route can be finished. A
  run's score is saved when it ends (game over or the ending). RETRY STAGE restarts the current
  zone with what you entered it with.
- **Hidden bonus stages** (M2-10, in the browser's `?stage=bonus-range` for now): three kinds of
  secret entrance — fly into a marked gap, destroy every ground target of a stretch, have a given
  score digit — lead into a bonus stage of **1,000-point capsules** and a **1UP**; clearing it
  would skip the zone's boss, and losing a ship there sends you back and locks the entrances.
- For content authors (M2-10): the new content kind **`campaign`**
  ([`content/campaign/README.md`](content/campaign/README.md): zones, edges, endings with run-flag
  conditions — the loader checks that every route reaches a final zone); stages `type: "bonus"`
  and the `bonus` event (`gap` / `ground` / `digit` entrances), the drops `oneUp` and
  `bonusCapsule` ([`content/stages/README.md`](content/stages/README.md)).
- Behaviour change for tools and tests (M2-10): a game on the campaign's start zone (zone A) is a
  campaign run — the stage-clear screen becomes the zone tally and leads to the map; any other
  stage keeps the single-stage flow. `PlayerState` gained `leaving` (the fly-out, from the tick after
  `stageClear`); `DropKind.FreeOption` is 6 (`OneUp` 4, `BonusCapsule` 5), `ItemKind` gained
  `OneUp` 9 / `BonusCapsule` 10, `StageEventCode.Bonus` 10, `SimEventKind.PrepareStage` 15
  (`@shmup/shell` `connectStagePreparation`); `EnemySystem.stats`, `World.bonus`; the scene flow's
  UI list has 384 commands / 224 string slots; the golden replays were re-blessed (the hash layout,
  two new engine sprites and a new enemies file shift ids — zone A's inputs, tick counts and
  outcomes are unchanged; three boss-range runs were re-recorded with the improved playtest bot)
  and three bonus-stage runs were added.
- **Zone B, BRINE NEBULA** (M2-11) replaces its stand-in: about 3½ minutes of bubbles that burst
  into smaller bubbles or free the fish inside them, jellyfish firing rings, spiny urchins in a reef
  tunnel, a riptide and a wobbling, colour-shifting sea; the mid-boss **SPUME HERALD** fights while
  the screen scrolls on (and leaves after 30 seconds); the boss **GALVANIC MAW** is a mechanical fish
  whose mouth can only be hit while open, with jaws that open apart, needle fans, rings and homing
  rockets you can shoot down. Its own stage and boss music.
- **Zone B's secret bonus stage, PEARL GROTTO** (M2-11): fly into the gap between two reef blocks at
  the top of the screen (about 2:10 into the zone) — 1,000-point capsules, an extra ship, two brick
  walls; clearing it clears the zone (the boss is skipped). Works on every device.
- **Zone C, DUNE EXPANSE** (M2-11) replaces its stand-in: about 4 minutes of sand worms bursting out
  of the dunes, beetles walking on the canyon ceiling, dust devils, sand geysers throwing clods, heat
  haze and a sandstorm run; the boss **SANDGRAVE WIDOW** is a giant spider — shoot its two fangs,
  then its head — sending spider drones and, once angry, blinking silk-line lasers. Its own music.
- For content authors (M2-11): the behaviours `rocket.homing` (homing rockets as shootable enemies),
  `worm.burst` (a formation is one sand worm), `boss.maw` and `boss.widow`; the zone patterns
  `brine.jelly-ring` and `dune.whirl`; the tilesets `terrain-reef` / `terrain-dune`; stage-scoped
  songs for zones B and C ([`content/stages/README.md`](content/stages/README.md),
  [`content/enemies/README.md`](content/enemies/README.md)).
- Behaviour change for tools and tests (M2-11): `BossPart` gained `restX` / `restY` (the boss data's
  offsets — `boss.maw` places its jaws from them); the playtest harness times the stage's main
  encounter, never a captain; the recovery rule lives in `test/playtest/recovery.ts`. The golden
  replays were re-blessed (the new sprites and scripts shift ids — inputs, tick counts and outcomes
  unchanged) and five zone B / C runs were added. The Tizen `app.js` is 307.5 KB gzip of its
  350 KB budget.
- **Zone D, MAGMA DEEP** (M2-12) replaces its stand-in: about 3½ minutes over erupting volcanoes
  throwing lava bombs, then a **dive** — the scrolling stops and the view sinks down into the caves
  — with rocks dropping from the roof, a **maze of brick walls** (a gap in each, or shoot your way
  through), a lava river over a colour-rolling lake of lava; the boss **CINDER BASTION** is a
  battleship whose core hides behind turning shield arms, with lane lasers from two emitters. Its
  own stage and boss music.
- **Zone E, TEMPEST RIDGE** (M2-12) replaces its stand-in: about 4 minutes in a storm over jagged
  mountains — rolling clouds, slanting rain —, kites and jets that come **from behind** and overtake
  the ship, thunderheads firing needle streaks and a gale run; the boss **SQUALL STEED** is a
  seahorse whose chest can only be hit while open, sending out little homing seahorses. Its own
  music.
- For content authors (M2-12): the behaviours `rear.swoop` (a rear attacker: in from behind along
  its row, one shot back, away), `boss.bastion` (rotating shield arms as boss parts on a spinning
  hub, attached lane lasers) and `boss.steed` (a bob, a `whenOpen` chest launching minis); taller
  maps with a dive (`tilemap.rowsTall`, a `hold` key with a `yTo` pan), destructible walls as `rle`
  rows, spawns behind the view (a negative `screenX`), rear-entry paths; the pattern `tempest.bolt`;
  the tilesets `terrain-magma` / `terrain-ridge`; songs for zones D and E
  ([`content/stages/README.md`](content/stages/README.md),
  [`content/enemies/README.md`](content/enemies/README.md)).
- Behaviour change for tools and tests (M2-12): the content test's zones block covers B–E (new types
  counted against every zone a run can have flown before, ground enemies checked at the camera
  height their event fires at, a lane limit per boss); the stage-runtime corridor check measures the
  rows the camera shows; `playGolden` takes an optional per-tick observer. The golden replays were
  re-blessed (new sprites and scripts shift ids — inputs, tick counts and outcomes unchanged) and
  five zone D / E runs were added (38 in all). The Tizen `app.js` is 313.5 KB gzip of its 350 KB
  budget.

### Documentation

- New developer guides [`docs/dev/difficulty-and-rank.md`](docs/dev/difficulty-and-rank.md),
  [`docs/dev/pattern-dsl.md`](docs/dev/pattern-dsl.md) and
  [`docs/dev/meter-arsenal.md`](docs/dev/meter-arsenal.md); the pattern format for authors in
  [`content/patterns/README.md`](content/patterns/README.md); the tester guide's
  [difficulty, extra ships and continues](docs/client/preview-build.md#difficulty-extra-ships-and-continues)
  and [Options screen](docs/client/preview-build.md#the-options-screen) (BULLETS), and
  [Choosing your weapons](docs/client/preview-build.md#choosing-your-weapons) (the WEAPON SELECT
  screen, M2-03; the Option types and shields, M2-04) and
  [The Option Hunter range](docs/client/preview-build.md#the-option-hunter-range-browser-only)
  (M2-04); the developer guide
  [`docs/dev/options-shields-hunter.md`](docs/dev/options-shields-hunter.md) (M2-04); the
  developer guide [`docs/dev/direct-mode.md`](docs/dev/direct-mode.md) and the tester guide's
  [Choosing your ship](docs/client/preview-build.md#choosing-your-ship),
  [The MANTA](docs/client/preview-build.md#the-manta-colour-items-weapons-and-the-arm) and
  [The Direct range](docs/client/preview-build.md#the-direct-range-browser-only) (M2-05); the
  developer guide [`docs/dev/coop.md`](docs/dev/coop.md), the tester guide's
  [Two players](docs/client/preview-build.md#two-players) and the controls page's
  [Two players](docs/client/controls.md#two-players) (M2-06); the developer guide
  [`docs/dev/advanced-stages.md`](docs/dev/advanced-stages.md) and the tester guide's
  [The Gimmick range](docs/client/preview-build.md#the-gimmick-range-browser-only) (M2-07); the
  developer guide [`docs/dev/presentation-polish.md`](docs/dev/presentation-polish.md), the tester
  guide's [Options screen](docs/client/preview-build.md#the-options-screen) (SCALE, SHAKE, FLASHES,
  HITBOX) and [The Raster range](docs/client/preview-build.md#the-raster-range-browser-only)
  (M2-08); the developer guide [`docs/dev/advanced-bosses.md`](docs/dev/advanced-bosses.md) and the
  tester guide's
  [The advanced boss ranges](docs/client/preview-build.md#the-advanced-boss-ranges-browser-only)
  and [The boss HP bar](docs/client/preview-build.md#the-boss-hp-bar-every-device) (M2-09); the
  developer guide [`docs/dev/campaign-and-bonus-stages.md`](docs/dev/campaign-and-bonus-stages.md),
  the map format for authors in [`content/campaign/README.md`](content/campaign/README.md), and the
  tester guide's [The zone map](docs/client/preview-build.md#the-zone-map-a-run-through-nine-zones)
  and [Hidden bonus stages](docs/client/preview-build.md#hidden-bonus-stages)
  (M2-10); the developer guide [`docs/dev/zones-b-and-c.md`](docs/dev/zones-b-and-c.md) and the
  tester guide's [Zone B: BRINE NEBULA](docs/client/preview-build.md#zone-b-brine-nebula) (with
  the secret bonus stage PEARL GROTTO) and
  [Zone C: DUNE EXPANSE](docs/client/preview-build.md#zone-c-dune-expanse) (M2-11); the developer
  guide [`docs/dev/zones-d-and-e.md`](docs/dev/zones-d-and-e.md) and the tester guide's
  [Zone D: MAGMA DEEP](docs/client/preview-build.md#zone-d-magma-deep) and
  [Zone E: TEMPEST RIDGE](docs/client/preview-build.md#zone-e-tempest-ridge) (M2-12).

## [0.1.0] — M1: playable vertical slice

The first milestone (plan steps M1-01 … M1-19): one complete zone with its boss, playable from
start to stage clear with the Samsung remote alone, in the browser dev app and as a Tizen 5.5
widget bundle (`pnpm --filter @shmup/tizen build` → a checked `dist/` ready to package).

### Game

- **Zone A — AZURE VERGE**: about three minutes of scrolling in five sections (open space, fan
  formations, floor and ceiling terrain with turrets, walkers and hatches, orbiters) ending with the
  WARNING and the multi-part boss **HALCYON BULWARK** (code HB-01, three phases).
- **KESTREL**, the meter ship: six speed levels, normalized diagonals, fly-in and respawn, Type A
  arsenal (shot, Double, Laser, Missile) with always-on autofire, up to four trailing Options.
- The seven-slot **power meter** (Speed, Missile, Double, Laser, Option, `?` Force Field,
  `!` Mega Crash), capsule carriers and formation bonuses, optional Auto Power-Up, pickup magnet.
- Enemy bullets on 32 aim directions tuned for 4-way dodging, telegraphed lasers, bullet cancel on
  death; death penalties Classic (default), Arcade and Casual; lives, score and hi-score.
- Game feel: hit flash, hit-stop on big events, screen shake, flash limiter, particles, score
  popups; procedural placeholder SFX and chip-tune music with sample-exact loops.
- Scene flow: title, game, pause, stage clear, game over, exit confirmation on the TV, an Options
  screen (volumes, controls profile); saves (`save.v1`) with hi-score tables and migrations.
- Remote-first input: data-driven key profiles (`tizen-remote-safe` default, release debounce,
  diagonal and SOCD policies), separate game / menu binding tables, gamepad and keyboard support.

### Engine and tooling

- `@shmup/core`: deterministic simulation (seeded RNG streams, trig tables, fixed 9-phase tick,
  struct-of-arrays pools, zero allocations per tick), validated JSON content, scene stack, HUD and
  canvas UI kit, state hashing.
- `@shmup/render-pixi` (PixiJS 8, WebGL1 first, 384×216 integer-scaled), `@shmup/audio-web`
  (Web Audio engine and synth), `@shmup/input-web`, `@shmup/shell` (the shared browser host).
- Placeholder art as code: pixel-map sources and procedural generators packed into a ≤ 2048²
  atlas by `pnpm assets`; content and the atlas manifest inlined into the single classic ES2018
  IIFE the TV runs.
- M1-19 — **debug tools** in dev / test builds (`__SHMUP_DEV__`): god mode, stage skip to the boss,
  jump to the next checkpoint, frame advance and single steps, slow motion 2× / 4×, hitbox and grid
  outlines and an overlay (FPS, tick / render ms, draw calls, pool usage, rank, RNG calls, state
  hash, WebGL version, boot ms, frame graph) — F1–F8 on the web, unlocked on the TV by the remote
  sequence Pause, Ch+, Ch+, Ch+ (then 1–8); `window.__shmupDebug` for tests.
- M1-19 — **replays** (`core/replay`): per-tick `held | pressed << 16` input per player,
  run-length and base64 encoded, a header with every sim-affecting option, a state hash every 600
  ticks, playback with desync detection; **golden replays** of zone A (`test/golden/`) checked by
  `pnpm test` and re-blessed with `pnpm golden:update`.
- M1-19 — **budgets**: `pnpm bench` (20,000 stress ticks — median < 1.0 ms/tick, heap growth
  < 512 KB, run in CI) and the Tizen bundle check (`app.js` ≤ 350 KB gzipped, atlas pages
  ≤ 2048², `dist/` ≤ 8 MB); an e2e gameplay smoke on both builds.
- Versions: `0.1.0` in every package manifest and in the widget's `config.xml`.

### Documentation

- Testers: [`docs/client/preview-build.md`](docs/client/preview-build.md) (the build, checks per
  feature), [`docs/client/debug-tools.md`](docs/client/debug-tools.md) (the debug build, the
  developer tools and the **M1 release check** for the monitors),
  [`docs/client/controls.md`](docs/client/controls.md),
  [`docs/client/install-on-tv.md`](docs/client/install-on-tv.md).
- Contributors: [`docs/dev/`](docs/dev/README.md) — one guide per system, including
  [`debug-and-replays.md`](docs/dev/debug-and-replays.md) for the M1-19 tooling, and the
  [API reference](docs/dev/api-reference.md).

[Unreleased]: https://github.com/detain/shmup-cup/commits/master
[0.1.0]: https://github.com/detain/shmup-cup/tree/master
