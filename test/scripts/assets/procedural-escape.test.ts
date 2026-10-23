/**
 * R5-10.T2 — the escape sequence's stand-in layers (`scripts/assets/procedural/escape.mjs`,
 * decision R5-D3 / Q-13): every new name drawn at its size and frame count, the three bands
 * seamless and periodic — a half-frame tile that fills the frame exactly twice — the skyline
 * and the girders reaching the frame's bottom row with a continuous profile across the wrap,
 * the streaks' second frame exactly the first drifted right by a quarter of the period; every
 * lit colour at Chebyshev distance ≥ 3 from every reserved palette-cycle ramp (read from the
 * shipped stages, as `palette-cycle-scan.test.ts` does); nothing drawn at art scale 1 (RR-1a);
 * the shipped escape stage naming exactly these sprites and no others; and two runs
 * byte-identical.
 *
 * @module
 */
import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getPixel, type Image } from '../../../scripts/assets/image.mjs';
import { FRAME_H, FRAME_W, PLAYFIELD_H, WORLD_SCALE } from '../../../scripts/frame.mjs';
import * as escape from '../../../scripts/assets/procedural/escape.mjs';
import { bytes, byName, content, framesDiffer } from './procedural-zone-helpers.js';

interface CycleEntry {
  layer: string;
  colors: string[];
}
interface Band {
  layer: string;
  sprite: string;
  y: number;
  spacing: number;
  frames?: number;
  frameTicks?: number;
}
interface DecorEntry {
  layer: string;
  sprite?: string;
  glow?: string;
  x: number;
}
interface StageFile {
  length: number;
  cycles?: CycleEntry[];
  parallax?: Band[];
  decor?: DecorEntry[];
}

/** The shipped art scale (3/2 — the value the pipeline builds at after R2-01's flip). */
const ART_SCALE = WORLD_SCALE;

/** The generator's output at the shipped scale. */
const sprites = escape.generate({ artScale: ART_SCALE });

/** The shipped escape stage, as the generator's art is wired into it. */
const stage = content<StageFile>('stages/escape.stage.json');

/** All `[r, g, b]` of a frame's pixels that carry any alpha. */
function litColours(image: Image): number[][] {
  const out: number[][] = [];
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const p = getPixel(image, x, y);
      if (p[3] > 0) out.push([p[0], p[1], p[2]]);
    }
  }
  return out;
}

/** The distinct ramp colours of the shipped stages (bible §4.4). */
const ramps = (() => {
  const dir = new URL('../../../content/stages/', import.meta.url);
  const set = new Map<string, number[]>();
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.stage.json')) continue;
    const other = content<StageFile>('stages/' + file);
    for (const cycle of other.cycles ?? []) {
      for (const hex of cycle.colors) {
        set.set(
          hex,
          [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)),
        );
      }
    }
  }
  return set;
})();

/** Chebyshev distance of two colours (the metric the cycle shader compares). */
const chebyshev = (a: number[], b: number[]): number =>
  Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));

/** The first drawn row of a band column, or the band's height when it draws nothing. */
function topRow(image: Image, x: number): number {
  for (let y = 0; y < image.height; y++) if (getPixel(image, x, y)[3] > 0) return y;
  return image.height;
}

