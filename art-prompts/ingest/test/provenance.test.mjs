/**
 * Provenance records: the schema check, the model table, and the tree check that every
 * override PNG is traced (a record whose hashes match, or a LICENSES.md entry).
 */
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { encodePng } from '../lib/codec.mjs';
import { createImage } from '../lib/image.mjs';
import {
  LICENCE_IDS,
  VERDICTS,
  checkProvenanceTree,
  isSafeRelativePath,
  isUnversioned,
  lfBytes,
  loadModels,
  sha256Hex,
  textSha256,
  validateRecord,
} from '../lib/provenance.mjs';

const SPRITES = join(import.meta.dirname, 'fixtures', 'sprites');
const tmp = mkdtempSync(join(tmpdir(), 'shmup-ingest-provenance-'));
after(() => rmSync(tmp, { recursive: true, force: true }));

/** The drone fixture's record. */
const DRONE = JSON.parse(readFileSync(join(SPRITES, 'enemies', 'drone.art.json'), 'utf8'));

/**
 * A copy of the fixture sprite tree to modify.
 *
 * @param {string} name - Folder name under the temp root.
 * @returns {string} Its path.
 */
function copyTree(name) {
  const dir = join(tmp, name);
  cpSync(SPRITES, dir, { recursive: true });
  return dir;
}

describe('validateRecord', () => {
  it('accepts every fixture record at its location', () => {
    for (const name of [
      'enemies/drone',
      'enemies/gyre',
      'bosses/fringe-hull',
      'backdrops/fixture-far',
      'fx/fixture-glow',
    ]) {
      const record = JSON.parse(readFileSync(join(SPRITES, `${name}.art.json`), 'utf8'));
      assert.deepEqual(validateRecord(record, { sprite: name }), [], name);
    }
  });

  for (const [
    label,
    change,
    pattern,
  ] of /** @type {[string, Record<string, unknown>, RegExp][]} */ ([
    ['another schema', { schema: 'x' }, /^schema:/],
    ['an unknown origin', { origin: 'procedural' }, /^origin:/],
    ['an unknown use', { use: 'sometimes' }, /^use:/],
    ['an unknown cleanup', { cleanup: 'some' }, /^cleanup:/],
    ['handCleaned that disagrees with cleanup', { handCleaned: false }, /^handCleaned:/],
    ['a review without a reviewer', { reviewed: { on: '2026-10-17', by: '' } }, /^reviewed:/],
    ['a timestamp for the ingest date', { ingestedAt: '2026-10-17T10:00:00Z' }, /^ingestedAt:/],
    [
      'ai-assisted art without a model',
      { sources: [{ ...DRONE.sources[0], model: null, licence: null }] },
      /names the model/,
    ],
    ['a hand origin over a modelled source', { origin: 'hand' }, /origin is "ai-assisted"/],
    [
      'an unknown licence id',
      { sources: [{ ...DRONE.sources[0], licence: 'mit' }] },
      /^sources\[0\]\.licence:/,
    ],
    [
      'a source without its edit references',
      { sources: [{ ...DRONE.sources[0], reference: undefined }] },
      /^sources\[0\]\.reference:/,
    ],
    [
      'a tool record without its PNG hash',
      { output: { ...DRONE.output, sha256: undefined } },
      /^output.sha256:/,
    ],
    ['a tool record without its recipe', { recipe: null }, /^recipe:/],
    [
      'a PNG path with folders',
      { output: { ...DRONE.output, png: 'enemies/drone.png' } },
      /^output.png:/,
    ],
  ])) {
    it(`rejects ${label}`, () => {
      const problems = validateRecord({ ...DRONE, ...change }, { sprite: 'enemies/drone' });
      assert.ok(
        problems.some((p) => pattern.test(p)),
        problems.join('\n'),
      );
    });
  }

  /** A well-formed edit reference (the input image of an edit). */
  const REF = Object.freeze({
    path: 'art-prompts/v2/winners/enemy/drone/winner.png',
    from: 'art-prompts/v2/candidates/a/enemy/drone.png',
    sha256: DRONE.sources[0].sha256,
    sidecar: 'art-prompts/v2/winners/enemy/drone/winner.json',
    sidecarSha256: DRONE.sources[0].generator.sidecarSha256,
    model: 'black-forest-labs/FLUX.2-dev',
    modelKey: 'flux2',
    weights: null,
    licence: 'flux-nc-2.1',
    reference: [],
  });

  /**
   * The drone record with one source changed.
   *
   * @param {Record<string, unknown>} change - Fields of `sources[0]`.
   * @returns {Record<string, unknown>} The record.
   */
  const withSource = (change) => ({ ...DRONE, sources: [{ ...DRONE.sources[0], ...change }] });

  it('accepts edit references, nested ones included', () => {
    const record = withSource({ reference: [{ ...REF, reference: [{ ...REF, from: null }] }] });
    assert.deepEqual(validateRecord(record, { sprite: 'enemies/drone' }), []);
  });

  for (const bad of ['../outside/secret.png', '/etc/passwd', 'C:/a.png', 'a/./b.png', 'a//b.png', 'a\\b.png']) {
    it(`rejects the path ${JSON.stringify(bad)} wherever a record names a file`, () => {
      for (const [record, path] of /** @type {[Record<string, unknown>, string][]} */ ([
        [withSource({ path: bad }), 'sources[0].path'],
        [withSource({ reference: [{ ...REF, path: bad }] }), 'sources[0].reference[0].path'],
        [withSource({ reference: [{ ...REF, from: bad }] }), 'sources[0].reference[0].from'],
        [withSource({ reference: [{ ...REF, sidecar: bad }] }), 'sources[0].reference[0].sidecar'],
        [
          withSource({ reference: [{ ...REF, reference: [{ ...REF, path: bad }] }] }),
          'sources[0].reference[0].reference[0].path',
        ],
        [withSource({ generator: { ...DRONE.sources[0].generator, sidecar: bad } }), 'sources[0].generator.sidecar'],
        [withSource({ prompt: { ...DRONE.sources[0].prompt, file: bad } }), 'sources[0].prompt.file'],
        [{ ...DRONE, recipe: { ...DRONE.recipe, path: bad } }, 'recipe.path'],
        [{ ...DRONE, edit: { ...DRONE.edit, path: bad } }, 'edit.path'],
      ])) {
        const problems = validateRecord(record, { sprite: 'enemies/drone' });
        assert.ok(
          problems.some((p) => p.startsWith(`${path}: must be a path relative to the root`)),
          `${path}: ${problems.join('\n')}`,
        );
      }
    });
  }

  it('rejects a reference without its hash, with a bad licence, or a hand origin over a modelled one', () => {
    const cases = /** @type {[Record<string, unknown>, RegExp][]} */ ([
      [withSource({ reference: [{ ...REF, sha256: null }] }), /^sources\[0\]\.reference\[0\]\.sha256:/],
      [withSource({ reference: [{ ...REF, licence: 'mit' }] }), /^sources\[0\]\.reference\[0\]\.licence:/],
      [withSource({ reference: ['x.png'] }), /^sources\[0\]\.reference\[0\]: must be an object/],
      [
        {
          ...withSource({ model: null, modelKey: null, licence: null, reference: [REF] }),
          origin: 'hand',
        },
        /^origin: a source or an edit reference names a model/,
      ],
    ]);
    for (const [record, pattern] of cases) {
      const problems = validateRecord(record, { sprite: 'enemies/drone' });
      assert.ok(
        problems.some((p) => pattern.test(p)),
        problems.join('\n'),
      );
    }
    // A hand-drawn redraw of an AI image is ai-assisted through its reference alone.
    assert.deepEqual(
      validateRecord(withSource({ model: null, modelKey: null, licence: null, reference: [REF] }), {
        sprite: 'enemies/drone',
      }),
      [],
    );
  });

  it('rejects a record at another sprite name', () => {
    assert.match(validateRecord(DRONE, { sprite: 'enemies/other' })[0], /does not match/);
  });

  it('accepts a hand-written record of hand-made art without tool fields', () => {
    const record = {
      schema: 'shmup-art-provenance@1',
      sprite: 'ships/kestrel',
      origin: 'hand',
      use: 'pixels',
      cleanup: 'none',
      handCleaned: false,
      reviewed: null,
      ingestedAt: '2026-10-17',
      author: 'an artist',
      sources: [],
      recipe: null,
      edit: null,
      output: { png: 'kestrel.png' },
      tool: null,
    };
    assert.deepEqual(validateRecord(record, { sprite: 'ships/kestrel' }), []);
  });
});

