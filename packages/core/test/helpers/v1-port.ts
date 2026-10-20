/**
 * R2-02's v1 → v2 mapping helper: the single place every R2-02 test pin of a v1-pixel number is
 * written with (plan R2-02.T0). The pure mappers ({@link v1x}, {@link v1y}, {@link v1rel},
 * {@link v1speed}) are the identity while the world is ×1 (`WORLD_SCALE` = 1, `WORLD_TOP_PAD` = 0)
 * and become the port's ×3/2 (+ the top pad) once R2-02's port commit flips the two constants —
 * so a test written with them needs no edit across the port. {@link v1screenX} / {@link v1screenY}
 * map edge-anchored numbers through core's own `rescaleNumber` with the v2 geometry when the world
 * is scaled, and are the identity at K = 1. {@link mapEnemyRow} / {@link mapBossRow} implement the
 * field-by-field mapping of `test/fixtures/v1-baseline/README.md` § "Comparing a v2 run"; they take
 * `k` and `pad` as arguments (defaulting to the live constants) so both scales are testable on
 * either tree.
 *
 * The helper lives under `packages/core/test/helpers/` and imports core **by relative path**
 * (`../../src/index.js`, the way `v1-replay.ts` imports `../../src/config/index.js`): a core test
 * must not load a second `@shmup/core` instance through the package name.
 *
 * @module
 */
import {
  PLAYFIELD_H,
  PLAYFIELD_W,
  WORLD_SCALE,
  WORLD_TOP_PAD,
  rescaleNumber,
  type RescaleOptions,
} from '../../src/index.js';

/** The world scale under test: 1 until R2-02's port, then 3/2. */
export const K = WORLD_SCALE;

/** The §2.6 top pad under test: 0 until R2-02's port, then 36. */
export const PAD = WORLD_TOP_PAD;

/** v1's playfield (the baseline files' `frame`: 384 × 200 of world px). Test files are not frame-scanned. */
export const V1_FRAME: Readonly<{ w: number; h: number }> = Object.freeze({ w: 384, h: 200 });

/**
 * The port geometry {@link v1screenX} / {@link v1screenY} pass to `rescaleNumber`: v1's playfield
 * into the live frame's, at the live scale. Only read when `K !== 1` (at K = 1 the screen maps are
 * the identity, where this geometry's anchors would not be: the frame is already v2's).
 */
const GEOMETRY: RescaleOptions = Object.freeze({
  factor: 1.5,
  topPad: 36,
  fromWidth: V1_FRAME.w,
  fromHeight: V1_FRAME.h,
  toWidth: PLAYFIELD_W,
  toHeight: PLAYFIELD_H,
  tileSize: 8,
});

/** The value meaning "never happened" in a baseline row; every mapper passes it through unmapped. */
const NEVER = -1;

/**
 * A world x or length (v1 px → live px): ×K, plain.
 *
 * @param x - The v1 value.
 * @returns The live value.
 */
export function v1x(x: number): number {
  return K * x;
}

/**
 * An absolute world y (v1 px → live px): ×K plus the top pad; above the top edge (`y < 0`) ×K only
 * — §2.6's one discontinuity.
 *
 * @param y - The v1 value.
 * @returns The live value.
 */
export function v1y(y: number): number {
  return y < 0 ? K * y : K * y + PAD;
}

/**
 * A relative world offset (v1 px → live px): ×K.
 *
 * @param v - The v1 value.
 * @returns The live value.
 */
export function v1rel(v: number): number {
  return K * v;
}

/**
 * A world speed or acceleration magnitude (v1 px/tick or px/tick² → live): ×K. Ticks themselves
 * never scale (there is no `v1tick`).
 *
 * @param v - The v1 value.
 * @returns The live value.
 */
export function v1speed(v: number): number {
  return K * v;
}

/**
 * A screen column (`screen-x`: an edge- or centre-anchored column of the view). The identity at
 * K = 1; the port's `rescaleNumber` snap at K = 3/2 (README: a right-edge spawn `W + 16` becomes
 * `W′ + 24`, a centre keeps its distance ×K).
 *
 * @param v - The v1 column in v1's 384-px playfield.
 * @returns The live column.
 */
export function v1screenX(v: number): number {
  return K === 1 ? v : rescaleNumber('screen-x', v, GEOMETRY);
}

/**
 * A screen row (`screen-y`: an edge- or centre-anchored row of the playfield), the twin of
 * {@link v1screenX} on the 200-px v1 axis into the live playfield height.
 *
 * @param v - The v1 row in v1's 200-px playfield.
 * @returns The live row.
 */
export function v1screenY(v: number): number {
  return K === 1 ? v : rescaleNumber('screen-y', v, GEOMETRY);
}

/**
 * A regular-enemy row of a baseline file: `[event, member, spec, spawnTick, x0, y0, entry,
 * visibleTick, visibleX, visibleY, turnTick, turnX, turnY, endTick, fate]`
 * (`test/fixtures/v1-baseline/README.md` § The file).
 */
