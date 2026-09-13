/**
 * The layer effects manager (plan M2-08) with fake filters (Pixi cannot build a GL program in
 * Node): binding a stage's effects sorts them by layer and creates a filter per affected layer
 * (reused across worlds); each frame the active effects fill the offset table and the colour pairs
 * and the layer's filter is attached only while one is on screen; the setting turns everything off;
 * a frame allocates nothing.
 */
import {
  LayerId,
  RasterKind,
  createDrawList,
  type ColorCycleView,
  type RasterEffectView,
  type StageEffectsView,
} from '@shmup/core';
import { Container, type Filter } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import {
  createLayerEffects,
  createRasterTable,
  decodeRasterRow,
  type LayerEffectFilter,
} from '../../src/effects/index.js';
import { createLayerStack } from '../../src/layers/index.js';
import { measureAllocation } from '../helpers.js';

/** What a fake filter recorded. */
interface FakeFilter extends LayerEffectFilter {
  /** `apply` calls: `[raster, cycleCount, rowShift, tableChanged]`. */
  readonly applied: Array<[boolean, number, number, boolean]>;
  /** `destroy` calls. */
  destroyed: number;
}

/**
 * A fake filter factory that records its filters.
 *
 * @returns The factory and the filters it made.
 */
function fakeFactory(): { create: (rows: number) => LayerEffectFilter; made: FakeFilter[] } {
  const made: FakeFilter[] = [];
  return {
    made,
    create(rows) {
      const applied: Array<[boolean, number, number, boolean]> = [];
      const fake: FakeFilter = {
        filter: { enabled: true, label: `fake-${made.length}` } as unknown as Filter,
        table: createRasterTable(rows),
        bytes: new Uint8Array(rows * 4),
        cycleFrom: new Float32Array(24),
        cycleTo: new Float32Array(24),
        applied,
        destroyed: 0,
        apply(raster, count, shift, changed) {
          if (applied.length < 64) applied.push([raster, count, shift, changed]);
        },
        destroy() {
          fake.destroyed++;
        },
      };
      made.push(fake);
      return fake;
    },
  };
}

/**
 * A raster effect with defaults.
 *
 * @param fields - Fields to set.
 * @returns The effect.
 */
function raster(fields: Partial<RasterEffectView>): RasterEffectView {
  return {
    layer: LayerId.BgMid,
    kind: RasterKind.Wave,
    top: 100,
    bottom: 150,
    amplitude: 3,
    wavelength: 20,
    period: 96,
    factorTop: 0,
    factorBottom: 0,
    bands: [],
    wrap: 0,
    from: 0,
    to: Number.POSITIVE_INFINITY,
    ...fields,
  };
}

/**
 * A palette cycle with defaults.
 *
 * @param fields - Fields to set.
 * @returns The cycle.
 */
function cycle(fields: Partial<ColorCycleView>): ColorCycleView {
  return {
    layer: LayerId.BgMid,
    colors: [0x183c78, 0x24569c, 0x3474bc, 0x5096d8],
    ticks: 8,
    from: 0,
    to: Number.POSITIVE_INFINITY,
    ...fields,
  };
}

/** The camera objects the tests move. */
const camera = { x: 0, y: 0 };

