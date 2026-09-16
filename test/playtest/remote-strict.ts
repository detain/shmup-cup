/**
 * `remote-strict` — what the Samsung Smart Remote can actually deliver, as a filter for the
 * playtest bots and a checker for a recorded run (plan M3-02b).
 *
 * The 2026-09-15 input probe measured the remote on both M7 monitors
 * ([`docs/dev/input-probe-results.md`](../../docs/dev/input-probe-results.md)); three findings
 * decide what a remote player can do in one tick:
 *
 * 1. **One key at a time.** While a key is down a second key's `keydown` is never delivered — not
 *    on press, not on release — and the held key keeps repeating. So a player can never move while
 *    pressing OK, Ch± or Play/Pause, and a new direction only registers once the previous key is
 *    up: a direction change costs at least {@link REMOTE_GAP_TICKS} empty tick.
 * 2. **Flagless auto-repeat.** A held key repeats as plain `keydown`s; the input pipeline turns
 *    them into "still held", so a hold is one continuous press — nothing to model here beyond 1.
 * 3. **Taps last 7–16 ticks** (120–260 ms, median ≈ 10–12). A button press is therefore a tap of
 *    {@link REMOTE_TAP_MIN_TICKS} … {@link REMOTE_TAP_MAX_TICKS} ticks with **no direction**, and
 *    the thumb needs {@link REMOTE_PRE_TAP_TICKS} ticks off the D-pad first.
 * 4. **Back and Play/Pause arrive only on release** — one tick, never held ({@link REMOTE_EDGE_TICKS}).
 *
 * {@link createRemoteStrictModel} turns a bot's wish for a tick into the mask the remote could
 * really produce; {@link createRemoteStrictCheck} reads a recorded run back and counts every tick
 * that breaks the model, so a run that somehow cheated fails its test the way `diagonalTicks` does.
 *
 * @module
 */
import { Action } from '@shmup/core';

/** The four direction actions (at most one at a time on the remote). */
export const REMOTE_DIRECTIONS = Action.Up | Action.Down | Action.Left | Action.Right;

/** The buttons a remote player presses with the same thumb that holds the D-pad. */
export const REMOTE_BUTTONS = Action.PowerUp | Action.Special | Action.Speed;

/** Actions that reach the game only when the button is released (Back, Play/Pause). */
export const REMOTE_EDGE_ACTIONS = Action.Pause;

/** Ticks a release-only action (Back / Play-Pause) is seen for: exactly one. */
export const REMOTE_EDGE_TICKS = 1;

/** Shortest button tap the remote produces (7 ticks ≈ 120 ms was the fastest measured). */
export const REMOTE_TAP_MIN_TICKS = 7;

/** Longest button tap the remote produces (16 ticks ≈ 260 ms was the slowest measured). */
export const REMOTE_TAP_MAX_TICKS = 16;

/** Tap length the model produces (the measured median of 10–12 ticks). */
export const REMOTE_TAP_TICKS = 10;

/** Empty ticks the thumb needs between leaving the D-pad and pressing a button. */
export const REMOTE_PRE_TAP_TICKS = 2;

/** Empty ticks between two different directions (the first key must come up). */
export const REMOTE_GAP_TICKS = 1;

/**
 * Keeps the lowest set bit of a mask — the remote can only deliver one key.
 *
 * @param mask - Action bits.
 * @returns The lowest set bit, or 0.
 */
function lowestBit(mask: number): number {
  return mask & -mask;
}

/** Turns a bot's wish for one tick into what the remote could really deliver. */
export interface RemoteStrictModel {
  /**
   * Filters one tick.
   *
   * @param want - The mask the bot would like to hold.
   * @returns The mask a remote player would actually produce this tick.
   */
  filter(want: number): number;
  /** Forgets the pending tap and the direction held (a new run). */
  reset(): void;
}

/** The model's phases. */
const IDLE = 0;
const PRE_TAP = 1;
const TAP = 2;

/**
 * Creates a {@link RemoteStrictModel}.
 *
 * @remarks
 * A button the bot asks for starts a tap: {@link REMOTE_PRE_TAP_TICKS} empty ticks (the thumb
 * leaves the D-pad), then the button alone for {@link REMOTE_TAP_TICKS} ticks — the bot's
 * directions are ignored until the tap is over, which is exactly the cost the hardware imposes.
 * A release-only action ({@link REMOTE_EDGE_ACTIONS}) is one tick after the same pause. A
 * direction different from the one held is preceded by {@link REMOTE_GAP_TICKS} empty tick.
 * Stateful: use one model per run (the bots create their own).
 *
 * @returns The model.
 *
 * @example
 * ```ts
 * const remote = createRemoteStrictModel();
 * remote.filter(Action.Right);              // → Right
 * remote.filter(Action.Up);                 // → 0 (the gap tick)
 * remote.filter(Action.Up);                 // → Up
 * remote.filter(Action.Up | Action.PowerUp); // → 0 (the thumb leaves the D-pad)
 * ```
 */
