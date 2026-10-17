/**
 * The fixture sources are synthetic and reproducible: `make-fixtures.mjs` draws exactly the
 * committed files (PNG, JPEG and the hand-edit layer), so nobody has to trust a binary.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { chebyshev } from '../lib/image.mjs';
import { ingestRecipe } from '../lib/pipeline.mjs';
import { loadModels } from '../lib/provenance.mjs';
import { makeFixtures } from './fixtures/make-fixtures.mjs';

const FIXTURES = join(import.meta.dirname, 'fixtures');
const tmp = mkdtempSync(join(tmpdir(), 'shmup-ingest-fixtures-'));
after(() => rmSync(tmp, { recursive: true, force: true }));

describe('make-fixtures.mjs', () => {
  it('redraws every committed fixture source byte for byte', () => {
    const written = makeFixtures(tmp);
    assert.deepEqual(written, [
      'sources/drone-sheet.png',
      'sources/drone-sheet.json',
      'sources/gyre.jpg',
      'sources/fringe.png',
      'sources/far.png',
      'sources/glow.png',
      'sprites/enemies/drone.edit.png',
    ]);
    for (const rel of written) {
      assert.deepEqual(readFileSync(join(tmp, rel)), readFileSync(join(FIXTURES, rel)), rel);
    }
  });

  it('draws the key the art bible measured: a yellowish green around #3cf102', () => {
    const sidecar = JSON.parse(readFileSync(join(FIXTURES, 'sources', 'drone-sheet.json'), 'utf8'));
    assert.match(sidecar.prompt, /SYNTHETIC FIXTURE/);
    const result = ingestRecipe(join(FIXTURES, 'sprites', 'enemies', 'drone.recipe.json'), {
      root: FIXTURES,
      outDir: null,
      palettesDir: join(FIXTURES, 'palettes'),
      models: loadModels(),
      date: null,
      today: '2030-01-01',
    });
    const keys = /** @type {string[]} */ (result.report.keys);
    assert.ok(keys.length > 0);
    for (const hex of keys) assert.ok(chebyshev(parseInt(hex.slice(1), 16), 0x3cf102) <= 3, hex);
  });
});
