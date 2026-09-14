/**
 * Edge cases of the M2-13 behaviours (`core/behaviors`), beyond `behaviors-zones-fg.test.ts`, on
 * variants of the shipped zone F and G rosters (free flight — a static camera —, the ship holding
 * its fire and invulnerable):
 *
 * - the tunables of all three behaviours are the documented defaults;
 * - `cell.chase`: the defaults as flown (50 ticks in along its row at 1.1 px/tick, 150 chasing at a
 *   turn cap of 6 units, then straight on with the heading it had — no jump), never firing; a
 *   `speed` of 0 or less → 1 px/tick, tick counts below 1 → one tick, `turnRate` floored (at most
 *   that many units a tick while chasing) and below 0 → no turn at all; a dividing cell's halves
 *   fly out for the child's floored `scatterTicks` before they chase;
 * - `boss.squid`: the tentacle cycle as flown (open, curling in a unit a tick, guarding, uncurling
 *   — each hold one tick longer than its timer, the sweeps ending on their last tick), `curl`
 *   rounded (2.6 → 3) and the timers floored, values below 1 → one unit / one tick; every segment
 *   of both tentacles turned alike, mirrored above and below — the tips close on the eye; a broken
 *   tentacle leaves the other's cycle exactly as it was; aimed spreads of red ovals from the eye
 *   (`ways` floored, at least 1), pink needles from the standing tips every `gunTicks`, a floored
 *   ring every time the tentacles open (each turned half a gap, none below 1), the floored `count`
 *   of its minion launched from the eye every `launchTicks` (none below 1) — a launched cell drifts
 *   in for its `enterTicks`; and — the fix of this test round — a phase straightens the arms from
 *   wherever the last one left them, however far: before, it clamped the curl to its own sweep and
 *   snapped the arms straight at the end (a 50-unit jump after a wider sweep, 42 after a facet wave
 *   had curled them away from the eye's row);
 * - `boss.facet`: the wave as flown (to 40 units in, then 80 ticks between the turn points),
 *   `wave` rounded (2.5 → 3) and `waveTicks` floored, values below 1 → a unit each way every other
 *   tick; aimed purple needles from both arm tips (`ways` floored, at least 1), rings from the core
 *   while its crystals still armour it (each turned half a gap, none below 1), detached lane lasers
 *   from the core, pointing left, as tuned, one at a time (none by default); the shipped arms
 *   carried on without a jump whenever the crystals break; and — the fix of this test round — a
 *   phase waves on from arms curled past its own sweep (before, clamped to the sweep, they jumped
 *   67 units at the first turn point);
 * - both bosses track the ship's height at their speed, never past their margins.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_BEHAVIORS, DEFAULT_BOSS_BEHAVIORS } from '../../src/behaviors/index.js';
import { BossHit, BossState, type BossPart } from '../../src/bosses/index.js';
import { BulletKind, LaserPhase } from '../../src/bullets/index.js';
import { PLAYFIELD_H, resolveGameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { EnemyState, type Enemy } from '../../src/enemies/index.js';
import { createInputSnapshot } from '../../src/input/index.js';
import { ANGLE_UNITS } from '../../src/math/index.js';
import { MoverKind } from '../../src/patterns/index.js';
import { ENGINE_SPRITES, createWorld, stepWorld, type World } from '../../src/world/index.js';

/**
 * A shipped content file.
 *
 * @param path - Path below `content/`.
 * @returns The file.
 */
function shipped(path: string): ContentFile {
  return {
    path,
    data: JSON.parse(
      readFileSync(new URL('../../../../content/' + path, import.meta.url), 'utf8'),
    ) as unknown,
  };
}

/** A boss phase as JSON. */
interface Phase {
  script: string;
  params?: Record<string, number>;
  until?: unknown;
}

/** A roster entry as JSON (only the fields the variants touch are typed). */
interface Entry {
  id: string;
  params?: Record<string, number>;
  child?: string;
  boss?: {
    code: string;
    displayName: string;
    parts: Record<string, unknown>[];
    phases: Phase[];
  };
  [key: string]: unknown;
}

/** The shipped zone F and G rosters (parsed once; the variants are deep copies). */
const ROSTER: Entry[] = [
  ...(shipped('enemies/zone-f.enemies.json').data as { enemies: Entry[] }).enemies,
  ...(shipped('enemies/zone-g.enemies.json').data as { enemies: Entry[] }).enemies,
];

/**
 * A deep copy of a shipped roster entry under a new id.
 *
 * @param base - The shipped id.
 * @param id - The variant's id.
 * @returns The copy.
 */
function copy(base: string, id: string): Entry {
  const entry = ROSTER.find((e) => e.id === base);
  if (entry === undefined) throw new Error('no ' + base);
  const out = JSON.parse(JSON.stringify(entry)) as Entry;
  out.id = id;
  return out;
}

/**
 * A variant of a shipped enemy with other tunables.
 *
 * @param base - The shipped id.
 * @param id - The variant's id.
 * @param params - Its tunables (replacing the shipped ones).
 * @param extra - Other fields to set.
 * @returns The entry.
 */
function enemy(
  base: string,
  id: string,
  params: Record<string, number>,
  extra: Partial<Entry> = {},
): Entry {
  const out = copy(base, id);
  out.params = params;
  Object.assign(out, extra);
  return out;
}

/**
 * A variant of a shipped boss with phases of its own.
 *
 * @param base - The shipped boss id.
 * @param id - The variant's id.
 * @param phases - The phases (the shipped phase 0's script when a phase has none).
 * @returns The entry.
 */
