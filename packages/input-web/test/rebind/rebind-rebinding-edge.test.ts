/**
 * `rebind` rebinding edge cases (plan M2-16 — "capture / conflict / reset tests, profile overrides
 * persisted and applied"; review round 2): a key named by its legacy key code is the same key as
 * its `code:` (letters, digits, numpad digits, F keys, punctuation), so conflict detection finds its
 * holder either way; a key with two actions loses both; an optional holder with nothing to take
 * back is left keyless; a reserved key is never given away in a swap; the merged override keeps at
 * most `MAX_ACTION_TOKENS` keys an action; outcomes that change nothing keep the overrides object;
 * results are frozen and inputs untouched; resets of a missing context; the overrides applied
 * (`applyBindingOverride`, `customizeInputProfile`: split halves kept, tuning clamped); conflicts
 * listed for rebindable actions only; captures that make no valid token; more key names.
 */
import { readFileSync } from 'node:fs';
import {
  Action,
  CONTENT_FORMAT_VERSION,
  MAX_ACTION_TOKENS,
  RebindStatus,
  resolveBindingOverrides,
  type BindingOverrides,
  type ContentFile,
} from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { findKeyActions } from '../../src/keymap/index.js';
import {
  actionTokens,
  applyBindingOverride,
  bindingKeysLabel,
  bindingTokenLabel,
  captureToken,
  customizeInputProfile,
  findBindingConflicts,
  loadInputProfiles,
  parseInputProfiles,
  rebindAction,
  resetBindings,
  type InputProfile,
} from '../../src/rebind/index.js';

const SHIPPED_PATH = 'input/remote.input-profiles.json';
const shipped: ContentFile = {
  path: SHIPPED_PATH,
  data: JSON.parse(
    readFileSync(new URL(`../../../../content/${SHIPPED_PATH}`, import.meta.url), 'utf8'),
  ) as unknown,
};
const { profiles } = loadInputProfiles([shipped]);

/**
 * A shipped profile.
 *
 * @param id - Its id.
 * @returns The profile.
 */
function profile(id: string): InputProfile {
  const found = profiles.find((p) => p.id === id);
  if (found === undefined) throw new Error(`no profile ${id}`);
  return found;
}

const KEYBOARD = profile('keyboard-default');
const REMOTE = profile('tizen-remote-safe');
const PAD = profile('gamepad-standard');
const SPLIT = profile('keyboard-split');
const NONE: BindingOverrides = Object.freeze({});

/** The menu table every test profile shares (arrows, Enter, Backspace). */
const MENU = {
  byCode: {
    ArrowUp: ['Up'],
    ArrowDown: ['Down'],
    ArrowLeft: ['Left'],
    ArrowRight: ['Right'],
    Enter: ['Confirm'],
    Backspace: ['Back'],
  },
  byKeyCode: {},
};

/**
 * A keyboard profile made for a test.
 *
 * @param id - Its id.
 * @param game - Its game table's `byCode` (the arrows and `KeyP` → Pause are added).
 * @returns The compiled profile.
 */
function lab(id: string, game: Record<string, string[]>): InputProfile {
  const { profiles: parsed, issues } = parseInputProfiles({
    formatVersion: CONTENT_FORMAT_VERSION,
    kind: 'input-profiles',
    profiles: [
      {
        id,
        label: id.toUpperCase(),
        device: 'keyboard',
        context: {
          game: {
            byCode: {
              ArrowUp: ['Up'],
              ArrowDown: ['Down'],
              ArrowLeft: ['Left'],
              ArrowRight: ['Right'],
              KeyP: ['Pause'],
              ...game,
            },
            byKeyCode: {},
          },
          menu: MENU,
        },
        releaseDebounceTicks: 0,
        diagonals: 'combine',
        socd: 'neutral',
        register: [],
      },
    ],
  });
  expect(issues).toEqual([]);
  const found = parsed[0];
  if (found === undefined) throw new Error(id);
  return found;
}

