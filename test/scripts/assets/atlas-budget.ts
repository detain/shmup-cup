/**
 * The atlas's byte budget, shared by the tests that hold an atlas build to it:
 * `test/integration/cjk-budget.test.ts` (the shipped zone-split atlas, R1-05) and
 * `test/scripts/assets/interim-pipeline.test.ts` (the interim ×1.5 atlas, R2-01).
 *
 * **Since R3-04.M2b (decision W5-16) the caps are the stand-in projection, in bytes.** The
 * stand-in set (decision W5-14, `scripts/assets/standin.mjs`) models the art-bible density; the
 * M1b gate (`test/scripts/assets/standin.test.ts`, rule RR-7) holds every 2048×1024 stand-in page
 * to the 0.3–0.6 MB band. `test/integration/standin-budget.test.ts` (M2a; its table re-measured
 * byte-identical at `7baeb4d`) prints the **residency rows**: `common` 91,921 B (one 1024×1024
 * page) and a zone row 430,743–538,244 B, Σ 4,228,727 — and a zone row carries the shared
 * `common` page beside the zone's own, because that is what a stage keeps on the GPU. The bytes
 * these caps gate are each group's **own** pages: a stand-in zone sits at 338,822–446,323 B (the
 * row minus `common`), `common` alone at 91,921 B.
 *
 * @module
 */

/**
 * Cap on the `common` group's PNG bytes (one page summed; R3-04.M2b): the RR-7 band's top
 * (0.6 MB per 2048×1024 page) scaled to `common`'s 1024×1024 size — 300,000 B. The stand-in
 * measures 91,921 B, and the band's own floor sits at 150,000 B for this size.
 *
 * **W15-A (owner ruling 2026-10-26): raised 300,000 → 301,000.** The five main weapon types add
 * six sprites and 22 frames (the eight Seeker Drone headings, the Rail muzzle flash, the Sky
 * Marker's blink pair and the beam's full-height fade frame); the common page measures
 * **300,668 B** with them (+1,849 B over the 298,819 B the rebased master measured). The ruling:
 * this is the lane's own discipline figure, not a firmware wall — the TV's real ceilings stand
 * with headroom (the bundle's gzip budget 512 KB vs 406.5 KB used, dist 16,384 KB vs 2,404 KB),
 * and the art must not be cut to fit a book number. Functional caps (the 96-slot shot pool) are
 * untouched by this change.
 *
 * **w15-C (owner art-budget ruling 2026-10-26, the era's sole authorized raise, continued):
 * raised 301,000 → 307,000.** The item-variety art adds seven sprites and 34 frames at scale 1
 * (four flavored pills × 4 glint frames, three drop crates × 6 shimmer stages, the ENRICH pass);
 * the common page measures **306,128 B** with them (+5,460 B over W15-A's 300,668 B). The same
 * arithmetic as the row above: a discipline figure, not a firmware wall — the TV's real ceilings
 * keep their headroom, and the gameplay caps (the 32-slot item pool first of all) stand untouched.
 *
 * **w15-ENRICH-A (the same owner re-add ruling, riding on w15-C's row): raised 307,000 →
 * 309,500.** The six option-silhouette v2 twins and the two gen6 rows REING6 stopped (the bonus
 * jewel and the one-up; the third, the option hunter, this lane dropped at its e2e screen check)
 * land as native art whose richer palettes compress worse than the flat upscaled frames they
 * replace; the page measures **308,475 B** on this merge (+2,347 B over w15-C's 306,128 B). The
 * page's AREA, the quantity the stand-in band and the TV residency budget actually model, does
 * not move: every new native draws in the slot the upscaled frame held, and the bundle's gzip
 * and dist rows still stand under their real ceilings. Headroom 1,025 B kept — a bulk colour
 * regression still trips this cap loudly.
 *
 * **w15-REING7 (the same owner re-add ruling, dated 2026-10-26): raised 309,500 → 320,000.**
 * The gen7 harvest's 18 common-page rows — the nine zone-map planets (native 31/32-colour art,
 * new names), the four capsule pills, the three round-shot bodies and the flak casing — replace
 * upscaled flat frames with richer native palettes that compress worse; the page measures
 * **318,768 B** on this landing (+10,293 B over ENRICH-A's 308,475 B). The zone-E page moves
 * 49,219 → 59,194 B with its 36 native ridge tiles, under its own untouched cap. The AREA law
 * holds again: every row draws in the slot the upscaled frame held (619 sprites, 2,200 frames
 * unchanged), so the stand-in band and the TV residency budget do not move, and the bundle's
 * gzip and dist rows still stand under their real ceilings. Headroom 1,232 B kept — a bulk
 * colour regression still trips this cap loudly.
 */
export const ATLAS_COMMON_PNG_CAP = 320_000;
/**
 * Cap on one campaign zone's atlas PNG bytes (its **own** pages summed — the quantity both gate
 * tests pass to it; R3-04.M2b): the RR-7 band's top, 0.6 MB per 2048×1024 page — the page a
 * bible-density zone stands on. The worst real stand-in zone page measures 446,323 B (zone d;
 * `standin-budget.test.ts` prints 538,244 B for its residency row because every row carries the
 * shared 91,921 B `common` page too, which {@link ATLAS_COMMON_PNG_CAP} gates separately) —
 * 153,677 B under this cap, so the cap is the band, not a number the art already sits under.
 */
export const ATLAS_ZONE_PNG_CAP = 600_000;

/**
 * Cap on an atlas's total PNG bytes, every page summed (R1-05's guard, set to the measured v2
 * projection by R3-04.M2b): {@link ATLAS_COMMON_PNG_CAP} plus one
 * {@link ATLAS_ZONE_PNG_CAP} for each of the campaign's nine zones — 5,700,000 B. The stand-in
 * set measures 3,401,438 B against it (`common` once plus the nine zone pages — the same
 * table's Σ rows, 4,228,727 B, less its nine repeated `common` copies, 827,289 B); the interim
 * placeholder art is far under both (143,775 B today). The cap is what detailed art may grow
 * into, and `DIST_BUDGET`'s docblock (`apps/tizen/scripts/check-bundle.mjs`) is where these
 * bytes meet the code and the audio.
 */
export const ATLAS_PNG_BYTES_CAP = ATLAS_COMMON_PNG_CAP + 9 * ATLAS_ZONE_PNG_CAP;
