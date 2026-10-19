/**
 * The TV render bench's synthetic scene (plan R0-02): the sprites it picks from the real atlas,
 * the v2 layer stack as a load model at each density (counts, HUD bars and tiles at `8·s`, ~35 %
 * terrain, full-frame backdrops, the variants' effects), the same field of view at 640×360 and
 * 960×540, the motion that keeps every sprite on screen, and the particle top-up.
 */
import { LayerId, RasterKind, type SpriteBatchView } from '@shmup/core';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  BENCH_LOAD,
  BenchRandom,
  BenchScene,
  fillBenchParticles,
  findBenchSize,
  pickBenchSprites,
  type BenchParticles,
  type BenchSceneManifest,
  type BenchSize,
} from '../../src/bench/index.js';
import { buildBenchAtlases } from '../../scripts/bench-atlas.mjs';
import { shippedAtlas } from './shipped-atlas.js';

/** The shipped atlas, built in memory (`assets/generated/` is not there in CI). */
const atlas = shippedAtlas();
const shipped = atlas.manifest as unknown as {
  sprites: Record<string, unknown>;
  pages: { file: string; w: number; h: number }[];
};

/** Each density's scaled manifest. */
const manifests = new Map<number, BenchSceneManifest>();

beforeAll(() => {
  const atlases = buildBenchAtlases(shipped as never, atlas.pngs);
  for (const atlas of atlases) manifests.set(atlas.density, atlas.manifest as BenchSceneManifest);
}, 60_000);

/** The picks from the shipped atlas. */
const sprites = pickBenchSprites(Object.keys(shipped.sprites));

/**
 * A scene at one of the bench sizes.
 *
 * @param id - A `BENCH_SIZES` id, e.g. `'640x360'`.
 * @param filter - Filtered layer on.
 * @param mode7 - Mode-7 floor on.
 * @returns The scene.
 */
function sceneAt(id: string, filter = false, mode7 = false): BenchScene {
  const size = sizeOf(id);
  return new BenchScene({
    width: size.width,
    height: size.height,
    density: size.density,
    sprites,
    manifest: manifests.get(size.density) as BenchSceneManifest,
    filter,
    mode7,
  });
}

/**
 * A bench size by id.
 *
 * @param id - Size id.
 * @returns The size.
 */
function sizeOf(id: string): BenchSize {
  const size = findBenchSize(id);
  if (size === null) throw new Error(`no bench size ${id}`);
  return size;
}

/** The sizes the load model is checked at: the baseline, R0-02's two v2 rows and the sweep's ends. */
const SIZES = ['384x216', '480x320', '640x360', '960x540', '960x640', '1920x1080n'];

/**
 * A batch of the scene's world by layer.
 *
 * @param scene - The scene.
 * @param layer - The layer.
 * @returns The batch.
 */
function batchOn(scene: BenchScene, layer: number): SpriteBatchView {
  const batch = scene.world.batches.find((candidate) => candidate.layer === layer);
  expect(batch, `a batch on layer ${layer}`).toBeDefined();
  return batch as SpriteBatchView;
}

describe('bench sprites', () => {
  it('draws the scene from the shipped atlas, never adding a sprite to it', () => {
    const names = sprites.names;
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(shipped.sprites).toHaveProperty([name]);
    expect(names.some((name) => name.indexOf('@') >= 0)).toBe(false);
    expect(names[sprites.point]).toBe('items/point');
    expect(names[sprites.ship]).toBe('ships/kestrel');
    expect(names[sprites.option]).toBe('options/orb');
    expect(names[sprites.tileset]).toBe('tiles/terrain-a');
    expect(names[sprites.floor]).toBe('bg/dimension-floor');
    expect(sprites.fullBackdrops.map((id) => names[id])).toEqual(['bg/stars-far', 'bg/stars-mid']);
    expect(sprites.partialBackdrops).toHaveLength(3);
    expect(sprites.bullets.length).toBeGreaterThan(3);
    expect(new Set(sprites.enemies).size).toBe(16);
    for (const id of sprites.decor) expect(names[id]).toContain('turret');
    for (const id of sprites.enemies) expect(names[id]).not.toContain('turret');
  });

  it('refuses an atlas that lacks a category', () => {
    expect(() => pickBenchSprites(['bullets/a'])).toThrow(/no "items\/" sprite/);
  });
});

