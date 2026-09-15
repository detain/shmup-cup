/**
 * # replay/format — replay headers, recording, playback and the file format
 *
 * **Responsibility.** The parts of `core/replay` that need no game session (see the module docs
 * of `./index.ts`): the {@link ReplayHeader}, the per-tick input
 * {@link createReplayRecorder | recorder}, the {@link createPlayback | playback} with its desync report, and the JSON file format
 * ({@link encodeReplay} / {@link decodeReplay}, RLE + varints + base64). Split out in M2-15 so the
 * scene flow's attract mode (`core/scenes`, which `core/game` imports) can decode and play the
 * bundled demos without importing `core/game` back; `./index.ts` re-exports all of it.
 *
 * M3-01: the header gained {@link ReplayHeader.assists} (the run's `AssistFlag` bits —
 * informative; {@link createReplayHeader} defaults it from `assisted` and `GameConfig.invincible`,
 * {@link decodeReplay} reads a replay without it as god mode when `assisted`, else 0). A whole
 * run's replay (`./run.ts`) is a list of these single-World replays.
 *
 * **Implements.** shmup_feat.md §21 Replays, §22 determinism (see `./index.ts`).
 *
 * @module
 */
import {
  DEFAULT_GAME_CONFIG,
  resolveGameConfig,
  type GameConfig,
  type StartingLoadout,
} from '../config/index.js';
import { hashWorld } from '../debug/index.js';
import { MAX_PLAYERS, createInputSnapshot, type InputSnapshot } from '../input/index.js';
import type { PlatformInput } from '../platform/index.js';
import type { World } from '../world/index.js';

/** The `kind` of an encoded replay document ({@link ReplayJson}). */
export const REPLAY_KIND = 'replay';

/**
 * Current replay format version: bumped when the encoding or what a header must hold changes (a
 * replay of another version is rejected by {@link decodeReplay}).
 */
export const REPLAY_FORMAT_VERSION = 1;

/** Ticks between two recorded state hashes (10 s at 60 Hz). */
export const REPLAY_HASH_INTERVAL = 600;

/** Ticks a recorder preallocates by default: 10 minutes at 60 Hz. */
const DEFAULT_RECORDER_CAPACITY = 36_000;

/** Replay file header: everything needed to recreate the starting state. */
export interface ReplayHeader {
  /** Replay format version ({@link REPLAY_FORMAT_VERSION} when recorded). */
  readonly formatVersion: number;
  /** Build that recorded it (the apps' `__SHMUP_BUILD__`, a git SHA; golden replays: `golden`). */
  readonly buildId: string;
  /** Gameplay RNG seed (`config.seed`, repeated for readability). */
  readonly seed: number;
  /** Every sim-affecting option: the session's whole resolved `GameConfig`. */
  readonly config: GameConfig;
  /** Stage the run started in (`config.stage`; `null` = free flight). */
  readonly stageId: string | null;
  /** Checkpoint the run started from (-1 = the stage start, else an index into `checkpoints`). */
  readonly checkpoint: number;
  /** Starting loadout (`config.loadout`). */
  readonly loadout: StartingLoadout;
  /** God mode was on for the whole run (playback turns it on; scores count as assisted). */
  readonly assisted: boolean;
  /**
   * What assisted the run it belongs to (M3-01 — `core/replay` `AssistFlag` bits: god mode, the
   * invincibility and game-speed assists, a secret code; shmup_feat.md §21 "flag … replays as
   * assisted"). Informative — playback reads only {@link ReplayHeader.assisted} and the config
   * (whose `invincible` is the assist itself). A replay recorded before M3-01 reads as `GodMode`
   * when `assisted`, else 0.
   */
  readonly assists: number;
}

