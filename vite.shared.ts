/**
 * Settings shared by every Vite (apps) and Vitest (all projects) config, plus the repo's
 * own Vite plugins.
 *
 * {@link shmupContent} turns `content/` into the virtual module `virtual:shmup-content`
 * so the Tizen bundle can ship game data inside its single classic script (decision D25).
 * {@link shmupAssets} runs the placeholder asset pipeline and ships the atlas pages **and
 * the manifest** (`assets/atlas/main.json`) next to the bundle; `virtual:shmup-assets` tells the
 * shell where to fetch the manifest and its digest (plan R1-05 — the manifest no longer rides in
 * `app.js`), `virtual:shmup-assets-inline` still inlines it (the render bench, the TV fallback).
 *
 * **Public API.** Resolve conditions: {@link SOURCE_CONDITION}, {@link clientConditions},
 * {@link serverConditions}. Content: {@link shmupContent}, {@link readContentFiles},
 * {@link CONTENT_MODULE_ID}, {@link ContentFileRecord}, {@link ShmupContentOptions}.
 * Assets: {@link shmupAssets}, {@link ASSETS_MODULE_ID}, {@link ASSETS_INLINE_MODULE_ID},
 * {@link ATLAS_URL_DIR}, {@link ATLAS_MANIFEST_URL}, {@link manifestDigest},
 * {@link ShmupAssetsOptions}. Build info (M1-19): {@link shmupBuildInfo}, {@link isDevBuild},
 * {@link DEV_BUILD_MODES}, {@link buildId}.
 *
 * @remarks
 * Node-only tooling (it reads the file system); it is never part of a shipped bundle, so
 * the Chromium 69 rules do not apply here. Guides: `docs/dev/content-data.md`,
 * `assets/README.md`.
 *
 * @module
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { isAbsolute, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultClientConditions, defaultServerConditions, normalizePath, type Plugin } from 'vite';
import {
  ATLAS_DIR,
  ATLAS_NAME,
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
 * Module id the {@link shmupAssets} plugin serves for the apps (plan R1-05): where the atlas
 * manifest is fetched from (`manifestUrl`), the folder of its pages (`atlasDir`) and the digest of
 * the shipped manifest (`manifestDigest`); `types/virtual-modules.d.ts` declares it.
 */
export const ASSETS_MODULE_ID = 'virtual:shmup-assets';

/** Rollup's convention for a virtual module's resolved id. */
const RESOLVED_ASSETS_MODULE_ID = '\0' + ASSETS_MODULE_ID;

/**
 * Module id of the **inlined** atlas manifest (`{ manifest, pageUrls }` — what
 * `virtual:shmup-assets` served until R1-05): the render bench harness reads it, and it is the TV
 * apps' fallback should `file://` XHR of the manifest ever fail on a set (W3-7 — one import line
 * per app). `types/virtual-modules.d.ts` declares it.
 */
export const ASSETS_INLINE_MODULE_ID = 'virtual:shmup-assets-inline';

/** Rollup's convention for a virtual module's resolved id. */
const RESOLVED_ASSETS_INLINE_MODULE_ID = '\0' + ASSETS_INLINE_MODULE_ID;

/**
 * Where atlas pages live relative to the page that loads the game (`dist/assets/atlas/`
 * in builds, served from `assets/generated/atlas/` by the dev server). Relative, so the
 * build works from `file://` (Tizen) and `app://` (Electron).
 */
export const ATLAS_URL_DIR = 'assets/atlas';

/**
 * Where the atlas manifest lives relative to the page (`dist/assets/atlas/main.json` — the
 * pipeline's own file, byte for byte), fetched by the shell at boot (plan R1-05).
 */
export const ATLAS_MANIFEST_URL = `${ATLAS_URL_DIR}/${ATLAS_NAME}.json`;

/**
 * The digest the shell checks a fetched manifest against: 32-bit FNV-1a over the file's bytes, as
 * 8 lower-case hex digits. `@shmup/shell`'s `manifestDigest` computes the same value in the page
 * (`test/integration/assets-plugin.test.ts` pins that the two agree) — a cached `main.json` of
 * another build fails the boot with a clear error instead of drawing the wrong frames.
 *
 * @param bytes - The manifest file's bytes.
 * @returns The digest, e.g. `"811c9dc5"` for no bytes.
 *
 * @example
 * ```ts
 * manifestDigest(readFileSync('assets/generated/atlas/main.json')); // → e.g. "3fa0c1d2"
 * ```
 */
