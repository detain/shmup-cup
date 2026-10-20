/**
 * R2-02.A1 (1/2): the world-scale audit (plan §2.6, decision R2-N1). `V1_WORLD` freezes every
 * world-unit numeric export of core's barrel with its **v1** value (read from the pre-flip tree
 * `d4de048` through `docs/v2-run/helpers/w5pre/exports.mjs` — the frame-derived exports moved at
 * the flip `72b18a1`, so v1 values must come from before it) and its `NumberUnit`; the test then
 * requires every one of them to equal `rescaleNumber(unit, v1, geometry)` at the live scale — the
 * identity while `WORLD_SCALE` is 1, the ported value under the two-scale kit. So the port cannot
 * miss a world value: until the `R2-02.W*` subtasks land, exactly their constants are red under
 * the kit, and after they all land the file is green at both scales.
 *
 * `UNSCALED` freezes the regex-matching exports that are not world units — with a one-word reason
 * — at their current values, and the completeness audit requires every numeric barrel export
 * whose name matches the world-shaped regex to sit in one of the two tables (the list is taken
 * from the barrel at run time, never hard-coded), so a new world-shaped export fails the audit
 * until it is classified.
 */
import * as core from '../../src/index.js';
import { describe, expect, it } from 'vitest';
import {
  PLAYFIELD_H,
  PLAYFIELD_W,
  TILE_SIZE,
  WORLD_SCALE,
  WORLD_TOP_PAD,
  rescaleNumber,
  type NumberUnit,
  type RescaleOptions,
} from '../../src/index.js';

/** One frozen world-unit export: its v1 value and the unit that ports it. */
interface V1World {
  readonly name: string;
  readonly v1: number;
  readonly unit: NumberUnit;
}

/** One frame-anchored export: `PLAYFIELD_W + offset * WORLD_SCALE` (plan §2.6: anchor + margin). */
interface Anchored {
  readonly name: string;
  readonly offset: number;
}

/** One regex-matching export that never scales, frozen at its current value. */
interface Unscaled {
  readonly name: string;
  readonly reason:
    | 'ticks'
    | 'angle'
    | 'count'
    | 'ratio'
    | 'frame'
    | 'score'
    | 'flag'
    | 'hash'
    | 'resolution'
    | 'bound';
  readonly value: number;
}

/** The live world scale. */
const K = WORLD_SCALE;

/** The geometry of the port the kit runs (v1's 384 × 200 playfield into the live frame's). */
const PORT_GEOMETRY: RescaleOptions = Object.freeze({
  factor: K,
  topPad: WORLD_TOP_PAD,
  fromWidth: 384,
  fromHeight: 200,
  toWidth: PLAYFIELD_W,
  toHeight: PLAYFIELD_H,
  tileSize: 8,
});

/** The no-port geometry (K = 1): every unit's rule is the identity under it. */
const IDENTITY_GEOMETRY: RescaleOptions = Object.freeze({
  factor: 1,
  topPad: 0,
  fromWidth: PLAYFIELD_W,
  fromHeight: PLAYFIELD_H,
  toWidth: PLAYFIELD_W,
  toHeight: PLAYFIELD_H,
  tileSize: TILE_SIZE,
});

/**
 * Every world-unit numeric barrel export with its v1 value and unit, grouped by the `R2-02.W*`
 * subtask that turns it into `v1 * WORLD_SCALE` (under the kit the not-yet-ported ones are exactly
 * the red list, named by these groups).
 */
