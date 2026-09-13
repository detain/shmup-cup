/**
 * `rebind`: input profile validation (core schema combinators + semantic checks), compiled
 * context tables, the shipped profiles of `content/input/`, the registry, profile choice,
 * tuning overrides and the persistence hook.
 */
import { readFileSync } from 'node:fs';
import {
  ACTION_NAMES,
  Action,
  createMemoryStorage,
  type ActionName,
  type ContentFile,
} from '@shmup/core';
import { describe, expect, it } from 'vitest';
import * as inputWeb from '../../src/index.js';
import { findKeyActions } from '../../src/keymap/index.js';
import {
  DEFAULT_GAMEPAD_PROFILE_ID,
  DEFAULT_KEYBOARD_PROFILE_ID,
  DEFAULT_REMOTE_PROFILE_ID,
  INPUT_PROFILE_STORAGE_KEY,
  KEY_PROFILE_DEVICES,
  REQUIRED_CONTEXT_ACTIONS,
  chooseInputProfile,
  createInputProfileRegistry,
  loadInputProfileChoice,
  loadInputProfiles,
  moduleInfo,
  overrideInputTuning,
  parseInputProfiles,
  saveInputProfileChoice,
  type InputProfile,
  type ProfileBindings,
} from '../../src/rebind/index.js';

const SHIPPED_PATH = 'input/remote.input-profiles.json';
const shipped: ContentFile = {
  path: SHIPPED_PATH,
  data: JSON.parse(
    readFileSync(new URL(`../../../../content/${SHIPPED_PATH}`, import.meta.url), 'utf8'),
  ) as unknown,
};

/** A minimal valid remote profile entry (tests mutate copies of it). */
function remoteEntry(): Record<string, unknown> {
  return {
    id: 'test-remote',
    label: 'TEST',
    device: 'remote',
    context: {
      game: {
        byCode: {},
        byKeyCode: {
          '13': ['PowerUp'],
          '37': ['Left'],
          '38': ['Up'],
          '39': ['Right'],
          '40': ['Down'],
          '10009': ['Pause'],
        },
      },
      menu: {
        byCode: {},
        byKeyCode: {
          '13': ['Confirm'],
          '37': ['Left'],
          '38': ['Up'],
          '39': ['Right'],
          '40': ['Down'],
          '10009': ['Back'],
        },
      },
    },
    releaseDebounceTicks: 2,
    diagonals: 'combine',
    socd: 'neutral',
    register: ['MediaPlayPause'],
  };
}

/** A minimal valid gamepad profile entry. */
function padEntry(): Record<string, unknown> {
  const dirs = { '12': ['Up'], '13': ['Down'], '14': ['Left'], '15': ['Right'] };
  return {
    id: 'test-pad',
    label: 'PAD',
    device: 'gamepad',
    context: {
      game: { byCode: {}, byKeyCode: {}, buttons: { ...dirs, '0': ['Shot'], '9': ['Pause'] } },
      menu: { byCode: {}, byKeyCode: {}, buttons: { ...dirs, '0': ['Confirm'], '1': ['Back'] } },
    },
    releaseDebounceTicks: 0,
    diagonals: 'combine',
    socd: 'neutral',
    register: [],
  };
}

/**
 * Wraps profile entries in a file body.
 *
 * @param profiles - Entries.
 */
const file = (...profiles: unknown[]) => ({ formatVersion: 1, kind: 'input-profiles', profiles });

/**
 * ORs action names.
 *
 * @param names - Action names.
 */
const mask = (names: readonly ActionName[]): number =>
  names.reduce((bits, name) => bits | Action[name], 0);

describe('input-web/rebind', () => {
  it('describes itself and is exported from the package entry', () => {
    expect(moduleInfo.name).toBe('rebind');
    expect(moduleInfo.status).toBe('partial');
    expect(inputWeb.parseInputProfiles).toBe(parseInputProfiles);
    expect(inputWeb.createInputProfileRegistry).toBe(createInputProfileRegistry);
  });
});

