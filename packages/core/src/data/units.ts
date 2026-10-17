/**
 * # data/units — what every number of the content means
 *
 * **Responsibility.** The unit vocabulary of the content schemas (plan_resolution.md R1-03): every
 * `s.num` / `s.int` of every content kind names a {@link NumberUnit}, and each unit has a
 * {@link UnitRule} — how the ×1.5 port of R2-02 (`scripts/content/rescale.mjs`) changes a value of
 * it ({@link rescaleNumber}). The walkers read a schema's {@link SchemaMeta}:
 * {@link listNumberFields} lists every numeric field of a schema (the unit coverage test), and
 * {@link walkNumbers} visits every number of a content document with its field, unit and the
 * object that holds it (the rescale tool).
 *
 * Some numbers cannot be ported one at a time (the R1-03 review):
 *
 * - **Field pairs** ({@link FieldPair}, declared by `s.object(shape, { pairs })` and handed to the
 *   walkers' visitor as {@link NumberLeaf.pair}): a moving block's `x + screenX` is its world
 *   left edge — a world value — while only the column it appears at is frame-anchored
 *   ({@link rescaleWorldSum}; a ground enemy's spawn too); a box's `y` and `h` port as two edges,
 *   so a box hanging from the top edge gets taller by the pad instead of moving down
 *   ({@link rescaleBoxY}).
 * - **The backdrop** ({@link rescaleBackdrop}): a stage's parallax bands (`band-y`) are art that
 *   stacks from the top edge or stands on the bottom edge, and its raster rows bound that art;
 *   they are placed together from the bands' art heights so stacks stay closed, bottom bands stay
 *   on the bottom edge and rows aligned in v1 stay aligned.
 *
 * **Implements.** shmup_feat.md §22 (data-driven content) and §14 (stage data validated by a
 * schema); plan_resolution.md R1-03, §2.6 (frame ≠ world: the rules of each kind of value) and
 * Appendix B.
 *
 * **Public API.** {@link NUMBER_UNITS} / {@link NumberUnit}, {@link UNIT_RULES} /
 * {@link UnitRule}, {@link rescaleNumber} with {@link RescaleOptions}, {@link edgeAnchor} /
 * {@link EdgeAnchor}, {@link topEdgeSide} / {@link TopEdgeSide}; the pairs {@link FieldPair}
 * ({@link WorldSumPair}, {@link BoxYPair}, {@link PairRole}, {@link pairRole}),
 * {@link rescaleWorldSum} ({@link PortedWorldSum}) and {@link rescaleBoxY} ({@link PortedBox});
 * the backdrop {@link rescaleBackdrop} ({@link BackdropBand}, {@link BackdropRow},
 * {@link PortedBackdrop}, {@link PortedBand}, {@link PortedRow}, {@link BandPlacement},
 * {@link RowPlacement}); {@link listNumberFields} ({@link NumberField}, {@link NumberFieldList},
 * {@link PairSite}) and {@link walkNumbers} ({@link NumberLeaf}, {@link LeafPair},
 * {@link WalkSkip}).
 *
 * @remarks
 * Tooling only: nothing the game runs imports this module (`data/schema` takes only the
 * {@link NumberUnit} type from it), so a production bundle drops it — only the unit strings the
 * schemas pass to `s.num` / `s.int` ship. Everything here runs on cold paths and may allocate.
 *
 * @module
 */
import type { ObjectMeta, Schema } from './schema.js';

/**
 * Every unit a content number can have (plan R1-03, owner decisions O1 / O2 / O5).
 *
 * @remarks
 * Each unit, what it means, and its rule ({@link UNIT_RULES}):
 *
 * - `world-px` — a world length: a radius, a hurtbox half-extent, a stage length, a wave
 *   period. ×k.
 * - `world-x` — an absolute x in the level: an event's camera x, a checkpoint, a region. ×k.
 * - `world-y` — an absolute y in the level: a spawn y, a region or block y, a ceiling's depth.
 *   ×k plus the top pad; only ×k above the top edge (y < 0). A box's `y` ports with its height
 *   ({@link BoxYPair}).
 * - `rel-px` — a relative offset: path waypoints, part offsets, emitter offsets, a block's
 *   travel; and the camera's `yTo` (the world y of the view's top edge: ×k keeps the view's
 *   bottom on the same world row, `1.5·yTo + 336 = 1.5·(yTo + 200) + 36`, so the deepest pan of a
 *   map with the three pad rows ports exactly — `12·(rows + 3) − 336 = 1.5·(8·rows − 200)`). ×k.
 * - `px-per-tick` — a speed or a velocity. ×k.
 * - `px-per-tick2` — an acceleration (gravity). ×k.
 * - `screen-x` — a column anchored to an edge or the centre of the view: a spawn's `screenX`, the
 *   boss's x. Snapped to its anchor (§2.6, owner decision O3). A block's `screenX` (and a ground
 *   enemy's) ports with its event's `x` ({@link WorldSumPair}).
 * - `screen-y` — a row anchored to an edge or the centre of the playfield: raster rows, the Mode-7
 *   horizon, the boss's y. Snapped to its anchor. Raster rows also follow the parallax bands they
 *   bound ({@link rescaleBackdrop}).
 * - `band-y` — a parallax band's top row (at camera y 0). Ported with the stage's whole backdrop
 *   and the bands' art heights ({@link rescaleBackdrop}); alone, it snaps like a `screen-y`.
 * - `tile-rows` — a tilemap's height in tile rows. Plus the rows the top pad inserts.
 * - `tile-px` — a tile mask entry (a column height in tile pixels). The mask is resampled.
 * - `texels` — a distance in the Mode-7 floor's art (`height`, `fogDepth`). ×k: it follows the
 *   art (O2).
 * - `ticks` — a duration or an interval. Unchanged.
 * - `angle` — a binary angle (1024 per turn) or a turn rate. Unchanged.
 * - `count` — a count: items, loops, volleys, a rank. Unchanged.
 * - `score` — points. Unchanged.
 * - `ratio` — a dimensionless factor: a parallax factor, a rank multiplier, an alpha. Unchanged.
 * - `hz`, `seconds`, `semitones`, `samples` — audio (owner decision O1). Unchanged.
 * - `seed`, `version`, `index` — an RNG seed, a format version, a frame / digit / phase index
 *   (O2). Unchanged.
 * - `param` — a behaviour tunable: its unit is `core/behaviors`
 *   `BEHAVIOR_PARAM_UNITS[behaviour][name]` (O5). Looked up.
 * - `inherit` — a bullet-pattern parameter `$1` … `$9`: its unit is that of the field the action
 *   uses it in. Looked up.
 */
