/**
 * Browser test of the colour-blind bullet palettes (plan M2-02, shmup_feat.md §21) in headless
 * Chromium, web build: BULLETS on the Options screen cycles STANDARD → DEUTERANOPIA, Back writes
 * `display.bulletPalette` to the save, and the next boot (`?stage=test-range`, whose turrets,
 * walkers and orbiters fire pink, red and purple bullets) draws the enemy bullets with the
 * pipeline's `<sprite>@deuteranopia` variants — their body colours on screen, the standard
 * palette's gone — with no console error and no "unknown sprite" warning from the atlas; without a
 * save the standard palette shows none of the deuteranopia colours (the control).
 * Screenshots are ×3 (viewport 1152×648): frame pixel (x, y) is screenshot pixel (3x + 1, 3y + 1).
 */
import { expect, test, type Page } from '@playwright/test';
import { decodePng } from '../../scripts/assets/png.mjs';

/** The save's `localStorage` key. */
const SAVE_KEY = 'shmup-cup:save.v1';

/** Body colours of the standard palette (`scripts/assets/procedural/bullets.mjs`). */
const STANDARD = [
  [0xff, 0x5a, 0xa0],
  [0xff, 0x3a, 0x3a],
  [0xb8, 0x4c, 0xff],
] as const;

/**
 * Body colours of the deuteranopia palette (`scripts/assets/procedural/palettes.mjs`): pink,
 * red, purple. The purple is near-white — only the pink and red ones are counted (text and
 * sparkles are white too).
 */
const DEUTERANOPIA = [
  [0xff, 0x8a, 0xd8],
  [0x3a, 0xb0, 0xff],
] as const;

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
 * The stored bullet palette, or `null` when nothing is stored.
 *
 * @param page - The page.
 * @returns The palette name.
 */
async function storedPalette(page: Page): Promise<string | null> {
  const text = await page.evaluate((key) => window.localStorage.getItem(key), SAVE_KEY);
  if (text === null) return null;
  const save = JSON.parse(text) as { options?: { display?: { bulletPalette?: string } } };
  return save.options?.display?.bulletPalette ?? null;
}

/** Playfield pixels of each palette's bullet colours in one screenshot. */
interface PaletteCount {
  /** Pixels of the standard palette's colours. */
  readonly standard: number;
  /** Pixels of the deuteranopia palette's pink / red. */
  readonly deuteranopia: number;
}

/**
 * Samples the canvas at frame-pixel resolution and counts the playfield's bullet colours.
 *
 * @param page - The page.
 * @returns The counts.
 */
async function paletteCount(page: Page): Promise<PaletteCount> {
  const png = await page.locator('#game').screenshot();
  const { width, height, data } = decodePng(new Uint8Array(png));
  const near = (i: number, [r, g, b]: readonly [number, number, number]): boolean =>
    Math.abs(data[i] - r) <= 3 && Math.abs(data[i + 1] - g) <= 3 && Math.abs(data[i + 2] - b) <= 3;
  let standard = 0;
  let deuteranopia = 0;
  for (let fy = 8; fy < 208 && fy * 3 + 1 < height; fy++) {
    for (let fx = 0; fx < 384 && fx * 3 + 1 < width; fx++) {
      const i = ((fy * 3 + 1) * width + fx * 3 + 1) * 4;
      if (STANDARD.some((c) => near(i, c))) standard++;
      if (DEUTERANOPIA.some((c) => near(i, c))) deuteranopia++;
    }
  }
  return { standard, deuteranopia };
}

test.describe('colour-blind bullet palettes (web build)', () => {
  test('BULLETS = DEUTERANOPIA is saved and draws the enemy bullets in that palette', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error' || message.text().startsWith('atlas:')) {
        errors.push(message.text());
      }
    });
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto('./');
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();
    const canvas = page.locator('#game');
    await expect(canvas).toHaveAttribute('data-shmup-state', 'running');
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'title');
    await waitFrames(page, 10);
    await tap(page, 'Enter'); // PRESS OK → the menu
    await tap(page, 'ArrowDown'); // OPTIONS
    await tap(page, 'Enter');
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'options');
    await waitFrames(page, 4);
    for (let i = 0; i < 4; i++) await tap(page, 'ArrowDown'); // MUSIC, SFX, CONTROLS, BULLETS
    await tap(page, 'ArrowRight'); // STANDARD → DEUTERANOPIA
    await tap(page, 'Escape'); // Back: save and close
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'title');
    await expect.poll(() => storedPalette(page)).toBe('deuteranopia');

    // The next boot reads the save before the sprite tables are resolved.
    await page.goto('./?scene=flight&stage=test-range');
    await expect(canvas).toHaveAttribute('data-shmup-state', 'running');
    let seen: PaletteCount | null = null;
    for (let poll = 0; poll < 120 && seen === null; poll++) {
      await waitFrames(page, 20);
      const count = await paletteCount(page);
      if (count.deuteranopia >= 3) seen = count;
    }
    expect(seen, 'no deuteranopia bullet appeared within 2,400 frames').not.toBeNull();
    if (seen === null) return;
    expect(seen.standard).toBe(0);
    expect(errors).toEqual([]);
  });

  test('the standard palette (no save) shows none of the deuteranopia colours', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.goto('./');
    await page.evaluate(() => window.localStorage.clear());
    await page.goto('./?scene=flight&stage=test-range');
    await expect(page.locator('#game')).toHaveAttribute('data-shmup-state', 'running');
    let seen: PaletteCount | null = null;
    for (let poll = 0; poll < 120 && seen === null; poll++) {
      await waitFrames(page, 20);
      const count = await paletteCount(page);
      if (count.standard >= 3) seen = count;
    }
    expect(seen, 'no standard bullet appeared within 2,400 frames').not.toBeNull();
    expect(seen?.deuteranopia).toBe(0);
  });
});
