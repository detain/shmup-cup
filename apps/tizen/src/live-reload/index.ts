/**
 * # live-reload — dev-only reload-on-change for the TV
 *
 * **Status: placeholder.** Declares the intended public API only; no logic yet.
 *
 * **Responsibility.** Shortens the TV iteration loop (Samsung's HMR-over-WebSocket
 * approach cuts ~70 s → ~25 s): in development builds the installed app connects to a
 * WebSocket on the desktop, and reloads (or swaps content JSON and restarts the stage at
 * the current scroll X) when files change. Never included in release builds.
 *
 * **Implements.**
 * - shmup_feat.md §24 — [P1] live reload to real TV; live-reload of JSON data
 * - shmup_tech.md §2.6 — HMR-to-TV over WebSocket
 *
 * **Intended public API.** The declarations below are the contract later steps implement.
 *
 * @module
 */
import { defineModule } from '@shmup/core';

/** Module descriptor. */
export const moduleInfo = defineModule({
  name: 'live-reload',
  status: 'placeholder',
  specRefs: ['shmup_feat.md §24', 'shmup_tech.md §2.6'],
});

/** Connection settings baked into dev builds. */
export interface LiveReloadOptions {
  /** e.g. `ws://192.168.1.20:5175` (the desktop running the dev server). */
  readonly url: string;
  /** What to do on change. */
  readonly mode: 'reload' | 'hot-data';
}

// Planned: connectLiveReload(options, onChange): () => void (no-op in release builds).
