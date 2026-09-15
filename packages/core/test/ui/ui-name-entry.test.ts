/**
 * Tests of the UI kit's 3-letter name entry (plan M2-15, shmup_feat.md §17): a D-pad letter
 * picker driven by **the four directions and OK only** (the remote) — Up / Down change the letter
 * (wrapping, held-duration auto-repeat), Right / OK move on, Left / Back go back, OK on END
 * finishes; the name it builds, the lock and buffer, and what `drawNameEntry` draws.
 */
import { describe, expect, it } from 'vitest';
import { Action, type PlayerInput } from '../../src/input/index.js';
import { DrawOp, createDrawList } from '../../src/presentation/index.js';
import {
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

/** Only the remote's four directions and OK. */
const FOUR_WAY = Action.Up | Action.Down | Action.Left | Action.Right | Action.Confirm;

describe('core/ui name entry', () => {
  it('starts on A with the other letters empty; OK, OK, OK, OK enters "A"', () => {
    const entry = createNameEntry();
    expect(entry.length).toBe(NAME_ENTRY_LENGTH);
    expect([entry.letter(0), entry.letter(1), entry.letter(2)]).toEqual(['A', '', '']);
    expect(entry.cursor).toBe(0);
    expect(taps(entry, [Action.Confirm, Action.Confirm, Action.Confirm])).toEqual([
      MenuResult.Moved,
      MenuResult.Moved,
      MenuResult.Moved,
    ]);
    expect(entry.cursor).toBe(NAME_ENTRY_LENGTH); // END
    expect(entry.done).toBe(false);
    expect(taps(entry, [Action.Confirm])).toEqual([MenuResult.Confirmed]);
    expect(entry.done).toBe(true);
    expect(entry.name).toBe('A');
  });

  it('enters a full name with the four directions and OK only', () => {
    const entry = createNameEntry();
    // Up on A → B; Right; Down on the empty second letter → the last glyph (the space); Right;
    // Down × 13 on the empty third letter → the space, !, -, ., 9, 8 … 1.
    const keys = [Action.Up, Action.Right, Action.Down, Action.Right];
    for (let i = 0; i < 13; i++) keys.push(Action.Down);
    const results = taps(entry, keys);
    for (const key of keys) expect(key & ~FOUR_WAY).toBe(0);
    expect(results.every((r) => r !== MenuResult.None)).toBe(true);
    const glyphs = NAME_ENTRY_GLYPHS;
    expect(entry.letter(0)).toBe('B');
    expect(entry.letter(1)).toBe(glyphs[glyphs.length - 1]);
    expect(entry.letter(2)).toBe(glyphs[glyphs.length - 13]);
    expect(entry.letter(2)).toBe('1');
    taps(entry, [Action.Right, Action.Confirm]);
    expect(entry.done).toBe(true);
    expect(entry.name).toBe('B 1');
  });

  it('Up wraps from the last glyph to A; Left and Back go back and edit a letter again', () => {
    const entry = createNameEntry();
    taps(entry, [Action.Down]); // A → the space (the last glyph)
    expect(entry.letter(0)).toBe(' ');
    taps(entry, [Action.Up]);
    expect(entry.letter(0)).toBe('A');
    taps(entry, [Action.Right, Action.Up, Action.Up]); // B on the second letter
    expect(entry.letter(1)).toBe('B');
    expect(taps(entry, [Action.Left])).toEqual([MenuResult.Moved]);
    expect(entry.cursor).toBe(0);
    expect(taps(entry, [Action.Left])).toEqual([MenuResult.None]); // not before the first
    taps(entry, [Action.Up, Action.Up]);
    expect(entry.letter(0)).toBe('C');
    taps(entry, [Action.Right, Action.Right]);
    expect(taps(entry, [Action.Back])).toEqual([MenuResult.Moved]); // Back = Left
    expect(entry.cursor).toBe(1);
    taps(entry, [Action.Right, Action.Right]);
    expect(taps(entry, [Action.Right])).toEqual([MenuResult.None]); // not past END
    expect(taps(entry, [Action.Up])).toEqual([MenuResult.None]); // END has no letter
    taps(entry, [Action.Confirm]);
    expect(entry.name).toBe('CB');
  });

  it('auto-repeats a held Up at the menus` held-duration rate', () => {
    const entry = createNameEntry();
    expect(nameEntryTick(entry, tap(Action.Up))).toBe(MenuResult.Changed); // B
    let changes = 1;
    const held = MENU_REPEAT_DELAY + 2 * MENU_REPEAT_INTERVAL;
    for (let t = 1; t <= held; t++) {
      if (nameEntryTick(entry, hold(Action.Up)) === MenuResult.Changed) changes++;
    }
    expect(changes).toBe(4); // the press, the delay, two intervals
    expect(entry.letter(0)).toBe('E');
  });

  it('buffers an OK pressed during the open lock; ignores input once done', () => {
    const entry = createNameEntry();
    entry.open(2);
    expect(nameEntryTick(entry, tap(Action.Confirm))).toBe(MenuResult.None);
    expect(nameEntryTick(entry, IDLE)).toBe(MenuResult.None);
    expect(nameEntryTick(entry, IDLE)).toBe(MenuResult.Moved); // the buffered OK
    expect(entry.cursor).toBe(1);
    taps(entry, [Action.Right, Action.Right, Action.Confirm]);
    expect(entry.done).toBe(true);
    const revision = entry.revision;
    expect(taps(entry, [Action.Up, Action.Left, Action.Confirm])).toEqual([
      MenuResult.None,
      MenuResult.None,
      MenuResult.None,
    ]);
    expect(entry.revision).toBe(revision);
    entry.open();
    expect([entry.done, entry.cursor, entry.name]).toEqual([false, 0, 'A']);
  });

  it('trims trailing spaces and empty letters from the name; all blank is empty', () => {
    const entry = createNameEntry();
    taps(entry, [Action.Down]); // the space
    taps(entry, [Action.Right, Action.Right, Action.Right, Action.Confirm]);
    expect(entry.name).toBe('');
    const inner = createNameEntry();
    taps(inner, [Action.Right, Action.Right, Action.Up]); // A, empty, A
    expect(inner.name).toBe('A A');
    expect(() => createNameEntry(0)).toThrow(RangeError);
    expect(() => createNameEntry(9)).toThrow(RangeError);
    expect(createNameEntry(8).length).toBe(8);
  });

  it('draws the letters, the empty cells, the cursor`s arrows and END', () => {
    const entry = createNameEntry();
    taps(entry, [Action.Right]);
    const list = createDrawList(64, NAME_ENTRY_STRING_SLOTS);
    drawNameEntry(list, entry, 0, 192, 100);
    const texts: Array<[string, number]> = [];
    for (let i = 0; i < list.count; i++) {
      if (list.op[i] === DrawOp.Text) texts.push([list.strings[list.ref[i]], list.color[i]]);
    }
    expect(texts).toEqual([
      ['A', UI_COLORS.text],
      ['_', UI_COLORS.disabled],
      ['↑', UI_COLORS.focus],
      ['↓', UI_COLORS.focus],
      ['_', UI_COLORS.disabled],
      ['END', UI_COLORS.disabled],
    ]);
    // A blink-off frame hides the arrows; the cursor on END lights it.
    list.clear();
    taps(entry, [Action.Right, Action.Right]);
    drawNameEntry(list, entry, 0, 192, 100, true);
    const end: number[] = [];
    for (let i = 0; i < list.count; i++) {
      if (list.op[i] === DrawOp.Text && list.strings[list.ref[i]] === 'END')
        end.push(list.color[i]);
    }
    expect(end).toEqual([UI_COLORS.text]);
  });
});
