#!/usr/bin/env node
/**
 * Runs an unattended **TV render-bench campaign**: several bench passes back to back on one Samsung
 * Tizen TV, supervised from the desktop (plan R0-03). The owner starts it and leaves the TV alone for
 * the hours the passes take.
 *
 * The bench widget does the measuring itself: built with `VITE_BENCH_CAMPAIGN=1,2,1,2` (and the log
 * server's `VITE_REPORT_URL`), it starts each pass after a countdown, reloads itself per scenario and
 * POSTs every scenario's record to the input probe's log server, which appends one JSON line per
 * payload to `tools/input-probe/logs/rb-<session>.jsonl`. A pass ends with a payload whose `done` is
 * `true`. This script only controls processes and supervises:
 *
 * 1. **Preflight** — the log server answers `GET /health`; `dist-bench/app.js` is a campaign build
 *    (its passes, which set `--passes` unless given, and its pause, which the watchdog must exceed
 *    by two minutes — {@link parseCampaignBuild}); `dist-bench/` holds a `.wgt`
 *    at least as new as its `app.js` (else it packages one through `tizen-bench.mjs package`);
 *    `sdb connect <target>`.
 * 2. **Start** — kill the bench app (`sdb shell 0 was_kill`), uninstall it, install the `.wgt`,
 *    launch it (`tizen run`).
 * 3. **Supervise** — every few seconds read the new lines of the `rb-*.jsonl` files and print one
 *    progress line per payload. A session's `done` payload finishes a pass: while passes remain the
 *    app is killed and launched again (a fresh process per pass). A session that a newer one follows
 *    without a `done` is finished too ("superseded": the bench skipped the pass's last scenario after
 *    three crashed launches and started the next pass itself). No payload for `--watchdog-s` →
 *    kill + relaunch (the app resumes from its stored cursor); too many restarts → give up; the
 *    final pass silent through three watchdog periods in a row → stop with exit code 2.
 *    A failing or hanging `sdb` / `tizen` command recovers sdb (`kill-server`, `start-server`,
 *    `connect`) and is retried.
 * 4. **Finish** — copy the finished sessions' JSONL files into the results folder and print a summary
 *    per session. The whole run is logged to `<results>/campaign.log` as it goes.
 *
 * Usage (from the repo root; PowerShell: `$env:NAME="value"; …`):
 *   VITE_BENCH_CAMPAIGN=1,2,1,2 VITE_REPORT_URL=http://<desktop ip>:8787 pnpm bench:tv
 *   (add VITE_BENCH_OUTPUT=1280x720 or 960x540 for a smaller canvas backbuffer: the build id then
 *   ends in `@<w>x<h>`, so its campaign never mixes with another output's — {@link parseBuildOutput})
 *   node tools/input-probe/server/log-server.mjs            (in a second terminal)
 *   pnpm bench:tv:campaign [-- --dry-run] [-- --target <ip:port> --passes N …]
 *
 * Flags (see {@link USAGE}): `--target` (env `TIZEN_TARGET`, else `${TV_IP}:26101`, else the M7's
 * address), `--passes`, `--log-url`, `--logs`, `--watchdog-s`, `--max-restarts`, `--no-install`,
 * `--results`, `--profile` (env `TIZEN_PROFILE`, else `Shmup` — only used to package), `--dry-run`
 * (prints the preflight and every command; touches no device). The Tizen CLI is `$TIZEN_CLI`, else a
 * `tizen.bat` in a known Tizen Studio folder, else `tizen` on PATH; sdb is `$SDB`, else `sdb`.
 *
 * Ctrl+C stops the supervision (the TV app keeps running), copies what finished and prints where
 * things are. **Never run in CI** — there is no Tizen CLI, no sdb and no TV.
 *
 * @module
 */
