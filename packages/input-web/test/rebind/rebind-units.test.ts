/**
 * The units of the `input-profiles` file schema (plan_resolution.md R1-03): its two numbers — the
 * format version and the release debounce — declare units a port leaves alone, and the exported
 * schema is the one the loader validates with.
 */
import { UNIT_RULES, listNumberFields, type ValidationIssue } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import * as inputWeb from '../../src/index.js';
import { INPUT_PROFILES_FILE_SCHEMA, parseInputProfiles } from '../../src/rebind/index.js';

describe('input-web/rebind: the units of the file schema (R1-03)', () => {
  it('is exported from the package barrel', () => {
    expect(inputWeb.INPUT_PROFILES_FILE_SCHEMA).toBe(INPUT_PROFILES_FILE_SCHEMA);
  });

  it('gives both numbers a unit that a port leaves alone', () => {
    const { fields, opaque } = listNumberFields(INPUT_PROFILES_FILE_SCHEMA);
    expect(opaque).toEqual([]);
    expect(fields.map((field) => [field.path, field.unit, field.integer])).toEqual([
      ['formatVersion', 'version', true],
      ['profiles[].releaseDebounceTicks', 'ticks', true],
    ]);
    for (const field of fields) expect(UNIT_RULES[field.unit ?? 'param']).toBe('keep');
  });

  it('validates with the exported schema: what it rejects, the loader reports', () => {
    const data = { formatVersion: 1, kind: 'input-profiles', profiles: [] };
    const issues: ValidationIssue[] = [];
    expect(INPUT_PROFILES_FILE_SCHEMA.parse(data, '', issues)).toBeUndefined();
    expect(issues.length).toBeGreaterThan(0);
    const result = parseInputProfiles(data);
    expect(result.issues.map((issue) => issue.path)).toEqual(issues.map((issue) => issue.path));
  });
});
