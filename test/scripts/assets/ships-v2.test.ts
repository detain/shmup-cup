/**
 * R4-01.A1a + R4-01.A1b: the v2 ship pixel maps (art bible v2 § 5.3). `ships/kestrel` and
 * `ships/manta` are redrawn at 24 × 14 and 24 × 15 with the five bank frames of
 * `playerBankFrame` order (0 level, 1 climb, 2 steep climb, 3 dive, 4 steep dive), `ships/
 * kestrel-thruster` at 9 × 5 with its two flicker frames (grown to four by `R4-01.A2`). All
 * three are v2 sources (`*.v2.sprite.json`, decision RR-1: `native` implied, v1 untouched), so
 * `buildAtlas({ artScale: 1 })` still holds the v1 maps — three frames, the scale-1 digest pin in
 * `interim-pipeline.test.ts` stays byte-identical (RR-1b: `bankFrames` 2 indexes frames the
 * scale-1 build never draws, because it never flies a ship).
 *
 * The ships carry no `@flash` (the game never flashes a ship — `syncWorldView` only hides it),
 * and their `@p2` sibling (rule 11: R3-03.V2a demands a `p2` map from every `ships/*`) changes
 * **exactly** the colours of the map's ramp: every other colour and every alpha stay.
 *
 * Sizes, anchors and frame counts are the bible's (§ 5.3) — the v1 columns are derived from the
 * scale-1 build, never pasted. Test files hold literal sizes by convention (`docs/dev/
 * conventions.md` § Frame numbers: the scans do not read `test/`).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createImage, getPixel, type Image } from '../../../scripts/assets/image.mjs';
import { buildAtlas } from '../../../scripts/assets/pipeline.mjs';

/** A built atlas (the shipped scale). */
type Atlas = ReturnType<typeof buildAtlas>;

/** The shipped-scale build. */
const v2 = buildAtlas();

/** The scale-1 build — the v1 sources, untouched by this subtask (RR-1). */
const v1 = buildAtlas({ artScale: 1 });

/** What the v2 art of one ship name must be at the shipped scale. */
interface ShipSpec {
  /** Size from the art bible § 5.3 (the interim ⌈1.5 · v1⌉ for the sizes, a chosen anchor). */
  size: [number, number];
  /** Anchor from the art bible § 5.3 (KESTREL exact ×1.5; MANTA [12, 7] of [12, 7] / [12, 8]; thruster [9, 2]). */
  anchor: [number, number];
  /** Frames shipped today (`R4-01.A1b` took the ships to 5; `R4-01.A2` takes the thruster to 4). */
  frames: number;
}

