/**
 * Browser test of the GRAPHICS options end to end (plan R6-04, decision W5-20) in headless
 * Chromium: the Options screen's new GRAPHICS page — reached as the row after GAME — walks its
 * four rows (OUTPUT, RENDERER, CRT, ASPECT, the last two moved from DISPLAY), the page holds the
 * `APPLIES AT RESTART` hint text for its two boot knobs, BACK writes them to the save, and the
 * **next boot** honours them: the canvas backbuffer comes up at the saved 960×540 output cap and
 * the renderer at the pinned WebGL 1, while the live half of the page (CRT, ASPECT) still rides
 * the same events it rode on DISPLAY.
 *
 * The rows are walked by counts derived from the page's own shape (the menu's `focus` read back
 * through the debug API), never blind: every step asserts where it landed. Key taps count the
 * game's ticks (`ticks.ts`), and the boots wait wall time (`BOOT_TIMEOUT_MS`).
 */
import { expect, test, type Page } from '@playwright/test';
import { BOOT_TIMEOUT_MS, tap, waitTicks } from './ticks.js';

/** The save's `localStorage` key. */
const SAVE_KEY = 'shmup-cup:save.v1';

/** `window` with the test build's debug API (the parts this spec reads). */
interface DebugWindow {
  readonly __shmupDebug: {
    readonly game: {
      readonly scenes: {
        readonly graphicsPage: {
          readonly menu: { readonly focus: number };
          readonly output: { readonly index: number };
          readonly renderer: { readonly index: number };
          readonly crt: { readonly index: number };
          readonly aspect: { readonly index: number };
        };
        readonly text: { readonly graphicsHint: string };
        readonly labels: {
          readonly outputCaps: readonly string[];
          readonly rendererChoices: readonly string[];
        };
      } | null;
    };
    readonly renderer: { readonly webGLVersion: number };
  };
}

/**
 * The graphics page's state through the debug API.
 *
 * @param page - The page.
 * @returns The menu focus and the four row indices.
 */
async function graphicsState(page: Page): Promise<Record<string, number>> {
  return page.evaluate(() => {
    const g = (window as unknown as DebugWindow).__shmupDebug.game.scenes?.graphicsPage;
    if (g === undefined) throw new Error('no scene flow');
    return {
      focus: g.menu.focus,
      output: g.output.index,
      renderer: g.renderer.index,
      crt: g.crt.index,
      aspect: g.aspect.index,
    };
  });
}

/**
 * The canvas backbuffer — what the output cap sizes.
 *
 * @param page - The page.
 * @returns The canvas width and height.
 */
async function canvasSize(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const canvas = document.getElementById('game') as HTMLCanvasElement | null;
    return canvas === null ? [] : [canvas.width, canvas.height];
  });
}

/**
 * The renderer's live WebGL version (the debug API's renderer stats).
 *
 * @param page - The page.
 * @returns 1 or 2.
 */
async function webGLVersion(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as DebugWindow).__shmupDebug.renderer.webGLVersion);
}

/**
 * Collects console errors, atlas warnings and page errors.
 *
 * @param page - The page.
 * @returns The (live) error log.
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

/** Opens the title of a fresh boot of the web build. */
async function openTitle(page: Page): Promise<void> {
  const canvas = page.locator('#game');
  await expect(canvas).toHaveAttribute('data-shmup-state', 'running', {
    timeout: BOOT_TIMEOUT_MS,
  });
  await expect(canvas).toHaveAttribute('data-shmup-scene', 'title');
  await waitTicks(page, 10);
}

/** TITLE → menu → OPTIONS, the Options screen open with MASTER focused. */
async function openOptions(page: Page): Promise<void> {
  const canvas = page.locator('#game');
  await tap(page, 'Enter'); // PRESS OK → the menu
  await tap(page, 'ArrowDown'); // 2 PLAYERS
  await tap(page, 'ArrowDown'); // PRACTICE (M2-15)
  await tap(page, 'ArrowDown'); // OPTIONS
  await tap(page, 'Enter');
  await expect(canvas).toHaveAttribute('data-shmup-scene', 'options');
  await waitTicks(page, 4); // the menu's open lock
}

