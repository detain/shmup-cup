/**
 * Edge cases of the keyboard source under an input profile: the release debounce as the key
 * source runs it (resume without a new edge or a new press order, keyups during the window,
 * blur, tuning changes, slots held by pending releases), table swaps during a pending release,
 * keys bound to no action in the current context, physical-key identity (`code` vs `keyCode`)
 * and the direction policies driven by the event order.
 */
import { Action } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { MAX_TRACKED_KEYS, createKeyboardSource } from '../../src/keyboard/index.js';
import type { KeyBindings } from '../../src/keymap/index.js';
import type { InputTuning } from '../../src/remote/index.js';
import { key } from '../helpers.js';

const { Up, Down, Left, Right } = Action;

/** Remote-style table: keyCode only (OK = PowerUp in this "game" table). */
const REMOTE: KeyBindings = {
  byCode: {},
  byKeyCode: { 13: Action.PowerUp, 37: Left, 38: Up, 39: Right, 40: Down, 427: 0 },
};

/**
 * A tuning.
 *
 * @param releaseDebounceTicks - Debounce window.
 * @param diagonals - Diagonal policy.
 * @param socd - SOCD policy.
 */
const tuning = (
  releaseDebounceTicks: number,
  diagonals: InputTuning['diagonals'] = 'combine',
  socd: InputTuning['socd'] = 'neutral',
): InputTuning => ({ releaseDebounceTicks, diagonals, socd });

/**
 * A manually fed source with the remote table.
 *
 * @param t - Tuning.
 */
const make = (t: InputTuning = tuning(2)) => createKeyboardSource(null, REMOTE, t);

describe('input-web/keyboard release debounce', () => {
  it('a fake keyup/keydown pair inside the window: no release, no new latch', () => {
    const kb = make();
    kb.handleEvent(key('keydown', '', 39));
    expect(kb.consumeLatched()).toBe(Right);
    kb.handleEvent(key('keyup', '', 39));
    kb.advance();
    expect(kb.held).toBe(Right);
    kb.handleEvent(key('keydown', '', 39));
    expect(kb.consumeLatched()).toBe(0);
    for (let i = 0; i < 10; i++) kb.advance();
    expect(kb.held).toBe(Right);
  });

  it('a keydown after the window ran out is a fresh press that latches', () => {
    const kb = make();
    kb.handleEvent(key('keydown', '', 13));
    kb.consumeLatched();
    kb.handleEvent(key('keyup', '', 13));
    kb.advance();
    kb.advance();
    expect(kb.held).toBe(Action.PowerUp);
    kb.advance();
    expect(kb.held).toBe(0);
    kb.handleEvent(key('keydown', '', 13));
    expect(kb.consumeLatched()).toBe(Action.PowerUp);
  });

  it('keyups during the window are prevented but neither restart nor shorten it', () => {
    const kb = make();
    kb.handleEvent(key('keydown', '', 38));
    kb.handleEvent(key('keyup', '', 38));
    kb.advance();
    const again = key('keyup', '', 38);
    kb.handleEvent(again);
    expect(again.prevented).toBe(true);
    kb.advance();
    expect(kb.held).toBe(Up);
    kb.advance();
    expect(kb.held).toBe(0);
  });

  it('auto-repeat keydowns (with the flag) also resume a pending release', () => {
    const kb = make();
    kb.handleEvent(key('keydown', '', 40));
    kb.consumeLatched();
    kb.handleEvent(key('keyup', '', 40));
    kb.handleEvent(key('keydown', '', 40, { repeat: true }));
    for (let i = 0; i < 5; i++) kb.advance();
    expect(kb.held).toBe(Down);
    expect(kb.consumeLatched()).toBe(0);
  });

  it('a repeat keydown of a key that is not tracked is prevented but not tracked or latched', () => {
    const kb = make();
    const repeat = key('keydown', '', 37, { repeat: true });
    kb.handleEvent(repeat);
    expect(repeat.prevented).toBe(true);
    expect(kb.held).toBe(0);
    expect(kb.consumeLatched()).toBe(0);
  });

  it('blur drops pending releases at once; the next keydown is a new press', () => {
    const kb = make();
    kb.handleEvent(key('keydown', '', 39));
    kb.consumeLatched();
    kb.handleEvent(key('keyup', '', 39));
    kb.handleEvent({ type: 'blur', code: '', keyCode: 0, repeat: false, preventDefault() {} });
    expect(kb.held).toBe(0);
    kb.handleEvent(key('keydown', '', 39));
    expect(kb.consumeLatched()).toBe(Right);
  });

  it('setTuning to window 0 releases pending keys immediately; the tuning object is kept', () => {
    const kb = make(tuning(5));
    kb.handleEvent(key('keydown', '', 39));
    kb.handleEvent(key('keyup', '', 39));
    expect(kb.held).toBe(Right);
    const next = tuning(0);
    kb.setTuning(next);
    expect(kb.tuning).toBe(next);
    expect(kb.held).toBe(0);
  });

  it('without advance() a released key never ages out (poll drives the window)', () => {
    const kb = make(tuning(1));
    kb.handleEvent(key('keydown', '', 37));
    kb.handleEvent(key('keyup', '', 37));
    for (let i = 0; i < 100; i++) expect(kb.held).toBe(Left);
    kb.advance();
    kb.advance();
    expect(kb.held).toBe(0);
  });

  it('a key in its release window still occupies its slot', () => {
    const codes: Record<string, number> = {};
    for (let i = 0; i < MAX_TRACKED_KEYS; i++) codes[`Key${String(i)}`] = Action.Shot;
    codes['KeyUp'] = Up;
    const kb = createKeyboardSource(null, { byCode: codes, byKeyCode: {} }, tuning(1));
    for (let i = 0; i < MAX_TRACKED_KEYS; i++) kb.handleEvent(key('keydown', `Key${String(i)}`));
    kb.handleEvent(key('keyup', 'Key0'));
    kb.handleEvent(key('keydown', 'KeyUp'));
    expect(kb.held).toBe(Action.Shot); // Key0 still debouncing: no free slot
    kb.advance();
    kb.advance(); // Key0 released
    kb.handleEvent(key('keydown', 'KeyUp'));
    expect(kb.held).toBe(Action.Shot | Up);
  });
});

