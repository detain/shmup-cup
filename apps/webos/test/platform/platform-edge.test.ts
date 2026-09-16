/**
 * Edge cases of the LG webOS `Platform` adapter (plan M3-03) — the paths only a real set would
 * otherwise exercise, and nobody here has one.
 *
 * The Back watcher (auto-repeat, removal, other keys, a missing `keyCode`), the two-reason
 * lifecycle from every starting state and in every order, the exit chain when `platformBack` is
 * missing or throws, the storage fallbacks, and the display size read live rather than captured.
 *
 * @module
 */
import { createInputSnapshot } from '@shmup/core';
import { describe, expect, it, vi } from 'vitest';
import {
  WEBOS_BACK_KEY_CODE,
  createWebosPlatform,
  getWebosApi,
  watchBackKey,
  type FocusSource,
  type StorageLike,
  type VisibilitySource,
} from '../../src/platform/index.js';

/** A document stand-in whose visibility can be flipped. */
function fakeDocument(
  initial = 'visible',
): VisibilitySource & { set(state: string): void; listeners: number } {
  const target = new EventTarget();
  let state = initial;
  const self = {
    listeners: 0,
    get visibilityState() {
      return state;
    },
    addEventListener: (type: 'visibilitychange', listener: () => void) => {
      self.listeners++;
      target.addEventListener(type, listener);
    },
    set(next: string) {
      state = next;
      target.dispatchEvent(new Event('visibilitychange'));
    },
  };
  return self;
}

/** A window stand-in that can blur and focus. */
function fakeFocus(): FocusSource & { fire(type: 'blur' | 'focus'): void } {
  const target = new EventTarget();
  return {
    addEventListener: (type, listener) => {
      target.addEventListener(type, listener);
    },
    fire(type) {
      target.dispatchEvent(new Event(type));
    },
  };
}

/**
 * The platform's non-TV dependencies.
 *
 * @param over - Fields to override.
 * @returns The dependency bag.
 */
function deps(over: Record<string, unknown> = {}) {
  const snapshot = createInputSnapshot();
  return {
    visibility: fakeDocument(),
    focus: fakeFocus(),
    input: { poll: () => snapshot },
    audio: { unlock: () => Promise.resolve() },
    storage: null as StorageLike | null,
    displaySize: () => ({ width: 1920, height: 1080 }),
    gamepad: false,
    webgl2: false,
    ...over,
  };
}

/**
 * Dispatches a key event on a target.
 *
 * @param target - The event target.
 * @param keyCode - The legacy key code.
 * @param repeat - Auto-repeat flag.
 * @returns The dispatched event (so a test can read `defaultPrevented`).
 */
function key(target: EventTarget, keyCode: number | undefined, repeat = false): Event {
  const event = Object.assign(new Event('keydown', { cancelable: true }), { keyCode, repeat });
  target.dispatchEvent(event);
  return event;
}

describe('webos/platform — the Back watcher (M3-03)', () => {
  it('swallows auto-repeat but reports only the first press', () => {
    const target = new EventTarget();
    let backs = 0;
    const stop = watchBackKey(target, () => backs++);
    expect(key(target, WEBOS_BACK_KEY_CODE).defaultPrevented).toBe(true);
    expect(key(target, WEBOS_BACK_KEY_CODE, true).defaultPrevented).toBe(true);
    expect(key(target, WEBOS_BACK_KEY_CODE, true).defaultPrevented).toBe(true);
    expect(backs).toBe(1);
    expect(key(target, WEBOS_BACK_KEY_CODE).defaultPrevented).toBe(true);
    expect(backs).toBe(2);
    stop();
  });

  it('leaves every other key alone — including Tizen’s 10009', () => {
    const target = new EventTarget();
    let backs = 0;
    const stop = watchBackKey(target, () => backs++);
    for (const code of [10009, 13, 27, 8, 461.5, 460, 462, undefined]) {
      const event = key(target, code);
      expect(event.defaultPrevented, String(code)).toBe(false);
    }
    expect(backs).toBe(0);
    stop();
  });

  it('really removes its listener — the shell owns Back once the game runs', () => {
    const target = new EventTarget();
    let backs = 0;
    const stop = watchBackKey(target, () => backs++);
    key(target, WEBOS_BACK_KEY_CODE);
    stop();
    const after = key(target, WEBOS_BACK_KEY_CODE);
    expect(backs).toBe(1);
    expect(after.defaultPrevented).toBe(false);
    // Stopping twice is harmless (boot calls it after a rejected `bootShell` too).
    expect(() => {
      stop();
    }).not.toThrow();
  });
});

