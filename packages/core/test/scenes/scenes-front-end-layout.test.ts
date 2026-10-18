/**
 * The front end's language-dependent layout at the current frame (plan_resolution.md R2-01, U3's
 * layout pass), on the shipped content and string tables: the title menu's cursor clears the
 * session language's longest label (es `TEST DE SONIDO`) and keeps English's offset; the difficulty
 * menu's `CONTINUES` clears its number (es `CONTINUACIONES`) and keeps English's place; the title's
 * session hi-score line shows on the title and under its exit question, never under a menu opened
 * over it (at 640×360 the Options pages' panel no longer covers it).
 */
import { describe, expect, it } from 'vitest';
import { FRAME_CX, FRAME_H, GLYPH_W } from '../../src/config/index.js';
import { Action, DrawOp, TextAlign, TitleItem, type DrawList } from '../../src/index.js';
import { uiPx } from '../../src/ui/index.js';
import { LayoutWalk, shippedDb } from '../helpers/layout-walks.js';

/** One text command of a list. */
interface Drawn {
  /** Its words. */
  readonly text: string;
  /** Its x and y. */
  readonly x: number;
  readonly y: number;
  /** Its {@link TextAlign}. */
  readonly align: number;
}

/**
 * The text commands of a draw list.
 *
 * @param list - The list.
 * @returns Them, in drawing order.
 */
function texts(list: DrawList): Drawn[] {
  const out: Drawn[] = [];
  for (let i = 0; i < list.count; i++) {
    if (list.op[i] !== DrawOp.Text) continue;
    out.push({
      text: list.strings[list.ref[i]] ?? '',
      x: list.x[i],
      y: list.y[i],
      align: list.flags[i],
    });
  }
  return out;
}

/**
 * The one text command drawing some words.
 *
 * @param list - The list.
 * @param words - The words.
 * @returns It.
 */
function drawn(list: DrawList, words: string): Drawn {
  const found = texts(list).filter((t) => t.text === words);
  expect(found, words).toHaveLength(1);
  return found[0];
}

/**
 * The x of every number command on a row, in drawing order.
 *
 * @param list - The list.
 * @param y - The row.
 * @returns The xs.
 */
function numbersOn(list: DrawList, y: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < list.count; i++) {
    if (list.op[i] === DrawOp.Number && list.y[i] === y) out.push(list.x[i]);
  }
  return out;
}

/** The difficulty panel's left edge and the right edge of its right-aligned numbers. */
const DIFFICULTY_PANEL_W = 28 * GLYPH_W + uiPx(8);
const DIFFICULTY_X = FRAME_CX - (DIFFICULTY_PANEL_W >> 1);
const DIFFICULTY_RIGHT = DIFFICULTY_X + DIFFICULTY_PANEL_W - uiPx(12);

/** The title's hi-score line: `HI`'s x and the row. */
const TITLE_HI_X = FRAME_CX - uiPx(40);
const TITLE_HI_Y = FRAME_H - uiPx(20);

/**
 * Whether the title's own `HI` label is in a list.
 *
 * @param list - The UI list.
 * @returns `true` when it is drawn.
 */
function titleHi(list: DrawList): boolean {
  return texts(list).some((t) => t.text === 'HI' && t.x === TITLE_HI_X && t.y === TITLE_HI_Y);
}

describe('core/scenes front-end layout in the session language (R2-01)', () => {
  const db = shippedDb();

  it.each(['en', 'es', 'ja'])('keeps the title cursor clear of the longest label in %s', (lang) => {
    const w = new LayoutWalk(db, { language: lang, start: 'title' });
    w.hold(0, 2);
    w.press(Action.Confirm);
    w.hold(0, 2);
    const menu = w.flow.title.menu;
    let longest = 0;
    for (let i = 0; i < menu.items.length; i++) {
      w.focus(menu, i);
      const ui = w.game.renderFrame().ui;
      const label = drawn(ui, menu.items[i].label);
      expect(label.align).toBe(TextAlign.Center);
      const left = label.x - ((label.text.length * GLYPH_W) >> 1);
      const cursor = drawn(ui, '→');
      // The cursor's cell and 4 px before the label, at least.
      expect(cursor.x + GLYPH_W + uiPx(4)).toBeLessThanOrEqual(left);
      longest = Math.max(longest, label.text.length);
    }
    const cursorX = drawn(w.game.renderFrame().ui, '→').x;
    if (longest <= 10) {
      // English's offset (half of SOUND TEST's ten cells, the cursor's cell and 4 px).
      expect(cursorX).toBe(FRAME_CX - 6 * GLYPH_W - uiPx(4));
    } else {
      expect(cursorX).toBe(FRAME_CX - ((longest * GLYPH_W) >> 1) - GLYPH_W - uiPx(4));
    }
  });

  it.each(['en', 'es', 'ja'])('keeps CONTINUES clear of its numbers in %s', (lang) => {
    const w = new LayoutWalk(db, { language: lang, start: 'title' });
    w.hold(0, 2);
    w.title(TitleItem.Start);
    w.at('difficulty');
    w.hold(0, 2);
    const ui = w.game.renderFrame().ui;
    const label = drawn(ui, w.flow.text.continues);
    const end = label.x + label.text.length * GLYPH_W;
    // The number has one digit (MAX_CONTINUES 9), right-aligned on the panel's number column.
    expect(end + uiPx(4)).toBeLessThanOrEqual(DIFFICULTY_RIGHT - GLYPH_W);
    // The lives' one digit, left-aligned on the same row, ends before the label.
    const lives = numbersOn(ui, label.y)[0];
    expect(lives + GLYPH_W + uiPx(4)).toBeLessThanOrEqual(label.x);
    if (lang !== 'es') {
      expect(label.x).toBe(DIFFICULTY_X + uiPx(80));
      expect(lives).toBe(DIFFICULTY_X + uiPx(60));
    } else {
      // es CONTINUACIONES ends 4 px before its number; the lives follow VIDAS 4 px after it.
      expect(end).toBe(DIFFICULTY_RIGHT - GLYPH_W - uiPx(4));
      expect(lives).toBe(DIFFICULTY_X + uiPx(12) + w.flow.text.lives.length * GLYPH_W + uiPx(4));
    }
  });

  it('draws the title hi-score on the title and under the exit question', () => {
    const w = new LayoutWalk(db, { language: 'en', start: 'title', canExit: true });
    w.hold(0, 2);
    expect(titleHi(w.game.renderFrame().ui)).toBe(true);
    w.press(Action.Back);
    w.at('confirm');
    expect(titleHi(w.game.renderFrame().ui)).toBe(true);
    w.presses(Action.Back);
    w.hold(0, 2);
    w.at('title');
    expect(titleHi(w.game.renderFrame().ui)).toBe(true);
  });

  it.each([
    ['options', TitleItem.Options],
    ['difficulty', TitleItem.Start],
    ['practice', TitleItem.Practice],
    ['soundTest', TitleItem.SoundTest],
    ['extra', TitleItem.Extra],
  ])('hides the title hi-score under the %s menu, and shows it again after', (id, item) => {
    const w = new LayoutWalk(db, { language: 'en', start: 'title' });
    w.hold(0, 2);
    w.title(item);
    w.at(id);
    w.hold(0, 2);
    expect(titleHi(w.game.renderFrame().ui)).toBe(false);
    w.press(Action.Back);
    w.hold(0, 2);
    w.at('title');
    expect(titleHi(w.game.renderFrame().ui)).toBe(true);
  });
});
