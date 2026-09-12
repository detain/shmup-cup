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
 * ahead (so its shots hit). Once in its lane it steps left / right back to x ≈ 64.
 *
 * **Power-ups.** It presses PowerUp (one tick, an edge) when the meter's cursor reaches Speed
 * (up to speed level {@link BOT_MAX_SPEED_LEVEL}), Missile or Option and the slot can be equipped;
 * it never takes Double, Laser, the Force Field or Mega Crash — the plan's "presses PowerUp when
 * the meter reaches Speed / Missile / Option".
 *
 * The bot reads the World only (never writes it), so a run replays from its recorded input.
 *
 * @module
 */
import {
  Action,
  BossState,
  BulletFlag,
  EnemyFlag,
  EnemyState,
  ItemFlag,
  LaserPhase,
  MeterSlot,
  PLAYFIELD_H,
  TerrainType,
  terrainAt,
  type World,
} from '@shmup/core';
import type { PlaytestBot } from './harness.js';

/** Playfield x the bot keeps its ship at (where the fly-in ends). */
export const BOT_X = 64;

/** Height of one lane of the danger scan, in pixels. */
export const LANE_HEIGHT = 16;

/** Lanes of the scan: centres at `LANE_HEIGHT / 2 + k · LANE_HEIGHT`, `k = 0 … LANES − 1`. */
export const LANES = Math.floor(PLAYFIELD_H / LANE_HEIGHT);

/** Ticks ahead the bullet and contact scans look. */
export const BULLET_HORIZON = 40;

/** Pixels ahead of the ship the terrain scan looks. */
export const TERRAIN_AHEAD = 56;

/** Highest speed level the bot equips (a faster 4-way ship overshoots its lanes). */
export const BOT_MAX_SPEED_LEVEL = 2;

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
 * Scans the lanes in front of the ship (see the module docs): bullets and enemy bodies are
 * followed along their current velocity (flying things ride the camera with the ship, ground
 * enemies scroll past), boss parts and laser lanes are marked for the slots they are dangerous in
 * (a laser from a few ticks before its beam grows), rock within {@link TERRAIN_AHEAD} px.
 *
 * @param world - The World.
 * @param scan - Receives the result (cleared first).
 */
export function scanLanes(world: World, scan: LaneScan): void {
  scan.centre.fill(0);
  scan.span.fill(0);
  scan.terrain.fill(0);
  scan.wall.fill(0);
  const ship = world.players[0];
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
      if (Math.abs(ex + vx * t - sx) > e.hw + 8) continue;
      mark(scan, ey + vy * t, e.hh + hurt + 5, s);
    }
  }

  const boss = world.bosses.boss;
  if (boss.state === BossState.Intro || boss.state === BossState.Fight) {
    for (let i = 0; i < boss.partCount; i++) {
      const part = boss.parts[i];
      if (!part.active || part.destroyed || !part.hurtbox) continue;
      if (Math.abs(part.x - camera.x - sx) > part.hw + 24) continue;
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
    if (sx < x0 - 8 || sx > x1 + 8) continue;
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
    for (let k = 0; k < LANES; k++) {
      const y = camera.y + laneCentre(k);
      let blocked = false;
      for (let dx = -box.hw - 3; dx <= TERRAIN_AHEAD && !blocked; dx += 4) {
        for (let dy = -box.hh - 4; dy <= box.hh + 4; dy += 3.5) {
          if (terrainAt(map, ship.x + dx, y + dy) !== TerrainType.Empty) {
            blocked = true;
            scan.terrain[k] = dx <= 16 ? TERRAIN_DANGER : TERRAIN_DANGER / 2;
            if (dx <= 8) scan.wall[k] = 1;
            break;
          }
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

/**
 * Creates a four-way playtest bot (see the module docs). Each bot keeps a little state (its
 * target lane, its last PowerUp press), so use one per run.
 *
 * @returns The bot.
 *
 * @example
 * ```ts
 * const run = runStage('zone-a', fourWayBot(), { godMode: true });
 * ```
 */
export function fourWayBot(): PlaytestBot {
  const scan = createLaneScan();
  const bonus = new Float64Array(LANES);
  const cost = new Float64Array(LANES);
  let target = -1;
  let pressed = false;

  /**
   * Whether the cursor sits on a slot the bot wants.
   *
   * @param world - The World.
   * @returns `true` to press PowerUp now.
   */
  const wantsEquip = (world: World): boolean => {
    const slot = world.powerups.meters[0].cursor;
    if (slot < 0 || !world.powerups.canEquip(0, slot)) return false;
    const ship = world.players[0];
    const loadout = world.weapons.loadouts[0];
    if (slot === MeterSlot.Speed) return ship.speedLevel < BOT_MAX_SPEED_LEVEL;
    if (slot === MeterSlot.Missile) return !loadout.missile;
    if (slot === MeterSlot.Option) return loadout.options < 4;
    return false;
  };

  return {
    name: 'four-way',
    decide(world) {
      const ship = world.players[0];
      let mask = 0;
      // PowerUp: one-tick presses (an edge), never two ticks in a row.
      if (!pressed && ship.state === 'alive' && wantsEquip(world)) {
        mask |= Action.PowerUp;
        pressed = true;
      } else {
        pressed = false;
      }
      if (ship.state !== 'alive') {
        target = -1;
        return mask;
      }
      const camera = world.camera;
      const sx = ship.x - camera.x;
      const sy = ship.y - camera.y;
      scanLanes(world, scan);
      const current = laneOf(sy);
      const speed = world.ship.speeds[ship.speedLevel] ?? 1.5;

      // Preferences: capsules ahead, the boss's core, the next enemy ahead (to shoot it).
      bonus.fill(0);
      const items = world.powerups.pool;
      const itf = items.fields;
      for (let i = 0; i < items.count; i++) {
        if ((itf.flags[i] & ItemFlag.Dead) !== 0) continue;
        const ix = itf.x[i] - camera.x;
        if (ix < sx - 6 || ix > sx + 220) continue;
        bonus[laneOf(itf.y[i] - camera.y)] += 40;
      }
      const boss = world.bosses.boss;
      if (boss.state === BossState.Fight) {
        for (let i = 0; i < boss.partCount; i++) {
          const part = boss.parts[i];
          if (!part.core || part.destroyed) continue;
          const lane = laneOf(part.y - camera.y);
          bonus[lane] += 60;
          if (lane > 0) bonus[lane - 1] += 15;
          if (lane < LANES - 1) bonus[lane + 1] += 15;
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
          if (dx < 24 || dx > 280 || dx >= nearest) continue;
          nearest = dx;
          lane = laneOf(e.y - camera.y);
        }
        if (lane >= 0) bonus[lane] += 12;
      }

      // Cost of each lane: the trip there (every lane passed through, while the ship is in it)
      // and the stay (the destination's centre from arrival on), plus terrain and preferences.
      for (let k = 0; k < LANES; k++) {
        let c = scan.terrain[k] - bonus[k] + 1.5 * Math.abs(k - current);
        c += (2 * Math.abs(laneCentre(k) - PLAYFIELD_H / 2)) / (PLAYFIELD_H / 2);
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

      const dy = laneCentre(target) - sy;
      if (Math.abs(dy) > speed * 0.5) {
        mask |= dy < 0 ? Action.Up : Action.Down;
      } else if (sx < BOT_X - speed) {
        mask |= Action.Right;
      } else if (sx > BOT_X + speed) {
        mask |= Action.Left;
      }
      return mask;
    },
  };
}
