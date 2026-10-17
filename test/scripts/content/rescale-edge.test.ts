/**
 * `scripts/content/rescale.mjs` at its edges: the argument parser, the geometry it refuses, the
 * position-keeping JSON editor, expression scaling, raster band rounding, and every way a value
 * stays unclassified (no unit, a tunable without a unit table, a rule an expression cannot take,
 * an opaque schema) or a file is refused (not JSON, no schema, invalid, another tile size) — and
 * that a refused port writes nothing.
 */
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as core from '@shmup/core';
import { s, type Schema } from '@shmup/core';
import * as audio from '@shmup/audio-web';
import * as input from '@shmup/input-web';
import { FX_FILE_SCHEMA } from '@shmup/render-pixi';
import { afterAll, describe, expect, it } from 'vitest';
import {
  RescaleError,
  formatRescaleReport,
  jsonSpans,
  modulesFrom,
  parseRescaleArgs,
  planRescale,
  replaceJsonValues,
  rescaleContent,
  rescaleGeometry,
  scaleExpression,
  spreadBands,
  type RescaleGeometry,
  type RescaleModules,
} from '../../../scripts/content/rescale.mjs';
import { readContentFiles } from '../../../vite.shared.js';

const here = dirname(fileURLToPath(import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'shmup-rescale-edge-'));

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

/** The fixtures' geometry (`fixtures/rescale/geometry.json`). */
const GEOMETRY = JSON.parse(
  readFileSync(join(here, 'fixtures', 'rescale', 'geometry.json'), 'utf8'),
) as {
  frame: RescaleModules['frame'];
  port: { factor: number; topPad: number; toWidth: number; toHeight: number; toTileSize: number };
};
const FRAME = GEOMETRY.frame;

/**
 * Validates anything (a hand-made test schema).
 *
 * @param value - The value.
 * @returns It.
 */
const anything = (value: unknown): unknown => value;

/** Test kinds: a number without a unit, screen-x and world-px expressions, an opaque value. */
const FAKE_SCHEMAS: Record<string, Schema<unknown>> = {
  'fake-plain': s.object({ kind: s.str(), n: s.num() }),
  'fake-int': s.object({ kind: s.str(), n: s.int({ unit: 'world-px' }) }),
  'fake-y': s.object({ kind: s.str(), y: s.num({ unit: 'world-y' }) }),
  'fake-edge-expr': s.object({
    kind: s.str(),
    e: s.custom('expression', anything, { kind: 'expr', unit: 'screen-x' }),
  }),
  'fake-px-expr': s.object({
    kind: s.str(),
    e: s.custom('expression', anything, { kind: 'expr', unit: 'world-px' }),
  }),
  'fake-opaque': s.object({ kind: s.str(), o: s.custom('blob', anything, { kind: 'opaque' }) }),
};

/** The real packages plus the test kinds, with the fixtures' frame. */
const MODULES: RescaleModules = (() => {
  const real = modulesFrom(core, { audio, input, particles: { FX_FILE_SCHEMA } }, readContentFiles);
  return { ...real, schemas: { ...real.schemas, ...FAKE_SCHEMAS }, frame: FRAME };
})();

/** The fixtures' ×1.5 / 36 geometry. */
const V2: RescaleGeometry = rescaleGeometry(
  {
    factor: GEOMETRY.port.factor,
    topPad: GEOMETRY.port.topPad,
    fromWidth: null,
    fromHeight: null,
    tileSize: null,
    toWidth: null,
  },
  FRAME,
);

/**
 * A file of the plan.
 *
 * @param path - Its path below the content root.
 * @param data - Its JSON (or text).
 * @returns The input file.
 */
const file = (path: string, data: unknown) => ({
  path,
  text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) + '\n',
});

/** A valid enemy whose tunables are named by `params`. */
const enemy = (params: Record<string, number>, script = 'drifter.sine') => ({
  formatVersion: 1,
  kind: 'enemies',
  enemies: [
    {
      id: 'e',
      hp: 1,
      score: 0,
      hurtbox: { hw: 2, hh: 2 },
      script,
      sprite: 'enemies/drifter',
      params,
      drop: null,
    },
  ],
});

