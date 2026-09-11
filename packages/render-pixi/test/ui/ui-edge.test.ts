/**
 * Edge cases of the draw-list view: sprite commands honour every SpriteFlag (Hidden skips the
 * command — regression: it used to be drawn — Flash draws the white sibling, flips mirror),
 * string-slot edits trigger a redraw, empty strings and unknown op codes draw nothing,
 * alpha / alignment / NaN numbers reach the quads, a full pool drops the rest of the list,
 * replaced sprite tables only show after invalidate(), and a HUD rebuilt every frame (the
 * showcase does that) stays nearly allocation-free.
 */
import { DrawOp, SpriteFlag, TextAlign, createDrawList } from '@shmup/core';
import type { Sprite } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { createAtlas } from '../../src/atlas/index.js';
import { createSpriteTables } from '../../src/sprites/index.js';
import { createBitmapFont } from '../../src/text/index.js';
import { createDrawListView } from '../../src/ui/index.js';
import { measureAllocation, pageImages, testManifest } from '../helpers.js';

/**
 * A draw-list view over the test atlas: sprite ids 0 = ships/a, 1 = bg/tile.
 *
 * @param capacity - Quads.
 */
function view(capacity = 16) {
  const manifest = testManifest();
  const atlas = createAtlas(manifest, pageImages(manifest), { onWarning: () => {} });
  const tables = createSpriteTables(atlas, ['ships/a', 'bg/tile']);
  const font = createBitmapFont(atlas);
  const drawListView = createDrawListView({ atlas, font, tables, capacity });
  const sprites = drawListView.container.children as Sprite[];
  /** @returns The sprites the last draw made visible. */
  const visible = (): Sprite[] => sprites.filter((sprite) => sprite.visible);
  return { atlas, tables, font, drawListView, sprites, visible };
}

describe('render-pixi/ui sprite commands (edge)', () => {
  it('skips Hidden sprite commands without using a quad (blinking HUD icons)', () => {
    const { atlas, drawListView, sprites } = view();
    const list = createDrawList(4);
    list.sprite(1, 0, 10, 10, SpriteFlag.Hidden);
    list.sprite(1, 0, 20, 10, SpriteFlag.Hidden | SpriteFlag.Flash);
    list.sprite(0, 0, 30, 10);
    drawListView.draw(list);
    expect(drawListView.pool.used).toBe(1);
    expect(sprites[0].texture).toBe(atlas.textures[atlas.spriteBase('ships/a')]);
    expect(sprites[1].visible).toBe(false);
  });

  it('draws the flash sibling on Flash and mirrors around the anchor on FlipY', () => {
    const { atlas, drawListView, sprites } = view();
    const list = createDrawList(2);
    list.sprite(0, 2, 40, 40, SpriteFlag.Flash);
    list.sprite(0, 0, 40, 40, SpriteFlag.FlipY);
    drawListView.draw(list);
    const base = atlas.spriteBase('ships/a');
    expect(sprites[0].texture).toBe(atlas.textures[atlas.spriteBase('ships/a@flash') + 2]);
    expect([sprites[1].scale.y, sprites[1].y]).toEqual([-1, 40 + atlas.anchorY[base]]);
  });

  it('passes the command alpha through as 0…1 and draws unknown sprite ids as ui/missing', () => {
    const { atlas, drawListView, sprites } = view();
    const list = createDrawList(2);
    list.sprite(0, 0, 0, 0, 0, 0xffffff, 51);
    list.sprite(9, 0, 0, 0);
    drawListView.draw(list);
    expect(sprites[0].alpha).toBeCloseTo(0.2);
    expect(sprites[1].texture).toBe(atlas.textures[atlas.missingFrame]);
  });

  it('shows new sprite tables only after invalidate() (the renderer calls it on setSpriteNames)', () => {
    const { atlas, tables, drawListView, sprites } = view();
    const list = createDrawList(1);
    list.sprite(0, 0, 0, 0);
    drawListView.draw(list);
    const swapped = createSpriteTables(atlas, ['bg/tile']);
    tables.base = swapped.base;
    tables.flash = swapped.flash;
    drawListView.draw(list);
    expect(sprites[0].texture).toBe(atlas.textures[atlas.spriteBase('ships/a')]);
    drawListView.invalidate();
    drawListView.draw(list);
    expect(sprites[0].texture).toBe(atlas.textures[atlas.spriteBase('bg/tile')]);
  });
});

