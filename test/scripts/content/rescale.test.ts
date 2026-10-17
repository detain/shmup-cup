/**
 * `scripts/content/rescale.mjs` (plan_resolution.md R1-03, run for real by R2-02's ×1.5 port):
 *
 * - factor 1 is the identity on the shipped content (and the examples) — no value changes;
 * - a ×1.5 / 36-px dry run of the shipped content leaves nothing unclassified (owner decision O6)
 *   and writes nothing;
 * - the fixture content `fixtures/rescale/v1/` ports to exactly `fixtures/rescale/expected-1.5/`
 *   (every value checked by hand against §2.6 and the owner decisions: 400 → 664, the boss at
 *   296 → 508 and 100 → 168, a spawn above the top edge ×k only, raster bands that still add up,
 *   masks resampled, three copies of the top RLE row, expressions wrapped, audio untouched, the
 *   demos skipped);
 * - the ported fixture loads through every loader without an issue (the round trip), with the
 *   terrain cell for cell what it was, three rows lower, and the world values ×1.5;
 * - the command line prints the report, honours `--dry-run` and `--json`, and fails on bad
 *   arguments;
 * - review round 2: the shipped port lists gimmick-range's falling rock, whose branch is now read
 *   while the trigger that decides it is still armed, and gives each re-sorted timeline's old →
 *   new indices.
 *
 * The fixtures carry the geometry they were written for (`fixtures/rescale/geometry.json`), so
 * these tests do not depend on core's frame constants (which R2-01 flips).
 */
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as core from '@shmup/core';
import {
  KNOWN_SCRIPT_IDS,
  PLAYFIELD_H,
  PLAYFIELD_W,
  loadContent,
  type ContentFile,
  type StageTerrain,
} from '@shmup/core';
import * as audio from '@shmup/audio-web';
import * as input from '@shmup/input-web';
import { FX_FILE_SCHEMA, loadFxContent } from '@shmup/render-pixi';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  loadArt,
  measureArtScale,
  modulesFrom,
  rescaleContent,
  type RescaleModules,
  type RescaleOptions,
} from '../../../scripts/content/rescale.mjs';
import { readContentFiles } from '../../../vite.shared.js';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..', '..');
const fixtures = join(here, 'fixtures', 'rescale');
const v1Root = join(fixtures, 'v1');
const expectedRoot = join(fixtures, 'expected-1.5');
/** The fixtures' atlas manifest: the parallax bands' art heights. */
const atlas = join(fixtures, 'atlas.json');
const script = join(repo, 'scripts', 'content', 'rescale.mjs');
const tmp = mkdtempSync(join(tmpdir(), 'shmup-rescale-'));

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

/** The fixtures' geometry (`fixtures/rescale/geometry.json`). */
const GEOMETRY = JSON.parse(readFileSync(join(fixtures, 'geometry.json'), 'utf8')) as {
  frame: RescaleModules['frame'];
  port: { factor: number; topPad: number; toWidth: number; toHeight: number; toTileSize: number };
};

/** The packages, as the tool's command line loads them. */
const MODULES: RescaleModules = modulesFrom(
  core,
  { audio, input, particles: { FX_FILE_SCHEMA } },
  readContentFiles,
);

/** The same, with the fixtures' frame as the default geometry. */
const FIXTURE_MODULES: RescaleModules = { ...MODULES, frame: GEOMETRY.frame };

/** The tile size the shipped content is drawn at (its tilesets'). */
const SHIPPED_TILE_SIZE = (
  JSON.parse(readFileSync(join(repo, 'content', 'tilesets', 'terrain-a.tileset.json'), 'utf8')) as {
    tileSize: number;
  }
).tileSize;

/**
 * The atlas art's scale against the shipped content's pixels, as the tool measures it from the
 * terrain tiles (1 today; 1.5 between R2-01's interim art and R2-02's port) — passed as
 * `--art-scale`, so the shipped runs hold in every window of the R2 switch.
 */
let shippedArtScale = 1;

beforeAll(async () => {
  const dir = join(repo, 'content', 'tilesets');
  const tilesets = readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => ({ path: `tilesets/${name}`, text: readFileSync(join(dir, name), 'utf8') }));
  const measured = measureArtScale(tilesets, await loadArt({ atlas: null, artScale: null }));
  expect(measured.tiles.length).toBeGreaterThan(0);
  shippedArtScale = measured.scale ?? 1;
}, 60_000);

/**
 * Options with defaults.
 *
 * @param overrides - What differs.
 * @returns The options.
 */
