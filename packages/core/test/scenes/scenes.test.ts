import { describe, expect, it } from 'vitest';
import { moduleInfo } from '../../src/scenes/index.js';

describe('core/scenes (placeholder)', () => {
  it('imports cleanly and describes itself', () => {
    expect(moduleInfo.name).toBe('scenes');
    expect(moduleInfo.status).toBe('placeholder');
    expect(moduleInfo.specRefs.length).toBeGreaterThan(0);
  });
});
