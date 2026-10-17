/**
 * The schemas' metadata and the content units (plan_resolution.md R1-03): every combinator of `s`
 * describes what it accepts in `schema.meta` (a number's unit included) without changing what it
 * parses; `s.custom` builds a hand-made schema with metadata; `data/units` lists a schema's
 * numeric fields, walks a document's numbers with their fields, and ports a number by its unit's
 * rule — §2.6's examples and the identity at factor 1. `data/units` is tooling: no game code
 * imports it at runtime.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as core from '../../src/index.js';
import { s, type Schema, type SchemaMeta, type ValidationIssue } from '../../src/data/schema.js';
import {
  NUMBER_UNITS,
  UNIT_RULES,
  edgeAnchor,
  listNumberFields,
  rescaleNumber,
  walkNumbers,
  type NumberLeaf,
  type NumberUnit,
  type RescaleOptions,
} from '../../src/data/units.js';

/** Fresh issue collector. */
const collector = (): ValidationIssue[] => [];

/**
 * A schema's metadata.
 *
 * @param schema - The schema.
 * @returns Its metadata.
 */
const metaOf = (schema: Schema<unknown>): SchemaMeta => schema.meta;

/** The v1 → v2 port (plan §2.6 / §2.7). */
const V2: RescaleOptions = {
  factor: 1.5,
  topPad: 36,
  fromWidth: 384,
  fromHeight: 200,
  toWidth: 640,
  toHeight: 336,
  tileSize: 8,
};

/** The identity: factor 1, no pad, the same playfield. */
const SAME: RescaleOptions = {
  factor: 1,
  topPad: 0,
  fromWidth: 384,
  fromHeight: 200,
  toWidth: 384,
  toHeight: 200,
  tileSize: 8,
};

