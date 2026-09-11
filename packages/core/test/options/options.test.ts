import { describe, expect, it } from 'vitest';
import { moduleInfo } from '../../src/options/index.js';

describe('core/options (placeholder)', () => {
  it('imports cleanly and describes itself', () => {
    expect(moduleInfo.name).toBe('options');
    expect(moduleInfo.status).toBe('placeholder');
    expect(moduleInfo.specRefs.length).toBeGreaterThan(0);
  });
});
