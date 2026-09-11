import { describe, expect, it } from 'vitest';
import { moduleInfo } from '../../src/bullets/index.js';

describe('core/bullets (placeholder)', () => {
  it('imports cleanly and describes itself', () => {
    expect(moduleInfo.name).toBe('bullets');
    expect(moduleInfo.status).toBe('placeholder');
    expect(moduleInfo.specRefs.length).toBeGreaterThan(0);
  });
});