/** What {@link createReplayHeader} needs beyond the config. */
export interface ReplayHeaderOptions {
  /** Build id (default `'dev'`). */
  readonly buildId?: string;
  /** Start checkpoint (default -1 = the stage start). */
  readonly checkpoint?: number;
  /** God mode on for the whole run (default `false`). */
  readonly assisted?: boolean;
  /**
   * The run's assist flags (M3-01 — `AssistFlag`; default: `GodMode` when `assisted`, the
   * invincibility assist's bit when the config has it, else 0).
   */
  readonly assists?: number;
}

/**
 * Builds the header of a session about to be recorded.
 *
 * @param config - The session's config (resolved with `resolveGameConfig` — it is frozen as is).
 * @param options - Build id, start checkpoint, assisted flag.
 * @returns The frozen header.
 * @throws {RangeError} When `checkpoint` is not an integer ≥ -1, or `assists` is not a mask 0–255.
 *
 * @example
 * ```ts
 * const header = createReplayHeader(resolveGameConfig({ stage: 'zone-a', seed: 3 }), {
 *   buildId: __SHMUP_BUILD__,
 *   assisted: true,
 * });
 * header.stageId; // → 'zone-a'
 * ```
 */
export function createReplayHeader(
  config: GameConfig,
  options: ReplayHeaderOptions = {},
): ReplayHeader {
  const checkpoint = options.checkpoint ?? -1;
  if (!Number.isInteger(checkpoint) || checkpoint < -1) {
    throw new RangeError(`replay checkpoint must be an integer ≥ -1, got ${String(checkpoint)}`);
  }
  const assisted = options.assisted === true;
  const assists = options.assists ?? (assisted ? 1 : 0) | (config.invincible ? 2 : 0);
  if (!Number.isInteger(assists) || assists < 0 || assists > 0xff) {
    throw new RangeError(`replay assists must be a flag mask 0–255, got ${String(assists)}`);
  }
  return Object.freeze({
    formatVersion: REPLAY_FORMAT_VERSION,
    buildId: options.buildId ?? 'dev',
    seed: config.seed,
    config,
    stageId: config.stage,
    checkpoint,
    loadout: config.loadout,
    assisted,
    assists,
  });
}

/** A decoded (or freshly recorded) replay. */
export interface Replay {
  /** Everything needed to recreate the starting state. */
  readonly header: ReplayHeader;
  /** Recorded ticks. */
  readonly ticks: number;
  /**
   * The input: exactly {@link MAX_PLAYERS} arrays (index 0 = player 1) of `ticks` words, each
   * `held | pressed << 16` ({@link packReplayInput}).
   */
  readonly inputs: readonly Uint32Array[];
  /** Ticks between two recorded hashes. */
  readonly hashInterval: number;
  /** `hashes[k]` = `hashWorld` after tick `(k + 1) · hashInterval` (`floor(ticks / interval)`). */
  readonly hashes: Uint32Array;
  /** `hashWorld` after the last tick. */
  readonly finalHash: number;
}

/**
 * Packs one player's input of one tick into a replay word.
 *
 * @param held - Actions held (16 bits used).
 * @param pressed - Actions pressed since the previous tick (16 bits used).
 * @returns `held | pressed << 16`, unsigned.
 *
 * @example
 * ```ts
 * packReplayInput(Action.Up, Action.Up) === (Action.Up | (Action.Up << 16)) >>> 0; // → true
 * ```
 */
export function packReplayInput(held: number, pressed: number): number {
  return ((held & 0xffff) | ((pressed & 0xffff) << 16)) >>> 0;
}

/** Options of {@link createReplayRecorder}. */
export interface RecorderOptions {
  /** Ticks to preallocate (default 36,000 = 10 minutes; buffers double when a run outlasts it). */
  readonly capacity?: number;
  /** Ticks between two hashes (default {@link REPLAY_HASH_INTERVAL}). */
  readonly hashInterval?: number;
}

