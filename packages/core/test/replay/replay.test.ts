import { describe, expect, it } from 'vitest';
import { moduleInfo } from '../../src/replay/index.js';

describe('core/replay (placeholder)', () => {
  it('imports cleanly and describes itself', () => {
    expect(moduleInfo.name).toBe('replay');
    expect(moduleInfo.status).toBe('placeholder');
    expect(moduleInfo.specRefs.length).toBeGreaterThan(0);
  });
});
