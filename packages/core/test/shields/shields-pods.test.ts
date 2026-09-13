/**
 * `core/shields` meter shields of M2-04 as pure functions: the front Shield, Free Shield and Rotate
 * Shield pods (14 hits each, independent wear, per-pod i-frames, layouts, the Free Shield's extra
 * pairs and `?` rule, the Rotate spin), Reduce (2 hits, two hurtbox steps, the terrain box never
 * touched), `refillShield` (FULL BARRIER), `clearShield` and the wear frames.
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
  REDUCE,
  REDUCE_HITS,
  ROTATE_POD_ORBIT,
  ROTATE_SHIELD,
  ROTATE_SHIELD_SPIN,
  SHIELD_HIT_IFRAMES,
  SHIELD_POD_HITS,
  SHIELD_POD_WEAR_FRAMES,
  SHIELD_SPECS,
  ShieldHit,
  ShieldKind,
  absorbPodHit,
  absorbShieldHit,
  canGrantShield,
  clearShield,
  createShieldState,
  grantShield,
  placeShieldPods,
  podActive,
  podWearFrame,
  reduceHurtScale,
  refillShield,
  shieldActive,
  shieldFull,
  shieldSpecOf,
  shieldWearFrame,
  tickShield,
} from '../../src/shields/index.js';

/**
 * Breaks one pod with fresh hits spaced past its i-frames.
 *
 * @param s - The shield.
 * @param pod - Pod slot.
 * @param tick - First tick; returns the tick after the last hit.
 * @returns The next free tick.
 */
function breakPod(s: ReturnType<typeof createShieldState>, pod: number, tick: number): number {
  let t = tick;
  while (s.podHits[pod] > 0) {
    absorbPodHit(s, pod, t);
    for (let i = 0; i <= SHIELD_HIT_IFRAMES; i++) tickShield(s, t + 1 + i);
    t += SHIELD_HIT_IFRAMES + 2;
  }
  return t;
}

describe('core/shields specs (M2-04)', () => {
  it('maps every `?` choice to its spec and every kind to its code', () => {
    expect(SHIELD_CHOICES.map((c) => shieldSpecOf(c))).toEqual([
      FORCE_FIELD,
      FRONT_SHIELD,
      FREE_SHIELD,
      ROTATE_SHIELD,
      REDUCE,
    ]);
    for (let k = 1; k < SHIELD_SPECS.length; k++) expect(SHIELD_SPECS[k]?.kind).toBe(k);
    expect(shieldSpecOf('nope' as never)).toBe(FORCE_FIELD);
    for (const spec of [FRONT_SHIELD, FREE_SHIELD, ROTATE_SHIELD]) {
      expect(spec).toMatchObject({ pods: 2, podHits: SHIELD_POD_HITS, maxHits: 28 });
      expect(spec.absorbsTerrain).toBe(false);
    }
    expect(SHIELD_POD_HITS).toBe(14);
    expect(REDUCE).toMatchObject({ maxHits: 2, pods: 0, hurtSteps: 2, absorbsTerrain: false });
  });
});

