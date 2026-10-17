/**
 * # data/schema — in-house JSON schema combinators
 *
 * **Responsibility.** The validation layer under {@link ../index.js | core/data}: a handful of
 * combinators that describe the shape of a content JSON file, check a parsed `unknown`
 * against it and report every problem as a {@link ValidationIssue} with a JSON path
 * (`enemies[3].hurtbox.hw: must be an integer >= 1`). Validators never throw on bad data —
 * they collect issues and return `undefined` for the offending value, so one load reports
 * *all* errors at once (the boot error screen lists them).
 *
 * Decision D28: no runtime dependency (no zod/TypeBox) — the whole layer must fit in the
 * Tizen IIFE bundle and produce exact error paths.
 *
 * **Implements.** shmup_feat.md §14 (stage data format is JSON validated by a schema),
 * §22 (data-driven content).
 *
 * **Public API.** {@link Schema}, {@link SchemaMeta} (and its variants), {@link Infer},
 * {@link ValidationIssue}, {@link RefSite}, {@link ContentRefKind}, {@link RangeOptions} and the
 * combinator namespace {@link s}.
 *
 * @remarks
 * String ids that point at other content (`"sprite": "ships/kestrel"`) are declared with
 * {@link s.ref}. Parsing keeps the string and records a {@link RefSite}; `loadContent`
 * resolves every site in a second pass and writes the numeric index into a sibling field
 * named `<field>Id` (convention 1.5: *string ids become numeric indices at load*).
 *
 * Every schema also carries read-only {@link SchemaMeta} — what it accepts, its children and,
 * for a number, its unit (`s.num({ unit: 'px-per-tick' })`, plan_resolution.md R1-03) — so a tool
 * can walk a content file with its schema (`data/units`: the unit coverage test and
 * `scripts/content/rescale.mjs`, the ×1.5 port of R2-02). Parsing never reads it.
 *
 * @module
 */
import type { FieldPair, NumberUnit } from './units.js';

/** A validation problem found while loading content. */
export interface ValidationIssue {
  /**
   * Where the problem is. {@link Schema.parse} reports the bare JSON path it was given
   * (`enemies[3].hp`, `''` for the root); `loadContent` prefixes it with the file:
   * `<file>:<json path>`, e.g. `enemies/x.enemies.json:enemies[3].hp`.
   */
  readonly path: string;
  /** Human-readable description, e.g. `must be an integer >= 1`. */
  readonly message: string;
}

/**
 * Kinds of thing a content string id can point at.
 *
 * @remarks
 * `sprite` and `script` ids are *interned* (any name is accepted and gets an index);
 * `ship`/`weapon`/`enemy`/`stage`/`tileset`/`path` must name an item defined by some content file;
 * `sfx`/`music` must name a cue of the registries in `core/events`; `pattern` must name an action
 * of a `content/patterns/` file (plan M2-02).
 */
export type ContentRefKind =
  | 'ship'
  | 'weapon'
  | 'enemy'
  | 'stage'
  | 'tileset'
  | 'path'
  | 'sprite'
  | 'script'
  | 'sfx'
  | 'music'
  | 'pattern';

/**
 * One place where content referred to another item by string id, recorded while parsing
 * so the loader can resolve it in a second pass.
 */
export interface RefSite {
  /** JSON path of the reference; the loader prefixes it with the file path. */
  path: string;
  /** What the id points at. */
  readonly kind: ContentRefKind;
  /**
   * The id as written, or `null` for a `nullable` reference that was `null` and for an
   * absent optional one.
   */
  readonly id: string | null;
  /** Object that holds the reference; the resolved index is written to `<field>Id`. */
  readonly container: Record<string, unknown>;
  /** Key of the reference inside {@link RefSite.container}. */
  readonly field: string;
}

/**
 * A validator for one JSON value.
 *
 * @typeParam T - The value type produced on success.
 */
