/**
 * SVG feature-capability matrix (R-SVG-WO3A): a fixed catalog of small, known-output SVGs rastered
 * through the image pipeline (`blob:` URL → `Image` → first `drawImage` + `getImageData` flush), each
 * checked by numeric pixel predicates and timed. The answers the game's SVG-art decision needs from
 * real hardware (Tizen 5.5 / Chromium 69 / Mali): which feature renders, what it costs, whether
 * SMIL / CSS animation advance inside `<img>`, whether `createImageBitmap(SVG)` is rejected, and what
 * one ~50 KB E3-style compound-path atlas chunk costs to raster and whether it lands pixel-exact.
 *
 * **Responsibility.** Feature catalog, the run/evaluate state machine, and all display / report
 * shaping. **Implements.** `plan_resolution.md` R-SVG WO-3 / the WO-R-SVG3(a) work order
 * (`docs/dev/` run notes); the question list of `r-svg-inv-report.md` §B'. **Public API:**
 * {@link SVG_FEATURES}, {@link SvgMatrix}, {@link e3Atlas}, the report shapes.
 *
 * Pure module: every browser touchpoint goes through the injected {@link SvgProbeHost}
 * (`src/svgHost.ts` builds the real one), so the whole matrix runs headlessly in Node tests with a
 * scripted fake host. The machine never assumes `Image` / `Blob` / `URL` exist — a realm without them
 * ends in status `unavailable` and no other work.
 *
 * @remarks
 * Timing model per raster window (one fresh blob URL + one fresh `Image` per window, so nothing is
 * cached across windows): `decodeMs` = `src` assignment → `onload` (+ `decode()` when the engine has
 * it), `drawMs` = the first `drawImage` through the `getImageData` read-back (the materialization
 * point), `totalMs` = both summed per window. A feature runs {@link SVG_WARM_WINDOWS} throwaway
 * windows first, then {@link SVG_MEASURE_WINDOWS} measured ones; the reported numbers are medians of
 * the measured windows. A window that has not reached its next phase within {@link SVG_PHASE_TIMEOUT_MS}
 * fails the feature as `TIMEOUT` — on a device that cannot raster the feature at all the probe still
 * finishes.
 *
 * Status vocabulary: `PASS` / `FAIL` (pixel signature), `ERROR` / `TIMEOUT` (could not complete),
 * `FROZEN` / `ANIMATES` (dynamic: the redraw after {@link SVG_ANIM_WAIT_MS} produced the same / a
 * different raster — `FROZEN` is the documented static-image-mode answer), `REJECT` / `ACCEPT`
 * (createImageBitmap; `REJECT` is the desktop-pinned answer), `UNAVAILABLE` (the realm cannot run).
 *
 * @module svgProbe
 */

import { padLeft, padRight, round1, truncate } from './format';

/** Throwing away this many windows first stabilizes caches / JIT before measuring. */
export const SVG_WARM_WINDOWS = 3;
/** Measured windows per raster feature (the median below is over these — ≥ 10 by the work order). */
export const SVG_MEASURE_WINDOWS = 12;
/** A phase (load / decode / bitmap) may take this long before the feature is `TIMEOUT`. */
export const SVG_PHASE_TIMEOUT_MS = 12_000;
/** The dynamic features wait this long (ms) between the first and the second read. */
export const SVG_ANIM_WAIT_MS = 500;
/** The matrix idles this long after the first frame before starting (boot / env probes first). */
export const SVG_START_DELAY_MS = 1_500;

/** Whole-pixel size of the catalog's feature canvases (the E3 chunk is its own smaller size). */
export const SVG_FEATURE_SIZE = 256;

/** Matrix life-cycle state. */
export type SvgMatrixStatus = 'pending' | 'running' | 'done' | 'unavailable';

/** One feature's outcome — see the module docblock for the vocabulary. */
export type SvgFeatureStatus =
  | 'pending'
  | 'running'
  | 'PASS'
  | 'FAIL'
  | 'ERROR'
  | 'TIMEOUT'
  | 'FROZEN'
  | 'ANIMATES'
  | 'REJECT'
  | 'ACCEPT'
  | 'UNAVAILABLE';

/** Feature kinds: timed raster windows, a two-read animation probe, or a createImageBitmap attempt. */
export type SvgFeatureKind = 'raster' | 'dynamic' | 'bitmap';

/** RGBA pixels of one {@link SvgProbeHost.read}, row-major, `size × size`. */
export interface SvgPixels {
  /** Canvas side in pixels. */
  size: number;
  /** `size * size * 4` bytes. */
  data: Uint8Array | Uint8ClampedArray;
}

/** Opaque per-window handle owned by the host (the image + its blob URL in the real glue). */
export interface SvgWindow {
  /** Kept opaque; the glue casts through `unknown`. */
  readonly handle: unknown;
}

/** Everything the matrix needs from the realm, injected so it runs headlessly in tests. */
export interface SvgProbeHost {
  /** Current `performance.now()` in ms. */
  now(): number;
  /**
   * Starts loading `source` as an SVG image sized `size` (fresh blob URL every call).
   *
   * @param source - the SVG text.
   * @param size - canvas side for later {@link SvgProbeHost.read} calls.
   * @param done - called once when the image loaded (`ok`) or failed; **may be called synchronously**.
   * @returns the window handle, or `null` when the realm cannot raster SVG images at all.
   */
  begin(source: string, size: number, done: (ok: boolean, err: string) => void): SvgWindow | null;
  /** Optional second decode phase (`img.decode()`); glue calls `done(true, '')` when absent. */
  decode(win: SvgWindow, done: (ok: boolean, err: string) => void): void;
  /**
   * Draws the window's image (top-left, native size) into the probe canvas and reads it back.
   * Synchronous; the matrix times it as the `drawMs` of the window.
   *
   * @param win - a loaded window.
   * @returns the pixel data.
   */
  read(win: SvgWindow): SvgPixels;
  /** Attempts `createImageBitmap(img)` on the loaded window. */
  bitmap(win: SvgWindow, done: (ok: boolean, info: string) => void): void;
  /** Revokes the blob URL / drops the image. */
  release(win: SvgWindow): void;
}

