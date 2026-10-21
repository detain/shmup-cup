/**
 * Shared helpers of the zone browser specs (R5-P.P5d: the pair specs `zones-bc/-de/-fg/-hi`
 * split into one file per zone — `zone-b.spec.ts` … `zone-i.spec.ts`). Everything the four files
 * each held a copy of lives here: the Tizen build's `file://` page URL, the colour and area
 * helpers, the pixel samplers (`countColours` / `rampMap` / `stepped` / `find`), the debug-API
 * types and readers (`DebugWindow` / `BossNow` / `bossNow`), the page lifecycle (`watchErrors` /
 * `open` / `stepUntilFight` / `jumpTo` / `startBoss`) and the ending scenes' kit (`openEnding` /
 * `stepScene`, their colours and {@link SCENE}).
 *
 * Every helper is the pair files' own code verbatim. The only merges: the debug-API trio carries
 * the union of the fields the four files' narrower copies declared and read (each zone spec
 * still asserts on exactly what it asserted before — a `bossNow` read crosses the CDP boundary
 * and changes nothing in the page), and the pixel counting follows `zones-fg/-hi.spec.ts`'s
 * `frame` / `which` shape, which `zones-bc/-de.spec.ts`'s inline decode of the same screenshot
 * computed identically (±2 per channel, the centre sample of each frame pixel's block).
 *
 * @module
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, type Page } from '@playwright/test';
import { decodePng } from '../../scripts/assets/png.mjs';
import { freezeSim, stepTo } from './frame-advance.js';
import {
  FRAME_CX,
  FRAME_W,
  HUD_BOTTOM_Y,
  PLAYFIELD_Y,
  pixelIndex,
  sx,
  sy,
  uiPx,
} from './frame-pixels.js';
import { BOOT_TIMEOUT_MS } from './ticks.js';

/** The Tizen build's page, as a `file://` URL. */
export const TIZEN_INDEX = pathToFileURL(
  fileURLToPath(new URL('../../apps/tizen/dist/index.html', import.meta.url)),
).href;

/** An RGB colour. */
export type Rgb = readonly [number, number, number];

/**
 * A `#rrggbb` colour as RGB.
 *
 * @param hex - The colour.
 * @returns Its channels.
 */
