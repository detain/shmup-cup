/**
 * Browser test of the player weapons (plan M1-10) in headless Chromium: in free flight the
 * KESTREL autofires its Type A main shot — the `shots/basic` sprites must show up in the playfield
 * to the right of the ship and move between two screenshots — and `?loadout=full` (the web-only
 * dev override) draws the Options (`options/orb`, an engine sprite) and laser beams, with no
 * console errors and no "unknown sprite" warning from the atlas. Screenshots are ×3 (viewport
 * 1152×648): frame pixel (x, y) is screenshot pixel (3x + 1, 3y + 1).
 */
import { expect, test, type Page } from '@playwright/test';
import { decodePng } from '../../scripts/assets/png.mjs';

/** `shots/basic` rim colour (palette `b`, #1e5a9a) — nothing else on screen uses it. */
const SHOT_RIM = [0x1e, 0x5a, 0x9a] as const;
/** `shots/laser` body colour (palette `c`, #9fe8ff). */
const LASER_BODY = [0x9f, 0xe8, 0xff] as const;
/** `options/orb` body colour (palette `r`, #e83838). */
const OPTION_BODY = [0xe8, 0x38, 0x38] as const;
/** KESTREL hull colour (`ships/kestrel` palette `h`, #c8d0e0). */
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

/** Frame pixels of one colour in the playfield. */
interface ColourPixels {
  /** How many. */
  readonly count: number;
  /** In the HUD bars (should stay 0). */
  readonly hud: number;
  /** Smallest frame x (Infinity when none). */
  readonly minX: number;
  /** `x + 384 · y` of every playfield pixel found. */
  readonly positions: ReadonlySet<number>;
}

/**
 * Samples the canvas at frame-pixel resolution and finds the pixels of each colour.
 *
 * @param page - The page.
 * @param colours - The colours to look for.
 * @returns One result per colour.
 */
async function findColours(
  page: Page,
  colours: readonly (readonly [number, number, number])[],
): Promise<ColourPixels[]> {
  const png = await page.locator('#game').screenshot();
  const { width, height, data } = decodePng(new Uint8Array(png));
  const out = colours.map(() => ({
    count: 0,
    hud: 0,
    minX: Infinity,
    positions: new Set<number>(),
  }));
  for (let fy = 0; fy < 216 && fy * 3 + 1 < height; fy++) {
    for (let fx = 0; fx < 384 && fx * 3 + 1 < width; fx++) {
      const i = ((fy * 3 + 1) * width + fx * 3 + 1) * 4;
      colours.forEach(([r, g, b], k) => {
        if (
          Math.abs(data[i] - r) > 3 ||
          Math.abs(data[i + 1] - g) > 3 ||
          Math.abs(data[i + 2] - b) > 3
        ) {
          return;
        }
        const found = out[k];
        if (fy < 8 || fy >= 208) {
          found.hud++;
          return;
        }
        found.count++;
        found.minX = Math.min(found.minX, fx);
        found.positions.add(fx + 384 * fy);
      });
    }
  }
  return out;
}

/**
 * Collects console errors and atlas warnings of a page.
 *
 * @param page - The page.
 * @returns The (live) list.
 */
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.text().startsWith('atlas:')) {
      errors.push(message.text());
    }
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

test.describe('player weapons (web build)', () => {
  test('the KESTREL autofires its main shot to the right, and the shots move', async ({ page }) => {
    test.setTimeout(90_000);
    const errors = collectErrors(page);
    await page.goto('./');
    await expect(page.locator('#game')).toHaveAttribute('data-shmup-state', 'running');
    // The 40-tick fly-in, then autofire.
    let first: ColourPixels[] | null = null;
    for (let poll = 0; poll < 60 && first === null; poll++) {
      await waitFrames(page, 10);
      const pixels = await findColours(page, [SHOT_RIM, KESTREL_HULL]);
      if (pixels[0].count >= 2 && pixels[1].count > 0) first = pixels;
    }
    expect(first, 'no shot appeared within 600 frames').not.toBeNull();
    if (first === null) return;
    const [shots, hull] = first;
    expect(shots.hud).toBe(0);
    expect(shots.minX).toBeGreaterThan(hull.minX);
    // A few frames later the shots have moved (7 px/tick): the pixel sets differ. Poll, so a
    // loaded machine that runs fewer ticks per frame still gets there.
    let moved = false;
    for (let poll = 0; poll < 10 && !moved; poll++) {
      await waitFrames(page, 4);
      const [later] = await findColours(page, [SHOT_RIM]);
      const same = [...later.positions].filter((p) => shots.positions.has(p)).length;
      moved = same < Math.max(shots.positions.size, later.positions.size);
    }
    expect(moved).toBe(true);
    expect(errors).toEqual([]);
  });

  test('?loadout=full draws the Options and laser beams', async ({ page }) => {
    test.setTimeout(90_000);
    const errors = collectErrors(page);
    await page.goto('./?loadout=full');
    await expect(page.locator('#game')).toHaveAttribute('data-shmup-state', 'running');
    let found: ColourPixels[] | null = null;
    for (let poll = 0; poll < 60 && found === null; poll++) {
      await waitFrames(page, 10);
      const pixels = await findColours(page, [OPTION_BODY, LASER_BODY]);
      // Orbs show their red body (some may still trail off screen, left, after the fly-in); a
      // full beam ≥ 64 pixels (its top and bottom rows).
      if (pixels[0].count >= 8 && pixels[1].count >= 64) found = pixels;
    }
    expect(found, 'no Options and lasers within 600 frames').not.toBeNull();
    if (found === null) return;
    expect(found[0].hud).toBe(0);
    expect(found[1].hud).toBe(0);
    expect(errors).toEqual([]);
  });
});
