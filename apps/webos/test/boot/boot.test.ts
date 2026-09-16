import { describe, expect, it } from 'vitest';
import {
  DEBUG_REMOTE_KEYS,
  bootWebosApp,
  moduleInfo,
  webosDebugTools,
} from '../../src/boot/index.js';

// bootWebosApp needs a WebGL canvas — it runs on the TV (and in a desktop browser via
// `pnpm --filter @shmup/webos dev`). Here: the composition root imports cleanly.
describe('webos/boot', () => {
  it('imports cleanly and describes itself', () => {
    expect(moduleInfo.name).toBe('boot');
    expect(moduleInfo.status).toBe('implemented');
    expect(typeof bootWebosApp).toBe('function');
    expect(typeof webosDebugTools('abc')).toBe('function');
    expect(DEBUG_REMOTE_KEYS).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
  });
});
