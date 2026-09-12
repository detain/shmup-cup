/**
 * Edge cases of `core/shields` (plan M1-11): absorption without a shield, with an emptied one and
 * after the break; terrain against a terrain-absorbing shield during i-frames; i-frames taken
 * from the kind's registered spec; the i-frame count-down (never below zero, not on the hit's own
 * tick); wear frames
 * outside the normal range; what granting and clearing keep; the tables; and `playerHit` with the
 * shield in every ship state (fly-in, invulnerable, god mode, inactive).
 */
import { describe, expect, it } from 'vitest';
import { createDebugFlags } from '../../src/debug/index.js';
import { PlayerHitCause, createPlayer, playerHit, setPlayerState } from '../../src/player/index.js';
import {
  FORCE_FIELD,
  FORCE_FIELD_HITS,
  FORCE_FIELD_WEAR_FRAMES,
  SHIELD_HIT_IFRAMES,
  SHIELD_KIND_NAMES,
  SHIELD_SPECS,
  ShieldHit,
  ShieldKind,
  absorbShieldHit,
  clearShield,
  createShieldState,
  grantShield,
  shieldActive,
  shieldWearFrame,
  tickShield,
  type ShieldSpec,
} from '../../src/shields/index.js';

/**
 * An alive, active ship with a fresh Force Field.
 *
 * @returns The ship.
 */
function shieldedShip(): ReturnType<typeof createPlayer> {
  const ship = createPlayer(0, 3);
  ship.active = true;
  setPlayerState(ship, 'alive');
  grantShield(ship.shield);
  return ship;
}

describe('core/shields edge — tables', () => {
  it('maps every kind to its spec and name', () => {
    expect(SHIELD_SPECS[ShieldKind.None]).toBeNull();
    expect(SHIELD_SPECS[ShieldKind.ForceField]).toBe(FORCE_FIELD);
    expect(SHIELD_SPECS).toHaveLength(Object.keys(ShieldKind).length);
    expect(SHIELD_KIND_NAMES).toEqual(['none', 'forceField']);
    expect(Object.isFrozen(SHIELD_SPECS)).toBe(true);
    expect(Object.isFrozen(SHIELD_KIND_NAMES)).toBe(true);
    expect(Object.values(ShieldHit)).toEqual([0, 1, 2, 3]);
  });

  it('starts every state empty, with no hit or break recorded', () => {
    const s = createShieldState();
    expect({ ...s }).toEqual({
      kind: ShieldKind.None,
      hits: 0,
      maxHits: 0,
      iFrames: 0,
      absorbsTerrain: false,
      hitTick: -1,
      brokeTick: -1,
      absorbed: 0,
    });
    expect(createShieldState()).not.toBe(s);
  });
});

