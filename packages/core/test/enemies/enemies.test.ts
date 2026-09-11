import { describe, expect, it } from 'vitest';
import { moduleInfo } from '../../src/enemies/index.js';

describe('core/enemies (placeholder)', () => {
  it('imports cleanly and describes itself', () => {
    expect(moduleInfo.name).toBe('enemies');
    expect(moduleInfo.status).toBe('placeholder');
    expect(moduleInfo.specRefs.length).toBeGreaterThan(0);
  });
});
