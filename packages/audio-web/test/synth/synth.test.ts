/**
 * The deterministic synthesizer (plan M1-15): SFX parameter sets and chip songs render the same
 * samples every time (pinned hashes), song loop points are exact sample indices and the loop
 * region is the steady state of an unrolled render (the seam is sample-exact), and the track
 * parser reads the token syntax.
 */
import { describe, expect, it } from 'vitest';
import * as audioWeb from '../../src/index.js';
import {
  DEFAULT_SONG_VOLUME,
  SYNTH_SAMPLE_RATE,
  TrackStepKind,
  moduleInfo,
  noteFrequency,
  parseTrack,
  pcmHash,
  renderSfx,
  renderSong,
  semitoneRatio,
  sfxLength,
  sineOfCycle,
  songRowSamples,
  type SfxParams,
  type Song,
} from '../../src/synth/index.js';

const RATE = SYNTH_SAMPLE_RATE;

/** A parameter set touching every feature. */
const EVERYTHING: SfxParams = {
  shape: 'square',
  volume: 0.8,
  frequency: 660,
  randomness: 0.1,
  attack: 0.01,
  decay: 0.02,
  sustain: 0.05,
  sustainVolume: 0.6,
  release: 0.08,
  slide: -1200,
  pitchJump: 220,
  pitchJumpTime: 0.03,
  repeat: 0.06,
  modulation: 9,
  modulationDepth: 0.2,
  bitCrush: 3,
  tremolo: 0.3,
  tremoloRate: 15,
  duty: 0.25,
  seed: 42,
};

/** A small 4-channel song: a one-pattern intro, a two-pattern loop with ring-over. */
const SONG: Song = {
  speed: 6,
  instruments: {
    lead: {
      wave: 'pulse25',
      attack: 0.004,
      decay: 0.1,
      sustain: 0.6,
      release: 0.25,
      vibrato: { depth: 0.3, rate: 6, delay: 0.1 },
    },
    arp: { wave: 'pulse12', decay: 0.1, sustain: 0.4, arpeggio: [0, 4, 7], arpeggioTicks: 2 },
    bass: { wave: 'triangle', release: 0.05 },
    hat: { wave: 'noise', attack: 0, decay: 0.04, sustain: 0, release: 0.01 },
    kick: { wave: 'noise', attack: 0, decay: 0.08, sustain: 0, sweep: -90 },
    saw: { wave: 'saw', volume: 0.5 },
  },
  channels: [
    { instrument: 'lead', volume: 0.8 },
    { instrument: 'arp', volume: 0.5 },
    { instrument: 'bass' },
    { instrument: 'hat', volume: 0.7 },
  ],
  patterns: {
    intro: {
      rows: 8,
      tracks: ['=:4 C5:4', 'C4:8', 'C2:2 C3:2 C2:2 C3:2', 'C8 C8 C2@kick:2 C8:4'],
    },
    a: {
      rows: 16,
      // The lead holds for two rows: the note before the loop start rings into it.
      tracks: [
        '.:2 E5:2 G5:4 C6:6@saw -:2',
        'A3:8 F3:8',
        'A1:4 A2:4 F1:4 F2:4',
        'C2@kick:4 C8:4 C5:4 C8:4',
      ],
    },
    // The lead's last note rings over the loop end into the next pass.
    b: { rows: 16, tracks: ['.:2 D5:6 B4:8', 'G3:16', 'G1:8 G2:8', ''] },
  },
  order: ['intro', 'a', 'b'],
  loopFromOrder: 1,
};

describe('audio-web/synth', () => {
  it('describes itself and is exported from the package entry', () => {
    expect(moduleInfo.name).toBe('synth');
    expect(moduleInfo.status).toBe('implemented');
    expect(audioWeb.renderSong).toBe(renderSong);
    expect(audioWeb.renderSfx).toBe(renderSfx);
  });

  it('reproduces sines and pitch ratios from tables (no Math.sin / Math.pow)', () => {
    for (let i = 0; i < 1000; i++) {
      const phase = i / 1000;
      expect(Math.abs(sineOfCycle(phase) - Math.sin(2 * Math.PI * phase))).toBeLessThan(2e-5);
    }
    expect(noteFrequency(69)).toBe(440);
    expect(noteFrequency(81)).toBe(880);
    expect(noteFrequency(57)).toBe(220);
    for (let semis = -30; semis <= 30; semis += 0.25) {
      expect(Math.abs(semitoneRatio(semis) / Math.pow(2, semis / 12) - 1)).toBeLessThan(6e-4);
    }
  });
});

