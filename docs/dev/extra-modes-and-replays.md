# Extra modes, replays and assists (plan M3-01)

How plan step **M3-01** added the game's replayability extras. The title gained **EXTRA**, a menu
with three new modes — **BOSS RUSH** (every zone's boss in a row), **CARAVAN** (one zone against a
three-minute clock) and **ARCADE** (the campaign looping on, each loop harder: remixed layouts,
faster bullets, revenge bullets from every kill) — and **REPLAYS**, a browser of whole-run replays
with playback at ×1 / ×2 / ×4, KEEP, SHARE and DELETE. The step also adds the **Extra Edit**
weapons (seven new weapons behind an unlock), four original **secret input codes**, a
**score-milking cap**, the **game-speed** and **invincibility** assists (flagged in hi-score rows
and replay headers), **option recovery** after a death and gamepad **rumble**.

This page is the *how and why* and the map of the step's code and content. Exact signatures are in
[api-reference.md](api-reference.md) (`config`, `data`, `world`, `player`, `stage`, `enemies`,
`bullets`, `rank`, `weapons`, `powerups`, `scoring`, `debug`, `game`, `ui`, `scenes`, `save`,
`replay`, `@shmup/input-web`'s `gamepad` / `web-input`, `@shmup/shell`'s `boot` / `dispatch`, the
apps); the TSDoc of `packages/core/src/replay/run.ts`, `packages/core/src/scenes/{index,run,
replays}.ts` and the modules above is the authoritative reference. What players and testers see is
in [`../client/extra-modes-and-replays.md`](../client/extra-modes-and-replays.md). The M1-19
single-World replays this builds on are [debug-and-replays.md](debug-and-replays.md#replays-corereplay);
the campaign run and its carried state [campaign-and-bonus-stages.md](campaign-and-bonus-stages.md);
the boss rush machinery [advanced-bosses.md](advanced-bosses.md); the rank and revenge bullets
[difficulty-and-rank.md](difficulty-and-rank.md); the weapon select and Weapon Edit
[meter-arsenal.md](meter-arsenal.md); the save and the Options pages
[saves-and-options.md](saves-and-options.md) and
[options-rebinding-and-accessibility.md](options-rebinding-and-accessibility.md); the web / Tizen
storage adapter [platform-polish.md](platform-polish.md).

Background: `shmup_feat.md` §16 (boss rush, score attack / caravan, Loop 2 / Arcade mode), §7A
(Extra Edit as an unlock), §15 (loops, score-milking guards, "secret code for more" lives), §21
(save / share replays, replay browser, fast-forward; the game-speed and invincibility assists —
"both flag scores/replays as assisted"; unlocks), §8 (option recovery after death), §4 (secrets,
rumble via `vibrationActuator`); plan §1.5 (sim-affecting options live in `GameConfig`, golden
replays re-blessed on purpose).

## The picture at a glance

```text
 TITLE ─ EXTRA (TitleItem.Extra 5) ─► ExtraScene (overlay)
   BOSS RUSH ─────────┐                                  RunState.begin(null, 'boss-rush', 'bossRush')
   CARAVAN ◄► zone ───┼─► DIFFICULTY ─► SHIP ─► WEAPON ─► RunState.beginZone(campaign, z, 'caravan',
   ARCADE  ◄► LOOP 1/2┘   (one player)                     CARAVAN_TICKS)
   REPLAYS ─► ReplaysScene ─► PLAY ─► ReplayScene          RunState.begin(campaign, …, 'arcade', loop)
                           ─► KEEP / SHARE / DELETE
                                                          every World the run plays:
 SceneFlow ──────────────────────────────────────────►    config.loop / timeLimit / invincible /
   recorder: RunRecorder ─ segment per World                optionRecovery  (core/config)
     beginSegment(world, previous, start, carry, …)       createWorld ─ stageForLoop (the remix)
     record(input) / check(world) every game tick           rank loop term, faster bullets,
     action(RunAction.Continue | FullPower | SelfDestruct)  revenge from every kill, the clock
     seal(world) before the zone tally
     finishRun(world, meta) ─► RunReplay ─► ReplayLibrary.storeLast (slot 0 = the last game)
                                             ├ keep(slot)        → slots 1–3
 host (@shmup/shell)                         ├ exportText(slot) → shareReplay (web: clipboard)
   createReplayLibrary(platform.storage)     ├ importText(text) ← the web page's paste
   await load() before the title             └ remove(slot)
   connectRumbleEvents ─► WebInput.rumble ─► rumblePad (vibrationActuator 'dual-rumble')
```

## The EXTRA menu (`core/scenes` `ExtraScene`)

The title's mode select gained **EXTRA** between SOUND TEST and EXIT: `TitleItem.Extra` is 5 and
`TitleItem.Exit` moved to 6 (navigate by the constants in tests). EXTRA pushes the `ExtraScene`,
an overlay over the title (dim `PAUSE_DIM`, an opaque panel) with the rows of `ExtraItem`:

| Row | Choice (Left / Right) | OK | Disabled when |
|---|---|---|---|
| **BOSS RUSH** (0) | — | `nextMode = 'bossRush'` → the difficulty menu | the content has no `BOSS_RUSH_STAGE` (`'boss-rush'`) |
| **CARAVAN** (1) | the campaign's zones (`A AZURE VERGE` …, starting on the campaign's start zone) | `nextMode = 'caravan'`, `caravanZone` → the difficulty menu | no campaign |
| **ARCADE** (2) | `LOOP 1`, `LOOP 2` (skipped back to LOOP 1 until `save.unlocked('loop2')`) | `nextMode = 'arcade'`, `arcadeLoop` → the difficulty menu | no campaign |
| **REPLAYS** (3) | — | pushes the `ReplaysScene` | the host passed no replay library (`SceneFlowHost.replays`) |
| **BACK** (4) | — | pops back to the title | — |

