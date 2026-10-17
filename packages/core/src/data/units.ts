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
 * **Implements.** shmup_feat.md §22 (data-driven content) and §14 (stage data validated by a
 * schema); plan_resolution.md R1-03, §2.6 (frame ≠ world: the rules of each kind of value) and
 * Appendix B.
 *
 * **Public API.** {@link NUMBER_UNITS} / {@link NumberUnit}, {@link UNIT_RULES} /
 * {@link UnitRule}, {@link rescaleNumber} with {@link RescaleOptions}, {@link edgeAnchor} /
 * {@link EdgeAnchor}, {@link listNumberFields} ({@link NumberField}, {@link NumberFieldList}) and
 * {@link walkNumbers} ({@link NumberLeaf}, {@link WalkSkip}).
 *
 * @remarks
 * Tooling only: nothing the game runs imports this module (`data/schema` takes only the
 * {@link NumberUnit} type from it), so a production bundle drops it — only the unit strings the
 * schemas pass to `s.num` / `s.int` ship. Everything here runs on cold paths and may allocate.
 *
 * @module
 */
import type { Schema } from './schema.js';

/**
 * Every unit a content number can have (plan R1-03, owner decisions O1 / O2 / O5).
 *
 * @remarks
 * Each unit, what it means, and its rule ({@link UNIT_RULES}):
 *
 * - `world-px` — a world length: a radius, a hurtbox half-extent, a stage length, a wave
 *   period. ×k.
 * - `world-x` — an absolute x in the level: an event's camera x, a checkpoint, a region. ×k.
 * - `world-y` — an absolute y in the level: a spawn y, a region or block y. ×k plus the top pad;
 *   only ×k above the top edge (y < 0).
 * - `rel-px` — a relative offset: path waypoints, part offsets, emitter offsets, a block's
 *   travel. ×k.
 * - `px-per-tick` — a speed or a velocity. ×k.
 * - `px-per-tick2` — an acceleration (gravity). ×k.
 * - `screen-x` — a column anchored to an edge or the centre of the view: a spawn's `screenX`, the
 *   boss's x. Snapped to its anchor (§2.6, owner decision O3).
 * - `screen-y` — a row anchored to an edge or the centre of the playfield: raster rows, the Mode-7
 *   horizon, the boss's y, the camera's `yTo` (one playfield — O2). Snapped to its anchor.
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
 *   §2.6's one discontinuity; the rescale tool lists those spawns);
 * - `edge-x` / `edge-y` — snapped to the nearest of the start, the centre and the end of the old
 *   playfield axis, keeping the distance to it ×k (owner decision O3);
 * - `tile-rows` — plus the rows the top pad inserts;
 * - `resample` — a tile mask entry: ×k, and the tool resamples the whole mask to the new tile size;
 * - `lookup` — the unit comes from elsewhere (`param`, `inherit`): resolve it first.
 */
export type UnitRule =
  'keep' | 'scale' | 'world-y' | 'edge-x' | 'edge-y' | 'tile-rows' | 'resample' | 'lookup';

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
      return snapToEdge(value, options.fromHeight, options.toHeight, factor);
    case 'tile-rows':
      return value + options.topPad / (options.tileSize * factor);
    case 'lookup':
    default:
      throw new RangeError('unit "' + unit + '" has no rule of its own: resolve it first');
  }
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
}

/** What {@link listNumberFields} found. */
export interface NumberFieldList {
  /** Every numeric field, in schema order (a schema shared by several fields is listed at each). */
  readonly fields: readonly NumberField[];
  /**
   * The pattern paths of the schemas a walker cannot look into: an opaque `s.custom` (a demo's
   * game config) or a schema without metadata.
   */
  readonly opaque: readonly string[];
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
 * @returns The fields and the opaque places.
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
  const stack: Schema<unknown>[] = [];
  /**
   * Visits one schema.
   *
   * @param node - The schema.
   * @param path - Its pattern path.
   */
  const visit = (node: Schema<unknown>, path: string): void => {
    if (stack.indexOf(node) >= 0) return;
    const meta = node.meta;
    if (meta === undefined) {
      opaque.push(path);
      return;
    }
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
        });
        break;
      case 'array':
        visit(meta.item, path + '[]');
        break;
      case 'object':
        for (const key of Object.keys(meta.shape)) {
          const child = meta.shape[key];
          if (child !== undefined) visit(child, join(path, key));
        }
        break;
      case 'record':
        visit(meta.value, join(path, '*'));
        break;
      case 'nullable':
        visit(meta.inner, path);
        break;
      case 'union':
        for (const tag of Object.keys(meta.variants)) {
          const variant = meta.variants[tag];
          if (variant !== undefined) visit(variant, path + '<' + meta.tag + '=' + tag + '>');
        }
        break;
      case 'anyOf':
        for (let i = 0; i < meta.options.length; i++) {
          const option = meta.options[i];
          if (option !== undefined) visit(option, path + '|' + String(i));
        }
        break;
      case 'lazy':
        visit(meta.target(), path);
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
  visit(schema, '');
  return { fields, opaque };
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
}

/** A value {@link walkNumbers} could not follow. */
export interface WalkSkip {
  /** Its JSON path. */
  readonly path: string;
  /**
   * Why: `opaque` (an opaque schema or one without metadata), `mismatch` (the value does not have
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
 * it by then.
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
   */
  const walk = (
    node: Schema<unknown>,
    value: unknown,
    path: string,
    field: string,
    container: Record<string, unknown> | unknown[] | null,
    key: string | number,
  ): void => {
    const meta = node.meta;
    if (meta === undefined) {
      skipped.push({ path, reason: 'opaque' });
      return;
    }
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
          walk(meta.item, items[i], path + '[' + String(i) + ']', field + '[]', items, i);
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
          walk(child, value[name], join(path, name), join(field, name), value, name);
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
          walk(meta.value, value[name], join(path, name), join(field, '*'), value, name);
        }
        parents.pop();
        return;
      }
      case 'nullable':
        if (value !== null) walk(meta.inner, value, path, field, container, key);
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
        );
        return;
      }
      case 'anyOf': {
        for (let i = 0; i < meta.options.length; i++) {
          const option = meta.options[i];
          if (option !== undefined && option.parse(value, path, []) !== undefined) {
            walk(option, value, path, field + '|' + String(i), container, key);
            return;
          }
        }
        skipped.push({ path, reason: 'variant' });
        return;
      }
      case 'lazy':
        walk(meta.target(), value, path, field, container, key);
        return;
      case 'opaque':
        skipped.push({ path, reason: 'opaque' });
        return;
      default:
        // string, boolean, enum, ref: no numbers inside.
        return;
    }
  };
  walk(schema, document, '', '', null, '');
  return skipped;
}
