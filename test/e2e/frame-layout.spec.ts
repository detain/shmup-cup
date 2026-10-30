/**
 * The frame's layout in a real browser (plan_resolution.md R2-01's acceptance — and R1-04's
 * deferred browser check of the font cell, owner decision O7): headless Chromium on the web build
 * and the Tizen build opened from disk, at the e2e viewport (`frame-pixels.ts` `VIEWPORT`, the
 * frame at ×`SCALE`). Every check is written in the frame's constants, so the file proves the
 * 9 × 12 font and the ×2 picture at 640×360 (since R2-01), as it proved the 6 × 8 font and ×3 at
 * 384×216, unedited:
 *
 * - **the picture**: the canvas is the viewport, every `SCALE × SCALE` block of it one frame pixel
 *   (the integer upscale), the HUD bars exactly `HUD_BAR_HEIGHT · SCALE` screen rows tall;
 * - **the HUD bars** at frame rows `0 … HUD_BAR_HEIGHT − 1` and `HUD_BOTTOM_Y … FRAME_H − 1`, the
 *   playfield between them;
 * - **the font cell**: the `1P` label in the top bar is the atlas font's `1` and `P` glyphs, ink
 *   for ink, `GLYPH_W` apart, each glyph a `GLYPH_W × GLYPH_H` cell inside the bar (likewise the
 *   co-op HUD's `2P` and the Direct HUD's `SHOT`);
 * - **the title**: its menu centred on `FRAME_CX`;
 * - **the panels** — pause, an Options page, the name entry — drawn whole inside the frame (all
 *   four border edges on screen) and centred on `FRAME_CX`; the zone map's graph inside the frame.
 *
 * Every capture is attached to the test (`testInfo.attach`) and kept in its output folder for the
 * layout pass and the review. webOS boots in `webos.spec.ts`.
 *
 * Key taps and pauses count the game's ticks (`ticks.ts`), never rAF frames: on a runner drawing
 * about 3 frames a second (2 CPUs, C5 review 4's repro; up to 4 ticks a frame) the frame-paced
 * taps ran this spec at up to 100 % of its test timeouts (the name-entry test timed out once).
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { buildAtlas } from '../../scripts/assets/pipeline.mjs';
import { decodePng } from '../../scripts/assets/png.mjs';
import {
  FRAME_CX,
  FRAME_CY,
  FRAME_H,
  FRAME_W,
  GLYPH_H,
  GLYPH_W,
  HUD_BAR_HEIGHT,
  HUD_BOTTOM_Y,
  LINE_H,
  PLAYFIELD_Y,
  SCALE,
  VIEWPORT,
  pixelIndex,
} from './frame-pixels.js';
import {
  BOOT_TIMEOUT_MS,
  GAME_OVER_DELAY_TICKS,
  SCENE_SLACK_TICKS,
  STAGE_CLEAR_DELAY_TICKS,
  ZONE_CARD_TICKS,
  expectScene,
  tap,
  waitTicks,
} from './ticks.js';

/** The Tizen build's page, as a `file://` URL. */
const TIZEN_INDEX = pathToFileURL(
  fileURLToPath(new URL('../../apps/tizen/dist/index.html', import.meta.url)),
).href;

/** The two builds the frame checks run on. */
const BUILDS = [
  { name: 'web build', url: './' },
  { name: 'Tizen build via file://', url: TIZEN_INDEX },
] as const;

/** An RGB colour. */
type Rgb = readonly [number, number, number];

/**
 * A `0xrrggbb` colour as RGB.
 *
 * @param hex - The colour.
 * @returns Its channels.
 */
