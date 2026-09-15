/**
 * `rebind` (plan M2-16 acceptance "capture / conflict / reset tests, profile overrides persisted
 * and applied"): rebinding an action of a shipped profile — a plain bind, a key taken from another
 * action (`Moved`), two actions swapping keys (`Swapped`), a refusal that would leave a required
 * action without a key, reserved and unfitting keys (`Rejected`), no-ops — the overrides applied to
 * the compiled tables (`applyBindingOverride`, `customizeInputProfile` with SOCD and debounce), a
 * stale override that would lock the player out ignored, resets per context, conflicts listed, the
 * capture turned into tokens, and the keys' names.
 */
import { readFileSync } from 'node:fs';
import {
  Action,
  RebindStatus,
  resolveBindingOverrides,
  type BindingOverrides,
  type ContentFile,
} from '@shmup/core';
import { describe, expect, it } from 'vitest';
import * as inputWeb from '../../src/index.js';
import { findKeyActions } from '../../src/keymap/index.js';
import {
  RESERVED_BINDING_TOKENS,
  actionTokens,
  applyBindingOverride,
  bindingKeysLabel,
  bindingTokenLabel,
  captureToken,
  customizeInputProfile,
  findBindingConflicts,
  loadInputProfiles,
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
const EMULATION = profile('keyboard-remote-emulation');
const SPLIT = profile('keyboard-split');
const NONE: BindingOverrides = Object.freeze({});

describe('rebind rebinding (M2-16)', () => {
  it('is exported from the package entry', () => {
    expect(inputWeb.rebindAction).toBe(rebindAction);
    expect(inputWeb.customizeInputProfile).toBe(customizeInputProfile);
    expect(inputWeb.RESERVED_BINDING_TOKENS).toEqual(['code:Escape', 'key:10009']);
  });

  it('binds a free key: the action keeps only it, the override lists the whole set', () => {
    const result = rebindAction(KEYBOARD, NONE, 'game', 'Shot', 'code:KeyJ');
    expect([result.status, result.other]).toEqual([RebindStatus.Bound, null]);
    expect(result.overrides).toEqual({ 'keyboard-default': { game: { Shot: ['code:KeyJ'] } } });
    const bound = applyBindingOverride(KEYBOARD, result.overrides['keyboard-default']);
    const keys = bound.tables.game.keys.byCode;
    expect(keys.KeyJ).toBe(Action.Shot);
    // Z and Space no longer shoot (they stay tracked: bound in the menu table).
    expect(keys.KeyZ).toBe(0);
    expect(keys.Space).toBe(0);
    // The menu table is untouched.
    expect(bound.tables.menu.keys.byCode.KeyZ).toBe(Action.Confirm);
    expect(actionTokens(KEYBOARD, result.overrides['keyboard-default'], 'game', 'Shot')).toEqual([
      'code:KeyJ',
    ]);
  });

  it('takes a key from an action that keeps other keys (Moved)', () => {
    // W is one of Up's two keys: Up keeps the arrow.
    const result = rebindAction(KEYBOARD, NONE, 'game', 'Sub', 'code:KeyW');
    expect([result.status, result.other]).toEqual([RebindStatus.Moved, 'Up']);
    const override = result.overrides['keyboard-default'];
    expect(override?.game).toEqual({ Up: ['code:ArrowUp'], Sub: ['code:KeyW'] });
    const keys = applyBindingOverride(KEYBOARD, override).tables.game.keys.byCode;
    expect([keys.KeyW, keys.ArrowUp, keys.KeyX]).toEqual([Action.Sub, Action.Up, 0]);
  });

  it('swaps keys when the other action had only that key (Swapped) — no action is left unbound', () => {
    // X is Sub's only key: Sub takes Shot's old keys (Z, Space).
    const result = rebindAction(KEYBOARD, NONE, 'game', 'Shot', 'code:KeyX');
    expect([result.status, result.other]).toEqual([RebindStatus.Swapped, 'Sub']);
    const keys = applyBindingOverride(KEYBOARD, result.overrides['keyboard-default']).tables.game
      .keys.byCode;
    expect([keys.KeyX, keys.KeyZ, keys.Space]).toEqual([Action.Shot, Action.Sub, Action.Sub]);
    // In the menu table Back has X, Backspace and Escape: taking X is a move, Back keeps the rest.
    const menu = rebindAction(KEYBOARD, NONE, 'menu', 'Confirm', 'code:KeyX');
    expect([menu.status, menu.other]).toEqual([RebindStatus.Moved, 'Back']);
    const table = applyBindingOverride(KEYBOARD, menu.overrides['keyboard-default']).tables.menu
      .keys.byCode;
    expect([table.KeyX, table.Backspace, table.Escape]).toEqual([
      Action.Confirm,
      Action.Back,
      Action.Back,
    ]);
  });

  it('refuses a rebinding that would leave a required action without a key', () => {
    // Up down to one key (W), Special with none to give: taking W would leave Up unbound.
    const refused = rebindAction(
      KEYBOARD,
      resolveBindingOverrides({
        'keyboard-default': { game: { Up: ['code:KeyW'], Special: [] } },
      }),
      'game',
      'Special',
      'code:KeyW',
    );
    expect([refused.status, refused.other]).toEqual([RebindStatus.Refused, 'Up']);
    expect(refused.overrides['keyboard-default']?.game?.Special).toEqual([]);
  });

  it('rejects the reserved keys and keys the device cannot hold', () => {
    for (const token of RESERVED_BINDING_TOKENS) {
      expect(rebindAction(KEYBOARD, NONE, 'game', 'Shot', token).status).toBe(
        RebindStatus.Rejected,
      );
      expect(rebindAction(REMOTE, NONE, 'game', 'Special', token).status).toBe(
        RebindStatus.Rejected,
      );
    }
    expect(rebindAction(KEYBOARD, NONE, 'game', 'Shot', 'button:3').status).toBe(
      RebindStatus.Rejected,
    );
    expect(rebindAction(PAD, NONE, 'game', 'Shot', 'code:KeyZ').status).toBe(RebindStatus.Rejected);
    expect(rebindAction(PAD, NONE, 'game', 'Shot', 'nonsense').status).toBe(RebindStatus.Rejected);
  });

  it('keeps a reserved key with its action: rebinding Pause keeps Escape', () => {
    const result = rebindAction(KEYBOARD, NONE, 'game', 'Pause', 'code:KeyQ');
    expect(result.overrides['keyboard-default']?.game?.Pause).toEqual(['code:Escape', 'code:KeyQ']);
    const remote = rebindAction(REMOTE, NONE, 'menu', 'Back', 'key:428');
    expect(remote.overrides['tizen-remote-safe']?.menu?.Back).toEqual(['key:10009', 'key:428']);
  });

  it('reports the same key alone as Unchanged, leaving the overrides object', () => {
    const result = rebindAction(KEYBOARD, NONE, 'game', 'Sub', 'code:KeyX');
    expect(result.status).toBe(RebindStatus.Unchanged);
    expect(result.overrides).toBe(NONE);
  });

  it('rebinds a gamepad button and a remote key through their own token kinds', () => {
    const pad = rebindAction(PAD, NONE, 'game', 'PowerUp', 'button:6');
    expect(pad.status).toBe(RebindStatus.Bound);
    const buttons = applyBindingOverride(PAD, pad.overrides['gamepad-standard']).tables.game
      .buttons;
    expect([buttons[6], buttons[2]]).toEqual([Action.PowerUp, 0]);
    // The remote: OK becomes the special, Ch+ (Special's only key) takes PowerUp.
    const remote = rebindAction(REMOTE, NONE, 'game', 'Special', 'key:13');
    expect([remote.status, remote.other]).toEqual([RebindStatus.Swapped, 'PowerUp']);
    const keys = applyBindingOverride(REMOTE, remote.overrides['tizen-remote-safe']).tables.game
      .keys.byKeyCode;
    expect([keys[13], keys[427]]).toEqual([Action.Special, Action.PowerUp]);
  });

  it('merges successive rebindings into one override per context', () => {
    let overrides: BindingOverrides = NONE;
    overrides = rebindAction(KEYBOARD, overrides, 'game', 'Shot', 'code:KeyJ').overrides;
    overrides = rebindAction(KEYBOARD, overrides, 'game', 'Sub', 'code:KeyK').overrides;
    overrides = rebindAction(KEYBOARD, overrides, 'menu', 'Confirm', 'code:KeyJ').overrides;
    expect(overrides).toEqual({
      'keyboard-default': {
        game: { Shot: ['code:KeyJ'], Sub: ['code:KeyK'] },
        menu: { Confirm: ['code:KeyJ'] },
      },
    });
    // A second profile's override stays apart.
    const both = rebindAction(PAD, overrides, 'game', 'Shot', 'button:7').overrides;
    expect(Object.keys(both).sort()).toEqual(['gamepad-standard', 'keyboard-default']);
    expect(both['keyboard-default']).toBe(overrides['keyboard-default']);
  });

  it('resets one context or both to the content bindings', () => {
    let overrides: BindingOverrides = NONE;
    overrides = rebindAction(KEYBOARD, overrides, 'game', 'Shot', 'code:KeyJ').overrides;
    overrides = rebindAction(KEYBOARD, overrides, 'menu', 'Confirm', 'code:KeyJ').overrides;
    overrides = rebindAction(PAD, overrides, 'game', 'Shot', 'button:7').overrides;
    const game = resetBindings(overrides, 'keyboard-default', 'game');
    expect(game['keyboard-default']).toEqual({ menu: { Confirm: ['code:KeyJ'] } });
    expect(game['gamepad-standard']).toBe(overrides['gamepad-standard']);
    const both = resetBindings(game, 'keyboard-default', 'menu');
    expect(both['keyboard-default']).toBeUndefined();
    expect(resetBindings(overrides, 'keyboard-default', null)['keyboard-default']).toBeUndefined();
    // Nothing to reset: the same object.
    expect(resetBindings(both, 'keyboard-default', 'game')).toBe(both);
    expect(resetBindings(NONE, 'gamepad-standard', null)).toBe(NONE);
    // The profile comes back as written.
    expect(applyBindingOverride(KEYBOARD, both['keyboard-default'])).toBe(KEYBOARD);
  });

  it('ignores a stale override that would leave a required action unbound (never locks out)', () => {
    const stale = resolveBindingOverrides({
      'keyboard-default': { menu: { Back: [] }, game: { Shot: ['code:KeyJ'] } },
    });
    const bound = applyBindingOverride(KEYBOARD, stale['keyboard-default']);
    // The menu table keeps the content's (Back stays on X / Backspace / Escape) …
    expect(bound.tables.menu.keys.byCode.Escape).toBe(Action.Back);
    // … the game table's override applies.
    expect(bound.tables.game.keys.byCode.KeyJ).toBe(Action.Shot);
    // Tokens a key profile cannot hold are skipped.
    const odd = resolveBindingOverrides({ 'keyboard-default': { game: { Shot: ['button:1'] } } });
    const skipped = applyBindingOverride(KEYBOARD, odd['keyboard-default']);
    expect(skipped.tables.game.keys.byCode.KeyZ).toBe(0);
    expect(skipped.tables.game.buttons).toEqual([]);
  });

  it('customises a profile with the rebinding, SOCD and debounce (the save’s options.input)', () => {
    const settings = {
      socd: 'lastWins' as const,
      releaseDebounce: 5,
      bindings: resolveBindingOverrides({ 'tizen-remote-safe': { game: { Special: ['key:13'] } } }),
    };
    const remote = customizeInputProfile(REMOTE, settings);
    expect([remote.id, remote.socd, remote.releaseDebounceTicks]).toEqual([
      'tizen-remote-safe',
      'lastWins',
      5,
    ]);
    // A written override lists only the actions it changes: OK keeps PowerUp and adds Special.
    expect(remote.tables.game.keys.byKeyCode[13]).toBe(Action.PowerUp | Action.Special);
    // A gamepad profile keeps its debounce of 0; SOCD applies.
    const pad = customizeInputProfile(PAD, settings);
    expect([pad.socd, pad.releaseDebounceTicks]).toEqual(['lastWins', 0]);
    expect(pad.tables).toBe(PAD.tables);
    // No settings: the profile itself.
    expect(
      customizeInputProfile(KEYBOARD, { socd: null, releaseDebounce: null, bindings: {} }),
    ).toBe(KEYBOARD);
  });

  it('lists the keys that trigger several rebindable actions', () => {
    expect(findBindingConflicts(KEYBOARD, 'game')).toEqual([]);
    const split = profile('keyboard-split');
    const conflicts = findBindingConflicts(split, 'game');
    expect(conflicts.length).toBeGreaterThan(0);
    for (const conflict of conflicts) expect(conflict.actions.length).toBeGreaterThan(1);
  });

  it('turns a capture into the token of the device’s kind', () => {
    const key = { code: 'KeyJ', keyCode: 74, button: -1 };
    expect(captureToken(KEYBOARD, key)).toBe('code:KeyJ');
    expect(captureToken(REMOTE, key)).toBe('key:74');
    expect(captureToken(PAD, key)).toBeNull();
    expect(captureToken(REMOTE, { code: '', keyCode: 427, button: -1 })).toBe('key:427');
    expect(captureToken(KEYBOARD, { code: '', keyCode: 427, button: -1 })).toBe('key:427');
    expect(captureToken(PAD, { code: '', keyCode: 0, button: 7 })).toBe('button:7');
    expect(captureToken(KEYBOARD, { code: '', keyCode: 0, button: 7 })).toBeNull();
    expect(captureToken(KEYBOARD, { code: '', keyCode: 0, button: -1 })).toBeNull();
  });

  it('names a key the way the profile binds it: KEYBOARD AS REMOTE binds by code (review round 2)', () => {
    const arrowUp = { code: 'ArrowUp', keyCode: 38, button: -1 };
    // The shipped emulation profile is a `remote` profile that binds `byCode` only.
    expect(captureToken(EMULATION, arrowUp, 'menu')).toBe('code:ArrowUp');
    expect(captureToken(EMULATION, arrowUp)).toBe('code:ArrowUp');
    // A key it does not use yet: by code as well (the profile binds by code).
    expect(captureToken(EMULATION, { code: 'KeyJ', keyCode: 74, button: -1 }, 'game')).toBe(
      'code:KeyJ',
    );
    // The TV profiles bind key codes only: a desktop arrow reaches them by key code.
    expect(captureToken(REMOTE, arrowUp, 'menu')).toBe('key:38');
    // The player's rebinding counts: once OK is Special by key code, Enter names that entry …
    const overrides = resolveBindingOverrides({
      'keyboard-default': { game: { Special: ['key:13'] } },
    });
    const enter = { code: 'Enter', keyCode: 13, button: -1 };
    expect(captureToken(KEYBOARD, enter, 'game')).toBe('code:Enter');
    // … unless the code entry still has an action (it hides the key code): here PowerUp keeps it.
    expect(captureToken(KEYBOARD, enter, 'game', overrides['keyboard-default'])).toBe('code:Enter');
    const moved = resolveBindingOverrides({
      'keyboard-default': { game: { PowerUp: ['code:KeyC'], Special: ['key:13'] } },
    });
    expect(captureToken(KEYBOARD, enter, 'game', moved['keyboard-default'])).toBe('key:13');
  });

  it('never binds a key hidden by another: menu CONFIRM → ↑ on KEYBOARD AS REMOTE swaps', () => {
    const token = captureToken(EMULATION, { code: 'ArrowUp', keyCode: 38, button: -1 }, 'menu');
    expect(token).toBe('code:ArrowUp');
    for (const tried of [token ?? '', 'key:38']) {
      // The token as captured now, and the key-code token an older build captured: one key.
      const result = rebindAction(EMULATION, NONE, 'menu', 'Confirm', tried);
      expect([result.status, result.other]).toEqual([RebindStatus.Swapped, 'Up']);
      const bound = applyBindingOverride(EMULATION, result.overrides['keyboard-remote-emulation']);
      const menu = bound.tables.menu.keys;
      expect(findKeyActions('ArrowUp', 38, menu)).toBe(Action.Confirm);
      expect(findKeyActions('Enter', 13, menu)).toBe(Action.Up);
      expect(findKeyActions('NumpadEnter', 13, menu)).toBe(Action.Up);
      const o = result.overrides['keyboard-remote-emulation'];
      expect(actionTokens(EMULATION, o, 'menu', 'Up')).toEqual(['code:Enter', 'code:NumpadEnter']);
      expect(actionTokens(EMULATION, o, 'menu', 'Confirm')).toEqual([tried]);
    }
    // Menu BACK → Enter: Confirm keeps NumpadEnter (Moved) — the menus keep a Confirm and a Back.
    const back = rebindAction(EMULATION, NONE, 'menu', 'Back', 'code:Enter');
    expect([back.status, back.other]).toEqual([RebindStatus.Moved, 'Confirm']);
    const menu = applyBindingOverride(EMULATION, back.overrides['keyboard-remote-emulation']).tables
      .menu.keys;
    expect(findKeyActions('Enter', 13, menu)).toBe(Action.Back);
    expect(findKeyActions('NumpadEnter', 13, menu)).toBe(Action.Confirm);
    // Escape's key code is reserved like Escape.
    expect(rebindAction(EMULATION, NONE, 'menu', 'Confirm', 'key:27').status).toBe(
      RebindStatus.Rejected,
    );
  });

  it('ignores an override whose only key for a required action is hidden (never locks out)', () => {
    // A hand-edited save: Confirm on key code 38, which ArrowUp's code entry (Up) hides.
    const stale = resolveBindingOverrides({
      'keyboard-remote-emulation': { menu: { Confirm: ['key:38'] }, game: { Special: ['key:38'] } },
    });
    const o = stale['keyboard-remote-emulation'];
    const bound = applyBindingOverride(EMULATION, o);
    // The menu table keeps the content's: Enter still confirms, the arrow still moves up.
    expect(findKeyActions('Enter', 13, bound.tables.menu.keys)).toBe(Action.Confirm);
    expect(findKeyActions('ArrowUp', 38, bound.tables.menu.keys)).toBe(Action.Up);
    // A hidden key of an optional action is applied but never shown: it does nothing.
    expect(findKeyActions('ArrowUp', 38, bound.tables.game.keys)).toBe(Action.Up);
    expect(actionTokens(EMULATION, o, 'game', 'Special')).toEqual([]);
  });

  it('never gives player 1 a key of the split keyboard’s player-2 half (review round 2)', () => {
    const arrowUp = { code: 'ArrowUp', keyCode: 38, button: -1 };
    const token = captureToken(SPLIT, arrowUp, 'game');
    expect(token).toBe('code:ArrowUp');
    for (const tried of [token ?? '', 'key:38', 'code:KeyK', 'code:Enter']) {
      const result = rebindAction(SPLIT, NONE, 'game', 'Shot', tried);
      expect([result.status, result.overrides]).toEqual([RebindStatus.Rejected, NONE]);
    }
    expect(rebindAction(SPLIT, NONE, 'game', 'Up', 'code:ArrowDown').status).toBe(
      RebindStatus.Rejected,
    );
    expect(rebindAction(SPLIT, NONE, 'menu', 'Confirm', 'code:KeyL').status).toBe(
      RebindStatus.Rejected,
    );
    // Player 1's own half and free keys still rebind.
    const free = rebindAction(SPLIT, NONE, 'game', 'Shot', 'code:KeyJ');
    expect(free.status).toBe(RebindStatus.Bound);
    // A hand-edited save cannot rebuild the conflict: the player-2 key is skipped.
    const edited = resolveBindingOverrides({
      'keyboard-split': { game: { Shot: ['code:ArrowUp', 'code:KeyJ'] } },
    });
    const bound = applyBindingOverride(SPLIT, edited['keyboard-split']);
    expect(bound.tables.game.keys.byCode.ArrowUp).toBeUndefined();
    expect(bound.tables.game.keys.byCode.KeyJ).toBe(Action.Shot);
    expect(bound.splitTables?.game.keys.byCode.ArrowUp).toBe(Action.Up);
    // Pause's only override key (Enter's key code — player 2's Pause) is skipped: Pause would be
    // left without a key, so the game table stays the content's.
    const pause = resolveBindingOverrides({ 'keyboard-split': { game: { Pause: ['key:13'] } } });
    const kept = applyBindingOverride(SPLIT, pause['keyboard-split']);
    expect(kept.tables.game.keys.byCode.Escape).toBe(Action.Pause);
    expect(kept.tables.game.keys.byKeyCode[13]).toBeUndefined();
  });

  it('names keys and buttons with the bitmap font’s glyphs', () => {
    expect(
      [
        'code:KeyZ',
        'code:Digit7',
        'code:ArrowUp',
        'code:Space',
        'code:ShiftLeft',
        'code:Numpad3',
        'code:F5',
        'code:Semicolon',
        'code:IntlBackslash',
        'key:13',
        'key:10009',
        'key:427',
        'key:10252',
        'key:55',
        'key:75',
        'key:999',
        'button:0',
        'button:9',
        'button:12',
        'button:20',
        'bogus',
      ].map(bindingTokenLabel),
    ).toEqual([
      'Z',
      '7',
      '↑',
      'SPACE',
      'L-SHIFT',
      'NUM 3',
      'F5',
      ';',
      'INTLBACKSL',
      'OK',
      'BACK',
      'CH+',
      'PLAY/PAUSE',
      '7',
      'K',
      'KEY 999',
      'A',
      'START',
      'D↑',
      'BTN 20',
      '?',
    ]);
    expect(bindingKeysLabel([])).toBe('-');
    expect(bindingKeysLabel(['code:KeyZ', 'code:Space'])).toBe('Z  SPACE');
    expect(bindingKeysLabel(['code:KeyP', 'code:Escape', 'code:Backspace', 'code:KeyQ'])).toBe(
      'P  ESC  BKSP +',
    );
  });
});
