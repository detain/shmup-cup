/**
 * End to end, on the synthetic fixtures: the committed outputs are exactly what the recipes
 * produce (byte for byte), a re-run is byte-identical, and each fixture shows the rule it
 * was drawn for — the PNG sheet sliced by a grid with its hand-edit layer, the JPEG's
 * enclosed holes keyed, the green fringe despilled while an enclosed key-green window
 * survives, the far layer quantised to its cycle ramp with the lighting budget warned, the
 * additive glow. Plus the CLI's options, errors and exit codes.
 */
import assert from 'node:assert/strict';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { after, describe, it } from 'node:test';
import { main } from '../ingest.mjs';
import { decodeImage, pngChunks } from '../lib/codec.mjs';
import { chebyshev, packRgb } from '../lib/image.mjs';
import { ingestRecipe } from '../lib/pipeline.mjs';
import { loadModels, sha256Hex } from '../lib/provenance.mjs';

const FIXTURES = join(import.meta.dirname, 'fixtures');
const SPRITES = join(FIXTURES, 'sprites');
const PALETTES = join(FIXTURES, 'palettes');
const tmp = mkdtempSync(join(tmpdir(), 'shmup-ingest-pipeline-'));
after(() => rmSync(tmp, { recursive: true, force: true }));

/** Options of a fixture run. */
const OPTIONS = {
  root: FIXTURES,
  outDir: null,
  palettesDir: PALETTES,
  models: loadModels(),
  date: null,
  today: '2030-01-01',
};

/**
 * A scratch copy of the whole fixture root, so recorded paths stay the same.
 *
 * @param {string} name - Folder name under the temp root.
 * @returns {string} The copy's root.
 */
function copyRoot(name) {
  const dir = join(tmp, name);
  cpSync(FIXTURES, dir, { recursive: true });
  return dir;
}

/**
 * Runs the CLI with captured output.
 *
 * @param {string[]} args - Arguments.
 * @returns {{ code: number, out: string, err: string }} Exit code and output.
 */
function cli(args) {
  /** @type {string[]} */
  const out = [];
  /** @type {string[]} */
  const err = [];
  const code = main(args, {
    log: (l) => out.push(l),
    error: (l) => err.push(l),
    today: '2030-01-01',
  });
  return { code, out: out.join('\n'), err: err.join('\n') };
}

/**
 * Every file below a directory with its bytes.
 *
 * @param {string} dir - Directory.
 * @returns {Map<string, Buffer>} Relative path → bytes.
 */
function snapshot(dir) {
  /** @type {Map<string, Buffer>} */
  const files = new Map();
  for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
    if (entry.isFile()) {
      const full = join(entry.parentPath, entry.name);
      files.set(relative(dir, full), readFileSync(full));
    }
  }
  return files;
}

/**
 * The decoded output strip of a fixture sprite.
 *
 * @param {string} name - Sprite name.
 * @returns {import('../lib/image.mjs').Image} Its pixels.
 */
const output = (name) => decodeImage(readFileSync(join(SPRITES, `${name}.png`))).image;

/**
 * Pixel `[colour, alpha]`.
 *
 * @param {import('../lib/image.mjs').Image} img - Image.
 * @param {number} x - Column.
 * @param {number} y - Row.
 * @returns {[number, number]} Colour and alpha.
 */
const px = (img, x, y) => {
  const p = (y * img.width + x) * 4;
  return [packRgb(img.data[p], img.data[p + 1], img.data[p + 2]), img.data[p + 3]];
};

/**
 * Every opaque colour of an image.
 *
 * @param {import('../lib/image.mjs').Image} img - Image.
 * @returns {Set<number>} Colours.
 */
function opaqueColours(img) {
  const out = new Set();
  for (let i = 0; i < img.width * img.height; i++)
    if (img.data[i * 4 + 3] !== 0) out.add(px(img, i % img.width, Math.floor(i / img.width))[0]);
  return out;
}