describe('input-web/keyboard table swaps with pending releases and 0-masks', () => {
  const MENU: KeyBindings = {
    byCode: {},
    byKeyCode: { 13: Action.Confirm, 37: Left, 38: Up, 39: Right, 40: Down, 427: 0 },
  };

  it('a key swapped while releasing keeps only the common actions, even when resumed', () => {
    const kb = make();
    kb.handleEvent(key('keydown', '', 13)); // PowerUp
    kb.handleEvent(key('keyup', '', 13));
    kb.setBindings(MENU); // PowerUp & Confirm = 0
    expect(kb.held).toBe(0);
    kb.handleEvent(key('keydown', '', 13)); // resumes: still the old (intersected) key
    expect(kb.held).toBe(0);
    kb.consumeLatched();
    kb.handleEvent(key('keyup', '', 13));
    kb.advance();
    kb.advance();
    kb.advance();
    kb.handleEvent(key('keydown', '', 13));
    expect(kb.held).toBe(Action.Confirm);
    expect(kb.consumeLatched()).toBe(Action.Confirm);
  });

  it('an arrow held across the swap keeps moving (bound the same in both tables)', () => {
    const kb = make();
    kb.handleEvent(key('keydown', '', 38));
    kb.setBindings(MENU);
    kb.setBindings(REMOTE);
    expect(kb.held).toBe(Up);
  });

  it('a key bound to no action is tracked and prevented, but never held or latched', () => {
    const kb = make();
    const down = key('keydown', '', 427);
    kb.handleEvent(down);
    expect(down.prevented).toBe(true);
    expect(kb.held).toBe(0);
    expect(kb.consumeLatched()).toBe(0);
    // It is tracked: its slot is taken until it is released.
    const up = key('keyup', '', 427);
    kb.handleEvent(up);
    expect(up.prevented).toBe(true);
  });

  it('setBindings with the table in use changes nothing', () => {
    const kb = make();
    kb.handleEvent(key('keydown', '', 13));
    kb.setBindings(REMOTE);
    expect(kb.bindings).toBe(REMOTE);
    expect(kb.held).toBe(Action.PowerUp);
  });

  // Regression (M1-05 tests): a code bound to no action (a placeholder for the other context)
  // used to hide the keyCode binding of the same key.
  it('a 0 code entry falls through to the keyCode binding of the same key', () => {
    const table: KeyBindings = { byCode: { Enter: 0 }, byKeyCode: { 13: Action.Confirm } };
    const kb = createKeyboardSource(null, table);
    kb.handleEvent(key('keydown', 'Enter', 13));
    expect(kb.held).toBe(Action.Confirm);
    expect(kb.consumeLatched()).toBe(Action.Confirm);
    const other = key('keydown', 'Enter', 14);
    kb.handleEvent(key('keyup', 'Enter', 13));
    kb.handleEvent(other); // no keyCode binding: known (prevented) but no action
    expect(other.prevented).toBe(true);
    expect(kb.held).toBe(0);
  });
});

