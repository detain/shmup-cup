/**
 * Edge cases of the canvas UI kit (plan M1-16): the held-duration repeat over long holds and with
 * non-direction presses, re-presses and chords; list-menu construction (focus normalisation, every
 * item disabled, item kinds, frozen items), `setDisabled`, wrap across disabled ends, the Confirm
 * buffer racing Back and a disabled item, Confirm winning over a direction on the same tick,
 * `open()` dropping a held repeat; sliders with odd ranges and steps, toggles; the YES / NO prompt's
 * lock, buffer and revision rules; and the builders' defaults, geometry, slot reuse and overflow.
 */
import { describe, expect, it } from 'vitest';
import { Action, type ActionMask, type PlayerInput } from '../../src/input/index.js';
import { DrawOp, TextAlign, createDrawList, type DrawList } from '../../src/presentation/index.js';
import {
  ConfirmChoice,
  DirectionRepeat,
  MENU_CONFIRM_BUFFER_TICKS,
  MENU_REPEAT_DELAY,
  MENU_REPEAT_INTERVAL,
  MenuItemKind,
  MenuResult,
  Slider,
  UI_COLORS,
  confirmTick,
  createConfirm,
  createListMenu,
  createSlider,
  createToggle,
  drawConfirm,
  drawMenu,
  drawPanel,
  menuResultSfx,
  menuTick,
  repeatDirections,
} from '../../src/ui/index.js';

