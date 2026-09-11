import { describe, expect, it } from 'vitest';
import { moduleInfo } from '../../src/rank/index.js';

describe('core/rank (placeholder)', () => {
  it('imports cleanly and describes itself', () => {
    expect(moduleInfo.name).toBe('rank');
    expect(moduleInfo.status).toBe('placeholder');
    expect(moduleInfo.specRefs.length).toBeGreaterThan(0);
  });
});
