/**
 * Exactly reproducible lookup tables for the synthesizer: an interpolated sine built from the
 * core's committed integer table (`SIN_TABLE_Q16`) and the twelve equal-tempered semitone ratios
 * as literals. Nothing here calls `Math.sin` / `Math.pow`, so rendered PCM is bit-identical on
 * every JavaScript engine (the TV's Chromium 69, Node, a desktop browser) — only IEEE `+ - × ÷`.
 *
 * @module
 */
import { ANGLE_UNITS, SIN_TABLE_Q16, TRIG_SCALE } from '@shmup/core';

/** One cycle of the sine plus the closing sample, as doubles (`SINE[ANGLE_UNITS] === 0`). */
const SINE = new Float64Array(ANGLE_UNITS + 1);
for (let i = 0; i <= ANGLE_UNITS; i++) SINE[i] = SIN_TABLE_Q16[i] / TRIG_SCALE;

/**
 * Sine of a phase given in **cycles**, linearly interpolated from the committed table
 * (error below 1e-5 — inaudible).
 *
 * @param phase - Phase in cycles, `0 ≤ phase < 1` (callers keep it wrapped).
 * @returns `sin(2π · phase)`.
 */
export function sineOfCycle(phase: number): number {
  const x = phase * ANGLE_UNITS;
  const i = Math.floor(x);
  const a = SINE[i];
  return a + (SINE[i + 1] - a) * (x - i);
}

/** `2^(k/12)` for `k = 0 … 12` (committed literals — no `Math.pow`). */
const SEMITONE_RATIOS: readonly number[] = [
  1, 1.0594630943592953, 1.122462048309373, 1.189207115002721, 1.2599210498948732,
  1.3348398541700344, 1.4142135623730951, 1.4983070768766815, 1.5874010519681994, 1.681792830507429,
  1.7817974362806785, 1.8877486253633868, 2,
];

/**
 * Frequency ratio of an interval in semitones: exact for whole semitones, linearly interpolated
 * between them (within a cent — fine for vibrato and pitch sweeps).
 *
 * @param semitones - Interval, any sign.
 * @returns `≈ 2^(semitones / 12)`.
 */
export function semitoneRatio(semitones: number): number {
  const whole = Math.floor(semitones);
  const frac = semitones - whole;
  let octaves = Math.floor(whole / 12);
  const k = whole - octaves * 12;
  let ratio = SEMITONE_RATIOS[k] + (SEMITONE_RATIOS[k + 1] - SEMITONE_RATIOS[k]) * frac;
  while (octaves > 0) {
    ratio *= 2;
    octaves--;
  }
  while (octaves < 0) {
    ratio *= 0.5;
    octaves++;
  }
  return ratio;
}

/**
 * Frequency of a MIDI note number (A4 = 69 = 440 Hz, C4 = 60).
 *
 * @param note - MIDI note (fractional values allowed).
 * @returns Frequency in Hz.
 */
export function noteFrequency(note: number): number {
  return 440 * semitoneRatio(note - 69);
}
