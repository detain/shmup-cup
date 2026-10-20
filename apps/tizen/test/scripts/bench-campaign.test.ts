/**
 * Unit tests for the TV render-bench campaign orchestrator (scripts/bench-campaign.mjs, plan R0-03):
 * its pure helpers only — argument parsing, the results folder's name, JSONL parsing, session
 * tracking and pass (`done`) detection, the device commands and how their output is judged. Nothing
 * is ever run against sdb, the Tizen CLI or a TV.
 */
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  campaignWatchdogS,
  commandFailed,
  countRestart,
  createTracker,
  currentPass,
  DEFAULT_LOGS_DIR,
  DEFAULT_TARGET,
  deviceCommands,
  finalPassSilent,
  formatCommand,
  formatProgress,
  ingestPayload,
  logServerCommand,
  missingIndexes,
  normalizeLogUrl,
  parseArgs,
  parseBenchLine,
  parseCampaignBuild,
  parseBuildId,
  parseBuildOutput,
  isForeignPayload,
  resolveTools,
  resultsDirName,
  sessionStatus,
  splitJsonl,
  summaryLines,
} from '../../scripts/bench-campaign.mjs';

/** A fake repository root that relative paths resolve against. */
const ROOT = resolve('/repo');
/** A fixed start time: 19 Oct 2026, local. */
const NOW = new Date(2026, 9, 19, 21, 5, 9);

/**
 * One JSONL line as the log server writes it for a render-bench payload.
 *
 * @param session - Session id.
 * @param seq - Payload number.
 * @param indexes - Scenario indexes of the records it carries.
 * @param options - `done`, the WebGL version, the scenario count, a decode record.
 * @returns The line.
 */
function line(
  session: string,
  seq: number,
  indexes: number[],
  options: { done?: boolean; gl?: number; scenarios?: number; decode?: boolean } = {},
): string {
  const gl = options.gl ?? 1;
  return JSON.stringify({
    receivedAt: '2026-10-19T19:53:55.661Z',
    from: '10.0.0.224',
    kind: 'render-bench',
    session,
    seq,
    sentAt: 1,
    env: { buildId: 'abc', host: 'tizen', webGLVersion: gl, scenarios: options.scenarios ?? 4 },
    results: indexes.map((index) => ({ scenario: `s${index}-busy`, index, webGLVersion: gl })),
    ...(options.decode === true ? { decode: { pages: [], repetitions: 8 } } : {}),
    done: options.done === true,
  });
}

/**
 * Parses a line that must be a bench payload.
 *
 * @param text - The line.
 * @returns The payload.
 */
function payloadOf(text: string): NonNullable<ReturnType<typeof parseBenchLine>> {
  const p = parseBenchLine(text);
  if (p === null) throw new Error('not a bench payload');
  return p;
}

describe('parseArgs', () => {
  it('has the campaign defaults', () => {
    const o = parseArgs([], {}, NOW, ROOT);
    expect(o).toMatchObject({
      target: DEFAULT_TARGET,
      passes: 4,
      passesGiven: false,
      logUrl: 'http://127.0.0.1:8787',
      logsDir: resolve(ROOT, DEFAULT_LOGS_DIR),
      watchdogS: 300,
      maxRestarts: 20,
      install: true,
      profile: 'Shmup',
      dryRun: false,
      help: false,
    });
    expect(o.resultsDir).toBe(
      resolve(ROOT, 'tools/input-probe/results/2026-10-19-m7-bench-resolutions'),
    );
  });

  it('takes the target and profile from the environment', () => {
    expect(parseArgs([], { TIZEN_TARGET: '10.0.0.9:26101' }, NOW, ROOT).target).toBe(
      '10.0.0.9:26101',
    );
    expect(parseArgs([], { TV_IP: '10.0.0.7' }, NOW, ROOT).target).toBe('10.0.0.7:26101');
    expect(parseArgs([], { TIZEN_PROFILE: 'Other' }, NOW, ROOT).profile).toBe('Other');
  });

  it('reads every flag, in both spellings', () => {
    const o = parseArgs(
      [
        '--',
        '--target',
        '1.2.3.4:26101',
        '--passes=2',
        '--log-url',
        'http://10.0.0.2:9000/report/',
        '--logs',
        'logs-here',
        '--watchdog-s',
        '90',
        '--max-restarts=5',
        '--no-install',
        '--results',
        join(ROOT, 'out'),
        '--profile',
        'P',
        '--dry-run',
      ],
      { TIZEN_TARGET: 'ignored:1' },
      NOW,
      ROOT,
    );
    expect(o).toMatchObject({
      target: '1.2.3.4:26101',
      passes: 2,
      passesGiven: true,
      logUrl: 'http://10.0.0.2:9000',
      logsDir: resolve(ROOT, 'logs-here'),
      watchdogS: 90,
      maxRestarts: 5,
      install: false,
      resultsDir: join(ROOT, 'out'),
      profile: 'P',
      dryRun: true,
    });
  });

  it('rejects bad input', () => {
    expect(() => parseArgs(['--passes', '0'], {}, NOW, ROOT)).toThrow(/--passes/);
    expect(() => parseArgs(['--watchdog-s', 'x'], {}, NOW, ROOT)).toThrow(/--watchdog-s/);
    expect(() => parseArgs(['--target'], {}, NOW, ROOT)).toThrow(/needs a value/);
    expect(() => parseArgs(['--target', '--dry-run'], {}, NOW, ROOT)).toThrow(/needs a value/);
    expect(() => parseArgs(['--target', 'no-port'], {}, NOW, ROOT)).toThrow(/ip>:<port/);
    expect(() => parseArgs(['--bogus'], {}, NOW, ROOT)).toThrow(/Unknown option/);
    expect(() => parseArgs(['--log-url', 'ftp://x'], {}, NOW, ROOT)).toThrow(/http/);
  });

  it('answers --help', () => {
    expect(parseArgs(['--help'], {}, NOW, ROOT).help).toBe(true);
  });
});

