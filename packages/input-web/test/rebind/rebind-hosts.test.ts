/**
 * `InputProfile.hosts` — the host filter of the Options screen's CONTROLS row (plan M3-03).
 *
 * Both TV hosts read the same `content/input/`, and their remotes disagree about Back (Tizen
 * 10009, webOS 461). A profile with the *other* TV's Back binds every action the menu context
 * requires, so `selectableKeyProfiles`' completeness check happily offers it — and a player who
 * picks it is left with no way back out of the Options screen. `hosts` is what prevents that, and
 * these are its rules: absent / empty = every host, a named list = those hosts only, and `null`
 * (the default) = no filter at all, which is what the headless tests and the dev `?profile=`
 * override want.
 */
import { describe, expect, it } from 'vitest';
import {
  inputProfileChoices,
  parseInputProfiles,
  selectableKeyProfiles,
  type InputProfile,
} from '../../src/rebind/index.js';

/** A game table binding what the game context requires. */
const GAME = {
  byCode: {},
  byKeyCode: {
    '38': ['Up'],
    '40': ['Down'],
    '37': ['Left'],
    '39': ['Right'],
    '13': ['Shot'],
    '80': ['Pause'],
  },
};

/**
 * A complete TV menu table whose Back is on a given key code.
 *
 * @param back - The remote's Back key code (Tizen 10009, webOS 461).
 * @returns The menu bindings.
 */
function tvMenu(back: number) {
  return {
    byCode: {},
    byKeyCode: {
      '38': ['Up'],
      '40': ['Down'],
      '37': ['Left'],
      '39': ['Right'],
      '13': ['Confirm'],
      [String(back)]: ['Back'],
    },
  };
}

/**
 * Parses profiles from compact descriptions.
 *
 * @param specs - `[id, back key code, hosts?]` — `hosts` left out means the field is absent.
 * @returns The parsed profiles (asserting the file validated).
 */
function profilesOf(
  specs: ReadonlyArray<readonly [string, number, string[]?]>,
): readonly InputProfile[] {
  const { profiles, issues } = parseInputProfiles({
    formatVersion: 1,
    kind: 'input-profiles',
    profiles: specs.map(([id, back, hosts]) => ({
      id,
      label: id.toUpperCase(),
      device: 'remote',
      context: { game: GAME, menu: tvMenu(back) },
      releaseDebounceTicks: 0,
      diagonals: 'combine',
      socd: 'neutral',
      register: [],
      ...(hosts === undefined ? {} : { hosts }),
    })),
  });
  expect(issues).toEqual([]);
  return profiles;
}

describe('input-web rebind — a profile names its hosts (M3-03)', () => {
  it('defaults to every host when the field is absent, and freezes the list', () => {
    const [anywhere, tizen] = profilesOf([
      ['anywhere', 10009],
      ['tizen-like', 10009, ['tizen']],
    ]);
    expect(anywhere.hosts).toEqual([]);
    expect(Object.isFrozen(anywhere.hosts)).toBe(true);
    expect(tizen.hosts).toEqual(['tizen']);
    expect(Object.isFrozen(tizen.hosts)).toBe(true);
  });

  it('offers a profile to the hosts it names and to nobody else', () => {
    const profiles = profilesOf([
      ['tizen-like', 10009, ['tizen']],
      ['webos-like', 461, ['webos']],
      ['both', 10009, ['tizen', 'webos']],
      ['anywhere', 10009],
    ]);
    expect(selectableKeyProfiles(profiles, 'keyCode', 'tizen').map((p) => p.id)).toEqual([
      'tizen-like',
      'both',
      'anywhere',
    ]);
    expect(selectableKeyProfiles(profiles, 'keyCode', 'webos').map((p) => p.id)).toEqual([
      'webos-like',
      'both',
      'anywhere',
    ]);
    // A host nothing names still gets the unrestricted profiles — never an empty CONTROLS row.
    expect(selectableKeyProfiles(profiles, 'keyCode', 'electron').map((p) => p.id)).toEqual([
      'anywhere',
    ]);
    // No host argument: no filter (the headless tests, the `?profile=` dev override).
    expect(selectableKeyProfiles(profiles, 'keyCode').map((p) => p.id)).toEqual([
      'tizen-like',
      'webos-like',
      'both',
      'anywhere',
    ]);
    expect(selectableKeyProfiles(profiles, 'keyCode', null).map((p) => p.id)).toHaveLength(4);
  });

  it('is the lock-out guard: the other TV’s complete remote is still filtered out', () => {
    // This is the regression the build found. `webos-like` binds *every* required menu action, so
    // the completeness check alone offers it to Tizen — and a Tizen player who picked it would
    // have no Back key at all (461 is not a Samsung code), with no way to change it back.
    const profiles = profilesOf([
      ['tizen-like', 10009, ['tizen']],
      ['webos-like', 461, ['webos']],
    ]);
    for (const profile of profiles) {
      expect(
        selectableKeyProfiles([profile], 'keyCode').map((p) => p.id),
        profile.id,
      ).toEqual([profile.id]);
    }
    expect(selectableKeyProfiles(profiles, 'keyCode', 'tizen').map((p) => p.id)).toEqual([
      'tizen-like',
    ]);
    expect(selectableKeyProfiles(profiles, 'keyCode', 'webos').map((p) => p.id)).toEqual([
      'webos-like',
    ]);
  });

  it('filters the CONTROLS choices too, marking the host’s own default', () => {
    const profiles = profilesOf([
      ['tizen-like', 10009, ['tizen']],
      ['webos-like', 461, ['webos']],
    ]);
    expect(inputProfileChoices(profiles, 'keyCode', 'webos-like', null, 'webos')).toEqual([
      { id: 'webos-like', label: 'WEBOS-LIKE (DEFAULT)' },
    ]);
    expect(inputProfileChoices(profiles, 'keyCode', 'tizen-like', null, 'tizen')).toEqual([
      { id: 'tizen-like', label: 'TIZEN-LIKE (DEFAULT)' },
    ]);
    // The `extra` escape hatch (a `?profile=` override in use) is appended after the filter, so a
    // developer can still see the profile they forced — it is never chosen by accident.
    const [, webos] = profiles;
    expect(
      inputProfileChoices(profiles, 'keyCode', 'tizen-like', webos, 'tizen').map((c) => c.id),
    ).toEqual(['tizen-like', 'webos-like']);
  });

  it('refuses a hosts list that is not lower-case ids, or longer than eight', () => {
    for (const hosts of [['Tizen'], ['web os'], ['tizen1'], [''], 1, 'tizen', [1]]) {
      const { issues } = parseInputProfiles({
        formatVersion: 1,
        kind: 'input-profiles',
        profiles: [
          {
            id: 'p',
            label: 'P',
            device: 'remote',
            context: { game: GAME, menu: tvMenu(10009) },
            releaseDebounceTicks: 0,
            diagonals: 'combine',
            socd: 'neutral',
            register: [],
            hosts,
          },
        ],
      });
      expect(issues.length, JSON.stringify(hosts)).toBeGreaterThan(0);
    }
  });
});
