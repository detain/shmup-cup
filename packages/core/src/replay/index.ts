/**
 * # replay — input recording, playback and desync detection
 *
 * **Responsibility.** Replays reproduce a gameplay session tick for tick from its input: a
 * {@link ReplayHeader} holds everything needed to recreate the starting state (format version,
 * build id, seed, every sim-affecting option — the whole `GameConfig` —, the stage, the
 * checkpoint it started from, the starting loadout and whether god mode was on — `assisted`), and
 * the body holds, per tick and per player, the input as one 32-bit word `held | pressed << 16`
 * plus a {@link hashWorld | state hash} every {@link REPLAY_HASH_INTERVAL} ticks and after the
 * last tick. {@link createReplayRecorder} records a session by wrapping its `PlatformInput`;
 * {@link createPlayback} is a `PlatformInput` that feeds the recording back into a fresh session
 * and compares the hashes, filling a {@link DesyncReport} — the first tick whose state differs.
 * Golden-replay tests, the cross-engine determinism check and attract mode all use this
 * one playback path (attract mode since M2-15 — see below).
 *
 * **Recording.** Each tick the recorder polls its source once (the game polls the recorder) and
 * stores every player's `held` and `pressed` masks; `released` is derived on playback exactly as
 * `commitPlayerInput` derives it (held last tick and not now), and taps that were pressed and
 * released between two ticks survive through `pressed`. The input device is not recorded (the
 * simulation never reads it). After each tick the host calls `check(world)`: every
 * {@link REPLAY_HASH_INTERVAL}-th tick the recorder stores `hashWorld(world)`; `finish(world)` adds
 * the final hash.
 *
 * **File format.** {@link encodeReplay} turns a replay into plain JSON
 * (`{ kind: 'replay', header, ticks, hashInterval, inputs, hashes, finalHash }`): each player's
 * words are **run-length encoded** — runs of `(value, count)` as unsigned LEB128 varints — and
 * base64 encoded (a 20-minute session idling in one lane compresses to a few bytes; an active one
 * to a few KB). {@link decodeReplay} validates every field (format version, config through
 * `resolveGameConfig`, run lengths adding up to `ticks`, hash count) and throws a `RangeError`
 * naming what is wrong.
 *
 * **Build lock.** `header.buildId` names the build that recorded the replay (`__SHMUP_BUILD__`,
 * the git SHA, in the apps). Playback compares it with the caller's build when given
 * ({@link PlaybackOptions.buildId} → {@link DesyncReport.buildMatches}); whether a mismatch refuses
 * the replay is the host's decision — golden replays are recorded with a fixed id and trust their
 * hashes instead.
 *
 * **Zero allocation.** A recorder preallocates its buffers ({@link RecorderOptions.capacity}, 10
 * minutes by default) and only grows them (doubling) when a session outlasts them; `poll()` and
 * `check()` of both the recorder and the playback otherwise write numbers into existing typed
 * arrays. Hashing every 600 ticks boxes one number. Encoding, decoding and `finish()` allocate
 * (cold paths).
 *
 * **Implements.**
 * - shmup_feat.md §21 Replays — per-tick bitmask per player, RLE-compressed; header with build
 *   hash, seed, every sim-affecting option, start stage / checkpoint, loadout; periodic state
 *   hashes to detect desyncs; locked to the build
 * - shmup_feat.md §22 — determinism (the same replay reproduces the same hashes)
 * - shmup_feat.md §24 — golden replays asserting state hashes
 *
 * **Public API.** {@link ReplayHeader}, {@link ReplayHeaderOptions}, {@link createReplayHeader},
 * {@link Replay}, {@link ReplayRecorder}, {@link RecorderOptions}, {@link createReplayRecorder},
 * {@link ReplayPlayback}, {@link PlaybackOptions}, {@link DesyncReport}, {@link createPlayback},
 * {@link createReplayGame}, {@link playReplay}, {@link ReplayRun}, {@link ReplayJson},
 * {@link encodeReplay}, {@link decodeReplay}, {@link packReplayInput}, {@link encodeInputRuns},
 * {@link decodeInputRuns}, {@link encodeBase64}, {@link decodeBase64}, {@link REPLAY_KIND},
 * {@link REPLAY_FORMAT_VERSION}, {@link REPLAY_HASH_INTERVAL}; M2-15: {@link DemoPlayback},
 * {@link createDemoPlayback}, {@link DemoPlaybackOptions}, {@link DEMO_BUILD_ID}; M3-01 (`./run.ts`):
 * the whole-run replays {@link RunReplay} / {@link RunSegment} and their JSON
 * ({@link encodeRunReplay}, {@link decodeRunReplay}, {@link runReplayText},
 * {@link parseRunReplayText}, {@link RUN_REPLAY_KIND}, {@link RUN_REPLAY_FORMAT_VERSION}), the
 * {@link SegmentRecorder} and its limits ({@link SEGMENT_CAPACITY}, {@link MAX_RUN_SEGMENTS},
 * {@link MAX_SEGMENT_ACTIONS}), the flow actions {@link RunAction}, the assist flags
 * {@link AssistFlag} / {@link runAssisted} (also `ReplayHeader.assists`) and the replay library
 * ({@link ReplayLibrary}, {@link createReplayLibrary}, {@link ReplaySummary},
 * {@link ReplayStoreResult}, {@link replayStorageKey}, {@link REPLAY_SLOTS},
 * {@link KEPT_REPLAY_SLOTS}, {@link MAX_REPLAY_TEXT}, {@link MAX_KEPT_REPLAY_TEXT}).
 *
 * **Attract playback (M2-15).** The attract loop's demo play (shmup_feat.md §16) runs the bundled
 * demos (`content/demos/*.replay.json`, `core/data` `ContentDb.demos`) through this same playback
 * path: `./demo.ts` {@link createDemoPlayback} builds the World a header describes — like
 * {@link createReplayGame}, but a World with its own event queue and debug switches instead of a
 * bare-gameplay session — and {@link DemoPlayback.step} plays it tick by tick, hashes checked (a
 * demo that desyncs ends). The session-free parts (header, recorder, playback, file format) live in
 * `./format.ts`, which the scene flow imports without importing `core/game`.
 *
 * @module
 */
