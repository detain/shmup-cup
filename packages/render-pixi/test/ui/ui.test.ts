import { describe, expect, it } from 'vitest';
import { moduleInfo } from '../../src/ui/index.js';

describe('render-pixi/ui (placeholder)', () => {
  it('imports cleanly and describes itself', () => {
    expect(moduleInfo.name).toBe('ui');
    expect(moduleInfo.status).toBe('placeholder');
    expect(moduleInfo.specRefs.length).toBeGreaterThan(0);
  });
});
