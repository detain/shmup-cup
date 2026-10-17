/**
 * The shipped atlas for the TV render bench's tests (plan R0-02), built in memory by the asset
 * pipeline (`buildAtlas()` of `scripts/assets/pipeline.mjs`) like every other test that needs it.
 *
 * `assets/generated/` is git-ignored and CI's `test` job never runs `pnpm assets`, so a test that
 * read the atlas from there failed on a clean checkout. The pipeline is deterministic: this is the
 * manifest and the page bytes `pnpm assets` writes, without touching the disk.
 *
 * @module
 */
import { buildAtlas } from '../../../../scripts/assets/pipeline.mjs';

/** The shipped atlas: its manifest and the PNG bytes of every page, in page order. */
export interface ShippedAtlas {
  /** The manifest (`main.json`); cast it to the shape the test reads. */
  readonly manifest: ReturnType<typeof buildAtlas>['manifest'];
  /** Every page's PNG bytes (`main.png`, `main-1.png`, …), in `manifest.pages` order. */
  readonly pngs: Buffer[];
}

/** The atlas built by the first call (one build per test file — each runs in its own worker). */
let built: ShippedAtlas | null = null;

/**
 * Builds the shipped atlas in memory, once per worker.
 *
 * @returns The manifest and the page bytes; the same object on every call — do not modify it.
 * @throws {Error} When an asset source is invalid (the pipeline's `AssetSourceError`).
 */
export function shippedAtlas(): ShippedAtlas {
  if (built === null) {
    const { manifest, pages } = buildAtlas();
    built = { manifest, pngs: pages.map((page) => page.png) };
  }
  return built;
}