describe('audio-web/synth renderSfx', () => {
  it('renders the four envelope stages, rounded to whole samples', () => {
    const pcm = renderSfx(EVERYTHING, RATE);
    expect(pcm.length).toBe(sfxLength(EVERYTHING, RATE));
    expect(pcm.length).toBe(
      Math.round(0.01 * RATE) +
        Math.round(0.02 * RATE) +
        Math.round(0.05 * RATE) +
        Math.round(0.08 * RATE),
    );
    expect(renderSfx({ sustain: 0, release: 0 }, RATE)).toHaveLength(1);
    for (const value of pcm) expect(Math.abs(value)).toBeLessThanOrEqual(1);
    expect(pcm[0]).toBe(0); // attack starts from silence
  });

  it('is deterministic: the same parameters give the same samples (hash pinned)', () => {
    const a = renderSfx(EVERYTHING, RATE);
    const b = renderSfx({ ...EVERYTHING }, RATE);
    expect(b).toEqual(a);
    expect(pcmHash(a)).toBe(pcmHash(b));
    // Pinned: a change to the synth that alters this sound must update the hash on purpose.
    expect(pcmHash(a).toString(16)).toMatchInlineSnapshot(`"30e9895e"`);
    for (const shape of ['sine', 'triangle', 'saw', 'square', 'noise'] as const) {
      const one = renderSfx({ shape, frequency: 523, sustain: 0.05, seed: 7 }, RATE);
      expect(pcmHash(renderSfx({ shape, frequency: 523, sustain: 0.05, seed: 7 }, RATE))).toBe(
        pcmHash(one),
      );
    }
  });

  it('draws randomness and noise from the seed only', () => {
    const noise = (seed: number): Float32Array =>
      renderSfx({ shape: 'noise', frequency: 8000, randomness: 0.5, sustain: 0.05, seed }, RATE);
    expect(noise(1)).toEqual(noise(1));
    expect(pcmHash(noise(1))).not.toBe(pcmHash(noise(2)));
  });

  it('rejects a bad sample rate', () => {
    expect(() => renderSfx({}, 0)).toThrow(RangeError);
    expect(() => renderSfx({}, 22050.5)).toThrow(RangeError);
  });
});

describe('audio-web/synth parseTrack', () => {
  it('reads notes, holds, releases, cuts, lengths and instruments', () => {
    const parsed = parseTrack('  C4:2 . F#3 Bb5@pluck -:3 =  C-1 ');
    expect(parsed.error).toBe('bad token "C-1"');
    const ok = parseTrack('C4:2 . F#3 Bb5:4@pluck -:3 =');
    expect(ok.error).toBeNull();
    expect(ok.rows).toBe(12);
    expect(ok.steps).toEqual([
      { kind: TrackStepKind.Note, note: 60, rows: 2, instrument: null },
      { kind: TrackStepKind.Hold, note: 0, rows: 1, instrument: null },
      { kind: TrackStepKind.Note, note: 54, rows: 1, instrument: null },
      { kind: TrackStepKind.Note, note: 82, rows: 4, instrument: 'pluck' },
      { kind: TrackStepKind.Off, note: 0, rows: 3, instrument: null },
      { kind: TrackStepKind.Cut, note: 0, rows: 1, instrument: null },
    ]);
    expect(parseTrack('').steps).toEqual([]);
    expect(parseTrack('-@lead').error).toMatch(/only a note/);
    expect(parseTrack('C4:0').error).toMatch(/bad token/);
    expect(parseTrack('H4').error).toMatch(/bad token/);
  });
});

