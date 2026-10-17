#!/usr/bin/env node
/**
 * Runs one of the Tizen CLI wrappers (`tizen-package.mjs`, `tizen-install.mjs`, `tizen-run.mjs`) on
 * the **TV render bench** widget instead of the game (plan R0-02): `dist-bench/`, app id
 * `ShmpCupBnc.RenderBench` — so the bench installs next to the game and never replaces it.
 *
 * Usage (from the repo root, after `pnpm bench:tv`; PowerShell: `$env:NAME="value"; …`):
 *   TIZEN_PROFILE=<profile> pnpm bench:tv:package     → apps/tizen/dist-bench/ShmupCupBench.wgt
 *   TV_IP=<monitor ip> pnpm bench:tv:install
 *   TV_IP=<monitor ip> pnpm --filter @shmup/tizen bench:run
 *
 * Cross-platform on purpose (the owner runs it from a Windows desktop): it sets `TIZEN_DIST_DIR`
 * and `TIZEN_APP_ID` (see `tizen-env.mjs`) in its own process, where `VAR=value cmd` would not work
 * in cmd.exe, then loads the chosen script. An explicit `TIZEN_DIST_DIR` / `TIZEN_APP_ID` still
 * wins. **Never run in CI, and never run here** — there is no Tizen CLI, no `sdb` and no TV.
 *
 * @module
 */
import { BENCH_APP_ID } from './config-xml.mjs';

/** The wrapper scripts this one can run, by command. */
export const BENCH_COMMANDS = Object.freeze({
  package: './tizen-package.mjs',
  install: './tizen-install.mjs',
  run: './tizen-run.mjs',
});

/** The bench widget's build folder, relative to apps/tizen. */
export const BENCH_DIST = 'dist-bench';

/**
 * The environment the wrappers see for the bench.
 *
 * @param {Record<string, string | undefined>} env - The current environment.
 * @returns {Record<string, string>} `TIZEN_DIST_DIR` and `TIZEN_APP_ID`, an explicit value kept.
 *
 * @example
 * benchEnv({}); // → { TIZEN_DIST_DIR: 'dist-bench', TIZEN_APP_ID: 'ShmpCupBnc.RenderBench' }
 */
export function benchEnv(env) {
  return {
    TIZEN_DIST_DIR: env.TIZEN_DIST_DIR || BENCH_DIST,
    TIZEN_APP_ID: env.TIZEN_APP_ID || BENCH_APP_ID,
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
    console.error('Usage: node scripts/tizen-bench.mjs <package|install|run>');
    process.exit(1);
  }
  Object.assign(process.env, benchEnv(process.env));
  await import(script);
}

/** `true` when run as a script (`node scripts/tizen-bench.mjs …`), `false` when imported. */
const isMain =
  process.argv[1] !== undefined && /tizen-bench\.mjs$/.test(process.argv[1].replace(/\\/g, '/'));
if (isMain) await main(process.argv[2]);
