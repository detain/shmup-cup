/**
 * Browser tests of the image-surface stills (plan v20x A4) on the web test build: numeric pixel
 * probes only (decodePng sampling through `frame-pixels.ts`, never an image comparison). Four
 * claims:
 *
 * 1. the ending scene shows its approved painting **behind** the sprite art (the world band):
 *    the top rows of the frame — above the water (y 24), the surface strip (y 20) and every
 *    citadel sprite (y ≥ 102) — hold the served PNG's own pixels, pixel-exact (the still is a
 *    640×360 texture on a 640×360 frame, sampled at 1:1), while the same ending on a
 *    `?nostills=1` page draws the procedural backdrop instead,
 * 2. the manifest swap is real: re-opening another ending loads *its* file (different aspect →
 *    different pad geometry — the probe points move with the PNG, not with a hard-coded colour),
 * 3. the release law holds: leaving the ending hides and closes the surface (the attribute reads
 *    `none`, the title draws residue-free against a `?nostills=1` title at the same tick) and
 *    re-entering re-derives the picture from a fresh fetch,
 * 4. the switches: `?still=<id>` forces a named surface over the ending table (the spec's hook,
 *    the `?video=` precedent) and `?nostills=1` beats the probe — off costs nothing.
 *
 * Every wait that concerns scene state freezes the sim and steps it (`frame-advance.ts`,
 * `openEnding`/`stepScene` from `zone-helpers.ts` — the ending-kit the zone specs share); the
 * still's own arrival is a decode and a draw, so the attribute poll is wall time (media law,
 * R7-VID — on this host a decoded frame is not a game tick). The whole file skips when the build
 * carries no stills — the director degrades silently without them, exactly as designed.
 */
import { expect, test, type Page } from '@playwright/test';
import { decodePng } from '../../scripts/assets/png.mjs';
import { FRAME_H, FRAME_W, pixelIndex } from './frame-pixels.js';
import { gameTick } from './ticks.js';
import { open, openEnding, stepScene, watchErrors } from './zone-helpers.js';

/** A decoded screenshot (or shipped PNG): RGBA bytes and the row stride. */
interface Shot {
  data: Uint8Array;
  width: number;
}

/** One probed frame point. */
interface Probe {
  readonly x: number;
  readonly y: number;
}

/** The five shared top-row probes (y 4…16: water starts at 24, the surface at 20, citadelY 102). */
const TOP_ROW: readonly Probe[] = [
  { x: 16, y: 8 },
  { x: 64, y: 6 },
  { x: 320, y: 10 },
  { x: 576, y: 14 },
  { x: 624, y: 6 },
];

/**
 * Collects console errors and page errors.
 *
 * @param page - The page.
 * @returns The list (filled as they happen).
 */
function trackErrors(page: Page): string[] {
  return watchErrors(page);
}

/**
 * Skips the test when the served build carries no stills (the encode kit's output is derived —
 * a host that shipped without it runs the game exactly as before this feature).
 *
 * @param page - Any page (the request goes to the preview server).
 * @param file - The still file under `assets/stills/`.
 * @returns Whether the file exists.
 */
async function hasStill(page: Page, file: string): Promise<boolean> {
  const response = await page.request.get(`assets/stills/${file}`);
  return response.ok();
}

/**
 * The served PNG bytes of one shipped still, decoded (the exact file the game fetches).
 *
 * @param page - Any page.
 * @param file - The still file.
 * @returns The decoded image.
 */
async function stillPng(page: Page, file: string): Promise<Shot> {
  const response = await page.request.get(`assets/stills/${file}`);
  const bytes = new Uint8Array(await response.body());
  const { data, width } = decodePng(bytes);
  return { data, width };
}

/**
 * Captures the canvas as decoded RGBA (the video spec's helper, local like the video's).
 *
 * @param page - The page.
 * @returns The pixels.
 */
