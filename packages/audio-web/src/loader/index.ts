/**
 * # loader — audio content, rendering and decoding during loading phases
 *
 * **Responsibility.** Owns the two audio content kinds (plan §3.5) and turns them into playable
 * sounds **before** gameplay needs them — nothing is rendered or decoded mid-stage
 * (shmup_tech.md §2.4: `decodeAudioData` is slow on TVs):
 *
 * - **`sfx`** (`content/audio/*.sfx.json`, {@link loadSfxContent}): each `SFX_CUES` name →
 *   `{ params | file, priority, maxInstances, volume?, bus?, pan? }`. `params` is a `synth`
 *   parameter set rendered to PCM at boot ({@link AudioLoader.loadSfx}); `file` a recorded sound
 *   decoded at boot. The volume is baked into the samples.
 * - **`music`** (`content/audio/music/*.music.json`, {@link loadMusicContent}): one track per
 *   file — `id`, `title`, the `MUSIC_CUES` name it answers (`cue`, optionally only for some
 *   `stages`) and either a chip `song` (rendered by `synth`) or an OGG `file` with sample-exact
 *   `loopStart` / `loopEnd`. {@link resolveMusicCues} picks, per cue, the track of a stage.
 *   {@link AudioLoader.loadTrack} prepares one track — the engine calls it for a stage's music
 *   set during the stage-intro / loading phase.
 *
 * **OGG path (decision D22).** A `file` is fetched with `XMLHttpRequest` (`responseType
 * 'arraybuffer'` — `fetch()` fails on `file://` in Chromium 69, D25; {@link loadArrayBuffer}) and
 * decoded through an `OfflineAudioContext(2, 1, 32000)` ({@link decodeAudioFile}): the decoded
 * buffer comes out resampled to 32 kHz, which halves the memory of a 44.1 kHz stereo track's
 * float PCM, and it plays on the real-time context unchanged. Loop points given at the file's
 * `sampleRate` are converted to the decoded rate.
 *
 * Prepared sounds keep synthesized samples as a `Float32Array` until a context exists
 * ({@link toAudioBuffer} copies them into an `AudioBuffer` once and drops the array), so boot can
 * render before the web's first user gesture creates the `AudioContext`.
 *
 * **Implements.**
 * - shmup_tech.md §2.4 — decode during loading, never mid-game; decode music at 32 kHz
 * - shmup_tech.md §2.5 — memory budget (mono 22,050 Hz placeholders, one stage's set resident)
 * - shmup_feat.md §19 — SFX bank, music with sample-accurate loop points
 *
 * **Public API.** Content: {@link SFX_CONTENT_KIND}, {@link MUSIC_CONTENT_KIND},
 * {@link loadSfxContent}, {@link parseSfxContent}, {@link SfxContent}, {@link SfxCueDef},
 * {@link SfxContentResult}, {@link EMPTY_SFX_CONTENT}, {@link loadMusicContent},
 * {@link parseMusicContent}, {@link MusicContent}, {@link MusicTrackDef}, {@link MusicFileDef},
 * {@link MusicContentResult}, {@link EMPTY_MUSIC_CONTENT}, {@link resolveMusicCues},
 * {@link STAGE_MUSIC_CUES}, {@link stageMusicCues}. Loading: {@link createAudioLoader},
 * {@link AudioLoader}, {@link AudioLoaderOptions}, {@link PreparedSound}, {@link PreparedTrack},
 * {@link toAudioBuffer}, {@link loadArrayBuffer}, {@link XhrLike}, {@link decodeAudioFile},
 * {@link DecodeContextLike}, {@link DECODE_SAMPLE_RATE}, {@link AudioLoadError},
 * {@link LoadProgress}.
 *
 * @module
 */
import {
  CONTENT_FORMAT_VERSION,
  MUSIC_CUES,
  MUSIC_CUE_NAMES,
  SFX_CUE_NAMES,
  defineModule,
  s,
  type ContentFile,
  type StageSpec,
  type ValidationIssue,
} from '@shmup/core';
import {
  SFX_PRIORITY_NAMES,
  SFX_PRIORITY_TIERS,
  type SfxBus,
  type SfxPriorityName,
} from '../sfx/index.js';
import {
  CHIP_WAVES,
  SFX_SHAPES,
  SYNTH_SAMPLE_RATE,
  parseTrack,
  renderSfx,
  renderSong,
  type SfxParams,
  type Song,
} from '../synth/index.js';
import type { AudioBufferLike, PlaybackContextLike } from '../web-audio/index.js';

/** Module descriptor. */
export const moduleInfo = defineModule({
  name: 'loader',
  status: 'implemented',
  specRefs: ['shmup_tech.md §2.4', 'shmup_tech.md §2.5', 'shmup_feat.md §19'],
});

/** Progress callback for loading screens (0…1). */
export type LoadProgress = (fraction: number) => void;

/** `kind` of sound-effect content files. */
export const SFX_CONTENT_KIND = 'sfx';

/** `kind` of music content files. */
export const MUSIC_CONTENT_KIND = 'music';

