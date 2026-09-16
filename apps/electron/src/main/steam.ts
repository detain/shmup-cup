/**
 * # main/steam — optional Steamworks integration (plan M3-03)
 *
 * **Responsibility.** [P2] Achievements and Steam Cloud saves when the desktop build was launched
 * through Steam, via **steamworks-ffi-node** (no native compile; `shmup_tech.md` §4.8). Outside
 * Steam — which is every build this project has ever produced — {@link initSteam} returns a
 * service whose `available` is `false` and whose every method is a no-op, so nothing else in the
 * app has to know whether Steam is there.
 *
 * > ## Never run against Steam
 * >
 * > The project has **no Steam partner account and no app id**, so nothing here has been executed
 * > against a real Steam client: `steamworks-ffi-node` is deliberately **not a dependency** (see
 * > {@link SteamworksLoader}), `STEAM_APP_ID` is the placeholder `480` (Valve's public Spacewar
 * > test id) unless the environment overrides it, and every test drives a fake. What remains for
 * > the owner is in plan §8.8: a partner account, a real app id, the achievements created in the
 * > Steamworks partner site with exactly the {@link STEAM_ACHIEVEMENTS} API names, a Steam Cloud
 * > quota, and the Steam Deck verification run.
 *
 * **How achievements are awarded without touching the game.** The main process already owns the
 * save file (`main/saves.ts`), so the achievements are **derived from the saved document** after
 * every write ({@link achievementsFor}) rather than from new events the renderer would have to
 * send. That keeps `@shmup/core`, the scene flow and the IPC surface unchanged, and it makes the
 * whole rule set a pure function of a `SaveData` — which is what the tests check.
 *
 * **Cloud saves.** {@link createCloudStore} wraps the `FileStore` the IPC handlers already use: a
 * write goes to disk first and is then mirrored to Steam Cloud; a read that finds nothing on disk
 * falls back to the cloud copy and writes it back locally. Local disk stays the source of truth,
 * so a Steam outage can never lose a save.
 *
 * **Implements.**
 * - shmup_feat.md §23 Electron-specific — [P2] Steamworks (achievements, cloud saves), Steam Deck
 * - shmup_tech.md §4.8 — steamworks-ffi-node recommendation
 *
 * **Public API.** {@link SteamService}, {@link initSteam}, {@link SteamOptions},
 * {@link STEAM_ACHIEVEMENTS}, {@link SteamAchievement}, {@link achievementsFor},
 * {@link createCloudStore}, {@link createAchievementStore}, {@link SteamCloud},
 * {@link SteamworksApi}, {@link SteamworksLoader},
 * {@link STEAM_APP_ID_ENV}, {@link PLACEHOLDER_STEAM_APP_ID}, {@link steamAppId}.
 *
 * @module
 */
import {
  SAVE_STORAGE_KEY,
  parseHiScoreModeKey,
  parseSave,
  type HiScoreKeyParts,
  type SaveData,
} from '@shmup/core';
import type { FileStore } from './saves.js';

/**
 * Environment variable holding the real Steam app id. Steam itself also sets `SteamAppId` /
 * `SteamGameId` in a launched process, so a build started from a Steam library needs no
 * configuration; a developer running the app by hand can export this one.
 */
export const STEAM_APP_ID_ENV = 'SHMUP_STEAM_APP_ID';

/**
 * The app id used when nothing names a real one: **480**, Valve's public *Spacewar* test id.
 *
 * @remarks
 * This is a placeholder, not an allocation. Shipping with it would publish the game under Valve's
 * test app; the owner replaces it once the partner account exists (plan §8.8).
 */
export const PLACEHOLDER_STEAM_APP_ID = 480;

/** One Steam achievement and the rule that awards it. */
export interface SteamAchievement {
  /**
   * The achievement's **API name** — the string the Steamworks partner site calls "API Name".
   * Upper snake case, stable forever: renaming one orphans everybody's unlock.
   */
  readonly id: string;
  /** What the player did, in the words the store page would use. */
  readonly description: string;
  /**
   * Whether a saved document has earned it.
   *
   * @param save - The save as written.
   * @returns `true` when the achievement is earned.
   */
  readonly earned: (save: SaveData) => boolean;
}