export interface Schema<T> {
  /** Short name of the accepted value kind, for messages and debugging (`integer`, `array`). */
  readonly typeName: string;
  /** Non-null when this schema is (or wraps) a {@link s.ref} content reference. */
  readonly refKind: ContentRefKind | null;
  /**
   * What the schema accepts, for tools that walk content with its schema (`data/units`). Every
   * combinator of {@link s} sets it; a hand-made schema is built with {@link s.custom}.
   */
  readonly meta: SchemaMeta;
  /**
   * Validates one value.
   *
   * @param value - The parsed JSON value to check.
   * @param path - JSON path of `value` (`''` for the document root).
   * @param issues - Collector; every problem found is appended.
   * @param refs - Optional collector for {@link RefSite}s; omit to only validate.
   * @returns The value (typed) or `undefined` when it — or anything inside it — is invalid.
   */
  parse(value: unknown, path: string, issues: ValidationIssue[], refs?: RefSite[]): T | undefined;
}

/** The validator function of a {@link Schema} (see {@link Schema.parse}). */
export type SchemaParse<T> = (
  value: unknown,
  path: string,
  issues: ValidationIssue[],
  refs?: RefSite[],
) => T | undefined;

/** {@link SchemaMeta} of {@link s.int} and {@link s.num}. */
export interface NumberMeta {
  /** Discriminant. */
  readonly kind: 'number';
  /** `true` for {@link s.int}. */
  readonly integer: boolean;
  /** What the number means (`data/units` {@link NumberUnit}); `undefined` = not declared. */
  readonly unit: NumberUnit | undefined;
  /** Smallest accepted value (inclusive), if bounded. */
  readonly min: number | undefined;
  /** Largest accepted value (inclusive), if bounded. */
  readonly max: number | undefined;
}

/** {@link SchemaMeta} of {@link s.str}. */
export interface StringMeta {
  /** Discriminant. */
  readonly kind: 'string';
}

/** {@link SchemaMeta} of {@link s.bool}. */
export interface BooleanMeta {
  /** Discriminant. */
  readonly kind: 'boolean';
}

/** {@link SchemaMeta} of {@link s.enumOf}. */
export interface EnumMeta {
  /** Discriminant. */
  readonly kind: 'enum';
  /** The accepted literals. */
  readonly values: readonly string[];
}

/** {@link SchemaMeta} of {@link s.ref} (the schema's {@link Schema.refKind} says what it names). */
export interface RefMeta {
  /** Discriminant. */
  readonly kind: 'ref';
}

/** {@link SchemaMeta} of {@link s.array}. */
export interface ArrayMeta {
  /** Discriminant. */
  readonly kind: 'array';
  /** Schema of every item. */
  readonly item: Schema<unknown>;
  /** Smallest accepted item count, if bounded. */
  readonly min: number | undefined;
  /** Largest accepted item count, if bounded. */
  readonly max: number | undefined;
}

/** {@link SchemaMeta} of {@link s.object}. */
export interface ObjectMeta {
  /** Discriminant. */
  readonly kind: 'object';
  /** Field name → schema (the object passed to {@link s.object}; never modify it). */
  readonly shape: Readonly<ObjectShape>;
  /** The fields that may be missing. */
  readonly optional: readonly string[];
  /**
   * Fields that port together (`data/units` {@link FieldPair}: a block's `x` + `screenX`, a box's
   * `y` + `h`); absent when the object declares none.
   */
  readonly pairs?: readonly FieldPair[];
}

/** {@link SchemaMeta} of {@link s.record}. */
export interface RecordMeta {
  /** Discriminant. */
  readonly kind: 'record';
  /** Schema of every entry. */
  readonly value: Schema<unknown>;
}

/** {@link SchemaMeta} of {@link s.nullable}. */
export interface NullableMeta {
  /** Discriminant. */
  readonly kind: 'nullable';
  /** Schema of the non-null case. */
  readonly inner: Schema<unknown>;
}

