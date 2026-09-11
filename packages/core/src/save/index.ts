/**
 * # save — persistent saves (hi-scores, options, unlocks)
 *
 * **Status: placeholder.** Declares the intended public API only; no game logic yet.
 *
 * **Responsibility.** Persistence through `Platform.storage`: hi-scores, options and unlocks stored as
 * versioned JSON with forward migrations and defensive parsing (corrupt or unknown data
 * falls back to defaults — never crash on boot). Storage is async so Electron can use
 * files and Tizen/web localStorage or IndexedDB; Tizen deletes user data on uninstall.
 *
 * **Implements.**
 * - shmup_feat.md §21 Saves
 * - shmup_feat.md §23 — storage abstraction (`storage.get/set`)
 *
 * **Intended public API.** The declarations below (and the `Planned` notes at the
 * end of the file) are the contract later steps implement.
 *
 * @module
 */
import { defineModule } from '../module-info.js';

/** Module descriptor (see {@link defineModule}). */
export const moduleInfo = defineModule({
  name: 'save',
  status: 'placeholder',
  specRefs: ['shmup_feat.md §21', 'shmup_feat.md §23'],
});

/** Root of the persisted save document. */
export interface SaveData {
  readonly version: number;
  readonly hiScores: readonly unknown[];
  readonly options: Readonly<Record<string, unknown>>;
  readonly unlocks: readonly string[];
}

/** One migration step between save versions. */
export interface SaveMigration {
  readonly from: number;
  readonly to: number;
  migrate(data: unknown): unknown;
}

// Planned: loadSave(storage: PlatformStorage): Promise<SaveData>, writeSave(storage, data),
//          SAVE_MIGRATIONS.
