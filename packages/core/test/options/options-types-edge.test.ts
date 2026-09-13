/**
 * `core/options` Option types — edge cases beyond `options-types.test.ts` (plan M2-04,
 * shmup_feat.md §8):
 *
 * - `setFormation` / `createOptionGroup` for every name, keeping the per-type state (a cold path);
 *   `reset` leaves `count` alone;
 * - counts are clamped / floored for every placed type (fractions, Infinity, NaN, negative), and
 *   options past `count` keep their last positions;
 * - Snake: links exactly `SNAKE_LINK` away are not pulled (closed test), a NaN link snaps back
 *   onto its leader, the unowned links are pulled too (a new Option joins at the chain's end),
 *   the chain lives in screen space while the ship stands still and the view scrolls;
 * - Formation: offsets independent of the camera, only `count` options written, every
 *   intermediate spread step linear;
 * - Rotate: the orbit angle wraps, turns even with no Options, 1 / 3 / 4 Options evenly spaced,
 *   a half spread is the mid radius, the centre follows the ship;
 * - `steer`: `holdTicks` saturates, a toggle mid-spread reverses it one step at a time, a hold and
 *   a toggle combine (either keeps them out), Special and PowerUp on the same tick, the hold must
 *   be unbroken, the trail type records the same state but never uses it;
 * - `hide` keeps positions.
 */
import { describe, expect, it } from 'vitest';
import { Action } from '../../src/input/index.js';
import {
  FORMATION_RETRACTED,
  FORMATION_SPREAD,
  MAX_OPTIONS,
  OPTION_HOLD_TICKS,
  OPTION_MODE_NAMES,
  OPTION_RADIUS,
  OPTION_SPREAD_TICKS,
  OptionMode,
  ROTATE_RADIUS,
  ROTATE_RADIUS_EXTENDED,
  ROTATE_SPEED,
  SNAKE_LINK,
  STOLEN_OPTION_SPRITE,
  createOptionGroup,
  type OptionGroup,
} from '../../src/options/index.js';
import { OPTION_CHOICES } from '../../src/config/index.js';
import {
  createPlayer,
  createPlayerIntent,
  type PlayerCamera,
  type PlayerIntent,
  type PlayerShip,
} from '../../src/player/index.js';

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

/**
 * An intent holding / pressing actions.
 *
 * @param held - Held mask.
 * @param pressed - Pressed mask.
 * @returns The intent.
 */
function intent(held = 0, pressed = 0): PlayerIntent {
  const i = createPlayerIntent();
  i.held = held;
  i.pressed = pressed;
  return i;
}

/**
 * Distance between two points.
 *
 * @param ax - A x.
 * @param ay - A y.
 * @param bx - B x.
 * @param by - B y.
 * @returns The distance.
 */
function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.sqrt((ax - bx) * (ax - bx) + (ay - by) * (ay - by));
}

/**
 * Steers a group `ticks` times with one intent.
 *
 * @param group - The group.
 * @param input - The intent.
 * @param ticks - How many ticks.
 */
function steer(group: OptionGroup, input: PlayerIntent, ticks: number): void {
  for (let t = 0; t < ticks; t++) group.steer(input);
}

