/**
 * The debug overlay's ship outlines under the M2-04 Reduce shield: the hurt outline follows the
 * shield's `hurtScale` (⅓ → ⅔ → the full circle once it broke) while the terrain box never
 * changes; a pod shield leaves both alone.
 */
import {
  DrawOp,
  EMPTY_CONTENT_DB,
  PLAYFIELD_Y,
  REDUCE,
  ROTATE_SHIELD,
  absorbShieldHit,
  createDebugFlags,
  createWorld,
  grantShield,
  resolveGameConfig,
  type DebugFlags,
  type DrawList,
  type World,
} from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { buildDebugOutlines, createDebugOutlineLists } from '../../src/debug/index.js';

/**
 * The bounds `[left, top, right, bottom]` of a list's rect commands (inclusive pixels).
 *
 * @param list - The list.
 * @returns The bounds.
 */
function bounds(list: DrawList): [number, number, number, number] {
  let l = Infinity;
  let t = Infinity;
  let r = -Infinity;
  let b = -Infinity;
  for (let i = 0; i < list.count; i++) {
    if (list.op[i] !== DrawOp.Rect) continue;
    l = Math.min(l, list.x[i]);
    t = Math.min(t, list.y[i]);
    r = Math.max(r, list.x[i] + list.w[i] - 1);
    b = Math.max(b, list.y[i] + list.h[i] - 1);
  }
  return [l, t, r, b];
}

/**
 * A free-flight World with the ship alive at screen (99.5, 100) under the HUD bar.
 *
 * @returns The World.
 */
function world(): World {
  const w = createWorld(resolveGameConfig({ seed: 1 }), EMPTY_CONTENT_DB);
  w.camera.x = 1000.5;
  w.camera.y = 20;
  const ship = w.players[0];
  ship.x = 1100;
  ship.y = 120;
  ship.state = 'alive';
  return w;
}

/**
 * Switches with the hitboxes on.
 *
 * @returns The switches.
 */
function outlinesOn(): DebugFlags {
  const flags = createDebugFlags();
  flags.showHitboxes = true;
  return flags;
}

/**
 * The expected bounds of a circle outline of radius `r` round the ship.
 *
 * @param r - Radius.
 * @returns The bounds.
 */
function circle(r: number): [number, number, number, number] {
  const sx = 1100 - 1000.5;
  const sy = 120 - 20 + PLAYFIELD_Y;
  return [Math.floor(sx - r), Math.floor(sy - r), Math.ceil(sx + r) - 1, Math.ceil(sy + r) - 1];
}

describe('render-pixi/debug outlines under Reduce (M2-04)', () => {
  it('shrinks the hurt outline with the shield`s hurt scale; the terrain box stays', () => {
    const w = world();
    const ship = w.players[0];
    const hurt = w.ship.hurtRadius;
    const lists = createDebugOutlineLists();
    buildDebugOutlines(lists, w, outlinesOn());
    const terrain = bounds(lists.terrain);
    expect(bounds(lists.hurt)).toEqual(circle(hurt));
    grantShield(ship.shield, REDUCE);
    buildDebugOutlines(lists, w, outlinesOn());
    expect(bounds(lists.hurt)).toEqual(circle(hurt / 3));
    expect(bounds(lists.terrain)).toEqual(terrain);
    absorbShieldHit(ship.shield, false, 1);
    buildDebugOutlines(lists, w, outlinesOn());
    expect(bounds(lists.hurt)).toEqual(circle((hurt * 2) / 3));
    ship.shield.iFrames = 0;
    absorbShieldHit(ship.shield, false, 20);
    buildDebugOutlines(lists, w, outlinesOn());
    expect(bounds(lists.hurt)).toEqual(circle(hurt));
    expect(bounds(lists.terrain)).toEqual(terrain);
  });

  it('a pod shield changes neither outline', () => {
    const w = world();
    const lists = createDebugOutlineLists();
    buildDebugOutlines(lists, w, outlinesOn());
    const before = [bounds(lists.hurt), bounds(lists.terrain)];
    grantShield(w.players[0].shield, ROTATE_SHIELD);
    buildDebugOutlines(lists, w, outlinesOn());
    expect([bounds(lists.hurt), bounds(lists.terrain)]).toEqual(before);
  });
});
