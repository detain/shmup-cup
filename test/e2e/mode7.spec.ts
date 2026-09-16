/**
 * Browser test of the visual showpieces of plan M3-02 in headless Chromium (SwiftShader WebGL):
 *
 * - the **Mode-7** and **CRT** programs compile and link in a real **WebGL1** context — the GLSL
 *   ES 1.0 check by the browser's own compiler, the one Chromium 69 on the TV will run — in both
 *   the shipped mesh pairing (`EFFECT_MESH_VERTEX` with each fragment shader, plan M3-02d) and
 *   the filter pairing the `screenPass: 'filter'` escape hatch still uses;
 * - the pseudo-3D stage `?stage=dimension` boots without errors and its floor shows: the rows
 *   under the horizon change when the floor's mesh is hidden, while the sky above them does not,
 *   and the frame stays inside {@link DRAW_CALL_BUDGET} WebGL draw calls;
 * - the CRT look only ever darkens (scanlines at `light`, plus the mask and vignette at `full`),
 *   and switching it off restores the picture pixel for pixel — since plan M3-02d it is the pass-2
 *   blit's own shader, so the picture must survive the fold unchanged with CRT `off`;
 * - the aspect modes reshape the picture: `classic` pillarboxes it with lit side panels, `wide`
 *   makes a cabinet window, `normal` fills the display again.
 *
 * Screenshots of the floor, the CRT settings and the aspect modes are attached to the report.
 * They are ×3 (viewport 1152×648): frame pixel (x, y) is screenshot pixel (3x + 1, 3y + 1); the
 * sim is frozen and stepped exact ticks (`./frame-advance.ts`).
 */
import { expect, test, type Page } from '@playwright/test';
import {
  CRT_FRAGMENT,
  CRT_VERTEX,
  EFFECT_MESH_VERTEX,
  MODE7_FRAGMENT,
  MODE7_VERTEX,
} from '../../packages/render-pixi/src/effects/shaders.js';
import { decodePng } from '../../scripts/assets/png.mjs';
import { freezeSim, stepTo } from './frame-advance.js';

/**
 * Most WebGL draw calls one frame of the dimension stage may take.
 *
 * Until plan **M3-02e** the plain frame took 2 (one batch for the whole scene, the upscale quad),
 * the Mode-7 floor added one draw call and a batch break — it is a mesh on `BG_MID` since
 * **M3-02d**, not a filter over a pooled render target (the render review's **F6**) — and the
 * budget sat at 12 with the stage's own layers on top.
 *
 * **M3-02e raised it to 16, deliberately** (`shmup_feat.md` §22, which allows 20–50): the layers
 * that toggle sprites every frame are now each their own Pixi render group, so one hidden bullet
 * rebuilds that layer's instruction set instead of the whole ~6,400-object scene's (the review's
 * **F1**). Every group is a batch boundary, so the scene costs about one draw call per group that
 * holds something: this stage measures **7** where it measured 3, and the raster range's busiest
 * frame 10 where it measured 7. 16 keeps the same ~5 calls of headroom the 12 had.
 */
const DRAW_CALL_BUDGET = 16;

/** The first playfield row the dimension stage's floor covers (its `mode7.horizon`). */
const FLOOR_TOP = 101;

/** The row after the last one it covers (`mode7.bottom`). */
const FLOOR_BOTTOM = 200;

/** A decoded screenshot. */
interface Shot {
  width: number;
  height: number;
  data: Uint8Array;
}

/** The parts of the renderer this spec touches. */
interface DebugRenderer {
  readonly mode7: { readonly active: boolean; readonly view: { visible: boolean } | null };
  readonly panels: { readonly panelLeft: number; readonly panelRight: number };
  readonly viewport: Placement;
  readonly crtFilter: string;
  readonly aspect: string;
  setCrtFilter(setting: string): void;
  setAspect(mode: string): void;
}

/** Where the frame sits on the display (`PixiRenderer.viewport`), in display pixels. */
interface Placement {
  /** Left column of the picture. */
  readonly x: number;
  /** Top row of the picture. */
  readonly y: number;
  /** The picture's width. */
  readonly width: number;
  /** Its height. */
  readonly height: number;
  /** The frame's scale on the display. */
  readonly scale: number;
  /** Its horizontal scale. */
  readonly scaleX: number;
  /** Its vertical scale. */
  readonly scaleY: number;
}

