/**
 * R4-01.A3: the v2 Option pixel maps (art bible v2 § 5). `options/orb` and `options/stolen` are
 * redrawn at 12 × 12 with the pulse breathing over `OPTION_FRAMES` frames (the v1 maps keep their
 * two). Both are v2 sources (`*.v2.sprite.json`, decision RR-1: `native` implied, the v1 files
 * untouched), so `buildAtlas({ artScale: 1 })` still holds the v1 maps and the scale-1 digest pin
 * in `interim-pipeline.test.ts` stays byte-identical — frames 2–3 missing at scale 1 is what
 * decision RR-1b allows: only the TV bench draws `options/orb` there, and it draws frame 0.
 *
 * R6-03.S3 shipped real-art PNG overrides of both names (winner `craft/option`): at the shipped
 * scale the frames are the override's pixels — its body red `#ec2301` and drained grey `#b5afb4`
 * are what the browser specs' census counts now (`weapons.spec.ts`, `option-hunter.spec.ts`,
 * re-pointed honestly and pinned below). The interim maps stay untouched and still serve scale 1
 * (RR-1), so they keep the v1 palettes colour for colour and the flare-frame pulse shape.
 * Every shipped pixel stays fully opaque or fully transparent (binary alpha); the colour census
 * of each frame stays inside its own art's palette — the override's own colours where one ships.
 *
 * w15-ENRICH-A (owner re-add ruling of 2026-10-26): the six option silhouettes w15-WB shipped as
 * 8 × 8 two-frame v1 interim maps get their 12 × 12 four-frame v2 twins, so the OPTION_FRAMES
 * pulse lands on real art at the shipped scale instead of running off the end of a two-frame
 * sprite into the magenta missing frame. They join the NAMES census here; each twin keeps its v1
 * file's palette colour for colour, and no twin carries an override — the v1 maps stay the
 * scale-1 build untouched.
 *
 * Sizes, anchors and frame counts are the bible's (§ 5); the frame count is core's
 * `OPTION_FRAMES` through the barrel (the same value the sync masks with). Test files hold
 * literal sizes by convention (`docs/dev/conventions.md` § Frame numbers: scans do not read
 * `test/`).
 */
import { existsSync, readFileSync } from 'node:fs';
import { OPTION_FRAMES } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { createImage, getPixel, type Image } from '../../../scripts/assets/image.mjs';
import { buildAtlas } from '../../../scripts/assets/pipeline.mjs';
import { decodePng } from '../../../scripts/assets/png.mjs';

/** A built atlas. */
type Atlas = ReturnType<typeof buildAtlas>;

/** The shipped-scale build — the v2 maps. */
const v2 = buildAtlas();

/** The scale-1 build — the v1 maps, untouched by this subtask (RR-1). */
const v1 = buildAtlas({ artScale: 1 });

/** The engine option sprites: the two orbs of R4-01.A3 and the six w15-ENRICH-A silhouette twins. */
const NAMES: readonly string[] = [
  'options/orb',
  'options/stolen',
  'options/serpent',
  'options/dart',
  'options/gyro',
  'options/guard-pod',
  'options/echo-wing',
  'options/aegis-dish',
];

/** A sprite source file, parsed. */
interface SourceFile {
  /** Palette: key → `#rrggbb` or null. */
  palette: Record<string, string | null>;
  /** Frames with their rows. */
  frames: { rows: string[] }[];
  /** Animation tables. */
  animations: Record<string, number[]>;
}

/**
 * Reads one option source file.
 *
 * @param name - The sprite name (`options/orb` …).
 * @param v2Source - `true` for the `.v2.sprite.json`, `false` for the v1 map.
 * @returns The parsed file.
 */
function sourceOf(name: string, v2Source: boolean): SourceFile {
  const file = `${name.slice('options/'.length)}.${v2Source ? 'v2.' : ''}sprite.json`;
  return JSON.parse(
    readFileSync(
      new URL(`../../../assets/source/sprites/options/${file}`, import.meta.url),
      'utf8',
    ),
  ) as SourceFile;
}

/**
 * The shipped override PNG of an option name (R6-03.S3 real art), when one exists.
 *
 * @param name - The sprite name (`options/orb` …).
 * @returns The decoded PNG, or `null` when the name ships from the interim map.
 */
function overrideOf(name: string): Image | null {
  const file = new URL(
    `../../../assets/source/sprites/options/${name.slice('options/'.length)}.png`,
    import.meta.url,
  );
  return existsSync(file) ? decodePng(readFileSync(file)) : null;
}

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
 * @returns The RGB triple.
 */
