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
 * Auto-repeat `keydown`s are ignored (held state comes from down/up only), bound keys
 * get `preventDefault()` (arrows/space must not scroll; Tizen Back must not navigate),
 * and `blur` clears everything so keys never stick.
 *
 * **Implements.** shmup_feat.md §4 input requirements (keyboard: `e.code`, ignore
 * `e.repeat`, preventDefault, clear on blur, edge latching) and remote-first rule 3
 * (robust key-state tracking from keydown/keyup only).
 *
 * **Public API.** {@link createKeyboardSource}, {@link KeyboardSource},
 * {@link KeyEventLike}.
 *
 * @module
 */
import { defineModule, type ActionMask } from '@shmup/core';
import { resolveKeyActions, type KeyBindings } from '../keymap/index.js';

/** Module descriptor. */
export const moduleInfo = defineModule({
  name: 'keyboard',
  status: 'implemented',
  specRefs: ['shmup_feat.md §4'],
});

/** The fields of `KeyboardEvent` this module reads (lets tests dispatch plain objects). */
export interface KeyEventLike {
  readonly type: string;
  readonly code: string;
  readonly keyCode: number;
  readonly repeat: boolean;
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
  preventDefault(): void;
}

/** A keyboard (or TV remote) input source. */
export interface KeyboardSource {
  /** Actions currently held. */
  readonly held: ActionMask;
  /** Returns actions pressed since the previous call and clears the latch. */
  consumeLatched(): ActionMask;
  /** Forgets all held keys (window blur, scene change). */
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

const BIT_COUNT = 16;

/**
 * Creates a keyboard source and attaches it to `target`.
 *
 * @param target - Event target to listen on (normally `window`); `null` = manual feeding.
 * @param bindings - Key → action bindings.
 * @returns The source.
 */
export function createKeyboardSource(
  target: EventTarget | null,
  bindings: KeyBindings,
): KeyboardSource {
  /** Physical keys currently down → their action masks. */
  const downKeys = new Map<string, ActionMask>();
  /** How many held keys contribute each action bit. */
  const bitCounts = new Int16Array(BIT_COUNT);
  let held = 0;
  let latched = 0;

  const addBits = (mask: ActionMask, delta: number): void => {
    for (let bit = 0; bit < BIT_COUNT; bit++) {
      if ((mask & (1 << bit)) === 0) continue;
      const raw = (bitCounts[bit] ?? 0) + delta;
      const count = raw < 0 ? 0 : raw;
      bitCounts[bit] = count;
      if (count > 0) held |= 1 << bit;
      else held &= ~(1 << bit);
    }
  };

  const clear = (): void => {
    downKeys.clear();
    bitCounts.fill(0);
    held = 0;
  };

  const handleEvent = (raw: KeyEventLike | Event): void => {
    if (raw.type === 'blur') {
      clear();
      return;
    }
    const event = raw as KeyEventLike;
    const mask = resolveKeyActions(event.code, event.keyCode, bindings);
    if (mask === 0) return;
    // Keep browser/devtools shortcuts (Ctrl+R, Cmd+Alt+I, …) working.
    if (event.ctrlKey !== true && event.metaKey !== true) event.preventDefault();

    const id = event.code !== '' ? event.code : `keyCode:${event.keyCode}`;
    if (event.type === 'keydown') {
      if (event.repeat || downKeys.has(id)) return;
      downKeys.set(id, mask);
      addBits(mask, 1);
      latched |= mask;
    } else if (event.type === 'keyup') {
      const downMask = downKeys.get(id);
      if (downMask === undefined) return;
      downKeys.delete(id);
      addBits(downMask, -1);
    }
  };

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
    get held() {
      return held;
    },
    consumeLatched() {
      const value = latched;
      latched = 0;
      return value;
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
