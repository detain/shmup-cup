/**
 * Edge cases of the plan M2-02 additions to `core/bullets`: bending laser arguments (floored,
 * clamped, wrapped, rejected), homing without a target, the head stopping in terrain, the circle
 * chain covering only the newest `length` nodes (the tail's old path is safe), a full 64-node ring,
 * the first hit only, invulnerability, `ScriptApi.bendingLaser` (rank-scaled speed, the fire rule),
 * the render view — and bullet cancel into point items: who may be credited, non-cancelable
 * bullets, lasers and bending lasers giving no points, the hover and camera ride, big cancels,
 * and a Mega Crash with nobody to credit.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BEHAVIOR_DEFS,
  createBehaviorRegistry,
  defineBehavior,
} from '../../src/behaviors/index.js';
import {
  BENDING_LASER_HOMING,
  BENDING_LASER_LENGTH,
  BENDING_LASER_LIFE,
  BENDING_LASER_NODES,
  BENDING_LASER_SPEED,
  BENDING_LASER_TURN,
  BENDING_LASER_WIDTH,
  BulletFlag,
  CANCEL_SPARKLE_LIMIT,
  CancelMode,
  MAX_BULLET_SPEED,
  POINT_ITEM_HOVER_TICKS,
  POINT_ITEM_LIFETIME,
  cancelAllBullets,
  fireBendingLaser,
} from '../../src/bullets/index.js';
import { findFloor, terrainSolidAt } from '../../src/collision/index.js';
import { resolveGameConfig } from '../../src/config/index.js';
import {
  EMPTY_CONTENT_DB,
  loadContent,
  type ContentDb,
  type ContentFile,
} from '../../src/data/index.js';
import { EnemyFlag } from '../../src/enemies/index.js';
import { FX_CUES, SimEventKind } from '../../src/events/index.js';
import { createInputSnapshot } from '../../src/input/index.js';
import { SLEEP_FOREVER, type Script } from '../../src/patterns/index.js';
import { DEFAULT_SCORING_RULES } from '../../src/scoring/index.js';
import { ENGINE_SPRITES, createWorld, stepWorld, type World } from '../../src/world/index.js';

/**
 * A free-flight world with the ship alive at `(x, y)`.
 *
 * @param x - Ship x.
 * @param y - Ship y.
 * @param content - Content.
 * @param overrides - Config overrides.
 * @returns The world.
 */
function world(
  x = 60,
  y = 100,
  content: ContentDb = EMPTY_CONTENT_DB,
  overrides: Record<string, unknown> = {},
): World {
  const w = createWorld(resolveGameConfig({ seed: 9, ...overrides }), content, {
    behaviors: REGISTRY,
  });
  run(w, 60);
  w.players[0].x = x;
  w.players[0].y = y;
  return w;
}

/**
 * Steps a world.
 *
 * @param w - The world.
 * @param ticks - Ticks.
 */
function run(w: World, ticks: number): void {
  const input = createInputSnapshot();
  for (let t = 0; t < ticks; t++) stepWorld(w, input);
}

/** A fixed laser source. */
function at(x: number, y: number): { slot: number; x: number; y: number } {
  return { slot: -1, x, y };
}

/** Return values of the laser behaviours (by call). */
const fired: number[] = [];

/** Behaviours firing one bending laser each, then sleeping. */
const REGISTRY = createBehaviorRegistry([
  ...DEFAULT_BEHAVIOR_DEFS,
  defineBehavior('ts.bend', {}, function* bend(api): Script {
    fired.push(api.bendingLaser());
    yield SLEEP_FOREVER;
  }),
  defineBehavior('ts.bend-custom', {}, function* bend(api): Script {
    fired.push(api.bendingLaser(256, 2, 3, 5, 20, 10, 40));
    yield SLEEP_FOREVER;
  }),
]);

