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
 * — read the renderer's draw calls, its M3-02c structure-rebuild count and the pooled
 * render-target total (`createRenderTargetMeter`, stopped on `destroy`) and its particle pool,
 * collect the sim counters
 * (`collectDebugCounters`: pools, rank, RNG calls, a state hash every 60 ticks) and rebuild the
 * overlay before the frame is rendered. They also publish **`window.__shmupDebug`**
 * ({@link ShmupDebugApi}: the scene id, ticks, switches, counters, a command runner, the game) for
 * tests and the TV's remote inspector — the e2e smoke reads `sceneId` from it.
 *
 * **Guided render-profile capture (M3-02f).** A build given a log-server URL
 * ({@link DebugToolsOptions.reportUrl}, the apps' `__SHMUP_REPORT_URL__` from `VITE_REPORT_URL`)
 * also streams its render profile: the frame hooks hand the raw frame, tick and render times, the
 * draw calls, the structure rebuilds and the pooled render-target total to the `telemetry` module's
 * sampler as typed-array writes, and a 3-second timer closes each window into a distribution
 * (min / median / p95 / max plus the TPF and rAF buckets) with the context of
 * {@link readRenderContext} and POSTs it. Without such a URL — every release build, and every dev
 * build that was not pointed at a server — nothing of it runs.
 *
 * The capture is deliberately **not gated on the overlay being visible**: `beforeRender` reads
 * `renderer.structureRebuilds` and `afterRender` calls `telemetry.commitFrame()` on every frame,
 * and the checklist is a DOM `<div>` rather than a Pixi container. That matters for the one figure
 * the overlay cannot report about itself — since plan M3-02e the `DEBUG` layer is the only busy
 * layer that is *not* its own render group, so the panel's own text quads dirty the scene's group
 * whenever a printed number changes width, at a rate that depends on the machine's load rather than
 * on the renderer (measured at 6 % of frames idle and 49 % loaded). The owner therefore hides the
 * panel (key **1**) and reads `REB` from the capture, which keeps recording it.
 *
 * **Save export / import and the device line (M2-17).** `window.__shmupDebug.save` exports the save
 * the game plays with as readable JSON, imports one (parsed like a stored save and written — reload
 * to apply its options) and reports the storage's usage ({@link DebugSaveApi}); the TV app hands
 * {@link DebugToolsOptions.device} its model / firmware line, shown under the overlay's panel.
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
 * {@link DEBUG_UNLOCK_WINDOW_MS}, {@link DEBUG_GLOBAL}; M2-17: {@link DebugSaveApi}; M3-02f: the
 * `telemetry` module, reached as {@link DebugTools.telemetry}.
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
  type PlatformStorage,
  type SaveStore,
  type World,
} from '@shmup/core';
import {
  createDebugOverlay,
  createRenderTargetMeter,
  rafDeltaBucket,
  type DebugOverlay,
  type DebugOverlayStats,
  type PixiRenderer,
} from '@shmup/render-pixi';
import {
  exportSaveText,
  importSaveText,
  type QuotaStorage,
  type SaveImportResult,
  type StorageUsage,
} from '../storage/index.js';
import {
  RENDER_FRAME_SLOT,
  createRenderTelemetry,
  type RenderSampleContext,
  type RenderTelemetry,
  type RenderTelemetryEnv,
} from '../telemetry/index.js';

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
  /**
   * The overlay's device line (M2-17 — the Tizen app's model, firmware and display from
   * `device-info`), read every frame: return the same string until it changes (no allocation);
   * `''` shows no line. Default: none.
   *
   * @returns The line.
   */
  readonly device?: () => string;
  /**
   * Base URL of the render-telemetry log server (plan M3-02f — the apps' `__SHMUP_REPORT_URL__`,
   * baked in from `VITE_REPORT_URL`). Anything that is not an `http(s)://` URL — `''` in every
   * build that was not pointed at a log server, and in every release build — leaves the guided
   * capture switched off, and then nothing of it runs at all.
   */
  readonly reportUrl?: string;
}

