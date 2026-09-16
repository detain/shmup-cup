/**
 * # game — top-level game object (composition root of the core)
 *
 * **Responsibility.** {@link createGame} wires a {@link Platform} to the fixed-step
 * loop and owns the per-session state. Each tick it polls input once and advances the session.
 * A session runs in one of two ways:
 *
 * - **Bare gameplay** (the default — tests, tools, the shell's dev scenes): one gameplay
 *   {@link World} from creation, advanced with `stepWorld` every tick — the fixed tick pipeline
 *   `input → players → stage → scripts → movement → collision → damage → removal → fx` (plan §3.2,
 *   shmup_feat.md §22) — free flight with the KESTREL, or the stage `config.stage` names (M1-07).
 *   Nothing reacts to its status: the World keeps simulating after a game over or a stage clear.
 * - **The scene flow** (`options.scenes`, M1-16 — what the apps run): the `core/scenes` stack
 *   Boot → Title → Game ⇄ Pause → Stage clear / Game over. Only the top scene ticks; the game
 *   scene owns the World and creates a fresh one per game start, so {@link Game.world} changes
 *   identity then. {@link Game.inputContext} is the top scene's binding context, the render frame
 *   carries the World's view and HUD only while the game is visible, the UI list holds every
 *   visible scene's widgets, and `screen.dim` darkens the game under the pause menu. A platform
 *   resume while playing opens the pause menu. Since M1-17 the flow plays with a `core/save`
 *   store (`options.save` — the Options screen's options, the title's HI, finished games recorded;
 *   a memory-only store when omitted) and offers the host's input profiles in CONTROLS
 *   (`options.inputProfiles`); since M2-15 the sound test gets the host's music titles
 *   (`options.soundTest`); since M2-16 the rebind screen talks to the host's input through
 *   `options.controls`.
 *
 * Every World of a session pushes into the same {@link EventQueue} ({@link Game.events}), so the
 * host drains one queue, and shares the session's debug switches ({@link Game.debug}, `core/debug`
 * — god mode, the outlines, the overlay survive a new game start).
 *
 * **Debug timing (M1-19).** {@link Game.frame} honours two of those switches: with
 * `debug.frameAdvance` only the ticks queued with {@link Game.requestStep} run (one per request —
 * the debug step command), and with `debug.slowMo` 2 or 4 the frame clock runs that many times
 * slower, so a tick runs every 2nd / 4th frame at 60 Hz. Switching either resets the loop
 * accumulator (no catch-up burst). Every tick still polls input once and runs the whole pipeline,
 * so determinism and replays are unaffected; {@link Game.step} ignores both switches.
 *
 * **Game-speed assist (M3-01).** With the scene flow, `SceneFlow.speedPercent` — the save's
 * `options.play.speed` (75 or 50 %) while the game scene is on top — slows the same clock that
 * feeds the fixed step, like slow motion: every tick still runs whole, so the simulation, its
 * replays and hashes are those of the normal speed (the run is only marked as assisted).
 *
 * Lifecycle: `platform.lifecycle.onSuspend` freezes the game (`state.suspended`);
 * `onResume` unfreezes it and resets the loop accumulator so no burst of catch-up
 * ticks runs (shmup_feat.md §3, Tizen certification). A user pause
 * (`state.paused`, via {@link Game.pause}) survives suspend/resume.
 *
 * **Implements.** shmup_tech.md §3.2 (core consumes `Platform`), shmup_feat.md §22
 * (tick order), §3 (pause on visibility change), §17 (scene flow), §23 (pause on resume).
 *
 * **Public API.** {@link createGame}, {@link Game}, {@link GameState}, {@link GameOptions}. A
 * session carries the validated {@link ContentDb} it was created with (`game.content`), so systems
 * read tunables from data instead of constants, its gameplay {@link World} (`game.world`), the
 * {@link EventQueue} its systems push presentation events into (`game.events`, drained by the host
 * once per frame), its scene flow (`game.scenes`, `null` for bare gameplay), its debug switches
 * (`game.debug`, `requestStep()` for frame advance) and builds the reused
 * {@link RenderFrame} of the render contract (`game.renderFrame()`).
 * `game.inputContext` names the binding context (`'game'` / `'menu'`, decision D15) the host's
 * input adapter should use, `game.inputSeats` how many player seats it should route (2 during a
 * co-op game — M2-06).
 *
 * **Difficulty (M2-01).** The session config is resolved with the content's difficulty table
 * (`content.difficulty` — the `rules` kind — or `core/config` `DEFAULT_DIFFICULTY_TABLE`), so the
 * preset's rank, lives, extends, continues and penalty come from data under the explicit
 * overrides. With the scene flow, the difficulty menu under START hands each game's World the
 * chosen preset's config (`SceneFlowHost.createWorld(config)`), so `game.world.config` may differ
 * from `game.config`.
 *
 * @module
 */