/** Records a session (see {@link createReplayRecorder}). */
export interface ReplayRecorder extends PlatformInput {
  /** The header the replay gets. */
  readonly header: ReplayHeader;
  /** Ticks recorded so far (polls). */
  readonly ticks: number;
  /**
   * Polls the source input once and records every player's `held` / `pressed` masks.
   *
   * @returns The source's snapshot (unchanged — the session sees exactly what was recorded).
   */
  poll(): InputSnapshot;
  /**
   * Call after every tick: stores `hashWorld(world)` when the tick count reached a multiple of
   * the hash interval (once per tick — a second call for the same tick does nothing).
   *
   * @param world - The session's World after the tick.
   */
  check(world: World): void;
  /**
   * Ends the recording.
   *
   * @param world - The session's World after the last tick (its hash becomes `finalHash`).
   * @returns The replay (its arrays are trimmed copies; the recorder may be dropped).
   * @throws {Error} When a periodic hash is missing — `check(world)` was not called after every
   *   tick (a replay without its hashes could not detect a desync).
   */
  finish(world: World): Replay;
}

/**
 * Grows a word buffer to hold at least `need` entries (doubling).
 *
 * @param buffer - Current buffer.
 * @param need - Entries needed.
 * @returns The buffer, or a larger copy.
 */
function grow(buffer: Uint32Array<ArrayBuffer>, need: number): Uint32Array<ArrayBuffer> {
  if (need <= buffer.length) return buffer;
  let size = buffer.length > 0 ? buffer.length : 1;
  while (size < need) size *= 2;
  const next = new Uint32Array(size);
  next.set(buffer);
  return next;
}

/**
 * Validates a hash interval.
 *
 * @param interval - Ticks.
 * @throws {RangeError} When it is not a positive integer.
 */
function checkInterval(interval: number): void {
  if (!Number.isInteger(interval) || interval <= 0) {
    throw new RangeError(`replay hash interval must be a positive integer, got ${interval}`);
  }
}

/**
 * Creates a recorder that wraps a session's input source. Give the recorder to the game as its
 * platform input (`{ ...platform, input: recorder }`), call `check(world)` after every tick and
 * `finish(world)` at the end.
 *
 * @remarks
 * `poll()` and `check()` never allocate unless the run outlasts the preallocated capacity (the
 * buffers then double). Record from the session's first tick: the replay starts where the header
 * says (use {@link createReplayGame} to create the session from the header, so a checkpoint start
 * or god mode is set up exactly like on playback).
 *
 * @param source - The real input (the platform's `PlatformInput`).
 * @param header - The session's header ({@link createReplayHeader}).
 * @param options - Capacity and hash interval.
 * @returns The recorder.
 * @throws {RangeError} When the capacity or the hash interval is not a positive integer. (Its
 *   `finish()` throws an `Error` when `check()` was skipped on a hash tick.)
 *
 * @example
 * ```ts
 * const platform = createHeadlessPlatform();
 * const header = createReplayHeader(resolveGameConfig({ stage: 'zone-a' }));
 * const recorder = createReplayRecorder(platform.input, header);
 * const game = createReplayGame({ ...platform, input: recorder }, header, db);
 * for (let i = 0; i < 3600; i++) {
 *   commitPlayerInput(platform.snapshot.players[0], i % 120 < 60 ? Action.Up : Action.Down);
 *   game.step();
 *   recorder.check(game.world);
 * }
 * const replay = recorder.finish(game.world);
 * ```
 */
