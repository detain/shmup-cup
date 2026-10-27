#!/usr/bin/env node
/**
 * The v2 video cutscene encode kit (lane v20x-VID, plan V1; owner ruling of 2026-10-27).
 *
 * Turns the committed AI winner clips under `art-prompts/v2/winners/video/` into the game's
 * shipped cutscene files: one deterministic ffmpeg pass per clip — **640×360, silent, H.264
 * High profile at level ≤ 4.2, yuv420p, faststart** — into `assets/generated/video/`, beside
 * the provenance sidecar of every winner (the LTX-2.x Community Licence keeps its metadata and
 * records with the clip), a `LICENSES-videos.md` notice (every clip disclaimed as machine
 * generated where it is shown — Attachment A (5), see `docs/dev/art-provenance.md` §3.6) and a
 * **size ledger** (`video-ledger.json`: bytes and sha256 of every output) that the shell's
 * clip-manifest test pins the committed manifest against.
 *
 * The clip set, the encoding parameters and the trigger table are fixed data of this file: the
 * same source bytes and the same ffmpeg build give the same output bytes (`--check` proves it
 * by re-encoding to a temp folder and diffing the sha256), so the ledger and the manifest's
 * `bytes` fields are honest pins, like the atlas digest.
 *
 * **Not in CI.** The kit needs `ffmpeg` and `ffprobe` on PATH. Without them it prints a loud
 * skip report and exits `0` — CI has no ffmpeg, so the video folder stays empty there, the TV
 * build ships no clips and the director degrades every clip to silence (the procedural scene
 * runs as it does today). Run it where the binaries exist (this machine has them) before
 * `pnpm --filter @shmup/tizen build` to fill the bundle.
 *
 * Usage:
 *
 *   node scripts/v20x/video-encode.mjs             # encode every clip, write ledger + licences
 *   node scripts/v20x/video-encode.mjs --check     # verify existing outputs against the ledger
 *   node scripts/v20x/video-encode.mjs --rerun     # re-encode and prove the bytes are identical
 *   node scripts/v20x/video-encode.mjs --only title-sting,warn-zone-a
 *
 * @module
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FRAME_H, FRAME_W } from '../frame.mjs';

/** Repository root (this file lives in `scripts/v20x/`). */
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The winner clips this kit reads; git-tracked. */
const WINNER_DIR = join(repoRoot, 'art-prompts', 'v2', 'winners', 'video');

/** The pipeline output folder (git-ignored, like `assets/generated/atlas/`). */
const OUT_DIR = join(repoRoot, 'assets', 'generated', 'video');

/** The ledger's file name inside {@link OUT_DIR}. */
const LEDGER_FILE = 'video-ledger.json';

/** The licence notice written next to the clips (shipped in `dist/assets/video/`). */
const LICENSES_FILE = 'LICENSES-videos.md';

/**
 * One shipped clip: the game's id, the winner directory it comes from, what shows it, and
 * whether the cutscene director loops it. `fps` is the encode's target (CFR, from the source's
 * probe — recorded here so the parameters are reviewable); `gop` is 2×fps.
 */
const CLIPS = Object.freeze(
  /** @type {const} */ ([
    { id: 'title-sting', winner: 'logo-sting', fps: 24, trigger: 'title' },
    {
      id: 'attract-ambient',
      winner: 'title-ambient-loop',
      fps: 30,
      trigger: 'attract',
      loop: true,
    },
    { id: 'story-vista', winner: 'story-crawl-vista', fps: 24, trigger: 'story' },
    { id: 'warn-zone-a', winner: 'halcyon-bulwark-shield', fps: 16, trigger: 'warning-A' },
    { id: 'warn-zone-b', winner: 'galvanic-maw-jaw', fps: 24, trigger: 'warning-B' },
    { id: 'warn-zone-c', winner: 'sandgrave-widow-silk', fps: 24, trigger: 'warning-C' },
    { id: 'warn-zone-d', winner: 'zone-magma-deep-cone', fps: 24, trigger: 'warning-D' },
    { id: 'warn-zone-e', winner: 'squall-steed-storm', fps: 24, trigger: 'warning-E' },
    { id: 'warn-zone-g', winner: 'zone-prism-labyrinth-refraction', fps: 24, trigger: 'warning-G' },
    { id: 'warn-zone-h', winner: 'zone-iron-citadel-chase', fps: 24, trigger: 'warning-H' },
    { id: 'warn-zone-i', winner: 'hollow-king-lure', fps: 16, trigger: 'warning-I' },
    { id: 'ark-sailing', winner: 'abyss-ark-sailing', fps: 24, trigger: 'defeat-I' },
    { id: 'escape-collapse', winner: 'escape-citadel-collapse', fps: 24, trigger: 'escape' },
    { id: 'hull-explosions', winner: 'chained-hull-explosions', fps: 24, trigger: 'defeat-escape' },
    { id: 'dawn-flight', winner: 'dawn-flight-home', fps: 24, trigger: 'epilogue' },
  ]),
);

