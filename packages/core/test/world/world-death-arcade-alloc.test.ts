/**
 * Allocation guard of the `arcade` death penalty (plan M1-12; definition of done: zero allocations
 * per tick), in its own file so the worker's V8 type feedback comes only from this world: the
 * KESTREL on a scrolling stage with checkpoints and a timeline of spawn events is shot down again
 * and again — each respawn restarts the stage at its last checkpoint (`StageRunner.restartAt`:
 * the camera, the event cursor, the clear of every pool, the enemies, weapons, power-ups and score
 * counters) and the timeline after the checkpoint plays again, spawning its enemies anew. Lives
 * are topped up so the game never ends. The budget is the one every World guard uses.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BulletKind, spawnBullet } from '../../src/bullets/index.js';
import { resolveGameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { Action, commitPlayerInput, createInputSnapshot } from '../../src/input/index.js';
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
 * The KESTREL, Type A, a scriptless enemy and an open stage scrolling at 2 px/tick with
 * checkpoints every 200 px and a spawn event every 50 px (high above the ship's line).
 *
 * @returns The DB.
 */
function db(): ContentDb {
  const events: unknown[] = [];
  for (let x = 25; x < 2000; x += 50) {
    events.push({ x, type: 'spawn', enemy: 'target', y: 12 + (x % 3) * 4 });
  }
  const { db: content, issues } = loadContent(
    [
      shipped('player/kestrel.player.json'),
      shipped('weapons/type-a.weapons.json'),
      shipped('tilesets/terrain-a.tileset.json'),
      {
        path: 'enemies/t.enemies.json',
        data: {
          formatVersion: 1,
          kind: 'enemies',
          enemies: [
            {
              id: 'target',
              hp: 1000,
              score: 100,
              hurtbox: { hw: 4, hh: 4 },
              script: 'test.idle',
              sprite: 'enemies/drifter',
              drop: null,
            },
          ],
        },
      },
      {
        path: 'stages/t.stage.json',
        data: {
          formatVersion: 1,
          kind: 'stage',
          id: 't',
          name: 'T',
          music: { stage: 'Stage', boss: 'Boss' },
          length: 60000,
          camera: [{ x: 0, speed: 2 }],
          checkpoints: [0, 200, 400, 600, 800, 1000, 1200, 1400, 1600, 1800].map((x) => ({ x })),
          parallax: [],
          tilemap: {
            tileSize: 8,
            tileset: 'terrain-a',
            rowsTall: 25,
            rle: new Array<string>(25).fill(''),
          },
          events,
        },
      },
    ],
    { extraSprites: ENGINE_SPRITES },
  );
  expect(issues).toEqual([]);
  return content;
}

/**
 * A world with the `arcade` penalty, its ship alive.
 *
 * @returns The world.
 */
function world(): World {
  const w = createWorld(
    resolveGameConfig({ stage: 't', seed: 23, deathPenalty: 'arcade', loadout: 'full' }),
    db(),
  );
  const input = createInputSnapshot();
  while (w.players[0].state !== 'alive') stepWorld(w, input);
  return w;
}

describe('core/world allocation — arcade restarts (M1-12)', () => {
  it('allocates nothing over ticks with repeated deaths and checkpoint restarts', () => {
    const w = world();
    const ship = w.players[0];
    const input = createInputSnapshot();
    const stage = w.stage!;
    let t = 0;
    let restarts = 0;
    let maxX = 0;
    const growth = measureHeapGrowth(
      () => {
        commitPlayerInput(input.players[0], (t / 24) % 2 < 1 ? Action.Up : Action.Down);
        const sx = Math.floor(ship.x) | 0;
        const sy = Math.floor(ship.y) | 0;
        if (t % 11 === 0) spawnBullet(w, sx + 120, sy, 0, 0, BulletKind.RoundPink);
        if (t % 173 === 0) spawnBullet(w, sx, sy, 0, 0, BulletKind.OvalRed);
        if (ship.lives < 3) ship.lives = 3;
        const before = ship.state;
        t++;
        stepWorld(w, input);
        if (before === 'dead' && ship.state === 'respawning') restarts++;
        if (w.camera.x > maxX) maxX = w.camera.x;
        w.events.clear();
      },
      10_000,
      20_000,
    );
    expect(restarts).toBeGreaterThan(20);
    expect(stage.checkpoint).toBeGreaterThan(0);
    expect(maxX).toBeGreaterThan(400);
    expect(w.status).toBe('playing');
    expect(growth.bytes).toBeLessThan(64 * 1024);
  }, 120_000);
});
