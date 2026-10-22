/**
 * `fourWayBot` — the headless playtester of plan M1-18: a player with the Samsung remote's limits
 * (shmup_feat.md §4 rule 2). It **never holds two directions** (no diagonals, no chords), relies
 * on the forced autofire, keeps its ship at playfield x ≈ {@link BOT_X} and dodges by changing
 * **lanes** only: every tick it scans the playfield in {@link LANE_HEIGHT}-px horizontal lanes
 * and rates each lane's danger in front of the ship —
 *
 * - enemy bullets whose path crosses the ship's column within the next {@link BULLET_HORIZON}
 *   ticks (sooner = worse),
 * - enemy bodies and boss parts heading through the ship's column (contact),
 * - lasers: a telegraphed lane is avoided early, a growing / active beam's lane is forbidden,
 * - terrain in the lane within {@link TERRAIN_AHEAD} px ahead (walls a lane change cannot pass),
 *
 * — then moves up or down towards the lowest-danger lane, preferring near lanes, the lane of a
 * capsule ahead, the lane of the boss's core during a boss fight and the lane of the next enemy
 * ahead (so its shots hit). Once in its lane it steps left / right back to x ≈ {@link BOT_X}.
 *
 * **The remote's limits (M3-02b).** Since the 2026-09-15 input probe the bot's wishes pass through
 * the `remote-strict` model by default: the remote delivers **one key at a time**, so a PowerUp
 * press is a 7–16-tick tap with no direction preceded by two empty ticks, and a change of direction
 * costs one empty tick. Because the tap freezes the ship, the bot waits for a lane that stays clear
 * for {@link EQUIP_WINDOW_TICKS} before it presses. Pass `{ remote: false }` to fly the old,
 * hardware-free way.
 *
 * **Power-ups.** It presses PowerUp (one tick, an edge) when the meter's cursor reaches Speed
 * (up to speed level {@link BOT_MAX_SPEED_LEVEL}), Missile or Option and the slot can be equipped;
 * it never takes Double, Laser, the Force Field or Mega Crash — the plan's "presses PowerUp when
 * the meter reaches Speed / Missile / Option".
 *
 * **The set-piece features (R5-P.P12).** The wave-11 designs hand the bot five set pieces it must
 * clear before their zones land, and each feature opens only on a condition the shipped content
 * never meets, so every recording of today's content stays byte-identical:
 *
 * - the **shaft mode** (zone B): a stage whose camera keys pan deeper than one playfield
 *   ({@link stageHasShaft}) retargets the lane model's middle pull from the fixed playfield centre
 *   to the corridor centre sampled between the ceiling's bottom edge and the floor's top edge
 *   ahead of the ship ({@link shaftCorridorCentre}) while the camera pans (|dy| > 0) — the ship
 *   tracks the window down and back up instead of sitting on stale rows. Shipped max: 300 px
 *   (zone D's dive), below one playfield, so the gate never opens today.
 * - the **high-speed look-ahead** (zone C): terrain is read {@link terrainLookAhead} px ahead —
 *   {@link TERRAIN_AHEAD} plus {@link LOOKAHEAD_SPEED_GAIN} per px/tick of runner speed over
 *   {@link LOOKAHEAD_SPEED_GATE}. No shipped zone's camera key reaches the gate (the maximum is
 *   zone A's 2.25 px/tick tail, pinned by the gates-shut test), so today's scans read the same
 *   distance as before; the designed 2.55 px/tick passes are the first to use the arm.
 * - the **branch choice** (zone D): a trigger region whose flag a declared branch consumes, and
 *   which stays armed across the region's whole x-span, is steered into — the ship's centre walks
 *   one lane per tick towards the region centre (still never into a walled or about-to-be-shot
 *   lane) and the lane model resumes on entry ({@link branchSteerTriggers}). The shipped content's
 *   one trigger (gimmick-range's `took-low`) disarms before its region's far edge, so nothing
 *   today opens this.
 * - the **brick shooting** (zones D, F, G, I): a solid tile wall that closes the WHOLE visible
 *   playfield gaplessly across the ship's terrain-box rows ({@link punchWallAhead}: every window
 *   row solid across the wall's span on the content's PRISTINE tile grid — the bot's own drilling
 *   must not disarm the latch mid-punch — and every blocking tile in the box rows with `hp > 0`) is met
 *   by holding the row and letting the forced autofire drill it: the stream runs through the one
 *   cell row its own height sits on (a lane centre lies on a 12-px cell edge, so the box clips the
 *   neighbour row too — the same row the wall is found on), and the moment that row opens the ship
 *   slides into its cell centre; the hold latches until the wall's span has passed behind the ship,
 *   so the bot commits straight through and never retreats into a regrowing band (zone F's walls
 *   regrow behind: a wall that closes again in front just re-opens the same hold).
 *   {@link holeReadyAt} is the design's own hole predicate — a {@link HOLE_HEIGHT} band clear
 *   across the span — which the tests pin. Every shipped wall leaves gap rows in the window
 *   (zone F's tissue walls an 84-px corridor, zone D's maze walls 72 px), so no run today meets
 *   the gate; of the designs' set pieces only zone F's gapless chase walls (rows 8-33 plus the
 *   deep floor filling the camera-96 window) force the shot, while zone D's trench plug and zone
 *   I's coral columns stand under open water the lane model climbs to — their designs' own route.
 * - the **moving floors** (zone H): a live block swinging {@link SLAB_SWING} px or more is read at
 *   where its band will be when it crosses the ship's column ({@link blockYAt} at the crossing's
 *   middle tick, within {@link SLAB_HORIZON} ticks) — the lane the ship settles on is the slot
 *   between the slabs at the time they pass, so it climbs and dives with the sweep instead of
 *   parking in a row the slab will break through. Today's movers swing ±48 px at the most
 *   (gimmick-range), below the gate.
 *
 * The bot reads the World only (never writes it), so a run replays from its recorded input.
 *
 * @module
 */
import {
  Action,
  ANGLE_MASK,
  BossState,
  BulletFlag,
  DEFAULT_BLOCK_PERIOD,
  ENTER_END_X,
  EnemyFlag,
  EnemyState,
  ItemFlag,
  LaserPhase,
  MeterSlot,
  PLAYFIELD_H,
  TerrainType,
  WORLD_SCALE,
  sinB,
  terrainAt,
  type StageBlockEvent,
  type StageSpec,
  type TerrainMap,
  type World,
} from '@shmup/core';
import type { PlaytestBot } from './harness.js';
import {
  REMOTE_PRE_TAP_TICKS,
  REMOTE_TAP_TICKS,
  createRemoteStrictModel,
} from './remote-strict.js';

