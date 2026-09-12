/**
 * Edge cases of the deterministic synthesizer (plan M1-15): the SFX envelope sample by sample,
 * every parameter's effect in isolation (Nyquist clamp, slide below 0 Hz, pitch jump, repeat,
 * modulation, tremolo, bit-crush, volume, duty, seed), the chip song features one at a time (cut,
 * release, holds, `@instrument`, arpeggio / vibrato / sweep tick timing, wave levels, clipping,
 * tails, loop-point variants and the seam of a note ringing over the loop end), the track token
 * grammar, `pcmHash`, and one pinned hash per oscillator so a change to a single shape shows up on
 * its own.
 */
import { createRng } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import {
  CHIP_WAVES,
  DEFAULT_SFX_PARAMS,
  MAX_SONG_TAIL_SECONDS,
  SFX_SHAPES,
  SYNTH_SAMPLE_RATE,
  TrackStepKind,
  noteFrequency,
  parseTrack,
  pcmHash,
  renderSfx,
  renderSong,
  semitoneRatio,
  sfxLength,
  sineOfCycle,
  songRowSamples,
  type ChipWave,
  type SfxParams,
  type Song,
  type SongInstrument,
} from '../../src/synth/index.js';

const RATE = SYNTH_SAMPLE_RATE;

/** Samples per row at speed 6 and 22,050 Hz. */
const SPR = 2205;

/**
 * A "DC" sound: a saw at 0 Hz stays at −1, so `−pcm[i]` is exactly the envelope × volume.
 *
 * @param params - Envelope and effect fields.
 * @param rate - Sample rate.
 * @returns The samples.
 */
const dc = (params: SfxParams, rate = 1000): Float32Array =>
  renderSfx({ shape: 'saw', frequency: 0, ...params }, rate);

/**
 * A song of `channels` channels on instrument `lead` (plus any extra instruments).
 *
 * @param tracks - The single pattern's tracks.
 * @param rows - Rows of the pattern.
 * @param extra - Fields over the song (instruments are merged).
 * @returns The song.
 */
function song(
  tracks: readonly string[],
  rows = 4,
  extra: Partial<Song> & { lead?: SongInstrument } = {},
): Song {
  const { lead, ...rest } = extra;
  return {
    speed: 6,
    volume: 1,
    channels: [
      { instrument: 'lead' },
      { instrument: 'lead' },
      { instrument: 'lead' },
      { instrument: 'lead' },
    ],
    patterns: { p: { rows, tracks } },
    order: ['p'],
    loopFromOrder: null,
    ...rest,
    instruments: {
      lead: lead ?? { wave: 'pulse50', attack: 0 },
      ...rest.instruments,
    },
  };
}

/**
 * Largest absolute sample.
 *
 * @param pcm - Samples.
 * @param from - First index.
 * @param to - Index after the last.
 * @returns The peak.
 */
function peak(pcm: Float32Array, from = 0, to = pcm.length): number {
  let max = 0;
  for (let i = from; i < to; i++) max = Math.max(max, Math.abs(pcm[i]));
  return max;
}

/**
 * Index of the first sample where two renders differ (−1 = identical).
 *
 * @param a - First render.
 * @param b - Second render.
 * @returns The index.
 */
function firstDifference(a: Float32Array, b: Float32Array): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (!Object.is(a[i], b[i])) return i;
  return a.length === b.length ? -1 : n;
}