describe('core/shields pods (M2-04)', () => {
  it('grants two fresh front pods at the nose, above and below the heading', () => {
    const s = createShieldState();
    grantShield(s, FRONT_SHIELD);
    expect([s.kind, s.podCount, s.hits, s.maxHits]).toEqual([ShieldKind.Shield, 2, 28, 28]);
    expect([...s.podHits].slice(0, 2)).toEqual([14, 14]);
    expect([s.podAngle[0], s.podAngle[1]]).toEqual([1024 - FRONT_POD_ANGLE, FRONT_POD_ANGLE]);
    placeShieldPods(s, { x: 100, y: 50 });
    for (let k = 0; k < 2; k++) {
      expect(s.podX[k]).toBeGreaterThan(110); // ahead of the ship
      const d = Math.sqrt((s.podX[k] - 100) ** 2 + (s.podY[k] - 50) ** 2);
      expect(d).toBeCloseTo(POD_ORBIT, 3);
    }
    expect(s.podY[0]).toBeLessThan(50);
    expect(s.podY[1]).toBeGreaterThan(50);
    expect(shieldActive(s) && shieldFull(s)).toBe(true);
  });

  it('never covers the ship itself: ship hits pass a pod shield', () => {
    const s = createShieldState();
    grantShield(s, ROTATE_SHIELD);
    for (const terrain of [false, true]) {
      expect(absorbShieldHit(s, terrain, 5)).toBe(ShieldHit.None);
    }
    expect([s.hits, s.absorbed]).toEqual([28, 0]);
  });

  it('wears each pod independently, with its own i-frames; the last pod takes the shield', () => {
    const s = createShieldState();
    grantShield(s, FRONT_SHIELD);
    expect(absorbPodHit(s, 0, 10)).toBe(ShieldHit.Absorbed);
    expect([s.podHits[0], s.podHits[1], s.hits]).toEqual([13, 14, 27]);
    // Pod 0's i-frames swallow its next hits for free; pod 1 is not covered by them.
    expect(absorbPodHit(s, 0, 10)).toBe(ShieldHit.Blocked);
    expect(absorbPodHit(s, 1, 10)).toBe(ShieldHit.Absorbed);
    expect([s.podIFrames[0], s.podIFrames[1]]).toEqual([SHIELD_HIT_IFRAMES, SHIELD_HIT_IFRAMES]);
    tickShield(s, 10); // not on the hit's own tick
    expect(s.podIFrames[0]).toBe(SHIELD_HIT_IFRAMES);
    let t = breakPod(s, 0, 20);
    expect(podActive(s, 0)).toBe(false);
    expect(podActive(s, 1)).toBe(true);
    expect([s.kind, s.hits, s.podHits[1]]).toEqual([ShieldKind.Shield, 13, 13]);
    expect(s.brokeTick).toBe(t - SHIELD_HIT_IFRAMES - 2);
    // A broken pod takes nothing more.
    expect(absorbPodHit(s, 0, t)).toBe(ShieldHit.None);
    t = breakPod(s, 1, t);
    expect([s.kind, s.hits, s.maxHits, s.podCount]).toEqual([ShieldKind.None, 0, 0, 0]);
    expect(shieldActive(s)).toBe(false);
    expect(absorbPodHit(s, 1, t)).toBe(ShieldHit.None);
    expect(absorbPodHit(s, -1, t)).toBe(ShieldHit.None);
  });

  it('spins the Rotate Shield one step per tick, its pods opposite each other', () => {
    const s = createShieldState();
    grantShield(s, ROTATE_SHIELD);
    expect([s.podAngle[0], s.podAngle[1], s.spin]).toEqual([0, 512, 0]);
    tickShield(s, 1);
    tickShield(s, 2);
    expect(s.spin).toBe(2 * ROTATE_SHIELD_SPIN);
    placeShieldPods(s, { x: 50, y: 50 });
    expect(s.podX[0] + s.podX[1]).toBeCloseTo(100, 6);
    expect(s.podY[0] + s.podY[1]).toBeCloseTo(100, 6);
    expect(Math.sqrt((s.podX[0] - 50) ** 2 + (s.podY[0] - 50) ** 2)).toBeCloseTo(
      ROTATE_POD_ORBIT,
      3,
    );
    // The front Shield never spins.
    const f = createShieldState();
    grantShield(f, FRONT_SHIELD);
    tickShield(f, 1);
    expect(f.spin).toBe(0);
  });

  it('attaches Free Shield pairs where asked, up to four pods, then replaces the most worn pair', () => {
    const s = createShieldState();
    expect(canGrantShield(s, FREE_SHIELD)).toBe(true);
    grantShield(s, FREE_SHIELD, 256); // below the ship
    expect([s.podCount, s.hits]).toEqual([2, 28]);
    expect([s.podAngle[0], s.podAngle[1]]).toEqual([
      256 - FREE_POD_SPREAD / 2,
      256 + FREE_POD_SPREAD / 2,
    ]);
    expect(canGrantShield(s, FREE_SHIELD)).toBe(true); // a pair still fits
    grantShield(s, FREE_SHIELD, 512); // behind
    expect([s.podCount, s.hits, s.maxHits]).toEqual([MAX_SHIELD_PODS, 56, 56]);
    expect([s.podAngle[2], s.podAngle[3]]).toEqual([464, 560]);
    expect(canGrantShield(s, FREE_SHIELD)).toBe(false); // full and fresh
    absorbPodHit(s, 2, 1);
    absorbPodHit(s, 3, 1);
    absorbPodHit(s, 0, 1);
    expect(canGrantShield(s, FREE_SHIELD)).toBe(true); // worn: the next one replaces a pair
    grantShield(s, FREE_SHIELD, 0);
    // Pair 2–3 had 26 hits left, pair 0–1 had 27: the pair at slots 2–3 was replaced, ahead.
    expect([...s.podHits]).toEqual([13, 14, 14, 14]);
    expect([s.podAngle[2], s.podAngle[3]]).toEqual([1024 - 48, 48]);
    expect([s.hits, s.maxHits]).toEqual([55, 56]);
    // Other shields keep `?` greyed while they stand.
    const f = createShieldState();
    grantShield(f, FRONT_SHIELD);
    absorbPodHit(f, 0, 1);
    expect(canGrantShield(f, FRONT_SHIELD)).toBe(false);
    expect(canGrantShield(f, FREE_SHIELD)).toBe(false);
  });

  it('FULL BARRIER refills every pod slot in place; a fresh shield otherwise', () => {
    const s = createShieldState();
    grantShield(s, FREE_SHIELD, 256);
    grantShield(s, FREE_SHIELD, 768);
    breakPod(s, 1, 1);
    absorbPodHit(s, 2, 500);
    expect([s.hits, podActive(s, 1)]).toEqual([41, false]);
    refillShield(s, FREE_SHIELD, 0);
    expect([...s.podHits]).toEqual([14, 14, 14, 14]);
    expect([s.hits, s.maxHits, s.podCount]).toEqual([56, 56, 4]);
    expect(s.podAngle[3]).toBe(768 + 48);
    const none = createShieldState();
    refillShield(none, ROTATE_SHIELD, 0);
    expect([none.kind, none.hits]).toEqual([ShieldKind.RotateShield, 28]);
    const field = createShieldState();
    grantShield(field, FORCE_FIELD);
    absorbShieldHit(field, false, 1);
    refillShield(field, FORCE_FIELD);
    expect(field.hits).toBe(5);
  });

  it('draws each pod in its own wear frame', () => {
    const s = createShieldState();
    grantShield(s, FRONT_SHIELD);
    expect(podWearFrame(s, 0, SHIELD_POD_WEAR_FRAMES)).toBe(0);
    for (let i = 0; i < 11; i++) {
      s.podHits[0]--;
    }
    expect(podWearFrame(s, 0, SHIELD_POD_WEAR_FRAMES)).toBe(3); // 3 of 14 left: critical
    expect(podWearFrame(s, 1, SHIELD_POD_WEAR_FRAMES)).toBe(0);
    expect(podWearFrame(s, 2, SHIELD_POD_WEAR_FRAMES)).toBe(0); // a slot not in use
  });

  it('clears every pod and the hurt scale without a break', () => {
    const s = createShieldState();
    grantShield(s, ROTATE_SHIELD);
    tickShield(s, 1);
    absorbPodHit(s, 0, 1);
    clearShield(s);
    expect([s.kind, s.podCount, s.spin, s.hurtScale, s.brokeTick]).toEqual([0, 0, 0, 1, -1]);
    expect([...s.podHits, ...s.podIFrames]).toEqual(Array(8).fill(0));
    expect([...s.podHitTick]).toEqual([-1, -1, -1, -1]);
  });
});

