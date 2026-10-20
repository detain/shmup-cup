/**
 * `shmupAssets()` edge cases: the dev middleware under the apps' relative base and a
 * custom base, file names it must refuse, malformed URLs; the dev watcher's full cycle
 * (a source edit invalidates the virtual module, regenerates and reloads; invalid sources
 * keep the last good atlas and log instead of reloading; add / unlink; sibling folders and
 * non-code pipeline files are ignored; pipeline scripts that are config dependencies stay
 * silent because Vite restarts for them); build failures and multi-page emission (every page and
 * the manifest — plan R1-05); and the premise of the review-round-1 fix — the real app configs
 * list every pipeline module the shipped pipeline IMPORTS as a config dependency, so editing one
 * restarts the dev server, while a pipeline-dir module nothing imports goes through the plugin's
 * documented warn branch instead (`vite.shared.ts` `onPipelineChange`).
 *
 * Wording ruling (wave 4, found by lane FIXE; w04-FIXG): the config test used to over-assert —
 * "an edit to ANY scripts/assets/*.mjs restarts the dev server" — against the design's two
 * branches. `9979be3` made `standin.mjs` a pure leaf on purpose (M1bRV1 NIT-1: its sole importer
 * is its own test), so it is in no config's `configFileDependencies` and cannot trigger Vite's
 * restart — and editing the stand-in generator must not restart atlas dev servers (option b,
 * force-watching the whole dir, was rejected). The restart guarantee is therefore scoped to the
 * modules `pipeline.mjs` transitively imports, derived in-file from its static import graph
 * (parsed with the TypeScript compiler — never a hand-maintained list that can rot), and the two
 * modules outside that set (`standin.mjs`, `tileset-masks.mjs`) are pinned by name to the branch
 * that warns.
 *
 * Regression (M1-03 test pass): a malformed percent-encoded URL under `assets/atlas/`
 * threw a URIError inside the middleware and the dev server answered 500 instead of 404.
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';
import {
  build,
  createLogger,
  createServer,
  normalizePath,
  resolveConfig,
  type InlineConfig,
  type Rollup,
  type ViteDevServer,
} from 'vite';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { createImage } from '../../scripts/assets/image.mjs';
import type { AtlasManifest } from '../../scripts/assets/manifest.mjs';
import { DEFAULT_SOURCE_DIR, PIPELINE_DIR, buildAtlas } from '../../scripts/assets/pipeline.mjs';
import { encodePng } from '../../scripts/assets/png.mjs';
import {
  ASSETS_INLINE_MODULE_ID,
  ASSETS_MODULE_ID,
  ATLAS_MANIFEST_URL,
  ATLAS_URL_DIR,
  manifestDigest,
  shmupAssets,
} from '../../vite.shared.js';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const tmp = mkdtempSync(join(tmpdir(), 'shmup-assets-plugin-edge-'));
const reference = buildAtlas();

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

type Plugin = ReturnType<typeof shmupAssets>;

/** Calls a plugin hook that takes one id argument. */
const hook = (plugin: Plugin, name: 'resolveId' | 'load', id: string): unknown =>
  (plugin[name] as (this: void, id: string) => unknown).call(undefined, id);

/**
 * Copies the real asset sources into a scratch folder.
 *
 * @param name - Folder name.
 * @returns The copy.
 */
function copySources(name: string): string {
  const dir = join(tmp, name);
  cpSync(DEFAULT_SOURCE_DIR, dir, { recursive: true });
  return dir;
}

/**
 * Starts a dev server on a free port with an inline config.
 *
 * @param config - Extra inline config (plugins, base, logger).
 * @returns The server and its base URL (`http://127.0.0.1:<port>`).
 */
async function startServer(
  config: InlineConfig,
): Promise<{ server: ViteDevServer; origin: string }> {
  const server = await createServer({
    root: tmp,
    configFile: false,
    logLevel: 'silent',
    server: { port: 0, strictPort: false, host: '127.0.0.1', ws: false },
    ...config,
  });
  await server.listen();
  const address = server.httpServer?.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;
  return { server, origin: `http://127.0.0.1:${port}` };
}

/**
 * A logger that records warnings and errors.
 *
 * @returns The logger and what it recorded.
 */