/**
 * The best unassisted score in the save's hi-score tables a predicate accepts.
 *
 * @param save - The save.
 * @param match - Tests a table's parts (`core/save` `parseHiScoreModeKey` — the ship, the
 *   difficulty preset and the game mode; a key that does not parse is skipped, so a hand-edited
 *   save cannot invent an achievement).
 * @returns The highest score found, or 0.
 */
function bestScore(save: SaveData, match: (parts: HiScoreKeyParts) => boolean): number {
  let best = 0;
  for (const key of Object.keys(save.hiScores)) {
    const parts = parseHiScoreModeKey(key);
    if (parts === null || !match(parts)) continue;
    for (const entry of save.hiScores[key]) {
      // An assisted run (god mode, the speed or invincibility assist) never earns an achievement.
      if (entry.assisted !== true && entry.score > best) best = entry.score;
    }
  }
  return best;
}

/**
 * Whether a save holds any unassisted row in a table the predicate accepts.
 *
 * @param save - The save.
 * @param match - Tests a table's parts.
 * @returns `true` when at least one unassisted row exists.
 */
function playedIn(save: SaveData, match: (parts: HiScoreKeyParts) => boolean): boolean {
  return bestScore(save, match) > 0;
}

/**
 * The achievements the game offers, in the order the store page lists them (plan M3-03).
 *
 * @remarks
 * Every rule reads the **save document** only, so the set is a pure function of what the player
 * has done — no new events, no renderer changes. Assisted runs (`HiScoreEntry.assisted`: the
 * game-speed or invincibility assist, a secret code, god mode) never count, which is the same rule
 * the hi-score tables use for their asterisk. The API names must exist, spelled exactly like this,
 * in the Steamworks partner site before a build is uploaded — that is the owner's step.
 */
export const STEAM_ACHIEVEMENTS: readonly SteamAchievement[] = Object.freeze([
  Object.freeze({
    id: 'FIRST_LAUNCH',
    description: 'Start your first game.',
    earned: (save: SaveData) => save.stats.gamesStarted >= 1,
  }),
  Object.freeze({
    id: 'FIRST_ZONE',
    description: 'Clear a zone.',
    earned: (save: SaveData) => save.stats.stagesCleared >= 1,
  }),
  Object.freeze({
    id: 'FIVE_ZONES',
    description: 'Clear five zones — a whole route.',
    earned: (save: SaveData) => save.stats.stagesCleared >= 5,
  }),
  Object.freeze({
    id: 'EXTRA_EDIT',
    description: 'Unlock EXTRA EDIT.',
    earned: (save: SaveData) => save.unlocks?.extraEdit === true,
  }),
  Object.freeze({
    id: 'SECOND_LOOP',
    description: 'Unlock the second loop.',
    earned: (save: SaveData) => save.unlocks?.loop2 === true,
  }),
  Object.freeze({
    id: 'MANTA_PILOT',
    description: 'Post a score with the MANTA.',
    earned: (save: SaveData) => playedIn(save, (parts) => parts.powerUpMode === 'direct'),
  }),
  Object.freeze({
    id: 'BOSS_RUSH',
    description: 'Post a score in BOSS RUSH.',
    earned: (save: SaveData) => playedIn(save, (parts) => parts.mode === 'bossrush'),
  }),
  Object.freeze({
    id: 'CARAVAN',
    description: 'Post a score in CARAVAN.',
    earned: (save: SaveData) => playedIn(save, (parts) => parts.mode === 'caravan'),
  }),
  Object.freeze({
    id: 'ARCADE',
    description: 'Post a score in ARCADE mode.',
    earned: (save: SaveData) => playedIn(save, (parts) => parts.mode === 'arcade'),
  }),
  Object.freeze({
    id: 'MILLION',
    description: 'Score 1,000,000 points without an assist.',
    earned: (save: SaveData) => bestScore(save, () => true) >= 1_000_000,
  }),
  Object.freeze({
    id: 'ARCADE_DIFFICULTY',
    description: 'Post a score on the ARCADE difficulty without an assist.',
    // The ARCADE *difficulty*, not the ARCADE *mode* — `meter-arcade` vs `meter-normal-arcade`.
    earned: (save: SaveData) => playedIn(save, (parts) => parts.difficulty === 'arcade'),
  }),
]);

