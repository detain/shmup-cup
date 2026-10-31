#!/usr/bin/env node
/**
 * Verifies the Tizen build output after `vite build` (runs as part of `pnpm build`):
 *
 *  1. dist/ holds exactly ONE JavaScript file, `app.js` (no code-split chunks).
 *  2. index.html loads it with a classic `<script defer src="./app.js">` — no
 *     `type="module"` (ES modules are only partially supported on Tizen).
 *  3. app.js parses with acorn as an ES2018 *script* (Chromium 69 supports ES2018;
 *     this also rejects `import`/`export`, `import()`, `import.meta`, `?.`, `??`,
 *     class fields and optional catch binding that would slip through).
 *  4. app.js starts with the globalThis polyfill banner and holds the matchAll polyfill banner
 *     that follows it (the two prepended ES5 files, w14).
 *  5. config.xml and icon.png were copied from public/, and config.xml — whichever variant was
 *     built (default, game mode, gamepad check — `config-xml.mjs`, M2-17) — validates.
 *  6. Every other file is a non-script asset under dist/assets/ (atlas pages emitted by
 *     the shmupAssets() plugin, M1-03); anything else in dist/ would be packaged into the
 *     .wgt by accident.
 *  7. At least one atlas page (`dist/assets/atlas/*.png`, or a `*.svg` page of the bench's SVG arm
 *     — plan R-SVG WO-1) is present — the shell's boot loads the pages with `new Image()` and shows
 *     the boot error screen without them (M1-04).
 *  8. Budgets (plan M1-19, shmup_feat.md §22 / §23): `app.js` ≤ {@link APP_JS_GZIP_BUDGET}
 *     gzipped, every atlas page either a PNG of at most {@link ATLAS_PAGE_MAX_SIZE}² pixels or an
 *     SVG of those dimensions within {@link SVG_PAGE_MAX_BYTES} raw, the whole `dist/` ≤
 *     {@link DIST_BUDGET} bytes.
 *  9. The game and the TV render bench never mix (plan R0-02): a widget whose `config.xml` carries
 *     the bench's app id (`config-xml.mjs` `BENCH_APP_ID`) must be the bench — its `app.js` holds
 *     {@link TV_BENCH_MARKER} — and any other widget (the game) must not hold it.
 * 10. The atlas manifest ships next to its pages, not inside `app.js` (plan R1-05 — the shell
 *     fetches it with XHR at boot): `dist/assets/atlas/main.json` exists and parses, lists every
 *     page with its real pixel size and every atlas PNG is listed; and `app.js` names at most
 *     {@link MAX_INLINED_FRAME_NAMES} of its frames — the inlined manifest named every one
 *     (~1,400), so more means the manifest was inlined by accident ({@link checkAtlasManifest};
 *     the bench widget, which inlines its own density atlases, is exempt).
 * 11. The era's media ships with the game (the v20x-VIDIO1 enablement): `dist/assets/video/`
 *     carries `video-ledger.json` listing {@link MEDIA_VIDEO_CLIP_COUNT} clips with every named
 *     clip present, plus `LICENSES-videos.md`, and `dist/assets/stills/` the same shape with
 *     {@link MEDIA_STILL_COUNT} stills and `LICENSES-stills.md`. Presence counts only, never
 *     per-file digests (the H.264 encoder is not byte-deterministic across builds). Before this
 *     rule a build box without ffmpeg produced a silently video-less dist (the encode kit
 *     loud-skips with exit 0 and `assets/generated/` is git-ignored — that was the hole). The
 *     bench widget is exempt (rule 9's family); `SHMUP_NO_VIDEO=1` / `SHMUP_NO_STILLS=1` skip
 *     their half — the baked-off shape the Vite plugins ship under the same envs
 *     ({@link checkEraMedia}).
 * 12. The atlas pages on disk are the pages `app.js` names, one encoding per build (plan R-SVG
 *     WO-1, {@link checkBenchAtlasPages}): every `assets/atlas/*.svg` the bundle's inlined manifests
 *     name is on disk, and every `.svg` on disk is named by the bundle. The SVG arm emits no PNG
 *     density pages and the PNG arm no SVG ones, so a page of the other encoding is a page loaded
 *     by nothing — and sized by the TV for nothing. The game widget ships no `.svg` page, so there
 *     the rule reads as "no stray svg".
 * 13. No API newer than Chromium 68 survives into the built `app.js` ({@link checkBundleEngineFloor}
 *     — the v20x P1-8c codification of the standing re-grep rule, {@link tooNewApiHits}): every
 *     occurrence of the shared needle list {@link TOO_NEW_APIS} fails loud, except inside the two
 *     prepended ES5 polyfill files' embedded regions, and except names a polyfill in front of the
 *     bundle backs — today only `String.prototype.matchAll`, capped at PixiJS 8.22's two known
 *     call sites while the matchAll banner stands ({@link BUNDLE_POLYFILLED}). The source scan
 *     `test/integration/tv-engine-floor.test.ts` reads the same list; a dependency bump that
 *     introduces one of these names now breaks the build instead of the TV boot (w14). The bench
 *     widget keeps the rule — same engines, same floor.
 *
 * Exits non-zero with a readable report on failure. Checks `apps/tizen/dist` by default, or the
 * folder given as the first argument (`node scripts/check-bundle.mjs dist-bench` — `build:bench`).
 * The checks are also exported as {@link checkTizenBundle} so the unit tests can run them against
 * fixture folders.
 *
 * **Public API.** {@link checkTizenBundle}, {@link WIDGET_FILES}, {@link POLYFILL_BANNER},
 * {@link MATCH_ALL_BANNER},
 * {@link APP_JS_GZIP_BUDGET}, {@link ATLAS_PAGE_MAX_SIZE}, {@link DIST_BUDGET}, {@link pngSize},
 * {@link TV_BENCH_MARKER}, {@link applicationIdOf}, {@link checkAtlasManifest},
 * {@link ATLAS_MANIFEST_FILE}, {@link ATLAS_MANIFEST_VERSIONS}, {@link MAX_INLINED_FRAME_NAMES},
 * {@link checkEraMedia}, {@link VIDEO_LEDGER_FILE}, {@link STILLS_LEDGER_FILE},
 * {@link SVG_PAGE_MAX_BYTES}, {@link svgPageSize}, {@link checkBenchAtlasPages},
 * {@link MEDIA_VIDEO_CLIP_COUNT}, {@link MEDIA_STILL_COUNT}, {@link bakedOffNote},
 * {@link checkBundleEngineFloor}.
 *
 * @module
 */
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { parse } from 'acorn';
import {
  BUNDLE_POLYFILLED,
  MATCH_ALL_BANNER,
  POLYFILL_BANNER,
  TOO_NEW_POLYFILLS,
  tooNewApiHits,
} from '../../../scripts/too-new-apis.mjs';
import { BENCH_APP_ID, validateConfigXml } from './config-xml.mjs';
import { APP_DIR, DIST_DIR } from './tizen-env.mjs';

