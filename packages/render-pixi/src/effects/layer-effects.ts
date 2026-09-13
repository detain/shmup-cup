/**
 * The layer effects of the `effects` module (plan M2-08): the stage's **raster effects** (wavy
 * water, heat haze, line-band parallax floors) and **palette cycles** (water, lava, glowing cores)
 * applied to whole world layers by one GLSL ES 1.0 Pixi filter per layer
 * ({@link createLayerEffectFilter}, the sources in `./shaders.ts`), managed by
 * {@link createLayerEffects}: the renderer binds a world's `StageEffectsView` to it once, then each
 * frame it rebuilds the active effects' offset table and colour pairs and attaches a layer's filter
 * only while one of its effects is on screen.
 *
 * **Cost.** A filtered layer is drawn into a temporary texture and composited back by the filter
 * (two draw calls and one full-frame fragment pass more per layer); layers without an active
 * effect carry no filter at all, so a stage without effects renders exactly as before.
 *
 * **Allocation.** Filters, their table textures and uniform arrays are created when a view is bound
 * (load time). A frame only writes numbers into preallocated arrays; attaching or detaching a
 * filter (Pixi copies the filter list) happens only when an effect's camera range starts or ends.
 * Pixi's own filter pass allocates a few short-lived objects per filtered layer per frame (its
 * filter-stack bookkeeping), and only while an effect is on screen.
 *
 * @module
 */
import {
  LAYER_COUNT,
  LayerId,
  PLAYFIELD_Y,
  type CameraView,
  type ColorCycleView,
  type RasterEffectView,
  type StageEffectsView,
} from '@shmup/core';
import {
  BufferImageSource,
  Filter,
  GlProgram,
  Rectangle,
  UniformGroup,
  type Container,
} from 'pixi.js';
import { colorCycleStep, writeCycleColors } from '../palette/index.js';
import {
  addRasterEffect,
  clearRasterTable,
  createRasterTable,
  encodeRasterTable,
  stageEffectActive,
  type RasterTable,
} from './raster.js';
import {
  LAYER_EFFECT_FRAGMENT,
  LAYER_EFFECT_MAX_COLORS,
  LAYER_EFFECT_ROWS,
  LAYER_EFFECT_VERTEX,
} from './shaders.js';

/** Pixels the filter area reaches past each frame edge (it must cover the frame under shake). */
const FILTER_AREA_MARGIN = 64;

/** One layer's filter, its offset table and colour pairs. */
export interface LayerEffectFilter {
  /** The Pixi filter (GLSL ES 1.0; WebGL only). */
  readonly filter: Filter;
  /** The offset table the frame's raster effects are added to. */
  readonly table: RasterTable;
  /** The table's encoded texels (`rows × 4` bytes — the 1 × rows RGBA8 texture's pixels). */
  readonly bytes: Uint8Array;
  /** Key colours of the palette cycles (RGB 0 … 1 triples, {@link LAYER_EFFECT_MAX_COLORS}). */
  readonly cycleFrom: Float32Array;
  /** Colours drawn instead (RGB 0 … 1 triples). */
  readonly cycleTo: Float32Array;
  /**
   * Hands the frame's state to the shader. Never allocates.
   *
   * @param raster - Whether the offset table applies.
   * @param cycleCount - Colour pairs in use (`0 … 8`).
   * @param rowShift - The layer's vertical offset on screen (screen shake), whole pixels.
   * @param tableChanged - Whether {@link LayerEffectFilter.bytes} changed (re-upload the texture).
   */
  apply(raster: boolean, cycleCount: number, rowShift: number, tableChanged: boolean): void;
  /** Destroys the filter and its texture. */
  destroy(): void;
}

/** The uniforms of the layer shader the effect sets (see `./shaders.ts`). */
interface LayerEffectUniforms {
  /** Offset table rows. */
  uRows: number;
  /** 1 = the table applies. */
  uRaster: number;
  /** Screen shake y. */
  uRowShift: number;
  /** Colour pairs in use. */
  uCycleCount: number;
  /** Key colours. */
  uCycleFrom: Float32Array;
  /** Replacement colours. */
  uCycleTo: Float32Array;
}