describe('audio-web/synth renderSong', () => {
  it('puts the loop points on exact row boundaries', () => {
    const spr = songRowSamples(SONG, RATE);
    expect(spr).toBe(2205);
    const song = renderSong(SONG, RATE);
    expect(song.sampleRate).toBe(RATE);
    expect(song.loopStart).toBe(8 * spr);
    expect(song.loopEnd).toBe((8 + 16 + 16) * spr);
    expect(song.pcm.length).toBe(song.loopEnd);
    expect(Number.isInteger(song.loopStart) && Number.isInteger(song.loopEnd)).toBe(true);
    // One assertion on the peak: an `expect` per sample (~88k) took ~5 s on a CI runner.
    let peak = 0;
    for (const value of song.pcm) peak = Math.max(peak, Math.abs(value));
    expect(peak).toBeLessThanOrEqual(1);
  });

  it('is deterministic (hash pinned)', () => {
    const a = renderSong(SONG, RATE);
    expect(renderSong(SONG, RATE).pcm).toEqual(a.pcm);
    expect(pcmHash(a.pcm).toString(16)).toMatchInlineSnapshot(`"3c64eb9e"`);
  }, 30_000); // two song renders: ~3.5 s on a busy CI runner

  it('holds the steady state in the loop region: the seam is sample-exact', () => {
    const looped = renderSong(SONG, RATE);
    const introLength = looped.loopStart;
    const loopLength = looped.loopEnd - looped.loopStart;
    // The same song unrolled as a one-shot: intro + the loop three times.
    const unrolled = renderSong(
      { ...SONG, order: ['intro', 'a', 'b', 'a', 'b', 'a', 'b'], loopFromOrder: null },
      RATE,
    ).pcm;
    const pass = (n: number): Float32Array =>
      unrolled.subarray(introLength + n * loopLength, introLength + (n + 1) * loopLength);
    // The intro is the unrolled intro; the loop region is the second (and third) pass, so playing
    // loopEnd − 1 → loopStart continues exactly like the unrolled song.
    expect(looped.pcm.subarray(0, introLength)).toEqual(unrolled.subarray(0, introLength));
    expect(looped.pcm.subarray(introLength)).toEqual(pass(1));
    expect(pass(2)).toEqual(pass(1));
    // The first pass differs: the lead still rings from the intro into it, not from the loop end.
    expect(pass(0)).not.toEqual(pass(1));
  }, 30_000); // a song plus its unrolled copy: ~4 s on a busy CI runner

  it('ends a one-shot song with its release tails and no loop', () => {
    const jingle = renderSong({ ...SONG, order: ['a'], loopFromOrder: undefined }, RATE);
    expect(jingle.loopStart).toBe(-1);
    expect(jingle.loopEnd).toBe(-1);
    // 16 rows + the longest release among the instruments used (lead 0.25 s).
    expect(jingle.pcm.length).toBe(16 * 2205 + Math.round(0.25 * RATE));
    expect(jingle.pcm[jingle.pcm.length - 1]).toBeCloseTo(0, 2);
  });

  it('applies the song volume (default 0.4) and clips to −1…1', () => {
    const quiet = renderSong({ ...SONG, volume: 0.1 }, RATE).pcm;
    const normal = renderSong(SONG, RATE).pcm;
    expect(DEFAULT_SONG_VOLUME).toBe(0.4);
    let peakQuiet = 0;
    let peakNormal = 0;
    for (let i = 0; i < normal.length; i++) {
      peakQuiet = Math.max(peakQuiet, Math.abs(quiet[i]));
      peakNormal = Math.max(peakNormal, Math.abs(normal[i]));
    }
    expect(peakQuiet).toBeGreaterThan(0);
    expect(peakQuiet).toBeLessThan(peakNormal);
    const loud = renderSong({ ...SONG, volume: 1 }, RATE).pcm;
    let peakLoud = 0;
    for (const value of loud) peakLoud = Math.max(peakLoud, Math.abs(value));
    expect(peakLoud).toBeLessThanOrEqual(1);
  });

  it('rejects malformed songs', () => {
    expect(() => renderSong({ ...SONG, order: ['nope'] }, RATE)).toThrow(/unknown pattern/);
    expect(() =>
      renderSong({ ...SONG, channels: [...SONG.channels.slice(0, 3), { instrument: 'x' }] }, RATE),
    ).toThrow(/unknown instrument/);
    expect(() =>
      renderSong(
        { ...SONG, patterns: { ...SONG.patterns, intro: { rows: 8, tracks: ['C4:7'] } } },
        RATE,
      ),
    ).toThrow(/7 rows, the pattern has 8/);
    expect(() => renderSong(SONG, -1)).toThrow(RangeError);
  });
});
