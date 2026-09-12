/**
 * `scripts/assets/procedural/*.mjs` — the seeded placeholder generators, one suite per
 * generator: sizes, frame counts, animations and the visual rules each module documents
 * (bullet readability palette with a dark rim, seamless star tiles, terrain slope
 * profiles, HUD layout, …), plus the shared helpers in `common.mjs` and the registry.
 *
 * Regression (M1-03 test pass): thin bullet shapes exposed their body colour on the
 * silhouette edge — the needle's long sides and the 22.5° ovals had no dark rim there,
 * although `shmup_feat.md` §12 asks for "high-contrast core + dark rim".
 */
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { getPixel, type Image, type Rgba } from '../../../scripts/assets/image.mjs';
import * as bullets from '../../../scripts/assets/procedural/bullets.mjs';
import {
  DIRECTIONS_8,
  color,
  makeSprite,
  mix,
  seedOf,
  withAlpha,
} from '../../../scripts/assets/procedural/common.mjs';
import * as explosions from '../../../scripts/assets/procedural/explosions.mjs';
import * as hud from '../../../scripts/assets/procedural/hud.mjs';
import {
  PROCEDURAL_GENERATORS,
  generateProceduralSprites,
} from '../../../scripts/assets/procedural/index.mjs';
import * as items from '../../../scripts/assets/procedural/items.mjs';
import * as lasers from '../../../scripts/assets/procedural/lasers.mjs';
import * as particles from '../../../scripts/assets/procedural/particles.mjs';
import * as shields from '../../../scripts/assets/procedural/shields.mjs';
import * as starfield from '../../../scripts/assets/procedural/starfield.mjs';
import * as terrain from '../../../scripts/assets/procedural/terrain.mjs';
import * as ui from '../../../scripts/assets/procedural/ui.mjs';
import type { SpriteDef } from '../../../scripts/assets/sprite-source.mjs';
import { comparableSprite } from './sprite-compare.js';

const proceduralDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'scripts',
  'assets',
  'procedural',
);

/**
 * Finds a generated sprite by name.
 *
 * @param sprites - Generator output.
 * @param name - Sprite name.
 * @returns The sprite (the test fails when it is missing).
 */
function byName(sprites: readonly SpriteDef[], name: string): SpriteDef {
  const sprite = sprites.find((s) => s.name === name);
  if (sprite === undefined) throw new Error(`no sprite ${name}`);
  return sprite;
}

/** Whether a pixel is visible (inside the frame and alpha > 0). */
const opaque = (frame: Image, x: number, y: number): boolean => getPixel(frame, x, y)[3] > 0;

/** A colour as a comparable string. */
const key = (rgba: readonly number[]): string => rgba.join(',');

/**
 * Visits every visible pixel.
 *
 * @param frame - The frame.
 * @param visit - Called with the column, row and colour.
 */
function eachOpaque(frame: Image, visit: (x: number, y: number, rgba: Rgba) => void): void {
  for (let y = 0; y < frame.height; y++) {
    for (let x = 0; x < frame.width; x++) {
      const rgba = getPixel(frame, x, y);
      if (rgba[3] > 0) visit(x, y, rgba);
    }
  }
}

/**
 * Counts visible pixels.
 *
 * @param frame - The frame.
 * @returns How many pixels have alpha > 0.
 */
function opaqueCount(frame: Image): number {
  let count = 0;
  eachOpaque(frame, () => {
    count++;
  });
  return count;
}

/**
 * Whether a visible pixel lies on the silhouette edge (a 4-neighbour is transparent or
 * outside the frame).
 *
 * @param frame - The frame.
 * @param x - Column.
 * @param y - Row.
 * @returns `true` on the edge.
 */
function onEdge(frame: Image, x: number, y: number): boolean {
  return (
    !opaque(frame, x - 1, y) ||
    !opaque(frame, x + 1, y) ||
    !opaque(frame, x, y - 1) ||
    !opaque(frame, x, y + 1)
  );
}

/**
 * Relative luminance proxy (Rec. 601 weights) of a colour.
 *
 * @param rgba - Colour.
 * @returns 0…255.
 */
const luma = (rgba: readonly number[]): number =>
  0.299 * rgba[0] + 0.587 * rgba[1] + 0.114 * rgba[2];

/**
 * Hue of a colour in degrees.
 *
 * @param rgba - Colour.
 * @returns 0…360 (0 for greys).
 */
function hue(rgba: readonly number[]): number {
  const [r, g, b] = rgba.map((c) => c / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

/**
 * Rotates a square frame 90° clockwise (reference implementation for the tests).
 *
 * @param frame - Square frame.
 * @returns The rotated bytes.
 */
function rotateCw(frame: Image): Uint8Array {
  const n = frame.width;
  const out = new Uint8Array(frame.data.length);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const from = (y * n + x) * 4;
      out.set(frame.data.subarray(from, from + 4), (x * n + (n - 1 - y)) * 4);
    }
  }
  return out;
}

