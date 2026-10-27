/**
 * The TV render bench's **scenario matrix** and phase timing (plan R0-02 — part of the `bench`
 * module, see `./index.ts`).
 *
 * **The resolution sweep (the owner's R0-03 follow-up).** R0-02 measured three internal frames at
 * one art density each. The matrix now sweeps **fifteen resolutions** in **two art-density modes**
 * and adds three **knobs** on top, so a run answers "what internal frame can this panel carry, and
 * what do the upscale settings cost" rather than only "is 640×360 affordable":
 *
 * - **{@link BENCH_RESOLUTIONS}** — 384×216, 480×320, 640×360, 640×480, 800×480, 854×480, 960×540,
 *   1024×576, 800×600, 1024×600, 960×640, 1280×720, 1024×768, 1280×960, 1920×1080. The canvas
 *   stays the display's (1920×1080 on the M7) and every frame is upscaled into it, as in R0-02.
 * - **Two art-density modes** ({@link BenchArtMode}) per resolution:
 *   - `scaled` — the art is upscaled ×s for the frame, so a bigger frame shows the **same world**
 *     at a higher density (what a real remaster does). `s` is the density that keeps the v2
 *     frame's field of view: **`s = height / 240`**, which is exactly 1.5 at 640×360 and 2.25 at
 *     960×540 — R0-02's two v2 rows, unchanged — and 1 at the 384×216 baseline by definition
 *     (v1 as it ships, its own art at its own size; `216 / 240` would be 0.9).
 *   - `native` — the art is left at its original size and position (`s = 1`), so a bigger frame
 *     shows **more world** with the same sprites. Its id carries an `n` (`'1280x720n'`), it costs
 *     no extra atlas at all (it reuses the ×1 pages) and at 384×216 it *is* the scaled row, so
 *     that resolution has one row, not two.
 * - **{@link BENCH_KNOBS}** — the upscale mode (`fit`, `stretch` against the default `integer`),
 *   render interpolation (M2-08) and an output resolution below the display's, each at a few
 *   representative sizes rather than across the whole sweep (a third full axis would multiply the
 *   matrix by six).
 *
 * **Why `scaled` stops at `s ≈ 2.7`.** The bench models a ×s atlas as the real 1024² source page
 * scaled ×s and re-packed into 2048² pages, so pages grow as s²
 * (`scripts/bench-atlas.mjs` `benchPageCount`): `ceil(s² / 4)` pages of 16 MiB each. Past
 * {@link BENCH_MAX_ATLAS_PAGES} pages the atlas alone is over 32 MiB of texture for one
 * scenario — which the M7 will not carry, and whose PNG pages would crowd the bench bundle's
 * `DIST_BUDGET` — so the four resolutions at `s ≥ 3` (1280×720, 1024×768, 1280×960, 1920×1080)
 * have **no scaled row**: their `scaled` is `null` in {@link BENCH_RESOLUTIONS}, and they are measured
 * in `native` mode only.
 *
 * A scenario's id is `<size>-<variant>`, e.g. `640x360-mode7` or `1280x720n-worst`, plus
 * `-<knob>` on a knob row (`640x360-busy-stretch`). The three ids R0-02 and R0-03 recorded —
 * `384x216`, `640x360`, `960x540` — are byte-identical here, so the sessions in
 * `tools/input-probe/results/2026-10-19-m7-bench/` stay comparable row for row.
 *
 * @module
 */
import type { CrtFilter, ScaleMode } from '@shmup/core';

/** How a resolution's art is sized (see the module docs). */
export type BenchArtMode = 'scaled' | 'native';

/** Most atlas pages a `scaled` row may model before it is dropped (see the module docs). */
export const BENCH_MAX_ATLAS_PAGES = 2;

/** One resolution of the sweep. */
export interface BenchResolution {
  /** Internal frame width in pixels. */
  readonly width: number;
  /** Internal frame height in pixels. */
  readonly height: number;
  /**
   * Density `s` of its `scaled` row, or `null` when that row is dropped because the modelled
   * atlas would need more than {@link BENCH_MAX_ATLAS_PAGES} pages (see the module docs).
   */
  readonly scaled: number | null;
}

/**
 * The resolutions the bench sweeps, in matrix order (the 384×216 baseline first, then by frame
 * height).
 *
 * @remarks
 * Absolute on purpose: **384×216 is v1's frame**, the baseline every other row of a session is
 * read against, and it must stay 384×216 after R2-01 flipped the game's frame constants to
 * 640×360 — so these are data, not the game's `FRAME_W` / `FRAME_H`. Every `scaled` density is
 * `height / 240` rounded to two decimals, except the baseline's (1 by definition); the four
 * resolutions whose `scaled` is `null` are the `s ≥ 3` ones the atlas model cannot carry.
 */
