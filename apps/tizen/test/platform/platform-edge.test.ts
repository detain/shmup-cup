/**
 * Edge cases of the Tizen platform adapter: key registration failure modes (including the
 * asynchronous registerKeyBatch error path), storage fallbacks, display and caps.
 */
import { createInputSnapshot } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import {
  REMOTE_KEYS_TO_REGISTER,
  TIZEN_BACK_KEY_CODE,
  createTizenPlatform,
  registerRemoteKeys,
  watchBackKey,
  type StorageLike,
  type TizenApi,
  type VisibilitySource,
} from '../../src/platform/index.js';

/** A visibility source that never changes. */
const staticDocument: VisibilitySource = {
  visibilityState: 'visible',
  addEventListener: () => {},
};

/**
 * Common platform options.
 *
 * @param overrides - Fields to replace.
 */
function options(overrides: Partial<Parameters<typeof createTizenPlatform>[0]> = {}) {
  const snapshot = createInputSnapshot();
  return {
    tizen: null,
    input: { poll: () => snapshot },
    audio: { unlock: () => Promise.resolve() },
    storage: null,
    visibility: staticDocument,
    displaySize: () => ({ width: 1920, height: 1080 }),
    gamepad: false,
    webgl2: false,
    ...overrides,
  };
}

describe('tizen/platform registerRemoteKeys failure modes', () => {
  it('returns [] when tvinputdevice is missing (privilege not granted / desktop shim)', () => {
    expect(registerRemoteKeys({}, ['MediaPlayPause'])).toEqual([]);
  });

  it('falls back to one registerKey per key when registerKeyBatch throws synchronously', () => {
    const registered: string[] = [];
    const tizen: TizenApi = {
      tvinputdevice: {
        registerKeyBatch() {
          throw new Error('TypeMismatchError');
        },
        registerKey(name) {
          if (name === 'ColorF0Red') throw new Error('InvalidValuesError');
          registered.push(name);
        },
      },
    };
    expect(registerRemoteKeys(tizen, ['MediaPlayPause', 'ColorF0Red', 'ChannelUp'])).toEqual([
      'MediaPlayPause',
      'ChannelUp',
    ]);
    expect(registered).toEqual(['MediaPlayPause', 'ChannelUp']);
  });

  // Regression: registerKeyBatch reports an unsupported key through its asynchronous
  // error callback (it does not throw). Previously no error callback was passed, so one
  // unsupported key (e.g. colour keys on a Smart Monitor remote) silently left every
  // other key — Play/Pause included — unregistered.
  it('retries key by key when registerKeyBatch fails asynchronously via its error callback', () => {
    const registered: string[] = [];
    let failBatch: ((error: unknown) => void) | undefined;
    const tizen: TizenApi = {
      tvinputdevice: {
        registerKeyBatch(_names, _onSuccess, onError) {
          failBatch = onError;
        },
        registerKey(name) {
          if (name.startsWith('Color')) throw new Error('InvalidValuesError');
          registered.push(name);
        },
      },
    };
    registerRemoteKeys(tizen, REMOTE_KEYS_TO_REGISTER);
    expect(typeof failBatch).toBe('function');
    expect(registered).toEqual([]);

    failBatch?.({ name: 'InvalidValuesError' });
    expect(registered).toEqual(['MediaPlayPause', 'ChannelUp', 'ChannelDown']);
  });

  it('does not register anything again when the batch succeeds', () => {
    let single = 0;
    const tizen: TizenApi = {
      tvinputdevice: {
        registerKeyBatch(_names, onSuccess) {
          onSuccess?.();
        },
        registerKey() {
          single++;
        },
      },
    };
    expect(registerRemoteKeys(tizen, ['MediaPlayPause'])).toEqual(['MediaPlayPause']);
    expect(single).toBe(0);
  });

  it('passes a mutable copy of the (frozen) key list to the batch call', () => {
    let received: string[] | null = null;
    const tizen: TizenApi = {
      tvinputdevice: {
        registerKeyBatch(names) {
          received = names;
          names.push('mutated-by-device');
        },
        registerKey() {},
      },
    };
    const result = registerRemoteKeys(tizen, REMOTE_KEYS_TO_REGISTER);
    expect(received).not.toBe(REMOTE_KEYS_TO_REGISTER);
    expect(Object.isFrozen(REMOTE_KEYS_TO_REGISTER)).toBe(true);
    expect(REMOTE_KEYS_TO_REGISTER).not.toContain('mutated-by-device');
    expect(result).toEqual([...REMOTE_KEYS_TO_REGISTER]);
  });

  it('only registers keys that do not arrive by default (arrows, OK and Back never need it)', () => {
    for (const name of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Back']) {
      expect(REMOTE_KEYS_TO_REGISTER).not.toContain(name);
    }
    expect(new Set(REMOTE_KEYS_TO_REGISTER).size).toBe(REMOTE_KEYS_TO_REGISTER.length);
  });
});

