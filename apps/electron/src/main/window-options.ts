/**
 * # main/window-options — BrowserWindow configuration
 *
 * **Responsibility.** Builds the game window options: secure renderer (context
 * isolation, sandbox, no Node integration), `backgroundThrottling: false` so the
 * fixed-step loop keeps a steady cadence, dark background to avoid a white flash, and
 * optional fullscreen (`SHMUP_FULLSCREEN=1`; Steam Deck / TV-like use). Since M2-17 the
 * window's **content** is sized (`useContentSize`) to the remembered scale of the game's frame
 * (`window-state.ts` `FRAME_WIDTH` × `FRAME_HEIGHT`) at the remembered position, and audio needs no gesture
 * (`autoplayPolicy: 'no-user-gesture-required'` — the web build unlocks it at boot on Electron).
 * VSync stays Chromium's default; the web build's shell interpolates the render on 120 / 144 Hz
 * monitors (M2-08 — the 60 Hz fixed step with an accumulator).
 *
 * **Implements.** shmup_tech.md §4.8 (Electron: `backgroundThrottling:false`),
 * shmup_feat.md §23 Electron-specific (fullscreen BrowserWindow).
 *
 * @module
 */
import type { BrowserWindowConstructorOptions } from 'electron';
import { DEFAULT_WINDOW_SCALE, FRAME_HEIGHT, FRAME_WIDTH } from './window-state.js';

/** Options for {@link createWindowOptions}. */
export interface WindowSettings {
  /** Absolute path of the compiled preload script (`preload.cjs`). */
  readonly preloadPath: string;
  /** Start in fullscreen. */
  readonly fullscreen: boolean;
  /**
   * Content = the frame × this (default `DEFAULT_WINDOW_SCALE` — `window-state.ts`
   * `fitWindowScale` picks it).
   */
  readonly scale?: number;
  /** Left edge, or `null` / absent to centre. */
  readonly x?: number | null;
  /** Top edge, or `null` / absent to centre. */
  readonly y?: number | null;
}

/**
 * Creates the `BrowserWindow` options for the game window.
 *
 * @remarks
 * Content the frame × `DEFAULT_WINDOW_SCALE` by default (1152×648 = 384×216 ×3) — ×`scale`
 * otherwise — with `useContentSize`, minimum one frame, centred unless a position is given, hidden
 * until ready, menu bar auto-hidden.
 * `webPreferences`: `contextIsolation`, `sandbox`, no `nodeIntegration`,
 * `backgroundThrottling: false`, no spellcheck, `autoplayPolicy: 'no-user-gesture-required'`.
 *
 * @param settings - Preload path, fullscreen flag and (M2-17) the remembered scale and position.
 * @returns Constructor options.
 *
 * @example
 * ```ts
 * new BrowserWindow(createWindowOptions({ preloadPath, fullscreen: false }));
 * // M2-17: the remembered window — content 1536×864 (×4) at (300, 200)
 * new BrowserWindow(
 *   createWindowOptions({ preloadPath, fullscreen: false, scale: 4, x: 300, y: 200 }),
 * );
 * ```
 */
export function createWindowOptions(settings: WindowSettings): BrowserWindowConstructorOptions {
  // The default scale (×3 at 384×216) — a crisp integer scale on most desktop monitors.
  const scale = settings.scale ?? DEFAULT_WINDOW_SCALE;
  const placed =
    settings.x !== undefined &&
    settings.x !== null &&
    settings.y !== undefined &&
    settings.y !== null;
  return {
    width: FRAME_WIDTH * scale,
    height: FRAME_HEIGHT * scale,
    useContentSize: true,
    ...(placed ? { x: settings.x ?? 0, y: settings.y ?? 0 } : { center: true }),
    minWidth: FRAME_WIDTH,
    minHeight: FRAME_HEIGHT,
    fullscreen: settings.fullscreen,
    backgroundColor: '#05070f',
    autoHideMenuBar: true,
    show: false,
    title: 'Shmup Cup',
    webPreferences: {
      preload: settings.preloadPath,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      spellcheck: false,
      autoplayPolicy: 'no-user-gesture-required',
    },
  };
}
