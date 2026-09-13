/**
 * Edge cases of the Direct-mode Arm (plan M2-05, shmup_feat.md §9) beyond `shields-arm`:
 * `armTierOf` on odd counts, `armWearFrame` in every tier and wear state (and with an out-of-range
 * tier), `collectArm` over pods, over a broken Arm and during its i-frames, the meter's grant rules
 * against a standing Arm, and in a World: bullets and bodies worn off the Arm (the break cue, the
 * ship unharmed), the shield batch drawing the tier's block of frames, and the hash seeing the
 * tier and the blue-item count.
 */
import { describe, expect, it } from 'vitest';
import { BulletKind, spawnBullet } from '../../src/bullets/index.js';
import { hashWorld } from '../../src/debug/index.js';
import { SFX_CUES, SimEventKind, type SimEvent } from '../../src/events/index.js';
import { createInputSnapshot } from '../../src/input/index.js';
import {
  ARM_SPRITE,
  ARM_TIERS,
  ARM_TIER_BLUE,
  ARM_TIER_HITS,
  ARM_WEAR_FRAMES,
  FORCE_FIELD,
  FRONT_SHIELD,
  MAX_ARM_CHARGE,
  SHIELD_HIT_IFRAMES,
  SHIELD_KIND_NAMES,
  SHIELD_SPRITES,
  ShieldHit,
  ShieldKind,
  absorbShieldHit,
  armTierOf,
  armWearFrame,
  canGrantShield,
  collectArm,
  createShieldState,
  grantShield,
  shieldActive,
} from '../../src/shields/index.js';
import { ENGINE_SPRITES, stepWorld, type World } from '../../src/world/index.js';
import { aliveWorld, directDb } from '../helpers/direct.js';

/** The shipped Direct-mode content. */
const DB = directDb();

/**
 * Drains a world's events.
 *
 * @param w - The world.
 * @returns Copies of the events.
 */
function drain(w: World): SimEvent[] {
  const out: SimEvent[] = [];
  w.events.drain((e) => out.push({ ...e }));
  return out;
}

/**
 * A shield state that collected `n` blue items.
 *
 * @param n - Blue items.
 * @returns The state.
 */
function armOf(n: number): ReturnType<typeof createShieldState> {
  const s = createShieldState();
  for (let i = 0; i < n; i++) collectArm(s);
  return s;
}

describe('core/shields the Arm — tables and pure helpers', () => {
  it('names the Arm, lists its sprite, and keeps the tier tables consistent', () => {
    expect(SHIELD_KIND_NAMES[ShieldKind.Arm]).toBe('arm');
    expect(SHIELD_SPRITES).toContain(ARM_SPRITE);
    expect(ENGINE_SPRITES).toContain(ARM_SPRITE);
    expect(ARM_TIER_HITS).toHaveLength(ARM_TIERS + 1);
    expect(ARM_TIER_BLUE).toHaveLength(ARM_TIERS + 1);
    for (let t = 1; t <= ARM_TIERS; t++) {
      expect(ARM_TIER_HITS[t]).toBeGreaterThan(ARM_TIER_HITS[t - 1]);
      expect(ARM_TIER_BLUE[t]).toBeGreaterThan(ARM_TIER_BLUE[t - 1]);
    }
    expect(MAX_ARM_CHARGE).toBeGreaterThanOrEqual(ARM_TIER_BLUE[ARM_TIERS]);
  });

  it('armTierOf: nothing for odd counts, the highest tier reached otherwise', () => {
    expect(armTierOf(Number.NaN)).toBe(0);
    expect(armTierOf(-5)).toBe(0);
    expect(armTierOf(0.5)).toBe(0);
    expect(armTierOf(3.99)).toBe(1);
    expect(armTierOf(8.5)).toBe(2);
    expect(armTierOf(Infinity)).toBe(ARM_TIERS);
  });

  it('armWearFrame: fresh / worn / critical in each tier`s block', () => {
    const table: number[][] = [];
    for (const blue of [1, 4, 9]) {
      const s = armOf(blue);
      const row: number[] = [];
      for (let hits = s.maxHits; hits >= 1; hits--) {
        s.hits = hits;
        row.push(armWearFrame(s));
      }
      table.push(row);
    }
    expect(table).toEqual([
      [0, 1, 2], // green, 3 hits
      [3, 3, 4, 5], // silver, 4 hits
      [6, 6, 7, 7, 8], // gold, 5 hits
    ]);
    for (const row of table) {
      for (const frame of row) expect(frame).toBeLessThan(ARM_TIERS * ARM_WEAR_FRAMES);
    }
  });

  it('armWearFrame: an out-of-range tier draws the gold block; no tier, frame 0', () => {
    const s = armOf(9);
    s.tier = 7;
    expect(armWearFrame(s)).toBe(2 * ARM_WEAR_FRAMES);
    s.tier = Number.NaN;
    expect(armWearFrame(s)).toBe(0);
    s.tier = -1;
    expect(armWearFrame(s)).toBe(0);
  });
});