/** The engine floor's codec contract: what ffprobe must report for every output. */
const CODEC = Object.freeze({
  width: FRAME_W,
  height: FRAME_H,
  profile: 'High',
  /** H.264 level as ffprobe reports it (42 = 4.2 — the Tizen 5.5 / webOS 5 ceiling). */
  maxLevel: 42,
  pixFmt: 'yuv420p',
});

/**
 * Runs ffmpeg/ffprobe and returns stdout.
 *
 * @param {string} program - `'ffmpeg'` or `'ffprobe'`.
 * @param {string[]} args - The arguments.
 * @returns {string} The stdout text.
 * @throws When the process fails (its stderr is printed first).
 */
function run(program, args) {
  const proc = spawnSync(program, args, { encoding: 'utf8' });
  if (proc.error !== undefined || proc.status !== 0) {
    if (proc.stderr) process.stderr.write(proc.stderr);
    throw new Error(`${program} ${args.join(' ')} failed (exit ${String(proc.status)})`);
  }
  return proc.stdout;
}

/**
 * Whether a binary answers on PATH.
 *
 * @param {string} program - The binary name.
 * @returns {boolean} True when `program -version` runs.
 */
function hasBinary(program) {
  try {
    return spawnSync(program, ['-version'], { encoding: 'utf8' }).status === 0;
  } catch {
    return false;
  }
}

/** The ffmpeg version banner (recorded in the ledger, so a byte pin names its tool). */
function ffmpegVersion() {
  const out = run('ffmpeg', ['-hide_banner', '-version']);
  const first = out.split('\n', 1)[0];
  return first.trim();
}

/**
 * The source frames-per-second of a clip, rounded (its `r_frame_rate`).
 *
 * @param {string} file - The source MP4.
 * @returns {number} Whole fps.
 */
function sourceFps(file) {
  const rate = run('ffprobe', [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=r_frame_rate',
    '-of',
    'csv=p=0',
    file,
  ]).trim();
  const [num, den] = rate.split('/').map(Number);
  return Math.round(den === 0 || Number.isNaN(den) ? num : num / den);
}

/**
 * One value from ffprobe (`-of default=nk=1:nw=1:nokey=1`).
 *
 * @param {string} file - The MP4.
 * @param {string} entry - Like `'stream=width'`.
 * @returns {string} The trimmed value.
 */
function probe(file, entry) {
  const [what, name] = entry.split('=');
  return run('ffprobe', [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    what === 'format' ? `format=${name}` : `stream=${name}`,
    '-of',
    'default=nk=1:nw=1:nokey=1',
    file,
  ]).trim();
}

/**
 * Reads a file's sha256.
 *
 * @param {string} file - Path.
 * @returns {string} Lowercase hex digest.
 */
function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

/**
 * The ffmpeg arguments for one clip.
 *
 * @param {typeof CLIPS[number]} clip - The clip.
 * @param {string} source - The winner MP4.
 * @param {string} target - The output MP4.
 * @returns {string[]} The argument vector.
 */
