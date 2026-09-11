/**
 * Edge cases of `rebind`: every schema limit of a profile entry (ids, labels, key names,
 * button indices, `register`), the semantic checks in combination, what a dropped profile
 * leaves behind, the compiled tables (shape, prototype-free, frozen, the `0` placeholders of
 * the other context and how they interact with the keyCode fallback), file ordering, the
 * registry, profile choice, tuning overrides and the persistence hook.
 */
import { Action, createMemoryStorage, type ContentFile, type PlatformStorage } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { findKeyActions } from '../../src/keymap/index.js';
import {
  INPUT_PROFILE_DEVICES,
  INPUT_PROFILE_STORAGE_KEY,
  KEY_PROFILE_DEVICES,
  REQUIRED_CONTEXT_ACTIONS,
  SYSTEM_REMOTE_KEYS,
  chooseInputProfile,
  createInputProfileRegistry,
  loadInputProfileChoice,
  loadInputProfiles,
  overrideInputTuning,
  parseInputProfiles,
  saveInputProfileChoice,
  type InputProfile,
} from '../../src/rebind/index.js';

/** Directions + Pause for a `game` table, by keyCode (a remote). */
const GAME_KEYS = {
  '37': ['Left'],
  '38': ['Up'],
  '39': ['Right'],
  '40': ['Down'],
  '10009': ['Pause'],
};

/** Directions + Confirm + Back for a `menu` table, by keyCode (a remote). */
const MENU_KEYS = {
  '13': ['Confirm'],
  '37': ['Left'],
  '38': ['Up'],
  '39': ['Right'],
  '40': ['Down'],
  '10009': ['Back'],
};

/** D-pad buttons of the standard mapping. */
const DPAD = { '12': ['Up'], '13': ['Down'], '14': ['Left'], '15': ['Right'] };

/**
 * A valid remote profile entry with some fields replaced.
 *
 * @param patch - Fields to replace.
 */
function remote(patch: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'edge-remote',
    label: 'EDGE',
    device: 'remote',
    context: {
      game: { byCode: {}, byKeyCode: { ...GAME_KEYS } },
      menu: { byCode: {}, byKeyCode: { ...MENU_KEYS } },
    },
    releaseDebounceTicks: 2,
    diagonals: 'combine',
    socd: 'neutral',
    register: [],
    ...patch,
  };
}

/**
 * A valid gamepad profile entry with some fields replaced.
 *
 * @param patch - Fields to replace.
 */
function gamepad(patch: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'edge-pad',
    label: 'PAD',
    device: 'gamepad',
    context: {
      game: { byCode: {}, byKeyCode: {}, buttons: { ...DPAD, '9': ['Pause'] } },
      menu: { byCode: {}, byKeyCode: {}, buttons: { ...DPAD, '0': ['Confirm'], '1': ['Back'] } },
    },
    releaseDebounceTicks: 0,
    diagonals: 'combine',
    socd: 'neutral',
    register: [],
    ...patch,
  };
}

/**
 * Wraps entries in a file body.
 *
 * @param profiles - Entries.
 */
const file = (...profiles: unknown[]) => ({ formatVersion: 1, kind: 'input-profiles', profiles });

/**
 * Issues of a single-entry file, as `path → message`.
 *
 * @param entry - The entry.
 */
function issuesOf(entry: unknown): string[] {
  return parseInputProfiles(file(entry)).issues.map((issue) => `${issue.path}: ${issue.message}`);
}

/**
 * The single profile a valid entry compiles to.
 *
 * @param entry - The entry.
 */
function compiled(entry: unknown): InputProfile {
  const { profiles, issues } = parseInputProfiles(file(entry));
  expect(issues).toEqual([]);
  const profile = profiles[0];
  if (profile === undefined) throw new Error('no profile');
  return profile;
}

