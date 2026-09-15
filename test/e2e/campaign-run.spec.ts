/**
 * Browser tests of the M2-10 campaign run and hidden bonus stages in headless Chromium, on the
 * test builds (their `window.__shmupDebug` hands the spec the game — to clear a zone without
 * playing it out, or to open an entrance):
 *
 * - web build, a whole run: zones A → B → D → F → H cleared one after another (each clear's tally,
 *   the map, Enter launching the top exit), the ending of zone H (M2-14: its scene and epilogue,
 *   the result card), the credits, the title;
 *   the run lands in the saved hi-score table (`localStorage`) with the zone it reached;
 * - web build, `?stage=bonus-range`: the digit entrance opened through the debug API (the stage
 *   jumped to its window, a score whose thousands digit is 0) flies the ship into `bonus-vault`;
 *   a 1UP and a bonus capsule placed on screen are drawn in their green and gold;
 * - Tizen build from `file://`: the remote's OK skips a zone's tally and launches the next zone;
 * - no console errors (nor atlas warnings) in any.
 *
 * Screenshots are ×3 (viewport 1152×648).
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { decodePng } from '../../scripts/assets/png.mjs';
import { freezeSim, stepTo } from './frame-advance.js';

/** The Tizen build's page, as a `file://` URL. */
const TIZEN_INDEX = pathToFileURL(
  fileURLToPath(new URL('../../apps/tizen/dist/index.html', import.meta.url)),
).href;

/** The save's `localStorage` key (the web adapter prefixes `core/save`'s `save.v1`). */
const SAVE_KEY = 'shmup-cup:save.v1';

/** `items/1up`'s green body (`scripts/assets/procedural/items.mjs`, #28a838 / lit #50e060). */
const ONE_UP_GREEN = [
  [0x28, 0xa8, 0x38],
  [0x50, 0xe0, 0x60],
] as const;

/** `items/capsule-bonus`'s gold body (#d8a018 / lit #ffd040). */
const BONUS_GOLD = [
  [0xd8, 0xa0, 0x18],
  [0xff, 0xd0, 0x40],
] as const;

/** What the spec reads through `window.__shmupDebug`. */
interface RunView {
  readonly sceneId: string;
  readonly stage: string | null;
  readonly route: readonly number[];
  readonly ending: string | null;
  readonly score: number;
}

/** `window` with the parts of the test build's debug API the spec uses. */
interface DebugWindow {
  readonly __shmupDebug: {
    readonly sceneId: string;
    readonly game: {
      readonly world: {
        status: string;
        readonly tick: number;
        readonly camera: { readonly x: number };
        readonly stage: { readonly stage: { readonly id: string }; jumpTo(x: number): void } | null;
        readonly scoring: { readonly board: { readonly scores: Array<{ score: number }> } };
        readonly players: ReadonlyArray<{ readonly x: number; readonly y: number }>;
        readonly powerups: { spawnItem(kind: number, x: number, y: number): unknown };
        readonly bonus: { readonly entered: number };
      };
      readonly scenes: {
        readonly run: {
          readonly route: number[];
          readonly ending: { readonly id: string } | null;
          readonly inBonus: boolean;
        };
      };
    };
  };
}

/**
 * Reads the scene, the World's stage, the run's route and ending.
 *
 * @param page - The page.
 * @returns The view.
 */
function view(page: Page): Promise<RunView> {
  return page.evaluate(() => {
    const api = (window as unknown as DebugWindow).__shmupDebug;
    const world = api.game.world;
    const run = api.game.scenes.run;
    return {
      sceneId: api.sceneId,
      stage: world.stage === null ? null : world.stage.stage.id,
      route: run.route.slice(),
      ending: run.ending === null ? null : run.ending.id,
      score: world.scoring.board.scores[0].score,
    };
  });
}

