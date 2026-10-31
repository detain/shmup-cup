/**
 * The layout-inquiry law (tizen_optimize.md §8.5 — plan v20x P1-7).
 *
 * Reading an element's box or a computed style forces a synchronous style / layout flush on the
 * frame thread — the `getBoundingClientRect` / `offset*` / `client*` / `scroll*` /
 * `getComputedStyle` family. The 2026-10-27 layout-queries lane measured the law this repo
 * lives under: **zero first-party occurrences of the whole family, in any shipped tree, at any
 * frequency** — the only viewport reads are the boot sizing and the single `resize` listener
 * (§8.5's "cache all dimensions once upon startup"), and the one live read in a *built* artifact
 * is Pixi's own `EventSystem` per-pointermove `getBoundingClientRect`, which ships inside a
 * dependency and is closed on the TVs by the P0-5 `eventFeatures` off, not by first-party code.
 * Dependency residuals are `dep-grep-floor.test.ts`'s and the bundle greps' ground; this file
 * owns the first-party trees.
 *
 * The scan is `test/integration/tv-engine-floor.test.ts`'s shape copied to a wider law — engine
 * floor and layout inquiries are different rules (Chromium 68/69 has every API here; the ban is
 * cost, not existence), so it stands on its own and keeps its own walker and comment stripper:
 * two independent guards over the same trees cannot both fall asleep. The trees are every
 * package's and every app's `src/` read from disk (core included — the family has no domain-name
 * collisions), so a member added later is covered without an edit here. The baseline is a hard
 * zero: there is no allow-list, because the measurement found none to write. Comments are
 * stripped first, so a docblock that *names* the family — this file's own prose included, and
 * the lane reports that quote it — cannot offend; the string search is a fence, not a semantic
 * analysis, and an indirect reach (`el['offset' + 'Width']`) walks past it like past the engine
 * floor. The latent half of the law — the apps' `PlatformDisplay` getters are live
 * `innerWidth` / `innerHeight` closures that allocate an object per read — is a viewport metric,
 * not a forced-layout inquiry; its pin is the docblock remark of
 * `packages/core/src/platform/index.ts` and the frame-path gate of
 * `test/integration/frame-path-dom-free.test.ts`.
 *
 * @see tizen_optimize.md §8.5, §9 item 7
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * The forced-layout family: each name, and why reading it costs a synchronous flush (the
 * `TOO_NEW` shape of `tv-engine-floor.test.ts`, here pricing cost instead of absence).
 */
const LAYOUT_INQUIRIES = [
  ['getBoundingClientRect', 'forces style + layout before answering the element box'],
  ['getClientRects', 'forces style + layout before answering the element boxes'],
  ['offsetWidth', 'forces layout before answering the element box'],
  ['offsetHeight', 'forces layout before answering the element box'],
  ['offsetTop', 'forces layout before answering the element box'],
  ['offsetLeft', 'forces layout before answering the element box'],
  ['offsetParent', 'forces layout before answering the element box'],
  ['clientWidth', 'forces layout before answering the element box'],
  ['clientHeight', 'forces layout before answering the element box'],
  ['clientTop', 'forces layout before answering the element box'],
  ['clientLeft', 'forces layout before answering the element box'],
  ['scrollWidth', 'forces layout before answering the element box'],
  ['scrollHeight', 'forces layout before answering the element box'],
  ['scrollTop', 'reads (and writing resets) scroll offset — forces layout'],
  ['scrollLeft', 'reads (and writing resets) scroll offset — forces layout'],
  ['getComputedStyle', 'flushes style for the whole cascade it must answer from'],
] as const;

/**
 * Strips block and line comments so a docblock that *names* an inquiry is not an offence (the
 * same helper shape `tv-engine-floor.test.ts` and `data-shmup-writes.test.ts` each keep).
 *
 * @param source - TypeScript source.
 * @returns The code with its comments blanked out.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

/**
 * Every source file under a folder whose name is a TypeScript source (declarations included — a
 * `.d.ts` names the family at most in prose, which stripping removes).
 *
 * @param root - The folder to walk.
 * @returns Paths relative to the repo root, `/`-separated, sorted.
 */
