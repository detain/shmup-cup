/**
 * Zone B's golden outcome checks (plan M2-11; split out of `golden.test.ts` by R5-P.P3): the
 * committed `zone-b-god` and `zone-b-deaths` files and zone B's hidden bonus stage, the grotto.
 * The file plays back (every state hash) stays in `golden.test.ts`; this file reads only zone B's
 * own goldens (`brine-grotto-god` is a zone B stage).
 *
 * Skipped while re-blessing (`SHMUP_GOLDEN_UPDATE=1`): `golden.test.ts` is rewriting the files.
 */
import { describe, expect, it } from 'vitest';
import { BONUS_CAPSULE_SCORE } from '@shmup/core';
import { GOLDEN_UPDATE_ENV, playGolden, readGolden } from './golden.js';

/** Whether this run re-blesses the files. */
const updating = process.env[GOLDEN_UPDATE_ENV] === '1';

describe.skipIf(updating)('golden replays — zone B (M2-11)', () => {
  it('covers zone B of M2-11: cleared in 4–6 minutes, its boss shot down, the grotto', () => {
    const { file, replay } = readGolden('zone-b-god');
    expect(replay.header.stageId).toBe('zone-b');
    expect(file.expected).toMatchObject({
      status: 'stageClear',
      bossDefeated: true,
      deathTicks: [],
    });
    // The R5-02 stage (design §17's 4.0–6.0-minute window): the re-recorded golden must clear
    // 4 minutes on the 20,400-px route. Red until the zone's LAND re-blesses `zone-b-god`.
    expect(file.expected.ticks / 60).toBeGreaterThanOrEqual(240);
    expect(file.expected.ticks / 60).toBeLessThanOrEqual(360);
    // Zone B's hidden bonus stage: the bonus capsules and the 1UP collected, no boss.
    const grotto = readGolden('brine-grotto-god');
    const { world, outcome } = playGolden(grotto.replay);
    expect(world.stage?.stage.type).toBe('bonus');
    expect(outcome).toMatchObject({ status: 'stageClear', bossDefeated: false, deathTicks: [] });
    // The grotto's standing law since M2-11 on the v2 layout (R5-10): its 1UP at x 3,975 sits
    // in the third section's open mid lane, no threat near it, so the god run collects it on top
    // of any extends. The route is 5,400 px at a constant 1.5 px/tick — 3,600 ticks plus the
    // ramp — so the clear records inside 59–67 s.
    const p1 = world.scoring.board.scores[0];
    expect(outcome.lives - 3 - p1.extendsEarned).toBeGreaterThanOrEqual(1);
    expect(outcome.score).toBeGreaterThan(5 * BONUS_CAPSULE_SCORE);
    const grottoSeconds = grotto.file.expected.ticks / 60;
    expect(grottoSeconds).toBeGreaterThanOrEqual(59);
    expect(grottoSeconds).toBeLessThanOrEqual(67);
  });

  it('covers zone B without god mode (M2-11 tests): the Arcade-penalty deaths and restarts, game over', () => {
    // BRINE NEBULA under the Arcade penalty: every death restarts at a checkpoint, then game over.
    const deaths = readGolden('zone-b-deaths');
    expect(deaths.replay.header.assisted).toBe(false);
    expect(deaths.replay.header.config.deathPenalty).toBe('arcade');
    expect(deaths.file.expected).toMatchObject({
      status: 'gameOver',
      lives: 0,
      bossDefeated: false,
    });
    expect(deaths.file.expected.deathTicks).toHaveLength(3);
  });
});
