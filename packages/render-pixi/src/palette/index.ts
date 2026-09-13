/**
 * # palette — placeholder colour palette and the colour-blind bullet palettes
 *
 * **Responsibility.** Named colours used by the skeleton's test pattern and debug
 * drawing until real art exists. Backgrounds are *lifted* dark blues, never pure black:
 * the M7 test monitors are VA panels that smear dark→bright transitions, so small bright
 * bullets stay crisper on deep navy (shmup_tech.md §2.7, shmup_feat.md §18).
 *
 * **Bullet palettes (M2-02).** The player's `UserOptions.display.bulletPalette` (core `config`
 * `BULLET_PALETTES`: `standard`, `deuteranopia`, `protanopia`, `tritanopia`) picks the colour set
 * of the enemy bullets, laser beams and bending laser segments. The asset pipeline draws every
 * such sprite once per colour-blind palette as `<sprite>@<palette>` (recoloured, the bullets'
 * cores shape-coded — `scripts/assets/procedural/palettes.mjs`); {@link resolveBulletPaletteTable}
 * resolves a sprite name table with those variants in place of the plain frames, and the renderer's
 * `setBulletPalette` swaps its tables — the simulation's sprite ids never change.
 *
 * **Implements.** shmup_feat.md §18 (VA-panel-friendly palette, readable bullet colours),
 * shmup_feat.md §21 (colour-blind bullet palettes + shape coding).
 *
 * **Public API.** {@link PALETTE}, {@link PaletteColor}, {@link bulletPaletteSpriteName},
 * {@link resolveBulletPaletteTable}, {@link BULLET_PALETTE_SUFFIX}.
 *
 * **Planned.** Palette textures for indexed-colour sprites, palette swap / cycling
 * (shmup_feat.md §18 [P1]) move to `effects`.
 *
 * @module
 */
import { defineModule, type BulletPalette } from '@shmup/core';
import type { Atlas } from '../atlas/index.js';

/** Module descriptor. */
export const moduleInfo = defineModule({
  name: 'palette',
  status: 'partial',
  specRefs: ['shmup_feat.md §18', 'shmup_tech.md §2.7', 'shmup_feat.md §21'],
});

/** Colours as 0xRRGGBB numbers (Pixi's native format). */
export const PALETTE = Object.freeze({
  /** Letterbox around the scaled frame. */
  letterbox: 0x05070f,
  /** Playfield background — deep navy, not black. */
  space: 0x10173a,
  /** Faint 16-px grid. */
  grid: 0x1d2a5c,
  /** Border checker, light tone (also the centre cross-hair). */
  borderA: 0xf4f4f4,
  /** Border checker, dark tone. */
  borderB: 0x2a3a78,
  /** Colour bars (SNES-ish saturated ramp). */
  bars: [0xe8e8e8, 0xf8d030, 0x38c8e8, 0x40d858, 0xe050c8, 0xe83838, 0x3858f0, 0x282828] as const,
  /** Player ship hull. */
  shipHull: 0xc8d0e0,
  /** Player ship trim stripe. */
  shipTrim: 0x3858f0,
  /** Player ship canopy. */
  shipCanopy: 0x38c8e8,
  /** Player ship thruster flame. */
  shipThruster: 0xf89830,
  /** Enemy-bullet test colour (pink/red family — shmup_feat.md §12 readability rules). */
  bullet: 0xff5aa0,
  /** Bright bullet core pixel (keeps the bullet readable on any background). */
  bulletCore: 0xffffff,
});

/** Name of a scalar palette entry. */
export type PaletteColor = Exclude<keyof typeof PALETTE, 'bars'>;

/** Separator of a palette variant's sprite name: `<sprite>@<palette>`. */
export const BULLET_PALETTE_SUFFIX = '@';

/**
 * The atlas name of a sprite in a bullet palette.
 *
 * @param name - The plain sprite name (e.g. `bullets/oval-red`).
 * @param palette - The palette.
 * @returns `name` for `standard`, else `name@palette`.
 *
 * @example
 * ```ts
 * bulletPaletteSpriteName('bullets/oval-red', 'tritanopia'); // → 'bullets/oval-red@tritanopia'
 * ```
 */
export function bulletPaletteSpriteName(name: string, palette: BulletPalette): string {
  return palette === 'standard' ? name : name + BULLET_PALETTE_SUFFIX + palette;
}

/**
 * Resolves a sprite name table against an atlas for a bullet palette (load time / when the
 * option changes — allocates).
 *
 * @remarks
 * Every name resolves like `Atlas.resolveSpriteTable` (unknown names draw `ui/missing`, warned
 * once); then, unless the palette is `standard`, every name whose `<name>@<palette>` variant the
 * atlas has maps to the variant's first frame instead. Variants keep their sprite's frame count
 * and order, so the directional frames stay right.
 *
 * @param atlas - The atlas.
 * @param names - Sprite names by sprite id (`ContentDb.sprites.names`).
 * @param palette - The palette.
 * @returns `table[spriteId]` = first frame id to draw.
 *
 * @example
 * ```ts
 * tables.base = resolveBulletPaletteTable(atlas, db.sprites.names, 'deuteranopia');
 * ```
 */
export function resolveBulletPaletteTable(
  atlas: Atlas,
  names: readonly string[],
  palette: BulletPalette,
): Int32Array {
  const table = atlas.resolveSpriteTable(names);
  if (palette === 'standard') return table;
  for (let i = 0; i < names.length; i++) {
    const variant = atlas.spriteBase(bulletPaletteSpriteName(names[i], palette));
    if (variant >= 0) table[i] = variant;
  }
  return table;
}