/**
 * Creates one layer's effect filter (load time): the GLSL ES 1.0 program (cached by Pixi across
 * filters), a 1 × `rows` RGBA8 table texture sampled nearest-neighbour with clamped edges (a
 * non-power-of-two size WebGL1 accepts that way) and the uniform group.
 *
 * @remarks
 * The table texture is uploaded as-is (`alphaMode: 'premultiplied-alpha'` — its alpha channel is
 * data, and must not be multiplied into the colour channels). WebGL only: the filter has no WebGPU
 * program (the renderer is WebGL1-first, shmup_tech.md §2.2).
 *
 * @param rows - Offset table rows (default 216, the frame height).
 * @returns The filter.
 *
 * @example
 * ```ts
 * const effect = createLayerEffectFilter();
 * layer.filters = [effect.filter];
 * ```
 */
export function createLayerEffectFilter(rows: number = LAYER_EFFECT_ROWS): LayerEffectFilter {
  const table = createRasterTable(rows);
  const bytes = new Uint8Array(rows * 4);
  // Offset 0 is 32768 = 0x80 0x00: the neutral table.
  for (let i = 0; i < rows; i++) bytes[i << 2] = 128;
  const source = new BufferImageSource({
    resource: bytes,
    width: 1,
    height: rows,
    format: 'rgba8unorm',
    scaleMode: 'nearest',
    addressMode: 'clamp-to-edge',
    autoGenerateMipmaps: false,
    alphaMode: 'premultiplied-alpha',
  });
  const cycleFrom = new Float32Array(LAYER_EFFECT_MAX_COLORS * 3);
  const cycleTo = new Float32Array(LAYER_EFFECT_MAX_COLORS * 3);
  const group = new UniformGroup({
    uRows: { value: rows, type: 'f32' },
    uRaster: { value: 0, type: 'f32' },
    uRowShift: { value: 0, type: 'f32' },
    uCycleCount: { value: 0, type: 'f32' },
    uCycleFrom: { value: cycleFrom, type: 'vec3<f32>', size: LAYER_EFFECT_MAX_COLORS },
    uCycleTo: { value: cycleTo, type: 'vec3<f32>', size: LAYER_EFFECT_MAX_COLORS },
  });
  const uniforms = group.uniforms as unknown as LayerEffectUniforms;
  const glProgram = GlProgram.from({
    vertex: LAYER_EFFECT_VERTEX,
    fragment: LAYER_EFFECT_FRAGMENT,
    name: 'shmup-layer-effect',
  });
  const filter = new Filter({
    glProgram,
    resources: { layerEffectUniforms: group, uRasterTable: source },
    // Nearest sampling at the frame's resolution: pixel art stays crisp.
    resolution: 1,
    antialias: 'off',
  });
  return {
    filter,
    table,
    bytes,
    cycleFrom,
    cycleTo,
    apply(raster, cycleCount, rowShift, tableChanged) {
      uniforms.uRaster = raster ? 1 : 0;
      uniforms.uCycleCount = cycleCount;
      uniforms.uRowShift = rowShift;
      if (tableChanged) source.update();
    },
    destroy() {
      filter.destroy();
      source.destroy();
    },
  };
}

/** Options of {@link createLayerEffects}. */
export interface LayerEffectsOptions {
  /** The renderer's layer containers, indexed by `LayerId` (`LayerStack.layers`). */
  readonly layers: readonly Container[];
  /** Frame width in pixels (default 384). */
  readonly width?: number;
  /** Frame height in pixels = offset table rows (default 216). */
  readonly height?: number;
  /** Frame row of playfield row 0 (default `PLAYFIELD_Y`). */
  readonly offsetY?: number;
  /**
   * Creates a layer's filter (default {@link createLayerEffectFilter}; tests in Node, where Pixi
   * cannot probe a WebGL context, pass a fake).
   *
   * @param rows - Offset table rows.
   * @returns The filter.
   */
  readonly createFilter?: (rows: number) => LayerEffectFilter;
}

