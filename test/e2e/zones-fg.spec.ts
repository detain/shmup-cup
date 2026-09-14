/**
 * Browser tests of zones F and G (plan M2-13) in headless Chromium, on the test builds (their
 * `window.__shmupDebug` hands the spec the game; frame advance for exact tick counts):
 *
 * - **CELL VAULT** — `?scene=flight&stage=zone-f`: the palette-cycled cell wall
 *   (`bg/vault-membrane` — only ever the four ramp colours zone F cycles, and the colours of the
 *   same pixels change as the cycle steps) fills the top of the view and the fleshy folds
 *   (`bg/vault-folds`) its bottom; at the end MANTLE REGENT's mantle and tentacles
 *   (`bosses/regent-*`) hold the right half of the playfield while it fights, its tentacles
 *   curling in after their open ticks;
 * - **PRISM LABYRINTH** — `?scene=flight&stage=zone-g`: the palette-cycled crystal facets
 *   (`bg/prism-facets`, the four ramp colours zone G cycles) fill the top of the view and the
 *   crystal spires (`bg/prism-spires`) its bottom; at the end FACET MONARCH's hexagonal housing
 *   (`bosses/facet-body`) holds the right half of the playfield, its arms waving;
 * - **the TV build** — the Tizen `dist/` from `file://` in open space (`?scene=flight`; the TV has
 *   no `?stage=`), MANTLE REGENT and FACET MONARCH brought in through the debug API: the zone
 *   content and art are in the one-script bundle and draw;
 * - no console errors or atlas warnings anywhere.
 *
 * Screenshots are ×3 (viewport 1152×648): frame pixel (x, y) is screenshot pixel (3x + 1, 3y + 1).
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { decodePng } from '../../scripts/assets/png.mjs';
import { PRISM_RAMP } from '../../scripts/assets/procedural/prism.mjs';
import { VAULT_RAMP } from '../../scripts/assets/procedural/vault.mjs';
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

/** MANTLE REGENT's skin (#3c5a4c, #2c4238) — only its mantle, segments and tips use them. */
const REGENT_SKIN = [rgb('#3c5a4c'), rgb('#2c4238')] as const;
/** FACET MONARCH's housing faces (#263e62, #18284a) — only `bosses/facet-body`. */
const MONARCH_FACE = [rgb('#263e62'), rgb('#18284a')] as const;
/** `bg/vault-folds`' far and near flesh (#1e2e26, #2c4034). */
const FOLDS = [rgb('#1e2e26'), rgb('#2c4034')] as const;
/** `bg/prism-spires`' far and near crystal (#18243c, #22365a). */
const SPIRES = [rgb('#18243c'), rgb('#22365a')] as const;
/** The cell wall's ramp (the only colours its palette cycle shows). */
const MEMBRANE = VAULT_RAMP.map(rgb);
/** The crystal facets' ramp (the only colours their palette cycle shows). */
const FACETS = PRISM_RAMP.map(rgb);