/** The save export / import of {@link ShmupDebugApi.save} (M2-17). */
export interface DebugSaveApi {
  /**
   * The save the game plays with, as readable JSON (`storage` module `exportSaveText`).
   *
   * @returns The text.
   */
  export(): string;
  /**
   * Imports a save text (`storage` module `importSaveText`: parsed like a stored save, then
   * written); reload to apply its options.
   *
   * @param text - A save document.
   * @returns Resolves with what happened.
   */
  import(text: string): Promise<SaveImportResult>;
  /**
   * What the app's storage keys take, when the platform's storage can tell (`createWebStorage`
   * can), else `null`.
   *
   * @returns The usage.
   */
  usage(): StorageUsage | null;
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
  /** The save store (M2-17 — the save export / import), or `null` / absent without one. */
  readonly save?: SaveStore | null;
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
   * The renderer (M2-08: its display options, layer effects and draw calls, for the browser tests
   * and the DevTools console).
   */
  readonly renderer: PixiRenderer;
  /**
   * The save export / import (M2-17 — a tester's save out of the TV for a bug report, or a save
   * into it to reproduce one), or `null` without a save store.
   */
  readonly save: DebugSaveApi | null;
  /**
   * The M3-02f render-profile capture — the session id, the guided checklist and the sender's
   * status, for the remote inspector (`__shmupDebug.telemetry.checklist.doneCount`).
   */
  readonly telemetry: RenderTelemetry;
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
  /**
   * The M3-02f guided render-profile capture. `telemetry.enabled` is `false` — and every one of its
   * hooks a no-op — unless the build was given a {@link DebugToolsOptions.reportUrl}.
   */
  readonly telemetry: RenderTelemetry;
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
  /**
   * The frame's ticks ran (`game.frame` returned): measures the tick time and counts the frame in
   * the ticks-per-frame histogram (M3-02b).
   *
   * @param ticks - Ticks the frame ran (`game.frame`'s return value; default 1 when unknown).
   */
  endTicks(ticks?: number): void;
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
 * Reads the context of a render-telemetry window (plan M3-02f): where the window was taken, what
 * the renderer was set to and which assists were on. Called once per sampling window (every ~3 s),
 * never per frame, so it may read strings and build an object.
 *
 * @param host - The shell's game, renderer and scene / World accessors.
 * @param counters - The sim counters of the last frame.
 * @param stats - The host-measured numbers of the last frame.
 * @returns A fresh context object (each window keeps its own).
 */
function readRenderContext(
  host: DebugToolsHost,
  counters: DebugCounters,
  stats: DebugOverlayStats,
): RenderSampleContext {
  const { game, renderer } = host;
  const world = host.visibleWorld();
  const stage = world === null ? null : (world.stage?.stage.id ?? null);
  const run = game.scenes === null ? null : game.scenes.run;
  const zoneSpec =
    run === null || run.campaign === null || run.zone < 0
      ? null
      : (run.campaign.zones[run.zone] ?? null);
  const viewport = renderer.viewport;
  const assists: string[] = [];
  if (game.debug.godMode) assists.push('god');
  if (game.debug.showHitboxes) assists.push('hitboxes');
  if (game.debug.showGrid) assists.push('grid');
  if (game.debug.frameAdvance) assists.push('frameAdvance');
  if (game.debug.slowMo > 1) assists.push('slowMo' + String(game.debug.slowMo));
  if (game.config.invincible) assists.push('invincible');
  if (game.config.optionRecovery) assists.push('optionRecovery');
  if (game.config.slowdown) assists.push('slowdown');
  const speed = host.save?.options.play.speed ?? 100;
  if (speed !== 100) assists.push('speed' + String(speed));
  return {
    scene: host.sceneId(),
    stage,
    zone: zoneSpec === null ? null : zoneSpec.label,
    zoneName: zoneSpec === null ? null : zoneSpec.name,
    checkpoint: world === null ? -1 : (world.stage?.checkpoint ?? -1),
    cameraX: world === null ? 0 : Math.round(world.camera.x),
    cameraY: world === null ? 0 : Math.round(world.camera.y),
    crtFilter: renderer.crtFilter,
    screenPass: renderer.screenPass,
    aspect: renderer.aspect,
    scaleMode: renderer.scaleMode,
    scale: viewport.scale,
    viewportWidth: viewport.width,
    viewportHeight: viewport.height,
    webGLVersion: renderer.webGLVersion,
    bullets: counters.enemyBullets,
    enemies: counters.enemies,
    particles: stats.particles,
    rank: counters.rank,
    vsyncLock: game.vsyncLock,
    assists,
  };
}

/**
 * The save part of the debug API (M2-17).
 *
 * @param save - The save store, or `null`.
 * @param game - The game (its platform's storage reports the usage when it can).
 * @returns The API, or `null` without a store.
 */
function createSaveApi(save: SaveStore | null, game: Game): DebugSaveApi | null {
  if (save === null) return null;
  return {
    export: () => exportSaveText(save),
    import: (text) => importSaveText(save, text),
    usage: () => {
      const storage = game.platform.storage as PlatformStorage & Partial<QuotaStorage>;
      return typeof storage.usage === 'function' ? storage.usage() : null;
    },
  };
}

/**
 * Options of the key listener (capture phase: the debug keys are seen before the input adapter).
 * One shared object for `addEventListener` and `removeEventListener`: some `EventTarget`
 * implementations (Node's) only match a capture listener's removal by the same options object.
 */
const KEY_OPTIONS: AddEventListenerOptions = Object.freeze({ capture: true });

/** Weight of the newest sample in the smoothed timings. */
const SMOOTHING = 0.1;

/**
 * Keys the tools track as held at once (M3-02b — the remote sends flagless auto-repeats, so a
 * `keydown` of a key that is already down must not count as a new press).
 */
const DEBUG_HELD_KEYS = 8;

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
  // M3-02c: the pooled render-target total the overlay's RT figure shows (the review's F2). One
  // hook on Pixi's `TexturePool`, so reading it every frame costs a property read.
  const renderTargets = createRenderTargetMeter();
  const stats = overlay.stats;
  stats.webGLVersion = renderer.webGLVersion;
  stats.bootMs = host.bootMs;
  const times = new Float64Array(7);
  const device = options.device ?? null;
  const state = { unlocked: !sequenceMode, progress: 0, destroyed: false };
  // M3-02f: the guided render-profile capture. It starts only in a build that was pointed at a log
  // server (`VITE_REPORT_URL` → `__SHMUP_REPORT_URL__` → `options.reportUrl`); without one
  // `createRenderTelemetry` returns a disabled object whose hooks do nothing.
  const telemetryEnv: RenderTelemetryEnv = {
    buildId,
    device: device === null ? '' : device(),
    userAgent: (win as Partial<Window>).navigator?.userAgent ?? '',
    innerWidth: win.innerWidth ?? 0,
    innerHeight: win.innerHeight ?? 0,
    devicePixelRatio: win.devicePixelRatio ?? 1,
    webGLVersion: renderer.webGLVersion,
    internalWidth: renderer.width,
    internalHeight: renderer.height,
    bootMs: host.bootMs,
    startedAt: Date.now(),
  };
  const telemetry: RenderTelemetry = createRenderTelemetry({
    reportUrl: options.reportUrl,
    win,
    now: host.now,
    env: telemetryEnv,
    // Re-read once per window: on Tizen `describeDevice()` resolves long after boot, so the line is
    // still `''` here and a monitor capture would be labelled `(browser)` in the §11 report.
    device: device ?? undefined,
    context: () => readRenderContext(host, counters, stats),
  });
  /** The sampler's per-frame inbox — written by the frame hooks, never allocated. */
  const sampled = telemetry.sampler.frame;

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
   * Key codes physically down right now (M3-02b): the Samsung remote's auto-repeats are plain
   * `keydown`s with `repeat === false` (`docs/dev/input-probe-results.md` finding 2), so the
   * unlock sequence and the toggles must track held keys themselves instead of trusting the flag.
   * `0` marks a free slot.
   */
  const heldKeys = new Int32Array(DEBUG_HELD_KEYS);
  /** `KeyboardEvent.code` of each tracked slot (TV remote keys have none). */
  const heldCodes: string[] = [];
  for (let i = 0; i < DEBUG_HELD_KEYS; i++) heldCodes.push('');
  /** 1 while the slot tracks a key that is down. */
  const heldUsed = new Uint8Array(DEBUG_HELD_KEYS);

