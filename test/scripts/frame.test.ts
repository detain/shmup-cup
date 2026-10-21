/**
 * `scripts/frame.mjs` (plan_resolution.md R1-02): the scripts' mirror of the frame constants
 * equals `@shmup/core`'s, export for export, so a change of the frame in core (R2-01) cannot leave
 * the tools, the e2e viewport or the docs' captures behind; the capture scale follows decision O9
 * (`floor(1280 / FRAME_W)`); and the e2e helper `test/e2e/frame-pixels.ts` maps frame pixels to
 * the centres of their screenshot blocks, and places the boss HP bar `advanced-bosses.spec.ts`
 * reads where `core/ui` draws it (R1-02d — the specs cannot import core, so they repeat its
 * formula and this test keeps the copy from drifting): the label, the frame and the fill row are
 * read from `buildHud`'s own draw list for a frame with the bar up, besides `HUD_LAYOUT`.
 */
import { readFileSync } from 'node:fs';
import * as core from '@shmup/core';
import { describe, expect, it } from 'vitest';
import * as frame from '../../scripts/frame.mjs';
import {
  BOSS_BAR_W,
  BOSS_BAR_X,
  BOSS_FILL_Y,
  BOSS_LABEL_W,
  BOSS_LABEL_X,
  SCALE,
  UI_ART_SCALE,
  VIEWPORT,
  pixelIndex,
  sx,
  sy,
  uiPx,
} from '../e2e/frame-pixels.js';

/** Mirror export → the `@shmup/core` export it must equal. */
const MIRRORED = {
  FRAME_W: core.FRAME_W,
  FRAME_H: core.FRAME_H,
  FRAME_CX: core.FRAME_CX,
  FRAME_CY: core.FRAME_CY,
  HUD_BAR_HEIGHT: core.HUD_BAR_HEIGHT,
  PLAYFIELD_Y: core.PLAYFIELD_Y,
  PLAYFIELD_W: core.PLAYFIELD_W,
  PLAYFIELD_H: core.PLAYFIELD_H,
  PLAYFIELD_CY: core.PLAYFIELD_CY,
  HUD_BOTTOM_Y: core.HUD_BOTTOM_Y,
  TILE_SIZE: core.TILE_SIZE,
  GLYPH_W: core.GLYPH_W,
  GLYPH_H: core.GLYPH_H,
  LINE_H: core.LINE_H,
  WORLD_SCALE: core.WORLD_SCALE,
  SPAWN_LEAD: core.DEFAULT_SPAWN_SCREEN_X,
} as const;

describe('scripts/frame.mjs', () => {
  it.each(Object.entries(MIRRORED))('%s equals @shmup/core', (name, value) => {
    expect((frame as Record<string, unknown>)[name]).toBe(value);
  });

  it('exports exactly the mirrored constants and the capture scale', () => {
    expect(Object.keys(frame).sort()).toEqual([...Object.keys(MIRRORED), 'CAPTURE_SCALE'].sort());
  });

  it('derives the capture scale: the largest whole scale of the frame within 1280 columns', () => {
    expect(frame.CAPTURE_SCALE).toBe(Math.floor(1280 / core.FRAME_W));
    expect(Number.isInteger(frame.CAPTURE_SCALE)).toBe(true);
    expect(frame.CAPTURE_SCALE).toBeGreaterThanOrEqual(1);
    expect(frame.CAPTURE_SCALE * core.FRAME_W).toBeLessThanOrEqual(1280);
    expect((frame.CAPTURE_SCALE + 1) * core.FRAME_W).toBeGreaterThan(1280);
  });

  it('holds only whole numbers', () => {
    for (const [name, value] of Object.entries(frame)) {
      // WORLD_SCALE may be fractional (1 until R2-02's port, then 3/2) — like ART_SCALE in core.
      if (name === 'WORLD_SCALE') continue;
      expect(Number.isInteger(value), name).toBe(true);
    }
  });

  it('holds WORLD_SCALE positive with a whole double (1 until R2-02, 3/2 after)', () => {
    expect(frame.WORLD_SCALE).toBeGreaterThan(0);
    expect(Number.isInteger(frame.WORLD_SCALE * 2)).toBe(true);
  });
});