/** Rate the OGG path decodes at (decision D22). */
export const DECODE_SAMPLE_RATE = 32000;

/**
 * The default music set of a stage — the generic theme, the boss, the stage-clear jingle and game
 * over (`AudioEngine.prepareMusic`'s default). A real stage's set comes from its own data:
 * {@link stageMusicCues}.
 */
export const STAGE_MUSIC_CUES: readonly number[] = Object.freeze([
  MUSIC_CUES.Stage,
  MUSIC_CUES.Boss,
  MUSIC_CUES.StageClear,
  MUSIC_CUES.GameOver,
]);

/**
 * Every music cue a stage can make the sim ask for while it runs, prepared together during its
 * loading phase (nothing is rendered or decoded mid-stage): the stage's own `music.stage` theme and
 * `music.boss` theme, the cue of each of its `music` timeline events, then the stage-clear jingle
 * and game over (which the sim emits for every stage). `Silence` (no track) and unresolved cues are
 * left out; the list has no duplicates.
 *
 * @param stage - The stage's validated spec (its `music` and `events`).
 * @returns `MUSIC_CUES` ids, in first-use order.
 *
 * @example
 * ```ts
 * await engine.prepareMusic(stage.id, stageMusicCues(stage));
 * ```
 */
export function stageMusicCues(stage: Pick<StageSpec, 'music' | 'events'>): number[] {
  const cues: number[] = [];
  const add = (cue: number): void => {
    if (cue > MUSIC_CUES.Silence && cues.indexOf(cue) < 0) cues.push(cue);
  };
  add(stage.music.stageId);
  // The sim falls back to the generic boss theme when the stage names none.
  add(stage.music.bossId >= 0 ? stage.music.bossId : MUSIC_CUES.Boss);
  for (const event of stage.events) {
    if (event.type === 'music') add(event.cueId);
  }
  add(MUSIC_CUES.StageClear);
  add(MUSIC_CUES.GameOver);
  return cues;
}

// ---------------------------------------------------------------------------------------------
// Content: sfx
// ---------------------------------------------------------------------------------------------

/** One validated cue of the SFX bank. */
export interface SfxCueDef {
  /** `SFX_CUES` name. */
  readonly cue: string;
  /** `SFX_CUES` id. */
  readonly cueId: number;
  /** Priority tier name. */
  readonly priority: SfxPriorityName;
  /** The tier as the core's `SfxPriority` value (1 = low … 4 = critical). */
  readonly tier: number;
  /** Simultaneous instances. */
  readonly maxInstances: number;
  /** Gain baked into the samples, 0…1. */
  readonly volume: number;
  /** Bus (`ui` = menus: not panned). */
  readonly bus: SfxBus;
  /** Whether the event's x pans the sound (false for whole-screen sounds and menus). */
  readonly positional: boolean;
  /** Synth parameters, or `null` for a recorded file. */
  readonly params: SfxParams | null;
  /** Relative URL of a recorded sound, or `null` for a synthesized one. */
  readonly file: string | null;
}

/** The validated SFX bank. */
export interface SfxContent {
  /** One entry per `SFX_CUES` id (`null` = the cue has no sound). */
  readonly cues: readonly (SfxCueDef | null)[];
}

/** The result of validating `sfx` files. */
export interface SfxContentResult {
  /** The bank. */
  readonly content: SfxContent;
  /** Every problem found. */
  readonly issues: ValidationIssue[];
}

/** A bank with no sounds (before content is loaded). */
export const EMPTY_SFX_CONTENT: SfxContent = Object.freeze({
  cues: Object.freeze(SFX_CUE_NAMES.map(() => null)),
});

/** A cue name (`PlayerShot`). */
const CUE_NAME = /^[A-Z][A-Za-z0-9]*$/;

/** A relative asset URL (`audio/sfx/boom.ogg`) — no scheme, no `..`, no leading `/`. */
const RELATIVE_URL = /^(?!\/)(?!.*\.\.)[A-Za-z0-9_./-]+\.(?:ogg|mp3|m4a|wav)$/;

/** A kebab-case id (`zone-a`). */
const KEBAB_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The synth parameter set. */
const SFX_PARAMS_SCHEMA = s.object(
  {
    shape: s.enumOf(SFX_SHAPES),
    volume: s.num({ min: 0, max: 1 }),
    frequency: s.num({ min: 0, max: 20000 }),
    randomness: s.num({ min: 0, max: 1 }),
    attack: s.num({ min: 0, max: 5 }),
    decay: s.num({ min: 0, max: 5 }),
    sustain: s.num({ min: 0, max: 10 }),
    sustainVolume: s.num({ min: 0, max: 1 }),
    release: s.num({ min: 0, max: 10 }),
    slide: s.num({ min: -100000, max: 100000 }),
    pitchJump: s.num({ min: -20000, max: 20000 }),
    pitchJumpTime: s.num({ min: 0, max: 10 }),
    repeat: s.num({ min: 0, max: 10 }),
    modulation: s.num({ min: 0, max: 1000 }),
    modulationDepth: s.num({ min: 0, max: 1 }),
    bitCrush: s.int({ min: 0, max: 64 }),
    tremolo: s.num({ min: 0, max: 1 }),
    tremoloRate: s.num({ min: 0, max: 100 }),
    duty: s.num({ min: 0.05, max: 0.95 }),
    seed: s.int({ min: 0, max: 0xffffffff }),
  },
  {
    optional: [
      'shape',
      'volume',
      'frequency',
      'randomness',
      'attack',
      'decay',
      'sustain',
      'sustainVolume',
      'release',
      'slide',
      'pitchJump',
      'pitchJumpTime',
      'repeat',
      'modulation',
      'modulationDepth',
      'bitCrush',
      'tremolo',
      'tremoloRate',
      'duty',
      'seed',
    ],
  },
);