describe('paths and text hashes', () => {
  it('isSafeRelativePath takes plain relative paths only', () => {
    for (const ok of ['a.png', 'sources/drone-sheet.png', 'art-prompts/v2/winners/x/winner.png', '..a/b..c'])
      assert.equal(isSafeRelativePath(ok), true, ok);
    for (const bad of ['', '/a', '../a', 'a/..', 'a/./b', './a', 'a//b', 'a/', 'C:a', 'c:/a', 'a\\b', 'a\nb', 1, null])
      assert.equal(isSafeRelativePath(bad), false, JSON.stringify(bad));
  });

  it('knows the unversioned candidates folder', () => {
    assert.equal(isUnversioned('art-prompts/v2/candidates/a/x.png'), true);
    assert.equal(isUnversioned('art-prompts/v2/winners/x/winner.png'), false);
  });

  it('textSha256 reads CRLF as LF and leaves other bytes alone', () => {
    assert.equal(textSha256('{\r\n  "a": 1\r\n}\r\n'), sha256Hex('{\n  "a": 1\n}\n'));
    assert.equal(textSha256(Buffer.from('a\rb\n')), sha256Hex('a\rb\n'), 'a lone CR stays');
    assert.deepEqual(lfBytes(Buffer.from('x\r\n')), new Uint8Array([120, 10]));
  });
});

