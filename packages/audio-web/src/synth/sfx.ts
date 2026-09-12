/**
 * Procedural sound effects: a ZzFX-style parameter set rendered to mono PCM (own implementation,
 * decision D23). Deterministic — the "randomness" and the noise come from the core's seeded sfc32
 * RNG, sines from the committed table — so one parameter set always renders the same samples.
 *
 * @module
 */
import { createRng } from '@shmup/core';
import { sineOfCycle } from './tables.js';

/** Oscillator shapes of {@link SfxParams.shape}. */
export type SfxShape = 'sine' | 'triangle' | 'saw' | 'square' | 'noise';

/** Every {@link SfxShape}, in documentation order. */
export const SFX_SHAPES: readonly SfxShape[] = Object.freeze([
  'sine',
  'triangle',
  'saw',
  'square',
  'noise',
]);

/**
 * A synthesized sound effect (all fields optional — see {@link DEFAULT_SFX_PARAMS}). Times are in
 * seconds, frequencies in Hz.
 */
export interface SfxParams {
  /** Oscillator shape (`noise` = a new random level every cycle, so pitch sets its colour). */
  readonly shape?: SfxShape;
  /** Output gain, 0…1. */
  readonly volume?: number;
  /** Start frequency. */
  readonly frequency?: number;
  /** Frequency varied by up to ± this fraction, once per render, from the seeded RNG (0…1). */
  readonly randomness?: number;
  /** Envelope: rise from silence to full level. */
  readonly attack?: number;
  /** Envelope: fall from full level to {@link SfxParams.sustainVolume}. */
  readonly decay?: number;
  /** Envelope: time held at {@link SfxParams.sustainVolume}. */
  readonly sustain?: number;
  /** Envelope: sustain level, 0…1. */
  readonly sustainVolume?: number;
  /** Envelope: fade to silence. */
  readonly release?: number;
  /** Linear pitch slide in Hz per second (negative falls). */
  readonly slide?: number;
  /** Hz added to the frequency once {@link SfxParams.pitchJumpTime} has passed. */
  readonly pitchJump?: number;
  /** When the pitch jump happens (0 = never). */
  readonly pitchJumpTime?: number;
  /** Restarts the slide and the pitch jump every this many seconds (0 = never — arpeggio-like). */
  readonly repeat?: number;
  /** Rate of a sine frequency modulation (0 = off — vibrato, sirens). */
  readonly modulation?: number;
  /** Depth of the modulation as a fraction of the frequency, 0…1. */
  readonly modulationDepth?: number;
  /** Sample-and-hold length in samples (bit-crush grit; 0 or 1 = off). */
  readonly bitCrush?: number;
  /** Amplitude modulation depth, 0…1 (0 = off). */
  readonly tremolo?: number;
  /** Tremolo rate. */
  readonly tremoloRate?: number;
  /** Duty cycle of the `square` shape, 0.05…0.95. */
  readonly duty?: number;
  /** Seed of the RNG behind `randomness` and `noise` (32-bit unsigned). */
  readonly seed?: number;
}

/** The values {@link renderSfx} uses for fields a parameter set leaves out. */
export const DEFAULT_SFX_PARAMS: Readonly<Required<SfxParams>> = Object.freeze({
  shape: 'square',
  volume: 1,
  frequency: 440,
  randomness: 0,
  attack: 0,
  decay: 0,
  sustain: 0.1,
  sustainVolume: 1,
  release: 0.1,
  slide: 0,
  pitchJump: 0,
  pitchJumpTime: 0,
  repeat: 0,
  modulation: 0,
  modulationDepth: 0.5,
  bitCrush: 0,
  tremolo: 0,
  tremoloRate: 12,
  duty: 0.5,
  seed: 1,
});

/** Shape codes of the render loop. */
const SHAPE_CODE: Readonly<Record<SfxShape, number>> = Object.freeze({
  sine: 0,
  triangle: 1,
  saw: 2,
  square: 3,
  noise: 4,
});

/**
 * Number of samples {@link renderSfx} produces for a parameter set: the four envelope stages,
 * each rounded to whole samples, at least 1.
 *
 * @param params - The parameter set.
 * @param sampleRate - Output rate in Hz.
 * @returns The length in samples.
 */
export function sfxLength(params: SfxParams, sampleRate: number): number {
  const d = DEFAULT_SFX_PARAMS;
  const total =
    Math.round((params.attack ?? d.attack) * sampleRate) +
    Math.round((params.decay ?? d.decay) * sampleRate) +
    Math.round((params.sustain ?? d.sustain) * sampleRate) +
    Math.round((params.release ?? d.release) * sampleRate);
  return total > 0 ? total : 1;
}

