/**
 * # main/steam — optional Steamworks integration
 *
 * **Status: placeholder.** Declares the intended public API only; no logic yet.
 *
 * **Responsibility.** [P2] Achievements, Steam Cloud saves and overlay support via
 * steamworks-ffi-node (no native compile; active as of 2026-09), loaded only when the
 * game is launched through Steam. Steam Deck: the Deck's controls appear as a standard
 * Xbox pad to the Gamepad API, so no Steam Input code is needed for play.
 *
 * **Implements.**
 * - shmup_feat.md §23 Electron-specific — [P2] Steamworks, Steam Deck verified
 * - shmup_tech.md §4.8 — steamworks-ffi-node recommendation
 *
 * @module
 */

/** Minimal Steam service surface the game would use. */
export interface SteamService {
  /** `false` when the game was not launched through Steam (every call is a no-op). */
  readonly available: boolean;
  /**
   * Unlocks an achievement (idempotent).
   *
   * @param id - Achievement API name from the Steamworks partner site.
   */
  unlockAchievement(id: string): void;
}

// Planned: initSteam(appId: number): SteamService (returns { available: false } outside Steam).
