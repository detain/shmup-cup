/**
 * # game — top-level game object (composition root of the core)
 *
 * **Responsibility.** {@link createGame} wires a {@link Platform} to the fixed-step
 * loop and owns the per-session state. Each tick it polls input once and advances the
 * gameplay {@link World} with `stepWorld` — the fixed tick pipeline `input → players → stage →
 * scripts → movement → collision → damage → removal → fx` (plan §3.2, shmup_feat.md §22). The
 * scene stack of M1-16 will decide when a World exists; until then every session hosts one World
 * from the start: free flight with the KESTREL, or the stage `config.stage` names (M1-07 — the
 * web app's `?stage=<id>`).
 *
 * Lifecycle: `platform.lifecycle.onSuspend` freezes the game (`state.suspended`);
 * `onResume` unfreezes it and resets the loop accumulator so no burst of catch-up
 * ticks runs (shmup_feat.md §3, Tizen certification). A user pause
 * (`state.paused`, via {@link Game.pause}) survives suspend/resume.
 *
 * **Implements.** shmup_tech.md §3.2 (core consumes `Platform`), shmup_feat.md §22
 * (tick order), §3 (pause on visibility change).
 *
 * **Public API.** {@link createGame}, {@link Game}, {@link GameState}. A session carries the
 * validated {@link ContentDb} it was created with (`game.content`), so systems read tunables
 * from data instead of constants, its gameplay {@link World} (`game.world`), the
 * {@link EventQueue} its systems push presentation events into (`game.events` — the World's
 * queue, drained by the host once per frame) and builds the reused {@link RenderFrame} of the
 * render contract (`game.renderFrame()`: `world` is the World's view; the HUD and UI draw lists
 * are empty until the scenes of M1-16).
 * `game.inputContext` names the binding context (`'game'` / `'menu'`, decision D15) the host's
 * input adapter should use — `'game'` until the scene stack of M1-16 decides.
 *
 * @module
 */
import { resolveGameConfig, type GameConfig } from '../config/index.js';
import { EMPTY_CONTENT_DB, type ContentDb } from '../data/index.js';
import type { EventQueue } from '../events/index.js';
import type { InputContext, InputSnapshot } from '../input/index.js';
import { createFixedStepLoop } from '../loop/index.js';
import { defineModule } from '../module-info.js';
import type { Platform } from '../platform/index.js';
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
  specRefs: ['shmup_tech.md §3.2', 'shmup_feat.md §3', 'shmup_feat.md §22'],
});

/** Mutable per-session state (read-only to presentation code). */
export interface GameState {
  /** Simulation ticks executed so far. */
  tick: number;
  /** `true` while the player paused the game; `step()` does nothing. */
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
   * queue as `world.events`. The host drains it once per displayed frame
   * (`game.events.drain(dispatch)`); a headless run may ignore it (the ring drops the oldest
   * events when full).
   */
  readonly events: EventQueue;
  /**
   * The gameplay session: players, camera, RNG streams, pools and the view the renderer draws.
   * Read-only to hosts (debug overlays, tests); only {@link Game.step} advances it.
   */
  readonly world: World;
  /** Current state. Do not mutate from outside the core. */
  readonly state: Readonly<GameState>;
  /**
   * The binding table the host's input adapter should use right now (decision D15): the top
   * scene decides — `'menu'` for menus and the pause screen, `'game'` while playing.
   *
   * @remarks
   * Always `'game'` until the scene stack arrives (M1-16). The host reads it once per frame and
   * forwards a change to its adapter (`@shmup/shell` calls `input.setContext`); reading it never
   * allocates.
   */
  readonly inputContext: InputContext;
  /**
   * Runs exactly one simulation tick: polls `platform.input` once, then advances the
   * {@link Game.world} by one tick (`stepWorld`). No-op (and no poll) while paused or suspended.
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
   *   frozen so a paused picture does not wobble. `world` is the World's view
   *   (`game.world.view`, the same object every frame); `hud` / `ui` are the session's draw
   *   lists; `screen` carries no effects yet.
   */
  renderFrame(): RenderFrame;
  /** Pauses the simulation (user pause; survives platform suspend/resume). */
  pause(): void;
  /**
   * Clears the user pause and resets the loop accumulator (so no catch-up burst runs).
   * Does not override a platform suspend.
   */
  resume(): void;
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
 * ```
 */
export function createGame(
  platform: Platform,
  overrides: Partial<GameConfig> = {},
  content: ContentDb = EMPTY_CONTENT_DB,
): Game {
  const config = resolveGameConfig(overrides);
  const state: GameState = { tick: 0, paused: false, suspended: false, input: null };
  const isFrozen = (): boolean => state.paused || state.suspended;
  const world = createWorld(config, content);
  const events = world.events;
  const screen: ScreenView = { shakeX: 0, shakeY: 0, flash: 0, dim: 0 };
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
    world: world.view,
    hud: createDrawList(),
    ui: createDrawList(),
    screen,
  };

  /** One simulation tick; the systems run here in the fixed tick order. */
  const step = (): void => {
    if (isFrozen()) return;
    const input = platform.input.poll();
    state.input = input;
    stepWorld(world, input);
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
    world,
    state,
    get inputContext(): InputContext {
      // The scene stack (M1-16) picks the context of its top scene; until then only gameplay.
      return 'game';
    },
    step,
    frame(nowMs) {
      if (isFrozen()) return 0;
      return loop.advance(nowMs);
    },
    renderFrame() {
      frameView.tick = state.tick;
      frameView.alpha = isFrozen() ? 0 : loop.alpha;
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
  });
  return game;
}