/**
 * Column heights of a tile: solid pixels per column.
 *
 * @param tile - 8×8 tile.
 * @returns Eight counts.
 */
function columnHeights(tile: Image): number[] {
  return Array.from({ length: tile.width }, (_, x) => {
    let count = 0;
    for (let y = 0; y < tile.height; y++) if (opaque(tile, x, y)) count++;
    return count;
  });
}

describe('scripts/assets/procedural/common', () => {
  it('DIRECTIONS_8 are the exact 22.5° steps, clockwise from +x, as unit vectors', () => {
    DIRECTIONS_8.forEach(([c, s], k) => {
      expect(Math.abs(c * c + s * s - 1)).toBeLessThan(1e-15);
      expect(c).toBeCloseTo(Math.cos((k * Math.PI) / 8), 15);
      expect(s).toBeCloseTo(Math.sin((k * Math.PI) / 8), 15);
    });
    expect(DIRECTIONS_8).toHaveLength(8);
    expect(DIRECTIONS_8[0]).toEqual([1, 0]);
    expect(DIRECTIONS_8[4]).toEqual([0, 1]);
    // Symmetries are exact (bit-identical), not merely close.
    expect(DIRECTIONS_8[2][0]).toBe(DIRECTIONS_8[2][1]);
    expect(DIRECTIONS_8[1]).toEqual([DIRECTIONS_8[3][1], DIRECTIONS_8[3][0]]);
    expect(DIRECTIONS_8[5]).toEqual([-DIRECTIONS_8[3][0], DIRECTIONS_8[3][1]]);
    expect(DIRECTIONS_8[7]).toEqual([-DIRECTIONS_8[1][0], DIRECTIONS_8[1][1]]);
  });

  it('color() parses literals and throws a TypeError for a malformed one', () => {
    expect(color('#f80')).toEqual([255, 136, 0, 255]);
    expect(color('#11223344')).toEqual([17, 34, 51, 68]);
    expect(() => color('orange')).toThrow(TypeError);
    expect(() => color('#12')).toThrow('bad colour literal #12');
  });

  it('mix() interpolates with rounding and returns the endpoints exactly', () => {
    const a: Rgba = [0, 10, 200, 255];
    const b: Rgba = [255, 20, 100, 0];
    expect(mix(a, b, 0)).toEqual(a);
    expect(mix(a, b, 1)).toEqual(b);
    expect(mix([0, 0, 0, 0], [255, 255, 255, 255], 0.5)).toEqual([128, 128, 128, 128]);
    expect(mix(a, b, 0.25)).toEqual([64, 13, 175, 191]);
  });

  it('withAlpha() replaces only the alpha and leaves its input alone', () => {
    const rgba: Rgba = [1, 2, 3, 4];
    expect(withAlpha(rgba, 99)).toEqual([1, 2, 3, 99]);
    expect(rgba).toEqual([1, 2, 3, 4]);
  });

  it('seedOf() is 32-bit FNV-1a (standard test vectors)', () => {
    expect(seedOf('')).toBe(0x811c9dc5);
    expect(seedOf('a')).toBe(0xe40c292c);
    expect(seedOf('foobar')).toBe(0xbf9cf968);
    expect(seedOf('fx/debris')).not.toBe(seedOf('fx/debrit'));
  });

  it('makeSprite() fills the defaults and records the generator as origin', () => {
    const frame = { width: 1, height: 1, data: new Uint8Array(4) };
    expect(makeSprite('ui/x', [frame], 'ui')).toEqual({
      name: 'ui/x',
      anchor: null,
      hitFlash: false,
      frames: [frame],
      animations: {},
      origin: 'procedural:ui',
    });
    expect(
      makeSprite('ui/x', [frame], 'ui', { anchor: [1, 2], hitFlash: true, animations: { a: [0] } }),
    ).toMatchObject({ anchor: [1, 2], hitFlash: true, animations: { a: [0] } });
  });
});

