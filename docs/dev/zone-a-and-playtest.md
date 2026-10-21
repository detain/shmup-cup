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
bot) and decision **D17** (aimed shots ≤ 2.0 px/tick on Normal in v1 — since R2-02's port the rule
reads `2.0 · WORLD_SCALE`, 3.0 px/tick, and the content carries ported tunables).

## The picture at a glance

```text
content/stages/zone-a.stage.json ──┐          content/enemies/zone-a.enemies.json
  camera keys, checkpoints,        │            8 enemy types (M1 roster behaviours)
  heightfield terrain, parallax,   │            halcyon-bulwark (HB-01): parts + 3 phases
  58 events, warning @ 12,900      │                          │ phases run
                                   ▼                          ▼
                    loadContent ─► createWorld(config) ─► boss.bulwark (core/behaviors)
                                        │
          config.stageSkip === 'boss' ──┴─► skipToBoss(world)  (core/debug)
                                              └─► StageRunner.jumpTo(12,756) + fly-in again

apps/web  ?stage= › (scene flow) defaultStageId(files) = 'zone-a' ; ?skip=boss → stageSkip
apps/tizen   START → defaultStageId(files)                         ; no dev parameters

test/playtest/                                    pnpm content:check (content-zone-*.test.ts)
  runStage(stageId, bot, flags) ─► report          static: bulletSpeed tunables ≤ 3.0,
  fourWayBot() — 14 lanes × 24 px, one direction   sections, capsule budget, terrain
  rules.ts — createRuleWatch().observe             dynamic: HB-01 fight with the bot →
  replayStage(stageId, inputs, flags)              createRuleWatch — no bullet > 3.0,
                                                   no two lanes < 24 px apart
```

## The stage: AZURE VERGE

*The zone's own narrative — the at-a-glance diagram and the section table with its scroll x,
checkpoints, camera keys and warning x — reads the **ported** content: R2-02 carried every position
and speed ×1.5 (the file today holds length 13,500, checkpoints 0 / 5,250 / 9,000 and the WARNING at
12,900), and R2-03 re-derived this section from it with fresh bot runs. The frame-anchored numbers —
the planet band's y and spacing, the boss's home — were re-derived at R2-01's flip, not multiplied.
The machinery written around it — the 4-way rule numbers, the bot geometry, the skip lead, the
capsule budget below — reads at v2 numbers.*

`content/stages/zone-a.stage.json` — `id` `zone-a`, `name` `AZURE VERGE`, `length` 13,500,
`music` `{ stage: 'Stage', boss: 'Boss' }` (the M1-15 songs `zone-a` / `boss`; no new song was
written for M1-18). Just over 3 minutes of scrolling to the WARNING, ≈ 3.6 minutes to the stage
clear with the bot.

| Section | Scroll x | Camera key (px/tick) | Content |
|---|---|---|---|
| 1 — tutorial | 0–2,250 | 1.125 at 0 (ramp 60) | `skeet` popcorn formations (5–6, bonus 300 / 400), three `tender` capsule carriers, two `skeet-chain` sine chains (8, no drop); a low rolling floor 300–2,100 |
| 2 — fans and rammers | 2,250–5,250 | 1.2 at 2,250 | five `vane` fan formations on the `vane-*` paths (bonus 1,000; since M2-01 a `vane` shot down at rank ≥ 12 fires an aimed revenge bullet), `lancer` rammers in pairs (and a file of three, no drop), a 10-long chain, two carriers; open space |
| 3 — the corridor | 5,250–9,000 (checkpoint 5,250) | 0.9 at 5,250 (ramp 90) | floor **and** ceiling 5,160–9,600 (≥ 138 px open); `picket` floor turrets, `picket-ceiling` ceiling turrets, `strider` walkers, two `burrow` hatches with their mites, a vane swoop, popcorn, four carriers |
| 4 — high speed | 9,000–12,000 (checkpoint 9,000) | **2.25** at 9,000 (ramp 120) | four `gyre` orbiters on the `gyre-orbit-*` paths, two vane formations, a popcorn formation, a lancer pair, three carriers; a low floor 9,750–11,850 |
| 5 — the calm | 12,000–12,900 | 1.125 at 12,000 (ramp 120) | two carriers (`tender` at 12,180 / 12,480) and nothing else; open space |
| WARNING → boss | 12,900 (`warning` → `halcyon-bulwark`) | braked to a lock | the boss arena is open space; `end` at 13,500 after the kill |

