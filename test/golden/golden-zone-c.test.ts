/**
 * Zone C's golden outcome checks (plan M2-11; split out of `golden.test.ts` by R5-P.P3): the
 * committed `zone-c-god` and `zone-c-bot` files. The file plays back (every state hash) stays in
 * `golden.test.ts`; this file reads only zone C's own goldens.
 *
 * Skipped while re-blessing (`SHMUP_GOLDEN_UPDATE=1`): `golden.test.ts` is rewriting the files.
 */
import { describe, expect, it } from 'vitest';
import { GOLDEN_UPDATE_ENV, readGolden } from './golden.js';

/** Whether this run re-blesses the files. */
const updating = process.env[GOLDEN_UPDATE_ENV] === '1';

describe.skipIf(updating)('golden replays — zone C (M2-11)', () => {
  it('covers zone C of M2-11: cleared in 3–6 minutes, its boss shot down', () => {
    const { file, replay } = readGolden('zone-c-god');
    expect(replay.header.stageId).toBe('zone-c');
    expect(file.expected).toMatchObject({
      status: 'stageClear',
      bossDefeated: true,
      deathTicks: [],
    });
    expect(file.expected.ticks / 60).toBeGreaterThanOrEqual(180);
    expect(file.expected.ticks / 60).toBeLessThanOrEqual(360);
  });

  it('covers zone C without god mode (M2-11 tests): the Classic run dies out before the boss', () => {
    // DUNE EXPANSE with the 4-way bot and no god mode: on the ported world the Classic run dies
    // out in the first half (v1 cleared with one death): three deaths, game over at 86 s,
    // SANDGRAVE WIDOW never reached.
    const bot = readGolden('zone-c-bot');
    expect(bot.replay.header.assisted).toBe(false);
    expect(bot.replay.header.config.deathPenalty).toBe('classic');
    expect(bot.file.expected).toMatchObject({ status: 'gameOver', bossDefeated: false, lives: 0 });
    expect(bot.file.expected.deathTicks).toEqual([3937, 4463, 5071]);
  });
});