describe('core/shields edge — absorbShieldHit', () => {
  it('lets everything through without a shield and without i-frames', () => {
    const s = createShieldState();
    for (const terrain of [false, true]) {
      expect(absorbShieldHit(s, terrain, 3)).toBe(ShieldHit.None);
    }
    expect([s.hitTick, s.brokeTick, s.absorbed]).toEqual([-1, -1, 0]);
  });

  it('lets hits through a shield kind that has no hits left', () => {
    const s = createShieldState();
    grantShield(s);
    s.hits = 0; // emptied by a tool
    expect(shieldActive(s)).toBe(false);
    expect(absorbShieldHit(s, false, 1)).toBe(ShieldHit.None);
    expect([s.hits, s.iFrames, s.absorbed]).toEqual([0, 0, 0]);
  });

  it('keeps the break i-frames against every hit but terrain, then lets hits through', () => {
    const s = createShieldState();
    grantShield(s);
    s.hits = 1;
    expect(absorbShieldHit(s, false, 50)).toBe(ShieldHit.Broke);
    expect([s.kind, s.maxHits, s.absorbsTerrain, s.iFrames]).toEqual([
      ShieldKind.None,
      0,
      false,
      SHIELD_HIT_IFRAMES,
    ]);
    tickShield(s, 50); // the hit's own tick: no count-down
    for (let t = 51; t <= 50 + SHIELD_HIT_IFRAMES; t++) {
      expect(absorbShieldHit(s, true, t), `terrain ${t}`).toBe(ShieldHit.None);
      expect(absorbShieldHit(s, false, t), `bullet ${t}`).toBe(ShieldHit.Blocked);
      tickShield(s, t);
    }
    expect(s.iFrames).toBe(0);
    expect(absorbShieldHit(s, false, 60)).toBe(ShieldHit.None);
    // Blocked hits never move the hit / break records.
    expect([s.hitTick, s.brokeTick]).toEqual([50, 50]);
  });

  it('blocks terrain during i-frames only for a shield that absorbs terrain', () => {
    const arm: ShieldSpec = { ...FORCE_FIELD, absorbsTerrain: true, maxHits: 3 };
    const s = createShieldState();
    grantShield(s, arm);
    expect(absorbShieldHit(s, true, 0)).toBe(ShieldHit.Absorbed);
    expect(absorbShieldHit(s, true, 1)).toBe(ShieldHit.Blocked);
    expect(s.hits).toBe(2);
    s.iFrames = 0;
    expect(absorbShieldHit(s, true, 2)).toBe(ShieldHit.Absorbed);
    s.iFrames = 0;
    expect(absorbShieldHit(s, true, 3)).toBe(ShieldHit.Broke);
    // Broken: the terrain flag goes with it.
    expect(s.absorbsTerrain).toBe(false);
    s.iFrames = 0;
    expect(absorbShieldHit(s, true, 4)).toBe(ShieldHit.None);
  });

  it("takes its i-frames from the kind's registered spec, not the granted copy", () => {
    // `grantShield` copies the hits and the terrain flag; the i-frames of an absorbed hit come
    // from `SHIELD_SPECS[kind]` (shield variants register their spec by kind — M2-04 / M2-05).
    const s = createShieldState();
    grantShield(s, { ...FORCE_FIELD, iFrames: 0, maxHits: 2 });
    expect(s.maxHits).toBe(2);
    expect(absorbShieldHit(s, false, 0)).toBe(ShieldHit.Absorbed);
    expect(s.iFrames).toBe(SHIELD_SPECS[ShieldKind.ForceField]!.iFrames);
    s.iFrames = 0;
    expect(absorbShieldHit(s, false, 1)).toBe(ShieldHit.Broke);
    expect(s.iFrames).toBe(SHIELD_HIT_IFRAMES);
  });
});

describe('core/shields edge — tickShield', () => {
  it('counts down once per other tick and never below zero', () => {
    const s = createShieldState();
    tickShield(s, 0);
    expect(s.iFrames).toBe(0);
    grantShield(s);
    absorbShieldHit(s, false, 10);
    tickShield(s, 10);
    tickShield(s, 10);
    expect(s.iFrames).toBe(SHIELD_HIT_IFRAMES);
    for (let t = 11; t < 40; t++) tickShield(s, t);
    expect(s.iFrames).toBe(0);
  });
});

describe('core/shields edge — shieldWearFrame', () => {
  it('clamps hits above the maximum and at zero, and handles odd frame counts', () => {
    const s = createShieldState();
    grantShield(s);
    s.hits = 9;
    expect(shieldWearFrame(s, FORCE_FIELD_WEAR_FRAMES)).toBe(0);
    s.hits = 0;
    expect(shieldWearFrame(s, FORCE_FIELD_WEAR_FRAMES)).toBe(FORCE_FIELD_WEAR_FRAMES - 1);
    expect(shieldWearFrame(s, 0)).toBe(0);
    // A 3-hit shield with 3 frames: one frame per hit.
    grantShield(s, { ...FORCE_FIELD, maxHits: 3, wearFrames: 3 });
    const frames: number[] = [];
    for (let hits = 3; hits >= 1; hits--) {
      s.hits = hits;
      frames.push(shieldWearFrame(s, 3));
    }
    expect(frames).toEqual([0, 1, 2]);
    // A broken shield (maxHits 0) draws frame 0.
    clearShield(s);
    expect(shieldWearFrame(s, 4)).toBe(0);
  });
});

