/**
 * Browser tests of zones D and E (plan M2-12) in headless Chromium, on the test builds (their
 * `window.__shmupDebug` hands the spec the game; frame advance for exact tick counts):
 *
 * - **MAGMA DEEP** — `?scene=flight&stage=zone-d`: on the surface the volcano peaks band
 *   (`bg/magma-peaks`, its ash) is drawn low in the view and the lava lake (`bg/magma-lava`) is
 *   still below it, out of sight; the stage jumped past the dive (the camera 200 px down in the
 *   caves) the palette-cycled lava lake — only ever the four ramp colours zone D cycles — has
 *   risen into the bottom of the view; at the end CINDER BASTION's iron hull
 *   (`bosses/bastion-hull`) holds the right half of the playfield while it fights, its shield arms
 *   turning;
 * - **TEMPEST RIDGE** — `?scene=flight&stage=zone-e`: the palette-cycled storm clouds
 *   (`bg/storm-clouds`, the four ramp colours zone E cycles) fill the top of the view and the
 *   jagged mountain band (`bg/storm-ridge`) its bottom; at the end SQUALL STEED's slate plating
 *   (`bosses/steed-body`) holds the right half of the playfield, its chest opening;
 * - **the TV build** — the Tizen `dist/` from `file://` in open space (`?scene=flight`; the TV has
 *   no `?stage=`), CINDER BASTION and SQUALL STEED brought in through the debug API: the zone
 *   content and art are in the one-script bundle and draw;
 * - no console errors or atlas warnings anywhere.
 *
 * Screenshots are ×3 (viewport 1152×648): frame pixel (x, y) is screenshot pixel (3x + 1, 3y + 1).
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { decodePng } from '../../scripts/assets/png.mjs';
import { MAGMA_RAMP } from '../../scripts/assets/procedural/magma.mjs';
import { STORM_RAMP } from '../../scripts/assets/procedural/tempest.mjs';
import { freezeSim, stepTo } from './frame-advance.js';

/** The Tizen build's page, as a `file://` URL. */
const TIZEN_INDEX = pathToFileURL(
  fileURLToPath(new URL('../../apps/tizen/dist/index.html', import.meta.url)),
).href;

/** An RGB colour. */
type Rgb = readonly [number, number, number];

/**
 * A `#rrggbb` colour as RGB.
 *
 * @param hex - The colour.
 * @returns Its channels.
 */