export const NUMBER_UNITS = Object.freeze([
  'world-px',
  'world-x',
  'world-y',
  'rel-px',
  'px-per-tick',
  'px-per-tick2',
  'screen-x',
  'screen-y',
  'band-y',
  'tile-rows',
  'tile-px',
  'texels',
  'ticks',
  'angle',
  'count',
  'score',
  'ratio',
  'hz',
  'seconds',
  'semitones',
  'samples',
  'seed',
  'version',
  'index',
  'param',
  'inherit',
] as const);

/** What a content number means — one of {@link NUMBER_UNITS}. */
export type NumberUnit = (typeof NUMBER_UNITS)[number];

/**
 * How a unit's values change in a port ({@link rescaleNumber}):
 *
 * - `keep` — unchanged (times, angles, counts, scores, ratios, audio, seeds, indices);
 * - `scale` — ×k (world lengths and x, relative offsets, speeds, accelerations, Mode-7 texels);
 * - `world-y` — ×k plus the top pad, except above the top edge (y < 0 stays above it: ×k only —
 *   §2.6's one discontinuity). The rescale tool lists every value on or above the top edge
 *   ({@link topEdgeSide}): a lone value at 0 moves with the pad (§2.6's `1.5·y + 36` — a ceiling
 *   depth of 0 must), while a box hanging from the top edge grows instead ({@link rescaleBoxY});
 * - `edge-x` / `edge-y` — snapped to the nearest of the start, the centre and the end of the old
 *   playfield axis, keeping the distance to it ×k (owner decision O3);
 * - `band` — a parallax band's row: placed with the stage's backdrop ({@link rescaleBackdrop});
 *   {@link rescaleNumber} gives only the lone-row fallback (`edge-y`);
 * - `tile-rows` — plus the rows the top pad inserts;
 * - `resample` — a tile mask entry: ×k, and the tool resamples the whole mask to the new tile size;
 * - `lookup` — the unit comes from elsewhere (`param`, `inherit`): resolve it first.
 */
export type UnitRule =
  'keep' | 'scale' | 'world-y' | 'edge-x' | 'edge-y' | 'band' | 'tile-rows' | 'resample' | 'lookup';

/** The {@link UnitRule} of every {@link NumberUnit} (see the table of {@link NUMBER_UNITS}). */
export const UNIT_RULES: Readonly<Record<NumberUnit, UnitRule>> = Object.freeze({
  'world-px': 'scale',
  'world-x': 'scale',
  'world-y': 'world-y',
  'rel-px': 'scale',
  'px-per-tick': 'scale',
  'px-per-tick2': 'scale',
  'screen-x': 'edge-x',
  'screen-y': 'edge-y',
  'band-y': 'band',
  'tile-rows': 'tile-rows',
  'tile-px': 'resample',
  texels: 'scale',
  ticks: 'keep',
  angle: 'keep',
  count: 'keep',
  score: 'keep',
  ratio: 'keep',
  hz: 'keep',
  seconds: 'keep',
  semitones: 'keep',
  samples: 'keep',
  seed: 'keep',
  version: 'keep',
  index: 'keep',
  param: 'lookup',
  inherit: 'lookup',
});

/** The geometry of a port, as {@link rescaleNumber} reads it. */
export interface RescaleOptions {
  /** The world scale k (1.5 for v2 — plan R-D2). */
  readonly factor: number;
  /**
   * New pixels inserted at the top of the playfield, added to every absolute y on or below the top
   * edge (36 for v2 — §2.6's vertical fit: 200 × 1.5 + 36 = 336).
   */
  readonly topPad: number;
  /** Width of the playfield the content was written for (384 in v1). */
  readonly fromWidth: number;
  /** Height of the playfield the content was written for (200 in v1). */
  readonly fromHeight: number;
  /** Width of the playfield the content is ported to (640 in v2). */
  readonly toWidth: number;
  /** Height of the playfield the content is ported to (336 in v2). */
  readonly toHeight: number;
  /**
   * Tile edge the content was written for (8 in v1): a tilemap gains `topPad / (tileSize ×
   * factor)` rows (36 / 12 = 3 in v2).
   */
  readonly tileSize: number;
}

/** Which point of a playfield axis an edge-anchored value belongs to ({@link edgeAnchor}). */
export type EdgeAnchor = 'start' | 'centre' | 'end';

/**
 * The anchor of an edge-anchored value (owner decision O3): the nearest of the axis's start (0),
 * centre (`size / 2`) and end (`size`).
 *
 * @param value - The value (a `screen-x` / `screen-y` number), in the old playfield's pixels.
 * @param size - The old playfield's width or height.
 * @returns The anchor; a value as near the centre as an edge belongs to the centre.
 *
 * @example
 * ```ts
 * edgeAnchor(400, 384); // 'end'   — a spawn 16 px past the right edge
 * edgeAnchor(296, 384); // 'end'   — the boss's default x, 88 px left of the right edge
 * edgeAnchor(100, 200); // 'centre'
 * ```
 */
