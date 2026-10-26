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
 *   and palette map beating code-defined ones.
 */
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

/** The six fixture sprites the ingest tool's tests produce. */
const FIXTURE_NAMES = [
  'backdrops/fixture-far',
  'bosses/fringe-hull',
  'enemies/drone',
  'enemies/gyre',
  'fx/fixture-glow',
  'ships/fixture-ship',
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
      ['code', 'flux1', 'flux2', 'ltx25', 'ltxvideo', 'qwenedit', 'qwenvl', 'sd35', 'wan22'].sort(),
    );
    for (const entry of Object.values(models)) expect(LICENCE_IDS).toContain(entry.licence);
    // Owner ruling 2026-10-23 (art-provenance.md §8, decision 1): FLUX art ships in the free
    // open-source (MPL-2.0) distribution, never sold — a paid distribution needs a BFL licence.
    expect(models.flux1.verdict).toEqual({ pixels: 'ship', reference: 'ship' });
    expect(models.flux2.verdict).toEqual({ pixels: 'ship', reference: 'ship' });
    for (const key of ['flux1', 'flux2'])
      expect(models[key as 'flux1' | 'flux2'].conditions).toContain('bfl.ai/licensing');
    // LTX-Video is the table's only hold today (art-provenance.md §2).
    expect(models.ltxvideo.verdict).toEqual({ pixels: 'hold', reference: 'hold' });
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
    // The same art over a code-defined sprite: its sidecar anchor wins over the code's —
    // and so does its sidecar palette map. V2a (8416da5) made a code map whose colours left
    // the art an error (pipeline.mjs p2MapIssues: a key colour must be in the frames, and
    // the map must change a pixel), and the drone art holds none of the kestrel's v1
    // colours; the copy therefore carries its own map in `meta.shmup.p2`. sprite-source.mjs
    // applyPngOverrides (:682-719, `merged.p2 = png.p2` when the sidecar has one) keeps the
    // sidecar map over the code's, and pipeline.mjs (:430-451) draws the sibling from the
    // merged sprite. The map exchanges the first two opaque colours of the art: both keys
    // are colours the frames hold and both values differ, so it maps the art.
    cpSync(
      join(FIXTURE_SPRITES, 'enemies', 'drone.png'),
      join(src, 'sprites', 'ships', 'kestrel.png'),
    );
    cpSync(
      join(FIXTURE_SPRITES, 'enemies', 'drone.json'),
      join(src, 'sprites', 'ships', 'kestrel.json'),
    );
    const strip = decodePng(readFileSync(join(FIXTURE_SPRITES, 'enemies', 'drone.png')));
    const artColours: number[] = [];
    for (let i = 0; i < strip.data.length; i += 4) {
      if (strip.data[i + 3] === 0) continue;
      const packed = (strip.data[i] << 16) | (strip.data[i + 1] << 8) | strip.data[i + 2];
      if (!artColours.includes(packed)) artColours.push(packed);
    }
    expect(artColours.length).toBeGreaterThanOrEqual(2);
    const hexOf = (packed: number) => `#${packed.toString(16).padStart(6, '0')}`;
    const sidecarPath = join(src, 'sprites', 'ships', 'kestrel.json');
    const sidecar = JSON.parse(readFileSync(sidecarPath, 'utf8')) as {
      meta: Record<string, unknown>;
    };
    sidecar.meta.shmup = {
      p2: {
        [hexOf(artColours[0])]: hexOf(artColours[1]),
        [hexOf(artColours[1])]: hexOf(artColours[0]),
      },
    };
    writeFileSync(sidecarPath, JSON.stringify(sidecar));

    const { manifest, pages } = buildAtlas({ sourceDir: src });
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
    // The sidecar map won over the code's: `ships/kestrel@p2` exists, and frame 0 is the
    // drone art with exactly the two map colours exchanged — every other colour and every
    // alpha stays (makeP2Sprite, coop.mjs). The 4-frame drone strip replaces the v2 code
    // map's frames per index, so its fifth frame (R4-01.A1b's steep dive) survives as #4;
    // the pixel walk below pins the PNG's frame 0, where the sidecar map is what applies.
    expect(manifest.sprites['ships/kestrel@p2'].frames).toEqual([
      'ships/kestrel@p2#0',
      'ships/kestrel@p2#1',
      'ships/kestrel@p2#2',
      'ships/kestrel@p2#3',
      'ships/kestrel@p2#4',
    ]);
    const p2frame = manifest.frames['ships/kestrel@p2#0'];
    expect([p2frame.w, p2frame.h, p2frame.ax, p2frame.ay]).toEqual([16, 12, 8, 6]);
    for (let y = 0; y < 12; y++) {
      for (let x = 0; x < 16; x++) {
        const [r, g, b, a] = getPixel(strip, x, y);
        const packed = (r << 16) | (g << 8) | b;
        const to =
          packed === artColours[0]
            ? artColours[1]
            : packed === artColours[1]
              ? artColours[0]
              : packed;
        expect(getPixel(pages[p2frame.p].image, p2frame.x + x, p2frame.y + y)).toEqual([
          (to >> 16) & 0xff,
          (to >> 8) & 0xff,
          to & 0xff,
          a,
        ]);
      }
    }
  });
});