export type EnemyRow = readonly [
  event: number,
  member: number,
  spec: number,
  spawnTick: number,
  x0: number,
  y0: number,
  entry: string,
  visibleTick: number,
  visibleX: number,
  visibleY: number,
  turnTick: number,
  turnX: number,
  turnY: number,
  endTick: number,
  fate: string,
];

/**
 * A boss row of a baseline file: `[id, role, warningTick, introTick, introX, introY, fightTick,
 * fightX, fightY, dyingTick, escapeTick, endTick]` (`test/fixtures/v1-baseline/README.md` § The
 * file; role 0 boss, 1 captain; −1 = did not happen).
 */
export type BossRow = readonly [
  id: string,
  role: number,
  warningTick: number,
  introTick: number,
  introX: number,
  introY: number,
  fightTick: number,
  fightX: number,
  fightY: number,
  dyingTick: number,
  escapeTick: number,
  endTick: number,
];

/** One position number, or −1 kept as −1. */
function mapNum(v: number, f: (x: number) => number): number {
  return v === NEVER ? NEVER : f(v);
}

/**
 * A world x: right-edge-anchored values (the spawn at `W + 16` that keeps its offset all its life —
 * an `R` in the row's `entry`) take `W′ + k·(x − W)`, everything else `k·x` (README § Comparing a
 * v2 run).
 */
function enemyX(x: number, rightAnchored: boolean, k: number): number {
  return rightAnchored ? PLAYFIELD_W + k * (x - V1_FRAME.w) : k * x;
}

/**
 * An enemy y: a `T` entry's y0 / visibleY take `k·y` (above the top edge stays above it); a `T`
 * entry's landing (turnY) and every other row take `k·y + pad` — continuous at the bottom edge —
 * except a value above the top edge, which keeps `k·y` (README § Comparing a v2 run, §2.6).
 */
function enemyY(y: number, topEntry: boolean, isTurnY: boolean, k: number, pad: number): number {
  if (topEntry && !isTurnY) return k * y;
  return y < 0 ? k * y : k * y + pad;
}

/**
 * Maps a regular-enemy row's positions from v1 px to the live scale (README § "Comparing a v2
 * run"): every tick, the event/member/spec indices and the fate are equal, x columns scale (right-
 * anchored with an `R` in `entry`), y columns take the pad (above-the-top `T` entries do not —
 * their `turnY` landing excepted, the acceptance's "within 2 px" row). A −1 ("never") column stays
 * −1. Player-dependent rows and ground enemies are compared outside this helper (README caveats).
 *
 * @param row - The v1 row as recorded.
 * @param k - The scale (default {@link K}).
 * @param pad - The top pad (default {@link PAD}).
 * @returns A new row with the position columns mapped.
 */
export function mapEnemyRow(row: EnemyRow, k: number = K, pad: number = PAD): EnemyRow {
  const entry = row[6];
  const right = entry.includes('R');
  const top = entry.includes('T');
  return Object.freeze([
    row[0],
    row[1],
    row[2],
    row[3],
    mapNum(row[4], (x) => enemyX(x, right, k)),
    mapNum(row[5], (y) => enemyY(y, top, false, k, pad)),
    entry,
    row[7],
    mapNum(row[8], (x) => enemyX(x, right, k)),
    mapNum(row[9], (y) => enemyY(y, top, false, k, pad)),
    row[10],
    mapNum(row[11], (x) => enemyX(x, right, k)),
    mapNum(row[12], (y) => enemyY(y, top, true, k, pad)),
    row[13],
    row[14],
  ]);
}

/**
 * Maps a boss row's positions from v1 px to the live scale (README § "Comparing a v2 run"): the
 * intro starts just past the right edge (`W′ + k·(x − W)`), the fight home is the right edge minus
 * its world margin (`W′ − k·(W − x)`) and the y home is the playfield centre plus the world offset
 * (`H′/2 + k·(y − H/2)`); every tick — warning, intro, fight, dying, escape, end — and the role are
 * equal. A −1 ("did not happen") column stays −1.
 *
 * @param row - The v1 row as recorded.
 * @param k - The scale (default {@link K}).
 * @returns A new row with the position columns mapped.
 */
export function mapBossRow(row: BossRow, k: number = K): BossRow {
  const introX = (x: number): number => (x === NEVER ? NEVER : PLAYFIELD_W + k * (x - V1_FRAME.w));
  const fightX = (x: number): number => (x === NEVER ? NEVER : PLAYFIELD_W - k * (V1_FRAME.w - x));
  const centerY = (y: number): number =>
    y === NEVER ? NEVER : PLAYFIELD_H / 2 + k * (y - V1_FRAME.h / 2);
  return Object.freeze([
    row[0],
    row[1],
    row[2],
    row[3],
    introX(row[4]),
    centerY(row[5]),
    row[6],
    fightX(row[7]),
    centerY(row[8]),
    row[9],
    row[10],
    row[11],
  ]);
}
