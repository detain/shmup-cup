/**
 * Playwright config for the browser smoke tests (`pnpm test:e2e`, plan §1.4): headless
 * Chromium with SwiftShader WebGL opens the web build (served by `vite preview`) and the Tizen
 * `dist/` straight from disk via `file://`, the way the TV runs the widget.
 *
 * `pnpm test:e2e` builds both apps first as test builds (Turborepo `build:test`, which also
 * generates the atlas: release code plus `__SHMUP_DEV__`, so `window.__shmupDebug` exists for
 * the smoke and the frame-advance helpers); this config only serves and tests the existing
 * `dist/` folders.
 *
 * Chromium flags:
 * - `--use-angle=swiftshader --enable-unsafe-swiftshader` — software WebGL on CI machines
 *   without a GPU.
 * - `--allow-file-access-from-files` — Chrome treats every `file://` URL as its own origin, so
 *   an atlas PNG next to `index.html` would be cross-origin and WebGL would refuse to upload
 *   it. The Tizen web runtime serves the packaged widget's own files as same-origin; this flag
 *   gives desktop Chromium the same behaviour.
 * - `--autoplay-policy=no-user-gesture-required` — like the TV, where audio starts without a
 *   gesture (the Tizen app unlocks audio at boot).
 *
 * The browser gets the environment **without `DISPLAY`**: headless Chromium needs no X server,
 * and a stale forwarded display (an SSH session's `localhost:11.0`) makes ANGLE's SwiftShader
 * Vulkan back-end try XCB, fail, and leave every WebGL context creation hanging.
 *
 * @module
 */
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

/** Repository root (this file lives in `test/e2e/`). */
const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

/** Port of the `vite preview` server for the web build. */
export const WEB_PORT = 4173;

/** The test process's environment minus `DISPLAY` (see the module docs). */
const browserEnv: Record<string, string> = {};
for (const [name, value] of Object.entries(process.env)) {
  if (name !== 'DISPLAY' && value !== undefined) browserEnv[name] = value;
}

/**
 * Parallel browsers: half the cores (Playwright's default), but at most 8. Each page renders
 * with SwiftShader, which is itself multi-threaded, so on a many-core machine the default (24
 * workers on 48 cores) starves the pages of CPU. Eight is as fast in wall time here: the
 * longest spec files, not the worker count, bound the run.
 */
const WORKERS = Math.max(1, Math.min(8, Math.floor(availableParallelism() / 2)));

/** Running on CI (stricter: no `test.only`, one retry, never reuse a server). */
const ci = process.env.CI !== undefined && process.env.CI !== '';

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  outputDir: './test-results',
  fullyParallel: false,
  workers: WORKERS,
  forbidOnly: ci,
  retries: ci ? 1 : 0,
  reporter: 'list',
  timeout: 60_000,
  use: {
    ...devices['Desktop Chrome'],
    // ×3 of the 384×216 frame: one frame pixel = 3×3 screenshot pixels, no letterbox.
    viewport: { width: 1152, height: 648 },
    baseURL: `http://localhost:${WEB_PORT}/`,
    launchOptions: {
      args: [
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
        '--allow-file-access-from-files',
        '--autoplay-policy=no-user-gesture-required',
      ],
      env: browserEnv,
    },
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command: `pnpm --filter @shmup/web exec vite preview --port ${WEB_PORT} --strictPort`,
    cwd: repoRoot,
    url: `http://localhost:${WEB_PORT}/`,
    reuseExistingServer: !ci,
    timeout: 60_000,
  },
});
