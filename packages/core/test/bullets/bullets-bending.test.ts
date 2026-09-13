/**
 * Plan M2-02 additions to `core/bullets`: bending lasers (the head-position ring, homing, the
 * tail catching up, the subsampled circle-chain hitbox, cancel, camera ride, bad arguments) and
 * bullet cancel into point items (`CancelMode.Points`: items fly to the credited player's score,
 * the rules' value, full pools, the Mega Crash).
 */
import { describe, expect, it } from 'vitest';
import {
  BENDING_LASER_NODES,
  BulletOrigin,
  CancelMode,
  MAX_BENDING_LASERS,
  MAX_POINT_ITEMS,
  POINT_ITEM_HOVER_TICKS,
  POINT_ITEM_LIFETIME,
  POINT_ITEM_TARGETS,
  cancelAllBullets,
  fireBendingLaser,
} from '../../src/bullets/index.js';
import { resolveGameConfig } from '../../src/config/index.js';
import { EMPTY_CONTENT_DB, loadContent, type ContentDb } from '../../src/data/index.js';
import { hashWorld } from '../../src/debug/index.js';
import { createInputSnapshot } from '../../src/input/index.js';
import { PlayerHitCause } from '../../src/player/index.js';
import { DEFAULT_SCORING_RULES } from '../../src/scoring/index.js';
import { createWorld, stepWorld, type World } from '../../src/world/index.js';

/**
 * A free-flight world with the ship alive at `(x, y)`.
 *
 * @param x - Ship x (playfield = world in free flight).
 * @param y - Ship y.
 * @param content - Content.
 * @returns The world.
 */
function world(x = 60, y = 100, content: ContentDb = EMPTY_CONTENT_DB): World {
  const w = createWorld(resolveGameConfig({ seed: 5 }), content);
  const input = createInputSnapshot();
  for (let i = 0; i < 60; i++) stepWorld(w, input);
  w.players[0].x = x;
  w.players[0].y = y;
  return w;
}

