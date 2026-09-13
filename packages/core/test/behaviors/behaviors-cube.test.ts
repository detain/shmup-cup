/**
 * `cube.pincer` (plan M2-05, shmup_feat.md §6B "waves of six cubes — 3 from the top, 3 from the
 * bottom, converging; the last cube destroyed drops the item"): a formation of six from the direct
 * range's first wave — odd members mirrored across the middle row, each flying to its meeting
 * point beside the middle row, then leaving left — and the wave's item at its last kill, a capsule
 * for the meter, the planned colour item for the MANTA.
 */
import { describe, expect, it } from 'vitest';
import { PLAYFIELD_H } from '../../src/config/index.js';
import { DropKind, EnemyState, type Enemy } from '../../src/enemies/index.js';
import { createInputSnapshot } from '../../src/input/index.js';
import { ItemKind, directItemKind } from '../../src/powerups/index.js';
import { stepWorld, type World } from '../../src/world/index.js';
import { aliveWorld, directDb } from '../helpers/direct.js';

/** The shared content. */
const DB = directDb();

/**
 * The live cubes of a world.
 *
 * @param w - The world.
 * @returns They, by formation member.
 */
function cubes(w: World): Enemy[] {
  const cube = DB.enemyIndex.get('cube');
  return w.enemies.enemies
    .filter((e) => e.state === EnemyState.Live && e.specIndex === cube)
    .sort((a, b) => a.member - b.member);
}

/**
 * A world (autofire off) with the direct range's first pincer wave spawning.
 *
 * @param direct - Fly the MANTA (else the KESTREL).
 * @returns The world, after all six cubes spawned.
 */
function wave(direct: boolean): World {
  const w = aliveWorld(DB, {
    stage: 'direct-range',
    autofire: false,
    remoteMode: false,
    ...(direct ? {} : { shipId: 'kestrel', powerUpMode: 'meter' }),
  });
  const input = createInputSnapshot();
  for (let t = 0; t < 400 && cubes(w).length < 6; t++) stepWorld(w, input);
  return w;
}

describe('core/behaviors cube.pincer (M2-05)', () => {
  it('spawns three cubes from the top and three from the bottom that converge on the middle', () => {
    const w = wave(true);
    const all = cubes(w);
    expect(all).toHaveLength(6);
    const input = createInputSnapshot();
    const viewY = (e: Enemy): number => e.y - w.camera.y;
    const top = all.filter((e) => e.member % 2 === 0);
    const bottom = all.filter((e) => e.member % 2 === 1);
    expect(top).toHaveLength(3);
    for (const e of top) expect(viewY(e)).toBeLessThan(PLAYFIELD_H / 2);
    for (const e of bottom) expect(viewY(e)).toBeGreaterThan(PLAYFIELD_H / 2);
    // Mirror images: member 1 flies the reflection of member 0's line.
    for (let t = 0; t < 90; t++) stepWorld(w, input);
    const [a, b] = [all[0], all[1]];
    expect(Math.abs(viewY(a) - PLAYFIELD_H / 2)).toBeLessThan(40);
    expect(Math.abs(viewY(b) - PLAYFIELD_H / 2)).toBeLessThan(40);
    // Then they leave left, above / below the middle row.
    for (let t = 0; t < 200; t++) stepWorld(w, input);
    for (const e of cubes(w)) {
      expect(e.vx).toBeLessThan(0);
      const dy = viewY(e) - PLAYFIELD_H / 2;
      expect(Math.abs(Math.abs(dy) - 8)).toBeLessThan(1e-6);
    }
    expect(w.enemies.formations.drop[all[0].formation]).toBe(DropKind.PowerUp);
  });

  it('drops the wave`s item where the last cube dies: a capsule, or the planned colour', () => {
    for (const direct of [false, true]) {
      const w = wave(direct);
      const all = cubes(w);
      for (const e of all.slice(0, 5)) w.enemies.kill(e, 0);
      stepWorld(w, createInputSnapshot());
      expect(w.powerups.count).toBe(0);
      const last = all[5];
      const [x, y] = [last.x, last.y];
      w.enemies.kill(last, 0);
      stepWorld(w, createInputSnapshot());
      expect(w.powerups.count).toBe(1);
      const f = w.powerups.pool.fields;
      const plan = DB.stages[DB.stageIndex.get('direct-range') ?? -1].directItems;
      expect(f.kind[0]).toBe(direct ? directItemKind(plan[0]) : ItemKind.Capsule);
      expect(Math.abs(f.x[0] - x)).toBeLessThan(4);
      expect(Math.abs(f.y[0] - y)).toBeLessThan(4);
    }
  });
});
