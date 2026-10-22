/**
 * Zone A (AZURE VERGE) — its content contract (R5-P.P6, decision R5-D2). The v1 branch is the
 * v1 plan's shape (its length is the only one a test gated in v1; its roster rule is the
 * behaviour count, never a new-types-over-earlier-zones count — zone A has no earlier zone);
 * the v2 branch is the ported shape every zone shares. `remastered: false` on this tree — the
 * flip is authored: wave 11's R5-01.S5b stage commit carries it (with the §17 content rewrites
 * and its golden re-bless) — and the design §11 item tally already rides this row, so the
 * release audit moves to the design's composition the moment the flag flips.
 *
 * @module
 */
import { MIN_RECOVERY_CAPSULES, RECOVERY_WINDOW } from '../../playtest/recovery.js';
import type { ZoneContract } from './helpers.js';

export const zoneAContract: ZoneContract = {
  remastered: true,
  v1: {
    lengthPx: [8500, 9500], // authored in v1 px; the ships case maps it with contractPx
    scrollSec: [150, 270], // 2.5–4.5 min to the WARNING
    botRunSec: null, // v1 gated the whole run only through its playtest (3–6 min, the title)
    checkpointsMin: null, // the ships case pins the exact [0, 3500, 6000] map (v1 px)
    newTypesBySprite: null, // zone A debuts — there is no earlier zone to be new against
    // **The behaviour count (6–8 distinct scripts besides the boss): wave 09's R5-P.D-A §6
    // relies on this rule — it must never stop and report.** Both branches keep it.
    behaviours: [6, 8],
    capsulesBeforeWarning: [12, 32],
    capsuleWindow: { px: RECOVERY_WINDOW, min: MIN_RECOVERY_CAPSULES },
    directItems: [20, 30],
    blueCapsulesMax: 2,
  },
  v2: {
    lengthPx: [20000, 22000],
    scrollSec: [225, 315], // 3.75–5.25 min
    botRunSec: [240, 360], // 4.0–6.0 min (the zone lanes' whole-run playtests read this)
    checkpointsMin: 5, // R5-D2's floor for every zone; the ships case keeps its exact-map
    // gate until R5-P.D-A rewrites the section layout — this field stays advisory for zone A.
    newTypesBySprite: null, // still no earlier zone after the port
    behaviours: [6, 8],
    capsulesBeforeWarning: [18, 48],
    capsuleWindow: { px: 1350, min: 3 }, // ≥ 3 sources within 1,350 px of a checkpoint's x
    directItems: [30, Number.POSITIVE_INFINITY], // R5-D2 sets the floor; the zone's R5 lane caps it
    blueCapsulesMax: 2,
  },
  // The design §11 tally of the ported 34-entry plan (red 9, green 9, blue 8, orange 3,
  // yellow 3, octagon 2) — octagons exact, rare pickups ceiling 3. R5-01.S5b authored it here
  // so the release audit moves to it the moment its stage commit flips `remastered`.
  directItemComposition: { octagons: 2, maxRare: 3 },
};
