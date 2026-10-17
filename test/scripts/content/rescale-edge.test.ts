/**
 * `scripts/content/rescale.mjs` at its edges: the argument parser, the geometry it refuses, the
 * position-keeping JSON editor, expression scaling, raster band rounding, and every way a value
 * stays unclassified (no unit, a tunable without a unit table, a rule an expression cannot take,
 * an opaque schema) or a file is refused (not JSON, no schema, invalid, another tile size) — and
 * that a refused port writes nothing. Review round 2: raster bands rounded at their boundaries
 * (raster-range's `lines` bands follow the ×1.5 art), the art scale measured from the atlas'
 * terrain tiles (a run that forgets `--art-scale` after R2-01 is refused), the timeline crossings
 * of triggers, flags and camera stops, the re-sort's index map, and a band that touched two
 * anchors.
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
  loadArt,
  measureArtScale,
  modulesFrom,
  parseRescaleArgs,
  permuteJsonArrays,
  planRescale,
  replaceJsonValues,
  rescaleContent,
  rescaleGeometry,
  resolveArtScale,
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
      '--atlas',
      'atlas.json',
      '--art-scale',
      '1.5',
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
      artScale: 1.5,
      json: true,
      quiet: true,
    });
    expect(options.root.endsWith('content')).toBe(true);
    expect(options.atlas?.endsWith('atlas.json')).toBe(true);
    expect(parseRescaleArgs(['--factor', '2'])).toMatchObject({
      topPad: 0,
      dryRun: false,
      artScale: null,
    });
  });

  it('refuses what it cannot run, with exit code 2', () => {
    const cases: [string[], RegExp][] = [
      [[], /--factor K is required/],
      [['--factor'], /--factor needs a number/],
      [['--factor', 'x'], /--factor needs a number/],
      [['--factor', '0'], /--factor must be > 0/],
      [['--factor', '1', '--top-pad', '-1'], /--top-pad must be >= 0/],
      [['--factor', '1', '--root'], /--root needs a directory/],
      [['--factor', '1', '--atlas'], /--atlas needs a file/],
      [['--factor', '1', '--art-scale', '0'], /--art-scale must be > 0/],
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

  it('rounds bands to whole rows at their boundaries, as a ×k upscale of the art moves them', () => {
    // raster-range's `lines` bands over the 48-row floor art (rows 152–200 → 264–336): source
    // boundary s lands on ceil(1.5·s) in a nearest-neighbour ×1.5 upscale — 0 3 6 11 15 21 29 38
    // 48 60 72 — so the bands are [3, 3, 5, 4, 6, 8, 9, 10, 12, 12] (rounding each band by largest
    // remainder gave [3, 3, 5, 5, 6, 7, …], two edges 1 px off the art).
    const v1 = [2, 2, 3, 3, 4, 5, 6, 7, 8, 8];
    const v2 = spreadBands(
      v1.map((h) => h * 1.5),
      72,
    );
    expect(v2).toEqual([3, 3, 5, 4, 6, 8, 9, 10, 12, 12]);
    let source = 0;
    let target = 0;
    for (let i = 0; i < v1.length; i++) {
      source += v1[i] ?? 0;
      target += v2?.[i] ?? 0;
      expect(target, `boundary ${String(i + 1)}`).toBe(Math.ceil(source * 1.5));
    }
    // Top and bottom that do not scale together: the boundaries are scaled to the total first.
    expect(spreadBands([36, 36, 36], 126)).toEqual([42, 42, 42]);
    expect(spreadBands([1.5, 1.5, 1.5], 5)).toEqual([2, 1, 2]);
    // A band rounded to no row takes one from its neighbours: every band keeps at least one.
    expect(spreadBands([0.2, 0.2, 10], 4)).toEqual([1, 1, 2]);
    expect(spreadBands([10, 0.2, 0.2], 4)).toEqual([2, 1, 1]);
    expect(spreadBands([0, 0, 0], 3)).toEqual([1, 1, 1]);
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
      atlas: null,
      artScale: null,
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

/** A stage with only what the field-pair tests need, plus `events`. */
const stage = (events: unknown[], extra: Record<string, unknown> = {}) => ({
  formatVersion: 1,
  kind: 'stage',
  id: 's',
  name: 'S',
  music: { stage: 'Stage', boss: 'Boss' },
  length: 2000,
  camera: [{ x: 0, speed: 1 }],
  checkpoints: [{ x: 0 }],
  parallax: [],
  tilemap: null,
  events: [...events, { x: 2000, type: 'end' }],
  ...extra,
});