/** One cue entry of an `sfx` file. */
const SFX_CUE_SCHEMA = s.object(
  {
    priority: s.enumOf(SFX_PRIORITY_NAMES),
    maxInstances: s.int({ min: 1, max: 8 }),
    volume: s.num({ min: 0, max: 1 }),
    bus: s.enumOf(['sfx', 'ui'] as const),
    pan: s.bool(),
    params: SFX_PARAMS_SCHEMA,
    file: s.str({ maxLength: 160, pattern: RELATIVE_URL }),
  },
  { optional: ['volume', 'bus', 'pan', 'params', 'file'] },
);

/** A whole `sfx` file. */
const SFX_FILE_SCHEMA = s.object({
  formatVersion: s.int({ min: CONTENT_FORMAT_VERSION, max: CONTENT_FORMAT_VERSION }),
  kind: s.enumOf([SFX_CONTENT_KIND] as const),
  cues: s.record(SFX_CUE_SCHEMA, CUE_NAME),
});

/**
 * Prefixes a JSON path with its file, the way `loadContent` does.
 *
 * @param file - File path (`''` for a bare document).
 * @param path - JSON path inside the file.
 * @returns `<file>:<path>`, or whichever part is non-empty.
 */
const at = (file: string, path: string): string =>
  file === '' ? path : path === '' ? file : `${file}:${path}`;

/**
 * Sorts content files by path (results never depend on the order a host lists them).
 *
 * @param files - The files.
 * @returns A sorted copy.
 */
const byPath = (files: readonly ContentFile[]): ContentFile[] =>
  files.slice().sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

/**
 * Validates every `sfx` content file — the owner of that kind (plan §3.5).
 *
 * @remarks
 * Files are read in path order and merged; a cue defined twice keeps its first definition (an
 * issue names the second). Issues: schema errors, a name that is not an `SFX_CUES` cue, an entry
 * with both or neither of `params` / `file`. A cue no file binds simply has no sound (the shipped
 * bank binding every cue is checked by `pnpm content:check`). Never throws for bad data.
 *
 * @param files - The content files of kind `sfx`.
 * @returns The merged bank and every issue.
 *
 * @example
 * ```ts
 * const { content, issues } = loadSfxContent(sfxFiles);
 * content.cues[SFX_CUES.PlayerShot]?.priority; // → 'low'
 * ```
 */
export function loadSfxContent(files: readonly ContentFile[]): SfxContentResult {
  const cues: Array<SfxCueDef | null> = SFX_CUE_NAMES.map(() => null);
  const issues: ValidationIssue[] = [];
  for (const file of byPath(files)) {
    const local: ValidationIssue[] = [];
    const parsed = SFX_FILE_SCHEMA.parse(file.data, '', local);
    for (const issue of local)
      issues.push({ path: at(file.path, issue.path), message: issue.message });
    if (parsed === undefined) continue;
    for (const name of Object.keys(parsed.cues)) {
      const entry = parsed.cues[name];
      const path = at(file.path, `cues.${name}`);
      const cueId = SFX_CUE_NAMES.indexOf(name);
      if (cueId < 0) {
        issues.push({ path, message: `unknown SFX cue "${name}"` });
        continue;
      }
      if ((entry.params === undefined) === (entry.file === undefined)) {
        issues.push({ path, message: 'needs exactly one of "params" or "file"' });
        continue;
      }
      if (cues[cueId] !== null) {
        issues.push({ path, message: `cue "${name}" is already defined` });
        continue;
      }
      const bus = entry.bus ?? 'sfx';
      cues[cueId] = Object.freeze({
        cue: name,
        cueId,
        priority: entry.priority,
        tier: SFX_PRIORITY_TIERS[entry.priority],
        maxInstances: entry.maxInstances,
        volume: entry.volume ?? 1,
        bus,
        positional: entry.pan ?? bus === 'sfx',
        params: entry.params === undefined ? null : Object.freeze({ ...entry.params }),
        file: entry.file ?? null,
      });
    }
  }
  return { content: Object.freeze({ cues: Object.freeze(cues) }), issues };
}

/**
 * Validates one `sfx` document (a README sample, a single file).
 *
 * @param data - The parsed JSON.
 * @param path - File path used to prefix issue paths (`''` = bare JSON paths).
 * @returns The bank and every issue. Never throws for bad data.
 */
export function parseSfxContent(data: unknown, path = ''): SfxContentResult {
  return loadSfxContent([{ path, data }]);
}

