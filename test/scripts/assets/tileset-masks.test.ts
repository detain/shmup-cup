/**
 * `scripts/assets/tileset-masks.mjs` (R3-03.V4b) and the exported terrain checks
 * (`test/integration/terrain-checks.ts`, the same step's copy of the two spec-private checks):
 *
 * - the copied checks really work on tilesets they did not grow up with — a 12-px fixture
 *   tileset whose art is V4a's ingested PNGs (`cliff.png`, `stack.png`) plus the procedural
 *   terrain tiles, plus the fixed heightfield stage;
 * - `--check` fails LOUDLY when a tileset and its `<name>.masks.json` disagree (the repo-side
 *   guard the ingest tool cannot be: its own check rewrites the sidecar silently), pair mode and
 *   scan mode alike, and passes on an agreeing pair and on a repository with no sidecars;
 * - `--write` refuses to change a solid tile's mask (the heightfield places those by anchor +
 *   mask, decision W5-11), writes nothing when it refuses, copies with `--allow-remap`, and then
 *   the pair agrees;
 * - frames are matched by INDEX: a sidecar whose entry names differ from the tileset's warns
 *   instead of failing;
 * - `--write` never touches the repository's `content/` — it rewrites only the tileset path it
 *   is given, so a path under a temp root writes there and the shipped bytes stay exactly.
 */
import { createHash } from 'node:crypto';
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { MAX_TILE_SIZE, loadContent, type ContentFile } from '@shmup/core';
import { crop, getPixel, type Image } from '../../../scripts/assets/image.mjs';
import { decodePng } from '../../../scripts/assets/png.mjs';
import { renderTerrainTiles } from '../../../scripts/assets/procedural/terrain.mjs';
import { main } from '../../../scripts/assets/tileset-masks.mjs';
import {
  expectHeightfieldFindsTiles,
  expectMasksMatchArt,
} from '../../integration/terrain-checks.js';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const FIXTURES = join(REPO, 'art-prompts/ingest/test/fixtures/tiles');

const tmp = mkdtempSync(join(tmpdir(), 'shmup-tileset-masks-'));

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

/** The collision tiles of a fixture tileset file (the schema V4a's loader reads). */
interface FixtureTile {
  name: string;
  type: string;
  frame: number;
  anchor: string;
  mask: number[];
}

/** The sidecar document of schema `shmup-ingest-masks@1`. */
interface SidecarDoc {
  format: string;
  sprite: string;
  tileset: string;
  tileSize: number;
  frames: { frame: number; tile: string; anchor: string; mask: number[] }[];
}

/**
 * Reads one JSON file.
 *
 * @param file - The absolute path.
 * @returns The parsed document.
 */
function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, 'utf8')) as T;
}

/**
 * Writes a scratch document under the temp folder.
 *
 * @param name - A name below the temp folder (slash separated).
 * @param text - The exact text to write.
 * @returns The absolute path.
 */
function scratch(name: string, text: string): string {
  const file = join(tmp, ...name.split('/'));
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
  return file;
}

/**
 * Runs the CLI in-process.
 *
 * @param args - The arguments.
 * @returns The exit code and everything the tool wrote.
 */
async function cli(args: string[]): Promise<{ code: number; out: string; err: string }> {
  let out = '';
  let err = '';
  const code = await main(args, {
    stdout: {
      write: (text: string) => {
        out += text;
        return true;
      },
    },
    stderr: {
      write: (text: string) => {
        err += text;
        return true;
      },
    },
  });
  return { code, out, err };
}

/* ------------------------------------------------------------------------ the checks ---- */

const FULL: number[] = Array.from({ length: MAX_TILE_SIZE }, () => MAX_TILE_SIZE);
const RAMP_UP: number[] = Array.from({ length: MAX_TILE_SIZE }, (_v, i) => i + 1);
const RAMP_DOWN: number[] = Array.from({ length: MAX_TILE_SIZE }, (_v, i) => MAX_TILE_SIZE - i);
const LOW: number[] = [0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6];
const HIGH: number[] = [6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12];
const DOWN_HIGH: number[] = [12, 11, 11, 10, 10, 9, 9, 8, 8, 7, 7, 6];
const DOWN_LOW: number[] = [6, 5, 5, 4, 4, 3, 3, 2, 2, 1, 1, 0];
/** The masks V4a's `stack.png` really derives (its `stack.masks.json`). */
const STACK_UP: number[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 12];
const STACK_FLAT: number[] = Array.from({ length: MAX_TILE_SIZE }, () => 9);
const STACK_CEIL: number[] = Array.from({ length: MAX_TILE_SIZE }, () => 6);
const STACK_ZIG: number[] = [3, 4, 3, 4, 3, 4, 3, 4, 3, 4, 3, 4];

