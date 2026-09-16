import { createInputSnapshot } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import {
  REMOTE_KEYS_TO_REGISTER,
  TIZEN_BACK_KEY_CODE,
  createTizenPlatform,
  getTizenApi,
  moduleInfo,
  registerRemoteKeys,
  watchBackKey,
  type TizenApi,
  type VisibilitySource,
} from '../../src/platform/index.js';

/** Fake `window.tizen` recording calls. */
function fakeTizen(options: { batch?: boolean; unsupported?: string[] } = {}) {
  const registered: string[] = [];
  let exited = 0;
  const api: TizenApi = {
    tvinputdevice: {
      registerKey(name) {
        if (options.unsupported?.includes(name) === true) throw new Error(`unsupported ${name}`);
        registered.push(name);
      },
      ...(options.batch === true
        ? {
            registerKeyBatch(names: string[]) {
              registered.push(...names);
            },
          }
        : {}),
    },
    application: {
      getCurrentApplication: () => ({
        exit() {
          exited++;
        },
      }),
    },
  };
  return { api, registered, exits: () => exited };
}

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

const services = () => {
  const snapshot = createInputSnapshot();
  return {
    input: { poll: () => snapshot },
    audio: { unlock: () => Promise.resolve() },
    storage: null,
    displaySize: () => ({ width: 1920, height: 1080 }),
    gamepad: true,
    webgl2: false,
  };
};