/** Playfield x the bot keeps its ship at (where the fly-in ends). */
export const BOT_X = ENTER_END_X;

/** Height of one lane of the danger scan, in pixels. */
export const LANE_HEIGHT = 16 * WORLD_SCALE;

/** Lanes of the scan: centres at `LANE_HEIGHT / 2 + k · LANE_HEIGHT`, `k = 0 … LANES − 1`. */
export const LANES = Math.floor(PLAYFIELD_H / LANE_HEIGHT);

/** Ticks ahead the bullet and contact scans look. */
export const BULLET_HORIZON = 40;

/** Pixels ahead of the ship the terrain scan looks (at the scroll speeds of today's stages). */
export const TERRAIN_AHEAD = 56 * WORLD_SCALE;

/**
 * Scroll speed over which the terrain look-ahead widens (R5-P.P12, zone C's rip tide;
 * v1 1.6 px/tick — the RT-P12 cure raised it from 1.4, which zone A's 2.25 px/tick tail key
 * crossed and moved the live-bot `zone-a-extras` recording). No shipped zone's camera key
 * reaches this gate (the maximum, 2.25 in zone A's tail, is pinned by the gates-shut test), so
 * every shipped scan reads exactly {@link TERRAIN_AHEAD}; the designed 2.55 px/tick passes are
 * the first to use the arm.
 */
export const LOOKAHEAD_SPEED_GATE = 1.6 * WORLD_SCALE;

/**
 * Extra look-ahead pixels per px/tick of scroll speed over {@link LOOKAHEAD_SPEED_GATE}
 * (v1 120 — re-anchored by the RT-P12 cure from 40 so the designed 2.55 px/tick pass still gains
 * (2.55 − 1.6·WORLD_SCALE) · 120·WORLD_SCALE = 0.15 · 180 = 27 px ≈ 10.6 ticks at 2.55 px/tick,
 * zone C's ask, while the whole shipped band below the gate reads the constant 84 px).
 */
export const LOOKAHEAD_SPEED_GAIN = 120 * WORLD_SCALE;

/**
 * Vertical swing at or above which a moving block is read ahead of its current position
 * (R5-P.P12, zone H's gate slabs; v1 40 px). Today's movers swing less (gimmick-range's ±48,
 * zone-h's ∓33), so no shipped run meets it and block predictions never open a recording.
 */
export const SLAB_SWING = 40 * WORLD_SCALE;

/** Ticks of a moving floor's sweep the terrain scan predicts at most (≈ half a gate slab period). */
export const SLAB_HORIZON = 120;

/**
 * Height of a shot-open hole the bot commits through (R5-P.P12, zones D and F; v1 16 px) — the
 * band around the ship's own row that must read clear across the wall's span before the bot leaves
 * the row it held while drilling.
 */
export const HOLE_HEIGHT = 16 * WORLD_SCALE;

/**
 * A destructible wall across the ship's row that must be shot open rather than dodged
 * ({@link punchWallAhead}): its near and far edge columns in world pixels.
 */
export interface PunchWall {
  /** First solid shot-able tile column ahead of the ship's bow. */
  readonly x: number;
  /** Last solid tile column of the wall's span at the ship's row. */
  readonly x1: number;
}

/**
 * The terrain look-ahead for a scroll speed (R5-P.P12, zone C): {@link TERRAIN_AHEAD} up to
 * {@link LOOKAHEAD_SPEED_GATE} px/tick, wider by {@link LOOKAHEAD_SPEED_GAIN} px per unit over it.
 *
 * @param speed - The stage runner's scroll speed in px/tick (0 for no stage).
 * @returns Pixels ahead the terrain scan reads.
 */
export function terrainLookAhead(speed: number): number {
  return TERRAIN_AHEAD + Math.max(0, speed - LOOKAHEAD_SPEED_GATE) * LOOKAHEAD_SPEED_GAIN;
}

/**
 * Whether the stage holds a vertical shaft: a camera key whose pan is deeper than one playfield
 * (R5-P.P12, zone B — the design §5 chimney is the one stage set past the 336-px playfield, the
 * yTo 400 key R5-02 lands; every other shipped stage's deepest pan stays below one playfield).
 *
 * @param stage - The stage spec.
 * @returns `true` when some key moves the camera vertically past {@link PLAYFIELD_H}.
 */
export function stageHasShaft(stage: StageSpec): boolean {
  let y = 0;
  for (const key of stage.camera) {
    const to = key.yTo ?? y;
    if (Math.abs(to - y) > PLAYFIELD_H) return true;
    y = to;
  }
  return false;
}

/**
 * The centre playfield row of the corridor ahead of the ship (R5-P.P12, zone B): the ceiling's
 * bottom edge (last row still rock below the map's top) and the floor's top edge (first rock row
 * above the map's bottom) sampled every `columnStep` px across the next `ahead` px, taking the
 * narrowest corridor the samples show. Only read while a shaft stage pans.
 *
 * @param world - The World.
 * @param ahead - How far ahead of the ship to sample.
 * @param player - The player slot whose ship centres the samples (default 0).
 * @param columnStep - Distance between sampled columns (default one lane).
 * @returns The corridor centre as a playfield row, or NaN when the stage has no terrain.
 */
export function shaftCorridorCentre(
  world: World,
  ahead: number,
  player = 0,
  columnStep = LANE_HEIGHT,
): number {
  const map = world.terrain;
  if (map === null) return Number.NaN;
  const ship = world.players[player];
  const size = map.tileSize;
  const mapH = map.rows * size;
  let ceiling = Number.NEGATIVE_INFINITY;
  let floor = Number.POSITIVE_INFINITY;
  for (let dx = columnStep; dx <= ahead; dx += columnStep) {
    const px = Math.floor(ship.x + dx);
    let c = 0;
    while (c < mapH && terrainAt(map, px, c) !== TerrainType.Empty) c += 4;
    let f = mapH - 1;
    while (f >= 0 && terrainAt(map, px, f) !== TerrainType.Empty) f -= 4;
    if (c > ceiling) ceiling = c;
    if (f + 1 < floor) floor = f + 1;
  }
  return (ceiling + floor) / 2 - world.camera.y;
}