// ---------------------------------------------------------------------------------------------
// Content: music
// ---------------------------------------------------------------------------------------------

/** An OGG (or other decodable) track. */
export interface MusicFileDef {
  /** Relative URL. */
  readonly url: string;
  /** First sample of the loop at {@link MusicFileDef.sampleRate} (−1 = one-shot). */
  readonly loopStart: number;
  /** Loop end at {@link MusicFileDef.sampleRate} (−1 = one-shot). */
  readonly loopEnd: number;
  /** Rate the loop points are counted at (default {@link DECODE_SAMPLE_RATE}). */
  readonly sampleRate: number;
}

/** One validated music track. */
export interface MusicTrackDef {
  /** Track id. */
  readonly id: string;
  /** Display title (sound test, credits). */
  readonly title: string;
  /** `MUSIC_CUES` name the track answers, or `null` (only reachable by id). */
  readonly cue: string | null;
  /** `MUSIC_CUES` id of {@link MusicTrackDef.cue}, or −1. */
  readonly cueId: number;
  /** Stage ids the binding is limited to, or `null` = the default for every stage. */
  readonly stages: readonly string[] | null;
  /** The chip song, or `null` for a file. */
  readonly song: Song | null;
  /** The recorded track, or `null` for a song. */
  readonly file: MusicFileDef | null;
}

/** The validated music library. */
export interface MusicContent {
  /** Every track, in file path order. */
  readonly tracks: readonly MusicTrackDef[];
  /** Track id → index in {@link MusicContent.tracks}. */
  readonly trackIndex: ReadonlyMap<string, number>;
}

/** The result of validating `music` files. */
export interface MusicContentResult {
  /** The library. */
  readonly content: MusicContent;
  /** Every problem found. */
  readonly issues: ValidationIssue[];
}

/** A library with no tracks. */
export const EMPTY_MUSIC_CONTENT: MusicContent = Object.freeze({
  tracks: Object.freeze([]),
  trackIndex: new Map<string, number>(),
});

/** A song instrument. */
const INSTRUMENT_SCHEMA = s.object(
  {
    wave: s.enumOf(CHIP_WAVES),
    volume: s.num({ min: 0, max: 1 }),
    attack: s.num({ min: 0, max: 5 }),
    decay: s.num({ min: 0, max: 5 }),
    sustain: s.num({ min: 0, max: 1 }),
    release: s.num({ min: 0, max: 5 }),
    vibrato: s.object(
      {
        depth: s.num({ min: 0, max: 2 }),
        rate: s.num({ min: 0, max: 30 }),
        delay: s.num({ min: 0, max: 5 }),
      },
      { optional: ['delay'] },
    ),
    arpeggio: s.array(s.int({ min: -24, max: 24 }), { min: 1, max: 8 }),
    arpeggioTicks: s.int({ min: 1, max: 16 }),
    sweep: s.num({ min: -480, max: 480 }),
  },
  {
    optional: [
      'volume',
      'attack',
      'decay',
      'sustain',
      'release',
      'vibrato',
      'arpeggio',
      'arpeggioTicks',
      'sweep',
    ],
  },
);

/** A song. */
const SONG_SCHEMA = s.object(
  {
    speed: s.int({ min: 1, max: 32 }),
    volume: s.num({ min: 0, max: 1 }),
    instruments: s.record(INSTRUMENT_SCHEMA, KEBAB_ID),
    channels: s.array(
      s.object(
        {
          instrument: s.str({ maxLength: 32, pattern: KEBAB_ID }),
          volume: s.num({ min: 0, max: 1 }),
        },
        { optional: ['volume'] },
      ),
      { min: 4, max: 6 },
    ),
    patterns: s.record(
      s.object({
        rows: s.int({ min: 1, max: 256 }),
        tracks: s.array(s.str({ minLength: 0, maxLength: 4096 }), { min: 1, max: 6 }),
      }),
      KEBAB_ID,
    ),
    order: s.array(s.str({ maxLength: 32, pattern: KEBAB_ID }), { min: 1, max: 256 }),
    loopFromOrder: s.nullable(s.int({ min: 0, max: 255 })),
  },
  { optional: ['volume', 'loopFromOrder'] },
);

/** A whole `music` file. */
const MUSIC_FILE_SCHEMA = s.object(
  {
    formatVersion: s.int({ min: CONTENT_FORMAT_VERSION, max: CONTENT_FORMAT_VERSION }),
    kind: s.enumOf([MUSIC_CONTENT_KIND] as const),
    id: s.str({ maxLength: 32, pattern: KEBAB_ID }),
    title: s.str({ maxLength: 40 }),
    cue: s.str({ maxLength: 40, pattern: CUE_NAME }),
    stages: s.array(s.str({ maxLength: 48, pattern: KEBAB_ID }), { min: 1, max: 32 }),
    song: SONG_SCHEMA,
    file: s.str({ maxLength: 160, pattern: RELATIVE_URL }),
    loopStart: s.int({ min: 0 }),
    loopEnd: s.int({ min: 1 }),
    sampleRate: s.int({ min: 8000, max: 96000 }),
  },
  { optional: ['cue', 'stages', 'song', 'file', 'loopStart', 'loopEnd', 'sampleRate'] },
);

