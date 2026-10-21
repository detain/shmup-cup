/**
 * Zone G's golden outcome checks (plan M2-13; split out of `golden.test.ts` by R5-P.P3): the
 * committed `zone-g-god`, `zone-g-bot` and `zone-g-boss` files and zone G's hidden bonus stage,
 * the cache — PRISM LABYRINTH clears with god mode, the 4-way bot dies twice and respawns in
 * place, and the skip fights FACET MONARCH. The file plays back (every state hash) stays in
 * `golden.test.ts`; this file reads only zone G's own goldens (`glimmer-cache-god` is a zone G
 * stage).
 *
 * Skipped while re-blessing (`SHMUP_GOLDEN_UPDATE=1`): `golden.test.ts` is rewriting the files.
 */
import { describe, expect, it } from 'vitest';
import { BONUS_CAPSULE_SCORE, BossState } from '@shmup/core';
import { shippedContent } from '../playtest/harness.js';
import { GOLDEN_UPDATE_ENV, playGolden, readGolden } from './golden.js';
import { v1x } from '../../packages/core/test/helpers/v1-port.js';

/** Whether this run re-blesses the files. */
const updating = process.env[GOLDEN_UPDATE_ENV] === '1';

describe.skipIf(updating)('golden replays — zone G (M2-13)', () => {
  it('covers zone G of M2-13: cleared in 3–6 minutes, its boss shot down, the cache', () => {
    const { file, replay } = readGolden('zone-g-god');
    expect(replay.header.stageId).toBe('zone-g');
    expect(replay.header.assisted).toBe(true);
    expect(file.expected).toMatchObject({
      status: 'stageClear',
      bossDefeated: true,
      deathTicks: [],
    });
    expect(file.expected.ticks / 60).toBeGreaterThanOrEqual(180);
    expect(file.expected.ticks / 60).toBeLessThanOrEqual(360);
    // Zone G's hidden bonus stage: the bonus capsules collected, no boss (the ported run does not
    // reach the 1UP).
    const cache = readGolden('glimmer-cache-god');
    const { world, outcome } = playGolden(cache.replay);
    expect(world.stage?.stage.type).toBe('bonus');
    expect(outcome).toMatchObject({ status: 'stageClear', bossDefeated: false, deathTicks: [] });
    // On the ported world the bot leaves the cache with its starting lives and no extend: the
    // 1UP item itself stays covered by `bonus-vault-god` (zone B's grotto by M2-11's).
    const p1 = world.scoring.board.scores[0];
    expect(outcome.lives).toBe(3);
    expect(p1.extendsEarned).toBe(0);
    expect(outcome.score).toBeGreaterThan(5 * BONUS_CAPSULE_SCORE);
  });

  it('covers zone G without god mode (M2-13 tests): deaths in place, the skip to FACET MONARCH', () => {
    // PRISM LABYRINTH with the 4-way bot and no god mode: on the ported world two deaths inside
    // the labyrinth — before the cube rush's checkpoint at v1x(4,600) (v1 died once in the rush) —
    // each Classic respawn in place (the camera scrolled on — no checkpoint restart), the clear.
    const bot = readGolden('zone-g-bot');
    expect(bot.replay.header.assisted).toBe(false);
    expect(bot.replay.header.config.deathPenalty).toBe('classic');
    expect(bot.file.expected).toMatchObject({ status: 'stageClear', bossDefeated: true });
    expect(bot.file.expected.deathTicks).toHaveLength(2);
    expect(bot.file.expected.ticks / 60).toBeGreaterThanOrEqual(180);
    expect(bot.file.expected.ticks / 60).toBeLessThanOrEqual(360);
    const death = bot.file.expected.deathTicks[0];
    let deathX = -1;
    let respawnX = -1;
    playGolden(bot.replay, undefined, (world) => {
      if (world.tick - 1 === death) deathX = world.camera.x;
      if (deathX >= 0 && respawnX < 0 && world.players[0].state === 'alive') {
        respawnX = world.camera.x;
      }
    });
    expect(deathX).toBeLessThan(v1x(4600)); // the cube rush's checkpoint — the death is earlier,
    // in the refraction labyrinth (recorded at camera x 4,116.7)
    expect(respawnX).toBeGreaterThan(deathX);
    // The stage skip to FACET MONARCH: the full loadout under the Arcade penalty, all three
    // phases fought, no death.
    const skip = readGolden('zone-g-boss');
    expect(skip.replay.header.config, 'zone-g-boss').toMatchObject({
      stageSkip: 'boss',
      loadout: 'full',
      deathPenalty: 'arcade',
    });
    expect(skip.file.expected, 'zone-g-boss').toMatchObject({
      status: 'stageClear',
      bossDefeated: true,
      deathTicks: [],
    });
    // A skip is a fraction of the whole zone: the denominator is the zone's own god-mode clear
    // (R5-P.P3: on `bc8e05d` the pair block divided by zone F's Arcade run instead).
    expect(skip.file.expected.ticks, 'zone-g-boss').toBeLessThan(
      readGolden('zone-g-god').file.expected.ticks / 4,
    );
    const phases = new Set<number>();
    const index = shippedContent().enemyIndex.get('facet-monarch');
    let first = Number.POSITIVE_INFINITY;
    playGolden(skip.replay, undefined, (world) => {
      first = Math.min(first, world.camera.x);
      const slot = world.bosses.boss;
      if (slot.state === BossState.Fight && slot.specIndex === index) phases.add(slot.phase);
    });
    expect([...phases].sort(), 'zone-g-boss').toEqual([0, 1, 2]);
    expect(first, 'zone-g-boss').toBeGreaterThan(v1x(9000)); // skipped to the WARNING — v1's
    // 9,000 at R2-02's ×1.5 (the recording lands at 13,807.1)
  });
});