export const BENCH_RESOLUTIONS: readonly BenchResolution[] = Object.freeze([
  Object.freeze({ width: 384, height: 216, scaled: 1 }),
  Object.freeze({ width: 480, height: 320, scaled: 1.33 }),
  Object.freeze({ width: 640, height: 360, scaled: 1.5 }),
  Object.freeze({ width: 640, height: 480, scaled: 2 }),
  Object.freeze({ width: 800, height: 480, scaled: 2 }),
  Object.freeze({ width: 854, height: 480, scaled: 2 }),
  Object.freeze({ width: 960, height: 540, scaled: 2.25 }),
  Object.freeze({ width: 1024, height: 576, scaled: 2.4 }),
  Object.freeze({ width: 800, height: 600, scaled: 2.5 }),
  Object.freeze({ width: 1024, height: 600, scaled: 2.5 }),
  Object.freeze({ width: 960, height: 640, scaled: 2.67 }),
  Object.freeze({ width: 1280, height: 720, scaled: null }),
  Object.freeze({ width: 1024, height: 768, scaled: null }),
  Object.freeze({ width: 1280, height: 960, scaled: null }),
  Object.freeze({ width: 1920, height: 1080, scaled: null }),
] as BenchResolution[]);

/** One internal frame size and the density its scene is drawn at. */
export interface BenchSize {
  /** Id: `'640x360'` for a scaled row, `'640x360n'` for a native one. */
  readonly id: string;
  /** Internal frame width in pixels. */
  readonly width: number;
  /** Internal frame height in pixels. */
  readonly height: number;
  /** Density factor `s`: sprites, tiles, the font and speeds are ×s (plan R0-02, §13). */
  readonly density: number;
  /** How its art is sized (see the module docs). */
  readonly art: BenchArtMode;
}

/**
 * The size id of a resolution in an art mode.
 *
 * @param frame - The resolution.
 * @param art - The art mode.
 * @returns `'<w>x<h>'` for `scaled`, `'<w>x<h>n'` for `native`.
 */
function sizeId(frame: BenchResolution, art: BenchArtMode): string {
  return `${frame.width}x${frame.height}${art === 'native' ? 'n' : ''}`;
}

/**
 * The frames the bench measures: each resolution's `scaled` row (where the atlas model allows one)
 * and its `native` row, resolution by resolution.
 *
 * @remarks
 * 384×216's two modes are the same frame at the same density, so it contributes one row — the
 * baseline, first. Every other resolution contributes a `native` row, and the ten of them with a
 * density a scaled row too: 25 rows in all.
 */
export const BENCH_SIZES: readonly BenchSize[] = Object.freeze(
  BENCH_RESOLUTIONS.reduce<BenchSize[]>((out, frame) => {
    const scaled = frame.scaled;
    if (scaled !== null) {
      out.push(
        Object.freeze<BenchSize>({
          id: sizeId(frame, 'scaled'),
          width: frame.width,
          height: frame.height,
          density: scaled,
          art: 'scaled',
        }),
      );
    }
    // A density of 1 *is* the native row (the 384×216 baseline): one row, not two.
    if (scaled !== 1) {
      out.push(
        Object.freeze<BenchSize>({
          id: sizeId(frame, 'native'),
          width: frame.width,
          height: frame.height,
          density: 1,
          art: 'native',
        }),
      );
    }
    return out;
  }, []),
);

/**
 * The densities the bench needs an atlas for, ascending — `scripts/bench-atlas.mjs`
 * `BENCH_DENSITIES` must be exactly this list (pinned by `apps/tizen/test/bench/bench.test.ts`).
 */
export const BENCH_DENSITIES: readonly number[] = Object.freeze(
  BENCH_SIZES.map((size) => size.density)
    .filter((density, index, all) => all.indexOf(density) === index)
    .sort((a, b) => a - b),
);

/**
 * Finds a frame size by id.
 *
 * @param id - Size id, e.g. `'1280x720n'`.
 * @returns The size, or `null` for an unknown id.
 */
export function findBenchSize(id: string): BenchSize | null {
  for (let i = 0; i < BENCH_SIZES.length; i++) {
    if (BENCH_SIZES[i].id === id) return BENCH_SIZES[i];
  }
  return null;
}

