/**
 * The **LG webOS build** in headless Chromium (plan M3-03, §1.4's `pnpm test:e2e` row).
 *
 * `apps/webos/dist/` is opened straight from disk via `file://`, the way an installed `.ipk` runs
 * — the same trade the Tizen specs make. This is the only place the webOS bundle is ever executed:
 * every other webOS test drives its modules against fakes, and **no agent has an LG set** (plan
 * §8.7). So what is checked here is the part that cannot be faked — that the one classic ES2018
 * script the widget ships really boots on a browser engine, renders something, and answers the
 * remote:
 *
 * - the bundle loads from `file://`, reports its boot time inside the ≤ 10 s launch rule and
 *   reaches the title;
 * - the picture is not blank (SwiftShader WebGL, the shared atlas);
 * - **Back = 461** (not Samsung's 10009) reaches the scene flow: on the title it opens the exit
 *   confirmation, and NO closes it again;
 * - the remote's arrows and OK drive the menus through `webos-remote-safe`;
 * - a saved choice of the *Tizen* remote profile is ignored — the M3-03 lock-out regression, here
 *   against the real bundle rather than a fake window;
 * - no console errors anywhere in the run.
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { decodePng } from '../../scripts/assets/png.mjs';

/** The webOS build's page, as a `file://` URL. */
const WEBOS_INDEX = pathToFileURL(
  fileURLToPath(new URL('../../apps/webos/dist/index.html', import.meta.url)),
).href;

/** The save's `localStorage` key (the shell's web storage prefixes `core/save`'s `save.v1`). */
const SAVE_KEY = 'shmup-cup:save.v1';

/** webOS remote key codes: the arrows, OK and **Back = 461** (Samsung's is 10009). */
const REMOTE = { left: 37, up: 38, right: 39, down: 40, ok: 13, back: 461 } as const;

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
 * Dispatches a remote key the desktop keyboard does not have, down then up.
 *
 * @param page - The page.
 * @param keyCode - The legacy key code.
 */
async function remoteTap(page: Page, keyCode: number): Promise<void> {
  const send = (type: string): Promise<void> =>
    page.evaluate(
      ([eventType, code]) => {
        const event = new KeyboardEvent(eventType, { bubbles: true, cancelable: true });
        Object.defineProperty(event, 'keyCode', { get: () => code });
        window.dispatchEvent(event);
      },
      [type, keyCode] as const,
    );
  await send('keydown');
  await waitFrames(page, 3);
  await send('keyup');
  await waitFrames(page, 6);
}

/**
 * Collects console errors and page errors.
 *
 * @param page - The page.
 * @returns The (live) error log.
 */
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

/**
 * Opens the webOS build and waits for the title.
 *
 * @param page - The page.
 * @param save - A save document to seed `localStorage` with before boot, or `null`.
 * @returns The console error log.
 */
async function openTitle(page: Page, save: string | null = null): Promise<string[]> {
  const errors = collectErrors(page);
  if (save !== null) {
    // Every `file://` page gets its own origin, so seed the store before the bundle runs.
    await page.addInitScript(
      ([key, text]) => {
        window.localStorage.setItem(key, text);
      },
      [SAVE_KEY, save] as const,
    );
  }
  await page.goto(WEBOS_INDEX);
  const canvas = page.locator('#game');
  await expect(canvas).toHaveAttribute('data-shmup-state', 'running');
  await expect(canvas).toHaveAttribute('data-shmup-scene', 'title');
  await waitFrames(page, 10);
  return errors;
}

test.describe('webOS build (file://)', () => {
  test('boots the one classic script and reaches the title inside the launch rule', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const errors = await openTitle(page);
    const canvas = page.locator('#game');
    const bootMs = Number(await canvas.getAttribute('data-shmup-boot-ms'));
    expect(bootMs).toBeGreaterThan(0);
    expect(bootMs).toBeLessThan(10_000); // shmup_feat.md §23: launch ≤ 10 s
    expect(errors).toEqual([]);
  });

  test('renders a picture, not a blank frame', async ({ page }) => {
    test.setTimeout(120_000);
    const errors = await openTitle(page);
    await waitFrames(page, 20);
    // A screenshot, not `readPixels`: the drawing buffer is not preserved, so reading the GL
    // context after compositing gives a cleared frame on every host.
    const png = await page.locator('#game').screenshot();
    const { data } = decodePng(new Uint8Array(png));
    const colors = new Set<number>();
    for (let i = 0; i < data.length; i += 4) {
      colors.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
    }
    expect(colors.size).toBeGreaterThan(2);
    expect(errors).toEqual([]);
  });

  test('gives Back (461) to the scene flow: the title asks before exiting', async ({ page }) => {
    test.setTimeout(120_000);
    const errors = await openTitle(page);
    const canvas = page.locator('#game');
    // Samsung's Back is not an LG key: 10009 must do nothing here.
    await remoteTap(page, 10009);
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'title');
    await remoteTap(page, REMOTE.back);
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'confirm');
    // NO (the default) closes the dialog and leaves the app running.
    await remoteTap(page, REMOTE.ok);
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'title');
    expect(errors).toEqual([]);
  });

  test('drives the title menu with the remote’s arrows and OK', async ({ page }) => {
    test.setTimeout(120_000);
    const errors = await openTitle(page);
    const canvas = page.locator('#game');
    await remoteTap(page, REMOTE.ok); // PRESS OK → the mode menu
    await remoteTap(page, REMOTE.down);
    await remoteTap(page, REMOTE.down);
    await remoteTap(page, REMOTE.down); // OPTIONS
    await remoteTap(page, REMOTE.ok);
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'options');
    await remoteTap(page, REMOTE.back); // Back leaves the page again
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'title');
    expect(errors).toEqual([]);
  });

  test('ignores a save that names the Tizen remote profile (M3-03 lock-out)', async ({ page }) => {
    test.setTimeout(120_000);
    // The regression against the real bundle: `tizen-remote-safe` binds every required menu
    // action, so only the `hosts` filter keeps it out — and with it applied, Back (461) would be
    // unbound and the player could never leave a screen.
    const errors = await openTitle(
      page,
      JSON.stringify({ version: 1, options: { input: { profileId: 'tizen-remote-safe' } } }),
    );
    const canvas = page.locator('#game');
    await remoteTap(page, REMOTE.back);
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'confirm');
    expect(errors).toEqual([]);
  });
});
