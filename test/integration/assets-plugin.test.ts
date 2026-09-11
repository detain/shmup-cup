/**
 * The `shmupAssets()` Vite plugin and how the asset pipeline is wired into the repo:
 * `virtual:shmup-assets` inlines the manifest with relative page URLs (decision D25), a
 * real IIFE build emits the atlas pages into `assets/atlas/`, the dev server serves them
 * and regenerates on source edits, both apps use the plugin, and Turborepo runs
 * `//#assets` before `build` / `dev` with the right inputs and outputs.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';
import { build, createServer, type Rollup } from 'vite';
import { afterAll, describe, expect, it } from 'vitest';
import { buildAtlas } from '../../scripts/assets/pipeline.mjs';
import { ASSETS_MODULE_ID, ATLAS_URL_DIR, shmupAssets } from '../../vite.shared.js';

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

describe('integration: shmupAssets() virtual module', () => {
  const outDir = join(tmp, 'generated');
  const plugin = shmupAssets({ outDir });

  it('claims only its own virtual id', () => {
    expect(hook(plugin, 'resolveId', ASSETS_MODULE_ID)).toBe('\0' + ASSETS_MODULE_ID);
    expect(hook(plugin, 'resolveId', 'virtual:shmup-content')).toBeNull();
    expect(hook(plugin, 'load', 'other')).toBeNull();
  });

  it('inlines the manifest and relative page URLs (generating the atlas on demand)', () => {
    const code = hook(plugin, 'load', '\0' + ASSETS_MODULE_ID) as string;
    const realm = createContext({});
    const exported = runInContext(
      `(() => { ${code.replace(/export const /g, 'const ').replace('export default', 'return')} })()`,
      realm,
    ) as { manifest: typeof manifest; pageUrls: string[] };
    expect(exported.manifest).toEqual(manifest);
    expect(exported.pageUrls).toEqual([`${ATLAS_URL_DIR}/main.png`]);
    for (const url of exported.pageUrls) expect(url.startsWith('/')).toBe(false);
    expect(readFileSync(join(outDir, 'atlas', 'main.json'), 'utf8')).toContain(
      '"formatVersion": 1',
    );
  });
});

describe('integration: a real Vite build through shmupAssets()', () => {
  it('emits the pages into assets/atlas/ and the IIFE bundle carries the manifest', async () => {
    const entry = join(tmp, 'entry.js');
    writeFileSync(
      entry,
      "import assets from 'virtual:shmup-assets';\nglobalThis.__assets = assets;\n",
    );
    const output = (await build({
      root: tmp,
      logLevel: 'silent',
      configFile: false,
      plugins: [shmupAssets({ outDir: join(tmp, 'generated-build') })],
      build: {
        write: false,
        lib: { entry, formats: ['iife'], name: 'app', fileName: () => 'app.js' },
      },
    })) as Rollup.RollupOutput[];
    const files = output[0].output;
    const page = files.find((f) => f.fileName === `${ATLAS_URL_DIR}/main.png`);
    expect(page?.type).toBe('asset');
    if (page?.type === 'asset') {
      expect(
        Buffer.compare(Buffer.from(page.source as Uint8Array), buildAtlas().pages[0].png),
      ).toBe(0);
    }
    const chunk = files.find((f) => f.type === 'chunk');
    expect(chunk?.type).toBe('chunk');
    const realm = createContext({});
    if (chunk?.type === 'chunk') runInContext(chunk.code, realm);
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
      const json = await fetch(`${base}${ATLAS_URL_DIR}/main.json?t=1`);
      expect(((await json.json()) as typeof manifest).formatVersion).toBe(1);
      const traversal = await fetch(`${base}${ATLAS_URL_DIR}/..%2F.asset-cache.json`);
      expect(traversal.headers.get('content-type')).not.toBe('application/json');
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

  it('declares virtual:shmup-assets for the apps', () => {
    expect(text('types/virtual-modules.d.ts')).toContain("declare module 'virtual:shmup-assets'");
  });

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
