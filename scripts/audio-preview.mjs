#!/usr/bin/env node
/**
 * `pnpm audio:preview` — renders every placeholder sound effect and chip song of `content/audio/`
 * to 16-bit mono WAV files for listening (plan M1-15). The audio code is TypeScript
 * (`packages/audio-web/src/`), so it is loaded through Vite's `ssrLoadModule` (workspace packages
 * resolve to their sources through the `@shmup/source` condition); the content is validated by the
 * same owners the game uses, and an invalid file stops the script.
 *
 * Output (default `assets/generated/audio-preview/`, ignored by git):
 *
 * - `sfx/<Cue>.wav` — one file per synthesized `SFX_CUES` cue, volume baked in (a cue bound to a
 *   recorded `file` is skipped — it is already listenable);
 * - `music/<id>.wav` — a one-shot song as is; a looping song as intro + the loop **twice**, so the
 *   seam can be heard (the loop points are printed, in samples). File tracks are skipped too.
 *
 * Every file's `pcmHash` is printed next to it (the tests pin hashes the same way).
 *
 * Options: `--out DIR` (output directory), `--only NAME` (render just the cue or track `NAME`),
 * `--quiet`.
 *
 * **Public API.** {@link encodeWav}, {@link renderAudioPreview}, {@link DEFAULT_PREVIEW_DIR}.
 *
 * @module
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Repository root (this file lives in `scripts/`). */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Default output directory. */
export const DEFAULT_PREVIEW_DIR = join(REPO_ROOT, 'assets', 'generated', 'audio-preview');

/**
 * Encodes mono float samples as a 16-bit PCM WAV file.
 *
 * @param {Float32Array} pcm - Samples within −1…1 (clipped).
 * @param {number} sampleRate - Rate in Hz.
 * @returns {Uint8Array} The file bytes (44-byte RIFF header + data).
 */
