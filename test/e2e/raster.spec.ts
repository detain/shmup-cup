/**
 * Browser test of the presentation polish (plan M2-08) in headless Chromium (SwiftShader WebGL):
 *
 * - the layer shader (`LAYER_EFFECT_VERTEX` / `LAYER_EFFECT_FRAGMENT`) compiles and links in a real
 *   **WebGL1** context — the GLSL ES 1.0 check by the browser's own compiler;
 * - the dev stage `?stage=raster-range` boots without errors and its effects show: with the layer
 *   effects on, the sea band (a `wave` raster effect and a palette cycle) and the checker floor (a
 *   `lines` raster effect) differ from the same frame drawn with them off, the far layer's heat haze
 *   only runs inside its camera range, and the frame stays within {@link DRAW_CALL_BUDGET} WebGL
 *   draw calls (the debug overlay's counter). Screenshots with the effects on are attached to the
 *   report;
 * - the display options reach the canvas: the `stretch` scale mode fills a display the integer
 *   mode letterboxes, and the hitbox markers appear on the ship only while shown.
 *
 * Screenshots are ×3 (viewport 1152×648): frame pixel (x, y) is screenshot pixel (3x + 1, 3y + 1);
 * the sim is frozen and stepped exact ticks (`./frame-advance.ts`).
 */
import { expect, test, type Page } from '@playwright/test';
import { decodePng } from '../../scripts/assets/png.mjs';
import {
  LAYER_EFFECT_FRAGMENT,
  LAYER_EFFECT_VERTEX,
} from '../../packages/render-pixi/src/effects/shaders.js';
import { freezeSim, stepTo } from './frame-advance.js';

/**
 * Most WebGL draw calls one frame of the raster range may take with its effects on.
 *
 * Each filtered layer costs about 3 (its own render, the filter pass, the batch break), and a
 * stage may filter at most the five effect layers. Until plan **M3-02e** the rest of the frame
 * was 2 (one batch for the whole scene, the upscale quad), which made 5 with the sea and the
 * floor and 7 with the heat haze too, against a budget of 12.
 *
 * **M3-02e raised it to 16, deliberately** (`shmup_feat.md` §22, which allows 20–50): the layers
 * that toggle sprites every frame are now each their own Pixi render group, so one hidden bullet
 * rebuilds that layer's instruction set instead of the whole ~6,400-object scene's (the review's
 * **F1**). Every group is a batch boundary, so the scene costs about one draw call per group that
 * holds something: this stage measures **7** with the sea and the floor and **10** with the haze
 * too, where it measured 5 and 7. 16 keeps the same ~5 calls of headroom the 12 had.
 */
const DRAW_CALL_BUDGET = 16;

/** `LayerId.BgFar` / `LayerId.BgMid` bits of `layerEffects.attachedMask`. */
const FAR_BIT = 1;
const MID_BIT = 2;

/** The rim colour of the hitbox markers (render-pixi `HITBOX_RIM_TINT`). */
const RIM = [0xff, 0x30, 0x50] as const;

/** The parts of the renderer the spec touches. */
interface DebugRenderer {
  readonly layerEffects: { readonly attachedMask: number };
  readonly effects: { readonly settings: { rasterEffects: boolean } };
  setScaleMode(mode: string): void;
  setShowHitbox(on: boolean): void;
}

/** `window` with the test build's debug API. */
interface DebugWindow {
  readonly __shmupDebug: {
    readonly renderer: DebugRenderer;
    readonly stats: { readonly drawCalls: number };
    readonly game: { readonly world: { readonly camera: { readonly x: number } } };
  };
}

/**
 * Takes a screenshot of the canvas and decodes it.
 *
 * @param page - The page.
 * @returns The PNG bytes and the decoded image.
 */
