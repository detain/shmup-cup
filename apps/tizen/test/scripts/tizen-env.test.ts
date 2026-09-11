/**
 * Unit tests for the Tizen CLI helpers (scripts/tizen-env.mjs) and the package / install /
 * run wrappers. Nothing is ever executed: `spawnSync` and the file system are mocked, and
 * `process.exit` throws so failure paths can be asserted. (The real scripts need the
 * Tizen CLI and a TV, which CI does not have.)
 */
import type * as Fs from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as TizenEnvModule from '../../scripts/tizen-env.mjs';

const mocks = vi.hoisted(() => ({
  spawnSync: vi.fn<(...args: unknown[]) => { status: number | null; error?: Error }>(),
  existing: new Set<string>(),
  files: new Map<string, number>(),
}));

vi.mock('node:child_process', () => ({ spawnSync: mocks.spawnSync }));

vi.mock('node:fs', async (importOriginal) => {
  const real = await importOriginal<typeof Fs>();
  return {
    ...real,
    existsSync: (path: string) => mocks.existing.has(path),
    readdirSync: () => [...mocks.files.keys()],
    statSync: (path: string) => ({
      mtimeMs: mocks.files.get(path.split(/[\\/]/).pop() ?? '') ?? 0,
      isDirectory: () => false,
    }),
  };
});

const APP_DIR = fileURLToPath(new URL('../../', import.meta.url)).replace(/[\\/]$/, '');
const DIST = join(APP_DIR, 'dist');

/** Thrown by the mocked `process.exit`. */
class ExitError extends Error {
  constructor(readonly code: number | undefined) {
    super(`process.exit(${String(code)})`);
  }
}

type TizenEnv = typeof TizenEnvModule;

/**
 * Imports a fresh copy of tizen-env.mjs (module state such as `isWindows` is computed at
 * load time).
 *
 * @returns The module.
 */
async function loadEnv(): Promise<TizenEnv> {
  vi.resetModules();
  return import('../../scripts/tizen-env.mjs');
}

/**
 * Runs a wrapper script (it does its work at import time).
 *
 * @param name - Script file name.
 */
async function runScript(name: 'tizen-package' | 'tizen-install' | 'tizen-run'): Promise<void> {
  vi.resetModules();
  const scripts = {
    'tizen-package': () => import('../../scripts/tizen-package.mjs'),
    'tizen-install': () => import('../../scripts/tizen-install.mjs'),
    'tizen-run': () => import('../../scripts/tizen-run.mjs'),
  };
  await scripts[name]();
}

/** @returns Every command line passed to the mocked spawnSync. */
function spawned(): Array<{ command: unknown; args: unknown }> {
  return mocks.spawnSync.mock.calls.map((call) => ({ command: call[0], args: call[1] }));
}

let errors: string[] = [];

