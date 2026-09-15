/**
 * Build-output test for the browser app: the production build must be relocatable
 * (relative asset URLs), because apps/electron serves it from `app://game/` and it may be
 * hosted on a sub-path.
 */
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, type UserConfig } from 'vite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import viteConfig from '../../vite.config.js';

const appDir = fileURLToPath(new URL('../../', import.meta.url));
let outDir = '';
let html = '';

beforeAll(async () => {
  outDir = mkdtempSync(join(tmpdir(), 'shmup-web-build-'));
  vi.stubEnv('NODE_ENV', 'production');
  try {
    await build({
      root: appDir,
      configFile: join(appDir, 'vite.config.ts'),
      mode: 'production',
      logLevel: 'silent',
      build: { outDir, emptyOutDir: true, sourcemap: false },
    });
  } finally {
    vi.unstubAllEnvs();
  }
  html = readFileSync(join(outDir, 'index.html'), 'utf8');
}, 120_000);

afterAll(() => {
  if (outDir !== '') rmSync(outDir, { recursive: true, force: true });
});

describe('web/vite.config', () => {
  it('uses a relative base and resolves workspace packages to their sources', () => {
    const config: UserConfig = viteConfig;
    expect(config.base).toBe('./');
    expect(config.resolve?.conditions?.[0]).toBe('@shmup/source');
  });
});

describe('web build output', () => {
  it('references every asset with a relative URL', () => {
    const urls = [...html.matchAll(/\b(?:src|href)="([^"]+)"/g)].map((match) => match[1]);
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) expect(url.startsWith('./')).toBe(true);
  });

  it('emits the entry script the page loads and keeps the game canvas', () => {
    const script = /<script[^>]*\bsrc="\.\/([^"]+)"/.exec(html)?.[1];
    expect(script).toBeDefined();
    expect(readdirSync(join(outDir, 'assets'))).toContain(script?.replace(/^assets\//, ''));
    expect(html).toContain('<canvas id="game"></canvas>');
  });

  it('ships the atlas pages under assets/atlas/ with fixed names (shmupAssets())', () => {
    expect(readdirSync(join(outDir, 'assets', 'atlas'))).toContain('main.png');
    const png = readFileSync(join(outDir, 'assets', 'atlas', 'main.png'));
    expect([...png.subarray(1, 4)].map((c) => String.fromCharCode(c)).join('')).toBe('PNG');
  });

  it('leaves the dev-only tools out of the release bundle: no debug API, no determinism check', () => {
    const scripts = readdirSync(join(outDir, 'assets')).filter((name) => name.endsWith('.js'));
    expect(scripts.length).toBeGreaterThan(0);
    for (const name of scripts) {
      const code = readFileSync(join(outDir, 'assets', name), 'utf8');
      expect(code, name).not.toContain('__shmupDebug');
      expect(code, name).not.toContain('__shmupDeterminism');
    }
  });
});
