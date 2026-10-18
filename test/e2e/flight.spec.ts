/**
 * Browser tests of free flight (plan M1-06) in headless Chromium: after the fly-in, holding an
 * arrow key moves the KESTREL — found by its hull colour in canvas screenshots (a pixel diff
 * between captures) — while it stays put without input; holding a direction long enough stops
 * the ship at the playfield margin (the clamp), never over the HUD bars; the same works in the
 * Tizen build opened from disk (remote key codes through the `tizen-remote-safe` profile).
 * Screenshots are at the e2e capture scale (`frame-pixels.ts`; ×2, viewport 1280×720): frame
 * pixel (x, y) is screenshot pixel (sx(x), sy(y)).
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { decodePng } from '../../scripts/assets/png.mjs';
import { freezeSim, stepTo } from './frame-advance.js';
import { HUD_BOTTOM_Y, PLAYFIELD_Y, SCALE } from './frame-pixels.js';
import { BOOT_TIMEOUT_MS } from './ticks.js';

/** The Tizen build's page, as a `file://` URL. */
const TIZEN_INDEX = pathToFileURL(
  fileURLToPath(new URL('../../apps/tizen/dist/index.html', import.meta.url)),
).href;

/** KESTREL hull colour (`ships/kestrel` palette `h`, #c8d0e0) — nothing else uses it. */
const KESTREL_HULL = [0xc8, 0xd0, 0xe0] as const;

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

/** Where the KESTREL's hull colour is on screen, in frame pixels ({@link shipCentre}). */
interface HullView {
  /** The centroid's x. */
  readonly x: number;
  /** The centroid's y. */
  readonly y: number;
  /** The leftmost hull column: the tail. */
  readonly left: number;
  /** The topmost hull row. */
  readonly top: number;
  /** The bottom hull row. */
  readonly bottom: number;
  /** Matching screenshot pixels. */
  readonly pixels: number;
}

/**
 * Screenshots the canvas and finds the pixels in the playfield rows that have the KESTREL's hull
 * colour: their centre, their leftmost column and their top and bottom rows (in frame pixels).
 *
 * @remarks
 * The centroid moves by up to ~1.3 px while the ship stands still: the autofire's muzzle sparks
 * (the `PlayerShot` cue's `muzzle` preset, on the Fx layer above the ship) spawn 9 px ahead of
 * the ship's centre, which since R2-01's ×1.5 art is on the hull's nose (the content's `dx` is
 * still v1's until R2-02 ports it). They fly forward and never reach the tail, nor the hull's top
 * and bottom rows (its fins, at the back): compare those for a position.
 *
 * @param page - The page.
 * @param rows - The frame rows to scan: the first, and the end (excluded). Default: the playfield,
 *   `PLAYFIELD_Y` … `HUD_BOTTOM_Y − 1`.
 * @returns The hull's position and the matching pixel count.
 */
async function shipCentre(
  page: Page,
  rows: readonly [number, number] = [PLAYFIELD_Y, HUD_BOTTOM_Y],
): Promise<HullView> {
  const png = await page.locator('#game').screenshot();
  const { width, height, data } = decodePng(new Uint8Array(png));
  let sumX = 0;
  let sumY = 0;
  let pixels = 0;
  let left = width;
  let top = height;
  let bottom = -1;
  // Playfield = frame rows PLAYFIELD_Y … HUD_BOTTOM_Y − 1 (the HUD bars are outside it); `rows`
  // can widen the scan.
  for (let y = rows[0] * SCALE; y < Math.min(height, rows[1] * SCALE); y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (
        Math.abs(data[i] - KESTREL_HULL[0]) <= 2 &&
        Math.abs(data[i + 1] - KESTREL_HULL[1]) <= 2 &&
        Math.abs(data[i + 2] - KESTREL_HULL[2]) <= 2
      ) {
        sumX += x;
        sumY += y;
        pixels++;
        if (x < left) left = x;
        if (y < top) top = y;
        bottom = y;
      }
    }
  }
  return {
    x: sumX / pixels / SCALE,
    y: sumY / pixels / SCALE,
    left: left / SCALE,
    top: top / SCALE,
    bottom: bottom / SCALE,
    pixels,
  };
}

/**
 * Holds a key for a number of animation frames, then releases it and lets the picture settle.
 *
 * @param page - The page.
 * @param key - Playwright key name.
 * @param frames - Frames to hold it.
 */
async function hold(page: Page, key: string, frames: number): Promise<void> {
  await page.keyboard.down(key);
  await waitFrames(page, frames);
  await page.keyboard.up(key);
  await waitFrames(page, 5);
}

/**
 * Holds a key for an exact number of ticks of a frozen sim ({@link freezeSim}), then releases it
 * and runs a few more ticks, so the ship has stopped and the canvas shows it.
 *
 * @param page - The page (frozen).
 * @param key - Playwright key name.
 * @param ticks - Ticks to hold it.
 */
async function holdTicks(page: Page, key: string, ticks: number): Promise<void> {
  const now = await page.evaluate(
    () => (window as unknown as { __shmupDebug: { worldTick: number } }).__shmupDebug.worldTick,
  );
  await page.keyboard.down(key);
  await stepTo(page, now + ticks);
  await page.keyboard.up(key);
  await stepTo(page, now + ticks + 5);
}

