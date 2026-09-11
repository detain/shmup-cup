import { describe, expect, it } from 'vitest';
import { moduleInfo } from '../../src/stage/index.js';

describe('core/stage (placeholder)', () => {
  it('imports cleanly and describes itself', () => {
    expect(moduleInfo.name).toBe('stage');
    expect(moduleInfo.status).toBe('placeholder');
    expect(moduleInfo.specRefs.length).toBeGreaterThan(0);
  });
});
