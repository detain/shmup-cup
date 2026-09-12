/**
 * Vitest config of `pnpm bench` (plan M1-19): only the stress benchmark in this folder
 * (`*.perf.ts` — not part of `pnpm test`), in one forked worker with `--expose-gc` (the heap
 * measurement forces collections), workspace packages resolved to source like every other project.
 *
 * @module
 */
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { clientConditions, serverConditions } from '../../vite.shared.js';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  // Keep Vite's cache with the repo's (not a stray test/bench/node_modules/).
  cacheDir: fileURLToPath(new URL('../../node_modules/.vite/bench', import.meta.url)),
  resolve: { conditions: clientConditions },
  ssr: { resolve: { conditions: serverConditions } },
  test: {
    name: 'bench',
    environment: 'node',
    include: ['*.perf.ts'],
    execArgv: ['--expose-gc'],
    pool: 'forks',
    fileParallelism: false,
    testTimeout: 300_000,
    // Print the [bench] summary of a passing run too.
    silent: false,
    reporters: ['verbose'],
  },
});
