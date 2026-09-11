/**
 * Proves the ESLint flat config enforces the architecture rules on virtual files:
 * packages/core stays free of DOM / WebGL / audio / Node / platform APIs, clocks,
 * Math.random and the engine-dependent transcendentals (Math.sin & friends, `**`);
 * runtime code shipped to Tizen 5.5 is limited to Chromium 69 APIs; the web dev app may
 * use import.meta; tests may use Node.
 *
 * Type-aware rules are switched off for these virtual files (they are not on disk, so the
 * TypeScript project service cannot load them); every rule checked here is syntactic.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import { beforeAll, describe, expect, it } from 'vitest';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
let eslint: ESLint;

beforeAll(() => {
  eslint = new ESLint({ cwd: repo, overrideConfig: [tseslint.configs.disableTypeChecked] });
});

/**
 * Lints `code` as if it lived at `filePath` and returns `ruleId` of every message,
 * ignoring the docblock rule (the snippets are intentionally undocumented).
 *
 * @param filePath - Repo-relative virtual path.
 * @param code - Source text.
 */
async function rulesFor(filePath: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: join(repo, filePath) });
  const messages = result?.messages ?? [];
  const fatal = messages.filter((message) => message.fatal === true);
  expect(fatal, JSON.stringify(fatal)).toEqual([]);
  return messages
    .map((message) => message.ruleId ?? 'null')
    .filter((rule) => rule !== 'jsdoc/require-jsdoc');
}

const CORE = 'packages/core/src/__lint_probe__.ts';
const RUNTIME = 'packages/render-pixi/src/__lint_probe__.ts';
const TIZEN = 'apps/tizen/src/__lint_probe__.ts';
const WEB = 'apps/web/src/__lint_probe__.ts';

describe('eslint: packages/core purity', () => {
  it.each([
    ['window', 'export const a = window.innerWidth;'],
    ['document', "export const a = document.getElementById('game');"],
    ['navigator', 'export const a = navigator.getGamepads();'],
    ['requestAnimationFrame', 'requestAnimationFrame(() => {});'],
    ['WebGL', 'export const a = WebGLRenderingContext.TRIANGLES;'],
    ['Web Audio', 'export const a = new AudioContext();'],
    ['localStorage', "export const a = localStorage.getItem('x');"],
    ['Node process', 'export const a = process.env.HOME;'],
    ['Node Buffer', "export const a = Buffer.from('x');"],
    ['timers', 'setTimeout(() => {}, 0);'],
    ['fetch', "void fetch('x');"],
  ])('forbids the %s global', async (_label, code) => {
    expect(await rulesFor(CORE, code)).toContain('no-restricted-globals');
  });

  it.each([
    ['PixiJS', "import { Sprite } from 'pixi.js';"],
    ['a Pixi subpath', "import { x } from 'pixi.js/advanced';"],
    ['howler', "import { Howl } from 'howler';"],
    ['Electron', "import { app } from 'electron';"],
    ['a Node built-in', "import { readFileSync } from 'node:fs';"],
    ['a bare Node built-in', "import { join } from 'path';"],
    ['another workspace package', "import { createWebInput } from '@shmup/input-web';"],
    ['Tizen APIs', "import api from 'tizen-api';"],
    ['Samsung webapis', "import webapis from '$WEBAPIS/webapis/webapis';"],
  ])('forbids importing %s', async (_label, code) => {
    expect(await rulesFor(CORE, code)).toContain('no-restricted-imports');
  });

  it.each([
    ['Math.random', 'export const a = Math.random();'],
    ['Date.now', 'export const a = Date.now();'],
  ])('forbids the non-deterministic %s', async (_label, code) => {
    expect(await rulesFor(CORE, code)).toContain('no-restricted-properties');
  });

  it.each([
    ['Math.sin', 'export const a = Math.sin(1);'],
    ['Math.cos', 'export const a = Math.cos(1);'],
    ['Math.tan', 'export const a = Math.tan(1);'],
    ['Math.asin', 'export const a = Math.asin(1);'],
    ['Math.acos', 'export const a = Math.acos(1);'],
    ['Math.atan', 'export const a = Math.atan(1);'],
    ['Math.atan2', 'export const a = Math.atan2(1, 2);'],
    ['Math.exp', 'export const a = Math.exp(1);'],
    ['Math.log', 'export const a = Math.log(1);'],
    ['Math.pow', 'export const a = Math.pow(2, 3);'],
    ['Math.hypot', 'export const a = Math.hypot(3, 4);'],
    ['Math.cbrt', 'export const a = Math.cbrt(8);'],
  ])('forbids the engine-dependent %s (use core/math tables)', async (_label, code) => {
    expect(await rulesFor(CORE, code)).toContain('no-restricted-properties');
  });

  it.each([
    ['the ** operator', 'export const a = 2 ** 3;'],
    ['the **= operator', 'export let a = 2;\na **= 3;'],
  ])('forbids %s', async (_label, code) => {
    expect(await rulesFor(CORE, code)).toContain('no-restricted-syntax');
  });

  it('allows the exactly specified IEEE operations', async () => {
    const code =
      'export const a = Math.sqrt(2) + Math.floor(1.5) * Math.abs(-1) - Math.round(0.5);';
    expect(await rulesFor(CORE, code)).toEqual([]);
  });

  it('leaves Math.sin alone outside packages/core', async () => {
    expect(await rulesFor(RUNTIME, 'export const a = Math.sin(1);')).toEqual([]);
  });

  it('forbids performance.now (both as a global and as a clock)', async () => {
    const rules = await rulesFor(CORE, 'export const a = performance.now();');
    expect(rules).toContain('no-restricted-globals');
    expect(rules).toContain('no-restricted-properties');
  });

  it('forbids console output', async () => {
    expect(await rulesFor(CORE, "console.log('x');")).toContain('no-console');
  });

  it('still applies the Chrome 69 restrictions', async () => {
    expect(await rulesFor(CORE, "export const a = Object.hasOwn({}, 'x');")).toContain(
      'no-restricted-properties',
    );
    expect(await rulesFor(CORE, "export const a = 'ab'.replaceAll('a', 'b');")).toContain(
      'no-restricted-syntax',
    );
  });

  it('allows plain ES2018 simulation code', async () => {
    const code = [
      'export const table = new Float32Array(256);',
      'export const ids = new Map<number, string>();',
      'export const done = Promise.resolve(Math.floor(Math.sqrt(2) * 100));',
      'export const frozen = Object.freeze({ a: [1, 2, 3].map((n) => n * 2) });',
      'export const bits = new Int16Array(16).fill(0);',
    ].join('\n');
    expect(await rulesFor(CORE, code)).toEqual([]);
  });

  it('allows relative imports inside the core', async () => {
    expect(
      await rulesFor(
        CORE,
        "import { Action } from './input/index.js';\nexport const a = Action.Up;",
      ),
    ).toEqual([]);
  });
});

