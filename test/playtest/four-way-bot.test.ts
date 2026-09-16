/**
 * The 4-way playtest bot (`four-way-bot.ts`, plan M1-18) on hand-made situations:
 *
 * - the lane geometry (`LANES` lanes of 16 px, `laneCentre` / `laneOf` clamped to the scan);
 * - `scanLanes` marks a bullet heading into the ship's column in its lane's time slots — not one
 *   flying away or passing behind; a laser from a few ticks before its beam grows, none that
 *   misses the ship's column; rock ahead in the lanes of zone A's corridor (floor and ceiling),
 *   none in its open middle; every scan starts from a clean slate;
 * - `fourWayBot().decide` does nothing while the ship flies in, dodges a bullet or a beam in its
 *   lane by moving up or down only — also when the threat is already at the ship (regression: it
 *   froze inside an active beam) —, steps back to x ≈ 64 when its lane is safe, and presses
 *   PowerUp — for one tick at a time — only on Speed (below level 2), Missile (not yet fitted) and
 *   Option (fewer than four).
 */
import {
  Action,
  ANGLE_UNITS,
  BulletKind,
  MeterSlot,
  createInputSnapshot,
  createWorld,
  fireLaser,
  resolveGameConfig,
  spawnBullet,
  stepWorld,
  type World,
} from '@shmup/core';
import { describe, expect, it } from 'vitest';
import {
  BOT_MAX_SPEED_LEVEL,
  BOT_X,
  LANES,
  LANE_HEIGHT,
  SLOTS,
  SLOT_TICKS,
  BULLET_HORIZON,
  createLaneScan,
  fourWayBot,
  laneCentre,
  laneOf,
  scanLanes,
} from './four-way-bot.js';
import { DIRECTIONS, shippedContent } from './harness.js';

/**
 * A World whose ship has finished its fly-in, parked at the bot's x in a lane's centre.
 *
 * @param stage - Stage id (`null` = free flight, no terrain).
 * @param lane - The ship's lane.
 * @returns The World.
 */
function parked(stage: string | null = null, lane = 6): World {
  const w = createWorld(resolveGameConfig({ seed: 1, stage }), shippedContent());
  w.debugFlags.godMode = true;
  const input = createInputSnapshot();
  for (let i = 0; i < 80 && w.players[0].state !== 'alive'; i++) stepWorld(w, input);
  expect(w.players[0].state).toBe('alive');
  place(w, BOT_X, laneCentre(lane));
  return w;
}

/**
 * Puts the ship at a playfield position.
 *
 * @param w - The World.
 * @param x - Playfield x.
 * @param y - Playfield y.
 */
function place(w: World, x: number, y: number): void {
  w.players[0].x = w.camera.x + x;
  w.players[0].y = w.camera.y + y;
}

/**
 * The lanes with any bit set.
 *
 * @param masks - Per-lane masks.
 * @returns Lane indices.
 */
function marked(masks: ArrayLike<number>): number[] {
  const out: number[] = [];
  for (let k = 0; k < masks.length; k++) if (masks[k] !== 0) out.push(k);
  return out;
}

/**
 * The number of direction bits of a mask.
 *
 * @param mask - Action mask.
 * @returns 0–4.
 */
function directions(mask: number): number {
  let n = 0;
  for (const bit of [Action.Up, Action.Down, Action.Left, Action.Right]) if (mask & bit) n++;
  return n;
}

describe('playtest four-way bot: lanes', () => {
  it('splits the playfield into 16-px lanes, clamped at both ends', () => {
    expect(LANE_HEIGHT).toBe(16);
    expect(LANES).toBe(12);
    expect(SLOTS * SLOT_TICKS).toBe(BULLET_HORIZON);
    expect(laneCentre(0)).toBe(8);
    expect(laneCentre(LANES - 1)).toBe(184);
    expect(laneOf(-20)).toBe(0);
    expect(laneOf(0)).toBe(0);
    expect(laneOf(15.9)).toBe(0);
    expect(laneOf(16)).toBe(1);
    expect(laneOf(199)).toBe(LANES - 1);
    expect(laneOf(1e9)).toBe(LANES - 1);
    for (let k = 0; k < LANES; k++) expect(laneOf(laneCentre(k))).toBe(k);
    const scan = createLaneScan();
    for (const masks of [scan.centre, scan.span, scan.terrain, scan.wall]) {
      expect(masks).toHaveLength(LANES);
      expect(marked(masks)).toEqual([]);
    }
  });
});