describe('input-web/rebind constants', () => {
  it('lists the devices, the key devices, the required actions and the system keys', () => {
    expect(INPUT_PROFILE_DEVICES).toEqual(['keyboard', 'remote', 'gamepad']);
    expect(KEY_PROFILE_DEVICES).toEqual(['keyboard', 'remote']);
    expect(REQUIRED_CONTEXT_ACTIONS).toEqual({
      game: ['Up', 'Down', 'Left', 'Right', 'Pause'],
      menu: ['Up', 'Down', 'Left', 'Right', 'Confirm', 'Back'],
    });
    expect(SYSTEM_REMOTE_KEYS).toEqual(['Exit', 'VolumeUp', 'VolumeDown', 'VolumeMute']);
    for (const list of [
      INPUT_PROFILE_DEVICES,
      KEY_PROFILE_DEVICES,
      REQUIRED_CONTEXT_ACTIONS,
      REQUIRED_CONTEXT_ACTIONS.game,
      REQUIRED_CONTEXT_ACTIONS.menu,
      SYSTEM_REMOTE_KEYS,
    ]) {
      expect(Object.isFrozen(list)).toBe(true);
    }
    expect(INPUT_PROFILE_STORAGE_KEY).toBe('input.profile');
  });
});

describe('input-web/rebind schema limits', () => {
  it.each([
    ['a', true],
    ['tizen-remote-safe', true],
    ['p2-pad-9', true],
    ['x'.repeat(64), true],
    ['x'.repeat(65), false],
    ['Upper', false],
    ['-lead', false],
    ['trail-', false],
    ['double--dash', false],
    ['snake_case', false],
    ['with space', false],
    ['', false],
  ])('id %j valid: %s', (id, valid) => {
    expect(issuesOf(remote({ id })).length === 0).toBe(valid);
  });

  it('labels are 1–40 characters', () => {
    expect(issuesOf(remote({ label: 'L'.repeat(40) }))).toEqual([]);
    expect(issuesOf(remote({ label: 'L'.repeat(41) }))).toEqual([
      'profiles[0].label: must be a string of length in 1..40',
    ]);
    expect(issuesOf(remote({ label: '' }))).toEqual([
      'profiles[0].label: must be a string of length in 1..40',
    ]);
  });

  it('rejects an unknown device, an unknown SOCD policy and a fractional debounce', () => {
    expect(issuesOf(remote({ device: 'mouse' }))).toEqual([
      'profiles[0].device: must be one of: keyboard, remote, gamepad',
    ]);
    expect(issuesOf(remote({ socd: 'firstWins' }))).toEqual([
      'profiles[0].socd: must be one of: neutral, lastWins',
    ]);
    expect(issuesOf(remote({ releaseDebounceTicks: 1.5 }))).toEqual([
      'profiles[0].releaseDebounceTicks: must be an integer in 0..10',
    ]);
    expect(issuesOf(remote({ releaseDebounceTicks: -1 }))).toEqual([
      'profiles[0].releaseDebounceTicks: must be an integer in 0..10',
    ]);
    expect(issuesOf(remote({ releaseDebounceTicks: 10 }))).toEqual([]);
    expect(issuesOf(remote({ releaseDebounceTicks: 0 }))).toEqual([]);
  });

  it('requires every field of an entry and of a binding table', () => {
    const entry = remote();
    delete entry['register'];
    delete entry['socd'];
    expect(issuesOf(entry)).toEqual([
      'profiles[0].socd: is required',
      'profiles[0].register: is required',
    ]);
    const noKeyCodes = remote();
    delete (noKeyCodes['context'] as { menu: Record<string, unknown> }).menu['byKeyCode'];
    expect(issuesOf(noKeyCodes)).toEqual(['profiles[0].context.menu.byKeyCode: is required']);
    expect(issuesOf(remote({ context: { game: { byCode: {}, byKeyCode: GAME_KEYS } } }))).toEqual([
      'profiles[0].context.menu: is required',
    ]);
    expect(
      issuesOf(
        remote({
          context: {
            game: { byCode: {}, byKeyCode: GAME_KEYS },
            menu: { byCode: {}, byKeyCode: MENU_KEYS },
            pause: { byCode: {}, byKeyCode: {} },
          },
        }),
      ),
    ).toEqual(['profiles[0].context.pause: unknown field']);
  });

  it('accepts keyCodes 1…999999 and gamepad buttons 0…31 only', () => {
    const keyCodes = (key: string) =>
      issuesOf(
        remote({
          context: {
            game: { byCode: {}, byKeyCode: { ...GAME_KEYS, [key]: ['Shot'] } },
            menu: { byCode: {}, byKeyCode: MENU_KEYS },
          },
        }),
      );
    expect(keyCodes('1')).toEqual([]);
    expect(keyCodes('999999')).toEqual([]);
    for (const bad of ['0', '1000000', '-1', '1.5', ' 13', 'x13']) {
      expect(keyCodes(bad), bad).toHaveLength(1);
    }
    const buttons = (index: string) =>
      issuesOf(
        gamepad({
          context: {
            game: {
              byCode: {},
              byKeyCode: {},
              buttons: { ...DPAD, '9': ['Pause'], [index]: ['Shot', 'Pause'] },
            },
            menu: {
              byCode: {},
              byKeyCode: {},
              buttons: { ...DPAD, '0': ['Confirm'], '1': ['Back'] },
            },
          },
        }),
      );
    for (const good of ['0', '9', '10', '19', '20', '29', '30', '31']) {
      expect(buttons(good), good).toEqual([]);
    }
    for (const bad of ['32', '40', '01', '-1', 'A']) expect(buttons(bad), bad).toHaveLength(1);
  });

  it('checks KeyboardEvent.code names (letters then letters/digits)', () => {
    const codes = (code: string) =>
      issuesOf(
        remote({
          context: {
            game: { byCode: { [code]: ['Shot'] }, byKeyCode: GAME_KEYS },
            menu: { byCode: {}, byKeyCode: MENU_KEYS },
          },
        }),
      );
    for (const good of ['KeyZ', 'F12', 'Digit1', 'NumpadEnter', 'constructor']) {
      expect(codes(good), good).toEqual([]);
    }
    for (const bad of ['1Key', 'Key-Z', 'Key Z', '_x', '__proto__']) {
      expect(codes(bad), bad).toHaveLength(1);
    }
  });

  it('limits register to 32 well-formed key names', () => {
    const names = Array.from({ length: 32 }, (_, i) => `Key${String(i)}`);
    expect(issuesOf(remote({ register: names }))).toEqual([]);
    expect(issuesOf(remote({ register: [...names, 'OneMore'] }))).toEqual([
      'profiles[0].register: must have at most 32 items',
    ]);
    expect(issuesOf(remote({ register: ['Media Play'] }))).toHaveLength(1);
    expect(issuesOf(remote({ register: [''] }))).toHaveLength(1);
    expect(issuesOf(remote({ register: ['K'.repeat(41)] }))).toHaveLength(1);
  });

  it('rejects files that are not objects or lack a profile list', () => {
    for (const body of [null, 42, 'text', undefined]) {
      expect(parseInputProfiles(body).issues).toEqual([{ path: '', message: 'must be an object' }]);
    }
    expect(parseInputProfiles({ formatVersion: 1, kind: 'input-profiles' }).issues).toEqual([
      { path: 'profiles', message: 'is required' },
    ]);
    expect(
      parseInputProfiles({ formatVersion: 1, kind: 'input-profiles', profiles: {} }).issues,
    ).toEqual([{ path: 'profiles', message: 'must be an array' }]);
  });

  it('a schema error anywhere in the file drops every profile of that file', () => {
    const { profiles, issues } = parseInputProfiles(file(remote(), gamepad({ diagonals: 'nope' })));
    expect(profiles).toEqual([]);
    expect(issues).toHaveLength(1);
  });
});

