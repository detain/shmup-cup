/**
 * # text — bitmap-font text rendering
 *
 * **Status: placeholder.** Declares the intended public API only; no logic yet.
 *
 * **Responsibility.** Draws text with a bitmap pixel font (BMFont `.fnt` or grid font from the atlas):
 * very readable digits, integer positions, glyph sprites reused; strings are rebuilt only
 * when they change (HUD score updates must not allocate every frame). Larger atlases
 * later for CJK localisation.
 *
 * **Implements.**
 * - shmup_feat.md §17 — bitmap font, readable digits
 * - shmup_feat.md §21 — localisation (P2)
 * - shmup_tech.md §4.10 — bitmap-font text renderer
 *
 * **Intended public API.** The declarations below (and the `Planned` notes at the
 * end of the file) are the contract later steps implement.
 *
 * @module
 */
import { defineModule } from '@shmup/core';

/** Module descriptor. */
export const moduleInfo = defineModule({
  name: 'text',
  status: 'placeholder',
  specRefs: ['shmup_feat.md §17', 'shmup_feat.md §21', 'shmup_tech.md §4.10'],
});

/** A reusable text display bound to one bitmap font. */
export interface BitmapTextView {
  /** Updates the text; no-op (and no allocation) when unchanged. */
  setText(text: string): void;
  setPosition(x: number, y: number): void;
}

// Planned: loadBitmapFont(...), createBitmapText(layer, fontId, maxChars).
