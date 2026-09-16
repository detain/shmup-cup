/**
 * `core/enemies` under the **black-hole bomb** (plan M3-02): `pullTowards` (the vortex drags the
 * live enemies towards its centre with `core/bullets` `VORTEX_FALLOFF`) and `blast` (one lightning
 * bolt kills every live, non-`megaCrashImmune` enemy in reach, credited to the thrower).
 *
 * The edges both share: a dead or ghost enemy is never touched, an enemy outside the radius is
 * never touched, and an enemy exactly on the centre is left alone rather than divided by zero.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BEHAVIOR_DEFS,
  createBehaviorRegistry,
  defineBehavior,
  type BehaviorRegistry,
} from '../../src/behaviors/index.js';
import { VORTEX_FALLOFF } from '../../src/bullets/index.js';
import { resolveGameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { EnemyFlag, EnemyState, type Enemy } from '../../src/enemies/index.js';
import { SLEEP_FOREVER, type Script } from '../../src/patterns/index.js';
import { createWorld, type World } from '../../src/world/index.js';

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
 * An idle test enemy.
 *
 * @param id - Enemy id.
 * @param over - Fields over the defaults.
 * @returns The entry.
 */
function enemy(id: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    hp: 4,
    score: 100,
    hurtbox: { hw: 4, hh: 4 },
    script: 'test.idle',
    sprite: 'enemies/drifter',
    drop: null,
    ...over,
  };
}

/**
 * The test content: the KESTREL, a static stage and two enemies — a plain one and one the Mega
 * Crash (and so the black hole's lightning) cannot touch.
 *
 * @returns The DB.
 */
function vortexDb(): ContentDb {
  const { db, issues } = loadContent([
    shipped('player/kestrel.player.json'),
    {
      path: 'enemies/v.enemies.json',
      data: {
        formatVersion: 1,
        kind: 'enemies',
        enemies: [enemy('mote'), enemy('anchor', { megaCrashImmune: true })],
      },
    },
    {
      path: 'stages/v.stage.json',
      data: {
        formatVersion: 1,
        kind: 'stage',
        id: 'v',
        name: 'V',
        music: { stage: 'Stage', boss: 'Boss' },
        length: 3000,
        camera: [{ x: 0, speed: 0 }],
        checkpoints: [{ x: 0 }],
        parallax: [],
        tilemap: null,
        events: [],
      },
    },
  ]);
  expect(issues).toEqual([]);
  return db;
}

const db = vortexDb();

/** The roster plus an enemy that never moves (the pull and the blast are measured in pixels). */
const REGISTRY: BehaviorRegistry = createBehaviorRegistry([
  ...DEFAULT_BEHAVIOR_DEFS,
  defineBehavior('test.idle', {}, function* idle(): Script {
    yield SLEEP_FOREVER;
  }),
]);

/**
 * A world on the static test stage.
 *
 * @returns The world.
 */
function world(): World {
  return createWorld(resolveGameConfig({ seed: 5, stage: 'v' }), db, { behaviors: REGISTRY });
}

/**
 * Spawns an enemy at a point.
 *
 * @param w - The world.
 * @param id - Enemy id.
 * @param x - World x.
 * @param y - World y.
 * @returns The enemy.
 */
function put(w: World, id: string, x: number, y: number): Enemy {
  const index = w.content.enemyIndex.get(id);
  expect(index).toBeGreaterThanOrEqual(0);
  const e = w.enemies.spawn(index ?? -1, x, y);
  expect(e).not.toBeNull();
  const live = e as Enemy;
  expect(live.state).toBe(EnemyState.Live);
  return live;
}

