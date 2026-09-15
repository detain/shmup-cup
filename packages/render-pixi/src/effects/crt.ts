/**
 * The **CRT / scanline filter** of the `effects` module (plan M3-02, shmup_feat.md §18 "[P2] CRT /
 * scanline filter: Off / Light / Full (cap output to 1080p on TV for cost)"): one GLSL ES 1.0 Pixi
 * filter ({@link createCrtFilter}, the sources in `./shaders.ts`) the renderer runs over the
 * **upscaled** picture of its second pass — scanlines, an aperture-grille mask and a vignette,
 * each switched by a uniform, so both strengths share one program.
 *
 * {@link createCrtPass} manages it for the renderer: it attaches the filter to the screen
 * container only while the setting is not `off`, keeps the scanline pitch equal to the frame's
 * scale on the display (one dark line between two frame rows, whatever the zoom) and caps the pass
 * at {@link CRT_MAX_HEIGHT} rows through the filter's resolution — a 4K TV pays for a 1080p pass,
 * scaled up by the canvas, exactly as the feature list asks.
 *
 * **Allocation.** The filter and its uniform group are created with the pass; a frame only writes
 * numbers. Attaching or detaching it (Pixi copies the filter list) happens only when the setting
 * or the viewport changes.
 *
 * @module
 */
import { CRT_MAX_HEIGHT, type CrtFilter as CrtSetting } from '@shmup/core';
import { Filter, GlProgram, UniformGroup, type Container } from 'pixi.js';
import {
  CRT_FRAGMENT,
  CRT_FULL_MASK,
  CRT_FULL_SCAN,
  CRT_FULL_VIGNETTE,
  CRT_LIGHT_SCAN,
  CRT_VERTEX,
} from './shaders.js';

/** The uniforms the CRT shader reads (see `./shaders.ts`). */
interface CrtUniforms {
  /** Half the output size in pixels (the vignette's centre). */
  uHalf: Float32Array;
  /** Output pixels per scanline band. */
  uLinePitch: number;
  /** Scanline darkening, 0 … 1. */
  uScan: number;
  /** Aperture-mask strength, 0 = none. */
  uMask: number;
  /** Vignette strength, 0 = none. */
  uVignette: number;
}

/** How strong each part of the look is, per {@link CrtSetting}. */
export interface CrtLook {
  /** Scanline darkening, 0 … 1. */
  readonly scan: number;
  /** Aperture-mask strength, 0 = no mask. */
  readonly mask: number;
  /** Vignette strength, 0 = no vignette. */
  readonly vignette: number;
}

/**
 * The look of each CRT setting (`core/config` `CRT_FILTERS` order): `off` (nothing), `light`
 * (scanlines only — the cheap TV-friendly setting) and `full` (scanlines, the aperture mask and a
 * vignette).
 */
export const CRT_LOOKS: readonly CrtLook[] = Object.freeze([
  Object.freeze({ scan: 0, mask: 0, vignette: 0 }),
  Object.freeze({ scan: CRT_LIGHT_SCAN, mask: 0, vignette: 0 }),
  Object.freeze({ scan: CRT_FULL_SCAN, mask: CRT_FULL_MASK, vignette: CRT_FULL_VIGNETTE }),
]);

/** Smallest scanline pitch in output pixels (below it the lines would eat half the picture). */
export const CRT_MIN_PITCH = 2;

/** One CRT filter and the uniforms a frame writes. */
export interface CrtFilterHandle {
  /** The Pixi filter (GLSL ES 1.0; WebGL only). */
  readonly filter: Filter;
  /**
   * Hands the setting and the viewport to the shader. Never allocates.
   *
   * @param look - The strengths ({@link CRT_LOOKS}).
   * @param pitch - Output pixels per scanline band (the frame's scale on the display).
   * @param width - Output width in pixels.
   * @param height - Output height in pixels.
   */
  apply(look: CrtLook, pitch: number, width: number, height: number): void;
  /**
   * Caps the pass's resolution so it never runs at more than {@link CRT_MAX_HEIGHT} rows.
   *
   * @param height - The display's height in pixels.
   */
  setDisplayHeight(height: number): void;
  /** Destroys the filter. */
  destroy(): void;
}

/**
 * Creates the CRT filter (load time).
 *
 * @returns The filter.
 *
 * @example
 * ```ts
 * const crt = createCrtFilter();
 * crt.apply(CRT_LOOKS[2], 5, 1920, 1080);
 * screen.filters = [crt.filter];
 * ```
 */
