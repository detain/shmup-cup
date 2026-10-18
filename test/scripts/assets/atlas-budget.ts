/**
 * The atlas's byte budget, shared by the tests that hold an atlas build to it:
 * `test/integration/cjk-budget.test.ts` (the shipped zone-split atlas, R1-05) and
 * `test/scripts/assets/interim-pipeline.test.ts` (the interim ×1.5 atlas, R2-01).
 *
 * @module
 */

/**
 * Cap on an atlas's PNG bytes, every page summed (R1-05): the placeholder art takes ≈ 120 KB split
 * into zone pages (PNG-8 where a page fits a palette), and its interim ×1.5 upscale (R2-01) ≈ 136 KB.
 * A regression guard for the encoder and the split; detailed art replaces it with its measured
 * budget (plan R3-04).
 */
export const ATLAS_PNG_BYTES_CAP = 256 * 1024;
