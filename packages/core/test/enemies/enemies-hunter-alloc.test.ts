/**
 * Allocation guard of the M2-04 Option Hunter cycle (definition of done: zero allocations per
 * tick), in its own file so the worker's V8 type feedback comes only from this world: scriptless
 * Option Hunters parked on the Options (the steal of phase 7 — the chain cut, the loadout and the
 * group updated, the alarm and the steal sounds), the haul drawn every tick (`carriedBatch`, a
 * moving hunter), the blue capsule's screen clear and Mega Crash freeing it (freed-Option drops →
 * drifting items, collected again by the ship), a scrolling camera and Snake Options.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveGameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { EnemyState } from '../../src/enemies/index.js';
import { Action, commitPlayerInput, createInputSnapshot } from '../../src/input/index.js';
import { ItemFlag, ItemKind } from '../../src/powerups/index.js';
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
 * The KESTREL, Type A, a scriptless Option Hunter and a stage scrolling at 0.75 px/tick.
 *
 * @returns The DB.
 */
function db(): ContentDb {
  const { db: content, issues } = loadContent(
    [
      shipped('player/kestrel.player.json'),
      shipped('weapons/type-a.weapons.json'),
      {
        path: 'enemies/t.enemies.json',
        data: {
          formatVersion: 1,
          kind: 'enemies',
          enemies: [
            {
              id: 'hunter',
              hp: 1,
              score: 1000,
              hurtbox: { hw: 8, hh: 6 },
              script: 'test.idle',
              sprite: 'enemies/drifter',
              drop: null,
              optionHunter: true,
              settleTicks: 0,
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
          length: 30000,
          camera: [{ x: 0, speed: 0.75 }],
          checkpoints: [{ x: 0 }],
          parallax: [],
          tilemap: null,
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
 * The world: god mode (the hunters' laps never end a life), Snake Options.
 *
 * @returns The world.
 */
function world(): World {
  const w = createWorld(
    resolveGameConfig({ stage: 't', loadout: 'full', optionChoice: 'snake', seed: 29 }),
    db(),
  );
  w.debugFlags.godMode = true;
  const input = createInputSnapshot();
  while (w.players[0].state !== 'alive') stepWorld(w, input);
  return w;
}

describe('M2-04 Option Hunter allocation', () => {
  it('allocates nothing over steals, carried hauls, screen clears and freed Options', () => {
    const w = world();
    const hunterIndex = w.content.enemyIndex.get('hunter')!;
    const group = w.weapons.options[0];
    const loadout = w.weapons.loadouts[0];
    const input = createInputSnapshot();
    let t = 0;
    let stolen = 0;
    let freed = 0;
    let regained = 0;
    const growth = measureHeapGrowth(
      () => {
        commitPlayerInput(input.players[0], (t / 40) % 2 < 1 ? Action.Up : Action.Down);
        const phase = t % 120;
        if (phase === 0 && group.count > 0) {
          const k = group.count - 1;
          const h = w.enemies.spawn(hunterIndex, group.x[k], group.y[k]);
          if (h !== null) {
            h.vx = -0.5;
            h.vy = 0.25;
          }
        }
        if (phase === 60) {
          freed += t % 240 === 60 ? w.powerups.clearScreen(0) : w.powerups.detonateMegaCrash(0);
        }
        if (loadout.options < 1) loadout.options = 2;
        const before = group.stolen;
        stepWorld(w, input);
        stolen += group.stolen - before;
        // Freed Options drift near the ship: pull the nearest onto it now and then.
        if (phase === 90) {
          const f = w.powerups.pool.fields;
          for (let i = 0; i < w.powerups.pool.count; i++) {
            if ((f.flags[i] & ItemFlag.Dead) === 0 && f.kind[i] === ItemKind.FreeOption) {
              f.x[i] = w.players[0].x;
              f.y[i] = w.players[0].y;
              regained++;
              break;
            }
          }
        }
        w.events.clear();
        t++;
      },
      4_000,
      8_000,
    );
    expect(stolen).toBeGreaterThan(20);
    expect(freed).toBeGreaterThan(20);
    expect(regained).toBeGreaterThan(20);
    for (const e of w.enemies.enemies) {
      if (e.state === EnemyState.Live) expect(e.carried).toBeLessThanOrEqual(8);
    }
    expect(growth.bytes).toBeLessThan(64 * 1024);
  }, 180_000);
});