export function edgeAnchor(value: number, size: number): EdgeAnchor {
  const toStart = Math.abs(value);
  const toCentre = Math.abs(value - size / 2);
  const toEnd = Math.abs(value - size);
  if (toCentre <= toStart && toCentre <= toEnd) return 'centre';
  return toStart < toEnd ? 'start' : 'end';
}

/**
 * Snaps an edge-anchored value to its anchor and keeps its distance to it ×k.
 *
 * @param value - The value in the old playfield.
 * @param from - The old playfield's size on the axis.
 * @param to - The new playfield's size on the axis.
 * @param factor - The world scale k.
 * @returns The ported value.
 */
function snapToEdge(value: number, from: number, to: number, factor: number): number {
  const anchor = edgeAnchor(value, from);
  if (anchor === 'start') return value * factor;
  if (anchor === 'end') return to + (value - from) * factor;
  return to / 2 + (value - from / 2) * factor;
}

/**
 * Ports one number by its unit's {@link UnitRule}.
 *
 * @param unit - What the number means.
 * @param value - The number as written.
 * @param options - The port's geometry.
 * @returns The ported number — exact, unrounded (an `s.int` field rounds it and the tool lists it,
 *   owner decision O4). With `factor` 1, `topPad` 0 and the same playfield it is `value` itself.
 * @throws RangeError for a `lookup` unit (`param`, `inherit`), which has no rule of its own.
 *
 * @remarks
 * One value at a time: a field of a {@link FieldPair} ports with its partner
 * ({@link rescaleWorldSum}, {@link rescaleBoxY}) and a `band-y` with the stage's backdrop
 * ({@link rescaleBackdrop}) — what this returns for them is only the lone-value fallback.
 *
 * @example
 * ```ts
 * const v2 = { factor: 1.5, topPad: 36, fromWidth: 384, fromHeight: 200, toWidth: 640,
 *   toHeight: 336, tileSize: 8 };
 * rescaleNumber('screen-x', 400, v2); // 664 = PLAYFIELD_W + 24
 * rescaleNumber('world-y', 100, v2); // 186
 * rescaleNumber('world-y', -20, v2); // -30 (still above the top edge)
 * rescaleNumber('tile-rows', 25, v2); // 28
 * ```
 */
export function rescaleNumber(unit: NumberUnit, value: number, options: RescaleOptions): number {
  const { factor } = options;
  switch (UNIT_RULES[unit]) {
    case 'keep':
      return value;
    case 'scale':
    case 'resample':
      return value * factor;
    case 'world-y':
      return value < 0 ? value * factor : value * factor + options.topPad;
    case 'edge-x':
      return snapToEdge(value, options.fromWidth, options.toWidth, factor);
    case 'edge-y':
    case 'band':
      return snapToEdge(value, options.fromHeight, options.toHeight, factor);
    case 'tile-rows':
      return value + options.topPad / (options.tileSize * factor);
    case 'lookup':
    default:
      throw new RangeError('unit "' + unit + '" has no rule of its own: resolve it first');
  }
}

/** Where an absolute y lies against the playfield's top edge ({@link topEdgeSide}). */
export type TopEdgeSide = 'above' | 'on' | 'below';

/**
 * Where an absolute y (a `world-y`) lies against the top edge. The rescale tool lists every value
 * `above` it and `on` it for R2-02: above (y < 0) stays above, ×k only — a spawn there now
 * arrives `topPad` px higher than v1's ×k + pad (§2.6); on it (y = 0) a lone value moves down
 * with the pad (§2.6's `1.5·y + 36` — a ceiling depth of 0 must, since the pad rows thicken the
 * ceiling), while a box hanging from the edge grows by the pad instead, through its
 * {@link BoxYPair}.
 *
 * @param y - The value as written.
 * @returns `above` (y < 0), `on` (y = 0) or `below` (in the playfield or under it).
 */
export function topEdgeSide(y: number): TopEdgeSide {
  if (y < 0) return 'above';
  return y === 0 ? 'on' : 'below';
}

/**
 * When a {@link WorldSumPair} holds: `always` (a moving block — terrain), or `ground-enemy`, only
 * for an event whose `enemy` names an enemy with a `ground` anchor. A ground enemy is anchored in
 * the world and snaps to the terrain under `x + screenX` (`core/enemies` `spawnAtScreen`), so its
 * spot on the terrain is a world value; a flying enemy rides the camera, so its `x` (when) and
 * `screenX` (where on screen) port on their own.
 */
export type WorldSumCondition = 'always' | 'ground-enemy';

/**
 * Two fields whose sum is one world x (`rule: 'world-sum'`): what appears at screen column
 * `screen` when the camera reaches `camera` stands at world x `camera + screen`. That sum is a
 * world value (×k); only the column is frame-anchored (owner decision O3 — 400 → 664, so it still
 * appears past the right edge), and the camera x takes the difference ({@link rescaleWorldSum}).
 * Porting the two alone would move the thing `toWidth − k·fromWidth` px (64 at ×1.5) away from
 * the terrain and regions around it — the R1-03 review's bonus-range / zone-b gap entrances.
 */
export interface WorldSumPair {
  /** Discriminant. */
  readonly rule: 'world-sum';
  /** The camera-x field (a `world-x`: the event's `x`). */
  readonly camera: string;
  /** The screen-column field (a `screen-x`: `screenX`). */
  readonly screen: string;
  /**
   * The column an absent `screen` stands for, in pixels past the playfield's right edge (16 —
   * `DEFAULT_BLOCK_SCREEN_X` and `core/enemies` `DEFAULT_SPAWN_SCREEN_X` are `PLAYFIELD_W + 16`).
   */
  readonly screenPastEnd: number;
  /** When the pair holds. */
  readonly when: WorldSumCondition;
}

