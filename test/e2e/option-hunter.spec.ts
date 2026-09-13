/**
 * Browser test of the Option Hunter (plan M2-04) in headless Chromium, on the web test build (its
 * `window.__shmupDebug` hands the spec the game): `?stage=hunter-range&loadout=full` starts the
 * hunter range with four Options; an Option Hunter spawned on the Options (the stage's own come
 * later) must take them — drawn as its violet grabber (`enemies/option-hunter`) with the grey
 * stolen Options (`options/stolen`) in tow —, and a Mega Crash must free them as grey items that
 * drift on screen and give an Option back when flown into. No console errors and no "unknown
 * sprite" warning from the atlas (the new engine sprites are in the atlas). Screenshots are ×3
 * (viewport 1152×648): frame pixel (x, y) is screenshot pixel (3x + 1, 3y + 1).
 */
import { expect, test, type Page } from '@playwright/test';
import { decodePng } from '../../scripts/assets/png.mjs';

/** The Option Hunter's violet body (`enemies/option-hunter` palette `p`, #8a3ad8) — unique. */
const HUNTER_VIOLET = [0x8a, 0x3a, 0xd8] as const;
/** The stolen Option's light grey (`options/stolen` palette `l`, #a8a8b4) — unique. */
const STOLEN_GREY = [0xa8, 0xa8, 0xb4] as const;

/** The part of the World the spec touches (item kind 2 = a freed Option, enemy state 1 = live). */
interface DebugWorld {
  readonly debugFlags: { godMode: boolean };
  readonly players: readonly { readonly state: string; readonly x: number; readonly y: number }[];
  readonly camera: { readonly x: number; readonly y: number };
  readonly enemies: {
    readonly enemies: readonly {
      readonly state: number;
      readonly carried: number;
      x: number;
      y: number;
    }[];
    spawn(index: number, x: number, y: number): unknown;
  };
  readonly content: { readonly enemyIndex: ReadonlyMap<string, number> };
  readonly weapons: {
    readonly loadouts: readonly { readonly options: number }[];
    readonly options: readonly {
      readonly stolen: number;
      readonly x: Float64Array;
      readonly y: Float64Array;
    }[];
  };
  readonly powerups: {
    readonly pool: {
      readonly count: number;
      readonly fields: {
        readonly flags: Uint8Array;
        readonly kind: Uint8Array;
        readonly x: Float64Array;
        readonly y: Float64Array;
      };
    };
    detonateMegaCrash(player: number): number;
  };
}

/** `window` with the test build's debug API. */
interface DebugWindow {
  readonly __shmupDebug: { readonly game: { readonly world: DebugWorld } };
}

/** What the spec reads through `window.__shmupDebug`. */
interface HunterView {
  /** Player 1's state. */
  readonly state: string;
  /** Options player 1 owns. */
  readonly owned: number;
  /** Options stolen from player 1 so far. */
  readonly stolen: number;
  /** Options carried by live hunters. */
  readonly carried: number;
  /** Live freed-Option items. */
  readonly freed: number;
}

/**
 * Reads the hunter state of the game.
 *
 * @param page - The page.
 * @returns The view.
 */
