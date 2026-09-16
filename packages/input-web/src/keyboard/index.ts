/**
 * # keyboard — keyboard / TV-remote key events → held + latched action masks
 *
 * **Responsibility.** Listens to `keydown` / `keyup` / `blur` on an event target
 * (normally `window`) and maintains:
 * - `held`: actions whose keys are down right now (tracked per physical key, so
 *   releasing one of two keys bound to the same action keeps it held);
 * - `latched`: actions pressed since the last {@link KeyboardSource.consumeLatched}
 *   call — a tap shorter than one tick is never lost.
 *
 * Auto-repeat `keydown`s are ignored (held state comes from down/up only — also a second
 * `keydown` of a key that is already down without the `repeat` flag), bound keys get
 * `preventDefault()` (arrows/space must not scroll; Tizen Back must not navigate), and `blur`
 * clears everything so keys never stick.
 *
 * The active input profile (`rebind`) tunes it: {@link KeyboardSource.setBindings} swaps the
 * binding table (profile or `game`/`menu` context change — a key held across the switch keeps
 * only the actions it has in both tables, so no action appears without a press), and
 * {@link KeyboardSource.setTuning} sets the release debounce, the diagonal policy, SOCD and the
 * **single-key** model (`remote`: while a key is down, a `keydown` of a different key is dropped —
 * the Samsung remote delivers one key at a time, M3-02b). The debounce ages once per poll ({@link KeyboardSource.advance}); the press
 * order the policies need comes from the event order.
 *
 * **Implements.** shmup_feat.md §4 input requirements (keyboard: `e.code`, ignore
 * `e.repeat`, preventDefault, clear on blur, edge latching, SOCD) and remote-first rules 2–3
 * (4-way policy; robust key-state tracking from keydown/keyup only, release debounce).
 *
 * **Rebinding capture (M2-16).** {@link KeyboardSource.capture} catches the next new key pressed,
 * bound or not (the Options screen's rebind prompt — `WebInput.beginCapture`).
 *
 * **Public API.** {@link createKeyboardSource}, {@link KeyboardSource},
 * {@link KeyEventLike}, {@link MAX_TRACKED_KEYS}, {@link KeyCapture} (M2-16).
 *
 * @module
 */
import { defineModule, type ActionMask } from '@shmup/core';
import { findKeyActions, type KeyBindings } from '../keymap/index.js';
import {
  DEFAULT_INPUT_TUNING,
  DIRECTION_COUNT,
  createReleaseDebouncer,
  resolveDirections,
  type InputTuning,
} from '../remote/index.js';

/** Module descriptor. */
export const moduleInfo = defineModule({
  name: 'keyboard',
  status: 'implemented',
  specRefs: ['shmup_feat.md §4'],
});

/** Physical keys tracked at once; further keydowns are ignored until one is released. */
export const MAX_TRACKED_KEYS = 32;

/** The fields of `KeyboardEvent` this module reads (lets tests dispatch plain objects). */
export interface KeyEventLike {
  /** `'keydown'`, `'keyup'` or `'blur'` (other types are ignored). */
  readonly type: string;
  /** Physical key id, e.g. `'KeyZ'`; empty for many TV remote keys. */
  readonly code: string;
  /** Legacy numeric key code, e.g. `10009` for remote Back. */
  readonly keyCode: number;
  /** `true` for auto-repeat keydowns (ignored). */
  readonly repeat: boolean;
  /** Ctrl held — the event is not `preventDefault()`-ed so browser shortcuts work. */
  readonly ctrlKey?: boolean;
  /** Cmd/Meta held — same as `ctrlKey`. */
  readonly metaKey?: boolean;
  /** Stops the browser / TV default action (scrolling, Back navigation). */
  preventDefault(): void;
}

/**
 * A one-shot catch of the next key pressed (M2-16 — the rebinding capture,
 * `WebInput.beginCapture`). A class so its fields stay unboxed; the source fills it from its event
 * handler.
 */
export class KeyCapture {
  /** Whether the next new keydown is caught (cleared by the catch). */
  armed = false;
  /** Keys caught so far (increases with every catch — readers compare it). */
  count = 0;
  /** `KeyboardEvent.code` of the last caught key (`''` for many TV remote keys). */
  code = '';
  /** Legacy key code of the last caught key. */
  keyCode = 0;
}

