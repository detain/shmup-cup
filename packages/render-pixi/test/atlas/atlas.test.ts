/**
 * Tests for the atlas module: frame-id assignment (sprite frames consecutive), per-frame
 * geometry, `resolveSpriteTable` / `resolveFlashTable` (missing names → `ui/missing`, warned
 * once), fallbacks, manifest validation, and the real pipeline atlas.
 */
import { Texture } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import { buildAtlas } from '../../../../scripts/assets/pipeline.mjs';
import {
  MAX_ATLAS_SIZE,
  MISSING_SPRITE,
  PIXEL_SPRITE,
  createAtlas,
  moduleInfo,
  type AtlasManifest,
} from '../../src/atlas/index.js';
import { fakeImage, pageImages, testManifest } from '../helpers.js';

describe('render-pixi/atlas', () => {
  it('describes itself as implemented', () => {
    expect(moduleInfo.name).toBe('atlas');
    expect(moduleInfo.status).toBe('implemented');
    expect(MAX_ATLAS_SIZE).toBe(2048);
    expect([MISSING_SPRITE, PIXEL_SPRITE]).toEqual(['ui/missing', 'ui/pixel']);
  });

  it('assigns frame ids sprite by sprite (names sorted), frames of a sprite consecutive', () => {
    const manifest = testManifest();
    const atlas = createAtlas(manifest, pageImages(manifest));
    // bg/tile (1), font/pixel (16), ships/a (3), ships/a@flash (3), ui/missing, ui/pixel
    expect(atlas.size).toBe(25);
    expect(atlas.frameId('bg/tile#0')).toBe(0);
    expect(atlas.frameId('font/pixel#0')).toBe(1);
    expect(atlas.spriteBase('ships/a')).toBe(17);
    expect([1, 2].map((i) => atlas.frameId(`ships/a#${i}`))).toEqual([18, 19]);
    expect(atlas.spriteBase('ships/a@flash')).toBe(20);
    expect(atlas.missingFrame).toBe(23);
    expect(atlas.pixelFrame).toBe(24);
    expect(atlas.frameId('nope#0')).toBe(-1);
    expect(atlas.spriteBase('nope')).toBe(-1);
  });

  it('keeps per-frame geometry in typed arrays and the sprite frame count in framesLeft', () => {
    const manifest = testManifest();
    const atlas = createAtlas(manifest, pageImages(manifest));
    const ship = atlas.spriteBase('ships/a');
    expect([atlas.anchorX[ship], atlas.anchorY[ship]]).toEqual([8, 4]);
    expect([atlas.frameWidth[ship], atlas.frameHeight[ship]]).toEqual([16, 9]);
    expect([...atlas.framesLeft.subarray(ship, ship + 3)]).toEqual([3, 2, 1]);
    expect(atlas.framesLeft[atlas.missingFrame]).toBe(1);
  });

  it('builds one nearest-neighbour source per page and one texture per frame over it', () => {
    const manifest = testManifest();
    const atlas = createAtlas(manifest, pageImages(manifest));
    expect(atlas.pages).toHaveLength(2);
    for (const page of atlas.pages) expect(page.scaleMode).toBe('nearest');
    const tile = atlas.textures[atlas.frameId('bg/tile#0')];
    expect(tile?.source).toBe(atlas.pages[1]);
    const ship1 = atlas.textures[atlas.frameId('ships/a#1')];
    expect(ship1?.source).toBe(atlas.pages[0]);
    expect([ship1?.frame.x, ship1?.frame.y, ship1?.frame.width, ship1?.frame.height]).toEqual([
      16, 0, 16, 9,
    ]);
  });

  it('resolves sprite name tables; unknown names draw ui/missing and warn once each', () => {
    const manifest = testManifest();
    const warnings: string[] = [];
    const atlas = createAtlas(manifest, pageImages(manifest), {
      onWarning: (message) => warnings.push(message),
    });
    const names = ['ships/a', 'nope', 'bg/tile', 'nope'];
    expect([...atlas.resolveSpriteTable(names)]).toEqual([17, atlas.missingFrame, 0, 23]);
    atlas.resolveSpriteTable(['nope']);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('"nope"');
  });

  it('resolves the flash table to the @flash siblings (sprites without one map to themselves)', () => {
    const manifest = testManifest();
    const atlas = createAtlas(manifest, pageImages(manifest), { onWarning: () => {} });
    expect([...atlas.resolveFlashTable(['ships/a', 'bg/tile', 'nope'])]).toEqual([
      20,
      0,
      atlas.missingFrame,
    ]);
  });

  it('warns through console.warn by default', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const manifest = testManifest();
    createAtlas(manifest, pageImages(manifest)).resolveSpriteTable(['ghost']);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('falls back to a white 1×1 texture when ui/missing or ui/pixel are absent', () => {
    const manifest = testManifest({ withFallbacks: false });
    const atlas = createAtlas(manifest, pageImages(manifest), { onWarning: () => {} });
    expect(atlas.size).toBe(25);
    expect(atlas.textures[atlas.missingFrame]).toBe(Texture.WHITE);
    expect(atlas.textures[atlas.pixelFrame]).toBe(Texture.WHITE);
    expect(atlas.missingFrame).not.toBe(atlas.pixelFrame);
    expect(atlas.resolveSpriteTable(['nope'])[0]).toBe(atlas.missingFrame);
  });

  it('rejects a page count mismatch, oversized pages and stale images', () => {
    const manifest = testManifest();
    expect(() => createAtlas(manifest, [fakeImage(64, 32)])).toThrow(RangeError);
    expect(() => createAtlas(manifest, [fakeImage(64, 32), fakeImage(32, 32)])).toThrow(
      /stale atlas/,
    );
    const huge: AtlasManifest = {
      ...manifest,
      pages: [{ file: 'main.png', w: 4096, h: 32 }, manifest.pages[1]],
    };
    expect(() => createAtlas(huge, pageImages(huge))).toThrow(/exceeds 2048/);
  });

  it('rejects frames outside their page, on a missing page, or listed twice / not at all', () => {
    const manifest = testManifest();
    const outside: AtlasManifest = {
      ...manifest,
      frames: {
        ...manifest.frames,
        'bg/tile#0': { p: 1, x: 20, y: 0, w: 16, h: 16, ax: 0, ay: 0 },
      },
    };
    expect(() => createAtlas(outside, pageImages(outside))).toThrow(/outside page/);
    const noPage: AtlasManifest = {
      ...manifest,
      frames: { ...manifest.frames, 'bg/tile#0': { p: 5, x: 0, y: 0, w: 1, h: 1, ax: 0, ay: 0 } },
    };
    expect(() => createAtlas(noPage, pageImages(noPage))).toThrow(/page 5/);
    const twice: AtlasManifest = {
      ...manifest,
      sprites: { ...manifest.sprites, 'bg/copy': { frames: ['bg/tile#0'], flash: null } },
    };
    expect(() => createAtlas(twice, pageImages(twice))).toThrow(/more than one sprite/);
    const dangling: AtlasManifest = {
      ...manifest,
      sprites: { ...manifest.sprites, 'bg/ghost': { frames: ['bg/ghost#0'], flash: null } },
    };
    expect(() => createAtlas(dangling, pageImages(dangling))).toThrow(/does not exist/);
  });

  it('gives frames no sprite lists their own ids after the sprites', () => {
    const manifest = testManifest();
    const orphan: AtlasManifest = {
      ...manifest,
      frames: { ...manifest.frames, 'loose#0': { p: 0, x: 60, y: 30, w: 2, h: 2, ax: 1, ay: 1 } },
    };
    const atlas = createAtlas(orphan, pageImages(orphan));
    expect(atlas.frameId('loose#0')).toBe(25);
    expect(atlas.framesLeft[25]).toBe(1);
  });

  it('destroy() releases frame textures and page sources but never the shared white texture', () => {
    const manifest = testManifest({ withFallbacks: false });
    const atlas = createAtlas(manifest, pageImages(manifest), { onWarning: () => {} });
    const first = atlas.textures[0];
    atlas.destroy();
    expect(first.destroyed).toBe(true);
    expect(Texture.WHITE.destroyed).toBe(false);
  });

  it('accepts the real pipeline atlas: every sprite resolves, frames consecutive, fonts present', () => {
    const { manifest } = buildAtlas();
    const atlas = createAtlas(manifest, pageImages(manifest));
    const names = Object.keys(manifest.sprites);
    const table = atlas.resolveSpriteTable(names);
    names.forEach((name, i) => {
      const base = table[i];
      const frames = manifest.sprites[name].frames;
      expect(atlas.framesLeft[base]).toBe(frames.length);
      frames.forEach((frameName, f) => expect(atlas.frameId(frameName)).toBe(base + f));
    });
    expect(atlas.textures[atlas.missingFrame]).not.toBe(Texture.WHITE);
    expect(atlas.frameWidth[atlas.pixelFrame]).toBe(1);
  });
});