/** One pixel the raster signature checks. */
export interface SvgSample {
  /** x within the feature canvas. */
  x: number;
  /** y within the feature canvas. */
  y: number;
  /** True when the pixel is what the feature should have drawn. */
  check: (r: number, g: number, b: number, a: number) => boolean;
}

/** Expected count of pixels with alpha above 8. */
export interface SvgInk {
  /** Inclusive lower bound. */
  min: number;
  /** Inclusive upper bound. */
  max: number;
}

/** Count of pixels passing `test` inside a rectangle, bounded. */
export interface SvgRegion {
  /** Region left x. */
  x: number;
  /** Region top y. */
  y: number;
  /** Region width. */
  w: number;
  /** Region height. */
  h: number;
  /** True when a pixel is ink for this feature. */
  test: (r: number, g: number, b: number, a: number) => boolean;
  /** Inclusive lower bound on the matching count. */
  min: number;
  /** Inclusive upper bound. */
  max: number;
}

/** One catalog entry. */
export interface SvgFeatureDef {
  /** Stable id (the report row key; never rename a shipped id). */
  id: string;
  /** What the feature probe does. */
  kind: SvgFeatureKind;
  /** Canvas side for this feature. */
  size: number;
  /** The SVG source to raster (for `bitmap`: the image `createImageBitmap` is attempted on). */
  build: () => string;
  /** Pixels the raster must contain (raster kinds). */
  samples?: readonly SvgSample[];
  /** Opaque-pixel count window (raster kinds). */
  ink?: SvgInk;
  /** Bounded pixel-count checks inside rectangles (text ink, filter footprints). */
  regions?: readonly SvgRegion[];
  /** Reference pixels to compare byte-for-byte (the E3 chunk; raster kinds). */
  strict?: () => { size: number; data: Uint8Array };
  /** One-line human note shown after the status. */
  note?: string;
}

/** What one report row carries (additive schema, `stats.svg.features[]`). */
export interface SvgFeatureReport {
  /** Catalog id. */
  id: string;
  /** Feature kind. */
  kind: SvgFeatureKind;
  /** Outcome; `pending` while not reached. */
  status: SvgFeatureStatus;
  /** SVG source bytes. */
  bytes: number | null;
  /** Median decode ms (load + decode phase), measured windows. */
  decodeMs: number | null;
  /** Median first-draw + read-back ms. */
  drawMs: number | null;
  /** Median total ms (the raster cost datapoint). */
  totalMs: number | null;
  /** Measured windows that ran. */
  windows: number;
  /** Opaque pixels of the last read. */
  inkedPx: number | null;
  /** Extra fact: mismatch count, load error, bitmap accept/reject message, … */
  detail: string | null;
}

/** Compact verdicts-dict entry (`verdicts.svg`), scalar-only. */
export interface SvgSummary {
  /** Matrix state. */
  status: SvgMatrixStatus;
  /** Features finalized. */
  done: number;
  /** Catalog size. */
  total: number;
  /** `PASS` rows. */
  pass: number;
  /** `FAIL` / `TIMEOUT` rows (wrong pixels or unable to complete — both need a look). */
  fail: number;
  /** `ERROR` rows (load/raster error — realm capability facts included). */
  error: number;
}

/** The full matrix block (`stats.svg`). */
export interface SvgMatrixReport {
  /** Matrix state. */
  status: SvgMatrixStatus;
  /** ms since the first frame that started work (null while pending). */
  elapsedMs: number | null;
  /** Throwaway windows per raster feature. */
  warmWindows: number;
  /** Measured windows per raster feature. */
  measureWindows: number;
  /** One row per catalog feature, in catalog order. */
  features: SvgFeatureReport[];
}

// --------------------------------------------------------------------------------------------- E3 generator

/** Size of the inline E3-style chunk (its own smaller square — it stands in for one atlas page tile). */
export const E3_SIZE = 128;
/** Cell of the LCG pattern field (4-px blocks at 128). */
const E3_CELLS = 32;
/** Colors of the chunk (palette-index 0 … E3_PALETTE-1). */
const E3_PALETTE = 12;

/**
 * Deterministically generates one E3-style compound-path atlas chunk: a fixed-seed LCG field of
 * `E3_CELLS × E3_CELLS` color cells upscaled to `E3_SIZE`, emitted as one `<path>` per palette color
 * whose `d` is horizontal runs merged vertically — SVG 1.1 core attributes only,
 * `shape-rendering="crispEdges"`, every pixel opaque. ~50 KB — the representative
 * "whole-page compound-path chunk" of the work order.
 *
 * @returns the SVG text, the reference RGBA pixels (the signature the raster must match exactly),
 *   and the run count.
 */
