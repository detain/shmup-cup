/**
 * # debug — the dev-build debug tools of the browser hosts
 *
 * **Responsibility.** Wires the core's debug controls (`createDebugControls` — god mode, stage skip
 * to the boss, jump to the next checkpoint, frame advance / step, slow motion, the outlines and the
 * overlay) and the renderer's debug overlay (`@shmup/render-pixi` `createDebugOverlay`) into the
 * shell's frame loop, and binds keys to them (plan M1-19, shmup_feat.md §24):
 *
 * - **web dev builds:** F1–F8 at once ({@link DEBUG_KEYS}: F1 overlay, F2 god mode, F3 outlines
 *   — hitboxes → + grid → off, F4 frame advance, F5 step one tick, F6 slow motion 1 → 2 → 4, F7
 *   next checkpoint, F8 skip to the boss);
 * - **Tizen dev builds:** nothing until the remote enters **Pause, Ch+, Ch+, Ch+**
 *   ({@link DEBUG_UNLOCK_SEQUENCE}, within 3 s); that unlocks the tools and shows the overlay, the
 *   app's `onUnlock` registers the number keys, and from then on **1–8** (the remote's number pad)
 *   work like F1–F8 (so do F1–F8 of a USB / Bluetooth keyboard). The sequence again toggles the
 *   overlay. Pause opens the game's pause menu, where Ch+ does nothing — the sequence never
 *   changes the game.
 *
 * Each frame the tools measure the shell's work with the host clock — the time spent in the
 * frame's ticks (`game.frame`) and in `renderer.render` (smoothed), the frame time (graph and FPS)
 * — read the renderer's draw calls and particle pool, collect the sim counters
 * (`collectDebugCounters`: pools, rank, RNG calls, a state hash every 60 ticks) and rebuild the
 * overlay before the frame is rendered. They also publish **`window.__shmupDebug`**
 * ({@link ShmupDebugApi}: the scene id, ticks, switches, counters, a command runner, the game) for
 * tests and the TV's remote inspector — the e2e smoke reads `sceneId` from it.
 *
 * **Dev / test builds only.** The apps pass {@link debugToolsFactory}'s result to `bootShell` only
 * when the `__SHMUP_DEV__` Vite define is true (the dev server, `build:test`, `build:dev`); in a
 * release build the expression folds to `null` and this module, the overlay and the controls are
 * left out of the bundle.
 *
 * **Implements.**
 * - shmup_feat.md §24 — debug overlay, god mode, stage skip, jump to checkpoint, frame advance,
 *   slow-mo (key bindings and the per-frame measurements)
 * - shmup_feat.md §23 — Tizen: remote-only access to dev features
 *
 * **Public API.** {@link debugToolsFactory}, {@link createDebugTools}, {@link DebugTools},
 * {@link DebugToolsFactory}, {@link DebugToolsHost}, {@link DebugToolsOptions},
 * {@link ShmupDebugApi}, {@link DEBUG_KEYS}, {@link DebugKey}, {@link DEBUG_UNLOCK_SEQUENCE},
 * {@link DEBUG_UNLOCK_WINDOW_MS}, {@link DEBUG_GLOBAL}.
 *
 * @module
 */
import {
  DebugCommand,
  collectDebugCounters,
  createDebugControls,
  createDebugCounters,
  defineModule,
  type DebugControls,
  type DebugCounters,
  type DebugFlags,
  type Game,
  type World,
} from '@shmup/core';
import {
  createDebugOverlay,
  type DebugOverlay,
  type DebugOverlayStats,
  type PixiRenderer,
} from '@shmup/render-pixi';

/** Module descriptor. */
export const moduleInfo = defineModule({
  name: 'debug',
  status: 'implemented',
  specRefs: ['shmup_feat.md §24', 'shmup_feat.md §23'],
});

/** One debug key binding. */
export interface DebugKey {
  /** `KeyboardEvent.code` of the function key (`'F1'` …). */
  readonly code: string;
  /** Legacy key code of the function key (112 …). */
  readonly keyCode: number;
  /** Key code of the remote's number key used once the TV tools are unlocked (49 = `1` …). */
  readonly digitKeyCode: number;
  /** The command. */
  readonly command: DebugCommand;
}