/** Enemies: a flying one and one with a ground anchor. */
const ROSTER = {
  formatVersion: 1,
  kind: 'enemies',
  enemies: [
    { ...enemy({ speed: 1 }).enemies[0], id: 'flyer' },
    {
      ...enemy({ aimTicks: 30, fireTicks: 60, bulletSpeed: 1 }, 'turret.floor').enemies[0],
      id: 'turret',
      ground: 'floor',
    },
  ],
};

describe('rescale: fields that port together (the R1-03 review)', () => {
  it('ports a block’s x + screenX as one world x, and a ground enemy’s; a flyer’s alone', () => {
    const plan = planRescale(
      [
        file('enemies/r.enemies.json', ROSTER),
        file(
          'stages/s.stage.json',
          stage([
            { x: 100, type: 'spawn', enemy: 'flyer', screenX: 400 },
            { x: 100, type: 'spawn', enemy: 'turret', screenX: 400 },
            { x: 100, type: 'spawn', enemy: 'turret' },
            { x: 300, type: 'block', screenX: 480, y: 64, w: 16, h: 8 },
          ]),
        ),
      ],
      V2,
      MODULES,
    );
    expect(plan.errors).toEqual([]);
    const text = plan.changed.find((changed) => changed.path === 'stages/s.stage.json')?.text;
    const events = (JSON.parse(text ?? '{}') as { events: Record<string, number>[] }).events;
    const column = GEOMETRY.port.toWidth + 24;
    // The flyer: x ×k, its column snapped (when, and where on screen).
    expect(events.map((event) => [event['x'], event['screenX']])).toEqual([
      [(100 + 400) * 1.5 - column, column], // the turret, moved before the flyer
      [(100 + 400) * 1.5 - column, undefined], // the turret with the default column
      [150, column],
      [(300 + 480) * 1.5 - (column + 120), column + 120],
      [3000, undefined],
    ]);
    expect(plan.timeline.map((entry) => [entry.from, entry.to, entry.note])).toEqual([
      [
        [0, 1, 2],
        [2, 0, 1],
        're-sorted by the ported x (3 entries change places; ties keep their order): 0 → 2, ' +
          '1 → 0, 2 → 1 — every other listing names the indices as written',
      ],
    ]);
  });

  it('lets a box hanging from the top edge grow by the pad; a lower box ports as its fields', () => {
    const plan = planRescale(
      [
        file(
          'stages/s.stage.json',
          stage([
            { x: 100, type: 'block', screenX: 400, y: 0, w: 16, h: 24 },
            { x: 100, type: 'block', screenX: 400, y: 64, w: 16, h: 8 },
            { x: 200, type: 'trigger', flag: 'f', region: { x: 50, y: -8, w: 10, h: 16 } },
          ]),
        ),
      ],
      V2,
      MODULES,
    );
    const text = plan.changed[0]?.text ?? '{}';
    const events = (JSON.parse(text) as { events: Record<string, unknown>[] }).events;
    expect(events.slice(0, 3).map((event) => [event['y'], event['h']])).toEqual([
      [0, 24 * 1.5 + GEOMETRY.port.topPad],
      [64 * 1.5 + GEOMETRY.port.topPad, 12],
      [undefined, undefined],
    ]);
    expect(events[2]?.['region']).toEqual({ x: 75, y: -12, w: 15, h: 8 * 1.5 + 36 + 12 });
    expect(plan.aboveTop.map((entry) => [entry.path, entry.note.slice(0, 26)])).toEqual([
      ['events[0].y', 'hangs from the top edge: i'],
      ['events[2].region.y', 'hangs from the top edge: i'],
    ]);
  });

  it('ports each field alone when core has no pair functions', () => {
    const bare: RescaleModules = { ...MODULES, rescaleWorldSum: null, rescaleBoxY: null };
    const plan = planRescale(
      [
        file(
          'stages/s.stage.json',
          stage([{ x: 300, type: 'block', screenX: 400, y: 0, h: 8, w: 8 }]),
        ),
      ],
      V2,
      bare,
    );
    const text = plan.changed[0]?.text ?? '{}';
    const block = (JSON.parse(text) as { events: Record<string, number>[] }).events[0];
    expect([block?.['x'], block?.['screenX'], block?.['y'], block?.['h']]).toEqual([
      450,
      GEOMETRY.port.toWidth + 24,
      GEOMETRY.port.topPad,
      12,
    ]);
  });
});

