/**
 * `core/scoring` extends and the continue digit (plan M2-01, shmup_feat.md §15 / §10): the first
 * extra life at `extendFirst`, then every `extendEvery` points; several thresholds crossed at once;
 * the lives cap of 9 (the threshold is used up without a life); the critical `ExtraLife` SFX at
 * the ship; no extends while the session is over or without thresholds; `resetExtends`; the World
 * wiring (kills through `stepWorld` give the life). `markContinue` writes the continues used into
 * the score's last digit, `addScore` keeps that digit and the clamp moves by it.
 */
import { describe, expect, it } from 'vitest';
import { resolveGameConfig } from '../../src/config/index.js';
import { EMPTY_CONTENT_DB } from '../../src/data/index.js';
import type { EnemyOutcomes } from '../../src/enemies/index.js';
import {
  SFX_CUES,
  SfxPriority,
  SimEventKind,
  createEventQueue,
  type EventQueue,
} from '../../src/events/index.js';
import { createInputSnapshot } from '../../src/input/index.js';
import { createPlayer, type PlayerShip } from '../../src/player/index.js';
import type { PowerUpOutcomes } from '../../src/powerups/index.js';
import {
  MAX_LIVES,
  MAX_SCORE,
  addScore,
  createScoringSystem,
  markContinue,
  type ScoringSystem,
} from '../../src/scoring/index.js';
import { createWorld, stepWorld } from '../../src/world/index.js';

/** Writable pickup outcomes. */
type Pickups = { -readonly [K in keyof PowerUpOutcomes]: PowerUpOutcomes[K] };

/** A scoring system on a fake host with ships, thresholds and an event queue. */
interface Fixture {
  readonly scoring: ScoringSystem;
  readonly pickups: Pickups;
  readonly players: PlayerShip[];
  readonly events: EventQueue;
  readonly host: { status: string; readonly scoring: ScoringSystem };
}

/**
 * Builds a fixture.
 *
 * @param first - `extendFirst`.
 * @param every - `extendEvery`.
 * @returns The fixture (player 1 active with 3 lives at x 40, y 100).
 */
function fixture(first = 20_000, every = 70_000): Fixture {
  const pickups: Pickups = {
    pickupCount: 0,
    pickupPlayer: new Int8Array(8),
    pickupKind: new Uint8Array(8),
    pickupX: new Float64Array(8),
    pickupY: new Float64Array(8),
    pickupScore: new Float64Array(8),
  };
  const kills = { killCount: 0, bonusCount: 0 } as unknown as EnemyOutcomes;
  const players = [createPlayer(0, 3), createPlayer(1, 3)];
  players[0].active = true;
  players[0].x = 40.6;
  players[0].y = 100.2;
  const events = createEventQueue();
  const host = {
    enemies: { outcomes: kills },
    powerups: { outcomes: pickups as PowerUpOutcomes },
    scoring: null as unknown as ScoringSystem,
    players,
    config: { extendFirst: first, extendEvery: every },
    events,
    status: 'playing',
  };
  host.scoring = createScoringSystem(host);
  return { scoring: host.scoring, pickups, players, events, host };
}

/**
 * Credits points to player 1 through a pickup (what `resolve` credits) and resolves.
 *
 * @param f - The fixture.
 * @param points - Points.
 */
function credit(f: Fixture, points: number): void {
  f.pickups.pickupCount = 1;
  f.pickups.pickupPlayer[0] = 0;
  f.pickups.pickupScore[0] = points;
  f.scoring.resolve();
  f.pickups.pickupCount = 0;
}

/**
 * The `ExtraLife` sounds in the queue.
 *
 * @param events - The queue.
 * @returns `[x, y, param]` per sound.
 */
function extraLifeSounds(events: EventQueue): Array<[number, number, number]> {
  const out: Array<[number, number, number]> = [];
  events.drain((e) => {
    if (e.kind === SimEventKind.Sfx && e.id === SFX_CUES.ExtraLife) out.push([e.x, e.y, e.param]);
  });
  return out;
}

