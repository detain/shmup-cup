# Zone A, HALCYON BULWARK and the 4-way playtest

How the M1 vertical slice's real level is put together and kept honest: **zone A, AZURE VERGE**
(`content/stages/zone-a.stage.json` and its roster), its boss **HALCYON BULWARK (HB-01)** and the
boss behaviour `boss.bulwark`, the **4-way design rules** that `pnpm content:check` enforces, the
**debug stage skip** (`GameConfig.stageSkip`, `?skip=boss`), how the apps came to **play zone A by
default**, and the headless **playtest** in `test/playtest/` — the `runStage` harness and the
`fourWayBot` that plays like a Samsung-remote player. Built in plan step **M1-18**.

This page is the *how and why*. Exact signatures are in [api-reference.md](api-reference.md)
(`config`, `debug`, `stage`, `behaviors`, `@shmup/shell`, `apps/web`, and
[the playtest tooling](api-reference.md#playtest-testplaytest)); the TSDoc of
`packages/core/src/{behaviors,config,debug,stage,world}/index.ts`,
`packages/shell/src/boot/index.ts` and `test/playtest/*.ts` is the authoritative reference. The
content formats for authors are in [`content/stages/README.md`](../../content/stages/README.md),
[`content/enemies/README.md`](../../content/enemies/README.md) and
[`content/paths/README.md`](../../content/paths/README.md). The machinery zone A runs on has its
own guides: [stage-runtime.md](stage-runtime.md) (camera path, checkpoints, terrain, parallax),
[enemies-and-behaviors.md](enemies-and-behaviors.md) (the enemy roster behaviours),
[bullets-and-patterns.md](bullets-and-patterns.md) (bullets and telegraphed lasers),
[bosses-and-warning.md](bosses-and-warning.md) (the boss system and the WARNING),
[audio.md](audio.md) (the `zone-a` and `boss` songs).

Background: `shmup_feat.md` §14 (zone themes, stage length 3–6 minutes), §11 (enemy
archetypes), §13 (the core-battleship boss archetype), §10 (checkpoints and the recovery rule),
§4 rule 2 (everything must be playable with four directions); plan §1.4 (the headless playtest
bot) and decision **D17** (aimed shots ≤ 2.0 px/tick on Normal).

## The picture at a glance

```text
content/stages/zone-a.stage.json ──┐          content/enemies/zone-a.enemies.json
  camera keys, checkpoints,        │            8 enemy types (M1 roster behaviours)
  heightfield terrain, parallax,   │            halcyon-bulwark (HB-01): parts + 3 phases
  58 events, warning @ 8,600       │                          │ phases run
                                   ▼                          ▼
                    loadContent ─► createWorld(config) ─► boss.bulwark (core/behaviors)
                                        │
          config.stageSkip === 'boss' ──┴─► skipToBoss(world)  (core/debug)
                                              └─► StageRunner.jumpTo(8,504) + fly-in again

apps/web  ?stage= › (scene flow) defaultStageId(files) = 'zone-a' ; ?skip=boss → stageSkip
apps/tizen   START → defaultStageId(files)                         ; no dev parameters

test/playtest/                                    pnpm content:check (content.test.ts)
  runStage(stageId, bot, flags) ─► report          static: bulletSpeed tunables ≤ 2.0,
  fourWayBot() — 12 lanes × 16 px, one direction   sections, capsule budget, terrain
  rules.ts — createRuleWatch().observe             dynamic: HB-01 fight with the bot →
  replayStage(stageId, inputs, flags)              createRuleWatch — no bullet > 2.0,
                                                   no two lanes < 16 px apart
```

## The stage: AZURE VERGE

`content/stages/zone-a.stage.json` — `id` `zone-a`, `name` `AZURE VERGE`, `length` 9,000,
`music` `{ stage: 'Stage', boss: 'Boss' }` (the M1-15 songs `zone-a` / `boss`; no new song was
written for M1-18). About 3 minutes of scrolling to the WARNING, ≈ 3.5 minutes to the stage clear
with the bot.

| Section | Scroll x | Camera key (px/tick) | Content |
|---|---|---|---|
| 1 — tutorial | 0–1,500 | 0.75 at 0 (ramp 60) | `skeet` popcorn formations (5–6, bonus 300 / 400), three `tender` capsule carriers, two `skeet-chain` sine chains (8, no drop); a low rolling floor 200–1,400 |
| 2 — fans and rammers | 1,500–3,500 | 0.8 at 1,500 | five `vane` fan formations on the `vane-*` paths (bonus 1,000; since M2-01 a `vane` shot down at rank ≥ 12 fires an aimed revenge bullet), `lancer` rammers in pairs (and a file of three, no drop), a 10-long chain, two carriers; open space |
| 3 — the corridor | 3,500–6,000 (checkpoint 3,500) | 0.6 at 3,500 (ramp 90) | floor **and** ceiling 3,440–6,400 (≥ 92 px open); `picket` floor turrets, `picket-ceiling` ceiling turrets, `strider` walkers, two `burrow` hatches with their mites, a vane swoop, popcorn, four carriers |
| 4 — high speed | 6,000–8,000 (checkpoint 6,000) | **1.5** at 6,000 (ramp 120) | four `gyre` orbiters on the `gyre-orbit-*` paths, two vane formations, a popcorn formation, a lancer pair, three carriers; a low floor 6,500–7,900 |
| 5 — the calm | 8,000–8,600 | 0.75 at 8,000 (ramp 120) | two carriers (`tender` at 8,120 / 8,320) and nothing else; open space |
| WARNING → boss | 8,600 (`warning` → `halcyon-bulwark`) | braked to a lock | the boss arena is open space; `end` at 9,000 after the kill |

**Capsule budget** (the recovery rule of `shmup_feat.md` §10): a *source* is a `spawn` of an
enemy with `drop: "capsule"` or a `formation` whose `drop` is not `null`. Zone A has 28 before the
boss, and 5 / 3 / 4 within 900 px after the checkpoints at 0 / 3,500 / 6,000 (the rule asks ≥ 3),
2 in the calm. The same sources serve the Direct-mode MANTA (M2-05): its ship has no meter, so
every `capsule` drop becomes the next colour item of the stage's **`directItems`** plan — 27
entries, eight each of red, green and blue plus an octagon, a yellow and an orange, cycling and
never rewound at a checkpoint ([direct-mode.md](direct-mode.md#drop-resolution-and-the-item-plan-corepowerups)).

**Terrain.** The heightfield generator of M1-07 on `terrain-a` (8-px tiles, 25 rows): three
segments — a low floor (base 20, amplitude 12), the corridor (floor base 40 ± 16, ceiling base
36 ± 16) and a low floor under the high-speed section (base 14 ± 8). Ground enemies are only
spawned inside the corridor (their spawn x + 400 lies before 6,400), so they always have rock to
stand on. The calm and the boss arena have no rock.

**Parallax.** The two star bands on `far` and `mid`, plus a new far **planet band**
`bg/azure-verge` (factor 0.125, y 152, spacing 128) — the rim of a blue planet, from the new
procedural generator `scripts/assets/procedural/backdrops.mjs`. It is listed **last** on the `mid`
layer, so it is drawn over the mid stars and no star shows in front of the planet.

## The roster

`content/enemies/zone-a.enemies.json` — eight behaviours of the M1 roster (no new enemy behaviour
was needed), with zone A's own tunables. Two new pixel-map sprites (`enemies/vane`,
`enemies/gyre`); the others reuse the M1-03 art.

| Id | Behaviour | Sprite | HP | Score | Tunables / notes |
|---|---|---|---|---|---|
| `skeet` | `drifter.sine` | `enemies/drifter` | 1 | 100 | `speed` 1.1, `amp` 18, `period` 100 |
| `skeet-chain` | `drifter.sine` | `enemies/drifter` | 1 | 100 | `speed` 1.25, `amp` 28, `period` 120, `memberPhase` 48 (a travelling wave); its formations have `drop: null` |
| `vane` | `fan.loop` | `enemies/vane` (new) | 1 | 100 | `speed` 1.6 on the formation's path |
| `tender` | `carrier.straight` | `enemies/carrier-red` | 3 | 200 | `speed` 0.7, `drop: "capsule"`, medium explosion |
| `lancer` | `rammer.aimed` | `enemies/darter` | 1 | 150 | enters straight at −1.25 px/tick for 70 ticks, `windup` 24, dash `speed` 2 |
| `picket`, `picket-ceiling` | `turret.floor` | `enemies/turret` | 3 | 300 | `ground` floor / ceiling, `fireTicks` 110, `bulletSpeed` 1.25 |
| `strider` | `walker.floor` | `enemies/hopper` | 2 | 200 | `speed` 0.6, `bulletSpeed` 1.25 |
| `burrow` | `hatch.spawner` | `enemies/hatch` | 8 | 500 | `interval` 90, `max` 4, `child` `burrow-mite`, large explosion |
| `burrow-mite` | `rammer.aimed` | `enemies/darter` | 1 | 50 | rises at (−0.5, −1) for 36 ticks, `windup` 14, dash `speed` 1.75 |
| `gyre` | `orbiter.loop` | `enemies/gyre` (new) | 4 | 400 | `speed` 1.4 on its path, a ring every `ringTicks` 150 at `bulletSpeed` 1 |

`content/paths/zone-a.paths.json`: `vane-arc-up` / `-down`, `vane-loop-up` / `-down`, `vane-swoop`,
`gyre-orbit-down` / `-up` (each `-up` / `-down` pair mirrors the other).

## The boss: HALCYON BULWARK (HB-01)

The `halcyon-bulwark` entry's `boss` section: code `HB-01`, display name `HALCYON BULWARK`, intro
150 ticks, tally **30,000**, home (300, 100) — a core battleship (`shmup_feat.md` §13) in the
right quarter of the playfield.

| Part | Parent, offset | HP | Rule | Score | Sprite |
|---|---|---|---|---|---|
| `hull` | origin, x +28 | — | `never` (armour) | — | `bosses/bulwark-hull` (new) |
| `wing-top`, `wing-bottom` | `hull`, x −6, y ∓23 | — | `never` | — | `bosses/bulwark-wing-top` / `-bottom` (new) |
| `emitter-top`, `emitter-bottom` (**guns**) | the wings, x −34, y ∓2 | — | `never` | — | `bosses/bulwark-emitter` (new, 2-frame glow) |
| `core` (**core**) | origin | 40 | `afterParts`: all four plates | 5,000 | `bosses/core` (M1-13) |
| `plate-1` … `plate-4` | origin, x −11 / −17 / −23 / −29 | 12 each | `always` | 500 each | `bosses/bulwark-plate` (new) |

The plates stand **in a row along the core's lane**, in front of it: shots meet the outer one
(`plate-4`) first, and the core is hittable only once all four are gone. The emitters are the
`gun`s — they fire the lanes and the spreads — and are armour, so the lanes cannot be shot off
(unlike TRIAL WARDEN's guns). Their lanes are 50 px apart (edge to edge 42 px with the 8-px beam),
and the core's lane lies between them.

**Phases** — all three run `boss.bulwark`:

| Phase | Until | Params (over the defaults) | What the player sees |
|---|---|---|---|
| 0 | two plates destroyed | `trackSpeed` 0.35, `laserTicks` 110 | Lane lasers only, alternating top / bottom |
| 1 | all four plates destroyed | `trackSpeed` 0.45, `laserTicks` 100, `ways` 3, `fireTicks` 120, `firstLaser` 40 | + aimed 3-ways of purple needles at 1.5 px/tick from each emitter |
| 2 | the core's death | `trackSpeed` 0.55, `laserTicks` 55, `telegraph` 40, `active` 60, `ways` 3, `fireTicks` 90, `firstLaser` 30 | A lane every 55 ticks, each closed for 108 ticks (warning 40 + grow 8 + beam 60), so **both emitters' lanes overlap in time** — the gap between them stays ≥ 16 px |

### `boss.bulwark`

Added to `DEFAULT_BOSS_BEHAVIOR_DEFS` (so it is in `BOSS_BEHAVIOR_IDS` and `KNOWN_SCRIPT_IDS`).
Tunables (defaults): `trackSpeed` 0.35, `margin` 40, `laserTicks` 110, `firstLaser` 60,
`laserLength` 384, `laserWidth` 8, `telegraph` 45, `active` 50, `fireTicks` 120, `bulletSpeed`
1.5, `ways` 0, `spread` 40.

- `api.track(trackSpeed, margin, PLAYFIELD_H − margin)` — slow vertical tracking of the nearest
  player (the boss system's motion).
- Every `laserTicks` (rank-scaled through `api.fireWait`; the first after `firstLaser` ticks, not
  scaled) the **next standing gun in part order** fires `api.laser(i, ANGLE_UNITS / 2,
  laserLength, laserWidth, telegraph, LASER_GROW_TICKS, active, LASER_FADE_TICKS, true)` — a
  telegraphed horizontal laser to the left, **attached** to its emitter, so the lane sweeps up and
  down with the boss's tracking (`boss.lanes` of the test boss fires detached lanes). A destroyed
  gun is skipped; with none standing, no lane.
- With `ways` ≥ 1 (floored), every `fireTicks` (rank-scaled) each gun fires an aimed `ways`-way of
  `NeedlePurple` at `bulletSpeed`, `spread` binary-angle units apart; `ways` 0 means never (the
  whole-number "never" wait of `boss.hover` — an `Infinity` local would allocate).
- The script sleeps until the sooner of its two timers; the boss system restarts it (with the new
  phase's params) on every phase change.

**Why it is 4-way-fair.** The lanes never come from the core: a player level with the core — the
lane the bot prefers and the one the shots must use — is threatened only when the tracking sweeps
a lane across, and every lane is left by moving straight up or down. The content test checks the
geometry for every phase (below).

## The 4-way design rules

`shmup_feat.md` §4 rule 2 (and D17) as checks, shared by `pnpm content:check` and the playtest
(`test/playtest/rules.ts`):

| Rule | Constant | How it is measured |
|---|---|---|
| Aimed bullet speed ≤ 2.0 px/tick (Normal) | `MAX_AIMED_BULLET_SPEED` | Statically: every `bulletSpeed` tunable of zone A's enemies and boss phases, behaviour defaults merged. Dynamically: `maxBulletSpeed(world)` — the fastest live enemy bullet (zone A fires nothing faster than its aimed shots, so every bullet is held to it) |
| No simultaneous laser lanes leaving < 16 px of safe gap | `MIN_LANE_GAP` | `laserLaneGaps(world)`: a **lane** is a laser in its telegraph, grow or active phase (a warned lane is as good as closed), its rows = the beam's vertical extent ± half its width, **widened by the ship's hurt radius** and clipped to the playfield (a beam wholly above or below it is no lane); overlapping or touching lanes merge. Reports the narrowest gap between separate lanes and the widest open band |

**Rank (M2-01).** The rules are written for Normal's speeds. With rank growth on, a fully
powered ship raises the rank and so the bullet speeds; the static check reads the content's
Normal values and the dynamic checks of the playtest run the real rank — the 4-way bot's power
keeps Normal at rank ≤ 7, and every check passes unchanged. Zone A's only rank-dependent content
is the `vane` revenge bullet from rank 12, which the bot never reaches
([difficulty-and-rank.md](difficulty-and-rank.md#revenge-bullets)).

`createRuleWatch()` collects both over a run (`observe` is a bound function to pass as the
playtest's observer): maxima, the narrowest gap, the narrowest widest-open band while lanes were
live, and the first 20 violations as `tick N: …` strings.

What `pnpm content:check` (`test/integration/content.test.ts`, "zone A holds to the 4-way design
rules") asserts:

- the stage's shape: name, 8,500–9,500 px, checkpoints 0 / 3,500 / 6,000, the 1.5 key at 6,000
  and a slower one at 8,000, the WARNING at 8,500–8,700 naming HB-01; HB-01's plates (4 × 12),
  core (40, `afterParts` of the plates), armoured hull and the two emitter guns; 6–8 behaviours;
- every section's archetypes (popcorn and carriers only in section 1, fans on paths and rammers in
  2, floor / ceiling turrets, walkers and hatches in 3, orbiters in 4, exactly two carriers in the
  calm), ground enemies only in the corridor, the songs and the planet band drawn last on `mid`;
- the terrain: ceiling only 3,400–6,500, floors where expected, no rock from 8,000 on;
- the capsule budget above; the scroll takes 2.5–4.5 minutes to the WARNING;
- every `bulletSpeed` tunable ≤ 2.0; HB-01's lane geometry per phase (the two lanes ≥ 16 px
  apart after widening, the core's lane between them, both on the playfield at the tracking
  limits, `trackSpeed` < 1);
- a whole HB-01 fight played by the bot (god mode, stage skip) through phases 0, 1, 2: no
  violation, bullets > 0 and ≤ 2.0, exactly two separate lanes at once in the last phase with
  ≥ 16 px between them;
- every zone A sprite has its atlas frames and white hit-flash frames.

## The debug stage skip

`GameConfig.stageSkip: 'none' | 'boss'` (type `StageSkip`, default `'none'`, validated by
`resolveGameConfig` — anything else is a `RangeError`). It is a **sim option**, so it lives in the
config and a replay records it. `createWorld` calls `skipToBoss(world)` (`core/debug`) after
queuing the stage theme when it is `'boss'`:

1. find the stage's **first** `warning` or `boss` event; none (or free flight) → `false`, nothing
   changes;
2. `runner.jumpTo(max(0, event.x − BOSS_SKIP_LEAD))` — `BOSS_SKIP_LEAD` is 96 px, about two
   seconds of the calm's scroll before zone A's WARNING;
3. `spawnPlayer(ship, camera)` for every active ship that is not dying or dead — the fly-in starts
   again at the new view.

`StageRunner.jumpTo(x)` (`core/stage`) is a `restartAt` at any scroll x: the speed, pan and
flags are re-derived from the keys and events before `x`, the events at exactly `x` re-fire on the
next tick for the hooks, the cursor goes to the first event with x ≥ it, the last passed
checkpoint becomes the last one at or before `x` (−1 when none), and `hooks.clear()` empties every
pool and system (enemies, bullets, shots, items, the boss and its WARNING). `jumpTo(checkpoints[i]
.x)` equals `restartAt(i)`. It throws a `RangeError` for an `x` outside `[0, stage.length]`;
loadouts, lives and scores are untouched.

Hosts: the web app reads `?skip=boss` (`stageSkipFromSearch` — exact, case-sensitive, last valid
value wins; `none` / absent / unknown → `'none'`). In the scene flow every START and RETRY STAGE
creates a new World from the same config, so each game starts before the boss. The Tizen app has
no dev parameters; since M1-19 its **debug build** has the debug controls
(`createDebugControls` behind the remote's Pause, Ch+, Ch+, Ch+ — then 8 skips to the boss and 7
jumps to the next checkpoint, on `skipToBoss` / `jumpToNextCheckpoint`; the web's F8 / F7 do the
same — [debug-and-replays.md](debug-and-replays.md#the-debug-controls)).

## The game plays zone A

`@shmup/shell` exports `DEFAULT_STAGE_ID` (`'zone-a'`) and `defaultStageId(files)` — `'zone-a'`
when the raw content files (before validation) contain a `stage` file with that id, else `null`.
The M1 vertical slice is one zone; the zone map of M2-10 will choose stages instead.

| Host | `gameConfig.stage` |
|---|---|
| `apps/web`, scene flow (no `?scene=`) | `?stage=<id>` when it names a shipped stage, else `defaultStageId(contentFiles)`; an unknown `?stage=` still warns and flies in open space |
| `apps/web`, `?scene=flight` and the other dev scenes | `?stage=<id>` or `null` (open space) — the gameplay e2e specs rely on open space |
| `apps/tizen`, scene flow | `defaultStageId(contentFiles)`; the dev scenes keep `null` |
| Electron | the web build without a query string: zone A |

A consequence for tests: the shipped content now holds zone A's roster too, so
`test/integration/enemies-runtime.test.ts` expects the `test-range` timeline to spawn only the
enemies *it* names.

## The playtest (`test/playtest/`)

Part of the `integration` Vitest project, so it runs in `pnpm test` (and the HB-01 fight in
`pnpm content:check`). Plain Node, headless, deterministic.

### `runStage(stageId, bot, flags)` — the harness

`harness.ts` plays a shipped stage the way a host does — bare gameplay (`createGame` on
`createHeadlessPlatform()`, no scene flow), the shipped content loaded like the shell loads it
(`shippedContent()`: `loadContent` with `KNOWN_SCRIPT_IDS` and `ENGINE_SPRITES`, plus the enemy and
weapon behaviour checks; any issue throws) — with a `PlaytestBot { name, decide(world) → Action
mask }` at player 1's controls.

- `flags`: `godMode` (set on `world.debugFlags`), `seed` (default 1), `stageSkip`, `config` (any
  other `GameConfig` fields; `seed`, `stage` and `stageSkip` win), `maxTicks` (default
  `DEFAULT_MAX_TICKS`, ten minutes), `observe(world)` (after every tick; must not change the
  World).
- Each tick: the bot decides, the mask (16 bits) is recorded and committed to player 1's snapshot
  with `commitPlayerInput` (so presses are edges of the held mask — hold `PowerUp` one tick to press
  it once), `game.step()`, the events are drained into the report, `observe` runs. The run stops on
  `stageClear`, `gameOver` or the tick limit.
- The report (`PlaytestResult`): status, ticks, `clearTick`, `seconds`, `bossDefeated`,
  `bossFightTicks`, every player-1 death (`tick`, `cameraX`, `cause` from `PLAYER_HIT_CAUSE_NAMES`,
  `y`, `boss`, `livesLeft`), score, pickups, equips per meter slot, `diagonalTicks`, the ship's x
  range, the recorded `inputs` (`Uint16Array`) and the final `hashWorld`.
- `replayStage(stageId, inputs, flags)` replays the recording in a fresh session with the same
  flags → `{ status, ticks, deathTicks, hash }`; equal to the run's because the sim is
  deterministic. M1-19's golden replays (`test/golden/`) are recorded from the same bots, through
  `core/replay` instead of the harness's `Uint16Array` recording.
- `describeRun(run)` → the one-line summary the tests print.

### `fourWayBot()` — the remote player

`four-way-bot.ts` has the Samsung remote's limits (`shmup_feat.md` §4 rule 2): it **never holds two
directions**, relies on the forced autofire and keeps its ship at playfield x ≈ `BOT_X` (64).

- **Lane scan** (`scanLanes`, into a reused `LaneScan`): `LANES` = 12 lanes of `LANE_HEIGHT` 16 px;
  `SLOTS` = 20 time slots of `SLOT_TICKS` 2 over `BULLET_HORIZON` 40 ticks. Per lane two bit masks
  — `centre` (a threat near the lane's centre, where the ship settles) and `span` (anywhere in the
  lane, what a ship passing through meets) — from enemy bullets followed along their velocity
  (delays honoured), enemy bodies (ground enemies scroll past, fliers ride the camera), boss parts
  with hurtboxes near the ship's column, and lasers from 12 ticks before the beam grows until it
  fades; plus terrain danger per lane within `TERRAIN_AHEAD` 56 px and a `wall` flag for rock right
  at the ship.
- **Choice**: each lane's cost = terrain + the **trip** (every lane crossed, while the ship is in
  it, at its speed) + the **stay** (the destination's centre from arrival on, sooner threats
  weigh more) + distance + a pull towards the middle − preferences (a capsule ahead +40, the
  boss's core lane +60 and its neighbours +15, the next flying enemy ahead +12). A threat that
  hits the ship's current spot before it could leave does not penalise leaving (the M1-18 test
  round's fix — the bot used to freeze inside a beam). Hysteresis: the target lane changes only
  for a lane at least 20 cheaper.
- **Moves**: vertical first, one direction per tick; then left / right back to `BOT_X`.
- **Power-ups**: a one-tick `PowerUp` press when the meter's cursor is on Speed (up to
  `BOT_MAX_SPEED_LEVEL` 2 — a faster 4-way ship overshoots its lanes), Missile or Option and the
  slot can be equipped; never Double, Laser, the Force Field or Mega Crash.
- It reads the World only, so a run replays from its recorded input. One bot per run (it keeps its
  target lane and last press).

### The playtest tests

| File | What |
|---|---|
| `zone-a.test.ts` | God mode: the bot kills HB-01 and reaches `stageClear` in 3–6 minutes, never diagonal, x within ±4 of 64, the rules hold, and HB-01's last phase really overlaps two lanes. Without god mode: the run is recorded, `replayStage` reproduces its deaths and hash, the deaths are **printed, not asserted** (they measure the balance). With `stageSkip: 'boss'`: everything but the fight takes < 15 s |
| `zone-a-recovery.test.ts` | The recovery rule at runtime: restarted at each zone A checkpoint and played perfectly (every enemy killed on its first on-screen tick), the capsules dropped before the next source beyond 900 px are exactly the ≥ 3 sources of the window |
| `harness.test.ts`, `four-way-bot.test.ts`, `rules.test.ts` | The tooling itself: scripted bots, the tick limit, a terrain death to `gameOver` that replays; lane geometry, the danger scan, the decisions (including the two regressions), one-tick presses; the rules on hand-made lasers and bullets (merging, clipping, the off-playfield beam regression, the violation cap) |

At the time of writing the bot clears zone A in ≈ 210 s (HB-01 in ≈ 22 s) with no death, also
without god mode:

```sh
pnpm exec vitest run --project integration test/playtest/zone-a.test.ts --reporter=verbose
# [playtest] zone-a four-way (god mode): stageClear after 210.2 s, boss 21.7 s, 0 death(s), …
```

Headless, in your own test:

```ts
import { fourWayBot } from '../playtest/four-way-bot.js';
import { describeRun, replayStage, runStage } from '../playtest/harness.js';
import { createRuleWatch } from '../playtest/rules.js';

const rules = createRuleWatch();
const run = runStage('zone-a', fourWayBot(), { godMode: true, observe: rules.observe });
console.info(describeRun(run)); // zone-a four-way (god mode): stageClear after 210.2 s, …
rules.violations; // → []
replayStage('zone-a', run.inputs, { godMode: true }).hash === run.hash; // → true
```

## Running zone A

```sh
pnpm dev
# → http://localhost:5173              title → START → a difficulty → plays zone A
# → http://localhost:5173/?skip=boss   every game starts ~2 s before the WARNING
# → http://localhost:5173/?skip=boss&loadout=full   fight HB-01 fully powered
```

The e2e smoke `test/e2e/zone-a.spec.ts` (`pnpm test:e2e`) opens the web build with `?skip=boss`,
presses Enter twice and waits for the WARNING band's red edge rows and then HB-01's hull colour
in the right half of the playfield, with no console errors or atlas warnings.

## Extending it

| To add… | Do this |
|---|---|
| A zone | `content/stages/<id>.stage.json` + its `enemies` / `paths` files (formats in the content READMEs); `pnpm content:check` (the corridor check of `stage-runtime.test.ts` covers every stage with terrain, and every shipped stage plays to `stageClear`); fly it with `?stage=<id>`, reach its boss with `&skip=boss`; add a `runStage('<id>', fourWayBot(), { godMode: true, observe: rules.observe })` test beside `zone-a.test.ts`, and its own 4-way / capsule-budget checks to `content.test.ts` |
| Another default stage | `DEFAULT_STAGE_ID` in `@shmup/shell` (until the zone map of M2-10 picks stages) |
| A boss built on `boss.bulwark` | An `enemies` entry whose phases name it, with two or more `gun` parts (the lanes alternate between them in part order); keep the guns ≥ 16 px + beam width + 2 × hurt radius apart and the core between them if the lanes may overlap — the content test's geometry check shows how |
| A new rule for the 4-way checks | A pure function of the World in `rules.ts`, collected in `createRuleWatch`, with a hand-made test in `rules.test.ts` |
| A different playtester (8-way, a sloppy player) | Another `PlaytestBot` (`decide(world)` → mask); reuse `scanLanes`; the harness records and replays any bot |
| A skip target (a given x, a named section) | Build on `StageRunner.jumpTo` / `restartAt` like `skipToBoss` and `jumpToCheckpoint` do (M1-19) — cold code, call it at creation or from a `DebugCommand`, and fly the ships in again |

## Gotchas

| Symptom | Cause / fix |
|---|---|
| `?skip=boss` does nothing | Only the web build reads it (the TV has no query string); it must be exactly `boss`, lower case; a stage without a `warning` / `boss` event (open space, `test-range`) has nothing to skip to |
| A skipped session's hash differs from an unskipped one's | By design: `stageSkip` is sim-affecting (it lives in `GameConfig` and a replay carries it) |
| After `jumpTo` the enemies of the skipped part are missing | By design: events between the old and the new position never fire, and `clear()` empties the pools |
| `?scene=flight` flies in open space although the game plays zone A | The dev scenes keep open space unless `?stage=` names a stage — the gameplay e2e specs depend on it |
| A test that counts the shipped enemies of a timeline changed | The shipped content holds zone A's roster too since M1-18; scope such counts to the stage under test |
| The no-god-mode playtest reports deaths | They are reported, not asserted; a balance change that makes the bot die is worth a look, not a red build |
| A rule violation `lane gap …` after moving HB-01's parts | The lanes are attached to the emitters: their distance, the beam width and the ship's hurt radius decide the gap — see the geometry check in `content.test.ts` |
| The bot freezes or oscillates between two lanes | The hysteresis (20) and the trip / stay costs; the danger scan is tested lane by lane in `four-way-bot.test.ts` — add a case there first |
| A run on `{ difficulty: 'arcade' }` (the `zone-a-arcade` golden scenario) now starts with 2 lives | Since M2-01 `{ difficulty: 'arcade' }` is the whole preset (2 lives, 0 continues, the arcade penalty, rank from 6) |
| `runStage` throws `shipped content has issues` | The same validation as the shell's boot; run `pnpm content:check` to read the issues |

## Next steps that build on this page

- **M1-19** (done) — `createDebugControls(game)`: stage skip (to boss) and jump to the next
  checkpoint on `skipToBoss` / `jumpToNextCheckpoint`, god mode, frame advance, slow motion;
  golden replays `test/golden/zone-a-*.replay.json` recorded from the playtest bots (plus a
  careless `weaverBot` for the deaths); the M1 release check
  ([debug-and-replays.md](debug-and-replays.md)).
- **M2-01** (done) — rank growth, the `vane` revenge bullets from rank 12, the presets' lives and
  penalties in the Arcade scenarios; the golden replays re-blessed with the same outcomes
  ([difficulty-and-rank.md](difficulty-and-rank.md)).
- **M2-03** (done) — four more golden runs fight HALCYON BULWARK with the 4-way bot and the
  Types B–D weapons (`zone-a-type-b`, `-type-c`, `-type-d`, `zone-a-edit`); the Ripple's ring
  hitbox exists because its box could not get past HB-01's fringe armour; the weapon select plays
  in front of every zone A game (one more OK) ([meter-arsenal.md](meter-arsenal.md)).
- **M2-04** (done) — **zone A's content is unchanged**: its 4-way rules and bot budgets were tuned
  without Option Hunters, so none is placed here (they fly in the `hunter-range` dev stage; the
  zones of M2-11 … M2-14 place them). The new enemies file shifts zone A's enemy spec indices, so
  the golden replays were re-blessed (outcomes unchanged), and four more runs fly zone A with the
  Option types and meter shields (`zone-a-rotate`, `-reduce`, `-snake`, `-free-shield`)
  ([options-shields-hunter.md](options-shields-hunter.md)).
- **M2-05** (done) — **zone A's events are unchanged** (a `capsule` drop resolves to a planned
  colour item in Direct mode, so the 4-way rules and bot budgets hold for both ships); the stage
  only gained its `directItems` plan. The new content shifts sprite ids and enemy spec indices, so
  the golden replays were re-blessed (outcomes unchanged), and three runs fly zone A with the
  MANTA (`zone-a-manta`, `-manta-boss`, `-manta-deaths`); the ship select plays before every zone A
  game (one more OK) ([direct-mode.md](direct-mode.md)).
- **M2-10 / M2-11 … M2-14** — the zone map picks stages (replacing `DEFAULT_STAGE_ID`); the other
  zones, each with a playtest run and its own design-rule checks.