test.describe('graphics options through the Options screen (web build, R6-04)', () => {
  test('the page walks, marks the boot knobs, stores them and the next boot honours them', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    // 1280×720: `auto` output is the native size, the 540 cap gives a distinct 960×540.
    await page.setViewportSize({ width: 1280, height: 720 });
    const errors = collectErrors(page);
    await page.goto('./');
    await openTitle(page);
    // A fresh profile boots at `auto` = the window's native size on the desktop.
    expect(await canvasSize(page)).toEqual([1280, 720]);

    await openOptions(page);
    // MASTER → MUSIC → SFX → CONTROLS → DISPLAY → GAME → GRAPHICS: six rows down (the page
    // itself is asserted by the focus read below, not by the count alone).
    for (let i = 0; i < 6; i++) await tap(page, 'ArrowDown');
    await tap(page, 'Enter');
    const canvas = page.locator('#game');
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'graphics');
    await waitTicks(page, 4); // the page's open lock

    // The page opens on OUTPUT; the tables carry the row values and the restart hint.
    expect(await graphicsState(page)).toEqual({
      focus: 0,
      output: 0,
      renderer: 0,
      crt: 0,
      aspect: 0,
    });
    expect(
      await page.evaluate(() => {
        const flow = (window as unknown as DebugWindow).__shmupDebug.game.scenes;
        if (flow === null) throw new Error('no scene flow');
        return {
          hint: flow.text.graphicsHint,
          caps: [...flow.labels.outputCaps],
          choices: [...flow.labels.rendererChoices],
        };
      }),
    ).toEqual({
      hint: 'APPLIES AT RESTART',
      caps: ['AUTO', '1920X1080', '1280X720', '960X540'],
      choices: ['AUTO', 'WEBGL 2', 'WEBGL 1'],
    });

    // OUTPUT to the 540 cap: three rights.
    for (let i = 0; i < 3; i++) await tap(page, 'ArrowRight');
    expect((await graphicsState(page)).output).toBe(3);
    // RENDERER to the WebGL 1 pin: two rights (auto → webgl2 → webgl1).
    await tap(page, 'ArrowDown');
    for (let i = 0; i < 2; i++) await tap(page, 'ArrowRight');
    // CRT to light, ASPECT to wide — the rows moved from DISPLAY, applied live as before.
    await tap(page, 'ArrowDown');
    await tap(page, 'ArrowRight');
    await tap(page, 'ArrowDown');
    await tap(page, 'ArrowRight');
    expect(await graphicsState(page)).toEqual({
      focus: 3,
      output: 3,
      renderer: 2,
      crt: 1,
      aspect: 1,
    });

    // BACK (the row after ASPECT) stores the page; the Options screen's BACK leaves to the title,
    // which writes the save.
    await tap(page, 'ArrowDown');
    expect((await graphicsState(page)).focus).toBe(4);
    await tap(page, 'Enter');
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'options');
    await tap(page, 'Escape'); // BACK row: store and close the Options screen
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'title');
    await expect
      .poll(() =>
        page.evaluate((key) => {
          const text = window.localStorage.getItem(key);
          if (text === null) return null;
          const save = JSON.parse(text) as {
            version: number;
            options: { display: Record<string, unknown> };
          };
          return save.version === 4 ? save.options.display : null;
        }, SAVE_KEY),
      )
      .toEqual({
        bulletPalette: 'standard',
        scaleMode: 'integer',
        screenShake: true,
        reduceFlashing: false,
        showHitbox: false,
        bossHpBar: false,
        crtFilter: 'light',
        aspect: 'wide',
        output: '540',
        renderer: 'webgl1',
        language: 'en',
      });

    // The next boot reads both knobs before the renderer exists: the 540 cap sizes the
    // backbuffer (1280×720 window → 960×540) and the WebGL 1 pin holds even though this
    // Chromium clears the floor and would take `auto` to 2.
    await page.goto('./');
    await openTitle(page);
    expect(await canvasSize(page)).toEqual([960, 540]);
    expect(await webGLVersion(page)).toBe(1);
    expect(errors).toEqual([]);
  });
});
