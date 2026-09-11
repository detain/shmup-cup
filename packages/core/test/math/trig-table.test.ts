/**
 * `core/math/trig-table` — the committed tables are exactly what
 * `scripts/gen-trig-tables.mjs` produces, and they have the shape the module relies on
 * (shmup_plan.md M1-01: "re-running the script reproduces trig-table.ts byte-for-byte").
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import {
  ANGLE_MASK,
  ANGLE_QUARTER,
  ANGLE_UNITS,
  ATAN_TABLE,
  ATAN_TABLE_STEPS,
  SIN_TABLE_Q16,
  TRIG_SCALE,
} from '../../src/math/trig-table.js';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const script = join(repo, 'scripts', 'gen-trig-tables.mjs');
const committed = join(repo, 'packages', 'core', 'src', 'math', 'trig-table.ts');
const scratch = mkdtempSync(join(tmpdir(), 'shmup-trig-'));

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

describe('core/math/trig-table (generated)', () => {
  it('is byte-for-byte what scripts/gen-trig-tables.mjs produces', () => {
    const regenerated = join(scratch, 'trig-table.ts');
    execFileSync(process.execPath, [script, '--out', regenerated], { cwd: repo });
    expect(readFileSync(regenerated, 'utf8')).toBe(readFileSync(committed, 'utf8'));
  });

  it('reports the committed file as up to date in --check mode', () => {
    expect(() => execFileSync(process.execPath, [script, '--check'], { cwd: repo })).not.toThrow();
  });

  it('has the sizes the math module indexes into', () => {
    expect(ANGLE_UNITS).toBe(1024);
    expect(ANGLE_MASK).toBe(1023);
    expect(ANGLE_QUARTER).toBe(256);
    expect(TRIG_SCALE).toBe(65536);
    expect(SIN_TABLE_Q16.length).toBe(ANGLE_UNITS + ANGLE_QUARTER);
    expect(ATAN_TABLE_STEPS).toBe(256);
    expect(ATAN_TABLE.length).toBe(ATAN_TABLE_STEPS + 1);
  });

  it('holds integers inside the Q16 range and is exactly antisymmetric', () => {
    for (let i = 0; i < SIN_TABLE_Q16.length; i += 1) {
      expect(Number.isInteger(SIN_TABLE_Q16[i])).toBe(true);
      expect(Math.abs(SIN_TABLE_Q16[i])).toBeLessThanOrEqual(TRIG_SCALE);
    }
    for (let a = 0; a < ANGLE_UNITS / 2; a += 1) {
      // Summing (rather than negating) keeps the assertion free of the -0 / 0 trap.
      expect(SIN_TABLE_Q16[a + ANGLE_UNITS / 2] + SIN_TABLE_Q16[a]).toBe(0);
    }
    // The overhang repeats the start of the table so cos can read past one turn.
    for (let a = 0; a < ANGLE_QUARTER; a += 1) {
      expect(SIN_TABLE_Q16[ANGLE_UNITS + a]).toBe(SIN_TABLE_Q16[a]);
    }
  });

  it('holds a monotone octant of arctangent values', () => {
    expect(ATAN_TABLE[0]).toBe(0);
    expect(ATAN_TABLE[ATAN_TABLE_STEPS]).toBe(ANGLE_UNITS / 8);
    for (let k = 1; k < ATAN_TABLE.length; k += 1) {
      expect(ATAN_TABLE[k]).toBeGreaterThanOrEqual(ATAN_TABLE[k - 1]);
      expect(Number.isInteger(ATAN_TABLE[k])).toBe(true);
    }
  });
});
