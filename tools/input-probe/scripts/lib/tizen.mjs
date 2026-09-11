/**
 * Shared helpers for scripts/package.mjs and scripts/deploy.mjs — cross-platform (Windows first).
 *
 * - Locates the Tizen CLI (`tizen.bat` on Windows, `tizen` elsewhere) and `sdb`.
 * - Runs them safely: Windows `.bat`/`.cmd` files must go through `cmd.exe` (Node refuses to spawn them
 *   directly since the 2024 CVE-2024-27980 fix), so arguments are quoted for cmd.exe explicitly.
 * - Builds the app with Vite's JS API (no `npm` shell-out) and packages `dist/` into a signed `.wgt`.
 *
 * Environment variables:
 *   TIZEN_CLI      full path to tizen / tizen.bat (overrides auto-detection)
 *   TIZEN_SDB      full path to sdb / sdb.exe (default: <sdk>/tools/sdb[.exe], then PATH)
 *   TIZEN_SDK      Tizen Studio / SDK root (e.g. C:\tizen-studio) used for auto-detection
 *   TIZEN_STUDIO   alternative name for TIZEN_SDK (checked second)
 *   TIZEN_PROFILE  certificate (security) profile name for `tizen package -s`
 *   TV_IP          TV / monitor IP(s) for deploy.mjs, comma- or space-separated, optional :port
 *
 * CLI discovery order: `--tizen` / TIZEN_CLI → PATH → `<root>/tools/ide/bin/` under TIZEN_SDK, TIZEN_STUDIO,
 * then the default install folders (Windows: C:\tizen-studio, C:\tizen-sdk, %USERPROFILE%\tizen-studio,
 * %USERPROFILE%\tizen-sdk, %LOCALAPPDATA%\tizen-studio; elsewhere: ~/tizen-studio, ~/tizen-sdk,
 * /opt/tizen-studio).
 *
 * The module is written for Node ≥ 20 and has no dependencies besides Vite (loaded lazily by
 * {@link buildApp}). It is covered by `test/tizenLib.test.ts` and `test/packageDeploy.test.ts`, which run it
 * against fake `tizen` / `sdb` executables — no SDK needed.
 *
 * @module scripts/lib/tizen
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** True on Windows. */
export const IS_WINDOWS = process.platform === 'win32';

/** tools/input-probe (the project root of these scripts). */
export const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Build output directory that gets packaged. */
export const DIST_DIR = join(PROJECT_ROOT, 'dist');

/** Tizen application id from public/config.xml. */
export const APP_ID = 'ShmpCpIPrb.InputProbe';

/** Expected package file name (`<name>` in config.xml + .wgt). */
export const WGT_NAME = 'InputProbe.wgt';

/** Default sdb port of Samsung TVs in Developer Mode. */
export const SDB_PORT = 26101;

/**
 * Prints a step header (cyan `==> msg`, preceded by a blank line).
 *
 * @param {string} msg - step description.
 * @returns {void}
 */
export function step(msg) {
  console.log('\n\x1b[36m==> ' + msg + '\x1b[0m');
}

/**
 * Prints an error (red) plus an optional hint and exits the process with code 1.
 *
 * @param {string} msg - what went wrong.
 * @param {string} [hint] - how to fix it (printed as-is below the error).
 * @returns {never}
 */
export function die(msg, hint) {
  console.error('\n\x1b[31mERROR: ' + msg + '\x1b[0m');
  if (hint) console.error(hint);
  process.exit(1);
}

/**
 * Parses `--flag`, `--key value` and `--key=value` arguments (plus `-h` as `h`).
 *
 * Only the names in {@link VALUE_FLAGS} consume the following argument as their value; every other
 * `--name` is a boolean flag. Positional arguments are ignored.
 *
 * @param {string[]} argv - arguments after the script name (`process.argv.slice(2)`).
 * @returns {Record<string, string | boolean>} parsed options.
 *
 * @example
 * parseArgs(['--ip', '192.168.1.50', '--no-run', '--profile=shmupcup']);
 * // { ip: '192.168.1.50', 'no-run': true, profile: 'shmupcup' }
 */
