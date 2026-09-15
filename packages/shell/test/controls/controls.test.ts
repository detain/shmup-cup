/**
 * `controls` (plan M2-16): the rebind screen's host side over a real `@shmup/input-web` adapter and
 * the shipped profiles — the devices, the keys' names with the player's rebinding, the key and
 * button capture (Escape cancels), a rebinding stored in the save and applied at once to the
 * adapter, a key that does not fit the device rejected, a reset per context — and the
 * `InputSettings` event re-applying the save through `connectOptionEvents`.
 */
import { readFileSync } from 'node:fs';
import {
  Action,
  CaptureStatus,
  RebindStatus,
  SimEventKind,
  UserOptionKind,
  createEventQueue,
  createSaveStore,
  type ContentFile,
  type InputOptions,
} from '@shmup/core';
import {
  createWebInput,
  customizeInputProfile,
  loadInputProfiles,
  type GamepadLike,
  type InputProfile,
  type KeyEventLike,
} from '@shmup/input-web';
import { describe, expect, it } from 'vitest';
import * as shell from '../../src/index.js';
import { createShellControls, moduleInfo } from '../../src/controls/index.js';
import { connectOptionEvents, createEventDispatcher } from '../../src/dispatch/index.js';

const PATH = 'input/remote.input-profiles.json';
const file: ContentFile = {
  path: PATH,
  data: JSON.parse(
    readFileSync(new URL(`../../../../content/${PATH}`, import.meta.url), 'utf8'),
  ) as unknown,
};
const { profiles } = loadInputProfiles([file]);

/**
 * A shipped profile.
 *
 * @param id - Its id.
 * @returns The profile.
 */
function profile(id: string): InputProfile {
  const found = profiles.find((p) => p.id === id);
  if (found === undefined) throw new Error(id);
  return found;
}

/**
 * A keyboard event.
 *
 * @param type - `keydown` or `keyup`.
 * @param code - `KeyboardEvent.code`.
 * @param keyCode - Legacy key code.
 * @returns The event.
 */
function key(type: 'keydown' | 'keyup', code: string, keyCode: number): KeyEventLike {
  return { type, code, keyCode, repeat: false, preventDefault: () => undefined };
}

/**
 * A web input with the keyboard and gamepad profiles applied the way the apps do.
 *
 * @param keys - The key profile in use.
 * @returns The adapter, the save, the controls, the pad and every applied settings.
 */
function setup(keys = 'keyboard-default') {
  const pad: { buttons: Array<{ pressed: boolean }> } = {
    buttons: Array.from({ length: 17 }, () => ({ pressed: false })),
  };
  const gamepad: GamepadLike = {
    index: 0,
    connected: true,
    mapping: 'standard',
    get buttons() {
      return pad.buttons;
    },
    axes: [0, 0],
  };
  const input = createWebInput({ keyTarget: null, getGamepads: () => [gamepad] });
  const save = createSaveStore(null);
  const base = [profile(keys), profile('gamepad-standard')];
  const customized: InputOptions[] = [];
  /**
   * Applies both profiles with the player's settings (the apps' `customize`).
   *
   * @param settings - The save's `options.input`.
   */
  const customize = (settings: InputOptions): void => {
    customized.push(settings);
    for (const p of base) input.setProfile(customizeInputProfile(p, settings));
  };
  customize(save.options.input);
  const controls = createShellControls({
    save,
    input,
    profiles: { rebindable: () => base, customize },
  });
  return { input, save, controls, pad, customized };
}

