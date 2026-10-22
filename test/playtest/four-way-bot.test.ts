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
 *   Option (fewer than four);
 * - the R5-P.P12 set-piece features on fixture stages: the shaft window (zone B), the high-speed
 *   look-ahead (zone C), the branch choice (zone D), brick shooting with the commit-through (zones
 *   D and F) and the moving-floor sweep prediction (zone H) — each gated off the shipped content,
 *   the shaft admitting only zone B's design §5 chimney (R5-02), the look-ahead only zone C's
 *   design §3 dune-surf key (R5-03), the branch choice only zone D's design §4 channel (R5-04)
 *   and the slab-class movers only zone G's design §3 shutters (R5-07), so a recording moves
 *   only with its own zone's content.
 */
import {
  Action,
  ANGLE_UNITS,
  BulletKind,
  DEFAULT_BLOCK_PERIOD,
  ENTER_END_X,
  MeterSlot,
  PLAYFIELD_H,
  PLAYFIELD_W,
  TILE_SIZE,
  createInputSnapshot,
  createWorld,
  fireLaser,
  loadContent,
  resolveGameConfig,
  spawnBullet,
  stepWorld,
  type ContentDb,
  type ContentFile,
  type StageBlockEvent,
  type World,
} from '@shmup/core';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { v1rel, v1x } from '../../packages/core/test/helpers/v1-port.js';
import {
  BOT_MAX_SPEED_LEVEL,
  BOT_X,
  HOLE_HEIGHT,
  LANES,
  LANE_HEIGHT,
  LOOKAHEAD_SPEED_GATE,
  LOOKAHEAD_SPEED_GAIN,
  SLOTS,
  SLOT_TICKS,
  BULLET_HORIZON,
  SLAB_SWING,
  TERRAIN_AHEAD,
  blockYAt,
  branchSteerTriggers,
  createLaneScan,
  digRowOpen,
  fourWayBot,
  holeReadyAt,
  laneCentre,
  laneOf,
  punchWallAhead,
  scanLanes,
  shaftCorridorCentre,
  stageHasShaft,
  terrainLookAhead,
} from './four-way-bot.js';
import { DIRECTIONS, runStage, shippedContent } from './harness.js';

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
  it('pins the bot to the fly-in end and splits the playfield into lanes, clamped at both ends', () => {
    // The bot parks where the fly-in ends: the same world value core's player module uses.
    expect(BOT_X).toBe(ENTER_END_X);
    expect(LANE_HEIGHT).toBe(v1rel(16));
    // As many whole lanes as the playfield holds (21 of 336 rows at K = 1, 14 under the kit).
    expect(LANES).toBe(Math.floor(PLAYFIELD_H / LANE_HEIGHT));
    expect(SLOTS * SLOT_TICKS).toBe(BULLET_HORIZON);
    expect(laneCentre(0)).toBe(LANE_HEIGHT / 2);
    expect(laneCentre(LANES - 1)).toBe((LANES - 1) * LANE_HEIGHT + LANE_HEIGHT / 2);
    expect(laneOf(-20)).toBe(0);
    expect(laneOf(0)).toBe(0);
    expect(laneOf(LANE_HEIGHT - 0.1)).toBe(0);
    expect(laneOf(LANE_HEIGHT)).toBe(1);
    expect(laneOf(PLAYFIELD_H - 1)).toBe(LANES - 1);
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
    w.stage?.jumpTo(v1x(4500));
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

/* ------------------------------------------------------------------------- *
 * R5-P.P12 — the set-piece features (wave-11 designs §3), each on a fixture  *
 * stage: the shaft window, the high-speed look-ahead, the branch choice,     *
 * brick shooting, and the moving floors. Every gate is asserted to hold shut *
 * on the shipped content except the set pieces it names — zone B's design    *
 * §5 chimney (R5-02), zone C's design §3 dune-surf key (R5-03), zone D's     *
 * design §4 channel (R5-04) and zone G's design §3 shutters (R5-07) — so     *
 * a gate never moves a recording on its own.                                 *
 * ------------------------------------------------------------------------- */

/** The shipped `terrain-a` tileset JSON (the fixtures build tilemaps over it). */
const TERRAIN_A = JSON.parse(
  readFileSync(new URL('../../content/tilesets/terrain-a.tileset.json', import.meta.url), 'utf8'),
) as { tiles: { name: string }[] } & Record<string, unknown>;

/** Tile id (1-based, the loader's numbering) of a `terrain-a` tile by name. */
const tileId = (name: string): number => TERRAIN_A.tiles.findIndex((t) => t.name === name) + 1;

const BRICK = tileId('brick');
/** The shipped Type A (the punch fixtures arm the placeholder ship with the real gun). */
const SHIPPED_TYPE_A = JSON.parse(
  readFileSync(new URL('../../content/weapons/type-a.weapons.json', import.meta.url), 'utf8'),
) as Record<string, unknown>;

/** The shipped Types B–D (the loadout preset `type-1` is Type A alone — still declared). */
const SHIPPED_TYPES_BD = JSON.parse(
  readFileSync(new URL('../../content/weapons/types-b-d.weapons.json', import.meta.url), 'utf8'),
) as Record<string, unknown>;
// hp 4 — the punchable tile
const TISSUE = tileId('tissue'); // hp 3, regrows — zone F's tile
const FLOOR = tileId('floor');
const CEIL = tileId('ceiling');
const ROCK = tileId('solid');

/**
 * A minimal valid fixture stage file.
 *
 * @param body - Fields over the defaults.
 * @returns The file.
 */
const stageFile = (body: Record<string, unknown>): ContentFile => ({
  path: 'stages/fixture.stage.json',
  data: {
    formatVersion: 1,
    kind: 'stage',
    id: 'fixture',
    name: 'FIXTURE',
    music: { stage: 'Stage', boss: 'Boss' },
    length: 1200,
    camera: [{ x: 0, speed: 1 }],
    checkpoints: [],
    parallax: [],
    tilemap: null,
    events: [],
    ...body,
  },
});

/**
 * A fixture content DB (stage + tileset; the bot plays it through the harness).
 *
 * @param stage - Stage fields.
 * @returns The DB (asserted issue-free).
 */
function fixtureDb(body: Record<string, unknown>, withWeapons = false): ContentDb {
  const { db, issues } = loadContent([
    stageFile(body),
    { path: 'tilesets/terrain-a.tileset.json', data: TERRAIN_A },
    // The punch tests fire the shipped Type A: the fixture ship has to have a gun.
    ...(withWeapons
      ? [
          { path: 'weapons/type-a.weapons.json', data: SHIPPED_TYPE_A },
          { path: 'weapons/types-b-d.weapons.json', data: SHIPPED_TYPES_BD },
        ]
      : []),
  ]);
  expect(issues).toEqual([]);
  return db;
}

/**
 * A run-length row: `wall` copies of `id` at columns [c0, c1), empty elsewhere.
 *
 * @param cols - The map's column count.
 * @param c0 - First wall column.
 * @param c1 - Column after the last wall column.
 * @param id - The wall tile (0 = open).
 * @returns The rle row string.
 */
function rleRow(cols: number, c0: number, c1: number, id: number): string {
  const runs: string[] = [];
  if (c0 > 0) runs.push(`${String(c0)}*0`);
  if (c1 > c0) runs.push(`${String(c1 - c0)}*${String(id)}`);
  if (c1 < cols) runs.push(`${String(cols - Math.max(c1, c0))}*0`);
  return runs.join(', ');
}

/**
 * A fixture world: the ship is alive, parked at the bot's x in a lane (god mode for the
 * read-only unit probes).
 *
 * @param db - The fixture content.
 * @param lane - The ship's lane.
 * @returns The World.
 */
function fixtureWorld(db: ContentDb, lane = 7): World {
  const w = createWorld(resolveGameConfig({ seed: 1, stage: 'fixture' }), db);
  w.debugFlags.godMode = true;
  const input = createInputSnapshot();
  for (let i = 0; i < 80 && w.players[0].state !== 'alive'; i++) stepWorld(w, input);
  expect(w.players[0].state).toBe('alive');
  w.players[0].x = w.camera.x + BOT_X;
  w.players[0].y = w.camera.y + laneCentre(lane);
  return w;
}

/**
 * Steps a fixture world until the camera reaches `x` (input idle, god mode).
 *
 * @param w - The World.
 * @param x - The camera x to reach.
 */
function scrollTo(w: World, x: number): void {
  const input = createInputSnapshot();
  let guard = 0;
  while (w.camera.x < x && guard++ < 20_000) stepWorld(w, input);
  expect(w.camera.x).toBeGreaterThanOrEqual(x);
}

describe('playtest four-way bot: the set-piece gates stay shut on the shipped content', () => {
  it('no shaft on any shipped stage but zone B, no branch choice but zone D, no slab-class mover but zone G design shutters, and no zone key passes the look-ahead gate but zone C', () => {
    const stages = shippedContent().stages;
    expect(stages.length).toBeGreaterThan(10);
    let deepestPan = 0;
    let widestSwing = 0;
    let shafts = 0;
    let branchStages = 0;
    let shutterStages = 0;
    for (const stage of stages) {
      // The shaft law is the helper's own gate (stageHasShaft: a camera key whose |pan| passes one
      // playfield). By the zone-B design §5 it admits exactly one stage — the bubble shaft's yTo
      // 400 key — so a shaft opening on any other shipped stage is a breach. Zone B's shaft itself
      // arrives with R5-02: while its geometry is still the old one the gate holds it at zero.
      if (stageHasShaft(stage)) {
        shafts += 1;
        expect(stage.id, 'the only stage allowed a shaft').toBe('zone-b');
      }
      // The branch-choice law is the helper's own gate (branchSteerTriggers: a `trigger` event a
      // declared branch consumes, armed across the whole region). By the zone-D design §4 it
      // admits exactly one stage and exactly its two lane regions — the trench `lower` channel
      // and the river `flank` lane — so a choice authored on any other shipped stage, or zone D
      // moving off its designed boxes, is a breach. Zone D's choice arrives with R5-04: while
      // the shipped stage is the old one the gate holds it at zero.
      const steers = branchSteerTriggers(stage);
      if (steers.length > 0) {
        branchStages += 1;
        expect(stage.id, 'the only stage allowed a branch choice').toBe('zone-d');
        expect(
          steers.map((s) => [s.x0, s.x1, s.y0, s.y1]),
          'zone D design §4: the lower channel and the flank lane, armed across their regions',
        ).toEqual([
          [12100, 12540, 672, 756],
          [14750, 15050, 480, 552],
        ]);
      }
      let y = 0;
      for (const key of stage.camera) {
        const to = key.yTo ?? y;
        deepestPan = Math.max(deepestPan, Math.abs(to - y));
        y = to;
      }
      // The moving-floor law is the bot's own slab gate (SLAB_SWING — a block swinging at least
      // this far is predicted where its band will be when it crosses the ship's column;
      // R5-P.P12, zone H's gate slabs). By the zone-G design §3 it admits exactly one stage —
      // the four refraction-hall crystal shutters: 24×48 of tile `crystal` at y 408, swinging
      // dy 96 over period 240 from phases 0/256/512/768, at x 10,080/11,200/12,400/13,600 — so
      // a slab swing authored on any other shipped stage, or zone G's shutters moving off their
      // designed boxes, is a breach. The shutters arrive with R5-07: while the shipped stage is
      // still the old one the gate holds them at zero (it authors no block events at all). The
      // law is unchanged for every other mover — admitted rows leave the widestSwing scan, so
      // the pin under the loop reads gimmick-range's 48 px in both worlds.
      const slabs: number[][] = [];
      let slabSwing = 0;
      for (const e of stage.events) {
        if (e.type !== 'block') continue;
        const swing = Math.abs(e.dy ?? 0);
        if (swing < SLAB_SWING) {
          widestSwing = Math.max(widestSwing, swing);
          continue;
        }
        slabSwing = Math.max(slabSwing, swing);
        slabs.push([e.x, e.y, e.w, e.h, e.dy ?? 0, e.period ?? DEFAULT_BLOCK_PERIOD, e.phase ?? 0]);
      }
      if (slabs.length > 0) {
        shutterStages += 1;
        expect(stage.id, 'the only stage allowed slab-class shutters').toBe('zone-g');
        expect(slabSwing, 'zone G design §3: the admitted swing, pinned exactly').toBe(96);
        expect(
          slabs,
          'zone G design §3: the four crystal shutters — x, y, 24×48, dy 96 over period 240',
        ).toEqual([
          [10080, 408, 24, 48, 96, 240, 0],
          [11200, 408, 24, 48, 96, 240, 256],
          [12400, 408, 24, 48, 96, 240, 512],
          [13600, 408, 24, 48, 96, 240, 768],
        ]);
      }
    }
    // Today's extremes, pinned (docs/v2-run/designs §3, the zone-B design §5 and the zone-D
    // design §2): gimmick-range's blocks, and the deepest camera pan — zone D's 300 px dive
    // while no shipped stage opens the shaft gate or authors its branch choice, zone B's designed
    // 400 px sink once R5-02 lands its shaft, or zone D's remastered two-step dive (186, then
    // 246 to the deep at 432) once R5-04 lands its choice. All three pan numbers are design
    // constants (the shaft fixture above flies the same 400), never read off a run; the
    // playfield relation follows stageHasShaft's own definition (|pan| > PLAYFIELD_H).
    expect(shafts).toBeLessThanOrEqual(1);
    expect(branchStages).toBeLessThanOrEqual(1);
    expect(shutterStages).toBeLessThanOrEqual(1);
    if (shafts === 1) {
      expect(deepestPan).toBe(400); // the design §5 sink — by the gate's law, past one playfield
      expect(deepestPan).toBeGreaterThan(PLAYFIELD_H);
    } else if (branchStages === 1) {
      expect(deepestPan).toBe(246); // the design §2 deep step — below one playfield, zone D's dive
      expect(deepestPan).toBeLessThan(PLAYFIELD_H);
    } else {
      expect(deepestPan).toBe(v1rel(200)); // 300 px — below one playfield (zone D's dive)
      expect(deepestPan).toBeLessThan(PLAYFIELD_H);
    }
    expect(widestSwing).toBe(v1rel(32)); // 48 px — below the moving-floor gate (gimmick-range)
    expect(widestSwing).toBeLessThan(SLAB_SWING);
    // RT-P12's cure pin: no shipped ZONE camera key passes the widened look-ahead gate but zone
    // C's design §3 dune-surf run (R5-03) — by the kit's own law (terrainLookAhead widens only
    // above v1rel(1.6)) it is the one stage the arm exists for, so a key passing the gate on any
    // other stage, or zone C moving off its designed 2.55 px/tick pass, is a breach. The fastest
    // key anywhere else is zone A's 2.25 px/tick tail, which once moved the live-bot zone-a-extras
    // stream; while no shipped stage opens the arm the gate holds every zone key shut.
    let fastestZoneKey = 0;
    let fastStages = 0;
    for (const id of [
      'zone-a',
      'zone-b',
      'zone-c',
      'zone-d',
      'zone-e',
      'zone-f',
      'zone-g',
      'zone-h',
      'zone-i',
    ]) {
      const zone = stages.find((s) => s.id === id);
      expect(zone, id).toBeDefined();
      let maxKey = 0;
      for (const key of zone?.camera ?? []) maxKey = Math.max(maxKey, key.speed);
      if (maxKey > LOOKAHEAD_SPEED_GATE) {
        fastStages += 1;
        expect(zone?.id, 'the only stage allowed a look-ahead key').toBe('zone-c');
        expect(maxKey, 'zone C design §3: the dune-surf pass').toBe(v1rel(1.7));
      } else {
        expect(maxKey, id).toBeLessThanOrEqual(LOOKAHEAD_SPEED_GATE);
      }
      fastestZoneKey = Math.max(fastestZoneKey, maxKey);
    }
    expect(fastStages).toBeLessThanOrEqual(1);
    // Today's fastest zone key, pinned: zone A's disclosed 2.25 px/tick tail while no shipped
    // stage opens the arm, and once R5-03 lands zone C's dune-surf run the designed 2.55 pass.
    if (fastStages === 1) {
      expect(fastestZoneKey).toBe(v1rel(1.7)); // zone C's dune-surf pass (design §3)
    } else {
      expect(fastestZoneKey).toBe(v1rel(1.5)); // the disclosed zone A tail key (2.25 px/tick)
    }
  });

  it('widens the terrain scan only above the gate speed, linearly (zone C)', () => {
    expect(LOOKAHEAD_SPEED_GATE).toBe(v1rel(1.6));
    expect(LOOKAHEAD_SPEED_GAIN).toBe(v1rel(120));
    expect(terrainLookAhead(0)).toBe(TERRAIN_AHEAD);
    expect(terrainLookAhead(v1rel(1.6))).toBe(TERRAIN_AHEAD); // the gate itself stays shut
    expect(terrainLookAhead(v1rel(1.5))).toBe(TERRAIN_AHEAD); // today's fastest shipped zone key
    expect(terrainLookAhead(v1rel(1.7))).toBeCloseTo(111, 9); // C's 2.55 pass: 84 → 111 px
    expect(terrainLookAhead(v1rel(1.2))).toBe(TERRAIN_AHEAD); // play keys read the same
  });

  it('reads a wall 85..111 px ahead only while the runner scrolls past the gate', () => {
    // A 12-px brick plug at world x 564..575 over an open corridor: with a 1.2 px/tick key the
    // scan keeps today's 84-px reach and does not see it; with a 2.55 px/tick key the widened
    // reach (111 px) marks the ship's lane.
    const cols = Math.ceil((1200 + PLAYFIELD_W) / TILE_SIZE);
    const tilemap = {
      tileSize: TILE_SIZE,
      tileset: 'terrain-a',
      rowsTall: PLAYFIELD_H / TILE_SIZE,
      rle: Array.from({ length: PLAYFIELD_H / TILE_SIZE }, (_, row) =>
        row < 24 ? rleRow(cols, 47, 49, BRICK) : rleRow(cols, 0, 0, 0),
      ),
    };
    const slow = fixtureWorld(fixtureDb({ tilemap }), 7);
    slow.stage?.jumpTo(360);
    scrollTo(slow, 361);
    slow.players[0].x = slow.camera.x + BOT_X;
    let scan = createLaneScan();
    scanLanes(slow, scan);
    expect(scan.terrain[7]).toBe(0);
    const fast = fixtureWorld(fixtureDb({ camera: [{ x: 0, speed: 2.55 }], tilemap }), 7);
    fast.stage?.jumpTo(360);
    scrollTo(fast, 361);
    fast.players[0].x = fast.camera.x + BOT_X;
    scan = createLaneScan();
    scanLanes(fast, scan);
    expect(scan.terrain[7]).toBeGreaterThan(0);
  });

  it('the bot clears a fast-scroll rock corridor with the arm open (M1)', () => {
    // Eight two-tile rock walls every 312 px under a 2.55 px/tick key. The even walls leave only
    // the top lanes (rows 0..11) passable, the odd ones only the bottom lanes (rows 14..27), so
    // every wall forces a 48-px lane move — about 34 ticks at the level-0 ship's sustained
    // 1.4 px/tick, inside the 40-tick approach window the ARMED 111-px read gives at this speed
    // (an unarmed 84-px read leaves 28 and the corridor kills). The first wall sits at column 40
    // so the fly-in never eats the first sighting window. The pins above prove the numbers.
    const cols = Math.ceil((2700 + PLAYFIELD_W) / TILE_SIZE);
    const rows = PLAYFIELD_H / TILE_SIZE;
    const rle: string[] = [];
    for (let r = 0; r < rows; r++) {
      const runs: string[] = [];
      let runId = -1;
      let runLen = 0;
      for (let c = 0; c < cols; c++) {
        const i = Math.floor((c - 40) / 26);
        const inWall = i >= 0 && i <= 7 && (c - 40) % 26 <= 1;
        const id = inWall && (i % 2 === 0 ? r >= 12 : r < 14) ? ROCK : 0;
        if (id === runId) runLen++;
        else {
          if (runLen > 0) runs.push(`${String(runLen)}*${String(runId)}`);
          runId = id;
          runLen = 1;
        }
      }
      runs.push(`${String(runLen)}*${String(runId)}`);
      rle.push(runs.join(', '));
    }
    const run = runStage('fixture', fourWayBot(), {
      content: fixtureDb({
        length: 2700,
        camera: [{ x: 0, speed: 2.55 }],
        tilemap: { tileSize: TILE_SIZE, tileset: 'terrain-a', rowsTall: rows, rle },
        events: [{ x: 2640, type: 'end' }],
      }),
    });
    expect(run.deaths.map((d) => d.cause + '@x' + String(d.cameraX))).toEqual([]);
    expect(run.status).toBe('stageClear');
    expect(run.remoteViolations, run.remoteViolation).toBe(0);
    expect(run.diagonalTicks).toBe(0);
  });
});

describe('playtest four-way bot: the shaft window (zone B)', () => {
  /** Zone B's shaft geometry from the design §2: a 62-row map, a pan deeper than one playfield. */
  const SHAFT_ROWS = 62;

  /** A stage file whose camera pans 0 → 400 → 0 with the corridor descending and rising back. */
  const shaftStage = (deepKey: boolean): Record<string, unknown> => ({
    length: 3300,
    camera: [
      { x: 0, speed: 0.9 },
      { x: 900, speed: 0.9, yTo: deepKey ? 400 : 300, yOver: 1200 },
      { x: 2100, speed: 0.9, yTo: 0, yOver: 600 },
    ],
    tilemap: {
      tileSize: TILE_SIZE,
      tileset: 'terrain-a',
      rowsTall: SHAFT_ROWS,
      generator: {
        type: 'heightfield',
        segments: [
          { from: 0, to: 900, floor: { base: 430, amp: 6, period: 240, seed: 7 } },
          {
            from: 900,
            to: 2100,
            ceiling: { base: 420, amp: 6, period: 240, seed: 11 },
            floor: { base: 44, amp: 6, period: 240, seed: 7 },
          },
          { from: 2100, to: 4200, floor: { base: 430, amp: 6, period: 240, seed: 7 } },
        ],
      },
    },
    events: [{ x: 3240, type: 'end' }],
  });

  it('gates on a camera key deeper than one playfield', () => {
    expect(stageHasShaft(fixtureDb(shaftStage(true)).stages[0])).toBe(true);
    expect(stageHasShaft(fixtureDb(shaftStage(false)).stages[0])).toBe(false); // zone D's 300 px
  });

  it('samples the corridor centre between the ceiling bottom and the floor top ahead', () => {
    // A uniform rle corridor: ceiling rock [0..204), floor rock [300..336) — centre 252.
    const cols = Math.ceil((1200 + PLAYFIELD_W) / TILE_SIZE);
    const rows = PLAYFIELD_H / TILE_SIZE;
    const w = fixtureWorld(
      fixtureDb({
        tilemap: {
          tileSize: TILE_SIZE,
          tileset: 'terrain-a',
          rowsTall: rows,
          rle: Array.from({ length: rows }, (_, r) =>
            r < 17
              ? rleRow(cols, 0, cols, CEIL)
              : r < 25
                ? rleRow(cols, 0, 0, 0)
                : rleRow(cols, 0, cols, FLOOR),
          ),
        },
      }),
      10,
    );
    const c = shaftCorridorCentre(w, TERRAIN_AHEAD);
    expect(c).toBeCloseTo(252 - w.camera.y, 6);
    // Open sky (no map): no corridor to track.
    expect(shaftCorridorCentre(fixtureWorld(fixtureDb({}), 7), TERRAIN_AHEAD)).toBeNaN();
  });

  it('clears the shaft fixture — the ship tracks the window down and back up', () => {
    const db = fixtureDb(shaftStage(true));
    const run = runStage('fixture', fourWayBot(), { content: db });
    expect(run.deaths.map((d) => d.cause + '@x' + String(d.cameraX))).toEqual([]);
    expect(run.status).toBe('stageClear');
    expect(run.remoteViolations, run.remoteViolation).toBe(0);
    expect(run.diagonalTicks).toBe(0);
  });
});

describe('playtest four-way bot: brick shooting (zones D, F, G, I)', () => {
  /**
   * A one-playfield corridor with a full-height `id` plug at columns 44..46.
   *
   * @param id - The plug tile (0 = open).
   * @param rowsFrom - First row the plug spans (full height by default).
   * @param colsWall - How many columns the plug is (1 or 2).
   * @returns The fixture DB.
   */
  const plugDb = (id: number, rowsFrom = 0, colsWall = 2, length = 1200): ContentDb => {
    const cols = Math.ceil((length + PLAYFIELD_W) / TILE_SIZE);
    const rows = PLAYFIELD_H / TILE_SIZE;
    return fixtureDb(
      {
        length,
        camera: [{ x: 0, speed: 1.2 }],
        tilemap: {
          tileSize: TILE_SIZE,
          tileset: 'terrain-a',
          rowsTall: rows,
          rle: Array.from({ length: rows }, (_, r) =>
            r >= rowsFrom ? rleRow(cols, 44, 44 + colsWall, id) : rleRow(cols, 0, 0, 0),
          ),
        },
        events: [{ x: length - 60, type: 'end' }],
      },
      true,
    );
  };

  /** The plug world with the ship parked opposite it, `gap` px before contact. */
  function parkedAtPlug(db: ContentDb, gap: number): World {
    const w = fixtureWorld(db, 7);
    // The plug's near edge is world x 528; park the ship's bow `gap` px short of it.
    w.stage?.jumpTo(528 - BOT_X - world_ship_hw() - gap);
    scrollTo(w, w.camera.x);
    w.players[0].x = w.camera.x + BOT_X;
    w.players[0].y = w.camera.y + laneCentre(7);
    return w;
  }

  /** The ship's terrain half-width (the scan's own margin source). */
  function world_ship_hw(): number {
    const probe = createWorld(resolveGameConfig({ seed: 1, stage: 'fixture' }), fixtureDb({}));
    return probe.ship.terrainBox.hw;
  }

  it('finds a shot-openable wall (hp > 0) closed across the row, not plain rock', () => {
    const brick = parkedAtPlug(plugDb(BRICK), 60);
    const wall = punchWallAhead(brick, terrainLookAhead(1.2));
    expect(wall).not.toBeNull();
    expect(wall!.x).toBeGreaterThanOrEqual(528); // the wall's near edge (the scan's 4-px steps)
    expect(wall!.x).toBeLessThan(540);
    expect(wall!.x1).toBe(551); // columns 44..45: px [528..552)
    // Plain rock (terrain-a's `solid`, no hp) is today's game — no punch.
    const rock = parkedAtPlug(plugDb(ROCK), 60);
    expect(punchWallAhead(rock, terrainLookAhead(1.2))).toBeNull();
  });

  it('does not punch while the window still has open rows across the wall', () => {
    // RT-P12's cure: the whole camera window must be sealed before a drill — a plug that leaves
    // rows 0..7 open is a climb the lane model always finds, at any distance. The shipped zone-F
    // tissue walls (84-px gap rows) and zone-D maze walls (72-px) are exactly this shape.
    expect(punchWallAhead(parkedAtPlug(plugDb(BRICK, 8), 240), terrainLookAhead(1.2))).toBeNull();
    expect(punchWallAhead(parkedAtPlug(plugDb(BRICK, 8), 12), terrainLookAhead(1.2))).toBeNull();
    // The same plug at full height seals the window: point-blank it is the shot target.
    expect(punchWallAhead(parkedAtPlug(plugDb(BRICK), 12), terrainLookAhead(1.2))).not.toBeNull();
  });

  it('reads the HOLE_HEIGHT band across the wall span (the hole predicate of the design)', () => {
    // RT-P12's cure M3: the band is ±HOLE_HEIGHT/2 around the ship's row — here rows 14..15 at
    // lane 7's centre 180 — so the pin measures exactly the design's 24-px hole, not the box.
    const intact = parkedAtPlug(plugDb(BRICK), 60);
    expect(holeReadyAt(intact, 528, 551)).toBe(false);
    expect(digRowOpen(intact, 528, 551)).toBe(false);
    expect(HOLE_HEIGHT).toBe(v1rel(16));
    const drilled = parkedAtPlug(
      fixtureDb(
        (() => {
          // Rows 13..15 (px 156..192 — the ship's row band) open across the plug's columns.
          const cols = Math.ceil((1200 + PLAYFIELD_W) / TILE_SIZE);
          const rows = PLAYFIELD_H / TILE_SIZE;
          return {
            length: 1200,
            camera: [{ x: 0, speed: 1.2 }],
            tilemap: {
              tileSize: TILE_SIZE,
              tileset: 'terrain-a',
              rowsTall: rows,
              rle: Array.from({ length: rows }, (_, r) =>
                r >= 24
                  ? rleRow(cols, 0, cols, FLOOR)
                  : r >= 13
                    ? rleRow(cols, 0, 0, 0)
                    : rleRow(cols, 44, 46, BRICK),
              ),
            },
            events: [],
          };
        })(),
        true,
      ),
      60,
    );
    expect(holeReadyAt(drilled, 528, 551)).toBe(true);
    expect(digRowOpen(drilled, 528, 551)).toBe(true);
    expect(punchWallAhead(drilled, terrainLookAhead(1.2))).toBeNull();
  });

  it('drills through a brick plug and keeps flying (a run that can die)', () => {
    const run = runStage('fixture', fourWayBot(), { content: plugDb(BRICK, 0, 1) });
    expect(run.deaths.map((d) => d.cause + '@x' + String(d.cameraX))).toEqual([]);
    expect(run.status).toBe('stageClear');
  });

  it('commits through a regrowing tissue wall (zone F) — a run that can die', () => {
    const run = runStage('fixture', fourWayBot(), { content: plugDb(TISSUE, 0, 1) });
    expect(run.deaths.map((d) => d.cause + '@x' + String(d.cameraX))).toEqual([]);
    expect(run.status).toBe('stageClear');
  });

  it('meets the punch gate on no shipped stage at all (the cure sweep probe)', () => {
    // RT-P12's C1: the shipped set-piece walls all leave gap rows — every terrain stage is swept
    // every 480 px of its length and every lane centre, and the punch predicate stays null. The
    // sweep reads the static tile map; blocks are never destructible, so it covers the whole
    // shipped punch surface (the zone-D x7680 maze wall and the zone-F x4584 tissue wall from
    // the review are inside it).
    const stages = shippedContent().stages;
    let withTerrain = 0;
    for (const spec of stages) {
      if (spec.terrain === null) continue;
      withTerrain++;
      const w = createWorld(resolveGameConfig({ seed: 1, stage: spec.id }), shippedContent());
      const runner = w.stage;
      expect(runner, spec.id).not.toBeNull();
      if (runner === null) continue;
      for (let x = 0; x <= spec.length; x += 480) {
        runner.jumpTo(x);
        const cam = w.camera;
        const ahead = terrainLookAhead(runner.speed);
        for (let k = 0; k < LANES; k++) {
          w.players[0].x = cam.x + BOT_X;
          w.players[0].y = cam.y + laneCentre(k);
          expect(
            punchWallAhead(w, ahead, 0),
            `${spec.id}@${String(x)} lane ${String(k)}`,
          ).toBeNull();
        }
      }
    }
    expect(withTerrain).toBeGreaterThan(15); // the nine zones and the ranges are all in the set
  });
});

describe('playtest four-way bot: the branch choice (zone D)', () => {
  /** D's trigger geometry: a 120-px-tall branch channel whose flag two branches consume. */
  const branchEvents = (until: number | undefined): Record<string, unknown>[] => {
    const region = { x: 1200, y: 240, w: 360, h: 120 };
    return [
      {
        x: 900,
        type: 'trigger',
        flag: 'took-low',
        region,
        ...(until === undefined ? {} : { until }),
      },
      { x: 1700, type: 'flag', flag: 'went-low', branch: 'low' },
      { x: 1700, type: 'flag', flag: 'went-high', branch: 'high' },
      { x: 2300, type: 'end' },
    ];
  };
  const branchStage = (until?: number): Record<string, unknown> => ({
    length: 2400,
    camera: [{ x: 0, speed: 1.2 }],
    branches: [
      { id: 'low', flag: 'took-low' },
      { id: 'high', flag: 'took-low', value: false },
    ],
    events: branchEvents(until),
  });

  it('gates on a branch-consumed trigger armed across the region whole span', () => {
    const steers = branchSteerTriggers(fixtureDb(branchStage()).stages[0]);
    expect(steers).toHaveLength(1);
    expect(steers[0]).toMatchObject({ bit: 0, cx: 1380, cy: 300 });
    // gimmick-range's shape: disarmed before the region's far edge — not a lane choice.
    expect(branchSteerTriggers(fixtureDb(branchStage(1500)).stages[0])).toEqual([]);
    // A trigger no branch consumes is decoration — not a choice.
    expect(
      branchSteerTriggers(
        fixtureDb({ length: 2400, events: branchEvents(undefined).slice(0, 1) }).stages[0],
      ),
    ).toEqual([]);
  });

  it('walks the lanes towards the channel centre, one per tick, and rests on its row', () => {
    const w = fixtureWorld(fixtureDb(branchStage()), 7);
    w.stage?.jumpTo(950); // the trigger is armed before the ship reaches it
    w.players[0].x = w.camera.x + BOT_X;
    w.players[0].y = w.camera.y + laneCentre(7);
    const bot = fourWayBot(0, { remote: false });
    // Old behaviour on the same world: the ship sits at 168 and rests (no threats at all).
    expect(bot.decide(w) & DIRECTIONS).toBe(Action.Down);
    expect(bot.decide(w) & DIRECTIONS).toBe(Action.Down);
    expect(bot.decide(w) & DIRECTIONS).toBe(Action.Down);
    // On the channel's own row it waits for the x to bring the region (no vertical push).
    const inside = fixtureWorld(fixtureDb(branchStage()), 12);
    inside.stage?.jumpTo(950);
    inside.players[0].x = inside.camera.x + BOT_X;
    inside.players[0].y = inside.camera.y + laneCentre(12);
    expect(fourWayBot(0, { remote: false }).decide(inside) & DIRECTIONS).toBe(0);
  });

  it('enters the region so the flag fires and the branch is taken (a run that can die)', () => {
    const db = fixtureDb(branchStage());
    // The loader collects flagNames in its own order — read the bits from the stage itself.
    const names = db.stages[0].flagNames;
    const took = 1 << names.indexOf('took-low');
    const low = 1 << names.indexOf('went-low');
    const high = 1 << names.indexOf('went-high');
    let flags = 0;
    const run = runStage('fixture', fourWayBot(), {
      content: db,
      observe: (world) => {
        flags = world.stage?.flags ?? 0;
      },
    });
    expect(run.status).toBe('stageClear');
    // took-low set by the entry, went-low set by the branch-gated flag event; went-high never.
    expect(flags & took).toBe(took);
    expect(flags & low).toBe(low);
    expect(flags & high).toBe(0);
  });
});

describe('playtest four-way bot: the moving floors (zone H)', () => {
  const SLAB_COLS = Math.ceil((2400 + PLAYFIELD_W) / TILE_SIZE);
  const SLAB_ROWS = PLAYFIELD_H / TILE_SIZE;

  /**
   * A stage with a ceiling and a floor slab swinging `dy` px in phase (design H: the 72-px
   * slot between them sweeps across the playfield).
   *
   * @param dy - The swing amplitude (gate at {@link SLAB_SWING}).
   * @returns The fixture DB.
   */
  const slabDb = (dy: number): ContentDb =>
    fixtureDb({
      length: 2400,
      camera: [{ x: 0, speed: 1.2 }],
      tilemap: {
        tileSize: TILE_SIZE,
        tileset: 'terrain-a',
        rowsTall: SLAB_ROWS,
        rle: Array.from({ length: SLAB_ROWS }, (_, r) =>
          r < 24 ? rleRow(SLAB_COLS, 0, 0, 0) : rleRow(SLAB_COLS, 0, SLAB_COLS, FLOOR),
        ),
      },
      events: [
        { x: 1000, type: 'block', y: 84, w: 60, h: 48, dy, period: 240, tile: 'ceiling' },
        { x: 1020, type: 'block', y: 204, w: 60, h: 48, dy, period: 240, tile: 'solid' },
        { x: 2280, type: 'end' },
      ],
    });

  it('predicts the slab row band by where it crosses the ship, not where it stands', () => {
    const w = fixtureWorld(slabDb(SLAB_SWING), 7);
    scrollTo(w, 1506);
    const map = w.terrain;
    expect(map).not.toBeNull();
    const blocks = map?.blocks;
    const sys = w.gimmicks?.blocks;
    expect(blocks).toBeTruthy();
    expect(sys).toBeTruthy();
    // The floor slab: the live slot whose event's y is 204.
    const stageEvents = w.stage?.stage.events ?? [];
    const slots = sys?.slotEvent ?? new Int32Array();
    const ages = sys?.slotAge ?? new Float64Array();
    let slot = -1;
    let ev: StageBlockEvent | undefined;
    for (let s = 0; s < slots.length; s++) {
      const e = slots[s] >= 0 ? stageEvents[slots[s]] : undefined;
      if (e?.type === 'block' && e.y === 204) {
        slot = s;
        ev = e;
      }
    }
    expect(slot).toBeGreaterThanOrEqual(0);
    expect(ev?.dy ?? 0).toBeGreaterThanOrEqual(SLAB_SWING);
    // The current band blocks its own lanes (the position the old scan read); the lane the
    // crossing-middle sweep reaches is clear today and marked by the prediction.
    const yNow = blocks?.y0[slot] ?? 0;
    expect(Math.floor(blockYAt(ev!, ages[slot]))).toBe(yNow);
    const scan = createLaneScan();
    scanLanes(w, scan);
    expect(scan.terrain[laneOf(yNow + 1 - w.camera.y)]).toBeGreaterThan(0); // current band
    const shipX = w.players[0].x;
    const tIn = ((blocks?.x0[slot] ?? 0) - shipX - 5) / 1.2;
    const tOut = ((blocks?.x1[slot] ?? 0) + 5 - shipX) / 1.2;
    const yPred = blockYAt(ev!, ages[slot] + (tIn + tOut) / 2) - w.camera.y;
    const predLane = laneOf(yPred + 6);
    expect(scan.terrain[predLane]).toBeGreaterThan(0);
    expect(predLane).toBeGreaterThan(laneOf(yNow - w.camera.y)); // the slab sweeps down into it
    // The same fixture under the gate (48 px, today's gimmick-range extreme): no prediction.
    const small = fixtureWorld(slabDb(48), 7);
    scrollTo(small, 1506);
    const scanSmall = createLaneScan();
    scanLanes(small, scanSmall);
    expect(scanSmall.terrain[predLane]).toBe(0);
  });

  it('rides the sweeping slot (a run that can die)', () => {
    const run = runStage('fixture', fourWayBot(), { content: slabDb(SLAB_SWING) });
    expect(run.deaths.map((d) => d.cause + '@x' + String(d.cameraX))).toEqual([]);
    expect(run.status).toBe('stageClear');
  });

  it('pins the predicted band to the block table formula', () => {
    const e = {
      x: 0,
      type: 'block',
      y: 204,
      w: 60,
      h: 48,
      tileId: 0,
      dy: 60,
      period: 240,
    } as const;
    expect(blockYAt(e, 0)).toBe(204);
    expect(blockYAt(e, 60)).toBe(264); // a quarter period is the table sine's peak, exactly
    expect(blockYAt(e, 120)).toBe(204); // a half period is the zero again
  });
});