export function parseArgs(argv) {
  /** @type {Record<string, string | boolean>} */
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h') out.h = true;
    if (!a.startsWith('--')) continue;
    const eq = a.indexOf('=');
    if (eq > 0) out[a.slice(2, eq)] = a.slice(eq + 1);
    else if (i + 1 < argv.length && !argv[i + 1].startsWith('--') && VALUE_FLAGS.has(a.slice(2))) out[a.slice(2)] = argv[++i];
    else out[a.slice(2)] = true;
  }
  return out;
}
/** Options that take a value (`--name value`); all others are booleans. */
const VALUE_FLAGS = new Set(['profile', 'ip', 'tizen', 'sdb']);

/**
 * Searches PATH for the first existing file among `names` (directory order first, then name order).
 *
 * @param {string[]} names - candidate file names, e.g. `['tizen.bat', 'tizen.cmd']`.
 * @returns {string | null} full path, or null when not found. Quoted PATH entries (Windows) are handled.
 */
function whichAny(names) {
  const dirs = (process.env.PATH ?? '').split(delimiter).filter(Boolean);
  for (const d of dirs) {
    for (const n of names) {
      const p = join(d.replace(/^"|"$/g, ''), n);
      if (existsSync(p) && statSync(p).isFile()) return p;
    }
  }
  return null;
}

/**
 * Candidate SDK roots, most specific first: TIZEN_SDK, TIZEN_STUDIO, then the platform's default install
 * folders (see the module comment).
 *
 * @returns {string[]} directories (not checked for existence).
 */
function sdkRoots() {
  const roots = [];
  if (process.env.TIZEN_SDK) roots.push(process.env.TIZEN_SDK);
  if (process.env.TIZEN_STUDIO) roots.push(process.env.TIZEN_STUDIO);
  const home = homedir();
  if (IS_WINDOWS) {
    roots.push('C:\\tizen-studio', 'C:\\tizen-sdk', join(home, 'tizen-studio'), join(home, 'tizen-sdk'));
    if (process.env.LOCALAPPDATA) roots.push(join(process.env.LOCALAPPDATA, 'tizen-studio'));
  } else {
    roots.push(join(home, 'tizen-studio'), join(home, 'tizen-sdk'), '/opt/tizen-studio');
  }
  return roots;
}

/**
 * Finds the Tizen CLI.
 *
 * @param {string | undefined} override - explicit path (e.g. from --tizen); wins over TIZEN_CLI.
 * @returns {string | null} absolute path of `tizen` / `tizen.bat` (Windows also accepts `.cmd` / `.exe`), or
 *   null. An explicit path that does not exist yields null — there is no silent fallback to auto-detection.
 */
export function findTizenCli(override) {
  const explicit = override ?? process.env.TIZEN_CLI;
  if (explicit) return existsSync(explicit) ? resolve(explicit) : null;
  const names = IS_WINDOWS ? ['tizen.bat', 'tizen.cmd', 'tizen.exe'] : ['tizen'];
  const onPath = whichAny(names);
  if (onPath) return onPath;
  for (const root of sdkRoots()) {
    for (const n of names) {
      const p = join(root, 'tools', 'ide', 'bin', n);
      if (existsSync(p)) return p;
    }
  }
  return null;
}

/**
 * Finds sdb: TIZEN_SDB, next to the CLI's SDK (`<sdk>/tools/sdb`), SDK roots, then PATH.
 *
 * @param {string | null} tizenCli - path returned by {@link findTizenCli} (used to locate its SDK), or null.
 * @param {string | undefined} override - explicit path (e.g. from --sdb); wins over TIZEN_SDB.
 * @returns {string | null} absolute path of `sdb` / `sdb.exe`, or null (also when an explicit path does not
 *   exist).
 */
export function findSdb(tizenCli, override) {
  const explicit = override ?? process.env.TIZEN_SDB;
  if (explicit) return existsSync(explicit) ? resolve(explicit) : null;
  const exe = IS_WINDOWS ? 'sdb.exe' : 'sdb';
  if (tizenCli) {
    // <sdk>/tools/ide/bin/tizen(.bat) -> <sdk>/tools/sdb(.exe)
    const p = resolve(dirname(tizenCli), '..', '..', exe);
    if (existsSync(p)) return p;
  }
  for (const root of sdkRoots()) {
    const p = join(root, 'tools', exe);
    if (existsSync(p)) return p;
  }
  return whichAny([exe]);
}

