/**
 * Edge cases of `core/scoring` (plan M1-12) beyond `scoring.test.ts`: `addScore` with infinite
 * points, points that land exactly on the clamp, a board sized for one player, the hi-score's
 * dirty flag only on a real change, `setHiScore` with odd values; the scoring system skipping
 * anonymous formation bonuses, crediting several pickups of both players in one tick, never
 * re-crediting a kill when the outcomes shrink (the enemies reset theirs), and forgetting its
 * counts on a checkpoint restart. Regression (found by these tests): `setHiScore` marked the HUD
 * dirty for a value that did not change the hi-score (one that floors to it, or a second one
 * above the cap).
 */
import { describe, expect, it } from 'vitest';
import type { EnemyOutcomes } from '../../src/enemies/index.js';
import type { PowerUpOutcomes } from '../../src/powerups/index.js';
import {
  MAX_SCORE,
  addScore,
  createScoreBoard,
  createScoringSystem,
  type ScoringSystem,
} from '../../src/scoring/index.js';

/** Writable enemy outcomes. */
type Kills = { -readonly [K in keyof EnemyOutcomes]: EnemyOutcomes[K] };
/** Writable pickup outcomes. */
type Pickups = { -readonly [K in keyof PowerUpOutcomes]: PowerUpOutcomes[K] };

/**
 * A scoring system on fake, writable outcomes.
 *
 * @returns The system and its outcomes.
 */
function system(): { scoring: ScoringSystem; kills: Kills; pickups: Pickups } {
  const kills = {
    killCount: 0,
    killSpec: new Int32Array(8),
    killX: new Float64Array(8),
    killY: new Float64Array(8),
    killScore: new Float64Array(8),
    killBy: new Int8Array(8),
    dropCount: 0,
    dropKind: new Uint8Array(8),
    dropX: new Float64Array(8),
    dropY: new Float64Array(8),
    bonusPoints: 0,
    bonusCount: 0,
    bonusScore: new Float64Array(8),
    bonusBy: new Int8Array(8),
  } as unknown as Kills;
  const pickups: Pickups = {
    pickupCount: 0,
    pickupPlayer: new Int8Array(8),
    pickupKind: new Uint8Array(8),
    pickupX: new Float64Array(8),
    pickupY: new Float64Array(8),
    pickupScore: new Float64Array(8),
  };
  const host = {
    enemies: { outcomes: kills as EnemyOutcomes },
    powerups: { outcomes: pickups as PowerUpOutcomes },
    scoring: null as unknown as ScoringSystem,
  };
  host.scoring = createScoringSystem(host);
  return { scoring: host.scoring, kills, pickups };
}

/**
 * Appends a kill.
 *
 * @param o - The outcomes.
 * @param by - Killer (-1 = nobody).
 * @param score - Points.
 */
function kill(o: Kills, by: number, score: number): void {
  o.killBy[o.killCount] = by;
  o.killScore[o.killCount] = score;
  o.killCount++;
}

/**
 * Appends a formation bonus.
 *
 * @param o - The outcomes.
 * @param by - Its last killer (-1 = nobody).
 * @param score - Points.
 */
function bonus(o: Kills, by: number, score: number): void {
  o.bonusBy[o.bonusCount] = by;
  o.bonusScore[o.bonusCount] = score;
  o.bonusCount++;
}

/**
 * Appends a pickup.
 *
 * @param o - The outcomes.
 * @param player - Collector.
 * @param score - Points.
 */
function pickup(o: Pickups, player: number, score: number): void {
  o.pickupPlayer[o.pickupCount] = player;
  o.pickupScore[o.pickupCount] = score;
  o.pickupCount++;
}

