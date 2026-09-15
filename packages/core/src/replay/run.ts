/**
 * # replay/run — whole-run replays, their recorder and the replay library (plan M3-01)
 *
 * **Responsibility.** A game played through the scene flow is a **run**: one World per zone, bonus
 * stage and retry, with the players carried from World to World and a few things the flow decides
 * between ticks (a continue, a pause-menu secret). A {@link RunReplay} records such a run as a list
 * of **segments** — one per World, each an ordinary {@link Replay} (the World's header with its
 * config, the per-tick input, the periodic and final state hashes) plus its **start state** (what
 * the flow put into the World before its first tick: the carried players, the rank's stage term,
 * the checkpoint or bonus entrance to start from — opaque JSON here, built and applied by
 * `core/scenes`) and its **flow actions** (`[tick, code]` pairs, {@link RunAction}). Playing the
 * segments in order (`core/scenes` `RunReplayPlayback`) reproduces the run with every hash checked.
 *
 * - {@link SegmentRecorder} — records one World: the input of every tick it steps (the game scene
 *   hands it the snapshot it steps the World with — pauses and menus are not recorded), a hash
 *   every {@link REPLAY_HASH_INTERVAL} ticks, the flow actions, and — when the World is about to be
 *   changed outside a tick (the zone tally pays its bonus) — the final hash ({@link
 *   SegmentRecorder.seal}). Preallocated for {@link SEGMENT_CAPACITY} ticks; a longer World stops
 *   recording (its run can no longer be saved). `record` / `check` never allocate (hashing boxes one
 *   number every 600 ticks, as the M1-19 recorder does).
 * - {@link RunReplay}, {@link encodeRunReplay}, {@link decodeRunReplay}, {@link runReplayText},
 *   {@link parseRunReplayText} — the JSON file format (`{ kind: 'run-replay', … segments: [{
 *   replay, start, actions }] }`, each segment's replay in the M1-19 {@link ReplayJson} encoding).
 * - {@link AssistFlag}, {@link runAssisted} — what assisted the run (shmup_feat.md §21 "game-speed
 *   assist, invincibility assist — both flag scores/replays as assisted"): the invincibility and
 *   game-speed assists, a secret code, the debug god mode. Every segment's header carries the run's
 *   flags (`ReplayHeader.assists`), so a single segment says it too.
 * - {@link ReplayLibrary}, {@link createReplayLibrary} — the saved replays (shmup_feat.md §21
 *   "[P2] save/share replays, replay browser"): slot 0 is the **last game** (every finished run
 *   replaces it), slots 1–{@link KEPT_REPLAY_SLOTS} are the ones the player **kept**; each lives
 *   under its own `Platform.storage` key ({@link replayStorageKey}) as the replay's text, at most
 *   {@link MAX_REPLAY_TEXT} characters (a longer run is not saved), the kept ones together at most
 *   {@link MAX_KEPT_REPLAY_TEXT}. **Storage budget:** the web / Tizen storage adapter (shell
 *   `storage`) counts two bytes a UTF-16 character, key included, against 256 KiB a value and
 *   1 MiB for all of the app's keys — so one replay stays under the value limit (≈ 234 KiB) and
 *   the whole library under ≈ 489 KiB: even a save (`save.v1`) and its corrupt copy at that value
 *   limit each still fit beside it, so replays can never crowd the save out of the storage.
 *   **Sharing** is the text itself: {@link ReplayLibrary.exportText} /
 *   {@link ReplayLibrary.importText} (the web host copies it to the clipboard and imports a pasted
 *   one — the replay is locked to its build only by its hashes).
 *
 * Pure: the storage arrives as a `PlatformStorage`; nothing here reads a clock.
 *
 * **Implements.** shmup_feat.md §21 Replays — "[P2] save/share replays, replay browser,
 * fast-forward" (the browser and the fast-forward are `core/scenes`'), "header: … all sim-affecting
 * options", "periodic state hash embedded to detect desyncs"; §21 accessibility — assisted flags.
 *
 * @module
 */
