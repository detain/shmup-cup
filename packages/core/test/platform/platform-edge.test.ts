/**
 * Edge cases of the in-memory storage and the headless platform.
 */
import { describe, expect, it } from 'vitest';
import { createHeadlessPlatform, createMemoryStorage } from '../../src/platform/index.js';

describe('core/platform createMemoryStorage', () => {
  it('skips undefined values in the initial record', async () => {
    const initial: Record<string, string> = { a: '1' };
    Object.defineProperty(initial, 'b', { value: undefined, enumerable: true });
    const storage = createMemoryStorage(initial);
    expect(await storage.get('a')).toBe('1');
    expect(await storage.get('b')).toBeNull();
  });

  it('copies the initial record (later changes to it are not visible)', async () => {
    const initial: Record<string, string> = { a: '1' };
    const storage = createMemoryStorage(initial);
    initial.a = 'changed';
    expect(await storage.get('a')).toBe('1');
  });

  it('keeps instances independent, overwrites values and stores empty strings', async () => {
    const one = createMemoryStorage();
    const two = createMemoryStorage();
    await one.set('k', 'first');
    await one.set('k', 'second');
    await one.set('empty', '');
    expect(await one.get('k')).toBe('second');
    expect(await one.get('empty')).toBe('');
    expect(await two.get('k')).toBeNull();
  });

  it('treats keys literally (no prototype lookups)', async () => {
    const storage = createMemoryStorage();
    expect(await storage.get('toString')).toBeNull();
    expect(await storage.get('__proto__')).toBeNull();
    await storage.set('__proto__', 'x');
    expect(await storage.get('__proto__')).toBe('x');
  });
});

describe('core/platform createHeadlessPlatform', () => {
  it('defaults to the 1920x1080 Tizen web viewport and accepts another size', () => {
    expect(createHeadlessPlatform().display).toEqual({ cssWidth: 1920, cssHeight: 1080 });
    expect(createHeadlessPlatform({ cssWidth: 1280, cssHeight: 720 }).display).toEqual({
      cssWidth: 1280,
      cssHeight: 720,
    });
  });

  it('reports no devices, no WebGL2, no exit and resolves audio unlock', async () => {
    const platform = createHeadlessPlatform();
    expect(platform.caps).toEqual({ gamepad: false, remoteOnly: false, webgl2: false });
    expect(platform.exit).toBeNull();
    await expect(platform.audio.unlock()).resolves.toBeUndefined();
  });

  it('fires lifecycle callbacks in registration order, each time', () => {
    const platform = createHeadlessPlatform();
    const calls: string[] = [];
    platform.lifecycle.onSuspend(() => calls.push('s1'));
    platform.lifecycle.onSuspend(() => calls.push('s2'));
    platform.lifecycle.onResume(() => calls.push('r1'));
    platform.suspend();
    platform.suspend();
    platform.resume();
    expect(calls).toEqual(['s1', 's2', 's1', 's2', 'r1']);
  });

  it('gives every headless platform its own snapshot and storage', async () => {
    const a = createHeadlessPlatform();
    const b = createHeadlessPlatform();
    expect(a.snapshot).not.toBe(b.snapshot);
    await a.storage.set('k', 'v');
    expect(await b.storage.get('k')).toBeNull();
  });
});
