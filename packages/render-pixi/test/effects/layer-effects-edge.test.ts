/**
 * Edge cases of the layer effects manager (plan M2-08), next to `layer-effects.test.ts` (fake
 * filters — Pixi cannot build a GL program in Node): effects on every world layer they may use,
 * several effects on one layer entering and leaving their ranges (the table rebuilt from the
 * active ones only), a cycle outliving its layer's raster effect, more cycled colours than the
 * shader holds, the frame size / playfield offset / filter factory options, the filter list
 * assigned only at range edges, a refused view leaving nothing bound, a shorter layer list,
 * `destroy` then `bind` again, and a NaN camera.
 */
import {
  LayerId,
  PLAYFIELD_Y,
  RasterKind,
  type ColorCycleView,
  type RasterEffectView,
} from '@shmup/core';
import { Container, type Filter } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import {
  addRasterEffect,
  createLayerEffects,
  createRasterTable,
  type LayerEffectFilter,
} from '../../src/effects/index.js';
import { createLayerStack } from '../../src/layers/index.js';

/** What a fake filter recorded. */
interface FakeFilter extends LayerEffectFilter {
  /** Rows it was created with. */
  readonly rows: number;
  /** `apply` calls: `[raster, cycleCount, rowShift, tableChanged]`. */
  readonly applied: Array<[boolean, number, number, boolean]>;
  /** `destroy` calls. */
  destroyed: number;
}

/**
 * A fake filter factory that records its filters.
 *
 * @param colors - Colour triples each fake holds (default 8, the shader's).
 * @returns The factory and the filters it made.
 */
