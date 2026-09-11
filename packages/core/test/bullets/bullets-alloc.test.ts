/**
 * Allocation guards of `core/bullets` (plan M1-09 acceptance: "allocation guard with 512 live
 * bullets"), in their own file so the worker's V8 type feedback comes only from these worlds:
 *
 * - 512 live bullets using every kind of motion (angular velocity, clamped acceleration, homing),
 *   16 lasers cycling through all four phases and re-fired as they end, and the player
 *   collision running every tick (hits rejected, so nothing is removed by it);
 * - churn: bullets dying every tick (off screen and on terrain) and new ones spawned in their
 *   place through the pattern primitives, i.e. the pool's deferred removals and slot copies.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BulletOrigin,
  MAX_ENEMY_BULLETS,
  MAX_ENEMY_LASERS,
  fireLaser,
} from '../../src/bullets/index.js';
import { resolveGameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { createInputSnapshot } from '../../src/input/index.js';
import { fireNWay, fireRing } from '../../src/patterns/index.js';
import { ENGINE_SPRITES, createWorld, stepWorld, type World } from '../../src/world/index.js';
import { measureHeapGrowth } from '../helpers/alloc.js';

/**
 * A shipped content file.
 *
 * @param path - Path below `content/`.
 * @returns The file.
 */
function shipped(path: string): ContentFile {
  return {
    path,
    data: JSON.parse(
      readFileSync(new URL('../../../../content/' + path, import.meta.url), 'utf8'),
    ) as unknown,
  };
}

/**
 * The KESTREL, the shipped tileset and a static stage with a flat 32-px floor.
 *
 * @returns The DB.
 */
function db(): ContentDb {
  const { db: content, issues } = loadContent(
    [
      shipped('player/kestrel.player.json'),
      shipped('tilesets/terrain-a.tileset.json'),
      {
        path: 'stages/t.stage.json',
        data: {
          formatVersion: 1,
          kind: 'stage',
          id: 't',
          name: 'T',
          music: { stage: 'Stage', boss: 'Boss' },
          length: 3000,
          camera: [{ x: 0, speed: 0 }],
          checkpoints: [{ x: 0 }],
          parallax: [],
          tilemap: {
            tileSize: 8,
            tileset: 'terrain-a',
            rowsTall: 25,
            generator: {
              type: 'heightfield',
              segments: [{ from: 0, to: 3384, floor: { base: 32, amp: 0, period: 64, seed: 1 } }],
            },
          },
          events: [],
        },
      },
    ],
    { extraSprites: ENGINE_SPRITES },
  );
  expect(issues).toEqual([]);
  return content;
}

/**
 * A world whose ship is alive, parked mid-view and invulnerable (collisions run, hits are
 * rejected).
 *
 * @param stage - Stage id or `null` (free flight).
 * @returns The world.
 */
function world(stage: string | null): World {
  const w = createWorld(resolveGameConfig({ stage, seed: 3 }), db());
  const input = createInputSnapshot();
  for (let i = 0; i < 60; i++) stepWorld(w, input);
  w.players[0].x = 192;
  w.players[0].y = 100;
  w.players[0].invulnTicks = 1e9;
  return w;
}

describe('core/bullets allocation', () => {
  it('allocates nothing over ticks with 512 live bullets, 16 lasers and the player collision', () => {
    const w = world(null);
    const b = w.bullets;
    for (let k = 0; k < MAX_ENEMY_BULLETS; k++) {
      const i = b.spawn(120 + (k % 32) * 5, 70 + (k >> 5) * 4, k * 7, 0.5 + (k % 5) * 0.1, k % 9);
      // Every kind of motion, all bounded so the bullets stay in the view.
      if (k % 4 === 0) b.setMotion(i, 0, 8 + (k % 3), 0, 16);
      else if (k % 4 === 1) b.setMotion(i, 0.01, 6, 0.25, 1.25);
      else if (k % 4 === 2) b.setHoming(i, 3, 1e9);
      else b.setMotion(i, -0.01, -7, 0.5, 1);
    }
    const at = { slot: -1, x: 350, y: 100 };
    const fire = (): void => {
      for (let k = b.lasers.count; k < MAX_ENEMY_LASERS; k++) {
        fireLaser(w, at, 400 + k * 16, 250, 20, 4, 30, 6, 4);
      }
    };
    fire();
    const input = createInputSnapshot();
    const growth = measureHeapGrowth(
      () => {
        stepWorld(w, input);
        fire();
        w.events.clear();
      },
      10_000,
      20_000,
    );
    expect(b.count).toBe(MAX_ENEMY_BULLETS);
    expect(w.players[0].hits).toBe(0);
    expect(growth.bytes).toBeLessThan(64 * 1024);
  }, 60_000);

  it('allocates nothing while bullets die every tick and are replaced (pool churn)', () => {
    const w = world('t');
    const b = w.bullets;
    // A resting core that never dies, so removals copy slots from the end of the pool.
    for (let k = 0; k < 400; k++) b.spawn(40 + (k % 40) * 8, 20 + (k >> 4) * 4, 0, 0, k % 9);
    const left = new BulletOrigin();
    left.x = 380;
    left.y = 60;
    const low = new BulletOrigin();
    low.x = 300;
    low.y = 150;
    const input = createInputSnapshot();
    let t = 0;
    const growth = measureHeapGrowth(
      () => {
        // Aimed 5-ways flying off screen, and rings whose lower half hits the floor.
        if (t % 3 === 0) fireNWay(b, left, 5, 40, 3, t % 9);
        if (t % 5 === 0) fireRing(b, low, 12, 2, (t + 4) % 9);
        t++;
        stepWorld(w, input);
        w.events.clear();
      },
      10_000,
      20_000,
    );
    expect(b.count).toBeGreaterThan(400);
    expect(b.count).toBeLessThan(MAX_ENEMY_BULLETS);
    expect(growth.bytes).toBeLessThan(64 * 1024);
  }, 60_000);
});