describe('eslint: runtime code is limited to Chromium 69 (Tizen 5.5)', () => {
  it.each([
    [
      'Object.hasOwn (Chrome 93)',
      "export const a = Object.hasOwn({}, 'x');",
      'no-restricted-properties',
    ],
    [
      'Object.fromEntries (Chrome 73)',
      'export const a = Object.fromEntries([]);',
      'no-restricted-properties',
    ],
    [
      'Promise.allSettled (Chrome 76)',
      'export const a = Promise.allSettled([]);',
      'no-restricted-properties',
    ],
    ['Promise.any (Chrome 85)', 'export const a = Promise.any([]);', 'no-restricted-properties'],
    [
      'String.replaceAll (Chrome 85)',
      "export const a = 'x'.replaceAll('x', 'y');",
      'no-restricted-syntax',
    ],
    ['Array.at (Chrome 92)', 'export const a = [1].at(0);', 'no-restricted-syntax'],
    [
      'structuredClone (Chrome 98)',
      'export const a = structuredClone({});',
      'no-restricted-syntax',
    ],
    [
      'import.meta (not in a classic script)',
      'export const a = import.meta.url;',
      'no-restricted-syntax',
    ],
    ['queueMicrotask (Chrome 71)', 'queueMicrotask(() => {});', 'compat/compat'],
    ['String.matchAll (Chrome 73)', "export const a = 'ab'.matchAll(/a/g);", 'compat/compat'],
    ['WeakRef (Chrome 84)', 'export const a = new WeakRef({});', 'compat/compat'],
  ])('flags %s', async (_label, code, rule) => {
    expect(await rulesFor(RUNTIME, code)).toContain(rule);
  });

  it('applies the same rules to the Tizen app sources', async () => {
    expect(await rulesFor(TIZEN, 'export const a = import.meta.url;')).toContain(
      'no-restricted-syntax',
    );
    expect(await rulesFor(TIZEN, 'queueMicrotask(() => {});')).toContain('compat/compat');
  });

  it('accepts APIs Chrome 69 has, and globalThis (polyfilled in the Tizen bundle)', async () => {
    const code = [
      'export const flat = [1, [2]].flat();',
      'export const entries = Object.entries({ a: 1 });',
      'export const observer = new ResizeObserver(() => {});',
      'export const root = globalThis;',
      'export const pads = navigator.getGamepads();',
    ].join('\n');
    expect(await rulesFor(RUNTIME, code)).toEqual([]);
  });

  it('lets the Vite-served web dev app use import.meta', async () => {
    expect(await rulesFor(WEB, 'export const url: string = import.meta.url;')).toEqual([]);
  });

  it('requires docblocks on exported runtime symbols', async () => {
    const [result] = await eslint.lintText('export function undocumented(): void {}\n', {
      filePath: join(repo, RUNTIME),
    });
    expect(result?.messages.map((message) => message.ruleId)).toContain('jsdoc/require-jsdoc');
    const [documented] = await eslint.lintText(
      '/** Does nothing. */\nexport function documented(): void {}\n',
      { filePath: join(repo, RUNTIME) },
    );
    expect(documented?.messages).toEqual([]);
  });
});

describe('eslint: Node-side files', () => {
  it('lets tests and scripts use Node globals and built-ins', async () => {
    const code =
      "import { readFileSync } from 'node:fs';\nexport const a = [process.cwd(), readFileSync];";
    expect(await rulesFor('packages/core/test/__lint_probe__.ts', code)).toEqual([]);
    expect(await rulesFor('scripts/__lint_probe__.mjs', code)).toEqual([]);
  });

  it('ignores tools/ (standalone projects with their own lint setup)', async () => {
    expect(await eslint.isPathIgnored(join(repo, 'tools/input-probe/src/main.ts'))).toBe(true);
    expect(await eslint.isPathIgnored(join(repo, 'packages/core/dist/index.js'))).toBe(true);
    expect(await eslint.isPathIgnored(join(repo, 'packages/core/src/index.ts'))).toBe(false);
  });
});
