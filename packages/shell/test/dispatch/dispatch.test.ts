/**
 * Tests for the event dispatcher: per-kind routing in registration order, unsubscribe (also
 * during a dispatch), unhandled counting, bad kinds, and draining a real core event queue.
 */
import { SimEventKind, createEventQueue, type SimEvent } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { createEventDispatcher, moduleInfo } from '../../src/dispatch/index.js';

describe('shell/dispatch createEventDispatcher', () => {
  it('describes itself', () => {
    expect(moduleInfo.name).toBe('dispatch');
    expect(moduleInfo.status).toBe('implemented');
  });

  it('routes each drained event to the handlers of its kind, in registration order', () => {
    const events = createEventDispatcher();
    const seen: string[] = [];
    events.on(SimEventKind.Sfx, (event) => seen.push(`a:${event.id}`));
    events.on(SimEventKind.Sfx, (event) => seen.push(`b:${event.id}`));
    events.on(SimEventKind.Shake, (event) => seen.push(`shake:${event.param}`));
    const queue = createEventQueue(8);
    queue.push(SimEventKind.Sfx, 3, 0, 0, 0);
    queue.push(SimEventKind.Shake, 0, 0, 0, 2);
    queue.push(SimEventKind.Music, 1, 0, 0, 0);
    events.drain(queue);
    expect(seen).toEqual(['a:3', 'b:3', 'shake:2']);
    expect([events.dispatched, events.unhandled]).toEqual([3, 1]);
    expect(queue.length).toBe(0);
  });

  it('exposes a bound visitor usable directly with EventQueue.drain', () => {
    const events = createEventDispatcher();
    const ids: number[] = [];
    events.on(SimEventKind.Particles, (event) => ids.push(event.id));
    const queue = createEventQueue(4);
    queue.push(SimEventKind.Particles, 7, 10, 20, 1);
    const { visit } = events;
    queue.drain(visit);
    expect(ids).toEqual([7]);
  });

  it('unsubscribes idempotently, also from inside a dispatch without skipping siblings', () => {
    const events = createEventDispatcher();
    const seen: string[] = [];
    let offA: () => void = () => {};
    offA = events.on(SimEventKind.Flash, () => {
      seen.push('a');
      offA();
    });
    events.on(SimEventKind.Flash, () => seen.push('b'));
    const record: SimEvent = { kind: SimEventKind.Flash, id: 0, x: 0, y: 0, param: 0 };
    events.visit(record);
    events.visit(record);
    offA();
    expect(seen).toEqual(['a', 'b', 'b']);
    expect(events.handlerCount(SimEventKind.Flash)).toBe(1);
  });

  it('rejects unknown kinds and counts events of kinds nobody handles', () => {
    const events = createEventDispatcher();
    expect(() => events.on(99 as SimEventKind, () => {})).toThrow(RangeError);
    expect(() => events.on(-1 as SimEventKind, () => {})).toThrow(RangeError);
    events.visit({ kind: 42 as SimEventKind, id: 0, x: 0, y: 0, param: 0 });
    expect(events.unhandled).toBe(1);
    expect(events.handlerCount(42 as SimEventKind)).toBe(0);
  });
});
