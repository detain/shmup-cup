/**
 * Vitest config for the input probe (kept separate from `vite.config.ts` so the app build config stays
 * build-only). Every test runs headless in Node: pure modules need no DOM, and the few DOM/Tizen glue
 * modules are exercised with small hand-written fakes (see `test/helpers/`), so no jsdom is needed.
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['test/setup.ts'],
    // Build-output tests run a real `vite build` and spawn Node scripts.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