/**
 * Files that make up the widget itself (rule 5 requires them); every other file in `dist/`
 * must live under `assets/` (rule 6).
 */
export const WIDGET_FILES = ['app.js', 'config.xml', 'icon.png', 'index.html'];

// The polyfill banners and the post-68 needle list live in `scripts/too-new-apis.mjs` — one
// shared source for this file's bundle audit (rule 13) and the source scan in
// `test/integration/tv-engine-floor.test.ts`. Re-exported here: the webOS check and the tests
// have always read them off this module's public API.
export { MATCH_ALL_BANNER, POLYFILL_BANNER };

/**
 * Most bytes `app.js` may take gzipped (launch ≤ 10 s on the TV, shmup_feat.md §23): 350 KB from
 * M1-19, 384 KB from M2-16 (the Options pages, rebinding and the UI string table — the built-in
 * English table and its content copy — took the bundle to ≈ 359 KB), **512 KB since M3-02**.
 *
 * @remarks
 * 512 KB is the owner's agreed ceiling: M3-01 left only ≈ 9 KB under the old 384 KB budget, and
 * M3-02 / M3-03 both ship more code, so the headroom was granted up front rather than argued over
 * per step. Spend it, do not treat it as a target — prefer leaner shipped code first. Raising it
 * **above** 512 KB needs the owner's say-so; a raise also updates the expectation in
 * `apps/tizen/test/scripts/check-bundle.test.ts` and the budget tables in
 * `docs/dev/debug-and-replays.md`, `docs/dev/build-test-deploy.md`, `docs/dev/api-reference.md` and
 * `apps/tizen/README.md`. The real constraint is unchanged: the launch must stay ≤ 10 s on the TV
 * (`shmup_feat.md` §23), which M2-18's boot-time check guards.
 */
export const APP_JS_GZIP_BUDGET = 512 * 1024;

/** Largest atlas page edge in pixels (2048² — shmup_feat.md §22 budgets). */
export const ATLAS_PAGE_MAX_SIZE = 2048;