import { DEFAULT_DIFFICULTY_TABLE, resolveGameConfig, type GameConfig } from '../config/index.js';
import { EMPTY_CONTENT_DB, type ContentDb } from '../data/index.js';
import { createDebugFlags, type DebugFlags } from '../debug/index.js';
import type { InputContext, InputSnapshot } from '../input/index.js';
import { createEventQueue, type EventQueue } from '../events/index.js';
import { createFixedStepLoop } from '../loop/index.js';
import { defineModule } from '../module-info.js';
import type { Platform } from '../platform/index.js';
import {
  createSceneFlow,
  type ControlsSetup,
  type InputProfileSetup,
  type SceneFlow,
  type SceneStart,
  type SoundTestSetup,
} from '../scenes/index.js';
import type { ReplayLibrary } from '../replay/run.js';
import type { SaveStore } from '../save/index.js';
import { createWorld, stepWorld, type World } from '../world/index.js';
import {
  createDrawList,
  type DrawList,
  type RenderFrame,
  type ScreenView,
  type WorldView,
} from '../presentation/index.js';

/** Module descriptor (see {@link defineModule}). */
export const moduleInfo = defineModule({
  name: 'game',
  status: 'partial',
  specRefs: [
    'shmup_tech.md §3.2',
    'shmup_feat.md §3',
    'shmup_feat.md §22',
    'shmup_feat.md §17',
    'shmup_feat.md §23',
  ],
});

/** Mutable per-session state (read-only to presentation code). */
export interface GameState {
  /** Simulation ticks executed so far. */
  tick: number;
  /**
   * `true` while the session is paused with {@link Game.pause}; `step()` does nothing. The scene
   * flow's pause menu does not set it (it is a scene: the flow still ticks).
   */
  paused: boolean;
  /** `true` while the platform has the app backgrounded/hidden; `step()` does nothing. */
  suspended: boolean;
  /** Input used by the most recent tick. */
  input: InputSnapshot | null;
}

