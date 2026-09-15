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
 * **Player seats (M2-06, shmup_feat.md §4 "press Start to join", §16 co-op).** The host tells the
 * adapter how many seats to route ({@link WebInput.setSeats} — `Game.inputSeats`: 2 while a co-op
 * game is played, else 1):
 * - **One seat** (menus, one-player games): every device drives player 1 — the keyboard / TV
 *   remote, both halves of a split keyboard and every gamepad (so a pad works solo, and every
 *   controller drives the menus).
 * - **Two seats** (a co-op game): the keyboard / TV remote is player 1's (the left half of a split
 *   keyboard — `WASD` + `F` / `G` in `keyboard-split` — and its right half, arrows + `K` / `L`, is
 *   player 2's seat). Otherwise **pads take player 2's seat by default**: while that seat is free,
 *   an unassigned pad still drives player 1, but its first join press — a button its gamepad
 *   profile's **menu** table binds to Confirm or Pause (A, START) — seats it as player 2 and is
 *   forwarded as a latched `Confirm` on player 2's slot (the core's World then brings player 2 in
 *   — `core/world` `JOIN_ACTIONS`). A seated pad drives player 2 only (in one-seat mode it folds
 *   into player 1 again); it keeps its seat across games until it disconnects. With the seat taken
 *   every other pad drives player 1 (two pads with an idle keyboard: the pad that did not join
 *   drives player 1). A pad that goes away — `null`, disconnected, or no longer in the list —
 *   gives its seat up on that poll, so another pad may take it at once.
 *
 * When the seats change, a source that moves to the other player (a seated pad, the split
 * keyboard's right half) keeps what it holds **without a new press** there: player 2's START that
 * opened the pause menu (one seat) does not also resume it as player 1's, nor pause again when the
 * game comes back (two seats); a new press counts as usual.
 *
 * **Implements.** shmup_tech.md §3.2 (`input.poll(): InputSnapshot`), §4.4 (custom
 * InputManager: key flags + edge latches, gamepads polled once per update, action
 * bitmask snapshot), shmup_feat.md §4 (remote-first rules, SOCD, per-device bindings, 2-player
 * co-op input: press Start to join, per-player device assignment, the split keyboard) and §16
 * (co-op).
 *
 * **Rebinding capture (M2-16).** {@link WebInput.beginCapture} waits for the next new key or
 * gamepad button ({@link WebInput.capture} — Escape and the remote's Back cancel it); the Options
 * screen's rebind prompt reads it through the shell and binds the result (`rebind`
 * `captureToken` / `rebindAction`).
 *
 * **Public API.** {@link createWebInput}, {@link WebInput}, {@link WebInputOptions},
 * {@link PAD_SEAT_NONE}, {@link PAD_SEAT_P2}; M2-16: {@link CaptureKind},
 * {@link InputCaptureState}.
 *
 * @module
 */
import {
  Action,
  CaptureStatus,
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
  status: 'implemented',
  specRefs: ['shmup_tech.md §3.2', 'shmup_tech.md §4.4', 'shmup_feat.md §4', 'shmup_feat.md §16'],
});

/** Maximum gamepads tracked (Samsung TVs expose up to 4). */
const MAX_PADS = 4;

/** {@link WebInput.padSeat}: the pad has no seat (it drives player 1). */
export const PAD_SEAT_NONE = -1;

/** {@link WebInput.padSeat}: the pad holds player 2's seat (M2-06). */
export const PAD_SEAT_P2 = 1;

/** A binding table that binds nothing (the split keyboard's second source without a split). */
const NO_KEYS: KeyBindings = Object.freeze({
  byCode: Object.freeze({}),
  byKeyCode: Object.freeze({}),
});

/**
 * Bit mask of the button indices whose actions include Confirm or Pause — a pad's join press
 * (M2-06).
 *
 * @param buttons - A button table (a gamepad profile's `menu` table, or the default buttons).
 * @returns The mask (indices 0–31).
 */
function joinButtonsOf(buttons: readonly ActionMask[]): number {
  let mask = 0;
  for (let i = 0; i < buttons.length && i < 32; i++) {
    if (((buttons[i] ?? 0) & (Action.Confirm | Action.Pause)) !== 0) mask |= 1 << i;
  }
  return mask;
}

/** What {@link WebInput.beginCapture} waits for: the next key, or the next gamepad button. */
export type CaptureKind = 'keys' | 'buttons';

/** The key codes that cancel a capture: the TV remote's Back. */
const CANCEL_KEY_CODE = 10009;

/** The `KeyboardEvent.code` that cancels a capture: Escape. */
const CANCEL_CODE = 'Escape';

