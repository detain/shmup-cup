/**
 * Paths and child-process helpers for tests of the Node scripts.
 */

import { spawnSync } from 'node:child_process';
import { chmodSync, cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** tools/input-probe */
export const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const created: string[] = [];

/** Creates a fresh temporary directory (removed by {@link cleanupTempDirs} after the test file). */
export function tempDir(prefix = 'input-probe-'): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  created.push(dir);
  return dir;
}

/** Removes every directory created by {@link tempDir}. Registered for all test files in `test/setup.ts`. */
export function cleanupTempDirs(): void {
  while (created.length > 0) rmSync(created.pop() as string, { recursive: true, force: true });
}

/** Result of {@link runNode}. */
export interface RunResult {
  status: number | null;
  stdout: string;
  stderr: string;
  /** stdout + stderr without ANSI color codes. */
  all: string;
}

/**
 * Environment with no Tizen-related variables, PATH reduced to Node's own directory (so no real `tizen` /
 * `sdb` can be found) and HOME pointing at an empty directory (so no SDK is auto-detected).
 */
export function isolatedEnv(home: string, extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (/^(TIZEN_|TV_IP$|VITE_)/.test(k)) continue;
    env[k] = v;
  }
  env['PATH'] = dirname(process.execPath);
  env['HOME'] = home;
  env['USERPROFILE'] = home;
  env['NO_COLOR'] = '1';
  return { ...env, ...extra };
}

/** Runs a Node script synchronously. */
export function runNode(script: string, args: string[], opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {}): RunResult {
  const res = spawnSync(process.execPath, [script, ...args], {
    cwd: opts.cwd ?? PROJECT_ROOT,
    env: opts.env ?? process.env,
    encoding: 'utf8',
    timeout: 60_000,
  });
  const stdout = res.stdout ?? '';
  const stderr = res.stderr ?? '';
  return { status: res.status, stdout, stderr, all: (stdout + stderr).replace(/\x1b\[[0-9;]*m/g, '') };
}

/**
 * Copies the project's `scripts/` into a temp "project" so script runs can never touch the real `dist/`.
 *
 * @returns the temp project root.
 */
export function copyScriptsProject(): string {
  const root = tempDir('input-probe-proj-');
  cpSync(join(PROJECT_ROOT, 'scripts'), join(root, 'scripts'), { recursive: true });
  mkdirSync(join(root, 'dist'), { recursive: true });
  return root;
}

/** Writes an executable POSIX shell script. */
export function writeExecutable(path: string, body: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, '#!/bin/sh\n' + body);
  chmodSync(path, 0o755);
}
