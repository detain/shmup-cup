/**
 * R3-04.M2a — the stand-in atlas against the TV memory budget, in bytes.
 *
 * **What is measured.** `standinAtlas()` (decision W5-14, `scripts/assets/standin.mjs`, built
 * by R3-04.M1a/M1b) packs the nine stand-in zones through the real pipeline **in memory** —
 * `assets/generated/` is never read, CI's test job does not run `pnpm assets`. For `common`
 * and every `standin-zone-<x>` group the test sums the GPU bytes and the PNG bytes of the
 * pages that would be resident on the TV, and runs the shell's `estimateStageMemory` over
 * them. The stand-in's art quality is the bible round's business (M1aRV1's brightness note
 * rides to wave 5's docs); this file is bytes against budgets, nothing else.
 *
 * **The hand-built model.** `needs` is built here, not derived:
 *
 * - every `common` page is global (the residency keeps it in every stage — the R1-05 rule);
 * - every `standin-zone-<x>` page belongs to **zone x's campaign stage only**;
 * - today's shipped `zone-<x>` pages are needed by **none** — on the stand-in atlas each
 *   zone draws the stand-in art instead of its shipped page, and a page no stage names
 *   stays off the GPU and off the charge;
 * - `campaign` is `true` for the nine zone stages plus the dev range `test-range`, which
 *   stands in as the `common` row's stage: it owns no page in the table, so its row is the
 *   global floor alone (`false` would charge it **every** page — the shipped residency
 *   really does that for dev ranges; this model deliberately does not).
 *
 * **The gate** (per `common` and per stand-in zone), under the policy the lazy residency of
 * R3-04.M3b measured at W5-15 runs with — `imagePolicy: 'none'`, the decoded images dropped:
 * `textures + images ≤ TEXTURE_BUDGET_BYTES` (23 MiB at the 640×360 frame) **and**
 * `withinBudget` — total ≤ `MEMORY_BUDGET_BYTES` (100 MiB). The `estimateStageMemory`'s
 * `withinBudget` also carries the audio-share and atlas-share checks the shell derives, so
 * the row passes only inside all three. The `'resident'` figure (images kept for the
 * attached pages — the policy between stage changes) is printed beside it, **not gated**.
 * PNG bytes are reported for the R3-04.M2b download/decode measurement, not gated either.
 *
 * **Print.** `SHMUP_STANDIN_PRINT=1 pnpm exec vitest run --project integration
 * test/integration/standin-budget.test.ts` prints the budget lines and the table; the table
 * belongs in the commit body (the acceptance of the work order). The R3-04.M1b RR-7 test
 * (`test/scripts/assets/standin.test.ts`) is the gate on the pages' PNG density; if the
 * entropy knobs move, both files must stay green.
 */
import { loadMusicContent, loadSfxContent } from '@shmup/audio-web';
import { FRAME_H, FRAME_W } from '@shmup/core';
import type { AtlasManifest } from '@shmup/render-pixi';
import { describe, expect, it } from 'vitest';
import {
  AUDIO_BUDGET_BYTES,
  MEMORY_BUDGET_BYTES,
  MIB,
  TEXTURE_BUDGET_BYTES,
  estimateStageMemory,
  pageBytes,
  stagePages,
  type AtlasPageNeeds,
  type MemoryEstimate,
} from '../../packages/shell/src/memory/index.js';
import { loadGameContent } from '../../packages/shell/src/loader/index.js';
import { ZONE_IDS, standinAtlas, standinGroupName } from '../../scripts/assets/standin.mjs';
import { COMMON_GROUP } from '../../scripts/assets/pipeline.mjs';
import { readContentFiles } from '../../vite.shared.js';

const { db, foreign } = loadGameContent(readContentFiles());

/**
 * The foreign content files of one kind, as `estimateStageMemory` takes them.
 *
 * @param kind - `sfx` or `music`.
 * @returns The files of that kind.
 */
function filesOfKind(kind: string): typeof foreign {
  return foreign.filter((file) => (file.data as { kind?: unknown }).kind === kind);
}

const sfx = loadSfxContent(filesOfKind('sfx')).content;
const music = loadMusicContent(filesOfKind('music')).content;

/** The full nine-zone stand-in atlas, packed once for the whole file (in memory). */
const atlas = standinAtlas();

/** The packed manifest, typed as the shell's. */
const manifest = atlas.manifest as unknown as AtlasManifest;

/** The campaign zones: letter → its stage (`content.stages` index). */
const zoneStages = new Map<string, number>(
  (db.campaign?.zones ?? []).map((zone) => [zone.id, zone.stageId]),
);

