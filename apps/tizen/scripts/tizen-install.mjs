#!/usr/bin/env node
/**
 * Installs the packaged .wgt on a TV / Smart Monitor in Developer Mode:
 *   [sdb connect $TV_IP]
 *   tizen install -n <newest .wgt in dist> [-s <serial>] -- dist
 *
 * Usage: TV_IP=192.168.1.50 pnpm --filter @shmup/tizen tizen:install
 * (PowerShell: $env:TV_IP="192.168.1.50"; pnpm --filter @shmup/tizen tizen:install)
 * Run tizen:package first. See tizen-env.mjs for all environment variables. Not run in CI.
 */
import { DIST_DIR, findWgt, installableWgt, resolveTarget, run, tizenCli } from './tizen-env.mjs';

/** File name of the newest .wgt in dist/ (produced by tizen:package). */
const packaged = findWgt();
if (packaged === null) {
  console.error(`No .wgt found in ${DIST_DIR} — run tizen:package first.`);
  process.exit(1);
}
/** The same package without spaces in its name (a package made by hand may still have them). */
const wgt = installableWgt(packaged);
/** sdb serial of the monitor (after `sdb connect $TV_IP`), or null for the only device. */
const target = resolveTarget();
run(tizenCli(), ['install', '-n', wgt, ...(target ? ['-s', target] : []), '--', DIST_DIR]);
