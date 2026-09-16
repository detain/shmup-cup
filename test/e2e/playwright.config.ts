/**
 * Playwright config for the browser smoke tests (`pnpm test:e2e`, plan §1.4): headless
 * Chromium with SwiftShader WebGL opens the web build (served by `vite preview`) and the two TV
 * builds — Tizen and, since M3-03, webOS — straight from disk via `file://`, the way a TV runs the
 * installed package.
 *
 * `pnpm test:e2e` builds all three apps first as test builds (Turborepo `build:test`, which also
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
 * Projects (plan M2-18): `chromium` runs every spec; `firefox` runs only the cross-engine
 * determinism spec (`determinism.spec.ts` — the golden replays in SpiderMonkey against the web
 * build's renderer-free `?determinism` page: headless Firefox on a machine without a GPU cannot
 * create the WebGL context the game itself needs). CI runs them in separate jobs
 * (`--project=chromium` sharded, `--project=firefox` on its own).
 *
 * Concurrency: every test is independent (its own browser context: fresh `localStorage`, its own
 * page on the shared `vite preview` server or `file://` build), so the tests of one spec file run
 * in parallel too (`fullyParallel`), on {@link WORKERS} browsers (`E2E_WORKERS` overrides it).
 * CI splits the run over several machines with `--shard=i/n`.
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
 * Parallel browsers: one per five cores, at least two — or the `E2E_WORKERS` environment
 * variable (a positive integer).
 *
 * @remarks
 * Each page renders with SwiftShader, which runs up to 16 threads of its own, so the run is
 * CPU-bound and a browser needs several cores: measured on 48 cores (M2-14, 92 tests), 8
 * browsers took 158–180 s, 10 took 153 s and 12 took 150 s, while 16 and 24 made the machine so
 * busy that frame-paced tests timed out (2 and 7 failures). One per five cores (9 there) keeps
 * that margin on any machine; a 4-vCPU CI runner gets 2, as before.
 */
export const WORKERS = resolveWorkers(
  process.env.E2E_WORKERS,
  Math.max(2, Math.floor(availableParallelism() / 5)),
);

/**
 * A worker count from an environment variable, or the default when it is unset or not a
 * positive integer.
 *
 * @param value - The variable's value.
 * @param fallback - The default.
 * @returns The worker count.
 */
function resolveWorkers(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/** Running on CI (stricter: no `test.only`, one retry, never reuse a server). */
const ci = process.env.CI !== undefined && process.env.CI !== '';

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  outputDir: './test-results',
  fullyParallel: true,
  workers: WORKERS,
  forbidOnly: ci,
  retries: ci ? 1 : 0,
  reporter: 'list',
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${WEB_PORT}/`,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        browserName: 'chromium',
        // ×3 of the 384×216 frame: one frame pixel = 3×3 screenshot pixels, no letterbox.
        viewport: { width: 1152, height: 648 },
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
    },
    {
      name: 'firefox',
      testMatch: 'determinism.spec.ts',
      use: {
        ...devices['Desktop Firefox'],
        browserName: 'firefox',
        viewport: { width: 1152, height: 648 },
        launchOptions: { env: browserEnv },
      },
    },
  ],
  webServer: {
    command: `pnpm --filter @shmup/web exec vite preview --port ${WEB_PORT} --strictPort`,
    cwd: repoRoot,
    url: `http://localhost:${WEB_PORT}/`,
    reuseExistingServer: !ci,
    timeout: 60_000,
  },
});
