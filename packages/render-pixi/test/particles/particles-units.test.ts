/**
 * The units of the `fx` file schema (plan_resolution.md R1-03): particles live in world pixels
 * (decision D26), so speeds, gravity, the scatter radius and the trigger offsets scale with the
 * world in a port while frames, counts, angles, the drag and the tick ranges do not; the exported
 * schema is the one the loader validates with.
 */
import { UNIT_RULES, listNumberFields, type ValidationIssue } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import * as renderPixi from '../../src/index.js';
import { FX_FILE_SCHEMA, parseFxContent } from '../../src/particles/index.js';

describe('render-pixi/particles: the units of the file schema (R1-03)', () => {
  it('is exported from the package barrel', () => {
    expect(renderPixi.FX_FILE_SCHEMA).toBe(FX_FILE_SCHEMA);
  });

  it('gives every number a unit — world values scale, the rest is kept', () => {
    const { fields, opaque } = listNumberFields(FX_FILE_SCHEMA);
    expect(opaque).toEqual([]);
    expect(fields.map((field) => [field.path, field.unit])).toEqual([
      ['formatVersion', 'version'],
      ['presets[].frames[]', 'index'],
      ['presets[].count', 'count'],
      ['presets[].speed.min', 'px-per-tick'],
      ['presets[].speed.max', 'px-per-tick'],
      ['presets[].direction', 'angle'],
      ['presets[].spread', 'angle'],
      ['presets[].gravity', 'px-per-tick2'],
      ['presets[].drag', 'ratio'],
      ['presets[].lifetime.min', 'ticks'],
      ['presets[].lifetime.max', 'ticks'],
      ['presets[].delay.min', 'ticks'],
      ['presets[].delay.max', 'ticks'],
      ['presets[].radius', 'world-px'],
      ['triggers[].dx', 'rel-px'],
      ['triggers[].dy', 'rel-px'],
    ]);
    const scaled = listNumberFields(FX_FILE_SCHEMA)
      .fields.filter((field) => UNIT_RULES[field.unit ?? 'param'] === 'scale')
      .map((field) => field.path);
    expect(scaled).toEqual([
      'presets[].speed.min',
      'presets[].speed.max',
      'presets[].gravity',
      'presets[].radius',
      'triggers[].dx',
      'triggers[].dy',
    ]);
  });

  it('validates with the exported schema: what it rejects, the loader reports', () => {
    const data = { formatVersion: 1, kind: 'fx', presets: [{ id: 'x', count: 0 }] };
    const issues: ValidationIssue[] = [];
    expect(FX_FILE_SCHEMA.parse(data, '', issues)).toBeUndefined();
    expect(issues.length).toBeGreaterThan(0);
    const result = parseFxContent(data);
    expect(result.issues.map((issue) => issue.path)).toEqual(issues.map((issue) => issue.path));
  });
});