export function createCrtFilter(): CrtFilterHandle {
  const group = new UniformGroup({
    uHalf: { value: new Float32Array([1, 1]), type: 'vec2<f32>' },
    uLinePitch: { value: CRT_MIN_PITCH, type: 'f32' },
    uScan: { value: 0, type: 'f32' },
    uMask: { value: 0, type: 'f32' },
    uVignette: { value: 0, type: 'f32' },
  });
  const uniforms = group.uniforms as unknown as CrtUniforms;
  const glProgram = GlProgram.from({
    vertex: CRT_VERTEX,
    fragment: CRT_FRAGMENT,
    name: 'shmup-crt',
  });
  const filter = new Filter({ glProgram, resources: { crtUniforms: group }, antialias: 'off' });
  return {
    filter,
    apply(look, pitch, width, height) {
      uniforms.uScan = look.scan;
      uniforms.uMask = look.mask;
      uniforms.uVignette = look.vignette;
      uniforms.uLinePitch = pitch >= CRT_MIN_PITCH ? pitch : CRT_MIN_PITCH;
      uniforms.uHalf[0] = width > 0 ? width / 2 : 1;
      uniforms.uHalf[1] = height > 0 ? height / 2 : 1;
    },
    setDisplayHeight(height) {
      filter.resolution = crtResolution(height);
    },
    destroy() {
      filter.destroy();
    },
  };
}

/**
 * The resolution the CRT pass runs at on a display of `height` rows (shmup_feat.md §18 "cap output
 * to 1080p on TV for cost"): 1 up to {@link CRT_MAX_HEIGHT}, then the fraction that keeps the pass
 * at that many rows.
 *
 * @param height - Display height in pixels.
 * @returns The filter resolution, `(0, 1]`.
 *
 * @example
 * ```ts
 * crtResolution(1080); // → 1
 * crtResolution(2160); // → 0.5 (a 4K TV pays for a 1080p pass)
 * ```
 */
export function crtResolution(height: number): number {
  if (!(height > CRT_MAX_HEIGHT)) return 1;
  return CRT_MAX_HEIGHT / height;
}

/** Options of {@link createCrtPass}. */
export interface CrtPassOptions {
  /** The container the filter runs over (the renderer's second pass). */
  readonly screen: Container;
  /**
   * Creates the filter (default {@link createCrtFilter}; tests in Node, where Pixi cannot probe a
   * WebGL context, pass a fake).
   *
   * @returns The filter.
   */
  readonly createFilter?: () => CrtFilterHandle;
}

/** The CRT pass of one renderer. */
export interface CrtPass {
  /** The setting in use (`core/config` `CRT_FILTERS`). */
  readonly setting: CrtSetting;
  /** Whether the filter is attached now. */
  readonly active: boolean;
  /** The filter, or `null` until the setting first leaves `off`. */
  readonly filter: CrtFilterHandle | null;
  /**
   * Switches the setting (a display option — a cold path).
   *
   * @param setting - One of `core/config` `CRT_FILTERS`.
   */
  setSetting(setting: CrtSetting): void;
  /**
   * The viewport changed: the scanline pitch and the vignette follow the picture.
   *
   * @param scale - The frame's scale on the display (`Viewport.scale`).
   * @param width - The picture's width in pixels.
   * @param height - The picture's height in pixels.
   * @param displayHeight - The whole display's height in pixels (the resolution cap).
   */
  setViewport(scale: number, width: number, height: number, displayHeight: number): void;
  /** Destroys the filter. */
  destroy(): void;
}

/**
 * Creates the CRT pass of a renderer (load time; idle until the setting leaves `off`).
 *
 * @param options - See {@link CrtPassOptions}.
 * @returns The pass.
 *
 * @example
 * ```ts
 * const crt = createCrtPass({ screen });
 * crt.setViewport(viewport.scale, viewport.width, viewport.height, displayHeight);
 * crt.setSetting('full');
 * ```
 */
export function createCrtPass(options: CrtPassOptions): CrtPass {
  const make = options.createFilter ?? createCrtFilter;
  const screen = options.screen;
  let filter: CrtFilterHandle | null = null;
  let setting: CrtSetting = 'off';
  let active = false;
  let scale = 1;
  let width = 1;
  let height = 1;
  let displayHeight = 1;
  /** Re-attaches the filter and re-applies the uniforms after a change. */
  const refresh = (): void => {
    const index = setting === 'light' ? 1 : setting === 'full' ? 2 : 0;
    const on = index > 0;
    if (on && filter === null) filter = make();
    if (filter !== null) {
      filter.apply(CRT_LOOKS[index], Math.max(CRT_MIN_PITCH, Math.round(scale)), width, height);
      filter.setDisplayHeight(displayHeight);
    }
    if (on !== active) {
      active = on;
      screen.filters = on && filter !== null ? [filter.filter] : [];
    }
  };
  return {
    get setting(): CrtSetting {
      return setting;
    },
    get active(): boolean {
      return active;
    },
    get filter(): CrtFilterHandle | null {
      return filter;
    },
    setSetting(next) {
      if (next === setting) return;
      setting = next;
      refresh();
    },
    setViewport(nextScale, nextWidth, nextHeight, nextDisplayHeight) {
      scale = nextScale;
      width = nextWidth;
      height = nextHeight;
      displayHeight = nextDisplayHeight;
      if (active || filter !== null) refresh();
    },
    destroy() {
      screen.filters = [];
      filter?.destroy();
      filter = null;
      active = false;
    },
  };
}
