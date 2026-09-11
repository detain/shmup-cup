/**
 * Vite config for the browser dev target.
 *
 * Workspace packages resolve to their TypeScript sources through the `@shmup/source`
 * export condition, so `pnpm dev` needs no prior package build and HMR reaches into
 * packages/*. `base: './'` keeps the build relocatable (served from a sub-path, or
 * loaded by apps/electron through its `app://` protocol). `shmupContent()` inlines `content/`,
 * `shmupAssets()` inlines the atlas manifest and emits the atlas pages into `dist/assets/atlas/`.
 */
import { defineConfig } from 'vite';
import { clientConditions, shmupAssets, shmupContent } from '../../vite.shared.js';

export default defineConfig({
  base: './',
  plugins: [shmupContent(), shmupAssets()],
  resolve: {
    conditions: clientConditions,
  },
  server: {
    host: true,
    port: 5173,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
  },
});
