#!/usr/bin/env node
/**
 * Runs one of the webOS CLI wrappers (`webos-package.mjs`, `webos-install.mjs`, `webos-run.mjs`) on
 * the **TV render bench's stub** instead of the game (plan R0-02): `dist-bench/`, the `.ipk` in
 * `release/bench/`, app id `dev.shmupcup.renderbench` — so it installs next to the game.
 *
 * Usage (after `pnpm bench:tv`): `pnpm --filter @shmup/webos bench:package`, then
 * `WEBOS_DEVICE=<name> pnpm --filter @shmup/webos bench:install` and `… bench:run`.
 *
 * Sets `WEBOS_DIST_DIR`, `WEBOS_RELEASE_DIR` and `WEBOS_APP_ID` (see `webos-env.mjs`) in its own
 * process — cross-platform, where `VAR=value cmd` is not — then loads the chosen script; an
 * explicit value still wins. **Like everything webOS here: written, never run** (no LG hardware,
 * no developer account — plan M3-03).
 *
 * @module
 */
import { BENCH_APPINFO_ID } from './appinfo.mjs';

/** The wrapper scripts this one can run, by command. */
export const BENCH_COMMANDS = Object.freeze({
  package: './webos-package.mjs',
  install: './webos-install.mjs',
  run: './webos-run.mjs',
});

/**
 * The environment the wrappers see for the bench.
 *
 * @param {Record<string, string | undefined>} env - The current environment.
 * @returns {Record<string, string>} `WEBOS_DIST_DIR`, `WEBOS_RELEASE_DIR`, `WEBOS_APP_ID`, an
 *   explicit value kept.
 */
export function benchEnv(env) {
  return {
    WEBOS_DIST_DIR: env.WEBOS_DIST_DIR || 'dist-bench',
    WEBOS_RELEASE_DIR: env.WEBOS_RELEASE_DIR || 'release/bench',
    WEBOS_APP_ID: env.WEBOS_APP_ID || BENCH_APPINFO_ID,
  };
}

/**
 * Command-line entry point.
 *
 * @param {string | undefined} command - `package`, `install` or `run`.
 * @returns {Promise<void>} Resolves once the chosen script has run (it exits on failure).
 */
async function main(command) {
  const script =
    command !== undefined && Object.prototype.hasOwnProperty.call(BENCH_COMMANDS, command)
      ? BENCH_COMMANDS[/** @type {keyof typeof BENCH_COMMANDS} */ (command)]
      : null;
  if (script === null) {
    console.error('Usage: node scripts/webos-bench.mjs <package|install|run>');
    process.exit(1);
  }
  Object.assign(process.env, benchEnv(process.env));
  await import(script);
}

/** `true` when run as a script (`node scripts/webos-bench.mjs …`), `false` when imported. */
const isMain =
  process.argv[1] !== undefined && /webos-bench\.mjs$/.test(process.argv[1].replace(/\\/g, '/'));
if (isMain) await main(process.argv[2]);
