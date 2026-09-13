/**
 * The colour-blind bullet palettes of plan M2-02 (render-pixi `palette`): variant sprite names and
 * the palette-aware sprite table (variants replace their sprite's frames; sprites without one keep
 * theirs; unknown names still draw `ui/missing`).
 */
import { BULLET_PALETTES } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { createAtlas, type AtlasManifest } from '../../src/atlas/index.js';
import {
  BULLET_PALETTE_SUFFIX,
  bulletPaletteSpriteName,
  resolveBulletPaletteTable,
} from '../../src/palette/index.js';
import { pageImages, testManifest } from '../helpers.js';

/**
 * The test manifest plus a `ships/a@tritanopia` variant (3 frames).
 *
 * @returns The manifest.
 */
function manifestWithVariant(): AtlasManifest {
  const base = testManifest();
  const frames = { ...base.frames };
  const names: string[] = [];
  for (let i = 0; i < 3; i++) {
    const name = `ships/a@tritanopia#${i}`;
    frames[name] = { p: 0, x: 16 * i, y: 10, w: 16, h: 9, ax: 8, ay: 4 };
    names.push(name);
  }
  return {
    ...base,
    frames,
    sprites: { ...base.sprites, 'ships/a@tritanopia': { frames: names, flash: null } },
  };
}

describe('render-pixi/palette bullet palettes (M2-02)', () => {
  it('names a sprite’s variant `<name>@<palette>`, the standard palette the plain name', () => {
    expect(BULLET_PALETTE_SUFFIX).toBe('@');
    expect(bulletPaletteSpriteName('bullets/oval-red', 'standard')).toBe('bullets/oval-red');
    expect(bulletPaletteSpriteName('bullets/oval-red', 'deuteranopia')).toBe(
      'bullets/oval-red@deuteranopia',
    );
    expect(BULLET_PALETTES).toEqual(['standard', 'deuteranopia', 'protanopia', 'tritanopia']);
  });

  it('resolves the variants in place of their sprites and keeps the rest', () => {
    const manifest = manifestWithVariant();
    const warnings: string[] = [];
    const atlas = createAtlas(manifest, pageImages(manifest), {
      onWarning: (m) => warnings.push(m),
    });
    const names = ['ships/a', 'bg/tile', 'nope/none'];
    const standard = resolveBulletPaletteTable(atlas, names, 'standard');
    expect([...standard]).toEqual([
      atlas.spriteBase('ships/a'),
      atlas.spriteBase('bg/tile'),
      atlas.missingFrame,
    ]);
    const trit = resolveBulletPaletteTable(atlas, names, 'tritanopia');
    expect([...trit]).toEqual([
      atlas.spriteBase('ships/a@tritanopia'),
      atlas.spriteBase('bg/tile'),
      atlas.missingFrame,
    ]);
    expect(atlas.framesLeft[trit[0]]).toBe(3); // same frame count: directional frames stay right
    // No deuteranopia variant: everything keeps its frames.
    expect([...resolveBulletPaletteTable(atlas, names, 'deuteranopia')]).toEqual([...standard]);
    expect(warnings.length).toBeGreaterThan(0); // the unknown name, warned once
  });
});
