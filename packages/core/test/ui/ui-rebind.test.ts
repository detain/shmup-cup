/**
 * Unit tests of the UI kit's rebind widget (plan M2-16 — "core `ui` + rebind widget"; acceptance
 * "capture / conflict / reset tests"): `RebindPanel` built from its labels (a MODE row shared by
 * both binding contexts, a row per rebindable action, RESET and DONE), the focused action and the
 * RESET row per context, the keys and the message line (a revision only on a real change), the
 * capture prompt (its clock, the rows ignoring input while it is up, the lock after it), `open`,
 * every `RebindEvent` of `rebindTick` (Done on Back or DONE, Context on a MODE change, Capture on an
 * action row, Reset), and `drawRebindPanel` — the keys in the value column, the message, the prompt
 * box with its draining bar and the string slots it may use.
 */
import { describe, expect, it } from 'vitest';
import { ACTION_NAMES, Action, type ActionName, type PlayerInput } from '../../src/input/index.js';
import { DrawOp, TextAlign, createDrawList, type DrawList } from '../../src/presentation/index.js';
import {
  CaptureStatus,
  MENU_CONFIRM_BUFFER_TICKS,
  MENU_REPEAT_DELAY,
  MenuResult,
  REBINDABLE_ACTIONS,
  REBIND_CAPTURE_TICKS,
  RebindEvent,
  RebindPanel,
  RebindStatus,
  UI_COLORS,
  createRebindPanel,
  drawRebindPanel,
  menuStringSlots,
  rebindStringSlots,
  rebindTick,
  type MenuLayout,
  type RebindPanelLabels,
} from '../../src/ui/index.js';

/** Every action's row label: its name in upper case. */
const ACTION_LABELS = (() => {
  const out: Record<string, string> = {};
  for (const name of ACTION_NAMES) out[name] = name.toUpperCase();
  return out as Record<ActionName, string>;
})();

/** The labels of a panel. */
const LABELS: RebindPanelLabels = {
  mode: 'MODE',
  contexts: ['GAME', 'MENU'],
  actions: ACTION_LABELS,
  reset: 'RESET',
  done: 'DONE',
};

/** Where the rows go (as the rebind screen lays them out). */
const LAYOUT: MenuLayout = Object.freeze({
  x: 72,
  y: 30,
  lineHeight: 11,
  cursorX: 62,
  valueX: 150,
});

const IDLE: PlayerInput = { held: 0, pressed: 0, released: 0, device: 'keyboard' };

/**
 * One tick with a fresh press (held as well).
 *
 * @param pressed - The actions pressed.
 * @returns The input.
 */
function tap(pressed: number): PlayerInput {
  return { held: pressed, pressed, released: 0, device: 'keyboard' };
}

/**
 * One tick with actions held (no new press).
 *
 * @param held - The actions held.
 * @returns The input.
 */
function holding(held: number): PlayerInput {
  return { held, pressed: 0, released: 0, device: 'keyboard' };
}

/**
 * A panel open on the game context with no lock.
 *
 * @returns The panel.
 */
function panel(): RebindPanel {
  const p = createRebindPanel(LABELS);
  p.open('game', 0);
  return p;
}

/**
 * Taps an action then releases it, returning the event of the tap.
 *
 * @param p - The panel.
 * @param action - The action.
 * @returns The event of the tap tick.
 */
function press(p: RebindPanel, action: number): number {
  const event = rebindTick(p, tap(action));
  rebindTick(p, IDLE);
  return event;
}

/**
 * The texts of a draw list: `[string, x, y, color, align]`.
 *
 * @param list - The list.
 * @returns The texts in command order.
 */
function texts(list: DrawList): Array<[string, number, number, number, number]> {
  const out: Array<[string, number, number, number, number]> = [];
  for (let i = 0; i < list.count; i++) {
    if (list.op[i] === DrawOp.Text) {
      out.push([list.strings[list.ref[i]], list.x[i], list.y[i], list.color[i], list.flags[i]]);
    }
  }
  return out;
}

