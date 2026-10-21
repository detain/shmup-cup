/**
 * The shipped content files a core test loads from disk (R5-P.P4): one place for the
 * `content/patterns/*.patterns.json` sweep, so a test loads **every** shipped patterns file
 * and never names a split one. {@link shippedPatterns} reads the folder the way the content
 * plugin does — `example.*` excluded, sorted by path (`vite.shared.ts`) — so the pattern bank
 * a test compiles is the bank the game compiles.
 *
 * The helper lives under `packages/core/test/helpers/` and imports core **by relative path**
 * (the way `v1-port.ts` does): a core test must not load a second `@shmup/core` instance
 * through the package name.
 *
 * @module
 */
import { readdirSync, readFileSync } from 'node:fs';
import type { ContentFile } from '../../src/data/index.js';

/** The shipped `content/` root, below the repository. */
const CONTENT_ROOT = new URL('../../../../content/', import.meta.url);

/**
 * Reads a shipped content file.
 *
 * @param path - Path below `content/`.
 * @returns The file.
 */
function readShipped(path: string): ContentFile {
  return {
    path,
    data: JSON.parse(readFileSync(new URL(path, CONTENT_ROOT), 'utf8')) as unknown,
  };
}

/**
 * Every shipped patterns file (R5-P.P4: the shared zone-pattern file split into one per zone).
 *
 * @returns The files below `patterns/` that are not `example.*`, sorted by path like the
 *   content plugin loads them, so the compiled bank keeps the game's action order.
 */
export function shippedPatterns(): ContentFile[] {
  return readdirSync(new URL('patterns/', CONTENT_ROOT))
    .filter((name) => name.endsWith('.patterns.json') && name.indexOf('example.') !== 0)
    .map((name) => 'patterns/' + name)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .map(readShipped);
}
