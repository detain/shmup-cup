/**
 * M2-17's platform polish in headless Chromium, on the test builds `pnpm test:e2e` makes
 * (`build:test` — `__SHMUP_DEV__` on, so `window.__shmupDebug` exists):
 *
 * - **web build — debug save export / import and the storage quota adapter:** `__shmupDebug.save`
 *   exports the save as readable JSON, imports an edited one (written to `localStorage` under the
 *   `shmup-cup:` prefix, reported by `usage()` against the 1 MiB budget), refuses a broken text, and
 *   the imported save is what the next launch loads;
 * - **Tizen build via `file://` — the device line:** nothing about the device is collected and
 *   Samsung's `webapis.js` is never requested outside a TV; after Pause, Ch+, Ch+, Ch+ the tools log
 *   the snapshot (`Shmup Cup device`) with the window's size, the browser's Chrome version and the
 *   renderer's WebGL context; the Tizen storage adapter reports its usage too; no console errors.
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test, type ConsoleMessage, type Page } from '@playwright/test';

/** The Tizen build's page, as a `file://` URL. */
const TIZEN_INDEX = pathToFileURL(
  fileURLToPath(new URL('../../apps/tizen/dist/index.html', import.meta.url)),
).href;

/** What the spec reads from `window.__shmupDebug.save`. */
interface SaveApiWindow {
  __shmupDebug: {
    sceneId: string;
    save: {
      export(): string;
      import(text: string): Promise<{ ok: boolean; status: string; written: boolean }>;
      usage(): { bytes: number; keys: number; quotaBytes: number; persistent: boolean } | null;
    } | null;
  };
}

/**
 * Opens a build and waits for its title screen, collecting console errors.
 *
 * @param page - The page.
 * @param url - The build's URL.
 * @returns The page's error log.
 */
async function open(page: Page, url: string): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(url);
  await expect(page.locator('#game')).toHaveAttribute('data-shmup-state', 'running');
  await expect
    .poll(() => page.evaluate(() => (window as unknown as SaveApiWindow).__shmupDebug.sceneId))
    .toBe('title');
  return errors;
}

/**
 * Waits for `frames` animation frames in the page.
 *
 * @param page - The page.
 * @param frames - Frames to wait.
 */
function waitFrames(page: Page, frames: number): Promise<void> {
  return page.evaluate(
    (count) =>
      new Promise<void>((resolve) => {
        let seen = 0;
        const next = (): void => {
          seen++;
          if (seen >= count) resolve();
          else requestAnimationFrame(next);
        };
        requestAnimationFrame(next);
      }),
    frames,
  );
}

/**
 * Dispatches a remote key by key code, down then up.
 *
 * @param page - The page.
 * @param keyCode - The legacy key code.
 */
async function remoteTap(page: Page, keyCode: number): Promise<void> {
  for (const type of ['keydown', 'keyup']) {
    await page.evaluate(
      ([eventType, code]) => {
        const event = new KeyboardEvent(eventType, { bubbles: true, cancelable: true });
        Object.defineProperty(event, 'keyCode', { get: () => code });
        window.dispatchEvent(event);
      },
      [type, keyCode] as const,
    );
    await waitFrames(page, 3);
  }
}

test.describe('platform polish (M2-17)', () => {
  test('web build: the debug save export / import reaches localStorage and the next launch', async ({
    page,
  }) => {
    const errors = await open(page, './');
    const exported = await page.evaluate(() =>
      (window as unknown as SaveApiWindow).__shmupDebug.save?.export(),
    );
    expect(exported).toBeDefined();
    const doc = JSON.parse(exported ?? '') as { version: number; stats: { gamesStarted: number } };
    expect(doc.version).toBe(2);
    // Readable: pretty-printed.
    expect(exported).toContain('\n  "version": 2');

    doc.stats.gamesStarted = 7;
    const result = await page.evaluate(
      (text) => (window as unknown as SaveApiWindow).__shmupDebug.save?.import(text),
      JSON.stringify(doc),
    );
    expect(result).toMatchObject({ ok: true, status: 'ok', written: true });
    const stored = await page.evaluate(() => localStorage.getItem('shmup-cup:save.v1'));
    expect(JSON.parse(stored ?? '{}')).toMatchObject({ stats: { gamesStarted: 7 } });
    const usage = await page.evaluate(() =>
      (window as unknown as SaveApiWindow).__shmupDebug.save?.usage(),
    );
    expect(usage).toMatchObject({ quotaBytes: 1024 * 1024, persistent: true });
    expect(usage?.keys).toBeGreaterThanOrEqual(1);
    expect(usage?.bytes).toBeGreaterThanOrEqual(
      2 * ('shmup-cup:save.v1'.length + (stored ?? '').length),
    );

    const refused = await page.evaluate(() =>
      (window as unknown as SaveApiWindow).__shmupDebug.save?.import('{broken'),
    );
    expect(refused).toMatchObject({ ok: false, status: 'corrupt', written: false });
    expect(await page.evaluate(() => localStorage.getItem('shmup-cup:save.v1'))).toBe(stored);

    // The next launch loads the imported save.
    await page.reload();
    await expect(page.locator('#game')).toHaveAttribute('data-shmup-state', 'running');
    const reloaded = await page.evaluate(() =>
      (window as unknown as SaveApiWindow).__shmupDebug.save?.export(),
    );
    expect(JSON.parse(reloaded ?? '{}')).toMatchObject({ stats: { gamesStarted: 7 } });
    expect(errors).toEqual([]);
  });

  test('Tizen build via file://: the unlock logs the device snapshot, without webapis.js', async ({
    page,
  }) => {
    const webapisRequests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('webapis')) webapisRequests.push(request.url());
    });
    const snapshots: ConsoleMessage[] = [];
    page.on('console', (message) => {
      if (message.type() === 'info' && message.text().startsWith('Shmup Cup device')) {
        snapshots.push(message);
      }
    });
    const errors = await open(page, TIZEN_INDEX);
    await waitFrames(page, 10);
    // Locked: nothing collected.
    expect(snapshots).toEqual([]);
    for (const keyCode of [10252, 427, 427, 427]) await remoteTap(page, keyCode);
    await expect.poll(() => snapshots.length).toBe(1);
    const info = (await snapshots[0]?.args()[1]?.jsonValue()) as {
      cssWidth: number;
      cssHeight: number;
      chromeMajor: number | null;
      webglVersion: number | null;
      maxTextureSize: number | null;
      model: string | null;
      firmware: string | null;
    };
    const size = await page.evaluate(() => [innerWidth, innerHeight]);
    expect([info.cssWidth, info.cssHeight]).toEqual(size);
    expect(info.chromeMajor).toBeGreaterThanOrEqual(69);
    expect([1, 2]).toContain(info.webglVersion);
    expect(info.maxTextureSize).toBeGreaterThanOrEqual(2048);
    // Not a TV: no Samsung product info, and the script was never requested.
    expect(info.model).toBeNull();
    expect(info.firmware).toBeNull();
    expect(webapisRequests).toEqual([]);
    // The TV's storage adapter (the shell's createWebStorage) reports its usage.
    const usage = await page.evaluate(() =>
      (window as unknown as SaveApiWindow).__shmupDebug.save?.usage(),
    );
    expect(usage).toMatchObject({ quotaBytes: 1024 * 1024, persistent: true });
    expect(errors).toEqual([]);
  });
});
