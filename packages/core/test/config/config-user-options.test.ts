/**
 * Tests of the presentation-only user options in `core/config` (plan M1-17): defaults, the
 * defensive `resolveUserOptions` and the perceptual `volumeGain` curve.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_USER_OPTIONS,
  VOLUME_LEVELS,
  resolveUserOptions,
  volumeGain,
} from '../../src/config/index.js';

describe('core/config user options', () => {
  it('defaults to full volumes and the platform profile', () => {
    expect(VOLUME_LEVELS).toBe(10);
    expect(DEFAULT_USER_OPTIONS).toEqual({
      audio: { master: 10, music: 10, sfx: 10 },
      input: { profileId: null },
      display: {},
    });
    expect(Object.isFrozen(DEFAULT_USER_OPTIONS.audio)).toBe(true);
  });

  it('maps volume levels to a squared gain', () => {
    expect([0, 5, 10].map(volumeGain)).toEqual([0, 0.25, 1]);
    expect(volumeGain(1)).toBeCloseTo(0.01, 12);
    expect(volumeGain(-3)).toBe(0);
    expect(volumeGain(12)).toBe(1);
    expect(volumeGain(Number.NaN)).toBe(0);
  });

  it('resolves options field by field, never throwing', () => {
    expect(resolveUserOptions(undefined)).toEqual(DEFAULT_USER_OPTIONS);
    expect(resolveUserOptions('garbage')).toEqual(DEFAULT_USER_OPTIONS);
    expect(resolveUserOptions([])).toEqual(DEFAULT_USER_OPTIONS);
    expect(
      resolveUserOptions({
        audio: { master: 3.6, music: -1, sfx: Number.POSITIVE_INFINITY },
        input: { profileId: 'tizen-remote-safe' },
        display: { crt: true },
      }),
    ).toEqual({
      audio: { master: 4, music: 0, sfx: 10 },
      input: { profileId: 'tizen-remote-safe' },
      display: {},
    });
    for (const id of ['', 'Upper', 'a b', '-x', 'x'.repeat(65), 7, null]) {
      expect(resolveUserOptions({ input: { profileId: id } }).input.profileId, String(id)).toBe(
        null,
      );
    }
    const resolved = resolveUserOptions({ audio: { music: 2 } });
    expect(resolved.audio).toEqual({ master: 10, music: 2, sfx: 10 });
    expect(Object.isFrozen(resolved) && Object.isFrozen(resolved.input)).toBe(true);
  });
});
