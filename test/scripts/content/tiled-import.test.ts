/**
 * `scripts/content/tiled-import.mjs` (plan M2-07): the committed Tiled fixture map converts to
 * exactly the committed stage and paths JSON, the result loads as valid content next to the
 * shipped files, the helpers (RLE rows, properties, tile layers) follow their rules, maps that
 * break the rules are refused, and the CLI writes the files where it is told.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContent } from '@shmup/core';
import { afterAll, describe, expect, it } from 'vitest';
import {
  SPAWN_LEAD,
  TiledImportError,
  VIEW_WIDTH,
  convertTiledMap,
  decodeTileLayer,
  encodeRleRow,
  readTiledProperties,
} from '../../../scripts/content/tiled-import.mjs';
import { readContentFiles } from '../../../vite.shared.js';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..', '..');
const fixtures = join(here, 'fixtures');
const script = join(repo, 'scripts', 'content', 'tiled-import.mjs');
const tmp = mkdtempSync(join(tmpdir(), 'shmup-tiled-import-'));

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

/**
 * Reads a JSON fixture.
 *
 * @param name - File name in `fixtures/`.
 * @returns The parsed JSON.
 */
function fixture(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(fixtures, name), 'utf8')) as Record<string, unknown>;
}

/**
 * A minimal valid map around the given layers.
 *
 * @param layers - The layers.
 * @param extra - Map fields over the defaults.
 * @returns The map.
 */
