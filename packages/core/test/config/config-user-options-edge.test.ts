/**
 * Edge cases of the user options in `core/config` (plan M1-17): the `volumeGain` curve at every
 * level and outside the range, `resolveUserOptions` rounding, `-0`, the profile-id limits, input
 * shapes that are not plain objects, the retired-id migration, and the frozen, independent
 * results.
 *
 * Regression: a level in `(-0.5, 0]` resolved to `-0` (now 0); `migrateInputProfileId` read
 * through `Object.prototype`, so a save naming `constructor` resolved to a function.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_USER_OPTIONS,
  INPUT_PROFILE_ID_PATTERN,
  RETIRED_INPUT_PROFILE_IDS,
  VOLUME_LEVELS,
  migrateInputProfileId,
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

  it('migrates a retired profile id and leaves every other id alone', () => {
    expect(migrateInputProfileId('tizen-remote-diagonal')).toBe('tizen-remote-safe');
    expect(
      resolveUserOptions({ input: { profileId: 'tizen-remote-diagonal' } }).input.profileId,
    ).toBe('tizen-remote-safe');
    expect(migrateInputProfileId('tizen-remote-safe')).toBe('tizen-remote-safe');
    expect(migrateInputProfileId('x9-2')).toBe('x9-2');
  });

  it('does not migrate through Object.prototype', () => {
    // Regression: RETIRED_INPUT_PROFILE_IDS is an object literal, and 'constructor' passes
    // INPUT_PROFILE_ID_PATTERN, so an unguarded lookup returned the Object constructor.
    for (const id of ['constructor', 'hasownproperty', 'tostring', 'valueof', 'proto']) {
      expect(INPUT_PROFILE_ID_PATTERN.test(id), id).toBe(true);
      expect(migrateInputProfileId(id), id).toBe(id);
      const { profileId } = resolveUserOptions({ input: { profileId: id } }).input;
      expect(typeof profileId, id).toBe('string');
      expect(profileId, id).toBe(id);
    }
    // Keys that the pattern rejects outright still resolve to null, never to a prototype value.
    for (const id of ['__proto__', 'toString', 'hasOwnProperty']) {
      expect(resolveUserOptions({ input: { profileId: id } }).input.profileId, id).toBeNull();
    }
  });

  it('holds even when Object.prototype is poisoned at run time', () => {
    // A page that loads a careless polyfill (or a save whose reader was tricked into one) can put
    // an enumerable string on Object.prototype under an id the pattern accepts. `hasOwnProperty`
    // on the table's own keys is what keeps it out of a frozen `UserOptions`.
    const prototype = Object.prototype as unknown as Record<string, unknown>;
    const added = ['tizen-remote-safe', 'keyboard-wasd', 'x9-2'];
    try {
      for (const id of added) prototype[id] = 'poisoned-remote';
      for (const id of added) {
        expect(migrateInputProfileId(id), id).toBe(id);
        expect(resolveUserOptions({ input: { profileId: id } }).input.profileId, id).toBe(id);
      }
      // The real retired id still migrates — the guard did not switch the table off.
      expect(migrateInputProfileId('tizen-remote-diagonal')).toBe('tizen-remote-safe');
    } finally {
      for (const id of added) delete prototype[id];
    }
    expect(Object.prototype).not.toHaveProperty('x9-2');
  });

  it('always resolves a saved profile id to a string or null, never to a function', () => {
    // The sanitiser's contract: `UserOptions.input.profileId` is `string | null`, whatever a save
    // file, a hand-edited localStorage entry or a poisoned prototype puts in it.
    const ids: unknown[] = [
      'constructor',
      'valueof',
      'tostring',
      'isprototypeof',
      'propertyisenumerable',
      'tolocalestring',
      'tizen-remote-diagonal',
      'tizen-remote-safe',
      '__proto__',
      'toString',
      42,
      null,
      undefined,
      {},
      [],
      () => 'x',
    ];
    for (const id of ids) {
      const resolved = resolveUserOptions({ input: { profileId: id } }).input.profileId;
      const kind = typeof resolved;
      expect(kind === 'string' || resolved === null, String(id)).toBe(true);
    }
  });

  it('keeps RETIRED_INPUT_PROFILE_IDS frozen, and every target a live profile id', () => {
    expect(Object.isFrozen(RETIRED_INPUT_PROFILE_IDS)).toBe(true);
    for (const [from, to] of Object.entries(RETIRED_INPUT_PROFILE_IDS)) {
      expect(INPUT_PROFILE_ID_PATTERN.test(from), from).toBe(true);
      expect(INPUT_PROFILE_ID_PATTERN.test(to), to).toBe(true);
      // A retired id never maps to another retired one (one pass migrates every save).
      expect(migrateInputProfileId(to), to).toBe(to);
    }
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
