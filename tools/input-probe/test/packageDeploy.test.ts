/**
 * scripts/package.mjs and scripts/deploy.mjs as child processes, run from a temporary copy of the project so
 * the real dist/ is never touched. No Tizen SDK exists here: dry runs need none, and full runs use fake
 * `tizen` / `sdb` executables in a fake SDK layout (`<sdk>/tools/ide/bin/tizen`, `<sdk>/tools/sdb`) that log
 * their arguments. POSIX-only (the fakes are shell scripts).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import { copyScriptsProject, isolatedEnv, runNode, tempDir, writeExecutable } from './helpers/project';

interface Sandbox {
  root: string;
  dist: string;
  home: string;
  sdk: string;
  callLog: string;
  pkg: (args: string[], env?: Record<string, string>) => ReturnType<typeof runNode>;
  deploy: (args: string[], env?: Record<string, string>) => ReturnType<typeof runNode>;
  calls: () => string[];
}

function sandbox(): Sandbox {
  const root = copyScriptsProject();
  const home = tempDir('probe-home-');
  const sdk = join(home, 'fake-sdk');
  const callLog = join(home, 'calls.log');
  const env = (extra: Record<string, string> = {}): NodeJS.ProcessEnv => isolatedEnv(home, { CALL_LOG: callLog, ...extra });
  return {
    root,
    dist: join(root, 'dist'),
    home,
    sdk,
    callLog,
    pkg: (args, extra) => runNode(join(root, 'scripts', 'package.mjs'), args, { cwd: root, env: env(extra) }),
    deploy: (args, extra) => runNode(join(root, 'scripts', 'deploy.mjs'), args, { cwd: root, env: env(extra) }),
    calls: () => (existsSync(callLog) ? readFileSync(callLog, 'utf8').trim().split('\n').filter(Boolean) : []),
  };
}

/**
 * Installs a fake SDK. `tizen package` writes `<dist>/InputProbe.wgt` (unless FAKE_NO_WGT is set); `tizen install`
 * prints FAKE_INSTALL_OUTPUT; `sdb connect` fails for serials listed in FAKE_SDB_FAIL.
 */
function installFakeSdk(sb: Sandbox): void {
  writeExecutable(
    join(sb.sdk, 'tools', 'ide', 'bin', 'tizen'),
    [
      'echo "tizen $*" >> "$CALL_LOG"',
      'for a in "$@"; do last="$a"; done',
      'case "$1" in',
      '  package)',
      '    if [ -n "$FAKE_PACKAGE_FAIL" ]; then echo "error: profile not found"; exit 1; fi',
      '    if [ -z "$FAKE_NO_WGT" ]; then : > "$last/InputProbe.wgt"; echo "Package File Location: $last/InputProbe.wgt"; fi',
      '    ;;',
      '  install) echo "${FAKE_INSTALL_OUTPUT:-Installed the package: Id(ShmpCpIPrb) ... successfully installed}" ;;',
      '  run) echo "Launched the application with id: ShmpCpIPrb.InputProbe" ;;',
      'esac',
      'exit 0',
      '',
    ].join('\n'),
  );
  writeExecutable(
    join(sb.sdk, 'tools', 'sdb'),
    [
      'echo "sdb $*" >> "$CALL_LOG"',
      'if [ "$1" = connect ]; then',
      '  case " $FAKE_SDB_FAIL " in *" $2 "*) echo "failed to connect to $2"; exit 1 ;; esac',
      '  echo "connected to $2"',
      'fi',
      'exit 0',
      '',
    ].join('\n'),
  );
}

