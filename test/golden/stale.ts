/**
 * The **stale-goldens gate** of v2's R2-01 (owner decision W4-1): from R2-01's flip of the frame
 * (and of the replay format versions) until R2-03 re-blesses them, every committed golden replay
 * (`test/golden/*.replay.json`) and attract demo (`content/demos/*.replay.json`) was recorded by
 * v1 — at 384×216, format version 1 — so `core/replay` refuses it (`ReplayVersionError`). The tests
 * that play them skip loudly, the reason in their name, instead of turning master CI red.
 *
 * - {@link goldenIsStale} — whether one recording's header is another format version than
 *   `REPLAY_FORMAT_VERSION` or records another frame than `FRAME_W` × `FRAME_H`.
 * - {@link GOLDENS_STALE} — whether any committed golden or demo is: `false` at 384×216 (every
 *   gate off), `true` from the flip until R2-03. A re-bless run (`pnpm golden:update`, which sets
 *   `SHMUP_GOLDEN_UPDATE=1`) is never skipped: it is how R2-03 re-records them.
 * - **It expires by itself:** once the frame is no longer v1's and nothing is stale, importing this
 *   module throws `R2-03 re-blessed: delete the gate` — R2-03 deletes this file and every gate
 *   ({@link checkStaleGateExpiry}). Never inside the re-bless run itself: each of its files imports
 *   this module in its own worker, so one that starts after the recordings were rewritten would
 *   fail a re-bless that worked; the next normal run throws.
 * - **Its inverse** — the cases asserting that the committed recordings are still v1's and
 *   refused — is `packages/core/test/replay/replay-version-shipped.test.ts`, which reads them
 *   itself and does not import this module: R2-03 deletes it with this file.
 * - {@link describeGoldensStale} / {@link itGoldensStale} — `describe.skipIf` / `it.skipIf` on it,
 *   with {@link GOLDENS_STALE_REASON} appended to the name.
 *
 * Light on purpose (`node:fs` and three `@shmup/core` constants): the shell's determinism tests and
 * the browser specs' Node side import it by relative path. `golden.ts` re-exports it. The content
 * twin of this gate is `packages/core/test/helpers/port-pending.ts` (until R2-02).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FRAME_H, FRAME_W, REPLAY_FORMAT_VERSION } from '@shmup/core';
import { describe, it } from 'vitest';

/**
 * The v1 frame's width (the code runs at it until R2-01's flip). Typed `number`, not `384`: after
 * the flip `FRAME_W` is the literal type `640`, and comparing two literal types that never overlap
 * fails the typecheck (TS2367).
 */
const V1_FRAME_W: number = 384;

/** The variable `pnpm golden:update` sets (`golden.ts` `GOLDEN_UPDATE_ENV`). */
const UPDATE_ENV = 'SHMUP_GOLDEN_UPDATE';

/** The folders of the committed recordings. */
const FOLDERS: readonly string[] = [
  fileURLToPath(new URL('./', import.meta.url)),
  fileURLToPath(new URL('../../content/demos/', import.meta.url)),
];

/**
 * Whether a recording is stale: its header is another format version than this build's, or its
 * config records another frame.
 *
 * @param doc - A parsed `.replay.json` document (a golden file or a demo; anything).
 * @returns `true` when this build would refuse it.
 */
export function goldenIsStale(doc: unknown): boolean {
  const header = isRecord(doc) && isRecord(doc.header) ? doc.header : null;
  const config = header !== null && isRecord(header.config) ? header.config : null;
  return (
    header === null ||
    config === null ||
    header.formatVersion !== REPLAY_FORMAT_VERSION ||
    config.internalWidth !== FRAME_W ||
    config.internalHeight !== FRAME_H
  );
}

/**
 * Whether a value is a plain (non-array, non-null) object.
 *
 * @param value - Anything.
 * @returns `true` for an object whose fields can be read.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The committed recordings, by path — the format sample `content/demos/example.replay.json`
 * included (`pnpm golden:update` re-records it with the demos).
 *
 * @returns `[path, document]` pairs.
 */
export function committedRecordings(): Array<readonly [string, unknown]> {
  const out: Array<readonly [string, unknown]> = [];
  for (const folder of FOLDERS) {
    for (const name of readdirSync(folder).sort()) {
      if (!name.endsWith('.replay.json')) continue;
      const path = join(folder, name);
      out.push([path, JSON.parse(readFileSync(path, 'utf8')) as unknown]);
    }
  }
  return out;
}

/** Whether any committed golden replay or demo is stale ({@link goldenIsStale}). */
const ANY_STALE: boolean = committedRecordings().some(([, doc]) => goldenIsStale(doc));

/**
 * The gate's self-expiry, run when this module is imported: throws once the frame is no longer
 * v1's and no committed recording is stale — R2-03 re-blessed them, so the gate must go — except
 * in the re-bless run itself (`SHMUP_GOLDEN_UPDATE=1`), whose files may import this module after
 * `golden.test.ts` / `demos.test.ts` rewrote every recording.
 *
 * @param frameW - The build's frame width (`FRAME_W`).
 * @param anyStale - Whether a committed recording is stale.
 * @param env - The environment (`process.env`): `SHMUP_GOLDEN_UPDATE` `'1'` marks the re-bless.
 * @throws {Error} `R2-03 re-blessed: delete the gate …` when the gate has expired.
 */
export function checkStaleGateExpiry(
  frameW: number,
  anyStale: boolean,
  env: Readonly<Record<string, string | undefined>>,
): void {
  if (frameW !== V1_FRAME_W && !anyStale && env[UPDATE_ENV] !== '1') {
    throw new Error('R2-03 re-blessed: delete the gate (test/golden/stale.ts and its uses)');
  }
}

checkStaleGateExpiry(FRAME_W, ANY_STALE, process.env);

/**
 * Whether the golden-replay tests skip: a committed recording is stale and this is not a re-bless
 * run (`pnpm golden:update` re-records them — R2-03).
 */
export const GOLDENS_STALE: boolean = ANY_STALE && process.env[UPDATE_ENV] !== '1';

/** What a gated test's name says. */
export const GOLDENS_STALE_REASON = 'R2-01 gate: skipped while the goldens are stale, until R2-03';

/**
 * A `describe` skipped while the goldens are stale ({@link GOLDENS_STALE}).
 *
 * @param name - The suite's name (the reason is appended).
 * @param fn - The suite.
 */
export function describeGoldensStale(name: string, fn: () => void): void {
  describe.skipIf(GOLDENS_STALE)(`${name} [${GOLDENS_STALE_REASON}]`, fn);
}

/**
 * An `it` skipped while the goldens are stale ({@link GOLDENS_STALE}).
 *
 * @param name - The test's name (the reason is appended).
 * @param fn - The test.
 * @param timeout - Its timeout in milliseconds (default the project's).
 */
export function itGoldensStale(
  name: string,
  fn: () => void | Promise<void>,
  timeout?: number,
): void {
  it.skipIf(GOLDENS_STALE)(`${name} [${GOLDENS_STALE_REASON}]`, fn, timeout);
}
