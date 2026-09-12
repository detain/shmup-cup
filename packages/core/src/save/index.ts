/**
 * # save — persistent saves (hi-scores, options, stats)
 *
 * **Responsibility.** Persistence through `Platform.storage` (decision D31): the player's
 * {@link UserOptions} (volumes, the input profile), the hi-score tables and a few play statistics,
 * stored as one **versioned JSON document** with forward migrations and **defensive parsing** — a
 * corrupt, foreign or partly broken document never crashes the boot; it falls back to defaults
 * (whole or field by field) and a corrupt original is kept under {@link SAVE_CORRUPT_KEY} for
 * inspection. Storage is async so Electron can use files (M2-17) and the web / Tizen
 * `localStorage`; Tizen deletes it on uninstall.
 *
 * - **Format** ({@link SaveData}, version {@link SAVE_VERSION} = 1) under the storage key
 *   {@link SAVE_STORAGE_KEY} (`save.v1`): `{ version, options: { audio: { master, music, sfx },
 *   input: { profileId }, display: {} }, hiScores: { [modeKey]: HiScoreEntry[≤ 10] }, stats: {
 *   gamesStarted, gameOvers, stagesCleared } }`.
 *   A mode key ({@link hiScoreModeKey}) names the table a game's score belongs to
 *   (`meter-normal` in M1).
 * - **Loading** ({@link loadSave}, {@link parseSave}): JSON → migrations ({@link SAVE_MIGRATIONS}:
 *   entry `n` turns version `n` into `n + 1`; a document without a version counts as version 0) →
 *   sanitising ({@link sanitizeSave}: every field checked, clamped or replaced by its default,
 *   tables sorted and cut to {@link HI_SCORE_TABLE_SIZE}). Unparsable JSON, a non-object document,
 *   or a version newer than this build → defaults, and the text is copied to `save.corrupt`.
 * - **Writing** ({@link writeSave}, {@link SaveStore}): the store keeps the document the game plays
 *   with and the text last written; {@link SaveStore.flush} writes **only when the document
 *   changed** — the scene flow flushes when the Options screen closes and when a game ends (game
 *   over, stage clear). Writes are best-effort: a failing storage never throws into the game.
 * - **Hi-scores** ({@link insertHiScore}, {@link SaveStore.recordScore}): rows are the `core/scoring`
 *   `HiScoreEntry` (name, score, stage reached, game mode, difficulty); a score enters its table
 *   when it beats the 10th entry (ties go below the older entries); names are
 *   {@link DEFAULT_HI_SCORE_NAME} (`---`) until the name entry of M2-15.
 *
 * Everything here is pure (no platform globals): the storage arrives as a `PlatformStorage`; the
 * shell loads the save before the title and hands a {@link SaveStore} to the game
 * (`createGame(…, { save })`). Nothing runs per tick.
 *
 * **Implements.**
 * - shmup_feat.md §21 Saves — hi-scores + options persisted, versioned JSON with migrations
 * - shmup_feat.md §23 — storage abstraction (`storage.get/set`), Tizen lifecycle (the save is
 *   written when a change happens, not on exit)
 *
 * **Public API.** {@link SaveData}, {@link HiScoreEntry}, {@link SaveStats}, {@link SaveMigration},
 * {@link SAVE_MIGRATIONS}, {@link SAVE_VERSION}, {@link SAVE_STORAGE_KEY}, {@link SAVE_CORRUPT_KEY},
 * {@link HI_SCORE_TABLE_SIZE}, {@link DEFAULT_HI_SCORE_NAME}, {@link HI_SCORE_NAME_MAX},
 * {@link MAX_HI_SCORE_TABLES}, {@link createDefaultSave}, {@link migrateSave},
 * {@link sanitizeSave}, {@link parseSave}, {@link ParsedSave}, {@link SaveStatus},
 * {@link serializeSave}, {@link loadSave}, {@link LoadedSave}, {@link writeSave},
 * {@link createHiScoreEntry}, {@link insertHiScore}, {@link HiScoreInsert}, {@link hiScoreModeKey},
 * {@link SaveStore},
 * {@link createSaveStore}.
 *
 * **Planned.** Unlocks (Extra Edit, stages, ships — M2), the Electron file store (M2-17), names
 * from the name entry (M2-15), more stats and option groups as their screens arrive.
 *
 * @module
 */
