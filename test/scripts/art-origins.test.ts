/**
 * R3-05 part 2 — the origin report, `scripts/art-origins.mjs` (`docs/dev/art-provenance.md` §9).
 *
 * The plan's acceptance: "the origin report runs in CI and lists no sprite without provenance;
 * the licence table is filled for every model that produced shipped art". So this file
 *
 * - runs the report over the **shipped tree** (`assets/source/`): no failure and no shipped
 *   finding, and every sprite the atlas packs is classified exactly once, consistently with the
 *   pipeline's own origins. A **staged warning** (rules 3–5 in `art-prompts/v2/ingested/`) is
 *   allowed there and never fails CI — a test stages an unreviewed sprite to prove it;
 * - adds the ingest tool's **six fixture outputs** to a temporary copy of `assets/source/` as
 *   override PNGs: the FLUX ones pass the flipped rule-3 verdicts (art-provenance.md §8, decision
 *   1, 2026-10-23), the unreviewed AI records fail (rule 4),
 *   `gyre` — `use: "reference"` with `cleanup: "none"` — fails rule 5, the hand-made `fringe-hull`
 *   passes;
 * - checks every rule on **synthetic records**: an edit of an edit of a held image (LTX-Video)
 *   holds, a
 *   licence that is not the table's, an unknown model or key, a `null` licence, a held licence on a
 *   model the table lacks, a PNG with no record, a `LICENSES.md` entry, an invalid record, a path
 *   in the candidates folder, and the verdict read for the record's own `use`;
 * - checks that the **staging folder** only warns on rules 3–5 and still fails on 1, 2 and 6;
 * - checks that `art-provenance.md` §2 names every licence id and model of `models.json`, with
 *   the same verdicts (the licence table is filled);
 * - runs the **command line** for its exit codes: 0, 1 (a failure with `--check`, or no report)
 *   and 2 (bad usage).
 *
 * Every tree it builds is a temporary folder; nothing in the repository is written.
 */
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  LICENCE_IDS,
  loadModels,
  sha256Hex,
  validateRecord,
} from '../../art-prompts/ingest/lib/provenance.mjs';
import {
  DEFAULT_STAGING_DIR,
  RULES,
  buildOriginReport,
  formatOriginReport,
  parseArgs,
  type OriginReport,
  type SpriteOrigin,
} from '../../scripts/art-origins.mjs';
import { DEFAULT_SOURCE_DIR, buildAtlas, collectSprites } from '../../scripts/assets/pipeline.mjs';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const script = join(repo, 'scripts', 'art-origins.mjs');
const FIXTURES = join(repo, 'art-prompts', 'ingest', 'test', 'fixtures', 'sprites');
const models = loadModels();

const tmp = mkdtempSync(join(tmpdir(), 'shmup-art-origins-'));

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

/** A record as plain JSON. */
type Json = Record<string, unknown>;

/**
 * The findings of a report as `<tree> <sprite> rule <n> <severity>` lines, sorted.
 *
 * @param report - A report.
 * @returns The lines.
 */
function verdicts(report: OriginReport): string[] {
  return report.findings
    .map((f) => `${f.tree} ${f.sprite ?? '-'} rule ${f.rule} ${f.severity}`)
    .sort();
}

/**
 * One row of a report, which must exist.
 *
 * @param rows - The report's rows.
 * @param name - A sprite name.
 * @returns Its row.
 */
function row(rows: readonly SpriteOrigin[], name: string): SpriteOrigin {
  const found = rows.find((r) => r.name === name);
  expect(found, name).toBeDefined();
  return found as SpriteOrigin;
}

/**
 * A copy of `assets/source/` with the ingest tool's fixture outputs added as overrides (with
 * their sidecars, records, recipes and the hand-edit layer, as the tool leaves them).
 *
 * @returns The copy's root.
 */
function fixtureTree(): string {
  const dir = join(tmp, 'fixture-source');
  rmSync(dir, { recursive: true, force: true });
  cpSync(DEFAULT_SOURCE_DIR, dir, { recursive: true });
  cpSync(FIXTURES, join(dir, 'sprites'), { recursive: true });
  return dir;
}

/** A PNG the asset pipeline reads (the fixture `fringe-hull`, one 20×12 frame, no sidecar). */
const PNG = readFileSync(join(FIXTURES, 'bosses', 'fringe-hull.png'));

/** A fixture record to start synthetic ones from (a Qwen edit, written by the tool). */
const BASE_RECORD = JSON.parse(
  readFileSync(join(FIXTURES, 'enemies', 'gyre.art.json'), 'utf8'),
) as Json;

/** A digest for recorded inputs that are never read back. */
const HASH = 'a'.repeat(64);

/**
 * An edit's input image as the ingest tool records it (a committed winner copy).
 *
 * @param key - The model group that made it.
 * @param nested - Its own edit inputs.
 * @returns The `reference` entry.
 */