/**
 * The probe tileset: every mask the fixed heightfield stage shapes at 12 px (full cells by
 * name, each partial shape by anchor + mask, both anchors), on frames whose art the test can
 * actually show — frames `0..5` from one V4a PNG, `6..17` from the procedural terrain tiles
 * (the generator's own shapes, which R1-04 pinned to these masks).
 *
 * @param stack - Whether `frames 0..5` carry V4a's derived masks (`stack.png` art) or the
 *   fixture's designed ones (`cliff.png` art).
 * @returns A tileset content file.
 */
function probeFile(stack: boolean): ContentFile {
  // Frames 0..5, one art slot each: the full block, the 45° ramp up, a second full block for
  // the "floor" name, the ceiling ramp, the hazard zigzag, a third full block for "ceiling"
  // (a full mask anchored to the ceiling is all-opaque — no floating pixels). The generator
  // demands tiles NAMED solid / floor / ceiling; their masks never reach the lookup.
  // Frames of the head (cliff.png has a seventh whole frame, stack.png not): idx by frame.
  // cliff.png art is [block, ramp-up, ramp-down, ceil-ramp, zigzag, whole, whole] — so the
  // 45° shapes of BOTH anchors are heads there, the names solid/floor/ceiling sit on the
  // whole-frame tiles, and the slope-down head claims its mask before any filler. stack.png
  // art is the sidecar's derived masks; the generator's exact shapes then all come from the
  // procedural fillers.
  const first: [string, string, string, number[]][] = stack
    ? [
        ['solid', 'solid', 'floor', FULL],
        ['slope-up-steep', 'solid', 'floor', STACK_UP],
        ['floor', 'solid', 'floor', STACK_FLAT],
        ['ceil-slope-up', 'solid', 'ceiling', STACK_CEIL],
        ['spike', 'hazard', 'floor', STACK_ZIG],
        ['ceiling', 'solid', 'ceiling', FULL],
      ]
    : [
        ['solid', 'solid', 'floor', FULL],
        ['slope-up', 'solid', 'floor', RAMP_UP],
        ['slope-down', 'solid', 'floor', RAMP_DOWN],
        ['ceil-slope-up', 'solid', 'ceiling', RAMP_UP],
        ['spike', 'hazard', 'floor', [2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7]],
        ['floor', 'solid', 'floor', FULL],
        ['ceiling', 'solid', 'ceiling', FULL],
      ];
  // Terrain tiles 5..16: slope-up, slope-down, the four 22.5° floor shapes and the six
  // ceiling ones — every partial shape the heightfield shapes at either anchor. Duplicates
  // of a shape a head already carries are named freely (first id wins the mask lookup).
  const fillers: [string, string, number[]][] = [
    [stack ? 'slope-up' : 'dup-ramp-up', 'floor', RAMP_UP],
    [stack ? 'slope-down' : 'dup-ramp-down', 'floor', RAMP_DOWN],
    ['slope-up-low', 'floor', LOW],
    ['slope-up-high', 'floor', HIGH],
    ['slope-down-high', 'floor', DOWN_HIGH],
    ['slope-down-low', 'floor', DOWN_LOW],
    ['ceil-ramp', 'ceiling', RAMP_UP],
    ['ceil-slope-down', 'ceiling', RAMP_DOWN],
    ['ceil-slope-up-low', 'ceiling', LOW],
    ['ceil-slope-up-high', 'ceiling', HIGH],
    ['ceil-slope-down-high', 'ceiling', DOWN_HIGH],
    ['ceil-slope-down-low', 'ceiling', DOWN_LOW],
  ];
  const tiles = [
    ...first.map(([name, type, anchor, mask], i) => ({
      name,
      type,
      frame: i,
      anchor,
      mask: [...mask],
    })),
    ...fillers.map(([name, anchor, mask], i) => ({
      name,
      type: 'solid',
      frame: i + first.length,
      anchor,
      mask: [...mask],
    })),
  ];
  return {
    path: `tilesets/probe${stack ? '-stack' : ''}.tileset.json`,
    data: {
      formatVersion: 1,
      kind: 'tileset',
      id: `probe-${stack ? 'stack' : 'cliff'}`,
      sprite: 'tiles/probe',
      tileSize: MAX_TILE_SIZE,
      tiles,
    },
  };
}