/**
 * Where a stage block sits at a given age in ticks (R5-P.P12): the core `MovingBlockSystem`'s own
 * formula — base position plus drift plus the table sine of the swing — so the bot can read a
 * moving floor ahead of time, not only where it stands now.
 *
 * @param event - The stage's `block` event that created the block.
 * @param age - Ticks since the block appeared (the system's slot age plus the look-ahead ticks).
 * @returns The block's top edge in world pixels at that age.
 */
export function blockYAt(event: StageBlockEvent, age: number): number {
  const period = event.period ?? DEFAULT_BLOCK_PERIOD;
  const angle = Math.floor((event.phase ?? 0) + (age * 1024) / period) & ANGLE_MASK;
  return (event.y ?? 0) + (event.vy ?? 0) * age + (event.dy ?? 0) * sinB(angle);
}

/**
 * The collision tile id of one pixel of the map's cells (R5-P.P12 helper): non-zero for a pixel
 * standing in a solid cell, 0 for empty, decorative or outside the map. Moving blocks are terrain
 * too, but never punch-able, so the brick rules read cells only.
 *
 * @param map - The terrain map.
 * @param px - World pixel column.
 * @param py - World pixel row.
 * @returns The tile id, or 0 when no solid cell stands there.
 */
function solidTile(map: TerrainMap, px: number, py: number): number {
  const size = map.tileSize;
  const col = Math.floor(px / size);
  const row = Math.floor(py / size);
  if (col < 0 || row < 0 || col >= map.cols || row >= map.rows) return 0;
  const id = map.tiles[row * map.cols + col];
  if (id === 0) return 0;
  const type = map.tileType[id];
  return type !== TerrainType.Empty && type !== TerrainType.Hazard ? id : 0;
}

/**
 * Whether one tile row is shot clear across a wall span (moving blocks ignored — they swing, the
 * tiles stand; the stream's row and the ship's terrain-box rows are read this way).
 *
 * @param map - The stage terrain.
 * @param x0 - First world pixel of the span.
 * @param x1 - Last world pixel of the span.
 * @param row - The tile row.
 * @returns `true` when no solid tile stands in the row across the span.
 */
function spanRowClear(map: TerrainMap, x0: number, x1: number, row: number): boolean {
  const y = row * map.tileSize + map.tileSize / 2;
  for (let px = Math.floor(x0); px <= Math.floor(x1); px += 4) {
    if (solidTile(map, px, y) !== 0) return false;
  }
  return true;
}

/**
 * The destructible wall sealing the playfield ahead of the ship, which must be shot through and
 * not dodged (R5-P.P12, zones D and F; gate narrowed by the RT-P12 cure): a solid tile in EVERY
 * tile row the ship's terrain box touches, each blocking tile shot-able (`hp > 0`), AND the
 * wall's span closing the WHOLE visible window gaplessly — every playfield row from the camera's
 * top edge to its bottom edge solid across the span (the cure's discriminator: the shipped
 * tissue and maze walls all leave a 72–84 px gap corridor in their window, so no shipped run
 * meets this; among the wave-11 designs only zone F's gapless chase walls force the shot, while
 * zone D's trench plug and zone I's coral columns stand under open water the lane model climbs
 * to, per their designs' own route). `null` — today's behaviour — for open space, plain rock
 * among the box rows, or a scroll-locked camera (no wall ever arrives).
 *
 * @param world - The World.
 * @param ahead - How far ahead of the ship to look (the scan's own {@link terrainLookAhead}).
 * @param player - The player slot whose ship asks (default 0).
 * @returns The wall's span, or `null`.
 */
export function punchWallAhead(world: World, ahead = TERRAIN_AHEAD, player = 0): PunchWall | null {
  const map = world.terrain;
  const runner = world.stage;
  if (map === null || runner === null || runner.locked || !(runner.speed > 0)) return null;
  const destr = world.gimmicks.destructible;
  if (destr === null || !destr.any) return null;
  const ship = world.players[player];
  const box = world.ship.terrainBox;
  const size = map.tileSize;
  const hp = destr.tileHp;
  const pxFrom = Math.floor(ship.x + box.hw + 3);
  const pxTo = Math.floor(ship.x + ahead);
  const rowFrom = Math.floor((ship.y - box.hh) / size);
  const rowTo = Math.floor((ship.y + box.hh) / size);
  let wx = -1;
  let we = -1;
  for (let row = rowFrom; row <= rowTo; row++) {
    const py = row * size + size / 2;
    let x = -1;
    for (let px = pxFrom; px <= pxTo; px += 4) {
      if (solidTile(map, px, py) !== 0) {
        x = px;
        break;
      }
    }
    if (x < 0) continue;
    const t = solidTile(map, x, py);
    if (t >= hp.length || hp[t] === 0) return null; // plain rock among the box rows: not a target
    let col = Math.floor(x / size);
    const firstCol = col;
    while (col + 1 <= firstCol + 3 && solidTile(map, (col + 1) * size + size / 2, py) !== 0) col++;
    const end = (col + 1) * size - 1;
    if (wx < 0 || x < wx) {
      wx = x;
      we = end;
    } else if (x === wx && end > we) {
      we = end;
    }
  }
  if (wx < 0) return null;
  // RT-P12's cure: the span must close the whole window — measured on the content's PRISTINE
  // tile grid, so the bot's own drilling cannot disarm the latch mid-punch (the hold commits
  // through the closing band by design). The wall's columns are sampled every 4 px from the
  // camera's top edge to its bottom edge — a tile row is 12 px tall, so the step cannot miss a
  // row — and any open pristine row means the lane model can still thread a lane across the
  // wall (every shipped set-piece wall does). Only a gapless band is drilled.
  const camera = world.camera;
  const orig = runner.stage?.terrain ?? null;
  if (orig === null) return null;
  for (let px = wx; px <= we; px += 4) {
    const col = Math.floor(px / size);
    if (col < 0 || col >= orig.cols) return null;
    for (let py = Math.ceil(camera.y); py <= camera.y + PLAYFIELD_H - 1; py += 4) {
      const row = Math.floor(py / size);
      if (row < 0 || row >= orig.rows) return null;
      const t = orig.tiles[row * orig.cols + col];
      if (t === 0 || map.tileType[t] !== TerrainType.Solid) return null;
    }
  }
  return { x: wx, x1: we };
}

