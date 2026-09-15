/**
 * Allocation guards of the M2-01 enemy rank features (definition of done: zero allocations per
 * tick), in their own file so the worker's V8 type feedback comes only from these worlds:
 *
 * - enemies with rank modifiers waking to fire at a high rank — every wake narrows the bullet
 *   scales (`BulletSystem.setShooterRank`) and restores them (`clearShooterRank`) — and those two
 *   calls on their own, 100,000 times;
 * - revenge bullets: an enemy with `revenge` (no script, so spawning it creates no coroutine) is
 *   spawned, shot down on screen by player 1 and fires its ring of eight, over and over — the kill,
 *   the revenge pattern, the score and the extends of every kill;
 * - the rank changing every 50 ticks (a power-up taken and lost), so the World hands the bullet
 *   system a new rank and the curves are evaluated again.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BEHAVIOR_DEFS,
  createBehaviorRegistry,
  defineBehavior,
} from '../../src/behaviors/index.js';
import { BulletKind } from '../../src/bullets/index.js';
import { resolveGameConfig, type GameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import type { ScriptApi } from '../../src/enemies/index.js';
import { createInputSnapshot } from '../../src/input/index.js';
import { MoverKind, type Script } from '../../src/patterns/index.js';
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
 * A test enemy entry.
 *
 * @param id - Its id.
 * @param extra - More fields.
 * @returns The entry.
 */
function enemy(id: string, extra: Record<string, unknown>): Record<string, unknown> {
  return {
    id,
    hp: 1,
    score: 100,
    hurtbox: { hw: 4, hh: 4 },
    sprite: 'enemies/drifter',
    drop: null,
    settleTicks: 0,
    ...extra,
  };
}

const DB: ContentDb = (() => {
  const { db, issues } = loadContent(
    [
      shipped('player/kestrel.player.json'),
      shipped('weapons/type-a.weapons.json'),
      {
        path: 'enemies/t.enemies.json',
        data: {
          formatVersion: 1,
          kind: 'enemies',
          enemies: [
            enemy('keen', { script: 'alloc.shooter', rank: { bulletSpeed: 2, fireRate: 0.5 } }),
            // An id no registry knows: the enemy has no coroutine.
            enemy('avenger', {
              script: 'alloc.none',
              revenge: { minRank: 10, pattern: 'ring8', speed: 3 },
              rank: { bulletSpeed: 1.5 },
            }),
          ],
        },
      },
    ],
    { extraSprites: ENGINE_SPRITES },
  );
  expect(issues).toEqual([]);
  return db;
})();

/**
 * Fires a 3-way spread when it wakes, then sleeps its rank-scaled interval — a long one: every
 * resume of a coroutine allocates its small result object (D29), ~40 bytes, so the guard keeps the
 * wakes few (≈ 250 in the measured window) and a per-tick allocation stands out.
 */
const shooter = defineBehavior('alloc.shooter', {}, function* shoot(api: ScriptApi): Script {
  api.setMover(MoverKind.None);
  for (;;) {
    api.nWay(3, 24, 1.5, BulletKind.RoundPink);
    yield api.fireWait(200);
  }
});

const REGISTRY = createBehaviorRegistry([...DEFAULT_BEHAVIOR_DEFS, shooter]);

/**
 * A free-flight World in god mode, past the fly-in.
 *
 * @param overrides - Config overrides.
 * @returns The World.
 */
function world(overrides: Partial<GameConfig> = {}): World {
  const w = createWorld(resolveGameConfig({ seed: 21, ...overrides }), DB, { behaviors: REGISTRY });
  w.debugFlags.godMode = true;
  const input = createInputSnapshot();
  for (let i = 0; i < 45; i++) stepWorld(w, input);
  return w;
}

describe('core/enemies M2-01 allocation', () => {
  it('runs rank-modified shooters at a high rank without allocating', () => {
    const w = world({ loadout: 'full' });
    expect(w.rank).toBe(14);
    const keen = DB.enemyIndex.get('keen') ?? -1;
    for (let k = 0; k < 4; k++) {
      expect(w.enemies.spawn(keen, w.camera.x + 250 + k * 20, 40 + k * 40)).not.toBeNull();
    }
    const input = createInputSnapshot();
    let fired = 0;
    const growth = measureHeapGrowth(
      () => {
        const before = w.bullets.count;
        stepWorld(w, input);
        if (w.bullets.count > before) fired++;
        w.events.clear();
      },
      10_000,
      20_000,
    );
    expect(fired).toBeGreaterThan(40);
    expect(w.bullets.speedScale).toBe(w.bullets.rankSpeedScale); // restored after every script
    expect(growth.bytes).toBeLessThan(64 * 1024);
  }, 60_000);

  it('narrows and restores the bullet scales without allocating', () => {
    const b = world({ loadout: 'full' }).bullets;
    const speedK = Float64Array.of(2, 0.5, 1.5);
    const fireK = Float64Array.of(0.5, 3, 1);
    let sum = 0;
    const growth = measureHeapGrowth(
      (i) => {
        b.setShooterRank(speedK, fireK, i % 3);
        if (b.speedScale > 1) sum++;
        b.clearShooterRank();
      },
      100_000,
      100_000,
      3,
      16 * 1024,
    );
    expect(sum).toBeGreaterThan(0);
    expect(growth.bytes).toBeLessThan(32 * 1024); // a boxed scale per call would be ≥ 1.6 MB
  });

  it('fires revenge bullets for kill after kill without allocating', () => {
    const w = world({ loadout: 'full' });
    const avenger = DB.enemyIndex.get('avenger') ?? -1;
    const input = createInputSnapshot();
    let revenges = 0;
    const growth = measureHeapGrowth(
      (i) => {
        const e = w.enemies.spawn(avenger, w.camera.x + 200, 60 + (i % 5) * 20);
        stepWorld(w, input); // on screen now
        if (e !== null) {
          const before = w.bullets.count;
          w.enemies.kill(e, 0);
          if (w.bullets.count > before) revenges++;
        }
        stepWorld(w, input);
        if ((i & 63) === 0) w.bullets.pool.clear();
        w.events.clear();
      },
      5_000,
      10_000,
    );
    expect(revenges).toBeGreaterThan(1_000);
    expect(growth.bytes).toBeLessThan(64 * 1024);
  }, 60_000);

  it('follows a changing rank without allocating', () => {
    const w = world();
    const loadout = w.weapons.loadouts[0];
    const input = createInputSnapshot();
    let changes = 0;
    let rank = w.rank;
    const growth = measureHeapGrowth(
      (i) => {
        if (i % 50 === 0) loadout.options = loadout.options === 0 ? 4 : 0;
        stepWorld(w, input);
        if (w.rank !== rank) {
          rank = w.rank;
          changes++;
        }
        w.events.clear();
      },
      10_000,
      20_000,
    );
    expect(changes).toBeGreaterThan(100);
    expect(growth.bytes).toBeLessThan(64 * 1024);
  }, 60_000);
});
