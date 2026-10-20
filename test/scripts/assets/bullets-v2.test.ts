/**
 * R3-03.V1: the native v2 bullet art (the art bible v2 §5.4). The `artScale !== 1` path of
 * `bullets.mjs` draws round 11×11 (1 frame), oval 13×13 and needle 17×17 (8 headings) and the
 * bending laser's node 11×11 — all marked `native`, so the interim stage never scales them —
 * with every colour-blind `@<palette>` variant frame for frame and the `ring` / `dot` core marks
 * grown to the v2 core size (a five-pixel plus where v1 used the centre pixel alone). At art
 * scale 1 everything stays the v1 pixel map: the same sizes (7 / 9 / 11 / 7), no `native` marks,
 * and `buildAtlas({ artScale: 1 })` keeps the v1 frames (the digest pin in
 * `interim-pipeline.test.ts` proves the v1 atlas byte for byte).
 *
 * The direction rule holds at the v2 sizes too: frame `k` points `k · 22.5°` clockwise from +x
 * (y down) — frame 0 wider than tall, frame 4 taller than wide, frame 2 square — and frame
 * `k + 4` is the **exact** 90° turn of frame `k`, pixel for pixel.
 */
import { describe, expect, it } from 'vitest';
import {
  createImage,
  getPixel,
  imagesEqual,
  setPixel,
  type Image,
} from '../../../scripts/assets/image.mjs';
import { buildAtlas } from '../../../scripts/assets/pipeline.mjs';
import { color, mix } from '../../../scripts/assets/procedural/common.mjs';
import * as bullets from '../../../scripts/assets/procedural/bullets.mjs';
import {
  BEAM_HEIGHT,
  BEAM_WIDTH,
  BEND_SIZE,
  BEND_SIZE_V2,
} from '../../../scripts/assets/procedural/lasers.mjs';
import * as lasers from '../../../scripts/assets/procedural/lasers.mjs';
import {
  BULLET_PALETTES,
  CORE_MARKS,
  generate as generatePalettes,
} from '../../../scripts/assets/procedural/palettes.mjs';
import type { SpriteDef } from '../../../scripts/assets/sprite-source.mjs';

const COLOURS = Object.keys(bullets.BULLET_COLORS);
const SUFFIXES = ['', ...Object.keys(BULLET_PALETTES).map((p) => `@${p}`)];

/** The v2 (3/2) bullets — the shipped path of the generator. */
const v2 = bullets.generate({ artScale: 1.5 });

/** Key of a colour for set comparisons. */
const key = (rgba: readonly number[]): string => rgba.join(',');

/** Brightness of a colour (channel sum — orders the rim / body / core bands). */
const luma = (rgba: readonly number[]): number => rgba[0] + rgba[1] + rgba[2];

/**
 * The three band colours of a body colour — the same arithmetic `bulletSprites` /
 * `laserSprites` use (mix with black / white).
 *
 * @param hex - Body colour (`#rrggbb`).
 * @returns The rim, body and core colours, keyed.
 */
function bandsOf(hex: string): { rim: string; body: string; core: string } {
  const base = color(hex);
  return {
    rim: key(mix(base, color('#000000'), 0.68)),
    body: key(base),
    core: key(mix(base, color('#ffffff'), 0.75)),
  };
}

/**
 * Rotates a square image 90° clockwise on screen (y down): `out(x, y) = in(y, N − 1 − x)` —
 * the frame `k` → `k + 4` turn of the 8-direction rule.
 *
 * @param image - The frame.
 * @returns A new, rotated frame.
 */
function rot90cw(image: Image): Image {
  const n = image.width;
  const out = createImage(n, n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) setPixel(out, x, y, getPixel(image, y, n - 1 - x));
  }
  return out;
}

/**
 * The bounding box of a frame's opaque pixels.
 *
 * @param image - The frame.
 * @returns `[width, height]` of the box.
 */
function bbox(image: Image): [number, number] {
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      if (getPixel(image, x, y)[3] === 0) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return [x1 - x0 + 1, y1 - y0 + 1];
}

/**
 * Counts the pixels of one colour in every frame of a sprite.
 *
 * @param sprite - The sprite.
 * @param colour - The keyed colour.
 * @returns The pixel count.
 */
function countColour(sprite: SpriteDef, colour: string): number {
  let n = 0;
  for (const frame of sprite.frames) {
    for (let y = 0; y < frame.height; y++) {
      for (let x = 0; x < frame.width; x++) if (key(getPixel(frame, x, y)) === colour) n++;
    }
  }
  return n;
}