/**
 * Checks what the schema cannot: instrument and pattern references, every track's tokens and
 * row total, the loop point.
 *
 * @param song - A schema-valid song.
 * @param path - Issue path of the song.
 * @param issues - Issues (appended to).
 * @returns `true` when the song renders.
 */
function checkSong(song: Song, path: string, issues: ValidationIssue[]): boolean {
  let ok = true;
  const hasInstrument = (name: string): boolean =>
    Object.prototype.hasOwnProperty.call(song.instruments, name);
  song.channels.forEach((channel, c) => {
    if (!hasInstrument(channel.instrument)) {
      issues.push({
        path: `${path}.channels[${c}].instrument`,
        message: `unknown instrument "${channel.instrument}"`,
      });
      ok = false;
    }
  });
  for (const name of Object.keys(song.patterns)) {
    const pattern = song.patterns[name];
    const patternPath = `${path}.patterns.${name}`;
    if (pattern.tracks.length > song.channels.length) {
      issues.push({
        path: `${patternPath}.tracks`,
        message: `has ${pattern.tracks.length} tracks, the song has ${song.channels.length} channels`,
      });
      ok = false;
    }
    pattern.tracks.forEach((track, c) => {
      const trackPath = `${patternPath}.tracks[${c}]`;
      const parsed = parseTrack(track);
      if (parsed.error !== null) {
        issues.push({ path: trackPath, message: parsed.error });
        ok = false;
        return;
      }
      if (parsed.steps.length > 0 && parsed.rows !== pattern.rows) {
        issues.push({
          path: trackPath,
          message: `covers ${parsed.rows} rows, the pattern has ${pattern.rows}`,
        });
        ok = false;
      }
      for (const step of parsed.steps) {
        if (step.instrument !== null && !hasInstrument(step.instrument)) {
          issues.push({ path: trackPath, message: `unknown instrument "${step.instrument}"` });
          ok = false;
        }
      }
    });
  }
  song.order.forEach((name, i) => {
    if (!Object.prototype.hasOwnProperty.call(song.patterns, name)) {
      issues.push({ path: `${path}.order[${i}]`, message: `unknown pattern "${name}"` });
      ok = false;
    }
  });
  const loop = song.loopFromOrder;
  if (typeof loop === 'number' && loop >= song.order.length) {
    issues.push({
      path: `${path}.loopFromOrder`,
      message: `must be below the order length (${song.order.length})`,
    });
    ok = false;
  }
  return ok;
}

/**
 * Validates every `music` content file — the owner of that kind (plan §3.5).
 *
 * @remarks
 * Files are read in path order. Issues: schema errors (a song needs 4–6 channels), a duplicate
 * track id, an unknown `cue`, `stages` without a `cue`, both or neither of `song` / `file`, loop
 * points on a song (a song's loop comes from `loopFromOrder`) or only one of `loopStart` /
 * `loopEnd` on a file (or `loopEnd ≤ loopStart`), song references and tracks that do not add up
 * (see {@link checkSong}), and two tracks bound to the same cue for the same stage (or both as
 * the cue's default). A track with an issue is left out. Never throws for bad data.
 *
 * @param files - The content files of kind `music`.
 * @returns The library and every issue.
 *
 * @example
 * ```ts
 * const { content } = loadMusicContent(musicFiles);
 * content.tracks.map((track) => track.id); // → ['boss', 'game-over', 'stage-clear', 'title', 'zone-a']
 * ```
 */