describe('audio-web/synth tables (edge)', () => {
  it('hits the exact table values at the quarter cycles', () => {
    expect(sineOfCycle(0)).toBe(0);
    expect(sineOfCycle(0.25)).toBe(1);
    expect(sineOfCycle(0.5)).toBeCloseTo(0, 12);
    expect(sineOfCycle(0.75)).toBe(-1);
    // Just below a full cycle it stays in range (the closing table sample is 0).
    expect(Math.abs(sineOfCycle(1 - 1e-12))).toBeLessThan(1e-6);
  });

  it('gives whole semitones exactly and octaves as powers of two', () => {
    expect(semitoneRatio(0)).toBe(1);
    expect(semitoneRatio(12)).toBe(2);
    expect(semitoneRatio(24)).toBe(4);
    expect(semitoneRatio(-12)).toBe(0.5);
    expect(semitoneRatio(-36)).toBe(0.125);
    expect(semitoneRatio(7)).toBe(1.4983070768766815);
    expect(semitoneRatio(-5)).toBe(1.4983070768766815 / 2);
    // Between two semitones: linear between the neighbours.
    expect(semitoneRatio(0.5)).toBe((1 + 1.0594630943592953) / 2);
    expect(noteFrequency(60)).toBeCloseTo(261.6255653005986, 9); // C4
    expect(noteFrequency(21)).toBeCloseTo(27.5, 12); // A0
    expect(noteFrequency(69 + 0.25)).toBeGreaterThan(440);
  });
});

