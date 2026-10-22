/**
 * Edge cases of the M2-12 behaviours (`core/behaviors`), beyond `behaviors-zone-e.test.ts`, on
 * variants of the shipped zone E roster (free flight — a static camera — unless a test needs a
 * scrolling one, the ship holding its fire and invulnerable):
 *
 * - `rear.swoop`: the defaults as flown (in at 1.6 px/tick to view x 280, an 18-tick hold, away at
 *   1.4), `ways` floored (0 = no shot, 2.7 → 2 needles), a hold below 1 → one tick, a speed of 0 →
 *   1 px/tick, the shot timed on a scrolling camera too, and — the fix of this test round — one
 *   spawned **right of** its turn point flies back to it and still fires half-way through its
 *   hold (the wake used to be timed as if it were there already: the shot fell inside the enemy's
 *   settle time and was dropped);
 * - `boss.steed`: the bob stays on its ellipse and starts from its home without a jump, a
 *   `bobSpeed` of 0 holds it; a phase change moves it at most the change of the ellipse's radii;
 *   chest timers below 1 toggle it every tick, the first mini 10 ticks after the chest opens (an
 *   opening of 10 ticks launches none, 11 one), `minis` floored per opening at `launchTicks`
 *   apart, the minis spawn at the chest and home like the shipped `steed-foal`; the snout's
 *   spreads (`ways` below 1 → a single shot, floored), rings from the snout only as the chest
 *   shuts, alternating by half a gap, none from a destroyed snout; the lids gape floored `gape`
 *   px (0 = never), and every phase starts shut with the lids at rest;
 * - `rock.fall` and `rammer.aimed` (R5-05.S4a): the trigger is the |Δx| to the ship (a slab hangs
 *   2 px past it and falls when it brackets the distance), a gravity above `maxFall` is capped on
 *   the first flying tick, and a windup of 0 dashes on the mover's first tick, locked on its row;
 * - `captain.circler` (R5-05.S4a, THE STORM EYE): an orbit speed of 0 switches the motion to
 *   hold and parks the boss at its home on the ellipse's right end, and the rings come from every
 *   standing gun — half a gap further each volley — falling back to the first standing part when
 *   no gun lives.
 */
import { describe, expect, it } from 'vitest';
import { BossHit, BossMotion, BossState } from '../../src/bosses/index.js';
import { BulletKind } from '../../src/bullets/index.js';
import {
  DEFAULT_BOSS_X,
  DEFAULT_BOSS_Y,
  loadContent,
  type ContentDb,
} from '../../src/data/index.js';
import { EnemyFlag, type Enemy } from '../../src/enemies/index.js';
import { ANGLE_UNITS } from '../../src/math/index.js';
import { MoverKind } from '../../src/patterns/index.js';
import { ENGINE_SPRITES, type World } from '../../src/world/index.js';
import { shipped, shippedPatterns } from '../helpers/shipped.js';
import {
  bullets,
  freshAngles,
  rosterKitDe,
  run,
  zoneKitEdgeDe,
  type Entry,
} from '../helpers/zone-behaviors.js';
import { v1rel, v1screenX, v1speed } from '../helpers/v1-port.js';

/** The shipped zone E roster (parsed once; the variants are deep copies). */
const ROSTER: Entry[] = [
  ...(shipped('enemies/zone-e.enemies.json').data as { enemies: Entry[] }).enemies,
];

const { enemy, boss } = rosterKitDe(ROSTER);

/** Tunables of a quiet `boss.steed` phase: held still, the chest shut, no shots, no minis. */
const STEED_QUIET = { bobSpeed: 0, closedTicks: 100_000, fireTicks: 100_000, minis: 0 } as const;

/** Tunables of a held `captain.circler` phase: parked on the home, no rings (R5-05.S4a). */
const EYE_QUIET = {
  cx: 330,
  cy: 168,
  rx: 195,
  ry: 84,
  speed: 0,
  fireTicks: 100_000,
  bulletSpeed: 2.1,
  ring: 8,
} as const;

