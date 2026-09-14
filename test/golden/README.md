# test/golden — golden replays

Committed replays of zone A (AZURE VERGE) — and, since M2-07 / M2-08 / M2-09, of the
`gimmick-range`, `raster-range`, `captain-range`, `raid-range` and `twin-range` dev stages,
since M2-10 of `bonus-range` and `bonus-vault`, and since M2-11 of zones B and C (BRINE NEBULA,
DUNE EXPANSE) and zone B's bonus stage `brine-grotto` —
that pin down what the simulation does (plan M1-19, `shmup_feat.md` §24). Each `<scenario>.replay.json` is a `core/replay` document — the header (every
sim-affecting `GameConfig` field, the stage, god mode as `assisted`), every tick's input
(`held | pressed << 16` per player, run-length encoded, base64), a state hash every 600 ticks and
the final hash — plus the scenario's `description` and its `expected` outcome (status, ticks,
score, lives, death ticks, boss kill; for a co-op run also player 2's score, lives, death ticks and
continues).

| Scenario | Who plays | Covers |
|---|---|---|
| `zone-a-god` | 4-way playtest bot, god mode | the whole stage and HALCYON BULWARK to `stageClear` |
| `zone-a-arcade` | 4-way playtest bot | Arcade difficulty (rank 6) without god mode, to `stageClear` |
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
| `gimmick-range-god` | 4-way playtest bot, god mode | the M2-07 stage systems: a brick shot open, both moving blocks, the suction pod, the tentacle, the cube rush, the high branch |
| `gimmick-range-weaver` | a weaving pilot, god mode | the region trigger fired (the low branch), a dozen bricks broken |
| `gimmick-range-deaths` | a weaving pilot that never dodges | the Arcade penalty on the gimmick range: checkpoint restarts rolling the terrain back, `gameOver` |
| `raster-range-god` | 4-way playtest bot, god mode | the M2-08 raster-effect dev stage to `stageClear`; `golden.test.ts` also plays it back with the stage's `raster` / `cycles` stripped — every hash matches: they are presentation only |
| `captain-range-god` | 4-way playtest bot, god mode | the M2-09 captains: four mid-bosses fly in on the scrolling camera, the ram shot down, the stage runs to its `end` |
| `raid-range-god` | 4-way playtest bot, god mode, full loadout | IRON LEVIATHAN (M2-09): the WARNING, the raid's boss-relative camera path, its death and the camera's return, LEVIATHAN HEART revealed by the blast and shot down |
| `raid-range-escape` | 4-way playtest bot, god mode, no power-ups | the M2-09 boss timer: IRON LEVIATHAN escapes after its time limit — `EndingFlag.BossEscaped`, no heart, `stageClear` |
| `twin-range-god` | 4-way playtest bot, god mode, full loadout | the M2-09 double boss: the EMBER and FROST twins take turns, the survivor enrages, both shot down |
| `bonus-range-god` | 4-way playtest bot, god mode, full loadout | the M2-10 `ground` bonus entrance: the window's three turrets shot down, the entry recorded (the World plays on to the boss — the scene flow does the warp) |
| `bonus-range-digit` | 4-way playtest bot, god mode, no power-ups | the M2-10 `digit` bonus entrance: the turrets survive, the score's thousands digit is 0 when the last window closes |
| `bonus-vault-god` | 4-way playtest bot, god mode, full loadout | the M2-10 bonus stage: the vault carriers' 1,000-point bonus capsules and the 1UP collected, its `end` reached (no boss) |
| `zone-b-god` | 4-way playtest bot, god mode | BRINE NEBULA (M2-11) start to `stageClear`: the bubbles, the reef tunnel, SPUME HERALD, the riptide, GALVANIC MAW shot down |
| `zone-b-deaths` | a weaving pilot that never dodges | BRINE NEBULA under the Arcade penalty (M2-11 tests): deaths among the bubbles, checkpoint restarts, `gameOver` |
| `zone-c-god` | 4-way playtest bot, god mode | DUNE EXPANSE (M2-11) start to `stageClear`: the sand worms, the ceiling walkers, the sandstorm run, SANDGRAVE WIDOW shot down |
| `zone-c-bot` | 4-way playtest bot | DUNE EXPANSE without god mode (M2-11 tests): a death and a Classic respawn in place, SANDGRAVE WIDOW shot down, `stageClear` |
| `brine-grotto-god` | 4-way playtest bot, god mode, full loadout | PEARL GROTTO, zone B's hidden bonus stage (M2-11): the bonus capsules and the 1UP collected, its `end` reached (no boss) |

- `golden.test.ts` (part of `pnpm test`) plays every file back into a fresh session: every hash and
  the outcome must match. A failure means the simulation changed.
- `pnpm golden:update` re-records every scenario from its bot (`golden.ts`) and rewrites the files
  — only for an **intended** simulation change, with the reason in the commit message (plan §1.5:
  steps that change simulation behaviour re-bless in the same commit). Re-recording an unchanged
  simulation writes byte-identical files.
- The files are generated: never edit them by hand (Prettier skips them).

Guide (replay format, re-blessing, gotchas): [`docs/dev/debug-and-replays.md`](../../docs/dev/debug-and-replays.md#golden-replays-testgolden).
