/**
 * Browser tests of the cutscene video surface (v2 R7-VID) on the web test build: numeric pixel
 * probes only (decodePng sampling through `frame-pixels.ts`, never an image comparison). Three
 * claims:
 *
 * 1. the `?video=` probe draws a full-frame quad (moved to the screen band, where the title's
 *    opaque backdrop cannot cover it — the band law the manifest encodes), and the quad keeps
 *    pulling decoded frames **while the simulation is frozen** (the media runs on wall time, the
 *    sim never gates it — and nothing on screen moves except the video),
 * 2. a clip that ends by itself leaves the title pixel-identical to a video-less title at the
 *    same game tick (the quad clears with no residue — the two pages are frozen and stepped to
 *    the same tick, so the only difference any frame could carry is the media),
 * 3. ticks keep flowing with a clip playing (the sim never waits on media: the video page's tick
 *    progress stays near the plain page's under the same wall time, however slow the software
 *    decode is).
 *
 * Every wait that concerns the media itself is wall time on purpose (a decoded frame is not a
 * game tick); every wait that concerns scene state counts game ticks (`ticks.ts`) or freezes and
 * steps the sim (`frame-advance.ts`). The whole file skips when the build carries no clips — a
 * machine without ffmpeg encodes none (`scripts/v20x/video-encode.mjs` loud-skips) and the game
 * ships without the feature, exactly as designed.
 */
import { expect, test, type Page } from '@playwright/test';
import { decodePng } from '../../scripts/assets/png.mjs';
import { freezeSim } from './frame-advance.js';
import { FRAME_H, FRAME_W, pixelIndex } from './frame-pixels.js';
import { BOOT_TIMEOUT_MS, gameTick, waitTicks } from './ticks.js';

/** A decoded screenshot: RGBA bytes and the row stride. */
interface Shot {
  data: Uint8Array;
  width: number;
}

/** What `window.__shmupDebug` offers these tests (test builds only). */
interface DebugPage {
  __shmupDebug: {
    tick: number;
    game: { requestStep(count: number): void };
    renderer: {
      readonly video: { readonly band: string; setBand(band: string): void } | null;
    };
  };
}

/**
 * Collects console errors and page errors.
 *
 * @param page - The page.
 * @returns The list (filled as they happen).
 */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

/**
 * Skips the test when the served build carries no clips (the encode kit ships nothing without
 * ffmpeg — the degraded shape of the feature, not a failure).
 *
 * @param page - Any page (the request goes to the preview server).
 * @param file - The clip file under `assets/video/`.
 * @returns Whether the clip exists.
 */
async function hasClip(page: Page, file: string): Promise<boolean> {
  const response = await page.request.get(`assets/video/${file}`);
  return response.ok();
}

/**
 * Boots to the title screen on the web build with a search string.
 *
 * @param page - The page.
 * @param search - `''`, `?novid=1`, or a `?video=<id>` probe.
 * @returns Resolves once the canvas shows the title and the sim runs.
 */
async function bootTitle(page: Page, search: string): Promise<void> {
  await page.goto(`./${search}`);
  const canvas = page.locator('#game');
  await expect(canvas).toHaveAttribute('data-shmup-state', 'running', {
    timeout: BOOT_TIMEOUT_MS,
  });
  await expect(canvas).toHaveAttribute('data-shmup-scene', 'title');
}

/**
 * Waits for the director's canvas mirror to show a clip (`'none'` for nothing playing).
 *
 * @param page - The booted page.
 * @param clip - The expected `data-shmup-video` value.
 */
async function waitForClip(page: Page, clip: string): Promise<void> {
  await expect
    .poll(() => page.locator('#game').getAttribute('data-shmup-video'), { timeout: 20_000 })
    .toBe(clip);
}

/**
 * Captures the canvas as decoded RGBA.
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
 * Compares two canvas shots on a frame-pixel grid (every sixth pixel inside the frame).
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
 * Freezes both pages' sims and steps them to the same absolute game tick, so any two captures
 * below compare scenes that draw the same frame (the title's art is a function of the tick).
 *
 * @param pages - The frozen pages (call after {@link freezeSim} on each).
 * @returns The tick both pages now show.
 */
async function syncToSameTick(pages: readonly Page[]): Promise<number> {
  const ticks = await Promise.all(pages.map((page) => gameTick(page)));
  const target = Math.max(...ticks) + 20;
  for (const page of pages) {
    await page.evaluate((goal) => {
      const api = (window as unknown as DebugPage).__shmupDebug;
      if (api.tick < goal) api.game.requestStep(goal - api.tick);
    }, target);
    await page.waitForFunction(
      (goal) => (window as unknown as DebugPage).__shmupDebug.tick >= goal,
      target,
    );
  }
  for (const page of pages) await rafFrames(page, 2);
  return target;
}

