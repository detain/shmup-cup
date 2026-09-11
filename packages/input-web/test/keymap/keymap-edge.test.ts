/**
 * Consistency and edge cases of the default key bindings.
 */
import { ACTION_NAMES, Action } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CODE_BINDINGS,
  DEFAULT_KEYCODE_BINDINGS,
  DEFAULT_KEY_BINDINGS,
  TIZEN_KEY_CODES,
  findKeyActions,
  resolveKeyActions,
  type KeyBindings,
} from '../../src/keymap/index.js';

const ALL_ACTIONS = ACTION_NAMES.reduce((mask, name) => mask | Action[name], 0);

describe('input-web/keymap consistency', () => {
  it('freezes every default table', () => {
    expect(Object.isFrozen(TIZEN_KEY_CODES)).toBe(true);
    expect(Object.isFrozen(DEFAULT_CODE_BINDINGS)).toBe(true);
    expect(Object.isFrozen(DEFAULT_KEYCODE_BINDINGS)).toBe(true);
    expect(Object.isFrozen(DEFAULT_KEY_BINDINGS)).toBe(true);
  });

  it('binds only real, non-empty action masks', () => {
    for (const mask of [
      ...Object.values(DEFAULT_CODE_BINDINGS),
      ...Object.values(DEFAULT_KEYCODE_BINDINGS),
    ]) {
      expect(mask).toBeGreaterThan(0);
      expect(mask & ~ALL_ACTIONS).toBe(0);
    }
  });

  it('every key-code binding is a documented Samsung remote key', () => {
    const known = new Set<number>(Object.values(TIZEN_KEY_CODES));
    for (const keyCode of Object.keys(DEFAULT_KEYCODE_BINDINGS)) {
      expect(known.has(Number(keyCode)), keyCode).toBe(true);
    }
  });

  it('uses the Samsung key codes from shmup_tech.md §2.3', () => {
    expect(TIZEN_KEY_CODES).toMatchObject({
      Enter: 13,
      ArrowLeft: 37,
      ArrowUp: 38,
      ArrowRight: 39,
      ArrowDown: 40,
      Back: 10009,
      MediaPlayPause: 10252,
      ChannelUp: 427,
      ChannelDown: 428,
    });
  });

  it('lets the remote alone drive menus and play: 4 directions, Confirm, Back and Pause', () => {
    const remote = Object.values(DEFAULT_KEYCODE_BINDINGS).reduce((mask, m) => mask | m, 0);
    for (const action of [
      Action.Up,
      Action.Down,
      Action.Left,
      Action.Right,
      Action.Confirm,
      Action.Back,
      Action.Pause,
    ]) {
      expect(remote & action).toBe(action);
    }
  });

  it('gives the keyboard every action', () => {
    const keyboard = Object.values(DEFAULT_CODE_BINDINGS).reduce((mask, m) => mask | m, 0);
    expect(keyboard).toBe(ALL_ACTIONS);
  });

  it('maps the remote channel keys to the Special / Speed candidates', () => {
    expect(resolveKeyActions('', TIZEN_KEY_CODES.ChannelUp, DEFAULT_KEY_BINDINGS)).toBe(
      Action.Special,
    );
    expect(resolveKeyActions('', TIZEN_KEY_CODES.ChannelDown, DEFAULT_KEY_BINDINGS)).toBe(
      Action.Speed,
    );
  });

  it('leaves the colour keys unbound until a feature needs them', () => {
    for (const keyCode of [403, 404, 405, 406]) {
      expect(resolveKeyActions('', keyCode, DEFAULT_KEY_BINDINGS)).toBe(0);
    }
  });
});

describe('input-web/keymap resolveKeyActions edge cases', () => {
  it('falls back to keyCode when code is present but unbound (e.g. "Unidentified" on a TV)', () => {
    expect(resolveKeyActions('Unidentified', TIZEN_KEY_CODES.Back, DEFAULT_KEY_BINDINGS)).toBe(
      Action.Back,
    );
  });

  it('returns 0 for a completely unknown key', () => {
    expect(resolveKeyActions('', 0, DEFAULT_KEY_BINDINGS)).toBe(0);
    expect(resolveKeyActions('F13', 124, DEFAULT_KEY_BINDINGS)).toBe(0);
  });

  it('works with custom tables', () => {
    const custom: KeyBindings = { byCode: { KeyJ: Action.Shot }, byKeyCode: { 74: Action.Sub } };
    expect(resolveKeyActions('KeyJ', 74, custom)).toBe(Action.Shot);
    expect(resolveKeyActions('', 74, custom)).toBe(Action.Sub);
    expect(resolveKeyActions('ArrowUp', 38, custom)).toBe(0);
  });
});

describe('input-web/keymap findKeyActions (profile tables)', () => {
  const table: KeyBindings = {
    byCode: { Enter: 0, KeyX: Action.Back, KeyQ: 0 },
    byKeyCode: { 13: Action.Confirm, 88: Action.Sub, 0: Action.Pause },
  };

  it('tells unbound keys (-1) from keys bound to no action (0)', () => {
    expect(findKeyActions('KeyQ', 81, table)).toBe(0);
    expect(findKeyActions('KeyR', 82, table)).toBe(-1);
    expect(findKeyActions('', 82, table)).toBe(-1);
    expect(resolveKeyActions('KeyR', 82, table)).toBe(0);
  });

  it('an action-bearing code wins over the keyCode (one physical key never counts twice)', () => {
    expect(findKeyActions('KeyX', 88, table)).toBe(Action.Back);
  });

  // Regression (M1-05 tests): a 0 code entry is a profile placeholder for the other context;
  // it must not hide this table's keyCode binding of the same key.
  it('a code bound to no action falls through to the keyCode table', () => {
    expect(findKeyActions('Enter', 13, table)).toBe(Action.Confirm);
    expect(resolveKeyActions('Enter', 13, table)).toBe(Action.Confirm);
    expect(findKeyActions('Enter', 0, table)).toBe(Action.Pause);
  });

  it('never looks up an empty code, even in a table that lists one', () => {
    const odd: KeyBindings = { byCode: { '': Action.Shot }, byKeyCode: { 5: Action.Sub } };
    expect(findKeyActions('', 5, odd)).toBe(Action.Sub);
    expect(findKeyActions('', 6, odd)).toBe(-1);
  });
});
