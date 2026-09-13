/**
 * Edge cases of the browser input adapter's player seats (plan M2-06): the join press is an edge
 * (a START / A held since before the co-op game does not seat the pad), one seat never seats a
 * pad, the join buttons come from the gamepad profile's **menu** table (START / A — not the game
 * table's Select-as-Pause), a pad that vanishes from a shorter `getGamepads()` list gives its seat
 * up like a disconnected one, a seated pad's idle polls keep player 2's device, a tap on the
 * split keyboard's right half reaches player 2 as a press, a gamepad profile keeps the split
 * keyboard, `setSeats` takes exactly 2 for two seats, and `destroy` detaches both keyboard halves.
 */
import { readFileSync } from 'node:fs';
import { Action } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import type { GamepadLike } from '../../src/gamepad/index.js';
import { loadInputProfiles, type InputProfile } from '../../src/rebind/index.js';
import { PAD_SEAT_NONE, PAD_SEAT_P2, createWebInput } from '../../src/web-input/index.js';
import { key, pad } from '../helpers.js';

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

/**
 * A shipped profile.
 *
 * @param id - Profile id.
 * @returns The profile.
 */
function profile(id: string): InputProfile {
  const found = shipped.profiles.find((p) => p.id === id);
  if (found === undefined) throw new Error(`no profile ${id}`);
  return found;
}

/**
 * A gamepad profile whose menu table binds Confirm to Y (button 3) only and nothing to Pause.
 *
 * @returns The profile.
 */
function yConfirmsProfile(): InputProfile {
  const { profiles, issues } = loadInputProfiles([
    {
      path: 'input/y.input-profiles.json',
      data: {
        formatVersion: 1,
        kind: 'input-profiles',
        profiles: [
          {
            id: 'pad-y',
            label: 'PAD Y',
            device: 'gamepad',
            context: {
              game: {
                byCode: {},
                byKeyCode: {},
                buttons: {
                  '0': ['Shot'],
                  '3': ['PowerUp'],
                  '9': ['Pause'],
                  '12': ['Up'],
                  '13': ['Down'],
                  '14': ['Left'],
                  '15': ['Right'],
                },
              },
              menu: {
                byCode: {},
                byKeyCode: {},
                buttons: {
                  '1': ['Back'],
                  '3': ['Confirm'],
                  '12': ['Up'],
                  '13': ['Down'],
                  '14': ['Left'],
                  '15': ['Right'],
                },
              },
            },
            releaseDebounceTicks: 0,
            diagonals: 'combine',
            socd: 'neutral',
            register: [],
          },
        ],
      },
    },
  ]);
  expect(issues).toEqual([]);
  return profiles[0];
}

