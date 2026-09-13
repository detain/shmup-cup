/**
 * Allocation guard of the M2-02 pattern DSL, bending lasers and point items (plan §1.3 "zero
 * allocations in per-tick paths"), in its own file so the worker's V8 type feedback comes only from
 * these worlds: `pattern.loop` enemies fire rare volleys of bullets whose own programs run every
 * few ticks (timed turns, speed changes, sub-fires, vanish, param values), bending lasers are
 * re-fired as they end, and every 200 ticks the bullets are cancelled into point items that fly to
 * the score.
 * Coroutine resumes allocate their small result object (D29), so the emitters wake rarely.
 */
import { describe, expect, it } from 'vitest';
import { CancelMode, MAX_BENDING_LASERS, fireBendingLaser } from '../../src/bullets/index.js';
import { resolveGameConfig } from '../../src/config/index.js';
import { loadContent } from '../../src/data/index.js';
import { createInputSnapshot } from '../../src/input/index.js';
import { createWorld, stepWorld, type World } from '../../src/world/index.js';
import { measureHeapGrowth } from '../helpers/alloc.js';

const DB = (() => {
  const { db, issues } = loadContent([
    {
      path: 'patterns/a.patterns.json',
      data: {
        formatVersion: 1,
        kind: 'patterns',
        actions: [
          {
            id: 'volley',
            body: [
              {
                op: 'repeat',
                times: 40,
                body: [
                  {
                    op: 'fire',
                    direction: { type: 'absolute', value: '$i * 1024 / 40 + $rand * 8' },
                    speed: 0.3,
                    bulletRef: 'wiggle',
                  },
                ],
              },
              {
                op: 'repeat',
                times: 8,
                body: [{ op: 'actionRef', action: 'seed', params: ['$i * 0.05 + $rand * 0.01'] }],
              },
              { op: 'wait', ticks: 200 },
            ],
          },
          {
            // Param values: a local set by the actionRef, args handed to the bullet's runner.
            id: 'seed',
            body: [
              {
                op: 'fire',
                direction: { type: 'sequence', value: 128 },
                bulletRef: 'seeder',
                params: ['$1 + 0.2', '$rand * 4'],
              },
            ],
          },
        ],
        bullets: [
          {
            id: 'wiggle',
            kind: 'oval-pink',
            actions: [
              {
                op: 'repeat',
                times: 1e6,
                body: [
                  { op: 'changeDirection', direction: { type: 'sequence', value: 3 }, term: 4 },
                  { op: 'wait', ticks: 4 },
                  { op: 'changeDirection', direction: { type: 'sequence', value: -3 }, term: 4 },
                  {
                    op: 'changeSpeed',
                    speed: { type: 'relative', value: '0.01 * ($i % 2)' },
                    term: 3,
                  },
                  { op: 'wait', ticks: 5 },
                  { op: 'accel', accel: 0, min: 0.1, max: 1 },
                ],
              },
            ],
          },
          {
            id: 'seeder',
            kind: 'round-red',
            actions: [
              { op: 'changeSpeed', speed: '$1', term: 10 },
              { op: 'wait', ticks: '28 + $2' },
              {
                op: 'repeat',
                times: 2,
                body: [
                  {
                    op: 'fire',
                    direction: { type: 'relative', value: '$i * 512 + 256' },
                    speed: 0.4,
                  },
                ],
              },
              { op: 'vanish' },
            ],
          },
        ],
      },
    },
    {
      path: 'enemies/a.enemies.json',
      data: {
        formatVersion: 1,
        kind: 'enemies',
        enemies: [
          {
            id: 'emitter',
            hp: 1000,
            score: 0,
            hurtbox: { hw: 4, hh: 4 },
            script: 'pattern.loop',
            sprite: 'enemies/drifter',
            drop: null,
            settleTicks: 0,
            pattern: 'volley',
            params: { restTicks: 1 },
          },
        ],
      },
    },
  ]);
  expect(issues).toEqual([]);
  return db;
})();

/**
 * A free-flight World in god mode with two emitters, past the fly-in.
 *
 * @returns The World.
 */
function world(): World {
  const w = createWorld(resolveGameConfig({ seed: 9 }), DB);
  w.debugFlags.godMode = true;
  const input = createInputSnapshot();
  for (let i = 0; i < 45; i++) stepWorld(w, input);
  const emitter = DB.enemyIndex.get('emitter') ?? -1;
  expect(w.enemies.spawn(emitter, w.camera.x + 200, 70)).not.toBeNull();
  expect(w.enemies.spawn(emitter, w.camera.x + 260, 140)).not.toBeNull();
  return w;
}

describe('core/patterns M2-02 allocation', () => {
  it('runs DSL emitters, bullet programs, bending lasers and point items without allocating', () => {
    const w = world();
    const input = createInputSnapshot();
    const src = { slot: -1, x: 0, y: 0 };
    let programs = 0;
    let points = 0;
    const growth = measureHeapGrowth(
      (i) => {
        stepWorld(w, input);
        if (w.bullets.bending.count < MAX_BENDING_LASERS && (i & 15) === 0) {
          src.x = w.camera.x + 330;
          src.y = 20 + (i % 160);
          fireBendingLaser(w, src, 512, 2, 5, 60, 40, 6, 90);
        }
        if (i % 200 === 199) w.bullets.cancelAll(CancelMode.Points, 0);
        if (w.patterns.bulletPrograms > programs) programs = w.patterns.bulletPrograms;
        if (w.bullets.points.count > points) points = w.bullets.points.count;
        w.events.clear();
      },
      10_000,
      20_000,
    );
    expect(programs).toBeGreaterThan(60);
    expect(points).toBeGreaterThan(20);
    expect(w.scoring.board.scores[0].score).toBeGreaterThan(0);
    expect(growth.bytes).toBeLessThan(64 * 1024);
  }, 120_000);
});