export function e3Atlas(): { svg: string; pixels: Uint8Array; rects: number } {
  let s = 0x1234_5678;
  const next = (): number => {
    s = (Math.imul(s, 1_664_525) + 1_013_904_223) >>> 0;
    return s;
  };
  const block = E3_SIZE / E3_CELLS;
  const pixels = new Uint8Array(E3_SIZE * E3_SIZE * 4);
  const color = new Uint8Array(E3_SIZE * E3_SIZE);
  for (let cy = 0; cy < E3_CELLS; cy++) {
    for (let cx = 0; cx < E3_CELLS; cx++) {
      const c = (next() >>> 27) % E3_PALETTE;
      for (let dy = 0; dy < block; dy++) {
        const row = (cy * block + dy) * E3_SIZE;
        for (let dx = 0; dx < block; dx++) color[row + cx * block + dx] = c;
      }
    }
  }
  let rects = 0;
  let body = '';
  for (let c = 0; c < E3_PALETTE; c++) {
    const runs: Array<{ x0: number; w: number; y: number; h: number }> = [];
    for (let y = 0; y < E3_SIZE; y++) {
      let x = 0;
      while (x < E3_SIZE) {
        if (color[y * E3_SIZE + x] !== c) {
          x++;
          continue;
        }
        let x2 = x;
        while (x2 + 1 < E3_SIZE && color[y * E3_SIZE + x2 + 1] === c) x2++;
        const w = x2 - x + 1;
        const prev = runs[runs.length - 1];
        if (prev !== undefined && prev.x0 === x && prev.w === w && prev.y + prev.h === y) prev.h += 1;
        else runs.push({ x0: x, w, y, h: 1 });
        x = x2 + 1;
      }
    }
    rects += runs.length;
    let d = '';
    for (const r of runs) d += 'M' + r.x0 + ' ' + r.y + 'h' + r.w + 'v' + r.h + 'h' + -r.w + 'z';
    body += '<path fill="' + e3Color(c) + '" d="' + d + '"/>';
  }
  for (let i = 0; i < color.length; i++) {
    const rgb = e3ColorRgb(color[i] as number);
    pixels[i * 4] = rgb[0];
    pixels[i * 4 + 1] = rgb[1];
    pixels[i * 4 + 2] = rgb[2];
    pixels[i * 4 + 3] = 255;
  }
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="' + E3_SIZE + '" height="' + E3_SIZE +
    '" viewBox="0 0 ' + E3_SIZE + ' ' + E3_SIZE + '"><g shape-rendering="crispEdges">' + body + '</g></svg>';
  return { svg, pixels, rects };
}

/** The cached chunk (the generator is pure and deterministic, so one run per page is enough). */
let e3Cache: { svg: string; pixels: Uint8Array; rects: number } | null = null;

/**
 * The catalog's single {@link e3Atlas} instance.
 *
 * @returns the cached chunk.
 */
function e3Once(): { svg: string; pixels: Uint8Array; rects: number } {
  if (e3Cache === null) e3Cache = e3Atlas();
  return e3Cache;
}

/**
 * `#rrggbb` of palette index `c` (the same formula built the reference pixels).
 *
 * @param c - palette index.
 * @returns `"#rrggbb"`.
 */
function e3Color(c: number): string {
  const rgb = e3ColorRgb(c);
  return (
    '#' + rgb[0].toString(16).padStart(2, '0') + rgb[1].toString(16).padStart(2, '0') + rgb[2].toString(16).padStart(2, '0')
  );
}

/**
 * RGB triple of palette index `c`.
 *
 * @param c - palette index.
 * @returns `[r, g, b]`.
 */
function e3ColorRgb(c: number): number[] {
  return [(c * 40 + 20) & 255, (c * 89 + 40) & 255, (c * 151 + 60) & 255];
}

// --------------------------------------------------------------------------------------------- the catalog

/** Opens every feature SVG (blob-loaded images need the explicit namespace and size). */
function svgOpen(size: number, extra = ''): string {
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="' + size +
    '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '"' + extra + '>'
  );
}

/** True when the pixel is (close to) fully opaque red / green / blue / white. */
const isRed = (r: number, g: number, b: number, a: number): boolean => a >= 250 && r >= 245 && g <= 8 && b <= 8;
const isGreen = (r: number, g: number, b: number, a: number): boolean => a >= 250 && r <= 8 && g >= 245 && b <= 8;
const isBlue = (r: number, g: number, b: number, a: number): boolean => a >= 250 && r <= 8 && g <= 8 && b >= 245;
const isWhite = (r: number, g: number, b: number, a: number): boolean => a >= 250 && r >= 245 && g >= 245 && b >= 245;
/** True when the pixel is (near-)transparent. */
const isClear = (_r: number, _g: number, _b: number, a: number): boolean => a <= 8;

/**
 * The catalog, in run order. Ids are report keys — append-only, never rename. Each raster row pairs a
 * tiny SVG with the pixel facts that prove the feature actually rastered (gradients that interpolated,
 * masks that multiplied, filters that spread, the compound path that landed exact).
 */
