/**
 * `core/events` edge cases: what the ring does when a visitor mutates the queue it is
 * draining, how the typed-array field widths clip out-of-range values, and the
 * invariants the cue registries must keep as content is added (shmup_plan.md M1-01).
 */
import { describe, expect, it } from 'vitest';
import {
  FX_CUES,
  FX_CUE_NAMES,
  MUSIC_CUES,
  MUSIC_CUE_NAMES,
  SFX_CUES,
  SFX_CUE_NAMES,
  SIM_EVENT_KIND_NAMES,
  SimEventKind,
  createEventQueue,
  type SimEvent,
} from '../../src/events/index.js';

/**
 * Drains a queue into plain copies of its records (the visitor's argument is reused).
 *
 * @param queue - The queue to drain.
 * @returns One snapshot per event, in drain order.
 */
function drainToArray(queue: ReturnType<typeof createEventQueue>): SimEvent[] {
  const out: SimEvent[] = [];
  queue.drain((event) => {
    out.push({ kind: event.kind, id: event.id, x: event.x, y: event.y, param: event.param });
  });
  return out;
}

describe('core/events — a visitor that pushes while draining', () => {
  it('never visits an event the same drain pushed (regression: released slots were reused)', () => {
    // The ring is exactly full and the visitor floods it. Before the fix, `drain`
    // released all four slots up front, so the visitor's pushes overwrote the events
    // 1…3 that had not been visited yet and the drain reported them as originals.
    const queue = createEventQueue(4);
    for (let i = 0; i < 4; i += 1) queue.push(SimEventKind.Sfx, i, 0, 0, 0);

    const seen: number[] = [];
    queue.drain((event) => {
      seen.push(event.id);
      for (let i = 0; i < 4; i += 1) queue.push(SimEventKind.Shake, 900 + i, 0, 0, 0);
    });

    // Only the original events may be visited, and only once.
    for (const id of seen) expect(id).toBeLessThan(900);
    expect(new Set(seen).size).toBe(seen.length);
    // Whatever survived the overflow is visited exactly once, by the *next* drain.
    expect(drainToArray(queue).map((event) => event.id)).toEqual([900, 901, 902, 903]);
  });

  it('counts the unvisited events an overflowing visitor destroyed', () => {
    const queue = createEventQueue(4);
    for (let i = 0; i < 4; i += 1) queue.push(SimEventKind.Sfx, i, 0, 0, 0);
    let visits = 0;
    queue.drain(() => {
      visits += 1;
      for (let i = 0; i < 4; i += 1) queue.push(SimEventKind.Shake, 900 + i, 0, 0, 0);
    });
    // 1 visited + 3 destroyed by the overflow = the 4 events that were pending.
    expect(visits).toBe(1);
    expect(queue.dropped).toBe(4 - visits);
    expect(queue.length).toBe(queue.capacity);
  });

  it('visits every original when the visitor pushes but the ring has room', () => {
    const queue = createEventQueue(16);
    for (let i = 0; i < 4; i += 1) queue.push(SimEventKind.Sfx, i, 0, 0, 0);
    const seen: number[] = [];
    queue.drain((event) => {
      seen.push(event.id);
      queue.push(SimEventKind.Particles, 100 + event.id, 0, 0, 0);
    });
    expect(seen).toEqual([0, 1, 2, 3]);
    expect(queue.dropped).toBe(0);
    expect(drainToArray(queue).map((event) => event.id)).toEqual([100, 101, 102, 103]);
  });

  it('ends the drain when the visitor clears the queue', () => {
    const queue = createEventQueue(8);
    for (let i = 0; i < 5; i += 1) queue.push(SimEventKind.Sfx, i, 0, 0, 0);
    const seen: number[] = [];
    queue.drain((event) => {
      seen.push(event.id);
      if (event.id === 1) queue.clear();
    });
    expect(seen).toEqual([0, 1]);
    expect(queue.length).toBe(0);
    expect(drainToArray(queue)).toEqual([]);
  });

  it('terminates when the visitor pushes one event per visit forever', () => {
    const queue = createEventQueue(8);
    queue.push(SimEventKind.HitStop, 0, 0, 0, 1);
    for (let round = 0; round < 50; round += 1) {
      let visits = 0;
      queue.drain(() => {
        visits += 1;
        queue.push(SimEventKind.HitStop, round, 0, 0, 1);
      });
      expect(visits).toBe(1);
      expect(queue.length).toBe(1);
    }
  });

  it('survives a visitor that drains the queue re-entrantly', () => {
    const queue = createEventQueue(8);
    for (let i = 0; i < 3; i += 1) queue.push(SimEventKind.Sfx, i, 0, 0, 0);
    const seen: number[] = [];
    queue.drain((event) => {
      seen.push(event.id);
      // The inner drain consumes whatever is still pending; the outer one must then
      // find nothing left rather than read released slots.
      queue.drain((inner) => seen.push(inner.id));
    });
    expect(seen).toEqual([0, 1, 2]);
    expect(queue.length).toBe(0);
  });
});

