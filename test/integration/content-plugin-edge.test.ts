/**
 * Edge cases of the `shmupContent()` Vite plugin and `readContentFiles()`: the generated
 * module evaluates to exactly the files on disk, output is byte-stable, a custom root is
 * honoured, the dev-server watcher only reacts to JSON files *inside* the content root
 * (regression: a sibling directory sharing the root's name prefix triggered reloads), and a
 * real Vite build through the plugin inlines content that `loadContent()` accepts.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContent } from '@shmup/core';
import { build, type Rollup, type ViteDevServer } from 'vite';
import { afterAll, describe, expect, it } from 'vitest';
import { CONTENT_MODULE_ID, readContentFiles, shmupContent } from '../../vite.shared.js';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const tmp = mkdtempSync(join(tmpdir(), 'shmup-content-edge-'));

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

type Plugin = ReturnType<typeof shmupContent>;

/** The plugin's `load` hook as a plain function. */
const load = (plugin: Plugin, id: string): string | null =>
  (plugin.load as (this: void, id: string) => string | null).call(undefined, id);

/**
 * Evaluates generated module code (`export default …;`) and returns its default export.
 *
 * @param code - The module source.
 * @returns The exported value.
 */
function evaluate(code: string): unknown {
  expect(code.startsWith('export default ')).toBe(true);
  // eslint-disable-next-line @typescript-eslint/no-implied-eval -- evaluating our own generated code
  const run = new Function('return ' + code.slice('export default '.length)) as () => unknown;
  return run();
}

/**
 * Writes a small content tree.
 *
 * @param name - Directory name under the temp dir.
 * @param files - Relative path → file text.
 * @returns The absolute root.
 */
