/**
 * The browser tests' gate of v2's R2-01 (owner decisions W4-12 and W5-6): from R2-01's flip of the
 * frame until R2-03, some specs cannot pass, and they skip with a reason instead of turning the e2e
 * shards red.
 *
 * - **Golden-based specs** play the committed golden replays (`test/golden/*.replay.json`) or
 *   attract demos (`content/demos/*.replay.json`). Those are v1 recordings: 384×216, replay format
 *   1. The build refuses them (`ReplayVersionError`) and the attract loop skips them (W4-9). They
 *   skip with {@link GOLDEN_REASON}; `determinism.spec.ts` skips each stale file on its own
 *   ({@link recordingIsStale}).
 * - **Content-bound specs** sample rows, columns, areas or timings of the shipped content, or play
 *   a shipped zone. That content is v1-scale until R2-02 ports it ×1.5, and R2-03 re-measures the
 *   specs against the ported content. They skip with {@link CONTENT_REASON}.
 *
 * Both kinds skip while {@link R2_03_PENDING}: a committed recording is still stale. The condition
 * is the twin of `test/golden/stale.ts` (`goldenIsStale`, the Vitest gate of the same recordings),
 * not of the content-port gate (`packages/core/test/helpers/port-pending.ts`). That one clears at
 * R2-02, before R2-03 has re-measured these specs (W5-6). This one clears when R2-03 re-blesses
 * the goldens and re-records the demos (`pnpm golden:update`).
 *
 * **It expires by itself.** Once the frame is no longer v1's and no committed recording is stale,
 * importing this module throws ({@link checkGateExpiry}). Every gated spec and
 * `test/integration/e2e-gates.test.ts` then fail loudly until R2-03 deletes this file and every
 * use of it.
 *
 * The specs cannot import `@shmup/core` (see `frame-pixels.ts`), so the gate reads the frame from
 * `scripts/frame.mjs` and the replay format from {@link REPLAY_FORMAT}, a pinned mirror of core's
 * `REPLAY_FORMAT_VERSION` (like `save-format.ts`). `test/integration/e2e-gates.test.ts` pins both
 * the mirror and the predicate to core and to `stale.ts`.
 *
 * @example
 * ```ts
 * import { CONTENT_REASON, R2_03_PENDING } from './gates.js';
 * test('the lava lake rises into view', async ({ page }) => {
 *   test.skip(R2_03_PENDING, CONTENT_REASON);
 *   // …
 * });
 * ```
 *
 * @module
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FRAME_H, FRAME_W } from '../../scripts/frame.mjs';

/**
 * The replay format this build records and plays (`core/replay` `REPLAY_FORMAT_VERSION`: 2 since
 * v2's R2-01). A pinned mirror: `test/integration/e2e-gates.test.ts` fails when core moves alone.
 */
export const REPLAY_FORMAT = 2;

/**
 * The v1 frame's width, which every committed recording held before R2-01's flip. Typed `number`
 * so the comparison with the mirror's `FRAME_W` stays valid whatever the frame is.
 */
const V1_FRAME_W: number = 384;

/** The folders of the committed recordings: the golden replays and the attract demos. */
const FOLDERS: readonly string[] = [
  fileURLToPath(new URL('../golden/', import.meta.url)),
  fileURLToPath(new URL('../../content/demos/', import.meta.url)),
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
 * Whether a recording is stale: its header has another replay format than this build's, or its
 * config records another frame. The same rule as `test/golden/stale.ts` `goldenIsStale`.
 *
 * @param doc - A parsed `.replay.json` document (a golden file, a demo or anything else).
 * @returns `true` when this build would refuse it.
 */
export function recordingIsStale(doc: unknown): boolean {
  const header = isRecord(doc) && isRecord(doc.header) ? doc.header : null;
  const config = header !== null && isRecord(header.config) ? header.config : null;
  return (
    header === null ||
    config === null ||
    header.formatVersion !== REPLAY_FORMAT ||
    config.internalWidth !== FRAME_W ||
    config.internalHeight !== FRAME_H
  );
}

/**
 * The committed recordings, by path: the golden replays and the attract demos, the demos' format
 * sample `content/demos/example.replay.json` included (`pnpm golden:update` re-records it too).
 *
 * @returns `[path, document]` pairs, sorted by path within each folder.
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

/**
 * Whether R2-03 is still pending: a committed golden replay or demo is stale
 * ({@link recordingIsStale}). It is `false` at 384×216 and `true` from R2-01's flip until R2-03
 * re-records them. Every content-bound and golden-based spec skips while it holds.
 */
export const R2_03_PENDING: boolean = committedRecordings().some(([, doc]) =>
  recordingIsStale(doc),
);

/**
 * The gate's self-expiry, run when this module is imported: throws once the frame is no longer
 * v1's and no committed recording is stale. R2-03 re-blessed them, so the gate and its skips must go.
 *
 * @param frameW - The build's frame width (`FRAME_W`).
 * @param pending - Whether a committed recording is stale ({@link R2_03_PENDING}).
 * @throws {Error} `R2-03 re-recorded the goldens and demos: …` when the gate has expired.
 */
export function checkGateExpiry(frameW: number, pending: boolean): void {
  if (frameW !== V1_FRAME_W && !pending) {
    throw new Error(
      'R2-03 re-recorded the goldens and demos: re-measure the gated specs, then delete ' +
        'test/e2e/gates.ts and every skip on it',
    );
  }
}

checkGateExpiry(FRAME_W, R2_03_PENDING);

/** Why a golden-based test skips: the build refuses the v1 recordings it plays. */
export const GOLDEN_REASON =
  'R2-01 gate: the golden replays and demos are v1 recordings (384×216, format 1) the build ' +
  'refuses, until R2-03 re-records them';

/** Why a content-bound test skips: it measures shipped content that R2-02 ports and R2-03 re-measures. */
export const CONTENT_REASON =
  'R2-01 gate: samples or plays v1-scale shipped content; R2-02 ports it ×1.5 and R2-03 ' +
  're-measures this test';
