/**
 * # presentation — contracts for renderer and audio back-ends
 *
 * **Responsibility.** Declares the interfaces that presentation packages implement
 * (`@shmup/render-pixi` → {@link IRenderer}, `@shmup/audio-web` → {@link IAudio}).
 * The simulation never calls them: the host app reads sim state + drained sim events
 * each frame and hands them to the renderer and the mixer. This is the "hard
 * sim / presentation split" — it gives headless tests, fast-forward, replays and
 * attract mode for free.
 *
 * **Implements.**
 * - shmup_feat.md §22 Architecture (hard sim/presentation split), Rendering pipeline,
 *   Audio engine
 * - shmup_tech.md §3.1 (`render-pixi/ # IRenderer impl`, `audio-web/ # IAudio impl`)
 *
 * **Public API.** {@link IRenderer}, {@link RenderFrame}, {@link IAudio},
 * {@link AudioBus}, {@link AudioState}.
 *
 * **Planned API.** `RenderFrame` grows read-only views of the sim (pools, entities,
 * camera, HUD model) plus the drained `events` queue; `IAudio` grows
 * `playSfx(id, priority)`, `playMusic(trackId)`, `duck(amount, ticks)`
 * (shmup_feat.md §19).
 *
 * @module
 */
import { defineModule } from '../module-info.js';

/** Module descriptor (see {@link defineModule}). */
export const moduleInfo = defineModule({
  name: 'presentation',
  status: 'partial',
  specRefs: ['shmup_feat.md §22', 'shmup_tech.md §3.1'],
});

/** What the renderer receives every displayed frame. Read-only view of sim state. */
export interface RenderFrame {
  /** Simulation tick the frame shows. */
  readonly tick: number;
  /** Interpolation factor between the previous and current tick (0 ≤ alpha < 1). */
  readonly alpha: number;
}

/**
 * A renderer back-end. Draws the game at the internal resolution (384×216) and
 * presents it integer-scaled with nearest-neighbour filtering.
 */
export interface IRenderer {
  /** Internal (virtual) width in pixels. */
  readonly width: number;
  /** Internal (virtual) height in pixels. */
  readonly height: number;
  /**
   * Adapts the output to a new display size.
   *
   * @param cssWidth - Available width in CSS pixels.
   * @param cssHeight - Available height in CSS pixels.
   */
  resize(cssWidth: number, cssHeight: number): void;
  /**
   * Draws one frame.
   *
   * @param frame - The sim state to show.
   */
  render(frame: RenderFrame): void;
  /** Releases GPU resources. */
  destroy(): void;
}

/** Mixer buses with independent volume (shmup_feat.md §19 Buses). */
export type AudioBus = 'master' | 'music' | 'sfx' | 'ui';

/** Audio context state as exposed to the game. */
export type AudioState = 'uninitialized' | 'suspended' | 'running' | 'closed';

/** An audio back-end (mixer). */
export interface IAudio {
  /** Current state of the underlying audio context. */
  readonly state: AudioState;
  /** Creates/resumes the context; call from a user gesture on the web. */
  unlock(): Promise<void>;
  /** Suspends output (app hidden / paused). */
  suspend(): Promise<void>;
  /** Resumes output after {@link IAudio.suspend}. */
  resume(): Promise<void>;
  /**
   * Sets a bus volume.
   *
   * @param bus - Bus to change.
   * @param volume - Linear gain, clamped to 0…1.
   */
  setBusVolume(bus: AudioBus, volume: number): void;
  /** Closes the context and releases resources. */
  destroy(): Promise<void>;
}
