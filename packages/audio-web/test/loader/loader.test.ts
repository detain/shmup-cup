import { describe, expect, it } from 'vitest';
import { moduleInfo } from '../../src/loader/index.js';

describe('audio-web/loader (placeholder)', () => {
  it('imports cleanly and describes itself', () => {
    expect(moduleInfo.name).toBe('loader');
    expect(moduleInfo.status).toBe('placeholder');
    expect(moduleInfo.specRefs.length).toBeGreaterThan(0);
  });
});
