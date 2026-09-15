/**
 * # save — persistent saves (hi-scores, options, stats)
 *
 * **Responsibility.** Persistence through `Platform.storage` (decision D31): the player's
 * {@link UserOptions} (volumes, the controls — the input profile, autofire, SOCD, debounce and the
 * rebinding —, the display and the game options), the hi-score tables and a
 * few play statistics, stored as one **versioned JSON document** with forward migrations and
 * **defensive parsing** — a corrupt, foreign or partly broken document never crashes the boot; it
 * falls back to defaults
 * (whole or field by field) and a corrupt original is kept under {@link SAVE_CORRUPT_KEY} for
 * inspection. Storage is async so Electron can use files (M2-17) and the web / Tizen
 * `localStorage`; Tizen deletes it on uninstall.
 *
 * - **Format** ({@link SaveData}, version {@link SAVE_VERSION} = 2 since M2-16) under the storage
 *   key {@link SAVE_STORAGE_KEY} (`save.v1` — the format family's key; the document's `version`
 *   drives the migrations): `{ version, options: { audio: { master, music, sfx }, input: {
 *   profileId, autofire, autofireInterval, socd, releaseDebounce, bindings }, display: {
 *   bulletPalette, scaleMode, screenShake, reduceFlashing, showHitbox, bossHpBar }, game: {
 *   difficulty, lives, deathPenalty, autoPowerUp, pickupMagnet, oneButton } }, hiScores: {
 *   [modeKey]: HiScoreEntry[≤ 10] }, stats: { gamesStarted, gameOvers, stagesCleared } }`. The
 *   display fields needed no migration: a version-1 save written before `bulletPalette` (M2-02),
 *   the M2-08 fields or `bossHpBar` (M2-09) resolves the missing ones to their defaults
 *   (`standard`, `integer`, shake on, normal flashing, no hitbox marker, no boss HP bar —
 *   `core/config` `resolveUserOptions`). **Version 2** (M2-16) added the controls options (autofire
 *   mode and rate, SOCD, the release debounce, the rebinding — `input.*`) and the game options
 *   (`game.*`), and its migration moves the co-op and practice rows older builds kept in the
 *   one-player tables into their own tables (see {@link SAVE_MIGRATIONS}).
 *   A mode key ({@link hiScoreModeKey}) names the table a game's score belongs to
 *   (`meter-normal` in M1; one per difficulty preset since M2-01 — `meter-easy` … `meter-arcade`;
 *   the Direct-mode MANTA's games since M2-05 — `direct-easy` … `direct-arcade`; since M2-15 the
 *   co-op games' and practice runs' own tables — `meter-normal-2p`, `meter-normal-practice`: one
 *   table per difficulty × ship × {@link HI_SCORE_MODES | mode}).
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
 *   when it beats the 10th entry (ties go below the older entries); a row is recorded as
 *   {@link DEFAULT_HI_SCORE_NAME} (`---`) and named by the scene flow's name entry afterwards
 *   ({@link SaveStore.renameScore}, M2-15).
 *
 * Everything here is pure (no platform globals): the storage arrives as a `PlatformStorage`; the
 * shell loads the save before the title and hands a {@link SaveStore} to the game
 * (`createGame(…, { save })`). Nothing runs per tick.
 *
 * **Implements.**
 * - shmup_feat.md §21 Saves — hi-scores + options persisted, versioned JSON with migrations
 * - shmup_feat.md §23 — storage abstraction (`storage.get/set`), Tizen lifecycle (the save is
 *   written when a change happens, not on exit)
 * - shmup_feat.md §15 — the hi-score tables: top 10 (name, score, zone reached) per difficulty /
 *   mode; §16 — practice's separate score table (M2-15)
 *
 * **Public API.** {@link SaveData}, {@link HiScoreEntry}, {@link SaveStats}, {@link SaveMigration},
 * {@link SAVE_MIGRATIONS}, {@link SAVE_VERSION}, {@link SAVE_STORAGE_KEY}, {@link SAVE_CORRUPT_KEY},
 * {@link HI_SCORE_TABLE_SIZE}, {@link DEFAULT_HI_SCORE_NAME}, {@link HI_SCORE_NAME_MAX},
 * {@link MAX_HI_SCORE_TABLES}, {@link createDefaultSave}, {@link migrateSave},
 * {@link sanitizeSave}, {@link parseSave}, {@link ParsedSave}, {@link SaveStatus},
 * {@link serializeSave}, {@link loadSave}, {@link LoadedSave}, {@link writeSave},
 * {@link createHiScoreEntry}, {@link insertHiScore}, {@link HiScoreInsert}, {@link hiScoreModeKey},
 * {@link SaveStore},
 * {@link createSaveStore}; M2-15: {@link HI_SCORE_MODES}, {@link HiScoreMode},
 * {@link parseHiScoreModeKey}, {@link HiScoreKeyParts}, {@link SaveStore.renameScore}.
 *
 * **Planned.** Unlocks (Extra Edit, stages, ships — M2), the Electron file store (M2-17), more
 * stats as their screens arrive.
 *
 * @module
 */
