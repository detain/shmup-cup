#!/usr/bin/env node
/**
 * Generates `packages/core/src/math/trig-table.ts` — the committed sine and arctangent
 * tables `@shmup/core` uses instead of `Math.sin` / `Math.cos` / `Math.atan2`
 * (shmup_feat.md §22 Determinism: transcendentals differ between JS engines, so the
 * simulation may only read numbers that are part of the source tree).
 *
 * Everything is computed with **BigInt fixed-point arithmetic** (Taylor series for
 * `sin`, Machin's formula for π), never with `Math.*`, so re-running the script on any
 * engine reproduces the file byte-for-byte — an invariant
 * `packages/core/test/math/trig-table.test.ts` checks.
 *
 * Usage:
 *   node scripts/gen-trig-tables.mjs             write the table in place
 *   node scripts/gen-trig-tables.mjs --check     exit 1 if the committed file is stale
 *   node scripts/gen-trig-tables.mjs --out FILE  write somewhere else (tests)
 *
 * @module
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';

/** Repository root (this script lives in scripts/). */
const repo = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Where the generated module is committed. */
export const TRIG_TABLE_FILE = join(repo, 'packages', 'core', 'src', 'math', 'trig-table.ts');

/** Binary-angle units in one full turn (shmup_plan.md M1-01: 1024 steps). */
const ANGLE_UNITS = 1024;
/** Index offset that turns the sine table into a cosine table (a quarter turn). */
const ANGLE_QUARTER = ANGLE_UNITS / 4;
/** Fixed-point scale of the committed sine table (Q16.16). */
const TRIG_SCALE = 65536;
/** Number of `dy/dx` steps of the arctangent table (entries = steps + 1). */
const ATAN_TABLE_STEPS = 256;

/** Fractional bits of the BigInt fixed-point arithmetic used while generating. */
const PRECISION = 96n;
/** Fixed-point representation of 1. */
const ONE = 1n << PRECISION;

/**
 * `atan(1 / n)` in fixed point, by its alternating Taylor series.
 *
 * @param {bigint} n - Reciprocal argument (≥ 2, so the series converges quickly).
 * @returns {bigint} `atan(1 / n)` scaled by 2^PRECISION.
 */
function atanReciprocal(n) {
  const nSquared = n * n;
  let power = ONE / n;
  let sum = 0n;
  let k = 0n;
  while (power !== 0n) {
    const term = power / (2n * k + 1n);
    sum += k % 2n === 0n ? term : -term;
    power /= nSquared;
    k += 1n;
  }
  return sum;
}

/** π in fixed point, via Machin's formula `π/4 = 4·atan(1/5) − atan(1/239)`. */
const PI = 4n * (4n * atanReciprocal(5n) - atanReciprocal(239n));

/**
 * `sin(x)` in fixed point, by its Taylor series (converges fast for |x| ≤ π/2).
 *
 * @param {bigint} x - Angle in radians, scaled by 2^PRECISION.
 * @returns {bigint} `sin(x)` scaled by 2^PRECISION.
 */
function sinFixed(x) {
  let term = x;
  let sum = 0n;
  let k = 0n;
  while (term !== 0n) {
    sum += k % 2n === 0n ? term : -term;
    term = (((term * x) / ONE) * x) / ONE / ((2n * k + 2n) * (2n * k + 3n));
    k += 1n;
  }
  return sum;
}

/**
 * `cos(x)` in fixed point, as `sin(π/2 − x)`.
 *
 * @param {bigint} x - Angle in radians, scaled by 2^PRECISION (0 ≤ x ≤ π/2).
 * @returns {bigint} `cos(x)` scaled by 2^PRECISION.
 */
function cosFixed(x) {
  return sinFixed(PI / 2n - x);
}

/**
 * Rounds a non-negative fixed-point quotient to the nearest integer (ties away from 0).
 *
 * @param {bigint} numerator - Dividend (≥ 0).
 * @param {bigint} denominator - Divisor (> 0).
 * @returns {bigint} `round(numerator / denominator)`.
 */
function roundDiv(numerator, denominator) {
  return (2n * numerator + denominator) / (2n * denominator);
}

/**
 * The first quarter turn of the sine table: `round(sin(2πi/1024) · 65536)` for
 * `i = 0 … 256`. The remaining three quarters are mirrored from it so the committed
 * table is exactly symmetric (`sin(a + 512) === -sin(a)`).
 *
 * @returns {number[]} 257 Q16 values, 0 … 65536.
 */