export function loadMusicContent(files: readonly ContentFile[]): MusicContentResult {
  const tracks: MusicTrackDef[] = [];
  const trackIndex = new Map<string, number>();
  const bindings = new Map<string, string>();
  const issues: ValidationIssue[] = [];
  for (const file of byPath(files)) {
    const local: ValidationIssue[] = [];
    const parsed = MUSIC_FILE_SCHEMA.parse(file.data, '', local);
    for (const issue of local)
      issues.push({ path: at(file.path, issue.path), message: issue.message });
    if (parsed === undefined) continue;
    let ok = true;
    const report = (field: string, message: string): void => {
      issues.push({ path: at(file.path, field), message });
      ok = false;
    };
    if (trackIndex.has(parsed.id)) report('id', `duplicate track id "${parsed.id}"`);
    const cueId = parsed.cue === undefined ? -1 : MUSIC_CUE_NAMES.indexOf(parsed.cue);
    if (parsed.cue !== undefined && cueId < 0) report('cue', `unknown music cue "${parsed.cue}"`);
    if (parsed.stages !== undefined && parsed.cue === undefined) {
      report('stages', 'needs a "cue" to bind');
    }
    if ((parsed.song === undefined) === (parsed.file === undefined)) {
      report('', 'needs exactly one of "song" or "file"');
    }
    const hasLoopStart = parsed.loopStart !== undefined;
    const hasLoopEnd = parsed.loopEnd !== undefined;
    if (parsed.song !== undefined) {
      if (hasLoopStart || hasLoopEnd || parsed.sampleRate !== undefined) {
        report(
          '',
          'a song loops with "loopFromOrder"; loopStart / loopEnd / sampleRate are for files',
        );
      }
      if (!checkSong(parsed.song, at(file.path, 'song'), issues)) ok = false;
    }
    if (hasLoopStart !== hasLoopEnd) report('loopEnd', 'loopStart and loopEnd come together');
    if (hasLoopStart && hasLoopEnd && (parsed.loopEnd ?? 0) <= (parsed.loopStart ?? 0)) {
      report('loopEnd', 'must be greater than loopStart');
    }
    if (cueId >= 0) {
      for (const stage of parsed.stages ?? ['*']) {
        const key = `${cueId}:${stage}`;
        const other = bindings.get(key);
        if (other !== undefined) {
          report(
            'cue',
            `"${parsed.cue ?? ''}"${stage === '*' ? '' : ` for stage "${stage}"`} is already bound to "${other}"`,
          );
        }
      }
    }
    if (!ok) continue;
    if (cueId >= 0)
      for (const stage of parsed.stages ?? ['*']) bindings.set(`${cueId}:${stage}`, parsed.id);
    trackIndex.set(parsed.id, tracks.length);
    tracks.push(
      Object.freeze({
        id: parsed.id,
        title: parsed.title,
        cue: parsed.cue ?? null,
        cueId,
        stages: parsed.stages === undefined ? null : Object.freeze(parsed.stages.slice()),
        song: parsed.song === undefined ? null : (parsed.song as Song),
        file:
          parsed.file === undefined
            ? null
            : Object.freeze({
                url: parsed.file,
                loopStart: parsed.loopStart ?? -1,
                loopEnd: parsed.loopEnd ?? -1,
                sampleRate: parsed.sampleRate ?? DECODE_SAMPLE_RATE,
              }),
      }),
    );
  }
  return { content: Object.freeze({ tracks: Object.freeze(tracks), trackIndex }), issues };
}

/**
 * Validates one `music` document (a README sample, a single file).
 *
 * @param data - The parsed JSON.
 * @param path - File path used to prefix issue paths (`''` = bare JSON paths).
 * @returns The library and every issue. Never throws for bad data.
 */
export function parseMusicContent(data: unknown, path = ''): MusicContentResult {
  return loadMusicContent([{ path, data }]);
}

/**
 * Resolves every music cue to a track for a stage: a track bound to the cue **for that stage**
 * wins over the cue's default track (one without `stages`).
 *
 * @param content - The library.
 * @param stageId - The running stage, or `null` (menus, open space).
 * @returns Track index per `MUSIC_CUES` id (−1 = no track; `Silence` is always −1).
 *
 * @example
 * ```ts
 * const table = resolveMusicCues(music, 'zone-a');
 * music.tracks[table[MUSIC_CUES.Stage]]?.id; // → 'zone-a'
 * ```
 */
export function resolveMusicCues(content: MusicContent, stageId: string | null): Int16Array {
  const table = new Int16Array(MUSIC_CUE_NAMES.length).fill(-1);
  const specific = new Uint8Array(MUSIC_CUE_NAMES.length);
  content.tracks.forEach((track, index) => {
    if (track.cueId <= MUSIC_CUES.Silence) return;
    if (track.stages === null) {
      if (specific[track.cueId] === 0) table[track.cueId] = index;
    } else if (stageId !== null && track.stages.indexOf(stageId) >= 0) {
      table[track.cueId] = index;
      specific[track.cueId] = 1;
    }
  });
  return table;
}

// ---------------------------------------------------------------------------------------------
// Loading: rendering, fetching, decoding
// ---------------------------------------------------------------------------------------------

/** A sound ready for a context: synthesized samples, or an already decoded buffer. */
export interface PreparedSound {
  /** Synthesized mono samples, until {@link toAudioBuffer} copies them (then `null`). */
  pcm: Float32Array | null;
  /** The buffer, once decoded or converted. */
  buffer: AudioBufferLike | null;
  /** Sample rate of the samples / buffer. */
  readonly sampleRate: number;
}

/** A prepared music track. */
export interface PreparedTrack extends PreparedSound {
  /** Track id. */
  readonly id: string;
  /** Loop start in frames of the prepared rate (−1 = one-shot). */
  readonly loopStart: number;
  /** Loop end in frames of the prepared rate (−1 = one-shot). */
  readonly loopEnd: number;
}

/**
 * The buffer of a prepared sound, created on first use: synthesized samples are copied into a
 * mono `AudioBuffer` of their own rate (the context resamples on playback) and the array is
 * dropped to keep one copy in memory.
 *
 * @param context - A context that can create buffers.
 * @param sound - The prepared sound (updated in place).
 * @returns The buffer.
 * @throws Whatever `createBuffer` throws for an unsupported rate (3,000–192,000 Hz are safe).
 */
export function toAudioBuffer(context: PlaybackContextLike, sound: PreparedSound): AudioBufferLike {
  if (sound.buffer !== null) return sound.buffer;
  const pcm = sound.pcm ?? new Float32Array(1);
  const buffer = context.createBuffer(1, pcm.length, sound.sampleRate);
  buffer.getChannelData(0).set(pcm);
  sound.buffer = buffer;
  sound.pcm = null;
  return buffer;
}

