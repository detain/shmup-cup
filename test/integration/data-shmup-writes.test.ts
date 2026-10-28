/**
 * The `data-shmup-*` write gate (tizen_optimize.md §8.5 — plan v20x P1-7).
 *
 * The shell's per-frame law is "zero DOM per frame": the frame body touches the page only
 * through a small, fixed set of inert instrumentation attributes — the canvas's five state
 * mirrors (`data-shmup-state`, `-scene`, `-video`, `-still`, `-boot-ms`) the §8.5 audit counts
 * (its "four", grown by the V20X-era video/still additions), the three `data-shmup-atlas-*`
 * timing attributes of R1-05, and the markers the boot overlay, the telemetry panel, the
 * determinism checker and the TV render bench stamp on their own surfaces. None of them is a
 * layout or paint dependency — no CSS selector or query reads them; tests and the TV's remote
 * inspector do — so the frame path stays allocation-free and read-free.
 *
 * This file freezes that surface as law instead of prose. It is the same shape as the
 * frame-literal scans and `tv-engine-floor.test.ts`: a text scan over the shipped source trees
 * with comments stripped (a docblock naming an attribute is prose, not a write), pinning every
 * `data-shmup-*` occurrence by file and attribute with a reason. A sixth write — anywhere in
 * shipped code — fails the scan until a row with a purpose is added here, and a removed or
 * multiplied one fails its stale or drifted pin, so the list cannot rot.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Every source tree that ships to a browser or a TV — the walk `tv-engine-floor.test.ts`
 * shares (kept as its own copy, like that file keeps its own helpers: two independent
 * guards over the same trees cannot both fall asleep).
 */
const RUNTIME_ROOTS = [
  'packages/core/src',
  'packages/audio-web/src',
  'packages/input-web/src',
  'packages/render-pixi/src',
  'packages/shell/src',
  'apps/web/src',
  'apps/tizen/src',
  'apps/webos/src',
];

/** One pinned `data-shmup-*` surface: where it is written and why the DOM write is allowed. */
interface WritePin {
  /** The shipped source file, repo-relative. */
  readonly file: string;
  /** The full attribute token, e.g. `data-shmup-scene`. */
  readonly attribute: string;
  /** How many times the attribute's name appears in that file's code (comments stripped). */
  readonly count: number;
  /** What the write mirrors and which cold or change-gated path performs it. */
  readonly reason: string;
}

/**
 * The whole shipped `data-shmup-*` surface at plan v20x's writing. The first five rows are the
 * canvas state mirrors of §8.5 (the harvest's "five sites"); the rest are the R1-05 atlas-timing
 * trio and the four instrument surfaces the audit names as allow-listed (boot overlay, telemetry
 * panel, the determinism checker, the TV render bench). Every row exists because a browser spec,
 * the TV remote inspector or a bundle check reads that attribute — none because the game does.
 */
const ALLOWED: readonly WritePin[] = [
  {
    file: 'packages/shell/src/boot/index.ts',
    attribute: 'data-shmup-state',
    count: 1,
    reason:
      'BOOT_STATE_ATTRIBUTE: the canvas boot state (`loading` / `running` / `error`), written ' +
      'only by markState() at boot transitions and the error exit — not per frame.',
  },
  {
    file: 'packages/shell/src/boot/index.ts',
    attribute: 'data-shmup-scene',
    count: 1,
    reason:
      'SCENE_ATTRIBUTE: the top scene id, the frame body’s only DOM contact, written by ' +
      'markScene() only when the id changes; inert instrumentation for the browser specs and ' +
      'the TV remote inspector (no CSS or query reads it).',
  },
  {
    file: 'packages/shell/src/boot/index.ts',
    attribute: 'data-shmup-video',
    count: 1,
    reason:
      'VIDEO_ATTRIBUTE: the cutscene director’s onClipChange mirror (v2 R7-VID), written only ' +
      'when the shown clip changes or clears — a cold path.',
  },
  {
    file: 'packages/shell/src/boot/index.ts',
    attribute: 'data-shmup-still',
    count: 1,
    reason:
      'STILL_ATTRIBUTE: the stills director’s onStillChange mirror (plan v20x A4), written only ' +
      'when the shown painting changes or clears — a cold path.',
  },
  {
    file: 'packages/shell/src/boot/index.ts',
    attribute: 'data-shmup-boot-ms',
    count: 1,
    reason:
      'BOOT_MS_ATTRIBUTE: the launch-to-ready time, written once when boot is ready ' +
      '(Shell.bootTiming; shmup_feat.md §23’s ≤ 10 s budget reads through it).',
  },
  {
    file: 'packages/shell/src/boot/index.ts',
    attribute: 'data-shmup-atlas-pages',
    count: 1,
    reason:
      'ATLAS_PAGES_ATTRIBUTE: the resident atlas pages (plan R1-05), written at boot and after ' +
      'the stage changes that upload or unload a page — residency transitions, never a frame.',
  },
  {
    file: 'packages/shell/src/boot/index.ts',
    attribute: 'data-shmup-atlas-load-ms',
    count: 1,
    reason:
      'ATLAS_LOAD_MS_ATTRIBUTE: the last atlas-load time (plan R1-05, owner decision W3-6), ' +
      'written on the same residency transitions.',
  },
  {
    file: 'packages/shell/src/boot/index.ts',
    attribute: 'data-shmup-atlas-page-ms',
    count: 1,
    reason:
      'ATLAS_PAGE_MS_ATTRIBUTE: the last atlas-load per page (plan R1-05, W3-6), built on those ' +
      'transitions only — its docblock’s own law is "never per frame".',
  },
  {
    file: 'packages/shell/src/determinism/index.ts',
    attribute: 'data-shmup-determinism',
    count: 1,
    reason:
      'DETERMINISM_READY_ATTRIBUTE: the document-root ready/error flag of the cross-engine ' +
      'determinism check (M2-18) — a test harness surface, outside the game’s frame path.',
  },
  {
    file: 'packages/shell/src/error-screen/index.ts',
    attribute: 'data-shmup-overlay',
    count: 1,
    reason:
      'The boot overlay’s own canvas marker (§8.5’s allow-listed "boot overlay"): stamped once ' +
      'when createBootOverlay() draws the error screen — the game is not running.',
  },
  {
    file: 'packages/shell/src/telemetry/index.ts',
    attribute: 'data-shmup-render-telemetry',
    count: 1,
    reason:
      'The telemetry panel’s own element marker (§8.5’s allow-listed "telemetry panel"): ' +
      'stamped once when the dev-build render-profile panel is added to the page.',
  },
  {
    file: 'apps/tizen/src/bench/run.ts',
    attribute: 'data-shmup-tv-bench',
    count: 1,
    reason:
      'TV_BENCH_MARKER: the render bench widget’s body state (plan R0-02) — the bench’s own ' +
      'page (never the game bundle; the bundle check greps for this marker).',
  },
];