describe('core/shields edge — grant and clear', () => {
  it('refreshes a worn shield and keeps the statistics', () => {
    const s = createShieldState();
    grantShield(s);
    absorbShieldHit(s, false, 4);
    absorbShieldHit(s, false, 5); // blocked
    grantShield(s);
    expect([s.hits, s.iFrames, s.hitTick, s.absorbed]).toEqual([FORCE_FIELD_HITS, 0, 4, 2]);
    clearShield(s);
    expect([s.kind, s.hits, s.iFrames, s.absorbsTerrain]).toEqual([ShieldKind.None, 0, 0, false]);
    expect([s.hitTick, s.absorbed]).toEqual([4, 2]);
    // Clearing also ends running i-frames: the next hit goes through.
    grantShield(s);
    absorbShieldHit(s, false, 7);
    clearShield(s);
    expect(absorbShieldHit(s, false, 8)).toBe(ShieldHit.None);
  });

  it('copies the terrain flag from the spec and replaces it on the next grant', () => {
    const s = createShieldState();
    grantShield(s, { ...FORCE_FIELD, absorbsTerrain: true });
    expect(s.absorbsTerrain).toBe(true);
    grantShield(s);
    expect(s.absorbsTerrain).toBe(false);
  });
});

describe('core/shields edge — through playerHit', () => {
  it('leaves the shield alone while the ship ignores hits', () => {
    const debug = createDebugFlags();
    const cases: [string, (ship: ReturnType<typeof createPlayer>) => void][] = [
      ['inactive', (ship) => (ship.active = false)],
      ['entering', (ship) => setPlayerState(ship, 'entering')],
      ['dying', (ship) => setPlayerState(ship, 'dying')],
      ['invulnerable', (ship) => (ship.invulnTicks = 3)],
    ];
    for (const [label, prepare] of cases) {
      const ship = shieldedShip();
      prepare(ship);
      expect(playerHit(ship, PlayerHitCause.Bullet, 1, debug), label).toBe(false);
      expect([ship.shield.hits, ship.shield.absorbed, ship.hits], label).toEqual([5, 0, 0]);
    }
    const god = createDebugFlags();
    god.godMode = true;
    const ship = shieldedShip();
    expect(playerHit(ship, PlayerHitCause.Contact, 1, god)).toBe(false);
    expect(ship.shield.hits).toBe(5);
  });

  it('takes five spaced hits of every absorbable cause, then the ship is hit', () => {
    const debug = createDebugFlags();
    const ship = shieldedShip();
    const causes = [
      PlayerHitCause.Bullet,
      PlayerHitCause.Laser,
      PlayerHitCause.Contact,
      PlayerHitCause.Bullet,
      PlayerHitCause.Laser,
    ];
    let t = 0;
    for (const cause of causes) {
      expect(playerHit(ship, cause, t, debug)).toBe(true);
      for (let k = 0; k <= SHIELD_HIT_IFRAMES; k++) tickShield(ship.shield, t + 1 + k);
      t += SHIELD_HIT_IFRAMES + 2;
    }
    expect(ship.hits).toBe(0);
    expect(ship.shield.brokeTick).toBe(t - SHIELD_HIT_IFRAMES - 2);
    expect(shieldActive(ship.shield)).toBe(false);
    expect(playerHit(ship, PlayerHitCause.Bullet, t, debug)).toBe(true);
    expect([ship.hits, ship.hitCause, ship.hitTick]).toEqual([1, PlayerHitCause.Bullet, t]);
  });
});
