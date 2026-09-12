/**
 * Edge cases of `pnpm audio:preview` (scripts/audio-preview.mjs, plan M1-15): the WAV encoder on
 * empty and out-of-range input; a full run renders one file per bound cue and per song, a cue's
 * preview being the very samples the game's loader prepares (same hash, volume baked in the same
 * way), a one-shot song written as is and a looping one as intro + loop + loop; and the command
 * line (`--out`, `--only`, `--quiet`, an unknown option → exit code 1). Two Vite servers in all.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SYNTH_SAMPLE_RATE,
  createAudioLoader,
  loadMusicContent,
  loadSfxContent,
  pcmHash,
  renderSong,
} from '@shmup/audio-web';
import { SFX_CUE_NAMES } from '@shmup/core';
import { afterAll, describe, expect, it } from 'vitest';
import { encodeWav, renderAudioPreview } from '../../scripts/audio-preview.mjs';
import { readContentFiles } from '../../vite.shared.js';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const out = mkdtempSync(join(tmpdir(), 'shmup-audio-preview-edge-'));

afterAll(() => {
  rmSync(out, { recursive: true, force: true });
});

/**
 * The shipped audio files of a kind.
 *
 * @param kind - `sfx` or `music`.
 * @returns The files.
 */
const shipped = (kind: string) =>
  readContentFiles().filter((file) => (file.data as { kind?: unknown }).kind === kind);

describe('scripts/audio-preview (edge)', () => {
  it('encodes an empty sound as a bare 44-byte header, clips and rounds the rest', () => {
    const empty = encodeWav(new Float32Array(0), 32000);
    const view = new DataView(empty.buffer);
    expect(empty.length).toBe(44);
    expect(view.getUint32(4, true)).toBe(36);
    expect(view.getUint32(40, true)).toBe(0);
    expect(view.getUint32(28, true)).toBe(64000); // byte rate = 2 bytes × rate
    const samples = encodeWav(new Float32Array([-3, 1, Number.NaN, 0.25]), 22050);
    const data = new DataView(samples.buffer, 44);
    expect([0, 1, 2, 3].map((i) => data.getInt16(2 * i, true))).toEqual([-32767, 32767, 0, 8192]);
  });

  it("renders every shipped cue and song, with exactly the samples the game's loader prepares", async () => {
    const lines: string[] = [];
    const { files } = await renderAudioPreview({ out, log: (line) => lines.push(line) });
    const sfx = loadSfxContent(shipped('sfx')).content;
    const music = loadMusicContent(shipped('music')).content;
    const cues = sfx.cues.filter((def) => def !== null && def.params !== null);
    expect(files).toHaveLength(cues.length + music.tracks.length);
    expect(lines).toHaveLength(files.length);
    /**
     * The hash printed for a file.
     *
     * @param file - Path below the output directory.
     * @returns The hex hash.
     */
    const printed = (file: string): string | undefined =>
      /hash ([0-9a-f]{8})/.exec(lines.find((line) => line.startsWith(`${file}  `)) ?? '')?.[1];
    const hex = (pcm: Float32Array): string => pcmHash(pcm).toString(16).padStart(8, '0');
    /**
     * Frames of a written WAV file.
     *
     * @param file - Path below the output directory.
     * @returns The frame count.
     */
    const frames = (file: string): number => (readFileSync(join(out, file)).length - 44) / 2;

    // A cue: the loader's samples (volume baked in the same way), hash and length.
    const sounds = await createAudioLoader().loadSfx(sfx);
    for (const cue of ['EnemyExplodeLarge', 'MenuMove', 'WarningSiren']) {
      const pcm = sounds[SFX_CUE_NAMES.indexOf(cue)]?.pcm;
      if (pcm === undefined || pcm === null) throw new Error(`${cue} not rendered`);
      expect(printed(`sfx/${cue}.wav`), cue).toBe(hex(pcm));
      expect(frames(`sfx/${cue}.wav`), cue).toBe(pcm.length);
    }
    // A one-shot song is written as it is; a looping one as intro + loop + loop.
    for (const track of music.tracks) {
      if (track.song === null) continue;
      const song = renderSong(track.song, SYNTH_SAMPLE_RATE);
      const file = `music/${track.id}.wav`;
      if (song.loopStart < 0) {
        expect(frames(file), track.id).toBe(song.pcm.length);
        expect(printed(file), track.id).toBe(hex(song.pcm));
        expect(lines.find((line) => line.startsWith(file))).toMatch(/ one-shot /);
      } else {
        expect(frames(file), track.id).toBe(song.loopEnd + (song.loopEnd - song.loopStart));
      }
    }
  }, 120_000);

  it('runs from the command line with --out / --only / --quiet and fails on unknown options', () => {
    const cliOut = join(out, 'cli');
    const run = (...args: string[]) =>
      spawnSync(process.execPath, ['scripts/audio-preview.mjs', ...args], {
        cwd: ROOT,
        encoding: 'utf8',
      });
    const quiet = run('--out', cliOut, '--only', 'MenuMove', '--quiet');
    expect(quiet.status).toBe(0);
    expect(quiet.stdout).toBe('');
    expect(readdirSync(join(cliOut, 'sfx'))).toEqual(['MenuMove.wav']);
    expect(existsSync(join(cliOut, 'music'))).toBe(false);
    const bad = run('--loud');
    expect(bad.status).toBe(1);
    expect(bad.stderr).toContain('audio:preview: unknown option --loud');
  }, 120_000);
});
