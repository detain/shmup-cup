/**
 * The R3-06.L4 enemy glows (`core/enemies`): the spec table's compiled glow column, the two
 * additive glow batches that exist only when some spec names a glow, the sync refill at the
 * owner's anchor (ground items to the ground batch, flyers to the air one, frame 0, no flags),
 * the ghost and dead exclusions, and the determinism rule: `hashWorld` of a glow world equals
 * the hash of the same world whose content names no glow — the glow is presentation-only.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BEHAVIOR_DEFS,
  createBehaviorRegistry,
  defineBehavior,
  type BehaviorRegistry,
} from '../../src/behaviors/index.js';
import { resolveGameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { hashWorld } from '../../src/debug/index.js';
import { EnemyFlag, EnemyState, type Enemy } from '../../src/enemies/index.js';
import { commitPlayerInput, createInputSnapshot } from '../../src/input/index.js';
import { SLEEP_FOREVER, type Script } from '../../src/patterns/index.js';
import { LayerId } from '../../src/presentation/index.js';
import { createWorld, stepWorld, type World } from '../../src/world/index.js';
import { shipped } from '../helpers/campaign.js';

/**
 * An enemy entry (overrides over a small flying test enemy).
 *
 * @param id - Enemy id.
 * @param over - Fields to change.
 * @returns The entry.
 */
function enemy(id: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    hp: 3,
    score: 100,
    hurtbox: { hw: 4, hh: 4 },
    script: 'test.idle',
    sprite: 'enemies/drifter',
    drop: null,
    ...over,
  };
}

/** The glow sprite every glowing fixture names (interned by the loader, no atlas check here). */
const HALO = 'glows/halo';

/**
 * Test content: the KESTREL plus a roster of glowing and plain enemies.
 *
 * @param glow - Whether the `flyer` and `floorer` specs name their glow.
 * @returns The DB.
 */
function db(glow: boolean): ContentDb {
  const halos = glow ? { glow: HALO } : {};
  const files: ContentFile[] = [
    shipped('player/kestrel.player.json'),
    {
      path: 'enemies/t.enemies.json',
      data: {
        formatVersion: 1,
        kind: 'enemies',
        enemies: [
          enemy('plain'),
          enemy('flyer', { mover: { type: 'straight', vx: -2, vy: 0 }, ...halos }),
          enemy('floorer', { ground: 'floor', settleTicks: 0, ...halos }),
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
        camera: [{ x: 0, speed: 1 }],
        checkpoints: [],
        parallax: [],
        tilemap: null,
        events: [],
      },
    },
  ];
  const { db: content, issues } = loadContent(files);
  expect(issues).toEqual([]);
  return content;
}

/** The test behaviours (idle sleepers; nothing fires). */
const REGISTRY: BehaviorRegistry = createBehaviorRegistry([
  ...DEFAULT_BEHAVIOR_DEFS,
  defineBehavior('test.idle', {}, function* idle(): Script {
    yield SLEEP_FOREVER;
  }),
]);

/**
 * A world on the test stage, no autofire.
 *
 * @param glow - Whether the content names glows.
 * @returns The world.
 */
function world(glow = true): World {
  return createWorld(
    resolveGameConfig({ seed: 11, stage: 't', autofire: false, remoteMode: false }),
    db(glow),
    { behaviors: REGISTRY },
  );
}

/**
 * Steps a world with no input.
 *
 * @param w - The world.
 * @param ticks - Ticks.
 */
function run(w: World, ticks: number): void {
  const input = createInputSnapshot();
  for (let i = 0; i < ticks; i++) {
    commitPlayerInput(input.players[0], 0);
    stepWorld(w, input);
  }
}

/**
 * Spawns an enemy and fails the test when it could not.
 *
 * @param w - The world.
 * @param id - Enemy id.
 * @param x - World x.
 * @param y - World y.
 * @returns The enemy.
 */
function put(w: World, id: string, x: number, y: number): Enemy {
  const index = w.content.enemyIndex.get(id);
  if (index === undefined) throw new Error('no enemy ' + id);
  const e = w.enemies.spawn(index, x, y);
  if (e === null) throw new Error('could not spawn ' + id);
  return e;
}

describe('core/enemies glow batches (R3-06.L4)', () => {
  it('creates no glow batches for content that names no glow', () => {
    const w = world(false);
    expect(w.enemies.glowGroundBatch).toBeNull();
    expect(w.enemies.glowAirBatch).toBeNull();
    for (const batch of w.view.batches) expect(batch.blend).toBeUndefined();
  });

  it('creates both additive batches when any spec glows, on the owners layers', () => {
    const w = world();
    const air = w.enemies.glowAirBatch;
    const ground = w.enemies.glowGroundBatch;
    expect(air).not.toBeNull();
    expect(ground).not.toBeNull();
    expect(air?.blend).toBe('additive');
    expect(air?.layer).toBe(LayerId.AirEnemies);
    expect(ground?.layer).toBe(LayerId.GroundEnemies);
    expect(w.view.batches).toContain(air);
    expect(w.view.batches).toContain(ground);
  });

  it('interns the glow name so every defined glow resolves to a slot', () => {
    const content = db(true);
    expect(content.sprites.index.get(HALO)).toBeTypeOf('number');
    expect(content.enemies[1].glow).toBe(HALO);
    expect('glow' in (content.enemies[0] as unknown as Record<string, unknown>)).toBe(false);
  });

  it('refills the flyer glow at the owner anchor, frame 0, no flags', () => {
    const w = world();
    const e = put(w, 'flyer', 300, 100);
    run(w, 3);
    const batch = w.enemies.glowAirBatch;
    expect(batch?.count).toBe(1);
    expect(batch?.spriteId[0]).toBe(w.content.sprites.index.get(HALO));
    expect(batch?.x[0]).toBe(e.x); // follows the owner (it rides the camera)
    expect(batch?.frame[0]).toBe(0);
    expect(batch?.flags[0]).toBe(0);
    expect(w.enemies.glowGroundBatch?.count).toBe(0);
  });

  it('routes a ground enemy glow to the ground batch', () => {
    const w = world();
    put(w, 'floorer', 200, 20);
    run(w, 3);
    expect(w.enemies.glowGroundBatch?.count).toBe(1);
    expect(w.enemies.glowAirBatch?.count).toBe(0);
  });

  it('drops a ghosted or dead enemy glow on the next sync', () => {
    const w = world();
    const e = put(w, 'flyer', 300, 100);
    run(w, 2);
    expect(w.enemies.glowAirBatch?.count).toBe(1);
    e.flags |= EnemyFlag.Ghost;
    run(w, 1);
    expect(w.enemies.glowAirBatch?.count).toBe(0);
    e.flags &= ~EnemyFlag.Ghost;
    e.state = EnemyState.Removed;
    run(w, 1);
    expect(w.enemies.glowAirBatch?.count).toBe(0);
  });

  it('is not hashed: a glow world and the same world without glows hash identically', () => {
    const withGlow = world(true);
    const without = world(false);
    const a = put(withGlow, 'flyer', 300, 100);
    const b = put(without, 'flyer', 300, 100);
    put(withGlow, 'plain', 260, 120);
    put(without, 'plain', 260, 120);
    run(withGlow, 10);
    run(without, 10);
    expect(a.x).toBe(b.x); // same simulation
    expect(hashWorld(withGlow)).toBe(hashWorld(without));
    const input = createInputSnapshot();
    commitPlayerInput(input.players[0], 0);
    stepWorld(withGlow, input);
    stepWorld(without, input);
    expect(hashWorld(withGlow)).toBe(hashWorld(without));
  });
});
