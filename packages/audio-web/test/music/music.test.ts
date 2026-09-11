import { describe, expect, it } from 'vitest';
import { moduleInfo } from '../../src/music/index.js';

describe('audio-web/music (placeholder)', () => {
  it('imports cleanly and describes itself', () => {
    expect(moduleInfo.name).toBe('music');
    expect(moduleInfo.status).toBe('placeholder');
    expect(moduleInfo.specRefs.length).toBeGreaterThan(0);
  });
});