export const SVG_FEATURES: readonly SvgFeatureDef[] = [
  {
    id: 'paths-static',
    kind: 'raster',
    size: SVG_FEATURE_SIZE,
    build: () =>
      svgOpen(256) +
      '<rect x="0" y="0" width="128" height="128" fill="#ff0000"/>' +
      '<rect x="128" y="0" width="128" height="128" fill="#00ff00"/>' +
      '<rect x="0" y="128" width="128" height="128" fill="#0000ff"/>' +
      '<rect x="128" y="128" width="128" height="128" fill="#ffffff"/></svg>',
    samples: [
      { x: 64, y: 64, check: isRed },
      { x: 192, y: 64, check: isGreen },
      { x: 64, y: 192, check: isBlue },
      { x: 192, y: 192, check: isWhite },
    ],
    ink: { min: 65_530, max: 65_536 },
    note: 'baseline',
  },
  {
    id: 'grad-linear',
    kind: 'raster',
    size: SVG_FEATURE_SIZE,
    build: () =>
      svgOpen(256) +
      '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="0">' +
      '<stop offset="0" stop-color="#ff0000"/><stop offset="1" stop-color="#0000ff"/></linearGradient></defs>' +
      '<rect width="256" height="256" fill="url(#g)"/></svg>',
    samples: [
      { x: 12, y: 128, check: (r, g, b, a) => a >= 250 && r >= 210 && g <= 45 && b <= 45 },
      { x: 128, y: 128, check: (r, g, b, a) => a >= 250 && r >= 75 && r <= 180 && b >= 75 && b <= 180 && g <= 45 },
      { x: 244, y: 128, check: (r, g, b, a) => a >= 250 && b >= 210 && r <= 45 && g <= 45 },
    ],
    ink: { min: 65_530, max: 65_536 },
  },
  {
    id: 'grad-radial',
    kind: 'raster',
    size: SVG_FEATURE_SIZE,
    build: () =>
      svgOpen(256) +
      '<defs><radialGradient id="g" cx="0.5" cy="0.5" r="0.5">' +
      '<stop offset="0" stop-color="#ff0000" stop-opacity="1"/>' +
      '<stop offset="1" stop-color="#ff0000" stop-opacity="0"/></radialGradient></defs>' +
      '<rect width="256" height="256" fill="url(#g)"/></svg>',
    samples: [
      { x: 128, y: 128, check: (r, _g, _b, a) => a >= 250 && r >= 225 },
      { x: 128, y: 236, check: (r, _g, _b, a) => a >= 12 && a <= 95 && r >= 150 },
      { x: 6, y: 6, check: isClear },
    ],
    ink: { min: 43_000, max: 53_000 },
  },
  {
    id: 'mask-lum',
    kind: 'raster',
    size: SVG_FEATURE_SIZE,
    build: () =>
      svgOpen(256) +
      '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="0">' +
      '<stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#000000"/></linearGradient>' +
      '<mask id="m"><rect width="256" height="256" fill="url(#g)"/></mask></defs>' +
      '<rect width="256" height="256" fill="#ff0000" mask="url(#m)"/></svg>',
    samples: [
      { x: 8, y: 128, check: (_r, _g, _b, a) => a >= 225 },
      { x: 128, y: 128, check: (_r, _g, _b, a) => a >= 90 && a <= 165 },
      { x: 248, y: 128, check: (_r, _g, _b, a) => a <= 30 },
    ],
    ink: { min: 58_000, max: 65_536 },
  },
  {
    id: 'clip-circle',
    kind: 'raster',
    size: SVG_FEATURE_SIZE,
    build: () =>
      svgOpen(256) +
      '<defs><clipPath id="c"><circle cx="128" cy="128" r="64"/></clipPath></defs>' +
      '<rect width="256" height="256" fill="#00ff00" clip-path="url(#c)"/></svg>',
    samples: [
      { x: 128, y: 128, check: (_r, g, _b, a) => a >= 220 && g >= 200 },
      { x: 128, y: 180, check: (_r, g, _b, a) => a >= 220 && g >= 200 },
      { x: 128, y: 196, check: isClear },
    ],
    ink: { min: 12_000, max: 13_800 },
  },
  {
    id: 'use-symbol',
    kind: 'raster',
    size: SVG_FEATURE_SIZE,
    build: () =>
      svgOpen(256) +
      '<defs><symbol id="s" viewBox="0 0 40 40"><rect width="40" height="40" fill="#0000ff"/></symbol></defs>' +
      '<use href="#s" xlink:href="#s" x="16" y="16" width="40" height="40"/>' +
      '<use href="#s" xlink:href="#s" x="120" y="120" width="40" height="40"/></svg>',
    samples: [
      { x: 36, y: 36, check: isBlue },
      { x: 140, y: 140, check: isBlue },
      { x: 100, y: 100, check: isClear },
    ],
    ink: { min: 3_000, max: 3_400 },
  },
  {
    id: 'text-glyph',
    kind: 'raster',
    size: SVG_FEATURE_SIZE,
    build: () =>
      svgOpen(256) +
      '<rect width="256" height="256" fill="#ffffff"/>' +
      '<text x="128" y="150" font-family="sans-serif" font-size="72" text-anchor="middle" fill="#000000">88</text></svg>',
    samples: [{ x: 4, y: 4, check: isWhite }],
    ink: { min: 65_530, max: 65_536 },
    regions: [{ x: 48, y: 48, w: 160, h: 160, test: (r, g, b, a) => a >= 250 && r < 100 && g < 100 && b < 100, min: 400, max: 16_000 }],
    note: 'ink-only (fonts differ)',
  },
  {
    id: 'text-path',
    kind: 'raster',
    size: SVG_FEATURE_SIZE,
    build: () =>
      svgOpen(256) +
      '<defs><path id="p" d="M24 180 Q128 40 232 180"/></defs>' +
      '<text font-family="sans-serif" font-size="26" fill="#ff0000">' +
      '<textPath href="#p" xlink:href="#p">SHMUP CAPABILITY</textPath></text></svg>',
    samples: [
      { x: 4, y: 4, check: isClear },
      { x: 248, y: 250, check: isClear },
    ],
    ink: { min: 300, max: 20_000 },
    regions: [{ x: 0, y: 0, w: 256, h: 256, test: (r, g, _b, a) => a >= 200 && r >= 200 && g <= 60, min: 300, max: 20_000 }],
    note: 'ink-only',
  },
  {
    id: 'blur-s2',
    kind: 'raster',
    size: SVG_FEATURE_SIZE,
    build: () => blurSvg(2),
    samples: [
      { x: 128, y: 128, check: (r, _g, _b, a) => a >= 200 && r >= 200 },
      { x: 128, y: 156, check: (_r, _g, _b, a) => a >= 70 && a <= 210 },
      { x: 128, y: 166, check: (_r, _g, _b, a) => a <= 16 },
    ],
    ink: { min: 2_700, max: 3_800 },
    note: 'σ=2 halo sharp',
  },
  {
    id: 'blur-s4',
    kind: 'raster',
    size: SVG_FEATURE_SIZE,
    build: () => blurSvg(4),
    samples: [
      { x: 128, y: 128, check: (r, _g, _b, a) => a >= 200 && r >= 200 },
      { x: 128, y: 156, check: (_r, _g, _b, a) => a >= 60 && a <= 220 },
      { x: 128, y: 166, check: (_r, _g, _b, a) => a <= 60 },
    ],
    ink: { min: 3_300, max: 4_600 },
    note: 'σ=4 halo',
  },
  {
    id: 'blur-s8',
    kind: 'raster',
    size: SVG_FEATURE_SIZE,
    build: () => blurSvg(8),
    samples: [
      { x: 128, y: 128, check: (r, _g, _b, a) => a >= 200 && r >= 200 },
      { x: 128, y: 166, check: (_r, _g, _b, a) => a >= 8 && a <= 60 },
      { x: 128, y: 196, check: (_r, _g, _b, a) => a <= 8 },
    ],
    ink: { min: 4_200, max: 7_000 },
    note: 'σ=8 must spread',
  },
  {
    id: 'drop-shadow',
    kind: 'raster',
    size: SVG_FEATURE_SIZE,
    build: () =>
      svgOpen(256) +
      '<rect width="256" height="256" fill="#ffffff"/>' +
      '<rect x="40" y="40" width="60" height="60" fill="#ff0000" filter="url(#ds)"/>' +
      '<defs><filter id="ds" x="-50%" y="-50%" width="200%" height="200%">' +
      '<feDropShadow dx="20" dy="20" stdDeviation="5" flood-color="#000000" flood-opacity="0.5"/>' +
      '</filter></defs></svg>',
    samples: [
      { x: 64, y: 64, check: (r, g, _b, a) => a >= 250 && r >= 200 && g <= 70 },
      { x: 112, y: 112, check: (r, g, _b, a) => a >= 250 && r >= 80 && r <= 238 && g <= 238 },
      { x: 248, y: 248, check: isWhite },
    ],
    note: 'Chrome 79+',
  },
  {
    id: 'turb-oct1',
    kind: 'raster',
    size: SVG_FEATURE_SIZE,
    build: () => turbSvg(1),
    samples: [{ x: 4, y: 4, check: isClear }],
    ink: { min: 40_000, max: 56_000 },
    regions: [{ x: 16, y: 16, w: 224, h: 224, test: (_r, _g, _b, a) => a >= 40 && a <= 215, min: 1, max: 50_176 }],
  },
  {
    id: 'turb-oct4',
    kind: 'raster',
    size: SVG_FEATURE_SIZE,
    build: () => turbSvg(4),
    samples: [{ x: 4, y: 4, check: isClear }],
    ink: { min: 40_000, max: 56_000 },
    regions: [{ x: 16, y: 16, w: 224, h: 224, test: (_r, _g, _b, a) => a >= 40 && a <= 215, min: 1, max: 50_176 }],
  },
  {
    id: 'chain-tcc',
    kind: 'raster',
    size: SVG_FEATURE_SIZE,
    build: () =>
      svgOpen(256) +
      '<rect x="48" y="48" width="160" height="160" fill="#00ff00" filter="url(#f)"/>' +
      '<defs><filter id="f" x="-10%" y="-10%" width="120%" height="120%">' +
      '<feTurbulence type="fractalNoise" baseFrequency="0.3" numOctaves="2" seed="11" result="n"/>' +
      '<feColorMatrix in="n" type="matrix" values="0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0" result="a"/>' +
      '<feComposite in="a" in2="SourceGraphic" operator="in"/></filter></defs></svg>',
    samples: [{ x: 4, y: 4, check: isClear }],
    ink: { min: 18_000, max: 25_600 },
    note: 'turb+matrix+composite',
  },
  {
    id: 'smil-animate',
    kind: 'dynamic',
    size: SVG_FEATURE_SIZE,
    build: () =>
      svgOpen(256) +
      '<rect y="96" width="64" height="64" fill="#ff0000">' +
      '<animate attributeName="x" values="0;192;0" dur="0.35s" repeatCount="indefinite"/></rect></svg>',
    note: 'static mode = FROZEN',
  },
  {
    id: 'css-keyframes',
    kind: 'dynamic',
    size: SVG_FEATURE_SIZE,
    build: () =>
      svgOpen(256) +
      '<style>@keyframes mv { 0% { transform: translateX(0) } 50% { transform: translateX(128px) } ' +
      '100% { transform: translateX(0) } } .m { animation: mv .35s linear infinite; }</style>' +
      '<rect class="m" width="64" height="64" fill="#ff0000"/></svg>',
    note: 'static mode = FROZEN',
  },
  {
    id: 'bitmap-svg',
    kind: 'bitmap',
    size: SVG_FEATURE_SIZE,
    build: () =>
      svgOpen(256) +
      '<rect x="32" y="32" width="192" height="192" fill="#00ff00"/></svg>',
    note: 'desktop rejects (whatwg #923)',
  },
  {
    id: 'e3-atlas',
    kind: 'raster',
    size: E3_SIZE,
    build: () => e3Once().svg,
    ink: { min: E3_SIZE * E3_SIZE, max: E3_SIZE * E3_SIZE },
    strict: () => ({ size: E3_SIZE, data: e3Once().pixels }),
    note: 'compound-path chunk',
  },
];

