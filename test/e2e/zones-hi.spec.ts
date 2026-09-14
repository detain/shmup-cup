/**
 * Browser tests of the final zones H and I and the endings (plan M2-14) in headless Chromium, on
 * the test builds (their `window.__shmupDebug` hands the spec the game; frame advance for exact
 * tick counts):
 *
 * - **IRON CITADEL** — `?scene=flight&stage=zone-h`: the palette-cycled fortress wall
 *   (`bg/citadel-wall` — its running lights only ever the four ramp colours zone H cycles, and the
 *   colours of the same pixels change as the cycle steps) fills the top of the view; at the end IRON
 *   SOVEREIGN's stepped hull (`bosses/sovereign-hull`) holds the right half of the playfield while
 *   it fights;
 * - **ABYSSAL THRONE** — `?scene=flight&stage=zone-i`: the palette-cycled murk (`bg/abyss-murk`,
 *   the four ramp colours zone I cycles) fills the top of the view; at the end the ABYSS ARK's bone
 *   plating (`bosses/ark-*`) fills the view as the raid's camera follows it;
 * - **the ending scenes** — the web build's scene flow put on the ending of a run through the debug
 *   API: *THE FLAGSHIP SLIPS AWAY* draws the deep's scene (the sea's surface, the dawn sun of a
 *   flawless run, the ARK's silhouette sailing off to the right) and its epilogue; *THE CITADEL
 *   FALLS SILENT* the citadel's silhouette with blasts over it;
 * - **the TV build** — the Tizen `dist/` from `file://` in open space: IRON SOVEREIGN and the ABYSS
 *   ARK brought in through the debug API, and the citadel's ending scene, draw from the one-script
 *   bundle;
 * - no console errors or atlas warnings anywhere.
 *
 * Screenshots are ×3 (viewport 1152×648): frame pixel (x, y) is screenshot pixel (3x + 1, 3y + 1).
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { decodePng } from '../../scripts/assets/png.mjs';
import { ABYSS_RAMP } from '../../scripts/assets/procedural/abyss.mjs';
import { CITADEL_RAMP } from '../../scripts/assets/procedural/citadel.mjs';
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

/** IRON SOVEREIGN's hull (#6e7686 lit, #30343e dark) — only its hull (and the core's ring). */
const SOVEREIGN_HULL = [rgb('#6e7686'), rgb('#30343e')] as const;
/** The ABYSS ARK's bone plating (#b8b09a, #7a7462) — only the ARK's sections, turrets, heart. */
const ARK_BONE = [rgb('#b8b09a'), rgb('#7a7462')] as const;
/** The ending's ARK silhouette (#3a382e, lit #5a5648 — `ui/ending-ark`). */
const ENDING_ARK = [rgb('#3a382e'), rgb('#5a5648')] as const;
/** The ending's citadel silhouette (#20242c, lit #383e4a — `ui/ending-citadel`). */
const ENDING_CITADEL = [rgb('#20242c'), rgb('#383e4a')] as const;
/** The dawn sun's rays (#f8d080 — `ui/ending-sun`). */
const ENDING_SUN = [rgb('#f8d080')] as const;
/** The sea's surface from below (#a0f0f0 — `ui/ending-surface`). */
const ENDING_SURFACE = [rgb('#a0f0f0')] as const;
/** The citadel wall's running lights (the only colours its palette cycle shows). */
const LIGHTS = CITADEL_RAMP.map(rgb);
/** The murk's specks (the only colours its palette cycle shows). */
const SPECKS = ABYSS_RAMP.map(rgb);