describe('shell/controls (M2-16)', () => {
  it('describes itself and is exported from the package entry', () => {
    expect(moduleInfo.name).toBe('controls');
    expect(moduleInfo.status).toBe('implemented');
    expect(shell.createShellControls).toBe(createShellControls);
  });

  it('lists the devices and names their keys', () => {
    const { controls } = setup();
    expect(controls.devices()).toEqual([
      { id: 'keyboard-default', kind: 'keyboard' },
      { id: 'gamepad-standard', kind: 'gamepad' },
    ]);
    expect(controls.keysLabel(0, 'game', 'Shot')).toBe('Z  SPACE');
    expect(controls.keysLabel(0, 'menu', 'Back')).toBe('X  BKSP  ESC');
    expect(controls.keysLabel(1, 'game', 'Pause')).toBe('SELECT  START');
    expect(controls.keysLabel(5, 'game', 'Shot')).toBe('-');
  });

  it('captures a key, binds it, stores it in the save and applies it at once', () => {
    const { input, save, controls, customized } = setup();
    controls.beginCapture(0);
    expect(controls.pollCapture()).toBe(CaptureStatus.Waiting);
    input.keyboard.handleEvent(key('keydown', 'KeyJ', 74));
    input.poll();
    expect(controls.pollCapture()).toBe(CaptureStatus.Captured);
    const outcome = controls.bindCaptured(0, 'game', 'Shot');
    expect(outcome).toEqual({ status: RebindStatus.Bound, other: null });
    controls.endCapture();
    expect(controls.pollCapture()).toBe(CaptureStatus.Idle);
    expect(save.options.input.bindings).toEqual({
      'keyboard-default': { game: { Shot: ['code:KeyJ'] } },
    });
    expect(customized[customized.length - 1]).toBe(save.options.input);
    expect(controls.keysLabel(0, 'game', 'Shot')).toBe('J');
    // The adapter uses it: in the game context J shoots, Z does not.
    input.keyboard.handleEvent(key('keyup', 'KeyJ', 74));
    input.poll();
    input.setContext('game');
    input.keyboard.handleEvent(key('keydown', 'KeyJ', 74));
    expect(input.poll().players[0].held & Action.Shot).toBe(Action.Shot);
    input.keyboard.handleEvent(key('keyup', 'KeyJ', 74));
    input.keyboard.handleEvent(key('keydown', 'KeyZ', 90));
    expect(input.poll().players[0].held & Action.Shot).toBe(0);
  });

  it('cancels a capture on Escape and rejects a capture that does not fit the device', () => {
    const { input, save, controls } = setup();
    controls.beginCapture(0);
    input.keyboard.handleEvent(key('keydown', 'Escape', 27));
    input.poll();
    expect(controls.pollCapture()).toBe(CaptureStatus.Cancelled);
    expect(controls.bindCaptured(0, 'game', 'Shot').status).toBe(RebindStatus.Rejected);
    controls.endCapture();
    // A key caught for the gamepad device (a button capture ignores keys, so bind a stale one).
    controls.beginCapture(0);
    input.keyboard.handleEvent(key('keydown', 'KeyK', 75));
    input.poll();
    expect(controls.bindCaptured(1, 'game', 'Shot').status).toBe(RebindStatus.Rejected);
    expect(save.options.input.bindings).toEqual({});
  });

  it('captures a gamepad button for the gamepad and swaps on a conflict', () => {
    const { input, save, controls, pad } = setup();
    input.poll();
    controls.beginCapture(1);
    // A key does not end a button capture.
    input.keyboard.handleEvent(key('keydown', 'KeyK', 75));
    input.poll();
    expect(controls.pollCapture()).toBe(CaptureStatus.Waiting);
    pad.buttons[1] = { pressed: true }; // B — Sub's only button
    input.poll();
    expect(controls.pollCapture()).toBe(CaptureStatus.Captured);
    expect(controls.bindCaptured(1, 'game', 'Shot')).toEqual({
      status: RebindStatus.Swapped,
      other: 'Sub',
    });
    expect(save.options.input.bindings['gamepad-standard']?.game).toEqual({
      Shot: ['button:1'],
      Sub: ['button:0'],
    });
    expect(controls.keysLabel(1, 'game', 'Sub')).toBe('A');
  });

  it('rebinds KEYBOARD AS REMOTE by code: menu CONFIRM → ↑ swaps with UP (review round 2)', () => {
    const { input, save, controls } = setup('keyboard-remote-emulation');
    controls.beginCapture(0);
    input.keyboard.handleEvent(key('keydown', 'ArrowUp', 38));
    input.poll();
    expect(controls.bindCaptured(0, 'menu', 'Confirm')).toEqual({
      status: RebindStatus.Swapped,
      other: 'Up',
    });
    controls.endCapture();
    expect(save.options.input.bindings['keyboard-remote-emulation']?.menu).toEqual({
      Up: ['code:Enter', 'code:NumpadEnter'],
      Confirm: ['code:ArrowUp'],
    });
    expect(controls.keysLabel(0, 'menu', 'Confirm')).toBe('↑');
    expect(controls.keysLabel(0, 'menu', 'Up')).toBe('ENTER  NUM ENTER');
    // The adapter uses it: in menus the arrow confirms and Enter moves up.
    input.keyboard.handleEvent(key('keyup', 'ArrowUp', 38));
    for (let i = 0; i < 4; i++) input.poll();
    input.setContext('menu');
    input.keyboard.handleEvent(key('keydown', 'ArrowUp', 38));
    expect(input.poll().players[0].held & (Action.Confirm | Action.Up)).toBe(Action.Confirm);
    input.keyboard.handleEvent(key('keyup', 'ArrowUp', 38));
    for (let i = 0; i < 4; i++) input.poll();
    input.keyboard.handleEvent(key('keydown', 'Enter', 13));
    expect(input.poll().players[0].held & (Action.Confirm | Action.Up)).toBe(Action.Up);
  });

  it('rejects a key of the split keyboard’s player-2 half for player 1 (review round 2)', () => {
    const { input, save, controls } = setup('keyboard-split');
    controls.beginCapture(0);
    input.keyboard.handleEvent(key('keydown', 'ArrowUp', 38));
    input.poll();
    expect(controls.bindCaptured(0, 'game', 'Shot')).toEqual({
      status: RebindStatus.Rejected,
      other: null,
    });
    controls.endCapture();
    expect(save.options.input.bindings).toEqual({});
  });

  it('resets one context of a device', () => {
    const { input, save, controls } = setup();
    for (const context of ['game', 'menu'] as const) {
      controls.beginCapture(0);
      input.keyboard.handleEvent(key('keydown', 'KeyJ', 74));
      input.poll();
      controls.bindCaptured(0, context, context === 'game' ? 'Shot' : 'Confirm');
      controls.endCapture();
      input.keyboard.handleEvent(key('keyup', 'KeyJ', 74));
      input.poll();
    }
    controls.reset(0, 'game');
    expect(save.options.input.bindings).toEqual({
      'keyboard-default': { menu: { Confirm: ['code:KeyJ'] } },
    });
    expect(controls.keysLabel(0, 'game', 'Shot')).toBe('Z  SPACE');
    const before = save.options;
    controls.reset(0, 'game'); // nothing left: no change
    expect(save.options).toBe(before);
    controls.reset(3, 'menu'); // no such device
    expect(save.options).toBe(before);
  });

  it('re-applies the save on an InputSettings event (SOCD, debounce)', () => {
    const dispatcher = createEventDispatcher();
    const applied: number[] = [];
    connectOptionEvents(dispatcher, { setBusVolume: () => undefined }, null, null, null, () =>
      applied.push(1),
    );
    const queue = createEventQueue(8);
    queue.push(SimEventKind.UserOption, UserOptionKind.InputSettings, 0, 0, 0);
    queue.push(SimEventKind.UserOption, UserOptionKind.InputProfile, 0, 0, 0);
    dispatcher.drain(queue);
    expect(applied).toEqual([1]);
    // Without a handler the event is ignored.
    const quiet = createEventDispatcher();
    connectOptionEvents(quiet, { setBusVolume: () => undefined }, null);
    queue.push(SimEventKind.UserOption, UserOptionKind.InputSettings, 0, 0, 0);
    expect(() => quiet.drain(queue)).not.toThrow();
  });
});