/**
 * Blur feature SVG: a red r=28 disc on black, `feGaussianBlur stdDeviation=σ`.
 *
 * @param sigma - the blur radius.
 * @returns the SVG text.
 */
function blurSvg(sigma: number): string {
  return (
    svgOpen(256) +
    '<circle cx="128" cy="128" r="28" fill="#ff0000" filter="url(#b)"/>' +
    '<defs><filter id="b" x="-75%" y="-75%" width="250%" height="250%">' +
    '<feGaussianBlur stdDeviation="' + sigma + '"/></filter></defs></svg>'
  );
}

/**
 * Turbulence feature SVG: white fractal noise (alpha from the noise R) on black.
 *
 * @param octaves - `numOctaves`.
 * @returns the SVG text.
 */
function turbSvg(octaves: number): string {
  return (
    svgOpen(256) +
    '<rect x="32" y="32" width="192" height="192" fill="#000000" filter="url(#f)"/>' +
    '<defs><filter id="f"><feTurbulence type="fractalNoise" baseFrequency="0.15" numOctaves="' + octaves +
    '" seed="7" result="n"/>' +
    '<feColorMatrix in="n" type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 1 0 0 0 0"/></filter></defs></svg>'
  );
}

// --------------------------------------------------------------------------------------------- the matrix

/** Mutable outcome of one feature while it runs. */
interface FeatureRun {
  def: SvgFeatureDef;
  status: SvgFeatureStatus;
  bytes: number | null;
  decodeSamples: number[];
  drawSamples: number[];
  totalSamples: number[];
  passWindows: number;
  failWindows: number;
  windowsRun: number;
  inkedPx: number | null;
  detail: string | null;
  /** ms between window start and its load callback (per window). */
  loadStartMs: number;
  /** The live window handle. */
  win: SvgWindow | null;
}

