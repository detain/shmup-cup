/**
 * `core/scoring` (plan M1-12): `addScore` (clamp at 99,999,990, per-player totals, the dirty
 * flags, the session hi-score, odd inputs), `ScoreBoard.setHiScore`, and the scoring system's
 * crediting of tick outcomes — kills by their killer only, formation bonuses, pickups — exactly
 * once, including kills made between ticks. The World-level score tests are in
 * `test/world/world-death.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { resolveGameConfig } from '../../src/config/index.js';
import { EMPTY_CONTENT_DB } from '../../src/data/index.js';
import { hashWorld } from '../../src/debug/index.js';
import type { EnemyOutcomes } from '../../src/enemies/index.js';
import { MAX_PLAYERS } from '../../src/input/index.js';
import type { PowerUpOutcomes } from '../../src/powerups/index.js';
import {
  MAX_SCORE,
  PlayerScore,
  addScore,
  createScoreBoard,
  createScoringSystem,
  moduleInfo,
  type ScoringSystem,
} from '../../src/scoring/index.js';
import { createWorld } from '../../src/world/index.js';

/** Writable tick outcomes of the two source systems. */
interface FakeOutcomes {
  /** Enemy kills and bonuses. */
  enemies: { outcomes: EnemyOutcomes & Record<string, unknown> };
  /** Pickups. */
  powerups: { outcomes: PowerUpOutcomes & Record<string, unknown> };
}

/**
 * A scoring system on fake outcomes (the host is built around it).
 *
 * @returns The system and its writable outcomes.
 */
function system(): { scoring: ScoringSystem; o: FakeOutcomes } {
  const o: FakeOutcomes = {
    enemies: {
      outcomes: {
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
      },
    },
    powerups: {
      outcomes: {
        pickupCount: 0,
        pickupPlayer: new Int8Array(8),
        pickupKind: new Uint8Array(8),
        pickupX: new Float64Array(8),
        pickupY: new Float64Array(8),
        pickupScore: new Float64Array(8),
      },
    },
  };
  const host = { ...o, scoring: null as unknown as ScoringSystem };
  host.scoring = createScoringSystem(host);
  return { scoring: host.scoring, o };
}

/**
 * Appends a kill to fake outcomes.
 *
 * @param o - The outcomes.
 * @param by - Killer.
 * @param score - Points.
 */
function kill(o: FakeOutcomes, by: number, score: number): void {
  const e = o.enemies.outcomes;
  const k = e.killCount;
  e.killBy[k] = by;
  e.killScore[k] = score;
  (e as { killCount: number }).killCount = k + 1;
}

describe('core/scoring', () => {
  it('imports cleanly and describes itself', () => {
    expect(moduleInfo.name).toBe('scoring');
    expect(moduleInfo.status).toBe('partial');
    expect(moduleInfo.specRefs.length).toBeGreaterThan(0);
  });

  it('starts every player at 0 with a clean display and no hi-score', () => {
    const board = createScoreBoard();
    expect(board.scores).toHaveLength(MAX_PLAYERS);
    expect(board.scores[0]).toBeInstanceOf(PlayerScore);
    expect(board.scores.map((s) => [s.score, s.displayDirty])).toEqual([
      [0, false],
      [0, false],
    ]);
    expect([board.hiScore, board.hiScoreDirty]).toEqual([0, false]);
    expect(MAX_SCORE).toBe(99_999_990);
  });
});

