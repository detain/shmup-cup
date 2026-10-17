/**
 * R3-02 — real art and its provenance, as the repo's asset pipeline sees them:
 *
 * - **Every override PNG is traced:** each `*.png` under `assets/source/sprites/` (and in the
 *   staging folder `art-prompts/v2/ingested/` while it exists) has a valid `<name>.art.json`
 *   whose hashes still match the PNG and its sidecar, or a `LICENSES.md` entry. The check is
 *   the ingest tool's own dependency-free `checkProvenanceTree`
 *   (`art-prompts/ingest/lib/provenance.mjs`).
 * - **The pipeline picks up ingested art:** the ingest tool's committed fixture outputs load
 *   through `loadSpriteSources` with the recipe, the record and the hand-edit layer ignored,
 *   and pack into an atlas with the sidecar's frames, tags and anchor — the sidecar anchor
 *   beating a code-defined one.
 */
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import {
  LICENCE_IDS,
  checkProvenanceTree,
  loadModels,
  validateRecord,
} from '../../../art-prompts/ingest/lib/provenance.mjs';
import { getPixel } from '../../../scripts/assets/image.mjs';
import { DEFAULT_SOURCE_DIR, buildAtlas } from '../../../scripts/assets/pipeline.mjs';
import { decodePng } from '../../../scripts/assets/png.mjs';
import { INGEST_SUFFIXES, loadSpriteSources } from '../../../scripts/assets/sprite-source.mjs';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SPRITES = join(repo, 'assets', 'source', 'sprites');
const STAGING = join(repo, 'art-prompts', 'v2', 'ingested');
const FIXTURE_SPRITES = join(repo, 'art-prompts', 'ingest', 'test', 'fixtures', 'sprites');

const tmp = mkdtempSync(join(tmpdir(), 'shmup-provenance-'));

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

/** The five fixture sprites the ingest tool's tests produce. */
const FIXTURE_NAMES = [
  'backdrops/fixture-far',
  'bosses/fringe-hull',
  'enemies/drone',
  'enemies/gyre',
  'fx/fixture-glow',
];

describe('R3-02 — provenance of real art', () => {
  it('every override PNG under assets/source/sprites has a valid .art.json or a LICENSES.md entry', () => {
    const result = checkProvenanceTree(SPRITES, 'assets/source/sprites');
    expect(result.issues).toEqual([]);
    // Every PNG is accounted for one way or the other.
    expect(result.records + result.licensed).toBeGreaterThanOrEqual(result.pngs);
  });

  it('so does the staging folder art-prompts/v2/ingested/, while it exists (until R2-01)', () => {
    if (!existsSync(STAGING)) return;
    expect(checkProvenanceTree(STAGING, 'art-prompts/v2/ingested').issues).toEqual([]);
  });

  it("the ingest tool's fixture outputs are traced too, and their records validate", () => {
    const result = checkProvenanceTree(FIXTURE_SPRITES, 'fixtures');
    expect(result.issues).toEqual([]);
    expect(result.pngs).toBe(FIXTURE_NAMES.length);
    for (const name of FIXTURE_NAMES) {
      const record: unknown = JSON.parse(
        readFileSync(join(FIXTURE_SPRITES, `${name}.art.json`), 'utf8'),
      );
      expect(validateRecord(record, { sprite: name }), name).toEqual([]);
    }
  });

  it('the model table maps every art-round model to a licence id of art-provenance.md §2', () => {
    const models = loadModels();
    expect(Object.keys(models).sort()).toEqual(
      ['flux1', 'flux2', 'ltx25', 'ltxvideo', 'qwenedit', 'qwenvl', 'sd35', 'wan22'].sort(),
    );
    for (const entry of Object.values(models)) expect(LICENCE_IDS).toContain(entry.licence);
    // §6 rule 1: nothing FLUX-made ships until Black Forest Labs answers (open decision 1).
    expect(models.flux1.verdict).toEqual({ pixels: 'hold', reference: 'hold' });
    expect(models.flux2.verdict).toEqual({ pixels: 'hold', reference: 'hold' });
  });
});

describe('R3-02 — the pipeline picks up ingested art', () => {
  it('loads the fixture outputs as overrides and ignores recipes, records and edit layers', () => {
    expect([...INGEST_SUFFIXES]).toEqual(['.recipe.json', '.art.json', '.edit.png']);
    const { sprites, overrides, issues } = loadSpriteSources(FIXTURE_SPRITES, 'fixtures');
    expect(issues).toEqual([]);
    expect(sprites).toEqual([]);
    expect(overrides.map((o) => o.name).sort()).toEqual(FIXTURE_NAMES);
    const drone = overrides.find((o) => o.name === 'enemies/drone');
    expect(drone?.frames.map((f) => [f.width, f.height])).toEqual([
      [16, 12],
      [16, 12],
      [16, 12],
      [16, 12],
    ]);
    expect(drone?.anchor).toEqual([8, 6]);
    expect(drone?.animations).toEqual({ idle: [0, 1, 2, 3], blink: [1, 2] });
  });

  it('packs an ingested sprite into the atlas, pixel for pixel, with its anchor and tags', () => {
    const src = join(tmp, 'atlas');
    cpSync(DEFAULT_SOURCE_DIR, src, { recursive: true });
    for (const suffix of ['.png', '.json', '.art.json', '.recipe.json', '.edit.png']) {
      cpSync(
        join(FIXTURE_SPRITES, 'enemies', `drone${suffix}`),
        join(src, 'sprites', 'enemies', `drone${suffix}`),
      );
    }
    // The same art over a code-defined sprite: its sidecar anchor wins over the code's.
    cpSync(
      join(FIXTURE_SPRITES, 'enemies', 'drone.png'),
      join(src, 'sprites', 'ships', 'kestrel.png'),
    );
    cpSync(
      join(FIXTURE_SPRITES, 'enemies', 'drone.json'),
      join(src, 'sprites', 'ships', 'kestrel.json'),
    );

    const { manifest, pages } = buildAtlas({ sourceDir: src });
    const strip = decodePng(readFileSync(join(FIXTURE_SPRITES, 'enemies', 'drone.png')));
    expect(manifest.sprites['enemies/drone'].frames).toEqual(
      [0, 1, 2, 3].map((i) => `enemies/drone#${i}`),
    );
    expect(manifest.sprites['enemies/drone.edit']).toBeUndefined();
    expect(manifest.animations['enemies/drone']).toEqual({ idle: [0, 1, 2, 3], blink: [1, 2] });
    for (let i = 0; i < 4; i++) {
      const frame = manifest.frames[`enemies/drone#${i}`];
      expect([frame.w, frame.h, frame.ax, frame.ay]).toEqual([16, 12, 8, 6]);
      for (let y = 0; y < 12; y++) {
        for (let x = 0; x < 16; x++) {
          expect(getPixel(pages[frame.p].image, frame.x + x, frame.y + y)).toEqual(
            getPixel(strip, i * 16 + x, y),
          );
        }
      }
    }
    const kestrel = manifest.frames['ships/kestrel#0'];
    expect([kestrel.w, kestrel.h, kestrel.ax, kestrel.ay]).toEqual([16, 12, 8, 6]);
  });
});