export function encodeWav(pcm, sampleRate) {
  const dataBytes = pcm.length * 2;
  const bytes = new Uint8Array(44 + dataBytes);
  const view = new DataView(bytes.buffer);
  /**
   * Writes an ASCII tag.
   *
   * @param {number} offset - Byte offset.
   * @param {string} text - Four characters.
   */
  const tag = (offset, text) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  tag(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  tag(8, 'WAVE');
  tag(12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  tag(36, 'data');
  view.setUint32(40, dataBytes, true);
  for (let i = 0; i < pcm.length; i++) {
    const clipped = Math.max(-1, Math.min(1, pcm[i]));
    view.setInt16(44 + i * 2, Math.round(clipped * 32767), true);
  }
  return bytes;
}

/**
 * Renders the preview files.
 *
 * @param {{ out?: string, only?: string | null, log?: (line: string) => void }} [options] - Output
 *   directory, an optional single cue / track name, and a line logger.
 * @returns {Promise<{ files: string[] }>} The files written (absolute paths).
 * @throws {Error} When the audio content has validation issues or `only` matches nothing.
 */
export async function renderAudioPreview(options = {}) {
  const out = options.out ?? DEFAULT_PREVIEW_DIR;
  const only = options.only ?? null;
  const log = options.log ?? (() => {});
  const { createServer } = await import('vite');
  const server = await createServer({
    configFile: false,
    root: REPO_ROOT,
    logLevel: 'error',
    appType: 'custom',
    server: { middlewareMode: true, hmr: false, ws: false },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  try {
    const shared = /** @type {typeof import('../vite.shared.js')} */ (
      await server.ssrLoadModule('/vite.shared.ts')
    );
    const audio = /** @type {typeof import('../packages/audio-web/src/index.js')} */ (
      await server.ssrLoadModule('/packages/audio-web/src/index.ts')
    );
    const files = shared.readContentFiles();
    const sfx = audio.loadSfxContent(files.filter((file) => isKind(file.data, 'sfx')));
    const music = audio.loadMusicContent(files.filter((file) => isKind(file.data, 'music')));
    const issues = [...sfx.issues, ...music.issues];
    if (issues.length > 0) {
      throw new Error(
        `content/audio has ${issues.length} issue(s):\n` +
          issues.map((issue) => `  ${issue.path}: ${issue.message}`).join('\n'),
      );
    }
    const rate = audio.SYNTH_SAMPLE_RATE;
    /** @type {string[]} */
    const written = [];
    /**
     * Writes one WAV file.
     *
     * @param {string} file - Path below `out`.
     * @param {Float32Array} pcm - Samples.
     * @param {string} note - Extra log text.
     */
    const write = (file, pcm, note) => {
      const path = join(out, file);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, encodeWav(pcm, rate));
      written.push(path);
      const hash = audio.pcmHash(pcm).toString(16).padStart(8, '0');
      log(`${file}  ${(pcm.length / rate).toFixed(2)} s  hash ${hash}${note}`);
    };
    for (const def of sfx.content.cues) {
      if (def === null || def.params === null || (only !== null && def.cue !== only)) continue;
      const pcm = audio.renderSfx(def.params, rate);
      for (let i = 0; i < pcm.length; i++) pcm[i] *= def.volume;
      write(`sfx/${def.cue}.wav`, pcm, '');
    }
    for (const track of music.content.tracks) {
      if (track.song === null || (only !== null && track.id !== only)) continue;
      const started = performance.now();
      const song = audio.renderSong(track.song, rate);
      const ms = performance.now() - started;
      let pcm = song.pcm;
      let note = `  one-shot  (rendered in ${ms.toFixed(0)} ms)`;
      if (song.loopStart >= 0) {
        // Intro + loop + loop: the second copy follows the seam exactly like playback.
        const loop = song.pcm.subarray(song.loopStart, song.loopEnd);
        pcm = new Float32Array(song.pcm.length + loop.length);
        pcm.set(song.pcm, 0);
        pcm.set(loop, song.pcm.length);
        note =
          `  loop ${song.loopStart}…${song.loopEnd} samples` +
          ` (${(song.loopStart / rate).toFixed(2)}…${(song.loopEnd / rate).toFixed(2)} s,` +
          ` rendered in ${ms.toFixed(0)} ms)`;
      }
      write(`music/${track.id}.wav`, pcm, note);
    }
    if (only !== null && written.length === 0) throw new Error(`no cue or track named "${only}"`);
    return { files: written };
  } finally {
    await server.close();
  }
}

/**
 * Whether a parsed content document has a kind.
 *
 * @param {unknown} data - Parsed JSON.
 * @param {string} kind - The kind.
 * @returns {boolean} `true` for `{ kind }`.
 */
function isKind(data, kind) {
  return (
    typeof data === 'object' &&
    data !== null &&
    /** @type {{ kind?: unknown }} */ (data).kind === kind
  );
}

/**
 * Reads the command-line options.
 *
 * @param {string[]} args - `process.argv.slice(2)`.
 * @returns {{ out: string, only: string | null, quiet: boolean }} The options.
 * @throws {Error} For an unknown option (the CLI prints it and exits with code 1).
 */
function parseArgs(args) {
  let out = DEFAULT_PREVIEW_DIR;
  /** @type {string | null} */
  let only = null;
  let quiet = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--out') out = resolve(args[++i] ?? '');
    else if (arg === '--only') only = args[++i] ?? null;
    else if (arg === '--quiet') quiet = true;
    else throw new Error(`unknown option ${arg}`);
  }
  return { out, only, quiet };
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { out, only, quiet } = parseArgs(process.argv.slice(2));
    const { files } = await renderAudioPreview({
      out,
      only,
      log: quiet ? undefined : (line) => console.log(line),
    });
    if (!quiet) console.log(`audio:preview: ${files.length} file(s) in ${out}`);
  } catch (error) {
    console.error(`audio:preview: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
