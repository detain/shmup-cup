import { describe, expect, it } from 'vitest';
import { bootTizenApp, moduleInfo } from '../../src/boot/index.js';

// bootTizenApp needs a WebGL canvas — it runs on the TV (and in a desktop browser via
// `pnpm --filter @shmup/tizen dev`). Here: the composition root imports cleanly.
describe('tizen/boot', () => {
  it('imports cleanly and describes itself', () => {
    expect(moduleInfo.name).toBe('boot');
    expect(typeof bootTizenApp).toBe('function');
  });
});
