import { describe, expect, it } from 'vitest';
import { moduleInfo } from '../../src/sprites/index.js';

describe('render-pixi/sprites (placeholder)', () => {
  it('imports cleanly and describes itself', () => {
    expect(moduleInfo.name).toBe('sprites');
    expect(moduleInfo.status).toBe('placeholder');
    expect(moduleInfo.specRefs.length).toBeGreaterThan(0);
  });
});
