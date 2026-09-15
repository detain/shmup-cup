/**
 * Vitest project for `@shmup/core`: runs the `*.test.ts` files under `test/`
 * in the Node environment, with workspace packages resolved to source (see
 * `vitest.shared.ts`). Workers start with `ALLOCATION_GUARD_EXEC_ARGV` (`--expose-gc`,
 * `--allow-natives-syntax`) for the allocation guard (`test/helpers/alloc.ts`). Run with
 * `pnpm --filter @shmup/core test`, or as part of `pnpm test` / `pnpm test:all`.
 *
 * @module
 */
import { ALLOCATION_GUARD_EXEC_ARGV, defineShmupProject } from '../../vitest.shared.js';

export default defineShmupProject('core', { execArgv: ALLOCATION_GUARD_EXEC_ARGV });