/** A player input driven like the input adapters do (edges from the previous held mask). */
class Driver {
  readonly input: PlayerInput = { held: 0, pressed: 0, released: 0, device: 'remote' };

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

/** One draw command as a readable tuple. */
type Command = [op: number, ref: number, x: number, y: number, w: number, color: number];

/**
 * The commands of a list.
 *
 * @param list - The list.
 * @returns Its commands.
 */
function commands(list: DrawList): Command[] {
  const out: Command[] = [];
  for (let i = 0; i < list.count; i++) {
    out.push([list.op[i], list.ref[i], list.x[i], list.y[i], list.w[i], list.color[i]]);
  }
  return out;
}

describe('core/ui edge: held-duration repeat', () => {
  it('keeps firing every 6 ticks over a long hold (exact tick list)', () => {
    const state = new DirectionRepeat();
    const driver = new Driver();
    const fired: number[] = [];
    for (let t = 0; t < 1000; t++) {
      if (repeatDirections(state, driver.set(Action.Right)) !== 0) fired.push(t);
    }
    const expected = [0];
    for (let t = MENU_REPEAT_DELAY; t < 1000; t += MENU_REPEAT_INTERVAL) expected.push(t);
    expect(fired).toEqual(expected);
    expect(state.held).toBe(999);
  });

  it('ignores presses of non-direction actions while a direction repeats', () => {
    const state = new DirectionRepeat();
    const driver = new Driver();
    const fired: number[] = [];
    for (let t = 0; t < 25; t++) {
      // Confirm / Shot pressed every other tick must not restart the direction's delay.
      const extra = t % 2 === 0 ? Action.Confirm : Action.Shot;
      if (repeatDirections(state, driver.set(Action.Up | extra)) !== 0) fired.push(t);
    }
    expect(fired).toEqual([0, 18, 24]);
  });

  it('restarts the delay for a re-press latched while the direction still reads held', () => {
    const state = new DirectionRepeat();
    const driver = new Driver();
    expect(repeatDirections(state, driver.set(Action.Down))).toBe(Action.Down);
    for (let t = 1; t < 10; t++) repeatDirections(state, driver.set(Action.Down));
    // Released and pressed again between two polls: a new press (acts now, delay restarts).
    expect(repeatDirections(state, driver.set(Action.Down, Action.Down))).toBe(Action.Down);
    expect(state.held).toBe(0);
    let fired = -1;
    for (let t = 1; t <= MENU_REPEAT_DELAY; t++) {
      if (repeatDirections(state, driver.set(Action.Down)) !== 0 && fired < 0) fired = t;
    }
    expect(fired).toBe(MENU_REPEAT_DELAY);
  });

  it('keeps repeating when another held direction is released', () => {
    const state = new DirectionRepeat();
    const driver = new Driver();
    repeatDirections(state, driver.set(Action.Left));
    // Up pressed later: Up now repeats; releasing Left changes nothing for Up.
    expect(repeatDirections(state, driver.set(Action.Left | Action.Up))).toBe(Action.Up);
    const fired: number[] = [];
    for (let t = 1; t <= 24; t++) {
      if (repeatDirections(state, driver.set(Action.Up)) === Action.Up) fired.push(t);
    }
    expect(fired).toEqual([18, 24]);
  });

  it('picks Up over Down and Left over Right in a chord', () => {
    const state = new DirectionRepeat();
    const driver = new Driver();
    expect(repeatDirections(state, driver.set(Action.Up | Action.Down))).toBe(Action.Up);
    state.reset();
    driver.set(0);
    expect(repeatDirections(state, driver.set(Action.Left | Action.Right))).toBe(Action.Left);
    state.reset();
    driver.set(0);
    expect(repeatDirections(state, driver.set(Action.Right | Action.Down))).toBe(Action.Down);
  });

  it('does nothing without a direction ever pressed, even with directions held', () => {
    const state = new DirectionRepeat();
    const input: PlayerInput = { held: Action.Down, pressed: 0, released: 0, device: 'remote' };
    for (let t = 0; t < 40; t++) expect(repeatDirections(state, input)).toBe(0);
    expect([state.dir, state.held]).toEqual([0, 0]);
  });
});

describe('core/ui edge: list menu construction', () => {
  it('accepts exactly 31 items and item specs of every shape', () => {
    const labels = new Array<string>(31).fill('X');
    expect(createListMenu(labels).items).toHaveLength(31);
    const slider = createSlider(0, 1, 1, 0);
    const toggle = createToggle(true);
    const menu = createListMenu([
      { label: 'BOTH', slider, toggle }, // a slider wins over a toggle
      { label: 'PLAIN' },
      { label: 'TOGGLE', toggle },
      'TEXT',
    ]);
    expect(menu.items.map((i) => [i.label, i.kind, i.slider, i.toggle])).toEqual([
      ['BOTH', MenuItemKind.Slider, slider, null],
      ['PLAIN', MenuItemKind.Action, null, null],
      ['TOGGLE', MenuItemKind.Toggle, null, toggle],
      ['TEXT', MenuItemKind.Action, null, null],
    ]);
    expect(Object.isFrozen(menu.items)).toBe(true);
    expect(Object.isFrozen(menu.items[0])).toBe(true);
    expect(menu.wrap).toBe(true);
  });

  it('normalises the initial focus onto an enabled item (out of range, negative, disabled)', () => {
    expect(createListMenu(['A', 'B', 'C'], { focus: 2 }).focus).toBe(2);
    expect(createListMenu(['A', 'B', 'C'], { focus: 5 }).focus).toBe(2); // 5 mod 3
    expect(createListMenu(['A', 'B', 'C'], { focus: -1 }).focus).toBe(2);
    // Focus on a disabled item moves to the next enabled one, wrapping.
    expect(createListMenu(['A', 'B', 'C'], { focus: 2, disabledMask: 0b100 }).focus).toBe(0);
    expect(createListMenu(['A', 'B', 'C'], { focus: 1, disabledMask: 0b010 }).focus).toBe(2);
  });

  it('keeps the focus where it is when every item is disabled: no moves, Confirm denied', () => {
    const menu = createListMenu(['A', 'B', 'C'], { disabledMask: 0b111 });
    const driver = new Driver();
    expect(menu.focus).toBe(0);
    expect(menuTick(menu, driver.set(0, Action.Down))).toBe(MenuResult.None);
    expect(menuTick(menu, driver.set(0, Action.Up))).toBe(MenuResult.None);
    expect(menuTick(menu, driver.set(0, Action.Confirm))).toBe(MenuResult.Denied);
    expect(menu.focus).toBe(0);
  });

  it('reports existing enabled items only', () => {
    const menu = createListMenu(['A', 'B'], { disabledMask: 0b10 });
    expect([menu.enabled(-1), menu.enabled(0), menu.enabled(1), menu.enabled(2)]).toEqual([
      false,
      true,
      false,
      false,
    ]);
  });
});

describe('core/ui edge: setDisabled and focus moves', () => {
  it('changes the revision only on a real change and hands the focus on, wrapping', () => {
    const menu = createListMenu(['A', 'B', 'C'], { focus: 2 });
    const r = menu.revision;
    menu.setDisabled(1, false); // already enabled
    expect(menu.revision).toBe(r);
    menu.setDisabled(1, true); // not the focused item: the focus stays
    expect([menu.focus, menu.revision]).toEqual([2, r + 1]);
    menu.setDisabled(2, true); // the focused last item: on to the first enabled, wrapping
    expect(menu.focus).toBe(0);
    expect(menu.revision).toBe(r + 3); // the mask and the focus
    menu.setDisabled(2, true);
    expect(menu.revision).toBe(r + 3);
  });

  it('wraps across disabled items at both ends', () => {
    const menu = createListMenu(['A', 'B', 'C', 'D'], { focus: 1, disabledMask: 0b1001 });
    const driver = new Driver();
    expect(menuTick(menu, driver.set(0, Action.Up))).toBe(MenuResult.Moved);
    expect(menu.focus).toBe(2); // past A (disabled), round to D (disabled), on to C
    expect(menuTick(menu, driver.set(0, Action.Down))).toBe(MenuResult.Moved);
    expect(menu.focus).toBe(1);
  });

  it('stops before a disabled last item without wrap', () => {
    const menu = createListMenu(['A', 'B', 'C'], { focus: 1, wrap: false, disabledMask: 0b100 });
    const driver = new Driver();
    const r = menu.revision;
    expect(menuTick(menu, driver.set(0, Action.Down))).toBe(MenuResult.None);
    expect([menu.focus, menu.revision]).toEqual([1, r]);
    expect(menuTick(menu, driver.set(0, Action.Up))).toBe(MenuResult.Moved);
    expect(menuTick(menu, driver.set(0, Action.Up))).toBe(MenuResult.None);
    expect(menu.focus).toBe(0);
  });

  it('a one-item menu never moves', () => {
    const menu = createListMenu(['ONLY']);
    const driver = new Driver();
    expect(menuTick(menu, driver.set(0, Action.Down))).toBe(MenuResult.None);
    expect(menuTick(menu, driver.set(0, Action.Up))).toBe(MenuResult.None);
    expect(menu.focus).toBe(0);
  });

  it('open() forgets a held repeat: the held direction needs a new press', () => {
    const labels: string[] = [];
    for (let i = 0; i < 8; i++) labels.push(`ITEM ${i}`);
    const menu = createListMenu(labels);
    const driver = new Driver();
    menuTick(menu, driver.set(Action.Down));
    expect(menu.focus).toBe(1);
    menu.open();
    for (let t = 0; t < 40; t++) expect(menuTick(menu, driver.set(Action.Down))).toBe(0);
    expect(menu.focus).toBe(1);
    menuTick(menu, driver.set(0));
    expect(menuTick(menu, driver.set(Action.Down))).toBe(MenuResult.Moved);
  });
});

describe('core/ui edge: Confirm buffer, lock and Back', () => {
  it('Back while locked drops a buffered Confirm', () => {
    const menu = createListMenu(['A']);
    const driver = new Driver();
    menu.open(3);
    expect(menuTick(menu, driver.set(0, Action.Confirm))).toBe(MenuResult.None);
    expect(menu.confirmBuffer).toBe(MENU_CONFIRM_BUFFER_TICKS - 1);
    expect(menuTick(menu, driver.set(0, Action.Back))).toBe(MenuResult.Back);
    expect(menu.confirmBuffer).toBe(0);
    for (let t = 0; t < 6; t++) expect(menuTick(menu, driver.set(0))).toBe(MenuResult.None);
  });

  it('Confirm and Back on the same tick answer Back and leave nothing buffered', () => {
    const menu = createListMenu(['A', 'B']);
    const driver = new Driver();
    expect(menuTick(menu, driver.set(0, Action.Confirm | Action.Back))).toBe(MenuResult.Back);
    expect(menuTick(menu, driver.set(0))).toBe(MenuResult.None);
  });

  it('Confirm wins over a direction pressed on the same tick (the old focus activates)', () => {
    const menu = createListMenu(['A', 'B']);
    const driver = new Driver();
    expect(menuTick(menu, driver.set(0, Action.Confirm | Action.Down))).toBe(MenuResult.Confirmed);
    expect(menu.focus).toBe(0);
  });

  it('activates a press made on the last locked tick on the next one', () => {
    const menu = createListMenu(['A']);
    const driver = new Driver();
    menu.open(2);
    expect(menuTick(menu, driver.set(0))).toBe(MenuResult.None); // lock 2 → 1
    expect(menuTick(menu, driver.set(0, Action.Confirm))).toBe(MenuResult.None); // lock 1 → 0
    expect(menu.lockTicks).toBe(0);
    expect(menuTick(menu, driver.set(0))).toBe(MenuResult.Confirmed);
  });

  it('activates a press made while locked exactly when the lock ends, for locks of 1–3 ticks', () => {
    for (let lock = 1; lock <= 4; lock++) {
      const menu = createListMenu(['A']);
      const driver = new Driver();
      menu.open(lock);
      const results: number[] = [menuTick(menu, driver.set(0, Action.Confirm))];
      for (let t = 0; t < 6; t++) results.push(menuTick(menu, driver.set(0)));
      const at = results.indexOf(MenuResult.Confirmed);
      // A lock of N ticks activates on tick N (the press is then N ticks old); 4 is too late.
      expect(at).toBe(lock <= MENU_CONFIRM_BUFFER_TICKS - 1 ? lock : -1);
    }
  });

  it('a buffered press on a disabled item is denied once the lock ends', () => {
    const menu = createListMenu(['A', 'B'], { disabledMask: 0b10 });
    const driver = new Driver();
    menu.focus = 1; // forced onto the disabled item
    menu.open(1);
    const r = menu.revision;
    expect(menuTick(menu, driver.set(0, Action.Confirm))).toBe(MenuResult.None);
    expect(menuTick(menu, driver.set(0))).toBe(MenuResult.Denied);
    expect(menu.revision).toBe(r);
  });

  it('a held Confirm activates once', () => {
    const menu = createListMenu(['A']);
    const driver = new Driver();
    const results: number[] = [];
    for (let t = 0; t < 30; t++) results.push(menuTick(menu, driver.set(Action.Confirm)));
    expect(results.filter((r) => r === MenuResult.Confirmed)).toHaveLength(1);
    expect(results[0]).toBe(MenuResult.Confirmed);
  });
});

describe('core/ui edge: sliders and toggles', () => {
  it('clamps a step that overshoots either end', () => {
    const slider = createSlider(0, 10, 3, 9);
    const menu = createListMenu([{ label: 'S', slider }]);
    const driver = new Driver();
    expect(menuTick(menu, driver.set(0, Action.Right))).toBe(MenuResult.Changed);
    expect(slider.value).toBe(10);
    expect(menuTick(menu, driver.set(0, Action.Right))).toBe(MenuResult.None);
    slider.value = 1;
    expect(menuTick(menu, driver.set(0, Action.Left))).toBe(MenuResult.Changed);
    expect(slider.value).toBe(0);
    expect(menuTick(menu, driver.set(0, Action.Left))).toBe(MenuResult.None);
  });

  it('handles fractional steps and a one-value range', () => {
    const half = createSlider(0, 1, 0.5, 0);
    const fixed = createSlider(5, 5, 1, 5);
    const menu = createListMenu([
      { label: 'HALF', slider: half },
      { label: 'FIXED', slider: fixed },
    ]);
    const driver = new Driver();
    menuTick(menu, driver.set(0, Action.Right));
    menuTick(menu, driver.set(0, Action.Right));
    expect(menuTick(menu, driver.set(0, Action.Right))).toBe(MenuResult.None);
    expect(half.value).toBe(1);
    menuTick(menu, driver.set(0, Action.Down));
    const r = menu.revision;
    expect(menuTick(menu, driver.set(0, Action.Left))).toBe(MenuResult.None);
    expect(menuTick(menu, driver.set(0, Action.Right))).toBe(MenuResult.None);
    expect([fixed.value, menu.revision]).toEqual([5, r]);
  });

  it('clamps a starting value below the range and rejects non-numeric ranges', () => {
    expect(createSlider(2, 8, 1, -5).value).toBe(2);
    expect(new Slider(0, 4, 1, 7).value).toBe(4);
    expect(() => createSlider(Number.NaN, 1, 1, 0)).toThrow(RangeError);
    expect(() => createSlider(0, 1, Number.NaN, 0)).toThrow(RangeError);
    expect(() => createSlider(0, 1, -1, 0)).toThrow(/bad slider range/);
  });

  it('Right switches a toggle on, Left off; a repeated direction changes nothing', () => {
    const toggle = createToggle(false);
    const menu = createListMenu([{ label: 'T', toggle }]);
    const driver = new Driver();
    expect(menuTick(menu, driver.set(0, Action.Right))).toBe(MenuResult.Changed);
    expect(toggle.value).toBe(true);
    expect(menuTick(menu, driver.set(0, Action.Right))).toBe(MenuResult.None);
    expect(menuTick(menu, driver.set(0, Action.Left))).toBe(MenuResult.Changed);
    expect(toggle.value).toBe(false);
  });

  it('leaves a disabled slider or toggle alone (Left / Right do nothing, Confirm is denied)', () => {
    const slider = createSlider(0, 10, 1, 5);
    const toggle = createToggle(true);
    const menu = createListMenu(['A', { label: 'S', slider }, { label: 'T', toggle }], {
      disabledMask: 0b110,
    });
    const driver = new Driver();
    menu.focus = 1;
    expect(menuTick(menu, driver.set(0, Action.Right))).toBe(MenuResult.None);
    expect(menuTick(menu, driver.set(0, Action.Left))).toBe(MenuResult.None);
    expect(slider.value).toBe(5);
    menu.focus = 2;
    expect(menuTick(menu, driver.set(0, Action.Confirm))).toBe(MenuResult.Denied);
    expect(menuTick(menu, driver.set(0, Action.Left))).toBe(MenuResult.None);
    expect(toggle.value).toBe(true);
  });

  it('Left / Right on a plain action item is ignored', () => {
    const menu = createListMenu(['A', 'B']);
    const driver = new Driver();
    const r = menu.revision;
    expect(menuTick(menu, driver.set(0, Action.Left))).toBe(MenuResult.None);
    expect(menuTick(menu, driver.set(0, Action.Right))).toBe(MenuResult.None);
    expect(menu.revision).toBe(r);
  });
});

describe('core/ui edge: YES / NO prompt', () => {
  it('Up picks YES and Down NO; moving onto the focused choice is None', () => {
    const prompt = createConfirm('Q?');
    const driver = new Driver();
    expect(confirmTick(prompt, driver.set(0, Action.Right))).toBe(MenuResult.None);
    expect(confirmTick(prompt, driver.set(0, Action.Up))).toBe(MenuResult.Moved);
    expect(prompt.focus).toBe(ConfirmChoice.Yes);
    expect(confirmTick(prompt, driver.set(0, Action.Up))).toBe(MenuResult.None);
    expect(confirmTick(prompt, driver.set(0, Action.Down))).toBe(MenuResult.Moved);
    expect(prompt.focus).toBe(ConfirmChoice.No);
  });

  it('bumps its revision only when the focus moves', () => {
    const prompt = createConfirm('Q?');
    const driver = new Driver();
    const r = prompt.revision;
    confirmTick(prompt, driver.set(0));
    confirmTick(prompt, driver.set(0, Action.Right));
    confirmTick(prompt, driver.set(0, Action.Confirm));
    expect(prompt.revision).toBe(r);
    confirmTick(prompt, driver.set(0, Action.Left));
    expect(prompt.revision).toBe(r + 1);
    // Held Left repeats onto YES again: nothing changes.
    for (let t = 0; t < 30; t++) confirmTick(prompt, driver.set(Action.Left));
    expect(prompt.revision).toBe(r + 1);
  });

  it('open() bumps the revision only for a new question or a focus reset', () => {
    const prompt = createConfirm('Q?');
    const r = prompt.revision;
    prompt.open();
    prompt.open('Q?');
    expect(prompt.revision).toBe(r);
    prompt.open('OTHER?');
    expect([prompt.question, prompt.revision]).toEqual(['OTHER?', r + 1]);
    prompt.focus = ConfirmChoice.Yes;
    prompt.open(); // same question, but the focus goes back to NO
    expect([prompt.focus, prompt.revision]).toEqual([ConfirmChoice.No, r + 2]);
  });

  it('moves while locked, drops the buffer on Back and lets a late press expire', () => {
    const driver = new Driver();
    const a = createConfirm('Q?');
    a.open('Q?', 3);
    expect(confirmTick(a, driver.set(0, Action.Left))).toBe(MenuResult.Moved);
    expect(confirmTick(a, driver.set(0, Action.Confirm))).toBe(MenuResult.None);
    expect(confirmTick(a, driver.set(0, Action.Back))).toBe(MenuResult.Back);
    for (let t = 0; t < 6; t++) expect(confirmTick(a, driver.set(0))).toBe(MenuResult.None);
    const b = createConfirm('Q?');
    b.open('Q?', 4);
    expect(confirmTick(b, driver.set(0, Action.Confirm))).toBe(MenuResult.None);
    for (let t = 0; t < 6; t++) expect(confirmTick(b, driver.set(0))).toBe(MenuResult.None);
    expect(b.confirmBuffer).toBe(0);
  });

  it('answers the focused choice with Confirm (YES stays YES)', () => {
    const prompt = createConfirm('Q?');
    const driver = new Driver();
    confirmTick(prompt, driver.set(0, Action.Left));
    expect(confirmTick(prompt, driver.set(0, Action.Confirm))).toBe(MenuResult.Confirmed);
    expect(prompt.focus).toBe(ConfirmChoice.Yes);
  });
});

describe('core/ui edge: menu sounds', () => {
  it('has no sound for unknown results', () => {
    expect(menuResultSfx(-1)).toBe(-1);
    expect(menuResultSfx(99)).toBe(-1);
  });
});

describe('core/ui edge: builders', () => {
  it('drawPanel honours custom colours and opacity; the border is opaque', () => {
    const list = createDrawList();
    drawPanel(list, 0, 0, 20, 10, 0x112233, 0x445566, 100);
    expect([list.color[0], list.alpha[0]]).toEqual([0x112233, 100]);
    for (let i = 1; i < 5; i++) expect([list.color[i], list.alpha[i]]).toEqual([0x445566, 255]);
  });

  it('drawMenu defaults: cursor 10 px left, 12-px rows, left aligned, values 80 px right', () => {
    const menu = createListMenu(['A', { label: 'T', toggle: createToggle(true) }], { focus: 1 });
    const list = createDrawList(32, 8);
    expect(drawMenu(list, menu, 0, { x: 100, y: 40 })).toBe(64);
    expect(commands(list)).toEqual([
      [DrawOp.Text, 0, 100, 40, 0, UI_COLORS.text],
      [DrawOp.Text, 4, 90, 52, 0, UI_COLORS.focus], // cursor
      [DrawOp.Text, 1, 100, 52, 0, UI_COLORS.focus],
      [DrawOp.Text, 2, 180, 52, 0, UI_COLORS.focus], // ON
    ]);
    for (let i = 0; i < list.count; i++) expect(list.flags[i]).toBe(TextAlign.Left);
    expect(drawMenu(list, menu, 0, { x: 0, y: 0, lineHeight: 20 })).toBe(40);
  });

  it('drawMenu draws no cursor when the focus sits on a disabled item', () => {
    const menu = createListMenu(['A', 'B'], { disabledMask: 0b01 });
    menu.focus = 0;
    const list = createDrawList(32, 8);
    drawMenu(list, menu, 0, { x: 50, y: 0 });
    expect(commands(list)).toEqual([
      [DrawOp.Text, 0, 50, 0, 0, UI_COLORS.disabled],
      [DrawOp.Text, 1, 50, 12, 0, UI_COLORS.text],
    ]);
  });

  it('drawMenu fills a slider bar in proportion (none when empty or the range is one value)', () => {
    const empty = createSlider(0, 10, 1, 0);
    const full = createSlider(0, 10, 1, 10);
    const fixed = createSlider(3, 3, 1, 3);
    const menu = createListMenu([
      { label: 'E', slider: empty },
      { label: 'F', slider: full },
      { label: 'X', slider: fixed },
    ]);
    const list = createDrawList(32, 8);
    drawMenu(list, menu, 0, { x: 0, y: 0, valueX: 100 });
    const rects = commands(list).filter((c) => c[0] === DrawOp.Rect);
    expect(rects.map((c) => [c[2], c[3], c[4], c[5]])).toEqual([
      [100, 2, 50, UI_COLORS.track],
      [100, 14, 50, UI_COLORS.track],
      [100, 14, 50, UI_COLORS.text], // full
      [100, 26, 50, UI_COLORS.track],
    ]);
    const numbers: Array<[number, number, number]> = [];
    for (let i = 0; i < list.count; i++) {
      if (list.op[i] === DrawOp.Number) numbers.push([list.value[i], list.x[i], list.frame[i]]);
    }
    expect(numbers).toEqual([
      [0, 156, 0],
      [10, 156, 0],
      [3, 156, 0],
    ]);
    // The focused slider's bar and value take the focus colour.
    expect(list.color[0]).toBe(UI_COLORS.focus); // cursor
  });

  it('drawMenu writes its string slots once: a redraw changes only the commands', () => {
    const menu = createListMenu(['A', 'B', 'C']);
    const list = createDrawList(32, 8);
    drawMenu(list, menu, 1, { x: 0, y: 0 });
    const strings = list.strings.slice();
    const before = list.revision;
    list.clear();
    const n = drawMenu(list, menu, 1, { x: 0, y: 0 });
    expect(n).toBe(36);
    expect(list.strings).toEqual(strings);
    expect(list.revision).toBe(before + 1 + list.count);
    expect(list.strings[0]).toBe(''); // below stringBase: untouched
  });

  it('drawMenu overflows a small list without throwing and rejects slots out of range', () => {
    const menu = createListMenu(['A', 'B', 'C', 'D']);
    const small = createDrawList(2, 8);
    expect(() => drawMenu(small, menu, 0, { x: 0, y: 0 })).not.toThrow();
    expect([small.count, small.dropped]).toEqual([2, 3]);
    const tight = createDrawList(32, 6); // needs 4 + 3 slots
    expect(() => drawMenu(tight, menu, 0, { x: 0, y: 0 })).toThrow(RangeError);
  });

  it('drawConfirm lays the panel out around the centre, rounding odd centres', () => {
    const prompt = createConfirm('SURE?');
    const list = createDrawList(32, 8);
    drawConfirm(list, prompt, 0, 101, 51);
    // Panel 176×52 at (13, 25), opaque, bordered in the focus colour.
    expect([list.x[0], list.y[0], list.w[0], list.h[0], list.alpha[0]]).toEqual([
      13, 25, 176, 52, 255,
    ]);
    for (let i = 1; i < 5; i++) expect(list.color[i]).toBe(UI_COLORS.focus);
    const texts = commands(list).filter((c) => c[0] === DrawOp.Text);
    expect(texts.map((c) => [c[1], c[2], c[3]])).toEqual([
      [0, 101, 32], // the question, 7 px below the top
      [3, 133 - 18, 61], // the cursor left of NO (row = top + 52 − 16)
      [1, 69, 61],
      [2, 133, 61],
    ]);
  });

  it('drawConfirm highlights YES with the cursor left of it when YES is focused', () => {
    const prompt = createConfirm('SURE?');
    prompt.focus = ConfirmChoice.Yes;
    const list = createDrawList(32, 8);
    drawConfirm(list, prompt, 4, 192, 108);
    const texts = commands(list).filter((c) => c[0] === DrawOp.Text);
    expect(texts.map((c) => [c[1], c[2], c[5]])).toEqual([
      [4, 192, UI_COLORS.text],
      [7, 160 - 18, UI_COLORS.focus],
      [5, 160, UI_COLORS.focus],
      [6, 224, UI_COLORS.text],
    ]);
    // A second-line question stays in one slot (the renderer breaks at `\n`).
    prompt.open('LINE ONE\nLINE TWO');
    drawConfirm(list, prompt, 4, 192, 108);
    expect(list.strings[4]).toBe('LINE ONE\nLINE TWO');
  });
});