describe('rescale: arguments', () => {
  it('parses every option', () => {
    const options = parseRescaleArgs([
      '--factor',
      '1.5',
      '--top-pad',
      '36',
      '--dry-run',
      '--root',
      'content',
      '--no-examples',
      '--from-width',
      '10',
      '--from-height',
      '20',
      '--tile-size',
      '4',
      '--to-width',
      '30',
      '--json',
      '--quiet',
    ]);
    expect(options).toMatchObject({
      factor: 1.5,
      topPad: 36,
      dryRun: true,
      examples: false,
      fromWidth: 10,
      fromHeight: 20,
      tileSize: 4,
      toWidth: 30,
      json: true,
      quiet: true,
    });
    expect(options.root.endsWith('content')).toBe(true);
    expect(parseRescaleArgs(['--factor', '2'])).toMatchObject({ topPad: 0, dryRun: false });
  });

  it('refuses what it cannot run, with exit code 2', () => {
    const cases: [string[], RegExp][] = [
      [[], /--factor K is required/],
      [['--factor'], /--factor needs a number/],
      [['--factor', 'x'], /--factor needs a number/],
      [['--factor', '0'], /--factor must be > 0/],
      [['--factor', '1', '--top-pad', '-1'], /--top-pad must be >= 0/],
      [['--factor', '1', '--root'], /--root needs a directory/],
      [['--factor', '1', '--wat'], /unknown option --wat/],
    ];
    for (const [argv, message] of cases) {
      let error: unknown;
      try {
        parseRescaleArgs(argv);
      } catch (caught) {
        error = caught;
      }
      expect(error, argv.join(' ')).toBeInstanceOf(RescaleError);
      expect((error as RescaleError).message).toMatch(message);
      expect((error as RescaleError).exitCode).toBe(2);
    }
  });
});

describe('rescale: geometry', () => {
  it('derives the v2 playfield from the v1 frame (aspect kept, HUD bars ×k)', () => {
    expect(V2).toEqual({
      factor: GEOMETRY.port.factor,
      topPad: GEOMETRY.port.topPad,
      fromWidth: FRAME.playfieldW,
      fromHeight: FRAME.playfieldH,
      toWidth: GEOMETRY.port.toWidth,
      toHeight: GEOMETRY.port.toHeight,
      tileSize: FRAME.tileSize,
      toTileSize: GEOMETRY.port.toTileSize,
      padRows: 3,
    });
  });

  it('is the identity at factor 1 with no pad', () => {
    const g = rescaleGeometry(
      { factor: 1, topPad: 0, fromWidth: null, fromHeight: null, tileSize: null, toWidth: null },
      FRAME,
    );
    expect([g.toWidth, g.toHeight, g.toTileSize, g.padRows]).toEqual([
      FRAME.playfieldW,
      FRAME.playfieldH,
      FRAME.tileSize,
      0,
    ]);
  });

  it('refuses fractional tiles and pads that are not whole tile rows', () => {
    const base = { fromWidth: null, fromHeight: null, tileSize: null, toWidth: null };
    expect(() => rescaleGeometry({ ...base, factor: 1.1, topPad: 0 }, FRAME)).toThrow(
      /not a whole number of pixels/,
    );
    expect(() => rescaleGeometry({ ...base, factor: 1.5, topPad: 30 }, FRAME)).toThrow(
      /not a whole number of 12-px tile rows/,
    );
  });

  it('wants the whole old geometry once the tile size is not core’s (after R2-01)', () => {
    const stale = { factor: 1.5, topPad: 36, fromWidth: null, fromHeight: null, toWidth: null };
    expect(() => rescaleGeometry({ ...stale, tileSize: FRAME.tileSize * 2 }, FRAME)).toThrow(
      /pass --from-width, --from-height and --to-width too/,
    );
    const given = rescaleGeometry(
      { factor: 1, topPad: 0, fromWidth: 50, fromHeight: 40, tileSize: 4, toWidth: 60 },
      FRAME,
    );
    expect([given.fromWidth, given.fromHeight, given.tileSize, given.toWidth]).toEqual([
      50, 40, 4, 60,
    ]);
  });
});

