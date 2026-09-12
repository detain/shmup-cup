/**
 * # scoring — score, hi-scores, lives and extends
 *
 * **Status: partial.** Per-player scores, the clamp, the session hi-score and the crediting of
 * every scoring event of a tick are implemented (plan M1-12). Extends, 1UP items and continues
 * arrive with M2-01; the hi-score table with the saves / name entry (M1-17, M2-15).
 *
 * **Responsibility.** Score keeping: per-enemy values, capsule (300) and bonus capsule (1,000) values,
 * formation and boss-time bonuses, per-player totals in co-op, extends at score
 * thresholds with a lives cap, rare 1UP items, the continue counter shown in the score's
 * last digit, and hi-score table entries (3-letter name, score, stage/zone reached, per
 * mode/difficulty).
 *
 * **Scores.** One {@link PlayerScore} per player slot ({@link ScoreBoard.scores}); {@link addScore}
 * adds points, clamped at {@link MAX_SCORE} (99,999,990 — eight digits with the continue digit
 * free, shmup_feat.md §10), marks the score `displayDirty` (the HUD redraws it, then clears the
 * flag) and raises the session hi-score ({@link ScoreBoard.hiScore}) when it is beaten. Lives live
 * on the ship (`PlayerShip.lives`, `core/player`).
 *
 * **What scores** (all values from data): an enemy kill credited to a player — the enemy spec's
 * `score` (`content/enemies/`); a capsule pickup — the item kind's points (300,
 * `core/powerups` `CAPSULE_SCORE`); a completed formation — the stage event's `bonus`
 * (`content/stages/`), credited to the player who killed its last member. Kills credited to
 * nobody (-1: debug tools) score nothing. The {@link ScoringSystem} reads the tick outcomes of the
 * enemy and power-up systems: in tick phase 7 (after the shots' hits, pickups and Mega Crash) and,
 * for kills made between ticks (tools), at the start of phase 3 — every outcome is credited
 * exactly once.
 *
 * **Hi-score.** Session-wide, starting at 0 or at the value the host sets from its save
 * ({@link ScoreBoard.setHiScore}, M1-17). It is presentation data derived from the scores, so it is
 * **not** part of the state hash (a saved hi-score must not change a replay's hashes); the scores
 * are.
 *
 * **Zero allocation.** Scores are class instances with number fields; crediting reads typed arrays.
 *
 * **Implements.**
 * - shmup_feat.md §15 Scoring, lives, rank & loops (score, hi-score, lives, extends)
 * - shmup_feat.md §10 — continues
 *
 * **Public API.** {@link PlayerScore}, {@link ScoreBoard}, {@link createScoreBoard},
 * {@link addScore}, {@link ScoreHost}, {@link ScoringSystem}, {@link ScoringHost},
 * {@link createScoringSystem}, {@link MAX_SCORE}, {@link HiScoreEntry}.
 *
 * **Planned API.** `checkExtend(player)` and the lives cap (M2-01), `insertHiScore(table, entry)`
 * (M1-17 / M2-15), continues (M2-01).
 *
 * @module
 */
import type { EnemyOutcomes } from '../enemies/index.js';
import { MAX_PLAYERS } from '../input/index.js';
import { defineModule } from '../module-info.js';
import type { PowerUpOutcomes } from '../powerups/index.js';

/** Module descriptor (see {@link defineModule}). */
export const moduleInfo = defineModule({
  name: 'scoring',
  status: 'partial',
  specRefs: ['shmup_feat.md §15', 'shmup_feat.md §10'],
});

/** Highest score a player can reach (plan M1-12): eight digits, the last one kept for continues. */
export const MAX_SCORE = 99_999_990;

/** Score state of one player (a class: its fields stay unboxed numbers). */
export class PlayerScore {
  /** Current score, 0 … {@link MAX_SCORE}. */
  score = 0;
  /** `true` when the score changed since the HUD last drew it (the HUD clears it). */
  displayDirty = false;
}

/** One hi-score table row. */
export interface HiScoreEntry {
  /** Three letters. */
  readonly name: string;
  /** Final score. */
  readonly score: number;
  /** Stage / zone reached. */
  readonly reached: string;
  /** Game mode the score was set in (arcade, boss rush, …). */
  readonly mode: string;
  /** Difficulty preset of the run. */
  readonly difficulty: string;
}

/** The scores of one session (a class: monomorphic fields). */
export class ScoreBoard {
  /** One score per player slot ({@link MAX_PLAYERS}). */
  readonly scores: readonly PlayerScore[];
  /** The session hi-score: the best of the starting value and every score so far. */
  hiScore = 0;
  /** `true` when the hi-score changed since the HUD last drew it (the HUD clears it). */
  hiScoreDirty = false;

  /**
   * Builds the per-player scores.
   *
   * @param players - Player slots.
   */
  constructor(players: number) {
    const scores: PlayerScore[] = [];
    for (let p = 0; p < players; p++) scores.push(new PlayerScore());
    this.scores = scores;
  }

  /**
   * Sets the hi-score to show (the host's saved best, M1-17). Only raises it; the session's own
   * scores keep raising it too.
   *
   * @param value - Saved hi-score (NaN / negative ignored; capped at {@link MAX_SCORE}).
   * @returns The hi-score afterwards.
   */
  setHiScore(value: number): number {
    if (value > this.hiScore) {
      const next = value > MAX_SCORE ? MAX_SCORE : Math.floor(value);
      // Only a real change marks the HUD dirty (10.5 over 10 floors back to 10; the cap stays).
      if (next > this.hiScore) {
        this.hiScore = next;
        this.hiScoreDirty = true;
      }
    }
    return this.hiScore;
  }
}