describe('resultsDirName and normalizeLogUrl', () => {
  it('names the folder after the local day, zero-padded', () => {
    expect(resultsDirName(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05-m7-bench-resolutions');
    expect(resultsDirName(NOW)).toBe('2026-10-19-m7-bench-resolutions');
  });

  it('strips slashes and /report', () => {
    expect(normalizeLogUrl('http://127.0.0.1:8787/')).toBe('http://127.0.0.1:8787');
    expect(normalizeLogUrl(' http://h:1/report ')).toBe('http://h:1');
  });
});

describe('logServerCommand', () => {
  it('is the plain command for the defaults, with PORT / LOG_DIR otherwise', () => {
    expect(logServerCommand(parseArgs([], {}, NOW, ROOT), ROOT)).toBe(
      'node tools/input-probe/server/log-server.mjs',
    );
    const custom = logServerCommand(
      parseArgs(['--log-url', 'http://127.0.0.1:9000', '--logs', 'x'], {}, NOW, ROOT),
      ROOT,
    );
    expect(custom).toContain('$env:PORT="9000"');
    expect(custom).toContain(`$env:LOG_DIR="${resolve(ROOT, 'x')}"`);
  });
});

describe('parseBenchLine and splitJsonl', () => {
  it('parses a render-bench line', () => {
    const p = payloadOf(line('rb-a', 3, [2], { gl: 2 }));
    expect(p).toMatchObject({ session: 'rb-a', seq: 3, done: false, decode: null });
    expect(p.env.webGLVersion).toBe(2);
    expect(p.results).toHaveLength(1);
  });

  it('marks the done payload and its decode record', () => {
    const p = payloadOf(line('rb-a', 9, [], { done: true, decode: true }));
    expect(p.done).toBe(true);
    expect(p.decode).not.toBeNull();
  });

  it('ignores other kinds, torn and malformed lines', () => {
    expect(parseBenchLine('')).toBeNull();
    expect(parseBenchLine('{"kind":"render-bench","sess')).toBeNull();
    expect(parseBenchLine('[1]')).toBeNull();
    expect(parseBenchLine(JSON.stringify({ session: 'ip-x', seq: 1 }))).toBeNull();
    expect(parseBenchLine(JSON.stringify({ kind: 'render-bench', session: 'rb-x' }))).toBeNull();
    const odd = payloadOf(
      JSON.stringify({ kind: 'render-bench', session: 'rb-x', seq: 1, env: null, results: [null] }),
    );
    expect(odd.results).toEqual([]);
    expect(odd.done).toBe(false);
  });

  it('keeps a torn last line for the next read', () => {
    const first = splitJsonl('', 'a\nb\nc');
    expect(first).toEqual({ lines: ['a', 'b'], rest: 'c' });
    expect(splitJsonl(first.rest, 'd\n\n')).toEqual({ lines: ['cd'], rest: '' });
  });
});

describe('session tracking', () => {
  it('counts distinct scenario indexes, the last seq and the GL version', () => {
    const t = createTracker();
    ingestPayload(t, payloadOf(line('rb-a', 1, [0], { gl: 2 })), 'f');
    ingestPayload(t, payloadOf(line('rb-a', 2, [1])), 'f');
    const repeat = ingestPayload(t, payloadOf(line('rb-a', 2, [1])), 'f');
    expect(repeat.records).toHaveLength(0);
    const s = t.sessions.get('rb-a');
    expect(s?.indexes.size).toBe(2);
    expect(s?.lastSeq).toBe(2);
    expect(s?.payloads).toBe(3);
    expect(s?.gl).toBe(1);
    expect(s?.file).toBe('f');
    expect(s && missingIndexes(s)).toEqual([2, 3]);
  });

  it('finishes a pass on the first done payload only and assigns later sessions the next pass', () => {
    const t = createTracker();
    expect(currentPass(t)).toBe(1);
    ingestPayload(t, payloadOf(line('rb-a', 1, [0, 1, 2, 3])), null);
    const done = ingestPayload(
      t,
      payloadOf(line('rb-a', 2, [], { done: true, decode: true })),
      null,
    );
    expect(done.finishedPass).toBe(true);
    expect(t.finishedPasses).toBe(1);
    expect(
      ingestPayload(t, payloadOf(line('rb-a', 2, [], { done: true })), null).finishedPass,
    ).toBe(false);
    expect(t.finishedPasses).toBe(1);
    const next = ingestPayload(t, payloadOf(line('rb-b', 1, [0], { gl: 2 })), null);
    expect(next.session.pass).toBe(2);
    expect(currentPass(t)).toBe(2);
  });

  it('counts a done session with missing scenarios as a finished pass', () => {
    const t = createTracker();
    ingestPayload(t, payloadOf(line('rb-a', 1, [0, 2])), null);
    const r = ingestPayload(t, payloadOf(line('rb-a', 2, [], { done: true })), null);
    expect(r.finishedPass).toBe(true);
    expect(missingIndexes(r.session)).toEqual([1, 3]);
  });

  it('counts restarts per pass and in total', () => {
    const t = createTracker();
    expect(countRestart(t)).toBe(1);
    ingestPayload(t, payloadOf(line('rb-a', 1, [0, 1, 2, 3])), null);
    ingestPayload(t, payloadOf(line('rb-a', 2, [], { done: true })), null);
    expect(countRestart(t)).toBe(2);
    expect(countRestart(t)).toBe(3);
    expect(t.restartsByPass.get(1)).toBe(1);
    expect(t.restartsByPass.get(2)).toBe(2);
  });

  it('reports no missing indexes while the scenario count is unknown', () => {
    const t = createTracker();
    const p = payloadOf(line('rb-a', 1, [0]));
    p.env = {};
    expect(missingIndexes(ingestPayload(t, p, null).session)).toEqual([]);
  });
});

describe('progress and summary lines', () => {
  it('prints one compact line per payload', () => {
    const t = createTracker();
    const p = payloadOf(line('rb-a', 1, [0], { gl: 2 }));
    expect(formatProgress(ingestPayload(t, p, null), p, 4, NOW)).toBe(
      '21:05:09 pass 1/4 rb-a #1 scenario 1/4 s0-busy gl=2',
    );
    const done = payloadOf(line('rb-a', 2, [], { done: true, decode: true, gl: 2 }));
    expect(formatProgress(ingestPayload(t, done, null), done, 4, NOW)).toBe(
      '21:05:09 pass 1/4 rb-a #2 DONE 1/4 records + decode gl=2 · missing 1,2,3',
    );
  });

  it('summarises every session', () => {
    const t = createTracker();
    expect(summaryLines(t)).toEqual(['(no bench payload received)']);
    ingestPayload(t, payloadOf(line('rb-a', 1, [0, 1, 2, 3])), null);
    ingestPayload(t, payloadOf(line('rb-a', 2, [], { done: true, decode: true })), null);
    countRestart(t);
    ingestPayload(t, payloadOf(line('rb-b', 1, [0], { gl: 2 })), null);
    expect(summaryLines(t)).toEqual([
      'rb-a pass 1 GL 1 · 4/4 records + decode · missing none · restarts 0 · done',
      'rb-b pass 2 GL 2 · 1/4 records · missing 1,2,3 · restarts 1 · UNFINISHED',
    ]);
  });
});

describe('device commands', () => {
  const tools = { tizen: 'C:\\Tizen Studio\\tizen.bat', sdb: 'sdb' };
  const cmds = deviceCommands(tools, '10.0.0.224:26101', 'D:\\dist-bench', 'ShmupCupBench.wgt');

  it('kills, uninstalls, installs and launches the bench app', () => {
    expect([cmds.kill.command, ...cmds.kill.args]).toEqual([
      'sdb',
      '-s',
      '10.0.0.224:26101',
      'shell',
      '0',
      'was_kill',
      'ShmpCupBnc.RenderBench',
    ]);
    expect(cmds.uninstall.args).toEqual([
      'uninstall',
      '-p',
      'ShmpCupBnc',
      '-s',
      '10.0.0.224:26101',
    ]);
    expect(cmds.install.args).toEqual([
      'install',
      '-n',
      'ShmupCupBench.wgt',
      '-s',
      '10.0.0.224:26101',
      '--',
      'D:\\dist-bench',
    ]);
    expect(cmds.launch.args).toEqual([
      'run',
      '-p',
      'ShmpCupBnc.RenderBench',
      '-s',
      '10.0.0.224:26101',
    ]);
    expect(cmds.recover.map((c) => c.args[0])).toEqual(['kill-server', 'start-server', 'connect']);
  });

  it('quotes paths with spaces when printed', () => {
    expect(formatCommand(cmds.launch)).toBe(
      '> "C:\\Tizen Studio\\tizen.bat" run -p ShmpCupBnc.RenderBench -s 10.0.0.224:26101',
    );
  });

  it('judges output, not only exit codes', () => {
    const ok = { code: 0, output: '', timedOut: false, error: null };
    expect(commandFailed('tizen', ok)).toBe(false);
    expect(commandFailed('tizen', { ...ok, output: 'Failed to launch the application' })).toBe(
      true,
    );
    expect(commandFailed('sdb', { ...ok, output: 'error: device offline' })).toBe(true);
    expect(commandFailed('tizen', { ...ok, code: 1 })).toBe(true);
    expect(commandFailed('tizen', { ...ok, timedOut: true })).toBe(true);
    expect(commandFailed('sdb', { ...ok, code: null, error: 'ENOENT' })).toBe(true);
    expect(commandFailed('connect', { ...ok, output: 'connected to 10.0.0.224:26101' })).toBe(
      false,
    );
    expect(commandFailed('connect', { ...ok, output: 'already connected to x' })).toBe(false);
    expect(commandFailed('connect', { ...ok, output: 'failed to connect to x' })).toBe(true);
  });
});

describe('the campaign build check', () => {
  it('finds the passes and the pause in a minified bundle', () => {
    const bundle = 'var a=1;const Q={campaign:sw(`1,2,1,2`,`30`),x:`12`};';
    expect(parseCampaignBuild(bundle)).toEqual({ passes: [1, 2, 1, 2], pauseS: 30 });
    expect(parseCampaignBuild('f(`2`,`45`)')).toEqual({ passes: [2], pauseS: 45 });
  });

  it('falls back to the default pause for an empty literal', () => {
    expect(parseCampaignBuild('f(`1,1`,``)')).toEqual({ passes: [1, 1], pauseS: 30 });
  });

  it('reads the build id, and tells a stale session of another build apart', () => {
    const bundle =
      'reportUrl:`http://10.0.0.2:8787`,buildId:`9c7a594+`,assets:d,campaign:sw(`1,2`,`30`)';
    expect(parseBuildId(bundle)).toBe('9c7a594+');
    expect(parseBuildId('nothing here')).toBeNull();
    const payload = (buildId: string) => ({
      session: 'rb-a',
      seq: 1,
      done: false,
      env: { buildId },
      results: [],
      decode: null,
      receivedAt: null,
    });
    expect(isForeignPayload(payload('9c7a594+'), '9c7a594+')).toBe(false);
    expect(isForeignPayload(payload('2a82316+'), '9c7a594+')).toBe(true);
    expect(isForeignPayload(payload('2a82316+'), null)).toBe(false);
  });

  it('reads a build output from the build id, and keeps outputs apart (VITE_BENCH_OUTPUT)', () => {
    const bundle = 'reportUrl:`http://10.0.0.2:8787`,buildId:`9e60df2+@1280x720`,assets:d';
    expect(parseBuildId(bundle)).toBe('9e60df2+@1280x720');
    expect(parseBuildOutput(parseBuildId(bundle))).toBe('1280x720');
    expect(parseBuildOutput('9e60df2@960x540')).toBe('960x540');
    expect(parseBuildOutput('9e60df2+')).toBeNull();
    expect(parseBuildOutput(null)).toBeNull();
    const payload = (buildId: string) => ({
      session: 'rb-a',
      seq: 1,
      done: false,
      env: { buildId },
      results: [],
      decode: null,
      receivedAt: null,
    });
    // The 720p campaign ignores the 1080p build's and the 540p build's re-sent sessions.
    expect(isForeignPayload(payload('9e60df2+'), '9e60df2+@1280x720')).toBe(true);
    expect(isForeignPayload(payload('9e60df2+@960x540'), '9e60df2+@1280x720')).toBe(true);
    expect(isForeignPayload(payload('9e60df2+@1280x720'), '9e60df2+@1280x720')).toBe(false);
  });

  it('rejects a bundle without a campaign', () => {
    expect(parseCampaignBuild('f(``,`30`)')).toBeNull();
    expect(parseCampaignBuild('f(`1,3`,`30`)')).toBeNull();
    expect(parseCampaignBuild('nothing here')).toBeNull();
  });

  it('keeps the watchdog at least two minutes past the pause', () => {
    expect(campaignWatchdogS(300, 30)).toBe(300);
    expect(campaignWatchdogS(60, 30)).toBe(150);
    expect(campaignWatchdogS(300, 600)).toBe(720);
  });
});

describe('superseded sessions', () => {
  it('finishes an unfinished session when a newer one starts', () => {
    const t = createTracker();
    ingestPayload(t, payloadOf(line('rb-a', 1, [0, 1, 2])), null);
    const next = ingestPayload(t, payloadOf(line('rb-b', 1, [0], { gl: 2 })), null);
    expect(next.superseded.map((s) => s.id)).toEqual(['rb-a']);
    expect(next.finishedPass).toBe(false);
    expect(next.session.pass).toBe(2);
    expect(t.finishedPasses).toBe(1);
    const a = t.sessions.get('rb-a');
    expect(a && sessionStatus(a)).toBe('superseded, no done payload');
    expect(a && missingIndexes(a)).toEqual([3]);
    expect(summaryLines(t)[0]).toContain('· superseded, no done payload');
  });

  it('never supersedes a done session, nor counts a late done twice', () => {
    const t = createTracker();
    ingestPayload(t, payloadOf(line('rb-a', 1, [0, 1, 2, 3])), null);
    ingestPayload(t, payloadOf(line('rb-a', 2, [], { done: true })), null);
    expect(ingestPayload(t, payloadOf(line('rb-b', 1, [0])), null).superseded).toEqual([]);
    ingestPayload(t, payloadOf(line('rb-c', 1, [0])), null);
    expect(t.finishedPasses).toBe(2);
    const late = ingestPayload(t, payloadOf(line('rb-b', 2, [], { done: true })), null);
    expect(late.finishedPass).toBe(false);
    expect(t.finishedPasses).toBe(2);
    const b = t.sessions.get('rb-b');
    expect(b && sessionStatus(b)).toBe('done');
  });
});

describe('finalPassSilent', () => {
  it('stops only in the final pass, with a session, after three silent watchdogs', () => {
    const t = createTracker();
    ingestPayload(t, payloadOf(line('rb-a', 1, [0])), null);
    expect(finalPassSilent(t, 2, 3)).toBe(false);
    ingestPayload(t, payloadOf(line('rb-b', 1, [0, 1, 2])), null);
    expect(currentPass(t)).toBe(2);
    expect(finalPassSilent(t, 2, 2)).toBe(false);
    expect(finalPassSilent(t, 2, 3)).toBe(true);
    ingestPayload(t, payloadOf(line('rb-b', 2, [], { done: true })), null);
    expect(finalPassSilent(t, 2, 3)).toBe(false);
  });

  it('does not stop a final pass that has not produced a session yet', () => {
    const t = createTracker();
    ingestPayload(t, payloadOf(line('rb-a', 1, [0, 1, 2, 3])), null);
    ingestPayload(t, payloadOf(line('rb-a', 2, [], { done: true })), null);
    expect(finalPassSilent(t, 2, 5)).toBe(false);
  });
});

describe('resolveTools', () => {
  it('prefers TIZEN_CLI / SDB', () => {
    expect(resolveTools({ TIZEN_CLI: 't', SDB: 's' }, () => true, 'win32')).toEqual({
      tizen: 't',
      sdb: 's',
    });
  });

  it('finds tizen.bat in a Tizen Studio folder on Windows', () => {
    const tools = resolveTools({}, (p) => p.startsWith('C:\\tizen-studio'), 'win32');
    expect(tools.tizen).toBe('C:\\tizen-studio\\tools\\ide\\bin\\tizen.bat');
    expect(tools.sdb).toBe('sdb');
  });

  it('falls back to the CLI on PATH', () => {
    expect(resolveTools({}, () => false, 'linux').tizen).toMatch(/^tizen(\.bat)?$/);
  });
});
