/**
 * The `shmupAssets()` Vite plugin and how the asset pipeline is wired into the repo:
 * `virtual:shmup-assets` names the manifest the shell fetches (`assets/atlas/main.json`, its
 * folder and its digest — plan R1-05), `virtual:shmup-assets-inline` inlines the manifest with
 * relative page URLs (decision D25 — the render bench, the TV fallback), a real IIFE build emits
 * the atlas pages and the manifest into `assets/atlas/` (and no longer carries the manifest in
 * the script), the dev server serves them and regenerates on source edits, both apps use the
 * plugin, and Turborepo runs `//#assets` before `build` / `dev` with the right inputs and outputs.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';
import { build, createLogger, createServer, type Rollup } from 'vite';
import { afterAll, describe, expect, it } from 'vitest';
import { formatManifest } from '../../scripts/assets/manifest.mjs';
import { DEFAULT_SOURCE_DIR, PIPELINE_DIR, buildAtlas } from '../../scripts/assets/pipeline.mjs';
import {
  ASSETS_INLINE_MODULE_ID,
  ASSETS_MODULE_ID,
  ATLAS_MANIFEST_URL,
  ATLAS_URL_DIR,
  manifestDigest,
  shmupAssets,
} from '../../vite.shared.js';
// A relative source import, as render-telemetry-pipeline.test.ts does: the root package does not
// depend on `@shmup/shell`, and one function is no reason to add it.
import { manifestDigest as shellManifestDigest } from '../../packages/shell/src/loader/index.js';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const tmp = mkdtempSync(join(tmpdir(), 'shmup-assets-plugin-'));
const { manifest } = buildAtlas();

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

/** Reads a repo file as text. */
const text = (path: string): string => readFileSync(join(repo, path), 'utf8');

type Plugin = ReturnType<typeof shmupAssets>;

/** Calls a plugin hook that takes one id argument. */
const hook = (plugin: Plugin, name: 'resolveId' | 'load', id: string): unknown =>
  (plugin[name] as (this: void, id: string) => unknown).call(undefined, id);

/**
 * Evaluates a virtual module's source and returns its default export.
 *
 * @param code - The module text (`export const …` lines and an `export default`).
 * @returns The default export.
 */
function evaluateModule(code: string): unknown {
  const realm = createContext({});
  return runInContext(
    `(() => { ${code.replace(/export const /g, 'const ').replace('export default', 'return')} })()`,
    realm,
  );
}

describe('integration: shmupAssets() virtual modules', () => {
  const outDir = join(tmp, 'generated');
  const plugin = shmupAssets({ outDir });

  it('claims only its own two virtual ids', () => {
    expect(hook(plugin, 'resolveId', ASSETS_MODULE_ID)).toBe('\0' + ASSETS_MODULE_ID);
    expect(hook(plugin, 'resolveId', ASSETS_INLINE_MODULE_ID)).toBe('\0' + ASSETS_INLINE_MODULE_ID);
    expect(ASSETS_INLINE_MODULE_ID).toBe('virtual:shmup-assets-inline');
    expect(hook(plugin, 'resolveId', 'virtual:shmup-content')).toBeNull();
    expect(hook(plugin, 'load', 'other')).toBeNull();
  });

  it('names the manifest to fetch, its folder and its digest (generating the atlas on demand)', () => {
    const exported = evaluateModule(hook(plugin, 'load', '\0' + ASSETS_MODULE_ID) as string) as {
      manifestUrl: string;
      atlasDir: string;
      manifestDigest: string;
    };
    const onDisk = readFileSync(join(outDir, 'atlas', 'main.json'));
    expect(exported).toEqual({
      manifestUrl: 'assets/atlas/main.json',
      atlasDir: ATLAS_URL_DIR,
      manifestDigest: manifestDigest(onDisk),
    });
    expect(ATLAS_MANIFEST_URL).toBe(exported.manifestUrl);
    expect(exported.manifestDigest).toMatch(/^[0-9a-f]{8}$/);
    // The page computes the same digest from the same bytes (`@shmup/shell` `manifestDigest`).
    expect(shellManifestDigest(new Uint8Array(onDisk))).toBe(exported.manifestDigest);
    expect(onDisk.toString('utf8')).toBe(formatManifest(manifest));
    expect(onDisk.toString('utf8')).toContain('"formatVersion": 2');
    for (const url of [exported.manifestUrl, exported.atlasDir]) {
      expect(url.startsWith('/')).toBe(false);
    }
  });

  it('virtual:shmup-assets-inline inlines the manifest and relative page URLs', () => {
    const exported = evaluateModule(
      hook(plugin, 'load', '\0' + ASSETS_INLINE_MODULE_ID) as string,
    ) as { manifest: typeof manifest; pageUrls: string[] };
    expect(exported.manifest).toEqual(manifest);
    expect(exported.pageUrls).toEqual(
      manifest.pages.map((page) => `${ATLAS_URL_DIR}/${page.file}`),
    );
    expect(exported.pageUrls[0]).toBe(`${ATLAS_URL_DIR}/main.png`);
    for (const url of exported.pageUrls) expect(url.startsWith('/')).toBe(false);
  });

  it('digests bytes with 32-bit FNV-1a, the same in the plugin and in the page', () => {
    const cases = [new Uint8Array(0), new TextEncoder().encode('a'), new Uint8Array([0, 255, 7])];
    expect(manifestDigest(cases[0])).toBe('811c9dc5');
    expect(manifestDigest(cases[1])).toBe('e40c292c');
    for (const bytes of cases) expect(shellManifestDigest(bytes)).toBe(manifestDigest(bytes));
  });
});

