/**
 * ships: movement/wrap/trail/timeline of one ship, and the three lane strategies driven by a KeyTracker.
 */

import { describe, expect, it } from 'vitest';

import { KeyCode } from '../src/keys';
import { KeyTracker } from '../src/keyTracker';
import {
  NAIVE_STEP_PX,
  SHIP_SPEED_PX,
  Ship,
  TIMELINE_FRAMES,
  TRAIL_LENGTH,
  axis,
  createLanes,
  stepLanes,
  wrap,
} from '../src/ships';

const { Left, Up, Right, Down } = KeyCode;

describe('wrap / axis', () => {
  it('wraps into [0, size)', () => {
    expect(wrap(0, 800)).toBe(0);
    expect(wrap(800, 800)).toBe(0);
    expect(wrap(805, 800)).toBe(5);
    expect(wrap(-1, 800)).toBe(799);
    expect(wrap(-1601, 800)).toBe(799);
    expect(wrap(3.5, 800)).toBe(3.5);
    expect(wrap(10, 0)).toBe(0);
    expect(wrap(10, -5)).toBe(0);
  });

  it('axis from two flags', () => {
    expect(axis(false, false)).toBe(0);
    expect(axis(true, false)).toBe(-1);
    expect(axis(false, true)).toBe(1);
    expect(axis(true, true)).toBe(0);
  });
});

describe('Ship', () => {
  it('starts centered with the trail on its position', () => {
    const s = new Ship(800, 150);
    expect([s.x, s.y]).toEqual([400, 75]);
    expect(Array.from(s.trailX).every((v) => v === 400)).toBe(true);
    expect(s.timelineCount).toBe(0);
    expect(s.timelineAt(0)).toBe(0);
  });

  it('moves with wrap-around and records trail and timeline', () => {
    const s = new Ship(100, 50);
    expect(s.step(60, -30)).toBe(true); // (50,25) → (110→10, -5→45)
    expect([s.x, s.y]).toEqual([10, 45]);
    expect(s.step(0, 0)).toBe(false);
    expect(s.timelineAt(0)).toBe(0);
    expect(s.timelineAt(1)).toBe(1);
    expect(s.timelineAt(2)).toBe(0); // not recorded yet
    expect(s.trailX[0]).toBe(10);
    expect(s.trailHead).toBe(2);
  });

  it('trail and timeline are ring buffers', () => {
    const s = new Ship(1000, 1000);
    for (let i = 0; i < TRAIL_LENGTH + 3; i++) s.step(1, 0);
    expect(s.trailHead).toBe(3);
    for (let i = 0; i < TIMELINE_FRAMES; i++) s.step(i % 2 === 0 ? 1 : 0, 0);
    expect(s.timelineCount).toBe(TIMELINE_FRAMES);
    // newest frame (i = 239) did not move, the one before did
    expect(s.timelineAt(0)).toBe(0);
    expect(s.timelineAt(1)).toBe(1);
    expect(s.timelineAt(TIMELINE_FRAMES - 1)).toBe(1);
    expect(s.timelineAt(TIMELINE_FRAMES)).toBe(0);
  });
});

describe('stepLanes', () => {
  it('raw lane moves while raw-held, diagonally for two arrows', () => {
    const tr = new KeyTracker();
    const lanes = createLanes(800, 150);
    tr.keyDown(Right, false, 0);
    tr.keyDown(Up, false, 0);
    stepLanes(lanes, tr, 16);
    expect(lanes.raw.x).toBe(400 + SHIP_SPEED_PX);
    expect(lanes.raw.y).toBe(75 - SHIP_SPEED_PX);
    expect(lanes.debounced.x).toBe(400 + SHIP_SPEED_PX);
    expect(lanes.debounced.y).toBe(75 - SHIP_SPEED_PX);
  });

  it('opposite arrows cancel', () => {
    const tr = new KeyTracker();
    const lanes = createLanes(800, 150);
    tr.keyDown(Left, false, 0);
    tr.keyDown(Right, false, 0);
    tr.takeNaiveDowns(Left);
    tr.takeNaiveDowns(Right);
    stepLanes(lanes, tr, 16);
    expect(lanes.raw.timelineAt(0)).toBe(0);
    expect(lanes.debounced.timelineAt(0)).toBe(0);
  });

  it('naive lane moves a fixed step per keydown event, repeats included', () => {
    const tr = new KeyTracker();
    const lanes = createLanes(800, 150);
    tr.keyDown(Down, false, 0);
    tr.keyDown(Down, true, 500);
    tr.keyDown(Down, true, 530);
    stepLanes(lanes, tr, 540);
    expect(lanes.naive.y).toBe(75 + 3 * NAIVE_STEP_PX);
    stepLanes(lanes, tr, 556); // no new events → naive lane stands still even though the key is held
    expect(lanes.naive.y).toBe(75 + 3 * NAIVE_STEP_PX);
    expect(lanes.naive.timelineAt(0)).toBe(0);
    expect(lanes.raw.timelineAt(0)).toBe(1);
  });

  it('debounced lane hides a fake keyup/keydown pair that makes the raw lane stutter', () => {
    const tr = new KeyTracker();
    const lanes = createLanes(800, 150);
    tr.keyDown(Right, false, 0);
    let t = 0;
    const frame = (): void => {
      t += 16;
      tr.tick(t);
      stepLanes(lanes, tr, t);
    };
    for (let i = 0; i < 30; i++) frame(); // t = 480
    tr.keyUp(Right, 485); // fake pair: 30 ms gap
    frame(); // t = 496
    frame(); // t = 512
    tr.keyDown(Right, false, 515);
    for (let i = 0; i < 10; i++) frame();
    expect(lanes.raw.timelineAt(10)).toBe(0);
    expect(lanes.raw.timelineAt(11)).toBe(0);
    for (let i = 0; i < 42; i++) expect(lanes.debounced.timelineAt(i)).toBe(1);
  });

  it('debounced lane stops ~50 ms after a real release', () => {
    const tr = new KeyTracker();
    const lanes = createLanes(800, 150);
    tr.keyDown(Right, false, 0);
    tr.keyUp(Right, 100);
    stepLanes(lanes, tr, 149);
    expect(lanes.debounced.timelineAt(0)).toBe(1);
    stepLanes(lanes, tr, 150);
    expect(lanes.debounced.timelineAt(0)).toBe(0);
    expect(lanes.raw.timelineAt(0)).toBe(0);
  });
});
