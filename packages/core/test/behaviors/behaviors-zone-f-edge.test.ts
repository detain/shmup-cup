/**
 * Edge cases of the M2-13 behaviours (`core/behaviors`), beyond `behaviors-zone-f.test.ts`, on
 * variants of the shipped zone F roster (free flight — a static camera —, the ship holding its
 * fire and invulnerable):
 *
 * - the tunables of all three behaviours are the documented defaults (the case names the facet
 *   too: it rides the earlier zone's file, R5-P.P5a2, whose roster and DB keep the shipped
 *   facet-monarch entry for the tracking case below);
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
 * - both bosses track the ship's height at their speed, never past their margins (the one `it.each`
 *   tests F and G; it rides here whole, R5-P.P5a2);
 * - the shipped §6 bodies (R5-06.S4a): a ceiling `tissue-cyst` releases its cells out of the
 *   bottom of the body — the anchor's open side — on the shipped interval (130, not the default
 *   60), and the shipped `viral-dart` flies its mover line exactly as the design prices it
 *   (S×30, H4×110 turning at most 4 units a tick, H0 straight on with the heading it had — and
 *   it never fires).
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_BEHAVIORS, DEFAULT_BOSS_BEHAVIORS } from '../../src/behaviors/index.js';
import { BossHit, type BossPart } from '../../src/bosses/index.js';
import { BulletKind } from '../../src/bullets/index.js';
import { PLAYFIELD_H, PLAYFIELD_W } from '../../src/config/index.js';
import { loadContent, type ContentDb } from '../../src/data/index.js';
import { type Enemy } from '../../src/enemies/index.js';
import { ANGLE_UNITS } from '../../src/math/index.js';
import { MoverKind } from '../../src/patterns/index.js';
import { ENGINE_SPRITES, type World } from '../../src/world/index.js';
import { shipped, shippedPatterns } from '../helpers/shipped.js';
import {
  arms,
  bullets,
  curlOf,
  curls,
  freshAngles,
  rosterKitFg,
  run,
  runs,
  biggestStep,
  zoneKitEdgeFg,
  FACET_QUIET,
  type Entry,
} from '../helpers/zone-behaviors.js';
import { v1rel, v1speed } from '../helpers/v1-port.js';

/** The shipped zone F roster (parsed once; the variants are deep copies). */
const ROSTER: Entry[] = [
  ...(shipped('enemies/zone-f.enemies.json').data as { enemies: Entry[] }).enemies,
  // The tracking case tests both zones F and G (its one it.each fights the facet too); it
  // rides the earlier zone's file (R5-P.P5a2), so the shipped facet entry rides this roster.
  ...(shipped('enemies/zone-g.enemies.json').data as { enemies: Entry[] }).enemies.filter(
    (e) => e.id === 'facet-monarch',
  ),
];

const { copy, enemy, boss } = rosterKitFg(ROSTER);

/** Tunables of a quiet `boss.squid` phase: held still, no spreads (nothing else by default). */
const SQUID_QUIET = { trackSpeed: 0, fireTicks: 100_000 } as const;

/** The test DB: the KESTREL, Type A, the shipped rosters and the variants. */
const DB: ContentDb = (() => {
  const { db, issues } = loadContent(
    [
      shipped('player/kestrel.player.json'),
      shipped('weapons/type-a.weapons.json'),
      shipped('enemies/zone-f.enemies.json'),
      ...shippedPatterns(),
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
            // The shipped facet, unchanged, for the tracking case.
            copy('facet-monarch', 'facet-monarch'),
          ],
        },
      },
    ],
    { extraSprites: ENGINE_SPRITES },
  );
  expect(issues).toEqual([]);
  return db;
})();

const { world, spawn, fighting, live, part } = zoneKitEdgeFg(DB);

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