describe('playtest four-way bot: scanLanes', () => {
  it('marks a bullet heading into the ship column in its lane only', () => {
    const w = parked();
    const sx = w.players[0].x;
    spawnBullet(w, sx + 30, laneCentre(3), ANGLE_UNITS / 2, 1.5, BulletKind.RoundPink);
    const scan = createLaneScan();
    scanLanes(w, scan);
    expect(marked(scan.centre)).toEqual([3]);
    expect(marked(scan.span)).toContain(3);
    // It reaches the column after about 20 ticks: late slots are marked, the first ones are not.
    expect(scan.centre[3] & 1).toBe(0);
    expect(scan.centre[3] & (1 << 10)).not.toBe(0);
    expect(marked(scan.terrain)).toEqual([]);
  });

  it('ignores bullets flying away from the ship or passing behind it', () => {
    const w = parked();
    const sx = w.players[0].x;
    spawnBullet(w, sx + 30, laneCentre(3), 0, 1.5, BulletKind.RoundPink); // away, to the right
    spawnBullet(w, sx - 40, laneCentre(5), ANGLE_UNITS / 2, 1.5, BulletKind.RoundPink); // behind
    const scan = createLaneScan();
    scanLanes(w, scan);
    expect(marked(scan.centre)).toEqual([]);
    expect(marked(scan.span)).toEqual([]);
  });

  it('marks a laser lane from a few ticks before its beam grows, and not one that misses', () => {
    const w = parked();
    const cx = w.camera.x;
    // Warns for 30 ticks, grows for 8: the lane is closed from 12 ticks before the growth ends.
    fireLaser(w, { slot: -1, x: cx + 380, y: laneCentre(8) }, ANGLE_UNITS / 2, 384, 30, 8, 60);
    // Fired to the right from in front of the ship: never crosses its column.
    fireLaser(w, { slot: -1, x: cx + 200, y: laneCentre(2) }, 0, 150, 1, 8, 60);
    const scan = createLaneScan();
    scanLanes(w, scan);
    expect(marked(scan.centre)).toEqual([8]);
    const firstSlot = Math.floor((30 + 8 - 12) / SLOT_TICKS);
    expect(scan.centre[8] & ((1 << firstSlot) - 1)).toBe(0);
    expect(scan.centre[8] & (1 << firstSlot)).not.toBe(0);
    expect(scan.centre[8] & (1 << (SLOTS - 1))).not.toBe(0);
  });

  it("finds rock in zone A's corridor lanes (floor and ceiling), none in its open middle", () => {
    const w = parked('zone-a');
    w.stage?.jumpTo(4500);
    place(w, BOT_X, laneCentre(6));
    const scan = createLaneScan();
    scanLanes(w, scan);
    expect(scan.terrain[0]).toBeGreaterThan(0);
    expect(scan.terrain[LANES - 1]).toBeGreaterThan(0);
    expect(scan.terrain[5]).toBe(0);
    expect(scan.terrain[6]).toBe(0);
    // A wall is rock right at the ship: never in an open lane.
    for (let k = 0; k < LANES; k++)
      if (scan.wall[k] !== 0) expect(scan.terrain[k]).toBeGreaterThan(0);
  });

  it('clears the previous result on every scan', () => {
    const w = parked();
    const scan = createLaneScan();
    spawnBullet(w, w.players[0].x + 30, laneCentre(3), ANGLE_UNITS / 2, 1.5, BulletKind.RoundPink);
    scanLanes(w, scan);
    expect(marked(scan.centre)).toEqual([3]);
    scanLanes(parked(), scan);
    expect(marked(scan.centre)).toEqual([]);
    expect(marked(scan.span)).toEqual([]);
  });
});

