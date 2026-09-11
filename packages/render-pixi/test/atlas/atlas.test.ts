import { describe, expect, it } from 'vitest';
import { moduleInfo } from '../../src/atlas/index.js';

describe('render-pixi/atlas (placeholder)', () => {
  it('imports cleanly and describes itself', () => {
    expect(moduleInfo.name).toBe('atlas');
    expect(moduleInfo.status).toBe('placeholder');
    expect(moduleInfo.specRefs.length).toBeGreaterThan(0);
  });
});