/** {@link SchemaMeta} of {@link s.oneOf}. */
export interface UnionMeta {
  /** Discriminant. */
  readonly kind: 'union';
  /** The discriminating field. */
  readonly tag: string;
  /** Tag value → variant schema. */
  readonly variants: Readonly<Record<string, Schema<unknown>>>;
}

/**
 * {@link SchemaMeta} of an expression (a {@link s.custom} schema — the bullet-pattern DSL's): a
 * finite number or an expression string whose result has {@link ExprMeta.unit}.
 */
export interface ExprMeta {
  /** Discriminant. */
  readonly kind: 'expr';
  /** What the expression's value means; `undefined` = not declared. */
  readonly unit: NumberUnit | undefined;
}

/**
 * {@link SchemaMeta} of a value that may take one of several shapes (a {@link s.custom} schema —
 * the DSL's speed: an expression or a typed speed object): the first option that parses a value
 * describes it.
 */
export interface AnyOfMeta {
  /** Discriminant. */
  readonly kind: 'anyOf';
  /** The shapes, in the order they are tried. */
  readonly options: readonly Schema<unknown>[];
}

/**
 * {@link SchemaMeta} of a schema defined later (a {@link s.custom} schema — nested DSL node
 * lists).
 */
export interface LazyMeta {
  /** Discriminant. */
  readonly kind: 'lazy';
  /**
   * The schema it stands for.
   *
   * @returns The target schema (the same object every call).
   */
  target(): Schema<unknown>;
}

/**
 * {@link SchemaMeta} of a value a walker does not look into (a {@link s.custom} schema — a demo's
 * recorded game config, validated when it is played).
 */
export interface OpaqueMeta {
  /** Discriminant. */
  readonly kind: 'opaque';
}

/**
 * What a {@link Schema} accepts, read by tools that walk content with its schema (`data/units`).
 * Every variant is frozen; the schemas it names are the ones the parser uses.
 */
export type SchemaMeta =
  | NumberMeta
  | StringMeta
  | BooleanMeta
  | EnumMeta
  | RefMeta
  | ArrayMeta
  | ObjectMeta
  | RecordMeta
  | NullableMeta
  | UnionMeta
  | ExprMeta
  | AnyOfMeta
  | LazyMeta
  | OpaqueMeta;

/** The value type a {@link Schema} produces, e.g. `Infer<typeof ENEMY_SCHEMA>`. */
export type Infer<S> = S extends Schema<infer T> ? T : never;

/** Field name → schema, as accepted by {@link s.object}. */
export type ObjectShape = Record<string, Schema<unknown>>;

/** Flattens an intersection so editors show one object type. */
type Simplify<T> = { [K in keyof T]: T[K] } & NonNullable<unknown>;

/** Result type of {@link s.object}: keys listed in `optional` become optional. */
export type ObjectValue<S extends ObjectShape, O extends keyof S> = Simplify<
  { [K in Exclude<keyof S, O>]: Infer<S[K]> } & { [K in O]?: Infer<S[K]> }
>;

/** Bounds and unit shared by {@link s.int} and {@link s.num}. */
export interface RangeOptions {
  /** Smallest accepted value (inclusive). */
  readonly min?: number;
  /** Largest accepted value (inclusive). */
  readonly max?: number;
  /**
   * What the number means (`data/units` {@link NumberUnit}: `world-x`, `px-per-tick`, `ticks` …)
   * — the rule by which `scripts/content/rescale.mjs` ports it. Only {@link SchemaMeta} keeps it;
   * parsing ignores it. Every number of every content kind declares one (a coverage test checks).
   */
  readonly unit?: NumberUnit;
}

/** Options of {@link s.str}. */
export interface StringOptions {
  /** Smallest accepted length (inclusive); defaults to 1 — empty strings are rejected. */
  readonly minLength?: number;
  /** Largest accepted length (inclusive). */
  readonly maxLength?: number;
  /** Pattern the whole string must match. */
  readonly pattern?: RegExp;
}

