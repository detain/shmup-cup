/**
 * Edge cases of the atlas module: page-size limits in both axes, how a page image's size is
 * read (decoded `naturalWidth` vs. canvas `width`), frames flush with a page edge or outside
 * it, empty and flash-less sprites, names that collide with `Object.prototype`, deterministic
 * frame ids whatever the manifest key order, partial fallbacks, and destroy().
 */
import { Texture } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import {
  MAX_ATLAS_SIZE,
  createAtlas,
  type AtlasManifest,
  type AtlasPageImage,
} from '../../src/atlas/index.js';
import { fakeImage, pageImages, testManifest } from '../helpers.js';

/** Collects warnings. */
function warnings() {
  const messages: string[] = [];
  return { messages, onWarning: (message: string) => messages.push(message) };
}

/**
 * A manifest with one page and the given frames / sprites (no fonts).
 *
 * @param w - Page width.
 * @param h - Page height.
 * @param frames - Frames by name.
 * @param sprites - Sprites by name.
 */
function onePage(
  w: number,
  h: number,
  frames: AtlasManifest['frames'] = {},
  sprites: AtlasManifest['sprites'] = {},
): AtlasManifest {
  return {
    formatVersion: 1,
    pages: [{ file: 'main.png', w, h }],
    frames,
    sprites,
    animations: {},
    fonts: {},
  };
}

/**
 * Reverses the insertion order of an object's keys.
 *
 * @param object - A plain object.
 */
function reversed<T>(object: { readonly [key: string]: T }): { [key: string]: T } {
  const out: { [key: string]: T } = {};
  for (const key of Object.keys(object).reverse()) out[key] = object[key];
  return out;
}

describe('render-pixi/atlas page validation (edge)', () => {
  it('accepts a page of exactly MAX_ATLAS_SIZE and rejects one pixel more in either axis', () => {
    const square = onePage(MAX_ATLAS_SIZE, MAX_ATLAS_SIZE);
    expect(createAtlas(square, pageImages(square)).pages).toHaveLength(1);
    const tall = onePage(64, MAX_ATLAS_SIZE + 1);
    expect(() => createAtlas(tall, pageImages(tall))).toThrow(/exceeds 2048/);
    const wide = onePage(MAX_ATLAS_SIZE + 1, 64);
    expect(() => createAtlas(wide, pageImages(wide))).toThrow(/exceeds 2048/);
  });

  it('reads a canvas / bitmap size from width × height when there is no naturalWidth', () => {
    const manifest = onePage(32, 16);
    const canvas = { width: 32, height: 16 } as unknown as AtlasPageImage;
    expect(createAtlas(manifest, [canvas]).pages).toHaveLength(1);
    const wrong = { width: 16, height: 32 } as unknown as AtlasPageImage;
    expect(() => createAtlas(manifest, [wrong])).toThrow(/16×32 .* 32×16/);
  });

  it('falls back to width × height for an image whose naturalWidth is 0 (not decoded)', () => {
    const manifest = onePage(32, 16);
    const undecoded = {
      width: 32,
      height: 16,
      naturalWidth: 0,
      naturalHeight: 0,
    } as unknown as AtlasPageImage;
    expect(() => createAtlas(manifest, [undecoded])).not.toThrow();
  });

  it('names the stale page and both sizes in the error', () => {
    const manifest = testManifest();
    expect(() => createAtlas(manifest, [fakeImage(64, 32), fakeImage(32, 8)])).toThrow(
      'atlas: page main-1.png is 32×8 but the manifest says 32×16 (stale atlas?)',
    );
  });

  it('rejects extra images as well as missing ones, and accepts an atlas with no pages', () => {
    const manifest = testManifest();
    expect(() => createAtlas(manifest, [...pageImages(manifest), fakeImage(1, 1)])).toThrow(
      /2 page\(s\) in the manifest but 3 image\(s\)/,
    );
    const empty = { ...onePage(1, 1), pages: [] };
    const atlas = createAtlas(empty, []);
    // Only the two stand-ins: ui/missing, then ui/pixel.
    expect([atlas.size, atlas.missingFrame, atlas.pixelFrame]).toEqual([2, 0, 1]);
    expect([atlas.frameWidth[0], atlas.frameHeight[1], atlas.anchorX[0]]).toEqual([1, 1, 0]);
  });

  it('uses one nearest-neighbour source per page without mipmaps', () => {
    const manifest = testManifest();
    const atlas = createAtlas(manifest, pageImages(manifest));
    for (const page of atlas.pages) {
      expect(page.scaleMode).toBe('nearest');
      expect(page.autoGenerateMipmaps).toBe(false);
    }
    expect(atlas.pages.map((page) => page.label)).toEqual(['atlas/main.png', 'atlas/main-1.png']);
  });
});

