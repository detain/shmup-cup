/**
 * # data/paths — movement paths: centripetal Catmull-Rom splines baked into arc-length tables
 *
 * **Responsibility.** Load-time half of the `path` mover (plan M1-08, shmup_feat.md §11
 * "Catmull-Rom spline paths (arc-length parameterized)"): a path from `content/paths/` is a list
 * of control points relative to where the mover starts; {@link bakePath} runs a **centripetal**
 * Catmull-Rom spline through them (no cusps or self-intersections between close points, unlike
 * the uniform variant), samples it densely and resamples the result at a fixed arc-length step
 * ({@link PATH_SAMPLE_STEP} pixels). The per-tick mover (`core/patterns`) then only advances a
 * distance and interpolates two neighbouring samples — constant speed along the curve, no
 * per-tick spline maths.
 *
 * **Determinism.** Only `+ − × ÷` and `Math.sqrt` (exactly rounded in IEEE 754), so the tables
 * are bit-identical on every engine.
 *
 * **Public API.** {@link bakePath}, {@link PathTable}, {@link PATH_SAMPLE_STEP},
 * {@link PATH_SUBDIVISIONS}, {@link MAX_PATH_LENGTH}.
 *
 * @remarks
 * Runs at load time only (it allocates the tables).
 *
 * @module
 */

/** Distance between two consecutive samples of a baked path, in pixels. */
export const PATH_SAMPLE_STEP = 1;

/** Dense polyline points per spline segment before the arc-length resampling. */
export const PATH_SUBDIVISIONS = 64;

/** Longest path (arc length in pixels) a content file may describe. */
export const MAX_PATH_LENGTH = 16384;

/** A baked path: samples at a uniform arc-length spacing. */
export interface PathTable {
  /** Arc length in pixels. */
  readonly length: number;
  /**
   * Sample positions relative to the first control point, `x, y` interleaved: sample `i`
   * (`i < count − 1`) lies `i · PATH_SAMPLE_STEP` pixels along the curve, the last one is the
   * end of the curve (`length` along it).
   */
  readonly samples: Float64Array;
  /** Number of samples (at least 2). */
  readonly count: number;
  /** Unit tangent at the end of the curve (x) — movers continue along it past the end. */
  readonly endDx: number;
  /** Unit tangent at the end of the curve (y). */
  readonly endDy: number;
}

/**
 * Knot interval of the centripetal parameterisation: `|p1 − p0|^0.5`.
 *
 * @param x0 - First point x.
 * @param y0 - First point y.
 * @param x1 - Second point x.
 * @param y1 - Second point y.
 * @returns The interval (> 0 for distinct points).
 */
function knot(x0: number, y0: number, x1: number, y1: number): number {
  const dx = x1 - x0;
  const dy = y1 - y0;
  return Math.sqrt(Math.sqrt(dx * dx + dy * dy));
}

/**
 * Evaluates one centripetal Catmull-Rom segment (Barry–Goldman pyramid) between `p1` and `p2`.
 *
 * @param p - The four control points `x0, y0, x1, y1, x2, y2, x3, y3`.
 * @param u - Progress along the segment, 0 … 1.
 * @param out - Receives `x, y`.
 */
function evalSegment(p: Float64Array, u: number, out: Float64Array): void {
  const t0 = 0;
  const t1 = t0 + knot(p[0], p[1], p[2], p[3]);
  const t2 = t1 + knot(p[2], p[3], p[4], p[5]);
  const t3 = t2 + knot(p[4], p[5], p[6], p[7]);
  const t = t1 + (t2 - t1) * u;
  for (let axis = 0; axis < 2; axis++) {
    const q0 = p[axis];
    const q1 = p[2 + axis];
    const q2 = p[4 + axis];
    const q3 = p[6 + axis];
    const a1 = ((t1 - t) / (t1 - t0)) * q0 + ((t - t0) / (t1 - t0)) * q1;
    const a2 = ((t2 - t) / (t2 - t1)) * q1 + ((t - t1) / (t2 - t1)) * q2;
    const a3 = ((t3 - t) / (t3 - t2)) * q2 + ((t - t2) / (t3 - t2)) * q3;
    const b1 = ((t2 - t) / (t2 - t0)) * a1 + ((t - t0) / (t2 - t0)) * a2;
    const b2 = ((t3 - t) / (t3 - t1)) * a2 + ((t - t1) / (t3 - t1)) * a3;
    out[axis] = ((t2 - t) / (t2 - t1)) * b1 + ((t - t1) / (t2 - t1)) * b2;
  }
}