/** `window` with the test build's debug API. */
interface DebugWindow {
  readonly __shmupDebug: {
    readonly renderer: DebugRenderer;
    readonly stats: { readonly drawCalls: number };
  };
}

/**
 * Takes a screenshot of the canvas and decodes it.
 *
 * @param page - The page.
 * @returns The PNG bytes and the decoded image.
 */
async function capture(page: Page): Promise<{ png: Buffer; image: Shot }> {
  const png = await page.locator('#game').screenshot();
  return { png, image: decodePng(new Uint8Array(png)) };
}

/**
 * Waits two animation frames, so the canvas shows what the last change did.
 *
 * @param page - The page.
 */
async function settle(page: Page): Promise<void> {
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
}

/**
 * Counts the frame pixels of a row band that differ between two ×3 captures.
 *
 * @param a - First capture.
 * @param b - Second capture.
 * @param top - First frame row.
 * @param bottom - Row after the last.
 * @returns Differing frame pixels.
 */
function diffRows(a: Shot, b: Shot, top: number, bottom: number): number {
  let count = 0;
  for (let fy = top; fy < bottom && fy * 3 + 1 < a.height; fy++) {
    for (let fx = 0; fx < 384 && fx * 3 + 1 < a.width; fx++) {
      const i = ((fy * 3 + 1) * a.width + fx * 3 + 1) * 4;
      if (
        a.data[i] !== b.data[i] ||
        a.data[i + 1] !== b.data[i + 1] ||
        a.data[i + 2] !== b.data[i + 2]
      ) {
        count++;
      }
    }
  }
  return count;
}

/**
 * One display pixel of a capture.
 *
 * @param image - The capture.
 * @param x - Display column.
 * @param y - Display row.
 * @returns Its `[r, g, b]`.
 */
function pixelAt(image: Shot, x: number, y: number): [number, number, number] {
  const i = (y * image.width + x) * 4;
  return [image.data[i], image.data[i + 1], image.data[i + 2]];
}

/**
 * Mean channel value of a whole screenshot (a stand-in for brightness).
 *
 * @param image - The capture.
 * @returns The mean of the red, green and blue channels, 0 … 255.
 */
function meanLevel(image: Shot): number {
  let sum = 0;
  const pixels = image.width * image.height;
  for (let i = 0; i < pixels * 4; i += 4) {
    sum += image.data[i] + image.data[i + 1] + image.data[i + 2];
  }
  return sum / (pixels * 3);
}

/**
 * Reads where the frame is placed on the display.
 *
 * @param page - The page.
 * @returns The placement (`PixiRenderer.viewport`).
 */
function placementOf(page: Page): Promise<Placement> {
  return page.evaluate(() => {
    const v = (window as unknown as DebugWindow).__shmupDebug.renderer.viewport;
    return {
      x: v.x,
      y: v.y,
      width: v.width,
      height: v.height,
      scale: v.scale,
      scaleX: v.scaleX,
      scaleY: v.scaleY,
    };
  });
}

/** What {@link checkBlocks} found in an upscaled picture. */
interface BlockCheck {
  /** Frame pixels examined. */
  blocks: number;
  /** Display pixels that differ from the top-left pixel of the block they are in. */
  broken: number;
  /** The first such display pixel, `null` when the picture is block-exact. */
  firstBroken: [number, number] | null;
  /** Blocks whose colour differs from the block left of them (the test's own sensitivity). */
  varied: number;
}

/**
 * Checks that the upscaled picture is made of exact `scale × scale` blocks of one colour, anchored
 * at the picture's own origin — what decision D19 (integer-scaled pixel art) means in pixels, and
 * what a half-pixel error in the blit's vertex shader would break.
 *
 * @param image - A capture of the whole display.
 * @param place - Where the picture is.
 * @returns The finding.
 */