describe('tizen/platform watchBackKey', () => {
  it('leaves other keys alone (no preventDefault) and supports several watchers', () => {
    const target = new EventTarget();
    const calls: string[] = [];
    const stopA = watchBackKey(target, () => calls.push('a'));
    const stopB = watchBackKey(target, () => calls.push('b'));
    const enter = Object.assign(new Event('keydown', { cancelable: true }), {
      keyCode: 13,
      repeat: false,
    });
    target.dispatchEvent(enter);
    expect(enter.defaultPrevented).toBe(false);
    target.dispatchEvent(
      Object.assign(new Event('keydown', { cancelable: true }), {
        keyCode: TIZEN_BACK_KEY_CODE,
        repeat: false,
      }),
    );
    expect(calls).toEqual(['a', 'b']);
    stopA();
    stopB();
  });

  it('ignores Back keyup events', () => {
    const target = new EventTarget();
    let backs = 0;
    watchBackKey(target, () => backs++);
    target.dispatchEvent(
      Object.assign(new Event('keyup'), { keyCode: TIZEN_BACK_KEY_CODE, repeat: false }),
    );
    expect(backs).toBe(0);
  });
});

describe('tizen/platform createTizenPlatform services', () => {
  it('prefixes localStorage keys with shmup-cup:', async () => {
    const data = new Map<string, string>();
    const storage: StorageLike = {
      getItem: (key) => data.get(key) ?? null,
      setItem: (key, value) => {
        data.set(key, value);
      },
    };
    const platform = createTizenPlatform(options({ storage }));
    await platform.storage.set('hiscores', '[1,2,3]');
    expect(data.get('shmup-cup:hiscores')).toBe('[1,2,3]');
    expect(await platform.storage.get('hiscores')).toBe('[1,2,3]');
    expect(await platform.storage.get('missing')).toBeNull();
  });

  it('degrades to memory storage when localStorage throws (quota, disabled) and stays there', async () => {
    let getCalls = 0;
    const storage: StorageLike = {
      getItem: () => {
        getCalls++;
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    const platform = createTizenPlatform(options({ storage }));
    expect(await platform.storage.get('a')).toBeNull();
    await platform.storage.set('a', '1');
    expect(await platform.storage.get('a')).toBe('1');
    expect(getCalls).toBe(1);
  });

  it('works with no storage at all', async () => {
    const platform = createTizenPlatform(options());
    await platform.storage.set('k', 'v');
    expect(await platform.storage.get('k')).toBe('v');
  });

  it('reports a live display size and the capability flags', () => {
    let size = { width: 1920, height: 1080 };
    const platform = createTizenPlatform(
      options({ displaySize: () => size, gamepad: true, webgl2: true }),
    );
    expect([platform.display.cssWidth, platform.display.cssHeight]).toEqual([1920, 1080]);
    size = { width: 1280, height: 720 };
    expect([platform.display.cssWidth, platform.display.cssHeight]).toEqual([1280, 720]);
    expect(platform.caps).toEqual({ gamepad: true, remoteOnly: true, webgl2: true });
  });

  it('has no exit when the Tizen API lacks the application module', () => {
    const platform = createTizenPlatform(
      options({ tizen: { tvinputdevice: { registerKey() {} } } }),
    );
    expect(platform.exit).toBeNull();
  });

  it('resolves the current application lazily at exit time', () => {
    let lookups = 0;
    let exits = 0;
    const platform = createTizenPlatform(
      options({
        tizen: {
          application: {
            getCurrentApplication: () => {
              lookups++;
              return {
                exit: () => {
                  exits++;
                },
              };
            },
          },
        },
      }),
    );
    expect(lookups).toBe(0);
    platform.exit?.();
    expect([lookups, exits]).toEqual([1, 1]);
  });

  it('fires every suspend callback on hidden and every resume callback on visible', () => {
    const target = new EventTarget();
    let state = 'visible';
    const visibility: VisibilitySource = {
      get visibilityState() {
        return state;
      },
      addEventListener: (type, listener) => {
        target.addEventListener(type, listener);
      },
    };
    const platform = createTizenPlatform(options({ visibility }));
    const calls: string[] = [];
    platform.lifecycle.onSuspend(() => calls.push('s1'));
    platform.lifecycle.onSuspend(() => calls.push('s2'));
    platform.lifecycle.onResume(() => calls.push('r1'));
    state = 'hidden';
    target.dispatchEvent(new Event('visibilitychange'));
    state = 'visible';
    target.dispatchEvent(new Event('visibilitychange'));
    expect(calls).toEqual(['s1', 's2', 'r1']);
  });
});
