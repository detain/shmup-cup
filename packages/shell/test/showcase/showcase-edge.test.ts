/**
 * Edge cases of the showcase scene against the real pipeline atlas (built in Node over fake
 * page images): over thousands of ticks every sprite and frame it emits — world batches, hit
 * flashes and HUD sprite commands — resolves to real art (never the `ui/missing` checker),
 * every glyph of its texts exists in the pixel font, no batch or draw list ever drops a sprite,
 * custom starfield tile sizes still cover the playfield, and update() reuses its views and
 * retains no memory.
 */
import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
import {
  DrawOp,
  PLAYFIELD_H,
  PLAYFIELD_W,
  createDrawList,
  type RenderFrame,
  type SpriteBatch,
} from '@shmup/core';
import {
  createAtlas,
  createBitmapFont,
  createSpriteTables,
  resolveFrame,
  type AtlasPageImage,
} from '@shmup/render-pixi';
import { describe, expect, it } from 'vitest';
import { buildAtlas } from '../../../../scripts/assets/pipeline.mjs';
import { SHOWCASE_SPRITES, createShowcase } from '../../src/showcase/index.js';

const { manifest } = buildAtlas();

/** The real atlas over fake page images; warnings are collected. */
function realAtlas() {
  const warnings: string[] = [];
  const images = manifest.pages.map(
    (page) =>
      ({
        width: page.w,
        height: page.h,
        naturalWidth: page.w,
        naturalHeight: page.h,
      }) as unknown as AtlasPageImage,
  );
  const atlas = createAtlas(manifest, images, { onWarning: (message) => warnings.push(message) });
  return { atlas, warnings };
}

/**
 * A game-like frame at a tick.
 *
 * @param tick - Tick.
 */
function gameFrame(tick: number): RenderFrame {
  return {
    tick,
    alpha: 0,
    world: null,
    hud: createDrawList(1, 1),
    ui: createDrawList(1, 1),
    screen: { shakeX: 0, shakeY: 0, flash: 0, dim: 0 },
  };
}

