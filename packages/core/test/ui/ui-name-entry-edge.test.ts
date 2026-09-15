/**
 * Edge cases of the UI kit's name entry (plan M2-15, shmup_feat.md §17) beyond
 * `ui-name-entry.test.ts`: the open lock and the confirm buffer (a press early in a long lock is
 * dropped, a late one fires when the lock ends, Back cancels a buffered one), what one tick does
 * when OK and a direction come together, held Left / Right repeating the cursor to its ends, a
 * diagonal press, the empty letter's first step each way, the glyph table's full cycle, the
 * `revision` counter, names with inner and leading spaces, the length limits, and what
 * `drawNameEntry` draws for a finished entry and where it writes its strings.
 */
import { describe, expect, it } from 'vitest';
import { Action, type PlayerInput } from '../../src/input/index.js';
import { DrawOp, createDrawList, type DrawList } from '../../src/presentation/index.js';
import {
  MENU_CONFIRM_BUFFER_TICKS,
  MENU_REPEAT_DELAY,
  MENU_REPEAT_INTERVAL,
  MenuResult,
  NAME_ENTRY_GLYPHS,
  NAME_ENTRY_LENGTH,
  NAME_ENTRY_STRING_SLOTS,
  UI_COLORS,
  createNameEntry,
  drawNameEntry,
  nameEntryTick,
  type NameEntry,
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

/**
 * One tick with actions held but not newly pressed.
 *
 * @param held - Held actions.
 * @returns The input.
 */
function hold(held: number): PlayerInput {
  return { held, pressed: 0, released: 0, device: 'keyboard' };
}

const IDLE: PlayerInput = { held: 0, pressed: 0, released: 0, device: 'keyboard' };

/**
 * Taps a sequence of actions (each followed by an idle tick).
 *
 * @param entry - The entry.
 * @param actions - The actions.
 * @returns The results of the taps.
 */
function taps(entry: NameEntry, actions: readonly number[]): number[] {
  const results: number[] = [];
  for (const action of actions) {
    results.push(nameEntryTick(entry, tap(action)));
    nameEntryTick(entry, IDLE);
  }
  return results;
}

/**
 * Runs idle ticks and collects their results.
 *
 * @param entry - The entry.
 * @param ticks - Ticks.
 * @returns The results.
 */
function idle(entry: NameEntry, ticks: number): number[] {
  const results: number[] = [];
  for (let t = 0; t < ticks; t++) results.push(nameEntryTick(entry, IDLE));
  return results;
}

/**
 * The text commands of a draw list.
 *
 * @param list - The list.
 * @returns `[text, colour]` pairs in draw order.
 */
function texts(list: DrawList): Array<[string, number]> {
  const out: Array<[string, number]> = [];
  for (let i = 0; i < list.count; i++) {
    if (list.op[i] === DrawOp.Text) out.push([list.strings[list.ref[i]], list.color[i]]);
  }
  return out;
}

describe('core/ui name entry — lock and confirm buffer', () => {
  it('drops an OK pressed early in a long lock (the buffer runs out before the lock does)', () => {
    const entry = createNameEntry();
    const lock = MENU_CONFIRM_BUFFER_TICKS + 6;
    entry.open(lock);
    expect(nameEntryTick(entry, tap(Action.Confirm))).toBe(MenuResult.None);
    const results = idle(entry, lock + 4);
    expect(results.every((r) => r === MenuResult.None)).toBe(true);
    expect(entry.cursor).toBe(0);
    expect(entry.lockTicks).toBe(0);
    expect(entry.confirmBuffer).toBe(0);
  });

  it('fires an OK pressed just before the lock ends on the first free tick, once', () => {
    const entry = createNameEntry();
    entry.open(3);
    idle(entry, 1); // lock 3 → 2
    expect(nameEntryTick(entry, tap(Action.Confirm))).toBe(MenuResult.None); // lock 2 → 1
    const results = idle(entry, 4);
    // lock 1 → 0 on the first idle tick, the buffered OK fires on the next.
    expect(results).toEqual([MenuResult.None, MenuResult.Moved, MenuResult.None, MenuResult.None]);
    expect(entry.cursor).toBe(1);
  });

  it('lets the directions work during the lock (only OK is held back)', () => {
    const entry = createNameEntry();
    entry.open(10);
    expect(nameEntryTick(entry, tap(Action.Up))).toBe(MenuResult.Changed);
    expect(entry.letter(0)).toBe('B');
    nameEntryTick(entry, IDLE);
    expect(nameEntryTick(entry, tap(Action.Right))).toBe(MenuResult.Moved);
    expect(entry.cursor).toBe(1);
  });

  it('cancels a buffered OK with Back (Back goes back; nothing fires later)', () => {
    const entry = createNameEntry();
    taps(entry, [Action.Right]);
    entry.lockTicks = 2;
    expect(nameEntryTick(entry, tap(Action.Confirm))).toBe(MenuResult.None); // buffered
    expect(nameEntryTick(entry, tap(Action.Back))).toBe(MenuResult.Moved); // back to letter 0
    expect(entry.cursor).toBe(0);
    expect(entry.confirmBuffer).toBe(0);
    expect(idle(entry, 6).every((r) => r === MenuResult.None)).toBe(true);
    expect(entry.cursor).toBe(0);
    // Back on the first letter does nothing (the entry is never left by Back).
    expect(nameEntryTick(entry, tap(Action.Back))).toBe(MenuResult.None);
    expect(entry.done).toBe(false);
  });

  it('Back pressed with OK in the same tick goes back (Back wins)', () => {
    const entry = createNameEntry();
    taps(entry, [Action.Right, Action.Right]);
    expect(nameEntryTick(entry, tap(Action.Confirm | Action.Back))).toBe(MenuResult.Moved);
    expect(entry.cursor).toBe(1);
    expect(idle(entry, 3).every((r) => r === MenuResult.None)).toBe(true);
  });
});

describe('core/ui name entry — directions', () => {
  it('OK and a direction in one tick: OK moves on, the direction is not applied', () => {
    const entry = createNameEntry();
    expect(nameEntryTick(entry, tap(Action.Confirm | Action.Up))).toBe(MenuResult.Moved);
    expect(entry.cursor).toBe(1);
    expect([entry.letter(0), entry.letter(1)]).toEqual(['A', '']);
    // The direction was not taken as a press: holding it on does not repeat.
    for (let t = 0; t < MENU_REPEAT_DELAY + 2; t++) nameEntryTick(entry, hold(Action.Up));
    expect(entry.letter(1)).toBe('');
  });

  it('a diagonal press takes one direction (Up / Down before Left / Right)', () => {
    const entry = createNameEntry();
    expect(nameEntryTick(entry, tap(Action.Up | Action.Right))).toBe(MenuResult.Changed);
    expect([entry.cursor, entry.letter(0)]).toEqual([0, 'B']);
    nameEntryTick(entry, IDLE);
    expect(nameEntryTick(entry, tap(Action.Down | Action.Left))).toBe(MenuResult.Changed);
    expect([entry.cursor, entry.letter(0)]).toEqual([0, 'A']);
  });

  it('held Right repeats to END and stops there; held Left repeats back to the first letter', () => {
    const entry = createNameEntry(5);
    let moved = nameEntryTick(entry, tap(Action.Right)) === MenuResult.Moved ? 1 : 0;
    const ticks = MENU_REPEAT_DELAY + 10 * MENU_REPEAT_INTERVAL;
    for (let t = 0; t < ticks; t++) {
      if (nameEntryTick(entry, hold(Action.Right)) === MenuResult.Moved) moved++;
    }
    expect(entry.cursor).toBe(5); // END
    expect(moved).toBe(5);
    nameEntryTick(entry, IDLE);
    let back = nameEntryTick(entry, tap(Action.Left)) === MenuResult.Moved ? 1 : 0;
    for (let t = 0; t < ticks; t++) {
      if (nameEntryTick(entry, hold(Action.Left)) === MenuResult.Moved) back++;
    }
    expect(entry.cursor).toBe(0);
    expect(back).toBe(5);
  });

  it('an empty letter starts at A going up and at the last glyph going down', () => {
    const up = createNameEntry();
    taps(up, [Action.Right, Action.Up]);
    expect(up.letter(1)).toBe('A');
    const down = createNameEntry();
    taps(down, [Action.Right, Action.Down]);
    expect(down.letter(1)).toBe(NAME_ENTRY_GLYPHS[NAME_ENTRY_GLYPHS.length - 1]);
  });

  it('Up cycles through every glyph once and comes back to A', () => {
    const entry = createNameEntry();
    const seen: string[] = [entry.letter(0)];
    for (let i = 1; i < NAME_ENTRY_GLYPHS.length; i++) {
      taps(entry, [Action.Up]);
      seen.push(entry.letter(0));
    }
    expect(seen.join('')).toBe(NAME_ENTRY_GLYPHS);
    taps(entry, [Action.Up]);
    expect(entry.letter(0)).toBe('A');
    // Every glyph is a single character (the letter picker draws one per cell).
    for (const glyph of seen) expect(glyph).toHaveLength(1);
  });

  it('counts a revision for each visible change and none for an ignored input', () => {
    const entry = createNameEntry();
    let revision = entry.revision;
    const step = (input: PlayerInput): number => {
      const result = nameEntryTick(entry, input);
      const changed = entry.revision !== revision;
      revision = entry.revision;
      expect(changed, `result ${result}`).toBe(result !== MenuResult.None);
      return result;
    };
    step(tap(Action.Left)); // None: first letter
    step(IDLE);
    step(tap(Action.Up)); // Changed
    step(IDLE);
    step(tap(Action.Right)); // Moved
    step(IDLE);
    step(tap(Action.Right));
    step(IDLE);
    step(tap(Action.Right)); // END
    step(IDLE);
    step(tap(Action.Up)); // None: END has no letter
    step(IDLE);
    step(tap(Action.Right)); // None: past END
    step(IDLE);
    step(tap(Action.Confirm)); // Confirmed
    expect(entry.done).toBe(true);
    const before = entry.revision;
    entry.open();
    expect(entry.revision).toBe(before + 1);
  });
});

describe('core/ui name entry — names and limits', () => {
  it('keeps inner and leading spaces, trims trailing ones', () => {
    const lead = createNameEntry();
    taps(lead, [Action.Down, Action.Right, Action.Up, Action.Right, Action.Up, Action.Up]);
    expect(lead.name).toBe(' AB');
    const inner = createNameEntry();
    taps(inner, [Action.Right, Action.Down, Action.Right, Action.Up]);
    expect(inner.name).toBe('A A');
    const trail = createNameEntry();
    taps(trail, [Action.Right, Action.Down, Action.Right, Action.Down]);
    expect(trail.name).toBe('A');
  });

  it('enters the punctuation glyphs (Down from A: the space, !, -, .)', () => {
    const entry = createNameEntry();
    taps(entry, [Action.Down, Action.Down]); // the space, then !
    taps(entry, [Action.Right, Action.Down, Action.Down, Action.Down]); // -
    taps(entry, [Action.Right, Action.Down, Action.Down, Action.Down, Action.Down]); // .
    expect(entry.name).toBe('!-.');
  });

  it('refuses lengths that are not whole numbers in 1–8', () => {
    for (const length of [0, -1, 9, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => createNameEntry(length), String(length)).toThrow(RangeError);
    }
    expect(createNameEntry().length).toBe(NAME_ENTRY_LENGTH);
  });

  it('a one-letter entry: OK reaches END at once, OK again finishes with A', () => {
    const entry = createNameEntry(1);
    expect(taps(entry, [Action.Confirm])).toEqual([MenuResult.Moved]);
    expect(entry.cursor).toBe(1);
    expect(taps(entry, [Action.Confirm])).toEqual([MenuResult.Confirmed]);
    expect(entry.name).toBe('A');
  });

  it('letter() is empty outside the entry; open() clears every letter', () => {
    const entry = createNameEntry();
    for (const index of [-1, NAME_ENTRY_LENGTH, 99]) expect(entry.letter(index)).toBe('');
    taps(entry, [Action.Up, Action.Right, Action.Up, Action.Right, Action.Up]);
    expect(entry.name).toBe('BAA');
    entry.open();
    expect([entry.letter(0), entry.letter(1), entry.letter(2), entry.name]).toEqual([
      'A',
      '',
      '',
      'A',
    ]);
  });
});

describe('core/ui drawNameEntry — edge cases', () => {
  it('a finished entry shows no cursor: no arrows, no focus colour, END dimmed', () => {
    const entry = createNameEntry();
    taps(entry, [Action.Up, Action.Right, Action.Right, Action.Right, Action.Confirm]);
    expect(entry.done).toBe(true);
    const list = createDrawList(64, NAME_ENTRY_STRING_SLOTS);
    drawNameEntry(list, entry, 0, 192, 100);
    expect(texts(list)).toEqual([
      ['B', UI_COLORS.text],
      ['_', UI_COLORS.disabled],
      ['_', UI_COLORS.disabled],
      ['END', UI_COLORS.disabled],
    ]);
    for (let i = 0; i < list.count; i++) {
      if (list.op[i] === DrawOp.Rect) expect(list.color[i]).toBe(UI_COLORS.border);
    }
  });

  it('writes only its own string slots (from stringBase on)', () => {
    const base = 10;
    const list = createDrawList(64, base + NAME_ENTRY_STRING_SLOTS + 5);
    for (let i = 0; i < list.strings.length; i++) list.setString(i, 'x' + String(i));
    const entry = createNameEntry();
    taps(entry, [Action.Up, Action.Right, Action.Up]);
    drawNameEntry(list, entry, base, 192, 100);
    for (let i = 0; i < list.strings.length; i++) {
      if (i < base || i >= base + NAME_ENTRY_STRING_SLOTS) {
        expect(list.strings[i], `slot ${i}`).toBe('x' + String(i));
      }
    }
    for (let i = 0; i < list.count; i++) {
      if (list.op[i] !== DrawOp.Text) continue;
      expect(list.ref[i]).toBeGreaterThanOrEqual(base);
      expect(list.ref[i]).toBeLessThan(base + NAME_ENTRY_STRING_SLOTS);
    }
  });

  it('centres the cells on cx: END sits right of the last letter at the same pitch', () => {
    const entry = createNameEntry();
    const list = createDrawList(64, NAME_ENTRY_STRING_SLOTS);
    drawNameEntry(list, entry, 0, 200, 50);
    const xs: number[] = [];
    for (let i = 0; i < list.count; i++) {
      if (list.op[i] === DrawOp.Text && list.y[i] === 50) xs.push(list.x[i]);
    }
    // Three letters and END, 16 px apart for the letters, END one cell further.
    expect(xs).toHaveLength(4);
    expect(xs[1] - xs[0]).toBe(16);
    expect(xs[2] - xs[1]).toBe(16);
    expect(xs[3] - xs[2]).toBe(24);
    // Symmetric about cx: the row spans (n + 2) cells centred on it.
    expect((xs[0] - 8 + xs[0] - 8 + 5 * 16) / 2).toBe(200);
  });
});
