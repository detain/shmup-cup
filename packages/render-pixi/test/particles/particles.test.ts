import { describe, expect, it } from 'vitest';
import { moduleInfo } from '../../src/particles/index.js';

describe('render-pixi/particles (placeholder)', () => {
  it('imports cleanly and describes itself', () => {
    expect(moduleInfo.name).toBe('particles');
    expect(moduleInfo.status).toBe('placeholder');
    expect(moduleInfo.specRefs.length).toBeGreaterThan(0);
  });
});