import { hashWorld } from '../debug/index.js';
import { MAX_PLAYERS, type InputSnapshot } from '../input/index.js';
import type { PlatformStorage } from '../platform/index.js';
import type { World } from '../world/index.js';
import {
  REPLAY_HASH_INTERVAL,
  decodeReplay,
  encodeReplay,
  packReplayInput,
  type Replay,
  type ReplayHeader,
  type ReplayJson,
} from './format.js';

/** The `kind` of an encoded run replay ({@link RunReplayJson}). */
export const RUN_REPLAY_KIND = 'run-replay';

/** Format version of {@link RunReplayJson} (bumped when the layout changes). */
export const RUN_REPLAY_FORMAT_VERSION = 1;

/** Ticks a {@link SegmentRecorder} holds: 20 minutes at 60 Hz (a zone lasts 3–6). */
export const SEGMENT_CAPACITY = 72_000;

/** Most segments (Worlds) a run replay holds; a longer run can no longer be saved. */
export const MAX_RUN_SEGMENTS = 48;

/** Most flow actions one segment records ({@link RunAction}). */
export const MAX_SEGMENT_ACTIONS = 64;

/**
 * Longest replay text the library stores, in characters (a longer run is not saved). Sized to the
 * web / Tizen storage adapter's 256 KiB a value, which counts two bytes a UTF-16 character with
 * the key: `('shmup-cup:replay.last'.length + 120,000) × 2` = 240,042 bytes.
 */
export const MAX_REPLAY_TEXT = 120_000;

/**
 * Most characters the kept replays (slots 1 – {@link KEPT_REPLAY_SLOTS}) take together — KEEP and
 * a shared replay's import are refused beyond it ({@link ReplayStoreResult}.Full: delete one
 * first). With the last game's own {@link MAX_REPLAY_TEXT} the library never holds more than
 * 250,000 characters: 500,150 bytes in Web Storage with its keys, so the save and its corrupt
 * copy (at most 256 KiB each) and the small keys still fit the app's 1 MiB budget beside it.
 */
export const MAX_KEPT_REPLAY_TEXT = 130_000;

/** Slots of kept replays besides the last game's (slot 0). */
export const KEPT_REPLAY_SLOTS = 3;

/** Every library slot: the last game, then the kept ones. */
export const REPLAY_SLOTS = 1 + KEPT_REPLAY_SLOTS;

/**
 * What assisted a run (M3-01 — a bit mask; shmup_feat.md §21 "both flag scores/replays as
 * assisted"). A run with any bit set is **assisted**: its hi-score rows and replays are marked.
 */
export const AssistFlag = {
  /** The debug god mode (dev / test builds — the M1-19 `assisted` header field). */
  GodMode: 1,
  /** The invincibility assist (`GameConfig.invincible`). */
  Invincible: 2,
  /** The game-speed assist (`PlayOptions.speed` below 100 while the game ran). */
  Speed: 4,
  /** A secret code (the pause menu's FULL POWER or the title's extra ships). */
  Secret: 8,
} as const;

/**
 * Whether a set of {@link AssistFlag}s makes a run assisted.
 *
 * @param assists - The flags.
 * @returns `true` when any is set.
 */
export function runAssisted(assists: number): boolean {
  return (assists & 0xff) !== 0;
}

/**
 * The things the scene flow does to a World between its ticks that a replay must repeat (M3-01),
 * as {@link SegmentRecorder.action} codes. The parameter is packed into the code's upper bits
 * (`code | param << 8`).
 */
export const RunAction = {
  /** `core/world` `continueWorld(world, who)` — the parameter is the `who` player mask. */
  Continue: 1,
  /** `core/world` `grantFullPower(world, slot)` — the pause menu's FULL POWER secret. */
  FullPower: 2,
  /** `core/world` `selfDestruct(world, slot)` — the pause menu's joke code. */
  SelfDestruct: 3,
} as const;