import {
  DEFAULT_USER_OPTIONS,
  resolveUserOptions,
  type BindingOverrides,
  type GameConfig,
  type UserOptions,
} from '../config/index.js';
import { ACTION_NAMES, INPUT_CONTEXTS } from '../input/index.js';
import { defineModule } from '../module-info.js';
import type { PlatformStorage } from '../platform/index.js';
import { MAX_SCORE, type HiScoreEntry } from '../scoring/index.js';

export type { HiScoreEntry } from '../scoring/index.js';

/** Module descriptor (see {@link defineModule}). */
export const moduleInfo = defineModule({
  name: 'save',
  status: 'implemented',
  specRefs: ['shmup_feat.md §21', 'shmup_feat.md §23', 'shmup_feat.md §15', 'shmup_feat.md §16'],
});

/** The save format this build writes (2 since M2-16 — the controls and game options). */
export const SAVE_VERSION = 2;

/** `Platform.storage` key of the save document (the web adapter prefixes it: `shmup-cup:save.v1`). */
export const SAVE_STORAGE_KEY = 'save.v1';

/** Key a corrupt or unreadable save is copied to before the defaults replace it. */
export const SAVE_CORRUPT_KEY = 'save.corrupt';

/** Entries kept per hi-score table. */
export const HI_SCORE_TABLE_SIZE = 10;

/**
 * Name of a hi-score entry nobody named: the row a game records before its name entry (M2-15)
 * finishes, and a name entry left blank.
 */
export const DEFAULT_HI_SCORE_NAME = '---';

/**
 * The game modes that keep hi-score tables of their own (M2-15 — shmup_feat.md §15 "per
 * difficulty / mode", §16 "practice: separate score table"): one-player games, co-op games and
 * practice runs. The value is also the `mode` field of the rows recorded in them.
 */
export const HI_SCORE_MODES = Object.freeze(['1p', '2p', 'practice'] as const);

/** A {@link HI_SCORE_MODES} entry. */
export type HiScoreMode = (typeof HI_SCORE_MODES)[number];

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
 * Files version-1 hi-score rows under the tables of their own mode: rows of mode `2p` or `practice`
 * found in a one-player table (`<powerUpMode>-<difficulty>` — co-op games recorded there until
 * M2-15, whose build moved them when reading) go to that table's `-2p` / `-practice` table, ahead
 * of the rows it already has (older rows win a tie); every other row stays.
 *
 * @param tables - The version-1 `hiScores` (any shape; non-array tables are dropped).
 * @returns The tables with the rows moved (raw rows — sanitised afterwards).
 */
function moveModeRows(tables: Readonly<Record<string, unknown>>): Record<string, unknown[]> {
  const out = Object.create(null) as Record<string, unknown[]>;
  const moved = Object.create(null) as Record<string, unknown[]>;
  for (const key of Object.keys(tables).sort()) {
    const list = tables[key];
    if (!Array.isArray(list)) continue;
    const parts = parseHiScoreModeKey(key);
    const kept: unknown[] = [];
    for (const row of list as unknown[]) {
      const mode = asRecord(row)?.mode;
      if (
        parts !== null &&
        parts.mode === '1p' &&
        (mode === '2p' || mode === 'practice') &&
        key.length + mode.length < 32
      ) {
        const target = key + '-' + mode;
        (moved[target] ?? (moved[target] = [])).push(row);
      } else {
        kept.push(row);
      }
    }
    out[key] = kept;
  }
  // The moved rows are older than the table's own: on a tie they keep the higher place.
  for (const key of Object.keys(moved)) out[key] = moved[key].concat(out[key] ?? []);
  return out;
}

/**
 * Version 1 → 2 (M2-16). Version 2 adds the controls options (`options.input`: `autofire`,
 * `autofireInterval`, `socd`, `releaseDebounce`, `bindings`) and the game options
 * (`options.game`) — a version-1 document gets them unset (`null` / no rebinding / the one-button
 * preset off: the host config's and the profiles' own values, as before) — and moves the co-op and
 * practice rows of the one-player tables into their own tables ({@link hiScoreModeKey} with `2p` /
 * `practice` — the move M2-15 did whenever a save was read, now done once here). Everything else
 * (volumes, the input profile, the display options, the stats) carries over as is.
 *
 * @param data - A version-1 document.
 * @returns The same data in the version-2 layout (sanitised afterwards).
 */