export function rgb(hex: string): Rgb {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** A rectangle of frame pixels (inclusive start, exclusive end). */
export interface Area {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/** The right half of the playfield, below the HUD bar. */
export const RIGHT_HALF: Area = { x0: FRAME_CX, y0: PLAYFIELD_Y, x1: FRAME_W, y1: HUD_BOTTOM_Y };

/** The top of the playfield below the HUD bar (the far bands, above most terrain). */
export const SKY: Area = { x0: 0, y0: PLAYFIELD_Y, x1: FRAME_W, y1: 100 };

/** The ending's ARK silhouette (#3a382e, lit #5a5648 — `ui/ending-ark`). */
export const ENDING_ARK = [rgb('#3a382e'), rgb('#5a5648')] as const;
/** The ending's citadel silhouette (#20242c, lit #383e4a — `ui/ending-citadel`). */
export const ENDING_CITADEL = [rgb('#20242c'), rgb('#383e4a')] as const;
/** The dawn sun's rays (#f8d080 — `ui/ending-sun`). */
export const ENDING_SUN = [rgb('#f8d080')] as const;
/** The sea's surface from below (#a0f0f0 — `ui/ending-surface`). */
export const ENDING_SURFACE = [rgb('#a0f0f0')] as const;

/**
 * The ending's sprite scene (above its epilogue panel): core `ENDING_SCENE_LAYOUT`'s horizon
 * (art rows 104, 16 tall → the panel starts at uiPx(104) + uiPx(16)) plus a 2-row margin.
 */
export const SCENE: Area = { x0: 0, y0: 0, x1: FRAME_W, y1: uiPx(104) + uiPx(16) + 2 };

/**
 * The frame's pixels (the centre sample of each one's screenshot block).
 *
 * @param page - The page.
 * @returns A function reading frame pixel (x, y) as RGB.
 */
async function frame(page: Page): Promise<(x: number, y: number) => Rgb | null> {
  const png = await page.locator('#game').screenshot();
  const { width, height, data } = decodePng(new Uint8Array(png));
  return (fx, fy) => {
    if (sx(fx) >= width || sy(fy) >= height) return null;
    const i = pixelIndex(width, fx, fy);
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
export async function countColours(
  page: Page,
  colours: readonly Rgb[],
  area: Area,
): Promise<number> {
  const at = await frame(page);
  let n = 0;
  for (let fy = area.y0; fy < area.y1; fy++) {
    for (let fx = area.x0; fx < area.x1; fx++) if (which(at(fx, fy), colours) >= 0) n++;
  }
  return n;
}

/** Where a colour set shows in an area: how many pixels, and their mean x. */
export interface Found {
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
export async function find(page: Page, colours: readonly Rgb[], area: Area): Promise<Found> {
  const at = await frame(page);
  let n = 0;
  let sumX = 0;
  for (let fy = area.y0; fy < area.y1; fy++) {
    for (let fx = area.x0; fx < area.x1; fx++) {
      if (which(at(fx, fy), colours) >= 0) {
        n++;
        sumX += fx;
      }
    }
  }
  return { count: n, meanX: n === 0 ? Number.NaN : sumX / n };
}

/**
 * The ramp colour of every pixel of an area (-1 where another colour shows).
 *
 * @param page - The page.
 * @param colours - The ramp.
 * @param area - The area (frame pixels).
 * @returns One entry per pixel, row by row.
 */
export async function rampMap(page: Page, colours: readonly Rgb[], area: Area): Promise<number[]> {
  const at = await frame(page);
  const out: number[] = [];
  for (let fy = area.y0; fy < area.y1; fy++) {
    for (let fx = area.x0; fx < area.x1; fx++) out.push(which(at(fx, fy), colours));
  }
  return out;
}

/**
 * Whether two ramp maps show a pixel of the ramp in both that changed colour — the cycle stepped.
 *
 * @param a - The first map.
 * @param b - The second map.
 * @returns How many ramp pixels changed their ramp colour.
 */
export function stepped(a: readonly number[], b: readonly number[]): number {
  let n = 0;
  for (let i = 0; i < a.length; i++) if (a[i] >= 0 && b[i] >= 0 && a[i] !== b[i]) n++;
  return n;
}

/** `window` with the parts of the test build's debug API the zone specs use. */
export interface DebugWindow {
  readonly __shmupDebug: {
    readonly worldTick: number;
    readonly sceneId: string;
    readonly flags: { godMode: boolean };
    readonly game: {
      requestStep(count: number): void;
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
              readonly angle: number;
              readonly worldAngle: number;
            }>;
          };
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

/** What {@link bossNow} reads (the union of the four pair specs' narrower copies). */
export interface BossNow {
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
  /** Whether a part named `maw` is open. */
  readonly mouthOpen: boolean;
  /** Whether a part named `chest` is open. */
  readonly chestOpen: boolean;
  /** The world angle of a part named `hub` (-1 when none). */
  readonly hubAngle: number;
  /** The own turn of the part named `seg-top-1` or `arm-top-1` (-1 when none). */
  readonly armAngle: number;
}

/**
 * Reads the World's stage, camera and main boss slot.
 *
 * @param page - The page.
 * @returns The snapshot.
 */
export function bossNow(page: Page): Promise<BossNow> {
  return page.evaluate(() => {
    const api = (window as unknown as DebugWindow).__shmupDebug;
    const world = api.game.world;
    const boss = world.bosses.boss;
    let id = '';
    for (const [name, index] of world.content.enemyIndex) if (index === boss.specIndex) id = name;
    let hubAngle = -1;
    let armAngle = -1;
    let chestOpen = false;
    let mouthOpen = false;
    for (let i = 0; i < boss.partCount; i++) {
      const part = boss.parts[i];
      if (part.name === 'hub') hubAngle = part.worldAngle;
      if (part.name === 'chest' && part.open) chestOpen = true;
      if (part.name === 'maw' && part.open) mouthOpen = true;
      if (part.name === 'seg-top-1' || part.name === 'arm-top-1') armAngle = part.angle;
    }
    return {
      tick: api.worldTick,
      stage: world.stage === null ? null : world.stage.stage.id,
      cameraY: world.camera.y,
      state: boss.state,
      boss: id,
      mouthOpen,
      chestOpen,
      hubAngle,
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
export function watchErrors(page: Page): string[] {
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
export async function open(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await expect(page.locator('#game')).toHaveAttribute('data-shmup-state', 'running', {
    timeout: BOOT_TIMEOUT_MS,
  });
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
export async function stepUntilFight(page: Page, blocks: number): Promise<BossNow> {
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
export async function jumpTo(page: Page, x: number): Promise<void> {
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
export function startBoss(page: Page, id: string): Promise<boolean> {
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
export async function openEnding(page: Page, ending: string, flags: number): Promise<string[]> {
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
export async function stepScene(page: Page, ticks: number): Promise<number> {
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