/**
 * Most bytes the whole `dist/` may take (16 MiB — the packaged widget).
 *
 * @remarks
 * **The v2 value, set by plan R3-04.M2b from the stand-in projection (owner decision W5-16) and
 * re-derived digit-for-digit from fresh measurements by the M2RV1 follow-up.** Plan R1-05
 * (decision W3-4) had kept it at 8 MiB with this docblock as the derivation note and asked R3-04
 * to re-derive it from measured art. Every part below was re-measured on myadmin1 at `7baeb4d`,
 * and each term says what actually ships:
 *
 * - the stand-in atlas — **3,401,438** B, every page counted once: `common` 91,921 plus the nine
 *   zone-group pages 3,309,517 B together (per zone 338,822…446,323). The source is
 *   `test/integration/standin-budget.test.ts` run with `SHMUP_STANDIN_PRINT=1` (M2a's table,
 *   re-measured byte-identical here): it prints the ten **residency rows** — 91,921 and
 *   430,743…538,244 B, Σ 4,228,727 — and a zone row carries the shared 1024×1024 `common` page
 *   beside its own, because that is what a stage holds on the GPU. A download ships each page
 *   once, so the nine repeated `common` copies (827,289 B) come back out:
 *   4,228,727 − 827,289 = 3,401,438;
 * - `app.js` raw — **1,450,743** B, from `pnpm --filter @shmup/tizen build` (385.8 KB gzip of
 *   the 512 KB {@link APP_JS_GZIP_BUDGET});
 * - the atlas manifest, `index.html`, `config.xml` and the icon — **211,360** B, the same
 *   `dist/` (`main.json` 204,896; the three widget files 557 + 1,694 + 4,213 = 6,464);
 * - recorded audio — one natural play-through, **6,002,830** B: the 24 music tracks as
 *   intro + one loop (818.7 s) at 5,838,044 B, the 26 SFX one-shots at 164,786 B. Recipe:
 *   `pnpm audio:preview` logs every loop track's loop window in samples and writes the loop
 *   **twice** for the seam demo — that doubled material encodes to music 10,824,641 B, which is
 *   not what ships; truncating every looping file to its printed `loopEnd` sample is exactly the
 *   shipped play-through, and each of the 50 files then goes through `oggenc -q5` (vorbis-tools
 *   1.4.2) at 22,050 Hz mono as `docs/dev/real-assets.md` prescribes.
 *
 * The audio term and the code term count the same music **twice, on purpose**: `app.js`'s
 * 1,450,743 B carry the inlined chip-song JSONs of `content/audio/music/` while the audio term
 * projects those very songs as recorded OGGs. This is deliberate conservatism for the pre-R5
 * projection — the plan's R5 step replaces the chip JSONs with the real recordings, and until
 * then the budget carries both costs (W5-16).
 *
 * Sum: **11,066,371 B = 10.55 MiB** — the budget leaves a **margin of 5,710,845 B (≈ 5.45 MiB)**.
 * The guard still notices when the product outgrows the projection — exactly what W5-16 weighed
 * against keeping 8 MiB ("R4 / R5 trip it zone by zone"): the corrected sum exceeds 8 MiB by
 * 2,677,763 B. Three ceilings sit around it, and R6-02 (the final art re-measure) adjudicates
 * them with evidence — a budget moves to a new measurement, never to quiet a check:
 *
 * - art at the RR-7 band's top: `test/scripts/assets/atlas-budget.ts` caps the atlas at 5,700,000 B
 *   (300,000 `common` + 9 × 600,000 zone bytes), 2,298,562 B above the measured stand-in pages;
 * - code at its gzip ceiling: ≈ 1.93 MB raw at today's compression (1,450,743 × 524,288 ÷ the
 *   393,539 B `gzip -6` takes it to; ≈ 482 KB more than measured today; the shipped content is
 *   inlined, so R4/R5 add to it);
 * - longer v2 tracks: the audio term is today's material at `oggenc -q5` ≈ 7.1 KB a natural
 *   second (≈ 57 kbit/s mono — chiptune-derived); R5's real recordings ride their own rate.
 *
 * The real caps are far above it — the Tizen dev install cap is 120 MB and the TV's memory budget
 * 100 MB (`@shmup/shell` `memory`) — so this is a download regression guard, not a platform limit.
 * `dist-bench/` shares it (rule 8 checks both; `turbo run build:bench --force` measures 3,943.0 KB
 * on Tizen and 3,940.0 KB on webOS of the 16,384.0 KB budget at `7baeb4d` — R1-05's B4 and the
 * stand-in decode scenario). A change updates the pins in `check-bundle.test.ts`,
 * `check-bundle-budgets.test.ts`, `test/integration/tv-engine-floor.test.ts`,
 * `apps/webos/test/scripts/check-bundle.test.ts`, both apps' READMEs and the budget tables of
 * `docs/dev`.
 *
 * **R7-VID re-derivation (owner 'Vs' ruling, 2026-10-27):** the shipped cutscene set adds
 * 6,803,092 B of silent H.264 clips under `assets/video/` and the built `dist/` measures
 * 9,421,536 B with them — the video-less game term of the sum above is 2,618,444 B measured
 * (it matches its projection). Under the 16 MiB guard the margin would be 7,355,680 B, and
 * the next steps spend it: the RR-7 art band keeps 2,298,562 B of atlas headroom above the
 * measured pages, and v2.1.x plans zone F's WARNING sting plus the captain stings (≈ the
 * current set's size again) — 5,057,118 B would not be enough. The guard moves to a new
 * measurement, 24 MiB (25,165,824 B: 13,445,726 B left after the art band, one whole clip-set
 * doubling plus slack), still one fifth of the 120 MB real install ceiling — the 16 MiB
 * arithmetic above stands as the R3-04.M2b history.
 */
export const DIST_BUDGET = 24 * 1024 * 1024;

/** Where the atlas manifest ships, relative to `dist/` (rule 10 — plan R1-05). */
export const ATLAS_MANIFEST_FILE = 'assets/atlas/main.json';

/** Manifest format versions the shell reads (`@shmup/shell` `ATLAS_MANIFEST_VERSIONS`). */
export const ATLAS_MANIFEST_VERSIONS = [1, 2];

/**
 * Most atlas frame names `app.js` may contain (rule 10). The shipped code names none today; the
 * inlined manifest named every frame (~1,400), so a handful leaves room for a hard-coded reference
 * while still catching an accidental inline.
 */
export const MAX_INLINED_FRAME_NAMES = 8;

/**
 * The body attribute only the TV render bench sets (`apps/tizen/src/bench` `TV_BENCH_MARKER`, plan
 * R0-02) — rule 9 reads it to tell the bench's `app.js` from the game's.
 */
export const TV_BENCH_MARKER = 'data-shmup-tv-bench';

/**
 * The application id a `config.xml` declares.
 *
 * @param {string} xml - The XML.
 * @returns {string | null} The `<tizen:application id>`, or `null` when there is none.
 */
export function applicationIdOf(xml) {
  const tag = /<tizen:application\b([^>]*)>/.exec(xml.replace(/<!--[\s\S]*?-->/g, ''));
  if (tag === null) return null;
  const id = /(?:^|\s)id="([^"]*)"/.exec(tag[1]);
  return id === null ? null : id[1];
}