/**
 * A box's top edge and height (`rule: 'box-y'`): each edge ports by the `world-y` rule, an edge on
 * or above the top edge (≤ 0) staying there. A box hanging from the top edge — a brick, the gap
 * region between two bricks — so grows by the pad instead of moving down and leaving open sky
 * above it (§2.6: "a ceiling that touches the top edge gets thicker", like the tilemap's copied top
 * rows); a box below the top edge ports exactly as its two fields would alone
 * ({@link rescaleBoxY}).
 */
export interface BoxYPair {
  /** Discriminant. */
  readonly rule: 'box-y';
  /** The top-edge field (a `world-y`: `y`). */
  readonly top: string;
  /** The height field (a `world-px`: `h`). */
  readonly height: string;
}

/**
 * Fields of one object that port together (`s.object(shape, { pairs })`, read from the object's
 * `ObjectMeta.pairs`): the walkers hand each field its {@link LeafPair}.
 */
export type FieldPair = WorldSumPair | BoxYPair;

/** Which field of its {@link FieldPair} a number is. */
export type PairRole = 'camera' | 'screen' | 'top' | 'height';

/**
 * The role of a field in a pair.
 *
 * @param pair - The pair.
 * @param key - A field name of the object that declares the pair.
 * @returns Its role, or `undefined` when the pair does not name the field.
 */
export function pairRole(pair: FieldPair, key: string): PairRole | undefined {
  if (pair.rule === 'world-sum') {
    if (key === pair.camera) return 'camera';
    return key === pair.screen ? 'screen' : undefined;
  }
  if (key === pair.top) return 'top';
  return key === pair.height ? 'height' : undefined;
}

/** What {@link rescaleWorldSum} gives. */
export interface PortedWorldSum {
  /** The ported camera x: `k·(camera + screen) − screen′` — the world x stays ×k. */
  readonly camera: number;
  /**
   * The ported column: the O3 snap of the column as written, or of the default when the field is
   * absent. An absent column stays absent: R2-02 sets the default constants to the same snap,
   * `PLAYFIELD_W + 24` (Appendix B).
   */
  readonly screen: number;
  /**
   * How much earlier than `k·camera` the event now fires: `screen′ − k·screen` — 64 for a column
   * past the right edge at 384 → 640 ×1.5, 32 near the centre, 0 near the left edge. The view is
   * wider than ×k, so a world thing comes into it earlier.
   */
  readonly lead: number;
}

/**
 * Ports a {@link WorldSumPair}: the world x `camera + screen` ×k, the column snapped (O3).
 *
 * @param camera - The camera x as written (the event's `x`).
 * @param screen - The column as written, or `undefined` when the field is absent.
 * @param pair - The pair (its default column).
 * @param options - The port's geometry.
 * @returns The ported camera x and column, and the lead.
 *
 * @remarks
 * Read both fields as written before writing either back. Because the event fires `lead` px of
 * camera travel earlier than ×k, the rescale tool also: re-sorts the stage's timeline (the loader
 * wants events sorted by `x`; ties keep their file order); lists an event that moves before a
 * checkpoint it followed, or out of a `ground` bonus entrance's window it was in (the entrance
 * counts the ground enemies that appear while it is armed); and lists a block that moves (`vx`,
 * `vy`, `dx`, `dy`) — its drift and swing run `lead / speed` ticks ahead of v1 at the same camera
 * position. A `ground-enemy` pair applies only when the event's enemy has a `ground` anchor.
 *
 * @example
 * ```ts
 * // bonus-range: bricks at world x 800 and 880 (event x 400, screenX 400 / 480), the gap region
 * // 816–880 between them. Ported, the bricks stand at 1200 and 1320 and the region (world-x ×k)
 * // at 1224–1320: still exactly the gap.
 * rescaleWorldSum(400, 400, BLOCK_PAIR, v2); // { camera: 536, screen: 664, lead: 64 }
 * rescaleWorldSum(400, 480, BLOCK_PAIR, v2); // { camera: 536, screen: 784, lead: 64 }
 * ```
 */
export function rescaleWorldSum(
  camera: number,
  screen: number | undefined,
  pair: WorldSumPair,
  options: RescaleOptions,
): PortedWorldSum {
  const { factor } = options;
  const column = screen ?? options.fromWidth + pair.screenPastEnd;
  const ported = snapToEdge(column, options.fromWidth, options.toWidth, factor);
  return {
    camera: (camera + column) * factor - ported,
    screen: ported,
    lead: ported - column * factor,
  };
}

/** What {@link rescaleBoxY} gives. */
export interface PortedBox {
  /** The ported top edge. */
  readonly top: number;
  /** The ported height (the ported bottom edge minus the ported top edge). */
  readonly height: number;
  /**
   * `true` when the box reaches into the playfield from the top edge or above it (its top ≤ 0, its
   * bottom > 0): its top stays, and its height grows by the pad.
   */
  readonly fromTop: boolean;
}

/**
 * Ports a {@link BoxYPair}: each edge by the `world-y` rule, an edge on or above the top edge
 * (≤ 0) staying there (×k only).
 *
 * @param top - The top edge as written.
 * @param height - The height as written.
 * @param options - The port's geometry.
 * @returns The ported top edge and height.
 *
 * @example
 * ```ts
 * rescaleBoxY(0, 24, v2); // { top: 0, height: 72, fromTop: true } — a brick hanging from the top
 * rescaleBoxY(64, 8, v2); // { top: 132, height: 12, fromTop: false } — as y and h alone
 * ```
 */
export function rescaleBoxY(top: number, height: number, options: RescaleOptions): PortedBox {
  const { factor, topPad } = options;
  const bottom = top + height;
  const portedTop = top <= 0 ? top * factor : top * factor + topPad;
  const portedBottom = bottom <= 0 ? bottom * factor : bottom * factor + topPad;
  return { top: portedTop, height: portedBottom - portedTop, fromTop: top <= 0 && bottom > 0 };
}

