/**
 * Tests of the canvas UI kit (plan M1-16): list-menu navigation (focus, wrap, disabled items),
 * the held-duration auto-repeat timing (18-tick delay, 6-tick interval), the 4-tick Confirm buffer,
 * sliders and toggles, the YES / NO prompt (default NO), the menu sounds and the draw builders'
 * command output.
 */
import { describe, expect, it } from 'vitest';
import { SFX_CUES } from '../../src/events/index.js';
import { Action, type ActionMask, type PlayerInput } from '../../src/input/index.js';
import { DrawOp, TextAlign, createDrawList } from '../../src/presentation/index.js';
import {
  CONFIRM_STRING_SLOTS,
  ConfirmChoice,
  DirectionRepeat,
  MENU_CONFIRM_BUFFER_TICKS,
  MENU_REPEAT_DELAY,
  MENU_REPEAT_INTERVAL,
  MenuItemKind,
  MenuResult,
  UI_COLORS,
  UI_SPRITES,
  confirmTick,
  createConfirm,
  createListMenu,
  createSlider,
  createToggle,
  drawConfirm,
  drawMenu,
  drawPanel,
  menuResultSfx,
  menuStringSlots,
  menuTick,
  moduleInfo,
  repeatDirections,
  resolveUiSprites,
  type ListMenu,
} from '../../src/ui/index.js';
import { EMPTY_CONTENT_DB, loadContent } from '../../src/data/index.js';

/** A player input driven like the input adapters do (edges from the previous held mask). */
class Driver {
  readonly input: PlayerInput = { held: 0, pressed: 0, released: 0, device: 'keyboard' };

  /**
   * Sets this tick's held mask (and an optional latched tap).
   *
   * @param held - Actions held.
   * @param tap - Actions pressed and released since the last tick.
   * @returns The input.
   */
  set(held: ActionMask, tap: ActionMask = 0): PlayerInput {
    const previous = this.input.held;
    this.input.pressed = (held & ~previous) | tap;
    this.input.released = previous & ~held;
    this.input.held = held;
    return this.input;
  }
}

/**
 * Runs a menu with a held mask for a number of ticks.
 *
 * @param menu - The menu.
 * @param driver - The input driver.
 * @param held - Held mask.
 * @param ticks - Ticks.
 * @returns The result of every tick.
 */
function hold(menu: ListMenu, driver: Driver, held: ActionMask, ticks: number): number[] {
  const results: number[] = [];
  for (let t = 0; t < ticks; t++) results.push(menuTick(menu, driver.set(held)));
  return results;
}

describe('core/ui', () => {
  it('describes itself', () => {
    expect(moduleInfo.name).toBe('ui');
    expect(moduleInfo.status).toBe('partial');
    expect(moduleInfo.specRefs).toContain('shmup_feat.md §17');
  });

  it('names the HUD pieces and the logo, and finds their ids in a content table', () => {
    expect(UI_SPRITES).toEqual(['hud/life', 'hud/meter-slot', 'hud/meter-labels', 'ui/logo']);
    expect(resolveUiSprites(EMPTY_CONTENT_DB)).toEqual({
      life: -1,
      meterSlot: -1,
      meterLabels: -1,
      logo: -1,
    });
    const { db } = loadContent([], { extraSprites: UI_SPRITES });
    const sprites = resolveUiSprites(db);
    expect(db.sprites.names[sprites.life]).toBe('hud/life');
    expect(db.sprites.names[sprites.meterSlot]).toBe('hud/meter-slot');
    expect(db.sprites.names[sprites.meterLabels]).toBe('hud/meter-labels');
    expect(db.sprites.names[sprites.logo]).toBe('ui/logo');
  });
});

