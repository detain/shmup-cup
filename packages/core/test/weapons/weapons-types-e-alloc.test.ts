/**
 * Allocation guard of the W15-A main weapon types, in its own file so the worker's V8 type
 * feedback comes only from these worlds: a `'full'` loadout of both Types E presets on a stage
 * with a rolling floor and walls — flak volleys born, lived and gate-held, rail bolts extended
 * over enemies and into rock, drones turning after the nearest target, chain bolts forking arcs
 * into a crowded field, beacons lobbing, sticking, blinking and opening strike columns — the main
 * weapon switching between the Double slot (flak) and the Laser slot (rail / chain), enemies
 * respawned as they die and armoured ones clinking.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PLAYFIELD_H, PLAYFIELD_W, resolveGameConfig } from '../../src/config/index.js';
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

/** The shipped tileset's tile size. */
const TILE = (shipped('tilesets/terrain-a.tileset.json').data as { tileSize: number }).tileSize;

/** Rows of the test stage's map: one playfield tall. */
const ROWS = PLAYFIELD_H / TILE;

/**
 * The KESTREL, the shipped Type A and Types E, the shipped tileset, two scriptless targets and a
 * static stage whose floor rolls (slopes) at 32 px ± 12.
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
      shipped('weapons/types-e.weapons.json'),
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
            tileSize: TILE,
            tileset: 'terrain-a',
            rowsTall: ROWS,
            generator: {
              type: 'heightfield',
              segments: [
                {
                  from: 0,
                  to: 3000 + PLAYFIELD_W,
                  floor: { base: 4 * TILE, amp: 12, period: 96, seed: 4 },
                },
              ],
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
 * A fully powered world of a Types E preset with its ship alive at the left of the view and two
 * walls ahead (beacons stick their slopes, rails and bolts die on the walls).
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
  for (const col of [34, 42]) {
    for (let row = ROWS - 10; row < map.rows; row++) map.tiles[row * map.cols + col] = 1;
  }
  return w;
}

describe('core/weapons W15-A types-e allocation', () => {
  it('allocates nothing over ticks with every new weapon, forks, strikes, kills and clinks', () => {
    const content = db();
    const worlds = [world(content, 'type-e'), world(content, 'type-f')];
    const soft = content.enemyIndex.get('soft')!;
    const tough = content.enemyIndex.get('tough')!;
    const input = createInputSnapshot();
    let t = 0;
    const growth = measureHeapGrowth(
      () => {
        commitPlayerInput(input.players[0], (t / 24) % 2 < 1 ? Action.Up : Action.Down);
        for (let k = 0; k < worlds.length; k++) {
          const w = worlds[k];
          // The Double slot (flak) for 300 ticks, then the Laser slot (rail / chain).
          w.weapons.loadouts[0].main = (t / 300) % 2 < 1 ? MainWeapon.Double : MainWeapon.Laser;
          w.weapons.loadouts[0].missile = true; // drones / beacons fire on their own timer
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
          // A chain bolt that hits forks into the crowd; a strike column burns through it.
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
    // The worlds ran long enough to have produced pellets, bolts, drones and beacons in play;
    // which kinds are alive on the last tick is timing, so require several, not a fixed set.
    expect(seen.size).toBeGreaterThanOrEqual(3);
    expect(growth.bytes).toBeLessThan(64 * 1024);
  }, 180_000);
});