describe('render-pixi/ui text and number commands (edge)', () => {
  it('redraws when a referenced string slot changes, even with the same commands', () => {
    const { atlas, font, drawListView, visible } = view();
    const list = createDrawList(1, 1);
    list.setString(0, 'A');
    list.text(0, 0, 0);
    drawListView.draw(list);
    expect(visible()).toHaveLength(1);
    list.setString(0, 'ABBA');
    drawListView.draw(list);
    expect(visible().map((sprite) => sprite.x)).toEqual([0, 6, 12, 18]);
    expect(visible()[1].texture).toBe(atlas.textures[font.glyphFrame(66)]);
  });

  it('draws nothing for an empty slot and aligns text by its command flags', () => {
    const { drawListView, visible } = view();
    const list = createDrawList(2, 2);
    list.setString(1, 'AB');
    list.text(0, 0, 0);
    list.text(1, 100, 5, 0xffffff, TextAlign.Center, 128);
    drawListView.draw(list);
    expect(visible().map((sprite) => [sprite.x, sprite.y])).toEqual([
      [94, 5],
      [100, 5],
    ]);
    expect(visible()[0].alpha).toBeCloseTo(128 / 255);
  });

  it('draws NaN numbers as 0, zero-padded and right-aligned by the command', () => {
    const { font, atlas, drawListView, visible } = view();
    const list = createDrawList(1);
    list.number(Number.NaN, 60, 0, 3, 0x00ff00, TextAlign.Right);
    drawListView.draw(list);
    const zero = atlas.textures[font.glyphFrame(48)];
    expect(visible().map((sprite) => [sprite.x, sprite.texture === zero, sprite.tint])).toEqual([
      [42, true, 0x00ff00],
      [48, true, 0x00ff00],
      [54, true, 0x00ff00],
    ]);
  });
});

describe('render-pixi/ui list handling (edge)', () => {
  it('ignores op codes it does not know without consuming quads', () => {
    const { drawListView } = view();
    const list = createDrawList(3);
    list.rect(0, 0, 2, 2, 0);
    list.rect(0, 0, 2, 2, 0);
    list.rect(0, 0, 2, 2, 0);
    // Forge an unknown op in the middle (a future op code this renderer predates).
    list.op[1] = 99;
    drawListView.draw(list);
    expect(drawListView.pool.used).toBe(2);
    expect(DrawOp.Rect).not.toBe(99);
  });

  it('keeps drawing in order until the pool is full, then counts the rest as dropped', () => {
    const { drawListView, sprites } = view(3);
    const list = createDrawList(4, 1);
    list.setString(0, 'AB');
    list.rect(0, 0, 1, 1, 0x111111);
    list.text(0, 0, 0);
    list.number(123, 0, 0);
    list.rect(0, 0, 1, 1, 0x222222);
    drawListView.draw(list);
    // Dropped: the number's first digit (the number stops there), then the last rect.
    expect([drawListView.pool.used, drawListView.pool.dropped]).toEqual([3, 2]);
    expect(sprites[0].tint).toBe(0x111111);
    // The last rect never made it in: no sprite carries its colour.
    expect(sprites.some((sprite) => sprite.tint === 0x222222)).toBe(false);
  });

  it('switching lists back and forth always redraws, even when both keep their revision', () => {
    const { drawListView, visible } = view();
    const one = createDrawList(1);
    one.rect(0, 0, 1, 1, 0);
    const two = createDrawList(2);
    two.rect(0, 0, 1, 1, 0);
    two.rect(1, 0, 1, 1, 0);
    for (let i = 0; i < 3; i++) {
      drawListView.draw(one);
      expect(visible()).toHaveLength(1);
      drawListView.draw(two);
      expect(visible()).toHaveLength(2);
    }
  });

  it('a HUD list rebuilt every frame (scores ticking) allocates next to nothing', () => {
    const { drawListView } = view(64);
    const hud = createDrawList(32, 4);
    hud.setString(0, '1P');
    const bytes = measureAllocation((tick) => {
      hud.clear();
      hud.rect(0, 0, 384, 8, 0x1d2a5c);
      hud.text(0, 4, 0, 0x38c8e8);
      hud.number(tick * 10, 20, 0, 8);
      hud.sprite(0, tick % 3, 200, 4, tick % 16 < 8 ? 0 : SpriteFlag.FlipX);
      hud.rect(0, 208, 384, 8, 0x1d2a5c);
      drawListView.draw(hud);
    }, 10_000);
    // Re-tinting every quad through Pixi's Color path on each redraw was ~9 MB here.
    expect(bytes).toBeLessThan(1.5 * 1024 * 1024);
  });
});