/** Options of {@link s.array}. */
export interface ArrayOptions {
  /** Smallest accepted item count. */
  readonly min?: number;
  /** Largest accepted item count. */
  readonly max?: number;
}

/** Options of {@link s.object}. */
export interface ObjectOptions<O> {
  /** Keys that may be missing from the JSON. */
  readonly optional?: readonly O[];
  /**
   * Fields whose values port together in a ×k content port (`data/units` {@link FieldPair}) —
   * metadata for tools only ({@link ObjectMeta.pairs}); parsing never reads it.
   */
  readonly pairs?: readonly FieldPair[];
}

/** `Object.prototype.hasOwnProperty` (Chromium 69 has no `Object.hasOwn`). */
const hasOwn = (target: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(target, key);

/** The {@link ObjectMeta.optional} list of an object without optional fields. */
const NO_KEYS: readonly string[] = Object.freeze([]);

/**
 * JSON path of a property.
 *
 * @param parent - Path of the containing object (`''` at the root).
 * @param key - Property name.
 * @returns `parent.key`, or `key` at the root.
 */
const propPath = (parent: string, key: string): string =>
  parent === '' ? key : parent + '.' + key;

/**
 * Records one issue and fails the value.
 *
 * @param issues - Collector.
 * @param path - JSON path of the bad value.
 * @param message - What was expected.
 * @returns Always `undefined` (the failure marker of {@link Schema.parse}).
 */
function fail(issues: ValidationIssue[], path: string, message: string): undefined {
  issues.push({ path, message });
  return undefined;
}

/**
 * Builds a {@link Schema} from a parse function.
 *
 * @param typeName - Short name of the accepted value kind.
 * @param meta - What it accepts (frozen here).
 * @param parse - The validator.
 * @param refKind - Reference kind when the schema is a {@link s.ref}.
 * @returns The frozen schema.
 */
function define<T>(
  typeName: string,
  meta: SchemaMeta,
  parse: SchemaParse<T>,
  refKind: ContentRefKind | null = null,
): Schema<T> {
  return Object.freeze({ typeName, refKind, meta: Object.freeze(meta), parse });
}

/** The {@link SchemaMeta} of every {@link s.str}. */
const STRING_META: StringMeta = Object.freeze({ kind: 'string' });

/** The {@link SchemaMeta} of every {@link s.bool}. */
const BOOLEAN_META: BooleanMeta = Object.freeze({ kind: 'boolean' });

/** The {@link SchemaMeta} of every {@link s.ref}. */
const REF_META: RefMeta = Object.freeze({ kind: 'ref' });

/**
 * The {@link NumberMeta} of a number schema.
 *
 * @param integer - Whether it is an {@link s.int}.
 * @param options - Its bounds and unit.
 * @returns The (unfrozen) metadata.
 */
const numberMeta = (integer: boolean, options: RangeOptions): NumberMeta => ({
  kind: 'number',
  integer,
  unit: options.unit,
  min: options.min,
  max: options.max,
});

/**
 * Human-readable bound description appended to a number message.
 *
 * @param options - The bounds.
 * @returns `''`, ` >= 1`, ` <= 5` or ` in 1..5`.
 */
function rangeSuffix(options: RangeOptions): string {
  const { min, max } = options;
  if (min !== undefined && max !== undefined) return ' in ' + String(min) + '..' + String(max);
  if (min !== undefined) return ' >= ' + String(min);
  if (max !== undefined) return ' <= ' + String(max);
  return '';
}

/**
 * Tests a whole-value pattern. `lastIndex` is reset first, so a pattern written with the
 * `g` or `y` flag gives the same answer on every call instead of depending on the last one.
 *
 * @param pattern - The pattern.
 * @param value - The string to test.
 * @returns Whether `value` matches.
 */
function matches(pattern: RegExp, value: string): boolean {
  pattern.lastIndex = 0;
  return pattern.test(value);
}

/**
 * Plain (non-array, non-null) object test.
 *
 * @param value - Any parsed JSON value.
 * @returns `true` for a JSON object.
 */
const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * An integer, optionally bounded.
 *
 * @param options - Inclusive bounds, and the unit tools read from {@link SchemaMeta}.
 * @returns The schema.
 *
 * @example
 * ```ts
 * s.int({ min: 1 }).parse(0, 'hp', issues); // → undefined, issues: [{ path: 'hp', … }]
 * s.int({ min: 0, max: 600, unit: 'ticks' }); // a duration the ×1.5 port leaves alone
 * ```
 */
function int(options: RangeOptions = {}): Schema<number> {
  const message = 'must be an integer' + rangeSuffix(options);
  return define('integer', numberMeta(true, options), (value, path, issues) => {
    if (typeof value !== 'number' || !Number.isInteger(value)) return fail(issues, path, message);
    if (options.min !== undefined && value < options.min) return fail(issues, path, message);
    if (options.max !== undefined && value > options.max) return fail(issues, path, message);
    return value;
  });
}

/**
 * A finite number, optionally bounded.
 *
 * @param options - Inclusive bounds, and the unit tools read from {@link SchemaMeta}.
 * @returns The schema.
 */
function num(options: RangeOptions = {}): Schema<number> {
  const message = 'must be a finite number' + rangeSuffix(options);
  return define('number', numberMeta(false, options), (value, path, issues) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return fail(issues, path, message);
    if (options.min !== undefined && value < options.min) return fail(issues, path, message);
    if (options.max !== undefined && value > options.max) return fail(issues, path, message);
    return value;
  });
}