describe('playtest four-way bot: decide', () => {
  it('holds nothing while the ship flies in', () => {
    const w = createWorld(resolveGameConfig({ seed: 1 }), shippedContent());
    w.powerups.meters[0].cursor = MeterSlot.Speed;
    // The raw decisions (M3-02b: the remote model is what `fourWayBot()` adds on top).
    const bot = fourWayBot(0, { remote: false });
    expect(bot.name).toBe('four-way');
    expect(bot.remoteStrict).toBe(false);
    expect(w.players[0].state).not.toBe('alive');
    expect(bot.decide(w)).toBe(0);
    expect(bot.decide(w)).toBe(0);
  });

  it('dodges a bullet in its lane by moving up or down only', () => {
    const w = parked();
    spawnBullet(w, w.players[0].x + 24, laneCentre(6), ANGLE_UNITS / 2, 1.5, BulletKind.RoundPink);
    const mask = fourWayBot().decide(w);
    expect(directions(mask)).toBe(1);
    expect(mask & (Action.Up | Action.Down)).not.toBe(0);
  });

  it('leaves the lane of an active beam by moving up or down only (regression)', () => {
    // It used to rate crossing its own lane as bad as staying hit, and froze inside the beam.
    const w = parked();
    const cx = w.camera.x;
    fireLaser(w, { slot: -1, x: cx + 380, y: laneCentre(6) }, ANGLE_UNITS / 2, 384, 0, 0, 60);
    const mask = fourWayBot().decide(w);
    expect(directions(mask)).toBe(1);
    expect(mask & (Action.Up | Action.Down)).not.toBe(0);
  });

  it('side-steps a bullet about to hit rather than waiting for it (regression)', () => {
    const w = parked();
    spawnBullet(w, w.players[0].x + 5, laneCentre(6), ANGLE_UNITS / 2, 1.5, BulletKind.RoundPink);
    const mask = fourWayBot().decide(w);
    expect(directions(mask)).toBe(1);
    expect(mask & (Action.Up | Action.Down)).not.toBe(0);
  });

  it('steps back to x ≈ 64 when its lane is safe, and rests there', () => {
    const w = parked();
    place(w, BOT_X + 36, laneCentre(6));
    expect(fourWayBot().decide(w) & DIRECTIONS).toBe(Action.Left);
    place(w, BOT_X - 30, laneCentre(6));
    expect(fourWayBot().decide(w) & DIRECTIONS).toBe(Action.Right);
    place(w, BOT_X, laneCentre(6));
    expect(fourWayBot().decide(w)).toBe(0);
  });

  it('presses PowerUp for one tick at a time on Speed (below level 2), Missile and Option only', () => {
    const w = parked();
    const meter = w.powerups.meters[0];
    const ship = w.players[0];
    const loadout = w.weapons.loadouts[0];
    const bot = fourWayBot(0, { remote: false });
    const presses = (slot: number, ticks = 3): boolean[] => {
      meter.cursor = slot;
      const out: boolean[] = [];
      for (let i = 0; i < ticks; i++) out.push((bot.decide(w) & Action.PowerUp) !== 0);
      bot.decide(w); // settle: never leave a press pending for the next case
      meter.cursor = -1;
      bot.decide(w);
      return out;
    };
    expect(presses(-1)).toEqual([false, false, false]);
    expect(ship.speedLevel).toBeLessThan(BOT_MAX_SPEED_LEVEL);
    expect(presses(MeterSlot.Speed)).toEqual([true, false, true]);
    expect(loadout.missile).toBe(false);
    expect(presses(MeterSlot.Missile)).toEqual([true, false, true]);
    expect(loadout.options).toBe(0);
    expect(presses(MeterSlot.Option)).toEqual([true, false, true]);
    for (const slot of [MeterSlot.Double, MeterSlot.Laser, MeterSlot.Shield, MeterSlot.Mega]) {
      expect(presses(slot), `slot ${String(slot)}`).toEqual([false, false, false]);
    }
    ship.speedLevel = BOT_MAX_SPEED_LEVEL;
    expect(presses(MeterSlot.Speed)).toEqual([false, false, false]);
    // Every press is an edge, whatever the bot decides between them: never two ticks in a row.
    meter.cursor = MeterSlot.Option;
    let last = false;
    for (let i = 0; i < 10; i++) {
      const now = (bot.decide(w) & Action.PowerUp) !== 0;
      expect(now && last).toBe(false);
      last = now;
    }
  });
});
