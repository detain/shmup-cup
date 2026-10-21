/**
 * Browser tests of the advanced bosses (plan M2-09) in headless Chromium (the test builds'
 * `window.__shmupDebug`, frame advance for exact tick counts):
 *
 * - **the raid** — `?scene=flight&stage=raid-range`: once IRON LEVIATHAN fights, its hull sections
 *   (`bosses/raid-hull`) stretch across the whole playfield — a boss larger than the screen —, and
 *   a few seconds later the camera has panned round it (another view of the hull, the camera's
 *   x and y moved), all without console errors or atlas warnings;
 * - **the boss HP bar** — with the saved `bossHpBar` display option, zone A's scene flow
 *   (`?skip=boss`) shows `BOSS` and the red bar in the top HUD bar while HALCYON BULWARK fights;
 * - **a captain** — `?scene=flight&stage=captain-range`: CAPTAIN RAM fights while the camera keeps
 *   scrolling (the scroll never locks), its parts drawn;
 * - **the twins on the TV build** — the Tizen `dist/` from `file://` in open space
 *   (`?scene=flight`; the TV has no `?stage=`), the EMBER twin brought in through the debug API: both
 *   twins fly in, the resting one is drawn on the layer behind (`bosses.backBatch`), and at the
 *   pair's turn they swap — without console errors.
 *
 * Screenshots are at the e2e capture scale (`frame-pixels.ts`; ×2, viewport 1280×720): frame
 * pixel (x, y) is screenshot pixel (sx(x), sy(y)).
 *
 * Key taps, pauses and the HP-bar test's poll for the bar count the game's ticks (`ticks.ts`),
 * never rAF frames: a slow runner draws fewer frames a second and catches up by up to 4 ticks a
 * frame, so a count of frames is a different number of ticks on every machine (C5 review 4).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { decodePng } from '../../scripts/assets/png.mjs';
import { freezeSim, stepTo } from './frame-advance.js';
import {
  BOSS_BAR_W,
  BOSS_BAR_X,
  BOSS_FILL_Y,
  BOSS_LABEL_W,
  BOSS_LABEL_X,
  FRAME_W,
  HUD_BAR_HEIGHT,
  HUD_BOTTOM_Y,
  PLAYFIELD_Y,
  pixelIndex,
  sx,
  sy,
} from './frame-pixels.js';
import { BOOT_TIMEOUT_MS, pollTicks, tap, waitTicks } from './ticks.js';

/** The Tizen build's page, as a `file://` URL. */
const TIZEN_INDEX = pathToFileURL(
  fileURLToPath(new URL('../../apps/tizen/dist/index.html', import.meta.url)),
).href;

/** `bosses/raid-hull`'s steel (#46506a). */
const STEEL = [0x46, 0x50, 0x6a] as const;
/** The boss HP bar's red (`core/ui` `HUD_COLORS.bossFill` / `bossLabel`, 0xf85858). */
const BAR_RED = [0xf8, 0x58, 0x58] as const;
/** The save's `localStorage` key (the web adapter prefixes `core/save`'s `save.v1`). */
const SAVE_KEY = 'shmup-cup:save.v1';

/**
 * Captain-range's own scroll speed, in px/tick — read from `content/stages/captain-range.stage.json`
 * (the ported content; R2-03 re-measured the captain test by the content, never a v1 literal), so
 * the camera's 60-tick delta derives from what the stage really runs.
 */
const CAPTAIN_SCROLL: number = (
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL('../../content/stages/captain-range.stage.json', import.meta.url)),
      'utf8',
    ),
  ) as { camera: Array<{ speed: number }> }
).camera[0].speed;