/** A {@link RunAction} code. */
export type RunAction = (typeof RunAction)[keyof typeof RunAction];

/**
 * One World of a run: its replay, the start state the flow gave it, and the flow's actions.
 */
export interface RunSegment {
  /** The World's replay (its header's config names the stage, loop, time limit …). */
  readonly replay: Replay;
  /**
   * What the flow put into the World before its first tick (`core/scenes` builds and applies it:
   * the carried players, the rank's stage term, the start checkpoint or bonus entrance), or `null`
   * for a fresh World at its stage start.
   */
  readonly start: Readonly<Record<string, unknown>> | null;
  /** The flow's actions: `[tick, code | param << 8]` pairs, in order ({@link RunAction}). */
  readonly actions: Uint32Array;
}

/** A whole run (see the module docs). */
export interface RunReplay {
  /** {@link RUN_REPLAY_FORMAT_VERSION}. */
  readonly formatVersion: number;
  /** The build that recorded it (`__SHMUP_BUILD__`; informative — the hashes lock it). */
  readonly buildId: string;
  /** The hi-score mode of the run (`core/save` `HiScoreMode`: `1p`, `bossrush` …). */
  readonly mode: string;
  /** What the browser shows as the run's title (the ship and difficulty, e.g. `KESTREL NORMAL`). */
  readonly label: string;
  /** Player 1's final score. */
  readonly score: number;
  /** The last zone's map label (`''` outside a campaign). */
  readonly reached: string;
  /** The run's {@link AssistFlag}s. */
  readonly assists: number;
  /** Ticks over every segment. */
  readonly ticks: number;
  /** The Worlds, in order. */
  readonly segments: readonly RunSegment[];
}

/** One segment of an encoded run replay. */
export interface RunSegmentJson {
  /** The World's replay ({@link encodeReplay}). */
  readonly replay: ReplayJson;
  /** The start state (see {@link RunSegment.start}). */
  readonly start: Readonly<Record<string, unknown>> | null;
  /** The actions as a flat number list (`[tick, code, tick, code …]`). */
  readonly actions: readonly number[];
}

/** An encoded run replay (plain JSON). */
export interface RunReplayJson {
  /** Always {@link RUN_REPLAY_KIND}. */
  readonly kind: string;
  /** See {@link RunReplay.formatVersion}. */
  readonly formatVersion: number;
  /** See {@link RunReplay.buildId}. */
  readonly buildId: string;
  /** See {@link RunReplay.mode}. */
  readonly mode: string;
  /** See {@link RunReplay.label}. */
  readonly label: string;
  /** See {@link RunReplay.score}. */
  readonly score: number;
  /** See {@link RunReplay.reached}. */
  readonly reached: string;
  /** See {@link RunReplay.assists}. */
  readonly assists: number;
  /** The segments. */
  readonly segments: readonly RunSegmentJson[];
}

/**
 * Records one World of a run (see the module docs). A class: preallocated buffers, reused for every
 * segment of a flow.
 */
export class SegmentRecorder {
  /** The header of the segment being recorded (`null` while idle). */
  header: ReplayHeader | null = null;
  /** Its start state. */
  start: Readonly<Record<string, unknown>> | null = null;
  /** Ticks recorded so far. */
  ticks = 0;
  /** The World's hash at the seal ({@link SegmentRecorder.seal}), when sealed. */
  finalHash = 0;
  /** Whether the segment was sealed: later ticks and actions are not recorded. */
  sealed = false;
  /** Whether the segment outgrew the buffers ({@link SEGMENT_CAPACITY}): it cannot be saved. */
  overflow = false;
  /** Actions recorded so far (pairs). */
  actionCount = 0;
  /** Per player: the packed input words. */
  private readonly inputs: Uint32Array[];
  /** The periodic hashes. */
  private readonly hashes: Uint32Array;
  /** Hashes recorded so far. */
  private hashCount = 0;
  /** The actions (`[tick, code]` pairs). */
  private readonly actionWords = new Uint32Array(MAX_SEGMENT_ACTIONS * 2);

