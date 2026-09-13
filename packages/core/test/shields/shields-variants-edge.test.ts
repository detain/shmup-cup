/**
 * `core/shields` meter shields of plan M2-04 — edge cases beyond `shields-pods.test.ts` (pure
 * functions):
 *
 * - the tables: kind names and `?` choices agree, every pod spec's `maxHits` is its pods' sum;
 * - layouts: the Rotate pods opposite each other, a Free Shield heading wrapped / rounded /
 *   NaN, the spin wrapping round the circle and added to every pod, nothing placed without pods;
 * - replacing one family by the other: a field over pods empties every slot, pods over a field
 *   (or over Reduce's small hurtbox) start without the field's i-frames and at the full hurtbox;
 *   a front Shield over four Free Shield pods leaves the extra slots empty;
 * - Free Shield pairs: the most worn pair is replaced (a broken pod counts as worn), the first on
 *   a tie; `canGrantShield` for every pairing of kinds;
 * - pods: out-of-range and **fractional** slots never touch the shield (regression: a fractional
 *   slot used to cost the shield a hit), i-frames per pod counted from each pod's own hit tick,
 *   blocked hits counted, the last pod leaves the ship uncovered;
 * - FULL BARRIER (`refillShield`): keeps the Rotate spin and every angle, restores broken pods,
 *   swaps another kind for a fresh one, Reduce back to its smallest hurtbox (or a fresh one after
 *   it broke);
 * - wear frames: a broken pod shows its last frame, a fractional slot and single-frame sprites
 *   frame 0; `reduceHurtScale` for odd inputs.
 */
import { describe, expect, it } from 'vitest';
import { SHIELD_CHOICES } from '../../src/config/index.js';
import {
  FORCE_FIELD,
  FREE_POD_SPREAD,
  FREE_SHIELD,
  FRONT_POD_ANGLE,
  FRONT_SHIELD,
  MAX_SHIELD_PODS,
  POD_ORBIT,
  POD_RADIUS,
  REDUCE,
  REDUCE_FRAMES,
  REDUCE_HURT_STEPS,
  REDUCE_SPRITE,
  ROTATE_POD_ORBIT,
  ROTATE_SHIELD,
  ROTATE_SHIELD_SPIN,
  SHIELD_CHOICE_SPECS,
  SHIELD_HIT_IFRAMES,
  SHIELD_KIND_NAMES,
  SHIELD_POD_HITS,
  SHIELD_POD_SPRITE,
  SHIELD_POD_WEAR_FRAMES,
  SHIELD_SPECS,
  SHIELD_SPRITES,
  ShieldHit,
  ShieldKind,
  absorbPodHit,
  absorbShieldHit,
  canGrantShield,
  createShieldState,
  grantShield,
  placeShieldPods,
  podActive,
  podWearFrame,
  reduceHurtScale,
  refillShield,
  shieldActive,
  shieldFull,
  tickShield,
  type ShieldSpec,
  type ShieldState,
} from '../../src/shields/index.js';

/**
 * A shield granted from a spec.
 *
 * @param spec - What to grant.
 * @param heading - Free Shield heading.
 * @returns The state.
 */
function granted(spec: ShieldSpec, heading = 0): ShieldState {
  const s = createShieldState();
  grantShield(s, spec, heading);
  return s;
}

/**
 * Distance of a placed pod from a point.
 *
 * @param s - The shield.
 * @param k - Pod slot.
 * @param x - Point x.
 * @param y - Point y.
 * @returns The distance.
 */
function podDist(s: ShieldState, k: number, x: number, y: number): number {
  return Math.sqrt((s.podX[k] - x) * (s.podX[k] - x) + (s.podY[k] - y) * (s.podY[k] - y));
}