function reference(key: string, nested: Json[] = []): Json {
  const m = models[key];
  return {
    path: `art-prompts/v2/winners/${key}/winner.png`,
    from: `art-prompts/v2/candidates/a/${key}.png`,
    sha256: HASH,
    sidecar: `art-prompts/v2/winners/${key}/winner.json`,
    sidecarSha256: HASH,
    model: m.id,
    modelKey: key,
    weights: m.weights,
    licence: m.licence,
    reference: nested,
  };
}

/**
 * Writes an override PNG and, unless `edit` returns `null`, its record: a reviewed, lightly
 * cleaned Qwen-Image edit used as pixels, changed by `edit`. The record is valid (asserted) unless
 * `valid` is false, so a case tests the rule it means and not the tree check.
 *
 * @param sprites - The tree's `sprites/` folder (or the staging folder).
 * @param name - The sprite name.
 * @param edit - Changes the record (`r.sources[0]` is the source); returns `null` for no record.
 * @param valid - Whether the record must pass `validateRecord`.
 */
function writeOverride(
  sprites: string,
  name: string,
  edit: (r: Json, source: Json) => Json | null | void = () => undefined,
  valid = true,
): void {
  const png = join(sprites, `${name}.png`);
  mkdirSync(dirname(png), { recursive: true });
  writeFileSync(png, PNG);
  const record = structuredClone(BASE_RECORD);
  Object.assign(record, {
    sprite: name,
    use: 'pixels',
    cleanup: 'light',
    handCleaned: true,
    reviewed: { on: '2026-10-17', by: 'the origin report test' },
  });
  Object.assign(record.output as Json, {
    png: `${name.split('/').pop()}.png`,
    sha256: sha256Hex(PNG),
    sidecar: null,
  });
  delete (record.output as Json).sidecarSha256;
  const source = (record.sources as Json[])[0];
  if (edit(record, source) === null) return;
  if (valid) expect(validateRecord(record, { sprite: name }), name).toEqual([]);
  writeFileSync(join(sprites, `${name}.art.json`), `${JSON.stringify(record, null, 2)}\n`);
}

/**
 * Sets a source (or reference) to an image made by a model group, as the tool records it.
 *
 * @param image - The source.
 * @param key - The `models.json` group.
 */
function madeBy(image: Json, key: string): void {
  const m = models[key];
  Object.assign(image, { model: m.id, modelKey: key, weights: m.weights, licence: m.licence });
}

/**
 * Runs the command line.
 *
 * @param args - Its arguments.
 * @returns The exit status and output.
 */
function cli(...args: string[]): { status: number | null; stdout: string; stderr: string } {
  const run = spawnSync(process.execPath, [script, ...args], { cwd: repo, encoding: 'utf8' });
  return { status: run.status, stdout: run.stdout, stderr: run.stderr };
}

/**
 * What CI demands of the repository's own trees: nothing fails, in either tree (a staged PNG
 * without provenance, a model not in the table or a candidates path fails — rules 1, 2, 6), no
 * shipped sprite has a finding, and every shipped sprite is traced. A **staged warning** (rules
 * 3–5: a hold, a missing review, a light reference) is allowed — art may wait in the staging folder
 * for its review (`art-provenance.md` §9.3), so R3-02's real ingest does
 * not turn CI red.
 *
 * @param report - A report over the shipped `assets/source/`, with any staging folder.
 */
function expectRepositoryPasses(report: OriginReport): void {
  expect(report.failures).toBe(0);
  expect(report.findings.filter((f) => f.tree === 'shipped' || f.severity === 'failure')).toEqual(
    [],
  );
  expect(report.sprites.every((r) => r.status === 'ok' && r.origin !== 'unknown')).toBe(true);
}

/** The last line of a report that passes `--check`: no failure, any number of staged warnings. */
const PASSING_SUMMARY = /\n0 failures, \d+ warnings?\n$/;