describe('input-web/rebind semantic checks', () => {
  it('counts actions bound by code and by keyCode together for the required list', () => {
    const entry = remote({
      device: 'keyboard',
      context: {
        game: {
          byCode: { ArrowUp: ['Up'], ArrowDown: ['Down'] },
          byKeyCode: { '37': ['Left'], '39': ['Right'], '80': ['Pause'] },
        },
        menu: {
          byCode: { Enter: ['Confirm', 'Up'] },
          byKeyCode: { '40': ['Down'], '37': ['Left'], '39': ['Right'], '8': ['Back'] },
        },
      },
    });
    expect(issuesOf(entry)).toEqual([]);
  });

  it('a key profile with an empty buttons table is still rejected', () => {
    const entry = remote();
    (entry['context'] as { game: Record<string, unknown> }).game['buttons'] = {};
    expect(issuesOf(entry)).toEqual([
      'profiles[0].context.game.buttons: only gamepad profiles bind buttons',
    ]);
  });

  it('a gamepad profile without any buttons reports both contexts and every missing action', () => {
    const entry = gamepad({
      context: { game: { byCode: {}, byKeyCode: {} }, menu: { byCode: {}, byKeyCode: {} } },
    });
    expect(issuesOf(entry)).toEqual([
      'profiles[0].context.game.buttons: is required for a gamepad profile',
      'profiles[0].context.game: must bind Up, Down, Left, Right, Pause',
      'profiles[0].context.menu.buttons: is required for a gamepad profile',
      'profiles[0].context.menu: must bind Up, Down, Left, Right, Confirm, Back',
    ]);
  });

  it('a keyboard profile may not register keys, even harmless ones', () => {
    expect(issuesOf(remote({ device: 'keyboard', register: ['MediaPlayPause'] }))).toEqual([
      'profiles[0].register: only remote profiles register keys',
    ]);
  });

  it('reports every system key of a register list, with its index', () => {
    expect(issuesOf(remote({ register: [...SYSTEM_REMOTE_KEYS] }))).toEqual(
      SYSTEM_REMOTE_KEYS.map(
        (name, i) =>
          `profiles[0].register[${String(i)}]: "${name}" is a system key and must never be registered`,
      ),
    );
    // Key names are case-sensitive; only the exact system names are refused.
    expect(issuesOf(remote({ register: ['exit', 'VolumeUP'] }))).toEqual([]);
  });

  it('a dropped profile does not claim its id: a later valid one with the same id is kept', () => {
    const bad = remote({ register: ['Exit'] });
    const good = remote({ label: 'GOOD' });
    const { profiles, issues } = parseInputProfiles(file(bad, good));
    expect(profiles.map((p) => p.label)).toEqual(['GOOD']);
    expect(issues.map((issue) => issue.path)).toEqual(['profiles[0].register[0]']);
  });

  it('a duplicate that is also invalid reports its own problems, not the duplicate', () => {
    const { issues } = parseInputProfiles(file(remote(), remote({ register: ['VolumeMute'] })));
    expect(issues).toEqual([
      {
        path: 'profiles[1].register[0]',
        message: '"VolumeMute" is a system key and must never be registered',
      },
    ]);
  });
});

