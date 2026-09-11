/**
 * Settings shared by every Vite (apps) and Vitest (all projects) config, plus the repo's
 * own Vite plugins.
 *
 * {@link shmupContent} turns `content/` into the virtual module `virtual:shmup-content`
 * so the Tizen bundle can ship game data inside its single classic script (decision D25).
 *
 * @module
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { isAbsolute, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultClientConditions, defaultServerConditions, type Plugin } from 'vite';

/**
 * Custom package.json `exports` condition that points workspace packages at their
 * TypeScript sources (`src/index.ts`) instead of the built `dist/`. Keeps dev servers,
 * app builds and tests working without building packages first; `tsc` builds of the
 * packages disable it (`customConditions: []`) and use `dist/` types instead.
 */
export const SOURCE_CONDITION = '@shmup/source';

/** Browser-side resolve conditions with workspace sources first. */
export const clientConditions: string[] = [SOURCE_CONDITION, ...defaultClientConditions];

/** Node/SSR-side resolve conditions with workspace sources first. */
export const serverConditions: string[] = [SOURCE_CONDITION, ...defaultServerConditions];

/**
 * Module id the {@link shmupContent} plugin serves; `types/virtual-modules.d.ts` declares it.
 */
export const CONTENT_MODULE_ID = 'virtual:shmup-content';

/** Rollup's convention for a virtual module's resolved id. */
const RESOLVED_CONTENT_MODULE_ID = '\0' + CONTENT_MODULE_ID;

/** Default content root: the repo's `content/` directory (this file sits next to it). */
const DEFAULT_CONTENT_ROOT = fileURLToPath(new URL('./content', import.meta.url));

/** One content file as it reaches `loadContent()` from `@shmup/core`. */
export interface ContentFileRecord {
  /** Path relative to the content root, POSIX separators (e.g. `player/kestrel.player.json`). */
  readonly path: string;
  /** The parsed JSON document. */
  readonly data: unknown;
}

/** Options of {@link shmupContent} and {@link readContentFiles}. */
export interface ShmupContentOptions {
  /** Content root; defaults to the repo's `content/` directory. */
  readonly root?: string;
}

/**
 * Files that are format samples for the docs and tests, not shipped game data.
 *
 * @param name - File name (no directory part).
 * @returns `true` for `example.*.json`.
 */
const isExample = (name: string): boolean => name.indexOf('example.') === 0;

/**
 * Whether `file` lies below the directory `root` (a sibling such as `content-old/` does not,
 * although its path starts with the same characters).
 *
 * @param root - Absolute directory path.
 * @param file - Absolute file path.
 * @returns `true` when `file` is inside `root`.
 */
const isInside = (root: string, file: string): boolean => {
  const rel = relative(root, file);
  return rel !== '' && rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel);
};

/**
 * Reads every shipped content JSON file under `root`.
 *
 * @remarks
 * `example.*.json` files are skipped (they are format samples, validated separately by
 * `pnpm content:check`). The result is sorted by path, so builds and the generated virtual
 * module are byte-identical across machines.
 *
 * @param root - Content root directory; defaults to the repo's `content/`.
 * @returns The files, sorted by their content-root-relative path.
 * @throws SyntaxError when a file is not valid JSON (the path is prepended to the message).
 *
 * @example
 * ```ts
 * const files = readContentFiles(); // → [{ path: 'enemies/…', data: {…} }, …]
 * ```
 */
export function readContentFiles(root: string = DEFAULT_CONTENT_ROOT): ContentFileRecord[] {
  const files: ContentFileRecord[] = [];
  /**
   * Recurses into one directory.
   *
   * @param dir - Absolute directory path.
   * @param prefix - Its path relative to the content root (`''` at the top).
   */
  const walk = (dir: string, prefix: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const relative = prefix === '' ? entry.name : prefix + '/' + entry.name;
      if (entry.isDirectory()) {
        walk(join(dir, entry.name), relative);
      } else if (entry.name.endsWith('.json') && !isExample(entry.name)) {
        const source = readFileSync(join(dir, entry.name), 'utf8');
        try {
          files.push({ path: relative, data: JSON.parse(source) });
        } catch (error) {
          throw new SyntaxError(`${relative}: ${(error as Error).message}`, { cause: error });
        }
      }
    }
  };
  if (existsSync(root)) walk(root, '');
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return files;
}

/**
 * Vite plugin that inlines `content/` into the bundle as `virtual:shmup-content`
 * (decision D25: Tizen widgets run from `file://`, where `fetch()` fails — content must
 * be part of the script).
 *
 * @remarks
 * The generated module is `export default [{ path, data }, …]`, sorted by path, with
 * `example.*.json` excluded. In `vite dev` the content root is watched and any change
 * triggers a full reload (content is read once at boot, so HMR cannot patch it).
 *
 * @param options - Content root override.
 * @returns The Vite plugin.
 *
 * @example
 * ```ts
 * // apps/web/vite.config.ts
 * export default defineConfig({ plugins: [shmupContent()] });
 * ```
 */
export function shmupContent(options: ShmupContentOptions = {}): Plugin {
  const root = options.root ?? DEFAULT_CONTENT_ROOT;
  return {
    name: 'shmup:content',
    resolveId(id) {
      return id === CONTENT_MODULE_ID ? RESOLVED_CONTENT_MODULE_ID : null;
    },
    load(id) {
      if (id !== RESOLVED_CONTENT_MODULE_ID) return null;
      return `export default ${JSON.stringify(readContentFiles(root), null, 2)};\n`;
    },
    configureServer(server) {
      server.watcher.add(root);
      /**
       * Invalidates the virtual module and reloads the page after a content edit.
       *
       * @param file - Absolute path of the changed file.
       */
      const onChange = (file: string): void => {
        if (!isInside(root, file) || !file.endsWith('.json')) return;
        const module = server.moduleGraph.getModuleById(RESOLVED_CONTENT_MODULE_ID);
        if (module !== undefined) server.moduleGraph.invalidateModule(module);
        server.ws.send({ type: 'full-reload' });
      };
      server.watcher.on('add', onChange);
      server.watcher.on('change', onChange);
      server.watcher.on('unlink', onChange);
    },
  };
}