describe('test/e2e/frame-pixels.ts', () => {
  it('sizes the viewport as the frame at the capture scale', () => {
    expect(SCALE).toBe(frame.CAPTURE_SCALE);
    expect(VIEWPORT).toEqual({ width: core.FRAME_W * SCALE, height: core.FRAME_H * SCALE });
    expect(Object.isFrozen(VIEWPORT)).toBe(true);
  });

  it('maps a frame pixel to the centre of its screenshot block', () => {
    const half = Math.floor(SCALE / 2);
    for (const f of [0, 1, 7, core.FRAME_CX, core.FRAME_W - 1]) {
      expect(sx(f)).toBe(f * SCALE + half);
      expect(sx(f)).toBeGreaterThanOrEqual(f * SCALE);
      expect(sx(f)).toBeLessThan((f + 1) * SCALE);
    }
    for (const f of [0, core.PLAYFIELD_Y, core.HUD_BOTTOM_Y, core.FRAME_H - 1]) {
      expect(sy(f)).toBe(f * SCALE + half);
    }
    // The last frame pixel's sample stays inside the viewport.
    expect(sx(core.FRAME_W - 1)).toBeLessThan(VIEWPORT.width);
    expect(sy(core.FRAME_H - 1)).toBeLessThan(VIEWPORT.height);
  });

  it('gives the byte offset of that sample in an RGBA screenshot', () => {
    const width = VIEWPORT.width;
    expect(pixelIndex(width, 0, 0)).toBe((sy(0) * width + sx(0)) * 4);
    expect(pixelIndex(width, 5, core.PLAYFIELD_Y)).toBe((sy(core.PLAYFIELD_Y) * width + sx(5)) * 4);
    expect(pixelIndex(width, core.FRAME_W - 1, core.FRAME_H - 1) + 3).toBeLessThan(
      VIEWPORT.width * VIEWPORT.height * 4,
    );
  });

  // The specs' hand-written mapping before R1-02 (the 640×360 frame of R2-01 is ×2 instead).
  it.runIf((core.FRAME_W as number) === 384)(
    'is the specs’ old ×3 mapping at the 384×216 frame',
    () => {
      expect(VIEWPORT).toEqual({ width: 1152, height: 648 });
      for (const f of [0, 8, 100, 207, 383]) expect(sx(f)).toBe(3 * f + 1);
    },
  );
});

/**
 * A shipped content file.
 *
 * @param path - Path below `content/`.
 * @returns The file.
 */
function shipped(path: string): core.ContentFile {
  const url = new URL('../../content/' + path, import.meta.url);
  return { path, data: JSON.parse(readFileSync(url, 'utf8')) as unknown };
}

/**
 * What core draws for a frame with the boss HP bar up: a World of the KESTREL whose bar model
 * (`bosses.hpBar`, which the boss system refreshes every tick) counts one boss at full strength,
 * passed to `buildHud` with the boss-HP option on.
 *
 * @returns The HUD's draw list.
 */
function bossHud(): core.DrawList {
  const { db, issues } = core.loadContent(
    [shipped('player/kestrel.player.json'), shipped('weapons/type-a.weapons.json')],
    { extraSprites: core.ENGINE_SPRITES },
  );
  expect(issues).toEqual([]);
  const world = core.createWorld(core.resolveGameConfig({ seed: 1 }), db);
  const bar = world.bosses.hpBar;
  bar.visible = true;
  bar.hp = 44;
  bar.maxHp = 44;
  bar.bosses = 1;
  const list = core.createDrawList(core.HUD_COMMAND_COUNT, core.HUD_STRING_COUNT);
  core.buildHud(world, list, undefined, true);
  return list;
}

/** One command of a draw list: where it draws, and its text for a text command. */
interface Drawn {
  /** Its x in frame pixels. */
  readonly x: number;
  /** Its y in frame pixels. */
  readonly y: number;
  /** Its width (rectangles; 0 for text). */
  readonly w: number;
  /** Its height (rectangles; 0 for text). */
  readonly h: number;
  /** Its string (text commands; `''` otherwise). */
  readonly text: string;
}