describe('core/ui held-duration auto-repeat', () => {
  it('acts on the press, after 18 ticks held, then every 6 ticks', () => {
    const state = new DirectionRepeat();
    const driver = new Driver();
    const fired: number[] = [];
    for (let t = 0; t < 45; t++) {
      if (repeatDirections(state, driver.set(Action.Down)) === Action.Down) fired.push(t);
    }
    expect(MENU_REPEAT_DELAY).toBe(18);
    expect(MENU_REPEAT_INTERVAL).toBe(6);
    expect(fired).toEqual([0, 18, 24, 30, 36, 42]);
  });

  it('stops when released, restarts the delay on a new press and follows the last press', () => {
    const state = new DirectionRepeat();
    const driver = new Driver();
    expect(repeatDirections(state, driver.set(Action.Up))).toBe(Action.Up);
    for (let t = 1; t < 10; t++) expect(repeatDirections(state, driver.set(Action.Up))).toBe(0);
    // Down pressed while Up is still held: Down takes over (and its own delay starts).
    expect(repeatDirections(state, driver.set(Action.Up | Action.Down))).toBe(Action.Down);
    let fired = 0;
    for (let t = 1; t <= MENU_REPEAT_DELAY; t++) {
      fired = repeatDirections(state, driver.set(Action.Up | Action.Down));
    }
    expect(fired).toBe(Action.Down);
    // Releasing Down stops the repeat even though Up is still held.
    expect(repeatDirections(state, driver.set(Action.Up))).toBe(0);
    for (let t = 0; t < 40; t++) expect(repeatDirections(state, driver.set(Action.Up))).toBe(0);
  });

  it('acts once for a tap latched between two polls and picks the lowest bit of a chord', () => {
    const state = new DirectionRepeat();
    const driver = new Driver();
    expect(repeatDirections(state, driver.set(0, Action.Right))).toBe(Action.Right);
    expect(repeatDirections(state, driver.set(0))).toBe(0);
    expect(repeatDirections(state, driver.set(Action.Left | Action.Down))).toBe(Action.Down);
    state.reset();
    expect([state.dir, state.held]).toEqual([0, 0]);
  });
});

