/**
 * # atlas — texture atlases and sprite frames
 *
 * **Status: placeholder.** Declares the intended public API only; no logic yet.
 *
 * **Responsibility.** Loads the sprite atlas(es) produced by the asset pipeline (`assets/generated/`,
 * Aseprite / free-tex-packer JSON + PNG), keeps every atlas ≤ 2048² (safe on TV GPUs),
 * sets nearest-neighbour sampling and resolves frame names to texture handles once at
 * load time so per-frame code works with numeric ids.
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
   * @param name - Frame name, e.g. `'ship/idle/0'`.
   * @returns The frame id, or -1 when the atlas has no such frame.
   */
  frameId(name: string): FrameId;
  /** Number of frames. */
  readonly size: number;
}

// Planned: loadAtlas(url | json + image): Promise<Atlas>, MAX_ATLAS_SIZE = 2048.
