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
 * `loader`) that plug into the buses exposed here.
 *
 * **Implements.** shmup_feat.md §19 (buses with volume sliders; `latencyHint:
 * 'interactive'`; `resume()` on first input; `suspend()` on hidden), shmup_tech.md §2.4 /
 * §2.5 (lifecycle), §4.3 (custom Web Audio wrapper).
 *
 * **Public API.** {@link createWebAudio}, {@link WebAudio}, {@link WebAudioOptions},
 * {@link AudioContextLike}, {@link GainNodeLike}.
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
  readonly gain: { value: number };
  connect(destination: unknown): unknown;
  disconnect(): void;
}

/** The subset of `AudioContext` this module uses (lets tests pass a fake). */
export interface AudioContextLike {
  readonly state: string;
  readonly destination: unknown;
  createGain(): GainNodeLike;
  resume(): Promise<void>;
  suspend(): Promise<void>;
  close(): Promise<void>;
}

/** Options for {@link createWebAudio}. */
export interface WebAudioOptions {
  /**
   * Creates the audio context. Defaults to `new AudioContext({ latencyHint: 'interactive' })`
   * (with the `webkitAudioContext` fallback). Return `null` when audio is unavailable.
   */
  readonly createContext?: () => AudioContextLike | null;
}

/** The Web Audio back-end. */
export interface WebAudio extends IAudio {
  /** The live context, or `null` before the first {@link IAudio.unlock}. */
  readonly context: AudioContextLike | null;
  /**
   * The gain node of a bus (`null` before the context exists). Other audio modules
   * connect their sources here.
   *
   * @param bus - Bus name.
   */
  bus(bus: AudioBus): GainNodeLike | null;
}

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
 * @param options - Optional context factory.
 * @returns The {@link WebAudio} instance.
 */
export function createWebAudio(options: WebAudioOptions = {}): WebAudio {
  const createContext = options.createContext ?? createDefaultContext;
  const volumes: Record<AudioBus, number> = { master: 1, music: 1, sfx: 1, ui: 1 };
  const nodes: Partial<Record<AudioBus, GainNodeLike>> = {};
  let context: AudioContextLike | null = null;
  let closed = false;

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