import {
  DEFAULT_USER_OPTIONS,
  resolveUserOptions,
  type GameConfig,
  type UserOptions,
} from '../config/index.js';
import { defineModule } from '../module-info.js';
import type { PlatformStorage } from '../platform/index.js';
import { MAX_SCORE, type HiScoreEntry } from '../scoring/index.js';

export type { HiScoreEntry } from '../scoring/index.js';

/** Module descriptor (see {@link defineModule}). */
export const moduleInfo = defineModule({
  name: 'save',
  status: 'implemented',
  specRefs: ['shmup_feat.md §21', 'shmup_feat.md §23'],
});

/** The save format this build writes. */
export const SAVE_VERSION = 1;

/** `Platform.storage` key of the save document (the web adapter prefixes it: `shmup-cup:save.v1`). */
export const SAVE_STORAGE_KEY = 'save.v1';

/** Key a corrupt or unreadable save is copied to before the defaults replace it. */
export const SAVE_CORRUPT_KEY = 'save.corrupt';

/** Entries kept per hi-score table. */
export const HI_SCORE_TABLE_SIZE = 10;

/** Name of a hi-score entry until the name entry exists (M2-15). */
export const DEFAULT_HI_SCORE_NAME = '---';

/** Longest name a hi-score entry keeps (longer names are cut). */
export const HI_SCORE_NAME_MAX = 8;

/** Most hi-score tables (mode keys) a save keeps; further ones are dropped when read. */
export const MAX_HI_SCORE_TABLES = 32;

/** Largest value a statistics counter keeps (it stops counting there). */
const MAX_COUNTER = 0x7fffffff;

/** Longest `reached` / `mode` / `difficulty` text a hi-score entry keeps. */
const ENTRY_TEXT_MAX = 32;

/** Shape of a mode key. */
const MODE_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Play statistics (counters, integers ≥ 0). */
export interface SaveStats {
  /** Games started (START from the title, RETRY STAGE). */
  readonly gamesStarted: number;
  /** Games that ended on the game-over screen. */
  readonly gameOvers: number;
  /** Stages cleared. */
  readonly stagesCleared: number;
}

/** The persisted save document (format {@link SAVE_VERSION}). */
export interface SaveData {
  /** Format version ({@link SAVE_VERSION}); older documents are migrated when read. */
  readonly version: number;
  /** The player's options (volumes, input profile, display). */
  readonly options: UserOptions;
  /**
   * Hi-score tables by mode key ({@link hiScoreModeKey}), each sorted best first and at most
   * {@link HI_SCORE_TABLE_SIZE} long. A mode nobody has scored in has no table.
   */
  readonly hiScores: Readonly<Record<string, readonly HiScoreEntry[]>>;
  /** Play statistics. */
  readonly stats: SaveStats;
}

/** One migration step between save versions. */
export interface SaveMigration {
  /** Version this step reads. */
  readonly from: number;
  /** Version this step produces (`from + 1`). */
  readonly to: number;
  /**
   * Converts a save document from version `from` to version `to`. Must not throw for any input
   * (read what is usable, drop the rest — the sanitiser fills the gaps).
   *
   * @param data - Parsed document at version `from` (any shape).
   * @returns The document at version `to` (not yet sanitised).
   */
  migrate(data: Readonly<Record<string, unknown>>): Record<string, unknown>;
}

/**
 * Reads a value as a record.
 *
 * @param value - Anything.
 * @returns The object, or `null` for a non-object, an array or `null`.
 */
function asRecord(value: unknown): Readonly<Record<string, unknown>> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : null;
}

/**
 * Reads a float volume `0…1` of the version-0 format as a level `0…10`.
 *
 * @param value - Anything.
 * @returns The level (rounded), or `undefined` when unusable (the default applies).
 */
function v0Volume(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value * 10) : undefined;
}