export function createReplayRecorder(
  source: PlatformInput,
  header: ReplayHeader,
  options: RecorderOptions = {},
): ReplayRecorder {
  const capacity = options.capacity ?? DEFAULT_RECORDER_CAPACITY;
  if (!Number.isInteger(capacity) || capacity <= 0) {
    throw new RangeError(`replay recorder capacity must be a positive integer, got ${capacity}`);
  }
  const interval = options.hashInterval ?? REPLAY_HASH_INTERVAL;
  checkInterval(interval);
  const buffers: Array<Uint32Array<ArrayBuffer>> = [];
  for (let p = 0; p < MAX_PLAYERS; p++) buffers.push(new Uint32Array(capacity));
  let hashes = new Uint32Array(Math.floor(capacity / interval) + 1);
  const counts = { ticks: 0, hashes: 0, checked: 0 };
  return {
    header,
    get ticks() {
      return counts.ticks;
    },
    poll() {
      const snapshot = source.poll();
      const tick = counts.ticks;
      if (tick >= buffers[0].length) {
        for (let p = 0; p < MAX_PLAYERS; p++) buffers[p] = grow(buffers[p], tick + 1);
      }
      const players = snapshot.players;
      for (let p = 0; p < MAX_PLAYERS; p++) {
        const input = p < players.length ? players[p] : null;
        buffers[p][tick] = input === null ? 0 : packReplayInput(input.held, input.pressed);
      }
      counts.ticks = tick + 1;
      return snapshot;
    },
    check(world) {
      const tick = counts.ticks;
      if (tick === counts.checked || tick % interval !== 0) return;
      counts.checked = tick;
      const index = tick / interval - 1;
      if (index >= hashes.length) hashes = grow(hashes, index + 1);
      hashes[index] = hashWorld(world);
      if (index + 1 > counts.hashes) counts.hashes = index + 1;
    },
    finish(world) {
      const ticks = counts.ticks;
      const inputs: Uint32Array[] = [];
      for (let p = 0; p < MAX_PLAYERS; p++) inputs.push(buffers[p].slice(0, ticks));
      const expected = Math.floor(ticks / interval);
      if (counts.hashes < expected) {
        throw new Error(
          `replay recorder: ${expected - counts.hashes} state hash(es) missing — call check(world) after every tick`,
        );
      }
      return Object.freeze({
        header,
        ticks,
        inputs: Object.freeze(inputs),
        hashInterval: interval,
        hashes: hashes.slice(0, expected),
        finalHash: hashWorld(world),
      });
    },
  };
}

/** What playback found (see {@link ReplayPlayback.report}). */
export interface DesyncReport {
  /** No hash differed so far. */
  readonly ok: boolean;
  /** Hashes compared so far (the periodic ones and, once reached, the final one). */
  readonly checked: number;
  /** First tick whose hash differed (-1 = none). */
  readonly desyncTick: number;
  /** The recorded hash at {@link DesyncReport.desyncTick} (0 when none). */
  readonly expectedHash: number;
  /** The hash playback computed there (0 when none). */
  readonly actualHash: number;
  /** Whether the final hash was compared (after the last recorded tick). */
  readonly finished: boolean;
  /**
   * Whether the replay's build id equals {@link PlaybackOptions.buildId}; `null` when playback was
   * given no build id to compare.
   */
  readonly buildMatches: boolean | null;
}

/** Options of {@link createPlayback}. */
export interface PlaybackOptions {
  /** The running build's id, compared with `header.buildId` ({@link DesyncReport.buildMatches}). */
  readonly buildId?: string;
}

/** Feeds a replay into a session (see {@link createPlayback}). */
export interface ReplayPlayback extends PlatformInput {
  /** The replay. */
  readonly replay: Replay;
  /** Ticks played so far (polls). */
  readonly ticks: number;
  /** Every recorded tick has been polled. */
  readonly done: boolean;
  /** The desync report, updated by {@link ReplayPlayback.check}. */
  readonly report: DesyncReport;
  /**
   * The input of the next recorded tick (idle input once the replay is over): `held` and
   * `pressed` as recorded, `released` = held last tick and not now, device `'none'`.
   *
   * @returns The playback's own snapshot (reused — do not keep it).
   */
  poll(): InputSnapshot;
  /**
   * Call after every tick: compares `hashWorld(world)` with the recorded hash on every
   * hash-interval tick and after the last recorded tick; the first mismatch is kept in the report.
   * A call before the first tick only matters for a zero-tick replay, whose final hash is the
   * starting state's (compared then — {@link playReplay} makes that call).
   *
   * @param world - The session's World after the tick.
   */
  check(world: World): void;
}

