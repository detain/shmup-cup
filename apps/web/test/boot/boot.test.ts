import { describe, expect, it } from 'vitest';
import { bootWebApp, moduleInfo } from '../../src/boot/index.js';

// bootWebApp needs a real WebGL canvas; it runs in the browser (`pnpm dev`, `pnpm test:e2e`).
// Here we only prove the composition root and the workspace packages import cleanly (the
// wiring is covered by boot-wiring.test.ts with fakes).
describe('web/boot', () => {
  it('imports cleanly and describes itself', () => {
    expect(moduleInfo.name).toBe('boot');
    expect(moduleInfo.status).toBe('implemented');
    expect(typeof bootWebApp).toBe('function');
  });
});