/** Digits, numpad, F keys and punctuation, one per action. */
const KEYS = lab('keys', {
  Digit1: ['Shot'],
  Numpad3: ['Sub'],
  F5: ['PowerUp'],
  Semicolon: ['Special'],
  Quote: ['Speed'],
});

describe('rebind rebinding (edge): one key, two token kinds', () => {
  it('finds the holder of a letter by its key code (key:90 is Z)', () => {
    const result = rebindAction(KEYBOARD, NONE, 'game', 'Sub', 'key:90');
    expect([result.status, result.other]).toEqual([RebindStatus.Moved, 'Shot']);
    const override = result.overrides['keyboard-default'];
    expect(override?.game).toEqual({ Shot: ['code:Space'], Sub: ['key:90'] });
    // Z now fires the missiles: its code entry has no action left, so its key code is reached.
    const keys = applyBindingOverride(KEYBOARD, override).tables.game.keys;
    expect(findKeyActions('KeyZ', 90, keys)).toBe(Action.Sub);
    expect(findKeyActions('Space', 32, keys)).toBe(Action.Shot);
  });

  it('knows the key codes of digits, numpad digits, F keys and punctuation', () => {
    const cases: Array<[string, string]> = [
      ['key:49', 'Shot'], // Digit1
      ['key:99', 'Sub'], // Numpad3 (96 + 3)
      ['key:116', 'PowerUp'], // F5 (111 + 5)
      ['key:186', 'Special'], // Semicolon
    ];
    for (const [token, holder] of cases) {
      const result = rebindAction(KEYS, NONE, 'game', 'Speed', token);
      expect([result.status, result.other], token).toEqual([RebindStatus.Swapped, holder]);
      // The holder had only that key: it takes Speed's old one (Quote).
      expect(result.overrides.keys?.game?.[holder as 'Shot']).toEqual(['code:Quote']);
    }
    // A key code no listed code sends is a free key.
    const free = rebindAction(KEYS, NONE, 'game', 'Speed', 'key:500');
    expect([free.status, free.other]).toEqual([RebindStatus.Bound, null]);
  });

  it('binds a key it already has under its other token kind without touching other actions', () => {
    // Quote is 222: Speed keeps the same physical key, now named by its key code.
    const result = rebindAction(KEYS, NONE, 'game', 'Speed', 'key:222');
    expect([result.status, result.other]).toEqual([RebindStatus.Bound, null]);
    const keys = applyBindingOverride(KEYS, result.overrides.keys).tables.game.keys;
    expect(findKeyActions('Quote', 222, keys)).toBe(Action.Speed);
    expect(actionTokens(KEYS, result.overrides.keys, 'game', 'Speed')).toEqual(['key:222']);
  });

  it('treats the reserved keys under either token kind as reserved', () => {
    for (const token of ['code:Escape', 'key:27', 'key:10009']) {
      for (const p of [KEYBOARD, REMOTE, KEYS]) {
        expect(rebindAction(p, NONE, 'menu', 'Confirm', token).status, token).toBe(
          RebindStatus.Rejected,
        );
      }
    }
  });
});