function options(overrides: Partial<RescaleOptions>): RescaleOptions {
  return {
    factor: 1,
    topPad: 0,
    dryRun: true,
    root: join(repo, 'content'),
    examples: true,
    fromWidth: null,
    fromHeight: null,
    tileSize: null,
    toWidth: null,
    atlas: null,
    artScale: null,
    json: false,
    quiet: false,
    ...overrides,
  };
}

/**
 * The shipped content's own geometry, given explicitly (so the runs hold in every window of the
 * R2 switch, whatever core's constants say).
 *
 * @param factor - k.
 * @param topPad - The pad.
 * @returns The options for a dry run of `content/`.
 */
function shipped(factor: number, topPad: number): RescaleOptions {
  return options({
    factor,
    topPad,
    fromWidth: PLAYFIELD_W,
    fromHeight: PLAYFIELD_H,
    tileSize: SHIPPED_TILE_SIZE,
    toWidth: PLAYFIELD_W,
    artScale: shippedArtScale,
  });
}

/**
 * Every file below a directory.
 *
 * @param dir - Absolute directory.
 * @param prefix - Its path below the walk's root.
 * @returns Root-relative POSIX paths, sorted.
 */
function listFiles(dir: string, prefix = ''): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir).sort()) {
    const relative = prefix === '' ? entry : `${prefix}/${entry}`;
    if (statSync(join(dir, entry)).isDirectory())
      out.push(...listFiles(join(dir, entry), relative));
    else out.push(relative);
  }
  return out;
}

/**
 * Copies the v1 fixture to a fresh temporary content root.
 *
 * @param name - Directory name below the test's temp dir.
 * @returns The copy's path.
 */
function copyFixture(name: string): string {
  const root = join(tmp, name);
  cpSync(v1Root, root, { recursive: true });
  return root;
}

/**
 * Loads a fixture root through every loader the shell uses (minus the `edges` files, whose
 * frame-anchored values leave today's schema bounds once ported, and the skipped demos).
 *
 * @param root - A fixture content root.
 * @returns The core DB, the fx content and every loader's issues.
 */
function loadFixture(root: string) {
  const files: ContentFile[] = readContentFiles(root).filter(
    (file) => !file.path.includes('edges') && !file.path.startsWith('demos/'),
  );
  const loaded = loadContent(files, { knownScripts: KNOWN_SCRIPT_IDS });
  const ofKind = (kind: string): ContentFile[] =>
    loaded.foreign.filter((file) => (file.data as { kind?: unknown }).kind === kind);
  const fx = loadFxContent(ofKind('fx'));
  const sfx = audio.loadSfxContent(ofKind('sfx'));
  return { db: loaded.db, fx: fx.content, issues: [...loaded.issues, ...fx.issues, ...sfx.issues] };
}

/**
 * One cell of an expanded terrain.
 *
 * @param terrain - The terrain.
 * @param col - Column.
 * @param row - Row.
 * @returns Its tile id.
 */
const cell = (terrain: StageTerrain, col: number, row: number): number =>
  terrain.tiles[row * terrain.cols + col] ?? -1;

