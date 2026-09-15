/**
 * Edge cases of `WebInput` with the shipped input profiles: applying a profile while a menu is
 * open, switching key profiles and contexts while keys are held or releasing, the exact
 * boundary of the release debounce against fake key-up/key-down gaps for several windows,
 * gamepad profiles (repeated applies, per-pad press order, empty slots), the keyCode-fallback
 * regression, and the zero-allocation rule for `poll()` / `setContext()` (plan §1.3).
 */
import { readFileSync } from 'node:fs';
import { Action } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import type { GamepadLike } from '../../src/gamepad/index.js';
import {
  loadInputProfiles,
  overrideInputTuning,
  parseInputProfiles,
  type InputProfile,
} from '../../src/rebind/index.js';
import type { InputTuning } from '../../src/remote/index.js';
import { createWebInput, type WebInput } from '../../src/web-input/index.js';
import { key, pad } from '../helpers.js';
import { measureHeapGrowth } from '../../../core/test/helpers/alloc.js';

/** One simulation tick at 60 Hz, in ms. */
const TICK = 1000 / 60;

const RIGHT = 39;
const UP = 38;
const LEFT = 37;
const OK = 13;
const BACK = 10009;

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
 * A shipped profile, optionally with other tuning.
 *
 * @param id - Profile id.
 * @param tuning - Tuning overrides.
 */
function profile(id: string, tuning: Partial<InputTuning> = {}): InputProfile {
  const found = shipped.profiles.find((p) => p.id === id);
  if (found === undefined) throw new Error(`no profile ${id}`);
  return overrideInputTuning(found, tuning);
}

/**
 * An adapter without listeners, with a key profile applied.
 *
 * @param keyProfile - The profile.
 */
function withProfile(keyProfile: InputProfile): WebInput {
  const input = createWebInput({ keyTarget: null });
  input.setProfile(keyProfile);
  return input;
}

/**
 * Player 1 after one poll.
 *
 * @param input - The adapter.
 */
function p1(input: WebInput) {
  const player = input.poll().players[0];
  if (player === undefined) throw new Error('no player 1');
  return {
    held: player.held,
    pressed: player.pressed,
    released: player.released,
    device: player.device,
  };
}