describe('rescale: the JSON editor', () => {
  it('replaces values in place and leaves every other character alone', () => {
    const text = '{\n  "a": [1,   2.5],\n  "b\\"c": { "d": -3e2, "s": "x\\"y" }\n}\n';
    const out = replaceJsonValues(text, [
      { keys: ['a', 1], value: 3.75 },
      { keys: ['b"c', 'd'], value: 1 },
      { keys: ['b"c', 's'], value: 'q' },
    ]);
    expect(out).toBe('{\n  "a": [1,   3.75],\n  "b\\"c": { "d": 1, "s": "q" }\n}\n');
    expect(JSON.parse(out)).toEqual({ a: [1, 3.75], 'b"c': { d: 1, s: 'q' } });
    expect(replaceJsonValues('[1, [2]]', [{ keys: [1], value: [2, 3] }])).toBe('[1, [2,3]]');
  });

  it('finds the source span of every value', () => {
    const text = ' { "k": [ true, null, {} ] } ';
    const root = jsonSpans(text);
    expect([root.start, root.end]).toEqual([1, 28]);
    const list = root.children?.get('k');
    expect(text.slice(list?.start, list?.end)).toBe('[ true, null, {} ]');
    expect(list?.children?.size).toBe(3);
  });

  it('refuses bad JSON, missing paths and overlapping replacements', () => {
    for (const bad of ['{"a": 1,}', '{"a": "x', '[1] 2', '{"a" 1}', '[01]', '']) {
      expect(() => jsonSpans(bad), bad).toThrow(SyntaxError);
    }
    expect(() => replaceJsonValues('{"a": 1}', [{ keys: ['b'], value: 1 }])).toThrow(RangeError);
    expect(() => replaceJsonValues('{"a": 1}', [{ keys: ['a', 0], value: 1 }])).toThrow(RangeError);
    expect(() =>
      replaceJsonValues('{"a": [1]}', [
        { keys: ['a'], value: [] },
        { keys: ['a', 0], value: 2 },
      ]),
    ).toThrow(/overlap/);
  });
});

describe('rescale: expressions and bands', () => {
  it('scales an expression string: a literal stays a literal, anything else is wrapped', () => {
    expect(scaleExpression('1 + $rank', 1)).toBe('1 + $rank');
    expect(scaleExpression('2', 1.5)).toBe('3');
    expect(scaleExpression(' -0.5 ', 1.5)).toBe('-0.75');
    expect(scaleExpression('0.1', 1.5)).toBe('0.15');
    expect(scaleExpression(' $1 * 2 ', 1.5)).toBe('($1 * 2) * 1.5');
  });

  it('rounds bands to whole rows that add up (largest remainder, earlier band on a tie)', () => {
    expect(spreadBands([3, 3, 4.5, 4.5, 6, 7.5, 9, 10.5, 12, 12], 72)).toEqual([
      3, 3, 5, 5, 6, 7, 9, 10, 12, 12,
    ]);
    expect(spreadBands([36, 36, 36], 126)).toEqual([42, 42, 42]);
    expect(spreadBands([1.5, 1.5, 1.5], 5)).toEqual([2, 2, 1]);
    // The ≥ 1 floor overshoots: taken back from the tallest band.
    expect(spreadBands([0.2, 0.2, 10], 4)).toEqual([1, 1, 2]);
    expect(spreadBands([1, 1, 1], 2)).toBeNull();
  });
});