/** The v2 frame's scaled row — the frame the bench's own pages (results, decode) render at. */
export const BENCH_V2_SIZE: BenchSize = findBenchSize('640x360') ?? BENCH_SIZES[0];

/** One load variant on top of the busy frame. */
export interface BenchVariant {
  /** Id: `busy`, `filter`, `mode7`, `crt-light`, `crt-full`, `worst`. */
  readonly id: string;
  /** CRT / scanline setting. */
  readonly crt: CrtFilter;
  /** A filtered layer (a raster wave on the far backdrop — the M2-08 layer-effect filter). */
  readonly filter: boolean;
  /** The Mode-7 floor (M3-02) under the horizon. */
  readonly mode7: boolean;
}

/**
 * The variants (plan §13: plain busy frame, + filtered layer, + Mode-7, + CRT light / full), plus
 * `worst` — all of them at once, the frame no stage should ever exceed.
 */
export const BENCH_VARIANTS: readonly BenchVariant[] = Object.freeze([
  Object.freeze({ id: 'busy', crt: 'off', filter: false, mode7: false }),
  Object.freeze({ id: 'filter', crt: 'off', filter: true, mode7: false }),
  Object.freeze({ id: 'mode7', crt: 'off', filter: false, mode7: true }),
  Object.freeze({ id: 'crt-light', crt: 'light', filter: false, mode7: false }),
  Object.freeze({ id: 'crt-full', crt: 'full', filter: false, mode7: false }),
  Object.freeze({ id: 'worst', crt: 'full', filter: true, mode7: true }),
] as BenchVariant[]);

/** The upscale mode every plain row uses (the only one R0-02 measured). */
export const BENCH_DEFAULT_SCALE_MODE: ScaleMode = 'integer';

/**
 * One performance knob: a setting varied at a few sizes and variants, on top of the plain matrix
 * (see the module docs).
 *
 * @remarks
 * A knob row's id is `<size>-<variant>-<knob>` and its record's `variant` is `<variant>-<knob>`,
 * so a knob row never merges with the plain row it is read against (`results.ts` `baselineOf`
 * reads a knob row against that plain row, not against 384×216).
 */
export interface BenchKnob {
  /** Id, e.g. `'stretch'`. */
  readonly id: string;
  /** What it varies, for the analyzer's knob table. */
  readonly what: string;
  /** Size ids it runs at. */
  readonly sizes: readonly string[];
  /** Variant ids it runs with. */
  readonly variants: readonly string[];
  /** Upscale mode, or `null` for {@link BENCH_DEFAULT_SCALE_MODE}. */
  readonly scaleMode: ScaleMode | null;
  /** Whether render interpolation is on (M2-08). */
  readonly interpolation: boolean;
  /** Canvas width in CSS pixels, or 0 for the window's. */
  readonly outputWidth: number;
  /** Canvas height in CSS pixels, or 0 for the window's. */
  readonly outputHeight: number;
  /**
   * v2 R7-VID: whether the row builds the renderer with the cutscene video surface and plays a
   * looping clip for the whole session — the panel cost of decode plus one texture pull a frame.
   */
  readonly video: boolean;
}

/**
 * The knobs (see the module docs): the two non-default upscale modes, render interpolation, two
 * output resolutions below the display's and the cutscene video surface — 24 rows in all, each
 * with `busy` and `worst`.
 *
 * @remarks
 * `fit` and `stretch` only differ from `integer` when the frame's aspect ratio is not the
 * display's or integer scaling leaves a border, so they run at the two odd-aspect sizes 800×600
 * (4:3) and 854×480; `stretch` also runs at 640×360, where `integer` and `fit` are the same ×3 on
 * a 1080p panel — the control that says what the knob itself costs. Interpolation and the output
 * resolutions run at the v2 frame and at the biggest native frames, where a per-sprite lerp or an
 * upscale has the most to do. The output knobs keep the canvas's CSS size (the whole window), so
 * the browser scales the smaller backbuffer up to the panel. `video` runs at the v2 frame alone —
 * the surface is a 640×360 quad of the game's own size — read against the plain `640x360` rows
 * like every other knob.
 */
