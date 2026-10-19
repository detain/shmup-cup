/**
 * Browser test of Direct mode's items and the Arm (plan M2-05) in headless Chromium, on the web test
 * build (its `window.__shmupDebug` hands the spec the game): `?stage=direct-range`, the ship select
 * picks the MANTA, and then
 *
 * - the six colour items (`items/direct-*`, spawned ahead of the ship, held still) are all drawn in
 *   their own colours — the generated art is in the atlas;
 * - a blue item flown into grants the green Arm, drawn round the ship (`shields/arm`), with the HUD's
 *   ARM pips;
 * - ShiftLeft (the keyboard's Speed) toggles the speed level;
 * - no console errors and no "unknown sprite" warning from the atlas.
 *
 * Screenshots are at the e2e capture scale (`frame-pixels.ts`; ×2, viewport 1280×720): frame
 * pixel (x, y) is screenshot pixel (sx(x), sy(y)).
 *
 * Key taps and pauses count the game's ticks (`ticks.ts`), never rAF frames: a slow runner draws
 * fewer frames a second and catches up by up to 4 ticks a frame, so a count of frames is a
 * different number of ticks on every machine (C5 review 4).
 */
import { expect, test, type Page } from '@playwright/test';
import { decodePng } from '../../scripts/assets/png.mjs';
import { FRAME_W, HUD_BOTTOM_Y, PLAYFIELD_Y, pixelIndex, sx, sy } from './frame-pixels.js';
import {
  BOOT_TIMEOUT_MS,
  SCENE_SLACK_TICKS,
  SHIP_ENTER_TICKS,
  pollTicks,
  tap,
  waitTicks,
} from './ticks.js';

/** An RGB colour. */
type Rgb = readonly [number, number, number];

/**
 * Each colour item's body (frame 0) and lit (frame 1, the blink) colours, in `DIRECT_ITEMS` order
 * (`scripts/assets/procedural/direct.mjs` `ITEM_COLORS` — only these sprites use them).
 */
const ITEM_COLOURS: readonly (readonly [string, Rgb, Rgb])[] = [
  ['red', [0xe0, 0x28, 0x28], [0xff, 0x90, 0x90]],
  ['green', [0x28, 0xc0, 0x40], [0x98, 0xff, 0x98]],
  ['blue', [0x28, 0x60, 0xe8], [0x90, 0xb8, 0xff]],
  ['orange', [0xf0, 0x80, 0x20], [0xff, 0xd0, 0x90]],
  ['yellow', [0xf0, 0xd0, 0x20], [0xff, 0xf8, 0xa0]],
  ['octagon', [0xd8, 0x20, 0x20], [0xff, 0xb0, 0xb0]],
];

/** The green Arm's ring (`shields/arm` tier 1, #58f070) — only that sprite uses it. */
const ARM_GREEN: Rgb = [0x58, 0xf0, 0x70];

/** The first colour item's kind (`ItemKind.DirectRed`). */
const DIRECT_RED = 3;

/** The part of the World the spec touches. */
interface DebugWorld {
  readonly debugFlags: { godMode: boolean };
  readonly config: { readonly shipId: string; readonly powerUpMode: string };
  readonly players: readonly {
    readonly state: string;
    readonly x: number;
    readonly y: number;
    readonly speedLevel: number;
    readonly shield: { readonly kind: number; readonly tier: number; readonly hits: number };
  }[];
  readonly camera: { readonly x: number; readonly y: number };
  readonly powerups: {
    readonly count: number;
    readonly pool: {
      readonly fields: { vx: Float64Array; vy: Float64Array };
    };
    spawnItem(kind: number, x: number, y: number): number;
  };
}

/** `window` with the test build's debug API. */
interface DebugWindow {
  readonly __shmupDebug: {
    readonly sceneId: string;
    readonly game: {
      readonly world: DebugWorld;
      readonly scenes: { readonly game: { readonly hudList: { readonly strings: string[] } } };
    };
  };
}

/** What the spec reads through `window.__shmupDebug`. */
interface DirectView {
  readonly shipId: string;
  readonly mode: string;
  readonly state: string;
  readonly speedLevel: number;
  readonly armTier: number;
  readonly hud: readonly string[];
}

/**
 * Reads the game's ship, mode, player 1's state, speed and Arm, and the HUD's texts.
 *
 * @param page - The page.
 * @returns The view.
 */
function view(page: Page): Promise<DirectView> {
  return page.evaluate(() => {
    const api = (window as unknown as DebugWindow).__shmupDebug;
    const w = api.game.world;
    return {
      shipId: w.config.shipId,
      mode: w.config.powerUpMode,
      state: w.players[0].state,
      speedLevel: w.players[0].speedLevel,
      armTier: w.players[0].shield.tier,
      hud: api.game.scenes.game.hudList.strings.slice(),
    };
  });
}

