/**
 * Tests for the draw-list view: every DrawList op lands in the ordered quad pool (rects as the
 * scaled white pixel, sprites through the sprite tables, text and numbers as glyphs), in
 * command order; unchanged lists are not redrawn; invalidate() forces a redraw.
 */
import { SpriteFlag, TextAlign, createDrawList } from '@shmup/core';
import type { Sprite } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { createAtlas, type Atlas } from '../../src/atlas/index.js';
import { createSpriteTables } from '../../src/sprites/index.js';
import { createBitmapFont } from '../../src/text/index.js';
import { createDrawListView, moduleInfo } from '../../src/ui/index.js';
import { pageImages, testManifest } from '../helpers.js';

/** @returns The small test atlas. */
function atlas(): Atlas {
  const manifest = testManifest();
  return createAtlas(manifest, pageImages(manifest), { onWarning: () => {} });
}

/** @returns A view over the test atlas with sprite ids 0 = ships/a, 1 = bg/tile. */
function view(capacity = 16) {
  const a = atlas();
  const tables = createSpriteTables(a, ['ships/a', 'bg/tile']);
  const font = createBitmapFont(a);
  const drawListView = createDrawListView({ atlas: a, font, tables, capacity, label: 'hud' });
  return { a, font, tables, drawListView, sprites: drawListView.container.children as Sprite[] };
}

describe('render-pixi/ui createDrawListView', () => {
  it('describes itself', () => {
    expect(moduleInfo.name).toBe('ui');
    expect(moduleInfo.status).toBe('partial');
  });

  it('draws rect, sprite, text and number commands in command order', () => {
    const { a, font, drawListView, sprites } = view();
    const list = createDrawList(8, 2);
    list.setString(0, 'AB');
    list.rect(0, 0, 384, 8, 0x1d2a5c, 200);
    list.sprite(0, 1, 50, 50, SpriteFlag.FlipX, 0xff00ff);
    list.text(0, 100, 0, 0x38c8e8, TextAlign.Right);
    list.number(7, 10, 0, 2);
    drawListView.draw(list);
    expect(drawListView.pool.used).toBe(6);
    expect(sprites[0].texture).toBe(a.textures[a.pixelFrame]);
    expect([sprites[0].scale.x, sprites[0].scale.y, sprites[0].tint]).toEqual([384, 8, 0x1d2a5c]);
    expect(sprites[1].texture).toBe(a.textures[18]);
    expect([sprites[1].x, sprites[1].scale.x, sprites[1].tint]).toEqual([58, -1, 0xff00ff]);
    expect(sprites[2].texture).toBe(a.textures[font.glyphFrame(65)]);
    expect([sprites[2].x, sprites[3].x, sprites[2].tint]).toEqual([88, 94, 0x38c8e8]);
    expect(sprites[4].texture).toBe(a.textures[font.glyphFrame(48)]);
    expect(sprites[5].texture).toBe(a.textures[font.glyphFrame(55)]);
    expect(sprites.slice(6).every((s) => !s.visible)).toBe(true);
  });

  it('skips a redraw while the same list keeps its revision, and redraws after a change', () => {
    const { drawListView, sprites } = view();
    const list = createDrawList(4, 1);
    list.rect(0, 0, 1, 1, 0xffffff);
    drawListView.draw(list);
    sprites[0].visible = false; // tamper: a skipped draw leaves it alone
    drawListView.draw(list);
    expect(sprites[0].visible).toBe(false);
    list.rect(1, 1, 1, 1, 0xffffff);
    drawListView.draw(list);
    expect(sprites.slice(0, 2).map((s) => s.visible)).toEqual([true, true]);
    list.clear();
    drawListView.draw(list);
    expect(drawListView.pool.used).toBe(0);
    expect(sprites.slice(0, 2).map((s) => s.visible)).toEqual([false, false]);
  });

  it('redraws when handed another list, or after invalidate()', () => {
    const { drawListView, sprites } = view();
    const first = createDrawList(2, 1);
    first.rect(0, 0, 2, 2, 0xffffff);
    const second = createDrawList(2, 1);
    drawListView.draw(first);
    drawListView.draw(second);
    expect(sprites[0].visible).toBe(false);
    drawListView.draw(first);
    sprites[0].visible = false;
    drawListView.invalidate();
    drawListView.draw(first);
    expect(sprites[0].visible).toBe(true);
  });

  it('skips text and numbers without a font but still draws rects and sprites', () => {
    const a = atlas();
    const drawListView = createDrawListView({
      atlas: a,
      font: null,
      tables: createSpriteTables(a, ['ships/a']),
    });
    const list = createDrawList(4, 1);
    list.setString(0, 'AB');
    list.text(0, 0, 0);
    list.number(123, 0, 0);
    list.rect(0, 0, 4, 4, 0);
    list.sprite(0, 0, 10, 10);
    drawListView.draw(list);
    expect(drawListView.pool.used).toBe(2);
    expect(drawListView.pool.capacity).toBe(1024);
    drawListView.destroy();
    expect(drawListView.container.destroyed).toBe(true);
  });
});
