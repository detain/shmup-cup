/**
 * Vitest project for `@shmup/webos`: runs the `*.test.ts` files under `test/`
 * in the Node environment, with workspace packages resolved to source (see
 * `vitest.shared.ts`). Run with
 * `pnpm --filter @shmup/webos test`, or as part of `pnpm test` / `pnpm test:all`.
 *
 * @module
 */
import { defineShmupProject } from '../../vitest.shared.js';

export default defineShmupProject('webos');
