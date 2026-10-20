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
 * Every wait after the boot counts the game's ticks (`__shmupDebug.tick`, through `ticks.ts`),
 * never rAF frames or wall time: a slow runner draws fewer frames a second and the loop then
 * catches up to 4 ticks a frame (core `config` `maxTicksPerFrame`), so a frame count or a
 * wall-clock timeout is a different number of ticks on every machine (the CI flakes of a 90-tick
 * tally delay under a 5 s timeout). Only the boot (`BOOT_TIMEOUT_MS`) and the tests' own timeouts
 * are wall time, sized for a slow runner.
 *
 * Screenshots are at the e2e capture scale (`frame-pixels.ts`; ×2, viewport 1280×720).
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { decodePng } from '../../scripts/assets/png.mjs';
import { freezeSim, stepTo } from './frame-advance.js';
import {
  BONUS_WARP_TICKS,
  BOOT_TIMEOUT_MS,
  CREDITS_LOCK_TICKS,
  ENDING_LOCK_TICKS,
  HI_SCORE_LOCK_TICKS,
  MAP_LAUNCH_TICKS,
  SCENE_SLACK_TICKS,
  STAGE_CLEAR_DELAY_TICKS,
  expectScene,
  pollTicks,
  remoteTap,
  tap,
  waitTicks,
} from './ticks.js';

/** The Tizen build's page, as a `file://` URL. */
const TIZEN_INDEX = pathToFileURL(
  fileURLToPath(new URL('../../apps/tizen/dist/index.html', import.meta.url)),
).href;

/**
 * Ticks from the bonus-range test's jump to the digit window's close: the camera's 30 px from x
 * 2970 to 3000 at the stage's 1.5 px a tick (`content/stages/bonus-range.stage.json`, ported).
 */
const DIGIT_WINDOW_TICKS = 20;

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
    /** The debug switches: god mode keeps a ship from being shot down. */
    readonly flags: { godMode: boolean };
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
 * Opens a build and starts a game through the menus (NORMAL, KESTREL, START).
 *
 * @param page - The page.
 * @param url - The build's URL.
 */
async function startGame(page: Page, url: string): Promise<void> {
  await page.goto(url);
  const canvas = page.locator('#game');
  await expect(canvas).toHaveAttribute('data-shmup-state', 'running', {
    timeout: BOOT_TIMEOUT_MS,
  });
  await expectScene(page, 'title');
  await waitTicks(page, 10);
  await tap(page, 'Enter'); // PRESS OK
  await tap(page, 'Enter'); // 1 PLAYER
  await expectScene(page, 'difficulty');
  await tap(page, 'Enter'); // NORMAL
  await expectScene(page, 'shipSelect');
  await tap(page, 'Enter'); // KESTREL
  await expectScene(page, 'weaponSelect');
  await tap(page, 'Enter'); // START
  await expectScene(page, 'game');
}

/**
 * Clears the running zone through the debug API (status `stageClear`) and waits for the tally,
 * which the flow opens {@link STAGE_CLEAR_DELAY_TICKS} ticks later.
 *
 * @param page - The page.
 * @returns Resolves once the canvas shows the tally (`stageClear`).
 */
