/**
 * The keyboard source's **single-key** model (plan M3-02b, `InputTuning.singleKey`): the Samsung
 * Smart Remote delivers one key at a time — while a key is down, a `keydown` of a *different* key
 * is never delivered, on press or on release, and the held key keeps repeating
 * (`docs/dev/input-probe-results.md` finding 1). The source drops such a keydown, so a keyboard
 * emulating the remote, the playtest bot's model and the hardware all behave the same way.
 *
 * What must keep working under it: the held key's own flagless repeats, its keyup, a key whose
 * release-debounce window is still running (that key is physically *up*, so it blocks nothing),
 * every key after the last one comes up, switching the model on and off at run time, and the
 * rebinding capture — which reads the raw event before the model can drop it.
 */
import { Action } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { MAX_TRACKED_KEYS, createKeyboardSource } from '../../src/keyboard/index.js';
import type { KeyBindings } from '../../src/keymap/index.js';
import { DEFAULT_INPUT_TUNING, type InputTuning } from '../../src/remote/index.js';
import { key } from '../helpers.js';

const { Up, Down, Left, Right, PowerUp } = Action;

/** Remote-style table: key codes only (OK = PowerUp), like the TV sends. */
const REMOTE: KeyBindings = {
  byCode: {},
  byKeyCode: {
    13: PowerUp,
    37: Left,
    38: Up,
    39: Right,
    40: Down,
    10009: Action.Pause,
    427: Action.Special,
    428: Action.Speed,
  },
};

/**
 * A tuning with the single-key model on.
 *
 * @param releaseDebounceTicks - Debounce window (default 0, the measured remote).
 * @returns The tuning.
 */
const single = (releaseDebounceTicks = 0): InputTuning => ({
  ...DEFAULT_INPUT_TUNING,
  releaseDebounceTicks,
  singleKey: true,
});

/**
 * A manually fed source with the remote table.
 *
 * @param tuning - The tuning (default: single-key, no debounce).
 * @returns The source.
 */
const make = (tuning: InputTuning = single()) => createKeyboardSource(null, REMOTE, tuning);

describe('input-web/keyboard singleKey: the second key is never delivered', () => {
  it.each([
    ['another arrow', 38, Up],
    ['OK', 13, PowerUp],
    ['Ch+', 427, Action.Special],
    ['Back', 10009, Action.Pause],
  ])('drops a %s pressed while an arrow is held, and its keyup too', (_label, keyCode, action) => {
    const kb = make();
    kb.handleEvent(key('keydown', '', 39));
    expect(kb.consumeLatched()).toBe(Right);
    kb.handleEvent(key('keydown', '', keyCode));
    kb.handleEvent(key('keyup', '', keyCode));
    for (let i = 0; i < 4; i++) {
      kb.advance();
      expect(kb.held).toBe(Right);
      expect(kb.consumeLatched() & action).toBe(0);
    }
    // Once the arrow is up, the very same key registers normally.
    kb.handleEvent(key('keyup', '', 39));
    kb.advance();
    expect(kb.held).toBe(0);
    kb.handleEvent(key('keydown', '', keyCode));
    expect(kb.consumeLatched()).toBe(action);
  });

  it('keeps the held key through its own flagless repeats and releases on its keyup', () => {
    const kb = make();
    kb.handleEvent(key('keydown', '', 37));
    expect(kb.consumeLatched()).toBe(Left);
    for (let i = 0; i < 12; i++) {
      // A repeat is a plain keydown of a key that is already tracked: resumed, no new edge.
      kb.handleEvent(key('keydown', '', 37, { repeat: false }));
      kb.advance();
      expect(kb.held).toBe(Left);
      expect(kb.consumeLatched()).toBe(0);
    }
    kb.handleEvent(key('keyup', '', 37));
    kb.advance();
    expect(kb.held).toBe(0);
  });

  it('drops a second key however long the first is held, and never latches it later', () => {
    const kb = make();
    kb.handleEvent(key('keydown', '', 40));
    kb.consumeLatched();
    for (let i = 0; i < 200; i++) {
      if (i % 5 === 0) kb.handleEvent(key('keydown', '', 13));
      if (i % 5 === 2) kb.handleEvent(key('keyup', '', 13));
      kb.advance();
      expect(kb.held, `tick ${String(i)}`).toBe(Down);
      expect(kb.consumeLatched(), `tick ${String(i)}`).toBe(0);
    }
  });

  it('lets the next key through only from the tick the last one came up', () => {
    const kb = make();
    kb.handleEvent(key('keydown', '', 39));
    kb.consumeLatched();
    kb.handleEvent(key('keyup', '', 39));
    // Same frame: the key is already up, so the next one is delivered.
    kb.handleEvent(key('keydown', '', 38));
    expect(kb.consumeLatched()).toBe(Up);
    kb.advance();
    expect(kb.held).toBe(Up);
  });
});