describe('input-web/rebind compiled tables', () => {
  it('are prototype-free, frozen and list the other context’s keys with mask 0', () => {
    const profile = compiled(
      remote({
        context: {
          game: { byCode: { KeyZ: ['Shot'] }, byKeyCode: { ...GAME_KEYS, '427': ['Special'] } },
          menu: { byCode: { KeyX: ['Back'] }, byKeyCode: { ...MENU_KEYS } },
        },
      }),
    );
    const { game, menu } = profile.tables;
    for (const tables of [game, menu]) {
      expect(Object.getPrototypeOf(tables.keys.byCode)).toBeNull();
      expect(Object.getPrototypeOf(tables.keys.byKeyCode)).toBeNull();
      expect(Object.isFrozen(tables)).toBe(true);
      expect(Object.isFrozen(tables.keys)).toBe(true);
      expect(Object.isFrozen(tables.keys.byCode)).toBe(true);
      expect(tables.buttons).toEqual([]);
    }
    expect({ ...game.keys.byCode }).toEqual({ KeyX: 0, KeyZ: Action.Shot });
    expect({ ...menu.keys.byCode }).toEqual({ KeyZ: 0, KeyX: Action.Back });
    expect(game.keys.byKeyCode[13]).toBe(0); // OK is Confirm in menus only
    expect(menu.keys.byKeyCode[427]).toBe(0);
    expect(game.keys.byKeyCode[427]).toBe(Action.Special);
    // No inherited names leak in: `toString` is not a key of a compiled table.
    expect(findKeyActions('toString', 0, game.keys)).toBe(-1);
  });

  it('ORs multi-action lists and tolerates repeated names', () => {
    const profile = compiled(
      remote({
        context: {
          game: { byCode: {}, byKeyCode: { ...GAME_KEYS, '13': ['PowerUp', 'Shot', 'PowerUp'] } },
          menu: { byCode: {}, byKeyCode: MENU_KEYS },
        },
      }),
    );
    expect(profile.tables.game.keys.byKeyCode[13]).toBe(Action.PowerUp | Action.Shot);
  });

  it('button tables run to the highest bound index, with 0 in the gaps', () => {
    const profile = compiled(
      gamepad({
        context: {
          game: { byCode: {}, byKeyCode: {}, buttons: { ...DPAD, '31': ['Pause'] } },
          menu: {
            byCode: {},
            byKeyCode: {},
            buttons: { ...DPAD, '0': ['Confirm'], '1': ['Back'] },
          },
        },
      }),
    );
    const game = profile.tables.game.buttons;
    expect(game).toHaveLength(32);
    expect(game[31]).toBe(Action.Pause);
    expect(game.slice(0, 12)).toEqual(new Array(12).fill(0));
    expect(game.slice(16, 31)).toEqual(new Array(15).fill(0));
    expect(profile.tables.menu.buttons).toHaveLength(16);
    expect(Object.isFrozen(game)).toBe(true);
    // Gamepad key tables are empty: pads never reach the keyboard source.
    expect(Object.keys(profile.tables.game.keys.byCode)).toEqual([]);
    expect(Object.keys(profile.tables.game.keys.byKeyCode)).toEqual([]);
  });

  it('keeps the bindings as written next to the tables and copies the tuning', () => {
    const entry = remote({ diagonals: 'firstWins', socd: 'lastWins', register: ['ChannelUp'] });
    const profile = compiled(entry);
    expect(profile.context).toEqual(entry['context']);
    expect(profile).toMatchObject({
      id: 'edge-remote',
      label: 'EDGE',
      device: 'remote',
      releaseDebounceTicks: 2,
      diagonals: 'firstWins',
      socd: 'lastWins',
      register: ['ChannelUp'],
    });
  });

  // Regression (M1-05 tests): the `0` placeholder a context gets for a code bound only in the
  // other context used to shadow this context's own keyCode binding of the same key — a profile
  // binding `Enter` by code in the game and keyCode 13 (OK) in menus left OK dead in menus.
  it('a placeholder for the other context’s code never hides this context’s keyCode binding', () => {
    const profile = compiled(
      remote({
        context: {
          game: { byCode: { Enter: ['PowerUp'] }, byKeyCode: { ...GAME_KEYS } },
          menu: { byCode: {}, byKeyCode: { ...MENU_KEYS } },
        },
      }),
    );
    // Desktop Enter / a TV OK key that reports code "Enter": keyCode 13 → Confirm in menus.
    expect(findKeyActions('Enter', 13, profile.tables.menu.keys)).toBe(Action.Confirm);
    expect(findKeyActions('Enter', 13, profile.tables.game.keys)).toBe(Action.PowerUp);
    expect(findKeyActions('', 13, profile.tables.game.keys)).toBe(0);
    // The other way round: code bound in menus only, keyCode in the game.
    const swapped = compiled(
      remote({
        context: {
          game: { byCode: {}, byKeyCode: { ...GAME_KEYS, '13': ['PowerUp'] } },
          menu: { byCode: { Enter: ['Confirm'] }, byKeyCode: { ...MENU_KEYS } },
        },
      }),
    );
    expect(findKeyActions('Enter', 13, swapped.tables.game.keys)).toBe(Action.PowerUp);
    // A placeholder with no keyCode binding behind it still marks the key as known (0, not -1).
    expect(findKeyActions('Enter', 999, swapped.tables.game.keys)).toBe(0);
  });
});