/** Matrix phases per tick. */
type Phase = 'idle' | 'load' | 'decode' | 'draw' | 'anim-wait' | 'bitmap';

/**
 * Runs the {@link SVG_FEATURES} catalog through one {@link SvgProbeHost}, window by window, driven by
 * {@link SvgMatrix.tick} from the rAF loop. All host callbacks are flags the next tick consumes, so the
 * machine cannot re-enter itself and a realm without SVG-image support simply reaches `unavailable`.
 */
export class SvgMatrix {
  /** Matrix state (pending until the start delay elapsed). */
  status: SvgMatrixStatus = 'pending';
  private readonly host: SvgProbeHost;
  private readonly features: readonly SvgFeatureDef[];
  private readonly runs: FeatureRun[];
  private readonly onEvent: (line: string) => void;
  private featureIdx = 0;
  private phase: Phase = 'idle';
  private startMs = NaN;
  private phaseMs = NaN;
  private pendingLoad: { ok: boolean; err: string } | null = null;
  private pendingDecode: { ok: boolean; err: string } | null = null;
  private pendingBitmap: { ok: boolean; info: string } | null = null;
  private firstRead: Uint8Array | Uint8ClampedArray | null = null;

  /**
   * @param host - realm capability host (`null` ⇒ the matrix runs once, answers `unavailable`).
   * @param features - the catalog (defaults to {@link SVG_FEATURES}; tests pass their own defs).
   * @param onEvent - one line per notable event (feature finalizes) for the probe log.
   */
  constructor(host: SvgProbeHost | null, features: readonly SvgFeatureDef[] = SVG_FEATURES, onEvent: (line: string) => void = () => undefined) {
    this.host = host === null ? deadHost() : host;
    this.features = features;
    this.runs = features.map((def) => freshRun(def));
    this.onEvent = onEvent;
    if (host === null) this.status = 'unavailable';
  }

  /**
   * Advances the machine. Safe to call every frame; does at most one transition (or one timed host
   * read) per call and returns immediately once done or unavailable.
   *
   * @param now - the rAF timestamp (`performance.now()` ms).
   */
  tick(now: number): void {
    this.lastNow = now;
    if (this.status === 'done' || this.status === 'unavailable') return;
    if (Number.isNaN(this.startMs)) this.startMs = now;
    if (this.status === 'pending') {
      if (now - this.startMs < SVG_START_DELAY_MS) return;
      this.status = 'running';
      this.onEvent('svg matrix started (' + this.features.length + ' features)');
    }
    const run = this.runs[this.featureIdx];
    if (run === undefined) {
      this.finish();
      return;
    }
    if (!Number.isNaN(this.phaseMs) && now - this.phaseMs > SVG_PHASE_TIMEOUT_MS && this.isWaiting()) {
      this.finalize(run, 'TIMEOUT', 'phase ' + this.phase + ' timed out after ' + SVG_PHASE_TIMEOUT_MS + ' ms');
      return;
    }
    if (this.phase === 'idle') {
      this.beginWindow(run, now);
      return;
    }
    if (this.phase === 'load') {
      if (this.pendingLoad === null) return;
      const loadMs = now - this.phaseMs;
      const res = this.pendingLoad;
      this.pendingLoad = null;
      if (!res.ok) {
        this.dropWindow(run);
        this.finalize(run, 'ERROR', 'load: ' + (res.err || '?'));
        return;
      }
      run.loadStartMs = loadMs;
      this.phase = 'decode';
      this.phaseMs = now;
      try {
        this.host.decode(run.win as SvgWindow, (ok, err) => {
          this.pendingDecode = { ok, err };
        });
      } catch (e) {
        this.dropWindow(run);
        this.finalize(run, 'ERROR', 'decode: ' + describe(e));
      }
      return;
    }
    if (this.phase === 'decode') {
      if (this.pendingDecode === null) return;
      const decodeExtra = now - this.phaseMs;
      const res = this.pendingDecode;
      this.pendingDecode = null;
      if (!res.ok) {
        this.dropWindow(run);
        this.finalize(run, 'ERROR', 'decode: ' + (res.err || '?'));
        return;
      }
      if (run.def.kind === 'bitmap') {
        this.phase = 'bitmap';
        this.phaseMs = now;
        try {
          this.host.bitmap(run.win as SvgWindow, (ok, info) => {
            this.pendingBitmap = { ok, info };
          });
        } catch (e) {
          this.dropWindow(run);
          this.finalize(run, 'ERROR', 'bitmap: ' + describe(e));
        }
        return;
      }
      this.doRead(run, run.loadStartMs + decodeExtra, now);
      return;
    }
    if (this.phase === 'anim-wait') {
      if (now - this.phaseMs < SVG_ANIM_WAIT_MS) return;
      const first = this.firstRead;
      this.firstRead = null;
      if (first === null) {
        this.dropWindow(run);
        this.finalize(run, 'ERROR', 'no first read');
        return;
      }
      let second: SvgPixels;
      const t0 = this.host.now();
      try {
        second = this.host.read(run.win as SvgWindow);
      } catch (e) {
        this.dropWindow(run);
        this.finalize(run, 'ERROR', 'read2: ' + describe(e));
        return;
      }
      const t1 = this.host.now();
      run.drawSamples.push(t1 - t0);
      const cmp = firstDiff(first, second.data);
      this.finalize(
        run,
        cmp < 0 ? 'FROZEN' : 'ANIMATES',
        cmp < 0 ? 'redraw after ' + SVG_ANIM_WAIT_MS + ' ms identical — static image mode' : 'raster differs from first read at byte ' + cmp,
      );
      return;
    }
    if (this.phase === 'bitmap') {
      if (this.pendingBitmap === null) return;
      const res = this.pendingBitmap;
      this.pendingBitmap = null;
      this.dropWindow(run);
      this.finalize(run, res.ok ? 'ACCEPT' : 'REJECT', res.info);
      return;
    }
  }

