/**
 * Browser tests of the attract loop (plan M2-15) in headless Chromium, on the test builds: left
 * alone on `PRESS OK`, the title hands over to the **demo play** (a bundled zone demo, played back
 * through the replay path — its World and HUD drawn, in sync), then the **hi-score tables**, the
 * **story crawl** over its sprite scenes, and the title again; the next round plays the next zone's
 * demo; any key returns to the title. The sim is frozen with frame advance and stepped by exact
 * tick counts (`test/e2e/frame-advance.ts`), so the timings are the game's, not the machine's. The
 * Tizen build from disk reaches the demo too, and the remote's OK returns to the title.
 *
 * From R2-01 until R2-03 the demos are v1 recordings the build refuses (`gates.ts`), so the loop
 * skips them: those tests skip, and two others run instead — the web loop without its demos, and
 * the Tizen remote's OK leaving the hi-scores. R2-03 deletes both with the gate.
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { decodePng } from '../../scripts/assets/png.mjs';
import { freezeSim } from './frame-advance.js';
import { GOLDEN_REASON, R2_03_PENDING } from './gates.js';
import { BOOT_TIMEOUT_MS } from './ticks.js';

/** The Tizen build's page, as a `file://` URL. */
const TIZEN_INDEX = pathToFileURL(
  fileURLToPath(new URL('../../apps/tizen/dist/index.html', import.meta.url)),
).href;

/** Ticks the title waits without input (core `scenes` `TITLE_ATTRACT_TICKS`). */
const TITLE_ATTRACT_TICKS = 720;

/** Ticks of a bundled demo (`test/golden/demos.ts` `DEMO_TICKS`). */
const DEMO_TICKS = 2400;

/** Ticks one hi-score table shows (core `scenes` `HI_SCORE_PAGE_TICKS`). */
const HI_SCORE_PAGE_TICKS = 300;

/** HUD bar fill (core `ui` `HUD_COLORS.bar`, 0x1d2a5c). */
const HUD_BAR = [0x1d, 0x2a, 0x5c] as const;