describe('core/data schema metadata', () => {
  it('describes a number: integer or not, its unit and its bounds', () => {
    expect(metaOf(s.int({ min: 1, max: 5, unit: 'count' }))).toEqual({
      kind: 'number',
      integer: true,
      unit: 'count',
      min: 1,
      max: 5,
    });
    expect(metaOf(s.num({ min: 0, unit: 'px-per-tick' }))).toEqual({
      kind: 'number',
      integer: false,
      unit: 'px-per-tick',
      min: 0,
      max: undefined,
    });
    expect(metaOf(s.num())).toEqual({
      kind: 'number',
      integer: false,
      unit: undefined,
      min: undefined,
      max: undefined,
    });
  });

  it('a unit changes neither what a number accepts nor its messages', () => {
    for (const [plain, withUnit] of [
      [s.int({ min: 1, max: 5 }), s.int({ min: 1, max: 5, unit: 'ticks' })],
      [s.num({ min: -16, max: 16 }), s.num({ min: -16, max: 16, unit: 'px-per-tick' })],
    ] as const) {
      expect(withUnit.typeName).toBe(plain.typeName);
      for (const value of [-20, 0, 1, 2.5, 5, 6, '3', null]) {
        const a = collector();
        const b = collector();
        expect(withUnit.parse(value, 'x', b)).toBe(plain.parse(value, 'x', a));
        expect(b).toEqual(a);
      }
    }
  });

  it('describes the leaves: strings, booleans, enums and references', () => {
    expect(metaOf(s.str({ maxLength: 4 }))).toEqual({ kind: 'string' });
    expect(metaOf(s.bool())).toEqual({ kind: 'boolean' });
    expect(metaOf(s.enumOf(['main', 'sub']))).toEqual({ kind: 'enum', values: ['main', 'sub'] });
    const ref = s.ref('enemy');
    expect(metaOf(ref)).toEqual({ kind: 'ref' });
    expect(ref.refKind).toBe('enemy');
  });

  it('names the children of the containers (the schemas the parser uses)', () => {
    const item = s.int({ unit: 'count' });
    expect(metaOf(s.array(item, { min: 1, max: 4 }))).toEqual({
      kind: 'array',
      item,
      min: 1,
      max: 4,
    });
    const shape = { a: s.num({ unit: 'ratio' }), b: s.str() };
    const object = s.object(shape, { optional: ['b'] });
    const objectMeta = metaOf(object);
    expect(objectMeta).toEqual({ kind: 'object', shape, optional: ['b'] });
    if (objectMeta.kind !== 'object') throw new Error('object');
    expect(objectMeta.shape).toBe(shape);
    expect(metaOf(s.object({ a: item }))).toEqual({
      kind: 'object',
      shape: { a: item },
      optional: [],
    });
    expect(metaOf(s.record(item))).toEqual({ kind: 'record', value: item });
    expect(metaOf(s.nullable(item))).toEqual({ kind: 'nullable', inner: item });
    const variants = { a: s.object({ type: s.enumOf(['a'] as const) }) };
    expect(metaOf(s.oneOf('type', variants))).toEqual({ kind: 'union', tag: 'type', variants });
  });

  it('keeps a nullable reference a reference', () => {
    const schema = s.nullable(s.ref('sprite'));
    expect(schema.refKind).toBe('sprite');
    expect(metaOf(schema).kind).toBe('nullable');
  });

  it('freezes every schema and its metadata', () => {
    for (const schema of [
      s.int(),
      s.num({ unit: 'world-px' }),
      s.str(),
      s.bool(),
      s.enumOf(['a']),
      s.array(s.int()),
      s.object({}),
      s.record(s.int()),
      s.nullable(s.int()),
      s.ref('sprite'),
      s.oneOf('type', {}),
      s.custom<number>('n', () => 1, { kind: 'expr', unit: 'ticks' }),
    ]) {
      expect(Object.isFrozen(schema), schema.typeName).toBe(true);
      expect(Object.isFrozen(schema.meta), schema.typeName).toBe(true);
    }
  });

  it('builds a hand-made schema with s.custom', () => {
    const issues = collector();
    const even = s.custom<number>(
      'even',
      (value, path, found) => {
        if (typeof value === 'number' && value % 2 === 0) return value;
        found.push({ path, message: 'must be even' });
        return undefined;
      },
      { kind: 'expr', unit: 'count' },
    );
    expect(even.typeName).toBe('even');
    expect(even.refKind).toBeNull();
    expect(even.meta).toEqual({ kind: 'expr', unit: 'count' });
    expect(even.parse(4, 'n', issues)).toBe(4);
    expect(even.parse(3, 'n', issues)).toBeUndefined();
    expect(issues).toEqual([{ path: 'n', message: 'must be even' }]);
    // A hand-made schema works inside the combinators like any other.
    expect(s.array(even).parse([2, 6], '', collector())).toEqual([2, 6]);
  });
});