describe('input-web/web-input seats: the join press (M2-06)', () => {
  it('does not seat a pad whose START was held since before the co-op game', () => {
    let pads: Array<GamepadLike | null> = [pad(0, [9])];
    const input = createWebInput({ keyTarget: null, getGamepads: () => pads });
    input.poll(); // one seat: START is player 1's (the title's menus)
    input.setSeats(2);
    let s = input.poll();
    expect(input.padSeat(0)).toBe(PAD_SEAT_NONE);
    expect([s.players[0]?.held, s.players[1]?.held]).toEqual([Action.Pause, 0]);
    pads = [pad(0)];
    input.poll();
    pads = [pad(0, [9])]; // a fresh press
    s = input.poll();
    expect(input.padSeat(0)).toBe(PAD_SEAT_P2);
    expect(s.players[1]?.pressed & Action.Confirm).toBe(Action.Confirm);
  });

  it('never seats a pad with one seat', () => {
    let pads: Array<GamepadLike | null> = [pad(0)];
    const input = createWebInput({ keyTarget: null, getGamepads: () => pads });
    for (let t = 0; t < 6; t++) {
      pads = [pad(0, t % 2 === 0 ? [0, 9] : [])];
      const s = input.poll();
      expect(s.players[1]?.held).toBe(0);
      expect(s.players[1]?.pressed).toBe(0);
    }
    expect(input.padSeat(0)).toBe(PAD_SEAT_NONE);
  });

  it('takes the join buttons from the menu table: Select (Pause in the game only) does not seat', () => {
    let pads: Array<GamepadLike | null> = [pad(0, [8])];
    const input = createWebInput({ keyTarget: null, getGamepads: () => pads });
    input.setProfile(profile('gamepad-standard'));
    input.setSeats(2);
    const s = input.poll();
    expect(input.padSeat(0)).toBe(PAD_SEAT_NONE);
    expect(s.players[0]?.held).toBe(Action.Pause); // Select pauses player 1's game
    pads = [pad(0)];
    input.poll();
    pads = [pad(0, [9])]; // START: Pause in the menu table too
    input.poll();
    expect(input.padSeat(0)).toBe(PAD_SEAT_P2);
  });

  it('follows the gamepad profile: its menu Confirm button joins, A does not', () => {
    let pads: Array<GamepadLike | null> = [pad(0, [0])];
    const input = createWebInput({ keyTarget: null, getGamepads: () => pads });
    input.setProfile(yConfirmsProfile());
    input.setSeats(2);
    let s = input.poll();
    expect(input.padSeat(0)).toBe(PAD_SEAT_NONE);
    expect(s.players[0]?.held).toBe(Action.Shot);
    pads = [pad(0, [3])];
    s = input.poll();
    expect(input.padSeat(0)).toBe(PAD_SEAT_P2);
    expect(s.players[1]?.held).toBe(Action.PowerUp);
    expect(s.players[1]?.pressed & Action.Confirm).toBe(Action.Confirm);
  });

  it('keeps player 2`s device while its seated pad idles, and releases the latched Confirm', () => {
    let pads: Array<GamepadLike | null> = [pad(0, [0])];
    const input = createWebInput({ keyTarget: null, getGamepads: () => pads, keyDevice: 'remote' });
    input.setSeats(2);
    let s = input.poll();
    expect(s.players[1]?.device).toBe('gamepad');
    pads = [pad(0)];
    s = input.poll();
    expect([s.players[1]?.held, s.players[1]?.pressed]).toEqual([0, 0]);
    expect(s.players[1]?.device).toBe('gamepad');
    expect(s.players[0]?.device).not.toBe('gamepad');
  });
});

describe('input-web/web-input seats: pads that go away (M2-06)', () => {
  it('gives the seat up when the pad drops off a shorter getGamepads() list', () => {
    let pads: Array<GamepadLike | null> = [pad(0, [9])];
    const input = createWebInput({ keyTarget: null, getGamepads: () => pads });
    input.setSeats(2);
    input.poll();
    expect(input.padSeat(0)).toBe(PAD_SEAT_P2);
    pads = []; // some browsers list only the pads that are there
    input.poll();
    expect(input.padSeat(0)).toBe(PAD_SEAT_NONE);
    // A new pad in slot 0 is unassigned: it drives player 1 until its own join press.
    pads = [pad(0, [14])];
    let s = input.poll();
    expect(input.padSeat(0)).toBe(PAD_SEAT_NONE);
    expect([s.players[0]?.held, s.players[1]?.held]).toEqual([Action.Left, 0]);
    pads = [pad(0, [14, 0])];
    s = input.poll();
    expect(input.padSeat(0)).toBe(PAD_SEAT_P2);
    expect(s.players[0]?.held).toBe(0);
    expect(s.players[1]?.held & Action.Left).toBe(Action.Left);
  });

  it('frees the seat for another pad on the same poll the seated one vanishes', () => {
    let pads: Array<GamepadLike | null> = [pad(0), pad(1, [9])];
    const input = createWebInput({ keyTarget: null, getGamepads: () => pads });
    input.setSeats(2);
    input.poll();
    expect(input.padSeat(1)).toBe(PAD_SEAT_P2);
    pads = [pad(0, [0])]; // pad 1 is gone; pad 0 presses A at once
    let s = input.poll();
    expect([input.padSeat(0), input.padSeat(1)]).toEqual([PAD_SEAT_P2, PAD_SEAT_NONE]);
    expect(s.players[1]?.pressed & Action.Confirm).toBe(Action.Confirm);
    // The same with a null entry for the seated pad (Chromium lists four slots).
    pads = [null, pad(1)];
    input.poll();
    pads = [pad(0), pad(1, [9])];
    input.poll();
    expect(input.padSeat(1)).toBe(PAD_SEAT_P2);
    pads = [pad(0, [9]), null];
    s = input.poll();
    expect([input.padSeat(0), input.padSeat(1)]).toEqual([PAD_SEAT_P2, PAD_SEAT_NONE]);
    expect(s.players[1]?.held).toBe(Action.Pause);
  });

  it('gives the seat up when the pad disconnects while one seat is routed', () => {
    let pads: Array<GamepadLike | null> = [pad(0, [9])];
    const input = createWebInput({ keyTarget: null, getGamepads: () => pads });
    input.setSeats(2);
    input.poll();
    input.setSeats(1);
    pads = [null];
    input.poll();
    expect(input.padSeat(0)).toBe(PAD_SEAT_NONE);
    input.setSeats(2);
    pads = [pad(0, [14])];
    const s = input.poll();
    expect([s.players[0]?.held, s.players[1]?.held]).toEqual([Action.Left, 0]);
  });
});