/** What the tests read from `window.__shmupDebug`. */
interface DebugWindow {
  __shmupDebug: {
    tick: number;
    sceneId: string;
    game: {
      requestStep(count: number): void;
      scenes: {
        title: { idle: number };
        story: { duration: number; rows: readonly string[] };
        hiScores: { pages: readonly string[] };
        demo: {
          started: number;
          demo: {
            replay: { header: { stageId: string | null } };
            playback: { report: { ok: boolean; finished: boolean } };
          } | null;
        };
      };
    };
    flags: { frameAdvance: boolean };
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
 * Runs exact game ticks under frame advance, then waits until the canvas shows the result.
 *
 * @param page - The page (frozen with `freezeSim`).
 * @param ticks - Ticks to run.
 * @returns Resolves once they ran and two more frames were drawn.
 */
async function runTicks(page: Page, ticks: number): Promise<void> {
  const target = await page.evaluate((count) => {
    const api = (window as unknown as DebugWindow).__shmupDebug;
    const goal = api.tick + count;
    api.game.requestStep(count);
    return goal;
  }, ticks);
  await page.waitForFunction(
    (goal) => (window as unknown as DebugWindow).__shmupDebug.tick >= goal,
    target,
    { timeout: 30_000 },
  );
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}

/**
 * Ticks the title has waited on `PRESS OK` so far (some ran before the sim was frozen).
 *
 * @param page - The page.
 * @returns The title's idle ticks.
 */
function titleIdle(page: Page): Promise<number> {
  return page.evaluate(
    () => (window as unknown as DebugWindow).__shmupDebug.game.scenes.title.idle,
  );
}

/**
 * Counts the canvas pixels within 2 of a colour.
 *
 * @param page - The page.
 * @param rgb - The colour.
 * @returns The count.
 */
async function countColour(page: Page, rgb: readonly [number, number, number]): Promise<number> {
  const png = await page.locator('#game').screenshot();
  const { data } = decodePng(new Uint8Array(png));
  let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (
      Math.abs(data[i] - rgb[0]) <= 2 &&
      Math.abs(data[i + 1] - rgb[1]) <= 2 &&
      Math.abs(data[i + 2] - rgb[2]) <= 2
    ) {
      n++;
    }
  }
  return n;
}

/**
 * Presses and releases the Tizen remote's OK: key code 13, the code the Tizen adapter reads
 * (`keyCode`), dispatched on the window 100 ms apart.
 *
 * @param page - The page (the Tizen build, its sim running on its own).
 * @returns Resolves once the key is up again.
 */
async function pressRemoteOk(page: Page): Promise<void> {
  const send = (type: string): Promise<void> =>
    page.evaluate((eventType) => {
      const event = new KeyboardEvent(eventType, { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'keyCode', { get: () => 13 });
      window.dispatchEvent(event);
    }, type);
  await send('keydown');
  await page.waitForTimeout(100);
  await send('keyup');
}

/**
 * The demo playing now: its stage and its playback report.
 *
 * @param page - The page.
 * @returns The stage id and whether it is in sync, or `null` without a demo.
 */
function demoState(
  page: Page,
): Promise<{ stage: string | null; ok: boolean; finished: boolean; started: number } | null> {
  return page.evaluate(() => {
    const scene = (window as unknown as DebugWindow).__shmupDebug.game.scenes.demo;
    const demo = scene.demo;
    if (demo === null) return null;
    return {
      stage: demo.replay.header.stageId,
      ok: demo.playback.report.ok,
      finished: demo.playback.report.finished,
      started: scene.started,
    };
  });
}

test.describe('attract loop (web build)', () => {
  test('title → demo → hi-scores → story → title on the game`s timings; any key: title', async ({
    page,
  }) => {
    test.skip(R2_03_PENDING, GOLDEN_REASON);
    test.setTimeout(120_000);
    const errors = watchErrors(page);
    await page.goto('./');
    const canvas = page.locator('#game');
    await expect(canvas).toHaveAttribute('data-shmup-state', 'running', {
      timeout: BOOT_TIMEOUT_MS,
    });
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'title');
    await freezeSim(page);
    // The title waits, then the demo of zone A plays with its HUD.
    await runTicks(page, TITLE_ATTRACT_TICKS - 1 - (await titleIdle(page)));
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'title');
    await runTicks(page, 1);
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'demo');
    expect(await demoState(page)).toMatchObject({ stage: 'zone-a', ok: true, started: 1 });
    await runTicks(page, 300);
    expect(await countColour(page, HUD_BAR)).toBeGreaterThan(1000); // the demo's HUD bars
    // To its end in sync, then the tables.
    await runTicks(page, DEMO_TICKS - 301);
    expect(await demoState(page)).toMatchObject({ ok: true, finished: false });
    await runTicks(page, 1);
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'hiScore');
    const pages = await page.evaluate(
      () => (window as unknown as DebugWindow).__shmupDebug.game.scenes.hiScores.pages.length,
    );
    await runTicks(page, HI_SCORE_PAGE_TICKS * pages);
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'story');
    const duration = await page.evaluate(
      () => (window as unknown as DebugWindow).__shmupDebug.game.scenes.story.duration,
    );
    expect(duration).toBeGreaterThan(600);
    await runTicks(page, duration);
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'title');
    // The next round plays the next zone's demo.
    await runTicks(page, TITLE_ATTRACT_TICKS);
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'demo');
    expect(await demoState(page)).toMatchObject({ stage: 'zone-b', ok: true, started: 2 });
    // Any key returns to the title (the sim running on its own again).
    await page.evaluate(() => {
      (window as unknown as DebugWindow).__shmupDebug.flags.frameAdvance = false;
    });
    await page.keyboard.press('ArrowLeft');
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'title');
    expect(errors).toEqual([]);
  });
});