/** The 8-byte PNG signature. */
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * Reads a PNG's pixel size from its IHDR chunk.
 *
 * @param {Uint8Array} bytes - The file.
 * @returns {{ width: number, height: number } | null} The size, or `null` when the bytes are not
 *   a PNG starting with an IHDR chunk.
 */
export function pngSize(bytes) {
  if (bytes.length < 24) return null;
  for (let i = 0; i < PNG_SIGNATURE.length; i++) if (bytes[i] !== PNG_SIGNATURE[i]) return null;
  const type = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
  if (type !== 'IHDR') return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/**
 * The raw-byte budget of one SVG atlas page (the bench's SVG arm, plan R-SVG WO-1). The arm's
 * largest density page today is ~0.8 MB of text; the budget leaves room for a page of the stand-in
 * atlas's shape (7.9 MB of E3 for a 2048² page of 57 colours) without letting a runaway encoding
 * blow the widget's install size. {@link DIST_BUDGET} still caps the whole bundle.
 */
export const SVG_PAGE_MAX_BYTES = 12 * 1024 * 1024;

/**
 * Reads an SVG's pixel size from its root element's `width` / `height` attributes — the two the
 * emitter writes before `viewBox` (`scripts/bench-svg.mjs`), which are what make an SVG page a page
 * of a known size to `new Image()`.
 *
 * @param {Uint8Array} bytes - The file.
 * @returns {{ width: number, height: number } | null} The size, or `null` when the bytes do not
 *   start with an `<svg` element carrying whole-number `width` and `height` attributes.
 */
export function svgPageSize(bytes) {
  const head = new TextDecoder('utf-8').decode(bytes.subarray(0, 512));
  if (!head.startsWith('<svg')) return null;
  const tag = /^<svg[^>]*>/.exec(head);
  if (tag === null) return null;
  const width = /(?:^|\s)width="(\d+)"/.exec(tag[0]);
  const height = /(?:^|\s)height="(\d+)"/.exec(tag[0]);
  if (width === null || height === null) return null;
  return { width: Number(width[1]), height: Number(height[1]) };
}

/**
 * Rule 12 (plan R-SVG WO-1): the `.svg` pages on disk and the `.svg` pages the bundle names are the
 * same set.
 *
 * @remarks
 * The bench inlines its density manifests (decision D25), so the file names the widget fetches are
 * string literals in `app.js`; the game's manifest is a fetched file instead (rule 10) and the game
 * ships no SVG pages at all. Both directions are checked: a named page that is missing is a broken
 * load, a present page that nothing names is a stale page of the other arm. The reader takes the
 * names out of the minified bundle by a class of url-path characters only — a minifier may delimit
 * the strings with backticks, and a negated class that forgot one would run a name across the
 * literals next to it.
 *
 * @param {readonly string[]} files - The bundle's files, relative and `/`-separated.
 * @param {string} code - The contents of `app.js` (`''` when missing).
 * @returns {string[]} The problems (empty when the pages are in order).
 */
export function checkBenchAtlasPages(files, code) {
  const onDisk = files.filter((file) => /^assets\/atlas\/[^/]+\.svg$/.test(file));
  const named = new Set(code.match(/assets\/atlas\/[A-Za-z0-9._@-]+\.svg/g) ?? []);
  /** @type {string[]} */
  const problems = [];
  for (const url of named) {
    if (!files.includes(url)) problems.push(`app.js names ${url}, which the bundle does not hold`);
  }
  for (const file of onDisk) {
    if (!named.has(file)) problems.push(`${file} is in the bundle but named by nothing (stale?)`);
  }
  return problems;
}

/**
 * Reads the two prepended ES5 polyfill files as the built `app.js` carries them (rule 13's exempt
 * regions): their on-disk text is what `postBanner` embeds verbatim.
 *
 * @returns {Array<{ file: string, text: string | null }>} One entry per polyfill; `text` is
 *   `null` when the file cannot be read — the region then grants no exemption.
 */
function readEnginePolyfillBodies() {
  return TOO_NEW_POLYFILLS.map((entry) => ({
    file: `apps/tizen/polyfills/${entry.file}`,
    text: readOptional(join(APP_DIR, 'polyfills', entry.file)),
  }));
}

/**
 * Rule 13 (the v20x P1-8c codification): no API newer than Chromium 68 survives into the built
 * bundle unbacked — the standing prose rule of `docs/dev/conventions.md` (the 2026-10-23 audit
 * after the Pixi 8.22 boot break) turned into a check.
 *
 * @remarks
 * Scans `app.js` with {@link tooNewApiHits} and the shared {@link TOO_NEW_APIS} list, outside the
 * two prepended polyfill files' exact embedded regions (located by their on-disk text — a
 * blanket name exemption would licence the very dependency site the polyfill exists for). A hit
 * of a {@link BUNDLE_POLYFILLED} name is tolerated only while its banner stands in the bundle and
 * only up to its baseline count — a new call site is a finding, not a licence. Dependencies are
 * in here on purpose: unlike the source scan, this rule reads what the TV actually parses. The
 * check runs on the game and the bench widget alike (same engines), and never on an empty bundle
 * (the missing `app.js` is rule 5's to report).
 *
 * @param {string} code - The contents of `app.js` (`''` when missing).
 * @param {Array<{ file: string, text: string | null }>} [polyfillBodies] - The exempt-region
 *   sources (default: {@link readEnginePolyfillBodies}, the two committed files).
 * @returns {string[]} The problems (empty when the bundle stays inside the floor).
 */
export function checkBundleEngineFloor(code, polyfillBodies = readEnginePolyfillBodies()) {
  if (code === '') return [];
  /** @type {Array<readonly [number, number]>} */
  const exemptRanges = [];
  for (const body of polyfillBodies) {
    if (body.text === null) continue;
    const at = code.indexOf(body.text);
    if (at >= 0) exemptRanges.push([at, at + body.text.length]);
  }
  /** @type {Map<string, number>} */
  const tolerated = new Map();
  /** @type {string[]} */
  const problems = [];
  for (const hit of tooNewApiHits(code, exemptRanges)) {
    const tolerance = BUNDLE_POLYFILLED.find((entry) => entry.needle === hit.needle);
    if (tolerance !== undefined && code.includes(tolerance.banner)) {
      const seen = (tolerated.get(hit.needle) ?? 0) + 1;
      tolerated.set(hit.needle, seen);
      if (seen > tolerance.maxCount) {
        problems.push(
          `app.js holds a \`${hit.needle}\` site beyond the known-good baseline of ` +
            `${tolerance.maxCount} — ${tolerance.why} (surplus site at byte ${hit.index}); ` +
            `audit it against ${tolerance.polyfill} before raising the baseline in ` +
            'scripts/too-new-apis.mjs',
        );
      }
      continue;
    }
    const near = code.slice(Math.max(0, hit.index - 60), hit.index + 60).replace(/\s+/g, ' ');
    problems.push(
      `app.js uses ${hit.what} — an API neither TV has, outside the prepended polyfills\n` +
        `    at byte ${hit.index}: …${near}…`,
    );
  }
  return problems;
}

/**
 * Rule 10 (plan R1-05): the atlas manifest ships as {@link ATLAS_MANIFEST_FILE} and matches the
 * pages next to it, and `app.js` does not carry it inlined.
 *
 * @remarks
 * Shared with the webOS check (one source of truth, like the budgets). Problems, in order: a
 * missing or unparsable manifest (nothing else is checked then), an unknown format version, each
 * listed page that is missing or whose PNG size differs from the manifest's (a PNG that is not
 * one is rule 8's), each atlas PNG the manifest does not list (a stale page), and an `app.js`
 * naming more than {@link MAX_INLINED_FRAME_NAMES} distinct frames of the manifest. Switching an
 * app to the inline fallback (`virtual:shmup-assets-inline`, W3-7) needs this rule relaxed in the
 * same change.
 *
 * @param {string} distDir - The build output folder.
 * @param {readonly string[]} files - Its files, relative and `/`-separated.
 * @param {string} code - The contents of `app.js` (`''` when missing).
 * @returns {string[]} The problems (empty when the manifest is in order).
 */
export function checkAtlasManifest(distDir, files, code) {
  if (!files.includes(ATLAS_MANIFEST_FILE)) {
    return [`${ATLAS_MANIFEST_FILE} is missing (the shell fetches the atlas manifest at boot)`];
  }
  /** @type {unknown} */
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(join(distDir, ATLAS_MANIFEST_FILE), 'utf8'));
  } catch (error) {
    return [`${ATLAS_MANIFEST_FILE} is not valid JSON: ${/** @type {Error} */ (error).message}`];
  }
  const record =
    manifest !== null && typeof manifest === 'object'
      ? /** @type {Record<string, unknown>} */ (manifest)
      : {};
  const pages = Array.isArray(record.pages) ? record.pages : [];
  if (pages.length === 0) return [`${ATLAS_MANIFEST_FILE} lists no atlas pages`];
  /** @type {string[]} */
  const problems = [];
  if (!ATLAS_MANIFEST_VERSIONS.includes(/** @type {number} */ (record.formatVersion))) {
    problems.push(
      `${ATLAS_MANIFEST_FILE} has format version ${String(record.formatVersion)}, ` +
        `the shell reads ${ATLAS_MANIFEST_VERSIONS.join(' or ')}`,
    );
  }
  const listed = new Set();
  pages.forEach((/** @type {unknown} */ entry, /** @type {number} */ index) => {
    const page =
      entry !== null && typeof entry === 'object'
        ? /** @type {{ file?: unknown, w?: unknown, h?: unknown }} */ (entry)
        : {};
    if (typeof page.file !== 'string') {
      problems.push(`${ATLAS_MANIFEST_FILE} page ${index} has no file name`);
      return;
    }
    const path = `assets/atlas/${page.file}`;
    listed.add(path);
    if (!files.includes(path)) {
      problems.push(`${ATLAS_MANIFEST_FILE} lists ${path}, which is missing`);
      return;
    }
    const size = pngSize(readFileSync(join(distDir, path)));
    if (size !== null && (size.width !== page.w || size.height !== page.h)) {
      problems.push(
        `${path} is ${size.width}×${size.height}, but ${ATLAS_MANIFEST_FILE} says ` +
          `${String(page.w)}×${String(page.h)}`,
      );
    }
  });
  for (const file of files) {
    if (/^assets\/atlas\/[^/]+\.png$/.test(file) && !listed.has(file)) {
      problems.push(`${file} is not listed in ${ATLAS_MANIFEST_FILE} (a stale page?)`);
    }
  }
  const frames =
    record.frames !== null && typeof record.frames === 'object'
      ? /** @type {Record<string, unknown>} */ (record.frames)
      : {};
  const named = new Set();
  // A frame name is a run of name characters ending in `#<index>`; the lookbehind starts a match
  // only at the start of a run, so a long run without `#` costs one pass, not a quadratic one.
  for (const match of code.match(/(?<![a-z0-9@/-])[a-z0-9@/-]+#\d+/g) ?? []) {
    if (Object.prototype.hasOwnProperty.call(frames, match)) named.add(match);
  }
  if (named.size > MAX_INLINED_FRAME_NAMES) {
    const sample = [...named].slice(0, 3).join(', ');
    problems.push(
      `app.js names ${named.size} atlas frames (${sample}, …) — the atlas manifest was inlined; ` +
        `the apps import virtual:shmup-assets and fetch ${ATLAS_MANIFEST_FILE}`,
    );
  }
  return problems;
}