describe('scripts/assets/procedural — registry', () => {
  it('registers every generator module in the folder, by file name', () => {
    const modules = readdirSync(proceduralDir)
      .filter((f) => f.endsWith('.mjs') && f !== 'index.mjs' && f !== 'common.mjs')
      .map((f) => f.slice(0, -'.mjs'.length))
      .sort();
    expect(PROCEDURAL_GENERATORS.map((g) => g.id)).toEqual(modules);
  });

  it('tags every sprite with its generator and keeps frame sizes uniform per sprite', () => {
    for (const generator of PROCEDURAL_GENERATORS) {
      for (const sprite of generator.generate()) {
        expect(sprite.origin).toBe(`procedural:${generator.id}`);
        expect(sprite.frames.length).toBeGreaterThan(0);
        const [first] = sprite.frames;
        for (const frame of sprite.frames) {
          expect([frame.width, frame.height], sprite.name).toEqual([first.width, first.height]);
          expect(frame.data).toHaveLength(frame.width * frame.height * 4);
        }
        for (const [tag, sequence] of Object.entries(sprite.animations)) {
          for (const index of sequence) {
            expect(index, `${sprite.name}.${tag}`).toBeLessThan(sprite.frames.length);
          }
        }
      }
    }
  });

  it('does not depend on generator order (every sprite is seeded from its own name)', () => {
    const forward = generateProceduralSprites();
    const reversed = PROCEDURAL_GENERATORS.slice()
      .reverse()
      .flatMap((g) => g.generate());
    expect(forward).toHaveLength(reversed.length);
    for (const sprite of forward) {
      expect(comparableSprite(byName(reversed, sprite.name))).toEqual(comparableSprite(sprite));
    }
  });
});

describe('scripts/assets/procedural/bullets', () => {
  const sprites = bullets.generate();

  it('draws round (7×7, 1 frame), oval (9×9) and needle (11×11, 8 directions) in each colour', () => {
    expect(sprites.map((s) => s.name).sort()).toEqual(
      ['round', 'oval', 'needle']
        .flatMap((shape) => Object.keys(bullets.BULLET_COLORS).map((c) => `bullets/${shape}-${c}`))
        .sort(),
    );
    for (const sprite of sprites) {
      const size = sprite.name.includes('round') ? 7 : sprite.name.includes('oval') ? 9 : 11;
      expect(sprite.frames).toHaveLength(sprite.name.includes('round') ? 1 : 8);
      for (const frame of sprite.frames) expect([frame.width, frame.height]).toEqual([size, size]);
      expect(sprite.anchor).toBeNull(); // centred by the pipeline
    }
  });

  it('uses exactly three bands per colour: dark rim < saturated body < bright core', () => {
    for (const sprite of sprites) {
      const colours = new Map<string, readonly number[]>();
      for (const frame of sprite.frames) {
        eachOpaque(frame, (_x, _y, rgba) => {
          expect(rgba[3], sprite.name).toBe(255);
          colours.set(key(rgba), rgba);
        });
      }
      const bands = [...colours.values()].sort((a, b) => luma(a) - luma(b));
      expect(bands, sprite.name).toHaveLength(3);
      const colourName = sprite.name.slice(sprite.name.lastIndexOf('-') + 1);
      const body = color(bullets.BULLET_COLORS[colourName as keyof typeof bullets.BULLET_COLORS]);
      expect(bands[1]).toEqual(body);
      expect(luma(bands[0])).toBeLessThan(luma(body) / 2); // high contrast rim
      expect(luma(bands[2])).toBeGreaterThan(luma(body));
    }
  });

  it('outlines every frame with the dark rim (regression: thin shapes exposed the body)', () => {
    for (const sprite of sprites) {
      sprite.frames.forEach((frame, k) => {
        let darkest: Rgba | null = null;
        eachOpaque(frame, (_x, _y, rgba) => {
          if (darkest === null || luma(rgba) < luma(darkest)) darkest = rgba;
        });
        eachOpaque(frame, (x, y, rgba) => {
          if (onEdge(frame, x, y)) {
            expect(key(rgba), `${sprite.name}#${k} edge pixel ${x},${y}`).toBe(key(darkest ?? []));
          }
        });
      });
    }
  });

  it('keeps a bright core inside every frame', () => {
    for (const sprite of sprites) {
      sprite.frames.forEach((frame, k) => {
        let brightest = -1;
        eachOpaque(frame, (_x, _y, rgba) => {
          brightest = Math.max(brightest, luma(rgba));
        });
        let cores = 0;
        eachOpaque(frame, (x, y, rgba) => {
          if (luma(rgba) === brightest) {
            cores++;
            expect(onEdge(frame, x, y), `${sprite.name}#${k} core on the edge`).toBe(false);
          }
        });
        expect(cores, `${sprite.name}#${k}`).toBeGreaterThan(0);
      });
    }
  });

  it('stays pink / red / purple — never the gold of items or the orange of explosions', () => {
    for (const body of Object.values(bullets.BULLET_COLORS)) {
      const h = hue(color(body));
      expect(h < 20 || h > 250, `${body} hue ${h}`).toBe(true);
    }
  });

  it('is centred and point-symmetric in every frame', () => {
    for (const sprite of sprites) {
      for (const frame of sprite.frames) {
        const n = frame.width;
        for (let y = 0; y < n; y++) {
          for (let x = 0; x < n; x++) {
            expect(getPixel(frame, x, y)).toEqual(getPixel(frame, n - 1 - x, n - 1 - y));
          }
        }
      }
    }
  });

  it('makes directional frame k + 4 the exact 90° rotation of frame k', () => {
    for (const sprite of sprites.filter((s) => s.frames.length === 8)) {
      for (let k = 0; k < 4; k++) {
        expect(Buffer.from(sprite.frames[k + 4].data), `${sprite.name} ${k}`).toEqual(
          Buffer.from(rotateCw(sprite.frames[k])),
        );
      }
    }
  });

  it('documents a frame formula that picks the nearest heading: ((a + 32) >> 6) & 7', () => {
    // Binary angles: 1024 units per turn; frame k points k·64 units; shapes are symmetric
    // under a half turn, so headings repeat every 512 units.
    for (let a = 0; a < 1024; a++) {
      const frame = ((a + 32) >> 6) & 7;
      const heading = frame * 64;
      let diff = Math.abs((a % 512) - heading);
      diff = Math.min(diff, 512 - diff);
      expect(diff, `angle ${a}`).toBeLessThanOrEqual(32);
    }
  });
});

