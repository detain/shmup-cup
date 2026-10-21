# test/golden — golden replays

Committed replays of zone A (AZURE VERGE) — and, since M2-07 / M2-08 / M2-09, of the
`gimmick-range`, `raster-range`, `captain-range`, `raid-range` and `twin-range` dev stages,
since M2-10 of `bonus-range` and `bonus-vault`, since M2-11 of zones B and C (BRINE NEBULA,
DUNE EXPANSE) and zone B's bonus stage `brine-grotto`, since M2-12 of zones D and E (MAGMA
DEEP, TEMPEST RIDGE), since M2-13 of zones F and G (CELL VAULT, PRISM LABYRINTH) and zone G's
bonus stage `glimmer-cache`, since M2-14 of the final zones H and I (IRON CITADEL, ABYSSAL
THRONE), and since M2-16 zone A in the toggle and hold autofire modes —
that pin down what the simulation does (plan M1-19, `shmup_feat.md` §24). Each `<scenario>.replay.json` is a `core/replay` document — the header (every
sim-affecting `GameConfig` field, the stage, god mode as `assisted`, since M3-01 the `assists`
flags: 1 god mode, 2 the invincibility assist), every tick's input
(`held | pressed << 16` per player, run-length encoded, base64), a state hash every 600 ticks and
the final hash — plus the scenario's `description` and its `expected` outcome (status, ticks,
score, lives, death ticks, boss kill; for a co-op run also player 2's score, lives, death ticks and
continues).

