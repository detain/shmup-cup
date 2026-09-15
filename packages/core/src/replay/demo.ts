/**
 * # replay/demo — attract-mode playback of a bundled replay (plan M2-15)
 *
 * **Responsibility.** The demo play of the attract loop (shmup_feat.md §16 "attract / demo mode:
 * plays bundled replays", §21 "attract mode uses the same playback path"): a {@link DemoPlayback}
 * owns a World created exactly like {@link createReplayGame}'s (the header's config resolved over
 * the content's difficulty table, god mode from `assisted`, the start checkpoint) and feeds it the
 * recording tick by tick through the ordinary {@link createPlayback} — so the demo is checked for
 * desyncs like a golden replay. The scene flow's `DemoScene` (`core/scenes`) creates one per demo
 * start, steps it, shows its World and HUD, and moves on when it ends.
 *
 * The World pushes its presentation events into the queue it is given (the scene flow gives it a
 * private one and forwards what the screen shows — particles, shake, flash — but no sound), and
 * never reads the session's debug switches: the demo has its own.
 *
 * **Implements.** shmup_feat.md §16 — attract / demo mode from bundled replays; §21 — attract mode
 * on the replay playback path.
 *
 * **Public API.** Re-exported by `core/replay`: {@link DemoPlayback}, {@link createDemoPlayback},
 * {@link DemoPlaybackOptions}, {@link DEMO_BUILD_ID}.
 *
 * @module
 */
import { DEFAULT_DIFFICULTY_TABLE, resolveGameConfig } from '../config/index.js';
import type { ContentDb } from '../data/index.js';
import { createDebugFlags, jumpToCheckpoint, type DebugFlags } from '../debug/index.js';
import { createEventQueue, type EventQueue } from '../events/index.js';
import { createWorld, stepWorld, type World } from '../world/index.js';
import { createPlayback, type Replay, type ReplayPlayback } from './format.js';

/**
 * The build id the bundled demos (`content/demos/*.replay.json`) are recorded with: like golden
 * replays, their hashes — not a build — lock them.
 */
export const DEMO_BUILD_ID = 'demo';

/** Options of {@link createDemoPlayback}. */
export interface DemoPlaybackOptions {
  /** Where the demo World pushes its presentation events (default: a new private queue). */
  readonly events?: EventQueue;
}

/**
 * A demo in progress: its World, the playback feeding it and the World's own debug switches.
 *
 * @remarks
 * {@link DemoPlayback.step} never allocates (the playback's poll and check write into existing
 * typed arrays, `stepWorld` is the World's allocation-free tick — apart from the behaviour
 * coroutines a stage's spawns create, decision D29, as in any game). Creating one allocates the
 * World: a scene transition.
 */
export class DemoPlayback {
  /** The replay being played. */
  readonly replay: Replay;
  /** The demo's World (at the replay's start before the first {@link DemoPlayback.step}). */
  readonly world: World;
  /** The playback feeding it (its desync report is updated after every tick). */
  readonly playback: ReplayPlayback;
  /** The World's own debug switches (god mode = the header's `assisted`). */
  readonly flags: DebugFlags;

  /**
   * Wraps a prepared World (use {@link createDemoPlayback}).
   *
   * @param replay - The replay.
   * @param world - Its World at the start.
   * @param playback - The playback.
   * @param flags - The World's debug switches.
   */
  constructor(replay: Replay, world: World, playback: ReplayPlayback, flags: DebugFlags) {
    this.replay = replay;
    this.world = world;
    this.playback = playback;
    this.flags = flags;
  }

  /**
   * Whether the demo goes on: recorded ticks are left and every hash so far matched (a demo that
   * desynced — content or simulation changed since it was recorded — ends at once).
   */
  get running(): boolean {
    return !this.playback.done && this.playback.report.ok;
  }

  /**
   * Plays one recorded tick: polls the recording, steps the World, compares the hash when one is
   * due. Does nothing once the demo is over. Never allocates (see the class remarks).
   *
   * @returns Whether the demo goes on ({@link DemoPlayback.running}).
   */
  step(): boolean {
    if (!this.running) return false;
    const input = this.playback.poll();
    stepWorld(this.world, input);
    this.playback.check(this.world);
    return this.running;
  }
}

/**
 * Creates the playback of a demo: the World its header describes — `createWorld` with the header's
 * config (re-resolved over the content's difficulty table, as `createGame` does), god mode from
 * `assisted` in the World's own debug switches, the stage restarted at `header.checkpoint` — and
 * the replay's playback.
 *
 * @param replay - The replay (decoded with `decodeReplay`).
 * @param content - The content it was recorded with.
 * @param options - The event queue the World pushes into.
 * @returns The demo, before its first tick.
 * @throws {RangeError} When the header's config names a stage the content does not have, or its
 *   checkpoint does not exist on the stage (see `createWorld`, `jumpToCheckpoint`).
 *
 * @example
 * ```ts
 * const demo = createDemoPlayback(decodeReplay(doc), db, { events: privateQueue });
 * while (demo.step()) renderer.render(demo.world.view);
 * demo.playback.report.ok; // → true when the demo played in sync to its end
 * ```
 */
export function createDemoPlayback(
  replay: Replay,
  content: ContentDb,
  options: DemoPlaybackOptions = {},
): DemoPlayback {
  const header = replay.header;
  const config = resolveGameConfig(header.config, content.difficulty ?? DEFAULT_DIFFICULTY_TABLE);
  const flags = createDebugFlags();
  flags.godMode = header.assisted;
  const world = createWorld(config, content, {
    events: options.events ?? createEventQueue(),
    debugFlags: flags,
  });
  if (header.checkpoint >= 0 && !jumpToCheckpoint(world, header.checkpoint)) {
    throw new RangeError(
      `demo checkpoint ${header.checkpoint} does not exist on stage ${String(header.stageId)}`,
    );
  }
  const playback = createPlayback(replay);
  // The starting state: compares the final hash of a zero-tick replay (nothing otherwise).
  playback.check(world);
  return new DemoPlayback(replay, world, playback, flags);
}