import { spawn } from 'node:child_process';
import {
  appendFileSync,
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  statSync,
} from 'node:fs';
import { request } from 'node:http';
import { basename, isAbsolute, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { BENCH_APP_ID, BENCH_PACKAGE_ID } from './config-xml.mjs';
import { BENCH_DIST } from './tizen-bench.mjs';
import { APP_DIR, sdbCli, tizenCli } from './tizen-env.mjs';

/** The repository root (apps/tizen/../..). */
export const REPO_ROOT = resolve(APP_DIR, '..', '..');

/** The M7 monitor the campaign was written for (`sdb` serial: ip:port). */
export const DEFAULT_TARGET = '10.0.0.224:26101';

/** Passes of a campaign (the bench's `VITE_BENCH_CAMPAIGN=1,2,1,2`). */
export const DEFAULT_PASSES = 4;

/** The log server as seen from this desktop. */
export const DEFAULT_LOG_URL = 'http://127.0.0.1:8787';

/** Where the log server writes its JSONL files, relative to the repo root. */
export const DEFAULT_LOGS_DIR = 'tools/input-probe/logs';

/** Where the campaign's results go, relative to the repo root (a dated folder below it). */
export const RESULTS_ROOT = 'tools/input-probe/results';

/** Seconds without a new payload before the app is killed and relaunched. */
export const DEFAULT_WATCHDOG_S = 300;

/** Watchdog restarts over the whole campaign before it gives up. */
export const DEFAULT_MAX_RESTARTS = 20;

/** The certificate profile that signs the bench `.wgt` on the owner's desktop. */
export const DEFAULT_PROFILE = 'Shmup';

/** How often the logs folder is polled, in ms. */
export const POLL_MS = 5000;

/**
 * How long one `sdb` / `tizen` command may run before it counts as hung, in ms — `tizen package`
 * alone took 62 s on the owner's desktop (signing), so a minute was too short.
 */
export const COMMAND_TIMEOUT_MS = 300_000;

/** Pause between killing the app and launching it again, in ms. */
export const RELAUNCH_PAUSE_MS = 5000;

/** Watchdog firings in a row with no new line at all that end a final pass that sent no `done`. */
export const SILENT_WATCHDOGS_TO_STOP = 3;

/** Seconds the watchdog allows on top of the build's pause before a pass. */
export const WATCHDOG_PAUSE_MARGIN_S = 120;

/** The pause a campaign build uses when its pause literal is empty (`DEFAULT_CAMPAIGN_PAUSE_S`). */
export const DEFAULT_BUILD_PAUSE_S = 30;

/** The command that makes a campaign build of the bench, for the preflight's messages. */
export const CAMPAIGN_BUILD_COMMAND =
  'VITE_BENCH_CAMPAIGN=1,2,1,2 VITE_REPORT_URL=http://10.0.0.2:8787 pnpm --filter @shmup/tizen build:bench';

/** Attempts of a command that must succeed (install, launch, connect), with sdb recovery between. */
export const COMMAND_ATTEMPTS = 3;

/** `kind` of a TV render-bench payload (`@shmup/shell` telemetry `RENDER_BENCH_KIND`). */
export const RENDER_BENCH_KIND = 'render-bench';

/** Tizen Studio folders where `tizen.bat` is looked for on Windows when `TIZEN_CLI` is not set. */
export const TIZEN_STUDIO_CANDIDATES = Object.freeze([
  'F:\\Installs\\tizen-studio\\tools\\ide\\bin\\tizen.bat',
  'C:\\tizen-studio\\tools\\ide\\bin\\tizen.bat',
]);

/** The command-line help. */
export const USAGE = `Usage: node scripts/bench-campaign.mjs [options]
  --target <ip:port>    sdb serial of the TV (env TIZEN_TARGET, else TV_IP:26101, else ${DEFAULT_TARGET})
  --passes <n>          bench passes to run (default ${DEFAULT_PASSES})
  --log-url <url>       the log server as seen from here (default ${DEFAULT_LOG_URL})
  --logs <dir>          the log server's JSONL folder (default ${DEFAULT_LOGS_DIR})
  --watchdog-s <s>      relaunch after this long without a payload (default ${DEFAULT_WATCHDOG_S})
  --max-restarts <n>    give up after this many watchdog restarts (default ${DEFAULT_MAX_RESTARTS})
  --no-install          skip uninstall / package / install; just (re)launch
  --results <dir>       results folder (default ${RESULTS_ROOT}/<YYYY-MM-DD>-m7-bench-resolutions)
  --profile <name>      certificate profile to package with (env TIZEN_PROFILE, else ${DEFAULT_PROFILE})
  --dry-run             print the preflight and every command; touch no device
  --help                this text`;

/**
 * @typedef {object} CampaignOptions
 * @property {string} target - sdb serial (`ip:port`).
 * @property {number} passes - Bench passes to run.
 * @property {boolean} passesGiven - Whether `--passes` was given (else the build's count is used).
 * @property {string} logUrl - The log server's base URL (no trailing slash, no `/report`).
 * @property {string} logsDir - Absolute path of the log server's JSONL folder.
 * @property {number} watchdogS - Seconds without a payload before a relaunch.
 * @property {number} maxRestarts - Watchdog restarts before giving up.
 * @property {boolean} install - Whether to uninstall, package and install before the first launch.
 * @property {string} resultsDir - Absolute path of the results folder.
 * @property {string} profile - Certificate profile for packaging.
 * @property {boolean} dryRun - Print, never touch the device.
 * @property {boolean} help - Print the usage and exit.
 */

/**
 * The results folder's name for a campaign started on `date` (local calendar day).
 *
 * @param {Date} date - When the campaign starts.
 * @returns {string} `<YYYY-MM-DD>-m7-bench-resolutions`.
 *
 * @example
 * resultsDirName(new Date(2026, 9, 19)); // → '2026-10-19-m7-bench-resolutions'
 */
export function resultsDirName(date) {
  const pad = (/** @type {number} */ n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-m7-bench-resolutions`;
}

/**
 * Normalises a log-server URL to its base: no trailing slashes, no `/report`.
 *
 * @param {string} url - The configured URL.
 * @returns {string} The base URL.
 * @throws {Error} When it does not start with `http://` (the log server speaks plain HTTP).
 */
export function normalizeLogUrl(url) {
  const trimmed = url
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/report$/, '');
  if (!/^http:\/\/[^/]+/i.test(trimmed)) {
    throw new Error(`--log-url must be an http:// URL, got "${url}"`);
  }
  return trimmed;
}

/**
 * Parses a positive whole number flag.
 *
 * @param {string} name - Flag name, for the message.
 * @param {string} text - Its value.
 * @returns {number} The number.
 * @throws {Error} When it is not a whole number above zero.
 */
function positiveInt(name, text) {
  const n = Number(text);
  if (!Number.isInteger(n) || n <= 0)
    throw new Error(`${name} must be a whole number > 0, got "${text}"`);
  return n;
}

/**
 * Parses the command line and environment into the campaign's options.
 *
 * @remarks Flags take `--flag value` or `--flag=value`. Relative paths resolve against `root` (the
 * repository root), so `pnpm --filter` running the script inside apps/tizen changes nothing.
 *
 * @param {string[]} argv - Arguments after the script name.
 * @param {Record<string, string | undefined>} env - The environment.
 * @param {Date} now - The start time (names the default results folder).
 * @param {string} [root] - Folder relative paths resolve against (default {@link REPO_ROOT}).
 * @returns {CampaignOptions} The options.
 * @throws {Error} On an unknown flag, a missing value or an invalid number / URL.
 *
 * @example
 * parseArgs(['--passes', '2', '--dry-run'], {}, new Date()).passes; // → 2
 */
export function parseArgs(argv, env, now, root = REPO_ROOT) {
  /** @type {CampaignOptions} */
  const options = {
    target: env.TIZEN_TARGET || (env.TV_IP ? `${env.TV_IP}:26101` : DEFAULT_TARGET),
    passes: DEFAULT_PASSES,
    passesGiven: false,
    logUrl: DEFAULT_LOG_URL,
    logsDir: resolve(root, DEFAULT_LOGS_DIR),
    watchdogS: DEFAULT_WATCHDOG_S,
    maxRestarts: DEFAULT_MAX_RESTARTS,
    install: true,
    resultsDir: resolve(root, RESULTS_ROOT, resultsDirName(now)),
    profile: env.TIZEN_PROFILE || DEFAULT_PROFILE,
    dryRun: false,
    help: false,
  };
  const at = (/** @type {string} */ p) => (isAbsolute(p) ? p : resolve(root, p));
  for (let i = 0; i < argv.length; i++) {
    const raw = argv[i];
    if (raw === '--') continue;
    const eq = raw.indexOf('=');
    const flag = raw.startsWith('--') && eq > 0 ? raw.slice(0, eq) : raw;
    const inline = raw.startsWith('--') && eq > 0 ? raw.slice(eq + 1) : null;
    const value = () => {
      if (inline !== null) return inline;
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) throw new Error(`${flag} needs a value`);
      i++;
      return next;
    };
    switch (flag) {
      case '--target':
        options.target = value();
        break;
      case '--passes':
        options.passes = positiveInt(flag, value());
        options.passesGiven = true;
        break;
      case '--log-url':
        options.logUrl = value();
        break;
      case '--logs':
        options.logsDir = at(value());
        break;
      case '--watchdog-s':
        options.watchdogS = positiveInt(flag, value());
        break;
      case '--max-restarts':
        options.maxRestarts = positiveInt(flag, value());
        break;
      case '--no-install':
        options.install = false;
        break;
      case '--results':
        options.resultsDir = at(value());
        break;
      case '--profile':
        options.profile = value();
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        throw new Error(`Unknown option ${raw}\n${USAGE}`);
    }
  }
  options.logUrl = normalizeLogUrl(options.logUrl);
  if (!/^[^\s:]+:\d+$/.test(options.target)) {
    throw new Error(`--target must be <ip>:<port>, got "${options.target}"`);
  }
  return options;
}

/**
 * Reads the campaign a bench build carries from its `app.js`: `vite.bench.config.ts` defines the
 * passes and the pause as strings, which the minified bundle holds as two adjacent template literals
 * (a call like `xy(` + "`1,2,1,2`,`30`" + `)`; the function's name varies).
 *
 * @param {string} appJs - The bundle's text.
 * @returns {{ passes: number[], pauseS: number } | null} Each pass's WebGL version and the pause in
 *   seconds ({@link DEFAULT_BUILD_PAUSE_S} when empty), or `null` when it is not a campaign build.
 */
export function parseCampaignBuild(appJs) {
  const match = /`([12](?:,[12])*)`,`(\d*)`/.exec(appJs);
  if (match === null) return null;
  return {
    passes: match[1].split(',').map(Number),
    pauseS: match[2] === '' ? DEFAULT_BUILD_PAUSE_S : Number(match[2]),
  };
}

/**
 * Reads the build id a bench build carries from its `app.js` (the bench host's `buildId` option, the
 * `__SHMUP_BUILD__` define), so payloads of other builds can be told apart.
 *
 * @param {string} appJs - The bundle's text.
 * @returns {string | null} The build id, or `null` when the bundle names none.
 */
export function parseBuildId(appJs) {
  const match = /buildId:`([^`]*)`/.exec(appJs);
  return match === null ? null : match[1];
}

/**
 * The build output resolution a bench build id names (`src/bench/output.ts` `benchBuildId`: a
 * build made with `VITE_BENCH_OUTPUT=1280x720` reports `<sha>@1280x720`).
 *
 * @param {string | null} buildId - The build id ({@link parseBuildId}), or `null`.
 * @returns {string | null} `'<w>x<h>'`, or `null` when the id names none (the window's backbuffer).
 */
export function parseBuildOutput(buildId) {
  const match = buildId === null ? null : /@(\d+x\d+)$/.exec(buildId);
  return match === null ? null : match[1];
}

/**
 * Whether a payload belongs to another build than the campaign's, i.e. a stale session: when the
 * app starts it re-sends the records an earlier run (an older build) never got through, and those
 * must not count as a pass.
 *
 * @param {BenchPayload} payload - The payload.
 * @param {string | null} buildId - The campaign build's id, or `null` when unknown (nothing is stale).
 * @returns {boolean} `true` when the payload names a different build.
 */
export function isForeignPayload(payload, buildId) {
  return buildId !== null && payload.env.buildId !== buildId;
}

/**
 * The watchdog a campaign needs: never shorter than the build's pause before a pass plus
 * {@link WATCHDOG_PAUSE_MARGIN_S}, or it would fire during every countdown.
 *
 * @param {number} watchdogS - The configured watchdog, in seconds.
 * @param {number} pauseS - The build's pause, in seconds.
 * @returns {number} The watchdog in seconds.
 */
export function campaignWatchdogS(watchdogS, pauseS) {
  return Math.max(watchdogS, pauseS + WATCHDOG_PAUSE_MARGIN_S);
}

/**
 * Whether the campaign should stop because its final pass went silent without a `done` payload: the
 * bench skipped the final pass's last scenario (after three crashed launches), so no `done` comes and
 * no newer session will supersede it.
 *
 * @param {Tracker} tracker - The tracker.
 * @param {number} passes - Passes in the campaign.
 * @param {number} silentWatchdogs - Watchdog firings in a row with no new line at all.
 * @returns {boolean} `true` when the final pass runs, has an unfinished session, and the watchdog
 *   fired {@link SILENT_WATCHDOGS_TO_STOP} times in a row with nothing read.
 */
export function finalPassSilent(tracker, passes, silentWatchdogs) {
  if (currentPass(tracker) !== passes || silentWatchdogs < SILENT_WATCHDOGS_TO_STOP) return false;
  for (const s of tracker.sessions.values()) {
    if (s.pass === passes && !s.done && !s.superseded) return true;
  }
  return false;
}

/**
 * @typedef {object} Tools
 * @property {string} tizen - The Tizen CLI.
 * @property {string} sdb - The sdb executable.
 */

/**
 * The Tizen CLI and sdb to run.
 *
 * @param {Record<string, string | undefined>} env - The environment.
 * @param {(path: string) => boolean} exists - File test (injected for tests).
 * @param {string} platform - `process.platform`.
 * @returns {Tools} `$TIZEN_CLI`, else the first {@link TIZEN_STUDIO_CANDIDATES} that exists (Windows),
 *   else `tizenCli()`; `$SDB`, else `sdbCli()`.
 */
export function resolveTools(env, exists, platform) {
  let tizen = env.TIZEN_CLI || '';
  if (tizen === '' && platform === 'win32') {
    const home = env.USERPROFILE
      ? [join(env.USERPROFILE, 'tizen-studio', 'tools', 'ide', 'bin', 'tizen.bat')]
      : [];
    tizen = [...TIZEN_STUDIO_CANDIDATES, ...home].find((p) => exists(p)) ?? '';
  }
  return { tizen: tizen || tizenCli(), sdb: env.SDB || sdbCli() };
}

/**
 * @typedef {object} Command
 * @property {string} label - What it does, for the log.
 * @property {string} command - Executable.
 * @property {string[]} args - Arguments.
 * @property {'connect' | 'tizen' | 'sdb'} check - How its output is judged ({@link commandFailed}).
 */

/**
 * @typedef {object} DeviceCommands
 * @property {Command} connect - `sdb connect <target>`.
 * @property {Command} kill - Kills the bench app (`sdb -s <target> shell 0 was_kill <app id>`).
 * @property {Command} uninstall - `tizen uninstall -p <package id> -s <target>`.
 * @property {Command} install - `tizen install -n <wgt> -s <target> -- <dist-bench>`.
 * @property {Command} launch - `tizen run -p <app id> -s <target>`.
 * @property {Command[]} recover - `sdb kill-server`, `sdb start-server`, `sdb connect <target>`.
 */

/**
 * Every device command the campaign runs.
 *
 * @param {Tools} tools - The CLIs.
 * @param {string} target - sdb serial.
 * @param {string} distDir - Absolute path of `dist-bench/`.
 * @param {string} wgt - The `.wgt`'s file name in it.
 * @returns {DeviceCommands} The commands.
 */
export function deviceCommands(tools, target, distDir, wgt) {
  /** @type {Command} */
  const connect = {
    label: 'connect',
    command: tools.sdb,
    args: ['connect', target],
    check: 'connect',
  };
  return {
    connect,
    kill: {
      label: 'kill app',
      command: tools.sdb,
      args: ['-s', target, 'shell', '0', 'was_kill', BENCH_APP_ID],
      check: 'sdb',
    },
    uninstall: {
      label: 'uninstall',
      command: tools.tizen,
      args: ['uninstall', '-p', BENCH_PACKAGE_ID, '-s', target],
      check: 'tizen',
    },
    install: {
      label: 'install',
      command: tools.tizen,
      args: ['install', '-n', wgt, '-s', target, '--', distDir],
      check: 'tizen',
    },
    launch: {
      label: 'launch',
      command: tools.tizen,
      args: ['run', '-p', BENCH_APP_ID, '-s', target],
      check: 'tizen',
    },
    recover: [
      { label: 'sdb kill-server', command: tools.sdb, args: ['kill-server'], check: 'sdb' },
      { label: 'sdb start-server', command: tools.sdb, args: ['start-server'], check: 'sdb' },
      connect,
    ],
  };
}

/**
 * @typedef {object} CommandResult
 * @property {number | null} code - Exit code (`null` when killed or never started).
 * @property {string} output - stdout and stderr together.
 * @property {boolean} timedOut - Whether it was killed for running too long.
 * @property {string | null} error - Why it could not start, or `null`.
 */

/**
 * Whether a command failed. The Tizen CLI and sdb often exit 0 after a failure, so the output is read
 * too.
 *
 * @param {Command['check']} check - How to judge: `connect` needs "connected to"; `tizen` and `sdb`
 *   fail on a "fail" / "error:" / "not found" line.
 * @param {CommandResult} result - What happened.
 * @returns {boolean} `true` when it failed.
 */
export function commandFailed(check, result) {
  if (result.error !== null || result.timedOut || result.code !== 0) return true;
  if (check === 'connect') return !/connected to|already connected/i.test(result.output);
  return /\bfail(ed|ure)?\b|\berror:|not found|cannot connect|device offline/i.test(result.output);
}

/**
 * A command line as text, for the log.
 *
 * @param {Command} c - The command.
 * @returns {string} `> command args…`.
 */
export function formatCommand(c) {
  return `> ${[c.command, ...c.args].map(quoteForShell).join(' ')}`;
}

/**
 * Quotes one argument for a Windows shell command line (as `tizen-env.mjs` does).
 *
 * @param {string} arg - Argument.
 * @returns {string} The argument, in double quotes when it holds whitespace or cmd.exe metacharacters.
 */
function quoteForShell(arg) {
  return /[\s"&|<>^]/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg;
}

// ------------------------------------------------------------------ JSONL and sessions

/**
 * @typedef {object} BenchPayload
 * @property {string} session - `rb-…`.
 * @property {number} seq - The payload's number in its session.
 * @property {boolean} done - `true` on the pass's last payload.
 * @property {Record<string, any>} env - The bench's environment (`webGLVersion`, `scenarios`, …).
 * @property {Record<string, any>[]} results - Scenario records (`index`, `scenario`, `webGLVersion`).
 * @property {Record<string, any> | null} decode - The decode scenario's record, if any.
 * @property {string | null} receivedAt - When the log server stored it.
 */

/**
 * Parses one line of a log-server JSONL file.
 *
 * @param {string} line - The line.
 * @returns {BenchPayload | null} The payload when the line is a render-bench payload with a session and
 *   a numeric `seq`; `null` for anything else (a blank or torn line, another kind).
 */
export function parseBenchLine(line) {
  const text = line.trim();
  if (text === '') return null;
  /** @type {any} */
  let p;
  try {
    p = JSON.parse(text);
  } catch {
    return null;
  }
  if (p === null || typeof p !== 'object' || Array.isArray(p)) return null;
  if (p.kind !== RENDER_BENCH_KIND || typeof p.session !== 'string' || typeof p.seq !== 'number')
    return null;
  return {
    session: p.session,
    seq: p.seq,
    done: p.done === true,
    env: p.env !== null && typeof p.env === 'object' ? p.env : {},
    results: Array.isArray(p.results)
      ? p.results.filter((r) => r !== null && typeof r === 'object')
      : [],
    decode: p.decode !== null && typeof p.decode === 'object' ? p.decode : null,
    receivedAt: typeof p.receivedAt === 'string' ? p.receivedAt : null,
  };
}

/**
 * Splits newly read text into complete lines, keeping a torn last line for the next read.
 *
 * @param {string} pending - The torn line left by the previous read.
 * @param {string} chunk - The text read now.
 * @returns {{ lines: string[], rest: string }} The complete lines and the new torn remainder.
 */
export function splitJsonl(pending, chunk) {
  const parts = (pending + chunk).split('\n');
  const rest = parts.pop() ?? '';
  return { lines: parts.filter((l) => l.trim() !== ''), rest };
}

/**
 * @typedef {object} SessionState
 * @property {string} id - Session id.
 * @property {string | null} file - Its JSONL file.
 * @property {number} pass - The campaign pass it belongs to (1-based).
 * @property {number | null} gl - WebGL version (`env.webGLVersion`, else a record's).
 * @property {number | null} scenarios - Scenarios in its pass (`env.scenarios`).
 * @property {Set<number>} indexes - Distinct scenario indexes received.
 * @property {Map<number, string>} names - Scenario id by index.
 * @property {number} lastSeq - Highest `seq` seen (`-1` before any).
 * @property {number} payloads - Payload lines read.
 * @property {boolean} decode - Whether the decode record arrived.
 * @property {boolean} done - Whether its `done` payload arrived.
 * @property {boolean} superseded - Whether a newer session started before its `done` payload did
 *   (the bench skipped the pass's last scenario and went on to the next pass by itself).
 */

/**
 * @typedef {object} Tracker
 * @property {Map<string, SessionState>} sessions - Sessions in the order first seen.
 * @property {number} finishedPasses - Sessions finished: `done` payload, or superseded.
 * @property {Map<number, number>} restartsByPass - Watchdog restarts per pass.
 */

/**
 * A fresh campaign tracker.
 *
 * @returns {Tracker} No sessions, no passes finished.
 */
export function createTracker() {
  return { sessions: new Map(), finishedPasses: 0, restartsByPass: new Map() };
}

/**
 * The pass that is running now (1-based): one past the finished ones.
 *
 * @param {Tracker} tracker - The tracker.
 * @returns {number} The pass number.
 */
export function currentPass(tracker) {
  return tracker.finishedPasses + 1;
}

/**
 * Counts a watchdog restart against the current pass.
 *
 * @param {Tracker} tracker - The tracker.
 * @returns {number} Restarts in the whole campaign so far.
 */
export function countRestart(tracker) {
  const pass = currentPass(tracker);
  tracker.restartsByPass.set(pass, (tracker.restartsByPass.get(pass) ?? 0) + 1);
  let total = 0;
  for (const n of tracker.restartsByPass.values()) total += n;
  return total;
}

/**
 * @typedef {object} IngestResult
 * @property {SessionState} session - The payload's session.
 * @property {Record<string, any>[]} records - Records in this payload whose index is new.
 * @property {boolean} finishedPass - `true` when this payload is the session's first `done` one.
 * @property {SessionState[]} superseded - Earlier unfinished sessions this payload's (new) session
 *   finished by starting.
 */

/**
 * Folds one payload into the tracker.
 *
 * @remarks A session first seen first finishes every earlier unfinished session as **superseded**
 * (the bench skips a scenario after three crashed launches; when that was the pass's last one, no
 * `done` payload comes and the app starts the next pass on its own), then is assigned to the current
 * pass. A `done` payload finishes its pass only once (a re-sent one, or one arriving after the
 * session was superseded, changes no count), whatever records may be missing.
 *
 * @param {Tracker} tracker - The tracker (updated).
 * @param {BenchPayload} payload - The payload.
 * @param {string | null} file - The JSONL file it came from.
 * @returns {IngestResult} What changed.
 */
export function ingestPayload(tracker, payload, file) {
  let session = tracker.sessions.get(payload.session);
  /** @type {SessionState[]} */
  const superseded = [];
  if (session === undefined) {
    for (const older of tracker.sessions.values()) {
      if (older.done || older.superseded) continue;
      older.superseded = true;
      tracker.finishedPasses++;
      superseded.push(older);
    }
    session = {
      id: payload.session,
      file,
      pass: currentPass(tracker),
      gl: null,
      scenarios: null,
      indexes: new Set(),
      names: new Map(),
      lastSeq: -1,
      payloads: 0,
      decode: false,
      done: false,
      superseded: false,
    };
    tracker.sessions.set(payload.session, session);
  }
  if (session.file === null) session.file = file;
  session.payloads++;
  session.lastSeq = Math.max(session.lastSeq, payload.seq);
  if (typeof payload.env.webGLVersion === 'number') session.gl = payload.env.webGLVersion;
  if (typeof payload.env.scenarios === 'number') session.scenarios = payload.env.scenarios;
  if (payload.decode !== null) session.decode = true;
  /** @type {Record<string, any>[]} */
  const records = [];
  for (const r of payload.results) {
    if (session.gl === null && typeof r.webGLVersion === 'number') session.gl = r.webGLVersion;
    if (typeof r.index !== 'number') continue;
    if (!session.indexes.has(r.index)) records.push(r);
    session.indexes.add(r.index);
    if (typeof r.scenario === 'string') session.names.set(r.index, r.scenario);
  }
  const finishedPass = payload.done && !session.done && !session.superseded;
  if (finishedPass) tracker.finishedPasses++;
  if (payload.done) session.done = true;
  return { session, records, finishedPass, superseded };
}

/**
 * The scenario indexes a session never reported.
 *
 * @param {SessionState} session - The session.
 * @returns {number[]} Indexes in `[0, scenarios)` with no record, ascending (empty when the scenario
 *   count is unknown).
 */
export function missingIndexes(session) {
  if (session.scenarios === null) return [];
  const missing = [];
  for (let i = 0; i < session.scenarios; i++) if (!session.indexes.has(i)) missing.push(i);
  return missing;
}

/**
 * A wall-clock time as `HH:MM:SS` (local).
 *
 * @param {Date} date - The time.
 * @returns {string} The text.
 */
export function clock(date) {
  const pad = (/** @type {number} */ n) => String(n).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/**
 * One compact progress line for a payload.
 *
 * @param {IngestResult} ingest - What {@link ingestPayload} returned for it.
 * @param {BenchPayload} payload - The payload.
 * @param {number} passes - Passes in the campaign.
 * @param {Date} now - When it was read.
 * @returns {string} e.g. `21:14:05 pass 2/4 rb-x #12 scenario 12/18 <id> gl=2`, or a `DONE` line.
 */
