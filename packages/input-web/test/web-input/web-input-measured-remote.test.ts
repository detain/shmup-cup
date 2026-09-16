/**
 * The Samsung Smart Remote as the input probe actually measured it on both M7 monitors on
 * 2026-09-15 ([`docs/dev/input-probe-results.md`](../../../../docs/dev/input-probe-results.md)),
 * replayed through a `WebInput` running the shipped `tizen-remote-safe` profile (plan M3-02b):
 *
 * - the flagless auto-repeat stream (press, first repeat after ≈ 21 ticks, then every ≈ 6.5 ticks,
 *   every one of them a `keydown` with `repeat === false`, key-up 1–6 ticks after the last repeat)
 *   gives exactly one pressed edge, stays held throughout and releases on the key-up's tick;
 * - a second key during a hold is never delivered (`singleKey`), on press and on release;
 * - Back and Play/Pause arrive as a keydown + keyup inside one frame — and inside one tick — and
 *   still produce exactly one pressed edge.
 */
import { readFileSync } from 'node:fs';
import { Action } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { loadInputProfiles, type InputProfile } from '../../src/rebind/index.js';
import { REMOTE_REPEAT_DELAY_TICKS, REMOTE_REPEAT_INTERVAL_TICKS } from '../../src/remote/index.js';
import { createWebInput, type WebInput } from '../../src/web-input/index.js';
import { key } from '../helpers.js';

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

/** The shipped TV profile. */
const REMOTE: InputProfile = (() => {
  const found = profiles.find((p) => p.id === 'tizen-remote-safe');
  if (found === undefined) throw new Error('no tizen-remote-safe profile');
  return found;
})();

const RIGHT = 39;
const UP = 38;
const OK = 13;
const BACK = 10009;
const PLAY_PAUSE = 10252;

/**
 * An adapter with the shipped remote profile and no listeners.
 *
 * @returns The adapter.
 */
function remote(): WebInput {
  const input = createWebInput({ keyTarget: null, keyDevice: 'remote' });
  input.setProfile(REMOTE);
  return input;
}

describe('the measured remote: flagless auto-repeat (finding 2)', () => {
  it('gives one pressed edge, stays held and releases on the key-up tick', () => {
    expect(issues).toEqual([]);
    const input = remote();
    // The measured stream: press at tick 0, first repeat 21 ticks later, then every ~6.5.
    const repeats: number[] = [];
    for (let tick = REMOTE_REPEAT_DELAY_TICKS; tick < 90;) {
      repeats.push(Math.round(tick));
      // ± 2.4 ticks of jitter around the 6.5-tick interval, deterministic here.
      tick += REMOTE_REPEAT_INTERVAL_TICKS + (repeats.length % 3) - 1;
    }
    const upTick = repeats[repeats.length - 1] + 4; // the key-up came 0–100 ms after the last one
    let presses = 0;
    let releases = 0;
    let heldTicks = 0;
    input.keyboard.handleEvent(key('keydown', '', RIGHT));
    for (let tick = 0; tick <= upTick + 3; tick++) {
      if (tick > 0 && repeats.indexOf(tick) >= 0) {
        // A repeat is a plain keydown: `repeat` is false on this hardware.
        input.keyboard.handleEvent(key('keydown', '', RIGHT, { repeat: false }));
      }
      if (tick === upTick) input.keyboard.handleEvent(key('keyup', '', RIGHT));
      const p1 = input.poll().players[0];
      if (((p1?.pressed ?? 0) & Action.Right) !== 0) presses++;
      if (((p1?.released ?? 0) & Action.Right) !== 0) releases++;
      if (((p1?.held ?? 0) & Action.Right) !== 0) heldTicks++;
    }
    expect(repeats.length).toBeGreaterThan(8);
    expect(presses).toBe(1);
    expect(releases).toBe(1);
    // Held on every tick from the press to the key-up's own poll (no debounce since M3-02b).
    expect(heldTicks).toBe(upTick);
  });
});

describe('the measured remote: one key at a time (finding 1)', () => {
  it('never delivers OK while an arrow is held, and nothing on its release', () => {
    const input = remote();
    input.keyboard.handleEvent(key('keydown', '', RIGHT));
    expect(input.poll().players[0]?.held).toBe(Action.Right);
    input.keyboard.handleEvent(key('keydown', '', OK));
    input.keyboard.handleEvent(key('keyup', '', OK));
    for (let i = 0; i < 4; i++) {
      const p1 = input.poll().players[0];
      expect(p1?.held).toBe(Action.Right);
      expect(p1?.pressed).toBe(0);
    }
    input.keyboard.handleEvent(key('keyup', '', RIGHT));
    expect(input.poll().players[0]?.held).toBe(0);
    // Once the arrow is up, OK registers again.
    input.keyboard.handleEvent(key('keydown', '', OK));
    expect(input.poll().players[0]?.pressed).toBe(Action.PowerUp);
  });

  it('never delivers a second arrow during a hold (no diagonals at all)', () => {
    const input = remote();
    input.keyboard.handleEvent(key('keydown', '', RIGHT));
    input.keyboard.handleEvent(key('keydown', '', UP));
    expect(input.poll().players[0]?.held).toBe(Action.Right);
    input.keyboard.handleEvent(key('keyup', '', RIGHT));
    input.poll();
    input.keyboard.handleEvent(key('keydown', '', UP));
    expect(input.poll().players[0]?.held).toBe(Action.Up);
  });
});

describe('the measured remote: release-only Back and Play/Pause (finding 4)', () => {
  it.each([
    ['Back', BACK],
    ['Play/Pause', PLAY_PAUSE],
  ])('%s down and up inside one tick still presses once', (_name, keyCode) => {
    const input = remote();
    input.keyboard.handleEvent(key('keydown', '', keyCode));
    input.keyboard.handleEvent(key('keyup', '', keyCode));
    const p1 = input.poll().players[0];
    expect(p1?.pressed).toBe(Action.Pause);
    // The latch releases it again on the next poll — it was never really held.
    expect(input.poll().players[0]?.held).toBe(0);
    // Pressing it three times gives three edges (the INPUT TEST's exit).
    let presses = 0;
    for (let i = 0; i < 3; i++) {
      input.keyboard.handleEvent(key('keydown', '', keyCode));
      input.keyboard.handleEvent(key('keyup', '', keyCode));
      if (((input.poll().players[0]?.pressed ?? 0) & Action.Pause) !== 0) presses++;
    }
    expect(presses).toBe(3);
  });

  it('is swallowed during an arrow hold, like every other second key', () => {
    // Whether the hardware really swallows Back during a hold was not measured separately; the
    // probe's finding 1 says to assume it does ("the remote is single-key"), and the profile's
    // `singleKey` makes the emulation and the playtest bot behave that way.
    const input = remote();
    input.keyboard.handleEvent(key('keydown', '', RIGHT));
    expect(input.poll().players[0]?.held).toBe(Action.Right);
    input.keyboard.handleEvent(key('keydown', '', BACK));
    input.keyboard.handleEvent(key('keyup', '', BACK));
    const p1 = input.poll().players[0];
    expect(p1?.held).toBe(Action.Right);
    expect((p1?.pressed ?? 0) & Action.Pause).toBe(0);
  });
});
