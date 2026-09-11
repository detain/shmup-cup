/**
 * scripts/lib/tizen.mjs, in-process: argument parsing, cmd.exe quoting, CLI/sdb discovery (Linux and a
 * simulated Windows), packaging-artifact cleanup, .wgt discovery and the command runner.
 */

import { mkdirSync, readFileSync, utimesSync, writeFileSync, readdirSync } from 'node:fs';
import { delimiter, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as tizen from '../scripts/lib/tizen.mjs';
import { PROJECT_ROOT, tempDir, writeExecutable } from './helpers/project';

const savedEnv = { ...process.env };

/** Resets the env vars the lib reads and points HOME at an empty dir. */
function cleanEnv(home: string, extra: Record<string, string> = {}): void {
  for (const k of Object.keys(process.env)) if (k.startsWith('TIZEN_')) delete process.env[k];
  delete process.env['LOCALAPPDATA'];
  process.env['HOME'] = home;
  process.env['USERPROFILE'] = home;
  process.env['PATH'] = join(home, 'no-such-bin');
  Object.assign(process.env, extra);
}

afterEach(() => {
  for (const k of Object.keys(process.env)) if (!(k in savedEnv)) delete process.env[k];
  Object.assign(process.env, savedEnv);
  vi.restoreAllMocks();
});

describe('constants', () => {
  it('match the widget config and project layout', () => {
    const xml = readFileSync(join(PROJECT_ROOT, 'public', 'config.xml'), 'utf8');
    expect(xml).toContain('<tizen:application id="' + tizen.APP_ID + '"');
    expect(xml).toContain('<name>' + tizen.WGT_NAME.replace(/\.wgt$/, '') + '</name>');
    expect(tizen.PROJECT_ROOT).toBe(PROJECT_ROOT);
    expect(tizen.DIST_DIR).toBe(join(PROJECT_ROOT, 'dist'));
    expect(tizen.SDB_PORT).toBe(26101);
    expect(tizen.IS_WINDOWS).toBe(process.platform === 'win32');
  });
});

describe('parseArgs', () => {
  it('parses flags, --key value (for value flags) and --key=value', () => {
    expect(tizen.parseArgs(['--dry-run', '--profile', 'shmupcup', '--ip=1.2.3.4', '--tizen', 'C:\\t\\tizen.bat'])).toEqual({
      'dry-run': true,
      profile: 'shmupcup',
      ip: '1.2.3.4',
      tizen: 'C:\\t\\tizen.bat',
    });
  });

  it('does not swallow the next flag or positional args for boolean flags', () => {
    expect(tizen.parseArgs(['--profile', '--dry-run'])).toEqual({ profile: true, 'dry-run': true });
    expect(tizen.parseArgs(['--skip-build', 'extra', '--no-run'])).toEqual({ 'skip-build': true, 'no-run': true });
    expect(tizen.parseArgs(['--profile'])).toEqual({ profile: true });
    expect(tizen.parseArgs(['positional'])).toEqual({});
  });

  it('keeps "=" inside values', () => {
    expect(tizen.parseArgs(['--sdb=C:\\a=b\\sdb.exe'])).toEqual({ sdb: 'C:\\a=b\\sdb.exe' });
  });

  it('regression: -h is recognized as help', () => {
    expect(tizen.parseArgs(['-h'])).toEqual({ h: true });
    expect(tizen.parseArgs(['--help'])).toEqual({ help: true });
  });
});

describe('quoteForCmd (cmd.exe)', () => {
  it.each([
    ['package', 'package'],
    ['C:\\tizen-studio\\tools\\ide\\bin\\tizen.bat', 'C:\\tizen-studio\\tools\\ide\\bin\\tizen.bat'],
    ['192.168.1.50:26101', '192.168.1.50:26101'],
    ['', '""'],
    ['C:\\Program Files\\x', '"C:\\Program Files\\x"'],
    ['a"b', '"a""b"'],
    ['a&b', '"a&b"'],
    ['a|b', '"a|b"'],
    ['%PATH%', '"%PATH%"'],
    ['x^y', '"x^y"'],
    ['(x)', '"(x)"'],
    ['a,b', '"a,b"'],
    ['k=v', '"k=v"'],
    ['<in', '"<in"'],
    ['!bang', '"!bang"'],
  ])('%j → %s', (arg, out) => {
    expect(tizen.quoteForCmd(arg)).toBe(out);
  });

  it('stringifies non-strings', () => {
    expect(tizen.quoteForCmd(42 as unknown as string)).toBe('42');
  });
});

// On a real Windows machine C:\tizen-studio may exist, so the POSIX discovery tests only run elsewhere.
describe.skipIf(process.platform === 'win32')('findTizenCli / findSdb (Linux layout)', () => {
  let home: string;
  beforeEach(() => {
    home = tempDir('probe-home-');
  });

  it('returns null when nothing is installed', () => {
    cleanEnv(home);
    expect(tizen.findTizenCli(undefined)).toBeNull();
    expect(tizen.findSdb(null, undefined)).toBeNull();
  });

  it('explicit override / TIZEN_CLI must exist', () => {
    const cli = join(home, 'custom', 'tizen');
    writeExecutable(cli, 'exit 0\n');
    cleanEnv(home);
    expect(tizen.findTizenCli(cli)).toBe(cli);
    expect(tizen.findTizenCli(join(home, 'missing'))).toBeNull();
    process.env['TIZEN_CLI'] = cli;
    expect(tizen.findTizenCli(undefined)).toBe(cli);
    process.env['TIZEN_CLI'] = join(home, 'missing');
    expect(tizen.findTizenCli(undefined)).toBeNull(); // explicit but missing → no silent fallback
  });

  it('searches PATH', () => {
    const bin = join(home, 'bin');
    writeExecutable(join(bin, 'tizen'), 'exit 0\n');
    writeExecutable(join(bin, 'sdb'), 'exit 0\n');
    cleanEnv(home, { PATH: join(home, 'empty') + delimiter + bin });
    expect(tizen.findTizenCli(undefined)).toBe(join(bin, 'tizen'));
    expect(tizen.findSdb(null, undefined)).toBe(join(bin, 'sdb'));
  });

  it('ignores directories named like the CLI on PATH', () => {
    const bin = join(home, 'bin');
    mkdirSync(join(bin, 'tizen'), { recursive: true });
    cleanEnv(home, { PATH: bin });
    expect(tizen.findTizenCli(undefined)).toBeNull();
  });

  it('finds the CLI in TIZEN_SDK / ~/tizen-studio and sdb next to it', () => {
    const sdk = join(home, 'sdk');
    writeExecutable(join(sdk, 'tools', 'ide', 'bin', 'tizen'), 'exit 0\n');
    writeExecutable(join(sdk, 'tools', 'sdb'), 'exit 0\n');
    cleanEnv(home, { TIZEN_SDK: sdk });
    const cli = tizen.findTizenCli(undefined);
    expect(cli).toBe(join(sdk, 'tools', 'ide', 'bin', 'tizen'));
    expect(tizen.findSdb(cli, undefined)).toBe(join(sdk, 'tools', 'sdb'));
    expect(tizen.findSdb(null, undefined)).toBe(join(sdk, 'tools', 'sdb')); // via SDK roots

    const studio = join(home, 'tizen-studio');
    writeExecutable(join(studio, 'tools', 'ide', 'bin', 'tizen'), 'exit 0\n');
    cleanEnv(home);
    expect(tizen.findTizenCli(undefined)).toBe(join(studio, 'tools', 'ide', 'bin', 'tizen'));
  });

  it('TIZEN_SDB / --sdb override wins and must exist', () => {
    const sdb = join(home, 'x', 'sdb');
    writeExecutable(sdb, 'exit 0\n');
    cleanEnv(home, { TIZEN_SDB: sdb });
    expect(tizen.findSdb(null, undefined)).toBe(sdb);
    expect(tizen.findSdb(null, join(home, 'nope'))).toBeNull();
  });
});

// Simulated on POSIX hosts; on a real Windows machine the result would depend on the SDKs installed there.
describe.skipIf(process.platform === 'win32')('findTizenCli / findSdb / run on (simulated) Windows', () => {
  const realPlatform = process.platform;
  let win: typeof tizen;
  let home: string;

  beforeEach(async () => {
    home = tempDir('probe-winhome-');
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    vi.resetModules();
    win = await import('../scripts/lib/tizen.mjs');
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: realPlatform, configurable: true });
    vi.resetModules();
  });

  it('detects Windows', () => {
    expect(win.IS_WINDOWS).toBe(true);
  });

  it('looks for tizen.bat / tizen.cmd on PATH and in the SDK, and sdb.exe next to it', () => {
    const bin = join(home, 'bin');
    writeExecutable(join(bin, 'tizen'), 'exit 0\n'); // a POSIX-style name must not be picked on Windows
    cleanEnv(home, { PATH: bin });
    expect(win.findTizenCli(undefined)).toBeNull();
    writeExecutable(join(bin, 'tizen.cmd'), 'exit 0\n');
    expect(win.findTizenCli(undefined)).toBe(join(bin, 'tizen.cmd'));
    writeExecutable(join(bin, 'tizen.bat'), 'exit 0\n');
    expect(win.findTizenCli(undefined)).toBe(join(bin, 'tizen.bat')); // .bat preferred

    const sdk = join(home, 'tizen-studio');
    writeExecutable(join(sdk, 'tools', 'ide', 'bin', 'tizen.bat'), 'exit 0\n');
    writeExecutable(join(sdk, 'tools', 'sdb.exe'), 'exit 0\n');
    cleanEnv(home);
    const cli = win.findTizenCli(undefined);
    expect(cli).toBe(join(sdk, 'tools', 'ide', 'bin', 'tizen.bat'));
    expect(win.findSdb(cli, undefined)).toBe(join(sdk, 'tools', 'sdb.exe'));
  });

  it('checks %LOCALAPPDATA%\\tizen-studio', () => {
    const local = join(home, 'AppData', 'Local');
    writeExecutable(join(local, 'tizen-studio', 'tools', 'ide', 'bin', 'tizen.bat'), 'exit 0\n');
    cleanEnv(home, { LOCALAPPDATA: local });
    expect(win.findTizenCli(undefined)).toBe(join(local, 'tizen-studio', 'tools', 'ide', 'bin', 'tizen.bat'));
  });

  it('prints cmd.exe-quoted command lines', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const r = win.run('C:\\Program Files\\tizen-studio\\tools\\ide\\bin\\tizen.bat', ['package', '-s', 'my profile', '--', 'C:\\x\\dist'], {
      dryRun: true,
    });
    expect(r).toEqual({ status: 0, output: '' });
    expect(log).toHaveBeenCalledWith('$ "C:\\Program Files\\tizen-studio\\tools\\ide\\bin\\tizen.bat" package -s "my profile" -- C:\\x\\dist');
  });

  it('runs .bat files through the shell as one quoted command line (spaces preserved)', () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const bat = join(home, 'fake tizen.bat');
    writeExecutable(bat, 'for a in "$@"; do echo "[$a]"; done\n');
    // The module decided IS_WINDOWS at import; Node picks the shell at call time, so let it use /bin/sh here
    // (it parses the double-quoted, space-separated command line the same way cmd.exe does for these args).
    Object.defineProperty(process, 'platform', { value: realPlatform, configurable: true });
    const r = win.run(bat, ['install', '-n', 'Input Probe.wgt', '-s', '10.0.0.5:26101'], { allowFail: true });
    expect(r.status).toBe(0);
    expect(r.output.trim().split('\n')).toEqual(['[install]', '[-n]', '[Input Probe.wgt]', '[-s]', '[10.0.0.5:26101]']);
  });
});

