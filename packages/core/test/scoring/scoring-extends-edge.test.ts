/**
 * Edge cases of the M2-01 extends and continue digit (`core/scoring`, shmup_feat.md §15 / §10)
 * beyond `scoring-extends.test.ts`:
 *
 * - kills and formation bonuses (not only pickups) crossing a threshold, in `resolve` and in
 *   `beginTick`, the life going to the player credited;
 * - two players extending independently, each sound at its own ship; a host with fewer ships than
 *   score slots;
 * - a big score crossing several thresholds near the cap (lives up to 9, every threshold used up,
 *   one sound per life given); lives lost below the cap make the next threshold give a life again;
 * - no event queue: lives are still given; `resetExtends` with `extendFirst` 0; `checkExtends`
 *   returning the lives of both players;
 * - the continue digit: kept through the clamp, at the cap, after nine continues; `markContinue`
 *   marking the score dirty and raising the hi-score only when beaten; bad slots.
 */
import { describe, expect, it } from 'vitest';
import type { EnemyOutcomes } from '../../src/enemies/index.js';
import {
  SFX_CUES,
  SfxPriority,
  SimEventKind,
  createEventQueue,
  type EventQueue,
} from '../../src/events/index.js';
import { createPlayer, type PlayerShip } from '../../src/player/index.js';
import type { PowerUpOutcomes } from '../../src/powerups/index.js';
import {
  MAX_LIVES,
  MAX_SCORE,
  addScore,
  createScoreBoard,
  createScoringSystem,
  markContinue,
  type ScoringSystem,
} from '../../src/scoring/index.js';

/** Writable enemy outcomes. */
type Kills = { -readonly [K in keyof EnemyOutcomes]: EnemyOutcomes[K] };
/** Writable pickup outcomes. */
type Pickups = { -readonly [K in keyof PowerUpOutcomes]: PowerUpOutcomes[K] };

/** A scoring system on a fake host. */
interface Fixture {
  readonly scoring: ScoringSystem;
  readonly kills: Kills;
  readonly pickups: Pickups;
  readonly players: PlayerShip[];
  readonly events: EventQueue | undefined;
  readonly host: { readonly scoring: ScoringSystem };
}

/**
 * Builds a fixture: both ships active with 3 lives, P1 at (40, 100), P2 at (60, 150).
 *
 * @param options - Thresholds, ship count and whether there is an event queue.
 * @returns The fixture.
 */