/**
 * Rule 11 (the v20x-VIDIO1 enablement): where the clips' ledger ships, relative to `dist/`.
 * The encode kit writes it (`scripts/assets/video-encode.mjs`) and the plugin emits it beside
 * the clips (`vite.shared.ts` `shmupVideos`).
 */
export const VIDEO_LEDGER_FILE = 'assets/video/video-ledger.json';

/** Rule 11: where the stills' ledger ships, relative to `dist/`. */
export const STILLS_LEDGER_FILE = 'assets/stills/stills-ledger.json';

/**
 * Rule 11: the clips the era ships — pinned to the shell's `VIDEO_CLIPS` census by
 * `apps/tizen/test/scripts/check-bundle.test.ts` (the count lives here so the check reads like
 * the rule, and the test fails loud when the manifest grows without the rule).
 */
export const MEDIA_VIDEO_CLIP_COUNT = 15;

/** Rule 11: the ending stills the era ships (pinned to `STILL_SURFACES` the same way). */
export const MEDIA_STILL_COUNT = 5;

/**
 * One half of rule 11: the folder's ledger parses, names `expectedCount` files, every named
 * file ships next to it, and the folder carries its AI-content disclosure.
 *
 * @param {string} distDir - The build output folder.
 * @param {readonly string[]} files - Its files, relative and `/`-separated.
 * @param {string} ledgerFile - The ledger's dist-relative path.
 * @param {string} folder - The media folder, relative to `dist/` (no trailing slash).
 * @param {string} listKey - The ledger's array key (`clips` / `stills`).
 * @param {number} expectedCount - How many media files the era ships.
 * @param {string} licencesFile - The disclosure file's name inside the folder.
 * @param {string} why - What must ship, for the problem text.
 * @returns {string[]} The problems (empty when the set is in order).
 */