/** The dev range that stands in for the `common` row's stage (it owns no page). */
const FLOOR_STAGE_ID = 'test-range';
const floorStage = db.stages.findIndex((stage) => stage.id === FLOOR_STAGE_ID);

/** The prefix `standinGroupName` puts on every stand-in atlas group. */
const STANDIN_PREFIX = 'standin-zone-';

/**
 * The zone letter one atlas group belongs to, or `null`.
 *
 * @param group - The page's group.
 * @returns The letter of a `standin-zone-<x>` group, else `null`.
 */
function standinZoneOf(group: string | undefined): string | null {
  return group !== undefined && group.startsWith(STANDIN_PREFIX)
    ? group.slice(STANDIN_PREFIX.length)
    : null;
}

/** The stage indices the campaign names. */
const CAMPAIGN_STAGE_INDICES = new Set<number>(zoneStages.values());

/**
 * The page indices of one atlas group, ascending.
 *
 * @param group - The group name.
 * @returns The page indices.
 */
function groupPages(group: string): number[] {
  const pages: number[] = [];
  manifest.pages.forEach((page, p) => {
    if (page.group === group) pages.push(p);
  });
  return pages;
}

/** The hand-built needs the measurement reads (see the file header). */
const needs: AtlasPageNeeds = {
  global: manifest.pages.map((page) => page.group === COMMON_GROUP),
  stages: manifest.pages.map((page) => {
    const stageIndex = zoneStages.get(standinZoneOf(page.group) ?? '');
    return stageIndex === undefined ? new Set<number>() : new Set([stageIndex]);
  }),
  campaign: db.stages.map(
    (_stage, index) => CAMPAIGN_STAGE_INDICES.has(index) || index === floorStage,
  ),
};

/** One measured row: `common` or a `standin-zone-<x>` group. */
interface BudgetRow {
  /** The group the row measures. */
  readonly label: string;
  /** The stage the estimate runs for. */
  readonly stageIndex: number;
  /** Its resident pages on the stand-in atlas. */
  readonly pages: readonly number[];
  /** The pages' GPU bytes. */
  readonly textures: number;
  /** The pages' PNG bytes. */
  readonly png: number;
  /** The estimate under the gated policy (`none` — decoded images dropped, W5-15). */
  readonly none: MemoryEstimate;
  /** The estimate under `resident` — printed beside the gate, not gated. */
  readonly resident: MemoryEstimate;
}

/**
 * Measures one row.
 *
 * @param label - The group the row measures.
 * @param stageIndex - The stage the estimate runs for.
 * @returns The row.
 */
function runRow(label: string, stageIndex: number): BudgetRow {
  const pages = stagePages(needs, stageIndex);
  const base = { content: db, manifest, sfx, music, stageIndex, needs };
  return {
    label,
    stageIndex,
    pages,
    textures: pages.reduce((n, p) => n + pageBytes(manifest.pages[p]), 0),
    png: pages.reduce((n, p) => n + atlas.pages[p].png.length, 0),
    none: estimateStageMemory({ ...base, imagePolicy: 'none' }),
    resident: estimateStageMemory({ ...base, imagePolicy: 'resident' }),
  };
}

/** The measured rows: the `common` floor, then the nine stand-in zones. */
const rows: BudgetRow[] = [
  runRow(COMMON_GROUP, floorStage),
  ...ZONE_IDS.map((zoneId) => runRow(standinGroupName(zoneId), zoneStages.get(zoneId) ?? -1)),
];

/**
 * Bytes rendered for the table: the whole number and its MiB reading.
 *
 * @param n - Bytes.
 * @returns `n (x.xx MiB)`.
 */
function fmt(n: number): string {
  return `${n} (${(n / MIB).toFixed(2)} MiB)`;
}

/**
 * A page rendered for the table: `main-1.png 2048x1024`.
 *
 * @param p - Page index.
 * @returns The label.
 */
function pageLabel(p: number): string {
  const page = manifest.pages[p];
  return `${page.file} ${page.w}x${page.h}`;
}

/**
 * The budget lines and one table line per row.
 *
 * @returns The lines, header first.
 */