describe('input-web/rebind loadInputProfiles', () => {
  const a: ContentFile = { path: 'input/a.input-profiles.json', data: file(remote({ id: 'a' })) };
  const b: ContentFile = {
    path: 'input/b.input-profiles.json',
    data: file(gamepad({ id: 'b' }), remote({ id: 'a', label: 'LATER' })),
  };

  it('gives the same result whatever order the files are listed in', () => {
    const forward = loadInputProfiles([a, b]);
    const backward = loadInputProfiles([b, a]);
    expect(backward).toEqual(forward);
    expect(forward.profiles.map((p) => `${p.id}:${p.label}`)).toEqual(['a:EDGE', 'b:PAD']);
    expect(forward.issues).toEqual([
      {
        path: 'input/b.input-profiles.json:profiles[1].id',
        message: 'duplicate input profile id "a" (first defined in input/a.input-profiles.json)',
      },
    ]);
  });

  it('never reorders the caller’s list and accepts an empty one', () => {
    const list = [b, a];
    loadInputProfiles(list);
    expect(list).toEqual([b, a]);
    expect(loadInputProfiles([])).toEqual({ profiles: [], issues: [] });
  });

  it('reports a file of another kind and keeps the others', () => {
    const result = loadInputProfiles([
      a,
      { path: 'input/x.input-profiles.json', data: { formatVersion: 1, kind: 'fx', profiles: [] } },
    ]);
    expect(result.profiles.map((p) => p.id)).toEqual(['a']);
    expect(result.issues.map((issue) => issue.path)).toEqual([
      'input/x.input-profiles.json:kind',
      'input/x.input-profiles.json:profiles',
    ]);
  });

  it('prefixes a whole-file problem with the bare file path', () => {
    expect(loadInputProfiles([{ path: 'input/x.json', data: [] }]).issues).toEqual([
      { path: 'input/x.json', message: 'must be an object' },
    ]);
  });
});