function map(layers: unknown[], extra: Record<string, unknown> = {}): Record<string, unknown> {
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

describe('scripts/content/tiled-import.mjs — the committed fixture', () => {
  it('converts the fixture map into exactly the expected stage and paths JSON', () => {
    const { stage, paths } = convertTiledMap(fixture('tiled-sample.tmj'));
    expect(stage).toEqual(fixture('tiled-sample.stage.json'));
    expect(paths).toEqual(fixture('tiled-sample.paths.json'));
  });

  it('produces content that loads without issues next to the shipped files', () => {
    const { stage, paths } = convertTiledMap(fixture('tiled-sample.tmj'));
    const { db, issues } = loadContent([
      ...readContentFiles(),
      { path: 'stages/tiled-sample.stage.json', data: stage },
      { path: 'paths/tiled-sample.paths.json', data: paths },
    ]);
    expect(issues).toEqual([]);
    const spec = db.stages[db.stageIndex.get('tiled-sample') ?? -1];
    expect(spec.terrain?.cols).toBe(100);
    // The brick pillar (content tile 18, destructible) is where the map put it.
    const brick = db.tilesets[spec.terrain?.tilesetId ?? -1].tables.byName.get('brick');
    expect(spec.terrain?.tiles[20 * 100 + 50]).toBe(brick);
    expect(spec.branches).toEqual([{ id: 'low', flag: 'took-low', flagId: 0, value: true }]);
    expect(spec.events.find((e) => e.type === 'formation')).toMatchObject({
      pathId: db.pathIndex.get('tiled-loop'),
    });
    expect(spec.events.find((e) => e.type === 'block')).toMatchObject({
      tileId: db.tilesets[spec.terrain?.tilesetId ?? -1].tables.byName.get('solid'),
    });
  });
});

describe('scripts/content/tiled-import.mjs — helpers', () => {
  it('encodeRleRow: runs, single cells, trailing empties dropped, empty rows empty', () => {
    expect(encodeRleRow([0, 0, 0, 2, 2, 5, 0])).toBe('3*0, 2*2, 5');
    expect(encodeRleRow([1, 2, 3])).toBe('1, 2, 3');
    expect(encodeRleRow([0, 0])).toBe('');
    expect(encodeRleRow([])).toBe('');
    expect(encodeRleRow([7, 7, 7, 7])).toBe('4*7');
  });

  it('readTiledProperties: name → value, nothing for none, errors for malformed entries', () => {
    expect(
      readTiledProperties([
        { name: 'speed', type: 'float', value: 1.5 },
        { name: 'lock', type: 'bool', value: true },
      ]),
    ).toEqual({ speed: 1.5, lock: true });
    expect(readTiledProperties(undefined)).toEqual({});
    expect(() => readTiledProperties({})).toThrow(TiledImportError);
    expect(() => readTiledProperties([{ value: 1 }])).toThrow('a property needs a name');
  });

  it('decodeTileLayer: arrays and csv, gid → content id, empty cells, bad data refused', () => {
    const layer = { name: 't', data: [0, 5, 6, 0], type: 'tilelayer' };
    expect(decodeTileLayer(layer, 2, 2, 5)).toEqual([
      [0, 1],
      [2, 0],
    ]);
    expect(decodeTileLayer({ name: 't', encoding: 'csv', data: '0,1,\n2,3' }, 2, 2, 1)).toEqual([
      [0, 1],
      [2, 3],
    ]);
    expect(() => decodeTileLayer({ name: 't', encoding: 'base64', data: 'AA==' }, 1, 1, 1)).toThrow(
      'only array or csv data',
    );
    expect(() => decodeTileLayer({ name: 't', data: [1, 2, 3] }, 2, 2, 1)).toThrow('3 cells');
    // Flipped tiles (the high bits of a gid) are not supported.
    expect(() => decodeTileLayer({ name: 't', data: [0x80000001] }, 1, 1, 1)).toThrow('flipped');
    expect(() => decodeTileLayer({ name: 't', data: [2] }, 1, 1, 3)).toThrow('below firstgid');
  });
});

describe('scripts/content/tiled-import.mjs — conversion rules', () => {
  it('puts spawns 400 px ahead of their object (screenX only near the start), markers at x', () => {
    const { stage } = convertTiledMap(
      map([
        objects(
          { id: 1, class: 'spawn', name: 'drifter', x: 900, y: 40.4 },
          { id: 2, type: 'spawn', name: 'turret', x: 100, y: 180 },
          { id: 3, class: 'speed', x: 200, y: 0, properties: [{ name: 'speed', value: 3 }] },
          { id: 4, class: 'boss', name: 'bulwark', x: 50, y: 0 },
        ),
      ]),
    );
    expect(stage.events).toEqual([
      { x: 0, type: 'spawn', enemy: 'turret', y: 180, screenX: 100 },
      { x: 50, type: 'boss', enemy: 'bulwark' },
      { x: 200, type: 'speed', speed: 3 },
      { x: 900 - SPAWN_LEAD, type: 'spawn', enemy: 'drifter', y: 40 },
    ]);
    // No camera object: a key at 0 with the default speed; the length is the map minus a screen.
    expect(stage.camera).toEqual([{ x: 0, speed: 1 }]);
    expect(stage.length).toBe(60 * 8 - VIEW_WIDTH);
    expect(stage.tilemap).toBeNull();
  });

  it('keeps file order for events on one x, and reads the map properties', () => {
    const { stage } = convertTiledMap(
      map(
        [
          objects(
            { id: 1, class: 'flag', x: 10, properties: [{ name: 'flag', value: 'b' }] },
            { id: 2, class: 'flag', x: 10, properties: [{ name: 'flag', value: 'a' }] },
            { id: 3, class: 'camera', x: 64, properties: [{ name: 'speed', value: 2 }] },
          ),
        ],
        {
          properties: [
            { name: 'id', value: 'x-map' },
            { name: 'speed', value: 0.5 },
            { name: 'musicStage', value: 'Title' },
            { name: 'length', value: 40 },
          ],
        },
      ),
    );
    expect(stage.events).toEqual([
      { x: 10, type: 'flag', flag: 'b' },
      { x: 10, type: 'flag', flag: 'a' },
    ]);
    expect(stage.camera).toEqual([
      { x: 0, speed: 0.5 },
      { x: 64, speed: 2 },
    ]);
    expect([stage.id, stage.name, stage.length]).toEqual(['x-map', 'X MAP', 40]);
    expect(stage.music).toEqual({ stage: 'Title', boss: 'Boss' });
  });

  it('refuses maps and objects that break the rules', () => {
    expect(() => convertTiledMap(map([], { tilewidth: 16, tileheight: 16 }))).toThrow(
      'tiles are 16 × 16',
    );
    expect(() => convertTiledMap(map([], { infinite: true }))).toThrow('infinite');
    expect(() => convertTiledMap(map([], { orientation: 'isometric' }))).toThrow('orientation');
    expect(() => convertTiledMap(map([], { width: 40 }))).toThrow('wider than one screen');
    expect(() => convertTiledMap(map([objects({ id: 7, class: 'spwan', x: 0 })]))).toThrow(
      'object 7 "": unknown class "spwan"',
    );
    expect(() => convertTiledMap(map([objects({ id: 8, class: 'spawn', x: 0 })]))).toThrow(
      'needs an enemy',
    );
    expect(() =>
      convertTiledMap(map([objects({ id: 9, x: 0, polyline: [{ x: 0, y: 0 }] })])),
    ).toThrow('needs a name');
  });
});

describe('scripts/content/tiled-import.mjs — CLI', () => {
  it('writes the stage and paths files into the given folders', () => {
    const stages = join(tmp, 'stages');
    const paths = join(tmp, 'paths');
    const result = spawnSync(
      process.execPath,
      [script, join(fixtures, 'tiled-sample.tmj'), '--stages', stages, '--paths', paths],
      { cwd: repo, encoding: 'utf8' },
    );
    expect(result.status, String(result.stderr)).toBe(0);
    const written = JSON.parse(
      readFileSync(join(stages, 'tiled-sample.stage.json'), 'utf8'),
    ) as unknown;
    expect(written).toEqual(fixture('tiled-sample.stage.json'));
    const writtenPaths = JSON.parse(
      readFileSync(join(paths, 'tiled-sample.paths.json'), 'utf8'),
    ) as unknown;
    expect(writtenPaths).toEqual(fixture('tiled-sample.paths.json'));
  });

  it('exits 1 with a message for a bad map or bad arguments', () => {
    const bad = spawnSync(process.execPath, [script, '--nope'], { cwd: repo, encoding: 'utf8' });
    expect(bad.status).toBe(1);
    expect(String(bad.stderr)).toMatch('unknown option --nope');
    const none = spawnSync(process.execPath, [script], { cwd: repo, encoding: 'utf8' });
    expect(none.status).toBe(1);
    expect(String(none.stderr)).toMatch('usage: tiled-import');
  });
});