describe('input-web/web-input profile application', () => {
  it('shipped content has no issues (precondition)', () => {
    expect(shipped.issues).toEqual([]);
  });

  it('a profile applied while the menu is open uses its menu table right away', () => {
    const input = createWebInput({ keyTarget: null });
    input.setContext('menu');
    input.setProfile(profile('tizen-remote-safe'));
    expect(input.keyboard.bindings).toBe(profile('tizen-remote-safe').tables.menu.keys);
    input.keyboard.handleEvent(key('keydown', '', OK));
    expect(p1(input).pressed).toBe(Action.Confirm);
  });

  it('the key profile sets the device kind, the tuning and the tables', () => {
    const input = createWebInput({ keyTarget: null, keyDevice: 'remote' });
    const keyboard = profile('keyboard-default');
    input.setProfile(keyboard);
    expect(input.keyboard.tuning).toBe(keyboard);
    expect(input.keyboard.bindings).toBe(keyboard.tables.game.keys);
    input.keyboard.handleEvent(key('keydown', 'KeyZ', 90));
    expect(p1(input).device).toBe('keyboard'); // the profile's device replaces keyDevice
  });

  it('switching key profiles while keys are held keeps only what both profiles bind', () => {
    const input = withProfile(profile('keyboard-default'));
    input.keyboard.handleEvent(key('keydown', 'ArrowRight', RIGHT));
    input.keyboard.handleEvent(key('keydown', 'KeyZ', 90)); // Shot — unknown to the emulation
    expect(p1(input).held).toBe(Action.Right | Action.Shot);
    input.setProfile(profile('keyboard-remote-emulation'));
    const after = p1(input);
    expect(after.held).toBe(Action.Right);
    expect(after.pressed).toBe(0);
    expect(after.device).toBe('remote');
    // KeyZ's keyup still frees its slot (it is prevented as ours) once the emulation's
    // 2-tick debounce ran out; after that Z is a key this profile does not know.
    const up = key('keyup', 'KeyZ', 90);
    input.keyboard.handleEvent(up);
    expect(up.prevented).toBe(true);
    const resumed = key('keydown', 'KeyZ', 90);
    input.keyboard.handleEvent(resumed); // inside the window: resumes the (empty) slot
    expect(resumed.prevented).toBe(true);
    input.keyboard.handleEvent(key('keyup', 'KeyZ', 90));
    for (let i = 0; i < 3; i++) expect(p1(input).held).toBe(Action.Right);
    const again = key('keydown', 'KeyZ', 90);
    input.keyboard.handleEvent(again);
    expect(again.prevented).toBe(false);
    expect(p1(input).held).toBe(Action.Right);
  });

  it('a profile with a shorter debounce releases pending keys at once', () => {
    const input = withProfile(profile('tizen-remote-safe'));
    input.keyboard.handleEvent(key('keydown', '', RIGHT));
    p1(input);
    input.keyboard.handleEvent(key('keyup', '', RIGHT));
    expect(p1(input).held).toBe(Action.Right); // pending (window 2)
    input.setProfile(profile('tizen-remote-diagonal')); // window 0
    const after = p1(input);
    expect(after.held).toBe(0);
    expect(after.released).toBe(Action.Right);
  });

  it('a context switch during a pending release keeps the arrow until the window ends', () => {
    const input = withProfile(profile('tizen-remote-safe'));
    input.keyboard.handleEvent(key('keydown', '', UP));
    p1(input);
    input.keyboard.handleEvent(key('keyup', '', UP));
    expect(p1(input).held).toBe(Action.Up);
    input.setContext('menu');
    expect(p1(input).held).toBe(Action.Up);
    expect(p1(input).released).toBe(Action.Up);
  });

  it('Back is Pause in the game and Back in menus, with no phantom edge on the switch', () => {
    const input = withProfile(profile('tizen-remote-safe'));
    input.keyboard.handleEvent(key('keydown', '', BACK));
    expect(p1(input).pressed).toBe(Action.Pause);
    input.setContext('menu'); // the pause menu opens while Back is still down
    const opened = p1(input);
    expect(opened.held).toBe(0);
    expect(opened.pressed).toBe(0);
    expect(opened.released).toBe(Action.Pause);
    input.keyboard.handleEvent(key('keyup', '', BACK));
    for (let i = 0; i < 3; i++) p1(input);
    input.keyboard.handleEvent(key('keydown', '', BACK));
    expect(p1(input).pressed).toBe(Action.Back);
  });

  it('Play/Pause means Pause in both contexts, so holding it across a switch keeps it', () => {
    const input = withProfile(profile('tizen-remote-safe'));
    input.keyboard.handleEvent(key('keydown', '', 10252));
    expect(p1(input).held).toBe(Action.Pause);
    input.setContext('menu');
    const after = p1(input);
    expect(after.held).toBe(Action.Pause);
    expect(after.pressed).toBe(0);
  });

  // Regression (M1-05 tests): a profile that binds Enter by code in one context and OK (13) by
  // keyCode in the other lost the keyCode binding to the other context's 0 placeholder.
  it('a desktop Enter reaches a keyCode binding in the context that does not bind its code', () => {
    const { profiles, issues } = parseInputProfiles({
      formatVersion: 1,
      kind: 'input-profiles',
      profiles: [
        {
          id: 'mixed',
          label: 'MIXED',
          device: 'keyboard',
          context: {
            game: {
              byCode: { Enter: ['PowerUp'] },
              byKeyCode: {
                '37': ['Left'],
                '38': ['Up'],
                '39': ['Right'],
                '40': ['Down'],
                '80': ['Pause'],
              },
            },
            menu: {
              byCode: {},
              byKeyCode: {
                '13': ['Confirm'],
                '8': ['Back'],
                '37': ['Left'],
                '38': ['Up'],
                '39': ['Right'],
                '40': ['Down'],
              },
            },
          },
          releaseDebounceTicks: 0,
          diagonals: 'combine',
          socd: 'neutral',
          register: [],
        },
      ],
    });
    expect(issues).toEqual([]);
    const input = withProfile(profiles[0]);
    input.keyboard.handleEvent(key('keydown', 'Enter', OK));
    expect(p1(input).pressed).toBe(Action.PowerUp);
    input.keyboard.handleEvent(key('keyup', 'Enter', OK));
    p1(input);
    input.setContext('menu');
    input.keyboard.handleEvent(key('keydown', 'Enter', OK));
    expect(p1(input).pressed).toBe(Action.Confirm);
  });
});

