/**
 * The v1.0 release checks a browser can automate (plan M2-18, shmup_feat.md §23 "Tizen-specific
 * requirements", shmup_tech.md §2.6 the store's mandatory checklist), in headless Chromium:
 *
 * - **Boot to title in under {@link BOOT_TO_TITLE_BUDGET_MS} ms** — the web build and the Tizen
 *   build (`file://`, like the TV): from the navigation to the moment the canvas first says
 *   `data-shmup-scene="title"` (a `MutationObserver` installed before the page's scripts records
 *   `performance.now()`), and the shell's own launch-to-ready time (`data-shmup-boot-ms`) under the
 *   store's 10 s.
 * - **Tizen certification self-checks** on the Tizen build with a stand-in `window.tizen`:
 *   - Back / exit: Back on the title opens the exit confirmation, NO (and Back) keeps the app
 *     running, only YES calls `tizen.application.getCurrentApplication().exit()` — once; Back in the
 *     game pauses, Back on the pause menu resumes, and neither exits;
 *   - multitasking (`visibilitychange`): hidden during play freezes the game (no tick runs) and
 *     suspends the audio context; visible again resumes the audio and brings the pause menu up
 *     without a catch-up burst; Back plays on;
 *   - no crash on resume: after five more hide / show cycles the page logged no error and still
 *     runs its frame loop;
 *   - user data: everything the game keeps is in `localStorage` under the game's prefix (Tizen
 *     deletes it with the app — no cookies, no IndexedDB).
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

/** Boot-to-title budget on CI (plan M2-18; the TV's own budget is 10 s, 5 s ideal). */
export const BOOT_TO_TITLE_BUDGET_MS = 3000;

/** The store's launch budget (shmup_tech.md §2.6). */
const STORE_LAUNCH_BUDGET_MS = 10_000;

/** The Tizen build's page, as a `file://` URL. */
const TIZEN_INDEX = pathToFileURL(
  fileURLToPath(new URL('../../apps/tizen/dist/index.html', import.meta.url)),
).href;

/** The Tizen Back key. */
const BACK = 10009;

/** What the init script records in the page. */
interface ReleaseProbe {
  /** `performance.now()` when the canvas first showed the title (-1 = not yet). */
  titleAt: number;
  /** Calls of the stand-in `exit()`. */
  exits: number;
  /** Every audio context the page created. */
  contexts: { state: string }[];
}

/**
 * Installs the probe before the page's scripts: the title timestamp, the stand-in `window.tizen`
 * (key registration succeeds, `exit()` is counted) when asked, a controllable
 * `document.visibilityState` and the audio contexts' list.
 *
 * @param page - The page.
 * @param tizen - Whether to install the stand-in `window.tizen`.
 */
async function installProbe(page: Page, tizen: boolean): Promise<void> {
  await page.addInitScript((withTizen: boolean) => {
    const w = window as unknown as {
      shmupProbe: ReleaseProbe;
      shmupVisibility: string;
      tizen?: unknown;
      AudioContext: typeof AudioContext;
    };
    const probe: ReleaseProbe = { titleAt: -1, exits: 0, contexts: [] };
    w.shmupProbe = probe;
    new MutationObserver((records) => {
      for (const record of records) {
        const target = record.target as Element;
        if (probe.titleAt < 0 && target.getAttribute('data-shmup-scene') === 'title') {
          probe.titleAt = performance.now();
        }
      }
    }).observe(document, {
      attributes: true,
      subtree: true,
      attributeFilter: ['data-shmup-scene'],
    });
    w.shmupVisibility = 'visible';
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => w.shmupVisibility,
    });
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => w.shmupVisibility === 'hidden',
    });
    const Base = w.AudioContext;
    if (typeof Base === 'function') {
      w.AudioContext = class extends Base {
        constructor(options?: AudioContextOptions) {
          super(options);
          probe.contexts.push(this);
        }
      };
    }
    if (withTizen) {
      w.tizen = {
        tvinputdevice: {
          registerKey: () => {},
          registerKeyBatch: (_keys: string[], onSuccess?: () => void) => onSuccess?.(),
        },
        application: {
          getCurrentApplication: () => ({
            exit: () => {
              probe.exits++;
            },
          }),
        },
      };
    }
  }, tizen);
}

/**
 * Reads the probe.
 *
 * @param page - The page.
 * @returns The probe's title time, exit count and audio context states.
 */