function tree(name: string, files: Record<string, string>): string {
  const root = join(tmp, name);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

/** A fake dev server recording what the plugin does with it. */
function fakeServer() {
  const watched: string[] = [];
  const handlers: Record<string, ((file: string) => void)[]> = {};
  const invalidated: unknown[] = [];
  const sent: unknown[] = [];
  let module: object | undefined = { id: '\0' + CONTENT_MODULE_ID };
  const server = {
    watcher: {
      add: (path: string) => watched.push(path),
      on: (event: string, handler: (file: string) => void) => {
        (handlers[event] ??= []).push(handler);
      },
    },
    moduleGraph: {
      getModuleById: (id: string) => (id === '\0' + CONTENT_MODULE_ID ? module : undefined),
      invalidateModule: (mod: unknown) => invalidated.push(mod),
    },
    ws: { send: (payload: unknown) => sent.push(payload) },
  };
  return {
    server: server as unknown as ViteDevServer,
    watched,
    handlers,
    invalidated,
    sent,
    /** Simulates the module not being in the graph yet. */
    dropModule: () => {
      module = undefined;
    },
    /** Fires one watcher event. */
    emit: (event: string, file: string) => {
      for (const handler of handlers[event] ?? []) handler(file);
    },
  };
}

/** Calls the plugin's `configureServer` hook. */
function configure(plugin: Plugin, server: ViteDevServer): void {
  (plugin.configureServer as (this: void, server: ViteDevServer) => void).call(undefined, server);
}

describe('integration: shmupContent() generated module', () => {
  it('evaluates to exactly what readContentFiles() returns for the repo content', () => {
    const code = load(shmupContent(), '\0' + CONTENT_MODULE_ID);
    expect(evaluate(code ?? '')).toEqual(readContentFiles(join(repo, 'content')));
  });

  it('is byte-identical on every load (reproducible builds)', () => {
    const plugin = shmupContent();
    const first = load(plugin, '\0' + CONTENT_MODULE_ID);
    expect(load(plugin, '\0' + CONTENT_MODULE_ID)).toBe(first);
    expect(load(shmupContent(), '\0' + CONTENT_MODULE_ID)).toBe(first);
  });

  it('honours a custom root, re-reads it on every load and keeps awkward strings intact', () => {
    const root = tree('custom', {
      'weapons/w.json': JSON.stringify({
        kind: 'x',
        note: 'quote " slash \\ </script> \u2028\u2029 \u00e9',
      }),
      'README.md': '# not json',
      'weapons/example.w.json': '{}',
    });
    const plugin = shmupContent({ root });
    const files = evaluate(load(plugin, '\0' + CONTENT_MODULE_ID) ?? '') as {
      path: string;
      data: { note?: string };
    }[];
    expect(files.map((file) => file.path)).toEqual(['weapons/w.json']);
    expect(files[0]?.data.note).toBe('quote " slash \\ </script> \u2028\u2029 \u00e9');

    writeFileSync(join(root, 'a.json'), '{"kind":"a"}');
    const again = evaluate(load(plugin, '\0' + CONTENT_MODULE_ID) ?? '') as { path: string }[];
    expect(again.map((file) => file.path)).toEqual(['a.json', 'weapons/w.json']);
  });

  it('generates an empty list for a missing root', () => {
    const plugin = shmupContent({ root: join(tmp, 'nowhere') });
    expect(evaluate(load(plugin, '\0' + CONTENT_MODULE_ID) ?? '')).toEqual([]);
  });

  it('does not treat a resolved id without the \\0 prefix as its module', () => {
    expect(load(shmupContent(), CONTENT_MODULE_ID)).toBeNull();
  });
});

describe('integration: readContentFiles() edge cases', () => {
  it('sorts by full path in code-unit order, across directory levels', () => {
    const root = tree('order', {
      'b/a.json': '1',
      'a/z.json': '2',
      'a.json': '3',
      'B.json': '4',
      'a/b/c.json': '5',
    });
    expect(readContentFiles(root).map((file) => file.path)).toEqual([
      'B.json',
      'a.json',
      'a/b/c.json',
      'a/z.json',
      'b/a.json',
    ]);
  });

  it('skips example files only by their name prefix, in any folder', () => {
    const root = tree('examples', {
      'example.json': '{}',
      'sub/example.a.json': '{}',
      'sub/my-example.a.json': '{}',
      'sub/a.example.json': '{}',
      'sub/Example.a.json': '{}',
    });
    expect(readContentFiles(root).map((file) => file.path)).toEqual([
      'sub/Example.a.json',
      'sub/a.example.json',
      'sub/my-example.a.json',
    ]);
  });

  it('ignores non-JSON files and folders named like JSON files are walked, not read', () => {
    const root = tree('dirs', {
      'folder.json/inner.json': '{"kind":"inner"}',
      'data.json5': '{}',
      'data.JSON': '{}',
    });
    expect(readContentFiles(root)).toEqual([
      { path: 'folder.json/inner.json', data: { kind: 'inner' } },
    ]);
  });

  it('keeps any JSON value as data, not only objects', () => {
    const root = tree('values', { 'a.json': '[1,2]', 'b.json': 'null', 'c.json': '"s"' });
    expect(readContentFiles(root).map((file) => file.data)).toEqual([[1, 2], null, 's']);
  });

  it('names the nested file in a syntax error and keeps the cause', () => {
    const root = tree('broken-nested', { 'ok.json': '{}', 'deep/er/bad.json': '{"a":' });
    let error: unknown;
    try {
      readContentFiles(root);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(SyntaxError);
    expect((error as Error).message).toMatch(/^deep\/er\/bad\.json: /);
    expect((error as Error).cause).toBeInstanceOf(SyntaxError);
  });
});

describe('integration: shmupContent() dev server', () => {
  const root = join(tmp, 'watched', 'content');

  it('watches the content root and registers add/change/unlink handlers', () => {
    const fake = fakeServer();
    configure(shmupContent({ root }), fake.server);
    expect(fake.watched).toEqual([root]);
    expect(Object.keys(fake.handlers).sort()).toEqual(['add', 'change', 'unlink']);
  });

  it.each([['add'], ['change'], ['unlink']])(
    'invalidates the module and fully reloads on a JSON %s inside the root',
    (event) => {
      const fake = fakeServer();
      configure(shmupContent({ root }), fake.server);
      fake.emit(event, join(root, 'enemies', 'a.enemies.json'));
      expect(fake.invalidated).toHaveLength(1);
      expect(fake.sent).toEqual([{ type: 'full-reload' }]);
    },
  );

  it('still reloads when the module has not been loaded yet', () => {
    const fake = fakeServer();
    configure(shmupContent({ root }), fake.server);
    fake.dropModule();
    fake.emit('change', join(root, 'a.json'));
    expect(fake.invalidated).toEqual([]);
    expect(fake.sent).toEqual([{ type: 'full-reload' }]);
  });

  it.each([
    [
      'a sibling folder sharing the name prefix (regression)',
      join(tmp, 'watched', 'content-old', 'a.json'),
    ],
    ['a file next to the root sharing its prefix', join(tmp, 'watched', 'content.json')],
    ['the parent folder', join(tmp, 'watched', 'a.json')],
    ['a non-JSON file inside the root', join(root, 'README.md')],
    ['the root itself', root],
  ])('ignores %s', (_label, file) => {
    const fake = fakeServer();
    configure(shmupContent({ root }), fake.server);
    fake.emit('change', file);
    expect(fake.invalidated).toEqual([]);
    expect(fake.sent).toEqual([]);
  });
});

describe('integration: a real Vite build through shmupContent()', () => {
  it('inlines the content into an IIFE bundle that loadContent() accepts', async () => {
    const app = tree('app', {
      'main.js': "import content from 'virtual:shmup-content';\nglobalThis.__content = content;\n",
    });
    const output = (await build({
      configFile: false,
      root: app,
      logLevel: 'silent',
      plugins: [shmupContent()],
      build: {
        write: false,
        minify: false,
        target: ['chrome69', 'es2018'],
        rolldownOptions: { input: join(app, 'main.js'), output: { format: 'iife' } },
      },
    })) as Rollup.RolldownOutput | Rollup.RolldownOutput[];
    const bundle = Array.isArray(output) ? output[0] : output;
    const chunk = bundle?.output.find((item) => item.type === 'chunk');
    expect(chunk?.type).toBe('chunk');
    const code = chunk?.type === 'chunk' ? chunk.code : '';
    expect(code).not.toMatch(/\bimport\s*[{(\s'"]/);
    expect(code).not.toMatch(/\bexport\s/);

    const scope: { __content?: unknown } = {};
    // eslint-disable-next-line @typescript-eslint/no-implied-eval -- evaluating our own bundle
    const run = new Function('globalThis', code) as (global: object) => void;
    run(scope);
    const files = scope.__content as { path: string; data: unknown }[];
    expect(files).toEqual(readContentFiles(join(repo, 'content')));
    const { db, issues } = loadContent(files);
    expect(issues).toEqual([]);
    expect(db.ships.length).toBeGreaterThan(0);
  }, 30_000);
});
