/**
 * Vitest project for `@shmup/render-pixi`: runs the `*.test.ts` files under `test/`
 * in the Node environment, with workspace packages resolved to source (see
 * `vitest.shared.ts`). Workers start with `ALLOCATION_GUARD_EXEC_ARGV` so per-frame code can be
 * checked with the core's allocation guard (`packages/core/test/helpers/alloc.ts`). Run with
 * `pnpm --filter @shmup/render-pixi test`, or as part of `pnpm test` / `pnpm test:all`.
 *
 * @module
 */
import { ALLOCATION_GUARD_EXEC_ARGV, defineShmupProject } from '../../vitest.shared.js';

export default defineShmupProject('render-pixi', { execArgv: ALLOCATION_GUARD_EXEC_ARGV });