describe('R3-05 — the origin report on the shipped tree', () => {
  const report = buildOriginReport();

  it('lists no sprite without provenance: no failure and no shipped finding', () => {
    expectRepositoryPasses(report);
    expect(report.sourceDir).toBe('assets/source');
    expect(report.stagingDir).toBe('art-prompts/v2/ingested');
    expect(report.modelsFile).toBe('art-prompts/ingest/models.json');
    expect(DEFAULT_STAGING_DIR).toBe(join(repo, 'art-prompts', 'v2', 'ingested'));
  });

  it('still passes with a staged warning: an unreviewed sprite waiting in the staging folder', () => {
    const staging = join(tmp, 'staging-unreviewed');
    writeOverride(staging, 'bosses/maw-hull', (r, s) => {
      madeBy(s, 'qwenvl');
      r.reviewed = null;
    });
    const staged = buildOriginReport({ stagingDir: staging });
    expect([staged.failures, staged.warnings]).toEqual([0, 1]);
    expect(verdicts(staged)).toEqual(['staged bosses/maw-hull rule 4 warning']);
    expectRepositoryPasses(staged);
    expect(staged.sprites).toEqual(report.sprites);
    const text = formatOriginReport(staged);
    expect(text).toMatch(PASSING_SUMMARY);
    expect(text.endsWith('\n0 failures, 1 warning\n')).toBe(true);
    const run = cli('--check', '--staging', staging);
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('WARN [staged, rule 4] bosses/maw-hull: ');
    expect(run.stdout).toMatch(PASSING_SUMMARY);
    expect(run.stderr).toBe('');
  });

  it('classifies every sprite the atlas packs exactly once', () => {
    const names = report.sprites.map((r) => r.name);
    expect(names).toEqual(Object.keys(buildAtlas().manifest.sprites).sort());
    expect(new Set(names).size).toBe(names.length);
    const tallied = Object.values(report.counts.shipped.byOriginKind)
      .flatMap((byKind) => Object.values(byKind))
      .reduce((a, b) => a + b, 0);
    expect(tallied).toBe(names.length);
    expect(report.counts.shipped.total).toBe(names.length);
  });

  it("agrees with the pipeline's own origins (procedural is derived, never declared)", () => {
    const { sprites, fonts } = collectSprites();
    const rows = new Map(report.sprites.map((r) => [r.name, r]));
    for (const sprite of sprites) {
      const r = rows.get(sprite.name) as SpriteOrigin;
      const o = sprite.origin;
      if (o.endsWith('.png')) expect(['record', 'licensed']).toContain(r.kind);
      else if (o.startsWith('procedural:')) {
        expect([r.origin, r.kind, r.source]).toEqual([
          'procedural',
          'generator',
          o.slice('procedural:'.length),
        ]);
      } else if (o.startsWith('flash:') || o.startsWith('p2:') || o.startsWith('palette:')) {
        const base = rows.get(o.slice(o.indexOf(':') + 1)) as SpriteOrigin;
        expect(r.kind).toBe(
          o.startsWith('flash:') ? 'flash' : o.startsWith('p2:') ? 'p2' : 'palette',
        );
        expect([r.base, r.origin, r.models]).toEqual([base.name, base.origin, base.models]);
      } else if (o.endsWith('.sprite.json'))
        expect([r.origin, r.kind]).toEqual(['procedural', 'pixel-map']);
      else
        expect([o.endsWith('.font.json'), r.origin, r.kind]).toEqual([true, 'procedural', 'font']);
    }
    const kinds = report.counts.shipped.byOriginKind.procedural;
    const originOf = new Map(sprites.map((s) => [s.name, s.origin]));
    const baseIsProcedural = (o: string) => {
      const base = originOf.get(o.slice(o.indexOf(':') + 1)) ?? '';
      // A pipeline source carries ' + <override>.png' once a real-art override sits on it — the
      // base is then a record, whatever the generator or pixel-map stood underneath (R5-02.S3:
      // zone B's overrides sit on brine.mjs, whose origin still starts 'procedural:').
      if (base.includes(' + ')) return false;
      return base.startsWith('procedural:') || base.endsWith('.sprite.json');
    };
    expect(kinds.font).toBe(Object.keys(fonts).length);
    // The @flash of a recorded (real-art) base belongs to the record, not to procedural.
    expect(kinds.flash).toBe(
      sprites.filter((s) => s.origin.startsWith('flash:') && baseIsProcedural(s.origin)).length,
    );
    // Likewise the @p2 of a recorded base (R6-03.S3: the crafts' @p2 ride their overrides).
    expect(kinds.p2).toBe(
      sprites.filter((s) => s.origin.startsWith('p2:') && baseIsProcedural(s.origin)).length,
    );
    // Likewise the colour-blind @palette siblings of a recorded base (w15-REING7: the three
    // gen7 round bodies landed with records, so their variants ride the record, not procedural).
    expect(kinds.palette ?? 0).toBe(
      sprites.filter((s) => s.origin.startsWith('palette:') && baseIsProcedural(s.origin)).length,
    );
  });

  it('every model that made shipped art is in the model table (none today)', () => {
    for (const model of Object.keys(report.counts.shipped.byModel)) {
      expect(Object.values(models).map((m) => m.id)).toContain(model);
    }
  });

  it('prints the tallies by origin × kind and by served model, and one row per sprite', () => {
    const text = formatOriginReport(report);
    expect(text).toContain('Shipped sprites by origin and kind:');
    // The palette column joins the table once any @palette sibling rides a record (w15-REING7).
    expect(text).toMatch(
      /\n {2}origin +generator +pixel-map +font +flash +p2(?: +palette)?(?: +record)? +total\n/,
    );
    expect(text).toContain('Shipped sprites by served model (as a source or an edit reference):');
    expect(text).toMatch(PASSING_SUMMARY);
    const listed = formatOriginReport(report, { list: true }).split('\n');
    for (const r of report.sprites) {
      expect(listed.some((line) => line.startsWith(`  ${r.name} `))).toBe(true);
    }
  });
});

