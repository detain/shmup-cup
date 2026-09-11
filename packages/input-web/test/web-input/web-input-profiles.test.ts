/**
 * The input-probe scenarios (input_probe_spec.md questions 1–3, plan M1-05) replayed as fake,
 * time-stamped key event sequences through a `WebInput` running the shipped profiles of
 * `content/input/`, polled at 60 Hz: a clean hold, fake key-up/key-down pairs (debounce 2 vs
 * 0), OK pressed while an arrow is held (arrow kept / dropped), two arrows under each diagonal
 * policy, SOCD, `game` vs `menu` contexts, and gamepad profiles.
 */
import { readFileSync } from 'node:fs';
import { Action } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import type { GamepadLike } from '../../src/gamepad/index.js';
import {
  loadInputProfiles,
  overrideInputTuning,
  type InputProfile,
} from '../../src/rebind/index.js';
import type { DiagonalPolicy, InputTuning, SocdPolicy } from '../../src/remote/index.js';
import { createWebInput, type WebInput } from '../../src/web-input/index.js';
import { key, pad } from '../helpers.js';

/** One simulation tick at 60 Hz, in ms. */
const TICK = 1000 / 60;

const { profiles, issues } = loadInputProfiles([
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
 * A shipped profile, optionally with other tuning.
 *
 * @param id - Profile id.
 * @param tuning - Tuning overrides.
 */
function profile(id: string, tuning: Partial<InputTuning> = {}): InputProfile {
  const found = profiles.find((p) => p.id === id);
  if (found === undefined) throw new Error(`no profile ${id}`);
  return overrideInputTuning(found, tuning);
}

/** A time-stamped key event of a scenario. */
interface TimedKey {
  /** Time in ms since the scenario started. */
  readonly t: number;
  /** Event type. */
  readonly type: 'keydown' | 'keyup';
  /** Legacy key code (remote keys arrive with an empty `code`). */
  readonly keyCode: number;
  /** `KeyboardEvent.code` ('' like the Samsung remote). */
  readonly code?: string;
  /** Auto-repeat flag. */
  readonly repeat?: boolean;
}

/** Player 1's input on every poll of a scenario. */
interface Trace {
  /** `held` per poll. */
  readonly held: number[];
  /** `pressed` per poll. */
  readonly pressed: number[];
  /** `released` per poll. */
  readonly released: number[];
}

/**
 * Feeds time-stamped events and polls every tick, like the frame loop does.
 *
 * @param input - The adapter.
 * @param events - Events (any order; sorted by time, stable).
 * @param durationMs - How long to run; polls happen at `k * TICK` for `k ≥ 1`.
 * @returns Player 1's trace.
 */
function run(input: WebInput, events: readonly TimedKey[], durationMs: number): Trace {
  const queue = events.slice().sort((a, b) => a.t - b.t);
  const trace: Trace = { held: [], pressed: [], released: [] };
  let next = 0;
  for (let k = 1; k * TICK <= durationMs; k++) {
    const now = k * TICK;
    while (next < queue.length && (queue[next]?.t ?? Infinity) <= now) {
      const event = queue[next++];
      input.keyboard.handleEvent(
        key(event.type, event.code ?? '', event.keyCode, { repeat: event.repeat ?? false }),
      );
    }
    const p1 = input.poll().players[0];
    trace.held.push(p1?.held ?? -1);
    trace.pressed.push(p1?.pressed ?? -1);
    trace.released.push(p1?.released ?? -1);
  }
  return trace;
}

/** How a remote reports a held key after its repeat delay. */
type RepeatStyle = 'clean' | 'no-flag' | 'fake-pairs';

/**
 * Events of one held remote key.
 *
 * @param keyCode - The key.
 * @param from - Keydown time.
 * @param to - Keyup time.
 * @param style - Repeat style (question 3 of the probe).
 * @param gap - Gap of a fake keyup/keydown pair, in ms.
 */
function hold(keyCode: number, from: number, to: number, style: RepeatStyle, gap = 30): TimedKey[] {
  const events: TimedKey[] = [{ t: from, type: 'keydown', keyCode }];
  for (let t = from + 500; t + gap < to; t += 100) {
    if (style === 'clean') events.push({ t, type: 'keydown', keyCode, repeat: true });
    else if (style === 'no-flag') events.push({ t, type: 'keydown', keyCode });
    else {
      events.push({ t, type: 'keyup', keyCode });
      events.push({ t: t + gap, type: 'keydown', keyCode });
    }
  }
  events.push({ t: to, type: 'keyup', keyCode });
  return events;
}

/**
 * Counts polls on which `bit` went from held to not held.
 *
 * @param trace - A trace.
 * @param bit - Action bit.
 */
const releases = (trace: Trace, bit: number): number =>
  trace.released.filter((mask) => (mask & bit) !== 0).length;

/**
 * Counts polls with a `pressed` edge of `bit`.
 *
 * @param trace - A trace.
 * @param bit - Action bit.
 */
const presses = (trace: Trace, bit: number): number =>
  trace.pressed.filter((mask) => (mask & bit) !== 0).length;

/**
 * Creates an adapter with a key profile.
 *
 * @param keyProfile - The profile.
 */
function remoteInput(keyProfile: InputProfile): WebInput {
  const input = createWebInput({ keyTarget: null, keyDevice: 'remote' });
  input.setProfile(keyProfile);
  return input;
}

const RIGHT = 39;
const UP = 38;
const LEFT = 37;
const DOWN = 40;
const OK = 13;

describe('input-web/web-input profiles: the shipped content', () => {
  it('parses without issues', () => {
    expect(issues).toEqual([]);
  });
});

describe('input-web/web-input probe scenarios (remote, tizen-remote-safe)', () => {
  it('clean hold: one press, continuous held, one release (repeat flags ignored)', () => {
    for (const style of ['clean', 'no-flag'] as const) {
      const trace = run(
        remoteInput(profile('tizen-remote-safe')),
        hold(RIGHT, 5, 1490, style),
        1700,
      );
      const heldPolls = trace.held.filter((mask) => mask === Action.Right).length;
      expect(presses(trace, Action.Right), style).toBe(1);
      expect(releases(trace, Action.Right), style).toBe(1);
      // Held from the first poll after the keydown until the debounce ran out after the keyup.
      expect(heldPolls, style).toBe(Math.floor(1490 / TICK) + 2);
    }
  });

  it('fake keyup/keydown pairs 30 ms apart: continuous with debounce 2, a stutter with 0', () => {
    const events = hold(RIGHT, 5, 1490, 'fake-pairs', 30);
    const safe = run(remoteInput(profile('tizen-remote-safe')), events, 1700);
    expect(presses(safe, Action.Right)).toBe(1);
    expect(releases(safe, Action.Right)).toBe(1); // only the real release

    const raw = run(remoteInput(profile('tizen-remote-diagonal')), events, 1700);
    expect(profile('tizen-remote-diagonal').releaseDebounceTicks).toBe(0);
    expect(releases(raw, Action.Right)).toBeGreaterThan(5); // stutter: gaps in the hold
    expect(presses(raw, Action.Right)).toBe(releases(raw, Action.Right));
  });

  it('debounce 2 hides any fake gap up to two ticks, wherever it falls between polls', () => {
    for (let offset = 0; offset < TICK; offset += 2) {
      const events = [
        { t: 1, type: 'keydown', keyCode: RIGHT },
        { t: 200 + offset, type: 'keyup', keyCode: RIGHT },
        { t: 200 + offset + 2 * TICK - 0.5, type: 'keydown', keyCode: RIGHT },
        { t: 600, type: 'keyup', keyCode: RIGHT },
      ] satisfies TimedKey[];
      const trace = run(remoteInput(profile('tizen-remote-safe')), events, 800);
      expect(releases(trace, Action.Right), `offset ${offset}`).toBe(1);
    }
  });

  it('OK pressed while an arrow is held (arrow kept): the ship keeps moving, PowerUp fires once', () => {
    const events = [
      ...hold(RIGHT, 5, 1010, 'clean'),
      { t: 405, type: 'keydown', keyCode: OK },
      { t: 485, type: 'keyup', keyCode: OK },
    ] satisfies TimedKey[];
    const trace = run(remoteInput(profile('tizen-remote-safe')), events, 1200);
    expect(releases(trace, Action.Right)).toBe(1);
    expect(presses(trace, Action.PowerUp)).toBe(1);
    expect(presses(trace, Action.Confirm)).toBe(0); // game context: OK = PowerUp (D15)
    const okPoll = Math.ceil(405 / TICK) - 1;
    expect(trace.held[okPoll]).toBe(Action.Right | Action.PowerUp);
  });

  it('OK pressed while an arrow is held (arrow dropped): the arrow releases after the debounce', () => {
    const events = [
      { t: 5, type: 'keydown', keyCode: RIGHT },
      { t: 405, type: 'keydown', keyCode: OK },
      { t: 420, type: 'keyup', keyCode: RIGHT }, // the remote drops the held arrow
      { t: 485, type: 'keyup', keyCode: OK },
    ] satisfies TimedKey[];
    const trace = run(remoteInput(profile('tizen-remote-safe')), events, 700);
    expect(presses(trace, Action.PowerUp)).toBe(1);
    const releasePoll = trace.released.findIndex((mask) => (mask & Action.Right) !== 0);
    expect(releasePoll).toBe(Math.ceil(420 / TICK) - 1 + 2);
  });

  it('a tap shorter than a tick still presses, and counts as held for the debounce window', () => {
    const events = [
      { t: 102, type: 'keydown', keyCode: OK },
      { t: 106, type: 'keyup', keyCode: OK }, // both between two polls
    ] satisfies TimedKey[];
    const trace = run(remoteInput(profile('tizen-remote-safe')), events, 300);
    expect(presses(trace, Action.PowerUp)).toBe(1);
    expect(trace.held.filter((mask) => mask === Action.PowerUp)).toHaveLength(2);
  });
});

describe('input-web/web-input diagonal policies (two arrows)', () => {
  /** Right, then Up 100 ms later; Right released at 300 ms, Up at 500 ms. */
  const events = [
    { t: 5, type: 'keydown', keyCode: RIGHT },
    { t: 105, type: 'keydown', keyCode: UP },
    { t: 305, type: 'keyup', keyCode: RIGHT },
    { t: 505, type: 'keyup', keyCode: UP },
  ] satisfies TimedKey[];
  /** Poll index right after `t` ms. */
  const at = (t: number): number => Math.ceil(t / TICK) - 1;

  it.each<[DiagonalPolicy, number, number]>([
    ['combine', Action.Up | Action.Right, Action.Up],
    ['lastWins', Action.Up, Action.Up],
    ['firstWins', Action.Right, Action.Up],
  ])('%s', (diagonals, both, afterRightReleased) => {
    const trace = run(remoteInput(profile('tizen-remote-diagonal', { diagonals })), events, 700);
    expect(trace.held[at(55)]).toBe(Action.Right);
    expect(trace.held[at(205)]).toBe(both);
    expect(trace.held[at(405)]).toBe(afterRightReleased);
    expect(trace.held[at(605)]).toBe(0);
  });

  it('lastWins brings the first arrow back when the second is released', () => {
    const trace = run(
      remoteInput(profile('tizen-remote-diagonal', { diagonals: 'lastWins' })),
      [
        { t: 5, type: 'keydown', keyCode: RIGHT },
        { t: 105, type: 'keydown', keyCode: UP },
        { t: 205, type: 'keyup', keyCode: UP },
        { t: 305, type: 'keyup', keyCode: RIGHT },
      ],
      400,
    );
    expect(trace.held[at(155)]).toBe(Action.Up);
    expect(trace.held[at(255)]).toBe(Action.Right);
  });

  it('keyboard-remote-emulation feels like the remote: the second arrow replaces the first', () => {
    const input = createWebInput({ keyTarget: null });
    input.setProfile(profile('keyboard-remote-emulation'));
    input.keyboard.handleEvent(key('keydown', 'ArrowRight', RIGHT));
    input.keyboard.handleEvent(key('keydown', 'ArrowDown', DOWN));
    const p1 = input.poll().players[0];
    expect(p1?.held).toBe(Action.Down);
    expect(p1?.device).toBe('remote');
  });
});

describe('input-web/web-input SOCD policies (Left + Right)', () => {
  const events = [
    { t: 5, type: 'keydown', keyCode: LEFT },
    { t: 105, type: 'keydown', keyCode: RIGHT },
    { t: 205, type: 'keyup', keyCode: RIGHT },
    { t: 305, type: 'keyup', keyCode: LEFT },
  ] satisfies TimedKey[];
  const at = (t: number): number => Math.ceil(t / TICK) - 1;

  it.each<[SocdPolicy, number]>([
    ['neutral', 0],
    ['lastWins', Action.Right],
  ])('%s', (socd, both) => {
    const trace = run(remoteInput(profile('tizen-remote-diagonal', { socd })), events, 400);
    expect(trace.held[at(55)]).toBe(Action.Left);
    expect(trace.held[at(155)]).toBe(both);
    expect(trace.held[at(255)]).toBe(Action.Left);
  });

  it('neutral also cancels Up + Down, keyboard-default style', () => {
    const input = createWebInput({ keyTarget: null });
    input.setProfile(profile('keyboard-default'));
    input.keyboard.handleEvent(key('keydown', 'KeyW', 87));
    input.keyboard.handleEvent(key('keydown', 'ArrowDown', DOWN));
    input.keyboard.handleEvent(key('keydown', 'KeyD', 68));
    expect(input.poll().players[0]?.held).toBe(Action.Right);
  });
});

describe('input-web/web-input binding contexts (D15)', () => {
  it('menu and game resolve keyboard X and remote OK differently', () => {
    const keyboard = createWebInput({ keyTarget: null });
    keyboard.setProfile(profile('keyboard-default'));
    keyboard.keyboard.handleEvent(key('keydown', 'KeyX', 88));
    expect(keyboard.poll().players[0]?.pressed).toBe(Action.Sub);
    keyboard.keyboard.handleEvent(key('keyup', 'KeyX', 88));
    keyboard.poll();
    keyboard.setContext('menu');
    expect(keyboard.context).toBe('menu');
    keyboard.keyboard.handleEvent(key('keydown', 'KeyX', 88));
    expect(keyboard.poll().players[0]?.pressed).toBe(Action.Back);

    const remote = remoteInput(profile('tizen-remote-diagonal'));
    remote.keyboard.handleEvent(key('keydown', '', OK));
    remote.keyboard.handleEvent(key('keyup', '', OK));
    expect(remote.poll().players[0]?.pressed).toBe(Action.PowerUp);
    remote.setContext('menu');
    remote.keyboard.handleEvent(key('keydown', '', OK));
    remote.keyboard.handleEvent(key('keyup', '', OK));
    expect(remote.poll().players[0]?.pressed).toBe(Action.Confirm);
    remote.keyboard.handleEvent(key('keydown', '', 10009));
    expect(remote.poll().players[0]?.pressed).toBe(Action.Back);
  });

  it('a key held across a switch keeps only the actions of both tables — no phantom press', () => {
    const input = createWebInput({ keyTarget: null });
    input.setProfile(profile('keyboard-default'));
    input.keyboard.handleEvent(key('keydown', 'KeyX', 88)); // Sub in the game
    input.keyboard.handleEvent(key('keydown', 'ArrowLeft', LEFT));
    expect(input.poll().players[0]?.held).toBe(Action.Sub | Action.Left);
    input.setContext('menu');
    const p1 = input.poll().players[0];
    expect(p1?.held).toBe(Action.Left); // X would be Back in menus: not pressed by the switch
    expect(p1?.pressed).toBe(0);
    input.keyboard.handleEvent(key('keyup', 'KeyX', 88));
    input.keyboard.handleEvent(key('keydown', 'KeyX', 88));
    expect(input.poll().players[0]?.pressed).toBe(Action.Back);
  });

  it('keys bound only in the other context stay tracked and prevented', () => {
    const input = remoteInput(profile('tizen-remote-safe'));
    input.setContext('menu');
    const channel = key('keydown', '', 427); // Ch+: Special in the game, nothing in menus
    input.keyboard.handleEvent(channel);
    expect(channel.prevented).toBe(true);
    expect(input.poll().players[0]?.held).toBe(0);
    input.setContext('game');
    expect(input.poll().players[0]?.held).toBe(0); // held across the switch: 0 & Special
  });

  it('setContext is a no-op without a change or a profile', () => {
    const input = createWebInput({ keyTarget: null });
    const table = input.keyboard.bindings;
    input.setContext('menu');
    expect(input.keyboard.bindings).toBe(table);
    input.setProfile(profile('keyboard-default'));
    const menu = input.keyboard.bindings;
    input.setContext('menu');
    expect(input.keyboard.bindings).toBe(menu);
    expect(input.keyProfile?.id).toBe('keyboard-default');
    expect(input.gamepadProfile).toBeNull();
  });
});

describe('input-web/web-input gamepad profiles', () => {
  it('uses the profile buttons per context and never debounces pads', () => {
    let pads: Array<GamepadLike | null> = [pad(0, [0])];
    const input = createWebInput({ keyTarget: null, getGamepads: () => pads });
    input.setProfile(profile('gamepad-standard'));
    expect(input.gamepadProfile?.id).toBe('gamepad-standard');
    expect(input.poll().players[0]?.held).toBe(Action.Shot);
    pads = [pad(0)];
    expect(input.poll().players[0]?.held).toBe(0);
    input.setContext('menu');
    pads = [pad(0, [0])];
    expect(input.poll().players[0]?.pressed).toBe(Action.Confirm);
  });

  it('a button held across a switch keeps only the actions of both tables until released', () => {
    let pads: Array<GamepadLike | null> = [pad(0, [1, 12])];
    const input = createWebInput({ keyTarget: null, getGamepads: () => pads });
    input.setProfile(profile('gamepad-standard'));
    expect(input.poll().players[0]?.held).toBe(Action.Sub | Action.Up);
    input.setContext('menu');
    expect(input.poll().players[0]?.held).toBe(Action.Up); // B would be Back: not pressed
    pads = [pad(0, [12])];
    input.poll();
    pads = [pad(0, [1, 12])];
    expect(input.poll().players[0]?.pressed).toBe(Action.Back);
  });

  it('applies the gamepad profile policies with a per-pad press order', () => {
    let pads: Array<GamepadLike | null> = [pad(0, [15])];
    const input = createWebInput({ keyTarget: null, getGamepads: () => pads });
    input.setProfile(profile('gamepad-standard', { diagonals: 'lastWins' }));
    input.poll();
    pads = [pad(0, [15, 12])];
    expect(input.poll().players[0]?.held).toBe(Action.Up);
    pads = [pad(0, [14, 15])];
    expect(input.poll().players[0]?.held).toBe(0); // SOCD neutral
    expect(profile('gamepad-standard', { releaseDebounceTicks: 4 }).releaseDebounceTicks).toBe(0);
  });

  it('a key profile does not touch the pads and vice versa', () => {
    const pads: Array<GamepadLike | null> = [pad(0, [0])];
    const input = createWebInput({ keyTarget: null, getGamepads: () => pads });
    input.setProfile(profile('keyboard-default'));
    expect(input.poll().players[0]?.held).toBe(Action.Shot | Action.Confirm); // built-in pad map
    input.setProfile(profile('gamepad-standard'));
    expect(input.keyProfile?.id).toBe('keyboard-default');
  });
});