describe('core/ui list menu', () => {
  it('moves the focus up and down and wraps at both ends', () => {
    const menu = createListMenu(['A', 'B', 'C']);
    const driver = new Driver();
    expect(menu.focus).toBe(0);
    expect(menuTick(menu, driver.set(0, Action.Down))).toBe(MenuResult.Moved);
    expect(menu.focus).toBe(1);
    menuTick(menu, driver.set(0, Action.Down));
    menuTick(menu, driver.set(0, Action.Down));
    expect(menu.focus).toBe(0); // wrapped
    expect(menuTick(menu, driver.set(0, Action.Up))).toBe(MenuResult.Moved);
    expect(menu.focus).toBe(2); // wrapped backwards
  });

  it('stops at the ends without wrap', () => {
    const menu = createListMenu(['A', 'B'], { wrap: false });
    const driver = new Driver();
    expect(menuTick(menu, driver.set(0, Action.Up))).toBe(MenuResult.None);
    expect(menuTick(menu, driver.set(0, Action.Down))).toBe(MenuResult.Moved);
    expect(menuTick(menu, driver.set(0, Action.Down))).toBe(MenuResult.None);
    expect(menu.focus).toBe(1);
  });

  it('skips disabled items, starts on an enabled one and denies Confirm on a disabled focus', () => {
    const menu = createListMenu(['A', 'B', 'C', 'D'], { disabledMask: 0b0011 });
    const driver = new Driver();
    expect(menu.focus).toBe(2);
    menuTick(menu, driver.set(0, Action.Down));
    expect(menu.focus).toBe(3);
    menuTick(menu, driver.set(0, Action.Down));
    expect(menu.focus).toBe(2); // wrapped past the disabled A and B
    menu.setDisabled(2, true);
    expect(menu.focus).toBe(3); // the focus left the item that was disabled
    menu.focus = 0; // a scene forced it onto a disabled item
    expect(menuTick(menu, driver.set(0, Action.Confirm))).toBe(MenuResult.Denied);
    menu.setDisabled(0, false);
    expect(menu.enabled(0)).toBe(true);
    expect(menuTick(menu, driver.set(0, Action.Confirm))).toBe(MenuResult.Confirmed);
  });

  it('keeps the focus when every other item is disabled', () => {
    const menu = createListMenu(['A', 'B', 'C'], { disabledMask: 0b110 });
    const driver = new Driver();
    expect(menuTick(menu, driver.set(0, Action.Down))).toBe(MenuResult.None);
    expect(menuTick(menu, driver.set(0, Action.Up))).toBe(MenuResult.None);
    expect(menu.focus).toBe(0);
  });

  it('auto-repeats a held direction on the menu at 18 / 6 ticks', () => {
    const labels: string[] = [];
    for (let i = 0; i < 10; i++) labels.push(`ITEM ${i}`);
    const menu = createListMenu(labels);
    const driver = new Driver();
    const results = hold(menu, driver, Action.Down, 31);
    const moves = results.flatMap((r, t) => (r === MenuResult.Moved ? [t] : []));
    expect(moves).toEqual([0, 18, 24, 30]);
    expect(menu.focus).toBe(4);
  });

  it('answers Confirm on the focused item and Back, Back first', () => {
    const menu = createListMenu(['A', 'B']);
    const driver = new Driver();
    menuTick(menu, driver.set(0, Action.Down));
    expect(menuTick(menu, driver.set(Action.Confirm))).toBe(MenuResult.Confirmed);
    expect(menu.focus).toBe(1);
    expect(menuTick(menu, driver.set(Action.Confirm))).toBe(MenuResult.None); // held, no edge
    expect(menuTick(menu, driver.set(Action.Back | Action.Confirm))).toBe(MenuResult.Back);
  });

  it('buffers a Confirm pressed while locked for up to 4 ticks', () => {
    expect(MENU_CONFIRM_BUFFER_TICKS).toBe(4);
    const driver = new Driver();
    // Pressed on the first of 3 locked ticks: still pending when the lock ends.
    const a = createListMenu(['A']);
    a.open(3);
    expect(menuTick(a, driver.set(0, Action.Confirm))).toBe(MenuResult.None);
    expect(menuTick(a, driver.set(0))).toBe(MenuResult.None);
    expect(menuTick(a, driver.set(0))).toBe(MenuResult.None);
    expect(menuTick(a, driver.set(0))).toBe(MenuResult.Confirmed);
    // Pressed on the first of 4 locked ticks: the buffer ran out.
    const b = createListMenu(['A']);
    b.open(4);
    expect(menuTick(b, driver.set(0, Action.Confirm))).toBe(MenuResult.None);
    for (let t = 0; t < 3; t++) expect(menuTick(b, driver.set(0))).toBe(MenuResult.None);
    expect(menuTick(b, driver.set(0))).toBe(MenuResult.None);
    expect(b.confirmBuffer).toBe(0);
  });

  it('moves the focus and answers Back while locked; only activation waits', () => {
    const menu = createListMenu(['A', 'B']);
    const driver = new Driver();
    menu.open(2);
    expect(menuTick(menu, driver.set(0, Action.Down))).toBe(MenuResult.Moved);
    expect(menu.focus).toBe(1);
    expect(menuTick(menu, driver.set(0, Action.Back))).toBe(MenuResult.Back);
    expect(menuTick(menu, driver.set(0, Action.Confirm))).toBe(MenuResult.None);
    expect(menuTick(menu, driver.set(0))).toBe(MenuResult.Confirmed);
  });

  it('changes a focused slider with Left / Right (clamped, auto-repeated) and flips toggles', () => {
    const volume = createSlider(0, 10, 1, 8);
    const shake = createToggle(true);
    const menu = createListMenu([
      { label: 'MUSIC', slider: volume },
      { label: 'SHAKE', toggle: shake },
      'BACK',
    ]);
    expect(menu.items.map((i) => i.kind)).toEqual([
      MenuItemKind.Slider,
      MenuItemKind.Toggle,
      MenuItemKind.Action,
    ]);
    const driver = new Driver();
    expect(menuTick(menu, driver.set(0, Action.Right))).toBe(MenuResult.Changed);
    expect(menuTick(menu, driver.set(0, Action.Right))).toBe(MenuResult.Changed);
    expect(menuTick(menu, driver.set(0, Action.Right))).toBe(MenuResult.None); // at max
    expect(volume.value).toBe(10);
    const results = hold(menu, driver, Action.Left, 25);
    expect(results.filter((r) => r === MenuResult.Changed)).toHaveLength(3); // ticks 0, 18, 24
    expect(volume.value).toBe(7);
    menuTick(menu, driver.set(0, Action.Down));
    expect(menuTick(menu, driver.set(0, Action.Left))).toBe(MenuResult.Changed);
    expect(shake.value).toBe(false);
    expect(menuTick(menu, driver.set(0, Action.Left))).toBe(MenuResult.None);
    expect(menuTick(menu, driver.set(0, Action.Confirm))).toBe(MenuResult.Changed);
    expect(shake.value).toBe(true);
    menuTick(menu, driver.set(0, Action.Down));
    expect(menuTick(menu, driver.set(0, Action.Right))).toBe(MenuResult.None); // an action
  });

  it('bumps its revision on visible changes only', () => {
    const menu = createListMenu(['A', 'B']);
    const driver = new Driver();
    const r0 = menu.revision;
    menuTick(menu, driver.set(0));
    expect(menu.revision).toBe(r0);
    menuTick(menu, driver.set(0, Action.Down));
    expect(menu.revision).toBe(r0 + 1);
  });

  it('rejects an empty or oversized menu and bad sliders', () => {
    expect(() => createListMenu([])).toThrow(RangeError);
    expect(() => createListMenu(new Array<string>(32).fill('X'))).toThrow(RangeError);
    expect(() => createSlider(5, 1, 1, 3)).toThrow(RangeError);
    expect(() => createSlider(0, 1, 0, 0)).toThrow(RangeError);
    expect(createSlider(0, 10, 1, 99).value).toBe(10);
  });
});