/** One parallax band of a stage's backdrop, as {@link rescaleBackdrop} reads it. */
export interface BackdropBand {
  /** Its top row as written (`parallax[].y`, a `band-y`). */
  readonly y: number;
  /** Its art's height in the old pixels (frame 0 of its sprite — the atlas manifest has it). */
  readonly height: number;
}

/** A row of a stage's backdrop that is not a band, as {@link rescaleBackdrop} reads it. */
export interface BackdropRow {
  /** The row as written (a `screen-y`). */
  readonly y: number;
  /**
   * `follow` — a raster effect's `top` / `bottom`: it bounds the art it distorts, so it follows a
   * band edge it equals or lies within a tile of (and nearer to than to any playfield anchor),
   * else snaps (O3). `anchor` — a Mode-7 row (`horizon`, `bottom`): it snaps (O3), and a band
   * whose edge it equals sits on it.
   */
  readonly kind: 'follow' | 'anchor';
}

/**
 * How {@link rescaleBackdrop} placed a band: `top` (at or above the top edge: ×k), `bottom`
 * (ending exactly on the bottom edge: ×k + the bottom's shift), `row` (an edge on a Mode-7 row),
 * `chain` (touching a placed band: kept touching it — a stack), `nearest-top` / `nearest-bottom`
 * (free: by the playfield edge it lies nearer to — the rescale tool lists those).
 */
export type BandPlacement = 'top' | 'bottom' | 'row' | 'chain' | 'nearest-top' | 'nearest-bottom';

/** One band placed by {@link rescaleBackdrop}. */
export interface PortedBand {
  /** The ported top row. */
  readonly y: number;
  /** Why it is there. */
  readonly placement: BandPlacement;
}

/**
 * How {@link rescaleBackdrop} placed a row: `band-edge` (on a band edge as written: on its ported
 * edge), `near-band-edge` (within a tile of a band edge and nearer it than any playfield anchor:
 * its distance to that edge ×k — listed), `snap` (the O3 snap: Mode-7 rows always, raster rows
 * near no band).
 */
export type RowPlacement = 'snap' | 'band-edge' | 'near-band-edge';

/** One row placed by {@link rescaleBackdrop}. */
export interface PortedRow {
  /** The ported row. */
  readonly y: number;
  /** Why it is there. */
  readonly placement: RowPlacement;
}

/** What {@link rescaleBackdrop} gives. */
export interface PortedBackdrop {
  /** The bands, in input order. */
  readonly bands: readonly PortedBand[];
  /** The rows, in input order. */
  readonly rows: readonly PortedRow[];
  /**
   * Bands that touch as written but no longer do, as `[upper, lower]` indices — a top stack that
   * ended exactly where a bottom band began: the pad opens a gap there (the tool lists it).
   */
  readonly seams: readonly (readonly [number, number])[];
}

/**
 * Ports a stage's backdrop — its parallax bands (`band-y`) with their art heights, its raster rows
 * and Mode-7 rows — as one layout, so that what lines up in v1 still does.
 *
 * @param bands - The parallax bands (`parallax[]`: `y` and the height of the sprite's frame 0).
 * @param rows - The raster rows (`follow`) and the Mode-7 rows (`anchor`).
 * @param options - The port's geometry.
 * @returns Every band's and row's ported value and how it was placed, and the seams that open.
 *
 * @remarks
 * The art is ×k but the playfield ×k plus the pad, so no single per-value rule fits: `world-y`
 * leaves a pad-high strip of nothing above every band at row 0, `screen-y` (O3) splits the stacks
 * of tiles at rows 64 / 128 and lifts bottom bands that start near the centre, and ×k alone lifts
 * every band that stands on the bottom edge. So a band is placed by what it touches:
 *
 * 1. at or above the top edge → ×k (it stays on the edge); ending exactly on the bottom edge → ×k
 *    plus the bottom's shift (`toHeight − k·fromHeight`, the pad), so it still stands on it;
 * 2. an edge on a Mode-7 row (the dimension sky ending on the horizon) → that edge on the row's
 *    snap;
 * 3. touching a band already placed (a stack, a band on a band) → kept touching it, repeatedly;
 * 4. anything still free → by the playfield edge it is nearer to (top: ×k; bottom: + the shift),
 *    then step 3 again.
 *
 * A raster row on a band edge (in v1 — of any layer: a far haze may end where a mid band begins)
 * lands on that edge's port; one within a tile (`tileSize`) of a band edge, and nearer it than any
 * O3 anchor, keeps its distance to that edge ×k (a haze drawn a few rows over a ridge); the rest
 * snap, as do the Mode-7 rows — so rows equal as written stay equal. At factor 1 on the same
 * playfield everything stays where it is.
 *
 * @example
 * ```ts
 * // zone-g: facets stacked 0 / 64 / 128 (64 tall), spires 144 + 56 on the bottom edge, haze 144–200.
 * const { bands, rows } = rescaleBackdrop(
 *   [{ y: 0, height: 64 }, { y: 64, height: 64 }, { y: 128, height: 64 }, { y: 144, height: 56 }],
 *   [{ y: 144, kind: 'follow' }, { y: 200, kind: 'follow' }],
 *   v2,
 * ); // bands at 0, 96, 192 (top, chain, chain) and 252 (bottom); rows 252 and 336
 * ```
 */