function encodeArgs(clip, source, target) {
  return [
    '-v',
    'error',
    '-y',
    '-i',
    source,
    '-vf',
    // Fit 640×360 keeping the source aspect, centred on black (the letterbox is the frame);
    // CFR at the source's rounded fps; yuv420p for the hardware path.
    `scale=${CODEC.width}:${CODEC.height}:force_original_aspect_ratio=decrease:flags=lanczos,` +
      `pad=${CODEC.width}:${CODEC.height}:(ow-iw)/2:(oh-ih)/2:color=0x000000,` +
      `format=yuv420p,fps=${clip.fps}`,
    '-c:v',
    'libx264',
    '-preset',
    'slow',
    '-profile:v',
    'high',
    '-level',
    '4.2',
    '-crf',
    '24',
    '-maxrate',
    '900k',
    '-bufsize',
    '1800k',
    // Level 4.2 caps the buffer; the size cap bounds the worst-case bitrate for the TV decoder.
    '-g',
    String(clip.fps * 2),
    // Determinism: libx264's rate-control threading makes the output bytes depend on the
    // machine's scheduling — single-threaded encoding (with bitexact) is byte-stable across runs.
    '-threads',
    '1',
    '-an', // silent — the sim owns audio; the source's AAC track is dead weight
    '-movflags',
    '+faststart',
    '-map_metadata',
    '0', // keep the generator's metadata (licence clause: retain provenance)
    '-fflags',
    '+bitexact',
    '-flags:v',
    '+bitexact',
    target,
  ];
}

/**
 * Verifies one output against the codec contract.
 *
 * @param {string} file - The encoded MP4.
 * @param {typeof CLIPS[number]} clip - Its clip (for the report).
 * @returns {{ bytes: number, sha256: string, fps: number, frames: number, durationMs: number }}
 *   The measured facts for the ledger.
 * @throws When the file is not High ≤ 4.2 640×360 yuv420p.
 */
function verify(file, clip) {
  const width = Number(probe(file, 'stream=width'));
  const height = Number(probe(file, 'stream=height'));
  const level = Number(probe(file, 'stream=level'));
  const profile = probe(file, 'stream=profile');
  const pixFmt = probe(file, 'stream=pix_fmt');
  const problems = [];
  if (width !== CODEC.width || height !== CODEC.height) {
    problems.push(`${clip.id}: ${width}×${height} is not ${CODEC.width}×${CODEC.height}`);
  }
  if (profile !== CODEC.profile) problems.push(`${clip.id}: profile ${profile} is not High`);
  if (!(level > 0 && level <= CODEC.maxLevel)) {
    problems.push(`${clip.id}: level ${level} exceeds ${CODEC.maxLevel} (4.2)`);
  }
  if (pixFmt !== CODEC.pixFmt) problems.push(`${clip.id}: pix_fmt ${pixFmt} is not yuv420p`);
  const audio = run('ffprobe', [
    '-v',
    'error',
    '-select_streams',
    'a',
    '-show_entries',
    'stream=index',
    '-of',
    'csv=p=0',
    file,
  ]).trim();
  if (audio !== '') problems.push(`${clip.id}: carries an audio stream (must be silent)`);
  if (problems.length > 0) throw new Error(problems.join('\n'));
  const frames = Number(probe(file, 'stream=nb_frames'));
  const durationMs = Math.round(Number(probe(file, 'format=duration')) * 1000);
  return {
    bytes: statSync(file).size,
    sha256: sha256(file),
    fps: clip.fps,
    frames,
    durationMs,
  };
}

/**
 * Writes the licence notice next to the clips: the LTX-2.x community terms as recorded in
 * `docs/dev/art-provenance.md` §3.6, the per-clip model line, and the machine-generated
 * disclaimer the licence demands wherever a clip shows.
 *
 * @param {string[]} lines - One line per clip.
 * @returns {string} The file text.
 */
function licensesText(lines) {
  return [
    '# Video cutscene licences',
    '',
    'The MP4 files in this folder are cutscene clips of Shmup Cup, encoded deterministically by',
    '`scripts/v20x/video-encode.mjs` from the committed AI winners under',
    '`art-prompts/v2/winners/video/`. Each clip ships with its generation record',
    '(`<id>.art.json`) next to it; the game shows the machine-generated disclaimer below wherever',
    'a clip plays. The full licence analysis is `docs/dev/art-provenance.md` (§3.6).',
    '',
    'Every clip here was generated with **LTX-2.5** (`Lightricks/LTX-2.5-Diffusers`) under the',
    '**LTX-2.x Community License Agreement, 2026-08-11** (id `ltx-2.x-community-2026-08-11`,',
    '<https://github.com/Lightricks/LTX-2/blob/main/LICENSE-2_x>): free commercial use while the',
    'licensee earns under USD 10 million a year, with the conditions that each clip is disclaimed',
    'as machine generated where it is shown, and any embedded watermark, metadata or provenance',
    'data is kept (the encodes retain the source metadata verbatim).',
    '',
    '## The disclaimer (shown with every clip)',
    '',
    '> The video images in this game are machine generated (LTX-2.5).',
    '',
    '## The clips',
    '',
    ...lines,
    '',
  ].join('\n');
}