import type { ContentDb } from '../data/index.js';
import { jumpToCheckpoint } from '../debug/index.js';
import { createGame, type Game } from '../game/index.js';
import { defineModule } from '../module-info.js';
import { createHeadlessPlatform, type Platform } from '../platform/index.js';
import {
  createPlayback,
  type DesyncReport,
  type PlaybackOptions,
  type Replay,
  type ReplayHeader,
} from './format.js';

export {
  REPLAY_FORMAT_VERSION,
  REPLAY_HASH_INTERVAL,
  REPLAY_KIND,
  createPlayback,
  createReplayHeader,
  createReplayRecorder,
  decodeBase64,
  decodeInputRuns,
  decodeReplay,
  encodeBase64,
  encodeInputRuns,
  encodeReplay,
  packReplayInput,
  type DesyncReport,
  type PlaybackOptions,
  type RecorderOptions,
  type Replay,
  type ReplayHeader,
  type ReplayHeaderOptions,
  type ReplayJson,
  type ReplayPlayback,
  type ReplayRecorder,
} from './format.js';
export {
  DEMO_BUILD_ID,
  DemoPlayback,
  createDemoPlayback,
  type DemoPlaybackOptions,
} from './demo.js';
export {
  AssistFlag,
  KEPT_REPLAY_SLOTS,
  MAX_KEPT_REPLAY_TEXT,
  MAX_REPLAY_TEXT,
  MAX_RUN_SEGMENTS,
  MAX_SEGMENT_ACTIONS,
  REPLAY_SLOTS,
  RUN_REPLAY_FORMAT_VERSION,
  RUN_REPLAY_KIND,
  ReplayStoreResult,
  RunAction,
  SEGMENT_CAPACITY,
  SegmentRecorder,
  createReplayLibrary,
  decodeRunReplay,
  encodeRunReplay,
  parseRunReplayText,
  replayStorageKey,
  runAssisted,
  runReplayText,
  type ReplayLibrary,
  type ReplaySummary,
  type RunReplay,
  type RunReplayJson,
  type RunSegment,
  type RunSegmentJson,
} from './run.js';

/** Module descriptor (see {@link defineModule}). */
export const moduleInfo = defineModule({
  name: 'replay',
  status: 'implemented',
  specRefs: ['shmup_feat.md §21', 'shmup_feat.md §22', 'shmup_feat.md §24', 'shmup_feat.md §16'],
});

/**
 * Creates the session a replay header describes: `createGame(platform, header.config, content)`
 * (bare gameplay — one World), god mode on when the header is `assisted`, and the stage restarted
 * at `header.checkpoint` when it is not -1 — the same setup for recording and playback.
 *
 * @param platform - The platform; its `input` is the recorder or the playback.
 * @param header - The replay header.
 * @param content - The content the replay was recorded with.
 * @returns The game, before its first tick.
 * @throws {RangeError} When the header's config fails `resolveGameConfig` or names a stage the
 *   content does not have, or the checkpoint does not exist on the stage.
 *
 * @example
 * ```ts
 * const game = createReplayGame({ ...createHeadlessPlatform(), input: playback }, replay.header, db);
 * ```
 */
export function createReplayGame(
  platform: Platform,
  header: ReplayHeader,
  content: ContentDb,
): Game {
  const game = createGame(platform, header.config, content);
  game.debug.godMode = header.assisted;
  if (header.checkpoint >= 0 && !jumpToCheckpoint(game.world, header.checkpoint)) {
    throw new RangeError(
      `replay checkpoint ${header.checkpoint} does not exist on stage ${String(header.stageId)}`,
    );
  }
  return game;
}

/** Outcome of {@link playReplay}. */
export interface ReplayRun {
  /** The desync report after the last tick. */
  readonly report: DesyncReport;
  /** The session (its World holds the final state). */
  readonly game: Game;
}

/**
 * Plays a whole replay headless (a fresh session from its header, every recorded tick, hashes
 * checked) — the golden-replay tests and the determinism check.
 *
 * @param replay - The replay.
 * @param content - The content it was recorded with.
 * @param options - The running build's id (see {@link PlaybackOptions}).
 * @returns The report and the session.
 * @throws {RangeError} See {@link createReplayGame}.
 *
 * @example
 * ```ts
 * const { report } = playReplay(decodeReplay(JSON.parse(text)), db);
 * report.ok; // → false with the first diverging tick in report.desyncTick
 * ```
 */
export function playReplay(
  replay: Replay,
  content: ContentDb,
  options: PlaybackOptions = {},
): ReplayRun {
  const playback = createPlayback(replay, options);
  const platform = createHeadlessPlatform();
  const game = createReplayGame({ ...platform, input: playback }, replay.header, content);
  // The starting state: compares the final hash of a zero-tick replay (nothing otherwise).
  playback.check(game.world);
  while (!playback.done) {
    game.step();
    playback.check(game.world);
  }
  return { report: playback.report, game };
}
