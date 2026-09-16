/**
 * `main/steam.ts` (plan M3-03): the Steamworks adapter, driven entirely by fakes — this project
 * has no Steam partner account, no app id and no `steamworks-ffi-node` dependency, so the real
 * binding has never been loaded (see the module's docblock and plan §8.8).
 *
 * @module
 */
import { createDefaultSave, serializeSave, type SaveData } from '@shmup/core';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createFileStore } from '../../src/main/saves.js';
import {
  PLACEHOLDER_STEAM_APP_ID,
  STEAM_ACHIEVEMENTS,
  STEAM_APP_ID_ENV,
  achievementsFor,
  createAchievementStore,
  createCloudStore,
  initSteam,
  steamAppId,
  type SteamworksApi,
} from '../../src/main/steam.js';

/** A recording stand-in for `steamworks-ffi-node`. */
function fakeSteam(options: { cloud?: boolean; failAchievements?: boolean } = {}) {
  const achievements: string[] = [];
  const files = new Map<string, string>();
  let shutdowns = 0;
  const api: SteamworksApi = {
    activateAchievement(id) {
      if (options.failAchievements === true) throw new Error('offline');
      achievements.push(id);
      return true;
    },
    ...(options.cloud === false
      ? {}
      : {
          cloudReadFile: (name: string) => files.get(name) ?? null,
          cloudWriteFile: (name: string, text: string) => {
            files.set(name, text);
            return true;
          },
        }),
    shutdown() {
      shutdowns++;
    },
  };
  return { api, achievements, files, shutdowns: () => shutdowns };
}

/**
 * A save with the given fields over the defaults.
 *
 * @param over - Fields to override.
 * @returns The save document.
 */
function save(over: Partial<SaveData> = {}): SaveData {
  return { ...createDefaultSave(), ...over };
}

describe('electron/main steam — the app id (M3-03)', () => {
  it('prefers our variable, then Steam’s own, and falls back to the Spacewar placeholder', () => {
    expect(steamAppId({ [STEAM_APP_ID_ENV]: '480123' })).toBe(480123);
    expect(steamAppId({ SteamAppId: '900' })).toBe(900);
    expect(steamAppId({ SteamGameId: '901' })).toBe(901);
    expect(steamAppId({})).toBe(PLACEHOLDER_STEAM_APP_ID);
    expect(PLACEHOLDER_STEAM_APP_ID).toBe(480);
    // Anything that is not a positive whole number is ignored, never thrown on.
    for (const bad of ['', '0', '-3', '1.5', 'abc', ' 12']) {
      expect(steamAppId({ [STEAM_APP_ID_ENV]: bad }), bad).toBe(PLACEHOLDER_STEAM_APP_ID);
    }
  });
});

