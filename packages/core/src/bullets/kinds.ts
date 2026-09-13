/**
 * The names of the built-in enemy bullet kinds (plan M1-09, M2-02), in a leaf file with no
 * imports: `core/bullets` builds its kind table from them and the pattern DSL compiler of
 * `core/patterns` (run by the content loader of `core/data`) resolves the `kind` names of
 * `content/patterns/` to their codes without importing the bullet system.
 *
 * @module
 */

/** Bullet shapes, in kind-code order (`kind = shape · 3 + colour`). */
export const BULLET_SHAPES = Object.freeze(['round', 'oval', 'needle'] as const);

/** Bullet colour families, in kind-code order (the readability palette, shmup_feat.md §12). */
export const BULLET_COLORS = Object.freeze(['pink', 'red', 'purple'] as const);

/**
 * Kind names by `BulletKind` code: `<shape>-<colour>` (`round-pink` = 0 … `needle-purple` = 8) —
 * the names `content/patterns/` bullets use.
 */
export const BULLET_KIND_NAMES: readonly string[] = Object.freeze(
  (function buildNames(): string[] {
    const names: string[] = [];
    for (const shape of BULLET_SHAPES) {
      for (const color of BULLET_COLORS) names.push(shape + '-' + color);
    }
    return names;
  })(),
);