describe('shell/showcase against the real atlas (edge)', () => {
  it('draws only real art: every emitted sprite and frame resolves, over 2,000 ticks', () => {
    const { atlas, warnings } = realAtlas();
    const tables = createSpriteTables(atlas, SHOWCASE_SPRITES);
    expect(warnings).toEqual([]);
    const showcase = createShowcase();
    const source = gameFrame(0);
    const bad: string[] = [];
    for (let tick = 0; tick < 2000; tick++) {
      (source as { tick: number }).tick = tick;
      const frame = showcase.update(source);
      for (const batch of frame.world?.batches ?? []) {
        for (let i = 0; i < batch.count; i++) {
          const id = resolveFrame(atlas, tables, batch.spriteId[i], batch.frame[i], batch.flags[i]);
          if (id === atlas.missingFrame) {
            bad.push(`${SHOWCASE_SPRITES[batch.spriteId[i]]}#${batch.frame[i]} @${tick}`);
          }
        }
      }
      const hud = frame.hud;
      for (let i = 0; i < hud.count; i++) {
        if (hud.op[i] !== DrawOp.Sprite) continue;
        if (
          resolveFrame(atlas, tables, hud.ref[i], hud.frame[i], hud.flags[i]) === atlas.missingFrame
        ) {
          bad.push(`hud ${SHOWCASE_SPRITES[hud.ref[i]]}#${hud.frame[i]} @${tick}`);
        }
      }
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });

  it('writes its texts only with glyphs the pixel font has (no "?" stand-ins)', () => {
    const { atlas } = realAtlas();
    const font = createBitmapFont(atlas);
    const showcase = createShowcase();
    showcase.update(gameFrame(1));
    const texts = [...showcase.frame.ui.strings, ...showcase.frame.hud.strings].filter(
      (text) => text !== '',
    );
    expect(texts.length).toBeGreaterThanOrEqual(6);
    for (const text of texts) {
      for (let i = 0; i < text.length; i++) {
        expect(font.glyphFrame(text.charCodeAt(i)), `${text}[${i}]`).toBeGreaterThanOrEqual(0);
      }
    }
    // The centred title and subtitle stay inside the frame.
    expect(font.measure('?SCENE=CALIBRATION FOR THE TEST PATTERN')).toBeLessThanOrEqual(
      PLAYFIELD_W,
    );
  });
});

describe('shell/showcase capacity and layout (edge)', () => {
  it('never drops a sprite or a HUD command, whatever the tick', () => {
    const showcase = createShowcase();
    for (const tick of [0, 1, 31, 32, 255, 256, 1023, 1024, 65535, 1_000_000]) {
      showcase.update(gameFrame(tick));
      for (const batch of showcase.world.batches as readonly SpriteBatch[]) {
        expect(batch.count).toBeLessThanOrEqual(batch.capacity);
      }
      const [far, mid, air, player, bullets] = showcase.world.batches;
      // 4 columns × 2 rows per starfield layer (128-px tiles), two layers share BG_MID.
      expect([far.count, mid.count, air.count, player.count, bullets.count]).toEqual([
        8, 16, 5, 4, 12,
      ]);
      expect(showcase.frame.hud.dropped).toBe(0);
    }
  });

  it('sizes and tiles the starfields for a custom tile size', () => {
    const showcase = createShowcase({ starTileSize: 64 });
    const columns = Math.ceil(PLAYFIELD_W / 64) + 1;
    const rows = Math.ceil(PLAYFIELD_H / 64);
    const [far, mid] = showcase.world.batches;
    expect([far.capacity, mid.capacity]).toEqual([columns * rows, 2 * columns * rows]);
    for (const tick of [0, 63, 64, 1000]) {
      showcase.update(gameFrame(tick));
      for (const batch of [far, mid]) {
        const xs = Array.from({ length: batch.count }, (_, i) => batch.x[i]);
        const ys = Array.from({ length: batch.count }, (_, i) => batch.y[i]);
        expect(Math.min(...xs)).toBeLessThanOrEqual(0);
        expect(Math.min(...xs)).toBeGreaterThan(-64);
        expect(Math.max(...xs) + 64).toBeGreaterThanOrEqual(PLAYFIELD_W);
        expect(Math.max(...ys) + 64).toBeGreaterThanOrEqual(PLAYFIELD_H);
      }
    }
  });

  it('copies tick and alpha from the game frame and keeps its own draw lists', () => {
    const showcase = createShowcase();
    const source = { ...gameFrame(42), alpha: 0.75 };
    const frame = showcase.update(source);
    expect([frame.tick, frame.alpha]).toEqual([42, 0.75]);
    expect(frame.hud).not.toBe(source.hud);
    expect(frame.screen).toEqual({ shakeX: 0, shakeY: 0, flash: 0, dim: 0 });
  });

  it('update() reuses every view object and retains no memory over 10,000 ticks', () => {
    setFlagsFromString('--expose-gc');
    const gc = runInNewContext('gc') as () => void;
    const showcase = createShowcase();
    const source = gameFrame(0) as { tick: number } & RenderFrame;
    const arrays = showcase.world.batches.map((batch) => [batch.x, batch.y, batch.flags]);
    const run = (from: number, to: number): void => {
      for (let tick = from; tick < to; tick++) {
        source.tick = tick;
        showcase.update(source);
      }
    };
    run(0, 2000);
    gc();
    gc();
    const before = process.memoryUsage().heapUsed;
    run(2000, 12_000);
    gc();
    gc();
    expect(process.memoryUsage().heapUsed - before).toBeLessThan(128 * 1024);
    showcase.world.batches.forEach((batch, i) => {
      expect([batch.x, batch.y, batch.flags]).toEqual(arrays[i]);
      expect(batch.x).toBe(arrays[i][0]);
    });
  });
});
