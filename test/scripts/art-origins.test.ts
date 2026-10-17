/**
 * R3-05 part 2 — the origin report, `scripts/art-origins.mjs` (`docs/dev/art-provenance.md` §9).
 *
 * The plan's acceptance: "the origin report runs in CI and lists no sprite without provenance;
 * the licence table is filled for every model that produced shipped art". So this file
 *
 * - runs the report over the **shipped tree** (`assets/source/`): no finding, and every sprite the
 *   atlas packs is classified exactly once, consistently with the pipeline's own origins;
 * - adds the ingest tool's **five fixture outputs** to a temporary copy of `assets/source/` as
 *   override PNGs: the FLUX ones are on hold (rule 3), the unreviewed AI records fail (rule 4),
 *   `gyre` — `use: "reference"` with `cleanup: "none"` — fails rule 5, the hand-made `fringe-hull`
 *   passes;
 * - checks every rule on **synthetic records**: a Qwen edit of an edit of a FLUX image holds, a
 *   licence that is not the table's, an unknown model or key, a `null` licence, a FLUX licence on a
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

describe('R3-05 — the origin report on the shipped tree', () => {
  const report = buildOriginReport();

  it('lists no sprite without provenance: no failure and no warning', () => {
    expect(report.findings).toEqual([]);
    expect([report.failures, report.warnings]).toEqual([0, 0]);
    expect(report.sourceDir).toBe('assets/source');
    expect(report.stagingDir).toBe('art-prompts/v2/ingested');
    expect(report.modelsFile).toBe('art-prompts/ingest/models.json');
    expect(DEFAULT_STAGING_DIR).toBe(join(repo, 'art-prompts', 'v2', 'ingested'));
    expect(report.sprites.every((r) => r.status === 'ok' && r.origin !== 'unknown')).toBe(true);
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
      } else if (o.startsWith('flash:') || o.startsWith('p2:')) {
        const base = rows.get(o.slice(o.indexOf(':') + 1)) as SpriteOrigin;
        expect(r.kind).toBe(o.startsWith('flash:') ? 'flash' : 'p2');
        expect([r.base, r.origin, r.models]).toEqual([base.name, base.origin, base.models]);
      } else if (o.endsWith('.sprite.json'))
        expect([r.origin, r.kind]).toEqual(['procedural', 'pixel-map']);
      else
        expect([o.endsWith('.font.json'), r.origin, r.kind]).toEqual([true, 'procedural', 'font']);
    }
    const kinds = report.counts.shipped.byOriginKind.procedural;
    expect(kinds.font).toBe(Object.keys(fonts).length);
    expect(kinds.flash).toBe(sprites.filter((s) => s.name.endsWith('@flash')).length);
    expect(kinds.p2).toBe(sprites.filter((s) => s.name.endsWith('@p2')).length);
  });

  it('every model that made shipped art is in the model table (none today)', () => {
    for (const model of Object.keys(report.counts.shipped.byModel)) {
      expect(Object.values(models).map((m) => m.id)).toContain(model);
    }
  });

  it('prints the tallies by origin × kind and by served model, and one row per sprite', () => {
    const text = formatOriginReport(report);
    expect(text).toContain('Shipped sprites by origin and kind:');
    expect(text).toMatch(/\n {2}origin +generator +pixel-map +font +flash +p2 +total\n/);
    expect(text).toContain('Shipped sprites by served model (as a source or an edit reference):');
    expect(text.endsWith('0 failures, 0 warnings\n')).toBe(true);
    const listed = formatOriginReport(report, { list: true }).split('\n');
    for (const r of report.sprites) {
      expect(listed.some((line) => line.startsWith(`  ${r.name} `))).toBe(true);
    }
  });
});

describe("R3-05 — the ingest tool's fixtures as shipped overrides", () => {
  const report = buildOriginReport({ sourceDir: fixtureTree(), stagingDir: null });

  it('FLUX holds, unreviewed AI art fails, a reference without real cleanup fails, hand art passes', () => {
    expect(verdicts(report)).toEqual(
      [
        'shipped backdrops/fixture-far rule 3 failure', // FLUX.1-dev
        'shipped backdrops/fixture-far rule 4 failure', // not reviewed
        'shipped enemies/drone rule 3 failure', // FLUX.2-dev (reviewed)
        'shipped enemies/gyre rule 4 failure', // not reviewed
        'shipped enemies/gyre rule 5 failure', // use "reference", cleanup "none" (W3-10)
        'shipped fx/fixture-glow rule 3 failure', // FLUX.2-dev
        'shipped fx/fixture-glow rule 4 failure', // not reviewed
      ].sort(),
    );
    expect(report.failures).toBe(7);
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
      status: 'failure',
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
    expect(report.counts.shipped.byOriginKind['ai-assisted'].record).toBe(4);
  });

  it('tallies the served models with their licence and verdicts', () => {
    const byModel = report.counts.shipped.byModel;
    expect(byModel['black-forest-labs/FLUX.1-dev']).toEqual({
      sprites: 1,
      licence: 'flux1-dev-nc-1.1.1',
      pixels: 'hold',
      reference: 'hold',
    });
    expect(byModel['black-forest-labs/FLUX.2-dev']).toMatchObject({
      sprites: 2,
      licence: 'flux-nc-2.1',
      pixels: 'hold',
    });
    expect(byModel['Qwen/Qwen-Image-Edit-2511']).toMatchObject({
      licence: 'apache-2.0',
      pixels: 'ship',
      reference: 'ship',
    });
    const text = formatOriginReport(report);
    expect(text).toContain('FAIL [shipped, rule 3] enemies/drone: ');
    expect(text.endsWith('7 failures, 0 warnings\n')).toBe(true);
  });
});

describe('R3-05 — every rule, on synthetic records', () => {
  const source = join(tmp, 'synthetic');
  const sprites = join(source, 'sprites');
  let report: OriginReport;

  beforeAll(() => {
    mkdirSync(sprites, { recursive: true });
    // A Qwen edit of a Qwen edit of a FLUX.2 image: the hold is two edits deep (rule 3). The
    // edit inputs' `from` names a candidate, which is allowed (rule 6 reads committed paths only).
    writeOverride(sprites, 'syn/edit-of-flux', (_r, s) => {
      madeBy(s, 'qwenedit');
      s.reference = [reference('qwenedit', [reference('flux2')])];
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
    // A FLUX licence on a model the table lacks: unknown model (2), and still held by its licence.
    writeOverride(sprites, 'syn/unlisted-flux', (_r, s) => {
      Object.assign(s, { model: 'acme/flux-finetune', modelKey: null, licence: 'flux-nc-2.1' });
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
        'shipped syn/edit-of-flux rule 3 failure',
        'shipped syn/licence-mismatch rule 2 failure',
        'shipped syn/null-licence rule 2 failure',
        'shipped syn/reference-light rule 5 failure',
        'shipped syn/unknown-key rule 2 failure',
        'shipped syn/unknown-model rule 2 failure',
        'shipped syn/unlisted-flux rule 2 failure',
        'shipped syn/unlisted-flux rule 3 failure',
        'shipped syn/unreviewed rule 4 failure',
        'shipped syn/wrong-key rule 2 failure',
      ].sort(),
    );
    for (const name of ['syn/clean-edit', 'syn/reference-heavy', 'licensed/syn-licensed']) {
      expect(row(report.sprites, name).status, name).toBe('ok');
    }
  });

  it('names the held image by its path in the record, two edits deep', () => {
    const hold = report.findings.find((f) => f.sprite === 'syn/edit-of-flux');
    expect(hold?.message).toContain(
      'sources[0].reference[0].reference[0] black-forest-labs/FLUX.2-dev',
    );
    expect(hold?.message).toContain('an edit reference');
    expect(row(report.sprites, 'syn/edit-of-flux').models).toEqual([
      'Qwen/Qwen-Image-Edit-2511',
      'black-forest-labs/FLUX.2-dev',
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

describe('R3-05 — the staging folder warns on rules 3–5 and fails on 1, 2 and 6', () => {
  const empty = join(tmp, 'empty-source');
  mkdirSync(join(empty, 'sprites'), { recursive: true });

  it("only warns for the fixtures' holds, missing reviews and light references", () => {
    const staging = join(tmp, 'staging-fixtures');
    cpSync(FIXTURES, staging, { recursive: true });
    const report = buildOriginReport({ sourceDir: empty, stagingDir: staging });
    expect(report.stagingPresent).toBe(true);
    expect(report.failures).toBe(0);
    expect(verdicts(report)).toEqual(
      [
        'staged backdrops/fixture-far rule 3 warning',
        'staged backdrops/fixture-far rule 4 warning',
        'staged enemies/drone rule 3 warning',
        'staged enemies/gyre rule 4 warning',
        'staged enemies/gyre rule 5 warning',
        'staged fx/fixture-glow rule 3 warning',
        'staged fx/fixture-glow rule 4 warning',
      ].sort(),
    );
    expect(report.staged.map((r) => [r.name, r.tree, r.status])).toEqual([
      ['backdrops/fixture-far', 'staged', 'warning'],
      ['bosses/fringe-hull', 'staged', 'ok'],
      ['enemies/drone', 'staged', 'warning'],
      ['enemies/gyre', 'staged', 'warning'],
      ['fx/fixture-glow', 'staged', 'warning'],
    ]);
    // Staged art is not shipped: the shipped tree has no override, so no shipped sprite names a model.
    expect(report.counts.shipped.byModel).toEqual({});
    expect(report.counts.staged.byOriginKind).toEqual({
      hand: { record: 1 },
      'ai-assisted': { record: 4 },
    });
    const text = formatOriginReport(report, { list: true });
    expect(text).toContain('Staged sprites by origin and kind:');
    expect(text).toContain(
      `WARN [staged, rule 3] enemies/drone: ${report.stagingDir}/enemies/drone.art.json: `,
    );
    expect(text.endsWith('0 failures, 7 warnings\n')).toBe(true);
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
    const report = buildOriginReport({ sourceDir: empty, stagingDir: staging });
    expect(verdicts(report)).toEqual(
      [
        'staged enemies/bare rule 1 failure',
        'staged enemies/candidate rule 3 warning',
        'staged enemies/candidate rule 4 warning',
        'staged enemies/candidate rule 6 failure',
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
    expect(run.stdout.endsWith('0 failures, 0 warnings\n')).toBe(true);
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
    expect(check.stdout).toContain('FAIL [shipped, rule 3]');
    expect(check.stderr).toContain('7 failures');
    expect(cli(`--source=${tree}`).status).toBe(0);
  });

  it('warnings never fail --check', () => {
    const staging = join(tmp, 'staging-cli');
    cpSync(FIXTURES, staging, { recursive: true });
    const run = cli('--check', '--staging', staging, '--json');
    expect(run.status).toBe(0);
    expect((JSON.parse(run.stdout) as OriginReport).warnings).toBe(7);
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
