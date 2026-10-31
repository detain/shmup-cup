/**
 * Unit tests for the hand-written matchAll polyfill
 * (`apps/tizen/polyfills/string-match-all.js`) — the ES5 file both TV bundles prepend
 * because PixiJS 8.22 calls `String.prototype.matchAll` (Chrome 73) in the GLSL
 * sampler-precision parse at renderer init, while the TVs stop at Chromium 68/69 (w14).
 *
 * Each test runs the file verbatim in a fresh `node:vm` realm stripped of `matchAll` —
 * the state of a TV engine — and checks the behaviour the native method has there:
 * capture-group walks, empty-match stepping, the clone's inherited `lastIndex`, the
 * non-global `TypeError` with V8's own message. The Node realm ships
 * `RegExp.prototype[Symbol.matchAll]` too, and its delegation would bypass the
 * polyfill, so the realm deletes it as well (Chrome 68/69 has neither).
 */
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { parse } from 'acorn';
import { describe, expect, it } from 'vitest';
import { MATCH_ALL_BANNER } from '../../scripts/check-bundle.mjs';

const polyfill = readFileSync(
  new URL('../../polyfills/string-match-all.js', import.meta.url),
  'utf8',
);

/** PixiJS 8.22's declared-sampler pattern (pixi.mjs `ensureSamplerPrecision`), verbatim source. */
const DECLARED_PATTERN = String.raw`\bprecision\s+\w+\s+([iu]?sampler\w+)\s*;`;

/** PixiJS 8.22's unqualified-sampler pattern, verbatim source. */
const UNQUALIFIED_PATTERN = String.raw`\buniform\s+([iu]?sampler\w+)`;

/** A GLSL body shaped like Pixi's own shader sources: declared and unqualified samplers. */
const GLSL_CORPUS = [
  'precision mediump float;',
  'uniform sampler2D t;',
  'precision highp sampler2D;',
  'uniform isampler3D i;',
  'uniform vec3 v;',
].join('\n');

/**
 * The API-name shapes `test/integration/tv-engine-floor.test.ts` greps the shipped
 * sources for — the same list the built TV bundles are audited with (the shared
 * `scripts/too-new-apis.mjs` `TOO_NEW_APIS` needles, written out here as bare
 * shapes). The polyfill is prepended to the bundles verbatim, so it must carry
 * none of them, not even in prose.
 */
const BANNED_SHAPES = [
  '.flat(',
  '.flatMap(',
  'Object.fromEntries',
  'Object.hasOwn',
  'Promise.allSettled',
  'Promise.any',
  '.replaceAll(',
  '.matchAll(',
  'structuredClone',
  'queueMicrotask',
  'WeakRef',
  'FinalizationRegistry',
  '.at(',
];

/**
 * A realm without `matchAll` on String and without the engine's `@@matchAll` on RegExp —
 * the state of Chromium 68/69 — with the polyfill applied.
 *
 * @returns The realm's global object.
 */
function newTvRealm(): Record<string, unknown> {
  const realm = createContext({}) as Record<string, unknown>;
  runInContext(
    'delete String.prototype.matchAll; delete RegExp.prototype[Symbol.matchAll];',
    realm,
  );
  runInContext(polyfill, realm);
  return realm;
}

/**
 * Runs a function body in the realm as one call.
 *
 * @param realm - A realm from {@link newTvRealm}.
 * @param body - Statements ending in a `return`.
 * @returns What the body returned, across the realm boundary.
 */
function evalInRealm<T>(realm: Record<string, unknown>, body: string): T {
  return runInContext(`(function () { ${body} })()`, realm) as T;
}

/**
 * A global-flags RegExp of the pattern source, built inside the realm.
 *
 * @param source - The pattern source text.
 * @param flags - The flags, `g` included.
 * @returns The realm-side code constructing it.
 */
function realmRegExp(source: string, flags = 'g'): string {
  return `new RegExp(${JSON.stringify(source)}, ${JSON.stringify(flags)})`;
}