/**
 * Quotes one argument for a cmd.exe command line.
 *
 * @param {unknown} arg - the argument (converted with `String()`).
 * @returns {string} the argument unchanged when it has no whitespace or cmd.exe metacharacters, otherwise
 *   wrapped in double quotes with embedded quotes doubled. An empty string becomes `""`.
 *
 * @remarks
 * Inside double quotes cmd.exe does not interpret `& | < > ^ ( ) , ; =`, so quoting is enough for paths and
 * profile names with spaces or parentheses (e.g. `C:\Program Files (x86)\…`). `%VAR%` expansion still happens
 * inside quotes; the values we pass (paths, IPs, profile names) do not contain `%` in practice.
 *
 * @example
 * quoteForCmd('C:\\tizen studio\\tools\\ide\\bin\\tizen.bat'); // '"C:\\tizen studio\\tools\\ide\\bin\\tizen.bat"'
 * quoteForCmd('wgt');                                          // 'wgt'
 */
export function quoteForCmd(arg) {
  const s = String(arg);
  if (s !== '' && !/[\s"&|<>^()%!,;=]/.test(s)) return s;
  return '"' + s.replace(/"/g, '""') + '"';
}

/**
 * Quotes one argument for display in a POSIX-ish shell (only used for logging).
 *
 * @param {unknown} arg - the argument.
 * @returns {string} the argument, JSON-quoted when it contains unusual characters.
 */
function quoteForDisplay(arg) {
  const s = String(arg);
  return /^[\w@%+=:,./\\-]+$/.test(s) ? s : JSON.stringify(s);
}

/**
 * Runs a command synchronously, echoing its combined output afterwards and returning it.
 * Exits the process on failure unless `allowFail` is set.
 *
 * @param {string} cmd - executable path.
 * @param {string[]} args - arguments (quoted automatically).
 * @param {{ dryRun?: boolean, allowFail?: boolean }} [opts] - `dryRun`: only print the command line;
 *   `allowFail`: return a non-zero status (or -1 when the process could not start) instead of exiting.
 * @returns {{ status: number, output: string }} exit status and combined stdout + stderr.
 *
 * @remarks
 * `.bat` / `.cmd` files on Windows are run through the shell (cmd.exe) with every argument passed through
 * {@link quoteForCmd}; everything else is spawned directly without a shell. The Tizen CLI often exits 0 even
 * on failure, so callers also inspect `output`.
 */
export function run(cmd, args, opts = {}) {
  const isBatch = IS_WINDOWS && /\.(bat|cmd)$/i.test(cmd);
  const display = [cmd, ...args].map(IS_WINDOWS ? quoteForCmd : quoteForDisplay).join(' ');
  console.log('$ ' + display);
  if (opts.dryRun) return { status: 0, output: '' };
  const res = isBatch
    ? spawnSync([cmd, ...args].map(quoteForCmd).join(' '), { shell: true, encoding: 'utf8', windowsHide: true })
    : spawnSync(cmd, args, { encoding: 'utf8', windowsHide: true });
  if (res.error) {
    if (opts.allowFail) return { status: -1, output: String(res.error.message) };
    die('could not start ' + cmd + ': ' + res.error.message);
  }
  const output = (res.stdout ?? '') + (res.stderr ?? '');
  if (output.trim()) console.log(output.replace(/\s+$/, ''));
  const status = res.status ?? -1;
  if (status !== 0 && !opts.allowFail) die(cmd + ' exited with code ' + status);
  return { status, output };
}

/**
 * Lists .wgt files in a directory (newest first).
 *
 * @param {string} [dir] - directory to scan (default `dist/`).
 * @returns {string[]} full paths, sorted by modification time descending; `[]` when the directory is missing.
 */
export function findWgts(dir = DIST_DIR) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.wgt'))
    .map((f) => join(dir, f))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
}

/**
 * Removes packaging leftovers (old .wgt, signatures) from dist/ so they are not packed again.
 *
 * @param {string} [dir] - directory to clean (default `dist/`).
 * @returns {void}
 *
 * @remarks
 * `tizen package` signs the whole directory in place (it writes `author-signature.xml` and
 * `signature1.xml` next to the app files); packaging again without cleaning would nest the old signatures
 * and package inside the new one.
 */
export function cleanPackagingArtifacts(dir = DIST_DIR) {
  if (!existsSync(dir)) return;
  for (const f of readdirSync(dir)) {
    if (/\.wgt$/i.test(f) || f === 'author-signature.xml' || /^signature\d*\.xml$/.test(f) || f === '.manifest.tmp') {
      rmSync(join(dir, f), { force: true });
    }
  }
}

/**
 * Builds the app with Vite (programmatic API) and runs the compat check.
 *
 * @param {{ dryRun?: boolean }} [opts] - `dryRun`: print what would happen, touch nothing.
 * @returns {Promise<void>}
 * @throws when the Vite build fails; exits the process when `check-compat.mjs` fails.
 *
 * @remarks
 * `VITE_REPORT_URL` from the current environment is picked up by Vite, so set it before packaging to bake
 * the log-server URL into the `.wgt`.
 */
export async function buildApp({ dryRun = false } = {}) {
  step('Building (vite build → dist/)');
  if (dryRun) {
    console.log('(dry run) vite build');
    return;
  }
  const { build } = await import('vite');
  await build({ root: PROJECT_ROOT, configFile: join(PROJECT_ROOT, 'vite.config.ts'), logLevel: 'info' });
  step('Checking Chromium 69 compatibility');
  run(process.execPath, [join(PROJECT_ROOT, 'scripts', 'check-compat.mjs'), DIST_DIR]);
}

/**
 * Packages dist/ into a signed .wgt with `tizen package -t wgt -s <profile> -- dist`.
 *
 * @param {{ profile?: string, skipBuild?: boolean, dryRun?: boolean, tizen?: string }} opts -
 *   `profile`: certificate profile (default TIZEN_PROFILE); `skipBuild`: package the existing `dist/`;
 *   `dryRun`: print the commands only; `tizen`: CLI path (default TIZEN_CLI / auto-detection).
 * @returns {Promise<string>} path of the produced .wgt (in a dry run: the expected `dist/InputProbe.wgt`).
 *
 * @remarks
 * Exits the process (via {@link die}) when no profile is set, the CLI cannot be found, `dist/` is empty with
 * `skipBuild`, or no `.wgt` was produced.
 */
export async function packageWgt(opts = {}) {
  const profile = opts.profile ?? process.env.TIZEN_PROFILE;
  if (!profile) {
    die(
      'no certificate profile: set TIZEN_PROFILE (or pass --profile <name>)',
      'Create one in Tizen Studio (Tools → Certificate Manager) or the VS Code Tizen extension\n' +
        '(Command Palette → "Tizen: Certificate Manager") with a Samsung distributor certificate that\n' +
        "lists both monitors' DUIDs, then e.g.:  set TIZEN_PROFILE=shmupcup   (PowerShell: $env:TIZEN_PROFILE='shmupcup')",
    );
  }
  const cli = findTizenCli(opts.tizen) ?? (opts.dryRun ? 'tizen' : null);
  if (!cli) die('Tizen CLI not found', TIZEN_CLI_HINT);

  if (!opts.skipBuild) await buildApp({ dryRun: opts.dryRun });
  else if (!existsSync(join(DIST_DIR, 'index.html')) && !opts.dryRun) die('dist/ is empty — run without --skip-build');

  if (!opts.dryRun) cleanPackagingArtifacts(); // a dry run must not touch the filesystem
  step('Packaging ' + WGT_NAME + ' with profile "' + profile + '"');
  const { output } = run(cli, ['package', '-t', 'wgt', '-s', profile, '--', DIST_DIR], { dryRun: opts.dryRun });
  if (opts.dryRun) return join(DIST_DIR, WGT_NAME);
  const wgts = findWgts();
  if (wgts.length === 0 || (/\berror\b|failed/i.test(output) && !/Package File Location/i.test(output))) {
    die(
      'packaging failed — no .wgt produced',
      'Check that the profile name is right (`' + cli + ' security-profiles list`) and its certificates exist.',
    );
  }
  console.log('\nPackage: ' + wgts[0]);
  return wgts[0];
}

/** Help text shown when the CLI cannot be found. */
export const TIZEN_CLI_HINT =
  'Install Tizen Studio (or the VS Code Tizen extension + its SDK) and either put <sdk>\\tools\\ide\\bin on PATH\n' +
  'or set TIZEN_CLI to the full path, e.g.  set TIZEN_CLI=C:\\tizen-studio\\tools\\ide\\bin\\tizen.bat';
