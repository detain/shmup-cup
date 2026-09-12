/**
 * # sfx — sound effects: pre-rendered buffers and voice management
 *
 * **Responsibility.** Plays pre-rendered / pre-decoded SFX `AudioBuffer`s (never decoded
 * mid-game — Tizen decoding is slow) with SNES-driver-style voice management:
 *
 * - **Per-tick dedupe** — a cue started once in a frame's batch is not started again until
 *   {@link SfxPlayer.endFrame} (the shell calls it after draining each frame's events; the ticks of
 *   one frame are heard together, so stacking identical sounds would only get louder).
 * - **Per-cue instance cap** (`maxInstances`, 1–8) — a cue at its cap restarts its **oldest**
 *   instance.
 * - **Global cap** ({@link DEFAULT_MAX_VOICES} = 14 voices) — when every voice is busy the new
 *   sound steals the voice of the **lowest priority, then the oldest**; `critical` voices are
 *   never stolen by another cue, and a voice of higher priority than the new sound is not stolen
 *   either (the new sound is dropped instead).
 * - **Pan** — each voice slot owns a `StereoPannerNode` (created once, connected to the `sfx`
 *   bus) whose pan is set from the caller's `pan` (−1…1; the engine derives it from the event's
 *   x). `ui`-bus cues (menus) play centred straight into the `ui` bus.
 *
 * Voices are tracked in preallocated typed arrays; a voice is free once its buffer has played out
 * (`context.currentTime` past its end), so no `onended` closures are needed. Starting a sound
 * creates one `AudioBufferSourceNode` (Web Audio sources are one-shot — the only allocation of
 * the path).
 *
 * **Implements.**
 * - shmup_feat.md §19 SFX — voice management (instance caps, global cap, priority tiers, dedupe),
 *   the uninterruptible WARNING siren / death / 1UP
 * - shmup_tech.md §2.4 — pre-decode all SFX during loading
 * - shmup_tech.md §4.3 — custom Web Audio wrapper with voice cap & priorities
 *
 * **Public API.** {@link createSfxPlayer}, {@link SfxPlayer}, {@link SfxPlayerOptions},
 * {@link SfxVoiceSpec}, {@link SfxBus}, {@link SfxPriorityName}, {@link SFX_PRIORITY_NAMES},
 * {@link SFX_PRIORITY_TIERS}, {@link DEFAULT_MAX_VOICES}.
 *
 * @module
 */
import { SfxPriority, defineModule } from '@shmup/core';
import type {
  AudioBufferLike,
  AudioBufferSourceNodeLike,
  AudioNodeLike,
  PlaybackContextLike,
  StereoPannerNodeLike,
} from '../web-audio/index.js';

/** Module descriptor. */
export const moduleInfo = defineModule({
  name: 'sfx',
  status: 'implemented',
  specRefs: ['shmup_feat.md §19', 'shmup_tech.md §2.4', 'shmup_tech.md §4.3'],
});

/** Priority tiers of `content/audio/` cues (higher wins; `critical` is never stolen). */
export type SfxPriorityName = 'low' | 'normal' | 'high' | 'critical';

/** Every {@link SfxPriorityName}, lowest first. */
export const SFX_PRIORITY_NAMES: readonly SfxPriorityName[] = Object.freeze([
  'low',
  'normal',
  'high',
  'critical',
]);

/** The core's `SfxPriority` tier of each {@link SfxPriorityName} (1 = low … 4 = critical). */
export const SFX_PRIORITY_TIERS: Readonly<Record<SfxPriorityName, number>> = Object.freeze({
  low: SfxPriority.Low,
  normal: SfxPriority.Normal,
  high: SfxPriority.High,
  critical: SfxPriority.Critical,
});

/** Global voice cap (shmup_feat.md §19: ~12–16). */
export const DEFAULT_MAX_VOICES = 14;

/** Bus a cue plays on. */
export type SfxBus = 'sfx' | 'ui';

/** What the player needs to know about one cue. */
export interface SfxVoiceSpec {
  /** The pre-rendered buffer (`null` = the cue is silent — not loaded or not bound). */
  buffer: AudioBufferLike | null;
  /** Default priority tier (`SfxPriority` Low 1 … Critical 4). */
  readonly tier: number;
  /** Simultaneous instances of this cue (≥ 1). */
  readonly maxInstances: number;
  /** Bus: `ui` cues are not panned. */
  readonly bus: SfxBus;
}

