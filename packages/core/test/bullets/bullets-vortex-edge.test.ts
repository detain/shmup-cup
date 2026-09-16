/**
 * `core/bullets` under the **black-hole bomb** and **graze scoring** (plan M3-02), at the edges the
 * happy paths of `blackhole.test.ts` and `world-extras.test.ts` do not reach:
 *
 * - `vortex`: the falloff's shape, the clamp that never carries a bullet past the centre, the
 *   swallowed bullets' point items (and the thrower-less blast that pays nobody), and what it
 *   skips — dead bullets and everything outside the reach;
 * - `grazePlayers`: a marked bullet that pays nothing (`points` 0), the ships it ignores (not
 *   alive, not active), the reach the `?` shield's shrunken hurtbox gives it, and the `Grazed` bit
 *   that keeps a bullet from paying twice.
 */
import { describe, expect, it } from 'vitest';
import { BulletFlag, BulletKind, GRAZE_MARGIN, VORTEX_FALLOFF } from '../../src/bullets/index.js';
import { FX_CUES, SimEventKind } from '../../src/events/index.js';
import { aliveWorld, directDb } from '../helpers/direct.js';

const db = directDb();

describe('core/bullets — the vortex (M3-02)', () => {
  it('draws a bullet in by the linear falloff, hardest at the centre', () => {
    const w = aliveWorld(db);
    const f = w.bullets.pool.fields;
    const near = w.bullets.spawn(120, 100, 0, 0, BulletKind.RoundRed);
    const far = w.bullets.spawn(170, 100, 0, 0, BulletKind.RoundRed);
    expect(w.bullets.vortex(100, 100, 100, 10, 2, -1)).toBe(0);
    expect(120 - f.x[near]).toBeCloseTo(2 * (1 - VORTEX_FALLOFF * (20 / 100)), 9);
    expect(170 - f.x[far]).toBeCloseTo(2 * (1 - VORTEX_FALLOFF * (70 / 100)), 9);
    expect(f.y[near]).toBe(100);
  });

  it('never carries a bullet past the centre in one tick', () => {
    const w = aliveWorld(db);
    const f = w.bullets.pool.fields;
    // 15 px out with a 200 px/tick pull: it lands exactly on the centre, not beyond it.
    const slot = w.bullets.spawn(109, 112, 0, 0, BulletKind.RoundRed);
    expect(w.bullets.vortex(100, 100, 100, 1, 200, -1)).toBe(0);
    expect(f.x[slot]).toBeCloseTo(100, 9);
    expect(f.y[slot]).toBeCloseTo(100, 9);
  });

  it('swallows what reaches the core as a point item for the thrower', () => {
    const w = aliveWorld(db);
    const before = w.bullets.points.count;
    w.bullets.spawn(102, 100, 0, 0, BulletKind.RoundRed);
    expect(w.bullets.cancelPoints).toBeGreaterThan(0);
    expect(w.bullets.vortex(100, 100, 100, 10, 2, 0)).toBe(1);
    expect(w.bullets.points.count).toBe(before + 1);
    // And it pushed the cancel sparkle at whole pixels.
    let cancels = 0;
    w.events.drain((e) => {
      if (e.kind === SimEventKind.Particles && e.id === FX_CUES.BulletCancel) {
        cancels++;
        expect(e.x % 1).toBe(0);
        expect(e.y % 1).toBe(0);
      }
    });
    expect(cancels).toBe(1);
  });

  it('swallows without a thrower, and for a bad slot, without paying anyone', () => {
    for (const owner of [-1, 9, 0.5]) {
      const w = aliveWorld(db);
      const before = w.bullets.points.count;
      w.bullets.spawn(100, 100, 0, 0, BulletKind.RoundRed);
      expect(w.bullets.vortex(100, 100, 100, 10, 2, owner)).toBe(1);
      w.bullets.pool.flush();
      expect(w.bullets.count).toBe(0);
      expect(w.bullets.points.count).toBe(before);
    }
  });

  it('skips a dead bullet and everything outside the reach', () => {
    const w = aliveWorld(db);
    const f = w.bullets.pool.fields;
    const dead = w.bullets.spawn(102, 100, 0, 0, BulletKind.RoundRed);
    f.flags[dead] |= BulletFlag.Dead;
    const outside = w.bullets.spawn(260, 100, 0, 0, BulletKind.RoundRed);
    expect(w.bullets.vortex(100, 100, 100, 10, 2, 0)).toBe(0);
    expect(f.x[outside]).toBe(260);
  });
});