describe('scripts/assets/procedural/explosions', () => {
  const sprites = explosions.generate();
  const ramp = new Set<string>();

  it('draws small (16², 6 frames), medium (32², 7) and large (48², 8) with a burst animation', () => {
    expect(sprites.map((s) => [s.name, s.frames.length, s.frames[0].width])).toEqual([
      ['fx/explosion-small', 6, 16],
      ['fx/explosion-medium', 7, 32],
      ['fx/explosion-large', 8, 48],
    ]);
    for (const sprite of sprites) {
      expect(sprite.animations).toEqual({ burst: sprite.frames.map((_, i) => i) });
      for (const frame of sprite.frames) {
        expect(opaqueCount(frame), sprite.name).toBeGreaterThan(0);
        eachOpaque(frame, (_x, _y, rgba) => {
          expect(rgba[3]).toBe(255);
          ramp.add(key(rgba));
        });
      }
    }
    expect(ramp.size).toBeLessThanOrEqual(7); // one hot → cold ramp
  });

  it('starts white-hot in the centre and ends cooler than it started', () => {
    for (const sprite of sprites) {
      const first = sprite.frames[0];
      const last = sprite.frames[sprite.frames.length - 1];
      const c = Math.floor(first.width / 2);
      const centre = getPixel(first, c, c);
      expect(luma(centre), sprite.name).toBeGreaterThan(200);
      let firstLuma = 0;
      let lastLuma = 0;
      eachOpaque(first, (_x, _y, rgba) => {
        firstLuma += luma(rgba);
      });
      eachOpaque(last, (_x, _y, rgba) => {
        lastLuma += luma(rgba);
      });
      expect(lastLuma / opaqueCount(last)).toBeLessThan(firstLuma / opaqueCount(first));
    }
  });
});

describe('scripts/assets/procedural/hud', () => {
  const sprites = hud.generate();

  it('draws three 40×8 meter-slot states with rounded corners, anchored top-left', () => {
    const slot = byName(sprites, 'hud/meter-slot');
    expect(slot.anchor).toEqual([0, 0]);
    expect(slot.animations).toEqual({ normal: [0], highlighted: [1], disabled: [2] });
    expect(slot.frames).toHaveLength(3);
    const borders = new Set<string>();
    for (const frame of slot.frames) {
      expect([frame.width, frame.height]).toEqual([40, 8]);
      for (const [x, y] of [
        [0, 0],
        [39, 0],
        [0, 7],
        [39, 7],
      ]) {
        expect(opaque(frame, x, y)).toBe(false);
      }
      expect(opaqueCount(frame)).toBe(40 * 8 - 4);
      borders.add(key(getPixel(frame, 1, 0)));
      expect(getPixel(frame, 1, 0)).not.toEqual(getPixel(frame, 1, 1)); // border ≠ fill
    }
    expect(borders.size).toBe(3);
  });

  it('draws the seven slot labels in white, centred and all different', () => {
    const labels = byName(sprites, 'hud/meter-labels');
    expect(hud.METER_LABELS).toEqual(['SPEED', 'MISSILE', 'DOUBLE', 'LASER', 'OPTION', '?', '!']);
    expect(labels.frames).toHaveLength(7);
    expect(new Set(labels.frames.map((f) => Buffer.from(f.data).toString('hex'))).size).toBe(7);
    labels.frames.forEach((frame, i) => {
      expect([frame.width, frame.height]).toEqual([36, 5]);
      let minX = frame.width;
      let maxX = -1;
      eachOpaque(frame, (x, _y, rgba) => {
        expect(rgba).toEqual([255, 255, 255, 255]);
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
      });
      const text = hud.METER_LABELS[i];
      const inkWidth = text.length * 4 - 1;
      expect(maxX - minX + 1, text).toBeLessThanOrEqual(inkWidth);
      const pen = Math.floor((36 - inkWidth) / 2);
      expect(minX).toBeGreaterThanOrEqual(pen);
      expect(maxX).toBeLessThan(pen + inkWidth);
      // Centred: the empty margins differ by at most one pixel (plus glyph side bearings).
      expect(Math.abs(pen - (36 - pen - inkWidth))).toBeLessThanOrEqual(1);
    });
  });
});