/**
 * Version 0 → 1. Version 0 is the pre-release layout of the skeleton's placeholder API: `{
 * version?: 0, hiScores: [{ name, score }], options: { masterVolume, musicVolume, sfxVolume }
 * (floats 0…1) plus `profile` (an input profile id), unlocks: [] }`. The flat hi-score list becomes
 * the `meter-normal` table (rows of mode `1p`, difficulty `normal`), the float volumes become
 * levels 0–10, the profile the input option;
 * unlocks are dropped (v1 has none yet).
 *
 * @param data - A version-0 document.
 * @returns The same data in the version-1 layout (sanitised afterwards).
 */
function migrateV0(data: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const options = asRecord(data.options) ?? {};
  const hiScores: Array<Record<string, unknown>> = [];
  if (Array.isArray(data.hiScores)) {
    for (const item of data.hiScores as unknown[]) {
      const row = asRecord(item);
      // Version 0 kept one list: the one-player Normal game of the meter ship.
      if (row !== null) hiScores.push({ ...row, mode: '1p', difficulty: 'normal' });
    }
  }
  return {
    version: 1,
    options: {
      audio: {
        master: v0Volume(options.masterVolume),
        music: v0Volume(options.musicVolume),
        sfx: v0Volume(options.sfxVolume),
      },
      input: { profileId: options.profile },
      display: {},
    },
    hiScores: hiScores.length > 0 ? { 'meter-normal': hiScores } : {},
    stats: {},
  };
}

/**
 * The migration steps: `SAVE_MIGRATIONS[n]` turns version `n` into `n + 1`. Append one (and bump
 * {@link SAVE_VERSION}) whenever the format changes; never edit a shipped step.
 */
export const SAVE_MIGRATIONS: readonly SaveMigration[] = Object.freeze([
  Object.freeze({ from: 0, to: 1, migrate: migrateV0 }),
]);

/**
 * A fresh save: default options, no hi-scores, zero stats.
 *
 * @returns A frozen document at {@link SAVE_VERSION}.
 */
export function createDefaultSave(): SaveData {
  return Object.freeze({
    version: SAVE_VERSION,
    options: DEFAULT_USER_OPTIONS,
    hiScores: Object.freeze({}),
    stats: Object.freeze({ gamesStarted: 0, gameOvers: 0, stagesCleared: 0 }),
  });
}

/**
 * Runs the migrations a document needs to reach {@link SAVE_VERSION}.
 *
 * @remarks
 * The version is the document's `version` field; a missing one means 0 (the pre-release layout).
 * A document already at {@link SAVE_VERSION} is returned as is.
 *
 * @param data - A parsed save document.
 * @param migrations - The steps (default {@link SAVE_MIGRATIONS}; tests pass their own).
 * @returns The migrated (not yet sanitised) document and the version it was read at.
 * @throws {RangeError} When the version is not a non-negative integer, is newer than
 *   {@link SAVE_VERSION}, or a step is missing — {@link parseSave} treats that as unreadable.
 */
export function migrateSave(
  data: Readonly<Record<string, unknown>>,
  migrations: readonly SaveMigration[] = SAVE_MIGRATIONS,
): { readonly data: Readonly<Record<string, unknown>>; readonly fromVersion: number } {
  const raw = data.version;
  const fromVersion = raw === undefined ? 0 : raw;
  if (typeof fromVersion !== 'number' || !Number.isInteger(fromVersion) || fromVersion < 0) {
    throw new RangeError(`save version must be a non-negative integer, got ${String(raw)}`);
  }
  if (fromVersion > SAVE_VERSION) {
    throw new RangeError(`save version ${fromVersion} is newer than this build (${SAVE_VERSION})`);
  }
  let doc = data;
  for (let version = fromVersion; version < SAVE_VERSION; version++) {
    const step = migrations[version];
    if (step === undefined || step.from !== version || step.to !== version + 1) {
      throw new RangeError(`no save migration from version ${version}`);
    }
    doc = step.migrate(doc);
  }
  return { data: doc, fromVersion };
}

/**
 * Reads a hi-score table defensively.
 *
 * @param value - Anything (an array of entries).
 * @returns The valid entries, best first (stable: equal scores keep their order), at most
 *   {@link HI_SCORE_TABLE_SIZE}; `null` when nothing usable is left.
 */