describe('input-web/rebind the shipped profiles (content/input)', () => {
  const { profiles, issues } = loadInputProfiles([shipped]);
  const byId = (id: string): InputProfile => {
    const profile = profiles.find((p) => p.id === id);
    if (profile === undefined) throw new Error(`missing profile ${id}`);
    return profile;
  };

  it('validate without a single issue and contain the six planned profiles', () => {
    expect(issues).toEqual([]);
    expect(profiles.map((p) => p.id)).toEqual([
      'tizen-remote-safe',
      'tizen-remote-diagonal',
      'keyboard-default',
      'keyboard-remote-emulation',
      'keyboard-split', // M2-06
      'gamepad-standard',
    ]);
    for (const id of [DEFAULT_KEYBOARD_PROFILE_ID, DEFAULT_REMOTE_PROFILE_ID]) {
      expect(KEY_PROFILE_DEVICES).toContain(byId(id).device);
    }
    expect(byId(DEFAULT_GAMEPAD_PROFILE_ID).device).toBe('gamepad');
  });

  it('follow decision D14: the safe remote debounces 2 ticks, combines, registers Play/Pause and Ch±', () => {
    const safe = byId('tizen-remote-safe');
    expect(safe).toMatchObject({ device: 'remote', releaseDebounceTicks: 2, diagonals: 'combine' });
    expect(safe.register).toEqual(['MediaPlayPause', 'ChannelUp', 'ChannelDown']);
    expect(byId('tizen-remote-diagonal')).toMatchObject({ releaseDebounceTicks: 0 });
    expect(byId('keyboard-remote-emulation')).toMatchObject({
      diagonals: 'lastWins',
      socd: 'lastWins',
    });
  });

  it('resolve every action they name, in both contexts', () => {
    for (const profile of profiles) {
      for (const context of ['game', 'menu'] as const) {
        const bindings: ProfileBindings = profile.context[context];
        const tables = profile.tables[context];
        for (const [code, names] of Object.entries(bindings.byCode)) {
          for (const name of names) expect(ACTION_NAMES).toContain(name);
          expect(findKeyActions(code, 0, tables.keys), `${profile.id}.${context}.${code}`).toBe(
            mask(names),
          );
        }
        for (const [keyCode, names] of Object.entries(bindings.byKeyCode)) {
          expect(findKeyActions('', Number(keyCode), tables.keys)).toBe(mask(names));
        }
        for (const [button, names] of Object.entries(bindings.buttons ?? {})) {
          expect(tables.buttons[Number(button)]).toBe(mask(names));
        }
        let bound = 0;
        for (const value of Object.values(tables.keys.byCode)) bound |= value;
        for (const value of Object.values(tables.keys.byKeyCode)) bound |= value;
        for (const value of tables.buttons) bound |= value;
        expect(bound & mask(REQUIRED_CONTEXT_ACTIONS[context])).toBe(
          mask(REQUIRED_CONTEXT_ACTIONS[context]),
        );
      }
    }
  });

  it('separate game and menu tables end the old action collisions (D15)', () => {
    const keyboard = byId('keyboard-default').tables;
    expect(findKeyActions('KeyX', 88, keyboard.game.keys)).toBe(Action.Sub);
    expect(findKeyActions('KeyX', 88, keyboard.menu.keys)).toBe(Action.Back);
    expect(findKeyActions('KeyZ', 90, keyboard.game.keys)).toBe(Action.Shot);
    expect(findKeyActions('KeyZ', 90, keyboard.menu.keys)).toBe(Action.Confirm);
    const remote = byId('tizen-remote-safe').tables;
    expect(findKeyActions('', 13, remote.game.keys)).toBe(Action.PowerUp);
    expect(findKeyActions('', 13, remote.menu.keys)).toBe(Action.Confirm);
    expect(findKeyActions('', 10009, remote.game.keys)).toBe(Action.Pause);
    expect(findKeyActions('', 10009, remote.menu.keys)).toBe(Action.Back);
    // A desktop keyboard's Enter (code bound nowhere) falls back to keyCode 13 = OK.
    expect(findKeyActions('Enter', 13, remote.game.keys)).toBe(Action.PowerUp);
    const pad = byId('gamepad-standard').tables;
    expect(pad.game.buttons[0]).toBe(Action.Shot);
    expect(pad.menu.buttons[0]).toBe(Action.Confirm);
  });

  it('list keys of the other context with mask 0, so they stay bound in every context', () => {
    const remote = byId('tizen-remote-safe').tables;
    expect(findKeyActions('', 427, remote.game.keys)).toBe(Action.Special);
    expect(findKeyActions('', 427, remote.menu.keys)).toBe(0); // Ch+ does nothing in menus
    expect(findKeyActions('', 999, remote.menu.keys)).toBe(-1); // unknown key
    const keyboard = byId('keyboard-default').tables;
    expect(findKeyActions('KeyC', 67, keyboard.menu.keys)).toBe(0);
  });

  it('are frozen', () => {
    const safe = byId('tizen-remote-safe');
    expect(Object.isFrozen(safe)).toBe(true);
    expect(Object.isFrozen(safe.tables.game.keys.byKeyCode)).toBe(true);
    expect(Object.isFrozen(safe.tables.menu.buttons)).toBe(true);
  });
});