  /**
   * Records a keydown and says whether it was a repeat of a key that is already down.
   *
   * @param keyCode - Legacy key code.
   * @param code - `KeyboardEvent.code` (`''` for most remote keys; a browser may report a key
   *   with `keyCode` 0, so both identify the key).
   * @returns `true` when the key was already held (an auto-repeat, flagged or not).
   */
  const holdKey = (keyCode: number, code: string): boolean => {
    let free = -1;
    for (let i = 0; i < DEBUG_HELD_KEYS; i++) {
      if (heldUsed[i] === 0) {
        if (free < 0) free = i;
        continue;
      }
      if (heldKeys[i] === keyCode && heldCodes[i] === code) return true;
    }
    if (free >= 0) {
      heldUsed[free] = 1;
      heldKeys[free] = keyCode;
      heldCodes[free] = code;
    }
    return false;
  };

  /**
   * Frees a released key.
   *
   * @param keyCode - Legacy key code.
   * @param code - `KeyboardEvent.code`.
   */
  const freeKey = (keyCode: number, code: string): void => {
    for (let i = 0; i < DEBUG_HELD_KEYS; i++) {
      if (heldUsed[i] !== 0 && heldKeys[i] === keyCode && heldCodes[i] === code) heldUsed[i] = 0;
    }
  };

