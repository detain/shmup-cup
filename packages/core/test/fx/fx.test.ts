import { describe, expect, it } from 'vitest';
import { moduleInfo } from '../../src/fx/index.js';

describe('core/fx (placeholder)', () => {
  it('imports cleanly and describes itself', () => {
    expect(moduleInfo.name).toBe('fx');
    expect(moduleInfo.status).toBe('placeholder');
    expect(moduleInfo.specRefs.length).toBeGreaterThan(0);
  });
});