describe('input-web/rebind parseInputProfiles validation', () => {
  it('accepts a minimal remote and gamepad profile', () => {
    const { profiles, issues } = parseInputProfiles(file(remoteEntry(), padEntry()), 'x.json');
    expect(issues).toEqual([]);
    expect(profiles.map((p) => p.id)).toEqual(['test-remote', 'test-pad']);
    expect(profiles[1]?.tables.game.buttons).toEqual([
      Action.Shot,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      Action.Pause,
      0,
      0,
      Action.Up,
      Action.Down,
      Action.Left,
      Action.Right,
    ]);
  });

  it('reports header and schema problems with file-prefixed JSON paths', () => {
    const bad = remoteEntry();
    bad['diagonals'] = 'sideways';
    bad['releaseDebounceTicks'] = 11;
    bad['extra'] = true;
    (bad['context'] as { game: { byKeyCode: Record<string, unknown> } }).game.byKeyCode['38'] = [
      'Jump',
    ];
    const { profiles, issues } = parseInputProfiles(
      { formatVersion: 2, kind: 'input-profiles', profiles: [bad] },
      'input/x.input-profiles.json',
    );
    expect(profiles).toEqual([]);
    expect(issues).toEqual([
      { path: 'input/x.input-profiles.json:formatVersion', message: 'must be an integer in 1..1' },
      {
        path: 'input/x.input-profiles.json:profiles[0].context.game.byKeyCode.38[0]',
        message: `must be one of: ${ACTION_NAMES.join(', ')}`,
      },
      {
        path: 'input/x.input-profiles.json:profiles[0].releaseDebounceTicks',
        message: 'must be an integer in 0..10',
      },
      {
        path: 'input/x.input-profiles.json:profiles[0].diagonals',
        message: 'must be one of: combine, lastWins, firstWins',
      },
      { path: 'input/x.input-profiles.json:profiles[0].extra', message: 'unknown field' },
    ]);
  });

  it('rejects bad key names, empty action lists, the wrong kind and a bare document', () => {
    const bad = remoteEntry();
    const game = (bad['context'] as { game: ProfileBindings }).game as unknown as {
      byCode: Record<string, unknown>;
      byKeyCode: Record<string, unknown>;
    };
    game.byCode['1Bad'] = ['Up'];
    game.byKeyCode['013'] = ['Up'];
    game.byKeyCode['40'] = [];
    const { issues } = parseInputProfiles(file(bad));
    expect(issues.map((issue) => issue.path)).toEqual([
      'profiles[0].context.game.byCode.1Bad',
      'profiles[0].context.game.byKeyCode.40',
      'profiles[0].context.game.byKeyCode.013',
    ]);
    expect(parseInputProfiles({ formatVersion: 1, kind: 'player', profiles: [] }).issues).toEqual([
      { path: 'kind', message: 'must be one of: input-profiles' },
      { path: 'profiles', message: 'must have at least 1 items' },
    ]);
    expect(parseInputProfiles([]).issues).toEqual([{ path: '', message: 'must be an object' }]);
  });

  it('requires the game directions + Pause and full menu navigation', () => {
    const bad = remoteEntry();
    const context = bad['context'] as {
      game: { byKeyCode: Record<string, unknown> };
      menu: { byKeyCode: Record<string, unknown> };
    };
    delete context.game.byKeyCode['10009'];
    delete context.menu.byKeyCode['13'];
    delete context.menu.byKeyCode['10009'];
    const { profiles, issues } = parseInputProfiles(file(bad, padEntry()));
    expect(issues).toEqual([
      { path: 'profiles[0].context.game', message: 'must bind Pause' },
      { path: 'profiles[0].context.menu', message: 'must bind Confirm, Back' },
    ]);
    expect(profiles.map((p) => p.id)).toEqual(['test-pad']); // the bad profile is dropped
  });

  it('keeps buttons to gamepads and keys to keyboards and remotes', () => {
    const remote = remoteEntry();
    (remote['context'] as { game: Record<string, unknown> }).game['buttons'] = { '0': ['Shot'] };
    const pad = padEntry();
    const padContext = pad['context'] as {
      game: { byCode: Record<string, unknown> };
      menu: Record<string, unknown>;
    };
    padContext.game.byCode['KeyZ'] = ['Shot'];
    delete padContext.menu['buttons'];
    pad['releaseDebounceTicks'] = 2;
    const { issues } = parseInputProfiles(file(remote, pad));
    expect(issues).toEqual([
      { path: 'profiles[0].context.game.buttons', message: 'only gamepad profiles bind buttons' },
      {
        path: 'profiles[1].context.game',
        message: 'a gamepad profile binds buttons only (byCode and byKeyCode must be empty)',
      },
      { path: 'profiles[1].context.menu.buttons', message: 'is required for a gamepad profile' },
      {
        path: 'profiles[1].context.menu',
        message: 'must bind Up, Down, Left, Right, Confirm, Back',
      },
      {
        path: 'profiles[1].releaseDebounceTicks',
        message: 'must be 0 for a gamepad profile (gamepads are polled, not event-driven)',
      },
    ]);
  });

  it('never registers system keys, and only remote profiles register at all', () => {
    const remote = remoteEntry();
    remote['register'] = ['MediaPlayPause', 'Exit', 'VolumeUp'];
    const pad = padEntry();
    pad['register'] = ['ChannelUp'];
    const { issues } = parseInputProfiles(file(remote, pad));
    expect(issues).toEqual([
      {
        path: 'profiles[0].register[1]',
        message: '"Exit" is a system key and must never be registered',
      },
      {
        path: 'profiles[0].register[2]',
        message: '"VolumeUp" is a system key and must never be registered',
      },
      { path: 'profiles[1].register', message: 'only remote profiles register keys' },
    ]);
  });

  it('reports duplicate ids within a file and across files (first definition wins)', () => {
    const dup = remoteEntry();
    dup['label'] = 'SECOND';
    expect(parseInputProfiles(file(remoteEntry(), dup), 'a.json').issues).toEqual([
      {
        path: 'a.json:profiles[1].id',
        message: 'duplicate input profile id "test-remote" (first defined in a.json)',
      },
    ]);
    const result = loadInputProfiles([
      { path: 'b/second.json', data: file(dup) },
      { path: 'a/first.json', data: file(remoteEntry()) },
    ]);
    expect(result.profiles.map((p) => p.label)).toEqual(['TEST']);
    expect(result.issues).toEqual([
      {
        path: 'b/second.json:profiles[0].id',
        message: 'duplicate input profile id "test-remote" (first defined in a/first.json)',
      },
    ]);
    expect(parseInputProfiles(file(remoteEntry(), dup)).issues[0]?.message).toBe(
      'duplicate input profile id "test-remote"',
    );
  });

  it('never mutates its input', () => {
    const body = file(remoteEntry());
    const before = JSON.stringify(body);
    parseInputProfiles(body);
    expect(JSON.stringify(body)).toBe(before);
  });
});