describe('core/scoring extends (M2-01)', () => {
  it('gives the first life at 20,000, then one every 70,000', () => {
    const f = fixture();
    const score = f.scoring.board.scores[0];
    expect(score.nextExtend).toBe(20_000);
    credit(f, 19_990);
    expect(f.players[0].lives).toBe(3);
    credit(f, 10);
    expect(f.players[0].lives).toBe(4);
    expect([score.nextExtend, score.extendsEarned]).toEqual([90_000, 1]);
    credit(f, 69_990);
    expect(f.players[0].lives).toBe(4);
    credit(f, 10);
    expect(f.players[0].lives).toBe(5);
    expect(score.nextExtend).toBe(160_000);
  });

  it('plays the critical 1UP sound at the ship for every life given', () => {
    const f = fixture();
    credit(f, 25_000);
    expect(extraLifeSounds(f.events)).toEqual([[40, 100, SfxPriority.Critical]]);
  });

  it('gives every threshold a big score crosses at once', () => {
    const f = fixture();
    credit(f, 250_000); // 20k, 90k, 160k, 230k
    expect(f.players[0].lives).toBe(7);
    expect(f.scoring.board.scores[0].nextExtend).toBe(300_000);
    expect(extraLifeSounds(f.events)).toHaveLength(4);
  });

  it('caps the lives at 9: a threshold at the cap is used up without a life or a sound', () => {
    const f = fixture(1_000, 1_000);
    f.players[0].lives = MAX_LIVES - 1;
    credit(f, 3_000);
    expect(f.players[0].lives).toBe(MAX_LIVES);
    expect(f.scoring.board.scores[0].nextExtend).toBe(4_000);
    expect(f.scoring.board.scores[0].extendsEarned).toBe(3);
    expect(extraLifeSounds(f.events)).toHaveLength(1);
  });

  it('extends only once with `every` 0, never with `first` 0', () => {
    const once = fixture(20_000, 0);
    credit(once, 500_000);
    expect(once.players[0].lives).toBe(4);
    expect(once.scoring.board.scores[0].nextExtend).toBe(0);
    const never = fixture(0, 70_000);
    credit(never, 500_000);
    expect(never.players[0].lives).toBe(3);
  });

  it('gives nothing while the game is over; the threshold waits', () => {
    const f = fixture();
    f.host.status = 'gameOver';
    credit(f, 30_000);
    expect(f.players[0].lives).toBe(3);
    expect(f.scoring.checkExtends()).toBe(0);
    f.host.status = 'playing';
    expect(f.scoring.checkExtends()).toBe(1);
    expect(f.players[0].lives).toBe(4);
  });

  it('checks the extends of kills credited at the start of a tick too', () => {
    const f = fixture();
    addScore(f.host, 0, 20_000);
    expect(f.players[0].lives).toBe(3); // addScore alone never extends
    f.scoring.beginTick();
    expect(f.players[0].lives).toBe(4);
  });

  it('resetExtends starts the thresholds over', () => {
    const f = fixture();
    credit(f, 100_000);
    f.scoring.resetExtends();
    expect(f.scoring.board.scores[0].nextExtend).toBe(20_000);
    expect(f.scoring.board.scores[0].extendsEarned).toBe(0);
  });

  it('gives no extends to a host without ships or thresholds', () => {
    const pickups = fixture().pickups;
    const host = {
      enemies: { outcomes: { killCount: 0, bonusCount: 0 } as unknown as EnemyOutcomes },
      powerups: { outcomes: pickups as PowerUpOutcomes },
      scoring: null as unknown as ScoringSystem,
    };
    host.scoring = createScoringSystem(host);
    expect(host.scoring.board.scores[0].nextExtend).toBe(0);
    expect(host.scoring.checkExtends()).toBe(0);
  });

  it('extends a World ship when its kills cross the threshold (Normal: 20,000)', () => {
    const w = createWorld(resolveGameConfig({ seed: 1 }), EMPTY_CONTENT_DB);
    const input = createInputSnapshot();
    stepWorld(w, input);
    const lives = w.players[0].lives;
    addScore(w, 0, 20_000);
    stepWorld(w, input); // phase 3 (beginTick) checks
    expect(w.players[0].lives).toBe(lives + 1);
    // Easy extends the same way; a config without extends never does.
    const none = createWorld(resolveGameConfig({ extendFirst: 0 }), EMPTY_CONTENT_DB);
    addScore(none, 0, 900_000);
    stepWorld(none, input);
    expect(none.players[0].lives).toBe(3);
  });
});

describe('core/scoring the continue digit (M2-01)', () => {
  it('writes the continues used into the last digit and keeps it through later points', () => {
    const f = fixture();
    const board = f.scoring.board;
    board.scores[0].score = 12_340;
    expect(markContinue(board, 0)).toBe(12_341);
    expect(board.scores[0].continues).toBe(1);
    expect(addScore(f.host, 0, 500)).toBe(12_841);
    expect(addScore(f.host, 0, 5)).toBe(12_841); // an odd value cannot move the digit
    expect(addScore(f.host, 0, 15)).toBe(12_851);
    expect(markContinue(board, 0)).toBe(12_852);
    expect(board.hiScore).toBe(12_852);
  });

  it('stops counting at 9 and clamps at MAX_SCORE + the digit', () => {
    const f = fixture();
    const board = f.scoring.board;
    for (let i = 0; i < 12; i++) markContinue(board, 0);
    expect(board.scores[0].continues).toBe(9);
    expect(board.scores[0].score).toBe(9);
    expect(addScore(f.host, 0, Infinity)).toBe(MAX_SCORE + 9);
    expect(markContinue(board, 5)).toBe(0); // a slot the board does not have
  });
});