describe('input-web/web-input seats: a held button across a seat change (M2-06)', () => {
  it('does not press a seated pad`s held START again for player 1 when one seat is routed', () => {
    let pads: Array<GamepadLike | null> = [pad(0, [0])];
    const input = createWebInput({ keyTarget: null, getGamepads: () => pads });
    input.setProfile(profile('gamepad-standard'));
    input.setSeats(2);
    input.poll(); // A seats the pad
    pads = [pad(0)];
    input.poll();
    pads = [pad(0, [9])]; // player 2's START: the game opens the pause menu …
    let s = input.poll();
    expect(s.players[1]?.pressed).toBe(Action.Pause);
    input.setContext('menu'); // … and the host routes one seat for it
    input.setSeats(1);
    s = input.poll();
    // Still held, but no new press: the pause menu must not take it as "resume".
    expect(s.players[0]?.held).toBe(Action.Pause);
    expect(s.players[0]?.pressed).toBe(0);
    expect(s.players[1]?.held).toBe(0);
    s = input.poll();
    expect(s.players[0]?.pressed).toBe(0);
    pads = [pad(0)];
    input.poll();
    pads = [pad(0, [9])]; // a real second press does count
    s = input.poll();
    expect(s.players[0]?.pressed).toBe(Action.Pause);
  });

  it('does not press it again for player 2 when the game resumes (two seats)', () => {
    let pads: Array<GamepadLike | null> = [pad(0, [9])];
    const input = createWebInput({ keyTarget: null, getGamepads: () => pads });
    input.setSeats(2);
    input.poll(); // START seats the pad
    input.setSeats(1);
    pads = [pad(0)];
    input.poll();
    pads = [pad(0, [9])]; // START in the pause menu: resume …
    let s = input.poll();
    expect(s.players[0]?.pressed).toBe(Action.Pause);
    input.setSeats(2); // … the game is back on top
    s = input.poll();
    expect(s.players[1]?.held).toBe(Action.Pause);
    expect(s.players[1]?.pressed).toBe(0); // no pause again
    expect(s.players[0]?.released).toBe(Action.Pause);
  });

  it('does not press the split keyboard`s held keys again on their new player', () => {
    const input = createWebInput({ keyTarget: null });
    input.setProfile(profile('keyboard-split'));
    input.setSeats(2);
    input.splitKeyboard.handleEvent(key('keydown', 'Enter'));
    input.splitKeyboard.handleEvent(key('keydown', 'ArrowUp'));
    let s = input.poll();
    expect(s.players[1]?.pressed).toBe(Action.Pause | Action.Up);
    input.setSeats(1);
    s = input.poll();
    expect(s.players[0]?.held).toBe(Action.Pause | Action.Up);
    expect(s.players[0]?.pressed).toBe(0);
    input.setSeats(2);
    s = input.poll();
    expect(s.players[1]?.pressed).toBe(0);
    // A key pressed on the very poll of the change is a real press.
    input.setSeats(1);
    input.splitKeyboard.handleEvent(key('keydown', 'ArrowLeft'));
    s = input.poll();
    expect(s.players[0]?.pressed).toBe(Action.Left);
  });

  it('keeps an unseated pad`s held button without a new press (it stays player 1`s)', () => {
    let pads: Array<GamepadLike | null> = [pad(0, [15])];
    const input = createWebInput({ keyTarget: null, getGamepads: () => pads });
    let s = input.poll();
    expect(s.players[0]?.pressed).toBe(Action.Right);
    input.setSeats(2);
    s = input.poll();
    expect([s.players[0]?.held, s.players[0]?.pressed]).toEqual([Action.Right, 0]);
    pads = [pad(0)];
    input.setSeats(1);
    s = input.poll();
    expect(s.players[0]?.released).toBe(Action.Right);
  });
});