describe('rescale: the backdrop', () => {
  /** Art heights of the test bands. */
  const ART = { height: (sprite: string) => ({ 'bg/a': 64, 'bg/b': 56 })[sprite] };

  it('places the bands from their art heights and the raster rows on their edges', () => {
    const plan = planRescale(
      [
        file(
          'stages/s.stage.json',
          stage([], {
            parallax: [
              { layer: 'far', sprite: 'bg/a', factor: 0.2, y: 0, spacing: 128 },
              { layer: 'far', sprite: 'bg/a', factor: 0.2, y: 64, spacing: 128 },
              { layer: 'mid', sprite: 'bg/b', factor: 0.5, y: 144, spacing: 128 },
            ],
            raster: [
              { layer: 'mid', kind: 'haze', top: 144, bottom: 200, amplitude: 1, wavelength: 8 },
            ],
          }),
        ),
      ],
      V2,
      MODULES,
      ART,
    );
    expect(plan.unclassified).toEqual([]);
    const data = JSON.parse(plan.changed[0]?.text ?? '{}') as {
      parallax: { y: number }[];
      raster: { top: number; bottom: number }[];
    };
    // A stack from the top edge stays closed; a band on the bottom edge stays on it.
    expect(data.parallax.map((band) => band.y)).toEqual([0, 96, 252]);
    expect([data.raster[0]?.top, data.raster[0]?.bottom]).toEqual([252, 336]);
  });

  it('leaves a band without art unclassified (and places none of the stage)', () => {
    const plan = planRescale(
      [
        file(
          'stages/s.stage.json',
          stage([], {
            parallax: [{ layer: 'far', sprite: 'bg/missing', factor: 0.2, y: 10, spacing: 128 }],
          }),
        ),
      ],
      V2,
      MODULES,
      ART,
    );
    expect(plan.unclassified.map((entry) => entry.note)).toEqual([
      'no art height for the band\'s sprite "bg/missing" (see --atlas)',
    ]);
  });

  it('reads art heights from a manifest, divided by the art scale', async () => {
    const path = join(tmp, 'atlas.json');
    writeFileSync(
      path,
      JSON.stringify({
        sprites: { 'bg/a': { frames: ['bg/a#0'] } },
        frames: { 'bg/a#0': { h: 96 } },
      }),
    );
    const art = await loadArt({ atlas: path, artScale: 1.5 });
    expect([art.height('bg/a'), art.height('bg/none')]).toEqual([64, undefined]);
  });
});

describe('rescale: re-sorting a JSON array in place', () => {
  it('moves each item with its own text and keeps every separator where it was', () => {
    const text = '{ "e": [\n  { "x": 3 },\n  {"x":1},\n  { "x": 2 }\n], "f": [1, 2] }';
    expect(permuteJsonArrays(text, [{ keys: ['e'], order: [1, 2, 0] }])).toBe(
      '{ "e": [\n  {"x":1},\n  { "x": 2 },\n  { "x": 3 }\n], "f": [1, 2] }',
    );
    expect(permuteJsonArrays(text, [])).toBe(text);
    expect(() => permuteJsonArrays(text, [{ keys: ['f'], order: [0] }])).toThrow(RangeError);
  });
});

