/**
 * Edge cases of `scripts/content/tiled-import.mjs` (plan M2-07), beyond `tiled-import.test.ts`:
 *
 * - helpers: property lists with duplicates / odd entries, RLE rows, tile layers with padded CSV,
 *   bad tokens, fractional / negative gids, the largest plain gid, the first flip bit and a
 *   compression name in the error;
 * - `cameraYAt`: keys without `yTo` leaving a diagonal pan running, `yOver: 0` as a jump, x before
 *   the first key;
 * - map header rules: not an object, bad sizes, a bad `length` property, the id / name defaults and
 *   overrides, a map without tilesets, the `terrain` layer chosen over the first tile layer, no tile
 *   layer, odd `layers` / `objects`;
 * - object rules: every marker event with its fields, formations with all their fields, camera keys
 *   and checkpoints sorted, triggers (`armX`, rounding, the arming x), blocks near the start and at
 *   exactly 400 px, branches, the `type` class fallback, polylines (rounding, `-0`, a polyline that
 *   also has a class), spawn y rounding without `-0`, event order across layers;
 * - warnings: a timed pan at x 0 under a spawn at 0, a stopped camera (speed 0) never warning;
 * - CLI: `--print` writes nothing, `--id` and the file-name fallback name the files, no paths file
 *   without polylines, warnings on stderr, a missing file exits 1.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import {
  SPAWN_LEAD,
  TILED_TILE_SIZE,
  TiledImportError,
  VIEW_WIDTH,
  cameraYAt,
  convertTiledMap,
  decodeTileLayer,
  encodeRleRow,
  readTiledProperties,
} from '../../../scripts/content/tiled-import.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..', '..');
const script = join(repo, 'scripts', 'content', 'tiled-import.mjs');
const tmp = mkdtempSync(join(tmpdir(), 'shmup-tiled-edge-'));

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

/**
 * A minimal valid map around the given layers.
 *
 * @param layers - The layers.
 * @param extra - Map fields over the defaults.
 * @returns The map.
 */
function map(layers: unknown, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    orientation: 'orthogonal',
    infinite: false,
    width: 60,
    height: 2,
    tilewidth: 8,
    tileheight: 8,
    tilesets: [{ firstgid: 1 }],
    layers,
    ...extra,
  };
}

/**
 * An object layer holding the given objects.
 *
 * @param objects - Tiled objects.
 * @returns The layer.
 */
function objects(...objects: unknown[]): Record<string, unknown> {
  return { type: 'objectgroup', name: 'events', objects };
}

/**
 * Tiled properties from a plain object.
 *
 * @param props - Name → value.
 * @returns The Tiled property list.
 */
function props(props: Record<string, unknown>): { name: string; value: unknown }[] {
  return Object.entries(props).map(([name, value]) => ({ name, value }));
}

/**
 * A tile layer of `2 × 60` cells.
 *
 * @param name - Layer name.
 * @param first - The first cell's gid (the rest empty).
 * @returns The layer.
 */
function tiles(name: string, first: number): Record<string, unknown> {
  const data = new Array<number>(120).fill(0);
  data[0] = first;
  return { type: 'tilelayer', name, data };
}