  /** True when the machine is parked on an async host callback (timeout guard). */
  private isWaiting(): boolean {
    return this.phase === 'load' || this.phase === 'decode' || (this.phase === 'anim-wait' && this.firstRead === null) || this.phase === 'bitmap';
  }

  /** Loads the next window of `run` (fresh source string → fresh blob URL). */
  private beginWindow(run: FeatureRun, now: number): void {
    const source = run.def.build();
    run.bytes = source.length;
    this.phase = 'load';
    this.phaseMs = now;
    this.pendingLoad = null;
    let win: SvgWindow | null;
    try {
      win = this.host.begin(source, run.def.size, (ok, err) => {
        this.pendingLoad = { ok, err };
      });
    } catch (e) {
      this.finalize(run, 'ERROR', 'begin: ' + describe(e));
      return;
    }
    if (win === null) {
      this.status = 'unavailable';
      for (const r of this.runs) if (r.status === 'pending') r.status = 'UNAVAILABLE';
      this.onEvent('svg matrix unavailable — this realm cannot raster SVG images');
      return;
    }
    run.win = win;
  }

  /** Draws + reads the live window, judges it, and advances or finalizes the feature. */
  private doRead(run: FeatureRun, decodeMs: number, now: number): void {
    this.phase = 'draw';
    this.phaseMs = now;
    let px: SvgPixels;
    const t0 = this.host.now();
    try {
      px = this.host.read(run.win as SvgWindow);
    } catch (e) {
      this.dropWindow(run);
      this.finalize(run, 'ERROR', 'read: ' + describe(e));
      return;
    }
    const drawMs = this.host.now() - t0;
    run.windowsRun++;
    const measure = run.windowsRun > SVG_WARM_WINDOWS;
    if (measure) {
      run.decodeSamples.push(decodeMs);
      run.drawSamples.push(drawMs);
      run.totalSamples.push(decodeMs + drawMs);
    }
    if (run.def.kind === 'raster') {
      run.inkedPx = countInk(px);
      const bad = judgeWindow(run.def, px);
      if (bad !== null) {
        if (measure) run.failWindows++;
        if (run.detail === null) run.detail = bad;
      } else if (measure) run.passWindows++;
    }
    if (run.def.kind === 'dynamic' && run.windowsRun === 1) {
      this.firstRead = px.data;
      this.phase = 'anim-wait';
      this.phaseMs = now;
      return;
    }
    this.dropWindow(run);
    const need = SVG_WARM_WINDOWS + SVG_MEASURE_WINDOWS;
    if (run.windowsRun >= need) {
      this.finalizeRaster(run);
      return;
    }
    this.phase = 'idle';
    this.beginWindow(run, this.host.now());
  }

  /** Decides a raster feature's status once its windows are in. */
  private finalizeRaster(run: FeatureRun): void {
    if (run.def.kind !== 'raster') {
      this.finalize(run, 'ERROR', 'finalizeRaster on ' + run.def.kind);
      return;
    }
    if (run.passWindows >= SVG_MEASURE_WINDOWS) {
      this.finalize(run, 'PASS', null);
      return;
    }
    this.finalize(
      run,
      'FAIL',
      (run.detail === null ? 'signature not met' : run.detail) + ' · ' + run.passWindows + '/' + SVG_MEASURE_WINDOWS + ' windows passed',
    );
  }

  /** Ends one feature with a status and its reason, and logs it. */
  private finalize(run: FeatureRun, status: SvgFeatureStatus, detail: string | null): void {
    run.status = status;
    run.detail = detail;
    this.dropWindow(run);
    this.phase = 'idle';
    this.featureIdx++;
    this.onEvent('svg ' + run.def.id + ' → ' + status + (detail ? ' — ' + truncate(detail, 60) : ''));
  }

  /** Releases the live window (and clears the handle). */
  private dropWindow(run: FeatureRun): void {
    if (run.win !== null) {
      const w = run.win;
      run.win = null;
      try {
        this.host.release(w);
      } catch (_e) {
        /* the URL may already be gone */
      }
    }
    this.firstRead = null;
  }

  /** Marks the whole matrix done and logs the digest. */
  private finish(): void {
    this.status = 'done';
    const s = this.summary();
    this.onEvent('svg matrix done — pass ' + s.pass + ' · fail ' + s.fail + ' · error ' + s.error + ' of ' + s.total);
  }

  /** Compact verdicts entry (present on every report the new probe sends). */
  summary(): SvgSummary {
    let pass = 0;
    let fail = 0;
    let error = 0;
    let done = 0;
    for (const r of this.runs) {
      if (r.status === 'PASS') {
        pass++;
        done++;
      } else if (r.status === 'FAIL' || r.status === 'TIMEOUT') {
        fail++;
        done++;
      } else if (r.status === 'ERROR') {
        error++;
        done++;
      } else if (r.status === 'FROZEN' || r.status === 'ANIMATES' || r.status === 'REJECT' || r.status === 'ACCEPT' || r.status === 'UNAVAILABLE') {
        done++;
      }
    }
    return { status: this.status, done, total: this.runs.length, pass, fail, error };
  }

  /** The full report block for `stats.svg` (allocates; report rate only). */
  reportState(): SvgMatrixReport {
    return {
      status: this.status,
      elapsedMs: Number.isNaN(this.startMs) ? null : round1(this.lastNow - this.startMs),
      warmWindows: SVG_WARM_WINDOWS,
      measureWindows: SVG_MEASURE_WINDOWS,
      features: this.runs.map((r) => ({
        id: r.def.id,
        kind: r.def.kind,
        status: r.status,
        bytes: r.bytes,
        decodeMs: median(r.decodeSamples),
        drawMs: median(r.drawSamples),
        totalMs: median(r.totalSamples),
        windows: r.decodeSamples.length,
        inkedPx: r.inkedPx,
        detail: r.detail,
      })),
    };
  }