/**
 * The achievements a saved document has earned (plan M3-03).
 *
 * @param save - The save as written.
 * @returns The API names, in {@link STEAM_ACHIEVEMENTS} order. A new array each call; this runs
 *   once per save write, never per frame.
 *
 * @example
 * ```ts
 * for (const id of achievementsFor(save)) steam.unlockAchievement(id);
 * ```
 */
export function achievementsFor(save: SaveData): string[] {
  const out: string[] = [];
  for (const achievement of STEAM_ACHIEVEMENTS) {
    if (achievement.earned(save)) out.push(achievement.id);
  }
  return out;
}

/** Steam Cloud (Steam Remote Storage), as this app uses it. */
export interface SteamCloud {
  /**
   * Reads a file from the player's cloud storage.
   *
   * @param name - File name (`save.v1.json`).
   * @returns Its contents, or `null` when the cloud has no such file.
   */
  read(name: string): string | null;
  /**
   * Writes a file to the player's cloud storage.
   *
   * @param name - File name.
   * @param text - Its contents.
   * @returns `true` when Steam accepted the write (a full quota returns `false`).
   */
  write(name: string, text: string): boolean;
}

/**
 * The part of `steamworks-ffi-node`'s surface this app uses. Declared structurally so the module
 * is **never imported** — it is not a dependency of this repo (see the module docblock), and the
 * tests hand {@link initSteam} a fake of exactly this shape.
 */
export interface SteamworksApi {
  /**
   * Activates an achievement and flushes it to Steam.
   *
   * @param id - The achievement's API name.
   * @returns `true` when Steam accepted it.
   */
  activateAchievement(id: string): boolean;
  /**
   * Reads a cloud file.
   *
   * @param name - File name.
   * @returns Its contents, or `null`.
   */
  cloudReadFile?(name: string): string | null;
  /**
   * Writes a cloud file.
   *
   * @param name - File name.
   * @param text - Its contents.
   * @returns `true` on success.
   */
  cloudWriteFile?(name: string, text: string): boolean;
  /** Releases the Steam API (called on quit). */
  shutdown?(): void;
}

/**
 * Loads the Steamworks binding for an app id.
 *
 * @param appId - The Steam app id to initialise with.
 * @returns The API, or `null` when the game was not launched through Steam (or the module is not
 *   installed, which is the normal case in this repo).
 * @throws Nothing: {@link initSteam} treats a throw as "not available".
 */
export type SteamworksLoader = (appId: number) => SteamworksApi | null;

/** Options for {@link initSteam}. */
export interface SteamOptions {
  /** The Steam app id (default: {@link steamAppId} of the process environment). */
  readonly appId?: number;
  /**
   * Loads the binding. The default returns `null` — this repo does not depend on
   * `steamworks-ffi-node`, so a build that wants Steam passes its own loader, typically
   * `(appId) => require('steamworks-ffi-node').init(appId)`.
   */
  readonly load?: SteamworksLoader;
  /**
   * Reports a problem (a failed load, a refused cloud write). Default: `console.warn`.
   *
   * @param message - What went wrong.
   */
  readonly onIssue?: (message: string) => void;
}

/** The Steam surface the rest of the app talks to. */
export interface SteamService {
  /** `false` when the game was not launched through Steam (every call is then a no-op). */
  readonly available: boolean;
  /** The app id the service initialised with. */
  readonly appId: number;
  /**
   * Unlocks an achievement (idempotent — a repeat within this session does not reach Steam).
   *
   * @param id - An {@link STEAM_ACHIEVEMENTS} API name.
   * @returns `true` when this call unlocked it, `false` when it was already unlocked, unknown, or
   *   Steam is unavailable.
   */
  unlockAchievement(id: string): boolean;
  /**
   * Unlocks every achievement a saved document has earned (called after each save write).
   *
   * @param save - The save as written.
   * @returns The API names this call unlocked (empty when nothing is new).
   */
  syncAchievements(save: SaveData): string[];
  /** Steam Cloud, or `null` when Steam is unavailable or the binding has no cloud calls. */
  readonly cloud: SteamCloud | null;
  /** Releases the Steam API. Safe to call more than once. */
  shutdown(): void;
}

