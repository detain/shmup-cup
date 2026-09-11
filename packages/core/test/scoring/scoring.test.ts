import { describe, expect, it } from 'vitest';
import { moduleInfo } from '../../src/scoring/index.js';

describe('core/scoring (placeholder)', () => {
  it('imports cleanly and describes itself', () => {
    expect(moduleInfo.name).toBe('scoring');
    expect(moduleInfo.status).toBe('placeholder');
    expect(moduleInfo.specRefs.length).toBeGreaterThan(0);
  });
});
