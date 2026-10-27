/**
 * Zone F's golden outcome checks (plan M2-13; split out of `golden.test.ts` by R5-P.P3): the
 * committed `zone-f-god`, `zone-f-arcade`, `zone-f-deaths` and `zone-f-boss` files — CELL VAULT
 * shoots tissue open on the way, the Arcade run dies to the rank-scaled fire, the weaving pilot
 * restarts at the start under the Arcade penalty, and the skip fights MANTLE REGENT. The file
 * plays back (every state hash) stays in `golden.test.ts`; this file reads only zone F's own
 * goldens.
 *
 * Skipped while re-blessing (`SHMUP_GOLDEN_UPDATE=1`): `golden.test.ts` is rewriting the files.
 */
import { describe, expect, it } from 'vitest';
import { BossState } from '@shmup/core';
import { shippedContent } from '../playtest/harness.js';
import { GOLDEN_UPDATE_ENV, playGolden, readGolden } from './golden.js';
import { v1x } from '../../packages/core/test/helpers/v1-port.js';

/** Whether this run re-blesses the files. */
const updating = process.env[GOLDEN_UPDATE_ENV] === '1';

describe.skipIf(updating)('golden replays — zone F (M2-13)', () => {
  it('covers zone F of M2-13: cleared in 4–7 minutes, its boss shot down', () => {
    const { file, replay } = readGolden('zone-f-god');
    expect(replay.header.stageId).toBe('zone-f');
    expect(replay.header.assisted).toBe(true);
    expect(file.expected).toMatchObject({
      status: 'stageClear',
      bossDefeated: true,
      deathTicks: [],
    });
    // The v2 band: 4 to 7 minutes (design §2's 4 to 6, ceiling widened by decision R5-D13).
    // The LAND's `--only zone-f` re-bless raises the recording into the window (an intentional
    // red until then).
    expect(file.expected.ticks / 60).toBeGreaterThanOrEqual(240);
    expect(file.expected.ticks / 60).toBeLessThanOrEqual(420);
    // CELL VAULT's run shot tissue cells open on the way (breaks since the last restore).
    const vault = playGolden(readGolden('zone-f-god').replay);
    expect(vault.world.gimmicks.destructible?.destroyed ?? 0).toBeGreaterThan(0);
  });

  it('covers zone F without god mode (M2-13 tests): Arcade rank, restarts, the skip to MANTLE REGENT', () => {
    // CELL VAULT at Arcade difficulty: on the ported world the 4-way bot dies to the rank-scaled
    // fire before the clear (v1's survived): game over with its two recorded deaths — tissue
    // intact since the ease-in (w15-MOVE; see the note below). R2-04 Z2 thinned F's openings and de-overlapped section 1, so
    // the blessed run survived longer to its first death; R5-06's remaster moves the deaths with
    // the rebuilt stage — so, as in zone-b, zone-c and zone-e's outcome files, the assertion
    // pins the COUNT and the invariants above, never the tick list itself.
    const arcade = readGolden('zone-f-arcade');
    expect(arcade.replay.header.assisted).toBe(false);
    expect(arcade.replay.header.config.difficulty).toBe('arcade');
    expect(arcade.file.expected).toMatchObject({
      status: 'gameOver',
      bossDefeated: false,
      lives: 0,
    });
    expect(arcade.file.expected.deathTicks).toHaveLength(2);
    // w15-MOVE: the eased vertical routes the Arcade run past the tissue hall unbroken — even its
    // PEAK break count is 0 (the cell-breaking proof for the zone stays with the god run above).
    // The weaving pilot on Easy under the Arcade penalty: on the ported world every restart goes
    // back to the start — the run never passes the checkpoint at v1x(2,200) — never ahead of
    // where it died, until the game is over. It dies inside the outer walls with nothing shot
    // open (the terrain rollback itself stays covered by `gimmick-range-deaths`).
    const deaths = readGolden('zone-f-deaths');
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
    const died: { x: number; broken: number }[] = [];
    const back: { x: number; broken: number }[] = [];
    let alive = true;
    playGolden(deaths.replay, undefined, (world) => {
      const ship = world.players[0];
      const broken = world.gimmicks.destructible?.destroyed ?? 0;
      if (deathTicks.has(world.tick - 1)) died.push({ x: world.camera.x, broken });
      if (!alive && ship.state === 'alive') back.push({ x: world.camera.x, broken });
      alive = ship.state === 'alive';
    });
    expect(died).toHaveLength(deaths.file.expected.deathTicks.length);
    expect(back).toHaveLength(died.length); // the start's fly-in, then one per restart but the last
    const restarts = back.slice(1);
    for (let k = 0; k < restarts.length; k++) {
      // Back to the start (never ahead of where it died, the ship flying in for a few dozen
      // pixels of scroll), the terrain standing again as the checkpoint rolled it back.
      expect(restarts[k].x, `restart ${String(k)}`).toBeLessThan(60);
      expect(restarts[k].x, `restart ${String(k)}`).toBeLessThan(died[k].x + 100);
      expect(restarts[k].broken, `restart ${String(k)}`).toBe(0);
    }
    expect(restarts.length).toBeGreaterThanOrEqual(1);
    // The ported run never crosses the checkpoint at v1x(2,200): every death sits inside the
    // outer walls with nothing broken open (v1 died deeper, some deaths with tissue open).
    for (const d of died) {
      expect(d.x).toBeLessThan(v1x(2200));
      expect(d.broken).toBe(0);
    }
    // The stage skip to MANTLE REGENT: the full loadout under the Arcade penalty, all three
    // phases fought, no death.
    const skip = readGolden('zone-f-boss');
    expect(skip.replay.header.config, 'zone-f-boss').toMatchObject({
      stageSkip: 'boss',
      loadout: 'full',
      deathPenalty: 'arcade',
    });
    expect(skip.file.expected, 'zone-f-boss').toMatchObject({
      status: 'stageClear',
      bossDefeated: true,
      deathTicks: [],
    });
    // A skip is a fraction of the whole zone: the Arcade run died early on the ported world, so
    // the denominator is the zone's own god-mode clear (R5-P.P3: the per-zone file).
    expect(skip.file.expected.ticks, 'zone-f-boss').toBeLessThan(
      readGolden('zone-f-god').file.expected.ticks / 4,
    );
    const phases = new Set<number>();
    const index = shippedContent().enemyIndex.get('mantle-regent');
    let first = Number.POSITIVE_INFINITY;
    playGolden(skip.replay, undefined, (world) => {
      first = Math.min(first, world.camera.x);
      const slot = world.bosses.boss;
      if (slot.state === BossState.Fight && slot.specIndex === index) phases.add(slot.phase);
    });
    expect([...phases].sort(), 'zone-f-boss').toEqual([0, 1, 2]);
    expect(first, 'zone-f-boss').toBeGreaterThan(v1x(9000)); // skipped to the WARNING — v1's
    // 9,000 at R2-02's ×1.5 (the recording lands at 13,507.1)
  });
});