describe('bench scene (the v2 layer stack as a load model)', () => {
  it.each(SIZES)('carries the same load at every size (%s)', (id) => {
    const size = sizeOf(id);
    const scene = sceneAt(id);
    const s = size.density;
    expect(scene.hudBar).toBe(Math.round(8 * s));
    expect(scene.playHeight).toBe(size.height - 2 * scene.hudBar);
    expect(scene.terrain.tileSize).toBe(scene.hudBar);
    expect(batchOn(scene, LayerId.EnemyBullets).count).toBe(BENCH_LOAD.bullets);
    expect(batchOn(scene, LayerId.Items).count).toBe(BENCH_LOAD.points);
    expect(batchOn(scene, LayerId.AirEnemies).count).toBe(BENCH_LOAD.enemies);
    expect(batchOn(scene, LayerId.GroundEnemies).count).toBe(BENCH_LOAD.decor);
    expect(batchOn(scene, LayerId.PlayerShots).count).toBe(BENCH_LOAD.shots);
    expect(batchOn(scene, LayerId.Player).count).toBe(1 + BENCH_LOAD.options);
    expect([scene.liveBullets, scene.livePoints, scene.liveEnemies]).toEqual([512, 512, 64]);
    // The renderer's own parallax and terrain bindings cover only the v1 frame: the bench binds them.
    expect(scene.world.parallax).toBeNull();
    expect(scene.world.terrain).toBeNull();
    expect(scene.world.effects).toBeNull();
  });

  it.each(SIZES)(
    'covers ~35 %% of the frame with terrain and the playfield with backdrops (%s)',
    (id) => {
      const size = sizeOf(id);
      const scene = sceneAt(id);
      const terrain = scene.terrain;
      let solid = 0;
      for (let i = 0; i < terrain.tiles.length; i++) if (terrain.tiles[i] !== 0) solid++;
      const share = ((solid / terrain.cols) * terrain.tileSize) / size.height;
      expect(share).toBeGreaterThan(0.3);
      expect(share).toBeLessThan(0.42);
      expect(scene.visibleTiles()).toBeGreaterThan(0);
      // Two full-frame backdrops on BG_FAR, rows stacked down the playfield; three bands on BG_MID.
      const parallax = scene.parallax;
      const manifest = manifests.get(size.density) as BenchSceneManifest;
      expect(scene.fullBands).toBeGreaterThanOrEqual(2);
      const bottoms = new Map<number, number>();
      for (let i = 0; i < scene.fullBands; i++) {
        expect(parallax.layer[i]).toBe(LayerId.BgFar);
        const sprite = parallax.spriteId[i];
        const frame = manifest.frames[manifest.sprites[sprites.names[sprite]].frames[0]];
        expect(parallax.spacing[i]).toBe(frame.w);
        bottoms.set(sprite, Math.max(bottoms.get(sprite) ?? 0, parallax.y[i] + frame.h));
      }
      // Each of the two backdrops reaches the bottom of the playfield.
      expect(bottoms.size).toBe(2);
      for (const bottom of bottoms.values())
        expect(bottom).toBeGreaterThanOrEqual(scene.playHeight);
      expect(parallax.count - scene.fullBands).toBe(BENCH_LOAD.partialBackdrops);
      for (let i = scene.fullBands; i < parallax.count; i++)
        expect(parallax.layer[i]).toBe(LayerId.BgMid);
    },
  );

  it('turns on a raster wave on the far backdrop and the Mode-7 floor for their variants', () => {
    const filtered = sceneAt('640x360', true, false);
    expect(filtered.world.effects?.raster).toHaveLength(1);
    expect(filtered.world.effects?.raster[0]).toMatchObject({
      layer: LayerId.BgFar,
      kind: RasterKind.Wave,
      top: 0,
      bottom: filtered.playHeight,
    });
    expect(filtered.world.effects?.mode7).toBeNull();
    const floored = sceneAt('960x540', false, true);
    expect(floored.world.effects?.raster).toEqual([]);
    expect(floored.world.effects?.mode7?.spriteId).toBe(sprites.floor);
    expect(floored.world.effects?.mode7?.bottom).toBe(floored.playHeight);
    const both = sceneAt('384x216', true, true);
    expect(both.world.effects?.raster).toHaveLength(1);
    expect(both.world.effects?.mode7).not.toBeNull();
  });

  it('shows the same field of view at 640x360 and 960x540 (the scene is ×s, like the frame)', () => {
    const v2 = sceneAt('640x360');
    const hiBit = sceneAt('960x540');
    for (let t = 0; t < 240; t++) {
      v2.tick();
      hiBit.tick();
    }
    expect(hiBit.camera.x / 2.25).toBeCloseTo(v2.camera.x / 1.5, 6);
    expect(hiBit.terrain.rows).toBeGreaterThanOrEqual(v2.terrain.rows);
  });

  it('keeps every sprite on screen while the camera scrolls', () => {
    for (const id of SIZES) {
      const size = sizeOf(id);
      const scene = sceneAt(id);
      const margin = 80 * size.density;
      for (let t = 0; t < 1500; t++) scene.tick();
      expect(scene.camera.x).toBeGreaterThan(0);
      for (const batch of scene.world.batches) {
        if (batch.layer === LayerId.GroundEnemies) continue; // fixed in the world, recycled ahead
        for (let i = 0; i < batch.count; i++) {
          const x = batch.x[i] - scene.camera.x;
          const y = batch.y[i] - scene.camera.y;
          expect(x).toBeGreaterThanOrEqual(-margin);
          expect(x).toBeLessThanOrEqual(size.width + margin);
          expect(y).toBeGreaterThanOrEqual(-margin);
          expect(y).toBeLessThanOrEqual(size.height + margin);
        }
      }
      for (let i = 0; i < scene.parallax.count; i++) {
        expect(scene.parallax.offsetX[i]).toBeGreaterThanOrEqual(0);
        expect(scene.parallax.offsetX[i]).toBeLessThan(scene.parallax.spacing[i]);
      }
    }
  });

  it('redraws the HUD only when its label or score changed', () => {
    const scene = sceneAt('640x360');
    const before = scene.hud.revision;
    scene.setLabel('R0-02 1/18');
    expect(scene.hud.revision).toBeGreaterThan(before);
    scene.tick(); // the new label's redraw
    const settled = scene.hud.revision;
    scene.setLabel('R0-02 1/18');
    expect(scene.hud.revision).toBe(settled);
    for (let t = 2; t < 8; t++) scene.tick();
    expect(scene.hud.revision).toBe(settled);
    scene.tick(); // tick 8: the score moved
    expect(scene.hud.revision).toBeGreaterThan(settled);
    expect(scene.hud.strings[0]).toBe('R0-02 1/18');
  });

  it('starts from the same layout on every run', () => {
    const a = sceneAt('640x360');
    const b = sceneAt('640x360');
    const bulletsA = batchOn(a, LayerId.EnemyBullets);
    const bulletsB = batchOn(b, LayerId.EnemyBullets);
    expect(Array.from(bulletsA.x as Float64Array)).toEqual(Array.from(bulletsB.x as Float64Array));
    const random = new BenchRandom(1);
    const first = random.next();
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThan(1);
    expect(new BenchRandom(1).next()).toBe(first);
  });
});

