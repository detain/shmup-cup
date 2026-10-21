/**
 * Edge cases of the M2-13 `boss.facet` behaviour (`core/behaviors`), beyond
 * `behaviors-zone-g.test.ts`, on variants of the shipped zone G roster (free flight — a static
 * camera —, the ship holding its fire and invulnerable): the wave as flown (to 40 units in, then
 * 80 ticks between the turn points), `wave` rounded (2.5 → 3) and `waveTicks` floored, values
 * below 1 → a unit each way every other tick; aimed purple needles from both arm tips (`ways`
 * floored, at least 1), rings from the core while its crystals still armour it (each turned half a
 * gap, none below 1), detached lane lasers from the core, pointing left, as tuned, one at a time
 * (none by default); the shipped arms carried on without a jump whenever the crystals break; and —
 * the fix of this test round — a phase waves on from arms curled past its own sweep (before,
 * clamped to the sweep, they jumped 67 units at the first turn point).
 *
 * The defaults case and the tracking `it.each` (which fight the squid and the facet together)
 * ride the earlier zone's file, `behaviors-zone-f-edge.test.ts` (R5-P.P5a2).
 */
import { describe, expect, it } from 'vitest';
import { BossHit } from '../../src/bosses/index.js';
import { BulletKind, LaserPhase } from '../../src/bullets/index.js';
import { loadContent, type ContentDb } from '../../src/data/index.js';
import { ANGLE_UNITS } from '../../src/math/index.js';
import { ENGINE_SPRITES } from '../../src/world/index.js';
import { shipped, shippedPatterns } from '../helpers/shipped.js';
import {
  arms,
  bullets,
  biggestStep,
  curls,
  freshAngles,
  rosterKitFg,
  run,
  runs,
  turn,
  zoneKitEdgeFg,
  FACET_QUIET,
  type Entry,
} from '../helpers/zone-behaviors.js';

/** The shipped zone G roster (parsed once; the variants are deep copies). */
const ROSTER: Entry[] = [
  ...(shipped('enemies/zone-g.enemies.json').data as { enemies: Entry[] }).enemies,
];

const { boss } = rosterKitFg(ROSTER);

/** The test DB: the KESTREL, Type A, the shipped zone G roster and the variants. */
const DB: ContentDb = (() => {
  const { db, issues } = loadContent(
    [
      shipped('player/kestrel.player.json'),
      shipped('weapons/type-a.weapons.json'),
      shipped('enemies/zone-g.enemies.json'),
      ...shippedPatterns(),
      {
        path: 'enemies/v.enemies.json',
        data: {
          formatVersion: 1,
          kind: 'enemies',
          enemies: [
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

const { fighting, part } = zoneKitEdgeFg(DB);

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