describe('input-web/rebind registry', () => {
  it('replaces its profiles and issues on every load', () => {
    const registry = createInputProfileRegistry();
    expect(registry.issues).toEqual([]);
    expect(registry.get('edge-remote')).toBeNull();
    registry.load([{ path: 'a.json', data: file(remote()) }]);
    const first = registry.get('edge-remote');
    expect(first?.label).toBe('EDGE');
    registry.load([{ path: 'b.json', data: file(remote({ label: 'NEW' }), gamepad()) }]);
    expect(registry.get('edge-remote')?.label).toBe('NEW');
    expect(registry.get('edge-pad')?.device).toBe('gamepad');
    expect(registry.get('edge-remote')).not.toBe(first);
    registry.load([]);
    expect(registry.profiles).toEqual([]);
    expect(registry.get('edge-pad')).toBeNull();
  });

  it('keeps the valid profiles of a load that also had issues', () => {
    const registry = createInputProfileRegistry();
    const issues = registry.load([
      { path: 'a.json', data: file(remote(), remote({ id: 'bad', register: ['Exit'] })) },
    ]);
    expect(issues).toHaveLength(1);
    expect(registry.issues).toBe(issues);
    expect(registry.profiles.map((p) => p.id)).toEqual(['edge-remote']);
    expect(registry.get('bad')).toBeNull();
  });

  it('two registries are independent', () => {
    const one = createInputProfileRegistry();
    const two = createInputProfileRegistry();
    one.load([{ path: 'a.json', data: file(remote()) }]);
    expect(two.profiles).toEqual([]);
  });
});