describe('audio-web/synth renderSfx (edge)', () => {
  it('shapes the ADSR envelope sample by sample', () => {
    // 1 kHz: attack 10, decay 20, sustain 30, release 40 samples.
    const pcm = dc({ attack: 0.01, decay: 0.02, sustain: 0.03, sustainVolume: 0.5, release: 0.04 });
    const env = (i: number): number => -pcm[i];
    expect(pcm).toHaveLength(100);
    expect(env(0)).toBeCloseTo(0, 12);
    expect(env(5)).toBeCloseTo(0.5, 6);
    expect(env(9)).toBeCloseTo(0.9, 6);
    expect(env(10)).toBeCloseTo(1, 6); // decay starts at full level
    expect(env(20)).toBeCloseTo(0.75, 6);
    for (let i = 30; i < 60; i++) expect(env(i)).toBeCloseTo(0.5, 6); // sustain
    expect(env(60)).toBeCloseTo(0.5, 6); // release starts at the sustain level
    expect(env(80)).toBeCloseTo(0.25, 6);
    expect(env(99)).toBeCloseTo(0.5 / 40, 6);
  });

  it('rounds each stage to whole samples and is never empty', () => {
    expect(sfxLength({ attack: 0.00004, sustain: 0.00004, release: 0 }, RATE)).toBe(2);
    expect(sfxLength({ sustain: 0, release: 0 }, RATE)).toBe(1);
    expect(sfxLength({}, RATE)).toBe(2 * Math.round(0.1 * RATE));
    expect(sfxLength({ sustain: 0.1, release: 0.1 }, 44100)).toBe(8820);
    // A 0-length sound is a single silent-envelope sample.
    expect(renderSfx({ sustain: 0, release: 0 }, RATE)[0]).toBe(0);
  });

  it('fills fields left out with DEFAULT_SFX_PARAMS', () => {
    expect(renderSfx({}, RATE)).toEqual(renderSfx(DEFAULT_SFX_PARAMS, RATE));
    expect(Object.isFrozen(DEFAULT_SFX_PARAMS)).toBe(true);
    expect(Object.isFrozen(SFX_SHAPES)).toBe(true);
    expect([...SFX_SHAPES]).toEqual(['sine', 'triangle', 'saw', 'square', 'noise']);
  });

  it('clamps the frequency at Nyquist and at 0 Hz', () => {
    // Anything above 11,025 Hz at 22,050 Hz plays exactly as 11,025 Hz.
    const nyquist = renderSfx({ shape: 'saw', frequency: 11025, sustain: 0.01 }, RATE);
    expect(renderSfx({ shape: 'saw', frequency: 20000, sustain: 0.01 }, RATE)).toEqual(nyquist);
    expect(renderSfx({ shape: 'saw', frequency: 50, slide: 1e6, sustain: 0.01 }, RATE)).not.toEqual(
      nyquist,
    );
    // A slide below 0 Hz freezes the oscillator: the saw holds its level (sustain = flat envelope).
    const frozen = renderSfx(
      { shape: 'saw', frequency: 100, slide: -100000, sustain: 0.02, release: 0 },
      RATE,
    );
    expect(frozen.subarray(100).every((value) => value === frozen[100])).toBe(true);
  });

  it('jumps the pitch once its time has passed; repeat restarts the jump and the slide', () => {
    // 8 kHz, 0 Hz → 1 kHz after 80 samples (phase step 1/8).
    const jump = { pitchJump: 1000, pitchJumpTime: 0.01, sustain: 0.04, release: 0 };
    const pcm = dc(jump, 8000);
    for (let i = 0; i < 80; i++) expect(pcm[i]).toBe(-1);
    expect(pcm[80]).toBe(-0.75);
    expect(pcm[81]).toBe(-0.5);
    // Time 0 = never.
    expect(dc({ ...jump, pitchJumpTime: 0 }, 8000)).toEqual(dc({ ...jump, pitchJump: 0 }, 8000));
    // repeat 160 samples: 0 Hz again for samples 160…239 (the phase holds), 1 kHz from 240 on.
    const repeated = dc({ ...jump, repeat: 0.02 }, 8000);
    expect(firstDifference(repeated, pcm)).toBe(160);
    for (let i = 160; i < 240; i++) expect(repeated[i]).toBe(repeated[160]);
    expect(repeated[241]).not.toBe(repeated[240]);
  });

  it('modulates the frequency only with a depth, and the amplitude with tremolo', () => {
    const base: SfxParams = { shape: 'triangle', frequency: 300, sustain: 0.05 };
    const plain = renderSfx(base, RATE);
    expect(renderSfx({ ...base, modulation: 7, modulationDepth: 0 }, RATE)).toEqual(plain);
    expect(renderSfx({ ...base, modulation: 7, modulationDepth: 0.3 }, RATE)).not.toEqual(plain);
    // Tremolo 1 at a quarter cycle per sample: gain 1 − (0.5 + 0.5 · sin) = ½, 0, ½, 1, ½ …
    const trem = dc({ tremolo: 1, tremoloRate: 250, sustain: 0.01, release: 0 });
    expect(Array.from(trem.subarray(0, 5), (v) => -v)).toEqual([
      expect.closeTo(0.5, 6),
      expect.closeTo(0, 6),
      expect.closeTo(0.5, 6),
      expect.closeTo(1, 6),
      expect.closeTo(0.5, 6),
    ]);
    expect(dc({ tremolo: 0, tremoloRate: 250, sustain: 0.01 })).toEqual(dc({ sustain: 0.01 }));
  });

  it('holds every n-th sample with bitCrush (0 and 1 = off)', () => {
    const base: SfxParams = { shape: 'sine', frequency: 700, sustain: 0.02, seed: 3 };
    const raw = renderSfx(base, RATE);
    const crushed = renderSfx({ ...base, bitCrush: 4 }, RATE);
    expect(crushed).toHaveLength(raw.length);
    expect(crushed).toEqual(raw.map((_value, i) => raw[i - (i % 4)]));
    expect(renderSfx({ ...base, bitCrush: 1 }, RATE)).toEqual(raw);
    expect(renderSfx({ ...base, bitCrush: 0 }, RATE)).toEqual(raw);
  });

  it('scales exactly with the volume', () => {
    const base: SfxParams = { shape: 'square', frequency: 440, slide: -300, tremolo: 0.4 };
    const full = renderSfx({ ...base, volume: 1 }, RATE);
    const half = renderSfx({ ...base, volume: 0.5 }, RATE);
    expect(half).toEqual(full.map((value) => value * 0.5));
    expect(peak(renderSfx({ ...base, volume: 0 }, RATE))).toBe(0);
  });

  it('makes the square zero-mean with a peak of 1 at any duty', () => {
    for (const duty of [0.25, 0.5, 0.75]) {
      // 1 kHz at 8 kHz: exactly 8 samples a period (phase steps of 1/8); 64 samples of sustain.
      const pcm = renderSfx(
        { shape: 'square', frequency: 1000, duty, sustain: 0.008, release: 0 },
        8000,
      );
      expect(pcm).toHaveLength(64);
      let sum = 0;
      for (const value of pcm) sum += value;
      expect(peak(pcm), `duty ${duty}`).toBeCloseTo(1, 6);
      expect(sum / pcm.length, `duty ${duty}`).toBeCloseTo(0, 6);
    }
    for (const duty of [0.05, 0.95]) {
      // 100 Hz at 8 kHz: 80 samples a period, 8 periods.
      const pcm = renderSfx(
        { shape: 'square', frequency: 100, duty, sustain: 0.08, release: 0 },
        8000,
      );
      let sum = 0;
      for (const value of pcm) sum += value;
      expect(peak(pcm), `duty ${duty}`).toBeCloseTo(1, 6);
      expect(Math.abs(sum / pcm.length), `duty ${duty}`).toBeLessThan(0.02);
    }
  });

  it('uses the seed only for randomness and noise; the seed is taken as unsigned 32-bit', () => {
    const tone: SfxParams = { shape: 'square', frequency: 500, sustain: 0.02 };
    expect(renderSfx({ ...tone, seed: 1 }, RATE)).toEqual(renderSfx({ ...tone, seed: 99 }, RATE));
    expect(renderSfx({ ...tone, seed: 1, randomness: 0.5 }, RATE)).not.toEqual(
      renderSfx({ ...tone, seed: 99, randomness: 0.5 }, RATE),
    );
    const noise: SfxParams = { shape: 'noise', frequency: 4000, sustain: 0.02 };
    expect(renderSfx({ ...noise, seed: -1 }, RATE)).toEqual(
      renderSfx({ ...noise, seed: 0xffffffff }, RATE),
    );
    // Noise holds one random level per oscillator cycle: at 1 kHz / 8 kHz, runs of 8 samples.
    const runs = renderSfx({ shape: 'noise', frequency: 1000, sustain: 0.004, release: 0 }, 8000);
    for (let i = 1; i < 7; i++) expect(runs[i]).toBe(runs[0]);
    expect(runs[8]).not.toBe(runs[6]);
  });

  it('stays finite and within −1…1 across random parameter sets (seeded)', () => {
    const rng = createRng(20260912);
    const pick = (min: number, max: number): number => min + (max - min) * rng.nextFloat();
    for (let n = 0; n < 60; n++) {
      const params: SfxParams = {
        shape: SFX_SHAPES[Math.floor(rng.nextFloat() * SFX_SHAPES.length)],
        volume: pick(0, 1),
        frequency: pick(0, 20000),
        randomness: pick(0, 1),
        attack: pick(0, 0.05),
        decay: pick(0, 0.05),
        sustain: pick(0, 0.05),
        sustainVolume: pick(0, 1),
        release: pick(0, 0.05),
        slide: pick(-100000, 100000),
        pitchJump: pick(-20000, 20000),
        pitchJumpTime: pick(0, 0.1),
        repeat: pick(0, 0.1),
        modulation: pick(0, 1000),
        modulationDepth: pick(0, 1),
        bitCrush: Math.floor(pick(0, 64)),
        tremolo: pick(0, 1),
        tremoloRate: pick(0, 100),
        duty: pick(0.05, 0.95),
        seed: Math.floor(pick(0, 0xffffffff)),
      };
      const pcm = renderSfx(params, RATE);
      expect(pcm.length).toBe(sfxLength(params, RATE));
      const bad = pcm.findIndex((value) => !(Math.abs(value) <= 1));
      expect(bad, JSON.stringify(params)).toBe(-1);
    }
  });

  it('rejects every non-positive or non-integer sample rate', () => {
    for (const rate of [Number.NaN, Infinity, -22050, 0.5, 0]) {
      expect(() => renderSfx({}, rate), String(rate)).toThrow(RangeError);
    }
  });

  it('pins one hash per shape (a change to one oscillator shows up on its own)', () => {
    const hashes = SFX_SHAPES.map(
      (shape) =>
        `${shape} ${pcmHash(renderSfx({ shape, frequency: 523, sustain: 0.03, seed: 11 }, RATE)).toString(16)}`,
    );
    expect(hashes).toMatchInlineSnapshot(`
      [
        "sine 217e085f",
        "triangle 390c84ff",
        "saw 33562cf3",
        "square 666f367d",
        "noise c2c3b1be",
      ]
    `);
  });
});