/** A running game session. */
export interface Game {
  /**
   * The resolved, frozen configuration of this session. With the scene flow a game's World may
   * run another difficulty preset (the difficulty menu under START — `world.config`).
   */
  readonly config: GameConfig;
  /** Validated game content with string ids already resolved to indices. */
  readonly content: ContentDb;
  /** The host platform the game was created on. */
  readonly platform: Platform;
  /**
   * Presentation events pushed by the simulation (SFX, music, particles, shake …) — the same
   * queue as `world.events` (with the scene flow every World of the session pushes into it, and
   * so do the menus' sounds and the scenes' music). The host drains it once per displayed frame
   * (`game.events.drain(dispatch)`); a headless run may ignore it (the ring drops the oldest
   * events when full).
   */
  readonly events: EventQueue;
  /**
   * The gameplay session: players, camera, RNG streams, pools and the view the renderer draws.
   * Read-only to hosts (debug overlays, tests); only {@link Game.step} advances it.
   *
   * @remarks
   * With the scene flow this is the game scene's World: a fresh one per game start (a new object —
   * do not keep it across a start), a placeholder before the first.
   */
  readonly world: World;
  /**
   * The scene flow (title, pause, game over … — `core/scenes`), or `null` for bare gameplay
   * (`createGame` without `options.scenes`).
   */
  readonly scenes: SceneFlow | null;
  /** Current state. Do not mutate from outside the core. */
  readonly state: Readonly<GameState>;
  /**
   * The session's debug switches (`core/debug`), shared by every World it creates
   * (`world.debugFlags` is this object). God mode changes what a tick does; `frameAdvance` and
   * `slowMo` change how many ticks {@link Game.frame} runs; the rest is for the overlay. The debug
   * controls (`createDebugControls`) flip them; hosts only create those in dev / test builds.
   */
  readonly debug: DebugFlags;
  /**
   * The binding table the host's input adapter should use right now (decision D15): the top
   * scene decides — `'menu'` for menus and the pause screen, `'game'` while playing.
   *
   * @remarks
   * Always `'game'` for bare gameplay; with the scene flow the top scene's context. The host reads
   * it once per frame and forwards a change to its adapter (`@shmup/shell` calls
   * `input.setContext`); reading it never allocates.
   */
  readonly inputContext: InputContext;
  /**
   * How many player seats the host's input adapter should route right now (M2-06, two-player
   * co-op): `2` while a co-op game (`config.coop`) is being played — player 2's controller drives
   * player 2 and an unassigned controller may take that seat —, `1` otherwise (every controller
   * drives player 1; menus merge every player anyway).
   *
   * @remarks
   * Bare gameplay: `2` when the session's config is a co-op one. With the scene flow: its
   * `inputSeats` (the game scene — or its continue countdown — on top with a co-op World). The host
   * reads it once per frame and forwards a change (`@shmup/shell` calls `input.setSeats`); reading
   * it never allocates.
   */
  readonly inputSeats: number;
  /**
   * Runs exactly one simulation tick: polls `platform.input` once, then advances the
   * {@link Game.world} by one tick (`stepWorld`) — with the scene flow, the top scene instead (the
   * game scene steps the World). No-op (and no poll) while paused or suspended.
   */
  step(): void;
  /**
   * Host frame callback: runs the due fixed ticks for this timestamp.
   *
   * @param nowMs - Monotonic timestamp in ms (rAF argument).
   * @returns Number of ticks run (0 while paused or suspended, at most
   *   `config.maxTicksPerFrame`; under frame advance the queued steps, under slow motion the ticks
   *   of the slowed clock — see the module docs).
   */
  frame(nowMs: number): number;
  /**
   * Queues ticks for frame advance (the debug step command): while `debug.frameAdvance` is on,
   * the next {@link Game.frame} runs the queued ticks — and only those. Ignored while frame advance
   * is off; switching it off drops what is still queued.
   *
   * @remarks
   * The queued ticks all run in the next `frame()` call, however many there are (the
   * `maxTicksPerFrame` cap does not apply) — the e2e helper `stepTo` queues the ticks it needs to
   * reach an exact World tick this way. {@link Game.step} runs regardless of the switches.
   *
   * @param count - Ticks to queue (default 1; non-positive or non-integer counts are ignored).
   *
   * @example
   * ```ts
   * game.debug.frameAdvance = true; // the game freezes: frame() runs no tick on its own
   * game.requestStep(30);
   * game.frame(now); // → 30
   * ```
   */
  requestStep(count?: number): void;
  /**
   * Builds the frame description to hand to an `IRenderer`.
   *
   * @returns A reused object (do not keep it across frames); `alpha` is 0 while
   *   frozen so a paused picture does not wobble. For bare gameplay `world` is the World's view
   *   (`game.world.view`, the same object every frame) and `hud` / `ui` are empty draw lists;
   *   with the scene flow `world` is the World's view while the game scene is visible (else
   *   `null`), `tick` then the World's tick (frozen under the pause menu, 0 for a new World — else
   *   the flow's tick count), `hud` its HUD (rebuilt here only when it changed), `ui` every
   *   visible scene's widgets and `screen.dim` the top overlay's dim. Never allocates.
   */
  renderFrame(): RenderFrame;
  /**
   * Freezes the whole session (a host-level pause, e.g. a debugger; survives platform
   * suspend/resume). The scene flow's pause menu is a scene, not this.
   */
  pause(): void;
  /**
   * Clears the user pause and resets the loop accumulator (so no catch-up burst runs).
   * Does not override a platform suspend.
   */
  resume(): void;
  /**
   * Turns the loop's **vsync lock** on or off (M3-02b — `core/loop`
   * {@link FixedStepLoop.setVsyncLock}): on a fixed ~60 Hz display every frame runs exactly one
   * tick, so the M7's rAF jitter stops producing 0- and 2-tick frames.
   *
   * @remarks
   * The host asks for it once the refresh probe reads ≈ 60 Hz (`@shmup/shell`). It is suspended
   * automatically while frame advance, slow motion or the game-speed assist feed the loop a slowed
   * clock, and restored when they end. Presentation only: it changes no tick's content, so replays
   * and goldens are unaffected.
   *
   * @param on - Whether to lock one tick to one frame.
   */
  setVsyncLock(on: boolean): void;
  /** Whether the vsync lock was asked for (it is suspended while a debug timing mode runs). */
  readonly vsyncLock: boolean;
}