describe("R3-05 — the ingest tool's fixtures as shipped overrides", () => {
  const report = buildOriginReport({ sourceDir: fixtureTree(), stagingDir: null });

  it('FLUX ships free, unreviewed AI art fails, a reference without real cleanup fails, hand art passes', () => {
    expect(verdicts(report)).toEqual(
      [
        'shipped backdrops/fixture-far rule 4 failure', // not reviewed (its FLUX.1 art ships)
        'shipped enemies/gyre rule 4 failure', // not reviewed
        'shipped enemies/gyre rule 5 failure', // use "reference", cleanup "none" (W3-10)
        'shipped fx/fixture-glow rule 4 failure', // not reviewed (its FLUX.2 art ships)
      ].sort(),
    );
    expect(report.failures).toBe(4);
    expect(report.warnings).toBe(0);
    expect(row(report.sprites, 'bosses/fringe-hull')).toMatchObject({
      origin: 'hand',
      kind: 'record',
      models: [],
      status: 'ok',
      record: `${report.sourceDir}/sprites/bosses/fringe-hull.art.json`,
    });
  });

  it('records each override with its models, licences, use and cleanup', () => {
    expect(row(report.sprites, 'enemies/drone')).toMatchObject({
      origin: 'ai-assisted',
      kind: 'record',
      models: ['black-forest-labs/FLUX.2-dev'],
      licences: ['flux-nc-2.1'],
      use: 'pixels',
      cleanup: 'light',
      reviewed: true,
      status: 'ok', // reviewed FLUX art ships (art-provenance.md §8, decision 1)
    });
    expect(row(report.sprites, 'enemies/gyre')).toMatchObject({
      origin: 'ai-assisted',
      models: ['Qwen/Qwen-Image-Edit-2511'],
      use: 'reference',
      cleanup: 'none',
      reviewed: false,
    });
    expect(row(report.sprites, 'backdrops/fixture-far').models).toEqual([
      'black-forest-labs/FLUX.1-dev',
    ]);
    // A generated sibling inherits its base's class and status.
    for (const sibling of report.sprites.filter((r) => r.base !== null)) {
      const base = row(report.sprites, sibling.base as string);
      expect([sibling.origin, sibling.models, sibling.record]).toEqual([
        base.origin,
        base.models,
        base.record,
      ]);
      if (base.status === 'failure') expect(sibling.status).toBe('failure');
    }
    expect(report.counts.shipped.byOriginKind.hand).toEqual({ record: 1 });
    // The five fixture records this test ships as overrides, over the live tree's thirty-
    // seven: zone A's two (drifter, vane), zone B's four, zone C's three, zone D's two,
    // zone E's five, zone F's two, zone G's one, zone H's four (bolt-drone, gyre,
    // sentinel-walker, trench-eel — the fixture gyre stands in for the ingested one),
    // zone I's two (depth-mine, gulper), the S3 cross-zone pass's eight (the copy
    // holds assets/source), REING1's two (tiles/terrain-prism-v2, fx/black-hole) and
    // REING2's two (items/capsule, items/capsule-blue) and GEN4's
    // forty-two (the never-designed batch's landed quartets — the code-class halo
    // record joins too: its recorded source is still FLUX.2-dev, so it is
    // ai-assisted like the rest) — the fixture gyre stands in for the
    // ingested one; REING-6's fourteen gen6 records joined (the two re-landed options kept
    // their own), so the copy lands ninety-three live plus five minus one. w15-ENRICH-A's three
    // records joined (items/bonus and items/one-up — gen6 rows REING6 stopped at the pool floor; the
    // option hunter went with them and was dropped in review, see the w15-ENRICH-A report), so the
    // copy lands ninety-five live plus five minus one. w15-REING7's eighteen gen7 records joined
    // (the nine zone-map planets, the four capsule pills, the three round bodies, the flak
    // casing and the 36-tile ridge sheet), so the copy lands one hundred thirteen live
    // plus five minus one.
    expect(report.counts.shipped.byOriginKind['ai-assisted'].record).toBe(117);
  });

  it('tallies the served models with their licence and verdicts', () => {
    const byModel = report.counts.shipped.byModel;
    expect(byModel['black-forest-labs/FLUX.1-dev']).toEqual({
      sprites: 1,
      licence: 'flux1-dev-nc-1.1.1',
      pixels: 'ship',
      reference: 'ship',
    });
    expect(byModel['black-forest-labs/FLUX.2-dev']).toMatchObject({
      // The fixture copy's two FLUX.2 sprites plus the live tree's sixty-three — its
      // thirty-seven overrides: zone A's vane and drifter, zone B's froth, brood-bubble,
      // urchin and maw-rocket, zone C's dune-worm, dust-devil and husk-crawler, zone D's
      // ember-wisp and magma-cone, zone E's thunderhead, steed-foal, steed-chest,
      // steed-snout and steed-tail, zone F's vault-claw and polyp-turret, zone G's
      // glint-mote, zone H's bolt-drone, gyre, sentinel-walker and trench-eel, zone I's
      // depth-mine and gulper, the S3 cross-zone pass's kestrel, manta, pod, orb,
      // stolen, explosion-small, debris and spark, REING1's terrain-prism-v2 and
      // black-hole, REING2's capsule and capsule-blue, GEN4's forty-two
      // never-designed drops and REING-6's fourteen gen6 sprites (the re-landed orb and
      // stolen keep their records; the ten shots and the four terrain-v2 sheets are new) plus
      // w15-ENRICH-A's two re-landed gen6 rows (the bonus jewel and the one-up — what REING6
      // stopped at the pool floor; the hunter was dropped in this lane's screen check) —
      // with forty-nine derived @flash
      // sprites (the interim tail has none, the S3 drops are player/option/item/fx art
      // that never flashes; the capsules never flash either; GEN4's enemies, bosses,
      // decor and glow vents flash) and the two crafts' derived
      // @p2 sprites: one hundred forty-six live sprites, and the fixture tree lands
      // one hundred forty-six again — its pair adds the drone and the glow while the
      // fixture gyre supersedes zone H's ingested pair. w15-REING7's eighteen gen7 override
      // sprites join, and the round bodies' records pull their nine colour-blind @palette
      // siblings over from procedural too — one hundred seventy-three live, and the fixture
      // tree lands one hundred seventy-three again.
      sprites: 173,
      licence: 'flux-nc-2.1',
      pixels: 'ship',
    });
    expect(byModel['Qwen/Qwen-Image-Edit-2511']).toMatchObject({
      licence: 'apache-2.0',
      pixels: 'ship',
      reference: 'ship',
    });
    const text = formatOriginReport(report);
    expect(text).toContain('FAIL [shipped, rule 4] backdrops/fixture-far: ');
    expect(text.endsWith('4 failures, 0 warnings\n')).toBe(true);
  });
});