/** `window` with the parts of the test build's debug API the spec reads. */
interface DebugWindow {
  readonly __shmupDebug: {
    readonly worldTick: number;
    readonly game: {
      readonly world: {
        readonly camera: { readonly x: number; readonly y: number };
        readonly stage: { readonly locked: boolean } | null;
        readonly bosses: {
          readonly boss: { readonly state: number };
          readonly slots: ReadonlyArray<{
            readonly state: number;
            readonly resting: boolean;
            readonly role: number;
          }>;
          readonly batch: { readonly count: number };
          readonly backBatch: { readonly count: number };
          readonly hpBar: { readonly visible: boolean };
        };
      };
    };
  };
}

/** `window` with the debug API's way to start a boss (the Tizen twins test). */
interface TwinWindow {
  readonly __shmupDebug: {
    readonly game: {
      readonly world: {
        readonly content: { readonly enemyIndex: ReadonlyMap<string, number> };
        readonly bosses: {
          /** `BossSystem.startBoss`. */
          startBoss(enemyIndex: number): boolean;
        };
      };
    };
  };
}

/** What {@link bossesNow} reads of the World. */
interface BossesNow {
  /** The World tick. */
  readonly tick: number;
  /** Camera x. */
  readonly cameraX: number;
  /** Whether the stage's scroll is locked. */
  readonly locked: boolean;
  /** Each slot's state. */
  readonly states: number[];
  /** Each slot's resting flag. */
  readonly resting: boolean[];
  /** Parts in the front batch. */
  readonly front: number;
  /** Parts in the back batch (resting bosses). */
  readonly back: number;
}

/**
 * Reads the boss slots and the camera from the test build's debug API.
 *
 * @param page - The page.
 * @returns The snapshot.
 */
function bossesNow(page: Page): Promise<BossesNow> {
  return page.evaluate(() => {
    const api = (window as unknown as DebugWindow).__shmupDebug;
    const world = api.game.world;
    const bosses = world.bosses;
    return {
      tick: api.worldTick,
      cameraX: world.camera.x,
      locked: world.stage?.locked ?? false,
      states: bosses.slots.map((b) => b.state),
      resting: bosses.slots.map((b) => b.resting),
      front: bosses.batch.count,
      back: bosses.backBatch.count,
    };
  });
}

/**
 * Steps the frozen sim in blocks until a slot's boss fights.
 *
 * @param page - The page (frozen).
 * @param slot - The boss slot.
 * @param blocks - Most blocks of 50 ticks.
 * @returns The snapshot once it fights.
 */
async function stepUntilFight(page: Page, slot: number, blocks: number): Promise<BossesNow> {
  let now = await bossesNow(page);
  for (let i = 0; i < blocks && now.states[slot] !== 3; i++) {
    await stepTo(page, now.tick + 50);
    now = await bossesNow(page);
  }
  expect(now.states[slot], 'the boss in slot ' + String(slot) + ' never fought').toBe(3);
  return now;
}

/**
 * Screenshots the canvas and tells which frame pixels have a colour (± 3 per channel).
 *
 * @param page - The page.
 * @param rgb - The colour.
 * @returns A test for frame pixels.
 */
async function colourAt(
  page: Page,
  rgb: readonly [number, number, number],
): Promise<(fx: number, fy: number) => boolean> {
  const png = await page.locator('#game').screenshot();
  const { width, height, data } = decodePng(new Uint8Array(png));
  return (fx, fy) => {
    if (sx(fx) >= width || sy(fy) >= height) return false;
    const i = pixelIndex(width, fx, fy);
    return (
      Math.abs(data[i] - rgb[0]) <= 3 &&
      Math.abs(data[i + 1] - rgb[1]) <= 3 &&
      Math.abs(data[i + 2] - rgb[2]) <= 3
    );
  };
}

/**
 * The playfield columns showing the raid's steel, and its topmost row.
 *
 * @param page - The page.
 * @returns Columns with steel and the first row with steel (-1 = none).
 */