/** Enemies of the behaviours. */
const ENEMY_DB: ContentDb = (() => {
  const enemy = (id: string): Record<string, unknown> => ({
    id,
    hp: 1000,
    score: 0,
    hurtbox: { hw: 4, hh: 4 },
    script: id,
    sprite: 'enemies/drifter',
    drop: null,
    settleTicks: 0,
  });
  const { db, issues } = loadContent([
    {
      path: 'enemies/t.enemies.json',
      data: {
        formatVersion: 1,
        kind: 'enemies',
        enemies: [enemy('ts.bend'), enemy('ts.bend-custom')],
      },
    },
  ]);
  expect(issues).toEqual([]);
  return db;
})();

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

/** A static stage `t` with a flat 32-px floor. */
const TERRAIN_DB: ContentDb = (() => {
  const { db, issues } = loadContent(
    [
      shipped('player/kestrel.player.json'),
      shipped('tilesets/terrain-a.tileset.json'),
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
              segments: [{ from: 0, to: 3384, floor: { base: 32, amp: 0, period: 64, seed: 1 } }],
            },
          },
          events: [],
        },
      },
    ],
    { extraSprites: ENGINE_SPRITES },
  );
  expect(issues).toEqual([]);
  return db;
})();

describe('core/bullets bending lasers — edges (M2-02)', () => {
  it('floors whole-number arguments, clamps the turn rate, wraps the heading', () => {
    const w = world(60, 180);
    const b = w.bullets.bending;
    expect(fireBendingLaser(w, at(300, 60), 1100, 2, -3, 2.7, 10.9, 6, 5.5)).toBe(0);
    expect([b.angle[0], b.turnRate[0], b.homing[0], b.length[0], b.emit[0]]).toEqual([
      76, 0, 2, 10, 5,
    ]);
    expect(fireBendingLaser(w, at(300, 90), -256, 2, 4, 0.5)).toBe(1);
    expect([b.angle[1], b.homing[1]]).toEqual([768, 0]);
    // A fast head: one hit circle per node (stride floor(3 / 16) = 0 → 1).
    expect(fireBendingLaser(w, at(300, 120), 512, MAX_BULLET_SPEED, 0, 0, 8, 6, 10)).toBe(2);
    expect(b.stride[2]).toBe(1);
  });

  it('rejects a speed over MAX_BULLET_SPEED and non-numeric sizes', () => {
    const w = world();
    const src = at(300, 60);
    expect(fireBendingLaser(w, src, 512, MAX_BULLET_SPEED + 0.01)).toBe(-1);
    expect(fireBendingLaser(w, src, 512, -1)).toBe(-1);
    expect(fireBendingLaser(w, src, 512, 2, 0, 0, NaN)).toBe(-1);
    expect(fireBendingLaser(w, src, 512, 2, 0, 0, 8, NaN)).toBe(-1);
    expect(fireBendingLaser(w, src, 512, 2, 0, 0, 8, 6, NaN)).toBe(-1);
    expect(fireBendingLaser(w, src, -Infinity)).toBe(-1); // (+Infinity is AIM_AT_TARGET)
    expect(fireBendingLaser(w, src, NaN)).toBe(-1);
    expect(fireBendingLaser(w, at(0, Infinity))).toBe(-1);
    expect(w.bullets.bending.count).toBe(0);
  });

  it('fires with the documented defaults', () => {
    const w = world(60, 100);
    fireBendingLaser(w, at(300, 100));
    const b = w.bullets.bending;
    expect([b.speed[0], b.turnRate[0], b.homing[0], b.length[0], b.width[0], b.emit[0]]).toEqual([
      BENDING_LASER_SPEED,
      BENDING_LASER_TURN,
      BENDING_LASER_HOMING,
      BENDING_LASER_LENGTH,
      BENDING_LASER_WIDTH,
      BENDING_LASER_LIFE,
    ]);
    expect(b.bits[0] & BulletFlag.Cancelable).toBe(BulletFlag.Cancelable);
  });

  it('keeps its heading while homing without a living target (and aims left at launch)', () => {
    const w = world(60, 180);
    w.players[0].active = false;
    fireBendingLaser(w, at(300, 60), undefined, 2, 8, 30, 16, 6, 100);
    const b = w.bullets.bending;
    expect(b.angle[0]).toBe(512);
    run(w, 10);
    expect(b.angle[0]).toBe(512);
    expect(b.homing[0]).toBe(20); // the homing time still runs out
  });

  it('stops its head at the terrain; the tail then catches up', () => {
    const w = createWorld(resolveGameConfig({ stage: 't', seed: 5 }), TERRAIN_DB);
    run(w, 60);
    w.debugFlags.godMode = true;
    w.players[0].x = 20;
    w.players[0].y = 20;
    const map = w.terrain;
    expect(map).not.toBeNull();
    if (map === null) return;
    const surface = findFloor(map, 200, 0, 400);
    fireBendingLaser(w, at(200.5, surface - 20), 256, 2, 0, 0, 30, 6, 500);
    const b = w.bullets.bending;
    run(w, 12);
    expect(b.emit[0]).toBe(0);
    const headY = b.y[b.head[0]];
    expect(headY).toBeLessThan(surface + 1);
    expect(terrainSolidAt(map, 200, Math.floor(headY))).toBe(false);
    expect(terrainSolidAt(map, 200, Math.floor(headY + 2))).toBe(true);
    const filled = b.filled[0];
    run(w, filled);
    expect(b.active[0]).toBe(0);
  });

  it('hits only along the newest `length` nodes: the path the tail has left is safe', () => {
    const w = world(270, 100);
    const ship = w.players[0];
    ship.invulnTicks = 1e9;
    // Leftwards at 2 px/tick, a 5-node body (8 px): after 30 ticks the head is at x 240.
    fireBendingLaser(w, at(300, 100), 512, 2, 0, 0, 5, 6, 200);
    run(w, 30);
    const b = w.bullets.bending;
    expect(b.x[b.head[0]]).toBeCloseTo(240, 9);
    ship.invulnTicks = 0;
    w.bullets.collidePlayers();
    expect(ship.hits).toBe(0); // x 270 was on the path 15 ticks ago
    ship.x = 245;
    w.bullets.collidePlayers();
    expect(ship.hits).toBe(1);
  });

  it('keeps a full 64-node ring (wrapping) as its hitbox', () => {
    const w = world(60, 20);
    // Downwards at 1 px/tick, the longest body: after 100 ticks nodes y 100 … 163 (the ring wrapped).
    fireBendingLaser(w, at(200, 63), 256, 1, 0, 0, BENDING_LASER_NODES, 6, 150);
    run(w, 100);
    const b = w.bullets.bending;
    expect(b.filled[0]).toBe(BENDING_LASER_NODES);
    expect(b.head[0]).toBe(100 & (BENDING_LASER_NODES - 1));
    const ship = w.players[0];
    ship.invulnTicks = 0;
    ship.x = 200;
    ship.y = 100.5; // the oldest node
    w.bullets.collidePlayers();
    expect(ship.hits).toBe(1);
    ship.hits = 0;
    ship.y = 100 - 3 - w.ship.hurtRadius - 0.01; // just beyond the oldest circle
    w.bullets.collidePlayers();
    expect(ship.hits).toBe(0);
  });

  it('lets an invulnerable ship through and counts one hit per ship per test', () => {
    const w = world(250, 100);
    fireBendingLaser(w, at(300, 100), 512, 2, 0, 0, 40, 6, 100);
    fireBendingLaser(w, at(300, 100), 512, 2, 0, 0, 40, 6, 100);
    run(w, 1);
    const ship = w.players[0];
    ship.x = 299;
    ship.invulnTicks = 5;
    w.bullets.collidePlayers();
    expect(ship.hits).toBe(0);
    ship.invulnTicks = 0;
    w.bullets.collidePlayers();
    expect(ship.hits).toBe(1); // two overlapping lasers: still one hit
  });

  it('is fired by ScriptApi.bendingLaser at the rank-scaled speed, only when the enemy may fire', () => {
    fired.length = 0;
    const w = world(60, 100, ENEMY_DB, { difficulty: 'arcade' });
    const e = w.enemies.spawn(ENEMY_DB.enemyIndex.get('ts.bend') ?? -1, w.camera.x + 300, 100);
    expect(e).not.toBeNull();
    if (e !== null) e.flags |= EnemyFlag.OnScreen | EnemyFlag.WasOnScreen | EnemyFlag.Settled;
    run(w, 1);
    expect(fired).toEqual([0]);
    const b = w.bullets.bending;
    expect(b.speed[0]).toBeCloseTo(BENDING_LASER_SPEED * w.bullets.speedScale, 12);
    expect(w.bullets.speedScale).toBeGreaterThan(1);
    expect([b.turnRate[0], b.homing[0] + 1, b.length[0], b.width[0]]).toEqual([
      BENDING_LASER_TURN,
      BENDING_LASER_HOMING,
      BENDING_LASER_LENGTH,
      BENDING_LASER_WIDTH,
    ]);
    // Custom arguments, straight down.
    const c = w.enemies.spawn(
      ENEMY_DB.enemyIndex.get('ts.bend-custom') ?? -1,
      w.camera.x + 200,
      60,
    );
    if (c !== null) c.flags |= EnemyFlag.OnScreen | EnemyFlag.WasOnScreen | EnemyFlag.Settled;
    run(w, 1);
    expect(fired).toEqual([0, 1]);
    // It flew one tick already: one homing turn of 3 units towards the ship (down-left).
    expect([
      b.angle[1],
      b.turnRate[1],
      b.homing[1] + 1,
      b.length[1],
      b.width[1],
      b.emit[1] + 1,
    ]).toEqual([256 + 3, 3, 5, 20, 10, 40]);
    expect(b.speed[1]).toBeCloseTo(2 * w.bullets.speedScale, 12);
    // An enemy that may not fire yet (off screen, not settled): nothing.
    const off = world(60, 100, ENEMY_DB);
    off.enemies.spawn(ENEMY_DB.enemyIndex.get('ts.bend') ?? -1, off.camera.x + 500, 100);
    run(off, 1);
    expect(fired).toEqual([0, 1, -1]);
    expect(off.bullets.bending.count).toBe(0);
  });

  it('is the render view’s bendingLasers', () => {
    const w = world();
    expect(w.view.bendingLasers).toBe(w.bullets.bending);
    expect(w.bullets.bending.capacity).toBe(8);
    expect(w.bullets.bending.nodes).toBe(BENDING_LASER_NODES);
  });
});

