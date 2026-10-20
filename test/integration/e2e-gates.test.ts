/**
 * `test/e2e/gates.ts` (plan_resolution.md R2-01, owner decisions W4-12 and W5-6): the browser
 * tests' skip gates follow the same rules as the Vitest ones — `R2_03_PENDING` the stale goldens'
 * (`test/golden/stale.ts`), and `PORT_UNMEASURED` adds the content port's — their replay format
 * mirror equals core's, and they expire once nothing is stale. The specs cannot import core, so
 * without this pin a replay-format bump, or a gate that drifted from `goldenIsStale` or from the
 * shipped tilesets, would show only in an e2e shard.
 *
 * Since R2-02's port this file reads the content signal itself, straight from
 * `content/tilesets/`; the state table (`resolveGates`) stays until R2-03 deletes the gates.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FRAME_H, FRAME_W, REPLAY_FORMAT_VERSION } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { TILE_SIZE } from '../../scripts/frame.mjs';
import {
  CONTENT_REASON,
  GOLDEN_REASON,
  PORT_REASON,
  PORT_UNMEASURED,
  R2_03_PENDING,
  REPLAY_FORMAT,
  assertionsGated,
  checkGateExpiry,
  committedRecordings,
  contentPorted,
  recordingIsStale,
  resolveGates,
  type GateNotes,
} from '../e2e/gates.js';
import { committedRecordings as goldenRecordings, goldenIsStale } from '../golden/stale.js';

/** The v1 frame's width (typed `number`: `FRAME_W` is a literal type that never equals it). */
const V1_FRAME_W: number = 384;

/** A flipped frame width: the build's when it is not v1's, else v2's 640. */
const FLIPPED_W: number = FRAME_W === V1_FRAME_W ? 640 : FRAME_W;

/** The repository's `content/tilesets/` folder (the content-port signal). */
const TILESETS = fileURLToPath(new URL('../../content/tilesets/', import.meta.url));

/**
 * Whether the shipped content is ported, read straight from the files: every shipped tileset
 * (`content/tilesets/*.tileset.json`, the format example included) is at `scripts/frame.mjs`'s
 * `TILE_SIZE` — the same rule `gates.ts` `contentPorted()` states, re-read here as its pin.
 *
 * @returns `true` when no tileset is left at another tile size.
 */
function tilesetsPorted(): boolean {
  return readdirSync(TILESETS)
    .filter((name) => name.endsWith('.tileset.json'))
    .every((name) => {
      const data = JSON.parse(readFileSync(join(TILESETS, name), 'utf8')) as { tileSize?: unknown };
      return data.tileSize === TILE_SIZE;
    });
}

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
    expect(() => checkGateExpiry(V1_FRAME_W, false)).not.toThrow();
    expect(() => checkGateExpiry(V1_FRAME_W, true)).not.toThrow();
    expect(() => checkGateExpiry(FLIPPED_W, true)).not.toThrow();
    expect(() => checkGateExpiry(FLIPPED_W, false)).toThrow(
      /R2-03 re-recorded the goldens and demos: .*delete test\/e2e\/gates\.ts/,
    );
  });

  it('reads the content port from the shipped tilesets, the same rule', () => {
    expect(contentPorted()).toBe(tilesetsPorted());
    // R2-02 ported the content, so the signal is on: the port gate reads ported, not pending.
    expect(tilesetsPorted()).toBe(true);
  });

  it('holds the port gate only while the content is ported and a recording is stale', () => {
    expect(PORT_UNMEASURED).toBe(R2_03_PENDING && contentPorted());
    expect(resolveGates(FRAME_W, contentPorted(), R2_03_PENDING)).toEqual({
      r203Pending: R2_03_PENDING,
      portUnmeasured: PORT_UNMEASURED,
    });
  });

  it('resolves the three states from R2-01 to R2-03, and v1’s frame', () => {
    // R2-01's flip until R2-02: the v1 content (8-px tiles), the v1 recordings. The specs that
    // pass on the v1 content run.
    expect(resolveGates(FLIPPED_W, false, true)).toEqual({
      r203Pending: true,
      portUnmeasured: false,
    });
    // R2-02's port until R2-03: the content ported, the recordings still v1's. Both gates hold.
    expect(resolveGates(FLIPPED_W, true, true)).toEqual({
      r203Pending: true,
      portUnmeasured: true,
    });
    // R2-03 re-recorded: both gates expire, whatever the content.
    for (const ported of [true, false]) {
      expect(() => resolveGates(FLIPPED_W, ported, false)).toThrow(
        /R2-03 re-recorded the goldens and demos/,
      );
    }
    // v1's 384×216 (before the flip, and `v1.x`): nothing stale, both gates off.
    expect(resolveGates(V1_FRAME_W, true, false)).toEqual({
      r203Pending: false,
      portUnmeasured: false,
    });
  });

  it('notes the assertions an assertion-level gate holds back, and only then', () => {
    const info: GateNotes = { annotations: [] };
    expect(assertionsGated(info, false, 'the hull', CONTENT_REASON)).toBe(false);
    expect(info.annotations).toEqual([]);
    expect(assertionsGated(info, true, 'the hull', CONTENT_REASON)).toBe(true);
    expect(info.annotations).toEqual([
      { type: 'skip', description: `the hull: ${CONTENT_REASON}` },
    ]);
  });

  it('names the steps a skip waits for', () => {
    expect(GOLDEN_REASON).toMatch(/^R2-01 gate: .*R2-03/);
    expect(CONTENT_REASON).toMatch(/^R2-01 gate: .*R2-02.*R2-03/);
    expect(PORT_REASON).toMatch(/^R2-01 gate: .*R2-02.*R2-03/);
  });
});