export const BENCH_KNOBS: readonly BenchKnob[] = Object.freeze([
  Object.freeze<BenchKnob>({
    id: 'fit',
    what: "upscale mode 'fit' (whole display, aspect kept, fractional scale)",
    sizes: Object.freeze(['800x600', '854x480']),
    variants: Object.freeze(['busy', 'worst']),
    scaleMode: 'fit',
    interpolation: false,
    outputWidth: 0,
    outputHeight: 0,
    video: false,
  }),
  Object.freeze<BenchKnob>({
    id: 'stretch',
    what: "upscale mode 'stretch' (whole display, aspect ignored)",
    sizes: Object.freeze(['800x600', '854x480', '640x360']),
    variants: Object.freeze(['busy', 'worst']),
    scaleMode: 'stretch',
    interpolation: false,
    outputWidth: 0,
    outputHeight: 0,
    video: false,
  }),
  Object.freeze<BenchKnob>({
    id: 'interp',
    what: 'render interpolation on (M2-08): every sprite lerped by the loop fraction',
    sizes: Object.freeze(['640x360', '1280x720n', '1920x1080n']),
    variants: Object.freeze(['busy', 'worst']),
    scaleMode: null,
    interpolation: true,
    outputWidth: 0,
    outputHeight: 0,
    video: false,
  }),
  Object.freeze<BenchKnob>({
    id: 'out720',
    what: 'canvas backbuffer 1280x720 (the browser scales it to the panel)',
    sizes: Object.freeze(['640x360', '1920x1080n']),
    variants: Object.freeze(['busy', 'worst']),
    scaleMode: null,
    interpolation: false,
    outputWidth: 1280,
    outputHeight: 720,
    video: false,
  }),
  Object.freeze<BenchKnob>({
    id: 'out540',
    what: 'canvas backbuffer 960x540 (the browser scales it to the panel)',
    sizes: Object.freeze(['640x360']),
    variants: Object.freeze(['busy', 'worst']),
    scaleMode: null,
    interpolation: false,
    outputWidth: 960,
    outputHeight: 540,
    video: false,
  }),
  Object.freeze<BenchKnob>({
    id: 'video',
    what: 'cutscene video surface: clip decode plus a texture pull every rendered frame (v2 R7-VID)',
    sizes: Object.freeze(['640x360']),
    variants: Object.freeze(['busy', 'worst']),
    scaleMode: null,
    interpolation: false,
    outputWidth: 0,
    outputHeight: 0,
    video: true,
  }),
]);

/** One scenario: a size, a variant and — on a knob row — the knob it varies. */
export interface BenchScenario {
  /** `<size>-<variant>` or `<size>-<variant>-<knob>`, e.g. `'640x360-mode7'`. */
  readonly id: string;
  /** Position in {@link BENCH_SCENARIOS}. */
  readonly index: number;
  /** The internal frame. */
  readonly size: BenchSize;
  /** The load variant. */
  readonly variant: BenchVariant;
  /** The knob this row varies, or `null` on a plain row. */
  readonly knob: BenchKnob | null;
  /** The record's `variant` field: `<variant>` or `<variant>-<knob>`. */
  readonly row: string;
  /** Upscale mode of the frame on the display. */
  readonly scaleMode: ScaleMode;
  /** Whether render interpolation is on. */
  readonly interpolation: boolean;
  /** Canvas width in CSS pixels, or 0 for the window's. */
  readonly outputWidth: number;
  /** Canvas height in CSS pixels, or 0 for the window's. */
  readonly outputHeight: number;
}

/**
 * Builds one scenario.
 *
 * @param index - Its position in the matrix.
 * @param size - The frame size.
 * @param variant - The load variant.
 * @param knob - The knob, or `null`.
 * @returns The scenario.
 */
function scenarioOf(
  index: number,
  size: BenchSize,
  variant: BenchVariant,
  knob: BenchKnob | null,
): BenchScenario {
  const row = knob === null ? variant.id : `${variant.id}-${knob.id}`;
  return Object.freeze({
    id: `${size.id}-${row}`,
    index,
    size,
    variant,
    knob,
    row,
    scaleMode: knob?.scaleMode ?? BENCH_DEFAULT_SCALE_MODE,
    interpolation: knob?.interpolation ?? false,
    outputWidth: knob?.outputWidth ?? 0,
    outputHeight: knob?.outputHeight ?? 0,
  });
}

/**
 * Builds the matrix (see {@link BENCH_SCENARIOS}).
 *
 * @returns Every scenario, in run order.
 */
