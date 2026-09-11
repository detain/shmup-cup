/**
 * # web-input — merges keyboard/remote and gamepads into the core's `InputSnapshot`
 *
 * **Responsibility.** The `PlatformInput` implementation for browser-based hosts
 * (web, Tizen, Electron renderer). `poll()` is called once per simulation tick; it ages the
 * keyboard's release debounce, reads the keyboard source (held + latched taps) and every
 * connected gamepad, then writes one reused {@link InputSnapshot} (zero allocations of its
 * own).
 *
 * **Profiles and contexts** (decisions D13–D15). {@link WebInput.setProfile} applies a data-
 * driven input profile (`rebind`): a keyboard / remote profile drives the keyboard source
 * (tables, release debounce, diagonal and SOCD policies, the reported device kind), a gamepad
 * profile drives every pad. {@link WebInput.setContext} switches both to the profile's `game`
 * or `menu` table — the host forwards `Game.inputContext` (the shell does, once per frame).
 * Keys and buttons held across a switch keep only the actions they have in both tables until
 * released. Before any profile is applied the built-in `keymap` / `gamepad` defaults are used.
 *
 * Player assignment (placeholder until "press Start to join" lands, shmup_feat.md §4
 * [P1]): keyboard / TV remote → player 1; gamepad slot 0 → player 1 too (so a pad works
 * solo); gamepad slot 1 → player 2.
 *
 * **Implements.** shmup_tech.md §3.2 (`input.poll(): InputSnapshot`), §4.4 (custom
 * InputManager: key flags + edge latches, gamepads polled once per update, action
 * bitmask snapshot), shmup_feat.md §4 (remote-first rules, SOCD, per-device bindings).
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
  type ActionMask,
  type InputContext,
  type InputDeviceKind,
  type InputSnapshot,
  type PlatformInput,
} from '@shmup/core';
import {
  DEFAULT_GAMEPAD_BUTTONS,
  readGamepadActions,
  type GamepadLike,
  type GamepadReadState,
} from '../gamepad/index.js';
import { createKeyboardSource, type KeyboardSource } from '../keyboard/index.js';
import { DEFAULT_KEY_BINDINGS, type KeyBindings } from '../keymap/index.js';
import type { InputProfile } from '../rebind/index.js';
import {
  DEFAULT_INPUT_TUNING,
  createDirectionOrder,
  resolveDirections,
  type DirectionOrder,
  type InputTuning,
} from '../remote/index.js';

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
  /**
   * Gamepad accessor, called once per poll (normally `() => navigator.getGamepads()`).
   * Omit it to disable gamepads.
   *
   * @returns The current gamepads by slot; `null` entries are empty slots.
   */
  readonly getGamepads?: () => ArrayLike<GamepadLike | null>;
  /** Key bindings used until a profile is applied (defaults to {@link DEFAULT_KEY_BINDINGS}). */
  readonly bindings?: KeyBindings;
  /**
   * Device kind reported for key input until a profile is applied: `'remote'` on TVs,
   * `'keyboard'` elsewhere. A keyboard / remote profile replaces it with its own `device`.
   */
  readonly keyDevice?: Extract<InputDeviceKind, 'keyboard' | 'remote'>;
}

/** Browser input adapter. */
export interface WebInput extends PlatformInput {
  /** The keyboard/remote source (for rebinding UIs and tests). */
  readonly keyboard: KeyboardSource;
  /** The binding context in use (`'game'` until {@link WebInput.setContext} changes it). */
  readonly context: InputContext;
  /** The keyboard / remote profile in use, or `null` (built-in default bindings). */
  readonly keyProfile: InputProfile | null;
  /** The gamepad profile in use, or `null` (built-in default buttons). */
  readonly gamepadProfile: InputProfile | null;
  /**
   * Applies an input profile: a `keyboard` / `remote` profile to the keyboard source, a
   * `gamepad` profile to every pad — its table for the current context, its debounce and
   * direction policies.
   *
   * @param profile - A profile from `rebind` (`parseInputProfiles`, the registry).
   */
  setProfile(profile: InputProfile): void;
  /**
   * Switches keys and pads to the profiles' `game` or `menu` table (decision D15). Call it when
   * `Game.inputContext` changes; a no-op when the context is unchanged or no profile is set.
   *
   * @param context - The new context.
   */
  setContext(context: InputContext): void;
  /** Clears all held input (blur, suspend, scene change). */
  clear(): void;
  /** Removes event listeners. */
  destroy(): void;
}

