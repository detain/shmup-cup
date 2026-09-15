/**
 * Build-output integration test: runs the real Vite build of the Tizen app into a
 * temporary folder and checks what would be packaged into the .wgt — one classic IIFE
 * script that parses as ES2018 (Tizen 5.5 = Chromium 69), a deferred classic script tag,
 * the globalThis polyfill running first, and the widget files from public/.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';
import { parse } from 'acorn';
import { build } from 'vite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { POLYFILL_BANNER, checkTizenBundle } from '../../scripts/check-bundle.mjs';
import { buildAtlas } from '../../../../scripts/assets/pipeline.mjs';

const appDir = fileURLToPath(new URL('../../', import.meta.url));
let outDir = '';
let code = '';
let html = '';
/** The atlas the build ships (the pipeline is deterministic, so this equals its output). */
const atlas = buildAtlas();
const { manifest } = atlas;

beforeAll(async () => {
  outDir = mkdtempSync(join(tmpdir(), 'shmup-tizen-build-'));
  // Vitest runs with NODE_ENV=test; build exactly like `pnpm build` does.
  vi.stubEnv('NODE_ENV', 'production');
  try {
    await build({
      root: appDir,
      configFile: join(appDir, 'vite.config.ts'),
      mode: 'production',
      logLevel: 'silent',
      build: { outDir, emptyOutDir: true },
    });
  } finally {
    vi.unstubAllEnvs();
  }
  code = readFileSync(join(outDir, 'app.js'), 'utf8');
  html = readFileSync(join(outDir, 'index.html'), 'utf8');
}, 120_000);

afterAll(() => {
  if (outDir !== '') rmSync(outDir, { recursive: true, force: true });
});

describe('tizen build output (vite build → dist/)', () => {
  it('passes every check of scripts/check-bundle.mjs', () => {
    expect(checkTizenBundle(outDir).problems).toEqual([]);
  });

  it('contains exactly the widget files plus the atlas pages: one script, index.html, config.xml, icon.png, assets/atlas/*.png', () => {
    const pages = manifest.pages.map((page) => `assets/atlas/${page.file}`);
    expect(checkTizenBundle(outDir).files.sort()).toEqual(
      ['app.js', 'config.xml', 'icon.png', 'index.html', ...pages].sort(),
    );
  });

  it('ships the atlas pages byte-identical to the pipeline output (shmupAssets(), D25)', () => {
    for (const page of atlas.pages) {
      const shipped = readFileSync(join(outDir, 'assets', 'atlas', page.file));
      expect(Buffer.compare(shipped, page.png)).toBe(0);
    }
  });

  it('app.js parses with acorn as an ES2018 classic script (no module syntax)', () => {
    const program = parse(code, { ecmaVersion: 2018, sourceType: 'script' });
    const types = program.body.map((statement) => statement.type);
    expect(types).not.toContain('ImportDeclaration');
    expect(types).not.toContain('ExportNamedDeclaration');
    expect(types).not.toContain('ExportDefaultDeclaration');
  });

  it('app.js is a pair of IIFEs (polyfill, then the app) that leak no top-level bindings', () => {
    const program = parse(code, { ecmaVersion: 2018, sourceType: 'script' });
    expect(program.body).toHaveLength(2);
    for (const statement of program.body) {
      expect(statement.type).toBe('ExpressionStatement');
      if (statement.type === 'ExpressionStatement') {
        expect(statement.expression.type).toBe('CallExpression');
      }
    }
  });

  it('starts with the globalThis polyfill banner', () => {
    expect(code.trimStart().startsWith(POLYFILL_BANNER)).toBe(true);
  });

  it('leaves the dev-build debug tools out of the release bundle (plan M1-19)', () => {
    // `__SHMUP_DEV__` is false for `vite build`: main.ts's `__SHMUP_DEV__ ? … : null` folds away and
    // the shell's debug tools, the overlay and the key bindings are never bundled.
    expect(code).not.toContain('__shmupDebug');
    expect(code).not.toContain('debug-overlay');
    expect(code).not.toContain('__SHMUP_DEV__');
    expect(code).not.toContain('__SHMUP_BUILD__');
  });

  it('leaves the cross-engine determinism check out of the TV bundle (plan M2-18)', () => {
    // Only the web app's dev / test builds install it (`?determinism`); the Tizen app never
    // imports it, and the shell's module is tree-shaken away.
    expect(code).not.toContain('__shmupDeterminism');
    expect(code).not.toContain('data-shmup-determinism');
  });

  it('never references import.meta or dynamic import()', () => {
    expect(code).not.toMatch(/\bimport\.meta\b/);
    expect(code).not.toMatch(/\bimport\s*\(/);
  });

  it('index.html loads app.js with exactly one deferred classic script tag', () => {
    const withoutComments = html.replace(/<!--[\s\S]*?-->/g, '');
    const tags = withoutComments.match(/<script\b[^>]*>/g) ?? [];
    expect(tags).toEqual(['<script defer src="./app.js">']);
    expect(withoutComments).not.toMatch(/type="module"/);
    expect(withoutComments).not.toMatch(/crossorigin/);
    expect(withoutComments).not.toMatch(/modulepreload/);
    expect(withoutComments).toContain('<canvas id="game"></canvas>');
  });

  it('copies config.xml verbatim from public/', () => {
    expect(readFileSync(join(outDir, 'config.xml'), 'utf8')).toBe(
      readFileSync(join(appDir, 'public', 'config.xml'), 'utf8'),
    );
  });

  it('runs as a classic script in a Chrome-69-like realm without globalThis up to the app entry', () => {
    // A bare V8 realm with globalThis removed (Chrome 69 predates it) and only the few
    // browser globals PixiJS touches while loading. The bundle must evaluate all of its
    // library code and reach main.ts, which then reports the missing canvas.
    const realm = createContext({});
    runInContext('delete globalThis.globalThis;', realm);
    expect(runInContext('typeof globalThis', realm)).toBe('undefined');
    Object.assign(realm, {
      navigator: {
        userAgent:
          'Mozilla/5.0 (SMART-TV; LINUX; Tizen 5.5) AppleWebKit/537.36 (KHTML, like Gecko) 69.0.3497.106.1/5.5 TV Safari/537.36',
        maxTouchPoints: 0,
        platform: 'Linux',
      },
      document: { getElementById: () => null },
      HTMLCanvasElement: function HTMLCanvasElement() {},
      console: { log() {}, info() {}, warn() {}, error() {} },
    });
    expect(() => {
      runInContext(code, realm, { filename: 'app.js' });
    }).toThrow(/<canvas id="game"> not found/);
    expect(runInContext('typeof globalThis === "object" && globalThis === this', realm)).toBe(true);
  });
});