describe('rescale: crossings on the timeline (review round 2)', () => {
  it('lists an event moved across a trigger’s window, a flag event or a camera stop', () => {
    const plan = planRescale(
      [
        file('enemies/r.enemies.json', ROSTER),
        file(
          'stages/s.stage.json',
          stage(
            [
              { x: 100, type: 'trigger', flag: 'f', region: { x: 300, y: 20, w: 100, h: 20 } },
              // Not branch-gated: fired after the trigger disarmed (400), now while it is armed.
              { x: 420, type: 'spawn', enemy: 'turret' },
              // Gated on another flag: the same crossing, no word about the branch.
              { x: 430, type: 'spawn', enemy: 'turret', branch: 'other' },
              // Gated on f but on the same side of the window in both: nothing to list.
              { x: 900, type: 'spawn', enemy: 'turret', branch: 'took' },
              { x: 1000, type: 'flag', flag: 'f', value: false },
              // Gated on f and moved before the flag event that clears it: its branch reads it
              // before the change.
              { x: 1020, type: 'spawn', enemy: 'turret', branch: 'took' },
              // A flyer is not moved: nothing listed for it.
              { x: 1030, type: 'spawn', enemy: 'flyer' },
            ],
            {
              camera: [
                { x: 0, speed: 1 },
                { x: 1500, speed: 1, lock: true },
              ],
              branches: [
                { id: 'took', flag: 'f' },
                { id: 'other', flag: 'g' },
              ],
              remix: [{ x: 1520, type: 'spawn', enemy: 'turret', minLoop: 2 }],
            },
          ),
        ),
      ],
      V2,
      MODULES,
    );
    expect(plan.errors).toEqual([]);
    const crossings = plan.timeline.filter((entry) => entry.path.endsWith('.x'));
    expect(crossings.map((entry) => [entry.path, entry.from, entry.to])).toEqual([
      ['events[1].x', 420, 566],
      ['events[2].x', 430, 581],
      ['events[5].x', 1020, 1466],
      ['remix[0].x', 1520, 2216],
    ]);
    const window = 'armed 100 … 400 → 150 … 600';
    expect(crossings.map((entry) => entry.note)).toEqual([
      `now fires while the trigger is armed (the trigger events[0] on "f", ${window}); in v1 it ` +
        'fired after the trigger disarmed',
      `now fires while the trigger is armed (the trigger events[0] on "f", ${window}); in v1 it ` +
        'fired after the trigger disarmed',
      'now fires before the flag event events[4] (clears "f" at 1000 → 1500), which it followed ' +
        'in v1 — its branch "took" now reads "f" before that change',
      'now fires when the camera reaches the scroll lock at 1500 (→ 2250), not once it moves on ' +
        'as in v1',
    ]);
  });

  it('spells out a branch-gated event now read while its trigger is armed', () => {
    const plan = planRescale(
      [
        file('enemies/r.enemies.json', ROSTER),
        file(
          'stages/s.stage.json',
          stage(
            [
              {
                x: 100,
                type: 'trigger',
                flag: 'f',
                until: 500,
                region: { x: 300, y: 20, w: 100, h: 20 },
              },
              { x: 520, type: 'spawn', enemy: 'turret', branch: 'took' },
            ],
            { branches: [{ id: 'took', flag: 'f' }] },
          ),
        ),
      ],
      V2,
      MODULES,
    );
    // An explicit until ports ×k (750); the spawn (520 + 400) × 1.5 − 664 = 716 is now before it.
    expect(plan.timeline.map((entry) => [entry.path, entry.to])).toEqual([['events[1].x', 716]]);
    expect(plan.timeline[0]?.note).toMatch(
      /^its branch "took" reads the flag "f" of the trigger events\[0\] \(armed 100 … 500 → 150 … 750\): in v1 it fired after the trigger disarmed.* give the trigger an until below 716/,
    );
  });

  it('asks for a look by hand when a branch-gated event moves before its trigger arms', () => {
    const plan = planRescale(
      [
        file('enemies/r.enemies.json', ROSTER),
        file(
          'stages/s.stage.json',
          stage(
            [
              { x: 600, type: 'trigger', flag: 'f', region: { x: 900, y: 20, w: 100, h: 20 } },
              { x: 610, type: 'spawn', enemy: 'turret', branch: 'took' },
            ],
            { branches: [{ id: 'took', flag: 'f', value: false }] },
          ),
        ),
      ],
      V2,
      MODULES,
    );
    // (610 + 400) × 1.5 − 664 = 851: before the trigger arms at 900 now, inside its window in v1.
    expect(plan.timeline.map((entry) => [entry.path, entry.to, entry.note])).toEqual([
      [
        'events[1].x',
        851,
        'now fires before the trigger arms (the trigger events[0] on "f", armed 600 … 1000 → ' +
          '900 … 1500); in v1 it fired while the trigger is armed — its branch "took" reads that ' +
          'flag: check it by hand',
      ],
      [
        'events',
        [1, 0],
        're-sorted by the ported x (2 entries change places; ties keep their order): 0 → 1, ' +
          '1 → 0 — every other listing names the indices as written',
      ],
    ]);
  });
});