describe('core/enemies — the vortex pull (M3-02)', () => {
  it('draws a live enemy towards the centre, hardest near it', () => {
    const w = world();
    const near = put(w, 'mote', 120, 100);
    const far = put(w, 'mote', 170, 100);
    // Both inside a 100-px reach of (100, 100); `near` is 20 px out, `far` 70 px.
    expect(w.enemies.pullTowards(100, 100, 100, 1)).toBe(2);
    const nearStep = 120 - near.x;
    const farStep = 170 - far.x;
    expect(nearStep).toBeCloseTo(1 * (1 - VORTEX_FALLOFF * (20 / 100)), 9);
    expect(farStep).toBeCloseTo(1 * (1 - VORTEX_FALLOFF * (70 / 100)), 9);
    expect(nearStep).toBeGreaterThan(farStep);
    // Straight towards the centre: the height never changes on a horizontal pull.
    expect(near.y).toBe(100);
  });

  it('pulls on both axes and never past the centre in one tick', () => {
    const w = world();
    const e = put(w, 'mote', 103, 104); // 5 px away, a 3-4-5 triangle
    expect(w.enemies.pullTowards(100, 100, 100, 50)).toBe(1);
    expect(e.x).toBeCloseTo(100, 9);
    expect(e.y).toBeCloseTo(100, 9);
  });

  it('leaves an enemy exactly on the centre, and one outside the reach, alone', () => {
    const w = world();
    const centre = put(w, 'mote', 100, 100);
    const outside = put(w, 'mote', 260, 100);
    expect(w.enemies.pullTowards(100, 100, 100, 1)).toBe(0);
    expect([centre.x, centre.y]).toEqual([100, 100]);
    expect([outside.x, outside.y]).toEqual([260, 100]);
  });

  it('never touches a dead or ghost enemy', () => {
    const w = world();
    const ghost = put(w, 'mote', 120, 100);
    ghost.flags |= EnemyFlag.Ghost;
    const dead = put(w, 'mote', 130, 100);
    dead.state = EnemyState.Removed;
    expect(w.enemies.pullTowards(100, 100, 100, 1)).toBe(0);
    expect(ghost.x).toBe(120);
    expect(dead.x).toBe(130);
  });

  it('pulls the enemy right on the rim, not the one a pixel past it', () => {
    const w = world();
    const rim = put(w, 'mote', 200, 100);
    const past = put(w, 'mote', 200.5, 100);
    expect(w.enemies.pullTowards(100, 100, 100, 1)).toBe(1);
    expect(rim.x).toBeLessThan(200);
    expect(past.x).toBe(200.5);
  });
});

describe('core/enemies — the lightning blast (M3-02)', () => {
  it('kills every live enemy in reach and credits the thrower', () => {
    const w = world();
    const score = w.scoring.board.scores[0];
    const before = score.score;
    const inside = put(w, 'mote', 140, 100);
    const outside = put(w, 'mote', 260, 100);
    expect(w.enemies.blast(100, 100, 88, 0)).toBe(1);
    expect(inside.state).not.toBe(EnemyState.Live);
    expect(outside.state).toBe(EnemyState.Live);
    // The kill records are paid out in phase 7, with every other kill of the tick.
    w.scoring.resolve();
    expect(score.score).toBeGreaterThan(before);
  });

  it('spares a megaCrashImmune enemy, however close it is', () => {
    const w = world();
    const anchor = put(w, 'anchor', 100, 100);
    expect(w.enemies.blast(100, 100, 88, 0)).toBe(0);
    expect(anchor.state).toBe(EnemyState.Live);
  });

  it('ignores a ghost and an already dead enemy', () => {
    const w = world();
    const ghost = put(w, 'mote', 110, 100);
    ghost.flags |= EnemyFlag.Ghost;
    const dead = put(w, 'mote', 112, 100);
    dead.state = EnemyState.Removed;
    expect(w.enemies.blast(100, 100, 88, 0)).toBe(0);
    expect(ghost.state).toBe(EnemyState.Live);
  });

  it('kills without a thrower too (a debug blast pays nobody)', () => {
    const w = world();
    const score = w.scoring.board.scores[0];
    const before = score.score;
    const e = put(w, 'mote', 120, 100);
    expect(w.enemies.blast(100, 100, 88, -1)).toBe(1);
    expect(e.state).not.toBe(EnemyState.Live);
    w.scoring.resolve();
    expect(score.score).toBe(before);
  });

  it('is a circle: the corner of its bounding box is out of reach', () => {
    const w = world();
    const corner = put(w, 'mote', 100 + 80, 100 + 80);
    expect(w.enemies.blast(100, 100, 88, 0)).toBe(0);
    expect(corner.state).toBe(EnemyState.Live);
  });
});