async function shot(page: Page): Promise<Shot> {
  const png = await page.locator('#game').screenshot();
  const { data, width } = decodePng(new Uint8Array(png));
  return { data, width };
}

/**
 * The director's canvas mirror (the boot writes `data-shmup-still` on every change; an unwritten
 * attribute reads as `'none'`).
 *
 * @param page - The page.
 * @returns The attribute value or `null` before the first write.
 */
function stillAttribute(page: Page): Promise<string | null> {
  return page.evaluate(
    () => document.querySelector('#game')?.getAttribute('data-shmup-still') ?? null,
  );
}

/**
 * Waits for the director's canvas mirror to name a still (`'none'` for nothing shown).
 *
 * @param page - The booted page.
 * @param still - The expected id, or `'none'`.
 */
async function waitForStill(page: Page, still: string): Promise<void> {
  await expect
    .poll(
      async () => {
        const value = await stillAttribute(page);
        return value === null ? 'none' : value;
      },
      { timeout: 20_000 },
    )
    .toBe(still);
}

/**
 * The RGB of one frame point of a shot.
 *
 * @param image - The decoded image.
 * @param x - Frame x.
 * @param y - Frame y.
 * @returns `[r, g, b]`.
 */
function px(image: Shot, x: number, y: number): [number, number, number] {
  // 2026-10-27 (v20x A4 e2e fix): the `pixelIndex` centre-block law (`2x+1`) is for the
  // ×2 CAPTURE_SCALE SCREENSHOT only. The shipped stills are NATIVE 640×360 (scale 1), so
  // applying it to a decoded PNG wrapped the sample into the next row (probe (320,8) read
  // PNG col 641 → row 18 col 1) — a spec-side mis-model, proven by `a4a-e2e-debug2.log`:
  // the canvas matched the PNG pixel-for-pixel at every probe. The scale now derives from
  // the image itself, and both sides land on the same frame pixel.
  const scale = image.width / FRAME_W;
  const i = scale === 2 ? pixelIndex(image.width, x, y) : (y * image.width + x) * 4;
  return [image.data[i], image.data[i + 1], image.data[i + 2]];
}

/**
 * The RGB-sum difference of two images at the probe points.
 *
 * @param a - The first image.
 * @param b - The second image.
 * @param probes - The points.
 * @returns The per-point differences.
 */
function pxDiff(a: Shot, b: Shot, probes: readonly Probe[]): number[] {
  const out: number[] = [];
  for (const p of probes) {
    const x = px(a, p.x, p.y);
    const y = px(b, p.x, p.y);
    out.push(Math.abs(x[0] - y[0]) + Math.abs(x[1] - y[1]) + Math.abs(x[2] - y[2]));
  }
  return out;
}

/**
 * Compares two canvas shots on a frame-pixel grid (every sixth pixel inside the frame — the
 * video spec's grid measure, local like the video's helpers).
 *
 * @param a - The first shot.
 * @param b - The second shot.
 * @returns The mean absolute RGB-sum difference per sample and the share of differing samples.
 */
function gridDiff(a: Shot, b: Shot): { mean: number; share: number } {
  let sum = 0;
  let changed = 0;
  let n = 0;
  for (let fy = 4; fy < FRAME_H - 4; fy += 6) {
    for (let fx = 4; fx < FRAME_W - 4; fx += 6) {
      const i = pixelIndex(a.width, fx, fy);
      const j = pixelIndex(b.width, fx, fy);
      const d =
        Math.abs(a.data[i] - b.data[j]) +
        Math.abs(a.data[i + 1] - b.data[j + 1]) +
        Math.abs(a.data[i + 2] - b.data[j + 2]);
      sum += d;
      if (d > 0) changed++;
      n++;
    }
  }
  return { mean: sum / n, share: changed / n };
}

/**
 * Waits for `frames` animation frames in the page (the draw behind a screenshot).
 *
 * @param page - The page.
 * @param frames - Frames to wait.
 * @returns Resolves once they were shown.
 */