describe('core/options types edges: names, codes, reset', () => {
  it('config `OPTION_CHOICES` and the mode names agree code for code', () => {
    expect([...OPTION_MODE_NAMES]).toEqual([...OPTION_CHOICES]);
    expect(Object.isFrozen(OPTION_MODE_NAMES)).toBe(true);
    for (let code = 0; code < OPTION_CHOICES.length; code++) {
      const group = createOptionGroup(OPTION_CHOICES[code]);
      expect([group.formation, group.mode]).toEqual([OPTION_CHOICES[code], code]);
    }
    expect([OptionMode.Trail, OptionMode.Snake, OptionMode.Formation, OptionMode.Rotate]).toEqual([
      0, 1, 2, 3,
    ]);
    expect(STOLEN_OPTION_SPRITE).toBe('options/stolen');
    expect(OPTION_RADIUS).toBe(4);
  });

  it('setFormation keeps the per-type state; the next reset starts it afresh', () => {
    const group = createOptionGroup('rotate');
    const s = ship(100, 80);
    group.reset(s, camera());
    group.steer(intent(0, Action.Special));
    steer(group, intent(), 5);
    group.follow(s, camera(), 2, false);
    const kept = [group.toggled, group.spreadTicks, group.angle];
    expect(kept).toEqual([true, 6, ROTATE_SPEED]);
    group.setFormation('formation');
    expect([group.toggled, group.spreadTicks, group.angle]).toEqual(kept);
    // The Formation uses the kept spread at once.
    group.follow(s, camera(), 1, false);
    const t = 6 / OPTION_SPREAD_TICKS;
    expect(group.x[0]).toBeCloseTo(
      100 + FORMATION_RETRACTED[0] + (FORMATION_SPREAD[0] - FORMATION_RETRACTED[0]) * t,
      9,
    );
    group.reset(s, camera());
    expect([group.toggled, group.spreadTicks, group.angle, group.holdTicks]).toEqual([
      false,
      0,
      0,
      0,
    ]);
  });

  it('reset leaves `count` alone and puts every option, trail entry and link on the ship', () => {
    const group = createOptionGroup('snake');
    const s = ship(40, 30);
    group.reset(s, camera(10, 5));
    group.follow(s, camera(10, 5), 3, true);
    expect(group.count).toBe(3);
    s.x = 90;
    s.y = 70;
    group.reset(s, camera(20, 10));
    expect(group.count).toBe(3);
    expect(group.head).toBe(0);
    expect([...group.snakeX]).toEqual([70, 70, 70, 70]);
    expect([...group.snakeY]).toEqual([60, 60, 60, 60]);
    expect([...group.x]).toEqual([90, 90, 90, 90]);
    expect([...group.y]).toEqual([70, 70, 70, 70]);
    expect(group.trailX.every((v) => v === 70)).toBe(true);
  });

  it('hide keeps every position and the per-type state; only `count` drops to 0', () => {
    const group = createOptionGroup('formation');
    const s = ship(60, 60);
    group.reset(s, camera());
    group.steer(intent(0, Action.Special));
    group.follow(s, camera(), 4, false);
    const xs = [...group.x];
    group.hide();
    expect(group.count).toBe(0);
    expect([...group.x]).toEqual(xs);
    expect([group.toggled, group.spreadTicks]).toEqual([true, 1]);
  });
});

describe('core/options types edges: counts', () => {
  it.each(['snake', 'formation', 'rotate'] as const)(
    '%s: counts are clamped and floored; options past `count` keep their positions',
    (type) => {
      const group = createOptionGroup(type);
      const s = ship(150, 100);
      group.reset(s, camera());
      for (const [count, n] of [
        [2.7, 2],
        [Infinity, MAX_OPTIONS],
        [9, MAX_OPTIONS],
        [NaN, 0],
        [-3, 0],
        [0.99, 0],
        [1, 1],
      ] as const) {
        group.follow(s, camera(), count, false);
        expect(group.count).toBe(n);
      }
      // Place all four, then only one: 2–4 are not written any more.
      s.x = 200;
      group.follow(s, camera(), 4, false);
      const tail = [group.x[1], group.x[2], group.x[3], group.y[1], group.y[2], group.y[3]];
      s.x = 260;
      s.y = 40;
      for (let t = 0; t < 30; t++) group.follow(s, camera(), 1, false);
      expect([group.x[1], group.x[2], group.x[3], group.y[1], group.y[2], group.y[3]]).toEqual(
        tail,
      );
      for (const v of [...group.x, ...group.y]) expect(Number.isFinite(v)).toBe(true);
    },
  );
});

