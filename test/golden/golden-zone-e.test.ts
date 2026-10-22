/**
 * Zone E's golden outcome checks (plan M2-12; split out of `golden.test.ts` by R5-P.P3): the
 * committed `zone-e-god` and `zone-e-bot` files — TEMPEST RIDGE clears with god mode, and the
 * 4-way bot without it takes a death, respawns in place and still clears. The file plays back
 * (every state hash) stays in `golden.test.ts`; this file reads only zone E's own goldens.
 * R5-05.S6 retargeted the minute floors to the zone contract's 4–6-minute bot window
 * (design §2, decision R5-D2); the old recordings re-bless with the zone's LAND.
 *
 * Skipped while re-blessing (`SHMUP_GOLDEN_UPDATE=1`): `golden.test.ts` is rewriting the files.
 */
import { describe, expect, it } from 'vitest';
import { GOLDEN_UPDATE_ENV, readGolden } from './golden.js';

/** Whether this run re-blesses the files. */
const updating = process.env[GOLDEN_UPDATE_ENV] === '1';

describe.skipIf(updating)('golden replays — zone E (M2-12)', () => {
  it('covers zone E of M2-12: cleared in 4–6 minutes, its boss shot down', () => {
    const { file, replay } = readGolden('zone-e-god');
    expect(replay.header.stageId).toBe('zone-e');
    expect(replay.header.assisted).toBe(true);
    expect(file.expected).toMatchObject({
      status: 'stageClear',
      bossDefeated: true,
      deathTicks: [],
    });
    expect(file.expected.ticks / 60).toBeGreaterThanOrEqual(240);
    expect(file.expected.ticks / 60).toBeLessThanOrEqual(360);
  });

  it('covers zone E without god mode (M2-12 tests): a death, a respawn in place, the clear', () => {
    // TEMPEST RIDGE with the 4-way bot and no god mode: a death, a respawn in place, the clear.
    const ridge = readGolden('zone-e-bot');
    expect(ridge.replay.header.assisted).toBe(false);
    expect(ridge.file.expected).toMatchObject({ status: 'stageClear', bossDefeated: true });
    expect(ridge.file.expected.deathTicks.length).toBeGreaterThanOrEqual(1);
    expect(ridge.file.expected.lives).toBeGreaterThanOrEqual(1);
    expect(ridge.file.expected.ticks / 60).toBeGreaterThanOrEqual(240);
    expect(ridge.file.expected.ticks / 60).toBeLessThanOrEqual(360);
  });
});
