/**
 * Browser test of the visual showpieces of plan M3-02 in headless Chromium (SwiftShader WebGL):
 *
 * - the **Mode-7** shader (`MODE7_VERTEX` / `MODE7_FRAGMENT`) and the **CRT** shader
 *   (`CRT_VERTEX` / `CRT_FRAGMENT`) compile and link in a real **WebGL1** context — the GLSL ES
 *   1.0 check by the browser's own compiler, the one Chromium 69 on the TV will run;
 * - the pseudo-3D stage `?stage=dimension` boots without errors and its floor shows: the rows
 *   under the horizon change when the floor is hidden, while the sky above them does not, and the
 *   frame stays inside {@link DRAW_CALL_BUDGET} WebGL draw calls;
 * - the CRT filter only ever darkens (scanlines at `light`, plus the mask and vignette at `full`),
 *   and switching it off restores the picture pixel for pixel;
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
  MODE7_FRAGMENT,
  MODE7_VERTEX,
} from '../../packages/render-pixi/src/effects/shaders.js';
import { decodePng } from '../../scripts/assets/png.mjs';
import { freezeSim, stepTo } from './frame-advance.js';

/**
 * Most WebGL draw calls one frame of the dimension stage may take: the plain frame takes 2 (one
 * batch for the scene, the upscale quad) and the Mode-7 floor adds its own layer render, its
 * filter pass and a batch break, with room for the stage's own layers on top.
 */
const DRAW_CALL_BUDGET = 12;

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
  readonly mode7: { readonly active: boolean; readonly sprite: { visible: boolean } };
  readonly panels: { readonly panelLeft: number; readonly panelRight: number };
  readonly crtFilter: string;
  readonly aspect: string;
  setCrtFilter(setting: string): void;
  setAspect(mode: string): void;
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
        { name: 'mode7', vertex: MODE7_VERTEX, fragment: MODE7_FRAGMENT },
        { name: 'crt', vertex: CRT_VERTEX, fragment: CRT_FRAGMENT },
      ],
    );
    expect(result).toEqual([
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
      (window as unknown as DebugWindow).__shmupDebug.renderer.mode7.sprite.visible = false;
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
