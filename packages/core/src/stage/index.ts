/**
 * # stage — stage runtime: timeline, camera path, checkpoints, tilemap, parallax
 *
 * **Status: placeholder.** Declares the intended public API only; no game logic yet.
 *
 * **Responsibility.** Runs a stage: a scroll-driven event timeline (events pre-sorted by camera X and
 * consumed through a cursor; time-keyed while the scroll is stopped or during bosses),
 * the scripted camera path (speed ramps, stops, vertical and diagonal sections, boss
 * lock, high-speed sections), the spawner, invisible checkpoints (scroll X + event
 * cursor + loadout rule), chunked tilemaps with separate visual/collision layers, and
 * the parallax layer description consumed by the renderer. Later: branching zone map and
 * in-stage branches, hidden bonus stages.
 *
 * **Implements.**
 * - shmup_feat.md §14 Stages / zones
 * - shmup_feat.md §10 — invisible checkpoints
 * - shmup_feat.md §22 Stage runtime
 *
 * **Intended public API.** The declarations below (and the `Planned` notes at the
 * end of the file) are the contract later steps implement.
 *
 * @module
 */
import { defineModule } from '../module-info.js';

/** Module descriptor (see {@link defineModule}). */
export const moduleInfo = defineModule({
  name: 'stage',
  status: 'placeholder',
  specRefs: ['shmup_feat.md §14', 'shmup_feat.md §10', 'shmup_feat.md §22'],
});

/** One spawn/script event on the stage timeline (from `content/stages/*.json`). */
export interface StageEvent {
  /** Camera X (pixels) at which the event fires. */
  readonly x: number;
  /** Event type, e.g. `'spawn'`, `'formation'`, `'boss'`, `'music'`, `'scroll'`. */
  readonly type: string;
  /** Enemy spec id to spawn (spawn / formation events). */
  readonly enemy?: string;
  /** Formation id — enemies sharing it drop an item when all are killed. */
  readonly formation?: string;
  /** Movement path id for the spawned enemies. */
  readonly path?: string;
  /** Zone branch the event belongs to (Darius-style route splits). */
  readonly branch?: string;
}

/** Camera state (playfield pixels). */
export interface CameraState {
  /** Scroll position X (left edge of the view) in playfield pixels. */
  x: number;
  /** Scroll position Y (top edge of the view) in playfield pixels. */
  y: number;
  /** Pixels per tick. */
  speed: number;
  /** `true` while scrolling is locked (bosses). */
  locked: boolean;
}

/** An invisible restart point. */
export interface Checkpoint {
  /** Camera X to restart from. */
  readonly scrollX: number;
  /** Index of the first timeline event not yet fired at `scrollX`. */
  readonly eventCursor: number;
}

/** Drives one stage. */
export interface StageRunner {
  /** Current camera (read-only outside the stage module). */
  readonly camera: Readonly<CameraState>;
  /** Index of the next timeline event to fire. */
  readonly eventCursor: number;
  /** Advances camera and fires due events. */
  tick(): void;
  /**
   * Restarts from a checkpoint (death penalty "arcade").
   *
   * @param checkpoint - Where to put the camera and the event cursor.
   */
  restartAt(checkpoint: Checkpoint): void;
}

// Planned: createStageRunner(stageData, spawner), tilemap chunks, parallax layer specs, zone map.
