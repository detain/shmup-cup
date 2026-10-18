/**
 * The interim art stage in the asset pipeline (plan_resolution.md R2-01, decisions W4-4 … W4-6):
 * `buildAtlas({ artScale: 1.5 })` against `buildAtlas({ artScale: 1 })`, both built in memory.
 *
 * - The same sprite names, frame counts, animations and atlas groups at both scales (sprite ids,
 *   `atlas-groups.json` and the goldens' view of the atlas never move).
 * - Every frame of a v1-scale source `⌈1.5·w⌉ × ⌈1.5·h⌉`, its pixels the nearest-neighbour
 *   upscale, an explicit anchor `⌈1.5·a⌉`, a default one the centre of the scaled frame 0.
 * - What is never upscaled (W4-5): the terrain tilesets come out 12 × 12 — drawn by `terrain.mjs`
 *   at that size, their opaque pixels every shipped mask resampled to 12 — `ui/pixel` stays 1 × 1,
 *   a real-art PNG override keeps its size and its sidecar anchor, a `"native": true` map its size.
 * - The interim font (W4-4): 9 × 12 cells, a 15-px line, a 9-px advance.
 * - The budget: every page within 2048², the PNG bytes under the atlas cap.
 * - The guard: at scale 1 the stage is a no-op — the v1 atlas, pinned by digest, at either frame.
 *
 * Nothing here depends on the frame: both scales are asked for explicitly, so the file passes
 * unchanged before and after R2-01's flip (only the default scale moves).
 */
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { createImage, getPixel, setPixel, type Image } from '../../../scripts/assets/image.mjs';
import { INTERIM_ART_SCALE, scaleImage } from '../../../scripts/assets/interim.mjs';
import { formatManifest } from '../../../scripts/assets/manifest.mjs';
import { DEFAULT_SOURCE_DIR, buildAtlas } from '../../../scripts/assets/pipeline.mjs';
import { encodePng } from '../../../scripts/assets/png.mjs';
import { generateProceduralSprites } from '../../../scripts/assets/procedural/index.mjs';
import { TERRAIN_PALETTES, resampleMask } from '../../../scripts/assets/procedural/terrain.mjs';
import { loadSpriteSources, type SpriteDef } from '../../../scripts/assets/sprite-source.mjs';
import { ATLAS_PNG_BYTES_CAP } from './atlas-budget.js';

/** The atlas page limit (the packer's `MAX_PAGE_SIZE`). */
const MAX_PAGE = 2048;

/** The v1 art: the stage does nothing (W4-6's consumers keep it). */
const v1 = buildAtlas({ artScale: 1 });

/** The interim ×1.5 art (the shipped atlas from R2-01's flip on). */
const v2 = buildAtlas({ artScale: 1.5 });

const tmp = mkdtempSync(join(tmpdir(), 'shmup-interim-pipeline-'));
afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

/** A built atlas. */
type Atlas = ReturnType<typeof buildAtlas>;

/**
 * The pixels of one atlas frame, cut out of its page.
 *
 * @param atlas - The atlas.
 * @param name - Frame name (`<sprite>#<i>`).
 * @returns The frame's pixels.
 */
function framePixels(atlas: Atlas, name: string): Image {
  const f = atlas.manifest.frames[name];
  const page = atlas.pages[f.p].image;
  const out = createImage(f.w, f.h);
  for (let y = 0; y < f.h; y++) {
    for (let x = 0; x < f.w; x++) setPixel(out, x, y, getPixel(page, f.x + x, f.y + y));
  }
  return out;
}

/**
 * Lower-case hex of an image's bytes (a fast exact comparison for `toBe`).
 *
 * @param image - The image.
 * @returns `<w>x<h>:<hex>`.
 */
const hex = (image: Image): string =>
  `${image.width}x${image.height}:${Buffer.from(image.data).toString('hex')}`;

/** The sprites whose frames are drawn at their v2 size already (native, W4-5), by name. */
const NATIVE = new Set(v2.sprites.filter((s) => s.native === true).map((s) => s.name));

/** The sources' own anchors (`null` = the default centre), by sprite name. */
const SOURCE_ANCHORS = new Map<string, [number, number] | null>(
  [
    ...loadSpriteSources(join(DEFAULT_SOURCE_DIR, 'sprites'), 'sprites').sprites,
    ...generateProceduralSprites(),
  ].map((sprite: SpriteDef) => [sprite.name, sprite.anchor]),
);

/**
 * The source anchor of a sprite or of the sprite a generated sibling (`@flash`, `@p2`) copies.
 *
 * @param name - Sprite name.
 * @returns The anchor (`null` = default), or `undefined` for a font.
 */
function sourceAnchor(name: string): [number, number] | null | undefined {
  if (SOURCE_ANCHORS.has(name)) return SOURCE_ANCHORS.get(name);
  const at = name.lastIndexOf('@');
  return at < 0 ? undefined : SOURCE_ANCHORS.get(name.slice(0, at));
}

