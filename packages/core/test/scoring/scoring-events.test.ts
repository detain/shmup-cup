/**
 * The `SimEventKind.Score` events of `core/scoring` (plan M1-14 — the score popups) beyond
 * `scoring.test.ts`: kills made between ticks (tools) pop up when `beginTick` credits them;
 * every credited kill pops exactly once, even over several resolves; points are whole
 * (fractions truncated) and places whole pixels (floored — negative positions too); a kill worth
 * less than one point scores but shows nothing; player 2's kills carry `id` 1; formation
 * bonuses and pickups push no `Score` (they have their own feedback); a host without an event
 * queue still scores; outcomes that shrank (an enemy reset) push nothing; and the World pushes
 * a `Score` for a kill recorded between ticks, without any effect on `hashWorld`.
 */
import { describe, expect, it } from 'vitest';
import { resolveGameConfig } from '../../src/config/index.js';
import { EMPTY_CONTENT_DB } from '../../src/data/index.js';
import { hashWorld } from '../../src/debug/index.js';
import type { EnemyOutcomes } from '../../src/enemies/index.js';
import { SimEventKind, createEventQueue, type EventQueue } from '../../src/events/index.js';
import { createInputSnapshot } from '../../src/input/index.js';
import type { PowerUpOutcomes } from '../../src/powerups/index.js';
import { createScoringSystem, type ScoringSystem } from '../../src/scoring/index.js';
import { createWorld, stepWorld } from '../../src/world/index.js';

/** Writable enemy outcomes. */
type Kills = { -readonly [K in keyof EnemyOutcomes]: EnemyOutcomes[K] };
/** Writable pickup outcomes. */
type Pickups = { -readonly [K in keyof PowerUpOutcomes]: PowerUpOutcomes[K] };

/**
 * A scoring system on fake, writable outcomes, with an event queue.
 *
 * @param withEvents - Give the host a queue (default true).
 * @returns The system, its outcomes and the queue.
 */
function system(withEvents = true): {
  scoring: ScoringSystem;
  kills: Kills;
  pickups: Pickups;
  events: EventQueue;
} {
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
  const events = createEventQueue();
  const host = {
    enemies: { outcomes: kills as EnemyOutcomes },
    powerups: { outcomes: pickups as PowerUpOutcomes },
    scoring: null as unknown as ScoringSystem,
    ...(withEvents ? { events } : {}),
  };
  host.scoring = createScoringSystem(host);
  return { scoring: host.scoring, kills, pickups, events };
}

/**
 * Appends a kill.
 *
 * @param o - The outcomes.
 * @param by - Killer (-1 = nobody).
 * @param score - Points.
 * @param x - Where.
 * @param y - Where.
 */
function kill(o: Kills, by: number, score: number, x = 0, y = 0): void {
  o.killBy[o.killCount] = by;
  o.killScore[o.killCount] = score;
  o.killX[o.killCount] = x;
  o.killY[o.killCount] = y;
  o.killCount++;
}

/**
 * The `Score` events in a queue (drained).
 *
 * @param events - The queue.
 * @returns `[id, x, y, param]` per event.
 */
function scores(events: EventQueue): number[][] {
  const out: number[][] = [];
  events.drain((event) => {
    if (event.kind === SimEventKind.Score) out.push([event.id, event.x, event.y, event.param]);
  });
  return out;
}

describe('core/scoring Score events (M1-14 popups)', () => {
  it('pops kills made between ticks when beginTick credits them', () => {
    const { scoring, kills, events } = system();
    kill(kills, 0, 250, 40, 50);
    scoring.beginTick();
    expect(scores(events)).toEqual([[0, 40, 50, 250]]);
    expect(scoring.board.scores[0].score).toBe(250);
  });

  it('pops every credited kill once over several resolves', () => {
    const { scoring, kills, events } = system();
    kill(kills, 0, 100, 1, 1);
    scoring.resolve();
    kill(kills, 1, 200, 2, 2);
    scoring.resolve();
    scoring.resolve();
    expect(scores(events)).toEqual([
      [0, 1, 1, 100],
      [1, 2, 2, 200],
    ]);
  });

  it('pushes whole points and whole-pixel places (floored, negatives too)', () => {
    const { scoring, kills, events } = system();
    kill(kills, 0, 99.75, -3.5, 7.999);
    kill(kills, 1, 0.5, 10, 10); // scores half a point, pops nothing
    scoring.resolve();
    const seen = scores(events);
    expect(seen).toEqual([[0, -4, 7, 99]]);
    for (const value of seen[0]) expect(Object.is(value, -0)).toBe(false);
  });

  it('pushes nothing for bonuses, pickups, anonymous kills or outcomes that shrank', () => {
    const { scoring, kills, pickups, events } = system();
    kills.bonusBy[0] = 0;
    kills.bonusScore[0] = 1000;
    kills.bonusCount = 1;
    pickups.pickupPlayer[0] = 0;
    pickups.pickupScore[0] = 300;
    pickups.pickupCount = 1;
    kill(kills, -1, 500);
    scoring.resolve();
    expect(scores(events)).toEqual([]);
    expect(scoring.board.scores[0].score).toBe(1300);
    kill(kills, 0, 10);
    kill(kills, 0, 10);
    scoring.resolve(); // 3 kills credited (one anonymous)
    kills.killCount = 1; // the enemies reset their outcomes without a phase 3
    scoring.resolve();
    expect(scores(events)).toHaveLength(2);
  });

  it('still scores without an event queue (hosts that want no popups)', () => {
    const { scoring, kills, events } = system(false);
    kill(kills, 0, 100);
    expect(() => scoring.resolve()).not.toThrow();
    expect(scoring.board.scores[0].score).toBe(100);
    expect(scores(events)).toEqual([]);
  });

  it('is pushed by the World for a kill recorded between ticks, without touching the hash', () => {
    const config = resolveGameConfig({ seed: 3 });
    const a = createWorld(config, EMPTY_CONTENT_DB);
    const b = createWorld(config, EMPTY_CONTENT_DB);
    const input = createInputSnapshot();
    // A kill in the enemy outcomes between ticks (what a tool's kill leaves), credited in phase 3.
    const o = a.enemies.outcomes as unknown as Kills;
    kill(o, 0, 400, 120.6, 64.2);
    stepWorld(a, input);
    const popped = scores(a.events);
    expect(popped).toEqual([[0, 120, 64, 400]]);
    // The same points credited without the event (a host that cleared it) hash the same.
    const ob = b.enemies.outcomes as unknown as Kills;
    kill(ob, 0, 400, 120.6, 64.2);
    stepWorld(b, input);
    b.events.clear();
    expect(hashWorld(a)).toBe(hashWorld(b));
  });
});