describe('input-web/keyboard singleKey: what it must not block', () => {
  it('does not let a key inside its release-debounce window block the next one', () => {
    // The debounced key is physically up — the hardware would deliver the next key at once.
    const kb = make(single(4));
    kb.handleEvent(key('keydown', '', 39));
    expect(kb.consumeLatched()).toBe(Right);
    kb.handleEvent(key('keyup', '', 39));
    kb.advance();
    expect(kb.held).toBe(Right); // still held by the debounce
    kb.handleEvent(key('keydown', '', 38));
    expect(kb.consumeLatched()).toBe(Up);
    for (let i = 0; i < 6; i++) kb.advance();
    expect(kb.held).toBe(Up);
  });

  it('leaves keys already down alone when the model is switched on mid-hold', () => {
    const kb = make({ ...DEFAULT_INPUT_TUNING, singleKey: false });
    kb.handleEvent(key('keydown', '', 39));
    kb.handleEvent(key('keydown', '', 38));
    expect(kb.consumeLatched()).toBe(Right | Up);
    kb.advance();
    expect(kb.held).toBe(Right | Up);
    kb.setTuning(single());
    kb.advance();
    expect(kb.held).toBe(Right | Up); // nothing is torn down
    // But no third key gets in now.
    kb.handleEvent(key('keydown', '', 13));
    expect(kb.consumeLatched()).toBe(0);
    kb.handleEvent(key('keyup', '', 39));
    kb.handleEvent(key('keyup', '', 38));
    kb.advance();
    expect(kb.held).toBe(0);
  });

  it('goes back to tracking every key when the model is switched off', () => {
    const kb = make();
    kb.handleEvent(key('keydown', '', 39));
    kb.handleEvent(key('keydown', '', 38));
    expect(kb.consumeLatched()).toBe(Right);
    kb.setTuning({ ...DEFAULT_INPUT_TUNING, singleKey: false });
    kb.handleEvent(key('keydown', '', 38));
    expect(kb.consumeLatched()).toBe(Up);
    kb.advance();
    expect(kb.held).toBe(Right | Up);
  });

  it('clears everything on blur, so the next key is delivered again', () => {
    const kb = make();
    kb.handleEvent(key('keydown', '', 39));
    kb.consumeLatched();
    kb.handleEvent({ type: 'blur' } as unknown as Parameters<typeof kb.handleEvent>[0]);
    kb.advance();
    expect(kb.held).toBe(0);
    kb.handleEvent(key('keydown', '', 13));
    expect(kb.consumeLatched()).toBe(PowerUp);
  });

  it('still captures a key for REBIND, even one the model would drop', () => {
    // The capture reads the raw event before the model does: a player rebinding on the TV holds
    // no key while pressing the one they want, but the capture must not depend on that.
    const kb = make();
    kb.handleEvent(key('keydown', '', 39));
    kb.consumeLatched();
    kb.capture.armed = true;
    kb.handleEvent(key('keydown', '', 428));
    expect(kb.capture.armed).toBe(false);
    expect(kb.capture.keyCode).toBe(428);
    expect(kb.capture.count).toBe(1);
    // …and it still never reaches the game as a press.
    kb.advance();
    expect(kb.held).toBe(Right);
  });

  it('does not use up a tracking slot for a key it dropped', () => {
    const kb = make();
    kb.handleEvent(key('keydown', '', 39));
    kb.consumeLatched();
    // Far more keys than the source can track, all swallowed.
    for (let i = 0; i < MAX_TRACKED_KEYS * 4; i++) {
      kb.handleEvent(key('keydown', '', 13));
      kb.handleEvent(key('keyup', '', 13));
    }
    kb.handleEvent(key('keyup', '', 39));
    kb.advance();
    expect(kb.held).toBe(0);
    // The slots are all free: a fresh key still registers.
    kb.handleEvent(key('keydown', '', 38));
    expect(kb.consumeLatched()).toBe(Up);
  });
});