  /** The last `tick()` timestamp (elapsed of the report). */
  private lastNow = 0;

  /** Panel lines (left column): status line + one row per feature. */
  panelLines(): string[] {
    this.lastNow = this.host.now();
    const s = this.summary();
    const out = [
      'matrix ' + this.status + ' — ' + s.done + '/' + s.total + ' done · ' + s.pass + ' PASS · ' + s.fail + ' FAIL · ' + s.error + ' ERR',
      'warm ' + SVG_WARM_WINDOWS + ' + ' + SVG_MEASURE_WINDOWS + ' measured windows · detail below',
    ];
    for (const r of this.runs) {
      let row = padRight(truncate(r.def.id, 13), 14) + padRight(r.status, 11);
      const tot = median(r.totalSamples);
      if (tot !== null) row += padLeft(String(tot), 7) + ' ms ';
      else row += padLeft('—', 7) + ' ms ';
      row += r.bytes !== null ? padLeft(String(r.bytes), 6) + ' B' : padLeft('—', 6) + ' B';
      out.push(row);
      if (r.detail !== null && (r.status === 'FAIL' || r.status === 'ERROR' || r.status === 'TIMEOUT' || r.status === 'ANIMATES' || r.status === 'ACCEPT'))
        out.push('    ' + truncate(r.detail, 56));
    }
    return out;
  }
}

/** A host that answers `begin → null` (matrix → `unavailable` without touching the realm). */
function deadHost(): SvgProbeHost {
  return {
    now: () => 0,
    begin: () => null,
    decode: (_win, done) => done(true, ''),
    read: () => {
      throw new Error('no SVG image support');
    },
    bitmap: (_win, done) => done(false, 'no createImageBitmap'),
    release: () => undefined,
  };
}

/**
 * Fresh run record.
 *
 * @param def - the catalog entry.
 * @returns the run.
 */
function freshRun(def: SvgFeatureDef): FeatureRun {
  return {
    def,
    status: 'pending',
    bytes: null,
    decodeSamples: [],
    drawSamples: [],
    totalSamples: [],
    passWindows: 0,
    failWindows: 0,
    windowsRun: 0,
    inkedPx: null,
    detail: null,
    loadStartMs: 0,
    win: null,
  };
}

/**
 * Median of a sample list (low-median for even counts).
 *
 * @param v - samples in ms.
 * @returns rounded median or null when empty.
 */
function median(v: readonly number[]): number | null {
  if (v.length === 0) return null;
  const s = [...v].sort((a, b) => a - b);
  const mid = s.length % 2 === 1 ? (s[(s.length - 1) / 2] as number) : ((s[s.length / 2 - 1] as number) + (s[s.length / 2] as number)) / 2;
  return round1(mid);
}

/**
 * Counts pixels with alpha > 8.
 *
 * @param px - the read-back.
 * @returns the inked-pixel count.
 */
function countInk(px: SvgPixels): number {
  let n = 0;
  for (let i = 3; i < px.data.length; i += 4) if ((px.data[i] as number) > 8) n++;
  return n;
}

/**
 * Judges one raster window: every sample predicate, the ink bounds, and the exact compare when the
 * feature carries a reference.
 *
 * @param def - the catalog entry.
 * @param px - the read-back.
 * @returns `null` when everything matches, otherwise the first mismatch description.
 */
function judgeWindow(def: SvgFeatureDef, px: SvgPixels): string | null {
  if (def.samples !== undefined)
    for (const smp of def.samples) {
      const i = (smp.y * px.size + smp.x) * 4;
      if (!smp.check(px.data[i] as number, px.data[i + 1] as number, px.data[i + 2] as number, px.data[i + 3] as number))
        return 'pixel (' + smp.x + ',' + smp.y + ') = ' + px.data[i] + ',' + px.data[i + 1] + ',' + px.data[i + 2] + ',' + px.data[i + 3];
    }
  if (def.ink !== undefined) {
    const ink = countInk(px);
    if (ink < def.ink.min || ink > def.ink.max) return 'ink ' + ink + ' outside ' + def.ink.min + '..' + def.ink.max;
  }
  if (def.regions !== undefined) {
    for (const reg of def.regions) {
      let n = 0;
      for (let y = reg.y; y < reg.y + reg.h; y++) {
        for (let x = reg.x; x < reg.x + reg.w; x++) {
          const i = (y * px.size + x) * 4;
          if (reg.test(px.data[i] as number, px.data[i + 1] as number, px.data[i + 2] as number, px.data[i + 3] as number)) n++;
        }
      }
      if (n < reg.min || n > reg.max) return 'region ' + reg.x + ',' + reg.y + ' count ' + n + ' outside ' + reg.min + '..' + reg.max;
    }
  }
  if (def.strict !== undefined) {
    const ref = def.strict();
    if (ref.size !== px.size) return 'strict size ' + px.size + ' != ' + ref.size;
    const bad = mismatches(ref.data, px.data);
    if (bad > 0) return bad + ' of ' + ref.size * ref.size + ' px differ from the reference';
  }
  return null;
}

/**
 * Count of differing RGBA pixels between two same-length buffers.
 *
 * @param a - reference.
 * @param b - observed.
 * @returns differing pixels.
 */
function mismatches(a: Uint8Array | Uint8ClampedArray, b: Uint8Array | Uint8ClampedArray): number {
  let n = 0;
  for (let i = 0; i + 3 < a.length && i + 3 < b.length; i += 4)
    if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3]) n++;
  return n;
}

/**
 * Index of the first differing byte between two reads.
 *
 * @param a - first read.
 * @param b - second read.
 * @returns the byte index, or -1 when identical (lengths must match; mismatch → 0).
 */
function firstDiff(a: Uint8Array | Uint8ClampedArray, b: Uint8Array | Uint8ClampedArray): number {
  if (a.length !== b.length) return 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return i;
  return -1;
}

/**
 * A short, non-throwing description of a host failure.
 *
 * @param e - caught value.
 * @returns its message.
 */
function describe(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