export function manifestDigest(bytes: Uint8Array): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    hash ^= bytes[i];
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

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
 * - **`virtual:shmup-assets`** (the apps — plan R1-05): `export const manifestUrl =
 *   'assets/atlas/main.json'`, `export const atlasDir = 'assets/atlas'` (both relative),
 *   `export const manifestDigest = '…'` ({@link manifestDigest} of the manifest file) and a
 *   default export of the three. The shell fetches the manifest with `XMLHttpRequest` (status 0
 *   is success on `file://` — `fetch()` fails there, decision D25), so the ~200 KB of frame data
 *   no longer rides in the TV's `app.js`.
 * - **`virtual:shmup-assets-inline`:** what the apps imported until R1-05 — `export const
 *   manifest = {…}` (the atlas manifest, **inlined**), `export const pageUrls =
 *   ['assets/atlas/main.png', …]` (relative, one per manifest page) and a default export
 *   `{ manifest, pageUrls }`: the render bench harness, and the TV fallback (W3-7).
 * - **Build:** every atlas page and the manifest are emitted into `dist/assets/atlas/` with
 *   `emitFile` (fixed names, no hash — the manifest refers to the pages by name), the manifest
 *   as the pipeline's on-disk bytes so one digest holds for the build and the dev server.
 * - **Dev server:** a middleware serves `<base>assets/atlas/*` from the output directory,
 *   and edits under the asset sources regenerate the atlas, invalidate both virtual modules and
 *   full-reload the page.
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
  /**
   * The manifest file as the pipeline wrote it (the bytes the build ships and the dev server
   * serves — their digest is what the shell checks).
   *
   * @param generated - The pipeline result.
   * @returns The bytes of `<atlasDir>/main.json`.
   */
  const manifestBytes = (generated: GenerateResult): Buffer =>
    readFileSync(join(generated.atlasDir, `${ATLAS_NAME}.json`));

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
     * Generates the atlas (cached) and, in builds, emits its pages and its manifest into
     * `assets/atlas/`.
     *
     * @remarks
     * Runs for the dev server too, so a fresh checkout serves an atlas without a prior
     * `pnpm assets`. Pages are emitted under fixed names (no content hash): the manifest
     * refers to them by file name. The manifest is emitted as the pipeline's own bytes
     * (`main.json`), so its digest in `virtual:shmup-assets` matches the shipped file.
     *
     * @throws AssetSourceError when an asset source is invalid; Vite reports it as a build
     *   (or dev-server start-up) error.
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
      this.emitFile({
        type: 'asset',
        fileName: ATLAS_MANIFEST_URL,
        source: manifestBytes(generated),
      });
    },
    /**
     * Claims the two virtual module ids.
     *
     * @param id - The import specifier being resolved.
     * @returns The `\0`-prefixed resolved id for {@link ASSETS_MODULE_ID} or
     *   {@link ASSETS_INLINE_MODULE_ID}, else `null`.
     */
    resolveId(id) {
      if (id === ASSETS_MODULE_ID) return RESOLVED_ASSETS_MODULE_ID;
      return id === ASSETS_INLINE_MODULE_ID ? RESOLVED_ASSETS_INLINE_MODULE_ID : null;
    },
    /**
     * Generates a virtual module's source.
     *
     * @param id - The resolved module id.
     * @returns `virtual:shmup-assets`: the manifest's URL, the pages' folder and the manifest's
     *   digest; `virtual:shmup-assets-inline`: the inlined manifest and relative page URLs;
     *   `null` for any other module.
     */
    load(id) {
      if (id === RESOLVED_ASSETS_MODULE_ID) {
        const digest = manifestDigest(manifestBytes(result ?? generate()));
        return (
          `export const manifestUrl = ${JSON.stringify(ATLAS_MANIFEST_URL)};\n` +
          `export const atlasDir = ${JSON.stringify(ATLAS_URL_DIR)};\n` +
          `export const manifestDigest = ${JSON.stringify(digest)};\n` +
          'export default { manifestUrl, atlasDir, manifestDigest };\n'
        );
      }
      if (id !== RESOLVED_ASSETS_INLINE_MODULE_ID) return null;
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
      // Serves `<base>assets/atlas/<file>` from the output directory. Only plain atlas file
      // names (`ATLAS_FILE_PATTERN`) that exist are answered; anything else — other paths,
      // traversal attempts, malformed percent-encoding — falls through to Vite (404).
      // Responses are `no-cache`, so a regenerated atlas shows up on the next reload.
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0] ?? '';
        if (!url.startsWith(prefix)) {
          next();
          return;
        }
        let file: string;
        try {
          file = decodeURIComponent(url.slice(prefix.length));
        } catch {
          // Malformed percent-encoding cannot name an atlas file: let Vite answer (404),
          // instead of the URIError turning into a 500.
          next();
          return;
        }
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
        // Both modules change: the inlined manifest, and the digest of the fetched one.
        for (const resolved of [RESOLVED_ASSETS_MODULE_ID, RESOLVED_ASSETS_INLINE_MODULE_ID]) {
          const module = server.moduleGraph.getModuleById(resolved);
          if (module !== undefined) server.moduleGraph.invalidateModule(module);
        }
        server.ws.send({ type: 'full-reload' });
      };
      server.watcher.on('add', onChange);
      server.watcher.on('change', onChange);
      server.watcher.on('unlink', onChange);
    },
  };
}

