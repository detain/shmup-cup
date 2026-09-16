/**
 * `keyboard` rebinding capture (plan M2-16 — `KeyCapture`, the catch `WebInput.beginCapture`
 * arms): while armed, the next keydown of a key that is not already down is caught, bound or not,
 * and `preventDefault()`-ed (unless a browser shortcut modifier is held); auto-repeats, keyups,
 * a key still held and a key inside its release debounce (a TV remote's fake keyup / keydown
 * pair) do not count; the catch is one-shot and the caught key is still handled as usual.
 */
import { Action } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import * as inputWeb from '../../src/index.js';
import { KeyCapture, createKeyboardSource } from '../../src/keyboard/index.js';
import { DEFAULT_KEY_BINDINGS } from '../../src/keymap/index.js';
import { key } from '../helpers.js';

describe('input-web/keyboard rebinding capture (M2-16)', () => {
  it('is exported and starts disarmed with nothing caught', () => {
    expect(inputWeb.KeyCapture).toBe(KeyCapture);
    const capture = new KeyCapture();
    expect([capture.armed, capture.count, capture.code, capture.keyCode]).toEqual([
      false,
      0,
      '',
      0,
    ]);
    const kb = createKeyboardSource(null, DEFAULT_KEY_BINDINGS);
    expect(kb.capture).toBeInstanceOf(KeyCapture);
    expect(kb.capture.armed).toBe(false);
  });

  it('catches nothing while disarmed', () => {
    const kb = createKeyboardSource(null, DEFAULT_KEY_BINDINGS);
    const f12 = key('keydown', 'F12', 123);
    kb.handleEvent(f12);
    expect(kb.capture.count).toBe(0);
    expect(f12.prevented).toBe(false);
  });

  it('catches an unbound key once armed, prevents its default and disarms', () => {
    const kb = createKeyboardSource(null, DEFAULT_KEY_BINDINGS);
    kb.capture.armed = true;
    const j = key('keydown', 'KeyJ', 74);
    kb.handleEvent(j);
    expect([kb.capture.armed, kb.capture.count, kb.capture.code, kb.capture.keyCode]).toEqual([
      false,
      1,
      'KeyJ',
      74,
    ]);
    expect(j.prevented).toBe(true);
    // Unbound, so it adds no action.
    expect(kb.held).toBe(0);
    // One-shot: the next key is not caught.
    kb.handleEvent(key('keydown', 'KeyK', 75));
    expect([kb.capture.count, kb.capture.code]).toEqual([1, 'KeyJ']);
  });

  it('keeps browser shortcuts: a modified key is caught but not prevented', () => {
    const kb = createKeyboardSource(null, DEFAULT_KEY_BINDINGS);
    kb.capture.armed = true;
    const reload = key('keydown', 'KeyR', 82, { ctrlKey: true });
    kb.handleEvent(reload);
    expect([kb.capture.count, kb.capture.code]).toEqual([1, 'KeyR']);
    expect(reload.prevented).toBe(false);
    kb.capture.armed = true;
    const devtools = key('keydown', 'KeyI', 73, { metaKey: true });
    kb.handleEvent(devtools);
    expect([kb.capture.count, kb.capture.code]).toEqual([2, 'KeyI']);
    expect(devtools.prevented).toBe(false);
  });

  it('catches a bound key and still handles it: its action is held', () => {
    const kb = createKeyboardSource(null, DEFAULT_KEY_BINDINGS);
    kb.capture.armed = true;
    kb.handleEvent(key('keydown', 'ArrowLeft', 37));
    expect([kb.capture.count, kb.capture.code, kb.capture.keyCode]).toEqual([1, 'ArrowLeft', 37]);
    expect(kb.held).toBe(Action.Left);
    expect(kb.consumeLatched()).toBe(Action.Left);
  });

  it('ignores auto-repeats and keyups', () => {
    const kb = createKeyboardSource(null, DEFAULT_KEY_BINDINGS);
    kb.capture.armed = true;
    kb.handleEvent(key('keydown', 'KeyJ', 74, { repeat: true }));
    kb.handleEvent(key('keyup', 'KeyJ', 74));
    expect([kb.capture.armed, kb.capture.count]).toEqual([true, 0]);
  });

  it('ignores a key still held when the capture was armed (a repeat without the flag)', () => {
    const kb = createKeyboardSource(null, DEFAULT_KEY_BINDINGS);
    kb.handleEvent(key('keydown', 'Enter', 13)); // the OK that opened the prompt
    kb.capture.armed = true;
    kb.handleEvent(key('keydown', 'Enter', 13)); // a TV-style repeat: no `repeat` flag
    expect([kb.capture.armed, kb.capture.count]).toEqual([true, 0]);
    // Released and pressed again: a new press, caught.
    kb.handleEvent(key('keyup', 'Enter', 13));
    kb.handleEvent(key('keydown', 'Enter', 13));
    expect([kb.capture.count, kb.capture.code]).toEqual([1, 'Enter']);
  });

  it('ignores a key inside its release debounce (the remote’s fake keyup / keydown pair)', () => {
    const tuning = {
      releaseDebounceTicks: 2,
      diagonals: 'combine',
      socd: 'neutral',
      singleKey: false,
    } as const;
    const kb = createKeyboardSource(null, DEFAULT_KEY_BINDINGS, tuning);
    kb.handleEvent(key('keydown', '', 13)); // remote OK (no code)
    kb.advance();
    kb.capture.armed = true;
    // The remote's held-key quirk: a keyup and a keydown between two polls.
    kb.handleEvent(key('keyup', '', 13));
    kb.handleEvent(key('keydown', '', 13));
    expect([kb.capture.armed, kb.capture.count]).toEqual([true, 0]);
    // Really released: past the debounce the key is free, and its next press is caught.
    kb.handleEvent(key('keyup', '', 13));
    for (let i = 0; i < 4; i++) kb.advance();
    kb.handleEvent(key('keydown', '', 13));
    expect([kb.capture.count, kb.capture.code, kb.capture.keyCode]).toEqual([1, '', 13]);
  });

  it('catches TV remote keys by key code (no code) and counts every catch', () => {
    const kb = createKeyboardSource(null, DEFAULT_KEY_BINDINGS);
    kb.capture.armed = true;
    kb.handleEvent(key('keydown', '', 427)); // CH+
    expect([kb.capture.count, kb.capture.code, kb.capture.keyCode]).toEqual([1, '', 427]);
    kb.capture.armed = true;
    kb.handleEvent(key('keydown', '', 10009)); // Back
    expect([kb.capture.count, kb.capture.keyCode]).toEqual([2, 10009]);
  });

  it('ignores events other than keydown / keyup, and blur leaves the capture armed', () => {
    const kb = createKeyboardSource(null, DEFAULT_KEY_BINDINGS);
    kb.capture.armed = true;
    kb.handleEvent({ type: 'keypress', code: 'KeyJ', keyCode: 74 } as unknown as Event);
    kb.handleEvent({ type: 'blur' } as Event);
    expect([kb.capture.armed, kb.capture.count]).toEqual([true, 0]);
    kb.handleEvent(key('keydown', 'KeyJ', 74));
    expect(kb.capture.count).toBe(1);
  });
});
