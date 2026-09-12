/**
 * The golden-replay test (plan M1-19, part of `pnpm test`): every committed
 * `test/golden/<scenario>.replay.json` — zone A played by the 4-way bot and recorded with
 * `core/replay` (the 4-way bot, or a careless weaving pilot for the deaths) — plays back into a
 * fresh session with **every state hash** (one per 600 ticks and
 * the final one) and the recorded outcome (status, ticks, score, lives, death ticks, boss kill)
 * reproduced. A failure means the simulation changed: fix the change, or — when it is intended —
 * re-bless with `pnpm golden:update` and say why in the commit message.
 *
 * With `SHMUP_GOLDEN_UPDATE=1` (what `pnpm golden:update` sets) the test first re-records every
 * scenario from the bot and rewrites its file, then checks the new files the same way.
 */
import { describe, expect, it } from 'vitest';
import { REPLAY_HASH_INTERVAL } from '@shmup/core';
import {
  GOLDEN_BUILD_ID,
  GOLDEN_SCENARIOS,
  GOLDEN_UPDATE_ENV,
  playGolden,
  readGolden,
  recordGolden,
  writeGolden,
} from './golden.js';

/** Whether this run re-blesses the files. */
const updating = process.env[GOLDEN_UPDATE_ENV] === '1';

describe('golden replays (zone A, playtest bots)', () => {
  it.each(GOLDEN_SCENARIOS.map((scenario) => [scenario.name, scenario] as const))(
    '%s reproduces every state hash and its outcome',
    (_name, scenario) => {
      if (updating) {
        const { replay, outcome } = recordGolden(scenario);
        writeGolden(scenario, replay, outcome);
        console.info(
          `[golden] re-blessed ${scenario.name}: ${outcome.status} after ${outcome.ticks} ticks, ` +
            `${outcome.deathTicks.length} death(s), score ${outcome.score}`,
        );
      }
      const { file, replay } = readGolden(scenario.name);
      // The file is the scenario it claims to be.
      expect(file.description).toBe(scenario.description);
      expect(replay.header.buildId).toBe(GOLDEN_BUILD_ID);
      expect(replay.header.stageId).toBe(scenario.stageId);
      expect(replay.header.assisted).toBe(scenario.godMode);
      for (const [key, value] of Object.entries(scenario.config)) {
        expect(replay.header.config[key as keyof typeof replay.header.config], key).toEqual(value);
      }
      expect(replay.hashInterval).toBe(REPLAY_HASH_INTERVAL);
      expect(replay.ticks).toBe(file.expected.ticks);

      const { report, outcome } = playGolden(replay);
      expect(
        report,
        `desync at tick ${report.desyncTick}: the simulation changed — fix it, or re-bless with ` +
          '`pnpm golden:update` and say why in the commit message',
      ).toMatchObject({ ok: true, finished: true, buildMatches: true });
      expect(report.checked).toBe(replay.hashes.length + 1);
      expect(outcome).toEqual(file.expected);
    },
  );

  it('covers the whole stage, deaths to game over and the boss under the Arcade penalty', () => {
    const god = readGolden('zone-a-god').file.expected;
    expect(god.status).toBe('stageClear');
    expect(god.bossDefeated).toBe(true);
    expect(god.deathTicks).toEqual([]);
    expect(readGolden('zone-a-arcade').file.expected.status).toBe('stageClear');
    const deaths = readGolden('zone-a-deaths').file.expected;
    expect(deaths.status).toBe('gameOver');
    expect(deaths.deathTicks).toHaveLength(3);
    expect(deaths.lives).toBe(0);
    const boss = readGolden('zone-a-boss');
    expect(boss.replay.header.config.deathPenalty).toBe('arcade');
    expect(boss.replay.header.config.stageSkip).toBe('boss');
    // The skip starts right before the WARNING: the run is short.
    expect(boss.file.expected.ticks).toBeLessThan(god.ticks);
  });
});
