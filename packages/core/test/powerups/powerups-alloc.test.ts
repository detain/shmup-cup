/**
 * Allocation guard of `core/powerups` and `core/shields` (plan M1-11; definition of done: zero
 * allocations per tick), in its own file so the worker's V8 type feedback comes only from these
 * worlds: the `'full'` loadout with Auto Power-Up on, capsules dropped next to the ship (magnet,
 * pickups, meter advances, auto equips), capsule carriers shot down (drops → items), bullets
 * fired at the ship (Force Field hits, i-frames, breaks and re-grants), PowerUp presses (equips
 * and denials) and a Mega Crash every few seconds.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BulletKind, spawnBullet } from '../../src/bullets/index.js';
import { resolveGameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { Action, commitPlayerInput, createInputSnapshot } from '../../src/input/index.js';
import { ItemKind, MeterSlot } from '../../src/powerups/index.js';
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
 * The KESTREL, Type A, the shipped tileset, a scriptless capsule carrier and a static stage with a
 * flat floor.
 *
 * @returns The DB.
 */
function db(): ContentDb {
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
              id: 'carrier',
              hp: 2,
              score: 100,
              hurtbox: { hw: 6, hh: 6 },
              script: 'test.idle',
              sprite: 'enemies/drifter',
              drop: 'capsule',
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
              segments: [{ from: 0, to: 3384, floor: { base: 24, amp: 0, period: 64, seed: 4 } }],
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
 * A fully powered world with Auto Power-Up, its ship alive in the middle of the view.
 *
 * @returns The world.
 */
function world(): World {
  const w = createWorld(
    resolveGameConfig({ stage: 't', loadout: 'full', autoPowerUp: true, seed: 11 }),
    db(),
  );
  const input = createInputSnapshot();
  while (w.players[0].state !== 'alive') stepWorld(w, input);
  return w;
}

describe('core/powerups allocation', () => {
  it('allocates nothing over ticks with pickups, equips, shield hits and Mega Crashes', () => {
    const w = world();
    const carrier = w.content.enemyIndex.get('carrier')!;
    const ship = w.players[0];
    const meter = w.powerups.meters[0];
    const input = createInputSnapshot();
    let t = 0;
    let pickups = 0;
    let shieldHits = 0;
    const growth = measureHeapGrowth(
      () => {
        // Weave up and down (the magnet and pickups follow the ship).
        let held = (t / 30) % 2 < 1 ? Action.Up : Action.Down;
        if (t % 40 === 0) held |= Action.PowerUp;
        if (t % 600 === 300) meter.cursor = MeterSlot.Mega;
        commitPlayerInput(input.players[0], held);
        const sx = Math.floor(ship.x) | 0;
        const sy = Math.floor(ship.y) | 0;
        if (t % 12 === 0) w.powerups.spawnItem(ItemKind.Capsule, sx + 20, sy + 3);
        if (t % 9 === 0) spawnBullet(w, sx, sy, 0, 0, BulletKind.RoundPink);
        if (t % 45 === 0) w.enemies.spawn(carrier, sx + 28, sy);
        // Bullets that get through kill the ship (M1-12): deaths and respawns are part of the
        // loop, but the game never ends.
        if (ship.lives < 3) ship.lives = 3;
        t++;
        stepWorld(w, input);
        pickups += w.powerups.outcomes.pickupCount;
        if (ship.shield.hitTick === w.tick - 1) shieldHits++;
        w.events.clear();
      },
      10_000,
      20_000,
    );
    expect(pickups).toBeGreaterThan(100);
    expect(shieldHits).toBeGreaterThan(10);
    expect(growth.bytes).toBeLessThan(64 * 1024);
  }, 120_000);
});