describe('scripts/content/rescale: the shipped content', () => {
  it('is the identity at factor 1: no value changes, nothing unclassified', async () => {
    const result = await rescaleContent(shipped(1, 0), MODULES);
    expect(result.errors).toEqual([]);
    expect(result.unclassified).toEqual([]);
    expect(result.changes).toBe(0);
    expect(result.changed).toEqual([]);
    expect(result.written).toEqual([]);
    expect(result.values).toBeGreaterThan(10000);
    // The demos (and their example) are left alone.
    expect(result.skipped.length).toBeGreaterThan(9);
    expect(result.skipped.every((path) => path.startsWith('demos/'))).toBe(true);
  });

  it('classifies every value of a ×1.5 / 36-px port (owner decision O6), writing nothing', async () => {
    const result = await rescaleContent(shipped(1.5, 36), MODULES);
    expect(result.errors).toEqual([]);
    expect(result.unclassified).toEqual([]);
    expect(result.refused).toBe(false);
    expect(result.written).toEqual([]);
    expect(result.changes).toBeGreaterThan(3000);
    expect(result.geometry.padRows).toBe(3);
    // The spawns above the top edge are listed for R2-02's hand fixes.
    expect(result.aboveTop.some((entry) => entry.note.startsWith('spawn'))).toBe(true);
    // The camera's yTo ports ×k, so no map is seen past; the field pairs moved some events
    // against the timeline, and the backdrop placed some bands by a fallback.
    expect(result.views).toEqual([]);
    expect(result.timeline.length).toBeGreaterThan(0);
    expect(result.backdrop.length).toBeGreaterThan(0);
  });

  it('lists what the real v1 → v2 port must fix by hand (review round 2)', async () => {
    // The geometry this content was written for and v2's playfield (the fixtures' geometry.json:
    // R2-02's real run passes the same numbers as flags).
    const result = await rescaleContent(
      options({
        factor: GEOMETRY.port.factor,
        topPad: GEOMETRY.port.topPad,
        fromWidth: GEOMETRY.frame.playfieldW,
        fromHeight: GEOMETRY.frame.playfieldH,
        tileSize: GEOMETRY.frame.tileSize,
        toWidth: GEOMETRY.port.toWidth,
        artScale: shippedArtScale,
      }),
      MODULES,
    );
    expect(result.errors).toEqual([]);
    expect(result.unclassified).toEqual([]);
    expect(result.geometry.toHeight).toBe(GEOMETRY.port.toHeight);
    // gimmick-range's falling rock (branch "high" on "took-low") fired after the trigger
    // events[8] disarmed at 1540; ported it fires at 2276, while the trigger is armed up to 2310
    // — listed (R2-02 gives the trigger an until below 2276 by hand).
    const rock = result.timeline.filter(
      (entry) => entry.file === 'stages/gimmick-range.stage.json' && entry.path === 'events[10].x',
    );
    expect(rock.map((entry) => [entry.from, entry.to])).toEqual([[1560, 2276]]);
    expect(rock[0]?.note).toMatch(
      /^its branch "high" reads the flag "took-low" of the trigger events\[8\] \(armed 1050 … 1540 → 1575 … 2310\).*until below 2276/,
    );
    // The two crossings of the shipped timeline: the rock, and zone-g's ground enemy that leaves
    // its ground bonus entrance's window.
    const crossings = result.timeline.filter(
      (entry) => entry.path.endsWith('.x') && !entry.note.startsWith('a moving block'),
    );
    expect(crossings.map((entry) => `${entry.file}:${entry.path}`)).toEqual([
      'stages/gimmick-range.stage.json:events[10].x',
      'stages/zone-g.stage.json:events[15].x',
    ]);
    // Every re-sorted timeline gives its old → new indices: a permutation of the moved items.
    const sorts = result.timeline.filter((entry) => entry.field === 'events');
    expect(sorts.map((entry) => entry.file)).toEqual([
      'stages/gimmick-range.stage.json',
      'stages/zone-c.stage.json',
      'stages/zone-d.stage.json',
      'stages/zone-g.stage.json',
      'stages/zone-h.stage.json',
    ]);
    for (const entry of sorts) {
      const from = entry.from as number[];
      const to = entry.to as number[];
      expect(from.length, entry.file).toBeGreaterThan(1);
      expect(
        [...to].sort((a, b) => a - b),
        entry.file,
      ).toEqual(from);
      expect(entry.note, entry.file).toContain(`${String(from[0])} → ${String(to[0])}`);
    }
    expect(sorts[0]?.from).toEqual([9, 10]);
    expect(sorts[0]?.to).toEqual([10, 9]);
    // No backdrop band of the shipped content touches two anchors.
    expect(result.backdrop.filter((entry) => entry.note.includes('two anchors'))).toEqual([]);
  });
});