function checkMediaSet(
  distDir,
  files,
  ledgerFile,
  folder,
  listKey,
  expectedCount,
  licencesFile,
  why,
) {
  if (!files.includes(ledgerFile)) {
    return [`${ledgerFile} is missing — ${why}`];
  }
  /** @type {unknown} */
  let ledger;
  try {
    ledger = JSON.parse(readFileSync(join(distDir, ledgerFile), 'utf8'));
  } catch (error) {
    return [`${ledgerFile} is not valid JSON: ${/** @type {Error} */ (error).message}`];
  }
  const record =
    ledger !== null && typeof ledger === 'object'
      ? /** @type {Record<string, unknown>} */ (ledger)
      : {};
  const rows = Array.isArray(record[listKey]) ? record[listKey] : null;
  if (rows === null) {
    return [`${ledgerFile} carries no \`${listKey}\` array — ${why}`];
  }
  /** @type {string[]} */
  const problems = [];
  if (rows.length !== expectedCount) {
    problems.push(
      `${ledgerFile} lists ${rows.length} ${listKey}; the era ships ${expectedCount} — ${why}`,
    );
  }
  rows.forEach((/** @type {unknown} */ entry, /** @type {number} */ index) => {
    const row =
      entry !== null && typeof entry === 'object' ? /** @type {{ file?: unknown }} */ (entry) : {};
    if (typeof row.file !== 'string') {
      problems.push(`${ledgerFile} ${listKey} ${index} has no file name`);
      return;
    }
    const path = `${folder}/${row.file}`;
    if (!files.includes(path)) {
      problems.push(`${path} is listed in ${ledgerFile} but missing — ${why}`);
    }
  });
  if (!files.includes(`${folder}/${licencesFile}`)) {
    problems.push(`${folder}/${licencesFile} is missing (the AI-content disclosure)`);
  }
  return problems;
}

/**
 * Rule 11 (the v20x-VIDIO1 enablement): the era's media ships with the game — the 15 cutscene
 * clips under `assets/video/` and the 5 ending stills under `assets/stills/`, each half by its
 * kit ledger (row count + every named file present + the licences file).
 *
 * @remarks
 * Presence-COUNT only, never per-file digests: the encode kit's H.264 output is not
 * byte-deterministic across ffmpeg builds (the ledger's `sha256` rows belong to the machine
 * that encoded them). The hole this closes: `scripts/assets/video-encode.mjs` loud-skips with
 * exit 0 on a box without ffmpeg and `assets/generated/` is git-ignored, so a video-less `dist/`
 * used to pass every earlier rule silently. `env.SHMUP_NO_VIDEO` / `env.SHMUP_NO_STILLS` = '1'
 * skip their half — the intentional baked-off build the Vite plugins ship under the same envs
 * (`vite.shared.ts`), disclosed on the OK line by {@link checkTizenBundle}'s entry point.
 *
 * @param {string} distDir - The build output folder.
 * @param {readonly string[]} files - Its files, relative and `/`-separated.
 * @param {Record<string, string | undefined>} [env] - The environment to read the opt-outs from
 *   (default `process.env`).
 * @returns {string[]} The problems (empty when both halves ship or are baked off).
 */