async function clearZone(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as unknown as DebugWindow).__shmupDebug.game.world.status = 'stageClear';
  });
  await expectScene(page, 'stageClear', STAGE_CLEAR_DELAY_TICKS + SCENE_SLACK_TICKS);
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
    // About 1,500 ticks: under 30 s at 60 ticks/s; 420 s leaves room for a runner managing ~5 a
    // second (SwiftShader at 640×360 with one core per browser) and the zone loads.
    test.setTimeout(420_000);
    const errors = watchErrors(page);
    await startGame(page, './');
    // God mode: the run is cleared through the debug API, and the flawless ending below needs no
    // ship lost in the moments each zone plays first — on a loaded machine, enough ticks for a
    // zone's enemies or terrain to shoot the ship down (seen at 640×360). An assisted run still
    // enters its hi-score table (marked), which is all the end of this test reads.
    await page.evaluate(() => {
      (window as unknown as DebugWindow).__shmupDebug.flags.godMode = true;
    });
    const zones = ['zone-a', 'zone-b', 'zone-d', 'zone-f', 'zone-h'];
    const stage = async (): Promise<string | null> => (await view(page)).stage;
    for (let z = 0; z < zones.length; z++) {
      await pollTicks(page, 'the stage', stage, zones[z], SCENE_SLACK_TICKS);
      await clearZone(page);
      await waitTicks(page, 10);
      await tap(page, 'Enter'); // skip the tally
      if (z === zones.length - 1) break;
      await expectScene(page, 'map');
      await waitTicks(page, 10);
      await tap(page, 'Enter'); // the top exit
      await expectScene(page, 'game', MAP_LAUNCH_TICKS + SCENE_SLACK_TICKS);
    }
    // M3-02: zone H is a final zone with an escape stage — the way out is flown before the ending.
    await expectScene(page, 'game');
    await pollTicks(page, 'the stage', stage, 'escape', SCENE_SLACK_TICKS);
    await clearZone(page);
    await waitTicks(page, 10);
    await tap(page, 'Enter'); // skip the escape's tally
    await expectScene(page, 'ending');
    const end = await view(page);
    // The escape is the final zone's, not a zone of its own: the route is unchanged.
    expect(end.route).toEqual([0, 1, 3, 5, 7]);
    // No ship lost: the flawless ending of the citadel.
    expect(end.ending).toBe('citadel-flawless');
    // M2-14: the citadel's scene and the epilogue, OK shows every line, OK again the result card;
    // after its lock OK the credits, after theirs OK the title.
    await waitTicks(page, ENDING_LOCK_TICKS + SCENE_SLACK_TICKS); // past the ending's lock
    await tap(page, 'Enter'); // the whole epilogue
    await tap(page, 'Enter'); // the result card
    await expectScene(page, 'ending');
    await waitTicks(page, ENDING_LOCK_TICKS + SCENE_SLACK_TICKS); // past the result card's lock
    await tap(page, 'Enter');
    await expectScene(page, 'credits');
    await waitTicks(page, CREDITS_LOCK_TICKS + SCENE_SLACK_TICKS); // past the credits' lock
    await tap(page, 'Enter');
    // M2-15: the run's score entered its table — the name entry (A, then OK past the empty letters
    // and on END), the table with the new row, and after its lock OK the title.
    await expectScene(page, 'nameEntry');
    await waitTicks(page, 10);
    for (let i = 0; i < 4; i++) await tap(page, 'Enter');
    await expectScene(page, 'hiScore');
    await waitTicks(page, HI_SCORE_LOCK_TICKS + SCENE_SLACK_TICKS); // past the table's lock
    await tap(page, 'Enter');
    await expectScene(page, 'title');
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
    // The digit window closes at x 3000 (thousands digit 0 — the ported bonus-range event):
    // jump before it with such a score.
    await page.evaluate(() => {
      const world = (window as unknown as DebugWindow).__shmupDebug.game.world;
      world.stage?.jumpTo(2970);
      world.scoring.board.scores[0].score = 40_000;
    });
    // The window closes, the entrance opens, the warp flies the ship in.
    await pollTicks(
      page,
      'the stage',
      async () => (await view(page)).stage,
      'bonus-vault',
      DIGIT_WINDOW_TICKS + BONUS_WARP_TICKS + SCENE_SLACK_TICKS,
    );
    expect(
      await page.evaluate(
        () => (window as unknown as DebugWindow).__shmupDebug.game.scenes.run.inBonus,
      ),
    ).toBe(true);
    await expectScene(page, 'game');
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
    await clearZone(page);
    await waitTicks(page, 10);
    await remoteTap(page, 13);
    await expectScene(page, 'map');
    await waitTicks(page, 10);
    await remoteTap(page, 13);
    await expectScene(page, 'game', MAP_LAUNCH_TICKS + SCENE_SLACK_TICKS);
    const next = await view(page);
    expect(next.stage).toBe('zone-b');
    expect(next.route).toEqual([0, 1]);
    // B's own clear: its tally, then the map again (B's exits D and E).
    await clearZone(page);
    await waitTicks(page, 10);
    await remoteTap(page, 13);
    await expectScene(page, 'map');
    expect(errors).toEqual([]);
  });
});