const rgb = (hex: number): Rgb => [(hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff];

/** HUD bar fill (core `ui` `HUD_COLORS.bar`). */
const HUD_BAR = rgb(0x1d2a5c);

/** Player 1's label (`HUD_COLORS.p1`). */
const P1_LABEL = rgb(0x38c8e8);

/** Player 2's label once it plays (`HUD_COLORS.p2`). */
const P2_LABEL = rgb(0xf88858);

/** The Direct HUD's pip labels — `SHOT`, `SUB`, … (`HUD_COLORS.pipLabel`). */
const PIP_LABEL = rgb(0x9aa0c0);

/** Normal menu text (`UI_COLORS.text`). */
const MENU_TEXT = rgb(0xe8e8f0);

/** A panel rim's magenta top and bottom line (`UI_COLORS.border`, two-tone since R4-03.C6). */
const PANEL_BORDER = rgb(0xb838a8);

/** A panel rim's cyan side rails (`UI_COLORS.rimInner`) — only along the default border. */
const PANEL_RAIL = rgb(0x38c8e8);

/** The zone map's focused node and cleared zone (`UI_COLORS.focus`). */
const FOCUS_YELLOW = rgb(0xf8d030);

/** A decoded canvas screenshot. */
interface Shot {
  /** Width in pixels. */
  readonly width: number;
  /** Height in pixels. */
  readonly height: number;
  /** RGBA pixels. */
  readonly data: Uint8Array;
}

/** A rectangle in frame pixels, edges inclusive. */
interface Box {
  /** Left column. */
  readonly x0: number;
  /** Top row. */
  readonly y0: number;
  /** Right column. */
  readonly x1: number;
  /** Bottom row. */
  readonly y1: number;
}

/**
 * Screenshots the game canvas, attaches the PNG to the test and keeps it in the test's output
 * folder (`test/e2e/test-results/<test>/<name>.png`, git-ignored) for the layout pass to read.
 *
 * @param page - The page.
 * @param testInfo - The running test (the capture is attached to it).
 * @param name - The attachment's name.
 * @returns The decoded pixels.
 */
async function shoot(page: Page, testInfo: TestInfo, name: string): Promise<Shot> {
  const png = await page.locator('#game').screenshot({ path: testInfo.outputPath(`${name}.png`) });
  await testInfo.attach(name, { body: png, contentType: 'image/png' });
  const { width, height, data } = decodePng(new Uint8Array(png));
  return { width, height, data };
}

/**
 * The colour of a frame pixel (the centre sample of its block).
 *
 * @param shot - The screenshot.
 * @param fx - Frame column.
 * @param fy - Frame row.
 * @returns RGB.
 */
function at(shot: Shot, fx: number, fy: number): Rgb {
  const i = pixelIndex(shot.width, fx, fy);
  return [shot.data[i], shot.data[i + 1], shot.data[i + 2]];
}

/**
 * Whether a colour is within `tolerance` of another on every channel.
 *
 * @param a - A colour.
 * @param b - The other.
 * @param tolerance - Largest difference per channel.
 * @returns `true` when they match.
 */
function near(a: Rgb, b: Rgb, tolerance = 2): boolean {
  return (
    Math.abs(a[0] - b[0]) <= tolerance &&
    Math.abs(a[1] - b[1]) <= tolerance &&
    Math.abs(a[2] - b[2]) <= tolerance
  );
}

/**
 * How many frame pixels of a frame row have a colour.
 *
 * @param shot - The screenshot.
 * @param fy - Frame row.
 * @param colour - The colour.
 * @returns The count (0 … `FRAME_W`).
 */
function rowCount(shot: Shot, fy: number, colour: Rgb): number {
  let n = 0;
  for (let fx = 0; fx < FRAME_W; fx++) if (near(at(shot, fx, fy), colour)) n++;
  return n;
}

/**
 * The bounding box of the frame pixels of a colour inside a region.
 *
 * @param shot - The screenshot.
 * @param colour - The colour.
 * @param region - Where to look (default the whole frame).
 * @returns The box, or `null` when no pixel has the colour.
 */
function bounds(shot: Shot, colour: Rgb, region: Box = FRAME_BOX): Box | null {
  let x0 = FRAME_W;
  let y0 = FRAME_H;
  let x1 = -1;
  let y1 = -1;
  for (let fy = region.y0; fy <= region.y1; fy++) {
    for (let fx = region.x0; fx <= region.x1; fx++) {
      if (!near(at(shot, fx, fy), colour)) continue;
      x0 = Math.min(x0, fx);
      y0 = Math.min(y0, fy);
      x1 = Math.max(x1, fx);
      y1 = Math.max(y1, fy);
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

/** The whole frame. */
const FRAME_BOX: Box = { x0: 0, y0: 0, x1: FRAME_W - 1, y1: FRAME_H - 1 };

/**
 * Finds the one panel of a screen and checks it is drawn whole inside the frame: the bounding box
 * of its border colour, every one of its four 1-px edges on screen along its whole length (a
 * panel larger than the frame would lose an edge), not touching the frame's edge. As
 * `drawPanel` (R4-03.C6) draws it: the default rim is magenta top and bottom with cyan
 * side rails on the rows between the corners; an explicit border colour rings all four edges.
 *
 * @param shot - The screenshot.
 * @param border - The border's colour (default the UI kit's panel border).
 * @param region - Where the panel is (default the whole frame).
 * @returns The panel's box.
 */
function wholePanel(shot: Shot, border: Rgb = PANEL_BORDER, region: Box = FRAME_BOX): Box {
  const box = bounds(shot, border, region);
  expect(box, 'a panel border on screen').not.toBeNull();
  const b = box as Box;
  expect(b.x0).toBeGreaterThan(0);
  expect(b.y0).toBeGreaterThan(0);
  expect(b.x1).toBeLessThan(FRAME_W - 1);
  expect(b.y1).toBeLessThan(FRAME_H - 1);
  const side = border === PANEL_BORDER ? PANEL_RAIL : border;
  const edge = (points: readonly [number, number][], colour: Rgb): number =>
    points.filter(([fx, fy]) => near(at(shot, fx, fy), colour)).length / points.length;
  const columns = Array.from({ length: b.x1 - b.x0 + 1 }, (_, i) => b.x0 + i);
  const railRows = Array.from({ length: b.y1 - b.y0 - 1 }, (_, i) => b.y0 + 1 + i);
  expect(
    edge(
      columns.map((fx) => [fx, b.y0]),
      border,
    ),
    'top edge',
  ).toBeGreaterThan(0.95);
  expect(
    edge(
      columns.map((fx) => [fx, b.y1]),
      border,
    ),
    'bottom edge',
  ).toBeGreaterThan(0.95);
  expect(
    edge(
      railRows.map((fy) => [b.x0, fy]),
      side,
    ),
    'left edge',
  ).toBeGreaterThan(0.95);
  expect(
    edge(
      railRows.map((fy) => [b.x1, fy]),
      side,
    ),
    'right edge',
  ).toBeGreaterThan(0.95);
  return b;
}

/**
 * Asserts a box is centred on the frame's centre column (to the pixel: `(x0 + x1 + 1) / 2`).
 *
 * @param box - The box.
 * @param slack - Allowed distance in frame pixels.
 */
function expectCentredX(box: Box, slack = 1): void {
  expect(Math.abs((box.x0 + box.x1 + 1) / 2 - FRAME_CX)).toBeLessThanOrEqual(slack);
}

/** One glyph of the atlas's bitmap font: its ink, row-major, and its advance. */
interface Glyph {
  /** `GLYPH_W × GLYPH_H` flags, row-major: `true` where the glyph has ink. */
  readonly ink: readonly boolean[];
  /** How far the pen moves after it. */
  readonly advance: number;
}

/** The glyphs of the shipped font, read once per worker from the atlas the build ships. */
let glyphs: Map<string, Glyph> | null = null;

/**
 * A glyph of the font the builds ship: the asset pipeline's atlas, built in memory — the same
 * sources and art scale `build:test` packs into the builds (9 × 12 cells since R2-01's flip;
 * 6 × 8 before).
 *
 * @param ch - The character.
 * @returns Its ink and advance.
 */
function glyph(ch: string): Glyph {
  if (glyphs === null) {
    const atlas = buildAtlas();
    const font = atlas.manifest.fonts.pixel;
    // The cell the frame constants say: the font check below is only as good as this pin.
    expect([font.cellWidth, font.cellHeight]).toEqual([GLYPH_W, GLYPH_H]);
    glyphs = new Map();
    for (const [code, entry] of Object.entries(font.glyphs)) {
      const frame = atlas.manifest.frames[entry.frame];
      expect([frame.w, frame.h]).toEqual([GLYPH_W, GLYPH_H]);
      const page = atlas.pages[frame.p].image;
      const ink: boolean[] = [];
      for (let y = 0; y < GLYPH_H; y++) {
        for (let x = 0; x < GLYPH_W; x++) {
          ink.push(page.data[((frame.y + y) * page.width + frame.x + x) * 4 + 3] > 0);
        }
      }
      glyphs.set(String.fromCodePoint(Number(code)), { ink, advance: entry.advance });
    }
  }
  const found = glyphs.get(ch);
  if (found === undefined) throw new Error(`the font has no glyph for ${JSON.stringify(ch)}`);
  return found;
}

/**
 * Where a text is drawn in a colour: every place inside the rows where each of its glyphs is
 * found ink for ink — an ink pixel in the colour, every other pixel of its cell not in it.
 *
 * @param shot - The screenshot.
 * @param text - The text (no spaces needed).
 * @param colour - Its colour.
 * @param top - First frame row a cell may start on.
 * @param bottom - Last frame row a cell may end on.
 * @returns The cells' top-left corners, in frame pixels.
 */
function findText(
  shot: Shot,
  text: string,
  colour: Rgb,
  top: number,
  bottom: number,
): { x: number; y: number }[] {
  const chars = [...text].map(glyph);
  const width = chars.reduce((sum, g) => sum + g.advance, 0);
  const found: { x: number; y: number }[] = [];
  for (let y = top; y + GLYPH_H - 1 <= bottom; y++) {
    for (let x = 0; x + width <= FRAME_W; x++) {
      let pen = x;
      let ok = true;
      for (const g of chars) {
        for (let i = 0; ok && i < g.ink.length; i++) {
          const px = at(shot, pen + (i % GLYPH_W), y + Math.floor(i / GLYPH_W));
          ok = g.ink[i] === near(px, colour, 8);
        }
        if (!ok) break;
        pen += g.advance;
      }
      if (ok) found.push({ x, y });
    }
  }
  return found;
}

/**
 * Asserts a HUD label is drawn once in a bar, in the font's cell, and returns where.
 *
 * @param shot - The screenshot.
 * @param text - The label.
 * @param colour - Its colour.
 * @param barTop - The bar's first frame row (`0` or `HUD_BOTTOM_Y`).
 * @returns The label's top-left corner.
 */
function expectLabel(
  shot: Shot,
  text: string,
  colour: Rgb,
  barTop: number,
): { x: number; y: number } {
  const found = findText(shot, text, colour, barTop, barTop + HUD_BAR_HEIGHT - 1);
  expect(found, `${text} in the bar at row ${barTop}`).toHaveLength(1);
  return found[0];
}

/**
 * Asserts the two HUD bars sit at their rows: every row of the top bar mostly bar colour, every
 * row of the bottom one (its meter slots and labels cover most of it) bar colour at the frame's
 * right edge and along a sixteenth of the frame at least, the first and last playfield rows not.
 *
 * @param shot - A game's screenshot.
 */
function expectHudBars(shot: Shot): void {
  for (let fy = 0; fy < HUD_BAR_HEIGHT; fy++) {
    expect(rowCount(shot, fy, HUD_BAR), `top bar row ${fy}`).toBeGreaterThan(FRAME_W / 2);
    const bottom = HUD_BOTTOM_Y + fy;
    expect(near(at(shot, FRAME_W - 1, bottom), HUD_BAR), `bottom bar row ${bottom}`).toBe(true);
    expect(rowCount(shot, bottom, HUD_BAR), `bottom bar row ${bottom}`).toBeGreaterThan(
      FRAME_W / 16,
    );
  }
  expect(rowCount(shot, PLAYFIELD_Y, HUD_BAR), 'first playfield row').toBeLessThan(FRAME_W / 8);
  expect(rowCount(shot, HUD_BOTTOM_Y - 1, HUD_BAR), 'last playfield row').toBeLessThan(FRAME_W / 8);
}

/**
 * Asserts the screenshot is the frame upscaled ×`SCALE`: the canvas is the viewport, every
 * `SCALE × SCALE` block one colour, and the top HUD bar exactly `HUD_BAR_HEIGHT · SCALE` screen
 * rows tall at a column where it is plain bar.
 *
 * @param shot - A game's screenshot.
 */
function expectUpscaledFrame(shot: Shot): void {
  expect([shot.width, shot.height]).toEqual([VIEWPORT.width, VIEWPORT.height]);
  expect([shot.width, shot.height]).toEqual([FRAME_W * SCALE, FRAME_H * SCALE]);
  let mixed = 0;
  for (let by = 0; by < FRAME_H; by++) {
    for (let bx = 0; bx < FRAME_W; bx++) {
      const first = (by * SCALE * shot.width + bx * SCALE) * 4;
      for (let k = 1; k < SCALE * SCALE; k++) {
        const i =
          ((by * SCALE + Math.floor(k / SCALE)) * shot.width + bx * SCALE + (k % SCALE)) * 4;
        if (
          shot.data[i] !== shot.data[first] ||
          shot.data[i + 1] !== shot.data[first + 1] ||
          shot.data[i + 2] !== shot.data[first + 2]
        ) {
          mixed++;
          break;
        }
      }
    }
  }
  expect(mixed, 'frame-pixel blocks of more than one colour').toBe(0);
  /**
   * How many screen rows from the top of one screenshot column are HUD-bar coloured.
   *
   * @param sxCol - A screen column of the screenshot.
   * @returns The run of bar-coloured rows from row 0, in screen pixels.
   */
  const screenRows = (sxCol: number): number => {
    let n = 0;
    while (n < shot.height) {
      const i = (n * shot.width + sxCol) * 4;
      if (!near([shot.data[i], shot.data[i + 1], shot.data[i + 2]], HUD_BAR)) break;
      n++;
    }
    return n;
  };
  // Column 0 of the top bar holds no label (the 1P label starts further right).
  expect(screenRows(0)).toBe(HUD_BAR_HEIGHT * SCALE);
}

/**
 * Opens a build and waits for its title.
 *
 * @param page - The page.
 * @param url - The URL.
 * @returns The page's error log (filled as errors come).
 */
async function openTitle(page: Page, url: string): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(url);
  const canvas = page.locator('#game');
  await expect(canvas).toHaveAttribute('data-shmup-state', 'running', { timeout: BOOT_TIMEOUT_MS });
  await expect(canvas).toHaveAttribute('data-shmup-scene', 'title');
  await waitTicks(page, 10);
  return errors;
}

/**
 * From the title to a one-player game: 1 PLAYER, NORMAL, then the KESTREL and START — or the MANTA
 * (Direct mode, which has no weapon select).
 *
 * @param page - The page (on the title's PRESS OK).
 * @param ship - The ship to fly.
 */
async function startGame(page: Page, ship: 'kestrel' | 'manta' = 'kestrel'): Promise<void> {
  const canvas = page.locator('#game');
  await tap(page, 'Enter'); // PRESS OK → the menu
  await tap(page, 'Enter'); // 1 PLAYER
  await expect(canvas).toHaveAttribute('data-shmup-scene', 'difficulty');
  await tap(page, 'Enter'); // NORMAL
  await expect(canvas).toHaveAttribute('data-shmup-scene', 'shipSelect');
  if (ship === 'manta') {
    await tap(page, 'ArrowDown'); // MANTA
    await tap(page, 'Enter');
  } else {
    await tap(page, 'Enter'); // KESTREL
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'weaponSelect');
    await tap(page, 'Enter'); // START
  }
  await expect(canvas).toHaveAttribute('data-shmup-scene', 'game');
  await waitTicks(page, 60); // the fly-in
}

/** What the spec sets through the test build's `window.__shmupDebug`. */
interface DebugWindow {
  /** The test build's debug API. */
  readonly __shmupDebug: {
    /** The running game. */
    readonly game: {
      /** Its World: the spec writes a score and the status. */
      readonly world: {
        /** The World's status (`stageClear` / `gameOver` end it). */
        status: string;
        /** The score board: player 1's score is `scores[0].score`. */
        readonly scoring: { readonly board: { readonly scores: Array<{ score: number }> } };
      };
      /** The scene flow's screens the spec waits on. */
      readonly scenes: {
        /** The continue countdown: ticks since it opened. */
        readonly continueScreen: { readonly ticks: number };
        /** The game-over screen: ticks since it opened. */
        readonly gameOver: { readonly ticks: number };
      };
    };
  };
}

/**
 * Ends the running World through the debug API: a score, then a status. `stageClear` opens the
 * zone tally {@link STAGE_CLEAR_DELAY_TICKS} ticks later, `gameOver` the continue countdown
 * {@link GAME_OVER_DELAY_TICKS} ticks later: wait for them with `expectScene`, not wall time.
 *
 * @param page - The page.
 * @param status - The World's new status.
 */
async function endWorld(page: Page, status: 'stageClear' | 'gameOver'): Promise<void> {
  await page.evaluate((next) => {
    const world = (window as unknown as DebugWindow).__shmupDebug.game.world;
    world.scoring.board.scores[0].score = 12_340;
    world.status = next;
  }, status);
}

/**
 * Waits until a scene has run more than some ticks (its OK lock is over).
 *
 * @param page - The page.
 * @param scene - The scene's field in the scene flow.
 * @param ticks - Ticks it must have run past.
 */
async function waitSceneTicks(
  page: Page,
  scene: 'continueScreen' | 'gameOver',
  ticks: number,
): Promise<void> {
  await page.waitForFunction(
    ([name, min]) => (window as unknown as DebugWindow).__shmupDebug.game.scenes[name].ticks > min,
    [scene, ticks] as const,
  );
}

for (const build of BUILDS) {
  test.describe(`frame layout (${build.name})`, () => {
    test('the title: the frame at ×SCALE, its menu centred on the frame', async ({
      page,
    }, testInfo) => {
      test.setTimeout(90_000);
      const errors = await openTitle(page, build.url);
      await tap(page, 'Enter'); // PRESS OK → the menu
      await waitTicks(page, 6);
      const title = await shoot(page, testInfo, 'title-menu');
      expect([title.width, title.height]).toEqual([FRAME_W * SCALE, FRAME_H * SCALE]);
      // The unfocused items (normal text colour) below the centre row, above the hi-score's row
      // near the bottom edge: each line centred.
      let lines = 0;
      let fy = FRAME_CY;
      while (fy < FRAME_H - 3 * LINE_H) {
        const line = bounds(title, MENU_TEXT, { x0: 0, y0: fy, x1: FRAME_W - 1, y1: fy });
        if (line === null) {
          fy++;
          continue;
        }
        let end = fy;
        while (
          end + 1 < FRAME_H &&
          bounds(title, MENU_TEXT, { x0: 0, y0: end + 1, x1: FRAME_W - 1, y1: end + 1 }) !== null
        ) {
          end++;
        }
        const box = bounds(title, MENU_TEXT, { x0: 0, y0: fy, x1: FRAME_W - 1, y1: end });
        if (box !== null) {
          // A centred label's ink: its last glyph's spacing column is blank, so allow a glyph.
          expectCentredX(box, GLYPH_W / 2 + 1);
          lines++;
        }
        fy = end + 1;
      }
      expect(lines, 'menu lines in the normal text colour').toBeGreaterThanOrEqual(3);
      expect(errors).toEqual([]);
    });

    test('a game: the picture upscaled, the HUD bars at their rows, 1P in the font cell', async ({
      page,
    }, testInfo) => {
      test.setTimeout(90_000);
      const errors = await openTitle(page, build.url);
      await startGame(page);
      const game = await shoot(page, testInfo, 'game-1p');
      expectUpscaledFrame(game);
      expectHudBars(game);
      const label = expectLabel(game, '1P', P1_LABEL, 0);
      expect(label.x).toBeLessThan(FRAME_CX);
      expect(label.y + GLYPH_H).toBeLessThanOrEqual(HUD_BAR_HEIGHT);
      expect(errors).toEqual([]);
    });
  });
}

test.describe('frame layout (web build): the screens', () => {
  test('pause and the zone map lie inside the frame', async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    const errors = await openTitle(page, './');
    const canvas = page.locator('#game');
    await startGame(page);
    // Past the launch zone card (R4-05.E3): it is a frame-wide v2-rimmed band and the paused
    // world keeps its card, so the pause-menu screenshot must wait the card's 150 ticks out.
    await waitTicks(page, ZONE_CARD_TICKS);
    await tap(page, 'Escape');
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'pause');
    await waitTicks(page, 4);
    const paused = await shoot(page, testInfo, 'pause');
    expectCentredX(wholePanel(paused));
    await tap(page, 'Escape');
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'game');
    await endWorld(page, 'stageClear');
    await expectScene(page, 'stageClear', STAGE_CLEAR_DELAY_TICKS + SCENE_SLACK_TICKS);
    await waitTicks(page, 10);
    await tap(page, 'Enter'); // skip the tally
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'map');
    await waitTicks(page, 10);
    const map = await shoot(page, testInfo, 'zone-map');
    // The zone's description panel along the bottom, and the graph above it.
    const description = wholePanel(map, PANEL_BORDER, {
      x0: 0,
      y0: FRAME_CY,
      x1: FRAME_W - 1,
      y1: FRAME_H - 1,
    });
    expectCentredX(description);
    const graph = bounds(map, FOCUS_YELLOW);
    expect(graph, 'the map in yellow').not.toBeNull();
    const g = graph as Box;
    expect([g.x0 > 0, g.y0 > 0, g.x1 < FRAME_W - 1, g.y1 < FRAME_H - 1]).toEqual([
      true,
      true,
      true,
      true,
    ]);
    expect(errors).toEqual([]);
  });

  test('the name entry and an Options page lie inside the frame', async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    const errors = await openTitle(page, './');
    const canvas = page.locator('#game');
    await startGame(page);
    await endWorld(page, 'gameOver');
    await expectScene(page, 'continue', GAME_OVER_DELAY_TICKS + SCENE_SLACK_TICKS);
    await waitSceneTicks(page, 'continueScreen', 40);
    await tap(page, 'Escape');
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'gameOver');
    await waitSceneTicks(page, 'gameOver', 40);
    await tap(page, 'Enter');
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'nameEntry');
    await waitTicks(page, 10);
    const entry = await shoot(page, testInfo, 'name-entry');
    expectCentredX(wholePanel(entry, FOCUS_YELLOW)); // the name entry's panel has a yellow border
    // A fresh title, then the Options screen through the title menu. The game flown above ended
    // AT the name entry, and that transition spent the run's checkpoint record (v20x-CONT —
    // `finishGame` calls `endRun` as the naming ceremony opens, so R2 TL-1's birth record cannot
    // outlive a finished run across a reload). The reloaded title therefore offers no CONTINUE?
    // row (the red F-E on the v2.1.0 gate was that row stealing the menu's first focus) and the
    // walk below audits the flow's own behaviour, not a scrubbed store. HELP (`beebff75`) joins
    // below OPTIONS, so three downs from 1 PLAYER reach it.
    await page.goto('./');
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'title', { timeout: BOOT_TIMEOUT_MS });
    await waitTicks(page, 10);
    await tap(page, 'Enter'); // PRESS OK → the menu
    await tap(page, 'ArrowDown'); // 2 PLAYERS
    await tap(page, 'ArrowDown'); // PRACTICE
    await tap(page, 'ArrowDown'); // OPTIONS
    await tap(page, 'Enter');
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'options');
    await waitTicks(page, 6);
    const options = await shoot(page, testInfo, 'options');
    const panel = wholePanel(options);
    expectCentredX(panel);
    expect(Math.abs((panel.y0 + panel.y1 + 1) / 2 - FRAME_CY)).toBeLessThanOrEqual(1);
    // Every line of the menu's text inside the panel. (Only the panel's rows: the title's
    // hi-score row, drawn under the Options overlay, may show below a panel that is shorter than
    // the frame.)
    const text = bounds(options, MENU_TEXT, {
      x0: 0,
      y0: panel.y0,
      x1: FRAME_W - 1,
      y1: panel.y1,
    });
    expect(text, 'the options text').not.toBeNull();
    const t = text as Box;
    expect([t.x0 > panel.x0, t.y0 > panel.y0, t.x1 < panel.x1, t.y1 < panel.y1]).toEqual([
      true,
      true,
      true,
      true,
    ]);
    expect(errors).toEqual([]);
  });

  test('the Direct HUD: the bars, 1P and SHOT in the font cell', async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    const errors = await openTitle(page, './');
    await startGame(page, 'manta');
    const game = await shoot(page, testInfo, 'game-direct');
    expectHudBars(game);
    expectLabel(game, '1P', P1_LABEL, 0);
    expectLabel(game, 'SHOT', PIP_LABEL, HUD_BOTTOM_Y);
    expect(errors).toEqual([]);
  });

  test('the two-player HUD: the bars, 1P and 2P in the font cell', async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    const errors = await openTitle(page, './?profile=keyboard-split');
    const canvas = page.locator('#game');
    await tap(page, 'Enter'); // PRESS OK (player 2's half drives the menus too)
    await tap(page, 'ArrowDown'); // 2 PLAYERS
    await tap(page, 'KeyF'); // player 1's OK
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'difficulty');
    await waitTicks(page, 4);
    await tap(page, 'KeyF'); // NORMAL
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'shipSelect');
    await waitTicks(page, 4);
    await tap(page, 'KeyF'); // KESTREL
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'weaponSelect');
    await waitTicks(page, 4);
    await tap(page, 'KeyF'); // START
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'game');
    await waitTicks(page, 30);
    await tap(page, 'Enter'); // player 2's START: it drops in
    await waitTicks(page, 90);
    const game = await shoot(page, testInfo, 'game-2p');
    expectHudBars(game);
    const p1 = expectLabel(game, '1P', P1_LABEL, 0);
    const p2 = expectLabel(game, '2P', P2_LABEL, 0);
    expect(p1.x).toBeLessThan(FRAME_CX);
    expect(p2.x).toBeGreaterThan(FRAME_CX);
    expect(errors).toEqual([]);
  });
});