  /**
   * The window's key listener (capture phase): runs a debug command and prevents the key's
   * default (F5 would reload the page).
   *
   * @param event - The key event.
   */
  const onKeyDown = (event: KeyboardEvent): void => {
    const code = event.code ?? '';
    const repeat = holdKey(event.keyCode, code) || event.repeat === true;
    if (handleKey(event.keyCode, code, repeat)) event.preventDefault();
  };
  /**
   * Frees a released key, so its next `keydown` counts as a fresh press again.
   *
   * @param event - The key event.
   */
  const onKeyUp = (event: KeyboardEvent): void => {
    freeKey(event.keyCode, event.code ?? '');
  };
  /** The window lost focus: its key-ups never arrive, so nothing may stay held. */
  const onBlur = (): void => {
    heldUsed.fill(0);
  };
  win.addEventListener('keydown', onKeyDown, KEY_OPTIONS);
  win.addEventListener('keyup', onKeyUp, KEY_OPTIONS);
  win.addEventListener('blur', onBlur);

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
    renderer: host.renderer,
    save: createSaveApi(host.save ?? null, game),
    telemetry,
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
        const bucket = rafDeltaBucket(delta);
        stats.rafHistogram[bucket]++;
        // M3-02f: the raw delta and its bucket go to the sampler as typed-array writes (a
        // fractional call argument would be boxed on every frame).
        sampled[RENDER_FRAME_SLOT.frameMs] = delta;
        sampled[RENDER_FRAME_SLOT.rafBucket] = bucket;
        times[T.frameMs] =
          times[T.frameMs] > 0 ? times[T.frameMs] + (delta - times[T.frameMs]) * SMOOTHING : delta;
        stats.fps = 1000 / times[T.frameMs];
      }
      times[T.ticksStart] = host.now();
    },
    endTicks(ticks = 1) {
      const ms = host.now() - times[T.ticksStart];
      times[T.tickMs] += (ms - times[T.tickMs]) * SMOOTHING;
      stats.tickMs = times[T.tickMs];
      // Ticks per frame (M3-02b): 0 / 1 / 2 / 3-or-more, the on-device check of the vsync lock.
      const slot = ticks < 0 ? 0 : ticks > 3 ? 3 : ticks | 0;
      stats.tickFrames[slot]++;
      sampled[RENDER_FRAME_SLOT.tickMs] = ms;
      sampled[RENDER_FRAME_SLOT.ticks] = slot;
    },
    beforeRender() {
      if (device !== null) overlay.setDevice(device());
      const world = host.visibleWorld();
      if (world !== null) collectDebugCounters(world, counters);
      stats.drawCalls = renderer.drawCalls;
      stats.vsyncLock = game.vsyncLock;
      // M3-02c: the two render-profile figures (the review's F1 and F2).
      stats.structureRebuilds = renderer.structureRebuilds;
      stats.renderTargetBytes = renderTargets.bytes;
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
      // M3-02f: the frame's raw figures. `commitFrame` closes it and notes whether a report POST
      // was outstanding while it ran, so the analyzer can drop a window the sender perturbed.
      sampled[RENDER_FRAME_SLOT.renderMs] = ms;
      sampled[RENDER_FRAME_SLOT.drawCalls] = stats.drawCalls;
      sampled[RENDER_FRAME_SLOT.rebuilds] = stats.structureRebuilds;
      sampled[RENDER_FRAME_SLOT.renderTargetBytes] = stats.renderTargetBytes;
      telemetry.commitFrame();
    },
    telemetry,
    destroy() {
      if (state.destroyed) return;
      state.destroyed = true;
      telemetry.destroy();
      win.removeEventListener('keydown', onKeyDown, KEY_OPTIONS);
      win.removeEventListener('keyup', onKeyUp, KEY_OPTIONS);
      win.removeEventListener('blur', onBlur);
      renderTargets.stop();
      overlay.destroy();
      const globals = win as unknown as Record<string, unknown>;
      if (globals[DEBUG_GLOBAL] === api) delete globals[DEBUG_GLOBAL];
    },
  };
}
