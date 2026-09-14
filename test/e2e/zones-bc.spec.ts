/**
 * Browser tests of zones B and C (plan M2-11) in headless Chromium, on the test builds (their
 * `window.__shmupDebug` hands the spec the game; frame advance for exact tick counts):
 *
 * - **BRINE NEBULA** — `?scene=flight&stage=zone-b`: the palette-cycled brine sea band
 *   (`bg/brine-sea`, only ever the four ramp colours zone B cycles) fills the bottom of the view;
 *   the stage jumped to its end, the WARNING brings GALVANIC MAW, whose hull plating
 *   (`bosses/maw-hull`) holds the right half of the playfield while it fights, its mouth opening;
 * - **DUNE EXPANSE** — `?scene=flight&stage=zone-c`: the dune ridge band (`bg/dune-ridge`) is
 *   drawn low in the view; at the end SANDGRAVE WIDOW's chitin (`bosses/widow-body`) holds the
 *   right half of the playfield;
 * - **PEARL GROTTO** — `?scene=flight&stage=brine-grotto`: the bonus stage draws its reef floor and
 *   ceiling (`tiles/terrain-reef`'s rim) over the brine sea;
 * - **the TV build** — the Tizen `dist/` from `file://` in open space (`?scene=flight`; the TV has
 *   no `?stage=`), SANDGRAVE WIDOW brought in through the debug API: the zone content and art are
 *   in the one-script bundle and draw;
 * - no console errors or atlas warnings anywhere.
 *
 * Screenshots are ×3 (viewport 1152×648): frame pixel (x, y) is screenshot pixel (3x + 1, 3y + 1).
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { decodePng } from '../../scripts/assets/png.mjs';
import { BRINE_RAMP } from '../../scripts/assets/procedural/brine.mjs';
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

/** `bosses/maw-hull`'s plating (#3a6a78) — only GALVANIC MAW's hull uses it. */
const MAW_PLATE = rgb('#3a6a78');
/** `bosses/widow-body`'s chitin (#4a3422) — only SANDGRAVE WIDOW's body uses it. */
const WIDOW_CHITIN = rgb('#4a3422');
/** `bg/dune-ridge`'s two sand tones (#6a4430, #4a3024). */
const RIDGE = [rgb('#6a4430'), rgb('#4a3024')] as const;
/** `tiles/terrain-reef`'s rim (the surface facing open space, #f0c890). */
const REEF_RIM = rgb('#f0c890');
/** The brine sea's ramp (the only colours its palette cycle shows). */
const SEA = BRINE_RAMP.map(rgb);

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
        readonly content: { readonly enemyIndex: ReadonlyMap<string, number> };
        readonly stage: { readonly stage: { readonly id: string }; jumpTo(x: number): void } | null;
        readonly bosses: {
          readonly boss: {
            readonly state: number;
            readonly specIndex: number;
            readonly parts: ReadonlyArray<{ readonly name: string; readonly open: boolean }>;
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
  /** Slot 0's state (3 = fighting). */
  readonly state: number;
  /** Slot 0's boss id (`''` when empty). */
  readonly boss: string;
  /** Whether a part named `maw` is open. */
  readonly mouthOpen: boolean;
}

/**
 * Reads the World's stage and its main boss slot.
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
    return {
      tick: api.worldTick,
      stage: world.stage === null ? null : world.stage.stage.id,
      state: boss.state,
      boss: id,
      mouthOpen: boss.parts.some((p) => p.name === 'maw' && p.open),
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

test.describe('zones B and C (web build)', () => {
  test('BRINE NEBULA: the cycling brine sea, then GALVANIC MAW fights with its mouth opening', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const errors = watchErrors(page);
    await open(page, './?scene=flight&stage=zone-b');
    const start = await stepTo(page, 60);
    expect((await bossNow(page)).stage).toBe('zone-b');
    // The sea band (y 152 on) in its ramp colours, before and after a few cycle steps.
    const sea = { x0: 0, y0: 156, x1: 384, y1: 196 };
    expect(await countColours(page, SEA, sea)).toBeGreaterThan(6000);
    await stepTo(page, start + 25);
    expect(await countColours(page, SEA, sea)).toBeGreaterThan(6000);
    expect(await countColours(page, [MAW_PLATE], RIGHT_HALF)).toBe(0);
    // The end of the stage: the WARNING (x 9,300), then the boss.
    await jumpTo(page, 9200);
    const fight = await stepUntilFight(page, 40);
    expect(fight.boss).toBe('galvanic-maw');
    expect(await countColours(page, [MAW_PLATE], RIGHT_HALF)).toBeGreaterThan(500);
    // Its mouth opens within its shut time (150 ticks in phase 1).
    let now = fight;
    for (let i = 0; i < 10 && !now.mouthOpen; i++) {
      await stepTo(page, now.tick + 20);
      now = await bossNow(page);
    }
    expect(now.mouthOpen).toBe(true);
    expect(now.state).toBe(3);
    expect(errors).toEqual([]);
  });

  test('DUNE EXPANSE: the dune ridge, then SANDGRAVE WIDOW fights', async ({ page }) => {
    test.setTimeout(180_000);
    const errors = watchErrors(page);
    await open(page, './?scene=flight&stage=zone-c');
    await stepTo(page, 60);
    expect((await bossNow(page)).stage).toBe('zone-c');
    expect(await countColours(page, RIDGE, { x0: 0, y0: 136, x1: 384, y1: 208 })).toBeGreaterThan(
      4000,
    );
    expect(await countColours(page, [WIDOW_CHITIN], RIGHT_HALF)).toBe(0);
    await jumpTo(page, 9000); // the WARNING is at 9,100
    const fight = await stepUntilFight(page, 40);
    expect(fight.boss).toBe('sandgrave-widow');
    expect(await countColours(page, [WIDOW_CHITIN], RIGHT_HALF)).toBeGreaterThan(450);
    expect(errors).toEqual([]);
  });

  test('PEARL GROTTO: the bonus stage draws its reef floor and ceiling over the brine sea', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const errors = watchErrors(page);
    await open(page, './?scene=flight&stage=brine-grotto');
    await stepTo(page, 120);
    expect((await bossNow(page)).stage).toBe('brine-grotto');
    const view = { x0: 0, y0: 8, x1: 384, y1: 208 };
    expect(await countColours(page, [REEF_RIM], view)).toBeGreaterThan(300);
    expect(await countColours(page, SEA, view)).toBeGreaterThan(4000);
    expect(errors).toEqual([]);
  });
});

test.describe('zones B and C (Tizen build via file://)', () => {
  test('SANDGRAVE WIDOW, brought in through the debug API, draws on the TV build', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const errors = watchErrors(page);
    await open(page, TIZEN_INDEX + '?scene=flight');
    await stepTo(page, 30);
    const started = await page.evaluate(() => {
      const world = (window as unknown as DebugWindow).__shmupDebug.game.world;
      return world.bosses.startBoss(world.content.enemyIndex.get('sandgrave-widow') ?? -1);
    });
    expect(started).toBe(true);
    const fight = await stepUntilFight(page, 20);
    expect(fight.boss).toBe('sandgrave-widow');
    expect(await countColours(page, [WIDOW_CHITIN], RIGHT_HALF)).toBeGreaterThan(450);
    expect(errors).toEqual([]);
  });
});