describe('core/data units', () => {
  it('lists every unit of the plan and of owner decisions O1 / O2 / O5 once, each with a rule', () => {
    expect(new Set(NUMBER_UNITS).size).toBe(NUMBER_UNITS.length);
    const planned: NumberUnit[] = [
      // R1-03's list
      'world-px',
      'world-x',
      'world-y',
      'rel-px',
      'px-per-tick',
      'px-per-tick2',
      'screen-x',
      'screen-y',
      'tile-rows',
      'ticks',
      'angle',
      'count',
      'score',
      'ratio',
      // O1: audio
      'hz',
      'seconds',
      'semitones',
      'samples',
      // O2
      'seed',
      'version',
      'index',
      'texels',
      'tile-px',
      // O5 and the DSL's `$1` … `$9`
      'param',
      'inherit',
    ];
    expect([...NUMBER_UNITS].sort()).toEqual([...planned].sort());
    expect(Object.keys(UNIT_RULES).sort()).toEqual([...NUMBER_UNITS].sort());
    expect(Object.isFrozen(NUMBER_UNITS)).toBe(true);
    expect(Object.isFrozen(UNIT_RULES)).toBe(true);
  });

  it('gives each unit the rule of plan §2.6', () => {
    const byRule: Record<string, string[]> = {};
    for (const unit of NUMBER_UNITS) (byRule[UNIT_RULES[unit]] ??= []).push(unit);
    expect(byRule).toEqual({
      scale: ['world-px', 'world-x', 'rel-px', 'px-per-tick', 'px-per-tick2', 'texels'],
      'world-y': ['world-y'],
      'edge-x': ['screen-x'],
      'edge-y': ['screen-y'],
      'tile-rows': ['tile-rows'],
      resample: ['tile-px'],
      keep: [
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
      ],
      lookup: ['param', 'inherit'],
    });
  });

  it('snaps an edge-anchored value to the nearest of start, centre and end (owner decision O3)', () => {
    expect(edgeAnchor(-20, 384)).toBe('start');
    expect(edgeAnchor(0, 384)).toBe('start');
    expect(edgeAnchor(95, 384)).toBe('start');
    // As near the centre as an edge: the centre.
    expect(edgeAnchor(96, 384)).toBe('centre');
    expect(edgeAnchor(192, 384)).toBe('centre');
    expect(edgeAnchor(288, 384)).toBe('centre');
    expect(edgeAnchor(289, 384)).toBe('end');
    expect(edgeAnchor(400, 384)).toBe('end');
    expect(edgeAnchor(100, 200)).toBe('centre');
    expect(edgeAnchor(200, 200)).toBe('end');
  });

  it('reproduces plan §2.6 at ×1.5 with the 36-px top pad', () => {
    // Spawn x 400 = the right edge + 16 → PLAYFIELD_W + 24.
    expect(rescaleNumber('screen-x', 400, V2)).toBe(664);
    // The boss's default x 296 = right edge − 88 → W − 132; its y 100 = the playfield's centre.
    expect(rescaleNumber('screen-x', 296, V2)).toBe(508);
    expect(rescaleNumber('screen-y', 100, V2)).toBe(168);
    // The Mode-7 floor's bottom 200 = the bottom edge; zone D's camera yTo 200 = one playfield.
    expect(rescaleNumber('screen-y', 200, V2)).toBe(336);
    expect(rescaleNumber('screen-x', -16, V2)).toBe(-24);
    // Absolute y: 1.5·y + 36, continuous at the bottom edge; above the top edge only ×1.5.
    expect(rescaleNumber('world-y', 0, V2)).toBe(36);
    expect(rescaleNumber('world-y', 100, V2)).toBe(186);
    expect(rescaleNumber('world-y', 200, V2)).toBe(336);
    expect(rescaleNumber('world-y', -20, V2)).toBe(-30);
    // A playfield of rows: 25 → 28 (3 rows inserted at the top).
    expect(rescaleNumber('tile-rows', 25, V2)).toBe(28);
    // World values ×1.5.
    expect(rescaleNumber('world-x', 9000, V2)).toBe(13500);
    expect(rescaleNumber('world-px', 1.5, V2)).toBe(2.25);
    expect(rescaleNumber('rel-px', -12, V2)).toBe(-18);
    expect(rescaleNumber('px-per-tick', 2, V2)).toBe(3);
    expect(rescaleNumber('px-per-tick2', 0.25, V2)).toBe(0.375);
    expect(rescaleNumber('texels', 64, V2)).toBe(96);
    expect(rescaleNumber('tile-px', 8, V2)).toBe(12);
    // Times, angles, counts and scores do not change.
    for (const unit of ['ticks', 'angle', 'count', 'score', 'ratio', 'hz', 'seed'] as const) {
      expect(rescaleNumber(unit, 37, V2)).toBe(37);
    }
  });

  it('is the identity at factor 1 on the same playfield', () => {
    const values = [-128, -20, -0.5, 0, 0.25, 7.5, 95, 96, 100, 191.5, 200, 296, 383.3, 400, 9000];
    for (const unit of NUMBER_UNITS) {
      if (UNIT_RULES[unit] === 'lookup') continue;
      for (const value of values) expect(rescaleNumber(unit, value, SAME), unit).toBe(value);
    }
  });

  it('refuses a unit that must be looked up first', () => {
    expect(() => rescaleNumber('param', 1, V2)).toThrow(RangeError);
    expect(() => rescaleNumber('inherit', 1, V2)).toThrow(/resolve it first/);
  });
});

