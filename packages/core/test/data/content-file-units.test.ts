/**
 * Every number of every content kind core owns has a unit (plan_resolution.md R1-03):
 * `CONTENT_FILE_SCHEMAS` names one schema per kind, every numeric field of those schemas declares
 * a `NumberUnit`, and walking the shipped `content/` files with them meets no number without one —
 * the only value the walk cannot enter is a demo's recorded game config (demos are re-recorded,
 * never rescaled). The kinds other packages own (`sfx`, `music`, `input-profiles`, `fx`) have their
 * own file schemas; R1-03's repo-wide unit test covers every kind.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CONTENT_FILE_SCHEMAS, CONTENT_KINDS, type ContentKind } from '../../src/data/index.js';
import { NUMBER_UNITS, listNumberFields, walkNumbers } from '../../src/data/units.js';

const contentRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
  'content',
);

/**
 * Every `*.json` file below a directory.
 *
 * @param dir - Absolute directory.
 * @returns The absolute paths, sorted.
 */
function jsonFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir).sort()) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...jsonFiles(path));
    else if (entry.endsWith('.json')) out.push(path);
  }
  return out;
}

/** The kinds as a list. */
const kinds = Object.keys(CONTENT_FILE_SCHEMAS) as ContentKind[];

describe('core/data: units on every content number', () => {
  it('has one file schema per content kind core owns', () => {
    expect([...kinds].sort()).toEqual([...CONTENT_KINDS].sort());
    expect(Object.isFrozen(CONTENT_FILE_SCHEMAS)).toBe(true);
  });

  it('declares a known unit on every numeric field of every kind', () => {
    const missing: string[] = [];
    const unknown: string[] = [];
    let count = 0;
    for (const kind of kinds) {
      for (const field of listNumberFields(CONTENT_FILE_SCHEMAS[kind]).fields) {
        count++;
        if (field.unit === undefined) missing.push(`${kind}: ${field.path}`);
        else if (NUMBER_UNITS.indexOf(field.unit) < 0) unknown.push(`${kind}: ${field.path}`);
      }
    }
    expect(missing).toEqual([]);
    expect(unknown).toEqual([]);
    expect(count).toBeGreaterThan(300);
  });

  it('can look into everything but a demo’s recorded game config', () => {
    const opaque: string[] = [];
    for (const kind of kinds) {
      for (const path of listNumberFields(CONTENT_FILE_SCHEMAS[kind]).opaque) {
        opaque.push(`${kind}: ${path}`);
      }
    }
    expect(opaque).toEqual(['replay: header.config']);
  });

  it('gives every number of the shipped content and the examples a unit', () => {
    const missing: string[] = [];
    const skipped: string[] = [];
    let numbers = 0;
    let files = 0;
    for (const file of jsonFiles(contentRoot)) {
      const data = JSON.parse(readFileSync(file, 'utf8')) as { kind?: string };
      const kind = data.kind;
      if (kind === undefined || (CONTENT_KINDS as readonly string[]).indexOf(kind) < 0) continue;
      files++;
      const name = file.slice(contentRoot.length + 1);
      const skips = walkNumbers(CONTENT_FILE_SCHEMAS[kind as ContentKind], data, (leaf) => {
        numbers++;
        if (leaf.unit === undefined) missing.push(`${name}: ${leaf.path}`);
      });
      for (const skip of skips) skipped.push(`${skip.reason} ${kind}: ${skip.path}`);
    }
    expect(missing).toEqual([]);
    // Only the demos' configs; everything else fits its schema (pnpm content:check proves that).
    expect([...new Set(skipped)]).toEqual(['opaque replay: header.config']);
    expect(files).toBeGreaterThan(80);
    expect(numbers).toBeGreaterThan(5000);
  });
});
