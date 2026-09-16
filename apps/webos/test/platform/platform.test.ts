/**
 * The LG webOS `Platform` adapter (plan M3-03): Back = 461, the two-reason lifecycle, exit through
 * `webOS.platformBack()` with a `window.close()` fallback, and the capabilities the core reads.
 *
 * Every check runs against fakes — there is no LG hardware in this project (see the app README).
 *
 * @module
 */
import { createInputSnapshot } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import {
  WEBOS_BACK_KEY_CODE,
  createWebosPlatform,
  getWebosApi,
  moduleInfo,
  watchBackKey,
  type FocusSource,
  type VisibilitySource,
  type WebosApi,
} from '../../src/platform/index.js';

/** A document stand-in whose visibility can be flipped. */
function fakeDocument(): VisibilitySource & { set(state: string): void } {
  const target = new EventTarget();
  let state = 'visible';
  return {
    get visibilityState() {
      return state;
    },
    addEventListener: (type, listener) => {
      target.addEventListener(type, listener);
    },
    set(next: string) {
      state = next;
      target.dispatchEvent(new Event('visibilitychange'));
    },
  };
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

/** The platform's non-TV dependencies, with a fresh fake document and focus source. */
function deps() {
  const visibility = fakeDocument();
  const focus = fakeFocus();
  const snapshot = createInputSnapshot();
  return {
    visibility,
    focus,
    input: { poll: () => snapshot },
    audio: { unlock: () => Promise.resolve() },
    storage: null,
    displaySize: () => ({ width: 1920, height: 1080 }),
    gamepad: false,
    webgl2: false,
  };
}

describe('webos/platform (M3-03)', () => {
  it('is an implemented module naming the webOS spec section', () => {
    expect(moduleInfo.name).toBe('platform');
    expect(moduleInfo.status).toBe('implemented');
    expect(moduleInfo.specRefs).toContain('shmup_tech.md §3.3');
  });

  it('watches key code 461 — not Tizen’s 10009 — and ignores auto-repeat', () => {
    expect(WEBOS_BACK_KEY_CODE).toBe(461);
    const target = new EventTarget();
    let backs = 0;
    const stop = watchBackKey(target, () => {
      backs++;
    });
    const press = (keyCode: number, repeat = false): boolean =>
      target.dispatchEvent(
        Object.assign(new Event('keydown', { cancelable: true }), { keyCode, repeat }),
      );
    expect(press(10009)).toBe(true); // Tizen's Back is not ours: not even prevented.
    expect(backs).toBe(0);
    expect(press(461)).toBe(false); // prevented
    expect(backs).toBe(1);
    expect(press(461, true)).toBe(false); // repeat: prevented, not reported
    expect(backs).toBe(1);
    stop();
    press(461);
    expect(backs).toBe(1);
  });

  it('reads window.webOS, and reports null without it', () => {
    const api: WebosApi = { platformBack: () => undefined };
    expect(getWebosApi({ webOS: api } as unknown as Window)).toBe(api);
    expect(getWebosApi({} as unknown as Window)).toBeNull();
  });

  it('identifies as the remote-only webos host and reports the display size live', () => {
    let width = 1920;
    const platform = createWebosPlatform({
      ...deps(),
      webos: null,
      displaySize: () => ({ width, height: 1080 }),
    });
    expect(platform.id).toBe('webos');
    expect(platform.caps).toEqual({ gamepad: false, remoteOnly: true, webgl2: false });
    expect(platform.display.cssWidth).toBe(1920);
    width = 1280;
    expect(platform.display.cssWidth).toBe(1280);
  });

  it('exits through webOS.platformBack, falls back to close, and is null without either', () => {
    let backs = 0;
    let closes = 0;
    const withApi = createWebosPlatform({
      ...deps(),
      webos: {
        platformBack: () => {
          backs++;
        },
      },
      close: () => {
        closes++;
      },
    });
    withApi.exit?.();
    expect([backs, closes]).toEqual([1, 0]);

    const browser = createWebosPlatform({
      ...deps(),
      webos: null,
      close: () => {
        closes++;
      },
    });
    browser.exit?.();
    expect(closes).toBe(1);

    expect(createWebosPlatform({ ...deps(), webos: null, close: null }).exit).toBeNull();
  });

  it('suspends once for hidden ∨ blurred and resumes only when visible and focused', () => {
    const d = deps();
    const platform = createWebosPlatform({ ...d, webos: null });
    const log: string[] = [];
    platform.lifecycle.onSuspend(() => log.push('suspend'));
    platform.lifecycle.onResume(() => log.push('resume'));

    d.focus.fire('blur');
    expect(log).toEqual(['suspend']);
    d.visibility.set('hidden'); // already away: no second suspend
    expect(log).toEqual(['suspend']);
    d.focus.fire('focus'); // still hidden: no resume
    expect(log).toEqual(['suspend']);
    d.visibility.set('visible');
    expect(log).toEqual(['suspend', 'resume']);
  });

  it('starts suspended when the app is hidden before the platform exists', () => {
    const d = deps();
    d.visibility.set('hidden');
    const platform = createWebosPlatform({ ...d, webos: null });
    const log: string[] = [];
    platform.lifecycle.onSuspend(() => log.push('suspend'));
    platform.lifecycle.onResume(() => log.push('resume'));
    d.visibility.set('visible');
    expect(log).toEqual(['resume']);
  });

  it('stores through the shell’s web storage, in memory when there is none', async () => {
    const platform = createWebosPlatform({ ...deps(), webos: null, storage: null });
    await platform.storage.set('save.v1', '{"v":1}');
    await expect(platform.storage.get('save.v1')).resolves.toBe('{"v":1}');
    await expect(platform.storage.get('nothing')).resolves.toBeNull();
  });
});