/** Options of {@link createSfxPlayer}. */
export interface SfxPlayerOptions {
  /** The running context. */
  readonly context: PlaybackContextLike;
  /** Destination of `sfx`-bus cues (the web-audio `sfx` bus). */
  readonly sfxBus: AudioNodeLike;
  /** Destination of `ui`-bus cues (default: the `sfx` bus). */
  readonly uiBus?: AudioNodeLike | null;
  /**
   * One entry per cue id (`SFX_CUES` order); `null` = no sound. The array is read at every
   * {@link SfxPlayer.play}, so a buffer filled in later is picked up.
   */
  readonly cues: readonly (SfxVoiceSpec | null)[];
  /** Global voice cap (default {@link DEFAULT_MAX_VOICES}). */
  readonly maxVoices?: number;
}

/** The SFX voice manager. */
export interface SfxPlayer {
  /**
   * Starts a cue.
   *
   * @param cue - `SFX_CUES` id.
   * @param pan - Stereo position −1…1 (default 0; ignored on the `ui` bus).
   * @param priority - A `SfxPriority` hint (1–4) overriding the cue's tier; 0 = the cue's own.
   * @returns The voice slot used, or −1 when the sound was not started (no buffer, already started
   *   this frame, or every voice holds a more important sound).
   */
  play(cue: number, pan?: number, priority?: number): number;
  /** Ends the dedupe window: sounds started from now on belong to the next tick batch. */
  endFrame(): void;
  /** Stops every voice at once. */
  stopAll(): void;
  /**
   * Voices still playing now.
   *
   * @returns The count.
   */
  activeVoices(): number;
  /**
   * The cue a voice slot is playing.
   *
   * @param slot - Voice slot.
   * @returns The cue id, or −1 when the slot is free (or its sound has played out).
   */
  voiceCue(slot: number): number;
  /** The global voice cap. */
  readonly maxVoices: number;
  /** Sounds started since creation. */
  readonly started: number;
  /** Voices cut short to make room (instance cap or global cap). */
  readonly stolen: number;
  /** Requests dropped (no buffer, or no voice could be taken). */
  readonly dropped: number;
  /** Requests skipped by the per-tick dedupe. */
  readonly deduped: number;
  /** Stops everything and disconnects the panners; the player is inert afterwards. */
  destroy(): void;
}

/**
 * Stops and detaches a source, ignoring engines that throw on a second `stop()`.
 *
 * @param source - The source.
 */
function silence(source: AudioBufferSourceNodeLike): void {
  try {
    source.stop();
  } catch (_error) {
    // Already stopped (older engines throw InvalidStateError on a second stop).
  }
  source.disconnect();
}

/**
 * Creates the SFX player on a running context.
 *
 * @remarks
 * Load time: creates one stereo panner per voice slot (when the context has
 * `createStereoPanner`). `play()` allocates only the Web Audio source node of the sound it
 * starts; the bookkeeping lives in preallocated typed arrays.
 *
 * @param options - Context, buses, per-cue specs and the voice cap.
 * @returns The player.
 * @throws {RangeError} When `maxVoices` is not a positive integer.
 *
 * @example
 * ```ts
 * const sfx = createSfxPlayer({ context, sfxBus: audio.bus('sfx')!, uiBus: audio.bus('ui'), cues });
 * sfx.play(SFX_CUES.EnemyExplodeSmall, -0.4);
 * sfx.endFrame(); // after each frame's events
 * ```
 */
