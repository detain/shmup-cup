/**
 * The units of the audio content schemas (plan_resolution.md R1-03, owner decision O1): every
 * number of an `sfx` and a `music` file declares a unit, every audio unit keeps its value in a
 * port, and the exported file schemas are the ones the loaders validate with.
 */
import { UNIT_RULES, listNumberFields, type NumberField, type ValidationIssue } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import * as audioWeb from '../../src/index.js';
import {
  MUSIC_FILE_SCHEMA,
  SFX_FILE_SCHEMA,
  loadMusicContent,
  loadSfxContent,
} from '../../src/loader/index.js';

/**
 * A schema's numeric fields as `path → unit`.
 *
 * @param fields - What `listNumberFields` found.
 * @returns The map.
 */
const unitsOf = (fields: readonly NumberField[]): Record<string, string | undefined> => {
  const out: Record<string, string | undefined> = {};
  for (const field of fields) out[field.path] = field.unit;
  return out;
};

describe('audio-web/loader: the units of the file schemas (R1-03)', () => {
  it('exports both file schemas from the package barrel', () => {
    expect(audioWeb.SFX_FILE_SCHEMA).toBe(SFX_FILE_SCHEMA);
    expect(audioWeb.MUSIC_FILE_SCHEMA).toBe(MUSIC_FILE_SCHEMA);
  });

  it('gives every number of an sfx file a unit that a port leaves alone', () => {
    const { fields, opaque } = listNumberFields(SFX_FILE_SCHEMA);
    expect(opaque).toEqual([]);
    expect(fields.length).toBe(22);
    for (const field of fields) {
      expect(field.unit, field.path).toBeDefined();
      expect(UNIT_RULES[field.unit ?? 'param'], field.path).toBe('keep');
    }
    expect(unitsOf(fields)).toEqual({
      formatVersion: 'version',
      'cues.*.maxInstances': 'count',
      'cues.*.volume': 'ratio',
      'cues.*.params.volume': 'ratio',
      'cues.*.params.frequency': 'hz',
      'cues.*.params.randomness': 'ratio',
      'cues.*.params.attack': 'seconds',
      'cues.*.params.decay': 'seconds',
      'cues.*.params.sustain': 'seconds',
      'cues.*.params.sustainVolume': 'ratio',
      'cues.*.params.release': 'seconds',
      'cues.*.params.slide': 'hz',
      'cues.*.params.pitchJump': 'hz',
      'cues.*.params.pitchJumpTime': 'seconds',
      'cues.*.params.repeat': 'seconds',
      'cues.*.params.modulation': 'hz',
      'cues.*.params.modulationDepth': 'ratio',
      'cues.*.params.bitCrush': 'samples',
      'cues.*.params.tremolo': 'ratio',
      'cues.*.params.tremoloRate': 'hz',
      'cues.*.params.duty': 'ratio',
      'cues.*.params.seed': 'seed',
    });
  });

  it('gives every number of a music file a unit that a port leaves alone', () => {
    const { fields, opaque } = listNumberFields(MUSIC_FILE_SCHEMA);
    expect(opaque).toEqual([]);
    for (const field of fields) {
      expect(field.unit, field.path).toBeDefined();
      expect(UNIT_RULES[field.unit ?? 'param'], field.path).toBe('keep');
    }
    expect(unitsOf(fields)).toEqual({
      formatVersion: 'version',
      'song.speed': 'ticks',
      'song.volume': 'ratio',
      'song.instruments.*.volume': 'ratio',
      'song.instruments.*.attack': 'seconds',
      'song.instruments.*.decay': 'seconds',
      'song.instruments.*.sustain': 'ratio',
      'song.instruments.*.release': 'seconds',
      'song.instruments.*.vibrato.depth': 'semitones',
      'song.instruments.*.vibrato.rate': 'hz',
      'song.instruments.*.vibrato.delay': 'seconds',
      'song.instruments.*.arpeggio[]': 'semitones',
      'song.instruments.*.arpeggioTicks': 'ticks',
      'song.instruments.*.sweep': 'semitones',
      'song.channels[].volume': 'ratio',
      'song.patterns.*.rows': 'count',
      'song.loopFromOrder': 'index',
      loopStart: 'samples',
      loopEnd: 'samples',
      sampleRate: 'hz',
    });
  });

  it('validates with the exported schemas: what they reject, the loaders report', () => {
    const sfx = { formatVersion: 1, kind: 'sfx', cues: { PlayerShot: { priority: 'x' } } };
    const sfxIssues: ValidationIssue[] = [];
    expect(SFX_FILE_SCHEMA.parse(sfx, '', sfxIssues)).toBeUndefined();
    expect(sfxIssues.length).toBeGreaterThan(0);
    const loadedSfx = loadSfxContent([{ path: 'a.sfx.json', data: sfx }]);
    expect(loadedSfx.issues.map((issue) => issue.path)).toEqual(
      sfxIssues.map((issue) => `a.sfx.json:${issue.path}`),
    );
    const music = { formatVersion: 1, kind: 'music', id: 'a', title: 'A', loopStart: -1 };
    const musicIssues: ValidationIssue[] = [];
    expect(MUSIC_FILE_SCHEMA.parse(music, '', musicIssues)).toBeUndefined();
    expect(musicIssues.length).toBeGreaterThan(0);
    const loadedMusic = loadMusicContent([{ path: 'a.music.json', data: music }]);
    expect(loadedMusic.issues.map((issue) => issue.path)).toEqual(
      musicIssues.map((issue) => `a.music.json:${issue.path}`),
    );
  });
});