/**
 * Creates the playback of a replay: a `PlatformInput` for a fresh session created from the
 * replay's header ({@link createReplayGame}), plus the desync report its `check()` fills.
 *
 * @remarks
 * `poll()` and `check()` never allocate (the snapshot is the playback's own; hashing on the
 * interval ticks boxes one number). A tampered input or a changed simulation shows up as a hash
 * mismatch at the first hash tick after the change ({@link DesyncReport.desyncTick}).
 *
 * @param replay - The replay (recorded or decoded).
 * @param options - The running build's id, to compare with the header.
 * @returns The playback.
 *
 * @example
 * ```ts
 * const playback = createPlayback(replay, { buildId: __SHMUP_BUILD__ });
 * const game = createReplayGame({ ...createHeadlessPlatform(), input: playback }, replay.header, db);
 * while (!playback.done) {
 *   game.step();
 *   playback.check(game.world);
 * }
 * playback.report.ok; // → true when the simulation reproduced every hash
 * ```
 */
export function createPlayback(replay: Replay, options: PlaybackOptions = {}): ReplayPlayback {
  const snapshot = createInputSnapshot();
  const players = snapshot.players;
  const inputs = replay.inputs;
  const interval = replay.hashInterval;
  const total = replay.ticks;
  // `checked` starts at -1 so a check() before the first tick compares a zero-tick replay's final
  // hash (the starting state); for longer replays that check finds nothing to compare.
  const counts = { ticks: 0, checked: -1 };
  const report = {
    ok: true,
    checked: 0,
    desyncTick: -1,
    expectedHash: 0,
    actualHash: 0,
    finished: false,
    buildMatches: options.buildId === undefined ? null : options.buildId === replay.header.buildId,
  };
  /**
   * Compares one hash and records the first mismatch.
   *
   * @param tick - Tick count the hash belongs to.
   * @param expected - Recorded hash.
   * @param world - The World.
   */
  const compare = (tick: number, expected: number, world: World): void => {
    const actual = hashWorld(world);
    report.checked++;
    if (actual !== expected && report.ok) {
      report.ok = false;
      report.desyncTick = tick;
      report.expectedHash = expected;
      report.actualHash = actual;
    }
  };
  return {
    replay,
    get ticks() {
      return counts.ticks;
    },
    get done() {
      return counts.ticks >= total;
    },
    report,
    poll() {
      const tick = counts.ticks;
      for (let p = 0; p < players.length; p++) {
        const player = players[p];
        const source = p < inputs.length ? inputs[p] : null;
        const word = source !== null && tick < total ? source[tick] : 0;
        const held = word & 0xffff;
        player.released = player.held & ~held;
        player.held = held;
        player.pressed = word >>> 16;
        player.device = 'none';
      }
      counts.ticks = tick + 1;
      return snapshot;
    },
    check(world) {
      const tick = counts.ticks;
      if (tick === counts.checked || tick > total) return;
      counts.checked = tick;
      if (tick > 0 && tick % interval === 0) {
        const index = tick / interval - 1;
        if (index < replay.hashes.length) compare(tick, replay.hashes[index], world);
      }
      if (tick === total) {
        compare(tick, replay.finalHash, world);
        report.finished = true;
      }
    },
  };
}

// ------------------------------------------------------------------------------ encoding

/** An encoded replay: plain JSON (see the module docs). */
export interface ReplayJson {
  /** Always {@link REPLAY_KIND}. */
  readonly kind: string;
  /** The header (its `config` holds every `GameConfig` field). */
  readonly header: ReplayHeader;
  /** Recorded ticks. */
  readonly ticks: number;
  /** Ticks between two hashes. */
  readonly hashInterval: number;
  /** Per player: the RLE-encoded words, base64 ({@link encodeInputRuns}). */
  readonly inputs: readonly string[];
  /** The periodic hashes. */
  readonly hashes: readonly number[];
  /** The final hash. */
  readonly finalHash: number;
}

