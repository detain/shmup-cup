/**
 * eventLog (line format, bounded log), format helpers and the Back×3 exit gesture.
 */

import { describe, expect, it } from 'vitest';

import { KIND_LABELS, LineLog, formatEvent } from '../src/eventLog';
import { MultiPressDetector } from '../src/exitGesture';
import { fmtHz, fmtMs, padLeft, padRight, round1, truncate } from '../src/format';

describe('format helpers', () => {
  it('fmtMs', () => {
    expect(fmtMs(12.345)).toBe('12.3 ms');
    expect(fmtMs(12.345, 2)).toBe('12.35 ms');
    expect(fmtMs(0, 0)).toBe('0 ms');
    for (const v of [null, undefined, NaN, Infinity, -Infinity]) expect(fmtMs(v)).toBe('—');
  });

  it('fmtHz', () => {
    expect(fmtHz(59.94)).toBe('59.9 Hz');
    for (const v of [null, undefined, NaN, Infinity]) expect(fmtHz(v)).toBe('—');
  });

  it('padLeft / padRight', () => {
    expect(padLeft('7', 3)).toBe('  7');
    expect(padLeft('1234', 3)).toBe('1234');
    expect(padRight('ab', 4)).toBe('ab  ');
    expect(padRight('ab', 5, '.')).toBe('ab...');
    expect(padRight('abcdef', 3)).toBe('abcdef');
  });

  it('truncate', () => {
    expect(truncate('hello', 5)).toBe('hello');
    expect(truncate('hello!', 5)).toBe('hell…');
    expect(truncate('hello', 1)).toBe('h');
    expect(truncate('hello', 0)).toBe('');
  });

  it('round1', () => {
    expect(round1(1.26)).toBe(1.3);
    expect(round1(-1.24)).toBe(-1.2);
    expect(round1(0)).toBe(0);
    for (const v of [null, undefined, NaN, Infinity]) expect(round1(v)).toBeNull();
  });
});

describe('formatEvent', () => {
  it('keydown line: time, name(code), repeat flag, kind label, Δ', () => {
    expect(formatEvent({ t: 8123.44, type: 'down', code: 39, name: 'ArrowRight', repeat: false, kind: 'press', dt: 95.25 })).toBe(
      '   8123.4 DOWN ArrowRight(39)     repeat=0 press  Δ95.3',
    );
    expect(formatEvent({ t: 1, type: 'down', code: 39, name: 'ArrowRight', repeat: true, kind: 'repeat' })).toContain(
      'repeat=1 rep',
    );
    expect(formatEvent({ t: 1, type: 'down', code: 39, name: 'X', repeat: false, kind: 'bounce' })).toContain('BOUNCE');
  });

  it('keyup line shows held time, or "stray"', () => {
    expect(formatEvent({ t: 8200.1, type: 'up', code: 39, name: 'ArrowRight', heldMs: 76.9, dt: 76.9 })).toBe(
      '   8200.1 UP   ArrowRight(39)     held=77ms       Δ76.9',
    );
    expect(formatEvent({ t: 1, type: 'up', code: 13, name: 'Enter', heldMs: -1 })).toContain('held=stray');
    expect(formatEvent({ t: 1, type: 'up', code: 13, name: 'Enter' })).toContain('held=stray');
  });

  it('omits Δ when unknown or not finite', () => {
    expect(formatEvent({ t: 1, type: 'down', code: 13, name: 'Enter', repeat: false, kind: 'press' })).not.toContain('Δ');
    expect(formatEvent({ t: 1, type: 'down', code: 13, name: 'Enter', repeat: false, kind: 'press', dt: NaN })).not.toContain('Δ');
  });

  it('missing name/code/kind fall back to "?" / blank', () => {
    expect(formatEvent({ t: 0, type: 'down' })).toBe('      0.0 DOWN ?(?)               repeat=0       ');
  });

  it('info and gamepad lines', () => {
    expect(formatEvent({ t: 5, type: 'info', text: 'blur — cleared held keys' })).toBe('      5.0 ·  blur — cleared held keys');
    expect(formatEvent({ t: 5, type: 'gamepad', text: 'GP0 b3 down' })).toBe('      5.0 GP  GP0 b3 down');
    expect(formatEvent({ t: 5, type: 'info' })).toBe('      5.0 ·  ');
  });

  it('has a short label for every keydown kind', () => {
    expect(Object.keys(KIND_LABELS).sort()).toEqual(['bounce', 'press', 'repeat', 'repeat-noflag']);
  });
});

describe('LineLog', () => {
  it('defaults to 28 lines (spec) and keeps the newest', () => {
    const log = new LineLog();
    expect(log.capacity).toBe(28);
    for (let i = 0; i < 40; i++) log.push('l' + i);
    const lines = log.toArray();
    expect(lines).toHaveLength(28);
    expect(lines[0]).toBe('l12');
    expect(lines[27]).toBe('l39');
  });

  it('text() joins oldest-first; changeCount increments per push', () => {
    const log = new LineLog(3);
    expect(log.text()).toBe('');
    expect(log.changeCount).toBe(0);
    log.push('a');
    log.push('b');
    expect(log.text()).toBe('a\nb');
    expect(log.changeCount).toBe(2);
  });

  it('toArray returns a copy', () => {
    const log = new LineLog(3);
    log.push('a');
    log.toArray().push('mutated');
    expect(log.toArray()).toEqual(['a']);
  });
});

describe('MultiPressDetector (Back ×3 within 1.5 s)', () => {
  it('defaults match the spec', () => {
    const d = new MultiPressDetector();
    expect(d.presses).toBe(3);
    expect(d.windowMs).toBe(1500);
  });

  it('fires on the third press within the window (inclusive boundary)', () => {
    const d = new MultiPressDetector();
    expect(d.press(0)).toBe(false);
    expect(d.press(750)).toBe(false);
    expect(d.pending).toBe(2);
    expect(d.press(1500)).toBe(true);
    expect(d.pending).toBe(0);
  });

  it('does not fire when the first press has left the window', () => {
    const d = new MultiPressDetector();
    d.press(0);
    d.press(750);
    expect(d.press(1501)).toBe(false);
    expect(d.pending).toBe(2);
    expect(d.press(1600)).toBe(true);
  });

  it('clears its history after firing (a 4th quick press starts over)', () => {
    const d = new MultiPressDetector();
    d.press(0);
    d.press(100);
    expect(d.press(200)).toBe(true);
    expect(d.press(300)).toBe(false);
    expect(d.pending).toBe(1);
  });

  it('reset() forgets presses; custom counts/windows work', () => {
    const d = new MultiPressDetector(2, 300);
    d.press(0);
    d.reset();
    expect(d.press(100)).toBe(false);
    expect(d.press(400)).toBe(true);
    const single = new MultiPressDetector(1, 10);
    expect(single.press(5)).toBe(true);
  });
});