describe('R3-05 — every rule, on synthetic records', () => {
  const source = join(tmp, 'synthetic');
  const sprites = join(source, 'sprites');
  let report: OriginReport;

  beforeAll(() => {
    mkdirSync(sprites, { recursive: true });
    // A Qwen edit of a Qwen edit of an LTX-Video frame: the hold is two edits deep (rule 3;
    // LTX-Video is the held model since the FLUX flip of 2026-10-23). The
    // edit inputs' `from` names a candidate, which is allowed (rule 6 reads committed paths only).
    writeOverride(sprites, 'syn/edit-of-held', (_r, s) => {
      madeBy(s, 'qwenedit');
      s.reference = [reference('qwenedit', [reference('ltxvideo')])];
    });
    writeOverride(sprites, 'syn/clean-edit', (_r, s) => {
      madeBy(s, 'qwenedit');
      s.reference = [reference('qwenvl')];
    });
    writeOverride(sprites, 'syn/licence-mismatch', (_r, s) => {
      madeBy(s, 'qwenvl');
      s.licence = 'stability-community-2024-07-05';
    });
    writeOverride(sprites, 'syn/unknown-model', (_r, s) => {
      Object.assign(s, { model: 'acme/painter-9', modelKey: null, licence: 'apache-2.0' });
    });
    writeOverride(sprites, 'syn/unknown-key', (_r, s) => {
      Object.assign(s, { model: 'acme/painter-9', modelKey: 'painter', licence: 'apache-2.0' });
    });
    writeOverride(sprites, 'syn/wrong-key', (_r, s) => {
      madeBy(s, 'qwenvl');
      s.model = models.qwenedit.id;
    });
    writeOverride(sprites, 'syn/null-licence', (_r, s) => {
      madeBy(s, 'qwenvl');
      s.licence = null;
    });
    // A held licence on a model the table lacks: unknown model (2), and still held by its licence.
    writeOverride(sprites, 'syn/unlisted-held', (_r, s) => {
      Object.assign(s, {
        model: 'acme/ltx-finetune',
        modelKey: null,
        licence: 'ltxv-open-weights-0.x',
      });
    });
    writeOverride(sprites, 'syn/candidate-path', (_r, s) => {
      madeBy(s, 'qwenvl');
      s.path = 'art-prompts/v2/candidates/a/syn.png';
    });
    writeOverride(sprites, 'syn/reference-light', (r, s) => {
      madeBy(s, 'qwenvl');
      Object.assign(r, { use: 'reference', cleanup: 'light' });
    });
    writeOverride(sprites, 'syn/reference-heavy', (r, s) => {
      madeBy(s, 'qwenvl');
      Object.assign(r, { use: 'reference', cleanup: 'heavy' });
    });
    writeOverride(sprites, 'syn/unreviewed', (r, s) => {
      madeBy(s, 'sd35');
      r.reviewed = null;
    });
    writeOverride(sprites, 'syn/bare', () => null);
    writeOverride(sprites, 'licensed/syn-licensed', () => null);
    writeFileSync(
      join(sprites, 'licensed', 'LICENSES.md'),
      '# Licences\n\n- `licensed/syn-licensed` — drawn by the owner, CC0 1.0\n',
    );
    writeOverride(sprites, 'syn/broken', () => null);
    writeFileSync(join(sprites, 'syn', 'broken.art.json'), '{ "schema": ');
    report = buildOriginReport({ sourceDir: source, stagingDir: null });
  });

  it('applies rules 1–6 and nothing else', () => {
    expect(verdicts(report)).toEqual(
      [
        'shipped syn/bare rule 1 failure', // no record, no LICENSES.md entry
        'shipped syn/broken rule 1 failure', // invalid JSON
        'shipped syn/candidate-path rule 6 failure',
        'shipped syn/edit-of-held rule 3 failure',
        'shipped syn/licence-mismatch rule 2 failure',
        'shipped syn/null-licence rule 2 failure',
        'shipped syn/reference-light rule 5 failure',
        'shipped syn/unknown-key rule 2 failure',
        'shipped syn/unknown-model rule 2 failure',
        'shipped syn/unlisted-held rule 2 failure',
        'shipped syn/unlisted-held rule 3 failure',
        'shipped syn/unreviewed rule 4 failure',
        'shipped syn/wrong-key rule 2 failure',
      ].sort(),
    );
    for (const name of ['syn/clean-edit', 'syn/reference-heavy', 'licensed/syn-licensed']) {
      expect(row(report.sprites, name).status, name).toBe('ok');
    }
  });

  it('names the held image by its path in the record, two edits deep', () => {
    const hold = report.findings.find((f) => f.sprite === 'syn/edit-of-held');
    expect(hold?.message).toContain('sources[0].reference[0].reference[0] Lightricks/LTX-Video');
    expect(hold?.message).toContain('an edit reference');
    expect(row(report.sprites, 'syn/edit-of-held').models).toEqual([
      'Lightricks/LTX-Video',
      'Qwen/Qwen-Image-Edit-2511',
    ]);
    expect(report.findings.find((f) => f.sprite === 'syn/candidate-path')?.message).toContain(
      'sources[0].path "art-prompts/v2/candidates/a/syn.png"',
    );
  });

  it('classifies untraced, licensed and broken overrides', () => {
    expect(row(report.sprites, 'syn/bare')).toMatchObject({ origin: 'unknown', kind: 'untraced' });
    expect(row(report.sprites, 'licensed/syn-licensed')).toMatchObject({
      origin: 'hand',
      kind: 'licensed',
      record: null,
    });
    expect(row(report.sprites, 'syn/broken')).toMatchObject({
      origin: 'unknown',
      kind: 'record',
      status: 'failure',
    });
    expect(report.counts.shipped.byModel['acme/painter-9']).toEqual({
      sprites: 2,
      licence: null,
      pixels: null,
      reference: null,
    });
  });

  it("reads the verdict for the record's own use", () => {
    const dir = join(tmp, 'use-tree');
    const table = JSON.parse(
      readFileSync(join(repo, 'art-prompts', 'ingest', 'models.json'), 'utf8'),
    ) as {
      models: Record<string, { verdict: Record<string, string> }>;
    };
    table.models.sd35.verdict = { pixels: 'ship', reference: 'hold' };
    const modelsFile = join(tmp, 'models-reference-hold.json');
    writeFileSync(modelsFile, JSON.stringify(table));
    for (const use of ['pixels', 'reference']) {
      writeOverride(join(dir, 'sprites'), `use/${use}`, (r, s) => {
        madeBy(s, 'sd35');
        Object.assign(r, { use, cleanup: 'redrawn' });
      });
    }
    const custom = buildOriginReport({ sourceDir: dir, stagingDir: null, modelsFile });
    expect(verdicts(custom)).toEqual(['shipped use/reference rule 3 failure']);
    expect(buildOriginReport({ sourceDir: dir, stagingDir: null }).findings).toEqual([]);
  });

  it('refuses a missing source folder and a broken model table', () => {
    expect(() => buildOriginReport({ sourceDir: join(tmp, 'nope') })).toThrow(/no such folder/);
    const broken = join(tmp, 'models-broken.json');
    writeFileSync(broken, '{"schema":"shmup-ingest-models@1","models":{"x":{}}}');
    expect(() => buildOriginReport({ sourceDir: source, modelsFile: broken })).toThrow(/model "x"/);
  });
});