export function createRemoteStrictModel(): RemoteStrictModel {
  const state = { phase: IDLE, left: 0, button: 0, lastDirection: 0 };
  return {
    filter(want: number): number {
      if (state.phase === TAP) {
        state.left--;
        if (state.left <= 0) state.phase = IDLE;
        return state.button;
      }
      if (state.phase === PRE_TAP) {
        state.left--;
        if (state.left <= 0) {
          state.phase = TAP;
          state.left =
            (state.button & REMOTE_EDGE_ACTIONS) !== 0 ? REMOTE_EDGE_TICKS : REMOTE_TAP_TICKS;
          state.left--;
          if (state.left <= 0) state.phase = IDLE;
          return state.button;
        }
        return 0;
      }
      const button = lowestBit(want & (REMOTE_BUTTONS | REMOTE_EDGE_ACTIONS));
      if (button !== 0) {
        state.button = button;
        state.phase = PRE_TAP;
        state.left = REMOTE_PRE_TAP_TICKS;
        state.lastDirection = 0;
        return 0;
      }
      const direction = lowestBit(want & REMOTE_DIRECTIONS);
      if (direction !== 0 && state.lastDirection !== 0 && direction !== state.lastDirection) {
        // The held arrow must come up before the next one registers.
        state.lastDirection = 0;
        return 0;
      }
      state.lastDirection = direction;
      return direction;
    },
    reset(): void {
      state.phase = IDLE;
      state.left = 0;
      state.button = 0;
      state.lastDirection = 0;
    },
  };
}

/** Why one tick of a recorded run was impossible on the remote. */
export type RemoteStrictViolation =
  | 'two-directions'
  | 'two-buttons'
  | 'direction-with-button'
  | 'button-without-pause'
  | 'tap-too-short'
  | 'tap-too-long'
  | 'direction-without-gap';

/** Reads a recorded run back and counts what the remote could not have produced. */
export interface RemoteStrictCheck {
  /** Violations counted so far. */
  readonly violations: number;
  /** The first violation seen, or `null`. */
  readonly first: RemoteStrictViolation | null;
  /** Tick of the first violation (-1 = none). */
  readonly firstTick: number;
  /**
   * Feeds one tick's held mask, in order.
   *
   * @param mask - The mask the run recorded for that tick.
   */
  push(mask: number): void;
  /** Finishes the stream (a tap still running is checked for its minimum length). */
  end(): void;
}

/**
 * Creates a {@link RemoteStrictCheck}.
 *
 * @returns The checker (feed every tick with `push`, then call `end`).
 *
 * @example
 * ```ts
 * const check = createRemoteStrictCheck();
 * for (const mask of run.inputs) check.push(mask);
 * check.end();
 * check.violations; // → 0 for a remote-strict bot
 * ```
 */
export function createRemoteStrictCheck(): RemoteStrictCheck {
  const state = {
    violations: 0,
    first: null as RemoteStrictViolation | null,
    firstTick: -1,
    tick: -1,
    previous: 0,
    beforePrevious: 0,
    tapLength: 0,
    tapButton: 0,
    lastDirection: 0,
  };

  /**
   * Records one violation.
   *
   * @param kind - What was wrong.
   */
  const fail = (kind: RemoteStrictViolation): void => {
    state.violations++;
    if (state.first === null) {
      state.first = kind;
      state.firstTick = state.tick;
    }
  };

  /** Checks the length of a tap that just ended. */
  const closeTap = (): void => {
    if (state.tapLength === 0) return;
    const edge = (state.tapButton & REMOTE_EDGE_ACTIONS) !== 0;
    const min = edge ? REMOTE_EDGE_TICKS : REMOTE_TAP_MIN_TICKS;
    const max = edge ? REMOTE_EDGE_TICKS : REMOTE_TAP_MAX_TICKS;
    if (state.tapLength < min) fail('tap-too-short');
    else if (state.tapLength > max) fail('tap-too-long');
    state.tapLength = 0;
    state.tapButton = 0;
  };

  return {
    get violations() {
      return state.violations;
    },
    get first() {
      return state.first;
    },
    get firstTick() {
      return state.firstTick;
    },
    push(mask: number): void {
      state.tick++;
      const directions = mask & REMOTE_DIRECTIONS;
      const buttons = mask & (REMOTE_BUTTONS | REMOTE_EDGE_ACTIONS);
      if (directions !== 0 && directions !== lowestBit(directions)) fail('two-directions');
      if (buttons !== 0 && buttons !== lowestBit(buttons)) fail('two-buttons');
      if (directions !== 0 && buttons !== 0) fail('direction-with-button');

      if (buttons !== 0 && buttons === state.tapButton) {
        state.tapLength++;
      } else {
        closeTap();
        if (buttons !== 0) {
          // A fresh button press: the two ticks before it must be free of every key.
          if (state.previous !== 0 || state.beforePrevious !== 0) fail('button-without-pause');
          state.tapButton = lowestBit(buttons);
          state.tapLength = 1;
        }
      }

      if (directions !== 0) {
        const one = lowestBit(directions);
        if (state.lastDirection !== 0 && one !== state.lastDirection) fail('direction-without-gap');
        state.lastDirection = one;
      } else {
        state.lastDirection = 0;
      }
      state.beforePrevious = state.previous;
      state.previous = mask;
    },
    end(): void {
      closeTap();
    },
  };
}