/** A fixed laser source. */
function at(x: number, y: number): { slot: number; x: number; y: number } {
  return { slot: -1, x, y };
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

describe('core/bullets bending lasers (M2-02)', () => {
  it('records one head position per tick in a ring and keeps the newest `length` of them', () => {
    const w = world(60, 180);
    const s = fireBendingLaser(w, at(300, 60), 512, 3, 0, 0, 10, 6, 100);
    expect(s).toBe(0);
    const b = w.bullets.bending;
    expect([b.active[0], b.filled[0], b.head[0]]).toEqual([1, 1, 0]);
    expect([b.x[0], b.y[0]]).toEqual([300, 60]);
    run(w, 5);
    expect([b.filled[0], b.head[0]]).toEqual([6, 5]);
    expect(b.x[5]).toBeCloseTo(300 - 15, 9);
    run(w, 20);
    expect(b.filled[0]).toBe(10);
    expect(b.head[0]).toBe(25);
    expect(b.x[25]).toBeCloseTo(300 - 75, 9);
    // The ring wraps after BENDING_LASER_NODES ticks.
    run(w, BENDING_LASER_NODES - 20);
    expect(b.head[0]).toBe((25 + BENDING_LASER_NODES - 20) & (BENDING_LASER_NODES - 1));
    expect(b.count).toBe(1);
  });

  it('homes on the ship at most turnRate units per tick, then flies straight', () => {
    const w = world(60, 180);
    fireBendingLaser(w, at(300, 60), 512, 2, 4, 10, 32, 6, 100);
    const b = w.bullets.bending;
    const angles: number[] = [b.angle[0]];
    for (let t = 0; t < 14; t++) {
      run(w, 1);
      angles.push(b.angle[0]);
    }
    // The ship is down-left: the heading turns anticlockwise… on screen, towards +y (down).
    for (let t = 1; t <= 10; t++) expect(angles[t] - angles[t - 1]).toBe(-4);
    for (let t = 11; t < angles.length; t++) expect(angles[t]).toBe(angles[10]);
  });

  it('stops the head when it leaves the view; the tail catches up and frees the slot', () => {
    const w = world(60, 180);
    fireBendingLaser(w, at(20, 40), 512, 4, 0, 0, 16, 6, 1000);
    const b = w.bullets.bending;
    run(w, 10); // the head reaches x = −16 (the view's edge − 16) on tick 9, leaves on tick 10
    const filled = b.filled[0];
    expect(b.emit[0]).toBe(0);
    run(w, 1);
    expect(b.filled[0]).toBe(filled - 1);
    run(w, filled);
    expect(b.active[0]).toBe(0);
    expect(b.count).toBe(0);
  });

  it('stops emitting after `life` ticks and shrinks from the tail', () => {
    const w = world(60, 180);
    fireBendingLaser(w, at(300, 40), 512, 1, 0, 0, 8, 6, 5);
    const b = w.bullets.bending;
    run(w, 5);
    expect([b.filled[0], b.emit[0]]).toEqual([6, 0]);
    const head = [b.x[b.head[0]], b.y[b.head[0]]];
    run(w, 3);
    expect(b.filled[0]).toBe(3);
    expect([b.x[b.head[0]], b.y[b.head[0]]]).toEqual(head); // the head stays, the tail comes
    run(w, 3);
    expect(b.active[0]).toBe(0);
  });

  it('hits the ship anywhere along its body (overlapping circles), never beyond width/2 + hurt radius', () => {
    const hurt = world().ship.hurtRadius;
    const probe = (dy: number, dx = 0): number => {
      // A horizontal body from x 300 to 240 (speed 2, 30 nodes, stride floor(3/2) = 1); x 276 is
      // on a node.
      const w = world(276 + dx, 100 + dy);
      w.players[0].invulnTicks = 0;
      fireBendingLaser(w, at(300, 100), 512, 2, 0, 0, 30, 6, 30);
      run(w, 30);
      return w.players[0].hits;
    };
    expect(probe(0)).toBeGreaterThan(0);
    expect(probe(3 + hurt - 0.01)).toBeGreaterThan(0);
    expect(probe(3 + hurt + 0.01)).toBe(0);
    expect(probe(0, 1)).toBeGreaterThan(0); // halfway between two nodes
    expect(probe(3, 1)).toBeGreaterThan(0); // off-axis between nodes, still inside the chain
  });

  it('subsamples the hit circles by stride = floor(width / 2 / speed), still overlapping', () => {
    const w = world(60, 180);
    fireBendingLaser(w, at(300, 60), 512, 1, 0, 0, 40, 8, 100);
    fireBendingLaser(w, at(300, 90), 512, 4, 0, 0, 40, 8, 100);
    const b = w.bullets.bending;
    expect([b.stride[0], b.stride[1]]).toEqual([4, 1]);
  });

  it('reports laser hits (a Laser cause) and lets god mode through', () => {
    const w = world(250, 100);
    w.players[0].invulnTicks = 0;
    fireBendingLaser(w, at(300, 100), 512, 2, 0, 0, 40, 6, 60);
    run(w, 30);
    expect(w.players[0].hitCause).toBe(PlayerHitCause.Laser);
    const g = world(250, 100);
    g.players[0].invulnTicks = 0;
    g.debugFlags.godMode = true;
    fireBendingLaser(g, at(300, 100), 512, 2, 0, 0, 40, 6, 60);
    run(g, 30);
    expect(g.players[0].hits).toBe(0);
  });

  it('rides the camera scroll with every node', () => {
    const w = world(60, 180);
    w.camera.vx = 1;
    fireBendingLaser(w, at(300, 60), 256, 1, 0, 0, 8, 6, 100);
    run(w, 4);
    const b = w.bullets.bending;
    // Moving straight down at 1 px/tick while riding +1 px/tick: every node shifted by the scroll.
    const oldest = (b.head[0] - (b.filled[0] - 1)) & (BENDING_LASER_NODES - 1);
    expect(b.x[oldest]).toBe(300 + 4);
    expect(b.x[b.head[0]]).toBeCloseTo(300 + 4, 9);
    expect(b.y[b.head[0]]).toBeCloseTo(64, 9);
  });

  it('is cancelled with the bullets; rejects bad arguments; has 8 slots', () => {
    const w = world(60, 180);
    const src = at(300, 60);
    expect(fireBendingLaser(w, src, 512, 0)).toBe(-1);
    expect(fireBendingLaser(w, src, 512, 17)).toBe(-1);
    expect(fireBendingLaser(w, src, 512, 2, 0, 0, 1)).toBe(-1);
    expect(fireBendingLaser(w, src, 512, 2, 0, 0, BENDING_LASER_NODES + 1)).toBe(-1);
    expect(fireBendingLaser(w, src, 512, 2, 0, 0, 8, 0)).toBe(-1);
    expect(fireBendingLaser(w, src, 512, 2, 0, 0, 8, 6, 0)).toBe(-1);
    expect(fireBendingLaser(w, src, NaN)).toBe(-1);
    expect(fireBendingLaser(w, at(NaN, 0))).toBe(-1);
    for (let k = 0; k < MAX_BENDING_LASERS; k++) expect(fireBendingLaser(w, src)).toBe(k);
    expect(fireBendingLaser(w, src)).toBe(-1);
    cancelAllBullets(w, CancelMode.Sparkle);
    expect(w.bullets.bending.count).toBe(0);
    expect(fireBendingLaser(w, src)).toBe(0);
    // A session clear empties the table too.
    w.bullets.clear();
    expect(w.bullets.bending.count).toBe(0);
  });

  it('aims its first heading with AIM_AT_TARGET (the default)', () => {
    const w = world(60, 100);
    fireBendingLaser(w, at(300, 100));
    expect(w.bullets.bending.angle[0]).toBe(512);
  });

  it('is part of the state hash and deterministic', () => {
    const a = world(60, 180);
    const b = world(60, 180);
    fireBendingLaser(a, at(300, 60));
    fireBendingLaser(b, at(300, 60));
    for (let t = 0; t < 80; t++) {
      run(a, 1);
      run(b, 1);
      expect(hashWorld(a)).toBe(hashWorld(b));
    }
    b.bullets.bending.x[b.bullets.bending.head[0]] += 1e-9;
    expect(hashWorld(a)).not.toBe(hashWorld(b));
  });
});

describe('core/bullets cancel into points (M2-02)', () => {
  /**
   * A world with `n` bullets flying left in the middle of the view.
   *
   * @param n - Bullets.
   * @param content - Content.
   * @returns The world.
   */
  function withBullets(n: number, content?: ContentDb): World {
    const w = world(40, 190, content);
    for (let k = 0; k < n; k++) w.bullets.spawn(200 + (k % 20) * 5, 60 + (k >> 4) * 4, 512, 0.5, 0);
    return w;
  }

  it('turns every cancelled bullet into a point item that flies to the score and credits it', () => {
    const w = withBullets(12);
    expect(cancelAllBullets(w, CancelMode.Points, 0)).toBe(12);
    run(w, 1);
    expect(w.bullets.count).toBe(0);
    expect(w.bullets.points.count).toBe(12);
    const score = w.scoring.board.scores[0];
    expect(score.score).toBe(0);
    let credited = -1;
    for (let t = 0; t < POINT_ITEM_LIFETIME && credited < 0; t++) {
      run(w, 1);
      if (w.bullets.points.count === 0) credited = t;
    }
    expect(credited).toBeGreaterThan(POINT_ITEM_HOVER_TICKS);
    expect(score.score).toBe(12 * DEFAULT_SCORING_RULES.bulletCancel);
  });

  it('flies towards the credited player’s score slot in the top HUD bar', () => {
    const w = withBullets(1);
    cancelAllBullets(w, CancelMode.Points, 1);
    run(w, POINT_ITEM_HOVER_TICKS + 10);
    const f = w.bullets.points.fields;
    expect(f.player[0]).toBe(1);
    const [tx, ty] = POINT_ITEM_TARGETS[1];
    // Heading for (344, −4): right and up.
    expect(f.vx[0]).toBeGreaterThan(0);
    expect(f.vy[0]).toBeLessThan(0);
    expect(tx).toBe(344);
    expect(ty).toBeLessThan(0);
  });

  it('draws the items on ITEMS with the twinkle frames (hidden without the engine sprite)', () => {
    const w = withBullets(3);
    cancelAllBullets(w, CancelMode.Points, 0);
    run(w, 9);
    const batch = w.bullets.pointBatch;
    expect(batch.count).toBe(3);
    expect(batch.capacity).toBe(MAX_POINT_ITEMS);
    expect(batch.frame[0]).toBe(1); // age 9 → (9 >> 3) & 1
    expect(batch.flags[0] & 4).toBe(4); // Hidden: EMPTY_CONTENT_DB has no sprites
  });

  it('only sparkles in Sparkle mode, without a player, or at 0 points per bullet', () => {
    const sparkle = withBullets(5);
    cancelAllBullets(sparkle, CancelMode.Sparkle, 0);
    expect(sparkle.bullets.points.count).toBe(0);
    const nobody = withBullets(5);
    cancelAllBullets(nobody, CancelMode.Points);
    cancelAllBullets(nobody, CancelMode.Points, 2);
    expect(nobody.bullets.points.count).toBe(0);
    const zero = loadContent([
      {
        path: 'rules/s.rules.json',
        data: { formatVersion: 1, kind: 'rules', scoring: { bulletCancel: 0 } },
      },
    ]).db;
    const none = withBullets(5, zero);
    cancelAllBullets(none, CancelMode.Points, 0);
    expect(none.bullets.points.count).toBe(0);
  });

  it('credits the rules’ value, and credits at once when the item pool is full', () => {
    const content = loadContent([
      {
        path: 'rules/s.rules.json',
        data: { formatVersion: 1, kind: 'rules', scoring: { bulletCancel: 25 } },
      },
    ]).db;
    const w = withBullets(4, content);
    expect(w.bullets.cancelPoints).toBe(25);
    // Fill the item pool first.
    const pool = w.bullets.points;
    while (pool.alloc() >= 0) {
      // allocated
    }
    cancelAllBullets(w, CancelMode.Points, 0);
    expect(w.scoring.board.scores[0].score).toBe(100);
  });

  it('credits a straggler after POINT_ITEM_LIFETIME ticks at the latest', () => {
    const w = withBullets(1);
    cancelAllBullets(w, CancelMode.Points, 0);
    run(w, 1);
    const f = w.bullets.points.fields;
    // Freeze it in place far away (a scripted stall): the lifetime still credits it.
    f.x[0] = 1e6;
    run(w, POINT_ITEM_LIFETIME);
    expect(w.bullets.points.count).toBe(0);
    expect(w.scoring.board.scores[0].score).toBe(DEFAULT_SCORING_RULES.bulletCancel);
  });

  it('a Mega Crash turns the bullets into points for the bomber', () => {
    const w = withBullets(6);
    w.powerups.detonateMegaCrash(0);
    expect(w.bullets.points.count).toBe(6);
    expect(w.bullets.points.fields.player[0]).toBe(0);
    run(w, POINT_ITEM_LIFETIME + 1);
    expect(w.scoring.board.scores[0].score).toBe(6 * DEFAULT_SCORING_RULES.bulletCancel);
  });

  it('the player’s death only sparkles', () => {
    const w = withBullets(6);
    w.players[0].invulnTicks = 0;
    w.players[0].x = 200;
    w.players[0].y = 60;
    run(w, 1);
    expect(w.players[0].state).toBe('dying');
    expect(w.bullets.points.count).toBe(0);
  });

  it('keeps the items in the state hash (registered pool cancelPoints)', () => {
    const a = withBullets(8);
    const b = withBullets(8);
    cancelAllBullets(a, CancelMode.Points, 0);
    cancelAllBullets(b, CancelMode.Points, 0);
    for (let t = 0; t < 60; t++) {
      run(a, 1);
      run(b, 1);
      expect(hashWorld(a)).toBe(hashWorld(b));
    }
    expect(a.pools.entries.some((e) => e.name === 'cancelPoints')).toBe(true);
    const origin = new BulletOrigin();
    expect(origin.x).toBe(0);
  });
});
