/**
 * Edge cases of the M2-12 behaviours (`core/behaviors`), beyond `behaviors-zones-de.test.ts`, on
 * variants of the shipped zone D and E rosters (free flight — a static camera — unless a test
 * needs a scrolling one, the ship holding its fire and invulnerable):
 *
 * - the tunables of all three behaviours are the documented defaults;
 * - `rear.swoop`: the defaults as flown (in at 1.6 px/tick to view x 280, an 18-tick hold, away at
 *   1.4), `ways` floored (0 = no shot, 2.7 → 2 needles), a hold below 1 → one tick, a speed of 0 →
 *   1 px/tick, the shot timed on a scrolling camera too, and — the fix of this test round — one
 *   spawned **right of** its turn point flies back to it and still fires half-way through its
 *   hold (the wake used to be timed as if it were there already: the shot fell inside the enemy's
 *   settle time and was dropped);
 * - `boss.bastion`: `spin` rounded to whole units (4.6 → 5, −0.4 → still), set only on the parts
 *   attached to a core (the hub — the arm segments ride it, the hull's emitters never turn),
 *   reversing every whole `reverseTicks`, the arms keeping their angle through a phase change;
 *   lane lasers attached to the emitter that fires them, pointing left, as tuned, from the
 *   standing emitters in turn, none once both are gone, a `firstLaser` below 1 → one tick; aimed
 *   spreads from the core (`ways` floored, 0 = none); rings alternating by half a gap (below 1 =
 *   none); tracking within its margins at its speed;
 * - `boss.steed`: the bob stays on its ellipse and starts from its home without a jump, a
 *   `bobSpeed` of 0 holds it; a phase change moves it at most the change of the ellipse's radii;
 *   chest timers below 1 toggle it every tick, the first mini 10 ticks after the chest opens (an
 *   opening of 10 ticks launches none, 11 one), `minis` floored per opening at `launchTicks`
 *   apart, the minis spawn at the chest and home like the shipped `steed-foal`; the snout's
 *   spreads (`ways` below 1 → a single shot, floored), rings from the snout only as the chest
 *   shuts, alternating by half a gap, none from a destroyed snout; the lids gape floored `gape`
 *   px (0 = never), and every phase starts shut with the lids at rest.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_BEHAVIORS, DEFAULT_BOSS_BEHAVIORS } from '../../src/behaviors/index.js';
import { BossHit, BossState } from '../../src/bosses/index.js';
import { BulletKind, LaserPhase } from '../../src/bullets/index.js';
import { PLAYFIELD_H, resolveGameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { EnemyFlag, EnemyState, type Enemy } from '../../src/enemies/index.js';
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

/** A roster entry as JSON (only the fields the variants touch are typed). */
interface Entry {
  id: string;
  params?: Record<string, number>;
  boss?: {
    code: string;
    displayName: string;
    parts: Record<string, unknown>[];
    phases: { script: string; params?: Record<string, number>; until?: unknown }[];
  };
  [key: string]: unknown;
}

