import { describe, expect, it } from 'vitest';
import { bootWebApp, moduleInfo } from '../../src/boot/index.js';

// bootWebApp needs a real WebGL canvas; it runs in the browser (`pnpm dev`). Here we
// only prove the composition root and all four workspace packages import cleanly.
describe('web/boot', () => {
  it('imports cleanly and describes itself', () => {
    expect(moduleInfo.name).toBe('boot');
    expect(typeof bootWebApp).toBe('function');
  });
});