describe('input-web/rebind registry, choice, overrides, persistence', () => {
  it('the registry keeps what its content-owner load parsed', () => {
    const registry = createInputProfileRegistry();
    expect(registry.profiles).toEqual([]);
    const load = registry.load; // passed unbound as a content owner
    expect(load([shipped])).toEqual([]);
    expect(registry.profiles).toHaveLength(6);
    expect(registry.get('gamepad-standard')?.device).toBe('gamepad');
    expect(registry.get('nope')).toBeNull();
    expect(load([{ path: 'x.json', data: file() }])).toEqual([
      { path: 'x.json:profiles', message: 'must have at least 1 items' },
    ]);
    expect(registry.issues).toHaveLength(1);
    expect(registry.profiles).toEqual([]);
  });

  it('chooseInputProfile takes the first candidate that exists for the device', () => {
    const { profiles } = loadInputProfiles([shipped]);
    expect(
      chooseInputProfile(
        profiles,
        [null, 'nope', 'gamepad-standard', 'keyboard-default'],
        KEY_PROFILE_DEVICES,
      )?.id,
    ).toBe('keyboard-default');
    expect(chooseInputProfile(profiles, ['gamepad-standard'], ['gamepad'])?.id).toBe(
      'gamepad-standard',
    );
    expect(chooseInputProfile(profiles, [undefined], KEY_PROFILE_DEVICES)).toBeNull();
    expect(chooseInputProfile([], ['keyboard-default'], KEY_PROFILE_DEVICES)).toBeNull();
  });

  it('overrideInputTuning copies a profile with clamped tuning (never debouncing gamepads)', () => {
    const { profiles } = loadInputProfiles([shipped]);
    const safe = profiles[0];
    const fast = overrideInputTuning(safe, { releaseDebounceTicks: 0, diagonals: 'lastWins' });
    expect(fast).toMatchObject({ id: safe.id, releaseDebounceTicks: 0, diagonals: 'lastWins' });
    expect(fast.socd).toBe(safe.socd);
    expect(fast.tables).toBe(safe.tables);
    expect(safe.releaseDebounceTicks).toBe(2);
    expect(overrideInputTuning(safe, { releaseDebounceTicks: 99 }).releaseDebounceTicks).toBe(10);
    expect(overrideInputTuning(safe, { releaseDebounceTicks: -1 }).releaseDebounceTicks).toBe(0);
    expect(overrideInputTuning(safe, {}).releaseDebounceTicks).toBe(2);
    const pad = profiles.find((p) => p.device === 'gamepad') as InputProfile;
    expect(overrideInputTuning(pad, { releaseDebounceTicks: 3 }).releaseDebounceTicks).toBe(0);
  });

  it('saves and loads the profile choice through Platform.storage', async () => {
    const storage = createMemoryStorage();
    expect(await loadInputProfileChoice(storage)).toBeNull();
    await saveInputProfileChoice(storage, 'keyboard-remote-emulation');
    expect(await storage.get(INPUT_PROFILE_STORAGE_KEY)).toBe('keyboard-remote-emulation');
    expect(await loadInputProfileChoice(storage)).toBe('keyboard-remote-emulation');
    await storage.set(INPUT_PROFILE_STORAGE_KEY, '');
    expect(await loadInputProfileChoice(storage)).toBeNull();
    const failing = {
      get: () => Promise.reject(new Error('denied')),
      set: () => Promise.resolve(),
    };
    expect(await loadInputProfileChoice(failing)).toBeNull();
  });
});