function boss(base: string, id: string, ...phases: Partial<Phase>[]): Entry {
  const out = copy(base, id);
  const data = out.boss;
  if (data === undefined) throw new Error(base + ' is no boss');
  data.code = 'V-' + id.length.toString();
  data.displayName = id.toUpperCase();
  const script = data.phases[0].script;
  data.phases = phases.map((p) => ({ script, ...p }));
  return out;
}

/** Tunables of a quiet `boss.squid` phase: held still, no spreads (nothing else by default). */
const SQUID_QUIET = { trackSpeed: 0, fireTicks: 100_000 } as const;

/** Tunables of a quiet `boss.facet` phase: held still, no needles (nothing else by default). */
const FACET_QUIET = { trackSpeed: 0, fireTicks: 100_000 } as const;

/** The test DB: the KESTREL, Type A, the shipped rosters and the variants. */
const DB: ContentDb = (() => {
  const { db, issues } = loadContent(
    [
      shipped('player/kestrel.player.json'),
      shipped('weapons/type-a.weapons.json'),
      shipped('enemies/zone-f.enemies.json'),
      shipped('enemies/zone-g.enemies.json'),
      shipped('patterns/zones.patterns.json'),
      {
        path: 'enemies/v.enemies.json',
        data: {
          formatVersion: 1,
          kind: 'enemies',
          enemies: [
            enemy('chaser-cell', 'chaser-default', {}),
            enemy('chaser-cell', 'chaser-crawl', { speed: 0, enterTicks: 0.4 }),
            enemy('chaser-cell', 'chaser-stiff', { speed: -3, turnRate: -2, enterTicks: 20.9 }),
            enemy('chaser-cell', 'chaser-agile', {
              turnRate: 5.9,
              enterTicks: 10,
              chaseTicks: 60.8,
            }),
            enemy('chaser-cell', 'chaser-brief', { enterTicks: 10, chaseTicks: 0.3 }),
            enemy('chaser-cell', 'chaser-hasty', { scatterTicks: 0.2 }),
            enemy('chaser-cell', 'chaser-slow-out', { scatterTicks: 40.9 }),
            enemy(
              'mitosis-cell',
              'mitosis-hasty',
              { speed: 0.6, count: 2, splitSpeed: 1.1, spread: 256 },
              { child: 'chaser-hasty' },
            ),
            enemy(
              'mitosis-cell',
              'mitosis-slow-out',
              { speed: 0.6, count: 2, splitSpeed: 1.1, spread: 256 },
              { child: 'chaser-slow-out' },
            ),
            boss('mantle-regent', 'squid-default', { params: { ...SQUID_QUIET } }),
            boss('mantle-regent', 'squid-probe', {
              params: {
                ...SQUID_QUIET,
                curl: 2.6,
                sweepTicks: 10.8,
                guardTicks: 20.5,
                openTicks: 30.2,
              },
            }),
            boss('mantle-regent', 'squid-floor', {
              params: {
                ...SQUID_QUIET,
                curl: 0.2,
                sweepTicks: 0.4,
                guardTicks: 0.6,
                openTicks: 0.9,
              },
            }),
            boss('mantle-regent', 'squid-ways', {
              params: { trackSpeed: 0, fireTicks: 30, ways: 2.7 },
            }),
            boss('mantle-regent', 'squid-single', {
              params: { trackSpeed: 0, fireTicks: 30, ways: 0.4 },
            }),
            boss('mantle-regent', 'squid-guns', { params: { ...SQUID_QUIET, gunTicks: 25 } }),
            boss('mantle-regent', 'squid-ring', {
              params: {
                ...SQUID_QUIET,
                ring: 8.9,
                openTicks: 20,
                sweepTicks: 5,
                guardTicks: 5,
              },
            }),
            boss('mantle-regent', 'squid-ring-low', {
              params: { ...SQUID_QUIET, ring: 0.5, openTicks: 5, sweepTicks: 5, guardTicks: 5 },
            }),
            boss('mantle-regent', 'squid-launch', {
              params: { ...SQUID_QUIET, launchTicks: 40, count: 2.7 },
            }),
            boss('mantle-regent', 'squid-no-launch', {
              params: { ...SQUID_QUIET, launchTicks: 20, count: 0.6 },
            }),
            // Guards curled in (60 units) for a long while, then a phase with a smaller sweep
            // (10 units) — the fix of this test round: the arms used to be clamped to it.
            boss(
              'mantle-regent',
              'squid-shrink',
              {
                params: { ...SQUID_QUIET, curl: 2, sweepTicks: 30, guardTicks: 500, openTicks: 10 },
                until: { ticks: 100 },
              },
              {
                params: { ...SQUID_QUIET, curl: 1, sweepTicks: 10, guardTicks: 20, openTicks: 30 },
              },
            ),
            // A facet wave (arms curled away from the core's row) handing over to a squid phase.
            boss(
              'mantle-regent',
              'squid-after-wave',
              {
                script: 'boss.facet',
                params: { ...FACET_QUIET, wave: 2, waveTicks: 30 },
                until: { ticks: 80 },
              },
              {
                params: { ...SQUID_QUIET, curl: 1, sweepTicks: 30, guardTicks: 20, openTicks: 30 },
              },
            ),
            boss('facet-monarch', 'facet-default', { params: { ...FACET_QUIET } }),
            boss('facet-monarch', 'facet-probe', {
              params: { ...FACET_QUIET, wave: 2.5, waveTicks: 10.7 },
            }),
            boss('facet-monarch', 'facet-floor', {
              params: { ...FACET_QUIET, wave: 0.3, waveTicks: 0.2 },
            }),
            boss('facet-monarch', 'facet-needles', {
              params: { trackSpeed: 0, fireTicks: 30, ways: 2.7, spread: 32 },
            }),
            boss('facet-monarch', 'facet-needle', {
              params: { trackSpeed: 0, fireTicks: 30, ways: 0.5 },
            }),
            boss('facet-monarch', 'facet-ring', {
              params: { ...FACET_QUIET, ring: 8.7, ringTicks: 30 },
            }),
            boss('facet-monarch', 'facet-ring-low', {
              params: { ...FACET_QUIET, ring: 0.9, ringTicks: 10 },
            }),
            boss('facet-monarch', 'facet-lanes', {
              params: {
                ...FACET_QUIET,
                laserTicks: 60,
                laserLength: 200,
                laserWidth: 6,
                telegraph: 5,
                active: 5,
              },
            }),
            // A wide wave (80 units) handing over to a narrow one (10) — the fix of this test
            // round: the arms used to be clamped to the new sweep.
            boss(
              'facet-monarch',
              'facet-shrink',
              { params: { ...FACET_QUIET, wave: 2, waveTicks: 40 }, until: { ticks: 38 } },
              { params: { ...FACET_QUIET, wave: 1, waveTicks: 10 } },
            ),
          ],
        },
      },
    ],
    { extraSprites: ENGINE_SPRITES },
  );
  expect(issues).toEqual([]);
  return db;
})();

