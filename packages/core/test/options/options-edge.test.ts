/**
 * `core/options` edge cases (plan M1-10): the trail ring buffer entry by entry — option `k` reads
 * exactly the entry `(k + 1) × OPTION_SPACING` records back (wrapping below index 0 and past the
 * last slot), a fresh trail covers every entry (so the first options sit on the ship even before
 * 12 steps were recorded), recording the same screen position over and over converges the
 * options on the ship (pushing against the view's edge), vertical scrolling rides along like
 * horizontal scrolling, counts are clamped / floored (fractions, Infinity, NaN, negative), options
 * past `count` keep their last positions, `hide` / `reset` touch only what they document, groups
 * are independent, and `follow` allocates nothing.
 */
import { describe, expect, it } from 'vitest';
import {
  MAX_OPTIONS,
  OPTION_ANIM_TICKS,
  OPTION_SPACING,
  OPTION_SPRITE,
  OPTION_TRAIL_CAPACITY,
  OptionGroup,
  createOptionGroup,
} from '../../src/options/index.js';
import { createPlayer, type PlayerCamera, type PlayerShip } from '../../src/player/index.js';
import { measureHeapGrowth } from '../helpers/alloc.js';

/**
 * A camera at a position.
 *
 * @param x - Camera x.
 * @param y - Camera y.
 * @returns The camera.
 */
function camera(x = 0, y = 0): PlayerCamera {
  return { x, y, dx: 0, dy: 0 };
}

/**
 * A ship at a world position.
 *
 * @param x - World x.
 * @param y - World y.
 * @returns The ship.
 */
function ship(x = 0, y = 0): PlayerShip {
  const s = createPlayer(0, 3);
  s.x = x;
  s.y = y;
  return s;
}

