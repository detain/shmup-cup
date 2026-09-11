/**
 * `core/shields` (plan M1-11): the Force Field's hit counter, shield-hit i-frames, the break, no
 * terrain absorption, wear frames — as pure functions and through `playerHit`.
 */
import { describe, expect, it } from 'vitest';
import { createDebugFlags } from '../../src/debug/index.js';
import { PlayerHitCause, createPlayer, playerHit, setPlayerState } from '../../src/player/index.js';
import {
  FORCE_FIELD,
  FORCE_FIELD_HITS,
  FORCE_FIELD_SPRITE,
  SHIELD_HIT_IFRAMES,
  SHIELD_KIND_NAMES,
  ShieldHit,
  ShieldKind,
  absorbShieldHit,
  clearShield,
  createShieldState,
  grantShield,
  moduleInfo,
  shieldActive,
  shieldWearFrame,
  tickShield,
} from '../../src/shields/index.js';

describe('core/shields', () => {
  it('describes itself', () => {
    expect(moduleInfo.name).toBe('shields');
    expect(moduleInfo.status).toBe('partial');
    expect(moduleInfo.specRefs).toContain('shmup_feat.md §9');
  });

  it('defines the Force Field: 5 hits, 8-tick i-frames, no terrain, its sprite', () => {
    expect(FORCE_FIELD).toMatchObject({
      kind: ShieldKind.ForceField,
      maxHits: 5,
      iFrames: 8,
      absorbsTerrain: false,
      sprite: FORCE_FIELD_SPRITE,
      wearFrames: 4,
    });
    expect([FORCE_FIELD_HITS, SHIELD_HIT_IFRAMES]).toEqual([5, 8]);
    expect(SHIELD_KIND_NAMES[ShieldKind.ForceField]).toBe('forceField');
    expect(Object.isFrozen(FORCE_FIELD)).toBe(true);
  });

  it('grants and clears a shield', () => {
    const s = createShieldState();
    expect(shieldActive(s)).toBe(false);
    grantShield(s);
    expect([s.kind, s.hits, s.maxHits, s.iFrames, s.absorbsTerrain]).toEqual([1, 5, 5, 0, false]);
    expect(shieldActive(s)).toBe(true);
    clearShield(s);
    expect([s.kind, s.hits, s.maxHits, s.iFrames]).toEqual([0, 0, 0, 0]);
    expect(shieldActive(s)).toBe(false);
  });

  it('absorbs a hit, then swallows hits for free during its 8 i-frames', () => {
    const s = createShieldState();
    grantShield(s);
    expect(absorbShieldHit(s, false, 10)).toBe(ShieldHit.Absorbed);
    expect([s.hits, s.iFrames, s.hitTick]).toEqual([4, 8, 10]);
    // The tick of the hit does not count down: hits on ticks 11 … 18 are blocked.
    tickShield(s, 10);
    for (let t = 11; t <= 18; t++) {
      expect(absorbShieldHit(s, false, t), `tick ${t}`).toBe(ShieldHit.Blocked);
      tickShield(s, t);
    }
    expect([s.hits, s.iFrames]).toEqual([4, 0]);
    expect(absorbShieldHit(s, false, 19)).toBe(ShieldHit.Absorbed);
    expect(s.hits).toBe(3);
    expect(s.absorbed).toBe(10);
  });

  it('breaks on its last hit; the break i-frames still cover the bare ship', () => {
    const s = createShieldState();
    grantShield(s);
    let t = 0;
    for (let i = 0; i < 4; i++) {
      expect(absorbShieldHit(s, false, t)).toBe(ShieldHit.Absorbed);
      s.iFrames = 0;
      t += 20;
    }
    expect(absorbShieldHit(s, false, t)).toBe(ShieldHit.Broke);
    expect([s.kind, s.hits, s.brokeTick, s.hitTick]).toEqual([ShieldKind.None, 0, t, t]);
    expect(shieldActive(s)).toBe(false);
    expect(absorbShieldHit(s, false, t + 1)).toBe(ShieldHit.Blocked);
    s.iFrames = 0;
    expect(absorbShieldHit(s, false, t + 9)).toBe(ShieldHit.None);
  });

  it('never absorbs terrain, not even during i-frames', () => {
    const s = createShieldState();
    grantShield(s);
    expect(absorbShieldHit(s, true, 0)).toBe(ShieldHit.None);
    expect(s.hits).toBe(5);
    absorbShieldHit(s, false, 1);
    expect(s.iFrames).toBeGreaterThan(0);
    expect(absorbShieldHit(s, true, 2)).toBe(ShieldHit.None);
    // A shield that absorbs terrain (a Direct-mode Arm, M2-05) would take it.
    grantShield(s, { ...FORCE_FIELD, absorbsTerrain: true });
    expect(absorbShieldHit(s, true, 3)).toBe(ShieldHit.Absorbed);
  });

  it('shows its wear: fresh at 5 and 4 hits, then worn, damaged, critical', () => {
    const s = createShieldState();
    expect(shieldWearFrame(s, 4)).toBe(0);
    grantShield(s);
    const frames: number[] = [];
    for (let hits = 5; hits >= 1; hits--) {
      s.hits = hits;
      frames.push(shieldWearFrame(s, 4));
    }
    expect(frames).toEqual([0, 0, 1, 2, 3]);
    expect(shieldWearFrame(s, 1)).toBe(0);
  });

  it('lets playerHit hand hits to the shield first (terrain still reaches the ship)', () => {
    const ship = createPlayer(0, 3);
    ship.active = true;
    setPlayerState(ship, 'alive');
    const debug = createDebugFlags();
    grantShield(ship.shield);
    expect(playerHit(ship, PlayerHitCause.Bullet, 5, debug)).toBe(true);
    expect([ship.hits, ship.shield.hits]).toEqual([0, 4]);
    expect(playerHit(ship, PlayerHitCause.Contact, 6, debug)).toBe(true); // i-frames
    expect([ship.hits, ship.shield.hits]).toEqual([0, 4]);
    expect(playerHit(ship, PlayerHitCause.Terrain, 7, debug)).toBe(true);
    expect([ship.hits, ship.hitCause, ship.shield.hits]).toEqual([1, PlayerHitCause.Terrain, 4]);
    // Invulnerability and god mode keep hits away from the shield too.
    ship.invulnTicks = 5;
    ship.shield.iFrames = 0;
    expect(playerHit(ship, PlayerHitCause.Laser, 30, debug)).toBe(false);
    expect(ship.shield.hits).toBe(4);
  });
});