/**
 * The 12-px art the probe names: V4a's fixture PNG stripped into frames, then the procedural
 * terrain tiles 5..14 (frames 6..15 of a probe sprite).
 *
 * @param stack - Strip `stack.png` instead of `cliff.png` for frames 0..5.
 * @returns One image per frame index.
 */
function probeArt(stack: boolean): Image[] {
  const strip = decodePng(readFileSync(join(FIXTURES, stack ? 'stack.png' : 'cliff.png')));
  const head: Image[] = [];
  for (let i = 0; i < (stack ? 6 : 7); i++)
    head.push(crop(strip, i * MAX_TILE_SIZE, 0, MAX_TILE_SIZE, MAX_TILE_SIZE));
  const terrain = renderTerrainTiles(MAX_TILE_SIZE, 'tiles/terrain-a');
  expect(terrain.length).toBeGreaterThanOrEqual(17);
  return [...head, ...terrain.slice(5, 17)];
}

describe('terrain-checks.ts: the exported copies check any tileset', () => {
  for (const stack of [false, true]) {
    it(`the ${stack ? 'stack.png (V4a-derived masks)' : 'cliff.png (designed masks)'} probe passes both checks`, () => {
      const file = probeFile(stack);
      const { db, issues } = loadContent([file]);
      expect(issues, file.path).toEqual([]);
      const art = probeArt(stack);
      expectMasksMatchArt(
        db.tilesets[0],
        () => [MAX_TILE_SIZE, MAX_TILE_SIZE],
        (frame, x, y) => getPixel(art[frame], x, y)[3] > 0,
      );
      expectHeightfieldFindsTiles(file);
    });
  }
});

/* -------------------------------------------------------------------- the copy tool ---- */