describe('rebind rebinding (edge): conflicts', () => {
  it('a key with two actions loses both (optional actions left keyless: Moved)', () => {
    // The split keyboard's G is Special + Speed (player 1); player 1 has no Shot key.
    const result = rebindAction(SPLIT, NONE, 'game', 'Shot', 'code:KeyG');
    expect([result.status, result.other]).toEqual([RebindStatus.Moved, 'Special']);
    expect(result.overrides['keyboard-split']?.game).toEqual({
      Shot: ['code:KeyG'],
      Special: [],
      Speed: [],
    });
    const keys = applyBindingOverride(SPLIT, result.overrides['keyboard-split']).tables.game.keys;
    expect(keys.byCode.KeyG).toBe(Action.Shot);
  });

  it('swapping away one action of a shared key leaves the other on it', () => {
    // Special (on G with Speed) takes F, PowerUp's only key: PowerUp takes G.
    const result = rebindAction(SPLIT, NONE, 'game', 'Special', 'code:KeyF');
    expect([result.status, result.other]).toEqual([RebindStatus.Swapped, 'PowerUp']);
    const keys = applyBindingOverride(SPLIT, result.overrides['keyboard-split']).tables.game.keys;
    expect(keys.byCode.KeyF).toBe(Action.Special);
    expect(keys.byCode.KeyG).toBe(Action.PowerUp | Action.Speed);
  });

  it('an optional holder left with no key to take back is left keyless (Moved)', () => {
    const start = resolveBindingOverrides({ 'tizen-remote-safe': { game: { Special: [] } } });
    const result = rebindAction(REMOTE, start, 'game', 'Special', 'key:428');
    expect([result.status, result.other]).toEqual([RebindStatus.Moved, 'Speed']);
    expect(result.overrides['tizen-remote-safe']?.game).toEqual({
      Special: ['key:428'],
      Speed: [],
    });
  });

  it('never gives a reserved key away in a swap: a required holder is refused instead', () => {
    // Pause down to the remote's Back alone (reserved); taking Left's only key would need Back.
    const start = resolveBindingOverrides({
      'tizen-remote-safe': { game: { Pause: ['key:10009'] } },
    });
    const refused = rebindAction(REMOTE, start, 'game', 'Pause', 'key:37');
    expect([refused.status, refused.other]).toEqual([RebindStatus.Refused, 'Left']);
    expect(refused.overrides).toBe(start);
    // With Play/Pause still its own, Pause swaps it (Back stays).
    const swapped = rebindAction(REMOTE, NONE, 'game', 'Pause', 'key:37');
    expect([swapped.status, swapped.other]).toEqual([RebindStatus.Swapped, 'Left']);
    expect(swapped.overrides['tizen-remote-safe']?.game).toEqual({
      Left: ['key:10252'],
      Pause: ['key:10009', 'key:37'],
    });
  });

  it('keeps at most MAX_ACTION_TOKENS keys for an action a swap hands many', () => {
    const many = lab('many', {
      KeyA: ['Shot'],
      KeyB: ['Shot'],
      KeyC: ['Shot'],
      KeyD: ['Shot'],
      KeyE: ['Shot'],
      KeyX: ['Sub'],
    });
    const result = rebindAction(many, NONE, 'game', 'Shot', 'code:KeyX');
    expect([result.status, result.other]).toEqual([RebindStatus.Swapped, 'Sub']);
    const sub = result.overrides.many?.game?.Sub ?? [];
    expect(sub).toHaveLength(MAX_ACTION_TOKENS);
    expect(sub).toEqual(['code:KeyA', 'code:KeyB', 'code:KeyC', 'code:KeyD']);
    // What was dropped does nothing any more; the save reads the override back unchanged.
    const keys = applyBindingOverride(many, result.overrides.many).tables.game.keys;
    expect(keys.byCode.KeyE).toBe(0);
    expect(resolveBindingOverrides(result.overrides)).toEqual(result.overrides);
  });

  it('binding a key the action already has among others keeps only that key', () => {
    const result = rebindAction(KEYBOARD, NONE, 'game', 'Shot', 'code:Space');
    expect([result.status, result.other]).toEqual([RebindStatus.Bound, null]);
    expect(result.overrides['keyboard-default']?.game).toEqual({ Shot: ['code:Space'] });
  });

  it('merges into the context’s existing override, keeping the other actions and contexts', () => {
    let overrides = rebindAction(KEYBOARD, NONE, 'game', 'Special', 'code:KeyJ').overrides;
    overrides = rebindAction(KEYBOARD, overrides, 'menu', 'Back', 'code:KeyQ').overrides;
    const menu = overrides['keyboard-default']?.menu;
    // Taking W from Up (a move) rewrites Up and Sub only.
    const result = rebindAction(KEYBOARD, overrides, 'game', 'Sub', 'code:KeyW');
    expect(result.overrides['keyboard-default']?.game).toEqual({
      Up: ['code:ArrowUp'],
      Sub: ['code:KeyW'],
      Special: ['code:KeyJ'],
    });
    expect(result.overrides['keyboard-default']?.menu).toBe(menu);
  });

  it('returns frozen results and never changes what it was given', () => {
    const start = resolveBindingOverrides({ 'gamepad-standard': { game: { Shot: ['button:7'] } } });
    const snapshot = JSON.stringify(start);
    const result = rebindAction(KEYBOARD, start, 'game', 'Shot', 'code:KeyX');
    expect(JSON.stringify(start)).toBe(snapshot);
    expect(Object.isFrozen(result.overrides)).toBe(true);
    const own = result.overrides['keyboard-default'];
    expect(Object.isFrozen(own)).toBe(true);
    expect(Object.isFrozen(own?.game)).toBe(true);
    expect(Object.isFrozen(own?.game?.Shot)).toBe(true);
    expect(result.overrides['gamepad-standard']).toBe(start['gamepad-standard']);
  });

  it('keeps the overrides object on every outcome that changes nothing', () => {
    const cases: Array<[InputProfile, 'game' | 'menu', string, string, number]> = [
      [KEYBOARD, 'game', 'Sub', 'code:KeyX', RebindStatus.Unchanged],
      [PAD, 'game', 'Sub', 'button:1', RebindStatus.Unchanged],
      [KEYBOARD, 'game', 'Shot', 'code:Escape', RebindStatus.Rejected],
      [PAD, 'game', 'Shot', 'key:13', RebindStatus.Rejected],
      [REMOTE, 'game', 'Shot', 'button:0', RebindStatus.Rejected],
      [KEYBOARD, 'game', 'Shot', 'code:', RebindStatus.Rejected],
      [REMOTE, 'game', 'Shot', 'key:0', RebindStatus.Rejected],
      [PAD, 'game', 'Shot', 'button:32', RebindStatus.Rejected],
    ];
    for (const [p, context, action, token, status] of cases) {
      const result = rebindAction(p, NONE, context, action as 'Shot', token);
      expect([result.status, result.other], `${p.id} ${token}`).toEqual([status, null]);
      expect(result.overrides).toBe(NONE);
    }
  });

  it('rebinds a gamepad’s menu table: the pad’s Back moves off SELECT', () => {
    const result = rebindAction(PAD, NONE, 'menu', 'Confirm', 'button:8');
    expect([result.status, result.other]).toEqual([RebindStatus.Moved, 'Back']);
    const buttons = applyBindingOverride(PAD, result.overrides['gamepad-standard']).tables.menu
      .buttons;
    expect([buttons[8], buttons[1], buttons[0]]).toEqual([Action.Confirm, Action.Back, 0]);
    // The game table is untouched.
    expect(
      applyBindingOverride(PAD, result.overrides['gamepad-standard']).tables.game.buttons,
    ).toEqual(PAD.tables.game.buttons);
    expect(actionTokens(PAD, result.overrides['gamepad-standard'], 'game', 'Shot')).toEqual([
      'button:0',
    ]);
  });
});

