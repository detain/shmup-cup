/**
 * The atlas in a real browser (plan R1-05): how its manifest is delivered and which pages stay on
 * the GPU.
 *
 * **The manifest.** Since R1-05 `app.js` no longer carries the ~200 KB atlas manifest: the build
 * ships `assets/atlas/main.json` and the shell fetches it with `XMLHttpRequest` (decision D25 —
 * `fetch()` fails on `file://`; XHR answers status 0 there), checks its digest against the one the
 * build recorded, then loads the pages. Checked here:
 *
 * - the web build fetches the manifest once and boots to the title;
 * - a manifest that cannot be fetched ends on the boot error screen (`ATLAS MANIFEST FAILED TO
 *   LOAD`), and a manifest of another build (a stale cache) on `ATLAS DOES NOT MATCH ITS MANIFEST`
 *   — neither loads a page or draws a frame;
 * - the Tizen build boots from `file://` with the manifest outside `app.js` — the XHR path the TVs
 *   take (desktop Chromium with `--allow-file-access-from-files`, as the Tizen runtime serves the
 *   widget's own files; the real set is the owner's check, W3-7).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

/** The Tizen build's page, as a `file://` URL. */
const TIZEN_INDEX = pathToFileURL(
  fileURLToPath(new URL('../../apps/tizen/dist/index.html', import.meta.url)),
).href;

/** The Tizen build's script, read from disk. */
const TIZEN_APP = fileURLToPath(new URL('../../apps/tizen/dist/app.js', import.meta.url));

/** The Tizen build's shipped manifest. */
const TIZEN_MANIFEST = fileURLToPath(
  new URL('../../apps/tizen/dist/assets/atlas/main.json', import.meta.url),
);

/** Every URL a page requested, and its console output. */
interface PageLog {
  /** Request URLs, in order. */
  readonly requests: string[];
  /** Console messages (`<type>: <text>`) and uncaught errors. */
  readonly console: string[];
}

/**
 * Records a page's requests and console output.
 *
 * @param page - The page.
 * @returns The live log.
 */
function watch(page: Page): PageLog {
  const log: PageLog = { requests: [], console: [] };
  page.on('request', (request) => log.requests.push(request.url()));
  page.on('console', (message) => log.console.push(`${message.type()}: ${message.text()}`));
  page.on('pageerror', (error) => log.console.push(`pageerror: ${error.message}`));
  return log;
}

/**
 * Requests whose URL ends with a path.
 *
 * @param log - The page log.
 * @param suffix - The path (`assets/atlas/main.json`).
 * @returns The matching URLs.
 */
function requested(log: PageLog, suffix: string): string[] {
  return log.requests.filter((url) => url.split('?')[0].endsWith(suffix));
}

test.describe('atlas manifest delivery (R1-05)', () => {
  test('the web build fetches assets/atlas/main.json once and boots to the title', async ({
    page,
  }) => {
    const log = watch(page);
    await page.goto('./');
    await expect(page.locator('#game')).toHaveAttribute('data-shmup-state', 'running');
    await expect(page.locator('#game')).toHaveAttribute('data-shmup-scene', 'title');
    expect(requested(log, '/assets/atlas/main.json')).toHaveLength(1);
    expect(requested(log, '/assets/atlas/main.png')).toHaveLength(1);
    expect(log.console.filter((line) => line.startsWith('error'))).toEqual([]);
  });

  test('a manifest that cannot be fetched ends on ATLAS MANIFEST FAILED TO LOAD', async ({
    page,
  }) => {
    const log = watch(page);
    await page.route('**/assets/atlas/main.json', (route) => route.abort());
    await page.goto('./');
    await expect(page.locator('#game')).toHaveAttribute('data-shmup-state', 'error');
    await expect.poll(() => log.console.join('\n')).toContain('ATLAS MANIFEST FAILED TO LOAD');
    // Nothing after the manifest ran: no page was requested.
    expect(requested(log, '/assets/atlas/main.png')).toEqual([]);
  });

  test('a manifest of another build ends on ATLAS DOES NOT MATCH ITS MANIFEST', async ({
    page,
  }) => {
    const log = watch(page);
    // The same manifest with one byte more: a stale cached copy from another build.
    await page.route('**/assets/atlas/main.json', async (route) => {
      const response = await route.fetch();
      await route.fulfill({ response, body: `${await response.text()} ` });
    });
    await page.goto('./');
    await expect(page.locator('#game')).toHaveAttribute('data-shmup-state', 'error');
    await expect.poll(() => log.console.join('\n')).toContain('ATLAS DOES NOT MATCH ITS MANIFEST');
    expect(requested(log, '/assets/atlas/main.png')).toEqual([]);
  });

  test('the Tizen build boots from file:// with the manifest outside app.js (XHR, status 0)', async ({
    page,
  }) => {
    const log = watch(page);
    // The script carries no frame of the manifest: the boot below must have read main.json.
    const manifest = JSON.parse(readFileSync(TIZEN_MANIFEST, 'utf8')) as {
      frames: Record<string, unknown>;
    };
    const code = readFileSync(TIZEN_APP, 'utf8');
    const frames = Object.keys(manifest.frames);
    expect(frames.length).toBeGreaterThan(0);
    expect(frames.filter((name) => code.includes(`"${name}"`))).toEqual([]);
    await page.goto(TIZEN_INDEX);
    await expect(page.locator('#game')).toHaveAttribute('data-shmup-state', 'running');
    // The manifest, then the page, read from disk (`file://` requests show up like any other).
    expect(requested(log, '/assets/atlas/main.json')).toHaveLength(1);
    expect(requested(log, '/assets/atlas/main.png')).toHaveLength(1);
    expect(log.requests.indexOf(requested(log, '/assets/atlas/main.json')[0])).toBeLessThan(
      log.requests.indexOf(requested(log, '/assets/atlas/main.png')[0]),
    );
    expect(log.console.filter((line) => line.startsWith('error'))).toEqual([]);
  });
});