function sanitizeTable(value: unknown): readonly HiScoreEntry[] | null {
  if (!Array.isArray(value)) return null;
  const entries: HiScoreEntry[] = [];
  for (const item of value as unknown[]) {
    const row = asRecord(item);
    if (row === null) continue;
    const score = row.score;
    if (typeof score !== 'number' || !Number.isFinite(score) || score < 0) continue;
    entries.push(
      createHiScoreEntry(score, {
        name: typeof row.name === 'string' ? row.name : '',
        reached: typeof row.reached === 'string' ? row.reached : '',
        mode: typeof row.mode === 'string' ? row.mode : '',
        difficulty: typeof row.difficulty === 'string' ? row.difficulty : '',
      }),
    );
  }
  if (entries.length === 0) return null;
  // Stable sort, best first (Array.prototype.sort is stable from Chrome 70; do it by hand for 69).
  const sorted: HiScoreEntry[] = [];
  for (const entry of entries) {
    let i = sorted.length;
    while (i > 0 && sorted[i - 1].score < entry.score) i--;
    sorted.splice(i, 0, entry);
  }
  return Object.freeze(sorted.slice(0, HI_SCORE_TABLE_SIZE));
}

/**
 * Reads a statistics counter defensively.
 *
 * @param value - Anything.
 * @returns A whole number `0…2³¹−1` (0 when unusable).
 */
function counter(value: unknown): number {
  // `<= 0` also turns a stored `-0` into 0 (V8 boxes -0 like a fraction).
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0;
  return value > MAX_COUNTER ? MAX_COUNTER : Math.floor(value);
}

/**
 * Builds a valid {@link SaveData} from a document in the current layout, replacing every unusable
 * field with its default — never throws.
 *
 * @remarks
 * Options go through `core/config` `resolveUserOptions`. Hi-score tables: only keys shaped like a
 * mode key (lower-case kebab, ≤ 32 characters), at most {@link MAX_HI_SCORE_TABLES} of them (in
 * key order); entries need a finite score ≥ 0 (floored, capped at `MAX_SCORE`), the text fields
 * are read like {@link createHiScoreEntry} does (a missing or empty name becomes
 * {@link DEFAULT_HI_SCORE_NAME}, a long one is cut to {@link HI_SCORE_NAME_MAX});
 * each table is sorted best first and cut to {@link HI_SCORE_TABLE_SIZE}; empty tables are
 * dropped. Stats: whole numbers ≥ 0, else 0. Unknown fields are dropped.
 *
 * @param data - A migrated document.
 * @returns A frozen, valid document at {@link SAVE_VERSION}.
 */
export function sanitizeSave(data: Readonly<Record<string, unknown>>): SaveData {
  const hiScores: Record<string, readonly HiScoreEntry[]> = {};
  const tables = asRecord(data.hiScores);
  if (tables !== null) {
    let count = 0;
    for (const key of Object.keys(tables).sort()) {
      if (count >= MAX_HI_SCORE_TABLES) break;
      if (key.length > 32 || !MODE_KEY_PATTERN.test(key)) continue;
      const table = sanitizeTable(tables[key]);
      if (table === null) continue;
      hiScores[key] = table;
      count++;
    }
  }
  const stats = asRecord(data.stats) ?? {};
  return Object.freeze({
    version: SAVE_VERSION,
    options: resolveUserOptions(data.options),
    hiScores: Object.freeze(hiScores),
    stats: Object.freeze({
      gamesStarted: counter(stats.gamesStarted),
      gameOvers: counter(stats.gameOvers),
      stagesCleared: counter(stats.stagesCleared),
    }),
  });
}

/**
 * How a save was read: `'empty'` — nothing stored (a first launch); `'ok'` — a current document;
 * `'migrated'` — an older document brought up to date; `'corrupt'` — not JSON, or not an object;
 * `'unreadable'` — a version this build cannot read (newer, or malformed). The last two fall back to
 * the defaults.
 */
export type SaveStatus = 'empty' | 'ok' | 'migrated' | 'corrupt' | 'unreadable';

