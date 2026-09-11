import { describe, expect, it } from 'vitest';
import { moduleInfo } from '../../src/live-reload/index.js';

describe('tizen/live-reload (placeholder)', () => {
  it('imports cleanly and describes itself', () => {
    expect(moduleInfo.name).toBe('live-reload');
    expect(moduleInfo.status).toBe('placeholder');
  });
});
