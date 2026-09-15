/**
 * Player seats and the split keyboard of the browser input adapter (plan M2-06, shmup_feat.md §4
 * "press Start to join", §16 co-op): with one seat every device drives player 1; with two seats the
 * keyboard / remote stays player 1's, an unassigned pad drives player 1 until its first join press
 * (the gamepad profile's menu Confirm / Pause buttons) seats it as player 2 and forwards a latched
 * Confirm there, a seated pad keeps its seat across games until it disconnects (other pads then
 * drive player 1 again), and a `keyboard-split` profile routes its right half to player 2 in a
 * co-op game (both halves drive player 1 otherwise) — with no allocation per poll.
 */
import { readFileSync } from 'node:fs';
import { Action } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import type { GamepadLike } from '../../src/gamepad/index.js';
import { loadInputProfiles, type InputProfile } from '../../src/rebind/index.js';
import * as inputWeb from '../../src/index.js';
import { PAD_SEAT_NONE, PAD_SEAT_P2, createWebInput } from '../../src/web-input/index.js';
import { key, pad } from '../helpers.js';
import { measureHeapGrowth } from '../../../core/test/helpers/alloc.js';

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

describe('input-web/web-input seats (M2-06)', () => {
  it('exports the pad-seat constants from the package entry', () => {
    expect(inputWeb.PAD_SEAT_NONE).toBe(PAD_SEAT_NONE);
    expect(inputWeb.PAD_SEAT_P2).toBe(PAD_SEAT_P2);
    expect(PAD_SEAT_NONE).not.toBe(PAD_SEAT_P2);
  });

  it('starts with one seat and clamps setSeats to 1 or 2', () => {
    const input = createWebInput({ keyTarget: null });
    expect(input.seats).toBe(1);
    input.setSeats(2);
    expect(input.seats).toBe(2);
    input.setSeats(3);
    expect(input.seats).toBe(1);
    input.setSeats(2);
    input.setSeats(0);
    expect(input.seats).toBe(1);
    expect(input.padSeat(0)).toBe(PAD_SEAT_NONE);
    expect(input.padSeat(-1)).toBe(PAD_SEAT_NONE);
    expect(input.padSeat(9)).toBe(PAD_SEAT_NONE);
  });

  it('lets an unassigned pad drive player 1 until its first START or A seats it as player 2', () => {
    let pads: Array<GamepadLike | null> = [pad(0, [15])];
    const input = createWebInput({ keyTarget: null, getGamepads: () => pads, keyDevice: 'remote' });
    input.setProfile(profile('gamepad-standard'));
    input.setSeats(2);
    let s = input.poll();
    expect([s.players[0]?.held, s.players[1]?.held]).toEqual([Action.Right, 0]);
    // X (PowerUp) is no join press; A (menu Confirm) is.
    pads = [pad(0, [15, 2])];
    s = input.poll();
    expect(s.players[0]?.held).toBe(Action.Right | Action.PowerUp);
    expect(input.padSeat(0)).toBe(PAD_SEAT_NONE);
    pads = [pad(0, [15, 2, 0])];
    s = input.poll();
    expect(input.padSeat(0)).toBe(PAD_SEAT_P2);
    expect(s.players[0]?.held).toBe(0);
    expect(s.players[1]?.held).toBe(Action.Right | Action.PowerUp | Action.Shot);
    expect(s.players[1]?.pressed & Action.Confirm).toBe(Action.Confirm);
    expect(s.players[1]?.device).toBe('gamepad');
    // The keyboard / remote stays player 1's.
    input.keyboard.handleEvent(key('keydown', '', 38));
    s = input.poll();
    expect(s.players[0]?.held).toBe(Action.Up);
    expect(s.players[0]?.device).toBe('remote');
    expect(s.players[1]?.pressed & Action.Confirm).toBe(0); // latched once
  });

  it('seats one pad only: the others drive player 1 once the seat is taken', () => {
    let pads: Array<GamepadLike | null> = [pad(0), pad(1, [9])];
    const input = createWebInput({ keyTarget: null, getGamepads: () => pads });
    input.setSeats(2);
    input.poll(); // pad 1's START (Pause in the default buttons)
    expect([input.padSeat(0), input.padSeat(1)]).toEqual([PAD_SEAT_NONE, PAD_SEAT_P2]);
    pads = [pad(0, [9, 12]), pad(1, [13])];
    const s = input.poll();
    expect(input.padSeat(0)).toBe(PAD_SEAT_NONE); // no second seat
    expect(s.players[0]?.held).toBe(Action.Pause | Action.Up);
    expect(s.players[1]?.held).toBe(Action.Down);
  });

  it('folds a seated pad into player 1 with one seat, and keeps its seat for the next co-op game', () => {
    let pads: Array<GamepadLike | null> = [pad(0, [9])];
    const input = createWebInput({ keyTarget: null, getGamepads: () => pads });
    input.setSeats(2);
    input.poll();
    expect(input.padSeat(0)).toBe(PAD_SEAT_P2);
    input.setSeats(1); // the pause menu, the title, a one-player game
    pads = [pad(0, [14])];
    let s = input.poll();
    expect([s.players[0]?.held, s.players[1]?.held]).toEqual([Action.Left, 0]);
    input.setSeats(2);
    s = input.poll();
    expect([s.players[0]?.held, s.players[1]?.held]).toEqual([0, Action.Left]);
  });

  it('gives the seat up when the pad disconnects', () => {
    let pads: Array<GamepadLike | null> = [pad(0, [9])];
    const input = createWebInput({ keyTarget: null, getGamepads: () => pads });
    input.setSeats(2);
    input.poll();
    expect(input.padSeat(0)).toBe(PAD_SEAT_P2);
    pads = [{ ...pad(0), connected: false }];
    input.poll();
    expect(input.padSeat(0)).toBe(PAD_SEAT_NONE);
    pads = [pad(0), pad(1, [0])];
    input.poll(); // another pad's A takes the free seat
    expect(input.padSeat(1)).toBe(PAD_SEAT_P2);
    pads = [null, pad(1)];
    input.poll();
    expect(input.padSeat(0)).toBe(PAD_SEAT_NONE);
    expect(input.padSeat(1)).toBe(PAD_SEAT_P2);
    pads = [null, null];
    input.poll();
    expect(input.padSeat(1)).toBe(PAD_SEAT_NONE);
  });
});