/**
 * The per-clip line of the licence notice.
 *
 * @param {typeof CLIPS[number]} clip - The clip.
 * @param {Record<string, unknown>} winner - Its winner.json.
 * @param {string} file - Its ledger file name.
 * @returns {string} One markdown line.
 */
function licenseLine(clip, winner, file) {
  return (
    `- \`${file}\` — from \`${clip.winner}\` (model ${String(winner.servedModel ?? clip.winner)}, ` +
    `seed ${String(winner.seed)}; prompt in \`${clip.id}.art.json\`)`
  );
}

/**
 * Parses `--only a,b` out of the arguments, skipping a leading `--` (the pnpm 12 shape).
 *
 * @param {string[]} argv - The process arguments after the script name.
 * @returns {Set<string> | null} The clip ids, or `null` for all of them.
 */
function parseOnly(argv) {
  const i = argv.indexOf('--only');
  if (i < 0) return null;
  const value = argv[i + 1];
  if (value === undefined || value === '') {
    throw new Error('--only needs a comma list of clip ids (see CLIPS in this file)');
  }
  const ids = new Set(value.split(',').filter((s) => s !== ''));
  for (const id of ids) {
    if (!CLIPS.some((clip) => clip.id === id)) {
      throw new Error(
        `--only: unknown clip id '${id}' (known: ${CLIPS.map((c) => c.id).join(', ')})`,
      );
    }
  }
  return ids;
}

/**
 * The kit's entry point.
 * @returns {void}
 */