function migrateV1(data: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const options = asRecord(data.options) ?? {};
  const input = asRecord(options.input) ?? {};
  const tables = asRecord(data.hiScores);
  return {
    ...data,
    version: 2,
    options: {
      ...options,
      input: {
        profileId: input.profileId,
        autofire: null,
        autofireInterval: null,
        socd: null,
        releaseDebounce: null,
        bindings: {},
      },
      game: {
        difficulty: null,
        lives: null,
        deathPenalty: null,
        autoPowerUp: null,
        pickupMagnet: null,
        oneButton: false,
      },
    },
    hiScores: tables === null ? {} : moveModeRows(tables),
  };
}

/**
 * The migration steps: `SAVE_MIGRATIONS[n]` turns version `n` into `n + 1`. Append one (and bump
 * {@link SAVE_VERSION}) whenever the format changes; never edit a shipped step. Version 0 → 1 is
 * the skeleton's pre-release layout (M1-17); 1 → 2 adds the controls and game options and moves
 * the older co-op / practice rows (M2-16).
 */
export const SAVE_MIGRATIONS: readonly SaveMigration[] = Object.freeze([
  Object.freeze({ from: 0, to: 1, migrate: migrateV0 }),
  Object.freeze({ from: 1, to: 2, migrate: migrateV1 }),
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
 * dropped (M2-16: the co-op / practice rows older builds kept in the one-player tables were moved
 * by the version-1 → 2 migration). Stats: whole numbers ≥ 0, else 0. Unknown fields are dropped.
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
  const display = data.options.display;
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
  const input = data.options.input;
  const game = data.options.game;
  return JSON.stringify({
    version: data.version,
    options: {
      audio: { master: a.master, music: a.music, sfx: a.sfx },
      input: {
        profileId: input.profileId,
        autofire: input.autofire,
        autofireInterval: input.autofireInterval,
        socd: input.socd,
        releaseDebounce: input.releaseDebounce,
        bindings: serializeBindings(input.bindings),
      },
      game: {
        difficulty: game.difficulty,
        lives: game.lives,
        deathPenalty: game.deathPenalty,
        autoPowerUp: game.autoPowerUp,
        pickupMagnet: game.pickupMagnet,
        oneButton: game.oneButton,
      },
      display: {
        bulletPalette: display.bulletPalette,
        scaleMode: display.scaleMode,
        screenShake: display.screenShake,
        reduceFlashing: display.reduceFlashing,
        showHitbox: display.showHitbox,
        bossHpBar: display.bossHpBar,
      },
    },
    hiScores,
    stats: {
      gamesStarted: data.stats.gamesStarted,
      gameOvers: data.stats.gameOvers,
      stagesCleared: data.stats.stagesCleared,
    },
  });
}

/**
 * The rebinding in a canonical order for {@link serializeSave}: profiles by id, `game` before
 * `menu`, actions in `core/input` `ACTION_NAMES` order.
 *
 * @param bindings - The overrides.
 * @returns A plain object to stringify (prototype-free records).
 */
function serializeBindings(bindings: BindingOverrides): Record<string, unknown> {
  const out = Object.create(null) as Record<string, unknown>;
  for (const id of Object.keys(bindings).sort()) {
    const profile = bindings[id];
    const entry = Object.create(null) as Record<string, unknown>;
    for (const context of INPUT_CONTEXTS) {
      const table = profile[context];
      if (table === undefined) continue;
      const actions = Object.create(null) as Record<string, readonly string[]>;
      for (const name of ACTION_NAMES) {
        const tokens = table[name];
        if (tokens !== undefined) actions[name] = tokens.slice();
      }
      entry[context] = actions;
    }
    out[id] = entry;
  }
  return out;
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
 * The hi-score table a game belongs to: `<powerUpMode>-<difficulty>` for one-player games
 * (`meter-normal` in M1), with `-2p` / `-practice` appended for co-op games and practice runs
 * (M2-15 — one table per difficulty × ship × mode, shmup_feat.md §15). Since M2-01 each difficulty
 * preset has its own table (`meter-easy` … `meter-arcade` — the scene flow passes the World's
 * config, whose preset was chosen under START); since M2-05 the Direct-mode MANTA's games play
 * into their own (`direct-easy` … `direct-arcade`): the power-up model names the ship (one ship
 * per model in the content). Co-op games (M2-06) shared the one-player tables until M2-15, each
 * row with the mode `2p` — the version-1 → 2 migration ({@link SAVE_MIGRATIONS}, M2-16) moves such
 * rows into their `-2p` table.
 *
 * @example
 * ```ts
 * hiScoreModeKey(resolveGameConfig({ difficulty: 'hard' })); // → 'meter-hard'
 * hiScoreModeKey({ powerUpMode: 'direct', difficulty: 'normal' }, '2p'); // → 'direct-normal-2p'
 * hiScoreModeKey({ powerUpMode: 'meter', difficulty: 'easy' }, 'practice');
 * // → 'meter-easy-practice'
 * ```
 *
 * @param config - The session config.
 * @param mode - The game mode (default `'1p'`).
 * @returns The mode key.
 */
export function hiScoreModeKey(
  config: Pick<GameConfig, 'powerUpMode' | 'difficulty'>,
  mode: HiScoreMode = '1p',
): string {
  const base = `${config.powerUpMode}-${config.difficulty}`;
  return mode === '1p' ? base : `${base}-${mode}`;
}

/** The parts of a mode key ({@link parseHiScoreModeKey}). */
export interface HiScoreKeyParts {
  /** The power-up model (the ship): `meter`, `direct`. */
  readonly powerUpMode: string;
  /** The difficulty preset. */
  readonly difficulty: string;
  /** The game mode. */
  readonly mode: HiScoreMode;
}

/**
 * Splits a mode key made by {@link hiScoreModeKey} into its parts (M2-15: the hi-score screen's
 * title).
 *
 * @param key - A mode key.
 * @returns The parts, or `null` for a key that does not have the `<mode>-<difficulty>[-<mode>]`
 *   shape.
 *
 * @example
 * ```ts
 * parseHiScoreModeKey('direct-hard-2p');
 * // → { powerUpMode: 'direct', difficulty: 'hard', mode: '2p' }
 * parseHiScoreModeKey('meter-normal'); // → { …, mode: '1p' }
 * parseHiScoreModeKey('meter-normal-1p'); // → null (a one-player key has no suffix)
 * ```
 */
export function parseHiScoreModeKey(key: string): HiScoreKeyParts | null {
  const parts = key.split('-');
  if (parts.length < 2 || parts.length > 3 || parts[0] === '' || parts[1] === '') return null;
  const mode = parts.length === 3 ? parts[2] : '1p';
  if (mode === '1p' && parts.length === 3) return null;
  if ((HI_SCORE_MODES as readonly string[]).indexOf(mode) < 0) return null;
  return { powerUpMode: parts[0], difficulty: parts[1], mode: mode as HiScoreMode };
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
   * Names a row already in a table (M2-15 — the name entry after a game that recorded it). The
   * row is found by identity (`hiScores(modeKey)[rank]` right after {@link SaveStore.recordScore}),
   * so rows recorded after it (player 2's) cannot misplace it; a row that has meanwhile left the
   * table is not found. Not written until {@link SaveStore.flush}.
   *
   * @param modeKey - The row's table.
   * @param entry - The row (the object the table holds).
   * @param name - The name (cut to {@link HI_SCORE_NAME_MAX}; empty →
   *   {@link DEFAULT_HI_SCORE_NAME}).
   *
   * @remarks
   * Builds a new row and a new frozen document (a cold path — once per finished name entry). The
   * row the table held is replaced by the renamed copy, so a caller that keeps the row to find it
   * again must take `hiScores(modeKey)[rank]` afterwards (the scene flow's name entry does).
   * @returns The row's rank (0 = best), or -1 when the table does not hold it.
   *
   * @example
   * ```ts
   * const rank = store.recordScore(key, createHiScoreEntry(12300));
   * const row = store.hiScores(key)[rank];
   * store.renameScore(key, row, 'ACE'); // → rank
   * ```
   */
  renameScore(modeKey: string, entry: HiScoreEntry, name: string): number {
    const table = this.hiScores(modeKey);
    const rank = table.indexOf(entry);
    if (rank < 0) return -1;
    const renamed = createHiScoreEntry(entry.score, { ...entry, name });
    const next = table.slice();
    next[rank] = renamed;
    const hiScores: Record<string, readonly HiScoreEntry[]> = {};
    for (const key of Object.keys(this.current.hiScores))
      hiScores[key] = this.current.hiScores[key];
    hiScores[modeKey] = Object.freeze(next);
    this.current = Object.freeze({ ...this.current, hiScores: Object.freeze(hiScores) });
    return rank;
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
