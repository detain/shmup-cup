import { describe, expect, it } from 'vitest';
import { moduleInfo } from '../../src/data/index.js';

describe('core/data (placeholder)', () => {
  it('imports cleanly and describes itself', () => {
    expect(moduleInfo.name).toBe('data');
    expect(moduleInfo.status).toBe('placeholder');
    expect(moduleInfo.specRefs.length).toBeGreaterThan(0);
  });
});
