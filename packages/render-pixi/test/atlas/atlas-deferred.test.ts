/**
 * Tests for the deferred pages of plan R3-04: a page created with `null` draws nothing, and
 * `loadPage` / `unloadPage` move a page's frames between the page source and the empty texture
 * while every object identity (the `pages` entry, each frame `Texture`) is kept.
 */
import { Texture } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { createAtlas } from '../../src/atlas/index.js';
import { fakeImage, pageImages, testManifest } from '../helpers.js';

describe('render-pixi/atlas deferred pages', () => {
  it('creates page 1 unloaded: its frames point at the empty texture with a 0×0 frame', () => {
    const manifest = testManifest();
    const atlas = createAtlas(manifest, [fakeImage(64, 32), null]);
    expect(atlas.isPageLoaded(0)).toBe(true);
    expect(atlas.isPageLoaded(1)).toBe(false);
    expect(atlas.pages[1].resource).toBeNull();
    const tile = atlas.textures[atlas.frameId('bg/tile#0')];
    expect(tile.source).toBe(Texture.EMPTY.source);
    expect([tile.frame.x, tile.frame.y, tile.frame.width, tile.frame.height]).toEqual([0, 0, 0, 0]);
    // The zero frame means the quad has no area — nothing samples, nothing throws, no NaN vertex.
    for (const key of ['x0', 'y0', 'x1', 'y1', 'x2', 'y2', 'x3', 'y3'] as const) {
      expect(Number.isFinite(tile.uvs[key])).toBe(true);
    }
    // Loaded pages are untouched.
    const ship = atlas.textures[atlas.frameId('ships/a#1')];
    expect(ship.source).toBe(atlas.pages[0]);
    expect([ship.frame.x, ship.frame.width]).toEqual([16, 16]);
  });

  it('loadPage restores the manifest rectangles and the page source (same objects throughout)', () => {
    const manifest = testManifest();
    const atlas = createAtlas(manifest, [fakeImage(64, 32), null]);
    const page = atlas.pages[1];
    const tile = atlas.textures[atlas.frameId('bg/tile#0')];
    const image = fakeImage(32, 16);
    atlas.loadPage(1, image);
    expect(atlas.pages[1]).toBe(page);
    expect(atlas.textures[atlas.frameId('bg/tile#0')]).toBe(tile);
    expect(page.resource).toBe(image);
    expect([page.width, page.height]).toEqual([32, 16]);
    expect(tile.source).toBe(page);
    expect([tile.frame.x, tile.frame.y, tile.frame.width, tile.frame.height]).toEqual([
      0, 0, 16, 16,
    ]);
    expect(atlas.isPageLoaded(1)).toBe(true);
    // The per-frame geometry typed arrays never moved (they describe the manifest, not the GPU).
    const id = atlas.frameId('bg/tile#0');
    expect([atlas.frameWidth[id], atlas.frameHeight[id]]).toEqual([16, 16]);
  });

  it('unloadPage frees the image and re-blanks the frames; reload works', () => {
    const manifest = testManifest();
    const atlas = createAtlas(manifest, pageImages(manifest));
    const tile = atlas.textures[atlas.frameId('bg/tile#0')];
    expect(atlas.isPageLoaded(1)).toBe(true);
    atlas.unloadPage(1);
    expect(atlas.isPageLoaded(1)).toBe(false);
    expect(atlas.pages[1].resource).toBeNull();
    expect(tile.source).toBe(Texture.EMPTY.source);
    expect(tile.frame.width).toBe(0);
    atlas.loadPage(1, fakeImage(32, 16));
    expect(atlas.isPageLoaded(1)).toBe(true);
    expect(tile.source).toBe(atlas.pages[1]);
    expect([tile.frame.x, tile.frame.width, tile.frame.height]).toEqual([0, 16, 16]);
  });

  it('loadPage is idempotent for the image already set; unloadPage is idempotent', () => {
    const manifest = testManifest();
    const image = fakeImage(32, 16);
    const atlas = createAtlas(manifest, [fakeImage(64, 32), image]);
    expect(() => atlas.loadPage(1, image)).not.toThrow();
    atlas.unloadPage(1);
    atlas.unloadPage(1);
    expect(atlas.isPageLoaded(1)).toBe(false);
  });

  it('loadPage validates the index and the image size like the constructor', () => {
    const manifest = testManifest();
    const atlas = createAtlas(manifest, [fakeImage(64, 32), null]);
    expect(() => atlas.loadPage(2, fakeImage(32, 16))).toThrow(RangeError);
    expect(() => atlas.loadPage(2, fakeImage(32, 16))).toThrow(/no page 2/);
    expect(() => atlas.unloadPage(-1)).toThrow(/no page -1/);
    expect(() => atlas.isPageLoaded(5)).toThrow(RangeError);
    expect(() => atlas.loadPage(1, fakeImage(64, 32))).toThrow(
      /page main-1\.png is 64×32 but the manifest says 32×16 \(stale atlas\?\)/,
    );
  });

  it('a `null` image whose page lies keeps creation happy; frame ids resolve while unloaded', () => {
    const manifest = testManifest();
    const atlas = createAtlas(manifest, [null, null]);
    expect(atlas.size).toBe(25);
    expect(atlas.frameId('bg/tile#0')).toBe(0);
    expect(atlas.spriteBase('ships/a')).toBe(17);
    for (const p of [0, 1]) expect(atlas.isPageLoaded(p)).toBe(false);
    atlas.loadPage(0, fakeImage(64, 32));
    atlas.loadPage(1, fakeImage(32, 16));
    const ship = atlas.textures[atlas.frameId('ships/a#2')];
    expect(ship.source).toBe(atlas.pages[0]);
    expect([ship.frame.x, ship.frame.y, ship.frame.width]).toEqual([32, 0, 16]);
  });

  it('destroy() after an unload frees the sources and never touches the shared empty one', () => {
    const manifest = testManifest();
    const atlas = createAtlas(manifest, [fakeImage(64, 32), null]);
    atlas.loadPage(1, fakeImage(32, 16));
    atlas.unloadPage(1);
    expect(() => atlas.destroy()).not.toThrow();
    expect(atlas.pages[0].destroyed).toBe(true);
    expect(atlas.pages[1].destroyed).toBe(true);
    expect(Texture.EMPTY.source.destroyed).toBe(false);
    expect(Texture.WHITE.source.destroyed).toBe(false);
  });

  it('the image-count rule counts `null` slots too', () => {
    const manifest = testManifest();
    expect(() => createAtlas(manifest, [fakeImage(64, 32), null, fakeImage(32, 16)])).toThrow(
      RangeError,
    );
    expect(() => createAtlas(manifest, [fakeImage(64, 32)])).toThrow(/1 image\(s\)/);
  });
});
