/**
 * `core/options` Option types (plan M2-04, shmup_feat.md §8): per-type movement — the Snake chain
 * swings out opposite to the ship's motion and keeps its shape when the ship stops, the Formation
 * sits at its `>` offsets and spreads into its `V`, the Rotate Options orbit evenly and widen when
 * extended — plus the spread / extend control (hold PowerUp ≥ 15 ticks, or a Special toggle), the
 * type codes, `setFormation` and the allocation guard of the new placements.
 */
import { describe, expect, it } from 'vitest';
import { Action } from '../../src/input/index.js';
import {
  FORMATION_RETRACTED,
  FORMATION_SPREAD,
  MAX_OPTIONS,
  OPTION_HOLD_TICKS,
  OPTION_MODE_NAMES,
  OPTION_SPREAD_TICKS,
  OptionMode,
  ROTATE_RADIUS,
  ROTATE_RADIUS_EXTENDED,
  ROTATE_SPEED,
  SNAKE_LINK,
  createOptionGroup,
} from '../../src/options/index.js';
import {
  createPlayer,
  createPlayerIntent,
  type PlayerCamera,
  type PlayerIntent,
} from '../../src/player/index.js';
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

describe('core/options types (M2-04)', () => {
  it('names the types in config order and maps unknown names to the trail', () => {
    expect(OPTION_MODE_NAMES).toEqual(['trail', 'snake', 'formation', 'rotate']);
    expect(Object.values(OptionMode)).toEqual([0, 1, 2, 3]);
    const group = createOptionGroup('rotate');
    expect([group.formation, group.mode]).toEqual(['rotate', OptionMode.Rotate]);
    group.setFormation('spiral' as never);
    expect([group.formation, group.mode]).toEqual(['trail', OptionMode.Trail]);
    expect(createOptionGroup().formation).toBe('trail');
  });

  it('Snake: the chain swings out opposite to the motion, SNAKE_LINK apart', () => {
    const group = createOptionGroup('snake');
    const ship = createPlayer(0, 3);
    ship.x = 100;
    ship.y = 100;
    const cam = camera();
    group.reset(ship, cam);
    // Fly right for 100 px: the chain hangs straight out to the left.
    for (let i = 0; i < 50; i++) {
      ship.x += 2;
      group.follow(ship, cam, MAX_OPTIONS, true);
    }
    for (let k = 0; k < MAX_OPTIONS; k++) {
      expect(group.x[k]).toBeCloseTo(ship.x - SNAKE_LINK * (k + 1), 9);
      expect(group.y[k]).toBeCloseTo(100, 9);
    }
    // Then fly down: the chain swings round above the ship.
    for (let i = 0; i < 60; i++) {
      ship.y += 2;
      group.follow(ship, cam, MAX_OPTIONS, true);
    }
    expect(group.y[0]).toBeLessThan(ship.y);
    expect(dist(group.x[0], group.y[0], ship.x, ship.y)).toBeCloseTo(SNAKE_LINK, 9);
    for (let k = 1; k < MAX_OPTIONS; k++) {
      expect(dist(group.x[k], group.y[k], group.x[k - 1], group.y[k - 1])).toBeLessThanOrEqual(
        SNAKE_LINK + 1e-9,
      );
    }
  });

  it('Snake: keeps its shape when the ship stops or pushes against the edge', () => {
    const group = createOptionGroup('snake');
    const ship = createPlayer(0, 3);
    ship.x = 200;
    ship.y = 60;
    const cam = camera();
    group.reset(ship, cam);
    for (let i = 0; i < 40; i++) {
      ship.x += 1.5;
      ship.y += 1;
      group.follow(ship, cam, 3, true);
    }
    const shape = [...group.x, ...group.y];
    // Stopped (and "moving" into a wall: the trail records, the Snake is not pulled).
    for (let i = 0; i < 100; i++) group.follow(ship, cam, 3, i % 2 === 0);
    expect([...group.x, ...group.y]).toEqual(shape);
    // Rides the scroll: screen positions stay, world positions follow the camera.
    ship.x += 30;
    group.follow(ship, camera(30), 3, false);
    for (let k = 0; k < 3; k++) expect(group.x[k]).toBeCloseTo(shape[k] + 30, 9);
  });

  it('Formation: retracted `>` offsets, spreading into the `V` over OPTION_SPREAD_TICKS', () => {
    const group = createOptionGroup('formation');
    const ship = createPlayer(0, 3);
    ship.x = 120;
    ship.y = 90;
    group.reset(ship, camera());
    group.follow(ship, camera(), 4, false);
    for (let k = 0; k < 4; k++) {
      expect(group.x[k]).toBe(120 + FORMATION_RETRACTED[k * 2]);
      expect(group.y[k]).toBe(90 + FORMATION_RETRACTED[k * 2 + 1]);
    }
    // The `>`: every option behind the ship, the pairs mirrored.
    expect(group.x[0]).toBeLessThan(120);
    expect(group.y[0] - 90).toBe(-(group.y[1] - 90));
    const toggle = intent(0, Action.Special);
    group.steer(toggle);
    const idle = intent();
    for (let t = 1; t < OPTION_SPREAD_TICKS; t++) group.steer(idle);
    expect(group.spreadTicks).toBe(OPTION_SPREAD_TICKS);
    group.follow(ship, camera(), 4, false);
    for (let k = 0; k < 4; k++) {
      expect(group.x[k]).toBeCloseTo(120 + FORMATION_SPREAD[k * 2], 9);
      expect(group.y[k]).toBeCloseTo(90 + FORMATION_SPREAD[k * 2 + 1], 9);
    }
    // Half way back after another toggle and half the ticks.
    group.steer(toggle);
    for (let t = 1; t < OPTION_SPREAD_TICKS / 2; t++) group.steer(idle);
    group.follow(ship, camera(), 1, false);
    const r = FORMATION_RETRACTED[0];
    expect(group.x[0]).toBeCloseTo(120 + (r + FORMATION_SPREAD[0]) / 2, 9);
    // The offsets move with the ship.
    ship.y += 10;
    group.follow(ship, camera(), 1, false);
    expect(group.y[0]).toBeCloseTo(100 + (FORMATION_RETRACTED[1] + FORMATION_SPREAD[1]) / 2, 9);
  });

  it('Rotate: evenly spaced orbit, ROTATE_SPEED per tick, wider when extended', () => {
    const group = createOptionGroup('rotate');
    const ship = createPlayer(0, 3);
    ship.x = 150;
    ship.y = 100;
    group.reset(ship, camera());
    group.follow(ship, camera(), 2, false);
    expect(group.angle).toBe(ROTATE_SPEED);
    for (let k = 0; k < 2; k++) {
      expect(dist(group.x[k], group.y[k], 150, 100)).toBeCloseTo(ROTATE_RADIUS, 3);
    }
    // Two options sit opposite each other.
    expect(group.x[0] + group.x[1]).toBeCloseTo(300, 3);
    expect(group.y[0] + group.y[1]).toBeCloseTo(200, 3);
    const before = [group.x[0], group.y[0]];
    group.follow(ship, camera(), 2, false);
    expect([group.x[0], group.y[0]]).not.toEqual(before);
    // Hold PowerUp: nothing until OPTION_HOLD_TICKS, then the orbit widens.
    const hold = intent(Action.PowerUp);
    for (let t = 0; t < OPTION_HOLD_TICKS - 1; t++) group.steer(hold);
    expect(group.spreadTicks).toBe(0);
    for (let t = 0; t < OPTION_SPREAD_TICKS + 1; t++) group.steer(hold);
    expect(group.spreadTicks).toBe(OPTION_SPREAD_TICKS);
    group.follow(ship, camera(), 3, false);
    for (let k = 0; k < 3; k++) {
      expect(dist(group.x[k], group.y[k], 150, 100)).toBeCloseTo(ROTATE_RADIUS_EXTENDED, 3);
    }
    // Released: it pulls back in.
    const idle = intent();
    for (let t = 0; t < OPTION_SPREAD_TICKS; t++) group.steer(idle);
    expect([group.spreadTicks, group.holdTicks]).toEqual([0, 0]);
  });

  it('a quick PowerUp tap never moves the options; a Special press toggles; reset retracts', () => {
    const group = createOptionGroup('formation');
    const ship = createPlayer(0, 3);
    group.reset(ship, camera());
    for (let i = 0; i < 20; i++) group.steer(intent(i % 4 === 0 ? Action.PowerUp : 0));
    expect(group.spreadTicks).toBe(0);
    group.steer(intent(0, Action.Special));
    expect([group.toggled, group.spreadTicks]).toEqual([true, 1]);
    // Holding Special does nothing more than its press.
    for (let i = 0; i < 20; i++) group.steer(intent(Action.Special));
    expect(group.toggled).toBe(true);
    group.reset(ship, camera());
    expect([group.toggled, group.spreadTicks, group.holdTicks, group.angle]).toEqual([
      false,
      0,
      0,
      0,
    ]);
  });

  it('the trail type is unchanged by the new state (steer never moves trail options)', () => {
    const a = createOptionGroup('trail');
    const b = createOptionGroup('trail');
    const ship = createPlayer(0, 3);
    a.reset(ship, camera());
    b.reset(ship, camera());
    for (let i = 0; i < 40; i++) {
      ship.y += 1;
      a.steer(intent(Action.PowerUp, i === 3 ? Action.Special : 0));
      a.follow(ship, camera(), 4, true);
      b.follow(ship, camera(), 4, true);
    }
    expect([...a.x, ...a.y]).toEqual([...b.x, ...b.y]);
  });
});

describe('core/options types allocation', () => {
  it('steers and places Snake, Formation and Rotate options without allocating', () => {
    const groups = [
      createOptionGroup('snake'),
      createOptionGroup('formation'),
      createOptionGroup('rotate'),
    ];
    const s = createPlayer(0, 3);
    s.x = 40.5;
    s.y = 60.25;
    const cam = { x: 0.5, y: 0, dx: 0.75, dy: 0 };
    const hold = intent(Action.PowerUp);
    const tap = intent(0, Action.Special);
    const idle = intent();
    for (const g of groups) g.reset(s, cam);
    const growth = measureHeapGrowth(
      (i) => {
        cam.x += 0.75;
        s.x = cam.x + 40 + (i % 7) * 0.5;
        s.y = 60.25 + (i % 13) * 1.5;
        const input = i % 50 < 20 ? hold : i % 97 === 0 ? tap : idle;
        for (let g = 0; g < 3; g++) {
          const group = groups[g];
          group.steer(input);
          group.follow(s, cam, (i % 5) | 0, i % 3 !== 0);
        }
      },
      50_000,
      20_000,
    );
    expect(growth.bytes).toBeLessThan(64 * 1024);
  });
});
