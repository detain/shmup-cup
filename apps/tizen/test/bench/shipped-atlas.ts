/**
 * The atlas the TV render bench is built from, for the bench's tests (plan R0-02): the shipped art
 * packed without groups — `benchSourceAtlas()` of `scripts/bench-atlas.mjs`, i.e. the asset
 * pipeline's `buildAtlas({ ungrouped: true })`, every sprite on one page.
 *
 * Since R1-05 the game's own atlas is split into a `common` page and one page per zone; the bench
 * keeps modelling the art as one atlas (its page counts 1 / 1 / 2 and R0-02's runs stay
 * comparable), so its tests read the same one-page build the bench plugin scales — byte for byte
 * the game's atlas before the split.
 *
 * `assets/generated/` is git-ignored and CI's `test` job never runs `pnpm assets`, so a test that
 * read the atlas from there failed on a clean checkout. The pipeline is deterministic: this is the
 * manifest and the page bytes, without touching the disk.
 *
 * @module
 */
import { benchSourceAtlas } from '../../scripts/bench-atlas.mjs';

/** The bench's source atlas: its manifest and the PNG bytes of every page, in page order. */
export interface ShippedAtlas {
  /** The manifest (`main.json` shape); cast it to the shape the test reads. */
  readonly manifest: ReturnType<typeof benchSourceAtlas>['manifest'];
  /** Every page's PNG bytes (`main.png`, …), in `manifest.pages` order. */
  readonly pngs: Buffer[];
}

/** The atlas built by the first call (one build per test file — each runs in its own worker). */
let built: ShippedAtlas | null = null;

/**
 * Builds the bench's source atlas in memory, once per worker.
 *
 * @returns The manifest and the page bytes; the same object on every call — do not modify it.
 * @throws {Error} When an asset source is invalid (the pipeline's `AssetSourceError`).
 */
export function shippedAtlas(): ShippedAtlas {
  built ??= benchSourceAtlas();
  return built;
}
