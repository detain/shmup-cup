/**
 * Allocation guard of the meter arsenal of plan M2-03 (definition of done: zero allocations per
 * tick), in its own file so the worker's V8 type feedback comes only from these worlds: a `'full'`
 * loadout (four Options) of every Types B–D preset on a stage with a floor, slopes and walls —
 * Spread Bombs burst into blasts, 2-Way Missiles climb and dive, Photon Torpedoes slide through
 * kills, Ripple rings grow, Cyclone and Twin beams follow — the main weapon switching between the
 * Double slot (Tail Gun, Vertical, Free Way — the ship weaving, so the Free Way turns) and the
 * Laser slot, enemies respawned as they die and armoured ones clinking.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveGameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { EnemyFlag, EnemyState } from '../../src/enemies/index.js';
import { Action, commitPlayerInput, createInputSnapshot } from '../../src/input/index.js';
import { MainWeapon } from '../../src/weapons/index.js';
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
 * The KESTREL, every shipped weapon, the shipped tileset, two scriptless targets and a static stage
 * whose floor rolls (slopes) at 32 px ± 12.
 *
 * @returns The DB.
 */
function db(): ContentDb {
  const target = (id: string, hp: number): Record<string, unknown> => ({
    id,
    hp,
    score: 100,
    hurtbox: { hw: 6, hh: 6 },
    script: 'test.idle',
    sprite: 'enemies/drifter',
    drop: null,
  });
  const { db: content, issues } = loadContent(
    [
      shipped('player/kestrel.player.json'),
      shipped('weapons/type-a.weapons.json'),
      shipped('weapons/types-b-d.weapons.json'),
      shipped('tilesets/terrain-a.tileset.json'),
      {
        path: 'enemies/t.enemies.json',
        data: {
          formatVersion: 1,
          kind: 'enemies',
          enemies: [target('soft', 3), target('tough', 40)],
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
              segments: [{ from: 0, to: 3384, floor: { base: 32, amp: 12, period: 96, seed: 4 } }],
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
 * A fully powered world of a preset with its ship alive at the left of the view and two walls
 * ahead.
 *
 * @param content - The content.
 * @param preset - The weapon preset.
 * @returns The world.
 */
function world(content: ContentDb, preset: string): World {
  const w = createWorld(
    resolveGameConfig({ stage: 't', loadout: 'full', seed: 8, weaponPreset: preset }),
    content,
  );
  const input = createInputSnapshot();
  while (w.players[0].state !== 'alive') stepWorld(w, input);
  w.players[0].invulnTicks = 1e9;
  const map = w.terrain!;
  // Walls at x 272 and 336, from the floor up to y 120: missiles die there, shots too.
  for (const col of [34, 42]) {
    for (let row = 15; row < map.rows; row++) map.tiles[row * map.cols + col] = 1;
  }
  return w;
}

describe('core/weapons arsenal allocation (M2-03)', () => {
  it('allocates nothing over ticks with every Types B–D weapon, bursts, kills and clinks', () => {
    const content = db();
    // One world per preset, stepped in turn (the measured loop runs the three).
    const worlds = [world(content, 'type-b'), world(content, 'type-c'), world(content, 'type-d')];
    const soft = content.enemyIndex.get('soft')!;
    const tough = content.enemyIndex.get('tough')!;
    const input = createInputSnapshot();
    let t = 0;
    const growth = measureHeapGrowth(
      () => {
        // Weave: 24 ticks up, 24 down (the option trail and the Free Way's direction record).
        commitPlayerInput(input.players[0], (t / 24) % 2 < 1 ? Action.Up : Action.Down);
        for (let k = 0; k < worlds.length; k++) {
          const w = worlds[k];
          // The Double slot for 300 ticks, then the Laser slot.
          w.weapons.loadouts[0].main = (t / 300) % 2 < 1 ? MainWeapon.Double : MainWeapon.Laser;
          if (t % 16 === 0) {
            const e = w.enemies.enemies[t % 64];
            if (e.state === EnemyState.Free) {
              const spawned = w.enemies.spawn(
                t % 48 === 0 ? tough : soft,
                200 + (t % 7) * 10,
                40 + (t % 11) * 10,
              );
              if (spawned !== null && t % 80 === 0) spawned.flags |= EnemyFlag.Invulnerable;
            }
          }
          stepWorld(w, input);
          w.events.clear();
        }
        t++;
      },
      6_000,
      12_000,
    );
    const seen = new Set<number>();
    for (const w of worlds) {
      const f = w.weapons.pool.fields;
      for (let i = 0; i < w.weapons.pool.count; i++) seen.add(f.kind[i]);
      expect(w.weapons.options[0].count).toBe(4);
    }
    expect(seen.size).toBeGreaterThanOrEqual(3);
    expect(growth.bytes).toBeLessThan(64 * 1024);
  }, 180_000);
});
