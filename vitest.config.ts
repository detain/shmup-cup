/**
 * Root Vitest config: every workspace package/app plus the repo-level
 * integration suite in `test/` is a Vitest project.
 *
 * - `pnpm test`            → Turborepo runs each project's own `vitest run` (cached)
 *                            plus `test:integration`.
 * - `pnpm test:all`        → one Vitest process over all projects.
 * - `pnpm test:integration`→ only the `integration` project.
 *
 * `tools/*` is intentionally not listed: tools are standalone npm projects.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['packages/*', 'apps/*', 'test'],
  },
});