describe('audio-web/synth parseTrack (edge)', () => {
  it('accepts the length and the instrument in either order', () => {
    expect(parseTrack('C4@kick:2')).toEqual(parseTrack('C4:2@kick'));
    expect(parseTrack('C4:2@kick').steps).toEqual([
      { kind: TrackStepKind.Note, note: 60, rows: 2, instrument: 'kick' },
    ]);
  });

  it('numbers notes from C0 = 12 (MIDI), with sharps and flats across octaves', () => {
    const notes = (text: string): number[] => parseTrack(text).steps.map((step) => step.note);
    expect(notes('C0 Cb0 B#8 A4 G8 E#3 Fb3')).toEqual([12, 11, 120, 69, 115, 53, 52]);
  });

  it('splits on any whitespace and adds up the rows', () => {
    const parsed = parseTrack('\tC4\n.:3  -\r\n=:999 ');
    expect(parsed.error).toBeNull();
    expect(parsed.steps.map((step) => step.kind)).toEqual([
      TrackStepKind.Note,
      TrackStepKind.Hold,
      TrackStepKind.Off,
      TrackStepKind.Cut,
    ]);
    expect(parsed.rows).toBe(1 + 3 + 1 + 999);
    expect(parseTrack('C4@my-inst-2').steps[0]?.instrument).toBe('my-inst-2');
    expect(parseTrack('   ')).toEqual({ steps: [], rows: 0, error: null });
  });

  it('rejects every malformed token and returns no steps', () => {
    for (const token of [
      'c4',
      'C9',
      'C##4',
      'Cbb4',
      'C4:2:3',
      'C4@a@b',
      'C4:1000',
      'C4:01',
      'C4@Kick',
      'C4@a--b',
      'C4@-a',
      'C4:',
      'C4@',
      ':2',
      '-:0',
      '..',
      'C',
    ]) {
      const parsed = parseTrack(`C4 ${token}`);
      expect(parsed.error, token).toBe(`bad token "${token}"`);
      expect(parsed.steps, token).toEqual([]);
      expect(parsed.rows, token).toBe(0);
    }
    for (const token of ['=@x', '.@x', '-:2@x']) {
      expect(parseTrack(token).error, token).toBe(`"${token}": only a note can name an instrument`);
    }
  });
});

