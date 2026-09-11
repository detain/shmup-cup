/**
 * Allocation guard of `core/weapons` (plan M1-10 acceptance: "allocation guard with full
 * loadout"), in its own file so the worker's V8 type feedback comes only from these worlds: the
 * `'full'` loadout (Laser, Missile, four Options) on a stage with a floor, slopes and walls — so
 * missiles fall, slide, climb and die — the ship weaving up and down (the option trail records),
 * enemies respawned as the shots kill them (hits, pierce cooldowns, kills, explosion events) and
 * armoured ones clinking.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveGameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { EnemyFlag, EnemyState } from '../../src/enemies/index.js';
import { Action, commitPlayerInput, createInputSnapshot } from '../../src/input/index.js';
import { ShotKind } from '../../src/weapons/index.js';
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
 * The KESTREL, Type A, the shipped tileset, two scriptless targets and a static stage whose floor
 * rolls (slopes) at 32 px ± 12.
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
 * A fully powered world with its ship alive at the left of the view and two walls ahead.
 *
 * @returns The world.
 */
function world(): World {
  const w = createWorld(resolveGameConfig({ stage: 't', loadout: 'full', seed: 8 }), db());
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

describe('core/weapons allocation', () => {
  it('allocates nothing over ticks with the full loadout, hits, kills and clinks', () => {
    const w = world();
    const soft = w.content.enemyIndex.get('soft')!;
    const tough = w.content.enemyIndex.get('tough')!;
    const input = createInputSnapshot();
    let t = 0;
    const growth = measureHeapGrowth(
      () => {
        // Weave: 24 ticks up, 24 down (the option trail records every tick).
        commitPlayerInput(input.players[0], (t / 24) % 2 < 1 ? Action.Up : Action.Down);
        if (t % 16 === 0) {
          const slot = t % 64;
          const e = w.enemies.enemies[slot];
          if (e.state === EnemyState.Free) {
            const spawned = w.enemies.spawn(
              t % 48 === 0 ? tough : soft,
              200 + (t % 7) * 10,
              40 + (t % 11) * 10,
            );
            if (spawned !== null && t % 80 === 0) spawned.flags |= EnemyFlag.Invulnerable;
          }
        }
        t++;
        stepWorld(w, input);
        w.events.clear();
      },
      10_000,
      20_000,
      3,
    );
    const f = w.weapons.pool.fields;
    let lasers = 0;
    for (let i = 0; i < w.weapons.pool.count; i++) if (f.kind[i] === ShotKind.Laser) lasers++;
    expect(lasers).toBeGreaterThan(0);
    expect(w.weapons.options[0].count).toBe(4);
    expect(growth.bytes).toBeLessThan(64 * 1024);
  }, 120_000);
});