/**
 * A free-flight world, the ship holding fire and invulnerable.
 *
 * @returns The world.
 */
function world(): World {
  const w = createWorld(resolveGameConfig({ seed: 13, autofire: false, remoteMode: false }), DB);
  w.debugFlags.godMode = true;
  return w;
}

/**
 * Steps a world with no input, events dropped.
 *
 * @param w - The world.
 * @param ticks - Ticks.
 */
function run(w: World, ticks: number): void {
  const input = createInputSnapshot();
  for (let i = 0; i < ticks; i++) {
    stepWorld(w, input);
    w.events.clear();
  }
}

/**
 * An enemy index by id.
 *
 * @param id - Enemy id.
 * @returns The index.
 */
function indexOf(id: string): number {
  const index = DB.enemyIndex.get(id);
  if (index === undefined) throw new Error('no ' + id);
  return index;
}

/**
 * Spawns an enemy.
 *
 * @param w - The world.
 * @param id - Enemy id.
 * @param x - World x.
 * @param y - World y.
 * @returns The enemy.
 */
function spawn(w: World, id: string, x: number, y: number): Enemy {
  const e = w.enemies.spawn(indexOf(id), x, y);
  if (e === null) throw new Error('could not spawn ' + id);
  return e;
}

/**
 * The live enemies of an id.
 *
 * @param w - The world.
 * @param id - Enemy id.
 * @returns Them, in slot order.
 */
function live(w: World, id: string): Enemy[] {
  const index = indexOf(id);
  return w.enemies.enemies.filter((e) => e.state === EnemyState.Live && e.specIndex === index);
}

/**
 * A free-flight world with a boss started and fighting.
 *
 * @param id - The boss's enemy id.
 * @returns The world.
 */
function fighting(id: string): World {
  const w = world();
  expect(w.bosses.startBoss(indexOf(id))).toBe(true);
  for (let i = 0; i < 400 && w.bosses.boss.state !== BossState.Fight; i++) run(w, 1);
  expect(w.bosses.boss.state).toBe(BossState.Fight);
  return w;
}

/**
 * A boss part's index by name.
 *
 * @param w - The world.
 * @param name - Part name.
 * @returns Its index.
 */
function part(w: World, name: string): number {
  const b = w.bosses.boss;
  const index = b.parts.findIndex((p, i) => i < b.partCount && p.name === name);
  expect(index, name).toBeGreaterThanOrEqual(0);
  return index;
}

/**
 * A part's own turn as a signed number of binary units in `[-512, 512)`.
 *
 * @param p - The part.
 * @returns The turn.
 */
function turn(p: BossPart): number {
  const a = Math.round(p.angle) % ANGLE_UNITS;
  return a >= ANGLE_UNITS / 2 ? a - ANGLE_UNITS : a;
}

/**
 * A mover label of an enemy for timelines: `S` straight, `H<turn>` homing, `-` anything else.
 *
 * @param e - The enemy.
 * @returns The label.
 */
function moverOf(e: Enemy): string {
  if (e.mover === MoverKind.Straight) return 'S';
  if (e.mover === MoverKind.Homing) return 'H' + e.m1.toString();
  return '-';
}

/**
 * Runs a world and records the runs of equal labels, e.g. `['S×50', 'H6×150']`.
 *
 * @param w - The world.
 * @param ticks - Ticks.
 * @param label - The label of a tick (read after it).
 * @returns The runs.
 */
function timeline(w: World, ticks: number, label: () => string): string[] {
  const out: string[] = [];
  let last = '';
  let n = 0;
  for (let t = 0; t < ticks; t++) {
    run(w, 1);
    const now = label();
    if (now !== last && n > 0) {
      out.push(last + '×' + n.toString());
      n = 0;
    }
    last = now;
    n++;
  }
  out.push(last + '×' + n.toString());
  return out;
}