**Capsule budget** (the recovery rule of `shmup_feat.md` §10): a *source* is a `spawn` of an
enemy with `drop: "capsule"` or a `formation` whose `drop` is not `null`. Zone A has 28 before the
boss, and 5 / 3 / 4 within 1,350 px after the checkpoints at 0 / 5,250 / 9,000 (the rule asks ≥ 3;
the window is `900 · WORLD_SCALE`, R2-02's port),
2 in the calm. The same sources serve the Direct-mode MANTA (M2-05): its ship has no meter, so
every `capsule` drop becomes the next colour item of the stage's **`directItems`** plan — 27
entries, eight each of red, green and blue plus an octagon, a yellow and an orange, cycling and
never rewound at a checkpoint ([direct-mode.md](direct-mode.md#drop-resolution-and-the-item-plan-corepowerups)).

**Terrain.** The heightfield generator of M1-07 on `terrain-a` (12-px tiles, 28 rows since
R2-02's port; 8-px, 25 rows in v1): three
segments — a low floor (base 30, amplitude 18), the corridor (floor base 60 ± 24, ceiling base
90 ± 24 measured from the map's top) and a low floor under the high-speed section (base 21 ± 12).
Ground enemies are only spawned inside the corridor (their spawn x + 600 lies before 9,600), so
they always have rock to stand on. The calm and the boss arena have no rock.

**Parallax.** The two star bands on `far` and `mid`, plus a new far **planet band**
`bg/azure-verge` (factor 0.125, y 264, spacing 192 — frame-anchored numbers re-derived at
R2-01's flip from the v1 band's y 152 / spacing 128) — the rim of a blue planet, from the new
procedural generator `scripts/assets/procedural/backdrops.mjs`. It is listed **last** on the `mid`
layer, so it is drawn over the mid stars and no star shows in front of the planet.

## The roster

`content/enemies/zone-a.enemies.json` — eight behaviours of the M1 roster (no new enemy behaviour
was needed), with zone A's own tunables. Two new pixel-map sprites (`enemies/vane`,
`enemies/gyre`); the others reuse the M1-03 art.

| Id | Behaviour | Sprite | HP | Score | Tunables / notes |
|---|---|---|---|---|---|
| `skeet` | `drifter.sine` | `enemies/drifter` | 1 | 100 | `speed` 1.65, `amp` 27, `period` 100 |
| `skeet-chain` | `drifter.sine` | `enemies/drifter` | 1 | 100 | `speed` 1.875, `amp` 42, `period` 120, `memberPhase` 48 (a travelling wave, an angle — never scaled); its formations have `drop: null` |
| `vane` | `fan.loop` | `enemies/vane` (new) | 1 | 100 | `speed` 2.4 on the formation's path |
| `tender` | `carrier.straight` | `enemies/carrier-red` | 3 | 200 | `speed` 1.05, `drop: "capsule"`, medium explosion |
| `lancer` | `rammer.aimed` | `enemies/darter` | 1 | 150 | enters straight at −1.875 px/tick for 70 ticks, `windup` 24, dash `speed` 3 |
| `picket`, `picket-ceiling` | `turret.floor` | `enemies/turret` | 3 | 300 | `ground` floor / ceiling, `fireTicks` 110, `bulletSpeed` 1.875 |
| `strider` | `walker.floor` | `enemies/hopper` | 2 | 200 | `speed` 0.9, `bulletSpeed` 1.875 |
| `burrow` | `hatch.spawner` | `enemies/hatch` | 8 | 500 | `interval` 90, `max` 4, `child` `burrow-mite`, large explosion |
| `burrow-mite` | `rammer.aimed` | `enemies/darter` | 1 | 50 | rises at (−0.75, −1.5) for 36 ticks, `windup` 14, dash `speed` 2.625 |
| `gyre` | `orbiter.loop` | `enemies/gyre` (new) | 4 | 400 | `speed` 2.1 on its path, a ring every `ringTicks` 150 at `bulletSpeed` 1.5 |

`content/paths/zone-a.paths.json`: `vane-arc-up` / `-down`, `vane-loop-up` / `-down`, `vane-swoop`,
`gyre-orbit-down` / `-up` (each `-up` / `-down` pair mirrors the other).

## The boss: HALCYON BULWARK (HB-01)

The `halcyon-bulwark` entry's `boss` section: code `HB-01`, display name `HALCYON BULWARK`, intro
150 ticks, tally **30,000**, home (514, 168) — 126 px left of the frame's right edge (v1's 84
through ×1.5, re-derived at R2-01's flip) and the centre of the 336-px playfield — a core
battleship (`shmup_feat.md` §13) in the right quarter of the playfield.

| Part | Parent, offset | HP | Rule | Score | Sprite |
|---|---|---|---|---|---|
| `hull` | origin, x +42 | — | `never` (armour) | — | `bosses/bulwark-hull` (new) |
| `wing-top`, `wing-bottom` | `hull`, x −9, y ∓34.5 | — | `never` | — | `bosses/bulwark-wing-top` / `-bottom` (new) |
| `emitter-top`, `emitter-bottom` (**guns**) | the wings, x −51, y ∓3 | — | `never` | — | `bosses/bulwark-emitter` (new, 2-frame glow) |
| `core` (**core**) | origin | 40 | `afterParts`: all four plates | 5,000 | `bosses/core` (M1-13) |
| `plate-1` … `plate-4` | origin, x −16.5 / −25.5 / −34.5 / −43.5 | 12 each | `always` | 500 each | `bosses/bulwark-plate` (new) |

The plates stand **in a row along the core's lane**, in front of it: shots meet the outer one
(`plate-4`) first, and the core is hittable only once all four are gone. The emitters are the
`gun`s — they fire the lanes and the spreads — and are armour, so the lanes cannot be shot off
(unlike TRIAL WARDEN's guns). Their lanes are 75 px apart (edge to edge 63 px with the 12-px beam —
v1's 50 / 42 with an 8-px beam, carried through the port), and the core's lane lies between them.

**Phases** — all three run `boss.bulwark`:

| Phase | Until | Params (over the defaults) | What the player sees |
|---|---|---|---|
| 0 | two plates destroyed | `trackSpeed` 0.525, `laserTicks` 110 | Lane lasers only, alternating top / bottom |
| 1 | all four plates destroyed | `trackSpeed` 0.675, `laserTicks` 100, `ways` 3, `fireTicks` 120, `firstLaser` 40 | + aimed 3-ways of purple needles at 2.25 px/tick from each emitter |
| 2 | the core's death | `trackSpeed` 0.825, `laserTicks` 55, `telegraph` 40, `active` 60, `ways` 3, `fireTicks` 90, `firstLaser` 30 | A lane every 55 ticks, each closed for 108 ticks (warning 40 + grow 8 + beam 60), so **both emitters' lanes overlap in time** — the gap between them stays ≥ 24 px (the phase values are R2-02's ported ones; v1 ran 0.35 / 0.45 / 0.55 at 1.5 px/tick and a 16 px gap) |

### `boss.bulwark`

Added to `DEFAULT_BOSS_BEHAVIOR_DEFS` (so it is in `BOSS_BEHAVIOR_IDS` and `KNOWN_SCRIPT_IDS`).
Tunables (defaults, world units in `v1 · WORLD_SCALE` form since R2-02): `trackSpeed` 0.35 · 3/2 =
0.525, `margin` 60, `laserTicks` 110, `firstLaser` 60, `laserLength` `PLAYFIELD_W` (640),
`laserWidth` 12, `telegraph` 45, `active` 50, `fireTicks` 120, `bulletSpeed` 2.25, `ways` 0,
`spread` 40 (binary angle units — not a length, never scaled).

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
| Aimed bullet speed ≤ 3.0 px/tick (Normal; `2.0 · WORLD_SCALE`) | `MAX_AIMED_BULLET_SPEED` | Statically: every `bulletSpeed` tunable of zone A's enemies and boss phases, behaviour defaults merged. Dynamically: `maxBulletSpeed(world)` — the fastest live enemy bullet (zone A fires nothing faster than its aimed shots, so every bullet is held to it) |
| No simultaneous laser lanes leaving < 24 px of safe gap (`16 · WORLD_SCALE`) | `MIN_LANE_GAP` | `laserLaneGaps(world)`: a **lane** is a laser in its telegraph, grow or active phase (a warned lane is as good as closed), its rows = the beam's vertical extent ± half its width, **widened by the ship's hurt radius** and clipped to the playfield (a beam wholly above or below it is no lane); overlapping or touching lanes merge. Reports the narrowest gap between separate lanes and the widest open band |
| The ship's column keeps ≥ 24 px open (`MIN_LANE_GAP`; half-width `COLUMN_HALF_WIDTH` 12 = `8 · WORLD_SCALE`) | `MIN_LANE_GAP`, `COLUMN_HALF_WIDTH` | `columnGap(world, player = 0)`: every live enemy bullet whose circle comes within 12 px of the ship's x closes its rows ± its radius and the hurt radius, every live laser lane its rows as above; the widest open band left must be ≥ 24 px. The laser-lane rule generalised to bullet walls — no pattern walls a remote player in. Measured on all 16 routes × both ships; v1 never saw it under 38 px, and R2-03's re-measurement of the ported world holds the rule on every playtest run ([release-hardening.md](release-hardening.md#the-ships-open-column-columngap)) |

**Rank (M2-01).** The rules are written for Normal's speeds. With rank growth on, a fully
powered ship raises the rank and so the bullet speeds; the static check reads the content's
Normal values and the dynamic checks of the playtest run the real rank — the 4-way bot's power
keeps Normal at rank ≤ 7, and every check passes unchanged. Zone A's only rank-dependent content
is the `vane` revenge bullet from rank 12, which the bot never reaches
([difficulty-and-rank.md](difficulty-and-rank.md#revenge-bullets)).

`createRuleWatch()` collects them over a run (`observe` is a bound function to pass as the
playtest's observer — or, since M2-18, as `CampaignFlags.observe` of the route runs): maxima, the
narrowest gap, the narrowest widest-open band while lanes were live, the narrowest open column
(`narrowestColumn`, M2-18) and the first 20 violations as `tick N: …` strings.

What `pnpm content:check` (`test/integration/content-zone-a.test.ts` — R5-P.P2a's split of the old
`content.test.ts` — "zone A holds to the 4-way design rules") asserts:

- the stage's shape (since R2-02 the test states these as v1 numbers mapped through `v1x` / `v1speed`
  helpers — the shape is v1's scaled): name, length 8,500–9,500 px → 12,750–14,250, checkpoints
  0 / 3,500 / 6,000 → 0 / 5,250 / 9,000, the 1.5 px/tick key at 6,000 → 2.25 at 9,000 and a slower
  one at 8,000 → 12,000, the WARNING at
  8,500–8,700 → 12,750–13,050 naming HB-01; HB-01's plates (4 × 12),
  core (40, `afterParts` of the plates), armoured hull and the two emitter guns; 6–8 behaviours;
- every section's archetypes (popcorn and carriers only in section 1, fans on paths and rammers in
  2, floor / ceiling turrets, walkers and hatches in 3, orbiters in 4, exactly two carriers in the
  calm), ground enemies only in the corridor, the songs and the planet band drawn last on `mid`;
- the terrain: ceiling only 3,400–6,500, floors where expected, no rock from 8,000 on;
- the capsule budget above; the scroll takes 2.5–4.5 minutes to the WARNING;
- every `bulletSpeed` tunable ≤ 3.0; HB-01's lane geometry per phase (the two lanes ≥ 24 px
  apart after widening, the core's lane between them, both on the playfield at the tracking
  limits, `trackSpeed` < 1);
- a whole HB-01 fight played by the bot (god mode, stage skip) through phases 0, 1, 2: no
  violation, bullets > 0 and ≤ 3.0, exactly two separate lanes at once in the last phase with
  ≥ 24 px between them;
- every zone A sprite has its atlas frames and white hit-flash frames.

### The per-zone contracts (R5-D2, R5-P.P6)

Each zone's shape bounds live in their own contract file, `test/integration/zones/zone-a.contract.ts`
… `zone-i.contract.ts` (shared machinery `helpers.ts`, suite `contract.test.ts`), and the per-zone
checks live in `content-zone-a.test.ts` … `content-zone-i.test.ts`. A `ZoneContract` carries two
bound sets and a **`remastered` flag**: `boundsOf()` and `contractPx()` pick the v1 branch while
`remastered` is false — **all nine zones ship `remastered: false` today**, because the ported
content is still v1's shape at ×1.5 — and the v2 branch once the zone's wave-09 remaster step
(R5-P.D-\*) flips the flag. Zone A's v1 branch is the list above: length 8,500–9,500 px through
`v1x`, checkpoints exactly 0 / 3,500 / 6,000, 6–8 behaviours (the one zone that bounds *behaviours*
rather than new types, in both branches). The v2 branch is the wave-5 design contract
(`plan_resolution.md` R5-D2) a remastered zone must meet:

| Bound | v2 value |
|---|---|
| length | 20,000–22,000 px |
| scroll to the WARNING | 3.75–5.25 min (225–315 s) |
| a full god-mode bot run | 4.0–6.0 min (240–360 s) |
| checkpoints | ≥ 5 |
| new enemy types per sprite | 6–8 |
| capsule sources before the WARNING | 18–48 |
| recovery | ≥ 3 sources within 1,350 px of every checkpoint |
| `directItems` | ≥ 30 (the R5-P.P6 floor; the zone lane adds its cap) |
| blue capsules | ≤ 2 |

## The debug stage skip

`GameConfig.stageSkip: 'none' | 'boss'` (type `StageSkip`, default `'none'`, validated by
`resolveGameConfig` — anything else is a `RangeError`). It is a **sim option**, so it lives in the
config and a replay records it. `createWorld` calls `skipToBoss(world)` (`core/debug`) after
queuing the stage theme when it is `'boss'`:

1. find the stage's **first** `warning` or `boss` event; none (or free flight) → `false`, nothing
   changes;
2. `runner.jumpTo(max(0, event.x − BOSS_SKIP_LEAD))` — `BOSS_SKIP_LEAD` is `96 · WORLD_SCALE`,
   144 px today, about two seconds of the calm's scroll before zone A's WARNING (lead and scroll
   speed both scaled ×1.5, so the tick count — the time — is unchanged);
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
The M1 vertical slice was one zone; since M2-10 zone A is also the **start zone of the campaign**
(`content/campaign/main.campaign.json`), so a game on it is a campaign run across the zone map —
the later zones come from the map, not from the host config
([campaign-and-bonus-stages.md](campaign-and-bonus-stages.md#campaign-run-or-single-stage-run)).

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
  `y`, `boss`, `livesLeft`) — since M2-11 the boss figures follow the stage's **main encounter**
  (the first slot with a boss of role `boss` in its fight or death), never a captain: zone B's
  mid-boss comes first and takes slot 0 —, score, pickups, equips per meter slot, `diagonalTicks`, the ship's x
  range, the recorded `inputs` (`Uint16Array`) and the final `hashWorld`.
- `replayStage(stageId, inputs, flags)` replays the recording in a fresh session with the same
  flags → `{ status, ticks, deathTicks, hash }`; equal to the run's because the sim is
  deterministic. M1-19's golden replays (`test/golden/`) are recorded from the same bots, through
  `core/replay` instead of the harness's `Uint16Array` recording.
- `describeRun(run)` → the one-line summary the tests print.

### `fourWayBot()` — the remote player

`four-way-bot.ts` has the Samsung remote's limits (`shmup_feat.md` §4 rule 2): it **never holds two
directions**, relies on the forced autofire and keeps its ship at playfield x ≈ `BOT_X` — since R2-02
that is `ENTER_END_X`, 96 px (v1's 64 · `WORLD_SCALE`, the end of the fly-in).
`fourWayBot(player = 0)` flies the given player slot (M2-06: the co-op golden replays fly player 2
with a second bot; `scanLanes(world, scan, player)` scans from that ship).

- **Lane scan** (`scanLanes`, into a reused `LaneScan`): `LANES` = `⌊PLAYFIELD_H / LANE_HEIGHT⌋` =
  14 lanes of `LANE_HEIGHT` `16 · WORLD_SCALE` = 24 px;
  `SLOTS` = 20 time slots of `SLOT_TICKS` 2 over `BULLET_HORIZON` 40 ticks. Per lane two bit masks
  — `centre` (a threat near the lane's centre, where the ship settles) and `span` (anywhere in the
  lane, what a ship passing through meets) — from enemy bullets followed along their velocity
  (delays honoured), enemy bodies (ground enemies scroll past, fliers ride the camera), boss parts
  with hurtboxes near the ship's column, and lasers from 12 ticks before the beam grows until it
  fades; plus terrain danger per lane within `TERRAIN_AHEAD` 84 px (`56 · WORLD_SCALE`) and a
  `wall` flag for rock right
  at the ship.
- **Choice**: each lane's cost = terrain + the **trip** (every lane crossed, while the ship is in
  it, at its speed) + the **stay** (the destination's centre from arrival on, sooner threats
  weigh more) + distance + a pull towards the middle − preferences (a capsule ahead +40, the
  boss's core lane +60 and its neighbours +15, the next flying enemy ahead +12). The boss it aims
  at is the first boss slot in its intro or fight (`mainBoss` — since M2-10; it used to read slot
  0 only and never found a double boss's survivor in slot 1). A threat that
  hits the ship's current spot before it could leave does not penalise leaving (the M1-18 test
  round's fix — the bot used to freeze inside a beam). Hysteresis: the target lane changes only
  for a lane at least 20 cheaper.
- **Moves**: vertical first, one direction per tick; then left / right back to `BOT_X`.
- **Power-ups**: a one-tick `PowerUp` press when the meter's cursor is on Speed (up to
  `BOT_MAX_SPEED_LEVEL` 2 — a faster 4-way ship overshoots its lanes), Missile or Option and the
  slot can be equipped; never Double, Laser, the Force Field or Mega Crash.
- It reads the World only, so a run replays from its recorded input. One bot per run (it keeps its
  target lane and last press).

### `remote-strict` — what the remote can really deliver (M3-02b)

`remote-strict.ts` turns the 2026-09-15 input-probe findings
([input-probe-results.md](input-probe-results.md)) into a filter and a checker, and
**`fourWayBot()` flies under it by default** (`fourWayBot({ remote: false })` gives the pre-M3-02b
bot). Being 4-way was never enough: the remote delivers **one key at a time**, so a button press
costs the player its movement.

| Rule (from a finding) | Constant |
|---|---|
| At most one key per tick — a wish for several keeps the lowest bit | `REMOTE_DIRECTIONS`, `REMOTE_BUTTONS` |
| A button press is a **tap with no direction**, 7–16 ticks (the model produces 10) | `REMOTE_TAP_MIN_TICKS` / `REMOTE_TAP_MAX_TICKS` / `REMOTE_TAP_TICKS` |
| The thumb needs empty ticks off the D-pad before a tap | `REMOTE_PRE_TAP_TICKS` (2) |
| A direction change costs an empty tick (the first key must come up) | `REMOTE_GAP_TICKS` (1) |
| Back / Play-Pause arrive **on release**: one tick, never held | `REMOTE_EDGE_ACTIONS`, `REMOTE_EDGE_TICKS` (1) |

`createRemoteStrictModel().filter(want)` maps a bot's wish for a tick onto what a remote player
could produce; `createRemoteStrictCheck()` reads a recorded run back and counts every tick that
breaks the model. `PlaytestBot.remoteStrict` opts a bot into the check and the harness reports
`PlaytestResult.remoteViolations` / `.remoteViolation` — a violation fails a run exactly as
`diagonalTicks` does.

**What it changed.** Every zone A–I, all 16 routes, the boss rush, the caravan zones and the
practice runs still clear under it, inside the M1-18 / M2 budgets and with the recovery rule
intact — **no zone content needed re-tuning**. What the stricter model exposed was the bot's own
play, and three bot changes fixed it (they move every golden, which is why they are recorded here):

- it waits for a lane that stays clear for `EQUIP_WINDOW_TICKS` (`REMOTE_PRE_TAP_TICKS +
  REMOTE_TAP_TICKS` = 12) before starting a PowerUp tap, with `EQUIP_PATIENCE_TICKS` (150) as the
  "take the risk anyway" deadline — a tap is now blind movement, so it must be spent in a calm lane;
- it prefers a boss core's lane much more strongly (`BOSS_CORE_BONUS` 160, was 60);
- **in god mode only** it lines up on the core's exact row instead of the lane centre. That is
  deliberate: the audit runs ask "does this boss go down at all", while a run that can die must
  keep dodging by lanes — the core's row is where aimed fire converges, and doing it always cost
  zones D / F / H their no-god-mode clears.

**One golden expectation changed:** `gimmick-range-god` no longer breaks a destructible brick —
under the remote model the bot flies the high branch and never fires into the terrain. Its
assertion is `destroyed === 0` now; the brick coverage stays with `gimmick-range-weaver` (≥ 5
broken) and the rollbacks of `gimmick-range-deaths`.

### The playtest tests

| File | What |
|---|---|
| `zone-a.test.ts` | God mode: the bot kills HB-01 and reaches `stageClear` in 3–6 minutes, never diagonal, x within ±4 of `BOT_X` (96), the rules hold, and HB-01's last phase really overlaps two lanes. Without god mode: the run is recorded, `replayStage` reproduces its deaths and hash, the deaths are **printed, not asserted** (they measure the balance). With `stageSkip: 'boss'`: everything but the fight takes < 15 s |
| `zone-a-recovery.test.ts` | The recovery rule at runtime: restarted at each zone A checkpoint and played perfectly (every enemy killed on its first on-screen tick), the capsules dropped before the next source beyond 1,350 px (`RECOVERY_WINDOW`, 900 · `WORLD_SCALE`) are exactly the ≥ 3 sources of the window — since M2-11 through the shared helper `recovery.ts` (`capsuleSources`, `perfectFrom`, `recoveryAt`) |
| `zone-b.test.ts`, `zone-c.test.ts`, `zone-bc-recovery.test.ts` (M2-11) | The same for BRINE NEBULA and DUNE EXPANSE: god-mode clears in 3–6 minutes with the boss's three phases (and zone B's captain), the rules on every tick, a reported no-god run; the recovery rule at all eight checkpoints ([zones-b-and-c.md](zones-b-and-c.md#playtests-the-recovery-rule-and-the-harness)) |
| `zone-d.test.ts`, `zone-e.test.ts`, `zone-de-recovery.test.ts` (M2-12) | The same for MAGMA DEEP (the camera reaching the caves, y 300) and TEMPEST RIDGE (the rear attackers): god-mode clears in 3–6 minutes (236.9 s and 228.5 s), the rules on every tick, a reported no-god run (no death in D's, one in E's); the recovery rule at all eight checkpoints — zone D's third restarts down in the caves ([zones-d-and-e.md](zones-d-and-e.md#playtests-and-the-recovery-rule)) |
| `zone-f.test.ts`, `zone-g.test.ts`, `zone-fg-recovery.test.ts` (M2-13) | The same for CELL VAULT (shots break tissue, the claws lunge) and PRISM LABYRINTH (the rush stacks cubes into the terrain): god-mode clears in 3–6 minutes (220.5 s and 240.4 s), the rules on every tick, a reported no-god run (F's loses all its lives, G's clears with two deaths); the recovery rule at all eight checkpoints ([zones-f-and-g.md](zones-f-and-g.md#playtests-and-the-recovery-rule)) |
| `campaign-routes-b.test.ts`, `campaign-routes-c.test.ts` (M2-10) | All 16 routes of the zone map flown in god mode with the campaign harness `campaign.ts` (`playRunZone`, `walkCampaignRoutes` — each zone a fresh World built as the scene flow builds it, the players carried): every zone cleared, the rank stage term = depth + 1, the score growing, an ending per route ([campaign-and-bonus-stages.md](campaign-and-bonus-stages.md#using-it-headlessly)) |
| `harness.test.ts`, `four-way-bot.test.ts`, `rules.test.ts` | The tooling itself: scripted bots, the tick limit, a terrain death to `gameOver` that replays; lane geometry, the danger scan, the decisions (including the two regressions), one-tick presses; the rules on hand-made lasers and bullets (merging, clipping, the off-playfield beam regression, the violation cap) |
| `remote-strict.test.ts`, `remote-strict-edge.test.ts` (M3-02b) | The model and its checker: one key a tick, the pre-tap gap, tap length, the direction-change gap, release-only actions, a recorded run counted back, and the harness reporting `remoteViolations` |

After the port (R2-02) and the re-measurement (R2-03) the bot clears zone A in 215.9 s (HB-01 in
27.4 s) with no death in god mode; without god mode the same remote bot now spends all three lives
in the corridor and the run ends at `gameOver` after 133.4 s — deaths are reported, not asserted:

```sh
pnpm exec vitest run --project integration test/playtest/zone-a.test.ts --reporter=verbose
# [playtest] zone-a four-way (remote) (god mode): stageClear after 215.9 s, boss 27.4 s, 0 death(s), …
```

Headless, in your own test:

```ts
import { fourWayBot } from '../playtest/four-way-bot.js';
import { describeRun, replayStage, runStage } from '../playtest/harness.js';
import { createRuleWatch } from '../playtest/rules.js';

const rules = createRuleWatch();
const run = runStage('zone-a', fourWayBot(), { godMode: true, observe: rules.observe });
console.info(describeRun(run)); // zone-a four-way (remote) (god mode): stageClear after 215.9 s, …
rules.violations; // → []
replayStage('zone-a', run.inputs, { godMode: true }).hash === run.hash; // → true
```

## R2-04: the openings at the new scale

**The finding, as R2-04.Z1/Z3 recorded it:** "R2-04.Z1/Z3 measured all 23 sections of zones A–C
and G–I (RT-Z13 N1 fix — the tables carry 3 + 4×5 = 23 rows); the ×1.5 port preserved every
section's opening time within a 1-tick firstSeen edge rounding (zone-A skeet volleys d 14→15
easier, zone-G/I rounding rows harder — RT-Z13 B1); no spawn-x or density retune was needed; the
wider field adds area, not lead time."

The measurement (the same model R2-04.Z2 used on D, E and F): per section, camera checkpoint to
checkpoint, the median ticks from an enemy row's first-visible tick to its first vertical turn —
v1 from the frozen `test/fixtures/v1-baseline/zone-<x>.baseline.json` rows (flying specs, event
rows, `turnTick ≥ 0`), v2 from `recordBaseline(scenario)` in memory on the live ported world —
plus a non-god `runStage(zone, fourWayBot(), { godMode: false })` death and hit count (hits on the
rising edge of `world.players[0].hits`). Both zone patches came out **empty** — six zones, no
section opens noticeably easier; "no spawn-x, no density change" is the honest proposal. The other
tables: zones B and C in [zones-b-and-c.md](zones-b-and-c.md#r2-04-the-openings-at-the-new-scale),
D and E in [zones-d-and-e.md](zones-d-and-e.md#r2-04-the-openings-at-the-new-scale), F (the one
retune) and G in [zones-f-and-g.md](zones-f-and-g.md#r2-04-the-openings-at-the-new-scale), H and I
in [zones-h-and-i.md](zones-h-and-i.md#r2-04-the-openings-at-the-new-scale).

**Zone A (AZURE VERGE)** — non-god: gameOver, 3 deaths (all bullet, section 2).

| sec | v2 x-range | v1 med (n) | v2 med (n) | Δ | deaths | hits | change |
|---|---|---|---|---|---|---|---|
| 0 | 0..5250 | 21.0 (61) | 26.5 (68) | +5.5 | 0 | 0 | none — artifact, see below |
| 1 | 5250..9000 | 15.0 (11) | 15.0 (9) | 0.0 | 0 | 0 | none |
| 2 | 9000..13500 | 40.0 (19) | 40.0 (15) | 0.0 | 3 | 3 | none |

Section 0's +5.5 is **not** a sim change: every `skeet-chain` and `vane` row carries the same
`turnTick − visibleTick` in both runs (dumped row-by-row: 21/15/10/4/−1/−7/47/42 per formation
member, identical); v2's recording simply observes 7 more rows long enough to sample their turn
(the god-mode bot's kill stream diverges at seed 1 after the port — the documented
bot-dependent/R2-02.T2b class). It is not a bucket-boundary effect either: re-bucketing by event
world-x gives the same 26.5. No spawn-x change fixes a kill-timing observation — proposing one
would slow the actual game on the strength of noise. RT-Z13 independently re-confirmed the
mechanism row by row (8 gained turn-samples, 1 lost = net +7, all bot-kill-window).

The one genuine delta class (RT-Z13 B1): the reviewer's paired re-read of all 81 zone-A flying
rows found 10 whose turn−visible delta itself differs — the `skeet` volleys of event e4 in
section 0 (×6, event x=840) and event e24 in section 1 (×4, event x=3640):

```
DELTA 4:0 skeet: v1 1149/1159/1173 (d=14) v2 1149/1158/1173 (d=15)   [sec 0, event x=840]
DELTA 4:1 skeet: v1 1165/1175/1189 (d=14) v2 1165/1174/1189 (d=15)
DELTA 4:2 skeet: v1 1181/1191/1205 (d=14) v2 1181/1190/1205 (d=15)
DELTA 4:3 skeet: v1 1197/1207/1221 (d=14) v2 1197/1206/1221 (d=15)
DELTA 4:4 skeet: v1 1213/1223/1237 (d=14) v2 1213/1222/1237 (d=15)
DELTA 4:5 skeet: v1 1229/1239/1253 (d=14) v2 1229/1238/1253 (d=15)
DELTA 24:1 skeet: v1 4767/4777/4791 (d=14) v2 4767/4776/4791 (d=15)  [sec 1, event x=3640]
DELTA 24:2 skeet: v1 4785/4795/4809 (d=14) v2 4785/4794/4809 (d=15)
DELTA 24:3 skeet: v1 4803/4813/4827 (d=14) v2 4803/4812/4827 (d=15)
DELTA 24:4 skeet: v1 4821/4831/4845 (d=14) v2 4821/4830/4845 (d=15)
```

`spawnTick` and `turnTick` are identical on every one of the 10; `visibleTick` is 1 tick EARLIER
in v2 — the deterministic 1.5×-hurtbox firstSeen rounding, the same physics class zone-G
`prism-lens` and zone-I `depth-mine` show on their side — and it moves the metric +1 tick
**easier** (more sight before the turn). The remaining 9 non-identical rows are the sec-2 gyre/vane
triples shifted +1 tick with EQUAL delta (camera timing, not delta-relevant). A 1-tick edge
rounding is not noticeably easier, moving an event x to chase it would be tuning to noise — the
patches stay empty and no proposal follows.

Why the openings did not widen (the physical story): the port already re-anchors every `R`-entry
spawn to the new right edge (`PLAYFIELD_W + 24` = 664, the trap's value — never re-multiplied) and
×1.5s both the traversal speeds and the player's shot speed, so an enemy crosses the extra
+11 %/+12 % of field in proportionally the same time and its first-turn tick relative to its
first-visible tick is tick-identical. The plan's worry is real in area but neutral in time.

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
| A zone | The full recipe is in [zones-b-and-c.md](zones-b-and-c.md#building-the-next-zone-m2-12--m2-14) (and what a taller map, a maze or rear attackers add to it in [zones-d-and-e.md](zones-d-and-e.md), regenerating walls, a cube rush, a `ground` bonus entrance or a boss with curling arms in [zones-f-and-g.md](zones-f-and-g.md)). In short: `content/stages/<id>.stage.json` + its `enemies` / `paths` files (formats in the content READMEs); `pnpm content:check` (the corridor check of `stage-runtime.test.ts` covers every stage with terrain, and every shipped stage plays to `stageClear`); fly it with `?stage=<id>`, reach its boss with `&skip=boss`; add a `runStage('<id>', fourWayBot(), { godMode: true, observe: rules.observe })` test beside `zone-a.test.ts`, and its own 4-way / capsule-budget checks in `test/integration/content-zone-<letter>.test.ts` with the shape bounds in `test/integration/zones/zone-<letter>.contract.ts` |
| Another default stage | `DEFAULT_STAGE_ID` in `@shmup/shell`; since M2-10 only a stage that is the campaign's `start` zone gives campaign runs (else the flow plays it as a single stage) |
| A boss built on `boss.bulwark` | An `enemies` entry whose phases name it, with two or more `gun` parts (the lanes alternate between them in part order); keep the guns ≥ 24 px + beam width + 2 × hurt radius apart and the core between them if the lanes may overlap — the content test's geometry check shows how |
| A new rule for the 4-way checks | A pure function of the World in `rules.ts`, collected in `createRuleWatch`, with a hand-made test in `rules.test.ts` |
| A different playtester (8-way, a sloppy player) | Another `PlaytestBot` (`decide(world)` → mask); reuse `scanLanes`; the harness records and replays any bot |
| A skip target (a given x, a named section) | Build on `StageRunner.jumpTo` / `restartAt` like `skipToBoss` and `jumpToCheckpoint` do (M1-19) — cold code, call it at creation or from a `DebugCommand`, and fly the ships in again |

## Gotchas

| Symptom | Cause / fix |
|---|---|
| `?skip=boss` does nothing | Only the web build reads it (the TV has no query string); it must be exactly `boss`, lower case; a stage without a `warning` / `boss` event (open space, `test-range`) has nothing to skip to |
| `?skip=boss` in zone H (IRON CITADEL) starts at the parade, not IRON SOVEREIGN | By design: the skip stops before the **first** `warning` or `boss` event — there the parade's first echo (as in zone B, before SPUME HERALD); the debug key 8 does the same ([zones-h-and-i.md](zones-h-and-i.md#gotchas)) |
| A skipped session's hash differs from an unskipped one's | By design: `stageSkip` is sim-affecting (it lives in `GameConfig` and a replay carries it) |
| After `jumpTo` the enemies of the skipped part are missing | By design: events between the old and the new position never fire, and `clear()` empties the pools |
| `?scene=flight` flies in open space although the game plays zone A | The dev scenes keep open space unless `?stage=` names a stage — the gameplay e2e specs depend on it |
| A test that counts the shipped enemies of a timeline changed | The shipped content holds zone A's roster too since M1-18; scope such counts to the stage under test |
| The no-god-mode playtest reports deaths | They are reported, not asserted; a balance change that makes the bot die is worth a look, not a red build |
| A rule violation `lane gap …` after moving HB-01's parts | The lanes are attached to the emitters: their distance, the beam width and the ship's hurt radius decide the gap — see the geometry check in `content-zone-a.test.ts` |
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
- **M2-06** (done) — **zone A's content is unchanged**; two co-op runs fly it with two ships
  (`zone-a-coop`: two 4-way bots, `zone-a-coop-deaths`: a weaving player 2 that dies and continues
  while player 1 plays on), and `fourWayBot(player)` flies either slot; the co-op drop scaling
  adds capsules while two ships play, so the capsule budget per checkpoint only grows
  ([coop.md](coop.md)).
- **M2-10** (done) — zone A is the campaign's start zone; the map picks the other stages (stub
  zones B–I on zone A's roster — loaded, corridor-checked and flown to their clear like every
  shipped stage; the zone-A-only design-rule suite does not cover them yet); the bot faces the first
  fighting boss slot; the route playtests fly all 16 routes
  ([campaign-and-bonus-stages.md](campaign-and-bonus-stages.md)).
- **M2-11** (done) — zones B and C, each with a playtest run, its own block of design-rule checks
  in `content.test.ts` and its recovery checkpoints; the harness reads the main encounter; the
  recovery rule moved into `recovery.ts` ([zones-b-and-c.md](zones-b-and-c.md)).
- **M2-12** (done) — zones D and E the same way; the content block became "zones B–E" (new types
  counted against every zone flown before, ground placement at the camera y, per-boss lane
  limits) and the corridor check measures the camera's rows ([zones-d-and-e.md](zones-d-and-e.md)).
  The bot's runs changed the content: gaps in every maze wall, no turrets or crawlers between the
  walls, a lower seahorse bob, a tougher bastion core
  ([zones-d-and-e.md](zones-d-and-e.md#balance-found-by-the-bot)).
- **M2-13** (done) — zones F and G the same way; the content block became "zones B–G" (the
  chasing cells' and the claws' speeds in the 2-px/tick check, a `ground`-window check for every
  shipped stage) ([zones-f-and-g.md](zones-f-and-g.md)). The bot's runs changed the content: fewer
  and slower turrets, lenses and spore sacs hovering at the right edge instead of drifting across
  the ship, a flatter start to zone G, crystal pillars for the cube rush to stack on
  ([zones-f-and-g.md](zones-f-and-g.md#balance-found-by-the-bot)).
- **M2-14** (done) — the final zones H and I, the same way (`zone-h.test.ts`, `zone-i.test.ts`,
  `zone-hi-recovery.test.ts`); the bot's runs turned IRON SOVEREIGN's shield wheel 45° off the core's
  lane, kept the ARK's turrets off the ship's column and the eels out of the undertow; zone I's
  content fight flies fully powered (a bare ship cannot beat the ARK's time limit); the 16 routes
  end in the real finales ([zones-h-and-i.md](zones-h-and-i.md#balance-found-by-the-bot)).