test.describe('cutscene video (web build)', () => {
  test('the ?video= probe draws a quad and keeps pulling frames with the sim frozen', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    if (!(await hasClip(page, 'attract-ambient.mp4'))) {
      test.skip(
        true,
        'this build host encoded no clips (no ffmpeg) — the game ships without video',
      );
      return;
    }
    const plain = await page.context().newPage();
    const errors = watchErrors(page);
    const errorsPlain = watchErrors(plain);
    await bootTitle(page, '?video=attract-ambient');
    await waitForClip(page, 'attract-ambient');
    // The probe plays the ambient clip, which the manifest puts in the world band — under the
    // title's own full-frame backdrop, where nothing could ever see it. The move to the screen
    // band is the renderer surface's own public call (the director uses it per clip; see
    // `renderer-video.test.ts` and the mode7 spec's use of the debug renderer handle), and it is
    // exactly why the title sting carries `screen` in the manifest.
    await page.evaluate(() => {
      const video = (window as unknown as DebugPage).__shmupDebug.renderer.video;
      if (video === null) throw new Error('the probe built no video surface');
      video.setBand('screen');
    });
    await bootTitle(plain, '?novid=1');

    // Both sims stop at the same absolute tick: from then on the ONLY moving picture is the
    // clip (the starfield and the UI hold their frames with the sim frozen).
    await freezeSim(page);
    await freezeSim(plain);
    await syncToSameTick([page, plain]);

    const withVideo = await shot(page);
    const without = await shot(plain);
    const drawn = gridDiff(withVideo, without);
    // A full-frame clip over a dark starfield differs everywhere: this is the quad being drawn.
    expect(drawn.mean, 'the quad must cover the frame with clip pixels').toBeGreaterThan(4);
    expect(drawn.share).toBeGreaterThan(0.5);

    // Wall time advances the decoded frame while the sim holds: the pull runs on render frames.
    await page.waitForTimeout(2500);
    const later = await shot(page);
    const pulled = gridDiff(withVideo, later);
    expect(pulled.mean, 'the frozen sim must not stop the media pull').toBeGreaterThan(0.2);
    expect(pulled.share).toBeGreaterThan(0.02);

    // And the plain page is exactly itself across the same wall time (the comparison is honest:
    // a moving baseline could not prove anything moved on the video page).
    const stillPlain = await shot(plain);
    expect(gridDiff(without, stillPlain).mean).toBe(0);

    await expect(page.locator('#game')).toHaveAttribute('data-shmup-scene', 'title');
    expect(errors, 'the video page must not log errors').toEqual([]);
    expect(errorsPlain, 'the plain page must not log errors').toEqual([]);
    await plain.close();
  });

  test('a clip that ends by itself clears the quad to a residue-free title', async ({ page }) => {
    test.setTimeout(150_000);
    if (!(await hasClip(page, 'title-sting.mp4'))) {
      test.skip(
        true,
        'this build host encoded no clips (no ffmpeg) — the game ships without video',
      );
      return;
    }
    const plain = await page.context().newPage();
    const errors = watchErrors(page);
    await bootTitle(page, '?video=title-sting');
    await waitForClip(page, 'title-sting');
    // The clip is not the ambient loop: it runs out at its last frame and the director forgets
    // it without a window, a key press or a scene change (any media path is skipped on input,
    // but this test must leave the flow untouched).
    await waitForClip(page, 'none');
    await bootTitle(plain, '?novid=1');

    await freezeSim(page);
    await freezeSim(plain);
    await syncToSameTick([page, plain]);

    const after = await shot(page);
    const baseline = await shot(plain);
    const residue = gridDiff(after, baseline);
    // The same tick on both pages draws the same title: a hidden quad leaves no pixels behind.
    expect(residue.mean, 'the cleared clip must leave no residue').toBeLessThan(1.5);
    expect(residue.share).toBeLessThan(0.05);
    await expect(page.locator('#game')).toHaveAttribute('data-shmup-scene', 'title');
    expect(errors).toEqual([]);
    await plain.close();
  });

  test('ticks keep flowing while a clip plays — the sim never waits on media', async ({ page }) => {
    test.setTimeout(150_000);
    if (!(await hasClip(page, 'attract-ambient.mp4'))) {
      test.skip(
        true,
        'this build host encoded no clips (no ffmpeg) — the game ships without video',
      );
      return;
    }
    const plain = await page.context().newPage();
    await bootTitle(page, '?video=attract-ambient');
    await waitForClip(page, 'attract-ambient');
    await bootTitle(plain, '?novid=1');

    // A fixed wall time on both live pages (media is wall time by nature). The video page must
    // still make tick progress close to the plain page's: the clip costs render time on a
    // software GL, never the game's clock. 50 % is a brutal margin for SwiftShader contention.
    const beforeVideo = await gameTick(page);
    const beforePlain = await gameTick(plain);
    await waitTicks(plain, 150);
    const afterVideo = await gameTick(page);
    const afterPlain = await gameTick(plain);
    const videoTicks = afterVideo - beforeVideo;
    const plainTicks = afterPlain - beforePlain;
    expect(videoTicks, 'the running sim must keep ticking with media on').toBeGreaterThan(
      plainTicks * 0.5,
    );

    // The ambient never ends by itself and never blocks the flow: a real press skips it at once
    // (the TV law) — the attribute mirrors the skip even though the press also starts the flow.
    await page.keyboard.press('Enter');
    await waitForClip(page, 'none');
    await expect(page.locator('#game')).toHaveAttribute(
      'data-shmup-scene',
      /.*/, // whatever the title's own handler opened — the media never owns the flow
    );
    await plain.close();
  });
});