/**
 * Collects console errors and atlas warnings.
 *
 * @param page - The page.
 * @returns The log (filled as the page runs).
 */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.text().startsWith('atlas:')) {
      errors.push(message.text());
    }
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

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
 * Presses a key for a few frames and lets the game see the release.
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
 * Dispatches a remote key by its legacy key code, down then up.
 *
 * @param page - The page.
 * @param keyCode - The key code (13 OK).
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
 * Opens a build and starts a game through the menus (NORMAL, KESTREL, START).
 *
 * @param page - The page.
 * @param url - The build's URL.
 */
async function startGame(page: Page, url: string): Promise<void> {
  await page.goto(url);
  const canvas = page.locator('#game');
  await expect(canvas).toHaveAttribute('data-shmup-state', 'running');
  await expect(canvas).toHaveAttribute('data-shmup-scene', 'title');
  await waitFrames(page, 10);
  await tap(page, 'Enter'); // PRESS OK
  await tap(page, 'Enter'); // 1 PLAYER
  await expect(canvas).toHaveAttribute('data-shmup-scene', 'difficulty');
  await tap(page, 'Enter'); // NORMAL
  await expect(canvas).toHaveAttribute('data-shmup-scene', 'shipSelect');
  await tap(page, 'Enter'); // KESTREL
  await expect(canvas).toHaveAttribute('data-shmup-scene', 'weaponSelect');
  await tap(page, 'Enter'); // START
  await expect(canvas).toHaveAttribute('data-shmup-scene', 'game');
}

/**
 * Clears the running zone through the debug API (status `stageClear`: the flow opens the tally
 * after its delay).
 *
 * @param page - The page.
 */
async function clearZone(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as unknown as DebugWindow).__shmupDebug.game.world.status = 'stageClear';
  });
}

/**
 * Counts the canvas pixels within 2 of any of some colours.
 *
 * @param page - The page.
 * @param colours - The colours.
 * @returns The count.
 */
async function countColours(
  page: Page,
  colours: ReadonlyArray<readonly [number, number, number]>,
): Promise<number> {
  const png = await page.locator('#game').screenshot();
  const { data } = decodePng(new Uint8Array(png));
  let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    for (const rgb of colours) {
      if (
        Math.abs(data[i] - rgb[0]) <= 2 &&
        Math.abs(data[i + 1] - rgb[1]) <= 2 &&
        Math.abs(data[i + 2] - rgb[2]) <= 2
      ) {
        n++;
        break;
      }
    }
  }
  return n;
}

