/**
 * # web-audio — the Web Audio `IAudio` implementation (context + buses)
 *
 * **Responsibility.** Owns the single `AudioContext` (created with
 * `latencyHint: 'interactive'`) and the mixer bus graph
 * `music / sfx / ui → master → destination`. Handles the browser autoplay policy
 * (`unlock()` from a user gesture creates/resumes the context), app suspension
 * (`suspend()` when hidden — JS is frozen on Tizen while backgrounded) and bus volumes.
 * Volumes set before the context exists are remembered and applied on creation.
 *
 * SFX playback, music and asset decoding are separate modules (`sfx`, `music`,
 * `loader`, composed by `engine`) that plug into the buses exposed here; the structural
 * Web Audio types they share ({@link PlaybackContextLike} and friends) live in this module so
 * every one of them can be unit-tested against a fake context.
 *
 * **Implements.** shmup_feat.md §19 (buses with volume sliders; `latencyHint:
 * 'interactive'`; `resume()` on first input; `suspend()` on hidden), shmup_tech.md §2.4 /
 * §2.5 (lifecycle), §4.3 (custom Web Audio wrapper).
 *
 * **Public API.** {@link createWebAudio}, {@link WebAudio}, {@link WebAudioOptions},
 * {@link AudioContextLike}, {@link GainNodeLike}. Playback types: {@link PlaybackContextLike},
 * {@link isPlaybackContext}, {@link AudioNodeLike}, {@link AudioParamLike},
 * {@link AudioGainNodeLike}, {@link StereoPannerNodeLike}, {@link AudioBufferLike},
 * {@link AudioBufferSourceNodeLike}.
 *
 * @module
 */
import { defineModule, type AudioBus, type AudioState, type IAudio } from '@shmup/core';

/** Module descriptor. */
export const moduleInfo = defineModule({
  name: 'web-audio',
  status: 'partial',
  specRefs: ['shmup_feat.md §19', 'shmup_tech.md §2.4', 'shmup_tech.md §4.3'],
});

/** The subset of `GainNode` this module uses (lets tests pass a fake). */
export interface GainNodeLike {
  /** The gain parameter; only its `value` is written (no automation yet). */
  readonly gain: {
    /** Linear gain, 0…1 as set by this module. */
    value: number;
  };
  /**
   * Routes this node's output into another node.
   *
   * @param destination - Target node (another gain node or `context.destination`).
   * @returns Whatever the implementation returns (ignored).
   */
  connect(destination: unknown): unknown;
  /** Detaches every outgoing connection. */
  disconnect(): void;
}

/** The subset of `AudioContext` this module uses (lets tests pass a fake). */
export interface AudioContextLike {
  /** `'suspended'`, `'running'` or `'closed'` (Safari may report `'interrupted'`). */
  readonly state: string;
  /** Final output node (the speakers). */
  readonly destination: unknown;
  /**
   * Creates a gain node (used for every bus).
   *
   * @returns A new, unconnected gain node.
   */
  createGain(): GainNodeLike;
  /**
   * Starts / restarts audio processing.
   *
   * @returns Resolves when running.
   */
  resume(): Promise<void>;
  /**
   * Pauses audio processing.
   *
   * @returns Resolves when suspended.
   */
  suspend(): Promise<void>;
  /**
   * Releases the audio device; the context cannot be used afterwards.
   *
   * @returns Resolves when closed.
   */
  close(): Promise<void>;
}

/** Any audio graph node this package connects (lets tests pass fakes). */
export interface AudioNodeLike {
  /**
   * Routes this node's output into another node.
   *
   * @param destination - Target node.
   * @returns Whatever the implementation returns (ignored).
   */
  connect(destination: unknown): unknown;
  /** Detaches every outgoing connection. */
  disconnect(): void;
}

/** The subset of `AudioParam` the players automate (fades, ducking, pan). */
export interface AudioParamLike {
  /** Current value (setting it cancels nothing — use the scheduling methods for ramps). */
  value: number;
  /**
   * Schedules a step to `value` at `time`.
   *
   * @param value - Target value.
   * @param time - Context time in seconds.
   * @returns Whatever the implementation returns (ignored).
   */
  setValueAtTime(value: number, time: number): unknown;
  /**
   * Schedules a linear ramp that reaches `value` at `time`.
   *
   * @param value - Target value.
   * @param time - Context time in seconds.
   * @returns Whatever the implementation returns (ignored).
   */
  linearRampToValueAtTime(value: number, time: number): unknown;
  /**
   * Removes every scheduled change at or after `time`.
   *
   * @param time - Context time in seconds.
   * @returns Whatever the implementation returns (ignored).
   */
  cancelScheduledValues(time: number): unknown;
}