describe('scripts/assets/procedural/escape (R5-10.T2)', () => {
  it('draws nothing at art scale 1 and the §list at the shipped scale, all native', () => {
    expect(escape.generate()).toEqual([]);
    expect(escape.generate({ artScale: 1 })).toEqual([]);
    expect(sprites.map((s) => s.name)).toEqual([...escape.ESCAPE_SPRITES]);
    for (const sprite of sprites) {
      expect(sprite.native, sprite.name).toBe(true);
      expect(sprite.origin, sprite.name).toBe('procedural:escape');
      expect(sprite.hitFlash, sprite.name).toBe(false); // backdrop, decor and glow are not hittable
    }
  });

  it('draws every name at its size and frame count', () => {
    const table: Record<string, [number, number, number]> = {
      'bg/escape-skyline': [2, escape.BAND_TILE_W, escape.SKYLINE_H],
      'bg/escape-girders': [2, escape.BAND_TILE_W, escape.GIRDERS_H],
      'bg/escape-streaks': [2, escape.BAND_TILE_W, escape.STREAKS_H],
      'decor/escape-flare-a': [1, 18, 30],
      'decor/escape-flare-b': [1, 12, 42],
      'fx/glow-escape-flare': [1, 32, 32],
    };
    for (const [name, [frames, w, h]] of Object.entries(table)) {
      const sprite = byName(sprites, name);
      expect(sprite.frames, name).toHaveLength(frames);
      for (const frame of sprite.frames) {
        expect([frame.width, frame.height], name).toEqual([w, h]);
      }
    }
    // the band heights are exact frame fractions and the glow sits on its centre anchor
    expect(escape.SKYLINE_H * 4).toBe(FRAME_H);
    expect(escape.GIRDERS_H * 6).toBe(FRAME_H);
    expect(escape.STREAKS_H * 12).toBe(FRAME_H);
    expect(byName(sprites, 'fx/glow-escape-flare').anchor).toEqual([16, 16]);
    for (const name of ['bg/escape-skyline', 'bg/escape-girders', 'bg/escape-streaks']) {
      expect(byName(sprites, name).anchor, name).toEqual([0, 0]);
    }
    framesDiffer(sprites);
  });

  it('repeats the bands on a period that fills the frame exactly twice', () => {
    expect(escape.BAND_TILE_W * 2).toBe(FRAME_W);
    expect(escape.SKYLINE_H).toBe(90);
    expect(escape.GIRDERS_H).toBe(60);
    expect(escape.STREAKS_H).toBe(30);
  });

  it('stands the skyline on the playfield floor with a continuous profile', () => {
    // the content places the far band so its bottom row meets the playfield's floor edge
    const band = (stage.parallax ?? []).find((b) => b.sprite === 'bg/escape-skyline');
    expect(band, 'the escape stage names bg/escape-skyline').toBeDefined();
    expect((band?.y ?? 0) + escape.SKYLINE_H).toBe(PLAYFIELD_H);
    const image = byName(sprites, 'bg/escape-skyline').frames[0];
    for (let x = 0; x < image.width; x++) {
      expect(topRow(image, x), `column ${x}`).toBeLessThan(image.height);
      let hole = false;
      for (let y = topRow(image, x); y < image.height; y++) {
        const on = getPixel(image, x, y)[3] > 0;
        expect(on && hole, `column ${x} floats`).toBe(false);
        if (!on) hole = true;
      }
    }
    // the wrap is continuous: the last and first columns are neighbours of the lattice
    expect(Math.abs(topRow(image, 0) - topRow(image, image.width - 1))).toBeLessThanOrEqual(6);
    // the towers carry lamps: some pixels glow with the soft alpha, none is a stray half-tone
    let soft = 0;
    let opaque = 0;
    for (let i = 3; i < image.data.length; i += 4) {
      if (image.data[i] > 0 && image.data[i] < 255) soft++;
      if (image.data[i] === 255) opaque++;
    }
    expect(soft, 'window lamps').toBeGreaterThan(0);
    expect(opaque).toBeGreaterThan(soft * 20);
  });

  it('hangs the girders across the top with a continuous profile', () => {
    const image = byName(sprites, 'bg/escape-girders').frames[0];
    for (let x = 0; x < image.width; x++) {
      expect(topRow(image, x), `column ${x}`).toBeLessThan(image.height);
    }
    expect(Math.abs(topRow(image, 0) - topRow(image, image.width - 1))).toBeLessThanOrEqual(6);
    // the band is sparse: most of its rows stay transparent (the corridor reads through it)
    let drawn = 0;
    for (let i = 3; i < image.data.length; i += 4) if (image.data[i] > 0) drawn++;
    expect(drawn * 2).toBeLessThan(image.width * image.height);
  });

  it('drifts the streaks frame 1 exactly a quarter period right of frame 0', () => {
    const [a, b] = byName(sprites, 'bg/escape-streaks').frames;
    const w = a.width;
    const shift = escape.BAND_TILE_W / 4;
    for (let y = 0; y < a.height; y++) {
      for (let x = 0; x < w; x++) {
        expect(getPixel(b, (x + shift) % w, y).join(','), `drift at ${x},${y}`).toBe(
          getPixel(a, x, y).join(','),
        );
      }
    }
  });

  it('wires every escape sprite the stage names', () => {
    const names = new Set(sprites.map((s) => s.name));
    for (const band of stage.parallax ?? []) {
      if (!band.sprite.startsWith('bg/escape-')) continue;
      expect(names.has(band.sprite), band.sprite).toBe(true);
      expect(band.spacing, band.sprite).toBe(escape.BAND_TILE_W);
      expect(band.frames, band.sprite).toBe(byName(sprites, band.sprite).frames.length);
    }
    for (const item of stage.decor ?? []) {
      if (item.sprite !== undefined && item.sprite.startsWith('decor/escape-')) {
        expect(names.has(item.sprite), item.sprite).toBe(true);
      }
      if (item.glow !== undefined) expect(names.has(item.glow), item.glow).toBe(true);
    }
    // the stage carries exactly one fore band, and it is the streaks
    const fore = (stage.parallax ?? []).filter((b) => b.layer === 'fore');
    expect(fore.map((b) => b.sprite)).toEqual(['bg/escape-streaks']);
    expect(stage.decor?.length).toBeGreaterThan(0);
    for (const item of stage.decor ?? []) expect(item.x).toBeLessThanOrEqual(stage.length);
  });

  it('keeps every lit colour at distance ≥ 3 from the reserved ramps', () => {
    for (const sprite of sprites) {
      for (const frame of sprite.frames) {
        const seen = new Set<string>();
        for (const rgb of litColours(frame)) {
          const key = rgb.join(',');
          if (seen.has(key)) continue;
          seen.add(key);
          for (const [hex, ramp] of ramps) {
            expect(chebyshev(rgb, ramp), `${sprite.name} #${key} vs ${hex}`).toBeGreaterThanOrEqual(
              3,
            );
          }
        }
      }
    }
  });

  it('runs byte-identical twice', () => {
    const again = escape.generate({ artScale: ART_SCALE });
    expect(bytes(again)).toEqual(bytes(sprites));
  });
});