describe('core/scoring addScore edges', () => {
  it('infinite points clamp at MAX_SCORE; points landing exactly on it are kept', () => {
    const host = { scoring: { board: createScoreBoard() } };
    expect(addScore(host, 0, Infinity)).toBe(MAX_SCORE);
    const [, p2] = host.scoring.board.scores;
    p2.score = MAX_SCORE - 300;
    expect(addScore(host, 1, 300)).toBe(MAX_SCORE);
    expect(p2.displayDirty).toBe(true);
  });

  it('a one-player board has no slot 1', () => {
    const host = { scoring: { board: createScoreBoard(1) } };
    expect(host.scoring.board.scores).toHaveLength(1);
    expect(addScore(host, 1, 100)).toBe(0);
    expect(addScore(host, 0, 100)).toBe(100);
  });

  it('marks the hi-score dirty only when a score beats it', () => {
    const host = { scoring: { board: createScoreBoard() } };
    const board = host.scoring.board;
    addScore(host, 0, 500);
    board.hiScoreDirty = false;
    addScore(host, 1, 500); // equal, not better
    expect([board.hiScore, board.hiScoreDirty]).toEqual([500, false]);
    addScore(host, 1, 1);
    expect([board.hiScore, board.hiScoreDirty]).toEqual([501, true]);
    // Player 1 catching up below the hi-score changes its own display only.
    board.hiScoreDirty = false;
    addScore(host, 0, 1);
    expect([board.hiScore, board.hiScoreDirty, board.scores[0].displayDirty]).toEqual([
      501,
      false,
      true,
    ]);
  });

  it('setHiScore ignores negatives and -Infinity, caps +Infinity, and returns the value kept', () => {
    const board = createScoreBoard();
    expect([board.setHiScore(-5), board.setHiScore(-Infinity)]).toEqual([0, 0]);
    expect(board.hiScoreDirty).toBe(false);
    expect(board.setHiScore(Infinity)).toBe(MAX_SCORE);
    expect(board.hiScoreDirty).toBe(true);
  });

  it('a saved hi-score above the session scores stays until a score beats it', () => {
    const host = { scoring: { board: createScoreBoard() } };
    const board = host.scoring.board;
    board.setHiScore(1000);
    addScore(host, 0, 999);
    expect(board.hiScore).toBe(1000);
    addScore(host, 0, 2);
    expect(board.hiScore).toBe(1001);
  });
});

describe('core/scoring system edges', () => {
  it('skips formation bonuses nobody completed and credits the others to their killer', () => {
    const { scoring, kills } = system();
    bonus(kills, -1, 5000);
    bonus(kills, 0, 1000);
    scoring.resolve();
    expect(scoring.board.scores.map((s) => s.score)).toEqual([1000, 0]);
    expect(scoring.bonusesScored).toBe(2);
    scoring.resolve(); // once only
    expect(scoring.board.scores[0].score).toBe(1000);
  });

  it('credits every pickup of the tick to its collector, both players', () => {
    const { scoring, pickups } = system();
    pickup(pickups, 0, 300);
    pickup(pickups, 1, 300);
    pickup(pickups, 0, 300);
    scoring.resolve();
    expect(scoring.board.scores.map((s) => s.score)).toEqual([600, 300]);
    expect(scoring.board.hiScore).toBe(600);
  });

  it('credits kills appended after a resolve at the next resolve only', () => {
    const { scoring, kills } = system();
    kill(kills, 0, 100);
    scoring.resolve();
    kill(kills, 1, 40);
    kill(kills, 0, 60);
    scoring.resolve();
    expect(scoring.board.scores.map((s) => s.score)).toEqual([160, 40]);
    expect(scoring.killsScored).toBe(3);
  });

  it('never re-credits when the outcomes shrink below the credited count (a reset between)', () => {
    const { scoring, kills } = system();
    kill(kills, 0, 100);
    kill(kills, 0, 100);
    scoring.resolve();
    kills.killCount = 0; // the enemy system reset its outcomes without a phase 3 (a restart)
    kill(kills, 0, 7);
    scoring.resolve(); // killsScored (2) is above the count (1): nothing new is credited
    expect(scoring.board.scores[0].score).toBe(200);
    expect(scoring.killsScored).toBe(2);
    scoring.clear(); // what the checkpoint restart does alongside the enemies' reset
    kills.killCount = 0;
    kill(kills, 0, 7);
    scoring.resolve();
    expect(scoring.board.scores[0].score).toBe(207);
  });

  it('beginTick with nothing new credits nothing and resets the counts', () => {
    const { scoring, kills } = system();
    kill(kills, 0, 100);
    bonus(kills, 0, 50);
    scoring.resolve();
    scoring.beginTick();
    expect(scoring.board.scores[0].score).toBe(150);
    expect([scoring.killsScored, scoring.bonusesScored]).toEqual([0, 0]);
  });
});

describe('core/scoring setHiScore — no dirty flag without a change (regression, M1-12 tests)', () => {
  it('a saved value that floors to the current hi-score leaves the HUD clean', () => {
    const board = createScoreBoard();
    board.setHiScore(10);
    board.hiScoreDirty = false;
    expect(board.setHiScore(10.5)).toBe(10);
    expect(board.hiScoreDirty).toBe(false);
  });

  it('a second value above the cap leaves the HUD clean once the hi-score sits at the cap', () => {
    const board = createScoreBoard();
    board.setHiScore(1e12);
    board.hiScoreDirty = false;
    expect(board.setHiScore(2e12)).toBe(MAX_SCORE);
    expect(board.hiScoreDirty).toBe(false);
  });
});
