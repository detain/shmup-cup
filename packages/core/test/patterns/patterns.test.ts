import { describe, expect, it } from 'vitest';
import { moduleInfo } from '../../src/patterns/index.js';

describe('core/patterns (placeholder)', () => {
  it('imports cleanly and describes itself', () => {
    expect(moduleInfo.name).toBe('patterns');
    expect(moduleInfo.status).toBe('placeholder');
    expect(moduleInfo.specRefs.length).toBeGreaterThan(0);
  });
});