describe('core/behaviors — zone F, edge cases (M2-13)', () => {
  // The case tests both zones F and G (it names the facet with the cell and the squid); it
  // rides the earlier zone's file, whose roster and DB keep the facet entry (R5-P.P5a2).
  it('has the documented default tunables', () => {
    expect(DEFAULT_BEHAVIORS.get('cell.chase')?.params).toEqual({
      speed: v1speed(1.1),
      enterTicks: 50,
      turnRate: 6,
      chaseTicks: 150,
      scatterTicks: 24,
    });
    expect(DEFAULT_BOSS_BEHAVIORS.get('boss.squid')?.params).toEqual({
      trackSpeed: v1speed(0.35),
      margin: v1rel(48),
      curl: 1,
      sweepTicks: 48,
      guardTicks: 60,
      openTicks: 100,
      fireTicks: 70,
      ways: 3,
      spread: 40,
      bulletSpeed: v1speed(1.3),
      gunTicks: 0,
      ring: 0,
      ringSpeed: v1speed(1),
      launchTicks: 0,
      count: 1,
    });
    expect(DEFAULT_BOSS_BEHAVIORS.get('boss.facet')?.params).toEqual({
      trackSpeed: v1speed(0.3),
      margin: v1rel(50),
      wave: 1,
      waveTicks: 40,
      fireTicks: 90,
      ways: 1,
      spread: 32,
      bulletSpeed: v1speed(1.25),
      ring: 0,
      ringTicks: 150,
      ringSpeed: v1speed(1),
      laserTicks: 0,
      laserLength: PLAYFIELD_W,
      laserWidth: v1rel(6),
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
    expect(vx).toBeCloseTo(-v1speed(1.1), 9);
    expect(cell.m0).toBeCloseTo(v1speed(1.1), 9);
    expect(Math.hypot(cell.vx, cell.vy)).toBeCloseTo(v1speed(1.1), 3);
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
    for (const name of ['seg-top-1', 'seg-top-2', 'seg-top-3', 'seg-top-4', 'tip-top']) {
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
          expect(Math.abs(b.screenY - y)).toBeLessThanOrEqual(v1speed(speed) + 1e-9);
          expect(b.screenY).toBeGreaterThanOrEqual(v1rel(margin) - 1e-9);
          expect(b.screenY).toBeLessThanOrEqual(PLAYFIELD_H - v1rel(margin) + 1e-9);
        }
      }
      expect(b.phase).toBe(0);
    },
  );

  // The R5-06.S4a leg: the design's new bodies on their existing scripts (§6), flown shipped.
  it('releases a ceiling tissue-cyst’s cells out of its bottom (the anchor’s open side)', () => {
    const w = world();
    spawn(w, 'tissue-cyst-ceiling', w.camera.x + 300, 60);
    run(w, 131);
    const kids = live(w, 'chaser-cell');
    // Exactly one at tick 131: the shipped `interval` is 130, not the default 60 (a 60-tick
    // cyst would have a second cell in play by now), and the ceiling hatch opens downward.
    expect(kids).toHaveLength(1);
    expect(kids[0].y).toBe(60 + 6); // dy = +hh, below the body (§6's ceiling sibling)
  });

  it('flies the shipped viral-dart line: S×30 at 1.5, H4×110 at the cap, then H0 — never firing', () => {
    const w = world();
    const dart = spawn(w, 'viral-dart', w.camera.x + 420, 40);
    let last = -1;
    let most = 0;
    let heading = -1;
    const out = timeline(w, 200, () => {
      if (dart.mover === MoverKind.Homing) {
        if (dart.m1 > 0) {
          if (last >= 0) {
            const step = Math.abs(((dart.s0 - last + 1.5 * ANGLE_UNITS) % ANGLE_UNITS) - 512);
            most = Math.max(most, step);
          }
          last = dart.s0;
        } else if (heading < 0) {
          heading = dart.s0; // the homing hands its heading to the straight run (no jump)
        }
      }
      return moverOf(dart);
    });
    expect(out).toEqual(['S×30', 'H4×110', 'H0×60']);
    expect(most).toBe(4); // the ship is far below-left: the dart turns at the cap, never past it
    expect(dart.s0).toBe(heading);
    expect(w.bullets.count).toBe(0); // the body is the danger; it never fires (§6)
  });
});