describe('R3-03.V5 — a recoloured palette variant traces to its overridden base', () => {
  const source = join(tmp, 'palette-base');
  writeOverride(join(source, 'sprites'), 'bullets/round-red');
  const report = buildOriginReport({ sourceDir: source, stagingDir: null });

  it('classes the variants as kind palette and inherits the base class', () => {
    const base = row(report.sprites, 'bullets/round-red');
    expect([base.origin, base.kind, base.base, base.status]).toEqual([
      'ai-assisted',
      'record',
      null,
      'ok',
    ]);
    for (const palette of ['deuteranopia', 'protanopia', 'tritanopia']) {
      const r = row(report.sprites, `bullets/round-red@${palette}`);
      expect([r.kind, r.origin, r.base, r.status]).toEqual([
        'palette',
        'ai-assisted',
        'bullets/round-red',
        'ok',
      ]);
      expect([r.models, r.record]).toEqual([base.models, base.record]);
    }
    // A bullet without an override keeps its procedural generator for every variant.
    expect(row(report.sprites, 'bullets/oval-red@deuteranopia')).toMatchObject({
      origin: 'procedural',
      kind: 'generator',
      base: null,
    });
  });
});

describe('R3-05 — the staging folder warns on rules 3–5 and fails on 1, 2 and 6', () => {
  const empty = join(tmp, 'empty-source');
  mkdirSync(join(empty, 'sprites'), { recursive: true });

  it("only warns for the fixtures' missing reviews and light references", () => {
    const staging = join(tmp, 'staging-fixtures');
    cpSync(FIXTURES, staging, { recursive: true });
    const report = buildOriginReport({ sourceDir: empty, stagingDir: staging });
    expect(report.stagingPresent).toBe(true);
    expect(report.failures).toBe(0);
    expect(verdicts(report)).toEqual(
      [
        'staged backdrops/fixture-far rule 4 warning',
        'staged enemies/gyre rule 4 warning',
        'staged enemies/gyre rule 5 warning',
        'staged fx/fixture-glow rule 4 warning',
      ].sort(),
    );
    expect(report.staged.map((r) => [r.name, r.tree, r.status])).toEqual([
      ['backdrops/fixture-far', 'staged', 'warning'],
      ['bosses/fringe-hull', 'staged', 'ok'],
      ['enemies/drone', 'staged', 'ok'],
      ['enemies/gyre', 'staged', 'warning'],
      ['fx/fixture-glow', 'staged', 'warning'],
      ['ships/fixture-ship', 'staged', 'ok'],
    ]);
    // Staged art is not shipped: the shipped tree has no override, so no shipped sprite names a model.
    expect(report.counts.shipped.byModel).toEqual({});
    expect(report.counts.staged.byOriginKind).toEqual({
      hand: { record: 1 },
      'ai-assisted': { record: 5 },
    });
    const text = formatOriginReport(report, { list: true });
    expect(text).toContain('Staged sprites by origin and kind:');
    expect(text).toContain(
      `WARN [staged, rule 4] fx/fixture-glow: ${report.stagingDir}/fx/fixture-glow.art.json: `,
    );
    expect(text.endsWith('0 failures, 4 warnings\n')).toBe(true);
  });

  it('fails a staged PNG without provenance, an unknown model and a candidates path', () => {
    const staging = join(tmp, 'staging-broken');
    writeOverride(staging, 'enemies/bare', () => null);
    writeOverride(staging, 'enemies/unknown', (_r, s) => {
      Object.assign(s, { model: 'acme/painter-9', modelKey: null, licence: 'apache-2.0' });
    });
    writeOverride(staging, 'enemies/candidate', (r, s) => {
      madeBy(s, 'flux2');
      r.reviewed = null;
      s.path = 'art-prompts/v2/candidates/a/enemy.png';
    });
    // A held model's staged art still only warns (rule 3; LTX-Video since the FLUX flip).
    writeOverride(staging, 'enemies/held', (_r, s) => {
      madeBy(s, 'ltxvideo');
    });
    const report = buildOriginReport({ sourceDir: empty, stagingDir: staging });
    expect(verdicts(report)).toEqual(
      [
        'staged enemies/bare rule 1 failure',
        'staged enemies/candidate rule 4 warning',
        'staged enemies/candidate rule 6 failure',
        'staged enemies/held rule 3 warning',
        'staged enemies/unknown rule 2 failure',
      ].sort(),
    );
    expect([report.failures, report.warnings]).toEqual([3, 2]);
  });

  it('skips a staging folder that does not exist, or when turned off', () => {
    const absent = buildOriginReport({ sourceDir: empty, stagingDir: join(tmp, 'no-staging') });
    expect([absent.stagingPresent, absent.staged, absent.findings]).toEqual([false, [], []]);
    expect(formatOriginReport(absent)).toContain(': absent\n');
    const off = buildOriginReport({ sourceDir: empty, stagingDir: null });
    expect([off.stagingDir, off.stagingPresent]).toEqual([null, false]);
    expect(formatOriginReport(off)).toContain('Staging folder: not checked\n');
  });
});