/**
 * A string. Empty strings are rejected unless `minLength: 0` is given.
 *
 * @param options - Length bounds and an optional pattern.
 * @returns The schema.
 */
function str(options: StringOptions = {}): Schema<string> {
  const minLength = options.minLength ?? 1;
  const { maxLength, pattern } = options;
  const lengths =
    minLength === 1 && maxLength === undefined
      ? 'must be a non-empty string'
      : 'must be a string of length' + rangeSuffix({ min: minLength, max: maxLength });
  const message = pattern === undefined ? lengths : lengths + ' matching ' + String(pattern);
  return define('string', STRING_META, (value, path, issues) => {
    if (typeof value !== 'string' || value.length < minLength) return fail(issues, path, message);
    if (maxLength !== undefined && value.length > maxLength) return fail(issues, path, message);
    if (pattern !== undefined && !matches(pattern, value)) return fail(issues, path, message);
    return value;
  });
}

/**
 * A boolean.
 *
 * @returns The schema.
 */
function bool(): Schema<boolean> {
  return define('boolean', BOOLEAN_META, (value, path, issues) =>
    typeof value === 'boolean' ? value : fail(issues, path, 'must be a boolean'),
  );
}

/**
 * One of a fixed set of string literals.
 *
 * @param values - Accepted values (order is used in the error message).
 * @returns The schema.
 *
 * @example
 * ```ts
 * const slot = s.enumOf(['main', 'missile'] as const); // Schema<'main' | 'missile'>
 * ```
 */
function enumOf<V extends string>(values: readonly V[]): Schema<V> {
  const message = 'must be one of: ' + values.join(', ');
  const meta: EnumMeta = { kind: 'enum', values };
  return define('enum', meta, (value, path, issues) =>
    typeof value === 'string' && (values as readonly string[]).indexOf(value) >= 0
      ? (value as V)
      : fail(issues, path, message),
  );
}

/**
 * An array of values of the same shape.
 *
 * @param item - Schema of one item.
 * @param options - Length bounds.
 * @returns The schema.
 * @throws TypeError when `item` is a {@link s.ref} — references are only resolved inside
 *   objects (the resolved index is written to a sibling field), so wrap the ref in an object.
 *
 * @remarks
 * Every item is validated even after one fails, so a single load reports all bad items;
 * the array itself is `undefined` if any item failed.
 */