describe('render-pixi/effects layer effects', () => {
  it('creates a filter per affected layer on bind and attaches it while an effect is on', () => {
    const stack = createLayerStack();
    const { create, made } = fakeFactory();
    const effects = createLayerEffects({ layers: stack.layers, createFilter: create });
    const view: StageEffectsView = {
      raster: [
        raster({}),
        raster({ layer: LayerId.BgFar, kind: RasterKind.Haze, from: 1200, to: 2400 }),
      ],
      cycles: [cycle({})],
    };
    effects.bind(view);
    expect(made.length).toBe(2);
    expect(effects.filterOf(LayerId.BgMid)).toBe(made[1]);
    expect(effects.filterOf(LayerId.BgFar)).toBe(made[0]);
    expect(effects.filterOf(LayerId.Terrain)).toBeNull();
    expect(effects.filterOf(-1)).toBeNull();
    expect(effects.attachedMask).toBe(0);

    camera.x = 100;
    effects.sync(16, camera, 0, true);
    const mid = stack.layers[LayerId.BgMid];
    expect(effects.attachedMask).toBe(1 << LayerId.BgMid);
    expect(mid.filters).toEqual([made[1].filter]);
    expect(mid.filterArea?.x).toBe(-64);
    expect(stack.layers[LayerId.BgFar].filters ?? null).toBeNull();
    expect([effects.activeRaster, effects.activeCycles]).toEqual([1, 1]);
    // The wave's offsets are in the table and encoded; four colour pairs at step 16 / 8 = 2.
    const midFilter = made[1];
    expect(midFilter.applied[0]).toEqual([true, 4, 0, true]);
    expect(decodeRasterRow(midFilter.bytes, 108)[0]).toBe(Math.round(midFilter.table.offset[108]));
    expect([...midFilter.cycleFrom.slice(0, 3)].map((v) => Math.round(v * 255))).toEqual([
      0x18, 0x3c, 0x78,
    ]);
    expect([...midFilter.cycleTo.slice(0, 3)].map((v) => Math.round(v * 255))).toEqual([
      0x34, 0x74, 0xbc,
    ]);

    // Inside the haze's range the far layer is filtered too; past it, not any more.
    camera.x = 1500;
    effects.sync(17, camera, -2, true);
    expect(effects.attachedMask).toBe((1 << LayerId.BgMid) | (1 << LayerId.BgFar));
    expect(made[0].applied[0]).toEqual([true, 0, -2, true]);
    camera.x = 2400;
    effects.sync(18, camera, 0, true);
    expect(effects.attachedMask).toBe(1 << LayerId.BgMid);
    expect(stack.layers[LayerId.BgFar].filters ?? null).toBeNull();
  });

  it('turns every filter off with the setting and back on', () => {
    const stack = createLayerStack();
    const { create } = fakeFactory();
    const effects = createLayerEffects({ layers: stack.layers, createFilter: create });
    effects.bind({ raster: [raster({})], cycles: [] });
    effects.sync(0, camera, 0, true);
    expect(effects.attachedMask).toBe(1 << LayerId.BgMid);
    effects.sync(1, camera, 0, false);
    expect(effects.attachedMask).toBe(0);
    expect(stack.layers[LayerId.BgMid].filters ?? null).toBeNull();
    effects.sync(2, camera, 0, true);
    expect(effects.attachedMask).toBe(1 << LayerId.BgMid);
  });

  it('applies a palette cycle alone (no table) and only re-uploads a table that changed', () => {
    const stack = createLayerStack();
    const { create, made } = fakeFactory();
    const effects = createLayerEffects({ layers: stack.layers, createFilter: create });
    effects.bind({
      raster: [raster({ layer: LayerId.Terrain, period: 0 })],
      cycles: [cycle({ layer: LayerId.AirEnemies, colors: [0x102030, 0x405060], ticks: 5 })],
    });
    effects.sync(0, camera, 0, true);
    effects.sync(1, camera, 0, true);
    const [terrain, air] = made;
    // A still wave: uploaded once, then unchanged.
    expect(terrain.applied.map((a) => a[3])).toEqual([true, false]);
    expect(air.applied[0]).toEqual([false, 2, 0, false]);
    expect(effects.attachedMask).toBe((1 << LayerId.Terrain) | (1 << LayerId.AirEnemies));
  });

  it('rebinding detaches everything, keeps the filters, and a null view binds nothing', () => {
    const stack = createLayerStack();
    const { create, made } = fakeFactory();
    const effects = createLayerEffects({ layers: stack.layers, createFilter: create });
    effects.bind({ raster: [raster({})], cycles: [] });
    effects.sync(0, camera, 0, true);
    effects.bind({ raster: [raster({})], cycles: [cycle({ layer: LayerId.BgFar })] });
    expect(effects.attachedMask).toBe(0);
    expect(made.length).toBe(2); // mid reused, far new
    effects.bind(null);
    effects.sync(1, camera, 0, true);
    expect(effects.attachedMask).toBe(0);
    effects.destroy();
    expect(made.map((f) => f.destroyed)).toEqual([1, 1]);
    expect(effects.filterOf(LayerId.BgMid)).toBeNull();
  });

  it('refuses effects on a layer outside the world group', () => {
    const stack = createLayerStack();
    const { create } = fakeFactory();
    const effects = createLayerEffects({ layers: stack.layers, createFilter: create });
    expect(() => effects.bind({ raster: [raster({ layer: LayerId.Hud })], cycles: [] })).toThrow(
      RangeError,
    );
    expect(() => effects.bind({ raster: [], cycles: [cycle({ layer: 99 as LayerId })] })).toThrow(
      /palette cycle on layer 99/,
    );
  });

  it('syncs a frame of effects without allocating', () => {
    const stack = createLayerStack();
    const { create } = fakeFactory();
    const effects = createLayerEffects({ layers: stack.layers, createFilter: create });
    effects.bind({
      raster: [
        raster({}),
        raster({
          kind: RasterKind.Lines,
          top: 150,
          bottom: 200,
          factorTop: 0.25,
          factorBottom: 1.5,
          wrap: 64,
        }),
        raster({ layer: LayerId.BgFar, kind: RasterKind.Haze, top: 20, bottom: 100 }),
      ],
      cycles: [cycle({})],
    });
    const cam = { x: 0, y: 0 };
    effects.sync(0, cam, 0, true);
    const bytes = measureAllocation((tick) => {
      cam.x = tick * 0.5;
      effects.sync(tick, cam, tick & 1, true);
    }, 5000);
    expect(bytes).toBeLessThan(64 * 1024);
    // (A draw list import keeps the core's render contract types in this test's graph.)
    expect(createDrawList(1, 1).count).toBe(0);
    expect(new Container().filters ?? null).toBeNull();
  });
});