/** A gain node whose gain can be automated. */
export interface AudioGainNodeLike extends AudioNodeLike {
  /** The gain parameter. */
  readonly gain: AudioParamLike;
}

/** The subset of `StereoPannerNode` the SFX player uses. */
export interface StereoPannerNodeLike extends AudioNodeLike {
  /** Pan position, −1 (left) … 1 (right). */
  readonly pan: AudioParamLike;
}

/** The subset of `AudioBuffer` this package reads and fills. */
export interface AudioBufferLike {
  /** Sample rate in Hz. */
  readonly sampleRate: number;
  /** Length in sample frames. */
  readonly length: number;
  /** Length in seconds. */
  readonly duration: number;
  /** Number of channels. */
  readonly numberOfChannels: number;
  /**
   * The samples of one channel (a live view — writing fills the buffer).
   *
   * @param channel - Channel index.
   * @returns The channel's samples.
   */
  getChannelData(channel: number): Float32Array;
}

/** The subset of `AudioBufferSourceNode` the players use. */
export interface AudioBufferSourceNodeLike extends AudioNodeLike {
  /** The buffer to play. */
  buffer: AudioBufferLike | null;
  /** Whether playback loops between `loopStart` and `loopEnd`. */
  loop: boolean;
  /** Loop start in seconds. */
  loopStart: number;
  /** Loop end in seconds. */
  loopEnd: number;
  /**
   * Starts playback.
   *
   * @param when - Context time (0 = now).
   */
  start(when?: number): void;
  /**
   * Stops playback.
   *
   * @param when - Context time (0 / omitted = now).
   */
  stop(when?: number): void;
}

/**
 * A context that can play buffers — what the SFX and music players need on top of
 * {@link AudioContextLike}. A real `AudioContext` satisfies it; {@link isPlaybackContext} checks a
 * context at run time.
 */
export interface PlaybackContextLike extends AudioContextLike {
  /** Context time in seconds (advances while running). */
  readonly currentTime: number;
  /** The context's output rate. */
  readonly sampleRate: number;
  /**
   * Creates an automatable gain node.
   *
   * @returns A new, unconnected gain node.
   */
  createGain(): AudioGainNodeLike;
  /**
   * Creates an empty buffer.
   *
   * @param channels - Channel count.
   * @param length - Sample frames.
   * @param sampleRate - Rate in Hz (3,000 … 192,000 everywhere).
   * @returns The buffer.
   */
  createBuffer(channels: number, length: number, sampleRate: number): AudioBufferLike;
  /**
   * Creates a one-shot buffer source.
   *
   * @returns A new source.
   */
  createBufferSource(): AudioBufferSourceNodeLike;
  /**
   * Creates a stereo panner (missing on some old engines — the SFX player then plays centred).
   *
   * @returns A new panner.
   */
  createStereoPanner?(): StereoPannerNodeLike;
}

/**
 * Whether a context can play buffers (a real `AudioContext` can; the minimal fakes of the boot
 * tests cannot, and audio then stays silent instead of failing).
 *
 * @param context - A context, or `null`.
 * @returns `true` when it has `currentTime`, `createBuffer` and `createBufferSource`.
 */
export function isPlaybackContext(
  context: AudioContextLike | null,
): context is PlaybackContextLike {
  if (context === null) return false;
  const candidate = context as Partial<PlaybackContextLike>;
  return (
    typeof candidate.currentTime === 'number' &&
    typeof candidate.createBuffer === 'function' &&
    typeof candidate.createBufferSource === 'function'
  );
}

/** Options for {@link createWebAudio}. */
export interface WebAudioOptions {
  /**
   * Creates the audio context. Defaults to `new AudioContext({ latencyHint: 'interactive' })`
   * (with the `webkitAudioContext` fallback). Called at most once, by the first
   * `unlock()`.
   *
   * @returns The new context, or `null` when audio is unavailable (the back-end then
   *   stays `'uninitialized'` and every call is a no-op).
   */
  readonly createContext?: () => AudioContextLike | null;
}

/** The Web Audio back-end. */
export interface WebAudio extends IAudio {
  /** The live context, or `null` before the first {@link IAudio.unlock}. */
  readonly context: AudioContextLike | null;
  /**
   * The gain node of a bus. Other audio modules connect their sources here.
   *
   * @param bus - Bus name.
   * @returns The bus node, or `null` before the context exists / after `destroy()`.
   */
  bus(bus: AudioBus): GainNodeLike | null;
}