function checkBlocks(image: Shot, place: Placement): BlockCheck {
  const sx = place.scaleX;
  const sy = place.scaleY;
  const columns = place.width / sx;
  const rows = place.height / sy;
  const out: BlockCheck = { blocks: 0, broken: 0, firstBroken: null, varied: 0 };
  for (let fy = 0; fy < rows; fy++) {
    for (let fx = 0; fx < columns; fx++) {
      const x0 = place.x + fx * sx;
      const y0 = place.y + fy * sy;
      const base = pixelAt(image, x0, y0);
      out.blocks++;
      if (fx > 0) {
        const left = pixelAt(image, x0 - sx, y0);
        if (left[0] !== base[0] || left[1] !== base[1] || left[2] !== base[2]) out.varied++;
      }
      for (let dy = 0; dy < sy; dy++) {
        for (let dx = 0; dx < sx; dx++) {
          if (dx === 0 && dy === 0) continue;
          const here = pixelAt(image, x0 + dx, y0 + dy);
          if (here[0] !== base[0] || here[1] !== base[1] || here[2] !== base[2]) {
            out.broken++;
            out.firstBroken ??= [x0 + dx, y0 + dy];
          }
        }
      }
    }
  }
  return out;
}

/**
 * Counts display pixels that differ between two captures, inside or outside the picture.
 *
 * @param a - First capture.
 * @param b - Second capture.
 * @param place - Where the picture is.
 * @param inside - `true` to count the picture's own pixels, `false` the display around it.
 * @returns Differing display pixels.
 */
function diffDisplay(a: Shot, b: Shot, place: Placement, inside: boolean): number {
  let count = 0;
  for (let y = 0; y < a.height; y++) {
    const inRows = y >= place.y && y < place.y + place.height;
    for (let x = 0; x < a.width; x++) {
      const within = inRows && x >= place.x && x < place.x + place.width;
      if (within !== inside) continue;
      const i = (y * a.width + x) * 4;
      if (
        a.data[i] !== b.data[i] ||
        a.data[i + 1] !== b.data[i + 1] ||
        a.data[i + 2] !== b.data[i + 2]
      ) {
        count++;
      }
    }
  }
  return count;
}

/**
 * Mean brightness ratio of one capture to another over a window, ignoring channels too dark to
 * carry a ratio (quantisation would swamp them).
 *
 * @param lit - The capture whose brightness is measured.
 * @param plain - The capture it is measured against.
 * @param x - Left column of the window.
 * @param y - Top row.
 * @param w - Its width in display pixels.
 * @param h - Its height.
 * @returns The mean of `lit / plain` over the channels counted, and how many were counted.
 */
function meanRatio(
  lit: Shot,
  plain: Shot,
  x: number,
  y: number,
  w: number,
  h: number,
): { ratio: number; samples: number } {
  let sum = 0;
  let samples = 0;
  for (let row = y; row < y + h; row++) {
    for (let column = x; column < x + w; column++) {
      const i = (row * plain.width + column) * 4;
      for (let channel = 0; channel < 3; channel++) {
        const base = plain.data[i + channel];
        if (base < 40) continue;
        sum += lit.data[i + channel] / base;
        samples++;
      }
    }
  }
  return { ratio: samples === 0 ? Number.NaN : sum / samples, samples };
}

/**
 * The frame rows that differ between two ×`scale` captures of the same tick.
 *
 * @param a - First capture.
 * @param b - Second capture.
 * @param place - Where the picture is.
 * @returns The frame rows, ascending.
 */
function changedRows(a: Shot, b: Shot, place: Placement): number[] {
  const rows: number[] = [];
  for (let fy = 0; fy < place.height / place.scaleY; fy++) {
    const y = place.y + fy * place.scaleY;
    for (let fx = 0; fx < place.width / place.scaleX; fx++) {
      const i = (y * a.width + place.x + fx * place.scaleX) * 4;
      if (
        a.data[i] !== b.data[i] ||
        a.data[i + 1] !== b.data[i + 1] ||
        a.data[i + 2] !== b.data[i + 2]
      ) {
        rows.push(fy);
        break;
      }
    }
  }
  return rows;
}

/**
 * The renderer state this spec asserts on.
 *
 * @param page - The page.
 * @returns The floor's state, the side panels, the settings and the last frame's draw calls.
 */
function rendererState(page: Page): Promise<{
  floor: boolean;
  panels: [number, number];
  crt: string;
  aspect: string;
  drawCalls: number;
}> {
  return page.evaluate(() => {
    const api = (window as unknown as DebugWindow).__shmupDebug;
    const r = api.renderer;
    return {
      floor: r.mode7.active,
      panels: [r.panels.panelLeft, r.panels.panelRight] as [number, number],
      crt: r.crtFilter,
      aspect: r.aspect,
      drawCalls: api.stats.drawCalls,
    };
  });
}

