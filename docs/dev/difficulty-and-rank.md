# Difficulty presets, rank, extends and continues

How a session's **difficulty** works inside `@shmup/core`: the four **difficulty presets**
(Easy / Normal / Hard / Arcade, a `rules` content table), how `resolveGameConfig` turns one into
`GameConfig` fields, the **rank** that grows with the stage, the loop and the player's power and
scales enemy bullets, the per-enemy **rank modifiers** and **revenge bullets**, the **extends**
(extra lives at score thresholds), the **continues** (restart at the last checkpoint, counted in
the score's last digit) and the two new scenes — the **difficulty menu** under START and the
**continue countdown**. Built in plan step **M2-01**; `core/rank` is implemented with it.

This page is the *how and why*. Exact signatures are in
[api-reference.md](api-reference.md#config--session-configuration) (`config`),
[`rank`](api-reference.md#rank--rank--dynamic-difficulty),
[`scoring`](api-reference.md#scoring--scores-extends-continues-and-the-session-hi-score-partial),
[`world`](api-reference.md#world--the-gameplay-session-and-the-tick-pipeline) and
[`scenes`](api-reference.md#scenes--scene-stack-and-the-scene-flow-implemented); the TSDoc in
`packages/core/src/{config,rank,scoring,world,bullets,enemies,scenes}/index.ts` is the
authoritative reference. The format for authors is next to the data:
[`content/rules/README.md`](../../content/rules/README.md) (the table) and
[`content/enemies/README.md`](../../content/enemies/README.md) (`rank`, `revenge`). What a death
costs and the arcade restart are [death-and-scoring.md](death-and-scoring.md); the rank curves the
fire primitives apply are [bullets-and-patterns.md](bullets-and-patterns.md#rank-corerank); the
scene stack is [scenes-and-ui.md](scenes-and-ui.md); per-difficulty hi-score tables are
[saves-and-options.md](saves-and-options.md#hi-score-tables).

Background: `shmup_feat.md` §15 (the rank formula, the difficulty presets, extends, the lives
cap), §10 (continues at the checkpoint, the continue count in the score's last digit), §11 (rank
modifiers per enemy, revenge bullets), §16 (difficulty select), §17 (the continue countdown);
plan §3.5 (the `rules` kind) and decisions **D6** (the death penalties), **D7** (extends at
20,000 then every 70,000), **D16** (difficulty as data) and **D17** (32 aim directions on Normal,
16 on Easy).

## The picture at a glance

```text
 content/rules/difficulty.rules.json ──► core/data (kind `rules`) ──► ContentDb.difficulty
                                                  (null without the file → DEFAULT_DIFFICULTY_TABLE)
 createGame(platform, overrides, db)
   resolveGameConfig(overrides, db.difficulty ?? DEFAULT_DIFFICULTY_TABLE)
     DEFAULT_GAME_CONFIG ◄ difficultyOverrides(preset) ◄ overrides   (explicit overrides win)
     → rankBase, rankGrowth, startingLives, extendFirst, extendEvery, continues,
       deathPenalty, aimDirections, bulletSpeedMul  (all recorded in a replay header)

 scene flow   title ─START─► DifficultyScene (overlay) ─OK─► game (World on withDifficulty(config))
                                   │ Back → title menu
              game over + continues left ─► ContinueScene (10 s) ─OK─► continueWorld(world)
                                                  │ Back / timeout → GameOverScene

 each tick    phase 3 (end)  updateWorldRank: power of the strongest active ship → computeRank
                             → a changed rank: bullets.setRank (curves × bulletSpeedMul)
              phase 4        an enemy with `rank` modifiers: setShooterRank … script … clearShooterRank
              phase 7        kill credited to a player, on screen, rank ≥ minRank → revenge bullets
              phases 3 + 7   scoring credits points → checkExtends → +1 life, ExtraLife (Critical)
```

## The difficulty presets

One row per preset, in `content/rules/difficulty.rules.json` (the shipped table) and in
`core/config` `DEFAULT_DIFFICULTY_TABLE` (the built-in copy, used when the content has no `rules`
file with a `difficulty` section — tests, the calibration scenes). `pnpm content:check`
(`test/integration/content.test.ts`) keeps the two equal.

| Preset | `rankBase` | `rankGrowth` | `lives` | `continues` | `deathPenalty` | `aimDirections` | `bulletSpeedMul` |
|---|---|---|---|---|---|---|---|
| `easy` | 0 | 0.5 | 5 | 5 | `casual` | 16 | 0.85 |
| `normal` | 2 | 1 | 3 | 3 | `classic` | 32 | 1 |
| `hard` | 4 | 1 | 3 | 2 | `classic` | 32 | 1 |
| `arcade` | 6 | 1 | 2 | 0 | `arcade` | 32 | 1 |

Every preset has `extends: { first: 20000, every: 70000 }` (D7). `DIFFICULTY_PRESETS` lists the
presets easiest first — the menu's order and the index of the flow's per-preset arrays.

### The `rules` kind (`core/data`)

`content/rules/*.rules.json` files (`kind: "rules"`) hold game-wide tables; `difficulty` is the
only section today and is optional. The loader validates it with the schema combinators — all
four presets required, `rankBase` 0–31, `rankGrowth` 0–`MAX_RANK_GROWTH` (4), `lives` 1–5,
`extends.first` / `every` 0–`MAX_EXTEND_SCORE` (99,999,990), `continues` 0–`MAX_CONTINUES` (9),
`deathPenalty` one of `DEATH_PENALTY_PRESETS`, `aimDirections` 4–1024, `bulletSpeedMul`
`MIN_BULLET_SPEED_MUL`–`MAX_BULLET_SPEED_MUL` (0.25–4) — then checks what the schema cannot
(`aimDirections` a power of two), freezes the rows and stores the table as
`ContentDb.difficulty`. A second file with a `difficulty` section is an issue and is ignored
(files are read in path order). The bounds are `core/config` constants, so the loader and
`resolveGameConfig` accept exactly the same values.

### Resolving a config (`core/config`)

`GameConfig` gained six fields — `rankBase`, `rankGrowth`, `extendFirst`, `extendEvery`,
`continues`, `bulletSpeedMul` — next to the three it already had that a preset also sets
(`startingLives`, `deathPenalty`, `aimDirections`). `DEFAULT_GAME_CONFIG` holds Normal's row.

```ts
resolveGameConfig(overrides = {}, table = DEFAULT_DIFFICULTY_TABLE)
  // { ...DEFAULT_GAME_CONFIG, ...difficultyOverrides(preset, table), ...overrides, difficulty: preset }
```

- The preset is `overrides.difficulty ?? 'normal'`; its row fills the preset fields **under** the
  explicit overrides, so `{ difficulty: 'arcade' }` means rank base 6, 2 lives, 0 continues and
  the arcade penalty, while `{ difficulty: 'arcade', startingLives: 5 }` keeps the 5.
  **Behaviour change:** before M2-01, `{ difficulty: 'arcade' }` changed only the rank base.
- The resolved preset is always written into the config — an explicit `difficulty: undefined`
  resolves to `'normal'` with Normal's fields (the M2-01 test pass fixed a config whose
  `difficulty` stayed `undefined` and whose hi-score key read `meter-undefined`).
- Validation (all `RangeError`s): `rankBase` an integer 0–31, `rankGrowth` a finite number
  0–4, `extendFirst` / `extendEvery` integers 0–99,999,990, `continues` 0–9, `bulletSpeedMul` a
  finite number 0.25–4, `difficulty` a `DifficultyPreset`, and — new — `deathPenalty` a
  `DeathPenaltyPreset` (a misspelt penalty used to act like `casual`).
- `createGame` passes `content.difficulty ?? DEFAULT_DIFFICULTY_TABLE`, so a session plays the
  content's numbers.

`difficultyOverrides(preset, table?)` returns one row as `Partial<GameConfig>` (throws
`RangeError` for an unknown preset); `withDifficulty(config, preset, table?)` switches a resolved
config to another preset — every preset field from the new row, everything else (seed, stage,
loadout, …) kept, and earlier overrides of preset fields replaced. The difficulty menu uses it.

**Replays.** A replay header stores the whole resolved `GameConfig`, so every preset value is
recorded and a replay does not depend on the content's table. The format version did not change:
`decodeReplay` resolves the header's config with the built-in table, so an M1 header without the
new keys decodes to its preset's values (`packages/core/test/replay/replay-difficulty.test.ts`).

## Rank (`core/rank`)

Rank is Gradius III's 0–31 difficulty value. It is computed from a `RankInputs` object:

```text
rank = base + floor(growth × (8·(loop − 1) + (stage − 1) + power + special))
       clamped to 0…RANK_MAX (31), and to RANK_LOOP1_CAP (16) while loop ≤ 1
```

| Input | From | Today |
|---|---|---|
| `difficultyBase` | `config.rankBase` | Easy 0, Normal 2, Hard 4, Arcade 6 (rounded) |
| `growth` | `config.rankGrowth` | Easy 0.5, the others 1; 0 = a constant rank |
| `loop`, `stage` | the campaign | `stage` = the zones cleared before + 1 in a campaign run (M2-10 — `core/scenes` `prepareRunWorld`; 1 in single-stage runs and practice at zone A); `loop` stays 1 (loops are M3) |
| `power` | `powerRank(…)` of the most powerful active ship | written every tick by `updateWorldRank` |
| `special` | no-miss streaks, loop bonuses, debug overrides | 0 |

`computeRank` is total: a loop or stage below 1 counts as 1, a fraction is floored, any
non-finite term counts as 0 (a non-finite growth as 0 — a constant rank), and it never
allocates. `createRankInputs(config)` builds the mutable inputs a World keeps;
`difficultyRankInputs(preset)` (growth 1, the built-in base) is kept for tools and tests.

**The power term** (`powerRank(missile, double, laser, options, shield, reduce)`, values in
`RANK_POWER`): Speed +0 per level, Missile +1, Double +2, Laser +3, each Option +1, a shield +4,
Reduce +2 (used since M2-04: `updateWorldRank` passes a standing Reduce as the `reduce` flag and
**not** as `shield` — a smaller hurtbox is worth less than a barrier; every other `?` shield, pods
included, counts +4). Flags count when positive; Double and Laser are both main weapons, so a ship
has at most one of them.

**In Direct mode** (M2-05, the MANTA) `updateWorldRank` uses `directPowerRank(shot, sub, armTier)`
instead: `floor((shot + sub) / 2)` plus `RANK_ARM_TIER` (the green Arm +2, the silver Super Arm
+3, the gold Hyper Arm +4). Both levels at 8 with the Hyper Arm give **12** — the same as the
fully powered meter ship, so both ships share the difficulty curve; the Speed toggle counts 0
like the meter's Speed Ups ([direct-mode.md](direct-mode.md#speed-toggle-death-penalty-and-rank)).

| Ship (Normal: base 2, growth 1, loop 1, stage 1) | Power | Rank |
|---|---|---|
| Fresh — speed, basic shot | 0 | 2 |
| Missile + Double | 3 | 5 |
| Missile + Laser + 2 Options | 6 | 8 |
| Missile + Laser + 4 Options | 8 | 10 |
| Missile + Laser + 4 Options + Force Field | 12 | 14 |
| Missile + Laser + 4 Options + Reduce (M2-04) | 10 | 12 |
| MANTA: shot 5, sub 3, the green Arm (M2-05) | 4 + 2 = 6 | 8 |
| MANTA: both levels 8, the Hyper Arm (M2-05) | 8 + 4 = 12 | 14 |
| The same on Arcade (base 6) | 12 | 16 (the loop-1 cap; 18 uncapped) |
| The same on Easy (base 0, growth 0.5) | 12 | 6 |

### When the World recomputes it

`world.rankInputs` (mutable, from `createRankInputs(config)`) and `world.rank` (hashed) live on
the World. **`updateWorldRank(world)`** runs at the **end of phase 3**, after the stage and before
the scripts of phase 4:

1. the power term of every **active** ship (`loadout.missile`, `main === MainWeapon.Double /
   Laser`, `loadout.options`, `shieldActive(ship.shield)`; in Direct mode `loadout.shot`, `sub`
   and the Arm's tier) — the maximum goes into `rankInputs.power`;
2. `computeRank(rankInputs)`;
3. only when the rank **changed**: `world.rank = rank` and `world.bullets.setRank(rank)` —
   `rankScale` returns fractions, so the curves are evaluated on a change, never every tick.

A dying, dead or respawning ship still counts, with whatever the death penalty left it: the
penalty is applied in phase 7 of the death tick, so from the next phase 3 its reduced loadout
lowers the rank. `createWorld` computes the rank once from the inputs and calls `updateWorldRank`
again after the starting loadout is applied, so `loadout: 'full'` counts from tick 0;
`continueWorld` calls it after the continue. Code that changes `rankInputs` outside a tick (the
campaign's stage term — M2-10's `prepareRunWorld`, at tick 0 of each zone's World) calls `updateWorldRank` itself.

The debug overlay's `RANK` (`core/debug` `DebugCounters.rank`) now moves during a run.

### What the rank scales

The curves are unchanged from M1-09 ([bullets-and-patterns.md](bullets-and-patterns.md#rank-corerank)):
`rankScale(r, curve) = 1 + perRank · (r − 2) + perRankSq · (r² − 4)`, exactly 1 at Normal's base
rank, never below 0.05.

| Rank | Bullet speed × (`BULLET_SPEED_RANK_CURVE`) | Fire rate × (`FIRE_RATE_RANK_CURVE`) | `fireWait(90)` |
|---|---|---|---|
| 0 | 0.978 | 0.956 | 94 |
| 2 (Normal start) | 1 | 1 | 90 |
| 6 (Arcade start) | 1.056 | 1.112 | 81 |
| 10 | 1.128 | 1.256 | 72 |
| 14 | 1.216 | 1.432 | 63 |
| 16 (loop-1 cap) | 1.266 | 1.532 | 59 |
| 31 | 1.768 | 2.537 | 35 |

`BulletSystem.setRank(rank)` now keeps two pairs of scales: the **session's**
(`rankSpeedScale` = the speed curve × `config.bulletSpeedMul`, `rankFireScale`) and the
**current** ones the fire primitives read (`speedScale`, `fireScale`), which are the session's
except while a rank-modified enemy's script runs. `bulletSpeedMul` applies from creation (a
bullet host without the field — a hand-made test host — counts as × 1). So Easy's bullets fly at
`0.978 × 0.85 ≈ 0.83` of Normal's at the start, and its aimed shots snap to 16 directions.

Since M2-02 the **pattern DSL** follows the same scales: its fire speeds are Normal values
multiplied by `speedScale` when a pattern fires (a bullet's own program keeps the scale it was
fired with), a `wait` with `ranked: true` is `round(ticks ÷ fireScale)` like `fireWait`, and
expressions can read `$rank` (and `$loop`) directly — `common.ring` fires
`8 + floor($rank / 4) · 2` bullets ([pattern-dsl.md](pattern-dsl.md#expressions)).

## Per-enemy rank modifiers

An enemy spec may carry `"rank": { "bulletSpeed": k, "fireRate": k }` (0–8 each, default 1). The
fields existed in the enemy schema since M1-08 but nothing read them; since M2-01 they are
**sensitivity multipliers**: the enemy sees

```text
multiplier = 1 + k · (curve − 1)        (at least 0.05)   — core/rank rankSensitivity(scale, k)
```

`k` = 1 is the session's curve, 0 ignores rank, 2 doubles its effect; at Normal's base rank every
`k` gives × 1, so the content's speeds and intervals stay the Normal values. For the speed the
preset's `bulletSpeedMul` is applied on top: `(1 + ks · (speedCurve − 1)) · bulletSpeedMul`.

`compileSpecs` stores the modifiers in typed arrays (`rankSpeed`, `rankFire`, and `rankMod` = 1
when either is not 1). In phase 4, `runScripts` resumes an enemy without modifiers directly; for
one with modifiers it calls `bullets.setShooterRank(rankSpeed, rankFire, specIndex)`, resumes the
script, then `bullets.clearShooterRank()`. The modifiers are read from the typed arrays inside
the bullet system, so no fraction crosses a call per wake (V8 would box it —
[conventions.md](conventions.md#performance-zero-allocation-in-hot-paths)).

## Revenge bullets

`"revenge": { "minRank": 0–31, "pattern": "aimed" | "spread3" | "ring8", "speed"?: 0.25–4 }`
(default speed `DEFAULT_REVENGE_SPEED` = 1.25 px/tick on Normal) — shmup_feat.md §11's "suicide
bullets". When `EnemySystem.kill(enemy, by)` kills an enemy with a revenge pattern, it fires from
where the enemy died if **all** of these hold:

- the kill is credited to a player (`by ≥ 0`) — a debug tool's kill fires nothing;
- it is not part of a **Mega Crash** (`megaCrash` sets a flag around its kills);
- the enemy is **on screen** (`EnemyFlag.OnScreen`);
- `host.rank ≥ minRank` (the World's rank; a host without it counts as 0).

| Pattern | Fires (`BulletKind.RoundRed`) |
|---|---|
| `aimed` | one bullet at the nearest living player (`fireAimed`) |
| `spread3` | an aimed 3-way, 48 binary units (≈ 17°) apart (`fireNWay`) |
| `ring8` | eight bullets evenly round the circle, the first aimed (`fireRing`) |

The bullets go through the normal primitives with the enemy's own rank modifiers
(`setShooterRank` / `clearShooterRank` around them), so they are rank-scaled, snap to
`aimDirections` and are cancelable; a full pool drops them quietly. Zone A's `vane` fans fire an
aimed revenge bullet from rank 12 (Normal with a fully powered ship); the 4-way playtest bot never
reaches that rank, and the zone's 4-way rule checks pass unchanged
([zone-a-and-playtest.md](zone-a-and-playtest.md)).

## Extends (`core/scoring`)

Every `PlayerScore` carries `nextExtend` (the score of its next extra life, 0 = no more),
`extendsEarned` and `continues`. The scoring system sets `nextExtend = config.extendFirst` when it
is created (`resetExtends()`), and **`checkExtends()`** runs after every crediting —
`beginTick()` (phase 3: kills made between ticks) and `resolve()` (phase 7):

- for each player whose score reached `nextExtend`, move the threshold on by `extendEvery` (0 →
  none left) and count an extend; a score that crossed several thresholds at once gets each one;
- each extend gives the player's ship **+1 life** up to `MAX_LIVES` (9) — at the cap the threshold
  is used up without a life — and pushes `Sfx ExtraLife` at the ship with
  **`SfxPriority.Critical`** (never stolen by other sounds, shmup_feat.md §19);
- nothing while the World's status is `gameOver`: the threshold waits (a continue resets the
  lives anyway, and the waiting extend is given right after it, at the next crediting).

With Normal: extra lives at 20,000, 90,000, 160,000 … points. The HUD draws up to five stock
icons, then one icon and the count. `addScore` itself does not check extends — code that adds
points outside the scoring system's crediting (the boss tally, `core/bosses`) is covered by the
next `checkExtends` (the same tick's phase 7 or the next phase 3).

The hash (`core/debug` `hashWorld`) mixes every player's `nextExtend` and `continues` after its
score.

## Continues

### In the World (`core/world`)

`world.continuesUsed` counts the continues of this game. **`canContinue(world)`** is `status ===
'gameOver' && continuesUsed < config.continues` — since M2-06 per player: at least one active
player with `continuesLeft(world, p) > 0` (`config.continues` minus that player's own continue
digit), which is the same in a one-player game. **`continueWorld(world, who)`** (→ `false`,
changing nothing, when it cannot; `who` — M2-06 — is the mask of the players who continue, default
all; a co-op player who did not continue stays out and may drop back in later with START —
[coop.md](coop.md#leaving-per-player-continues-and-the-game-over)):

1. `continuesUsed++`;
2. every **active** ship: `lives = config.startingLives`; its power goes (`applyDeathPenalty
   ('arcade', …)`: no shield, basic shot, no Missile or Options, speed 0, meter cursor reset),
   then the config's starting loadout (`applyLoadoutPreset`); its score marks the continue
   (`markContinue`);
3. with a stage: `stage.restartAt(stage.checkpoint)` (every pool and system emptied — the boss and
   its WARNING too) and the stage theme is queued again (`SimEventKind.Music` — the countdown
   faded the music out); in free flight `clearSession(world)`;
4. every active ship flies in at the view, the hit-stop ends, `status = 'playing'`,
   `updateWorldRank`, `syncWorldView`.

It is deterministic (the same continue at the same tick gives the same state) and a cold path.

### The continue digit (`markContinue`)

Points are multiples of 10, so the score's last digit is free: `markContinue(board, player)`
raises the player's `continues` (at most 9) and writes it into the last digit — 12,340 becomes
12,341, a second continue 12,342. From then on `addScore` keeps the digit (`next − next % 10 +
digit`) and the clamp becomes `MAX_SCORE + digit`. The recorded hi-score row keeps the digit, so
a score that needed continues shows it (shmup_feat.md §10 — the arcade convention).

### In the scene flow (`core/scenes`)

When the World turns `gameOver`, the game scene keeps stepping it for `GAME_OVER_DELAY_TICKS`
(30), then pushes the **`ContinueScene`** when `canContinue(world)`, else the game-over screen as
before:

| | |
|---|---|
| Looks | Overlay (dim 0.35) over the frozen game: a red-edged panel, `CONTINUE?`, the seconds left (9 … 0, big, red) and `CREDITS` with the continues left |
| Timing | `CONTINUE_COUNTDOWN_TICKS` (600 = 10 s); `seconds = floor((600 − ticks − 1) / 60)`; every change of the digit plays `MenuMove` (nine ticks) |
| Music | fades out on entry (`Music Silence`, 30 ticks) |
| Input | ignored for `CONTINUE_LOCK_TICKS` (30), so a mashed button decides nothing; then an OK **press** → `continueWorld` (in a co-op game — M2-06 — only the players whose OK was pressed, the panel showing `1P` / `2P` credits), `MenuSelect`, pop (the game runs on); Back → `MenuBack`, replace with the game-over screen |
| Timeout | after 600 ticks → replace with the game-over screen (which records the run) |

A held OK never continues (only a press edge counts). The run is recorded in the save only when
the game really ends (game over, stage clear), so the continue digit is part of the recorded
score. On **Arcade** (`continues: 0`) the game-over screen opens directly.

The continue is decided by the scene flow **between** World ticks, so bare-gameplay replays (one
World, ending at the game over) do not contain it; since M3-01 the scene flow records whole runs,
with the continue as a between-tick action (`RunAction.Continue`) —
[extra-modes-and-replays.md](extra-modes-and-replays.md#whole-run-replays-corereplay-runts) (M2-15's attract demos stay bare-World
recordings). Since M2-15 the countdown also shows a draining time
bar, the score and a `PRESS OK` prompt ([front-end-and-attract.md](front-end-and-attract.md#the-continue-countdown-polished)).

## The difficulty menu (`DifficultyScene`)

START on the title no longer replaces the title with the game: it pushes the difficulty menu, an
overlay (dim `PAUSE_DIM`) with an opaque panel — `DIFFICULTY`, EASY / NORMAL / HARD / ARCADE, and
for the focused preset its `LIVES`, `CONTINUES` and `HI` (that preset's session best). It opens on
the difficulty chosen last (at first the host config's — Normal in the apps) with the usual
2-tick activation lock; Up / Down move with wrap and auto-repeat. **OK** calls
`flow.chooseDifficulty(preset)` and — since M2-05 — pushes the **ship select** (the weapon
select of M2-03 follows it for the meter ship; with a single ship in the content the ship select
is skipped), whose choice resets the stack to the game scene (M2-01 reset it here directly); the
game scene's World is created with that preset's config plus the chosen ship and loadout
([direct-mode.md](direct-mode.md#the-ship-select-corescenes),
[meter-arsenal.md](meter-arsenal.md#the-weapon-select-corescenes)); **Back** pops back to the
title menu (and Back on the ship select returns here, the menu re-locked for 2 ticks).

The flow builds **one config per preset** when it is created (`FlowControl.configs`, in
`DIFFICULTY_PRESETS` order): the host's config for its own preset, `withDifficulty(host.config,
preset, table)` for the others (the content's `rules` table, or the built-in one). So:

- `SceneFlowHost.createWorld(config?)` takes the game's config (omitted = the host's);
  `createGame` passes it on to `createWorld`. `game.config` stays the host config; a game's World
  may run another preset (`game.world.config`).
- `SceneFlow.difficulty` / `SceneFlow.gameConfig` name the preset and config of the next game;
  `SceneFlow.modeKey` is `hiScoreModeKey(gameConfig)`.
- Since M2-16 the choice is **remembered**: the menu's OK stores it in the save
  (`options.game.difficulty`, `FlowControl.rememberDifficulty`), the GAME page's DIFFICULTY row sets
  it too, and the flow starts on it. The menu's `LIVES` / `CONTINUES` show the **armed** configs
  (`FlowControl.armedConfigs` — with the GAME page's LIVES, the one-button preset …), what the game
  will really get. A run keeps the difficulty it started on (over the pause menu the GAME page's
  DIFFICULTY is disabled) ([options-rebinding-and-accessibility.md](options-rebinding-and-accessibility.md#sim-affecting-options-reach-the-next-game-never-the-one-in-play)).
- Starting a game takes one more OK than in M1 (title OK, START, then OK on the preset) — and
  since M2-03 one more again (OK on the weapon select's START), and since M2-05 one more (OK on
  the ship select — KESTREL is focused first). Every flow test and e2e spec was updated each time.

**Hi-scores per difficulty.** The session hi-score is kept per preset (`FlowControl.bests`, a
`Float64Array`), each starting from the save's best of its own table (`meter-easy`,
`meter-normal`, `meter-hard`, `meter-arcade`); `flow.hiScore` and `setHiScore` act on the chosen
preset's, the title shows it, and a finished game is inserted into its World's table (the row's
`difficulty` field too). The M1 table `meter-normal` keeps its scores. Since M2-05 the bests are
kept per **power-up mode** too (`bests[mode × 4 + preset]`, `FlowControl.bestIndex`): the MANTA's
games read and fill the `direct-easy` … `direct-arcade` tables, and the menu's `HI` is the chosen
ship's.

## Determinism, hashing and golden replays

- Everything above is sim state derived from the config and the inputs; the only floating point
  is the rank curves' result, computed once per rank change.
- `hashWorld` adds, after the scores: every player's `nextExtend` and `continues`, then
  `world.continuesUsed` and `rankInputs.loop / stage / power / special` (`world.rank` was hashed
  since M1-09).
- The four golden replays were re-blessed in `b31fac5` on purpose (rank growth changes fire rates
  and bullet speeds as the bot powers up, extends add a life at 20,000, the Arcade preset now
  means 2 lives and the arcade penalty); all four keep their outcome
  ([debug-and-replays.md](debug-and-replays.md#golden-replays-testgolden)).

## Zero allocation

- `computeRank`, `powerRank`, `updateWorldRank`, `checkExtends`, `markContinue` and the continue
  countdown's `tick` only do arithmetic on existing numbers and objects.
- `rankScale` / `rankSensitivity` return fractions: `setRank` runs only on a rank change, and
  `setShooterRank` reads its modifiers from typed arrays (no fractional argument per wake).
- Revenge bullets reuse the enemy system's `BulletOrigin`; the extend SFX is pushed with
  whole-pixel positions (`Math.floor(x) | 0` — [conventions.md](conventions.md#performance-zero-allocation-in-hot-paths)).
- The allocation guards: `packages/core/test/enemies/enemies-rank-alloc.test.ts`
  (rank-modified shooters, `setShooterRank` / `clearShooterRank` × 100,000, revenge kills, a
  changing rank) and `packages/core/test/scenes/scenes-continue-alloc.test.ts` (the difficulty
  menu and the countdown). The boss-fight guard (`bosses-alloc.test.ts`) now runs with
  `rankGrowth: 0`: at rank 14 the boss fires about 40 % more often, i.e. more coroutine wakes
  (each resume allocates a small result object — D29), not a per-tick allocation; fractional
  bullet speeds alone barely change the bytes.

## Extending it

| To add… | Do this |
|---|---|
| A difficulty preset | Extend `DifficultyPreset` and `DIFFICULTY_PRESETS` (`core/config`), add its row to `DEFAULT_DIFFICULTY_TABLE`, the `rules` schema (`DIFFICULTY_TABLE_SCHEMA`), `content/rules/difficulty.rules.json` and the menu's labels (`DIFFICULTY_LABELS`, `core/scenes`); the panel has room for about five items |
| A new field in the table | Add it to `DifficultyRules`, `difficultyOverrides`, the `GameConfig` field + `DEFAULT_GAME_CONFIG` + validation, `DIFFICULTY_RULES_SCHEMA`, both tables and `content/rules/README.md`. A replay header records it; an older header decodes to the preset's value |
| Another `rules` section (the scoring tables — M2-02) | An optional key of `RULES_FILE_SCHEMA`, a `ContentDb` field, a `collect` branch that rejects a second definition, a built-in default for sessions without content |
| A power-rank term | A `RANK_POWER` entry, an argument of `powerRank` and its source in `updateWorldRank` (a flag or count read from the loadout / ship — never a fraction) |
| The loop and stage terms (M2-10) | Write `world.rankInputs.loop` / `stage` when a stage starts, then call `updateWorldRank(world)`; both are hashed |
| A `special` term (no-miss streak, debug override) | Keep a counter in sim state (hashed), write `rankInputs.special` before phase 3 ends |
| A revenge pattern | Append to `REVENGE_PATTERNS` (never reorder — the code is the index + 1), a `RevengeCode` and its branch in `EnemySystemImpl.revenge`; M2-02's DSL may replace the built-ins with pattern references |
| A rank-dependent behaviour tunable | Prefer the fire primitives (they scale by the current scales); for anything else read `world.rank` in a cold place and convert once |
| Another life source (like the Direct-mode orange 1UP of M2-05) | Give the life through the same cap (`MAX_LIVES`) and push `ExtraLife` with `SfxPriority.Critical` |
| Another saved game option on top of a preset (M2-16 did lives and the penalty) | A field of `UserGameOptions` mapped in `userGameOverrides` — it is applied over every preset's config by the flow's `rearm` ([options-rebinding-and-accessibility.md](options-rebinding-and-accessibility.md#extending-it)) |

## Tests

| Where | Covers |
|---|---|
| `packages/core/test/rank/rank.test.ts`, `rank-edge.test.ts` | The formula table (base, growth, loop, stage, power, special), the loop-1 cap, a sweep of every input (whole, in range, capped, equal to the formula written out, monotonic), odd inputs (fractional / NaN loops and stages, negative and infinite terms), `powerRank`, `rankScale` / `rankSensitivity` at the edges |
| `packages/core/test/config/config-difficulty.test.ts`, `config-difficulty-edge.test.ts` | Every preset's fields, explicit overrides winning, validation of the new fields and of `deathPenalty`, a content table, `withDifficulty` for every preset pair (other fields kept, round trip), a bad content row failing only its preset, `difficulty: undefined` (the fix) |
| `packages/core/test/data/data-rules.test.ts`, `data.test.ts` | The `rules` kind: the shipped table, every range, `aimDirections` a power of two, missing presets, a second file, frozen rows; the enemy `rank` / `revenge` fields |
| `packages/core/test/bullets/bullets-rank.test.ts` | Session scales × `bulletSpeedMul` from creation (a host without it = × 1), `setShooterRank` matching `rankSensitivity` over a rank × modifier sweep, the 0.05 floor, `clearShooterRank`, `setRank` during a shooter's turn |
| `packages/core/test/world/world-rank.test.ts`, `world-rank-edge.test.ts` | Rank growing with the strongest ship, stage / loop terms, growth 0, dropping with what a death takes; modifiers changing bullet speeds deterministically; Easy's slower bullets and 16 directions; revenge bullets (minRank, credited kills only, not on a Mega Crash or off screen, the three patterns); recomputation before the same tick's scripts, `setRank` only on a change, player 2, dead / respawning ships, debug counters and the hash |
| `packages/core/test/scoring/scoring-extends.test.ts`, `scoring-extends-edge.test.ts` | Extends at the thresholds (kills, bonuses, pickups, between-tick kills), several at once, the lives cap, no extend while the game is over, the SFX with `Critical`, two players; the continue digit (clamp, nine continues, dirty flags, bad slots) |
| `packages/core/test/world/world-continue.test.ts`, `world-continue-edge.test.ts` | `canContinue` / `continueWorld`: lives, loadout, checkpoint restart, music, status, digit, `continuesUsed`; before the second checkpoint, player 2, every death penalty, emptied pools, an extend waiting through the game over, exactly `config.continues` continues |
| `packages/core/test/scenes/scenes-continue.test.ts`, `scenes-continue-edge.test.ts`, `scenes-continue-alloc.test.ts` | The difficulty menu (order, wrap, sounds, Back, the World's preset, per-preset hi-scores, host config reuse, a content table) and the countdown (60 ticks per second, nine tick sounds, the lock edge, a held OK, the timeout, resume, the recorded score with its digit); allocation guards |
| `packages/core/test/replay/replay-difficulty.test.ts` | Headers record the preset fields; an M1 header decodes to its preset's values; lockstep playback on every preset |
| `packages/core/test/enemies/enemies-rank-alloc.test.ts` | The allocation guards of rank-modified shooters and revenge kills (own file) |
| `test/integration/difficulty-continue-remote.test.ts` | The difficulty menu and a continue at zone A's checkpoint driven by Samsung remote key codes through `input-web` |
| `test/integration/content.test.ts` | The shipped `rules` table equals `DEFAULT_DIFFICULTY_TABLE` |
| `test/e2e/continue.spec.ts` | Web build: START → ArrowDown → Enter starts on HARD (rank 4); a game over opens the countdown (red panel); Enter continues with fresh lives and the digit. Tizen build: remote Back (10009) on the countdown gives up to the game-over screen |

## Gotchas

| Symptom | Cause / fix |
|---|---|
| `{ difficulty: 'arcade' }` now gives 2 lives and a harsh penalty | By design since M2-01: a preset sets all its fields; add explicit overrides (`startingLives`, `deathPenalty`) for anything else |
| A test that set only `startingLives` behaves as before, but one that set `difficulty` does not | The preset's other fields (continues, penalty, aim directions, bullet speed) came with it — pin the fields the test depends on |
| `RangeError: GameConfig.deathPenalty must be one of …` | Strings are validated now; use a `DeathPenaltyPreset` |
| The rank does not change after a test edits a loadout | It is recomputed at the end of phase 3 — step the World or call `updateWorldRank(world)` |
| The rank jumped at tick 0 with `loadout: 'full'` | Intended: the starting loadout counts from the first tick |
| Enemies fire faster as the player powers up, and a golden replay fails | Rank growth — an intended simulation change re-blesses with `pnpm golden:update` and a reason in the commit message |
| An allocation guard creeps up in a boss or rank test | More fire = more coroutine wakes, each allocating a result object (D29). Measure at a constant rank (`rankGrowth: 0`) when the guard is about something else |
| No revenge bullet after a kill | The kill was not credited to a player, was a Mega Crash, happened off screen, or `world.rank < minRank` |
| A score ends in 1–9 | A continue: the last digit counts the continues used (`markContinue`) |
| The extend did not come at 20,000 during a game over | Intended — extends wait while the status is `gameOver` and come at the next crediting after a continue |
| Lives stop at 9 | `MAX_LIVES`; the threshold is still used up |
| START does not start the game | It opens the difficulty menu; OK on a preset opens the weapon select (M2-03), and OK on its START starts. From `PRESS OK` a game takes four OKs |
| A replay of a game with a continue desyncs | Bare-gameplay replays end at the game over; the continue is a scene-flow action between ticks and is not recorded |
| The difficulty menu's `HI` differs from the title's before choosing | The title shows the chosen preset's best (Normal at first); the menu shows the focused preset's |
| The chosen difficulty is back to NORMAL after a restart of the app | Not expected since M2-16 — the menu's OK saves it (written with the next flush: a finished game or the Options screen closing). A game quit before any flush keeps the old one |
| The difficulty menu shows 5 `LIVES` for every preset | The GAME page's LIVES is set (M2-16): the menu previews the armed configs; set LIVES back to `PRESET` |

## Next steps that build on this page

- **M2-02** (done) — the pattern DSL reads `$rank` and `$loop` and scales like the primitives;
  cancel points and the `rules` kind's `scoring` section. Revenge bullets still use their three
  built-in patterns — DSL revenge patterns are still planned (not part of M2-09; with the zones of M2-11 … M2-14 — [pattern-dsl.md](pattern-dsl.md)).
- **M2-03** (done) — the weapon select after the difficulty menu (one more OK to start; the
  loadout applied on top of every difficulty's config with `withArsenal`). The rank's power term
  counts roles, not weapons, so a Type B–D ship with the same meter levels has the same rank; of
  the `!` choices NORMAL lowers it (the Double / Laser term goes), LIFE OPTION (more Options) and
  FULL BARRIER (a shield) can raise it, SPEED DOWN leaves it (speed counts 0)
  ([meter-arsenal.md](meter-arsenal.md)).
- **M2-04** (done) — Reduce counts +2 (`RANK_POWER.reduce`) instead of a shield's +4; the pod
  shields (front, Free, Rotate) count +4 like the Force Field; the Option type does not matter
  ([options-shields-hunter.md](options-shields-hunter.md#shields-coreshields)).
- **M2-05** (done) — the Direct-mode power term `directPowerRank` (max 12, like the meter), the
  orange 1UP through the same lives cap, per-mode hi-score tables and one more OK (the ship
  select) ([direct-mode.md](direct-mode.md)).
- **M2-06** (done) — per-player continues (`continuesLeft`, a mid-game continue with START in
  co-op, `continueWorld`'s player mask, the countdown's per-player OKs); the rank's power term is
  still the strongest active ship's ([coop.md](coop.md)).
- **M2-10** (done) — a campaign run sets `rankInputs.stage` to the zones cleared + 1 in every zone's World (so zone A plays at 1 and a final zone at 5 — +4 rank at growth 1); a practice run uses the practice zone's depth + 1; the loop stays 1 ([campaign-and-bonus-stages.md](campaign-and-bonus-stages.md#carrying-the-players)).
- **M2-15** (done) — the continue countdown's polish (the draining bar, the flashing last seconds,
  the score, `PRESS OK`), per-difficulty tables per mode (1 PLAYER, 2 PLAYERS, PRACTICE) with the
  name entry ([front-end-and-attract.md](front-end-and-attract.md)).
- **M3-01** (done) — the loop term in use: `GameConfig.loop` (the ARCADE mode) sets
  `rankInputs.loop` (`createRankInputs`), lifting the loop-1 cap; from loop 2 enemy bullets fly
  `loopBulletSpeedScale` faster and **every** enemy a player shoots down fires a revenge bullet at
  any rank (its own pattern, else one aimed shot); whole runs — continues included — recorded by the
  scene flow ([extra-modes-and-replays.md](extra-modes-and-replays.md)).
- **M2-16** (done) — the chosen difficulty saved with the options, the GAME page's LIVES /
  PENALTY over the presets, the difficulty menu previewing the armed configs
  ([options-rebinding-and-accessibility.md](options-rebinding-and-accessibility.md)).