describe('input-web/keyboard physical key identity', () => {
  it('a keyCode-only remote key and a keyboard key with the same keyCode are different keys', () => {
    const kb = createKeyboardSource(null, {
      byCode: { Enter: Action.Confirm },
      byKeyCode: REMOTE.byKeyCode,
    });
    kb.handleEvent(key('keydown', '', 13)); // remote OK → PowerUp
    kb.handleEvent(key('keydown', 'Enter', 13)); // keyboard Enter → Confirm
    expect(kb.held).toBe(Action.PowerUp | Action.Confirm);
    kb.handleEvent(key('keyup', '', 13));
    expect(kb.held).toBe(Action.Confirm);
    kb.handleEvent(key('keyup', 'Enter', 13));
    expect(kb.held).toBe(0);
  });

  it('keyCode-only keys are told apart by keyCode', () => {
    const kb = make(tuning(0));
    kb.handleEvent(key('keydown', '', 37));
    kb.handleEvent(key('keydown', '', 38));
    kb.handleEvent(key('keyup', '', 37));
    expect(kb.held).toBe(Up);
  });
});

describe('input-web/keyboard direction policies from the event order', () => {
  it('firstWins keeps the first arrow until it is released', () => {
    const kb = make(tuning(0, 'firstWins'));
    kb.handleEvent(key('keydown', '', 39));
    kb.handleEvent(key('keydown', '', 38));
    expect(kb.held).toBe(Right);
    kb.handleEvent(key('keyup', '', 39));
    expect(kb.held).toBe(Up);
  });

  it('SOCD lastWins: the newer of Left/Right wins, releasing it brings the other back', () => {
    const kb = make(tuning(0, 'combine', 'lastWins'));
    kb.handleEvent(key('keydown', '', 37));
    kb.handleEvent(key('keydown', '', 39));
    expect(kb.held).toBe(Right);
    kb.handleEvent(key('keyup', '', 39));
    expect(kb.held).toBe(Left);
    kb.handleEvent(key('keydown', '', 38));
    kb.handleEvent(key('keydown', '', 40));
    expect(kb.held).toBe(Left | Down);
  });

  it('a resumed key keeps its old press order (a fake pair never makes an arrow "newer")', () => {
    const kb = make(tuning(2, 'lastWins'));
    kb.handleEvent(key('keydown', '', 39)); // Right first
    kb.handleEvent(key('keydown', '', 38)); // then Up: Up wins
    expect(kb.held).toBe(Up);
    kb.handleEvent(key('keyup', '', 39)); // the remote's fake pair on Right
    kb.advance();
    kb.handleEvent(key('keydown', '', 39));
    expect(kb.held).toBe(Up);
    // A real re-press after the window does make it the newest.
    kb.handleEvent(key('keyup', '', 39));
    kb.advance();
    kb.advance();
    kb.advance();
    kb.handleEvent(key('keydown', '', 39));
    expect(kb.held).toBe(Right);
  });

  it('a direction held by two keys takes the newer press for the policies', () => {
    const table: KeyBindings = {
      byCode: { ArrowUp: Up, KeyW: Up, ArrowRight: Right },
      byKeyCode: {},
    };
    const kb = createKeyboardSource(null, table, tuning(0, 'lastWins'));
    kb.handleEvent(key('keydown', 'ArrowUp'));
    kb.handleEvent(key('keydown', 'ArrowRight'));
    expect(kb.held).toBe(Right);
    kb.handleEvent(key('keydown', 'KeyW')); // Up pressed again through a second key
    expect(kb.held).toBe(Up);
    kb.handleEvent(key('keyup', 'KeyW')); // back to ArrowUp's older order
    expect(kb.held).toBe(Right);
  });

  it('a key releasing inside its window still takes part in the policies', () => {
    const kb = make(tuning(2, 'lastWins'));
    kb.handleEvent(key('keydown', '', 37));
    kb.handleEvent(key('keydown', '', 40));
    kb.handleEvent(key('keyup', '', 40)); // Down pending: still the newest
    kb.advance();
    expect(kb.held).toBe(Down);
    kb.advance();
    kb.advance();
    expect(kb.held).toBe(Left);
  });

  it('applies the policies on every read without changing the state', () => {
    const kb = make(tuning(0, 'lastWins', 'lastWins'));
    kb.handleEvent(key('keydown', '', 37));
    kb.handleEvent(key('keydown', '', 38));
    kb.handleEvent(key('keydown', '', 39));
    const first = kb.held;
    for (let i = 0; i < 1000; i++) expect(kb.held).toBe(first);
    expect(first).toBe(Right);
  });
});