export function formatProgress(ingest, payload, passes, now) {
  const s = ingest.session;
  const head = `${clock(now)} pass ${s.pass}/${passes} ${s.id} #${payload.seq}`;
  const total = s.scenarios === null ? '?' : String(s.scenarios);
  const gl = `gl=${s.gl === null ? '?' : String(s.gl)}`;
  if (ingest.finishedPass) {
    const missing = missingIndexes(s);
    return (
      `${head} DONE ${s.indexes.size}/${total} records${s.decode ? ' + decode' : ''} ${gl}` +
      (missing.length > 0 ? ` · missing ${missing.join(',')}` : '')
    );
  }
  if (payload.results.length === 0) {
    return `${head} ${payload.decode !== null ? 'decode record' : 'no records'} ${gl}`;
  }
  const items = payload.results.map(
    (r) =>
      `scenario ${typeof r.index === 'number' ? r.index + 1 : '?'}/${total} ${typeof r.scenario === 'string' ? r.scenario : '?'}`,
  );
  return `${head} ${items.join(' · ')} ${gl}${ingest.records.length < payload.results.length ? ' (repeat)' : ''}`;
}

/**
 * How a session ended, for the summary.
 *
 * @param {SessionState} s - The session.
 * @returns {string} `done`, `superseded, no done payload` or `UNFINISHED`.
 */