describe('cleanPackagingArtifacts / findWgts', () => {
  it('removes old packages and signatures but keeps app files', () => {
    const dir = tempDir('probe-dist-');
    const files = [
      'index.html',
      'app.js',
      'app.css',
      'config.xml',
      'icon.png',
      'Old.wgt',
      'InputProbe.WGT',
      'author-signature.xml',
      'signature1.xml',
      'signature.xml',
      '.manifest.tmp',
      'mysignature1.xml',
    ];
    for (const f of files) writeFileSync(join(dir, f), 'x');
    tizen.cleanPackagingArtifacts(dir);
    expect(readdirSync(dir).sort()).toEqual(['app.css', 'app.js', 'config.xml', 'icon.png', 'index.html', 'mysignature1.xml']);
  });

  it('is a no-op for a missing directory', () => {
    expect(() => tizen.cleanPackagingArtifacts(join(tempDir(), 'missing'))).not.toThrow();
    expect(tizen.findWgts(join(tempDir(), 'missing'))).toEqual([]);
  });

  it('lists .wgt files newest first (case-insensitive extension)', () => {
    const dir = tempDir('probe-wgts-');
    const now = Date.now() / 1000;
    const mk = (name: string, age: number): void => {
      writeFileSync(join(dir, name), 'x');
      utimesSync(join(dir, name), now - age, now - age);
    };
    mk('a.wgt', 300);
    mk('b.WGT', 10);
    mk('c.wgt', 100);
    mk('d.txt', 0);
    expect(tizen.findWgts(dir)).toEqual([join(dir, 'b.WGT'), join(dir, 'c.wgt'), join(dir, 'a.wgt')]);
  });
});

