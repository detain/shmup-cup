/**
 * # game — top-level game object (composition root of the core)
 *
 * **Responsibility.** {@link createGame} wires a {@link Platform} to the fixed-step
 * loop and owns the per-session state. Each tick it polls input and advances the
 * simulation. Today the simulation is empty (it only counts ticks); later steps plug
 * the scene stack, stage runner and game systems into {@link Game.step} in the fixed
 * order `input → player move → stage events/spawns → scripts → movement → collision →
 * damage → deferred removal → emit events` (shmup_feat.md §22).
 *
 * Lifecycle: `platform.lifecycle.onSuspend` freezes the game (`state.suspended`);
 * `onResume` unfreezes it and resets the loop accumulator so no burst of catch-up
 * ticks runs (shmup_feat.md §3, Tizen certification). A user pause
 * (`state.paused`, via {@link Game.pause}) survives suspend/resume.
 *
 * **Implements.** shmup_tech.md §3.2 (core consumes `Platform`), shmup_feat.md §22
 * (tick order), §3 (pause on visibility change).
 *
 * **Public API.** {@link createGame}, {@link Game}, {@link GameState}.
 *
 * @module
 */
import { resolveGameConfig, type GameConfig } from '../config/index.js';
import type { InputSnapshot } from '../input/index.js';
import { createFixedStepLoop } from '../loop/index.js';
import { defineModule } from '../module-info.js';
import type { Platform } from '../platform/index.js';
import type { RenderFrame } from '../presentation/index.js';

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
  readonly config: GameConfig;
  readonly platform: Platform;
  /** Current state. Do not mutate from outside the core. */
  readonly state: Readonly<GameState>;
  /** Runs exactly one simulation tick (no-op while paused). */
  step(): void;
  /**
   * Host frame callback: runs the due fixed ticks for this timestamp.
   *
   * @param nowMs - Monotonic timestamp in ms (rAF argument).
   * @returns Number of ticks run.
   */
  frame(nowMs: number): number;
  /** The frame description to hand to an `IRenderer`. Reused object — do not keep it. */
  renderFrame(): RenderFrame;
  /** Pauses the simulation. */
  pause(): void;
  /** Resumes the simulation and resets the loop accumulator. */
  resume(): void;
}

/**
 * Creates a game session on the given platform.
 *
 * @param platform - Host platform adapter.
 * @param overrides - Config fields to change from the defaults.
 * @returns The {@link Game}.
 */
export function createGame(platform: Platform, overrides: Partial<GameConfig> = {}): Game {
  const config = resolveGameConfig(overrides);
  const state: GameState = { tick: 0, paused: false, suspended: false, input: null };
  const isFrozen = (): boolean => state.paused || state.suspended;
  const frameView = { tick: 0, alpha: 0 };

  const step = (): void => {
    if (isFrozen()) return;
    state.input = platform.input.poll();
    // Game systems run here in the fixed tick order (filled in by later steps).
    state.tick++;
  };

  const loop = createFixedStepLoop({
    tickRate: config.tickRate,
    maxTicksPerFrame: config.maxTicksPerFrame,
    onTick: step,
  });

  const game: Game = {
    config,
    platform,
    state,
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