/** A small document schema exercising every kind of metadata. */
const NODE: Schema<unknown> = s.oneOf('op', {
  wait: s.object({ op: s.enumOf(['wait'] as const), ticks: s.int({ unit: 'ticks' }) }),
  repeat: s.object({
    op: s.enumOf(['repeat'] as const),
    times: s.custom<number | string>('expression', (value) => value as number, {
      kind: 'expr',
      unit: 'count',
    }),
    body: s.custom<unknown[]>('array', (value) => value as unknown[], {
      kind: 'lazy',
      target: () => NODES,
    }),
  }),
});
const NODES = s.array(NODE);
const SPEED = s.custom<unknown>('speed', (value) => value, {
  kind: 'anyOf',
  options: [
    s.num({ unit: 'px-per-tick' }),
    s.object({ type: s.enumOf(['relative'] as const), value: s.num({ unit: 'px-per-tick' }) }),
  ],
});
const OPAQUE = s.custom<unknown>('object', (value) => value, { kind: 'opaque' });
const DOC = s.object(
  {
    id: s.str(),
    x: s.num({ unit: 'world-x' }),
    points: s.array(s.object({ x: s.num({ unit: 'rel-px' }), y: s.num() })),
    params: s.record(s.num({ unit: 'param' })),
    target: s.nullable(s.object({ y: s.int({ unit: 'world-y' }) })),
    speed: SPEED,
    body: NODES,
    config: OPAQUE,
  },
  { optional: ['target', 'config'] },
);

describe('core/data units: the walkers', () => {
  it('lists every numeric field with its unit, entering a recursive schema once', () => {
    const { fields, opaque } = listNumberFields(DOC);
    expect(fields.map((field) => [field.path, field.unit ?? '-', field.integer])).toEqual([
      ['x', 'world-x', false],
      ['points[].x', 'rel-px', false],
      ['points[].y', '-', false],
      ['params.*', 'param', false],
      ['target.y', 'world-y', true],
      ['speed|0', 'px-per-tick', false],
      ['speed|1.value', 'px-per-tick', false],
      ['body[]<op=wait>.ticks', 'ticks', true],
      ['body[]<op=repeat>.times', 'count', false],
    ]);
    expect(fields.find((field) => field.path === 'body[]<op=repeat>.times')?.expression).toBe(true);
    expect(opaque).toEqual(['config']);
  });

  it('reports every opaque value it meets, item by item', () => {
    const list = s.array(OPAQUE);
    expect(listNumberFields(list).opaque).toEqual(['[]']);
    expect(walkNumbers(list, [{}, {}], () => undefined)).toEqual([
      { path: '[0]', reason: 'opaque' },
      { path: '[1]', reason: 'opaque' },
    ]);
  });

  it('visits every number of a document with its field, its holder and its parents', () => {
    const doc = {
      id: 'd',
      x: 100,
      points: [
        { x: 1, y: 2 },
        { x: -3, y: 4 },
      ],
      params: { amp: 8, period: 60 },
      target: null,
      speed: { type: 'relative', value: 2 },
      body: [
        { op: 'repeat', times: '$rank * 2', body: [{ op: 'wait', ticks: 30 }] },
        { op: 'wait', ticks: 5 },
      ],
      config: { internalWidth: 384 },
    };
    const leaves: NumberLeaf[] = [];
    const skipped = walkNumbers(DOC, doc, (leaf) => leaves.push(leaf));
    expect(leaves.map((leaf) => [leaf.path, leaf.field, leaf.unit ?? '-', leaf.value])).toEqual([
      ['x', 'x', 'world-x', 100],
      ['points[0].x', 'points[].x', 'rel-px', 1],
      ['points[0].y', 'points[].y', '-', 2],
      ['points[1].x', 'points[].x', 'rel-px', -3],
      ['points[1].y', 'points[].y', '-', 4],
      ['params.amp', 'params.*', 'param', 8],
      ['params.period', 'params.*', 'param', 60],
      ['speed.value', 'speed|1.value', 'px-per-tick', 2],
      ['body[0].times', 'body[]<op=repeat>.times', 'count', '$rank * 2'],
      ['body[0].body[0].ticks', 'body[]<op=repeat>.body[]<op=wait>.ticks', 'ticks', 30],
      ['body[1].ticks', 'body[]<op=wait>.ticks', 'ticks', 5],
    ]);
    expect(skipped).toEqual([{ path: 'config', reason: 'opaque' }]);
    const amp = leaves[5];
    expect(amp?.container).toBe(doc.params);
    expect(amp?.key).toBe('amp');
    // The owner of a tunable is the value before its record.
    expect(amp?.parents).toEqual([doc, doc.params]);
    const second = leaves[3];
    expect(second?.container).toBe(doc.points[1]);
    expect(second?.parents).toEqual([doc, doc.points, doc.points[1]]);
    expect(leaves[9]?.integer).toBe(true);
    expect(leaves[8]?.expression).toBe(true);
  });

  it('lets the visitor write a ported value back', () => {
    const doc = { id: 'd', x: 100, points: [{ x: 2, y: 0 }], params: {}, speed: 1, body: [] };
    walkNumbers(DOC, doc, (leaf) => {
      if (leaf.unit === undefined || UNIT_RULES[leaf.unit] === 'lookup') return;
      if (typeof leaf.value !== 'number' || leaf.container === null) return;
      (leaf.container as Record<string, unknown>)[leaf.key] = rescaleNumber(
        leaf.unit,
        leaf.value,
        V2,
      );
    });
    expect(doc).toEqual({
      id: 'd',
      x: 150,
      points: [{ x: 3, y: 0 }],
      params: {},
      speed: 1.5,
      body: [],
    });
  });

  it('skips what does not fit the schema, naming why', () => {
    const doc = {
      id: 'd',
      x: 'far',
      points: {},
      params: [],
      speed: 'fast',
      body: [{ op: 'jump' }, 3],
    };
    expect(walkNumbers(DOC, doc, () => undefined)).toEqual([
      { path: 'x', reason: 'mismatch' },
      { path: 'points', reason: 'mismatch' },
      { path: 'params', reason: 'mismatch' },
      { path: 'speed', reason: 'variant' },
      { path: 'body[0]', reason: 'variant' },
      { path: 'body[1]', reason: 'variant' },
    ]);
  });

  it('visits a document that is itself a number', () => {
    const leaves: NumberLeaf[] = [];
    walkNumbers(s.int({ unit: 'count' }), 3, (leaf) => leaves.push(leaf));
    expect(leaves.map((leaf) => [leaf.path, leaf.container, leaf.value])).toEqual([['', null, 3]]);
  });
});

