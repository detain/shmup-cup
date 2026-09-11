import { describe, expect, it } from 'vitest';
import { moduleInfo } from '../../src/save/index.js';

describe('core/save (placeholder)', () => {
  it('imports cleanly and describes itself', () => {
    expect(moduleInfo.name).toBe('save');
    expect(moduleInfo.status).toBe('placeholder');
    expect(moduleInfo.specRefs.length).toBeGreaterThan(0);
  });
});
