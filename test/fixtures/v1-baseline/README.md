# test/fixtures/v1-baseline — what the v1 game does, recorded for R2-02

`plan_resolution.md` **R2-02** ("Port all content ×1.5") compares the ported 640×360 game with v1:

- every zone's **camera travel time** is within ±2 % of v1;
- nothing spawns visibly on screen that spawned off screen in v1 — the **first-visible tick** of
  every spawn within ±1 tick;
- every enemy that **enters from above** reaches the same place as in v1 (×1.5 + 36 px, within 2 px);
- the playtest bot clears every zone, bonus stage and the boss rush in god mode within its budgets.

Those v1 numbers can only be measured while `master` still runs the 384×216 frame, so they were
recorded here before R2-01 flips it: one `<id>.baseline.json` per scenario (37 files, ≈ 445 KB).

| File | Role |
|---|---|
| `test/golden/v1-baseline.ts` | the scenarios (`BASELINE_SCENARIOS`), the meter (`createBaselineMeter`), the run (`recordBaseline`), the file format and I/O |
| `test/golden/v1-baseline-suite.ts` | the re-run check shared by the three test files |
| `test/golden/v1-baseline.test.ts` | the files are complete and consistent; the non-zone stages re-run byte for byte |
| `test/golden/v1-baseline-zones.test.ts`, `…-loop2.test.ts` | the nine zones on loop 1 and on loop 2 re-run byte for byte |

## How each run is played

Exactly like `test/playtest/harness.ts` `runStage(stage, fourWayBot(), { godMode: true, seed, config })`:
bare gameplay on the headless platform and the shipped content, **the 4-way bot under the remote
model** (`fourWayBot()`, `four-way (remote)`), **god mode**, the bot's mask committed before every
tick, until `stageClear` (or the scenario's tick limit). The meter only reads the World — it wraps
`world.enemies.onStageEvent`, `spawnPending`, `kill` and `destroy` on the instance and every wrapper
calls straight through — and the scenarios that are a golden replay's run (`golden` in the file:
`zone-a` … `zone-i` are the `<zone>-god` goldens, and so on) end on that golden's tick count and
final hash, which the re-run test checks.

| Scenarios | Options |
|---|---|
| `zone-a` … `zone-i` | seed 1 (the `<zone>-god` goldens) |
| `zone-a-loop2` … `zone-i-loop2` | `loop: 2` (the stage's `remix` events join the timeline); seed 71 for zone A (`zone-a-loop2-god`), else 1 |
| `bonus-vault`, `brine-grotto`, `glimmer-cache`, `raid-range`, `twin-range`, `bonus-range` | the full loadout and their goldens' seeds |
| `gimmick-range`, `raster-range`, `captain-range` | their goldens' seeds (31, 41, 51) |
| `boss-rush`, `gauntlet-range`, `hunter-range` | the full loadout, seed 1 (Option Hunters spawn only against Options) |
| `hunter-range-dive` | the full loadout, **`startX` 1440** (`StageRunner.jumpTo` before the first tick): the diving Option Hunter at x 1500 — the **only spawn of the shipped content above the top edge** — never comes in a whole run (the rear hunter at x 700 steals every Option first) |
| `dimension` | the full loadout, **6,000 ticks**: the bot cannot shoot down IRON TALON or GRASPING BLOOM, so the stage never clears; the run covers the timeline up to the boss lock and SHADOW STRIDER's timed escape |
| `escape`, `test-range`, `test-boss`, `weapon-range`, `direct-range` | seed 1 |

## The file

Every number is in **v1 units**: pixels of the frame stored in `frame` (`width` 384, `height` 216,
`hudBar` 8, `playfieldWidth` 384, `playfieldHeight` 200, `tileSize` 8) and ticks at 60 Hz. Positions
of enemies and bosses are **playfield coordinates**: world minus camera — x from the view's left
edge, y from the playfield's top edge (the HUD bar is not included). Values are rounded to 1/100 px.

| Field | Meaning |
|---|---|
| `id`, `stage`, `description`, `config`, `golden`, `startX` | the scenario (`config` = session options over the defaults) |
| `run` | `bot`, `godMode`, `status`, `maxTicks`, `ticks` (run length), `clearTicks` (ticks to `stageClear`, -1 = never), `hash` (`hashWorld` after the last tick) |
| `camera.length` | the stage's camera-x length |
| `camera.endTick` | first tick the camera's x reached `length` (-1 = never: most stages clear on the boss's death while the camera is still locked short of it) |
| `camera.movingTicks` / `lockedTicks` / `holdTicks` | ticks the camera moved (`dx` or `dy` ≠ 0) / was scroll-locked (lock keys, the boss brake) / was held by a `hold` key |
| `camera.keys` | per camera key: `[x, tick the camera's x first reached it, camera y then]` (-1 = never) |
| `camera.checkpoints` | per checkpoint: `[x, tick it was passed]` (-1 = never during the run, e.g. behind `startX`) |
| `maxBulletSpeed` | the fastest live enemy bullet of the run, px/tick (`test/playtest/rules.ts` `maxBulletSpeed`) |
| `warnings` | ticks the WARNING banner came up |
| `events` | per timeline event, in stage order (index = event index): `[type, x, tick it fired]` (-1 = never reached) |
| `skippedEvents` | indices of events the camera passed while their branch was not taken |
| `specs` | the enemy specs the rows name: `[id, hw, hh, anchor]` — hurtbox half sizes; anchor 0 air, 1 floor, 2 ceiling |
| `enemies` | one row per regular enemy, in spawn order — the columns below |
| `bosses` | one row per boss or captain encounter: `[id, role (0 boss, 1 captain), warningTick, introTick, introX, introY, fightTick, fightX, fightY, dyingTick, escapeTick, endTick]` (-1 = did not happen) — positions of the boss origin at the end of the tick its intro / fight began |

