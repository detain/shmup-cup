/**
 * The mechanic extras of plan M3-02 that live in the tick pipeline: the **authentic slowdown**
 * (`GameConfig.slowdown` — deterministic tick-skipping over a load threshold) and **graze
 * scoring** (`GameConfig.graze` — `core/bullets` `grazePlayers`, the per-bullet `Grazed` bit).
 */
import { describe, expect, it } from 'vitest';
import { BulletFlag, BulletKind, GRAZE_MARGIN } from '../../src/bullets/index.js';
import {
  SLOWDOWN_RUN_TICKS,
  SLOWDOWN_THRESHOLD,
  resolveGameConfig,
} from '../../src/config/index.js';
import { hashWorld } from '../../src/debug/index.js';
import { createInputSnapshot } from '../../src/input/index.js';
import { DEFAULT_GRAZE_POINTS } from '../../src/scoring/index.js';
import { createWorld, stepWorld, type World } from '../../src/world/index.js';
import { aliveWorld, directDb, run } from '../helpers/direct.js';

const db = directDb();

/** A meter world on the still stage with player 1 alive. */
function world(extra: Record<string, unknown> = {}): World {
  const w = createWorld(resolveGameConfig({ seed: 11, stage: 'still', ...extra }), db);
  const input = createInputSnapshot();
  for (let i = 0; i < 200 && w.players[0].state !== 'alive'; i++) stepWorld(w, input);
  return w;
}

/**
 * Fills the bullet pool until the World's load is over the slowdown threshold.
 *
 * @param w - The world.
 * @param count - Bullets to spawn.
 */
function flood(w: World, count: number): void {
  for (let i = 0; i < count; i++) {
    w.bullets.spawn(w.camera.x + 40 + (i % 40) * 4, w.camera.y + 120, 0, 0, BulletKind.RoundRed);
  }
}

describe('core/world — the authentic slowdown (M3-02)', () => {
  it('never skips a tick while the screen is quiet', () => {
    const w = world({ slowdown: true });
    const input = createInputSnapshot();
    for (let i = 0; i < 60; i++) {
      stepWorld(w, input);
      expect(w.slowSkip).toBe(false);
    }
    expect(w.slowLoad).toBeLessThanOrEqual(SLOWDOWN_THRESHOLD);
  });

  it('skips every other tick once the load is over the threshold', () => {
    const w = world({ slowdown: true });
    const input = createInputSnapshot();
    flood(w, SLOWDOWN_THRESHOLD + 20);
    stepWorld(w, input); // this tick fills `slowLoad`
    expect(w.slowLoad).toBeGreaterThan(SLOWDOWN_THRESHOLD);
    expect(w.slowRun).toBe(SLOWDOWN_RUN_TICKS);
    const skipped: boolean[] = [];
    for (let i = 0; i < 8; i++) {
      stepWorld(w, input);
      skipped.push(w.slowSkip);
    }
    expect(skipped).toEqual([true, false, true, false, true, false, true, false]);
  });

  it('a skipped tick freezes the systems but still counts as a tick', () => {
    const w = world({ slowdown: true });
    const input = createInputSnapshot();
    flood(w, SLOWDOWN_THRESHOLD + 20);
    stepWorld(w, input);
    const ship = w.players[0];
    const tick = w.tick;
    const x = ship.x;
    // The next tick is skipped: the player does not move even though it is asked to.
    run(w, input, 8 /* Action.Right */);
    expect(w.slowSkip).toBe(true);
    expect(ship.x).toBe(x);
    expect(w.tick).toBe(tick + 1);
    // The tick after it runs.
    run(w, input, 8);
    expect(w.slowSkip).toBe(false);
    expect(ship.x).toBeGreaterThan(x);
  });

  it('is deterministic: the same inputs give the same hashes with it on', () => {
    const hashes = [0, 1].map(() => {
      const w = world({ slowdown: true });
      const input = createInputSnapshot();
      flood(w, SLOWDOWN_THRESHOLD + 20);
      for (let i = 0; i < 120; i++) stepWorld(w, input);
      return hashWorld(w);
    });
    expect(hashes[0]).toBe(hashes[1]);
  });

  it('changes nothing while the option is off', () => {
    const w = world();
    const input = createInputSnapshot();
    flood(w, SLOWDOWN_THRESHOLD + 20);
    for (let i = 0; i < 10; i++) {
      stepWorld(w, input);
      expect(w.slowSkip).toBe(false);
    }
    // The load is not even counted without the option.
    expect(w.slowLoad).toBe(0);
  });

  it('is a hashed part of a World that has it', () => {
    const quiet = world({ slowdown: true });
    const busy = world({ slowdown: true });
    const input = createInputSnapshot();
    flood(busy, SLOWDOWN_THRESHOLD + 20);
    stepWorld(quiet, input);
    stepWorld(busy, input);
    expect(hashWorld(quiet)).not.toBe(hashWorld(busy));
  });
});

describe('core/bullets — graze scoring (M3-02)', () => {
  it('marks a bullet that passes close by and pays the content value once', () => {
    const w = world({ graze: true });
    const input = createInputSnapshot();
    const ship = w.players[0];
    const score = w.scoring.board.scores[0];
    const before = score.score;
    // Just outside the hurt radius, inside the graze reach.
    const slot = w.bullets.spawn(
      ship.x + w.ship.hurtRadius + GRAZE_MARGIN - 0.5,
      ship.y,
      0,
      0,
      BulletKind.RoundRed,
    );
    expect(slot).toBeGreaterThanOrEqual(0);
    stepWorld(w, input);
    expect(w.grazes).toBe(1);
    expect(score.score).toBe(before + DEFAULT_GRAZE_POINTS);
    expect(w.bullets.pool.fields.flags[slot] & BulletFlag.Grazed).toBe(BulletFlag.Grazed);
    // The same bullet never grazes twice.
    stepWorld(w, input);
    expect(w.grazes).toBe(1);
    expect(score.score).toBe(before + DEFAULT_GRAZE_POINTS);
  });

  it('ignores a bullet that stays out of reach', () => {
    const w = world({ graze: true });
    const input = createInputSnapshot();
    const ship = w.players[0];
    w.bullets.spawn(ship.x + 60, ship.y, 0, 0, BulletKind.RoundRed);
    stepWorld(w, input);
    expect(w.grazes).toBe(0);
  });

  it('never runs while the option is off', () => {
    const w = world();
    const input = createInputSnapshot();
    const ship = w.players[0];
    const slot = w.bullets.spawn(ship.x + 4, ship.y, 0, 0, BulletKind.RoundRed);
    stepWorld(w, input);
    expect(w.grazes).toBe(0);
    // The bullet hit the ship instead (or is still unmarked).
    expect((w.bullets.pool.fields.flags[slot] ?? 0) & BulletFlag.Grazed).toBe(0);
  });

  it('is hashed only in a World that grazes', () => {
    const a = world({ graze: true });
    const b = world({ graze: true });
    const input = createInputSnapshot();
    a.bullets.spawn(a.players[0].x + 4, a.players[0].y, 0, 0, BulletKind.RoundRed);
    stepWorld(a, input);
    stepWorld(b, input);
    expect(hashWorld(a)).not.toBe(hashWorld(b));
  });

  it('works for the Direct ship too', () => {
    const w = aliveWorld(db, { graze: true });
    const input = createInputSnapshot();
    const ship = w.players[0];
    ship.invulnTicks = 240;
    w.bullets.spawn(ship.x + w.ship.hurtRadius + 1, ship.y, 0, 0, BulletKind.RoundRed);
    stepWorld(w, input);
    expect(w.grazes).toBe(1);
  });
});