/**
 * Creates the browser input adapter.
 *
 * @remarks
 * `poll()` must be called exactly once per simulation tick (it ages the release debounce and
 * consumes the keyboard tap latch). Only gamepad slots 0 and 1 produce input (players 1 and
 * 2); slots 2–3 are read but ignored until join-in lands. A player's `device` only changes
 * when that device produced input on this poll. Gamepads get the gamepad profile's diagonal
 * and SOCD policies with a per-pad press order (gamepads are polled, so they have no release
 * debounce). `poll()`, `setContext()` and the event handlers allocate nothing.
 *
 * @param options - Event target, gamepad accessor and bindings.
 * @returns A {@link WebInput} whose `poll()` feeds the core.
 *
 * @example
 * ```ts
 * const input = createWebInput({
 *   keyTarget: window,
 *   getGamepads: () => navigator.getGamepads(),
 *   keyDevice: 'remote', // on Tizen
 * });
 * input.setProfile(remoteProfile); // from content/input (rebind)
 * const platform: Platform = { ...rest, input };
 * ```
 */
export function createWebInput(options: WebInputOptions): WebInput {
  const keyboard = createKeyboardSource(
    options.keyTarget,
    options.bindings ?? DEFAULT_KEY_BINDINGS,
  );
  let keyDevice: InputDeviceKind = options.keyDevice ?? 'keyboard';
  const getGamepads = options.getGamepads;
  const snapshot = createInputSnapshot();
  const padStates: GamepadReadState[] = [];
  const padOrders: DirectionOrder[] = [];
  for (let i = 0; i < MAX_PADS; i++) {
    padStates.push({ stickDirections: 0, pressedButtons: 0, staleButtons: 0 });
    padOrders.push(createDirectionOrder());
  }
  let context: InputContext = 'game';
  let keyProfile: InputProfile | null = null;
  let padProfile: InputProfile | null = null;
  let padButtons: readonly ActionMask[] = DEFAULT_GAMEPAD_BUTTONS;
  let padPreviousButtons: readonly ActionMask[] = DEFAULT_GAMEPAD_BUTTONS;
  let padTuning: InputTuning = DEFAULT_INPUT_TUNING;

  /**
   * Switches the pads to another button table; buttons held right now become stale (they keep
   * only the actions both tables give them until released).
   *
   * @param next - The new table.
   */
  const setPadButtons = (next: readonly ActionMask[]): void => {
    if (next === padButtons) return;
    padPreviousButtons = padButtons;
    padButtons = next;
    for (let i = 0; i < padStates.length; i++) {
      const state = padStates[i];
      if (state !== undefined) state.staleButtons = state.pressedButtons ?? 0;
    }
  };

  /**
   * Merges keyboard and pads into the reused snapshot.
   *
   * @returns The adapter-owned snapshot for this tick.
   */
  const poll = (): InputSnapshot => {
    keyboard.advance();
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
        const order = padOrders[i];
        if (state === undefined || order === undefined) continue;
        if (pad === null || pad === undefined) {
          order.update(0);
          continue;
        }
        const raw = readGamepadActions(pad, state, padButtons, padPreviousButtons);
        order.update(raw);
        const mask = resolveDirections(raw, order.order, padTuning.diagonals, padTuning.socd);
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
    get context() {
      return context;
    },
    get keyProfile() {
      return keyProfile;
    },
    get gamepadProfile() {
      return padProfile;
    },
    setProfile(profile) {
      if (profile.device === 'gamepad') {
        padProfile = profile;
        padTuning = profile;
        setPadButtons(profile.tables[context].buttons);
        return;
      }
      keyProfile = profile;
      keyDevice = profile.device;
      keyboard.setTuning(profile);
      keyboard.setBindings(profile.tables[context].keys);
    },
    setContext(next) {
      if (next === context) return;
      context = next;
      if (keyProfile !== null) keyboard.setBindings(keyProfile.tables[next].keys);
      if (padProfile !== null) setPadButtons(padProfile.tables[next].buttons);
    },
    clear() {
      keyboard.clear();
      resetInputSnapshot(snapshot);
    },
    destroy() {
      keyboard.detach();
    },
  };
}
