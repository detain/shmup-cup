/**
 * Unit tests for apps/tizen/vite.config.ts (the Chromium 69 build settings and the
 * classic-script rewrite plugin) and for the hand-written globalThis polyfill.
 */
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { parse } from 'acorn';
import type { IndexHtmlTransformHook, Plugin, UserConfig } from 'vite';
import { describe, expect, it } from 'vitest';
import viteConfig from '../../vite.config.js';

const config: UserConfig = viteConfig;
const polyfill = readFileSync(new URL('../../polyfills/global-this.js', import.meta.url), 'utf8');

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
  expect(plugin?.apply).toBe('build');
  const hook = plugin?.transformIndexHtml as { order: string; handler: IndexHtmlTransformHook };
  expect(hook.order).toBe('post');
  return (html) => hook.handler.call({} as never, html, {} as never) as string;
}

describe('tizen/vite.config classic-script plugin', () => {
  const rewrite = classicScriptHandler();

  it("rewrites Vite's module script into a deferred classic script", () => {
    expect(rewrite('<head><script type="module" crossorigin src="./app.js"></script></head>')).toBe(
      '<head><script defer src="./app.js"></script></head>',
    );
  });

  it('handles any attribute order and crossorigin="…" values', () => {
    expect(rewrite('<script crossorigin="anonymous" type="module" src="./app.js"></script>')).toBe(
      '<script defer src="./app.js"></script>',
    );
    expect(rewrite('<script src="./app.js" type="module"></script>')).toBe(
      '<script defer src="./app.js"></script>',
    );
  });

  it('leaves classic scripts and other markup untouched', () => {
    const html = '<script src="./legacy.js"></script><div data-crossorigin="x"></div>';
    expect(rewrite(html)).toBe(html);
  });

  it('rewrites every module script tag', () => {
    const html =
      '<script type="module" src="./a.js"></script>\n<script type="module" crossorigin src="./b.js"></script>';
    expect(rewrite(html)).toBe(
      '<script defer src="./a.js"></script>\n<script defer src="./b.js"></script>',
    );
  });
});

describe('tizen/vite.config build settings (Tizen 5.5 = Chromium 69)', () => {
  const build = config.build ?? {};

  it('lowers syntax for Chrome 69 and ES2018', () => {
    expect(build.target).toEqual(['chrome69', 'es2018']);
  });

  it('emits one IIFE named app.js with no code splitting or module preload', () => {
    expect(build.modulePreload).toBe(false);
    expect(build.cssCodeSplit).toBe(false);
    const output = build.rolldownOptions?.output;
    expect(Array.isArray(output)).toBe(false);
    const single = output as Record<string, unknown>;
    expect(single.format).toBe('iife');
    expect(single.codeSplitting).toBe(false);
    expect(single.entryFileNames).toBe('app.js');
  });

  it('prepends the globalThis polyfill verbatim as the post-minification banner', () => {
    const output = build.rolldownOptions?.output as Record<string, unknown>;
    expect(output.postBanner).toBe(polyfill);
  });

  it('uses a relative base so the packaged widget loads from any install path', () => {
    expect(config.base).toBe('./');
  });
});

describe('tizen/polyfills/global-this.js', () => {
  /**
   * Runs the polyfill in a fresh V8 realm, like Chromium 69 would.
   *
   * @param setup - Globals to install first; `globalThis: false` removes the built-in
   *   `globalThis` (Chrome 69 predates it).
   * @returns The realm's global object.
   */
  function runPolyfill(setup: {
    globalThis: boolean;
    self?: object;
    window?: object;
  }): Record<string, unknown> {
    const realm = createContext({}) as Record<string, unknown>;
    if (!setup.globalThis) runInContext('delete globalThis.globalThis;', realm);
    if (setup.self !== undefined) realm.self = setup.self;
    if (setup.window !== undefined) realm.window = setup.window;
    runInContext(polyfill, realm);
    return realm;
  }

  it('is plain ES5 (it runs before any lowered code)', () => {
    expect(() => parse(polyfill, { ecmaVersion: 5, sourceType: 'script' })).not.toThrow();
  });

  it('does nothing when globalThis already exists', () => {
    const win: Record<string, unknown> = {};
    runPolyfill({ globalThis: true, window: win });
    expect('globalThis' in win).toBe(false);
  });

  it('defines globalThis on self first (workers and windows both have it)', () => {
    const selfObj: Record<string, unknown> = {};
    const win: Record<string, unknown> = {};
    runPolyfill({ globalThis: false, self: selfObj, window: win });
    expect(selfObj.globalThis).toBe(selfObj);
    expect('globalThis' in win).toBe(false);
  });

  it('falls back to window', () => {
    const win: Record<string, unknown> = {};
    runPolyfill({ globalThis: false, window: win });
    expect(win.globalThis).toBe(win);
  });

  it('falls back to the global this in a bare script realm, as a non-enumerable writable property', () => {
    const realm = runPolyfill({ globalThis: false });
    expect(runInContext('globalThis === this', realm)).toBe(true);
    const descriptor = runInContext(
      'Object.getOwnPropertyDescriptor(this, "globalThis")',
      realm,
    ) as PropertyDescriptor;
    expect(descriptor).toMatchObject({ writable: true, configurable: true, enumerable: false });
  });
});
