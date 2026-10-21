/**
 * The black-hole vortex sprite (`scripts/assets/procedural/blackhole.mjs`, split out of
 * `particles.mjs` by plan R4-P.P1). Split out of `procedural.test.ts` by plan R4-P.P2.
 *
 * @module
 */
import { BLACK_HOLE_FRAMES } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { buildAtlas } from '../../../scripts/assets/pipeline.mjs';
import * as blackhole from '../../../scripts/assets/procedural/blackhole.mjs';
import { byName } from './procedural-helpers.js';

describe('scripts/assets/procedural/blackhole', () => {
  const sprites = blackhole.generate();
  const hole = byName(sprites, 'fx/black-hole');

  it('makes fx/black-hole the four-frame vortex and burst (M3-02)', () => {
    expect(sprites.map((s) => s.name)).toEqual(['fx/black-hole']);
    expect(hole.origin).toBe('procedural:blackhole');
    expect(hole.frames).toHaveLength(4);
    for (const frame of hole.frames) expect([frame.width, frame.height]).toEqual([32, 32]);
    expect(hole.animations).toEqual({ swirl: [0, 1, 2], burst: [3] });
  });

  it('keeps the dark core opaque in every frame and the corners transparent', () => {
    for (const frame of hole.frames)
      expect(frame.data[(16 * frame.width + 16) * 4 + 3], 'core').toBeGreaterThan(0);
    const [first, last] = hole.frames;
    expect(first.data[3], 'corner').toBe(0);
    expect(last.data[(31 * last.width + 31) * 4 + 3], 'corner').toBe(0);
  });
});

describe('scripts/assets/procedural/blackhole — the v2 path (R4-01.A8)', () => {
  const v2 = blackhole.generate({ artScale: 1.5 });
  const hole = byName(v2, 'fx/black-hole');

  it('draws the vortex native at 48×48 with the eight frames core reads', () => {
    expect(v2.map((s) => s.name)).toEqual(['fx/black-hole']);
    expect(hole.origin).toBe('procedural:blackhole');
    expect(hole.native).toBe(true);
    expect(hole.frames).toHaveLength(BLACK_HOLE_FRAMES);
    for (const frame of hole.frames) expect([frame.width, frame.height]).toEqual([48, 48]);
    expect(hole.animations).toEqual({ swirl: [0, 1, 2, 3, 4, 5, 6], burst: [7] });
    // The shipped atlas (the build's default scale) carries the frames the count reads.
    const built = buildAtlas();
    expect(built.manifest.sprites['fx/black-hole'].frames.length).toBeGreaterThanOrEqual(
      BLACK_HOLE_FRAMES,
    );
  });

  it('keeps a binary alpha with the core opaque and the corners transparent', () => {
    for (const [f, frame] of hole.frames.entries()) {
      for (let i = 0; i < frame.width * frame.height; i++) {
        const a = frame.data[i * 4 + 3];
        if (a !== 0 && a !== 255) expect(a, `frame ${f} pixel ${i} alpha`).toBe(0);
      }
      expect(frame.data[(24 * frame.width + 24) * 4 + 3], `frame ${f} core`).toBe(255);
    }
    const [first, last] = hole.frames;
    expect(first.data[3], 'corner').toBe(0);
    expect(last.data[(47 * last.width + 47) * 4 + 3], 'corner').toBe(0);
  });

  it('is byte-identical across runs', () => {
    const again = blackhole.generate({ artScale: 1.5 });
    const other = byName(again, 'fx/black-hole');
    expect(other.frames.map((f) => Buffer.from(f.data).toString('hex'))).toEqual(
      hole.frames.map((f) => Buffer.from(f.data).toString('hex')),
    );
  });
});
