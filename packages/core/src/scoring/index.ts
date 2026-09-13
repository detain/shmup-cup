/**
 * # scoring — score, hi-scores, lives and extends
 *
 * **Status: partial.** Per-player scores, the clamp, the session hi-score and the crediting of
 * every scoring event of a tick are implemented (plan M1-12); extends and the continue digit
 * (plan M2-01). 1UP items arrive with Direct mode (M2-05). The saved hi-score tables live in
 * `core/save` since M1-17 (`insertHiScore`, `SaveStore.recordScore`, rows of this module's
 * {@link HiScoreEntry}); names from the name entry arrive with M2-15.
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
 * exactly once. Each credited kill worth points also pushes a `SimEventKind.Score` (`id` =
 * player, `x`/`y` = the kill, `param` = points) for the score popups of plan M1-14 — presentation
 * only, never hashed. Pickups push none: they happen on the ship, which a popup would cover (the
 * meter's ding and the pickup ring are their feedback).
 *
 * **Extends (M2-01).** Every {@link PlayerScore} carries its next extend threshold
 * ({@link PlayerScore.nextExtend}: `GameConfig.extendFirst`, then `+ extendEvery` after each one;
 * 0 = no more). Whenever the scoring system credits points ({@link ScoringSystem.resolve}, and
 * {@link ScoringSystem.beginTick} for kills made between ticks) a score that reached its threshold
 * gives the player's ship +1 life, capped at {@link MAX_LIVES} (9 — at the cap the threshold is
 * used up without a life), and pushes the `ExtraLife` SFX with `SfxPriority.Critical` (never
 * stolen, shmup_feat.md §19) at the ship. A score that crosses several thresholds at once gives
 * each life. No extends while the session is over (`status` `gameOver`): the threshold waits —
 * a continue resets the lives anyway.
 *
 * **Continues (M2-01).** A continue (`core/world` `continueWorld`) keeps the score and writes the
 * number of continues used into its **last digit** ({@link markContinue}, shmup_feat.md §10 — the
 * arcade convention; points are multiples of 10, so the digit is free): from then on
 * {@link addScore} keeps that digit (a point value that is not a multiple of 10 cannot change
 * it) and the clamp becomes `MAX_SCORE + digit`.
 *
 * **Hi-score.** Session-wide, starting at 0 or at the value set from outside
 * ({@link ScoreBoard.setHiScore}) — the scene flow sets the save's best score of the game's mode
 * (`core/save`, M1-17). It is presentation data derived from the scores, so it is
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
 * {@link addScore}, {@link markContinue}, {@link ScoreHost}, {@link ScoringSystem},
 * {@link ScoringHost}, {@link createScoringSystem}, {@link MAX_SCORE}, {@link MAX_LIVES},
 * {@link HiScoreEntry}; the rules of `content/rules/` (M2-02) {@link ScoringRules},
 * {@link DEFAULT_SCORING_RULES}, {@link MAX_BULLET_CANCEL_POINTS} — the points of a bullet
 * cancelled into a point item (credited by `core/bullets` through {@link addScore}).
 *
 * **Planned API.** Rare 1UP items (Direct mode, M2-05). (The planned `insertHiScore` became
 * `core/save`'s in M1-17.)
 *
 * @module
 */
import type { GameConfig } from '../config/index.js';
import type { EnemyOutcomes } from '../enemies/index.js';
import { SFX_CUES, SfxPriority, SimEventKind, type EventQueue } from '../events/index.js';
import { MAX_PLAYERS } from '../input/index.js';
import { defineModule } from '../module-info.js';
import type { PlayerShip } from '../player/index.js';
import type { PowerUpOutcomes } from '../powerups/index.js';

/** Module descriptor (see {@link defineModule}). */
export const moduleInfo = defineModule({
  name: 'scoring',
  status: 'partial',
  specRefs: ['shmup_feat.md §15', 'shmup_feat.md §10'],
});

/** Highest score a player can reach (plan M1-12): eight digits, the last one kept for continues. */
export const MAX_SCORE = 99_999_990;

/** Most lives a ship can hold (shmup_feat.md §15 "lives cap"; extends stop adding at 9). */
export const MAX_LIVES = 9;

/**
 * Game-wide score values of the `scoring` section of a `content/rules/` file (plan M2-02; the
 * content's `ContentDb.scoring`, else {@link DEFAULT_SCORING_RULES}).
 */
export interface ScoringRules {
  /**
   * Points of each enemy bullet cancelled into a point item (`core/bullets` `CancelMode.Points`:
   * a boss's death, a Mega Crash), credited when the item reaches the player's score.
   */
  readonly bulletCancel: number;
}