/** An audio file could not be fetched or decoded. */
export class AudioLoadError extends Error {
  /** The URL that failed. */
  readonly url: string;

  /**
   * @param url - The URL that failed.
   * @param reason - What went wrong.
   */
  constructor(url: string, reason: string) {
    super(`could not load ${url}: ${reason}`);
    this.name = 'AudioLoadError';
    this.url = url;
  }
}

/** The parts of `XMLHttpRequest` {@link loadArrayBuffer} uses (tests pass fakes). */
export interface XhrLike {
  /** `'arraybuffer'` is set before sending. */
  responseType: string;
  /** HTTP status (0 for `file://` responses). */
  readonly status: number;
  /** The body. */
  readonly response: unknown;
  /** Called when the request completed (any status). */
  onload: ((event: never) => unknown) | null;
  /** Called on a network error. */
  onerror: ((event: never) => unknown) | null;
  /**
   * Prepares the request.
   *
   * @param method - `'GET'`.
   * @param url - Relative URL.
   */
  open(method: string, url: string): void;
  /** Sends the request. */
  send(): void;
}

/**
 * Fetches a file as an `ArrayBuffer` with `XMLHttpRequest` (`fetch()` fails on `file://` in
 * Chromium 69 — decision D25; status 0 is success there).
 *
 * @param url - Relative URL.
 * @param createRequest - Request factory (default `() => new XMLHttpRequest()`).
 * @returns A promise of the bytes.
 * @throws Rejects with {@link AudioLoadError} on a network error, an HTTP error or an empty body.
 *
 * @example
 * ```ts
 * const bytes = await loadArrayBuffer('audio/music/zone-a.ogg');
 * ```
 */
export function loadArrayBuffer(
  url: string,
  createRequest: () => XhrLike = () => new XMLHttpRequest(),
): Promise<ArrayBuffer> {
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const request = createRequest();
    request.open('GET', url);
    request.responseType = 'arraybuffer';
    request.onload = () => {
      const ok = request.status === 0 || (request.status >= 200 && request.status < 300);
      const body = request.response;
      if (ok && body instanceof ArrayBuffer && body.byteLength > 0) resolve(body);
      else reject(new AudioLoadError(url, `status ${request.status}`));
    };
    request.onerror = () => {
      reject(new AudioLoadError(url, 'network error'));
    };
    request.send();
  });
}

/** The part of an `OfflineAudioContext` {@link decodeAudioFile} uses. */
export interface DecodeContextLike {
  /**
   * Decodes compressed audio (callback form — the one every engine has).
   *
   * @param data - The file bytes (detached by the call).
   * @param success - Receives the decoded buffer.
   * @param error - Receives the failure.
   * @returns A promise on newer engines (ignored).
   */
  decodeAudioData(
    data: ArrayBuffer,
    success: (buffer: AudioBufferLike) => void,
    error: (reason: unknown) => void,
  ): unknown;
}

/**
 * Default decode context: `new OfflineAudioContext(2, 1, 32000)` — decoding through it resamples
 * to 32 kHz (Chromium 69 has no `AudioContext({ sampleRate })`, decision D22).
 *
 * @returns The context.
 * @throws {Error} When the engine has no `OfflineAudioContext`.
 */
function createDecodeContext(): DecodeContextLike {
  if (typeof OfflineAudioContext === 'undefined') throw new Error('no OfflineAudioContext');
  return new OfflineAudioContext(2, 1, DECODE_SAMPLE_RATE);
}

/**
 * Decodes an audio file at {@link DECODE_SAMPLE_RATE} through an offline context.
 *
 * @param data - The file bytes.
 * @param createContext - Context factory (default: `OfflineAudioContext(2, 1, 32000)`).
 * @param url - For error messages.
 * @returns A promise of the decoded buffer (resampled to the context's rate).
 * @throws Rejects with {@link AudioLoadError} when decoding fails.
 *
 * @example
 * ```ts
 * const buffer = await decodeAudioFile(await loadArrayBuffer(url));
 * ```
 */
export function decodeAudioFile(
  data: ArrayBuffer,
  createContext: () => DecodeContextLike = createDecodeContext,
  url = '(buffer)',
): Promise<AudioBufferLike> {
  return new Promise<AudioBufferLike>((resolve, reject) => {
    let context: DecodeContextLike;
    try {
      context = createContext();
    } catch (error) {
      reject(new AudioLoadError(url, error instanceof Error ? error.message : String(error)));
      return;
    }
    const pending = context.decodeAudioData(data, resolve, (reason: unknown) => {
      reject(new AudioLoadError(url, `decode failed (${String(reason)})`));
    });
    // Newer engines also return a promise that rejects alongside the callback.
    if (pending instanceof Promise) pending.catch(() => undefined);
  });
}

