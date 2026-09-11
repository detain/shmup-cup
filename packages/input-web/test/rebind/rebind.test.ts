import { describe, expect, it } from 'vitest';
import { moduleInfo } from '../../src/rebind/index.js';

describe('input-web/rebind (placeholder)', () => {
  it('imports cleanly and describes itself', () => {
    expect(moduleInfo.name).toBe('rebind');
    expect(moduleInfo.status).toBe('placeholder');
    expect(moduleInfo.specRefs.length).toBeGreaterThan(0);
  });
});
