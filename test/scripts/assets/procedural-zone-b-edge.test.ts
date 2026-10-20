/**
 * Edge cases of the zone B placeholder art and of the `common.mjs` shape helpers (split out of
 * `procedural-zones-edge.test.ts` by R5-P.P5c; the cross-zone tests stayed with the earlier zone
 * of their pair), beyond `procedural-zone-b.test.ts`:
 *
 * - `drawLine`: a zero-length line is one dot (a single pixel, or a plus of five at width 3), a
 *   horizontal line covers exactly its span, lines overhanging the image are clipped;
 * - `fillEllipse`: a radius below half a pixel paints only the centre pixel, `paint` gets the
 *   pixel's own coordinates, a centre between pixels paints a mirror-symmetric shape;
 * - the brine generator: deterministic, frozen name list, every frame of a sprite the same size,
 *   every sprite that can be hit is clearly visible in every frame (a quarter of it ≥ half opaque);
 * - the rosters: every zone B and C hurtbox fits inside the sprite drawn for it (a shot never
 *   hits empty space around the art). Zone C's own edge cases are in `procedural-zone-c-edge.test.ts`.
 *
 * @module
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createImage, getPixel, type Image } from '../../../scripts/assets/image.mjs';
import { buildAtlas } from '../../../scripts/assets/pipeline.mjs';
import * as brine from '../../../scripts/assets/procedural/brine.mjs';
import { color, drawLine, fillEllipse } from '../../../scripts/assets/procedural/common.mjs';
import type { SpriteDef } from '../../../scripts/assets/sprite-source.mjs';
import { drawn } from './procedural-zone-helpers.js';

/**
 * The painted (alpha > 0) pixels of an image as `x,y` strings.
 *
 * @param image - The image.
 * @returns Them, row by row.
 */
function painted(image: Image): string[] {
  const out: string[] = [];
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) if (getPixel(image, x, y)[3] > 0) out.push(`${x},${y}`);
  }
  return out;
}

describe('scripts/assets/procedural/common drawLine — edge cases (M2-11)', () => {
  const red = color('#ff0000');

  it('draws a zero-length line as one dot: a pixel, or a plus of five at width 3', () => {
    const thin = createImage(7, 7);
    drawLine(thin, 3, 3, 3, 3, red);
    expect(painted(thin)).toEqual(['3,3']);
    const wide = createImage(7, 7);
    drawLine(wide, 3, 3, 3, 3, red, 3);
    expect(painted(wide)).toEqual(['3,2', '2,3', '3,3', '4,3', '3,4']);
  });

  it('covers exactly the span of a horizontal line', () => {
    const image = createImage(12, 3);
    drawLine(image, 2, 1, 9, 1, red);
    expect(painted(image)).toEqual(Array.from({ length: 8 }, (_v, i) => `${String(i + 2)},1`));
  });

  it('clips a line that overhangs the image instead of failing', () => {
    const image = createImage(10, 10);
    expect(() => drawLine(image, -5, -5, 20, 20, red, 3)).not.toThrow();
    for (let i = 0; i < 10; i++) expect(getPixel(image, i, i)).toEqual([255, 0, 0, 255]);
    expect(getPixel(image, 9, 0)[3]).toBe(0);
    expect(getPixel(image, 0, 9)[3]).toBe(0);
  });
});

describe('scripts/assets/procedural/common fillEllipse — edge cases (M2-11)', () => {
  const white = color('#ffffff');

  it('paints only the centre pixel for a radius under half a pixel', () => {
    const image = createImage(5, 5);
    const calls: number[][] = [];
    fillEllipse(image, 2, 2, 0.4, 0.4, (u, v, e, x, y) => {
      calls.push([u, v, e, x, y]);
      return white;
    });
    expect(calls).toEqual([[0, 0, 0, 2, 2]]);
    expect(painted(image)).toEqual(['2,2']);
  });

  it('hands paint each pixel’s own coordinates, and paints a centre between pixels symmetrically', () => {
    const image = createImage(6, 5);
    fillEllipse(image, 2.5, 2, 2, 2, (_u, _v, _e, x, y) => {
      expect(Number.isInteger(x) && Number.isInteger(y)).toBe(true);
      return [x * 40, y * 50, 0, 255];
    });
    for (let y = 0; y < image.height; y++) {
      for (let x = 0; x < image.width; x++) {
        const [r, g, , a] = getPixel(image, x, y);
        if (a > 0) expect([r, g]).toEqual([x * 40, y * 50]);
        // Mirrored about x = 2.5 (column x ↔ column 5 − x).
        expect(a, `${String(x)},${String(y)}`).toBe(getPixel(image, 5 - x, y)[3]);
      }
    }
    expect(painted(image).length).toBeGreaterThan(8);
  });
});

