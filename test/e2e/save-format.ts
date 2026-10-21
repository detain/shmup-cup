/**
 * The save format for the browser tests (plan_resolution.md R2-01): the version number the build
 * writes into its save document, for the specs that read a stored or exported save back. The
 * specs cannot import `@shmup/core` (see `frame-pixels.ts`), so this is a pinned mirror of
 * `core/save` `SAVE_VERSION`, like `scripts/frame.mjs` for the frame (owner decision O8):
 * `test/integration/e2e-save-format.test.ts` fails when core's format moves and this copy does
 * not, so a save bump turns `pnpm test` red rather than only an e2e shard.
 *
 * @example
 * ```ts
 * import { SAVE_FORMAT } from './save-format.js';
 * expect((await storedSave(page))?.version).toBe(SAVE_FORMAT);
 * ```
 *
 * @module
 */

/** The save format the build writes (`core/save` `SAVE_VERSION`: 4 since v2's R6-04, 3 since R2-01). */
export const SAVE_FORMAT = 4;