describe('the committed fixture outputs', () => {
  it('are exactly what the recipes produce (--check: PNG, sidecar and record byte for byte)', () => {
    const run = cli(['--root', FIXTURES, '--palettes', PALETTES, '--check', SPRITES]);
    assert.equal(run.code, 0, run.err);
    assert.match(run.out, /5 recipe\(s\): 5 ok, 0 failed, 2 with warnings, 0 out of date/);
  });

  it('come out byte-identical on a re-run into another folder, twice', () => {
    const a = join(tmp, 'run-a');
    const b = join(tmp, 'run-b');
    assert.equal(
      cli([
        '--root',
        FIXTURES,
        '--palettes',
        PALETTES,
        '--out',
        a,
        '--date',
        '2026-10-17',
        '-q',
        SPRITES,
      ]).code,
      0,
    );
    assert.equal(
      cli([
        '--root',
        FIXTURES,
        '--palettes',
        PALETTES,
        '--out',
        b,
        '--date',
        '2026-10-17',
        '-q',
        SPRITES,
      ]).code,
      0,
    );
    const first = snapshot(a);
    assert.equal(first.size, 15);
    assert.deepEqual(first, snapshot(b));
    for (const [rel, bytes] of first) {
      assert.deepEqual(bytes, readFileSync(join(SPRITES, rel)), rel);
    }
  });

  it('are PNGs with no ancillary chunks and binary alpha', () => {
    for (const name of [
      'enemies/drone',
      'enemies/gyre',
      'bosses/fringe-hull',
      'backdrops/fixture-far',
      'fx/fixture-glow',
    ]) {
      const bytes = readFileSync(join(SPRITES, `${name}.png`));
      assert.deepEqual(
        pngChunks(bytes).filter((c) => !['IHDR', 'PLTE', 'tRNS', 'IDAT', 'IEND'].includes(c)),
        [],
        name,
      );
      const img = decodeImage(bytes).image;
      for (let p = 3; p < img.data.length; p += 4)
        assert.ok(img.data[p] === 0 || img.data[p] === 255, name);
    }
  });
});