export function sessionStatus(s) {
  if (s.done) return 'done';
  return s.superseded ? 'superseded, no done payload' : 'UNFINISHED';
}

/**
 * One summary line per session.
 *
 * @param {Tracker} tracker - The tracker.
 * @returns {string[]} e.g. `rb-x pass 1 GL 1 · 18/18 records + decode · missing none · restarts 0 · done`.
 */
export function summaryLines(tracker) {
  const lines = [];
  for (const s of tracker.sessions.values()) {
    const missing = missingIndexes(s);
    lines.push(
      `${s.id} pass ${s.pass} GL ${s.gl === null ? '?' : String(s.gl)}` +
        ` · ${s.indexes.size}/${s.scenarios === null ? '?' : String(s.scenarios)} records${s.decode ? ' + decode' : ''}` +
        ` · missing ${missing.length > 0 ? missing.join(',') : 'none'}` +
        ` · restarts ${tracker.restartsByPass.get(s.pass) ?? 0}` +
        ` · ${sessionStatus(s)}`,
    );
  }
  if (lines.length === 0) lines.push('(no bench payload received)');
  return lines;
}

/**
 * The command that starts the log server, for the preflight's failure message.
 *
 * @param {CampaignOptions} options - The options (`--logs`, the URL's port).
 * @param {string} [root] - Repository root (default {@link REPO_ROOT}).
 * @returns {string} A PowerShell-friendly command line run from the repository root.
 */