describe('scripts/assets/pipeline — the interim ×1.5 stage keeps the atlas’s shape (R2-01)', () => {
  it('has the same sprites, frame counts, animations and groups at both scales', () => {
    expect(Object.keys(v2.manifest.sprites)).toEqual(Object.keys(v1.manifest.sprites));
    for (const [name, sprite] of Object.entries(v1.manifest.sprites)) {
      expect(v2.manifest.sprites[name], name).toEqual(sprite);
    }
    expect(Object.keys(v2.manifest.frames).sort()).toEqual(Object.keys(v1.manifest.frames).sort());
    expect(v2.manifest.animations).toEqual(v1.manifest.animations);
    expect(v2.sprites.map((s) => [s.name, s.group])).toEqual(
      v1.sprites.map((s) => [s.name, s.group]),
    );
    expect(v2.manifest.pages.map((p) => p.group)).toEqual(v1.manifest.pages.map((p) => p.group));
  });

  it('upscales every v1-scale frame to ⌈1.5·w⌉ × ⌈1.5·h⌉, nearest-neighbour', () => {
    let scaled = 0;
    for (const sprite of v1.sprites) {
      if (NATIVE.has(sprite.name)) continue;
      for (const frame of v1.manifest.sprites[sprite.name].frames) {
        const a = v1.manifest.frames[frame];
        const b = v2.manifest.frames[frame];
        expect([b.w, b.h], frame).toEqual([Math.ceil(1.5 * a.w), Math.ceil(1.5 * a.h)]);
        scaled++;
      }
    }
    expect(scaled).toBeGreaterThan(1000);
    for (const frame of ['ships/kestrel#0', 'enemies/drifter#0', 'ui/logo#0', 'font/pixel#33']) {
      expect(hex(framePixels(v2, frame)), frame).toBe(hex(scaleImage(framePixels(v1, frame), 1.5)));
    }
  });

  it('scales an explicit anchor ⌈1.5·a⌉ and centres a default one on the scaled frame', () => {
    let explicit = 0;
    for (const sprite of v2.sprites) {
      if (NATIVE.has(sprite.name)) continue;
      const frame = v2.manifest.frames[`${sprite.name}#0`];
      const source = sourceAnchor(sprite.name);
      const expected =
        source === undefined
          ? [0, 0] // a font: the cell's top-left
          : source === null
            ? [Math.floor(frame.w / 2), Math.floor(frame.h / 2)]
            : [Math.ceil(1.5 * source[0]), Math.ceil(1.5 * source[1])];
      if (source !== null && source !== undefined) explicit++;
      expect([frame.ax, frame.ay], sprite.name).toEqual(expected);
    }
    expect(explicit).toBeGreaterThan(10);
  });
});