describe('tileset-masks: --check is the loud repo-side guard', () => {
  it('fails on a pair whose masks disagree (the ingest check itself cannot)', async () => {
    // V4a's own fixtures are the exhibit: the derived stack sidecar vs the designed tileset.
    const { code, err } = await cli([
      '--check',
      '--root',
      REPO,
      'art-prompts/ingest/test/fixtures/tiles/fixture.tileset.json',
      'art-prompts/ingest/test/fixtures/tiles/stack.masks.json',
    ]);
    expect(code, err).toBe(1);
    expect(err).toContain('disagreement');
    expect(err).toContain('slope-up');
    expect(err).toContain('--write');
  });

  it('passes on an agreeing pair (the probe carries the sidecar derived from its own art)', async () => {
    const file = probeFile(true);
    const tilesetAbs = scratch(
      'agree/content/tilesets/probe-stack.tileset.json',
      JSON.stringify(file.data, null, 2) + '\n',
    );
    mkdirSync(join(tmp, 'agree/masks'), { recursive: true });
    copyFileSync(join(FIXTURES, 'stack.masks.json'), join(tmp, 'agree/masks/stack.masks.json'));
    const sidecarAbs = join(tmp, 'agree/masks/stack.masks.json');
    const { code, out, err } = await cli([
      '--check',
      '--root',
      join(tmp, 'agree'),
      tilesetAbs,
      sidecarAbs,
    ]);
    expect(code, err).toBe(0);
    expect(out).toContain('agrees');
  });

  it('scans the sidecar folders and fails loudly on a disagreeing pair', async () => {
    // A staging-layout copy: the sidecar under assets/source/sprites/, its tileset named
    // root-relatively, the masks NOT copied yet (the probe keeps the cliff-designed values).
    const file = probeFile(false);
    scratch('scan/content/tilesets/probe.tileset.json', JSON.stringify(file.data, null, 2) + '\n');
    const sidecar = readJson<SidecarDoc>(join(FIXTURES, 'stack.masks.json'));
    sidecar.tileset = 'content/tilesets/probe.tileset.json';
    sidecar.sprite = 'tiles/probe';
    scratch(
      'scan/assets/source/sprites/tiles/probe.masks.json',
      JSON.stringify(sidecar, null, 2) + '\n',
    );
    const { code, err } = await cli(['--check', '--root', join(tmp, 'scan')]);
    expect(code, err).toBe(1);
    expect(err).toContain('probe');
    expect(err).toContain('disagreement');
  });

  it('a scan at rest says so when the folders hold no sidecars', async () => {
    const { code, out } = await cli(['--check']); // default root: this repository checkout
    expect(code, out).toBe(0);
    expect(out).toContain('nothing to check');
  });

  it('a scan reports a sidecar naming a tileset that does not exist', async () => {
    const sidecar = readJson<SidecarDoc>(join(FIXTURES, 'stack.masks.json'));
    sidecar.tileset = 'content/tilesets/nope.tileset.json';
    scratch('bad/assets/source/sprites/x.masks.json', JSON.stringify(sidecar, null, 2) + '\n');
    const { code, err } = await cli(['--check', '--root', join(tmp, 'bad')]);
    expect(code, err).toBe(1);
    expect(err).toContain('nope.tileset.json');
  });

  it('refuses a frame claimed twice with different masks', async () => {
    const file = probeFile(true);
    scratch('dup/content/tilesets/probe.tileset.json', JSON.stringify(file.data, null, 2) + '\n');
    const base = readJson<SidecarDoc>(join(FIXTURES, 'stack.masks.json'));
    base.tileset = 'content/tilesets/probe.tileset.json';
    scratch('dup/assets/source/sprites/a.masks.json', JSON.stringify(base, null, 2) + '\n');
    const rival = structuredClone(base);
    rival.frames[1].mask = Array.from({ length: MAX_TILE_SIZE }, () => 3);
    scratch('dup/assets/source/sprites/b.masks.json', JSON.stringify(rival, null, 2) + '\n');
    const { code, err } = await cli(['--check', '--root', join(tmp, 'dup')]);
    expect(code, err).toBe(1);
    expect(err).toContain('claimed by both');
  });
});