OK on a choice row **starts the mode** — the generic `menuTick` would step the choice on OK, so the
scene notices an activating press, restores the choice's index and treats the result as
`Confirmed`. The three modes go through the usual difficulty menu, ship select and weapon select
(`choosePlayers(false)` — one player), and `SceneFlow.beginRun` reads `nextMode` to begin the run
(`SceneFlow.chooseMode(mode, zone?, loop?)` sets the same fields for tests); 1 PLAYER and 2
PLAYERS on the title reset `nextMode` to `'normal'`. Each mode keeps its own hi-score tables:
`core/save` `HI_SCORE_MODES` gained `bossrush`, `caravan` and `arcade` (the flow's `tableMode`), so
`MAX_HI_SCORE_TABLES` went 32 → 64 (two ships × four difficulties × six modes = 48 tables).

`RunState` (`core/scenes` `run.ts`) carries the run's kind: `mode` (`RunMode`: `'normal'`,
`'bossRush'`, `'caravan'`, `'arcade'` — `RUN_MODES`), `loop`, `timeLimit` and `assists`;
`begin(campaign, stage, mode?, loop?, timeLimit?)` and the new `beginZone(campaign, zone, mode,
timeLimit)` set them, and `runWorldConfig` writes `loop` and `timeLimit` into every World's config.

## BOSS RUSH (content `boss-rush.stage.json`)

