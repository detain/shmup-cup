/**
 * The zone F placeholder art of plan M2-13 (`scripts/assets/procedural/vault.mjs` and the zone
 * tilesets of `terrain.mjs`, split out of `procedural-zones-fg.test.ts` by R5-P.P5c; the pair's
 * shared tileset check stayed with the earlier zone): every zone F sprite drawn in its documented
 * order, size and frame count, with hit flashes on everything that can be hit (not on the regent's
 * tail fin — decoration); the cell wall painted only in the ramp zone F's palette cycle names,
 * repeating across and down; the fold band repeating along x; animated frames that differ; every
 * hurtbox of the roster inside the sprite drawn for it. Zone G's art is in
 * `procedural-zone-g.test.ts`.
 *
 * @module
 */
import { describe, expect, it } from 'vitest';
import { getPixel } from '../../../scripts/assets/image.mjs';
import * as terrain from '../../../scripts/assets/procedural/terrain.mjs';
import * as vault from '../../../scripts/assets/procedural/vault.mjs';
import {
  byName,
  content,
  framesDiffer,
  hurtboxesInside,
  opaqueColours,
  seam,
  wraps,
} from './procedural-zone-helpers.js';

/**
 * The zone F boxes W5-3 allows 1 px outside their art: entries whose half-extent is odd, so the
 * port's ×1.5 lands on a `.5` that the rescale tool rounds up (owner decision O4) — a radius of
 * 5 becomes 8, a 16×16 box against the interim segment's 15×15 frame. Exactly the entries
 * `docs/v2-run/helpers/w5pre/hurtbox.mjs` counts for zone F (six). A box not named here must sit
 * inside the frame at both scales; a named box may exceed it by at most the one rounded pixel.
 */
const ZONE_F_ROUNDED_BOXES: ReadonlySet<string> = new Set([
  'seg-top-1',
  'seg-top-2',
  'seg-top-3',
  'seg-bottom-1',
  'seg-bottom-2',
  'seg-bottom-3',
]);

describe('scripts/assets/procedural/vault (M2-13)', () => {
  const sprites = vault.generate();

  it('draws the zone F sprites in the documented order, hit flashes on everything that is hit', () => {
    expect(sprites.map((s) => s.name)).toEqual([...vault.VAULT_SPRITES]);
    for (const sprite of sprites) {
      const decoration = sprite.name.startsWith('bg/') || sprite.name === 'bosses/regent-fin';
      expect(sprite.hitFlash, sprite.name).toBe(!decoration);
      expect(sprite.origin).toBe('procedural:vault');
      const [first, ...rest] = sprite.frames;
      for (const frame of rest)
        expect([frame.width, frame.height]).toEqual([first.width, first.height]);
    }
    expect(byName(sprites, 'enemies/chaser-cell').animations).toEqual({ wobble: [0, 1] });
    expect(byName(sprites, 'bosses/regent-eye').animations).toEqual({ dilate: [0, 1] });
    expect(byName(sprites, 'bosses/regent-mantle').frames[0].width).toBe(60);
    framesDiffer(sprites);
    hurtboxesInside('enemies/zone-f.enemies.json', ZONE_F_ROUNDED_BOXES);
  });

  it('paints the cell wall only in the four ramp colours zone F cycles, repeating both ways', () => {
    const wall = byName(sprites, 'bg/vault-membrane');
    expect(wall.anchor).toEqual([0, 0]);
    const image = wall.frames[0];
    expect([image.width, image.height]).toEqual([vault.MEMBRANE_TILE_W, vault.MEMBRANE_TILE_H]);
    expect([...opaqueColours(image)].sort()).toEqual([...vault.VAULT_RAMP].sort());
    for (let i = 3; i < image.data.length; i += 4) expect(image.data[i]).toBe(255);
    expect(wraps(image)).toBeGreaterThan(0.9);
    const stage = content<{ cycles: { colors: string[] }[] }>('stages/zone-f.stage.json');
    expect(stage.cycles[0].colors).toEqual([...vault.VAULT_RAMP_V2]);
  });

  it('draws fleshy folds with a rim, opaque at the bottom and repeating along x', () => {
    const image = byName(sprites, 'bg/vault-folds').frames[0];
    expect([image.width, image.height]).toEqual([vault.FOLDS_TILE_W, vault.FOLDS_TILE_H]);
    expect(seam(image)).toBeLessThan(24);
    for (let x = 0; x < image.width; x++) expect(getPixel(image, x, image.height - 1)[3]).toBe(255);
    expect(getPixel(image, 0, 0)[3]).toBe(0); // open above the folds
    expect(opaqueColours(image).has('#6a8a70')).toBe(true); // the rim
  });

  it('is deterministic', () => {
    expect(vault.generate().map((s) => Array.from(s.frames[0].data).join())).toEqual(
      sprites.map((s) => Array.from(s.frames[0].data).join()),
    );
  });
});

describe('scripts/assets/procedural/terrain — the zone F and G tilesets (M2-13)', () => {
  it('draws CELL VAULT’s flesh and PRISM LABYRINTH’s crystal rock in their own colours', () => {
    const sets = terrain.generate();
    const floor = terrain.TERRAIN_TILES.indexOf('floor');
    for (const name of ['tiles/terrain-vault', 'tiles/terrain-prism']) {
      const set = byName(sets, name);
      const palette = terrain.TERRAIN_PALETTES[name];
      expect(opaqueColours(set.frames[floor]).has(palette.surface), name).toBe(true);
      expect(set.frames).toHaveLength(byName(sets, 'tiles/terrain-a').frames.length);
    }
    for (const id of ['vault', 'prism']) {
      const tileset = content<{ id: string; sprite: string }>(
        `tilesets/terrain-${id}.tileset.json`,
      );
      expect(tileset.sprite).toBe(`tiles/terrain-${id}`);
    }
  });
});