describe('core/shields variants edge — tables', () => {
  it('names every kind in code order and maps every `?` choice to the spec of its kind', () => {
    expect(SHIELD_KIND_NAMES).toEqual([
      'none',
      'forceField',
      'shield',
      'freeShield',
      'rotateShield',
      'reduce',
    ]);
    for (const choice of SHIELD_CHOICES) {
      const spec = SHIELD_CHOICE_SPECS[choice];
      expect(SHIELD_KIND_NAMES[spec.kind]).toBe(choice);
      expect(SHIELD_SPECS[spec.kind]).toBe(spec);
      expect(Object.isFrozen(spec)).toBe(true);
    }
    expect(Object.keys(SHIELD_CHOICE_SPECS)).toEqual([...SHIELD_CHOICES]);
    expect(SHIELD_SPRITES).toEqual(['shields/force-field', SHIELD_POD_SPRITE, REDUCE_SPRITE]);
    expect([POD_RADIUS, POD_ORBIT, ROTATE_POD_ORBIT, MAX_SHIELD_PODS]).toEqual([4, 13, 16, 4]);
  });

  it('pod specs: maxHits is the pods` sum, no hurtbox steps; fields have no pods', () => {
    for (const spec of SHIELD_SPECS) {
      if (spec === null) continue;
      if (spec.pods > 0) {
        expect(spec.maxHits).toBe(spec.pods * spec.podHits);
        expect(spec.hurtSteps).toBe(0);
        expect(spec.sprite).toBe(SHIELD_POD_SPRITE);
        expect(spec.wearFrames).toBe(SHIELD_POD_WEAR_FRAMES);
        expect(spec.podOrbit).toBeGreaterThan(0);
      } else {
        expect([spec.podHits, spec.podOrbit]).toEqual([0, 0]);
      }
      expect(spec.iFrames).toBe(SHIELD_HIT_IFRAMES);
    }
    expect([REDUCE.hurtSteps, REDUCE.wearFrames, REDUCE_HURT_STEPS, REDUCE_FRAMES]).toEqual([
      2, 2, 2, 2,
    ]);
  });
});

describe('core/shields variants edge — layouts', () => {
  it('Rotate pods start opposite each other (0 and 512), front pods at ±FRONT_POD_ANGLE', () => {
    const r = granted(ROTATE_SHIELD);
    expect([r.podAngle[0], r.podAngle[1], r.podOrbit]).toEqual([0, 512, ROTATE_POD_ORBIT]);
    const f = granted(FRONT_SHIELD, 300); // the heading never moves the front pods
    expect([f.podAngle[0], f.podAngle[1], f.podOrbit]).toEqual([
      1024 - FRONT_POD_ANGLE,
      FRONT_POD_ANGLE,
      POD_ORBIT,
    ]);
  });

  it('wraps, rounds and sanitises a Free Shield heading', () => {
    const half = FREE_POD_SPREAD / 2;
    const cases: [number, number][] = [
      [-256, 768],
      [1024 + 128, 128],
      [255.6, 256],
      [NaN, 0],
    ];
    for (const [heading, at] of cases) {
      const s = granted(FREE_SHIELD, heading);
      expect([s.podAngle[0], s.podAngle[1]], String(heading)).toEqual([
        (at - half + 1024) & 1023,
        (at + half) & 1023,
      ]);
    }
  });

  it('spins the Rotate pods by `spin`, wrapping round the circle, `podOrbit` px out', () => {
    const s = granted(ROTATE_SHIELD);
    for (let t = 1; t <= 86; t++) tickShield(s, t);
    expect(s.spin).toBe((86 * ROTATE_SHIELD_SPIN) & 1023);
    placeShieldPods(s, { x: 200.5, y: 80.25 });
    for (let k = 0; k < 2; k++) {
      expect(podDist(s, k, 200.5, 80.25)).toBeCloseTo(ROTATE_POD_ORBIT, 3);
    }
    // Pod 0 at angle `spin` (8 units: just below straight ahead).
    expect(s.podX[0]).toBeGreaterThan(200.5 + ROTATE_POD_ORBIT - 0.1);
    expect(s.podY[0]).toBeGreaterThan(80.25);
  });

  it('places nothing without pods', () => {
    const s = granted(FORCE_FIELD);
    s.podX.fill(-7);
    s.podY.fill(-7);
    placeShieldPods(s, { x: 10, y: 10 });
    expect([...s.podX, ...s.podY]).toEqual(Array(8).fill(-7));
  });
});

