/**
 * R4-01.A6: the v2 shot pixel maps (art bible v2 § 5.3). All eleven `shots/*` maps are redrawn
 * as v2 sources (`shots/<name>.v2.sprite.json`, decision RR-1: `native` implied, the v1 maps
 * untouched), at ⌈1.5 · v1⌉ — 7 for the 5-px point-symmetric diagonals — with v1's frame
 * counts, colours, animations and no `@flash`. The anchors follow the block's rule: an explicit
 * v1 anchor becomes ⌈1.5 · a⌉ (this test pins every one of them), and what had none keeps the
 * pipeline's centre of the new (odd) frame.
 *
 * Because the maps are v2 sources, `buildAtlas({ artScale: 1 })` still holds the v1 maps and the
 * scale-1 digest pin in `interim-pipeline.test.ts` stays byte-identical. Test files hold literal
 * sizes by convention (`docs/dev/conventions.md` § Frame numbers: the scans do not read `test/`).
 *
 * @module
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createImage, getPixel, type Image } from '../../../scripts/assets/image.mjs';
import { buildAtlas } from '../../../scripts/assets/pipeline.mjs';

/** A built atlas (the shipped scale). */
type Atlas = ReturnType<typeof buildAtlas>;

/** The shipped-scale build. */
const v2 = buildAtlas();

/** The scale-1 build — the v1 maps, untouched by this subtask (RR-1). */
const one = buildAtlas({ artScale: 1 });

const NAMES = [
  'basic',
  'laser',
  'tail',
  'twin',
  'missile',
  'double',
  'free',
  'two-way',
  'bomb',
  'torpedo',
  'vertical',
] as const;

/** What the v2 art of one shot must be at the shipped scale (bible § 5.3). */
interface ShotSpec {
  /** Width × height. */
  size: [number, number];
  /** The manifest anchor: ⌈1.5 · v1⌉, or the centre of the odd frame when v1 had none. */
  anchor: [number, number];
  /** Frames — equal to v1's. */
  frames: number;
}

const SHOTS: Readonly<Record<string, ShotSpec>> = Object.freeze({
  'shots/basic': { size: [12, 5], anchor: [6, 2], frames: 1 },
  'shots/laser': { size: [12, 5], anchor: [0, 2], frames: 1 },
  'shots/tail': { size: [12, 5], anchor: [6, 2], frames: 1 },
  'shots/twin': { size: [12, 5], anchor: [0, 2], frames: 1 },
  'shots/missile': { size: [12, 5], anchor: [6, 2], frames: 2 },
  'shots/double': { size: [7, 7], anchor: [3, 3], frames: 1 },
  'shots/free': { size: [7, 7], anchor: [3, 3], frames: 1 },
  'shots/two-way': { size: [7, 7], anchor: [3, 3], frames: 2 },
  'shots/bomb': { size: [9, 9], anchor: [4, 4], frames: 1 },
  'shots/torpedo': { size: [15, 5], anchor: [8, 2], frames: 2 },
  'shots/vertical': { size: [5, 12], anchor: [2, 6], frames: 1 },
});

/** The same table at v1's own frame and anchors (scale-1 build). */
const V1: Readonly<Record<string, [number, number, number, number]>> = Object.freeze({
  'shots/basic': [8, 3, 4, 1],
  'shots/laser': [8, 3, 0, 1],
  'shots/tail': [8, 3, 4, 1],
  'shots/twin': [8, 3, 0, 1],
  'shots/missile': [8, 3, 4, 1],
  'shots/double': [5, 5, 2, 2],
  'shots/free': [5, 5, 2, 2],
  'shots/two-way': [5, 5, 2, 2],
  'shots/bomb': [6, 6, 3, 3],
  'shots/torpedo': [10, 3, 5, 1],
  'shots/vertical': [3, 8, 1, 4],
});

/**
 * The pixels of one manifest frame, copied out of its page.
 *
 * @param atlas - The built atlas.
 * @param name - A frame name (`<sprite>#<index>`).
 * @returns A fresh image of the frame.
 */
function framePixels(atlas: Atlas, name: string): Image {
  const f = atlas.manifest.frames[name];
  const page = atlas.pages[f.p].image;
  const out = createImage(f.w, f.h);
  for (let y = 0; y < f.h; y++) {
    const from = ((f.y + y) * page.width + f.x) * 4;
    out.data.set(page.data.subarray(from, from + f.w * 4), y * f.w * 4);
  }
  return out;
}

/**
 * Reads one source map below `assets/source/sprites/shots/`.
 *
 * @param file - The file name.
 * @returns Its parsed JSON (palette and frame shape of both scales).
 */
function readMap(file: string): {
  palette: Record<string, string | null>;
  frames: { rows: string[] }[];
} {
  return JSON.parse(
    readFileSync(new URL(`../../../assets/source/sprites/shots/${file}`, import.meta.url), 'utf8'),
  ) as { palette: Record<string, string | null>; frames: { rows: string[] }[] };
}

