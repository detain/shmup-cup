# test/golden — golden replays

Committed replays of zone A (AZURE VERGE) that pin down what the simulation does (plan M1-19,
`shmup_feat.md` §24). Each `<scenario>.replay.json` is a `core/replay` document — the header (every
sim-affecting `GameConfig` field, the stage, god mode as `assisted`), every tick's input
(`held | pressed << 16` per player, run-length encoded, base64), a state hash every 600 ticks and
the final hash — plus the scenario's `description` and its `expected` outcome (status, ticks,
score, lives, death ticks, boss kill).

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

- `golden.test.ts` (part of `pnpm test`) plays every file back into a fresh session: every hash and
  the outcome must match. A failure means the simulation changed.
- `pnpm golden:update` re-records every scenario from its bot (`golden.ts`) and rewrites the files
  — only for an **intended** simulation change, with the reason in the commit message (plan §1.5:
  steps that change simulation behaviour re-bless in the same commit). Re-recording an unchanged
  simulation writes byte-identical files.
- The files are generated: never edit them by hand (Prettier skips them).

Guide (replay format, re-blessing, gotchas): [`docs/dev/debug-and-replays.md`](../../docs/dev/debug-and-replays.md#golden-replays-testgolden).