const V1_WORLD: readonly V1World[] = Object.freeze([
  // R2-02.W1 — core/bullets, core/patterns:
  { name: 'BENDING_LASER_SPEED', v1: 3, unit: 'px-per-tick' },
  { name: 'BENDING_LASER_WIDTH', v1: 6, unit: 'world-px' },
  { name: 'BULLET_CULL_MARGIN', v1: 16, unit: 'world-px' },
  { name: 'CRAWL_STEP', v1: 8, unit: 'px-per-tick' },
  { name: 'DEFAULT_PATTERN_SPEED', v1: 1, unit: 'px-per-tick' },
  { name: 'GRAZE_MARGIN', v1: 7, unit: 'world-px' },
  { name: 'LASER_WIDTH', v1: 6, unit: 'world-px' },
  { name: 'MAX_BULLET_SPEED', v1: 16, unit: 'px-per-tick' },
  { name: 'POINT_ITEM_ACCEL', v1: 0.35, unit: 'px-per-tick2' },
  { name: 'POINT_ITEM_MAX_SPEED', v1: 9, unit: 'px-per-tick' },
  // R2-02.W2 — core/weapons:
  { name: 'LASER_SEGMENT_LENGTH', v1: 8, unit: 'world-px' },
  { name: 'RIPPLE_RING_WIDTH', v1: 4, unit: 'world-px' },
  { name: 'SHOT_CULL_MARGIN', v1: 16, unit: 'world-px' },
  // R2-02.W3 — the ship side (player, options, shields, powerups, black hole):
  { name: 'BLACK_HOLE_CORE_RADIUS', v1: 10, unit: 'world-px' },
  { name: 'BLACK_HOLE_DRIFT', v1: 0.25, unit: 'px-per-tick' },
  { name: 'BLACK_HOLE_ENEMY_PULL', v1: 1, unit: 'px-per-tick' },
  { name: 'BLACK_HOLE_PULL', v1: 2, unit: 'px-per-tick' },
  { name: 'BLACK_HOLE_RADIUS', v1: 88, unit: 'world-px' },
  { name: 'BLACK_HOLE_THROW_X', v1: 48, unit: 'rel-px' },
  { name: 'COOP_EXTRA_OFFSET', v1: 12, unit: 'rel-px' },
  { name: 'ENTER_END_X', v1: 64, unit: 'world-x' },
  { name: 'ENTER_START_X', v1: -24, unit: 'world-x' },
  { name: 'ITEM_CULL_MARGIN', v1: 32, unit: 'world-px' },
  { name: 'ITEM_RADIUS', v1: 5, unit: 'world-px' },
  { name: 'LEAVE_ACCELERATION', v1: 0.125, unit: 'px-per-tick2' },
  { name: 'LEAVE_MAX_SPEED', v1: 8, unit: 'px-per-tick' },
  { name: 'OPTION_RADIUS', v1: 4, unit: 'world-px' },
  { name: 'PICKUP_MAGNET_RANGE', v1: 16, unit: 'world-px' },
  { name: 'PICKUP_MAGNET_SPEED', v1: 2, unit: 'px-per-tick' },
  { name: 'POD_ORBIT', v1: 13, unit: 'world-px' },
  { name: 'POD_RADIUS', v1: 4, unit: 'world-px' },
  { name: 'ROTATE_POD_ORBIT', v1: 16, unit: 'world-px' },
  { name: 'ROTATE_RADIUS', v1: 20, unit: 'world-px' },
  { name: 'ROTATE_RADIUS_EXTENDED', v1: 40, unit: 'world-px' },
  { name: 'SNAKE_LINK', v1: 16, unit: 'rel-px' },
  // R2-02.W4 — enemies, bosses, stage systems, world, collision, debug:
  { name: 'BLOCK_DESPAWN_MARGIN', v1: 128, unit: 'world-px' },
  { name: 'BOSS_ENTRY_MARGIN', v1: 8, unit: 'world-px' },
  { name: 'BOSS_FIRE_MARGIN', v1: 8, unit: 'world-px' },
  { name: 'BOSS_SKIP_LEAD', v1: 96, unit: 'world-px' },
  { name: 'CARRIED_OPTION_SPACING', v1: 10, unit: 'world-px' },
  { name: 'DEFAULT_GRID_CELL_SIZE', v1: 32, unit: 'world-px' },
  { name: 'DESPAWN_MARGIN', v1: 32, unit: 'world-px' },
  { name: 'GHOST_MARGIN', v1: 128, unit: 'world-px' },
  { name: 'GRID_MARGIN', v1: 64, unit: 'world-px' },
  { name: 'UNSEEN_MARGIN', v1: 128, unit: 'world-px' },
  // R2-02.W5 — data defaults and bounds (outside the regex; world values all the same):
  { name: 'DEFAULT_BONUS_WINDOW', v1: 600, unit: 'world-px' },
  { name: 'DEFAULT_MODE7_FOG_DEPTH', v1: 96, unit: 'texels' },
  { name: 'DEFAULT_REVENGE_SPEED', v1: 1.25, unit: 'px-per-tick' },
]);