/** A keyboard (or TV remote) input source. */
export interface KeyboardSource {
  /**
   * The rebinding capture (M2-16): while {@link KeyCapture.armed}, the next keydown of a key that
   * is not already down (auto-repeats, a key still held or inside its release debounce — a TV
   * remote's fake keyup / keydown pair — do not count) is caught — whether the tables bind it or
   * not — and `preventDefault()`-ed; it is then handled as usual.
   */
  readonly capture: KeyCapture;
  /**
   * Actions currently held: every tracked key (down, or released inside the debounce window),
   * with the SOCD and diagonal policies applied. Computed on read, without allocating.
   */
  readonly held: ActionMask;
  /** The binding table in use. */
  readonly bindings: KeyBindings;
  /** The tuning in use (release debounce, diagonal policy, SOCD). */
  readonly tuning: InputTuning;
  /**
   * Reads and clears the tap latch.
   *
   * @returns Actions pressed since the previous call (even if already released).
   */
  consumeLatched(): ActionMask;
  /**
   * One poll of the release debounce: keys released `releaseDebounceTicks` polls ago stop
   * counting as held. Call exactly once per simulation tick, before reading
   * {@link KeyboardSource.held}.
   */
  advance(): void;
  /**
   * Swaps the binding table (a new profile, or a `game`/`menu` context switch).
   *
   * @remarks
   * Keys held across the switch keep only the actions they have in *both* tables until they
   * are released (so holding X — Sub in the game, Back in menus — while a menu opens does not
   * press Back), and a key the new table does not know stops contributing.
   *
   * @param bindings - The new table.
   */
  setBindings(bindings: KeyBindings): void;
  /**
   * Changes the tuning. A shorter debounce window shortens pending releases.
   *
   * @param tuning - Release debounce (clamped to `0 … MAX_RELEASE_DEBOUNCE_TICKS`), diagonal
   *   policy and SOCD policy.
   */
  setTuning(tuning: InputTuning): void;
  /** Forgets all held keys immediately, debounce included (window blur, scene change). */
  clear(): void;
  /**
   * Feeds one event (the listeners call this; tests may call it directly).
   *
   * @param event - A `keydown`, `keyup` or `blur` event.
   */
  handleEvent(event: KeyEventLike | Event): void;
  /** Removes the event listeners. */
  detach(): void;
}

/**
 * Creates a keyboard source and attaches it to `target`.
 *
 * @remarks
 * `keydown` / `keyup` are captured in the capture phase; `blur` is listened to normally.
 * A physical key is identified by `code`, or by `keyCode` when `code` is empty (TV remotes).
 * A key counts as bound when the table knows it — even with an empty action list (profile
 * tables list keys of the other context that way), so it is still `preventDefault()`-ed.
 * A `keyup` for a key that was never seen down is ignored. With a release debounce, a
 * `keydown` that arrives while the key's release is pending cancels the release: no new
 * `pressed` edge, no new latch. Event handling allocates nothing; nor do
 * {@link KeyboardSource.advance} and {@link KeyboardSource.held}.
 *
 * @param target - Event target to listen on (normally `window`); `null` = manual feeding.
 * @param bindings - Key → action bindings.
 * @param tuning - Release debounce, diagonal and SOCD policies (default: none, 8-way, neutral).
 * @returns The source.
 *
 * @example
 * ```ts
 * const keys = createKeyboardSource(window, DEFAULT_KEY_BINDINGS);
 * // once per tick:
 * keys.advance();
 * const held = keys.held;
 * const taps = keys.consumeLatched();
 * // on teardown:
 * keys.detach();
 * ```
 */
