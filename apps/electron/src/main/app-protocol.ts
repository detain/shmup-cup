/**
 * # main/app-protocol — serving the web build over `app://game/`
 *
 * **Responsibility.** The renderer loads `app://game/index.html` instead of `file://`
 * (module scripts and `fetch` of game data do not work reliably from `file://`). This
 * module maps such URLs to files inside the bundled renderer directory and refuses
 * anything that would escape it (path traversal).
 *
 * **Implements.** shmup_feat.md §23 Electron-specific (desktop wrapper loading the web
 * build), shmup_tech.md §4.8.
 *
 * @module
 */
import { isAbsolute, join, normalize, relative, sep } from 'node:path';

/** Privileged custom scheme registered by the main process. */
export const APP_SCHEME = 'app';

/** Host part of every renderer URL. */
export const APP_HOST = 'game';

/** URL of the renderer entry page. */
export const APP_ENTRY_URL = `${APP_SCHEME}://${APP_HOST}/index.html`;

/**
 * Resolves an `app://game/<path>` URL to a file path inside `rootDir`.
 *
 * @param rootDir - Absolute directory holding the web build.
 * @param requestUrl - The requested URL.
 * @returns The absolute file path, or `null` for foreign hosts/schemes or paths that
 *   escape `rootDir`.
 */
export function resolveAppFile(rootDir: string, requestUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(requestUrl);
  } catch (_error) {
    return null;
  }
  if (url.protocol !== `${APP_SCHEME}:` || url.host !== APP_HOST) return null;

  let pathname: string;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch (_error) {
    return null;
  }
  // NUL bytes and backslashes (a separator on Windows) never appear in our asset paths.
  if (pathname.includes('\0') || pathname.includes('\\')) return null;
  if (pathname === '' || pathname.endsWith('/')) pathname += 'index.html';

  const root = normalize(rootDir);
  const file = normalize(join(root, pathname));
  const rel = relative(root, file);
  if (rel === '' || isAbsolute(rel) || rel.split(sep)[0] === '..') {
    return null;
  }
  return file;
}