function buildScenarios(): BenchScenario[] {
  const out: BenchScenario[] = [];
  for (const size of BENCH_SIZES) {
    for (const variant of BENCH_VARIANTS) out.push(scenarioOf(out.length, size, variant, null));
  }
  for (const knob of BENCH_KNOBS) {
    for (const id of knob.sizes) {
      const size = findBenchSize(id);
      if (size === null) throw new Error(`render bench: knob ${knob.id} names no size "${id}"`);
      for (const variant of BENCH_VARIANTS) {
        if (knob.variants.indexOf(variant.id) >= 0) {
          out.push(scenarioOf(out.length, size, variant, knob));
        }
      }
    }
  }
  return out;
}

/**
 * Every scenario: the plain matrix first — sizes outer, variants inner, so a session measures its
 * 384×216 baseline before anything else and a run cut short still holds whole resolutions — then
 * the knob rows (150 + 24 = 174).
 */
export const BENCH_SCENARIOS: readonly BenchScenario[] = Object.freeze(buildScenarios());

/**
 * Finds a scenario by id.
 *
 * @param id - Scenario id.
 * @returns The scenario, or `null` for an unknown id.
 */
export function findBenchScenario(id: string): BenchScenario | null {
  for (let i = 0; i < BENCH_SCENARIOS.length; i++) {
    if (BENCH_SCENARIOS[i].id === id) return BENCH_SCENARIOS[i];
  }
  return null;
}

/** How long a scenario's three phases last. */
export interface BenchTiming {
  /** Rendered but not measured (programs link, batch buffers grow, the GPU clocks settle), ms. */
  readonly warmupMs: number;
  /** Measured free-running: render CPU ms, rAF deltas, ticks per frame, ms. */
  readonly measureMs: number;
  /** Measured with `gl.finish()` after every render (the synced GPU figure), ms. */
  readonly syncMs: number;
  /**
   * Fewest frames each measured phase records before it may end, whatever the clock says (0 on the
   * TV, where the phases are timed; headless, SwiftShader can stall for a second under load).
   */
  readonly minFrames: number;
}

/**
 * The TV's phase timing (plan R0-02): 10 s of warm-up and 20 s of measurement — 14 s free-running,
 * 6 s synced — about 33 s a scenario with the reload.
 */
export const TV_BENCH_TIMING: BenchTiming = Object.freeze({
  warmupMs: 10_000,
  measureMs: 14_000,
  syncMs: 6_000,
  minFrames: 0,
});

/**
 * The headless phase timing (`?scenario=…` pages driven by `pnpm bench`): long enough for the
 * counted gates (draw calls, bytes, heap), short enough for SwiftShader.
 */
export const HEADLESS_BENCH_TIMING: BenchTiming = Object.freeze({
  warmupMs: 500,
  measureMs: 1_500,
  syncMs: 500,
  minFrames: 20,
});

/**
 * Reads one query-string parameter.
 *
 * @param search - `location.search` (with or without the leading `?`).
 * @param name - Parameter name.
 * @returns The decoded value, `''` for a bare `?name`, or `null` when absent.
 *
 * @example
 * ```ts
 * searchParam('?scenario=640x360-busy&gl=2', 'gl'); // → '2'
 * ```
 */
export function searchParam(search: string, name: string): string | null {
  const query = search.charAt(0) === '?' ? search.slice(1) : search;
  if (query === '') return null;
  const pairs = query.split('&');
  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i];
    const eq = pair.indexOf('=');
    const key = eq < 0 ? pair : pair.slice(0, eq);
    if (key !== name) continue;
    try {
      return eq < 0 ? '' : decodeURIComponent(pair.slice(eq + 1).replace(/\+/g, ' '));
    } catch (_error) {
      return null;
    }
  }
  return null;
}

/**
 * The phase timing a query string asks for: `?warmup=<ms>&measure=<ms>&sync=<ms>&frames=<n>`, each
 * falling back to `base` when absent or not a whole number ≥ 0 (`measure` ≥ 1).
 *
 * @param search - `location.search`.
 * @param base - Defaults.
 * @returns The timing.
 */
export function timingFromSearch(search: string, base: BenchTiming): BenchTiming {
  /**
   * One duration.
   *
   * @param name - Parameter name.
   * @param fallback - Default.
   * @param min - Smallest accepted value.
   * @returns The duration in ms.
   */
  const read = (name: string, fallback: number, min: number): number => {
    const raw = searchParam(search, name);
    if (raw === null || !/^\d+$/.test(raw)) return fallback;
    const value = Number(raw);
    return value >= min ? value : fallback;
  };
  return {
    warmupMs: read('warmup', base.warmupMs, 0),
    measureMs: read('measure', base.measureMs, 1),
    syncMs: read('sync', base.syncMs, 0),
    minFrames: read('frames', base.minFrames, 0),
  };
}