/**
 * Collects console errors, atlas warnings and page errors.
 *
 * @param page - The page.
 * @returns The collected messages (filled while the test runs).
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

test.describe('the M3-02 shaders (GLSL ES 1.0)', () => {
  test('the Mode-7 and CRT programs compile and link in a WebGL1 context', async ({ page }) => {
    await page.goto('./?scene=calibration');
    const result = await page.evaluate(
      (programs) => {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl');
        if (gl === null) return [{ name: 'webgl1', ok: false, log: 'no WebGL1 context' }];
        const compile = (type: number, source: string): WebGLShader | string => {
          const shader = gl.createShader(type);
          if (shader === null) return 'createShader failed';
          gl.shaderSource(shader, source);
          gl.compileShader(shader);
          if (gl.getShaderParameter(shader, gl.COMPILE_STATUS) !== true) {
            return gl.getShaderInfoLog(shader) ?? 'compile failed';
          }
          return shader;
        };
        return programs.map(({ name, vertex, fragment }) => {
          const vs = compile(gl.VERTEX_SHADER, vertex);
          const fs = compile(gl.FRAGMENT_SHADER, fragment);
          if (typeof vs === 'string') return { name, ok: false, log: `vertex: ${vs}` };
          if (typeof fs === 'string') return { name, ok: false, log: `fragment: ${fs}` };
          const program = gl.createProgram();
          if (program === null) return { name, ok: false, log: 'createProgram failed' };
          gl.attachShader(program, vs);
          gl.attachShader(program, fs);
          gl.linkProgram(program);
          if (gl.getProgramParameter(program, gl.LINK_STATUS) !== true) {
            return { name, ok: false, log: gl.getProgramInfoLog(program) ?? 'link failed' };
          }
          return { name, ok: true, log: '' };
        });
      },
      [
        // The shipped pairing since M3-02d: one mesh vertex shader, the same two fragments.
        { name: 'mode7-mesh', vertex: EFFECT_MESH_VERTEX, fragment: MODE7_FRAGMENT },
        { name: 'crt-blit', vertex: EFFECT_MESH_VERTEX, fragment: CRT_FRAGMENT },
        // The filter pairing, still built by `screenPass: 'filter'` and by the layer effects.
        { name: 'mode7', vertex: MODE7_VERTEX, fragment: MODE7_FRAGMENT },
        { name: 'crt', vertex: CRT_VERTEX, fragment: CRT_FRAGMENT },
      ],
    );
    expect(result).toEqual([
      { name: 'mode7-mesh', ok: true, log: '' },
      { name: 'crt-blit', ok: true, log: '' },
      { name: 'mode7', ok: true, log: '' },
      { name: 'crt', ok: true, log: '' },
    ]);
  });
});

test.describe('the pseudo-3D dimension stage (web build, ?stage=dimension)', () => {
  test('draws the Mode-7 floor under the horizon within the draw-call budget', async ({
    page,
  }, testInfo) => {
    const errors = collectErrors(page);
    await page.goto('./?scene=flight&stage=dimension');
    await expect(page.locator('#game')).toHaveAttribute('data-shmup-state', 'running');
    await freezeSim(page);
    const tick = await stepTo(page, 240);
    const on = await capture(page);
    await testInfo.attach('dimension-mode7-floor', { body: on.png, contentType: 'image/png' });
    const state = await rendererState(page);
    expect(state.floor).toBe(true);
    expect(state.drawCalls).toBeGreaterThan(0);
    expect(state.drawCalls).toBeLessThanOrEqual(DRAW_CALL_BUDGET);
    // The same tick with the floor sprite hidden: the rows under the horizon change, the sky
    // above them does not.
    await page.evaluate(() => {
      const floor = (window as unknown as DebugWindow).__shmupDebug.renderer.mode7.view;
      if (floor !== null) floor.visible = false;
    });
    await stepTo(page, tick);
    await settle(page);
    const off = await capture(page);
    await testInfo.attach('dimension-no-floor', { body: off.png, contentType: 'image/png' });
    const floorRows = diffRows(on.image, off.image, FLOOR_TOP, FLOOR_BOTTOM);
    // A grid over most of the ground band (the floor is 384 × 99 frame pixels there).
    expect(floorRows).toBeGreaterThan(384 * 20);
    expect(diffRows(on.image, off.image, 0, FLOOR_TOP - 2)).toBe(0);
    expect(errors).toEqual([]);
  });
});

test.describe('the CRT filter and the aspect modes (web build)', () => {
  test('the CRT settings only darken the picture, and off restores it', async ({
    page,
  }, testInfo) => {
    const errors = collectErrors(page);
    await page.goto('./?scene=flight&stage=dimension');
    await expect(page.locator('#game')).toHaveAttribute('data-shmup-state', 'running');
    await freezeSim(page);
    const tick = await stepTo(page, 240);
    const plain = await capture(page);
    const shots: Record<string, Shot> = {};
    for (const setting of ['light', 'full']) {
      await page.evaluate((value) => {
        (window as unknown as DebugWindow).__shmupDebug.renderer.setCrtFilter(value);
      }, setting);
      await stepTo(page, tick);
      await settle(page);
      const shot = await capture(page);
      await testInfo.attach(`dimension-crt-${setting}`, {
        body: shot.png,
        contentType: 'image/png',
      });
      shots[setting] = shot.image;
      expect((await rendererState(page)).crt).toBe(setting);
    }
    const base = meanLevel(plain.image);
    const light = meanLevel(shots.light);
    const full = meanLevel(shots.full);
    // Scanlines darken the picture; the mask and the vignette darken it further. Nothing is ever
    // brightened (the flash overlay's limiter still holds).
    expect(light).toBeLessThan(base);
    expect(full).toBeLessThan(light);
    expect(light).toBeGreaterThan(base * 0.5);
    // The picture comes back exactly as it was.
    await page.evaluate(() => {
      (window as unknown as DebugWindow).__shmupDebug.renderer.setCrtFilter('off');
    });
    await stepTo(page, tick);
    await settle(page);
    const back = await capture(page);
    expect(diffRows(plain.image, back.image, 0, 216)).toBe(0);
    expect(errors).toEqual([]);
  });

  test('the aspect modes pillarbox the picture with lit side panels', async ({
    page,
  }, testInfo) => {
    const errors = collectErrors(page);
    await page.goto('./?scene=flight&stage=dimension');
    await expect(page.locator('#game')).toHaveAttribute('data-shmup-state', 'running');
    await freezeSim(page);
    const tick = await stepTo(page, 240);
    const normal = await rendererState(page);
    expect(normal.aspect).toBe('normal');
    expect(normal.panels).toEqual([0, 0]);
    // ×3 with no letterbox: the frame fills the 1152×648 display, so its left column is the stage.
    const filled = await capture(page);
    const shots: Record<string, Shot> = { normal: filled.image };
    for (const [mode, panels] of [
      ['classic', [144, 144]],
      ['wide', [0, 0]],
    ] as Array<[string, number[]]>) {
      await page.evaluate((value) => {
        (window as unknown as DebugWindow).__shmupDebug.renderer.setAspect(value);
      }, mode);
      await stepTo(page, tick);
      await settle(page);
      const state = await rendererState(page);
      expect(state.aspect).toBe(mode);
      expect(state.panels).toEqual(panels);
      const shot = await capture(page);
      await testInfo.attach(`dimension-aspect-${mode}`, {
        body: shot.png,
        contentType: 'image/png',
      });
      shots[mode] = shot.image;
      expect([shot.image.width, shot.image.height]).toEqual([1152, 648]);
    }
    // `classic`: the picture is 768 wide (×2 of 384) inside the 864-wide window, so the display's
    // left edge is the panel, not the stage, and the window's own middle row still shows the game.
    expect(pixelAt(shots.classic, 2, 324)).not.toEqual(pixelAt(shots.normal, 2, 324));
    expect(pixelAt(shots.classic, 576, 324)).not.toEqual(pixelAt(shots.classic, 2, 324));
    // `wide` keeps the full width and letterboxes instead, so its own top edge went black.
    expect(pixelAt(shots.wide, 576, 4)).not.toEqual(pixelAt(shots.normal, 576, 4));
    // Back to `normal`: the frame fills the display again, pixel for pixel.
    await page.evaluate(() => {
      (window as unknown as DebugWindow).__shmupDebug.renderer.setAspect('normal');
    });
    await stepTo(page, tick);
    await settle(page);
    expect((await rendererState(page)).panels).toEqual([0, 0]);
    const back = await capture(page);
    expect(diffRows(filled.image, back.image, 0, 216)).toBe(0);
    expect(errors).toEqual([]);
  });
});

test.describe('the pass-2 blit (plan M3-02d, decision D19)', () => {
  test('upscales the frame into exact integer blocks in every aspect mode', async ({
    page,
  }, testInfo) => {
    // The blit is a `Mesh` whose vertex shader (`EFFECT_MESH_VERTEX`) reproduces Pixi's own
    // `roundPixels` snapping. Half a pixel out and the nearest-neighbour upscale would land
    // between the frame's pixels: some blocks would be a display pixel wider than their
    // neighbours and the picture would crawl as the camera moved — the shimmer decision D19
    // exists to prevent, and one that no structural assertion would notice. So: every frame
    // pixel must be an exact `scale × scale` block of one colour, anchored at the picture's
    // own origin.
    const errors = collectErrors(page);
    await page.goto('./?scene=flight&stage=dimension');
    await expect(page.locator('#game')).toHaveAttribute('data-shmup-state', 'running');
    await freezeSim(page);
    const tick = await stepTo(page, 240);
    for (const mode of ['normal', 'classic', 'wide']) {
      await page.evaluate((value) => {
        (window as unknown as DebugWindow).__shmupDebug.renderer.setAspect(value);
      }, mode);
      await stepTo(page, tick);
      await settle(page);
      const place = await placementOf(page);
      // Integer scaling, the same both ways: the picture is a whole number of frame pixels.
      expect(place.scaleX).toBe(place.scale);
      expect(place.scaleY).toBe(place.scale);
      expect(place.scale).toBe(Math.round(place.scale));
      expect(place.scale).toBeGreaterThanOrEqual(2);
      expect(place.width).toBe(384 * place.scale);
      expect(place.height).toBe(216 * place.scale);
      // The picture's own origin is a whole display pixel too.
      expect(place.x).toBe(Math.round(place.x));
      expect(place.y).toBe(Math.round(place.y));
      const shot = await capture(page);
      await testInfo.attach(`blit-blocks-${mode}`, { body: shot.png, contentType: 'image/png' });
      const blocks = checkBlocks(shot.image, place);
      expect(blocks.blocks).toBe(384 * 216);
      expect(blocks.firstBroken).toBeNull();
      expect(blocks.broken).toBe(0);
      // …and the check could have failed: thousands of frame pixels differ from the one left of
      // them here, so a block boundary a display pixel out would have broken a block at each of
      // them (measured: 3,400–4,000 of the 82,944, the dimension stage's floor grid and stars).
      expect(blocks.varied).toBeGreaterThan(2000);
    }
    await page.evaluate(() => {
      (window as unknown as DebugWindow).__shmupDebug.renderer.setAspect('normal');
    });
    expect(errors).toEqual([]);
  });

  test('the CRT look covers the picture and nothing else, and follows a boxed picture', async ({
    page,
  }, testInfo) => {
    // Since M3-02d the CRT is the blit's own shader instead of a filter over the whole second
    // pass, so it reaches exactly the picture: the lit side panels and the letterbox around it
    // are left alone. `uHalf` became a `vec4` in the same change so the vignette is measured in
    // *half-pictures* — at the pillarboxed picture's own left edge it is at full strength, which
    // it would not be if the shader still divided by half the display.
    const errors = collectErrors(page);
    await page.goto('./?scene=flight&stage=dimension');
    await expect(page.locator('#game')).toHaveAttribute('data-shmup-state', 'running');
    await freezeSim(page);
    const tick = await stepTo(page, 240);
    for (const mode of ['classic', 'wide']) {
      await page.evaluate((value) => {
        (window as unknown as DebugWindow).__shmupDebug.renderer.setAspect(value);
      }, mode);
      await stepTo(page, tick);
      await settle(page);
      const place = await placementOf(page);
      // Both modes really do box the picture, or the test below would assert nothing.
      expect(place.width * place.height).toBeLessThan(1152 * 648);
      const plain = await capture(page);
      await page.evaluate(() => {
        (window as unknown as DebugWindow).__shmupDebug.renderer.setCrtFilter('full');
      });
      await stepTo(page, tick);
      await settle(page);
      const lit = await capture(page);
      await testInfo.attach(`blit-crt-${mode}`, { body: lit.png, contentType: 'image/png' });
      // Outside the picture: not one display pixel moved. Inside: the whole picture did.
      expect(diffDisplay(plain.image, lit.image, place, false)).toBe(0);
      expect(diffDisplay(plain.image, lit.image, place, true)).toBeGreaterThan(
        place.width * place.height * 0.5,
      );
      if (mode === 'classic') {
        // The vignette, measured as the ratio of lit to plain over a window that covers exactly
        // one aperture-mask triad (3 columns) and one scanline band (`scale` rows), on the
        // picture's own middle row — so the scanline and mask factors cancel between the two
        // windows and only the vignette is left.
        const midY = place.y + place.height / 2 - place.scale;
        const edge = meanRatio(lit.image, plain.image, place.x, midY, 6, place.scale * 2);
        const middle = meanRatio(
          lit.image,
          plain.image,
          place.x + place.width / 2 - 3,
          midY,
          6,
          place.scale * 2,
        );
        expect(edge.samples).toBeGreaterThan(8);
        expect(middle.samples).toBeGreaterThan(8);
        const relative = edge.ratio / middle.ratio;
        // `uHalf.zw` = the picture's half-size: at its left edge `dot(d, d)` is ~1, so the corner
        // factor is ~`1 − CRT_FULL_VIGNETTE` (0.78). Had the shader kept half the *display*
        // (576 px) the same pixel would sit at 0.66 of the way out and only lose 0.10 (0.90).
        expect(relative).toBeGreaterThan(0.72);
        expect(relative).toBeLessThan(0.85);
      }
      await page.evaluate(() => {
        (window as unknown as DebugWindow).__shmupDebug.renderer.setCrtFilter('off');
      });
      await stepTo(page, tick);
      await settle(page);
      // Off again, the boxed picture is back exactly as it was — the blit is not a second pass.
      const back = await capture(page);
      expect(diffDisplay(plain.image, back.image, place, true)).toBe(0);
      expect(diffDisplay(plain.image, back.image, place, false)).toBe(0);
    }
    await page.evaluate(() => {
      (window as unknown as DebugWindow).__shmupDebug.renderer.setAspect('normal');
    });
    expect(errors).toEqual([]);
  });

  test('the WebGL1 context offers OES_element_index_uint, which both meshes need', async ({
    page,
  }) => {
    // `MeshGeometry` takes `Uint32Array` indices, so the two meshes M3-02d added need 32-bit
    // element indices — WebGL1's `OES_element_index_uint`, which Pixi asks for in
    // `GlContextSystem` (`supports.uint32Indices`). It is effectively universal and the TV's
    // Mali-G51 has it, but it is a dependency this step introduced, so it is checked in a real
    // context rather than assumed. (`crt-blit.test.ts` pins the `Uint32Array` itself.)
    await page.goto('./?scene=calibration');
    const support = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl');
      if (gl === null) return { context: false, extension: false };
      return { context: true, extension: gl.getExtension('OES_element_index_uint') !== null };
    });
    expect(support).toEqual({ context: true, extension: true });
  });
});

test.describe('the Mode-7 floor is aligned to the frame (plan M3-02d)', () => {
  test('covers exactly the frame rows between its horizon and its bottom', async ({ page }) => {
    // The floor is a `Mesh` on `BG_MID` since M3-02d, so its fragment shader's `vScreen.y` is the
    // frame row the per-row affine matrix is built from. Half a row out and the whole floor would
    // be sheared by one row of depth; the exact first and last rows it touches pin that.
    // `content/stages/dimension.stage.json` has `horizon: 100`, `bottom: 200`, and the shader
    // measures both from `PLAYFIELD_Y` (8) — so rows 108 … 207 of the 216-row frame, and nothing
    // above or below.
    const errors = collectErrors(page);
    await page.goto('./?scene=flight&stage=dimension');
    await expect(page.locator('#game')).toHaveAttribute('data-shmup-state', 'running');
    await freezeSim(page);
    const tick = await stepTo(page, 240);
    const place = await placementOf(page);
    const on = await capture(page);
    await page.evaluate(() => {
      const floor = (window as unknown as DebugWindow).__shmupDebug.renderer.mode7.view;
      if (floor !== null) floor.visible = false;
    });
    await stepTo(page, tick);
    await settle(page);
    const off = await capture(page);
    const rows = changedRows(on.image, off.image, place);
    expect(rows.length).toBeGreaterThan(80);
    expect(rows[0]).toBe(108);
    expect(rows[rows.length - 1]).toBe(207);
    expect(errors).toEqual([]);
  });
});
