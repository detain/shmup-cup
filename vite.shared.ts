/**
 * Settings shared by every Vite (apps) and Vitest (all projects) config, plus the repo's
 * own Vite plugins.
 *
 * {@link shmupContent} turns `content/` into the virtual module `virtual:shmup-content`
 * so the Tizen bundle can ship game data inside its single classic script (decision D25).
 * {@link shmupAssets} runs the placeholder asset pipeline, inlines the atlas manifest as
 * `virtual:shmup-assets` and ships the atlas pages next to the bundle.
 *
 * **Public API.** Resolve conditions: {@link SOURCE_CONDITION}, {@link clientConditions},
 * {@link serverConditions}. Content: {@link shmupContent}, {@link readContentFiles},
 * {@link CONTENT_MODULE_ID}, {@link ContentFileRecord}, {@link ShmupContentOptions}.
 * Assets: {@link shmupAssets}, {@link ASSETS_MODULE_ID}, {@link ATLAS_URL_DIR},
 * {@link ShmupAssetsOptions}.
 *
 * @remarks
 * Node-only tooling (it reads the file system); it is never part of a shipped bundle, so
 * the Chromium 69 rules do not apply here. Guides: `docs/dev/content-data.md`,
 * `assets/README.md`.
 *
 * @module
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { isAbsolute, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultClientConditions, defaultServerConditions, normalizePath, type Plugin } from 'vite';
import {
  ATLAS_DIR,
  DEFAULT_OUT_DIR,
  DEFAULT_SOURCE_DIR,
  PIPELINE_DIR,
  REPO_ROOT,
  generateAssets,
  type GenerateResult,
} from './scripts/assets/pipeline.mjs';

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
    /**
     * Claims the virtual module id.
     *
     * @param id - The import specifier being resolved.
     * @returns The `\0`-prefixed resolved id for {@link CONTENT_MODULE_ID}, else `null`
     *   (let other plugins resolve it).
     */
    resolveId(id) {
      return id === CONTENT_MODULE_ID ? RESOLVED_CONTENT_MODULE_ID : null;
    },
    /**
     * Generates the virtual module's source.
     *
     * @param id - The resolved module id.
     * @returns `export default [...]` with every shipped content file, or `null` for any
     *   other module.
     * @throws SyntaxError when a content file is not valid JSON (see {@link readContentFiles});
     *   Vite reports it as a build / dev-server error.
     */
    load(id) {
      if (id !== RESOLVED_CONTENT_MODULE_ID) return null;
      return `export default ${JSON.stringify(readContentFiles(root), null, 2)};\n`;
    },
    /**
     * Dev server only: watches the content root and full-reloads the page on any `*.json`
     * add / change / delete inside it.
     *
     * @param server - The Vite dev server.
     */
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

/**
 * Module id the {@link shmupAssets} plugin serves; `types/virtual-modules.d.ts` declares it.
 */
export const ASSETS_MODULE_ID = 'virtual:shmup-assets';

/** Rollup's convention for a virtual module's resolved id. */
const RESOLVED_ASSETS_MODULE_ID = '\0' + ASSETS_MODULE_ID;

/**
 * Where atlas pages live relative to the page that loads the game (`dist/assets/atlas/`
 * in builds, served from `assets/generated/atlas/` by the dev server). Relative, so the
 * build works from `file://` (Tizen) and `app://` (Electron).
 */
export const ATLAS_URL_DIR = 'assets/atlas';

/** Options of {@link shmupAssets}. */
export interface ShmupAssetsOptions {
  /** Asset source root; defaults to the repo's `assets/source/`. */
  readonly sourceDir?: string;
  /** Pipeline output root; defaults to the repo's `assets/generated/`. */
  readonly outDir?: string;
}

/** Atlas file names the dev middleware may serve (no paths, no traversal). */
const ATLAS_FILE_PATTERN = /^[a-z0-9-]+\.(png|json)$/;

/**
 * Vite plugin for the placeholder asset pipeline (decisions D24, D25).
 *
 * @remarks
 * - **Every command:** on `buildStart` it runs `generateAssets()` (input-hash cached, so
 *   an unchanged tree costs one hash) — a fresh checkout builds without a prior
 *   `pnpm assets`.
 * - **`virtual:shmup-assets`:** `export const manifest = {…}` (the atlas manifest,
 *   **inlined** — no `fetch()` on the TV), `export const pageUrls = ['assets/atlas/main.png',
 *   …]` (relative, one per manifest page) and a default export `{ manifest, pageUrls }`.
 * - **Build:** every atlas page is emitted into `dist/assets/atlas/` with `emitFile`
 *   (fixed names, no hash — the manifest refers to them by name).
 * - **Dev server:** a middleware serves `<base>assets/atlas/*` from the output directory,
 *   and edits under the asset sources regenerate the atlas and full-reload the page.
 *   Invalid sources are reported in the terminal; the last good atlas stays in use.
 *   Edits under `scripts/assets/` are **not** regenerated in-process (the loaded pipeline
 *   code is the old code): Vite restarts the server for them (they are config
 *   dependencies of the app configs) and the restarted `buildStart` regenerates; when no
 *   restart is coming, a warning says to restart.
 *
 * @param options - Source/output directory overrides (tests).
 * @returns The Vite plugin.
 * @throws AssetSourceError (from the build hooks) when an asset source is invalid; Vite
 *   reports it as a build error.
 *
 * @example
 * ```ts
 * // apps/web/vite.config.ts
 * export default defineConfig({ plugins: [shmupContent(), shmupAssets()] });
 * ```
 */
