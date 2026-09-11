import { describe, expect, it } from 'vitest';
import { moduleInfo } from '../../src/layers/index.js';

describe('render-pixi/layers (placeholder)', () => {
  it('imports cleanly and describes itself', () => {
    expect(moduleInfo.name).toBe('layers');
    expect(moduleInfo.status).toBe('placeholder');
    expect(moduleInfo.specRefs.length).toBeGreaterThan(0);
  });
});