describe('rebind rebinding (edge): reset', () => {
  it('a context without an override leaves the overrides object as it is', () => {
    const menuOnly = resolveBindingOverrides({
      'keyboard-default': { menu: { Confirm: ['code:KeyJ'] } },
    });
    expect(resetBindings(menuOnly, 'keyboard-default', 'game')).toBe(menuOnly);
    expect(resetBindings(menuOnly, 'nobody', null)).toBe(menuOnly);
    const reset = resetBindings(menuOnly, 'keyboard-default', 'menu');
    expect(reset).toEqual({});
    expect(Object.isFrozen(reset)).toBe(true);
  });

  it('keeps every other profile and the other context', () => {
    const all = resolveBindingOverrides({
      'keyboard-default': { game: { Shot: ['code:KeyJ'] }, menu: { Confirm: ['code:KeyJ'] } },
      'gamepad-standard': { game: { Shot: ['button:7'] } },
    });
    const reset = resetBindings(all, 'keyboard-default', 'game');
    expect(reset).toEqual({
      'keyboard-default': { menu: { Confirm: ['code:KeyJ'] } },
      'gamepad-standard': { game: { Shot: ['button:7'] } },
    });
    expect(reset['gamepad-standard']).toBe(all['gamepad-standard']);
    expect(reset['keyboard-default']?.menu).toBe(all['keyboard-default']?.menu);
    expect(Object.isFrozen(reset['keyboard-default'])).toBe(true);
  });
});

