/**
 * Ambient declarations for the virtual modules the repo's Vite plugins generate
 * (see `vite.shared.ts`). Apps include this file from their `tsconfig.json`.
 *
 * @module
 */

/**
 * Every shipped file under `content/`, inlined into the bundle at build time by the
 * `shmupContent()` plugin — sorted by path, with `example.*.json` excluded.
 *
 * @remarks
 * Inlining is decision D25: Tizen widgets run from `file://`, where `fetch()` fails on
 * Chromium 69, so game data has to be part of the script. Hand the array to
 * `loadContent()` from `@shmup/core`.
 *
 * @example
 * ```ts
 * import contentFiles from 'virtual:shmup-content';
 * import { loadContent } from '@shmup/core';
 *
 * const { db, issues } = loadContent(contentFiles);
 * ```
 */
declare module 'virtual:shmup-content' {
  /** One content JSON document. */
  interface VirtualContentFile {
    /** Path relative to `content/`, POSIX separators (e.g. `player/kestrel.player.json`). */
    readonly path: string;
    /** The parsed JSON document; validate it with `loadContent()`. */
    readonly data: unknown;
  }
  /** The content files, sorted by path. */
  const files: readonly VirtualContentFile[];
  export default files;
}