/**
 * The rectangles of a draw list: `[x, y, w, h, color]`.
 *
 * @param list - The list.
 * @returns The rectangles in command order.
 */
function rects(list: DrawList): Array<[number, number, number, number, number]> {
  const out: Array<[number, number, number, number, number]> = [];
  for (let i = 0; i < list.count; i++) {
    if (list.op[i] === DrawOp.Rect) {
      out.push([list.x[i], list.y[i], list.w[i], list.h[i], list.color[i]]);
    }
  }
  return out;
}

describe('core/ui rebind widget: constants', () => {
  it('lists the rebindable actions of each context in the screen’s order', () => {
    expect(REBINDABLE_ACTIONS.game).toEqual([
      'Up',
      'Down',
      'Left',
      'Right',
      'Shot',
      'Sub',
      'PowerUp',
      'Special',
      'Speed',
      'Pause',
    ]);
    expect(REBINDABLE_ACTIONS.menu).toEqual([
      'Up',
      'Down',
      'Left',
      'Right',
      'Confirm',
      'Back',
      'Pause',
    ]);
    expect(Object.isFrozen(REBINDABLE_ACTIONS)).toBe(true);
    expect(Object.isFrozen(REBINDABLE_ACTIONS.game)).toBe(true);
    // Confirm / Back are menu actions; the weapons are game actions.
    expect(REBINDABLE_ACTIONS.game).not.toContain('Confirm');
    expect(REBINDABLE_ACTIONS.menu).not.toContain('Shot');
  });

  it('numbers the outcomes, the capture states and the events distinctly', () => {
    for (const table of [RebindStatus, CaptureStatus, RebindEvent]) {
      const values = Object.values(table);
      expect(new Set(values).size).toBe(values.length);
    }
    expect(RebindStatus.Bound).toBe(0);
    expect(CaptureStatus.Idle).toBe(0);
    expect(RebindEvent.None).toBe(0);
    expect(REBIND_CAPTURE_TICKS).toBe(300);
  });
});

