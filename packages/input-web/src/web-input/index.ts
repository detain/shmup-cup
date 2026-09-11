/**
 * # web-input — merges keyboard/remote and gamepads into the core's `InputSnapshot`
 *
 * **Responsibility.** The `PlatformInput` implementation for browser-based hosts
 * (web, Tizen, Electron renderer). `poll()` is called once per simulation tick; it reads
 * the keyboard source (held + latched taps) and every connected gamepad, then writes one
 * reused {@link InputSnapshot} (zero allocations of its own).
 *
 * Player assignment (placeholder until "press Start to join" lands, shmup_feat.md §4
 * [P1]): keyboard / TV remote → player 1; gamepad slot 0 → player 1 too (so a pad works
 * solo); gamepad slot 1 → player 2.
 *
 * **Implements.** shmup_tech.md §3.2 (`input.poll(): InputSnapshot`), §4.4 (custom
 * InputManager: key flags + edge latches, gamepads polled once per update, action
 * bitmask snapshot), shmup_feat.md §4.
 *
 * **Public API.** {@link createWebInput}, {@link WebInput}, {@link WebInputOptions}.
 *
 * @module
 */
import {
  commitPlayerInput,
  createInputSnapshot,
  defineModule,
  resetInputSnapshot,
  type InputDeviceKind,
  type InputSnapshot,
  type PlatformInput,
} from '@shmup/core';
import { readGamepadActions, type GamepadLike, type GamepadReadState } from '../gamepad/index.js';
import { createKeyboardSource, type KeyboardSource } from '../keyboard/index.js';
import { DEFAULT_KEY_BINDINGS, type KeyBindings } from '../keymap/index.js';

/** Module descriptor. */
export const moduleInfo = defineModule({
  name: 'web-input',
  status: 'partial',
  specRefs: ['shmup_tech.md §3.2', 'shmup_tech.md §4.4', 'shmup_feat.md §4'],
});

/** Maximum gamepads tracked (Samsung TVs expose up to 4). */
const MAX_PADS = 4;

/** Options for {@link createWebInput}. */
export interface WebInputOptions {
  /** Where key events arrive (normally `window`); `null` disables the keyboard. */
  readonly keyTarget: EventTarget | null;
  /** Returns the current gamepads (normally `() => navigator.getGamepads()`). */
  readonly getGamepads?: () => ArrayLike<GamepadLike | null>;
  /** Key bindings (defaults to {@link DEFAULT_KEY_BINDINGS}). */
  readonly bindings?: KeyBindings;
  /** Device kind reported for key input: `'remote'` on TVs, `'keyboard'` elsewhere. */
  readonly keyDevice?: Extract<InputDeviceKind, 'keyboard' | 'remote'>;
}

/** Browser input adapter. */
export interface WebInput extends PlatformInput {
  /** The keyboard/remote source (for rebinding UIs and tests). */
  readonly keyboard: KeyboardSource;
  /** Clears all held input (blur, suspend, scene change). */
  clear(): void;
  /** Removes event listeners. */
  destroy(): void;
}

/**
 * Creates the browser input adapter.
 *
 * @param options - Event target, gamepad accessor and bindings.
 * @returns A {@link WebInput} whose `poll()` feeds the core.
 */
export function createWebInput(options: WebInputOptions): WebInput {
  const keyboard = createKeyboardSource(
    options.keyTarget,
    options.bindings ?? DEFAULT_KEY_BINDINGS,
  );
  const keyDevice = options.keyDevice ?? 'keyboard';
  const getGamepads = options.getGamepads;
  const snapshot = createInputSnapshot();
  const padStates: GamepadReadState[] = [];
  for (let i = 0; i < MAX_PADS; i++) padStates.push({ stickDirections: 0 });

  const poll = (): InputSnapshot => {
    const keyHeld = keyboard.held;
    const keyLatched = keyboard.consumeLatched();
    let p1 = keyHeld;
    let p2 = 0;
    let p1Device: InputDeviceKind = keyHeld !== 0 || keyLatched !== 0 ? keyDevice : 'none';
    let p2Device: InputDeviceKind = 'none';

    if (getGamepads !== undefined) {
      const pads = getGamepads();
      const count = Math.min(pads.length, MAX_PADS);
      for (let i = 0; i < count; i++) {
        const pad = pads[i];
        const state = padStates[i];
        if (pad === null || pad === undefined || state === undefined) continue;
        const mask = readGamepadActions(pad, state);
        if (mask === 0) continue;
        if (i === 1) {
          p2 |= mask;
          p2Device = 'gamepad';
        } else if (i === 0) {
          p1 |= mask;
          p1Device = 'gamepad';
        }
      }
    }

    const player1 = snapshot.players[0];
    const player2 = snapshot.players[1];
    if (player1 !== undefined) {
      commitPlayerInput(player1, p1, keyLatched);
      if (p1Device !== 'none') player1.device = p1Device;
    }
    if (player2 !== undefined) {
      commitPlayerInput(player2, p2);
      if (p2Device !== 'none') player2.device = p2Device;
    }
    return snapshot;
  };

  return {
    keyboard,
    poll,
    clear() {
      keyboard.clear();
      resetInputSnapshot(snapshot);
    },
    destroy() {
      keyboard.detach();
    },
  };
}