describe('run', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  it('returns combined output and status 0', () => {
    const r = tizen.run(process.execPath, ['-e', 'console.log("out"); console.error("err")']);
    expect(r.status).toBe(0);
    expect(r.output).toContain('out');
    expect(r.output).toContain('err');
  });

  it('allowFail returns non-zero statuses instead of exiting', () => {
    expect(tizen.run(process.execPath, ['-e', 'process.exit(3)'], { allowFail: true }).status).toBe(3);
  });

  it('allowFail reports a missing executable as status -1', () => {
    const r = tizen.run(join(tempDir(), 'does-not-exist'), [], { allowFail: true });
    expect(r.status).toBe(-1);
    expect(r.output).toMatch(/ENOENT/);
  });

  it.skipIf(process.platform === 'win32')('dryRun prints but does not execute', () => {
    const log = vi.mocked(console.log);
    const r = tizen.run('/definitely/missing/tizen', ['package', 'a b'], { dryRun: true });
    expect(r).toEqual({ status: 0, output: '' });
    expect(log).toHaveBeenCalledWith('$ /definitely/missing/tizen package "a b"');
  });
});

describe('TIZEN_CLI_HINT', () => {
  it('explains how to point the scripts at tizen.bat', () => {
    expect(tizen.TIZEN_CLI_HINT).toContain('TIZEN_CLI');
    expect(tizen.TIZEN_CLI_HINT).toContain('tizen.bat');
  });
});
