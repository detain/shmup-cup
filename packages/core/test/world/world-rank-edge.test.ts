/**
 * Edge cases of the World's rank (plan M2-01, shmup_feat.md §15) beyond `world-rank.test.ts`:
 *
 * - the rank is recomputed at the end of phase 3, so the scripts of phase 4 in the same tick
 *   already see a power-up taken between ticks;
 * - the bullet system is told only about a changed rank (never re-evaluating the curves per
 *   tick);
 * - the most powerful active ship counts — player 2 when it holds more; a ship that is dead or
 *   respawning keeps counting what the death penalty left it;
 * - Easy's growth of 0.5 halves the power term; `rankGrowth` 0 ignores power, stage and loop;
 * - the debug counters show the current rank; the state hash covers the rank inputs (a changed
 *   `special` or `loop` term changes it) and two Worlds fed the same input stay in lockstep while
 *   their rank changes.
 */
import { describe, expect, it } from 'vitest';
import { resolveGameConfig, type GameConfig } from '../../src/config/index.js';
import { EMPTY_CONTENT_DB } from '../../src/data/index.js';
import { collectDebugCounters, createDebugCounters, hashWorld } from '../../src/debug/index.js';
import { Action, commitPlayerInput, createInputSnapshot } from '../../src/input/index.js';
import { grantShield } from '../../src/shields/index.js';
import { MainWeapon } from '../../src/weapons/index.js';
import { createWorld, stepWorld, updateWorldRank, type World } from '../../src/world/index.js';

/**
 * A free-flight World (no content) past the fly-in.
 *
 * @param overrides - Config overrides.
 * @returns The World.
 */
function world(overrides: Partial<GameConfig> = {}): World {
  const w = createWorld(resolveGameConfig({ seed: 9, ...overrides }), EMPTY_CONTENT_DB);
  w.debugFlags.godMode = true;
  run(w, 45);
  return w;
}

/**
 * Steps a World with no input.
 *
 * @param w - The World.
 * @param ticks - Ticks.
 */
function run(w: World, ticks: number): void {
  const input = createInputSnapshot();
  for (let i = 0; i < ticks; i++) stepWorld(w, input);
}

/**
 * Counts the bullet system's `setRank` calls from now on.
 *
 * @param w - The World.
 * @returns The ranks passed, in order (a live array).
 */
function spySetRank(w: World): number[] {
  const calls: number[] = [];
  const bullets = w.bullets as { setRank(rank: number): void };
  const original = bullets.setRank.bind(bullets);
  bullets.setRank = (rank: number): void => {
    calls.push(rank);
    original(rank);
  };
  return calls;
}

describe('core/world rank timing (M2-01)', () => {
  it('hands the bullet system a changed rank only', () => {
    const w = world();
    const calls = spySetRank(w);
    run(w, 30);
    expect(calls).toEqual([]); // an unchanged rank is never re-applied
    w.weapons.loadouts[0].options = 2;
    run(w, 10);
    expect(calls).toEqual([4]);
    w.weapons.loadouts[0].options = 0;
    run(w, 1);
    expect(calls).toEqual([4, 2]);
    expect(updateWorldRank(w)).toBe(2);
    expect(calls).toEqual([4, 2]);
  });

  it('recomputes before the scripts of the same tick (end of phase 3)', () => {
    const w = world();
    w.weapons.loadouts[0].missile = true;
    w.weapons.loadouts[0].main = MainWeapon.Laser;
    expect(w.rank).toBe(2); // nothing recomputes between ticks
    const calls = spySetRank(w);
    stepWorld(w, createInputSnapshot());
    expect(calls).toEqual([6]);
    expect(w.bullets.rank).toBe(6);
  });
});

describe('core/world rank power term (M2-01)', () => {
  it('uses player 2 when it holds more', () => {
    const w = world();
    w.players[1].active = true;
    w.weapons.loadouts[0].missile = true; // P1: 1
    w.weapons.loadouts[1].main = MainWeapon.Laser; // P2: 3 + 2 Options
    w.weapons.loadouts[1].options = 2;
    expect(updateWorldRank(w)).toBe(7);
    expect(w.rankInputs.power).toBe(5);
    grantShield(w.players[0].shield); // P1: 1 + 4 = 5, still not more than P2
    expect(updateWorldRank(w)).toBe(7);
    w.weapons.loadouts[0].options = 1; // P1: 6
    expect(updateWorldRank(w)).toBe(8);
  });

  it('keeps counting a dead or respawning ship with what the penalty left it', () => {
    const w = world({ loadout: 'full' });
    expect(w.rank).toBe(14);
    for (const state of ['dying', 'dead', 'respawning'] as const) {
      w.players[0].state = state;
      expect(updateWorldRank(w), state).toBe(14);
    }
    w.players[0].active = false;
    expect(updateWorldRank(w)).toBe(2);
  });

  it('halves the power term on Easy and ignores every term with growth 0', () => {
    const easy = world({ difficulty: 'easy', loadout: 'full' });
    expect(easy.rank).toBe(6); // 0 + floor(0.5 × 12)
    easy.weapons.loadouts[0].options = 3; // 11 → floor(5.5) = 5
    expect(updateWorldRank(easy)).toBe(5);
    const flat = world({ difficulty: 'hard', rankGrowth: 0, loadout: 'full' });
    flat.rankInputs.loop = 3;
    flat.rankInputs.stage = 7;
    flat.rankInputs.special = 5;
    expect(updateWorldRank(flat)).toBe(4);
  });

  it('counts the special term and caps it on loop 1', () => {
    const w = world();
    w.rankInputs.special = 3;
    expect(updateWorldRank(w)).toBe(5);
    w.rankInputs.special = 99;
    expect(updateWorldRank(w)).toBe(16);
    w.rankInputs.loop = 2;
    expect(updateWorldRank(w)).toBe(31);
  });
});

describe('core/world rank in the debug tools (M2-01)', () => {
  it('shows the current rank in the debug counters', () => {
    const w = world({ difficulty: 'hard' });
    const counters = createDebugCounters();
    collectDebugCounters(w, counters);
    expect(counters.rank).toBe(4);
    w.weapons.loadouts[0].options = 4;
    run(w, 1);
    collectDebugCounters(w, counters);
    expect(counters.rank).toBe(8);
  });

  it('hashes the rank inputs', () => {
    const a = world();
    const b = world();
    expect(hashWorld(a)).toBe(hashWorld(b));
    b.rankInputs.special = 1;
    expect(hashWorld(a)).not.toBe(hashWorld(b));
    b.rankInputs.special = 0;
    expect(hashWorld(a)).toBe(hashWorld(b));
    b.rankInputs.loop = 2;
    expect(hashWorld(a)).not.toBe(hashWorld(b));
  });

  it('stays in lockstep while the rank changes', () => {
    const play = (): number[] => {
      const w = world({ difficulty: 'arcade' });
      const input = createInputSnapshot();
      const ranks: number[] = [];
      for (let t = 0; t < 240; t++) {
        if (t === 60) w.weapons.loadouts[0].options = 3;
        if (t === 120) grantShield(w.players[0].shield);
        if (t === 180) w.weapons.loadouts[0].options = 0;
        commitPlayerInput(input.players[0], t % 40 < 20 ? Action.Up : Action.Down);
        stepWorld(w, input);
        ranks.push(w.rank);
      }
      ranks.push(hashWorld(w));
      return ranks;
    };
    const first = play();
    expect(play()).toEqual(first);
    expect(new Set(first.slice(0, 240))).toEqual(new Set([6, 9, 13, 10]));
  });
});