/** The debug key bindings: F1–F8, and 1–8 on the TV once unlocked. */
export const DEBUG_KEYS: readonly DebugKey[] = Object.freeze([
  { code: 'F1', keyCode: 112, digitKeyCode: 49, command: DebugCommand.Overlay },
  { code: 'F2', keyCode: 113, digitKeyCode: 50, command: DebugCommand.GodMode },
  { code: 'F3', keyCode: 114, digitKeyCode: 51, command: DebugCommand.Outlines },
  { code: 'F4', keyCode: 115, digitKeyCode: 52, command: DebugCommand.FrameAdvance },
  { code: 'F5', keyCode: 116, digitKeyCode: 53, command: DebugCommand.Step },
  { code: 'F6', keyCode: 117, digitKeyCode: 54, command: DebugCommand.SlowMo },
  { code: 'F7', keyCode: 118, digitKeyCode: 55, command: DebugCommand.NextCheckpoint },
  { code: 'F8', keyCode: 119, digitKeyCode: 56, command: DebugCommand.SkipToBoss },
] as DebugKey[]);

/**
 * The TV unlock sequence, as the key codes each step accepts: Pause (the remote's Play/Pause
 * 10252, or a keyboard's Pause 19), then Ch+ (427) three times.
 */
export const DEBUG_UNLOCK_SEQUENCE: readonly (readonly number[])[] = Object.freeze([
  Object.freeze([10252, 19]),
  Object.freeze([427]),
  Object.freeze([427]),
  Object.freeze([427]),
]);

/** Time the whole unlock sequence must fit in, in ms. */
export const DEBUG_UNLOCK_WINDOW_MS = 3000;

/** Name of the window property the tools publish ({@link ShmupDebugApi}). */
export const DEBUG_GLOBAL = '__shmupDebug';

/** Options of {@link debugToolsFactory} / {@link createDebugTools}. */
export interface DebugToolsOptions {
  /**
   * `'keys'` (default — web): F1–F8 work at once. `'sequence'` (TV): nothing works until
   * {@link DEBUG_UNLOCK_SEQUENCE} was entered; then F1–F8 and the number keys 1–8.
   */
  readonly unlock?: 'keys' | 'sequence';
  /** Build id shown in the overlay and the API (the apps' `__SHMUP_BUILD__`; default `'dev'`). */
  readonly buildId?: string;
  /** Called once, when the TV sequence unlocks the tools (the Tizen app registers keys 1–8). */
  readonly onUnlock?: () => void;
}

/** What the shell gives the tools. */
export interface DebugToolsHost {
  /** The game session. */
  readonly game: Game;
  /** The renderer (overlay, draw calls, particles, WebGL version). */
  readonly renderer: PixiRenderer;
  /** The window: key listener and the published API. */
  readonly win: Window;
  /**
   * The clock the frame's work is timed with (`performance.now()`).
   *
   * @returns Milliseconds.
   */
  readonly now: () => number;
  /** Launch-to-ready time in ms (`Shell.bootTiming.readyMs`). */
  readonly bootMs: number;
  /**
   * The id of what is shown: the scene flow's top scene, or the dev scene's name.
   *
   * @returns The id (`'title'`, `'game'`, `'flight'` …).
   */
  readonly sceneId: () => string;
  /**
   * The World on screen, or `null` when none is (menus, the showcase …).
   *
   * @returns The World whose outlines to draw.
   */
  readonly visibleWorld: () => World | null;
}

/**
 * What `window.__shmupDebug` holds (dev / test builds).
 *
 * @remarks
 * A live object: the getters read the game at the moment they are called, `flags` is the game's
 * own switches (writing `flags.frameAdvance = true` freezes the sim — the e2e helper `freezeSim`
 * does), and `counters` / `stats` are refreshed every frame. Absent from release builds.
 *
 * @example
 * ```js
 * // Chrome DevTools console (browser, or the TV's remote inspector):
 * __shmupDebug.sceneId;            // → 'game'
 * __shmupDebug.run(9);             // DebugCommand.SkipToBoss → true while a stage is played
 * __shmupDebug.game.requestStep(60); // under frame advance: one second of ticks
 * ```
 */
export interface ShmupDebugApi {
  /** What is shown: the scene flow's top scene id (`'title'`, `'game'` …) or the dev scene. */
  readonly sceneId: string;
  /** Ticks the game ran (`game.state.tick`). */
  readonly tick: number;
  /** The current World's tick. */
  readonly worldTick: number;
  /** The debug switches (`game.debug`). */
  readonly flags: DebugFlags;
  /** The sim counters of the last frame. */
  readonly counters: DebugCounters;
  /** The host-measured numbers of the last frame. */
  readonly stats: DebugOverlayStats;
  /** Whether the keys work (always on the web; after the sequence on the TV). */
  readonly unlocked: boolean;
  /** The build id. */
  readonly buildId: string;
  /** The game session. */
  readonly game: Game;
  /**
   * Runs a debug command (`DebugCommand` code), unlocked or not.
   *
   * @param command - The command.
   * @returns Whether it changed something.
   */
  run(command: DebugCommand): boolean;
}