describe('webos/platform — the two-reason lifecycle (M3-03)', () => {
  it('suspends once for a blur and a hide together, and resumes only when both clear', () => {
    const d = deps();
    const platform = createWebosPlatform({ ...d, webos: null, close: null });
    const events: string[] = [];
    platform.lifecycle.onSuspend(() => events.push('suspend'));
    platform.lifecycle.onResume(() => events.push('resume'));
    d.focus.fire('blur');
    d.visibility.set('hidden');
    expect(events).toEqual(['suspend']); // one edge into "away", not two
    d.visibility.set('visible');
    expect(events).toEqual(['suspend']); // still blurred
    d.focus.fire('focus');
    expect(events).toEqual(['suspend', 'resume']);
  });

  it('is idempotent: repeated blurs, focuses and visibility events change nothing', () => {
    const d = deps();
    const platform = createWebosPlatform({ ...d, webos: null, close: null });
    const events: string[] = [];
    platform.lifecycle.onSuspend(() => events.push('suspend'));
    platform.lifecycle.onResume(() => events.push('resume'));
    d.focus.fire('blur');
    d.focus.fire('blur');
    d.visibility.set('hidden');
    d.visibility.set('hidden');
    d.visibility.set('visible');
    d.focus.fire('focus');
    d.focus.fire('focus');
    expect(events).toEqual(['suspend', 'resume']);
  });

  it('starts suspended when the app was already hidden, and resumes on the first visible', () => {
    const visibility = fakeDocument('hidden');
    const d = deps({ visibility });
    const platform = createWebosPlatform({ ...d, webos: null, close: null });
    const events: string[] = [];
    platform.lifecycle.onSuspend(() => events.push('suspend'));
    platform.lifecycle.onResume(() => events.push('resume'));
    visibility.set('visible');
    expect(events).toEqual(['resume']);
    visibility.set('hidden');
    expect(events).toEqual(['resume', 'suspend']);
  });

  it('treats any non-hidden visibility state as visible (webOS reports "prerender" too)', () => {
    const visibility = fakeDocument('prerender');
    const d = deps({ visibility });
    const platform = createWebosPlatform({ ...d, webos: null, close: null });
    const events: string[] = [];
    platform.lifecycle.onSuspend(() => events.push('suspend'));
    platform.lifecycle.onResume(() => events.push('resume'));
    visibility.set('hidden');
    expect(events).toEqual(['suspend']);
  });

  it('works with visibility only, when the host passes no focus source', () => {
    const d = deps();
    const platform = createWebosPlatform({ ...d, focus: null, webos: null, close: null });
    const events: string[] = [];
    platform.lifecycle.onSuspend(() => events.push('suspend'));
    platform.lifecycle.onResume(() => events.push('resume'));
    d.focus.fire('blur'); // nobody is listening
    expect(events).toEqual([]);
    d.visibility.set('hidden');
    expect(events).toEqual(['suspend']);
  });

  it('calls every registered callback, in registration order', () => {
    const d = deps();
    const platform = createWebosPlatform({ ...d, webos: null, close: null });
    const order: string[] = [];
    platform.lifecycle.onSuspend(() => order.push('a'));
    platform.lifecycle.onSuspend(() => order.push('b'));
    d.visibility.set('hidden');
    expect(order).toEqual(['a', 'b']);
  });
});

describe('webos/platform — exit, storage and display (M3-03)', () => {
  it('prefers platformBack, falls back to close, and is null when neither exists', () => {
    const d = deps();
    let backs = 0;
    let closes = 0;
    const withApi = createWebosPlatform({
      ...d,
      webos: { platformBack: () => backs++ },
      close: () => closes++,
    });
    withApi.exit?.();
    expect([backs, closes]).toEqual([1, 0]);
    const withClose = createWebosPlatform({ ...deps(), webos: {}, close: () => closes++ });
    withClose.exit?.();
    expect(closes).toBe(1);
    expect(createWebosPlatform({ ...deps(), webos: null, close: null }).exit).toBeNull();
    expect(createWebosPlatform({ ...deps(), webos: {} }).exit).toBeNull();
  });

  it('reads window.webOS off the window, and null without it', () => {
    const api = { platformBack: () => undefined };
    expect(getWebosApi({ webOS: api } as unknown as Window)).toBe(api);
    expect(getWebosApi({} as Window)).toBeNull();
    expect(getWebosApi({ webOS: undefined } as unknown as Window)).toBeNull();
  });

  it('reads the display size live, so a resize is seen without rebuilding the platform', () => {
    const size = { width: 1920, height: 1080 };
    const platform = createWebosPlatform({
      ...deps({ displaySize: () => size }),
      webos: null,
      close: null,
    });
    expect([platform.display.cssWidth, platform.display.cssHeight]).toEqual([1920, 1080]);
    size.width = 1280;
    size.height = 720;
    expect([platform.display.cssWidth, platform.display.cssHeight]).toEqual([1280, 720]);
  });

  it('identifies as a remote-only webOS host and reports the caps it was given', () => {
    const on = createWebosPlatform({
      ...deps({ gamepad: true, webgl2: true }),
      webos: null,
      close: null,
    });
    expect(on.id).toBe('webos');
    expect(on.caps).toEqual({ gamepad: true, remoteOnly: true, webgl2: true });
    const off = createWebosPlatform({ ...deps(), webos: null, close: null });
    // `remoteOnly` stays true even in a desktop browser: the build is for the TV.
    expect(off.caps).toEqual({ gamepad: false, remoteOnly: true, webgl2: false });
  });

  it('stores in memory without localStorage, and survives one that throws', async () => {
    const memory = createWebosPlatform({ ...deps(), webos: null, close: null }).storage;
    await memory.set('save.v1', '{"a":1}');
    expect(await memory.get('save.v1')).toBe('{"a":1}');
    expect(await memory.get('nothing')).toBeNull();

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const hostile: StorageLike = {
        getItem: () => {
          throw new Error('blocked');
        },
        setItem: () => {
          throw new Error('blocked');
        },
        removeItem: () => {
          throw new Error('blocked');
        },
        key: () => null,
        get length() {
          return 0;
        },
      };
      const store = createWebosPlatform({
        ...deps({ storage: hostile }),
        webos: null,
        close: null,
      }).storage;
      await store.set('save.v1', '{"a":1}');
      // The shell's web storage switched to memory for the session rather than throwing.
      expect(await store.get('save.v1')).toBe('{"a":1}');
    } finally {
      warn.mockRestore();
    }
  });
});