export function checkEraMedia(distDir, files, env = process.env) {
  /** @type {string[]} */
  const problems = [];
  if (env.SHMUP_NO_VIDEO !== '1') {
    problems.push(
      ...checkMediaSet(
        distDir,
        files,
        VIDEO_LEDGER_FILE,
        'assets/video',
        'clips',
        MEDIA_VIDEO_CLIP_COUNT,
        'LICENSES-videos.md',
        `the era ships ${MEDIA_VIDEO_CLIP_COUNT} cutscene clips — a build box without ffmpeg ` +
          'made a video-less bundle (rule 11; a bake needs SHMUP_NO_VIDEO=1)',
      ),
    );
  }
  if (env.SHMUP_NO_STILLS !== '1') {
    problems.push(
      ...checkMediaSet(
        distDir,
        files,
        STILLS_LEDGER_FILE,
        'assets/stills',
        'stills',
        MEDIA_STILL_COUNT,
        'LICENSES-stills.md',
        `the era ships ${MEDIA_STILL_COUNT} ending stills (rule 11; a bake needs SHMUP_NO_STILLS=1)`,
      ),
    );
  }
  return problems;
}

/**
 * Formats a byte count for reports.
 *
 * @param {number} bytes - Size in bytes.
 * @returns {string} e.g. `"812.4 KB"`.
 */
function kb(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

/**
 * Lists files under a directory recursively.
 *
 * @param {string} dir - Directory.
 * @returns {string[]} Absolute file paths.
 */
function listFiles(dir) {
  /** @type {string[]} */
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...listFiles(full));
    else out.push(full);
  }
  return out;
}

/**
 * Reads a file, or returns `null` when it does not exist.
 *
 * @param {string} file - Absolute path.
 * @returns {string | null} The UTF-8 contents.
 */
function readOptional(file) {
  return existsSync(file) ? readFileSync(file, 'utf8') : null;
}

/**
 * Runs every Tizen bundle check against a build output folder.
 *
 * @param {string} distDir - Folder produced by `vite build` (normally apps/tizen/dist).
 * @returns {{ problems: string[], files: string[], code: string, gzipBytes: number, distBytes: number }}
 *   Problems found (empty when the bundle is valid), the files in the folder (relative,
 *   `/`-separated), the contents of app.js (`''` when missing), its gzipped size and the size of
 *   the whole folder in bytes.
 */