function rgb(hex: string): Rgb {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** `bosses/bastion-hull`'s two plate tones (#3c3434, #463c3a) — only CINDER BASTION's hull. */
const BASTION_PLATE = [rgb('#3c3434'), rgb('#463c3a')] as const;
/** `bosses/steed-body`'s plating (#3c4658) — only SQUALL STEED's body, lids and tail use it. */
const STEED_PLATE = [rgb('#3c4658')] as const;
/** `bg/magma-peaks`' ash and ridge line (#2e2226, #4a3634). */
const PEAKS = [rgb('#2e2226'), rgb('#4a3634')] as const;
/** `bg/storm-ridge`'s far and near mountain tones (#242a38, #303848). */
const RIDGE = [rgb('#242a38'), rgb('#303848')] as const;
/** The lava lake's ramp (the only colours its palette cycle shows). */
const LAVA = MAGMA_RAMP.map(rgb);
/** The storm clouds' ramp (the only colours their palette cycle shows). */
const CLOUDS = STORM_RAMP.map(rgb);

/** A rectangle of frame pixels (inclusive start, exclusive end). */
interface Area {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/** The right half of the playfield, below the HUD bar. */
const RIGHT_HALF: Area = { x0: 192, y0: 8, x1: 384, y1: 208 };

/**
 * Counts the frame pixels of an area within 2 of any of the colours.
 *
 * @param page - The page.
 * @param colours - The colours.
 * @param area - The area (frame pixels).
 * @returns The count.
 */
async function countColours(page: Page, colours: readonly Rgb[], area: Area): Promise<number> {
  const png = await page.locator('#game').screenshot();
  const { width, height, data } = decodePng(new Uint8Array(png));
  let n = 0;
  for (let fy = area.y0; fy < area.y1; fy++) {
    for (let fx = area.x0; fx < area.x1; fx++) {
      const sx = fx * 3 + 1;
      const sy = fy * 3 + 1;
      if (sx >= width || sy >= height) continue;
      const i = (sy * width + sx) * 4;
      for (const [r, g, b] of colours) {
        if (
          Math.abs(data[i] - r) <= 2 &&
          Math.abs(data[i + 1] - g) <= 2 &&
          Math.abs(data[i + 2] - b) <= 2
        ) {
          n++;
          break;
        }
      }
    }
  }
  return n;
}

/** `window` with the parts of the test build's debug API the spec uses. */
interface DebugWindow {
  readonly __shmupDebug: {
    readonly worldTick: number;
    readonly flags: { godMode: boolean };
    readonly game: {
      readonly world: {
        readonly camera: { readonly x: number; readonly y: number };
        readonly content: { readonly enemyIndex: ReadonlyMap<string, number> };
        readonly stage: { readonly stage: { readonly id: string }; jumpTo(x: number): void } | null;
        readonly bosses: {
          readonly boss: {
            readonly state: number;
            readonly specIndex: number;
            readonly partCount: number;
            readonly parts: ReadonlyArray<{
              readonly name: string;
              readonly open: boolean;
              readonly worldAngle: number;
            }>;
          };
          startBoss(enemyIndex: number): boolean;
        };
      };
    };
  };
}

/** What {@link bossNow} reads. */
interface BossNow {
  /** The World tick. */
  readonly tick: number;
  /** The stage id (`null` in open space). */
  readonly stage: string | null;
  /** The camera's y. */
  readonly cameraY: number;
  /** Slot 0's state (3 = fighting). */
  readonly state: number;
  /** Slot 0's boss id (`''` when empty). */
  readonly boss: string;
  /** Whether a part named `chest` is open. */
  readonly chestOpen: boolean;
  /** The world angle of a part named `hub` (-1 when none). */
  readonly hubAngle: number;
}

/**
 * Reads the World's stage, camera and main boss slot.
 *
 * @param page - The page.
 * @returns The snapshot.
 */
function bossNow(page: Page): Promise<BossNow> {
  return page.evaluate(() => {
    const api = (window as unknown as DebugWindow).__shmupDebug;
    const world = api.game.world;
    const boss = world.bosses.boss;
    let id = '';
    for (const [name, index] of world.content.enemyIndex) if (index === boss.specIndex) id = name;
    let hubAngle = -1;
    let chestOpen = false;
    for (let i = 0; i < boss.partCount; i++) {
      const part = boss.parts[i];
      if (part.name === 'hub') hubAngle = part.worldAngle;
      if (part.name === 'chest' && part.open) chestOpen = true;
    }
    return {
      tick: api.worldTick,
      stage: world.stage === null ? null : world.stage.stage.id,
      cameraY: world.camera.y,
      state: boss.state,
      boss: id,
      chestOpen,
      hubAngle,
    };
  });
}

/**
 * Collects console errors, atlas warnings and page errors.
 *
 * @param page - The page.
 * @returns The live list.
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
 * Opens a build, waits for the game to run, freezes the sim and turns god mode on.
 *
 * @param page - The page.
 * @param url - The URL.
 */
async function open(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await expect(page.locator('#game')).toHaveAttribute('data-shmup-state', 'running');
  await freezeSim(page);
  await page.evaluate(() => {
    (window as unknown as DebugWindow).__shmupDebug.flags.godMode = true;
  });
}

/**
 * Steps the frozen sim in blocks of 50 ticks until slot 0's boss fights.
 *
 * @param page - The page (frozen).
 * @param blocks - Most blocks.
 * @returns The snapshot once it fights.
 */
async function stepUntilFight(page: Page, blocks: number): Promise<BossNow> {
  let now = await bossNow(page);
  for (let i = 0; i < blocks && now.state !== 3; i++) {
    await stepTo(page, now.tick + 50);
    now = await bossNow(page);
  }
  expect(now.state, 'the boss never fought').toBe(3);
  return now;
}

/**
 * Jumps the frozen World's stage to a scroll x.
 *
 * @param page - The page.
 * @param x - The scroll x.
 */
async function jumpTo(page: Page, x: number): Promise<void> {
  await page.evaluate((to) => {
    (window as unknown as DebugWindow).__shmupDebug.game.world.stage?.jumpTo(to);
  }, x);
}

/**
 * Starts a boss in open space through the debug API.
 *
 * @param page - The page.
 * @param id - The boss's enemy id.
 * @returns Whether it started.
 */
function startBoss(page: Page, id: string): Promise<boolean> {
  return page.evaluate((boss) => {
    const world = (window as unknown as DebugWindow).__shmupDebug.game.world;
    return world.bosses.startBoss(world.content.enemyIndex.get(boss) ?? -1);
  }, id);
}

/** The bottom band of the playfield (the lower quarter). */
const BOTTOM: Area = { x0: 0, y0: 158, x1: 384, y1: 208 };

test.describe('zones D and E (web build)', () => {
  test('MAGMA DEEP: the volcano peaks, the lava lake rising into view with the dive, then CINDER BASTION', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const errors = watchErrors(page);
    await open(page, './?scene=flight&stage=zone-d');
    await stepTo(page, 60);
    const surface = await bossNow(page);
    expect(surface.stage).toBe('zone-d');
    expect(surface.cameraY).toBe(0);
    // The peaks band (y 128 on) low in the view; the lava lake (y 256) still out of sight.
    expect(await countColours(page, PEAKS, { x0: 0, y0: 136, x1: 384, y1: 200 })).toBeGreaterThan(
      4000,
    );
    expect(await countColours(page, LAVA, BOTTOM)).toBe(0);
    expect(await countColours(page, BASTION_PLATE, RIGHT_HALF)).toBe(0);
    // Past the dive: the camera 200 px down, the lava lake (factor 0.5) risen 100 px into view,
    // in its ramp colours before and after a few cycle steps.
    await jumpTo(page, 4400);
    const caves = await stepTo(page, surface.tick + 5);
    expect((await bossNow(page)).cameraY).toBe(200);
    const lava = await countColours(page, LAVA, BOTTOM);
    expect(lava).toBeGreaterThan(3000);
    await stepTo(page, caves + 20);
    expect(await countColours(page, LAVA, BOTTOM)).toBeGreaterThan(3000);
    // The end of the stage: the WARNING (x 9,100), then the boss, down in the caves.
    await jumpTo(page, 9000);
    const fight = await stepUntilFight(page, 40);
    expect(fight.boss).toBe('cinder-bastion');
    expect(fight.cameraY).toBe(200);
    expect(await countColours(page, BASTION_PLATE, RIGHT_HALF)).toBeGreaterThan(500);
    // Its shield arms turn (4 units a tick in phase 0).
    await stepTo(page, fight.tick + 10);
    const later = await bossNow(page);
    expect(later.hubAngle).not.toBe(fight.hubAngle);
    expect(later.state).toBe(3);
    expect(errors).toEqual([]);
  });

  test('TEMPEST RIDGE: the cycling storm clouds over the jagged ridge, then SQUALL STEED opens its chest', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const errors = watchErrors(page);
    await open(page, './?scene=flight&stage=zone-e');
    const start = await stepTo(page, 60);
    expect((await bossNow(page)).stage).toBe('zone-e');
    // Two rows of clouds (y 0–96) in their ramp colours, before and after a few cycle steps (the
    // rain in front of them blends only its streaks).
    const sky = { x0: 0, y0: 8, x1: 384, y1: 100 };
    expect(await countColours(page, CLOUDS, sky)).toBeGreaterThan(15000);
    await stepTo(page, start + 30);
    expect(await countColours(page, CLOUDS, sky)).toBeGreaterThan(15000);
    // The mountain band (y 152 on).
    expect(await countColours(page, RIDGE, { x0: 0, y0: 160, x1: 384, y1: 208 })).toBeGreaterThan(
      2000,
    );
    expect(await countColours(page, STEED_PLATE, RIGHT_HALF)).toBe(0);
    // The end of the stage: the WARNING (x 9,300), then the boss.
    await jumpTo(page, 9200);
    const fight = await stepUntilFight(page, 40);
    expect(fight.boss).toBe('squall-steed');
    expect(await countColours(page, STEED_PLATE, RIGHT_HALF)).toBeGreaterThan(300);
    // Its chest opens after its 130 shut ticks (phase 0).
    let now = fight;
    for (let i = 0; i < 10 && !now.chestOpen; i++) {
      await stepTo(page, now.tick + 20);
      now = await bossNow(page);
    }
    expect(now.chestOpen).toBe(true);
    expect(now.state).toBe(3);
    expect(errors).toEqual([]);
  });
});