describe('rebind rebinding (edge): applying overrides', () => {
  it('an override with no context is the profile itself; an empty context changes nothing', () => {
    expect(applyBindingOverride(KEYBOARD, {})).toBe(KEYBOARD);
    const empty = applyBindingOverride(KEYBOARD, { game: {} });
    expect(empty.tables.game.keys.byCode).toEqual(KEYBOARD.tables.game.keys.byCode);
    expect(empty.id).toBe(KEYBOARD.id);
  });

  it('a hand-edited override may put two actions on one key; the conflict is listed', () => {
    const edited = resolveBindingOverrides({
      'keyboard-default': { menu: { Pause: ['code:Enter'] } },
    });
    const bound = applyBindingOverride(KEYBOARD, edited['keyboard-default']);
    expect(bound.tables.menu.keys.byCode.Enter).toBe(Action.Confirm | Action.Pause);
    expect(findBindingConflicts(bound, 'menu')).toEqual([
      { token: 'code:Enter', actions: ['Confirm', 'Pause'] },
    ]);
    // An action the context does not rebind is not a conflict (Confirm in the game table).
    const game = resolveBindingOverrides({
      'keyboard-default': { game: { Confirm: ['code:KeyZ'] } },
    });
    const other = applyBindingOverride(KEYBOARD, game['keyboard-default']);
    expect(other.tables.game.keys.byCode.KeyZ).toBe(Action.Shot | Action.Confirm);
    expect(findBindingConflicts(other, 'game')).toEqual([]);
  });

  it('keeps a split keyboard’s player-2 half and recompiles it', () => {
    const edited = resolveBindingOverrides({
      'keyboard-split': { game: { PowerUp: ['code:KeyE'] } },
    });
    const bound = applyBindingOverride(SPLIT, edited['keyboard-split']);
    expect(bound.split).toBe(SPLIT.split);
    expect(bound.splitTables?.game.keys.byCode.KeyK).toBe(Action.PowerUp);
    expect(bound.tables.game.keys.byCode.KeyE).toBe(Action.PowerUp);
    expect(bound.tables.game.keys.byCode.KeyF).toBe(0);
    expect(Object.isFrozen(bound)).toBe(true);
  });

  it('customises the tuning alone, clamping the debounce and keeping the rest', () => {
    const socdOnly = customizeInputProfile(REMOTE, {
      socd: 'lastWins',
      releaseDebounce: null,
      bindings: {},
    });
    // M3-02b: the TV profile no longer debounces (the remote sends no fake keyup/keydown pairs).
    expect([socdOnly.socd, socdOnly.releaseDebounceTicks]).toEqual(['lastWins', 0]);
    expect(socdOnly.tables).toBe(REMOTE.tables);
    const debounceOnly = customizeInputProfile(REMOTE, {
      socd: null,
      releaseDebounce: 0,
      bindings: {},
    });
    expect([debounceOnly.socd, debounceOnly.releaseDebounceTicks]).toEqual(['neutral', 0]);
    const tooLong = customizeInputProfile(KEYBOARD, {
      socd: null,
      releaseDebounce: 99,
      bindings: {},
    });
    expect(tooLong.releaseDebounceTicks).toBe(10);
    // Another profile's rebinding does not touch this one.
    const others = resolveBindingOverrides({
      'gamepad-standard': { game: { Shot: ['button:7'] } },
    });
    expect(
      customizeInputProfile(KEYBOARD, { socd: null, releaseDebounce: null, bindings: others }),
    ).toBe(KEYBOARD);
    // The split keyboard keeps its halves.
    const split = customizeInputProfile(SPLIT, {
      socd: 'lastWins',
      releaseDebounce: 3,
      bindings: {},
    });
    expect([split.socd, split.releaseDebounceTicks, split.splitTables]).toEqual([
      'lastWins',
      3,
      SPLIT.splitTables,
    ]);
  });

  it('lists an action’s tokens in table order, empty when it has none', () => {
    expect(actionTokens(KEYBOARD, undefined, 'menu', 'Confirm')).toEqual([
      'code:Enter',
      'code:NumpadEnter',
      'code:Space',
      'code:KeyZ',
    ]);
    expect(actionTokens(KEYBOARD, undefined, 'game', 'Confirm')).toEqual([]);
    expect(actionTokens(REMOTE, undefined, 'game', 'Pause')).toEqual(['key:10009', 'key:10252']);
    expect(actionTokens(PAD, undefined, 'game', 'Speed')).toEqual(['button:4', 'button:5']);
  });
});