function recordingLogger() {
  const warnings: string[] = [];
  const errors: string[] = [];
  const base = createLogger('silent');
  return {
    warnings,
    errors,
    logger: {
      ...base,
      warn: (message: string) => {
        warnings.push(message);
      },
      error: (message: string) => {
        errors.push(message);
      },
    },
  };
}

const pipelineRoot = normalizePath(PIPELINE_DIR);

/**
 * Every `.mjs` file in the pipeline folder (the walk the restart-guarantee tests split in
 * two: imported set below, everything else on the warning branch).
 *
 * @returns The normalized absolute paths, sorted.
 */
function listPipelineModules(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.mjs')) out.push(normalizePath(full));
    }
  };
  walk(PIPELINE_DIR);
  return out.sort();
}

/**
 * The pipeline modules the shipped pipeline TRANSITIVELY IMPORTS: follow the static ESM
 * specifiers from `pipeline.mjs` that resolve inside the pipeline folder, parsing each
 * file with the TypeScript compiler (the frame-literal scans' parser, so comments and
 * strings never fake an edge). This is the mechanism the w04-FIXG ruling names — derived
 * from the import graph, never a hand-maintained literal list: a module that gains an
 * importer joins the set on its own, and one imported by nothing (the stand-in and the
 * tileset-mask generators) is on the warning branch by that same fact.
 *
 * @returns The normalized absolute paths, sorted.
 */
