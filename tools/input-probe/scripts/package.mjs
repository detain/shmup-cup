#!/usr/bin/env node
/**
 * Build + package the input probe into a signed widget: dist/InputProbe.wgt
 *
 *   build (vite) → check:compat → tizen package -t wgt -s $TIZEN_PROFILE -- dist
 *
 * Works on Windows (tizen.bat via cmd.exe), Linux and macOS.
 *
 * Usage:
 *   npm run package
 *   npm run package -- --profile shmupcup      (instead of TIZEN_PROFILE)
 *   npm run package -- --skip-build            (package the existing dist/)
 *   npm run package -- --tizen "C:\tizen-studio\tools\ide\bin\tizen.bat"   (instead of TIZEN_CLI)
 *   npm run package -- --dry-run               (print the commands only)
 *
 * Exit code 0 on success; 1 (with a hint) when the profile / CLI is missing or packaging fails. Set
 * VITE_REPORT_URL before running to bake the log-server URL into the build.
 *
 * @module scripts/package
 */

import { packageWgt, parseArgs } from './lib/tizen.mjs';

/** Parsed command-line options. */
const args = parseArgs(process.argv.slice(2));

if (args.help || args.h) {
  console.log('usage: node scripts/package.mjs [--profile <name>] [--skip-build] [--tizen <path>] [--dry-run]');
  process.exit(0);
}

await packageWgt({
  profile: typeof args.profile === 'string' ? args.profile : undefined,
  tizen: typeof args.tizen === 'string' ? args.tizen : undefined,
  skipBuild: Boolean(args['skip-build']),
  dryRun: Boolean(args['dry-run']),
});
