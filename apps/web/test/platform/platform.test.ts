import { createInputSnapshot } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import {
  createLocalStorage,
  createVisibilityLifecycle,
  createWebPlatform,
  moduleInfo,
  type StorageLike,
  type VisibilitySource,
} from '../../src/platform/index.js';

/** Map-backed Web Storage fake. */
function fakeStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
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

describe('web/platform', () => {
  it('describes itself', () => {
    expect(moduleInfo.name).toBe('platform');
  });

  it('prefixes localStorage keys', async () => {
    const backend = fakeStorage();
    const storage = createLocalStorage(backend);
    await storage.set('options', '{"music":0.5}');
    expect(backend.data.get('shmup-cup:options')).toBe('{"music":0.5}');
    expect(await storage.get('options')).toBe('{"music":0.5}');
    expect(await storage.get('missing')).toBeNull();
  });

  it('falls back to memory when storage throws', async () => {
    const broken: StorageLike = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    const storage = createLocalStorage(broken);
    await storage.set('k', 'v');
    expect(await storage.get('k')).toBe('v');
    const none = createLocalStorage(null);
    await none.set('a', 'b');
    expect(await none.get('a')).toBe('b');
  });

  it('maps visibility changes to suspend/resume', () => {
    const doc = fakeDocument();
    const lifecycle = createVisibilityLifecycle(doc, null);
    const calls: string[] = [];
    lifecycle.onSuspend(() => calls.push('suspend'));
    lifecycle.onResume(() => calls.push('resume'));
    doc.set('hidden');
    doc.set('visible');
    expect(calls).toEqual(['suspend', 'resume']);
  });

  it('suspends on window blur and resumes on focus, de-duplicated with hidden (M3-02b)', () => {
    const doc = fakeDocument();
    const focus = new EventTarget();
    const lifecycle = createVisibilityLifecycle(doc, focus);
    const calls: string[] = [];
    lifecycle.onSuspend(() => calls.push('suspend'));
    lifecycle.onResume(() => calls.push('resume'));
    // A system overlay: `blur` alone, no `visibilitychange`.
    focus.dispatchEvent(new Event('blur'));
    expect(calls).toEqual(['suspend']);
    doc.set('hidden'); // the page hides too: still one suspend
    expect(calls).toEqual(['suspend']);
    doc.set('visible');
    expect(calls).toEqual(['suspend']); // still unfocused
    focus.dispatchEvent(new Event('focus'));
    expect(calls).toEqual(['suspend', 'resume']);
  });

  it('builds a web Platform without exit and with a live display size', () => {
    const snapshot = createInputSnapshot();
    let width = 1280;
    const platform = createWebPlatform({
      input: { poll: () => snapshot },
      audio: { unlock: () => Promise.resolve() },
      storage: null,
      visibility: fakeDocument(),
      displaySize: () => ({ width, height: 720 }),
      gamepad: true,
      webgl2: false,
    });
    expect(platform.id).toBe('web');
    expect(platform.exit).toBeNull();
    expect(platform.caps).toEqual({ gamepad: true, remoteOnly: false, webgl2: false });
    expect(platform.display.cssWidth).toBe(1280);
    width = 1920;
    expect(platform.display.cssWidth).toBe(1920);
    expect(platform.input.poll()).toBe(snapshot);
  });
});