function array<T>(item: Schema<T>, options: ArrayOptions = {}): Schema<T[]> {
  if (item.refKind !== null) {
    throw new TypeError('s.array(s.ref()) is unsupported: wrap the reference in an object');
  }
  const { min, max } = options;
  const meta: ArrayMeta = { kind: 'array', item, min, max };
  return define('array', meta, (value, path, issues, refs) => {
    if (!Array.isArray(value)) return fail(issues, path, 'must be an array');
    if (min !== undefined && value.length < min) {
      fail(issues, path, 'must have at least ' + String(min) + ' items');
      return undefined;
    }
    if (max !== undefined && value.length > max) {
      fail(issues, path, 'must have at most ' + String(max) + ' items');
      return undefined;
    }
    const out: T[] = [];
    let ok = true;
    for (let i = 0; i < value.length; i++) {
      const parsed = item.parse(value[i], path + '[' + String(i) + ']', issues, refs);
      if (parsed === undefined) ok = false;
      else out.push(parsed);
    }
    return ok ? out : undefined;
  });
}

/**
 * An object with a fixed set of fields. Unknown fields are reported (they are almost always
 * typos, and silently ignoring them hides content bugs).
 *
 * @param shape - Field name → schema.
 * @param options - Which fields may be missing, and which port together (`pairs`, tools only).
 * @returns The schema.
 *
 * @remarks
 * Fields declared with {@link s.ref} (also through {@link s.nullable}) record a
 * {@link RefSite} pointing at the parsed object, so the loader can write the resolved
 * numeric index into `<field>Id`. An *optional* reference that is absent records a site
 * with `id: null` too, so `<field>Id` is always present (`-1`).
 *
 * @example
 * ```ts
 * const box = s.object({ hw: s.int({ min: 1 }), hh: s.int({ min: 1 }) });
 * const enemy = s.object({ id: s.str(), hurtbox: box, drop: s.str() }, { optional: ['drop'] });
 * ```
 */
function object<S extends ObjectShape, O extends keyof S = never>(
  shape: S,
  options: ObjectOptions<O> = {},
): Schema<ObjectValue<S, NoInfer<O>>> {
  const keys = Object.keys(shape);
  const optionalKeys = (options.optional ?? NO_KEYS) as readonly string[];
  const optional = new Set<string>(optionalKeys);
  const meta: ObjectMeta =
    options.pairs === undefined
      ? { kind: 'object', shape, optional: optionalKeys }
      : {
          kind: 'object',
          shape,
          optional: optionalKeys,
          pairs: Object.freeze(options.pairs.slice()),
        };
  return define('object', meta, (value, path, issues, refs) => {
    if (!isPlainObject(value)) return fail(issues, path, 'must be an object');
    const out: Record<string, unknown> = {};
    let ok = true;
    for (const key of keys) {
      const child = shape[key];
      // `keys` comes from `shape`, so this is unreachable; it keeps TS's index signature happy.
      if (child === undefined) continue;
      const childPath = propPath(path, key);
      if (!hasOwn(value, key) || value[key] === undefined) {
        if (!optional.has(key)) {
          fail(issues, childPath, 'is required');
          ok = false;
        } else if (refs !== undefined && child.refKind !== null) {
          // An absent optional reference still gets its `<field>Id` (-1), so readers of
          // the resolved data always see a number.
          refs.push({ path: childPath, kind: child.refKind, id: null, container: out, field: key });
        }
        continue;
      }
      const parsed = child.parse(value[key], childPath, issues, refs);
      if (parsed === undefined) {
        ok = false;
        continue;
      }
      out[key] = parsed;
      if (refs !== undefined && child.refKind !== null) {
        refs.push({
          path: childPath,
          kind: child.refKind,
          id: typeof parsed === 'string' ? parsed : null,
          container: out,
          field: key,
        });
      }
    }
    for (const key of Object.keys(value)) {
      if (!hasOwn(shape, key)) {
        fail(issues, propPath(path, key), 'unknown field');
        ok = false;
      }
    }
    return ok ? (out as ObjectValue<S, NoInfer<O>>) : undefined;
  });
}