describe('scripts/assets/procedural/items', () => {
  const [capsule] = items.generate();

  it('draws a 12×8 two-frame blinking capsule with a mirror-symmetric outline', () => {
    expect(capsule.name).toBe('items/capsule');
    expect(capsule.animations).toEqual({ blink: [0, 1] });
    expect(capsule.frames).toHaveLength(2);
    expect(Buffer.from(capsule.frames[0].data)).not.toEqual(Buffer.from(capsule.frames[1].data));
    for (const frame of capsule.frames) {
      expect([frame.width, frame.height]).toEqual([12, 8]);
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 12; x++) {
          expect(opaque(frame, x, y)).toBe(opaque(frame, 11 - x, y));
          expect(opaque(frame, x, y)).toBe(opaque(frame, x, 7 - y));
        }
      }
    }
  });

  it('outlines both frames with the dark rim and keeps the silhouette identical', () => {
    const rim = color('#5a1408');
    for (const frame of capsule.frames) {
      eachOpaque(frame, (x, y, rgba) => {
        if (onEdge(frame, x, y)) expect(rgba).toEqual(rim);
      });
    }
    const [a, b] = capsule.frames;
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 12; x++) expect(opaque(a, x, y)).toBe(opaque(b, x, y));
    }
  });
});

describe('scripts/assets/procedural/particles', () => {
  const sprites = particles.generate();

  it('draws a 5×5 spark whose plus-shaped arms shrink (9 → 5 → 1 pixels)', () => {
    const spark = byName(sprites, 'fx/spark');
    expect(spark.animations).toEqual({ fade: [0, 1, 2] });
    expect(spark.frames.map((f) => [f.width, f.height])).toEqual([
      [5, 5],
      [5, 5],
      [5, 5],
    ]);
    expect(spark.frames.map(opaqueCount)).toEqual([9, 5, 1]);
    for (const frame of spark.frames) expect(opaque(frame, 2, 2)).toBe(true);
  });

  it('draws a 5×5 pale-gold sparkle that twinkles down to one pixel (M1-14)', () => {
    const sparkle = byName(sprites, 'fx/sparkle');
    expect(sparkle.animations).toEqual({ twinkle: [0, 1, 2, 3] });
    expect(sparkle.frames.map((f) => [f.width, f.height])).toEqual(Array(4).fill([5, 5]));
    expect(sparkle.frames.map(opaqueCount)).toEqual([9, 9, 5, 1]);
    for (const frame of sparkle.frames) expect(opaque(frame, 2, 2)).toBe(true);
  });

  it('draws a 9×9 one-pixel ring that grows over four frames (M1-14)', () => {
    const ring = byName(sprites, 'fx/ring');
    expect(ring.animations).toEqual({ grow: [0, 1, 2, 3] });
    expect(ring.frames.map((f) => [f.width, f.height])).toEqual(Array(4).fill([9, 9]));
    const counts = ring.frames.map(opaqueCount);
    for (let k = 1; k < 4; k++) expect(counts[k]).toBeGreaterThan(counts[k - 1]);
    // Hollow: the centre pixel is never set.
    for (const frame of ring.frames) expect(opaque(frame, 4, 4)).toBe(false);
  });

  it('draws 6×6 debris that tumbles in exact 90° turns', () => {
    const debris = byName(sprites, 'fx/debris');
    expect(debris.animations).toEqual({ tumble: [0, 1, 2, 3] });
    expect(debris.frames).toHaveLength(4);
    expect(opaqueCount(debris.frames[0])).toBeGreaterThan(3);
    for (let k = 0; k < 4; k++) {
      expect(Buffer.from(debris.frames[(k + 1) % 4].data)).toEqual(
        Buffer.from(rotateCw(debris.frames[k])),
      );
    }
  });
});

describe('scripts/assets/procedural/shields', () => {
  const [field] = shields.generate();

  it('draws four 30×24 wear states that lose pixels as they wear', () => {
    expect(field.name).toBe('shields/force-field');
    expect(field.animations).toEqual({ fresh: [0], worn: [1], damaged: [2], critical: [3] });
    expect(field.frames.map((f) => [f.width, f.height])).toEqual(Array(4).fill([30, 24]));
    const counts = field.frames.map(opaqueCount);
    for (let s = 1; s < 4; s++) expect(counts[s]).toBeLessThan(counts[s - 1]);
  });

  it('has an inner glow (translucent) except in the critical state, and a whole fresh ring', () => {
    const translucent = field.frames.map((frame) => {
      let count = 0;
      eachOpaque(frame, (_x, _y, rgba) => {
        if (rgba[3] < 255) count++;
      });
      return count;
    });
    expect(translucent.slice(0, 3).every((n) => n > 0)).toBe(true);
    expect(translucent[3]).toBe(0);
    const fresh = field.frames[0];
    for (let y = 0; y < 24; y++) {
      for (let x = 0; x < 30; x++) {
        expect(getPixel(fresh, x, y)).toEqual(getPixel(fresh, 29 - x, y));
        expect(getPixel(fresh, x, y)).toEqual(getPixel(fresh, x, 23 - y));
      }
    }
  });
});