describe('core/bullets — grazePlayers (M3-02)', () => {
  it('marks without paying when the content has no graze value', () => {
    const w = aliveWorld(db, { graze: true });
    const ship = w.players[0];
    ship.invulnTicks = 600;
    const score = w.scoring.board.scores[0];
    const before = score.score;
    const slot = w.bullets.spawn(ship.x + w.ship.hurtRadius + 1, ship.y, 0, 0, BulletKind.RoundRed);
    expect(w.bullets.grazePlayers(0)).toBe(1);
    expect(w.bullets.pool.fields.flags[slot] & BulletFlag.Grazed).toBe(BulletFlag.Grazed);
    expect(score.score).toBe(before);
    // The bit stops it from being counted a second time.
    expect(w.bullets.grazePlayers(10)).toBe(0);
    expect(score.score).toBe(before);
  });

  it('ignores a ship that is not alive', () => {
    const w = aliveWorld(db, { graze: true });
    const ship = w.players[0];
    w.bullets.spawn(ship.x + 1, ship.y, 0, 0, BulletKind.RoundRed);
    for (const state of ['dying', 'dead', 'entering'] as const) {
      ship.state = state;
      expect(w.bullets.grazePlayers(10)).toBe(0);
    }
    ship.state = 'alive';
    expect(w.bullets.grazePlayers(10)).toBe(1);
  });

  it('measures the reach from the bullet radius, the hurt radius and the margin', () => {
    const w = aliveWorld(db, { graze: true });
    const ship = w.players[0];
    ship.invulnTicks = 600;
    const reach = w.ship.hurtRadius * ship.shield.hurtScale + GRAZE_MARGIN;
    const radius = 2; // the round bullet's own radius is added on top
    const outside = w.bullets.spawn(ship.x + reach + radius + 8, ship.y, 0, 0, BulletKind.RoundRed);
    expect(w.bullets.grazePlayers(10)).toBe(0);
    expect(w.bullets.pool.fields.flags[outside] & BulletFlag.Grazed).toBe(0);
    // A `?` shield shrinks the hurtbox, so the graze ring moves in with it.
    ship.shield.hurtScale = 0.5;
    const half = w.ship.hurtRadius * 0.5 + GRAZE_MARGIN;
    expect(half).toBeLessThan(reach);
    w.bullets.spawn(ship.x + half, ship.y, 0, 0, BulletKind.RoundRed);
    expect(w.bullets.grazePlayers(10)).toBe(1);
  });

  it('pushes one whole-pixel Graze event per bullet, with the player slot', () => {
    const w = aliveWorld(db, { graze: true });
    const ship = w.players[0];
    ship.invulnTicks = 600;
    ship.x += 0.5;
    w.bullets.spawn(ship.x + w.ship.hurtRadius + 1.25, ship.y + 0.5, 0, 0, BulletKind.RoundRed);
    expect(w.bullets.grazePlayers(10)).toBe(1);
    let seen = 0;
    w.events.drain((e) => {
      if (e.kind !== SimEventKind.Particles || e.id !== FX_CUES.Graze) return;
      seen++;
      expect(e.x % 1).toBe(0);
      expect(e.y % 1).toBe(0);
      expect(e.param).toBe(0);
    });
    expect(seen).toBe(1);
  });
});