/**
 * The frame-anchored exports — a frame edge plus a world margin (conventions § Frame ≠ world):
 * each is `PLAYFIELD_W + offset * WORLD_SCALE`, its v1 absolute being the v1 `PLAYFIELD_W` plus
 * the same offset. Offsets from plan R2-02.T0 (32, 40, 16, 16, −88).
 */
const ANCHORED: readonly Anchored[] = Object.freeze([
  { name: 'LEAVE_END_X', offset: 32 }, // R2-02.W3 — player/index.ts
  { name: 'BOSS_REST_X', offset: 40 }, // R2-02.W4 — bosses/index.ts
  { name: 'DEFAULT_SPAWN_SCREEN_X', offset: 16 }, // R2-02.W4 — enemies/index.ts
  { name: 'DEFAULT_BLOCK_SCREEN_X', offset: 16 }, // R2-02.W5 — data/index.ts
  { name: 'DEFAULT_BOSS_X', offset: -88 }, // R2-02.W5 — data/index.ts
]);

/** The regex-matching exports that are not world units, frozen at their current values. */
const UNSCALED: readonly Unscaled[] = Object.freeze([
  // Bit flags and generated constants:
  { name: 'ACCEL_HAS_MAX', reason: 'flag', value: 2 },
  { name: 'ACCEL_HAS_MIN', reason: 'flag', value: 1 },
  { name: 'FNV_OFFSET_BASIS', reason: 'hash', value: 2166136261 },
  // Engine resolutions and load-time bounds (R2-02.A1's listed decisions):
  { name: 'PATH_SAMPLE_STEP', reason: 'resolution', value: 1 },
  { name: 'MAX_PATH_LENGTH', reason: 'bound', value: 16384 },
  // Ticks and blink rates:
  { name: 'BLACK_HOLE_PULL_TICKS', reason: 'ticks', value: 96 },
  { name: 'HUD_PROMPT_BLINK_TICKS', reason: 'ticks', value: 32 },
  { name: 'ITEM_BLINK_TICKS', reason: 'ticks', value: 8 },
  { name: 'ITEM_EXPIRY_BLINK_TICKS', reason: 'ticks', value: 120 },
  { name: 'LASER_BLINK_TICKS', reason: 'ticks', value: 4 },
  { name: 'OPTION_SPREAD_TICKS', reason: 'ticks', value: 12 },
  { name: 'PREVIEW_SPREAD_TICKS', reason: 'ticks', value: 90 },
  // Angles (binary, ANGLE_UNITS 1024 — plan §2.6 and R2-02.W3's traps):
  { name: 'FREE_POD_SPREAD', reason: 'angle', value: 96 },
  { name: 'ROTATE_SPEED', reason: 'angle', value: 12 },
  // Counts, indices and budgets:
  { name: 'ATAN_TABLE_STEPS', reason: 'count', value: 256 },
  {
    // W1's landed classification (bullets/index.ts): a node count — ticks of head history — the
    // body's world extent scales through BENDING_LASER_SPEED alone (48 × 1.5 would exceed the
    // 64-node ring).
    name: 'BENDING_LASER_LENGTH',
    reason: 'count',
    value: 48,
  },
  { name: 'FULL_LOADOUT_SPEED_LEVEL', reason: 'count', value: 2 },
  { name: 'MAX_BLOCK_CELLS', reason: 'count', value: 64 },
  { name: 'MAX_CHAIN_LINKS', reason: 'count', value: 16 },
  { name: 'MAX_PULL_FIELDS', reason: 'count', value: 8 },
  { name: 'MAX_UI_TEXT_LENGTH', reason: 'count', value: 48 },
  { name: 'NAME_ENTRY_LENGTH', reason: 'count', value: 3 },
  { name: 'OPTION_SPACING', reason: 'count', value: 12 },
  { name: 'PATTERN_STEP_BUDGET', reason: 'count', value: 1024 },
  { name: 'REDUCE_HURT_STEPS', reason: 'count', value: 2 },
  { name: 'SECRET_CODE_LENGTH', reason: 'count', value: 8 },
  { name: 'VSYNC_DROP_STEPS', reason: 'count', value: 2 },
  // Ratios and multipliers:
  { name: 'DEFAULT_ENRAGE_SPEED', reason: 'ratio', value: 1.5 },
  { name: 'LOOP_BULLET_SPEED_MAX', reason: 'ratio', value: 1.6 },
  { name: 'LOOP_BULLET_SPEED_STEP', reason: 'ratio', value: 0.15 },
  { name: 'MAX_BULLET_SPEED_MUL', reason: 'ratio', value: 4 },
  { name: 'MIN_BULLET_SPEED_MUL', reason: 'ratio', value: 0.25 },
  // Frame-anchored layout (moved at the R2-01 flip `72b18a1`, not part of the world port):
  { name: 'BOSS_HP_BAR_WIDTH', reason: 'frame', value: 96 },
  { name: 'DEFAULT_BOSS_Y', reason: 'frame', value: PLAYFIELD_H / 2 },
  { name: 'HUD_BOTTOM_Y', reason: 'frame', value: 348 },
  { name: 'MAX_CREDITS_LINE_LENGTH', reason: 'frame', value: 67 },
  { name: 'MAX_ENDING_LINE_LENGTH', reason: 'frame', value: 47 },
  { name: 'MAX_STORY_LINE_LENGTH', reason: 'frame', value: 47 },
  { name: 'PLAYFIELD_Y', reason: 'frame', value: 12 },
  { name: 'PREVIEW_SHIP_X', reason: 'frame', value: 380 },
  { name: 'SPAWN_Y', reason: 'frame', value: PLAYFIELD_H / 2 },
]);

