import { describe, expect, it } from 'vitest';
import { moduleInfo } from '../../src/device-info/index.js';

describe('tizen/device-info (placeholder)', () => {
  it('imports cleanly and describes itself', () => {
    expect(moduleInfo.name).toBe('device-info');
    expect(moduleInfo.status).toBe('placeholder');
  });
});