describe.skipIf(process.platform === 'win32')('package.mjs', () => {
  let sb: Sandbox;
  beforeEach(() => {
    sb = sandbox();
  });

  it.each([['--help'], ['-h']])('%s prints usage', (flag) => {
    const r = sb.pkg([flag]);
    expect(r.status).toBe(0);
    expect(r.all).toContain('usage: node scripts/package.mjs');
  });

  it('requires a certificate profile', () => {
    const r = sb.pkg(['--dry-run']);
    expect(r.status).toBe(1);
    expect(r.all).toContain('no certificate profile: set TIZEN_PROFILE');
    expect(r.all).toContain('Certificate Manager');
  });

  it('dry run: prints build + `tizen package -t wgt -s <profile> -- dist`', () => {
    const r = sb.pkg(['--dry-run', '--profile', 'shmupcup']);
    expect(r.status).toBe(0);
    expect(r.all).toContain('(dry run) vite build');
    expect(r.all).toContain('$ tizen package -t wgt -s shmupcup -- ' + sb.dist);
  });

  it('TIZEN_PROFILE is used when --profile is absent; --profile wins', () => {
    expect(sb.pkg(['--dry-run', '--skip-build'], { TIZEN_PROFILE: 'envprof' }).all).toContain('-s envprof --');
    expect(sb.pkg(['--dry-run', '--skip-build', '--profile=cli'], { TIZEN_PROFILE: 'envprof' }).all).toContain('-s cli --');
  });

  it('regression: a dry run does not delete existing packages or signatures from dist/', () => {
    writeFileSync(join(sb.dist, 'InputProbe.wgt'), 'old');
    writeFileSync(join(sb.dist, 'author-signature.xml'), 'sig');
    const r = sb.pkg(['--dry-run', '--skip-build', '--profile', 'p']);
    expect(r.status).toBe(0);
    expect(existsSync(join(sb.dist, 'InputProbe.wgt'))).toBe(true);
    expect(existsSync(join(sb.dist, 'author-signature.xml'))).toBe(true);
  });

  it('fails clearly when the Tizen CLI cannot be found', () => {
    const r = sb.pkg(['--skip-build', '--profile', 'p']);
    expect(r.status).toBe(1);
    expect(r.all).toContain('Tizen CLI not found');
    expect(r.all).toContain('TIZEN_CLI');
    expect(sb.pkg(['--skip-build', '--profile', 'p', '--tizen', join(sb.home, 'nope.bat')]).all).toContain('Tizen CLI not found');
  });

  it('--skip-build refuses an empty dist/', () => {
    installFakeSdk(sb);
    const r = sb.pkg(['--skip-build', '--profile', 'p'], { TIZEN_SDK: sb.sdk });
    expect(r.status).toBe(1);
    expect(r.all).toContain('dist/ is empty');
  });

  it('packages dist/ with the CLI found in TIZEN_SDK, after cleaning old artifacts', () => {
    installFakeSdk(sb);
    writeFileSync(join(sb.dist, 'index.html'), '<!doctype html>');
    writeFileSync(join(sb.dist, 'Stale.wgt'), 'old');
    writeFileSync(join(sb.dist, 'signature1.xml'), 'sig');
    const r = sb.pkg(['--skip-build', '--profile', 'shmupcup'], { TIZEN_SDK: sb.sdk });
    expect(r.all).toContain('Package: ' + join(sb.dist, 'InputProbe.wgt'));
    expect(r.status).toBe(0);
    expect(sb.calls()).toEqual(['tizen package -t wgt -s shmupcup -- ' + sb.dist]);
    expect(existsSync(join(sb.dist, 'Stale.wgt'))).toBe(false);
    expect(existsSync(join(sb.dist, 'signature1.xml'))).toBe(false);
    expect(existsSync(join(sb.dist, 'index.html'))).toBe(true);
  });

  it('reports a failing `tizen package`', () => {
    installFakeSdk(sb);
    writeFileSync(join(sb.dist, 'index.html'), '');
    const r = sb.pkg(['--skip-build', '--profile', 'p'], { TIZEN_SDK: sb.sdk, FAKE_PACKAGE_FAIL: '1' });
    expect(r.status).toBe(1);
    expect(r.all).toContain('exited with code 1');
  });

  it('reports packaging that produced no .wgt', () => {
    installFakeSdk(sb);
    writeFileSync(join(sb.dist, 'index.html'), '');
    const r = sb.pkg(['--skip-build', '--profile', 'p'], { TIZEN_SDK: sb.sdk, FAKE_NO_WGT: '1' });
    expect(r.status).toBe(1);
    expect(r.all).toContain('packaging failed — no .wgt produced');
  });
});

