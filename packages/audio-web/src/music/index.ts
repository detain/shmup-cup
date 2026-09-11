/**
 * # music — music playback: intro + seamless loop, streaming
 *
 * **Status: placeholder.** Declares the intended public API only; no logic yet.
 *
 * **Responsibility.** Music with an intro and a sample-accurate loop (`AudioBufferSourceNode.loopStart /
 * loopEnd` on an OGG Vorbis buffer decoded for the current stage only, possibly at 32 kHz)
 * or streamed via `<audio>` + `MediaElementAudioSourceNode` to save RAM (less exact
 * loops). Ducking on death, WARNING siren and pause. Possible later upgrade: tracker
 * playback via chiptune3 (WASM + AudioWorklet, both available on Tizen 5.5).
 *
 * **Implements.**
 * - shmup_feat.md §19 Music — intro + loop, memory budget, ducking
 * - shmup_tech.md §2.4 — do not decode whole tracks; stream or decode one stage at a time
 * - shmup_tech.md §4.3 — tracker modules vs OGG
 *
 * **Intended public API.** The declarations below (and the `Planned` notes at the
 * end of the file) are the contract later steps implement.
 *
 * @module
 */
import { defineModule } from '@shmup/core';

/** Module descriptor. */
export const moduleInfo = defineModule({
  name: 'music',
  status: 'placeholder',
  specRefs: ['shmup_feat.md §19', 'shmup_tech.md §2.4', 'shmup_tech.md §4.3'],
});

/** Loop points of a track, in samples. */
export interface MusicLoop {
  /** First sample of the looped section (the intro plays once before it). */
  readonly loopStart: number;
  /** Sample at which playback jumps back to `loopStart`. */
  readonly loopEnd: number;
}

/** A music track definition. */
export interface MusicTrack {
  /** Track id referenced by stage data and sim `music` events. */
  readonly id: string;
  /** Asset URL relative to the app root (OGG/M4A chosen by the loader). */
  readonly url: string;
  /** Loop points, or `null` for a one-shot track (jingles, ending). */
  readonly loop: MusicLoop | null;
  /** Stream through a media element instead of decoding (long tracks). */
  readonly stream: boolean;
}

// Planned: createMusicPlayer(context, musicBus), play(trackId), stop(fadeTicks), duck(amount).
