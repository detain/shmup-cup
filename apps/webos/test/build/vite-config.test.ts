/**
 * `apps/webos/vite.config.ts` (plan M3-03): the Chromium-68-safe build settings and the
 * classic-script rewrite, which the webOS app needs for the same reasons the Tizen one does.
 *
 * @module
 */
import type { IndexHtmlTransformHook, Plugin, UserConfig } from 'vite';
import { describe, expect, it } from 'vitest';
import viteConfig from '../../vite.config.js';

const config: UserConfig = viteConfig;

/** @returns The `transformIndexHtml` handler of the classic-script plugin. */
function classicScriptHandler(): (html: string) => string {
  const plugin = (config.plugins ?? []).find(
    (candidate): candidate is Plugin =>
      typeof candidate === 'object' &&
      candidate !== null &&
      'name' in candidate &&
      candidate.name === 'shmup:classic-script-tag',
  );
  expect(plugin).toBeDefined();
  const hook = plugin?.transformIndexHtml as { order: string; handler: IndexHtmlTransformHook };
  return (html) => hook.handler.call({} as never, html, {} as never) as string;
}

describe('webos/vite.config (M3-03)', () => {
  it('builds one classic ES2018 IIFE named app.js, with relative URLs', () => {
    expect(config.base).toBe('./');
    expect(config.build?.target).toEqual(['chrome69', 'es2018']);
    expect(config.build?.modulePreload).toBe(false);
    expect(config.build?.assetsInlineLimit).toBe(0);
    expect(config.build?.sourcemap).toBe(false);
    const output = config.build?.rolldownOptions?.output as Record<string, unknown>;
    expect(output).toMatchObject({
      format: 'iife',
      codeSplitting: false,
      entryFileNames: 'app.js',
      assetFileNames: 'assets/[name][extname]',
    });
  });

  it('prepends the Tizen app’s globalThis polyfill — the two TVs share the one file', () => {
    const output = config.build?.rolldownOptions?.output as { postBanner: string };
    expect(output.postBanner).toMatch(/^\/\* Shmup Cup — globalThis polyfill/);
  });

  it('rewrites Vite’s module script into a deferred classic script', () => {
    const rewrite = classicScriptHandler();
    expect(rewrite('<head><script type="module" crossorigin src="./app.js"></script></head>')).toBe(
      '<head><script defer src="./app.js"></script></head>',
    );
    const classic = '<script src="./legacy.js"></script>';
    expect(rewrite(classic)).toBe(classic);
  });

  it('serves the dev server on its own port (5173 web, 5174 tizen, 5175 webos)', () => {
    expect(config.server?.port).toBe(5175);
  });
});
