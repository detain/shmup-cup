/**
 * `dispatch` (plan M2-02): `connectOptionEvents` forwards the Options screen's `BulletPalette`
 * events (`param` = an index of core `BULLET_PALETTES`) to the palette callback — every palette by
 * name, nothing for an index outside the list (negative, fractional, too large), nothing without
 * a callback, and no bus volume touched.
 */
import {
  BULLET_PALETTES,
  SimEventKind,
  UserOptionKind,
  createEventQueue,
  type AudioBus,
  type BulletPalette,
} from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { connectOptionEvents, createEventDispatcher } from '../../src/dispatch/index.js';

/**
 * A volume target that records its calls.
 *
 * @returns The calls and the target.
 */
function recorder(): {
  calls: Array<[AudioBus, number]>;
  target: { setBusVolume(bus: AudioBus, gain: number): void };
} {
  const calls: Array<[AudioBus, number]> = [];
  return {
    calls,
    target: {
      setBusVolume: (bus: AudioBus, gain: number) => {
        calls.push([bus, gain]);
      },
    },
  };
}

describe('shell/dispatch bullet palette events (M2-02)', () => {
  it('names every palette by its index and ignores indices outside the list', () => {
    const dispatcher = createEventDispatcher();
    const { calls, target } = recorder();
    const palettes: BulletPalette[] = [];
    connectOptionEvents(dispatcher, target, null, (palette) => palettes.push(palette));
    const queue = createEventQueue(16);
    for (let k = 0; k < BULLET_PALETTES.length; k++) {
      queue.push(SimEventKind.UserOption, UserOptionKind.BulletPalette, 0, 0, k);
    }
    for (const bad of [-1, 1.5, BULLET_PALETTES.length, 99]) {
      queue.push(SimEventKind.UserOption, UserOptionKind.BulletPalette, 0, 0, bad);
    }
    dispatcher.drain(queue);
    expect(palettes).toEqual([...BULLET_PALETTES]);
    expect(calls).toEqual([]);
  });

  it('ignores palette events without a callback (null or omitted)', () => {
    for (const callback of [null, undefined]) {
      const dispatcher = createEventDispatcher();
      const { calls, target } = recorder();
      connectOptionEvents(dispatcher, target, null, callback);
      const queue = createEventQueue(4);
      queue.push(SimEventKind.UserOption, UserOptionKind.BulletPalette, 0, 0, 1);
      dispatcher.drain(queue);
      expect([calls, dispatcher.unhandled]).toEqual([[], 0]);
    }
  });

  it('stops forwarding once disconnected', () => {
    const dispatcher = createEventDispatcher();
    const { target } = recorder();
    const palettes: BulletPalette[] = [];
    const off = connectOptionEvents(dispatcher, target, null, (palette) => palettes.push(palette));
    off();
    const queue = createEventQueue(4);
    queue.push(SimEventKind.UserOption, UserOptionKind.BulletPalette, 0, 0, 2);
    dispatcher.drain(queue);
    expect(palettes).toEqual([]);
  });
});
