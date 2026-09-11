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
 *   TIZEN_PROFILE  certificate (security) profile name for `tizen package -s`
 *   TV_IP          TV / monitor IP(s) for deploy.mjs, comma- or space-separated, optional :port
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

/** Prints a step header. */
export function step(msg) {
  console.log('\n\x1b[36m==> ' + msg + '\x1b[0m');
}

/** Prints an error and exits with code 1. */
export function die(msg, hint) {
  console.error('\n\x1b[31mERROR: ' + msg + '\x1b[0m');
  if (hint) console.error(hint);
  process.exit(1);
}

/**
 * Parses `--flag`, `--key value` and `--key=value` arguments.
 *
 * @param {string[]} argv
 * @returns {Record<string, string | boolean>}
 */
export function parseArgs(argv) {
  /** @type {Record<string, string | boolean>} */
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const eq = a.indexOf('=');
    if (eq > 0) out[a.slice(2, eq)] = a.slice(eq + 1);
    else if (i + 1 < argv.length && !argv[i + 1].startsWith('--') && VALUE_FLAGS.has(a.slice(2))) out[a.slice(2)] = argv[++i];
    else out[a.slice(2)] = true;
  }
  return out;
}
const VALUE_FLAGS = new Set(['profile', 'ip', 'tizen', 'sdb']);

/** Searches PATH for the first existing file among `names`. */
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

/** Candidate SDK roots, most specific first. */
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
 * @param {string | undefined} override - explicit path (e.g. from --tizen).
 * @returns {string | null}
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
 * @param {string | null} tizenCli
 * @param {string | undefined} override
 * @returns {string | null}
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

/** Quotes one argument for a cmd.exe command line. */
export function quoteForCmd(arg) {
  const s = String(arg);
  if (s !== '' && !/[\s"&|<>^()%!,;=]/.test(s)) return s;
  return '"' + s.replace(/"/g, '""') + '"';
}

/** Quotes one argument for display in a POSIX-ish shell (only used for logging). */
function quoteForDisplay(arg) {
  const s = String(arg);
  return /^[\w@%+=:,./\\-]+$/.test(s) ? s : JSON.stringify(s);
}

/**
 * Runs a command synchronously, echoing its combined output afterwards and returning it.
 * Exits the process on failure unless `allowFail` is set.
 *
 * @param {string} cmd - executable path.
 * @param {string[]} args
 * @param {{ dryRun?: boolean, allowFail?: boolean }} [opts]
 * @returns {{ status: number, output: string }}
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

/** Lists .wgt files in a directory (newest first). */
export function findWgts(dir = DIST_DIR) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.wgt'))
    .map((f) => join(dir, f))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
}

/** Removes packaging leftovers (old .wgt, signatures) from dist/ so they are not packed again. */
export function cleanPackagingArtifacts(dir = DIST_DIR) {
  if (!existsSync(dir)) return;
  for (const f of readdirSync(dir)) {
    if (/\.wgt$/i.test(f) || f === 'author-signature.xml' || /^signature\d*\.xml$/.test(f) || f === '.manifest.tmp') {
      rmSync(join(dir, f), { force: true });
    }
  }
}

/** Builds the app with Vite (programmatic API) and runs the compat check. */
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
 * @param {{ profile?: string, skipBuild?: boolean, dryRun?: boolean, tizen?: string }} opts
 * @returns {Promise<string>} path of the produced .wgt
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

  cleanPackagingArtifacts();
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