describe('scripts/content/rescale: the fixtures', () => {
  it('ports v1/ to exactly expected-1.5/', async () => {
    const root = copyFixture('known');
    const result = await rescaleContent(
      options({
        factor: GEOMETRY.port.factor,
        topPad: GEOMETRY.port.topPad,
        root,
        dryRun: false,
        atlas,
      }),
      FIXTURE_MODULES,
    );
    expect(result.errors).toEqual([]);
    expect(result.unclassified).toEqual([]);
    expect(result.geometry).toMatchObject({
      toWidth: GEOMETRY.port.toWidth,
      toHeight: GEOMETRY.port.toHeight,
      toTileSize: GEOMETRY.port.toTileSize,
    });
    expect(result.written).toEqual([
      'enemies/edges.enemies.json',
      'enemies/mini.enemies.json',
      'fx/mini.fx.json',
      'paths/mini.paths.json',
      'patterns/mini.patterns.json',
      'stages/edges.stage.json',
      'stages/mini.stage.json',
      'tilesets/terrain-a.tileset.json',
    ]);
    expect(listFiles(root)).toEqual(listFiles(expectedRoot));
    for (const path of listFiles(expectedRoot)) {
      expect(readFileSync(join(root, path), 'utf8'), path).toBe(
        readFileSync(join(expectedRoot, path), 'utf8'),
      );
    }
    // The audio and the demo are untouched.
    for (const path of ['audio/mini.sfx.json', 'demos/skipped.replay.json']) {
      expect(readFileSync(join(root, path), 'utf8')).toBe(readFileSync(join(v1Root, path), 'utf8'));
    }
  });

  it('reports what R2-02 must look at', async () => {
    const result = await rescaleContent(
      options({ factor: GEOMETRY.port.factor, topPad: GEOMETRY.port.topPad, root: v1Root, atlas }),
      FIXTURE_MODULES,
    );
    expect(result.written).toEqual([]);
    const listed = (entries: readonly { file: string; path: string }[]): string[] =>
      entries.map((entry) => `${entry.file}:${entry.path}`);
    // Spawns first, then the other values on or above the top edge.
    expect(listed(result.aboveTop)).toEqual([
      'stages/edges.stage.json:events[2].y',
      'stages/mini.stage.json:events[1].y',
      'enemies/edges.enemies.json:enemies[0].mover.y',
      'stages/edges.stage.json:events[4].y',
      'stages/edges.stage.json:events[5].region.y',
    ]);
    // The brick and the region hanging from the top edge grow by the pad instead of moving down.
    expect(result.aboveTop.slice(3).map((entry) => [entry.to, entry.note])).toEqual([
      [0, 'hangs from the top edge: its top stays, its height grows by the pad (24 → 72)'],
      [0, 'hangs from the top edge: its top stays, its height grows by the pad (16 → 60)'],
    ]);
    expect(listed(result.rounded)).toEqual([
      'enemies/edges.enemies.json:enemies[2].boss.parts[0].hurtbox.hw',
      'enemies/edges.enemies.json:enemies[2].boss.parts[0].hurtbox.hh',
      'enemies/mini.enemies.json:enemies[0].hurtbox.hw',
      'enemies/mini.enemies.json:enemies[0].hurtbox.hh',
      'enemies/mini.enemies.json:enemies[1].boss.parts[1].hurtbox.hw',
      'enemies/mini.enemies.json:enemies[1].boss.parts[1].hurtbox.hh',
      'stages/edges.stage.json:raster[0].bands',
      'stages/edges.stage.json:raster[1].bands',
    ]);
    // The second raster's top and bottom do not scale ×k together: its bands are spread.
    expect(result.rounded[result.rounded.length - 1]?.to).toEqual([42, 42, 42]);
    expect(result.rounded[result.rounded.length - 1]?.note).toMatch(/do not scale ×k together/);
    expect(listed(result.outOfBounds)).toEqual([
      'enemies/edges.enemies.json:enemies[0].mover.x',
      'enemies/edges.enemies.json:enemies[2].boss.x',
      'stages/edges.stage.json:events[0].screenX',
      'stages/edges.stage.json:events[7].screenX',
      'stages/edges.stage.json:raster[0].top',
      'stages/edges.stage.json:raster[0].bottom',
      'stages/edges.stage.json:mode7.bottom',
    ]);
    expect(result.views).toEqual([]);
    // The field pairs: a moving block now created earlier, a ground enemy before the checkpoint
    // it followed, a branch-gated one now read while its flag's trigger is armed, one before a
    // flag event it followed, one at a camera hold it came after, one out of the ground entrance's
    // window — and the timeline re-sorted, with its old → new indices.
    expect(result.timeline.map((entry) => [entry.path, entry.from, entry.to, entry.note])).toEqual([
      [
        'events[3].x',
        300,
        386,
        'a moving block created 64 px of camera travel earlier: its drift / swing runs ahead of v1',
      ],
      ['events[9].x', 610, 883, 'now fires before the checkpoint at 600 (→ 900) it followed'],
      [
        'events[11].x',
        1220,
        1766,
        'its branch "high" reads the flag "low" of the trigger events[10] (armed 1000 … 1200 → ' +
          '1500 … 1800): in v1 it fired after the trigger disarmed, so the branch was decided; ' +
          'now it fires while the trigger is armed — a ship entering the region in camera 1766 … ' +
          "1800 sets the flag after the branch was read, and both branches can play. Keep v1's " +
          'order by hand: give the trigger an until below 1766 (or move the event)',
      ],
      [
        'events[13].x',
        1320,
        1916,
        'now fires before the flag event events[12] (sets "calm" at 1300 → 1950), which it ' +
          'followed in v1',
      ],
      [
        'events[14].x',
        1420,
        2066,
        'now fires when the camera reaches the 60-tick camera hold at 1400 (→ 2100), not once ' +
          'it moves on as in v1',
      ],
      [
        'events[7].x',
        505,
        693.5,
        'a ground enemy that leaves the window of the ground bonus entrance events[6] (750 … 960)',
      ],
      [
        'events',
        [6, 7, 12, 13],
        [7, 6, 13, 12],
        're-sorted by the ported x (4 entries change places; ties keep their order): 6 → 7, ' +
          '7 → 6, 12 → 13, 13 → 12 — every other listing names the indices as written',
      ],
    ]);
    // The backdrop: a raster row near a band edge, a band touching nothing.
    expect(listed(result.backdrop)).toEqual([
      'stages/edges.stage.json:raster[0].top',
      'stages/mini.stage.json:parallax[0].y',
    ]);
    expect(listed(result.expressions)).toEqual([
      'patterns/mini.patterns.json:actions[0].body[0].body[0].speed',
      'patterns/mini.patterns.json:actions[1].body[0].speed',
    ]);
    expect(result.masks).toEqual([]);
    expect(result.tilemaps.map((entry) => entry.note)).toEqual([
      '3 rows at the top',
      '3 rows at the top, copies of the top RLE row "10*0, 4*1" (it has tiles); 1 heightfield ' +
        'ceiling(s) move down by the pad',
    ]);
    const moved = new Set(result.moved.map((entry) => entry.unit));
    expect([...moved].sort()).toEqual([
      'band-y',
      'screen-x',
      'screen-y',
      'tile-px',
      'tile-rows',
      'world-px',
      'world-x',
      'world-y',
    ]);
  });

  it('is the identity at factor 1', async () => {
    const result = await rescaleContent(options({ root: v1Root, atlas }), FIXTURE_MODULES);
    expect(result.errors).toEqual([]);
    expect(result.unclassified).toEqual([]);
    expect(result.changes).toBe(0);
    expect(result.skipped).toEqual(['demos/skipped.replay.json']);
  });

  it('round-trips through the loaders: the port loads, terrain cell for cell, world ×1.5', () => {
    const before = loadFixture(v1Root);
    const after = loadFixture(expectedRoot);
    expect(before.issues).toEqual([]);
    expect(after.issues).toEqual([]);
    const k = GEOMETRY.port.factor;
    const v1 = before.db.stages[before.db.stageIndex.get('mini') ?? -1];
    const v2 = after.db.stages[after.db.stageIndex.get('mini') ?? -1];
    if (v1 === undefined || v2 === undefined) throw new Error('the mini stage did not load');
    expect(v2.length).toBe(v1.length * k);
    expect(v2.events.map((event) => event.x)).toEqual(v1.events.map((event) => event.x * k));
    expect(v2.camera.map((key) => key.speed)).toEqual(v1.camera.map((key) => key.speed * k));
    // Terrain: 12-px tiles, three more rows; every v1 cell three rows lower, the RLE's top row
    // copied into the new rows, the floor where it was.
    const t1 = v1.terrain;
    const t2 = v2.terrain;
    if (t1 === null || t2 === null) throw new Error('the mini stage has no terrain');
    expect(t2.tileSize).toBe(GEOMETRY.port.toTileSize);
    expect(t2.rows).toBe(t1.rows + 3);
    const cols = Math.min(t1.cols, t2.cols);
    // The ceiling segment (from column 75 on) ramps down from the top edge: compare the floor
    // and RLE columns before it cell for cell.
    const ceilingFrom = 600 / GEOMETRY.frame.tileSize;
    let compared = 0;
    for (let col = 0; col < Math.min(cols, ceilingFrom); col++) {
      for (let row = 0; row < t1.rows; row++) {
        expect(cell(t2, col, row + 3), `col ${col} row ${row}`).toBe(cell(t1, col, row));
        compared++;
      }
      for (let row = 0; row < 3; row++) expect(cell(t2, col, row)).toBe(cell(t1, col, 0));
    }
    expect(compared).toBeGreaterThan(1000);
    // Under the ceiling: v2 is v1 three rows lower, plus solid rows where v1's ceiling touched the
    // top edge — once the profile has ramped in: its base is three tiles deeper, and a profile
    // ramps in and out at most a tile per column, so v2 needs a few more columns at either end.
    let thickened = 0;
    const ceilingTo = 1000 / GEOMETRY.frame.tileSize;
    for (let col = ceilingFrom + 8; col < Math.min(cols, ceilingTo - 6); col++) {
      for (let row = 0; row < t1.rows; row++) {
        expect(cell(t2, col, row + 3), `col ${col} row ${row}`).toBe(cell(t1, col, row));
      }
      if (cell(t1, col, 0) !== 0) {
        for (let row = 0; row < 3; row++) expect(cell(t2, col, row)).not.toBe(0);
        thickened++;
      }
    }
    expect(thickened).toBeGreaterThan(10);
    // Paths: the baked length ×1.5, the end tangent (a unit vector) the same.
    const path1 = before.db.paths[0];
    const path2 = after.db.paths[0];
    expect(path2?.table.length).toBeCloseTo((path1?.table.length ?? 0) * k, 6);
    expect(path2?.table.endDx).toBeCloseTo(path1?.table.endDx ?? 0, 9);
    expect(path2?.table.endDy).toBeCloseTo(path1?.table.endDy ?? 0, 9);
    // Enemies and fx: world values ×1.5 (hurtboxes rounded to whole pixels).
    const drifter1 = before.db.enemies[before.db.enemyIndex.get('mini-drifter') ?? -1];
    const drifter2 = after.db.enemies[after.db.enemyIndex.get('mini-drifter') ?? -1];
    expect(drifter2?.hurtbox).toEqual({
      hw: Math.round((drifter1?.hurtbox.hw ?? 0) * k),
      hh: Math.round((drifter1?.hurtbox.hh ?? 0) * k),
    });
    expect(drifter2?.params).toEqual({ speed: 1.5, amp: 18, period: 90 });
    expect(after.fx.presets[0]?.speed).toEqual({ min: 1.2, max: 3.3 });
    expect(after.fx.presets[0]?.radius).toBe((before.fx.presets[0]?.radius ?? 0) * k);
    expect(after.fx.presets[0]?.lifetime).toEqual(before.fx.presets[0]?.lifetime);
  });
});

