/**
 * The **port allocation-churn gate** of v2's R2-02 (the prepB.FIX3 ruling's option (c)): at the
 * kit's port scale the gimmick allocation guard `test/world/world-gimmicks-alloc.test.ts` is red —
 * a measured 169,160 B over its 65,536 budget (w03-FIX3 report: pipeline-wide codegen churn gated
 * on `StageRunner.probe`'s trigger branch being live every tick at `WORLD_SCALE` 3/2; every src
 * shape tried came back byte-identically red) — while at `WORLD_SCALE` 1 it is green. The churn is
 * a known, measured, unresolved defect that exists **while the shipped goldens are still v1
 * recordings**: R2-03's re-bless re-records the world and re-measures the guard, then deletes this
 * gate and its use.
 *
 * - {@link PORT_ALLOC_CHURN} — whether a committed golden replay (`test/golden/*.replay.json`) or
 *   attract demo (`content/demos/*.replay.json`) is still stale: `true` from R2-01's flip until
 *   R2-03's re-bless. A re-bless run (`pnpm golden:update`, `SHMUP_GOLDEN_UPDATE=1`) is never
 *   gated — that run must re-measure the guard unskipped.
 * - **It expires by itself** ({@link checkPortAllocChurnExpiry}): once the frame is no longer v1's
 *   and no committed recording is stale, importing this module throws — R2-03 deletes this file,
 *   its pin test (`port-alloc-churn.test.ts`) and the guard's use, and the guard must then pass at
 *   both scales. Never inside the re-bless run itself, like `test/golden/stale.ts`.
 * - {@link ALLOC_CHURN_REASON} — what the gated test's name says while it skips.
 * - {@link itPortAllocChurn} — an `it` skipped under the full skip rule.
 *
 * The gate alone is HALF the rule: the churn appears at the port scale only, so the skip is
 * `(WORLD_SCALE !== 1) && PORT_ALLOC_CHURN` — at `WORLD_SCALE` 1 (CI on master) nothing skips and
 * the guard runs fully. Unlike {@link itPortAllocChurn}'s twins in `port-pending.ts` and
 * `stale.ts`, it therefore appends the reason to the test's name **only while it skips**: a
 * running test must not carry a "skipped while …" name.
 *
 * The recording read mirrors `test/golden/stale.ts` on purpose, re-done here rather than imported:
 * a core test must not load a second `@shmup/core` instance through the package name (the
 * `v1-port.ts` rule). The wave's other gates are `port-pending.ts` (until R2-02) and
 * `test/golden/stale.ts` / `test/e2e/gates.ts` (until R2-03).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { it } from 'vitest';
import { FRAME_H, FRAME_W, WORLD_SCALE } from '../../src/config/index.js';
import { REPLAY_FORMAT_VERSION } from '../../src/replay/format.js';

/**
 * The v1 frame's width (the code ran at it until R2-01's flip). Typed `number`, not `384`: after
 * the flip `FRAME_W` is the literal type `640`, and comparing two literal types that never overlap
 * fails the typecheck (TS2367).
 */
const V1_FRAME_W: number = 384;

/** The variable `pnpm golden:update` sets (`golden.ts` `GOLDEN_UPDATE_ENV`). */
const UPDATE_ENV = 'SHMUP_GOLDEN_UPDATE';

/** The folders of the committed recordings (the same two `test/golden/stale.ts` reads). */
const FOLDERS: readonly string[] = [
  fileURLToPath(new URL('../../../../test/golden/', import.meta.url)),
  fileURLToPath(new URL('../../../../content/demos/', import.meta.url)),
];

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
 * Whether a recording is stale: its header is another format version than this build's, or its
 * config records another frame (the rule of `test/golden/stale.ts` `goldenIsStale`).
 *
 * @param doc - A parsed `.replay.json` document (a golden file or a demo).
 * @returns `true` when this build would refuse it.
 */
function goldenIsStale(doc: unknown): boolean {
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
 * Whether any committed golden replay or attract demo is still a v1 recording — the churn's
 * known-unresolved window, read exactly like `test/golden/stale.ts` reads its condition.
 *
 * @returns `true` when a committed `.replay.json` in `test/golden/` or `content/demos/` is stale.
 */
export function committedGoldensStale(): boolean {
  for (const folder of FOLDERS) {
    for (const name of readdirSync(folder).sort()) {
      if (!name.endsWith('.replay.json')) continue;
      if (goldenIsStale(JSON.parse(readFileSync(join(folder, name), 'utf8')) as unknown)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * The gate's self-expiry, run when this module is imported: throws once the frame is no longer
 * v1's and no committed recording is stale — R2-03 re-blessed them and the guard must be re-measured
 * and the gate deleted — except in the re-bless run itself (`SHMUP_GOLDEN_UPDATE=1`), whose files
 * may import the module after every recording was rewritten.
 *
 * @param frameW - The build's frame width (`FRAME_W`).
 * @param anyStale - Whether a committed recording is stale ({@link committedGoldensStale}).
 * @param env - The environment (`process.env`): `SHMUP_GOLDEN_UPDATE` `'1'` marks the re-bless.
 * @throws {Error} `R2-03 re-blessed: delete the port alloc-churn gate …` when the gate has expired.
 */
export function checkPortAllocChurnExpiry(
  frameW: number,
  anyStale: boolean,
  env: Readonly<Record<string, string | undefined>>,
): void {
  if (frameW !== V1_FRAME_W && !anyStale && env[UPDATE_ENV] !== '1') {
    throw new Error('R2-03 re-blessed: delete the port alloc-churn gate (port-alloc-churn.ts)');
  }
}

/** Whether a committed golden or demo is still stale ({@link committedGoldensStale}). */
const ANY_STALE: boolean = committedGoldensStale();

checkPortAllocChurnExpiry(FRAME_W, ANY_STALE, process.env);

/**
 * Whether the port-scale churn window is open: a committed recording is still v1's and this is not
 * a re-bless run (`pnpm golden:update` re-records them — R2-03, which also re-measures the guard).
 * A gated test skips only under this **and** a ported world (`WORLD_SCALE !== 1`): at `WORLD_SCALE`
 * 1 nothing skips and the guard runs fully in CI.
 */
export const PORT_ALLOC_CHURN: boolean = ANY_STALE && process.env[UPDATE_ENV] !== '1';

/** What a gated test's name says while it skips (`… [R2-02 gate: …]`). */
export const ALLOC_CHURN_REASON =
  'R2-02 gate: prepB.FIX3 port-scale trigger-probe alloc churn, skipped until R2-03 re-measures';

/**
 * Whether {@link itPortAllocChurn} skips right now: the churn exists at the port scale only, while
 * the goldens are still v1's ({@link PORT_ALLOC_CHURN}).
 */
export const PORT_ALLOC_CHURN_SKIPS: boolean = WORLD_SCALE !== 1 && PORT_ALLOC_CHURN;

/**
 * An `it` skipped while the port-scale churn window is open ({@link PORT_ALLOC_CHURN_SKIPS}), the
 * reason appended to its name while it skips ({@link ALLOC_CHURN_REASON}) and absent while it runs.
 *
 * @param name - The test's name.
 * @param fn - The test.
 * @param timeout - Its timeout in milliseconds (default the project's).
 */
export function itPortAllocChurn(
  name: string,
  fn: () => void | Promise<void>,
  timeout?: number,
): void {
  const title = PORT_ALLOC_CHURN_SKIPS ? `${name} [${ALLOC_CHURN_REASON}]` : name;
  it.skipIf(PORT_ALLOC_CHURN_SKIPS)(title, fn, timeout);
}
