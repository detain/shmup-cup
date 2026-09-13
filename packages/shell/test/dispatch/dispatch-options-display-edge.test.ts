/**
 * Edge cases of the display option events (plan M2-08), next to
 * `dispatch-options-display.test.ts`: any non-zero `param` switches SHAKE / FLASHES / HITBOX on, a
 * NaN or fractional scale-mode index is ignored, the display target works without a palette
 * callback (and the palette callback without a display target), unregistering stops the display
 * events, and events of other kinds never touch the display.
 */
import {
  SimEventKind,
  UserOptionKind,
  createEventQueue,
  type BulletPalette,
  type ScaleMode,
} from '@shmup/core';
import { describe, expect, it } from 'vitest';
import {
  connectOptionEvents,
  createEventDispatcher,
  type DisplayTarget,
} from '../../src/dispatch/index.js';

/**
 * A display target that records its calls.
 *
 * @returns The target and its call log.
 */
function display(): { target: DisplayTarget; calls: unknown[][] } {
  const calls: unknown[][] = [];
  const target: DisplayTarget = {
    setBulletPalette: (palette) => calls.push(['palette', palette]),
    setScaleMode: (mode: ScaleMode) => calls.push(['scale', mode]),
    setShowHitbox: (on) => calls.push(['hitbox', on]),
    effects: { settings: { screenShake: true, reduceFlashing: false } },
  };
  return { target, calls };
}

/** A volume target that records its calls. */
function volumes(): {
  target: { setBusVolume: (bus: string, gain: number) => void };
  buses: string[];
} {
  const buses: string[] = [];
  return { target: { setBusVolume: (bus) => buses.push(bus) }, buses };
}

describe('shell/dispatch display option events (edges)', () => {
  it('switches SHAKE, FLASHES and HITBOX on for any non-zero param', () => {
    const dispatcher = createEventDispatcher();
    const { target, calls } = display();
    connectOptionEvents(dispatcher, volumes().target, null, null, target);
    const queue = createEventQueue(16);
    queue.push(SimEventKind.UserOption, UserOptionKind.ScreenShake, 0, 0, 0);
    queue.push(SimEventKind.UserOption, UserOptionKind.ScreenShake, 0, 0, 2);
    queue.push(SimEventKind.UserOption, UserOptionKind.ReduceFlashing, 0, 0, -1);
    queue.push(SimEventKind.UserOption, UserOptionKind.ShowHitbox, 0, 0, 7);
    dispatcher.drain(queue);
    expect(target.effects.settings).toEqual({ screenShake: true, reduceFlashing: true });
    expect(calls).toEqual([['hitbox', true]]);
  });

  it('ignores a NaN or fractional scale-mode index', () => {
    const dispatcher = createEventDispatcher();
    const { target, calls } = display();
    connectOptionEvents(dispatcher, volumes().target, null, null, target);
    const queue = createEventQueue(8);
    for (const index of [Number.NaN, 1.5, 2.0000001, 1]) {
      queue.push(SimEventKind.UserOption, UserOptionKind.ScaleMode, 0, 0, index);
    }
    dispatcher.drain(queue);
    expect(calls).toEqual([['scale', 'fit']]);
  });

  it('keeps the palette callback and the display target independent', () => {
    const palettes: BulletPalette[] = [];
    const queue = createEventQueue(8);
    // A display target without a palette callback: the palette event is dropped.
    const withDisplay = createEventDispatcher();
    const shown = display();
    connectOptionEvents(withDisplay, volumes().target, null, null, shown.target);
    queue.push(SimEventKind.UserOption, UserOptionKind.BulletPalette, 0, 0, 1);
    queue.push(SimEventKind.UserOption, UserOptionKind.ScaleMode, 0, 0, 2);
    withDisplay.drain(queue);
    expect(shown.calls).toEqual([['scale', 'stretch']]);
    // A palette callback without a display target: only the palette changes.
    const withPalette = createEventDispatcher();
    connectOptionEvents(withPalette, volumes().target, null, (p) => palettes.push(p));
    queue.push(SimEventKind.UserOption, UserOptionKind.BulletPalette, 0, 0, 3);
    queue.push(SimEventKind.UserOption, UserOptionKind.ShowHitbox, 0, 0, 1);
    withPalette.drain(queue);
    expect(palettes).toEqual(['tritanopia']);
  });

  it('stops applying display events once unregistered', () => {
    const dispatcher = createEventDispatcher();
    const { target, calls } = display();
    const off = connectOptionEvents(dispatcher, volumes().target, null, null, target);
    off();
    off(); // idempotent
    const queue = createEventQueue(8);
    queue.push(SimEventKind.UserOption, UserOptionKind.ScaleMode, 0, 0, 1);
    queue.push(SimEventKind.UserOption, UserOptionKind.ScreenShake, 0, 0, 0);
    dispatcher.drain(queue);
    expect(calls).toEqual([]);
    expect(target.effects.settings.screenShake).toBe(true);
  });

  it('never touches the display for volume events or other event kinds', () => {
    const dispatcher = createEventDispatcher();
    const { target, calls } = display();
    const audio = volumes();
    connectOptionEvents(dispatcher, audio.target, null, null, target);
    const queue = createEventQueue(8);
    queue.push(SimEventKind.UserOption, UserOptionKind.MasterVolume, 0, 0, 5);
    // A Flash event carries the same numbers as a ScaleMode option event.
    queue.push(SimEventKind.Flash, UserOptionKind.ScaleMode, 0, 0, 1);
    queue.push(SimEventKind.UserOption, 99, 0, 0, 1); // an unknown option
    dispatcher.drain(queue);
    expect(calls).toEqual([]);
    expect(audio.buses).toEqual(['master']);
    expect(target.effects.settings).toEqual({ screenShake: true, reduceFlashing: false });
  });
});
