/**
 * Shared helpers for the LG webOS CLI wrapper scripts (package / install / launch).
 *
 * They drive the **webOS TV CLI** (`ares-package`, `ares-install`, `ares-launch`), which ships
 * with LG's webOS TV SDK. Cross-platform: on Windows the ares tools are `.cmd` files, which Node
 * can only start through a shell, so commands run with `shell: true` there.
 *
 * Environment variables (all optional unless noted):
 *   ARES_BIN     Directory holding the ares tools (default: they are on PATH).
 *   WEBOS_DEVICE Device name from `ares-setup-device` (REQUIRED for install / launch; the name
 *                you gave the TV when you paired it with its Developer Mode passphrase).
 *
 * **None of these scripts has ever been run.** The project has no LG hardware and no LG developer
 * account (plan M3-03), so they are written from LG's published CLI contract and checked only by
 * `test/scripts/webos-cli.test.ts`, which asserts the command lines they would build. Treat the
 * first real run as untested code.
 *
 * @module
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** apps/webos directory. */
export const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
/** Build output that gets packaged (contains appinfo.json, index.html, app.js, the icons). */
export const DIST_DIR = join(APP_DIR, 'dist');
/** Where `ares-package` writes the `.ipk` (git-ignored, like `apps/electron/release/`). */
export const RELEASE_DIR = join(APP_DIR, 'release');
/** webOS application id — `appinfo.json`'s `id`. */
export const APP_ID = 'dev.shmupcup.game';

/** `true` on Windows, where the ares tools are `.cmd` files and must run through a shell. */
const isWindows = process.platform === 'win32';

/**
 * The path of an ares tool to invoke.
 *
 * @param {string} name - Tool name without an extension, e.g. `ares-package`.
 * @returns {string} `$ARES_BIN/<name>` when `ARES_BIN` is set, else the bare name (PATH);
 *   `.cmd` is appended on Windows.
 *
 * @example
 * aresCli('ares-install'); // → 'ares-install' (or 'C:\\webOS_TV_SDK\\CLI\\bin\\ares-install.cmd')
 */
export function aresCli(name) {
  const file = isWindows ? `${name}.cmd` : name;
  const dir = process.env.ARES_BIN;
  return dir ? join(dir, file) : file;
}

/**
 * Reads a required environment variable or exits with a helpful message.
 *
 * @param {string} name - Variable name.
 * @param {string} hint - What the variable is for.
 * @returns {string} The value (an empty value counts as missing and exits with code 1).
 */
export function requireEnv(name, hint) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing environment variable ${name}: ${hint}`);
    process.exit(1);
  }
  return value;
}

/**
 * Quotes one argument for a Windows shell command line.
 *
 * @param {string} arg - Argument.
 * @returns {string} Quoted argument (only when it holds whitespace or cmd.exe metacharacters).
 */
function quoteForShell(arg) {
  return /[\s"&|<>^]/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg;
}

/**
 * Runs a command, streaming its output; exits the process on failure.
 *
 * @param {string} command - Executable.
 * @param {string[]} args - Arguments.
 * @param {{ cwd?: string }} [options] - Working directory.
 */
export function run(command, args, options = {}) {
  console.log(`> ${command} ${args.join(' ')}`);
  const result = isWindows
    ? spawnSync([command, ...args].map(quoteForShell).join(' '), {
        stdio: 'inherit',
        shell: true,
        cwd: options.cwd,
      })
    : spawnSync(command, args, { stdio: 'inherit', cwd: options.cwd });
  if (result.error) {
    console.error(`Failed to start ${command}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

/**
 * The most recently written `.ipk` in `release/`.
 *
 * @returns {string | null} File name (not path), or `null` when none exists.
 */
export function findIpk() {
  if (!existsSync(RELEASE_DIR)) return null;
  const candidates = readdirSync(RELEASE_DIR)
    .filter((file) => file.toLowerCase().endsWith('.ipk'))
    .map((file) => ({ file, time: statSync(join(RELEASE_DIR, file)).mtimeMs }))
    .sort((a, b) => b.time - a.time);
  return candidates.length > 0 ? candidates[0].file : null;
}

/** Deletes every `.ipk` in `release/` so an old package is never installed by mistake. */
export function removeIpks() {
  if (!existsSync(RELEASE_DIR)) return;
  for (const file of readdirSync(RELEASE_DIR)) {
    if (file.toLowerCase().endsWith('.ipk')) rmSync(join(RELEASE_DIR, file), { force: true });
  }
}

/**
 * Exits (code 1) unless `pnpm --filter @shmup/webos build` has produced dist/ — checks for
 * `dist/appinfo.json` and `dist/app.js`.
 */
export function requireBuild() {
  if (!existsSync(join(DIST_DIR, 'appinfo.json')) || !existsSync(join(DIST_DIR, 'app.js'))) {
    console.error('apps/webos/dist is missing — run `pnpm --filter @shmup/webos build` first.');
    process.exit(1);
  }
}

/**
 * The device name to target.
 *
 * @returns {string} `$WEBOS_DEVICE` (required — `ares-setup-device -list` shows the names).
 */
export function requireDevice() {
  return requireEnv(
    'WEBOS_DEVICE',
    'device name from `ares-setup-device` (the TV paired in Developer Mode).',
  );
}

/**
 * The command line `webos:package` would run, without running it (for the tests).
 *
 * @returns {{ command: string, args: string[] }} The `ares-package` invocation.
 */
export function packageCommand() {
  return { command: aresCli('ares-package'), args: [DIST_DIR, '-o', RELEASE_DIR] };
}

/**
 * The command line `webos:install` would run, without running it (for the tests).
 *
 * @param {string} device - Device name.
 * @param {string} ipk - `.ipk` file name in `release/`.
 * @returns {{ command: string, args: string[] }} The `ares-install` invocation.
 */
export function installCommand(device, ipk) {
  return { command: aresCli('ares-install'), args: ['--device', device, join(RELEASE_DIR, ipk)] };
}

/**
 * The command line `webos:run` would run, without running it (for the tests).
 *
 * @param {string} device - Device name.
 * @returns {{ command: string, args: string[] }} The `ares-launch` invocation.
 */
export function launchCommand(device) {
  return { command: aresCli('ares-launch'), args: ['--device', device, APP_ID] };
}