function quarterSineTable() {
  const quarter = [];
  for (let i = 0; i <= ANGLE_QUARTER; i += 1) {
    const radians = (PI * BigInt(i)) / BigInt(ANGLE_UNITS / 2);
    quarter.push(Number(roundDiv(sinFixed(radians) * BigInt(TRIG_SCALE), ONE)));
  }
  return quarter;
}

/**
 * The full sine table with the cosine overhang: `SIN_TABLE_Q16[a + 256] === cos` of `a`.
 *
 * @param {number[]} quarter - Output of {@link quarterSineTable}.
 * @returns {number[]} `ANGLE_UNITS + ANGLE_QUARTER` Q16 values.
 */
function sineTable(quarter) {
  /**
   * One table entry, mirrored out of the quarter table.
   *
   * @param {number} index - Table index (may exceed one turn).
   * @returns {number} `round(sin(2π·index/1024) · 65536)`.
   */
  const at = (index) => {
    const a = index % ANGLE_UNITS;
    if (a <= 256) return quarter[a];
    if (a <= 512) return quarter[512 - a];
    if (a <= 768) return -quarter[a - 512];
    return -quarter[ANGLE_UNITS - a];
  };
  const table = [];
  for (let i = 0; i < ANGLE_UNITS + ANGLE_QUARTER; i += 1) table.push(at(i));
  return table;
}

/**
 * The arctangent table: `ATAN_TABLE[k] = round(atan(k / 256) · 1024 / 2π)`, i.e. the
 * angle of a slope of `k / 256` in binary units (0 … 128).
 *
 * Computed by counting how many rounding boundaries `tan((2a + 1)·π/1024)` the slope
 * passes, which needs no arctangent series and is correctly rounded.
 *
 * @returns {number[]} 257 entries, 0 … 128.
 */
function atanTable() {
  const boundaries = [];
  for (let a = 0; a < ANGLE_UNITS / 8; a += 1) {
    const radians = (PI * BigInt(2 * a + 1)) / BigInt(ANGLE_UNITS);
    boundaries.push((sinFixed(radians) * ONE) / cosFixed(radians));
  }
  const table = [];
  for (let k = 0; k <= ATAN_TABLE_STEPS; k += 1) {
    let units = 0;
    while (
      units < boundaries.length &&
      boundaries[units] * BigInt(ATAN_TABLE_STEPS) <= BigInt(k) * ONE
    ) {
      units += 1;
    }
    table.push(units);
  }
  return table;
}

/**
 * Cross-checks the generated tables against the host engine's `Math` implementation.
 * Engines disagree in the last ulp, never by the tolerances used here, so a failure
 * means the fixed-point code is wrong.
 *
 * @param {number[]} sine - Sine table (Q16).
 * @param {number[]} atan - Arctangent table (binary units).
 * @throws {Error} If a table entry is further from the reference than rounding allows.
 */
function selfCheck(sine, atan) {
  for (let i = 0; i < sine.length; i += 1) {
    const expected = Math.sin((2 * Math.PI * i) / ANGLE_UNITS);
    if (Math.abs(sine[i] / TRIG_SCALE - expected) > 1e-5) {
      throw new Error(`sine table entry ${i} is wrong: ${sine[i]} vs ${expected}`);
    }
  }
  for (let k = 0; k < atan.length; k += 1) {
    const expected = (Math.atan(k / ATAN_TABLE_STEPS) * ANGLE_UNITS) / (2 * Math.PI);
    if (Math.abs(atan[k] - expected) > 0.5 + 1e-9) {
      throw new Error(`atan table entry ${k} is wrong: ${atan[k]} vs ${expected}`);
    }
  }
}

/**
 * Renders the TypeScript module source (unformatted).
 *
 * @param {number[]} sine - Sine table (Q16).
 * @param {number[]} atan - Arctangent table (binary units).
 * @returns {string} Module source, before Prettier.
 */
