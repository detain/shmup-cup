/**
 * v2's R2-01 replay refusal on the **real** recordings v1 shipped (wave 4 A6; owner decision W4-7,
 * acceptance "a v1 replay is refused"): since the flip (frame 640×360, replay format 2) every
 * committed golden replay (`test/golden/*.replay.json`) and attract demo
 * (`content/demos/*.replay.json`, the format sample included) — each recorded by v1 at 384×216,
 * format version 1 — is refused by `decodeReplay` with a {@link ReplayVersionError} whose message
 * names v1.
 *
 * The cases that hold for good are `replay-version.test.ts`'s: the crafted ones (another frame, an
 * older format at either frame) and a run replay as v1.0.0's replay library wrote it (its own
 * fixture `fixtures/run-replay-v1.json`: refused, `Legacy` on a paste, its slot kept). These hold
 * only from R2-01 until R2-03 re-blesses the goldens and re-records the demos: then a recording is
 * no longer v1's and its case fails by design, its message naming R2-03 — delete this file with
 * the stale-goldens gate (`test/golden/stale.ts`, whose docblock points here).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FRAME_H, FRAME_W } from '../../src/config/index.js';
import { REPLAY_FORMAT_VERSION, ReplayVersionError, decodeReplay } from '../../src/replay/index.js';

/** v1's frame: what the header config of every recording v1 made holds. */
const V1_FRAME: readonly [number, number] = [384, 216];

/** v1's replay format version. */
const V1_FORMAT = 1;

/** What R2-03's re-bless does to these cases (a failing one says so). */
const EXPIRED =
  'R2-03 re-blessed this recording: delete replay-version-shipped.test.ts with the gates ' +
  '(test/golden/stale.ts)';

/**
 * Reads every `.replay.json` file of a repository folder.
 *
 * @param folder - The folder, relative to the repository root, with a trailing `/`.
 * @returns `[file, parsed document]` pairs, sorted by file name.
 */
function recordings(folder: string): Array<[string, Record<string, unknown>]> {
  const url = new URL('../../../../' + folder, import.meta.url);
  return readdirSync(url)
    .filter((name) => name.endsWith('.replay.json'))
    .sort()
    .map((name) => [
      folder + name,
      JSON.parse(readFileSync(new URL(name, url), 'utf8')) as Record<string, unknown>,
    ]);
}

/** The shipped golden replays (M1-19). */
const GOLDENS = recordings('test/golden/');

/** The shipped attract demos (M2-15), the format sample `example.replay.json` included. */
const DEMOS = recordings('content/demos/');

/**
 * The error a call throws.
 *
 * @param fn - The call.
 * @returns What it threw.
 */
function thrown(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error('expected a throw');
}

/** The message of a v1 recording's refusal. */
const V1_MESSAGE =
  `replay recorded at ${V1_FRAME[0]}×${V1_FRAME[1]} (v1, format version ${V1_FORMAT}) ` +
  `cannot play at ${FRAME_W}×${FRAME_H}`;

/**
 * Asserts that a refusal is a v1 recording's: a {@link ReplayVersionError} for its older format,
 * with v1's frame, and a message that names v1.
 *
 * @param error - What decoding threw.
 * @param what - The recording (for the failure message).
 */
function expectV1Refusal(error: unknown, what: string): void {
  expect(error, what).toBeInstanceOf(ReplayVersionError);
  const refusal = error as ReplayVersionError;
  expect(refusal.name, what).toBe('ReplayVersionError');
  // The format check comes first: a v1 recording is refused for its version, not its frame.
  expect(refusal.reason, what).toBe('format');
  expect([refusal.recordedWidth, refusal.recordedHeight], what).toEqual(V1_FRAME);
  expect(refusal.message, what).toMatch(/\(v1, format version 1\)/);
  expect(refusal.message, what).toBe(V1_MESSAGE);
}

/**
 * Asserts that a shipped recording is still v1's (until R2-03) and that decoding it is refused as
 * one.
 *
 * @param file - Its path below the repository root.
 * @param doc - Its parsed document.
 */
function expectRefusedAsV1(file: string, doc: Record<string, unknown>): void {
  const header = doc.header as { formatVersion: unknown; config: Record<string, unknown> };
  expect(header.formatVersion, `${file}: ${EXPIRED}`).toBe(V1_FORMAT);
  expect([header.config.internalWidth, header.config.internalHeight], file).toEqual(V1_FRAME);
  expectV1Refusal(
    thrown(() => decodeReplay(doc)),
    file,
  );
}

describe('core/replay the recordings v1 shipped are refused after the flip (R2-01)', () => {
  it('runs a newer replay format than v1`s, and finds v1`s recordings', () => {
    expect(REPLAY_FORMAT_VERSION).toBeGreaterThan(V1_FORMAT);
    expect([FRAME_W, FRAME_H]).not.toEqual(V1_FRAME);
    // 62 golden replays and 10 demos (9 zones + the format sample) at the flip.
    expect(GOLDENS.length).toBeGreaterThan(50);
    expect(DEMOS.map(([file]) => file)).toContain('content/demos/zone-a.replay.json');
    expect(DEMOS.length).toBeGreaterThanOrEqual(10);
  });

  it.each(GOLDENS)('refuses the golden replay %s as v1`s', (file, doc) => {
    expectRefusedAsV1(file, doc);
  });

  it.each(DEMOS)('refuses the attract demo %s as v1`s', (file, doc) => {
    // The content file is the document the attract loop decodes (`DemoSpec.document`).
    expect(doc.kind, file).toBe('replay');
    expectRefusedAsV1(file, doc);
  });
});