describe('shots v2 (R4-01.A6) — the eleven maps at the bible sizes', () => {
  it('draws every shot at its § 5.3 size, pinned anchor and v1 frame count', () => {
    for (const [name, spec] of Object.entries(SHOTS)) {
      const sprite = v2.manifest.sprites[name];
      expect(sprite.frames, name).toHaveLength(spec.frames);
      for (const frame of sprite.frames) {
        const f = v2.manifest.frames[frame];
        expect([f.w, f.h], frame).toEqual(spec.size);
        expect([f.ax, f.ay], frame).toEqual(spec.anchor);
      }
    }
  });

  it('keeps the v1 maps outside the scale-1 build (RR-1: v2 sources never touch it)', () => {
    for (const [name, [w, h, ax, ay]] of Object.entries(V1)) {
      const f = one.manifest.frames[`${name}#0`];
      expect([f.w, f.h, f.ax, f.ay], `${name} at scale 1`).toEqual([w, h, ax, ay]);
      expect(one.manifest.sprites[name].frames, `${name} frames`).toEqual(
        v2.manifest.sprites[name].frames,
      );
    }
    const basic = readMap('basic.sprite.json');
    expect(basic.frames[0].rows).toHaveLength(3);
    expect(v2.manifest.sprites['shots/missile'].frames).toHaveLength(2);
    expect(v2.manifest.sprites['shots/two-way'].frames).toHaveLength(2);
    expect(v2.manifest.sprites['shots/torpedo'].frames).toHaveLength(2);
  });

  it('keeps the frame-count animations of v1 (fly, climb / dive, run)', () => {
    expect(v2.manifest.animations['shots/missile']).toEqual({ fly: [0, 1] });
    expect(v2.manifest.animations['shots/two-way']).toEqual({ climb: [0], dive: [1] });
    expect(v2.manifest.animations['shots/torpedo']).toEqual({ run: [0, 1] });
  });

  it('reuses v1 palettes exactly and paints only their colours', () => {
    for (const name of NAMES) {
      const v1Map = readMap(`${name}.sprite.json`);
      const v2Map = readMap(`${name}.v2.sprite.json`);
      expect(v2Map.palette, `${name} palette`).toEqual(v1Map.palette);
      const allowed = Object.values(v2Map.palette)
        .filter((c): c is string => c !== null)
        .map((c) => c.toLowerCase());
      const sprite = v2.manifest.sprites[`shots/${name}`];
      for (const [i, frame] of sprite.frames.entries()) {
        const image = framePixels(v2, frame);
        let opaque = 0;
        for (let y = 0; y < image.height; y++)
          for (let x = 0; x < image.width; x++) {
            const p = getPixel(image, x, y);
            if (p[3] === 0) continue;
            opaque++;
            expect(p[3], `shots/${name}#${i} ${x},${y}`).toBe(255);
            const hex = p
              .slice(0, 3)
              .map((c) => c.toString(16).padStart(2, '0'))
              .join('');
            expect(
              allowed.some((a) => a.slice(1) === hex),
              `shots/${name}#${i} #${hex}`,
            ).toBe(true);
          }
        expect(opaque, `shots/${name}#${i} pixels`).toBeGreaterThan(0);
      }
    }
  });

  it('carries the v2 maps with the v1 rows (the source shape is the pixel rows)', () => {
    for (const name of NAMES) {
      const v2Map = readMap(`${name}.v2.sprite.json`);
      const spec = SHOTS[`shots/${name}`];
      for (const [i, frame] of v2Map.frames.entries()) {
        expect(frame.rows, `shots/${name}#${i}`).toHaveLength(spec.size[1]);
        for (const row of frame.rows) expect([...row], `${name} row`).toHaveLength(spec.size[0]);
      }
    }
  });

  it('paints the core line whole in every beam, missile and torpedo frame', () => {
    const rows: readonly [string, number, number][] = [
      ['shots/basic', 2, 12],
      ['shots/laser', 2, 12],
      ['shots/tail', 2, 12],
      ['shots/twin', 2, 12],
      ['shots/missile', 2, 12],
      ['shots/torpedo', 2, 15],
    ];
    for (const [name, y, width] of rows)
      for (const [i, frame] of v2.manifest.sprites[name].frames.entries()) {
        const image = framePixels(v2, frame);
        for (let x = 0; x < width; x++)
          expect(getPixel(image, x, y)[3] > 0, `${name}#${i} core ${x}`).toBe(true);
      }
    const vertical = framePixels(v2, 'shots/vertical#0');
    for (let y = 0; y < 12; y++)
      expect(getPixel(vertical, 2, y)[3] > 0, `vertical core ${y}`).toBe(true);
  });

  it('ships no @flash variant of any shot (rule 11: hitFlash false everywhere)', () => {
    for (const name of NAMES) {
      expect(v2.manifest.sprites[`shots/${name}`].flash, name).toBeNull();
      expect(v2.manifest.sprites[`shots/${name}@flash`], `${name}@flash`).toBeUndefined();
    }
  });
});