// ----------------------------------------------------------------------------- video (R7-VID)

/**
 * Where the encoded cutscene clips live before the build ships them
 * (`assets/generated/video/` — the encode kit's output, git-ignored like the atlas).
 */
export const VIDEO_SOURCE_DIR = fileURLToPath(new URL('./assets/generated/video', import.meta.url));

/**
 * The encode kit (`scripts/v20x/video-encode.mjs`): deterministic ffmpeg passes from the
 * art-prompts winners into the shipped clips.
 */
const VIDEO_KIT = fileURLToPath(new URL('./scripts/v20x/video-encode.mjs', import.meta.url));

/**
 * Where the built app serves the clips (`dist/assets/video/`); the shell's `cutscene`
 * `VIDEO_URL_DIR` is the same string — pinned by `test/integration/video-plugin.test.ts`.
 */
export const VIDEO_URL_DIR = 'assets/video';

/** A shippable video file: a clip, its provenance sidecar, the ledger or the licences. */
export const VIDEO_FILE_PATTERN =
  /^([a-z0-9-]+\.mp4|[a-z0-9-]+\.art\.json|video-ledger\.json|LICENSES-videos\.md)$/;

/**
 * The video files a default-directory build emits into `dist/${VIDEO_URL_DIR}/` — empty when
 * the kit shipped nothing (a machine without ffmpeg — the degraded shape). The three
 * build-output tests (`tizen-build`, `webos-build`, `bench-build`) derive their exact file
 * lists from this, so the lists track the plugin's own reads on either host (v2 R7-VID).
 *
 * @param only - When set, ship only these names (the bench's one looped clip).
 * @returns The dist-relative paths, sorted.
 */
export function videoShippedFiles(only: readonly string[] | null = null): string[] {
  if (!existsSync(VIDEO_SOURCE_DIR)) return [];
  return readdirSync(VIDEO_SOURCE_DIR)
    .filter((name) => VIDEO_FILE_PATTERN.test(name) && (only === null || only.includes(name)))
    .map((name) => `${VIDEO_URL_DIR}/${name}`)
    .sort();
}

/**
 * Vite plugin serving and shipping the cutscene clips (v2 R7-VID, plan §18).
 *
 * - **`buildStart` (both commands):** runs the encode kit's `--check`; when it fails, runs the
 *   full kit (which loud-skips with exit 0 when the machine has no ffmpeg — then there is no
 *   video directory and the app simply has no clips: the director degrades silently, the same
 *   shape as an atlas without pages).
 * - **Build:** emits every kit output into `assets/video/` under fixed names (the shell's
 *   manifest table refers to files by name, like the atlas pages).
 * - **Dev server:** serves `<base>assets/video/<file>` from the kit's directory with no caching
 *   (a re-encode shows on reload). The production `vite preview` (what the browser specs use)
 *   serves the emitted files statically with range requests.
 *
 * @param options - The plugin options.
 * @param options.sourceDir - The clips' directory (default the kit's output,
 *   `assets/generated/video`).
 * @param options.only - When set, ship only these files (the bench build takes the one looped
 *   clip the video knob plays — 198 KB, not the 6.5 MB set). The kit still checks the full set.
 * @returns The plugin.
 */