export function rescaleBackdrop(
  bands: readonly BackdropBand[],
  rows: readonly BackdropRow[],
  options: RescaleOptions,
): PortedBackdrop {
  const { factor } = options;
  const from = options.fromHeight;
  const to = options.toHeight;
  const shift = to - from * factor;
  const n = bands.length;
  const at: number[] = [];
  const how: (BandPlacement | undefined)[] = [];
  for (let i = 0; i < n; i++) {
    at.push(NaN);
    how.push(undefined);
  }
  /**
   * Places one band.
   *
   * @param i - Its index.
   * @param y - Its ported top row.
   * @param placement - Why.
   */
  const place = (i: number, y: number, placement: BandPlacement): void => {
    at[i] = y;
    how[i] = placement;
  };
  // 1. On an edge of the playfield.
  for (let i = 0; i < n; i++) {
    const band = bands[i];
    if (band.y <= 0) place(i, band.y * factor, 'top');
    else if (band.y + band.height === from) place(i, band.y * factor + shift, 'bottom');
  }
  // 2. On a Mode-7 row.
  for (let i = 0; i < n; i++) {
    if (how[i] !== undefined) continue;
    const band = bands[i];
    for (const row of rows) {
      if (row.kind !== 'anchor') continue;
      const snapped = snapToEdge(row.y, from, to, factor);
      if (band.y + band.height === row.y) {
        place(i, snapped - band.height * factor, 'row');
        break;
      }
      if (band.y === row.y) {
        place(i, snapped, 'row');
        break;
      }
    }
  }
  // 3 + 4. Chains; then the free band of lowest index by its nearer edge; until all are placed.
  for (;;) {
    let grew = true;
    while (grew) {
      grew = false;
      for (let i = 0; i < n; i++) {
        if (how[i] !== undefined) continue;
        const band = bands[i];
        for (let j = 0; j < n; j++) {
          if (how[j] === undefined) continue;
          const other = bands[j];
          const otherAt = at[j];
          if (band.y === other.y + other.height) {
            place(i, otherAt + other.height * factor, 'chain');
            grew = true;
            break;
          }
          if (band.y + band.height === other.y) {
            place(i, otherAt - band.height * factor, 'chain');
            grew = true;
            break;
          }
        }
      }
    }
    const free = how.indexOf(undefined);
    if (free < 0) break;
    const band = bands[free];
    if (band.y <= from - (band.y + band.height)) place(free, band.y * factor, 'nearest-top');
    else place(free, band.y * factor + shift, 'nearest-bottom');
  }
  const ported: PortedBand[] = [];
  for (let i = 0; i < n; i++) {
    ported.push({ y: at[i], placement: how[i] as BandPlacement });
  }
  const portedRows: PortedRow[] = [];
  for (const row of rows) portedRows.push(backdropRow(row, bands, at, options));
  const seams: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const upper = bands[i];
    for (let j = 0; j < n; j++) {
      const lower = bands[j];
      if (i === j || upper.y + upper.height !== lower.y) continue;
      if (at[i] + upper.height * factor !== at[j]) seams.push([i, j]);
    }
  }
  return { bands: ported, rows: portedRows, seams };
}

/**
 * Places one backdrop row ({@link rescaleBackdrop}).
 *
 * @param row - The row.
 * @param bands - The bands as written.
 * @param at - Their ported top rows.
 * @param options - The port's geometry.
 * @returns The ported row.
 */
function backdropRow(
  row: BackdropRow,
  bands: readonly BackdropBand[],
  at: readonly number[],
  options: RescaleOptions,
): PortedRow {
  const { factor } = options;
  const from = options.fromHeight;
  const snapped = snapToEdge(row.y, from, options.toHeight, factor);
  if (row.kind === 'anchor') return { y: snapped, placement: 'snap' };
  // On a band edge as written (any layer — a far raster may end where a mid band begins).
  for (let i = 0; i < bands.length; i++) {
    const band = bands[i];
    if (band.y === row.y) return { y: at[i], placement: 'band-edge' };
    if (band.y + band.height === row.y) {
      return { y: at[i] + band.height * factor, placement: 'band-edge' };
    }
  }
  // Within a tile of a band edge and nearer it than any playfield anchor: keep the distance.
  const anchor = Math.min(Math.abs(row.y), Math.abs(row.y - from / 2), Math.abs(row.y - from));
  let nearest = Math.min(anchor, options.tileSize + 1);
  let result: PortedRow = { y: snapped, placement: 'snap' };
  for (let i = 0; i < bands.length; i++) {
    const band = bands[i];
    const top = at[i];
    const edges = [band.y, top, band.y + band.height, top + band.height * factor];
    for (let e = 0; e < 4; e += 2) {
      const edge = edges[e];
      const distance = Math.abs(row.y - edge);
      if (distance < nearest) {
        nearest = distance;
        result = {
          y: edges[e + 1] + (row.y - edge) * factor,
          placement: 'near-band-edge',
        };
      }
    }
  }
  return result;
}

/** One numeric field of a schema, as {@link listNumberFields} reports it. */
export interface NumberField {
  /**
   * Where it is, as a pattern: object keys joined by `.`, `[]` for the items of an array, `*` for
   * the entries of a record, `<tag=value>` for a union variant and `|n` for the n-th shape of an
   * any-of — e.g. `events[]<type=spawn>.y`, `enemies[].params.*`.
   */
  readonly path: string;
  /** Its unit; `undefined` when the schema declares none (the coverage test fails on it). */
  readonly unit: NumberUnit | undefined;
  /** `true` for an `s.int`. */
  readonly integer: boolean;
  /** `true` for a bullet-pattern expression (a number or an expression string). */
  readonly expression: boolean;
  /** Smallest accepted value, if bounded. */
  readonly min: number | undefined;
  /** Largest accepted value, if bounded. */
  readonly max: number | undefined;
  /** Its place in a {@link FieldPair} of its object, if any (absent otherwise). */
  readonly pair?: LeafPair;
}

/** A number's place in a {@link FieldPair} ({@link NumberField.pair}, {@link NumberLeaf.pair}). */
export interface LeafPair {
  /** The pair, as the holding object's schema declares it. */
  readonly pair: FieldPair;
  /** Which of its fields the number is. */
  readonly role: PairRole;
}

/** An object schema's {@link FieldPair}, as {@link listNumberFields} reports it. */
export interface PairSite {
  /** The object's pattern path ({@link NumberField.path} format: `events[]<type=block>`). */
  readonly path: string;
  /** The pair. */
  readonly pair: FieldPair;
}

