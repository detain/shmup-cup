/**
 * # replay — input recording and playback
 *
 * **Status: placeholder.** Declares the intended public API only; no game logic yet.
 *
 * **Responsibility.** Replays: per-tick action bitmasks per player (RLE-compressed; ~72 KB raw per 20
 * min per player), a header with build hash, seed, every sim-affecting option (see
 * `config`), start stage/checkpoint and loadout, and periodic state hashes to detect
 * desyncs. Replays are locked to a build. Attract mode, golden-replay tests and the
 * cross-engine determinism check all use the same playback path.
 *
 * **Implements.**
 * - shmup_feat.md §21 Replays
 * - shmup_feat.md §22 — cross-engine determinism test
 * - shmup_feat.md §24 — auto-recorded dev runs, golden replays
 *
 * **Intended public API.** The declarations below (and the `Planned` notes at the
 * end of the file) are the contract later steps implement.
 *
 * @module
 */
import type { GameConfig } from '../config/index.js';
import { defineModule } from '../module-info.js';

/** Module descriptor (see {@link defineModule}). */
export const moduleInfo = defineModule({
  name: 'replay',
  status: 'placeholder',
  specRefs: ['shmup_feat.md §21', 'shmup_feat.md §22', 'shmup_feat.md §24'],
});

/** Replay file header. */
export interface ReplayHeader {
  readonly formatVersion: number;
  readonly buildHash: string;
  readonly seed: number;
  /** All sim-affecting options. */
  readonly config: GameConfig;
  readonly startStage: string;
  readonly startCheckpoint: number;
}

/** A decoded replay. */
export interface Replay {
  readonly header: ReplayHeader;
  /** One `held` mask per tick, per player. */
  readonly inputs: readonly Uint16Array[];
  /** State hash every N ticks. */
  readonly stateHashes: Uint32Array;
}

// Planned: createRecorder(), recordTick(recorder, snapshot), encodeReplay/decodeReplay (RLE),
//          createPlayback(replay): PlatformInput.
