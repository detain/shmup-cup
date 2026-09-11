import { describe, expect, it } from 'vitest';
import { moduleInfo } from '../../src/remote/index.js';

describe('input-web/remote (placeholder)', () => {
  it('imports cleanly and describes itself', () => {
    expect(moduleInfo.name).toBe('remote');
    expect(moduleInfo.status).toBe('placeholder');
    expect(moduleInfo.specRefs.length).toBeGreaterThan(0);
  });
});