beforeEach(() => {
  mocks.spawnSync.mockReset();
  mocks.spawnSync.mockReturnValue({ status: 0 });
  mocks.existing.clear();
  mocks.files.clear();
  errors = [];
  for (const name of ['TIZEN_CLI', 'SDB', 'TIZEN_PROFILE', 'TV_IP', 'TIZEN_TARGET']) {
    vi.stubEnv(name, undefined);
  }
  vi.spyOn(process, 'exit').mockImplementation((code?: string | number | null) => {
    throw new ExitError(typeof code === 'number' ? code : undefined);
  });
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    errors.push(args.map(String).join(' '));
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('tizen/scripts/tizen-env', () => {
  it('points at apps/tizen and its dist folder and uses the config.xml application id', async () => {
    const env = await loadEnv();
    expect(env.APP_DIR.replace(/[\\/]$/, '')).toBe(APP_DIR);
    expect(env.DIST_DIR).toBe(DIST);
    expect(env.APP_ID).toBe('ShmpCupGam.ShmupCup');
  });

  it('defaults to tizen / sdb on PATH and honours TIZEN_CLI / SDB', async () => {
    const env = await loadEnv();
    expect(env.tizenCli()).toBe(process.platform === 'win32' ? 'tizen.bat' : 'tizen');
    expect(env.sdbCli()).toBe('sdb');
    vi.stubEnv('TIZEN_CLI', 'C:\\tizen-studio\\tools\\ide\\bin\\tizen.bat');
    vi.stubEnv('SDB', '/opt/tizen/sdb');
    expect(env.tizenCli()).toBe('C:\\tizen-studio\\tools\\ide\\bin\\tizen.bat');
    expect(env.sdbCli()).toBe('/opt/tizen/sdb');
  });

  it('requireEnv returns the value or exits with a hint', async () => {
    const env = await loadEnv();
    vi.stubEnv('TIZEN_PROFILE', 'shmup');
    expect(env.requireEnv('TIZEN_PROFILE', 'certificate profile')).toBe('shmup');
    vi.stubEnv('TIZEN_PROFILE', '');
    expect(() => env.requireEnv('TIZEN_PROFILE', 'certificate profile')).toThrow(ExitError);
    expect(errors[0]).toBe('Missing environment variable TIZEN_PROFILE: certificate profile');
  });

  it('run() spawns without a shell on Linux/macOS and passes arguments unquoted', async () => {
    const env = await loadEnv();
    if (process.platform === 'win32') return; // covered by the win32 test below
    env.run('tizen', ['package', '-s', 'my profile'], { cwd: '/x' });
    expect(mocks.spawnSync).toHaveBeenCalledWith('tizen', ['package', '-s', 'my profile'], {
      stdio: 'inherit',
      cwd: '/x',
    });
  });

  it('run() exits with the child status on failure and with 1 when the command cannot start', async () => {
    const env = await loadEnv();
    mocks.spawnSync.mockReturnValue({ status: 3 });
    expect(() => env.run('tizen', ['version'])).toThrow(expect.objectContaining({ code: 3 }));
    mocks.spawnSync.mockReturnValue({ status: null });
    expect(() => env.run('tizen', ['version'])).toThrow(expect.objectContaining({ code: 1 }));
    mocks.spawnSync.mockReturnValue({ status: null, error: new Error('spawn tizen ENOENT') });
    expect(() => env.run('tizen', ['version'])).toThrow(expect.objectContaining({ code: 1 }));
    expect(errors.at(-1)).toBe('Failed to start tizen: spawn tizen ENOENT');
  });

  it('run() goes through a quoted shell command line on Windows (tizen.bat)', async () => {
    const platform = Object.getOwnPropertyDescriptor(process, 'platform');
    Object.defineProperty(process, 'platform', { value: 'win32' });
    try {
      const env = await loadEnv();
      expect(env.tizenCli()).toBe('tizen.bat');
      env.run('C:\\Program Files\\tizen\\tizen.bat', [
        'package',
        '-s',
        'my "profile"',
        '--',
        'C:\\a b',
      ]);
      expect(mocks.spawnSync).toHaveBeenCalledWith(
        '"C:\\Program Files\\tizen\\tizen.bat" package -s "my \\"profile\\"" -- "C:\\a b"',
        { stdio: 'inherit', shell: true, cwd: undefined },
      );
    } finally {
      if (platform !== undefined) Object.defineProperty(process, 'platform', platform);
    }
  });

  it('resolveTarget connects to TV_IP and derives the sdb serial', async () => {
    const env = await loadEnv();
    expect(env.resolveTarget()).toBeNull();
    expect(mocks.spawnSync).not.toHaveBeenCalled();

    vi.stubEnv('TV_IP', '192.168.1.50');
    expect(env.resolveTarget()).toBe('192.168.1.50:26101');
    expect(spawned()).toEqual([{ command: 'sdb', args: ['connect', '192.168.1.50'] }]);

    vi.stubEnv('TIZEN_TARGET', 'emulator-26101');
    expect(env.resolveTarget()).toBe('emulator-26101');
  });

  it('findWgt returns the newest .wgt (any case) or null', async () => {
    const env = await loadEnv();
    expect(env.findWgt()).toBeNull();
    mocks.existing.add(DIST);
    mocks.files.set('app.js', 50);
    expect(env.findWgt()).toBeNull();
    mocks.files.set('ShmupCup-old.wgt', 100);
    mocks.files.set('ShmupCup.WGT', 300);
    mocks.files.set('ShmupCup-mid.wgt', 200);
    expect(env.findWgt()).toBe('ShmupCup.WGT');
  });

  it('requireBuild exits unless dist/config.xml and dist/app.js exist', async () => {
    const env = await loadEnv();
    expect(() => env.requireBuild()).toThrow(ExitError);
    expect(errors[0]).toMatch(/apps\/tizen\/dist is missing/);
    mocks.existing.add(join(DIST, 'config.xml'));
    expect(() => env.requireBuild()).toThrow(ExitError);
    mocks.existing.add(join(DIST, 'app.js'));
    expect(() => env.requireBuild()).not.toThrow();
  });
});

describe('tizen/scripts wrappers (package / install / run)', () => {
  it('tizen-package signs dist/ with TIZEN_PROFILE', async () => {
    mocks.existing.add(join(DIST, 'config.xml')).add(join(DIST, 'app.js'));
    vi.stubEnv('TIZEN_PROFILE', 'shmup-profile');
    vi.stubEnv('TIZEN_CLI', 'tizen');
    await runScript('tizen-package');
    expect(spawned()).toEqual([
      { command: 'tizen', args: ['package', '-t', 'wgt', '-s', 'shmup-profile', '--', DIST] },
    ]);
  });

  it('tizen-package refuses to run without a build or without a profile', async () => {
    vi.stubEnv('TIZEN_PROFILE', 'shmup-profile');
    await expect(runScript('tizen-package')).rejects.toThrow(ExitError);
    mocks.existing.add(join(DIST, 'config.xml')).add(join(DIST, 'app.js'));
    vi.stubEnv('TIZEN_PROFILE', undefined);
    await expect(runScript('tizen-package')).rejects.toThrow(ExitError);
    expect(mocks.spawnSync).not.toHaveBeenCalled();
  });

  it('tizen-install installs the newest .wgt on the TV_IP target', async () => {
    mocks.existing.add(DIST);
    mocks.files.set('ShmupCup.wgt', 1);
    vi.stubEnv('TIZEN_CLI', 'tizen');
    vi.stubEnv('TV_IP', '10.0.0.7');
    await runScript('tizen-install');
    expect(spawned()).toEqual([
      { command: 'sdb', args: ['connect', '10.0.0.7'] },
      {
        command: 'tizen',
        args: ['install', '-n', 'ShmupCup.wgt', '-s', '10.0.0.7:26101', '--', DIST],
      },
    ]);
  });

  it('tizen-install without TV_IP lets the CLI pick the only device, and exits without a .wgt', async () => {
    mocks.existing.add(DIST);
    mocks.files.set('ShmupCup.wgt', 1);
    vi.stubEnv('TIZEN_CLI', 'tizen');
    await runScript('tizen-install');
    expect(spawned()).toEqual([
      { command: 'tizen', args: ['install', '-n', 'ShmupCup.wgt', '--', DIST] },
    ]);

    mocks.spawnSync.mockClear();
    mocks.files.clear();
    await expect(runScript('tizen-install')).rejects.toThrow(ExitError);
    expect(mocks.spawnSync).not.toHaveBeenCalled();
  });

  it('tizen-run launches the app id on the target', async () => {
    vi.stubEnv('TIZEN_CLI', 'tizen');
    vi.stubEnv('TIZEN_TARGET', 'tv-1');
    await runScript('tizen-run');
    expect(spawned()).toEqual([
      { command: 'tizen', args: ['run', '-p', 'ShmpCupGam.ShmupCup', '-s', 'tv-1'] },
    ]);
  });
});