describe('tizen/polyfills/string-match-all.js', () => {
  it('is plain ES5 (it runs before any lowered code)', () => {
    expect(() => parse(polyfill, { ecmaVersion: 5, sourceType: 'script' })).not.toThrow();
  });

  it('opens with the banner the bundle checks look for', () => {
    expect(polyfill.startsWith(MATCH_ALL_BANNER)).toBe(true);
  });

  it('carries none of the API-name shapes the built bundles are grepped for', () => {
    for (const shape of BANNED_SHAPES) expect(polyfill).not.toContain(shape);
  });

  it('does nothing when the engine already has the method', () => {
    const realm = createContext({}) as Record<string, unknown>;
    runInContext('var before = String.prototype.matchAll;', realm);
    runInContext(polyfill, realm);
    expect(runInContext('String.prototype.matchAll === before', realm)).toBe(true);
  });

  it('reproduces PixiJS declared-sampler walk', () => {
    const walk = evalInRealm<string[]>(
      newTvRealm(),
      `var src = ${JSON.stringify(GLSL_CORPUS)};
       var declaredSamplerPattern = ${realmRegExp(DECLARED_PATTERN)};
       var done = new Set();
       for (const [, type] of src.matchAll(declaredSamplerPattern)) done.add(type);
       return Array.from(done);`,
    );
    expect(walk).toEqual(['sampler2D']);
  });

  it('reproduces the PixiJS unqualified-sampler walk', () => {
    const walk = evalInRealm<string[]>(
      newTvRealm(),
      `var src = ${JSON.stringify(GLSL_CORPUS)};
       var unqualifiedSamplerPattern = ${realmRegExp(UNQUALIFIED_PATTERN)};
       var out = [];
       for (const [, type] of src.matchAll(unqualifiedSamplerPattern)) out.push(type);
       return out;`,
    );
    expect(walk).toEqual(['sampler2D', 'isampler3D']);
  });

  it('yields full exec results, groups and index included', () => {
    const seen = evalInRealm<unknown[]>(
      newTvRealm(),
      `var out = [];
       for (var m of 'a1b2'.matchAll(${realmRegExp('(?<d>[0-9])')})) out.push([m[0], m.index, m.groups.d]);
       return out;`,
    );
    expect(seen).toEqual([
      ['1', 1, '1'],
      ['2', 3, '2'],
    ]);
  });

  it('steps lastIndex past an empty match, so the walk always ends', () => {
    const realm = newTvRealm();
    const seen = evalInRealm<unknown[]>(
      realm,
      `var out = [];
       for (var m of 'ab'.matchAll(${realmRegExp('a*')})) out.push([m[0], m.index]);
       return out;`,
    );
    expect(seen).toEqual([
      ['a', 0],
      ['', 1],
      ['', 2],
    ]);
  });

  it('stays done after the walk ran out (no infinite loop)', () => {
    const record = evalInRealm<[boolean, boolean]>(
      newTvRealm(),
      `var it = 'ab'.matchAll(${realmRegExp('a*')});
       while (!it.next().done) { /* drain */ }
       return [it.next().done, it.next().done];`,
    );
    expect(record).toEqual([true, true]);
  });

  it('walks the empty pattern over every position', () => {
    const seen = evalInRealm<number[]>(
      newTvRealm(),
      `var out = [];
       for (var m of 'ab'.matchAll(${realmRegExp('(?:)')})) out.push(m.index);
       return out;`,
    );
    expect(seen).toEqual([0, 1, 2]);
  });

  it('steps a whole code point when the regexp is a unicode regexp', () => {
    const seen = evalInRealm<number[]>(
      newTvRealm(),
      `var out = [];
       for (var m of '\\ud83d\\ude00a'.matchAll(${realmRegExp('(?:)', 'gu')})) out.push(m.index);
       return out;`,
    );
    expect(seen).toEqual([0, 2, 3]);
  });

  it('searches for the empty pattern when given no argument', () => {
    const seen = evalInRealm<unknown[]>(
      newTvRealm(),
      `var out = [];
       for (var m of ''.matchAll()) out.push([m[0], m.index]);
       return out;`,
    );
    expect(seen).toEqual([['', 0]]);
  });

  it('walks a sticky global regexp anchored, one per position', () => {
    const seen = evalInRealm<unknown[]>(
      newTvRealm(),
      `var out = [];
       for (var m of 'aaa'.matchAll(${realmRegExp('a', 'gy')})) out.push([m[0], m.index]);
       return out;`,
    );
    expect(seen).toEqual([
      ['a', 0],
      ['a', 1],
      ['a', 2],
    ]);
  });

  it('treats a string argument as the pattern source of a fresh global regexp', () => {
    const seen = evalInRealm<string[]>(
      newTvRealm(),
      `var out = [];
       for (var m of 'a1b2'.matchAll('[0-9]')) out.push(m[0]);
       return out;`,
    );
    expect(seen).toEqual(['1', '2']);
  });

  it('clones a global argument, starting where the argument stands', () => {
    const seen = evalInRealm<{ pairs: unknown[]; argLastIndex: number }>(
      newTvRealm(),
      `var re = ${realmRegExp('a*')};
       re.lastIndex = 1;
       var pairs = [];
       for (var m of 'ab'.matchAll(re)) pairs.push([m[0], m.index]);
       return { pairs: pairs, argLastIndex: re.lastIndex };`,
    );
    expect(seen.pairs).toEqual([
      ['', 1],
      ['', 2],
    ]);
    expect(seen.argLastIndex).toBe(1); // the walk advanced the clone, never the argument
  });

  it('ends at once when the argument lastIndex sits past the string', () => {
    const count = evalInRealm<number>(
      newTvRealm(),
      `var re = ${realmRegExp('a*')};
       re.lastIndex = 5;
       var count = 0;
       for (var _m of 'ab'.matchAll(re)) count += 1;
       return count;`,
    );
    expect(count).toBe(0);
  });

  it('rejects a non-global regexp with the engine message', () => {
    const thrown = evalInRealm<string>(
      newTvRealm(),
      `try { 'ab'.matchAll(/a/); return 'no throw'; }
       catch (e) { return e.constructor.name + ': ' + e.message; }`,
    );
    expect(thrown).toBe(
      'TypeError: String.prototype.matchAll called with a non-global RegExp argument',
    );
  });

  it('rejects a null receiver', () => {
    const thrown = evalInRealm<string>(
      newTvRealm(),
      `try { String.prototype.matchAll.call(undefined, /a/g); return 'no throw'; }
       catch (e) { return e.constructor.name; }`,
    );
    expect(thrown).toBe('TypeError');
  });

  it('delegates to a regexp-like with a Symbol.matchAll method', () => {
    const delegated = evalInRealm<string>(
      newTvRealm(),
      `var d = {};
       d[Symbol.matchAll] = function (s) { return 'delegated:' + s; };
       return 'xy'.matchAll(d);`,
    );
    expect(delegated).toBe('delegated:xy');
  });

  it('gives an iterator of the engine shape: tag, no return, break leaves it walking', () => {
    const realm = newTvRealm();
    expect(
      evalInRealm<string>(realm, `return Object.prototype.toString.call('ab'.matchAll(/a/g));`),
    ).toBe('[object RegExp String Iterator]');
    expect(evalInRealm<string>(realm, `return typeof 'ab'.matchAll(/a/g).return;`)).toBe(
      'undefined',
    );
    const resumed = evalInRealm<unknown[]>(
      realm,
      `var it = 'ab'.matchAll(${realmRegExp('a*')});
       for (var _m of it) { break; }
       var r = it.next();
       return [r.done, r.value[0], r.value.index];`,
    );
    expect(resumed).toEqual([false, '', 1]); // a for-of break left the walk resumable, as native
  });

  it('defines the method non-enumerably, writable and configurable like the native one', () => {
    const descriptor = evalInRealm<PropertyDescriptor>(
      newTvRealm(),
      `return Object.getOwnPropertyDescriptor(String.prototype, 'matchAll');`,
    );
    expect(descriptor).toMatchObject({
      writable: true,
      enumerable: false,
      configurable: true,
    });
    expect(typeof descriptor.value).toBe('function');
  });

  it('defines Symbol.matchAll on a realm that lacks the well-known symbol', () => {
    const realm = createContext({}) as Record<string, unknown>;
    runInContext(
      `delete String.prototype.matchAll;
       delete RegExp.prototype[Symbol.matchAll];
       var nativeSymbol = Symbol;
       Symbol = function (description) { return 'sym:' + description; };
       Symbol.iterator = nativeSymbol.iterator;
       Symbol.toStringTag = nativeSymbol.toStringTag;
       Symbol.matchAll = undefined;`,
      realm,
    );
    runInContext(polyfill, realm);
    expect(runInContext('Symbol.matchAll', realm)).toBe('sym:Symbol.matchAll');
    expect(
      runInContext(
        'Object.getOwnPropertyDescriptor(Symbol, "matchAll")',
        realm,
      ) as PropertyDescriptor,
    ).toMatchObject({ writable: false, enumerable: false, configurable: false });
    // …and the method the same file defines works through the fake key, on a real walk.
    expect(
      evalInRealm<unknown[]>(
        realm,
        `var out = [];
         for (var m of 'a1b'.matchAll(${realmRegExp('[0-9]')})) out.push(m[0]);
         return out;`,
      ),
    ).toEqual(['1']);
  });
});