/**
 * Renders a sound effect to mono PCM.
 *
 * @remarks
 * Per sample: frequency = start frequency (± randomness) + slide × t (+ pitch jump after its
 * time; `repeat` restarts t) × (1 + depth · sin(modulation)) clamped to 0…Nyquist; the oscillator
 * advances by frequency / rate; the value is shaped (sine from the committed table; the square is
 * zero-mean with peak 1 at any duty), scaled by the linear ADSR envelope, the volume and the
 * tremolo, then held for `bitCrush` samples. Deterministic: same parameters and rate → the same
 * samples on every engine (no `Math.random`, `Math.sin` or `Math.pow`). Load-time code — it
 * allocates the result.
 *
 * @param params - The parameter set (missing fields take {@link DEFAULT_SFX_PARAMS}).
 * @param sampleRate - Output rate in Hz (placeholders use 22,050).
 * @returns The samples, `sfxLength(params, sampleRate)` long, within −1…1.
 * @throws {RangeError} When `sampleRate` is not a positive integer.
 *
 * @example
 * ```ts
 * const blip = renderSfx({ shape: 'square', frequency: 1200, slide: -9000, sustain: 0.015 }, 22050);
 * ```
 */
export function renderSfx(params: SfxParams, sampleRate: number): Float32Array {
  if (!Number.isInteger(sampleRate) || sampleRate <= 0) {
    throw new RangeError(`sampleRate must be a positive integer, got ${sampleRate}`);
  }
  const d = DEFAULT_SFX_PARAMS;
  const shape = SHAPE_CODE[params.shape ?? d.shape];
  const volume = params.volume ?? d.volume;
  const rng = createRng((params.seed ?? d.seed) >>> 0);
  const randomness = params.randomness ?? d.randomness;
  const base = (params.frequency ?? d.frequency) * (1 + randomness * (rng.nextFloat() * 2 - 1));
  const attack = Math.round((params.attack ?? d.attack) * sampleRate);
  const decay = Math.round((params.decay ?? d.decay) * sampleRate);
  const sustain = Math.round((params.sustain ?? d.sustain) * sampleRate);
  const release = Math.round((params.release ?? d.release) * sampleRate);
  const sustainVolume = params.sustainVolume ?? d.sustainVolume;
  const slidePerSample = (params.slide ?? d.slide) / sampleRate;
  const pitchJump = params.pitchJump ?? d.pitchJump;
  const jumpAt = Math.round((params.pitchJumpTime ?? d.pitchJumpTime) * sampleRate);
  const repeatAt = Math.round((params.repeat ?? d.repeat) * sampleRate);
  const modStep = (params.modulation ?? d.modulation) / sampleRate;
  const modDepth = params.modulationDepth ?? d.modulationDepth;
  const crush = Math.floor(params.bitCrush ?? d.bitCrush);
  const tremolo = params.tremolo ?? d.tremolo;
  const tremStep = (params.tremoloRate ?? d.tremoloRate) / sampleRate;
  const duty = params.duty ?? d.duty;
  // Zero-mean pulse with peak 1: high = (1 − duty) / m, low = −duty / m, m = max(duty, 1 − duty).
  const dutyScale = 1 / (duty > 0.5 ? duty : 1 - duty);
  const high = (1 - duty) * dutyScale;
  const low = -duty * dutyScale;
  const nyquist = sampleRate / 2;
  const length = sfxLength(params, sampleRate);
  const out = new Float32Array(length);

  const decayEnd = attack + decay;
  const sustainEnd = decayEnd + sustain;
  let phase = 0;
  let modPhase = 0;
  let tremPhase = 0;
  let t = 0;
  let noise = rng.nextFloat() * 2 - 1;
  let held = 0;
  let holdLeft = 0;
  for (let i = 0; i < length; i++) {
    let env: number;
    if (i < attack) env = i / attack;
    else if (i < decayEnd) env = 1 - ((1 - sustainVolume) * (i - attack)) / decay;
    else if (i < sustainEnd) env = sustainVolume;
    else env = release > 0 ? sustainVolume * (1 - (i - sustainEnd) / release) : 0;

    let f = base + slidePerSample * t;
    if (jumpAt > 0 && t >= jumpAt) f += pitchJump;
    if (modStep > 0) {
      f *= 1 + modDepth * sineOfCycle(modPhase);
      modPhase += modStep;
      if (modPhase >= 1) modPhase -= Math.floor(modPhase);
    }
    if (f < 0) f = 0;
    else if (f > nyquist) f = nyquist;
    phase += f / sampleRate;
    if (phase >= 1) {
      phase -= Math.floor(phase);
      if (shape === 4) noise = rng.nextFloat() * 2 - 1;
    }

    let value: number;
    switch (shape) {
      case 0:
        value = sineOfCycle(phase);
        break;
      case 1:
        value = phase < 0.5 ? 4 * phase - 1 : 3 - 4 * phase;
        break;
      case 2:
        value = 2 * phase - 1;
        break;
      case 3:
        value = phase < duty ? high : low;
        break;
      default:
        value = noise;
    }
    value *= env * volume;
    if (tremolo > 0) {
      value *= 1 - tremolo * (0.5 + 0.5 * sineOfCycle(tremPhase));
      tremPhase += tremStep;
      if (tremPhase >= 1) tremPhase -= Math.floor(tremPhase);
    }
    if (crush > 1) {
      if (holdLeft === 0) {
        held = value;
        holdLeft = crush;
      }
      holdLeft--;
      value = held;
    }
    out[i] = value;
    t++;
    if (repeatAt > 0 && t >= repeatAt) t = 0;
  }
  return out;
}
