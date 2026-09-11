/**
 * `shmupAssets()` edge cases: the dev middleware under the apps' relative base and a
 * custom base, file names it must refuse, malformed URLs; the dev watcher's full cycle
 * (a source edit invalidates the virtual module, regenerates and reloads; invalid sources
 * keep the last good atlas and log instead of reloading; add / unlink; sibling folders and
 * non-code pipeline files are ignored; pipeline scripts that are config dependencies stay
 * silent because Vite restarts for them); build failures and multi-page emission; and the
 * premise of the review-round-1 fix — the real app configs list every pipeline module as
 * a config dependency, so editing one restarts the dev server.
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
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';
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
import { ASSETS_MODULE_ID, ATLAS_URL_DIR, shmupAssets } from '../../vite.shared.js';

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

describe('integration: shmupAssets() hooks (edge)', () => {
  const plugin = shmupAssets({ outDir: join(tmp, 'hooks-out') });

  it('claims nothing but the exact virtual id', () => {
    for (const id of [
      'virtual:shmup-assets?raw',
      '\0virtual:shmup-assets',
      'virtual:shmup-asset',
      './virtual:shmup-assets',
    ]) {
      expect(hook(plugin, 'resolveId', id), id).toBeNull();
    }
    expect(hook(plugin, 'load', '\0virtual:shmup-content')).toBeNull();
    expect(hook(plugin, 'load', ASSETS_MODULE_ID)).toBeNull(); // unresolved id
  });

  it('serves the same module text on every load (manifest generated once)', () => {
    const first = hook(plugin, 'load', '\0' + ASSETS_MODULE_ID) as string;
    const second = hook(plugin, 'load', '\0' + ASSETS_MODULE_ID) as string;
    expect(second).toBe(first);
    expect(first.split('\n')).toEqual([
      `export const manifest = ${JSON.stringify(reference.manifest)};`,
      `export const pageUrls = ${JSON.stringify([`${ATLAS_URL_DIR}/main.png`])};`,
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
        'main-7.png',
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
  it('regenerates, invalidates the virtual module and reloads after a source edit', async () => {
    const sourceDir = copySources('watch-edit');
    const outDir = join(tmp, 'watch-edit-out');
    const { server } = await startServer({ plugins: [shmupAssets({ sourceDir, outDir })] });
    try {
      const send = vi.fn();
      server.ws.send = send as typeof server.ws.send;
      const before = (await server.ssrLoadModule(ASSETS_MODULE_ID)) as {
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
      const after = (await server.ssrLoadModule(ASSETS_MODULE_ID)) as { manifest: AtlasManifest };
      expect(after.manifest.sprites['items/bonus'].frames).toHaveLength(json.frames.length);
      const onDisk = JSON.parse(
        readFileSync(join(outDir, 'atlas', 'main.json'), 'utf8'),
      ) as AtlasManifest;
      expect(onDisk).toEqual(after.manifest);
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
      const served = (await server.ssrLoadModule(ASSETS_MODULE_ID)) as { manifest: AtlasManifest };
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
});

describe('integration: the app configs make every pipeline module a config dependency', () => {
  const pipelineModules = (): string[] => {
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
  };

  it.each([['apps/web'], ['apps/tizen']])(
    '%s: an edit to any scripts/assets/**/*.mjs restarts the dev server (no stale atlas)',
    async (app) => {
      const config = await resolveConfig(
        {
          root: join(repo, app),
          configFile: join(repo, app, 'vite.config.ts'),
          logLevel: 'silent',
        },
        'serve',
      );
      const modules = pipelineModules();
      expect(modules.length).toBeGreaterThanOrEqual(15);
      const deps = new Set(config.configFileDependencies);
      for (const file of modules) expect(deps.has(file), file).toBe(true);
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

  it('emits one fixed-name asset per atlas page and lists them all in pageUrls', async () => {
    const sourceDir = copySources('build-pages');
    const art = createImage(2000, 2000);
    mkdirSync(join(sourceDir, 'sprites', 'bg'), { recursive: true });
    writeFileSync(join(sourceDir, 'sprites', 'bg', 'backdrop.png'), encodePng(art));
    const entry = join(tmp, 'entry-pages.js');
    writeFileSync(
      entry,
      "import { pageUrls } from 'virtual:shmup-assets';\nglobalThis.urls = pageUrls;\n",
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
    expect(assets).toEqual([`${ATLAS_URL_DIR}/main-1.png`, `${ATLAS_URL_DIR}/main.png`]);
    const chunk = files.find((f) => f.type === 'chunk');
    const realm = createContext({});
    runInContext(chunk?.type === 'chunk' ? chunk.code : '', realm);
    expect(runInContext('globalThis.urls', realm)).toEqual([
      `${ATLAS_URL_DIR}/main.png`,
      `${ATLAS_URL_DIR}/main-1.png`,
    ]);
    for (const f of files) {
      if (f.type !== 'asset') continue;
      const onDisk = readFileSync(
        join(tmp, 'build-pages-out', 'atlas', f.fileName.split('/').pop() ?? ''),
      );
      expect(Buffer.compare(Buffer.from(f.source as Uint8Array), onDisk), f.fileName).toBe(0);
    }
  }, 60_000);
});
