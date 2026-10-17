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
  loadModels,
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

  it('ignores the edit layer and handles a missing tree', () => {
    assert.deepEqual(checkProvenanceTree(join(tmp, 'missing')), {
      pngs: 0,
      records: 0,
      licensed: 0,
      issues: [],
    });
  });
});
