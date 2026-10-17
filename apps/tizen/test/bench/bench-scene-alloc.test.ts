/**
 * Allocation guard of the TV render bench's per-tick scene update (plan R0-02). The bench measures
 * the JS heap around `renderer.render()`, so its own tick must allocate nothing — otherwise the
 * figure would be the bench's garbage, not the renderer's. Its own file, as
 * `docs/dev/conventions.md` requires; measured on a second scene after a throwaway one, so the
 * constructor's hidden-class transitions are not counted.
 */
import { describe, expect, it } from 'vitest';
import { measureHeapGrowth } from '../../../../packages/core/test/helpers/alloc.js';
import {
  BENCH_SIZES,
  BenchScene,
  pickBenchSprites,
  type BenchSceneManifest,
} from '../../src/bench/index.js';
import { shippedAtlas } from './shipped-atlas.js';

/**
 * The shipped atlas manifest (density 1 — the scene's arithmetic is the same at every density),
 * built in memory once at load, outside the measured loop (`assets/generated/` is not there in CI).
 */
const manifest = shippedAtlas().manifest as unknown as BenchSceneManifest & {
  sprites: Record<string, { frames: string[] }>;
};

/**
 * A busy scene with a filtered layer and the Mode-7 floor (every branch of the tick).
 *
 * @returns The scene.
 */
function scene(): BenchScene {
  const size = BENCH_SIZES[1];
  return new BenchScene({
    width: size.width,
    height: size.height,
    density: size.density,
    sprites: pickBenchSprites(Object.keys(manifest.sprites)),
    manifest,
    filter: true,
    mode7: true,
  });
}

describe('bench scene per-tick allocation (R0-02)', () => {
  it('advances the scene without allocating', () => {
    const throwaway = scene();
    for (let i = 0; i < 2000; i++) throwaway.tick();

    const subject = scene();
    const growth = measureHeapGrowth(
      () => {
        subject.tick();
      },
      20_000,
      20_000,
      3,
      8 * 1024,
    );
    expect(growth.bytes).toBeLessThan(16 * 1024);
    expect(subject.ticks).toBeGreaterThan(20_000);
  }, 120_000);
});
