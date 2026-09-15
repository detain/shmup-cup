/**
 * Shared Vitest project settings for every workspace package and app.
 *
 * Each package's `vitest.config.ts` calls {@link defineShmupProject}; the root
 * `vitest.config.ts` lists all of them as Vitest *projects*, so `pnpm test` runs the whole
 * repo in one process with one shared worker pool, and `pnpm --filter <pkg> test` one package.
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
 * On a 4-vCPU CI runner a CPU-bound test — a full atlas build, a headless stage run — can take
 * many times its local time: the shell's 0.5 s atlas-name check hit 5.2 s in CI when `pnpm test`
 * still ran every package's suite at once (Turborepo). A test that needs longer still passes its
 * own timeout as the last argument of `it`.
 */
export const TEST_TIMEOUT_MS = 30_000;

/**
 * Worker `node` flags of every project with allocation guards (`measureHeapGrowth` in
 * `packages/core/test/helpers/alloc.ts` — `@shmup/core`, `@shmup/shell`, `@shmup/render-pixi`
 * and `@shmup/input-web`): `--expose-gc` for `gc()`, and `--allow-natives-syntax` for V8's
 * `%FinalizeOptimization()`, which lands the background compiles before every round the guard
 * measures. Neither changes how the code under test runs; the guard throws without them.
 */
export const ALLOCATION_GUARD_EXEC_ARGV: readonly string[] = [
  '--expose-gc',
  '--allow-natives-syntax',
];

/** Options accepted by {@link defineShmupProject}. */
export interface ShmupProjectOptions {
  /** Vitest environment; everything runs headless in Node by default. */
  readonly environment?: 'node';
  /** Test file globs, relative to the project directory. */
  readonly include?: readonly string[];
  /**
   * Extra `node` arguments for the test workers, e.g. {@link ALLOCATION_GUARD_EXEC_ARGV} for the
   * allocation guard (`packages/core/test/helpers/alloc.ts`).
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
 * `execArgv` is passed to Vitest's worker pool unchanged; the projects with allocation guards
 * pass {@link ALLOCATION_GUARD_EXEC_ARGV}, which `measureHeapGrowth` needs.
 *
 * @param name - Project name shown in Vitest output (e.g. `core`).
 * @param options - Optional overrides (environment, test globs, worker `execArgv`).
 * @returns A Vitest project config.
 *
 * @example
 * ```ts
 * // packages/foo/vitest.config.ts
 * import { ALLOCATION_GUARD_EXEC_ARGV, defineShmupProject } from '../../vitest.shared.js';
 * export default defineShmupProject('foo');
 * // or, with the allocation guard available in the workers:
 * export default defineShmupProject('foo', { execArgv: ALLOCATION_GUARD_EXEC_ARGV });
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