/** The layer effects of one renderer. */
export interface LayerEffects {
  /** Bit `1 << layer` for every layer whose filter is attached now. */
  readonly attachedMask: number;
  /** Raster effects on screen after the last sync. */
  readonly activeRaster: number;
  /** Palette cycles on screen after the last sync. */
  readonly activeCycles: number;
  /**
   * The filter of a layer (`null` until a bound view gives the layer an effect).
   *
   * @param layer - A `LayerId`.
   * @returns The filter, or `null`.
   */
  filterOf(layer: number): LayerEffectFilter | null;
  /**
   * Binds a world's effects (load time — `PixiRenderer.bindWorld`): detaches every filter, sorts
   * the effects by layer and creates the filters of layers that get one for the first time
   * (filters are kept across worlds).
   *
   * @param view - The stage's effects, or `null` for none.
   * @throws {RangeError} When an effect names a layer outside the world group.
   */
  bind(view: StageEffectsView | null): void;
  /**
   * Updates the bound effects for one frame. Never allocates (see the module docs).
   *
   * @remarks
   * Per layer: the raster effects whose camera range holds `camera.x` are added to the cleared
   * offset table (encoded, uploaded when a byte changed), the active palette cycles' colour pairs
   * are written at `colorCycleStep(tick, …)`; the filter is attached while at least one of them is
   * active (and `enabled`), detached otherwise.
   *
   * @param tick - The frame's tick (animates waves and cycles).
   * @param camera - The world camera.
   * @param rowShift - The world layers' vertical offset on screen (screen shake).
   * @param enabled - `false` detaches every filter (the effects setting is off).
   */
  sync(tick: number, camera: CameraView, rowShift: number, enabled: boolean): void;
  /** Detaches and destroys every filter. */
  destroy(): void;
}

/**
 * Creates the layer effects of a renderer (load time; no filter exists until a bound view needs
 * one).
 *
 * @param options - Layer containers, frame size, playfield offset and filter factory.
 * @returns The layer effects (nothing bound).
 *
 * @example
 * ```ts
 * const layerEffects = createLayerEffects({ layers: stack.layers });
 * layerEffects.bind(world.effects ?? null);
 * layerEffects.sync(frame.tick, world.camera, shakeY, settings.rasterEffects); // every frame
 * ```
 */
