/**
 * Browser test of plan M3-01's replay library in the web build (headless Chromium): a game quit
 * from the pause menu is stored as the last game under `shmup-cup:replay.last` in `localStorage`,
 * survives a reload, and plays back from EXTRA → REPLAYS → LAST GAME → PLAY fast-forwarded to its
 * end with every hash matching (`REPLAY END`, back to the browser); a run replay's text pasted on
 * the page joins the kept replays (`shmup-cup:replay.1`) while other pastes are left alone. The
 * flow is read through the test build's debug API (`window.__shmupDebug`).
 */
import { expect, test, type Page } from '@playwright/test';

/** The last game's `localStorage` key (the web storage adapter prefixes `shmup-cup:`). */
const LAST_KEY = 'shmup-cup:replay.last';

/** The first kept replay's key. */
const KEPT_KEY = 'shmup-cup:replay.1';

/**
 * Waits for `frames` animation frames in the page.
 *
 * @param page - The page.
 * @param frames - Frames to wait.
 */
function waitFrames(page: Page, frames: number): Promise<void> {
  return page.evaluate(
    (total) =>
      new Promise<void>((resolve) => {
        let seen = 0;
        const next = (): void => {
          seen++;
          if (seen >= total) resolve();
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

/** What the test reads of the flow. */
interface FlowView {
  readonly sceneId: string;
  readonly titleFocus: number;
  readonly extraFocus: number;
  readonly choosing: boolean;
  readonly endTicks: number;
  readonly replayOk: boolean | null;
  /** The browser's row texts (built when it opens). */
  readonly rows: readonly string[];
}

/**
 * Reads the flow through the debug API.
 *
 * @param page - The page.
 * @returns The view.
 */
function view(page: Page): Promise<FlowView> {
  return page.evaluate(() => {
    const api = (
      window as unknown as {
        __shmupDebug: {
          sceneId: string;
          game: {
            scenes: {
              title: { menu: { focus: number } };
              extra: { menu: { focus: number } };
              replaysScreen: { choosing: boolean; rows: readonly string[] };
              replayScreen: {
                endTicks: number;
                playback: { report: { ok: boolean } } | null;
              };
            };
          };
        };
      }
    ).__shmupDebug;
    const flow = api.game.scenes;
    const playback = flow.replayScreen.playback;
    return {
      sceneId: api.sceneId,
      titleFocus: flow.title.menu.focus,
      extraFocus: flow.extra.menu.focus,
      choosing: flow.replaysScreen.choosing,
      endTicks: flow.replayScreen.endTicks,
      replayOk: playback === null ? null : playback.report.ok,
      rows: flow.replaysScreen.rows.slice(),
    };
  });
}

/**
 * Collects console errors and page errors.
 *
 * @param page - The page.
 * @returns The (live) error log.
 */
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

/**
 * A stored value.
 *
 * @param page - The page.
 * @param key - The key.
 * @returns The value, or `null`.
 */
function stored(page: Page, key: string): Promise<string | null> {
  return page.evaluate((k) => window.localStorage.getItem(k), key);
}

/**
 * Pastes a text on the page (a `paste` event with clipboard data, as a real paste sends).
 *
 * @param page - The page.
 * @param text - The text.
 */
async function paste(page: Page, text: string): Promise<void> {
  await page.evaluate((value) => {
    const data = new DataTransfer();
    data.setData('text/plain', value);
    const event = new ClipboardEvent('paste', {
      clipboardData: data,
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(event);
  }, text);
  await waitFrames(page, 4);
}

test.describe('replay library (web build, M3-01)', () => {
  test('the last game is stored, survives a reload, plays back, and a pasted replay is kept', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const errors = collectErrors(page);
    await page.goto('./');
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();
    const canvas = page.locator('#game');
    await expect(canvas).toHaveAttribute('data-shmup-state', 'running');
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'title');
    await waitFrames(page, 10);
    // A short game: 1 PLAYER → NORMAL → the first ship → START, a climb, then QUIT TO TITLE.
    await tap(page, 'Enter'); // PRESS OK
    await tap(page, 'Enter'); // 1 PLAYER
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'difficulty');
    await tap(page, 'Enter');
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'shipSelect');
    await tap(page, 'Enter');
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'weaponSelect');
    await tap(page, 'Enter');
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'game');
    await page.keyboard.down('ArrowUp');
    await waitFrames(page, 90);
    await page.keyboard.up('ArrowUp');
    await tap(page, 'Escape');
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'pause');
    await waitFrames(page, 4);
    for (let i = 0; i < 3; i++) await tap(page, 'ArrowDown'); // QUIT TO TITLE
    await tap(page, 'Enter');
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'confirm');
    await waitFrames(page, 4);
    await tap(page, 'ArrowLeft'); // YES
    await tap(page, 'Enter');
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'title');
    await expect.poll(async () => (await stored(page, LAST_KEY)) ?? '').toContain('"run-replay"');
    const text = (await stored(page, LAST_KEY))!;
    expect(JSON.parse(text)).toMatchObject({ kind: 'run-replay', mode: '1p' });

    // A relaunch reads it back: EXTRA → REPLAYS → LAST GAME → PLAY.
    await page.reload();
    await expect(canvas).toHaveAttribute('data-shmup-state', 'running');
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'title');
    await waitFrames(page, 10);
    await tap(page, 'Enter'); // PRESS OK
    for (let i = 0; i < 8 && (await view(page)).titleFocus !== 5; i++) await tap(page, 'ArrowDown');
    expect((await view(page)).titleFocus).toBe(5); // EXTRA
    await tap(page, 'Enter');
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'extra');
    await waitFrames(page, 4);
    for (let i = 0; i < 6 && (await view(page)).extraFocus !== 3; i++) await tap(page, 'ArrowDown');
    expect((await view(page)).extraFocus).toBe(3); // REPLAYS
    await tap(page, 'Enter');
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'replays');
    const rows = (await view(page)).rows;
    expect(rows).toHaveLength(4);
    expect(rows[0]).not.toBe('NO REPLAY'); // the ship and difficulty
    expect(rows.slice(1)).toEqual(['NO REPLAY', 'NO REPLAY', 'NO REPLAY']);
    await waitFrames(page, 4);
    await tap(page, 'Enter'); // LAST GAME
    expect((await view(page)).choosing).toBe(true);
    await waitFrames(page, 4);
    await tap(page, 'Enter'); // PLAY
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'replay');
    await tap(page, 'ArrowRight');
    await tap(page, 'ArrowRight'); // ×4
    await expect
      .poll(async () => (await view(page)).endTicks, { timeout: 60_000 })
      .toBeGreaterThanOrEqual(0);
    expect((await view(page)).replayOk).toBe(true);
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'replays', { timeout: 20_000 });

    // SHARE's other half: the text pasted on the page joins the kept replays; other text does not.
    await paste(page, 'hello, not a replay');
    expect(await stored(page, KEPT_KEY)).toBeNull();
    await paste(page, text);
    await expect.poll(() => stored(page, KEPT_KEY)).toBe(text);
    expect(errors).toEqual([]);
  });
});