function render(sine, atan) {
  return `/**
 * # math/trig-table — generated sine and arctangent tables
 *
 * **GENERATED FILE — do not edit.** Produced by \`node scripts/gen-trig-tables.mjs\`;
 * \`packages/core/test/math/trig-table.test.ts\` fails if the committed copy is stale.
 *
 * **Responsibility.** Supplies the constants behind the deterministic trigonometry of
 * \`core/math\`. \`Math.sin\` / \`Math.cos\` / \`Math.atan2\` are lint errors inside
 * \`packages/core\` because engines may round them differently, which would desynchronise
 * replays between Chromium 69 on the TV and desktop Chrome or Node.
 *
 * **Implements.** shmup_feat.md §22 (precomputed sin/cos tables with binary angles,
 * table-based atan2), shmup_feat.md §12 (quantised aim directions).
 *
 * **Public API.** \`ANGLE_UNITS\`, \`ANGLE_MASK\`, \`ANGLE_QUARTER\`, \`TRIG_SCALE\`,
 * \`ATAN_TABLE_STEPS\`, \`SIN_TABLE_Q16\`, \`ATAN_TABLE\`. Gameplay code does not read the
 * tables directly — it calls \`sinB\` / \`cosB\` / \`atan2B\` from \`core/math\`, which turns
 * them into floats once at module load.
 *
 * @module
 */

/** Binary-angle units in one full turn: 0 = +x, increasing clockwise (screen y is down). */
export const ANGLE_UNITS = ${ANGLE_UNITS};

/** Mask that wraps a binary angle into \`[0, ANGLE_UNITS)\` (\`ANGLE_UNITS\` is a power of two). */
export const ANGLE_MASK = ${ANGLE_UNITS - 1};

/** A quarter turn in binary units — the offset from sine to cosine in {@link SIN_TABLE_Q16}. */
export const ANGLE_QUARTER = ${ANGLE_QUARTER};

/** Fixed-point scale of {@link SIN_TABLE_Q16} (2^16; dividing by it is exact in IEEE 754). */
export const TRIG_SCALE = ${TRIG_SCALE};

/** Number of slope steps in {@link ATAN_TABLE}; entry \`k\` describes the slope \`k / 256\`. */
export const ATAN_TABLE_STEPS = ${ATAN_TABLE_STEPS};

/**
 * \`round(sin(2π·i / ANGLE_UNITS) · TRIG_SCALE)\` for \`i = 0 … ANGLE_UNITS + ANGLE_QUARTER − 1\`.
 *
 * @remarks
 * The extra quarter turn at the end lets \`cos(a)\` read \`SIN_TABLE_Q16[a + ANGLE_QUARTER]\`
 * without a second wrap. The table is exactly antisymmetric: entry \`a + 512\` is the
 * negation of entry \`a\`.
 */
export const SIN_TABLE_Q16: readonly number[] = [${sine.join(', ')}];

/**
 * \`round(atan(k / ATAN_TABLE_STEPS) · ANGLE_UNITS / 2π)\` for \`k = 0 … ATAN_TABLE_STEPS\`,
 * i.e. the binary angle (0 … 128, one octant) of a slope of \`k / 256\`.
 */
export const ATAN_TABLE: readonly number[] = [${atan.join(', ')}];
`;
}

/**
 * Builds the contents of `packages/core/src/math/trig-table.ts`.
 *
 * @returns {Promise<string>} The formatted module source.
 * @throws {Error} If the generated tables disagree with the host `Math` implementation.
 */
export async function generateTrigTable() {
  const sine = sineTable(quarterSineTable());
  const atan = atanTable();
  selfCheck(sine, atan);
  const options = (await resolveConfig(TRIG_TABLE_FILE)) ?? {};
  return format(render(sine, atan), { ...options, filepath: TRIG_TABLE_FILE });
}

/**
 * Command-line entry point: writes, or with `--check` only compares, the table module.
 *
 * @param {string[]} argv - Arguments after the script name.
 * @returns {Promise<number>} Process exit code.
 */
export async function main(argv) {
  const outIndex = argv.indexOf('--out');
  const out = outIndex === -1 ? TRIG_TABLE_FILE : argv[outIndex + 1];
  const source = await generateTrigTable();
  if (argv.includes('--check')) {
    const current = readFileSync(TRIG_TABLE_FILE, 'utf8');
    if (current === source) {
      process.stdout.write('trig-table.ts is up to date\n');
      return 0;
    }
    process.stderr.write('trig-table.ts is stale — run `node scripts/gen-trig-tables.mjs`\n');
    return 1;
  }
  if (out === undefined) {
    process.stderr.write('--out needs a file path\n');
    return 1;
  }
  writeFileSync(out, source);
  process.stdout.write(`wrote ${out}\n`);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