function readProbe(page: Page): Promise<{ titleAt: number; exits: number; audio: string[] }> {
  return page.evaluate(() => {
    const probe = (window as unknown as { shmupProbe: ReleaseProbe }).shmupProbe;
    return {
      titleAt: probe.titleAt,
      exits: probe.exits,
      audio: probe.contexts.map((c) => c.state),
    };
  });
}

/**
 * Waits for `frames` animation frames in the page.
 *
 * @param page - The page.
 * @param frames - Frames to wait.
 */
async function waitFrames(page: Page, frames: number): Promise<void> {
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
 * Presses a desktop key for a few frames and lets the game see the release.
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

/**
 * Dispatches a remote key the desktop keyboard does not have, down then up.
 *
 * @param page - The page.
 * @param keyCode - The legacy key code.
 */
async function remoteTap(page: Page, keyCode: number): Promise<void> {
  const send = (type: string): Promise<void> =>
    page.evaluate(
      ([eventType, code]) => {
        const event = new KeyboardEvent(eventType, { bubbles: true, cancelable: true });
        Object.defineProperty(event, 'keyCode', { get: () => code });
        window.dispatchEvent(event);
      },
      [type, keyCode] as const,
    );
  await send('keydown');
  await waitFrames(page, 3);
  await send('keyup');
  await waitFrames(page, 6);
}

/**
 * Switches the page's visibility and fires `visibilitychange` (the TV's Home / multitasking).
 *
 * @param page - The page.
 * @param state - `'hidden'` or `'visible'`.
 */
async function setVisibility(page: Page, state: 'hidden' | 'visible'): Promise<void> {
  await page.evaluate((next) => {
    (window as unknown as { shmupVisibility: string }).shmupVisibility = next;
    document.dispatchEvent(new Event('visibilitychange'));
  }, state);
}

/**
 * The debug API's game counters (test builds).
 *
 * @param page - The page.
 * @returns Ticks the game ran, the World's tick and whether the game is suspended.
 */
function counters(page: Page): Promise<{ tick: number; worldTick: number; suspended: boolean }> {
  return page.evaluate(() => {
    const api = (
      window as unknown as {
        __shmupDebug: {
          tick: number;
          worldTick: number;
          game: { state: { suspended: boolean } };
        };
      }
    ).__shmupDebug;
    return { tick: api.tick, worldTick: api.worldTick, suspended: api.game.state.suspended };
  });
}

/**
 * Collects console errors and uncaught exceptions of a page.
 *
 * @param page - The page.
 * @returns The live list.
 */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  return errors;
}

test.describe('release check: boot to title (M2-18)', () => {
  for (const build of [
    { name: 'web build', url: './', tizen: false },
    { name: 'Tizen build via file://', url: TIZEN_INDEX, tizen: true },
  ]) {
    test(`${build.name} shows the title in under 3 s`, async ({ page }) => {
      await installProbe(page, build.tizen);
      const errors = watchErrors(page);
      await page.goto(build.url);
      const canvas = page.locator('#game');
      await expect(canvas).toHaveAttribute('data-shmup-scene', 'title');
      const { titleAt } = await readProbe(page);
      const bootMs = Number(await canvas.getAttribute('data-shmup-boot-ms'));
      console.info(
        `[release] ${build.name}: title at ${titleAt.toFixed(0)} ms, ready ${bootMs} ms`,
      );
      expect(titleAt).toBeGreaterThan(0);
      expect(titleAt).toBeLessThan(BOOT_TO_TITLE_BUDGET_MS);
      expect(bootMs).toBeGreaterThan(0);
      expect(bootMs).toBeLessThan(STORE_LAUNCH_BUDGET_MS);
      expect(errors).toEqual([]);
    });
  }
});

