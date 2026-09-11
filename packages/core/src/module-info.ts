/**
 * Module descriptors used while the project skeleton is being filled in.
 *
 * Every planned module directory (`src/<module>/index.ts`) in every workspace
 * package exports a `moduleInfo` constant of this shape. Smoke tests import it
 * to prove the module is wired up and imports cleanly; docs can list the
 * implementation status. Once a module is fully implemented its `status`
 * becomes `'implemented'` (the descriptor may stay — it costs nothing).
 *
 * @module
 */

/** Implementation state of a module. */
export type ModuleStatus = 'placeholder' | 'partial' | 'implemented';

/** Static description of one source module. */
export interface ModuleInfo {
  /** Directory name of the module, e.g. `'rng'`. */
  readonly name: string;
  /** How much of the module's planned API exists today. */
  readonly status: ModuleStatus;
  /**
   * Spec sections the module implements, e.g. `'shmup_feat.md §22 Determinism'`.
   * Keeps code and design docs cross-referenced.
   */
  readonly specRefs: readonly string[];
}

/**
 * Declares a module descriptor (identity function that keeps literal types and
 * freezes the object so tests can rely on it).
 *
 * @param info - The module description.
 * @returns The same description, frozen.
 */
export function defineModule(info: ModuleInfo): ModuleInfo {
  return Object.freeze({ ...info, specRefs: Object.freeze(info.specRefs.slice()) });
}