  /**
   * Creates an idle recorder.
   *
   * @param capacity - Ticks to hold (default {@link SEGMENT_CAPACITY}).
   */
  constructor(capacity: number = SEGMENT_CAPACITY) {
    const inputs: Uint32Array[] = [];
    for (let p = 0; p < MAX_PLAYERS; p++) inputs.push(new Uint32Array(capacity));
    this.inputs = inputs;
    this.hashes = new Uint32Array(Math.floor(capacity / REPLAY_HASH_INTERVAL) + 1);
  }

  /** Whether a segment is being recorded. */
  get active(): boolean {
    return this.header !== null;
  }

  /**
   * Starts a segment (a transition — nothing allocates).
   *
   * @param header - The World's header (`createReplayHeader` of its config).
   * @param start - Its start state (see {@link RunSegment.start}).
   */
  begin(header: ReplayHeader, start: Readonly<Record<string, unknown>> | null): void {
    this.header = header;
    this.start = start;
    this.ticks = 0;
    this.hashCount = 0;
    this.actionCount = 0;
    this.finalHash = 0;
    this.sealed = false;
    this.overflow = false;
  }

  /** Drops the segment (the recorder goes idle). */
  reset(): void {
    this.header = null;
    this.start = null;
    this.ticks = 0;
    this.sealed = false;
    this.overflow = false;
  }

  /**
   * Records the input of one World tick — call it with the snapshot the World is stepped with,
   * right before `stepWorld`. Never allocates.
   *
   * @param input - The tick's input.
   */
  record(input: Readonly<InputSnapshot>): void {
    if (this.header === null || this.sealed) return;
    const tick = this.ticks;
    const inputs = this.inputs;
    if (tick >= inputs[0].length) {
      this.overflow = true;
      return;
    }
    const players = input.players;
    for (let p = 0; p < MAX_PLAYERS; p++) {
      const player = p < players.length ? players[p] : null;
      inputs[p][tick] = player === null ? 0 : packReplayInput(player.held, player.pressed);
    }
    this.ticks = tick + 1;
  }

  /**
   * Call after every recorded tick: stores the World's hash on every
   * {@link REPLAY_HASH_INTERVAL}-th tick. Never allocates (hashing boxes one number).
   *
   * @param world - The World after the tick.
   */
  check(world: World): void {
    if (this.header === null || this.sealed || this.overflow) return;
    const tick = this.ticks;
    if (tick === 0 || tick % REPLAY_HASH_INTERVAL !== 0) return;
    const index = tick / REPLAY_HASH_INTERVAL - 1;
    if (index !== this.hashCount || index >= this.hashes.length) return;
    this.hashes[index] = hashWorld(world);
    this.hashCount = index + 1;
  }

  /**
   * Records a flow action at the World's current tick count (between ticks). Never allocates (a
   * full action list sets {@link SegmentRecorder.overflow}).
   *
   * @param code - A {@link RunAction}.
   * @param param - Its parameter (a player mask or slot, 0–0xffffff).
   */
  action(code: RunAction, param: number): void {
    if (this.header === null || this.sealed) return;
    const k = this.actionCount;
    if (k >= MAX_SEGMENT_ACTIONS) {
      this.overflow = true;
      return;
    }
    this.actionWords[k * 2] = this.ticks;
    this.actionWords[k * 2 + 1] = (code | (param << 8)) >>> 0;
    this.actionCount = k + 1;
  }