describe('input-web/web-input split keyboard (M2-06)', () => {
  it('routes the right half to player 2 in a co-op game, both halves to player 1 otherwise', () => {
    const input = createWebInput({ keyTarget: null });
    input.setProfile(profile('keyboard-split'));
    expect(input.splitKeyboard.bindings.byCode['ArrowUp']).toBe(Action.Up);
    expect(input.keyboard.bindings.byCode['ArrowUp']).toBeUndefined();
    input.keyboard.handleEvent(key('keydown', 'KeyW'));
    input.splitKeyboard.handleEvent(key('keydown', 'ArrowDown'));
    let s = input.poll();
    expect([s.players[0]?.held, s.players[1]?.held]).toEqual([Action.Up | Action.Down, 0]);
    input.setSeats(2);
    s = input.poll();
    expect([s.players[0]?.held, s.players[1]?.held]).toEqual([Action.Up, Action.Down]);
    expect(s.players[1]?.device).toBe('keyboard');
    // Player 2's START (Enter) — the World's join press.
    input.splitKeyboard.handleEvent(key('keydown', 'Enter'));
    s = input.poll();
    expect(s.players[1]?.pressed).toBe(Action.Pause);
    // K / L: PowerUp and Special + Speed in the game.
    input.splitKeyboard.handleEvent(key('keydown', 'KeyL'));
    expect(input.poll().players[1]?.held).toBe(
      Action.Down | Action.Pause | Action.Special | Action.Speed,
    );
  });

  it('keeps pads off player 2`s seat while the keyboard is split', () => {
    const pads: Array<GamepadLike | null> = [pad(0, [9])];
    const input = createWebInput({ keyTarget: null, getGamepads: () => pads });
    input.setProfile(profile('keyboard-split'));
    input.setSeats(2);
    const s = input.poll();
    expect(input.padSeat(0)).toBe(PAD_SEAT_NONE);
    expect([s.players[0]?.held, s.players[1]?.held]).toEqual([Action.Pause, 0]);
  });

  it('switches both halves to the menu tables, and unbinds the second half without a split', () => {
    const input = createWebInput({ keyTarget: null });
    input.setProfile(profile('keyboard-split'));
    input.setContext('menu');
    expect(input.splitKeyboard.bindings.byCode['KeyK']).toBe(Action.Confirm);
    expect(input.keyboard.bindings.byCode['KeyF']).toBe(Action.Confirm);
    input.setProfile(profile('keyboard-default'));
    expect(Object.keys(input.splitKeyboard.bindings.byCode)).toEqual([]);
    input.setSeats(2);
    input.splitKeyboard.handleEvent(key('keydown', 'ArrowUp'));
    input.keyboard.handleEvent(key('keydown', 'ArrowUp'));
    const s = input.poll();
    expect([s.players[0]?.held, s.players[1]?.held]).toEqual([Action.Up, 0]);
  });

  it('clears both halves', () => {
    const input = createWebInput({ keyTarget: null });
    input.setProfile(profile('keyboard-split'));
    input.setSeats(2);
    input.splitKeyboard.handleEvent(key('keydown', 'ArrowUp'));
    expect(input.poll().players[1]?.held).toBe(Action.Up);
    input.clear();
    expect(input.poll().players[1]?.held).toBe(0);
  });

  it('polls two seats, a split keyboard and pads without allocating', () => {
    // Pad 0's stick sweeps round: its axes read new values on every poll, as a real stick's do.
    const axes = [0.5, 0.5, 0, 0];
    const idle = pad(0, [], axes);
    const firing = pad(0, [0, 12], axes);
    const pads: Array<GamepadLike | null> = [idle, pad(1, [9])];
    const input = createWebInput({ keyTarget: null, getGamepads: () => pads });
    input.setProfile(profile('keyboard-split'));
    input.setSeats(2);
    const down = key('keydown', 'ArrowUp');
    const up = key('keyup', 'ArrowUp');
    const step = (i: number): void => {
      axes[0] = Math.sin(i / 40);
      axes[1] = Math.cos(i / 57);
      pads[0] = (i & 8) === 0 ? idle : firing;
      input.splitKeyboard.handleEvent((i & 4) === 0 ? down : up);
      input.poll();
    };
    // Best of three windows after a long warm-up, like the profiles' guard (a tier-up can cost one
    // window; a real per-poll allocation shows in every window — one heap number per poll would be
    // ~160 KB).
    const { bytes } = measureHeapGrowth(step, 10_000, 20_000, 3);
    expect(bytes).toBeLessThan(128 * 1024);
  });
});
