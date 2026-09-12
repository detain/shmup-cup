/**
 * Edge cases of `rebind`'s Options-screen helpers (plan M1-17): a gamepad profile is never offered
 * even with a complete keyboard menu table, keyboard and remote devices both are; one key may cover
 * several menu actions; the input order is kept; a default id that is not offered marks nothing; an
 * extra profile that is the default is marked; the result is a fresh array every call.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PROFILE_SUFFIX,
  inputProfileChoices,
  parseInputProfiles,
  selectableKeyProfiles,
  type InputProfile,
} from '../../src/rebind/index.js';

/** A game table every profile can use (it binds what the game context requires). */
const GAME = {
  byCode: { ArrowUp: ['Up'], ArrowDown: ['Down'], ArrowLeft: ['Left'], ArrowRight: ['Right'] },
  byKeyCode: { '80': ['Pause'] },
};

/** A menu table complete through `KeyboardEvent.code`. */
const MENU_BY_CODE = {
  byCode: {
    ArrowUp: ['Up'],
    ArrowDown: ['Down'],
    ArrowLeft: ['Left'],
    ArrowRight: ['Right'],
    Enter: ['Confirm'],
    Escape: ['Back'],
  },
  byKeyCode: {},
};

/** A menu table complete through legacy key codes (the TV remote). */
const TV_MENU = {
  '38': ['Up'],
  '40': ['Down'],
  '37': ['Left'],
  '39': ['Right'],
  '13': ['Confirm'],
  '10009': ['Back'],
};

/**
 * Parses profiles from compact descriptions.
 *
 * @param specs - `[id, device, menu table, label?]`.
 * @returns The parsed profiles (asserting no issues).
 */
function profilesOf(
  specs: ReadonlyArray<readonly [string, string, Record<string, unknown>, string?]>,
): readonly InputProfile[] {
  const { profiles, issues } = parseInputProfiles({
    formatVersion: 1,
    kind: 'input-profiles',
    profiles: specs.map(([id, device, menu, label]) => ({
      id,
      label: label ?? id.toUpperCase(),
      device,
      context: { game: GAME, menu },
      releaseDebounceTicks: 0,
      diagonals: 'combine',
      socd: 'neutral',
      register: [],
    })),
  });
  expect(issues).toEqual([]);
  return profiles;
}

describe('rebind selectable profiles (edge)', () => {
  it('never offers a gamepad profile, even with a complete keyboard menu', () => {
    const [keys, remoteLike] = profilesOf([
      ['keys', 'keyboard', MENU_BY_CODE],
      ['remote-like', 'remote', MENU_BY_CODE],
    ]);
    // The parser refuses key tables on a gamepad profile; build one by hand to test the filter.
    const pad: InputProfile = { ...keys, id: 'pad', device: 'gamepad' };
    expect(selectableKeyProfiles([pad, keys, remoteLike], 'code').map((p) => p.id)).toEqual([
      'keys',
      'remote-like',
    ]);
    expect(selectableKeyProfiles([pad, keys, remoteLike], 'keyCode')).toEqual([]);
  });

  it('counts every action a key binds, and keeps the input order', () => {
    const packed = {
      byCode: {},
      byKeyCode: {
        '38': ['Up'],
        '40': ['Down'],
        '37': ['Left'],
        '39': ['Right'],
        '13': ['Confirm', 'Back'],
      },
    };
    const profiles = profilesOf([
      ['zeta', 'remote', packed],
      ['alpha', 'remote', packed],
    ]);
    expect(selectableKeyProfiles(profiles, 'keyCode').map((p) => p.id)).toEqual(['zeta', 'alpha']);
    expect(selectableKeyProfiles([], 'code')).toEqual([]);
  });

  it('marks nothing when the default is not offered', () => {
    const profiles = profilesOf([['keys', 'keyboard', MENU_BY_CODE, 'KEYS']]);
    expect(inputProfileChoices(profiles, 'code', 'somewhere-else')).toEqual([
      { id: 'keys', label: 'KEYS' },
    ]);
  });

  it('marks an extra profile that is the default, after the offered ones', () => {
    const profiles = profilesOf([
      ['keys', 'keyboard', MENU_BY_CODE, 'KEYS'],
      // Complete only by key code: not selectable on a desktop keyboard.
      ['tv', 'remote', { byCode: {}, byKeyCode: TV_MENU }, 'TV'],
    ]);
    expect(inputProfileChoices(profiles, 'code', 'tv', profiles[1])).toEqual([
      { id: 'keys', label: 'KEYS' },
      { id: 'tv', label: `TV${DEFAULT_PROFILE_SUFFIX}` },
    ]);
    expect(inputProfileChoices([], 'code', 'keys', profiles[0])).toEqual([
      { id: 'keys', label: `KEYS${DEFAULT_PROFILE_SUFFIX}` },
    ]);
  });

  it('returns fresh arrays every call', () => {
    const profiles = profilesOf([['keys', 'keyboard', MENU_BY_CODE]]);
    const a = selectableKeyProfiles(profiles, 'code');
    const b = selectableKeyProfiles(profiles, 'code');
    expect(a).not.toBe(b);
    a.push(profiles[0]);
    expect(selectableKeyProfiles(profiles, 'code')).toHaveLength(1);
    expect(inputProfileChoices(profiles, 'code', 'keys')).not.toBe(
      inputProfileChoices(profiles, 'code', 'keys'),
    );
  });
});
