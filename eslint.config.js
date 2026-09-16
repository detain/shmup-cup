// @ts-check
/**
 * ESLint flat config for the whole workspace (tools/* excluded — standalone projects).
 *
 * Layers:
 *  1. JS + typescript-eslint recommended (type-aware) for all TS.
 *  2. eslint-plugin-compat (browserslist `chrome >= 69` = Tizen 5.5) for every runtime
 *     source tree that ships to a browser/TV, plus rules banning APIs newer than Chrome 69.
 *  3. TSDoc/JSDoc: exported symbols in runtime sources must carry a docblock.
 *  4. packages/core purity: no DOM/WebGL/audio/Node/platform imports or globals,
 *     no clocks or Math.random in the deterministic simulation.
 *  5. Node-side files (configs, scripts, tests, Electron main).
 */
import js from '@eslint/js';
import compat from 'eslint-plugin-compat';
import jsdoc from 'eslint-plugin-jsdoc';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** Browser-shipped TypeScript sources (checked against Chrome 69). */
const RUNTIME_SOURCES = [
  'packages/*/src/**/*.ts',
  'apps/web/src/**/*.ts',
  'apps/tizen/src/**/*.ts',
  'apps/webos/src/**/*.ts',
];

/** Node-side JS/TS: tool configs and scripts. */
const NODE_FILES = [
  '**/*.config.{js,mjs,ts}',
  'vite.shared.ts',
  'vitest.shared.ts',
  '**/scripts/**/*.{js,mjs}',
  'apps/electron/src/**/*.{ts,cts}',
];

/** Test files (tests live in test/ folders, never next to sources). */
const TEST_FILES = ['**/test/**/*.ts'];

/**
 * Every browser, worker and Node global that is not an ECMAScript built-in.
 * packages/core may not reference any of them.
 */
const platformGlobals = [
  ...new Set([
    ...Object.keys(globals.browser),
    ...Object.keys(globals.worker),
    ...Object.keys(globals.node),
    ...Object.keys(globals.audioWorklet),
  ]),
]
  .filter((name) => !(name in globals.builtin))
  .sort();