export function createSfxPlayer(options: SfxPlayerOptions): SfxPlayer {
  const { context, sfxBus, cues } = options;
  const uiBus = options.uiBus ?? sfxBus;
  const maxVoices = options.maxVoices ?? DEFAULT_MAX_VOICES;
  if (!Number.isInteger(maxVoices) || maxVoices < 1) {
    throw new RangeError(`maxVoices must be a positive integer, got ${maxVoices}`);
  }
  const voiceCue = new Int16Array(maxVoices).fill(-1);
  const voiceTier = new Uint8Array(maxVoices);
  const voiceOrder = new Float64Array(maxVoices);
  const voiceEnd = new Float64Array(maxVoices);
  const sources: Array<AudioBufferSourceNodeLike | null> = [];
  const panners: Array<StereoPannerNodeLike | null> = [];
  for (let i = 0; i < maxVoices; i++) {
    sources.push(null);
    let panner: StereoPannerNodeLike | null = null;
    if (typeof context.createStereoPanner === 'function') {
      panner = context.createStereoPanner();
      panner.connect(sfxBus);
    }
    panners.push(panner);
  }
  const startedFrame = new Float64Array(cues.length).fill(-1);
  let frame = 0;
  let sequence = 0;
  let started = 0;
  let stolen = 0;
  let dropped = 0;
  let deduped = 0;
  let destroyed = false;

  /**
   * Frees a voice slot, stopping its sound.
   *
   * @param slot - Voice slot.
   */
  const release = (slot: number): void => {
    const source = sources[slot];
    if (source !== null) silence(source);
    sources[slot] = null;
    voiceCue[slot] = -1;
  };

  return {
    maxVoices,
    get started() {
      return started;
    },
    get stolen() {
      return stolen;
    },
    get dropped() {
      return dropped;
    },
    get deduped() {
      return deduped;
    },
    play(cue, pan = 0, priority = 0) {
      const spec = !destroyed && cue >= 0 && cue < cues.length ? cues[cue] : null;
      const buffer = spec === null ? null : spec.buffer;
      if (spec === null || buffer === null) {
        dropped++;
        return -1;
      }
      if (startedFrame[cue] === frame) {
        deduped++;
        return -1;
      }
      const tier =
        priority >= SfxPriority.Low && priority <= SfxPriority.Critical ? priority : spec.tier;
      const now = context.currentTime;
      let instances = 0;
      let oldestSame = -1;
      let free = -1;
      let victim = -1;
      for (let i = 0; i < maxVoices; i++) {
        const playing = voiceCue[i];
        if (playing >= 0 && voiceEnd[i] <= now) release(i);
        if (voiceCue[i] < 0) {
          if (free < 0) free = i;
          continue;
        }
        if (playing === cue) {
          instances++;
          if (oldestSame < 0 || voiceOrder[i] < voiceOrder[oldestSame]) oldestSame = i;
        }
        if (voiceTier[i] < SfxPriority.Critical) {
          if (
            victim < 0 ||
            voiceTier[i] < voiceTier[victim] ||
            (voiceTier[i] === voiceTier[victim] && voiceOrder[i] < voiceOrder[victim])
          ) {
            victim = i;
          }
        }
      }
      let slot: number;
      if (instances >= spec.maxInstances && oldestSame >= 0) {
        slot = oldestSame;
        release(slot);
        stolen++;
      } else if (free >= 0) {
        slot = free;
      } else if (victim >= 0 && voiceTier[victim] <= tier) {
        slot = victim;
        release(slot);
        stolen++;
      } else {
        dropped++;
        return -1;
      }
      const source = context.createBufferSource();
      source.buffer = buffer;
      const panner = panners[slot];
      if (spec.bus === 'ui') {
        source.connect(uiBus);
      } else if (panner !== null) {
        panner.pan.value = pan < -1 ? -1 : pan > 1 ? 1 : pan;
        source.connect(panner);
      } else {
        source.connect(sfxBus);
      }
      source.start(0);
      sources[slot] = source;
      voiceCue[slot] = cue;
      voiceTier[slot] = tier;
      voiceOrder[slot] = ++sequence;
      voiceEnd[slot] = now + buffer.duration;
      startedFrame[cue] = frame;
      started++;
      return slot;
    },
    endFrame() {
      frame++;
    },
    stopAll() {
      for (let i = 0; i < maxVoices; i++) if (voiceCue[i] >= 0) release(i);
    },
    activeVoices() {
      const now = context.currentTime;
      let count = 0;
      for (let i = 0; i < maxVoices; i++) if (voiceCue[i] >= 0 && voiceEnd[i] > now) count++;
      return count;
    },
    voiceCue(slot) {
      if (slot < 0 || slot >= maxVoices || voiceCue[slot] < 0) return -1;
      return voiceEnd[slot] > context.currentTime ? voiceCue[slot] : -1;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (let i = 0; i < maxVoices; i++) {
        if (voiceCue[i] >= 0) release(i);
        panners[i]?.disconnect();
      }
    },
  };
}