test.describe('attract loop with the v1 demos refused (web build, R2-01 until R2-03)', () => {
  test('title → hi-scores → story → title: the loop skips the demos the build refuses (W4-9)', async ({
    page,
  }, testInfo) => {
    // Only while the shipped demos are v1 recordings: once R2-03 re-records them, the loop plays
    // them again and the test above covers it — R2-03 deletes this test with the gate.
    test.skip(!R2_03_PENDING, 'the demos play again since R2-03: the loop test above covers it');
    test.setTimeout(120_000);
    const errors = watchErrors(page);
    await page.goto('./');
    const canvas = page.locator('#game');
    await expect(canvas).toHaveAttribute('data-shmup-state', 'running', {
      timeout: BOOT_TIMEOUT_MS,
    });
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'title');
    await freezeSim(page);
    // The title waits; with no demo it can play, the loop goes straight on to the tables.
    await runTicks(page, TITLE_ATTRACT_TICKS - 1 - (await titleIdle(page)));
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'title');
    await runTicks(page, 1);
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'hiScore');
    await page
      .locator('#game')
      .screenshot({ path: testInfo.outputPath('attract-hi-scores.png') })
      .then((png) => testInfo.attach('attract-hi-scores', { body: png, contentType: 'image/png' }));
    const pages = await page.evaluate(
      () => (window as unknown as DebugWindow).__shmupDebug.game.scenes.hiScores.pages.length,
    );
    await runTicks(page, HI_SCORE_PAGE_TICKS * pages);
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'story');
    const duration = await page.evaluate(
      () => (window as unknown as DebugWindow).__shmupDebug.game.scenes.story.duration,
    );
    expect(duration).toBeGreaterThan(600);
    await runTicks(page, duration >> 1);
    await page
      .locator('#game')
      .screenshot({ path: testInfo.outputPath('attract-story.png') })
      .then((png) => testInfo.attach('attract-story', { body: png, contentType: 'image/png' }));
    await runTicks(page, duration - (duration >> 1));
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'title');
    expect(errors).toEqual([]);
  });
});

test.describe('attract loop with the v1 demos refused (Tizen build from disk, R2-01 until R2-03)', () => {
  test('the title hands over to the hi-scores; the remote`s OK returns', async ({ page }) => {
    // The remote's way out of the attract loop while the Tizen demo test below is gated: once
    // R2-03 re-records the demos, that test covers it again — R2-03 deletes this one with the gate.
    test.skip(!R2_03_PENDING, 'the demos play again since R2-03: the Tizen test below covers it');
    test.setTimeout(60_000);
    const errors = watchErrors(page);
    await page.goto(TIZEN_INDEX);
    const canvas = page.locator('#game');
    await expect(canvas).toHaveAttribute('data-shmup-state', 'running', {
      timeout: BOOT_TIMEOUT_MS,
    });
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'title');
    await freezeSim(page);
    await runTicks(page, TITLE_ATTRACT_TICKS - (await titleIdle(page)));
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'hiScore');
    await runTicks(page, 120);
    await page.evaluate(() => {
      (window as unknown as DebugWindow).__shmupDebug.flags.frameAdvance = false;
    });
    await pressRemoteOk(page);
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'title');
    expect(errors).toEqual([]);
  });
});

test.describe('attract loop (Tizen build from disk)', () => {
  test('the title hands over to the demo; the remote`s OK returns', async ({ page }) => {
    test.skip(R2_03_PENDING, GOLDEN_REASON);
    test.setTimeout(60_000);
    const errors = watchErrors(page);
    await page.goto(TIZEN_INDEX);
    const canvas = page.locator('#game');
    await expect(canvas).toHaveAttribute('data-shmup-state', 'running', {
      timeout: BOOT_TIMEOUT_MS,
    });
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'title');
    await freezeSim(page);
    await runTicks(page, TITLE_ATTRACT_TICKS - (await titleIdle(page)));
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'demo');
    await runTicks(page, 120);
    expect(await demoState(page)).toMatchObject({ stage: 'zone-a', ok: true });
    await page.evaluate(() => {
      (window as unknown as DebugWindow).__shmupDebug.flags.frameAdvance = false;
    });
    await pressRemoteOk(page);
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'title');
    expect(errors).toEqual([]);
  });
});
