/**
 * # main/window-options — BrowserWindow configuration
 *
 * **Responsibility.** Builds the game window options: secure renderer (context
 * isolation, sandbox, no Node integration), `backgroundThrottling: false` so the
 * fixed-step loop keeps a steady cadence, dark background to avoid a white flash, and
 * optional fullscreen (`SHMUP_FULLSCREEN=1`; Steam Deck / TV-like use).
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
}

/**
 * Creates the `BrowserWindow` options for the game window.
 *
 * @param settings - Preload path and fullscreen flag.
 * @returns Constructor options.
 */
export function createWindowOptions(settings: WindowSettings): BrowserWindowConstructorOptions {
  return {
    // 384×216 × 3 — a crisp integer scale on most desktop monitors.
    width: 1152,
    height: 648,
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
    },
  };
}