export function createLayerEffects(options: LayerEffectsOptions): LayerEffects {
  const layers = options.layers;
  const width = options.width ?? 384;
  const rows = options.height ?? LAYER_EFFECT_ROWS;
  const offsetY = options.offsetY ?? PLAYFIELD_Y;
  const createFilter = options.createFilter ?? createLayerEffectFilter;
  const worldLayers = LayerId.Hud < layers.length ? LayerId.Hud : layers.length;
  const filters: Array<LayerEffectFilter | null> = [];
  // One-element filter lists, created with their filter (assigning them to a layer is the only
  // per-attach cost: Pixi copies the list).
  const lists: Array<Filter[] | null> = [];
  const raster: RasterEffectView[][] = [];
  const cycles: ColorCycleView[][] = [];
  for (let i = 0; i < LAYER_COUNT; i++) {
    filters.push(null);
    lists.push(null);
    raster.push([]);
    cycles.push([]);
  }
  // Covers the frame wherever screen shake moves the world group (clipped to the frame by Pixi).
  const area = new Rectangle(
    -FILTER_AREA_MARGIN,
    -FILTER_AREA_MARGIN,
    width + 2 * FILTER_AREA_MARGIN,
    rows + 2 * FILTER_AREA_MARGIN,
  );
  let attached = 0;
  let activeRaster = 0;
  let activeCycles = 0;

  /**
   * Attaches a layer's filter (when not attached yet).
   *
   * @param layer - The layer.
   */
  const attach = (layer: number): void => {
    const bit = 1 << layer;
    if ((attached & bit) !== 0) return;
    const list = lists[layer];
    if (list === null) return;
    layers[layer].filterArea = area;
    layers[layer].filters = list;
    attached |= bit;
  };

  /**
   * Detaches a layer's filter (when attached).
   *
   * @param layer - The layer.
   */
  const detach = (layer: number): void => {
    const bit = 1 << layer;
    if ((attached & bit) === 0) return;
    layers[layer].filters = null;
    attached &= ~bit;
  };

  /**
   * Validates an effect's layer.
   *
   * @param layer - The layer.
   * @param what - `raster effect` / `palette cycle`, for the message.
   * @throws {RangeError} When it is not a world layer.
   */
  const checkLayer = (layer: number, what: string): void => {
    if (!(Number.isInteger(layer) && layer >= 0 && layer < worldLayers)) {
      throw new RangeError(`${what} on layer ${layer} (a world layer expected)`);
    }
  };

  return {
    get attachedMask() {
      return attached;
    },
    get activeRaster() {
      return activeRaster;
    },
    get activeCycles() {
      return activeCycles;
    },
    filterOf(layer) {
      return layer >= 0 && layer < filters.length ? (filters[layer] ?? null) : null;
    },
    bind(view) {
      for (let i = 0; i < LAYER_COUNT; i++) {
        detach(i);
        raster[i].length = 0;
        cycles[i].length = 0;
      }
      activeRaster = 0;
      activeCycles = 0;
      if (view === null) return;
      for (const effect of view.raster) checkLayer(effect.layer, 'raster effect');
      for (const cycle of view.cycles) checkLayer(cycle.layer, 'palette cycle');
      for (const effect of view.raster) raster[effect.layer].push(effect);
      for (const cycle of view.cycles) cycles[cycle.layer].push(cycle);
      for (let i = 0; i < LAYER_COUNT; i++) {
        if (filters[i] !== null || (raster[i].length === 0 && cycles[i].length === 0)) continue;
        const filter = createFilter(rows);
        filters[i] = filter;
        lists[i] = [filter.filter];
      }
    },
    sync(tick, camera, rowShift, enabled) {
      activeRaster = 0;
      activeCycles = 0;
      for (let layer = 0; layer < LAYER_COUNT; layer++) {
        const layerRaster = raster[layer];
        const layerCycles = cycles[layer];
        const effect = filters[layer];
        if (effect === null || (layerRaster.length === 0 && layerCycles.length === 0)) continue;
        if (!enabled) {
          detach(layer);
          continue;
        }
        let rasterOn = false;
        for (let i = 0; i < layerRaster.length; i++) {
          const r = layerRaster[i];
          if (!stageEffectActive(r, camera)) continue;
          if (!rasterOn) clearRasterTable(effect.table);
          rasterOn = true;
          addRasterEffect(effect.table, r, tick, camera, offsetY);
          activeRaster++;
        }
        let count = 0;
        for (let i = 0; i < layerCycles.length; i++) {
          const c = layerCycles[i];
          if (!stageEffectActive(c, camera)) continue;
          const n = c.colors.length;
          count = writeCycleColors(
            c.colors,
            colorCycleStep(tick, c.ticks, n),
            effect.cycleFrom,
            effect.cycleTo,
            count,
          );
          activeCycles++;
        }
        if (!rasterOn && count === 0) {
          detach(layer);
          continue;
        }
        const changed = rasterOn && encodeRasterTable(effect.table, effect.bytes);
        effect.apply(rasterOn, count, rowShift, changed);
        attach(layer);
      }
    },
    destroy() {
      for (let i = 0; i < LAYER_COUNT; i++) {
        detach(i);
        filters[i]?.destroy();
        filters[i] = null;
        lists[i] = null;
      }
    },
  };
}