describe('tizen/platform', () => {
  it('describes itself', () => {
    expect(moduleInfo.name).toBe('platform');
  });

  it('never registers Exit or volume keys', () => {
    expect(REMOTE_KEYS_TO_REGISTER).toContain('MediaPlayPause');
    expect(REMOTE_KEYS_TO_REGISTER).not.toContain('Exit');
    for (const key of REMOTE_KEYS_TO_REGISTER) expect(key).not.toMatch(/^Volume/);
  });

  it('registers keys with registerKeyBatch when available', () => {
    const tizen = fakeTizen({ batch: true });
    expect(registerRemoteKeys(tizen.api, ['ChannelUp', 'ChannelDown'])).toEqual([
      'ChannelUp',
      'ChannelDown',
    ]);
    expect(tizen.registered).toEqual(['ChannelUp', 'ChannelDown']);
  });

  it('falls back to registerKey and skips unsupported keys', () => {
    const tizen = fakeTizen({ unsupported: ['ColorF3Blue'] });
    expect(registerRemoteKeys(tizen.api, ['MediaPlayPause', 'ColorF3Blue'])).toEqual([
      'MediaPlayPause',
    ]);
  });

  it('builds a remote-only Tizen platform whose exit() quits the app', () => {
    const tizen = fakeTizen({ batch: true });
    const platform = createTizenPlatform({
      ...services(),
      tizen: tizen.api,
      visibility: fakeDocument(),
    });
    expect(platform.id).toBe('tizen');
    expect(platform.caps.remoteOnly).toBe(true);
    expect(tizen.registered).toEqual([...REMOTE_KEYS_TO_REGISTER]);
    expect(platform.exit).not.toBeNull();
    platform.exit?.();
    expect(tizen.exits()).toBe(1);
  });

  it("registers the active input profile's keys instead of the fallback list", () => {
    const tizen = fakeTizen({ batch: true });
    createTizenPlatform({
      ...services(),
      tizen: tizen.api,
      visibility: fakeDocument(),
      registerKeys: ['MediaPlayPause', 'ChannelUp', 'ChannelDown'],
    });
    expect(tizen.registered).toEqual(['MediaPlayPause', 'ChannelUp', 'ChannelDown']);
    const none = fakeTizen({ batch: true });
    createTizenPlatform({
      ...services(),
      tizen: none.api,
      visibility: fakeDocument(),
      registerKeys: [],
    });
    expect(none.registered).toEqual([]);
  });

  it('never registers system keys, whatever the list says', () => {
    for (const batch of [true, false]) {
      const tizen = fakeTizen({ batch });
      expect(
        registerRemoteKeys(tizen.api, ['Exit', 'MediaPlayPause', 'VolumeUp', 'VolumeMute']),
      ).toEqual(['MediaPlayPause']);
      expect(tizen.registered).toEqual(['MediaPlayPause']);
    }
    expect(registerRemoteKeys(fakeTizen().api, ['VolumeDown'])).toEqual([]);
  });

  it('has no exit and registers nothing in a desktop browser', () => {
    const platform = createTizenPlatform({
      ...services(),
      tizen: null,
      visibility: fakeDocument(),
    });
    expect(platform.exit).toBeNull();
  });

  it('maps visibilitychange to suspend/resume', () => {
    const doc = fakeDocument();
    const platform = createTizenPlatform({ ...services(), tizen: null, visibility: doc });
    const calls: string[] = [];
    platform.lifecycle.onSuspend(() => calls.push('suspend'));
    platform.lifecycle.onResume(() => calls.push('resume'));
    doc.set('hidden');
    doc.set('visible');
    expect(calls).toEqual(['suspend', 'resume']);
  });

  it('suspends on window blur and resumes on focus (Home is only an overlay — M3-02b)', () => {
    const doc = fakeDocument();
    const focus = new EventTarget();
    const platform = createTizenPlatform({
      ...services(),
      tizen: null,
      visibility: doc,
      focus,
    });
    const calls: string[] = [];
    platform.lifecycle.onSuspend(() => calls.push('suspend'));
    platform.lifecycle.onResume(() => calls.push('resume'));
    // Home on the M7: `blur` alone, no `visibilitychange` at all.
    focus.dispatchEvent(new Event('blur'));
    expect(calls).toEqual(['suspend']);
    focus.dispatchEvent(new Event('focus'));
    expect(calls).toEqual(['suspend', 'resume']);
  });

  it('suspends once for a blur + hidden pair and resumes only when both are back', () => {
    const doc = fakeDocument();
    const focus = new EventTarget();
    const platform = createTizenPlatform({
      ...services(),
      tizen: null,
      visibility: doc,
      focus,
    });
    const calls: string[] = [];
    platform.lifecycle.onSuspend(() => calls.push('suspend'));
    platform.lifecycle.onResume(() => calls.push('resume'));
    focus.dispatchEvent(new Event('blur'));
    doc.set('hidden');
    expect(calls).toEqual(['suspend']);
    // Visible again but still unfocused: nothing resumes yet.
    doc.set('visible');
    expect(calls).toEqual(['suspend']);
    focus.dispatchEvent(new Event('focus'));
    expect(calls).toEqual(['suspend', 'resume']);
    // Repeats of the same state fire nothing.
    focus.dispatchEvent(new Event('focus'));
    doc.set('visible');
    expect(calls).toEqual(['suspend', 'resume']);
  });

  it('starts suspended when the app is already hidden', () => {
    const doc = fakeDocument();
    doc.set('hidden');
    const platform = createTizenPlatform({ ...services(), tizen: null, visibility: doc });
    const calls: string[] = [];
    platform.lifecycle.onSuspend(() => calls.push('suspend'));
    platform.lifecycle.onResume(() => calls.push('resume'));
    doc.set('visible');
    expect(calls).toEqual(['resume']);
  });

  it('reports Back (10009) presses and ignores repeats', () => {
    const target = new EventTarget();
    let backs = 0;
    const stop = watchBackKey(target, () => backs++);
    const press = (repeat: boolean) =>
      Object.assign(new Event('keydown', { cancelable: true }), {
        keyCode: TIZEN_BACK_KEY_CODE,
        repeat,
      });
    const first = press(false);
    target.dispatchEvent(first);
    target.dispatchEvent(press(true));
    target.dispatchEvent(Object.assign(new Event('keydown'), { keyCode: 13, repeat: false }));
    expect(backs).toBe(1);
    expect(first.defaultPrevented).toBe(true);
    stop();
    target.dispatchEvent(press(false));
    expect(backs).toBe(1);
  });

  it('reads window.tizen when present', () => {
    const tizen = fakeTizen();
    expect(getTizenApi({ tizen: tizen.api } as unknown as Window)).toBe(tizen.api);
    expect(getTizenApi({} as Window)).toBeNull();
  });
});
