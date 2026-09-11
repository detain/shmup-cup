/**
 * # data — content schemas and loaders (enemies, weapons, stages JSON)
 *
 * **Status: placeholder.** Declares the intended public API only; no game logic yet.
 *
 * **Responsibility.** Data-driven content. Declares the TypeScript shape of every file under `content/`
 * (`content/enemies/*.json`, `content/weapons/*.json`, `content/stages/*.json`),
 * validates them at load time (library TBD — must stay tiny in the Tizen bundle, e.g.
 * hand-written validators or TypeBox) and resolves string ids to numeric indices once,
 * so the per-tick path only touches numbers. Attack patterns live in TS code and are
 * referenced from data by id; tunables live in data.
 *
 * **Implements.**
 * - shmup_feat.md §14 — stage data format (JSON validated with a schema)
 * - shmup_feat.md §22 — data-driven content (`enemies.json`, `weapons.json`, `stages/*.json`)
 * - shmup_feat.md §7C / §11 — weapons and enemies defined in data
 *
 * **Intended public API.** The declarations below (and the `Planned` notes at the
 * end of the file) are the contract later steps implement.
 *
 * @module
 */
import { defineModule } from '../module-info.js';

/** Module descriptor (see {@link defineModule}). */
export const moduleInfo = defineModule({
  name: 'data',
  status: 'placeholder',
  specRefs: ['shmup_feat.md §14', 'shmup_feat.md §22', 'shmup_feat.md §7', 'shmup_feat.md §11'],
});

/** Kinds of content files. */
export type ContentKind = 'enemies' | 'weapons' | 'stage';

/** Common header of every content JSON file. */
export interface ContentFileHeader {
  /** Bumped on breaking format changes; loaders migrate or reject. */
  readonly formatVersion: number;
  /** Which schema the file follows. */
  readonly kind: ContentKind;
}

/** A validation problem found while loading content. */
export interface ValidationIssue {
  /** JSON path, e.g. `enemies[3].hp`. */
  readonly path: string;
  /** Human-readable description, e.g. `must be a positive integer`. */
  readonly message: string;
}

// Planned: EnemyFile / WeaponFile / StageFile types (built from EnemySpec, WeaponSpec, StageEvent),
//          validateContent(json: unknown): ValidationIssue[], buildContentIndex(files).