function fakeFactory(colors = 8): {
  create: (rows: number) => LayerEffectFilter;
  made: FakeFilter[];
} {
  const made: FakeFilter[] = [];
  return {
    made,
    create(rows) {
      const applied: Array<[boolean, number, number, boolean]> = [];
      const fake: FakeFilter = {
        rows,
        filter: { enabled: true, label: `fake-${made.length}` } as unknown as Filter,
        table: createRasterTable(rows),
        bytes: new Uint8Array(rows * 4),
        cycleFrom: new Float32Array(colors * 3),
        cycleTo: new Float32Array(colors * 3),
        applied,
        destroyed: 0,
        apply(raster, count, shift, changed) {
          if (applied.length < 256) applied.push([raster, count, shift, changed]);
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
 * A raster effect with defaults (a wave on BG_MID over playfield rows 100 … 149).
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
    colors: [0x102030, 0x405060],
    ticks: 4,
    from: 0,
    to: Number.POSITIVE_INFINITY,
    ...fields,
  };
}

/**
 * Reads triple `k` of an array back as 0xRRGGBB.
 *
 * @param out - The array.
 * @param k - Triple index.
 * @returns The colour.
 */
const rgbAt = (out: Float32Array, k: number): number =>
  (Math.round(out[3 * k] * 255) << 16) |
  (Math.round(out[3 * k + 1] * 255) << 8) |
  Math.round(out[3 * k + 2] * 255);

describe('render-pixi/effects layer effects (edges)', () => {
  it('filters every world layer an effect may use, each with its own filter', () => {
    const stack = createLayerStack();
    const { create, made } = fakeFactory();
    const effects = createLayerEffects({ layers: stack.layers, createFilter: create });
    const layers = [
      LayerId.BgFar,
      LayerId.BgMid,
      LayerId.Terrain,
      LayerId.GroundEnemies,
      LayerId.AirEnemies,
    ];
    effects.bind({
      raster: [raster({ layer: LayerId.Terrain })],
      cycles: layers.map((layer, i) => cycle({ layer, colors: [i + 1, i + 100] })),
    });
    expect(made).toHaveLength(5);
    effects.sync(0, { x: 0, y: 0 }, 0, true);
    let mask = 0;
    for (const layer of layers) mask |= 1 << layer;
    expect(effects.attachedMask).toBe(mask);
    expect([effects.activeRaster, effects.activeCycles]).toEqual([1, 5]);
    for (const layer of layers) {
      expect(stack.layers[layer].filters).toEqual([effects.filterOf(layer)?.filter]);
    }
    // Layers past the world group (HUD, UI, DEBUG) and the others stay unfiltered.
    for (const layer of [LayerId.PlayerShots, LayerId.Player, LayerId.Hud, LayerId.Ui]) {
      expect(stack.layers[layer].filters ?? null).toBeNull();
    }
  });

  it("rebuilds a layer's table from the effects in range only, frame by frame", () => {
    const stack = createLayerStack();
    const { create, made } = fakeFactory();
    const effects = createLayerEffects({ layers: stack.layers, createFilter: create });
    const wave = raster({ top: 0, bottom: 200, period: 0 });
    const floor = raster({
      kind: RasterKind.Lines,
      top: 150,
      bottom: 200,
      factorTop: 1,
      factorBottom: 1,
      wrap: 32,
      from: 0,
      to: 100,
    });
    effects.bind({ raster: [wave, floor], cycles: [] });
    const camera = { x: 50, y: 0 };
    effects.sync(0, camera, 0, true);
    const table = made[0].table;
    const both = createRasterTable();
    addRasterEffect(both, wave, 0, camera);
    addRasterEffect(both, floor, 0, camera);
    expect([...table.offset]).toEqual([...both.offset]);
    expect(effects.activeRaster).toBe(2);
    // Past the floor's range: the wave alone, its rows no longer wrapped.
    camera.x = 100;
    effects.sync(1, camera, 0, true);
    const alone = createRasterTable();
    addRasterEffect(alone, wave, 1, camera);
    expect([...table.offset]).toEqual([...alone.offset]);
    expect(table.wrap.every((v) => v === 0)).toBe(true);
    expect(effects.activeRaster).toBe(1);
    expect(made[0].applied.map((a) => a[3])).toEqual([true, true]);
  });

  it('keeps a layer filtered for its cycle after its raster effect ends, the table off', () => {
    const stack = createLayerStack();
    const { create, made } = fakeFactory();
    const effects = createLayerEffects({ layers: stack.layers, createFilter: create });
    effects.bind({
      raster: [raster({ from: 0, to: 10, period: 0 })],
      cycles: [cycle({ from: 5, to: 20 })],
    });
    const camera = { x: 0, y: 0 };
    const seen: number[] = [];
    for (let x = 0; x < 25; x++) {
      camera.x = x;
      effects.sync(x, camera, 0, true);
      seen.push(effects.attachedMask);
    }
    const mid = 1 << LayerId.BgMid;
    expect(seen).toEqual([...new Array<number>(20).fill(mid), ...new Array<number>(5).fill(0)]);
    const applied = made[0].applied;
    expect(applied[0]).toEqual([true, 0, 0, true]);
    expect(applied[5]).toEqual([true, 2, 0, false]);
    // x 10 … 19: the cycle alone; the texture is not re-uploaded.
    for (let i = 10; i < 20; i++)
      expect([applied[i][0], applied[i][1], applied[i][3]]).toEqual([false, 2, false]);
    expect(applied).toHaveLength(20);
  });

  it('writes at most the shader’s colour pairs, several cycles of a layer one after the other', () => {
    const stack = createLayerStack();
    const { create, made } = fakeFactory(8);
    const effects = createLayerEffects({ layers: stack.layers, createFilter: create });
    const first = cycle({ colors: [1, 2, 3, 4, 5], ticks: 1 });
    const second = cycle({ colors: [6, 7, 8, 9, 10], ticks: 1 });
    effects.bind({ raster: [], cycles: [first, second] });
    effects.sync(1, { x: 0, y: 0 }, 0, true);
    const fake = made[0];
    expect(fake.applied[0]).toEqual([false, 8, 0, false]);
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((k) => rgbAt(fake.cycleFrom, k))).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
    ]);
    // Step 1: each colour shows the next one of its own ramp.
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((k) => rgbAt(fake.cycleTo, k))).toEqual([
      2, 3, 4, 5, 1, 7, 8, 9,
    ]);
    expect(effects.activeCycles).toBe(2);
  });

  it('advances a cycle every `ticks` ticks and wraps around the ramp', () => {
    const stack = createLayerStack();
    const { create, made } = fakeFactory();
    const effects = createLayerEffects({ layers: stack.layers, createFilter: create });
    effects.bind({
      raster: [],
      cycles: [cycle({ colors: [0xaa0000, 0x00bb00, 0x0000cc], ticks: 3 })],
    });
    const firstTo: number[] = [];
    for (let tick = 0; tick < 12; tick += 3) {
      effects.sync(tick, { x: 0, y: 0 }, 0, true);
      firstTo.push(rgbAt(made[0].cycleTo, 0));
    }
    expect(firstTo).toEqual([0xaa0000, 0x00bb00, 0x0000cc, 0xaa0000]);
  });

  it('honours the frame size, playfield offset and filter factory options', () => {
    const stack = createLayerStack();
    const { create, made } = fakeFactory();
    const effects = createLayerEffects({
      layers: stack.layers,
      width: 256,
      height: 100,
      offsetY: 0,
      createFilter: create,
    });
    const wave = raster({ top: 10, bottom: 20, period: 0 });
    effects.bind({ raster: [wave], cycles: [] });
    effects.sync(0, { x: 0, y: 0 }, 0, true);
    expect(made[0].rows).toBe(100);
    const area = stack.layers[LayerId.BgMid].filterArea;
    expect([area?.x, area?.y, area?.width, area?.height]).toEqual([-64, -64, 256 + 128, 100 + 128]);
    // offsetY 0: playfield row 10 is table row 10 (by default it would be 10 + PLAYFIELD_Y).
    const expected = createRasterTable(100);
    addRasterEffect(expected, wave, 0, { x: 0, y: 0 }, 0);
    expect([...made[0].table.offset]).toEqual([...expected.offset]);
    expect(made[0].table.offset[19]).not.toBe(0);
    expect(made[0].table.offset[19 + PLAYFIELD_Y]).toBe(0);
  });

  it('assigns the filter list only when a range starts or ends', () => {
    const stack = createLayerStack();
    const { create } = fakeFactory();
    const effects = createLayerEffects({ layers: stack.layers, createFilter: create });
    const layer = stack.layers[LayerId.BgMid];
    let assigned = 0;
    let current: readonly Filter[] | null = null;
    Object.defineProperty(layer, 'filters', {
      configurable: true,
      get: () => current,
      set: (value: readonly Filter[] | null) => {
        assigned++;
        current = value;
      },
    });
    effects.bind({ raster: [raster({ from: 100, to: 200 })], cycles: [] });
    const camera = { x: 0, y: 0 };
    for (let x = 0; x < 300; x += 0.5) {
      camera.x = x;
      effects.sync(x * 2, camera, 0, true);
    }
    expect(assigned).toBe(2); // on at 100, off at 200
    expect(current).toBeNull();
  });

  it('leaves nothing bound when a view is refused, and refuses fractional or negative layers', () => {
    const stack = createLayerStack();
    const { create, made } = fakeFactory();
    const effects = createLayerEffects({ layers: stack.layers, createFilter: create });
    effects.bind({ raster: [raster({})], cycles: [] });
    effects.sync(0, { x: 0, y: 0 }, 0, true);
    expect(effects.attachedMask).toBe(1 << LayerId.BgMid);
    expect(() =>
      effects.bind({
        raster: [raster({ layer: LayerId.BgFar })],
        cycles: [cycle({ layer: 1.5 as LayerId })],
      }),
    ).toThrow(/palette cycle on layer 1.5/);
    expect(() => effects.bind({ raster: [raster({ layer: -1 as LayerId })], cycles: [] })).toThrow(
      /raster effect on layer -1/,
    );
    // The refused binds detached the old view and bound nothing new: no far-layer filter either.
    expect(effects.attachedMask).toBe(0);
    effects.sync(1, { x: 0, y: 0 }, 0, true);
    expect(effects.attachedMask).toBe(0);
    expect(made).toHaveLength(1);
    expect(effects.filterOf(LayerId.BgFar)).toBeNull();
  });

  it('counts only the layers it was given as the world group', () => {
    const layers = [new Container(), new Container(), new Container()];
    const { create } = fakeFactory();
    const effects = createLayerEffects({ layers, createFilter: create });
    expect(() =>
      effects.bind({ raster: [raster({ layer: LayerId.Terrain })], cycles: [] }),
    ).not.toThrow();
    expect(() =>
      effects.bind({ raster: [], cycles: [cycle({ layer: LayerId.GroundEnemies })] }),
    ).toThrow(RangeError);
  });

  it('creates fresh filters when bound again after destroy', () => {
    const stack = createLayerStack();
    const { create, made } = fakeFactory();
    const effects = createLayerEffects({ layers: stack.layers, createFilter: create });
    effects.bind({ raster: [raster({})], cycles: [] });
    effects.sync(0, { x: 0, y: 0 }, 0, true);
    effects.destroy();
    expect(stack.layers[LayerId.BgMid].filters ?? null).toBeNull();
    effects.destroy(); // twice: nothing left to destroy
    expect(made[0].destroyed).toBe(1);
    effects.bind({ raster: [raster({})], cycles: [] });
    expect(made).toHaveLength(2);
    effects.sync(1, { x: 0, y: 0 }, 0, true);
    expect(stack.layers[LayerId.BgMid].filters).toEqual([made[1].filter]);
  });

  it('turns nothing on for a NaN camera and counts nothing while disabled', () => {
    const stack = createLayerStack();
    const { create } = fakeFactory();
    const effects = createLayerEffects({ layers: stack.layers, createFilter: create });
    effects.bind({ raster: [raster({})], cycles: [cycle({})] });
    effects.sync(0, { x: Number.NaN, y: 0 }, 0, true);
    expect([effects.attachedMask, effects.activeRaster, effects.activeCycles]).toEqual([0, 0, 0]);
    effects.sync(1, { x: 10, y: 0 }, 0, false);
    expect([effects.attachedMask, effects.activeRaster, effects.activeCycles]).toEqual([0, 0, 0]);
    // A sync before any bind does nothing either.
    const unbound = createLayerEffects({ layers: stack.layers, createFilter: create });
    unbound.sync(0, { x: 0, y: 0 }, 0, true);
    expect(unbound.attachedMask).toBe(0);
  });
});
