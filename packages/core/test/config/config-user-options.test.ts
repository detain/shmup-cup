/**
 * Tests of the presentation-only user options in `core/config` (plan M1-17): defaults, the
 * defensive `resolveUserOptions` and the perceptual `volumeGain` curve.
 */
import { describe, expect, it } from 'vitest';
import {
  BULLET_PALETTES,
  DEFAULT_USER_OPTIONS,
  SCALE_MODES,
  VOLUME_LEVELS,
  resolveUserOptions,
  volumeGain,
} from '../../src/config/index.js';

describe('core/config user options', () => {
  it('defaults to full volumes and the platform profile', () => {
    expect(VOLUME_LEVELS).toBe(10);
    expect(DEFAULT_USER_OPTIONS).toEqual({
      audio: { master: 10, music: 10, sfx: 10 },
      input: {
        profileId: null,
        autofire: null,
        autofireInterval: null,
        socd: null,
        releaseDebounce: null,
        bindings: {},
      },
      game: {
        difficulty: null,
        lives: null,
        deathPenalty: null,
        autoPowerUp: null,
        pickupMagnet: null,
        oneButton: false,
      },
      display: {
        bulletPalette: 'standard',
        scaleMode: 'integer',
        screenShake: true,
        reduceFlashing: false,
        showHitbox: false,
        bossHpBar: false,
      },
    });
    expect(Object.isFrozen(DEFAULT_USER_OPTIONS.audio)).toBe(true);
  });

  it('resolves the bullet palette (M2-02): a known name, else standard', () => {
    expect(BULLET_PALETTES).toEqual(['standard', 'deuteranopia', 'protanopia', 'tritanopia']);
    for (const palette of BULLET_PALETTES) {
      expect(
        resolveUserOptions({ display: { bulletPalette: palette } }).display.bulletPalette,
      ).toBe(palette);
    }
    for (const bad of ['Tritanopia', '', 3, null, undefined]) {
      expect(resolveUserOptions({ display: { bulletPalette: bad } }).display.bulletPalette).toBe(
        'standard',
      );
    }
    expect(resolveUserOptions({ display: 'x' }).display).toEqual({
      bulletPalette: 'standard',
      scaleMode: 'integer',
      screenShake: true,
      reduceFlashing: false,
      showHitbox: false,
      bossHpBar: false,
    });
  });

  it('resolves the display options of M2-08: scale mode, shake, flashing, hitbox', () => {
    expect(SCALE_MODES).toEqual(['integer', 'fit', 'stretch']);
    for (const mode of SCALE_MODES) {
      expect(resolveUserOptions({ display: { scaleMode: mode } }).display.scaleMode).toBe(mode);
    }
    for (const bad of ['Fit', '', 2, null]) {
      expect(resolveUserOptions({ display: { scaleMode: bad } }).display.scaleMode).toBe('integer');
    }
    expect(
      resolveUserOptions({
        display: { screenShake: false, reduceFlashing: true, showHitbox: true, bulletPalette: 'x' },
      }).display,
    ).toEqual({
      bulletPalette: 'standard',
      scaleMode: 'integer',
      screenShake: false,
      reduceFlashing: true,
      showHitbox: true,
      bossHpBar: false,
    });
    // Anything but a boolean takes the default.
    expect(
      resolveUserOptions({ display: { screenShake: 0, reduceFlashing: 'yes', showHitbox: 1 } })
        .display,
    ).toMatchObject({ screenShake: true, reduceFlashing: false, showHitbox: false });
    expect(Object.isFrozen(resolveUserOptions({}).display)).toBe(true);
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
      input: { ...DEFAULT_USER_OPTIONS.input, profileId: 'tizen-remote-safe' },
      game: DEFAULT_USER_OPTIONS.game,
      display: {
        bulletPalette: 'standard',
        scaleMode: 'integer',
        screenShake: true,
        reduceFlashing: false,
        showHitbox: false,
        bossHpBar: false,
      },
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