describe('input-web/web-input debounce boundary against fake gaps', () => {
  /**
   * Counts `released` edges of Right while a fake gap of `gapMs` sits in a long hold.
   *
   * @param debounce - Release debounce.
   * @param gapMs - Gap between the fake keyup and keydown.
   * @param offsetMs - Where the keyup falls after a poll.
   */
  function releasesWithGap(debounce: number, gapMs: number, offsetMs: number): number {
    const input = withProfile(profile('tizen-remote-safe', { releaseDebounceTicks: debounce }));
    const events: Array<[number, 'keydown' | 'keyup']> = [
      [1, 'keydown'],
      [20 * TICK + offsetMs, 'keyup'],
      [20 * TICK + offsetMs + gapMs, 'keydown'],
      [60 * TICK + 1, 'keyup'],
    ];
    let next = 0;
    let releases = 0;
    for (let k = 1; k <= 80; k++) {
      while (next < events.length && (events[next]?.[0] ?? Infinity) <= k * TICK) {
        const [, type] = events[next++];
        input.keyboard.handleEvent(key(type, '', RIGHT));
      }
      if ((input.poll().players[0]?.released ?? 0) & Action.Right) releases++;
    }
    return releases;
  }

  it.each([1, 2, 3, 4])(
    'window %i hides every gap up to that many ticks and shows every gap a tick longer',
    (ticks) => {
      for (const offset of [0.5, TICK / 2, TICK - 0.5]) {
        expect(releasesWithGap(ticks, ticks * TICK - 0.25, offset), `offset ${offset}`).toBe(1);
        expect(releasesWithGap(ticks, (ticks + 1) * TICK + 0.25, offset), `offset ${offset}`).toBe(
          2,
        );
      }
    },
  );

  it('window 0 shows any gap that spans a poll', () => {
    expect(releasesWithGap(0, TICK + 0.25, 0.5)).toBe(2);
    expect(releasesWithGap(0, 2, TICK - 1)).toBe(2); // keyup just before a poll, keydown after
  });
});