export function logServerCommand(options, root = REPO_ROOT) {
  const port = new URL(options.logUrl).port || '80';
  const env = [];
  if (port !== '8787') env.push(`$env:PORT="${port}"; `);
  if (resolve(options.logsDir) !== resolve(root, DEFAULT_LOGS_DIR))
    env.push(`$env:LOG_DIR="${options.logsDir}"; `);
  return `${env.join('')}node tools/input-probe/server/log-server.mjs`;
}

// ------------------------------------------------------------------ side effects

/**
 * Makes the campaign's logger: every line goes to the console and, unless `file` is null, is
 * appended to it with a timestamp.
 *
 * @param {string | null} file - `campaign.log`, or `null` (dry run).
 * @returns {(message: string) => void} The logger.
 */
function createLogger(file) {
  return (message) => {
    console.log(message);
    if (file === null) return;
    const stamp = new Date().toISOString();
    try {
      appendFileSync(
        file,
        message
          .split('\n')
          .map((l) => `[${stamp}] ${l}`)
          .join('\n') + '\n',
      );
    } catch (error) {
      console.error(
        `(could not append to ${file}: ${error instanceof Error ? error.message : String(error)})`,
      );
    }
  };
}

/**
 * Asks the log server for `/health`.
 *
 * @param {string} baseUrl - The server's base URL.
 * @returns {Promise<boolean>} Resolves `true` on a 2xx answer within 5 s, `false` otherwise.
 */