  /**
   * Seals the segment: the World's hash now becomes the final one and nothing more is recorded —
   * call it before the flow changes the World outside a tick without an action (the zone tally
   * pays its bonus). Does nothing when sealed already.
   *
   * @param world - The World.
   */
  seal(world: World): void {
    if (this.header === null || this.sealed) return;
    this.finalHash = hashWorld(world);
    this.sealed = true;
  }

  /**
   * Ends the segment (a transition — it allocates the segment's copies).
   *
   * @param world - The World (sealed now if it was not).
   * @param assists - The run's {@link AssistFlag}s, written into the segment's header.
   * @returns The segment, or `null` when idle or it overflowed.
   */
  finish(world: World, assists: number): RunSegment | null {
    const header = this.header;
    if (header === null) return null;
    this.seal(world);
    const overflow = this.overflow;
    this.header = null;
    if (overflow) return null;
    const ticks = this.ticks;
    const inputs: Uint32Array[] = [];
    for (let p = 0; p < MAX_PLAYERS; p++) inputs.push(this.inputs[p].slice(0, ticks));
    const expected = Math.floor(ticks / REPLAY_HASH_INTERVAL);
    if (this.hashCount < expected) return null;
    const replay: Replay = Object.freeze({
      header: Object.freeze({ ...header, assists }),
      ticks,
      inputs: Object.freeze(inputs),
      hashInterval: REPLAY_HASH_INTERVAL,
      hashes: this.hashes.slice(0, expected),
      finalHash: this.finalHash,
    });
    return Object.freeze({
      replay,
      start: this.start,
      actions: this.actionWords.slice(0, this.actionCount * 2),
    });
  }
}

/**
 * Encodes a run replay as plain JSON ({@link RunReplayJson}).
 *
 * @param run - The run replay.
 * @returns The document.
 */
export function encodeRunReplay(run: RunReplay): RunReplayJson {
  const segments: RunSegmentJson[] = [];
  for (const segment of run.segments) {
    segments.push({
      replay: encodeReplay(segment.replay),
      start: segment.start,
      actions: Array.from(segment.actions),
    });
  }
  return {
    kind: RUN_REPLAY_KIND,
    formatVersion: run.formatVersion,
    buildId: run.buildId,
    mode: run.mode,
    label: run.label,
    score: run.score,
    reached: run.reached,
    assists: run.assists,
    segments,
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
 * Reads a short text field.
 *
 * @param value - Anything.
 * @param path - Field name for the error.
 * @returns The text.
 * @throws {RangeError} When it is not a string of at most 64 characters.
 */
function shortText(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length > 64) {
    throw new RangeError(`run replay ${path} must be a string of at most 64 characters`);
  }
  return value;
}

/**
 * Decodes and validates a run replay document (`JSON.parse` of its text).
 *
 * @param data - The parsed document.
 * @returns The run replay.
 * @throws {RangeError} When it is not a run replay of this format, a field is malformed, it has no
 *   segment or more than {@link MAX_RUN_SEGMENTS}, a segment's replay fails `decodeReplay`, its
 *   start is not an object or `null`, or its actions are not `[tick, code]` pairs within the
 *   segment's ticks.
 */
export function decodeRunReplay(data: unknown): RunReplay {
  if (!isRecord(data) || data.kind !== RUN_REPLAY_KIND) {
    throw new RangeError(`not a run replay (kind must be "${RUN_REPLAY_KIND}")`);
  }
  if (data.formatVersion !== RUN_REPLAY_FORMAT_VERSION) {
    throw new RangeError(
      `run replay format version ${String(data.formatVersion)} is not supported (expected ${RUN_REPLAY_FORMAT_VERSION})`,
    );
  }
  const score = data.score;
  if (typeof score !== 'number' || !Number.isInteger(score) || score < 0) {
    throw new RangeError('run replay score must be a whole number ≥ 0');
  }
  const assists = data.assists;
  if (typeof assists !== 'number' || !Number.isInteger(assists) || assists < 0 || assists > 0xff) {
    throw new RangeError('run replay assists must be a flag mask 0–255');
  }
  const raw = data.segments;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_RUN_SEGMENTS) {
    throw new RangeError(`run replay segments must hold 1–${MAX_RUN_SEGMENTS} segments`);
  }
  const segments: RunSegment[] = [];
  let ticks = 0;
  for (let i = 0; i < raw.length; i++) {
    const item: unknown = raw[i];
    if (!isRecord(item)) throw new RangeError(`run replay segments[${i}] must be an object`);
    const replay = decodeReplay(item.replay);
    const start: unknown = item.start;
    if (start !== null && !isRecord(start)) {
      throw new RangeError(`run replay segments[${i}].start must be an object or null`);
    }
    const list: unknown = item.actions;
    if (!Array.isArray(list) || list.length % 2 !== 0 || list.length > MAX_SEGMENT_ACTIONS * 2) {
      throw new RangeError(`run replay segments[${i}].actions must be [tick, code] pairs`);
    }
    const actions = new Uint32Array(list.length);
    for (let k = 0; k < list.length; k++) {
      const value: unknown = list[k];
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
        throw new RangeError(`run replay segments[${i}].actions[${k}] must be a whole number`);
      }
      if (k % 2 === 0 && (value > replay.ticks || (k > 0 && value < actions[k - 2]))) {
        throw new RangeError(`run replay segments[${i}].actions[${k}] is out of order`);
      }
      actions[k] = value;
    }
    segments.push(
      Object.freeze({
        replay,
        start: start === null ? null : (start as Readonly<Record<string, unknown>>),
        actions,
      }),
    );
    ticks += replay.ticks;
  }
  return Object.freeze({
    formatVersion: RUN_REPLAY_FORMAT_VERSION,
    buildId: shortText(data.buildId, 'buildId'),
    mode: shortText(data.mode, 'mode'),
    label: shortText(data.label, 'label'),
    score,
    reached: shortText(data.reached, 'reached'),
    assists,
    ticks,
    segments: Object.freeze(segments),
  });
}