/** Base64 alphabet (RFC 4648, standard). */
const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Encodes bytes as base64 (standard alphabet, `=` padding). Pure: no `btoa` (not in the core's
 * platform-free lib).
 *
 * @param bytes - Bytes.
 * @returns The text.
 *
 * @example
 * ```ts
 * encodeBase64(new Uint8Array([104, 105])); // → 'aGk='
 * ```
 */
export function encodeBase64(bytes: Uint8Array): string {
  const out: string[] = [];
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out.push(BASE64[n >> 18], BASE64[(n >> 12) & 63], BASE64[(n >> 6) & 63], BASE64[n & 63]);
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i] << 16;
    out.push(BASE64[n >> 18], BASE64[(n >> 12) & 63], '==');
  } else if (rest === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out.push(BASE64[n >> 18], BASE64[(n >> 12) & 63], BASE64[(n >> 6) & 63], '=');
  }
  return out.join('');
}

/**
 * Decodes standard base64 (padding required when the length is not a multiple of 4 — i.e. the
 * output of {@link encodeBase64}).
 *
 * @param text - The text.
 * @returns The bytes.
 * @throws {RangeError} When the text has a character outside the alphabet, a bad length or
 *   misplaced padding.
 *
 * @example
 * ```ts
 * decodeBase64('aGk='); // → Uint8Array [104, 105]
 * ```
 */
export function decodeBase64(text: string): Uint8Array {
  if (text.length % 4 !== 0) throw new RangeError('base64 length must be a multiple of 4');
  const padding = text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0;
  const out = new Uint8Array((text.length / 4) * 3 - padding);
  const dataEnd = text.length - padding;
  let o = 0;
  for (let i = 0; i < text.length; i += 4) {
    let n = 0;
    for (let k = 0; k < 4; k++) {
      const pos = i + k;
      // The padding positions hold '='; anywhere else '=' is not in the alphabet → invalid.
      const v = pos < dataEnd ? BASE64.indexOf(text.charAt(pos)) : 0;
      if (v < 0) throw new RangeError(`invalid base64 character at ${pos}`);
      n = (n << 6) | v;
    }
    if (o < out.length) out[o++] = (n >> 16) & 255;
    if (o < out.length) out[o++] = (n >> 8) & 255;
    if (o < out.length) out[o++] = n & 255;
  }
  return out;
}

/**
 * Appends an unsigned 32-bit value as an LEB128 varint.
 *
 * @param out - Byte list.
 * @param value - Unsigned 32-bit value.
 */