describe('rescale: what stays unclassified', () => {
  it('a number without a unit', () => {
    const plan = planRescale([file('x/a.json', { kind: 'fake-plain', n: 3 })], V2, MODULES);
    expect(plan.unclassified.map((entry) => [entry.path, entry.note])).toEqual([
      ['n', 'the schema field has no unit'],
    ]);
  });

  it('a behaviour tunable without a unit — or without the table', () => {
    const files = [file('enemies/a.enemies.json', enemy({ speed: 1, bogus: 2 }))];
    const plan = planRescale(files, V2, MODULES);
    expect(plan.unclassified.map((entry) => entry.note)).toEqual([
      'behaviour "drifter.sine" has no unit for "bogus"',
    ]);
    const unknown = planRescale(
      [file('enemies/b.enemies.json', enemy({ speed: 1 }, 'no.such.behaviour'))],
      V2,
      MODULES,
    );
    expect(unknown.unclassified.map((entry) => entry.note)).toEqual([
      'behaviour "no.such.behaviour" has no unit table',
    ]);
    const noTable = planRescale(files, V2, { ...MODULES, behaviorParamUnits: null });
    expect(noTable.unclassified.map((entry) => entry.note)).toEqual([
      'core exports no BEHAVIOR_PARAM_UNITS yet',
      'core exports no BEHAVIOR_PARAM_UNITS yet',
    ]);
  });

  it('an expression under a rule other than ×k, an over-long one, an opaque value', () => {
    const plan = planRescale(
      [
        file('x/a.json', { kind: 'fake-edge-expr', e: '$rank + 400' }),
        file('x/b.json', { kind: 'fake-px-expr', e: `1${' + $rank'.repeat(31)}` }),
        file('x/c.json', { kind: 'fake-opaque', o: { n: 1 } }),
      ],
      V2,
      MODULES,
    );
    expect(plan.unclassified.map((entry) => [entry.file, entry.note])).toEqual([
      ['x/a.json', 'an expression cannot take rule edge-x'],
      ['x/b.json', 'the scaled expression is too long'],
      ['x/c.json', 'the walk could not enter this value (opaque)'],
    ]);
    // A numeric expression on the same field is a number: it snaps like any screen-x.
    const numeric = planRescale(
      [file('x/d.json', { kind: 'fake-edge-expr', e: 400 })],
      V2,
      MODULES,
    );
    expect(numeric.unclassified).toEqual([]);
    expect(numeric.moved.map((entry) => entry.to)).toEqual([GEOMETRY.port.toWidth + 24]);
  });

  it('refuses to write while anything is unclassified, and on a dry run', async () => {
    const root = join(tmp, 'refused');
    mkdirSync(join(root, 'enemies'), { recursive: true });
    const path = join(root, 'enemies', 'a.enemies.json');
    const text = JSON.stringify(enemy({ speed: 1, bogus: 2 }), null, 2) + '\n';
    writeFileSync(path, text);
    const options = {
      factor: GEOMETRY.port.factor,
      topPad: GEOMETRY.port.topPad,
      dryRun: false,
      root,
      examples: true,
      fromWidth: null,
      fromHeight: null,
      tileSize: null,
      toWidth: null,
      json: false,
      quiet: false,
    };
    const refused = await rescaleContent(options, MODULES);
    expect(refused.refused).toBe(true);
    expect(refused.changes).toBeGreaterThan(0);
    expect(refused.written).toEqual([]);
    expect(readFileSync(path, 'utf8')).toBe(text);
    expect(formatRescaleReport(refused)).toContain('REFUSED: nothing written');
    // Fixed, a dry run still writes nothing; a real run writes the file.
    writeFileSync(path, JSON.stringify(enemy({ speed: 1 }), null, 2) + '\n');
    const dry = await rescaleContent({ ...options, dryRun: true }, MODULES);
    expect([dry.refused, dry.written]).toEqual([false, []]);
    const done = await rescaleContent(options, MODULES);
    expect(done.written).toEqual(['enemies/a.enemies.json']);
    expect(JSON.parse(readFileSync(path, 'utf8'))).toMatchObject({
      enemies: [{ hurtbox: { hw: 3, hh: 3 }, params: { speed: 1.5 } }],
    });
  });
});

describe('rescale: refused and skipped files', () => {
  it('refuses a file that is not JSON, has no schema or does not validate', () => {
    const plan = planRescale(
      [
        file('x/a.json', '{ nope'),
        file('x/b.json', { kind: 'no-such-kind' }),
        file('x/c.json', { kind: 'fake-int', n: 'three' }),
      ],
      V2,
      MODULES,
    );
    expect(plan.errors.map((error) => error.file)).toEqual(['x/a.json', 'x/b.json', 'x/c.json']);
    expect(plan.errors[0]?.message).toMatch(/^not JSON/);
    expect(plan.errors[1]?.message).toBe('no file schema for kind no-such-kind');
    expect(plan.errors[2]?.message).toMatch(/^n: must be an integer/);
  });

  it('refuses content drawn at another tile size than the geometry', () => {
    const tileset = {
      formatVersion: 1,
      kind: 'tileset',
      id: 't',
      sprite: 'tiles/terrain-a',
      tileSize: GEOMETRY.port.toTileSize,
      tiles: [{ name: 'solid', type: 'solid', frame: 0, anchor: 'floor', mask: [12, 12, 12] }],
    };
    const plan = planRescale([file('tilesets/t.tileset.json', tileset)], V2, MODULES);
    expect(plan.errors.map((error) => error.message)).toEqual([
      expect.stringMatching(/^tileSize 12 is not --tile-size 8/),
    ]);
  });

  it('skips the demos folder and any replay document', () => {
    const plan = planRescale(
      [
        file('demos/a.replay.json', 'not even JSON'),
        file('x/b.json', { kind: 'replay', header: {} }),
      ],
      V2,
      MODULES,
    );
    expect(plan.skipped).toEqual(['demos/a.replay.json', 'x/b.json']);
    expect(plan.errors).toEqual([]);
  });
});

