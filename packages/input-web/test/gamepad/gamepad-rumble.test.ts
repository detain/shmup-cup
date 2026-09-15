/**
 * Gamepad rumble (plan M3-01 — shmup_feat.md §4 "[P2] Rumble via `vibrationActuator.playEffect()`"):
 * {@link rumblePad} plays the `'dual-rumble'` effect of a strength on a pad with motors (and nothing
 * on one without, never throwing — a rejected or throwing effect is ignored), and
 * `WebInput.rumble` rumbles the pads of the player a `SimEventKind.Rumble` names: with one seat
 * every connected pad is player 1's, with two the pad seated as player 2 is player 2's.
 */
import { describe, expect, it } from 'vitest';
import {
  RUMBLE_EFFECTS,
  rumblePad,
  type GamepadHapticLike,
  type GamepadLike,
  type RumbleEffect,
} from '../../src/gamepad/index.js';
import * as inputWeb from '../../src/index.js';
import { PAD_SEAT_P2, createWebInput } from '../../src/web-input/index.js';
import { pad } from '../helpers.js';

/** A pad whose motors record the effects they play. */
interface RumblePad extends GamepadLike {
  /** The effects played. */
  readonly played: RumbleEffect[];
}

/**
 * A fake pad with motors.
 *
 * @param index - Pad slot.
 * @param pressed - Pressed buttons.
 * @param effect - What `playEffect` does (default: resolves).
 * @returns The pad.
 */
function rumblingPad(
  index: number,
  pressed: number[] = [],
  effect: () => Promise<unknown> = () => Promise.resolve('complete'),
): RumblePad {
  const played: RumbleEffect[] = [];
  const actuator: GamepadHapticLike = {
    playEffect(type, params) {
      expect(type).toBe('dual-rumble');
      played.push(params);
      return effect();
    },
  };
  return { ...pad(index, pressed), vibrationActuator: actuator, played };
}

describe('input-web/gamepad rumblePad (M3-01)', () => {
  it('plays the strength`s dual-rumble effect on a pad with motors', () => {
    expect(inputWeb.rumblePad).toBe(rumblePad);
    expect(inputWeb.RUMBLE_EFFECTS).toBe(RUMBLE_EFFECTS);
    expect(Object.isFrozen(RUMBLE_EFFECTS) && Object.isFrozen(RUMBLE_EFFECTS[1])).toBe(true);
    // A boss blast rumbles longer and harder than a death.
    expect(RUMBLE_EFFECTS[2].duration).toBeGreaterThan(RUMBLE_EFFECTS[1].duration);
    expect(RUMBLE_EFFECTS[2].strongMagnitude).toBeGreaterThan(RUMBLE_EFFECTS[1].strongMagnitude);
    for (const effect of RUMBLE_EFFECTS.slice(1)) {
      expect(effect.weakMagnitude).toBeGreaterThan(0);
      expect(effect.strongMagnitude).toBeLessThanOrEqual(1);
    }
    const p = rumblingPad(0);
    expect(rumblePad(p, 1)).toBe(true);
    expect(rumblePad(p, 2)).toBe(true);
    expect(rumblePad(p, 9)).toBe(true); // clamped
    expect(rumblePad(p, 0)).toBe(true); // a death's
    expect(p.played).toEqual([
      RUMBLE_EFFECTS[1],
      RUMBLE_EFFECTS[2],
      RUMBLE_EFFECTS[2],
      RUMBLE_EFFECTS[1],
    ]);
  });

  it('does nothing on a pad without motors and never throws', async () => {
    expect(rumblePad(pad(0), 1)).toBe(false);
    expect(rumblePad({ ...pad(0), vibrationActuator: null }, 1)).toBe(false);
    expect(rumblePad({ ...pad(0), vibrationActuator: {} }, 1)).toBe(false);
    const rejected = rumblingPad(0, [], () => Promise.reject(new Error('unplugged')));
    expect(rumblePad(rejected, 2)).toBe(true);
    await Promise.resolve(); // the rejection is swallowed (no unhandled rejection)
    const throwing = rumblingPad(0, [], () => {
      throw new Error('not supported');
    });
    expect(rumblePad(throwing, 1)).toBe(false);
  });
});

describe('input-web/web-input rumble (M3-01)', () => {
  it('one seat: every connected pad is player 1`s; player 2 has none', () => {
    const a = rumblingPad(0);
    const b = rumblingPad(1);
    const gone = { ...rumblingPad(2), connected: false };
    const pads: Array<GamepadLike | null> = [a, null, b, gone];
    const input = createWebInput({ keyTarget: null, getGamepads: () => pads });
    expect(input.rumble(0, 1)).toBe(2);
    expect(input.rumble(1, 1)).toBe(0);
    expect(input.rumble(2, 1)).toBe(0);
    expect([a.played.length, b.played.length, gone.played.length]).toEqual([1, 1, 0]);
    // Without the Gamepad API nothing rumbles.
    expect(createWebInput({ keyTarget: null }).rumble(0, 2)).toBe(0);
  });

  it('two seats: the pad seated as player 2 rumbles for player 2, the others for player 1', () => {
    const a = rumblingPad(0);
    let b = rumblingPad(1);
    let pads: Array<GamepadLike | null> = [a, b];
    const input = createWebInput({ keyTarget: null, getGamepads: () => pads });
    input.setSeats(2);
    input.poll();
    // Pad 1's START seats it as player 2.
    b = rumblingPad(1, [9]);
    pads = [a, b];
    input.poll();
    expect(input.padSeat(1)).toBe(PAD_SEAT_P2);
    expect(input.rumble(1, 2)).toBe(1);
    expect(input.rumble(0, 1)).toBe(1);
    expect(a.played).toEqual([RUMBLE_EFFECTS[1]]);
    expect(b.played).toEqual([RUMBLE_EFFECTS[2]]);
    // Back to one seat (the title): every pad is player 1's again.
    input.setSeats(1);
    expect(input.rumble(0, 1)).toBe(2);
    expect(input.rumble(1, 1)).toBe(0);
  });
});
