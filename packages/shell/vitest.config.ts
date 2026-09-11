/**
 * Vitest project for `@shmup/shell`: runs the `*.test.ts` files under `test/` in the Node
 * environment, with workspace packages resolved to source (see `vitest.shared.ts`). Workers
 * start with `--expose-gc` so per-frame code (e.g. the free-flight scene's `update()`) can be
 * checked with the core's allocation guard (`packages/core/test/helpers/alloc.ts`). Run with
 * `pnpm --filter @shmup/shell test`, or as part of `pnpm test` / `pnpm test:all`.
 *
 * @module
 */
import { defineShmupProject } from '../../vitest.shared.js';

export default defineShmupProject('shell', { execArgv: ['--expose-gc'] });