describe('what each fixture shows', () => {
  it('drone (PNG sheet): a 2 × 2 grid sliced to four 16×12 frames, islands removed, the hand edit applied', () => {
    const strip = output('enemies/drone');
    assert.equal(strip.width, 64);
    assert.equal(strip.height, 12);
    assert.deepEqual(px(strip, 6, 3), [0xffffff, 255], 'the painted glint');
    assert.equal(px(strip, 56, 6)[1], 0, 'the erased pixel');
    assert.equal(px(strip, 48 + 1, 5)[1], 0, 'the detached glow island is cleaned away');
    assert.ok(opaqueColours(strip).size <= 8);
    const sidecar = JSON.parse(readFileSync(join(SPRITES, 'enemies', 'drone.json'), 'utf8'));
    assert.deepEqual(
      sidecar.frames.map((/** @type {{ frame: object }} */ f) => f.frame),
      [0, 16, 32, 48].map((x) => ({ x, y: 0, w: 16, h: 12 })),
    );
    assert.deepEqual(sidecar.meta.slices[0].keys[0].pivot, { x: 8, y: 6 });
    assert.deepEqual(sidecar.meta.frameTags, [
      { name: 'idle', from: 0, to: 3, direction: 'forward' },
      { name: 'blink', from: 1, to: 2, direction: 'pingpong' },
    ]);
    const record = JSON.parse(readFileSync(join(SPRITES, 'enemies', 'drone.art.json'), 'utf8'));
    assert.equal(record.origin, 'ai-assisted');
    assert.equal(record.handCleaned, true);
    assert.equal(record.cleanup, 'light', 'the hand-edit layer changed pixels');
    assert.equal(record.use, 'pixels');
    assert.deepEqual(record.reviewed, { on: '2026-10-17', by: "the ingest tool's test suite" });
    const source = record.sources[0];
    assert.deepEqual(
      [source.model, source.modelKey, source.licence, source.seed, source.prompt.entry],
      ['black-forest-labs/FLUX.2-dev', 'flux2', 'flux-nc-2.1', 4242, 'drone-v1'],
    );
    assert.deepEqual([source.size, source.steps, source.guidance], ['128x96', 40, 3.5]);
    assert.equal(source.generatedAt, '2026-10-16T00:00:00.000Z');
    assert.equal(source.weights.transformer, 'lmsys/flux2-dev-modelopt-fp8-sglang-transformer');
    assert.equal(source.generator.sidecar, 'sources/drone-sheet.json');
    assert.deepEqual([record.edit.painted, record.edit.erased], [1, 1]);
  });

  it('gyre (JPEG): the key seen between the spokes is keyed as enclosed holes', () => {
    const img = output('enemies/gyre');
    assert.equal(px(img, 0, 0)[1], 0, 'outside');
    assert.equal(px(img, 8, 8)[1], 0, 'a hole between two spokes');
    assert.equal(px(img, 15, 15)[1], 0, 'and the opposite one');
    assert.equal(px(img, 12, 12)[1], 255, 'the hub');
    assert.equal(px(img, 12, 3)[1], 255, 'the ring');
    const record = JSON.parse(readFileSync(join(SPRITES, 'enemies', 'gyre.art.json'), 'utf8'));
    assert.deepEqual(
      [record.sources[0].format, record.sources[0].model, record.sources[0].seed],
      ['jpeg', 'Qwen/Qwen-Image-Edit-2511', 7],
    );
    assert.equal(record.sources[0].licence, 'apache-2.0');
    assert.equal(record.sources[0].generator, null);
    assert.deepEqual([record.use, record.cleanup, record.reviewed], ['reference', 'none', null]);
  });

  it('fringe hull: no green-cast edge left, the enclosed key-green window kept', () => {
    const img = output('bosses/fringe-hull');
    let window = 0;
    for (let y = 0; y < img.height; y++) {
      for (let x = 0; x < img.width; x++) {
        const [c, a] = px(img, x, y);
        if (a === 0) continue;
        if (c === 0x3cf102) {
          window++;
          assert.ok(
            x > 3 && x < 17 && y > 2 && y < 10,
            `key green only inside the hull (${x}, ${y})`,
          );
          continue;
        }
        const g = (c >> 8) & 255;
        assert.ok(g <= Math.max((c >> 16) & 255, c & 255), `no green cast at (${x}, ${y})`);
      }
    }
    assert.equal(window, 6, 'the 12×8 window is 3×2 frame pixels');
    const record = JSON.parse(
      readFileSync(join(SPRITES, 'bosses', 'fringe-hull.art.json'), 'utf8'),
    );
    assert.equal(record.origin, 'hand');
    assert.deepEqual([record.sources[0].model, record.sources[0].licence], [null, null]);
    assert.equal(record.author, 'make-fixtures.mjs');
  });

  it('far layer: the cycle ramp exact, every other colour ≥ 3/255 from it, the budget warned', () => {
    const img = output('backdrops/fixture-far');
    const ramp = [0x203850, 0x28486a, 0x305a84];
    const colours = opaqueColours(img);
    for (const r of ramp) assert.ok(colours.has(r));
    for (const c of colours) {
      if (ramp.includes(c)) continue;
      for (const r of ramp) assert.ok(chebyshev(c, r) >= 3, c.toString(16));
    }
    const result = ingestRecipe(join(SPRITES, 'backdrops', 'fixture-far.recipe.json'), OPTIONS);
    const text = result.warnings.join('\n');
    assert.match(text, /#213951 → #[0-9a-f]{6} \(too close to reserved #203850\)/);
    assert.match(text, /far layer: median luma \d+(\.\d)? is over the budget 64/);
    assert.match(text, /far layer: 95th-percentile luma .* over the budget 140/);
  });

  it('glow: additive art keeps its light, transparent where it is dark, no outline', () => {
    const img = output('fx/fixture-glow');
    assert.equal(px(img, 0, 0)[1], 0);
    const [centre, alpha] = px(img, 6, 6);
    assert.equal(alpha, 255);
    assert.ok(((centre >> 8) & 255) > 180, 'the bright core');
  });
});

describe('edit references', () => {
  it("records an edit's input image with its hash and the model that made it", () => {
    const root = copyRoot('edited');
    cpSync(join(root, 'sources', 'drone-sheet.png'), join(root, 'sources', 'drone-edit.png'));
    writeFileSync(
      join(root, 'sources', 'drone-edit.json'),
      JSON.stringify({
        id: 'enemy/drone/edit-1',
        model: 'qwenedit',
        servedModel: 'Qwen/Qwen-Image-Edit-2511',
        seed: 5,
        mode: 'edit',
        editFrom: ['sources/drone-sheet.png', 'sources/missing.png'],
        instruction: 'SYNTHETIC FIXTURE edit',
      }),
    );
    const recipe = join(root, 'sprites', 'enemies', 'drone-edit.recipe.json');
    writeFileSync(
      recipe,
      readFileSync(join(root, 'sprites', 'enemies', 'drone.recipe.json'), 'utf8')
        .replace('"enemies/drone"', '"enemies/drone-edit"')
        .replace('sources/drone-sheet.png', 'sources/drone-edit.png'),
    );
    const result = ingestRecipe(recipe, { ...OPTIONS, root });
    assert.deepEqual(result.errors, []);
    const record = JSON.parse(result.files?.record.text ?? '{}');
    const [source] = record.sources;
    assert.deepEqual(
      [source.model, source.licence, source.generator.mode],
      ['Qwen/Qwen-Image-Edit-2511', 'apache-2.0', 'edit'],
    );
    assert.deepEqual(source.reference[0], {
      path: 'sources/drone-sheet.png',
      sha256: sha256Hex(readFileSync(join(root, 'sources', 'drone-sheet.png'))),
      sidecar: 'sources/drone-sheet.json',
      model: 'black-forest-labs/FLUX.2-dev',
      modelKey: 'flux2',
      licence: 'flux-nc-2.1',
    });
    assert.match(source.reference[0].sha256, /^[0-9a-f]{64}$/);
    assert.deepEqual(source.reference[1], {
      path: 'sources/missing.png',
      sha256: null,
      sidecar: null,
      model: null,
      modelKey: null,
      licence: null,
    });
  });
});

describe('the record date', () => {
  it('stays when nothing else changed and moves when the recipe changes', () => {
    const root = copyRoot('dated');
    const options = { ...OPTIONS, root, palettesDir: join(root, 'palettes') };
    const recipe = join(root, 'sprites', 'enemies', 'gyre.recipe.json');
    const same = ingestRecipe(recipe, options);
    assert.match(same.files?.record.text ?? '', /"ingestedAt": "2026-10-17"/);
    writeFileSync(
      recipe,
      readFileSync(recipe, 'utf8').replace('"holes": "auto"', '"holes": "auto", "snap": true'),
    );
    const changed = ingestRecipe(recipe, options);
    assert.match(changed.files?.record.text ?? '', /"ingestedAt": "2030-01-01"/);
    assert.deepEqual(changed.files?.png.bytes, same.files?.png.bytes);
  });
});

describe('errors', () => {
  /**
   * Ingests a recipe written into a scratch folder at `<name>.recipe.json`.
   *
   * @param {string} name - Sprite name (the recipe's location).
   * @param {Record<string, unknown>} recipe - The recipe.
   * @returns {ReturnType<typeof ingestRecipe>} The result.
   */
  const run = (name, recipe) => {
    const file = join(tmp, 'errors', `${name}.recipe.json`);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(recipe));
    return ingestRecipe(file, OPTIONS);
  };
  const BASE = {
    format: 'shmup-ingest-recipe@1',
    name: 'enemies/bad',
    category: 'enemy',
    frame: { width: 16, height: 12 },
    sources: [
      {
        image: 'sources/drone-sheet.png',
        grid: { cellWidth: 64, cellHeight: 48, columns: 2, rows: 2 },
      },
    ],
  };

  for (const [
    label,
    change,
    pattern,
  ] of /** @type {[string, Record<string, unknown>, RegExp][]} */ ([
    [
      'a name that does not match the location',
      { name: 'enemies/elsewhere' },
      /does not match the recipe's location/,
    ],
    [
      'a missing source',
      { sources: [{ image: 'sources/nope.png' }] },
      /sources\[0\]\.image: sources\/nope\.png/,
    ],
    [
      'a box outside the image',
      { sources: [{ image: 'sources/drone-sheet.png', crop: [100, 0, 64, 48] }] },
      /leaves the 128×96 image/,
    ],
    [
      'a frame count that differs',
      { frameCount: 3 },
      /the sources give 4 frames, the recipe expects 3/,
    ],
    [
      'a tag past the last frame',
      { animations: { spin: { from: 0, to: 4 } } },
      /frame 4 does not exist/,
    ],
    [
      'an unknown cycle stage',
      { cycles: [{ stage: 'zone-z' }] },
      /stage "zone-z" .*no palette-cycle ramp/,
    ],
    ['a missing named palette', { palette: { name: 'nope' } }, /palette "nope" not found/],
    ['an upscale', { frame: { width: 128, height: 96 } }, /never scales up/],
    [
      'a missing candidate sidecar',
      { sources: [{ image: 'sources/gyre.jpg', provenance: { sidecar: 'sources/none.json' } }] },
      /sidecar: sources\/none\.json does not exist/,
    ],
  ])) {
    it(`reports ${label}`, () => {
      const result = run('enemies/bad', { ...BASE, ...change });
      assert.equal(result.files, null);
      assert.ok(
        result.errors.some((e) => pattern.test(e)),
        result.errors.join('\n'),
      );
    });
  }

  it('reports an edit layer of the wrong size', () => {
    const dir = join(tmp, 'bad-edit');
    cpSync(SPRITES, dir, { recursive: true });
    cpSync(join(SPRITES, 'enemies', 'gyre.png'), join(dir, 'enemies', 'drone.edit.png'));
    const result = ingestRecipe(join(dir, 'enemies', 'drone.recipe.json'), OPTIONS);
    assert.match(result.errors.join('\n'), /the edit layer is 24×24, the ingested strip 64×12/);
  });

  it('refuses cleanup "none" when the hand-edit layer changes pixels', () => {
    const root = copyRoot('cleanup-none');
    const recipe = join(root, 'sprites', 'enemies', 'drone.recipe.json');
    writeFileSync(
      recipe,
      readFileSync(recipe, 'utf8').replace('"reviewed"', '"cleanup": "none", "reviewed"'),
    );
    const result = ingestRecipe(recipe, { ...OPTIONS, root });
    assert.match(
      result.errors.join('\n'),
      /provenance\.cleanup: "none", but the hand-edit layer changes pixels/,
    );
  });
});

