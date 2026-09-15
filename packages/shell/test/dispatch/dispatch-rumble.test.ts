/**
 * `connectRumbleEvents` (plan M3-01 — gamepad rumble): each `SimEventKind.Rumble` event rumbles the
 * player it names with its strength while the option says so (read at every event), other kinds are
 * ignored, and the returned function unregisters the handler.
 */
import { SimEventKind, type SimEvent } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import * as shell from '../../src/index.js';
import { connectRumbleEvents, createEventDispatcher } from '../../src/dispatch/index.js';

/**
 * An event record.
 *
 * @param kind - Kind.
 * @param id - Id (the player).
 * @param param - Param (the strength).
 * @returns The record.
 */
const record = (kind: number, id: number, param: number): SimEvent => ({
  kind: kind as SimEventKind,
  id,
  x: 0,
  y: 0,
  param,
});

describe('shell/dispatch connectRumbleEvents (M3-01)', () => {
  it('rumbles the named player with the event`s strength while enabled', () => {
    expect(shell.connectRumbleEvents).toBe(connectRumbleEvents);
    const events = createEventDispatcher();
    const rumbles: Array<[number, number]> = [];
    let on = true;
    const off = connectRumbleEvents(
      events,
      (player, strength) => rumbles.push([player, strength]),
      () => on,
    );
    events.visit(record(SimEventKind.Rumble, 0, 1));
    events.visit(record(SimEventKind.Rumble, 1, 2));
    events.visit(record(SimEventKind.Shake, 0, 3));
    on = false;
    events.visit(record(SimEventKind.Rumble, 0, 1));
    on = true;
    off();
    off();
    events.visit(record(SimEventKind.Rumble, 0, 1));
    expect(rumbles).toEqual([
      [0, 1],
      [1, 2],
    ]);
    expect(events.handlerCount(SimEventKind.Rumble)).toBe(0);
  });
});