/**
 * Creates the scores of a session: every player at 0, hi-score 0.
 *
 * @param players - Player slots (default {@link MAX_PLAYERS}).
 * @returns The board.
 */
export function createScoreBoard(players: number = MAX_PLAYERS): ScoreBoard {
  return new ScoreBoard(players);
}

/** Anything that carries a {@link ScoreBoard} (the World). */
export interface ScoreHost {
  /** The session's scores. */
  readonly scoring: {
    /** The board. */
    readonly board: ScoreBoard;
  };
}

/**
 * Adds points to a player's score (the one way scores change). Never allocates.
 *
 * @remarks
 * The result is clamped at {@link MAX_SCORE}. Points that are not positive (0, negative, NaN) and
 * a player slot the board does not have change nothing. A change marks the score `displayDirty`
 * and raises the session hi-score when beaten (marking it dirty too). Fractions are floored.
 *
 * @param host - The World (anything with `scoring.board`).
 * @param player - Player slot.
 * @param points - Points to add.
 * @returns The player's score afterwards (0 for a bad slot).
 *
 * @example
 * ```ts
 * addScore(world, 0, 300); // a capsule
 * world.scoring.board.scores[0].score; // → 300
 * ```
 */
export function addScore(host: ScoreHost, player: number, points: number): number {
  const board = host.scoring.board;
  const scores = board.scores;
  if (!(player >= 0 && player < scores.length && player % 1 === 0)) return 0;
  const entry = scores[player];
  if (!(points > 0)) return entry.score;
  const before = entry.score;
  let next = before + Math.floor(points);
  if (next > MAX_SCORE) next = MAX_SCORE;
  if (next === before) return before;
  entry.score = next;
  entry.displayDirty = true;
  if (next > board.hiScore) {
    board.hiScore = next;
    board.hiScoreDirty = true;
  }
  return next;
}

/** What the scoring system reads from its World (the World implements it). */
export interface ScoringHost extends ScoreHost {
  /** The enemies' tick outcomes (kills with their score and killer, formation bonuses). */
  readonly enemies: {
    /** Kills, drops and bonuses of the tick. */
    readonly outcomes: EnemyOutcomes;
  };
  /** The power-ups' tick outcomes (pickups with their points). */
  readonly powerups: {
    /** Pickups of the last collision phase. */
    readonly outcomes: PowerUpOutcomes;
  };
}

/** Credits the tick's scoring events (see the module docs). */
export interface ScoringSystem {
  /** The session's scores. */
  readonly board: ScoreBoard;
  /** Enemy kills of the current outcomes already credited (hashed). */
  readonly killsScored: number;
  /** Formation bonuses of the current outcomes already credited (hashed). */
  readonly bonusesScored: number;
  /**
   * Phase 3, before the enemy system resets its outcomes: credits kills and bonuses recorded since
   * the last {@link ScoringSystem.resolve} (made between ticks by tools), then resets the counts.
   * Never allocates.
   */
  beginTick(): void;
  /**
   * Phase 7, after the shots' hits and the power-ups: credits the tick's kills, formation bonuses
   * and pickups. Never allocates.
   */
  resolve(): void;
  /** Checkpoint restart: forgets the credited counts (the enemy outcomes are reset too). */
  clear(): void;
}

/** The scoring system (a class: monomorphic methods). */
class ScoringSystemImpl implements ScoringSystem {
  /** See {@link ScoringSystem.board}. */
  readonly board: ScoreBoard;
  /** See {@link ScoringSystem.killsScored}. */
  killsScored = 0;
  /** See {@link ScoringSystem.bonusesScored}. */
  bonusesScored = 0;
  /** The World. */
  private readonly host: ScoringHost;

  /**
   * Builds the board.
   *
   * @param host - The World.
   */
  constructor(host: ScoringHost) {
    this.host = host;
    this.board = createScoreBoard(MAX_PLAYERS);
  }

  /** Credits the enemy kills and formation bonuses not credited yet. */
  private creditEnemies(): void {
    const host = this.host;
    const o = host.enemies.outcomes;
    const kills = o.killCount;
    for (let k = this.killsScored; k < kills; k++) {
      const by = o.killBy[k];
      if (by >= 0) addScore(host, by, o.killScore[k]);
    }
    if (kills > this.killsScored) this.killsScored = kills;
    const bonuses = o.bonusCount;
    for (let b = this.bonusesScored; b < bonuses; b++) {
      const by = o.bonusBy[b];
      if (by >= 0) addScore(host, by, o.bonusScore[b]);
    }
    if (bonuses > this.bonusesScored) this.bonusesScored = bonuses;
  }

  /** See {@link ScoringSystem.beginTick}. */
  beginTick(): void {
    this.creditEnemies();
    this.killsScored = 0;
    this.bonusesScored = 0;
  }

  /** See {@link ScoringSystem.resolve}. */
  resolve(): void {
    this.creditEnemies();
    const host = this.host;
    const p = host.powerups.outcomes;
    for (let k = 0; k < p.pickupCount; k++) addScore(host, p.pickupPlayer[k], p.pickupScore[k]);
  }

  /** See {@link ScoringSystem.clear}. */
  clear(): void {
    this.killsScored = 0;
    this.bonusesScored = 0;
  }
}

/**
 * Creates the scoring system of a World (load time).
 *
 * @param host - The World (read at every call — pass the World itself; its `scoring` field must
 *   be this system once the World is built).
 * @returns The system, with every score at 0.
 *
 * @example
 * ```ts
 * world.scoring = createScoringSystem(world);
 * ```
 */
export function createScoringSystem(host: ScoringHost): ScoringSystem {
  return new ScoringSystemImpl(host);
}