/** Today's numeric barrel exports, by name (the audit never hard-codes the list). */
function numericExports(): Map<string, number> {
  const out = new Map<string, number>();
  for (const [name, value] of Object.entries(core)) {
    if (typeof value === 'number') out.set(name, value);
  }
  return out;
}

/** The world-shaped name list of the completeness audit (plan R2-02.A1 item 4). */
const WORLD_SHAPE =
  /MARGIN|RADIUS|SPEED|ACCEL|_X$|_Y$|ORBIT|LINK|WIDTH|LENGTH|RANGE|PULL|DRIFT|SPREAD|STEP|LEAD|OFFSET|SPACING|CELL/;

describe('the world-scale audit (R2-02.A1)', () => {
  it('holds the v1 values at K = 1 (the world is still v1)', () => {
    if (K !== 1) return;
    const exports = numericExports();
    for (const { name, v1 } of V1_WORLD) expect(exports.get(name), name).toBe(v1);
  });

  for (const { name, v1, unit } of V1_WORLD) {
    it(`${name} = ${unit} of its v1 ${v1} at the live scale`, () => {
      const expected = rescaleNumber(unit, v1, K === 1 ? IDENTITY_GEOMETRY : PORT_GEOMETRY);
      expect(numericExports().get(name), name).toBe(expected);
    });
  }

  for (const { name, offset } of ANCHORED) {
    it(`${name} is PLAYFIELD_W + ${offset} * WORLD_SCALE (frame anchor + world margin)`, () => {
      expect(numericExports().get(name), name).toBe(PLAYFIELD_W + offset * WORLD_SCALE);
    });
  }

  for (const { name, reason, value } of UNSCALED) {
    it(`${name} (${reason}) never scales`, () => {
      expect(numericExports().get(name), name).toBe(value);
    });
  }

  describe('the completeness audit', () => {
    const exports = numericExports();
    const classified = new Set<string>([
      ...V1_WORLD.map((e) => e.name),
      ...ANCHORED.map((e) => e.name),
      ...UNSCALED.map((e) => e.name),
    ]);

    it('every world-shaped numeric export is classified', () => {
      const missing: string[] = [];
      for (const name of exports.keys()) {
        if (WORLD_SHAPE.test(name) && !classified.has(name)) missing.push(name);
      }
      expect(missing).toEqual([]);
    });

    it('every classified name is a numeric barrel export (the tables cannot rot)', () => {
      const stale: string[] = [];
      for (const name of classified) {
        if (!exports.has(name)) stale.push(name);
      }
      expect(stale).toEqual([]);
    });

    it('classifies each name at most once', () => {
      const all = [...V1_WORLD, ...ANCHORED, ...UNSCALED].map((e) => e.name);
      expect(new Set(all).size).toBe(all.length);
    });
  });
});
