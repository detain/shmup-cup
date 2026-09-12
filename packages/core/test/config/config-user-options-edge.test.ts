/**
 * Edge cases of the user options in `core/config` (plan M1-17): the `volumeGain` curve at every
 * level and outside the range, `resolveUserOptions` rounding, `-0`, the profile-id limits, input
 * shapes that are not plain objects, and the frozen, independent results.
 *
 * Regression: a level in `(-0.5, 0]` resolved to `-0` (now 0).
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_USER_OPTIONS,
  INPUT_PROFILE_ID_PATTERN,
  VOLUME_LEVELS,
  resolveUserOptions,
  volumeGain,
} from '../../src/config/index.js';

describe('core/config volumeGain (edge)', () => {
  it('is (level / 10)² at every slider level, rising strictly', () => {
    let previous = -1;
    for (let level = 0; level <= VOLUME_LEVELS; level++) {
      const x = level / VOLUME_LEVELS;
      expect(volumeGain(level), String(level)).toBe(x * x);
      expect(volumeGain(level)).toBeGreaterThan(previous);
      previous = volumeGain(level);
    }
  });

  it('clamps outside the range and treats non-numbers as silence', () => {
    expect(volumeGain(Number.POSITIVE_INFINITY)).toBe(1);
    expect(volumeGain(Number.NEGATIVE_INFINITY)).toBe(0);
    expect(volumeGain(10.5)).toBe(1);
    expect(volumeGain(-0)).toBe(0);
    expect(volumeGain(0.5)).toBeCloseTo(0.0025, 12);
    expect(volumeGain(undefined as unknown as number)).toBe(0);
  });
});

describe('core/config resolveUserOptions (edge)', () => {
  it('rounds levels half up and clamps them', () => {
    const levels = [
      [2.5, 3],
      [2.49, 2],
      [9.5, 10],
      [10.4, 10],
      [1e9, 10],
      [-1e9, 0],
    ] as const;
    for (const [given, want] of levels) {
      expect(resolveUserOptions({ audio: { sfx: given } }).audio.sfx, String(given)).toBe(want);
    }
  });

  it('never returns -0', () => {
    for (const level of [-0, -0.2, -0.5]) {
      const { audio } = resolveUserOptions({ audio: { master: level, music: level, sfx: level } });
      expect(Object.is(audio.master, 0) && Object.is(audio.music, 0), String(level)).toBe(true);
      expect(Object.is(audio.sfx, 0)).toBe(true);
    }
  });

  it('keeps defaults for levels that are not finite numbers', () => {
    for (const level of [Number.NaN, '5', null, true, [5], { level: 5 }]) {
      const label = JSON.stringify(level);
      expect(resolveUserOptions({ audio: { music: level } }).audio.music, label).toBe(10);
    }
  });

  it('accepts profile ids of up to 64 characters in lower-case kebab', () => {
    const id64 = `a${'-b'.repeat(31)}c`.slice(0, 64);
    expect(id64).toHaveLength(64);
    expect(resolveUserOptions({ input: { profileId: id64 } }).input.profileId).toBe(id64);
    expect(resolveUserOptions({ input: { profileId: `${id64}d` } }).input.profileId).toBeNull();
    for (const id of ['a--b', 'a-', 'tizen_remote', 'ÄÖ', ' a', 'a\n']) {
      expect(INPUT_PROFILE_ID_PATTERN.test(id), JSON.stringify(id)).toBe(false);
      expect(resolveUserOptions({ input: { profileId: id } }).input.profileId).toBeNull();
    }
    expect(resolveUserOptions({ input: { profileId: 'x9-2' } }).input.profileId).toBe('x9-2');
  });

  it('reads groups that are not plain objects as missing', () => {
    for (const value of [null, 0, 'x', [], [1, 2]]) {
      expect(
        resolveUserOptions({ audio: value, input: value, display: value }),
        JSON.stringify(value),
      ).toEqual(DEFAULT_USER_OPTIONS);
    }
    expect(resolveUserOptions(42)).toEqual(DEFAULT_USER_OPTIONS);
    expect(resolveUserOptions(null)).toEqual(DEFAULT_USER_OPTIONS);
  });

  it('does not read a parsed "__proto__" key as options', () => {
    // JSON.parse makes "__proto__" an own data field; it is not the options' `audio`.
    expect(resolveUserOptions(JSON.parse('{"__proto__":{"audio":{"music":1}}}'))).toEqual(
      DEFAULT_USER_OPTIONS,
    );
    expect(({} as Record<string, unknown>).audio).toBeUndefined();
  });

  it('returns a fresh frozen object every time, never the defaults object itself', () => {
    const a = resolveUserOptions(undefined);
    const b = resolveUserOptions(undefined);
    expect(a).not.toBe(DEFAULT_USER_OPTIONS);
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
    for (const part of [a, a.audio, a.input, a.display]) expect(Object.isFrozen(part)).toBe(true);
    expect(Object.isFrozen(DEFAULT_USER_OPTIONS.input)).toBe(true);
    expect(Object.isFrozen(DEFAULT_USER_OPTIONS.display)).toBe(true);
  });

  it('is idempotent', () => {
    const once = resolveUserOptions({
      audio: { master: 3.7, music: -2, sfx: 'x' },
      input: { profileId: 'keyboard-default' },
      display: { scale: 2 },
    });
    expect(resolveUserOptions(once)).toEqual(once);
  });
});