/**
 * The commands of a draw list of one kind and colour.
 *
 * @param list - The list.
 * @param op - The command kind.
 * @param color - The colour.
 * @returns Those commands, in draw order.
 */
function drawn(list: core.DrawList, op: core.DrawOp, color: number): Drawn[] {
  const out: Drawn[] = [];
  for (let i = 0; i < list.count; i++) {
    if (list.op[i] !== op || list.color[i] !== color) continue;
    const text = op === core.DrawOp.Text ? (list.strings[list.ref[i]] ?? '') : '';
    out.push({ x: list.x[i], y: list.y[i], w: list.w[i], h: list.h[i], text });
  }
  return out;
}

describe('test/e2e/frame-pixels.ts: the boss HP bar of advanced-bosses.spec.ts', () => {
  it('derives the art scale core lays the HUD out with (R2-01: ART_SCALE)', () => {
    expect(UI_ART_SCALE).toBe(core.ART_SCALE);
  });

  it('scales a UI length the way core/ui uiPx does', () => {
    for (const v of [0, 1, 2, 4, 5, 8, 9, 10, 20, 24, 30, 48])
      expect(uiPx(v), String(v)).toBe(core.uiPx(v));
  });

  it('places the BOSS label and the bar where core/ui draws them', () => {
    expect(BOSS_LABEL_X).toBe(core.HUD_LAYOUT.bossX);
    expect(BOSS_BAR_X).toBe(core.HUD_LAYOUT.bossBarX);
    expect(BOSS_BAR_W).toBe(core.BOSS_HP_BAR_WIDTH);
  });

  it('reads the label, the frame and the fill row from what buildHud draws for a boss', () => {
    const list = bossHud();
    // The BOSS label: one text command in the label's red, at the label's x in the top bar.
    const [label, ...moreLabels] = drawn(list, core.DrawOp.Text, core.HUD_COLORS.bossLabel);
    expect(moreLabels).toEqual([]);
    expect(label?.text).toBe(core.DEFAULT_UI_TEXT.hudBoss);
    expect(label?.x).toBe(BOSS_LABEL_X);
    expect(label?.y).toBe(core.HUD_LAYOUT.topY);
    expect(BOSS_LABEL_W).toBe((label?.text.length ?? 0) * core.GLYPH_W);
    // The bar's frame: x and width.
    const [box, ...moreBoxes] = drawn(list, core.DrawOp.Rect, core.HUD_COLORS.bossFrame);
    expect(moreBoxes).toEqual([]);
    expect([box?.x, box?.w]).toEqual([BOSS_BAR_X, BOSS_BAR_W]);
    // The fill at full strength: its top row is the row the spec samples, inside the frame.
    const [fill, ...moreFills] = drawn(list, core.DrawOp.Rect, core.HUD_COLORS.bossFill);
    expect(moreFills).toEqual([]);
    expect(fill?.y).toBe(BOSS_FILL_Y);
    expect(fill?.x).toBe(BOSS_BAR_X + 1);
    expect((fill?.x ?? 0) + (fill?.w ?? 0)).toBeLessThanOrEqual(BOSS_BAR_X + BOSS_BAR_W);
    // The label ends before the bar starts, and both stay inside the top HUD bar and the frame.
    expect(BOSS_LABEL_X + BOSS_LABEL_W).toBeLessThanOrEqual(BOSS_BAR_X);
    expect(BOSS_FILL_Y + (fill?.h ?? 0)).toBeLessThanOrEqual(core.HUD_BAR_HEIGHT);
    expect(BOSS_BAR_X + BOSS_BAR_W).toBeLessThanOrEqual(core.FRAME_W);
  });

  // The values the mirror derives at the 384×216 state with the 6-px font: since R4-03.C5 the
  // bar is a quarter of the frame, so the trio re-anchors with it (before C5: 148 / 176, 64).
  it.runIf((core.FRAME_W as number) === 384 && (core.GLYPH_W as number) === 6)(
    'is x 132 / 160, 96 wide at 384×216',
    () => {
      expect([BOSS_LABEL_X, BOSS_BAR_X, BOSS_BAR_W, BOSS_FILL_Y]).toEqual([132, 160, 96, 3]);
    },
  );
});
