/**
 * keys: key codes, static/Tizen/DOM key names, registration selection, preventDefault policy.
 */

import { describe, expect, it } from 'vitest';

import {
  ARROW_CODES,
  KeyCode,
  KeyNames,
  MANDATORY_CODES,
  STATIC_KEY_NAMES,
  isArrow,
  isExtraKey,
  selectKeysToRegister,
  shouldPreventDefault,
  type KeyModifiers,
} from '../src/keys';

const NO_MODS: KeyModifiers = { ctrl: false, meta: false, alt: false };

describe('static key table (spec)', () => {
  it.each([
    [13, 'Enter'],
    [37, 'ArrowLeft'],
    [38, 'ArrowUp'],
    [39, 'ArrowRight'],
    [40, 'ArrowDown'],
    [10009, 'Back'],
    [10182, 'Exit'],
    [10252, 'MediaPlayPause'],
    [427, 'ChannelUp'],
    [428, 'ChannelDown'],
    [447, 'VolumeUp'],
    [448, 'VolumeDown'],
    [449, 'VolumeMute'],
    [403, 'ColorF0Red'],
    [404, 'ColorF1Green'],
    [405, 'ColorF2Yellow'],
    [406, 'ColorF3Blue'],
    [412, 'MediaRewind'],
    [413, 'MediaStop'],
    [415, 'MediaPlay'],
    [417, 'MediaFastForward'],
    [19, 'MediaPause'],
    [457, 'Info'],
  ])('%i → %s', (code, name) => {
    expect(STATIC_KEY_NAMES[code]).toBe(name);
    expect(new KeyNames().name(code)).toBe(name);
  });

  it('names the digit keys 48–57 as 0–9', () => {
    for (let d = 0; d <= 9; d++) expect(STATIC_KEY_NAMES[48 + d]).toBe(String(d));
  });
});

describe('KeyCode helpers', () => {
  it('ARROW_CODES / MANDATORY_CODES', () => {
    expect(ARROW_CODES).toEqual([37, 38, 39, 40]);
    expect([...MANDATORY_CODES].sort((a, b) => a - b)).toEqual([13, 37, 38, 39, 40, 10009]);
  });

  it('isArrow only accepts 37–40', () => {
    expect([36, 37, 38, 39, 40, 41].map(isArrow)).toEqual([false, true, true, true, true, false]);
  });

  it('isExtraKey excludes arrows, OK and Back', () => {
    for (const c of MANDATORY_CODES) expect(isExtraKey(c)).toBe(false);
    expect(isExtraKey(KeyCode.MediaPlayPause)).toBe(true);
    expect(isExtraKey(427)).toBe(true);
    expect(isExtraKey(48)).toBe(true);
  });
});

describe('KeyNames', () => {
  it('runtime Tizen names override static names and add unknown codes', () => {
    const n = new KeyNames();
    n.merge([
      { name: 'MediaPlayPause', code: 10252 },
      { name: 'Red', code: 403 },
      { name: 'Caption', code: 10221 },
    ]);
    expect(n.name(403)).toBe('Red');
    expect(n.name(10221)).toBe('Caption');
  });

  it('merge ignores malformed entries', () => {
    const n = new KeyNames();
    n.merge([
      { name: '', code: 403 },
      { name: 'X', code: 'nope' as unknown as number },
      { name: 5 as unknown as string, code: 404 },
    ]);
    expect(n.name(403)).toBe('ColorF0Red');
    expect(n.name(404)).toBe('ColorF1Green');
  });

  it('falls back to the DOM key (upper-cased single chars) and remembers it', () => {
    const n = new KeyNames();
    expect(n.name(65, 'a')).toBe('A');
    expect(n.name(65)).toBe('A');
    expect(n.name(112, 'F1')).toBe('F1');
    expect(n.name(112, 'something-else')).toBe('F1');
  });

  it('uses #code for unknown keys without a usable DOM key', () => {
    const n = new KeyNames();
    expect(n.name(777)).toBe('#777');
    expect(n.name(777, '')).toBe('#777');
    expect(n.name(777, 'Unidentified')).toBe('#777');
    // the fallback is not remembered: a later real DOM key still wins
    expect(n.name(777, 'Foo')).toBe('Foo');
  });

  it('instances are independent', () => {
    const a = new KeyNames();
    a.merge([{ name: 'Custom', code: 13 }]);
    expect(new KeyNames().name(13)).toBe('Enter');
  });
});

describe('selectKeysToRegister', () => {
  it('registers everything except Exit (by name or code), de-duplicated, in order', () => {
    expect(
      selectKeysToRegister([
        { name: 'VolumeUp', code: 447 },
        { name: 'Exit', code: 10182 },
        { name: 'ChannelUp', code: 427 },
        { name: 'VolumeUp', code: 447 },
        { name: 'ExitAlias', code: 10182 },
        { name: '0', code: 48 },
      ]),
    ).toEqual(['VolumeUp', 'ChannelUp', '0']);
  });

  it('empty in, empty out', () => {
    expect(selectKeysToRegister([])).toEqual([]);
  });
});

describe('shouldPreventDefault', () => {
  it('desktop browser: only arrows, Enter, Back and Space', () => {
    for (const c of [37, 38, 39, 40, 13, 10009, 32]) expect(shouldPreventDefault(c, NO_MODS, false)).toBe(true);
    for (const c of [65, 82, 427, 9]) expect(shouldPreventDefault(c, NO_MODS, false)).toBe(false);
  });

  it('Tizen: every key', () => {
    for (const c of [65, 427, 10252, 447, 37]) expect(shouldPreventDefault(c, NO_MODS, true)).toBe(true);
  });

  it('never blocks F1–F12 or modifier shortcuts', () => {
    for (let c = 112; c <= 123; c++) expect(shouldPreventDefault(c, NO_MODS, true)).toBe(false);
    expect(shouldPreventDefault(111, NO_MODS, true)).toBe(true);
    expect(shouldPreventDefault(124, NO_MODS, true)).toBe(true);
    for (const mods of [
      { ctrl: true, meta: false, alt: false },
      { ctrl: false, meta: true, alt: false },
      { ctrl: false, meta: false, alt: true },
    ]) {
      expect(shouldPreventDefault(37, mods, true)).toBe(false);
      expect(shouldPreventDefault(73, mods, false)).toBe(false);
    }
  });
});