/** Options of {@link createAudioLoader}. */
export interface AudioLoaderOptions {
  /** Rate of synthesized sounds and songs (default `SYNTH_SAMPLE_RATE`, 22,050). */
  readonly sampleRate?: number;
  /**
   * Fetches a file (default {@link loadArrayBuffer}).
   *
   * @param url - Relative URL.
   * @returns The bytes.
   */
  readonly loadFile?: (url: string) => Promise<ArrayBuffer>;
  /**
   * Decodes a file (default {@link decodeAudioFile} at 32 kHz).
   *
   * @param data - The bytes.
   * @param url - The URL (error messages).
   * @returns The decoded buffer.
   */
  readonly decode?: (data: ArrayBuffer, url: string) => Promise<AudioBufferLike>;
}

/** Renders and decodes audio content. */
export interface AudioLoader {
  /** Rate of synthesized sounds. */
  readonly sampleRate: number;
  /**
   * Prepares the whole SFX bank: synthesizes every `params` cue and fetches + decodes every
   * `file` cue (in parallel); each cue's volume is baked into its samples.
   *
   * @param content - The bank.
   * @param onProgress - Called with 0…1 as cues finish.
   * @returns A promise of one prepared sound per cue id (`null` where the bank has none).
   * @throws Rejects with {@link AudioLoadError} when a file cannot be loaded or decoded.
   */
  loadSfx(content: SfxContent, onProgress?: LoadProgress): Promise<Array<PreparedSound | null>>;
  /**
   * Prepares one music track: renders its song or fetches + decodes its file.
   *
   * @param track - The track.
   * @returns A promise of the prepared track (loop points in its own frames).
   * @throws Rejects with {@link AudioLoadError} when a file cannot be loaded or decoded.
   */
  loadTrack(track: MusicTrackDef): Promise<PreparedTrack>;
}

/**
 * Scales every channel of a decoded buffer in place.
 *
 * @param buffer - The buffer.
 * @param gain - The factor.
 */
function scaleBuffer(buffer: AudioBufferLike, gain: number): void {
  if (gain === 1) return;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < data.length; i++) data[i] *= gain;
  }
}

/**
 * Creates the audio loader.
 *
 * @param options - Synth rate, file fetcher and decoder (tests inject fakes).
 * @returns The loader.
 *
 * @example
 * ```ts
 * const loader = createAudioLoader();
 * const sounds = await loader.loadSfx(sfx.content, (f) => overlay.showProgress(f, 'LOADING'));
 * const theme = await loader.loadTrack(music.content.tracks[0]);
 * ```
 */
export function createAudioLoader(options: AudioLoaderOptions = {}): AudioLoader {
  const sampleRate = options.sampleRate ?? SYNTH_SAMPLE_RATE;
  const loadFile = options.loadFile ?? ((url: string) => loadArrayBuffer(url));
  const decode =
    options.decode ??
    ((data: ArrayBuffer, url: string) => decodeAudioFile(data, createDecodeContext, url));

  /**
   * Fetches and decodes a file.
   *
   * @param url - Relative URL.
   * @returns The decoded buffer.
   */
  const loadDecoded = async (url: string): Promise<AudioBufferLike> =>
    decode(await loadFile(url), url);

  return {
    sampleRate,
    async loadSfx(content, onProgress) {
      const out: Array<PreparedSound | null> = content.cues.map(() => null);
      const total = content.cues.filter((cue) => cue !== null).length;
      let done = 0;
      onProgress?.(total === 0 ? 1 : 0);
      const finish = (): void => {
        done++;
        onProgress?.(done / total);
      };
      const pending: Array<Promise<void>> = [];
      content.cues.forEach((def, id) => {
        if (def === null) return;
        if (def.params !== null) {
          const pcm = renderSfx(def.params, sampleRate);
          if (def.volume !== 1) for (let i = 0; i < pcm.length; i++) pcm[i] *= def.volume;
          out[id] = { pcm, buffer: null, sampleRate };
          finish();
        } else if (def.file !== null) {
          const url = def.file;
          pending.push(
            loadDecoded(url).then((buffer) => {
              scaleBuffer(buffer, def.volume);
              out[id] = { pcm: null, buffer, sampleRate: buffer.sampleRate };
              finish();
            }),
          );
        }
      });
      await Promise.all(pending);
      return out;
    },
    async loadTrack(track) {
      if (track.song !== null) {
        const rendered = renderSong(track.song, sampleRate);
        return {
          id: track.id,
          pcm: rendered.pcm,
          buffer: null,
          sampleRate,
          loopStart: rendered.loopStart,
          loopEnd: rendered.loopEnd,
        };
      }
      if (track.file === null) throw new AudioLoadError(track.id, 'track has no song or file');
      const file = track.file;
      const buffer = await loadDecoded(file.url);
      const scale = buffer.sampleRate / file.sampleRate;
      const looping = file.loopStart >= 0 && file.loopEnd > file.loopStart;
      return {
        id: track.id,
        pcm: null,
        buffer,
        sampleRate: buffer.sampleRate,
        loopStart: looping ? Math.round(file.loopStart * scale) : -1,
        loopEnd: looping ? Math.min(Math.round(file.loopEnd * scale), buffer.length) : -1,
      };
    },
  };
}