describe('core/shields variants edge — replacing one family by the other', () => {
  it('a field over pods empties every slot; pods over a field start without its i-frames', () => {
    const s = granted(FREE_SHIELD, 0);
    grantShield(s, FREE_SHIELD, 512);
    absorbPodHit(s, 3, 5);
    grantShield(s, FORCE_FIELD);
    expect([s.kind, s.podCount, s.hits, s.maxHits, s.podMaxHits]).toEqual([
      ShieldKind.ForceField,
      0,
      5,
      5,
      0,
    ]);
    expect([...s.podHits, ...s.podIFrames]).toEqual(Array(8).fill(0));
    // The field covers the ship now.
    expect(absorbShieldHit(s, false, 6)).toBe(ShieldHit.Absorbed);
    expect(s.iFrames).toBe(SHIELD_HIT_IFRAMES);
    grantShield(s, ROTATE_SHIELD);
    expect([s.kind, s.iFrames, s.podCount, s.hits]).toEqual([ShieldKind.RotateShield, 0, 2, 28]);
    expect(absorbShieldHit(s, false, 7)).toBe(ShieldHit.None);
  });

  it('pods over Reduce bring the full hurtbox back; Reduce over pods shrinks it', () => {
    const s = granted(REDUCE);
    expect(s.hurtScale).toBe(1 / 3);
    grantShield(s, FRONT_SHIELD);
    expect(s.hurtScale).toBe(1);
    grantShield(s, REDUCE);
    expect([s.kind, s.hurtScale, s.podCount]).toEqual([ShieldKind.Reduce, 1 / 3, 0]);
    expect(absorbShieldHit(s, false, 1)).toBe(ShieldHit.Absorbed);
  });

  it('a front Shield over four Free Shield pods keeps two slots and empties the others', () => {
    const s = granted(FREE_SHIELD, 0);
    grantShield(s, FREE_SHIELD, 256);
    expect(s.podCount).toBe(4);
    absorbPodHit(s, 2, 1);
    grantShield(s, FRONT_SHIELD);
    expect([s.kind, s.podCount, s.hits, s.maxHits]).toEqual([ShieldKind.Shield, 2, 28, 28]);
    expect([...s.podHits]).toEqual([14, 14, 0, 0]);
    expect([...s.podIFrames]).toEqual([0, 0, 0, 0]);
    expect([...s.podHitTick]).toEqual([-1, -1, -1, -1]);
    expect(podActive(s, 2)).toBe(false);
  });

  it('a Free Shield over a standing front Shield is a fresh pair, not an added one', () => {
    const s = granted(FRONT_SHIELD);
    absorbPodHit(s, 0, 1);
    grantShield(s, FREE_SHIELD, 256);
    expect([s.kind, s.podCount, s.hits]).toEqual([ShieldKind.FreeShield, 2, 28]);
    expect([s.podAngle[0], s.podAngle[1]]).toEqual([208, 304]);
  });
});

describe('core/shields variants edge — Free Shield pairs', () => {
  it('replaces the pair with a broken pod; on a tie, the first pair', () => {
    const s = granted(FREE_SHIELD, 0);
    grantShield(s, FREE_SHIELD, 512);
    // Slot 2 broken (14 left in its pair), pair 0 worn by 1 (27 left).
    for (let t = 0; t < SHIELD_POD_HITS; t++) {
      absorbPodHit(s, 2, t * 20);
      for (let i = 1; i <= SHIELD_HIT_IFRAMES + 1; i++) tickShield(s, t * 20 + i);
    }
    absorbPodHit(s, 1, 999);
    expect([...s.podHits]).toEqual([14, 13, 0, 14]);
    grantShield(s, FREE_SHIELD, 256);
    expect([...s.podHits]).toEqual([14, 13, 14, 14]);
    expect([s.podAngle[2], s.podAngle[3]]).toEqual([208, 304]);
    // A tie (27 and 27): the first pair goes.
    absorbPodHit(s, 3, 1000);
    expect([...s.podHits]).toEqual([14, 13, 14, 13]);
    grantShield(s, FREE_SHIELD, 768);
    expect([...s.podHits]).toEqual([14, 14, 14, 13]);
    expect([s.podAngle[0], s.podAngle[1]]).toEqual([720, 816]);
    expect([s.hits, s.maxHits, s.podCount]).toEqual([55, 56, 4]);
    // The replaced pair starts without i-frames or a hit tick.
    expect([s.podIFrames[0], s.podIFrames[1], s.podHitTick[0], s.podHitTick[1]]).toEqual([
      0, 0, -1, -1,
    ]);
  });

  it('a pair is added next to a pair with a broken pod', () => {
    const s = granted(FREE_SHIELD, 0);
    s.podHits[1] = 1;
    s.hits = 15;
    expect(absorbPodHit(s, 1, 3)).toBe(ShieldHit.Broke);
    expect([s.kind, s.podCount, s.hits]).toEqual([ShieldKind.FreeShield, 2, 14]);
    expect(canGrantShield(s, FREE_SHIELD)).toBe(true);
    grantShield(s, FREE_SHIELD, 512);
    expect([...s.podHits]).toEqual([14, 0, 14, 14]);
    expect([s.podCount, s.hits, s.maxHits]).toEqual([4, 42, 56]);
    expect(podActive(s, 1)).toBe(false);
  });

  it('canGrantShield for every pairing: only a standing Free Shield with room or wear accepts', () => {
    const specs = [FORCE_FIELD, FRONT_SHIELD, FREE_SHIELD, ROTATE_SHIELD, REDUCE];
    for (const standing of specs) {
      for (const choice of specs) {
        const s = granted(standing);
        const expected = standing === FREE_SHIELD && choice === FREE_SHIELD; // a pair fits
        expect(canGrantShield(s, choice), `${standing.kind} ← ${choice.kind}`).toBe(expected);
      }
    }
    for (const choice of specs) expect(canGrantShield(createShieldState(), choice)).toBe(true);
    // A broken shield (i-frames still running) is no shield: `?` can be taken.
    const broken = granted(REDUCE);
    broken.hits = 1;
    expect(absorbShieldHit(broken, false, 1)).toBe(ShieldHit.Broke);
    expect(broken.iFrames).toBe(SHIELD_HIT_IFRAMES);
    expect(canGrantShield(broken, REDUCE)).toBe(true);
  });
});