/** Options of {@link createGame} beyond the config (not recorded in replays). */
export interface GameOptions {
  /**
   * Run the scene flow, starting on this scene: `'boot'` (the apps — waits for
   * `game.scenes.finishBoot()`), `'title'` or `'game'` (straight into a game — dev and tests).
   * Omitted or `null`: bare gameplay (one World ticked from the start, no scenes).
   */
  readonly scenes?: SceneStart | null;
  /**
   * The save the scene flow plays with (`core/save`: loaded by the host before the title) — its
   * options fill the Options screen, its hi-score tables the title's HI, and finished games are
   * recorded into it. Omitted or `null`: a memory-only store with the defaults. Ignored for bare
   * gameplay.
   */
  readonly save?: SaveStore | null;
  /**
   * The keyboard / remote input profiles the Options screen offers and the one in use (the host
   * applies a change it reads from the `UserOption` events). Omitted or `null`: CONTROLS is
   * disabled. Ignored for bare gameplay.
   */
  readonly inputProfiles?: InputProfileSetup | null;
  /**
   * What the sound test offers besides the SFX cues (M2-15): the host's music titles (it plays a
   * track when it reads a `SoundTest` event). Omitted or `null`: the sound test has no MUSIC row.
   * Ignored for bare gameplay.
   */
  readonly soundTest?: SoundTestSetup | null;
  /**
   * The rebinding side of the host's input (M2-16 — the Options screen's REBIND KEYS / PAD): its
   * devices, key names, key capture and rebinding. Omitted or `null`: those rows are disabled.
   * Ignored for bare gameplay.
   */
  readonly controls?: ControlsSetup | null;
  /**
   * The saved replays (M3-01 — `core/replay` `ReplayLibrary`, loaded by the host): finished runs
   * are stored there, the EXTRA menu's REPLAYS browses them. Omitted or `null`: nothing is stored.
   * Ignored for bare gameplay.
   */
  readonly replays?: ReplayLibrary | null;
  /**
   * Hands a replay's text to the player (M3-01 — the replay browser's SHARE; the web host copies
   * it to the clipboard). Omitted or `null`: no SHARE. Ignored for bare gameplay.
   */
  readonly shareReplay?: ((text: string) => boolean) | null;
  /** The build id the scene flow's replays record (`__SHMUP_BUILD__`; default `'dev'` — M3-01). */
  readonly buildId?: string;
}

/**
 * Creates a game session on the given platform.
 *
 * @remarks
 * Registers suspend/resume callbacks on `platform.lifecycle` (they cannot be removed,
 * so create one game per platform). Nothing runs until the host calls
 * {@link Game.frame} (or {@link Game.step} directly in tests).
 *
 * @param platform - Host platform adapter.
 * @param overrides - Config fields to change from the defaults (the difficulty preset's fields
 *   come from `content.difficulty` — the `rules` table — or the built-in table, under these).
 * @param content - Validated content database (`loadContent(...).db`). Defaults to
 *   {@link EMPTY_CONTENT_DB}, which lets tests and the calibration scenes run with no
 *   `content/` at all; systems then fall back to their built-in defaults.
 * @param options - The scene flow's first scene (default: bare gameplay), its save and the input
 *   profiles its Options screen offers.
 * @returns The {@link Game}.
 * @throws RangeError when `overrides` fail validation (see `resolveGameConfig`) or
 *   `overrides.stage` names a stage `content` does not have (see `createWorld`).
 *
 * @example
 * ```ts
 * const { db } = loadContent(contentFiles);
 * const game = createGame(createHeadlessPlatform(), { seed: 1 }, db);
 * for (let i = 0; i < 60; i++) game.step(); // one simulated second
 * game.state.tick; // → 60
 * game.world.players[0].state; // → 'alive' (the fly-in took 40 ticks)
 *
 * // The scene flow (what the apps run):
 * const flowGame = createGame(createHeadlessPlatform(), {}, db, { scenes: 'title' });
 * flowGame.scenes?.stack.top?.id; // → 'title'
 * ```
 */
