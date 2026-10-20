/**
 * Helpers shared by the per-zone placeholder-art tests `procedural-zone-{b,…,i}.test.ts` and
 * `procedural-zone-{b,…,i}-edge.test.ts` (R5-P.P5c split them out of the zone-pair files
 * `procedural-zones*.test.ts`). Each is exactly the function the pair files held; only
 * `hurtboxesInside` gained the optional `rounded` set (the former `procedural-zones-fg.test.ts`
 * variant, which the `procedural-zones-de.test.ts` call site used none of).
 *
 * @module
 */
import { readFileSync } from 'node:fs';
import { expect } from 'vitest';
import { getPixel, type Image } from '../../../scripts/assets/image.mjs';
import { buildAtlas } from '../../../scripts/assets/pipeline.mjs';
import type { SpriteDef } from '../../../scripts/assets/sprite-source.mjs';

/**
 * A sprite of a generator's output by name.
 *
 * @param sprites - The output.
 * @param name - Sprite name.
 * @returns The sprite.
 */
export function byName(sprites: readonly SpriteDef[], name: string): SpriteDef {
  const sprite = sprites.find((s) => s.name === name);
  if (sprite === undefined) throw new Error(`no ${name}`);
  return sprite;
}

/**
 * The `#rrggbb` colours of an image's opaque pixels.
 *
 * @param image - The image.
 * @returns The set of colours.
 */
export function opaqueColours(image: Image): Set<string> {
  const out = new Set<string>();
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const [r, g, b, a] = getPixel(image, x, y);
      if (a === 255) out.add('#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join(''));
    }
  }
  return out;
}

/**
 * Whether an image is the vertical mirror of another.
 *
 * @param a - One image.
 * @param b - The other.
 * @returns `true` when row `y` of `a` is row `h − 1 − y` of `b`.
 */
export function mirroredVertically(a: Image, b: Image): boolean {
  if (a.width !== b.width || a.height !== b.height) return false;
  for (let y = 0; y < a.height; y++) {
    for (let x = 0; x < a.width; x++) {
      if (getPixel(a, x, y).join() !== getPixel(b, x, a.height - 1 - y).join()) return false;
    }
  }
  return true;
}

/**
 * Whether a frame is clearly visible: at least a quarter of its pixels at least half opaque.
 *
 * @param image - The frame.
 * @returns `true` when enough is drawn.
 */
export function drawn(image: Image): boolean {
  let solid = 0;
  for (let i = 3; i < image.data.length; i += 4) if (image.data[i] >= 128) solid++;
  return solid * 4 >= image.width * image.height;
}

/**
 * How much the first and last columns of a band differ (mean alpha step per row).
 *
 * @param image - The band.
 * @returns Mean absolute alpha difference.
 */
export function seam(image: Image): number {
  let step = 0;
  for (let y = 0; y < image.height; y++) {
    step += Math.abs(getPixel(image, 0, y)[3] - getPixel(image, image.width - 1, y)[3]);
  }
  return step / image.height;
}

/**
 * Every frame of every sprite as text (base64 per frame), for byte comparisons.
 *
 * @param sprites - The sprites.
 * @returns One string per sprite.
 */
export function bytes(sprites: readonly SpriteDef[]): string[] {
  return sprites.map(
    (s) => s.name + ':' + s.frames.map((f) => Buffer.from(f.data).toString('base64')).join('|'),
  );
}

/**
 * A shipped JSON file below `content/`.
 *
 * @param path - Its path.
 * @returns The parsed data.
 */
export function content<T>(path: string): T {
  return JSON.parse(
    readFileSync(new URL('../../../content/' + path, import.meta.url), 'utf8'),
  ) as T;
}

/**
 * Whether the pixels of a tile's first and last rows (and columns) match — a band that repeats
 * across and down without a seam.
 *
 * @param image - The tile.
 * @returns The share of edge pixels whose opposite edge pixel has the same colour (0 … 1).
 */