describe('core/data units: tooling only', () => {
  it('re-exports the metadata API and the units from the package entry', () => {
    expect(core.s.custom).toBe(s.custom);
    expect(core.NUMBER_UNITS).toBe(NUMBER_UNITS);
    expect(core.UNIT_RULES).toBe(UNIT_RULES);
    expect(core.edgeAnchor).toBe(edgeAnchor);
    expect(core.listNumberFields).toBe(listNumberFields);
    expect(core.rescaleNumber).toBe(rescaleNumber);
    expect(core.walkNumbers).toBe(walkNumbers);
  });

  it('is imported at runtime by nothing but the package entry (so app bundles drop it)', () => {
    const src = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src');
    /**
     * Every `.ts` file below a directory.
     *
     * @param dir - Absolute directory.
     * @returns The files.
     */
    const files = (dir: string): string[] =>
      readdirSync(dir).flatMap((entry) => {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) return files(path);
        return path.endsWith('.ts') ? [path] : [];
      });
    const importers: string[] = [];
    for (const file of files(src)) {
      const text = readFileSync(file, 'utf8');
      for (const match of text.matchAll(
        /^(import|export)\s+(type\s+)?[^;]*?from\s+'([^']+)';/gms,
      )) {
        const target = match[3] ?? '';
        if (!/(^|\/)units\.js$/.test(target) || match[2] !== undefined) continue;
        const resolved = relative(src, join(dirname(file), target));
        if (resolved === join('data', 'units.js')) importers.push(relative(src, file));
      }
    }
    expect(importers).toEqual(['index.ts']);
  });
});
