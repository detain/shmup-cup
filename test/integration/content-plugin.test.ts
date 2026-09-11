/**
 * The `shmupContent()` Vite plugin: it must inline every shipped file of `content/` into
 * `virtual:shmup-content`, in path order, with the `example.*.json` samples left out
 * (decision D25 — the Tizen bundle cannot `fetch()` its data from `file://`).
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { CONTENT_MODULE_ID, readContentFiles, shmupContent } from '../../vite.shared.js';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const tmp = mkdtempSync(join(tmpdir(), 'shmup-content-'));

/** The plugin's `resolveId` hook as a plain function. */
const resolveId = (plugin: ReturnType<typeof shmupContent>, id: string): unknown =>
  (plugin.resolveId as (this: void, id: string) => unknown).call(undefined, id);

/** The plugin's `load` hook as a plain function. */
const load = (plugin: ReturnType<typeof shmupContent>, id: string): string | null =>
  (plugin.load as (this: void, id: string) => string | null).call(undefined, id);

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('integration: shmupContent() Vite plugin', () => {
  const plugin = shmupContent();

  it('serves only its own virtual module id', () => {
    expect(plugin.name).toBe('shmup:content');
    expect(resolveId(plugin, CONTENT_MODULE_ID)).toBe('\0' + CONTENT_MODULE_ID);
    expect(resolveId(plugin, 'other')).toBeNull();
    expect(load(plugin, 'other')).toBeNull();
  });

  it('generates a default export with every shipped file, in path order', () => {
    const code = load(plugin, '\0' + CONTENT_MODULE_ID);
    expect(code).toMatch(/^export default /);
    const files = JSON.parse(
      (code as string).replace(/^export default /, '').replace(/;\n$/, ''),
    ) as { path: string; data: { kind: string } }[];
    expect(files.map((file) => file.path)).toEqual(
      readContentFiles(join(repo, 'content')).map((file) => file.path),
    );
    expect(files.map((file) => file.path)).toEqual([...files.map((file) => file.path)].sort());
    expect(files.every((file) => typeof file.data.kind === 'string')).toBe(true);
    expect(files.some((file) => file.path.indexOf('example.') >= 0)).toBe(false);
  });

  it('reads a custom root recursively and skips example files', () => {
    const root = join(tmp, 'tree');
    mkdirSync(join(root, 'sub'), { recursive: true });
    writeFileSync(join(root, 'b.json'), '{"kind":"b"}');
    writeFileSync(join(root, 'a.json'), '{"kind":"a"}');
    writeFileSync(join(root, 'example.a.json'), '{"kind":"a"}');
    writeFileSync(join(root, 'notes.md'), 'ignored');
    writeFileSync(join(root, 'sub', 'c.json'), '{"kind":"c"}');
    expect(readContentFiles(root).map((file) => file.path)).toEqual([
      'a.json',
      'b.json',
      'sub/c.json',
    ]);
  });

  it('names the file in a JSON syntax error', () => {
    const root = join(tmp, 'broken');
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, 'broken.json'), '{ nope }');
    expect(() => readContentFiles(root)).toThrow(/^broken\.json: /);
  });

  it('returns nothing for a missing root', () => {
    expect(readContentFiles(join(tmp, 'does-not-exist'))).toEqual([]);
  });
});
