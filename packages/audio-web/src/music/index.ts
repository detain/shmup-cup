/**
 * # music — music playback: intro + sample-accurate loop, fades, ducking
 *
 * **Responsibility.** Plays one music track at a time from a prepared buffer through an
 * `AudioBufferSourceNode` with `loop`, `loopStart` and `loopEnd` set from the track's **sample**
 * indices (the intro plays once, then the loop region repeats seamlessly — shmup_feat.md §19;
 * the placeholder chip songs are rendered by `synth`, final OGG tracks decoded by `loader` at
 * 32 kHz, decision D22). Only one track is resident in the player: starting a track hard-stops the
 * previous one (a fading one included). The graph is `source → fade gain → duck gain → music
 * bus`:
 *
 * - `play(track, { fadeInTicks })` ramps the fade gain 0 → 1 (or starts at full volume);
 * - `stop(fadeOutTicks)` ramps it to 0 and stops the source when the ramp ends;
 * - `duck(level, ticks)` dips the duck gain to `level` (a quick 4-tick fall), holds it for half
 *   of `ticks`, then ramps back to 1 at `ticks` (the player's death, shmup_feat.md §19 ducking).
 *
 * Times are given in simulation ticks (1/60 s) and scheduled on the context clock, so ramps are
 * sample-accurate and never need a per-frame update.
 *
 * **Implements.**
 * - shmup_feat.md §19 Music — intro + seamless loop (`loop`, `loopStart`, `loopEnd` in samples),
 *   one track resident, ducking
 * - shmup_tech.md §2.4 — decode one stage's music at a time, never mid-stage (the `loader`)
 * - shmup_tech.md §4.3 — raw Web Audio instead of a library
 *
 * **Public API.** {@link createMusicPlayer}, {@link MusicPlayer}, {@link MusicPlayerOptions},
 * {@link MusicPlayOptions}, {@link MusicBuffer}, {@link TICK_SECONDS},
 * {@link DUCK_ATTACK_TICKS}.
 *
 * @module
 */
import { defineModule } from '@shmup/core';
import type {
  AudioBufferLike,
  AudioBufferSourceNodeLike,
  AudioNodeLike,
  PlaybackContextLike,
} from '../web-audio/index.js';

/** Module descriptor. */
export const moduleInfo = defineModule({
  name: 'music',
  status: 'implemented',
  specRefs: ['shmup_feat.md §19', 'shmup_tech.md §2.4', 'shmup_tech.md §4.3'],
});

/** Seconds per simulation tick (fades and ducks are given in ticks). */
export const TICK_SECONDS = 1 / 60;

/** Ticks the duck takes to reach its level (at most a quarter of the whole duck). */
export const DUCK_ATTACK_TICKS = 4;

/** A track ready to play. */
export interface MusicBuffer {
  /** Track id (`content/audio/music/`). */
  readonly id: string;
  /** The samples. */
  readonly buffer: AudioBufferLike;
  /** First sample of the loop, in `buffer` sample frames (−1 = one-shot). */
  readonly loopStart: number;
  /** Sample frame where playback jumps back to `loopStart` (−1 = one-shot). */
  readonly loopEnd: number;
}

/** Options of {@link MusicPlayer.play}. */
export interface MusicPlayOptions {
  /** Fade-in length in ticks (0 / omitted = start at full volume). */
  readonly fadeInTicks?: number;
}

/** Options of {@link createMusicPlayer}. */
export interface MusicPlayerOptions {
  /** The running context. */
  readonly context: PlaybackContextLike;
  /** Destination (the web-audio `music` bus). */
  readonly destination: AudioNodeLike;
  /** Seconds per tick (default {@link TICK_SECONDS}). */
  readonly tickSeconds?: number;
}

/** The music player. */
export interface MusicPlayer {
  /**
   * Starts a track from its beginning (the previous track stops at once).
   *
   * @param track - The track.
   * @param options - Fade-in.
   */
  play(track: MusicBuffer, options?: MusicPlayOptions): void;
  /**
   * Stops the music.
   *
   * @param fadeOutTicks - Fade-out length in ticks (0 / omitted = at once).
   */
  stop(fadeOutTicks?: number): void;
  /**
   * Ducks the music: down to `level` quickly, held for half of `ticks`, back to full volume at
   * `ticks`. A new duck replaces a running one.
   *
   * @param level - Gain while ducked, 0…1.
   * @param ticks - Whole duration in ticks (≤ 0 = ignored).
   */
  duck(level: number, ticks: number): void;
  /** The track started last, until `stop()` (a finished one-shot stays current). */
  readonly current: MusicBuffer | null;
  /** Whether a track is audible now (looping, or a one-shot not yet at its end). */
  readonly playing: boolean;
  /** Stops the music and detaches the gains; the player is inert afterwards. */
  destroy(): void;
}

