import { describe, expect, it } from 'vitest';
import { moduleInfo } from '../../src/player/index.js';

describe('core/player (placeholder)', () => {
  it('imports cleanly and describes itself', () => {
    expect(moduleInfo.name).toBe('player');
    expect(moduleInfo.status).toBe('placeholder');
    expect(moduleInfo.specRefs.length).toBeGreaterThan(0);
  });
});