describe('core/ui rebind widget: the panel', () => {
  it('builds a MODE row, one row per action, RESET and DONE for each context', () => {
    const p = createRebindPanel(LABELS);
    expect(p).toBeInstanceOf(RebindPanel);
    expect(p.context).toBe('game');
    expect(p.menus).toHaveLength(2);
    expect(p.menus[0].items.map((item) => item.label)).toEqual([
      'MODE',
      'UP',
      'DOWN',
      'LEFT',
      'RIGHT',
      'SHOT',
      'SUB',
      'POWERUP',
      'SPECIAL',
      'SPEED',
      'PAUSE',
      'RESET',
      'DONE',
    ]);
    expect(p.menus[1].items.map((item) => item.label)).toEqual([
      'MODE',
      'UP',
      'DOWN',
      'LEFT',
      'RIGHT',
      'CONFIRM',
      'BACK',
      'PAUSE',
      'RESET',
      'DONE',
    ]);
    // Both MODE rows share one choice.
    expect(p.menus[0].items[0].choice).toBe(p.contextChoice);
    expect(p.menus[1].items[0].choice).toBe(p.contextChoice);
    expect(p.contextChoice.labels).toEqual(['GAME', 'MENU']);
    // Every row starts unbound.
    expect(p.keys[0]).toEqual(new Array(10).fill('-'));
    expect(p.keys[1]).toEqual(new Array(7).fill('-'));
    expect([p.capturing, p.captureTicks, p.prompt, p.message, p.result]).toEqual([
      false,
      0,
      '',
      '',
      MenuResult.None,
    ]);
  });

  it('keeps only one context label per context and sizes its string slots on the larger menu', () => {
    const p = createRebindPanel({ ...LABELS, contexts: ['G', 'M', 'EXTRA'] });
    expect(p.contextChoice.labels).toEqual(['G', 'M']);
    expect(p.menuSlots).toBe(Math.max(menuStringSlots(p.menus[0]), menuStringSlots(p.menus[1])));
    expect(p.menuSlots).toBe(menuStringSlots(p.menus[0]));
    expect(p.maxRows).toBe(10);
    expect(rebindStringSlots(p)).toBe(p.menuSlots + 10 + 3);
  });

  it('names the focused action and the RESET row of the context shown', () => {
    const p = panel();
    expect(p.focusedAction).toBeNull(); // MODE
    expect(p.resetRow).toBe(11);
    const game = p.menu;
    game.focus = 1;
    expect(p.focusedAction).toBe('Up');
    game.focus = 5;
    expect(p.focusedAction).toBe('Shot');
    game.focus = 10;
    expect(p.focusedAction).toBe('Pause');
    game.focus = 11;
    expect(p.focusedAction).toBeNull(); // RESET
    game.focus = 12;
    expect(p.focusedAction).toBeNull(); // DONE
    p.open('menu', 0);
    expect(p.context).toBe('menu');
    expect(p.menu).toBe(p.menus[1]);
    expect(p.resetRow).toBe(8);
    p.menu.focus = 5;
    expect(p.focusedAction).toBe('Confirm');
    p.menu.focus = 6;
    expect(p.focusedAction).toBe('Back');
    p.menu.focus = 8;
    expect(p.focusedAction).toBeNull();
  });

  it('sets the keys of a row, counting a revision only when the label changes', () => {
    const p = panel();
    const start = p.revision;
    p.setKeys('game', 'Shot', 'Z  SPACE');
    expect(p.keys[0][4]).toBe('Z  SPACE');
    expect(p.revision).toBe(start + 1);
    p.setKeys('game', 'Shot', 'Z  SPACE');
    expect(p.revision).toBe(start + 1);
    p.setKeys('menu', 'Confirm', 'ENTER');
    expect(p.keys[1][4]).toBe('ENTER');
    expect(p.revision).toBe(start + 2);
    // An action the context does not rebind, and a context that does not exist, are ignored.
    p.setKeys('menu', 'Shot', 'J');
    p.setKeys('game', 'Confirm', 'J');
    p.setKeys('pause' as never, 'Up', 'J');
    expect(p.keys[0]).not.toContain('J');
    expect(p.keys[1]).not.toContain('J');
    expect(p.revision).toBe(start + 2);
  });

  it('says a message, counting a revision only when it changes', () => {
    const p = panel();
    const start = p.revision;
    p.say('SHOT REBOUND');
    p.say('SHOT REBOUND');
    expect([p.message, p.revision]).toEqual(['SHOT REBOUND', start + 1]);
    p.say('');
    expect([p.message, p.revision]).toEqual(['', start + 2]);
  });

  it('opens on a context with MODE focused, the message cleared and a lock', () => {
    const p = createRebindPanel(LABELS);
    p.menus[1].focus = 4;
    p.say('OLD');
    p.startCapture('PRESS A KEY FOR UP');
    p.open('menu', 2);
    expect([p.context, p.menu.focus, p.message, p.capturing]).toEqual(['menu', 0, '', false]);
    expect(p.menu.lockTicks).toBe(2);
    // A context the widget does not know shows the game.
    p.open('nowhere' as never, 0);
    expect(p.context).toBe('game');
  });
});