export function shmupVideos(
  options: { sourceDir?: string; only?: readonly string[] } = {},
): Plugin {
  const sourceDir = options.sourceDir ?? VIDEO_SOURCE_DIR;
  const only = options.only ?? null;
  // A custom directory is the test's fixture — the kit only ever feeds the real one.
  const runsKit = options.sourceDir === undefined;
  let command: 'build' | 'serve' = 'build';

  /** Runs the kit when the shipped files do not match the ledger (loud-skip without ffmpeg). */
  const ensure = (): void => {
    if (!runsKit) return;
    const check = spawnSync(process.execPath, [VIDEO_KIT, '--check'], { stdio: 'ignore' });
    if (check.status === 0) return;
    spawnSync(process.execPath, [VIDEO_KIT], { stdio: 'inherit' });
  };

  /** The shippable files now in the directory (empty when the kit shipped nothing). */
  const videoFiles = (): string[] => {
    if (!existsSync(sourceDir)) return [];
    return readdirSync(sourceDir).filter(
      (name) => VIDEO_FILE_PATTERN.test(name) && (only === null || only.includes(name)),
    );
  };

  return {
    name: 'shmup:videos',
    /**
     * Remembers whether this is a build or the dev server.
     *
     * @param config - The resolved Vite config.
     */
    configResolved(config) {
      command = config.command;
    },
    /**
     * Encodes what is missing and, in builds, emits the clips into `assets/video/`.
     *
     * @remarks
     * A machine without ffmpeg encodes nothing and the game ships without clips (the encode kit
     * prints why and exits 0); CI's ubuntu runners carry ffmpeg, so there the clips are
     * generated exactly like the atlas is.
     */
    buildStart() {
      if (process.env.SHMUP_NO_VIDEO === '1') return; // the baked kill switch: ship no clips
      ensure();
      if (command !== 'build') return;
      for (const name of videoFiles()) {
        this.emitFile({
          type: 'asset',
          fileName: `${VIDEO_URL_DIR}/${name}`,
          source: readFileSync(join(sourceDir, name)),
        });
      }
    },
    /**
     * Dev server only: serves `<base>assets/video/<file>` from the kit's directory, no cache.
     *
     * @param server - The Vite dev server.
     */
    configureServer(server) {
      const prefix = `${server.config.base}${VIDEO_URL_DIR}/`;
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0] ?? '';
        if (!url.startsWith(prefix)) {
          next();
          return;
        }
        let file: string;
        try {
          file = decodeURIComponent(url.slice(prefix.length));
        } catch {
          next();
          return;
        }
        const path = join(sourceDir, file);
        if (
          !VIDEO_FILE_PATTERN.test(file) ||
          (only !== null && !only.includes(file)) ||
          !existsSync(path)
        ) {
          next();
          return;
        }
        res.setHeader('Content-Type', file.endsWith('.mp4') ? 'video/mp4' : 'application/json');
        res.setHeader('Cache-Control', 'no-cache');
        res.end(readFileSync(path));
      });
    },
  };
}

// ----------------------------------------------------------------------------- image stills

/**
 * Where the kit's rendered stills live before the build ships them
 * (`assets/generated/stills/` — `scripts/v20x/stills-encode.mjs`'s output, git-ignored like the
 * atlas and the clips). Plan v20x A4: the large-format image surfaces of the ending screens.
 */
export const STILLS_SOURCE_DIR = fileURLToPath(
  new URL('./assets/generated/stills', import.meta.url),
);

/** The encode kit (`scripts/v20x/stills-encode.mjs`): deterministic resampling of the art-prompts
 * moment winners into the shipped PNG-8 stills (pure Node — no ffmpeg, no GPU). */
const STILLS_KIT = fileURLToPath(new URL('./scripts/v20x/stills-encode.mjs', import.meta.url));

/**
 * Where the built app serves the stills (`dist/assets/stills/`); the shell's `stills`
 * `STILLS_URL_DIR` is the same string — pinned by `test/integration/stills-plugin.test.ts`.
 */
export const STILLS_URL_DIR = 'assets/stills';

/** A shippable still file: a PNG, its provenance sidecar, the ledger or the licences. */
export const STILLS_FILE_PATTERN =
  /^([a-z0-9-]+\.png|[a-z0-9-]+\.art\.json|stills-ledger\.json|LICENSES-stills\.md)$/;