test.describe('free flight (web build)', () => {
  test('arrow keys move the KESTREL; without input it stays put', async ({ page }) => {
    test.setTimeout(90_000);
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('./?scene=flight');
    await expect(page.locator('#game')).toHaveAttribute('data-shmup-state', 'running', {
      timeout: BOOT_TIMEOUT_MS,
    });
    // Exact ticks, not rAF frames (conventions: a capture compared with another a known time
    // later), and the hull's tail edges, not its centroid (`shipCentre`: the muzzle sparks).
    await freezeSim(page);
    await stepTo(page, 60); // the 40-tick fly-in is over

    const start = await shipCentre(page);
    expect(start.pixels).toBeGreaterThan(20);
    await stepTo(page, 80);
    const idle = await shipCentre(page);
    expect(idle.left).toBe(start.left);
    expect(idle.top).toBe(start.top);
    expect(idle.bottom).toBe(start.bottom);

    // 1.5 px/tick at speed level 0 (the content's, unported until R2-02): 30 ticks = 45 px.
    await holdTicks(page, 'ArrowRight', 30);
    const right = await shipCentre(page);
    expect(right.left - idle.left).toBeGreaterThan(20);
    expect(right.top).toBe(idle.top);

    // 20 ticks = 30 px up. The top row: the banking-up frame redraws only the lower half.
    await holdTicks(page, 'ArrowUp', 20);
    const up = await shipCentre(page);
    expect(up.top - right.top).toBeLessThan(-12);
    expect(Math.abs(up.left - right.left)).toBeLessThan(2);

    expect(errors).toEqual([]);
  });

  test('holding a direction stops the ship at the playfield margin, clear of the HUD', async ({
    page,
  }) => {
    // Five canvas captures: ~55 s on a CI runner's SwiftShader when this counted rAF frames, over
    // the 60 s default under load (the M1-10/M1-11 CI flakes).
    test.setTimeout(120_000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('./?scene=flight');
    await expect(page.locator('#game')).toHaveAttribute('data-shmup-state', 'running', {
      timeout: BOOT_TIMEOUT_MS,
    });
    // Exact ticks, not rAF frames (conventions: a capture compared with another a known time
    // later): held for frames, the ship could still be a tick short of the margin under load and
    // read 0.9 px "unpinned" (a CI flake at 640×360).
    await freezeSim(page);
    await stepTo(page, 60); // the 40-tick fly-in is over

    // Left: 64 px from the fly-in end to the 8 px margin at 1.5 px/tick ≈ 43 ticks; hold 100.
    await holdTicks(page, 'ArrowLeft', 100);
    const left = await shipCentre(page);
    await holdTicks(page, 'ArrowLeft', 30);
    const stillLeft = await shipCentre(page);
    expect(left.pixels).toBeGreaterThan(20);
    expect(Math.abs(stillLeft.x - left.x)).toBeLessThan(0.5); // pinned
    expect(left.x).toBeLessThan(16); // the hull sits around the ship centre (x = 8)

    // Up: from mid-playfield to the 6 px top margin at 1.5 px/tick (≈ 108 ticks from the 168 of
    // 640×360, ≈ 63 from the 100 of 384×216); hold 160.
    await holdTicks(page, 'ArrowUp', 160);
    // Rows 0 … HUD_BOTTOM_Y − 1: the top HUD bar included, the bottom bar's stock icons (same
    // hull colour) left out.
    const top = await shipCentre(page, [0, HUD_BOTTOM_Y]);
    await holdTicks(page, 'ArrowUp', 30);
    const stillTop = await shipCentre(page, [0, HUD_BOTTOM_Y]);
    expect(Math.abs(stillTop.y - top.y)).toBeLessThan(0.5); // pinned
    // Screen y of the ship centre = PLAYFIELD_Y + margin 6 (18 at 640×360, the content's margin
    // unported until R2-02; 14 at 384×216); no hull pixel in the HUD bar.
    expect(top.y).toBeGreaterThan(PLAYFIELD_Y);
    expect(top.y).toBeLessThan(PLAYFIELD_Y + 12);
    const inHud = await shipCentre(page, [0, PLAYFIELD_Y]);
    expect(inHud.pixels).toBe(0);

    expect(errors).toEqual([]);
  });
});

test.describe('free flight (Tizen build via file://)', () => {
  test('remote arrow keys move the KESTREL', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(TIZEN_INDEX + '?scene=flight');
    await expect(page.locator('#game')).toHaveAttribute('data-shmup-state', 'running', {
      timeout: BOOT_TIMEOUT_MS,
    });
    await waitFrames(page, 60);
    const start = await shipCentre(page);
    expect(start.pixels).toBeGreaterThan(20);
    await hold(page, 'ArrowRight', 30);
    const right = await shipCentre(page);
    expect(right.x - start.x).toBeGreaterThan(20);
    await hold(page, 'ArrowDown', 20);
    const down = await shipCentre(page);
    expect(down.y - right.y).toBeGreaterThan(12);
    expect(errors).toEqual([]);
  });
});