describe.skipIf(process.platform === 'win32')('deploy.mjs', () => {
  let sb: Sandbox;
  beforeEach(() => {
    sb = sandbox();
  });

  it.each([['--help'], ['-h']])('%s prints usage', (flag) => {
    const r = sb.deploy([flag]);
    expect(r.status).toBe(0);
    expect(r.all).toContain('usage: node scripts/deploy.mjs');
  });

  it('requires a target IP', () => {
    const r = sb.deploy(['--dry-run']);
    expect(r.status).toBe(1);
    expect(r.all).toContain('no target: set TV_IP');
    expect(r.all).toContain('Developer Mode');
  });

  it('dry run for two monitors: package (no .wgt yet), then connect/install/run each, default port 26101', () => {
    const r = sb.deploy(['--dry-run', '--ip', '192.168.1.50, 192.168.1.51:5555'], { TIZEN_PROFILE: 'p' });
    expect(r.status).toBe(0);
    const cmds = r.all.split('\n').filter((l) => l.startsWith('$ '));
    expect(cmds).toEqual([
      '$ tizen package -t wgt -s p -- ' + sb.dist,
      '$ sdb connect 192.168.1.50:26101',
      '$ tizen install -n InputProbe.wgt -s 192.168.1.50:26101 -- ' + sb.dist,
      '$ tizen run -p ShmpCpIPrb.InputProbe -s 192.168.1.50:26101',
      '$ sdb connect 192.168.1.51:5555',
      '$ tizen install -n InputProbe.wgt -s 192.168.1.51:5555 -- ' + sb.dist,
      '$ tizen run -p ShmpCpIPrb.InputProbe -s 192.168.1.51:5555',
    ]);
    expect(r.all).toContain('Done: 192.168.1.50:26101, 192.168.1.51:5555');
  });

  it('uses TV_IP, an existing .wgt (no packaging), and --no-run', () => {
    writeFileSync(join(sb.dist, 'InputProbe.wgt'), 'pkg');
    const r = sb.deploy(['--dry-run', '--no-run'], { TV_IP: '10.0.0.7;10.0.0.8' });
    expect(r.status).toBe(0);
    const cmds = r.all.split('\n').filter((l) => l.startsWith('$ '));
    expect(cmds).toEqual([
      '$ sdb connect 10.0.0.7:26101',
      '$ tizen install -n InputProbe.wgt -s 10.0.0.7:26101 -- ' + sb.dist,
      '$ sdb connect 10.0.0.8:26101',
      '$ tizen install -n InputProbe.wgt -s 10.0.0.8:26101 -- ' + sb.dist,
    ]);
    expect(existsSync(join(sb.dist, 'InputProbe.wgt'))).toBe(true);
  });

  it('--package forces repackaging even when a .wgt exists', () => {
    writeFileSync(join(sb.dist, 'InputProbe.wgt'), 'pkg');
    const r = sb.deploy(['--dry-run', '--package', '--profile', 'x', '--ip', '10.0.0.7']);
    expect(r.all).toContain('$ tizen package -t wgt -s x -- ' + sb.dist);
    expect(existsSync(join(sb.dist, 'InputProbe.wgt'))).toBe(true);
  });

  it('fails clearly without the CLI or sdb', () => {
    expect(sb.deploy(['--ip', '10.0.0.7']).all).toContain('Tizen CLI not found');
    const cliOnly = join(sb.home, 'cli-only', 'tizen');
    writeExecutable(cliOnly, 'exit 0\n');
    const r = sb.deploy(['--ip', '10.0.0.7', '--tizen', cliOnly]);
    expect(r.status).toBe(1);
    expect(r.all).toContain('sdb not found');
    installFakeSdk(sb);
    expect(sb.deploy(['--ip', '10.0.0.7', '--sdb', join(sb.home, 'nope')], { TIZEN_SDK: sb.sdk }).all).toContain('sdb not found');
  });

  it('full run with a fake SDK: connect, list devices, install and launch on every monitor', () => {
    installFakeSdk(sb);
    writeFileSync(join(sb.dist, 'InputProbe.wgt'), 'pkg');
    const r = sb.deploy(['--ip', '10.0.0.7,10.0.0.8'], { TIZEN_SDK: sb.sdk });
    expect(r.all).toContain('Done: 10.0.0.7:26101, 10.0.0.8:26101');
    expect(r.status).toBe(0);
    expect(sb.calls()).toEqual([
      'sdb connect 10.0.0.7:26101',
      'sdb devices',
      'tizen install -n InputProbe.wgt -s 10.0.0.7:26101 -- ' + sb.dist,
      'tizen run -p ShmpCpIPrb.InputProbe -s 10.0.0.7:26101',
      'sdb connect 10.0.0.8:26101',
      'sdb devices',
      'tizen install -n InputProbe.wgt -s 10.0.0.8:26101 -- ' + sb.dist,
      'tizen run -p ShmpCpIPrb.InputProbe -s 10.0.0.8:26101',
    ]);
  });

  it('a monitor that cannot be reached is reported, the other one is still deployed', () => {
    installFakeSdk(sb);
    writeFileSync(join(sb.dist, 'InputProbe.wgt'), 'pkg');
    const r = sb.deploy(['--ip', '10.0.0.7,10.0.0.8'], { TIZEN_SDK: sb.sdk, FAKE_SDB_FAIL: '10.0.0.7:26101' });
    expect(r.status).toBe(1);
    expect(r.all).toContain('deploy finished with errors');
    expect(r.all).toContain('10.0.0.7:26101: sdb connect failed');
    expect(r.all).toContain('Could not connect');
    const calls = sb.calls();
    expect(calls.some((c) => c.startsWith('tizen install') && c.includes('10.0.0.7'))).toBe(false);
    expect(calls).toContain('tizen run -p ShmpCpIPrb.InputProbe -s 10.0.0.8:26101');
  });

  it('an install failure is reported with certificate hints and the app is not launched', () => {
    installFakeSdk(sb);
    writeFileSync(join(sb.dist, 'InputProbe.wgt'), 'pkg');
    const r = sb.deploy(['--ip', '10.0.0.7'], {
      TIZEN_SDK: sb.sdk,
      FAKE_INSTALL_OUTPUT: 'install failed[118, -12], reason: Check certificate error',
    });
    expect(r.status).toBe(1);
    expect(r.all).toContain('10.0.0.7:26101: install failed');
    expect(r.all).toContain("DUID");
    expect(sb.calls().some((c) => c.startsWith('tizen run'))).toBe(false);
  });

  it('dry run with an installed SDK shows the discovered CLI path and executes nothing', () => {
    installFakeSdk(sb);
    mkdirSync(sb.dist, { recursive: true });
    const r = sb.deploy(['--dry-run', '--ip', '10.0.0.7'], { TIZEN_SDK: sb.sdk, TIZEN_PROFILE: 'p' });
    expect(r.all).toContain('$ ' + join(sb.sdk, 'tools', 'ide', 'bin', 'tizen') + ' package -t wgt -s p -- ' + sb.dist);
    expect(r.all).toContain('install -n InputProbe.wgt -s 10.0.0.7:26101');
    expect(sb.calls()).toEqual([]); // dry run executes nothing
  });
});