export function wraps(image: Image): number {
  let same = 0;
  let all = 0;
  const near = (a: readonly number[], b: readonly number[]): boolean =>
    a.every((v, k) => Math.abs(v - b[k]) <= 48);
  for (let y = 0; y < image.height; y++) {
    all++;
    if (near(getPixel(image, 0, y), getPixel(image, image.width - 1, y))) same++;
  }
  for (let x = 0; x < image.width; x++) {
    all++;
    if (near(getPixel(image, x, 0), getPixel(image, x, image.height - 1))) same++;
  }
  return same / all;
}

/**
 * Checks that every animated sprite's frames really differ.
 *
 * @param sprites - A generator's output.
 */
export function framesDiffer(sprites: readonly SpriteDef[]): void {
  for (const sprite of sprites) {
    const frames = sprite.frames.map((f) => Array.from(f.data).join());
    if (frames.length > 1) expect(new Set(frames).size, sprite.name).toBe(frames.length);
  }
}

/** An enemy entry's hurtbox, as the rosters write it. */
export interface RosterEnemy {
  /** Enemy id. */
  readonly id: string;
  /** Sprite (regular enemies). */
  readonly sprite?: string;
  /** Box hurtbox. */
  readonly hurtbox?: { readonly hw: number; readonly hh: number };
  /** Boss section. */
  readonly boss?: {
    readonly parts: readonly {
      readonly name: string;
      readonly sprite?: string;
      readonly hurtbox?: { readonly hw: number; readonly hh: number };
      readonly radius?: number;
    }[];
  };
}

/**
 * Checks that every hurtbox of a roster lies inside the frame of the sprite drawn for it — the
 * **atlas** frame (R2-02.T4c): the interim art is ×1.5 (R2-01) and the two-scale kit ports the
 * roster's boxes ×1.5 too (with O4's rounding), so only the packed sizes compare fairly. A sprite
 * missing from the manifest measures 0×0 and fails the box loudly.
 *
 * @param roster - Path of the roster below `content/`.
 * @param rounded - The box labels W5-3 allows the one rounded pixel (checked to be all seen);
 * zones whose ported boxes all sit strictly inside (B … E) pass none.
 */
export function hurtboxesInside(roster: string, rounded: ReadonlySet<string> = new Set()): void {
  const { enemies } = content<{ enemies: RosterEnemy[] }>(roster);
  const { manifest } = buildAtlas();
  const size = (sprite: string): [number, number] => {
    const frame = manifest.frames[manifest.sprites[sprite]?.frames[0] ?? ''];
    return frame === undefined ? [0, 0] : [frame.w, frame.h];
  };
  const boxes: [string, string, number, number][] = [];
  for (const enemy of enemies) {
    if (enemy.sprite !== undefined && enemy.hurtbox !== undefined) {
      boxes.push([enemy.id, enemy.sprite, enemy.hurtbox.hw, enemy.hurtbox.hh]);
    }
    for (const part of enemy.boss?.parts ?? []) {
      if (part.sprite === undefined) continue;
      if (part.hurtbox !== undefined)
        boxes.push([part.name, part.sprite, part.hurtbox.hw, part.hurtbox.hh]);
      if (part.radius !== undefined) boxes.push([part.name, part.sprite, part.radius, part.radius]);
    }
  }
  expect(boxes.length).toBeGreaterThan(8);
  const seen = new Set<string>();
  for (const [who, sprite, hw, hh] of boxes) {
    const [w, h] = size(sprite);
    const allowance = rounded.has(who) ? 1 : 0;
    if (allowance === 1) seen.add(who);
    expect(2 * hw, who).toBeLessThanOrEqual(w + allowance);
    expect(2 * hh, who).toBeLessThanOrEqual(h + allowance);
  }
  // The allowance list must not rot: every named box has to be a box of this roster.
  expect([...seen].sort()).toEqual([...rounded].sort());
}