/** A rectangle of frame pixels (inclusive start, exclusive end). */
interface Area {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/** The right half of the playfield, below the HUD bar. */
const RIGHT_HALF: Area = { x0: 192, y0: 8, x1: 384, y1: 208 };

/** The whole playfield below the HUD bar. */
const PLAYFIELD: Area = { x0: 0, y0: 8, x1: 384, y1: 216 };

/** The top of the playfield below the HUD bar (the far bands). */
const SKY: Area = { x0: 0, y0: 8, x1: 384, y1: 100 };

/** The ending's sprite scene (above its epilogue panel). */
const SCENE: Area = { x0: 0, y0: 0, x1: 384, y1: 122 };

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

/** Where a colour set shows in an area: how many pixels, and their mean x. */
interface Found {
  /** Pixels. */
  readonly count: number;
  /** Their mean frame x (NaN when none). */
  readonly meanX: number;
}

/**
 * Finds the frame pixels of an area within 2 of any of the colours.
 *
 * @param page - The page.
 * @param colours - The colours.
 * @param area - The area (frame pixels).
 * @returns Their count and mean x.
 */
async function find(page: Page, colours: readonly Rgb[], area: Area): Promise<Found> {
  const at = await frame(page);
  let n = 0;
  let sx = 0;
  for (let fy = area.y0; fy < area.y1; fy++) {
    for (let fx = area.x0; fx < area.x1; fx++) {
      if (which(at(fx, fy), colours) >= 0) {
        n++;
        sx += fx;
      }
    }
  }
  return { count: n, meanX: n === 0 ? Number.NaN : sx / n };
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

/**
 * How many pixels that show a ramp colour in both maps changed their ramp colour.
 *
 * @param a - The first map.
 * @param b - The second map.
 * @returns The count.
 */
function stepped(a: readonly number[], b: readonly number[]): number {
  let n = 0;
  for (let i = 0; i < a.length; i++) if (a[i] >= 0 && b[i] >= 0 && a[i] !== b[i]) n++;
  return n;
}

/** `window` with the parts of the test build's debug API the spec uses. */
interface DebugWindow {
  readonly __shmupDebug: {
    readonly worldTick: number;
    readonly sceneId: string;
    readonly flags: { godMode: boolean };
    readonly game: {
      requestStep(count: number): void;
      readonly world: {
        readonly content: { readonly enemyIndex: ReadonlyMap<string, number> };
        readonly stage: { readonly stage: { readonly id: string }; jumpTo(x: number): void } | null;
        readonly bosses: {
          readonly boss: { readonly state: number; readonly specIndex: number };
          startBoss(enemyIndex: number): boolean;
          clear(): void;
        };
      };
      readonly scenes: {
        readonly campaign: {
          readonly zones: ReadonlyArray<{ readonly id: string }>;
          readonly endings: ReadonlyArray<{
            readonly id: string;
            readonly text: readonly string[];
          }>;
        } | null;
        readonly stack: { reset(scene: unknown): void };
        readonly ending: { readonly ticks: number; readonly shown: number; readonly scene: number };
        readonly run: {
          campaign: unknown;
          zone: number;
          flags: number;
          deaths: number;
          ending: unknown;
          readonly route: number[];
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
    return {
      tick: api.worldTick,
      stage: world.stage === null ? null : world.stage.stage.id,
      state: boss.state,
      boss: id,
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
 * Puts the scene flow on the ending of a campaign run through the debug API: the run's route to
 * the ending's final zone, no ship lost, the given run flags, the ending itself.
 *
 * @param page - The page (frozen).
 * @param ending - The ending's id.
 * @param flags - The run's flags (`RunFlag`: 1 a boss escaped).
 * @returns The ending's epilogue.
 */
async function openEnding(page: Page, ending: string, flags: number): Promise<string[]> {
  const text = await page.evaluate(
    ([id, runFlags]) => {
      const flow = (window as unknown as DebugWindow).__shmupDebug.game.scenes;
      const campaign = flow.campaign;
      if (campaign === null) throw new Error('no campaign');
      const spec = campaign.endings.find((e) => e.id === id);
      if (spec === undefined) throw new Error('no ending ' + String(id));
      const run = flow.run;
      run.campaign = campaign;
      run.route.length = 0;
      const last = id.startsWith('citadel') ? 'h' : 'i';
      for (const zone of ['a', 'c', 'e', 'g', last]) {
        run.route.push(campaign.zones.findIndex((z) => z.id === zone));
      }
      run.zone = run.route[run.route.length - 1];
      run.deaths = 0;
      run.flags = runFlags;
      run.ending = spec;
      flow.stack.reset(flow.ending);
      return spec.text.slice();
    },
    [ending, flags] as const,
  );
  // The reset applies on the next tick, which re-enters the ending (its ticks from 0).
  await page.evaluate(() => {
    (window as unknown as DebugWindow).__shmupDebug.game.requestStep(2);
  });
  await page.waitForFunction(() => {
    const api = (window as unknown as DebugWindow).__shmupDebug;
    const ticks = api.game.scenes.ending.ticks;
    return api.sceneId === 'ending' && ticks >= 1 && ticks <= 2;
  });
  await expect(page.locator('#game')).toHaveAttribute('data-shmup-scene', 'ending');
  return text;
}

/**
 * Runs ticks under frame advance while a scene without a World tick plays (the ending), then waits
 * until the ending's own tick count moved on and two frames show it.
 *
 * @param page - The page (frozen).
 * @param ticks - Ticks to run.
 * @returns The ending's tick count after them.
 */
async function stepScene(page: Page, ticks: number): Promise<number> {
  const before = await page.evaluate(() => {
    const api = (window as unknown as DebugWindow).__shmupDebug;
    return api.game.scenes.ending.ticks;
  });
  await page.evaluate((count) => {
    (window as unknown as DebugWindow).__shmupDebug.game.requestStep(count);
  }, ticks);
  const reached = await page.waitForFunction((target) => {
    const now = (window as unknown as DebugWindow).__shmupDebug.game.scenes.ending.ticks;
    return now >= target ? now : false;
  }, before + ticks);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
  return (await reached.jsonValue()) as number;
}

test.describe('zones H and I (web build)', () => {
  test('IRON CITADEL: the cycling fortress wall, then IRON SOVEREIGN holds the right half', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const errors = watchErrors(page);
    await open(page, './?scene=flight&stage=zone-h');
    const start = await stepTo(page, 60);
    expect((await bossNow(page)).stage).toBe('zone-h');
    // The wall's running lights in their ramp colours; the cycle recolours the same pixels later.
    const lights = await rampMap(page, LIGHTS, SKY);
    expect(lights.filter((k) => k >= 0).length).toBeGreaterThan(50);
    let later = lights;
    for (let k = 1; k <= 6 && stepped(lights, later) === 0; k++) {
      await stepTo(page, start + 15 * k);
      later = await rampMap(page, LIGHTS, SKY);
    }
    expect(stepped(lights, later)).toBeGreaterThan(10);
    // (The same greys show here and there in the zone's rock: count what the finale adds.)
    const before = (await find(page, SOVEREIGN_HULL, RIGHT_HALF)).count;
    // The end of the stage: the WARNING (x 9,100), then the finale.
    await page.evaluate(() => {
      (window as unknown as DebugWindow).__shmupDebug.game.world.stage?.jumpTo(9000);
    });
    const fight = await stepUntilFight(page, 40);
    expect(fight.boss).toBe('iron-sovereign');
    expect((await find(page, SOVEREIGN_HULL, RIGHT_HALF)).count).toBeGreaterThan(before + 700);
    expect(errors).toEqual([]);
  });

  test('ABYSSAL THRONE: the cycling murk, then the ABYSS ARK`s bone plating fills the raid`s view', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const errors = watchErrors(page);
    await open(page, './?scene=flight&stage=zone-i');
    const start = await stepTo(page, 60);
    expect((await bossNow(page)).stage).toBe('zone-i');
    const specks = await rampMap(page, SPECKS, SKY);
    expect(specks.filter((k) => k >= 0).length).toBeGreaterThan(50);
    let later = specks;
    for (let k = 1; k <= 6 && stepped(specks, later) === 0; k++) {
      await stepTo(page, start + 15 * k);
      later = await rampMap(page, SPECKS, SKY);
    }
    expect(stepped(specks, later)).toBeGreaterThan(10);
    expect((await find(page, ARK_BONE, PLAYFIELD)).count).toBe(0);
    await page.evaluate(() => {
      (window as unknown as DebugWindow).__shmupDebug.game.world.stage?.jumpTo(8900);
    });
    const fight = await stepUntilFight(page, 60);
    expect(fight.boss).toBe('abyss-ark');
    expect((await find(page, ARK_BONE, PLAYFIELD)).count).toBeGreaterThan(1500);
    expect(errors).toEqual([]);
  });

  test('the endings: the flagship sails off under the dawn; the citadel falls under its blasts', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const errors = watchErrors(page);
    await open(page, './');
    await expect(page.locator('#game')).toHaveAttribute('data-shmup-scene', 'title');
    // A flawless run whose ARK escaped: THE FLAGSHIP SLIPS AWAY, the deep's scene.
    const escape = await openEnding(page, 'throne-escape', 1);
    expect(escape.length).toBeGreaterThan(0);
    await stepScene(page, 10);
    const sailing = await find(page, ENDING_ARK, SCENE);
    expect(sailing.count).toBeGreaterThan(400);
    expect((await find(page, ENDING_SUN, SCENE)).count).toBeGreaterThan(5); // half above the frame
    expect((await find(page, ENDING_SURFACE, SCENE)).count).toBeGreaterThan(100);
    await stepScene(page, 160);
    const sailed = await find(page, ENDING_ARK, SCENE);
    expect(sailed.meanX - sailing.meanX).toBeGreaterThan(30); // 1 px every 4 ticks, to the right
    expect(
      await page.evaluate(
        () => (window as unknown as DebugWindow).__shmupDebug.game.scenes.ending.shown,
      ),
    ).toBeGreaterThanOrEqual(1);
    // THE CITADEL FALLS SILENT: the citadel's silhouette, blasts over it, no ARK.
    await openEnding(page, 'citadel-flawless', 0);
    await stepScene(page, 40);
    expect((await find(page, ENDING_CITADEL, SCENE)).count).toBeGreaterThan(1500);
    expect((await find(page, ENDING_ARK, SCENE)).count).toBe(0);
    // The dawn: the sun rises from behind the horizon band after 120 ticks.
    expect((await find(page, ENDING_SUN, SCENE)).count).toBe(0);
    await stepScene(page, 260);
    expect((await find(page, ENDING_SUN, SCENE)).count).toBeGreaterThan(5);
    expect((await find(page, ENDING_CITADEL, SCENE)).count).toBeGreaterThan(1500);
    expect(errors).toEqual([]);
  });
});

test.describe('zones H and I (Tizen build via file://)', () => {
  test('IRON SOVEREIGN and the ABYSS ARK, brought in through the debug API, draw on the TV build', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const errors = watchErrors(page);
    await open(page, TIZEN_INDEX + '?scene=flight');
    await stepTo(page, 30);
    expect(await startBoss(page, 'iron-sovereign')).toBe(true);
    const sovereign = await stepUntilFight(page, 20);
    expect(sovereign.boss).toBe('iron-sovereign');
    expect((await find(page, SOVEREIGN_HULL, RIGHT_HALF)).count).toBeGreaterThan(700);
    await page.evaluate(() => {
      (window as unknown as DebugWindow).__shmupDebug.game.world.bosses.clear();
    });
    await stepTo(page, sovereign.tick + 5);
    expect(await startBoss(page, 'abyss-ark')).toBe(true);
    const ark = await stepUntilFight(page, 20);
    expect(ark.boss).toBe('abyss-ark');
    expect((await find(page, ARK_BONE, PLAYFIELD)).count).toBeGreaterThan(1500);
    expect((await find(page, SOVEREIGN_HULL, RIGHT_HALF)).count).toBe(0);
    expect(errors).toEqual([]);
  });

  test('the citadel`s ending scene draws on the TV build', async ({ page }) => {
    test.setTimeout(180_000);
    const errors = watchErrors(page);
    await open(page, TIZEN_INDEX);
    await expect(page.locator('#game')).toHaveAttribute('data-shmup-scene', 'title');
    await openEnding(page, 'citadel', 0);
    await stepScene(page, 40);
    expect((await find(page, ENDING_CITADEL, SCENE)).count).toBeGreaterThan(1500);
    expect(errors).toEqual([]);
  });
});