describe('input-web/web-input seats: routing details (M2-06)', () => {
  it('routes two seats only for exactly 2', () => {
    const input = createWebInput({ keyTarget: null });
    for (const count of [Number.NaN, 1.5, -2, 2.0000001, 1]) {
      input.setSeats(2);
      input.setSeats(count);
      expect(input.seats, String(count)).toBe(1);
    }
    input.setSeats(2.0);
    expect(input.seats).toBe(2);
  });

  it('delivers a tap on the split keyboard`s right half to player 2 as a press', () => {
    const input = createWebInput({ keyTarget: null });
    input.setProfile(profile('keyboard-split'));
    input.setSeats(2);
    input.splitKeyboard.handleEvent(key('keydown', 'Enter'));
    input.splitKeyboard.handleEvent(key('keyup', 'Enter')); // released before the poll
    let s = input.poll();
    expect(s.players[1]?.pressed & Action.Pause).toBe(Action.Pause);
    expect(s.players[0]?.pressed).toBe(0);
    s = input.poll();
    expect(s.players[1]?.pressed).toBe(0);
  });

  it('keeps the split keyboard when a gamepad profile is applied', () => {
    const input = createWebInput({ keyTarget: null });
    input.setProfile(profile('keyboard-split'));
    input.setProfile(profile('gamepad-standard'));
    expect(input.keyProfile?.id).toBe('keyboard-split');
    input.setSeats(2);
    input.splitKeyboard.handleEvent(key('keydown', 'ArrowLeft'));
    const s = input.poll();
    expect([s.players[0]?.held, s.players[1]?.held]).toEqual([0, Action.Left]);
  });

  it('switches the right half back to the game table', () => {
    const input = createWebInput({ keyTarget: null });
    input.setProfile(profile('keyboard-split'));
    input.setContext('menu');
    expect(input.splitKeyboard.bindings.byCode['KeyK']).toBe(Action.Confirm);
    input.setContext('game');
    expect(input.splitKeyboard.bindings.byCode['KeyK']).toBe(Action.PowerUp);
    expect(input.keyboard.bindings.byCode['KeyF']).toBe(Action.PowerUp);
  });

  it('listens on the key target with both halves and detaches both on destroy', () => {
    const counts = new Map<string, number>();
    /** An event target that counts its listeners per type. */
    class CountingTarget extends EventTarget {
      override addEventListener(
        type: string,
        listener: EventListenerOrEventListenerObject | null,
        options?: boolean | AddEventListenerOptions,
      ): void {
        counts.set(type, (counts.get(type) ?? 0) + 1);
        super.addEventListener(type, listener, options);
      }

      override removeEventListener(
        type: string,
        listener: EventListenerOrEventListenerObject | null,
        options?: boolean | EventListenerOptions,
      ): void {
        counts.set(type, (counts.get(type) ?? 0) - 1);
        super.removeEventListener(type, listener, options);
      }
    }
    const input = createWebInput({ keyTarget: new CountingTarget() });
    expect(counts.get('keydown')).toBe(2); // player 1's source and the split keyboard's
    expect(counts.get('keyup')).toBe(2);
    input.destroy();
    expect([...counts.values()].every((n) => n === 0)).toBe(true);
  });
});
