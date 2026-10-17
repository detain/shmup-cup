/**
 * Every number of every content kind has a unit (plan_resolution.md R1-03: "the unit test covers
 * every kind") — core's eleven kinds (`CONTENT_FILE_SCHEMAS`) and the four other packages own
 * (`sfx`, `music` → `@shmup/audio-web`, `input-profiles` → `@shmup/input-web`, `fx` →
 * `@shmup/render-pixi`):
 *
 * - every numeric field of every file schema declares a known `NumberUnit`, and the only value a
 *   walker cannot look into is a demo's recorded game config;
 * - every number of every shipped file and every `example.*.json` sample is reached by the walk
 *   and has a unit — so `scripts/content/rescale.mjs` can classify the whole of `content/`;
 * - every behaviour tunable the content sets (`param`) resolves through `BEHAVIOR_PARAM_UNITS`
 *   (owner decision O5) to a unit with a rule of its own, and the two lookup units appear only
 *   where they belong (`param` under a `params` record, `inherit` as a pattern reference's
 *   `params`);
 * - every kind a content file names has a schema.
 *
 * Core's own `packages/core/test/data/content-file-units.test.ts` and
 * `packages/core/test/behaviors/behavior-param-units.test.ts` hold the core side in detail; this
 * test is the repository-wide one.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as core from '@shmup/core';
import {
  CONTENT_FILE_SCHEMAS,
  NUMBER_UNITS,
  UNIT_RULES,
  listNumberFields,
  walkNumbers,
  type NumberLeaf,
  type NumberUnit,
  type Schema,
} from '@shmup/core';
import { MUSIC_FILE_SCHEMA, SFX_FILE_SCHEMA } from '@shmup/audio-web';
import { INPUT_PROFILES_FILE_SCHEMA } from '@shmup/input-web';
import { FX_FILE_SCHEMA } from '@shmup/render-pixi';
import { describe, expect, it } from 'vitest';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const contentRoot = join(repo, 'content');

/** Every content kind's file schema. */
const SCHEMAS: Readonly<Record<string, Schema<unknown>>> = {
  ...CONTENT_FILE_SCHEMAS,
  sfx: SFX_FILE_SCHEMA,
  music: MUSIC_FILE_SCHEMA,
  'input-profiles': INPUT_PROFILES_FILE_SCHEMA,
  fx: FX_FILE_SCHEMA,
};

/**
 * `BEHAVIOR_PARAM_UNITS` (behaviour → tunable → unit), read off the barrel so this test names
 * what is missing instead of failing to compile if core ever drops it.
 */
const TUNABLE_UNITS = (core as Record<string, unknown>)['BEHAVIOR_PARAM_UNITS'] as
  Readonly<Record<string, Readonly<Record<string, NumberUnit>>>> | undefined;

/**
 * Every `*.json` below a directory.
 *
 * @param dir - Absolute directory.
 * @returns Absolute paths, sorted.
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

/** Every content file (shipped and examples), parsed, with its content-root-relative path. */
const FILES = jsonFiles(contentRoot).map((path) => ({
  path: path.slice(contentRoot.length + 1),
  data: JSON.parse(readFileSync(path, 'utf8')) as { kind?: unknown },
}));

/**
 * Walks every content file with its kind's schema.
 *
 * @param visit - Called for every number (and expression string) with its file.
 * @returns What the walks could not enter, as `<reason> <kind>: <path>`.
 */
function walkAll(visit: (leaf: NumberLeaf, file: string) => void): string[] {
  const skipped: string[] = [];
  for (const file of FILES) {
    const kind = String(file.data.kind);
    const schema = SCHEMAS[kind];
    if (schema === undefined) throw new Error(`${file.path}: no schema for kind ${kind}`);
    for (const skip of walkNumbers(schema, file.data, (leaf) => visit(leaf, file.path))) {
      skipped.push(`${skip.reason} ${kind}: ${skip.path}`);
    }
  }
  return skipped;
}

describe('integration: a unit on every content number (R1-03)', () => {
  it('has a file schema for every kind the content uses', () => {
    const kinds = new Set(FILES.map((file) => String(file.data.kind)));
    expect([...kinds].filter((kind) => SCHEMAS[kind] === undefined)).toEqual([]);
    // Core's kinds plus the four foreign ones, all present in content/.
    expect([...kinds].sort()).toEqual(Object.keys(SCHEMAS).sort());
  });

  it('declares a known unit on every numeric field of every kind', () => {
    const missing: string[] = [];
    const unknown: string[] = [];
    const opaque: string[] = [];
    const lookups: string[] = [];
    let count = 0;
    for (const kind of Object.keys(SCHEMAS).sort()) {
      const schema = SCHEMAS[kind];
      if (schema === undefined) continue;
      const fields = listNumberFields(schema);
      for (const path of fields.opaque) opaque.push(`${kind}: ${path}`);
      for (const field of fields.fields) {
        count++;
        const where = `${kind}: ${field.path}`;
        if (field.unit === undefined) missing.push(where);
        else if (NUMBER_UNITS.indexOf(field.unit) < 0) unknown.push(where);
        else if (UNIT_RULES[field.unit] === 'lookup') lookups.push(`${where} [${field.unit}]`);
      }
    }
    expect(missing).toEqual([]);
    expect(unknown).toEqual([]);
    expect(opaque).toEqual(['replay: header.config']);
    expect(count).toBeGreaterThan(380);
    // The lookups are only behaviour tunables and pattern-reference parameters.
    for (const lookup of lookups) {
      expect(lookup).toMatch(/(\.params\.\* \[param\]|\.params\[\] \[inherit\])$/);
    }
  });

  it('reaches every number of every content file, each with a unit', () => {
    const missing: string[] = [];
    let numbers = 0;
    const skipped = walkAll((leaf, file) => {
      numbers++;
      if (leaf.unit === undefined) missing.push(`${file}: ${leaf.path}`);
    });
    expect(missing).toEqual([]);
    // Only the demos' recorded configs (re-recorded, never rescaled).
    expect([...new Set(skipped)]).toEqual(['opaque replay: header.config']);
    expect(numbers).toBeGreaterThan(10000);
  });

  it('resolves every behaviour tunable of the content to a unit with a rule (O5)', () => {
    expect(TUNABLE_UNITS, 'core must export BEHAVIOR_PARAM_UNITS').toBeDefined();
    const table = TUNABLE_UNITS ?? {};
    const unresolved: string[] = [];
    const units = new Set<string>();
    let tunables = 0;
    walkAll((leaf, file) => {
      if (leaf.unit !== 'param') return;
      tunables++;
      const owner = leaf.parents[leaf.parents.length - 2] as Record<string, unknown> | undefined;
      const behaviour = owner?.['script'] ?? owner?.['behavior'];
      const unit = typeof behaviour === 'string' ? table[behaviour]?.[String(leaf.key)] : undefined;
      if (unit === undefined || UNIT_RULES[unit] === 'lookup') {
        unresolved.push(`${file}: ${leaf.path} (${String(behaviour)}.${String(leaf.key)})`);
      } else units.add(unit);
    });
    expect(unresolved).toEqual([]);
    expect(tunables).toBeGreaterThan(500);
    // Tunables cover times, speeds and lengths at least.
    for (const unit of ['ticks', 'px-per-tick', 'world-px']) expect(units.has(unit)).toBe(true);
  });
});
