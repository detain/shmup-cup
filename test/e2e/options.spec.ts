/**
 * Browser test of the Options screen and the save (plan M1-17) in headless Chromium, web build:
 * OPTIONS on the title opens the canvas-drawn Options screen (`data-shmup-scene="options"`); a
 * MUSIC change is written to `localStorage` (`shmup-cup:save.v1`) when Esc (Back) closes the
 * screen; after a reload the shell reads the save before the title, so the next change starts from
 * the saved level; the boot time is on the canvas (`data-shmup-boot-ms`).
 */
import { expect, test, type Page } from '@playwright/test';

/** The save's `localStorage` key (the web adapter prefixes `core/save`'s `save.v1`). */
const SAVE_KEY = 'shmup-cup:save.v1';

/**
 * Waits for `frames` animation frames in the page.
 *
 * @param page - The page.
 * @param frames - Frames to wait.
 */
function waitFrames(page: Page, frames: number): Promise<void> {
  return page.evaluate(
    (total) =>
      new Promise<void>((resolve) => {
        let seen = 0;
        const next = (): void => {
          seen++;
          if (seen >= total) resolve();
          else requestAnimationFrame(next);
        };
        requestAnimationFrame(next);
      }),
    frames,
  );
}

/**
 * Presses a key for a few frames, then lets the game see the release.
 *
 * @param page - The page.
 * @param key - Playwright key name.
 */
async function tap(page: Page, key: string): Promise<void> {
  await page.keyboard.down(key);
  await waitFrames(page, 3);
  await page.keyboard.up(key);
  await waitFrames(page, 6);
}

/**
 * The MUSIC level stored in the save, or `null` when nothing is stored.
 *
 * @param page - The page.
 * @returns The level.
 */
async function storedMusic(page: Page): Promise<number | null> {
  const text = await page.evaluate((key) => window.localStorage.getItem(key), SAVE_KEY);
  if (text === null) return null;
  return (JSON.parse(text) as { options: { audio: { music: number } } }).options.audio.music;
}

/**
 * Opens the title, then the Options screen through the title menu.
 *
 * @param page - The page.
 */
async function openOptions(page: Page): Promise<void> {
  const canvas = page.locator('#game');
  await expect(canvas).toHaveAttribute('data-shmup-state', 'running');
  await expect(canvas).toHaveAttribute('data-shmup-scene', 'title');
  await waitFrames(page, 10);
  await tap(page, 'Enter'); // PRESS OK → the menu
  await tap(page, 'ArrowDown'); // OPTIONS
  await tap(page, 'Enter');
  await expect(canvas).toHaveAttribute('data-shmup-scene', 'options');
  await waitFrames(page, 4); // the menu's open lock
}

test.describe('options and saves (web build)', () => {
  test('a MUSIC change is saved on Back and read again after a reload', async ({ page }) => {
    test.setTimeout(120_000);
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('./');
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();
    const canvas = page.locator('#game');
    await openOptions(page);
    const bootMs = Number(await canvas.getAttribute('data-shmup-boot-ms'));
    expect(bootMs).toBeGreaterThan(0);
    expect(bootMs).toBeLessThan(10_000); // shmup_feat.md §23: launch ≤ 10 s
    await tap(page, 'ArrowDown'); // MUSIC
    for (let i = 0; i < 3; i++) await tap(page, 'ArrowLeft'); // 10 → 7
    expect(await storedMusic(page)).toBeNull(); // written when the screen closes
    await tap(page, 'Escape'); // Back: save and close
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'title');
    await expect.poll(() => storedMusic(page)).toBe(7);

    await page.reload();
    await openOptions(page);
    await tap(page, 'ArrowDown'); // MUSIC
    await tap(page, 'ArrowRight'); // from the saved 7, not the default 10
    await tap(page, 'Escape');
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'title');
    await expect.poll(() => storedMusic(page)).toBe(8);
    expect(errors).toEqual([]);
  });
});
