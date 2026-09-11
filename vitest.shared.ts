/**
 * Shared Vitest project settings for every workspace package and app.
 *
 * Each package's `vitest.config.ts` calls {@link defineShmupProject}; the root
 * `vitest.config.ts` lists all of them as Vitest *projects*, so `pnpm test:all`
 * runs the whole repo in one process while `pnpm test` (Turborepo) runs them
 * per package with caching.
 *
 * @module
 */
import { defineProject, type UserWorkspaceConfig } from 'vitest/config';
import { clientConditions, serverConditions } from './vite.shared.js';

export { SOURCE_CONDITION } from './vite.shared.js';

/** Options accepted by {@link defineShmupProject}. */
export interface ShmupProjectOptions {
  /** Vitest environment; everything runs headless in Node by default. */
  readonly environment?: 'node';
  /** Test file globs, relative to the project directory. */
  readonly include?: readonly string[];
}

/**
 * Builds a Vitest project config with the repo conventions: tests live in
 * `test/` (never next to sources) and workspace packages resolve to source.
 *
 * @param name - Project name shown in Vitest output (e.g. `core`).
 * @param options - Optional overrides.
 * @returns A Vitest project config.
 */
export function defineShmupProject(
  name: string,
  options: ShmupProjectOptions = {},
): UserWorkspaceConfig {
  return defineProject({
    resolve: { conditions: clientConditions },
    ssr: { resolve: { conditions: serverConditions } },
    test: {
      name,
      environment: options.environment ?? 'node',
      include: [...(options.include ?? ['test/**/*.test.ts'])],
    },
  });
}