export function createKeyboardSource(
  target: EventTarget | null,
  bindings: KeyBindings,
  tuning: InputTuning = DEFAULT_INPUT_TUNING,
): KeyboardSource {
  let table = bindings;
  let currentTuning = tuning;
  const debounce = createReleaseDebouncer(tuning.releaseDebounceTicks, MAX_TRACKED_KEYS);
  /** Per slot: `code` of the key ('' for keyCode-only remote keys). */
  const slotCode: string[] = [];
  for (let i = 0; i < MAX_TRACKED_KEYS; i++) slotCode.push('');
  /** Per slot: legacy key code. */
  const slotKeyCode = new Int32Array(MAX_TRACKED_KEYS);
  /** Per slot: actions the key contributes. */
  const slotMask = new Int32Array(MAX_TRACKED_KEYS);
  /** Per slot: press sequence number (event order, for the direction policies). */
  const slotOrder = new Float64Array(MAX_TRACKED_KEYS);
  /** Scratch: press order per direction, filled on every `held` read. */
  const directionOrder = new Float64Array(DIRECTION_COUNT);
  let sequence = 0;
  let latched = 0;
  const caught = new KeyCapture();

  /**
   * Finds the tracked slot of a physical key.
   *
   * @param code - `KeyboardEvent.code`.
   * @param keyCode - Legacy key code (used when `code` is empty).
   * @returns The slot, or `-1` when the key is not tracked.
   */
  const findSlot = (code: string, keyCode: number): number => {
    for (let i = 0; i < MAX_TRACKED_KEYS; i++) {
      if (!debounce.isHeld(i) || slotCode[i] !== code) continue;
      if (code !== '' || slotKeyCode[i] === keyCode) return i;
    }
    return -1;
  };

  /**
   * Finds a slot that tracks no key.
   *
   * @returns The slot, or `-1` when all {@link MAX_TRACKED_KEYS} are in use.
   */
  const freeSlot = (): number => {
    for (let i = 0; i < MAX_TRACKED_KEYS; i++) if (!debounce.isHeld(i)) return i;
    return -1;
  };

  /**
   * Whether any tracked key is physically down (a pending release does not count — its key is
   * already up, so the hardware would deliver the next one).
   *
   * @returns `true` while a key is held down.
   */
  const anyKeyDown = (): boolean => {
    for (let i = 0; i < MAX_TRACKED_KEYS; i++) {
      if (debounce.isHeld(i) && !debounce.isReleasing(i)) return true;
    }
    return false;
  };

  /**
   * Current held mask with the direction policies applied.
   *
   * @returns Held actions.
   */
  const readHeld = (): ActionMask => {
    let raw = 0;
    directionOrder.fill(0);
    for (let i = 0; i < MAX_TRACKED_KEYS; i++) {
      if (!debounce.isHeld(i)) continue;
      const mask = slotMask[i];
      raw |= mask;
      for (let d = 0; d < DIRECTION_COUNT; d++) {
        if ((mask & (1 << d)) !== 0 && slotOrder[i] > directionOrder[d]) {
          directionOrder[d] = slotOrder[i];
        }
      }
    }
    return resolveDirections(raw, directionOrder, currentTuning.diagonals, currentTuning.socd);
  };

  /** Forgets every held key (the tap latch is kept). */
  const clear = (): void => {
    debounce.clear();
  };

  /**
   * Applies one event to the key state.
   *
   * @param raw - A `keydown`, `keyup` or `blur` event (DOM event or test object).
   */
  const handleEvent = (raw: KeyEventLike | Event): void => {
    if (raw.type === 'blur') {
      clear();
      return;
    }
    if (raw.type !== 'keydown' && raw.type !== 'keyup') return;
    const event = raw as KeyEventLike;
    const mask = findKeyActions(event.code, event.keyCode, table);
    // A key the table does not know is ignored — unless it is still tracked from a table swap
    // (its keyup must free the slot).
    const slot = findSlot(event.code, event.keyCode);
    if (caught.armed && event.type === 'keydown' && !event.repeat && slot < 0) {
      // The rebinding capture (M2-16): any new key, bound or not.
      caught.armed = false;
      caught.code = event.code;
      caught.keyCode = event.keyCode;
      caught.count++;
      if (event.ctrlKey !== true && event.metaKey !== true) event.preventDefault();
    }
    if (mask < 0 && slot < 0) return;
    // Keep browser/devtools shortcuts (Ctrl+R, Cmd+Alt+I, …) working.
    if (event.ctrlKey !== true && event.metaKey !== true) event.preventDefault();

    if (event.type === 'keydown') {
      if (slot >= 0) {
        // Already down (repeat without the flag) or a pending release: resume, no edge.
        debounce.press(slot);
        return;
      }
      if (event.repeat) return;
      // Single-key devices (the Samsung remote — M3-02b finding 1): while any key is down the
      // hardware never delivers a second key's keydown. Drop it, so the emulation and the
      // playtest bot's model behave like the real remote.
      if (currentTuning.singleKey && anyKeyDown()) return;
      const free = freeSlot();
      if (free < 0) return;
      slotCode[free] = event.code;
      slotKeyCode[free] = event.keyCode;
      slotMask[free] = mask;
      slotOrder[free] = ++sequence;
      debounce.press(free);
      latched |= mask;
    } else if (slot >= 0 && !debounce.isReleasing(slot)) {
      debounce.release(slot);
    }
  };

  /**
   * The DOM listener (one function for all three event types, so `detach` can remove it).
   *
   * @param event - A `keydown`, `keyup` or `blur` event.
   */
  const listener = (event: Event): void => {
    handleEvent(event);
  };
  // Capture phase so no other handler can swallow a key first. (Options object, not the
  // boolean form: Node's EventTarget mishandles `removeEventListener(type, fn, true)`.)
  const capture: EventListenerOptions = { capture: true };
  if (target !== null) {
    target.addEventListener('keydown', listener, capture);
    target.addEventListener('keyup', listener, capture);
    target.addEventListener('blur', listener);
  }

  return {
    capture: caught,
    get held() {
      return readHeld();
    },
    get bindings() {
      return table;
    },
    get tuning() {
      return currentTuning;
    },
    consumeLatched() {
      const value = latched;
      latched = 0;
      return value;
    },
    advance() {
      debounce.poll();
    },
    setBindings(next) {
      if (next === table) return;
      table = next;
      for (let i = 0; i < MAX_TRACKED_KEYS; i++) {
        if (!debounce.isHeld(i)) continue;
        const mask = findKeyActions(slotCode[i], slotKeyCode[i], next);
        slotMask[i] &= mask < 0 ? 0 : mask;
      }
    },
    setTuning(next) {
      currentTuning = next;
      debounce.setTicks(next.releaseDebounceTicks);
    },
    clear,
    handleEvent,
    detach() {
      if (target === null) return;
      target.removeEventListener('keydown', listener, capture);
      target.removeEventListener('keyup', listener, capture);
      target.removeEventListener('blur', listener);
    },
  };
}