describe('electron/main steam — initSteam (M3-03)', () => {
  it('is inert with no loader: this repo does not depend on steamworks-ffi-node', () => {
    const steam = initSteam();
    expect(steam.available).toBe(false);
    expect(steam.cloud).toBeNull();
    expect(steam.unlockAchievement('FIRST_LAUNCH')).toBe(false);
    expect(
      steam.syncAchievements(save({ stats: { gamesStarted: 9, gameOvers: 1, stagesCleared: 9 } })),
    ).toEqual([]);
    steam.shutdown(); // never throws
  });

  it('is inert when the loader returns null or throws, and reports the throw', () => {
    const issues: string[] = [];
    expect(initSteam({ load: () => null }).available).toBe(false);
    const thrown = initSteam({
      load: () => {
        throw new Error('no steam client');
      },
      onIssue: (message) => issues.push(message),
    });
    expect(thrown.available).toBe(false);
    expect(issues[0]).toMatch(/Steamworks did not start: Error: no steam client/);
  });

  it('unlocks an achievement once, ignores unknown ids, and passes the app id on', () => {
    const fake = fakeSteam();
    let seenAppId = 0;
    const steam = initSteam({
      appId: 123,
      load: (appId) => {
        seenAppId = appId;
        return fake.api;
      },
    });
    expect([steam.available, steam.appId, seenAppId]).toEqual([true, 123, 123]);
    expect(steam.unlockAchievement('FIRST_LAUNCH')).toBe(true);
    expect(steam.unlockAchievement('FIRST_LAUNCH')).toBe(false); // idempotent
    expect(steam.unlockAchievement('NOT_AN_ACHIEVEMENT')).toBe(false);
    expect(fake.achievements).toEqual(['FIRST_LAUNCH']);
  });

  it('survives a binding that throws, and stops after shutdown', () => {
    const issues: string[] = [];
    const fake = fakeSteam({ failAchievements: true });
    const steam = initSteam({ load: () => fake.api, onIssue: (m) => issues.push(m) });
    expect(steam.unlockAchievement('FIRST_LAUNCH')).toBe(false);
    expect(issues[0]).toMatch(/did not accept the achievement "FIRST_LAUNCH"/);
    steam.shutdown();
    steam.shutdown();
    expect(fake.shutdowns()).toBe(1);
    expect(steam.unlockAchievement('FIRST_ZONE')).toBe(false);
  });

  it('offers no cloud when the binding has no cloud calls', () => {
    const fake = fakeSteam({ cloud: false });
    expect(initSteam({ load: () => fake.api }).cloud).toBeNull();
  });
});

describe('electron/main steam — the achievement rules (M3-03)', () => {
  it('names every achievement once, in upper snake case, with a description', () => {
    const ids = STEAM_ACHIEVEMENTS.map((achievement) => achievement.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const achievement of STEAM_ACHIEVEMENTS) {
      expect(achievement.id, achievement.id).toMatch(/^[A-Z][A-Z0-9_]*$/);
      expect(achievement.description.length, achievement.id).toBeGreaterThan(8);
    }
  });

  it('gives a fresh save nothing', () => {
    expect(achievementsFor(save())).toEqual([]);
  });

  it('follows the counters, the unlocks and the tables', () => {
    expect(
      achievementsFor(save({ stats: { gamesStarted: 1, gameOvers: 0, stagesCleared: 0 } })),
    ).toEqual(['FIRST_LAUNCH']);
    expect(
      achievementsFor(save({ stats: { gamesStarted: 3, gameOvers: 1, stagesCleared: 5 } })),
    ).toEqual(['FIRST_LAUNCH', 'FIRST_ZONE', 'FIVE_ZONES']);
    expect(achievementsFor(save({ unlocks: { extraEdit: true, loop2: false } }))).toEqual([
      'EXTRA_EDIT',
    ]);
    expect(achievementsFor(save({ unlocks: { extraEdit: true, loop2: true } }))).toEqual([
      'EXTRA_EDIT',
      'SECOND_LOOP',
    ]);
  });

  /**
   * One hi-score row.
   *
   * @param score - Its score.
   * @param assisted - Whether it was assisted.
   * @returns The entry.
   */
  const row = (score: number, assisted = false) => ({
    name: 'AAA',
    score,
    reached: 'zone-a',
    mode: '1p',
    difficulty: 'normal',
    ...(assisted ? { assisted: true } : {}),
  });

  it('reads the ship, the mode and the difficulty off the table keys', () => {
    expect(achievementsFor(save({ hiScores: { 'direct-normal': [row(100)] } }))).toEqual([
      'MANTA_PILOT',
    ]);
    expect(achievementsFor(save({ hiScores: { 'meter-normal-bossrush': [row(100)] } }))).toEqual([
      'BOSS_RUSH',
    ]);
    expect(achievementsFor(save({ hiScores: { 'meter-hard-caravan': [row(100)] } }))).toEqual([
      'CARAVAN',
    ]);
    expect(achievementsFor(save({ hiScores: { 'meter-normal-arcade': [row(100)] } }))).toEqual([
      'ARCADE',
    ]);
    expect(achievementsFor(save({ hiScores: { 'meter-arcade': [row(100)] } }))).toEqual([
      'ARCADE_DIFFICULTY',
    ]);
  });

  it('never counts an assisted run — not for the million, not for the mode', () => {
    const assisted = save({ hiScores: { 'meter-normal': [row(2_000_000, true)] } });
    expect(achievementsFor(assisted)).toEqual([]);
    const honest = save({ hiScores: { 'meter-normal': [row(2_000_000, true), row(1_000_000)] } });
    expect(achievementsFor(honest)).toEqual(['MILLION']);
    expect(achievementsFor(save({ hiScores: { 'meter-normal': [row(999_999)] } }))).toEqual([]);
  });
});