describe('scripts/assets/procedural/starfield', () => {
  const sprites = starfield.generate();

  it('draws three 128×128 top-left-anchored layers, far the densest and dimmest', () => {
    expect(sprites.map((s) => s.name)).toEqual(['bg/stars-far', 'bg/stars-mid', 'bg/stars-near']);
    const averages = sprites.map((sprite) => {
      expect(sprite.anchor).toEqual([0, 0]);
      expect(sprite.frames).toHaveLength(1);
      const [frame] = sprite.frames;
      expect([frame.width, frame.height]).toEqual([
        starfield.STAR_TILE_SIZE,
        starfield.STAR_TILE_SIZE,
      ]);
      let total = 0;
      eachOpaque(frame, (_x, _y, rgba) => {
        total += luma(rgba);
      });
      return total / opaqueCount(frame);
    });
    expect(averages[0]).toBeLessThan(averages[1]);
    expect(averages[1]).toBeLessThan(averages[2]);
    const [far, mid] = sprites.map((s) => opaqueCount(s.frames[0]));
    expect(far).toBeGreaterThan(mid);
  });

  it('keeps a 2-px empty margin so the tiles repeat seamlessly (nothing wraps)', () => {
    for (const sprite of sprites) {
      const [frame] = sprite.frames;
      eachOpaque(frame, (x, y) => {
        expect(x, sprite.name).toBeGreaterThanOrEqual(2);
        expect(y, sprite.name).toBeGreaterThanOrEqual(2);
        expect(x, sprite.name).toBeLessThanOrEqual(frame.width - 3);
        expect(y, sprite.name).toBeLessThanOrEqual(frame.height - 3);
      });
    }
  });

  it('draws near stars as crosses (white core, four arms) and never on a black ground', () => {
    const [near] = byName(sprites, 'bg/stars-near').frames;
    let cores = 0;
    eachOpaque(near, (x, y, rgba) => {
      if (key(rgba) !== '255,255,255,255') return;
      cores++;
      for (const [dx, dy] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ]) {
        expect(opaque(near, x + dx, y + dy)).toBe(true);
      }
    });
    expect(cores).toBeGreaterThan(5);
    for (const sprite of sprites) {
      eachOpaque(sprite.frames[0], (_x, _y, rgba) => {
        expect(luma(rgba)).toBeGreaterThan(40);
      });
    }
  });
});