describe('core/shields variants edge — pod hits', () => {
  it('slots out of range or not whole never touch the shield (regression)', () => {
    for (const slot of [-1, 2, 3, 4, NaN, Infinity, 0.5, 1.5, -0.5]) {
      const s = granted(FRONT_SHIELD);
      expect(absorbPodHit(s, slot, 7), String(slot)).toBe(ShieldHit.None);
      expect([s.hits, s.absorbed, s.hitTick, s.brokeTick], String(slot)).toEqual([28, 0, -1, -1]);
      expect(podActive(s, slot)).toBe(false);
      expect(podWearFrame(s, slot, SHIELD_POD_WEAR_FRAMES), String(slot)).toBe(0);
    }
  });

  it('counts each pod`s i-frames down from its own hit tick', () => {
    const s = granted(ROTATE_SHIELD);
    expect(absorbPodHit(s, 0, 10)).toBe(ShieldHit.Absorbed);
    tickShield(s, 10);
    expect(absorbPodHit(s, 1, 11)).toBe(ShieldHit.Absorbed);
    tickShield(s, 11);
    expect([s.podIFrames[0], s.podIFrames[1]]).toEqual([
      SHIELD_HIT_IFRAMES - 1,
      SHIELD_HIT_IFRAMES,
    ]);
    for (let t = 12; t < 12 + SHIELD_HIT_IFRAMES - 1; t++) tickShield(s, t);
    expect([s.podIFrames[0], s.podIFrames[1]]).toEqual([0, 1]);
    expect(absorbPodHit(s, 0, 30)).toBe(ShieldHit.Absorbed);
    expect(absorbPodHit(s, 1, 30)).toBe(ShieldHit.Blocked);
    expect([s.podHits[0], s.podHits[1], s.hits, s.absorbed]).toEqual([12, 13, 25, 4]);
    expect([s.podHitTick[0], s.podHitTick[1], s.hitTick]).toEqual([30, 11, 30]);
    // The field i-frames are never started by a pod.
    expect(s.iFrames).toBe(0);
  });

  it('the last pod takes the shield and leaves the ship uncovered (no field i-frames)', () => {
    const s = granted(FRONT_SHIELD);
    s.podHits[0] = 0;
    s.podHits[1] = 1;
    s.hits = 1;
    tickShield(s, 1);
    expect(absorbPodHit(s, 1, 40)).toBe(ShieldHit.Broke);
    expect([s.kind, s.podCount, s.hits, s.maxHits, s.spin, s.brokeTick]).toEqual([
      ShieldKind.None,
      0,
      0,
      0,
      0,
      40,
    ]);
    expect(shieldActive(s)).toBe(false);
    expect(absorbShieldHit(s, false, 41)).toBe(ShieldHit.None);
  });
});