/** The shipped zone D and E rosters (parsed once; the variants are deep copies). */
const ROSTER: Entry[] = [
  ...(shipped('enemies/zone-d.enemies.json').data as { enemies: Entry[] }).enemies,
  ...(shipped('enemies/zone-e.enemies.json').data as { enemies: Entry[] }).enemies,
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
 * @returns The entry.
 */
function enemy(base: string, id: string, params: Record<string, number>): Entry {
  const out = copy(base, id);
  out.params = params;
  return out;
}

/**
 * A variant of a shipped boss with one phase of its own script.
 *
 * @param base - The shipped boss id.
 * @param id - The variant's id.
 * @param params - The phase's tunables.
 * @returns The entry.
 */
function boss(base: string, id: string, params: Record<string, number>): Entry {
  const out = copy(base, id);
  const data = out.boss;
  if (data === undefined) throw new Error(base + ' is no boss');
  data.code = 'V-' + id.length.toString();
  data.displayName = id.toUpperCase();
  data.phases = [{ script: data.phases[0].script, params }];
  return out;
}

/** Tunables of a quiet `boss.bastion` phase: held still, no lane for a long while, no bullets. */
const BASTION_QUIET = { trackSpeed: 0, laserTicks: 100_000, firstLaser: 100_000 } as const;

/** Tunables of a quiet `boss.steed` phase: held still, the chest shut, no shots, no minis. */
const STEED_QUIET = { bobSpeed: 0, closedTicks: 100_000, fireTicks: 100_000, minis: 0 } as const;

/** The test DB: the KESTREL, Type A, the shipped rosters, the variants and a scrolling stage. */
const DB: ContentDb = (() => {
  const { db, issues } = loadContent(
    [
      shipped('player/kestrel.player.json'),
      shipped('weapons/type-a.weapons.json'),
      shipped('enemies/zone-d.enemies.json'),
      shipped('enemies/zone-e.enemies.json'),
      shipped('patterns/zones.patterns.json'),
      {
        path: 'enemies/v.enemies.json',
        data: {
          formatVersion: 1,
          kind: 'enemies',
          enemies: [
            enemy('squall-jumper', 'jumper-default', {}),
            enemy('squall-jumper', 'jumper-quiet', { ways: 0 }),
            enemy('squall-jumper', 'jumper-volley', { ways: 2.7, spread: 40 }),
            enemy('squall-jumper', 'jumper-brief', { speed: 0, hold: 0.4, turnX: 200 }),
            boss('cinder-bastion', 'bastion-spin', { ...BASTION_QUIET, spin: 4.6 }),
            boss('cinder-bastion', 'bastion-still', { ...BASTION_QUIET, spin: -0.4 }),
            boss('cinder-bastion', 'bastion-reverse', {
              ...BASTION_QUIET,
              spin: 3,
              reverseTicks: 25.7,
            }),
            boss('cinder-bastion', 'bastion-lanes', {
              trackSpeed: 0,
              firstLaser: 0.5,
              laserTicks: 40,
              laserLength: 200,
              laserWidth: 6,
              telegraph: 5,
              active: 5,
            }),
            boss('cinder-bastion', 'bastion-ways', { ...BASTION_QUIET, ways: 2.7, fireTicks: 30 }),
            boss('cinder-bastion', 'bastion-ring', { ...BASTION_QUIET, ring: 8, ringTicks: 30 }),
            boss('cinder-bastion', 'bastion-ring-low', {
              ...BASTION_QUIET,
              ways: 0.6,
              fireTicks: 20,
              ring: 0.6,
              ringTicks: 20,
            }),
            boss('squall-steed', 'steed-still', { ...STEED_QUIET }),
            boss('squall-steed', 'steed-bob', { ...STEED_QUIET, bobSpeed: 8, ry: 30, rx: 10 }),
            boss('squall-steed', 'steed-flicker', {
              ...STEED_QUIET,
              closedTicks: 0,
              openTicks: 0.5,
              minis: 2,
            }),
            boss('squall-steed', 'steed-open-10', {
              ...STEED_QUIET,
              closedTicks: 20,
              openTicks: 10,
              minis: 2,
              launchTicks: 1,
            }),
            boss('squall-steed', 'steed-open-11', {
              ...STEED_QUIET,
              closedTicks: 20,
              openTicks: 11,
              minis: 2,
              launchTicks: 30,
            }),
            boss('squall-steed', 'steed-minis', {
              ...STEED_QUIET,
              closedTicks: 20,
              openTicks: 200,
              minis: 2.7,
              launchTicks: 30,
            }),
            boss('squall-steed', 'steed-single', { ...STEED_QUIET, fireTicks: 30, ways: 0 }),
            boss('squall-steed', 'steed-pair', { ...STEED_QUIET, fireTicks: 30, ways: 2.7 }),
            boss('squall-steed', 'steed-ring', {
              ...STEED_QUIET,
              closedTicks: 20,
              openTicks: 20,
              ring: 8,
              ringSpeed: 1,
            }),
            boss('squall-steed', 'steed-gape', {
              ...STEED_QUIET,
              closedTicks: 20,
              openTicks: 20,
              gape: 6.8,
            }),
            boss('squall-steed', 'steed-shut-lids', {
              ...STEED_QUIET,
              closedTicks: 20,
              openTicks: 20,
            }),
          ],
        },
      },
      {
        path: 'stages/s.stage.json',
        data: {
          formatVersion: 1,
          kind: 'stage',
          id: 's',
          name: 'S',
          music: { stage: 'Stage', boss: 'Boss' },
          length: 4000,
          camera: [{ x: 0, speed: 1 }],
          checkpoints: [{ x: 0 }],
          parallax: [],
          tilemap: null,
          events: [],
        },
      },
    ],
    { extraSprites: ENGINE_SPRITES },
  );
  expect(issues).toEqual([]);
  return db;
})();

/**
 * A world, the ship holding fire and invulnerable: free flight, or the scrolling stage `s`
 * (1 px/tick, open space) with the ship flown in.
 *
 * @param stage - Play the scrolling stage.
 * @returns The world.
 */
function world(stage = false): World {
  const w = createWorld(
    resolveGameConfig({
      seed: 13,
      autofire: false,
      remoteMode: false,
      ...(stage ? { stage: 's' } : {}),
    }),
    DB,
  );
  w.debugFlags.godMode = true;
  if (stage) run(w, 45);
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
 * Steps until the boss's chest is open (or shut).
 *
 * @param w - The world.
 * @param open - The state awaited.
 * @returns Ticks stepped.
 */
function untilChest(w: World, open: boolean): number {
  const chest = w.bosses.boss.parts[part(w, 'chest')];
  let t = 0;
  for (; t < 400 && chest.open !== open; t++) run(w, 1);
  expect(chest.open).toBe(open);
  return t;
}

describe('core/behaviors — zones D and E, edge cases (M2-12)', () => {
  it('has the documented default tunables', () => {
    expect(DEFAULT_BEHAVIORS.get('rear.swoop')?.params).toEqual({
      speed: 1.6,
      turnX: 280,
      hold: 18,
      ways: 1,
      spread: 40,
      bulletSpeed: 1.3,
      leaveSpeed: 1.4,
    });
    expect(DEFAULT_BOSS_BEHAVIORS.get('boss.bastion')?.params).toEqual({
      trackSpeed: 0.35,
      margin: 44,
      spin: 4,
      reverseTicks: 0,
      laserTicks: 120,
      firstLaser: 60,
      laserLength: 384,
      laserWidth: 8,
      telegraph: 45,
      active: 50,
      fireTicks: 100,
      ways: 0,
      spread: 40,
      bulletSpeed: 1.3,
      ring: 0,
      ringTicks: 150,
      ringSpeed: 1,
    });
    expect(DEFAULT_BOSS_BEHAVIORS.get('boss.steed')?.params).toEqual({
      cx: 296,
      cy: 100,
      rx: 8,
      ry: 40,
      bobSpeed: 3,
      closedTicks: 150,
      openTicks: 110,
      launchTicks: 45,
      minis: 2,
      fireTicks: 80,
      ways: 3,
      spread: 44,
      bulletSpeed: 1.3,
      ring: 0,
      ringSpeed: 1,
      gape: 0,
    });
  });
});

describe('core/behaviors rear.swoop — edge cases (M2-12)', () => {
  /**
   * Flies a jumper from its spawn and records when it reaches its turn point, when it fires and
   * when it starts to leave.
   *
   * @param w - The world.
   * @param id - Enemy id.
   * @param screenX - Spawn view x.
   * @param turnX - The variant's turn point (view x).
   * @param ticks - Most ticks to watch.
   * @returns The ticks (−1 = never) and the most needles alive at once.
   */
  function flight(
    w: World,
    id: string,
    screenX: number,
    turnX: number,
    ticks: number,
  ): { jumper: Enemy; arrive: number; fire: number; leave: number; most: number } {
    const jumper = spawn(w, id, w.camera.x + screenX, w.camera.y + 60);
    let arrive = -1;
    let fire = -1;
    let leave = -1;
    let most = 0;
    for (let t = 1; t <= ticks; t++) {
      run(w, 1);
      const x = jumper.x - w.camera.x;
      if (arrive < 0 && Math.abs(x - turnX) < 1e-6) arrive = t;
      const n = bullets(w, BulletKind.NeedlePink);
      if (fire < 0 && n > 0) fire = t;
      if (n > most) most = n;
      if (leave < 0 && arrive >= 0 && t > arrive && jumper.vx < 0) leave = t;
      // It keeps its row the whole way.
      expect(jumper.y - w.camera.y).toBeCloseTo(60, 9);
    }
    return { jumper, arrive, fire, leave, most };
  }

  // The spawn comes between two ticks here: the script and the mover both start on tick 1, so
  // the turn point is reached on tick ⌈distance / speed⌉ and the shot — the script's one wake,
  // `approach + (hold >> 1) + 1` ticks after its start — on hold tick `(hold >> 1) + 1`.

  it('flies the defaults: in at 1.6 to view x 280, an 18-tick hold with one needle, away at 1.4', () => {
    const w = world();
    // (280 + 41) / 1.6 → 201 ticks in; the shot on the 10th of 18 hold ticks; away after them.
    const { jumper, arrive, fire, leave, most } = flight(w, 'jumper-default', -41, 280, 260);
    expect(arrive).toBe(201);
    expect(fire).toBe(arrive + 11);
    expect(leave).toBe(arrive + 19);
    expect(most).toBe(1);
    expect(jumper.vx).toBeCloseTo(-1.4, 9);
    expect(jumper.vy).toBe(0);
  });

  it('floors ways: 0 fires nothing, 2.7 a pair of needles', () => {
    const quiet = world();
    const none = flight(quiet, 'jumper-quiet', -41, 280, 260);
    expect(none.arrive).toBe(201);
    expect(none.most).toBe(0);
    const volley = world();
    const { fire, arrive, most } = flight(volley, 'jumper-volley', -41, 280, 260);
    expect(fire).toBe(arrive + 11);
    expect(most).toBe(2);
  });

  it('turns a speed of 0 into 1 px/tick and a hold below 1 into one tick (the shot as it turns away)', () => {
    const w = world();
    const { jumper, arrive, fire, leave } = flight(w, 'jumper-brief', -20, 200, 260);
    expect(arrive).toBe(220);
    // One hold tick; the needle leaves on the next tick, from the turn point (the script fires
    // before the mover takes its first step away).
    expect(leave).toBe(arrive + 2);
    expect(fire).toBe(leave);
    expect(jumper.vx).toBeCloseTo(-1.4, 9); // the default leave speed
  });

  it('times the shot from the view on a scrolling camera: half-way through the hold', () => {
    const w = world(true);
    const x0 = w.camera.x;
    const { arrive, fire, leave } = flight(w, 'squall-jumper', -24, 290, 260);
    expect(w.camera.x - x0).toBeGreaterThan(200); // the camera scrolled the whole time
    // (290 + 24) / 1.6 → 197 ticks in view space (a flying body rides the scroll).
    expect(arrive).toBe(197);
    expect(fire).toBe(arrive + 12);
    expect(leave).toBe(arrive + 21);
  });

  it('flies back to its turn point when spawned right of it, and still fires half-way through its hold (fix)', () => {
    const w = world();
    // 60 px left at 1.6 px/tick: 38 ticks; the 20-tick hold's needle 12 ticks later — well past
    // the enemy's settle time. Before the fix the wake was timed as if it stood at its turn point
    // already (11 ticks after the spawn, inside the settle time): the shot was dropped, and it
    // never fired at all.
    const { jumper, arrive, fire, leave, most } = flight(w, 'squall-jumper', 350, 290, 120);
    expect(arrive).toBe(38);
    expect(fire).toBe(arrive + 12);
    expect(leave).toBe(arrive + 21);
    expect(most).toBe(1);
    // It faced the ship (to its left) for the shot.
    expect(jumper.flags & EnemyFlag.FaceRight).toBe(0);
  });

  it('never fires inside its settle time: spawned on screen at its turn point, the shot is dropped', () => {
    const w = world();
    // The wake comes 12 ticks after the spawn, before the 30 settle ticks of shmup_feat.md §11
    // (a rear attacker spawns behind the view, so its settle time runs out long before its turn).
    const { arrive, fire, leave } = flight(w, 'squall-jumper', 290, 290, 120);
    expect(arrive).toBe(1);
    expect(leave).toBe(22);
    expect(fire).toBe(-1);
  });
});

describe('core/behaviors boss.bastion — edge cases (M2-12)', () => {
  it('rounds the spin to whole units and sets it only on the hub (the part attached to the core)', () => {
    const w = fighting('bastion-spin');
    const parts = w.bosses.boss.parts;
    const hub = part(w, 'hub');
    expect(parts[hub].spin).toBe(5);
    for (const name of [
      'hull',
      'core',
      'emitter-top',
      'emitter-bottom',
      'arm-a-inner',
      'arm-a-outer',
      'arm-b-inner',
      'arm-b-outer',
    ]) {
      expect(parts[part(w, name)].spin, name).toBe(0);
    }
    // The arm segments ride the hub: their world angle turns with it, 5 units a tick.
    const arm = part(w, 'arm-a-outer');
    const before = parts[arm].worldAngle;
    run(w, 7);
    expect((parts[arm].worldAngle - before + ANGLE_UNITS) % ANGLE_UNITS).toBe(35);
    // The emitters on the hull never turn.
    expect(parts[part(w, 'emitter-top')].worldAngle).toBe(0);
  });

  it('holds the arms still with a spin that rounds to 0', () => {
    const w = fighting('bastion-still');
    const parts = w.bosses.boss.parts;
    const hub = part(w, 'hub');
    const angle = parts[hub].worldAngle;
    run(w, 60);
    expect(parts[hub].spin === 0).toBe(true); // −0 or 0: no turn
    expect(parts[hub].worldAngle).toBe(angle);
  });

  it('reverses the spin every whole reverseTicks', () => {
    const w = fighting('bastion-reverse');
    const hub = w.bosses.boss.parts[part(w, 'hub')];
    const spins: number[] = [];
    for (let t = 0; t < 100; t++) {
      spins.push(hub.spin);
      run(w, 1);
    }
    // The runs of one sign are 25 ticks long (25.7 floored) after the first partial one.
    const changes: number[] = [];
    for (let t = 1; t < spins.length; t++) if (spins[t] !== spins[t - 1]) changes.push(t);
    expect(changes.length).toBeGreaterThanOrEqual(3);
    for (let k = 1; k < changes.length; k++) expect(changes[k] - changes[k - 1]).toBe(25);
    expect(new Set(spins)).toEqual(new Set([3, -3]));
  });

  it('keeps the arms’ angle through a phase change (no jump), then turns them the new way', () => {
    const w = fighting('cinder-bastion');
    const boss = w.bosses.boss;
    const hub = boss.parts[part(w, 'hub')];
    run(w, 37);
    const core = part(w, 'core');
    let last = hub.worldAngle;
    const steps: number[] = [];
    w.bosses.damagePart(core, 27, 0); // below 54: phase 1 (spin −6)
    for (let t = 0; t < 6; t++) {
      run(w, 1);
      const step = ((hub.worldAngle - last + 1.5 * ANGLE_UNITS) % ANGLE_UNITS) - ANGLE_UNITS / 2;
      steps.push(step);
      last = hub.worldAngle;
    }
    expect(boss.phase).toBe(1);
    for (const step of steps) expect([4, -6]).toContain(step);
    expect(steps[steps.length - 1]).toBe(-6);
  });

  it('fires lane lasers attached to the emitter, to the left, as tuned, from the standing ones in turn', () => {
    const w = fighting('bastion-lanes');
    const boss = w.bosses.boss;
    const top = part(w, 'emitter-top');
    const bottom = part(w, 'emitter-bottom');
    const lasers = w.bullets.lasers;
    const lf = lasers.fields;
    /**
     * Steps until a new lane is telegraphed and names its emitter.
     *
     * @param ticks - Most ticks to wait.
     * @returns `'top'`, `'bottom'` or `'none'`, and the tick it came on.
     */
    const next = (ticks: number): [string, number] => {
      for (let t = 1; t <= ticks; t++) {
        run(w, 1);
        for (let i = 0; i < lasers.count; i++) {
          if (lf.phase[i] !== LaserPhase.Telegraph || lf.ticks[i] > 1) continue;
          expect(lf.angle[i]).toBe(ANGLE_UNITS / 2);
          expect([lf.length[i], lf.width[i], lf.telegraph[i], lf.active[i]]).toEqual([
            200, 6, 5, 5,
          ]);
          const src = lf.src[i];
          const who =
            src === boss.parts[top].slot
              ? 'top'
              : src === boss.parts[bottom].slot
                ? 'bottom'
                : 'other';
          run(w, 3); // past this lane's first ticks
          return [who, t];
        }
      }
      return ['none', -1];
    };
    // firstLaser 0.5 → the first lane on the first tick of the fight; then every 40.
    const first = next(5);
    expect(first).toEqual(['top', expect.any(Number)]);
    expect(first[1]).toBeLessThanOrEqual(2);
    expect([next(50)[0], next(50)[0], next(50)[0]]).toEqual(['bottom', 'top', 'bottom']);
    // Attached: the lane rides its emitter while the boss tracks nothing (held still here).
    expect(lasers.count).toBeLessThanOrEqual(1);
    expect(w.bosses.damagePart(top, 99, 0)).toBe(BossHit.Destroyed);
    expect([next(50)[0], next(50)[0]]).toEqual(['bottom', 'bottom']);
    expect(w.bosses.damagePart(bottom, 99, 0)).toBe(BossHit.Destroyed);
    expect(next(120)[0]).toBe('none');
    expect(boss.state).toBe(BossState.Fight);
  });

  it('spits floored aimed spreads of red ovals from the core', () => {
    const w = fighting('bastion-ways');
    run(w, 25);
    expect(bullets(w, BulletKind.OvalRed)).toBe(0);
    run(w, 10);
    expect(bullets(w, BulletKind.OvalRed)).toBe(2); // ways 2.7 → 2
    run(w, 30);
    expect(bullets(w, BulletKind.OvalRed, 1)).toBe(0);
    expect(bullets(w, BulletKind.OvalRed)).toBe(4);
    expect(bullets(w, BulletKind.RoundPurple)).toBe(0);
  });

  it('fires rings from the core, each turned half a gap from the last', () => {
    const w = fighting('bastion-ring');
    const gap = ANGLE_UNITS / 8;
    const rings: number[][] = [];
    for (let t = 0; t < 100 && rings.length < 3; t++) {
      run(w, 1);
      const fresh = freshAngles(w, BulletKind.RoundPurple);
      if (fresh.length > 0 && w.bullets.pool.count > 0) {
        rings.push(fresh);
        run(w, 2); // past this ring's first ticks
      }
    }
    expect(rings).toEqual([
      Array.from({ length: 8 }, (_v, k) => k * gap),
      Array.from({ length: 8 }, (_v, k) => k * gap + gap / 2),
      Array.from({ length: 8 }, (_v, k) => k * gap),
    ]);
  });

  it('fires nothing from the core with ways and ring below 1', () => {
    const w = fighting('bastion-ring-low');
    run(w, 120);
    expect(w.bullets.count).toBe(0);
    expect(w.bullets.lasers.count).toBe(0);
  });

  it('tracks the ship’s height at its speed, never past its margins', () => {
    const w = fighting('cinder-bastion');
    const b = w.bosses.boss;
    const ship = w.players[0];
    const margin = 44;
    const speed = 0.35; // phase 0
    for (const shipY of [4, PLAYFIELD_H - 4, PLAYFIELD_H / 2 - 9]) {
      for (let t = 0; t < 500; t++) {
        ship.y = w.camera.y + shipY;
        const y = b.screenY;
        run(w, 1);
        expect(Math.abs(b.screenY - y)).toBeLessThanOrEqual(speed + 1e-9);
        expect(b.screenY).toBeGreaterThanOrEqual(margin - 1e-9);
        expect(b.screenY).toBeLessThanOrEqual(PLAYFIELD_H - margin + 1e-9);
      }
    }
    expect(b.phase).toBe(0);
  });
});

describe('core/behaviors boss.steed — edge cases (M2-12)', () => {
  it('holds still with a bobSpeed of 0', () => {
    const w = fighting('steed-still');
    const b = w.bosses.boss;
    const [x, y] = [b.screenX, b.screenY];
    run(w, 200);
    expect([b.screenX, b.screenY]).toEqual([x, y]);
  });

  it('bobs on its ellipse from its home, without a jump', () => {
    const w = fighting('steed-bob');
    const b = w.bosses.boss;
    // Home (304, 100) is the ellipse's right end: cx 296 + rx 8 — here rx 10 (a 2-px slack).
    let [x, y] = [b.screenX, b.screenY];
    // 8 units a tick on radii 10 × 30: at most 2π · 30 · 8 / 1024 ≈ 1.5 px a tick (+ the slack).
    const most = (2 * Math.PI * 30 * 8) / ANGLE_UNITS + 2 + 1e-6;
    let low = Number.POSITIVE_INFINITY;
    let high = Number.NEGATIVE_INFINITY;
    for (let t = 0; t < 300; t++) {
      run(w, 1);
      expect(Math.hypot(b.screenX - x, b.screenY - y)).toBeLessThanOrEqual(most);
      // On the ellipse ((x − 296) / 10)² + ((y − 100) / 30)² = 1.
      const u = (b.screenX - 296) / 10;
      const v = (b.screenY - 100) / 30;
      expect(u * u + v * v).toBeCloseTo(1, 1);
      [x, y] = [b.screenX, b.screenY];
      low = Math.min(low, y);
      high = Math.max(high, y);
    }
    expect(high - low).toBeGreaterThan(55); // the whole height of the ellipse
  });

  it('moves at most the change of the radii at a phase change (the new ellipse, same angle)', () => {
    for (const wait of [0, 40, 100, 200]) {
      const w = fighting('squall-steed');
      const b = w.bosses.boss;
      const chest = part(w, 'chest');
      run(w, wait);
      untilChest(w, true);
      let [x, y] = [b.screenX, b.screenY];
      w.bosses.damagePart(chest, 21, 0); // below 44 of 64: phase 1 (ry 14 → 16)
      let most = 0;
      for (let t = 0; t < 4; t++) {
        run(w, 1);
        most = Math.max(most, Math.hypot(b.screenX - x, b.screenY - y));
        [x, y] = [b.screenX, b.screenY];
      }
      expect(b.phase).toBe(1);
      // One tick's bob at 3 units on ry 16 (≈ 0.3 px) plus the 2 px the ellipse grew.
      expect(most, `after ${String(wait)} ticks`).toBeLessThanOrEqual(2 + 0.3);
    }
  });

  it('toggles the chest every tick with timers below 1 — and never launches (the first mini waits 10 ticks)', () => {
    const w = fighting('steed-flicker');
    const chest = w.bosses.boss.parts[part(w, 'chest')];
    run(w, 2);
    let flips = 0;
    let was = chest.open;
    for (let t = 0; t < 60; t++) {
      run(w, 1);
      if (chest.open !== was) flips++;
      was = chest.open;
    }
    expect(flips).toBe(60);
    expect(live(w, 'steed-foal')).toHaveLength(0);
  });

  it.each([
    ['steed-open-10', 0],
    ['steed-open-11', 1],
  ])(
    '%s: the first mini comes 10 ticks after the chest opens — only if it stays open longer (%i)',
    (id, minis) => {
      const w = fighting(id);
      untilChest(w, true);
      untilChest(w, false);
      expect(live(w, 'steed-foal')).toHaveLength(minis);
    },
  );

  it('launches the floored number of minis per opening, launchTicks apart, from the chest', () => {
    const w = fighting('steed-minis');
    const b = w.bosses.boss;
    const chest = part(w, 'chest');
    untilChest(w, true);
    const launches: number[] = [];
    for (let t = 1; t <= 190; t++) {
      run(w, 1);
      for (const e of live(w, 'steed-foal')) {
        if (e.age !== 0 && e.age !== 1) continue;
        if (launches.includes(t - e.age)) continue;
        launches.push(t - e.age);
        // It came out of the chest.
        expect(Math.abs(e.x - b.parts[chest].x)).toBeLessThan(3);
        expect(Math.abs(e.y - b.parts[chest].y)).toBeLessThan(3);
      }
    }
    // minis 2.7 → 2: at 10 and 40 ticks after the opening, nothing more while it stays open.
    expect(launches).toHaveLength(2);
    expect(launches[1] - launches[0]).toBe(30);
    expect(live(w, 'steed-foal')).toHaveLength(2);
  });

  it('flies its minis like the shipped foal: 16 ticks out, 70 homing at 4 units, then straight on', () => {
    const w = world();
    const e = spawn(w, 'steed-foal', w.camera.x + 300, w.camera.y + 40);
    const out: string[] = [];
    let last = '';
    let n = 0;
    for (let t = 0; t < 100; t++) {
      run(w, 1);
      const now =
        e.mover === MoverKind.Straight
          ? 'S'
          : e.mover === MoverKind.Homing
            ? 'H' + e.m1.toString()
            : '-';
      if (now !== last && n > 0) {
        out.push(last + '×' + n.toString());
        n = 0;
      }
      last = now;
      n++;
    }
    out.push(last + '×' + n.toString());
    expect(out).toEqual(['S×16', 'H4×70', 'H0×14']);
    expect(w.bullets.count).toBe(0);
  });

  it.each([
    ['steed-single', 1],
    ['steed-pair', 2],
  ])('%s: the snout’s spreads — ways below 1 a single oval, floored (%i)', (id, ways) => {
    const w = fighting(id);
    run(w, 25);
    expect(bullets(w, BulletKind.OvalPink)).toBe(0);
    run(w, 10);
    expect(bullets(w, BulletKind.OvalPink)).toBe(ways);
    // A destroyed snout fires no more.
    expect(w.bosses.damagePart(part(w, 'snout'), 99, 0)).toBe(BossHit.Destroyed);
    run(w, 60);
    expect(bullets(w, BulletKind.OvalPink, 30)).toBe(0);
  });

  it('rings from the snout only as the chest shuts, each turned half a gap from the last', () => {
    const w = fighting('steed-ring');
    const gap = ANGLE_UNITS / 8;
    untilChest(w, true);
    expect(freshAngles(w, BulletKind.RoundRed)).toEqual([]); // nothing as it opens
    untilChest(w, false);
    const first = freshAngles(w, BulletKind.RoundRed);
    expect(first).toEqual(Array.from({ length: 8 }, (_v, k) => k * gap));
    untilChest(w, true);
    expect(freshAngles(w, BulletKind.RoundRed)).toEqual([]);
    untilChest(w, false);
    expect(freshAngles(w, BulletKind.RoundRed)).toEqual(
      Array.from({ length: 8 }, (_v, k) => k * gap + gap / 2),
    );
    untilChest(w, true);
    untilChest(w, false);
    expect(freshAngles(w, BulletKind.RoundRed)).toEqual(first);
    // The snout shot away: the chest still opens and shuts, no more rings.
    w.bosses.damagePart(part(w, 'snout'), 99, 0);
    untilChest(w, true);
    untilChest(w, false);
    expect(freshAngles(w, BulletKind.RoundRed)).toEqual([]);
    expect(w.bosses.boss.state).toBe(BossState.Fight);
  });

  it('gapes the lids floored gape px while the chest is open (0 = never), from their rest', () => {
    const w = fighting('steed-gape');
    const parts = w.bosses.boss.parts;
    const top = parts[part(w, 'lid-top')];
    const bottom = parts[part(w, 'lid-bottom')];
    expect([top.restX, top.restY, bottom.restX, bottom.restY]).toEqual([-3, -11, -3, 11]);
    for (const open of [true, false, true, false]) {
      untilChest(w, open);
      expect([top.localX, top.localY]).toEqual([-3, open ? -17 : -11]);
      expect([bottom.localX, bottom.localY]).toEqual([-3, open ? 17 : 11]);
    }
    const still = fighting('steed-shut-lids');
    const lids = still.bosses.boss.parts;
    const lid = lids[part(still, 'lid-top')];
    for (const open of [true, false]) {
      untilChest(still, open);
      expect([lid.localX, lid.localY]).toEqual([-3, -11]);
    }
  });

  it('starts every phase with the chest shut and the lids at rest, whatever the last phase left', () => {
    const w = fighting('squall-steed');
    const b = w.bosses.boss;
    const chest = part(w, 'chest');
    const lid = b.parts[part(w, 'lid-bottom')];
    for (const [damage, phase] of [
      [21, 1],
      [26, 2],
    ] as const) {
      untilChest(w, true);
      expect(lid.localY).toBe(lid.restY + (phase === 1 ? 3 : 3));
      expect(w.bosses.damagePart(chest, damage, 0)).toBe(BossHit.Damaged);
      run(w, 2);
      expect(b.phase).toBe(phase);
      expect(b.parts[chest].open).toBe(false);
      expect(lid.localY).toBe(lid.restY);
      expect(w.bosses.damagePart(chest, 1, 0)).toBe(BossHit.Clink);
    }
    // Phase 2 gapes 4 px.
    untilChest(w, true);
    expect(lid.localY).toBe(lid.restY + 4);
  });
});