/** The running debug tools (see {@link createDebugTools}). */
export interface DebugTools {
  /** The core controls. */
  readonly controls: DebugControls;
  /** The overlay on the renderer's `DEBUG` layer. */
  readonly overlay: DebugOverlay;
  /** The sim counters, refreshed every frame. */
  readonly counters: DebugCounters;
  /** The published API (also `window.__shmupDebug`). */
  readonly api: ShmupDebugApi;
  /** Whether the keys work. */
  readonly unlocked: boolean;
  /**
   * Handles one key press (the tools' own `keydown` listener calls it).
   *
   * @param keyCode - Legacy key code.
   * @param code - `KeyboardEvent.code` (`''` when unknown).
   * @param repeat - An auto-repeat (only Step repeats; toggles ignore repeats).
   * @returns Whether a debug command ran (the event's default is then prevented).
   */
  handleKey(keyCode: number, code: string, repeat: boolean): boolean;
  /**
   * Start of a displayed frame, before its ticks.
   *
   * @param frameNow - The rAF timestamp (frame time and FPS).
   */
  beginFrame(frameNow: number): void;
  /** The frame's ticks ran (`game.frame` returned): measures the tick time. */
  endTicks(): void;
  /** Rebuilds the overlay (counters, stats, outlines, panel) just before `renderer.render`. */
  beforeRender(): void;
  /** `renderer.render` returned: measures the render time. */
  afterRender(): void;
  /** Removes the key listener, the overlay and `window.__shmupDebug` (idempotent). */
  destroy(): void;
}

/** A factory the apps hand to `bootShell` (`ShellOptions.debugTools`). */
export type DebugToolsFactory = (host: DebugToolsHost) => DebugTools;

/**
 * The factory the apps pass to `bootShell` in dev / test builds.
 *
 * @param options - Unlock mode, build id, unlock callback.
 * @returns The factory.
 *
 * @example
 * ```ts
 * bootShell({
 *   …,
 *   debugTools: __SHMUP_DEV__ ? debugToolsFactory({ buildId: __SHMUP_BUILD__ }) : null,
 * });
 * ```
 */
export function debugToolsFactory(options: DebugToolsOptions = {}): DebugToolsFactory {
  return (host) => createDebugTools(host, options);
}

/**
 * Options of the key listener (capture phase: the debug keys are seen before the input adapter).
 * One shared object for `addEventListener` and `removeEventListener`: some `EventTarget`
 * implementations (Node's) only match a capture listener's removal by the same options object.
 */
const KEY_OPTIONS: AddEventListenerOptions = Object.freeze({ capture: true });

/** Weight of the newest sample in the smoothed timings. */
const SMOOTHING = 0.1;

/** Slots of the timing scratch array (fractional values stay unboxed there). */
const T = {
  lastFrame: 0,
  frameMs: 1,
  ticksStart: 2,
  renderStart: 3,
  tickMs: 4,
  renderMs: 5,
  sequenceStart: 6,
} as const;

/**
 * Creates the debug tools: the controls, the overlay (with the renderer's draw-call counter when
 * the shell enabled it), the key listener and `window.__shmupDebug`.
 *
 * @remarks
 * Load time (dev / test builds). The frame hooks write numbers only (timings in a `Float64Array`),
 * but the host clock (`performance.now()`) returns a fresh number each call, so a dev frame is not
 * strictly allocation-free — release builds carry none of this.
 *
 * @param host - The shell's game, renderer, window, clock, boot time and scene / World accessors.
 * @param options - Unlock mode, build id, unlock callback.
 * @returns The tools (keys already listening).
 *
 * @example
 * ```ts
 * const tools = createDebugTools(host, { unlock: 'sequence', onUnlock: registerNumberKeys });
 * tools.handleKey(10252, '', false); // Pause …
 * ```
 */