/**
 * Counts the live enemy bullets of a kind.
 *
 * @param w - The world.
 * @param kind - `BulletKind`.
 * @param maxAge - Only bullets at most this old (default: any).
 * @returns The count.
 */
function bullets(w: World, kind: number, maxAge = Number.POSITIVE_INFINITY): number {
  const pool = w.bullets.pool;
  const f = pool.fields;
  let n = 0;
  for (let i = 0; i < pool.count; i++) if (f.kind[i] === kind && f.age[i] <= maxAge) n++;
  return n;
}

/**
 * The headings of the fresh (age ≤ 1) bullets of a kind, whole units in `[0, 1024)`, sorted.
 *
 * @param w - The world.
 * @param kind - `BulletKind`.
 * @returns The headings.
 */
function freshAngles(w: World, kind: number): number[] {
  const pool = w.bullets.pool;
  const f = pool.fields;
  const out: number[] = [];
  for (let i = 0; i < pool.count; i++) {
    if (f.kind[i] === kind && f.age[i] <= 1) {
      out.push(((Math.round(f.angle[i]) % ANGLE_UNITS) + ANGLE_UNITS) % ANGLE_UNITS);
    }
  }
  return out.sort((a, b) => a - b);
}

/**
 * The arm segments of a boss (circle-hit parts attached to another part), by side: the top arms
 * (their root hangs above its parent) and the bottom arms.
 *
 * @param w - The world.
 * @returns The two lists of parts.
 */
function arms(w: World): { top: BossPart[]; bottom: BossPart[] } {
  const b = w.bosses.boss;
  const parts = b.parts.slice(0, b.partCount);
  const top: BossPart[] = [];
  const bottom: BossPart[] = [];
  for (const p of parts) {
    if (p.radius <= 0 || p.parent < 0) continue;
    let root = p;
    while (root.parent >= 0 && parts[root.parent].radius > 0) root = parts[root.parent];
    (root.restY < 0 ? top : bottom).push(p);
  }
  return { top, bottom };
}

/**
 * The curl of an arm segment towards its side (`turn` × −1 above, × 1 below).
 *
 * @param w - The world.
 * @param p - The segment.
 * @returns Binary units.
 */
function curlOf(w: World, p: BossPart): number {
  return arms(w).top.includes(p) ? -turn(p) : turn(p);
}

/**
 * Records the curl of a boss's first standing arm segment every tick, checking on every tick that
 * every standing segment of both arms has the same curl — the top arm's turn mirrored below.
 *
 * @param w - The world (fighting).
 * @param ticks - Ticks.
 * @returns The curls, one per tick.
 */
function curls(w: World, ticks: number): number[] {
  const { top, bottom } = arms(w);
  const out: number[] = [];
  for (let t = 0; t < ticks; t++) {
    run(w, 1);
    const standing = [...top, ...bottom].filter((p) => !p.destroyed);
    const c = curlOf(w, standing[0]);
    for (const p of top) if (!p.destroyed) expect(turn(p) + c, p.name).toBe(0);
    for (const p of bottom) if (!p.destroyed) expect(turn(p) - c, p.name).toBe(0);
    out.push(c === 0 ? 0 : c); // no −0
  }
  return out;
}

/**
 * Collapses a series into runs of equal values, e.g. `[0, 0, 1]` → `['0×2', '1×1']`.
 *
 * @param values - The series.
 * @returns The runs.
 */
function runs(values: readonly number[]): string[] {
  const out: string[] = [];
  let n = 0;
  for (let i = 0; i < values.length; i++) {
    n++;
    if (i === values.length - 1 || values[i + 1] !== values[i]) {
      out.push(String(values[i]) + '×' + String(n));
      n = 0;
    }
  }
  return out;
}

/**
 * The biggest change between two neighbours of a series.
 *
 * @param values - The series.
 * @returns The largest absolute step.
 */
function biggestStep(values: readonly number[]): number {
  let most = 0;
  for (let i = 1; i < values.length; i++)
    most = Math.max(most, Math.abs(values[i] - values[i - 1]));
  return most;
}

describe('core/behaviors — zones F and G, edge cases (M2-13)', () => {
  it('has the documented default tunables', () => {
    expect(DEFAULT_BEHAVIORS.get('cell.chase')?.params).toEqual({
      speed: 1.1,
      enterTicks: 50,
      turnRate: 6,
      chaseTicks: 150,
      scatterTicks: 24,
    });
    expect(DEFAULT_BOSS_BEHAVIORS.get('boss.squid')?.params).toEqual({
      trackSpeed: 0.35,
      margin: 48,
      curl: 1,
      sweepTicks: 48,
      guardTicks: 60,
      openTicks: 100,
      fireTicks: 70,
      ways: 3,
      spread: 40,
      bulletSpeed: 1.3,
      gunTicks: 0,
      ring: 0,
      ringSpeed: 1,
      launchTicks: 0,
      count: 1,
    });
    expect(DEFAULT_BOSS_BEHAVIORS.get('boss.facet')?.params).toEqual({
      trackSpeed: 0.3,
      margin: 50,
      wave: 1,
      waveTicks: 40,
      fireTicks: 90,
      ways: 1,
      spread: 32,
      bulletSpeed: 1.25,
      ring: 0,
      ringTicks: 150,
      ringSpeed: 1,
      laserTicks: 0,
      laserLength: 384,
      laserWidth: 6,
      telegraph: 50,
      active: 40,
    });
  });
});