async function steel(page: Page): Promise<{ columns: number; top: number }> {
  const is = await colourAt(page, STEEL);
  let columns = 0;
  let top = -1;
  for (let fx = 0; fx < FRAME_W; fx++) {
    for (let fy = PLAYFIELD_Y; fy < HUD_BOTTOM_Y; fy++) {
      if (!is(fx, fy)) continue;
      columns++;
      break;
    }
  }
  for (let fy = PLAYFIELD_Y; fy < HUD_BOTTOM_Y && top < 0; fy++) {
    for (let fx = 0; fx < FRAME_W; fx++) {
      if (!is(fx, fy)) continue;
      top = fy;
      break;
    }
  }
  return { columns, top };
}

/**
 * Collects console errors and atlas warnings.
 *
 * @param page - The page.
 * @returns The list (filled as they come).
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

test.describe('advanced bosses (web build)', () => {
  test('the raid: a battleship wider than the screen, the camera panning round it', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const errors = watchErrors(page);
    await page.goto('./?scene=flight&stage=raid-range');
    await expect(page.locator('#game')).toHaveAttribute('data-shmup-state', 'running', {
      timeout: BOOT_TIMEOUT_MS,
    });
    await freezeSim(page);
    // The WARNING at the ported x 600 (R2-02 scales the event, the scroll speed with it — the
    // same ≈ 430 ticks), 180 ticks of it, a 240-tick intro: step to the fight.
    let tick = 0;
    let state = 0;
    for (let i = 0; i < 40 && state !== 3; i++) {
      tick = await stepTo(page, tick + 50);
      state = await page.evaluate(
        () => (window as unknown as DebugWindow).__shmupDebug.game.world.bosses.boss.state,
      );
    }
    expect(state, 'IRON LEVIATHAN never fought').toBe(3);
    const camera = (): Promise<{ x: number; y: number }> =>
      page.evaluate(() => {
        const c = (window as unknown as DebugWindow).__shmupDebug.game.world.camera;
        return { x: c.x, y: c.y };
      });
    const before = await camera();
    const first = await steel(page);
    // The hull spans the view (R2-02's port scales its offsets too; it still starts well inside
    // the left edge and runs past the right one).
    expect(first.columns).toBeGreaterThan(300);
    await stepTo(page, tick + 400);
    const after = await camera();
    expect(after.x).not.toBe(before.x);
    expect(after.y).not.toBe(before.y);
    const second = await steel(page);
    expect(second.columns).toBeGreaterThan(100);
    expect(second.top).not.toBe(first.top);
    expect(errors).toEqual([]);
  });

  test('the boss HP bar: BOSS and the red bar in the top HUD bar during the fight', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const errors = watchErrors(page);
    await page.goto('./?skip=boss');
    await page.evaluate(
      ([key]) =>
        window.localStorage.setItem(
          key,
          JSON.stringify({
            version: 1,
            options: { display: { bossHpBar: true } },
            hiScores: {},
            stats: {},
          }),
        ),
      [SAVE_KEY],
    );
    await page.reload();
    const canvas = page.locator('#game');
    await expect(canvas).toHaveAttribute('data-shmup-state', 'running', {
      timeout: BOOT_TIMEOUT_MS,
    });
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'title');
    await waitTicks(page, 10);
    await tap(page, 'Enter'); // PRESS OK → the menu
    await tap(page, 'Enter'); // START
    await tap(page, 'Enter'); // NORMAL
    await tap(page, 'Enter'); // KESTREL
    await tap(page, 'Enter'); // START in the weapon select
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'game');
    // Before the boss: the hi-score, no bar.
    let is = await colourAt(page, BAR_RED);
    let red = 0;
    for (let fx = BOSS_BAR_X; fx < BOSS_BAR_X + BOSS_BAR_W; fx++) if (is(fx, BOSS_FILL_Y)) red++;
    expect(red).toBe(0);
    // Poll until the bar is up (the WARNING, then the intro filling it).
    await pollTicks(
      page,
      'the boss HP bar visible',
      () =>
        page.evaluate(
          () => (window as unknown as DebugWindow).__shmupDebug.game.world.bosses.hpBar.visible,
        ),
      true,
      3000,
    );
    await freezeSim(page);
    const now = await page.evaluate(
      () => (window as unknown as DebugWindow).__shmupDebug.worldTick,
    );
    // The intro fills it; then it is full (158 px of fill in the 160-px frame at x 264 at
    // 640×360; 94, 96 and x 160 at 384×216).
    await stepTo(page, now + 200);
    is = await colourAt(page, BAR_RED);
    red = 0;
    for (let fx = BOSS_BAR_X; fx < BOSS_BAR_X + BOSS_BAR_W; fx++) if (is(fx, BOSS_FILL_Y)) red++;
    expect(red).toBeGreaterThan(40);
    // `BOSS` in red where `HI` was.
    let label = 0;
    for (let fy = 0; fy < HUD_BAR_HEIGHT; fy++) {
      for (let fx = BOSS_LABEL_X; fx < BOSS_LABEL_X + BOSS_LABEL_W; fx++) if (is(fx, fy)) label++;
    }
    expect(label).toBeGreaterThan(10);
    expect(errors).toEqual([]);
  });

  test('a captain: it fights while the camera keeps scrolling', async ({ page }) => {
    test.setTimeout(120_000);
    const errors = watchErrors(page);
    await page.goto('./?scene=flight&stage=captain-range');
    await expect(page.locator('#game')).toHaveAttribute('data-shmup-state', 'running', {
      timeout: BOOT_TIMEOUT_MS,
    });
    await freezeSim(page);
    // CAPTAIN RAM's boss event, then its 60-tick intro.
    const fighting = await stepUntilFight(page, 0, 20);
    expect(fighting.front).toBeGreaterThan(0);
    await stepTo(page, fighting.tick + 60);
    const later = await bossesNow(page);
    // Still fighting (god mode is off, but nothing here shoots it down in a second) and the scroll
    // went on the whole time: a captain never locks it. The 60 ticks move the camera by the
    // stage's own scroll speed (R2-03's re-measure reads it from the content, never a literal).
    expect(later.states[0]).toBe(3);
    expect(later.locked).toBe(false);
    expect(later.cameraX - fighting.cameraX).toBeCloseTo(CAPTAIN_SCROLL * 60, 6);
    expect(errors).toEqual([]);
  });
});

test.describe('advanced bosses (Tizen build from file://)', () => {
  test('the twins: the resting one drawn behind, and they swap at the pair’s turn', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const errors = watchErrors(page);
    await page.goto(TIZEN_INDEX + '?scene=flight');
    await expect(page.locator('#game')).toHaveAttribute('data-shmup-state', 'running', {
      timeout: BOOT_TIMEOUT_MS,
    });
    await freezeSim(page);
    // The `boss` event's way in (no WARNING): the EMBER twin brings its partner.
    const started = await page.evaluate(() => {
      const world = (window as unknown as TwinWindow).__shmupDebug.game.world;
      return world.bosses.startBoss(world.content.enemyIndex.get('twin-ember') ?? -1);
    });
    expect(started).toBe(true);
    // A 150-tick intro; then the follower withdraws.
    const fighting = await stepUntilFight(page, 0, 10);
    expect(fighting.states[1]).toBe(3);
    await stepTo(page, fighting.tick + 90);
    const first = await bossesNow(page);
    expect(first.resting).toEqual([false, true, false, false]);
    expect(first.back).toBeGreaterThan(0);
    expect(first.front).toBeGreaterThan(0);
    // The turn comes every 300 fight ticks: by then the lead rests and the other fights.
    await stepTo(page, fighting.tick + 400);
    const second = await bossesNow(page);
    expect(second.states.slice(0, 2)).toEqual([3, 3]);
    expect(second.resting).toEqual([true, false, false, false]);
    expect(second.back).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });
});