/**
 * Whether a {@link HOLE_HEIGHT} band centred on the ship's row reads clear across a punched wall's
 * span (R5-P.P12): the design's hole test — every tile row the 24-px band (±12 px around the
 * ship) touches must be open, what a straight shot stream must clear before the row counts as
 * passable (the RT-P12 cure's M3
 * reads the band through {@link HOLE_HEIGHT} itself, so the constant governs the predicate the
 * set-piece fixtures pin). The bot's hold latches by the wall's span alone (see
 * {@link punchWallAhead} and the remarks in {@link fourWayBot}); this predicate is its pin.
 *
 * @param world - The World.
 * @param x0 - First column of the wall's span.
 * @param x1 - Last column of the wall's span.
 * @param player - The player slot whose row centres the band (default 0).
 * @returns `true` when the band is open.
 */
export function holeReadyAt(world: World, x0: number, x1: number, player = 0): boolean {
  const map = world.terrain;
  if (map === null) return true;
  const ship = world.players[player];
  const size = map.tileSize;
  const half = HOLE_HEIGHT / 2;
  const rowFrom = Math.floor((ship.y - half + 1) / size);
  const rowTo = Math.floor((ship.y + half - 1) / size);
  for (let row = rowFrom; row <= rowTo; row++) {
    if (!spanRowClear(map, x0, x1, row)) return false;
  }
  return true;
}

/**
 * Whether the cell row the straight stream runs through (the ship's own tile row) is shot clear
 * across the wall span — once it is, the ship slides to that cell's centre so its box leaves the
 * undug neighbour row and the scroll carries it through (R5-P.P12).
 *
 * @param world - The World.
 * @param x0 - First column of the wall's span.
 * @param x1 - Last column of the wall's span.
 * @param player - The player slot whose row the stream runs (default 0).
 * @returns `true` when the ship's own cell row is open across the span.
 */
export function digRowOpen(world: World, x0: number, x1: number, player = 0): boolean {
  const map = world.terrain;
  if (map === null) return true;
  const ship = world.players[player];
  return spanRowClear(map, x0, x1, Math.floor(ship.y / map.tileSize));
}

/**
 * A branch region the bot steers into (R5-P.P12, zone D): the trigger's ordinal (its bit in
 * `StageRunner.triggersArmed`) and its region's bounds and centre in world pixels.
 */
export interface BranchSteer {
  /** Ordinal of the trigger event among the stage's triggers (armed-bit index). */
  readonly bit: number;
  /** Region left edge. */
  readonly x0: number;
  /** Region top edge. */
  readonly y0: number;
  /** Region right edge. */
  readonly x1: number;
  /** Region bottom edge. */
  readonly y1: number;
  /** Region centre x. */
  readonly cx: number;
  /** Region centre y. */
  readonly cy: number;
}

/** The empty steer list a stage without branch regions keeps ({@link fourWayBot}'s cache). */
const NO_STEERS: readonly BranchSteer[] = [];

/**
 * The trigger regions whose choice the bot should take (R5-P.P12, zone D): a `trigger` event whose
 * flag one of the stage's declared branches consumes, and which stays armed across the whole x
 * span of its region (`until` at or past the region's far edge, the default). The shipped content
 * has no such region: gimmick-range's `took-low` is consumed by branches but disarms at camera
 * 2,275, before its region's far edge at 2,310 — a pass-through checkpoint, not a lane choice.
 *
 * @param stage - The stage spec.
 * @returns The steer targets, in trigger order.
 */
export function branchSteerTriggers(stage: StageSpec): readonly BranchSteer[] {
  if (stage.branches.length === 0) return [];
  const consumed = new Set<number>();
  for (const branch of stage.branches) consumed.add(branch.flagId);
  const out: BranchSteer[] = [];
  let bit = 0;
  for (const event of stage.events) {
    if (event.type !== 'trigger') continue;
    const r = event.region;
    const until = event.until ?? r.x + r.w;
    if (consumed.has(event.flagId) && until >= r.x + r.w) {
      out.push({
        bit,
        x0: r.x,
        y0: r.y,
        x1: r.x + r.w,
        y1: r.y + r.h,
        cx: r.x + r.w / 2,
        cy: r.y + r.h / 2,
      });
    }
    bit++;
  }
  return out;
}

/** Highest speed level the bot equips (a faster 4-way ship overshoots its lanes). */
export const BOT_MAX_SPEED_LEVEL = 2;

/**
 * Ticks the bot must see its lane clear for before it starts a PowerUp tap under the remote model
 * (M3-02b): the two empty ticks the thumb needs plus the tap itself.
 */
export const EQUIP_WINDOW_TICKS = REMOTE_PRE_TAP_TICKS + REMOTE_TAP_TICKS;

/**
 * Ticks the bot waits for a clear lane before it takes the risk anyway (M3-02b): a capsule queue
 * it never spends is worse than one dangerous tap.
 */
export const EQUIP_PATIENCE_TICKS = 150;

/**
 * How strongly the bot prefers the lane of a boss's core (M3-02b): a remote player cannot
 * re-acquire a drifting core by flitting lane to lane, so it commits to the core's lane early —
 * while the lane scan still keeps it out of a lane that is about to be shot at.
 */
export const BOSS_CORE_BONUS = 160;

/**
 * Playfield y of a lane's centre.
 *
 * @param lane - Lane index.
 * @returns The centre row.
 */
export function laneCentre(lane: number): number {
  return LANE_HEIGHT / 2 + lane * LANE_HEIGHT;
}

/**
 * The lane a playfield row lies in (clamped to the scan).
 *
 * @param y - Playfield y.
 * @returns Lane index.
 */
export function laneOf(y: number): number {
  const lane = Math.floor(y / LANE_HEIGHT);
  return lane < 0 ? 0 : lane >= LANES ? LANES - 1 : lane;
}

/** Danger of terrain in a lane (a wall ahead — the lane cannot be used). */
const TERRAIN_DANGER = 5000;

/** Ticks per time slot of the scan. */
export const SLOT_TICKS = 2;

/** Time slots of the scan ({@link BULLET_HORIZON} ticks ahead). */
export const SLOTS = BULLET_HORIZON / SLOT_TICKS;

