/**
 * The co-op drop scaling of `core/powerups` (plan M2-06, shmup_feat.md §6B "consider scaling item
 * count in co-op"): with two ships in play every capsule / power-up drop adds `coopExtra` to the
 * co-op credit and each whole credit drops one more item `COOP_EXTRA_OFFSET` px below — several
 * when the credit holds several (up to `MAX_COOP_EXTRA`); a fraction carries over; the blue
 * capsule is never scaled; a ship that died with lives left still counts as in play; the credit is
 * never reset (it survives a player leaving and coming back) and is part of the state hash.
 */
import { describe, expect, it } from 'vitest';
import { MAX_COOP_EXTRA } from '../../src/config/index.js';
import { hashWorld } from '../../src/debug/index.js';
import {
  Action,
  commitPlayerInput,
  createInputSnapshot,
  type InputSnapshot,
} from '../../src/input/index.js';
import { PLAYER_DEAD_TICKS } from '../../src/player/index.js';
import { COOP_EXTRA_OFFSET, ItemKind } from '../../src/powerups/index.js';
import { stepWorld, type World } from '../../src/world/index.js';
import { aliveWorld, directDb } from '../helpers/direct.js';

/** The shared content (the test range's carriers — `carrier` drops a capsule). */
const DB = directDb();

/**
 * Steps a world with per-player held masks.
 *
 * @param w - The world.
 * @param input - The snapshot to reuse.
 * @param held1 - Player 1's held actions.
 * @param held2 - Player 2's held actions.
 */
function step(w: World, input: InputSnapshot, held1: number, held2: number): void {
  commitPlayerInput(input.players[0], held1);
  commitPlayerInput(input.players[1], held2);
  stepWorld(w, input);
}

/**
 * A co-op KESTREL world on the still stage with player 2 joined (flying in).
 *
 * @param coopExtra - The drop scaling.
 * @returns The world and its snapshot.
 */
function coopWorld(coopExtra: number): { w: World; input: InputSnapshot } {
  const w = aliveWorld(DB, { shipId: 'kestrel', powerUpMode: 'meter', coop: true, coopExtra });
  const input = createInputSnapshot();
  step(w, input, 0, Action.Pause);
  step(w, input, 0, 0);
  expect(w.players[1].active).toBe(true);
  return { w, input };
}

/**
 * Kills an enemy between ticks and steps once (its drop becomes items in phase 3).
 *
 * @param w - The world.
 * @param input - The snapshot.
 * @param enemy - Enemy id.
 * @returns Items now in the pool.
 */
function dropOne(w: World, input: InputSnapshot, enemy = 'carrier'): number {
  const index = DB.enemyIndex.get(enemy) ?? -1;
  expect(index).toBeGreaterThanOrEqual(0);
  const e = w.enemies.spawn(index, w.camera.x + 300, w.camera.y + 60);
  expect(e).not.toBeNull();
  w.enemies.kill(e!, 0);
  step(w, input, 0, 0);
  return w.powerups.count;
}

describe('core/powerups co-op drop scaling (M2-06)', () => {
  it('drops several extras at once when the credit holds several', () => {
    const { w, input } = coopWorld(MAX_COOP_EXTRA);
    expect(dropOne(w, input)).toBe(1 + MAX_COOP_EXTRA);
    expect(w.powerups.coopCredit).toBe(0);
    const f = w.powerups.pool.fields;
    for (let i = 1; i <= MAX_COOP_EXTRA; i++) {
      expect(f.kind[i]).toBe(ItemKind.Capsule);
      expect(f.y[i] - f.y[0]).toBe(COOP_EXTRA_OFFSET);
    }
  });

  it('carries a fraction over from drop to drop', () => {
    const { w, input } = coopWorld(1.5);
    const counts: number[] = [];
    const credits: number[] = [];
    for (let d = 0; d < 4; d++) {
      counts.push(dropOne(w, input));
      credits.push(w.powerups.coopCredit);
    }
    // 1 + 1 extra (0.5 left), 1 + 2 (0 left), 1 + 1 (0.5), 1 + 2 (0).
    expect(counts).toEqual([2, 5, 7, 10]);
    expect(credits).toEqual([0.5, 0, 0.5, 0]);
  });

  it('never scales the blue capsule', () => {
    const { w, input } = coopWorld(1);
    expect(dropOne(w, input, 'carrier-blue')).toBe(1);
    expect(w.powerups.pool.fields.kind[0]).toBe(ItemKind.BlueCapsule);
    expect(w.powerups.coopCredit).toBe(0);
  });

  it('counts a ship that died with lives left as in play', () => {
    const { w, input } = coopWorld(1);
    const p2 = w.players[1];
    p2.state = 'dead';
    p2.stateTicks = 0;
    p2.lives = 2;
    expect(dropOne(w, input)).toBe(2);
  });

  it('keeps the credit while player 2 is out and after it comes back', () => {
    const { w, input } = coopWorld(0.5);
    dropOne(w, input);
    expect(w.powerups.coopCredit).toBe(0.5);
    const p2 = w.players[1];
    p2.state = 'dead';
    p2.stateTicks = PLAYER_DEAD_TICKS + 1;
    p2.lives = 0;
    step(w, input, 0, 0);
    const before = w.powerups.count;
    expect(dropOne(w, input)).toBe(before + 1); // one ship in play: not scaled
    expect(w.powerups.coopCredit).toBe(0.5);
    step(w, input, 0, Action.Pause); // player 2 continues mid-game
    expect(w.players[1].lives).toBe(w.config.startingLives);
    const again = w.powerups.count;
    expect(dropOne(w, input)).toBe(again + 2); // 0.5 + 0.5: the extra comes now
    expect(w.powerups.coopCredit).toBe(0);
  });

  it('hashes the credit', () => {
    const a = coopWorld(0.25);
    const b = coopWorld(0.5);
    expect(hashWorld(a.w)).toBe(hashWorld(b.w)); // the configs themselves are not hashed
    expect(dropOne(a.w, a.input)).toBe(dropOne(b.w, b.input)); // one item each
    expect([a.w.powerups.coopCredit, b.w.powerups.coopCredit]).toEqual([0.25, 0.5]);
    expect(hashWorld(a.w)).not.toBe(hashWorld(b.w));
  });
});
