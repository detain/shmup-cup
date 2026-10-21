/**
 * R3-06.L6 — decor-range decor, parallax bands and glows in the browser.
 *
 * `?scene=flight&stage=decor-range` runs the dev range in the frozen sim (a rAF-driven
 * screenshot would land on an arbitrary tick, so every capture here goes through
 * `freezeSim` / `stepTo`). The spec proves the three things the step adds on screen: a decor
 * item draws at its world place over the bands, the fore band draws over the playfield — above
 * the bullets it shares the screen with, and the animated bands cycle their two frames on the
 * tick. The glow batches ride the decor and the boss's vent: their state is read through the
 * live view (`blend === 'additive'`) rather than a pixel, because an additive colour over an
 * unknown stack of bands is not an exact match — the renderer unit specs already pin that one.
 *
 * There is no draw-call budget assert here: `raster.spec.ts` counts 16 groups and predates the
 * decor layers; R3-06.L7 benches the real numbers. Every screenshot sample reads its expected
 * colour straight out of the generated sprite frames (`decor.mjs` at the shipped 3/2 scale), so
 * a recolour never re-pins this file.
 *
 * @module test/e2e/decor
 */

import { expect, test, type Page } from '@playwright/test';

import { getPixel } from '../../scripts/assets/image.mjs';
import { generate as generateDecor } from '../../scripts/assets/procedural/decor.mjs';
import { decodePng } from '../../scripts/assets/png.mjs';
import { BOOT_TIMEOUT_MS } from './ticks.js';
import { FRAME_W, PLAYFIELD_Y, pixelIndex } from './frame-pixels.js';
import { freezeSim, stepTo } from './frame-advance.js';

const pngBytes = (buf: Buffer): Uint8Array => new Uint8Array(buf);

// The generator's final v2 frames (core's ART_SCALE is 3/2) — the spec's expected colours come
// straight out of them, so a recolour never re-pins this file.
const DECOR: Map<string, ReturnType<typeof generateDecor>[number]> = new Map(
  generateDecor({ artScale: 3 / 2 }).map((s) => [s.name, s]),
);

/** One frame of a generated decor sprite, by name and frame index. */
function decorFrame(
  name: string,
  frame = 0,
): { width: number; height: number; data: Uint8ClampedArray } {
  const sprite = DECOR.get(name);
  if (!sprite) throw new Error(`decor generator did not emit ${name}`);
  return (sprite as { frames: Array<{ width: number; height: number; data: Uint8ClampedArray }> })
    .frames[frame];
}

/** The debug surface of the flight scene (the test build exposes the live World). */
interface DebugWindow {
  __shmupDebug: {
    tick: number;
    game: {
      world: {
        camera: { x: number; y: number };
        view: {
          batches: Array<{ layer: number; count: number; blend?: string }>;
          parallax: { frameIndex: ArrayLike<number> } | null;
          decor: {
            count: number;
            back: { count: number } | null;
            front: { count: number } | null;
            glowBack: { count: number; x: ArrayLike<number> } | null;
            glowFront: { count: number } | null;
          } | null;
        };
        bosses: { boss: { state: number } | null };
      } | null;
    };
  };
}

/** Serialised live-world probe: the view state the decor step must drive. */
async function readWorld(page: Page) {
  return page.evaluate(() => {
    const w = (window as unknown as DebugWindow).__shmupDebug.game.world;
    if (!w) return null;
    const decor = w.view.decor;
    return {
      tick: (window as unknown as DebugWindow).__shmupDebug.tick,
      camX: Math.round(w.camera.x),
      cloudFrame: w.view.parallax ? w.view.parallax.frameIndex[1] : -1,
      bossState: w.bosses.boss ? w.bosses.boss.state : -1,
      decorCount: decor ? decor.count : -1,
      backCount: decor && decor.back ? decor.back.count : -1,
      frontCount: decor && decor.front ? decor.front.count : -1,
      glowBackCount: decor && decor.glowBack ? decor.glowBack.count : -1,
      glowBackX: decor && decor.glowBack ? Array.from(decor.glowBack.x).slice(0, 4) : [],
      additive: w.view.batches.filter((b) => b.blend === 'additive').length,
    };
  });
}

/** Boot the decor range in the frozen flight sim, collecting console errors. */
async function bootFrozen(page: Page, errors: string[]): Promise<void> {
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  await page.goto('./?scene=flight&stage=decor-range');
  await expect(page.locator('#game')).toHaveAttribute('data-shmup-state', 'running', {
    timeout: BOOT_TIMEOUT_MS,
  });
  await freezeSim(page);
}

async function capture(page: Page): Promise<{ width: number; height: number; data: Uint8Array }> {
  return decodePng(pngBytes(await page.screenshot()));
}

/** The RGBA of a generated frame pixel, as the [r, g, b, a] a screenshot sample compares to. */
function frameRgba(name: string, x: number, y: number, frame = 0): number[] {
  return getPixel(decorFrame(name, frame), x, y);
}

