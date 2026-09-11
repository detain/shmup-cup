/**
 * # atlas — texture atlases and sprite frames
 *
 * **Status: placeholder.** Declares the intended public API only; no logic yet.
 *
 * **Responsibility.** Loads the sprite atlas produced by the M1-03 asset pipeline
 * (`scripts/assets/`, `pnpm assets`): the manifest arrives inlined through
 * `virtual:shmup-assets` (format: `scripts/assets/manifest.mjs`, typed in
 * `types/virtual-modules.d.ts`), the pages (power-of-two, ≤ 2048² — safe on TV GPUs) are
 * images loaded from the relative `pageUrls`. Sets nearest-neighbour sampling and resolves
 * sprite and frame names (`ships/kestrel`, `ships/kestrel#0`) to numeric ids once at load
 * time so per-frame code works with numbers; unknown names map to `ui/missing`.
 *
 * **Implements.**
 * - shmup_feat.md §18 — single 2048² sprite atlas where possible, batched rendering
 * - shmup_tech.md §2.2 — keep atlases ≤ 2048²
 * - shmup_feat.md §25 — content production list
 *
 * **Intended public API.** The declarations below (and the `Planned` notes at the
 * end of the file) are the contract later steps implement.
 *
 * @module
 */
import { defineModule } from '@shmup/core';

/** Module descriptor. */
export const moduleInfo = defineModule({
  name: 'atlas',
  status: 'placeholder',
  specRefs: ['shmup_feat.md §18', 'shmup_tech.md §2.2', 'shmup_feat.md §25'],
});

/** Numeric handle of a sprite frame inside a loaded atlas. */
export type FrameId = number;

/** A loaded atlas. */
export interface Atlas {
  /**
   * Resolves a frame name to its numeric id (do this once at load, not per frame).
   *
   * @param name - Frame name, `<sprite>#<index>`, e.g. `'ships/kestrel#0'`.
   * @returns The frame id, or -1 when the atlas has no such frame.
   */
  frameId(name: string): FrameId;
  /** Number of frames. */
  readonly size: number;
}

// Planned: loadAtlas(url | json + image): Promise<Atlas>, MAX_ATLAS_SIZE = 2048.
