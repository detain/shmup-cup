/**
 * Browser test of the enemy bullets (plan M1-09) in headless Chromium: `?stage=test-range` runs
 * the dev stage, whose ground turrets, walkers and orbiters start firing once they have
 * scrolled in and settled. Their bullets — the engine's own sprites, interned by the shell's
 * loader and packed into the atlas — must show up in the playfield (never in the HUD bars) in
 * the readability palette's body colours, and move between two screenshots, with no console
 * errors and no "unknown sprite" warning from the atlas. Screenshots are ×3 (viewport
 * 1152×648): frame pixel (x, y) is screenshot pixel (3x + 1, 3y + 1).
 */
import { expect, test, type Page } from '@playwright/test';
import { decodePng } from '../../scripts/assets/png.mjs';

/** Body colours of the bullet readability palette (`scripts/assets/procedural/bullets.mjs`). */
const BULLET_COLOURS = [
  [0xff, 0x5a, 0xa0],
  [0xff, 0x3a, 0x3a],
  [0xb8, 0x4c, 0xff],
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

/** Bullet-coloured pixels of one screenshot. */
interface BulletPixels {
  /** In the playfield (frame rows 8 … 207). */
  readonly playfield: number;
  /** In the HUD bars. */
  readonly hud: number;
  /** `x + 384 · y` of every playfield pixel found. */
  readonly positions: ReadonlySet<number>;
}

/**
 * Samples the canvas at frame-pixel resolution and finds the bullet-coloured pixels.
 *
 * @param page - The page.
 * @returns The pixels found.
 */
async function bulletPixels(page: Page): Promise<BulletPixels> {
  const png = await page.locator('#game').screenshot();
  const { width, height, data } = decodePng(new Uint8Array(png));
  let playfield = 0;
  let hud = 0;
  const positions = new Set<number>();
  for (let fy = 0; fy < 216 && fy * 3 + 1 < height; fy++) {
    for (let fx = 0; fx < 384 && fx * 3 + 1 < width; fx++) {
      const i = ((fy * 3 + 1) * width + fx * 3 + 1) * 4;
      const bullet = BULLET_COLOURS.some(
        ([r, g, b]) =>
          Math.abs(data[i] - r) <= 3 &&
          Math.abs(data[i + 1] - g) <= 3 &&
          Math.abs(data[i + 2] - b) <= 3,
      );
      if (!bullet) continue;
      if (fy < 8 || fy >= 208) {
        hud++;
      } else {
        playfield++;
        positions.add(fx + 384 * fy);
      }
    }
  }
  return { playfield, hud, positions };
}

test.describe('enemy bullets (web build, ?stage=test-range)', () => {
  test('draws the roster`s bullets in the playfield and moves them', async ({ page }) => {
    test.setTimeout(150_000);
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error' || message.text().startsWith('atlas:')) {
        errors.push(message.text());
      }
    });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('./?scene=flight&stage=test-range');
    await expect(page.locator('#game')).toHaveAttribute('data-shmup-state', 'running');

    // The first turret spawns at camera x 500 (≈ 9 s in) and fires once it has scrolled in and
    // settled: poll until its bullets are on screen.
    let first: BulletPixels | null = null;
    for (let poll = 0; poll < 120 && first === null; poll++) {
      await waitFrames(page, 20);
      const pixels = await bulletPixels(page);
      if (pixels.playfield >= 3) first = pixels;
    }
    expect(first, 'no enemy bullet appeared within 2,400 frames').not.toBeNull();
    if (first === null) return;
    expect(first.hud).toBe(0);

    // A few frames later the bullets have moved (≥ 1.25 px/tick): the pixel sets differ.
    await waitFrames(page, 8);
    const second = await bulletPixels(page);
    expect(second.hud).toBe(0);
    const same = [...second.positions].filter((p) => first.positions.has(p)).length;
    expect(same).toBeLessThan(Math.max(first.positions.size, second.positions.size));
    expect(errors).toEqual([]);
  });
});
