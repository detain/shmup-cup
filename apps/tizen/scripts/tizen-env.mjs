/**
 * Shared helpers for the Tizen CLI wrapper scripts (package / install / run).
 *
 * Cross-platform: works from cmd.exe, PowerShell, macOS and Linux shells. On Windows the
 * Tizen CLI is a `.bat`, which Node can only start through a shell, so commands run with
 * `shell: true` there (arguments are quoted by {@link run}).
 *
 * Environment variables (all optional unless noted):
 *   TIZEN_CLI      Path to the `tizen` CLI (default: `tizen` / `tizen.bat` on PATH).
 *                  e.g. C:\tizen-studio\tools\ide\bin\tizen.bat
 *   SDB            Path to `sdb` (default: `sdb` on PATH). e.g. C:\tizen-studio\tools\sdb.exe
 *   TIZEN_PROFILE  Certificate profile name (REQUIRED for packaging; created in the
 *                  Certificate Manager with an author cert + Samsung distributor cert that
 *                  lists the monitors' DUIDs).
 *   TV_IP          IP of the TV / monitor in Developer Mode; install/run then `sdb connect` it.
 *   TIZEN_TARGET   sdb serial of the target (default: `${TV_IP}:26101`).
 *
 * These scripts are never run in CI (no Tizen CLI there).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** apps/tizen directory. */
export const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
/** Build output that gets packaged (contains config.xml, index.html, app.js, icon.png). */
export const DIST_DIR = join(APP_DIR, 'dist');
/** Tizen application id from public/config.xml (`<package>.<name>`). */
export const APP_ID = 'ShmpCupGam.ShmupCup';

/** `true` on Windows, where the Tizen CLI is a `.bat` and must run through a shell. */
const isWindows = process.platform === 'win32';

/**
 * The Tizen CLI to invoke.
 *
 * @returns {string} `$TIZEN_CLI` when set, else `tizen.bat` on Windows / `tizen` elsewhere
 *   (resolved through PATH).
 */
export function tizenCli() {
  return process.env.TIZEN_CLI || (isWindows ? 'tizen.bat' : 'tizen');
}

/**
 * The Smart Development Bridge (sdb) executable to invoke.
 *
 * @returns {string} `$SDB` when set, else `sdb` (resolved through PATH).
 */
export function sdbCli() {
  return process.env.SDB || 'sdb';
}

/**
 * Reads a required environment variable or exits with a helpful message.
 *
 * @remarks An empty value counts as missing. On failure the process exits with code 1
 * (these are CLI scripts), so callers never see an undefined value.
 *
 * @param {string} name - Variable name.
 * @param {string} hint - What the variable is for.
 * @returns {string} The value.
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
 * The sdb serial to target, connecting to TV_IP first when it is set.
 *
 * @remarks Side effect: runs `sdb connect $TV_IP` (exits the process if sdb cannot be
 * started or fails). `TIZEN_TARGET` wins over the `${TV_IP}:26101` default.
 *
 * @returns {string | null} The serial, or null to let the CLI pick the only device.
 */
export function resolveTarget() {
  const ip = process.env.TV_IP;
  if (ip) run(sdbCli(), ['connect', ip]);
  return process.env.TIZEN_TARGET || (ip ? `${ip}:26101` : null);
}

/**
 * Quotes one argument for a Windows shell command line.
 *
 * @remarks Only arguments containing whitespace or cmd.exe metacharacters are quoted;
 * embedded double quotes are backslash-escaped.
 *
 * @param {string} arg - Argument.
 * @returns {string} Quoted argument.
 *
 * @example
 * quoteForShell('C:\\My Certs'); // → '"C:\\My Certs"'
 */
function quoteForShell(arg) {
  return /[\s"&|<>^]/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg;
}

/**
 * Runs a command, streaming its output; exits the process on failure.
 *
 * @remarks Echoes the command line first. On Windows the command runs through the
 * shell (needed for `.bat` files) with every argument passed through quoteForShell.
 * If the executable cannot be started, or exits non-zero, this process exits with
 * code 1 / the child's exit code — it never returns on failure.
 *
 * @param {string} command - Executable.
 * @param {string[]} args - Arguments.
 * @param {{ cwd?: string }} [options] - Working directory.
 *
 * @example
 * run(tizenCli(), ['package', '-t', 'wgt', '-s', profile, '--', DIST_DIR]);
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
 * Finds the most recently written .wgt in dist/ (the CLI names it after `<name>` in
 * config.xml, so the exact file name is not hard-coded).
 *
 * @returns {string | null} File name (not path), or null when none exists.
 */
export function findWgt() {
  if (!existsSync(DIST_DIR)) return null;
  const candidates = readdirSync(DIST_DIR)
    .filter((file) => file.toLowerCase().endsWith('.wgt'))
    .map((file) => ({ file, time: statSync(join(DIST_DIR, file)).mtimeMs }))
    .sort((a, b) => b.time - a.time);
  return candidates.length > 0 ? candidates[0].file : null;
}

/**
 * Exits (code 1) unless `pnpm --filter @shmup/tizen build` has produced dist/ — checks
 * for `dist/config.xml` and `dist/app.js`.
 */
export function requireBuild() {
  if (!existsSync(join(DIST_DIR, 'config.xml')) || !existsSync(join(DIST_DIR, 'app.js'))) {
    console.error('apps/tizen/dist is missing — run `pnpm --filter @shmup/tizen build` first.');
    process.exit(1);
  }
}