/**
 * An object used as a string-keyed map (e.g. a palette or a table of tunables).
 *
 * @param value - Schema of every entry.
 * @param keyPattern - Pattern every key must match; defaults to any non-empty key.
 *   `__proto__` is always rejected (assigning it would replace the result's prototype
 *   instead of adding an entry).
 * @returns The schema.
 * @throws TypeError when `value` is a {@link s.ref} — like {@link s.array}, a map of bare
 *   references has nowhere to put the resolved ids; wrap the reference in an object.
 */
function record<T>(value: Schema<T>, keyPattern?: RegExp): Schema<Record<string, T>> {
  if (value.refKind !== null) {
    throw new TypeError('s.record(s.ref()) is unsupported: wrap the reference in an object');
  }
  const keyMessage =
    keyPattern === undefined
      ? 'is not a valid key'
      : 'is not a valid key (must match ' + String(keyPattern) + ')';
  const meta: RecordMeta = { kind: 'record', value };
  return define('record', meta, (input, path, issues, refs) => {
    if (!isPlainObject(input)) return fail(issues, path, 'must be an object');
    const out: Record<string, T> = {};
    let ok = true;
    for (const key of Object.keys(input)) {
      const entryPath = propPath(path, key);
      if (
        key === '' ||
        key === '__proto__' ||
        (keyPattern !== undefined && !matches(keyPattern, key))
      ) {
        fail(issues, entryPath, keyMessage);
        ok = false;
        continue;
      }
      const parsed = value.parse(input[key], entryPath, issues, refs);
      if (parsed === undefined) ok = false;
      else out[key] = parsed;
    }
    return ok ? out : undefined;
  });
}

/**
 * Accepts `null` in addition to `inner`.
 *
 * @param inner - Schema of the non-null case.
 * @returns The schema; a nullable {@link s.ref} still records a {@link RefSite} (with
 *   `id: null`), so the loader writes `-1` into `<field>Id`.
 */
function nullable<T>(inner: Schema<T>): Schema<T | null> {
  return define<T | null>(
    inner.typeName + ' or null',
    { kind: 'nullable', inner },
    (value, path, issues, refs) => (value === null ? null : inner.parse(value, path, issues, refs)),
    inner.refKind,
  );
}

/**
 * A string id pointing at another content item (see {@link ContentRefKind}).
 *
 * @param kind - What the id points at.
 * @returns The schema; parsing keeps the string, the loader adds the numeric `<field>Id`.
 */
function ref(kind: ContentRefKind): Schema<string> {
  const message = 'must be a non-empty ' + kind + ' id';
  return define<string>(
    kind + ' ref',
    REF_META,
    (value, path, issues) =>
      typeof value === 'string' && value.length > 0 ? value : fail(issues, path, message),
    kind,
  );
}

/**
 * A discriminated union: the value of `tagField` selects the variant schema.
 *
 * @param tagField - Name of the discriminating field (e.g. `type`).
 * @param variants - Tag value → variant schema. Each variant must declare the tag field
 *   itself (`type: s.enumOf(['spawn'])`), otherwise it is reported as an unknown field.
 * @returns The schema.
 *
 * @example
 * ```ts
 * const event = s.oneOf('type', {
 *   spawn: s.object({ type: s.enumOf(['spawn'] as const), enemy: s.ref('enemy') }),
 *   boss: s.object({ type: s.enumOf(['boss'] as const), enemy: s.ref('enemy') }),
 * });
 * ```
 */
