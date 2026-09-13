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
import { StageEventCode, createStageRunner, loadContent } from '@shmup/core';
import { afterAll, describe, expect, it } from 'vitest';
import {
  SPAWN_LEAD,
  TiledImportError,
  VIEW_WIDTH,
  cameraYAt,
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

  it('puts every spawn where its object is in the world, under the panning camera too', () => {
    const tmj = fixture('tiled-sample.tmj') as {
      layers: { objects?: { class?: string; x: number; y: number }[] }[];
    };
    const { stage, paths, warnings } = convertTiledMap(tmj);
    expect(warnings).toEqual([]);
    const { db, issues } = loadContent([
      ...readContentFiles(),
      { path: 'stages/tiled-sample.stage.json', data: stage },
      { path: 'paths/tiled-sample.paths.json', data: paths },
    ]);
    expect(issues).toEqual([]);
    const spec = db.stages[db.stageIndex.get('tiled-sample') ?? -1];
    // The world y each spawn event lands on when the real runner fires it (the enemy system
    // spawns at camera.y + y), keyed by the event's x.
    const landed = new Map<number, number>();
    const runner = createStageRunner(spec, {
      event(code, event) {
        if (code !== StageEventCode.Spawn && code !== StageEventCode.Formation) return;
        landed.set(event.x, runner.camera.y + ((event as { y?: number }).y ?? NaN));
      },
      clear() {},
    });
    // The low branch too (its trigger is never probed here).
    runner.setFlag(0, true);
    for (let t = 0; t < 2000 && !runner.ended; t++) runner.tick();
    expect(runner.ended).toBe(true);
    const spawns = tmj.layers
      .flatMap((l) => l.objects ?? [])
      .filter((o) => o.class === 'spawn' || o.class === 'formation');
    expect(landed.size).toBe(spawns.length);
    for (const object of spawns) {
      const at = Math.max(0, Math.round(object.x) - SPAWN_LEAD);
      // Within a pixel: the camera may overshoot the event's x by up to one tick's scroll.
      expect(Math.abs((landed.get(at) ?? NaN) - object.y)).toBeLessThanOrEqual(1);
    }
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

  it('cameraYAt: keys before x (and at 0), timed pans finished, diagonal pans interpolated', () => {
    const keys = [
      { x: 0, speed: 1, yTo: 8 },
      { x: 100, speed: 1, yTo: 40, yTicks: 60 },
      { x: 200, speed: 1, yTo: 0, yOver: 100 },
      { x: 250, speed: 1, yTo: 60, yOver: 40 },
    ];
    expect(cameraYAt([], 50)).toBe(0);
    expect(cameraYAt(keys, 0)).toBe(8); // the first tick applies the key at 0 before the events
    expect(cameraYAt(keys, 100)).toBe(8); // a key applies the tick after the camera reaches it
    expect(cameraYAt(keys, 101)).toBe(40);
    expect(cameraYAt(keys, 225)).toBe(30); // a quarter of the way from 40 to 0
    // The next diagonal pan starts where the first one had the camera (20 at x 250).
    expect(cameraYAt(keys, 270)).toBe(40);
    expect(cameraYAt(keys, 400)).toBe(60);
  });

  it('writes spawn y relative to the camera the keys give; blocks and triggers stay in world', () => {
    const { stage, warnings } = convertTiledMap(
      map([
        objects(
          { id: 1, class: 'camera', x: 0, properties: [{ name: 'speed', value: 2 }] },
          {
            id: 2,
            class: 'camera',
            x: 100,
            properties: [
              { name: 'speed', value: 2 },
              { name: 'hold', value: 90 },
              { name: 'yTo', value: 72 },
              { name: 'yTicks', value: 60 },
            ],
          },
          { id: 3, class: 'spawn', name: 'drifter', x: 600, y: 200 },
          {
            id: 4,
            class: 'formation',
            x: 650,
            y: 150,
            properties: [
              { name: 'enemy', value: 'fan' },
              { name: 'count', value: 2 },
              { name: 'interval', value: 8 },
            ],
          },
          { id: 5, class: 'block', x: 640, y: 200, width: 16, height: 8 },
          {
            id: 6,
            class: 'trigger',
            x: 500,
            y: 180,
            width: 40,
            height: 40,
            properties: [{ name: 'flag', value: 'f' }],
          },
        ),
      ]),
    );
    expect(warnings).toEqual([]);
    expect(stage.events).toEqual([
      { x: 116, type: 'trigger', flag: 'f', region: { x: 500, y: 180, w: 40, h: 40 } },
      { x: 200, type: 'spawn', enemy: 'drifter', y: 200 - 72 },
      { x: 240, type: 'block', y: 200, w: 16, h: 8 },
      { x: 250, type: 'formation', enemy: 'fan', count: 2, interval: 8, y: 150 - 72 },
    ]);
  });

  it('warns about a spawn that fires while a timed pan may still be running', () => {
    const pan = (extra: { name: string; value: unknown }[]) =>
      map([
        objects(
          {
            id: 1,
            class: 'camera',
            x: 100,
            properties: [
              { name: 'speed', value: 2 },
              { name: 'yTo', value: 40 },
              { name: 'yTicks', value: 60 },
              ...extra,
            ],
          },
          { id: 2, class: 'spawn', name: 'drifter', x: 560, y: 100 },
        ),
      ]);
    // 60 ticks at 2 px/tick: the pan runs until about x 220; the spawn fires at 160.
    const running = convertTiledMap(pan([]));
    expect(running.warnings).toEqual([
      'object 2 "drifter": the timed camera pan of the key at x 100 may still be running at x ' +
        '160 (until about x 220); y assumes it has reached 40',
    ]);
    expect(running.stage.events).toEqual([{ x: 160, type: 'spawn', enemy: 'drifter', y: 60 }]);
    // Over during a hold, or waiting behind a boss lock: no warning.
    expect(convertTiledMap(pan([{ name: 'hold', value: 60 }])).warnings).toEqual([]);
    expect(convertTiledMap(pan([{ name: 'lock', value: true }])).warnings).toEqual([]);
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
    expect(String(result.stderr)).toBe('');
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
