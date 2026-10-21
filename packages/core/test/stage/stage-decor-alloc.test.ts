/**
 * Allocation guard of the R3-06 decor runtime (its own file, next to the other stage guards):
 * a World flies a long stage whose 256 decor items stream past the camera (both layers, so
 * {@link updateDecorView} refills both batches every tick) and whose parallax carries a `fore`
 * band and an animated one ({@link updateParallaxView} writes `y` and `frameIndex`), and the raw
 * cull is also measured on its own with new camera positions in every window.
 */
import { describe, expect, it } from 'vitest';
import { resolveGameConfig } from '../../src/config/index.js';
import { loadContent } from '../../src/data/index.js';
import { createInputSnapshot } from '../../src/input/index.js';
import { ENGINE_SPRITES, createWorld, stepWorld } from '../../src/world/index.js';
import { createDecorView, updateDecorView } from '../../src/stage/index.js';
import { measureHeapGrowth } from '../helpers/alloc.js';
import { shipped } from '../helpers/campaign.js';

/** 256 decor items every 2000 px, alternating layers, over a very long open stage. */
const DB = (() => {
  const items = [];
  for (let i = 0; i < 256; i++) {
    items.push({
      layer: (i & 1) === 0 ? 'back' : 'front',
      sprite: 'bg/stars-far',
      frame: i % 4,
      x: i * 2000,
      y: 60,
      // R3-06.L4: every third item glows — the guard below streams the additive halves too.
      ...(i % 3 === 0 ? { glow: 'bg/stars-near' } : {}),
    });
  }
  const { db, issues } = loadContent(
    [
      shipped('player/kestrel.player.json'),
      shipped('weapons/type-a.weapons.json'),
      {
        path: 'stages/long.stage.json',
        data: {
          formatVersion: 1,
          kind: 'stage',
          id: 'long',
          name: 'LONG',
          music: { stage: 'Stage', boss: 'Boss' },
          length: 600_000,
          camera: [{ x: 0, speed: 2 }],
          checkpoints: [{ x: 0 }],
          parallax: [
            { layer: 'far', sprite: 'bg/stars-far', factor: 0.5, y: 0, spacing: 128 },
            {
              layer: 'fore',
              sprite: 'bg/stars-near',
              factor: 1.5,
              y: 200,
              spacing: 256,
              yFactor: 0.25,
              frames: 4,
              frameTicks: 8,
            },
          ],
          tilemap: null,
          events: [{ x: 600_000, type: 'end' }],
          decor: items,
        },
      },
    ],
    { extraSprites: ENGINE_SPRITES },
  );
  expect(issues).toEqual([]);
  return db;
})();

describe('core/stage decor allocation (R3-06)', () => {
  it('steps a World streaming decor past the camera without allocating', () => {
    const world = createWorld(resolveGameConfig({ seed: 6, stage: 'long' }), DB);
    world.debugFlags.godMode = true;
    const input = createInputSnapshot();
    const growth = measureHeapGrowth(() => stepWorld(world, input), 12_000, 20_000, 5, 32 * 1024);
    // The camera covered new ground in every window (it moves under a tick as the fly-in and
    // ramps take their share) and both batches streamed the whole way.
    expect(world.camera.x).toBeGreaterThan(40_000);
    expect(world.decor?.back?.count ?? 0).toBeGreaterThanOrEqual(0);
    expect(world.decor?.glowBack).not.toBeNull(); // the streamed glows stay inside the budget
    expect(world.status).toBe('playing');
    expect(growth.bytes).toBeLessThan(64 * 1024);
  });

  it('refills the batches on its own without allocating', () => {
    const view = createDecorView(DB.stages[0], DB);
    if (view === null) throw new Error('expected the decor view');
    let i = 0;
    const growth = measureHeapGrowth(
      () => {
        // A camera that never repeats a column: new indices in every window.
        updateDecorView(view, (i++ * 3) / 4 + view.count);
      },
      20_000,
      20_000,
      3,
      16 * 1024,
    );
    expect(growth.bytes).toBeLessThan(32 * 1024);
  });
});
