/**
 * Edge cases of the `remote` building blocks: the exact release-debounce window for every
 * accepted tick count, slot independence, window changes while releases are pending, resumes
 * and re-releases, capacity limits; `resolveDirections` checked exhaustively (every direction
 * mask × press orders × policy) against its invariants and a reference model; and the
 * press-order tracker's numbering.
 */
import { Action } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import {
  DIAGONAL_POLICIES,
  DIRECTION_COUNT,
  MAX_RELEASE_DEBOUNCE_TICKS,
  SOCD_POLICIES,
  createDirectionOrder,
  createReleaseDebouncer,
  resolveDirections,
  type DiagonalPolicy,
  type SocdPolicy,
} from '../../src/remote/index.js';

const { Up, Down, Left, Right } = Action;
const HORIZONTAL = Left | Right;
const VERTICAL = Up | Down;

describe('input-web/remote createReleaseDebouncer windows', () => {
  it.each(Array.from({ length: MAX_RELEASE_DEBOUNCE_TICKS + 1 }, (_, ticks) => ticks))(
    'window %i: held for exactly that many polls after the keyup, released on the next',
    (ticks) => {
      const debounce = createReleaseDebouncer(ticks);
      debounce.press(0);
      debounce.poll();
      debounce.poll(); // held for a while before the keyup
      const immediate = debounce.release(0);
      expect(immediate).toBe(ticks === 0);
      const held: boolean[] = [];
      const released: number[] = [];
      for (let poll = 0; poll < ticks + 3; poll++) {
        released.push(debounce.poll());
        held.push(debounce.isHeld(0));
      }
      const expectedHeld = held.map((_, poll) => poll < ticks);
      expect(held).toEqual(expectedHeld);
      // poll() counts the release on the poll that ends the window (none for window 0).
      expect(released).toEqual(held.map((_, poll) => (ticks > 0 && poll === ticks ? 1 : 0)));
    },
  );

  it('a window of 0 never reports pending releases', () => {
    const debounce = createReleaseDebouncer(0);
    debounce.press(2);
    debounce.release(2);
    expect(debounce.isReleasing(2)).toBe(false);
    expect(debounce.poll()).toBe(0);
  });

  it('ages every slot independently', () => {
    const debounce = createReleaseDebouncer(3);
    debounce.press(0);
    debounce.press(1);
    debounce.press(2);
    debounce.release(0);
    debounce.poll(); // 0: 2 left
    debounce.release(1);
    debounce.poll(); // 0: 1 left, 1: 2 left
    expect([0, 1, 2].map((slot) => debounce.isHeld(slot))).toEqual([true, true, true]);
    debounce.poll(); // 0: 0 left
    expect(debounce.poll()).toBe(1); // 0 released
    expect([0, 1, 2].map((slot) => debounce.isHeld(slot))).toEqual([false, true, true]);
    expect(debounce.poll()).toBe(1); // 1 released
    expect([0, 1, 2].map((slot) => debounce.isHeld(slot))).toEqual([false, false, true]);
  });

  it('a second keyup while releasing neither restarts nor ends the window', () => {
    const debounce = createReleaseDebouncer(2);
    debounce.press(0);
    debounce.release(0);
    debounce.poll();
    expect(debounce.release(0)).toBe(false);
    expect(debounce.isReleasing(0)).toBe(true);
    debounce.poll();
    expect(debounce.isHeld(0)).toBe(true);
    debounce.poll();
    expect(debounce.isHeld(0)).toBe(false);
  });

  it('a resumed key gets a full window again on its next keyup', () => {
    const debounce = createReleaseDebouncer(2);
    debounce.press(0);
    debounce.release(0);
    debounce.poll();
    debounce.poll(); // window almost over
    expect(debounce.press(0)).toBe('resumed');
    expect(debounce.press(0)).toBe('held'); // and it is plainly down again
    debounce.release(0);
    debounce.poll();
    debounce.poll();
    expect(debounce.isHeld(0)).toBe(true);
    debounce.poll();
    expect(debounce.isHeld(0)).toBe(false);
    expect(debounce.press(0)).toBe('new'); // after the window: a fresh press
  });

  it('setTicks never extends a pending release, and a larger window applies to later keyups', () => {
    const debounce = createReleaseDebouncer(1);
    debounce.press(0);
    debounce.release(0);
    debounce.setTicks(5);
    expect(debounce.ticks).toBe(5);
    debounce.poll();
    expect(debounce.isHeld(0)).toBe(true);
    debounce.poll();
    expect(debounce.isHeld(0)).toBe(false); // still the old window of 1
    debounce.press(1);
    debounce.release(1);
    for (let i = 0; i < 5; i++) {
      debounce.poll();
      expect(debounce.isHeld(1)).toBe(true);
    }
    debounce.poll();
    expect(debounce.isHeld(1)).toBe(false);
  });

  it('setTicks clamps like the constructor and leaves down slots alone', () => {
    const debounce = createReleaseDebouncer(2);
    debounce.press(0);
    debounce.press(1);
    debounce.release(1);
    debounce.setTicks(Number.NaN);
    expect(debounce.ticks).toBe(0);
    expect(debounce.isHeld(1)).toBe(false); // window 0 released it
    expect(debounce.isHeld(0)).toBe(true); // a key that is down stays down
    debounce.setTicks(1e9);
    expect(debounce.ticks).toBe(MAX_RELEASE_DEBOUNCE_TICKS);
    debounce.setTicks(-4);
    expect(debounce.ticks).toBe(0);
    debounce.setTicks(3.99);
    expect(debounce.ticks).toBe(3);
    expect(createReleaseDebouncer(Number.POSITIVE_INFINITY).ticks).toBe(0);
  });

  it('reset() and clear() drop a pending release without counting it in poll()', () => {
    const debounce = createReleaseDebouncer(1);
    debounce.press(0);
    debounce.press(1);
    debounce.release(0);
    debounce.release(1);
    debounce.reset(0);
    expect(debounce.isReleasing(0)).toBe(false);
    debounce.clear();
    expect(debounce.poll()).toBe(0);
    expect(debounce.poll()).toBe(0);
    expect(debounce.press(0)).toBe('new');
    expect(debounce.press(1)).toBe('new');
    debounce.reset(99); // out of range: ignored
    debounce.reset(-1);
    expect(debounce.isHeld(0)).toBe(true);
  });

  it('floors the capacity and keeps at least one slot (also for NaN)', () => {
    expect(createReleaseDebouncer(0).capacity).toBe(32);
    expect(createReleaseDebouncer(0, 5.9).capacity).toBe(5);
    for (const capacity of [0, -3, 0.5, Number.NaN]) {
      const debounce = createReleaseDebouncer(1, capacity);
      expect(debounce.capacity, String(capacity)).toBe(1);
      expect(debounce.press(0)).toBe('new');
      expect(debounce.isHeld(0)).toBe(true);
      expect(debounce.press(1)).toBe('held'); // out of range
      expect(debounce.isHeld(1)).toBe(false);
    }
  });

  it('never reports invalid slots as held or releasing', () => {
    const debounce = createReleaseDebouncer(2, 4);
    for (const slot of [-1, 4, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(debounce.release(slot)).toBe(false);
      expect(debounce.isHeld(slot)).toBe(false);
      expect(debounce.isReleasing(slot)).toBe(false);
    }
  });
});

/**
 * The reference model of `resolveDirections`, written from its documentation.
 *
 * @param mask - Held actions.
 * @param order - Press order per direction (Up, Down, Left, Right).
 * @param diagonals - Diagonal policy.
 * @param socd - SOCD policy.
 */
function reference(
  mask: number,
  order: readonly number[],
  diagonals: DiagonalPolicy,
  socd: SocdPolicy,
): number {
  const bits = [Up, Down, Left, Right];
  const orderOf = (bit: number): number => order[bits.indexOf(bit)] ?? 0;
  let out = mask;
  for (const [a, b] of [
    [Left, Right],
    [Up, Down],
  ] as const) {
    if ((out & a) === 0 || (out & b) === 0) continue;
    if (socd === 'lastWins' && orderOf(a) !== orderOf(b)) {
      out &= ~(orderOf(a) > orderOf(b) ? b : a);
    } else {
      out &= ~(a | b);
    }
  }
  const h = out & HORIZONTAL;
  const v = out & VERTICAL;
  if (diagonals === 'combine' || h === 0 || v === 0) return out;
  const hOrder = orderOf(h);
  const vOrder = orderOf(v);
  if (hOrder === vOrder) return diagonals === 'lastWins' ? out & ~h : out & ~v;
  const vNewer = vOrder > hOrder;
  const keepV = diagonals === 'lastWins' ? vNewer : !vNewer;
  return keepV ? out & ~h : out & ~v;
}

/** Every press-order assignment of 4 directions over the values 0…3 (256 of them). */
const ORDERS: number[][] = [];
for (let i = 0; i < 256; i++) ORDERS.push([i & 3, (i >> 2) & 3, (i >> 4) & 3, (i >> 6) & 3]);

describe('input-web/remote resolveDirections (exhaustive)', () => {
  const policies: Array<[DiagonalPolicy, SocdPolicy]> = [];
  for (const diagonals of DIAGONAL_POLICIES) {
    for (const socd of SOCD_POLICIES) policies.push([diagonals, socd]);
  }

  it.each(policies)('%s / %s matches the reference model and its invariants', (diagonals, socd) => {
    const failures: string[] = [];
    for (let dirs = 0; dirs < 16; dirs++) {
      for (const extra of [0, Action.Shot | Action.Pause]) {
        const mask = dirs | extra;
        for (const order of ORDERS) {
          const out = resolveDirections(mask, order, diagonals, socd);
          const broken: string[] = [];
          if (out !== reference(mask, order, diagonals, socd)) broken.push('reference');
          // Only removes directions; never touches other actions.
          if ((out & ~mask) !== 0) broken.push('added bits');
          if ((out & ~(HORIZONTAL | VERTICAL)) !== extra) broken.push('non-direction bits');
          // Never both of an opposing pair.
          if ((out & HORIZONTAL) === HORIZONTAL || (out & VERTICAL) === VERTICAL) {
            broken.push('opposing pair');
          }
          // 4-way policies never leave a diagonal.
          if (diagonals !== 'combine' && (out & HORIZONTAL) !== 0 && (out & VERTICAL) !== 0) {
            broken.push('diagonal');
          }
          // A direction held without its opposite survives the combine policy.
          if (diagonals === 'combine' && (mask & HORIZONTAL) === Left && (out & Left) === 0) {
            broken.push('lost Left');
          }
          if (broken.length > 0) {
            failures.push(`mask=${String(mask)} order=${order.join(',')}: ${broken.join(', ')}`);
          }
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('depends only on the relative order: shifting or scaling the orders changes nothing', () => {
    for (const [diagonals, socd] of policies) {
      for (let dirs = 0; dirs < 16; dirs++) {
        for (const order of ORDERS) {
          const shifted = order.map((value) => value * 7 + 1000);
          expect(resolveDirections(dirs, shifted, diagonals, socd)).toBe(
            resolveDirections(dirs, order, diagonals, socd),
          );
        }
      }
    }
  });

  it('mirrors: swapping Left/Right (bits and orders) swaps the result', () => {
    const mirror = (mask: number): number =>
      (mask & VERTICAL) | ((mask & Left) !== 0 ? Right : 0) | ((mask & Right) !== 0 ? Left : 0);
    for (const [diagonals, socd] of policies) {
      for (let dirs = 0; dirs < 16; dirs++) {
        for (const order of ORDERS) {
          const swapped = [order[0], order[1], order[3], order[2]];
          expect(resolveDirections(mirror(dirs), swapped, diagonals, socd)).toBe(
            mirror(resolveDirections(dirs, order, diagonals, socd)),
          );
        }
      }
    }
  });

  it('accepts typed arrays and treats missing order entries as 0', () => {
    const typed = new Float64Array([1, 0, 0, 2]);
    expect(resolveDirections(Up | Right, typed, 'lastWins', 'neutral')).toBe(Right);
    expect(resolveDirections(Up | Right, new Int32Array([3, 0, 0, 2]), 'lastWins', 'neutral')).toBe(
      Up,
    );
    // No order at all: every direction ties → neutral SOCD, vertical for lastWins.
    expect(resolveDirections(Left | Right, [], 'combine', 'lastWins')).toBe(0);
    expect(resolveDirections(Up | Left, [], 'lastWins', 'neutral')).toBe(Up);
    expect(resolveDirections(Up | Left, [], 'firstWins', 'neutral')).toBe(Left);
  });

  it('returns masks without directions as they are, whatever the order holds', () => {
    for (const mask of [0, Action.Shot, Action.Confirm | Action.Back, 0xfff0]) {
      expect(resolveDirections(mask, [9, 9, 9, 9], 'firstWins', 'lastWins')).toBe(mask);
    }
  });
});

describe('input-web/remote createDirectionOrder numbering', () => {
  it('numbers fresh directions with a strictly increasing sequence', () => {
    const tracker = createDirectionOrder();
    expect(tracker.order).toHaveLength(DIRECTION_COUNT);
    tracker.update(Up);
    tracker.update(Up | Left);
    tracker.update(Up | Left | Down);
    expect([...tracker.order]).toEqual([1, 3, 2, 0]);
  });

  it('keeps the number of a held direction, and does not advance for unchanged masks', () => {
    const tracker = createDirectionOrder();
    tracker.update(Right);
    for (let i = 0; i < 5; i++) tracker.update(Right | Action.Shot);
    tracker.update(Right | Up);
    expect([...tracker.order]).toEqual([2, 0, 0, 1]);
  });

  it('a direction released and pressed again becomes the newest', () => {
    const tracker = createDirectionOrder();
    tracker.update(Left | Up); // both 1
    tracker.update(Up); // Left released: keeps its stale number
    expect([...tracker.order]).toEqual([1, 0, 1, 0]);
    tracker.update(Up | Left);
    expect([...tracker.order]).toEqual([1, 0, 2, 0]);
    expect(resolveDirections(Up | Left, tracker.order, 'lastWins', 'neutral')).toBe(Left);
    expect(resolveDirections(Up | Left, tracker.order, 'firstWins', 'neutral')).toBe(Up);
  });

  it('an empty poll in between also re-arms every direction', () => {
    const tracker = createDirectionOrder();
    tracker.update(Right);
    tracker.update(0);
    tracker.update(Right);
    expect(tracker.order[3]).toBe(2);
  });

  it('reset() restarts the sequence and keeps the same array', () => {
    const tracker = createDirectionOrder();
    const array = tracker.order;
    tracker.update(Down);
    tracker.update(Down | Right);
    tracker.reset();
    expect(tracker.order).toBe(array);
    tracker.update(Down);
    expect([...tracker.order]).toEqual([0, 1, 0, 0]);
  });

  it('two trackers never share state', () => {
    const one = createDirectionOrder();
    const two = createDirectionOrder();
    one.update(Up);
    one.update(Up | Right);
    two.update(Right);
    expect([...two.order]).toEqual([0, 0, 0, 1]);
    expect([...one.order]).toEqual([1, 0, 0, 2]);
  });
});