describe('input-web/web-input gamepad profiles (edge cases)', () => {
  it('re-applying the pad profile (or a tuning copy) never makes held buttons stale', () => {
    const pads: Array<GamepadLike | null> = [pad(0, [1])];
    const input = createWebInput({ keyTarget: null, getGamepads: () => pads });
    input.setProfile(profile('gamepad-standard'));
    expect(p1(input).held).toBe(Action.Sub);
    input.setProfile(profile('gamepad-standard'));
    input.setProfile(profile('gamepad-standard', { diagonals: 'lastWins' }));
    const after = p1(input);
    expect(after.held).toBe(Action.Sub);
    expect(after.pressed).toBe(0);
  });

  it('switching contexts back and forth while B is held never presses Back or Sub again', () => {
    const pads: Array<GamepadLike | null> = [pad(0, [1])];
    const input = createWebInput({ keyTarget: null, getGamepads: () => pads });
    input.setProfile(profile('gamepad-standard'));
    p1(input);
    input.setContext('menu');
    expect(p1(input)).toMatchObject({ held: 0, pressed: 0 });
    input.setContext('game');
    expect(p1(input)).toMatchObject({ held: 0, pressed: 0 }); // still the stale press
  });

  it('a pad context switch without a key profile leaves the built-in key bindings in place', () => {
    const pads: Array<GamepadLike | null> = [pad(0)];
    const input = createWebInput({ keyTarget: null, getGamepads: () => pads });
    const builtIn = input.keyboard.bindings;
    input.setProfile(profile('gamepad-standard'));
    input.setContext('menu');
    expect(input.keyboard.bindings).toBe(builtIn);
    expect(input.keyProfile).toBeNull();
    pads[0] = pad(0, [0]);
    expect(p1(input).pressed).toBe(Action.Confirm);
  });

  it('firstWins on a pad keeps the first D-pad direction', () => {
    let pads: Array<GamepadLike | null> = [pad(0, [12])];
    const input = createWebInput({ keyTarget: null, getGamepads: () => pads });
    input.setProfile(profile('gamepad-standard', { diagonals: 'firstWins' }));
    p1(input);
    pads = [pad(0, [12, 15])];
    expect(p1(input).held).toBe(Action.Up);
    pads = [pad(0, [15])];
    expect(p1(input).held).toBe(Action.Right);
  });

  it('keeps a separate press order per pad (players 1 and 2)', () => {
    let pads: Array<GamepadLike | null> = [pad(0, [15]), pad(1, [9])];
    const input = createWebInput({ keyTarget: null, getGamepads: () => pads });
    input.setProfile(profile('gamepad-standard', { diagonals: 'lastWins' }));
    input.setSeats(2);
    input.poll(); // pad 1's START takes player 2's seat (M2-06)
    pads = [pad(0, [15]), pad(1, [12])];
    input.poll();
    pads = [pad(0, [15, 12]), pad(1, [12, 15])];
    const snapshot = input.poll();
    expect(snapshot.players[0]?.held).toBe(Action.Up); // pad 0: Up is newer
    expect(snapshot.players[1]?.held).toBe(Action.Right); // pad 1: Right is newer
  });

  it('an empty slot forgets the pad’s press order (a held direction counts as new again)', () => {
    let pads: Array<GamepadLike | null> = [pad(0, [12])];
    const input = createWebInput({ keyTarget: null, getGamepads: () => pads });
    input.setProfile(profile('gamepad-standard', { diagonals: 'lastWins' }));
    input.poll();
    pads = [pad(0, [12, 15])];
    expect(p1(input).held).toBe(Action.Right);
    pads = [null];
    input.poll();
    pads = [pad(0, [12, 15])]; // both reappear together: a tie keeps the vertical one
    expect(p1(input).held).toBe(Action.Up);
  });

  it('SOCD lastWins on a pad keeps the newer of Left/Right', () => {
    let pads: Array<GamepadLike | null> = [pad(0, [14])];
    const input = createWebInput({ keyTarget: null, getGamepads: () => pads });
    input.setProfile(profile('gamepad-standard', { socd: 'lastWins' }));
    input.poll();
    pads = [pad(0, [14, 15])];
    expect(p1(input).held).toBe(Action.Right);
  });
});

describe('input-web/web-input allocations (plan §1.3)', () => {
  it('poll() with profiles, debounce, policies and pads allocates next to nothing', () => {
    const idle = pad(0);
    const firing = pad(0, [0, 12, 15]);
    const pads: Array<GamepadLike | null> = [idle, null];
    const input = createWebInput({ keyTarget: null, getGamepads: () => pads });
    input.setProfile(profile('tizen-remote-safe', { diagonals: 'lastWins', socd: 'lastWins' }));
    input.setProfile(profile('gamepad-standard', { diagonals: 'firstWins' }));
    // Pre-built events: the test itself must not allocate per tick.
    const events = [
      key('keydown', '', RIGHT),
      key('keydown', '', UP),
      key('keyup', '', RIGHT),
      key('keydown', '', RIGHT),
      key('keydown', '', OK),
      key('keyup', '', OK),
      key('keyup', '', UP),
      key('keydown', '', LEFT),
      key('keyup', '', LEFT),
      key('keyup', '', RIGHT),
    ];
    const step = (tick: number): void => {
      const event = events[tick % events.length];
      if (event !== undefined) input.keyboard.handleEvent(event);
      pads[0] = (tick & 8) === 0 ? idle : firing;
      if (tick % 97 === 0) input.setContext(input.context === 'game' ? 'menu' : 'game');
      input.poll();
    };
    // Best of three windows after a long warm-up: a tier-up can still cost one window (the warm-up's
    // first round measures ~100 KB), while a real per-poll allocation shows in every window.
    const { bytes } = measureHeapGrowth(step, 10_000, 20_000, 3);
    // One 16-byte heap number per poll would be ~160 KB here, a literal or array ≥ 240 KB.
    expect(bytes).toBeLessThan(128 * 1024);
  });
});