/** A rectangle of frame pixels (inclusive start, exclusive end). */
interface Area {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/** The right half of the playfield, below the HUD bar. */
const RIGHT_HALF: Area = { x0: 192, y0: 8, x1: 384, y1: 208 };

/** The top of the playfield below the HUD bar (the far bands, above most terrain). */
const SKY: Area = { x0: 0, y0: 8, x1: 384, y1: 100 };

/**
 * The frame's pixels (every third screenshot pixel).
 *
 * @param page - The page.
 * @returns A function reading frame pixel (x, y) as RGB.
 */
async function frame(page: Page): Promise<(x: number, y: number) => Rgb | null> {
  const png = await page.locator('#game').screenshot();
  const { width, height, data } = decodePng(new Uint8Array(png));
  return (fx, fy) => {
    const sx = fx * 3 + 1;
    const sy = fy * 3 + 1;
    if (sx >= width || sy >= height) return null;
    const i = (sy * width + sx) * 4;
    return [data[i], data[i + 1], data[i + 2]];
  };
}

/**
 * Which of the colours a pixel is (within 2 per channel).
 *
 * @param pixel - The pixel.
 * @param colours - The colours.
 * @returns The index of the colour, or -1.
 */
function which(pixel: Rgb | null, colours: readonly Rgb[]): number {
  if (pixel === null) return -1;
  for (let k = 0; k < colours.length; k++) {
    const [r, g, b] = colours[k];
    if (Math.abs(pixel[0] - r) <= 2 && Math.abs(pixel[1] - g) <= 2 && Math.abs(pixel[2] - b) <= 2) {
      return k;
    }
  }
  return -1;
}

/**
 * Counts the frame pixels of an area within 2 of any of the colours.
 *
 * @param page - The page.
 * @param colours - The colours.
 * @param area - The area (frame pixels).
 * @returns The count.
 */
async function countColours(page: Page, colours: readonly Rgb[], area: Area): Promise<number> {
  const at = await frame(page);
  let n = 0;
  for (let fy = area.y0; fy < area.y1; fy++) {
    for (let fx = area.x0; fx < area.x1; fx++) if (which(at(fx, fy), colours) >= 0) n++;
  }
  return n;
}

/**
 * The ramp colour of every pixel of an area (-1 where another colour shows).
 *
 * @param page - The page.
 * @param colours - The ramp.
 * @param area - The area (frame pixels).
 * @returns One entry per pixel, row by row.
 */
async function rampMap(page: Page, colours: readonly Rgb[], area: Area): Promise<number[]> {
  const at = await frame(page);
  const out: number[] = [];
  for (let fy = area.y0; fy < area.y1; fy++) {
    for (let fx = area.x0; fx < area.x1; fx++) out.push(which(at(fx, fy), colours));
  }
  return out;
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
            readonly parts: ReadonlyArray<{ readonly name: string; readonly angle: number }>;
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
  /** The own turn of the part named `seg-top-1` or `arm-top-1` (-1 when none). */
  readonly armAngle: number;
}

/**
 * Reads the World's stage and main boss slot.
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
    let armAngle = -1;
    for (let i = 0; i < boss.partCount; i++) {
      const part = boss.parts[i];
      if (part.name === 'seg-top-1' || part.name === 'arm-top-1') armAngle = part.angle;
    }
    return {
      tick: api.worldTick,
      stage: world.stage === null ? null : world.stage.stage.id,
      state: boss.state,
      boss: id,
      armAngle,
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

/**
 * Whether two ramp maps show a pixel of the ramp in both that changed colour — the cycle stepped.
 *
 * @param a - The first map.
 * @param b - The second map.
 * @returns How many ramp pixels changed their ramp colour.
 */
function stepped(a: readonly number[], b: readonly number[]): number {
  let n = 0;
  for (let i = 0; i < a.length; i++) if (a[i] >= 0 && b[i] >= 0 && a[i] !== b[i]) n++;
  return n;
}

test.describe('zones F and G (web build)', () => {
  test('CELL VAULT: the cycling cell wall over the fleshy folds, then MANTLE REGENT curls its tentacles', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const errors = watchErrors(page);
    await open(page, './?scene=flight&stage=zone-f');
    const start = await stepTo(page, 60);
    expect((await bossNow(page)).stage).toBe('zone-f');
    // Three rows of the cell wall (y 0–192) in its ramp colours; the cycle (12 ticks a step)
    // recolours the same pixels a few steps later.
    const wall = await rampMap(page, MEMBRANE, SKY);
    expect(wall.filter((k) => k >= 0).length).toBeGreaterThan(20000);
    await stepTo(page, start + 30);
    const later = await rampMap(page, MEMBRANE, SKY);
    expect(later.filter((k) => k >= 0).length).toBeGreaterThan(20000);
    expect(stepped(wall, later)).toBeGreaterThan(1000);
    // The folds band (y 152 on).
    expect(await countColours(page, FOLDS, { x0: 0, y0: 152, x1: 384, y1: 208 })).toBeGreaterThan(
      3000,
    );
    expect(await countColours(page, REGENT_SKIN, RIGHT_HALF)).toBe(0);
    // The end of the stage: the WARNING (x 9,100), then the boss.
    await jumpTo(page, 9000);
    const fight = await stepUntilFight(page, 40);
    expect(fight.boss).toBe('mantle-regent');
    expect(await countColours(page, REGENT_SKIN, RIGHT_HALF)).toBeGreaterThan(700);
    // Its tentacles curl in after their 120 open ticks (phase 0).
    expect(fight.armAngle === 0).toBe(true); // straight (0 or −0)
    let now = fight;
    for (let i = 0; i < 10 && now.armAngle === 0; i++) {
      await stepTo(page, now.tick + 20);
      now = await bossNow(page);
    }
    expect(now.armAngle === 0).toBe(false);
    expect(now.state).toBe(3);
    expect(errors).toEqual([]);
  });

  test('PRISM LABYRINTH: the cycling crystal facets over the spires, then FACET MONARCH waves its arms', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const errors = watchErrors(page);
    await open(page, './?scene=flight&stage=zone-g');
    const start = await stepTo(page, 60);
    expect((await bossNow(page)).stage).toBe('zone-g');
    const facets = await rampMap(page, FACETS, SKY);
    expect(facets.filter((k) => k >= 0).length).toBeGreaterThan(20000);
    await stepTo(page, start + 45);
    const later = await rampMap(page, FACETS, SKY);
    expect(later.filter((k) => k >= 0).length).toBeGreaterThan(20000);
    expect(stepped(facets, later)).toBeGreaterThan(1000);
    expect(await countColours(page, SPIRES, { x0: 0, y0: 144, x1: 384, y1: 208 })).toBeGreaterThan(
      3000,
    );
    expect(await countColours(page, MONARCH_FACE, RIGHT_HALF)).toBe(0);
    // The end of the stage: the WARNING (x 9,300), then the boss.
    await jumpTo(page, 9200);
    const fight = await stepUntilFight(page, 40);
    expect(fight.boss).toBe('facet-monarch');
    expect(await countColours(page, MONARCH_FACE, RIGHT_HALF)).toBeGreaterThan(700);
    // Its arms wave (1 unit a tick in phase 0).
    await stepTo(page, fight.tick + 10);
    const waved = await bossNow(page);
    expect(waved.armAngle).not.toBe(fight.armAngle);
    expect(waved.state).toBe(3);
    expect(errors).toEqual([]);
  });
});