describe('rescale: what it lists', () => {
  it('rounds integer fields and lists them (owner decision O4)', () => {
    const plan = planRescale([file('x/a.json', { kind: 'fake-int', n: 3 })], V2, MODULES);
    expect(plan.rounded.map((entry) => [entry.from, entry.to, entry.note])).toEqual([
      [3, 5, '4.5 rounded'],
    ]);
  });

  it('lists a mask it can only approximate', () => {
    const tileset = {
      formatVersion: 1,
      kind: 'tileset',
      id: 't',
      sprite: 'tiles/terrain-a',
      tileSize: FRAME.tileSize,
      tiles: [
        { name: 'notch', type: 'solid', frame: 0, anchor: 'floor', mask: [8, 8, 4, 4, 8, 8, 4, 4] },
      ],
    };
    const plan = planRescale([file('tilesets/t.tileset.json', tileset)], V2, MODULES);
    expect(plan.errors).toEqual([]);
    expect(plan.masks.map((entry) => [entry.path, entry.to])).toEqual([
      ['tiles[0].mask', [12, 12, 12, 6, 6, 6, 12, 12, 12, 6, 6, 6]],
    ]);
  });

  it('lists every y on or above the top edge: above stays above, on the edge moves down', () => {
    const plan = planRescale(
      [
        file('x/a.json', { kind: 'fake-y', y: -20 }),
        file('x/b.json', { kind: 'fake-y', y: 0 }),
        file('x/c.json', { kind: 'fake-y', y: 1 }),
      ],
      V2,
      MODULES,
    );
    expect(plan.aboveTop.map((entry) => [entry.file, entry.to])).toEqual([
      ['x/a.json', -30],
      ['x/b.json', GEOMETRY.port.topPad],
    ]);
    expect(plan.aboveTop[1]?.note).toMatch(/^on the top edge: ×k \+ pad moves it 36 px down/);
  });

  it('adds no pad without --top-pad: y is only ×k and nothing is above the top edge', () => {
    const noPad = rescaleGeometry(
      { factor: 1.5, topPad: 0, fromWidth: null, fromHeight: null, tileSize: null, toWidth: null },
      FRAME,
    );
    const plan = planRescale(
      [file('x/a.json', { kind: 'fake-y', y: -20 }), file('x/b.json', { kind: 'fake-y', y: 20 })],
      noPad,
      MODULES,
    );
    expect(plan.aboveTop).toEqual([]);
    expect(plan.moved.map((entry) => entry.to)).toEqual([-30, 30]);
  });

  it('keeps a pattern reference’s parameters: their uses are ported where they are', () => {
    const patterns = {
      formatVersion: 1,
      kind: 'patterns',
      actions: [
        { id: 'a', body: [{ op: 'actionRef', action: 'b', params: [2, '$rank * 0.1'] }] },
        { id: 'b', body: [{ op: 'fire', speed: '$1 + $2' }] },
      ],
    };
    const plan = planRescale([file('patterns/p.patterns.json', patterns)], V2, MODULES);
    expect(plan.unclassified).toEqual([]);
    expect(plan.expressions.map((entry) => [entry.path, entry.to])).toEqual([
      ['actions[1].body[0].speed', '($1 + $2) * 1.5'],
    ]);
    expect(plan.changes).toBe(1);
  });

  it('formats a quiet summary', () => {
    const plan = planRescale([file('x/a.json', { kind: 'fake-int', n: 2 })], V2, MODULES);
    const report = formatRescaleReport(
      { ...plan, written: [], refused: false, dryRun: true },
      true,
    );
    expect(report.split('\n')).toEqual([
      `rescale ×1.5, top pad 36 px: playfield ${String(FRAME.playfieldW)}×` +
        `${String(FRAME.playfieldH)} → 640×336, tiles 8 → 12 px, +3 tilemap rows`,
      '1 files (0 skipped), 1 values, 1 changes in 1 files; 0 unclassified, 0 errors',
      'dry run: nothing written.',
    ]);
  });
});