describe('R3-05 — the licence table of art-provenance.md §2 is filled', () => {
  const doc = readFileSync(join(repo, 'docs', 'dev', 'art-provenance.md'), 'utf8');
  const section = doc.slice(doc.indexOf('\n## 2. '), doc.indexOf('\n## 3. '));
  const rows = section
    .split('\n')
    .filter((line) => line.startsWith('| ') && !line.startsWith('| Model'))
    .map((line) =>
      line
        .slice(1, -1)
        .split('|')
        .map((cell) => cell.trim()),
    );
  /**
   * The verdict a cell states.
   *
   * @param cell - A table cell.
   * @returns `ship`, `hold`, or `undefined`.
   */
  const verdictOf = (cell: string) => /\*\*(ship|hold)\*\*/.exec(cell)?.[1];

  it('names every licence id', () => {
    expect(section.length).toBeGreaterThan(0);
    for (const id of LICENCE_IDS) expect(section, id).toContain(`\`${id}\``);
  });

  it('has a row for every model of models.json, with its licence id and its verdicts', () => {
    for (const [key, entry] of Object.entries(models)) {
      const r = rows.find((cells) => cells[0].includes(`\`${entry.id}\``));
      expect(r, `${key}: no §2 row names ${entry.id}`).toBeDefined();
      const cells = r as string[];
      expect(cells[1], key).toContain(`\`${entry.licence}\``);
      expect([verdictOf(cells[2]), verdictOf(cells[3])], key).toEqual([
        entry.verdict.pixels,
        entry.verdict.reference,
      ]);
    }
  });

  it('documents the rules the report applies', () => {
    const part2 = doc.slice(doc.indexOf('\n## 9. '));
    for (const n of Object.keys(RULES)) expect(part2).toMatch(new RegExp(`\\n${n}\\. \\*\\*`));
  });
});