function checkLogServer(baseUrl) {
  return new Promise((done) => {
    try {
      const req = request(`${baseUrl}/health`, { method: 'GET', timeout: 5000 }, (res) => {
        res.resume();
        done(Math.floor((res.statusCode ?? 0) / 100) === 2);
      });
      req.on('timeout', () => req.destroy());
      req.on('error', () => done(false));
      req.end();
    } catch {
      done(false);
    }
  });
}

/**
 * Runs a command with a time limit, capturing its output.
 *
 * @remarks On Windows the command runs through the shell (the Tizen CLI is a `.bat`), and a hung one
 * is killed with its whole process tree (`taskkill /T /F`) — the CLI starts a Java child. Never rejects.
 *
 * @param {Command} c - The command.
 * @param {number} timeoutMs - Time limit.
 * @param {(line: string) => void} log - Receives the output, line by line.
 * @param {{ cwd?: string, env?: NodeJS.ProcessEnv }} [options] - Working folder and environment.
 * @returns {Promise<CommandResult>} Resolves when the process ends or is killed.
 */
function execCommand(c, timeoutMs, log, options = {}) {
  return new Promise((done) => {
    const isWindows = process.platform === 'win32';
    const useShell = isWindows && c.command !== process.execPath;
    let output = '';
    let timedOut = false;
    let settled = false;
    /** @type {import('node:child_process').ChildProcess} */
    let child;
    /**
     * Settles once.
     *
     * @param {number | null} code - Exit code.
     * @param {string | null} error - Start error.
     */
    const finish = (code, error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      done({ code, output, timedOut, error });
    };
    try {
      child = useShell
        ? spawn([c.command, ...c.args].map(quoteForShell).join(' '), {
            shell: true,
            cwd: options.cwd,
            env: options.env,
            windowsHide: true,
          })
        : spawn(c.command, c.args, { cwd: options.cwd, env: options.env, windowsHide: true });
    } catch (error) {
      done({
        code: null,
        output,
        timedOut,
        error: error instanceof Error ? error.message : String(error),
      });
      return;
    }
    const timer = setTimeout(() => {
      timedOut = true;
      log(`  (timed out after ${Math.round(timeoutMs / 1000)} s — killing it)`);
      if (isWindows && child.pid !== undefined) {
        spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
          stdio: 'ignore',
          windowsHide: true,
        });
      } else {
        child.kill('SIGKILL');
      }
      setTimeout(() => finish(null, null), 5000);
    }, timeoutMs);
    /**
     * Collects and echoes output.
     *
     * @param {Buffer} data - A chunk.
     */
    const onData = (data) => {
      const text = data.toString('utf8');
      output += text;
      for (const line of text.split(/\r?\n/)) if (line.trim() !== '') log(`  | ${line.trimEnd()}`);
    };
    child.stdout?.on('data', onData);
    child.stderr?.on('data', onData);
    child.on('error', (error) => finish(null, error.message));
    child.on('close', (code) => finish(code, null));
  });
}

/**
 * The newest `.wgt` in a folder.
 *
 * @param {string} dir - The folder.
 * @returns {{ file: string, mtimeMs: number } | null} Its name and time, or `null`.
 */
function newestWgt(dir) {
  if (!existsSync(dir)) return null;
  let best = null;
  for (const file of readdirSync(dir)) {
    if (!file.toLowerCase().endsWith('.wgt')) continue;
    const mtimeMs = statSync(join(dir, file)).mtimeMs;
    if (best === null || mtimeMs > best.mtimeMs) best = { file, mtimeMs };
  }
  return best;
}

/**
 * The `rb-*.jsonl` files of the logs folder and their sizes.
 *
 * @param {string} dir - The logs folder.
 * @returns {Map<string, number>} File path → size in bytes.
 */
function benchLogSizes(dir) {
  /** @type {Map<string, number>} */
  const out = new Map();
  if (!existsSync(dir)) return out;
  for (const file of readdirSync(dir)) {
    if (/^rb-.*\.jsonl$/.test(file)) out.set(join(dir, file), statSync(join(dir, file)).size);
  }
  return out;
}

/**
 * Reads a file's bytes from `offset` to its end.
 *
 * @param {string} path - The file.
 * @param {number} offset - Where to start.
 * @param {number} size - Its current size.
 * @returns {string} The text.
 */
function readFrom(path, offset, size) {
  const length = size - offset;
  const buffer = Buffer.alloc(length);
  const fd = openSync(path, 'r');
  try {
    let read = 0;
    while (read < length) {
      const n = readSync(fd, buffer, read, length - read, offset + read);
      if (n === 0) break;
      read += n;
    }
    return buffer.toString('utf8', 0, read);
  } finally {
    closeSync(fd);
  }
}

/**
 * The campaign itself (see the module docblock).
 *
 * @param {string[]} argv - Arguments after the script name.
 * @returns {Promise<number>} Resolves with the exit code: 0 done, 1 usage / preflight, 2 gave up,
 *   130 interrupted.
 */
