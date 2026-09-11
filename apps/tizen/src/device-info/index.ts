/**
 * # device-info — TV environment facts for diagnostics
 *
 * **Status: placeholder.** Declares the intended public API only; no logic yet.
 *
 * **Responsibility.** Collects the facts the week-one hardware checks need, for the
 * debug overlay and bug reports: `navigator.userAgent` (expect Chrome/69 on Tizen 5.5),
 * `innerWidth`/`innerHeight`/`devicePixelRatio` (expect 1920×1080), WebGL1/2 +
 * `MAX_TEXTURE_SIZE` + renderer string, AudioContext `sampleRate`/`baseLatency`, and
 * Samsung `webapis.productinfo` model/firmware (loaded from `$WEBAPIS/webapis/webapis.js`,
 * tolerated when absent). Mirrors what tools/input-probe reports.
 *
 * **Implements.**
 * - shmup_tech.md §2.7 "First thing to run on the device", §6 week-one checks 1, 3, 12
 * - input_probe_spec.md question 7 (environment)
 *
 * **Intended public API.** The declarations below are the contract later steps implement.
 *
 * @module
 */
import { defineModule } from '@shmup/core';

/** Module descriptor. */
export const moduleInfo = defineModule({
  name: 'device-info',
  status: 'placeholder',
  specRefs: ['shmup_tech.md §2.7', 'shmup_tech.md §6', 'input_probe_spec.md'],
});

/** Environment snapshot. */
export interface DeviceInfo {
  readonly userAgent: string;
  readonly chromeMajor: number | null;
  readonly cssWidth: number;
  readonly cssHeight: number;
  readonly devicePixelRatio: number;
  readonly webglVersion: 1 | 2 | null;
  readonly maxTextureSize: number | null;
  readonly model: string | null;
  readonly firmware: string | null;
}

// Planned: collectDeviceInfo(win, renderer): DeviceInfo, parseChromeMajor(userAgent): number | null.