export function checkTizenBundle(distDir) {
  /** @type {string[]} */
  const problems = [];
  if (!existsSync(distDir)) {
    return {
      problems: [`${distDir} does not exist — run vite build first`],
      files: [],
      code: '',
      gzipBytes: 0,
      distBytes: 0,
    };
  }
  const files = listFiles(distDir).map((file) => relative(distDir, file).split('\\').join('/'));

  // 1. Exactly one script.
  const scripts = files.filter((file) => /\.(m?js|cjs)$/.test(file));
  if (scripts.length !== 1 || scripts[0] !== 'app.js') {
    problems.push(
      `expected exactly one script "app.js" in dist/, found: ${scripts.join(', ') || 'none'}`,
    );
  }

  // 2. Classic script tag.
  const rawHtml = readOptional(join(distDir, 'index.html'));
  const html = (rawHtml ?? '').replace(/<!--[\s\S]*?-->/g, '');
  const scriptTags = html.match(/<script\b[^>]*>/g) ?? [];
  if (rawHtml !== null && scriptTags.length !== 1) {
    problems.push(`index.html should contain exactly one <script> tag, found ${scriptTags.length}`);
  }
  for (const tag of scriptTags) {
    if (/type\s*=\s*["']?module/.test(tag))
      problems.push(`index.html still loads a module script: ${tag}`);
    if (!/src="\.\/app\.js"/.test(tag))
      problems.push(`index.html script does not load ./app.js: ${tag}`);
    if (!/\bdefer\b/.test(tag)) problems.push(`index.html script is not deferred: ${tag}`);
  }

  // 3. ES2018 classic-script parse.
  const code = readOptional(join(distDir, 'app.js')) ?? '';
  if (code !== '') {
    try {
      parse(code, { ecmaVersion: 2018, sourceType: 'script' });
    } catch (error) {
      const err = /** @type {Error & { pos?: number }} */ (error);
      const pos = typeof err.pos === 'number' ? err.pos : 0;
      const context = code.slice(Math.max(0, pos - 80), pos + 80).replace(/\s+/g, ' ');
      problems.push(`app.js is not a valid ES2018 script: ${err.message}\n    near: …${context}…`);
    }

    // 4. Polyfill first.
    if (!code.trimStart().startsWith(POLYFILL_BANNER)) {
      problems.push('app.js does not start with the globalThis polyfill banner');
    }
    if (!code.includes(MATCH_ALL_BANNER)) {
      problems.push('app.js does not contain the matchAll polyfill banner');
    }
  }

  // 5. Tizen widget files.
  for (const required of ['config.xml', 'icon.png', 'index.html', 'app.js']) {
    if (!files.includes(required)) problems.push(`dist/${required} is missing`);
  }
  const configXml = readOptional(join(distDir, 'config.xml'));
  if (configXml !== null) {
    for (const problem of validateConfigXml(configXml)) problems.push(`config.xml: ${problem}`);
  }
  const bench = configXml !== null && applicationIdOf(configXml) === BENCH_APP_ID;

  // 9. The game and the TV render bench never mix.
  if (configXml !== null && code !== '') {
    const marked = code.includes(TV_BENCH_MARKER);
    if (bench && !marked) {
      problems.push(
        `config.xml names the render bench (${BENCH_APP_ID}) but app.js is not the bench`,
      );
    } else if (!bench && marked) {
      problems.push(
        'app.js contains the TV render bench (R0-02) — the bench must never ship in the game',
      );
    }
  }

  // 6. Non-script assets only under assets/ (scripts anywhere are already reported by 1).
  const stray = files.filter(
    (file) =>
      !WIDGET_FILES.includes(file) && !file.startsWith('assets/') && !scripts.includes(file),
  );
  if (stray.length > 0) {
    problems.push(`unexpected files outside dist/assets/: ${stray.join(', ')}`);
  }

  // 7. The atlas pages the shell loads at boot (a `.svg` page is the bench's SVG arm, rule 12).
  const pages = files.filter((file) => /^assets\/atlas\/[^/]+\.(png|svg)$/.test(file));
  if (pages.length === 0) {
    problems.push('no atlas page in dist/assets/atlas/ (the game cannot boot without it)');
  }

  // 8. Budgets.
  const gzipBytes = code === '' ? 0 : gzipSync(code).length;
  if (gzipBytes > APP_JS_GZIP_BUDGET) {
    problems.push(`app.js is ${kb(gzipBytes)} gzipped, over the ${kb(APP_JS_GZIP_BUDGET)} budget`);
  }
  for (const page of pages) {
    const pageBytes = readFileSync(join(distDir, page));
    const isSvg = page.endsWith('.svg');
    const size = isSvg ? svgPageSize(pageBytes) : pngSize(pageBytes);
    if (size === null) {
      problems.push(`atlas page ${page} is not a ${isSvg ? 'SVG' : 'PNG'}`);
    } else if (isSvg && pageBytes.length > SVG_PAGE_MAX_BYTES) {
      problems.push(
        `atlas page ${page} is ${kb(pageBytes.length)} of SVG text, ` +
          `over the ${kb(SVG_PAGE_MAX_BYTES)} budget for one page`,
      );
    } else if (size.width > ATLAS_PAGE_MAX_SIZE || size.height > ATLAS_PAGE_MAX_SIZE) {
      problems.push(
        `atlas page ${page} is ${size.width}×${size.height}, over the ${ATLAS_PAGE_MAX_SIZE}² budget`,
      );
    }
  }
  let distBytes = 0;
  for (const file of files) distBytes += statSync(join(distDir, file)).size;
  if (distBytes > DIST_BUDGET) {
    problems.push(`dist/ holds ${kb(distBytes)}, over the ${kb(DIST_BUDGET)} budget`);
  }

  // 10. The atlas manifest ships next to the pages, not inlined into app.js (the game only — the
  // bench inlines its own density atlases).
  if (!bench) problems.push(...checkAtlasManifest(distDir, files, code));

  // 11. The era's media ships with the game (the v20x-VIDIO1 enablement — the bench is exempt).
  if (!bench) problems.push(...checkEraMedia(distDir, files));

  // 12. The SVG pages on disk are the SVG pages app.js names (plan R-SVG WO-1).
  problems.push(...checkBenchAtlasPages(files, code));

  // 13. No API newer than Chromium 68 survives into the built bundle unbacked (v20x P1-8c — the
  // game and the bench alike: same engines, same floor).
  problems.push(...checkBundleEngineFloor(code));

  return { problems, files, code, gzipBytes, distBytes };
}

/**
 * Command-line entry point: checks `apps/tizen/dist` (or the folder given as the first argument,
 * relative to the working directory) and exits non-zero on failure.
 */
function main() {
  const target = process.argv[2] === undefined ? DIST_DIR : resolve(process.argv[2]);
  const { problems, files, code, gzipBytes, distBytes } = checkTizenBundle(target);
  if (problems.length > 0) {
    console.error('Tizen bundle check FAILED:');
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
  }
  console.log(
    `Tizen bundle OK: app.js ${kb(code.length)} (${kb(gzipBytes)} gzip of ${kb(APP_JS_GZIP_BUDGET)}), ` +
      `classic script, ES2018, ${files.length} files in ${relative(APP_DIR, target) || '.'}/ ` +
      `(${kb(distBytes)} of ${kb(DIST_BUDGET)})` +
      bakedOffNote(),
  );
}

/**
 * The rule 11 disclosure for a baked-off build: names the media halves the env opted out of, so
 * an OK line never hides a deliberately video-less bundle (`vite.shared.ts`'s kill-switch envs).
 *
 * @returns {string} A suffix for the OK line ('' when nothing is baked off).
 */
export function bakedOffNote() {
  /** @type {string[]} */
  const off = [];
  if (process.env.SHMUP_NO_VIDEO === '1') off.push('video');
  if (process.env.SHMUP_NO_STILLS === '1') off.push('stills');
  return off.length === 0 ? '' : ` [${off.join(' + ')} baked off by env — rule 11]`;
}

/**
 * Whether this file is the script Node was started with (`node scripts/check-bundle.mjs`),
 * as opposed to being imported by a test. Compares real paths so symlinked checkouts work.
 *
 * @returns {boolean} `true` when run from the command line.
 */
function isCommandLineEntry() {
  const entry = process.argv[1];
  if (entry === undefined || !existsSync(entry)) return false;
  return realpathSync(resolve(entry)) === realpathSync(fileURLToPath(import.meta.url));
}

if (isCommandLineEntry()) main();