describe('core/shields variants edge — FULL BARRIER', () => {
  it('keeps the Rotate spin and every angle, restores a broken pod', () => {
    const s = granted(ROTATE_SHIELD);
    for (let t = 1; t <= 5; t++) tickShield(s, t);
    s.podHits[0] = 0;
    s.hits = 14;
    expect(shieldFull(s)).toBe(false);
    refillShield(s, ROTATE_SHIELD);
    expect([s.spin, s.podAngle[0], s.podAngle[1]]).toEqual([5 * ROTATE_SHIELD_SPIN, 0, 512]);
    expect([s.podHits[0], s.hits, shieldFull(s), podActive(s, 0)]).toEqual([14, 28, true, true]);
  });

  it('swaps another standing kind for a fresh one of the session`s kind', () => {
    const s = granted(FRONT_SHIELD);
    absorbPodHit(s, 0, 1);
    refillShield(s, ROTATE_SHIELD, 256);
    expect([s.kind, s.podCount, s.hits, s.podAngle[0], s.podAngle[1]]).toEqual([
      ShieldKind.RotateShield,
      2,
      28,
      0,
      512,
    ]);
    const field = granted(FORCE_FIELD);
    refillShield(field, FREE_SHIELD, 256);
    expect([field.kind, field.podCount, field.podAngle[0], field.podAngle[1]]).toEqual([
      ShieldKind.FreeShield,
      2,
      208,
      304,
    ]);
    const pods = granted(ROTATE_SHIELD);
    refillShield(pods, REDUCE);
    expect([pods.kind, pods.podCount, pods.hits, pods.hurtScale]).toEqual([
      ShieldKind.Reduce,
      0,
      2,
      1 / 3,
    ]);
  });

  it('a Free Shield FULL BARRIER over a broken Free Shield is one fresh pair at the heading', () => {
    const s = granted(FREE_SHIELD, 0);
    grantShield(s, FREE_SHIELD, 512);
    s.podHits.fill(0);
    s.podHits[3] = 1;
    s.hits = 1;
    expect(absorbPodHit(s, 3, 9)).toBe(ShieldHit.Broke);
    refillShield(s, FREE_SHIELD, 768);
    expect([s.kind, s.podCount, s.hits, s.maxHits]).toEqual([ShieldKind.FreeShield, 2, 28, 28]);
    expect([...s.podHits]).toEqual([14, 14, 0, 0]);
    expect([s.podAngle[0], s.podAngle[1]]).toEqual([720, 816]);
  });

  it('Reduce: back to the smallest hurtbox, or a fresh one after it broke', () => {
    const s = granted(REDUCE);
    absorbShieldHit(s, false, 1);
    expect(s.hurtScale).toBe(2 / 3);
    refillShield(s, REDUCE);
    expect([s.hits, s.maxHits, s.hurtScale]).toEqual([2, 2, 1 / 3]);
    s.hits = 1;
    s.iFrames = 0;
    expect(absorbShieldHit(s, false, 50)).toBe(ShieldHit.Broke);
    expect([s.kind, s.hurtScale]).toEqual([ShieldKind.None, 1]);
    refillShield(s, REDUCE);
    expect([s.kind, s.hits, s.hurtScale, s.iFrames]).toEqual([ShieldKind.Reduce, 2, 1 / 3, 0]);
  });
});

describe('core/shields variants edge — wear frames and hurt scale', () => {
  it('a broken pod shows its last frame; single-frame sprites always frame 0', () => {
    const s = granted(FRONT_SHIELD);
    s.podHits[0] = 0;
    expect(podWearFrame(s, 0, SHIELD_POD_WEAR_FRAMES)).toBe(SHIELD_POD_WEAR_FRAMES - 1);
    expect(podWearFrame(s, 0, 1)).toBe(0);
    expect(podWearFrame(s, 1, 2)).toBe(0);
    s.podHits[1] = 7;
    expect(podWearFrame(s, 1, 2)).toBe(1);
    s.podHits[1] = 8;
    expect(podWearFrame(s, 1, 2)).toBe(0);
    // Every hit count maps to a frame in range, monotonically.
    let last = -1;
    for (let h = SHIELD_POD_HITS; h >= 0; h--) {
      s.podHits[1] = h;
      const f = podWearFrame(s, 1, SHIELD_POD_WEAR_FRAMES);
      expect(f).toBeGreaterThanOrEqual(last);
      expect(f).toBeLessThan(SHIELD_POD_WEAR_FRAMES);
      last = f;
    }
  });

  it('reduceHurtScale: odd inputs never shrink the ship, more steps shrink it further', () => {
    for (const [hits, steps] of [
      [NaN, 2],
      [-1, 2],
      [0, 2],
      [2, NaN],
      [2, -1],
      [2, 0],
    ] as const) {
      expect(reduceHurtScale(hits, steps), `${hits}/${steps}`).toBe(1);
    }
    expect(reduceHurtScale(3, 3)).toBe(1 / 4);
    expect(reduceHurtScale(1, 3)).toBe(3 / 4);
    expect(reduceHurtScale(Infinity)).toBe(1 / 3);
    for (let h = 0; h <= REDUCE_HURT_STEPS; h++) {
      const scale = reduceHurtScale(h);
      expect(scale).toBeGreaterThan(0);
      expect(scale).toBeLessThanOrEqual(1);
    }
  });
});
