/**
 * # tracker — the optional tracker-music path (plan M3-03)
 *
 * **Responsibility.** Decide, per track and per device, **which music path plays**: the
 * deterministic chip synth (`audio-web/synth`, what ships today — decision D22), a recorded OGG
 * file, or a **tracker module** (MOD / XM / IT) played live by libopenmpt compiled to WebAssembly
 * inside an AudioWorklet (`chiptune3`; `shmup_tech.md` §4.3). Nothing here plays anything: it owns
 * the *capability detection* ({@link detectAudioCapabilities}), the *port* a build plugs a real
 * tracker into ({@link TrackerBackend}) and the *choice* ({@link chooseMusicPath}) — so the
 * decision is a pure function three lines of test can pin down.
 *
 * > ## The tracker path is off in every shipped build
 * >
 * > No tracker backend ships. `chiptune3`'s worklet is **≈ 518 KB gzipped** on its own
 * > ({@link TRACKER_WORKLET_GZIP_BYTES}) — more than the whole Tizen `app.js` budget of 512 KB
 * > ({@link TIZEN_APP_JS_GZIP_BUDGET}), so it can never be inlined into the widget; it would have
 * > to be a separate file the app loads at run time, and it would cost Cortex-A55 time in every
 * > frame it renders. {@link trackerFitsBundle} states that arithmetic in code. Until somebody
 * > measures it on the monitors (plan §8.9), `chooseMusicPath` never returns `'tracker'` in a
 * > shipped build, because {@link TrackerAvailability.backend} is `null` there.
 *
 * **What the 2026-09-15 probe settled.** The M7 monitors have **WebAssembly and AudioWorklet**
 * (`docs/dev/input-probe-results.md` §9), 44.1 kHz output with a 50 ms base latency and four
 * Cortex-A55 cores — so the path is *technically* available on every supported device, and the
 * open question is CPU cost and download size, not support. {@link detectAudioCapabilities} is
 * what a device answers with at run time.
 *
 * **Implements.**
 * - shmup_feat.md §19 Music — the format behind the music content
 * - shmup_tech.md §4.3 — "ship OGG first; benchmark chiptune3 on our 5.5 displays as a possible
 *   upgrade"
 *
 * **Public API.** {@link MusicPath}, {@link MusicPathSource}, {@link AudioCapabilities},
 * {@link detectAudioCapabilities}, {@link TrackerBackend}, {@link TrackerHandle},
 * {@link TrackerAvailability}, {@link NO_TRACKER}, {@link chooseMusicPath},
 * {@link TRACKER_WORKLET_GZIP_BYTES}, {@link TIZEN_APP_JS_GZIP_BUDGET},
 * {@link trackerFitsBundle}, {@link TRACKER_MODULE_EXTENSIONS}, {@link isTrackerModuleUrl}.
 *
 * @module
 */
import { defineModule } from '@shmup/core';

/** Module descriptor. */
export const moduleInfo = defineModule({
  name: 'tracker',
  status: 'implemented',
  specRefs: ['shmup_feat.md §19', 'shmup_tech.md §4.3'],
});

/**
 * How a track's music is produced.
 *
 * - `song` — the deterministic chip synth renders it to PCM at load (decision D22, what ships).
 * - `file` — a recorded OGG is fetched and decoded at load (decision D22's "final music").
 * - `tracker` — a MOD / XM / IT module is played live by libopenmpt in an AudioWorklet (M3-03).
 * - `none` — the track has no source this device can play; the music player stays silent.
 */
export type MusicPath = 'song' | 'file' | 'tracker' | 'none';

/** What a track offers, as far as the path decision is concerned. */
export interface MusicPathSource {
  /** The track carries a chip song (`audio-web/synth`). */
  readonly song: boolean;
  /** The track carries a recorded file (OGG). */
  readonly file: boolean;
  /** The track carries a tracker module (MOD / XM / IT). */
  readonly module: boolean;
}

/** What a device can do, as far as the music paths are concerned. */
export interface AudioCapabilities {
  /** `AudioWorklet` is available (Chromium 66+; the M7 monitors have it). */
  readonly audioWorklet: boolean;
  /** `WebAssembly` is available (the M7 monitors have it). */
  readonly wasm: boolean;
}

/** The globals {@link detectAudioCapabilities} reads — injected so tests need no browser. */
export interface AudioCapabilityScope {
  /** `window.AudioWorkletNode`, if the engine has it. */
  readonly AudioWorkletNode?: unknown;
  /** `window.WebAssembly`, if the engine has it. */
  readonly WebAssembly?: unknown;
}

/**
 * Reads a device's audio capabilities (M3-03).
 *
 * @param scope - The global object (default: `globalThis`). A test passes a plain object.
 * @returns What the device supports. Never throws — a missing global is simply `false`.
 *
 * @example
 * ```ts
 * detectAudioCapabilities();                       // the real device
 * detectAudioCapabilities({ WebAssembly: {} });    // wasm only
 * ```
 */
export function detectAudioCapabilities(
  scope: AudioCapabilityScope = globalThis,
): AudioCapabilities {
  return {
    audioWorklet: typeof scope.AudioWorkletNode === 'function',
    wasm: typeof scope.WebAssembly === 'object' && scope.WebAssembly !== null,
  };
}

/** A tracker module playing (or ready to play) on the audio graph. */
export interface TrackerHandle {
  /**
   * Starts (or restarts) playback from the beginning.
   *
   * @returns Resolves once the worklet is rendering.
   */
  start(): Promise<void>;
  /** Stops playback and releases the worklet node. */
  stop(): void;
  /**
   * Sets the playback gain.
   *
   * @param volume - 0…1.
   */
  setVolume(volume: number): void;
}