| Scenario | Who plays | Covers |
|---|---|---|
| `zone-a-god` | 4-way playtest bot, god mode | the whole stage and HALCYON BULWARK to `stageClear` |
| `zone-a-arcade` | 4-way playtest bot | Arcade difficulty (rank 6) without god mode: two deaths, `gameOver` on the ported world (the v1 run cleared) |
| `zone-a-deaths` | a weaving pilot that never dodges | deaths, Classic respawns, `gameOver` |
| `zone-a-boss` | 4-way playtest bot | the stage skip to the boss, full loadout, Arcade penalty |
| `zone-a-type-b` | 4-way playtest bot | the boss with a full Type B loadout (M2-03): Ripple Laser, Spread Bomb blasts |
| `zone-a-edit` | 4-way playtest bot | the boss with a Weapon Edit (Twin Laser, 2-Way Missile, Free Way) and LIFE OPTION on `!` (M2-03) |
| `zone-a-type-c` | 4-way playtest bot | the boss with a full Type C loadout (M2-03): Cyclone Laser, 2-Way Missile, Vertical, SPEED DOWN on `!` |
| `zone-a-type-d` | 4-way playtest bot | the boss with a full Type D loadout (M2-03): Twin Laser, Photon Torpedo, Free Way, FULL BARRIER on `!` |
| `zone-a-rotate` | 4-way playtest bot | the boss with Rotate Options and the Rotate Shield (M2-04): orbiting Options, spinning pods |
| `zone-a-reduce` | 4-way playtest bot | the boss with Formation Options and Reduce (M2-04): the `>` of Options, the shrunken hurtbox |
| `zone-a-snake` | 4-way playtest bot | the whole stage with Snake Options and the front Shield (M2-04): the pulled chain, pods taking hits, a death |
| `zone-a-free-shield` | 4-way playtest bot | the whole stage at Arcade difficulty with the Free Shield (M2-04): a pod pair ahead taking hits, a death |
| `zone-a-manta` | 4-way playtest bot | the whole stage with the Direct-mode MANTA (M2-05): planned colour items from the carriers, the Arm, a family switch |
| `zone-a-manta-boss` | 4-way playtest bot | the boss with a fully powered MANTA (M2-05): level-8 discs and sub discs, the gold Hyper Arm |
| `zone-a-manta-deaths` | a weaving pilot that never dodges | the MANTA under the Arcade penalty (M2-05): Direct-mode deaths, checkpoint restarts, `gameOver` |
| `zone-a-coop` | two 4-way playtest bots (player 2 from its START at tick 300) | a co-op game (M2-06): the drop-in join, two ships sharing the capsules, the co-op drop scaling, to `stageClear` |
| `zone-a-coop-deaths` | the 4-way bot and a weaving player 2 (START at tick 120) | co-op deaths (M2-06): player 2 dies and continues with START while player 1 plays on |
| `gimmick-range-god` | 4-way playtest bot, god mode | the M2-07 stage systems: a brick shot open, both moving blocks, the suction pod, the tentacle, the cube rush, the trigger fired: low branch, 3 bricks |
| `gimmick-range-weaver` | a weaving pilot, god mode | the region trigger fired (the low branch), a dozen bricks broken |
| `gimmick-range-deaths` | a weaving pilot that never dodges | the Arcade penalty on the gimmick range: checkpoint restarts rolling the terrain back, `gameOver` |
| `raster-range-god` | 4-way playtest bot, god mode | the M2-08 raster-effect dev stage to `stageClear`; `golden.test.ts` also plays it back with the stage's `raster` / `cycles` stripped — every hash matches: they are presentation only |
| `captain-range-god` | 4-way playtest bot, god mode | the M2-09 captains: four mid-bosses fly in on the scrolling camera, the circler shot down in slot 1, the stage runs to its `end` with slot 0's captain still fighting |
| `raid-range-god` | 4-way playtest bot, god mode, full loadout | IRON LEVIATHAN (M2-09): the WARNING, the raid's boss-relative camera path, its death and the camera's return, LEVIATHAN HEART revealed by the blast and shot down |
| `raid-range-escape` | 4-way playtest bot, god mode, no power-ups | the M2-09 boss timer: IRON LEVIATHAN escapes after its time limit — `EndingFlag.BossEscaped`, no heart, `stageClear` |
| `twin-range-god` | 4-way playtest bot, god mode, full loadout | the M2-09 double boss: the EMBER and FROST twins take turns, the survivor enrages, both shot down |
| `bonus-range-god` | 4-way playtest bot, god mode, full loadout | the M2-10 `ground` bonus entrance: the window's three turrets shot down, the entry recorded (the World plays on to the boss — the scene flow does the warp) |
| `bonus-range-digit` | 4-way playtest bot, god mode, no power-ups | the M2-10 `digit` bonus entrance: the turrets survive, the score's thousands digit is 0 when the last window closes |
| `bonus-vault-god` | 4-way playtest bot, god mode, full loadout | the M2-10 bonus stage: the vault carriers' 1,000-point bonus capsules and the 1UP collected, its `end` reached (no boss) |
| `zone-b-god` | 4-way playtest bot, god mode | BRINE NEBULA (M2-11) start to `stageClear`: the bubbles, the reef tunnel, SPUME HERALD, the riptide, GALVANIC MAW shot down |
| `zone-b-deaths` | a weaving pilot that never dodges | BRINE NEBULA under the Arcade penalty (M2-11 tests): deaths among the bubbles, checkpoint restarts, `gameOver` |
| `zone-c-god` | 4-way playtest bot, god mode | DUNE EXPANSE (M2-11) start to `stageClear`: the sand worms, the ceiling walkers, the sandstorm run, SANDGRAVE WIDOW shot down |
| `zone-c-bot` | 4-way playtest bot | DUNE EXPANSE without god mode (M2-11 tests): three deaths, `gameOver` before SANDGRAVE WIDOW |
| `zone-d-god` | 4-way playtest bot, god mode | MAGMA DEEP (M2-12) start to `stageClear`: the erupting caldera fields, the dive into the caves, the brick maze, the lava river, CINDER BASTION shot down |
| `zone-d-bot` | 4-way playtest bot | MAGMA DEEP without god mode (M2-12 tests): the caves' floor reached (camera y 300) and held to the deathless clear, CINDER BASTION shot down, `stageClear` |
| `zone-d-boss` | 4-way playtest bot, full loadout | the stage skip into zone D's caves (M2-12 tests): CINDER BASTION under the Arcade penalty, its core shot through the turning shield arms |
| `zone-e-god` | 4-way playtest bot, god mode | TEMPEST RIDGE (M2-12) start to `stageClear`: the storm front, the ridge pass, the thunderheads, the gale run, kites and jumpers from behind, SQUALL STEED shot down |
| `zone-e-bot` | 4-way playtest bot | TEMPEST RIDGE without god mode (M2-12 tests): the rear attackers against a ship that can die, a death and a Classic respawn in place, SQUALL STEED shot down, `stageClear` |
| `brine-grotto-god` | 4-way playtest bot, god mode, full loadout | PEARL GROTTO, zone B's hidden bonus stage (M2-11): the bonus capsules and the 1UP collected, its `end` reached (no boss) |
| `zone-f-god` | 4-way playtest bot, god mode | CELL VAULT (M2-13) start to `stageClear`: the chasing and dividing cells, the regenerating tissue walls, the grabbing tentacles, the pulse run, MANTLE REGENT shot down |
| `zone-f-arcade` | 4-way playtest bot | CELL VAULT at Arcade difficulty without god mode (M2-13 tests): two deaths to the rank-scaled fire, tissue shot open, `gameOver` |
| `zone-f-deaths` | a weaving pilot that never dodges | CELL VAULT on Easy under the Arcade penalty (M2-13 tests): deaths in the membrane and at the first tissue walls, restarts back at the start only (the run never crosses the ported checkpoint 3,300), `gameOver` |
| `zone-f-boss` | 4-way playtest bot, full loadout | the stage skip to MANTLE REGENT (M2-13 tests) under the Arcade penalty: its three phases, the eye shot between the curls of its tentacles |
| `zone-g-god` | 4-way playtest bot, god mode | PRISM LABYRINTH (M2-13) start to `stageClear`: the prism field, the gallery, the crystal labyrinth, the cube rush stacking into its pillars, the refraction run, FACET MONARCH shot down |
| `zone-g-bot` | 4-way playtest bot | PRISM LABYRINTH without god mode (M2-13 tests): two deaths in the labyrinth before the cube rush, Classic respawns in place, FACET MONARCH shot down, `stageClear` |
| `zone-g-boss` | 4-way playtest bot, full loadout | the stage skip to FACET MONARCH (M2-13 tests) under the Arcade penalty: its crystals broken, the core behind them shot down through its three phases |
| `glimmer-cache-god` | 4-way playtest bot, god mode, full loadout | GLIMMER CACHE, zone G's hidden bonus stage (M2-13): the bonus capsules collected, the cube rush and its cube walls, its `end` reached (no boss) |
| `zone-h-god` | 4-way playtest bot, god mode | IRON CITADEL (M2-14) start to `stageClear`: the outer walls, the piston hall with its moving floors and laser emitters, the parade of four earlier bosses in reduced form, the core run, IRON SOVEREIGN shot down through its four phases |
| `zone-h-boss` | 4-way playtest bot, full loadout | the stage skip into zone H's parade hangar (M2-14 tests) under the Arcade penalty: the four echoes shot down before their time limits, the core run, IRON SOVEREIGN's four phases |
| `zone-h-arcade` | 4-way playtest bot | IRON CITADEL at Arcade difficulty without god mode (M2-14 tests): the rank-scaled fire survived through the piston hall and the parade, IRON SOVEREIGN shot down, `stageClear` |
| `zone-h-deaths` | a weaving pilot that never dodges | IRON CITADEL on Easy under the Arcade penalty (M2-14 tests): deaths at the outer walls, every restart back at the start, `gameOver` |
| `zone-i-god` | 4-way playtest bot, god mode | ABYSSAL THRONE (M2-14) start to `stageClear`: the descent, the trench's eels, the mine field, the undertow, the ABYSS ARK raid and THE HOLLOW KING its final blast reveals, both shot down |
| `zone-i-boss` | 4-way playtest bot, full loadout | the stage skip to the ABYSS ARK (M2-14 tests) under the Arcade penalty: the raid's two phases, THE HOLLOW KING's three |
| `zone-i-escape` | a weaving pilot, god mode, no power-ups | the stage skip to the ABYSS ARK (M2-14 tests): the ARK escapes after its 90-s time limit — `EndingFlag.BossEscaped` (the campaign's THE FLAGSHIP SLIPS AWAY), no king, `stageClear` |
| `zone-a-manta-toggle` | the 4-way bot tapping SHOT every 150 ticks, god mode, full loadout | the MANTA in the toggle autofire mode (M2-16 tests, `remoteMode: false`): its Direct-mode volleys switched off and on again by the taps (the switch hashed in that mode), HALCYON BULWARK shot down; `golden-autofire.test.ts` checks it desyncs under `always` |
| `zone-a-hold` | the 4-way bot holding SHOT / SUB in bursts, god mode, full loadout | the KESTREL in the hold autofire mode at the fastest rate (M2-16 tests, `remoteMode: false`): shots only while SHOT is held, HALCYON BULWARK shot down |
| `zone-a-loop2-god` | 4-way playtest bot, god mode | AZURE VERGE on loop 2 (M3-01): the stage's `remix` events, faster bullets, a revenge bullet from every kill, to `stageClear` |
| `zone-a-loop2-boss` | 4-way playtest bot, no power-ups | HALCYON BULWARK on loop 2 without god mode (M3-01): the loop-2 rank and bullets, the boss shot down |
| `zone-a-caravan` | 4-way playtest bot, god mode | the CARAVAN clock (M3-01, `timeLimit` 3600): time up after a minute — `stageClear` with the World's `timeUp` |
| `zone-a-extra` | 4-way playtest bot, god mode, full loadout | an Extra Edit arsenal (M3-01): Hawk Wind and the Spread Gun, HALCYON BULWARK shot down |
| `zone-a-recovery` | a weaving pilot that never dodges, full loadout | option recovery (M3-01): each death drops the Options it loses as items, `gameOver` |
| `zone-a-invincible` | a weaving pilot that never dodges, full loadout | the invincibility assist (M3-01): every hit ignored, the header's `assists` flag (2) instead of god mode, the boss shot down |
| `zone-a-extras` | the 4-way bot pressing SPECIAL every 90 ticks, god mode, full loadout | the M3-02 mechanic extras all on with the MANTA over the whole of AZURE VERGE: black-hole vortices thrown and discharged, bullets grazed, the death-bomb window armed, the authentic slowdown counting the load — no deaths, HALCYON BULWARK shot down, `stageClear` |

- `golden.test.ts` (part of `pnpm test`) plays every file back into a fresh session: every hash and
  the outcome must match. A failure means the simulation changed. Since R5-P.P3 the per-zone
  **outcome** checks stand beside it in `golden-zone-<letter>.test.ts` (A–I, one file per zone,
  each reading only its zone's recordings); `golden.test.ts` still plays every hash and keeps the
  dev-stage and extra-mode outcome blocks.
- `pnpm golden:update` re-records every scenario from its bot (`golden.ts`) and rewrites the files
  — only for an **intended** simulation change, with the reason in the commit message (plan §1.5:
  steps that change simulation behaviour re-bless in the same commit). Re-recording an unchanged
  simulation writes byte-identical files. `node scripts/golden-update.mjs --only zone-b,zone-c`
  (with pnpm: `pnpm golden:update -- --only zone-b,zone-c`) re-records only the listed stages'
  goldens **and** demos; every other recording is still verified, and an unknown or empty id fails
  (`0b166c4`). A zone LAND runs exactly this (`docs/v2-run/helpers/land-zone.sh`).
- The files are generated: never edit them by hand (Prettier skips them).
- **Stable content keys (R2-03.P1, `6ba1187`).** A state hash now mixes an FNV-1a key of the
  content id instead of its ordinal in the content tables (`spriteKeys` / `enemyKeys` / `pathKeys`
  / `patternKeys`, `docs/dev/debug-and-replays.md`), so a change to one zone's content re-blesses
  only that zone's goldens — the other zones' hashes stand. That is the pairing the LAND scope
  proof reads: a `--only zone-<letter>` re-bless must leave every other file byte-identical.
- **R2-03.G1 (`d4ba9e8`)** re-blessed every golden and re-recorded the attract demos on the ported
  640×360 world at replay format 2; the outcomes above are that era's (the v1-era rows that the
  port changed — a clear that became a `gameOver`, a different branch — say so in their text).
- **Attract demos (M2-15).** `demos.ts` records the attract loop's demos — the 4-way bot with god
  mode, 40 s of each zone from its start — into `content/demos/<id>.replay.json` (bundled content,
  kind `replay`); `demos.test.ts` plays each back through the attract playback
  (`createDemoPlayback`) with every hash, and `pnpm golden:update` re-records them with the golden
  replays.

## The v1 baseline (R2-02)

`v1-baseline.ts` (the scenarios, the meter, the file format), `v1-baseline-suite.ts` and the three
`v1-baseline*.test.ts` files record what every shipped stage does at **384×216** — not a hash, but
the numbers plan_resolution.md **R2-02** compares the ×1.5 port against: the tick of each timeline
event, camera key and checkpoint, every enemy's spawn, first on-screen tick and landing, the
bosses' WARNING / intro / fight / death, the run's length. 37 scenarios (every zone on loops 1 and 2,
the bonus stages, the dev ranges, the boss rush, the escape, the dimension), flown like the playtest
(the 4-way bot under the remote model, god mode), are committed as
[`test/fixtures/v1-baseline/<id>.baseline.json`](../fixtures/v1-baseline/README.md), which says how
each field maps to the 640×360 game.

- **Until R2-01** the tests re-run every scenario and require the committed file **byte for byte**
  (the scenarios that are a golden's run also end on that golden's tick count and hash). So an
  **intended** simulation change before R2-01 re-records the baseline in the same commit as
  `pnpm golden:update`, with the reason:
  `SHMUP_V1_BASELINE_UPDATE=1 pnpm exec vitest run --project integration test/golden/v1-baseline`.
  `pnpm golden:update` does not do it.
- **From R2-01 on** (`FRAME_W` 640) the files are the frozen v1 record: the re-runs are skipped
  and re-recording is refused. R2-02's comparison test reads them.

Guide (replay format, re-blessing, gotchas): [`docs/dev/debug-and-replays.md`](../../docs/dev/debug-and-replays.md#golden-replays-testgolden).