describe('core/shields Reduce (M2-04)', () => {
  it('shrinks the hurt radius two steps and grows back one per hit', () => {
    expect([reduceHurtScale(2), reduceHurtScale(1), reduceHurtScale(0)]).toEqual([1 / 3, 2 / 3, 1]);
    expect(reduceHurtScale(9)).toBe(1 / 3); // clamped to the steps
    expect(reduceHurtScale(2, 0)).toBe(1); // no steps: never shrinks
    const s = createShieldState();
    grantShield(s, REDUCE);
    expect([s.kind, s.hits, s.maxHits, s.hurtScale]).toEqual([
      ShieldKind.Reduce,
      REDUCE_HITS,
      REDUCE_HITS,
      1 / 3,
    ]);
    expect(absorbShieldHit(s, false, 4)).toBe(ShieldHit.Absorbed);
    expect(s.hurtScale).toBe(2 / 3);
    expect(absorbShieldHit(s, false, 4)).toBe(ShieldHit.Blocked); // i-frames
    for (let t = 5; t < 5 + SHIELD_HIT_IFRAMES; t++) tickShield(s, t);
    expect(absorbShieldHit(s, false, 20)).toBe(ShieldHit.Broke);
    expect([s.kind, s.hurtScale]).toEqual([ShieldKind.None, 1]);
  });

  it('never absorbs terrain (the terrain box is untouched) and wears two frames', () => {
    const s = createShieldState();
    grantShield(s, REDUCE);
    expect(absorbShieldHit(s, true, 1)).toBe(ShieldHit.None);
    expect([s.hits, s.hurtScale]).toEqual([2, 1 / 3]);
    expect(shieldWearFrame(s, 2)).toBe(0);
    absorbShieldHit(s, false, 2);
    expect(shieldWearFrame(s, 2)).toBe(1);
    // FULL BARRIER brings the small hurtbox back.
    refillShield(s, REDUCE);
    expect([s.hits, s.hurtScale]).toEqual([2, 1 / 3]);
  });
});
