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

/**
 * Default per-test timeout (ms) for every project: 30 s instead of Vitest's 5 s.
 *
 * @remarks
 * `pnpm test` runs every package's suite at once (Turborepo), so on a 4-vCPU CI runner a
 * CPU-bound test — a full atlas build, a headless stage run — can take ten times its local
 * time: the shell's 0.5 s atlas-name check hit 5.2 s in CI. A test that needs longer still
 * passes its own timeout as the last argument of `it`.
 */
export const TEST_TIMEOUT_MS = 30_000;

/** Options accepted by {@link defineShmupProject}. */
export interface ShmupProjectOptions {
  /** Vitest environment; everything runs headless in Node by default. */
  readonly environment?: 'node';
  /** Test file globs, relative to the project directory. */
  readonly include?: readonly string[];
  /**
   * Extra `node` arguments for the test workers, e.g. `['--expose-gc']` for the allocation
   * guard of `@shmup/core` (`test/helpers/alloc.ts`).
   */
  readonly execArgv?: readonly string[];
}

/**
 * Builds a Vitest project config with the repo conventions: tests live in
 * `test/` (never next to sources), workspace packages resolve to source, and a test
 * may run for {@link TEST_TIMEOUT_MS} before it times out.
 *
 * @remarks
 * Both the client and the SSR resolver get the `@shmup/source` condition first, so a
 * test importing `@shmup/core` runs `packages/core/src` directly — no package build is
 * needed before `pnpm test`.
 *
 * `execArgv` is passed to Vitest's worker pool unchanged; `@shmup/core` and `@shmup/shell`
 * use it for `--expose-gc`, which the allocation guard (`measureHeapGrowth`) needs.
 *
 * @param name - Project name shown in Vitest output (e.g. `core`).
 * @param options - Optional overrides (environment, test globs, worker `execArgv`).
 * @returns A Vitest project config.
 *
 * @example
 * ```ts
 * // packages/foo/vitest.config.ts
 * import { defineShmupProject } from '../../vitest.shared.js';
 * export default defineShmupProject('foo');
 * // or, with the allocation guard available in the workers:
 * export default defineShmupProject('foo', { execArgv: ['--expose-gc'] });
 * ```
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
      testTimeout: TEST_TIMEOUT_MS,
      include: [...(options.include ?? ['test/**/*.test.ts'])],
      ...(options.execArgv === undefined ? {} : { execArgv: [...options.execArgv] }),
    },
  });
}