/**
 * The still files a default-directory build emits into `dist/${STILLS_URL_DIR}/` — empty when
 * the kit's directory does not exist yet. The build-output tests (`tizen-build`, `webos-build`)
 * derive their exact file lists from this, the video precedent's rule (plan v20x A4).
 *
 * @param only - When set, ship only these names.
 * @returns The dist-relative paths, sorted.
 */
export function stillsShippedFiles(only: readonly string[] | null = null): string[] {
  if (!existsSync(STILLS_SOURCE_DIR)) return [];
  return readdirSync(STILLS_SOURCE_DIR)
    .filter((name) => STILLS_FILE_PATTERN.test(name) && (only === null || only.includes(name)))
    .map((name) => `${STILLS_URL_DIR}/${name}`)
    .sort();
}

/**
 * Vite plugin serving and shipping the large-format stills (plan v20x A4, the `shmupVideos`
 * sibling).
 *
 * - **`buildStart` (both commands):** runs the encode kit's `--check`; when it fails, runs the
 *   full kit (pure Node, always available — a drift re-renders, never ships silently).
 * - **Build:** emits every kit output into `assets/stills/` under fixed names (the shell's
 *   manifest refers to files by name, like the clips and the atlas pages).
 * - **Dev server:** serves `<base>assets/stills/<file>` from the kit's directory with no caching.
 * - `SHMUP_NO_STILLS=1` bakes the kill switch and ships no files (the video rule).
 *
 * @param options - The plugin options.
 * @param options.sourceDir - The stills' directory (default the kit's output,
 *   `assets/generated/stills`).
 * @param options.only - When set, ship only these files.
 * @returns The plugin.
 */
export function shmupStills(
  options: { sourceDir?: string; only?: readonly string[] } = {},
): Plugin {
  const sourceDir = options.sourceDir ?? STILLS_SOURCE_DIR;
  const only = options.only ?? null;
  // A custom directory is the test's fixture — the kit only ever feeds the real one.
  const runsKit = options.sourceDir === undefined;
  let command: 'build' | 'serve' = 'build';

  /** Re-renders the stills when the shipped files do not match the ledger. */
  const ensure = (): void => {
    if (!runsKit) return;
    const check = spawnSync(process.execPath, [STILLS_KIT, '--check'], { stdio: 'ignore' });
    if (check.status === 0) return;
    spawnSync(process.execPath, [STILLS_KIT], { stdio: 'inherit' });
  };

  /** The shippable files now in the directory (empty when the kit has not run). */
  const stillFiles = (): string[] => {
    if (!existsSync(sourceDir)) return [];
    return readdirSync(sourceDir).filter(
      (name) => STILLS_FILE_PATTERN.test(name) && (only === null || only.includes(name)),
    );
  };

  return {
    name: 'shmup:stills',
    /**
     * Remembers whether this is a build or the dev server.
     *
     * @param config - The resolved Vite config.
     */
    configResolved(config) {
      command = config.command;
    },
    /**
     * Renders what is missing and, in builds, emits the stills into `assets/stills/`.
     */
    buildStart() {
      if (process.env.SHMUP_NO_STILLS === '1') return; // the baked kill switch: ship no stills
      ensure();
      if (command !== 'build') return;
      for (const name of stillFiles()) {
        this.emitFile({
          type: 'asset',
          fileName: `${STILLS_URL_DIR}/${name}`,
          source: readFileSync(join(sourceDir, name)),
        });
      }
    },
    /**
     * Dev server only: serves `<base>assets/stills/<file>` from the kit's directory, no cache.
     *
     * @param server - The Vite dev server.
     */
    configureServer(server) {
      const prefix = `${server.config.base}${STILLS_URL_DIR}/`;
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0] ?? '';
        if (!url.startsWith(prefix)) {
          next();
          return;
        }
        let file: string;
        try {
          file = decodeURIComponent(url.slice(prefix.length));
        } catch {
          next();
          return;
        }
        const path = join(sourceDir, file);
        if (
          !STILLS_FILE_PATTERN.test(file) ||
          (only !== null && !only.includes(file)) ||
          !existsSync(path)
        ) {
          next();
          return;
        }
        res.setHeader('Content-Type', file.endsWith('.png') ? 'image/png' : 'application/json');
        res.setHeader('Cache-Control', 'no-cache');
        res.end(readFileSync(path));
      });
    },
  };
}

// ------------------------------------------------------------------------------ build info

