/**
 * Second allocation guard of `core/weapons` (plan M1-10), in its own file so the worker's V8 type
 * feedback comes only from this world: the paths the `'full'`-loadout guard of
 * `weapons-alloc.test.ts` does not take — the basic shot and the **Double** pair (player 1 cycles
 * Basic → Double → Laser), **player 2** in play with its own Options and missiles (shooters
 * 5–9, kills credited to player 2), a camera scrolling by **fractional** steps on both axes (so
 * every shot, Option and SFX position is fractional), Options appearing and leaving as the
 * loadouts change, and enemies respawned as the shots kill them (armoured ones clinking).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveGameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { EnemyFlag, EnemyState } from '../../src/enemies/index.js';
import { Action, commitPlayerInput, createInputSnapshot } from '../../src/input/index.js';
import { spawnPlayer } from '../../src/player/index.js';
import { MainWeapon, ShotKind } from '../../src/weapons/index.js';
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
 * The KESTREL, Type A and two scriptless targets (no stage: free flight).
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
      {
        path: 'enemies/t.enemies.json',
        data: {
          formatVersion: 1,
          kind: 'enemies',
          enemies: [target('soft', 2), target('tough', 30)],
        },
      },
    ],
    { extraSprites: ENGINE_SPRITES },
  );
  expect(issues).toEqual([]);
  return content;
}

/**
 * Two players in play, player 2 with two Options and the Missile, the camera scrolling.
 *
 * @returns The world.
 */
function world(): World {
  const w = createWorld(resolveGameConfig({ seed: 12 }), db());
  const p2 = w.players[1];
  p2.active = true;
  spawnPlayer(p2, w.camera);
  const input = createInputSnapshot();
  while (w.players[0].state !== 'alive' || p2.state !== 'alive') stepWorld(w, input);
  for (const ship of w.players) ship.invulnTicks = 1e9;
  const l1 = w.weapons.loadouts[0];
  l1.options = 3;
  const l2 = w.weapons.loadouts[1];
  l2.main = MainWeapon.Double;
  l2.missile = true;
  l2.options = 2;
  w.players[0].y = w.camera.y + 60;
  w.players[1].y = w.camera.y + 140;
  w.camera.vx = 0.75;
  return w;
}

describe('core/weapons allocation (co-op, Double, fractional scrolling)', () => {
  it('allocates nothing over ticks with both players, every main weapon and kills', () => {
    const w = world();
    const soft = w.content.enemyIndex.get('soft')!;
    const tough = w.content.enemyIndex.get('tough')!;
    const mains = [MainWeapon.Basic, MainWeapon.Double, MainWeapon.Laser];
    const input = createInputSnapshot();
    let t = 0;
    let doubles = 0;
    let fractional = 0;
    const growth = measureHeapGrowth(
      () => {
        // Player 1 weaves, player 2 drifts right and left; the camera bobs vertically.
        commitPlayerInput(input.players[0], (t / 20) % 2 < 1 ? Action.Up : Action.Down);
        commitPlayerInput(input.players[1], (t / 30) % 2 < 1 ? Action.Right : Action.Left);
        w.camera.vy = (t / 50) % 2 < 1 ? 0.25 : -0.25;
        if (t % 150 === 0) w.weapons.loadouts[0].main = mains[(t / 150) % 3];
        if (t % 400 === 0) w.weapons.loadouts[1].options = ((t / 400) % 3) + 1;
        if (t % 12 === 0) {
          const slot = t % 64;
          const e = w.enemies.enemies[slot];
          if (e.state === EnemyState.Free) {
            const spawned = w.enemies.spawn(
              t % 36 === 0 ? tough : soft,
              w.camera.x + 180 + (t % 9) * 20,
              w.camera.y + 20 + (t % 17) * 10,
            );
            if (spawned !== null && t % 96 === 0) spawned.flags |= EnemyFlag.Invulnerable;
          }
        }
        t++;
        stepWorld(w, input);
        w.events.clear();
        if (w.weapons.pool.fields.kind[0] === ShotKind.Double) doubles++;
        if (w.camera.x % 1 !== 0) fractional++;
      },
      10_000,
      20_000,
    );
    expect(doubles).toBeGreaterThan(0);
    expect(w.weapons.options[1].count).toBeGreaterThan(0);
    expect(fractional).toBeGreaterThan(1000);
    expect(growth.bytes).toBeLessThan(64 * 1024);
  }, 120_000);
});
