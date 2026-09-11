/* Shmup Cup — globalThis polyfill for Tizen 5.5 (Chromium 69; globalThis arrived in Chrome 71).
 * Prepended verbatim (as the bundle banner) to app.js by apps/tizen/vite.config.ts, so it
 * runs before any bundled code, including PixiJS. Keep this file plain ES5. */
(function () {
  if (typeof globalThis === 'object') return;
  var root = typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : this;
  Object.defineProperty(root, 'globalThis', {
    value: root,
    writable: true,
    configurable: true,
  });
})();