/**
 * Vite modes that make a **dev / test build** (`__SHMUP_DEV__` true): `development`
 * (`vite build --mode development` — the apps' `build:dev`), `test` (`build:test`, what
 * `pnpm test:e2e` builds) and `bench` (plan R0-02: the TV render bench, `pnpm bench:tv` — a
 * separate widget built from `vite.bench.config.ts`, which needs `__SHMUP_REPORT_URL__` to reach
 * the log server). The dev server is always a dev build; `vite build` (mode `production`,
 * `pnpm build`) is a release build.
 */
export const DEV_BUILD_MODES: readonly string[] = Object.freeze(['development', 'test', 'bench']);

/**
 * Whether a Vite run makes a dev / test build (debug tools in the bundle — plan M1-19).
 *
 * @param env - Vite's config environment.
 * @param env.command - `'serve'` (dev server) or `'build'`.
 * @param env.mode - The Vite mode.
 * @returns `true` for the dev server and the {@link DEV_BUILD_MODES}.
 *
 * @example
 * ```ts
 * isDevBuild({ command: 'build', mode: 'production' }); // → false
 * isDevBuild({ command: 'build', mode: 'test' }); // → true
 * ```
 */
export function isDevBuild(env: { command: string; mode: string }): boolean {
  return env.command === 'serve' || DEV_BUILD_MODES.indexOf(env.mode) >= 0;
}

/**
 * The build id baked into the apps as `__SHMUP_BUILD__` (replay headers, the debug overlay): the
 * `SHMUP_BUILD_ID` environment variable when set, else the short git SHA of `HEAD` (with a `+`
 * when the work tree has changes), else `'unknown'` (no git).
 *
 * @param cwd - Where to ask git (default: the repo root).
 * @returns The id, e.g. `'9524c84'` or `'9524c84+'`.
 *
 * @example
 * ```ts
 * buildId(); // → '9524c84'
 * ```
 */
export function buildId(cwd: string = REPO_ROOT): string {
  const fromEnv = process.env.SHMUP_BUILD_ID;
  if (fromEnv !== undefined && fromEnv !== '') return fromEnv;
  try {
    const sha = execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    const dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return sha === '' ? 'unknown' : dirty === '' ? sha : `${sha}+`;
  } catch (_error) {
    return 'unknown';
  }
}

/**
 * Vite plugin that defines the build-info globals of the apps (plan M1-19; declared in
 * `types/build-info.d.ts`):
 *
 * - `__SHMUP_DEV__` — `true` for a dev / test build ({@link isDevBuild}): the apps then create the
 *   debug tools (F1–F8, the TV's unlock sequence, the overlay, `window.__shmupDebug`); `false` in a
 *   release build, where the minifier folds `__SHMUP_DEV__ ? … : null` away and the tools are
 *   not bundled.
 * - `__SHMUP_BUILD__` — the {@link buildId} (git SHA).
 * - `__SHMUP_REPORT_URL__` — the render-telemetry log server (plan M3-02f): the `VITE_REPORT_URL`
 *   environment variable in a **dev / test build**, `''` everywhere else. The name is the input
 *   probe's, so one `npm run log-server` and one variable serve both senders. `''` leaves the
 *   guided capture switched off, and a release build never even reads the variable.
 *
 * @returns The plugin.
 *
 * @example
 * ```ts
 * // apps/tizen/vite.config.ts
 * export default defineConfig({ plugins: [shmupContent(), shmupAssets(), shmupBuildInfo()] });
 * ```
 */
export function shmupBuildInfo(): Plugin {
  return {
    name: 'shmup:build-info',
    config(_config, env) {
      const reportUrl = isDevBuild(env) ? (process.env.VITE_REPORT_URL ?? '') : '';
      return {
        define: {
          __SHMUP_DEV__: JSON.stringify(isDevBuild(env)),
          __SHMUP_BUILD__: JSON.stringify(buildId()),
          __SHMUP_REPORT_URL__: JSON.stringify(reportUrl),
          // v2 R7-VID: `SHMUP_NO_VIDEO=1` bakes the kill switch in (no surface, no clips).
          __SHMUP_NO_VIDEO__: JSON.stringify(process.env.SHMUP_NO_VIDEO === '1'),
          // Plan v20x A4: `SHMUP_NO_STILLS=1` bakes the stills kill switch in (no surface, no
          // files — the video rule, the shipped default being ON instead of OFF).
          __SHMUP_NO_STILLS__: JSON.stringify(process.env.SHMUP_NO_STILLS === '1'),
        },
      };
    },
  };
}