function oneOf<V extends Record<string, Schema<unknown>>>(
  tagField: string,
  variants: V,
): Schema<Infer<V[keyof V]>> {
  const tags = Object.keys(variants);
  const message = tagField + ' must be one of: ' + tags.join(', ');
  const meta: UnionMeta = { kind: 'union', tag: tagField, variants };
  return define('union', meta, (value, path, issues, refs) => {
    if (!isPlainObject(value)) return fail(issues, path, 'must be an object');
    const tag = value[tagField];
    if (typeof tag !== 'string' || !hasOwn(variants, tag)) {
      return fail(issues, propPath(path, tagField), message);
    }
    const variant = variants[tag] as Schema<Infer<V[keyof V]>>;
    return variant.parse(value, path, issues, refs);
  });
}

/**
 * A hand-made schema: a parse function of its own, with the {@link SchemaMeta} that tells a
 * walker what it accepts (the bullet-pattern DSL's expressions, speeds and nested node lists, a
 * demo's opaque game config).
 *
 * @param typeName - Short name of the accepted value kind, for messages and debugging.
 * @param parse - The validator (same contract as {@link Schema.parse}: never throws, appends
 *   every problem to `issues`, returns `undefined` on failure).
 * @param meta - What it accepts — usually an {@link ExprMeta}, {@link AnyOfMeta},
 *   {@link LazyMeta} or {@link OpaqueMeta}; frozen here.
 * @returns The frozen schema (never a reference: its {@link Schema.refKind} is `null`).
 *
 * @example
 * ```ts
 * const anyObject = s.custom<object>(
 *   'object',
 *   (value, path, issues) => {
 *     if (typeof value === 'object' && value !== null) return value;
 *     issues.push({ path, message: 'must be an object' });
 *     return undefined;
 *   },
 *   { kind: 'opaque' },
 * );
 * ```
 */
function custom<T>(typeName: string, parse: SchemaParse<T>, meta: SchemaMeta): Schema<T> {
  return define(typeName, meta, parse);
}

/**
 * The schema combinators (decision D28: in-house, no runtime dependency).
 *
 * @remarks
 * | Combinator | Accepts | Failure message |
 * |---|---|---|
 * | `int({min,max,unit})` | an integer in bounds | `must be an integer in 1..5` |
 * | `num({min,max,unit})` | a finite number in bounds | `must be a finite number >= 0` |
 * | `str(options)` | a string, non-empty by default | `must be a non-empty string` |
 * | `bool()` | `true` / `false` | `must be a boolean` |
 * | `enumOf(values)` | one of the literals | `must be one of: a, b` |
 * | `array(item,{min,max})` | `item`s | `must be an array`, `must have at most 4 items` |
 * | `object(shape,{optional})` | exactly the declared fields | `is required`, `unknown field` |
 * | `record(value,keyPattern?)` | a string-keyed map of `value` | `is not a valid key` |
 * | `nullable(inner)` | `null` or `inner` | (the inner message) |
 * | `ref(kind)` | a non-empty id string; the loader resolves it | `must be a non-empty enemy id` |
 * | `oneOf(tag,variants)` | the variant named by the tag field | `type must be one of: …` |
 * | `custom(typeName,parse,meta)` | whatever `parse` accepts | (its own) |
 *
 * Every schema is frozen and keeps no state between calls (pattern `lastIndex` is reset),
 * so one instance can be shared by any number of parents. Build schemas once at module
 * load, never per call. Each carries its {@link SchemaMeta} (`schema.meta`) for walkers; a
 * number's `unit` (`data/units` {@link NumberUnit}) lives only there.
 *
 * @example
 * ```ts
 * const issues: ValidationIssue[] = [];
 * const file = s.object({ formatVersion: s.int({ min: 1, max: 1 }), ships: s.array(SHIP) });
 * const parsed = file.parse(json, '', issues);
 * ```
 */
export const s = Object.freeze({
  int,
  num,
  str,
  bool,
  enumOf,
  array,
  object,
  record,
  nullable,
  ref,
  oneOf,
  custom,
});
