import { describe, expect, it } from 'vitest';
import { moduleInfo } from '../../src/rng/index.js';

describe('core/rng (placeholder)', () => {
  it('imports cleanly and describes itself', () => {
    expect(moduleInfo.name).toBe('rng');
    expect(moduleInfo.status).toBe('placeholder');
    expect(moduleInfo.specRefs.length).toBeGreaterThan(0);
  });
});
