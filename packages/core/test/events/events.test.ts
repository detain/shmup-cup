import { describe, expect, it } from 'vitest';
import { moduleInfo } from '../../src/events/index.js';

describe('core/events (placeholder)', () => {
  it('imports cleanly and describes itself', () => {
    expect(moduleInfo.name).toBe('events');
    expect(moduleInfo.status).toBe('placeholder');
    expect(moduleInfo.specRefs.length).toBeGreaterThan(0);
  });
});