test.describe('zones F and G (Tizen build via file://)', () => {
  test('MANTLE REGENT and FACET MONARCH, brought in through the debug API, draw on the TV build', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const errors = watchErrors(page);
    await open(page, TIZEN_INDEX + '?scene=flight');
    await stepTo(page, 30);
    expect(await startBoss(page, 'mantle-regent')).toBe(true);
    const regent = await stepUntilFight(page, 20);
    expect(regent.boss).toBe('mantle-regent');
    expect(await countColours(page, REGENT_SKIN, RIGHT_HALF)).toBeGreaterThan(700);
    // The same slot takes the crystal core once the squid has left it.
    await page.evaluate(() => {
      const world = (window as unknown as DebugWindow).__shmupDebug.game.world;
      (world.bosses as unknown as { clear(): void }).clear();
    });
    await stepTo(page, regent.tick + 5);
    expect(await startBoss(page, 'facet-monarch')).toBe(true);
    const monarch = await stepUntilFight(page, 20);
    expect(monarch.boss).toBe('facet-monarch');
    expect(await countColours(page, MONARCH_FACE, RIGHT_HALF)).toBeGreaterThan(700);
    expect(await countColours(page, REGENT_SKIN, RIGHT_HALF)).toBe(0);
    expect(errors).toEqual([]);
  });
});