describe('render-pixi/atlas frames (edge)', () => {
  it('accepts a frame flush with the page edges; rejects negative origins and one pixel over', () => {
    const flush = onePage(16, 8, { 'a#0': { p: 0, x: 8, y: 4, w: 8, h: 4, ax: 0, ay: 0 } });
    expect(createAtlas(flush, pageImages(flush)).frameId('a#0')).toBe(0);
    for (const frame of [
      { p: 0, x: -1, y: 0, w: 2, h: 2, ax: 0, ay: 0 },
      { p: 0, x: 0, y: -1, w: 2, h: 2, ax: 0, ay: 0 },
      { p: 0, x: 9, y: 0, w: 8, h: 4, ax: 0, ay: 0 },
      { p: 0, x: 0, y: 5, w: 8, h: 4, ax: 0, ay: 0 },
    ]) {
      const bad = onePage(16, 8, { 'a#0': frame });
      expect(() => createAtlas(bad, pageImages(bad))).toThrow(/lies outside page main\.png/);
    }
  });

  it('assigns the same ids whatever order the manifest keys come in', () => {
    const manifest = testManifest();
    const shuffled: AtlasManifest = {
      ...manifest,
      frames: reversed(manifest.frames),
      sprites: reversed(manifest.sprites),
    };
    const a = createAtlas(manifest, pageImages(manifest));
    const b = createAtlas(shuffled, pageImages(shuffled));
    for (const name of Object.keys(manifest.frames)) expect(b.frameId(name)).toBe(a.frameId(name));
    expect([...b.framesLeft]).toEqual([...a.framesLeft]);
  });

  it('orders orphan frames (no sprite lists them) by name after every sprite frame', () => {
    const manifest = onePage(
      16,
      16,
      {
        'z#0': { p: 0, x: 0, y: 0, w: 1, h: 1, ax: 0, ay: 0 },
        'b#0': { p: 0, x: 1, y: 0, w: 1, h: 1, ax: 0, ay: 0 },
        's#0': { p: 0, x: 2, y: 0, w: 2, h: 3, ax: 1, ay: 2 },
      },
      { s: { frames: ['s#0'], flash: null } },
    );
    const atlas = createAtlas(manifest, pageImages(manifest));
    expect(['s#0', 'b#0', 'z#0'].map((name) => atlas.frameId(name))).toEqual([0, 1, 2]);
    expect([atlas.anchorX[0], atlas.anchorY[0], atlas.frameWidth[0], atlas.frameHeight[0]]).toEqual(
      [1, 2, 2, 3],
    );
  });

  it('keeps negative anchors (frames drawn right of / below their anchor point)', () => {
    const manifest = onePage(8, 8, { 'a#0': { p: 0, x: 0, y: 0, w: 4, h: 4, ax: -3, ay: -2 } });
    const atlas = createAtlas(manifest, pageImages(manifest));
    expect([atlas.anchorX[0], atlas.anchorY[0]]).toEqual([-3, -2]);
  });
});

