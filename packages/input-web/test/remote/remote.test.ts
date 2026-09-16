/**
 * `remote` building blocks: the release debouncer (fake key-up/key-down pairs), the diagonal
 * and SOCD policies, and the press-order tracker of polled devices.
 */
import { Action } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import * as inputWeb from '../../src/index.js';
import {
  DEFAULT_INPUT_TUNING,
  DIAGONAL_POLICIES,
  DIRECTION_MASK,
  MAX_RELEASE_DEBOUNCE_TICKS,
  SOCD_POLICIES,
  createDirectionOrder,
  createReleaseDebouncer,
  moduleInfo,
  resolveDirections,
} from '../../src/remote/index.js';

/**
 * Press orders in bit order (Up, Down, Left, Right).
 *
 * @param up - Order of Up.
 * @param down - Order of Down.
 * @param left - Order of Left.
 * @param right - Order of Right.
 */
const order = (up: number, down: number, left: number, right: number): number[] => [
  up,
  down,
  left,
  right,
];

describe('input-web/remote', () => {
  it('describes itself and is exported from the package entry', () => {
    expect(moduleInfo.name).toBe('remote');
    expect(moduleInfo.status).toBe('implemented');
    expect(inputWeb.createReleaseDebouncer).toBe(createReleaseDebouncer);
    expect(inputWeb.resolveDirections).toBe(resolveDirections);
    expect(DIAGONAL_POLICIES).toEqual(['combine', 'lastWins', 'firstWins']);
    expect(SOCD_POLICIES).toEqual(['neutral', 'lastWins']);
    expect(DEFAULT_INPUT_TUNING).toEqual({
      releaseDebounceTicks: 0,
      diagonals: 'combine',
      socd: 'neutral',
      singleKey: false,
    });
    expect(DIRECTION_MASK).toBe(Action.Up | Action.Down | Action.Left | Action.Right);
  });
});

describe('input-web/remote createReleaseDebouncer', () => {
  it('keeps a released slot held for `ticks` polls, then releases it', () => {
    const debounce = createReleaseDebouncer(2);
    expect(debounce.press(0)).toBe('new');
    expect(debounce.release(0)).toBe(false);
    expect(debounce.isReleasing(0)).toBe(true);
    const heldAfterPoll: boolean[] = [];
    for (let i = 0; i < 4; i++) {
      debounce.poll();
      heldAfterPoll.push(debounce.isHeld(0));
    }
    expect(heldAfterPoll).toEqual([true, true, false, false]);
  });

  it('a keydown inside the window resumes the hold without a new press', () => {
    const debounce = createReleaseDebouncer(2);
    debounce.press(3);
    debounce.release(3);
    debounce.poll();
    expect(debounce.press(3)).toBe('resumed');
    expect(debounce.isReleasing(3)).toBe(false);
    for (let i = 0; i < 5; i++) debounce.poll();
    expect(debounce.isHeld(3)).toBe(true);
  });

  it('reports repeats of a slot that is already down', () => {
    const debounce = createReleaseDebouncer(0);
    debounce.press(1);
    expect(debounce.press(1)).toBe('held');
  });

  it('window 0 releases on keyup', () => {
    const debounce = createReleaseDebouncer(0);
    debounce.press(0);
    expect(debounce.release(0)).toBe(true);
    expect(debounce.isHeld(0)).toBe(false);
    expect(debounce.release(0)).toBe(false); // not down any more
    expect(debounce.press(0)).toBe('new');
  });

  it('counts the releases of a poll and ignores keyups of slots that are not down', () => {
    const debounce = createReleaseDebouncer(1);
    expect(debounce.release(5)).toBe(false);
    debounce.press(0);
    debounce.press(1);
    debounce.release(0);
    debounce.release(1);
    expect(debounce.poll()).toBe(0);
    expect(debounce.poll()).toBe(2);
  });

  it('setTicks shortens pending releases; 0 releases them at once', () => {
    const debounce = createReleaseDebouncer(5);
    debounce.press(0);
    debounce.release(0);
    debounce.setTicks(1);
    expect(debounce.ticks).toBe(1);
    debounce.poll();
    expect(debounce.isHeld(0)).toBe(true);
    debounce.poll();
    expect(debounce.isHeld(0)).toBe(false);

    debounce.setTicks(3);
    debounce.press(2);
    debounce.release(2);
    debounce.setTicks(0);
    expect(debounce.isHeld(2)).toBe(false);
  });

  it('clamps the window and ignores invalid slots', () => {
    expect(createReleaseDebouncer(99).ticks).toBe(MAX_RELEASE_DEBOUNCE_TICKS);
    expect(createReleaseDebouncer(-3).ticks).toBe(0);
    expect(createReleaseDebouncer(Number.NaN).ticks).toBe(0);
    expect(createReleaseDebouncer(2.9).ticks).toBe(2);
    const debounce = createReleaseDebouncer(2, 4);
    expect(debounce.capacity).toBe(4);
    expect(debounce.press(4)).toBe('held');
    expect(debounce.press(-1)).toBe('held');
    expect(debounce.press(1.5)).toBe('held');
    expect(debounce.isHeld(4)).toBe(false);
    expect(debounce.release(9)).toBe(false);
  });

  it('reset() and clear() forget slots without the debounce', () => {
    const debounce = createReleaseDebouncer(3);
    debounce.press(0);
    debounce.press(1);
    debounce.release(1);
    debounce.reset(0);
    expect(debounce.isHeld(0)).toBe(false);
    debounce.clear();
    expect(debounce.isHeld(1)).toBe(false);
  });
});