function sourcesOf(root: string): string[] {
  const out: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop() as string;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) stack.push(path);
      else if (/\.(ts|mts|cts)$/.test(entry.name))
        out.push(
          path
            .slice(repo.length + 1)
            .split(/[\\/]/)
            .join('/'),
        );
    }
  }
  return out.sort();
}

/**
 * The trees the scan reads: every package's and every app's `src/`, from disk, so a member
 * added later is inside the law without an edit here.
 *
 * @returns Repo-relative folders, sorted.
 */
function scannedTrees(): string[] {
  const trees: string[] = [];
  for (const parent of ['packages', 'apps']) {
    for (const entry of readdirSync(join(repo, parent), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      try {
        if (!readdirSync(join(repo, parent, entry.name)).includes('src')) continue;
      } catch {
        continue; // A stray non-package folder beside the workspace members.
      }
      trees.push(`${parent}/${entry.name}/src`);
    }
  }
  return trees.sort();
}

/**
 * Every forced-layout inquiry of a source text, comments blanked.
 *
 * @param file - The repo-relative name reported for the hits.
 * @param text - The file's text.
 * @returns One row per (file, name) that appears, `file: name — what` (a name appearing twice is
 *   one row: the law is a hard zero, counts carry no further meaning).
 */
function layoutInquiries(file: string, text: string): string[] {
  const code = stripComments(text);
  const rows: string[] = [];
  for (const [name, why] of LAYOUT_INQUIRIES) {
    if (new RegExp(`\\b${name}\\b`).test(code)) rows.push(`${file}: ${name} — ${why}`);
  }
  return rows;
}

describe('integration: first-party code never forces a layout inquiry (v20x P1-7)', () => {
  const trees = scannedTrees();
  const files = trees.flatMap((tree) => sourcesOf(join(repo, tree)));

  it('scans every package and every app, read from disk', () => {
    expect(trees).toEqual(
      expect.arrayContaining([
        'packages/core/src',
        'packages/render-pixi/src',
        'packages/shell/src',
        'packages/audio-web/src',
        'packages/input-web/src',
        'apps/web/src',
        'apps/tizen/src',
        'apps/webos/src',
        'apps/electron/src',
      ]),
    );
    expect(files.length).toBeGreaterThan(100);
    for (const file of [
      'packages/core/src/platform/index.ts',
      'packages/shell/src/boot/index.ts',
      'apps/tizen/src/bench/run.ts',
      'apps/electron/src/main/main.ts',
    ]) {
      expect(files).toContain(file);
    }
  });

  it('performs no layout inquiry anywhere in first-party source', () => {
    // The lane report's measured baseline, kept by hand: the zero IS the pin — no allow-list,
    // because the audit found nothing to write onto one. A row here is the report's conclusion
    // going stale: fix the call (cache the size, read the frame from core's constants), do not
    // edit this test.
    const offenders = files.flatMap((file) =>
      layoutInquiries(file, readFileSync(join(repo, file), 'utf8')),
    );
    expect(offenders).toEqual([]);
  });

  it('would catch a planted inquiry, and reads no prose — the scan is not vacuous', () => {
    const sample = [
      '/** getComputedStyle is named here only as prose. */',
      'export function layout(win: Window): number {',
      '  // even an inline comment may say offsetWidth',
      '  const rect = canvas.getBoundingClientRect();',
      '  return rect.width + canvas.offsetWidth + win.getComputedStyle(canvas).width.length;',
      '}',
    ].join('\n');
    expect(layoutInquiries('sample.ts', sample)).toEqual([
      'sample.ts: getBoundingClientRect — forces style + layout before answering the element box',
      'sample.ts: offsetWidth — forces layout before answering the element box',
      'sample.ts: getComputedStyle — flushes style for the whole cascade it must answer from',
    ]);
    // Every planted name is really one the scan reads, and every row of the family is reachable
    // by its bare word — a name cannot hide in the list unused.
    expect(LAYOUT_INQUIRIES.length).toBe(16);
    for (const [name] of LAYOUT_INQUIRIES) {
      expect(new RegExp(`\\b${name}\\b`).test(`x.${name};`), name).toBe(true);
    }
  });
});