describe('scripts/assets/procedural/terrain', () => {
  const [tileset] = terrain.generate();
  const tile = (name: (typeof terrain.TERRAIN_TILES)[number]): Image =>
    tileset.frames[terrain.TERRAIN_TILES.indexOf(name)];

  it('draws 17 top-left-anchored 8×8 tiles, each also a one-frame animation by name', () => {
    expect(tileset.name).toBe('tiles/terrain-a');
    expect(tileset.anchor).toEqual([0, 0]);
    expect(tileset.frames).toHaveLength(17);
    expect(terrain.TILE_SIZE).toBe(8);
    for (const frame of tileset.frames) expect([frame.width, frame.height]).toEqual([8, 8]);
    expect(Object.keys(tileset.animations)).toEqual([...terrain.TERRAIN_TILES]);
    terrain.TERRAIN_TILES.forEach((name, i) => expect(tileset.animations[name]).toEqual([i]));
  });

  it.each([
    ['solid', [8, 8, 8, 8, 8, 8, 8, 8]],
    ['floor', [8, 8, 8, 8, 8, 8, 8, 8]],
    ['slope-up', [1, 2, 3, 4, 5, 6, 7, 8]],
    ['slope-down', [8, 7, 6, 5, 4, 3, 2, 1]],
    ['slope-up-low', [0, 1, 1, 2, 2, 3, 3, 4]],
    ['slope-up-high', [4, 5, 5, 6, 6, 7, 7, 8]],
    ['slope-down-high', [8, 7, 7, 6, 6, 5, 5, 4]],
    ['slope-down-low', [4, 3, 3, 2, 2, 1, 1, 0]],
  ] as const)('gives %s the column heights %j (solid from the bottom)', (name, heights) => {
    const frame = tile(name);
    expect(columnHeights(frame)).toEqual(heights);
    // Solid pixels are contiguous from the tile bottom (floor tiles).
    for (let x = 0; x < 8; x++) {
      for (let y = 0; y < 8; y++) expect(opaque(frame, x, y)).toBe(8 - y <= heights[x]);
    }
  });

  it('chains slopes into a staircase without gaps (steps of at most 1 px)', () => {
    /**
     * Asserts a height profile only ever rises, by 0 or 1 px per column.
     *
     * @param heights - Absolute column heights.
     */
    const expectStaircase = (heights: number[]): void => {
      for (let i = 1; i < heights.length; i++) {
        expect(heights[i] - heights[i - 1], `column ${i}`).toBeGreaterThanOrEqual(0);
        expect(heights[i] - heights[i - 1], `column ${i}`).toBeLessThanOrEqual(1);
      }
    };
    const low = columnHeights(tile('slope-up-low'));
    const high = columnHeights(tile('slope-up-high'));
    const up = columnHeights(tile('slope-up'));
    const raise = (heights: number[]): number[] => heights.map((h) => h + 8);
    // Two 22.5° slopes in a row (the second one tile row higher), then 45° tile after tile.
    expectStaircase([...low, ...high, ...raise(low), ...raise(high)]);
    expectStaircase([...up, ...raise(up)]);
    expectStaircase([8, ...raise(low)]); // a flat floor running into a 22.5° slope
  });

  it('builds ceilings, walls and "down" variants by exact flips and a transpose', () => {
    const flipH = (image: Image): string[] =>
      Array.from({ length: 8 }, (_, y) =>
        Array.from({ length: 8 }, (_x, x) => key(getPixel(image, 7 - x, y))).join('|'),
      );
    const flipV = (image: Image): string[] =>
      Array.from({ length: 8 }, (_, y) =>
        Array.from({ length: 8 }, (_x, x) => key(getPixel(image, x, 7 - y))).join('|'),
      );
    const transpose = (image: Image): string[] =>
      Array.from({ length: 8 }, (_, y) =>
        Array.from({ length: 8 }, (_x, x) => key(getPixel(image, y, x))).join('|'),
      );
    const rows = (image: Image): string[] =>
      Array.from({ length: 8 }, (_, y) =>
        Array.from({ length: 8 }, (_x, x) => key(getPixel(image, x, y))).join('|'),
      );
    expect(rows(tile('ceiling'))).toEqual(flipV(tile('floor')));
    expect(rows(tile('wall-left'))).toEqual(transpose(tile('floor')));
    expect(rows(tile('wall-right'))).toEqual(flipH(tile('wall-left')));
    expect(rows(tile('slope-down'))).toEqual(flipH(tile('slope-up')));
    expect(rows(tile('slope-down-low'))).toEqual(flipH(tile('slope-up-low')));
    expect(rows(tile('slope-down-high'))).toEqual(flipH(tile('slope-up-high')));
    for (const name of [
      'slope-up',
      'slope-down',
      'slope-up-low',
      'slope-up-high',
      'slope-down-high',
      'slope-down-low',
    ] as const) {
      expect(rows(tile(`ceil-${name}`)), name).toEqual(flipV(tile(name)));
    }
  });

  it('rims every open-facing surface and joins rock seamlessly with the solid tile', () => {
    const surface = color('#8ad0a8');
    for (const name of [
      'floor',
      'slope-up',
      'slope-up-low',
      'slope-up-high',
      'slope-down',
    ] as const) {
      const frame = tile(name);
      for (let x = 0; x < 8; x++) {
        const top = [...Array(8).keys()].find((y) => opaque(frame, x, y));
        if (top !== undefined)
          expect(getPixel(frame, x, top), `${name} column ${x}`).toEqual(surface);
      }
    }
    // The solid tile has no rim at all; below the two surface rows every floor-type tile
    // uses the same position-based rock texture, so tiles join without seams.
    const solid = tile('solid');
    eachOpaque(solid, (_x, _y, rgba) => expect(rgba).not.toEqual(surface));
    for (let y = 2; y < 8; y++) {
      for (let x = 0; x < 8; x++)
        expect(getPixel(tile('floor'), x, y)).toEqual(getPixel(solid, x, y));
    }
    expect(opaqueCount(solid)).toBe(64);
  });
});