/**
 * The text of a run replay (what the library stores and sharing hands over): compact JSON.
 *
 * @param run - The run replay.
 * @returns The text.
 */
export function runReplayText(run: RunReplay): string {
  return JSON.stringify(encodeRunReplay(run));
}

/**
 * Parses a run replay's text. Never throws.
 *
 * @param text - The text (a stored or shared replay).
 * @returns The replay, or `null` when the text is not a valid run replay.
 */
export function parseRunReplayText(text: string): RunReplay | null {
  try {
    return decodeRunReplay(JSON.parse(text) as unknown);
  } catch (_error) {
    return null;
  }
}

/**
 * The `Platform.storage` key of a library slot (`replay.last`, `replay.1` …).
 *
 * @param slot - 0 (the last game) … {@link REPLAY_SLOTS} − 1.
 * @returns The key.
 */
export function replayStorageKey(slot: number): string {
  return slot === 0 ? 'replay.last' : 'replay.' + String(slot);
}

/** What the replay browser shows of a slot. */
export interface ReplaySummary {
  /** The slot. */
  readonly slot: number;
  /** See {@link RunReplay.mode}. */
  readonly mode: string;
  /** See {@link RunReplay.label}. */
  readonly label: string;
  /** See {@link RunReplay.score}. */
  readonly score: number;
  /** See {@link RunReplay.reached}. */
  readonly reached: string;
  /** Whether the run was assisted ({@link runAssisted}). */
  readonly assisted: boolean;
  /** See {@link RunReplay.ticks}. */
  readonly ticks: number;
}

/** Why {@link ReplayLibrary.store} or {@link ReplayLibrary.importText} refused a replay. */
export const ReplayStoreResult = {
  /** Stored. */
  Ok: 0,
  /** The text is longer than {@link MAX_REPLAY_TEXT}. */
  TooLong: 1,
  /** The text is not a valid run replay. */
  Invalid: 2,
  /**
   * No kept slot is free, or the kept replays would exceed {@link MAX_KEPT_REPLAY_TEXT} with it
   * (delete one first).
   */
  Full: 3,
} as const;