test.describe('campaign run (web build)', () => {
  test('A → B → D → F → H: every tally and map, the ending, the title, the saved run', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const errors = watchErrors(page);
    await startGame(page, './');
    const canvas = page.locator('#game');
    const zones = ['zone-a', 'zone-b', 'zone-d', 'zone-f', 'zone-h'];
    for (let z = 0; z < zones.length; z++) {
      await expect.poll(async () => (await view(page)).stage).toBe(zones[z]);
      await clearZone(page);
      await expect(canvas).toHaveAttribute('data-shmup-scene', 'stageClear');
      await waitFrames(page, 10);
      await tap(page, 'Enter'); // skip the tally
      if (z === zones.length - 1) break;
      await expect(canvas).toHaveAttribute('data-shmup-scene', 'map');
      await waitFrames(page, 10);
      await tap(page, 'Enter'); // the top exit
      await expect(canvas).toHaveAttribute('data-shmup-scene', 'game');
    }
    // M3-02: zone H is a final zone with an escape stage — the way out is flown before the ending.
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'game');
    await expect.poll(async () => (await view(page)).stage).toBe('escape');
    await clearZone(page);
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'stageClear');
    await waitFrames(page, 10);
    await tap(page, 'Enter'); // skip the escape's tally
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'ending');
    const end = await view(page);
    // The escape is the final zone's, not a zone of its own: the route is unchanged.
    expect(end.route).toEqual([0, 1, 3, 5, 7]);
    // No ship lost: the flawless ending of the citadel.
    expect(end.ending).toBe('citadel-flawless');
    // M2-14: the citadel's scene and the epilogue, OK shows every line, OK again the result card;
    // after its lock OK the credits, after theirs OK the title.
    await waitFrames(page, 90); // past the ending's lock
    await tap(page, 'Enter'); // the whole epilogue
    await tap(page, 'Enter'); // the result card
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'ending');
    await waitFrames(page, 90);
    await tap(page, 'Enter');
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'credits');
    await waitFrames(page, 90);
    await tap(page, 'Enter');
    // M2-15: the run's score entered its table — the name entry (A, then OK past the empty letters
    // and on END), the table with the new row, and after its lock OK the title.
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'nameEntry');
    await waitFrames(page, 10);
    for (let i = 0; i < 4; i++) await tap(page, 'Enter');
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'hiScore');
    await waitFrames(page, 60);
    await tap(page, 'Enter');
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'title');
    const saved = await page.evaluate((key) => window.localStorage.getItem(key), SAVE_KEY);
    expect(saved).not.toBeNull();
    const table = (
      JSON.parse(saved ?? '{}') as {
        hiScores: Record<string, Array<{ reached: string; name: string }>>;
      }
    ).hiScores['meter-normal'];
    expect(table?.[0]?.reached).toBe('zone-h');
    expect(table?.[0]?.name).toBe('A');
    expect(errors).toEqual([]);
  });

  test('?stage=bonus-range: the digit entrance flies the ship into the vault, its items drawn', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const errors = watchErrors(page);
    await startGame(page, './?stage=bonus-range');
    expect((await view(page)).stage).toBe('bonus-range');
    // The digit window closes at x 2000 (thousands digit 0): jump before it with such a score.
    await page.evaluate(() => {
      const world = (window as unknown as DebugWindow).__shmupDebug.game.world;
      world.stage?.jumpTo(1980);
      world.scoring.board.scores[0].score = 40_000;
    });
    await expect
      .poll(async () => (await view(page)).stage, { timeout: 20_000 })
      .toBe('bonus-vault');
    expect(
      await page.evaluate(
        () => (window as unknown as DebugWindow).__shmupDebug.game.scenes.run.inBonus,
      ),
    ).toBe(true);
    const canvas = page.locator('#game');
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'game');
    await freezeSim(page);
    const before = await countColours(page, [...ONE_UP_GREEN, ...BONUS_GOLD]);
    // A 1UP and a bonus capsule (ItemKind 9 / 10) in the open right half of the screen.
    const tick = await page.evaluate(() => {
      const world = (window as unknown as DebugWindow).__shmupDebug.game.world;
      world.powerups.spawnItem(9, world.camera.x + 300, 40);
      world.powerups.spawnItem(10, world.camera.x + 300, 180);
      return world.tick;
    });
    await stepTo(page, tick + 2);
    expect(await countColours(page, ONE_UP_GREEN)).toBeGreaterThan(60);
    expect(await countColours(page, BONUS_GOLD)).toBeGreaterThan(60);
    expect(await countColours(page, [...ONE_UP_GREEN, ...BONUS_GOLD])).toBeGreaterThan(before);
    expect(errors).toEqual([]);
  });
});

test.describe('campaign run (Tizen build via file://)', () => {
  test('the remote`s OK skips the tally and launches the next zone', async ({ page }) => {
    test.setTimeout(90_000);
    const errors = watchErrors(page);
    await startGame(page, TIZEN_INDEX);
    const canvas = page.locator('#game');
    await clearZone(page);
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'stageClear');
    await waitFrames(page, 10);
    await remoteTap(page, 13);
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'map');
    await waitFrames(page, 10);
    await remoteTap(page, 13);
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'game');
    const next = await view(page);
    expect(next.stage).toBe('zone-b');
    expect(next.route).toEqual([0, 1]);
    // B's own clear: its tally, then the map again (B's exits D and E).
    await clearZone(page);
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'stageClear');
    await waitFrames(page, 10);
    await remoteTap(page, 13);
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'map');
    expect(errors).toEqual([]);
  });
});