describe('integration: a real Vite build through shmupAssets()', () => {
  it('emits the pages and the manifest into assets/atlas/; the IIFE bundle carries only its URL', async () => {
    const entry = join(tmp, 'entry.js');
    writeFileSync(
      entry,
      "import assets from 'virtual:shmup-assets';\nglobalThis.__assets = assets;\n",
    );
    const generated = join(tmp, 'generated-build');
    const output = (await build({
      root: tmp,
      logLevel: 'silent',
      configFile: false,
      plugins: [shmupAssets({ outDir: generated })],
      build: {
        write: false,
        lib: { entry, formats: ['iife'], name: 'app', fileName: () => 'app.js' },
      },
    })) as Rollup.RollupOutput[];
    const files = output[0].output;
    const atlas = buildAtlas();
    // Every page, byte for byte.
    for (const [index, built] of atlas.pages.entries()) {
      const page = files.find(
        (f) => f.fileName === `${ATLAS_URL_DIR}/${manifest.pages[index].file}`,
      );
      expect(page?.type).toBe('asset');
      if (page?.type === 'asset') {
        expect(Buffer.compare(Buffer.from(page.source as Uint8Array), built.png)).toBe(0);
      }
    }
    // The manifest, as the pipeline wrote it (so the recorded digest matches the shipped file).
    const json = files.find((f) => f.fileName === ATLAS_MANIFEST_URL);
    expect(json?.type).toBe('asset');
    const shipped = Buffer.from(json?.type === 'asset' ? (json.source as Uint8Array) : []);
    expect(Buffer.compare(shipped, readFileSync(join(generated, 'atlas', 'main.json')))).toBe(0);
    expect(shipped.toString('utf8')).toBe(formatManifest(atlas.manifest));
    const chunk = files.find((f) => f.type === 'chunk');
    expect(chunk?.type).toBe('chunk');
    const code = chunk?.type === 'chunk' ? chunk.code : '';
    const realm = createContext({});
    runInContext(code, realm);
    const assets = runInContext('globalThis.__assets', realm) as Record<string, string>;
    expect(assets).toEqual({
      manifestUrl: ATLAS_MANIFEST_URL,
      atlasDir: ATLAS_URL_DIR,
      manifestDigest: manifestDigest(shipped),
    });
    // No frame data in the script: the ~200 KB manifest left app.js (plan R1-05).
    expect(code).not.toContain('ships/kestrel#0');
    expect(code.length).toBeLessThan(2048);
  }, 60_000);

  it('virtual:shmup-assets-inline still carries the whole manifest in the bundle', async () => {
    const entry = join(tmp, 'entry-inline.js');
    writeFileSync(
      entry,
      "import assets from 'virtual:shmup-assets-inline';\nglobalThis.__assets = assets;\n",
    );
    const output = (await build({
      root: tmp,
      logLevel: 'silent',
      configFile: false,
      plugins: [shmupAssets({ outDir: join(tmp, 'generated-build-inline') })],
      build: {
        write: false,
        lib: { entry, formats: ['iife'], name: 'app', fileName: () => 'app.js' },
      },
    })) as Rollup.RollupOutput[];
    const chunk = output[0].output.find((f) => f.type === 'chunk');
    const realm = createContext({});
    runInContext(chunk?.type === 'chunk' ? chunk.code : '', realm);
    const assets = runInContext('globalThis.__assets', realm) as {
      manifest: typeof manifest;
      pageUrls: string[];
    };
    expect(assets.pageUrls).toEqual(['assets/atlas/main.png']);
    expect(assets.manifest.sprites['ships/kestrel']).toEqual(manifest.sprites['ships/kestrel']);
  }, 60_000);
});