The boss rush is shipped content, not code: `content/stages/boss-rush.stage.json` is a `bossRush`
stage (the M2-09 rush machinery — [advanced-bosses.md](advanced-bosses.md#boss-rushes))
listing the nine zone bosses A–I in turn. The run is a single-stage run (`campaign` `null`), so its
clear is the single-stage STAGE CLEAR (`ClearNext.Continued`, the run recorded into the `bossrush`
table). `test/playtest/boss-rush.test.ts` has the 4-way bot clear it with god mode and the full
loadout (≈ 5.8 minutes).

## CARAVAN — the clock (`GameConfig.timeLimit`, `core/world`)

A caravan is one campaign zone from its start against `CARAVAN_TICKS` (180 × 60 — three minutes).
`GameConfig.timeLimit` (0 = none, at most `MAX_TIME_LIMIT` 216,000 ticks — an hour) becomes
`World.timeLeft` at creation (-1 without a limit). `updateClock`, part of phase 9 in a World with a
limit:

- while the status is `playing` or `bossWarning` the clock counts down — hit-stop ticks too (it is
  the player's time); at 0 the World ends: status `stageClear`, `World.timeUp`, every enemy bullet
  cancelled (`CancelMode.Sparkle`), the stage-clear jingle queued; the ships then fly out like after
  a boss;
- a stage cleared another way with time left pays `CARAVAN_TIME_BONUS` (1,000) points per **whole**
  second left to every player in play, once (`World.clockPaid`), then checks the extends.

The stage-clear card says **TIME UP** instead of the zone's clear (`flow.text.timeUp`); a caravan
run records into its table and returns to the title (no map, no bonus stages — `beginZone` runs one
zone). The HUD shows `TIME` and the whole seconds (`core/ui` `hudClockSeconds`: `ceil(timeLeft /
60)`) in player 2's place, red for the last ten; `Hud.update` rebuilds when the whole second
changes. `hashWorld` mixes `timeLeft`, `timeUp` and `clockPaid` **only when a limit is set**, so
every World of M1–M2 hashes as it did.

## ARCADE — loops (`GameConfig.loop`)

`GameConfig.loop` (1–`MAX_LOOP` 8, default 1) is the loop a World plays. From loop 2:

| What | Where |
|---|---|
| The rank's loop term counts: `8 × (loop − 1)`, the loop-1 cap of 16 lifted (the golden `zone-a-loop2-god` starts at rank 10) | `core/rank` `createRankInputs(config)` reads `config.loop` (M2-01 already had the term) |
| Enemy bullets fly faster: × `1 + LOOP_BULLET_SPEED_STEP (0.15) × (loop − 1)`, at most `LOOP_BULLET_SPEED_MAX` 1.6, on top of the rank's curve and the preset's `bulletSpeedMul` | `core/rank` `loopBulletSpeedScale`, applied once in the bullet system's `speedMul` |
| Every enemy a player shoots down fires a revenge bullet at any rank — its own `revenge` pattern, else one aimed shot at `DEFAULT_REVENGE_SPEED` (never during a Mega Crash) | `core/enemies` (`EnemyHost.config.loop` → `loopRevenge`) |
| The stage plays its **remix** | `core/data` `stageForLoop`, `core/stage` |

**Remixed layouts are data.** A stage's optional `remix` list (`StageSpec.remix`, at most
`MAX_STAGE_REMIX` 64) holds extra `spawn` / `formation` events — sorted by `x`, inside the stage,
no `branch` (`checkStageRemix` reports each rule's breach). `stageForLoop(stage, loop)` returns the
stage itself on loop 1 (or without a remix) and otherwise a frozen copy whose `events` are the
stage's events with the remix merged in by `x`, a remix event after the events of its own `x`;
`createWorld` calls it once. Any event may also carry `minLoop` / `maxLoop` (1–8;
`stageEventInLoop`): the stage runner (`createStageRunner(stage, hooks, camera, loop)`,
`StageRunner.loop`) marks the events of other loops in an `outOfLoop` table and `eventActive` skips
them exactly like the events of a branch not taken. Because loop 1 plays `stage.events` unchanged,
its event indices — and so every loop-1 hash — are those of every build before M3-01. All nine
zones ship a remix.

**The run.** The ARCADE run is the campaign with `mode: 'arcade'`. At the final zone's clear the
ending plays as usual, the ending card says `OK: LOOP n` (`okNextLoop`) instead of going to the
credits, and `SceneFlow.nextLoop()` → `RunState.nextLoop()` restarts at the campaign's first zone one
loop higher (at most `MAX_LOOP`), the zone count — the rank's stage term — starting again and the
carried players becoming the zone's entry state; the zone card reads `LOOP n  ZONE A`
(`loopZoneCard`). The run is recorded (hi-score, replay) when it finally ends. **LOOP 2** as a
start is locked until an ending unlocked it (`SaveData.unlocks.loop2`).

## Extra Edit weapons (`content/weapons/types-extra.weapons.json`)

Seven weapons marked `"extra": true` (`WeaponSpec.extra`), with original names and Gradius III-style
roles:

| Weapon (slot) | Behaviour | `ShotKind` |
|---|---|---|
| CONTROL MISSILE (missile) | `missile.control`: flies straight ahead, easing its height towards its shooter's every tick (`track`, a fraction per tick) | `Control` 10 (new) |
| UPPER MISSILE (missile) | `missile.upper`: the Missile upside down — rises, then slides along the ceiling (`findCeiling`) | `Upper` 11 (new) |
| SMALL SPREAD (missile) | `missile.smallSpread`: a small Spread Bomb fired backwards and down | `SpreadBomb` (reused, `flip` 1) |
| HAWK WIND (missile) | `missile.hawkWind`: each shot rises like the Upper Missile when its shooter is above the playfield's middle, else falls like the Missile; both then follow the terrain | `HawkWind` 12 (a role's kind only: `emit` turns each shot into `Upper` or `Missile`) |
| 2-WAY BACK (missile) | `missile.twoWayBack`: the 2-Way Missile fired up-back and down-back | `TwoWay` (reused, `flip` 1) |
| BACK DOUBLE (double) | `shot.backDouble`: a Double whose second shot flies up and back | `Double` (reused, `flip` 1) |
| SPREAD GUN (double) | `shot.spreadGun`: the two diagonals as one volley; **equipped twice** — forward too | `SpreadGun` 13 (new) |

The `flip` tunable (1 = mirrored horizontally, 2 = vertically — `RoleTables.flip`, written into the
shot's draw flags) lets them reuse the Types A–D shot art, so the step added no sprites; the meter's
labels gained seven frames at the end of `METER_LABEL_FRAMES` / `METER_SHORT_IDS` (the pipeline's
`procedural/hud.mjs` draws them).

**The Spread Gun's second equip.** `MeterChoices.doubleLevels` is 2 when the Double role fires
`SPREAD_GUN_BEHAVIOR` (the power-up system reads `PowerUpHost.weapons.roleWeapons`); `canEquipSlot`
keeps DOUBLE equippable while `Loadout.spread` is 0, and the second `equipSlot` sets `spread` 1 (a
new Double equip or the laser resets it). `Loadout.spread` is carried between zones
(`CarriedPlayer.spread`) and hashed **only when non-zero**.

**The weapon select's EXTRA.** TYPE gained **EXTRA** after EDIT (only when some slot has an extra
weapon): like EDIT, but each slot's choice lists every weapon of the slot, the Extra Edit ones
after EDIT's (`editCounts` marks where they start). EDIT itself wraps within the non-extra weapons,
and going back from EXTRA to EDIT resets an extra choice to the slot's first. Until
`save.unlocked('extraEdit')` the TYPE choice steps past EXTRA.

**Unlocks** (`core/save` `SaveUnlocks`, `UNLOCK_IDS` `extraEdit` / `loop2`): reaching **any**
ending unlocks both (`SaveStore.unlock` → `true` when it was locked; the ending card then says
`EXTRA EDIT AND LOOP 2 UNLOCKED`), and the title's EXTRA EDIT code unlocks Extra Edit. Unlocks are
never taken back; `SaveData.unlocks` is written only once something is unlocked, so the save stays
format 2 (no migration).

## Secret codes (`SecretCodeTracker`)

Four original sequences of eight single direction presses (`SECRET_CODES`, `SecretCode`,
`SECRET_CODE_LENGTH`) — remote-friendly, no chords, never another game's code:

| Code | Where | Sequence | Effect |
|---|---|---|---|
| **EXTRA SHIPS** | title | ↑ → ↓ ← ↑ → ↓ ← (two turns clockwise) | the next games start with `SECRET_SHIPS` (7) ships — `startingLives` accepts 1–9 since M3-01 (`MAX_STARTING_LIVES`; the menus still offer 1–5); for the session only; the runs count as assisted (`AssistFlag.Secret`) |
| **EXTRA EDIT** | title | ↓ ← ↑ → ↓ ← ↑ → (two turns counter-clockwise) | unlocks Extra Edit for good (the save is flushed) |
| **FULL POWER** | pause menu | ← → → ← ← → → ← | `core/world` `grantFullPower` for every alive ship: the `'full'` loadout (a Direct ship: both levels at the top, the gold Arm); once per World; the run counts as assisted |
| **SELF DESTRUCT** | pause menu | → ← ← → → ← ← → | `core/world` `selfDestruct`: every alive ship is hit as if by a bullet on the next tick (its shield does not help; god mode and the invincibility assist still do) — the joke |

`SecretCodeTracker.feed(pressed, first, last)` keeps the last eight single-direction presses in an
`Int32Array`; any other press (OK, Back, two directions at once) starts over. The title confirms a
code with the extra-life jingle and a message for `SECRET_MESSAGE_TICKS` (150); a pause code acts
and resumes the game. The pause codes change the World **between ticks**, so the flow records them
as run-replay actions (`RunAction.FullPower` / `SelfDestruct`).

## Score-milking cap (`ScoringRules.repeatKills` / `repeatPercent`)

`content/rules/scoring.rules.json` gained `repeatKills` 40 and `repeatPercent` 10 (the defaults
`DEFAULT_REPEAT_KILLS` / `DEFAULT_REPEAT_PERCENT`; `repeatKills` 0–`MAX_REPEAT_KILLS` 1000, 0 = no
cap). Only enemies spawned **by a script or a boss** count — a spawner's brood, a boss's minions,
split bubbles, thrown rocks: the sources a player could farm (`Enemy.child`, set by `spawnEnemy`'s
`child` argument — default `fromScript` — and by `EnemySystem.spawn`); the stage timeline's spawns
never do. Per spec and World, the first `repeatKills` player kills score in full, every later one
`repeatPercent` % of the spec's score, floored to tens (`killScore`, an `Int32Array` of counts).

This **changed a golden**: `captain-range-god` (the captains' minions) scored 25,120 → 20,980 and
was re-blessed in the build commit; every other golden and demo changed only in its header.

## Assists and feel (`PlayOptions`, the GAME and CONTROLS pages)

The save's options gained `play` (`core/config` `PlayOptions`, `DEFAULT_PLAY_OPTIONS`; the save
stays format 2 — `resolvePlayOptions` reads a missing or odd field as its default):

| Row (page) | Field | Kind | Effect |
|---|---|---|---|
| OPT RECOVERY (GAME, `GameOptionsItem.OptionRecovery` 6) | `optionRecovery: boolean \| null` | sim | `GameConfig.optionRecovery` of the next games (`userGameOverrides`): the Options a death penalty takes drop at the wreck as Free Option items (`EnemySystem.dropAt(DropKind.FreeOption, …)` — the M2-04 freed Options, collectable by any ship); meter mode only |
| SPEED (GAME, `Speed` 7) | `speed` — one of `GAME_SPEEDS` 100 / 75 / 50 | presentation | slows the frame clock (below); marks the run assisted (`AssistFlag.Speed`) |
| INVINCIBLE (GAME, `Invincible` 8) | `invincible: boolean` | sim | `GameConfig.invincible` of the next games: `PlayerShip.invincible` (set by `createPlayer`) makes `playerHit` ignore every hit, terrain included; the run is assisted (`AssistFlag.Invincible`) |
| RUMBLE (CONTROLS, `ControlsItem.Rumble` 8) | `rumble: boolean` (default on) | host | gamepad rumble (below) |

`GameOptionsItem.Back` is 9 and `ControlsItem.Back` 9 now. The GAME page shows
`ASSISTS MARK SCORES AND REPLAYS` (`assistHint`). Like every M2-16 game option, the sim-affecting
ones reach the **next** game or a RETRY STAGE, never the World in play.

**Game speed without touching the simulation.** `SceneFlow.speedPercent` is the save's speed while
the game scene is on top (else 100). `Game.frame` became two functions: `bareFrame` (bare gameplay
— the M1-19 frame, small enough for V8 to inline) and `flowFrame`, which falls back to `debugFrame`
when the speed is below 100. `debugFrame` treats the speed as a timing mode of its own
(`SPEED_MODE_BASE` + percent — a change resets the loop's accumulator like a slow-motion switch)
and feeds `loop.advance` a clock that advances `delta × percent / 100`, floored to whole
milliseconds. Every tick still runs whole, so the simulation, its replays and hashes are those of
the normal speed — the run is only flagged.

**What counts as assisted** (`core/replay` `AssistFlag`, a bit mask; `runAssisted(assists)`):
`GodMode` 1 (the debug god mode), `Invincible` 2, `Speed` 4, `Secret` 8. `SceneFlow.noteAssists`
ORs the game speed, the invincibility assist and god mode into `RunState.assists` every tick the
game scene steps (never allocates); FULL POWER and the EXTRA SHIPS code add `Secret`. An assisted
run's hi-score rows carry `assisted: true` (`HiScoreEntry.assisted`, written only when true; the
tables draw `*` after the score), its replays carry the flags in every segment's header, and the
browser marks it `*` / `ASSISTED`.

## Rumble (`@shmup/input-web`, `@shmup/shell`)

The core already pushed `SimEventKind.Rumble` (`id` the player slot, `param` 1 a death, 2 a boss's
final blast). `connectRumbleEvents(dispatcher, rumble, enabled)` (shell `dispatch`) hands each one
to the input adapter while `enabled()` — the save's `options.play.rumble` — says so; the shell wires
it only when the adapter has `ShellInput.rumble`. `WebInput.rumble(player, strength)` rumbles that
player's pads (two seats: player 2's seated pad, every other pad player 1's; one seat: every pad
for player 1) through `rumblePad(pad, strength)`: `vibrationActuator.playEffect('dual-rumble',
RUMBLE_EFFECTS[1 | 2])` — 260 ms (0.6 / 0.8) or 520 ms (0.8 / 1.0), frozen constants; a pad without
motors is skipped and a rejected effect ignored. The replay screen never forwards `Rumble`.

## Whole-run replays (`core/replay` `run.ts`)

The M1-19 replay records **one World** in bare gameplay. A game played through the scene flow is a
**run** — one World per zone, bonus stage and retry, players carried between them, and a few things
the flow decides **between** ticks. A `RunReplay` records it as **segments**, one per World:

```text
RunReplayJson { kind: 'run-replay', formatVersion: 1, buildId, mode, label, score, reached, assists,
  segments: [ { replay: ReplayJson   ← the M1-19 encoding: header (config, assists), RLE input,
                                        hashes every 600 ticks, final hash
                start: {…} | null      ← what the flow put into the World before its first tick
                actions: [tick, code | param << 8, …] } … ] }
```

- **The header** gained `assists` (`ReplayHeader.assists`, the run's `AssistFlag`s — informative;
  `createReplayHeader` defaults it from `assisted` and `config.invincible`, `decodeReplay` reads a
  replay without it as `GodMode` when `assisted`, else 0). Playback still reads only `assisted`
  (god mode) and the config (whose `invincible` *is* the assist). Every golden and attract demo was
  re-blessed for this header field and the four new config fields — hashes unchanged.
- **The start state** is opaque JSON here; `core/scenes` builds it (`worldStartJson(start, carry,
  hiScore)`: the rank's stage term, a bonus stage's return x, a practice checkpoint, the entrances'
  lock, the session hi-score and every carried player — lives, score, continues, extends, loadout,
  `spread`, speed, the meter cursor and the whole shield with its pods) and reads it back validated
  (`readWorldStart` — a malformed field throws a `RangeError`, the replay is refused). The flow and
  the playback apply it with the same function, `prepareWorldStart(world, start, carry)` — what
  `prepareRunWorld` runs since M3-01.
- **Flow actions** (`RunAction`): `Continue` (`continueWorld(world, who)` — the parameter is the
  player mask), `FullPower`, `SelfDestruct` (the slot). Recorded at the World's tick count between
  ticks, at most `MAX_SEGMENT_ACTIONS` 64 a segment.
- **Limits.** `SEGMENT_CAPACITY` 72,000 ticks a World (20 minutes — a zone lasts 3–6), at most
  `MAX_RUN_SEGMENTS` 48 segments. A run past them, or one where the debug tools changed a World
  outside a tick (a checkpoint / boss jump — `SceneFlow.noteWorldEdited` → `RunRecorder.invalidate`),
  cannot be saved (`finishRun` → `null`).

**Recording** (`core/scenes` `RunRecorder`, one per flow — `SceneFlow.recorder`): `beginRun` at a
game start; `beginSegment(world, previous, start, carry, buildId, godMode, assists)` when the game
scene adopts a World (the previous World's segment ends; the header and `worldStartJson` of the
start begin the new one); the game scene calls `record(input)` right before and `check(world)`
right after every `stepWorld` — pauses and menus are not recorded; `action(code, param)` for a continue or a pause secret; `seal(world)`
before the zone tally pays its bonus (the tally changes the World outside a tick — the segment's
final hash is taken first); `finishRun(world, meta)` when the run ends (`SceneFlow.endRun` — back
at the title, or a new run started from inside the game). The segment recorder (`SegmentRecorder`)
is preallocated: `record` / `check` / `action` never allocate (hashing boxes one number every 600
ticks); segment and run transitions allocate like a scene transition.

**Playback** (`RunReplayPlayback(run, content, events?)`): `nextSegment()` creates the segment's
World from its header like a demo's (`createWorld` with the config re-resolved, god mode from
`assisted`), applies the start state, then applies the actions recorded at tick 0 (the test agent
found these were never applied, which blocked every later action of that segment — fixed);
`step()` plays one recorded tick, applying the actions due between ticks where the flow applied
them and comparing every hash — the periodic ones right after their tick, the final one after the
segment's last actions, as the recorder took them. `running` turns false at the end or at the first
mismatch; `report` (`RunPlaybackReport`) says which segment and tick differed. `nextStage` tells the
host which stage the next segment needs (the replay screen prepares its music first).