describe('core/options types edges: Snake', () => {
  it('a link exactly SNAKE_LINK away is not pulled (closed); one a hair further is', () => {
    const group = createOptionGroup('snake');
    const s = ship(100, 100);
    group.reset(s, camera());
    group.snakeX[0] = 100 - SNAKE_LINK;
    group.follow(s, camera(), 1, true);
    expect([group.snakeX[0], group.snakeY[0]]).toEqual([100 - SNAKE_LINK, 100]);
    s.x = 100.5;
    group.follow(s, camera(), 1, true);
    expect(group.snakeX[0]).toBeCloseTo(100.5 - SNAKE_LINK, 12);
    expect(dist(group.x[0], group.y[0], s.x, s.y)).toBeCloseTo(SNAKE_LINK, 12);
  });

  it('a NaN link snaps back onto its leader; the chain behind it follows on', () => {
    const group = createOptionGroup('snake');
    const s = ship(120, 90);
    group.reset(s, camera());
    group.snakeX[1] = NaN;
    group.snakeY[2] = NaN;
    group.follow(s, camera(), MAX_OPTIONS, true);
    for (let k = 0; k < MAX_OPTIONS; k++) {
      expect([group.x[k], group.y[k]]).toEqual([120, 90]);
    }
  });

  it('pulls the unowned links too: a new Option joins at the end of the laid-out chain', () => {
    const group = createOptionGroup('snake');
    const s = ship(50, 100);
    group.reset(s, camera());
    for (let t = 0; t < 60; t++) {
      s.x += 2;
      group.follow(s, camera(), 1, true);
    }
    expect(group.count).toBe(1);
    for (let k = 0; k < MAX_OPTIONS; k++) {
      expect(group.snakeX[k]).toBeCloseTo(s.x - SNAKE_LINK * (k + 1), 9);
    }
    group.follow(s, camera(), 4, false);
    expect(group.x[3]).toBeCloseTo(s.x - 4 * SNAKE_LINK, 9);
  });

  it('lives in screen space: a still ship under a scrolling view keeps the chain on screen', () => {
    const group = createOptionGroup('snake');
    const s = ship(100, 100);
    group.reset(s, camera());
    for (let t = 0; t < 30; t++) {
      s.y -= 2;
      group.follow(s, camera(), 2, true);
    }
    const sx = [group.x[0], group.x[1]];
    const sy = [group.y[0], group.y[1]];
    // The view scrolls right and down; the ship rides along (the same screen position).
    for (let t = 1; t <= 50; t++) {
      const cam = camera(t, t * 0.5);
      s.x = 100 + t;
      s.y = 40 + t * 0.5;
      group.follow(s, cam, 2, false);
    }
    for (let k = 0; k < 2; k++) {
      expect(group.x[k]).toBeCloseTo(sx[k] + 50, 9);
      expect(group.y[k]).toBeCloseTo(sy[k] + 25, 9);
    }
  });

  it('a ship moving back into its own chain never stretches a link', () => {
    const group = createOptionGroup('snake');
    const s = ship(100, 100);
    group.reset(s, camera());
    for (let t = 0; t < 200; t++) {
      // A tight circle: the leader keeps turning back over its links.
      const a = t % 8;
      s.x += a < 2 ? 3 : a < 4 ? 0 : a < 6 ? -3 : 0;
      s.y += a < 2 ? 0 : a < 4 ? 3 : a < 6 ? 0 : -3;
      group.follow(s, camera(), MAX_OPTIONS, true);
      let lx = s.x;
      let ly = s.y;
      for (let k = 0; k < MAX_OPTIONS; k++) {
        expect(dist(group.x[k], group.y[k], lx, ly)).toBeLessThanOrEqual(SNAKE_LINK + 1e-9);
        lx = group.x[k];
        ly = group.y[k];
      }
    }
  });
});

describe('core/options types edges: Formation', () => {
  it('sits at the same offsets whatever the camera; only `count` options are written', () => {
    const group = createOptionGroup('formation');
    const s = ship(300.25, 120.5);
    group.reset(s, camera());
    group.x.fill(-1);
    group.follow(s, camera(123.5, 17.25), 2, true);
    for (let k = 0; k < 2; k++) {
      expect(group.x[k]).toBe(300.25 + FORMATION_RETRACTED[k * 2]);
      expect(group.y[k]).toBe(120.5 + FORMATION_RETRACTED[k * 2 + 1]);
    }
    expect([group.x[2], group.x[3]]).toEqual([-1, -1]);
  });

  it('moves linearly through every spread step, then stops at the V', () => {
    const group = createOptionGroup('formation');
    const s = ship(100, 100);
    group.reset(s, camera());
    const hold = intent(Action.PowerUp);
    steer(group, hold, OPTION_HOLD_TICKS - 1);
    for (let step = 1; step <= OPTION_SPREAD_TICKS + 3; step++) {
      group.steer(hold);
      const t = Math.min(step, OPTION_SPREAD_TICKS) / OPTION_SPREAD_TICKS;
      group.follow(s, camera(), 4, false);
      expect(group.spreadTicks).toBe(Math.min(step, OPTION_SPREAD_TICKS));
      for (let k = 0; k < 4; k++) {
        const i = k * 2;
        expect(group.x[k]).toBeCloseTo(
          100 + FORMATION_RETRACTED[i] + (FORMATION_SPREAD[i] - FORMATION_RETRACTED[i]) * t,
          9,
        );
        expect(group.y[k]).toBeCloseTo(
          100 +
            FORMATION_RETRACTED[i + 1] +
            (FORMATION_SPREAD[i + 1] - FORMATION_RETRACTED[i + 1]) * t,
          9,
        );
      }
    }
    // Every option stays behind (or level with) the ship's nose, the pairs mirrored.
    for (let k = 0; k < 4; k++) expect(group.x[k]).toBeLessThan(100);
    expect(group.y[0] - 100).toBeCloseTo(-(group.y[1] - 100), 9);
    expect(group.y[2] - 100).toBeCloseTo(-(group.y[3] - 100), 9);
  });

  it('the offset tables hold four mirrored pairs, the V wider than the `>`', () => {
    expect(FORMATION_RETRACTED).toHaveLength(2 * MAX_OPTIONS);
    expect(FORMATION_SPREAD).toHaveLength(2 * MAX_OPTIONS);
    expect(Object.isFrozen(FORMATION_RETRACTED) && Object.isFrozen(FORMATION_SPREAD)).toBe(true);
    for (let k = 0; k < MAX_OPTIONS; k++) {
      const r = Math.abs(FORMATION_RETRACTED[k * 2 + 1]);
      const v = Math.abs(FORMATION_SPREAD[k * 2 + 1]);
      expect(v).toBeGreaterThan(r);
    }
  });
});