/** A {@link ReplayStoreResult} code. */
export type ReplayStoreResult = (typeof ReplayStoreResult)[keyof typeof ReplayStoreResult];

/** The saved replays (see the module docs; created by {@link createReplayLibrary}). */
export interface ReplayLibrary {
  /** The storage (`null`: memory only). */
  readonly storage: PlatformStorage | null;
  /** Per slot: its summary, or `null` for an empty slot (index = slot). */
  readonly summaries: readonly (ReplaySummary | null)[];
  /** Increases whenever a slot changes (the browser redraws). */
  readonly revision: number;
  /**
   * Reads every slot from the storage (the host awaits it before the title). Never rejects: an
   * unreadable or invalid slot is empty. A slot over the size caps ({@link MAX_REPLAY_TEXT}, or a
   * kept slot past {@link MAX_KEPT_REPLAY_TEXT} with the ones before it — an older build's) is
   * empty too, and its key is cleared so it no longer takes the save's room.
   *
   * @returns Resolves once read.
   */
  load(): Promise<void>;
  /**
   * A slot's replay (decoded from its text on every call — a menu action).
   *
   * @param slot - The slot.
   * @returns The replay, or `null` for an empty slot.
   */
  replay(slot: number): RunReplay | null;
  /**
   * A slot's text (for sharing).
   *
   * @param slot - The slot.
   * @returns The text, or `null` for an empty slot.
   */
  exportText(slot: number): string | null;
  /**
   * Stores a run as the last game (slot 0), replacing the one before, and writes it (best effort).
   *
   * @param run - The run.
   * @returns {@link ReplayStoreResult}.Ok, or TooLong.
   */
  storeLast(run: RunReplay): ReplayStoreResult;
  /**
   * Keeps a slot's replay in the first free kept slot (the browser's KEEP).
   *
   * @param slot - The slot to copy (normally 0).
   * @returns The kept slot, or -1 (an empty slot, no free kept slot, or no room left under
   *   {@link MAX_KEPT_REPLAY_TEXT}).
   */
  keep(slot: number): number;
  /**
   * Stores a shared replay's text in the first free kept slot (the web host's paste).
   *
   * @param text - The text.
   * @returns {@link ReplayStoreResult} (Full also when the kept replays have no room left for it
   *   under {@link MAX_KEPT_REPLAY_TEXT}).
   */
  importText(text: string): ReplayStoreResult;
  /**
   * Empties a slot (the browser's DELETE) and removes it from the storage (an empty text).
   *
   * @param slot - The slot.
   */
  remove(slot: number): void;
}

/**
 * Creates the replay library over a storage (see the module docs).
 *
 * @param storage - `Platform.storage`, or `null` for a memory-only library.
 * @returns The library (empty until {@link ReplayLibrary.load}).
 *
 * @example
 * ```ts
 * const replays = createReplayLibrary(platform.storage);
 * await replays.load();
 * replays.summaries[0]?.score; // the last game's score, when there is one
 * ```
 */
