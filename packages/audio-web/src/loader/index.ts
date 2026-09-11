/**
 * # loader — audio asset loading and decoding
 *
 * **Status: placeholder.** Declares the intended public API only; no logic yet.
 *
 * **Responsibility.** Fetches and decodes audio during loading screens only: SFX banks decoded up front,
 * music decoded per stage (or streamed), with codec fallback (OGG → MP3/M4A) and progress
 * reporting for the Boot scene. Keeps total decoded PCM inside the TV memory budget
 * (< 100 MB app total).
 *
 * **Implements.**
 * - shmup_tech.md §2.4 — decodeAudioData is slow on TVs; pre-decode during loading
 * - shmup_tech.md §2.5 — memory budget < 100 MB
 * - shmup_feat.md §19
 *
 * **Intended public API.** The declarations below (and the `Planned` notes at the
 * end of the file) are the contract later steps implement.
 *
 * @module
 */
import { defineModule } from '@shmup/core';

/** Module descriptor. */
export const moduleInfo = defineModule({
  name: 'loader',
  status: 'placeholder',
  specRefs: ['shmup_tech.md §2.4', 'shmup_tech.md §2.5', 'shmup_feat.md §19'],
});

/** Progress callback for loading screens (0…1). */
export type LoadProgress = (fraction: number) => void;

// Planned: loadSfxBank(context, specs, onProgress): Promise<Map<string, AudioBuffer>>,
//          pickSupportedCodec(candidates): string.