describe('tileset-masks: --write copies masks and refuses to remap the terrain', () => {
  it('refuses to change a solid tile, writes nothing, names the tiles', async () => {
    const target = scratch(
      'refuse/fixture.tileset.json',
      readFileSync(join(FIXTURES, 'fixture.tileset.json'), 'utf8'),
    );
    const before = readFileSync(target, 'utf8');
    const { code, err } = await cli([
      '--write',
      '--root',
      REPO,
      target,
      'art-prompts/ingest/test/fixtures/tiles/stack.masks.json',
    ]);
    expect(code, err).toBe(1);
    expect(readFileSync(target, 'utf8')).toBe(before);
    for (const name of ['slope-up', 'slope-down', 'overhang']) expect(err, name).toContain(name);
    expect(err).toContain('--allow-remap');
    // Exactly the three solid slopes are refused — the block agrees and the hazard spike,
    // which the heightfield never places, is free to move and so absent from the refusal.
    const refusalLines = err.split('\n').filter((line) => line.includes('would become'));
    expect(refusalLines.length).toBe(3);
    expect(refusalLines.some((line) => line.includes('spike'))).toBe(false);
    expect(err).toContain('nothing written');
  });

  it('copies with --allow-remap, keeps names and order, and the pair agrees after', async () => {
    const target = scratch(
      'allow/fixture.tileset.json',
      readFileSync(join(FIXTURES, 'fixture.tileset.json'), 'utf8'),
    );
    const sidecarAbs = join(FIXTURES, 'stack.masks.json');
    const sidecarBefore = readFileSync(sidecarAbs, 'utf8');
    const { code, out, err } = await cli([
      '--write',
      '--allow-remap',
      '--root',
      REPO,
      target,
      'art-prompts/ingest/test/fixtures/tiles/stack.masks.json',
    ]);
    expect(code, err).toBe(0);
    expect(out).toContain('copied');
    const after = readJson<{ tileSize: number; tiles: FixtureTile[] }>(target);
    const claims = new Map<number, { tile: string; anchor: string; mask: number[] }>();
    for (const e of readJson<SidecarDoc>(sidecarAbs).frames)
      if (!claims.has(e.frame)) claims.set(e.frame, e);
    for (const tile of after.tiles) {
      const claim = claims.get(tile.frame);
      if (claim === undefined) continue; // the empty deco: never claimed
      expect(tile.mask, tile.name).toEqual(claim.mask);
    }
    // Names, order and the sidecar itself are untouched.
    const before = readJson<{ tiles: FixtureTile[] }>(join(FIXTURES, 'fixture.tileset.json'));
    expect(after.tiles.map((t) => t.name)).toEqual(before.tiles.map((t) => t.name));
    expect(readFileSync(sidecarAbs, 'utf8')).toBe(sidecarBefore);
    // And now the pair agrees, check mode and write mode alike.
    const check = await cli(['--check', '--root', join(tmp, 'allow'), target, sidecarAbs]);
    expect(check.code, check.err).toBe(0);
    const again = await cli(['--write', '--root', join(tmp, 'allow'), target, sidecarAbs]);
    expect(again.code, again.err).toBe(0);
    expect(again.out).toContain('nothing to write');
  });

  it('copies a hazard-only change without the flag', async () => {
    const target = scratch(
      'hazard/fixture.tileset.json',
      readFileSync(join(FIXTURES, 'fixture.tileset.json'), 'utf8'),
    );
    const sidecar = readJson<SidecarDoc>(join(FIXTURES, 'stack.masks.json'));
    // Only the spike (frame 4, a hazard) differs from the fixture's designed masks.
    for (const e of sidecar.frames) {
      const fixtureTile = readJson<{ tiles: FixtureTile[] }>(
        join(FIXTURES, 'fixture.tileset.json'),
      ).tiles.find((t) => t.frame === e.frame);
      if (fixtureTile !== undefined && e.frame !== 4) e.mask = [...fixtureTile.mask];
    }
    const sidecarAbs = scratch('hazard/only.masks.json', JSON.stringify(sidecar, null, 2) + '\n');
    const { code, out, err } = await cli(['--write', target, sidecarAbs]);
    expect(code, err).toBe(0);
    expect(out).toContain('copied 1 mask');
    const after = readJson<{ tiles: FixtureTile[] }>(target);
    expect(after.tiles.find((t) => t.name === 'spike')?.mask).toEqual(STACK_ZIG);
    expect(after.tiles.find((t) => t.name === 'slope-up')?.mask).toEqual(RAMP_UP);
  });

  it('warns but matches by index when the names differ (the probe vs the real stack sidecar)', async () => {
    const file = probeFile(true);
    const target = scratch(
      'byname/content/tilesets/probe-stack.tileset.json',
      JSON.stringify(file.data, null, 2) + '\n',
    );
    const sidecar = readJson<SidecarDoc>(join(FIXTURES, 'stack.masks.json'));
    sidecar.tileset = 'content/tilesets/probe-stack.tileset.json';
    const sidecarAbs = scratch(
      'byname/assets/source/sprites/stack.masks.json',
      JSON.stringify(sidecar, null, 2) + '\n',
    );
    const { code, out, err } = await cli([
      '--write',
      '--root',
      join(tmp, 'byname'),
      target,
      sidecarAbs,
    ]);
    expect(code, err).toBe(0); // the probe already carries these masks — index-matched, no writes
    expect(out).toContain('nothing to write');
    expect(err).toContain('warning');
    expect(err).toContain('block'); // the sidecar's frame-0 name, where the probe says "solid"
  });

  it('fails loudly on an anchor flip, a claim for no tile and a wrong schema', async () => {
    const fixtureText = readFileSync(join(FIXTURES, 'fixture.tileset.json'), 'utf8');
    const target = scratch('flip/fixture.tileset.json', fixtureText);
    const sidecar = readJson<SidecarDoc>(join(FIXTURES, 'stack.masks.json'));
    const flipped = structuredClone(sidecar);
    flipped.frames[1].anchor = 'ceiling';
    const flipFile = scratch('flip/anchor.masks.json', JSON.stringify(flipped, null, 2) + '\n');
    const flip = await cli(['--write', target, flipFile]);
    expect(flip.code, flip.err).toBe(1);
    expect(flip.err).toContain('anchor');
    expect(readFileSync(target, 'utf8')).toBe(fixtureText);

    const ghost = structuredClone(sidecar);
    ghost.frames.push({
      frame: 99,
      tile: 'nowhere',
      anchor: 'floor',
      mask: Array.from({ length: MAX_TILE_SIZE }, () => 1),
    });
    const ghostFile = scratch('flip/ghost.masks.json', JSON.stringify(ghost, null, 2) + '\n');
    const unknown = await cli(['--write', target, ghostFile]);
    expect(unknown.code, unknown.err).toBe(1);
    expect(unknown.err).toContain('frame 99');
    expect(readFileSync(target, 'utf8')).toBe(fixtureText);

    const wrongFile = scratch(
      'flip/wrong.masks.json',
      '{"format":"other","tileSize":1,"frames":[]}\n',
    );
    const wrong = await cli(['--write', target, wrongFile]);
    expect(wrong.code, wrong.err).toBe(1);
    expect(wrong.err).toContain('shmup-ingest-masks@1');
    expect(readFileSync(target, 'utf8')).toBe(fixtureText);
  });
});

