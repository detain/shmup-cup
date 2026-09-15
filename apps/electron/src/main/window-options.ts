/**
 * # main/window-options — BrowserWindow configuration
 *
 * **Responsibility.** Builds the game window options: secure renderer (context
 * isolation, sandbox, no Node integration), `backgroundThrottling: false` so the
 * fixed-step loop keeps a steady cadence, dark background to avoid a white flash, and
 * optional fullscreen (`SHMUP_FULLSCREEN=1`; Steam Deck / TV-like use). Since M2-17 the
 * window's **content** is sized (`useContentSize`) to the remembered scale of the 384×216 frame
 * (`window-state.ts`) at the remembered position, and audio needs no gesture
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

/** Options for {@link createWindowOptions}. */
export interface WindowSettings {
  /** Absolute path of the compiled preload script (`preload.cjs`). */
  readonly preloadPath: string;
  /** Start in fullscreen. */
  readonly fullscreen: boolean;
  /** Content = 384×216 × this (default 3 — `window-state.ts` `fitWindowScale` picks it). */
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
 * Content 1152×648 (384×216 ×3) by default — ×`scale` otherwise — with `useContentSize`, minimum
 * 384×216, centred unless a position is given, hidden until ready, menu bar auto-hidden.
 * `webPreferences`: `contextIsolation`, `sandbox`, no `nodeIntegration`,
 * `backgroundThrottling: false`, no spellcheck, `autoplayPolicy: 'no-user-gesture-required'`.
 *
 * @param settings - Preload path and fullscreen flag.
 * @returns Constructor options.
 *
 * @example
 * ```ts
 * new BrowserWindow(createWindowOptions({ preloadPath, fullscreen: false }));
 * ```
 */
export function createWindowOptions(settings: WindowSettings): BrowserWindowConstructorOptions {
  // 384×216 × 3 by default — a crisp integer scale on most desktop monitors.
  const scale = settings.scale ?? 3;
  const placed =
    settings.x !== undefined &&
    settings.x !== null &&
    settings.y !== undefined &&
    settings.y !== null;
  return {
    width: 384 * scale,
    height: 216 * scale,
    useContentSize: true,
    ...(placed ? { x: settings.x ?? 0, y: settings.y ?? 0 } : { center: true }),
    minWidth: 384,
    minHeight: 216,
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