/**
 * Strips block and line comments so a docblock that *names* an attribute is not a write
 * (`tv-engine-floor.test.ts` keeps the same helper for the same reason).
 *
 * @param source - TypeScript source.
 * @returns The code with its comments blanked out.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

/**
 * Every `data-shmup-*` attribute token in a source text, comments blanked.
 *
 * @param source - The file's text.
 * @returns The tokens in order of appearance (empty for a clean file).
 */
function dataShmupTokens(source: string): string[] {
  return stripComments(source).match(/data-shmup-[a-z0-9-]+/g) ?? [];
}

/**
 * Every `.ts` file under the shipped runtime roots, repo-relative and sorted.
 *
 * @returns The file list of the scan.
 */
function runtimeSources(): string[] {
  const out: string[] = [];
  const stack = RUNTIME_ROOTS.map((root) => join(repo, root));
  while (stack.length > 0) {
    const dir = stack.pop() as string;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) stack.push(path);
      else if (/\.(ts|mts|cts)$/.test(entry.name)) out.push(path.slice(repo.length + 1));
    }
  }
  return out.sort();
}

/**
 * The scan's findings: every (file, attribute) pair with how often the attribute's name
 * appears in that file's code.
 *
 * @param files - The scanned sources (repo-relative).
 * @returns One row per pair, `file attribute ×count`, sorted.
 */
function writeSurface(files: readonly string[]): string[] {
  const rows = new Map<string, number>();
  for (const file of files) {
    for (const attribute of dataShmupTokens(readFileSync(join(repo, file), 'utf8'))) {
      const key = `${file} ${attribute}`;
      rows.set(key, (rows.get(key) ?? 0) + 1);
    }
  }
  return [...rows.entries()].map(([key, count]) => `${key} ×${count}`).sort();
}

/** The allow-list in the scan's own row shape. */
const PINNED = ALLOWED.map((pin) => `${pin.file} ${pin.attribute} ×${pin.count}`).sort();

describe('integration: the data-shmup-* write surface is exactly the pinned instrumentation (v20x P1-7)', () => {
  const files = runtimeSources();
  const surface = writeSurface(files);

  it('scans every shipped source tree (and the scan finds the pinned surface)', () => {
    expect(files.length).toBeGreaterThan(50);
    expect(surface.length).toBe(PINNED.length);
  });

  it('writes no data-shmup-* attribute outside the allow-list, and keeps every pin true', () => {
    // One comparison, three failure shapes named: an unpinned write, a stale pin (the write
    // moved or died), a count that drifted (a second write of the same name crept in).
    const unpinned = surface.filter((row) => !PINNED.includes(row));
    const stale = PINNED.filter((row) => !surface.includes(row));
    expect({ unpinned, stale }).toEqual({ unpinned: [], stale: [] });
  });

  it('would catch a sixth write — the scan is not vacuous', () => {
    const sample = stripComments(
      "const c = document.createElement('canvas');\n" +
        "c.setAttribute('data-shmup-probe', 'x');\n" +
        '/** names data-shmup-state only as prose */\n' +
        '// and data-shmup-scene too, in a line comment\n',
    );
    expect(dataShmupTokens(sample)).toEqual(['data-shmup-probe']);
    // …and every allow-list row names a real attribute the scan can match at all.
    for (const pin of ALLOWED) {
      expect(dataShmupTokens(`a.setAttribute('${pin.attribute}', 'v');`), pin.attribute).toEqual([
        pin.attribute,
      ]);
    }
  });

  it('keeps the five canvas state mirrors of §8.5 intact', () => {
    // The §8.5 law names these five specifically (the doc's "four", five on this disk since
    // the V20X-era video/still mirrors): a frame-path regression starts with one of them
    // changing hands, so they are asserted as a group, not only as rows.
    const mirrors = ALLOWED.filter(
      (pin) => pin.file === 'packages/shell/src/boot/index.ts' && !pin.attribute.includes('atlas'),
    ).map((pin) => pin.attribute);
    expect(mirrors).toEqual([
      'data-shmup-state',
      'data-shmup-scene',
      'data-shmup-video',
      'data-shmup-still',
      'data-shmup-boot-ms',
    ]);
  });
});