describe('scripts/assets/pipeline — what the interim stage never upscales (W4-5)', () => {
  it('marks exactly the terrain tilesets and ui/pixel native', () => {
    expect([...NATIVE].sort()).toEqual([...Object.keys(TERRAIN_PALETTES), 'ui/pixel'].sort());
  });

  it('draws the terrain tiles at 12 px (8 px for the v1 art), masks resampled from the content', () => {
    const tilesets = fileURLToPath(new URL('../../../content/tilesets', import.meta.url));
    let checked = 0;
    for (const file of readdirSync(tilesets).filter((f) => f.endsWith('.tileset.json'))) {
      const tileset = JSON.parse(readFileSync(join(tilesets, file), 'utf8')) as {
        sprite: string;
        tileSize: number;
        tiles: { name: string; type: string; frame: number; anchor: string; mask: number[] }[];
      };
      for (const tile of tileset.tiles) {
        const name = `${tileset.sprite}#${tile.frame}`;
        expect([v1.manifest.frames[name].w, v1.manifest.frames[name].h], name).toEqual([8, 8]);
        const frame = framePixels(v2, name);
        expect([frame.width, frame.height], name).toEqual([12, 12]);
        if (tile.type === 'empty') continue; // decoration: its frame need not match a mask
        const heights: number[] = [];
        for (let x = 0; x < 12; x++) {
          let h = 0;
          const row = (k: number) => (tile.anchor === 'floor' ? 11 - k : k);
          while (h < 12 && getPixel(frame, x, row(h))[3] > 0) h++;
          heights.push(h);
        }
        expect(heights, `${file} ${tile.name}`).toEqual(
          resampleMask(tile.mask, tileset.tileSize, 12),
        );
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(100);
  });

  it('keeps ui/pixel one opaque white texel', () => {
    const f = v2.manifest.frames['ui/pixel#0'];
    expect([f.w, f.h, f.ax, f.ay]).toEqual([1, 1, 0, 0]);
    expect(getPixel(v2.pages[f.p].image, f.x, f.y)).toEqual([255, 255, 255, 255]);
  });

  it('never scales a real-art PNG override (its sidecar anchor kept) nor a native map', () => {
    const sourceDir = join(tmp, 'override');
    cpSync(DEFAULT_SOURCE_DIR, sourceDir, { recursive: true });
    const sprites = join(sourceDir, 'sprites');
    // A 20 × 10 v2-native frame 0 for the KESTREL, pivot (9, 4) — frames 1… stay code-drawn.
    const art = createImage(20, 10);
    for (let y = 0; y < 10; y++)
      for (let x = 0; x < 20; x++) setPixel(art, x, y, [200, 40, 9, 255]);
    writeFileSync(join(sprites, 'ships', 'kestrel.png'), encodePng(art));
    writeFileSync(
      join(sprites, 'ships', 'kestrel.json'),
      JSON.stringify({
        frames: [{ frame: { x: 0, y: 0, w: 20, h: 10 } }],
        meta: {
          slices: [{ keys: [{ bounds: { x: 0, y: 0, w: 20, h: 10 }, pivot: { x: 9, y: 4 } }] }],
        },
      }),
    );
    // A PNG-only sprite and a native pixel map, both new.
    mkdirSync(join(sprites, 'items', 'v2'), { recursive: true });
    writeFileSync(join(sprites, 'items', 'v2', 'gem.png'), encodePng(createImage(7, 5)));
    writeFileSync(
      join(sprites, 'items', 'v2', 'chip.sprite.json'),
      JSON.stringify({
        name: 'items/v2/chip',
        palette: { x: '#fff' },
        native: true,
        frames: [{ rows: ['xxx', 'xxx'] }],
      }),
    );
    const built = buildAtlas({ sourceDir, artScale: 1.5 });
    const kestrel = built.manifest.sprites['ships/kestrel'].frames;
    const first = built.manifest.frames[kestrel[0]];
    expect([first.w, first.h, first.ax, first.ay]).toEqual([20, 10, 9, 4]);
    expect(hex(framePixels(built, kestrel[0]))).toBe(hex(art));
    // The code-drawn frames beside it are upscaled; player 2's swap follows frame 0 unscaled.
    expect(built.manifest.frames[kestrel[1]].w).toBe(v2.manifest.frames[kestrel[1]].w);
    expect(built.manifest.frames['ships/kestrel@p2#0'].w).toBe(20);
    const gem = built.manifest.frames['items/v2/gem#0'];
    expect([gem.w, gem.h]).toEqual([7, 5]);
    const chip = built.manifest.frames['items/v2/chip#0'];
    expect([chip.w, chip.h]).toEqual([3, 2]);
  });
});

describe('scripts/assets/pipeline — the interim font (W4-4)', () => {
  it('is the shipped font at 9 × 12, a 15-px line and a 9-px advance', () => {
    const font = v2.manifest.fonts.pixel;
    expect([font.cellWidth, font.cellHeight, font.lineHeight]).toEqual([9, 12, 15]);
    expect(Object.keys(font.glyphs)).toEqual(Object.keys(v1.manifest.fonts.pixel.glyphs));
    for (const [code, glyph] of Object.entries(font.glyphs)) {
      expect(glyph.advance, code).toBe(9);
      expect(glyph.frame).toBe(v1.manifest.fonts.pixel.glyphs[code].frame);
      expect(v2.manifest.frames[glyph.frame]).toMatchObject({ w: 9, h: 12, ax: 0, ay: 0 });
    }
  });
});

describe('scripts/assets/pipeline — the interim atlas stays inside the budget (R2-01)', () => {
  it('keeps every page within 2048² and its PNG bytes under the atlas cap', () => {
    for (const page of v2.manifest.pages) {
      expect(page.w, page.file).toBeLessThanOrEqual(MAX_PAGE);
      expect(page.h, page.file).toBeLessThanOrEqual(MAX_PAGE);
    }
    const bytes = v2.pages.reduce((sum, page) => sum + page.png.length, 0);
    expect(bytes).toBeLessThan(ATLAS_PNG_BYTES_CAP);
  });
});

describe('scripts/assets/pipeline — scale 1 is the v1 atlas, at either frame (R2-01 guard)', () => {
  it('builds the default scale unless asked for another', () => {
    expect([1, 1.5]).toContain(INTERIM_ART_SCALE);
    const scale = INTERIM_ART_SCALE === 1 ? v1 : v2;
    expect(buildAtlas().manifest.pages).toEqual(scale.manifest.pages);
  });

  it('pins the v1 atlas: every page’s pixels and the manifest, by digest', () => {
    // Pinned when R2-01 landed the stage (the atlas `pnpm assets` wrote before it, byte for byte).
    // Only an edit of the v1 sprite sources or generators may move it — or a real-art PNG override,
    // a `native` source or a v2 font file landing in `assets/source/` (R3, R4-03): overrides and
    // native sources pass through unscaled at every scale, so they put v2-size frames into the
    // scale-1 build too. Then re-pin and say why; never the interim stage, the art scale's default
    // or the frame.
    const hash = createHash('sha256');
    for (const page of v1.pages) {
      hash.update(`${page.file} ${page.image.width}x${page.image.height}\0`);
      hash.update(page.image.data);
    }
    hash.update(formatManifest(v1.manifest));
    expect(hash.digest('hex')).toBe(
      'fa419802e39c229a2f1166b5c0621901d7e4eca2433e405416378bee7c447f54',
    );
  });
});