/**
 * The state of the rebinding capture (M2-16 — {@link WebInput.capture}). A class so its fields stay
 * unboxed; the adapter updates it in `poll()`.
 */
export class InputCaptureState {
  /** A `core/ui` `CaptureStatus` code: idle, waiting, captured or cancelled. */
  status: number = CaptureStatus.Idle;
  /** What the capture waits for. */
  kind: CaptureKind = 'keys';
  /** `KeyboardEvent.code` of the captured key (`''` for a TV remote key or a button). */
  code = '';
  /** Legacy key code of the captured key (0 for a button). */
  keyCode = 0;
  /** Standard-mapping index of the captured gamepad button (-1 for a key). */
  button = -1;
}

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
  /** The keyboard/remote source (for rebinding UIs and tests) — player 1's half when split. */
  readonly keyboard: KeyboardSource;
  /**
   * Player 2's half of a split keyboard (M2-06): a second keyboard source on the same event target,
   * bound to the key profile's `split` tables (nothing bound without a split).
   */
  readonly splitKeyboard: KeyboardSource;
  /** Player seats routed now: 1 (every device drives player 1) or 2 (co-op; M2-06). */
  readonly seats: number;
  /**
   * Sets how many player seats to route (M2-06; the host forwards `Game.inputSeats` — the shell
   * does, once per frame): see the module docs. Allocation-free.
   *
   * @remarks
   * On a change, what a moving source (a seated pad, the split keyboard's right half) held on the
   * last poll stays held on its new player without a press edge on the next poll.
   *
   * @param count - 2 for a co-op game, anything else = 1.
   *
   * @example
   * ```ts
   * if (game.inputSeats !== input.seats) input.setSeats(game.inputSeats);
   * ```
   */
  setSeats(count: number): void;
  /**
   * The seat a gamepad holds (M2-06).
   *
   * @param index - Gamepad slot 0–3.
   * @returns {@link PAD_SEAT_P2} for the pad seated as player 2, else {@link PAD_SEAT_NONE}.
   */
  padSeat(index: number): number;
  /** The binding context in use (`'game'` until {@link WebInput.setContext} changes it). */
  readonly context: InputContext;
  /** The keyboard / remote profile in use, or `null` (built-in default bindings). */
  readonly keyProfile: InputProfile | null;
  /** The gamepad profile in use, or `null` (built-in default buttons). */
  readonly gamepadProfile: InputProfile | null;
  /**
   * Applies an input profile: a `keyboard` / `remote` profile to the keyboard source (and a
   * split keyboard profile's second half to {@link WebInput.splitKeyboard} — M2-06), a `gamepad`
   * profile to every pad — its table for the current context, its debounce and direction
   * policies (and its menu table's Confirm / Pause buttons as the pads' join press).
   *
   * @remarks
   * One key profile and one gamepad profile are active at a time; applying a profile of the
   * same kind replaces the previous one, the other kind is untouched. A key profile also sets
   * the device kind reported to the core (`remote` for `keyboard-remote-emulation`, so the
   * core sees a remote). Keys and buttons held while the profile changes keep only the
   * actions both tables give them until released (no phantom press). Load-time call —
   * allocation-free, but not meant per tick.
   *
   * @param profile - A profile from `rebind` (`parseInputProfiles`, the registry).
   *
   * @example
   * ```ts
   * const keys = chooseInputProfile(registry.profiles, [saved, DEFAULT_REMOTE_PROFILE_ID], KEY_PROFILE_DEVICES);
   * if (keys !== null) input.setProfile(keys);
   * ```
   */
  setProfile(profile: InputProfile): void;
  /**
   * Switches keys and pads to the profiles' `game` or `menu` table (decision D15). Call it when
   * `Game.inputContext` changes; a no-op when the context is unchanged or no profile is set.
   *
   * @remarks
   * The context is remembered even without a profile, so a profile applied later starts in the
   * right table. The built-in default tables have no contexts. Allocation-free.
   *
   * @param context - The new context.
   *
   * @example
   * ```ts
   * if (game.inputContext !== input.context) input.setContext(game.inputContext);
   * ```
   */
  setContext(context: InputContext): void;
  /**
   * The rebinding capture's state (M2-16): after {@link WebInput.beginCapture} it waits
   * (`CaptureStatus.Waiting`) until a `poll()` sees the next new key (kind `'keys'`) or gamepad
   * button (kind `'buttons'`) pressed — `Captured`, with its `code` / `keyCode` or `button` — or
   * Escape / the remote's Back (keyCode 10009) — `Cancelled`. Reused: read, never keep.
   */
  readonly capture: InputCaptureState;
  /**
   * Starts a rebinding capture (M2-16 — the Options screen's rebind prompt). Keys and buttons
   * already held do not count; the captured press is also handled as usual.
   *
   * @param kind - `'keys'` (the keyboard / remote) or `'buttons'` (any connected gamepad).
   */
  beginCapture(kind: CaptureKind): void;
  /** Ends a capture (the prompt timed out or closed): back to `CaptureStatus.Idle`. */
  endCapture(): void;
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
 * consumes the keyboard tap latch). Devices are routed to the players by the seats (see the
 * module docs; M2-06). A player's `device` only changes when that device produced input on this
 * poll. Gamepads get the gamepad profile's diagonal
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
  // Player 2's half of a split keyboard (M2-06): bound only while a split profile is applied.
  const splitKeyboard = createKeyboardSource(options.keyTarget, NO_KEYS);
  let split = false;
  let seats = 1;
  const padSeats = new Int8Array(MAX_PADS).fill(PAD_SEAT_NONE);
  // Each pad's resolved actions on the last poll (0 when absent), the split half's held actions,
  // and what a seat change moved onto each player — held there without a new press (M2-06).
  const padLast = new Int32Array(MAX_PADS);
  let halfLast = 0;
  let carry1 = 0;
  let carry2 = 0;
  let joinButtons = joinButtonsOf(DEFAULT_GAMEPAD_BUTTONS);
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
  const capture = new InputCaptureState();
  /** The keyboard capture's count when the capture began (a change is a caught key). */
  let captureKeys = 0;

  /**
   * Checks the keyboard's catch while a capture waits: Escape / Back cancel, a key completes a
   * key capture; during a button capture other keys are ignored (the keyboard re-arms).
   */
  const checkKeyCapture = (): void => {
    const caught = keyboard.capture;
    if (caught.count === captureKeys) return;
    captureKeys = caught.count;
    if (caught.code === CANCEL_CODE || caught.keyCode === CANCEL_KEY_CODE) {
      capture.status = CaptureStatus.Cancelled;
      return;
    }
    if (capture.kind === 'keys') {
      capture.status = CaptureStatus.Captured;
      capture.code = caught.code;
      capture.keyCode = caught.keyCode;
      capture.button = -1;
      return;
    }
    caught.armed = true;
  };

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
    if (capture.status === CaptureStatus.Waiting) checkKeyCapture();
    keyboard.advance();
    splitKeyboard.advance();
    const keyHeld = keyboard.held;
    const keyLatched = keyboard.consumeLatched();
    const halfHeld = splitKeyboard.held;
    const halfLatched = splitKeyboard.consumeLatched();
    const coop = seats >= 2;
    let p1 = keyHeld;
    let p1Latched = keyLatched;
    let p2 = 0;
    let p2Latched = 0;
    let p1Device: InputDeviceKind = keyHeld !== 0 || keyLatched !== 0 ? keyDevice : 'none';
    let p2Device: InputDeviceKind = 'none';
    const halfUsed = halfHeld !== 0 || halfLatched !== 0;
    halfLast = halfHeld;
    if (split && coop) {
      // The split keyboard's right half is player 2's seat.
      p2 = halfHeld;
      p2Latched = halfLatched;
      if (halfUsed) p2Device = keyDevice;
    } else {
      p1 |= halfHeld;
      p1Latched |= halfLatched;
      if (halfUsed) p1Device = keyDevice;
    }

    if (getGamepads !== undefined) {
      const pads = getGamepads();
      const count = Math.min(pads.length, MAX_PADS);
      // Player 2's seat is free for a pad: co-op, no split keyboard, no pad seated. A pad that
      // went away — null, disconnected, or no longer listed (a shorter list) — gives its seat up
      // first, so another pad may take it on this very poll.
      let seatFree = coop && !split;
      for (let i = 0; i < MAX_PADS; i++) {
        const listed = i < count ? pads[i] : null;
        if (listed === null || listed === undefined || !listed.connected) {
          padSeats[i] = PAD_SEAT_NONE;
          padLast[i] = 0;
        } else if (padSeats[i] === PAD_SEAT_P2) {
          seatFree = false;
        }
      }
      for (let i = 0; i < count; i++) {
        const pad = pads[i];
        const state = padStates[i];
        const order = padOrders[i];
        if (state === undefined || order === undefined) continue;
        if (pad === null || pad === undefined || !pad.connected) {
          // A pad that went away gives its seat up (M2-06).
          padSeats[i] = PAD_SEAT_NONE;
          if (pad !== null && pad !== undefined) {
            readGamepadActions(pad, state, padButtons, padPreviousButtons);
          }
          order.update(0);
          continue;
        }
        const before = state.pressedButtons ?? 0;
        const raw = readGamepadActions(pad, state, padButtons, padPreviousButtons);
        const newly = (state.pressedButtons ?? 0) & ~before;
        if (newly !== 0 && capture.status === CaptureStatus.Waiting && capture.kind === 'buttons') {
          // The rebinding capture (M2-16): the lowest button pressed on this poll.
          let bit = 0;
          while (((newly >>> bit) & 1) === 0) bit++;
          capture.status = CaptureStatus.Captured;
          capture.button = bit;
          capture.code = '';
          capture.keyCode = 0;
        }
        order.update(raw);
        const mask = resolveDirections(raw, order.order, padTuning.diagonals, padTuning.socd);
        padLast[i] = mask;
        if (coop && padSeats[i] === PAD_SEAT_P2) {
          p2 |= mask;
          if (mask !== 0) p2Device = 'gamepad';
        } else if (seatFree && (newly & joinButtons) !== 0) {
          // The first join press of an unassigned pad takes player 2's seat (M2-06).
          padSeats[i] = PAD_SEAT_P2;
          seatFree = false;
          p2 |= mask;
          p2Latched |= Action.Confirm;
          p2Device = 'gamepad';
        } else if (mask !== 0) {
          p1 |= mask;
          p1Device = 'gamepad';
        }
      }
    }

    const player1 = snapshot.players[0];
    const player2 = snapshot.players[1];
    if (player1 !== undefined) {
      commitPlayerInput(player1, p1, p1Latched);
      // Held across a seat change: no new press on its new player (M2-06).
      if (carry1 !== 0) player1.pressed &= ~(carry1 & ~p1Latched);
      if (p1Device !== 'none') player1.device = p1Device;
    }
    if (player2 !== undefined) {
      commitPlayerInput(player2, p2, p2Latched);
      if (carry2 !== 0) player2.pressed &= ~(carry2 & ~p2Latched);
      if (p2Device !== 'none') player2.device = p2Device;
    }
    carry1 = 0;
    carry2 = 0;
    return snapshot;
  };

  return {
    keyboard,
    splitKeyboard,
    poll,
    capture,
    beginCapture(kind) {
      capture.kind = kind === 'buttons' ? 'buttons' : 'keys';
      capture.status = CaptureStatus.Waiting;
      capture.code = '';
      capture.keyCode = 0;
      capture.button = -1;
      captureKeys = keyboard.capture.count;
      keyboard.capture.armed = true;
    },
    endCapture() {
      capture.status = CaptureStatus.Idle;
      keyboard.capture.armed = false;
    },
    get context() {
      return context;
    },
    get seats() {
      return seats;
    },
    setSeats(count) {
      const next = count === 2 ? 2 : 1;
      if (next === seats) return;
      seats = next;
      // The sources that change players — a seated pad, a split keyboard's right half — keep what
      // they hold without pressing it anew on their new player (player 2's START that opened the
      // pause menu must not resume it as player 1's).
      let moved = split ? halfLast : 0;
      for (let i = 0; i < MAX_PADS; i++) if (padSeats[i] === PAD_SEAT_P2) moved |= padLast[i];
      if (next === 2) carry2 |= moved;
      else carry1 |= moved;
    },
    padSeat(index) {
      return index >= 0 && index < MAX_PADS ? (padSeats[index] ?? PAD_SEAT_NONE) : PAD_SEAT_NONE;
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
        joinButtons = joinButtonsOf(profile.tables.menu.buttons);
        setPadButtons(profile.tables[context].buttons);
        return;
      }
      keyProfile = profile;
      keyDevice = profile.device;
      keyboard.setTuning(profile);
      keyboard.setBindings(profile.tables[context].keys);
      const halves = profile.splitTables ?? null;
      split = halves !== null;
      splitKeyboard.setTuning(profile);
      splitKeyboard.setBindings(halves !== null ? halves[context].keys : NO_KEYS);
    },
    setContext(next) {
      if (next === context) return;
      context = next;
      if (keyProfile !== null) {
        keyboard.setBindings(keyProfile.tables[next].keys);
        const halves = keyProfile.splitTables ?? null;
        if (halves !== null) splitKeyboard.setBindings(halves[next].keys);
      }
      if (padProfile !== null) setPadButtons(padProfile.tables[next].buttons);
    },
    clear() {
      keyboard.clear();
      splitKeyboard.clear();
      resetInputSnapshot(snapshot);
    },
    destroy() {
      keyboard.detach();
      splitKeyboard.detach();
    },
  };
}