describe('core/events — ring edge cases', () => {
  it('works at capacity 1: every push drops the previous event', () => {
    const queue = createEventQueue(1);
    queue.push(SimEventKind.Sfx, 1, 0, 0, 0);
    queue.push(SimEventKind.Sfx, 2, 0, 0, 0);
    queue.push(SimEventKind.Sfx, 3, 0, 0, 0);
    expect(queue.length).toBe(1);
    expect(queue.dropped).toBe(2);
    expect(drainToArray(queue).map((event) => event.id)).toEqual([3]);
  });

  it('keeps counting drops across drains until clear()', () => {
    const queue = createEventQueue(2);
    for (let i = 0; i < 4; i += 1) queue.push(SimEventKind.Sfx, i, 0, 0, 0);
    expect(queue.dropped).toBe(2);
    drainToArray(queue);
    expect(queue.dropped).toBe(2);
    for (let i = 0; i < 3; i += 1) queue.push(SimEventKind.Sfx, i, 0, 0, 0);
    expect(queue.dropped).toBe(3);
    queue.clear();
    expect(queue.dropped).toBe(0);
  });

  it('stays consistent over thousands of interleaved pushes and drains', () => {
    const queue = createEventQueue(5);
    let pushed = 0;
    let visited = 0;
    for (let tick = 0; tick < 2000; tick += 1) {
      const burst = tick % 7;
      for (let i = 0; i < burst; i += 1) {
        queue.push(SimEventKind.Particles, pushed % 65536, tick, i, 0);
        pushed += 1;
      }
      expect(queue.length).toBeLessThanOrEqual(queue.capacity);
      if (tick % 3 === 0) queue.drain(() => (visited += 1));
    }
    queue.drain(() => (visited += 1));
    expect(queue.length).toBe(0);
    expect(visited + queue.dropped).toBe(pushed);
  });

  it('does nothing when an empty queue is drained or cleared', () => {
    const queue = createEventQueue(4);
    let visits = 0;
    queue.drain(() => (visits += 1));
    queue.clear();
    queue.drain(() => (visits += 1));
    expect(visits).toBe(0);
    expect(queue.length).toBe(0);
    expect(queue.dropped).toBe(0);
  });

  it('rejects capacities that are not positive integers', () => {
    for (const bad of [0, -1, 1.5, NaN, Infinity, -Infinity]) {
      expect(() => createEventQueue(bad), String(bad)).toThrow(RangeError);
    }
    expect(createEventQueue(1).capacity).toBe(1);
  });
});

describe('core/events — record field widths', () => {
  it('stores ids as unsigned 16-bit, which every cue registry fits into', () => {
    const queue = createEventQueue(2);
    queue.push(SimEventKind.Sfx, 65535, 0, 0, 0);
    expect(drainToArray(queue)[0]?.id).toBe(65535);
    // Documented ceiling: content ids must stay below 65536 (M1-02 resolves them).
    expect(SFX_CUE_NAMES.length).toBeLessThan(65536);
    expect(MUSIC_CUE_NAMES.length).toBeLessThan(65536);
  });

  it('stores kinds as unsigned 8-bit, which every SimEventKind fits into', () => {
    for (const kind of Object.values(SimEventKind)) {
      const queue = createEventQueue(1);
      queue.push(kind, 0, 0, 0, 0);
      expect(drainToArray(queue)[0]?.kind).toBe(kind);
      expect(kind).toBeLessThan(256);
    }
  });

  it('carries x, y and param at full float64 precision', () => {
    const queue = createEventQueue(4);
    const values = [Number.MIN_SAFE_INTEGER, -0.1, 1 / 3, Number.MAX_SAFE_INTEGER];
    for (const value of values) queue.push(SimEventKind.Shake, 0, value, -value, value / 7);
    const drained = drainToArray(queue);
    for (let i = 0; i < values.length; i += 1) {
      const value = values[i];
      expect(drained[i]?.x).toBe(value);
      expect(drained[i]?.y).toBe(-value);
      expect(drained[i]?.param).toBe(value / 7);
    }
  });
});

describe('core/events — cue registries', () => {
  it('names every kind and cue with a non-empty, unique string', () => {
    for (const names of [SIM_EVENT_KIND_NAMES, SFX_CUE_NAMES, MUSIC_CUE_NAMES]) {
      expect(new Set(names).size).toBe(names.length);
      for (const name of names) expect(name.length).toBeGreaterThan(0);
    }
  });

  it('freezes the registries so content cannot patch ids at runtime', () => {
    expect(Object.isFrozen(SIM_EVENT_KIND_NAMES)).toBe(true);
    expect(Object.isFrozen(SFX_CUE_NAMES)).toBe(true);
    expect(Object.isFrozen(MUSIC_CUE_NAMES)).toBe(true);
  });

  it('pins the cue ids the audio content and replays depend on (append, never renumber)', () => {
    // A failure here means an id was inserted or reordered: every saved replay and every
    // content file that resolved these names would now point at a different sound.
    expect(SFX_CUES.PlayerShot).toBe(0);
    expect(SFX_CUES.PlayerMissile).toBe(1);
    expect(SFX_CUES.PlayerDeath).toBe(8);
    expect(SFX_CUES.MegaCrash).toBe(15);
    expect(SFX_CUES.WarningSiren).toBe(20);
    expect(SFX_CUES.Clink).toBe(21);
    expect(SFX_CUE_NAMES.length).toBe(22);

    expect(MUSIC_CUES.Silence).toBe(0);
    expect(MUSIC_CUES.Title).toBe(1);
    expect(MUSIC_CUES.Stage).toBe(4);
    expect(MUSIC_CUES.Boss).toBe(5);
    expect(MUSIC_CUES.Escape).toBe(14);
    expect(MUSIC_CUE_NAMES.length).toBe(15);

    expect(Object.values(SimEventKind)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(SIM_EVENT_KIND_NAMES).toEqual([
      'sfx',
      'music',
      'particles',
      'shake',
      'flash',
      'hitstop',
      'rumble',
      'formationBonus',
    ]);
    expect(FX_CUES).toEqual({
      ExplosionSmall: 0,
      ExplosionMedium: 1,
      ExplosionLarge: 2,
      BulletCancel: 3,
    });
    expect(FX_CUE_NAMES).toEqual([
      'ExplosionSmall',
      'ExplosionMedium',
      'ExplosionLarge',
      'BulletCancel',
    ]);
    expect(Object.isFrozen(FX_CUE_NAMES)).toBe(true);
  });
});