describe('core/options types edges: Rotate', () => {
  it('the orbit angle wraps round the circle and turns even with no Options', () => {
    const group = createOptionGroup('rotate');
    const s = ship(100, 100);
    group.reset(s, camera());
    group.follow(s, camera(), 0, false);
    expect([group.angle, group.count]).toEqual([ROTATE_SPEED, 0]);
    for (let t = 1; t < 86; t++) group.follow(s, camera(), 0, false);
    expect(group.angle).toBe((86 * ROTATE_SPEED) & 1023);
    expect(group.angle).toBeLessThan(ROTATE_SPEED);
  });

  it.each([1, 3, 4])('%i Options sit evenly round the ship at the orbit radius', (n) => {
    const group = createOptionGroup('rotate');
    const s = ship(150, 100);
    group.reset(s, camera());
    for (let t = 0; t < 7; t++) group.follow(s, camera(), n, false);
    let cx = 0;
    let cy = 0;
    for (let k = 0; k < n; k++) {
      expect(dist(group.x[k], group.y[k], 150, 100)).toBeCloseTo(ROTATE_RADIUS, 2);
      cx += group.x[k];
      cy += group.y[k];
    }
    if (n > 1) {
      // Evenly spaced (to a binary unit — 1024 / 3 is truncated): their centre is the ship,
      // neighbours equally far apart.
      expect(Math.abs(cx / n - 150)).toBeLessThan(0.1);
      expect(Math.abs(cy / n - 100)).toBeLessThan(0.1);
      const chord = dist(group.x[0], group.y[0], group.x[1], group.y[1]);
      for (let k = 1; k < n; k++) {
        const next = (k + 1) % n;
        const d = dist(group.x[k], group.y[k], group.x[next], group.y[next]);
        expect(Math.abs(d - chord)).toBeLessThan(0.15);
      }
    }
  });

  it('half the spread steps give the mid radius; the centre follows the ship', () => {
    const group = createOptionGroup('rotate');
    const s = ship(150, 100);
    group.reset(s, camera());
    group.steer(intent(0, Action.Special));
    steer(group, intent(), OPTION_SPREAD_TICKS / 2 - 1);
    expect(group.spreadTicks).toBe(OPTION_SPREAD_TICKS / 2);
    s.x = 40.5;
    s.y = 170.25;
    group.follow(s, camera(99, 3), 2, false);
    const mid = (ROTATE_RADIUS + ROTATE_RADIUS_EXTENDED) / 2;
    for (let k = 0; k < 2; k++) {
      expect(dist(group.x[k], group.y[k], 40.5, 170.25)).toBeCloseTo(mid, 2);
    }
  });

  it('turns clockwise on screen (y down): the first Option starts ahead and swings below', () => {
    const group = createOptionGroup('rotate');
    const s = ship(0, 0);
    group.reset(s, camera());
    group.follow(s, camera(), 1, false);
    expect(group.x[0]).toBeGreaterThan(19);
    expect(group.y[0]).toBeGreaterThan(0);
    for (let t = 0; t < 20; t++) group.follow(s, camera(), 1, false);
    // angle 252: just short of straight below.
    expect(group.angle).toBe(21 * ROTATE_SPEED);
    expect(group.y[0]).toBeGreaterThan(19);
  });
});

