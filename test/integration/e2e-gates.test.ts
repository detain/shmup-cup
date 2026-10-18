/**
 * `test/e2e/gates.ts` (plan_resolution.md R2-01, owner decisions W4-12 and W5-6): the browser
 * tests' skip gate follows the same rule as the Vitest one (`test/golden/stale.ts`), its replay
 * format mirror equals core's, and it expires once nothing is stale. The specs cannot import core,
 * so without this pin a replay-format bump, or a gate that drifted from `goldenIsStale`, would show
 * only in an e2e shard.
 */
import { FRAME_H, FRAME_W, REPLAY_FORMAT_VERSION } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import {
  CONTENT_REASON,
  GOLDEN_REASON,
  R2_03_PENDING,
  REPLAY_FORMAT,
  checkGateExpiry,
  committedRecordings,
  recordingIsStale,
} from '../e2e/gates.js';
import { committedRecordings as goldenRecordings, goldenIsStale } from '../golden/stale.js';

/**
 * A minimal replay document.
 *
 * @param formatVersion - The header's format version.
 * @param width - The config's frame width.
 * @param height - The config's frame height.
 * @returns The document.
 */
function doc(formatVersion: unknown, width: unknown, height: unknown): unknown {
  return { header: { formatVersion, config: { internalWidth: width, internalHeight: height } } };
}

describe('the e2e gate (test/e2e/gates.ts)', () => {
  it('mirrors core/replay REPLAY_FORMAT_VERSION', () => {
    expect(REPLAY_FORMAT).toBe(REPLAY_FORMAT_VERSION);
  });

  it('reads the same recordings as test/golden/stale.ts and judges each one the same', () => {
    const ours = committedRecordings();
    const theirs = goldenRecordings();
    expect(ours.map(([path]) => path)).toEqual(theirs.map(([path]) => path));
    expect(ours.length).toBeGreaterThan(60);
    for (const [path, recording] of ours) {
      expect(recordingIsStale(recording), path).toBe(goldenIsStale(recording));
    }
  });

  it('is pending exactly while a committed recording is stale', () => {
    expect(R2_03_PENDING).toBe(
      goldenRecordings().some(([, recording]) => goldenIsStale(recording)),
    );
  });

  it('calls a recording stale unless it has this build’s format and frame', () => {
    expect(recordingIsStale(doc(REPLAY_FORMAT_VERSION, FRAME_W, FRAME_H))).toBe(false);
    for (const stale of [
      doc(REPLAY_FORMAT_VERSION - 1, FRAME_W, FRAME_H),
      doc(REPLAY_FORMAT_VERSION + 1, FRAME_W, FRAME_H),
      doc(REPLAY_FORMAT_VERSION, FRAME_W + 1, FRAME_H),
      doc(REPLAY_FORMAT_VERSION, FRAME_W, FRAME_H + 1),
      doc(String(REPLAY_FORMAT_VERSION), FRAME_W, FRAME_H),
      { header: { formatVersion: REPLAY_FORMAT_VERSION } },
      { header: null },
      {},
      [],
      null,
      'replay',
    ]) {
      expect(recordingIsStale(stale), JSON.stringify(stale)).toBe(true);
      expect(goldenIsStale(stale), JSON.stringify(stale)).toBe(true);
    }
  });

  it('expires once the frame is not v1’s and nothing is stale', () => {
    const v1Width: number = 384;
    expect(() => checkGateExpiry(v1Width, false)).not.toThrow();
    expect(() => checkGateExpiry(v1Width, true)).not.toThrow();
    expect(() => checkGateExpiry(FRAME_W === v1Width ? 640 : FRAME_W, true)).not.toThrow();
    expect(() => checkGateExpiry(FRAME_W === v1Width ? 640 : FRAME_W, false)).toThrow(
      /R2-03 re-recorded the goldens and demos: .*delete test\/e2e\/gates\.ts/,
    );
  });

  it('names the steps a skip waits for', () => {
    expect(GOLDEN_REASON).toMatch(/^R2-01 gate: .*R2-03/);
    expect(CONTENT_REASON).toMatch(/^R2-01 gate: .*R2-02.*R2-03/);
  });
});