describe('rebind rebinding (edge): captures and names', () => {
  it('makes no token of a capture whose code or key code is not a valid token', () => {
    expect(captureToken(KEYBOARD, { code: 'Intl_Ro', keyCode: 0, button: -1 })).toBeNull();
    expect(captureToken(REMOTE, { code: '', keyCode: 1234567, button: -1 })).toBeNull();
    expect(captureToken(REMOTE, { code: '', keyCode: -5, button: -1 })).toBeNull();
    expect(captureToken(PAD, { code: '', keyCode: 0, button: 40 })).toBeNull();
    expect(captureToken(PAD, { code: '', keyCode: 0, button: 31 })).toBe('button:31');
  });

  it('looks in the given context only (a key of the other context is a free key here)', () => {
    // Enter is PowerUp (game) and Confirm (menu) on the keyboard: bound by code in both.
    const enter = { code: 'Enter', keyCode: 13, button: -1 };
    expect(captureToken(KEYBOARD, enter, 'menu')).toBe('code:Enter');
    // The TV profile binds key code 13 in both contexts.
    expect(captureToken(REMOTE, enter, 'game')).toBe('key:13');
    // CH+ is bound in the game context only: in menus it is a free key, still named by key code.
    expect(captureToken(REMOTE, { code: '', keyCode: 427, button: -1 }, 'menu')).toBe('key:427');
  });

  it('names more keys and buttons', () => {
    expect(
      [
        'button:16',
        'button:31',
        'key:32',
        'key:403',
        'key:406',
        'key:37',
        'key:48',
        'key:90',
        'code:F12',
        'code:NumpadEnter',
        'code:Numpad0',
        'code:Digit0',
        'code:BracketLeft',
        'code:Backslash',
        'code:MediaPlayPause',
        'pad:3',
        ':3',
      ].map(bindingTokenLabel),
    ).toEqual([
      'HOME',
      'BTN 31',
      'SPACE',
      'RED',
      'BLUE',
      '←',
      '0',
      'Z',
      'F12',
      'NUM ENTER',
      'NUM 0',
      '0',
      '[',
      '\\',
      'MEDIAPLAYP',
      '?',
      '?',
    ]);
  });

  it('summarises long key lists after `max` names', () => {
    const four = ['code:Enter', 'code:NumpadEnter', 'code:Space', 'code:KeyZ'];
    expect(bindingKeysLabel(four)).toBe('ENTER  NUM ENTER  SPACE +');
    expect(bindingKeysLabel(four, 4)).toBe('ENTER  NUM ENTER  SPACE  Z');
    expect(bindingKeysLabel(four, 1)).toBe('ENTER +');
    expect(bindingKeysLabel(['button:0'], 1)).toBe('A');
  });
});