describe('tiled-import edges — helpers', () => {
  it('readTiledProperties: later duplicates win, values pass through, bad entries throw', () => {
    expect(
      readTiledProperties([
        { name: 'a', value: 1 },
        { name: 'a', value: 2 },
        { name: 'b', type: 'string' },
        { name: 'c', value: null },
      ]),
    ).toEqual({ a: 2, b: undefined, c: null });
    expect(readTiledProperties([])).toEqual({});
    expect(() => readTiledProperties([null])).toThrow(TiledImportError);
    expect(() => readTiledProperties([{ name: 7, value: 1 }])).toThrow('a property needs a name');
    expect(() => readTiledProperties('x')).toThrow('properties must be an array');
  });

  it('encodeRleRow: leading runs and alternating cells', () => {
    expect(encodeRleRow([3, 3, 0, 3])).toBe('2*3, 0, 3');
    expect(encodeRleRow([1, 0, 1, 0, 0])).toBe('1, 0, 1');
    expect(encodeRleRow([0, 0, 5])).toBe('2*0, 5');
  });

  it('decodeTileLayer: padded csv, bad tokens and gids, the largest plain gid', () => {
    expect(
      decodeTileLayer({ name: 't', encoding: 'csv', data: '\n 0 , 1,\r\n2 ,3 ,\n' }, 2, 2, 1),
    ).toEqual([
      [0, 1],
      [2, 3],
    ]);
    expect(() => decodeTileLayer({ name: 't', encoding: 'csv', data: '0,x' }, 2, 1, 1)).toThrow(
      'bad gid NaN at (1, 0)',
    );
    expect(() => decodeTileLayer({ name: 't', data: [1.5] }, 1, 1, 1)).toThrow('bad gid 1.5');
    expect(() => decodeTileLayer({ name: 't', data: [-1] }, 1, 1, 1)).toThrow('bad gid -1');
    expect(decodeTileLayer({ name: 't', data: [0x1fffffff] }, 1, 1, 1)).toEqual([[0x1fffffff]]);
    expect(() => decodeTileLayer({ name: 't', data: [0x20000001] }, 1, 1, 1)).toThrow('flipped');
    expect(() =>
      decodeTileLayer(
        { name: 'z', encoding: 'base64', compression: 'zlib', data: 'eJw=' },
        1,
        1,
        1,
      ),
    ).toThrow('tile layer "z": only array or csv data is supported (not base64 + zlib)');
    // Array data with an encoding, or csv that is not a string: refused too.
    expect(() => decodeTileLayer({ name: 't', encoding: 'csv', data: [1] }, 1, 1, 1)).toThrow(
      'only array or csv',
    );
    expect(() => decodeTileLayer({ data: [1, 2] }, 1, 1, 1)).toThrow('tile layer "": 2 cells');
  });

  it('cameraYAt: a key without yTo leaves a diagonal pan running; yOver 0 jumps', () => {
    const keys = [
      { x: 0, speed: 1 },
      { x: 100, speed: 1, yTo: 80, yOver: 100 },
      { x: 150, speed: 3 }, // no pan: the diagonal one goes on
      { x: 300, speed: 1, yTo: 10, yOver: 0 },
    ];
    expect(cameraYAt(keys, 175)).toBe(60);
    expect(cameraYAt(keys, 250)).toBe(80);
    expect(cameraYAt(keys, 300)).toBe(80); // the key at 300 applies the tick after
    expect(cameraYAt(keys, 301)).toBe(10);
    expect(cameraYAt(keys, -5)).toBe(0);
    // A first key after 0: nothing applies before it.
    expect(cameraYAt([{ x: 50, speed: 1, yTo: 40 }], 50)).toBe(0);
    expect(cameraYAt([{ x: 50, speed: 1, yTo: 40 }], 51)).toBe(40);
  });
});

describe('tiled-import edges — the map header', () => {
  it('refuses non-maps and bad sizes', () => {
    expect(() => convertTiledMap(null as never)).toThrow('not a Tiled map');
    expect(() => convertTiledMap('map' as never)).toThrow('not a Tiled map');
    expect(() => convertTiledMap(map([], { width: 60.5 }))).toThrow('positive integer width');
    expect(() => convertTiledMap(map([], { height: 0 }))).toThrow('positive integer width');
    expect(() => convertTiledMap(map([], { tilewidth: 8, tileheight: 16 }))).toThrow('8 × 16');
    expect(() => convertTiledMap(map([], { properties: props({ length: 12.5 }) }))).toThrow(
      'stage length 12.5',
    );
    expect(() => convertTiledMap(map([], { properties: props({ length: 0 }) }))).toThrow(
      'stage length 0',
    );
    // Exactly one screen plus a tile: the shortest map (length 8).
    expect(convertTiledMap(map([], { width: VIEW_WIDTH / 8 + 1 })).stage.length).toBe(8);
  });

  it('names the stage: option > property > "imported"; the name from the id', () => {
    expect(convertTiledMap(map([])).stage).toMatchObject({ id: 'imported', name: 'IMPORTED' });
    const named = map([], { properties: props({ id: 'deep-trench', musicBoss: 'Title' }) });
    expect(convertTiledMap(named).stage).toMatchObject({
      id: 'deep-trench',
      name: 'DEEP TRENCH',
      music: { stage: 'Stage', boss: 'Title' },
    });
    expect(convertTiledMap(named, { id: 'other' }).stage).toMatchObject({
      id: 'other',
      name: 'OTHER',
    });
    const titled = map([], { properties: props({ id: 'a', name: 'The A' }) });
    expect(convertTiledMap(titled).stage.name).toBe('The A');
  });

  it('prefers the `terrain` tile layer, falls back to the first, and has none without one', () => {
    const both = map([tiles('decor', 2), tiles('terrain', 3)], {
      properties: props({ tileset: 'terrain-b' }),
    });
    const { stage } = convertTiledMap(both);
    expect(stage.tilemap).toEqual({
      tileSize: TILED_TILE_SIZE,
      tileset: 'terrain-b',
      rowsTall: 2,
      rle: ['3', ''],
    });
    expect(
      (convertTiledMap(map([tiles('first', 2)])).stage.tilemap as { rle: string[] }).rle,
    ).toEqual(['2', '']);
    // A map without tilesets counts gids from 1.
    const noSets = map([tiles('terrain', 4)], { tilesets: undefined });
    expect((convertTiledMap(noSets).stage.tilemap as { rle: string[] }).rle).toEqual(['4', '']);
    // Another firstgid shifts the ids.
    const shifted = map([tiles('terrain', 11)], { tilesets: [{ firstgid: 10 }] });
    expect((convertTiledMap(shifted).stage.tilemap as { rle: string[] }).rle).toEqual(['2', '']);
    expect(convertTiledMap(map([objects()])).stage.tilemap).toBeNull();
  });

  it('tolerates missing layers and object lists', () => {
    const { stage, paths, warnings } = convertTiledMap(map(undefined));
    expect([stage.events, paths, warnings]).toEqual([[], null, []]);
    const odd = convertTiledMap(map([{ type: 'objectgroup', name: 'x', objects: 'nope' }]));
    expect(odd.stage.events).toEqual([]);
    expect(odd.stage.camera).toEqual([{ x: 0, speed: 1 }]);
    expect('branches' in odd.stage).toBe(false);
  });
});