describe('core/ui YES / NO prompt', () => {
  it('starts on NO, moves with Left / Right, answers with Confirm and Back', () => {
    const prompt = createConfirm('EXIT?');
    const driver = new Driver();
    expect(prompt.focus).toBe(ConfirmChoice.No);
    expect(confirmTick(prompt, driver.set(0, Action.Confirm))).toBe(MenuResult.Confirmed);
    expect(prompt.focus).toBe(ConfirmChoice.No);
    expect(confirmTick(prompt, driver.set(0, Action.Left))).toBe(MenuResult.Moved);
    expect(prompt.focus).toBe(ConfirmChoice.Yes);
    expect(confirmTick(prompt, driver.set(0, Action.Left))).toBe(MenuResult.None); // no wrap
    expect(confirmTick(prompt, driver.set(0, Action.Down))).toBe(MenuResult.Moved);
    expect(prompt.focus).toBe(ConfirmChoice.No);
    expect(confirmTick(prompt, driver.set(0, Action.Back))).toBe(MenuResult.Back);
    prompt.focus = ConfirmChoice.Yes;
    prompt.open('QUIT?', 1);
    expect([prompt.question, prompt.focus]).toEqual(['QUIT?', ConfirmChoice.No]);
    expect(confirmTick(prompt, driver.set(0, Action.Confirm))).toBe(MenuResult.None);
    expect(confirmTick(prompt, driver.set(0))).toBe(MenuResult.Confirmed); // buffered
  });
});

describe('core/ui menu sounds', () => {
  it('maps results to the menu cues', () => {
    expect(menuResultSfx(MenuResult.None)).toBe(-1);
    expect(menuResultSfx(MenuResult.Moved)).toBe(SFX_CUES.MenuMove);
    expect(menuResultSfx(MenuResult.Changed)).toBe(SFX_CUES.MenuMove);
    expect(menuResultSfx(MenuResult.Confirmed)).toBe(SFX_CUES.MenuSelect);
    expect(menuResultSfx(MenuResult.Back)).toBe(SFX_CUES.MenuBack);
    expect(menuResultSfx(MenuResult.Denied)).toBe(SFX_CUES.MenuBack);
  });
});