export function createReplayLibrary(storage: PlatformStorage | null): ReplayLibrary {
  const texts: (string | null)[] = [];
  const summaries: (ReplaySummary | null)[] = [];
  for (let i = 0; i < REPLAY_SLOTS; i++) {
    texts.push(null);
    summaries.push(null);
  }
  const state = { revision: 0 };
  /**
   * Puts a validated text into a slot and writes it (best effort).
   *
   * @param slot - The slot.
   * @param text - The text (`null` empties it).
   * @param run - Its decoded replay (with a text).
   * @param write - Whether to write it to the storage.
   */
  const put = (slot: number, text: string | null, run: RunReplay | null, write: boolean): void => {
    texts[slot] = text;
    summaries[slot] =
      text === null || run === null
        ? null
        : Object.freeze({
            slot,
            mode: run.mode,
            label: run.label,
            score: run.score,
            reached: run.reached,
            assisted: runAssisted(run.assists),
            ticks: run.ticks,
          });
    state.revision++;
    if (!write || storage === null) return;
    try {
      storage.set(replayStorageKey(slot), text ?? '').catch(() => {
        // Best effort: a failing write keeps the replay for the session.
      });
    } catch (_error) {
      // Same.
    }
  };
  /**
   * A slot's text.
   *
   * @param slot - The slot (anything but a whole number 0 … {@link REPLAY_SLOTS} − 1 is empty).
   * @returns The text, or `null` for an empty or unknown slot.
   */
  const slotText = (slot: number): string | null =>
    slot >= 0 && slot < REPLAY_SLOTS && slot % 1 === 0 ? texts[slot] : null;
  /**
   * Characters the kept slots hold together.
   *
   * @returns The total.
   */
  const keptLength = (): number => {
    let total = 0;
    for (let i = 1; i < REPLAY_SLOTS; i++) total += texts[i]?.length ?? 0;
    return total;
  };
  /**
   * The first empty kept slot, when a text of a length fits the kept replays' budget.
   *
   * @param length - The text's length.
   * @returns The slot, or -1 (no free slot, or no room).
   */
  const freeSlot = (length: number): number => {
    if (keptLength() + length > MAX_KEPT_REPLAY_TEXT) return -1;
    for (let i = 1; i < REPLAY_SLOTS; i++) if (texts[i] === null) return i;
    return -1;
  };
  return {
    storage,
    summaries,
    get revision(): number {
      return state.revision;
    },
    async load(): Promise<void> {
      if (storage === null) return;
      let kept = 0;
      for (let slot = 0; slot < REPLAY_SLOTS; slot++) {
        let text: string | null;
        try {
          const value = await storage.get(replayStorageKey(slot));
          text = typeof value === 'string' && value !== '' ? value : null;
        } catch (_error) {
          text = null;
        }
        // Over the caps (an older build's text): empty, and its key cleared (the save's room).
        const oversize =
          text !== null &&
          (text.length > MAX_REPLAY_TEXT ||
            (slot > 0 && kept + text.length > MAX_KEPT_REPLAY_TEXT));
        const run = text === null || oversize ? null : parseRunReplayText(text);
        if (run !== null && text !== null && slot > 0) kept += text.length;
        put(slot, run === null ? null : text, run, oversize);
      }
    },
    replay(slot: number): RunReplay | null {
      const text = slotText(slot);
      return text === null ? null : parseRunReplayText(text);
    },
    exportText(slot: number): string | null {
      return slotText(slot);
    },
    storeLast(run: RunReplay): ReplayStoreResult {
      const text = runReplayText(run);
      if (text.length > MAX_REPLAY_TEXT) return ReplayStoreResult.TooLong;
      put(0, text, run, true);
      return ReplayStoreResult.Ok;
    },
    keep(slot: number): number {
      const text = slotText(slot);
      if (text === null) return -1;
      const target = freeSlot(text.length);
      if (target < 0) return -1;
      put(target, text, parseRunReplayText(text), true);
      return target;
    },
    importText(text: string): ReplayStoreResult {
      const trimmed = text.trim();
      if (trimmed.length > MAX_REPLAY_TEXT) return ReplayStoreResult.TooLong;
      const run = parseRunReplayText(trimmed);
      if (run === null) return ReplayStoreResult.Invalid;
      const target = freeSlot(trimmed.length);
      if (target < 0) return ReplayStoreResult.Full;
      put(target, trimmed, run, true);
      return ReplayStoreResult.Ok;
    },
    remove(slot: number): void {
      if (slotText(slot) === null) return;
      put(slot, null, null, true);
    },
  };
}