const SHIPS: Readonly<Record<string, ShipSpec>> = Object.freeze({
  'ships/kestrel': { size: [24, 14], anchor: [12, 6], frames: 5 },
  'ships/manta': { size: [24, 15], anchor: [12, 7], frames: 5 },
  'ships/kestrel-thruster': { size: [9, 5], anchor: [9, 2], frames: 2 },
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
 * Parses a `#rrggbb` colour to its channels.
 *
 * @param hex - The colour.
 * @returns The packed RGB triple.
 */
function rgb(hex: string): [number, number, number] {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

/**
 * The `p2` map a v2 source declares, parsed.
 *
 * @param file - The source file below `assets/source/sprites/ships/`.
 * @returns Source RGB → target RGB, keyed by the packed source colour.
 */
function p2MapOf(file: string): Map<number, [number, number, number]> {
  const json = JSON.parse(
    readFileSync(new URL(`../../../assets/source/sprites/ships/${file}`, import.meta.url), 'utf8'),
  ) as { p2: Record<string, string> };
  const map = new Map<number, [number, number, number]>();
  for (const [from, to] of Object.entries(json.p2)) map.set(keyOf(...rgb(from)), rgb(to));
  return map;
}

/** Key of a packed colour for map lookups. */
const keyOf = (r: number, g: number, b: number): number => (r << 16) | (g << 8) | b;

describe('ships v2 (R4-01.A1a + A1b) — the bible sizes, anchors and five bank frames', () => {
  for (const [name, spec] of Object.entries(SHIPS)) {
    it(`draws ${name} at ${spec.size[0]} × ${spec.size[1]}, anchor [${spec.anchor[0]}, ${spec.anchor[1]}], ${spec.frames} frames`, () => {
      const sprite = v2.manifest.sprites[name];
      expect(sprite.frames).toHaveLength(spec.frames);
      for (const frame of sprite.frames) {
        const f = v2.manifest.frames[frame];
        expect([f.w, f.h], frame).toEqual(spec.size);
        expect([f.ax, f.ay], frame).toEqual(spec.anchor);
      }
    });
  }

  it('keeps the v1 maps outside the scale-1 build (RR-1: v2 sources never touch it)', () => {
    const v1Size: Readonly<Record<string, [number, number, number, number]>> = {
      'ships/kestrel': [16, 9, 8, 4],
      'ships/manta': [16, 10, 8, 5],
      'ships/kestrel-thruster': [6, 3, 6, 1],
    };
    for (const [name, [w, h, ax, ay]] of Object.entries(v1Size)) {
      const f = v1.manifest.frames[`${name}#0`];
      expect([f.w, f.h, f.ax, f.ay], `${name} at scale 1`).toEqual([w, h, ax, ay]);
      // RR-1b: the ships keep the untouched v1 three frames at scale 1 — `bankFrames` 2 indexes
      // frames 3–4 only in the v2 build (scale 1 never flies a ship: bench, CJK figures, icons).
      expect(v1.manifest.sprites[name].frames, `${name} at scale 1`).toHaveLength(
        name === 'ships/kestrel-thruster' ? v2.manifest.sprites[name].frames.length : 3,
      );
    }
    // The v1 thruster map is the v1 one: its frame count is the v1 file's, not a v2 leak.
    expect(v1.manifest.sprites['ships/kestrel-thruster'].frames).toHaveLength(2);
    expect(v1.manifest.sprites['ships/kestrel-thruster@p2'].frames).toHaveLength(2);
  });

  it('keeps the bank-frame animations (R4-01.A1b: up 1–2, down 3–4; burn)', () => {
    expect(v2.manifest.animations['ships/kestrel']).toEqual({
      down: [3, 4],
      level: [0],
      up: [1, 2],
    });
    expect(v2.manifest.animations['ships/manta']).toEqual({
      down: [3, 4],
      level: [0],
      up: [1, 2],
    });
    expect(v2.manifest.animations['ships/kestrel-thruster']).toEqual({ burn: [0, 1] });
  });

  it('has no @flash of any ship sprite — the game never flashes a ship', () => {
    for (const name of Object.keys(SHIPS)) {
      expect(v2.manifest.sprites[name].flash, name).toBeNull();
      expect(v2.manifest.sprites[`${name}@p2`].flash, `${name}@p2`).toBeNull();
      expect(v2.manifest.sprites[`${name}@flash`], `${name}@flash`).toBeUndefined();
    }
  });

  it('@p2 changes exactly the p2 map colours of every ship frame, alpha included', () => {
    const files: Readonly<Record<string, string>> = {
      'ships/kestrel': 'kestrel.v2.sprite.json',
      'ships/manta': 'manta.v2.sprite.json',
      'ships/kestrel-thruster': 'kestrel-thruster.v2.sprite.json',
    };
    for (const [name, file] of Object.entries(files)) {
      const map = p2MapOf(file);
      let changed = 0;
      let seen = 0;
      for (const [i, frame] of v2.manifest.sprites[name].frames.entries()) {
        const base = framePixels(v2, frame);
        const swap = framePixels(v2, `${name}@p2#${i}`);
        expect([swap.width, swap.height], `${name}@p2#${i}`).toEqual([base.width, base.height]);
        for (let y = 0; y < base.height; y++) {
          for (let x = 0; x < base.width; x++) {
            const a = getPixel(base, x, y);
            const b = getPixel(swap, x, y);
            expect(b[3], `${name}@p2#${i} ${x},${y}`).toBe(a[3]);
            seen++;
            const target = map.get(keyOf(a[0], a[1], a[2]));
            if (target === undefined)
              expect([b[0], b[1], b[2]], `${name}@p2#${i} ${x},${y}`).toEqual([a[0], a[1], a[2]]);
            else {
              expect([b[0], b[1], b[2]], `${name}@p2#${i} ${x},${y}`).toEqual(target);
              changed++;
            }
          }
        }
      }
      expect(changed, `${name}: @p2 changes pixels`).toBeGreaterThan(0);
      expect(seen, `${name}: frames measured`).toBeGreaterThan(0);
    }
  });

  it('flips the KESTREL ramp the way the bible § 4.5 names it (stripe, canopy, engine)', () => {
    const map = p2MapOf('kestrel.v2.sprite.json');
    expect(map.get(keyOf(...rgb('#3858f0')))).toEqual(rgb('#f05838'));
    expect(map.get(keyOf(...rgb('#38c8e8')))).toEqual(rgb('#e8c838'));
    expect(map.get(keyOf(...rgb('#f89830')))).toEqual(rgb('#3098f8'));
  });
});
