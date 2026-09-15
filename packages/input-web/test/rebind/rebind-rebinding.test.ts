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
