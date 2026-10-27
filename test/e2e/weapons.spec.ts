/**
 * Browser test of the player weapons (plan M1-10) in headless Chromium: in free flight the
 * KESTREL autofires its Type A main shot — the `shots/basic` sprites must show up in the playfield
 * to the right of the ship and move between two screenshots — and `?loadout=full` (the web-only
 * dev override) draws the Options (`options/orb`, an engine sprite) and laser beams, with no
 * console errors and no "unknown sprite" warning from the atlas. The Tizen build opened from disk
 * autofires too without any key (remote rule 1) and ignores the web-only `?loadout=full`.
 * Screenshots are at the e2e capture scale (`frame-pixels.ts`; ×2, viewport 1280×720): frame
 * pixel (x, y) is screenshot pixel (sx(x), sy(y)).
 *
 * The polls' intervals count the game's ticks (`ticks.ts`), never rAF frames (C5 review 4): a
 * runner drawing about 3 frames a second runs up to 4 ticks a frame.
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { decodePng } from '../../scripts/assets/png.mjs';
import { FRAME_H, FRAME_W, HUD_BOTTOM_Y, PLAYFIELD_Y, pixelIndex, sx, sy } from './frame-pixels.js';
import { BOOT_TIMEOUT_MS, waitTicks } from './ticks.js';

/** The Tizen build's page, as a `file://` URL. */
const TIZEN_INDEX = pathToFileURL(
  fileURLToPath(new URL('../../apps/tizen/dist/index.html', import.meta.url)),
).href;

/** `shots/basic` body colour (w15-REING-6 gen6 real art, #0374d3) — nothing else uses it. */
const SHOT_RIM = [0x03, 0x74, 0xd3] as const;
/**
 * `shots/laser`'s bolt lights (w15-REING-6 gen6 real art — the cyan ramp and its core).
 * Every one belongs to `shots/laser` alone (censed over the whole v2 atlas); a bolt shows
 * ~2 px of each, so the beam census sums them. The ramp's `#7ff9ff` is deliberately absent:
 * the sampler's ±3 window reaches `shots/basic`'s `#81f8ff` tip from it, which would poison
 * the default-loadout negative test with the basic bolts' own glow.
 */
const LASER_LIGHTS: readonly (readonly [number, number, number])[] = [
  [0xd7, 0xfb, 0xff],
  [0x93, 0xfb, 0xff],
  [0xec, 0xfa, 0xff],
  [0x04, 0xae, 0xc3],
];
/** `options/orb` body colour (w15-REING-11 gen11 art, #a9021a). */
const OPTION_BODY = [0xa9, 0x02, 0x1a] as const;
/** KESTREL deck colour (`ships/kestrel` w15-REING-11 gen11 art, #909bd8). */
const KESTREL_HULL = [0x90, 0x9b, 0xd8] as const;