function budgetTable(): string[] {
  const header = [
    `R3-04.M2a — stand-in atlas vs the TV memory budget (frame ${FRAME_W}x${FRAME_H}, ` +
      'gate: imagePolicy none, printed: resident)',
    `budgets: textures ${fmt(TEXTURE_BUDGET_BYTES)} | total ${fmt(MEMORY_BUDGET_BYTES)} | ` +
      `audio ${fmt(AUDIO_BUDGET_BYTES)}`,
  ];
  const columns = [
    'row',
    'pages',
    'png bytes',
    "tex+img bytes ('none')",
    "total bytes ('none')",
    "tex+img bytes ('resident')",
    "total bytes ('resident')",
  ];
  const lines = rows.map((row) =>
    [
      row.label,
      row.pages.map(pageLabel).join(' + '),
      String(row.png),
      String(row.none.textures + row.none.images),
      String(row.none.total),
      String(row.resident.textures + row.resident.images),
      String(row.resident.total),
    ].join('\t'),
  );
  const widths = columns.map((_c, i) =>
    Math.max(columns[i].length, ...lines.map((line) => line.split('\t')[i].length)),
  );
  const pad = (cells: readonly string[]): string =>
    cells
      .map((cell, i) => cell.padEnd(widths[i]))
      .join('  ')
      .trimEnd();
  return [...header, pad(columns), ...lines.map((line) => pad(line.split('\t')))];
}

/** Set to `1` to print the budget table. */
const PRINT_ENV = 'SHMUP_STANDIN_PRINT';

describe('stand-in budget model (R3-04.M2a)', () => {
  it('the campaign names a stage for every stand-in zone, and a floor stage exists', () => {
    expect(zoneStages.size).toBe(ZONE_IDS.length);
    for (const zoneId of ZONE_IDS) expect(zoneStages.has(zoneId), zoneId).toBe(true);
    expect(floorStage).toBeGreaterThanOrEqual(0);
  });

  it('needs are hand-built: common global, each stand-in page its zone only, shipped pages none', () => {
    manifest.pages.forEach((page, p) => {
      const zoneId = standinZoneOf(page.group);
      expect(needs.global[p], page.group ?? String(p)).toBe(page.group === COMMON_GROUP);
      if (zoneId === null) {
        expect([...needs.stages[p]], page.group ?? String(p)).toEqual([]);
      } else {
        expect([...needs.stages[p]], page.group).toEqual([zoneStages.get(zoneId)]);
      }
    });
    // The shipped zone groups are packed and named, yet needed by no stage of the model.
    for (const zoneId of ZONE_IDS) {
      const shipped = groupPages(`zone-${zoneId}`);
      expect(shipped.length, zoneId).toBeGreaterThan(0);
      for (const p of shipped) expect(needs.stages[p].size, zoneId).toBe(0);
    }
    // The model's campaign flag covers the nine zones and the floor stage, nothing else.
    expect(needs.campaign.filter((c) => c).length).toBe(ZONE_IDS.length + 1);
  });

  it('each row is resident of exactly its modelled pages', () => {
    const common = groupPages(COMMON_GROUP);
    expect(common.length).toBeGreaterThan(0);
    expect(rows[0].pages).toEqual(common);
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      expect(
        [...row.pages].sort((a, b) => a - b),
        row.label,
      ).toEqual([...common, ...groupPages(row.label)].sort((a, b) => a - b));
      expect(row.pages.length, row.label).toBeGreaterThan(1);
      for (const p of row.pages) {
        expect([COMMON_GROUP, row.label], `${row.label} ${pageLabel(p)}`).toContain(
          manifest.pages[p].group as string,
        );
      }
    }
  });
});

describe('stand-in budget gate (R3-04.M2a)', () => {
  it(
    'every stand-in zone and common holds textures + images inside the texture budget ' +
      "and stays withinBudget under imagePolicy 'none'",
    () => {
      for (const row of rows) {
        // The measurement reads what the model charges, with the images dropped.
        expect(row.none.images, row.label).toBe(0);
        expect(row.none.textures, row.label).toBe(row.textures);
        // The gate, in bytes.
        expect(row.none.textures + row.none.images, row.label).toBeLessThanOrEqual(
          TEXTURE_BUDGET_BYTES,
        );
        expect(row.none.budget, row.label).toBe(MEMORY_BUDGET_BYTES);
        expect(row.none.total, row.label).toBeLessThanOrEqual(MEMORY_BUDGET_BYTES);
        expect(row.none.sfx + row.none.music, row.label).toBeLessThanOrEqual(AUDIO_BUDGET_BYTES);
        expect(row.none.withinBudget, row.label).toBe(true);
        // The printed figure is charged as the policy says (not gated against any budget).
        expect(row.resident.images, row.label).toBe(row.textures);
      }
    },
  );

  it('reports the PNG bytes of every measured page', () => {
    for (const row of rows) {
      expect(row.png, row.label).toBeGreaterThan(0);
      const hand = row.pages.reduce((n, p) => n + atlas.pages[p].png.length, 0);
      expect(row.png, row.label).toBe(hand);
    }
  });

  it('prints the budget table with SHMUP_STANDIN_PRINT=1', () => {
    const lines = budgetTable();
    expect(lines.length).toBe(rows.length + 3);
    if (process.env[PRINT_ENV] === '1') console.log(lines.join('\n'));
  });
});
