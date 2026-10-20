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
  existsSync,
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
import { decodeImage, encodePng, pngChunks } from '../lib/codec.mjs';
import { chebyshev, createImage, packRgb, putRgba } from '../lib/image.mjs';
import { ingestRecipe } from '../lib/pipeline.mjs';
import { loadModels, sha256Hex, validateRecord } from '../lib/provenance.mjs';
import { makeTileFixtures } from './fixtures/make-fixtures.mjs';

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
    assert.match(run.out, /6 recipe\(s\): 6 ok, 0 failed, 2 with warnings, 0 out of date/);
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
    assert.equal(first.size, 18);
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
      'ships/fixture-ship',
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
    assert.equal(sidecar.meta.shmup, undefined, 'no p2 recipe — no shmup block, old bytes kept');
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

  it('fixture-ship (p2): the recipe p2 map is written to the sidecar as meta.shmup.p2', () => {
    const strip = output('ships/fixture-ship');
    assert.equal(strip.width, 64);
    assert.equal(strip.height, 12);
    const sidecar = JSON.parse(readFileSync(join(SPRITES, 'ships', 'fixture-ship.json'), 'utf8'));
    assert.deepEqual(sidecar.meta.shmup, {
      p2: { '#3a4a68': '#4a683a', '#5a7090': '#70905a', '#a8c0d8': '#c0d8a8' },
    });
    const colours = opaqueColours(strip);
    for (const from of ['#3a4a68', '#5a7090', '#a8c0d8'])
      assert.ok(colours.has(parseInt(from.slice(1), 16)), `${from} is in the art`);
    for (const to of ['#4a683a', '#70905a', '#c0d8a8'])
      assert.ok(!colours.has(parseInt(to.slice(1), 16)), `${to} is not pre-mapped in the art`);
    const record = JSON.parse(
      readFileSync(join(SPRITES, 'ships', 'fixture-ship.art.json'), 'utf8'),
    );
    assert.deepEqual([record.origin, record.cleanup, record.use], [
      'ai-assisted',
      'heavy',
      'pixels',
    ]);
    assert.deepEqual(record.reviewed, { on: '2026-10-17', by: "the ingest tool's test suite" });
    assert.equal(record.sources[0].modelKey, 'qwenvl');
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

/** Where gen-candidate.mjs puts candidates (git-ignored) and round 2 commits the winners. */
const CANDIDATES = 'art-prompts/v2/candidates';
const WINNERS = 'art-prompts/v2/winners';

/**
 * Writes a file below a root, creating its folders.
 *
 * @param {string} root - Root.
 * @param {string} path - Root-relative path.
 * @param {string | Buffer} content - Bytes or text (an object is written as JSON).
 */
function put(root, path, content) {
  const file = join(root, ...path.split('/'));
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

/**
 * A candidate sidecar as `gen-candidate.mjs` writes it (only the fields ingest reads).
 *
 * @param {Record<string, unknown>} fields - Fields.
 * @returns {string} JSON text.
 */
const sidecarText = (fields) =>
  `${JSON.stringify({ slot: 'a', prompt: 'SYNTHETIC FIXTURE', negative: '', ...fields }, null, 2)}\n`;

/**
 * A fixture root with round 2's layout: the winner of `enemy/drone` and its comment edit
 * `edit-1` (a Qwen edit of the FLUX winner) committed under `art-prompts/v2/winners/`, and a
 * recipe `enemies/drone-edit` that ingests the edit. No candidates folder (a fresh clone).
 *
 * @param {string} name - Folder name under the temp root.
 * @param {{ editFrom?: unknown[], source?: string, recipe?: (r: Record<string, any>) => void }} [o]
 *   The edit's `editFrom`, the image the recipe ingests, a change to the recipe.
 * @returns {{ root: string, recipe: string }} The root and the recipe path.
 */
function editRoot(name, o = {}) {
  const root = copyRoot(name);
  const sheet = readFileSync(join(root, 'sources', 'drone-sheet.png'));
  put(root, `${WINNERS}/enemy/drone/winner.png`, sheet);
  put(
    root,
    `${WINNERS}/enemy/drone/winner.json`,
    sidecarText({
      id: 'enemy/drone',
      model: 'flux2',
      servedModel: 'black-forest-labs/FLUX.2-dev',
      seed: 4242,
      generatedAt: '2026-10-16T00:00:00.000Z',
      file: `${CANDIDATES}/a/enemy/drone.png`,
      mode: 'generate',
    }),
  );
  put(root, `${WINNERS}/enemy/drone/edit-1.png`, sheet);
  put(
    root,
    `${WINNERS}/enemy/drone/edit-1.json`,
    sidecarText({
      id: 'enemy/drone',
      model: 'qwenedit',
      servedModel: 'Qwen/Qwen-Image-Edit-2511',
      seed: 5,
      generatedAt: '2026-10-17T00:00:00.000Z',
      file: `${CANDIDATES}/a/enemy/drone/edit-1.png`,
      mode: 'edit',
      editFrom: o.editFrom ?? [`${CANDIDATES}/a/enemy/drone.png`],
      instruction: 'SYNTHETIC FIXTURE edit',
    }),
  );
  const recipe = JSON.parse(
    readFileSync(join(root, 'sprites', 'enemies', 'drone.recipe.json'), 'utf8'),
  );
  recipe.name = 'enemies/drone-edit';
  recipe.sources[0].image = o.source ?? `${WINNERS}/enemy/drone/edit-1.png`;
  o.recipe?.(recipe);
  const file = join(root, 'sprites', 'enemies', 'drone-edit.recipe.json');
  writeFileSync(file, `${JSON.stringify(recipe, null, 2)}\n`);
  return { root, recipe: file };
}

/**
 * Ingests with a fixed date (records compare byte for byte).
 *
 * @param {string} recipe - Recipe path.
 * @param {string} root - Root.
 * @returns {ReturnType<typeof ingestRecipe>} The result.
 */
const ingestAt = (recipe, root) =>
  ingestRecipe(recipe, { ...OPTIONS, root, date: '2026-10-17' });

describe('edit references', () => {
  it("records an edit's input as its committed winner: hash, sidecar, model, licence", () => {
    const { root, recipe } = editRoot('edited');
    const result = ingestAt(recipe, root);
    assert.deepEqual(result.errors, []);
    const record = JSON.parse(result.files?.record.text ?? '{}');
    const [source] = record.sources;
    assert.deepEqual(
      [source.model, source.licence, source.generator.mode],
      ['Qwen/Qwen-Image-Edit-2511', 'apache-2.0', 'edit'],
    );
    assert.deepEqual(source.reference, [
      {
        path: `${WINNERS}/enemy/drone/winner.png`,
        from: `${CANDIDATES}/a/enemy/drone.png`,
        sha256: sha256Hex(readFileSync(join(root, 'sources', 'drone-sheet.png'))),
        sidecar: `${WINNERS}/enemy/drone/winner.json`,
        sidecarSha256: sha256Hex(readFileSync(join(root, WINNERS, 'enemy', 'drone', 'winner.json'))),
        model: 'black-forest-labs/FLUX.2-dev',
        modelKey: 'flux2',
        weights: loadModels().flux2.weights,
        licence: 'flux-nc-2.1',
        reference: [],
      },
    ]);
    assert.equal(record.origin, 'ai-assisted');
  });

  it('gives the same record whether the unversioned candidates folder is there or not', () => {
    const { root, recipe } = editRoot('candidates-present');
    const clean = ingestAt(recipe, root);
    assert.deepEqual(clean.errors, []);
    // The owner's machine: the candidates exist too (and differ from anything committed).
    put(root, `${CANDIDATES}/a/enemy/drone.png`, readFileSync(join(root, 'sources', 'gyre.jpg')));
    put(root, `${CANDIDATES}/a/enemy/drone.json`, sidecarText({ model: 'qwenvl' }));
    const owner = ingestAt(recipe, root);
    assert.deepEqual(owner.errors, []);
    assert.equal(owner.files?.record.text, clean.files?.record.text);
    // Without the committed copy the candidate alone is never used — on any machine.
    rmSync(join(root, WINNERS, 'enemy', 'drone', 'winner.png'));
    const missing = ingestAt(recipe, root);
    assert.equal(missing.files, null);
    assert.match(
      missing.errors.join('\n'),
      /reference\[0\]: the edit's input image art-prompts\/v2\/candidates\/a\/enemy\/drone\.png is in the unversioned candidates folder and has no committed copy/,
    );
  });

  it("follows a followup's two inputs, and the comment edit's own input below it", () => {
    const { root, recipe } = editRoot('followup', {
      source: `${WINNERS}/enemy/drone/reveal.png`,
    });
    put(root, `${WINNERS}/enemy/drone/reveal.png`, readFileSync(join(root, 'sources', 'drone-sheet.png')));
    put(
      root,
      `${WINNERS}/enemy/drone/reveal.json`,
      sidecarText({
        id: 'enemy/drone/reveal',
        model: 'flux2',
        servedModel: 'black-forest-labs/FLUX.2-dev',
        generatedAt: '2026-10-18T00:00:00.000Z',
        mode: 'edit',
        editFrom: [`${CANDIDATES}/a/enemy/drone.png`, `${CANDIDATES}/a/enemy/drone/edit-1.png`],
      }),
    );
    const result = ingestAt(recipe, root);
    assert.deepEqual(result.errors, []);
    const [winner, edit] = JSON.parse(result.files?.record.text ?? '{}').sources[0].reference;
    assert.equal(winner.path, `${WINNERS}/enemy/drone/winner.png`);
    assert.deepEqual(
      [edit.path, edit.from, edit.modelKey],
      [`${WINNERS}/enemy/drone/edit-1.png`, `${CANDIDATES}/a/enemy/drone/edit-1.png`, 'qwenedit'],
    );
    assert.deepEqual(
      edit.reference.map((/** @type {{ path: string, licence: string }} */ r) => [r.path, r.licence]),
      [[`${WINNERS}/enemy/drone/winner.png`, 'flux-nc-2.1']],
      "the Qwen edit's FLUX input is still recorded",
    );
  });

  it('uses the committed copies a recipe names in provenance.reference, one per editFrom entry', () => {
    const { root, recipe } = editRoot('named', {
      recipe: (r) => {
        r.sources[0].provenance = {
          reference: [{ image: 'sources/far.png', sidecar: false, model: 'flux1' }],
        };
      },
    });
    rmSync(join(root, WINNERS, 'enemy', 'drone', 'winner.png')); // the mapping would fail
    const result = ingestAt(recipe, root);
    assert.deepEqual(result.errors, []);
    const [ref] = JSON.parse(result.files?.record.text ?? '{}').sources[0].reference;
    assert.deepEqual(
      [ref.path, ref.from, ref.sidecar, ref.modelKey, ref.licence],
      ['sources/far.png', `${CANDIDATES}/a/enemy/drone.png`, null, 'flux1', 'flux1-dev-nc-1.1.1'],
    );
  });

  it('makes a hand-drawn redraw of an AI image ai-assisted', () => {
    const root = copyRoot('redraw');
    const file = join(root, 'sprites', 'bosses', 'fringe-hull.recipe.json');
    const recipe = JSON.parse(readFileSync(file, 'utf8'));
    recipe.provenance.reference = ['sources/drone-sheet.png'];
    recipe.provenance.cleanup = 'redrawn';
    writeFileSync(file, JSON.stringify(recipe));
    const result = ingestAt(file, root);
    assert.deepEqual(result.errors, []);
    const record = JSON.parse(result.files?.record.text ?? '{}');
    assert.deepEqual(
      [record.origin, record.sources[0].model, record.sources[0].reference[0].modelKey],
      ['ai-assisted', null, 'flux2'],
    );
    assert.deepEqual(validateRecord(record, { sprite: 'bosses/fringe-hull' }), []);
  });

  for (const [
    label,
    options,
    after,
    pattern,
  ] of /** @type {[string, object, ((root: string) => void) | null, RegExp][]} */ ([
    [
      'a missing input image',
      { editFrom: ['sources/missing.png'] },
      null,
      /reference\[0\]: the edit's input image sources\/missing\.png does not exist/,
    ],
    [
      'an input image without a sidecar',
      { editFrom: ['sources/far.png'] },
      null,
      /sources\/far\.png has no sidecar sources\/far\.json, so the model that made it is unknown/,
    ],
    [
      'an input whose sidecar names no model',
      { editFrom: ['sources/far.png'] },
      (root) => put(root, 'sources/far.json', sidecarText({ id: 'x' })),
      /the sidecar sources\/far\.json of sources\/far\.png names no model/,
    ],
    [
      'an input path that leaves the root',
      { editFrom: ['../outside/secret.png'] },
      null,
      /editFrom\[0\] "\.\.\/outside\/secret\.png" must be a path relative to the root/,
    ],
    [
      'an archived candidate',
      { editFrom: [`${CANDIDATES}/history/2026-10-17/a/enemy/drone.png`] },
      null,
      /has no committed copy/,
    ],
    [
      'a committed copy of another candidate (another slot)',
      { editFrom: [`${CANDIDATES}/b/enemy/drone.png`] },
      null,
      /winner\.png is not the image the edit was made from — its sidecar says it is art-prompts\/v2\/candidates\/a\/enemy\/drone\.png/,
    ],
    [
      'a committed copy generated after the edit',
      {},
      (root) => {
        const file = join(root, WINNERS, 'enemy', 'drone', 'winner.json');
        writeFileSync(file, readFileSync(file, 'utf8').replace('2026-10-16', '2026-10-19'));
      },
      /was generated at 2026-10-19T00:00:00\.000Z, after the edit \(2026-10-17T00:00:00\.000Z\)/,
    ],
    [
      'a named reference list of another length',
      { recipe: (/** @type {any} */ r) => (r.provenance.reference = []) },
      null,
      /provenance\.reference: names 0 image\(s\), the edit was made from 1/,
    ],
  ])) {
    it(`refuses ${label}`, () => {
      const { root, recipe } = editRoot(`bad-ref-${label.replace(/\W+/g, '-')}`, options);
      after?.(root);
      const result = ingestAt(recipe, root);
      assert.equal(result.files, null);
      assert.match(result.errors.join('\n'), pattern);
    });
  }
});

describe('the model of a source', () => {
  /**
   * Ingests the drone recipe with changed sources or provenance.
   *
   * @param {string} name - Scratch root name.
   * @param {(r: Record<string, any>) => void} change - The change.
   * @returns {ReturnType<typeof ingestRecipe>} The result.
   */
  const drone = (name, change) => {
    const root = copyRoot(name);
    const file = join(root, 'sprites', 'enemies', 'drone.recipe.json');
    const recipe = JSON.parse(readFileSync(file, 'utf8'));
    change(recipe);
    writeFileSync(file, JSON.stringify(recipe));
    return ingestAt(file, root);
  };

  it('is an error when neither a sidecar nor the recipe names it', () => {
    for (const [name, change] of /** @type {[string, (r: any) => void][]} */ ([
      ['no-sidecar', (r) => (r.sources[0] = { image: 'sources/fringe.png', crop: [0, 0, 80, 48] })],
      ['sidecar-off', (r) => (r.sources[0].provenance = { sidecar: false })],
    ])) {
      const result = drone(name, change);
      assert.equal(result.files, null, name);
      assert.match(
        result.errors.join('\n'),
        /sources\[0\]: no model is known for sources\/.*say provenance\.model: "none" for hand-made art/,
        name,
      );
    }
  });

  it('is an error when the recipe contradicts the candidate sidecar ("none" included)', () => {
    for (const model of ['none', 'qwenvl']) {
      const result = drone(`contradict-${model}`, (r) => (r.provenance.model = model));
      assert.equal(result.files, null, model);
      assert.match(
        result.errors.join('\n'),
        new RegExp(`provenance\\.model: "${model}" contradicts the candidate sidecar sources/drone-sheet\\.json, which says "flux2"`),
      );
    }
    assert.deepEqual(drone('agree', (r) => (r.provenance.model = 'flux2')).errors, []);
  });

  it('warns when the sidecar names a served model other than the table row', () => {
    const root = copyRoot('served');
    const file = join(root, 'sources', 'drone-sheet.json');
    writeFileSync(
      file,
      readFileSync(file, 'utf8').replace('"black-forest-labs/FLUX.2-dev"', '"someone/other-model"'),
    );
    const result = ingestAt(join(root, 'sprites', 'enemies', 'drone.recipe.json'), root);
    assert.deepEqual(result.errors, []);
    assert.match(
      result.warnings.join('\n'),
      /the sidecar says someone\/other-model served the image, models\.json has black-forest-labs\/FLUX\.2-dev for "flux2"/,
    );
  });
});

describe('a fixed palette over the cap', () => {
  /** 40 colours: a grey ramp, blues and oranges (none near the fixture's cycle ramp). */
  const WIDE = Array.from({ length: 40 }, (_, i) => {
    const v = 8 + i * 6;
    const c = i % 3 === 0 ? packRgb(v, v, v) : i % 3 === 1 ? packRgb(v >> 1, v >> 1, v) : packRgb(v, v >> 1, 0);
    return `#${c.toString(16).padStart(6, '0')}`;
  });

  /**
   * Ingests a recipe written into a scratch copy of the fixture root.
   *
   * @param {string} name - Scratch root name.
   * @param {string} sprite - Sprite name.
   * @param {Record<string, unknown>} recipe - The recipe (without format and name).
   * @param {Record<string, unknown>} [palettes] - Named palettes to write.
   * @returns {ReturnType<typeof ingestRecipe>} The result.
   */
  const run = (name, sprite, recipe, palettes = {}) => {
    const root = copyRoot(name);
    for (const [id, colors] of Object.entries(palettes))
      put(root, `palettes/${id}.json`, JSON.stringify({ schema: 'shmup-palette@1', colors }));
    const file = join(root, 'sprites', ...`${sprite}.recipe.json`.split('/'));
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify({ format: 'shmup-ingest-recipe@1', name: sprite, ...recipe }));
    return ingestRecipe(file, { ...OPTIONS, root, palettesDir: join(root, 'palettes'), date: '2026-10-17' });
  };

  /**
   * Opaque colours of a result's strip.
   *
   * @param {ReturnType<typeof ingestRecipe>} result - A result.
   * @returns {Set<number>} Colours.
   */
  const coloursOf = (result) => opaqueColours(decodeImage(/** @type {Buffer} */ (result.files?.png.bytes)).image);

  it('an explicit 40-colour palette on a bullet comes out in at most 5 of its colours, without a warning', () => {
    const recipe = {
      category: 'bullet',
      frame: { width: 16, height: 9 },
      sources: [{ image: 'sources/far.png', provenance: { model: 'flux1', sidecar: false } }],
      key: { mode: 'none' },
      palette: { colors: WIDE },
    };
    const result = run('wide-bullet', 'bullets/wide', recipe);
    assert.deepEqual(result.errors, []);
    const colours = coloursOf(result);
    assert.ok(colours.size <= 5 && colours.size >= 2, `${colours.size} colours`);
    const allowed = new Set(WIDE.map((h) => parseInt(h.slice(1), 16)));
    for (const c of colours) assert.ok(allowed.has(c), c.toString(16));
    assert.deepEqual(result.report.paletteReduced, { from: 40, to: 5 });
    assert.ok(!result.warnings.some((w) => w.startsWith('colours:')), result.warnings.join('\n'));
    const again = run('wide-bullet-2', 'bullets/wide', recipe);
    assert.deepEqual(again.files?.png.bytes, result.files?.png.bytes, 'deterministic');
  });

  it('a named palette over a backdrop cap keeps the cycle ramp exact and stays within the cap', () => {
    const ramp = [0x203850, 0x28486a, 0x305a84];
    const result = run(
      'wide-far',
      'backdrops/wide-far',
      {
        category: 'backdrop',
        layer: 'far',
        frame: { width: 64, height: 36 },
        sources: [{ image: 'sources/far.png', provenance: { model: 'flux1', sidecar: false } }],
        key: { mode: 'none' },
        cycles: [{ stage: 'fixture', layer: 'far' }],
        palette: { name: 'wide', max: 8 },
      },
      { wide: WIDE },
    );
    assert.deepEqual(result.errors, []);
    const colours = coloursOf(result);
    assert.ok(colours.size <= 8, `${colours.size} colours`);
    for (const r of ramp) assert.ok(colours.has(r), `ramp ${r.toString(16)} kept exactly`);
    assert.deepEqual(result.report.paletteReduced, { from: 43, to: 8 });
    assert.ok(!result.warnings.some((w) => w.startsWith('colours:')), result.warnings.join('\n'));
  });

  it('a fixed palette within the cap is used whole, as before', () => {
    const result = run('narrow', 'bullets/narrow', {
      category: 'bullet',
      frame: { width: 16, height: 9 },
      sources: [{ image: 'sources/far.png', provenance: { model: 'flux1', sidecar: false } }],
      key: { mode: 'none' },
      palette: { colors: WIDE.slice(0, 5) },
    });
    assert.deepEqual(result.errors, []);
    assert.equal(result.report.paletteReduced, null);
  });

  it('warns only for the colours the hand-edit layer adds', () => {
    const root = copyRoot('edit-colours');
    const file = join(root, 'sprites', 'enemies', 'drone.recipe.json');
    writeFileSync(file, readFileSync(file, 'utf8').replace('"max": 8', '"max": 5'));
    const withEdit = ingestAt(file, root);
    assert.deepEqual(withEdit.errors, []);
    assert.match(
      withEdit.warnings.join('\n'),
      /colours: the hand-edit layer brings 5 to 6, over the cap of 5/,
    );
    rmSync(join(root, 'sprites', 'enemies', 'drone.edit.png'));
    const without = ingestAt(file, root);
    assert.ok(!without.warnings.some((w) => w.startsWith('colours:')), without.warnings.join('\n'));
  });
});

describe('tile collision (R3-03.V4a)', () => {
  const TILES = join(FIXTURES, 'tiles');
  const cliff = decodeImage(readFileSync(join(TILES, 'cliff.png'))).image;
  const stack = decodeImage(readFileSync(join(TILES, 'stack.png'))).image;

  /** The designed masks of the fixture tileset, by frame (the deco `empty` tile is skipped). */
  const DESIGNED = [
    [12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12],
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1],
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], // ceiling anchor
    [2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7],
  ];

  /**
   * One strip frame's column runs from the bottom edge (or the top one, for a ceiling).
   *
   * @param {import('../lib/image.mjs').Image} img - Strip.
   * @param {number} f - Frame index.
   * @param {boolean} [fromTop] - Measure from the top edge.
   * @returns {number[]} Twelve heights.
   */
  const runs = (img, f, fromTop = false) =>
    Array.from({ length: 12 }, (_, c) => {
      let n = 0;
      const at = (/** @type {number} */ k) =>
        img.data[((fromTop ? k : img.height - 1 - k) * img.width + f * 12 + c) * 4 + 3];
      while (n < img.height && at(n) !== 0) n++;
      return n;
    });

  /**
   * Opaque pixels of one strip frame.
   *
   * @param {import('../lib/image.mjs').Image} img - Strip.
   * @param {number} f - Frame index.
   * @returns {number} The count.
   */
  const opaque = (img, f) => {
    let n = 0;
    for (let y = 0; y < img.height; y++)
      for (let c = 0; c < 12; c++)
        if (img.data[(y * img.width + f * 12 + c) * 4 + 3] !== 0) n++;
    return n;
  };

  /**
   * Ingests a scratch tile recipe (the cliff sheet) inside a copy of the fixture root.
   *
   * @param {string} name - Scratch root name.
   * @param {Record<string, unknown>} recipe - Recipe fields on top of the tile base.
   * @param {string} [sprite] - Sprite name (scratch location).
   * @returns {ReturnType<typeof ingestRecipe>} The result.
   */
  const tileRun = (name, recipe, sprite = 'tiles/scratch') => {
    const root = copyRoot(name);
    const file = join(root, ...`${sprite}.recipe.json`.split('/'));
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(
      file,
      JSON.stringify({
        format: 'shmup-ingest-recipe@1',
        name: sprite,
        category: 'tile',
        frame: { width: 12, height: 12 },
        sources: [
          {
            image: 'tiles/cliff-sheet.png',
            grid: { cellWidth: 12, cellHeight: 12, columns: 1, rows: 1 },
          },
        ],
        key: { mode: 'none' },
        outline: false,
        provenance: { model: 'none', author: 'pipeline.test.mjs' },
        ...recipe,
      }),
    );
    return ingestAt(file, root);
  };

  it('the tile sheets redraw byte-for-byte', () => {
    const dir = join(tmp, 'tile-redraw');
    mkdirSync(dir, { recursive: true });
    assert.deepEqual(makeTileFixtures(dir), ['tiles/cliff-sheet.png', 'tiles/stack-sheet.png']);
    for (const rel of ['tiles/cliff-sheet.png', 'tiles/stack-sheet.png']) {
      const name = rel.split('/')[1];
      assert.deepEqual(
        readFileSync(join(dir, ...rel.split('/'))),
        readFileSync(join(TILES, name)),
        rel,
      );
    }
  });

  it('are exactly what the recipes produce (--check)', () => {
    const run = cli(['--root', FIXTURES, '--palettes', PALETTES, '--check', TILES]);
    assert.equal(run.code, 0, run.err);
    assert.match(run.out, /2 recipe\(s\): 2 ok, 0 failed, 2 with warnings, 0 out of date/);
  });

  it('clip-to-mask: the committed alpha is the designed mask, column for column', () => {
    for (let f = 0; f < 5; f++)
      assert.deepEqual(runs(cliff, f, f === 3), DESIGNED[f], `frame ${f}`);
    // The deco and the unreferenced frame keep all their art (clip only shapes solid/hazard).
    assert.equal(opaque(cliff, 5), 144);
    assert.equal(opaque(cliff, 6), 144);
  });

  it('clip-to-mask: a re-run touches no pixel, reports the clip, and writes no masks file', () => {
    const result = ingestAt(join(TILES, 'cliff.recipe.json'), FIXTURES);
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.files?.png.bytes, readFileSync(join(TILES, 'cliff.png')));
    assert.equal(result.files?.masks, null);
    // 1 008 opaque before the clip; frames 0, 5 and 6 stay full: 144+144+78+78+78+54+144 = 720.
    assert.deepEqual(result.report?.collision, {
      mode: 'clip-to-mask',
      tileset: 'tiles/fixture.tileset.json',
      frames: 5,
      cleared: 288,
    });
    assert.match(
      result.warnings.join('\n'),
      /collision: frame 5 is no solid or hazard tile of tiles\/fixture\.tileset\.json — its art is not clipped/,
    );
    assert.match(
      result.warnings.join('\n'),
      /collision: frame 6 is no solid or hazard tile of tiles\/fixture\.tileset\.json — its art is not clipped/,
    );
  });

  it('mask-from-art: the masks file holds the art\'s heights, and no pixel moved', () => {
    const derived = JSON.parse(readFileSync(join(TILES, 'stack.masks.json'), 'utf8'));
    assert.equal(derived.format, 'shmup-ingest-masks@1');
    assert.equal(derived.sprite, 'tiles/stack');
    assert.equal(derived.tileset, 'tiles/fixture.tileset.json');
    assert.equal(derived.tileSize, 12);
    assert.deepEqual(
      derived.frames.map((f) => [f.frame, f.tile, f.anchor, f.mask]),
      [
        [0, 'block', 'floor', DESIGNED[0]], // equal to the design on purpose
        [1, 'slope-up', 'floor', [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 12]],
        [2, 'slope-down', 'floor', [9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9]],
        [3, 'overhang', 'ceiling', [6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6]],
        [4, 'spike', 'floor', [3, 4, 3, 4, 3, 4, 3, 4, 3, 4, 3, 4]],
      ],
    );
    for (const entry of derived.frames.slice(1))
      assert.notDeepEqual(entry.mask, DESIGNED[entry.frame], `frame ${entry.frame} differs`);
    for (const entry of derived.frames)
      assert.deepEqual(runs(stack, entry.frame, entry.anchor === 'ceiling'), entry.mask);
    assert.equal(opaque(stack, 5), 144); // the deco frame: unmeasured, whole
  });

  it('mask-from-art: a re-run writes the same masks text and warns only for the deco frame', () => {
    const result = ingestAt(join(TILES, 'stack.recipe.json'), FIXTURES);
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.files?.png.bytes, readFileSync(join(TILES, 'stack.png')));
    const masks = result.files?.masks;
    assert.ok(masks, 'masks file');
    assert.deepEqual(
      JSON.parse(Buffer.from(masks.text).toString('utf8')),
      JSON.parse(readFileSync(join(TILES, 'stack.masks.json'), 'utf8')),
    );
    assert.deepEqual(Buffer.from(masks.text), readFileSync(masks.path), 'same bytes on disk');
    assert.match(
      result.warnings.join('\n'),
      /collision: frame 5 .* — no mask is derived from it/,
    );
    assert.deepEqual(result.report?.collision, {
      mode: 'mask-from-art',
      tileset: 'tiles/fixture.tileset.json',
      frames: 5,
      masks: 'tiles/stack.masks.json',
    });
  });

  it('mask-from-art: a column that is not one run from its anchor edge fails the recipe', () => {
    const root = copyRoot('broken-run');
    // Frame 0 of a one-frame sheet: column 3 has its bottom run, a gap at row 6 and floating
    // art above; column 4 is only 5 high, so the gap reaches the border and keying keeps the
    // float (an enclosed hole would too — no mask can express either).
    const image = createImage(12, 12);
    for (let c = 0; c < 12; c++)
      for (let y = 0; y < 12; y++) {
        if (c === 4 && y < 7) continue;
        if (c === 3 && y === 6) continue;
        putRgba(image, y * 12 + c, 0x5a7090, 255);
      }
    put(root, 'tiles/broken-sheet.png', encodePng(image));
    const recipe = JSON.parse(readFileSync(join(root, 'tiles', 'stack.recipe.json'), 'utf8'));
    recipe.name = 'tiles/broken';
    recipe.sources = [
      { image: 'tiles/broken-sheet.png', grid: { cellWidth: 12, cellHeight: 12, columns: 1, rows: 1 } },
    ];
    put(root, 'tiles/broken.recipe.json', JSON.stringify(recipe));
    const result = ingestAt(join(root, 'tiles', 'broken.recipe.json'), root);
    assert.equal(result.files, null);
    assert.match(
      result.errors.join('\n'),
      /collision: 1 column\(s\) are not one run of opaque pixels from their anchor edge: frame 0 column 3 \(tile "block", floor\) — no tileset mask can express them/,
    );
    assert.ok(!existsSync(join(root, 'tiles', 'broken.masks.json')), 'no masks file on disk');
  });

  it('warns on a non-tile recipe and changes nothing', () => {
    const root = copyRoot('collision-sprite');
    const file = join(root, 'sprites', 'enemies', 'drone.recipe.json');
    const recipe = JSON.parse(readFileSync(file, 'utf8'));
    recipe.collision = { tileset: 'tiles/fixture.tileset.json', mode: 'clip-to-mask' };
    writeFileSync(file, JSON.stringify(recipe, null, 2));
    const result = ingestAt(file, root);
    assert.deepEqual(result.errors, []);
    assert.match(
      result.warnings.join('\n'),
      /collision: only a tile has collision; it is ignored/,
    );
    assert.equal(result.report?.collision, null);
    assert.deepEqual(result.files?.png.bytes, readFileSync(join(SPRITES, 'enemies', 'drone.png')));
  });

  for (const [label, collision, pattern] of /** @type {[string, unknown, RegExp][]} */ ([
    [
      'a collision that is not an object',
      'tiles/fixture.tileset.json',
      /collision: must be \{ "tileset", "mode" \}/,
    ],
    [
      'an unknown mode',
      { tileset: 'tiles/fixture.tileset.json', mode: 'clip' },
      /collision\.mode: must be "clip-to-mask" or "mask-from-art"/,
    ],
    [
      'a tileset path outside the root',
      { tileset: '../escape.tileset.json' },
      /collision\.tileset: /,
    ],
    [
      'an unknown collision field',
      { tileset: 'tiles/fixture.tileset.json', mode: 'clip-to-mask', trim: true },
      /collision\.trim: unknown field/,
    ],
  ])) {
    it(`reports ${label}`, () => {
      const result = tileRun('shape', { collision });
      assert.equal(result.files, null);
      assert.match(result.errors.join('\n'), pattern);
    });
  }

  it('reports frames that are not the tileset\'s tiles', () => {
    const result = tileRun('tile-size', {
      frame: { width: 10, height: 10 },
      sources: [
        {
          image: 'tiles/cliff-sheet.png',
          grid: { cellWidth: 10, cellHeight: 10, columns: 1, rows: 1 },
        },
      ],
      collision: { tileset: 'tiles/fixture.tileset.json' },
    });
    assert.equal(result.files, null);
    assert.match(
      result.errors.join('\n'),
      /collision: the recipe's frames are 10×10, tiles\/fixture\.tileset\.json's tiles are 12×12/,
    );
  });

  it('reports a tileset with no collision tile for the sprite\'s frames', () => {
    const root = copyRoot('no-claim');
    put(
      root,
      'tiles/far.tileset.json',
      JSON.stringify({
        formatVersion: 1,
        kind: 'tileset',
        id: 'far',
        sprite: 'tiles/cliff',
        tileSize: 12,
        tiles: [
          { name: 'tall', type: 'solid', frame: 20, anchor: 'floor', mask: Array(12).fill(12) },
        ],
      }),
    );
    const file = join(root, 'tiles', 'scratch.recipe.json');
    const recipe = JSON.parse(readFileSync(join(TILES, 'cliff.recipe.json'), 'utf8'));
    recipe.name = 'tiles/scratch';
    recipe.sources = [
      {
        image: 'tiles/cliff-sheet.png',
        grid: { cellWidth: 12, cellHeight: 12, columns: 1, rows: 1 },
      },
    ];
    recipe.collision = { tileset: 'tiles/far.tileset.json' };
    put(root, 'tiles/scratch.recipe.json', JSON.stringify(recipe));
    const result = ingestAt(file, root);
    assert.equal(result.files, null);
    assert.match(
      result.warnings.join('\n'),
      /collision: tile "tall" names frame 20, the sprite draws 1/,
    );
    assert.match(
      result.errors.join('\n'),
      /collision: tiles\/far\.tileset\.json has no solid or hazard tile for any frame this sprite draws/,
    );
  });

  it('refuses to write derived masks into content/', () => {
    const result = tileRun('content-guard', {
      collision: { tileset: 'tiles/fixture.tileset.json', mode: 'mask-from-art' },
    }, 'content/tiles/blocked');
    assert.equal(result.files, null);
    assert.match(
      result.errors.join('\n'),
      /collision: content\/tiles\/blocked\.masks\.json would be written into content\/ — the ingest tool never writes content/,
    );
  });

  it('a tile strip has binary alpha, like every other output', () => {
    for (const strip of [cliff, stack])
      for (let p = 3; p < strip.data.length; p += 4)
        assert.ok(strip.data[p] === 0 || strip.data[p] === 255);
  });
});