describe('the CLI', () => {
  it('prints the usage with --help and rejects unknown options', () => {
    assert.equal(cli(['--help']).code, 0);
    assert.match(cli(['--help']).out, /Usage: node art-prompts\/ingest\/ingest\.mjs/);
    const bad = cli(['--frobnicate']);
    assert.equal(bad.code, 2);
    assert.match(bad.err, /unknown option --frobnicate/);
    assert.equal(cli(['--date', 'yesterday']).code, 2);
    assert.equal(cli([join(tmp, 'does-not-exist')]).code, 2);
  });

  it('finds no recipes in a tree without any and exits 0', () => {
    const run = cli(['--root', join(tmp, 'empty-root')]);
    assert.equal(run.code, 0);
    assert.match(run.out, /no recipes found/);
  });

  it('fails --check once an output was touched, and --strict on warnings', () => {
    const root = copyRoot('stale');
    writeFileSync(join(root, 'sprites', 'enemies', 'gyre.json'), '{}\n');
    const check = cli(['--root', root, '--palettes', PALETTES, '--check', join(root, 'sprites')]);
    assert.equal(check.code, 1);
    assert.match(check.err, /gyre\.recipe\.json: out of date \(sidecar\)/);
    const strict = cli([
      '--root',
      FIXTURES,
      '--palettes',
      PALETTES,
      '--strict',
      '--out',
      join(tmp, 'strict'),
      SPRITES,
    ]);
    assert.equal(strict.code, 1);
  });

  it('writes a JSON report', () => {
    const file = join(tmp, 'report', 'report.json');
    assert.equal(
      cli([
        '--root',
        FIXTURES,
        '--palettes',
        PALETTES,
        '--out',
        join(tmp, 'rep'),
        '--report',
        file,
        '-q',
        SPRITES,
      ]).code,
      0,
    );
    const report = JSON.parse(readFileSync(file, 'utf8'));
    assert.equal(report.length, 5);
    const far = report.find(
      (/** @type {{ name: string }} */ r) => r.name === 'backdrops/fixture-far',
    );
    assert.ok(far.lighting.median > 64);
  });
});