describe('core/behaviors cell.chase — edge cases (M2-13)', () => {
  it('flies the defaults: 50 ticks in at 1.1, 150 chasing at 6 units, then straight on — never firing', () => {
    const w = world();
    const cell = spawn(w, 'chaser-default', w.camera.x + 360, 40);
    let vx = 0;
    let heading = -1;
    const out = timeline(w, 260, () => {
      if (cell.mover === MoverKind.Straight) vx = cell.vx;
      // The heading carries over from the chase into the straight run (no jump).
      if (cell.mover === MoverKind.Homing && cell.m1 === 0 && heading < 0) heading = cell.s0;
      return moverOf(cell);
    });
    expect(out).toEqual(['S×50', 'H6×150', 'H0×60']);
    expect(vx).toBeCloseTo(-1.1, 9);
    expect(cell.m0).toBeCloseTo(1.1, 9);
    expect(Math.hypot(cell.vx, cell.vy)).toBeCloseTo(1.1, 3);
    expect(cell.s0).toBe(heading);
    expect(w.bullets.count).toBe(0);
  });

  it('turns a speed of 0 or less into 1 px/tick and ticks below 1 into one tick', () => {
    const w = world();
    const cell = spawn(w, 'chaser-crawl', w.camera.x + 360, 40);
    expect(timeline(w, 200, () => moverOf(cell))).toEqual(['S×1', 'H6×150', 'H0×49']);
    expect(cell.m0).toBe(1);
    const stiff = world();
    const other = spawn(stiff, 'chaser-stiff', stiff.camera.x + 360, 40);
    let vx = 0;
    const out = timeline(stiff, 200, () => {
      if (other.mover === MoverKind.Straight) vx = other.vx;
      return moverOf(other);
    });
    // speed −3 → 1 px/tick; enterTicks 20.9 → 20; turnRate −2 → 0.
    expect(vx).toBe(-1);
    expect(out).toEqual(['S×20', 'H0×180']);
  });

  it('never turns with a turn rate below 0: it keeps its row', () => {
    const w = world();
    const cell = spawn(w, 'chaser-stiff', w.camera.x + 360, 40);
    const y = cell.y;
    for (let t = 0; t < 200; t++) {
      run(w, 1);
      expect(cell.y).toBeCloseTo(y, 9);
    }
    expect(cell.s0).toBe(ANGLE_UNITS / 2);
  });

  it('floors the turn rate and the chase ticks, turning at most that far a tick while it chases', () => {
    const w = world();
    const cell = spawn(w, 'chaser-agile', w.camera.x + 360, 20);
    let last = -1;
    let most = 0;
    const out = timeline(w, 120, () => {
      if (cell.mover === MoverKind.Homing && cell.m1 > 0) {
        if (last >= 0) {
          const step = Math.abs(((cell.s0 - last + 1.5 * ANGLE_UNITS) % ANGLE_UNITS) - 512);
          most = Math.max(most, step);
        }
        last = cell.s0;
      }
      return moverOf(cell);
    });
    // turnRate 5.9 → 5, chaseTicks 60.8 → 60.
    expect(out).toEqual(['S×10', 'H5×60', 'H0×50']);
    expect(most).toBe(5); // the ship is far below: it turns at the cap
  });

  it('chases one tick with chaseTicks below 1', () => {
    const w = world();
    const cell = spawn(w, 'chaser-brief', w.camera.x + 360, 40);
    expect(timeline(w, 40, () => moverOf(cell))).toEqual(['S×10', 'H6×1', 'H0×29']);
  });

  it.each([
    ['mitosis-hasty', 'chaser-hasty', 1],
    ['mitosis-slow-out', 'chaser-slow-out', 40],
  ])(
    '%s: the halves fly out straight for the child’s floored scatterTicks (%s), then chase',
    (parent, child, out) => {
      const w = world();
      const cell = spawn(w, parent, w.camera.x + 250, 100);
      run(w, 40);
      w.enemies.kill(cell, 0);
      run(w, 1);
      const halves = live(w, child);
      expect(halves).toHaveLength(2);
      // Both halves together: straight (thrown out, not the 50 ticks of drifting in), then chasing.
      const both = timeline(w, 80, () => halves.map(moverOf).join(','));
      expect(both[0]).toBe('S,S×' + String(out));
      expect(both[1]).toMatch(/^H6,H6×\d+$/);
    },
  );
});