describe('tiled-import edges — objects', () => {
  it('writes every marker event with its fields (enemy from the name or the property)', () => {
    const { stage } = convertTiledMap(
      map([
        objects(
          { id: 1, class: 'warning', name: 'boss-a', x: 10.4, y: 5 },
          { id: 2, class: 'boss', x: 20, properties: props({ enemy: 'boss-b', branch: 'x' }) },
          { id: 3, class: 'music', x: 30, properties: props({ cue: 'Boss', junk: 1 }) },
          { id: 4, class: 'speed', x: 40, properties: props({ speed: 4, ramp: 30 }) },
          { id: 5, class: 'flag', x: 50, properties: props({ flag: 'f', value: false }) },
          { id: 6, class: 'end', x: 60, properties: props({ branch: 'x' }) },
        ),
      ]),
    );
    expect(stage.events).toEqual([
      { x: 10, type: 'warning', enemy: 'boss-a' },
      { x: 20, type: 'boss', enemy: 'boss-b', branch: 'x' },
      { x: 30, type: 'music', cue: 'Boss' },
      { x: 40, type: 'speed', speed: 4, ramp: 30 },
      { x: 50, type: 'flag', flag: 'f', value: false },
      { x: 60, type: 'end', branch: 'x' },
    ]);
  });

  it('writes formations with all their fields, and sorts camera keys and checkpoints', () => {
    const { stage } = convertTiledMap(
      map([
        objects(
          {
            id: 1,
            class: 'formation',
            name: 'fan',
            x: 800,
            y: 50.5,
            properties: props({
              count: 5,
              interval: 12,
              path: 'loop',
              drop: null,
              bonus: 500,
              branch: 'b',
            }),
          },
          { id: 2, class: 'camera', x: 300, properties: props({ speed: 2, lock: true }) },
          {
            id: 3,
            class: 'camera',
            x: 0,
            properties: props({ speed: 1, ramp: 10, yTo: 8, yTicks: 1, hold: 5, yOver: 9 }),
          },
          { id: 4, class: 'checkpoint', x: 500 },
          { id: 5, class: 'checkpoint', x: 120.6 },
        ),
      ]),
    );
    expect(stage.events).toEqual([
      {
        x: 800 - SPAWN_LEAD,
        type: 'formation',
        enemy: 'fan',
        count: 5,
        interval: 12,
        y: 51 - 8,
        path: 'loop',
        drop: null,
        bonus: 500,
        branch: 'b',
      },
    ]);
    // A key at 0 exists: no default key is added.
    expect(stage.camera).toEqual([
      { x: 0, speed: 1, ramp: 10, yTo: 8, yTicks: 1, yOver: 9, hold: 5 },
      { x: 300, speed: 2, lock: true },
    ]);
    expect(stage.checkpoints).toEqual([{ x: 121 }, { x: 500 }]);
  });

  it('arms triggers a screen ahead (or at armX) over their rounded rectangle', () => {
    const { stage } = convertTiledMap(
      map([
        objects(
          {
            id: 1,
            class: 'trigger',
            x: 100.4,
            y: 20.6,
            width: 30.5,
            height: 9.4,
            properties: props({ flag: 'a' }),
          },
          {
            id: 2,
            class: 'trigger',
            x: 900,
            y: 0,
            width: 10,
            height: 10,
            properties: props({ flag: 'b', value: false, until: 1200, branch: 'x', armX: 700 }),
          },
          { id: 3, class: 'trigger', x: 1000, y: 0, width: 10, height: 10 },
        ),
      ]),
    );
    expect(stage.events).toEqual([
      { x: 0, type: 'trigger', flag: 'a', region: { x: 100, y: 21, w: 31, h: 9 } },
      {
        x: 616,
        type: 'trigger',
        flag: undefined,
        region: { x: 1000, y: 0, w: 10, h: 10 },
      },
      {
        x: 700,
        type: 'trigger',
        flag: 'b',
        region: { x: 900, y: 0, w: 10, h: 10 },
        value: false,
        until: 1200,
        branch: 'x',
      },
    ]);
  });

  it('places blocks a spawn lead ahead: screenX only nearer the start than 400 px', () => {
    const { stage } = convertTiledMap(
      map([
        objects(
          { id: 1, class: 'block', x: 400, y: 96, width: 32, height: 8 },
          {
            id: 2,
            class: 'block',
            x: 120,
            y: 40,
            width: 16,
            height: 16,
            properties: props({
              tile: 'brick',
              vx: -1,
              vy: 0.5,
              dx: 4,
              dy: 8,
              period: 90,
              phase: 3,
            }),
          },
        ),
      ]),
    );
    expect(stage.events).toEqual([
      { x: 0, type: 'block', y: 96, w: 32, h: 8 },
      {
        x: 0,
        type: 'block',
        screenX: 120,
        y: 40,
        w: 16,
        h: 16,
        tile: 'brick',
        vx: -1,
        vy: 0.5,
        dx: 4,
        dy: 8,
        period: 90,
        phase: 3,
      },
    ]);
  });

  it('declares branches (value only when given) and reads classes from `type` as well', () => {
    const { stage } = convertTiledMap(
      map([
        objects(
          { id: 1, type: 'branch', name: 'low', properties: props({ flag: 'went-low' }) },
          {
            id: 2,
            class: 'branch',
            type: 'ignored',
            name: 'high',
            properties: props({ flag: 'went-low', value: false }),
          },
        ),
      ]),
    );
    expect(stage.branches).toEqual([
      { id: 'low', flag: 'went-low' },
      { id: 'high', flag: 'went-low', value: false },
    ]);
    expect(() => convertTiledMap(map([objects({ id: 3, class: 42, x: 0 })]))).toThrow(
      'object 3 "": unknown class ""',
    );
  });

  it('turns polylines into rounded relative paths, whatever their class', () => {
    const { paths, stage } = convertTiledMap(
      map([
        objects(
          {
            id: 1,
            name: 'zig',
            class: 'spawn',
            x: 50,
            y: 50,
            polyline: [
              { x: 1.001, y: 2 },
              { x: 11.006, y: 2.004 },
              { x: 0.996, y: -8.3333 },
            ],
          },
          { id: 2, name: 'empty', x: 0, y: 0, polyline: [] },
        ),
      ]),
    );
    expect(stage.events).toEqual([]);
    expect(paths).toEqual({
      formatVersion: 1,
      kind: 'paths',
      paths: [
        {
          id: 'zig',
          points: [
            { x: 0, y: 0 },
            { x: 10.01, y: 0 },
            { x: 0, y: -10.33 },
          ],
        },
        { id: 'empty', points: [] },
      ],
    });
    const points = (paths as { paths: { points: { x: number; y: number }[] }[] }).paths[0].points;
    for (const p of points) {
      expect(Object.is(p.x, -0)).toBe(false);
      expect(Object.is(p.y, -0)).toBe(false);
    }
  });

  it('rounds spawn y without -0 and orders events across layers by x, then file order', () => {
    const { stage } = convertTiledMap(
      map([
        objects({ id: 1, class: 'spawn', name: 'a', x: 500, y: -0.4 }),
        { type: 'tilelayer', name: 'terrain', data: new Array<number>(120).fill(0) },
        objects(
          { id: 2, class: 'music', x: 100, properties: props({ cue: 'Boss' }) },
          { id: 3, class: 'spawn', name: 'b', x: 500, y: 10.5 },
        ),
      ]),
    );
    expect(stage.events).toEqual([
      { x: 100, type: 'spawn', enemy: 'a', y: 0 },
      { x: 100, type: 'music', cue: 'Boss' },
      { x: 100, type: 'spawn', enemy: 'b', y: 11 },
    ]);
    expect(Object.is((stage.events as { y?: number }[])[0].y, -0)).toBe(false);
  });
});

