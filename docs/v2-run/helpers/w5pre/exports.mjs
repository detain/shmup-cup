/**
 * Lists every **numeric export** of `@shmup/core`'s barrel (`packages/core/src/index.ts`) as
 * `NAME=value`, after a count line — the v1 values the R2-02 audit freezes.
 *
 * **Run** (from the repository root; the tree argument is optional and defaults to this checkout):
 *
 * ```bash
 * node docs/v2-run/helpers/w5pre/exports.mjs                 # today's values
 * V1=$(mktemp -d) && git archive d4de048 packages/core tsconfig.base.json | tar -x -C "$V1"
 * node docs/v2-run/helpers/w5pre/exports.mjs "$V1"           # the v1 values (pre-flip)
 * ```
 *
 * The v1 values must come from a **pre-flip commit (≤ `d4de048`)**: the frame-derived exports
 * moved at `72b18a1` (w5-precheck §2 item 9). `exports.txt` next to this file is the output at
 * `ac40436` (post-flip: 386 numeric exports, `FRAME_W=640`) — the count the completeness audit
 * is checked against, not the v1 values.
 *
 * **Used by** R2-02 prep subtask **A1** (`packages/core/test/config/world-scale.test.ts`: the
 * frozen `V1_WORLD` table and the completeness audit over the numeric barrel exports).
 *
 * **Delete** when A1's `world-scale.test.ts` is on master (at the latest with R2-02's port
 * commit S). Was scratchpad `w5pre/exports.mjs` (the root-argument version of `w5/exports.mjs`).
 *
 * @module
 */
/* global process, console */
import { sourceRoot, withCore } from '../load-core.mjs';

await withCore(sourceRoot(process.argv[2]), (core) => {
  const nums = Object.entries(core).filter(([, v]) => typeof v === 'number');
  console.log('numeric exports', nums.length);
  console.log(nums.map(([k, v]) => `${k}=${String(v)}`).join(' '));
});