describe('tileset-masks: the repository’s content is never moved on its own', () => {
  /** Every shipped tileset file, hashed. */
  function shippedContent(): Map<string, string> {
    const dir = join(REPO, 'content', 'tilesets');
    const hashes = new Map<string, string>();
    for (const name of ['terrain-a.tileset.json']) {
      hashes.set(
        name,
        createHash('sha256')
          .update(readFileSync(join(dir, name)))
          .digest('hex'),
      );
    }
    return hashes;
  }

  it('a successful write leaves the repository content byte-identical', async () => {
    const before = shippedContent();
    const target = scratch(
      'content/fixture.tileset.json',
      readFileSync(join(FIXTURES, 'fixture.tileset.json'), 'utf8'),
    );
    const { code, err } = await cli([
      '--write',
      '--allow-remap',
      '--root',
      REPO,
      target,
      'art-prompts/ingest/test/fixtures/tiles/stack.masks.json',
    ]);
    expect(code, err).toBe(0);
    expect(shippedContent()).toEqual(before);
  });

  it('writes into a content/ path only when it is given one (a temp root)', async () => {
    const file = probeFile(false);
    const target = scratch(
      'intorepo/content/tilesets/probe.tileset.json',
      JSON.stringify(file.data, null, 2) + '\n',
    );
    const sidecar = readJson<SidecarDoc>(join(FIXTURES, 'stack.masks.json'));
    sidecar.tileset = 'content/tilesets/probe.tileset.json';
    const sidecarAbs = scratch(
      'intorepo/assets/source/sprites/probe.masks.json',
      JSON.stringify(sidecar, null, 2) + '\n',
    );
    const before = readJson<{ tiles: FixtureTile[] }>(target);
    const { code, err } = await cli([
      '--write',
      '--allow-remap',
      '--root',
      join(tmp, 'intorepo'),
      'content/tilesets/probe.tileset.json',
      sidecarAbs,
    ]);
    expect(code, err).toBe(0);
    const after = readJson<{ tiles: FixtureTile[] }>(target);
    expect(after.tiles.map((t) => t.mask)).not.toEqual(before.tiles.map((t) => t.mask));
    expect(after.tiles.find((t) => t.name === 'slope-up')?.mask).toEqual(STACK_UP);
  });
});

/* ---------------------------------------------------------- written file validity ---- */

describe('tileset-masks: the written file is still ordinary content', () => {
  it('the content loader accepts a rewritten tileset', async () => {
    // A cheap consistency witness, not a schema test: the tool's output is ordinary JSON.
    const target = scratch(
      'atlas/fixture.tileset.json',
      readFileSync(join(FIXTURES, 'fixture.tileset.json'), 'utf8'),
    );
    const { code, err } = await cli([
      '--write',
      '--allow-remap',
      '--root',
      REPO,
      target,
      'art-prompts/ingest/test/fixtures/tiles/stack.masks.json',
    ]);
    expect(code, err).toBe(0);
    const data = readJson<Record<string, unknown>>(target);
    const { issues } = loadContent([{ path: 'tilesets/fixture.tileset.json', data }]);
    expect(issues).toEqual([]);
  });
});