test.describe('release check: Tizen certification self-checks (M2-18)', () => {
  test('Back and exit, multitasking, resume without a crash, user data only in localStorage', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await installProbe(page, true);
    const errors = watchErrors(page);
    await page.goto(TIZEN_INDEX);
    const canvas = page.locator('#game');
    await expect(canvas).toHaveAttribute('data-shmup-state', 'running');
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'title');
    await waitFrames(page, 10);

    // Back on the title: the exit confirmation; NO and Back keep the app, YES exits — once.
    await remoteTap(page, BACK);
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'confirm');
    await tap(page, 'Enter'); // the default NO
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'title');
    await remoteTap(page, BACK);
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'confirm');
    await remoteTap(page, BACK); // Back answers NO
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'title');
    expect((await readProbe(page)).exits).toBe(0);

    // Into a game with OK only; Back pauses and resumes it, never exits.
    await tap(page, 'Enter'); // PRESS OK
    await tap(page, 'Enter'); // START
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'difficulty');
    await tap(page, 'Enter');
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'shipSelect');
    await tap(page, 'Enter');
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'weaponSelect');
    await tap(page, 'Enter');
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'game');
    await waitFrames(page, 30);
    await remoteTap(page, BACK);
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'pause');
    await remoteTap(page, BACK);
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'game');
    await waitFrames(page, 20);
    expect((await readProbe(page)).exits).toBe(0);

    // Multitasking: hidden freezes the game and suspends the audio …
    const before = await counters(page);
    expect(before.suspended).toBe(false);
    await setVisibility(page, 'hidden');
    await waitFrames(page, 30);
    const hidden = await counters(page);
    expect(hidden.suspended).toBe(true);
    await waitFrames(page, 30);
    const still = await counters(page);
    expect(still.tick).toBe(hidden.tick);
    expect(still.worldTick).toBe(hidden.worldTick);
    await expect
      .poll(async () => (await readProbe(page)).audio.every((state) => state !== 'running'))
      .toBe(true);
    expect((await readProbe(page)).audio.length).toBeGreaterThan(0);
    // … visible again: the audio resumes, the pause menu is up, no catch-up burst.
    await setVisibility(page, 'visible');
    await waitFrames(page, 10);
    const back = await counters(page);
    expect(back.suspended).toBe(false);
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'pause');
    expect(back.worldTick - still.worldTick).toBeLessThanOrEqual(4);
    await expect
      .poll(async () => (await readProbe(page)).audio.every((state) => state === 'running'))
      .toBe(true);
    await remoteTap(page, BACK);
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'game');
    await waitFrames(page, 20);
    expect((await counters(page)).worldTick).toBeGreaterThan(back.worldTick);

    // No crash on resume: five more trips to the home screen and back.
    for (let k = 0; k < 5; k++) {
      await setVisibility(page, 'hidden');
      await waitFrames(page, 5);
      await setVisibility(page, 'visible');
      await waitFrames(page, 10);
      await expect(canvas).toHaveAttribute('data-shmup-scene', 'pause');
      await remoteTap(page, BACK);
      await expect(canvas).toHaveAttribute('data-shmup-scene', 'game');
    }
    const running = await counters(page);
    await waitFrames(page, 20);
    expect((await counters(page)).tick).toBeGreaterThan(running.tick);
    await expect(canvas).toHaveAttribute('data-shmup-state', 'running');

    // User data: only the game's localStorage keys (deleted with the app on Tizen). The debug
    // tools' save import writes the save through the platform's storage as the game does.
    const stored = await page.evaluate(async () => {
      const api = (
        window as unknown as {
          __shmupDebug: { save: { export(): string; import(text: string): Promise<unknown> } };
        }
      ).__shmupDebug;
      await api.save.import(api.save.export());
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i) ?? '');
      const databases =
        typeof indexedDB.databases === 'function' ? (await indexedDB.databases()).length : 0;
      return { keys, cookie: document.cookie, databases };
    });
    expect(stored.keys.length).toBeGreaterThan(0);
    for (const key of stored.keys) expect(key.startsWith('shmup-cup:'), key).toBe(true);
    expect(stored.cookie).toBe('');
    expect(stored.databases).toBe(0);
    expect((await readProbe(page)).exits).toBe(0);
    expect(errors).toEqual([]);
  });

  test('YES on the exit question closes the app through tizen.application — once', async ({
    page,
  }) => {
    await installProbe(page, true);
    const errors = watchErrors(page);
    await page.goto(TIZEN_INDEX);
    const canvas = page.locator('#game');
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'title');
    await waitFrames(page, 10);
    await remoteTap(page, BACK);
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'confirm');
    await tap(page, 'ArrowLeft'); // YES
    expect((await readProbe(page)).exits).toBe(0);
    await tap(page, 'Enter');
    await expect.poll(async () => (await readProbe(page)).exits).toBe(1);
    await waitFrames(page, 10);
    expect((await readProbe(page)).exits).toBe(1);
    expect(errors).toEqual([]);
  });
});
