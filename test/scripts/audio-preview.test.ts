/**
 * `pnpm audio:preview` (scripts/audio-preview.mjs, plan M1-15): the WAV encoder writes a valid
 * 16-bit mono RIFF file, and the script renders the shipped cues and songs through Vite's
 * `ssrLoadModule` into the requested folder (a looping song as intro + loop + loop).
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { encodeWav, renderAudioPreview } from '../../scripts/audio-preview.mjs';

const out = mkdtempSync(join(tmpdir(), 'shmup-audio-preview-'));

afterAll(() => {
  rmSync(out, { recursive: true, force: true });
});

describe('scripts/audio-preview', () => {
  it('encodes mono float samples as 16-bit PCM WAV', () => {
    const bytes = encodeWav(new Float32Array([0, 0.5, -1, 2]), 22050);
    const view = new DataView(bytes.buffer);
    const text = (offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
    expect([text(0), text(8), text(12), text(36)]).toEqual(['RIFF', 'WAVE', 'fmt ', 'data']);
    expect(bytes.length).toBe(44 + 8);
    expect(view.getUint32(4, true)).toBe(36 + 8);
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint32(24, true)).toBe(22050);
    expect(view.getUint16(34, true)).toBe(16);
    expect([0, 1, 2, 3].map((i) => view.getInt16(44 + 2 * i, true))).toEqual([
      0, 16384, -32767, 32767,
    ]);
  });

  it('renders a cue and a looping song from the shipped content', async () => {
    const lines: string[] = [];
    const cue = await renderAudioPreview({
      out,
      only: 'WarningSiren',
      log: (line) => lines.push(line),
    });
    expect(cue.files).toEqual([join(out, 'sfx', 'WarningSiren.wav')]);
    const song = await renderAudioPreview({ out, only: 'title', log: (line) => lines.push(line) });
    expect(song.files).toEqual([join(out, 'music', 'title.wav')]);
    const wav = readFileSync(song.files[0] ?? '');
    const frames = (wav.length - 44) / 2;
    const loop = /loop (\d+)…(\d+) samples/.exec(lines[1] ?? '');
    expect(loop).not.toBeNull();
    const [start, end] = [Number(loop?.[1]), Number(loop?.[2])];
    expect(frames).toBe(end + (end - start)); // intro + loop + loop
    expect(lines[0]).toMatch(/^sfx\/WarningSiren\.wav {2}0\.92 s {2}hash [0-9a-f]{8}$/);
    await expect(renderAudioPreview({ out, only: 'nope' })).rejects.toThrow(/no cue or track/);
  }, 60_000);
});