describe('core/scoring addScore', () => {
  it('adds per player, marks the display dirty and raises the hi-score', () => {
    const host = { scoring: { board: createScoreBoard() } };
    const board = host.scoring.board;
    expect(addScore(host, 0, 300)).toBe(300);
    expect(addScore(host, 1, 500)).toBe(500);
    expect(addScore(host, 0, 100)).toBe(400);
    expect(board.scores.map((s) => s.score)).toEqual([400, 500]);
    expect(board.scores.map((s) => s.displayDirty)).toEqual([true, true]);
    expect([board.hiScore, board.hiScoreDirty]).toEqual([500, true]);
  });

  it('clamps at 99,999,990 (no change once there: the display stays clean)', () => {
    const host = { scoring: { board: createScoreBoard() } };
    const score = host.scoring.board.scores[0];
    score.score = MAX_SCORE - 5;
    expect(addScore(host, 0, 1000)).toBe(MAX_SCORE);
    score.displayDirty = false;
    expect(addScore(host, 0, 1000)).toBe(MAX_SCORE);
    expect(score.displayDirty).toBe(false);
    expect(host.scoring.board.hiScore).toBe(MAX_SCORE);
  });

  it('ignores 0, negative and NaN points and bad player slots; floors fractions', () => {
    const host = { scoring: { board: createScoreBoard() } };
    const scores = host.scoring.board.scores;
    expect([addScore(host, 0, 0), addScore(host, 0, -50), addScore(host, 0, Number.NaN)]).toEqual([
      0, 0, 0,
    ]);
    expect(scores[0].displayDirty).toBe(false);
    for (const bad of [-1, 2, 0.5, Number.NaN]) expect(addScore(host, bad, 100)).toBe(0);
    expect(addScore(host, 1, 99.9)).toBe(99);
  });

  it('setHiScore only raises it (the saved best), capped and whole', () => {
    const board = createScoreBoard();
    expect(board.setHiScore(12_345.6)).toBe(12_345);
    expect(board.hiScoreDirty).toBe(true);
    board.hiScoreDirty = false;
    expect(board.setHiScore(100)).toBe(12_345);
    expect(board.setHiScore(Number.NaN)).toBe(12_345);
    expect(board.hiScoreDirty).toBe(false);
    expect(board.setHiScore(1e12)).toBe(MAX_SCORE);
    const host = { scoring: { board } };
    addScore(host, 0, 500);
    expect(board.hiScore).toBe(MAX_SCORE); // a lower session score does not lower it
  });
});

describe('core/scoring system', () => {
  it('credits kills to their killer, skips anonymous ones, and credits bonuses and pickups', () => {
    const { scoring, o } = system();
    kill(o, 0, 100);
    kill(o, -1, 999);
    kill(o, 1, 250);
    const e = o.enemies.outcomes as { bonusCount: number } & EnemyOutcomes;
    e.bonusScore[0] = 1000;
    e.bonusBy[0] = 1;
    e.bonusCount = 1;
    const p = o.powerups.outcomes as { pickupCount: number } & PowerUpOutcomes;
    p.pickupPlayer[0] = 0;
    p.pickupScore[0] = 300;
    p.pickupCount = 1;
    scoring.resolve();
    expect(scoring.board.scores.map((s) => s.score)).toEqual([400, 1250]);
    expect([scoring.killsScored, scoring.bonusesScored]).toEqual([3, 1]);
  });

  it('credits each kill once: phase 7, a later kill between ticks at phase 3, then resets', () => {
    const { scoring, o } = system();
    kill(o, 0, 100);
    scoring.resolve();
    kill(o, 0, 50); // a tool's kill after phase 7
    scoring.beginTick();
    expect(scoring.board.scores[0].score).toBe(150);
    expect([scoring.killsScored, scoring.bonusesScored]).toEqual([0, 0]);
    (o.enemies.outcomes as { killCount: number }).killCount = 0; // the enemies reset theirs
    scoring.resolve();
    expect(scoring.board.scores[0].score).toBe(150);
    kill(o, 0, 10);
    scoring.clear();
    expect(scoring.killsScored).toBe(0);
  });

  it('is part of the World: `world.scoring.board`, scores hashed, the hi-score not', () => {
    const a = createWorld(resolveGameConfig({ seed: 2 }), EMPTY_CONTENT_DB);
    const b = createWorld(resolveGameConfig({ seed: 2 }), EMPTY_CONTENT_DB);
    b.scoring.board.setHiScore(50_000);
    expect(hashWorld(b)).toBe(hashWorld(a));
    addScore(b, 0, 10);
    expect(hashWorld(b)).not.toBe(hashWorld(a));
    expect(b.scoring.board.hiScore).toBe(50_000);
  });
});
