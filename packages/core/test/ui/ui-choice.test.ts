/**
 * Tests of the UI kit's `Choice` widget (plan M1-17 — the Options screen's input-profile
 * selector): creation, stepping with Left / Right / Confirm in a list menu (wrapping), disabled
 * items, the extra string slot and how `drawMenu` shows the chosen label.
 */
import { describe, expect, it } from 'vitest';
import { Action, type PlayerInput } from '../../src/input/index.js';
import { DrawOp, createDrawList } from '../../src/presentation/index.js';
import {
  MenuItemKind,
  MenuResult,
  UI_COLORS,
  createChoice,
  createListMenu,
  createSlider,
  drawMenu,
  menuStringSlots,
  menuTick,
} from '../../src/ui/index.js';

/**
 * One tick of input with a press.
 *
 * @param pressed - Pressed actions.
 * @returns The input.
 */
function tap(pressed: number): PlayerInput {
  return { held: pressed, pressed, released: 0, device: 'keyboard' };
}

const IDLE: PlayerInput = { held: 0, pressed: 0, released: 0, device: 'keyboard' };
const LAYOUT = Object.freeze({ x: 10, y: 20, valueX: 90 });

describe('core/ui Choice', () => {
  it('clamps its starting index and names the chosen label', () => {
    expect(createChoice(['A', 'B'], 5).label).toBe('B');
    expect(createChoice(['A', 'B'], -2).index).toBe(0);
    expect(createChoice(['A', 'B'], Number.NaN).index).toBe(0);
    expect(() => createChoice([])).toThrow(RangeError);
    const labels = ['X'];
    const choice = createChoice(labels);
    labels.push('Y');
    expect(choice.labels).toEqual(['X']); // copied
  });

  it('steps with Left / Right (wrapping) and Confirm, as a Choice item', () => {
    const choice = createChoice(['ONE', 'TWO', 'THREE']);
    const menu = createListMenu([{ label: 'PICK', choice }, 'BACK']);
    expect(menu.items[0].kind).toBe(MenuItemKind.Choice);
    expect(menu.items[0].choice).toBe(choice);
    const revision = menu.revision;
    expect(menuTick(menu, tap(Action.Left))).toBe(MenuResult.Changed);
    expect(choice.label).toBe('THREE');
    menuTick(menu, IDLE);
    expect(menuTick(menu, tap(Action.Right))).toBe(MenuResult.Changed);
    expect(choice.index).toBe(0);
    menuTick(menu, IDLE);
    expect(menuTick(menu, tap(Action.Confirm))).toBe(MenuResult.Changed);
    expect(choice.index).toBe(1);
    expect(menu.revision).toBe(revision + 3);
  });

  it('a single label never changes (Confirm activates the item instead)', () => {
    const menu = createListMenu([{ label: 'PICK', choice: createChoice(['ONLY']) }]);
    expect(menuTick(menu, tap(Action.Right))).toBe(MenuResult.None);
    menuTick(menu, IDLE);
    expect(menuTick(menu, tap(Action.Confirm))).toBe(MenuResult.Confirmed);
  });

  it('a disabled Choice item is skipped and not changed', () => {
    const choice = createChoice(['A', 'B']);
    const menu = createListMenu(['TOP', { label: 'PICK', choice }, 'END'], { disabledMask: 0b010 });
    menuTick(menu, tap(Action.Down));
    expect(menu.focus).toBe(2);
    menu.focus = 1; // forced
    expect(menuTick(menu, tap(Action.Right))).toBe(MenuResult.None);
    expect(choice.index).toBe(0);
  });

  it('prefers a slider or toggle given with a choice', () => {
    const menu = createListMenu([
      { label: 'S', slider: createSlider(0, 1, 1, 0), choice: createChoice(['A']) },
    ]);
    expect([menu.items[0].kind, menu.items[0].choice]).toEqual([MenuItemKind.Slider, null]);
  });

  it('uses one extra string slot per choice and draws the chosen label', () => {
    const a = createChoice(['FIRST', 'SECOND'], 1);
    const b = createChoice(['LEFT', 'RIGHT']);
    const menu = createListMenu([{ label: 'ONE', choice: a }, { label: 'TWO', choice: b }, 'BACK']);
    expect(menuStringSlots(menu)).toBe(3 + 3 + 2);
    const list = createDrawList(64, 16);
    drawMenu(list, menu, 0, LAYOUT);
    const texts: Array<[string, number, number]> = [];
    for (let i = 0; i < list.count; i++) {
      if (list.op[i] === DrawOp.Text)
        texts.push([list.strings[list.ref[i]], list.x[i], list.color[i]]);
    }
    expect(texts).toEqual([
      ['→', 0, UI_COLORS.focus],
      ['ONE', 10, UI_COLORS.focus],
      ['SECOND', 90, UI_COLORS.focus],
      ['TWO', 10, UI_COLORS.text],
      ['LEFT', 90, UI_COLORS.text],
      ['BACK', 10, UI_COLORS.text],
    ]);
    expect(list.strings[6]).toBe('SECOND');
    expect(list.strings[7]).toBe('LEFT');
  });
});
