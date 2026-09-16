/**
 * `main/steam.ts` — the invariants a reviewer, not a compiler, has been guarding (plan M3-03).
 *
 * Three of them, all about *how* the binding is called rather than what it returns:
 *
 *  1. **Every call reaches the binding as `live.method(…)`, never as an extracted function.** A
 *     native FFI object is free to keep state on `this`; pulling `activateAchievement` out of it
 *     would call it with `this === undefined` and break on a real Steam client — which nobody here
 *     can run. The fake below therefore *checks its own `this`* on every method and throws when it
 *     is wrong, so extracting a method anywhere in `steam.ts` turns into a red test.
 *  2. **`shutdown()` is idempotent, including re-entrant calls.** Electron's `will-quit` can fire
 *     more than once, and a second `SteamAPI_Shutdown` against a released API is a crash on quit.
 *  3. **The service survives being destructured.** `const { syncAchievements } = steam` must keep
 *     working: the achievement store calls the service through a variable, and a future caller
 *     will eventually pull a method off it.
 *
 * Everything is a fake: this repo has no Steam partner account, no app id and no
 * `steamworks-ffi-node` dependency (plan §8.8).
 *
 * @module
 */
import { createDefaultSave, serializeSave, type SaveData } from '@shmup/core';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createFileStore, type FileStore } from '../../src/main/saves.js';
import {
  achievementsFor,
  createAchievementStore,
  createCloudStore,
  initSteam,
  type SteamService,
  type SteamworksApi,
} from '../../src/main/steam.js';

/**
 * A binding whose every method insists it was called as a method of the binding object — the way
 * a native FFI wrapper with per-instance state behaves.
 *
 * @returns The API and what it recorded.
 */
function strictBinding() {
  const achievements: string[] = [];
  const reads: string[] = [];
  const writes: Array<[string, string]> = [];
  let shutdowns = 0;
  /**
   * Throws unless `this` is the binding itself.
   *
   * @param self - The method's `this`.
   * @param method - The method's name, for the message.
   */
  const check = (self: unknown, method: string): void => {
    if (self !== api) throw new Error(`steam.${method} was called without its binding as "this"`);
  };
  const api: SteamworksApi = {
    activateAchievement(this: unknown, id: string) {
      check(this, 'activateAchievement');
      achievements.push(id);
      return true;
    },
    cloudReadFile(this: unknown, name: string) {
      check(this, 'cloudReadFile');
      reads.push(name);
      return null;
    },
    cloudWriteFile(this: unknown, name: string, text: string) {
      check(this, 'cloudWriteFile');
      writes.push([name, text]);
      return true;
    },
    shutdown(this: unknown) {
      check(this, 'shutdown');
      shutdowns++;
    },
  };
  return { api, achievements, reads, writes, shutdowns: () => shutdowns };
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

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'shmup-steam-edge-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('electron/main steam — the binding keeps its own "this" (M3-03)', () => {
  it('calls achievements, cloud reads, cloud writes and shutdown as methods of the binding', () => {
    const binding = strictBinding();
    const issues: string[] = [];
    const steam = initSteam({
      appId: 480,
      load: () => binding.api,
      onIssue: (message) => issues.push(message),
    });
    expect(steam.available).toBe(true);
    expect(steam.unlockAchievement('FIRST_LAUNCH')).toBe(true);
    expect(steam.cloud?.read('save.v1.json')).toBeNull();
    expect(steam.cloud?.write('save.v1.json', '{}')).toBe(true);
    steam.shutdown();
    // Not one call went through a detached method — any `const f = live.x` would have reported.
    expect(issues).toEqual([]);
    expect(binding.achievements).toEqual(['FIRST_LAUNCH']);
    expect(binding.reads).toEqual(['save.v1.json']);
    expect(binding.writes).toEqual([['save.v1.json', '{}']]);
    expect(binding.shutdowns()).toBe(1);
  });

  it('reaches the binding the same way through the cloud and achievement stores', async () => {
    const binding = strictBinding();
    const issues: string[] = [];
    const steam = initSteam({
      appId: 480,
      load: () => binding.api,
      onIssue: (message) => issues.push(message),
    });
    const store = createAchievementStore(
      createCloudStore(createFileStore(dir), steam.cloud, (m) => issues.push(m)),
      steam,
      (m) => issues.push(m),
    );
    await store.set(
      'save.v1',
      serializeSave(save({ stats: { ...save().stats, gamesStarted: 1 } })),
    );
    expect(issues).toEqual([]);
    expect(binding.writes.map(([name]) => name)).toEqual(['save.v1.json']);
    expect(binding.achievements).toContain('FIRST_LAUNCH');
  });
});

