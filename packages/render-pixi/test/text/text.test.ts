import { describe, expect, it } from 'vitest';
import { moduleInfo } from '../../src/text/index.js';

describe('render-pixi/text (placeholder)', () => {
  it('imports cleanly and describes itself', () => {
    expect(moduleInfo.name).toBe('text');
    expect(moduleInfo.status).toBe('placeholder');
    expect(moduleInfo.specRefs.length).toBeGreaterThan(0);
  });
});