export default defineConfig([
  globalIgnores([
    '**/node_modules/',
    '**/dist/',
    '**/coverage/',
    '**/.turbo/',
    'assets/generated/',
    'apps/electron/release/',
    'apps/webos/release/',
    'tools/',
    // Git-ignored agent / editor tooling directories: never ours to lint.
    '.claude/',
    '.caliber/',
    '.playwright-mcp/',
  ]),

  // 1. Baseline for all JS/TS.
  js.configs.recommended,
  {
    files: ['**/*.{ts,cts,mts}'],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      eqeqeq: ['error', 'always'],
    },
  },
  {
    // Config files and plain JS are not part of any tsconfig project: lint them without types.
    files: ['**/*.{js,mjs,cjs}', '**/*.config.ts', 'vite.shared.ts', 'vitest.shared.ts'],
    extends: [tseslint.configs.disableTypeChecked],
  },

  // 2. Runtime code shipped to Chromium 69 (Tizen 5.5).
  {
    files: RUNTIME_SOURCES,
    extends: [compat.configs['flat/recommended']],
    languageOptions: { globals: { ...globals.browser } },
    settings: {
      browsers: ['chrome >= 69'],
      lintAllEsApis: true,
      // Provided by apps/tizen/polyfills/ (prepended to the Tizen bundle).
      polyfills: ['globalThis'],
    },
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'Object',
          property: 'hasOwn',
          message: 'Object.hasOwn needs Chrome 93 (Tizen 5.5 = Chrome 69).',
        },
        {
          object: 'Object',
          property: 'fromEntries',
          message: 'Object.fromEntries needs Chrome 73.',
        },
        {
          object: 'Promise',
          property: 'allSettled',
          message: 'Promise.allSettled needs Chrome 76.',
        },
        { object: 'Promise', property: 'any', message: 'Promise.any needs Chrome 85.' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.property.name='replaceAll']",
          message: 'String.prototype.replaceAll needs Chrome 85 (Tizen 5.5 = Chrome 69).',
        },
        {
          selector: "CallExpression[callee.property.name='at']",
          message: '.at() needs Chrome 92 (Tizen 5.5 = Chrome 69); index directly.',
        },
        {
          selector: "CallExpression[callee.name='structuredClone']",
          message: 'structuredClone needs Chrome 98 (Tizen 5.5 = Chrome 69).',
        },
        {
          selector: 'MetaProperty[meta.name="import"][property.name="meta"]',
          message:
            'import.meta is a syntax error in the classic IIFE script shipped to Tizen; pass values in via config instead.',
        },
        {
          // M3-02b: Tizen 5.5 advances KeyboardEvent.timeStamp in whole seconds only
          // (docs/dev/input-probe-results.md "the probe's own timing verdicts are wrong").
          selector: "MemberExpression[property.name='timeStamp']",
          message:
            'event.timeStamp only advances in whole seconds on Tizen 5.5: measure with the handler clock (performance.now()) or count ticks instead.',
        },
      ],
    },
  },
  {
    // Hand-written ES5 polyfills prepended to the Tizen bundle as a classic script.
    files: ['apps/tizen/polyfills/**/*.js'],
    languageOptions: { ecmaVersion: 5, sourceType: 'script', globals: { ...globals.browser } },
  },
  {
    // The web dev app is served as an ES module by Vite and may use import.meta.env.
    files: ['apps/web/src/**/*.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },

  // 3. Docblocks on exported symbols of runtime code.
  {
    files: [...RUNTIME_SOURCES, 'apps/electron/src/**/*.{ts,cts}'],
    plugins: { jsdoc },
    rules: {
      'jsdoc/require-jsdoc': [
        'error',
        {
          publicOnly: true,
          require: { FunctionDeclaration: true, ClassDeclaration: true, MethodDefinition: false },
          contexts: [
            'TSInterfaceDeclaration',
            'TSTypeAliasDeclaration',
            'TSEnumDeclaration',
            'VariableDeclaration',
          ],
          checkConstructors: false,
        },
      ],
      'jsdoc/check-alignment': 'error',
      'jsdoc/no-multi-asterisks': ['error', { allowWhitespace: true }],
    },
  },

  // 4. packages/core must stay platform-agnostic and deterministic
  //    (no clocks, no Math.random, no engine-dependent transcendentals or **).
  {
    files: ['packages/core/src/**/*.ts'],
    languageOptions: { globals: {} },
    rules: {
      'no-restricted-globals': [
        'error',
        ...platformGlobals.map((name) => ({
          name,
          message: `packages/core is platform-agnostic: "${name}" is a DOM/WebGL/audio/Node/platform global. Go through the Platform interface or a presentation package.`,
        })),
      ],
      'no-restricted-imports': [
        'error',
        {
          // Exact module names: `patterns` uses gitignore-style matching, where a bare
          // name like "events" would also match the core's own './events/index.js'.
          paths: [
            'fs',
            'path',
            'os',
            'child_process',
            'url',
            'util',
            'events',
            'crypto',
            'stream',
            'buffer',
          ].map((name) => ({
            name,
            message: 'packages/core must not import Node built-ins.',
          })),
          patterns: [
            {
              group: ['pixi.js', 'pixi.js/*', '@pixi/*', 'howler', 'electron', 'electron/*'],
              message: 'packages/core must not import renderers, audio libraries or Electron.',
            },
            {
              group: ['@shmup/*'],
              message:
                'packages/core is the bottom of the dependency graph; it may not import other workspace packages.',
            },
            {
              group: ['node:*'],
              message: 'packages/core must not import Node built-ins.',
            },
            {
              group: ['tizen*', '*webapis*'],
              message: 'packages/core must not import Tizen / Samsung platform APIs.',
            },
          ],
        },
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Use the seeded RNG streams (core/rng) — Math.random breaks replays.',
        },
        // Transcendentals are not exactly specified by IEEE 754: engines round them
        // differently, which would desynchronise replays (shmup_feat.md §22).
        ...[
          'sin',
          'cos',
          'tan',
          'asin',
          'acos',
          'atan',
          'atan2',
          'exp',
          'log',
          'pow',
          'hypot',
          'cbrt',
        ].map((property) => ({
          object: 'Math',
          property,
          message: `Math.${property} may differ between JS engines: use the committed tables in core/math (sinB, cosB, atan2B, EASINGS). + - * / and Math.sqrt are fine.`,
        })),
        {
          object: 'Date',
          property: 'now',
          message: 'The simulation counts ticks; never read the wall clock (shmup_feat.md §22).',
        },
        {
          object: 'performance',
          property: 'now',
          message: 'The simulation counts ticks; never read the wall clock.',
        },
        // Re-list the Chrome 69 restrictions (this block replaces the array from layer 2).
        { object: 'Object', property: 'hasOwn', message: 'Object.hasOwn needs Chrome 93.' },
        {
          object: 'Object',
          property: 'fromEntries',
          message: 'Object.fromEntries needs Chrome 73.',
        },
        {
          object: 'Promise',
          property: 'allSettled',
          message: 'Promise.allSettled needs Chrome 76.',
        },
        { object: 'Promise', property: 'any', message: 'Promise.any needs Chrome 85.' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "BinaryExpression[operator='**'], AssignmentExpression[operator='**=']",
          message:
            'The ** operator is not exactly specified across engines: use repeated multiplication or Math.sqrt (shmup_feat.md §22).',
        },
        // Re-list the Chrome 69 restrictions (this block replaces the array from layer 2).
        {
          selector: "CallExpression[callee.property.name='replaceAll']",
          message: 'String.prototype.replaceAll needs Chrome 85 (Tizen 5.5 = Chrome 69).',
        },
        {
          selector: "CallExpression[callee.property.name='at']",
          message: '.at() needs Chrome 92 (Tizen 5.5 = Chrome 69); index directly.',
        },
        {
          selector: "CallExpression[callee.name='structuredClone']",
          message: 'structuredClone needs Chrome 98 (Tizen 5.5 = Chrome 69).',
        },
        {
          selector: "MemberExpression[property.name='timeStamp']",
          message:
            'event.timeStamp only advances in whole seconds on Tizen 5.5: measure with the handler clock or count ticks instead.',
        },
        {
          selector: 'MetaProperty[meta.name="import"][property.name="meta"]',
          message:
            'import.meta is a syntax error in the classic IIFE script shipped to Tizen; pass values in via config instead.',
        },
      ],
      'no-console': 'error',
    },
  },

  // 5. Node-side code: configs, scripts, tests, Electron main process.
  {
    files: [...NODE_FILES, ...TEST_FILES, 'eslint.config.js'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    // The render bench's page (plan M3-02c): test code, but it runs in a browser, not in Node.
    files: ['test/bench/render-harness/**/*.ts'],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    files: ['apps/electron/src/preload/**/*.cts'],
    rules: {
      // Sandboxed preloads must be CommonJS; `import x = require()` is the TS-native form.
      '@typescript-eslint/no-require-imports': ['error', { allowAsImport: true }],
    },
  },
]);