/** What {@link parseSave} returns. */
export interface ParsedSave {
  /** The document to play with (defaults when the text was unusable). */
  readonly data: SaveData;
  /** How the text was read. */
  readonly status: SaveStatus;
  /** The version the text was stored at (`null` when empty, corrupt or unreadable). */
  readonly fromVersion: number | null;
  /** Why the text could not be used (`''` otherwise). */
  readonly reason: string;
}

/**
 * Parses stored save text: JSON → migrations → sanitising. Never throws.
 *
 * @param text - The stored text, or `null` when nothing is stored.
 * @param migrations - The migration steps (default {@link SAVE_MIGRATIONS}).
 * @returns The document and how it was read (see {@link SaveStatus}).
 *
 * @example
 * ```ts
 * parseSave(null).status;                        // → 'empty'
 * parseSave('{"version":1,"options":{}}').status; // → 'ok' (missing fields take defaults)
 * parseSave('{oops').status;                     // → 'corrupt' (defaults)
 * ```
 */
export function parseSave(
  text: string | null,
  migrations: readonly SaveMigration[] = SAVE_MIGRATIONS,
): ParsedSave {
  if (text === null) {
    return { data: createDefaultSave(), status: 'empty', fromVersion: null, reason: '' };
  }
  let json: unknown;
  try {
    json = JSON.parse(text) as unknown;
  } catch (error) {
    return {
      data: createDefaultSave(),
      status: 'corrupt',
      fromVersion: null,
      reason: error instanceof Error ? error.message : 'invalid JSON',
    };
  }
  const doc = asRecord(json);
  if (doc === null) {
    return {
      data: createDefaultSave(),
      status: 'corrupt',
      fromVersion: null,
      reason: 'the save is not a JSON object',
    };
  }
  try {
    const migrated = migrateSave(doc, migrations);
    return {
      data: sanitizeSave(migrated.data),
      status: migrated.fromVersion === SAVE_VERSION ? 'ok' : 'migrated',
      fromVersion: migrated.fromVersion,
      reason: '',
    };
  } catch (error) {
    return {
      data: createDefaultSave(),
      status: 'unreadable',
      fromVersion: null,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * The stored text of a save document (compact JSON, fields in a fixed order).
 *
 * @remarks
 * Canonical: the hi-score tables are written in key order and their rows field by field, so the
 * same document always gives the same text — however its tables were built (a store appends a new
 * mode's table, the sanitiser sorts them when the save is read) — and a reloaded save that did not
 * change is not rewritten ({@link SaveStore.flush} compares texts).
 *
 * @param data - The document.
 * @returns JSON text.
 */
export function serializeSave(data: SaveData): string {
  const a = data.options.audio;
  // No prototype: a key can never reach Object.prototype, whatever the document holds.
  const hiScores = Object.create(null) as Record<string, HiScoreEntry[]>;
  for (const key of Object.keys(data.hiScores).sort()) {
    const rows: HiScoreEntry[] = [];
    for (const row of data.hiScores[key]) {
      rows.push({
        name: row.name,
        score: row.score,
        reached: row.reached,
        mode: row.mode,
        difficulty: row.difficulty,
      });
    }
    hiScores[key] = rows;
  }
  return JSON.stringify({
    version: data.version,
    options: {
      audio: { master: a.master, music: a.music, sfx: a.sfx },
      input: { profileId: data.options.input.profileId },
      display: {},
    },
    hiScores,
    stats: {
      gamesStarted: data.stats.gamesStarted,
      gameOvers: data.stats.gameOvers,
      stagesCleared: data.stats.stagesCleared,
    },
  });
}

/** What {@link loadSave} returns. */
export interface LoadedSave extends ParsedSave {
  /** The text read from storage (`null` when nothing was stored or storage failed). */
  readonly text: string | null;
}

/**
 * Reads the save from storage (key {@link SAVE_STORAGE_KEY}) — the shell calls it before the title.
 *
 * @remarks
 * Never rejects: a failing `storage.get` counts as an empty save. A corrupt or unreadable document
 * is copied to {@link SAVE_CORRUPT_KEY} (awaited; a failing copy is ignored) and the defaults are
 * returned — the main key is left alone until the next {@link SaveStore.flush} replaces it. A
 * migrated document is not written back here either (the next flush writes it in the new layout).
 *
 * @param storage - `Platform.storage`.
 * @returns Resolves with the document, its status and the stored text.
 *
 * @example
 * ```ts
 * const loaded = await loadSave(platform.storage);
 * const store = createSaveStore(platform.storage, loaded);
 * store.options.audio.music; // → 0…10
 * ```
 */
export async function loadSave(storage: PlatformStorage): Promise<LoadedSave> {
  let text: string | null;
  try {
    const value = await storage.get(SAVE_STORAGE_KEY);
    text = typeof value === 'string' ? value : null;
  } catch (_error) {
    text = null;
  }
  const parsed = parseSave(text);
  if (text !== null && (parsed.status === 'corrupt' || parsed.status === 'unreadable')) {
    try {
      await storage.set(SAVE_CORRUPT_KEY, text);
    } catch (_error) {
      // Best effort: the defaults are used either way.
    }
  }
  return { ...parsed, text };
}

/**
 * Writes a save document to storage (key {@link SAVE_STORAGE_KEY}), unconditionally. Hosts
 * normally go through {@link SaveStore.flush}, which writes only on a change.
 *
 * @param storage - `Platform.storage`.
 * @param data - The document.
 * @returns Resolves once stored.
 * @throws Rejects when the storage adapter rejects (the adapters of the apps swallow quota errors
 *   and resolve).
 */
export function writeSave(storage: PlatformStorage, data: SaveData): Promise<void> {
  return storage.set(SAVE_STORAGE_KEY, serializeSave(data));
}

/** What {@link insertHiScore} returns. */
export interface HiScoreInsert {
  /** The table afterwards (the same array when the score did not enter). */
  readonly table: readonly HiScoreEntry[];
  /** The entry's place, 0 = best, or -1 when the score did not enter the table. */
  readonly rank: number;
}

/**
 * Builds a hi-score row: the score floored and capped at `MAX_SCORE` (a negative or non-finite one
 * becomes 0), the name cut to {@link HI_SCORE_NAME_MAX} characters (missing or empty →
 * {@link DEFAULT_HI_SCORE_NAME}), `reached` / `mode` / `difficulty` cut to 32 characters (missing →
 * `''`).
 *
 * @param score - The score.
 * @param fields - The other fields (any may be omitted).
 * @returns A frozen entry.
 *
 * @example
 * ```ts
 * createHiScoreEntry(12300, { reached: 'zone-a', mode: '1p', difficulty: 'normal' });
 * // → { name: '---', score: 12300, reached: 'zone-a', mode: '1p', difficulty: 'normal' }
 * ```
 */
export function createHiScoreEntry(
  score: number,
  fields: Partial<Omit<HiScoreEntry, 'score'>> = {},
): HiScoreEntry {
  const name = fields.name ?? '';
  return Object.freeze({
    name: name === '' ? DEFAULT_HI_SCORE_NAME : name.slice(0, HI_SCORE_NAME_MAX),
    score: score > 0 && Number.isFinite(score) ? Math.min(MAX_SCORE, Math.floor(score)) : 0,
    reached: (fields.reached ?? '').slice(0, ENTRY_TEXT_MAX),
    mode: (fields.mode ?? '').slice(0, ENTRY_TEXT_MAX),
    difficulty: (fields.difficulty ?? '').slice(0, ENTRY_TEXT_MAX),
  });
}

/**
 * Inserts a row into a hi-score table (a new array; the input is not changed).
 *
 * @remarks
 * A row enters when the table has fewer than {@link HI_SCORE_TABLE_SIZE} entries or its score
 * beats the last one; it goes **below** rows with the same score (the older record keeps its
 * place). A score that is not positive never enters (a game that scored nothing leaves no row).
 * The row is normalised through {@link createHiScoreEntry}.
 *
 * @param table - A sorted table (best first).
 * @param entry - The row to insert.
 * @returns The table afterwards and the rank.
 *
 * @example
 * ```ts
 * insertHiScore(table, createHiScoreEntry(12300)).rank; // → 0 when 12,300 is the new best
 * ```
 */
export function insertHiScore(table: readonly HiScoreEntry[], entry: HiScoreEntry): HiScoreInsert {
  const row = createHiScoreEntry(entry.score, entry);
  const value = row.score;
  if (value <= 0) return { table, rank: -1 };
  let rank = table.length;
  while (rank > 0 && table[rank - 1].score < value) rank--;
  if (rank >= HI_SCORE_TABLE_SIZE) return { table, rank: -1 };
  const next = table.slice(0, rank);
  next.push(row);
  for (let i = rank; i < table.length && next.length < HI_SCORE_TABLE_SIZE; i++) {
    next.push(table[i]);
  }
  return { table: Object.freeze(next), rank };
}

/**
 * The hi-score table a game belongs to: `<powerUpMode>-<difficulty>` (`meter-normal` in M1). Co-op
 * and the other modes of M2 add their own keys.
 *
 * @param config - The session config.
 * @returns The mode key.
 */
export function hiScoreModeKey(config: Pick<GameConfig, 'powerUpMode' | 'difficulty'>): string {
  return `${config.powerUpMode}-${config.difficulty}`;
}

/**
 * The save the game plays with, and its persistence (created by {@link createSaveStore}).
 *
 * @remarks
 * Holds a frozen {@link SaveData}; every change replaces it with a new frozen document (changes
 * happen on menu actions and at the end of a game — never per tick). {@link SaveStore.flush}
 * writes the document when its text differs from the text last written or loaded, so calling it
 * after every menu close costs nothing when nothing changed. Without a storage (`null`) the store
 * keeps everything in memory and `flush` never writes.
 */
export class SaveStore {
  /** Where the save is written (`null` = memory only). */
  readonly storage: PlatformStorage | null;
  /** Successful writes so far (tests, debug). */
  writes = 0;
  /** The document the game plays with (frozen; replaced on every change). */
  private current: SaveData;
  /**
   * The text the storage is believed to hold: the loaded text (status `'ok'` only) or the last text
   * a flush started writing; `null` = unknown, so the next flush writes whatever the document is.
   */
  private written: string | null;

  /**
   * Creates the store (use {@link createSaveStore}).
   *
   * @param storage - `Platform.storage`, or `null`.
   * @param data - The starting document.
   * @param written - The text the storage holds now (`null` = nothing usable stored).
   */
  constructor(storage: PlatformStorage | null, data: SaveData, written: string | null) {
    this.storage = storage;
    this.current = data;
    this.written = written;
  }

  /** The current document (frozen; replaced on every change). */
  get data(): SaveData {
    return this.current;
  }

  /** The player's options. */
  get options(): UserOptions {
    return this.current.options;
  }

  /** Whether the document differs from what the storage holds (serialises — not for hot paths). */
  get dirty(): boolean {
    return serializeSave(this.current) !== this.written;
  }

  /**
   * Replaces the options (sanitised through `resolveUserOptions`). Not written until
   * {@link SaveStore.flush}.
   *
   * @param options - The new options.
   */
  setOptions(options: UserOptions): void {
    this.current = Object.freeze({ ...this.current, options: resolveUserOptions(options) });
  }

  /**
   * A mode's hi-score table.
   *
   * @param modeKey - The mode ({@link hiScoreModeKey}).
   * @returns The table, best first (empty when nobody scored in that mode).
   */
  hiScores(modeKey: string): readonly HiScoreEntry[] {
    const table = Object.prototype.hasOwnProperty.call(this.current.hiScores, modeKey)
      ? this.current.hiScores[modeKey]
      : undefined;
    return table === undefined ? EMPTY_TABLE : table;
  }

  /**
   * The best score of a mode.
   *
   * @param modeKey - The mode.
   * @returns The top entry's score, or 0.
   */
  bestScore(modeKey: string): number {
    const table = this.hiScores(modeKey);
    return table.length > 0 ? table[0].score : 0;
  }

  /**
   * Records a finished game's row in its mode's table ({@link insertHiScore}). Not written until
   * {@link SaveStore.flush}.
   *
   * @param modeKey - The mode (must look like a mode key — lower-case kebab, ≤ 32 characters —
   *   else nothing is recorded; a new mode beyond {@link MAX_HI_SCORE_TABLES} tables neither).
   * @param entry - The row ({@link createHiScoreEntry}).
   * @returns The rank reached (0 = best), or -1 when the score did not enter.
   */
  recordScore(modeKey: string, entry: HiScoreEntry): number {
    if (modeKey.length > 32 || !MODE_KEY_PATTERN.test(modeKey)) return -1;
    const result = insertHiScore(this.hiScores(modeKey), entry);
    if (result.rank < 0) return -1;
    const hiScores: Record<string, readonly HiScoreEntry[]> = {};
    const keys = Object.keys(this.current.hiScores);
    if (keys.indexOf(modeKey) < 0 && keys.length >= MAX_HI_SCORE_TABLES) return -1;
    for (const key of keys) hiScores[key] = this.current.hiScores[key];
    hiScores[modeKey] = result.table;
    this.current = Object.freeze({ ...this.current, hiScores: Object.freeze(hiScores) });
    return result.rank;
  }

  /**
   * Adds one to a statistics counter (it stops at 2³¹−1). Not written until
   * {@link SaveStore.flush}.
   *
   * @param stat - The counter.
   */
  count(stat: keyof SaveStats): void {
    const stats = this.current.stats;
    if (stats[stat] >= MAX_COUNTER) return;
    const next: { -readonly [K in keyof SaveStats]: number } = { ...stats };
    next[stat] = stats[stat] + 1;
    this.current = Object.freeze({ ...this.current, stats: Object.freeze(next) });
  }

  /**
   * Writes the document when it changed since the last write (or since it was loaded).
   *
   * @remarks
   * The text is remembered as written before the storage answers, so a second flush right after
   * does not write again; when the write fails — and no later flush has started meanwhile — the
   * store forgets what the storage holds, so the next flush writes whatever the document is then
   * (even when it equals an earlier text: overlapping writes that all failed must not leave one of
   * them counted as stored). Never rejects.
   *
   * @returns Resolves with `true` when a write happened and succeeded, `false` when nothing had
   *   changed, there is no storage, or the storage failed.
   */
  flush(): Promise<boolean> {
    const storage = this.storage;
    if (storage === null) return Promise.resolve(false);
    const text = serializeSave(this.current);
    if (text === this.written) return Promise.resolve(false);
    const previous = this.written;
    this.written = text;
    let pending: Promise<void>;
    try {
      pending = storage.set(SAVE_STORAGE_KEY, text);
    } catch (_error) {
      this.written = previous;
      return Promise.resolve(false);
    }
    return pending.then(
      () => {
        this.writes++;
        return true;
      },
      () => {
        // Not `previous`: that text may itself have been an optimistic write that failed too.
        if (this.written === text) this.written = null;
        return false;
      },
    );
  }
}

/** The table of a mode nobody has scored in. */
const EMPTY_TABLE: readonly HiScoreEntry[] = Object.freeze([]);

/**
 * Creates a save store.
 *
 * @param storage - `Platform.storage` (writes go there), or `null` for a memory-only store.
 * @param loaded - What {@link loadSave} read (default: a fresh save, nothing stored). The stored
 *   text counts as written only when it was read as-is (`'ok'`), so a migrated, corrupt or
 *   partly invalid save is replaced at the next flush.
 * @returns The store.
 *
 * @example
 * ```ts
 * const store = createSaveStore(platform.storage, await loadSave(platform.storage));
 * store.recordScore(hiScoreModeKey(game.config), createHiScoreEntry(12300)); // → 0 (a new best)
 * await store.flush(); // → true (written); a second flush → false
 * ```
 */
export function createSaveStore(
  storage: PlatformStorage | null,
  loaded?: Pick<LoadedSave, 'data' | 'status' | 'text'>,
): SaveStore {
  if (loaded === undefined) return new SaveStore(storage, createDefaultSave(), null);
  return new SaveStore(storage, loaded.data, loaded.status === 'ok' ? loaded.text : null);
}
