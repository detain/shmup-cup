/**
 * The Direct-mode Arm (plan M2-05, shmup_feat.md §9 "Direct-mode (blue item \"Arm\")"): the tiers
 * the blue items reach (green 3 hits after 1, silver 4 after 4, gold 5 after 9), repair, its
 * terrain absorption with the shield-hit i-frames, a break starting the count over, the wear frames
 * of each tier, and an Arm keeping a MANTA alive against terrain in a World.
 */
import { describe, expect, it } from 'vitest';
import { KNOWN_SCRIPT_IDS } from '../../src/behaviors/index.js';
import { loadContent } from '../../src/data/index.js';
import { Action, commitPlayerInput, createInputSnapshot } from '../../src/input/index.js';
import { PlayerHitCause } from '../../src/player/index.js';
import {
  ARM,
  ARM_SPRITE,
  ARM_TIERS,
  ARM_TIER_BLUE,
  ARM_TIER_HITS,
  ARM_WEAR_FRAMES,
  FORCE_FIELD,
  MAX_ARM_CHARGE,
  SHIELD_HIT_IFRAMES,
  SHIELD_SPECS,
  ShieldHit,
  ShieldKind,
  absorbShieldHit,
  armTierOf,
  armWearFrame,
  clearShield,
  collectArm,
  createShieldState,
  grantShield,
  tickShield,
} from '../../src/shields/index.js';
import { ENGINE_SPRITES, stepWorld } from '../../src/world/index.js';
import { aliveWorld, shipped } from '../helpers/direct.js';

describe('core/shields the Arm (M2-05)', () => {
  it('describes the tiers as data: 3 / 4 / 5 hits after 1 / 4 / 9 blue items', () => {
    expect(ARM_TIER_HITS).toEqual([0, 3, 4, 5]);
    expect(ARM_TIER_BLUE).toEqual([0, 1, 4, 9]);
    expect(ARM_TIERS).toBe(3);
    expect(SHIELD_SPECS[ShieldKind.Arm]).toBe(ARM);
    expect(ARM).toMatchObject({ absorbsTerrain: true, sprite: ARM_SPRITE, pods: 0 });
    expect([0, 1, 3, 4, 8, 9, 50].map(armTierOf)).toEqual([0, 1, 1, 2, 2, 3, 3]);
  });

  it('grows with every blue item and repairs to its tier`s hits', () => {
    const s = createShieldState();
    const seen: Array<[number, number]> = [];
    for (let i = 1; i <= 10; i++) {
      collectArm(s);
      seen.push([s.tier, s.hits]);
    }
    expect(seen).toEqual([
      [1, 3],
      [1, 3],
      [1, 3],
      [2, 4],
      [2, 4],
      [2, 4],
      [2, 4],
      [2, 4],
      [3, 5],
      [3, 5],
    ]);
    expect(s.charge).toBe(10);
    s.hits = 2;
    expect(collectArm(s)).toBe(3);
    expect(s.hits).toBe(5);
    s.charge = MAX_ARM_CHARGE;
    collectArm(s);
    expect(s.charge).toBe(MAX_ARM_CHARGE);
  });

  it('replaces any other shield with a fresh green Arm', () => {
    const s = createShieldState();
    grantShield(s, FORCE_FIELD);
    expect(collectArm(s)).toBe(1);
    expect([s.kind, s.hits, s.maxHits, s.charge]).toEqual([ShieldKind.Arm, 3, 3, 1]);
  });

  it('absorbs terrain contact (with i-frames), and a break starts the count over', () => {
    const s = createShieldState();
    for (let i = 0; i < 4; i++) collectArm(s); // silver: 4 hits
    expect(absorbShieldHit(s, true, 10)).toBe(ShieldHit.Absorbed);
    expect(s.hits).toBe(3);
    expect(s.iFrames).toBe(SHIELD_HIT_IFRAMES);
    // The i-frames swallow the next contacts for free.
    expect(absorbShieldHit(s, true, 11)).toBe(ShieldHit.Blocked);
    expect(s.hits).toBe(3);
    for (let t = 11; t < 11 + SHIELD_HIT_IFRAMES; t++) tickShield(s, t);
    expect(s.iFrames).toBe(0);
    let result: number = ShieldHit.None;
    for (let t = 30; s.hits > 0; t += 20) {
      result = absorbShieldHit(s, false, t);
      for (let k = 1; k <= SHIELD_HIT_IFRAMES; k++) tickShield(s, t + k);
    }
    expect(result).toBe(ShieldHit.Broke);
    expect([s.kind, s.tier, s.charge]).toEqual([ShieldKind.None, 0, 0]);
    // Without the Arm, terrain gets through.
    expect(absorbShieldHit(s, true, 500)).toBe(ShieldHit.None);
    expect(collectArm(s)).toBe(1);
  });

  it('draws its tier`s block of wear frames, and clears without a break', () => {
    const s = createShieldState();
    expect(armWearFrame(s)).toBe(0);
    collectArm(s);
    expect(armWearFrame(s)).toBe(0);
    s.hits = 1;
    expect(armWearFrame(s)).toBe(ARM_WEAR_FRAMES - 1);
    for (let i = 0; i < 8; i++) collectArm(s);
    expect(armWearFrame(s)).toBe(2 * ARM_WEAR_FRAMES);
    s.hits = 1;
    expect(armWearFrame(s)).toBe(3 * ARM_WEAR_FRAMES - 1);
    clearShield(s);
    expect([s.kind, s.hits, s.tier, s.charge, s.absorbsTerrain]).toEqual([
      ShieldKind.None,
      0,
      0,
      0,
      false,
    ]);
  });

  it('keeps a MANTA alive against terrain in a World: the Arm takes the contact, not the ship', () => {
    const { db, issues } = loadContent(
      [
        shipped('player/manta.player.json'),
        shipped('weapons/direct.weapons.json'),
        shipped('tilesets/terrain-a.tileset.json'),
        {
          path: 'stages/floor.stage.json',
          data: {
            formatVersion: 1,
            kind: 'stage',
            id: 'floor',
            name: 'FLOOR',
            music: { stage: 'Stage', boss: 'Boss' },
            length: 3000,
            camera: [{ x: 0, speed: 0 }],
            checkpoints: [{ x: 0 }],
            parallax: [],
            tilemap: {
              tileSize: 8,
              tileset: 'terrain-a',
              rowsTall: 25,
              generator: {
                type: 'heightfield',
                segments: [{ from: 0, to: 3384, floor: { base: 40, amp: 0, period: 64, seed: 4 } }],
              },
            },
            events: [],
          },
        },
      ],
      { extraSprites: ENGINE_SPRITES, knownScripts: KNOWN_SCRIPT_IDS },
    );
    expect(issues).toEqual([]);
    const input = createInputSnapshot();
    for (const armed of [true, false]) {
      const w = aliveWorld(db, { stage: 'floor' });
      const ship = w.players[0];
      if (armed) collectArm(ship.shield);
      // Down into the floor and stay there.
      for (let t = 0; t < 30; t++) {
        commitPlayerInput(input.players[0], Action.Down);
        stepWorld(w, input);
        if (ship.state !== 'alive') break;
      }
      if (armed) {
        expect(ship.shield.absorbed).toBeGreaterThan(0);
        expect(ship.shield.hits).toBeLessThan(3);
        expect(ship.hits).toBe(0);
      } else {
        expect(ship.hits).toBe(1);
        expect(ship.hitCause).toBe(PlayerHitCause.Terrain);
      }
      commitPlayerInput(input.players[0], 0);
    }
  });
});