/** What {@link listNumberFields} found. */
export interface NumberFieldList {
  /** Every numeric field, in schema order (a schema shared by several fields is listed at each). */
  readonly fields: readonly NumberField[];
  /**
   * The pattern paths of the schemas a walker cannot look into: an opaque `s.custom` (a demo's
   * game config).
   */
  readonly opaque: readonly string[];
  /** Every field pair the objects declare, in schema order. */
  readonly pairs: readonly PairSite[];
}

/**
 * The pair a field of an object belongs to.
 *
 * @param meta - The object's metadata.
 * @param key - The field's name.
 * @returns Its {@link LeafPair}, or `undefined` when no pair of the object names it.
 */
function pairOf(meta: ObjectMeta, key: string): LeafPair | undefined {
  const pairs = meta.pairs;
  if (pairs === undefined) return undefined;
  for (const pair of pairs) {
    const role = pairRole(pair, key);
    if (role !== undefined) return { pair, role };
  }
  return undefined;
}

/**
 * Joins a parent path and a key.
 *
 * @param parent - The parent's path (`''` at the root).
 * @param key - The key.
 * @returns `parent.key`, or `key` at the root.
 */
const join = (parent: string, key: string): string => (parent === '' ? key : parent + '.' + key);

/**
 * Lists every numeric field of a schema with its unit (the unit coverage test of R1-03).
 *
 * @param schema - A content file schema (or any schema).
 * @returns The fields, the opaque places and the field pairs.
 *
 * @remarks
 * A schema met again inside itself (the DSL's nested node lists) is not entered a second time:
 * its fields are already listed at the outer level.
 *
 * @example
 * ```ts
 * const untyped = listNumberFields(fileSchema).fields.filter((field) => field.unit === undefined);
 * ```
 */
export function listNumberFields(schema: Schema<unknown>): NumberFieldList {
  const fields: NumberField[] = [];
  const opaque: string[] = [];
  const pairs: PairSite[] = [];
  const stack: Schema<unknown>[] = [];
  /**
   * Visits one schema.
   *
   * @param node - The schema.
   * @param path - Its pattern path.
   * @param pair - Its place in a pair of the object holding it (only a number takes it).
   */
  const visit = (node: Schema<unknown>, path: string, pair: LeafPair | undefined): void => {
    if (stack.indexOf(node) >= 0) return;
    const meta = node.meta;
    stack.push(node);
    switch (meta.kind) {
      case 'number':
        fields.push({
          path,
          unit: meta.unit,
          integer: meta.integer,
          expression: false,
          min: meta.min,
          max: meta.max,
          ...(pair === undefined ? {} : { pair }),
        });
        break;
      case 'expr':
        fields.push({
          path,
          unit: meta.unit,
          integer: false,
          expression: true,
          min: undefined,
          max: undefined,
          ...(pair === undefined ? {} : { pair }),
        });
        break;
      case 'array':
        visit(meta.item, path + '[]', undefined);
        break;
      case 'object':
        for (const declared of meta.pairs ?? []) pairs.push({ path, pair: declared });
        for (const key of Object.keys(meta.shape)) {
          const child = meta.shape[key];
          if (child !== undefined) visit(child, join(path, key), pairOf(meta, key));
        }
        break;
      case 'record':
        visit(meta.value, join(path, '*'), undefined);
        break;
      case 'nullable':
        visit(meta.inner, path, pair);
        break;
      case 'union':
        for (const tag of Object.keys(meta.variants)) {
          const variant = meta.variants[tag];
          if (variant !== undefined) visit(variant, path + '<' + meta.tag + '=' + tag + '>', pair);
        }
        break;
      case 'anyOf':
        for (let i = 0; i < meta.options.length; i++) {
          const option = meta.options[i];
          if (option !== undefined) visit(option, path + '|' + String(i), pair);
        }
        break;
      case 'lazy':
        visit(meta.target(), path, pair);
        break;
      case 'opaque':
        opaque.push(path);
        break;
      default:
        // string, boolean, enum, ref: no numbers inside.
        break;
    }
    stack.pop();
  };
  visit(schema, '', undefined);
  return { fields, opaque, pairs };
}

/** One number of a content document, as {@link walkNumbers} visits it. */
export interface NumberLeaf {
  /** Its JSON path, in the format of `ValidationIssue.path` (`events[3].y`, `''` for the root). */
  readonly path: string;
  /** Its field's pattern path ({@link NumberField.path}: `events[]<type=spawn>.y`). */
  readonly field: string;
  /** Its field's unit (`undefined` when the schema declares none). */
  readonly unit: NumberUnit | undefined;
  /** `true` for an `s.int` field. */
  readonly integer: boolean;
  /** `true` for a bullet-pattern expression; {@link NumberLeaf.value} may then be a string. */
  readonly expression: boolean;
  /** The field's smallest accepted value, if bounded. */
  readonly min: number | undefined;
  /** The field's largest accepted value, if bounded. */
  readonly max: number | undefined;
  /** The value as written. */
  readonly value: number | string;
  /**
   * The object or array that holds it (`container[key] === value`; write a ported value back
   * there), or `null` when the document itself is the number.
   */
  readonly container: Record<string, unknown> | unknown[] | null;
  /** Its key in {@link NumberLeaf.container} (an array index is a number). */
  readonly key: string | number;
  /**
   * Every value on the way from the document (first) to {@link NumberLeaf.container} (last) — a
   * behaviour tunable's owner (the enemy or weapon naming the behaviour) is the one before its
   * `params` record.
   */
  readonly parents: readonly unknown[];
  /**
   * Its place in a {@link FieldPair} of {@link NumberLeaf.container}, if any (absent otherwise):
   * port it with its partner — read from the same container — through {@link rescaleWorldSum} or
   * {@link rescaleBoxY}, not by its unit alone. A partner that is absent from the document is not
   * visited (a block's default `screenX`), so the pair arrives on the field that is there.
   */
  readonly pair?: LeafPair;
}