describe('line endings', () => {
  it('a Windows checkout (CRLF recipes and sidecars) gives the same records and passes --check', () => {
    const root = copyRoot('crlf');
    const texts = [
      ...readdirSync(join(root, 'sprites'), { recursive: true })
        .map(String)
        .filter((f) => f.endsWith('.json'))
        .map((f) => join(root, 'sprites', f)),
      join(root, 'sources', 'drone-sheet.json'),
    ];
    for (const file of texts) writeFileSync(file, readFileSync(file, 'utf8').replace(/\n/g, '\r\n'));
    const check = cli(['--root', root, '--palettes', PALETTES, '--check', join(root, 'sprites')]);
    assert.equal(check.code, 0, check.err);
    const gyre = ingestAt(join(root, 'sprites', 'enemies', 'gyre.recipe.json'), root);
    assert.equal(
      gyre.files?.record.text,
      readFileSync(join(SPRITES, 'enemies', 'gyre.art.json'), 'utf8'),
    );
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

  it('reports a recipe outside the root (its record could not name it)', () => {
    const result = run('enemies/bad', BASE);
    assert.equal(result.files, null);
    assert.match(result.errors.join('\n'), /the recipe is outside the root/);
  });

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
    assert.equal(report.length, 6);
    const far = report.find(
      (/** @type {{ name: string }} */ r) => r.name === 'backdrops/fixture-far',
    );
    assert.ok(far.lighting.median > 64);
  });
});