function pushVarint(out: number[], value: number): void {
  let v = value >>> 0;
  while (v >= 0x80) {
    out.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  out.push(v);
}

/**
 * Run-length encodes one player's words: runs of `(value, count)` as unsigned LEB128 varints,
 * then base64.
 *
 * @param words - The words (`held | pressed << 16`).
 * @param ticks - How many of them (default all).
 * @returns The text (`''` for zero ticks).
 *
 * @example
 * ```ts
 * encodeInputRuns(new Uint32Array([0, 0, 0, 5])); // runs (0, 3), (5, 1) → 'AAMFAQ=='
 * ```
 */
export function encodeInputRuns(words: Uint32Array, ticks: number = words.length): string {
  const bytes: number[] = [];
  let i = 0;
  while (i < ticks) {
    const value = words[i];
    let run = 1;
    while (i + run < ticks && words[i + run] === value) run++;
    pushVarint(bytes, value);
    pushVarint(bytes, run);
    i += run;
  }
  return encodeBase64(Uint8Array.from(bytes));
}

/**
 * Decodes {@link encodeInputRuns}' text back into words.
 *
 * @param text - The base64 runs.
 * @param ticks - Words expected (the runs must add up to exactly this).
 * @returns The words.
 * @throws {RangeError} When the text is not valid base64, a varint is truncated or longer than 32
 *   bits, a run is empty, or the runs do not add up to `ticks`.
 *
 * @example
 * ```ts
 * decodeInputRuns('AAMFAQ==', 4); // → Uint32Array [0, 0, 0, 5]
 * ```
 */
export function decodeInputRuns(text: string, ticks: number): Uint32Array {
  const bytes = decodeBase64(text);
  const words = new Uint32Array(ticks);
  let pos = 0;
  /**
   * Reads one varint at `pos`.
   *
   * @returns The value.
   * @throws {RangeError} When truncated or too long.
   */
  const read = (): number => {
    let value = 0;
    for (let shift = 0; shift <= 28; shift += 7) {
      if (pos >= bytes.length) throw new RangeError('replay input runs are truncated');
      const b = bytes[pos++];
      // The fifth byte may only carry the top 4 bits (and no continuation).
      if (shift === 28 && b > 0x0f) throw new RangeError('replay input varint exceeds 32 bits');
      value += (b & 0x7f) * (1 << shift);
      if ((b & 0x80) === 0) return value;
    }
    throw new RangeError('replay input varint exceeds 32 bits');
  };
  let tick = 0;
  while (pos < bytes.length) {
    const value = read();
    const run = read();
    if (run === 0) throw new RangeError('replay input has an empty run');
    if (tick + run > ticks) {
      throw new RangeError(`replay input runs exceed the ${ticks} recorded ticks`);
    }
    words.fill(value, tick, tick + run);
    tick += run;
  }
  if (tick !== ticks) {
    throw new RangeError(`replay input runs cover ${tick} of ${ticks} ticks`);
  }
  return words;
}

/**
 * Encodes a replay as plain JSON data ({@link ReplayJson}; `JSON.stringify` it to save).
 *
 * @param replay - The replay.
 * @returns The document.
 *
 * @example
 * ```ts
 * writeFileSync('run.replay.json', JSON.stringify(encodeReplay(replay)));
 * ```
 */
export function encodeReplay(replay: Replay): ReplayJson {
  const header = replay.header;
  const config: Record<string, unknown> = {};
  const source = header.config as unknown as Record<string, unknown>;
  for (const key of Object.keys(DEFAULT_GAME_CONFIG)) {
    const value = source[key];
    config[key] = Array.isArray(value) ? value.slice() : value;
  }
  const inputs: string[] = [];
  for (let p = 0; p < replay.inputs.length; p++) {
    inputs.push(encodeInputRuns(replay.inputs[p], replay.ticks));
  }
  return {
    kind: REPLAY_KIND,
    header: {
      formatVersion: header.formatVersion,
      buildId: header.buildId,
      seed: header.seed,
      stageId: header.stageId,
      checkpoint: header.checkpoint,
      loadout: header.loadout,
      assisted: header.assisted,
      assists: header.assists,
      config: config as unknown as GameConfig,
    },
    ticks: replay.ticks,
    hashInterval: replay.hashInterval,
    inputs,
    hashes: Array.from(replay.hashes),
    finalHash: replay.finalHash,
  };
}

/**
 * Whether a value is a plain (non-array, non-null) object.
 *
 * @param value - Anything.
 * @returns `true` for an object whose fields can be read.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Throws unless `value` is an unsigned 32-bit integer.
 *
 * @param value - The value.
 * @param path - Field path for the message.
 * @returns The value.
 * @throws {RangeError} When it is not.
 */
function u32(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 0xffffffff) {
    throw new RangeError(`replay ${path} must be an unsigned 32-bit integer`);
  }
  return value;
}

/**
 * Decodes and validates a replay document ({@link ReplayJson}, e.g. `JSON.parse` of a
 * `.replay.json` file). Extra top-level fields (a golden file's expectations) are ignored.
 *
 * @param data - The parsed document.
 * @returns The replay.
 * @throws {RangeError} When the document is not a replay, has another format version, its config
 *   fails `resolveGameConfig`, the header's stage / seed / loadout disagree with its config, the
 *   input does not decode to exactly `ticks` words per player, or the hash list has the wrong
 *   length.
 *
 * @example
 * ```ts
 * const replay = decodeReplay(JSON.parse(readFileSync('run.replay.json', 'utf8')));
 * ```
 */