/** Highest {@link ScoringRules.bulletCancel} a rules file may give. */
export const MAX_BULLET_CANCEL_POINTS = 10_000;

/** The built-in scoring rules (what `content/rules/scoring.rules.json` ships with). */
export const DEFAULT_SCORING_RULES: ScoringRules = Object.freeze({ bulletCancel: 10 });

/** Score state of one player (a class: its fields stay unboxed numbers). */
export class PlayerScore {
  /**
   * Current score, 0 … {@link MAX_SCORE} (+ the continue digit, see
   * {@link PlayerScore.continues}).
   */
  score = 0;
  /** `true` when the score changed since the HUD last drew it (the HUD clears it). */
  displayDirty = false;
  /**
   * Score of the next extra life (M2-01; 0 = no more extends). The scoring system sets it from
   * `GameConfig.extendFirst` and moves it on by `extendEvery` after each extend.
   */
  nextExtend = 0;
  /** Extra lives this score earned so far (statistics, tests). */
  extendsEarned = 0;
  /**
   * Continues used (M2-01, capped at 9 — shown in the score's last digit: {@link markContinue}).
   */
  continues = 0;
}

/**
 * One hi-score table row — what `core/save` stores in its tables (M1-17; built with its
 * `createHiScoreEntry`).
 */
export interface HiScoreEntry {
  /** Up to 8 characters: three letters from the name entry (M2-15), `---` until then. */
  readonly name: string;
  /** Final score. */
  readonly score: number;
  /** Stage / zone reached (a stage id; `''` in open space). */
  readonly reached: string;
  /** Game mode the score was set in (`1p` in M1; co-op, practice, boss rush … later). */
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
   * @remarks
   * `hiScoreDirty` is set only when the value really raises the hi-score: a fraction that floors
   * back to the current value (10.5 over 10) or a second value above the cap changes nothing.
   *
   * @param value - Saved hi-score (NaN / negative ignored; fractions floored; capped at
   *   {@link MAX_SCORE}).
   * @returns The hi-score afterwards.
   *
   * @example
   * ```ts
   * world.scoring.board.setHiScore(store.bestScore(hiScoreModeKey(world.config))); // core/save
   * ```
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
 * Creates the scores of a session: every player at 0, hi-score 0. The World's board is made by
 * {@link createScoringSystem}; a standalone board is for tools and tests.
 *
 * @param players - Player slots (default {@link MAX_PLAYERS}).
 * @returns The board.
 *
 * @example
 * ```ts
 * const board = createScoreBoard(1);
 * addScore({ scoring: { board } }, 0, 500); // board.scores[0].score → 500
 * ```
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
 * The result is clamped at {@link MAX_SCORE} (plus the continue digit after a continue — its last
 * digit stays the number of continues used, {@link markContinue}). Points that are not positive
 * (0, negative, NaN) and a player slot the board does not have change nothing. A change marks the
 * score `displayDirty` and raises the session hi-score when beaten (marking it dirty too).
 * Fractions are floored. Extends are not checked here — the scoring system does that after
 * crediting a tick.
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
  const digit = entry.continues;
  // The clamp first (it also catches infinite points), then the continue digit.
  if (next > MAX_SCORE + digit) next = MAX_SCORE + digit;
  else if (digit > 0) next = next - (next % 10) + digit;
  if (next === before) return before;
  entry.score = next;
  entry.displayDirty = true;
  if (next > board.hiScore) {
    board.hiScore = next;
    board.hiScoreDirty = true;
  }
  return next;
}

/**
 * Records a continue in a player's score (shmup_feat.md §10: the continue count shown in the
 * score's last digit): `continues` goes up by one (at most 9) and the score's last digit becomes
 * it. Cold path (a continue); never allocates.
 *
 * @param board - The session's scores.
 * @param player - Player slot (a bad slot does nothing).
 * @returns The player's score afterwards (0 for a bad slot).
 *
 * @example
 * ```ts
 * board.scores[0].score = 12_340;
 * markContinue(board, 0); // → 12_341
 * markContinue(board, 0); // → 12_342
 * ```
 */