/** Every bus, master first (it must exist before the others connect to it). */
const BUSES: readonly AudioBus[] = ['master', 'music', 'sfx', 'ui'];

/**
 * Default context factory: `AudioContext` with interactive latency, falling back to
 * the prefixed constructor on old WebKit; `null` when Web Audio is missing.
 *
 * @returns A new context or `null`.
 */
function createDefaultContext(): AudioContextLike | null {
  if (typeof window === 'undefined') return null;
  const w = window as Window & { webkitAudioContext?: typeof AudioContext };
  const Ctor = typeof AudioContext !== 'undefined' ? AudioContext : w.webkitAudioContext;
  if (Ctor === undefined) return null;
  return new Ctor({ latencyHint: 'interactive' });
}

/**
 * Clamps a volume to 0…1 (NaN → 0).
 *
 * @param volume - Requested linear gain.
 * @returns The clamped gain.
 */
function clampVolume(volume: number): number {
  if (!(volume > 0)) return 0;
  return volume > 1 ? 1 : volume;
}

/**
 * Creates the Web Audio back-end. The context is created lazily by the first
 * {@link IAudio.unlock} call, which the host should make from a user gesture.
 *
 * @remarks
 * - `suspend()` only acts on a running context and `resume()` only on a suspended one,
 *   so both are idempotent and safe to call from visibility handlers.
 * - `setBusVolume()` clamps to 0…1 (NaN → 0) and works before the context exists;
 *   the value is applied when the buses are created.
 * - After `destroy()` the state is `'closed'` for good; `unlock()` never recreates it.
 * - The first `unlock()` creates the context and the buses **synchronously**, before its promise
 *   settles, so `context` and `bus()` are usable right after the call — the shell attaches the
 *   audio engine at once (still inside the user gesture) and again when the promise resolves.
 *
 * @param options - Optional context factory.
 * @returns The {@link WebAudio} instance.
 *
 * @example
 * ```ts
 * const audio = createWebAudio();
 * audio.setBusVolume('music', 0.6);
 * window.addEventListener('keydown', () => void audio.unlock(), { once: true });
 * document.addEventListener('visibilitychange', () => {
 *   void (document.hidden ? audio.suspend() : audio.resume());
 * });
 * ```
 */
export function createWebAudio(options: WebAudioOptions = {}): WebAudio {
  const createContext = options.createContext ?? createDefaultContext;
  const volumes: Record<AudioBus, number> = { master: 1, music: 1, sfx: 1, ui: 1 };
  const nodes: Partial<Record<AudioBus, GainNodeLike>> = {};
  let context: AudioContextLike | null = null;
  let closed = false;

  /**
   * Creates the context and the bus graph on first use.
   *
   * @returns The context, or `null` when it is unavailable or the back-end is destroyed.
   */
  const ensureContext = (): AudioContextLike | null => {
    if (context !== null || closed) return context;
    context = createContext();
    if (context === null) return null;
    const master = context.createGain();
    master.gain.value = volumes.master;
    master.connect(context.destination);
    nodes.master = master;
    for (const bus of BUSES) {
      if (bus === 'master') continue;
      const node = context.createGain();
      node.gain.value = volumes[bus];
      node.connect(master);
      nodes[bus] = node;
    }
    return context;
  };

  return {
    get context() {
      return context;
    },
    get state(): AudioState {
      if (closed) return 'closed';
      if (context === null) return 'uninitialized';
      if (context.state === 'running') return 'running';
      if (context.state === 'closed') return 'closed';
      return 'suspended'; // 'suspended' and Safari's 'interrupted'
    },
    bus(bus) {
      return nodes[bus] ?? null;
    },
    async unlock() {
      const ctx = ensureContext();
      if (ctx !== null && ctx.state !== 'running') await ctx.resume();
    },
    async suspend() {
      if (context !== null && context.state === 'running') await context.suspend();
    },
    async resume() {
      if (context !== null && context.state === 'suspended') await context.resume();
    },
    setBusVolume(bus, volume) {
      volumes[bus] = clampVolume(volume);
      const node = nodes[bus];
      if (node !== undefined) node.gain.value = volumes[bus];
    },
    async destroy() {
      closed = true;
      const ctx = context;
      context = null;
      for (const bus of BUSES) {
        nodes[bus]?.disconnect();
        delete nodes[bus];
      }
      if (ctx !== null && ctx.state !== 'closed') await ctx.close();
    },
  };
}
