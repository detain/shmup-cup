/**
 * The atlas's byte budget, shared by the tests that hold an atlas build to it:
 * `test/integration/cjk-budget.test.ts` (the shipped zone-split atlas, R1-05) and
 * `test/scripts/assets/interim-pipeline.test.ts` (the interim ×1.5 atlas, R2-01).
 *
 * **Since R3-04.M2b (decision W5-16) the caps are the stand-in projection, in bytes.** The
 * stand-in set (decision W5-14, `scripts/assets/standin.mjs`) models the art-bible density; the
 * M1b gate (`test/scripts/assets/standin.test.ts`, rule RR-7) holds every 2048×1024 stand-in page
 * to 0.3–0.6 MB, and `test/integration/standin-budget.test.ts` (M2a) measures the packed atlas at
 * 91,921 B for `common` (one 1024×1024 page) and 338,822–446,323 B for a zone's page.
 *
 * @module
 */

/**
 * Cap on the `common` group's PNG bytes (one page summed; R3-04.M2b): the RR-7 band's top
 * (0.6 MB per 2048×1024 page) scaled to `common`'s 1024×1024 size — 300,000 B. The stand-in
 * measures 91,921 B, and the band's own floor sits at 150,000 B for this size.
 */
export const ATLAS_COMMON_PNG_CAP = 300_000;

/**
 * Cap on one campaign zone's atlas PNG bytes (its pages summed; R3-04.M2b): the RR-7 band's top,
 * 0.6 MB per 2048×1024 page — the page a bible-density zone stands on. The worst stand-in page
 * measures 446,323 B (zone D), so the cap is the band, not a number the art already sits under.
 */
export const ATLAS_ZONE_PNG_CAP = 600_000;

/**
 * Cap on an atlas's total PNG bytes, every page summed (R1-05's guard, set to the measured v2
 * projection by R3-04.M2b): {@link ATLAS_COMMON_PNG_CAP} plus one
 * {@link ATLAS_ZONE_PNG_CAP} for each of the campaign's nine zones — 5,700,000 B. The interim
 * placeholder art is far under it (143,775 B today); the cap is what detailed art may grow into,
 * and `DIST_BUDGET`'s docblock (`apps/tizen/scripts/check-bundle.mjs`) is where these bytes meet
 * the code and the audio.
 */
export const ATLAS_PNG_BYTES_CAP = ATLAS_COMMON_PNG_CAP + 9 * ATLAS_ZONE_PNG_CAP;
