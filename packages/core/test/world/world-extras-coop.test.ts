/**
 * The M3-02 extras in a **co-op** World (`MAX_BLACK_HOLES` is 2 — one vortex per player, so co-op
 * never queues): both ships stock and throw their own black hole, each vortex credits the player
 * that threw it, the death-bomb window is per ship, and a checkpoint restart closes both.
 */
import { describe, expect, it } from 'vitest';
import { BLACK_HOLE_START_STOCK, MAX_BLACK_HOLES } from '../../src/blackhole/index.js';
import { BulletKind } from '../../src/bullets/index.js';
import {
  Action,
  commitPlayerInput,
  createInputSnapshot,
  type InputSnapshot,
} from '../../src/input/index.js';
import { PlayerHitCause, playerHit } from '../../src/player/index.js';
import { DEATH_BOMB_INVULN_TICKS, stepWorld, type World } from '../../src/world/index.js';
import { aliveWorld, directDb } from '../helpers/direct.js';

const db = directDb();

/** The MANTA in a co-op game with every bomb option on. */
const COOP = Object.freeze({ coop: true, blackHole: true, deathBomb: 10 });

/**
 * Steps a world with per-player held masks.
 *
 * @param w - The world.
 * @param input - The snapshot to reuse.
 * @param held1 - Player 1's held actions.
 * @param held2 - Player 2's held actions.
 * @param ticks - Ticks.
 */
function step(w: World, input: InputSnapshot, held1: number, held2: number, ticks = 1): void {
  for (let t = 0; t < ticks; t++) {
    commitPlayerInput(input.players[0], held1);
    commitPlayerInput(input.players[1], held2);
    stepWorld(w, input);
  }
}

/**
 * A co-op world with both ships alive and both invulnerable (the tests aim the hits themselves).
 *
 * @returns The world and its input snapshot.
 */
function bothAlive(): { w: World; input: InputSnapshot } {
  const w = aliveWorld(db, COOP);
  const input = createInputSnapshot();
  step(w, input, 0, Action.Pause);
  for (let i = 0; i < 300 && w.players[1].state !== 'alive'; i++) step(w, input, 0, 0);
  expect(w.players.map((p) => p.state)).toEqual(['alive', 'alive']);
  w.events.clear();
  return { w, input };
}

describe('core/blackhole — co-op (M3-02)', () => {
  it('gives both ships a starting stock', () => {
    const { w } = bothAlive();
    expect(w.blackholes.enabled).toBe(true);
    expect(w.players[0].bombs).toBe(BLACK_HOLE_START_STOCK);
    expect(w.players[1].bombs).toBe(BLACK_HOLE_START_STOCK);
    expect(MAX_BLACK_HOLES).toBe(2);
  });

  it('lets both throw at once, each vortex owned by its thrower', () => {
    const { w, input } = bothAlive();
    step(w, input, Action.Special, Action.Special);
    expect(w.blackholes.count).toBe(2);
    const owners = w.blackholes.holes.map((h) => h.owner).sort((a, b) => a - b);
    expect(owners).toEqual([0, 1]);
    expect(w.players[0].bombs).toBe(BLACK_HOLE_START_STOCK - 1);
    expect(w.players[1].bombs).toBe(BLACK_HOLE_START_STOCK - 1);
    // Each one opened ahead of its own ship.
    for (const hole of w.blackholes.holes) {
      expect(Math.abs(hole.y - w.players[hole.owner].y)).toBeLessThan(4);
    }
  });

  it('credits the swallowed bullets to the player whose vortex took them', () => {
    const { w, input } = bothAlive();
    step(w, input, 0, Action.Special);
    const hole = w.blackholes.holes.find((h) => h.owner === 1);
    expect(hole).toBeDefined();
    const scores = w.scoring.board.scores;
    const before = [scores[0].score, scores[1].score];
    w.bullets.spawn(hole?.x ?? 0, hole?.y ?? 0, 0, 0, BulletKind.RoundRed);
    step(w, input, 0, 0);
    // The point item belongs to player 2 (`bullets.vortex`'s `player`).
    expect(w.bullets.points.count).toBeGreaterThan(0);
    const owner = w.bullets.points.fields.player;
    expect(owner[0]).toBe(1);
    expect(scores[0].score).toBe(before[0]);
  });

  it('opens a death-bomb window per ship', () => {
    const { w, input } = bothAlive();
    const [p1, p2] = w.players;
    p1.invulnTicks = 0;
    p2.invulnTicks = 0;
    playerHit(p2, PlayerHitCause.Bullet, w.tick, w.debugFlags);
    step(w, input, 0, 0);
    expect(p2.bombTicks).toBe(10);
    expect(p1.bombTicks).toBe(0);
    expect(p1.state).toBe('alive');
    // Player 2's own press saves it; player 1 is untouched.
    step(w, input, 0, Action.Special);
    expect(p2.state).toBe('alive');
    expect(p2.invulnTicks).toBe(DEATH_BOMB_INVULN_TICKS);
    expect(p2.hitCause).toBe(PlayerHitCause.None);
    expect(p1.bombs).toBe(BLACK_HOLE_START_STOCK);
  });

  it('a checkpoint restart closes both vortices', () => {
    const { w, input } = bothAlive();
    step(w, input, Action.Special, Action.Special);
    expect(w.blackholes.count).toBe(2);
    const stage = w.stage;
    expect(stage).not.toBeNull();
    stage?.restartAt(stage.checkpoint);
    expect(w.blackholes.count).toBe(0);
    for (const hole of w.blackholes.holes) expect(hole.owner).toBe(-1);
  });
});