describe('input-web/rebind chooseInputProfile', () => {
  const { profiles } = parseInputProfiles(
    file(remote({ id: 'r' }), remote({ id: 'k', device: 'keyboard' }), gamepad({ id: 'p' })),
  );

  it('walks the candidates in priority order, skipping holes, unknown ids and other devices', () => {
    expect(chooseInputProfile(profiles, ['p', 'k', 'r'], KEY_PROFILE_DEVICES)?.id).toBe('k');
    expect(chooseInputProfile(profiles, ['r', 'k'], KEY_PROFILE_DEVICES)?.id).toBe('r');
    expect(chooseInputProfile(profiles, [undefined, null, '', 'zzz', 'r'], ['remote'])?.id).toBe(
      'r',
    );
    expect(chooseInputProfile(profiles, ['k'], ['remote'])).toBeNull();
    expect(chooseInputProfile(profiles, ['p'], [])).toBeNull();
    expect(chooseInputProfile(profiles, [], INPUT_PROFILE_DEVICES)).toBeNull();
  });

  it('returns the very profile object (no copy)', () => {
    expect(chooseInputProfile(profiles, ['p'], ['gamepad'])).toBe(profiles[2]);
  });
});

describe('input-web/rebind overrideInputTuning', () => {
  const base = compiled(remote({ releaseDebounceTicks: 3, diagonals: 'combine', socd: 'neutral' }));

  it('floors and clamps the debounce; non-finite values give 0', () => {
    expect(overrideInputTuning(base, { releaseDebounceTicks: 2.9 }).releaseDebounceTicks).toBe(2);
    expect(overrideInputTuning(base, { releaseDebounceTicks: 10 }).releaseDebounceTicks).toBe(10);
    expect(overrideInputTuning(base, { releaseDebounceTicks: 10.5 }).releaseDebounceTicks).toBe(10);
    expect(
      overrideInputTuning(base, { releaseDebounceTicks: Number.NaN }).releaseDebounceTicks,
    ).toBe(0);
    expect(
      overrideInputTuning(base, { releaseDebounceTicks: Number.POSITIVE_INFINITY })
        .releaseDebounceTicks,
    ).toBe(0);
  });

  it('replaces only the given policies and returns a new frozen object', () => {
    const next = overrideInputTuning(base, { socd: 'lastWins' });
    expect(next).not.toBe(base);
    expect(Object.isFrozen(next)).toBe(true);
    expect(next).toMatchObject({ releaseDebounceTicks: 3, diagonals: 'combine', socd: 'lastWins' });
    expect(next.context).toBe(base.context);
    expect(next.register).toBe(base.register);
    expect(base.socd).toBe('neutral');
    const all = overrideInputTuning(next, {
      releaseDebounceTicks: 0,
      diagonals: 'firstWins',
      socd: 'neutral',
    });
    expect(all).toMatchObject({ releaseDebounceTicks: 0, diagonals: 'firstWins', socd: 'neutral' });
  });

  it('keeps a gamepad at 0 even without a debounce override', () => {
    const pad = compiled(gamepad());
    expect(overrideInputTuning(pad, { diagonals: 'lastWins' })).toMatchObject({
      releaseDebounceTicks: 0,
      diagonals: 'lastWins',
    });
  });
});

describe('input-web/rebind persistence hook', () => {
  it('treats non-string saved values (a misbehaving adapter) as no choice', async () => {
    for (const value of [42, true, { id: 'x' }, ['x'], null, undefined]) {
      const storage = {
        get: () => Promise.resolve(value),
        set: () => Promise.resolve(),
      } as unknown as PlatformStorage;
      expect(await loadInputProfileChoice(storage), JSON.stringify(value)).toBeNull();
    }
  });

  it('reads and writes exactly the input.profile key', async () => {
    const calls: string[] = [];
    const storage: PlatformStorage = {
      get: (key) => {
        calls.push(`get ${key}`);
        return Promise.resolve('keyboard-default');
      },
      set: (key, value) => {
        calls.push(`set ${key}=${String(value)}`);
        return Promise.resolve();
      },
    };
    expect(await loadInputProfileChoice(storage)).toBe('keyboard-default');
    await saveInputProfileChoice(storage, 'tizen-remote-safe');
    expect(calls).toEqual(['get input.profile', 'set input.profile=tizen-remote-safe']);
  });

  it('does not validate the saved id (the caller picks among the loaded profiles)', async () => {
    const storage = createMemoryStorage();
    await saveInputProfileChoice(storage, 'no-such-profile');
    expect(await loadInputProfileChoice(storage)).toBe('no-such-profile');
  });
});