/**
 * A live tracker player — the seam a build plugs libopenmpt into. **Nothing in this repo
 * implements it**: `chiptune3` is not a dependency (see the module docblock), so every shipped
 * build passes `null` and the tracker path is never chosen.
 */
export interface TrackerBackend {
  /**
   * Loads a module file and attaches it to the audio graph.
   *
   * @param url - Relative URL of the `.mod` / `.xm` / `.it` file, as the music content names it.
   * @returns Resolves with the handle, or rejects when the module cannot be loaded or decoded.
   */
  load(url: string): Promise<TrackerHandle>;
  /** Releases the worklet and the WASM instance. */
  dispose(): void;
}

/** What the host knows about the tracker path. */
export interface TrackerAvailability {
  /** The device's capabilities ({@link detectAudioCapabilities}). */
  readonly caps: AudioCapabilities;
  /** The backend, or `null` when the build ships none — the shipped case. */
  readonly backend: TrackerBackend | null;
}

/**
 * The availability every shipped build has: whatever the device can do, there is no backend, so
 * the tracker path is never chosen.
 */
export const NO_TRACKER: TrackerAvailability = Object.freeze({
  caps: Object.freeze({ audioWorklet: false, wasm: false }),
  backend: null,
});

/**
 * Size of `chiptune3`'s libopenmpt worklet, gzipped (`shmup_tech.md` §4.3, version 0.8.9). The
 * figure is the library's published one, not a measurement of ours — nothing in this repo has ever
 * downloaded it.
 */
export const TRACKER_WORKLET_GZIP_BYTES = 518 * 1024;

/**
 * The Tizen widget's whole `app.js` budget, gzipped (`apps/tizen/scripts/check-bundle.mjs`
 * `APP_JS_GZIP_BUDGET`). Repeated here so {@link trackerFitsBundle} can state the comparison
 * without `@shmup/audio-web` depending on an app.
 */
export const TIZEN_APP_JS_GZIP_BUDGET = 512 * 1024;

/**
 * Whether the tracker player could be inlined into a bundle of a given budget (M3-03).
 *
 * @param budgetGzipBytes - The bundle's gzip budget (default {@link TIZEN_APP_JS_GZIP_BUDGET}).
 * @param usedGzipBytes - What the bundle already uses (default 0 — the most generous case).
 * @returns `true` when {@link TRACKER_WORKLET_GZIP_BYTES} still fits.
 *
 * @remarks
 * It never does on the TV: the player alone is larger than the whole widget's budget, which is why
 * a tracker build would have to load it as a separate file (the OGG path's XHR precedent,
 * decision D25) rather than inline it.
 *
 * @example
 * ```ts
 * trackerFitsBundle(); // → false, by 6 KB before a single line of game code
 * ```
 */
export function trackerFitsBundle(
  budgetGzipBytes: number = TIZEN_APP_JS_GZIP_BUDGET,
  usedGzipBytes = 0,
): boolean {
  return usedGzipBytes + TRACKER_WORKLET_GZIP_BYTES <= budgetGzipBytes;
}

/** Module formats libopenmpt reads that the music content may name. */
export const TRACKER_MODULE_EXTENSIONS: readonly string[] = Object.freeze([
  '.mod',
  '.xm',
  '.it',
  '.s3m',
]);

/**
 * Whether a URL names a tracker module (M3-03).
 *
 * @param url - A relative URL from the music content.
 * @returns `true` when its extension is one of {@link TRACKER_MODULE_EXTENSIONS}.
 *
 * @example
 * ```ts
 * isTrackerModuleUrl('audio/music/zone-a.xm'); // → true
 * isTrackerModuleUrl('audio/music/zone-a.ogg'); // → false
 * ```
 */
export function isTrackerModuleUrl(url: string): boolean {
  const lower = url.toLowerCase();
  for (let i = 0; i < TRACKER_MODULE_EXTENSIONS.length; i++) {
    if (lower.slice(-TRACKER_MODULE_EXTENSIONS[i].length) === TRACKER_MODULE_EXTENSIONS[i]) {
      return true;
    }
  }
  return false;
}

/**
 * Picks the path a track plays through (M3-03).
 *
 * @remarks
 * The order is **tracker → file → song → none**, and the tracker is only ever picked when all
 * three hold: the track carries a module, the device has AudioWorklet *and* WebAssembly, and the
 * build supplied a {@link TrackerBackend}. The last condition is the one that fails everywhere
 * today, so this returns what M2's loader already did — which is exactly why it is safe to put the
 * decision in the loader's way now and measure the tracker later.
 *
 * A recorded file beats a chip song because the chip song is the placeholder (decision D22: "ship
 * OGG first", "placeholders: procedural chip songs"); a track that carries both is a track whose
 * real music has arrived.
 *
 * @param source - What the track carries.
 * @param availability - What the device and the build can do (default {@link NO_TRACKER}).
 * @returns The path to use.
 *
 * @example
 * ```ts
 * chooseMusicPath({ song: true, file: false, module: true }); // → 'song' (no backend ships)
 * chooseMusicPath({ song: true, file: false, module: true }, live); // → 'tracker'
 * ```
 */
export function chooseMusicPath(
  source: MusicPathSource,
  availability: TrackerAvailability = NO_TRACKER,
): MusicPath {
  if (
    source.module &&
    availability.backend !== null &&
    availability.caps.audioWorklet &&
    availability.caps.wasm
  ) {
    return 'tracker';
  }
  if (source.file) return 'file';
  if (source.song) return 'song';
  return 'none';
}