async function main(argv) {
  const started = new Date();
  /** @type {CampaignOptions} */
  let options;
  try {
    options = parseArgs(argv, process.env, started);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
  if (options.help) {
    console.log(USAGE);
    return 0;
  }
  if (!options.dryRun) mkdirSync(options.resultsDir, { recursive: true });
  const log = createLogger(options.dryRun ? null : join(options.resultsDir, 'campaign.log'));
  const tools = resolveTools(process.env, existsSync, process.platform);
  const distDir = join(APP_DIR, BENCH_DIST);
  const timeoutMs = COMMAND_TIMEOUT_MS;
  let stopping = false;
  const abort = new AbortController();

  /**
   * Sleeps, waking early on Ctrl+C.
   *
   * @param {number} ms - Duration.
   * @returns {Promise<void>} Resolves after `ms` or on Ctrl+C.
   */
  const sleep = async (ms) => {
    try {
      await delay(ms, undefined, { signal: abort.signal });
    } catch {
      // interrupted
    }
  };

  /**
   * Runs one command (printed only in a dry run).
   *
   * @param {Command} c - The command.
   * @param {{ cwd?: string, env?: NodeJS.ProcessEnv }} [extra] - Working folder and environment.
   * @returns {Promise<CommandResult>} Its result.
   */
  const exec = async (c, extra) => {
    log(`${clock(new Date())} [${c.label}] ${formatCommand(c)}`);
    if (options.dryRun)
      return { code: 0, output: 'connected to (dry run)', timedOut: false, error: null };
    return execCommand(c, timeoutMs, log, extra);
  };

  /**
   * Recovers a wedged sdb: kill-server, start-server, connect.
   *
   * @returns {Promise<void>} Resolves when the three commands have run.
   */
  const recoverSdb = async () => {
    log(`${clock(new Date())} recovering sdb`);
    for (const c of commands.recover) {
      await exec(c);
      await sleep(1000);
    }
  };

  /**
   * Runs a command until it succeeds, recovering sdb between attempts.
   *
   * @param {Command} c - The command.
   * @param {number} attempts - Tries.
   * @returns {Promise<boolean>} Resolves `true` once it succeeded, `false` when every try failed.
   */
  const runChecked = async (c, attempts) => {
    for (let attempt = 1; attempt <= attempts && !stopping; attempt++) {
      const result = await exec(c);
      if (!commandFailed(c.check, result)) return true;
      log(
        `  ${c.label} failed (attempt ${attempt}/${attempts}` +
          `${result.timedOut ? ', timed out' : ''}${result.error !== null ? `, ${result.error}` : ''}` +
          `${result.code !== null ? `, exit ${result.code}` : ''})`,
      );
      if (attempt < attempts) await recoverSdb();
    }
    return false;
  };

  /**
   * Runs a command whose failure is fine (killing an app that is not running, uninstalling one that is
   * not installed) — but recovers sdb when it hung.
   *
   * @param {Command} c - The command.
   * @returns {Promise<void>} Resolves when it has run.
   */
  const runLoose = async (c) => {
    const result = await exec(c);
    if (result.timedOut) await recoverSdb();
  };

  /**
   * Kills the app, waits, launches it again.
   *
   * @param {string} why - For the log.
   * @returns {Promise<boolean>} Resolves with whether the launch went through.
   */
  const relaunch = async (why) => {
    log(`${clock(new Date())} relaunch (${why})`);
    await runLoose(commands.kill);
    await sleep(RELAUNCH_PAUSE_MS);
    if (stopping) return false;
    return runChecked(commands.launch, COMMAND_ATTEMPTS);
  };

  log(
    `TV render-bench campaign — ${started.toISOString()}${options.dryRun ? ' (DRY RUN: no device is touched)' : ''}`,
  );
  log(
    `  target ${options.target} · ${options.passesGiven ? options.passes : 'build-set'} passes` +
      ` · watchdog ${options.watchdogS} s · max restarts ${options.maxRestarts}` +
      ` · install ${options.install ? 'yes' : 'no'}`,
  );
  log(`  tizen ${tools.tizen} · sdb ${tools.sdb} · app ${BENCH_APP_ID} · dist ${distDir}`);
  log(`  log server ${options.logUrl} · logs ${options.logsDir} · results ${options.resultsDir}`);

  // ---- preflight
  const serverUp = await checkLogServer(options.logUrl);
  if (!serverUp) {
    log(`Log server not reachable at ${options.logUrl}/health. Start it from the repo root with:`);
    log(`  ${logServerCommand(options)}`);
    if (!options.dryRun) return 1;
  } else {
    log(`  log server: ok`);
  }
  const appJs = join(distDir, 'app.js');
  /** The campaign build's id: payloads of any other build are stale sessions, never a pass. */
  let buildId = null;
  if (!existsSync(appJs) || !existsSync(join(distDir, 'config.xml'))) {
    log(`${distDir} has no bench build. Build it with (PowerShell):`);
    log(`  ${CAMPAIGN_BUILD_COMMAND}`);
    if (!options.dryRun) return 1;
  } else {
    const bundle = readFileSync(appJs, 'utf8');
    buildId = parseBuildId(bundle);
    log(`  build id: ${buildId ?? '(none — every session counts)'}`);
    const output = parseBuildOutput(buildId);
    log(
      `  output: ${output === null ? "the window's backbuffer" : `${output} backbuffer ('fit' upscale; frames larger are skipped)`}`,
    );
    const port = new URL(options.logUrl).port || '80';
    if (!bundle.includes(`:${port}`)) {
      log(
        `  warning: dist-bench/app.js does not mention port ${port} — was it built with VITE_REPORT_URL?`,
      );
    }
    const build = parseCampaignBuild(bundle);
    if (build === null) {
      log(`dist-bench is not a campaign build — rebuild with ${CAMPAIGN_BUILD_COMMAND}`);
      if (!options.dryRun) return 1;
    } else {
      log(
        `  campaign build: passes ${build.passes.join(',')} (WebGL per pass) · pause ${build.pauseS} s`,
      );
      if (!options.passesGiven) {
        options.passes = build.passes.length;
      } else if (options.passes !== build.passes.length) {
        log(
          `  warning: --passes ${options.passes} but the build carries ${build.passes.length} passes`,
        );
      }
      const watchdogS = campaignWatchdogS(options.watchdogS, build.pauseS);
      if (watchdogS !== options.watchdogS) {
        log(
          `  watchdog raised to ${watchdogS} s (pause ${build.pauseS} s + ${WATCHDOG_PAUSE_MARGIN_S} s)`,
        );
        options.watchdogS = watchdogS;
      }
    }
  }
  log(`  running ${options.passes} passes · watchdog ${options.watchdogS} s`);
  let wgt = newestWgt(distDir);
  if (options.install) {
    const appTime = existsSync(appJs) ? statSync(appJs).mtimeMs : 0;
    if (wgt === null || wgt.mtimeMs < appTime) {
      log(
        `  ${wgt === null ? 'no .wgt' : `${wgt.file} is older than app.js`} — packaging with profile ${options.profile}`,
      );
      const pack = {
        label: 'package',
        command: process.execPath,
        args: [join(APP_DIR, 'scripts', 'tizen-bench.mjs'), 'package'],
        check: /** @type {'tizen'} */ ('tizen'),
      };
      const result = await exec(pack, {
        cwd: APP_DIR,
        env: {
          ...process.env,
          TIZEN_PROFILE: options.profile,
          TIZEN_CLI: tools.tizen,
          SDB: tools.sdb,
        },
      });
      if (commandFailed('tizen', result) && !options.dryRun) {
        log('Packaging failed — see the output above.');
        return 1;
      }
      wgt =
        newestWgt(distDir) ?? (options.dryRun ? { file: 'ShmupCupBench.wgt', mtimeMs: 0 } : null);
      if (wgt === null) {
        log(`No .wgt in ${distDir} after packaging.`);
        return 1;
      }
    } else {
      log(`  package: ${wgt.file}`);
    }
  }
  const commands = deviceCommands(tools, options.target, distDir, wgt?.file ?? 'ShmupCupBench.wgt');
  if (!(await runChecked(commands.connect, COMMAND_ATTEMPTS))) {
    log(
      `Could not connect to ${options.target}. Is the TV on, in Developer Mode, with this desktop's IP allowed?`,
    );
    if (!options.dryRun) return 1;
  }

  if (options.dryRun) {
    log('Commands the campaign runs:');
    log(`  start:      ${formatCommand(commands.kill)}`);
    if (options.install) {
      log(`              ${formatCommand(commands.uninstall)}`);
      log(`              ${formatCommand(commands.install)}`);
    }
    log(`              ${formatCommand(commands.launch)}`);
    log(`  next pass / watchdog: kill, wait ${RELAUNCH_PAUSE_MS / 1000} s, launch (as above)`);
    log(`  sdb recovery: ${commands.recover.map(formatCommand).join(' ; ')}`);
    log(
      `  poll ${options.logsDir}${'/'}rb-*.jsonl every ${POLL_MS / 1000} s; "done": true or a newer session ends a pass`,
    );
    log('Dry run: nothing was run on the device.');
    return 0;
  }

  // ---- start
  const tracker = createTracker();
  /** @type {Map<string, { offset: number, rest: string }>} */
  const reads = new Map();
  for (const [path, size] of benchLogSizes(options.logsDir))
    reads.set(path, { offset: size, rest: '' });
  let interrupted = false;
  process.on('SIGINT', () => {
    if (stopping) process.exit(130);
    stopping = true;
    interrupted = true;
    abort.abort();
    console.log(
      '\nCtrl+C — stopping the supervision (the TV app keeps running). Ctrl+C again to quit at once.',
    );
  });

  await runLoose(commands.kill);
  if (options.install) {
    await runLoose(commands.uninstall);
    if (!(await runChecked(commands.install, COMMAND_ATTEMPTS))) {
      log('Install failed — giving up.');
      return 1;
    }
  }
  if (!(await runChecked(commands.launch, COMMAND_ATTEMPTS))) {
    log('Launch failed — the watchdog will retry.');
  }
  const startMs = Date.now();
  log(
    `${clock(new Date())} campaign started; waiting for payloads (the app counts down before each pass)`,
  );

  // ---- supervise
  let lastPayloadMs = Date.now();
  let lastHeartbeatMs = Date.now();
  let restarts = 0;
  let silentWatchdogs = 0;
  let gaveUp = false;
  let wentSilent = false;
  /** Sessions of other builds already reported as ignored. */
  const ignored = new Set();
  supervise: while (!stopping) {
    await sleep(POLL_MS);
    if (stopping) break;
    for (const [path, size] of benchLogSizes(options.logsDir)) {
      const state = reads.get(path) ?? { offset: 0, rest: '' };
      reads.set(path, state);
      if (size <= state.offset) continue;
      silentWatchdogs = 0;
      const { lines, rest } = splitJsonl(state.rest, readFrom(path, state.offset, size));
      state.offset = size;
      state.rest = rest;
      for (const line of lines) {
        const payload = parseBenchLine(line);
        if (payload === null) continue;
        if (isForeignPayload(payload, buildId)) {
          if (!ignored.has(payload.session)) {
            ignored.add(payload.session);
            log(
              `${clock(new Date())} ignoring ${payload.session}: build ${String(payload.env.buildId)},` +
                ` not this campaign's ${String(buildId)} (a stale session's re-sent records)`,
            );
          }
          continue;
        }
        const ingest = ingestPayload(tracker, payload, path);
        lastPayloadMs = Date.now();
        for (const old of ingest.superseded) {
          log(
            `${clock(new Date())} pass ${old.pass}/${options.passes} ${old.id} superseded by ${ingest.session.id}` +
              ` — no done payload (${old.indexes.size}/${old.scenarios ?? '?'} records)`,
          );
        }
        log(formatProgress(ingest, payload, options.passes, new Date()));
        if (tracker.finishedPasses >= options.passes) break supervise;
        if (!ingest.finishedPass) continue;
        log(
          `${clock(new Date())} pass ${ingest.session.pass}/${options.passes} finished — starting pass ${currentPass(tracker)}`,
        );
        await relaunch('next pass');
        lastPayloadMs = Date.now();
      }
    }
    const now = Date.now();
    if (now - lastPayloadMs > options.watchdogS * 1000) {
      silentWatchdogs++;
      if (finalPassSilent(tracker, options.passes, silentWatchdogs)) {
        log(
          `${clock(new Date())} the final pass (${options.passes}/${options.passes}) sent no done payload and nothing` +
            ` was logged through ${silentWatchdogs} watchdog periods in a row — its last scenario was` +
            ' probably skipped. Stopping (exit 2).',
        );
        wentSilent = true;
        break;
      }
      restarts = countRestart(tracker);
      if (restarts > options.maxRestarts) {
        log(
          `${clock(new Date())} no payload for ${options.watchdogS} s and ${options.maxRestarts} restarts used — giving up.`,
        );
        gaveUp = true;
        break;
      }
      log(
        `${clock(new Date())} watchdog: no payload for ${Math.round((now - lastPayloadMs) / 1000)} s` +
          ` — restart ${restarts}/${options.maxRestarts} (pass ${currentPass(tracker)})`,
      );
      await relaunch('watchdog');
      lastPayloadMs = Date.now();
    } else if (now - lastHeartbeatMs > 10 * 60_000) {
      lastHeartbeatMs = now;
      log(
        `${clock(new Date())} running ${Math.round((now - startMs) / 60_000)} min · pass ${currentPass(tracker)}/${options.passes}` +
          ` · last payload ${Math.round((now - lastPayloadMs) / 1000)} s ago · restarts ${restarts}`,
      );
    }
  }

  // ---- finish
  if (!interrupted) {
    log(`${clock(new Date())} stopping the app`);
    await runLoose(commands.kill);
  }
  const copied = [];
  for (const s of tracker.sessions.values()) {
    // Finished sessions, and the final pass's that went silent (all but its skipped last scenario).
    const silentFinal = wentSilent && s.pass === options.passes;
    if ((!s.done && !s.superseded && !silentFinal) || s.file === null) continue;
    const to = join(options.resultsDir, basename(s.file));
    copyFileSync(s.file, to);
    copied.push(to);
  }
  const minutes = Math.round((Date.now() - startMs) / 60_000);
  const outcome = interrupted
    ? 'INTERRUPTED'
    : gaveUp
      ? 'GAVE UP'
      : wentSilent
        ? 'STOPPED (final pass silent, no done payload)'
        : 'complete';
  log(
    `${clock(new Date())} campaign ${outcome}` +
      ` after ${minutes} min · ${tracker.finishedPasses}/${options.passes} passes · ${restarts} restart(s)`,
  );
  for (const line of summaryLines(tracker)) log(`  ${line}`);
  for (const s of tracker.sessions.values())
    if (!s.done && !s.superseded && s.file !== null) log(`  unfinished: ${s.file}`);
  log(
    `  copied ${copied.length} session file(s) to ${options.resultsDir}; log ${join(options.resultsDir, 'campaign.log')}`,
  );
  return interrupted ? 130 : gaveUp || wentSilent ? 2 : 0;
}

/** `true` when run as a script (`node scripts/bench-campaign.mjs …`), `false` when imported. */
const isMain =
  process.argv[1] !== undefined && /bench-campaign\.mjs$/.test(process.argv[1].replace(/\\/g, '/'));
if (isMain) process.exitCode = await main(process.argv.slice(2));