## The replay library (`createReplayLibrary`, `ReplayLibrary`)

The shell creates it over `platform.storage` right after the save and awaits `load()` before the
title (`Shell.replays`). Slot 0 is the **last game** (every finished run replaces it —
`storeLast`), slots 1–`KEPT_REPLAY_SLOTS` (3) the ones the player **kept** (`keep(slot)` copies a
slot into the first free kept one; `importText(text)` stores a shared replay there). Each slot lives
under its own key (`replayStorageKey`: `replay.last`, `replay.1` … `replay.3`, prefixed
`shmup-cup:` by the web / Tizen adapter) as the replay's compact JSON text (`runReplayText`,
`parseRunReplayText` — never throws). `summaries[slot]` (`ReplaySummary`: mode, label, score,
reached, assisted, ticks) is what the browser draws; `revision` bumps on every change.

**Sized to the storage adapter** (the review round's fix). The web / Tizen adapter counts two bytes
a UTF-16 character, key included, against **256 KiB a value** and **1 MiB** for all of the app's
keys ([platform-polish.md](platform-polish.md)). So:

- `MAX_REPLAY_TEXT` = **120,000** characters a replay — `('shmup-cup:replay.last'.length +
  120,000) × 2` = 240,042 bytes, under the value limit (a longer run is not saved: `storeLast` →
  `ReplayStoreResult.TooLong`);
- `MAX_KEPT_REPLAY_TEXT` = **130,000** characters for the kept slots **together** — KEEP past it
  returns -1 and an import `ReplayStoreResult.Full` (`NO FREE SLOT: DELETE ONE FIRST`), while the
  last game keeps its own room;
- so the whole library takes at most 500,150 bytes, and the save (`save.v1`) and its corrupt copy
  still fit beside it even at the 256 KiB value limit each — replays can never push the save into
  memory-only storage.

`load()` never rejects: an unreadable or invalid slot is empty, and a slot over the caps (an older
build's text) is empty **and its key is cleared**, so it stops taking the save's room. A slot index
that is not a whole number 0–3 is an empty slot (the test agent found `keep(1.5)` threw and
`remove(1.5)` wrote a stray `replay.1.5` key — fixed). Writes are best effort: a failing write keeps
the replay for the session.

A 3.5-minute zone is a few hundred bytes of input; the start states and hashes add a little per
segment, so a whole campaign run is far below the cap.

## The replay screens (`ReplaysScene`, `ReplayScene`)

**`ReplaysScene`** (EXTRA → REPLAYS): an overlay listing LAST GAME and SAVED 1–3, each with its
label (`KESTREL NORMAL`), the zone it reached, its score and a red `*` for an assisted run. OK on a
filled slot opens the actions (`ReplayActionItem`): PLAY, KEEP (last game only), SHARE (only when
the host has `shareReplay`), DELETE, BACK; a one-line message answers (`KEPT IN SAVED n`, `NO FREE
SLOT: DELETE ONE FIRST`, `REPLAY COPIED`, `COULD NOT SHARE`, `REPLAY DELETED`, `REPLAY CANNOT BE
READ`). The rows' texts are built on `enter` and after an action; ticking allocates nothing.

**`ReplayScene`** (PLAY): a full screen showing the playback's World with its own HUD list;
`REPLAY  X1` at the top (`ASSISTED` for an assisted run); Right / Left step through
`REPLAY_SPEEDS` ×1 / ×2 / ×4 (ticks played per displayed tick), OK pauses, Back returns to the
browser. At the end — or a desync (a replay of another build or content): `REPLAY OUT OF SYNC` —
the end message stays `REPLAY_END_TICKS` (150) ticks, then the browser. The Worlds push into a
private queue forwarded to the session's through a closure bound once, filtered by `Uint8Array`
tables: `Rumble`, `UserOption` and `SoundTest` are never forwarded, and sound effects and music
ducking are dropped while fast-forwarding. A tick plays up to four recorded ticks without
allocating (apart from D29's spawn coroutines).

## Sharing (the web app)

`SceneFlowHost.shareReplay(text) → boolean` is the host hook behind SHARE (`GameOptions.shareReplay`,
`ShellOptions.shareReplay`). The web app (and so the desktop app, which loads it) passes
`copyReplayText(win, text)` — `navigator.clipboard.writeText` when the page has it (a secure
context: `localhost`, `https`, the desktop app's `app://`); and `listenForPastedReplays(win,
importText)` imports text pasted anywhere on the page that contains `"run-replay"` into the first
free kept slot (`Shell.replays.importText`; other pastes are left alone; `WebApp.stop` removes the
listener). The replay is locked to its build only by its hashes: a replay of another build plays
until its first mismatching hash. The TV has no clipboard, so the Tizen app passes no hook and the
browser offers no SHARE there. Both apps pass `__SHMUP_BUILD__` as the build id the replays record
(`WebAppResources.buildId`, `TizenAppResources.buildId`, `ShellOptions.buildId`).

## Budgets

- **Save:** `MAX_HI_SCORE_TABLES` 32 → 64; the replay library as above (≤ 500,150 bytes of the 1
  MiB).
- **UI string slots:** unchanged (`UI_STRINGS` 512); the HUD list gained one slot
  (`HUD_STRING_COUNT` 24 — `HUD_STRING_SLOTS.time`).
- **Tizen `app.js`:** 374.7 KB gzip of its 384 KB budget after the step — **not raised**.

## Determinism

- Every new sim option is a `GameConfig` field (`loop`, `timeLimit`, `invincible`,
  `optionRecovery`) and so is in every replay header; the game speed is presentation (the clock
  only). New state is hashed only when in use (the caravan clock, `Loadout.spread`), so the golden
  replays and demos of M1–M2 were re-blessed **for their headers only** — except
  `captain-range-god` (the milking cap, above).
- New golden replays (`test/golden/golden.ts` `GOLDEN_SCENARIOS`, checked by `golden.test.ts`'s
  "golden replays of the extra modes"): `zone-a-loop2-god` (loop 2 with god mode: the remix, the
  bullets, revenge from every kill — a different run from `zone-a-god`), `zone-a-loop2-boss` (loop
  2 without god mode), `zone-a-caravan` (`timeLimit` 3600: time up after a minute), `zone-a-extra`
  (Hawk Wind and the Spread Gun), `zone-a-recovery` (option recovery over deaths) and
  `zone-a-invincible` (`assists` 2 in the header, no death).
- A run replay is played back hash for hash in the unit tests (`scenes-run-replay-edge.test.ts`:
  FULL POWER, SELF DESTRUCT, a continue, the zone tally and the next zone with its carry, a bonus
  stage and the return, RETRY STAGE) and in the browser (`test/e2e/extra-replays.spec.ts`).

## Zero allocation

`SegmentRecorder.record` / `check` / `action`, `SecretCodeTracker.feed`, `noteAssists`,
`updateClock`, `killScore` and `hudClockSeconds` never allocate; the replay screen's tick plays
recorded ticks into existing Worlds. Segment starts, `finishRun`, the library and the browser's
rows allocate — transitions and menu actions.

**Lesson (M3-01).** Checking the game-speed assist inside `Game.frame` made the function too big
for V8 to inline into the frame loop, and the fractional `nowMs` passed to a call it does not
inline is boxed on every frame — the allocation guard caught it. The fix keeps two functions and
picks one at creation: bare gameplay keeps the small M1-19 frame (`bareFrame`), the scene flow gets
`flowFrame` ([conventions.md](conventions.md#performance-zero-allocation-in-hot-paths)).

## Running it

```sh
pnpm dev                                    # http://localhost:5173 — title → EXTRA (Down ×5, Enter)
pnpm exec vitest run --project core packages/core/test/scenes/scenes-extra-modes.test.ts
pnpm exec vitest run --project core packages/core/test/replay packages/core/test/scenes/scenes-run-replay-edge.test.ts
pnpm exec vitest run --project integration test/golden/golden.test.ts test/integration/loops-runtime.test.ts
pnpm exec vitest run --project integration test/playtest/boss-rush.test.ts
pnpm exec playwright test test/e2e/extra-replays.spec.ts      # after pnpm test:e2e built the apps
```

In a browser the replays are `localStorage["shmup-cup:replay.last"]` and `…replay.1`–`3` (the text
is the replay JSON — paste it on another browser's page to import it). The unlocks are
`unlocks` in `shmup-cup:save.v1`; delete them there to lock EXTRA and LOOP 2 again.

## Extending it

| To add… | Do this |
|---|---|
| A remix for a stage | A `remix` list in its `content/stages/*.stage.json` (spawn / formation events, sorted, no branch); `minLoop` / `maxLoop` on existing events to drop them from later loops; re-bless any loop-2 golden it changes |
| An Extra Edit weapon | A weapon with `"extra": true` in `content/weapons/` (a behaviour of `WEAPON_BEHAVIOR_KINDS` — new behaviours need a `ShotKind`, params in `WEAPON_BEHAVIOR_PARAMS`, a slot in `WEAPON_BEHAVIOR_SLOTS`, a label in `WEAPON_BEHAVIOR_LABELS`), a meter label frame at the end of `METER_LABEL_FRAMES` plus a `meterShort…` id |
| An EXTRA mode | A `RunMode`, a row in `ExtraScene` / `ExtraItem`, its branch in `beginRun`, a `HI_SCORE_MODES` entry (and the table count's arithmetic in `MAX_HI_SCORE_TABLES`), its clear / game-over rule in `StageClearScene` |
| A secret code | A `SecretCode` and eight direction bits in `SECRET_CODES` (original — never another game's), the screen's `feed(…, first, last)` range, its effect; a code that changes a World between ticks must be a `RunAction` |
| A flow action a replay must repeat | A `RunAction` code, `RunRecorder.action` where the flow does it, its case in `RunReplayPlayback.applyActions` |
| An assist | A `PlayOptions` field (`resolvePlayOptions`, `DEFAULT_PLAY_OPTIONS`, `serializeSave`), a row on the GAME page, an `AssistFlag` bit ORed in `noteAssists`; a sim-affecting one also a `GameConfig` field folded in by `userGameOverrides` |
| An unlock | An id in `SaveUnlocks` / `UNLOCK_IDS` (and `sanitizeUnlocks` / `serializeSave`), `save.unlock(id)` where it is earned, `save.unlocked(id)` where it gates |

## Tests

| Where | Covers |
|---|---|
| `packages/core/test/replay/replay-run.test.ts`, `replay-run-edge.test.ts` | Run replay encode / decode (every branch of the decoder), the segment recorder (idle, two players, the action limit, a missed hash, reuse), the library (slot bounds, memory-only, throwing storage, odd stored values, the size caps and the kept budget at their exact limits, oversize slots cleared on load, trimmed pastes, non-integer slots) |
| `packages/core/test/scenes/scenes-extra-modes.test.ts` | The EXTRA menu (rows by content), BOSS RUSH / CARAVAN (TIME UP, its table, the title) / ARCADE (LOOP 2 locked until an ending, which unlocks it and Extra Edit; the next loop), the weapon select's EXTRA skipped until unlocked; the last game recorded and the browser's KEEP / SHARE / PLAY (fast-forwarded) / DELETE; the assists marking the row and the replay; the game speed slowing the game scene's clock, never the menus; the GAME / CONTROLS rows |
| `packages/core/test/scenes/scenes-secret-codes.test.ts` | The tracker (the last eight single-direction presses, the screen's range), EXTRA SHIPS (seven ships, assisted), EXTRA EDIT (unlocked for good), FULL POWER (once per World, recorded), SELF DESTRUCT |
| `packages/core/test/scenes/scenes-run-replay-edge.test.ts` | Runs played through the flow and played back hash for hash (FULL POWER, SELF DESTRUCT, a continue, the tally and the next zone's carry, a bonus stage and the return, RETRY STAGE); desyncs (a dropped action, a changed hash, an unknown stage, a malformed start, a missing checkpoint); `RunRecorder` refusals; `worldStartJson` / `readWorldStart` |
| `packages/core/test/scenes/scenes-replay-screens-edge.test.ts` | The replay screen (×1 / ×2 / ×4, pause, Back, silent fast-forward, no rumble, OUT OF SYNC and the return), the browser (empty slots, KEEP refused when full, SHARE refused by the host), the EXTRA menu without content |
| `packages/core/test/world/world-m3.test.ts` | The loop in the rank and the faster bullets; the caravan clock (count-down, time up, the bonus, hashed only with a limit, the HUD's seconds); the invincibility assist, option recovery, `grantFullPower` / `selfDestruct` |
| `packages/core/test/world/world-m3-content.test.ts`, `world-m3-edge.test.ts` | The milking cap (script- and boss-spawned kinds only, per World; its arithmetic and rule bounds), the remix merge and its checks, revenge from every kill on loop 2, config validation (loop, clock, assists, lives up to nine), `PlayOptions` read defensively and folded into configs, unlocks and assisted rows saved only when set; loop bullet speed per loop and its cap, the caravan's limits and whole-second bonus, the new hi-score table keys |
| `packages/input-web/test/gamepad/gamepad-rumble.test.ts`, `packages/shell/test/dispatch/dispatch-rumble.test.ts`, `packages/shell/test/boot/boot.test.ts` | `rumblePad` and `WebInput.rumble`'s seat routing; `connectRumbleEvents` gated by the option; the boot wiring (library loaded before the title, rumble only with a capable adapter) |
| `packages/shell/test/storage/storage-replays.test.ts` | The library over the real `createWebStorage`: the longest accepted replay persists across a relaunch; a full library plus a maximal save, its corrupt copy and an input profile raise no storage issue |
| `apps/web/test/boot/replay-share.test.ts` | `copyReplayText` (with and without a clipboard, a refusal) and `listenForPastedReplays` (only run replays, removal) |
| `test/integration/extra-edit-runtime.test.ts`, `arsenal-runtime.test.ts` | Every Extra Edit weapon in a real World (the Control Missile following the ship, the Upper Missile and Hawk Wind's switch at the middle, Small Spread and 2-Way Back backwards, the Back Double, the Spread Gun's second equip); every one within its caps and bounds on the test range |
| `test/integration/loops-runtime.test.ts` | Every shipped campaign zone has a remix merged into its timeline from loop 2 |
| `test/playtest/boss-rush.test.ts` | The 4-way bot clears the shipped boss rush (god mode, full loadout) |
| `test/golden/golden.test.ts` (+ the six new files) | The extra modes as golden replays and the assists in their headers |
| `test/e2e/extra-replays.spec.ts` | Web: the last game kept in `localStorage` across a reload, played back from EXTRA → REPLAYS at ×4 in sync to `REPLAY END`; a pasted replay kept in `replay.1`, other pastes ignored |

## Gotchas

| Symptom | Cause / fix |
|---|---|
| A test pressing Down to reach EXIT on the title lands on EXTRA | `TitleItem.Exit` is 6 since M3-01 — navigate by the constants |
| LOOP 2 cannot be chosen | Locked until an ending was reached (`save.unlocked('loop2')`); the choice steps back to LOOP 1 |
| The weapon select skips EXTRA | Extra Edit is locked (an ending or the title's EXTRA EDIT code unlocks it), or the content has no extra weapon |
| A golden replay fails after adding a `GameConfig` field | Every header records the whole config: re-bless with `pnpm golden:update` and say why in the commit (M3-01 did, headers only except `captain-range-god`) |
| A loop-1 hash changed after editing a remix | It cannot — loop 1 plays `stage.events` alone. If it did, an event was added to `events` instead of `remix` |
| A replay says OUT OF SYNC at once | It was recorded by another build or content (the hashes lock it), or the debug tools jumped mid-run (such runs are not saved) |
| KEEP says `NO FREE SLOT: DELETE ONE FIRST` with a free slot | The kept replays together would pass `MAX_KEPT_REPLAY_TEXT` (130,000 characters) — delete a long one |
| The last game was not saved | Its text passed `MAX_REPLAY_TEXT` (120,000), a World passed `SEGMENT_CAPACITY` or the run passed `MAX_RUN_SEGMENTS`, or the debug tools edited a World (`noteWorldEdited`) |
| SHARE is missing | The TV (no clipboard — no `shareReplay`), or a page served over plain `http` from another host (no `navigator.clipboard`: SHARE says `COULD NOT SHARE`) |
| A pasted replay did not appear | The text lacked `"run-replay"`, was invalid, too long, or the kept slots are full / over budget (`importText`'s result) |
| The game runs slowly but the score is marked `*` | SPEED is 75 / 50 % on the GAME page — the assist marks the run; set it back to 100 % |
| A paused FULL POWER did nothing | Once per World (`GameScene.secretUsed`, reset with each World), and only for alive ships |
| Rumble never happens | RUMBLE is off, the pad has no `vibrationActuator` (the TV remote never rumbles), or the adapter has no `rumble` |

## Next steps that build on this page

- **M3-02** (done) — the "authentic slowdown" toggle is sim-affecting (unlike the game-speed
  assist) and lives in `GameConfig` next to `graze`, `deathBomb` and `blackHole`; the graze value
  joined the score rules. None of the four marks a run assisted, but all four are in the replay
  header, so a replay plays back exactly as it was recorded —
  [visual-and-mechanic-extras.md](visual-and-mechanic-extras.md).
- **M3-03** — localization of the new labels (`content/strings/`); on Steam, cloud saves for the
  replay library's keys.
