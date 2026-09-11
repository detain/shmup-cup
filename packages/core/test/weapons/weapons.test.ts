import { describe, expect, it } from 'vitest';
import { moduleInfo } from '../../src/weapons/index.js';

describe('core/weapons (placeholder)', () => {
  it('imports cleanly and describes itself', () => {
    expect(moduleInfo.name).toBe('weapons');
    expect(moduleInfo.status).toBe('placeholder');
    expect(moduleInfo.specRefs.length).toBeGreaterThan(0);
  });
});