export function shmupAssets(options: ShmupAssetsOptions = {}): Plugin {
  const sourceDir = options.sourceDir ?? DEFAULT_SOURCE_DIR;
  const outDir = options.outDir ?? DEFAULT_OUT_DIR;
  let command: 'build' | 'serve' = 'build';
  let result: GenerateResult | null = null;

  /**
   * Runs the (cached) pipeline and remembers its result.
   *
   * @returns The pipeline result.
   */
  const generate = (): GenerateResult => {
    result = generateAssets({ sourceDir, outDir });
    return result;
  };

  return {
    name: 'shmup:assets',
    /**
     * Remembers whether this is a build or the dev server.
     *
     * @param config - The resolved Vite config.
     */
    configResolved(config) {
      command = config.command;
    },
    /**
     * Generates the atlas (cached) and, in builds, emits its pages into `assets/atlas/`.
     */
    buildStart() {
      const generated = generate();
      if (command !== 'build') return;
      for (const page of generated.manifest.pages) {
        this.emitFile({
          type: 'asset',
          fileName: `${ATLAS_URL_DIR}/${page.file}`,
          source: readFileSync(join(generated.atlasDir, page.file)),
        });
      }
    },
    /**
     * Claims the virtual module id.
     *
     * @param id - The import specifier being resolved.
     * @returns The `\0`-prefixed resolved id for {@link ASSETS_MODULE_ID}, else `null`.
     */
    resolveId(id) {
      return id === ASSETS_MODULE_ID ? RESOLVED_ASSETS_MODULE_ID : null;
    },
    /**
     * Generates the virtual module's source.
     *
     * @param id - The resolved module id.
     * @returns The module with the inlined manifest and relative page URLs, or `null` for
     *   any other module.
     */
    load(id) {
      if (id !== RESOLVED_ASSETS_MODULE_ID) return null;
      const { manifest } = result ?? generate();
      const pageUrls = manifest.pages.map((page) => `${ATLAS_URL_DIR}/${page.file}`);
      return (
        `export const manifest = ${JSON.stringify(manifest)};\n` +
        `export const pageUrls = ${JSON.stringify(pageUrls)};\n` +
        'export default { manifest, pageUrls };\n'
      );
    },
    /**
     * Dev server only: serves the atlas files and regenerates them on source edits.
     *
     * @param server - The Vite dev server.
     */
    configureServer(server) {
      const prefix = `${server.config.base}${ATLAS_URL_DIR}/`;
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0] ?? '';
        if (!url.startsWith(prefix)) {
          next();
          return;
        }
        const file = decodeURIComponent(url.slice(prefix.length));
        const path = join(outDir, ATLAS_DIR, file);
        if (!ATLAS_FILE_PATTERN.test(file) || !existsSync(path)) {
          next();
          return;
        }
        res.setHeader('Content-Type', file.endsWith('.png') ? 'image/png' : 'application/json');
        res.setHeader('Cache-Control', 'no-cache');
        res.end(readFileSync(path));
      });

      server.watcher.add([sourceDir, PIPELINE_DIR]);
      /**
       * A pipeline script changed. This process keeps running the pipeline modules it
       * loaded with the config, so regenerating here would draw the atlas with the OLD
       * code — nothing to do in-process. When the file is a config dependency (the app
       * configs bundle `vite.shared.ts` and every pipeline module it imports), Vite
       * restarts the server itself and the new instance's `buildStart` runs the new code;
       * otherwise (inline config, `--configLoader native`, a module nothing imports yet)
       * say that a restart is needed.
       *
       * @param file - Absolute path of the changed file.
       */
      const onPipelineChange = (file: string): void => {
        if (!file.endsWith('.mjs')) return;
        if (server.config.configFileDependencies.includes(normalizePath(file))) return;
        server.config.logger.warn(
          `[shmup:assets] ${normalizePath(relative(REPO_ROOT, file))} changed; ` +
            'restart the dev server to regenerate the atlas with the new pipeline code',
        );
      };
      /**
       * Regenerates the atlas after an asset-source edit and reloads the page.
       *
       * @param file - Absolute path of the changed file.
       */
      const onChange = (file: string): void => {
        if (isInside(PIPELINE_DIR, file)) {
          onPipelineChange(file);
          return;
        }
        if (!isInside(sourceDir, file)) return;
        try {
          generate();
        } catch (error) {
          server.config.logger.error(`[shmup:assets] ${(error as Error).message}`);
          return;
        }
        const module = server.moduleGraph.getModuleById(RESOLVED_ASSETS_MODULE_ID);
        if (module !== undefined) server.moduleGraph.invalidateModule(module);
        server.ws.send({ type: 'full-reload' });
      };
      server.watcher.on('add', onChange);
      server.watcher.on('change', onChange);
      server.watcher.on('unlink', onChange);
    },
  };
}