describe('core/ui rebind widget: rebindTick', () => {
  it('Back closes (even while the rows are locked); DONE closes as well', () => {
    const p = createRebindPanel(LABELS);
    p.open('game', 5);
    expect(rebindTick(p, tap(Action.Back))).toBe(RebindEvent.Done);
    expect(p.result).toBe(MenuResult.Back);
    const q = panel();
    q.menu.focus = q.resetRow + 1;
    expect(rebindTick(q, tap(Action.Confirm))).toBe(RebindEvent.Done);
    expect(q.result).toBe(MenuResult.Confirmed);
  });

  it('a MODE change shows the other context’s rows, focused on MODE', () => {
    const p = panel();
    const before = p.revision;
    expect(press(p, Action.Right)).toBe(RebindEvent.Context);
    expect([p.context, p.menu.focus]).toEqual(['menu', 0]);
    expect(p.revision).toBeGreaterThan(before);
    expect(press(p, Action.Left)).toBe(RebindEvent.Context);
    expect(p.context).toBe('game');
    // OK on MODE steps the choice too.
    expect(rebindTick(p, tap(Action.Confirm))).toBe(RebindEvent.Context);
    expect(p.context).toBe('menu');
    expect(p.result).toBe(MenuResult.Changed);
  });

  it('a Right still held after a MODE change does not switch back (no repeat across menus)', () => {
    const p = panel();
    expect(rebindTick(p, tap(Action.Right))).toBe(RebindEvent.Context);
    for (let t = 0; t < MENU_REPEAT_DELAY * 3; t++) {
      expect(rebindTick(p, holding(Action.Right))).toBe(RebindEvent.None);
    }
    expect(p.context).toBe('menu');
  });

  it('moves over the rows; OK on an action captures, on RESET resets', () => {
    const p = panel();
    expect(press(p, Action.Down)).toBe(RebindEvent.None);
    expect(p.menu.focus).toBe(1);
    rebindTick(p, tap(Action.Down));
    expect(p.result).toBe(MenuResult.Moved);
    rebindTick(p, IDLE);
    expect(p.focusedAction).toBe('Down');
    expect(press(p, Action.Confirm)).toBe(RebindEvent.Capture);
    p.menu.focus = p.resetRow;
    expect(press(p, Action.Confirm)).toBe(RebindEvent.Reset);
    // Left / Right on an action row change nothing.
    p.menu.focus = 3;
    expect(press(p, Action.Right)).toBe(RebindEvent.None);
    expect(p.context).toBe('game');
    // Up from MODE wraps to DONE.
    p.menu.focus = 0;
    press(p, Action.Up);
    expect(p.menu.focus).toBe(p.resetRow + 1);
  });

  it('holds an OK pressed during the lock until the lock ends (a buffered press)', () => {
    const p = createRebindPanel(LABELS);
    p.open('game', 2);
    p.menu.focus = 1;
    expect(rebindTick(p, tap(Action.Confirm))).toBe(RebindEvent.None);
    expect(rebindTick(p, IDLE)).toBe(RebindEvent.None);
    expect(rebindTick(p, IDLE)).toBe(RebindEvent.Capture);
    // A press older than the buffer is dropped.
    const q = createRebindPanel(LABELS);
    q.open('game', MENU_CONFIRM_BUFFER_TICKS + 2);
    q.menu.focus = 1;
    rebindTick(q, tap(Action.Confirm));
    for (let t = 0; t < MENU_CONFIRM_BUFFER_TICKS + 4; t++) {
      expect(rebindTick(q, IDLE)).toBe(RebindEvent.None);
    }
  });

  it('while the prompt is up only its clock runs: the rows ignore every input', () => {
    const p = panel();
    p.menu.focus = 5;
    const before = p.revision;
    p.startCapture('PRESS A KEY FOR SHOT');
    expect([p.capturing, p.captureTicks, p.prompt]).toEqual([true, 0, 'PRESS A KEY FOR SHOT']);
    expect(p.revision).toBe(before + 1);
    const opened = p.revision;
    for (const input of [tap(Action.Back), tap(Action.Down), tap(Action.Confirm), IDLE]) {
      expect(rebindTick(p, input)).toBe(RebindEvent.None);
      expect(p.result).toBe(MenuResult.None);
    }
    expect([p.menu.focus, p.captureTicks]).toEqual([5, 4]);
    // The time bar redraws every 30 ticks.
    for (let t = 4; t < 60; t++) rebindTick(p, IDLE);
    expect(p.captureTicks).toBe(60);
    expect(p.revision).toBe(opened + 2);
    // A new prompt restarts the clock.
    p.startCapture('PRESS A KEY FOR SUB');
    expect([p.captureTicks, p.prompt]).toEqual([0, 'PRESS A KEY FOR SUB']);
  });

  it('after the prompt the rows wait a short lock, so the captured key does not act on them', () => {
    const p = panel();
    p.menu.focus = 5;
    p.startCapture('PRESS A KEY FOR SHOT');
    rebindTick(p, IDLE);
    const before = p.revision;
    p.stopCapture();
    expect(p.capturing).toBe(false);
    expect(p.revision).toBe(before + 1);
    expect(p.menu.lockTicks).toBe(2);
    // The press is buffered past the lock (the scene waits for a release before it ticks the rows).
    expect(rebindTick(p, tap(Action.Confirm))).toBe(RebindEvent.None);
    // Stopping twice changes nothing.
    const again = p.revision;
    p.stopCapture();
    expect(p.revision).toBe(again);
  });

  it('switches contexts with each menu keeping the rows it shows', () => {
    const p = panel();
    press(p, Action.Right); // MENU
    for (let i = 0; i < 6; i++) press(p, Action.Down);
    expect(p.focusedAction).toBe('Back');
    expect(press(p, Action.Confirm)).toBe(RebindEvent.Capture);
    p.menu.focus = 0;
    press(p, Action.Right); // GAME again: MODE focused
    expect([p.context, p.menu.focus, p.focusedAction]).toEqual(['game', 0, null]);
  });
});