/** The test DB: the KESTREL, Type A, the shipped zone E roster, the variants and a scrolling stage. */
const DB: ContentDb = (() => {
  const { db, issues } = loadContent(
    [
      shipped('player/kestrel.player.json'),
      shipped('weapons/type-a.weapons.json'),
      shipped('enemies/zone-e.enemies.json'),
      ...shippedPatterns(),
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
            enemy('ice-slab', 'slab-outside', { trigger: 298, gravity: 0.06, maxFall: 4.5 }),
            enemy('ice-slab', 'slab-edge', { trigger: 302, gravity: 0.06, maxFall: 4.5 }),
            enemy('ice-slab', 'slab-steep', { trigger: 96, gravity: 6, maxFall: 2 }),
            enemy('lightbird', 'bird-instant', { enterTicks: 40, windup: 0, speed: 2 }),
            boss('storm-eye', 'eye-quiet', { ...EYE_QUIET }),
            boss('storm-eye', 'eye-single', { ...EYE_QUIET, fireTicks: 30 }),
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

const { world, spawn, fighting, live, part } = zoneKitEdgeDe(DB);

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
    const { jumper, arrive, fire, leave, most } = flight(
      w,
      'jumper-default',
      -41,
      v1screenX(280),
      260,
    );
    // (280 + 41) / 1.6 in ported units → 201 ticks (206 on the ported frame).
    expect(arrive).toBe(Math.ceil((v1screenX(280) + 41) / v1speed(1.6)));
    expect(fire).toBe(arrive + 11);
    expect(leave).toBe(arrive + 19);
    expect(most).toBe(1);
    expect(jumper.vx).toBeCloseTo(-v1speed(1.4), 9);
    expect(jumper.vy).toBe(0);
  });

  it('floors ways: 0 fires nothing, 2.7 a pair of needles', () => {
    const quiet = world();
    const none = flight(quiet, 'jumper-quiet', -41, v1screenX(280), 260);
    expect(none.arrive).toBe(Math.ceil((v1screenX(280) + 41) / v1speed(1.6)));
    expect(none.most).toBe(0);
    const volley = world();
    const { fire, arrive, most } = flight(volley, 'jumper-volley', -41, v1screenX(280), 260);
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
    expect(jumper.vx).toBeCloseTo(-v1speed(1.4), 9); // the default leave speed
  });

  it('times the shot from the view on a scrolling camera: half-way through the hold', () => {
    const w = world(true);
    const x0 = w.camera.x;
    const { arrive, fire, leave } = flight(w, 'squall-jumper', -24, v1screenX(290), 260);
    expect(w.camera.x - x0).toBeGreaterThan(200); // the camera scrolled the whole time
    // (290 + 24) / 1.6 → 197 ticks in view space (a flying body rides the scroll).
    expect(arrive).toBe(Math.ceil((v1screenX(290) + 24) / v1speed(1.6)));
    // The camera has scrolled a pixel when the script reads its distance on the first tick, so
    // the wake counts ⌈(turnX − x0 + 1) / speed⌉ approach ticks; the needle shows a tick later.
    expect(fire).toBe(Math.ceil((v1screenX(290) + 25) / v1speed(1.6)) + (20 >> 1) + 2);
    expect(leave).toBe(arrive + 21);
  });

  it('flies back to its turn point when spawned right of it, and still fires half-way through its hold (fix)', () => {
    const w = world();
    // 60 px left at 1.6 px/tick: 38 ticks; the 20-tick hold's needle 12 ticks later — well past
    // the enemy's settle time. Before the fix the wake was timed as if it stood at its turn point
    // already (11 ticks after the spawn, inside the settle time): the shot was dropped, and it
    // never fired at all.
    const { jumper, arrive, fire, leave, most } = flight(
      w,
      'squall-jumper',
      v1screenX(290) + v1rel(60),
      v1screenX(290),
      120,
    );
    expect(arrive).toBe(Math.ceil(v1rel(60) / v1speed(1.6)));
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
    const { arrive, fire, leave } = flight(w, 'squall-jumper', v1screenX(290), v1screenX(290), 120);
    expect(arrive).toBe(1);
    expect(leave).toBe(22);
    expect(fire).toBe(-1);
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

  // The shipped home of `squall-steed` (304, 100) is v1 content: at 384×216 it is the right end
  // of the ellipse round (DEFAULT_BOSS_X, DEFAULT_BOSS_Y); at 640×360 it sits ~250 px from it, and
  // the orbit's first step (the last tick of `fighting`) jumps the boss onto it — gated until
  // R2-02 ports the home.
  it('bobs on its ellipse from its home, without a jump', () => {
    const w = fighting('steed-bob');
    const b = w.bosses.boss;
    // At 384×216 the shipped home (304, 100) is the ellipse's right end: cx (DEFAULT_BOSS_X 296)
    // + rx 8 — here rx 10 (a 2-px slack) — round cy (DEFAULT_BOSS_Y 100). R2-02 ports it.
    // 8 units a tick on radii 10 × 30: at most 2π · 30 · 8 / 1024 ≈ 1.5 px a tick (+ the slack).
    const most = (2 * Math.PI * 30 * 8) / ANGLE_UNITS + 2 + 1e-6;
    // The orbit's first step ran in `fighting`'s last tick: still within a step of the home.
    expect(Math.hypot(b.screenX - b.homeX, b.screenY - b.homeY)).toBeLessThanOrEqual(most);
    let [x, y] = [b.screenX, b.screenY];
    let low = Number.POSITIVE_INFINITY;
    let high = Number.NEGATIVE_INFINITY;
    for (let t = 0; t < 300; t++) {
      run(w, 1);
      expect(Math.hypot(b.screenX - x, b.screenY - y)).toBeLessThanOrEqual(most);
      // On the ellipse ((x − cx) / 10)² + ((y − cy) / 30)² = 1.
      const u = (b.screenX - DEFAULT_BOSS_X) / 10;
      const v = (b.screenY - DEFAULT_BOSS_Y) / 30;
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
      expect(most, `after ${String(wait)} ticks`).toBeLessThanOrEqual(v1rel(2) + 0.3);
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
    expect([top.restX, top.restY, bottom.restX, bottom.restY]).toEqual([
      -v1rel(3),
      -v1rel(11),
      -v1rel(3),
      v1rel(11),
    ]);
    for (const open of [true, false, true, false]) {
      untilChest(w, open);
      expect([top.localX, top.localY]).toEqual([-v1rel(3), open ? -v1rel(11) - 6 : -v1rel(11)]);
      expect([bottom.localX, bottom.localY]).toEqual([-v1rel(3), open ? v1rel(11) + 6 : v1rel(11)]);
    }
    const still = fighting('steed-shut-lids');
    const lids = still.bosses.boss.parts;
    const lid = lids[part(still, 'lid-top')];
    for (const open of [true, false]) {
      untilChest(still, open);
      expect([lid.localX, lid.localY]).toEqual([-v1rel(3), -v1rel(11)]);
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
      expect(lid.localY).toBe(lid.restY + Math.floor(v1rel(3)));
      expect(w.bosses.damagePart(chest, damage, 0)).toBe(BossHit.Damaged);
      run(w, 2);
      expect(b.phase).toBe(phase);
      expect(b.parts[chest].open).toBe(false);
      expect(lid.localY).toBe(lid.restY);
      expect(w.bosses.damagePart(chest, 1, 0)).toBe(BossHit.Clink);
    }
    // Phase 2 gapes 4 px.
    untilChest(w, true);
    expect(lid.localY).toBe(lid.restY + Math.floor(v1rel(4)));
  });
});

describe('core/behaviors rock.fall and rammer.aimed — edge cases (R5-05.S4a)', () => {
  it('hangs with the trigger 2 px short and falls when it brackets the distance (the |Δx| law)', () => {
    const w = world();
    run(w, 45); // the fly-in first: from here the ship holds its position
    const ship = w.players[0];
    // Both fly in ahead of the ship at the same x — the signed distance is −300 px.
    const hang = spawn(w, 'slab-outside', ship.x + 300, w.camera.y + 24);
    const fall = spawn(w, 'slab-edge', ship.x + 300, w.camera.y + 60);
    const hangY = hang.y;
    run(w, 1);
    // trigger 298 keeps its hold; trigger 302 releases on the first mover tick.
    expect(hang.vy).toBe(0);
    expect(fall.vy).toBeCloseTo(0.06, 9);
    run(w, 119);
    expect(hang.y).toBe(hangY);
    expect(hang.vy).toBe(0);
    expect(fall.y).toBeGreaterThan(w.camera.y + 60);
  });

  it('caps a gravity above maxFall on the first flying tick, then falls the cap as a rule', () => {
    const w = world();
    run(w, 45); // the fly-in first: a `Ballistic` body only wakes its gravity on a live ship
    const e = spawn(w, 'slab-steep', w.players[0].x + 48, w.camera.y + 24);
    run(w, 1);
    expect(e.vy).toBe(2); // min(0 + 6, 2): one tick of gravity is already the cap
    const y1 = e.y;
    run(w, 30);
    expect(e.vy).toBe(2);
    expect(e.y).toBeCloseTo(y1 + 60, 9); // 30 ticks at 2 px/tick, straight down
    expect(e.vx).toBe(0);
  });

  it('dashes with a windup of 0 on the mover’s first tick, level and locked on the row', () => {
    const w = world();
    run(w, 45); // the fly-in first: the ship's row and position hold from here
    const ship = w.players[0];
    const bird = spawn(w, 'bird-instant', w.camera.x + 300, ship.y);
    run(w, 48); // enters at 40, no telegraph: dashing for several ticks by 48 (30 would not hold)
    expect(bird.mover).toBe(MoverKind.AimedDash);
    expect(bird.vx).toBeCloseTo(-2, 9);
    expect(bird.vy).toBe(0);
    const y = bird.y;
    run(w, 60);
    expect(bird.y).toBe(y); // the locked due-west aim never drifts off the row
    expect(bird.x).toBeLessThan(w.camera.x + 300 - 100);
    expect(w.bullets.count).toBe(0); // it is a ram: it never fires
  });
});

describe('core/behaviors captain.circler (storm-eye) — edge cases (R5-05.S4a)', () => {
  it('holds at the ellipse’s right end when the orbit speed is 0, and fires nothing quiet', () => {
    const w = fighting('eye-quiet');
    const b = w.bosses.boss;
    // The law of `api.orbit`: a speed of 0 is not a circle — the engine switches the motion to
    // `Hold` instead. The boss rides its home, which sits on the ellipse's right end (cx + rx, cy).
    expect(b.motion).toBe(BossMotion.Hold);
    expect(b.screenX).toBeCloseTo(525, 6);
    expect(b.screenY).toBeCloseTo(168, 6);
    const [x, y] = [b.screenX, b.screenY];
    run(w, 200);
    expect([b.screenX, b.screenY]).toEqual([x, y]);
    expect(w.bullets.count).toBe(0);
  });

  it('rings from every standing gun half a gap on, then from the first standing part alone', () => {
    const w = fighting('eye-single'); // the same orbit, quiet fire, volleys every 30 ticks
    const b = w.bosses.boss;
    const gap = ANGLE_UNITS / 8;
    /**
     * The sorted headings of one 8-ring fired at `offset`.
     *
     * @param offset - First heading.
     * @returns The headings.
     */
    const ringOf = (offset: number): number[] =>
      Array.from({ length: 8 }, (_v, k) => (offset + k * gap) % ANGLE_UNITS).sort((p, q) => p - q);
    /**
     * The sorted headings of both guns' rings.
     *
     * @param offset - First heading.
     * @returns The headings.
     */
    const bothRings = (offset: number): number[] =>
      ringOf(offset)
        .concat(ringOf(offset))
        .sort((p, q) => p - q);
    let t = 0;
    while (t < 120 && freshAngles(w, BulletKind.RoundPurple).length === 0) {
      run(w, 1);
      t++;
    }
    expect(freshAngles(w, BulletKind.RoundPurple)).toEqual(bothRings(0));
    run(w, 30);
    expect(freshAngles(w, BulletKind.RoundPurple)).toEqual(bothRings(gap / 2));
    // One gun falls: one ring of 8 a volley now, still turning half a gap on.
    expect(w.bosses.damagePart(part(w, 'cloud-top'), 12, 0)).toBe(BossHit.Destroyed);
    expect(b.state).toBe(BossState.Fight);
    run(w, 30);
    expect(freshAngles(w, BulletKind.RoundPurple)).toEqual(ringOf(gap));
    // The last gun falls too: the volley comes from the first standing part (the swirl ring —
    // it carries no hurtbox, so it never blocked and never dies), the fight keeps going.
    expect(w.bosses.damagePart(part(w, 'cloud-bottom'), 12, 0)).toBe(BossHit.Destroyed);
    run(w, 30);
    expect(freshAngles(w, BulletKind.RoundPurple)).toEqual(ringOf(gap + gap / 2));
    expect(b.state).toBe(BossState.Fight);
    expect(b.parts[part(w, 'ring')].destroyed).toBe(false);
  });
});