describe('input-web/remote resolveDirections', () => {
  const upRight = Action.Up | Action.Right;

  it('combine keeps both directions of a diagonal', () => {
    expect(resolveDirections(upRight, order(1, 0, 0, 2), 'combine', 'neutral')).toBe(upRight);
  });

  it('lastWins keeps the most recently pressed direction of a diagonal', () => {
    expect(resolveDirections(upRight, order(1, 0, 0, 2), 'lastWins', 'neutral')).toBe(Action.Right);
    expect(resolveDirections(upRight, order(3, 0, 0, 2), 'lastWins', 'neutral')).toBe(Action.Up);
  });

  it('firstWins keeps the earliest pressed direction of a diagonal', () => {
    expect(resolveDirections(upRight, order(1, 0, 0, 2), 'firstWins', 'neutral')).toBe(Action.Up);
    expect(resolveDirections(upRight, order(3, 0, 0, 2), 'firstWins', 'neutral')).toBe(
      Action.Right,
    );
  });

  it('breaks same-poll ties deterministically (vertical for lastWins, horizontal for firstWins)', () => {
    expect(resolveDirections(upRight, order(1, 0, 0, 1), 'lastWins', 'neutral')).toBe(Action.Up);
    expect(resolveDirections(upRight, order(1, 0, 0, 1), 'firstWins', 'neutral')).toBe(
      Action.Right,
    );
  });

  it('SOCD neutral cancels opposing directions on each axis', () => {
    const all = Action.Left | Action.Right | Action.Up | Action.Down;
    expect(resolveDirections(all, order(1, 2, 3, 4), 'combine', 'neutral')).toBe(0);
    expect(
      resolveDirections(
        Action.Left | Action.Right | Action.Up,
        order(1, 0, 2, 3),
        'combine',
        'neutral',
      ),
    ).toBe(Action.Up);
  });

  it('SOCD lastWins keeps the most recent of an opposing pair (a tie is neutral)', () => {
    const lr = Action.Left | Action.Right;
    expect(resolveDirections(lr, order(0, 0, 1, 2), 'combine', 'lastWins')).toBe(Action.Right);
    expect(resolveDirections(lr, order(0, 0, 2, 1), 'combine', 'lastWins')).toBe(Action.Left);
    expect(resolveDirections(lr, order(0, 0, 1, 1), 'combine', 'lastWins')).toBe(0);
    const ud = Action.Up | Action.Down;
    expect(resolveDirections(ud, order(5, 4, 0, 0), 'combine', 'lastWins')).toBe(Action.Up);
  });

  it('applies SOCD before the diagonal policy', () => {
    // Left (1), Up (2), Right (3): SOCD lastWins → Right; then lastWins diagonal → Right.
    const mask = Action.Left | Action.Up | Action.Right;
    expect(resolveDirections(mask, order(2, 0, 1, 3), 'lastWins', 'lastWins')).toBe(Action.Right);
    expect(resolveDirections(mask, order(2, 0, 1, 3), 'firstWins', 'lastWins')).toBe(Action.Up);
  });

  it('passes non-direction bits through untouched', () => {
    const mask = Action.Up | Action.Right | Action.Shot | Action.PowerUp;
    expect(resolveDirections(mask, order(1, 0, 0, 2), 'lastWins', 'neutral')).toBe(
      Action.Right | Action.Shot | Action.PowerUp,
    );
    expect(resolveDirections(Action.Pause, order(0, 0, 0, 0), 'firstWins', 'neutral')).toBe(
      Action.Pause,
    );
  });
});

describe('input-web/remote createDirectionOrder', () => {
  it('numbers directions in the poll they become held and keeps them while held', () => {
    const tracker = createDirectionOrder();
    tracker.update(Action.Right);
    tracker.update(Action.Right | Action.Up);
    expect(resolveDirections(Action.Right | Action.Up, tracker.order, 'lastWins', 'neutral')).toBe(
      Action.Up,
    );
    expect(resolveDirections(Action.Right | Action.Up, tracker.order, 'firstWins', 'neutral')).toBe(
      Action.Right,
    );
    tracker.update(Action.Up); // Right released
    tracker.update(Action.Up | Action.Right); // pressed again: now the newest
    expect(resolveDirections(Action.Right | Action.Up, tracker.order, 'lastWins', 'neutral')).toBe(
      Action.Right,
    );
  });

  it('ignores non-direction bits and resets', () => {
    const tracker = createDirectionOrder();
    tracker.update(Action.Shot);
    expect([...tracker.order]).toEqual([0, 0, 0, 0]);
    tracker.update(Action.Left | Action.Down);
    expect([...tracker.order]).toEqual([0, 1, 1, 0]);
    tracker.reset();
    expect([...tracker.order]).toEqual([0, 0, 0, 0]);
    tracker.update(Action.Left);
    expect([...tracker.order]).toEqual([0, 0, 1, 0]);
  });
});