/**
 * The Steam app id to initialise with.
 *
 * @param env - The process environment (`process.env`).
 * @returns {@link STEAM_APP_ID_ENV} or Steam's own `SteamAppId` when either is a positive whole
 *   number, else {@link PLACEHOLDER_STEAM_APP_ID}.
 *
 * @example
 * ```ts
 * steamAppId({ SHMUP_STEAM_APP_ID: '480123' }); // → 480123
 * steamAppId({});                               // → 480 (the placeholder)
 * ```
 */
export function steamAppId(env: Readonly<Record<string, string | undefined>>): number {
  for (const key of [STEAM_APP_ID_ENV, 'SteamAppId', 'SteamGameId']) {
    const raw = env[key];
    if (raw === undefined || !/^[0-9]+$/.test(raw)) continue;
    const value = Number(raw);
    if (Number.isSafeInteger(value) && value > 0) return value;
  }
  return PLACEHOLDER_STEAM_APP_ID;
}

/** A service that does nothing, for every build that is not running under Steam. */
const UNAVAILABLE_CLOUD: SteamCloud | null = null;

/**
 * Initialises Steamworks, or returns an inert service.
 *
 * @remarks
 * Never throws: a loader that throws, returns `null`, or is simply absent leaves
 * {@link SteamService.available} `false` and every method a no-op — which is what happens in this
 * repo, where `steamworks-ffi-node` is not installed. `unlockAchievement` remembers what it has
 * already sent, so the per-save sync stays cheap and quiet.
 *
 * @param options - The app id, the loader and the issue reporter.
 * @returns The service.
 *
 * @example
 * ```ts
 * // In a build that ships the binding:
 * const steam = initSteam({
 *   load: (appId) => require('steamworks-ffi-node').init(appId) as SteamworksApi,
 * });
 * if (steam.available) steam.syncAchievements(save);
 * ```
 */
export function initSteam(options: SteamOptions = {}): SteamService {
  const appId = options.appId ?? steamAppId(process.env);
  const onIssue =
    options.onIssue ??
    ((message: string): void => {
      console.warn(`Shmup Cup: ${message}`);
    });
  const known = new Set(STEAM_ACHIEVEMENTS.map((achievement) => achievement.id));
  const unlocked = new Set<string>();
  /**
   * Loads the binding, or reports why it could not be loaded.
   *
   * @returns The API, or `null` — the normal case in this repo.
   */
  const loadBinding = (): SteamworksApi | null => {
    try {
      return options.load?.(appId) ?? null;
    } catch (error) {
      onIssue(`Steamworks did not start: ${String(error)}`);
      return null;
    }
  };
  const live = loadBinding();
  // The binding is called through `live` (never through an extracted method), so `this` stays its
  // own object whatever the implementation does with it.
  const hasCloud =
    live !== null &&
    typeof live.cloudReadFile === 'function' &&
    typeof live.cloudWriteFile === 'function';
  const cloud: SteamCloud | null =
    live !== null && hasCloud
      ? {
          read: (name: string): string | null => {
            try {
              return live.cloudReadFile?.(name) ?? null;
            } catch (error) {
              onIssue(`Steam Cloud could not read "${name}": ${String(error)}`);
              return null;
            }
          },
          write: (name: string, text: string): boolean => {
            try {
              return live.cloudWriteFile?.(name, text) ?? false;
            } catch (error) {
              onIssue(`Steam Cloud could not write "${name}": ${String(error)}`);
              return false;
            }
          },
        }
      : UNAVAILABLE_CLOUD;
  let open = live !== null;
  /**
   * Unlocks one achievement. Declared before the service so {@link SteamService.syncAchievements}
   * can call it directly: a method taken off the service (`const { syncAchievements } = steam`)
   * would have no `this`, and the main process passes the service around by value.
   *
   * @param id - An {@link STEAM_ACHIEVEMENTS} API name.
   * @returns `true` when this call unlocked it.
   */
  const unlockAchievement = (id: string): boolean => {
    if (live === null || !open || !known.has(id) || unlocked.has(id)) return false;
    unlocked.add(id);
    try {
      return live.activateAchievement(id);
    } catch (error) {
      onIssue(`Steam did not accept the achievement "${id}": ${String(error)}`);
      return false;
    }
  };
  return {
    available: live !== null,
    appId,
    cloud,
    unlockAchievement,
    syncAchievements(save) {
      const out: string[] = [];
      for (const id of achievementsFor(save)) {
        if (unlockAchievement(id)) out.push(id);
      }
      return out;
    },
    shutdown() {
      if (live === null || !open) return;
      open = false;
      try {
        live.shutdown?.();
      } catch (error) {
        onIssue(`Steamworks did not shut down cleanly: ${String(error)}`);
      }
    },
  };
}

