/**
 * # palette — placeholder colour palette
 *
 * **Responsibility.** Named colours used by the skeleton's test pattern and debug
 * drawing until real art exists. Backgrounds are *lifted* dark blues, never pure black:
 * the M7 test monitors are VA panels that smear dark→bright transitions, so small bright
 * bullets stay crisper on deep navy (shmup_tech.md §2.7, shmup_feat.md §18).
 *
 * **Implements.** shmup_feat.md §18 (VA-panel-friendly palette, readable bullet colours).
 *
 * **Public API.** {@link PALETTE}, {@link PaletteColor}.
 *
 * **Planned.** Palette textures for indexed-colour sprites, palette swap / cycling
 * (shmup_feat.md §18 [P1]) move to `effects`.
 *
 * @module
 */
import { defineModule } from '@shmup/core';

/** Module descriptor. */
export const moduleInfo = defineModule({
  name: 'palette',
  status: 'partial',
  specRefs: ['shmup_feat.md §18', 'shmup_tech.md §2.7'],
});

/** Colours as 0xRRGGBB numbers (Pixi's native format). */
export const PALETTE = Object.freeze({
  /** Letterbox around the scaled frame. */
  letterbox: 0x05070f,
  /** Playfield background — deep navy, not black. */
  space: 0x10173a,
  /** Faint 16-px grid. */
  grid: 0x1d2a5c,
  /** Border checker (two tones). */
  borderA: 0xf4f4f4,
  borderB: 0x2a3a78,
  /** Colour bars (SNES-ish saturated ramp). */
  bars: [0xe8e8e8, 0xf8d030, 0x38c8e8, 0x40d858, 0xe050c8, 0xe83838, 0x3858f0, 0x282828] as const,
  /** Player ship. */
  shipHull: 0xc8d0e0,
  shipTrim: 0x3858f0,
  shipCanopy: 0x38c8e8,
  shipThruster: 0xf89830,
  /** Enemy-bullet test colour (pink/red family — shmup_feat.md §12 readability rules). */
  bullet: 0xff5aa0,
  bulletCore: 0xffffff,
});

/** Name of a scalar palette entry. */
export type PaletteColor = Exclude<keyof typeof PALETTE, 'bars'>;
