/**
 * `core/events` — ring behaviour (push order, drop-oldest overflow, reused record) and
 * the cue registries the audio content maps onto (shmup_plan.md M1-01).
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EVENT_QUEUE_CAPACITY,
  MUSIC_CUES,
  MUSIC_CUE_NAMES,
  SFX_CUES,
  SFX_CUE_NAMES,
  SIM_EVENT_KIND_NAMES,
  SimEventKind,
  createEventQueue,
  moduleInfo,
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

describe('core/events', () => {
  it('describes itself as implemented', () => {
    expect(moduleInfo.name).toBe('events');
    expect(moduleInfo.status).toBe('implemented');
  });

  it('numbers the event kinds and names them in code order', () => {
    expect(SimEventKind.Sfx).toBe(0);
    expect(SIM_EVENT_KIND_NAMES.length).toBe(Object.keys(SimEventKind).length);
    const codes = Object.values(SimEventKind);
    expect(codes).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(SIM_EVENT_KIND_NAMES[SimEventKind.HitStop]).toBe('hitstop');
  });

  it('keeps the cue registries dense, unique and in name order', () => {
    for (const [cues, names] of [
      [SFX_CUES, SFX_CUE_NAMES],
      [MUSIC_CUES, MUSIC_CUE_NAMES],
    ] as const) {
      const ids = Object.values(cues);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).toEqual(ids.map((_id, index) => index));
      expect(names.length).toBe(ids.length);
      for (const [name, id] of Object.entries(cues)) expect(names[id]).toBe(name);
    }
    expect(MUSIC_CUES.Silence).toBe(0);
    expect(SFX_CUE_NAMES[SFX_CUES.WarningSiren]).toBe('WarningSiren');
  });

  it('starts empty with the default capacity', () => {
    const queue = createEventQueue();
    expect(queue.capacity).toBe(DEFAULT_EVENT_QUEUE_CAPACITY);
    expect(queue.length).toBe(0);
    expect(queue.dropped).toBe(0);
  });

  it('rejects a nonsensical capacity', () => {
    expect(() => createEventQueue(0)).toThrow(RangeError);
    expect(() => createEventQueue(-1)).toThrow(RangeError);
    expect(() => createEventQueue(2.5)).toThrow(RangeError);
  });

  it('drains events in push order and empties itself', () => {
    const queue = createEventQueue(8);
    queue.push(SimEventKind.Sfx, SFX_CUES.PlayerShot, 1, 2, 3);
    queue.push(SimEventKind.Shake, 0, -4, 5.5, 2);
    queue.push(SimEventKind.Music, MUSIC_CUES.Boss, 0, 0, 30);
    expect(queue.length).toBe(3);

    const drained = drainToArray(queue);
    expect(drained).toEqual([
      { kind: SimEventKind.Sfx, id: SFX_CUES.PlayerShot, x: 1, y: 2, param: 3 },
      { kind: SimEventKind.Shake, id: 0, x: -4, y: 5.5, param: 2 },
      { kind: SimEventKind.Music, id: MUSIC_CUES.Boss, x: 0, y: 0, param: 30 },
    ]);
    expect(queue.length).toBe(0);
    expect(drainToArray(queue)).toEqual([]);
  });

  it('hands the visitor one reused record', () => {
    const queue = createEventQueue(4);
    queue.push(SimEventKind.Flash, 0, 0, 0, 1);
    queue.push(SimEventKind.Flash, 1, 0, 0, 2);
    const seen: Readonly<SimEvent>[] = [];
    queue.drain((event) => seen.push(event));
    expect(seen.length).toBe(2);
    expect(seen[0]).toBe(seen[1]);
  });

  it('drops the oldest events when the ring overflows and counts them', () => {
    const queue = createEventQueue(4);
    for (let i = 0; i < 7; i += 1) queue.push(SimEventKind.Particles, i, 0, 0, 0);
    expect(queue.length).toBe(4);
    expect(queue.dropped).toBe(3);
    expect(drainToArray(queue).map((event) => event.id)).toEqual([3, 4, 5, 6]);
  });

  it('keeps working after wrapping around the ring several times', () => {
    const queue = createEventQueue(3);
    for (let round = 0; round < 10; round += 1) {
      queue.push(SimEventKind.Sfx, round, 0, 0, 0);
      queue.push(SimEventKind.Sfx, round + 100, 0, 0, 0);
      expect(drainToArray(queue).map((event) => event.id)).toEqual([round, round + 100]);
    }
    expect(queue.dropped).toBe(0);
  });

  it('queues events pushed from inside drain for the next drain', () => {
    const queue = createEventQueue(4);
    queue.push(SimEventKind.HitStop, 0, 0, 0, 8);
    let visits = 0;
    queue.drain((event) => {
      visits += 1;
      if (event.kind === SimEventKind.HitStop) queue.push(SimEventKind.Shake, 0, 0, 0, 4);
    });
    expect(visits).toBe(1);
    expect(queue.length).toBe(1);
    expect(drainToArray(queue).map((event) => event.kind)).toEqual([SimEventKind.Shake]);
  });

  it('clears pending events and the drop counter', () => {
    const queue = createEventQueue(2);
    for (let i = 0; i < 5; i += 1) queue.push(SimEventKind.Rumble, 0, 0, 0, 1);
    expect(queue.dropped).toBe(3);
    queue.clear();
    expect(queue.length).toBe(0);
    expect(queue.dropped).toBe(0);
    queue.push(SimEventKind.Rumble, 1, 0, 0, 1);
    expect(drainToArray(queue).map((event) => event.id)).toEqual([1]);
  });

  it('carries float positions and parameters unchanged', () => {
    const queue = createEventQueue(2);
    queue.push(SimEventKind.Particles, 7, -123.456, 0.125, -0.5);
    const [event] = drainToArray(queue);
    expect(event).toEqual({
      kind: SimEventKind.Particles,
      id: 7,
      x: -123.456,
      y: 0.125,
      param: -0.5,
    });
  });
});
