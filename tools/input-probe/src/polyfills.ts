/**
 * Tiny hand-picked polyfills for Chromium 69 (Tizen 5.5). Imported first by `main.ts`.
 *
 * - `globalThis` (Chrome 71+). Sets `window.__globalThisPolyfilled = true` when it had to be added, so the
 *   environment panel can report whether the engine has it natively.
 *
 * @module polyfills
 */

if (typeof globalThis === 'undefined') {
  const g = (typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : {}) as Record<string, unknown>;
  g['globalThis'] = g;
  g['__globalThisPolyfilled'] = true;
}

export {};