describe('scripts/content/rescale: the command line', () => {
  /**
   * Runs the script.
   *
   * @param args - Its arguments.
   * @returns The process result.
   */
  const run = (args: string[]) =>
    spawnSync(process.execPath, [script, ...args], { cwd: repo, encoding: 'utf8' });

  /**
   * The fixtures' geometry as flags.
   *
   * @param toWidth - The new playfield's width.
   * @returns The flags.
   */
  const geometry = (toWidth: number): string[] => [
    '--from-width',
    String(GEOMETRY.frame.playfieldW),
    '--from-height',
    String(GEOMETRY.frame.playfieldH),
    '--tile-size',
    String(GEOMETRY.frame.tileSize),
    '--to-width',
    String(toWidth),
  ];

  it('prints the report of a dry run and writes nothing', () => {
    const result = run([
      '--factor',
      String(GEOMETRY.port.factor),
      '--top-pad',
      String(GEOMETRY.port.topPad),
      '--root',
      v1Root,
      '--dry-run',
      '--atlas',
      atlas,
      ...geometry(GEOMETRY.port.toWidth),
    ]);
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('0 unclassified, 0 errors');
    expect(result.stdout).toContain('dry run: nothing written.');
    expect(result.stdout).toContain('on or above the top edge (5):');
    expect(result.stdout).toContain('[screen-x] 400 → 664 — edge-x: snapped to the end');
  }, 60_000);

  it('prints the result as JSON with --json', () => {
    const result = run([
      '--factor',
      '1',
      '--root',
      v1Root,
      '--dry-run',
      '--json',
      '--atlas',
      atlas,
      ...geometry(GEOMETRY.frame.playfieldW),
    ]);
    expect(result.status).toBe(0);
    const json = JSON.parse(result.stdout) as { changes: number; skipped: string[] };
    expect(json.changes).toBe(0);
    expect(json.skipped).toEqual(['demos/skipped.replay.json']);
  }, 60_000);

  it('fails on bad arguments with exit code 2', () => {
    const missing = run(['--dry-run']);
    expect(missing.status).toBe(2);
    expect(missing.stderr).toContain('--factor K is required');
    const unknown = run(['--factor', '1.5', '--bogus']);
    expect(unknown.status).toBe(2);
    expect(unknown.stderr).toContain('unknown option --bogus');
  });
});
