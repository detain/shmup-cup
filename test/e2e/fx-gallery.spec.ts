/**
 * Browser test of the fx gallery (plan M1-14) in headless Chromium: `?scene=fx-gallery` on the
 * web build and on the Tizen build opened from disk shows its station label and, within its
 * first stations, the explosion presets — warm fireball pixels (additively blended) in the middle
 * of the playfield — so the gallery screenshot is not blank; no console errors, no atlas
 * warnings. The screenshot is attached to the test report. Screenshots are ×3 (viewport
 * 1152×648): frame pixel (x, y) is screenshot pixel (3x + 1, 3y + 1).
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { decodePng } from '../../scripts/assets/png.mjs';

/** The Tizen build's page, as a `file://` URL. */
const TIZEN_INDEX = pathToFileURL(
  fileURLToPath(new URL('../../apps/tizen/dist/index.html', import.meta.url)),
).href;

/** Colour of the gallery's station label (0x38c8e8), drawn around frame rows 16–23. */
const LABEL = [0x38, 0xc8, 0xe8] as const;

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

/** What one capture shows. */
interface GalleryCapture {
  /** The PNG. */
  readonly png: Buffer;
  /** Warm (fireball) pixels in the playfield's middle (frame x 128–255, y 40–167). */
  readonly warm: number;
  /** Label-coloured pixels on frame rows 14–25. */
  readonly label: number;
  /** Distinct colours in the whole frame. */
  readonly colours: number;
}

/**
 * Screenshots the canvas and measures it.
 *
 * @param page - The page.
 * @returns The capture.
 */
async function capture(page: Page): Promise<GalleryCapture> {
  const png = await page.locator('#game').screenshot();
  const { width, height, data } = decodePng(new Uint8Array(png));
  const at = (fx: number, fy: number): [number, number, number] => {
    const i = ((fy * 3 + 1) * width + fx * 3 + 1) * 4;
    return [data[i], data[i + 1], data[i + 2]];
  };
  let warm = 0;
  let label = 0;
  const colours = new Set<number>();
  for (let fy = 0; fy < 216 && fy * 3 + 1 < height; fy++) {
    for (let fx = 0; fx < 384 && fx * 3 + 1 < width; fx++) {
      const [r, g, b] = at(fx, fy);
      colours.add((r << 16) | (g << 8) | b);
      if (fx >= 128 && fx < 256 && fy >= 40 && fy < 168 && r >= 200 && r - b >= 100) warm++;
      if (
        fy >= 14 &&
        fy < 26 &&
        Math.abs(r - LABEL[0]) <= 3 &&
        Math.abs(g - LABEL[1]) <= 3 &&
        Math.abs(b - LABEL[2]) <= 3
      ) {
        label++;
      }
    }
  }
  return { png, warm, label, colours: colours.size };
}

for (const [name, url] of [
  ['web build', './?scene=fx-gallery'],
  ['Tizen build from disk', `${TIZEN_INDEX}?scene=fx-gallery`],
] as const) {
  test.describe(`fx gallery (${name})`, () => {
    test('shows the station label and non-blank explosions', async ({ page }, testInfo) => {
      test.setTimeout(120_000);
      const errors: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error' || message.text().startsWith('atlas:')) {
          errors.push(message.text());
        }
      });
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(url);
      await expect(page.locator('#game')).toHaveAttribute('data-shmup-state', 'running');
      await waitFrames(page, 5);

      // The first stations are the three explosions (one second each, three bursts per station).
      let best: GalleryCapture | null = null;
      for (let poll = 0; poll < 60 && (best === null || best.warm < 40); poll++) {
        await waitFrames(page, 3);
        const shot = await capture(page);
        if (best === null || shot.warm > best.warm) best = shot;
      }
      if (best === null) throw new Error('no capture');
      await testInfo.attach('fx-gallery', { body: best.png, contentType: 'image/png' });
      expect(best.warm, 'warm explosion pixels in the playfield').toBeGreaterThanOrEqual(40);
      expect(best.label, 'station label pixels').toBeGreaterThan(20);
      expect(best.colours, 'distinct colours').toBeGreaterThan(8);
      expect(errors).toEqual([]);
    });
  });
}