describe('electron/main steam — Steam Cloud (M3-03)', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'shmup-steam-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns the store untouched when there is no cloud', () => {
    const store = createFileStore(dir);
    expect(createCloudStore(store, null)).toBe(store);
  });

  it('mirrors a write to the cloud and keeps the local file authoritative', async () => {
    const fake = fakeSteam();
    const steam = initSteam({ load: () => fake.api });
    const store = createCloudStore(createFileStore(dir), steam.cloud);
    await store.set('save.v1', '{"version":2}');
    expect(fake.files.get('save.v1.json')).toBe('{"version":2}');
    await expect(store.get('save.v1')).resolves.toBe('{"version":2}');
  });

  it('restores a cloud copy on a machine with no local file, and writes it back', async () => {
    const fake = fakeSteam();
    fake.files.set('save.v1.json', '{"version":2,"from":"cloud"}');
    const steam = initSteam({ load: () => fake.api });
    const local = createFileStore(dir);
    const store = createCloudStore(local, steam.cloud);
    await expect(store.get('save.v1')).resolves.toBe('{"version":2,"from":"cloud"}');
    // The next read is local: the machine is up to date.
    await expect(local.get('save.v1')).resolves.toBe('{"version":2,"from":"cloud"}');
    await expect(store.get('nothing')).resolves.toBeNull();
  });

  it('reports a refused cloud write but still stores locally', async () => {
    const issues: string[] = [];
    const steam = initSteam({
      load: () => ({
        activateAchievement: () => true,
        cloudReadFile: () => null,
        cloudWriteFile: () => false,
      }),
    });
    const store = createCloudStore(createFileStore(dir), steam.cloud, (m) => issues.push(m));
    await store.set('save.v1', '{"version":2}');
    expect(issues[0]).toMatch(/Steam Cloud refused "save\.v1"/);
    await expect(store.get('save.v1')).resolves.toBe('{"version":2}');
  });
});

describe('electron/main steam — achievements from the save write (M3-03)', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'shmup-steam-ach-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns the store untouched without Steam', () => {
    const store = createFileStore(dir);
    expect(createAchievementStore(store, initSteam())).toBe(store);
  });

  it('unlocks what the written save has earned, once, and only for the save key', async () => {
    const fake = fakeSteam();
    const steam = initSteam({ load: () => fake.api });
    const store = createAchievementStore(createFileStore(dir), steam);
    const data = save({ stats: { gamesStarted: 2, gameOvers: 1, stagesCleared: 1 } });
    await store.set('save.v1', serializeSave(data));
    expect(fake.achievements).toEqual(['FIRST_LAUNCH', 'FIRST_ZONE']);
    await store.set('save.v1', serializeSave(data));
    expect(fake.achievements).toEqual(['FIRST_LAUNCH', 'FIRST_ZONE']); // idempotent
    await store.set('window', '{"scale":5}');
    expect(fake.achievements).toEqual(['FIRST_LAUNCH', 'FIRST_ZONE']);
    // And the file really was written.
    await expect(store.get('save.v1')).resolves.toBe(serializeSave(data));
  });

  it('stores a save that cannot be read back, and unlocks nothing from it', async () => {
    const fake = fakeSteam();
    const steam = initSteam({ load: () => fake.api });
    const store = createAchievementStore(createFileStore(dir), steam);
    await store.set('save.v1', 'not json');
    expect(fake.achievements).toEqual([]);
    await expect(store.get('save.v1')).resolves.toBe('not json');
  });
});