describe('core/behaviors boss.squid — edge cases (M2-13)', () => {
  it('cycles the defaults: 100 straight, 48 curling in at 1 unit, 60 guarding, 48 uncurling', () => {
    const w = fighting('squid-default');
    const c = curls(w, 520);
    // The fight's first tick opened them (already straight); a sweep reaches its end on its last
    // tick, where the next state begins (so a hold shows one tick longer than its timer).
    expect(runs(c).slice(0, 3)).toEqual(['0×99', '1×1', '2×1']);
    expect(Math.max(...c)).toBe(48);
    expect(Math.min(...c)).toBe(0);
    expect(biggestStep(c)).toBe(1);
    const holds = runs(c).filter((r) => r.startsWith('48×') || r.startsWith('0×'));
    expect(holds).toEqual(['0×99', '48×61', '0×101', '48×61', '0×10']);
  });

  it('rounds curl (2.6 → 3) and floors the timers: 30 open, 10 sweeping to 30 units, 20 guarding', () => {
    const w = fighting('squid-probe');
    const c = curls(w, 140);
    expect(Math.max(...c)).toBe(30);
    expect(biggestStep(c)).toBe(3);
    expect(runs(c)).toEqual([
      '0×29',
      ...[3, 6, 9, 12, 15, 18, 21, 24, 27].map((v) => String(v) + '×1'),
      '30×21',
      ...[27, 24, 21, 18, 15, 12, 9, 6, 3].map((v) => String(v) + '×1'),
      '0×31',
      ...[3, 6, 9, 12, 15, 18, 21, 24, 27].map((v) => String(v) + '×1'),
      '30×21',
      ...[27, 24, 21, 18, 15, 12, 9, 6, 3].map((v) => String(v) + '×1'),
      '0×2',
    ]);
  });

  it('turns curl and timers below 1 into one unit and one tick: a 4-tick cycle', () => {
    const w = fighting('squid-floor');
    const c = curls(w, 40);
    // 1 open + 1 sweep + 1 guard + 1 sweep (the first open was the fight's first tick): two
    // ticks curled, two straight.
    expect(runs(c)).toEqual(Array.from({ length: 20 }, (_v, k) => (k % 2 === 0 ? '1×2' : '0×2')));
  });

  it('curls the top tentacle counter-clockwise and the bottom one clockwise: the tips close on the eye', () => {
    const w = fighting('squid-default');
    const parts = w.bosses.boss.parts;
    const eye = parts[part(w, 'eye')];
    const top = parts[part(w, 'tip-top')];
    const bottom = parts[part(w, 'tip-bottom')];
    const open = [top.y - eye.y, bottom.y - eye.y];
    run(w, 99 + 48);
    expect(parts[part(w, 'seg-top-1')].angle).toBe(ANGLE_UNITS - 48);
    expect(parts[part(w, 'seg-bottom-1')].angle).toBe(48);
    expect(top.y - eye.y).toBeGreaterThan(open[0] + 8);
    expect(bottom.y - eye.y).toBeLessThan(open[1] - 8);
    // Mirrored about the eye's row.
    expect(top.y - eye.y).toBeCloseTo(-(bottom.y - eye.y), 6);
    expect(top.x).toBeCloseTo(bottom.x, 6);
  });

  it('keeps the other tentacle’s cycle as it was when one breaks', () => {
    const broken = fighting('squid-default');
    const whole = fighting('squid-default');
    const tip = (w: World): BossPart => w.bosses.boss.parts[part(w, 'seg-bottom-2')];
    run(broken, 120);
    run(whole, 120);
    expect(broken.bosses.damagePart(part(broken, 'root-top'), 999, 0)).toBe(BossHit.Destroyed);
    for (let t = 0; t < 300; t++) {
      run(broken, 1);
      run(whole, 1);
      expect(tip(broken).angle, `tick ${String(t)}`).toBe(tip(whole).angle);
    }
    // The broken arm's segments stay where they fell and turn no more.
    for (const name of ['seg-top-1', 'seg-top-2', 'seg-top-3', 'tip-top']) {
      expect(broken.bosses.boss.parts[part(broken, name)].destroyed, name).toBe(true);
    }
  });

  it.each([
    ['squid-ways', 2],
    ['squid-single', 1],
  ])(
    '%s: aimed spreads of red ovals from the eye every fireTicks — ways floored (%i)',
    (id, ways) => {
      const w = fighting(id);
      run(w, 25);
      expect(bullets(w, BulletKind.OvalRed)).toBe(0);
      run(w, 10);
      expect(bullets(w, BulletKind.OvalRed)).toBe(ways);
      run(w, 30);
      expect(bullets(w, BulletKind.OvalRed)).toBe(2 * ways);
      expect(bullets(w, BulletKind.NeedlePink)).toBe(0);
      expect(bullets(w, BulletKind.RoundPurple)).toBe(0);
    },
  );

  it('lashes a pink needle from each standing tentacle tip every gunTicks', () => {
    const w = fighting('squid-guns');
    run(w, 20);
    expect(bullets(w, BulletKind.NeedlePink)).toBe(0);
    run(w, 10);
    expect(bullets(w, BulletKind.NeedlePink)).toBe(2);
    // One tentacle broken: one tip left.
    expect(w.bosses.damagePart(part(w, 'root-bottom'), 999, 0)).toBe(BossHit.Destroyed);
    run(w, 25);
    expect(bullets(w, BulletKind.NeedlePink, 25)).toBe(1);
    expect(bullets(w, BulletKind.OvalRed)).toBe(0);
  });

  it('bursts a floored ring from the eye every time the tentacles open, each turned half a gap', () => {
    const w = fighting('squid-ring');
    const gap = ANGLE_UNITS / 8;
    const rings: number[][] = [];
    // The first ring came as the fight began (the tentacles start opening); watch the next ones.
    for (let t = 0; t < 200 && rings.length < 3; t++) {
      run(w, 1);
      const fresh = freshAngles(w, BulletKind.RoundPurple);
      if (fresh.length > 0) {
        rings.push(fresh);
        expect(curlOf(w, arms(w).top[0])).toBe(0); // as they open
        run(w, 2);
      }
    }
    expect(rings).toEqual([
      Array.from({ length: 8 }, (_v, k) => k * gap + gap / 2),
      Array.from({ length: 8 }, (_v, k) => k * gap),
      Array.from({ length: 8 }, (_v, k) => k * gap + gap / 2),
    ]);
    const low = fighting('squid-ring-low');
    run(low, 200);
    expect(low.bullets.count).toBe(0);
  });

  it('launches the floored count of its minion from the eye every launchTicks — none below 1', () => {
    const w = fighting('squid-launch');
    const eye = w.bosses.boss.parts[part(w, 'eye')];
    const launches: number[] = [];
    let first: Enemy | null = null;
    for (let t = 1; t <= 130; t++) {
      run(w, 1);
      for (const e of live(w, 'chaser-cell')) {
        if (e.age !== 1) continue;
        launches.push(t);
        first ??= e;
        expect(Math.abs(e.x - eye.x)).toBeLessThan(3);
        expect(Math.abs(e.y - eye.y)).toBeLessThan(3);
      }
    }
    // count 2.7 → 2 at each launch; 40 ticks apart.
    expect(launches).toHaveLength(6);
    expect(launches[0]).toBe(launches[1]);
    expect(launches[2] - launches[0]).toBe(40);
    expect(launches[4] - launches[2]).toBe(40);
    // A launched cell drifts in from the eye (the chasing cell's 46 ticks), not thrown out.
    expect(first).not.toBeNull();
    const none = fighting('squid-no-launch');
    run(none, 200);
    expect(live(none, 'chaser-cell')).toHaveLength(0);
  });

  it('flies a launched cell in from the eye for its enterTicks before it chases', () => {
    const w = fighting('squid-launch');
    let cell: Enemy | null = null;
    for (let t = 0; t < 60 && cell === null; t++) {
      run(w, 1);
      cell = live(w, 'chaser-cell')[0] ?? null;
    }
    expect(cell).not.toBeNull();
    if (cell === null) return;
    const c = cell;
    // The shipped chasing cell's 46 ticks of drifting in (not the 24 of a thrown-out half).
    expect(timeline(w, 60, () => moverOf(c))).toEqual(['S×46', 'H5×14']);
  });

  it('uncurls from wherever the last phase left the tentacles, however far — the fix of this test round', () => {
    // Phase 0 curls 60 units in (2 a tick); phase 1 sweeps only 10 (1 a tick). Before the fix the
    // phase clamped the curl to its own sweep: it uncurled 10 ticks from 60 and then snapped the
    // arms straight — a 50-unit jump.
    const w = fighting('squid-shrink');
    const c = curls(w, 260);
    expect(Math.max(...c)).toBe(60);
    expect(biggestStep(c)).toBeLessThanOrEqual(2);
    expect(w.bosses.boss.phase).toBe(1);
    // Straight again, then the new 10-unit cycle.
    expect(c.slice(-100)).toContain(0);
    expect(Math.max(...c.slice(-80))).toBe(10);
  });

  it('curls back in from arms a facet phase left curled away, without a jump — the fix of this test round', () => {
    const w = fighting('squid-after-wave');
    const c = curls(w, 240);
    expect(Math.min(...c)).toBeLessThan(-30); // the wave curled them away from the eye's row
    expect(w.bosses.boss.phase).toBe(1);
    expect(biggestStep(c)).toBeLessThanOrEqual(2);
    // Straight again, then the squid's own 30-unit cycle.
    expect(c.slice(100)).toContain(0);
    expect(Math.max(...c.slice(100))).toBe(30);
  });
});