describe('audio-web/synth renderSong (edge)', () => {
  it('rounds a row to whole samples at any speed and rate', () => {
    expect(songRowSamples({ speed: 6 }, RATE)).toBe(SPR);
    expect(songRowSamples({ speed: 7 }, RATE)).toBe(2573); // 2572.5 rounds up
    expect(songRowSamples({ speed: 1 }, 44100)).toBe(735);
    const rendered = renderSong(song(['C4:4'], 4, { loopFromOrder: 0 }), 44100);
    expect([rendered.loopStart, rendered.loopEnd, rendered.sampleRate]).toEqual([
      0,
      4 * 4410,
      44100,
    ]);
  });

  it('cuts a channel to silence at once with "="', () => {
    const pcm = renderSong(song(['C4:2 =:2']), RATE).pcm;
    expect(peak(pcm, 0, 2 * SPR)).toBeGreaterThan(0.9);
    expect(peak(pcm, 2 * SPR)).toBe(0); // the cut row, the rest and the release tail
  });

  it('releases a note with "-": the tail fades over the release time, then silence', () => {
    const release = 0.05;
    const tail = Math.round(release * RATE);
    const pcm = renderSong(
      song(['C4:2 -:2'], 4, { lead: { wave: 'pulse50', attack: 0, release } }),
      RATE,
    ).pcm;
    expect(Math.abs(pcm[2 * SPR])).toBeCloseTo(1, 6); // the release starts at the sustain level
    expect(peak(pcm, 2 * SPR + tail - 20, 2 * SPR + tail)).toBeLessThan(0.02);
    expect(peak(pcm, 2 * SPR + tail)).toBe(0);
    // Releasing a channel that never played, or twice, changes nothing.
    const again = renderSong(
      song(['C4:2 -:1 -:1', '-:4'], 4, { lead: { wave: 'pulse50', attack: 0, release } }),
      RATE,
    ).pcm;
    expect(again).toEqual(pcm);
  });

  it('treats empty, missing and hold-only tracks as silence, whatever the channel count', () => {
    const one = renderSong({ ...song(['C4:4']), channels: [{ instrument: 'lead' }] }, RATE).pcm;
    expect(renderSong(song(['C4:4']), RATE).pcm).toEqual(one);
    expect(renderSong(song(['C4:4', '', '.:4', '.:2 .:2']), RATE).pcm).toEqual(one);
    const six = {
      ...song(['C4:4']),
      channels: Array.from({ length: 6 }, () => ({ instrument: 'lead' })),
    };
    expect(renderSong(six, RATE).pcm).toEqual(one);
  });

  it('plays a note with another instrument through "@name"', () => {
    const saw: SongInstrument = { wave: 'saw', attack: 0.01, release: 0.2 };
    const loop = { loopFromOrder: 0 };
    const viaAt = renderSong(
      song(['C4:2@saw E4:2@saw'], 4, { ...loop, instruments: { saw } }),
      RATE,
    ).pcm;
    const viaDefault = renderSong(song(['C4:2 E4:2'], 4, { ...loop, lead: saw }), RATE).pcm;
    expect(viaAt).toEqual(viaDefault);
    expect(viaAt).not.toEqual(renderSong(song(['C4:2 E4:2'], 4, loop), RATE).pcm);
  });

  it('applies channel and song volumes and hard-clips the mix', () => {
    expect(peak(renderSong({ ...song(['C4:4']), volume: 0 }, RATE).pcm)).toBe(0);
    const muted = song(['C4:4']);
    const quiet = renderSong(
      { ...muted, channels: [{ instrument: 'lead', volume: 0 }, ...muted.channels.slice(1)] },
      RATE,
    ).pcm;
    expect(peak(quiet)).toBe(0);
    const half = renderSong({ ...song(['C4:4']), volume: 0.5 }, RATE).pcm;
    expect(peak(half)).toBeCloseTo(0.5, 6);
    // Six full-scale square waves in phase sum to ±6: clipped to exactly ±1.
    const loud = renderSong(
      {
        ...song(Array.from({ length: 6 }, () => 'C4:4')),
        channels: Array.from({ length: 6 }, () => ({ instrument: 'lead' })),
      },
      RATE,
    ).pcm;
    expect(Math.max(...loud)).toBe(1);
    expect(Math.min(...loud)).toBe(-1);
  });

  it('draws each chip wave from its own levels', () => {
    const wave = (w: ChipWave): Float32Array =>
      renderSong(song(['A4:8'], 8, { lead: { wave: w, attack: 0 }, loopFromOrder: 0 }), RATE).pcm;
    // 4-bit stepped triangle: 16 levels from −1 to 1.
    const levels = new Set(Array.from({ length: 16 }, (_v, i) => Math.fround(i / 7.5 - 1)));
    const triangle = wave('triangle');
    expect(triangle.every((value) => levels.has(value))).toBe(true);
    expect(new Set(triangle).size).toBe(16);
    // LFSR noise: ±1 only.
    expect(wave('noise').every((value) => Math.abs(value) === 1)).toBe(true);
    // Pulses: high 1, low −duty / (1 − duty); a duty's share of high samples.
    for (const [w, duty] of [
      ['pulse12', 0.125],
      ['pulse25', 0.25],
      ['pulse50', 0.5],
    ] as const) {
      const pcm = wave(w);
      const high = pcm.filter((value) => value === 1).length;
      const low = Math.fround(-duty / (1 - duty));
      expect(
        pcm.every((value) => value === 1 || value === low),
        w,
      ).toBe(true);
      expect(Math.abs(high / pcm.length - duty), w).toBeLessThan(0.01);
    }
    // Saw: −1 … 1 (a ramp).
    const saw = wave('saw');
    expect(Math.min(...saw)).toBeLessThan(-0.95);
    expect(Math.max(...saw)).toBeGreaterThan(0.95);
    expect(Object.isFrozen(CHIP_WAVES)).toBe(true);
  });

  it('changes pitch effects on tick boundaries only (arpeggio, sweep, delayed vibrato)', () => {
    const plain = renderSong(song(['A4:8'], 8), RATE).pcm;
    const withLead = (lead: SongInstrument): Float32Array =>
      renderSong(song(['A4:8'], 8, { lead }), RATE).pcm;
    // The first tick of a note is 367 samples at 22,050 Hz (floor(rate / 60)).
    const arp = withLead({ wave: 'pulse50', attack: 0, arpeggio: [0, 12], arpeggioTicks: 1 });
    expect(firstDifference(arp, plain)).toBeGreaterThanOrEqual(367);
    expect(firstDifference(arp, plain)).toBeLessThan(367 + 30);
    // Two ticks per step: the offset first changes at tick 2 (sample 735).
    const slowArp = withLead({ wave: 'pulse50', attack: 0, arpeggio: [0, 12], arpeggioTicks: 2 });
    expect(firstDifference(slowArp, plain)).toBeGreaterThanOrEqual(735);
    const sweep = withLead({ wave: 'pulse50', attack: 0, sweep: 60 });
    expect(firstDifference(sweep, plain)).toBeGreaterThanOrEqual(367);
    // Vibrato delayed 0.1 s = 6 ticks; at tick 6 its sine is 0, so it is first heard at tick 7.
    const vibrato = withLead({
      wave: 'pulse50',
      attack: 0,
      vibrato: { depth: 1, rate: 6, delay: 0.1 },
    });
    expect(firstDifference(vibrato, plain)).toBeGreaterThanOrEqual(Math.floor((7 * RATE) / 60));
    expect(firstDifference(vibrato, plain)).toBeGreaterThan(0);
  });

  it('caps a one-shot tail at MAX_SONG_TAIL_SECONDS and counts only instruments in use', () => {
    const long = renderSong(song(['C4:4'], 4, { lead: { wave: 'pulse50', release: 5 } }), RATE);
    expect(long.pcm).toHaveLength(4 * SPR + MAX_SONG_TAIL_SECONDS * RATE);
    const unused = renderSong(
      song(['C4:4'], 4, { instruments: { pad: { wave: 'saw', release: 5 } } }),
      RATE,
    );
    expect(unused.pcm).toHaveLength(4 * SPR + Math.round(0.03 * RATE)); // lead's default release
    const used = renderSong(
      song(['C4:2 C4:2@pad'], 4, { instruments: { pad: { wave: 'saw', release: 1 } } }),
      RATE,
    );
    expect(used.pcm).toHaveLength(4 * SPR + RATE);
  });

  it('treats a loopFromOrder outside the order list as a one-shot song', () => {
    const base = song(['C4:4']);
    for (const loopFromOrder of [1, 5, -1, 0.5, Number.NaN, null, undefined]) {
      const rendered = renderSong({ ...base, loopFromOrder }, RATE);
      expect([rendered.loopStart, rendered.loopEnd], String(loopFromOrder)).toEqual([-1, -1]);
    }
    const whole = renderSong({ ...base, loopFromOrder: 0 }, RATE);
    expect([whole.loopStart, whole.loopEnd, whole.pcm.length]).toEqual([0, 4 * SPR, 4 * SPR]);
    const last = renderSong({ ...base, order: ['p', 'p', 'p'], loopFromOrder: 2 }, RATE);
    expect([last.loopStart, last.loopEnd]).toEqual([8 * SPR, 12 * SPR]);
  });

  it('keeps the seam exact when the loop is the whole song and a note rings over its end', () => {
    // The only lead note is on the loop's last row and its release (1 s) outlasts the whole loop.
    const ring: Song = song(['.:3 C5:1', 'C3:2 -:2', '', ''], 4, {
      lead: { wave: 'pulse25', attack: 0.004, decay: 0.05, sustain: 0.6, release: 1 },
      loopFromOrder: 0,
    });
    const looped = renderSong(ring, RATE);
    const unrolled = renderSong(
      { ...ring, order: ['p', 'p', 'p', 'p'], loopFromOrder: null },
      RATE,
    );
    const length = looped.loopEnd - looped.loopStart;
    expect(length).toBe(4 * SPR);
    // Pass 2 and pass 3 of the unrolled song equal the loop region: wrapping is sample-exact.
    expect(unrolled.pcm.subarray(length, 2 * length)).toEqual(looped.pcm);
    expect(unrolled.pcm.subarray(2 * length, 3 * length)).toEqual(looped.pcm);
    // The first pass has no ring-over yet.
    expect(unrolled.pcm.subarray(0, length)).not.toEqual(looped.pcm);
  });

  it('renders a loop in which a channel only releases or cuts (no note-on) without failing', () => {
    const quiet: Song = {
      ...song(['C4:4'], 4, { lead: { wave: 'pulse50', release: 0.5 } }),
      patterns: { intro: { rows: 4, tracks: ['C4:4'] }, a: { rows: 4, tracks: ['-:2 =:2'] } },
      order: ['intro', 'a'],
      loopFromOrder: 1,
    };
    const rendered = renderSong(quiet, RATE);
    expect([rendered.loopStart, rendered.loopEnd]).toEqual([4 * SPR, 8 * SPR]);
    expect(peak(rendered.pcm, 6 * SPR)).toBe(0); // cut
  });

  it('does not take instrument or pattern names from the object prototype', () => {
    const base = song(['C4:4']);
    expect(() =>
      renderSong(
        { ...base, channels: [{ instrument: 'constructor' }, ...base.channels.slice(1)] },
        RATE,
      ),
    ).toThrow(/unknown instrument "constructor"/);
    expect(() => renderSong({ ...base, order: ['toString'] }, RATE)).toThrow(
      /unknown pattern "toString"/,
    );
    expect(() => renderSong(song(['C4:4@constructor']), RATE)).toThrow(
      /unknown instrument "constructor"/,
    );
    expect(() => renderSong(song(['C4:4 bad']), RATE)).toThrow(/pattern "p": bad token "bad"/);
    expect(() => renderSong(base, 22050.5)).toThrow(RangeError);
  });

  it('pins one hash per chip wave (a change to one oscillator shows up on its own)', () => {
    const hashes = CHIP_WAVES.map((wave) => {
      const pcm = renderSong(
        song(['A3:2 E4:2'], 4, {
          lead: { wave, decay: 0.05, sustain: 0.7, release: 0.1 },
          loopFromOrder: 0,
        }),
        RATE,
      ).pcm;
      return `${wave} ${pcmHash(pcm).toString(16)}`;
    });
    expect(hashes).toMatchInlineSnapshot(`
      [
        "pulse12 8dfa7fea",
        "pulse25 1cb002f6",
        "pulse50 7d61ef45",
        "triangle bd9ddf11",
        "noise 8e2823c5",
        "saw 1f4124e1",
      ]
    `);
  });
});

describe('audio-web/synth pcmHash (edge)', () => {
  it('fingerprints the float bit patterns of exactly the samples it is given', () => {
    expect(pcmHash(new Float32Array(0))).toBe(0x811c9dc5);
    expect(pcmHash(new Float32Array([0]))).not.toBe(pcmHash(new Float32Array([-0])));
    const pcm = renderSfx({ shape: 'noise', sustain: 0.01 }, RATE);
    const view = pcm.subarray(10, 90);
    expect(pcmHash(view)).toBe(pcmHash(view.slice()));
    expect(pcmHash(view)).not.toBe(pcmHash(pcm));
    const changed = pcm.slice();
    changed[100] = Math.fround(changed[100] + 1e-6);
    expect(pcmHash(changed)).not.toBe(pcmHash(pcm));
    expect(pcmHash(pcm)).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(pcmHash(pcm))).toBe(true);
  });
});
