/**
 * Allocation guard of `core/powerups` and `core/shields` in co-op (plan M1-11; definition of done:
 * zero allocations per tick), in its own file so the worker's V8 type feedback comes only from
 * these worlds: both players in play with Force Fields and Auto Power-Up, a scrolling camera
 * (fractional positions), capsules dropped between the ships (the magnet picks the nearer one,
 * pickup ties, capsules left behind and culled), bullets on both ships (shield hits, breaks and
 * re-grants on both), both players pressing PowerUp (equips, denials) and Mega Crashes armed by
 * both on the same tick.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BulletKind, spawnBullet } from '../../src/bullets/index.js';
import { resolveGameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { Action, commitPlayerInput, createInputSnapshot } from '../../src/input/index.js';
import { spawnPlayer } from '../../src/player/index.js';
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
 * The KESTREL, Type A, the shipped tileset, a scriptless capsule carrier and a stage scrolling at
 * 0.75 px/tick over a flat floor.
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
          length: 20000,
          camera: [{ x: 0, speed: 0.75 }],
          checkpoints: [{ x: 0 }],
          parallax: [],
          tilemap: {
            tileSize: 8,
            tileset: 'terrain-a',
            rowsTall: 25,
            generator: {
              type: 'heightfield',
              segments: [{ from: 0, to: 20384, floor: { base: 16, amp: 0, period: 64, seed: 4 } }],
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
 * Two fully powered players with Auto Power-Up, alive and invulnerable to nothing (their shields
 * take the bullets), one above the other.
 *
 * @returns The world.
 */
function world(): World {
  const w = createWorld(
    resolveGameConfig({ stage: 't', loadout: 'full', autoPowerUp: true, seed: 13 }),
    db(),
  );
  const p2 = w.players[1];
  p2.active = true;
  spawnPlayer(p2, w.camera);
  const input = createInputSnapshot();
  while (w.players[0].state !== 'alive' || p2.state !== 'alive') stepWorld(w, input);
  w.players[0].y = w.camera.y + 70;
  p2.y = w.camera.y + 120;
  return w;
}

describe('core/powerups allocation (co-op, scrolling)', () => {
  it('allocates nothing over co-op ticks with pickups, shields, presses and Mega Crashes', () => {
    const w = world();
    const carrier = w.content.enemyIndex.get('carrier')!;
    const [p1, p2] = w.players;
    const [m1, m2] = w.powerups.meters;
    const input = createInputSnapshot();
    let t = 0;
    let pickups = 0;
    let shieldHits = 0;
    const growth = measureHeapGrowth(
      () => {
        const up = (t / 40) % 2 < 1;
        let held1 = up ? Action.Up : Action.Down;
        let held2 = up ? Action.Down : Action.Up;
        if (t % 35 === 0) held1 |= Action.PowerUp;
        if (t % 45 === 0) held2 |= Action.PowerUp;
        if (t % 500 === 250) {
          m1.cursor = MeterSlot.Mega;
          m2.cursor = MeterSlot.Mega;
          held1 |= Action.PowerUp;
          held2 |= Action.PowerUp;
        }
        commitPlayerInput(input.players[0], held1);
        commitPlayerInput(input.players[1], held2);
        const x1 = Math.floor(p1.x) | 0;
        const y1 = Math.floor(p1.y) | 0;
        const x2 = Math.floor(p2.x) | 0;
        const y2 = Math.floor(p2.y) | 0;
        // Between the ships (the magnet picks one), behind them (left behind and culled).
        if (t % 10 === 0) w.powerups.spawnItem(ItemKind.Capsule, x1 + 6, (y1 + y2) >> 1);
        if (t % 25 === 0) w.powerups.spawnItem(ItemKind.Capsule, x1 - 40, y1);
        if (t % 11 === 0) spawnBullet(w, x1, y1, 0, 0, BulletKind.RoundPink);
        if (t % 13 === 0) spawnBullet(w, x2, y2, 0, 0, BulletKind.OvalRed);
        if (t % 60 === 0) w.enemies.spawn(carrier, x2 + 30, y2);
        t++;
        stepWorld(w, input);
        pickups += w.powerups.outcomes.pickupCount;
        if (p1.shield.hitTick === w.tick - 1) shieldHits++;
        if (p2.shield.hitTick === w.tick - 1) shieldHits++;
        w.events.clear();
      },
      10_000,
      20_000,
    );
    expect(pickups).toBeGreaterThan(100);
    expect(shieldHits).toBeGreaterThan(20);
    expect(p1.hits + p2.hits).toBeGreaterThan(0); // shields broke and bullets got through too
    expect(growth.bytes).toBeLessThan(64 * 1024);
  }, 120_000);
});