function importedPipelineModules(): string[] {
  const seen = new Set<string>();
  const queue: string[] = [join(pipelineRoot, 'pipeline.mjs')];
  while (queue.length > 0) {
    const file = queue.pop();
    if (file === undefined || seen.has(file)) continue;
    seen.add(file);
    const source = ts.createSourceFile(
      file,
      readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.JS,
    );
    /** Reads one node's module specifier (import, re-export, literal dynamic import) and queues it. */
    const visit = (node: ts.Node): void => {
      let specifier: string | undefined;
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
        if (node.moduleSpecifier !== undefined && ts.isStringLiteral(node.moduleSpecifier)) {
          specifier = node.moduleSpecifier.text;
        }
      } else if (
        ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        node.arguments.length === 1 &&
        ts.isStringLiteral(node.arguments[0])
      ) {
        specifier = node.arguments[0].text;
      }
      if (specifier !== undefined && specifier.startsWith('.')) {
        const target = normalizePath(resolve(dirname(file), specifier));
        if (target.startsWith(`${pipelineRoot}/`) && !seen.has(target)) queue.push(target);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return [...seen].sort();
}

describe('integration: shmupAssets() hooks (edge)', () => {
  const plugin = shmupAssets({ outDir: join(tmp, 'hooks-out') });

  it('claims nothing but the exact virtual ids', () => {
    for (const id of [
      'virtual:shmup-assets?raw',
      '\0virtual:shmup-assets',
      'virtual:shmup-asset',
      './virtual:shmup-assets',
      'virtual:shmup-assets-inline?raw',
      '\0virtual:shmup-assets-inline',
      'virtual:shmup-assets-inlined',
      'virtual:shmup-assets/inline',
    ]) {
      expect(hook(plugin, 'resolveId', id), id).toBeNull();
    }
    expect(hook(plugin, 'load', '\0virtual:shmup-content')).toBeNull();
    expect(hook(plugin, 'load', ASSETS_MODULE_ID)).toBeNull(); // unresolved id
    expect(hook(plugin, 'load', ASSETS_INLINE_MODULE_ID)).toBeNull(); // unresolved id
  });

  it('serves the same module texts on every load (manifest generated once)', () => {
    const first = hook(plugin, 'load', '\0' + ASSETS_MODULE_ID) as string;
    const second = hook(plugin, 'load', '\0' + ASSETS_MODULE_ID) as string;
    expect(second).toBe(first);
    const onDisk = readFileSync(join(tmp, 'hooks-out', 'atlas', 'main.json'));
    expect(first.split('\n')).toEqual([
      `export const manifestUrl = ${JSON.stringify(ATLAS_MANIFEST_URL)};`,
      `export const atlasDir = ${JSON.stringify(ATLAS_URL_DIR)};`,
      `export const manifestDigest = ${JSON.stringify(manifestDigest(onDisk))};`,
      'export default { manifestUrl, atlasDir, manifestDigest };',
      '',
    ]);
    const inline = hook(plugin, 'load', '\0' + ASSETS_INLINE_MODULE_ID) as string;
    expect(hook(plugin, 'load', '\0' + ASSETS_INLINE_MODULE_ID)).toBe(inline);
    expect(inline.split('\n')).toEqual([
      `export const manifest = ${JSON.stringify(reference.manifest)};`,
      `export const pageUrls = ${JSON.stringify(reference.manifest.pages.map((p) => `${ATLAS_URL_DIR}/${p.file}`))};`,
      'export default { manifest, pageUrls };',
      '',
    ]);
  });
});

describe('integration: shmupAssets() dev middleware (edge)', () => {
  it('serves the atlas under the apps’ relative base (./ → /) with no-cache', async () => {
    const { server, origin } = await startServer({
      base: './',
      plugins: [shmupAssets({ outDir: join(tmp, 'mw-relative') })],
    });
    try {
      const png = await fetch(`${origin}/${ATLAS_URL_DIR}/main.png?v=3#frag`);
      expect(png.status).toBe(200);
      expect(png.headers.get('cache-control')).toBe('no-cache');
      expect(Buffer.compare(Buffer.from(await png.arrayBuffer()), reference.pages[0].png)).toBe(0);
      const json = await fetch(`${origin}/${ATLAS_URL_DIR}/main.json`);
      expect(json.headers.get('content-type')).toBe('application/json');
      expect(await json.json()).toEqual(reference.manifest);
    } finally {
      await server.close();
    }
  }, 60_000);

  it('follows a custom base and leaves other paths to Vite', async () => {
    const { server, origin } = await startServer({
      base: '/game/',
      plugins: [shmupAssets({ outDir: join(tmp, 'mw-base') })],
    });
    try {
      expect((await fetch(`${origin}/game/${ATLAS_URL_DIR}/main.png`)).status).toBe(200);
      const outside = await fetch(`${origin}/${ATLAS_URL_DIR}/main.png`);
      expect(outside.headers.get('content-type')).not.toBe('image/png');
    } finally {
      await server.close();
    }
  }, 60_000);

  it('refuses names that are not atlas files, missing pages and malformed URLs (regression: 500)', async () => {
    const outDir = join(tmp, 'mw-refuse');
    const { server, origin } = await startServer({ plugins: [shmupAssets({ outDir })] });
    try {
      // Files that exist in the output folder but must never be served by name tricks.
      writeFileSync(join(outDir, 'atlas', 'main.png.tmp'), 'partial');
      writeFileSync(join(outDir, 'atlas', 'NOTES.png'), 'x');
      for (const name of [
        'MAIN.png',
        'NOTES.png',
        'main.png.tmp',
        'sub/main.png',
        'main.txt',
        `main-${reference.manifest.pages.length + 7}.png`, // no such page
        '%2e%2e%2f.asset-cache.json',
        '..%2F..%2Fpackage.json',
        '%E0%A4%A.png',
        '%.png',
      ]) {
        const response = await fetch(`${origin}/${ATLAS_URL_DIR}/${name}`);
        expect(response.status, name).toBe(404);
      }
      // The server is still healthy afterwards.
      expect((await fetch(`${origin}/${ATLAS_URL_DIR}/main.png`)).status).toBe(200);
    } finally {
      await server.close();
    }
  }, 60_000);
});

describe('integration: shmupAssets() dev watcher (edge)', () => {
  it('regenerates, invalidates both virtual modules and reloads after a source edit', async () => {
    const sourceDir = copySources('watch-edit');
    const outDir = join(tmp, 'watch-edit-out');
    const { server } = await startServer({ plugins: [shmupAssets({ sourceDir, outDir })] });
    try {
      const send = vi.fn();
      server.ws.send = send as typeof server.ws.send;
      const digestBefore = (
        (await server.ssrLoadModule(ASSETS_MODULE_ID)) as { manifestDigest: string }
      ).manifestDigest;
      const before = (await server.ssrLoadModule(ASSETS_INLINE_MODULE_ID)) as {
        manifest: AtlasManifest;
        pageUrls: string[];
      };
      expect(before.manifest.sprites['items/bonus'].frames).toHaveLength(
        reference.manifest.sprites['items/bonus'].frames.length,
      );
      const file = join(sourceDir, 'sprites', 'items', 'bonus.sprite.json');
      const json = JSON.parse(readFileSync(file, 'utf8')) as { frames: unknown[] };
      json.frames.push(json.frames[0]);
      writeFileSync(file, JSON.stringify(json));
      server.watcher.emit('change', file);
      expect(send).toHaveBeenCalledWith({ type: 'full-reload' });
      const after = (await server.ssrLoadModule(ASSETS_INLINE_MODULE_ID)) as {
        manifest: AtlasManifest;
      };
      expect(after.manifest.sprites['items/bonus'].frames).toHaveLength(json.frames.length);
      const bytes = readFileSync(join(outDir, 'atlas', 'main.json'));
      const onDisk = JSON.parse(bytes.toString('utf8')) as AtlasManifest;
      expect(onDisk).toEqual(after.manifest);
      // The fetched manifest's module follows too: its digest is the new file's.
      const digestAfter = (
        (await server.ssrLoadModule(ASSETS_MODULE_ID)) as { manifestDigest: string }
      ).manifestDigest;
      expect(digestAfter).toBe(manifestDigest(bytes));
      expect(digestAfter).not.toBe(digestBefore);
    } finally {
      await server.close();
    }
  }, 60_000);

  it('keeps the last good atlas and logs (no reload) when an edit makes the sources invalid', async () => {
    const sourceDir = copySources('watch-invalid');
    const outDir = join(tmp, 'watch-invalid-out');
    const { logger, errors } = recordingLogger();
    const { server } = await startServer({
      customLogger: logger,
      plugins: [shmupAssets({ sourceDir, outDir })],
    });
    try {
      const send = vi.fn();
      server.ws.send = send as typeof server.ws.send;
      const good = readFileSync(join(outDir, 'atlas', 'main.png'));
      const file = join(sourceDir, 'sprites', 'items', 'bonus.sprite.json');
      writeFileSync(file, '{ "name": "items/bonus" }');
      server.watcher.emit('change', file);
      expect(send).not.toHaveBeenCalled();
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/^\[shmup:assets\] asset sources are invalid \(2 issues\):/);
      expect(errors[0]).toContain('items/bonus.sprite.json:palette');
      expect(errors[0]).toContain('items/bonus.sprite.json:frames');
      expect(Buffer.compare(readFileSync(join(outDir, 'atlas', 'main.png')), good)).toBe(0);
      const served = (await server.ssrLoadModule(ASSETS_INLINE_MODULE_ID)) as {
        manifest: AtlasManifest;
      };
      expect(served.manifest).toEqual(reference.manifest);
    } finally {
      await server.close();
    }
  }, 60_000);

  it('regenerates when a source is added or deleted', async () => {
    const sourceDir = copySources('watch-add');
    const outDir = join(tmp, 'watch-add-out');
    const { server } = await startServer({ plugins: [shmupAssets({ sourceDir, outDir })] });
    const manifestFile = join(outDir, 'atlas', 'main.json');
    const sprites = (): string[] =>
      Object.keys((JSON.parse(readFileSync(manifestFile, 'utf8')) as AtlasManifest).sprites);
    try {
      const added = join(sourceDir, 'sprites', 'items', 'medal.sprite.json');
      writeFileSync(
        added,
        JSON.stringify({ name: 'items/medal', palette: { x: '#fc0' }, frames: [{ rows: ['x'] }] }),
      );
      server.watcher.emit('add', added);
      expect(sprites()).toContain('items/medal');
      rmSync(added);
      server.watcher.emit('unlink', added);
      expect(sprites()).not.toContain('items/medal');
    } finally {
      await server.close();
    }
  }, 60_000);

  it('ignores files outside the source folder, including a sibling with the same prefix', async () => {
    const sourceDir = copySources('watch-sibling');
    const outDir = join(tmp, 'watch-sibling-out');
    const { server } = await startServer({ plugins: [shmupAssets({ sourceDir, outDir })] });
    try {
      const send = vi.fn();
      server.ws.send = send as typeof server.ws.send;
      const manifestFile = join(outDir, 'atlas', 'main.json');
      rmSync(manifestFile); // any regeneration would put it back
      const sibling = `${sourceDir}-old`;
      mkdirSync(join(sibling, 'sprites'), { recursive: true });
      const stray = join(sibling, 'sprites', 'x.sprite.json');
      writeFileSync(stray, '{}');
      for (const event of ['add', 'change', 'unlink']) server.watcher.emit(event, stray);
      server.watcher.emit('change', join(tmp, 'elsewhere.sprite.json'));
      server.watcher.emit('change', sourceDir); // the folder itself is not "inside"
      expect(existsSync(manifestFile)).toBe(false);
      expect(send).not.toHaveBeenCalled();
    } finally {
      await server.close();
    }
  }, 60_000);

  it('stays silent for pipeline scripts Vite restarts for, and for non-code pipeline files', async () => {
    const outDir = join(tmp, 'watch-pipeline-out');
    const { logger, warnings } = recordingLogger();
    const { server } = await startServer({
      customLogger: logger,
      plugins: [shmupAssets({ outDir })],
    });
    try {
      const manifestFile = join(outDir, 'atlas', 'main.json');
      rmSync(manifestFile);
      const ui = join(PIPELINE_DIR, 'procedural', 'ui.mjs');
      // As with a real config file that imports vite.shared.ts: a config dependency.
      server.config.configFileDependencies.push(normalizePath(ui));
      server.watcher.emit('change', ui);
      server.watcher.emit('change', join(PIPELINE_DIR, 'README.md'));
      server.watcher.emit('change', join(PIPELINE_DIR, 'notes.txt'));
      expect(warnings).toEqual([]);
      expect(existsSync(manifestFile)).toBe(false);
      // A pipeline module that is not a config dependency still gets the restart hint.
      server.watcher.emit('add', join(PIPELINE_DIR, 'procedural', 'new-generator.mjs'));
      expect(warnings).toEqual([
        '[shmup:assets] scripts/assets/procedural/new-generator.mjs changed; restart the dev ' +
          'server to regenerate the atlas with the new pipeline code',
      ]);
      expect(existsSync(manifestFile)).toBe(false);
    } finally {
      await server.close();
    }
  }, 60_000);

  it('warns (no restart path, no regeneration) for the real pipeline modules nothing imports', async () => {
    // The design's second branch, named by the w04-FIXG ruling: standin.mjs and
    // tileset-masks.mjs live in the pipeline folder but no shipped import chain reaches
    // them (M1bRV1 NIT-1), so no app config carries them as dependencies (the config
    // tests below pin that for the real configs) and a change must only print the
    // documented restart hint — the running pipeline keeps the last good atlas.
    const outDir = join(tmp, 'watch-unimported-out');
    const { logger, warnings } = recordingLogger();
    const { server } = await startServer({
      customLogger: logger,
      plugins: [shmupAssets({ outDir })],
    });
    try {
      const send = vi.fn();
      server.ws.send = send as typeof server.ws.send;
      const manifestFile = join(outDir, 'atlas', 'main.json');
      rmSync(manifestFile); // any regeneration would put it back
      const names = ['standin.mjs', 'tileset-masks.mjs'];
      for (const name of names) {
        const file = join(PIPELINE_DIR, name);
        expect(existsSync(file), name).toBe(true); // by name, and they exist
        expect(server.config.configFileDependencies, name).not.toContain(normalizePath(file));
        server.watcher.emit('change', file);
      }
      expect(warnings).toEqual(
        names.map(
          (name) =>
            `[shmup:assets] scripts/assets/${name} changed; restart the dev server to ` +
            'regenerate the atlas with the new pipeline code',
        ),
      );
      expect(existsSync(manifestFile)).toBe(false);
      expect(send).not.toHaveBeenCalled();
    } finally {
      await server.close();
    }
  }, 60_000);
});

describe('integration: the app configs watch the pipeline modules the shipped pipeline imports', () => {
  const resolveAppDeps = async (app: string): Promise<Set<string>> => {
    const config = await resolveConfig(
      {
        root: join(repo, app),
        configFile: join(repo, app, 'vite.config.ts'),
        logLevel: 'silent',
      },
      'serve',
    );
    return new Set(config.configFileDependencies);
  };

  it.each([['apps/web'], ['apps/tizen']])(
    '%s: an edit to a pipeline module the shipped pipeline imports restarts the dev server (no stale atlas)',
    async (app) => {
      const deps = await resolveAppDeps(app);
      const imported = importedPipelineModules();
      expect(imported.length).toBeGreaterThanOrEqual(15);
      for (const file of imported) expect(deps.has(file), file).toBe(true);
    },
    60_000,
  );

  it.each([['apps/web'], ['apps/tizen']])(
    '%s: a pipeline module the shipped pipeline does not import is not a config dependency (the warning branch owns it)',
    async (app) => {
      const deps = await resolveAppDeps(app);
      const imported = new Set(importedPipelineModules());
      const outside = listPipelineModules().filter((file) => !imported.has(file));
      // The ruling names these two; the derivation above, not this list, decides the branch.
      const names = outside.map((file) => normalizePath(relative(repo, file)));
      expect(names).toContain('scripts/assets/standin.mjs');
      expect(names).toContain('scripts/assets/tileset-masks.mjs');
      for (const file of outside) expect(deps.has(file), file).toBe(false);
    },
    60_000,
  );
});

describe('integration: shmupAssets() builds (edge)', () => {
  it('fails the build with every source issue when the sources are invalid', async () => {
    const sourceDir = copySources('build-invalid');
    writeFileSync(join(sourceDir, 'sprites', 'broken.sprite.json'), '[]');
    const entry = join(tmp, 'entry-invalid.js');
    writeFileSync(entry, "import assets from 'virtual:shmup-assets';\nglobalThis.a = assets;\n");
    await expect(
      build({
        root: tmp,
        logLevel: 'silent',
        configFile: false,
        plugins: [shmupAssets({ sourceDir, outDir: join(tmp, 'build-invalid-out') })],
        build: {
          write: false,
          lib: { entry, formats: ['iife'], name: 'app', fileName: () => 'app.js' },
        },
      }),
    ).rejects.toThrow(/asset sources are invalid \(1 issue\)[\s\S]*broken\.sprite\.json/);
    expect(existsSync(join(tmp, 'build-invalid-out'))).toBe(false);
  }, 60_000);

  it('emits one fixed-name asset per atlas page plus the manifest, and lists every page', async () => {
    const sourceDir = copySources('build-pages');
    const art = createImage(2000, 2000);
    mkdirSync(join(sourceDir, 'sprites', 'bg'), { recursive: true });
    writeFileSync(join(sourceDir, 'sprites', 'bg', 'backdrop.png'), encodePng(art));
    const entry = join(tmp, 'entry-pages.js');
    writeFileSync(
      entry,
      "import { pageUrls } from 'virtual:shmup-assets-inline';\nglobalThis.urls = pageUrls;\n",
    );
    const output = (await build({
      root: tmp,
      logLevel: 'silent',
      configFile: false,
      plugins: [shmupAssets({ sourceDir, outDir: join(tmp, 'build-pages-out') })],
      build: {
        write: false,
        lib: { entry, formats: ['iife'], name: 'app', fileName: () => 'app.js' },
      },
    })) as Rollup.RollupOutput[];
    const files = output[0].output;
    const assets = files
      .filter((f) => f.type === 'asset')
      .map((f) => f.fileName)
      .sort();
    // The backdrop is common: common takes two pages, then the zone pages follow (R1-05).
    const count = reference.manifest.pages.length + 1;
    const urls = Array.from({ length: count }, (_, i) =>
      i === 0 ? `${ATLAS_URL_DIR}/main.png` : `${ATLAS_URL_DIR}/main-${i}.png`,
    );
    expect(assets).toEqual([...urls, `${ATLAS_URL_DIR}/main.json`].sort());
    const chunk = files.find((f) => f.type === 'chunk');
    const realm = createContext({});
    runInContext(chunk?.type === 'chunk' ? chunk.code : '', realm);
    expect(runInContext('globalThis.urls', realm)).toEqual(urls);
    for (const f of files) {
      if (f.type !== 'asset') continue;
      const onDisk = readFileSync(
        join(tmp, 'build-pages-out', 'atlas', f.fileName.split('/').pop() ?? ''),
      );
      expect(Buffer.compare(Buffer.from(f.source as Uint8Array), onDisk), f.fileName).toBe(0);
    }
  }, 60_000);
});