describe('scripts/assets/procedural/ui', () => {
  const sprites = ui.generate();

  it('makes ui/pixel one opaque white pixel anchored at its top-left', () => {
    const pixel = byName(sprites, 'ui/pixel');
    expect(pixel.anchor).toEqual([0, 0]);
    expect(pixel.frames).toHaveLength(1);
    expect(Array.from(pixel.frames[0].data)).toEqual([255, 255, 255, 255]);
  });

  it('makes ui/missing an opaque 8×8 magenta/black checker of 2×2 cells, centred', () => {
    const missing = byName(sprites, 'ui/missing');
    expect(missing.anchor).toBeNull();
    const [frame] = missing.frames;
    expect([frame.width, frame.height]).toEqual([8, 8]);
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const magenta = ((x >> 1) + (y >> 1)) % 2 === 0;
        expect(getPixel(frame, x, y)).toEqual(magenta ? [255, 0, 255, 255] : [0, 0, 0, 255]);
      }
    }
  });

  it('makes ui/logo "SHMUP CUP" in ×3 block letters with outline and shadow, centred (M1-16)', () => {
    const logo = byName(sprites, 'ui/logo');
    expect(ui.LOGO_TEXT).toBe('SHMUP CUP');
    expect(logo.frames).toHaveLength(1);
    const [frame] = logo.frames;
    // 9 cells of 5 + 8 gaps of 1 = 53 letter pixels ×3, plus a 3-px margin on every side.
    expect([frame.width, frame.height]).toEqual([53 * 3 + 6, 7 * 3 + 6]);
    expect(logo.anchor).toEqual([Math.floor(frame.width / 2), Math.floor(frame.height / 2)]);
    // The S's top bar starts one cell in (".####"): first letter pixel at margin + 3.
    expect(getPixel(frame, 3 + 3, 3)[3]).toBe(255);
    expect(getPixel(frame, 5, 3)).toEqual([0x1b, 0x2a, 0x4a, 255]); // the outline left of it
    // Letters run from light yellow at the top to red at the bottom.
    const top = getPixel(frame, 3 + 4, 3 + 1);
    const bottom = getPixel(frame, 3 + 1, 3 + 20);
    expect(top[1]).toBeGreaterThan(bottom[1]);
    expect(bottom[0]).toBeGreaterThan(bottom[1]);
    // The corners stay transparent; the space between the words too.
    expect(getPixel(frame, 0, 0)[3]).toBe(0);
    expect(getPixel(frame, 3 + 30 * 3 + 1, 3 + 10)[3]).toBe(0);
  });
});

describe('scripts/assets/procedural/lasers', () => {
  const sprites = lasers.generate();

  it('draws one beam per bullet colour: 8 frames of 4×8, frame k a band k + 1 px tall', () => {
    expect(sprites.map((s) => s.name).sort()).toEqual(
      Object.keys(bullets.BULLET_COLORS)
        .map((c) => `lasers/beam-${c}`)
        .sort(),
    );
    for (const sprite of sprites) {
      expect(sprite.frames).toHaveLength(lasers.BEAM_HEIGHT);
      sprite.frames.forEach((frame, k) => {
        expect([frame.width, frame.height]).toEqual([lasers.BEAM_WIDTH, lasers.BEAM_HEIGHT]);
        let rows = 0;
        for (let y = 0; y < frame.height; y++) if (getPixel(frame, 0, y)[3] === 255) rows++;
        expect(rows, `${sprite.name}#${k}`).toBe(k + 1);
      });
    }
  });

  it('repeats every column (stretchable), centres the band and keeps it symmetric', () => {
    for (const sprite of sprites) {
      sprite.frames.forEach((frame, k) => {
        const top = Math.floor((lasers.BEAM_HEIGHT - (k + 1)) / 2);
        for (let y = 0; y < frame.height; y++) {
          for (let x = 1; x < frame.width; x++) {
            expect(getPixel(frame, x, y)).toEqual(getPixel(frame, 0, y));
          }
          const inBand = y >= top && y <= top + k;
          expect(getPixel(frame, 0, y)[3], `${sprite.name}#${k} row ${y}`).toBe(inBand ? 255 : 0);
          if (inBand) {
            expect(getPixel(frame, 0, y)).toEqual(getPixel(frame, 0, 2 * top + k - y));
          }
        }
      });
    }
  });

  it('bands rim < body < core (rim from 3 px, body from 5 px)', () => {
    const palette: { rim: Rgba; body: Rgba; core: Rgba } = {
      rim: [1, 0, 0, 255],
      body: [2, 0, 0, 255],
      core: [3, 0, 0, 255],
    };
    const names = (h: number): number[] => lasers.bandRows(h, palette).map((c) => c[0]);
    expect([1, 2, 3, 4, 5, 8].map(names)).toEqual([
      [3],
      [3, 3],
      [1, 3, 1],
      [1, 3, 3, 1],
      [1, 2, 3, 2, 1],
      [1, 2, 3, 3, 3, 3, 2, 1],
    ]);
    for (const sprite of sprites) {
      const frame = sprite.frames[lasers.BEAM_HEIGHT - 1];
      const colourName = sprite.name.slice(sprite.name.lastIndexOf('-') + 1);
      const body = color(bullets.BULLET_COLORS[colourName as keyof typeof bullets.BULLET_COLORS]);
      expect(getPixel(frame, 0, 1)).toEqual(body);
      expect(luma(getPixel(frame, 0, 0))).toBeLessThan(luma(body) / 2);
      expect(luma(getPixel(frame, 0, 3))).toBeGreaterThan(luma(body));
    }
  });
});
