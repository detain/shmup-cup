/**
 * Zone D's golden outcome checks (plan M2-12; split out of `golden.test.ts` by R5-P.P3): the
 * committed `zone-d-god`, `zone-d-bot` and `zone-d-boss` files — MAGMA DEEP clears, dives its
 * two-step dive into the deep caves (design §4's 186 then 432), and the skip into them shot
 * CINDER BASTION down. The file plays back (every state hash) stays in `golden.test.ts`; this
 * file reads only zone D's own goldens.
 *
 * The outcome bands are the R5-04.S6 retarget to `designs/zone-d.md` §15, its god-run ceiling
 * widened to 420 s by decision R5-D13: the god run 240 to 420 s, the no-god run up to two
 * trench/river deaths in 180 to 380 s, the skip entering at
 * the zone boss's WARNING (R5-P.P14 — the captain has none) and every cave expectation at the
 * redesign's floor, 432 px.
 *
 * Skipped while re-blessing (`SHMUP_GOLDEN_UPDATE=1`): `golden.test.ts` is rewriting the files.
 */
import { describe, expect, it } from 'vitest';
import { GOLDEN_UPDATE_ENV, playGolden, readGolden } from './golden.js';

/** Whether this run re-blesses the files. */
const updating = process.env[GOLDEN_UPDATE_ENV] === '1';

describe.skipIf(updating)('golden replays — zone D (M2-12)', () => {
  it('covers zone D of M2-12: cleared in 4–7 minutes, its boss shot down, the dive into the deep caves', () => {
    const { file, replay } = readGolden('zone-d-god');
    expect(replay.header.stageId).toBe('zone-d');
    expect(replay.header.assisted).toBe(true);
    expect(file.expected).toMatchObject({
      status: 'stageClear',
      bossDefeated: true,
      deathTicks: [],
    });
    // Design §15 sized the god run at 240 to 360 s; decision R5-D13 widened the ceiling to
    // 420 s (the 4-to-7-minute window).
    expect(file.expected.ticks / 60).toBeGreaterThanOrEqual(240);
    expect(file.expected.ticks / 60).toBeLessThanOrEqual(420);
    // MAGMA DEEP's run went down into the deep caves: its World ends at the cave floor — the
    // design §4's second dive step (R5-04.S5a's redesigned dive replaces v1's single 300 px pan).
    const { world } = playGolden(readGolden('zone-d-god').replay);
    expect(world.camera.y).toBe(432);
    expect(world.stage?.stage.id).toBe('zone-d');
  });

  it('covers zone D without god mode (M2-12 tests): the deep caves, the skip into them', () => {
    // MAGMA DEEP with the 4-way bot and no god mode: design §15 accepts up to two trench or
    // river deaths on the remastered run (v1's recording died once at the cave floor) — the
    // camera dives to the 432 px cave floor and stays down there to the clear.
    const bot = readGolden('zone-d-bot');
    expect(bot.replay.header.assisted).toBe(false);
    expect(bot.replay.header.config.deathPenalty).toBe('classic');
    expect(bot.file.expected).toMatchObject({ status: 'stageClear', bossDefeated: true });
    expect(bot.file.expected.deathTicks.length).toBeLessThanOrEqual(2);
    expect(bot.file.expected.ticks / 60).toBeGreaterThanOrEqual(180);
    expect(bot.file.expected.ticks / 60).toBeLessThanOrEqual(380);
    let caveFloorY = 0;
    const cave = playGolden(bot.replay, undefined, (world) => {
      if (world.camera.y > caveFloorY) caveFloorY = world.camera.y;
    });
    expect(caveFloorY).toBe(432); // the dive reached the deep-cave floor …
    expect(cave.world.camera.y).toBe(432); // … and the run ended down there
    // The stage skip into the deep caves: it enters at the zone boss's WARNING at 20,400
    // (R5-P.P14 — the OBSIDIAN CLAW captain's `boss` event carries no warning), CINDER BASTION
    // shot down, no checkpoint restart needed.
    const skip = readGolden('zone-d-boss');
    expect(skip.replay.header.config).toMatchObject({
      stageSkip: 'boss',
      loadout: 'full',
      deathPenalty: 'arcade',
    });
    expect(skip.file.expected).toMatchObject({ status: 'stageClear', bossDefeated: true });
    expect(skip.file.expected.ticks).toBeLessThan(bot.file.expected.ticks / 4);
    let deepest = Number.POSITIVE_INFINITY;
    const skipped = playGolden(skip.replay, undefined, (world) => {
      deepest = Math.min(deepest, world.camera.y);
    });
    expect(deepest).toBe(432); // never above the deep caves — design §4's floor
    expect(skipped.world.stage?.stage.id).toBe('zone-d');
  });
});