describe('core/ui builders', () => {
  it('drawPanel: a translucent fill and four border lines', () => {
    const list = createDrawList();
    drawPanel(list, 10, 20, 100, 40);
    expect(list.count).toBe(5);
    expect([list.x[0], list.y[0], list.w[0], list.h[0], list.color[0], list.alpha[0]]).toEqual([
      10,
      20,
      100,
      40,
      UI_COLORS.panel,
      232,
    ]);
    expect([list.y[1], list.h[1]]).toEqual([20, 1]);
    expect([list.y[2], list.h[2]]).toEqual([59, 1]);
    expect([list.x[3], list.w[3], list.h[3]]).toEqual([10, 1, 38]);
    expect([list.x[4], list.w[4]]).toEqual([109, 1]);
  });

  it('drawMenu: labels in their slots, the cursor at the focus, disabled items dimmed', () => {
    const menu = createListMenu(['START', 'OPTIONS', 'EXIT'], { disabledMask: 0b010 });
    const list = createDrawList(64, 16);
    expect(menuStringSlots(menu)).toBe(6);
    const bottom = drawMenu(list, menu, 2, {
      x: 192,
      y: 100,
      align: TextAlign.Center,
      cursorX: 150,
    });
    expect(bottom).toBe(136);
    expect(list.strings.slice(2, 8)).toEqual(['START', 'OPTIONS', 'EXIT', 'ON', 'OFF', '→']);
    const texts: Array<[number, number, number, number]> = [];
    for (let i = 0; i < list.count; i++) {
      expect(list.op[i]).toBe(DrawOp.Text);
      texts.push([list.ref[i], list.x[i], list.y[i], list.color[i]]);
    }
    expect(texts).toEqual([
      [7, 150, 100, UI_COLORS.focus], // cursor
      [2, 192, 100, UI_COLORS.focus],
      [3, 192, 112, UI_COLORS.disabled],
      [4, 192, 124, UI_COLORS.text],
    ]);
    const revision = list.revision;
    list.clear();
    drawMenu(list, menu, 2, { x: 192, y: 100 });
    // The strings were already in place: only the commands changed the revision.
    expect(list.revision).toBe(revision + 1 + list.count);
  });

  it('drawMenu: a slider bar with its value and a toggle state', () => {
    const menu = createListMenu([
      { label: 'SFX', slider: createSlider(0, 10, 1, 5) },
      { label: 'SHAKE', toggle: createToggle(false) },
    ]);
    const list = createDrawList();
    drawMenu(list, menu, 0, { x: 100, y: 50, valueX: 200 });
    const ops = Array.from(list.op.subarray(0, list.count));
    expect(ops).toEqual([
      DrawOp.Text, // cursor
      DrawOp.Text, // SFX
      DrawOp.Rect, // track
      DrawOp.Rect, // filled half
      DrawOp.Number, // 5
      DrawOp.Text, // SHAKE
      DrawOp.Text, // OFF
    ]);
    expect([list.x[2], list.w[2], list.w[3]]).toEqual([200, 50, 25]);
    expect(list.value[4]).toBe(5);
    expect(list.ref[6]).toBe(menu.items.length + 1); // the OFF slot
  });

  it('drawConfirm: a panel, the question and YES / NO with the cursor on the focus', () => {
    const prompt = createConfirm('EXIT SHMUP CUP?');
    const list = createDrawList();
    drawConfirm(list, prompt, 10, 192, 108);
    expect(CONFIRM_STRING_SLOTS).toBe(4);
    expect(list.strings.slice(10, 14)).toEqual(['EXIT SHMUP CUP?', 'YES', 'NO', '→']);
    const texts: Array<[number, number, number]> = [];
    for (let i = 0; i < list.count; i++) {
      if (list.op[i] === DrawOp.Text) texts.push([list.ref[i], list.x[i], list.color[i]]);
    }
    expect(texts).toEqual([
      [10, 192, UI_COLORS.text],
      [13, 224 - 18, UI_COLORS.focus], // cursor left of NO
      [11, 160, UI_COLORS.text],
      [12, 224, UI_COLORS.focus],
    ]);
  });
});