test.describe('decor-range (R3-06.L6)', () => {
  test('decor items and the fore band draw over the playfield, with the glow batch live', async ({
    page,
  }) => {
    const errors: string[] = [];
    await bootFrozen(page, errors);
    await stepTo(page, 600); // camera ramped; camX ≈ (600 − 60) × 1.5 = 810
    const state = (await readWorld(page))!;
    expect(state.decorCount).toBe(12); // every authored entry compiles
    expect(state.backCount).toBeGreaterThanOrEqual(1); // the 420-px pillar is in the window
    expect(state.glowBackCount).toBe(1); // the lantern pillar at x 1180 is in the window too
    expect(state.glowBackX[0]).toBe(1180);
    expect(state.additive).toBeGreaterThanOrEqual(1); // its glow rides an add-blended batch

    const shot = await capture(page);
    // The fore band at row 60: a frond stem column paints its body colour opaque — the cloud
    // bands end by row 27 there, so the stem is unambiguously the topmost art (the stems stand
    // at local columns 15–17 of each 32-px frond pitch).
    let found = false;
    for (let col = 0; col < FRAME_W - 2 && !found; col++) {
      const y = PLAYFIELD_Y + 12 + 60;
      const i = pixelIndex(shot.width, col, y);
      if (shot.data[i + 3] !== 255) continue;
      for (let c = 15; c <= 17 && !found; c++) {
        const want = frameRgba('decor/frond-band', c, 60);
        found =
          shot.data[i] === want[0] && shot.data[i + 1] === want[1] && shot.data[i + 2] === want[2];
      }
    }
    expect(found, 'a fore-band frond stem draws over the playfield').toBe(true);
    expect(errors).toEqual([]);
  });

  test('the glow follows its item on and off screen', async ({ page }) => {
    const errors: string[] = [];
    await bootFrozen(page, errors);
    await stepTo(page, 900);
    expect((await readWorld(page)).glowBackCount).toBe(1);
    await stepTo(page, 2600); // camX ≈ 3810: the window passed the lantern (x 1180 + 512 behind)
    const gone = await readWorld(page);
    expect(gone.glowBackCount).toBe(0);
    expect(errors).toEqual([]);
  });

  test('the animated cloud band cycles its two frames on the tick', async ({ page }) => {
    const errors: string[] = [];
    await bootFrozen(page, errors);
    const rowA = frameRgba('decor/cloud-band', 9, 12, 0); // frame 0: the lifted row reads LIT there
    const rowB = frameRgba('decor/cloud-band', 9, 12, 1); // frame 1: the puff rose — BODY shows
    expect(rowA).not.toEqual(rowB); // the fixture pixel really differs between the two frames
    const sample = async (tick: number) => {
      await stepTo(page, tick);
      const state = (await readWorld(page))!;
      const shot = await capture(page);
      const base = Math.round(state.camX * 0.125); // bands[1]: cloud far, factor 1/8
      let hits0 = 0;
      let hits1 = 0;
      for (let col = 2; col < FRAME_W - 2; col++) {
        const local = (((col + base) % 256) + 256) % 256;
        if (local < 10 || local > 13) continue; // inside puff 1: opaque in both frames
        const y = PLAYFIELD_Y + 0 + 12; // band y 0; frame 0 lifts puff 1 to exactly this row
        const i = pixelIndex(shot.width, col, y);
        const rgba = [shot.data[i], shot.data[i + 1], shot.data[i + 2], shot.data[i + 3]];
        if (rgba[3] !== 255) continue;
        if (rgba[0] === rowA[0] && rgba[1] === rowA[1] && rgba[2] === rowA[2]) hits0++;
        else if (rgba[0] === rowB[0] && rgba[1] === rowB[1] && rgba[2] === rowB[2]) hits1++;
      }
      // Fore-band stems share the 256-px period and can cover a fixture column at some camera
      // positions — they draw neither colour and simply do not count. One-sided hits decide.
      const frame = hits0 > 0 && hits1 === 0 ? 0 : hits1 > 0 && hits0 === 0 ? 1 : -1;
      if (frame < 0) throw new Error(`no decisive cloud hit: hits0=${hits0} hits1=${hits1}`);
      return { frame, idx: state.cloudFrame };
    };
    // Frame 1 is 240 ticks from frame 0 — the live frameIndex must agree with what is drawn,
    // and the two samples must sit on opposite frames. (No tick→frame prediction: the debug tick
    // counts from boot while the band cycles on the stage clock.)
    const a = await sample(600);
    expect(a.idx, 'the drawn frame equals the live frameIndex').toBe(a.frame);
    const b = await sample(840);
    expect(b.idx, 'the drawn frame equals the live frameIndex').toBe(b.frame);
    expect(b.frame).not.toBe(a.frame); // 240 ticks on, the band shows its other frame
    expect(errors).toEqual([]);
  });

  test('the boss decor glows once it fights', async ({ page }) => {
    test.setTimeout(240_000);
    const errors: string[] = [];
    await bootFrozen(page, errors);
    await stepTo(page, 2000); // camX ≈ 2955: the WARNING (event x 4600) has not fired
    expect((await readWorld(page)).bossState).toBe(0); // the free slot idles before the section
    // The frozen sim only advances through stepTo, so drive it in 50-tick windows until the
    // boss slot fights (state 3): the WARNING fires at camX ≈ 4600 (tick ≈ 3130) and the 120-tick
    // intro ends ≈ 3250 — and the camera locks for the section, so the end at x 5400 never comes
    // first.
    let fought = false;
    for (let tick = 2050; tick <= 4450 && !fought; tick += 50) {
      await stepTo(page, tick);
      fought = (await readWorld(page)).bossState === 3;
    }
    if (!fought) {
      expect(errors).toEqual([]); // surface the console if the fight never engaged
      throw new Error('the decor boss never reached the fight state');
    }
    const state = (await readWorld(page))!;
    expect(state.bossState).toBe(3);
    expect(state.additive).toBeGreaterThanOrEqual(1); // the vent glow streams its additive batch
    expect(state.glowBackCount).toBe(0); // the decor lantern is far behind the window now
    expect(errors).toEqual([]);
  });
});
