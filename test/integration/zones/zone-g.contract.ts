/**
 * Zone G (PRISM LABYRINTH) — its content contract (R5-P.P6, decision R5-D2). The v1 branch is the
 * v1 plan's shape (M2 rulings as PRISM LABYRINTH's per-zone cases always asserted them: no length gate,
 * 2.5–4.5 min of scroll, ≥ 4 checkpoints, 4–6 new enemy types by sprite over the earlier
 * zones); the v2 branch is the ported shape R5-D2 sets for every zone B–I. `remastered`
 * was false until R5-07.S5b (wave 11) ported PRISM LABYRINTH to the design and flipped it.
 *
 * @module
 */
import { MIN_RECOVERY_CAPSULES, RECOVERY_WINDOW } from '../../playtest/recovery.js';
import type { ZoneContract } from './helpers.js';

export const zoneGContract: ZoneContract = {
  remastered: true,
  // R5-07.S5b flips the flag: the stage now ships the design geometry, the 37-entry
  // item plan, the PRISM SENTINEL and the rebuilt MONARCH. The composition row is the design
  // §11 census computed from the stage file in the S5b report (octagon 3 exact, rare ceiling 2
  // — orange 1, yellow 2).
  directItemComposition: { octagons: 3, maxRare: 2 },
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
    botRunSec: [240, 360], // 4.0–6.0 min (the zone lanes' whole-run playtests read this)
    checkpointsMin: 5,
    newTypesBySprite: [6, 8],
    behaviours: null,
    capsulesBeforeWarning: [18, 48],
    capsuleWindow: { px: 1350, min: 3 }, // ≥ 3 sources within 1,350 px of a checkpoint's x
    directItems: [30, Number.POSITIVE_INFINITY], // R5-D2 sets the floor; the zone's R5 lane caps it
    blueCapsulesMax: 2,
  },
};