export function markContinue(board: ScoreBoard, player: number): number {
  const scores = board.scores;
  if (!(player >= 0 && player < scores.length && player % 1 === 0)) return 0;
  const entry = scores[player];
  const used = entry.continues < 9 ? entry.continues + 1 : 9;
  entry.continues = used;
  entry.score = entry.score - (entry.score % 10) + used;
  entry.displayDirty = true;
  if (entry.score > board.hiScore) {
    board.hiScore = entry.score;
    board.hiScoreDirty = true;
  }
  return entry.score;
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
  /**
   * Presentation events: every credited kill worth points pushes a `SimEventKind.Score` there
   * (the score popups, plan M1-14), every extend its `ExtraLife` SFX. Absent = no events (tests).
   */
  readonly events?: EventQueue;
  /**
   * The ships whose `lives` extends raise (index = player slot). Absent = no extends (tests).
   */
  readonly players?: readonly PlayerShip[];
  /**
   * The extend thresholds (`extendFirst`, `extendEvery`), read when the system is created and on
   * {@link ScoringSystem.resetExtends}. Absent = no extends.
   */
  readonly config?: Pick<GameConfig, 'extendFirst' | 'extendEvery'>;
  /** The session status: no extends while it is `gameOver`. */
  readonly status?: string;
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
   * the last {@link ScoringSystem.resolve} (made between ticks by tools), then resets the counts
   * and gives the extends reached. Never allocates.
   */
  beginTick(): void;
  /**
   * Phase 7, after the shots' hits and the power-ups: credits the tick's kills, formation bonuses
   * and pickups, then gives the extends reached. Never allocates.
   */
  resolve(): void;
  /**
   * Session clear (a checkpoint restart, or the `arcade` respawn in free flight): forgets the
   * credited counts — the enemy outcomes are reset with them. Scores, extend thresholds and the
   * hi-score stay.
   */
  clear(): void;
  /**
   * Gives every player's extends that its score has reached (see the module docs) — what
   * {@link ScoringSystem.resolve} and {@link ScoringSystem.beginTick} call after crediting. Never
   * allocates.
   *
   * @returns Extra lives given.
   */
  checkExtends(): number;
  /**
   * Sets every player's next extend back to the config's first threshold and forgets the extends
   * earned (a new game on the same board — tests and tools; the World's board starts that way).
   */
  resetExtends(): void;
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
    this.resetExtends();
  }

  /** See {@link ScoringSystem.resetExtends}. */
  resetExtends(): void {
    const config = this.host.config;
    const first = config === undefined ? 0 : config.extendFirst;
    const scores = this.board.scores;
    for (let p = 0; p < scores.length; p++) {
      scores[p].nextExtend = first > 0 ? first : 0;
      scores[p].extendsEarned = 0;
    }
  }

  /** See {@link ScoringSystem.checkExtends}. */
  checkExtends(): number {
    const host = this.host;
    const players = host.players;
    const config = host.config;
    if (players === undefined || config === undefined || host.status === 'gameOver') return 0;
    const every = config.extendEvery;
    const scores = this.board.scores;
    let given = 0;
    for (let p = 0; p < scores.length && p < players.length; p++) {
      const entry = scores[p];
      let next = entry.nextExtend;
      if (next <= 0 || entry.score < next) continue;
      const ship = players[p];
      while (next > 0 && entry.score >= next) {
        next = every > 0 ? next + every : 0;
        entry.extendsEarned++;
        if (ship.lives < MAX_LIVES) {
          ship.lives++;
          given++;
          const events = host.events;
          if (events !== undefined) {
            events.push(
              SimEventKind.Sfx,
              SFX_CUES.ExtraLife,
              Math.floor(ship.x) | 0,
              Math.floor(ship.y) | 0,
              SfxPriority.Critical,
            );
          }
        }
      }
      entry.nextExtend = next;
    }
    return given;
  }

  /** Credits the enemy kills and formation bonuses not credited yet. */
  private creditEnemies(): void {
    const host = this.host;
    const o = host.enemies.outcomes;
    const kills = o.killCount;
    const events = host.events;
    for (let k = this.killsScored; k < kills; k++) {
      const by = o.killBy[k];
      if (by < 0) continue;
      const points = o.killScore[k];
      addScore(host, by, points);
      // The score popup (plan M1-14): whole numbers only — a fractional argument to the queue's
      // non-inlined `push` would be boxed.
      if (events !== undefined && points >= 1) {
        events.push(
          SimEventKind.Score,
          by,
          Math.floor(o.killX[k]) | 0,
          Math.floor(o.killY[k]) | 0,
          points | 0,
        );
      }
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
    this.checkExtends();
  }

  /** See {@link ScoringSystem.resolve}. */
  resolve(): void {
    this.creditEnemies();
    const host = this.host;
    const p = host.powerups.outcomes;
    for (let k = 0; k < p.pickupCount; k++) addScore(host, p.pickupPlayer[k], p.pickupScore[k]);
    this.checkExtends();
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
