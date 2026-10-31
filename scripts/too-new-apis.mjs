/**
 * The post-Chromium-68 API list — one shared source for both guards of the TV engine floor
 * (plan M3-03; the v20x P1-8c codification of the standing prose rule from the Pixi 8.22 incident).
 *
 * The two TVs are Chromium 69 (Samsung Tizen 5.5) and 68 (LG webOS 5); a bundled API newer than
 * 68 is a `TypeError` on the LG set, and the build lowers syntax, never library methods. This
 * module carries the names and their engines so the two consumers cannot drift:
 *
 * - `test/integration/tv-engine-floor.test.ts` scans the shipped **sources** (comments stripped,
 *   every needle as a substring); and
 * - `apps/tizen/scripts/check-bundle.mjs` rule 13 — which the `build` script of **both** TV apps
 *   runs on the **built** `app.js`, dependencies included — fails loud on any occurrence outside
 *   the two prepended ES5 polyfill files' embedded regions, unless the name is in
 *   {@link BUNDLE_POLYFILLED} and its polyfill banner stands in front of it.
 *
 * The corpus is the 2026-10-23 manual bundle audit (w14: after PixiJS 8.22's dependency bump
 * silently broke the TV boot on `String.prototype.matchAll`, Chrome 73) merged with the source
 * scan's own list — plain name greps, because a minified bundle keeps no structure to parse and
 * the point is to catch a call, not to analyse it.
 *
 * **Public API.** {@link POLYFILL_BANNER}, {@link MATCH_ALL_BANNER}, {@link TOO_NEW_APIS},
 * {@link TOO_NEW_POLYFILLS}, {@link BUNDLE_POLYFILLED}, {@link tooNewApiHits}.
 *
 * @module
 */

/** First characters of the globalThis polyfill banner that must open app.js. */
export const POLYFILL_BANNER = '/* Shmup Cup — globalThis polyfill';

/**
 * First characters of the matchAll polyfill banner, the first line of the file that must open
 * app.js right after the globalThis one — PixiJS 8.22 calls `String.prototype.matchAll`
 * (Chrome 73) during renderer init, and the TVs stop at Chromium 68/69 (w14).
 */
export const MATCH_ALL_BANNER = '/* Shmup Cup — matchAll polyfill';

/**
 * APIs Chrome 68 does not have — the shared needle list. The first two are the ones the lint
 * lets through (Chrome 69, `.browserslistrc`); the rest are already lint errors and are
 * re-checked here so one list covers the whole floor. `.at(` matches every method call of that
 * name (the ESLint rule words it the same way) — a minified bundle may rename anything, but not
 * a built-in method call.
 *
 * @type {ReadonlyArray<{ needle: string, what: string }>}
 */
export const TOO_NEW_APIS = [
  { needle: '.flat(', what: 'Array.prototype.flat (Chrome 69 — webOS 5 is 68)' },
  { needle: '.flatMap(', what: 'Array.prototype.flatMap (Chrome 69 — webOS 5 is 68)' },
  { needle: 'Object.fromEntries', what: 'Object.fromEntries (Chrome 73)' },
  { needle: 'Object.hasOwn', what: 'Object.hasOwn (Chrome 93)' },
  { needle: 'Promise.allSettled', what: 'Promise.allSettled (Chrome 76)' },
  { needle: 'Promise.any', what: 'Promise.any (Chrome 85)' },
  { needle: '.replaceAll(', what: 'String.prototype.replaceAll (Chrome 85)' },
  { needle: '.matchAll(', what: 'String.prototype.matchAll (Chrome 73)' },
  { needle: 'structuredClone', what: 'structuredClone (Chrome 98)' },
  { needle: 'queueMicrotask', what: 'queueMicrotask (Chrome 71)' },
  { needle: 'WeakRef', what: 'WeakRef (Chrome 84)' },
  { needle: 'FinalizationRegistry', what: 'FinalizationRegistry (Chrome 84)' },
  { needle: '.at(', what: 'Array.prototype.at (Chrome 92)' },
];

/**
 * The two ES5 files both TV builds prepend (`vite.config.ts` `postBanner`) — named by their file
 * under `apps/tizen/polyfills/` (the webOS build reads the same files, not copies). Their embedded
 * regions are exempt from the built-bundle scan: a polyfill legitimately speaks the name it
 * defines, and the files themselves stay grep-clean by
 * `test/integration/tv-engine-floor.test.ts`'s own case.
 *
 * @type {ReadonlyArray<{ file: string, banner: string }>}
 */
export const TOO_NEW_POLYFILLS = [
  { file: 'global-this.js', banner: POLYFILL_BANNER },
  { file: 'string-match-all.js', banner: MATCH_ALL_BANNER },
];

/**
 * Names a built TV bundle may still contain because a prepended polyfill backs them at runtime.
 * Each entry is an upper bound, not a licence: more occurrences than `maxCount` mean a new call
 * site the baseline does not know — the polyfill's modelled semantics (see its docblock) must be
 * audited against the new site before the number moves. Occurrences count only outside the
 * {@link TOO_NEW_POLYFILLS} regions, and only while `banner` stands in the bundle — a build that
 * lost the polyfill lost the licence with it.
 *
 * @type {ReadonlyArray<{
 *   needle: string,
 *   banner: string,
 *   maxCount: number,
 *   polyfill: string,
 *   why: string,
 * }>}
 */
export const BUNDLE_POLYFILLED = [
  {
    needle: '.matchAll(',
    banner: MATCH_ALL_BANNER,
    maxCount: 2,
    polyfill: 'apps/tizen/polyfills/string-match-all.js',
    why: 'PixiJS 8.22’s two GLSL sampler-precision call sites, backed by the prepended polyfill (w14)',
  },
];

/**
 * Every occurrence of every {@link TOO_NEW_APIS} needle, in list order and by position.
 *
 * @param {string} code - The text to scan — raw: a minified bundle keeps no comments, and a
 *   bundle's strings can call nothing only by accident, so the precedent grep counted everything
 *   and so does this.
 * @param {ReadonlyArray<readonly [number, number]>} [exemptRanges] - `[start, end)` byte ranges
 *   to skip (the embedded polyfill files, see `checkBundleEngineFloor` in the Tizen check).
 * @returns {Array<{ needle: string, what: string, index: number }>} The hits.
 */
export function tooNewApiHits(code, exemptRanges = []) {
  /** @type {Array<{ needle: string, what: string, index: number }>} */
  const hits = [];
  for (const { needle, what } of TOO_NEW_APIS) {
    let at = code.indexOf(needle);
    while (at >= 0) {
      if (!exemptRanges.some(([start, end]) => at >= start && at < end)) {
        hits.push({ needle, what, index: at });
      }
      at = code.indexOf(needle, at + needle.length);
    }
  }
  return hits;
}
