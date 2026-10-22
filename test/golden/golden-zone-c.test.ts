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
  it('covers zone C of M2-11: cleared in 4–6 minutes, its boss shot down', () => {
    const { file, replay } = readGolden('zone-c-god');
    expect(replay.header.stageId).toBe('zone-c');
    expect(file.expected).toMatchObject({
      status: 'stageClear',
      bossDefeated: true,
      deathTicks: [],
    });
    // The R5-03 stage (wave-11 rule 3's 4.0–6.0-minute window, design §15's acceptance): the
    // re-recorded golden must clear 4 minutes on the 21,000-px route. Red until the zone's
    // LAND re-blesses `zone-c-god` (the committed file is the R2-03 port recording of the old
    // 14,400-px stage).
    expect(file.expected.ticks / 60).toBeGreaterThanOrEqual(240);
    expect(file.expected.ticks / 60).toBeLessThanOrEqual(360);
  });

  it('covers zone C without god mode (M2-11 tests): the Classic run dies out before the boss', () => {
    // DUNE EXPANSE with the 4-way bot and no god mode: on the R5-03 stage the Classic run dies
    // out in the dune and canyon fields — the death penalty is classic, three lives give
    // exactly three deaths and the game overs (R5-03.S6 measured: gameOver at 84.7 s, three
    // deaths between camera x 4,435 and 5,686 — past the 3,900 checkpoint line, design §15's
    // drift row — SANDGRAVE WIDOW never reached). The R2-03 port recording died the same three
    // times on the old stage.
    const bot = readGolden('zone-c-bot');
    expect(bot.replay.header.assisted).toBe(false);
    expect(bot.replay.header.config.deathPenalty).toBe('classic');
    expect(bot.file.expected).toMatchObject({ status: 'gameOver', bossDefeated: false, lives: 0 });
    expect(bot.file.expected.deathTicks).toHaveLength(3);
  });
});