function rgb(hex: string): [number, number, number] {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

describe('options v2 (R4-01.A3) — the bible sizes and the four-frame pulse', () => {
  for (const name of NAMES) {
    it(`draws ${name} at 12 × 12, anchor [6, 6], OPTION_FRAMES frames`, () => {
      const sprite = v2.manifest.sprites[name];
      expect(sprite.frames).toHaveLength(OPTION_FRAMES);
      for (const [i, frame] of sprite.frames.entries()) {
        const f = v2.manifest.frames[frame];
        expect([f.w, f.h], frame).toEqual([12, 12]);
        expect([f.ax, f.ay], frame).toEqual([6, 6]);
        expect(frame, `${name}#${i}`).toBe(`${name}#${i}`);
      }
    });

    it(`keeps the v1 map of ${name} the scale-1 build (RR-1: two 8 × 8 frames)`, () => {
      const v1File = sourceOf(name, false);
      const f = v1.manifest.frames[`${name}#0`];
      expect([f.w, f.h, f.ax, f.ay], `${name} at scale 1`).toEqual([8, 8, 4, 4]);
      expect(v1.manifest.sprites[name].frames).toHaveLength(v1File.frames.length);
      // The v2 frame names continue the v1 list: #0, #1 exist at both scales.
      expect(v2.manifest.sprites[name].frames.slice(0, v1File.frames.length)).toEqual(
        v1.manifest.sprites[name].frames,
      );
    });

    it(`pulses ${name} over its frames at both scales`, () => {
      const pulse = Array.from({ length: OPTION_FRAMES }, (_, i) => i);
      expect(v2.manifest.animations[name]).toEqual({ pulse });
      expect(v1.manifest.animations[name]).toEqual({ pulse: [0, 1] });
      // The v2 source's own table matches (the atlas copies the file).
      expect(sourceOf(name, true).animations.pulse).toEqual(pulse);
    });

    it(`draws ${name} with binary alpha and only its palette's colours`, () => {
      // R6-03.S3: an override PNG is the shipped art, and the colours it uses are its palette;
      // the interim map's declared palette governs only where no override ships.
      const override = overrideOf(name);
      const colours = new Map<number, string>();
      if (override !== null) {
        for (let y = 0; y < override.height; y++) {
          for (let x = 0; x < override.width; x++) {
            const [r, g, b, a] = getPixel(override, x, y);
            if (a !== 0) colours.set((r << 16) | (g << 8) | b, `${name}#${x},${y}`);
          }
        }
      } else {
        for (const hex of Object.values(sourceOf(name, true).palette)) {
          if (hex !== null) {
            const [r, g, b] = rgb(hex);
            colours.set((r << 16) | (g << 8) | b, hex);
          }
        }
      }
      for (const frame of v2.manifest.sprites[name].frames) {
        const img = framePixels(v2, frame);
        let opaque = 0;
        const seen = new Set<number>();
        for (let y = 0; y < img.height; y++) {
          for (let x = 0; x < img.width; x++) {
            const [r, g, b, a] = getPixel(img, x, y);
            expect(a, `${frame} ${x},${y}`).toBe(a === 0 ? 0 : 255); // binary alpha
            if (a === 0) continue;
            opaque++;
            const key = (r << 16) | (g << 8) | b;
            expect(colours.has(key), `${frame} ${x},${y} #${key.toString(16)}`).toBe(true);
            seen.add(key);
          }
        }
        expect(opaque, `${frame}: opaque pixels`).toBeGreaterThan(0);
        expect(seen.size, `${frame}: colours used`).toBeGreaterThan(1);
      }
    });

    it(`keeps the v1 palette of ${name} colour for colour (the specs' census)`, () => {
      const v1Palette = Object.values(sourceOf(name, false).palette);
      const v2Palette = Object.values(sourceOf(name, true).palette);
      expect(new Set(v2Palette.filter((c) => c !== null))).toEqual(
        new Set(v1Palette.filter((c) => c !== null)),
      );
    });

    it(`has no @flash and no @p2 of ${name} (engine option sprites take neither)`, () => {
      expect(v2.manifest.sprites[name].flash, `${name} flash`).toBeNull();
      expect(v2.manifest.sprites[`${name}@flash`], `${name}@flash`).toBeUndefined();
      expect(v2.manifest.sprites[`${name}@p2`], `${name}@p2`).toBeUndefined();
      expect(v1.manifest.sprites[`${name}@p2`], `${name}@p2 at scale 1`).toBeUndefined();
    });
  }

  it('holds the orb red body in every dark pulse frame (weapons.spec threshold)', () => {
    // w15-REING-6: the shipped orb is the gen6 re-land, whose crimson body is the family
    // `#aa0d19`/`#8d0718`/`#640816` (13–30 px a frame across the roll; a single member is as
    // thin as 3 px where the shading ramp steps). The interim map's amber-only flare frame 2
    // governs only where no override ships — that art still serves scale 1.
    const override = overrideOf('options/orb');
    const family =
      override === null ? [rgb('#e83838')] : [rgb('#aa0d19'), rgb('#8d0718'), rgb('#640816')];
    for (const frame of v2.manifest.sprites['options/orb'].frames) {
      const img = framePixels(v2, frame);
      let count = 0;
      for (let y = 0; y < img.height; y++) {
        for (let x = 0; x < img.width; x++) {
          const p = getPixel(img, x, y);
          if (p[3] !== 0 && family.some(([r, g, b]) => p[0] === r && p[1] === g && p[2] === b))
            count++;
        }
      }
      // The pulse's flare frame (index 2) burns amber-only like the v1 bright frame; the
      // others carry the red body well past the browser spec's threshold of 8.
      const flare = override === null && Number(frame.slice(frame.lastIndexOf('#') + 1)) === 2;
      expect(count, frame).toBeGreaterThanOrEqual(flare ? 0 : 8);
    }
  });

  it('holds the stolen light grey in every frame (option-hunter.spec census)', () => {
    // w15-REING-6: the shipped stolen orb is the gen6 re-land's drained mauve-grey `#80516c`
    // (3–10 px a frame, the owner's crimson-to-grey corrupted redesign); the interim
    // `#a8a8b4` and the R6-03.S3 `#b5afb4` govern only where no override ships.
    const override = overrideOf('options/stolen');
    const [r, g, b] = rgb(override === null ? '#a8a8b4' : '#80516c');
    for (const frame of v2.manifest.sprites['options/stolen'].frames) {
      const img = framePixels(v2, frame);
      let count = 0;
      for (let y = 0; y < img.height; y++) {
        for (let x = 0; x < img.width; x++) {
          const p = getPixel(img, x, y);
          if (p[3] !== 0 && p[0] === r && p[1] === g && p[2] === b) count++;
        }
      }
      expect(count, frame).toBeGreaterThan(0);
    }
  });
});
