/**
 * `core/options` (plan M1-10): the standard trail Option's ring buffer — a fresh trail puts every
 * option on the ship, the buffer advances only when asked (movement input), option `k` sits
 * `(k + 1) × OPTION_SPACING` records back in screen space, counts are clamped, `hide` keeps the
 * trail. The World-level behaviour (bunching while idle during scrolling, spreading when moving)
 * is covered in `test/weapons/weapons.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import {
  MAX_OPTIONS,
  OPTION_SPACING,
  OPTION_TRAIL_CAPACITY,
  createOptionGroup,
  moduleInfo,
} from '../../src/options/index.js';
import { createPlayer, type PlayerCamera } from '../../src/player/index.js';

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

describe('core/options', () => {
  it('describes itself as an implemented module', () => {
    expect(moduleInfo.name).toBe('options');
    expect(moduleInfo.status).toBe('implemented');
    expect(moduleInfo.specRefs).toContain('shmup_feat.md §8');
    expect(OPTION_TRAIL_CAPACITY).toBe(MAX_OPTIONS * OPTION_SPACING + 1);
  });

  it('starts every option on the ship after a reset', () => {
    const group = createOptionGroup();
    const ship = createPlayer(0, 3);
    ship.x = 150;
    ship.y = 80;
    group.reset(ship, camera(100, 10));
    expect(group.trailX.every((x) => x === 50)).toBe(true);
    expect(group.trailY.every((y) => y === 70)).toBe(true);
    group.follow(ship, camera(100, 10), 4, false);
    expect(group.count).toBe(4);
    expect([...group.x]).toEqual([150, 150, 150, 150]);
    expect([...group.y]).toEqual([80, 80, 80, 80]);
  });

  it('places option k (k + 1) × spacing records back, in screen space', () => {
    const group = createOptionGroup();
    const ship = createPlayer(0, 3);
    group.reset(ship, camera());
    // Record 60 steps: the ship moves down 2 px per record while the camera scrolls 1 px.
    let cam = 0;
    for (let i = 1; i <= 60; i++) {
      cam += 1;
      ship.x = cam + 40;
      ship.y = 2 * i;
      group.follow(ship, camera(cam), 3, true);
    }
    for (let k = 0; k < 3; k++) {
      expect(group.x[k]).toBe(cam + 40); // same screen x as the ship: it rides the camera
      expect(group.y[k]).toBe(2 * (60 - (k + 1) * OPTION_SPACING));
    }
  });

  it('does not advance the trail without movement (options hold their place on screen)', () => {
    const group = createOptionGroup();
    const ship = createPlayer(0, 3);
    group.reset(ship, camera());
    for (let i = 1; i <= 30; i++) {
      ship.y = i;
      group.follow(ship, camera(), 2, true);
    }
    const before = [...group.y];
    // Idle while the camera scrolls 50 px: the ship rides along, the options too.
    ship.x += 50;
    group.follow(ship, camera(50), 2, false);
    expect([...group.y]).toEqual(before);
    expect(group.x[0]).toBe(50);
    expect(group.head).toBe(30 % OPTION_TRAIL_CAPACITY);
  });

  it('clamps the count and hides without losing the trail', () => {
    const group = createOptionGroup();
    const ship = createPlayer(0, 3);
    group.reset(ship, camera());
    group.follow(ship, camera(), 9, false);
    expect(group.count).toBe(MAX_OPTIONS);
    group.follow(ship, camera(), 2.7, false);
    expect(group.count).toBe(2);
    group.follow(ship, camera(), -1, false);
    expect(group.count).toBe(0);
    group.follow(ship, camera(), NaN, false);
    expect(group.count).toBe(0);
    group.follow(ship, camera(), 1, true);
    const head = group.head;
    group.hide();
    expect(group.count).toBe(0);
    expect(group.head).toBe(head);
    expect(group.formation).toBe('trail');
    expect(group.stolen).toBe(0);
  });

  it('wraps the ring buffer', () => {
    const group = createOptionGroup();
    const ship = createPlayer(0, 3);
    group.reset(ship, camera());
    for (let i = 1; i <= OPTION_TRAIL_CAPACITY * 3 + 5; i++) {
      ship.x = i;
      group.follow(ship, camera(), 4, true);
    }
    const last = OPTION_TRAIL_CAPACITY * 3 + 5;
    expect(group.head).toBe(last % OPTION_TRAIL_CAPACITY);
    for (let k = 0; k < 4; k++) expect(group.x[k]).toBe(last - (k + 1) * OPTION_SPACING);
  });
});
