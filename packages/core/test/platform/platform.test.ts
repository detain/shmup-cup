import { describe, expect, it } from 'vitest';
import {
  createHeadlessPlatform,
  createMemoryStorage,
  moduleInfo,
} from '../../src/platform/index.js';

describe('core/platform', () => {
  it('describes itself', () => {
    expect(moduleInfo.name).toBe('platform');
  });

  it('memory storage round-trips values and returns null for missing keys', async () => {
    const storage = createMemoryStorage({ a: '1' });
    expect(await storage.get('a')).toBe('1');
    expect(await storage.get('missing')).toBeNull();
    await storage.set('b', 'two');
    expect(await storage.get('b')).toBe('two');
  });

  it('headless platform returns the same snapshot every poll and fires lifecycle callbacks', () => {
    const platform = createHeadlessPlatform();
    expect(platform.id).toBe('headless');
    expect(platform.exit).toBeNull();
    expect(platform.input.poll()).toBe(platform.snapshot);
    expect(platform.input.poll()).toBe(platform.snapshot);

    const calls: string[] = [];
    platform.lifecycle.onSuspend(() => calls.push('suspend'));
    platform.lifecycle.onResume(() => calls.push('resume'));
    platform.suspend();
    platform.resume();
    expect(calls).toEqual(['suspend', 'resume']);
  });
});
