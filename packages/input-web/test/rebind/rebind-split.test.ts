/**
 * The split keyboard in input profiles (plan M2-06, shmup_feat.md §4 "split-keyboard preset"): a
 * `keyboard` profile's `split` section (player 2's half) is validated like `context` — the
 * required actions per context, no gamepad buttons —, a key may not sit in both halves, only
 * keyboard profiles may split, the halves compile into `splitTables` (keys of the other context
 * kept at 0), and the shipped `keyboard-split` preset (WASD + F / G vs arrows + K / L) is sound and
 * offered on the web only.
 */
import { readFileSync } from 'node:fs';
import { Action } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import {
  loadInputProfiles,
  parseInputProfiles,
  selectableKeyProfiles,
} from '../../src/rebind/index.js';

/**
 * A keyboard half's tables.
 *
 * @param keys - `[code, game action, menu action]` rows.
 * @returns `{ game, menu }` bindings.
 */
function half(
  keys: ReadonlyArray<readonly [string, string, string]>,
): Record<string, { byCode: Record<string, string[]>; byKeyCode: Record<string, string[]> }> {
  const game: Record<string, string[]> = {};
  const menu: Record<string, string[]> = {};
  for (const [code, g, m] of keys) {
    if (g !== '') game[code] = [g];
    if (m !== '') menu[code] = [m];
  }
  return { game: { byCode: game, byKeyCode: {} }, menu: { byCode: menu, byKeyCode: {} } };
}

/** Player 1's half of the tests. */
const LEFT = half([
  ['KeyW', 'Up', 'Up'],
  ['KeyS', 'Down', 'Down'],
  ['KeyA', 'Left', 'Left'],
  ['KeyD', 'Right', 'Right'],
  ['KeyF', 'PowerUp', 'Confirm'],
  ['KeyG', 'Pause', 'Back'],
]);

/** Player 2's half of the tests. */
const RIGHT = half([
  ['ArrowUp', 'Up', 'Up'],
  ['ArrowDown', 'Down', 'Down'],
  ['ArrowLeft', 'Left', 'Left'],
  ['ArrowRight', 'Right', 'Right'],
  ['KeyK', 'PowerUp', 'Confirm'],
  ['KeyL', 'Pause', 'Back'],
]);

/**
 * A one-profile file.
 *
 * @param entry - Fields over a valid split keyboard profile.
 * @returns The document.
 */
function file(entry: Record<string, unknown> = {}): unknown {
  return {
    formatVersion: 1,
    kind: 'input-profiles',
    profiles: [
      {
        id: 'split-test',
        label: 'SPLIT TEST',
        device: 'keyboard',
        context: LEFT,
        split: RIGHT,
        releaseDebounceTicks: 0,
        diagonals: 'combine',
        socd: 'neutral',
        register: [],
        ...entry,
      },
    ],
  };
}

describe('input-web/rebind split keyboard (M2-06)', () => {
  it('compiles the second half into splitTables, the other context`s keys at 0', () => {
    const { profiles, issues } = parseInputProfiles(file());
    expect(issues).toEqual([]);
    const profile = profiles[0];
    expect(profile.split).toBeDefined();
    const tables = profile.splitTables!;
    expect(tables.game.keys.byCode['ArrowUp']).toBe(Action.Up);
    expect(tables.game.keys.byCode['KeyK']).toBe(Action.PowerUp);
    expect(tables.menu.keys.byCode['KeyK']).toBe(Action.Confirm);
    expect(tables.game.keys.byCode['KeyW']).toBeUndefined(); // player 1's half
    expect(profile.tables.game.keys.byCode['ArrowUp']).toBeUndefined();
    const plain = parseInputProfiles(file({ split: undefined, id: 'plain' })).profiles[0];
    expect(plain.splitTables).toBeNull();
  });

  it('splits keyboard profiles only', () => {
    for (const device of ['remote', 'gamepad']) {
      const { profiles, issues } = parseInputProfiles(file({ device }));
      expect(profiles).toEqual([]);
      expect(issues).toContainEqual({
        path: 'profiles[0].split',
        message: 'only keyboard profiles split the keyboard',
      });
    }
  });

  it('requires the context actions in the second half', () => {
    const lame = half([
      ['ArrowUp', 'Up', 'Up'],
      ['KeyK', 'PowerUp', 'Confirm'],
    ]);
    const { profiles, issues } = parseInputProfiles(file({ split: lame }));
    expect(profiles).toEqual([]);
    expect(issues).toEqual([
      { path: 'profiles[0].split.game', message: 'must bind Down, Left, Right, Pause' },
      { path: 'profiles[0].split.menu', message: 'must bind Down, Left, Right, Back' },
    ]);
  });

  it('refuses a key bound in both halves, and gamepad buttons', () => {
    const clash = half([
      ['ArrowUp', 'Up', 'Up'],
      ['ArrowDown', 'Down', 'Down'],
      ['ArrowLeft', 'Left', 'Left'],
      ['ArrowRight', 'Right', 'Right'],
      ['KeyF', 'PowerUp', 'Confirm'],
      ['KeyL', 'Pause', 'Back'],
    ]);
    let result = parseInputProfiles(file({ split: clash }));
    expect(result.profiles).toEqual([]);
    expect(result.issues).toEqual([
      {
        path: 'profiles[0].split.game.byCode.KeyF',
        message: 'is bound in both halves of the keyboard',
      },
      {
        path: 'profiles[0].split.menu.byCode.KeyF',
        message: 'is bound in both halves of the keyboard',
      },
    ]);
    const buttons = {
      game: { ...RIGHT.game, buttons: { '0': ['Shot'] } },
      menu: RIGHT.menu,
    };
    result = parseInputProfiles(file({ split: buttons }));
    expect(result.issues).toContainEqual({
      path: 'profiles[0].split.game.buttons',
      message: 'only gamepad profiles bind buttons',
    });
  });

  it('ships keyboard-split, offered on the web and never on the TV', () => {
    const shipped = loadInputProfiles([
      {
        path: 'input/remote.input-profiles.json',
        data: JSON.parse(
          readFileSync(
            new URL('../../../../content/input/remote.input-profiles.json', import.meta.url),
            'utf8',
          ),
        ) as unknown,
      },
    ]);
    expect(shipped.issues).toEqual([]);
    const split = shipped.profiles.find((p) => p.id === 'keyboard-split')!;
    expect(split).toMatchObject({ device: 'keyboard', label: 'SPLIT KEYBOARD' });
    expect(split.tables.game.keys.byCode['KeyW']).toBe(Action.Up);
    expect(split.tables.game.keys.byCode['KeyG']).toBe(Action.Special | Action.Speed);
    expect(split.splitTables?.game.keys.byCode['KeyL']).toBe(Action.Special | Action.Speed);
    expect(split.splitTables?.game.keys.byCode['Enter']).toBe(Action.Pause);
    expect(split.splitTables?.menu.keys.byCode['Enter']).toBe(Action.Confirm);
    expect(selectableKeyProfiles(shipped.profiles, 'code')).toContain(split);
    expect(selectableKeyProfiles(shipped.profiles, 'keyCode')).not.toContain(split);
  });
});