/**
 * What {@link scanLanes} found: per lane, bit masks of the time slots (slot `s` = ticks
 * `s · SLOT_TICKS … s · SLOT_TICKS + 1` from now) in which something dangerous crosses the ship's
 * column in that lane — near the lane's centre (`centre`, where the ship settles) or anywhere in
 * the lane (`span`, what a ship passing through meets) — plus the terrain ahead.
 */
export interface LaneScan {
  /** Threats near each lane's centre, one bit per slot. */
  readonly centre: Uint32Array;
  /** Threats anywhere in each lane, one bit per slot. */
  readonly span: Uint32Array;
  /** Terrain danger per lane (0 = no rock ahead). */
  readonly terrain: Float64Array;
  /** 1 where rock stands right at the ship: the lane can be neither used nor crossed. */
  readonly wall: Uint8Array;
}

/**
 * Creates an empty scan.
 *
 * @returns The scan.
 */
export function createLaneScan(): LaneScan {
  return {
    centre: new Uint32Array(LANES),
    span: new Uint32Array(LANES),
    terrain: new Float64Array(LANES),
    wall: new Uint8Array(LANES),
  };
}

/**
 * Marks a threat at a playfield row in one time slot: in the `centre` mask of every lane whose
 * centre lies within `reach`, in the `span` mask of every lane the band `y ± reach` touches.
 *
 * @param scan - The scan.
 * @param y - Playfield y of the threat.
 * @param reach - Half height of the threat (the ship's hurt radius and a margin included).
 * @param slot - Time slot.
 */
function mark(scan: LaneScan, y: number, reach: number, slot: number): void {
  const bit = 1 << slot;
  for (let k = 0; k < LANES; k++) {
    const c = laneCentre(k);
    if (Math.abs(c - y) <= reach) scan.centre[k] |= bit;
    if (y + reach >= c - LANE_HEIGHT / 2 && y - reach <= c + LANE_HEIGHT / 2) scan.span[k] |= bit;
  }
}

/**
 * The boss the bot faces: boss slot 0 while it flies in or fights, else the first other slot
 * that does (M2-10 — the survivor of a double boss, a boss inside a boss in another slot).
 *
 * @param world - The World.
 * @returns The boss, or `null` when none is in its intro or fight.
 */
function mainBoss(world: World): World['bosses']['boss'] | null {
  const slots = world.bosses.slots;
  for (let i = 0; i < slots.length; i++) {
    const boss = slots[i];
    if (boss.state === BossState.Intro || boss.state === BossState.Fight) return boss;
  }
  return null;
}

/**
 * Scans the lanes in front of the ship (see the module docs): bullets and enemy bodies are
 * followed along their current velocity (flying things ride the camera with the ship, ground
 * enemies scroll past), boss parts and laser lanes are marked for the slots they are dangerous in
 * (a laser from a few ticks before its beam grows), rock within {@link TERRAIN_AHEAD} px.
 *
 * @param world - The World.
 * @param scan - Receives the result (cleared first).
 * @param player - The player slot whose ship scans (default 0; M2-06 co-op runs fly a second bot).
 */
