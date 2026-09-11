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
  readonly type: string;
  readonly enemy?: string;
  readonly formation?: string;
  readonly path?: string;
  readonly branch?: string;
}

/** Camera state (playfield pixels). */
export interface CameraState {
  x: number;
  y: number;
  /** Pixels per tick. */
  speed: number;
  /** `true` while scrolling is locked (bosses). */
  locked: boolean;
}

/** An invisible restart point. */
export interface Checkpoint {
  readonly scrollX: number;
  readonly eventCursor: number;
}

/** Drives one stage. */
export interface StageRunner {
  readonly camera: Readonly<CameraState>;
  readonly eventCursor: number;
  /** Advances camera and fires due events. */
  tick(): void;
  /** Restarts from a checkpoint (death penalty "arcade"). */
  restartAt(checkpoint: Checkpoint): void;
}

// Planned: createStageRunner(stageData, spawner), tilemap chunks, parallax layer specs, zone map.
