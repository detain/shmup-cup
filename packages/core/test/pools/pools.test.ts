import { describe, expect, it } from 'vitest';
import { moduleInfo } from '../../src/pools/index.js';

describe('core/pools (placeholder)', () => {
  it('imports cleanly and describes itself', () => {
    expect(moduleInfo.name).toBe('pools');
    expect(moduleInfo.status).toBe('placeholder');
    expect(moduleInfo.specRefs.length).toBeGreaterThan(0);
  });
});