/**
 * Counts the playfield pixels of each colour in a screenshot of the canvas.
 *
 * @param page - The page.
 * @param colours - The colours.
 * @returns One count per colour.
 */
async function countColours(page: Page, colours: readonly Rgb[]): Promise<number[]> {
  const png = await page.locator('#game').screenshot();
  const { width, height, data } = decodePng(new Uint8Array(png));
  const counts = colours.map(() => 0);
  for (let fy = PLAYFIELD_Y; fy < HUD_BOTTOM_Y && sy(fy) < height; fy++) {
    for (let fx = 0; fx < FRAME_W && sx(fx) < width; fx++) {
      const i = pixelIndex(width, fx, fy);
      colours.forEach(([r, g, b], k) => {
        if (
          Math.abs(data[i] - r) <= 3 &&
          Math.abs(data[i + 1] - g) <= 3 &&
          Math.abs(data[i + 2] - b) <= 3
        ) {
          counts[k]++;
        }
      });
    }
  }
  return counts;
}

/**
 * Collects console errors and atlas warnings of a page.
 *
 * @param page - The page.
 * @returns The (live) list.
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

test.describe('Direct-mode items (web build)', () => {
  test('the colour items and the Arm are drawn; ShiftLeft toggles the speed', async ({ page }) => {
    test.setTimeout(120_000);
    const errors = collectErrors(page);
    await page.goto('./?stage=direct-range');
    const canvas = page.locator('#game');
    await expect(canvas).toHaveAttribute('data-shmup-state', 'running', {
      timeout: BOOT_TIMEOUT_MS,
    });
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'title');
    await waitTicks(page, 10);
    await tap(page, 'Enter'); // PRESS OK
    await tap(page, 'Enter'); // START
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'difficulty');
    await tap(page, 'Enter'); // NORMAL
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'shipSelect');
    await waitTicks(page, 4);
    await tap(page, 'ArrowDown'); // MANTA
    await tap(page, 'Enter');
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'game');
    await pollTicks(
      page,
      'the ship state',
      async () => (await view(page)).state,
      'alive',
      SHIP_ENTER_TICKS + SCENE_SLACK_TICKS,
    );
    const start = await view(page);
    expect([start.shipId, start.mode, start.speedLevel, start.armTier]).toEqual([
      'manta',
      'direct',
      1,
      0,
    ]);

    // None of the item colours on screen yet.
    const palette = ITEM_COLOURS.flatMap(([, body, lit]) => [body, lit]);
    expect(await countColours(page, [...palette, ARM_GREEN])).toEqual(
      Array(palette.length + 1).fill(0),
    );
    // The six colour items in a row ahead of the ship, held still (they drift with the view).
    await page.evaluate((red) => {
      const w = (window as unknown as DebugWindow).__shmupDebug.game.world;
      w.debugFlags.godMode = true;
      for (let k = 0; k < 6; k++) {
        const slot = w.powerups.spawnItem(red + k, w.camera.x + 200 + k * 24, w.camera.y + 24);
        w.powerups.pool.fields.vx[slot] = 0;
        w.powerups.pool.fields.vy[slot] = 0;
      }
    }, DIRECT_RED);
    let seen = ITEM_COLOURS.map(() => 0);
    for (let poll = 0; poll < 12 && seen.some((n) => n < 8); poll++) {
      await waitTicks(page, 3);
      const counts = await countColours(page, palette);
      seen = seen.map((n, k) => Math.max(n, counts[k * 2] + counts[k * 2 + 1]));
    }
    ITEM_COLOURS.forEach(([name], k) => expect(seen[k], `${name} drawn`).toBeGreaterThanOrEqual(8));

    // A blue item flown into: the green Arm round the ship, the ARM pips in the HUD.
    await page.evaluate((blue) => {
      const w = (window as unknown as DebugWindow).__shmupDebug.game.world;
      w.powerups.spawnItem(blue, w.players[0].x, w.players[0].y);
    }, DIRECT_RED + 2);
    // Flown into on the next tick.
    await pollTicks(
      page,
      'the Arm tier',
      async () => (await view(page)).armTier,
      1,
      SCENE_SLACK_TICKS,
    );
    let ring = 0;
    for (let poll = 0; poll < 10 && ring < 10; poll++) {
      await waitTicks(page, 3);
      [ring] = await countColours(page, [ARM_GREEN]);
    }
    expect(ring, 'the green Arm drawn').toBeGreaterThanOrEqual(10);
    for (const label of ['SHOT', 'SUB', 'ARM', 'SPD']) {
      expect((await view(page)).hud).toContain(label);
    }

    // The keyboard's Speed toggle.
    await tap(page, 'ShiftLeft');
    await pollTicks(
      page,
      'the speed level',
      async () => (await view(page)).speedLevel,
      2,
      SCENE_SLACK_TICKS,
    );
    expect(errors).toEqual([]);
  });
});