/**
 * Wraps a {@link FileStore} so every write of the save document unlocks whatever achievements it
 * has earned (plan M3-03).
 *
 * @remarks
 * This is where the game's progress reaches Steam: the renderer writes its save through IPC as it
 * always has, and the main process reads the document it just stored. A document that does not
 * parse, or a Steam call that fails, is reported and ignored — a save must never fail because an
 * achievement could not be sent. Wrap the cloud store with this one, not the other way round, so
 * the save reaches disk and the cloud before anything is derived from it.
 *
 * @param store - The store to wrap.
 * @param steam - The Steam service (an unavailable one makes this the identity).
 * @param onIssue - Reports a save that could not be read back.
 * @returns A store with the same interface.
 *
 * @example
 * ```ts
 * const store = createAchievementStore(createCloudStore(createFileStore(dir), steam.cloud), steam);
 * ```
 */
export function createAchievementStore(
  store: FileStore,
  steam: SteamService,
  onIssue: (message: string) => void = (message) => {
    console.warn(`Shmup Cup: ${message}`);
  },
): FileStore {
  if (!steam.available) return store;
  return {
    directory: store.directory,
    usage: () => store.usage(),
    get: (key) => store.get(key),
    async set(key, value) {
      await store.set(key, value);
      if (key !== SAVE_STORAGE_KEY) return;
      try {
        const save = parseSave(value).data;
        steam.syncAchievements(save);
      } catch (error) {
        onIssue(`could not read the save back for achievements: ${String(error)}`);
      }
    },
  };
}

/** The cloud file a storage key is mirrored to. */
const cloudName = (key: string): string => `${key}.json`;

/**
 * Wraps a {@link FileStore} so its files are mirrored to Steam Cloud (plan M3-03).
 *
 * @remarks
 * The local file stays the source of truth: a `set` writes to disk **first** and only then to the
 * cloud, and a failed cloud write is reported, never thrown — a Steam outage must not lose a save.
 * A `get` that finds nothing on disk (a fresh install on another machine) restores the cloud copy
 * and writes it back locally, so the next read is local again.
 *
 * @param store - The file store to wrap (`createFileStore`).
 * @param cloud - Steam Cloud, or `null` — then this returns `store` itself.
 * @param onIssue - Reports a refused cloud write.
 * @returns A store with the same interface.
 *
 * @example
 * ```ts
 * const store = createCloudStore(createFileStore(dir), steam.cloud, console.warn);
 * registerIpcHandlers(ipcMain, { store, quit, devUrl });
 * ```
 */
export function createCloudStore(
  store: FileStore,
  cloud: SteamCloud | null,
  onIssue: (message: string) => void = (message) => {
    console.warn(`Shmup Cup: ${message}`);
  },
): FileStore {
  if (cloud === null) return store;
  return {
    directory: store.directory,
    usage: () => store.usage(),
    async get(key) {
      const local = await store.get(key);
      if (local !== null) return local;
      const remote = cloud.read(cloudName(key));
      if (remote === null) return null;
      // Bring the machine up to date, but never fail the read because the write failed.
      try {
        await store.set(key, remote);
      } catch (error) {
        onIssue(`could not restore "${key}" from Steam Cloud: ${String(error)}`);
      }
      return remote;
    },
    async set(key, value) {
      await store.set(key, value);
      if (!cloud.write(cloudName(key), value)) {
        onIssue(`Steam Cloud refused "${key}" (quota?); the local save is up to date`);
      }
    },
  };
}
