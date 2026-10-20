/**
 * Edge cases of the zone C placeholder art (split out of `procedural-zones-edge.test.ts` by
 * R5-P.P5c), beyond `procedural-zone-c.test.ts`: the dune generator — deterministic, frozen name
 * list, every frame of a sprite the same size, every sprite that can be hit clearly visible in
 * every frame (a quarter of it ≥ half opaque). The shape helpers' and brine's edge cases, and the
 * zone B and C hurtbox check, stayed in `procedural-zone-b-edge.test.ts`.
 *
 * @module
 */
import { describe, expect, it } from 'vitest';
import * as dune from '../../../scripts/assets/procedural/dune.mjs';
import type { SpriteDef } from '../../../scripts/assets/sprite-source.mjs';
import { drawn } from './procedural-zone-helpers.js';

describe('scripts/assets/procedural brine / dune — every sprite (M2-11)', () => {
  const sets: readonly [string, readonly string[], () => SpriteDef[]][] = [
    ['dune', dune.DUNE_SPRITES, dune.generate],
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