/** Frame pixels of one colour in the playfield. */
interface ColourPixels {
  /** How many. */
  readonly count: number;
  /** In the HUD bars (should stay 0). */
  readonly hud: number;
  /** Smallest frame x (Infinity when none). */
  readonly minX: number;
  /** `x + FRAME_W · y` of every playfield pixel found. */
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
  for (let fy = 0; fy < FRAME_H && sy(fy) < height; fy++) {
    for (let fx = 0; fx < FRAME_W && sx(fx) < width; fx++) {
      const i = pixelIndex(width, fx, fy);
      colours.forEach(([r, g, b], k) => {
        if (
          Math.abs(data[i] - r) > 3 ||
          Math.abs(data[i + 1] - g) > 3 ||
          Math.abs(data[i + 2] - b) > 3
        ) {
          return;
        }
        const found = out[k];
        if (fy < PLAYFIELD_Y || fy >= HUD_BOTTOM_Y) {
          found.hud++;
          return;
        }
        found.count++;
        found.minX = Math.min(found.minX, fx);
        found.positions.add(fx + FRAME_W * fy);
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
    await page.goto('./?scene=flight');
    await expect(page.locator('#game')).toHaveAttribute('data-shmup-state', 'running', {
      timeout: BOOT_TIMEOUT_MS,
    });
    // The 40-tick fly-in, then autofire.
    let first: ColourPixels[] | null = null;
    for (let poll = 0; poll < 60 && first === null; poll++) {
      await waitTicks(page, 10);
      const pixels = await findColours(page, [SHOT_RIM, KESTREL_HULL]);
      if (pixels[0].count >= 2 && pixels[1].count > 0) first = pixels;
    }
    expect(first, 'no shot appeared within 600 ticks').not.toBeNull();
    if (first === null) return;
    const [shots, hull] = first;
    expect(shots.hud).toBe(0);
    expect(shots.minX).toBeGreaterThan(hull.minX);
    // A few ticks later the shots have moved (7 px/tick): the pixel sets differ (polled, up to ten
    // captures).
    let moved = false;
    for (let poll = 0; poll < 10 && !moved; poll++) {
      await waitTicks(page, 4);
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
    await page.goto('./?scene=flight&loadout=full');
    await expect(page.locator('#game')).toHaveAttribute('data-shmup-state', 'running', {
      timeout: BOOT_TIMEOUT_MS,
    });
    let found: ColourPixels[] | null = null;
    let bestOrbs = 0;
    let bestBeams = 0;
    for (let poll = 0; poll < 60 && found === null; poll++) {
      await waitTicks(page, 10);
      const pixels = await findColours(page, [OPTION_BODY, ...LASER_LIGHTS]);
      const beams = pixels.slice(1).reduce((a, b) => a + b.count, 0);
      const beamHud = pixels.slice(1).reduce((a, b) => a + b.hud, 0);
      bestOrbs = Math.max(bestOrbs, pixels[0].count);
      bestBeams = Math.max(bestBeams, beams);
      // Orbs show their crimson body (some may still trail off screen, left, after the
      // fly-in); a full beam ≥ 24 light pixels — the gen6 bolt is thinner than the interim
      // map's, so the census counts the whole cyan ramp (≈ 8 px a bolt, several afield).
      if (pixels[0].count >= 8 && beams >= 24)
        found = [pixels[0], { ...pixels[1], count: beams, hud: beamHud }];
    }
    expect(
      found,
      `no Options and lasers within 600 ticks (best orbs ${bestOrbs}, best beams ${bestBeams})`,
    ).not.toBeNull();
    if (found === null) return;
    expect(found[0].hud).toBe(0);
    expect(found[1].hud).toBe(0);
    expect(errors).toEqual([]);
  });
});

test.describe('player weapons (Tizen build via file://)', () => {
  test('autofires with no key held and ignores the web-only ?loadout=full', async ({ page }) => {
    test.setTimeout(90_000);
    const errors = collectErrors(page);
    await page.goto(TIZEN_INDEX + '?scene=flight&loadout=full');
    await expect(page.locator('#game')).toHaveAttribute('data-shmup-state', 'running', {
      timeout: BOOT_TIMEOUT_MS,
    });
    let found: ColourPixels[] | null = null;
    for (let poll = 0; poll < 60 && found === null; poll++) {
      await waitTicks(page, 10);
      const pixels = await findColours(page, [SHOT_RIM, KESTREL_HULL]);
      if (pixels[0].count >= 2 && pixels[1].count > 0) found = pixels;
    }
    expect(found, 'no shot appeared within 600 ticks').not.toBeNull();
    if (found === null) return;
    expect(found[0].hud).toBe(0);
    expect(found[0].minX).toBeGreaterThan(found[1].minX);
    // Still the default loadout: no Options, no laser beams, ever.
    for (let poll = 0; poll < 3; poll++) {
      await waitTicks(page, 10);
      const pixels = await findColours(page, [OPTION_BODY, ...LASER_LIGHTS]);
      expect(pixels[0].count + pixels[0].hud).toBe(0);
      expect(pixels.slice(1).reduce((a, b) => a + b.count + b.hud, 0)).toBe(0);
    }
    expect(errors).toEqual([]);
  });
});