async function rafFrames(page: Page, frames: number): Promise<void> {
  await page.evaluate(
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
 * Steps both frozen pages to the same absolute game tick, so any two captures compare the same
 * drawn frame (the title's art is a function of the tick — the video spec's rule).
 *
 * @param pages - The frozen pages.
 * @returns The tick both pages now show.
 */
async function syncToSameTick(pages: readonly Page[]): Promise<number> {
  const ticks = await Promise.all(pages.map((page) => gameTick(page)));
  const target = Math.max(...ticks) + 20;
  for (const page of pages) {
    await page.evaluate((goal) => {
      const api = (
        window as unknown as {
          __shmupDebug: { tick: number; game: { requestStep(n: number): void } };
        }
      ).__shmupDebug;
      if (api.tick < goal) api.game.requestStep(goal - api.tick);
    }, target);
    await page.waitForFunction(
      (goal) => (window as unknown as { __shmupDebug: { tick: number } }).__shmupDebug.tick >= goal,
      target,
    );
  }
  for (const page of pages) await rafFrames(page, 2);
  return target;
}

/**
 * Leaves the ending scene back to the title through the debug flow handle (the release path the
 * player walks by pressing through the credits — shortened to the stack reset the ending kit's
 * `openEnding` itself uses).
 *
 * @param page - The ending page.
 */
async function backToTitle(page: Page): Promise<void> {
  await page.evaluate(() => {
    const scenes = (
      window as unknown as {
        __shmupDebug: {
          game: {
            scenes: { stack: { reset(s: unknown): void }; title: unknown };
            requestStep(n: number): void;
          };
        };
      }
    ).__shmupDebug.game;
    scenes.scenes.stack.reset(scenes.scenes.title);
    scenes.requestStep(2);
  });
  await expect(page.locator('#game')).toHaveAttribute('data-shmup-scene', 'title');
}

test.describe('image-surface stills (web build)', () => {
  test('the ending shows its painting behind the scene art, swaps files, and releases on leave', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    if (
      !(await hasStill(page, 'ending-citadel-falls.png')) ||
      !(await hasStill(page, 'ending-throne-is-broken.png'))
    ) {
      test.skip(true, 'this build carries no stills — the game ships without the feature');
      return;
    }
    const errors = trackErrors(page);
    const plain = await page.context().newPage();
    const errorsPlain = trackErrors(plain);

    // — the citadel's painting rides the world band: the top rows are the PNG, pixel-exact.
    await open(page, './');
    await openEnding(page, 'citadel', 0);
    await waitForStill(page, 'ending-citadel-falls');
    await stepScene(page, 30);
    const citadel = await stillPng(page, 'ending-citadel-falls.png');
    const shown = await shot(page);
    expect(pxDiff(shown, citadel, TOP_ROW)).toEqual([0, 0, 0, 0, 0]);

    // — the same ending without the feature draws its procedural backdrop there instead
    //   (PALETTE.space 0x10173a against the painting's letterbox pad 0x05070f): a real picture,
    //   not a cache artefact, and the sprite art above the still is untouched either way.
    await open(plain, './?nostills=1');
    await openEnding(plain, 'citadel', 0);
    await stepScene(plain, 30);
    const before = await shot(plain);
    expect(await stillAttribute(plain)).toBeNull(); // the switch: never a write, never a load
    for (const d of pxDiff(shown, before, TOP_ROW)) expect(d).toBeGreaterThan(20);
    // The mid-frame differs too (grid over the painted band vs the navy backdrop).
    const grid = gridDiff(shown, before);
    expect(grid.share).toBeGreaterThan(0.15);
    expect(grid.mean).toBeGreaterThan(2);

    // — swap: another ending loads ANOTHER file (different aspect → the pads move to columns;
    //   the probes below are the PNG's own left pad column, its content centre and its right).
    await openEnding(page, 'throne', 0);
    await waitForStill(page, 'ending-throne-is-broken');
    await stepScene(page, 30);
    const throne = await stillPng(page, 'ending-throne-is-broken.png');
    const swapped = await shot(page);
    const throneProbes: readonly Probe[] = [
      { x: 16, y: 8 },
      { x: 40, y: 12 },
      { x: 320, y: 8 },
      { x: 600, y: 10 },
      { x: 624, y: 14 },
    ];
    expect(pxDiff(swapped, throne, throneProbes)).toEqual([0, 0, 0, 0, 0]);
    // The old painting's probe is gone where the new file paints something else (a swap never
    // leaves the previous picture behind): the two files must genuinely differ at (320, 8)
    // before the non-equality below proves anything.
    expect(pxDiff(citadel, throne, [{ x: 320, y: 8 }])[0]).toBeGreaterThan(0);
    expect(pxDiff(swapped, citadel, [{ x: 320, y: 8 }])[0]).toBeGreaterThan(0);

    // — release: leaving the ending closes the surface (attribute `none`) and the title draws
    //   residue-free (the two pages frozen to the same tick compare as the video spec's rule).
    await backToTitle(page);
    await waitForStill(page, 'none');
    await plain.reload();
    await open(plain, './?nostills=1'); // a title-page baseline that never loaded a still
    await syncToSameTick([page, plain]);
    const releasedShot = await shot(page);
    const plainShot = await shot(plain);
    const residue = gridDiff(releasedShot, plainShot);
    expect(residue.mean, 'the hidden still must leave no pixels behind').toBeLessThan(1.5);
    expect(residue.share).toBeLessThan(0.05);

    // — re-entry re-derives the picture from a fresh fetch (the texture was destroyed, the
    //   bitmap closed — showing again means the whole cold path ran a second time).
    await openEnding(page, 'citadel', 0);
    await waitForStill(page, 'ending-citadel-falls');
    await stepScene(page, 30);
    const again = await shot(page);
    expect(pxDiff(again, citadel, TOP_ROW)).toEqual([0, 0, 0, 0, 0]);

    expect(errors, 'the stills page must not log errors').toEqual([]);
    expect(errorsPlain, 'the plain page must not log errors').toEqual([]);
    await plain.close();
  });

  test('the ?still= probe forces a surface; ?nostills=1 beats it', async ({ page }) => {
    test.setTimeout(120_000);
    if (!(await hasStill(page, 'ending-deep-is-still.png'))) {
      test.skip(true, 'this build carries no stills — the game ships without the feature');
      return;
    }
    const errors = trackErrors(page);

    // The probe forces the DEEP painting while the CITADEL ending runs (the table would name
    // ending-citadel-falls): the picture is the probe's file, pixel-exact at the top rows.
    await open(page, './?still=ending-deep-is-still');
    await openEnding(page, 'citadel', 0);
    await waitForStill(page, 'ending-deep-is-still');
    await stepScene(page, 30);
    const deep = await stillPng(page, 'ending-deep-is-still.png');
    const forced = await shot(page);
    expect(pxDiff(forced, deep, TOP_ROW)).toEqual([0, 0, 0, 0, 0]);

    // The kill switch wins over the probe: nothing is fetched, nothing is written, the top rows
    // stay the procedural backdrop of the ending (PALETTE.space).
    const plain = await page.context().newPage();
    const errorsPlain = trackErrors(plain);
    await open(plain, './?nostills=1&still=ending-deep-is-still');
    await openEnding(plain, 'citadel', 0);
    await stepScene(plain, 30);
    expect(await stillAttribute(plain)).toBeNull();
    const off = await shot(plain);
    // (320, 10) is the painting's letterbox pad there and the navy backdrop here.
    expect(pxDiff(off, deep, [{ x: 320, y: 10 }])[0]).toBeGreaterThan(20);

    expect(errors).toEqual([]);
    expect(errorsPlain).toEqual([]);
    await plain.close();
  });
});