describe('core/bullets cancel into points — edges (M2-02)', () => {
  /**
   * A world with `n` bullets flying left in the middle of the view.
   *
   * @param n - Bullets.
   * @returns The world.
   */
  function withBullets(n: number): World {
    const w = world(40, 190);
    for (let k = 0; k < n; k++) w.bullets.spawn(200 + (k % 20) * 5, 60 + (k >> 4) * 4, 512, 0.5, 0);
    return w;
  }

  it('credits only a whole index of an existing player', () => {
    for (const player of [0.5, -1, 99, NaN]) {
      const w = withBullets(3);
      expect(cancelAllBullets(w, CancelMode.Points, player)).toBe(3);
      expect(w.bullets.points.count, String(player)).toBe(0);
    }
  });

  it('leaves non-cancelable bullets (no point) and turns no laser into points', () => {
    const w = withBullets(4);
    w.bullets.setFlags(1, 0); // not cancelable
    w.bullets.fireLaser({ x: 300, y: 50 }, 512, 200, 6, 40, 8, 60, 8, -1);
    fireBendingLaser(w, at(300, 150), 512);
    expect(cancelAllBullets(w, CancelMode.Points, 0)).toBe(3);
    expect(w.bullets.points.count).toBe(3);
    run(w, 1);
    expect(w.bullets.count).toBe(1);
    expect(w.bullets.bending.count).toBe(0);
    let lasers = 0;
    const lf = w.bullets.lasers.fields;
    for (let i = 0; i < w.bullets.lasers.count; i++) {
      if ((lf.flags[i] & BulletFlag.Dead) === 0) lasers++;
    }
    expect(lasers).toBe(0);
  });

  it('hovers with half the bullet’s velocity, slowing each tick, riding the camera', () => {
    const w = withBullets(1);
    const vx = w.bullets.pool.fields.vx[0];
    const x0 = w.bullets.pool.fields.x[0];
    w.camera.vx = 1;
    cancelAllBullets(w, CancelMode.Points, 0);
    const f = w.bullets.points.fields;
    expect(f.vx[0]).toBe(vx * 0.5);
    expect(f.x[0]).toBe(x0);
    expect(f.value[0]).toBe(DEFAULT_SCORING_RULES.bulletCancel);
    run(w, 1);
    expect(f.vx[0]).toBeCloseTo(vx * 0.5 * 0.85, 12);
    expect(f.x[0]).toBeCloseTo(x0 + 1 + vx * 0.5 * 0.85, 9); // + the camera's scroll
    expect(f.age[0]).toBe(1);
    run(w, POINT_ITEM_HOVER_TICKS - 1);
    let decayed = vx * 0.5;
    for (let t = 0; t < POINT_ITEM_HOVER_TICKS; t++) decayed *= 0.85;
    expect(f.vx[0]).toBeCloseTo(decayed, 12);
    // After the hover it flies up to the HUD.
    run(w, 2);
    expect(f.vy[0]).toBeLessThan(0);
  });

  it('turns every bullet of a big cancel into a point, with sparkles thinned to the limit', () => {
    const n = CANCEL_SPARKLE_LIMIT * 3;
    const w = world(40, 20);
    for (let k = 0; k < n; k++)
      w.bullets.spawn(100 + (k % 40) * 6, 40 + Math.floor(k / 40) * 20, 512, 0.25, 0);
    w.events.clear();
    expect(cancelAllBullets(w, CancelMode.Points, 0)).toBe(n);
    expect(w.bullets.points.count).toBe(n);
    let sparkles = 0;
    w.events.drain((e) => {
      if (e.kind === SimEventKind.Particles && e.id === FX_CUES.BulletCancel) sparkles++;
    });
    expect(sparkles).toBe(CANCEL_SPARKLE_LIMIT);
    run(w, POINT_ITEM_LIFETIME + 1);
    expect(w.bullets.points.count).toBe(0);
    expect(w.scoring.board.scores[0].score).toBe(n * DEFAULT_SCORING_RULES.bulletCancel);
  });

  it('a Mega Crash by nobody (a bad player) only sparkles', () => {
    const w = withBullets(4);
    w.powerups.detonateMegaCrash(7);
    expect(w.bullets.points.count).toBe(0);
    run(w, 1);
    expect(w.bullets.count).toBe(0); // cancelled all the same
  });

  it('a second cancel while items fly adds to them; a session clear drops them', () => {
    const w = withBullets(5);
    cancelAllBullets(w, CancelMode.Points, 0);
    run(w, 3);
    for (let k = 0; k < 4; k++) w.bullets.spawn(150 + k * 10, 80, 512, 0.5, 0);
    cancelAllBullets(w, CancelMode.Points, 0);
    expect(w.bullets.points.count).toBe(9);
    w.pools.clearAll();
    w.bullets.clear();
    expect(w.bullets.points.count).toBe(0);
    run(w, POINT_ITEM_LIFETIME + 1);
    expect(w.scoring.board.scores[0].score).toBe(0);
  });
});