describe('rescale: the art scale (review round 2)', () => {
  /**
   * A tileset file.
   *
   * @param sprite - Its sprite.
   * @param size - Its tile size.
   * @param path - Its path.
   * @returns The input file.
   */
  const tileset = (sprite: string, size: number, path = 'tilesets/t.tileset.json') =>
    file(path, {
      formatVersion: 1,
      kind: 'tileset',
      id: 't',
      sprite,
      tileSize: size,
      tiles: [
        { name: 'solid', type: 'solid', frame: 0, anchor: 'floor', mask: Array(size).fill(size) },
      ],
    });
  /**
   * An atlas with square terrain tiles and one 96-px band.
   *
   * @param sizes - Tile sprite → its frame size.
   * @returns The art.
   */
  const atlas = (sizes: Record<string, number>) => ({
    height: (sprite: string) => (sprite === 'bg/a' ? 96 : undefined),
    frame: (sprite: string) => {
      const size = sizes[sprite];
      return size === undefined ? undefined : { w: size, h: size };
    },
  });
  const mixedFiles = [tileset('tiles/a', 8), tileset('tiles/b', 8, 'tilesets/u.tileset.json')];

  it('measures the art scale from the terrain tiles against the content’s tile size', () => {
    const files = [tileset('tiles/a', 8)];
    expect(measureArtScale(files, atlas({ 'tiles/a': 8 })).scale).toBe(1);
    expect(measureArtScale(files, atlas({ 'tiles/a': 12 })).scale).toBe(1.5);
    expect(measureArtScale(files, atlas({})).scale).toBeNull();
    expect(measureArtScale(files, { height: () => undefined }).tiles).toEqual([]);
    const mixed = measureArtScale(mixedFiles, atlas({ 'tiles/a': 8, 'tiles/b': 12 }));
    expect([mixed.scale, mixed.tiles.length]).toEqual([null, 2]);
  });

  it('refuses a port that forgets --art-scale when the atlas is drawn at another scale', () => {
    const files = [tileset('tiles/a', 8)];
    // Not given: 1 while the tiles agree (or cannot be measured), refused otherwise.
    expect(resolveArtScale(null, measureArtScale(files, atlas({ 'tiles/a': 8 })))).toEqual({
      scale: 1,
      measured: 1,
      note: null,
    });
    expect(resolveArtScale(null, measureArtScale(files, atlas({}))).scale).toBe(1);
    let error: unknown;
    try {
      resolveArtScale(null, measureArtScale(files, atlas({ 'tiles/a': 12 })));
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(RescaleError);
    expect((error as RescaleError).exitCode).toBe(2);
    expect((error as RescaleError).message).toBe(
      "the atlas' terrain tiles are 12 px but the content's tilesets say 8 px: the art is drawn " +
        "at ×1.5 the content's pixels, so the bands' art heights need --art-scale 1.5 (or --atlas " +
        "with an atlas drawn at the content's pixels)",
    );
    expect(() =>
      resolveArtScale(null, measureArtScale(mixedFiles, atlas({ 'tiles/a': 8, 'tiles/b': 12 }))),
    ).toThrow(/do not agree on one scale/);
    // Given: used, and a disagreement with the tiles is noted in the report.
    expect(resolveArtScale(1.5, measureArtScale(files, atlas({ 'tiles/a': 12 })))).toEqual({
      scale: 1.5,
      measured: 1.5,
      note: null,
    });
    expect(resolveArtScale(1, measureArtScale(files, atlas({ 'tiles/a': 12 }))).note).toBe(
      "--art-scale 1 given, but the atlas' terrain tiles measure ×1.5: the bands' art heights " +
        'use ×1',
    );
  });

  it('refuses the whole run, and reads the heights at the given scale', async () => {
    const root = join(tmp, 'art-scale');
    mkdirSync(join(root, 'tilesets'), { recursive: true });
    writeFileSync(
      join(root, 'tilesets', 't.tileset.json'),
      tileset('tiles/a', FRAME.tileSize).text,
    );
    const path = join(tmp, 'art-scale-atlas.json');
    const size = FRAME.tileSize * 1.5;
    writeFileSync(
      path,
      JSON.stringify({
        sprites: { 'tiles/a': { frames: ['tiles/a#0'] }, 'bg/a': { frames: ['bg/a#0'] } },
        frames: { 'tiles/a#0': { w: size, h: size }, 'bg/a#0': { w: 128, h: 96 } },
      }),
    );
    const options = {
      factor: GEOMETRY.port.factor,
      topPad: GEOMETRY.port.topPad,
      dryRun: true,
      root,
      examples: false,
      fromWidth: null,
      fromHeight: null,
      tileSize: null,
      toWidth: null,
      atlas: path,
      artScale: null,
      json: false,
      quiet: false,
    };
    await expect(rescaleContent(options, MODULES)).rejects.toThrow(/need --art-scale 1\.5/);
    const given = await rescaleContent({ ...options, artScale: 1.5 }, MODULES);
    expect(given.art).toEqual({ scale: 1.5, measured: 1.5, note: null });
    expect(given.errors).toEqual([]);
    const art = await loadArt({ atlas: path, artScale: 1.5 });
    expect([art.height('bg/a'), art.frame?.('tiles/a')]).toEqual([64, { w: size, h: size }]);
    const noted = await rescaleContent({ ...options, artScale: 1 }, MODULES);
    expect(formatRescaleReport(noted, true)).toContain(
      "note: --art-scale 1 given, but the atlas' terrain tiles measure ×1.5",
    );
  });
});

describe('rescale: a band that touched two anchors (review round 2)', () => {
  it('lists it in the backdrop with the strip that opens', () => {
    const plan = planRescale(
      [
        file(
          'stages/s.stage.json',
          stage([], {
            parallax: [
              { layer: 'far', sprite: 'bg/full', factor: 0.2, y: 0, spacing: 128 },
              { layer: 'mid', sprite: 'bg/sky', factor: 0.3, y: 0, spacing: 128 },
            ],
            mode7: {
              sprite: 'bg/floor',
              horizon: 100,
              bottom: FRAME.playfieldH,
              height: 34,
              scroll: 0.1,
              sway: 0,
              fog: '#000000',
              fogDepth: 96,
              alpha: 1,
            },
          }),
        ),
      ],
      V2,
      MODULES,
      { height: (sprite: string) => ({ 'bg/full': FRAME.playfieldH, 'bg/sky': 100 })[sprite] },
    );
    expect(plan.errors).toEqual([]);
    expect(plan.unclassified).toEqual([]);
    expect(plan.backdrop.map((entry) => [entry.path, entry.to, entry.note])).toEqual([
      [
        'parallax[0].y',
        0,
        'a band that touched two anchors keeps one (top): its bottom edge was on the bottom edge ' +
          'and now leaves 36 px open — the art cannot span both at ×k: fix the art or the layout ' +
          'by hand',
      ],
      [
        'parallax[1].y',
        0,
        'a band that touched two anchors keeps one (top): its bottom edge was on the Mode-7 row ' +
          'mode7.horizon and now leaves 18 px open — the art cannot span both at ×k: fix the art ' +
          'or the layout by hand',
      ],
    ]);
  });
});
