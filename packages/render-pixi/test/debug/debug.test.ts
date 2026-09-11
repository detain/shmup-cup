import { describe, expect, it } from 'vitest';
import { moduleInfo } from '../../src/debug/index.js';

describe('render-pixi/debug (placeholder)', () => {
  it('imports cleanly and describes itself', () => {
    expect(moduleInfo.name).toBe('debug');
    expect(moduleInfo.status).toBe('placeholder');
    expect(moduleInfo.specRefs.length).toBeGreaterThan(0);
  });
});
