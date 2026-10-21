/**
 * Zone H's golden outcome checks (plan M2-14; split out of `golden.test.ts` by R5-P.P3): the
 * committed `zone-h-god`, `zone-h-boss`, `zone-h-arcade` and `zone-h-deaths` files — IRON
 * CITADEL clears with god mode and IRON SOVEREIGN falls in its last phase, the skip lands in
 * the parade and fights the four echoes and the sovereign's four phases, the Arcade run
 * survives to the clear, and the weaving pilot dies at the outer walls and restarts at the
 * start. The file plays back (every state hash) stays in `golden.test.ts`; this file reads only
 * zone H's own goldens.
 *
 * Skipped while re-blessing (`SHMUP_GOLDEN_UPDATE=1`): `golden.test.ts` is rewriting the files.
 */
import { describe, expect, it } from 'vitest';
import { BossState } from '@shmup/core';
import { follow, GOLDEN_UPDATE_ENV, playGolden, readGolden } from './golden.js';
import { v1x } from '../../packages/core/test/helpers/v1-port.js';

/** Whether this run re-blesses the files. */
const updating = process.env[GOLDEN_UPDATE_ENV] === '1';

describe.skipIf(updating)('golden replays — zone H (M2-14)', () => {
  it('covers zone H of M2-14: cleared in 3–6 minutes, IRON SOVEREIGN through its four phases', () => {
    const { file, replay } = readGolden('zone-h-god');
    expect(replay.header.stageId).toBe('zone-h');
    expect(replay.header.assisted).toBe(true);
    expect(file.expected).toMatchObject({
      status: 'stageClear',
      bossDefeated: true,
      deathTicks: [],
    });
    expect(file.expected.ticks / 60).toBeGreaterThanOrEqual(180);
    expect(file.expected.ticks / 60).toBeLessThanOrEqual(360);
    // IRON SOVEREIGN died in its last phase; the parade's four captains went before it.
    const citadel = playGolden(readGolden('zone-h-god').replay).world;
    const sovereign = citadel.bosses.slots.find(
      (b) => citadel.content.enemies[b.specIndex]?.id === 'iron-sovereign',
    );
    expect(sovereign?.state).toBe(BossState.Dead);
    expect(sovereign?.phase).toBe(3);
    expect(sovereign?.escaped).toBe(false);
  });

  it('covers zone H without god mode (M2-14 tests): the skip into the parade, Arcade rank, restarts', () => {
    // The skip into IRON CITADEL lands before the parade's first echo (the skip stops before a
    // `boss` event too): the four echoes of earlier bosses, each shot down before its time limit
    // (captains: no ending flag), the core run, then IRON SOVEREIGN through all four phases.
    const h = follow('zone-h-boss');
    expect(readGolden('zone-h-boss').replay.header.config).toMatchObject({
      stageSkip: 'boss',
      loadout: 'full',
      deathPenalty: 'arcade',
    });
    expect(h.outcome).toMatchObject({ status: 'stageClear', bossDefeated: true, deathTicks: [] });
    expect(h.first).toBeGreaterThan(v1x(4400)); // the parade hangar's checkpoint …
    expect(h.first).toBeLessThan(v1x(4520)); // … before BULWARK ECHO's `boss` event — the pair
    // moved ×1.5 with R2-02's port (v1 measured 4,400–4,520; the recording lands at 6,636.9)
    for (const echo of ['echo-bulwark', 'echo-maw', 'echo-bastion', 'echo-regent']) {
      expect(h.phases.has(echo + ':0'), echo).toBe(true);
      expect(h.last.get(echo), echo).toEqual({ state: BossState.Dead, escaped: false });
    }
    expect([...h.phases].filter((p) => p.startsWith('iron-sovereign:')).sort()).toEqual([
      'iron-sovereign:0',
      'iron-sovereign:1',
      'iron-sovereign:2',
      'iron-sovereign:3',
    ]);
    expect(h.world.endingFlags).toBe(0);
    // The skip takes far less than the whole zone.
    expect(h.outcome.ticks).toBeLessThan(readGolden('zone-h-god').file.expected.ticks);
    // IRON CITADEL at Arcade difficulty: the 4-way bot survives the rank-scaled fire to the clear.
    const arcade = readGolden('zone-h-arcade');
    expect(arcade.replay.header).toMatchObject({ assisted: false });
    expect(arcade.replay.header.config.difficulty).toBe('arcade');
    expect(arcade.file.expected).toMatchObject({
      status: 'stageClear',
      bossDefeated: true,
      deathTicks: [],
    });
    expect(arcade.file.expected.ticks / 60).toBeGreaterThanOrEqual(180);
    expect(arcade.file.expected.ticks / 60).toBeLessThanOrEqual(360);
    // The weaving pilot on Easy under the Arcade penalty: every death at the outer walls sends
    // it back to the start (it never reaches the piston hall's checkpoint), until the game is over.
    const deaths = readGolden('zone-h-deaths');
    expect(deaths.replay.header.config).toMatchObject({
      deathPenalty: 'arcade',
      difficulty: 'easy',
    });
    expect(deaths.file.expected).toMatchObject({
      status: 'gameOver',
      lives: 0,
      bossDefeated: false,
    });
    expect(deaths.file.expected.deathTicks.length).toBeGreaterThanOrEqual(4);
    const deathTicks = new Set(deaths.file.expected.deathTicks);
    const died: number[] = [];
    const back: number[] = [];
    let alive = true;
    playGolden(deaths.replay, undefined, (world) => {
      const ship = world.players[0];
      if (deathTicks.has(world.tick - 1)) died.push(world.camera.x);
      if (!alive && ship.state === 'alive') back.push(world.camera.x);
      alive = ship.state === 'alive';
    });
    expect(died).toHaveLength(deathTicks.size);
    expect(back).toHaveLength(died.length); // the start's fly-in, then one per restart but the last
    for (const x of died) expect(x).toBeLessThan(v1x(2200)); // every death short of the piston
    // hall's ported checkpoint (v1's 2,200 ×1.5 — the recorded deaths reach x 2,461.8 at most)
    for (const x of back) expect(x).toBeLessThan(60);
  });
});