export function decodeReplay(data: unknown): Replay {
  if (!isRecord(data) || data.kind !== REPLAY_KIND) {
    throw new RangeError(`not a replay document (kind must be "${REPLAY_KIND}")`);
  }
  const h = data.header;
  if (!isRecord(h)) throw new RangeError('replay header must be an object');
  if (h.formatVersion !== REPLAY_FORMAT_VERSION) {
    throw new RangeError(
      `replay format version ${String(h.formatVersion)} is not supported (expected ${REPLAY_FORMAT_VERSION})`,
    );
  }
  if (typeof h.buildId !== 'string') throw new RangeError('replay header.buildId must be a string');
  if (!isRecord(h.config)) throw new RangeError('replay header.config must be an object');
  const overrides: Record<string, unknown> = {};
  for (const key of Object.keys(DEFAULT_GAME_CONFIG)) {
    if (Object.prototype.hasOwnProperty.call(h.config, key)) overrides[key] = h.config[key];
  }
  const config = resolveGameConfig(overrides);
  if (h.seed !== config.seed) throw new RangeError('replay header.seed disagrees with its config');
  if (h.stageId !== config.stage) {
    throw new RangeError('replay header.stageId disagrees with its config');
  }
  if (h.loadout !== config.loadout) {
    throw new RangeError('replay header.loadout disagrees with its config');
  }
  if (typeof h.assisted !== 'boolean') {
    throw new RangeError('replay header.assisted must be a boolean');
  }
  const checkpoint = h.checkpoint;
  if (typeof checkpoint !== 'number' || !Number.isInteger(checkpoint) || checkpoint < -1) {
    throw new RangeError('replay header.checkpoint must be an integer ≥ -1');
  }
  const assists = h.assists;
  if (
    assists !== undefined &&
    (typeof assists !== 'number' || !Number.isInteger(assists) || assists < 0 || assists > 0xff)
  ) {
    throw new RangeError('replay header.assists must be a flag mask 0–255');
  }
  const header = createReplayHeader(config, {
    buildId: h.buildId,
    checkpoint,
    assisted: h.assisted,
    // A replay recorded before M3-01 has none: god mode when `assisted`.
    assists: assists ?? (h.assisted ? 1 : 0),
  });
  const ticks = data.ticks;
  if (typeof ticks !== 'number' || !Number.isInteger(ticks) || ticks < 0) {
    throw new RangeError('replay ticks must be a non-negative integer');
  }
  const interval = data.hashInterval;
  if (typeof interval !== 'number') throw new RangeError('replay hashInterval must be a number');
  checkInterval(interval);
  const rawInputs = data.inputs;
  if (!Array.isArray(rawInputs) || rawInputs.length !== MAX_PLAYERS) {
    throw new RangeError(`replay inputs must hold ${MAX_PLAYERS} players`);
  }
  const inputs: Uint32Array[] = [];
  for (let p = 0; p < MAX_PLAYERS; p++) {
    const text: unknown = rawInputs[p];
    if (typeof text !== 'string') throw new RangeError(`replay inputs[${p}] must be a string`);
    inputs.push(decodeInputRuns(text, ticks));
  }
  const rawHashes = data.hashes;
  const expected = Math.floor(ticks / interval);
  if (!Array.isArray(rawHashes) || rawHashes.length !== expected) {
    throw new RangeError(`replay hashes must hold ${expected} values`);
  }
  const hashes = new Uint32Array(expected);
  for (let i = 0; i < expected; i++) hashes[i] = u32(rawHashes[i], `hashes[${i}]`);
  return Object.freeze({
    header,
    ticks,
    inputs: Object.freeze(inputs),
    hashInterval: interval,
    hashes,
    finalHash: u32(data.finalHash, 'finalHash'),
  });
}
