/**
 * # synth — deterministic PCM synthesis for placeholder sounds and music
 *
 * **Responsibility.** Turns data into samples, with no Web Audio involved: sound effects from a
 * ZzFX-style parameter set ({@link renderSfx}) and chip songs from a small tracker format
 * ({@link renderSong}: 4–6 channels of pulse 12.5 / 25 / 50 %, triangle, noise and saw voices,
 * per-instrument ADSR, vibrato, arpeggio and sweep, patterns + an order list, `loopFromOrder`).
 * Placeholders render mono at {@link SYNTH_SAMPLE_RATE} (22,050 Hz) during loading; the audio
 * `loader` wraps the samples in `AudioBuffer`s.
 *
 * **Determinism.** Pure TypeScript and bit-reproducible on every engine: the "randomness" of a
 * sound and its noise come from the core's seeded sfc32 RNG (never `Math.random`), sines from the
 * core's committed integer table (`SIN_TABLE_Q16`, linearly interpolated), pitch ratios from
 * literal constants — only IEEE `+ − × ÷`, no `Math.sin` / `Math.pow`. The same parameters always
 * give the same samples ({@link pcmHash} fingerprints them for tests and the preview script).
 *
 * **Loop points.** A row lasts a whole number of samples (`round(rate × speed / 60)`), so a song's
 * `loopStart` / `loopEnd` are exact sample indices, and the loop region holds the loop's steady
 * state (notes ringing over the loop end continue across the seam — see {@link renderSong}).
 *
 * **Implements.**
 * - shmup_feat.md §19 — procedural placeholder SFX and chip music with intro + seamless loop
 * - shmup_tech.md §4.3 — ZzFX / ZzFXM-style procedural sounds (own implementation, decision D23)
 * - shmup_feat.md §22 — determinism (no engine-dependent maths)
 *
 * **Public API.** SFX: {@link renderSfx}, {@link sfxLength}, {@link SfxParams},
 * {@link SfxShape}, {@link SFX_SHAPES}, {@link DEFAULT_SFX_PARAMS}. Songs: {@link renderSong},
 * {@link RenderedSong}, {@link Song}, {@link SongInstrument}, {@link SongVibrato},
 * {@link SongChannel}, {@link SongPattern}, {@link ChipWave}, {@link CHIP_WAVES},
 * {@link parseTrack}, {@link ParsedTrack}, {@link TrackStep}, {@link TrackStepKind},
 * {@link songRowSamples}, {@link DEFAULT_SONG_VOLUME}, {@link MAX_SONG_TAIL_SECONDS}. Helpers:
 * {@link SYNTH_SAMPLE_RATE}, {@link noteFrequency}, {@link semitoneRatio}, {@link sineOfCycle},
 * {@link pcmHash}.
 *
 * @module
 */
import { defineModule } from '@shmup/core';

export {
  DEFAULT_SFX_PARAMS,
  SFX_SHAPES,
  renderSfx,
  sfxLength,
  type SfxParams,
  type SfxShape,
} from './sfx.js';
export {
  CHIP_WAVES,
  DEFAULT_SONG_VOLUME,
  MAX_SONG_TAIL_SECONDS,
  TrackStepKind,
  parseTrack,
  renderSong,
  songRowSamples,
  type ChipWave,
  type ParsedTrack,
  type RenderedSong,
  type Song,
  type SongChannel,
  type SongInstrument,
  type SongPattern,
  type SongVibrato,
  type TrackStep,
} from './song.js';
export { noteFrequency, semitoneRatio, sineOfCycle } from './tables.js';

/** Module descriptor. */
export const moduleInfo = defineModule({
  name: 'synth',
  status: 'implemented',
  specRefs: ['shmup_feat.md §19', 'shmup_tech.md §4.3', 'shmup_feat.md §22'],
});

/** Sample rate of the placeholder sounds and songs (mono). */
export const SYNTH_SAMPLE_RATE = 22050;

/**
 * FNV-1a hash of the samples' IEEE float32 bit patterns — a fingerprint that changes when any
 * sample changes (tests pin a sound's hash; `pnpm audio:preview` prints them).
 *
 * @param pcm - Samples.
 * @returns An unsigned 32-bit hash.
 *
 * @example
 * ```ts
 * pcmHash(renderSfx(params, SYNTH_SAMPLE_RATE)).toString(16);
 * ```
 */
export function pcmHash(pcm: Float32Array): number {
  const words = new Uint32Array(pcm.buffer, pcm.byteOffset, pcm.length);
  let hash = 0x811c9dc5;
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    hash = Math.imul(hash ^ (word & 0xff), 0x01000193);
    hash = Math.imul(hash ^ ((word >>> 8) & 0xff), 0x01000193);
    hash = Math.imul(hash ^ ((word >>> 16) & 0xff), 0x01000193);
    hash = Math.imul(hash ^ (word >>> 24), 0x01000193);
  }
  return hash >>> 0;
}
