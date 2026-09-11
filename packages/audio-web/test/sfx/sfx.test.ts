import { describe, expect, it } from 'vitest';
import { moduleInfo } from '../../src/sfx/index.js';

describe('audio-web/sfx (placeholder)', () => {
  it('imports cleanly and describes itself', () => {
    expect(moduleInfo.name).toBe('sfx');
    expect(moduleInfo.status).toBe('placeholder');
    expect(moduleInfo.specRefs.length).toBeGreaterThan(0);
  });
});