function main() {
  const argv = process.argv.slice(2).filter((a) => a !== '--');
  const check = argv.includes('--check');
  const rerun = argv.includes('--rerun');
  const only = parseOnly(argv);
  const clips = only === null ? [...CLIPS] : CLIPS.filter((c) => only.has(c.id));

  if (process.env.SHMUP_NO_VIDEO === '1') {
    console.log(
      'SKIPPING the video encode: SHMUP_NO_VIDEO=1 (the baked kill switch).\n' +
        'No clips were (re)encoded; a build from this tree ships no video at all.',
    );
    process.exitCode = 0;
    return;
  }

  if (!hasBinary('ffmpeg') || !hasBinary('ffprobe')) {
    console.log(
      'SKIPPING the video encode: ffmpeg and/or ffprobe are not on PATH.\n' +
        'No clips were (re)encoded; assets/generated/video/ keeps whatever is already there.\n' +
        'A build without clips ships no video and the game plays every scene without a sting\n' +
        '(the graceful-degradation path of lane v20x-VID). Install ffmpeg and re-run\n' +
        '  node scripts/v20x/video-encode.mjs\nto fill the cutscene folder.',
    );
    process.exitCode = 0;
    return;
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const existing = existsSync(join(OUT_DIR, LEDGER_FILE))
    ? /** @type {{ clips?: Array<Record<string, unknown>> }} */ (
        JSON.parse(readFileSync(join(OUT_DIR, LEDGER_FILE), 'utf8'))
      )
    : { clips: [] };
  /** @type {Map<string, Record<string, unknown>>} */
  const byId = new Map((existing.clips ?? []).map((c) => [String(c.id), c]));

  const ledgerClips = [];
  const licenseLines = [];
  for (const clip of clips) {
    const source = join(WINNER_DIR, clip.winner, 'winner.mp4');
    const sidecar = join(WINNER_DIR, clip.winner, 'winner.json');
    if (!existsSync(source)) throw new Error(`${clip.id}: missing source ${source}`);
    const out = join(OUT_DIR, `${clip.id}.mp4`);
    if (check) {
      if (!existsSync(out)) throw new Error(`${clip.id}: ${out} is missing (run the encode first)`);
      const measured = verify(out, clip);
      const pinned = byId.get(clip.id);
      if (pinned === undefined) throw new Error(`${clip.id}: the ledger has no row for it`);
      if (pinned.sha256 !== measured.sha256) {
        throw new Error(
          `${clip.id}: bytes moved (ledger ${String(pinned.sha256)}, file ${measured.sha256}) ` +
            '— re-run the encode and update the shell manifest',
        );
      }
      ledgerClips.push(pinned);
      continue;
    }
    const measuredFps = sourceFps(source);
    if (measuredFps !== clip.fps) {
      throw new Error(
        `${clip.id}: source is ${measuredFps} fps, the kit expects ${clip.fps} — update CLIPS`,
      );
    }
    run('ffmpeg', encodeArgs(clip, source, out));
    if (rerun) {
      const again = join(OUT_DIR, `.rerun-${clip.id}.mp4`);
      try {
        run('ffmpeg', encodeArgs(clip, source, again));
        if (sha256(out) !== sha256(again)) {
          throw new Error(`${clip.id}: the two encodes differ — output is not deterministic`);
        }
      } finally {
        rmSync(again, { force: true });
      }
    }
    const measured = verify(out, clip);
    copyFileSync(sidecar, join(OUT_DIR, `${clip.id}.art.json`));
    ledgerClips.push({
      id: clip.id,
      source: `art-prompts/v2/winners/video/${clip.winner}/winner.mp4`,
      file: `${clip.id}.mp4`,
      trigger: clip.trigger,
      loop: clip.loop === true,
      ...measured,
    });
    licenseLines.push(
      licenseLine(clip, JSON.parse(readFileSync(sidecar, 'utf8')), `${clip.id}.mp4`),
    );
    console.log(
      `${clip.id}.mp4 ${measured.bytes} B (${(measured.bytes / 1024).toFixed(1)} KB), ` +
        `${measured.frames} frames ${(measured.durationMs / 1000).toFixed(2)} s @ ${clip.fps} fps`,
    );
  }

  if (check) {
    console.log(
      `video encode kit: ${ledgerClips.length} clip(s) match the ledger ` +
        `(High ≤ 4.2, ${CODEC.width}×${CODEC.height} yuv420p, silent, faststart).`,
    );
    return;
  }

  // Full rewrite keeps the ledger complete even for --only runs: merge over the existing rows.
  const merged = new Map(byId);
  for (const row of ledgerClips) merged.set(String(row.id), row);
  const ordered = CLIPS.map((clip) => merged.get(clip.id)).filter((row) => row !== undefined);
  writeFileSync(
    join(OUT_DIR, LEDGER_FILE),
    JSON.stringify(
      {
        formatVersion: 1,
        generatedBy: 'scripts/v20x/video-encode.mjs',
        encoder: ffmpegVersion(),
        frame: { width: CODEC.width, height: CODEC.height },
        clips: ordered,
      },
      null,
      2,
    ) + '\n',
  );
  // The licences file covers the whole set: rebuild it from every sidecar present.
  const lines = [];
  for (const clip of CLIPS) {
    if (existsSync(join(OUT_DIR, `${clip.id}.mp4`))) {
      lines.push(
        licenseLine(
          clip,
          JSON.parse(readFileSync(join(OUT_DIR, `${clip.id}.art.json`), 'utf8')),
          `${clip.id}.mp4`,
        ),
      );
    }
  }
  writeFileSync(join(OUT_DIR, LICENSES_FILE), licensesText(lines));
  const shippedBytes = ordered.reduce((sum, row) => sum + Number(row.bytes ?? 0), 0);
  console.log(
    `\nwrote ${LEDGER_FILE} (+ ${LICENSES_FILE}): ` +
      `${ordered.length} clips, ${shippedBytes} B total ` +
      `(${(shippedBytes / 1024 / 1024).toFixed(2)} MiB)`,
  );
  console.log('\nshell manifest block (paste over VIDEO_CLIPS if any row changed):');
  for (const row of ordered) {
    console.log(
      `  { id: '${row.id}', file: '${row.file}', bytes: ${row.bytes}, trigger: '${row.trigger}'${
        row.loop ? ', loop: true' : ''
      } },`,
    );
  }
}

main();
