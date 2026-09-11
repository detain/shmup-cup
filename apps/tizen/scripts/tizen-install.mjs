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
import { DIST_DIR, findWgt, resolveTarget, run, tizenCli } from './tizen-env.mjs';

const wgt = findWgt();
if (wgt === null) {
  console.error(`No .wgt found in ${DIST_DIR} — run tizen:package first.`);
  process.exit(1);
}
const target = resolveTarget();
run(tizenCli(), ['install', '-n', wgt, ...(target ? ['-s', target] : []), '--', DIST_DIR]);