describe('render-pixi/atlas name resolution (edge)', () => {
  it('draws a sprite with no frames as ui/missing (spriteBase -1) and warns about it', () => {
    const manifest = testManifest();
    const empty: AtlasManifest = {
      ...manifest,
      sprites: { ...manifest.sprites, 'fx/none': { frames: [], flash: null } },
    };
    const sink = warnings();
    const atlas = createAtlas(empty, pageImages(empty), sink);
    expect(atlas.spriteBase('fx/none')).toBe(-1);
    expect(atlas.resolveSpriteTable(['fx/none'])[0]).toBe(atlas.missingFrame);
    expect(sink.messages).toEqual(['atlas: unknown sprite "fx/none" — drawing ui/missing instead']);
  });

  it('maps a flash sibling that does not exist to the sprite itself', () => {
    const manifest = testManifest();
    const dangling: AtlasManifest = {
      ...manifest,
      sprites: { ...manifest.sprites, 'bg/tile': { frames: ['bg/tile#0'], flash: 'bg/gone' } },
    };
    const sink = warnings();
    const atlas = createAtlas(dangling, pageImages(dangling), sink);
    expect(atlas.resolveFlashTable(['bg/tile'])[0]).toBe(atlas.spriteBase('bg/tile'));
    expect(sink.messages).toEqual([]);
  });

  it('never resolves names inherited from Object.prototype', () => {
    const manifest = testManifest();
    const sink = warnings();
    const atlas = createAtlas(manifest, pageImages(manifest), sink);
    const names = ['toString', 'constructor', '__proto__', 'hasOwnProperty'];
    for (const name of names) expect(atlas.spriteBase(name)).toBe(-1);
    expect([...atlas.resolveSpriteTable(names)]).toEqual(names.map(() => atlas.missingFrame));
    expect([...atlas.resolveFlashTable(names)]).toEqual(names.map(() => atlas.missingFrame));
    expect(atlas.frameId('toString')).toBe(-1);
    expect(sink.messages).toHaveLength(names.length);
  });

  it('warns once per name across both tables and every later call', () => {
    const manifest = testManifest();
    const sink = warnings();
    const atlas = createAtlas(manifest, pageImages(manifest), sink);
    atlas.resolveSpriteTable(['ghost', 'wraith']);
    atlas.resolveFlashTable(['ghost', 'wraith', 'ghost']);
    atlas.resolveSpriteTable(['wraith']);
    expect(sink.messages).toHaveLength(2);
    expect(sink.messages[1]).toContain('"wraith"');
  });

  it('returns a fresh Int32Array per call, empty for an empty name table', () => {
    const manifest = testManifest();
    const atlas = createAtlas(manifest, pageImages(manifest));
    const empty = atlas.resolveSpriteTable([]);
    expect(empty).toBeInstanceOf(Int32Array);
    expect(empty).toHaveLength(0);
    const first = atlas.resolveSpriteTable(['ships/a']);
    const second = atlas.resolveSpriteTable(['ships/a']);
    expect(first).not.toBe(second);
    expect([...first]).toEqual([...second]);
  });

  it('adds only the missing stand-in when the manifest has ui/missing but no ui/pixel', () => {
    const manifest = testManifest();
    const frames: { [name: string]: AtlasManifest['frames'][string] } = { ...manifest.frames };
    const sprites: { [name: string]: AtlasManifest['sprites'][string] } = { ...manifest.sprites };
    delete frames['ui/pixel#0'];
    delete sprites['ui/pixel'];
    const partial: AtlasManifest = { ...manifest, frames, sprites };
    const atlas = createAtlas(partial, pageImages(partial));
    expect(atlas.size).toBe(Object.keys(frames).length + 1);
    expect(atlas.textures[atlas.missingFrame]).not.toBe(Texture.WHITE);
    expect(atlas.pixelFrame).toBe(atlas.size - 1);
    expect(atlas.textures[atlas.pixelFrame]).toBe(Texture.WHITE);
    expect([atlas.frameWidth[atlas.pixelFrame], atlas.framesLeft[atlas.pixelFrame]]).toEqual([
      1, 1,
    ]);
  });
});

describe('render-pixi/atlas destroy (edge)', () => {
  it('destroys every frame texture and every page source', () => {
    const manifest = testManifest();
    const atlas = createAtlas(manifest, pageImages(manifest));
    atlas.destroy();
    expect(atlas.textures.every((texture) => texture.destroyed)).toBe(true);
    expect(atlas.pages.every((page) => page.destroyed)).toBe(true);
    expect(Texture.WHITE.destroyed).toBe(false);
  });
});