/**
 * Bakes control points into an arc-length table (see the module docs).
 *
 * @remarks
 * The curve passes through every point; the two ends get mirrored phantom points
 * (`2·p0 − p1`, `2·pn − pn−1`), so a two-point path is a straight line. Consecutive points must
 * differ (the loader reports duplicates before calling this). The table is relative to the first
 * point: sample 0 is `(0, 0)`.
 *
 * @param xs - Control point x coordinates (at least 2).
 * @param ys - Control point y coordinates (same length).
 * @returns The table.
 * @throws {RangeError} When fewer than two points are given, two consecutive points coincide or
 *   the curve is longer than {@link MAX_PATH_LENGTH}.
 *
 * @example
 * ```ts
 * const table = bakePath([0, -100], [0, 0]); // a straight 100-px line to the left
 * table.length; // → 100
 * table.count; // → 101 samples, one per pixel
 * ```
 */
export function bakePath(xs: readonly number[], ys: readonly number[]): PathTable {
  const n = xs.length;
  if (n < 2 || ys.length !== n) throw new RangeError('a path needs at least two points');
  for (let i = 1; i < n; i++) {
    if (xs[i] === xs[i - 1] && ys[i] === ys[i - 1]) {
      throw new RangeError(`path points ${i - 1} and ${i} coincide`);
    }
  }
  // Control points with mirrored phantom ends, relative to the first point.
  const px = new Float64Array(n + 2);
  const py = new Float64Array(n + 2);
  for (let i = 0; i < n; i++) {
    px[i + 1] = xs[i] - xs[0];
    py[i + 1] = ys[i] - ys[0];
  }
  px[0] = 2 * px[1] - px[2];
  py[0] = 2 * py[1] - py[2];
  px[n + 1] = 2 * px[n] - px[n - 1];
  py[n + 1] = 2 * py[n] - py[n - 1];

  // 1. Dense polyline with cumulative lengths.
  const segments = n - 1;
  const denseCount = segments * PATH_SUBDIVISIONS + 1;
  const dx = new Float64Array(denseCount);
  const dy = new Float64Array(denseCount);
  const dist = new Float64Array(denseCount);
  const ctrl = new Float64Array(8);
  const point = new Float64Array(2);
  for (let s = 0; s < segments; s++) {
    for (let k = 0; k < 4; k++) {
      ctrl[2 * k] = px[s + k];
      ctrl[2 * k + 1] = py[s + k];
    }
    for (let j = 0; j < PATH_SUBDIVISIONS; j++) {
      const index = s * PATH_SUBDIVISIONS + j;
      if (j === 0) {
        // Segment starts are the control points themselves (exact).
        dx[index] = px[s + 1];
        dy[index] = py[s + 1];
      } else {
        evalSegment(ctrl, j / PATH_SUBDIVISIONS, point);
        dx[index] = point[0];
        dy[index] = point[1];
      }
    }
  }
  dx[denseCount - 1] = px[n];
  dy[denseCount - 1] = py[n];
  for (let i = 1; i < denseCount; i++) {
    const ex = dx[i] - dx[i - 1];
    const ey = dy[i] - dy[i - 1];
    dist[i] = dist[i - 1] + Math.sqrt(ex * ex + ey * ey);
  }
  const length = dist[denseCount - 1];
  if (!(length > 0)) throw new RangeError('a path must have a positive length');
  if (length > MAX_PATH_LENGTH) {
    throw new RangeError(`path is ${Math.ceil(length)} px long (at most ${MAX_PATH_LENGTH})`);
  }

  // 2. Resample at uniform arc length.
  const whole = Math.floor(length / PATH_SAMPLE_STEP);
  const count = whole * PATH_SAMPLE_STEP === length ? whole + 1 : whole + 2;
  const samples = new Float64Array(count * 2);
  let seg = 1;
  for (let i = 0; i < count; i++) {
    const target = i === count - 1 ? length : i * PATH_SAMPLE_STEP;
    while (seg < denseCount - 1 && dist[seg] < target) seg++;
    const d0 = dist[seg - 1];
    const d1 = dist[seg];
    const f = d1 > d0 ? (target - d0) / (d1 - d0) : 0;
    samples[2 * i] = dx[seg - 1] + (dx[seg] - dx[seg - 1]) * f;
    samples[2 * i + 1] = dy[seg - 1] + (dy[seg] - dy[seg - 1]) * f;
  }
  samples[2 * (count - 1)] = px[n];
  samples[2 * (count - 1) + 1] = py[n];

  // 3. End tangent (from the last dense step).
  const tx = dx[denseCount - 1] - dx[denseCount - 2];
  const ty = dy[denseCount - 1] - dy[denseCount - 2];
  const tl = Math.sqrt(tx * tx + ty * ty);
  return {
    length,
    samples,
    count,
    endDx: tl > 0 ? tx / tl : -1,
    endDy: tl > 0 ? ty / tl : 0,
  };
}
