/**
 * The zone content contracts (R5-P.P6): every zone ships its v1 branch until its wave 09 lane
 * flips `remastered`, the v2 branches hold decision R5-D2's numbers, and the shape evaluator
 * (`shapeViolations`) runs either branch — a fake 21,000-px ported stage must sail through every
 * zone's v2 branch and be flagged by the v1 branches that gate what it breaks. The per-zone
 * `content-zone-*.test.ts` files and the release audit read the live branch through
 * `boundsOf` / `contractPx`; the shipped content is still v1-shaped, so they run the v1 gates.
 */
import { describe, expect, it } from 'vitest';
import { K } from '../../../packages/core/test/helpers/v1-port.js';
import { RECOVERY_WINDOW } from '../../playtest/recovery.js';
import {
  ZONE_CONTRACTS,
  boundsOf,
  contractPx,
  contractViolations,
  shapeViolations,
  type StageShape,
  type ZoneLetter,
} from './helpers.js';

const LETTERS: readonly ZoneLetter[] = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];
const B_TO_I: readonly ZoneLetter[] = ['b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];

/** A whole playtest bot run in the ported world sits in 4.0–6.0 min (R5-D2). */
const FAKE_PORTED: StageShape = {
  lengthPx: 21000,
  scrollSec: 270,
  checkpoints: 5,
  directItems: 30,
};

/** The same shape as a live-v1 stage (the port's ×1.5 already applied): in every v1 branch. */
const FAKE_V1_LIVE: StageShape = {
  lengthPx: K * 9000,
  scrollSec: 200,
  checkpoints: 4,
  directItems: 24,
};

describe('integration: the zone contracts (R5-P.P6)', () => {
  it('every zone ships its v1 branch until its wave 09 lane flips the flag', () => {
    for (const letter of LETTERS) {
      const contract = ZONE_CONTRACTS[letter];
      expect(contract.remastered, `zone-${letter}`).toBe(false);
      expect(boundsOf(contract), `zone-${letter}`).toBe(contract.v1);
    }
  });

  it('the v1 branches are the v1 plan: 2.5–4.5 min of scroll, ≥ 4 checkpoints, 4–6 new types, the capsule and item budgets', () => {
    for (const letter of B_TO_I) {
      const v1 = ZONE_CONTRACTS[letter].v1;
      expect(v1.lengthPx, `zone-${letter}`).toBeNull();
      expect(v1.scrollSec, `zone-${letter}`).toEqual([150, 270]);
      expect(v1.checkpointsMin, `zone-${letter}`).toBe(4);
      expect(v1.newTypesBySprite, `zone-${letter}`).toEqual([4, 6]);
      expect(v1.behaviours, `zone-${letter}`).toBeNull();
      expect(v1.capsulesBeforeWarning, `zone-${letter}`).toEqual([12, 32]);
      expect(v1.capsuleWindow.px, `zone-${letter}`).toBe(RECOVERY_WINDOW);
      expect(v1.capsuleWindow.min, `zone-${letter}`).toBe(3);
      expect(v1.directItems, `zone-${letter}`).toEqual([20, 30]);
      expect(v1.blueCapsulesMax, `zone-${letter}`).toBe(2);
    }
  });

  it('zone A keeps the behaviour-count rule its v1 ships case asserted, on both branches (R5-P.D-A §6 reads it)', () => {
    for (const branch of ['v1', 'v2'] as const) {
      const bounds = ZONE_CONTRACTS.a[branch];
      expect(bounds.behaviours, branch).toEqual([6, 8]);
      expect(bounds.newTypesBySprite, branch).toBeNull();
    }
    expect(ZONE_CONTRACTS.a.v1.lengthPx).toEqual([8500, 9500]); // authored in v1 px
    expect(ZONE_CONTRACTS.a.v1.checkpointsMin).toBeNull(); // its ships case pins the exact map
  });

  it('the v2 branches are decision R5-D2: 20,000–22,000 px, 3.75–5.25 min of scroll, a 4.0–6.0 min bot run, ≥ 5 checkpoints, 18–48 capsules, ≥ 3 within 1,350 px of a checkpoint, ≥ 30 items, ≤ 2 blues', () => {
    for (const letter of LETTERS) {
      const v2 = ZONE_CONTRACTS[letter].v2;
      expect(v2.lengthPx, `zone-${letter}`).toEqual([20000, 22000]);
      expect(v2.scrollSec, `zone-${letter}`).toEqual([225, 315]);
      expect(v2.botRunSec, `zone-${letter}`).toEqual([240, 360]);
      expect(v2.checkpointsMin, `zone-${letter}`).toBe(5);
      expect(v2.capsulesBeforeWarning, `zone-${letter}`).toEqual([18, 48]);
      expect(v2.capsuleWindow, `zone-${letter}`).toEqual({ px: 1350, min: 3 });
      expect(v2.directItems[0], `zone-${letter}`).toBe(30);
      expect(v2.blueCapsulesMax, `zone-${letter}`).toBe(2);
    }
    for (const letter of B_TO_I)
      expect(ZONE_CONTRACTS[letter].v2.newTypesBySprite, `zone-${letter}`).toEqual([6, 8]);
  });

  it('a fake 21,000-px ported stage is in contract with every zone on its v2 branch', () => {
    for (const letter of LETTERS) {
      expect(shapeViolations(ZONE_CONTRACTS[letter].v2, 1, FAKE_PORTED), `zone-${letter}`).toEqual(
        [],
      );
    }
  });

  it('the same fake stage breaks the v1 branches that gate it (zone A by length), and a v1-shaped stage passes them all', () => {
    const flagged = shapeViolations(ZONE_CONTRACTS.a.v1, K, FAKE_PORTED);
    expect(flagged).toHaveLength(1);
    expect(flagged[0]).toContain('length');
    for (const letter of B_TO_I)
      expect(shapeViolations(ZONE_CONTRACTS[letter].v1, K, FAKE_PORTED), `zone-${letter}`).toEqual(
        [],
      ); // v1 B–I gate no length, and 5 ≥ 4, 270 ≤ 270, 30 ≤ 30
    for (const letter of LETTERS) {
      const contract = ZONE_CONTRACTS[letter];
      expect(shapeViolations(contract.v1, K, FAKE_V1_LIVE), `zone-${letter} v1`).toEqual([]);
    }
  });

  it('the flag alone moves every reader: boundsOf, contractPx, contractViolations', () => {
    const flipped = { ...ZONE_CONTRACTS.a, remastered: true } as const;
    expect(boundsOf(flipped)).toBe(flipped.v2);
    expect(contractPx(flipped, 21000)).toBe(21000);
    expect(contractViolations(flipped, FAKE_PORTED)).toEqual([]);
    expect(contractViolations(ZONE_CONTRACTS.a, FAKE_PORTED)).toHaveLength(1); // the live branch
    expect(contractPx(ZONE_CONTRACTS.a, 8500)).toBe(K * 8500); // authored v1 px → live px
  });
});
