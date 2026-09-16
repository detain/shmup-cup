import { Action } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { MAX_TRACKED_KEYS, createKeyboardSource, moduleInfo } from '../../src/keyboard/index.js';
import { DEFAULT_KEY_BINDINGS } from '../../src/keymap/index.js';
import { key } from '../helpers.js';

describe('input-web/keyboard', () => {
  it('describes itself', () => {
    expect(moduleInfo.name).toBe('keyboard');
  });

  it('tracks held keys from keydown/keyup and ignores auto-repeat', () => {
    const kb = createKeyboardSource(null, DEFAULT_KEY_BINDINGS);
    kb.handleEvent(key('keydown', 'ArrowRight'));
    kb.handleEvent(key('keydown', 'ArrowRight', 39, { repeat: true }));
    expect(kb.held).toBe(Action.Right);
    kb.handleEvent(key('keyup', 'ArrowRight'));
    expect(kb.held).toBe(0);
  });

  it('keeps an action held while another key bound to it is still down', () => {
    const kb = createKeyboardSource(null, DEFAULT_KEY_BINDINGS);
    kb.handleEvent(key('keydown', 'ArrowUp'));
    kb.handleEvent(key('keydown', 'KeyW'));
    kb.handleEvent(key('keyup', 'ArrowUp'));
    expect(kb.held).toBe(Action.Up);
    kb.handleEvent(key('keyup', 'KeyW'));
    expect(kb.held).toBe(0);
  });

  it('latches taps that start and end between two polls', () => {
    const kb = createKeyboardSource(null, DEFAULT_KEY_BINDINGS);
    kb.handleEvent(key('keydown', '', 10009));
    kb.handleEvent(key('keyup', '', 10009));
    expect(kb.held).toBe(0);
    expect(kb.consumeLatched()).toBe(Action.Back);
    expect(kb.consumeLatched()).toBe(0);
  });

  it('prevents default for bound keys unless a browser shortcut modifier is held', () => {
    const kb = createKeyboardSource(null, DEFAULT_KEY_BINDINGS);
    const arrow = key('keydown', 'ArrowDown');
    kb.handleEvent(arrow);
    expect(arrow.prevented).toBe(true);
    const reload = key('keydown', 'KeyP', 80, { ctrlKey: true });
    kb.handleEvent(reload);
    expect(reload.prevented).toBe(false);
    const unbound = key('keydown', 'F12', 123);
    kb.handleEvent(unbound);
    expect(unbound.prevented).toBe(false);
  });

  it('clears everything on blur and listens on a real EventTarget', () => {
    const target = new EventTarget();
    const kb = createKeyboardSource(target, DEFAULT_KEY_BINDINGS);
    const down = Object.assign(new Event('keydown', { cancelable: true }), {
      code: 'Space',
      keyCode: 32,
      repeat: false,
    });
    target.dispatchEvent(down);
    expect(kb.held).toBe(Action.Shot | Action.Confirm);
    expect(down.defaultPrevented).toBe(true);
    target.dispatchEvent(new Event('blur'));
    expect(kb.held).toBe(0);
    kb.detach();
    target.dispatchEvent(
      Object.assign(new Event('keydown'), { code: 'Space', keyCode: 32, repeat: false }),
    );
    expect(kb.held).toBe(0);
  });
});

describe('input-web/keyboard table swaps and tuning', () => {
  const game = {
    byCode: { KeyX: Action.Sub, KeyZ: Action.Shot, ArrowUp: Action.Up },
    byKeyCode: {},
  };
  const menu = { byCode: { KeyX: Action.Back, ArrowUp: Action.Up }, byKeyCode: {} };

  it('a held key keeps only the actions both tables give it, until released', () => {
    const kb = createKeyboardSource(null, game);
    kb.handleEvent(key('keydown', 'KeyX'));
    kb.handleEvent(key('keydown', 'ArrowUp'));
    kb.consumeLatched();
    kb.setBindings(menu);
    expect(kb.bindings).toBe(menu);
    expect(kb.held).toBe(Action.Up);
    kb.handleEvent(key('keyup', 'KeyX'));
    kb.handleEvent(key('keydown', 'KeyX'));
    expect(kb.held).toBe(Action.Up | Action.Back);
    expect(kb.consumeLatched()).toBe(Action.Back);
  });

  it('frees a held key the new table does not know when it is released', () => {
    const kb = createKeyboardSource(null, game);
    kb.handleEvent(key('keydown', 'KeyZ'));
    kb.setBindings(menu); // KeyZ unknown in menus
    const up = key('keyup', 'KeyZ');
    kb.handleEvent(up);
    expect(up.prevented).toBe(true); // still tracked: its keyup is ours
    kb.setBindings(game);
    kb.consumeLatched();
    kb.handleEvent(key('keydown', 'KeyZ'));
    expect(kb.held).toBe(Action.Shot); // a fresh press, not a stuck slot
    expect(kb.consumeLatched()).toBe(Action.Shot);
  });

  it('setTuning applies the debounce on the next advance() and the direction policies at once', () => {
    const kb = createKeyboardSource(null, DEFAULT_KEY_BINDINGS);
    kb.setTuning({
      releaseDebounceTicks: 1,
      diagonals: 'lastWins',
      socd: 'neutral',
      singleKey: false,
    });
    expect(kb.tuning.diagonals).toBe('lastWins');
    kb.handleEvent(key('keydown', 'ArrowRight'));
    kb.handleEvent(key('keydown', 'ArrowUp'));
    expect(kb.held).toBe(Action.Up);
    kb.handleEvent(key('keyup', 'ArrowUp'));
    expect(kb.held).toBe(Action.Up); // pending release
    kb.advance();
    expect(kb.held).toBe(Action.Up);
    kb.advance();
    expect(kb.held).toBe(Action.Right);
  });

  it('ignores keydowns beyond MAX_TRACKED_KEYS until a slot frees up', () => {
    const codes: Record<string, number> = {};
    for (let i = 0; i <= MAX_TRACKED_KEYS; i++) codes[`Key${i}`] = Action.Shot;
    codes['KeyUp'] = Action.Up;
    const kb = createKeyboardSource(null, { byCode: codes, byKeyCode: {} });
    for (let i = 0; i < MAX_TRACKED_KEYS; i++) kb.handleEvent(key('keydown', `Key${i}`));
    kb.handleEvent(key('keydown', 'KeyUp'));
    expect(kb.held).toBe(Action.Shot);
    kb.handleEvent(key('keyup', 'Key0'));
    kb.handleEvent(key('keyup', 'KeyUp'));
    kb.handleEvent(key('keydown', 'KeyUp'));
    expect(kb.held).toBe(Action.Shot | Action.Up);
  });
});