describe('core/options edge cases — the trail entry by entry', () => {
  it('exports the documented constants', () => {
    expect(MAX_OPTIONS).toBe(4);
    expect(OPTION_SPACING).toBe(12);
    expect(OPTION_TRAIL_CAPACITY).toBe(49);
    expect(OPTION_SPRITE).toBe('options/orb');
    expect(OPTION_ANIM_TICKS).toBe(8);
    const group = createOptionGroup();
    expect(group).toBeInstanceOf(OptionGroup);
    expect(group.trailX.length).toBe(OPTION_TRAIL_CAPACITY);
    expect(group.trailY.length).toBe(OPTION_TRAIL_CAPACITY);
    expect(group.x.length).toBe(MAX_OPTIONS);
    expect(group.y.length).toBe(MAX_OPTIONS);
    expect([group.count, group.head, group.stolen, group.formation]).toEqual([0, 0, 0, 'trail']);
  });

  it('reads option k exactly (k + 1) × 12 records back, for every head position', () => {
    const group = createOptionGroup();
    const s = ship();
    const cam = camera();
    group.reset(s, cam);
    // Record 1, 2, 3, …: entry values are the record numbers, so each option's x names the
    // record it reads. Check every head position of three full laps.
    for (let n = 1; n <= OPTION_TRAIL_CAPACITY * 3; n++) {
      s.x = n;
      s.y = -n;
      group.follow(s, cam, MAX_OPTIONS, true);
      expect(group.head).toBe(n % OPTION_TRAIL_CAPACITY);
      expect(group.trailX[group.head]).toBe(n);
      for (let k = 0; k < MAX_OPTIONS; k++) {
        const back = n - (k + 1) * OPTION_SPACING;
        // Before that many records, the entry still holds the reset value (the ship at 0, 0).
        expect(group.x[k], `record ${n}, option ${k}`).toBe(back > 0 ? back : 0);
        expect(group.y[k], `record ${n}, option ${k}`).toBe(back > 0 ? -back : 0);
      }
    }
  });

  it('puts every option on the ship after a reset, before any record', () => {
    const group = createOptionGroup();
    const s = ship(123.25, 45.5);
    const cam = camera(100.75, 20.5);
    group.reset(s, cam);
    // Reset alone already places every option (all four, whatever the count).
    expect([...group.x]).toEqual([123.25, 123.25, 123.25, 123.25]);
    expect([...group.y]).toEqual([45.5, 45.5, 45.5, 45.5]);
    expect(group.head).toBe(0);
    expect(group.trailX.every((v) => v === 22.5)).toBe(true);
    expect(group.trailY.every((v) => v === 25)).toBe(true);
    // A few records later the options that have not been reached yet are still on the start.
    // After 12 records option 1 reads the reset entry itself (12 back from the newest).
    for (let i = 1; i <= OPTION_SPACING; i++) {
      s.y += 1;
      group.follow(s, cam, MAX_OPTIONS, true);
    }
    for (let k = 0; k < MAX_OPTIONS; k++) expect(group.y[k]).toBe(45.5);
    s.y += 1;
    group.follow(s, cam, MAX_OPTIONS, true);
    expect(group.y[0]).toBe(46.5); // option 1 reached the first recorded step
    expect(group.y[1]).toBe(45.5);
  });

  it('converges on the ship when the same position is recorded over and over (edge push)', () => {
    const group = createOptionGroup();
    const s = ship();
    const cam = camera();
    group.reset(s, cam);
    for (let i = 1; i <= 60; i++) {
      s.y = 3 * i;
      group.follow(s, cam, MAX_OPTIONS, true);
    }
    expect(new Set(group.y).size).toBe(MAX_OPTIONS); // spread out
    // Now the ship is stuck at the view's edge but still has movement input: 48 more records of
    // the same position bring the last option onto the ship, one spacing at a time.
    for (let i = 1; i <= MAX_OPTIONS * OPTION_SPACING; i++) {
      group.follow(s, cam, MAX_OPTIONS, true);
      const onShip = [...group.y].filter((y) => y === s.y).length;
      expect(onShip).toBe(Math.min(MAX_OPTIONS, Math.floor(i / OPTION_SPACING)));
    }
    expect([...group.y]).toEqual([180, 180, 180, 180]);
  });

  it('rides vertical scrolling like horizontal scrolling (screen-space entries)', () => {
    const group = createOptionGroup();
    const s = ship(50, 50);
    group.reset(s, camera());
    for (let i = 1; i <= 24; i++) {
      s.x = 50 + i;
      group.follow(s, camera(), 2, true);
    }
    const before = [group.x[0], group.y[0], group.x[1], group.y[1]];
    // The camera pans 30 px down and 7 px right; the ship rides along without input.
    s.x += 7;
    s.y += 30;
    group.follow(s, camera(7, 30), 2, false);
    expect([group.x[0], group.y[0], group.x[1], group.y[1]]).toEqual([
      before[0] + 7,
      before[1] + 30,
      before[2] + 7,
      before[3] + 30,
    ]);
    // A recorded step under the moved camera is stored in screen space.
    group.follow(s, camera(7, 30), 2, true);
    expect(group.trailX[group.head]).toBe(s.x - 7);
    expect(group.trailY[group.head]).toBe(s.y - 30);
  });

  it('clamps and floors the count (fractions, Infinity, NaN, negatives, -0)', () => {
    const group = createOptionGroup();
    const s = ship(10, 10);
    group.reset(s, camera());
    const cases: [number, number][] = [
      [0, 0],
      [0.999, 0],
      [1, 1],
      [1.999, 1],
      [3.5, 3],
      [4, 4],
      [4.5, 4],
      [1e9, 4],
      [Infinity, 4],
      [-Infinity, 0],
      [-0, 0],
      [-3, 0],
      [NaN, 0],
    ];
    for (const [count, expected] of cases) {
      group.follow(s, camera(), count, false);
      expect(group.count, String(count)).toBe(expected);
      expect(Object.is(group.count, -0), String(count)).toBe(false);
    }
  });

  it('leaves the positions of options past the count alone', () => {
    const group = createOptionGroup();
    const s = ship(0, 0);
    group.reset(s, camera());
    for (let i = 1; i <= 60; i++) {
      s.y = i;
      group.follow(s, camera(), 4, true);
    }
    const last = [group.y[2], group.y[3]];
    for (let i = 1; i <= 30; i++) {
      s.y = 100 + i;
      group.follow(s, camera(), 2, true);
    }
    expect(group.count).toBe(2);
    expect([group.y[2], group.y[3]]).toEqual(last);
    // Raising the count again reads the trail as it is now (the options jump onto the path):
    // records 1–60 were y 1–60, records 61–90 y 101–130; 36 and 48 back = records 54 and 42.
    group.follow(s, camera(), 4, false);
    expect([...group.y]).toEqual([118, 106, 54, 42]);
  });

  it('hide keeps the trail and positions; reset keeps the count until the next follow', () => {
    const group = createOptionGroup();
    const s = ship(5, 5);
    group.reset(s, camera());
    for (let i = 1; i <= 20; i++) {
      s.x = 5 + i;
      group.follow(s, camera(), 3, true);
    }
    const trail = [...group.trailX];
    const xs = [...group.x];
    const head = group.head;
    group.hide();
    group.hide();
    expect(group.count).toBe(0);
    expect([...group.trailX]).toEqual(trail);
    expect([...group.x]).toEqual(xs);
    expect(group.head).toBe(head);
    // Showing them again without a record puts them back where they were.
    group.follow(s, camera(), 3, false);
    expect([...group.x]).toEqual(xs);
    group.reset(s, camera());
    expect(group.count).toBe(3); // reset does not touch the count …
    expect(group.head).toBe(0);
    expect([...group.x]).toEqual([s.x, s.x, s.x, s.x]); // … but moves every option to the ship
  });

  it('keeps groups independent', () => {
    const a = createOptionGroup();
    const b = createOptionGroup();
    expect(a).not.toBe(b);
    expect(a.trailX).not.toBe(b.trailX);
    const s = ship(40, 40);
    a.reset(s, camera());
    b.reset(ship(1, 1), camera());
    for (let i = 0; i < 30; i++) {
      s.y++;
      a.follow(s, camera(), 4, true);
    }
    expect(b.head).toBe(0);
    expect(b.trailY.every((v) => v === 1)).toBe(true);
  });
});

describe('core/options allocation', () => {
  it('follows, hides and resets without allocating', () => {
    const group = createOptionGroup();
    const s = ship(20.5, 30.25);
    const cam = { x: 0.5, y: 0, dx: 0, dy: 0 };
    group.reset(s, cam);
    const growth = measureHeapGrowth(
      (i) => {
        cam.x += 0.75;
        s.x = cam.x + 40 + (i % 7) * 0.5;
        s.y = 30.25 + (i % 13) * 1.5;
        group.follow(s, cam, (i % 5) + 0.5, i % 3 !== 0);
        if (i % 97 === 0) group.hide();
        if (i % 1009 === 0) group.reset(s, cam);
      },
      50_000,
      20_000,
    );
    expect(growth.bytes).toBeLessThan(64 * 1024);
  });
});