function view(page: Page): Promise<HunterView> {
  return page.evaluate(() => {
    const w = (window as unknown as DebugWindow).__shmupDebug.game.world;
    let carried = 0;
    for (const e of w.enemies.enemies) if (e.state === 1) carried += e.carried;
    const f = w.powerups.pool.fields;
    let freed = 0;
    for (let i = 0; i < w.powerups.pool.count; i++) {
      if ((f.flags[i] & 1) === 0 && f.kind[i] === 2) freed++;
    }
    return {
      state: w.players[0].state,
      owned: w.weapons.loadouts[0].options,
      stolen: w.weapons.options[0].stolen,
      carried,
      freed,
    };
  });
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
 * Counts the playfield pixels of each colour in a screenshot of the canvas.
 *
 * @param page - The page.
 * @param colours - The colours.
 * @returns One count per colour.
 */
async function countColours(
  page: Page,
  colours: readonly (readonly [number, number, number])[],
): Promise<number[]> {
  const png = await page.locator('#game').screenshot();
  const { width, height, data } = decodePng(new Uint8Array(png));
  const counts = colours.map(() => 0);
  for (let fy = 8; fy < 208 && fy * 3 + 1 < height; fy++) {
    for (let fx = 0; fx < 384 && fx * 3 + 1 < width; fx++) {
      const i = ((fy * 3 + 1) * width + fx * 3 + 1) * 4;
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

test.describe('Option Hunter (web build)', () => {
  test('steals the Options, carries them grey; a Mega Crash frees them to be re-collected', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const errors = collectErrors(page);
    await page.goto('./?scene=flight&stage=hunter-range&loadout=full');
    await expect(page.locator('#game')).toHaveAttribute('data-shmup-state', 'running');
    await expect.poll(async () => (await view(page)).state, { timeout: 30_000 }).toBe('alive');
    expect((await view(page)).owned).toBe(4);
    // A hunter right on the first Option: it takes the whole chain on its first tick.
    const spawned = await page.evaluate(() => {
      const w = (window as unknown as DebugWindow).__shmupDebug.game.world;
      w.debugFlags.godMode = true;
      const group = w.weapons.options[0];
      const index = w.content.enemyIndex.get('option-hunter-front') ?? -1;
      return w.enemies.spawn(index, group.x[0], group.y[0]) !== null;
    });
    expect(spawned).toBe(true);
    await expect.poll(async () => (await view(page)).stolen, { timeout: 10_000 }).toBe(4);
    const after = await view(page);
    expect([after.owned, after.carried]).toEqual([0, 4]);
    let drawn: number[] = [0, 0];
    for (let poll = 0; poll < 20 && (drawn[0] < 20 || drawn[1] < 4); poll++) {
      await waitFrames(page, 4);
      drawn = await countColours(page, [HUNTER_VIOLET, STOLEN_GREY]);
    }
    expect(drawn[0], 'the hunter drawn').toBeGreaterThanOrEqual(20);
    expect(drawn[1], 'its haul drawn grey').toBeGreaterThanOrEqual(4);
    // Mega Crash (the hunter moved to mid-screen, away from the ship's pickup magnet): it dies, four
    // grey Options drift free.
    const killed = await page.evaluate(() => {
      const w = (window as unknown as DebugWindow).__shmupDebug.game.world;
      for (const e of w.enemies.enemies) {
        if (e.state === 1 && e.carried > 0) {
          e.x = w.camera.x + 250;
          e.y = w.camera.y + 60;
        }
      }
      return w.powerups.detonateMegaCrash(0);
    });
    expect(killed).toBeGreaterThanOrEqual(1);
    await expect.poll(async () => (await view(page)).freed, { timeout: 10_000 }).toBe(4);
    expect((await view(page)).carried).toBe(0);
    await waitFrames(page, 4);
    const [violet, grey] = await countColours(page, [HUNTER_VIOLET, STOLEN_GREY]);
    expect(violet).toBe(0);
    expect(grey).toBeGreaterThanOrEqual(4);
    // Fly into them (moved onto the ship): every one gives an Option back.
    await page.evaluate(() => {
      const w = (window as unknown as DebugWindow).__shmupDebug.game.world;
      const f = w.powerups.pool.fields;
      for (let i = 0; i < w.powerups.pool.count; i++) {
        if (f.kind[i] === 2) {
          f.x[i] = w.players[0].x;
          f.y[i] = w.players[0].y;
        }
      }
    });
    await expect.poll(async () => (await view(page)).owned, { timeout: 10_000 }).toBe(4);
    expect((await view(page)).freed).toBe(0);
    expect(errors).toEqual([]);
  });
});
