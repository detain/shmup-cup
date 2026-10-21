/**
 * Zone D's golden outcome checks (plan M2-12; split out of `golden.test.ts` by R5-P.P3): the
 * committed `zone-d-god`, `zone-d-bot` and `zone-d-boss` files — MAGMA DEEP clears, dives into
 * the caves, and the skip into the caves shot CINDER BASTION down. The file plays back (every
 * state hash) stays in `golden.test.ts`; this file reads only zone D's own goldens.
 *
 * Skipped while re-blessing (`SHMUP_GOLDEN_UPDATE=1`): `golden.test.ts` is rewriting the files.
 */
import { describe, expect, it } from 'vitest';
import { GOLDEN_UPDATE_ENV, playGolden, readGolden } from './golden.js';
import { v1rel } from '../../packages/core/test/helpers/v1-port.js';

/** Whether this run re-blesses the files. */
const updating = process.env[GOLDEN_UPDATE_ENV] === '1';

describe.skipIf(updating)('golden replays — zone D (M2-12)', () => {
  it('covers zone D of M2-12: cleared in 3–6 minutes, its boss shot down, the dive into the caves', () => {
    const { file, replay } = readGolden('zone-d-god');
    expect(replay.header.stageId).toBe('zone-d');
    expect(replay.header.assisted).toBe(true);
    expect(file.expected).toMatchObject({
      status: 'stageClear',
      bossDefeated: true,
      deathTicks: [],
    });
    expect(file.expected.ticks / 60).toBeGreaterThanOrEqual(180);
    expect(file.expected.ticks / 60).toBeLessThanOrEqual(360);
    // MAGMA DEEP's run went down into the caves: its World ends at the cave floor — v1's 200 px
    // down, moved by R2-02's ×1.5 world scale.
    const { world } = playGolden(readGolden('zone-d-god').replay);
    expect(world.camera.y).toBe(v1rel(200));
    expect(world.stage?.stage.id).toBe('zone-d');
  });

  it('covers zone D without god mode (M2-12 tests): the caves, the skip into them', () => {
    // MAGMA DEEP with the 4-way bot and no god mode: on the ported world it clears the caves
    // without ever dying (v1 died once at the cave floor) — the camera dives to the ported cave
    // floor, v1's 200 px at R2-02's ×1.5, and stays down there to the clear.
    const bot = readGolden('zone-d-bot');
    expect(bot.replay.header.assisted).toBe(false);
    expect(bot.replay.header.config.deathPenalty).toBe('classic');
    expect(bot.file.expected).toMatchObject({ status: 'stageClear', bossDefeated: true });
    expect(bot.file.expected.deathTicks).toEqual([]);
    expect(bot.file.expected.ticks / 60).toBeGreaterThanOrEqual(180);
    expect(bot.file.expected.ticks / 60).toBeLessThanOrEqual(360);
    let caveFloorY = 0;
    const cave = playGolden(bot.replay, undefined, (world) => {
      if (world.camera.y > caveFloorY) caveFloorY = world.camera.y;
    });
    expect(caveFloorY).toBe(v1rel(200)); // the dive reached the cave floor …
    expect(cave.world.camera.y).toBe(v1rel(200)); // … and the run ended down there
    // The stage skip into the caves: CINDER BASTION shot down, no checkpoint restart needed.
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
    expect(deepest).toBe(v1rel(200)); // never above the caves — v1's floor at R2-02's ×1.5
    expect(skipped.world.stage?.stage.id).toBe('zone-d');
  });
});