describe('bench particles', () => {
  /** A fake pool that spawns `burst` particles per emit up to its capacity. */
  class FakePool implements BenchParticles {
    liveCount = 0;
    emits = 0;
    readonly content = { presets: [1, 2, 3] };
    constructor(
      readonly capacity: number,
      private readonly burst: number,
    ) {}
    emit(): number {
      this.emits++;
      const spawned = Math.min(this.burst, this.capacity - this.liveCount);
      this.liveCount += spawned;
      return spawned;
    }
  }

  it('tops the pool up to its capacity, and is safe without one', () => {
    const scene = sceneAt('384x216');
    const random = new BenchRandom();
    const pool = new FakePool(512, 20);
    fillBenchParticles(pool, scene, random);
    expect(pool.liveCount).toBe(12 * 20); // four rounds of the three presets per call
    for (let i = 0; i < 4; i++) fillBenchParticles(pool, scene, random);
    expect(pool.liveCount).toBe(512);
    const emits = pool.emits;
    fillBenchParticles(pool, scene, random);
    expect(pool.emits).toBe(emits);
    fillBenchParticles(null, scene, random);
    const empty = new FakePool(10, 1);
    empty.content.presets.length = 0;
    fillBenchParticles(empty, scene, random);
    expect(empty.emits).toBe(0);
  });
});