function fixture(
  options: { first?: number; every?: number; ships?: number; events?: boolean } = {},
): Fixture {
  const { first = 20_000, every = 70_000, ships = 2, events: withEvents = true } = options;
  const kills = {
    killCount: 0,
    killSpec: new Int32Array(8),
    killX: new Float64Array(8),
    killY: new Float64Array(8),
    killScore: new Float64Array(8),
    killBy: new Int8Array(8),
    dropCount: 0,
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
  const players: PlayerShip[] = [];
  for (let p = 0; p < ships; p++) {
    const ship = createPlayer(p, 3);
    ship.active = true;
    ship.x = 40 + 20 * p;
    ship.y = 100 + 50 * p;
    players.push(ship);
  }
  const events = withEvents ? createEventQueue() : undefined;
  const host = {
    enemies: { outcomes: kills as EnemyOutcomes },
    powerups: { outcomes: pickups as PowerUpOutcomes },
    scoring: null as unknown as ScoringSystem,
    players,
    config: { extendFirst: first, extendEvery: every },
    events,
    status: 'playing',
  };
  host.scoring = createScoringSystem(host);
  return { scoring: host.scoring, kills, pickups, players, events, host };
}

/**
 * Appends a kill to the outcomes.
 *
 * @param f - The fixture.
 * @param by - Killer.
 * @param score - Points.
 */
function kill(f: Fixture, by: number, score: number): void {
  const o = f.kills;
  o.killBy[o.killCount] = by;
  o.killScore[o.killCount] = score;
  o.killCount++;
}

/**
 * Credits pickups for players and resolves.
 *
 * @param f - The fixture.
 * @param credits - `[player, points]` pairs.
 */
function pickups(f: Fixture, ...credits: Array<[number, number]>): void {
  for (let i = 0; i < credits.length; i++) {
    f.pickups.pickupPlayer[i] = credits[i][0];
    f.pickups.pickupScore[i] = credits[i][1];
  }
  f.pickups.pickupCount = credits.length;
  f.scoring.resolve();
  f.pickups.pickupCount = 0;
}

/**
 * The `ExtraLife` sounds in a queue.
 *
 * @param events - The queue.
 * @returns `[x, y, priority]` per sound.
 */
function oneUps(events: EventQueue | undefined): Array<[number, number, number]> {
  const out: Array<[number, number, number]> = [];
  events?.drain((e) => {
    if (e.kind === SimEventKind.Sfx && e.id === SFX_CUES.ExtraLife) out.push([e.x, e.y, e.param]);
  });
  return out;
}

describe('core/scoring extends from kills and bonuses (M2-01)', () => {
  it('extends the killer when a kill crosses the threshold in resolve', () => {
    const f = fixture();
    kill(f, 1, 19_000);
    kill(f, 1, 1_000);
    f.scoring.resolve();
    expect(f.players.map((p) => p.lives)).toEqual([3, 4]);
    expect(oneUps(f.events)).toEqual([[60, 150, SfxPriority.Critical]]);
    // The same kills are not credited twice by the next beginTick.
    f.scoring.beginTick();
    expect(f.scoring.board.scores[1].score).toBe(20_000);
    expect(f.players[1].lives).toBe(4);
  });

  it('extends from a formation bonus and from kills made between ticks', () => {
    const f = fixture();
    f.kills.bonusBy[0] = 0;
    f.kills.bonusScore[0] = 20_000;
    f.kills.bonusCount = 1;
    f.scoring.resolve();
    expect(f.players[0].lives).toBe(4);
    f.kills.bonusCount = 0;
    f.kills.killCount = 0;
    f.scoring.clear();
    kill(f, 0, 70_000); // a tool's kill between ticks: credited by beginTick
    f.scoring.beginTick();
    expect(f.players[0].lives).toBe(5);
    expect(f.scoring.board.scores[0].nextExtend).toBe(160_000);
  });

  it('gives nothing for kills credited to nobody', () => {
    const f = fixture();
    kill(f, -1, 900_000);
    f.scoring.resolve();
    expect(f.players.map((p) => p.lives)).toEqual([3, 3]);
    expect(f.scoring.board.scores.map((s) => s.nextExtend)).toEqual([20_000, 20_000]);
  });
});

describe('core/scoring extends for two players (M2-01)', () => {
  it('keeps a threshold per player and returns the lives given to both', () => {
    const f = fixture();
    addScore(f.host, 0, 20_000);
    addScore(f.host, 1, 90_000);
    expect(f.scoring.checkExtends()).toBe(3); // P1 one, P2 two
    expect(f.players.map((p) => p.lives)).toEqual([4, 5]);
    expect(f.scoring.board.scores.map((s) => s.nextExtend)).toEqual([90_000, 160_000]);
    expect(oneUps(f.events)).toEqual([
      [40, 100, SfxPriority.Critical],
      [60, 150, SfxPriority.Critical],
      [60, 150, SfxPriority.Critical],
    ]);
    expect(f.scoring.checkExtends()).toBe(0); // nothing new
  });

  it('checks only the slots it has ships for', () => {
    const f = fixture({ ships: 1 });
    addScore(f.host, 0, 20_000);
    addScore(f.host, 1, 20_000);
    expect(f.scoring.checkExtends()).toBe(1);
    expect(f.scoring.board.scores[1].nextExtend).toBe(20_000); // waits for a ship
  });

  it('credits the pickups of both players in one tick', () => {
    const f = fixture();
    pickups(f, [0, 19_990], [1, 20_000], [0, 10]);
    expect(f.players.map((p) => p.lives)).toEqual([4, 4]);
  });
});

describe('core/scoring extends at the lives cap (M2-01)', () => {
  it('uses every threshold of a big score, giving lives only up to 9', () => {
    const f = fixture();
    f.players[0].lives = 7;
    pickups(f, [0, 250_000]); // 20k, 90k, 160k, 230k
    expect(f.players[0].lives).toBe(MAX_LIVES);
    const score = f.scoring.board.scores[0];
    expect([score.extendsEarned, score.nextExtend]).toEqual([4, 300_000]);
    expect(oneUps(f.events)).toHaveLength(2);
  });

  it('gives a life again once one is lost below the cap', () => {
    const f = fixture({ first: 1_000, every: 1_000 });
    f.players[0].lives = MAX_LIVES;
    pickups(f, [0, 1_000]);
    expect(f.players[0].lives).toBe(MAX_LIVES);
    f.players[0].lives = 5;
    pickups(f, [0, 1_000]);
    expect(f.players[0].lives).toBe(6);
    expect(f.scoring.board.scores[0].extendsEarned).toBe(2);
  });

  it('never takes a life away from a ship above the cap (set by a tool)', () => {
    const f = fixture();
    f.players[0].lives = 12;
    pickups(f, [0, 30_000]);
    expect(f.players[0].lives).toBe(12);
    expect(f.scoring.board.scores[0].nextExtend).toBe(90_000);
  });
});

describe('core/scoring extends without extras (M2-01)', () => {
  it('still gives lives without an event queue', () => {
    const f = fixture({ events: false });
    pickups(f, [0, 20_000]);
    expect(f.players[0].lives).toBe(4);
  });

  it('resetExtends with extendFirst 0 turns extends off', () => {
    const f = fixture({ first: 0 });
    f.scoring.resetExtends();
    expect(f.scoring.board.scores.map((s) => s.nextExtend)).toEqual([0, 0]);
    pickups(f, [0, 500_000]);
    expect(f.players[0].lives).toBe(3);
  });

  it('keeps the thresholds on a session clear', () => {
    const f = fixture();
    pickups(f, [0, 25_000]);
    f.scoring.clear();
    expect(f.scoring.board.scores[0].nextExtend).toBe(90_000);
    expect(f.scoring.board.scores[0].extendsEarned).toBe(1);
  });
});

describe('core/scoring the continue digit edges (M2-01)', () => {
  it('keeps the digit when the clamp hits', () => {
    const board = createScoreBoard(1);
    const host = { scoring: { board } };
    board.scores[0].score = MAX_SCORE - 100;
    markContinue(board, 0);
    markContinue(board, 0);
    markContinue(board, 0);
    expect(board.scores[0].score).toBe(MAX_SCORE - 100 + 3);
    expect(addScore(host, 0, 500)).toBe(MAX_SCORE + 3);
    expect(addScore(host, 0, 10)).toBe(MAX_SCORE + 3); // no change at the cap
    expect(board.scores[0].score % 10).toBe(3);
  });

  it('keeps the digit at 9 through more continues and points', () => {
    const board = createScoreBoard(1);
    const host = { scoring: { board } };
    for (let i = 0; i < 9; i++) markContinue(board, 0);
    expect(board.scores[0].score).toBe(9);
    expect(addScore(host, 0, 1_230)).toBe(1_239);
    expect(markContinue(board, 0)).toBe(1_239);
    expect(board.scores[0].continues).toBe(9);
  });

  it('marks the score dirty and raises the hi-score only when beaten', () => {
    const board = createScoreBoard(1);
    board.hiScore = 50_000;
    board.scores[0].score = 12_340;
    board.scores[0].displayDirty = false;
    markContinue(board, 0);
    expect(board.scores[0].displayDirty).toBe(true);
    expect([board.hiScore, board.hiScoreDirty]).toEqual([50_000, false]);
    board.scores[0].score = 50_000;
    markContinue(board, 0);
    expect([board.hiScore, board.hiScoreDirty]).toEqual([50_002, true]);
  });

  it('replaces a last digit a non-multiple of 10 left (the continue owns it)', () => {
    const board = createScoreBoard(1);
    board.scores[0].score = 12_347;
    expect(markContinue(board, 0)).toBe(12_341);
  });

  it('ignores bad slots', () => {
    const board = createScoreBoard(2);
    for (const slot of [-1, 2, 0.5, Number.NaN]) expect(markContinue(board, slot)).toBe(0);
    expect(board.scores.map((s) => [s.score, s.continues])).toEqual([
      [0, 0],
      [0, 0],
    ]);
  });
});