export function scanLanes(world: World, scan: LaneScan, player = 0): void {
  scan.centre.fill(0);
  scan.span.fill(0);
  scan.terrain.fill(0);
  scan.wall.fill(0);
  const ship = world.players[player];
  const camera = world.camera;
  const sx = ship.x - camera.x;
  const hurt = world.ship.hurtRadius;

  const bullets = world.bullets.pool;
  const bf = bullets.fields;
  for (let i = 0; i < bullets.count; i++) {
    if ((bf.flags[i] & BulletFlag.Dead) !== 0) continue;
    const r = bf.radius[i];
    const delay = bf.delay[i];
    const px = bf.x[i] - camera.x;
    const py = bf.y[i] - camera.y;
    for (let s = 0; s < SLOTS; s++) {
      const t = s * SLOT_TICKS;
      const moving = t > delay ? t - delay : 0;
      if (Math.abs(px + bf.vx[i] * moving - sx) > 6 + r) continue;
      mark(scan, py + bf.vy[i] * moving, r + hurt + 4, s);
    }
  }

  const enemies = world.enemies.enemies;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (e.state !== EnemyState.Live || (e.flags & EnemyFlag.Ghost) !== 0) continue;
    const vx = e.anchor === 0 ? e.vx : e.vx - camera.dx;
    const vy = e.anchor === 0 ? e.vy : 0;
    const ex = e.x - camera.x;
    const ey = e.y - camera.y;
    for (let s = 0; s < SLOTS; s++) {
      const t = s * SLOT_TICKS;
      if (Math.abs(ex + vx * t - sx) > e.hw + 8 * WORLD_SCALE) continue;
      mark(scan, ey + vy * t, e.hh + hurt + 5, s);
    }
  }

  const boss = mainBoss(world);
  if (boss !== null) {
    for (let i = 0; i < boss.partCount; i++) {
      const part = boss.parts[i];
      if (!part.active || part.destroyed || !part.hurtbox) continue;
      if (Math.abs(part.x - camera.x - sx) > part.hw + 24 * WORLD_SCALE) continue;
      for (let s = 0; s < SLOTS; s++) mark(scan, part.y - camera.y, part.hh + hurt + 6, s);
    }
  }

  const lasers = world.bullets.lasers;
  const lf = lasers.fields;
  for (let i = 0; i < lasers.count; i++) {
    if ((lf.flags[i] & BulletFlag.Dead) !== 0) continue;
    const phase = lf.phase[i];
    if (phase === LaserPhase.Fade) continue;
    const x0 = Math.min(lf.x[i], lf.ex[i]) - camera.x;
    const x1 = Math.max(lf.x[i], lf.ex[i]) - camera.x;
    if (sx < x0 - 8 * WORLD_SCALE || sx > x1 + 8 * WORLD_SCALE) continue;
    const dx = lf.ex[i] - lf.x[i];
    const at = Math.abs(dx) < 1e-6 ? 0 : (ship.x - lf.x[i]) / dx;
    const y = lf.y[i] + (lf.ey[i] - lf.y[i]) * (at < 0 ? 0 : at > 1 ? 1 : at) - camera.y;
    // Ticks until the beam is up, and until it starts to fade.
    let before = 0;
    let until = lf.active[i] - lf.ticks[i];
    if (phase === LaserPhase.Telegraph) {
      before = lf.telegraph[i] - lf.ticks[i] + lf.grow[i];
      until = before + lf.active[i];
    } else if (phase === LaserPhase.Grow) {
      before = lf.grow[i] - lf.ticks[i];
      until = before + lf.active[i];
    }
    // A few ticks early: the ship must be out of the lane when the beam widens.
    const from = Math.max(0, Math.floor((before - 12) / SLOT_TICKS));
    const to = Math.min(SLOTS - 1, Math.floor(until / SLOT_TICKS));
    for (let s = from; s <= to; s++) mark(scan, y, lf.width[i] / 2 + hurt + 4, s);
  }

  const map = world.terrain;
  if (map !== null) {
    const box = world.ship.terrainBox;
    const ahead = terrainLookAhead(world.stage === null ? 0 : world.stage.speed);
    for (let k = 0; k < LANES; k++) {
      const y = camera.y + laneCentre(k);
      let blocked = false;
      for (let dx = -box.hw - 3; dx <= ahead && !blocked; dx += 4) {
        for (let dy = -box.hh - 4; dy <= box.hh + 4; dy += 3.5) {
          if (terrainAt(map, ship.x + dx, y + dy) !== TerrainType.Empty) {
            blocked = true;
            scan.terrain[k] = dx <= 16 * WORLD_SCALE ? TERRAIN_DANGER : TERRAIN_DANGER / 2;
            if (dx <= 8 * WORLD_SCALE) scan.wall[k] = 1;
            break;
          }
        }
      }
    }

    // Moving floors (R5-P.P12, zone H): a block swinging at least SLAB_SWING px is read at the
    // row band it will occupy when it crosses the ship's column, not where it stands now — the
    // lanes that survive that mark are the slot between the slabs at the crossing time, so the
    // ship settles into it and climbs or dives with the sweep as the scan re-reads every tick.
    // Small swings (today's pistons) stay read by position, exactly as before.
    const sys = world.gimmicks.blocks;
    const blocks = map.blocks;
    const runner = world.stage;
    if (sys !== null && blocks !== undefined && blocks !== null && runner !== null) {
      const scroll = runner.speed;
      if (scroll > 0) {
        const events = runner.stage.events;
        const slots = sys.slotEvent;
        const ages = sys.slotAge;
        for (let s = 0; s < slots.length; s++) {
          const ei = slots[s];
          if (ei < 0 || blocks.live[s] === 0) continue;
          const e = events[ei];
          if (e.type !== 'block') continue;
          const dy = e.dy ?? 0;
          if (dy > -SLAB_SWING && dy < SLAB_SWING) continue;
          const bx0 = blocks.x0[s];
          const bx1 = blocks.x1[s];
          if (bx1 < ship.x + box.hw || bx0 > ship.x + ahead) continue;
          const tIn = Math.max(0, (bx0 - ship.x - box.hw) / scroll);
          const tOut = Math.max(0, (bx1 + box.hw - ship.x) / scroll);
          const tau = (tIn + tOut) / 2;
          if (tau > SLAB_HORIZON) continue;
          const yTop = blockYAt(e, ages[s] + tau) - camera.y;
          const yBot = yTop + e.h;
          if (yBot < 0 || yTop > PLAYFIELD_H) continue;
          const danger = tOut <= 10 ? TERRAIN_DANGER : TERRAIN_DANGER / 2;
          const ka = yTop <= 0 ? 0 : Math.floor(yTop / LANE_HEIGHT);
          const kb = yBot >= PLAYFIELD_H ? LANES - 1 : Math.floor(yBot / LANE_HEIGHT);
          for (let k = ka; k <= kb; k++) if (scan.terrain[k] < danger) scan.terrain[k] = danger;
        }
      }
    }
  }
}

/**
 * Whether a mask has a bit in the slots `from … to` (clamped to the scan).
 *
 * @param mask - Slot mask.
 * @param from - First slot.
 * @param to - Last slot.
 * @returns The first such slot, or -1.
 */
function firstSlot(mask: number, from: number, to: number): number {
  const a = from < 0 ? 0 : from;
  const b = to >= SLOTS ? SLOTS - 1 : to;
  for (let s = a; s <= b; s++) if ((mask & (1 << s)) !== 0) return s;
  return -1;
}

/** Options of {@link fourWayBot}. */
export interface FourWayBotOptions {
  /**
   * Fly under the Samsung remote's real limits (M3-02b — `remote-strict`): default `true`.
   * `false` gives the pre-M3-02b bot, which could press a button while moving.
   */
  readonly remote?: boolean;
}

/**
 * Creates a four-way playtest bot (see the module docs). Each bot keeps a little state (its
 * target lane, its last PowerUp press, its remote model), so use one per run.
 *
 * @param player - The player slot it flies (default 0 — player 1; the co-op golden replay of
 *   M2-06 flies player 2 with a second bot).
 * @param options - Whether the remote model applies (default: it does).
 * @returns The bot.
 *
 * @example
 * ```ts
 * const run = runStage('zone-a', fourWayBot(), { godMode: true });
 * ```
 */