/**
 * Creates the music player on a running context.
 *
 * @remarks
 * Load time: creates the fade and duck gains (`fade → duck → destination`). Every `play()`
 * creates one `AudioBufferSourceNode`; loop points become seconds (`samples / buffer.sampleRate`),
 * which the engine turns back into the same sample frames.
 *
 * @param options - Context, destination and tick length.
 * @returns The player.
 *
 * @example
 * ```ts
 * const music = createMusicPlayer({ context, destination: audio.bus('music')! });
 * music.play({ id: 'zone-a', buffer, loopStart: 176_400, loopEnd: 1_168_650 }, { fadeInTicks: 30 });
 * music.duck(0.35, 120); // the player died
 * music.stop(60);
 * ```
 */
export function createMusicPlayer(options: MusicPlayerOptions): MusicPlayer {
  const { context, destination } = options;
  const tick = options.tickSeconds ?? TICK_SECONDS;
  const fade = context.createGain();
  const duck = context.createGain();
  fade.connect(duck);
  duck.connect(destination);
  let source: AudioBufferSourceNodeLike | null = null;
  let current: MusicBuffer | null = null;
  let endTime = 0;
  let destroyed = false;

  /** Hard-stops and detaches the resident source (a fading one included). */
  const dropSource = (): void => {
    if (source === null) return;
    try {
      source.stop();
    } catch (_error) {
      // Already stopped.
    }
    source.disconnect();
    source = null;
  };

  return {
    get current() {
      return current;
    },
    get playing() {
      return current !== null && context.currentTime < endTime;
    },
    play(track, playOptions = {}) {
      if (destroyed) return;
      dropSource();
      const now = context.currentTime;
      const node = context.createBufferSource();
      node.buffer = track.buffer;
      const rate = track.buffer.sampleRate;
      const looping = track.loopStart >= 0 && track.loopEnd > track.loopStart;
      node.loop = looping;
      if (looping) {
        node.loopStart = track.loopStart / rate;
        node.loopEnd = track.loopEnd / rate;
      }
      node.connect(fade);
      const gain = fade.gain;
      gain.cancelScheduledValues(now);
      const fadeIn = playOptions.fadeInTicks ?? 0;
      if (fadeIn > 0) {
        gain.setValueAtTime(0, now);
        gain.linearRampToValueAtTime(1, now + fadeIn * tick);
      } else {
        gain.setValueAtTime(1, now);
      }
      node.start(0);
      source = node;
      current = track;
      endTime = looping ? Infinity : now + track.buffer.duration;
    },
    stop(fadeOutTicks = 0) {
      current = null;
      endTime = 0;
      if (destroyed || source === null) return;
      if (fadeOutTicks <= 0) {
        dropSource();
        return;
      }
      const now = context.currentTime;
      const end = now + fadeOutTicks * tick;
      const gain = fade.gain;
      gain.cancelScheduledValues(now);
      gain.setValueAtTime(gain.value, now);
      gain.linearRampToValueAtTime(0, end);
      try {
        source.stop(end);
      } catch (_error) {
        // A fade-out over a fade-out: older engines throw on a second stop() (the first stands).
      }
    },
    duck(level, ticks) {
      if (destroyed || !(ticks > 0)) return;
      const target = level > 1 ? 1 : level > 0 ? level : 0;
      const now = context.currentTime;
      const whole = ticks * tick;
      const attack = Math.min(DUCK_ATTACK_TICKS * tick, whole / 4);
      const gain = duck.gain;
      gain.cancelScheduledValues(now);
      gain.setValueAtTime(gain.value, now);
      gain.linearRampToValueAtTime(target, now + attack);
      gain.setValueAtTime(target, now + whole / 2);
      gain.linearRampToValueAtTime(1, now + whole);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      dropSource();
      current = null;
      endTime = 0;
      fade.disconnect();
      duck.disconnect();
    },
  };
}