describe('tiled-import edges — warnings', () => {
  it('warns for a spawn at x 0 under a timed pan at 0; a stopped camera never warns', () => {
    const at0 = convertTiledMap(
      map([
        objects(
          { id: 1, class: 'camera', x: 0, properties: props({ speed: 1, yTo: 16, yTicks: 30 }) },
          { id: 2, class: 'spawn', name: 'a', x: 100, y: 100 },
        ),
      ]),
    );
    expect(at0.warnings).toHaveLength(1);
    expect(at0.warnings[0]).toMatch(/^object 2 "a": the timed camera pan of the key at x 0 /);
    expect(at0.stage.events).toEqual([
      { x: 0, type: 'spawn', enemy: 'a', y: 100 - 16, screenX: 100 },
    ]);
    const still = convertTiledMap(
      map([
        objects(
          { id: 1, class: 'camera', x: 0, properties: props({ speed: 0, yTo: 16, yTicks: 30 }) },
          { id: 2, class: 'spawn', name: 'a', x: 500, y: 100 },
        ),
      ]),
    );
    expect(still.warnings).toEqual([]);
  });
});

describe('tiled-import edges — CLI', () => {
  /**
   * Runs the importer.
   *
   * @param args - Arguments.
   * @returns The process result.
   */
  const cli = (args: string[]) =>
    spawnSync(process.execPath, [script, ...args], { cwd: repo, encoding: 'utf8' });

  it('prints instead of writing with --print', () => {
    const out = join(tmp, 'print');
    const file = join(here, 'fixtures', 'tiled-sample.tmj');
    const result = cli([file, '--print', '--stages', out, '--paths', out]);
    expect(result.status, String(result.stderr)).toBe(0);
    expect(existsSync(out)).toBe(false);
    const text = String(result.stdout);
    // The stage JSON, then the paths JSON, each newline-terminated.
    const split = text.indexOf('}\n{');
    const stage = JSON.parse(text.slice(0, split + 1)) as { id: string };
    const paths = JSON.parse(text.slice(split + 2)) as { kind: string };
    expect([stage.id, paths.kind]).toEqual(['tiled-sample', 'paths']);
  });

  it('names the files by --id, else the map id, else the file name; no paths file without polylines', () => {
    const plain = map([objects({ id: 1, class: 'spawn', name: 'a', x: 500, y: 60 })]);
    const file = join(tmp, 'my-level.tmj');
    writeFileSync(file, JSON.stringify(plain));
    const out = join(tmp, 'out');
    const byName = cli([file, '--stages', out, '--paths', out]);
    expect(byName.status, String(byName.stderr)).toBe(0);
    const written = JSON.parse(readFileSync(join(out, 'my-level.stage.json'), 'utf8')) as {
      id: string;
    };
    expect(written.id).toBe('my-level');
    expect(existsSync(join(out, 'my-level.paths.json'))).toBe(false);
    const byId = cli([file, '--id', 'renamed', '--stages', out, '--paths', out]);
    expect(byId.status).toBe(0);
    expect(
      (JSON.parse(readFileSync(join(out, 'renamed.stage.json'), 'utf8')) as { id: string }).id,
    ).toBe('renamed');
  });

  it('prints warnings on stderr and still writes the files', () => {
    const panning = map([
      objects(
        { id: 1, class: 'camera', x: 0, properties: props({ speed: 1, yTo: 16, yTicks: 30 }) },
        { id: 2, class: 'spawn', name: 'a', x: 100, y: 100 },
      ),
    ]);
    const file = join(tmp, 'pan.tmj');
    writeFileSync(file, JSON.stringify(panning));
    const out = join(tmp, 'warn');
    const result = cli([file, '--stages', out, '--paths', out]);
    expect(result.status).toBe(0);
    expect(String(result.stderr)).toMatch(/^warning: object 2 "a": the timed camera pan/);
    expect(existsSync(join(out, 'pan.stage.json'))).toBe(true);
  });

  it('exits 1 for a missing or unreadable map', () => {
    const missing = cli([join(tmp, 'nope.tmj')]);
    expect(missing.status).toBe(1);
    expect(String(missing.stderr)).toMatch('nope.tmj');
    const file = join(tmp, 'broken.tmj');
    writeFileSync(file, '{ not json');
    expect(cli([file]).status).toBe(1);
  });
});
