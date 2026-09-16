/**
 * `dispatch` (plan M2-08): `connectOptionEvents` applies the Options screen's display options to
 * the renderer — the scale mode (an index of core `SCALE_MODES`; nothing outside it), screen shake,
 * reduced flashing and the hitbox markers (`param` 1 = on) — and `applyDisplayOptions` hands saved
 * ones over at boot.
 */
import {
  ASPECT_MODES,
  CRT_FILTERS,
  DEFAULT_USER_OPTIONS,
  SCALE_MODES,
  SimEventKind,
  UserOptionKind,
  createEventQueue,
  type ScaleMode,
} from '@shmup/core';
import { describe, expect, it } from 'vitest';
import {
  applyDisplayOptions,
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
    setCrtFilter: (setting) => calls.push(['crt', setting]),
    setAspect: (mode) => calls.push(['aspect', mode]),
    effects: { settings: { screenShake: true, reduceFlashing: false } },
  };
  return { target, calls };
}

/** A volume target that must stay untouched. */
const silent = {
  setBusVolume: () => {
    throw new Error('no volume change expected');
  },
};

describe('shell/dispatch display option events (M2-08)', () => {
  it('switches the scale mode, shake, flashing and hitbox markers live', () => {
    const dispatcher = createEventDispatcher();
    const { target, calls } = display();
    connectOptionEvents(dispatcher, silent, null, null, target);
    const queue = createEventQueue(32);
    for (let k = 0; k < SCALE_MODES.length; k++) {
      queue.push(SimEventKind.UserOption, UserOptionKind.ScaleMode, 0, 0, k);
    }
    for (const bad of [-1, 0.5, SCALE_MODES.length]) {
      queue.push(SimEventKind.UserOption, UserOptionKind.ScaleMode, 0, 0, bad);
    }
    queue.push(SimEventKind.UserOption, UserOptionKind.ShowHitbox, 0, 0, 1);
    queue.push(SimEventKind.UserOption, UserOptionKind.ShowHitbox, 0, 0, 0);
    queue.push(SimEventKind.UserOption, UserOptionKind.ScreenShake, 0, 0, 0);
    queue.push(SimEventKind.UserOption, UserOptionKind.ReduceFlashing, 0, 0, 1);
    dispatcher.drain(queue);
    expect(calls).toEqual([
      ['scale', 'integer'],
      ['scale', 'fit'],
      ['scale', 'stretch'],
      ['hitbox', true],
      ['hitbox', false],
    ]);
    expect(target.effects.settings).toEqual({ screenShake: false, reduceFlashing: true });
  });

  it('switches the CRT filter and the picture shape live (M3-02)', () => {
    const dispatcher = createEventDispatcher();
    const { target, calls } = display();
    connectOptionEvents(dispatcher, silent, null, null, target);
    const queue = createEventQueue(32);
    for (let k = 0; k < CRT_FILTERS.length; k++) {
      queue.push(SimEventKind.UserOption, UserOptionKind.CrtFilter, 0, 0, k);
    }
    for (let k = 0; k < ASPECT_MODES.length; k++) {
      queue.push(SimEventKind.UserOption, UserOptionKind.Aspect, 0, 0, k);
    }
    for (const bad of [-1, 0.5, CRT_FILTERS.length]) {
      queue.push(SimEventKind.UserOption, UserOptionKind.CrtFilter, 0, 0, bad);
      queue.push(SimEventKind.UserOption, UserOptionKind.Aspect, 0, 0, bad);
    }
    dispatcher.drain(queue);
    expect(calls).toEqual([
      ['crt', 'off'],
      ['crt', 'light'],
      ['crt', 'full'],
      ['aspect', 'normal'],
      ['aspect', 'wide'],
      ['aspect', 'classic'],
    ]);
  });

  it('ignores CRT and aspect events a renderer cannot honour (M3-02)', () => {
    const dispatcher = createEventDispatcher();
    const { target, calls } = display();
    const bare: DisplayTarget = {
      setBulletPalette: target.setBulletPalette.bind(target),
      setScaleMode: target.setScaleMode.bind(target),
      setShowHitbox: target.setShowHitbox.bind(target),
      effects: target.effects,
    };
    connectOptionEvents(dispatcher, silent, null, null, bare);
    const queue = createEventQueue(8);
    queue.push(SimEventKind.UserOption, UserOptionKind.CrtFilter, 0, 0, 2);
    queue.push(SimEventKind.UserOption, UserOptionKind.Aspect, 0, 0, 1);
    expect(() => dispatcher.drain(queue)).not.toThrow();
    expect(() => applyDisplayOptions(bare, DEFAULT_USER_OPTIONS.display)).not.toThrow();
    expect(calls.some((c) => c[0] === 'crt' || c[0] === 'aspect')).toBe(false);
  });

  it('ignores display events without a display target', () => {
    for (const none of [null, undefined]) {
      const dispatcher = createEventDispatcher();
      connectOptionEvents(dispatcher, silent, null, null, none);
      const queue = createEventQueue(8);
      queue.push(SimEventKind.UserOption, UserOptionKind.ScaleMode, 0, 0, 1);
      queue.push(SimEventKind.UserOption, UserOptionKind.ScreenShake, 0, 0, 0);
      queue.push(SimEventKind.UserOption, UserOptionKind.ReduceFlashing, 0, 0, 1);
      queue.push(SimEventKind.UserOption, UserOptionKind.ShowHitbox, 0, 0, 1);
      expect(() => dispatcher.drain(queue)).not.toThrow();
    }
  });

  it('applies saved display options at boot', () => {
    const { target, calls } = display();
    applyDisplayOptions(target, {
      bulletPalette: 'deuteranopia',
      scaleMode: 'fit',
      screenShake: false,
      reduceFlashing: true,
      showHitbox: true,
      bossHpBar: false,
      crtFilter: 'full',
      aspect: 'wide',
      language: 'en',
    });
    expect(calls).toEqual([
      ['palette', 'deuteranopia'],
      ['scale', 'fit'],
      ['hitbox', true],
      ['crt', 'full'],
      ['aspect', 'wide'],
    ]);
    expect(target.effects.settings).toEqual({ screenShake: false, reduceFlashing: true });
    const defaults = display();
    applyDisplayOptions(defaults.target, DEFAULT_USER_OPTIONS.display);
    expect(defaults.calls).toEqual([
      ['palette', 'standard'],
      ['scale', 'integer'],
      ['hitbox', false],
      ['crt', 'off'],
      ['aspect', 'normal'],
    ]);
    expect(defaults.target.effects.settings).toEqual({ screenShake: true, reduceFlashing: false });
  });
});
