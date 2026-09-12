/**
 * Edge cases of the UI kit's `Choice` widget (plan M1-17): the label-count limits, index
 * clamping, held-direction auto-repeat stepping the choice, Up / Down never changing it, Confirm on
 * a disabled choice, two labels toggling, the dimmed label of a disabled item and the string slot
 * written only when the label changes.
 */
import { describe, expect, it } from 'vitest';
import { Action, type PlayerInput } from '../../src/input/index.js';
import { DrawOp, createDrawList } from '../../src/presentation/index.js';
import {
  MENU_REPEAT_DELAY,
  MENU_REPEAT_INTERVAL,
  MenuItemKind,
  MenuResult,
  UI_COLORS,
  createChoice,
  createListMenu,
  createToggle,
  drawMenu,
  menuStringSlots,
  menuTick,
} from '../../src/ui/index.js';

/**
 * One tick of input.
 *
 * @param held - Held actions.
 * @param pressed - Actions pressed this tick.
 * @returns The input.
 */
function input(held: number, pressed = 0): PlayerInput {
  return { held, pressed, released: 0, device: 'remote' };
}

const IDLE = input(0);

describe('core/ui Choice (edge)', () => {
  it('takes 1 to 255 labels', () => {
    const many = Array.from({ length: 255 }, (_, i) => `L${i}`);
    expect(createChoice(many, 254).label).toBe('L254');
    expect(() => createChoice([...many, 'ONE MORE'])).toThrow(/1–255 labels, got 256/);
    expect(Object.isFrozen(createChoice(['A']).labels)).toBe(true);
  });

  it('floors a fractional start and clamps an infinite one', () => {
    expect(createChoice(['A', 'B', 'C'], 1.9).index).toBe(1);
    expect(createChoice(['A', 'B', 'C'], Number.POSITIVE_INFINITY).index).toBe(2);
    expect(createChoice(['A', 'B', 'C'], Number.NEGATIVE_INFINITY).index).toBe(0);
    expect(Object.is(createChoice(['A', 'B'], -0).index, 0)).toBe(true);
  });

  it('steps once per auto-repeat while a direction is held', () => {
    const labels = Array.from({ length: 50 }, (_, i) => `P${i}`);
    const choice = createChoice(labels);
    const menu = createListMenu([{ label: 'PICK', choice }]);
    const ticks = MENU_REPEAT_DELAY + 3 * MENU_REPEAT_INTERVAL;
    let changes = 0;
    for (let t = 0; t < ticks; t++) {
      const result = menuTick(menu, input(Action.Right, t === 0 ? Action.Right : 0));
      if (result === MenuResult.Changed) changes++;
    }
    // Once on the press, then at the delay and after every interval (delay, +6, +12 < ticks).
    expect(changes).toBe(1 + 3);
    expect(choice.index).toBe(4);
  });

  it('Up / Down move the focus and never change the choice', () => {
    const choice = createChoice(['A', 'B', 'C']);
    const menu = createListMenu([{ label: 'PICK', choice }, 'BACK'], { wrap: true });
    menuTick(menu, input(Action.Down, Action.Down));
    menuTick(menu, IDLE);
    menuTick(menu, input(Action.Up, Action.Up));
    expect([menu.focus, choice.index]).toEqual([0, 0]);
  });

  it('with two labels Confirm toggles between them', () => {
    const choice = createChoice(['SAFE', 'FAST']);
    const menu = createListMenu([{ label: 'CONTROLS', choice }]);
    const seen: number[] = [];
    for (let i = 0; i < 4; i++) {
      expect(menuTick(menu, input(Action.Confirm, Action.Confirm))).toBe(MenuResult.Changed);
      menuTick(menu, IDLE);
      seen.push(choice.index);
    }
    expect(seen).toEqual([1, 0, 1, 0]);
  });

  it('Confirm on a disabled choice is denied and changes nothing', () => {
    const choice = createChoice(['A', 'B']);
    const menu = createListMenu([{ label: 'PICK', choice }], { disabledMask: 1 });
    menu.focus = 0;
    const revision = menu.revision;
    expect(menuTick(menu, input(Action.Confirm, Action.Confirm))).toBe(MenuResult.Denied);
    expect([choice.index, menu.revision]).toEqual([0, revision]);
  });

  it('a toggle given with a choice wins; a label alone is an action', () => {
    const menu = createListMenu([
      { label: 'T', toggle: createToggle(true), choice: createChoice(['A']) },
      { label: 'PLAIN' },
    ]);
    expect([menu.items[0].kind, menu.items[0].choice]).toEqual([MenuItemKind.Toggle, null]);
    expect(menu.items[1]).toEqual({
      label: 'PLAIN',
      kind: MenuItemKind.Action,
      slider: null,
      toggle: null,
      choice: null,
    });
  });

  it('dims the label of a disabled choice item', () => {
    const menu = createListMenu(['TOP', { label: 'PICK', choice: createChoice(['VALUE']) }], {
      disabledMask: 0b10,
    });
    const list = createDrawList(32, menuStringSlots(menu));
    drawMenu(list, menu, 0, { x: 10, y: 0, valueX: 80 });
    const colors = new Map<string, number>();
    for (let i = 0; i < list.count; i++) {
      if (list.op[i] === DrawOp.Text) colors.set(list.strings[list.ref[i]], list.color[i]);
    }
    expect(colors.get('PICK')).toBe(UI_COLORS.disabled);
    expect(colors.get('VALUE')).toBe(UI_COLORS.disabled);
  });

  it('rewrites the label slot only when the chosen label changes', () => {
    const choice = createChoice(['ONE', 'TWO']);
    const menu = createListMenu([{ label: 'PICK', choice }]);
    const list = createDrawList(32, menuStringSlots(menu));
    drawMenu(list, menu, 0, { x: 10, y: 0 });
    const slot = menuStringSlots(menu) - 1;
    expect(list.strings[slot]).toBe('ONE');
    expect(list.setString(slot, 'ONE')).toBe(false);
    list.clear();
    const revision = list.revision;
    drawMenu(list, menu, 0, { x: 10, y: 0 });
    const redraw = list.revision - revision;
    choice.index = 1;
    list.clear();
    const before = list.revision;
    drawMenu(list, menu, 0, { x: 10, y: 0 });
    expect(list.revision - before).toBe(redraw + 1); // one string write more
    expect(list.strings[slot]).toBe('TWO');
  });

  it('counts no extra slot for a menu without choices', () => {
    expect(menuStringSlots(createListMenu(['A', 'B']))).toBe(2 + 3);
  });
});
