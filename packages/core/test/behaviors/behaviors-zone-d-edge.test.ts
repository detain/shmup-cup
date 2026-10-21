/**
 * Edge cases of the M2-12 behaviours (`core/behaviors`), beyond `behaviors-zone-d.test.ts`, on
 * variants of the shipped zone D roster (free flight — a static camera — the ship holding its fire
 * and invulnerable):
 *
 * - the tunables of all three behaviours are the documented defaults;
 * - `boss.bastion`: `spin` rounded to whole units (4.6 → 5, −0.4 → still), set only on the parts
 *   attached to a core (the hub — the arm segments ride it, the hull's emitters never turn),
 *   reversing every whole `reverseTicks`, the arms keeping their angle through a phase change;
 *   lane lasers attached to the emitter that fires them, pointing left, as tuned, from the
 *   standing emitters in turn, none once both are gone, a `firstLaser` below 1 → one tick; aimed
 *   spreads from the core (`ways` floored, 0 = none); rings alternating by half a gap (below 1 =
 *   none); tracking within its margins at its speed.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_BEHAVIORS, DEFAULT_BOSS_BEHAVIORS } from '../../src/behaviors/index.js';
import { BossHit, BossState } from '../../src/bosses/index.js';
import { BulletKind, LaserPhase } from '../../src/bullets/index.js';
import { PLAYFIELD_H, PLAYFIELD_W } from '../../src/config/index.js';
import {
  DEFAULT_BOSS_X,
  DEFAULT_BOSS_Y,
  loadContent,
  type ContentDb,
} from '../../src/data/index.js';
import { ANGLE_UNITS } from '../../src/math/index.js';
import { ENGINE_SPRITES } from '../../src/world/index.js';
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

/** The shipped zone D roster (parsed once; the variants are deep copies). */
const ROSTER: Entry[] = [
  ...(shipped('enemies/zone-d.enemies.json').data as { enemies: Entry[] }).enemies,
];

const { boss } = rosterKitDe(ROSTER);

/** Tunables of a quiet `boss.bastion` phase: held still, no lane for a long while, no bullets. */
const BASTION_QUIET = { trackSpeed: 0, laserTicks: 100_000, firstLaser: 100_000 } as const;

/** The test DB: the KESTREL, Type A, the shipped zone D roster and the variants. */
const DB: ContentDb = (() => {
  const { db, issues } = loadContent(
    [
      shipped('player/kestrel.player.json'),
      shipped('weapons/type-a.weapons.json'),
      shipped('enemies/zone-d.enemies.json'),
      ...shippedPatterns(),
      {
        path: 'enemies/v.enemies.json',
        data: {
          formatVersion: 1,
          kind: 'enemies',
          enemies: [
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
          ],
        },
      },
    ],
    { extraSprites: ENGINE_SPRITES },
  );
  expect(issues).toEqual([]);
  return db;
})();

const { fighting, part } = zoneKitEdgeDe(DB);

describe('core/behaviors — zone D, edge cases (M2-12)', () => {
  // The case tests both zones D and E; it rides the earlier zone's file (R5-P.P5a1).
  it('has the documented default tunables', () => {
    expect(DEFAULT_BEHAVIORS.get('rear.swoop')?.params).toEqual({
      speed: v1speed(1.6),
      turnX: v1screenX(280),
      hold: 18,
      ways: 1,
      spread: 40,
      bulletSpeed: v1speed(1.3),
      leaveSpeed: v1speed(1.4),
    });
    expect(DEFAULT_BOSS_BEHAVIORS.get('boss.bastion')?.params).toEqual({
      trackSpeed: v1speed(0.35),
      margin: v1rel(44),
      spin: 4,
      reverseTicks: 0,
      laserTicks: 120,
      firstLaser: 60,
      laserLength: PLAYFIELD_W,
      laserWidth: v1rel(8),
      telegraph: 45,
      active: 50,
      fireTicks: 100,
      ways: 0,
      spread: 40,
      bulletSpeed: v1speed(1.3),
      ring: 0,
      ringTicks: 150,
      ringSpeed: v1speed(1),
    });
    expect(DEFAULT_BOSS_BEHAVIORS.get('boss.steed')?.params).toEqual({
      cx: DEFAULT_BOSS_X,
      cy: DEFAULT_BOSS_Y,
      rx: v1rel(8),
      ry: v1rel(40),
      bobSpeed: 3,
      closedTicks: 150,
      openTicks: 110,
      launchTicks: 45,
      minis: 2,
      fireTicks: 80,
      ways: 3,
      spread: 44,
      bulletSpeed: v1speed(1.3),
      ring: 0,
      ringSpeed: v1speed(1),
      gape: 0,
    });
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
    const margin = v1rel(44);
    const speed = v1speed(0.35); // phase 0
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