describe('electron/main steam — shutdown is idempotent (M3-03)', () => {
  it('releases the API once, however many times will-quit fires', () => {
    const binding = strictBinding();
    const steam = initSteam({ appId: 480, load: () => binding.api });
    steam.shutdown();
    steam.shutdown();
    steam.shutdown();
    expect(binding.shutdowns()).toBe(1);
  });

  it('survives a shutdown that re-enters shutdown, and stays closed', () => {
    let steam: SteamService | null = null;
    let calls = 0;
    const api: SteamworksApi = {
      activateAchievement: () => true,
      shutdown() {
        calls++;
        // A real `will-quit` handler can run again while the first one is still inside the
        // binding (Electron re-emits it when a handler calls `app.quit()`).
        steam?.shutdown();
      },
    };
    steam = initSteam({ appId: 480, load: () => api });
    steam.shutdown();
    expect(calls).toBe(1);
    steam.shutdown();
    expect(calls).toBe(1);
  });

  it('refuses every later call once shut down, without throwing or reporting', () => {
    const binding = strictBinding();
    const issues: string[] = [];
    const steam = initSteam({
      appId: 480,
      load: () => binding.api,
      onIssue: (message) => issues.push(message),
    });
    steam.shutdown();
    expect(steam.unlockAchievement('FIRST_LAUNCH')).toBe(false);
    expect(steam.syncAchievements(save({ stats: { ...save().stats, gamesStarted: 5 } }))).toEqual(
      [],
    );
    expect(binding.achievements).toEqual([]);
    expect(issues).toEqual([]);
    // `available` describes the build, not the session: it stays true after a shutdown, which is
    // what keeps the store wrappers from silently becoming the identity mid-run.
    expect(steam.available).toBe(true);
  });

  it('reports a binding whose shutdown throws, and does not try again', () => {
    const issues: string[] = [];
    let calls = 0;
    const steam = initSteam({
      appId: 480,
      onIssue: (message) => issues.push(message),
      load: () => ({
        activateAchievement: () => true,
        shutdown() {
          calls++;
          throw new Error('already released');
        },
      }),
    });
    steam.shutdown();
    steam.shutdown();
    expect(calls).toBe(1);
    expect(issues).toEqual(['Steamworks did not shut down cleanly: Error: already released']);
  });

  it('is a no-op on a build with no Steam at all', () => {
    const issues: string[] = [];
    const steam = initSteam({ appId: 480, onIssue: (message) => issues.push(message) });
    steam.shutdown();
    steam.shutdown();
    expect(issues).toEqual([]);
    expect(steam.cloud).toBeNull();
  });
});

describe('electron/main steam — the service survives being destructured (M3-03)', () => {
  it('keeps unlocking through a method pulled off the service', () => {
    const binding = strictBinding();
    const steam = initSteam({ appId: 480, load: () => binding.api });
    // This destructuring is the whole point of the test — `@typescript-eslint/unbound-method`
    // warns about exactly the mistake `initSteam` was changed to survive, so it is switched off
    // for this one line rather than the test being written around it.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const { syncAchievements, unlockAchievement, shutdown } = steam;
    const earned = save({ stats: { ...save().stats, gamesStarted: 1, stagesCleared: 1 } });
    expect(syncAchievements(earned).length).toBeGreaterThan(0);
    expect(binding.achievements).toEqual(achievementsFor(earned));
    // A repeat is still deduplicated, and the detached unlock sees the same session state.
    expect(syncAchievements(earned)).toEqual([]);
    expect(unlockAchievement('FIRST_LAUNCH')).toBe(false);
    shutdown();
    expect(binding.shutdowns()).toBe(1);
  });
});

describe('electron/main steam — the store wrappers’ error paths (M3-03)', () => {
  it('keeps the local file when the cloud read throws, and reports it', async () => {
    const issues: string[] = [];
    const steam = initSteam({
      appId: 480,
      onIssue: (message) => issues.push(message),
      load: () => ({
        activateAchievement: () => true,
        cloudReadFile: () => {
          throw new Error('no quota');
        },
        cloudWriteFile: () => {
          throw new Error('no quota');
        },
      }),
    });
    const store = createCloudStore(createFileStore(dir), steam.cloud, (m) => issues.push(m));
    await store.set('save.v1', '{"version":1}');
    expect(await store.get('save.v1')).toBe('{"version":1}');
    // One issue from the failed write, one from the store noticing the cloud refused it.
    expect(issues).toEqual([
      'Steam Cloud could not write "save.v1.json": Error: no quota',
      'Steam Cloud refused "save.v1" (quota?); the local save is up to date',
    ]);
  });

  it('never fails a read because the local write-back failed', async () => {
    const issues: string[] = [];
    const cloud = { read: (): string => '{"version":1}', write: (): boolean => true };
    const broken: FileStore = {
      directory: dir,
      usage: () => Promise.resolve({ bytes: 0, keys: 0, quotaBytes: 1 }),
      get: () => Promise.resolve(null),
      set: () => Promise.reject(new Error('read-only disk')),
    };
    const store = createCloudStore(broken, cloud, (m) => issues.push(m));
    expect(await store.get('save.v1')).toBe('{"version":1}');
    expect(issues).toEqual(['could not restore "save.v1" from Steam Cloud: Error: read-only disk']);
  });

  it('lets a failed save write through, and never derives achievements from it', async () => {
    const binding = strictBinding();
    const issues: string[] = [];
    const steam = initSteam({ appId: 480, load: () => binding.api });
    const broken: FileStore = {
      directory: dir,
      usage: () => Promise.resolve({ bytes: 0, keys: 0, quotaBytes: 1 }),
      get: () => Promise.resolve(null),
      set: () => Promise.reject(new Error('disk full')),
    };
    const store = createAchievementStore(broken, steam, (m) => issues.push(m));
    await expect(store.set('save.v1', serializeSave(save()))).rejects.toThrow('disk full');
    expect(binding.achievements).toEqual([]);
    expect(issues).toEqual([]);
  });

  it('passes usage, directory and other keys straight through both wrappers', async () => {
    const binding = strictBinding();
    const steam = initSteam({ appId: 480, load: () => binding.api });
    const inner = createFileStore(dir);
    const store = createAchievementStore(createCloudStore(inner, steam.cloud), steam);
    expect(store.directory).toBe(inner.directory);
    await store.set('window.state', '{"x":1}');
    expect(await store.get('window.state')).toBe('{"x":1}');
    expect((await store.usage()).bytes).toBeGreaterThan(0);
    // A key that is not the save never derives achievements — but it is still mirrored.
    expect(binding.achievements).toEqual([]);
    expect(binding.writes.map(([name]) => name)).toEqual(['window.state.json']);
  });
});