test.describe('zones D and E (Tizen build via file://)', () => {
  test('CINDER BASTION and SQUALL STEED, brought in through the debug API, draw on the TV build', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const errors = watchErrors(page);
    await open(page, TIZEN_INDEX + '?scene=flight');
    await stepTo(page, 30);
    expect(await startBoss(page, 'cinder-bastion')).toBe(true);
    const bastion = await stepUntilFight(page, 20);
    expect(bastion.boss).toBe('cinder-bastion');
    expect(await countColours(page, BASTION_PLATE, RIGHT_HALF)).toBeGreaterThan(500);
    // The same slot takes the seahorse once the battleship has left it.
    await page.evaluate(() => {
      const world = (window as unknown as DebugWindow).__shmupDebug.game.world;
      (world.bosses as unknown as { clear(): void }).clear();
    });
    await stepTo(page, bastion.tick + 5);
    expect(await startBoss(page, 'squall-steed')).toBe(true);
    const steed = await stepUntilFight(page, 20);
    expect(steed.boss).toBe('squall-steed');
    expect(await countColours(page, STEED_PLATE, RIGHT_HALF)).toBeGreaterThan(300);
    expect(await countColours(page, BASTION_PLATE, RIGHT_HALF)).toBe(0);
    expect(errors).toEqual([]);
  });
});