/**
 * Finds a sprite by name.
 *
 * @param set - The sprites.
 * @param name - The sprite name.
 * @returns The sprite.
 * @throws {Error} When the set lacks the name (a broken expectation).
 */
function find(set: SpriteDef[], name: string): SpriteDef {
  const sprite = set.find((s) => s.name === name);
  if (sprite === undefined) throw new Error(`no sprite ${name}`);
  return sprite;
}

/**
 * Compares two frames up to the band-colour swap (a palette variant against its standard).
 *
 * @param standard - The standard frame.
 * @param variant - The `@<palette>` frame.
 * @param from - The standard body colour.
 * @param to - The variant body colour.
 * @returns True when the pixels agree with the remap of the three band colours.
 */
function remapEqual(standard: Image, variant: Image, from: string, to: string): boolean {
  const a = bandsOf(from);
  const b = bandsOf(to);
  if (standard.width !== variant.width || standard.height !== variant.height) return false;
  for (let y = 0; y < standard.height; y++) {
    for (let x = 0; x < standard.width; x++) {
      const p = getPixel(standard, x, y);
      const q = getPixel(variant, x, y);
      if (p[3] === 0) {
        if (q[3] !== 0) return false;
        continue;
      }
      if (q[3] === 0) return false;
      const expected =
        key(p) === a.rim ? b.rim : key(p) === a.body ? b.body : key(p) === a.core ? b.core : null;
      if (expected === null || key(q) !== expected) return false;
    }
  }
  return true;
}