/** A value {@link walkNumbers} could not follow. */
export interface WalkSkip {
  /** Its JSON path. */
  readonly path: string;
  /**
   * Why: `opaque` (an opaque `s.custom` schema), `mismatch` (the value does not have
   * the schema's shape — validate the document first) or `variant` (a union tag, or no any-of
   * shape, that matches).
   */
  readonly reason: 'opaque' | 'mismatch' | 'variant';
}

/**
 * Plain (non-array, non-null) object test.
 *
 * @param value - Any JSON value.
 * @returns `true` for a JSON object.
 */
const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Visits every number of a content document with its schema field (the rescale tool's walk).
 *
 * @param schema - The document's schema (a content file schema).
 * @param document - The parsed JSON (validate it first: values that do not fit the schema are
 *   skipped, not visited).
 * @param visit - Called for every number — and every expression string — in document order.
 * @returns The values it could not follow (an opaque demo config, a mismatch), in document order.
 *
 * @remarks
 * Union variants are picked by their tag, an any-of by the first shape that parses the value. The
 * walk only reads; to port a value, write it into `leaf.container[leaf.key]` — the walk has passed
 * it by then (but a later field of the same {@link NumberLeaf.pair} reads the container too, so
 * port a pair from the values as written).
 *
 * @example
 * ```ts
 * walkNumbers(schema, json, (leaf) => {
 *   if (leaf.unit === 'world-x' && typeof leaf.value === 'number' && leaf.container !== null) {
 *     (leaf.container as Record<string, unknown>)[leaf.key] = leaf.value * 1.5;
 *   }
 * });
 * ```
 */
export function walkNumbers(
  schema: Schema<unknown>,
  document: unknown,
  visit: (leaf: NumberLeaf) => void,
): readonly WalkSkip[] {
  const skipped: WalkSkip[] = [];
  const parents: unknown[] = [];
  /**
   * Walks one value.
   *
   * @param node - Its schema.
   * @param value - The value.
   * @param path - Its JSON path.
   * @param field - Its pattern path.
   * @param container - The object or array holding it (`null` at the root).
   * @param key - Its key there.
   * @param pair - Its place in a pair of the object holding it (only a number takes it).
   */
  const walk = (
    node: Schema<unknown>,
    value: unknown,
    path: string,
    field: string,
    container: Record<string, unknown> | unknown[] | null,
    key: string | number,
    pair: LeafPair | undefined,
  ): void => {
    const meta = node.meta;
    switch (meta.kind) {
      case 'number':
      case 'expr': {
        const ok = typeof value === 'number' || (meta.kind === 'expr' && typeof value === 'string');
        if (!ok) {
          skipped.push({ path, reason: 'mismatch' });
          return;
        }
        visit({
          path,
          field,
          unit: meta.unit,
          integer: meta.kind === 'number' && meta.integer,
          expression: meta.kind === 'expr',
          min: meta.kind === 'number' ? meta.min : undefined,
          max: meta.kind === 'number' ? meta.max : undefined,
          value,
          container,
          key,
          parents: parents.slice(),
          ...(pair === undefined ? {} : { pair }),
        });
        return;
      }
      case 'array': {
        if (!Array.isArray(value)) {
          skipped.push({ path, reason: 'mismatch' });
          return;
        }
        const items: unknown[] = value;
        parents.push(items);
        for (let i = 0; i < items.length; i++) {
          walk(
            meta.item,
            items[i],
            path + '[' + String(i) + ']',
            field + '[]',
            items,
            i,
            undefined,
          );
        }
        parents.pop();
        return;
      }
      case 'object': {
        if (!isPlainObject(value)) {
          skipped.push({ path, reason: 'mismatch' });
          return;
        }
        parents.push(value);
        for (const name of Object.keys(meta.shape)) {
          const child = meta.shape[name];
          if (child === undefined || !Object.prototype.hasOwnProperty.call(value, name)) continue;
          if (value[name] === undefined) continue;
          const childPair = pairOf(meta, name);
          walk(child, value[name], join(path, name), join(field, name), value, name, childPair);
        }
        parents.pop();
        return;
      }
      case 'record': {
        if (!isPlainObject(value)) {
          skipped.push({ path, reason: 'mismatch' });
          return;
        }
        parents.push(value);
        for (const name of Object.keys(value)) {
          walk(meta.value, value[name], join(path, name), join(field, '*'), value, name, undefined);
        }
        parents.pop();
        return;
      }
      case 'nullable':
        if (value !== null) walk(meta.inner, value, path, field, container, key, pair);
        return;
      case 'union': {
        const tag = isPlainObject(value) ? value[meta.tag] : undefined;
        const variant =
          typeof tag === 'string' && Object.prototype.hasOwnProperty.call(meta.variants, tag)
            ? meta.variants[tag]
            : undefined;
        if (variant === undefined) {
          skipped.push({ path, reason: 'variant' });
          return;
        }
        walk(
          variant,
          value,
          path,
          field + '<' + meta.tag + '=' + String(tag) + '>',
          container,
          key,
          pair,
        );
        return;
      }
      case 'anyOf': {
        for (let i = 0; i < meta.options.length; i++) {
          const option = meta.options[i];
          if (option !== undefined && option.parse(value, path, []) !== undefined) {
            walk(option, value, path, field + '|' + String(i), container, key, pair);
            return;
          }
        }
        skipped.push({ path, reason: 'variant' });
        return;
      }
      case 'lazy':
        walk(meta.target(), value, path, field, container, key, pair);
        return;
      case 'opaque':
        skipped.push({ path, reason: 'opaque' });
        return;
      default:
        // string, boolean, enum, ref: no numbers inside.
        return;
    }
  };
  walk(schema, document, '', '', null, '', undefined);
  return skipped;
}
