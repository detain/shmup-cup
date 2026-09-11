/**
 * Edge cases of the event dispatcher: snapshot semantics while dispatching (handlers added or
 * removed by a handler take effect from the next event), the same handler registered twice,
 * fractional / NaN kinds, forged records with out-of-range kinds, an exception from a handler,
 * and the counters.
 */
import { SIM_EVENT_KIND_NAMES, SimEventKind, createEventQueue, type SimEvent } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { createEventDispatcher } from '../../src/dispatch/index.js';

/**
 * A reusable event record.
 *
 * @param kind - Kind.
 * @param id - Id.
 */
const record = (kind: number, id = 0): SimEvent => ({
  kind: kind as SimEventKind,
  id,
  x: 0,
  y: 0,
  param: 0,
});

describe('shell/dispatch createEventDispatcher (edge)', () => {
  it('a handler registered during a dispatch only sees the following events', () => {
    const events = createEventDispatcher();
    const seen: string[] = [];
    let added = false;
    events.on(SimEventKind.Sfx, (event) => {
      seen.push(`first:${event.id}`);
      if (!added) {
        added = true;
        events.on(SimEventKind.Sfx, (late) => seen.push(`late:${late.id}`));
      }
    });
    events.visit(record(SimEventKind.Sfx, 1));
    events.visit(record(SimEventKind.Sfx, 2));
    expect(seen).toEqual(['first:1', 'first:2', 'late:2']);
  });

  it('removing a later sibling during a dispatch still lets it see the current event', () => {
    const events = createEventDispatcher();
    const seen: string[] = [];
    let offB: () => void = () => {};
    events.on(SimEventKind.Shake, () => {
      seen.push('a');
      offB();
    });
    offB = events.on(SimEventKind.Shake, () => seen.push('b'));
    events.visit(record(SimEventKind.Shake));
    events.visit(record(SimEventKind.Shake));
    expect(seen).toEqual(['a', 'b', 'a']);
    expect(events.handlerCount(SimEventKind.Shake)).toBe(1);
  });

  it('the same function registered twice runs twice; each unsubscribe removes one', () => {
    const events = createEventDispatcher();
    let calls = 0;
    const handler = (): void => {
      calls++;
    };
    const off1 = events.on(SimEventKind.Music, handler);
    const off2 = events.on(SimEventKind.Music, handler);
    events.visit(record(SimEventKind.Music));
    expect(calls).toBe(2);
    off1();
    off1();
    events.visit(record(SimEventKind.Music));
    expect(calls).toBe(3);
    off2();
    events.visit(record(SimEventKind.Music));
    expect(calls).toBe(3);
    expect(events.handlerCount(SimEventKind.Music)).toBe(0);
    expect(events.unhandled).toBe(1);
  });

  it('accepts every declared kind and rejects fractional, NaN and one-past-the-end kinds', () => {
    const events = createEventDispatcher();
    for (let kind = 0; kind < SIM_EVENT_KIND_NAMES.length; kind++) {
      events.on(kind as SimEventKind, () => {});
      expect(events.handlerCount(kind as SimEventKind)).toBe(1);
    }
    for (const bad of [0.5, Number.NaN, SIM_EVENT_KIND_NAMES.length]) {
      expect(() => events.on(bad as SimEventKind, () => {})).toThrow(/unknown SimEventKind/);
      expect(events.handlerCount(bad as SimEventKind)).toBe(0);
    }
  });

  it('counts forged records with negative or fractional kinds as unhandled', () => {
    const events = createEventDispatcher();
    let calls = 0;
    events.on(SimEventKind.Sfx, () => calls++);
    events.on(SimEventKind.Music, () => calls++);
    events.visit(record(-1));
    events.visit(record(0.5));
    events.visit(record(SIM_EVENT_KIND_NAMES.length));
    expect(calls).toBe(0);
    expect([events.dispatched, events.unhandled]).toEqual([3, 3]);
  });

  it('lets a handler exception propagate and keeps working afterwards', () => {
    const events = createEventDispatcher();
    let calls = 0;
    events.on(SimEventKind.Flash, (event) => {
      calls++;
      if (event.id === 1) throw new Error('handler failed');
    });
    expect(() => events.visit(record(SimEventKind.Flash, 1))).toThrow('handler failed');
    events.visit(record(SimEventKind.Flash, 2));
    expect(calls).toBe(2);
    expect(events.dispatched).toBe(2);
  });

  it('drain() empties a queue in push order through the same counters as visit', () => {
    const events = createEventDispatcher();
    const ids: number[] = [];
    events.on(SimEventKind.Particles, (event) => ids.push(event.id));
    const queue = createEventQueue(4);
    for (let id = 0; id < 4; id++) queue.push(SimEventKind.Particles, id, 0, 0, 0);
    events.drain(queue);
    events.drain(queue);
    expect(ids).toEqual([0, 1, 2, 3]);
    expect([events.dispatched, events.unhandled, queue.length]).toEqual([4, 0, 0]);
  });
});
