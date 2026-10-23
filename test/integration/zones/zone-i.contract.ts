/**
 * Zone I (ABYSSAL THRONE) — its content contract (R5-P.P6, decision R5-D2). The v1 branch is the
 * v1 plan's shape (M2 rulings as ABYSSAL THRONE's per-zone cases always asserted them: no length gate,
 * 2.5–4.5 min of scroll, ≥ 4 checkpoints, 4–6 new enemy types by sprite over the earlier
 * zones); the v2 branch is the ported shape R5-D2 sets for every zone B–I. The contract cases are
 * ON: R5-09.S5b lands this zone's design plan — the six-checkpoint recovery rule, 29
 * carrier/formation capsule sources with at most one blue, the 225–315-second scroll to the WARNING,
 * the eight new enemy types by sprite, and the directItems row (required with the flip).
 *
 * @module
 */
import { MIN_RECOVERY_CAPSULES, RECOVERY_WINDOW } from '../../playtest/recovery.js';
import type { ZoneContract } from './helpers.js';

export const zoneIContract: ZoneContract = {
  remastered: true,
  v1: {
    lengthPx: null, // v1 gated a stage length only in zone A's ships case
    scrollSec: [150, 270], // 2.5–4.5 min to the WARNING
    botRunSec: null, // v1 gated the whole run only through its playtest (3–6 min, the title)
    checkpointsMin: 4,
    newTypesBySprite: [4, 6], // new to the zones a run can have flown before
    behaviours: null, // zones B–I count new types, not behaviours
    capsulesBeforeWarning: [12, 32],
    capsuleWindow: { px: RECOVERY_WINDOW, min: MIN_RECOVERY_CAPSULES },
    directItems: [20, 30],
    blueCapsulesMax: 2,
  },
  v2: {
    lengthPx: [20000, 22000],
    scrollSec: [225, 315], // 3.75–5.25 min
    botRunSec: [240, 420], // 4.0–7.0 min (the zone lanes' whole-run playtests read this)
    checkpointsMin: 5,
    newTypesBySprite: [6, 8],
    behaviours: null,
    capsulesBeforeWarning: [18, 48],
    capsuleWindow: { px: 1350, min: 3 }, // ≥ 3 sources within 1,350 px of a checkpoint's x
    directItems: [30, Number.POSITIVE_INFINITY], // R5-D2 sets the floor; the zone's R5 lane caps it
    blueCapsulesMax: 2,
  },
  // The design §11 tally of the authored 34-entry plan (red 10, green 10, blue 9, octagon 2,
  // yellow 2, orange 1) — two power-meter octagons, rare pickups at two (orange 1, yellow 2).
  // R5-09.S5b authored it with the flip so the release audit moves to the design's composition
  // (the R5-01.S5b adjudication: a remastered zone's composition rides its contract row).
  directItemComposition: { octagons: 2, maxRare: 2 },
};
