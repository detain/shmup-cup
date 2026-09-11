import { describe, expect, it } from 'vitest';
import { moduleInfo } from '../../src/collision/index.js';

describe('core/collision (placeholder)', () => {
  it('imports cleanly and describes itself', () => {
    expect(moduleInfo.name).toBe('collision');
    expect(moduleInfo.status).toBe('placeholder');
    expect(moduleInfo.specRefs.length).toBeGreaterThan(0);
  });
});