describe('core/ui rebind widget: drawRebindPanel', () => {
  it('draws each action’s keys in the value column, the focused one highlighted', () => {
    const p = panel();
    p.setKeys('game', 'Up', '↑  W');
    p.setKeys('game', 'Shot', 'Z  SPACE');
    p.menu.focus = 1;
    const list = createDrawList(256, 64);
    drawRebindPanel(list, p, 0, LAYOUT, 'ESC: CANCEL');
    const drawn = texts(list);
    const keys = drawn.filter(([, x]) => x === 150);
    // MODE's choice (GAME) is drawn at the value column too, on row 0.
    expect(keys.map(([s, , y]) => [s, y])).toEqual([
      ['GAME', 30],
      ['↑  W', 41],
      ['-', 52],
      ['-', 63],
      ['-', 74],
      ['Z  SPACE', 85],
      ['-', 96],
      ['-', 107],
      ['-', 118],
      ['-', 129],
      ['-', 140],
    ]);
    expect(keys[1][3]).toBe(UI_COLORS.focus);
    expect(keys[5][3]).toBe(UI_COLORS.title);
    // No message, no prompt.
    expect(drawn.map(([s]) => s)).not.toContain('ESC: CANCEL');
    // The keys use their own slots, after the menu's.
    expect(list.strings[p.menuSlots]).toBe('↑  W');
    expect(list.strings[p.menuSlots + 4]).toBe('Z  SPACE');
  });

  it('draws the message centred under the rows', () => {
    const p = panel();
    p.say('SHOT REBOUND');
    const list = createDrawList(256, 64);
    drawRebindPanel(list, p, 3, LAYOUT, 'HINT');
    const message = texts(list).find(([s]) => s === 'SHOT REBOUND');
    expect(message).toBeDefined();
    expect([message?.[1], message?.[3], message?.[4]]).toEqual([
      192,
      UI_COLORS.focus,
      TextAlign.Center,
    ]);
    // Below the DONE row.
    expect(message?.[2]).toBeGreaterThan(30 + 12 * 11);
    expect(list.strings[3 + p.menuSlots + p.maxRows]).toBe('SHOT REBOUND');
  });

  it('draws only the menu context’s rows when MODE shows MENU', () => {
    const p = panel();
    press(p, Action.Right);
    p.setKeys('menu', 'Confirm', 'ENTER');
    const list = createDrawList(256, 64);
    drawRebindPanel(list, p, 0, LAYOUT, 'HINT');
    const drawn = texts(list).map(([s]) => s);
    expect(drawn).toEqual(expect.arrayContaining(['MENU', 'CONFIRM', 'BACK', 'ENTER']));
    expect(drawn).not.toContain('SHOT');
    expect(texts(list).filter(([, x]) => x === 150)).toHaveLength(1 + 7);
  });

  it('draws the prompt box with its hint and a bar that drains over the capture', () => {
    const p = panel();
    p.menu.focus = 5;
    p.startCapture('PRESS A KEY FOR SHOT');
    const list = createDrawList(256, 64);
    const base = 2;
    const draw = (): void => {
      list.clear();
      drawRebindPanel(list, p, base, LAYOUT, 'ESC / BACK OR WAIT: CANCEL');
    };
    draw();
    const drawn = texts(list);
    const prompt = drawn.find(([s]) => s === 'PRESS A KEY FOR SHOT');
    const hint = drawn.find(([s]) => s === 'ESC / BACK OR WAIT: CANCEL');
    expect([prompt?.[1], prompt?.[2], prompt?.[3]]).toEqual([192, 92, UI_COLORS.focus]);
    expect([hint?.[1], hint?.[2], hint?.[3]]).toEqual([192, 106, UI_COLORS.disabled]);
    const slot = base + p.menuSlots + p.maxRows;
    expect([list.strings[slot + 1], list.strings[slot + 2]]).toEqual([
      'PRESS A KEY FOR SHOT',
      'ESC / BACK OR WAIT: CANCEL',
    ]);
    // While capturing no key row is highlighted.
    expect(drawn.filter(([, x, , c]) => x === 150 && c === UI_COLORS.focus)).toHaveLength(0);
    /**
     * The bar's rectangles at the prompt's bottom (the track, then the fill when any is left).
     *
     * @returns `[w, color]` of each.
     */
    const bar = (): Array<[number, number]> =>
      rects(list)
        .filter(([x, y, , h]) => x === 92 && y === 122 && h === 3)
        .map(([, , w, , c]) => [w, c]);
    expect(bar()).toEqual([
      [200, UI_COLORS.track],
      [200, UI_COLORS.title],
    ]);
    for (let t = 0; t < REBIND_CAPTURE_TICKS / 2; t++) rebindTick(p, IDLE);
    draw();
    expect(bar()).toEqual([
      [200, UI_COLORS.track],
      [100, UI_COLORS.title],
    ]);
    for (let t = 0; t < REBIND_CAPTURE_TICKS / 2; t++) rebindTick(p, IDLE);
    draw();
    expect(bar()).toEqual([[200, UI_COLORS.track]]);
    // Past the timeout the bar stays empty.
    rebindTick(p, IDLE);
    draw();
    expect(bar()).toEqual([[200, UI_COLORS.track]]);
  });

  it('writes a slot only when its text changed and stays inside its slot range', () => {
    const p = panel();
    p.say('HELLO');
    const list = createDrawList(256, 64);
    drawRebindPanel(list, p, 10, LAYOUT, 'HINT');
    p.startCapture('PROMPT');
    list.clear();
    drawRebindPanel(list, p, 10, LAYOUT, 'HINT');
    const revision = list.revision;
    list.clear();
    const cleared = list.revision;
    drawRebindPanel(list, p, 10, LAYOUT, 'HINT');
    // Only commands were added (no string changed): the revision grew by the commands alone.
    expect(list.revision - cleared).toBe(list.count);
    expect(revision).toBeGreaterThan(0);
    // Nothing below the base or past the last slot was written.
    for (let i = 0; i < 10; i++) expect(list.strings[i]).toBe('');
    const last = 10 + rebindStringSlots(p) - 1;
    for (let i = last + 1; i < 64; i++) expect(list.strings[i]).toBe('');
    expect(list.strings[last]).toBe('HINT');
  });
});
