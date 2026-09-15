/**
 * `controls` edge cases (plan M2-16 — the rebind screen's host side): a device the host does not
 * have, a bind with no capture caught, outcomes that change nothing (Unchanged, Refused, Rejected)
 * leaving the save and the adapter alone, a button caught for a key device, the devices read anew
 * on every call (a profile switched in CONTROLS is the one rebound), the TV remote's keys named, a
 * rebinding merged with the save's other options, and nothing written to storage before the screen
 * flushes.
 */
import { readFileSync } from 'node:fs';
import {
  CaptureStatus,
  RebindStatus,
  createSaveStore,
  type ContentFile,
  type InputOptions,
  type PlatformStorage,
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
import { createShellControls } from '../../src/controls/index.js';

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
 * @param code - `KeyboardEvent.code` (`''` for a TV remote key).
 * @param keyCode - Legacy key code.
 * @returns The event.
 */
function key(type: 'keydown' | 'keyup', code: string, keyCode: number): KeyEventLike {
  return { type, code, keyCode, repeat: false, preventDefault: () => undefined };
}

/**
 * A web input over the given rebindable profiles, with a pad whose buttons the test sets.
 *
 * @param ids - The rebindable profiles' ids (the key profile first).
 * @returns The adapter, the save, the controls, the pad's buttons, the applied settings and a
 *   setter for the rebindable list.
 */
function setup(ids: string[] = ['keyboard-default', 'gamepad-standard']) {
  const buttons: Array<{ pressed: boolean }> = Array.from({ length: 17 }, () => ({
    pressed: false,
  }));
  const gamepad: GamepadLike = {
    index: 0,
    connected: true,
    mapping: 'standard',
    get buttons() {
      return buttons;
    },
    axes: [0, 0],
  };
  const input = createWebInput({ keyTarget: null, getGamepads: () => [gamepad] });
  const save = createSaveStore(null);
  let base = ids.map(profile);
  const customized: InputOptions[] = [];
  const controls = createShellControls({
    save,
    input,
    profiles: {
      rebindable: () => base,
      customize: (settings) => {
        customized.push(settings);
        for (const p of base) input.setProfile(customizeInputProfile(p, settings));
      },
    },
  });
  return {
    input,
    save,
    controls,
    buttons,
    customized,
    use: (next: string[]) => {
      base = next.map(profile);
    },
  };
}

/**
 * Captures one key for a device.
 *
 * @param s - The setup.
 * @param device - The device index.
 * @param code - The key's code.
 * @param keyCode - The key's key code.
 */
function captureKey(
  s: ReturnType<typeof setup>,
  device: number,
  code: string,
  keyCode: number,
): void {
  s.controls.beginCapture(device);
  s.input.keyboard.handleEvent(key('keydown', code, keyCode));
  s.input.poll();
  s.input.keyboard.handleEvent(key('keyup', code, keyCode));
}

describe('shell/controls (edge, M2-16)', () => {
  it('rejects a bind for a device the host does not have, storing nothing', () => {
    const s = setup();
    captureKey(s, 0, 'KeyJ', 74);
    expect(s.controls.bindCaptured(2, 'game', 'Shot')).toEqual({
      status: RebindStatus.Rejected,
      other: null,
    });
    expect(s.save.options.input.bindings).toEqual({});
    expect(s.customized).toEqual([]);
    // A missing device's capture waits for keys; its reset does nothing.
    s.controls.endCapture();
    s.controls.beginCapture(9);
    expect(s.input.capture.kind).toBe('keys');
    s.controls.reset(9, 'game');
    expect(s.customized).toEqual([]);
  });

  it('rejects a bind while the capture is still waiting or was cancelled', () => {
    const s = setup();
    s.controls.beginCapture(0);
    s.input.poll();
    expect(s.controls.pollCapture()).toBe(CaptureStatus.Waiting);
    expect(s.controls.bindCaptured(0, 'game', 'Shot').status).toBe(RebindStatus.Rejected);
    s.controls.endCapture();
    expect(s.controls.bindCaptured(0, 'game', 'Shot').status).toBe(RebindStatus.Rejected);
    expect(s.save.options.input.bindings).toEqual({});
  });

  it('outcomes that change nothing leave the save’s options object and the adapter alone', () => {
    const s = setup();
    const before = s.save.options;
    // X is already Sub's only key: Unchanged.
    captureKey(s, 0, 'KeyX', 88);
    expect(s.controls.bindCaptured(0, 'game', 'Sub')).toEqual({
      status: RebindStatus.Unchanged,
      other: null,
    });
    s.controls.endCapture();
    // Escape is reserved: the capture is cancelled, the bind rejected.
    captureKey(s, 0, 'Escape', 27);
    expect(s.controls.pollCapture()).toBe(CaptureStatus.Cancelled);
    expect(s.controls.bindCaptured(0, 'menu', 'Confirm').status).toBe(RebindStatus.Rejected);
    s.controls.endCapture();
    expect(s.save.options).toBe(before);
    expect(s.customized).toEqual([]);
  });

  it('a refusal (a required action would be left keyless) stores nothing', () => {
    const s = setup();
    // Up down to W alone, Special keyless: taking W for Special would leave Up without a key.
    s.save.setOptions({
      ...s.save.options,
      input: {
        ...s.save.options.input,
        bindings: { 'keyboard-default': { game: { Up: ['code:KeyW'], Special: [] } } },
      },
    });
    const before = s.save.options;
    captureKey(s, 0, 'KeyW', 87);
    expect(s.controls.bindCaptured(0, 'game', 'Special')).toEqual({
      status: RebindStatus.Refused,
      other: 'Up',
    });
    expect(s.save.options).toBe(before);
    expect(s.customized).toEqual([]);
    expect(s.controls.keysLabel(0, 'game', 'Up')).toBe('W');
    expect(s.controls.keysLabel(0, 'game', 'Special')).toBe('-');
  });

  it('a button caught for the key device is rejected (no token of its kind)', () => {
    const s = setup();
    // Start a button capture for the pad, then bind what it caught to the keyboard.
    s.controls.beginCapture(1);
    s.buttons[3] = { pressed: true };
    s.input.poll();
    expect(s.controls.pollCapture()).toBe(CaptureStatus.Captured);
    expect(s.controls.bindCaptured(0, 'game', 'Shot').status).toBe(RebindStatus.Rejected);
    expect(s.save.options.input.bindings).toEqual({});
    // The same capture binds on the pad.
    expect(s.controls.bindCaptured(1, 'game', 'Shot')).toEqual({
      status: RebindStatus.Swapped,
      other: 'Special',
    });
  });

  it('reads the devices anew on every call: a switched profile is the one rebound', () => {
    const s = setup();
    expect(s.controls.devices().map((d) => d.id)).toEqual(['keyboard-default', 'gamepad-standard']);
    s.use(['keyboard-remote-emulation']);
    expect(s.controls.devices()).toEqual([{ id: 'keyboard-remote-emulation', kind: 'remote' }]);
    expect(s.controls.keysLabel(0, 'game', 'Special')).toBe('PG UP');
    expect(s.controls.keysLabel(1, 'game', 'Shot')).toBe('-');
    // Only a pad: device 0 is the pad, its capture waits for buttons.
    s.use(['gamepad-standard']);
    s.controls.beginCapture(0);
    expect(s.input.capture.kind).toBe('buttons');
    s.use([]);
    expect(s.controls.devices()).toEqual([]);
    expect(s.controls.keysLabel(0, 'game', 'Shot')).toBe('-');
  });

  it('names the TV remote’s keys and binds its key codes', () => {
    const s = setup(['tizen-remote-safe']);
    expect(s.controls.keysLabel(0, 'game', 'PowerUp')).toBe('OK');
    expect(s.controls.keysLabel(0, 'game', 'Pause')).toBe('BACK  PLAY/PAUSE');
    expect(s.controls.keysLabel(0, 'menu', 'Back')).toBe('BACK');
    // Ch− (Speed's only key) for Special: the two swap.
    captureKey(s, 0, '', 428);
    expect(s.controls.bindCaptured(0, 'game', 'Special')).toEqual({
      status: RebindStatus.Swapped,
      other: 'Speed',
    });
    expect(s.save.options.input.bindings['tizen-remote-safe']?.game).toEqual({
      Special: ['key:428'],
      Speed: ['key:427'],
    });
    expect(s.controls.keysLabel(0, 'game', 'Special')).toBe('CH-');
    expect(s.controls.keysLabel(0, 'game', 'Speed')).toBe('CH+');
  });

  it('keeps the save’s other options when it stores a rebinding, and writes nothing yet', async () => {
    const storage: Array<[string, string]> = [];
    const s = setup();
    const recording: PlatformStorage = {
      get: () => Promise.resolve(null),
      set: (k, v) => {
        storage.push([k, v]);
        return Promise.resolve();
      },
    };
    const withStorage = createSaveStore(recording);
    withStorage.setOptions({
      ...withStorage.options,
      input: { ...withStorage.options.input, socd: 'lastWins', profileId: 'keyboard-default' },
      game: { ...withStorage.options.game, lives: 2 },
    });
    const controls = createShellControls({
      save: withStorage,
      input: s.input,
      profiles: { rebindable: () => [profile('keyboard-default')], customize: () => undefined },
    });
    captureKey(s, 0, 'KeyJ', 74);
    expect(controls.bindCaptured(0, 'game', 'Shot').status).toBe(RebindStatus.Bound);
    expect(withStorage.options.input).toMatchObject({
      socd: 'lastWins',
      profileId: 'keyboard-default',
      bindings: { 'keyboard-default': { game: { Shot: ['code:KeyJ'] } } },
    });
    expect(withStorage.options.game.lives).toBe(2);
    expect(storage).toEqual([]);
    expect(withStorage.dirty).toBe(true);
    expect(await withStorage.flush()).toBe(true);
    expect(storage).toHaveLength(1);
  });
});
