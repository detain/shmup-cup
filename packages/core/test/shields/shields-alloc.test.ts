/**
 * Allocation guard of the M2-04 shields and Option types (definition of done: zero allocations per
 * tick), in its own file so the worker's V8 type feedback comes only from these worlds: a `'full'`
 * loadout flying Rotate Options with a Rotate Shield (pods placed, spun and drawn every tick,
 * bullets stopped by the pods and reaching the ship), PowerUp held (the orbit extends) and Special
 * pressed (toggles), `?` re-granted when the pods break; then the same with Reduce (the scaled hurt
 * circle in every collision test) and Formation Options, Snake Options with the Free Shield, and
 * freed Options drifting (blue capsules and free-Option items picked up).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BulletKind, spawnBullet } from '../../src/bullets/index.js';
import { resolveGameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { Action, commitPlayerInput, createInputSnapshot } from '../../src/input/index.js';
import { ItemKind, MeterSlot } from '../../src/powerups/index.js';
import type { OptionChoice, ShieldChoice } from '../../src/config/index.js';
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
 * A fully powered world with the given `?` shield and Option type, its ship alive in the middle of
 * the view.
 *
 * @param db - The content.
 * @param shieldChoice - The `?` shield.
 * @param optionChoice - The Option type.
 * @returns The world.
 */
function world(db: ContentDb, shieldChoice: ShieldChoice, optionChoice: OptionChoice): World {
  const w = createWorld(
    resolveGameConfig({ stage: 't', loadout: 'full', shieldChoice, optionChoice, seed: 13 }),
    db,
  );
  const input = createInputSnapshot();
  while (w.players[0].state !== 'alive') stepWorld(w, input);
  return w;
}

describe('M2-04 shields and Option types allocation', () => {
  it('allocates nothing over ticks with pods, Reduce, the Option types and freed Options', () => {
    const content = db();
    const worlds = [
      world(content, 'rotateShield', 'rotate'),
      world(content, 'reduce', 'formation'),
      world(content, 'freeShield', 'snake'),
    ];
    const input = createInputSnapshot();
    let t = 0;
    let podHits = 0;
    const growth = measureHeapGrowth(
      () => {
        let held = (t / 30) % 2 < 1 ? Action.Up : Action.Down;
        if (t % 90 < 40) held |= Action.PowerUp;
        if (t % 70 === 0) held |= Action.Special;
        commitPlayerInput(input.players[0], held);
        for (let k = 0; k < 3; k++) {
          const w = worlds[k];
          const ship = w.players[0];
          const shield = ship.shield;
          const sx = Math.floor(ship.x) | 0;
          const sy = Math.floor(ship.y) | 0;
          if (t % 7 === 0) spawnBullet(w, sx + 12, sy + (t % 9) - 4, 0, 0, BulletKind.RoundPink);
          if (t % 11 === 0) spawnBullet(w, sx, sy, 0, 0, BulletKind.RoundPink);
          if (t % 150 === 0) w.powerups.spawnItem(ItemKind.FreeOption, sx + 30, sy);
          if (t % 450 === 0) w.powerups.spawnItem(ItemKind.BlueCapsule, sx + 18, sy);
          if (shield.hits <= 0) {
            w.powerups.meters[0].cursor = MeterSlot.Shield;
            w.powerups.equipHighlighted(0);
          }
          if (w.weapons.loadouts[0].options < 2) w.weapons.loadouts[0].options = 4;
          if (ship.lives < 3) ship.lives = 3;
          stepWorld(w, input);
          if (shield.hitTick === w.tick - 1) podHits++;
          w.events.clear();
        }
        t++;
      },
      6_000,
      12_000,
    );
    expect(podHits).toBeGreaterThan(50);
    expect(growth.bytes).toBeLessThan(64 * 1024);
  }, 180_000);
});