export function fourWayBot(player = 0, options: FourWayBotOptions = {}): PlaytestBot {
  const strict = options.remote !== false;
  const remote = createRemoteStrictModel();
  const scan = createLaneScan();
  const bonus = new Float64Array(LANES);
  const cost = new Float64Array(LANES);
  let target = -1;
  let pressed = false;
  let waiting = 0;
  // Stage-gate context (R5-P.P12): built once per stage on first sight, never on the hot path.
  let ctxStage: StageSpec | null = null;
  let shaft = false;
  let steers: readonly BranchSteer[] = NO_STEERS;
  let steer = -1;
  let punching = false;
  let punchX0 = 0;
  let punchX1 = 0;

  /**
   * Whether the cursor sits on a slot the bot wants.
   *
   * @param world - The World.
   * @returns `true` to press PowerUp now.
   */
  const wantsEquip = (world: World): boolean => {
    const slot = world.powerups.meters[player].cursor;
    if (slot < 0 || !world.powerups.canEquip(player, slot)) return false;
    const ship = world.players[player];
    const loadout = world.weapons.loadouts[player];
    if (slot === MeterSlot.Speed) return ship.speedLevel < BOT_MAX_SPEED_LEVEL;
    if (slot === MeterSlot.Missile) return !loadout.missile;
    if (slot === MeterSlot.Option) return loadout.options < 4;
    return false;
  };

  /**
   * Whether the ship's lane stays free of threats and rock for the next `ticks` ticks, so the bot
   * can stand still through a button tap (M3-02b).
   *
   * @param lane - The lane the ship is in.
   * @param ticks - Ticks the tap lasts.
   * @returns `true` while nothing crosses the lane in that window.
   */
  const laneClearFor = (lane: number, ticks: number): boolean => {
    if (scan.wall[lane] !== 0) return false;
    return firstSlot(scan.centre[lane], 0, Math.ceil(ticks / SLOT_TICKS)) < 0;
  };

  return {
    name: strict ? 'four-way (remote)' : 'four-way',
    remoteStrict: strict,
    /**
     * One tick's decision (see the module docs): a one-tick PowerUp press when `wantsEquip` says,
     * then — only while the ship is `alive` — the lane scan, a cost per lane (the trip through the
     * lanes on the way, the stay, terrain, preferences, a pull towards the middle), the cheapest
     * lane with a 20-point hysteresis, and one direction towards it: vertical first, then back to
     * {@link BOT_X}.
     *
     * @param world - The World about to be stepped (read only).
     * @returns The `Action` mask to hold: at most one direction, plus `PowerUp` on a press tick.
     */
    decide(world) {
      const ship = world.players[player];
      let mask = 0;
      if (ship.state !== 'alive') {
        target = -1;
        pressed = false;
        steer = -1;
        punching = false;
        // No reset: a tap already under way keeps its measured length in the recorded stream.
        return strict ? remote.filter(0) : 0;
      }
      const camera = world.camera;
      const sx = ship.x - camera.x;
      const sy = ship.y - camera.y;
      const ahead = terrainLookAhead(world.stage === null ? 0 : world.stage.speed);
      scanLanes(world, scan, player);
      const current = laneOf(sy);
      const speed = world.ship.speeds[ship.speedLevel] ?? 1.5 * WORLD_SCALE;
      // Stage-gate context (R5-P.P12): the shaft check and the branch regions are properties of the
      // stage, read once when the World's stage changes (the cold path of a stage skip or remix).
      const stageSpec = world.stage === null ? null : world.stage.stage;
      if (stageSpec !== ctxStage) {
        ctxStage = stageSpec;
        shaft = stageSpec !== null && stageHasShaft(stageSpec);
        steers = stageSpec === null ? NO_STEERS : branchSteerTriggers(stageSpec);
        steer = -1;
        punching = false;
      }
      // PowerUp: one-tick presses (an edge), never two ticks in a row. Under the remote model the
      // press costs a whole tap without a direction (M3-02b), so the bot only starts one while its
      // lane stays clear for as long as the tap lasts — what a careful remote player does.
      if (!pressed && wantsEquip(world)) {
        waiting++;
        if (
          !strict ||
          waiting > EQUIP_PATIENCE_TICKS ||
          laneClearFor(current, EQUIP_WINDOW_TICKS)
        ) {
          mask |= Action.PowerUp;
          pressed = true;
          waiting = 0;
        }
      } else {
        pressed = false;
        waiting = 0;
      }

      // Brick shooting (R5-P.P12, zones D and F): a shot-able wall — one that closes the WHOLE
      // camera window on the pristine content grid, every cell of it in the ship's rows
      // destructible (see {@link punchWallAhead}) — is met by HOLDING the row and letting the
      // forced autofire drill it — a 4-way ship cannot out-climb a full-height plug, and lane
      // changes mid-drill would widen the hole's regrow exposure (zone F's tissue). The hold
      // latches until the wall's span has passed behind the ship: the straight stream digs the one
      // cell row its own height runs through, the ship slides into that cell's centre (its box
      // leaves the undug neighbour row) and the scroll carries it through; a wall that closes
      // again in front just re-opens the hold, never a retreat.
      if (punching) {
        const box = world.ship.terrainBox;
        if (punchX1 < ship.x - box.hw) punching = false;
      }
      if (!punching) {
        const wall = punchWallAhead(world, ahead, player);
        if (wall !== null) {
          punching = true;
          punchX0 = wall.x;
          punchX1 = wall.x1;
        }
      }
      if (punching) {
        target = current;
        if (digRowOpen(world, punchX0, punchX1, player)) {
          // The stream's own cell is open — slide into its centre so the terrain box leaves the
          // undug neighbour row (a lane centre lies on a 12-px cell edge, so the straight stream
          // can only ever dig the cell its own height runs through).
          const size = world.terrain === null ? 1 : world.terrain.tileSize;
          const centre = (Math.floor(ship.y / size) + 0.5) * size;
          if (ship.y < centre - 2) mask |= Action.Down;
          else if (ship.y > centre + 2) mask |= Action.Up;
        }
        if ((mask & (Action.Up | Action.Down)) === 0) {
          if (sx < BOT_X - speed) mask |= Action.Right;
          else if (sx > BOT_X + speed) mask |= Action.Left;
        }
        return strict ? remote.filter(mask) : mask;
      }

      // The shaft's corridor centre (R5-P.P12, zone B): while a shaft stage pans, the middle pull
      // of the lane cost follows the corridor sampled between the ceiling's bottom edge and the
      // floor's top edge ahead — the stale playfield centre sits outside the map during a descent.
      let midRow = PLAYFIELD_H / 2;
      if (shaft && Math.abs(world.camera.dy) > 1e-9) {
        const c = shaftCorridorCentre(world, ahead, player);
        if (!Number.isNaN(c)) midRow = c < 0 ? 0 : c > PLAYFIELD_H ? PLAYFIELD_H : c;
      }

      // Branch choice (R5-P.P12, zone D): an armed branch region ahead whose centre lies within
      // one playfield of the ship is entered, not flown past — the ship's centre walks one lane per
      // tick towards the region centre, still never stepping into a walled lane or one about to be
      // shot through, and the full lane model resumes the tick the centre is inside (the sim fires
      // the trigger there).
      let forced = -1;
      const runner = world.stage;
      if (steers.length > 0 && runner !== null) {
        const armed = runner.triggersArmed;
        let bestSteer: BranchSteer | null = null;
        for (let i = 0; i < steers.length; i++) {
          const t = steers[i];
          if ((armed & (1 << t.bit)) === 0) continue;
          if (ship.x >= t.x0 && ship.x < t.x1 && ship.y >= t.y0 && ship.y < t.y1) {
            bestSteer = null;
            break; // inside — the choice is being made; the flag fires this tick
          }
          if (t.cx <= ship.x || Math.abs(t.cy - ship.y) > PLAYFIELD_H) continue;
          if (bestSteer === null || t.cx < bestSteer.cx) bestSteer = t;
        }
        if (bestSteer !== null) {
          const want = laneOf(bestSteer.cy - camera.y);
          if (steer < 0) steer = current;
          const next = steer < want ? steer + 1 : steer > want ? steer - 1 : want;
          if (scan.wall[next] === 0 && firstSlot(scan.centre[next], 0, 1) < 0) steer = next;
          forced = steer;
        } else {
          steer = -1;
        }
      }

      // Preferences: capsules ahead, the boss's core, the next enemy ahead (to shoot it).
      bonus.fill(0);
      const items = world.powerups.pool;
      const itf = items.fields;
      for (let i = 0; i < items.count; i++) {
        if ((itf.flags[i] & ItemFlag.Dead) !== 0) continue;
        const ix = itf.x[i] - camera.x;
        if (ix < sx - 6 * WORLD_SCALE || ix > sx + 220 * WORLD_SCALE) continue;
        bonus[laneOf(itf.y[i] - camera.y)] += 40;
      }
      const boss = mainBoss(world);
      if (boss !== null && boss.state === BossState.Fight) {
        for (let i = 0; i < boss.partCount; i++) {
          const part = boss.parts[i];
          if (!part.core || part.destroyed) continue;
          const lane = laneOf(part.y - camera.y);
          bonus[lane] += BOSS_CORE_BONUS;
          if (lane > 0) bonus[lane - 1] += BOSS_CORE_BONUS / 4;
          if (lane < LANES - 1) bonus[lane + 1] += BOSS_CORE_BONUS / 4;
        }
      } else {
        let nearest = Number.POSITIVE_INFINITY;
        let lane = -1;
        const enemies = world.enemies.enemies;
        for (let i = 0; i < enemies.length; i++) {
          const e = enemies[i];
          if (e.state !== EnemyState.Live || (e.flags & EnemyFlag.Ghost) !== 0) continue;
          if (e.anchor !== 0) continue;
          const dx = e.x - camera.x - sx;
          if (dx < 24 * WORLD_SCALE || dx > 280 * WORLD_SCALE || dx >= nearest) continue;
          nearest = dx;
          lane = laneOf(e.y - camera.y);
        }
        if (lane >= 0) bonus[lane] += 12;
      }

      // Cost of each lane: the trip there (every lane passed through, while the ship is in it)
      // and the stay (the destination's centre from arrival on), plus terrain and preferences.
      for (let k = 0; k < LANES; k++) {
        let c = scan.terrain[k] - bonus[k] + 1.5 * Math.abs(k - current);
        c += (2 * Math.abs(laneCentre(k) - midRow)) / (PLAYFIELD_H / 2);
        const goal = laneCentre(k);
        const dir = goal >= sy ? 1 : -1;
        // Lanes crossed on the way, the current one included (until the ship leaves it).
        for (let j = current; j !== k; j += dir) {
          if (j !== current && scan.wall[j] !== 0) c += TERRAIN_DANGER * 4;
          const near = dir > 0 ? laneCentre(j) - LANE_HEIGHT / 2 : laneCentre(j) + LANE_HEIGHT / 2;
          const far = dir > 0 ? laneCentre(j) + LANE_HEIGHT / 2 : laneCentre(j) - LANE_HEIGHT / 2;
          const enter = j === current ? 0 : Math.abs(near - sy) / speed;
          const leave = Math.abs(far - sy) / speed;
          const from = Math.floor(enter / SLOT_TICKS) - 1;
          const to = Math.ceil(leave / SLOT_TICKS) + 1;
          const hit = firstSlot(scan.span[j], from, to);
          // A threat at the ship's own spot before it could leave hits it if it stays too:
          // leaving is then never worse than staying (else the bot froze inside a beam).
          if (hit >= 0 && !(j === current && firstSlot(scan.centre[j], from, to) >= 0)) {
            c += 3000 - hit * 50;
          }
        }
        // The stay: from the slot the ship gets there (sooner threats weigh more).
        const arrive = Math.abs(goal - sy) / speed;
        const hit = firstSlot(scan.centre[k], Math.floor(arrive / SLOT_TICKS) - 1, SLOTS - 1);
        if (hit >= 0) c += 100 + 2000 * (1 - hit / SLOTS) * (1 - hit / SLOTS);
        // Moving inside the current lane to its centre crosses its span too.
        if (k === current) {
          const inLane = firstSlot(scan.span[k], 0, Math.ceil(arrive / SLOT_TICKS) + 1);
          if (inLane >= 0 && hit < 0) c += 300;
        }
        cost[k] = c;
      }
      let best = current;
      for (let k = 0; k < LANES; k++) if (cost[k] < cost[best]) best = k;
      // Hysteresis: keep the lane already heading for unless the new one is clearly better.
      if (target < 0 || cost[best] < cost[target] - 20) target = best;
      // The branch steer owns the lane while it runs (its step guard above keeps it careful).
      if (forced >= 0) target = forced;

      // In a boss fight the bot lines up on the core's own row inside the target lane instead of
      // its centre (M3-02b) — but only while it cannot die. A remote player that changes direction
      // only between key-ups cannot re-acquire a drifting core lane by lane, so the audit runs
      // (god mode, "does this boss go down at all") need the fine aim; a run that can die dodges
      // by lanes, and sitting on the core's row is exactly where a boss's aimed fire converges.
      let goalY = laneCentre(target);
      if (boss !== null && boss.state === BossState.Fight && world.debugFlags.godMode) {
        // The core if the encounter has one (a boss), else its first live part (a captain).
        let fallback = -1;
        for (let i = 0; i < boss.partCount; i++) {
          const part = boss.parts[i];
          if (part.destroyed) continue;
          const py = part.y - camera.y;
          if (laneOf(py) !== target) continue;
          if (part.core) {
            fallback = py;
            break;
          }
          if (fallback < 0) fallback = py;
        }
        if (fallback >= 0) goalY = fallback;
      }
      const dy = goalY - sy;
      if (Math.abs(dy) > speed * 0.5) {
        mask |= dy < 0 ? Action.Up : Action.Down;
      } else if (sx < BOT_X - speed) {
        mask |= Action.Right;
      } else if (sx > BOT_X + speed) {
        mask |= Action.Left;
      }
      return strict ? remote.filter(mask) : mask;
    },
  };
}