async function capture(
  page: Page,
): Promise<{ png: Buffer; image: { width: number; height: number; data: Uint8Array } }> {
  const png = await page.locator('#game').screenshot();
  return { png, image: decodePng(new Uint8Array(png)) };
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
function diffRows(
  a: { width: number; height: number; data: Uint8Array },
  b: { width: number; height: number; data: Uint8Array },
  top: number,
  bottom: number,
): number {
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
 * Counts the pixels of one colour (± 2 per channel) in a screenshot.
 *
 * @param image - The decoded screenshot.
 * @param rgb - The colour.
 * @returns Matching screenshot pixels.
 */
function countColour(
  image: { width: number; height: number; data: Uint8Array },
  rgb: readonly [number, number, number],
): number {
  let count = 0;
  for (let i = 0; i < image.width * image.height * 4; i += 4) {
    if (
      Math.abs(image.data[i] - rgb[0]) <= 2 &&
      Math.abs(image.data[i + 1] - rgb[1]) <= 2 &&
      Math.abs(image.data[i + 2] - rgb[2]) <= 2
    ) {
      count++;
    }
  }
  return count;
}

/**
 * Reads the renderer's layer-effect state and draw calls.
 *
 * @param page - The page.
 * @returns The attached-filter mask and the last frame's draw calls.
 */
function rendererState(page: Page): Promise<{ mask: number; drawCalls: number }> {
  return page.evaluate(() => {
    const api = (window as unknown as DebugWindow).__shmupDebug;
    // The debug overlay's draw-call counter (the last frame's WebGL draw calls).
    return { mask: api.renderer.layerEffects.attachedMask, drawCalls: api.stats.drawCalls };
  });
}

/**
 * Switches the layer effects on or off.
 *
 * @param page - The page.
 * @param on - The setting.
 */
async function setEffects(page: Page, on: boolean): Promise<void> {
  await page.evaluate((value) => {
    (window as unknown as DebugWindow).__shmupDebug.renderer.effects.settings.rasterEffects = value;
  }, on);
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

test.describe('layer shader (GLSL ES 1.0)', () => {
  test('compiles and links in a WebGL1 context', async ({ page }) => {
    await page.goto('./?scene=calibration');
    const result = await page.evaluate(
      ({ vertex, fragment }) => {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl');
        if (gl === null) return { ok: false, log: 'no WebGL1 context' };
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
        const vs = compile(gl.VERTEX_SHADER, vertex);
        const fs = compile(gl.FRAGMENT_SHADER, fragment);
        if (typeof vs === 'string') return { ok: false, log: `vertex: ${vs}` };
        if (typeof fs === 'string') return { ok: false, log: `fragment: ${fs}` };
        const program = gl.createProgram();
        if (program === null) return { ok: false, log: 'createProgram failed' };
        gl.attachShader(program, vs);
        gl.attachShader(program, fs);
        gl.linkProgram(program);
        if (gl.getProgramParameter(program, gl.LINK_STATUS) !== true) {
          return { ok: false, log: gl.getProgramInfoLog(program) ?? 'link failed' };
        }
        return { ok: true, log: '' };
      },
      { vertex: LAYER_EFFECT_VERTEX, fragment: LAYER_EFFECT_FRAGMENT },
    );
    expect(result).toEqual({ ok: true, log: '' });
  });
});

test.describe('raster effects and palette cycles (web build, ?stage=raster-range)', () => {
  test('draws the sea wave, the palette cycle and the line-band floor within the draw-call budget', async ({
    page,
  }, testInfo) => {
    const errors = collectErrors(page);
    await page.goto('./?scene=flight&stage=raster-range');
    await expect(page.locator('#game')).toHaveAttribute('data-shmup-state', 'running');
    await freezeSim(page);
    const tick = await stepTo(page, 200);
    const on = await capture(page);
    await testInfo.attach('raster-range-effects-on', { body: on.png, contentType: 'image/png' });
    const state = await rendererState(page);
    // The sea and the floor are filtered; the haze on the far layer waits for camera x 1200.
    expect(state.mask & MID_BIT).toBe(MID_BIT);
    expect(state.mask & FAR_BIT).toBe(0);
    expect(state.drawCalls).toBeGreaterThan(0);
    expect(state.drawCalls).toBeLessThanOrEqual(DRAW_CALL_BUDGET);
    // The same tick with the effects off: the sea (rows 120 … 159) and the floor (160 … 207)
    // change, the sky above them does not.
    await setEffects(page, false);
    await stepTo(page, tick);
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    const off = await capture(page);
    expect((await rendererState(page)).mask).toBe(0);
    expect(diffRows(on.image, off.image, 120, 160)).toBeGreaterThan(1000);
    expect(diffRows(on.image, off.image, 164, 208)).toBeGreaterThan(1000);
    expect(diffRows(on.image, off.image, 8, 100)).toBe(0);
    await setEffects(page, true);
    expect(errors).toEqual([]);
  });

  test('runs the heat haze only inside its camera range', async ({ page }, testInfo) => {
    const errors = collectErrors(page);
    await page.goto('./?scene=flight&stage=raster-range');
    await expect(page.locator('#game')).toHaveAttribute('data-shmup-state', 'running');
    await freezeSim(page);
    // Camera x 1 px a tick after the 60-tick ramp: inside [1200, 2400) at tick 1600.
    await stepTo(page, 1600);
    const cameraX = await page.evaluate(
      () => (window as unknown as DebugWindow).__shmupDebug.game.world.camera.x,
    );
    expect(cameraX).toBeGreaterThanOrEqual(1200);
    expect(cameraX).toBeLessThan(2400);
    const state = await rendererState(page);
    expect(state.mask).toBe(FAR_BIT | MID_BIT);
    expect(state.drawCalls).toBeLessThanOrEqual(DRAW_CALL_BUDGET);
    const shot = await capture(page);
    await testInfo.attach('raster-range-haze', { body: shot.png, contentType: 'image/png' });
    // Past the range the far layer's filter comes off again.
    await stepTo(page, 2600);
    expect((await rendererState(page)).mask).toBe(MID_BIT);
    expect(errors).toEqual([]);
  });
});

test.describe('display options (web build)', () => {
  test('stretch fills a display the integer mode letterboxes', async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 600 });
    await page.goto('./?scene=flight&stage=raster-range');
    await expect(page.locator('#game')).toHaveAttribute('data-shmup-state', 'running');
    await freezeSim(page);
    const tick = await stepTo(page, 30);
    // Integer ×2: a 768×432 frame centred — the corner pixel is letterbox (render-pixi PALETTE).
    let { image } = await capture(page);
    const corner = (): number[] => [image.data[0], image.data[1], image.data[2]];
    expect(corner()).toEqual([0x05, 0x07, 0x0f]);
    await page.evaluate(() => {
      (window as unknown as DebugWindow).__shmupDebug.renderer.setScaleMode('stretch');
    });
    await stepTo(page, tick + 1);
    ({ image } = await capture(page));
    expect(corner()).not.toEqual([0x05, 0x07, 0x0f]);
  });

  test('draws the hitbox markers only while the option is on', async ({ page }) => {
    await page.goto('./?scene=flight&stage=raster-range');
    await expect(page.locator('#game')).toHaveAttribute('data-shmup-state', 'running');
    await freezeSim(page);
    // After the fly-in the ship is in the playfield.
    let tick = await stepTo(page, 120);
    expect(countColour((await capture(page)).image, RIM)).toBe(0);
    await page.evaluate(() => {
      (window as unknown as DebugWindow).__shmupDebug.renderer.setShowHitbox(true);
    });
    tick = await stepTo(page, tick + 1);
    expect(countColour((await capture(page)).image, RIM)).toBeGreaterThan(0);
    await page.evaluate(() => {
      (window as unknown as DebugWindow).__shmupDebug.renderer.setShowHitbox(false);
    });
    await stepTo(page, tick + 1);
    expect(countColour((await capture(page)).image, RIM)).toBe(0);
  });
});