describe('R3-05 — the command line', () => {
  it('exits 0 on the shipped tree with --check, and prints the report', () => {
    const run = cli('--check');
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('Shipped sprites by origin and kind:');
    expect(run.stdout).toMatch(PASSING_SUMMARY);
  });

  it('--json prints the whole report, --list one row per sprite', () => {
    const json = cli('--json');
    expect(json.status).toBe(0);
    const report = JSON.parse(json.stdout) as OriginReport;
    expect(report.failures).toBe(0);
    expect(report.sprites.length).toBe(Object.keys(buildAtlas().manifest.sprites).length);
    const list = cli('--list');
    expect(list.status).toBe(0);
    for (const name of [report.sprites[0].name, report.sprites[report.sprites.length - 1].name]) {
      expect(list.stdout).toContain(`\n  ${name} `);
    }
  });

  it('exits 1 with --check when anything fails, 0 without it', () => {
    const tree = fixtureTree();
    const check = cli('--check', '--source', tree);
    expect(check.status).toBe(1);
    expect(check.stdout).toContain('FAIL [shipped, rule 4]');
    expect(check.stderr).toContain('4 failures');
    expect(cli(`--source=${tree}`).status).toBe(0);
  });

  it('warnings never fail --check', () => {
    const staging = join(tmp, 'staging-cli');
    cpSync(FIXTURES, staging, { recursive: true });
    const run = cli('--check', '--staging', staging, '--json');
    expect(run.status).toBe(0);
    expect((JSON.parse(run.stdout) as OriginReport).warnings).toBe(4);
  });

  it('exits 1 when no report can be built', () => {
    expect(cli('--source', join(tmp, 'missing')).status).toBe(1);
    const broken = join(tmp, 'models-cli-broken.json');
    writeFileSync(broken, '[]');
    const run = cli('--models', broken);
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('not a shmup-ingest-models@1 table');
  });

  it('exits 2 on bad usage and prints the usage', () => {
    for (const args of [
      ['--bogus'],
      ['--source'],
      ['--source', '--check'],
      ['--check', '--check'],
      ['--models='],
      ['--check=yes'],
      ['assets/source'],
      ['--source', 'a', '--source', 'b'],
    ]) {
      const run = cli(...args);
      expect(run.status, args.join(' ')).toBe(2);
      expect(run.stderr).toContain('usage: node scripts/art-origins.mjs');
    }
    expect(cli('--help').status).toBe(0);
  });

  it('parses both option forms', () => {
    expect(parseArgs(['--list', '--source=a', '--staging', 'b', '--models', 'c'])).toEqual({
      check: false,
      list: true,
      json: false,
      help: false,
      sourceDir: 'a',
      stagingDir: 'b',
      modelsFile: 'c',
    });
    expect(parseArgs([])).toEqual({ check: false, list: false, json: false, help: false });
  });
});
