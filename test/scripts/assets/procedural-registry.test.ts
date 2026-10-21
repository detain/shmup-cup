/**
 * The generator registry: every module in `scripts/assets/procedural/` is registered
 * and every sprite carries its generator origin. Split out of `procedural.test.ts` by R4-P.P2.
 * @module
 */
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  PROCEDURAL_GENERATORS,
  generateProceduralSprites,
} from '../../../scripts/assets/procedural/index.mjs';
import { comparableSprite } from './sprite-compare.js';
import { byName } from './procedural-helpers.js';

const proceduralDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'scripts',
  'assets',
  'procedural',
);

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
