/**
 * Edge cases of the browser platform adapter: storage prefixes and failure modes, and
 * visibility edge cases.
 */
import { describe, expect, it } from 'vitest';
import {
  createLocalStorage,
  createVisibilityLifecycle,
  type StorageLike,
  type VisibilitySource,
} from '../../src/platform/index.js';

/** Map-backed Web Storage fake that can start failing on demand. */
function flakyStorage() {
  const data = new Map<string, string>();
  const state = { failGet: false, failSet: false, gets: 0, sets: 0 };
  const storage: StorageLike = {
    getItem: (key) => {
      state.gets++;
      if (state.failGet) throw new Error('SecurityError');
      return data.get(key) ?? null;
    },
    setItem: (key, value) => {
      state.sets++;
      if (state.failSet) throw new Error('QuotaExceededError');
      data.set(key, value);
    },
  };
  return { storage, data, state };
}

describe('web/platform createLocalStorage', () => {
  it('uses a custom key prefix', async () => {
    const { storage, data } = flakyStorage();
    const adapter = createLocalStorage(storage, 'test:');
    await adapter.set('a', '1');
    expect([...data.keys()]).toEqual(['test:a']);
  });

  it('keeps separate namespaces apart on one backend', async () => {
    const { storage } = flakyStorage();
    const a = createLocalStorage(storage, 'a:');
    const b = createLocalStorage(storage, 'b:');
    await a.set('k', 'from-a');
    await b.set('k', 'from-b');
    expect(await a.get('k')).toBe('from-a');
    expect(await b.get('k')).toBe('from-b');
  });

  it('switches to memory for good once the backend throws (no repeated exceptions)', async () => {
    const { storage, state } = flakyStorage();
    const adapter = createLocalStorage(storage);
    await adapter.set('before', 'x');
    state.failSet = true;
    await expect(adapter.set('k', 'v')).resolves.toBeUndefined();
    const setsAtFailure = state.sets;
    state.failSet = false;
    await adapter.set('k2', 'v2');
    expect(await adapter.get('k2')).toBe('v2');
    expect(state.sets).toBe(setsAtFailure);
    expect(state.gets).toBe(0);
  });

  it('never rejects: a throwing getItem resolves from memory', async () => {
    const { storage, state } = flakyStorage();
    state.failGet = true;
    const adapter = createLocalStorage(storage);
    await expect(adapter.get('x')).resolves.toBeNull();
  });

  it('stores empty strings and returns them (not null)', async () => {
    const { storage } = flakyStorage();
    const adapter = createLocalStorage(storage);
    await adapter.set('empty', '');
    expect(await adapter.get('empty')).toBe('');
  });
});

describe('web/platform createVisibilityLifecycle', () => {
  /** A document whose visibility can be flipped. */
  function doc(): VisibilitySource & { set(state: string): void } {
    const target = new EventTarget();
    let state = 'visible';
    return {
      get visibilityState() {
        return state;
      },
      addEventListener: (type, listener) => {
        target.addEventListener(type, listener);
      },
      set(next) {
        state = next;
        target.dispatchEvent(new Event('visibilitychange'));
      },
    };
  }

  it('calls callbacks in registration order, including late registrations', () => {
    const source = doc();
    const lifecycle = createVisibilityLifecycle(source, null);
    const calls: string[] = [];
    lifecycle.onSuspend(() => calls.push('s1'));
    source.set('hidden');
    lifecycle.onSuspend(() => calls.push('s2'));
    lifecycle.onResume(() => calls.push('r1'));
    source.set('visible');
    source.set('hidden');
    expect(calls).toEqual(['s1', 'r1', 's1', 's2']);
  });

  it('is edge-triggered: a repeat of the same state fires nothing (M3-02b)', () => {
    const source = doc();
    const focus = new EventTarget();
    const lifecycle = createVisibilityLifecycle(source, focus);
    const calls: string[] = [];
    lifecycle.onSuspend(() => calls.push('suspend'));
    lifecycle.onResume(() => calls.push('resume'));
    focus.dispatchEvent(new Event('blur'));
    focus.dispatchEvent(new Event('blur'));
    focus.dispatchEvent(new Event('blur'));
    expect(calls).toEqual(['suspend']);
    focus.dispatchEvent(new Event('focus'));
    focus.dispatchEvent(new Event('focus'));
    expect(calls).toEqual(['suspend', 'resume']);
    source.set('hidden');
    source.set('hidden');
    expect(calls).toEqual(['suspend', 'resume', 'suspend']);
  });

  it('ignores a focus that no blur preceded', () => {
    const source = doc();
    const focus = new EventTarget();
    const lifecycle = createVisibilityLifecycle(source, focus);
    const calls: string[] = [];
    lifecycle.onSuspend(() => calls.push('suspend'));
    lifecycle.onResume(() => calls.push('resume'));
    focus.dispatchEvent(new Event('focus'));
    expect(calls).toEqual([]);
  });

  it('starts suspended when the page is already hidden, and the first resume is the real one', () => {
    const source = doc();
    source.set('hidden'); // before anything registers
    const focus = new EventTarget();
    const lifecycle = createVisibilityLifecycle(source, focus);
    const calls: string[] = [];
    lifecycle.onSuspend(() => calls.push('suspend'));
    lifecycle.onResume(() => calls.push('resume'));
    // A blur on top of "already hidden" changes nothing: the app is away either way.
    focus.dispatchEvent(new Event('blur'));
    expect(calls).toEqual([]);
    source.set('visible');
    expect(calls).toEqual([]); // still unfocused
    focus.dispatchEvent(new Event('focus'));
    expect(calls).toEqual(['resume']);
  });

  it('resumes only when both reasons are gone, in either order', () => {
    for (const order of ['hidden-first', 'blur-first'] as const) {
      const source = doc();
      const focus = new EventTarget();
      const lifecycle = createVisibilityLifecycle(source, focus);
      const calls: string[] = [];
      lifecycle.onSuspend(() => calls.push('suspend'));
      lifecycle.onResume(() => calls.push('resume'));
      if (order === 'hidden-first') {
        source.set('hidden');
        focus.dispatchEvent(new Event('blur'));
      } else {
        focus.dispatchEvent(new Event('blur'));
        source.set('hidden');
      }
      expect(calls, order).toEqual(['suspend']);
      // Undoing one of the two is not enough, whichever it is.
      source.set('visible');
      expect(calls, order).toEqual(['suspend']);
      focus.dispatchEvent(new Event('focus'));
      expect(calls, order).toEqual(['suspend', 'resume']);
    }
  });

  it('never registers focus listeners when the host passes none', () => {
    const source = doc();
    let listeners = 0;
    const focus = {
      addEventListener: () => {
        listeners++;
      },
    };
    createVisibilityLifecycle(source, null);
    expect(listeners).toBe(0);
    createVisibilityLifecycle(source, focus);
    expect(listeners).toBe(2); // blur and focus
  });

  it('treats every non-hidden state (e.g. legacy "prerender") as visible', () => {
    const source = doc();
    const lifecycle = createVisibilityLifecycle(source, null);
    const calls: string[] = [];
    lifecycle.onSuspend(() => calls.push('suspend'));
    lifecycle.onResume(() => calls.push('resume'));
    source.set('hidden');
    source.set('prerender');
    // Edge-triggered since M3-02b: a repeat of the same state fires nothing.
    source.set('visible');
    expect(calls).toEqual(['suspend', 'resume']);
  });
});
