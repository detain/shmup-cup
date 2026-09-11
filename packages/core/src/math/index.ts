/**
 * # math — deterministic math: binary angles, lookup tables, fixed point, easing
 *
 * **Status: placeholder.** Declares the intended public API only; no game logic yet.
 *
 * **Responsibility.** Engine-independent math for the simulation. Angles are *binary angles* (256 or
 * 1024 steps per turn — decide when implementing) with precomputed sin/cos tables and a
 * table-based atan2, because `Math.sin/cos/atan2` results can differ between JS engines
 * (Chromium 69 on the TV vs. desktop Chrome/Electron). Also aim quantisation
 * (16/32 directions for the retro look), fixed-point helpers and Penner easing tables for
 * deterministic motion.
 *
 * **Implements.**
 * - shmup_feat.md §22 Determinism — sin/cos lookup tables with binary angles, table-based atan2
 * - shmup_feat.md §12 — aimed bullets quantised to 16 or 32 directions
 * - shmup_tech.md §4.6 — Penner easing table (no time-based tween engines in the sim)
 *
 * **Intended public API.** The declarations below (and the `Planned` notes at the
 * end of the file) are the contract later steps implement.
 *
 * @module
 */
import { defineModule } from '../module-info.js';

/** Module descriptor (see {@link defineModule}). */
export const moduleInfo = defineModule({
  name: 'math',
  status: 'placeholder',
  specRefs: ['shmup_feat.md §22', 'shmup_feat.md §12', 'shmup_tech.md §4.6'],
});

/** Angle in binary units: 0 = +x (right), increasing clockwise on screen, one turn = table size. */
export type BinaryAngle = number;

/** Easing curve sampled from a precomputed table: `t` and result in 0…1. */
export type EasingFn = (t: number) => number;

// Planned functions:
//   sinB(a: BinaryAngle): number, cosB(a: BinaryAngle): number
//   atan2B(dy: number, dx: number): BinaryAngle          (table-based, deterministic)
//   quantizeAngle(a: BinaryAngle, directions: 16 | 32): BinaryAngle
//   toFixed(x: number): number / fromFixed(f: number): number   (16.16 helpers)
//   clamp, lerp, EASINGS: Readonly<Record<'linear' | 'inQuad' | 'outQuad' | ..., EasingFn>>