export function createGame(
  platform: Platform,
  overrides: Partial<GameConfig> = {},
  content: ContentDb = EMPTY_CONTENT_DB,
  options: GameOptions = {},
): Game {
  // The difficulty preset's fields come from the content's `rules` table when it has one.
  const config = resolveGameConfig(overrides, content.difficulty ?? DEFAULT_DIFFICULTY_TABLE);
  const state: GameState = { tick: 0, paused: false, suspended: false, input: null };
  const isFrozen = (): boolean => state.paused || state.suspended;
  const events = createEventQueue();
  const debug = createDebugFlags();
  const start = options.scenes ?? null;
  // Bare gameplay: one World for the whole session. The scene flow creates its own (per game).
  const bareWorld =
    start === null ? createWorld(config, content, { events, debugFlags: debug }) : null;
  const flow =
    start === null
      ? null
      : createSceneFlow(
          {
            config,
            content,
            events,
            exit: platform.exit,
            createWorld: (worldConfig) =>
              createWorld(worldConfig ?? config, content, { events, debugFlags: debug }),
            save: options.save ?? null,
            inputProfiles: options.inputProfiles ?? null,
            soundTest: options.soundTest ?? null,
            controls: options.controls ?? null,
            replays: options.replays ?? null,
            shareReplay: options.shareReplay ?? null,
            buildId: options.buildId ?? 'dev',
          },
          start,
        );
  const screen = { shakeX: 0, shakeY: 0, flash: 0, dim: 0 };
  const emptyList = createDrawList(1, 1);
  const frameView: {
    tick: number;
    alpha: number;
    world: WorldView | null;
    hud: DrawList;
    ui: DrawList;
    screen: ScreenView;
  } = {
    tick: 0,
    alpha: 0,
    world: bareWorld === null ? null : bareWorld.view,
    hud: bareWorld === null ? emptyList : createDrawList(),
    ui: bareWorld === null ? emptyList : createDrawList(),
    screen,
  };

  /** One simulation tick; the systems (or the top scene) run here in the fixed tick order. */
  const step = (): void => {
    if (isFrozen()) return;
    const input = platform.input.poll();
    state.input = input;
    if (bareWorld !== null) stepWorld(bareWorld, input);
    else if (flow !== null) flow.tick(input);
    state.tick++;
  };

  const loop = createFixedStepLoop({
    tickRate: config.tickRate,
    maxTicksPerFrame: config.maxTicksPerFrame,
    onTick: step,
  });

  // Debug timing (frame advance, slow motion). The slowed clock's fractional times live in a
  // typed array (closure `let`s holding fractions would be boxed on every assignment).
  const slowClock = new Float64Array(2);
  const RAW = 0;
  const SLOW = 1;
  const timing = { mode: 1, slowStarted: false, pendingSteps: 0, vsyncLock: false };
  /** {@link timing}`.mode` while frame advance is on (otherwise the slow-motion factor). */
  const FRAME_ADVANCE_MODE = 0;
  /**
   * {@link timing}`.mode` of the game-speed assist (M3-01): this plus the speed in percent (75, 50),
   * so every speed is its own mode (a change resets the loop like a slow-motion switch).
   */
  const SPEED_MODE_BASE = 1000;

  /**
   * Runs the due ticks of one frame under the debug timing switches.
   *
   * @param nowMs - Frame timestamp.
   * @returns Ticks run.
   */
  const debugFrame = (nowMs: number): number => {
    // The game-speed assist (M3-01) slows the clock like slow motion, by its percentage.
    const speed = flow !== null ? flow.speedPercent : 100;
    const mode = debug.frameAdvance
      ? FRAME_ADVANCE_MODE
      : debug.slowMo > 1
        ? debug.slowMo
        : speed < 100
          ? SPEED_MODE_BASE + speed
          : 1;
    if (mode !== timing.mode) {
      // A switch: forget the accumulated time, so the new mode starts without a burst.
      timing.mode = mode;
      timing.slowStarted = false;
      // The vsync lock ties ticks to frames; a slowed clock needs the free-running accumulator.
      loop.setVsyncLock(timing.vsyncLock && mode === 1);
      loop.reset();
    }
    if (mode === FRAME_ADVANCE_MODE) {
      let ran = 0;
      while (timing.pendingSteps > 0) {
        timing.pendingSteps--;
        step();
        ran++;
      }
      return ran;
    }
    timing.pendingSteps = 0;
    if (mode === 1) return loop.advance(nowMs);
    if (!timing.slowStarted) {
      timing.slowStarted = true;
      slowClock[RAW] = nowMs;
      slowClock[SLOW] = nowMs;
    } else {
      const delta = nowMs - slowClock[RAW];
      slowClock[RAW] = nowMs;
      if (delta > 0) {
        slowClock[SLOW] +=
          mode > SPEED_MODE_BASE ? (delta * (mode - SPEED_MODE_BASE)) / 100 : delta / mode;
      }
    }
    // Whole milliseconds (the loop snaps ±1 ms): a fractional argument would be boxed per frame.
    return loop.advance(Math.floor(slowClock[SLOW]));
  };

  /**
   * {@link Game.frame} of bare gameplay: the fixed step, unless a debug timing switch is on.
   *
   * @param nowMs - Frame timestamp.
   * @returns Ticks run.
   */
  function bareFrame(nowMs: number): number {
    if (isFrozen()) return 0;
    if (timing.mode === 1 && !debug.frameAdvance && debug.slowMo === 1) {
      return loop.advance(nowMs);
    }
    return debugFrame(nowMs);
  }

  /**
   * {@link Game.frame} of the scene flow: also slowed by the game-speed assist (M3-01 —
   * `SceneFlow.speedPercent`).
   *
   * @param nowMs - Frame timestamp.
   * @returns Ticks run.
   */
  function flowFrame(nowMs: number): number {
    if (isFrozen()) return 0;
    if (
      timing.mode === 1 &&
      !debug.frameAdvance &&
      debug.slowMo === 1 &&
      (flow as SceneFlow).speedPercent >= 100
    ) {
      return loop.advance(nowMs);
    }
    return debugFrame(nowMs);
  }

  const game: Game = {
    config,
    content,
    platform,
    events,
    get world(): World {
      return bareWorld !== null ? bareWorld : (flow as SceneFlow).world;
    },
    scenes: flow,
    state,
    debug,
    get inputContext(): InputContext {
      return flow === null ? 'game' : flow.inputContext;
    },
    get inputSeats(): number {
      if (flow !== null) return flow.inputSeats;
      return bareWorld !== null && bareWorld.config.coop ? 2 : 1;
    },
    step,
    // Bare gameplay keeps the M1-19 frame (small enough for V8 to inline — a fractional `nowMs`
    // passed to a call it does not inline is boxed); the scene flow's checks the game-speed assist.
    frame: flow === null ? bareFrame : flowFrame,
    requestStep(count = 1) {
      if (debug.frameAdvance && Number.isInteger(count) && count > 0) timing.pendingSteps += count;
    },
    renderFrame() {
      frameView.tick = state.tick;
      frameView.alpha = isFrozen() ? 0 : loop.alpha;
      if (flow !== null) {
        flow.updateFrame();
        const view = flow.view;
        frameView.tick = view.tick;
        frameView.world = view.world;
        frameView.hud = view.hud;
        frameView.ui = view.ui;
        screen.dim = view.dim;
      }
      return frameView;
    },
    pause() {
      state.paused = true;
    },
    resume() {
      state.paused = false;
      loop.reset();
    },
    setVsyncLock(on: boolean): void {
      timing.vsyncLock = on;
      loop.setVsyncLock(on && timing.mode === 1);
    },
    get vsyncLock(): boolean {
      return timing.vsyncLock;
    },
  };

  platform.lifecycle.onSuspend(() => {
    state.suspended = true;
  });
  platform.lifecycle.onResume(() => {
    state.suspended = false;
    loop.reset();
    // Back from the TV's home screen into a running game: its pause menu (shmup_feat.md §23).
    if (flow !== null) flow.onResume();
  });
  return game;
}
