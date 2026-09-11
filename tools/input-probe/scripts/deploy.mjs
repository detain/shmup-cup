#!/usr/bin/env node
/**
 * Install and launch the input probe on one or more Samsung TVs / Smart Monitors in Developer Mode:
 *
 *   sdb connect $TV_IP
 *   tizen install -n InputProbe.wgt -s <serial> -- dist
 *   tizen run -p ShmpCpIPrb.InputProbe -s <serial>
 *
 * The .wgt is packaged first (scripts/package.mjs logic) when dist/ has none, or when --package is given.
 * Works on Windows (tizen.bat via cmd.exe), Linux and macOS.
 *
 * Usage:
 *   set TV_IP=192.168.1.50            (PowerShell: $env:TV_IP="192.168.1.50")
 *   npm run deploy
 *   npm run deploy -- --ip 192.168.1.50,192.168.1.51   (both monitors)
 *   npm run deploy -- --package --profile shmupcup     (rebuild + repackage first)
 *   npm run deploy -- --no-run                         (install only)
 *   npm run deploy -- --dry-run                        (print the commands only)
 */

import { basename } from 'node:path';

import {
  APP_ID,
  DIST_DIR,
  die,
  findSdb,
  findTizenCli,
  findWgts,
  packageWgt,
  parseArgs,
  run,
  SDB_PORT,
  step,
  TIZEN_CLI_HINT,
} from './lib/tizen.mjs';

const args = parseArgs(process.argv.slice(2));
const dryRun = Boolean(args['dry-run']);

if (args.help || args.h) {
  console.log(
    'usage: node scripts/deploy.mjs [--ip <ip[:port]>[,<ip>...]] [--package] [--profile <name>] [--no-run]\n' +
      '                               [--tizen <path>] [--sdb <path>] [--dry-run]',
  );
  process.exit(0);
}

const ipSpec = typeof args.ip === 'string' ? args.ip : process.env.TV_IP;
if (!ipSpec) {
  die(
    'no target: set TV_IP (or pass --ip <address>)',
    'Find the IP on the monitor: Settings → General → Network → Network Status → IP Settings.\n' +
      'Developer Mode must point at THIS computer: Apps panel → type 12345 → Developer mode ON → Host PC IP.',
  );
}
/** Serial numbers as sdb shows them: ip:port. */
const serials = ipSpec
  .split(/[\s,;]+/)
  .filter(Boolean)
  .map((ip) => (ip.includes(':') ? ip : ip + ':' + SDB_PORT));

const tizenOverride = typeof args.tizen === 'string' ? args.tizen : undefined;
const cli = findTizenCli(tizenOverride) ?? (dryRun ? 'tizen' : null);
if (!cli) die('Tizen CLI not found', TIZEN_CLI_HINT);
const sdb = findSdb(cli === 'tizen' ? null : cli, typeof args.sdb === 'string' ? args.sdb : undefined) ?? (dryRun ? 'sdb' : null);
if (!sdb) die('sdb not found', 'Set TIZEN_SDB to the full path, e.g. C:\\tizen-studio\\tools\\sdb.exe');

let wgt = findWgts()[0];
if (args.package || !wgt) {
  wgt = await packageWgt({
    profile: typeof args.profile === 'string' ? args.profile : undefined,
    tizen: tizenOverride,
    dryRun,
  });
}
const wgtName = basename(wgt);

const failures = [];
for (const serial of serials) {
  step('Connecting to ' + serial);
  const conn = run(sdb, ['connect', serial], { dryRun, allowFail: true });
  if (!dryRun && (conn.status !== 0 || /fail|unable|error|refused/i.test(conn.output))) {
    failures.push(serial + ': sdb connect failed');
    console.error(
      'Could not connect. Check: monitor on & same LAN, Developer Mode enabled with this PC as Host PC IP,\n' +
        'monitor restarted after enabling Developer Mode, and no other PC holding the connection.',
    );
    continue;
  }
  if (!dryRun) run(sdb, ['devices'], { allowFail: true });

  step('Installing ' + wgtName + ' on ' + serial);
  const inst = run(cli, ['install', '-n', wgtName, '-s', serial, '--', DIST_DIR], { dryRun, allowFail: true });
  if (!dryRun && (inst.status !== 0 || (/failed|error/i.test(inst.output) && !/successfully installed|install completed/i.test(inst.output)))) {
    failures.push(serial + ': install failed');
    console.error(
      'Install failed. Common causes: the distributor certificate does not list this monitor\'s DUID\n' +
        '(re-create the Samsung certificate with both DUIDs), or an older build signed with a different\n' +
        'author certificate is installed (uninstall it on the monitor first).',
    );
    continue;
  }

  if (!args['no-run']) {
    step('Launching ' + APP_ID + ' on ' + serial);
    const r = run(cli, ['run', '-p', APP_ID, '-s', serial], { dryRun, allowFail: true });
    if (!dryRun && r.status !== 0) failures.push(serial + ': run failed');
  }
}

if (failures.length > 0) die('deploy finished with errors:\n  ' + failures.join('\n  '));
console.log('\nDone: ' + serials.join(', '));
