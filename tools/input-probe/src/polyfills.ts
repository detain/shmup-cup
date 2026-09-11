/**
 * Tiny hand-picked polyfills for Chromium 69 (Tizen 5.5). Imported first by `main.ts`.
 *
 * - `globalThis` (Chrome 71+). Sets `window.__globalThisPolyfilled = true` when it had to be added, so the
 *   environment panel can report whether the engine has it natively.
 *
 * @remarks
 * Syntax is lowered by the build (`target: ['chrome69', 'es2018']`), but *runtime APIs* are not polyfilled
 * automatically — anything newer than Chrome 69 that the probe uses must be added here (or avoided). The
 * end-to-end test in `test/build.test.ts` removes post-Chromium-69 builtins from its fake realm to catch
 * accidental use.
 *
 * @module polyfills
 */

if (typeof globalThis === 'undefined') {
  const g = (typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : {}) as Record<string, unknown>;
  g['globalThis'] = g;
  g['__globalThisPolyfilled'] = true;
}

export {};