describe('the model table', () => {
  it('names every model group of the art round with a licence id and verdicts (art-provenance.md §2)', () => {
    const models = loadModels();
    assert.deepEqual(Object.keys(models).sort(), [
      'flux1',
      'flux2',
      'ltx25',
      'ltxvideo',
      'qwenedit',
      'qwenvl',
      'sd35',
      'wan22',
    ]);
    for (const [key, entry] of Object.entries(models)) {
      assert.match(entry.id, /^[\w.-]+\/[\w.-]+$/, key);
      assert.ok(LICENCE_IDS.includes(entry.licence), key);
      assert.ok(
        VERDICTS.includes(entry.verdict.pixels) && VERDICTS.includes(entry.verdict.reference),
        key,
      );
    }
    assert.deepEqual(models.flux2.verdict, { pixels: 'hold', reference: 'hold' });
    assert.equal(
      models.flux2.weights.transformer,
      'lmsys/flux2-dev-modelopt-fp8-sglang-transformer',
    );
    assert.equal(models.qwenvl.licence, 'apache-2.0');
  });

  it('refuses a table with an unknown licence id', () => {
    const file = join(tmp, 'models.json');
    writeFileSync(
      file,
      JSON.stringify({
        schema: 'shmup-ingest-models@1',
        models: {
          x: {
            id: 'a/b',
            weights: {},
            licence: 'mit',
            verdict: { pixels: 'ship', reference: 'ship' },
          },
        },
      }),
    );
    assert.throws(() => loadModels(file), /model "x" needs/);
  });
});

describe('checkProvenanceTree', () => {
  it('finds the fixture tree fully traced', () => {
    const result = checkProvenanceTree(SPRITES, 'fixtures');
    assert.deepEqual(result.issues, []);
    assert.equal(result.pngs, 5);
    assert.equal(result.records, 5);
  });

  it('reports a PNG without provenance, and accepts a LICENSES.md entry instead', () => {
    const dir = copyTree('untraced');
    writeFileSync(join(dir, 'enemies', 'stray.png'), encodePng(createImage(2, 2)));
    writeFileSync(join(dir, 'ships.png'), encodePng(createImage(2, 2)));
    const before = checkProvenanceTree(dir, 's').issues.map((i) => i.path);
    assert.deepEqual(before, ['s/enemies/stray.png', 's/ships.png']);
    writeFileSync(
      join(dir, 'LICENSES.md'),
      '# Licences\n\n- `enemies/stray` — CC0, by someone.\n- ships.png: drawn for the project.\n',
    );
    const after = checkProvenanceTree(dir, 's');
    assert.deepEqual(after.issues, []);
    assert.equal(after.licensed, 2);
  });

  it('reports a PNG edited after ingest, an orphan record and a recipe never ingested', () => {
    const dir = copyTree('tampered');
    const png = join(dir, 'enemies', 'gyre.png');
    writeFileSync(png, encodePng(createImage(24, 24)));
    rmSync(join(dir, 'fx', 'fixture-glow.png'));
    writeFileSync(join(dir, 'fx', 'later.recipe.json'), '{}');
    const messages = checkProvenanceTree(dir, 's').issues.map((i) => `${i.path} ${i.message}`);
    assert.ok(
      messages.some((m) => m.startsWith('s/enemies/gyre.art.json the PNG changed')),
      messages.join('\n'),
    );
    assert.ok(
      messages.some((m) => m.startsWith('s/fx/fixture-glow.art.json a record without its PNG')),
    );
    assert.ok(
      messages.some((m) =>
        m.startsWith('s/fx/fixture-glow.recipe.json a recipe that was never ingested'),
      ),
    );
    assert.ok(messages.some((m) => m.startsWith('s/fx/later.recipe.json')));
  });

  it('reports a changed sidecar and an invalid record', () => {
    const dir = copyTree('sidecar');
    writeFileSync(join(dir, 'enemies', 'drone.json'), '{}\n');
    writeFileSync(join(dir, 'enemies', 'gyre.art.json'), '{ nope');
    const messages = checkProvenanceTree(dir, 's').issues.map((i) => `${i.path} ${i.message}`);
    assert.ok(
      messages.some((m) => m.includes('drone.art.json the sidecar drone.json changed')),
      messages.join('\n'),
    );
    assert.ok(messages.some((m) => m.includes('gyre.art.json invalid JSON')));
  });

  it('accepts a sidecar checked out with CRLF line endings (a Windows checkout)', () => {
    const dir = copyTree('crlf');
    const file = join(dir, 'enemies', 'drone.json');
    writeFileSync(file, readFileSync(file, 'utf8').replace(/\n/g, '\r\n'));
    assert.deepEqual(checkProvenanceTree(dir, 's').issues, []);
  });

  it('ignores the edit layer and handles a missing tree', () => {
    assert.deepEqual(checkProvenanceTree(join(tmp, 'missing')), {
      pngs: 0,
      records: 0,
      licensed: 0,
      issues: [],
    });
  });
});