describe('integration: shmupAssets() dev server', () => {
  it('serves atlas files under <base>assets/atlas/ and nothing else from the output dir', async () => {
    const outDir = join(tmp, 'generated-dev');
    const server = await createServer({
      root: tmp,
      configFile: false,
      logLevel: 'silent',
      plugins: [shmupAssets({ outDir })],
      server: { port: 0, strictPort: false, host: '127.0.0.1', ws: false },
    });
    try {
      await server.listen();
      const address = server.httpServer?.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      const base = `http://127.0.0.1:${port}/`;
      const png = await fetch(`${base}${ATLAS_URL_DIR}/main.png`);
      expect(png.status).toBe(200);
      expect(png.headers.get('content-type')).toBe('image/png');
      expect(Buffer.compare(Buffer.from(await png.arrayBuffer()), buildAtlas().pages[0].png)).toBe(
        0,
      );
      // The manifest the shell fetches in dev: the pipeline's bytes, so the module's digest holds.
      const json = await fetch(`${base}${ATLAS_URL_DIR}/main.json?t=1`);
      const served = Buffer.from(await json.arrayBuffer());
      expect(Buffer.compare(served, readFileSync(join(outDir, 'atlas', 'main.json')))).toBe(0);
      expect((JSON.parse(served.toString('utf8')) as typeof manifest).formatVersion).toBe(2);
      const traversal = await fetch(`${base}${ATLAS_URL_DIR}/..%2F.asset-cache.json`);
      expect(traversal.headers.get('content-type')).not.toBe('application/json');
    } finally {
      await server.close();
    }
  }, 60_000);

  it('regenerates on asset-source edits, never in-process on pipeline edits', async () => {
    const outDir = join(tmp, 'generated-watch');
    const warnings: string[] = [];
    const logger = createLogger('silent');
    const server = await createServer({
      root: tmp,
      configFile: false,
      logLevel: 'silent',
      customLogger: {
        ...logger,
        warn: (message) => {
          warnings.push(message);
        },
      },
      plugins: [shmupAssets({ outDir })],
      server: { port: 0, strictPort: false, host: '127.0.0.1', ws: false },
    });
    try {
      await server.listen(); // buildStart generates the atlas
      const manifestFile = join(outDir, 'atlas', 'main.json');
      expect(existsSync(manifestFile)).toBe(true);
      rmSync(manifestFile); // any regeneration would put it back

      // The loaded pipeline code is the old code: regenerating now would store stale pixels.
      // With an inline config no restart is coming, so the plugin asks for one instead.
      server.watcher.emit('change', join(PIPELINE_DIR, 'procedural', 'ui.mjs'));
      expect(existsSync(manifestFile)).toBe(false);
      expect(warnings).toEqual([
        '[shmup:assets] scripts/assets/procedural/ui.mjs changed; restart the dev server to ' +
          'regenerate the atlas with the new pipeline code',
      ]);
      server.watcher.emit('change', join(PIPELINE_DIR, 'README.md')); // not code: silent
      expect(warnings).toHaveLength(1);
      expect(existsSync(manifestFile)).toBe(false);

      server.watcher.emit(
        'change',
        join(DEFAULT_SOURCE_DIR, 'sprites', 'items', 'bonus.sprite.json'),
      );
      expect(existsSync(manifestFile)).toBe(true);
    } finally {
      await server.close();
    }
  }, 60_000);
});

describe('integration: asset pipeline wiring', () => {
  it.each([['apps/web'], ['apps/tizen']])(
    '%s builds with shmupAssets() and types the virtual module',
    (app) => {
      const config = text(`${app}/vite.config.ts`);
      expect(config).toMatch(
        /import \{[^}]*\bshmupAssets\b[^}]*\} from '\.\.\/\.\.\/vite\.shared\.js'/,
      );
      expect(config).toMatch(/plugins:\s*\[[^\]]*\bshmupAssets\(\)/);
    },
  );

  it('declares virtual:shmup-assets for the apps and virtual:shmup-assets-inline', () => {
    const types = text('types/virtual-modules.d.ts');
    expect(types).toContain("declare module 'virtual:shmup-assets' {");
    expect(types).toContain("declare module 'virtual:shmup-assets-inline' {");
  });

  it.each([['apps/web'], ['apps/tizen'], ['apps/webos']])(
    '%s imports the fetched manifest (virtual:shmup-assets), not the inlined one',
    (app) => {
      const main = text(`${app}/src/main.ts`);
      expect(main).toContain("import assets from 'virtual:shmup-assets';");
      expect(main).not.toMatch(/from 'virtual:shmup-assets-inline'/);
    },
  );

  it('runs //#assets before build and dev, with sources as inputs and generated/ as outputs', () => {
    const turbo = JSON.parse(text('turbo.json')) as {
      globalDependencies: string[];
      tasks: Record<string, { dependsOn?: string[]; inputs?: string[]; outputs?: string[] }>;
    };
    expect(turbo.tasks.build.dependsOn).toContain('//#assets');
    expect(turbo.tasks.dev.dependsOn).toContain('//#assets');
    expect(turbo.tasks['test:e2e'].dependsOn).toContain('//#assets');
    expect(turbo.tasks['//#assets'].inputs).toEqual(
      expect.arrayContaining(['assets/source/**', 'scripts/assets/**']),
    );
    expect(turbo.tasks['//#assets'].outputs).toEqual(['assets/generated/**']);
    expect(turbo.globalDependencies).toEqual(
      expect.arrayContaining(['assets/source/**', 'scripts/assets/**']),
    );
    const scripts = (JSON.parse(text('package.json')) as { scripts: Record<string, string> })
      .scripts;
    expect(scripts.assets).toBe('node scripts/generate-assets.mjs');
  });

  it('keeps generated assets out of git and the pixel-art sources out of Prettier', () => {
    expect(text('.gitignore')).toContain('assets/generated/*');
    expect(text('.prettierignore').split('\n')).toContain('assets/source/');
  });
});
