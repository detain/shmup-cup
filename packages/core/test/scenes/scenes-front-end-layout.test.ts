/**
 * The front end's language-dependent layout at the current frame (plan_resolution.md R2-01, U3's
 * layout pass), on the shipped content and string tables: the title menu's cursor clears the
 * session language's longest label (es `TEST DE SONIDO`) and keeps English's offset; the difficulty
 * menu's `CONTINUES` clears its number (es `CONTINUACIONES`) and keeps English's place; the title's
 * session hi-score line shows on the title and under the screens v1 showed it under, clear of
 * their panels, and hides under the Options pages (at 640×360 their panel no longer covers it) and
 * the difficulty menu (it shows the preset's own `HI`).
 */
import { describe, expect, it } from 'vitest';
import { FRAME_CX, FRAME_H, GLYPH_H, GLYPH_W } from '../../src/config/index.js';
import {
  Action,
  ControlsItem,
  DrawOp,
  ExtraItem,
  OptionsItem,
  TextAlign,
  TitleItem,
  type DrawList,
  type ListMenu,
} from '../../src/index.js';
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

/**
 * Whether a rectangle drawn after the title's hi-score line cuts it (`HI`, 4 px, eight digits) —
 * a panel of a screen opened over the title.
 *
 * @param list - The UI list.
 * @returns `true` when one does.
 */
function titleHiCovered(list: DrawList): boolean {
  let from = -1;
  for (let i = 0; i < list.count && from < 0; i++) {
    const ours = list.op[i] === DrawOp.Text && list.strings[list.ref[i]] === 'HI';
    if (ours && list.x[i] === TITLE_HI_X && list.y[i] === TITLE_HI_Y) from = i;
  }
  expect(from).toBeGreaterThanOrEqual(0);
  const x1 = TITLE_HI_X + 10 * GLYPH_W + uiPx(4);
  const y1 = TITLE_HI_Y + GLYPH_H;
  for (let i = from + 1; i < list.count; i++) {
    if (list.op[i] !== DrawOp.Rect) continue;
    const x = list.x[i];
    const y = list.y[i];
    if (x < x1 && TITLE_HI_X < x + list.w[i] && y < y1 && TITLE_HI_Y < y + list.h[i]) return true;
  }
  return false;
}

/**
 * Expects the title's hi-score line in the frame now drawn: shown and clear of every panel, or not
 * drawn at all.
 *
 * @param w - The walk.
 * @param shown - Whether it should show.
 */
function expectTitleHi(w: LayoutWalk, shown: boolean): void {
  const ui = w.game.renderFrame().ui;
  expect(titleHi(ui), w.top).toBe(shown);
  if (shown) expect(titleHiCovered(ui), w.top).toBe(false);
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
    expectTitleHi(w, true);
    w.press(Action.Back);
    w.at('confirm');
    expectTitleHi(w, true);
    w.presses(Action.Back);
    w.hold(0, 2);
    w.at('title');
    expectTitleHi(w, true);
  });

  /** The menus over the title that keep its hi-score, in every language. */
  const keeping: Array<[string, string, number]> = [];
  for (const lang of ['en', 'es', 'ja']) {
    keeping.push([lang, 'practice', TitleItem.Practice]);
    keeping.push([lang, 'soundTest', TitleItem.SoundTest]);
    keeping.push([lang, 'extra', TitleItem.Extra]);
  }

  it.each(keeping)(
    'keeps the title hi-score in %s under %s, clear of its panel',
    (lang, id, item) => {
      const w = new LayoutWalk(db, { language: lang, start: 'title' });
      w.hold(0, 2);
      w.title(item);
      w.at(id);
      w.hold(0, 2);
      expectTitleHi(w, true);
      w.press(Action.Back);
      w.hold(0, 2);
      w.at('title');
      expectTitleHi(w, true);
    },
  );

  it.each(['en', 'es', 'ja'])(
    'keeps the title hi-score in %s under REPLAYS, clear of it',
    (lang) => {
      const w = new LayoutWalk(db, { language: lang, start: 'title' });
      w.hold(0, 2);
      w.title(TitleItem.Extra);
      w.at('extra');
      w.hold(0, 2);
      w.focus(w.flow.extra.menu, ExtraItem.Replays);
      w.press(Action.Confirm);
      w.at('replays');
      w.hold(0, 4);
      expectTitleHi(w, true);
    },
  );

  it.each(['en', 'es', 'ja'])(
    'hides it in %s under difficulty, shows it under ship select',
    (lang) => {
      const w = new LayoutWalk(db, { language: lang, start: 'title' });
      w.hold(0, 2);
      w.title(TitleItem.Start);
      w.at('difficulty');
      w.hold(0, 2);
      expectTitleHi(w, false);
      w.press(Action.Confirm);
      w.at('shipSelect');
      w.hold(0, 2);
      expectTitleHi(w, true);
      w.press(Action.Back);
      w.hold(0, 2);
      w.at('difficulty');
      expectTitleHi(w, false);
      w.press(Action.Back);
      w.hold(0, 2);
      w.at('title');
      expectTitleHi(w, true);
    },
  );

  it('hides the title hi-score under the Options screen and every page of it', () => {
    const w = new LayoutWalk(db, { language: 'en', start: 'title' });
    const flow = w.flow;
    w.hold(0, 2);
    w.title(TitleItem.Options);
    w.at('options');
    w.hold(0, 2);
    expectTitleHi(w, false);
    const pages: Array<[number, string, () => ListMenu]> = [
      [OptionsItem.Display, 'display', () => flow.displayPage.menu],
      [OptionsItem.Game, 'gameOptions', () => flow.gameOptionsPage.menu],
      [OptionsItem.Extras, 'extras', () => flow.extrasPage.menu],
    ];
    for (const [item, id] of pages) {
      w.focus(flow.options.menu, item);
      w.press(Action.Confirm);
      w.at(id);
      w.hold(0, 2);
      expectTitleHi(w, false);
      w.press(Action.Back);
      w.hold(0, 2);
      w.at('options');
    }
    w.focus(flow.options.menu, OptionsItem.Controls);
    w.press(Action.Confirm);
    w.at('controls');
    w.hold(0, 2);
    expectTitleHi(w, false);
    w.focus(flow.controlsPage.menu, ControlsItem.Keys);
    w.press(Action.Confirm);
    w.at('rebind');
    w.hold(0, 4);
    expectTitleHi(w, false);
    w.press(Action.Back);
    w.hold(0, 4);
    w.at('controls');
    w.focus(flow.controlsPage.menu, ControlsItem.InputTest);
    w.press(Action.Confirm);
    w.at('inputTest');
    w.hold(0, 4);
    expectTitleHi(w, false);
    w.press(Action.Pause);
    w.press(Action.Pause);
    w.press(Action.Pause);
    w.hold(0, 4);
    w.at('controls');
    w.press(Action.Back);
    w.hold(0, 2);
    w.at('options');
    w.press(Action.Back);
    w.hold(0, 4);
    w.at('title');
    expectTitleHi(w, true);
  });
});
