/**
 * The cross-process mutex of the encode kits' output folders (lane v20x-FIX-VIDEO).
 *
 * Both v20x encode kits (`video-encode.mjs`, `stills-encode.mjs`) are spawned synchronously by
 * the `shmupVideos()` / `shmupStills()` Vite plugins on every build, and a `pnpm test` run
 * starts several builds in parallel workers: on a cold tree the first ones used to encode into
 * `assets/generated/video/` concurrently — one pass `ffprobe`d another's half-written MP4
 * ("moov atom not found"), and a test comparing its dist against `videoShippedFiles()` read a
 * directory another build was still filling. The kits' outputs are deterministic, so one writer
 * is all the pipeline needs; this module makes that writer exclusive across processes.
 *
 * The lock is the `mkdir` atomicity of the local filesystem: exactly one `mkdirSync` of
 * `<outDir>.lock` succeeds, the holder records its pid inside, and waiters poll. A holder that
 * died (its pid answers ESRCH, or its lock directory never gained a pid within the birth grace)
 * is reclaimed, so a killed build never wedges the tree — and a lock held past the wait deadline
 * fails loud naming the holder, rather than racing around it.
 *
 * **Public API:** {@link withEncodeLock}.
 *
 * @module
 */
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** One Int32 slot: `Atomics.wait` sleeps on it — a sync script has no timers. */
const SLEEP_SLOT = new Int32Array(new SharedArrayBuffer(4));

/** How long a waiter sleeps between acquire attempts. */
const POLL_MS = 50;

/** How young a lock without a readable pid may be before it counts as abandoned (the holder
 * writes its pid microseconds after the `mkdir`, so an older child is a killed one). */
const BIRTH_GRACE_MS = 5_000;

/** The default wait deadline — far above one cold full encode of the clip set on a slow host. */
const DEFAULT_TIMEOUT_MS = 20 * 60 * 1000;

/**
 * Runs `work` with exclusive access to one output folder, across processes.
 *
 * @param {string} outDir - The folder the kit writes into (the lock lives beside it).
 * @param {() => void} work - The critical section.
 * @param {{ timeoutMs?: number }} [options] - `timeoutMs` overrides the wait deadline.
 * @returns {void}
 * @throws {Error} When the lock stays held past the deadline (the holder's pid is named), or
 *   when the lock folder belongs to this process but cannot be written.
 *
 * @remarks
 * Re-entrant in one process only if the caller never nests (the kits do not). A reclaimed or
 * expired lock means whatever it was protecting may be partial — the video kit re-verifies its
 * ledger after acquiring, so a late waiter encodes nothing and a wedged writer is loud.
 */
export function withEncodeLock(outDir, work, options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const lockDir = `${outDir}.lock`;
  const pidFile = join(lockDir, 'pid');
  const deadline = Date.now() + timeoutMs;
  while (!acquire(lockDir, pidFile)) {
    if (Date.now() > deadline) {
      throw new Error(
        `the encode lock ${lockDir} is still held after ${timeoutMs} ms ` +
          `(pid ${readPid(pidFile) ?? 'unknown'}) — a build's encode kit died holding it`,
      );
    }
    Atomics.wait(SLEEP_SLOT, 0, 0, POLL_MS);
  }
  try {
    work();
  } finally {
    release(lockDir);
  }
}

/**
 * One acquire attempt: win the `mkdir` and record the pid, or reclaim a dead holder.
 *
 * @param {string} lockDir - The lock folder.
 * @param {string} pidFile - The holder-pid file inside it.
 * @returns {boolean} `true` when this process holds the lock now.
 */
function acquire(lockDir, pidFile) {
  try {
    mkdirSync(lockDir);
  } catch (error) {
    if (/** @type {{ code?: string }} */ (error).code !== 'EEXIST') throw error;
    if (lockIsAbandoned(lockDir, pidFile)) release(lockDir);
    return false;
  }
  try {
    writeFileSync(pidFile, `${process.pid}\n`);
  } catch (error) {
    release(lockDir);
    throw error;
  }
  return true;
}

/**
 * Whether the lock's holder cannot be alive any more.
 *
 * @param {string} lockDir - The lock folder.
 * @param {string} pidFile - The holder-pid file inside it.
 * @returns {boolean} `true` when the folder may be removed and retried.
 */
function lockIsAbandoned(lockDir, pidFile) {
  const pid = readPid(pidFile);
  if (pid === null) {
    try {
      return Date.now() - statSync(lockDir).ctimeMs > BIRTH_GRACE_MS;
    } catch {
      return true; // the folder vanished mid-check — nothing to wait for
    }
  }
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    // EPERM answers for a live process of another user; only ESRCH means the pid is gone.
    return /** @type {{ code?: string }} */ (error).code === 'ESRCH';
  }
}

/**
 * The pid recorded in a lock, parsed.
 *
 * @param {string} pidFile - The holder-pid file.
 * @returns {number | null} The pid, or `null` when unreadable or not a positive integer.
 */
function readPid(pidFile) {
  let text;
  try {
    text = readFileSync(pidFile, 'utf8');
  } catch {
    return null;
  }
  const pid = Number(text.trim());
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

/**
 * Removes a lock folder (ours, or one confirmed abandoned).
 *
 * @param {string} lockDir - The lock folder.
 * @returns {void}
 */
function release(lockDir) {
  rmSync(lockDir, { recursive: true, force: true });
}