describe('scripts/assets/procedural brine / dune — every sprite (M2-11)', () => {
  const sets: readonly [string, readonly string[], () => SpriteDef[]][] = [
    ['brine', brine.BRINE_SPRITES, brine.generate],
  ];

  it.each(sets)(
    '%s: frozen names, frames of one size, every hit sprite clearly visible',
    (_id, names, generate) => {
      expect(Object.isFrozen(names)).toBe(true);
      expect(new Set(names).size).toBe(names.length);
      for (const sprite of generate()) {
        const [first, ...rest] = sprite.frames;
        for (const frame of rest) {
          expect([frame.width, frame.height], sprite.name).toEqual([first.width, first.height]);
        }
        if (sprite.hitFlash === true) {
          for (const frame of sprite.frames) expect(drawn(frame), sprite.name).toBe(true);
        }
      }
    },
  );

  it.each(sets)('%s: draws the same pixels every run', (_id, _names, generate) => {
    const hash = (sprites: SpriteDef[]): string[] =>
      sprites.map(
        (s) => s.name + ':' + s.frames.map((f) => Buffer.from(f.data).toString('base64')).join('|'),
      );
    expect(hash(generate())).toEqual(hash(generate()));
  });
});

describe('zone B and C hurtboxes fit their art (M2-11)', () => {
  /** A hurtbox in the roster JSON. */
  interface Box {
    hw: number;
    hh: number;
  }
  /** A roster entry (the fields read here). */
  interface Entry {
    id: string;
    sprite?: string;
    hurtbox?: Box | null;
    boss?: { parts: { name: string; sprite?: string; hurtbox?: Box | null }[] };
  }

  it('keeps every hurtbox inside the frame of the sprite drawn for it', () => {
    // The **atlas** frame is the measure (R2-02.T4c): the interim art is ×1.5 (R2-01) and the
    // two-scale kit ports these rosters' boxes ×1.5 too, so only the packed sizes compare fairly.
    // Zones B and C need no W5-3 rounding allowance (`docs/v2-run/helpers/w5pre/hurtbox.mjs`
    // counts none). A sprite missing from the manifest measures 0×0 and fails the box loudly.
    const { manifest } = buildAtlas();
    const size = (sprite: string): [number, number] => {
      const frame = manifest.frames[manifest.sprites[sprite]?.frames[0] ?? ''];
      return frame === undefined ? [0, 0] : [frame.w, frame.h];
    };
    let checked = 0;
    for (const zone of ['zone-b', 'zone-c']) {
      const roster = JSON.parse(
        readFileSync(
          new URL(`../../../content/enemies/${zone}.enemies.json`, import.meta.url),
          'utf8',
        ),
      ) as { enemies: Entry[] };
      for (const entry of roster.enemies) {
        const bodies =
          entry.boss === undefined
            ? [{ name: entry.id, sprite: entry.sprite, hurtbox: entry.hurtbox }]
            : entry.boss.parts.map((p) => ({
                name: `${entry.id}.${p.name}`,
                sprite: p.sprite,
                hurtbox: p.hurtbox,
              }));
        for (const body of bodies) {
          if (body.hurtbox === undefined || body.hurtbox === null || body.sprite === undefined) {
            continue;
          }
          const [w, h] = size(body.sprite);
          expect(body.hurtbox.hw * 2, body.name).toBeLessThanOrEqual(w);
          expect(body.hurtbox.hh * 2, body.name).toBeLessThanOrEqual(h);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThanOrEqual(30);
  });
});
