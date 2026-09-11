import { describe, expect, it } from 'vitest';
import { moduleInfo } from '../../src/powerups/index.js';

describe('core/powerups (placeholder)', () => {
  it('imports cleanly and describes itself', () => {
    expect(moduleInfo.name).toBe('powerups');
    expect(moduleInfo.status).toBe('placeholder');
    expect(moduleInfo.specRefs.length).toBeGreaterThan(0);
  });
});
