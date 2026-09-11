/**
 * Edge cases of the keyboard / TV-remote source: stray keyups, Tizen's key repeat without
 * the `repeat` flag, multi-action keys, latching, modifiers and listener handling.
 */
import { Action } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { createKeyboardSource } from '../../src/keyboard/index.js';
import { DEFAULT_KEY_BINDINGS } from '../../src/keymap/index.js';
import { key } from '../helpers.js';

const make = () => createKeyboardSource(null, DEFAULT_KEY_BINDINGS);

describe('input-web/keyboard edge cases', () => {
  it('ignores a keyup without a matching keydown (no negative counts, nothing sticks)', () => {
    const kb = make();
    kb.handleEvent(key('keyup', 'ArrowUp'));
    kb.handleEvent(key('keydown', 'ArrowUp'));
    expect(kb.held).toBe(Action.Up);
    kb.handleEvent(key('keyup', 'ArrowUp'));
    expect(kb.held).toBe(0);
  });

  it('ignores a second keydown of a key that is already down even without repeat=true', () => {
    // Some TV remotes repeat keydown without setting `repeat`.
    const kb = make();
    kb.handleEvent(key('keydown', '', 39));
    kb.consumeLatched();
    kb.handleEvent(key('keydown', '', 39));
    kb.handleEvent(key('keydown', '', 39));
    expect(kb.consumeLatched()).toBe(0);
    kb.handleEvent(key('keyup', '', 39));
    expect(kb.held).toBe(0);
  });

  it('releases every action of a multi-action key together', () => {
    const kb = make();
    kb.handleEvent(key('keydown', 'Escape'));
    expect(kb.held).toBe(Action.Back | Action.Pause);
    kb.handleEvent(key('keydown', 'KeyP'));
    kb.handleEvent(key('keyup', 'Escape'));
    expect(kb.held).toBe(Action.Pause);
  });

  it('tracks overlapping bits of different keys independently', () => {
    const kb = make();
    kb.handleEvent(key('keydown', 'Enter')); // Confirm | PowerUp
    kb.handleEvent(key('keydown', 'KeyZ')); // Shot | Confirm
    kb.handleEvent(key('keyup', 'Enter'));
    expect(kb.held).toBe(Action.Shot | Action.Confirm);
    kb.handleEvent(key('keyup', 'KeyZ'));
    expect(kb.held).toBe(0);
  });

  it('accumulates several taps into one latch and keeps a held key latched only once', () => {
    const kb = make();
    kb.handleEvent(key('keydown', 'ArrowLeft'));
    kb.handleEvent(key('keyup', 'ArrowLeft'));
    kb.handleEvent(key('keydown', 'KeyX'));
    expect(kb.consumeLatched()).toBe(Action.Left | Action.Sub | Action.Back);
    expect(kb.consumeLatched()).toBe(0);
    expect(kb.held).toBe(Action.Sub | Action.Back);
  });

  it('identifies remote keys by keyCode when code is empty', () => {
    const kb = make();
    kb.handleEvent(key('keydown', '', 10252));
    expect(kb.held).toBe(Action.Pause);
    kb.handleEvent(key('keyup', '', 10252));
    expect(kb.held).toBe(0);
  });

  it('does not latch or prevent unbound keys', () => {
    const kb = make();
    const event = key('keydown', 'KeyQ', 81);
    kb.handleEvent(event);
    expect(kb.consumeLatched()).toBe(0);
    expect(event.prevented).toBe(false);
  });

  it('prevents the default on keyup of bound keys too, but not with Cmd held', () => {
    const kb = make();
    kb.handleEvent(key('keydown', 'Space'));
    const up = key('keyup', 'Space');
    kb.handleEvent(up);
    expect(up.prevented).toBe(true);
    const cmd = key('keydown', 'ArrowUp', 38, { metaKey: true });
    kb.handleEvent(cmd);
    expect(cmd.prevented).toBe(false);
    expect(kb.held).toBe(Action.Up); // still counts as input
  });

  it('prevents Tizen Back (10009) so the TV does not navigate away', () => {
    const kb = make();
    const back = key('keydown', '', 10009);
    kb.handleEvent(back);
    expect(back.prevented).toBe(true);
  });

  it('clear() forgets held keys; their late keyup is then ignored', () => {
    const kb = make();
    kb.handleEvent(key('keydown', 'ArrowDown'));
    kb.clear();
    expect(kb.held).toBe(0);
    kb.handleEvent(key('keyup', 'ArrowDown'));
    kb.handleEvent(key('keydown', 'ArrowDown'));
    expect(kb.held).toBe(Action.Down);
  });

  it('ignores events of other types', () => {
    const kb = make();
    kb.handleEvent({ ...key('keydown', 'ArrowUp'), type: 'keypress' });
    expect(kb.held).toBe(0);
    expect(kb.consumeLatched()).toBe(0);
  });

  it('listens in the capture phase and detach() removes every listener', () => {
    const target = new EventTarget();
    const added: Array<[string, unknown]> = [];
    const removed: Array<[string, unknown]> = [];
    const spyTarget = {
      addEventListener: (type: string, _fn: unknown, options?: unknown) => {
        added.push([type, options]);
        target.addEventListener(type, _fn as EventListener, options as AddEventListenerOptions);
      },
      removeEventListener: (type: string, _fn: unknown, options?: unknown) => {
        removed.push([type, options]);
        target.removeEventListener(type, _fn as EventListener, options as EventListenerOptions);
      },
      dispatchEvent: (event: Event) => target.dispatchEvent(event),
    } as EventTarget;
    const kb = createKeyboardSource(spyTarget, DEFAULT_KEY_BINDINGS);
    expect(added).toEqual([
      ['keydown', { capture: true }],
      ['keyup', { capture: true }],
      ['blur', undefined],
    ]);
    kb.detach();
    expect(removed).toEqual(added);
    kb.detach(); // idempotent
  });

  it('detach() on a manually fed source is a no-op', () => {
    const kb = make();
    expect(() => {
      kb.detach();
    }).not.toThrow();
  });
});
