/**
 * Vitest project for `@shmup/tizen`: runs the `*.test.ts` files under `test/`
 * in the Node environment, with workspace packages resolved to source (see
 * `vitest.shared.ts`). Run with
 * `pnpm --filter @shmup/tizen test`, or as part of `pnpm test` / `pnpm test:all`.
 *
 * The workers get `ALLOCATION_GUARD_EXEC_ARGV` since plan R0-02: the TV render bench's scene has an
 * allocation guard (`test/bench/bench-scene-alloc.test.ts`).
 *
 * @module
 */
import { ALLOCATION_GUARD_EXEC_ARGV, defineShmupProject } from '../../vitest.shared.js';

export default defineShmupProject('tizen', { execArgv: ALLOCATION_GUARD_EXEC_ARGV });