describe('scripts/assets/procedural/bullets — the native v2 path (R3-03.V1)', () => {
  it('draws round 11×11 (1 frame), oval 13×13 and needle 17×17 (8 headings), all native', () => {
    expect(v2.map((s) => s.name).sort()).toEqual(
      COLOURS.flatMap((c) =>
        ['round', 'oval', 'needle'].map((shape) => `bullets/${shape}-${c}`),
      ).sort(),
    );
    for (const sprite of v2) {
      const size = sprite.name.includes('round') ? 11 : sprite.name.includes('oval') ? 13 : 17;
      expect(sprite.frames, sprite.name).toHaveLength(sprite.name.includes('round') ? 1 : 8);
      for (const frame of sprite.frames) {
        expect([frame.width, frame.height], sprite.name).toEqual([size, size]);
      }
      expect(sprite.native, sprite.name).toBe(true);
      expect(sprite.anchor, sprite.name).toBeNull();
    }
  });

  it('draws the bending laser node at the bible 11×11 native, the beams as they are', () => {
    expect(BEND_SIZE_V2).toBe(11);
    for (const sprite of lasers.laserSprites(bullets.BULLET_COLORS, '', 'lasers', 1.5)) {
      const bend = sprite.name.includes('bend');
      expect(sprite.frames, sprite.name).toHaveLength(bend ? 1 : 12);
      const size = bend ? [11, 11] : [Math.ceil(1.5 * BEAM_WIDTH), Math.ceil(1.5 * BEAM_HEIGHT)];
      for (const frame of sprite.frames) {
        expect([frame.width, frame.height], sprite.name).toEqual(size);
      }
      expect(sprite.native, sprite.name).toBe(true);
    }
  });

  it('uses exactly three bands per v2 sprite: dark rim < saturated body < bright core', () => {
    const sprites = [
      ...v2,
      ...lasers
        .laserSprites(bullets.BULLET_COLORS, '', 'lasers', 1.5)
        .filter((s) => s.name.includes('bend')),
    ];
    for (const sprite of sprites) {
      const colours = new Map<string, readonly number[]>();
      for (const frame of sprite.frames) {
        for (let y = 0; y < frame.height; y++) {
          for (let x = 0; x < frame.width; x++) {
            const rgba = getPixel(frame, x, y);
            if (rgba[3] === 0) continue;
            expect(rgba[3], sprite.name).toBe(255);
            colours.set(key(rgba), rgba);
          }
        }
      }
      const bands = [...colours.values()].sort((a, b) => luma(a) - luma(b));
      expect(bands, sprite.name).toHaveLength(3);
      const family = sprite.name.slice(sprite.name.lastIndexOf('-') + 1);
      const body = color(bullets.BULLET_COLORS[family as keyof typeof bullets.BULLET_COLORS]);
      expect(key(bands[1]), sprite.name).toBe(key(body));
      expect(luma(bands[0]), sprite.name).toBeLessThan(luma(body) / 2);
      expect(luma(bands[2]), sprite.name).toBeGreaterThan(luma(body));
    }
  });

  it('points frame k at k · 22.5° and draws frame k+4 the exact 90° turn of frame k', () => {
    for (const sprite of v2.filter((s) => !s.name.includes('round'))) {
      expect(sprite.frames).toHaveLength(8);
      sprite.frames.forEach((frame, k) => {
        expect(imagesEqual(rot90cw(frame), sprite.frames[(k + 4) % 8]), `${sprite.name}#${k}`).toBe(
          true,
        );
      });
      expect(bbox(sprite.frames[0])[0] > bbox(sprite.frames[0])[1], `${sprite.name} #0`).toBe(true);
      expect(bbox(sprite.frames[4])[1] > bbox(sprite.frames[4])[0], `${sprite.name} #4`).toBe(true);
      const [w2, h2] = bbox(sprite.frames[2]);
      expect(w2, `${sprite.name} #2 (45°)`).toBe(h2);
    }
  });

  it('codes the cores at the v2 mark size: solid disc, ring disc minus the plus, dot the plus', () => {
    const coded = bullets.bulletSprites(bullets.BULLET_COLORS, '', CORE_MARKS, 'bullets', 1.5);
    for (const shape of ['round', 'oval', 'needle']) {
      const pink = bandsOf(bullets.BULLET_COLORS.pink);
      const red = bandsOf(bullets.BULLET_COLORS.red);
      const purple = bandsOf(bullets.BULLET_COLORS.purple);
      const solid = find(v2, `bullets/${shape}-pink`).frames[0];
      const centre = (find(v2, `bullets/${shape}-pink`).frames[0].width - 1) / 2;
      const ring = find(coded, `bullets/${shape}-red`);
      const dot = find(coded, `bullets/${shape}-purple`);
      // solid: the centre carries the core band (the mark is not punched).
      expect(key(getPixel(solid, centre, centre)), shape).toBe(pink.core);
      // ring: the five-pixel plus is rim ink inside the core disc — the disc shrinks by five.
      const ring0 = ring.frames[0];
      expect(key(getPixel(ring0, centre, centre)), shape).toBe(red.rim);
      expect(countColour(ring, red.core), shape).toBe(
        countColour(find(v2, `bullets/${shape}-red`), red.core) - 5 * ring.frames.length,
      );
      // dot: the core band reads as body; only the plus carries the bright colour.
      const dot0 = dot.frames[0];
      expect(key(getPixel(dot0, centre, centre)), shape).toBe(purple.core);
      expect(key(getPixel(dot0, centre + 1, centre)), shape).toBe(purple.core);
      expect(key(getPixel(dot0, centre + 1, centre + 1)), shape).toBe(purple.body);
      expect(countColour(dot, purple.core), shape).toBe(5 * dot.frames.length);
    }
  });

  it('draws every @<palette> variant frame for frame of the standard v2 sprites', () => {
    const standard = [
      ...bullets.generate({ artScale: 1.5 }),
      ...lasers.laserSprites(bullets.BULLET_COLORS, '', 'lasers', 1.5),
    ];
    // The pixel basis carries the same core marks the variants get (the shape coding is by
    // design, `palettes.mjs`; the shipped standard set is all-solid).
    const marked = [
      ...bullets.bulletSprites(bullets.BULLET_COLORS, '', CORE_MARKS, 'bullets', 1.5),
      ...lasers.laserSprites(bullets.BULLET_COLORS, '', 'lasers', 1.5),
    ];
    expect(marked.map((s) => s.name)).toEqual(standard.map((s) => s.name));
    for (const [palette, colours] of Object.entries(BULLET_PALETTES)) {
      const variants = [
        ...bullets.bulletSprites(colours, `@${palette}`, CORE_MARKS, 'palettes', 1.5),
        ...lasers.laserSprites(colours, `@${palette}`, 'palettes', 1.5),
      ];
      expect(variants.map((s) => s.name).sort()).toEqual(
        standard.map((s) => `${s.name}@${palette}`).sort(),
      );
      for (const variant of variants) {
        const base = find(marked, variant.name.slice(0, variant.name.lastIndexOf('@')));
        expect(
          variant.frames.map((f) => `${f.width}x${f.height}`),
          variant.name,
        ).toEqual(base.frames.map((f) => `${f.width}x${f.height}`));
        expect(variant.native, variant.name).toBe(true);
        const family = variant.name.slice(variant.name.lastIndexOf('-') + 1).split('@')[0];
        const remapped = variant.frames.every((f, k) =>
          remapEqual(
            base.frames[k],
            f,
            bullets.BULLET_COLORS[family as keyof typeof bullets.BULLET_COLORS],
            colours[family as keyof typeof colours],
          ),
        );
        expect(remapped, variant.name).toBe(true);
      }
    }
    // through the generator entry points the pipeline uses: all shots native, right names
    const set = generatePalettes({ artScale: 1.5 });
    for (const sprite of set) {
      expect(sprite.name).toMatch(/(@[a-z]+)$/);
      if (sprite.name.startsWith('bullets/') || sprite.name.startsWith('lasers/bend-')) {
        expect(sprite.native, sprite.name).toBe(true);
      }
    }
    expect(set).toHaveLength(
      (bullets.generate({ artScale: 1.5 }).length +
        lasers.laserSprites(bullets.BULLET_COLORS, '', 'lasers', 1.5).length) *
        SUFFIXES.slice(1).length,
    );
  });

  it('is deterministic: two v2 runs draw the same pixels', () => {
    const again = bullets.generate({ artScale: 1.5 });
    expect(again.map((s) => s.name)).toEqual(v2.map((s) => s.name));
    again.forEach((sprite, k) => {
      sprite.frames.forEach((frame, f) => {
        expect(imagesEqual(frame, v2[k].frames[f]), sprite.name).toBe(true);
      });
    });
  });

  it('leaves the art-scale-1 path the v1 pixel map, unmarked, marks one pixel', () => {
    const v1 = bullets.generate();
    expect(bullets.generate({ artScale: 1 }).map((s) => s.name)).toEqual(v1.map((s) => s.name));
    for (const sprite of v1) {
      const size = sprite.name.includes('round') ? 7 : sprite.name.includes('oval') ? 9 : 11;
      expect(sprite.frames, sprite.name).toHaveLength(sprite.name.includes('round') ? 1 : 8);
      for (const frame of sprite.frames) {
        expect([frame.width, frame.height], sprite.name).toEqual([size, size]);
      }
      expect(sprite.native, sprite.name).toBeUndefined();
    }
    for (const sprite of lasers.generate()) {
      if (!sprite.name.includes('bend')) continue;
      expect(
        [sprite.frames.length, sprite.frames[0].width, sprite.frames[0].height],
        sprite.name,
      ).toEqual([1, BEND_SIZE, BEND_SIZE]);
      expect(sprite.native, sprite.name).toBeUndefined();
    }
    // the v1 marks are the centre pixel alone
    const coded = bullets.bulletSprites(bullets.BULLET_COLORS, '', CORE_MARKS);
    const ring = find(coded, 'bullets/round-red');
    expect(key(getPixel(ring.frames[0], 3, 3))).toBe(bandsOf(bullets.BULLET_COLORS.red).rim);
    expect(countColour(ring, bandsOf(bullets.BULLET_COLORS.red).core)).toBe(
      countColour(
        find(bullets.generate(), 'bullets/round-red'),
        bandsOf(bullets.BULLET_COLORS.red).core,
      ) - 1,
    );
    const dot = find(coded, 'bullets/round-purple');
    expect(key(getPixel(dot.frames[0], 3, 3))).toBe(bandsOf(bullets.BULLET_COLORS.purple).core);
    expect(countColour(dot, bandsOf(bullets.BULLET_COLORS.purple).core)).toBe(1);
  });

  it('builds the v1 sizes through buildAtlas({ artScale: 1 }) and the v2 ones at 3/2', () => {
    const one = buildAtlas({ artScale: 1 });
    const two = buildAtlas({ artScale: 1.5 });
    const size = (atlas: typeof one, name: string): [number, number] => {
      const frame = atlas.manifest.frames[`${name}#0`];
      return [frame.w, frame.h];
    };
    for (const suffix of SUFFIXES) {
      expect(size(one, `bullets/round-pink${suffix}`), suffix).toEqual([7, 7]);
      expect(size(one, `bullets/oval-red${suffix}`), suffix).toEqual([9, 9]);
      expect(size(one, `bullets/needle-purple${suffix}`), suffix).toEqual([11, 11]);
      expect(size(one, `lasers/bend-pink${suffix}`), suffix).toEqual([7, 7]);
      expect(size(two, `bullets/round-pink${suffix}`), suffix).toEqual([11, 11]);
      expect(size(two, `bullets/oval-red${suffix}`), suffix).toEqual([13, 13]);
      expect(size(two, `bullets/needle-purple${suffix}`), suffix).toEqual([17, 17]);
      expect(size(two, `lasers/bend-pink${suffix}`), suffix).toEqual([11, 11]);
      expect(two.manifest.sprites[`bullets/oval-red${suffix}`].frames).toHaveLength(8);
      expect(one.manifest.sprites[`bullets/oval-red${suffix}`].frames).toHaveLength(8);
    }
  });
});