describe('core/shields the Arm — collectArm corners', () => {
  it('replaces shield pods (none left) with a fresh green Arm', () => {
    const s = createShieldState();
    grantShield(s, FRONT_SHIELD);
    expect(s.podCount).toBeGreaterThan(0);
    expect(collectArm(s)).toBe(1);
    expect([s.kind, s.podCount, s.hits, s.hurtScale, s.charge]).toEqual([
      ShieldKind.Arm,
      0,
      3,
      1,
      1,
    ]);
  });

  it('after a break the count starts over at one blue item', () => {
    const s = armOf(8); // silver, four more to go for gold
    while (shieldActive(s)) {
      absorbShieldHit(s, false, 0);
      s.iFrames = 0;
    }
    expect([s.tier, s.charge]).toEqual([0, 0]);
    expect(collectArm(s)).toBe(1);
    expect(s.charge).toBe(1);
  });

  it('a repair keeps running i-frames; replacing another shield drops them', () => {
    const s = armOf(1);
    expect(absorbShieldHit(s, false, 5)).toBe(ShieldHit.Absorbed);
    expect(s.iFrames).toBe(SHIELD_HIT_IFRAMES);
    collectArm(s);
    expect([s.hits, s.iFrames]).toEqual([3, SHIELD_HIT_IFRAMES]);
    const t = createShieldState();
    grantShield(t, FORCE_FIELD);
    absorbShieldHit(t, false, 5);
    expect(t.iFrames).toBeGreaterThan(0);
    collectArm(t);
    expect(t.iFrames).toBe(0);
  });

  it('a standing Arm refuses the meter`s `?` grant; a gone one accepts it', () => {
    const s = armOf(4);
    expect(canGrantShield(s, FORCE_FIELD)).toBe(false);
    s.hits = 0;
    s.kind = ShieldKind.None;
    expect(canGrantShield(s, FORCE_FIELD)).toBe(true);
  });

  it('does not absorb anything once spent, terrain included', () => {
    const s = armOf(1);
    s.hits = 0;
    expect(absorbShieldHit(s, true, 1)).toBe(ShieldHit.None);
    expect(absorbShieldHit(s, false, 1)).toBe(ShieldHit.None);
  });
});

describe('core/shields the Arm — in a World', () => {
  it('wears off under bullets without harming the ship; the last one breaks it with the cue', () => {
    const w = aliveWorld(DB);
    const ship = w.players[0];
    collectArm(ship.shield); // green: 3 hits
    w.debugFlags.godMode = false;
    const input = createInputSnapshot();
    drain(w);
    const cues: number[] = [];
    for (let hit = 0; hit < 3; hit++) {
      spawnBullet(w, ship.x, ship.y, 0, 0, BulletKind.RoundPink);
      stepWorld(w, input);
      for (const e of drain(w)) if (e.kind === SimEventKind.Sfx) cues.push(e.id);
      for (let t = 0; t < SHIELD_HIT_IFRAMES + 1; t++) stepWorld(w, input);
      drain(w);
    }
    expect(ship.state).toBe('alive');
    expect(ship.hits).toBe(0);
    expect(shieldActive(ship.shield)).toBe(false);
    expect([ship.shield.tier, ship.shield.charge]).toEqual([0, 0]);
    expect(cues.filter((id) => id === SFX_CUES.ShieldHit)).toHaveLength(2);
    expect(cues.filter((id) => id === SFX_CUES.ShieldBreak)).toHaveLength(1);
  });

  it('takes an enemy body too', () => {
    const w = aliveWorld(DB);
    const ship = w.players[0];
    collectArm(ship.shield);
    const e = w.enemies.spawn(DB.enemyIndex.get('drifter') ?? -1, ship.x, ship.y);
    expect(e).not.toBeNull();
    stepWorld(w, createInputSnapshot());
    expect(ship.state).toBe('alive');
    expect(ship.shield.hits).toBe(2);
  });

  it('draws the Arm`s sprite in its tier`s block of wear frames', () => {
    const w = aliveWorld(DB);
    const ship = w.players[0];
    const input = createInputSnapshot();
    const armId = DB.sprites.index.get(ARM_SPRITE);
    expect(armId).toBeGreaterThanOrEqual(0);
    for (const [blue, frame] of [
      [1, 0],
      [4, 3],
      [9, 6],
    ] as const) {
      while (ship.shield.charge < blue) collectArm(ship.shield);
      stepWorld(w, input);
      const batch = w.powerups.shieldBatch;
      expect(batch.count).toBe(1);
      expect([batch.spriteId[0], batch.frame[0]]).toEqual([armId, frame]);
    }
    ship.shield.hits = 1;
    stepWorld(w, input);
    expect(w.powerups.shieldBatch.frame[0]).toBe(8);
  });

  it('hashes the tier and the blue-item count', () => {
    const a = aliveWorld(DB);
    const b = aliveWorld(DB);
    expect(hashWorld(a)).toBe(hashWorld(b));
    collectArm(a.players[0].shield);
    collectArm(b.players[0].shield);
    expect(hashWorld(a)).toBe(hashWorld(b));
    b.players[0].shield.charge = 2; // same tier and hits, another count
    expect(hashWorld(a)).not.toBe(hashWorld(b));
    b.players[0].shield.charge = 1;
    b.players[0].shield.tier = 2;
    expect(hashWorld(a)).not.toBe(hashWorld(b));
  });
});
