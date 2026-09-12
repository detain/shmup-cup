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
 *   resume while playing opens the pause menu.
 *
 * Every World of a session pushes into the same {@link EventQueue} ({@link Game.events}), so the
 * host drains one queue.
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
 * once per frame), its scene flow (`game.scenes`, `null` for bare gameplay) and builds the reused
 * {@link RenderFrame} of the render contract (`game.renderFrame()`).
 * `game.inputContext` names the binding context (`'game'` / `'menu'`, decision D15) the host's
 * input adapter should use.
 *
 * @module
 */
import { resolveGameConfig, type GameConfig } from '../config/index.js';
import { EMPTY_CONTENT_DB, type ContentDb } from '../data/index.js';
import type { InputContext, InputSnapshot } from '../input/index.js';
import { createEventQueue, type EventQueue } from '../events/index.js';
import { createFixedStepLoop } from '../loop/index.js';
import { defineModule } from '../module-info.js';
import type { Platform } from '../platform/index.js';
import {
  createSceneFlow,
  type InputProfileSetup,
  type SceneFlow,
  type SceneStart,
} from '../scenes/index.js';
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
  /** The resolved, frozen configuration of this session. */
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
   *   `config.maxTicksPerFrame`).
   */
  frame(nowMs: number): number;
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
 * @param overrides - Config fields to change from the defaults.
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
  const config = resolveGameConfig(overrides);
  const state: GameState = { tick: 0, paused: false, suspended: false, input: null };
  const isFrozen = (): boolean => state.paused || state.suspended;
  const events = createEventQueue();
  const start = options.scenes ?? null;
  // Bare gameplay: one World for the whole session. The scene flow creates its own (per game).
  const bareWorld = start === null ? createWorld(config, content, { events }) : null;
  const flow =
    start === null
      ? null
      : createSceneFlow(
          {
            config,
            content,
            events,
            exit: platform.exit,
            createWorld: () => createWorld(config, content, { events }),
            save: options.save ?? null,
            inputProfiles: options.inputProfiles ?? null,
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
    get inputContext(): InputContext {
      return flow === null ? 'game' : flow.inputContext;
    },
    step,
    frame(nowMs) {
      if (isFrozen()) return 0;
      return loop.advance(nowMs);
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
