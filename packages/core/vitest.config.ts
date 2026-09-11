/**
 * Vitest project for `@shmup/core`: runs the `*.test.ts` files under `test/`
 * in the Node environment, with workspace packages resolved to source (see
 * `vitest.shared.ts`). Workers start with `--expose-gc` so the allocation guard
 * (`test/helpers/alloc.ts`) can force collections around a measured loop. Run with
 * `pnpm --filter @shmup/core test`, or as part of `pnpm test` / `pnpm test:all`.
 *
 * @module
 */
import { defineShmupProject } from '../../vitest.shared.js';

export default defineShmupProject('core', { execArgv: ['--expose-gc'] });