describe('core/behaviors boss.facet — edge cases (M2-13)', () => {
  it('waves the defaults: 40 ticks from straight to 40 units in, then 80 to 40 out and back', () => {
    const w = fighting('facet-default');
    const c = curls(w, 400);
    expect(Math.max(...c)).toBe(40);
    expect(Math.min(...c)).toBe(-40);
    expect(biggestStep(c)).toBe(1);
    // The turn points 80 ticks apart.
    const turns: number[] = [];
    for (let t = 1; t < c.length - 1; t++) {
      if (Math.abs(c[t]) === 40 && c[t - 1] !== c[t]) turns.push(t);
    }
    expect(turns.length).toBeGreaterThanOrEqual(4);
    for (let k = 1; k < turns.length; k++) expect(turns[k] - turns[k - 1]).toBe(80);
    expect(c[turns[0]]).toBe(40); // in first
  });

  it('rounds wave (2.5 → 3) and floors waveTicks (10.7 → 10): 30 units each way, 20 ticks apart', () => {
    const w = fighting('facet-probe');
    const c = curls(w, 200);
    expect(Math.max(...c)).toBe(30);
    expect(Math.min(...c)).toBe(-30);
    expect(biggestStep(c)).toBe(3);
    const peaks = c.flatMap((v, t) => (Math.abs(v) === 30 && c[t - 1] !== v ? [t] : []));
    for (let k = 1; k < peaks.length; k++) expect(peaks[k] - peaks[k - 1]).toBe(20);
  });

  it('turns wave and waveTicks below 1 into one unit and one tick: the arms flick 1 unit each way', () => {
    const w = fighting('facet-floor');
    const c = curls(w, 40);
    // Straight → 1 in → through straight → 1 out → …: a turn point every 2 ticks.
    expect(new Set(c)).toEqual(new Set([1, 0, -1]));
    expect(biggestStep(c)).toBe(1);
    expect(runs(c).every((r) => r.endsWith('×1'))).toBe(true);
  });

  it.each([
    ['facet-needles', 2],
    ['facet-needle', 1],
  ])(
    '%s: aimed purple needles from both arm tips — ways floored, at least 1 (%i each)',
    (id, ways) => {
      const w = fighting(id);
      run(w, 25);
      expect(bullets(w, BulletKind.NeedlePurple)).toBe(0);
      run(w, 10);
      expect(bullets(w, BulletKind.NeedlePurple)).toBe(2 * ways);
      run(w, 30);
      expect(bullets(w, BulletKind.NeedlePurple, 30)).toBe(2 * ways);
      expect(bullets(w, BulletKind.RoundRed)).toBe(0);
    },
  );

  it('rings from the armoured core behind its crystals, each turned half a gap — none below 1', () => {
    const w = fighting('facet-ring');
    const gap = ANGLE_UNITS / 8;
    // The crystals stand: the core clinks — and fires.
    expect(w.bosses.damagePart(part(w, 'core'), 1, 0)).toBe(BossHit.Clink);
    const rings: number[][] = [];
    for (let t = 0; t < 120 && rings.length < 3; t++) {
      run(w, 1);
      const fresh = freshAngles(w, BulletKind.RoundRed);
      if (fresh.length > 0) {
        rings.push(fresh);
        run(w, 2);
      }
    }
    expect(rings).toEqual([
      Array.from({ length: 8 }, (_v, k) => k * gap),
      Array.from({ length: 8 }, (_v, k) => k * gap + gap / 2),
      Array.from({ length: 8 }, (_v, k) => k * gap),
    ]);
    const low = fighting('facet-ring-low');
    run(low, 120);
    expect(low.bullets.count).toBe(0);
  });

  it('fires detached lane lasers from the core, to the left, as tuned — one at a time; none by default', () => {
    const w = fighting('facet-lanes');
    const core = w.bosses.boss.parts[part(w, 'core')];
    const lasers = w.bullets.lasers;
    const lf = lasers.fields;
    const starts: number[] = [];
    for (let t = 1; t <= 200; t++) {
      run(w, 1);
      expect(lasers.count).toBeLessThanOrEqual(1);
      for (let i = 0; i < lasers.count; i++) {
        if (lf.phase[i] !== LaserPhase.Telegraph || lf.ticks[i] > 1) continue;
        if (starts.includes(t - lf.ticks[i])) continue;
        starts.push(t - lf.ticks[i]);
        expect(lf.angle[i]).toBe(ANGLE_UNITS / 2);
        expect([lf.length[i], lf.width[i], lf.telegraph[i], lf.active[i]]).toEqual([200, 6, 5, 5]);
        expect(lf.src[i]).toBe(-1); // left where it was fired
        expect(Math.abs(lf.x[i] - core.x)).toBeLessThan(2);
        expect(Math.abs(lf.y[i] - core.y)).toBeLessThan(2);
      }
    }
    expect(starts.length).toBe(3);
    expect(starts[1] - starts[0]).toBe(60);
    expect(starts[2] - starts[1]).toBe(60);
    const quiet = fighting('facet-default');
    run(quiet, 300);
    expect(quiet.bullets.lasers.count).toBe(0);
    expect(quiet.bullets.count).toBe(0);
  });

  it('carries the shipped arms on through a phase change without a jump, whenever the crystals break', () => {
    for (const wait of [0, 17, 56, 90, 133]) {
      const w = fighting('facet-monarch');
      run(w, wait);
      const { top } = arms(w);
      let last = turn(top[0]);
      w.bosses.damagePart(part(w, 'crystal-top'), 999, 0);
      w.bosses.damagePart(part(w, 'crystal-bottom'), 999, 0);
      let most = 0;
      for (let t = 0; t < 120; t++) {
        run(w, 1);
        most = Math.max(most, Math.abs(turn(top[0]) - last));
        last = turn(top[0]);
      }
      expect(w.bosses.boss.phase, `after ${String(wait)}`).toBe(1);
      expect(most, `after ${String(wait)}`).toBeLessThanOrEqual(2); // phase 1 waves 2 a tick
    }
  });

  it('waves on from arms curled past the new sweep, without a jump — the fix of this test round', () => {
    // Phase 0 reaches 76 units in (2 a tick) when phase 1 (10 units, 1 a tick) takes over. Before
    // the fix the phase clamped the curl to its sweep: it went 20 ticks down from 76 and then
    // snapped the arms to −10 — a 46-unit jump.
    const w = fighting('facet-shrink');
    const c = curls(w, 300);
    expect(Math.max(...c)).toBeGreaterThanOrEqual(74);
    expect(w.bosses.boss.phase).toBe(1);
    expect(biggestStep(c)).toBeLessThanOrEqual(2);
    expect(Math.max(...c.slice(-100))).toBe(10);
    expect(Math.min(...c.slice(-100))).toBe(-10);
  });
});

describe('core/behaviors boss.squid / boss.facet — tracking (M2-13)', () => {
  it.each([
    ['mantle-regent', 48, 0.3],
    ['facet-monarch', 50, 0.3],
  ])(
    '%s tracks the ship’s height at its speed, never past its margin (%i)',
    (id, margin, speed) => {
      const w = fighting(id);
      const b = w.bosses.boss;
      const ship = w.players[0];
      for (const shipY of [4, PLAYFIELD_H - 4, PLAYFIELD_H / 2 - 9]) {
        for (let t = 0; t < 400; t++) {
          ship.y = w.camera.y + shipY;
          const y = b.screenY;
          run(w, 1);
          expect(Math.abs(b.screenY - y)).toBeLessThanOrEqual(speed + 1e-9);
          expect(b.screenY).toBeGreaterThanOrEqual(margin - 1e-9);
          expect(b.screenY).toBeLessThanOrEqual(PLAYFIELD_H - margin + 1e-9);
        }
      }
      expect(b.phase).toBe(0);
    },
  );
});