describe('core/options types edges: steer', () => {
  it('holdTicks saturates at OPTION_HOLD_TICKS and the hold must be unbroken', () => {
    const group = createOptionGroup('rotate');
    const hold = intent(Action.PowerUp);
    steer(group, hold, 100);
    expect([group.holdTicks, group.spreadTicks]).toEqual([OPTION_HOLD_TICKS, OPTION_SPREAD_TICKS]);
    group.steer(intent()); // one tick released
    expect([group.holdTicks, group.spreadTicks]).toEqual([0, OPTION_SPREAD_TICKS - 1]);
    // Released for one tick every 10: never reaches the hold again, keeps pulling in.
    for (let t = 0; t < 60; t++) group.steer(t % 10 === 9 ? intent() : hold);
    expect(group.holdTicks).toBeLessThan(OPTION_HOLD_TICKS);
    expect(group.spreadTicks).toBe(0);
  });

  it('a toggle mid-spread reverses it one step at a time', () => {
    const group = createOptionGroup('formation');
    const idle = intent();
    group.steer(intent(0, Action.Special));
    steer(group, idle, 4);
    expect(group.spreadTicks).toBe(5);
    group.steer(intent(0, Action.Special));
    expect([group.toggled, group.spreadTicks]).toEqual([false, 4]);
    steer(group, idle, 10);
    expect(group.spreadTicks).toBe(0);
  });

  it('a hold and a toggle combine: either keeps the Options out', () => {
    const group = createOptionGroup('rotate');
    const hold = intent(Action.PowerUp);
    steer(group, hold, OPTION_HOLD_TICKS + OPTION_SPREAD_TICKS);
    expect(group.spreadTicks).toBe(OPTION_SPREAD_TICKS);
    // Toggled out while held, then released: they stay out.
    group.steer(intent(Action.PowerUp, Action.Special));
    expect(group.toggled).toBe(true);
    steer(group, intent(), 20);
    expect(group.spreadTicks).toBe(OPTION_SPREAD_TICKS);
    // Toggled back in while held: the hold keeps them out until it ends.
    steer(group, hold, OPTION_HOLD_TICKS);
    group.steer(intent(Action.PowerUp, Action.Special));
    expect(group.toggled).toBe(false);
    steer(group, hold, 5);
    expect(group.spreadTicks).toBe(OPTION_SPREAD_TICKS);
    steer(group, intent(), OPTION_SPREAD_TICKS);
    expect(group.spreadTicks).toBe(0);
  });

  it('two Special presses on consecutive ticks cancel out after one step', () => {
    const group = createOptionGroup('formation');
    const tap = intent(Action.Special, Action.Special);
    group.steer(tap);
    group.steer(tap);
    expect([group.toggled, group.spreadTicks]).toEqual([false, 0]);
  });

  it('the trail records the same steering state but never moves by it', () => {
    const steered = createOptionGroup('trail');
    const plain = createOptionGroup('trail');
    const s = ship(80, 80);
    steered.reset(s, camera());
    plain.reset(s, camera());
    steered.steer(intent(0, Action.Special));
    steer(steered, intent(Action.PowerUp), 30);
    expect([steered.toggled, steered.spreadTicks, steered.holdTicks]).toEqual([
      true,
      OPTION_SPREAD_TICKS,
      OPTION_HOLD_TICKS,
    ]);
    for (let t = 0; t < 40; t++) {
      s.x += 1;
      steered.follow(s, camera(), 4, true);
      plain.follow(s, camera(), 4, true);
    }
    expect([...steered.x, ...steered.y]).toEqual([...plain.x, ...plain.y]);
    // The Snake does not use it either.
    const snakeA = createOptionGroup('snake');
    const snakeB = createOptionGroup('snake');
    snakeA.reset(s, camera());
    snakeB.reset(s, camera());
    snakeA.steer(intent(0, Action.Special));
    steer(snakeA, intent(), 20);
    for (let t = 0; t < 30; t++) {
      s.y += 1;
      snakeA.follow(s, camera(), 4, true);
      snakeB.follow(s, camera(), 4, true);
    }
    expect([...snakeA.x, ...snakeA.y]).toEqual([...snakeB.x, ...snakeB.y]);
  });
});