Enemy row columns (`enemyColumns`):

| Column | Meaning |
|---|---|
| `event` | the `spawn` / `formation` event that brought it; -1 = spawned by a script or a boss (a child) |
| `member` | its index in the formation (-1 = a single spawn or a child) |
| `spec` | index into `specs` |
| `spawnTick`, `x0`, `y0` | the tick it spawned and where: a timeline enemy's spawn point itself (before its first move), a child's position at the end of its spawn tick |
| `entry` | where its hurtbox was at spawn: beyond the top / bottom edge (`T` / `B`) and / or the left / right edge (`L` / `R`), or `I` = overlapping the view |
| `visibleTick`, `visibleX`, `visibleY` | the tick the World first saw its hurtbox on screen — `Enemy.firstSeenTick`, the hurtbox overlapping the playfield, edges inclusive — and where it was then (-1 = never on screen, e.g. shot just beyond the right edge) |
| `turnTick`, `turnX`, `turnY` | its **first vertical turning point**: the last tick before its vertical movement (playfield y for a flying enemy, world y for a ground one) first stopped or reversed after it began, and where it was — where an enemy that enters from above **lands**; -1 = it never moved vertically or left first |
| `endTick`, `fate` | the tick it left and how: `k` killed, `d` destroyed by a script (a shattered rock, a cube turned into terrain), `e` escaped (out of the view, or never seen for 600 ticks; a formation leader turned ghost counts from that tick), `a` still alive when the run stopped (`endTick` -1) |

Match rows between runs by `(event, member)` for timeline enemies (unique per run); children only by
spec and order.

## Comparing a v2 run (R2-02's test)

Record the same scenarios at 640×360 with `recordBaseline(scenario)` (with `startX` ×1.5 — 2160 —
and the bot's constants scaled as R2-02 says), never into these files, and compare field by field.
With W, H the playfield size (v1 384 × 200, v2 W′ × H′ = 640 × 336), k = 1.5 and the top pad
P = H′ − k·H = 36 (§2.6):

| Field | v2 value | Notes |
|---|---|---|
| every tick (`spawnTick`, `visibleTick`, `turnTick`, event / key / checkpoint ticks, `warnings`, boss ticks) | **equal** | first-visible ±1 tick (acceptance); camera keys and `warnings` are the camera travel time: ±2 % |
| `camera.movingTicks`, `holdTicks` | equal (±2 %) | speeds and lengths are both ×k |
| event `x`, key `x`, checkpoint `x`, `camera.length`, `startX` | ×k | world x |
| key camera y | by the port's own rule | §2.6: a one-playfield pan (zone D's `yTo 200`) is frame-anchored → 336; compare with the value the rescale tool wrote |
| enemy x (`x0`, `visibleX`, `turnX`) with `R` in `entry` | W′ + k·(x − W) | the spawn is right-edge anchored (`W + 16` → `W′ + 24`) and the enemy keeps that offset all its life |
| enemy x otherwise | k·x | |
| enemy y with `T` in `entry`: `y0`, `visibleY` | k·y | above the top edge stays above it (the §2.6 discontinuity) |
| enemy y with `T` in `entry`: `turnY` | **k·y + P, within 2 px** | the acceptance: the landing matches once the §2.6 fix-ups are made (only `hunter-range-dive` has such a spawn today) |
| enemy y otherwise | k·y + P | continuous at the bottom edge (H → H′); ground enemies stand on terrain that gained 3 rows at the top |
| `specs` `hw`, `hh` | ×k | anchor unchanged |
| boss `introX` | W′ + k·(x − W) | the intro starts just past the right edge |
| boss `fightX`, `fightY`, `introY` | W′ − k·(W − x), H′/2 + k·(y − H/2) | Appendix B: the home is frame-anchored (`DEFAULT_BOSS_X` right edge − 132, `DEFAULT_BOSS_Y` the playfield centre); a raid's camera path is world (×k) |
| `maxBulletSpeed` | ×k | |
| `run.ticks`, `clearTicks`, `camera.lockedTicks`, `endTick`, `fate`, boss fight lengths | about equal | depend on the bot's kills — the bot's budgets, not ±1-tick checks |

Caveats:

- **Player-dependent values.** Enemies that follow the player (Option Hunters, homing and chasing
  enemies, chains that steer by the ship) and boss fights depend on the bot; compare those loosely.
- **Children** take their parent's mapping: an `I` child of an enemy that came in from the right
  carries the parent's x offset.
- **Ground enemies spawned beyond the right edge** stand W′ − k·W = 64 px further along the ×1.5
  terrain than in v1 (their spawn x is edge-anchored, the terrain is world): where the surface
  height changes within 64 px, check their y against the ported terrain under them.

## Re-recording

The files are byte-locked: `v1-baseline*.test.ts` re-runs every scenario and requires the
committed text, while every frame constant still equals the file's `frame`. A failure means an R1
change shifted what the game does — fix it. Only an **intended** simulation change before R2-01
(it re-blesses the golden replays too) re-records them, with the reason in the commit message:

```sh
SHMUP_V1_BASELINE_UPDATE=1 pnpm exec vitest run --project integration test/golden/v1-baseline
```

From R2-01 on (`FRAME_W` 640) the re-runs are skipped and re-recording is refused: these files are
the frozen v1 record. Never edit them by hand.