export function createDebugTools(
  host: DebugToolsHost,
  options: DebugToolsOptions = {},
): DebugTools {
  const { game, renderer, win } = host;
  const buildId = options.buildId ?? 'dev';
  const sequenceMode = options.unlock === 'sequence';
  const controls = createDebugControls(game);
  const overlay = createDebugOverlay(renderer, { buildId });
  const counters = createDebugCounters();
  const stats = overlay.stats;
  stats.webGLVersion = renderer.webGLVersion;
  stats.bootMs = host.bootMs;
  const times = new Float64Array(7);
  const state = { unlocked: !sequenceMode, progress: 0, destroyed: false };

  /**
   * Feeds the TV unlock sequence one key.
   *
   * @param keyCode - The key.
   * @returns `true` when this key completed the sequence.
   */
  const feedSequence = (keyCode: number): boolean => {
    const now = host.now();
    if (state.progress > 0 && now - times[T.sequenceStart] > DEBUG_UNLOCK_WINDOW_MS) {
      state.progress = 0;
    }
    if (DEBUG_UNLOCK_SEQUENCE[state.progress].indexOf(keyCode) >= 0) {
      if (state.progress === 0) times[T.sequenceStart] = now;
      state.progress++;
    } else {
      state.progress = DEBUG_UNLOCK_SEQUENCE[0].indexOf(keyCode) >= 0 ? 1 : 0;
      if (state.progress === 1) times[T.sequenceStart] = now;
    }
    if (state.progress < DEBUG_UNLOCK_SEQUENCE.length) return false;
    state.progress = 0;
    return true;
  };

  /**
   * See {@link DebugTools.handleKey}.
   *
   * @param keyCode - Legacy key code.
   * @param code - `KeyboardEvent.code`.
   * @param repeat - Auto-repeat.
   * @returns Whether a command ran.
   */
  const handleKey = (keyCode: number, code: string, repeat: boolean): boolean => {
    if (sequenceMode && !repeat && feedSequence(keyCode)) {
      if (!state.unlocked) {
        state.unlocked = true;
        game.debug.overlay = true;
        options.onUnlock?.();
      } else {
        controls.run(DebugCommand.Overlay);
      }
      return false; // the keys still reach the game (Pause opened its pause menu)
    }
    if (!state.unlocked) return false;
    for (let i = 0; i < DEBUG_KEYS.length; i++) {
      const key = DEBUG_KEYS[i];
      const fn = code === key.code || keyCode === key.keyCode;
      const digit = sequenceMode && keyCode === key.digitKeyCode;
      if (!fn && !digit) continue;
      if (repeat && key.command !== DebugCommand.Step) return true;
      controls.run(key.command);
      return true;
    }
    return false;
  };

  /**
   * The window's key listener (capture phase): runs a debug command and prevents the key's
   * default (F5 would reload the page).
   *
   * @param event - The key event.
   */
  const onKeyDown = (event: KeyboardEvent): void => {
    if (handleKey(event.keyCode, event.code ?? '', event.repeat === true)) event.preventDefault();
  };
  win.addEventListener('keydown', onKeyDown, KEY_OPTIONS);

  const api: ShmupDebugApi = {
    get sceneId() {
      return host.sceneId();
    },
    get tick() {
      return game.state.tick;
    },
    get worldTick() {
      return game.world.tick;
    },
    flags: game.debug,
    counters,
    stats,
    get unlocked() {
      return state.unlocked;
    },
    buildId,
    game,
    run(command) {
      return controls.run(command);
    },
  };
  (win as unknown as Record<string, unknown>)[DEBUG_GLOBAL] = api;

  return {
    controls,
    overlay,
    counters,
    api,
    get unlocked() {
      return state.unlocked;
    },
    handleKey,
    beginFrame(frameNow) {
      const last = times[T.lastFrame];
      times[T.lastFrame] = frameNow;
      if (last > 0 && frameNow > last) {
        const delta = frameNow - last;
        overlay.graph.push(delta);
        times[T.frameMs] =
          times[T.frameMs] > 0 ? times[T.frameMs] + (delta - times[T.frameMs]) * SMOOTHING : delta;
        stats.fps = 1000 / times[T.frameMs];
      }
      times[T.ticksStart] = host.now();
    },
    endTicks() {
      const ms = host.now() - times[T.ticksStart];
      times[T.tickMs] += (ms - times[T.tickMs]) * SMOOTHING;
      stats.tickMs = times[T.tickMs];
    },
    beforeRender() {
      const world = host.visibleWorld();
      if (world !== null) collectDebugCounters(world, counters);
      stats.drawCalls = renderer.drawCalls;
      const particles = renderer.particles;
      stats.particles = particles === null ? 0 : particles.liveCount;
      stats.particleCapacity = particles === null ? 0 : particles.capacity;
      overlay.update(world, game.debug, world === null ? null : counters);
      times[T.renderStart] = host.now();
    },
    afterRender() {
      const ms = host.now() - times[T.renderStart];
      times[T.renderMs] += (ms - times[T.renderMs]) * SMOOTHING;
      stats.renderMs = times[T.renderMs];
    },
    destroy() {
      if (state.destroyed) return;
      state.destroyed = true;
      win.removeEventListener('keydown', onKeyDown, KEY_OPTIONS);
      overlay.destroy();
      const globals = win as unknown as Record<string, unknown>;
      if (globals[DEBUG_GLOBAL] === api) delete globals[DEBUG_GLOBAL];
    },
  };
}
